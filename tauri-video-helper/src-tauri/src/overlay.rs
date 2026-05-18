use serde::Deserialize;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;
use tracing::info;

// ─── Request / Response ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RenderOverlayReq {
    #[serde(rename = "videoUrl")]
    pub video_url: String,
    #[serde(rename = "telemetryJson")]
    pub telemetry_json: String,
    pub widgets: Vec<String>,
    #[serde(rename = "cfWorkerUrl")]
    pub cf_worker_url: String,
    #[serde(rename = "cfWorkerSecret")]
    pub cf_worker_secret: String,
    #[serde(rename = "outputKey")]
    pub output_key: Option<String>,
    #[serde(rename = "trimStartSec")]
    pub trim_start_sec: Option<f64>,
    #[serde(rename = "trimEndSec")]
    pub trim_end_sec: Option<f64>,
    /// "horizontal" (padrão) ou "vertical" (9:16 crop central)
    pub orientation: Option<String>,
}

#[derive(serde::Serialize)]
pub struct RenderOverlayRes {
    #[serde(rename = "fileUrl")]
    pub file_url: String,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

// ─── Telemetria ───────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct TelemetryPayload {
    points: Option<Vec<TelemetryPoint>>,
}

#[derive(Deserialize, Debug)]
struct TelemetryPoint {
    #[serde(rename = "timeMs")]
    time_ms: f64,
    speed: Option<f64>,
    altitude: Option<f64>,
    heading: Option<f64>,
}

// ─── Entry point ──────────────────────────────────────────────────────────────

pub async fn run(req: RenderOverlayReq, resource_dir: PathBuf) -> Result<RenderOverlayRes, String> {
    let ffmpeg = crate::ffmpeg::find_ffmpeg(&resource_dir)
        .ok_or_else(|| "FFmpeg não encontrado.".to_string())?;

    let enabled: Vec<&str> = req
        .widgets
        .iter()
        .filter(|w| matches!(w.as_str(), "altitude" | "speed" | "heading"))
        .map(|w| w.as_str())
        .collect();

    if enabled.is_empty() {
        return Err("Selecione altitude, velocidade ou rumo para exportar.".to_string());
    }

    let payload: TelemetryPayload = serde_json::from_str(&req.telemetry_json)
        .map_err(|e| format!("Telemetria inválida: {e}"))?;
    let points = payload.points.unwrap_or_default();
    if points.len() < 2 {
        return Err("Telemetria insuficiente para gerar overlay.".to_string());
    }

    let tmp_dir = std::env::temp_dir().join(format!(
        "flight-overlay-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("Falha ao criar dir temp: {e}"))?;

    let input_path = tmp_dir.join("input.mp4");
    let ass_path = tmp_dir.join("overlay.ass");
    let output_path = tmp_dir.join("output.mp4");
    let output_key = req
        .output_key
        .unwrap_or_else(|| format!("overlay-{}.mp4", uuid::Uuid::new_v4()));

    // ── 1. Baixar vídeo ───────────────────────────────────────────────────────
    info!("Baixando vídeo de {}", req.video_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap();
    let bytes = client
        .get(&req.video_url)
        .send()
        .await
        .map_err(|e| format!("Download falhou: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Leitura do download falhou: {e}"))?;
    std::fs::write(&input_path, &bytes).map_err(|e| format!("Falha ao salvar vídeo: {e}"))?;
    drop(bytes);

    let is_vertical = req.orientation.as_deref() == Some("vertical");

    // ── 2. Gerar arquivo ASS de legendas ─────────────────────────────────────
    let ass_content = build_ass(&points, &enabled, is_vertical);
    std::fs::write(&ass_path, &ass_content).map_err(|e| format!("Falha ao criar ASS: {e}"))?;

    // ── 3. Montar argumentos do ffmpeg ────────────────────────────────────────
    let mut args: Vec<String> = Vec::new();

    // Input seeking rápido (antes de -i)
    if let Some(start) = req.trim_start_sec {
        args.extend(["-ss".to_string(), start.to_string()]);
    }
    args.extend(["-i".to_string(), input_path.to_str().unwrap_or("").to_string()]);

    // Trim de saída (depois de -i, relativo ao -ss se usado)
    if let Some(end) = req.trim_end_sec {
        let duration = match req.trim_start_sec {
            Some(start) => end - start,
            None => end,
        };
        if duration > 0.0 {
            args.extend(["-t".to_string(), duration.to_string()]);
        }
    }

    // Filtro de vídeo: [crop +] subtitles
    let ass_escaped = escape_filter_path(ass_path.to_str().unwrap_or(""));
    let vf = if is_vertical {
        // Crop central 9:16 do 16:9 → ex. 1920x1080 → 608x1080
        format!("crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,subtitles='{ass_escaped}'")
    } else {
        format!("subtitles='{ass_escaped}'")
    };

    args.extend([
        "-vf".to_string(), vf,
        "-c:v".to_string(), "libx264".to_string(),
        "-crf".to_string(), "23".to_string(),
        "-preset".to_string(), "fast".to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "128k".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-threads".to_string(), "0".to_string(),
        "-y".to_string(),
        output_path.to_str().unwrap_or("").to_string(),
    ]);

    // ── 4. Rodar ffmpeg ───────────────────────────────────────────────────────
    info!("Rodando ffmpeg para overlay...");
    let status = Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Falha ao iniciar ffmpeg: {e}"))?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(format!("FFmpeg falhou com código {:?}", status.code()));
    }

    // ── 5. Upload para R2 ─────────────────────────────────────────────────────
    info!("Enviando resultado para R2...");
    let file_bytes =
        std::fs::read(&output_path).map_err(|e| format!("Falha ao ler output: {e}"))?;
    let file_size = file_bytes.len() as u64;

    let file_url =
        upload_multipart(&req.cf_worker_url, &req.cf_worker_secret, &output_key, &file_bytes)
            .await?;

    let _ = std::fs::remove_dir_all(&tmp_dir);

    Ok(RenderOverlayRes { file_url, file_size })
}

// ─── ASS Subtitles ────────────────────────────────────────────────────────────

fn build_ass(points: &[TelemetryPoint], widgets: &[&str], vertical: bool) -> String {
    let end_ms = points
        .iter()
        .map(|p| p.time_ms as u64)
        .max()
        .unwrap_or(0);

    let (play_res_x, play_res_y) = if vertical { (608, 1080) } else { (1920, 1080) };

    let mut lines = vec![
        "[Script Info]".to_string(),
        "ScriptType: v4.00+".to_string(),
        format!("PlayResX: {play_res_x}"),
        format!("PlayResY: {play_res_y}"),
        "ScaledBorderAndShadow: yes".to_string(),
        String::new(),
        "[V4+ Styles]".to_string(),
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding".to_string(),
        "Style: Telemetry,Arial,44,&H00FFFFFF,&H00FFFFFF,&H90000000,&HAA000000,1,0,0,0,100,100,0,0,3,3,0,7,46,46,46,1".to_string(),
        String::new(),
        "[Events]".to_string(),
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text".to_string(),
    ];

    let mut t = 0u64;
    while t <= end_ms + 1000 {
        if let Some(p) = point_at_time(points, t) {
            let text = format_overlay_text(p, widgets).replace('\n', "\\N");
            if !text.is_empty() {
                lines.push(format!(
                    "Dialogue: 0,{},{},Telemetry,,0,0,0,,{}",
                    ass_time(t),
                    ass_time(t + 1000),
                    text
                ));
            }
        }
        t += 1000;
    }

    lines.join("\n")
}

fn point_at_time<'a>(points: &'a [TelemetryPoint], time_ms: u64) -> Option<&'a TelemetryPoint> {
    let mut best = points.first()?;
    for p in points {
        if p.time_ms as u64 > time_ms {
            break;
        }
        best = p;
    }
    Some(best)
}

