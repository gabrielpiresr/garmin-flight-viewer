use std::path::{Path, PathBuf};
use tokio::sync::broadcast;
use tracing::{error, info};

use crate::ffmpeg;
use crate::jobs::ProgressEvent;
use crate::server::ProcessReq;

const CHUNK_SIZE: usize = 50 * 1024 * 1024; // 50 MB por parte

pub async fn run(
    req: ProcessReq,
    resource_dir: PathBuf,
    progress_tx: broadcast::Sender<ProgressEvent>,
    cancel_tx: broadcast::Sender<()>,
) {
    let mut cancel_rx = cancel_tx.subscribe();

    macro_rules! send {
        ($stage:expr, $pct:expr) => {
            let _ = progress_tx.send(ProgressEvent {
                stage: $stage.to_string(),
                percent: $pct,
                message: None,
                file_url: None,
                file_size: None,
                duration_sec: None,
            });
        };
    }

    macro_rules! fail {
        ($msg:expr) => {{
            error!("{}", $msg);
            let _ = progress_tx.send(ProgressEvent {
                stage: "error".to_string(),
                percent: 0,
                message: Some($msg.to_string()),
                file_url: None,
                file_size: None,
                duration_sec: None,
            });
            return;
        }};
    }

    // Verificar FFmpeg
    let ffmpeg_path = match ffmpeg::find_ffmpeg(&resource_dir) {
        Some(p) => p,
        None => fail!("FFmpeg não encontrado. Coloque ffmpeg.exe na pasta do app ou instale no PATH."),
    };
    let ffprobe_path = ffmpeg::find_ffprobe(&resource_dir)
        .unwrap_or_else(|| PathBuf::from("ffprobe"));

    // Validar arquivos de entrada
    let video_files: Vec<PathBuf> = req.video_paths.iter().map(PathBuf::from).collect();
    for f in &video_files {
        if !f.exists() {
            fail!(format!("Arquivo não encontrado: {}", f.display()));
        }
    }

    // Diretório temporário
    let tmp_dir = std::env::temp_dir().join(format!("flight-video-{}", &req.job_id[..8]));
    if let Err(e) = std::fs::create_dir_all(&tmp_dir) {
        fail!(format!("Erro ao criar diretório temporário: {e}"));
    }

    let joined_path = tmp_dir.join("joined.mp4");
    let watermarked_path = tmp_dir.join("watermarked.mp4");
    let final_path = tmp_dir.join("final.mp4");

    // Duração total
    send!("concat", 0);
    let total_duration = ffmpeg::get_total_duration(&ffprobe_path, &video_files).await;

    // --- Stage 1: Concat ---
    info!("Stage 1: concat {} arquivos", video_files.len());
    let tx1 = progress_tx.clone();
    let result = ffmpeg::concat_videos(
        &ffmpeg_path,
        &ffprobe_path,
        &video_files,
        &joined_path,
        total_duration,
        move |pct| {
            let _ = tx1.send(ProgressEvent {
                stage: "concat".to_string(),
                percent: pct,
                message: None,
                file_url: None,
                file_size: None,
                duration_sec: None,
            });
        },
    ).await;

    if let Err(e) = result {
        fail!(format!("Erro na concatenação: {e}"));
    }

    if cancel_rx.try_recv().is_ok() {
        cleanup(&tmp_dir);
        fail!("Cancelado pelo usuário");
    }

    // --- Stage 2: Watermark ---
    let watermark_path = resource_dir.join("watermark.png");
    let input_for_compress = if watermark_path.exists() {
        info!("Stage 2: watermark");
        send!("watermark", 0);

        let tx2 = progress_tx.clone();
        let result = ffmpeg::apply_watermark(
            &ffmpeg_path,
            &joined_path,
            &watermark_path,
            &watermarked_path,
            total_duration,
            move |pct| {
                let _ = tx2.send(ProgressEvent {
                    stage: "watermark".to_string(),
                    percent: pct,
                    message: None,
                    file_url: None,
                    file_size: None,
                    duration_sec: None,
                });
            },
        ).await;

        if let Err(e) = result {
            fail!(format!("Erro no watermark: {e}"));
        }

        if cancel_rx.try_recv().is_ok() {
            cleanup(&tmp_dir);
            fail!("Cancelado pelo usuário");
        }

        watermarked_path.clone()
    } else {
        info!("Sem watermark.png — pulando stage 2");
        joined_path.clone()
    };

    // --- Stage 3: Compress ---
    info!("Stage 3: compress");
    send!("compress", 0);

    let tx3 = progress_tx.clone();
    let result = ffmpeg::compress_video(
        &ffmpeg_path,
        &input_for_compress,
        &final_path,
        total_duration,
        move |pct| {
            let _ = tx3.send(ProgressEvent {
                stage: "compress".to_string(),
                percent: pct,
                message: None,
                file_url: None,
                file_size: None,
                duration_sec: None,
            });
        },
    ).await;

    if let Err(e) = result {
        fail!(format!("Erro na compressão: {e}"));
    }

    if cancel_rx.try_recv().is_ok() {
        cleanup(&tmp_dir);
        fail!("Cancelado pelo usuário");
    }

    // --- Stage 4: Upload multipart para R2 via Worker ---
    info!("Stage 4: upload multipart para R2");
    send!("upload", 0);

    let file_bytes = match std::fs::read(&final_path) {
        Ok(b) => b,
        Err(e) => fail!(format!("Erro ao ler final.mp4: {e}")),
    };
    let file_size = file_bytes.len() as u64;

    let upload_result = upload_multipart(
        &req.cf_worker_url,
        &req.cf_worker_secret,
        &req.video_key,
        &file_bytes,
        progress_tx.clone(),
    ).await;

    let file_url = match upload_result {
        Ok(url) => url,
        Err(e) => {
            cleanup(&tmp_dir);
            fail!(format!("Erro no upload: {e}"));
        }
    };

    // Duração do final.mp4
    let final_duration = ffmpeg::probe_duration(&ffprobe_path, &final_path)
        .await
        .unwrap_or(total_duration);

    // Atualizar Appwrite
    send!("upload", 95);
    if let Err(e) = update_appwrite_doc(
        &req.appwrite_endpoint,
        &req.appwrite_project_id,
        &req.appwrite_db_id,
        &req.videos_col_id,
        &req.flight_video_doc_id,
        &req.session_jwt,
        &file_url,
        file_size,
        final_duration,
    ).await {
        error!("Aviso: falha ao atualizar Appwrite: {e}");
    }

    cleanup(&tmp_dir);

    let _ = progress_tx.send(ProgressEvent {
        stage: "done".to_string(),
        percent: 100,
        message: None,
        file_url: Some(file_url),
        file_size: Some(file_size),
        duration_sec: Some(final_duration),
    });
    info!("Pipeline concluído para job {}", req.job_id);
}

