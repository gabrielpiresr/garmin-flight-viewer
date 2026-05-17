use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{error, info};

pub fn find_ffmpeg(resource_dir: &Path) -> Option<PathBuf> {
    let bundled = resource_dir.join("ffmpeg.exe");
    if bundled.exists() {
        return Some(bundled);
    }
    // Fallback para PATH
    if which_in_path("ffmpeg") {
        return Some(PathBuf::from("ffmpeg"));
    }
    None
}

pub fn find_ffprobe(resource_dir: &Path) -> Option<PathBuf> {
    let bundled = resource_dir.join("ffprobe.exe");
    if bundled.exists() {
        return Some(bundled);
    }
    if which_in_path("ffprobe") {
        return Some(PathBuf::from("ffprobe"));
    }
    None
}

fn which_in_path(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

/// Retorna a duração total em segundos de uma lista de arquivos de vídeo.
pub async fn get_total_duration(ffprobe: &Path, files: &[PathBuf]) -> f64 {
    let mut total = 0.0_f64;
    for file in files {
        if let Ok(d) = probe_duration(ffprobe, file).await {
            total += d;
        }
    }
    total
}

pub async fn probe_duration(ffprobe: &Path, file: &Path) -> Result<f64, String> {
    let out = Command::new(ffprobe)
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file.to_str().unwrap_or(""),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let s = String::from_utf8_lossy(&out.stdout);
    s.trim().parse::<f64>().map_err(|e| e.to_string())
}

/// Escreve o arquivo concat list.txt para o FFmpeg.
pub fn write_concat_list(tmp_dir: &Path, files: &[PathBuf]) -> Result<PathBuf, String> {
    let list_path = tmp_dir.join("concat_list.txt");
    let mut content = String::new();
    for f in files {
        let escaped = f.to_str().unwrap_or("").replace('\'', "'\\''");
        content.push_str(&format!("file '{}'\n", escaped));
    }
    std::fs::write(&list_path, content).map_err(|e| e.to_string())?;
    Ok(list_path)
}

/// Stage 1: Concatenar vídeos sem reencode (rápido). Se falhar, faz reencode com normalização.
pub async fn concat_videos(
    ffmpeg: &Path,
    ffprobe: &Path,
    files: &[PathBuf],
    output: &Path,
    total_duration_sec: f64,
    progress_cb: impl Fn(u8) + Send + 'static,
) -> Result<(), String> {
    let tmp_dir = output.parent().unwrap_or(Path::new("."));
    let list_path = write_concat_list(tmp_dir, files)?;

    // Tenta concat sem reencode primeiro
    let result = run_concat_copy(ffmpeg, &list_path, output, total_duration_sec, &progress_cb).await;

    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            info!("Concat copy falhou ({e}), tentando reencode com normalização...");
            // Limpar arquivo de saída corrompido
            let _ = std::fs::remove_file(output);
            run_concat_reencode(ffmpeg, ffprobe, files, output, total_duration_sec, progress_cb).await
        }
    }
}

async fn run_concat_copy(
    ffmpeg: &Path,
    list_path: &Path,
    output: &Path,
    total_duration_sec: f64,
    progress_cb: &impl Fn(u8),
) -> Result<(), String> {
    let mut child = Command::new(ffmpeg)
        .args([
            "-f", "concat",
            "-safe", "0",
            "-i", list_path.to_str().unwrap_or(""),
            "-c", "copy",
            "-y",
            "-progress", "pipe:2",
            "-nostats",
            output.to_str().unwrap_or(""),
        ])
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr).lines();

    let mut out_time_us: u64 = 0;
    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(val) = parse_progress_field(&line, "out_time_us") {
            out_time_us = val.parse::<u64>().unwrap_or(0);
            if total_duration_sec > 0.0 {
                let pct = ((out_time_us as f64 / 1_000_000.0 / total_duration_sec) * 100.0)
                    .min(99.0) as u8;
                progress_cb(pct);
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("ffmpeg concat copy saiu com código {:?}", status.code()));
    }
    Ok(())
}

