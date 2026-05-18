use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

use crate::jobs::{new_job_store, Job, JobStore, ProgressEvent};

pub struct AppState {
    pub app_handle: AppHandle,
    pub jobs: JobStore,
    pub resource_dir: PathBuf,
}

pub async fn start(app_handle: AppHandle) {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let state = Arc::new(AppState {
        app_handle,
        jobs: new_job_store(),
        resource_dir,
    });

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .allow_origin(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/pick-files", post(pick_files))
        .route("/process", post(process))
        .route("/render-overlay", post(render_overlay))
        .route("/progress/:job_id", get(progress_sse))
        .route("/cancel/:job_id", post(cancel))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:7842").await.unwrap();
    info!("Helper HTTP server running on http://127.0.0.1:7842");
    axum::serve(listener, app).await.unwrap();
}

// GET /health
async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "version": "0.1.0" }))
}

// POST /pick-files
#[derive(Deserialize)]
struct PickFilesReq {}

#[derive(Serialize)]
struct PickFilesRes {
    files: Vec<PickedFile>,
}

#[derive(Serialize)]
struct PickedFile {
    name: String,
    path: String,
}

async fn pick_files(
    State(state): State<Arc<AppState>>,
    Json(_): Json<PickFilesReq>,
) -> impl IntoResponse {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<PickedFile>>();

    state.app_handle.dialog()
        .file()
        .add_filter("Vídeos", &["mp4", "mov", "avi", "mkv", "mts", "m2ts"])
        .pick_files(move |paths| {
            let picked: Vec<PickedFile> = paths
                .unwrap_or_default()
                .into_iter()
                .map(|p| {
                    let path_str = p.to_string_lossy().to_string();
                    let name = p.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| path_str.clone());
                    PickedFile { name, path: path_str }
                })
                .collect();
            let _ = tx.send(picked);
        });

    match rx.await {
        Ok(files) => (StatusCode::OK, Json(PickFilesRes { files })).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(PickFilesRes { files: vec![] })).into_response(),
    }
}

// POST /process
#[derive(Deserialize)]
pub struct ProcessReq {
    pub job_id: String,
    pub video_paths: Vec<String>,
    pub cf_worker_url: String,
    pub cf_worker_secret: String,
    pub video_key: String,
    pub appwrite_endpoint: String,
    pub appwrite_project_id: String,
    pub appwrite_db_id: String,
    pub videos_col_id: String,
    pub session_jwt: String,
    pub flight_video_doc_id: String,
}

async fn process(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProcessReq>,
) -> impl IntoResponse {
    let (progress_tx, _) = broadcast::channel::<ProgressEvent>(64);
    let (cancel_tx, _) = broadcast::channel::<()>(4);

    let job = Job {
        tx: progress_tx.clone(),
        cancel_tx: cancel_tx.clone(),
    };

    state.jobs.write().await.insert(req.job_id.clone(), job);

    let resource_dir = state.resource_dir.clone();

    tokio::spawn(async move {
        crate::pipeline::run(
            req,
            resource_dir,
            progress_tx,
            cancel_tx,
        ).await;
    });

    (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
}

// GET /progress/:job_id (SSE)
async fn progress_sse(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    let rx = {
        let jobs = state.jobs.read().await;
        jobs.get(&job_id).map(|j| j.tx.subscribe())
    };

    match rx {
        None => {
            // Job não encontrado — enviar erro e fechar
            let stream = futures::stream::once(async {
                let evt = serde_json::json!({ "stage": "error", "percent": 0, "message": "Job não encontrado" });
                Ok::<Event, Infallible>(Event::default().data(evt.to_string()))
            });
            Sse::new(stream).with_keep_alive(KeepAlive::default()).into_response()
        }
        Some(rx) => {
            let stream = BroadcastStream::new(rx)
                .filter_map(|result| {
                    result.ok().map(|evt| {
                        let data = serde_json::to_string(&evt).unwrap_or_default();
                        Ok::<Event, Infallible>(Event::default().data(data))
                    })
                });
            Sse::new(stream).with_keep_alive(KeepAlive::default()).into_response()
        }
    }
}

// POST /render-overlay
async fn render_overlay(
    State(state): State<Arc<AppState>>,
    Json(req): Json<crate::overlay::RenderOverlayReq>,
) -> impl IntoResponse {
    match crate::overlay::run(req, state.resource_dir.clone()).await {
        Ok(res) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "fileUrl": res.file_url,
                "fileSize": res.file_size,
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

// POST /cancel/:job_id
async fn cancel(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    let jobs = state.jobs.read().await;
    if let Some(job) = jobs.get(&job_id) {
        let _ = job.cancel_tx.send(());
    }
    Json(serde_json::json!({ "ok": true }))
}