async fn upload_multipart(
    worker_url: &str,
    secret: &str,
    key: &str,
    data: &[u8],
    progress_tx: broadcast::Sender<ProgressEvent>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    // 1. Iniciar upload
    let init_res = client
        .post(format!("{worker_url}/upload/initiate"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "key": key, "secret": secret }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !init_res.status().is_success() {
        return Err(format!("Initiate falhou: {}", init_res.status()));
    }

    let init_body: serde_json::Value = init_res.json().await.map_err(|e| e.to_string())?;
    let upload_id = init_body["uploadId"].as_str().ok_or("uploadId ausente")?.to_string();
    let upload_key = init_body["key"].as_str().ok_or("key ausente")?.to_string();

    // 2. Enviar partes
    let total_bytes = data.len();
    let total_parts = (total_bytes + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let mut parts: Vec<serde_json::Value> = Vec::new();

    for (i, chunk) in data.chunks(CHUNK_SIZE).enumerate() {
        let part_number = i + 1;
        let chunk_bytes = chunk.to_vec();

        let part_res = client
            .put(format!("{worker_url}/upload/part"))
            .header("x-upload-id", &upload_id)
            .header("x-upload-key", &upload_key)
            .header("x-part-number", part_number.to_string())
            .header("x-secret", secret)
            .header("Content-Type", "application/octet-stream")
            .body(chunk_bytes)
            .send()
            .await
            .map_err(|e| format!("Parte {part_number} falhou: {e}"))?;

        if !part_res.status().is_success() {
            return Err(format!("Parte {part_number} retornou {}", part_res.status()));
        }

        let part_body: serde_json::Value = part_res.json().await.map_err(|e| e.to_string())?;
        parts.push(serde_json::json!({
            "partNumber": part_body["partNumber"],
            "etag": part_body["etag"],
        }));

        let pct = (((i + 1) as f64 / total_parts as f64) * 90.0) as u8;
        let _ = progress_tx.send(ProgressEvent {
            stage: "upload".to_string(),
            percent: pct,
            message: None,
            file_url: None,
            file_size: None,
            duration_sec: None,
        });
    }

    // 3. Completar upload
    let complete_res = client
        .post(format!("{worker_url}/upload/complete"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "uploadId": upload_id,
            "key": upload_key,
            "parts": parts,
            "secret": secret,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !complete_res.status().is_success() {
        return Err(format!("Complete falhou: {}", complete_res.status()));
    }

    let complete_body: serde_json::Value = complete_res.json().await.map_err(|e| e.to_string())?;
    let file_url = complete_body["fileUrl"]
        .as_str()
        .ok_or("fileUrl ausente na resposta")?
        .to_string();

    Ok(file_url)
}

fn cleanup(tmp_dir: &Path) {
    if let Err(e) = std::fs::remove_dir_all(tmp_dir) {
        error!("Falha ao limpar temporários: {e}");
    }
}

async fn update_appwrite_doc(
    endpoint: &str,
    project_id: &str,
    db_id: &str,
    col_id: &str,
    doc_id: &str,
    session_jwt: &str,
    file_url: &str,
    file_size: u64,
    duration_sec: f64,
) -> Result<(), String> {
    if session_jwt.is_empty() || col_id.is_empty() {
        return Ok(());
    }

    let url = format!("{endpoint}/databases/{db_id}/collections/{col_id}/documents/{doc_id}");

    let body = serde_json::json!({
        "data": {
            "file_url": file_url,
            "file_size": file_size as i64,
            "duration_sec": duration_sec,
            "processing_status": "ready"
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .patch(&url)
        .header("X-Appwrite-Project", project_id)
        .header("X-Appwrite-JWT", session_jwt)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Appwrite PATCH {status}: {body}"));
    }

    Ok(())
}