fn format_overlay_text(p: &TelemetryPoint, widgets: &[&str]) -> String {
    let mut rows: Vec<String> = Vec::new();
    if widgets.contains(&"speed") {
        if let Some(s) = p.speed {
            rows.push(format!("VEL {} kt", (s * 1.94384).round() as i64));
        }
    }
    if widgets.contains(&"altitude") {
        if let Some(a) = p.altitude {
            rows.push(format!("ALT {} ft", (a * 3.28084).round() as i64));
        }
    }
    if widgets.contains(&"heading") {
        if let Some(h) = p.heading {
            rows.push(format!("HDG {}°", h.round() as i64));
        }
    }
    rows.join("\n")
}

fn ass_time(ms: u64) -> String {
    let total_cs = ms / 10;
    let cs = total_cs % 100;
    let sec_total = total_cs / 100;
    let s = sec_total % 60;
    let min_total = sec_total / 60;
    let m = min_total % 60;
    let h = min_total / 60;
    format!("{h}:{m:02}:{s:02}.{cs:02}")
}

fn escape_filter_path(path: &str) -> String {
    path.replace('\\', "/").replace(':', "\\:").replace('\'', "\\'")
}

// ─── Upload multipart para Cloudflare R2 ─────────────────────────────────────

const CHUNK_SIZE: usize = 50 * 1024 * 1024; // 50 MB

async fn upload_multipart(
    worker_url: &str,
    secret: &str,
    key: &str,
    data: &[u8],
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let init_res = client
        .post(format!("{worker_url}/upload/initiate"))
        .json(&serde_json::json!({ "key": key, "secret": secret }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !init_res.status().is_success() {
        return Err(format!("Initiate falhou: {}", init_res.status()));
    }

    let init_body: serde_json::Value = init_res.json().await.map_err(|e| e.to_string())?;
    let upload_id = init_body["uploadId"]
        .as_str()
        .ok_or("uploadId ausente")?
        .to_string();
    let upload_key = init_body["key"]
        .as_str()
        .ok_or("key ausente")?
        .to_string();

    let mut parts: Vec<serde_json::Value> = Vec::new();
    for (i, chunk) in data.chunks(CHUNK_SIZE).enumerate() {
        let part_number = i + 1;
        let part_res = client
            .put(format!("{worker_url}/upload/part"))
            .header("x-upload-id", &upload_id)
            .header("x-upload-key", &upload_key)
            .header("x-part-number", part_number.to_string())
            .header("x-secret", secret)
            .header("Content-Type", "application/octet-stream")
            .body(chunk.to_vec())
            .send()
            .await
            .map_err(|e| format!("Parte {part_number} falhou: {e}"))?;

        if !part_res.status().is_success() {
            return Err(format!(
                "Parte {part_number} retornou {}",
                part_res.status()
            ));
        }

        let part_body: serde_json::Value = part_res.json().await.map_err(|e| e.to_string())?;
        parts.push(serde_json::json!({
            "partNumber": part_body["partNumber"],
            "etag": part_body["etag"],
        }));
    }

    let complete_res = client
        .post(format!("{worker_url}/upload/complete"))
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

    let complete_body: serde_json::Value =
        complete_res.json().await.map_err(|e| e.to_string())?;
    complete_body["fileUrl"]
        .as_str()
        .ok_or_else(|| "fileUrl ausente na resposta".to_string())
        .map(|s| s.to_string())
}