async fn run_concat_reencode(
    ffmpeg: &Path,
    ffprobe: &Path,
    files: &[PathBuf],
    output: &Path,
    total_duration_sec: f64,
    progress_cb: impl Fn(u8),
) -> Result<(), String> {
    // Detectar resolução alvo (maior entre todos os arquivos)
    let (target_w, target_h) = detect_target_resolution(ffprobe, files).await;

    let mut inputs: Vec<String> = Vec::new();
    for f in files {
        inputs.push("-i".to_string());
        inputs.push(f.to_str().unwrap_or("").to_string());
    }

    let n = files.len();
    // filter_complex: escalar cada input para resolução alvo, depois concat
    let mut filter = String::new();
    for i in 0..n {
        filter.push_str(&format!(
            "[{i}:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,fps=30[v{i}];"
        ));
    }
    let video_labels: String = (0..n).map(|i| format!("[v{i}]")).collect();
    let audio_labels: String = (0..n).map(|i| format!("[{i}:a]")).collect();
    filter.push_str(&format!(
        "{video_labels}concat=n={n}:v=1:a=0[outv];{audio_labels}concat=n={n}:v=0:a=1[outa]"
    ));

    let mut args: Vec<String> = inputs;
    args.extend([
        "-filter_complex".to_string(), filter,
        "-map".to_string(), "[outv]".to_string(),
        "-map".to_string(), "[outa]".to_string(),
        "-c:v".to_string(), "libx264".to_string(),
        "-crf".to_string(), "28".to_string(),
        "-preset".to_string(), "fast".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "128k".to_string(),
        "-y".to_string(),
        "-progress".to_string(), "pipe:2".to_string(),
        "-nostats".to_string(),
        output.to_str().unwrap_or("").to_string(),
    ]);

    let mut child = Command::new(ffmpeg)
        .args(&args)
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(val) = parse_progress_field(&line, "out_time_us") {
            let out_time_us = val.parse::<u64>().unwrap_or(0);
            if total_duration_sec > 0.0 {
                let pct = ((out_time_us as f64 / 1_000_000.0 / total_duration_sec) * 100.0)
                    .min(99.0) as u8;
                progress_cb(pct);
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("ffmpeg reencode saiu com código {:?}", status.code()));
    }
    Ok(())
}

/// Stage 2: Aplicar watermark PNG sobre o vídeo (canto inferior direito).
pub async fn apply_watermark(
    ffmpeg: &Path,
    input: &Path,
    watermark: &Path,
    output: &Path,
    duration_sec: f64,
    progress_cb: impl Fn(u8),
) -> Result<(), String> {
    let mut child = Command::new(ffmpeg)
        .args([
            "-i", input.to_str().unwrap_or(""),
            "-i", watermark.to_str().unwrap_or(""),
            "-filter_complex", "[0:v][1:v]overlay=W-w-20:H-h-20[outv]",
            "-map", "[outv]",
            "-map", "0:a",
            "-c:a", "copy",
            "-y",
            "-progress", "pipe:2",
            "-nostats",
            output.to_str().unwrap_or(""),
        ])
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(val) = parse_progress_field(&line, "out_time_us") {
            let out_time_us = val.parse::<u64>().unwrap_or(0);
            if duration_sec > 0.0 {
                let pct = ((out_time_us as f64 / 1_000_000.0 / duration_sec) * 100.0)
                    .min(99.0) as u8;
                progress_cb(pct);
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("ffmpeg watermark saiu com código {:?}", status.code()));
    }
    Ok(())
}

/// Stage 3: Comprimir para H.264 CRF 28.
pub async fn compress_video(
    ffmpeg: &Path,
    input: &Path,
    output: &Path,
    duration_sec: f64,
    progress_cb: impl Fn(u8),
) -> Result<(), String> {
    let mut child = Command::new(ffmpeg)
        .args([
            "-i", input.to_str().unwrap_or(""),
            "-c:v", "libx264",
            "-crf", "28",
            "-preset", "fast",
            // garante que dimensões sejam múltiplos de 2 (requerido pelo libx264)
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-y",
            "-progress", "pipe:2",
            "-nostats",
            output.to_str().unwrap_or(""),
        ])
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(val) = parse_progress_field(&line, "out_time_us") {
            let out_time_us = val.parse::<u64>().unwrap_or(0);
            if duration_sec > 0.0 {
                let pct = ((out_time_us as f64 / 1_000_000.0 / duration_sec) * 100.0)
                    .min(99.0) as u8;
                progress_cb(pct);
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("ffmpeg compress saiu com código {:?}", status.code()));
    }
    Ok(())
}

fn parse_progress_field<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let prefix = format!("{key}=");
    line.trim().strip_prefix(&prefix)
}

async fn detect_target_resolution(ffprobe: &Path, files: &[PathBuf]) -> (u32, u32) {
    let mut max_w = 1280_u32;
    let mut max_h = 720_u32;

    for file in files {
        let out = Command::new(ffprobe)
            .args([
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                file.to_str().unwrap_or(""),
            ])
            .output()
            .await;

        if let Ok(o) = out {
            let s = String::from_utf8_lossy(&o.stdout);
            let parts: Vec<&str> = s.trim().split(',').collect();
            if parts.len() == 2 {
                let w = parts[0].parse::<u32>().unwrap_or(0);
                let h = parts[1].parse::<u32>().unwrap_or(0);
                if w * h > max_w * max_h {
                    max_w = w;
                    max_h = h;
                }
            }
        }
    }

    // Garantir múltiplos de 2
    (max_w & !1, max_h & !1)
}
