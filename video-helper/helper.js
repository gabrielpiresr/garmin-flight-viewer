#!/usr/bin/env node
// Flight Video Helper — processa vídeos localmente e envia para R2
// Sem dependências externas. Requer Node.js 18+ e ffmpeg/ffprobe no PATH ou na mesma pasta.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");

const PORT = 7842;
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB por parte no upload multipart
const HELPER_DIR = process.env.HELPER_RESOURCES
  || path.dirname(process.execPath.endsWith("node.exe") ? process.argv[1] : process.execPath);

// #region agent log
const AGENT_DEBUG_ENDPOINT = "http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1";
const AGENT_DEBUG_SESSION = "673562";
function agentDebugLog(location, message, data, hypothesisId) {
  fetch(AGENT_DEBUG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": AGENT_DEBUG_SESSION },
    body: JSON.stringify({
      sessionId: AGENT_DEBUG_SESSION,
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

// ─── Estado dos jobs ───────────────────────────────────────────────────────────

const jobs = new Map(); // jobId → { listeners: res[], buffer: string[], cancelled: bool, cancel: fn }

function createJob(jobId) {
  const job = { listeners: [], buffer: [], cancelled: false };
  job.cancel = () => { job.cancelled = true; };
  jobs.set(jobId, job);
  return job;
}

function sendProgress(jobId, data) {
  const job = jobs.get(jobId);
  if (!job) return;
  const line = `data: ${JSON.stringify(data)}\n\n`;
  job.buffer.push(line);
  for (const res of job.listeners) {
    try { res.write(line); } catch {}
  }
}

// ─── Servidor HTTP ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const origin = req.headers["origin"] || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename, X-Params");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Local-Network", "true");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split("?")[0];

  // GET /health
  if (url === "/health" && req.method === "GET") {
    return json(res, { ok: true, version: "1.0.0" });
  }

  // POST /receive-file/:sessionId/:index — recebe um arquivo de vídeo via streaming
  const receiveMatch = url.match(/^\/receive-file\/([^/]+)\/(\d+)$/);
  if (receiveMatch && req.method === "POST") {
    const [, sessionId, indexStr] = receiveMatch;
    const index = parseInt(indexStr, 10);
    const filename = sanitizeFilename(req.headers["x-filename"] || `video_${index}.mp4`);

    const tmpDir = path.join(os.tmpdir(), `flight-${sessionId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const filePath = path.join(tmpDir, `input_${index}_${filename}`);
    const ws = fs.createWriteStream(filePath);
    const expectedBytes = Number(req.headers["content-length"] || 0);
    const startedAt = Date.now();
    let receivedBytes = 0;

    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
    });
    req.on("aborted", () => {
      console.warn(`[receive-file] upload abortado: ${filename} (${receivedBytes}/${expectedBytes || "?"} bytes)`);
      ws.destroy(new Error("Upload abortado pelo browser"));
    });

    console.log(`[receive-file] recebendo ${filename} (${expectedBytes || "tamanho desconhecido"} bytes)`);

    try {
      await pipe(req, ws);
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[receive-file] recebido ${filename}: ${receivedBytes} bytes em ${elapsedSec}s`);
      return json(res, { ok: true });
    } catch (e) {
      console.error(`[receive-file] erro ao receber ${filename}: ${e.message}`);
      return json(res, { error: e.message }, 500);
    }
  }

  // POST /process — inicia pipeline
  if (url === "/process" && req.method === "POST") {
    let body;
    try { body = await readJson(req); } catch { return json(res, { error: "JSON inválido" }, 400); }

    const job = createJob(body.jobId);
    json(res, { ok: true });

    setImmediate(() => runPipeline(body, job).catch(console.error));
    return;
  }

  // POST /composite-overlay — recebe overlay WebM do browser e faz composite com vídeo fonte
  if (url === "/composite-overlay" && req.method === "POST") {
    const paramsStr = req.headers["x-params"] || "{}";
    let params;
    try { params = JSON.parse(paramsStr); } catch { return json(res, { error: "X-Params inválido" }, 400); }
    const { videoUrl, cfWorkerUrl, cfWorkerToken, outputKey, trimStartSec, trimEndSec,
            orientation, frameCount, fps, durationSec, jobId } = params;
    if (!videoUrl || !cfWorkerUrl || !cfWorkerToken || !jobId) {
      return json(res, { error: "Parâmetros obrigatórios faltando" }, 400);
    }

    const overlayChunks = [];
    for await (const chunk of req) overlayChunks.push(chunk);
    const overlayBuffer = Buffer.concat(overlayChunks);
    console.log(`[composite-overlay] overlay recebido: ${overlayBuffer.length} bytes, primeiros bytes: ${overlayBuffer.slice(0, 8).toString("hex")}`);
    if (overlayBuffer.length === 0) return json(res, { error: "Overlay vazio" }, 400);

    const job = createJob(jobId);
    json(res, { ok: true, jobId });

    setImmediate(async () => {
      try {
        const fileUrl = await compositeOverlay(
          { videoUrl, cfWorkerUrl, cfWorkerToken, outputKey, trimStartSec, trimEndSec,
            orientation, fps: fps || 30, durationSec, overlayBuffer },
          job, jobId,
        );
        sendProgress(jobId, { stage: "done", percent: 100, fileUrl });
      } catch (e) {
        console.error(`[${jobId}] composite error:`, e.message);
        sendProgress(jobId, { stage: "error", percent: 0, message: e.message });
      }
    });
    return;
  }

  // POST /render-overlay — (legado, mantido para compatibilidade)
  if (url === "/render-overlay" && req.method === "POST") {
    let body;
    try { body = await readJson(req); } catch { return json(res, { error: "JSON invalido" }, 400); }
    try {
      const result = await renderTelemetryOverlay(body);
      return json(res, result);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  const progressMatch = url.match(/^\/progress\/([^/]+)$/);
  if (progressMatch && req.method === "GET") {
    const [, jobId] = progressMatch;
    const job = jobs.get(jobId);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");

    if (!job) {
      res.write(`data: ${JSON.stringify({ stage: "error", percent: 0, message: "Job não encontrado" })}\n\n`);
      return res.end();
    }

    // Replay any events sent before this SSE connection was established
    for (const line of job.buffer) {
      try { res.write(line); } catch {}
    }
    job.listeners.push(res);
    req.on("close", () => {
      job.listeners = job.listeners.filter((l) => l !== res);
    });
    return;
  }

  // POST /cancel/:jobId
  const cancelMatch = url.match(/^\/cancel\/([^/]+)$/);
  if (cancelMatch && req.method === "POST") {
    const [, jobId] = cancelMatch;
    jobs.get(jobId)?.cancel();
    return json(res, { ok: true });
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── Pipeline principal ────────────────────────────────────────────────────────

async function runPipeline(req, job) {
  const {
    jobId, sessionId, fileOrder, cfWorkerUrl, cfWorkerToken, videoKey,
    appwriteEndpoint, appwriteProjectId, appwriteDbId, videosColId,
    sessionJwt, flightVideoDocId,
  } = req;

  const fail = (msg) => {
    console.error(`[${jobId}] ERRO: ${msg}`);
    sendProgress(jobId, { stage: "error", percent: 0, message: msg });
  };

  const progress = (stage, percent, extra = {}) => {
    sendProgress(jobId, { stage, percent, ...extra });
  };

  // Localizar ffmpeg
  const ffmpeg = findBin("ffmpeg");
  const ffprobe = findBin("ffprobe");
  if (!ffmpeg) return fail("ffmpeg não encontrado. Coloque ffmpeg.exe na mesma pasta do helper.js ou instale no PATH.");

  const encoder = await detectEncoder(ffmpeg);
  console.log(`[${jobId}] Encoder selecionado: ${encoder}`);

  const tmpDir = path.join(os.tmpdir(), `flight-${sessionId}`);
  const uploadedFiles = fileOrder.map(({ index, name }) =>
    path.join(tmpDir, `input_${index}_${sanitizeFilename(name)}`)
  );
  const videoFiles = uploadedFiles.filter((file) => isVideoFile(file));
  const sidecarFiles = uploadedFiles.filter((file) => isSrtFile(file));

  for (const f of videoFiles) {
    if (!fs.existsSync(f)) return fail(`Arquivo não encontrado no servidor: ${f}`);
  }

  if (videoFiles.length === 0) return fail("Selecione pelo menos um arquivo de video.");

  const joinedPath = path.join(tmpDir, "joined.mp4");
  const finalPath = path.join(tmpDir, "final.mp4");

  // Duração total para calcular progresso
  const totalDuration = ffprobe ? await getTotalDuration(ffprobe, videoFiles) : 0;

  try {
    // ── Stage 1: Concat ──────────────────────────────────────────────────────
    progress("telemetry-detect", 0);
    const telemetry = await detectVideoTelemetry(ffmpeg, ffprobe, videoFiles, sidecarFiles, tmpDir);
    progress("telemetry-detect", 100, {
      telemetry_present: telemetry.telemetryPresent,
      telemetry_source: telemetry.source,
      available_widgets: telemetry.availableWidgets,
    });

    progress("concat", 0);
    if (job.cancelled) return fail("Cancelado");

    await concatVideos(ffmpeg, ffprobe, encoder, videoFiles, joinedPath, totalDuration, (pct) => {
      if (!job.cancelled) progress("concat", pct);
    });

    if (job.cancelled) return fail("Cancelado");

    // ── Stage 2: Watermark + Compress (passo único) ─────────────────────────
    const watermarkPath = path.join(HELPER_DIR, "watermark.png");
    progress("compress", 0);
    await applyWatermarkAndCompress(ffmpeg, encoder, joinedPath, watermarkPath, finalPath, totalDuration, (pct) => {
      if (!job.cancelled) progress("compress", pct);
    });

    if (job.cancelled) return fail("Cancelado");

    // ── Stage 4: Upload multipart ────────────────────────────────────────────
    progress("upload", 0);
    const fileBytes = fs.readFileSync(finalPath);
    const fileSize = fileBytes.length;

    const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerToken, videoKey, fileBytes, (pct) => {
      progress("upload", pct);
    });

    // Duração do arquivo final
    const finalDuration = ffprobe ? (await probeDuration(ffprobe, finalPath)) ?? totalDuration : totalDuration;

    // Atualizar Appwrite
    const appwriteOk = await updateAppwrite(appwriteEndpoint, appwriteProjectId, appwriteDbId, videosColId,
      flightVideoDocId, sessionJwt, fileUrl, fileSize, finalDuration, telemetry);
    if (!appwriteOk) {
      console.warn(`[${jobId}] Appwrite não atualizado — o browser deve finalizar via SDK`);
    }

    // Limpar temporários
    cleanup(tmpDir);

    progress("done", 100, {
      file_url: fileUrl,
      file_size: fileSize,
      duration_sec: finalDuration,
      telemetry_present: telemetry.telemetryPresent,
      telemetry_source: telemetry.source,
      available_widgets: telemetry.availableWidgets,
      telemetry_json: telemetry.telemetryJson,
    });
    console.log(`[${jobId}] Concluído: ${fileUrl}`);

  } catch (e) {
    fail(e.message);
    cleanup(tmpDir);
  }
}

// ─── FFmpeg helpers ────────────────────────────────────────────────────────────

function findBin(name) {
  const exeName = process.platform === "win32" ? `${name}.exe` : name;
  const local = path.join(HELPER_DIR, exeName);
  if (fs.existsSync(local)) return local;
  try { execSync(`${name} -version`, { stdio: "ignore" }); return name; } catch {}
  return null;
}

async function getTotalDuration(ffprobe, files) {
  let total = 0;
  for (const f of files) {
    const d = await probeDuration(ffprobe, f);
    if (d) total += d;
  }
  return total;
}

function probeDuration(ffprobe, file) {
  return new Promise((resolve) => {
    const p = spawn(ffprobe, [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(parseFloat(out.trim()) || null));
  });
}

function isVideoFile(file) {
  return /\.(mp4|mov|avi|mkv|mts|m2ts|webm)$/i.test(file);
}

function isSrtFile(file) {
  return /\.srt$/i.test(file);
}

async function detectVideoTelemetry(ffmpeg, ffprobe, videoFiles, sidecarFiles, tmpDir) {
  const allPoints = [];
  let source = "none";
  let sawGoproTrack = false;
  let offsetMs = 0;

  // #region agent log
  agentDebugLog("helper.js:detectVideoTelemetry", "start", {
    videoCount: videoFiles.length,
    sidecarCount: sidecarFiles.length,
    hasFfmpeg: Boolean(ffmpeg),
    hasFfprobe: Boolean(ffprobe),
    videos: videoFiles.map((f) => path.basename(f)),
  }, "A");
  // #endregion

  for (let i = 0; i < videoFiles.length; i++) {
    const video = videoFiles[i];
    const durationSec = ffprobe ? (await probeDuration(ffprobe, video)) ?? 0 : 0;

    const sidecar = findMatchingSrt(video, sidecarFiles, i);
    let srtText = sidecar && fs.existsSync(sidecar) ? fs.readFileSync(sidecar, "utf8") : "";

    if (!srtText && ffmpeg) {
      const embeddedPath = path.join(tmpDir, `embedded_${i}.srt`);
      if (await extractEmbeddedSrt(ffmpeg, video, embeddedPath)) {
        srtText = fs.readFileSync(embeddedPath, "utf8");
      }
    }

    if (srtText) {
      const points = parseDjiSrtTelemetry(srtText, offsetMs);
      if (points.length > 0) {
        allPoints.push(...points);
        source = "dji_srt";
      }
    } else if (ffprobe && await hasGoproMetadataTrack(ffprobe, video)) {
      const hasGopro = true;
      const points = await extractGoproGps9Telemetry(ffmpeg, video, tmpDir, i, offsetMs);
      // #region agent log
      agentDebugLog("helper.js:detectVideoTelemetry", "gopro branch", {
        index: i,
        video: path.basename(video),
        hasGoproTrack: hasGopro,
        rawPoints: points.length,
        fileSize: fs.existsSync(video) ? fs.statSync(video).size : 0,
      }, "B");
      // #endregion
      if (points.length > 0) {
        allPoints.push(...points);
        source = "gopro";
      } else {
        sawGoproTrack = true;
      }
    } else {
      // #region agent log
      agentDebugLog("helper.js:detectVideoTelemetry", "no srt/gopro", {
        index: i,
        video: path.basename(video),
        hasFfprobe: Boolean(ffprobe),
        hasGoproTrack: ffprobe ? await hasGoproMetadataTrack(ffprobe, video) : false,
      }, "A");
      // #endregion
    }

    offsetMs += Math.max(0, durationSec * 1000);
  }

  const normalized = normalizeTelemetryPoints(allPoints);
  const availableWidgets = inferAvailableWidgets(normalized);
  const result = {
    telemetryPresent: normalized.length > 1,
    source: normalized.length > 1 ? source : (sawGoproTrack ? "gopro" : "none"),
    availableWidgets,
    telemetryJson: JSON.stringify({ version: 1, points: downsamplePoints(normalized, 1200) }),
  };
  // #region agent log
  agentDebugLog("helper.js:detectVideoTelemetry", "result", {
    rawPoints: allPoints.length,
    normalizedPoints: normalized.length,
    telemetryPresent: result.telemetryPresent,
    source: result.source,
    sawGoproTrack,
    telemetryJsonBytes: Buffer.byteLength(result.telemetryJson, "utf8"),
    widgets: availableWidgets,
  }, "C");
  // #endregion
  return result;
}

async function extractGoproGps9Telemetry(ffmpeg, videoFile, tmpDir, index, offsetMs) {
  if (!ffmpeg) return [];
  const output = path.join(tmpDir, `gopro_${index}.gpmd.bin`);
  let exitCode = -1;
  let binSize = 0;
  const ok = await new Promise((resolve) => {
    const p = spawn(ffmpeg, ["-y", "-i", videoFile, "-map", "0:m:handler_name:GoPro MET", "-c", "copy", "-f", "data", output], { stdio: "ignore" });
    p.on("close", (code) => {
      exitCode = code;
      binSize = fs.existsSync(output) ? fs.statSync(output).size : 0;
      resolve(code === 0 && binSize > 0);
    });
    p.on("error", () => resolve(false));
  });
  // #region agent log
  agentDebugLog("helper.js:extractGoproGps9Telemetry", "ffmpeg extract", {
    index,
    video: path.basename(videoFile),
    ok,
    exitCode,
    binSize,
  }, "B");
  // #endregion
  if (!ok) return [];
  const parsed = parseGoproGps9Binary(fs.readFileSync(output), offsetMs);
  // #region agent log
  agentDebugLog("helper.js:extractGoproGps9Telemetry", "parsed", {
    index,
    parsedPoints: parsed.length,
    gps9Items: parseGpmfItems(fs.readFileSync(output)).filter((it) => it.key === "GPS9").length,
  }, "C");
  // #endregion
  return parsed;
}

function parseGoproGps9Binary(buffer, offsetMs) {
  const items = parseGpmfItems(buffer);
  const points = [];
  for (const item of items) {
    if (item.key !== "GPS9" || item.size < 32) continue;
    for (let i = 0; i < item.repeat; i++) {
      const o = item.data + i * item.size;
      if (o + 32 > buffer.length) continue;
      const lat = buffer.readInt32BE(o) / 10000000;
      const lon = buffer.readInt32BE(o + 4) / 10000000;
      const altitude = buffer.readInt32BE(o + 8) / 1000;
      const speed = buffer.readInt32BE(o + 12) / 1000;
      const gpsSeconds = buffer.readInt32BE(o + 24) / 1000;
      const fix = buffer.readUInt16BE(o + 30);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      // GoPro recente pode gravar fix=0 com lat/lon válidos — só descarta (0,0) ou fix negativo
      if (lat === 0 && lon === 0) continue;
      if (fix < 0) continue;
      const firstSeconds = points.length > 0 ? points[0].gpsSeconds : gpsSeconds;
      points.push({
        timeMs: Math.max(0, offsetMs + (gpsSeconds - firstSeconds) * 1000),
        lat,
        lon,
        altitude,
        speed,
        heading: null,
        gpsSeconds,
      });
    }
  }
  return points.map(({ gpsSeconds, ...point }) => point);
}

function parseGpmfItems(buffer) {
  const items = [];
  const walk = (start, end, depth = 0) => {
    let offset = start;
    while (offset + 8 <= end) {
      const key = buffer.toString("latin1", offset, offset + 4);
      const type = String.fromCharCode(buffer[offset + 4]);
      const size = buffer[offset + 5];
      const repeat = buffer.readUInt16BE(offset + 6);
      const bytes = size * repeat;
      const data = offset + 8;
      const next = data + bytes + ((4 - (bytes % 4)) % 4);
      if (!/^[A-Z0-9_]{4}$/.test(key) || next > buffer.length || next <= offset) {
        offset += 1;
        continue;
      }
      items.push({ key, type, size, repeat, offset, data, bytes, depth });
      if (key === "DEVC" || key === "STRM") walk(data, data + bytes, depth + 1);
      offset = next;
    }
  };
  walk(0, buffer.length);
  return items;
}

function findMatchingSrt(videoFile, sidecarFiles, index) {
  if (sidecarFiles.length === 0) return null;
  const videoBase = path.basename(videoFile).replace(/^input_\d+_/, "").replace(/\.[^.]+$/, "").toLowerCase();
  return sidecarFiles.find((srt) => {
    const srtBase = path.basename(srt).replace(/^input_\d+_/, "").replace(/\.[^.]+$/, "").toLowerCase();
    return srtBase === videoBase;
  }) ?? sidecarFiles[index] ?? sidecarFiles[0] ?? null;
}

function extractEmbeddedSrt(ffmpeg, videoFile, outputSrt) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, ["-y", "-i", videoFile, "-map", "0:s:0", outputSrt], { stdio: "ignore" });
    p.on("close", (code) => resolve(code === 0 && fs.existsSync(outputSrt) && fs.statSync(outputSrt).size > 0));
    p.on("error", () => resolve(false));
  });
}

async function hasGoproMetadataTrack(ffprobe, videoFile) {
  try {
    const out = await new Promise((resolve) => {
      const p = spawn(ffprobe, ["-v", "error", "-show_streams", "-of", "json", videoFile]);
      let stdout = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.on("close", () => resolve(stdout));
      p.on("error", () => resolve(""));
    });
    return /gpmd|gpmf|GoPro MET|GoPro/i.test(String(out));
  } catch {
    return false;
  }
}

function parseDjiSrtTelemetry(text, offsetMs) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const points = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeLine = lines.find((line) => line.includes("-->"));
    if (!timeLine) continue;
    const startMs = parseSrtTimestamp(timeLine.split("-->")[0]);
    if (startMs === null) continue;
    const body = lines.filter((line) => !/^\d+$/.test(line) && !line.includes("-->")).join(" ");
    const lat = pickNumber(body, [
      /latitude\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /\[lat(?:itude)?\s*[:=]\s*(-?\d+(?:\.\d+)?)\]/i,
      /GPS\s*\(\s*(-?\d+(?:\.\d+)?)[,\s]+-?\d+(?:\.\d+)?/i,
    ]);
    const lon = pickNumber(body, [
      /longitude\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /\[(?:lon|lng|longitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)\]/i,
      /GPS\s*\(\s*-?\d+(?:\.\d+)?[,\s]+(-?\d+(?:\.\d+)?)/i,
    ]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const altitude = pickNumber(body, [
      /rel_alt\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /abs_alt\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /altitude\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /\balt\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
    ]);
    const speed = pickNumber(body, [
      /speed\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /vel(?:ocity)?\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /h_speed\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
    ]);
    const heading = pickNumber(body, [
      /heading\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
      /yaw\s*[:=]\s*(-?\d+(?:\.\d+)?)/i,
    ]);
    points.push({
      timeMs: Math.max(0, offsetMs + startMs),
      lat,
      lon,
      altitude: Number.isFinite(altitude) ? altitude : null,
      speed: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? normalizeHeadingDeg(heading) : null,
    });
  }
  return points;
}

function parseSrtTimestamp(value) {
  const m = String(value).trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return null;
  const [, hh, mm, ss, ms] = m;
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms.padEnd(3, "0").slice(0, 3));
}

function pickNumber(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] !== undefined) {
      const n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function normalizeHeadingDeg(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeTelemetryPoints(points) {
  return points
    .filter((p) => Number.isFinite(p.timeMs) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((p, i, arr) => i === 0 || p.timeMs !== arr[i - 1].timeMs || p.lat !== arr[i - 1].lat || p.lon !== arr[i - 1].lon);
}

function inferAvailableWidgets(points) {
  if (points.length < 2) return [];
  const widgets = ["route"];
  if (points.some((p) => Number.isFinite(p.altitude))) widgets.push("altitude", "altitudeChart");
  if (points.some((p) => Number.isFinite(p.speed))) widgets.push("speed", "speedChart");
  if (points.some((p) => Number.isFinite(p.heading))) widgets.push("heading");
  return widgets;
}

function downsamplePoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const out = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

// ─── Seleção de encoder de vídeo ─────────────────────────────────────────────

async function detectEncoder(ffmpeg) {
  const candidates = ["h264_nvenc", "h264_qsv", "h264_amf"];
  for (const enc of candidates) {
    const ok = await new Promise((resolve) => {
      const p = spawn(ffmpeg, [
        "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.1",
        "-c:v", enc, "-f", "null", "-",
      ], { stdio: "ignore" });
      p.on("close", (code) => resolve(code === 0));
    });
    if (ok) return enc;
  }
  return "libx264";
}

function encoderArgs(encoder) {
  switch (encoder) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "28", "-b:v", "0"];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-global_quality", "28", "-preset", "veryfast"];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", "28", "-qp_p", "28", "-qp_b", "28"];
    default:
      return ["-c:v", "libx264", "-crf", "28", "-preset", "ultrafast"];
  }
}

async function concatVideos(ffmpeg, ffprobe, encoder, files, output, totalDuration, onProgress) {
  const tmpList = output.replace("joined.mp4", "concat_list.txt");
  const lines = files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(tmpList, lines);

  // Tenta concat sem reencode primeiro
  const ok = await runFfmpeg(ffmpeg, [
    "-f", "concat", "-safe", "0", "-i", tmpList,
    "-c", "copy", "-y", "-progress", "pipe:2", "-nostats", output,
  ], totalDuration, onProgress);

  if (!ok) {
    // Fallback: reencode normalizando resolução
    fs.existsSync(output) && fs.unlinkSync(output);
    const { w, h } = ffprobe ? await detectResolution(ffprobe, files) : { w: 1280, h: 720 };
    const inputs = files.flatMap((f) => ["-i", f]);
    const n = files.length;
    let filter = files.map((_, i) =>
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p[v${i}]`
    ).join(";");
    filter += `;${files.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[outv]`;
    filter += `;${files.map((_, i) => `[${i}:a]`).join("")}concat=n=${n}:v=0:a=1[outa]`;

    await runFfmpeg(ffmpeg, [
      ...inputs, "-filter_complex", filter,
      "-map", "[outv]", "-map", "[outa]",
      ...encoderArgs(encoder),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-threads", "0",
      "-y", "-progress", "pipe:2", "-nostats", output,
    ], totalDuration, onProgress, { mustSucceed: true });
  }
}

async function applyWatermarkAndCompress(ffmpeg, encoder, input, watermark, output, duration, onProgress) {
  const hasWatermark = fs.existsSync(watermark);
  const filterArgs = hasWatermark
    ? [
        "-i", input, "-i", watermark,
        "-filter_complex", "[0:v][1:v]overlay=W-w-20:H-h-20,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[outv]",
        "-map", "[outv]", "-map", "0:a",
      ]
    : [
        "-i", input,
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      ];

  await runFfmpeg(ffmpeg, [
    ...filterArgs,
    ...encoderArgs(encoder),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-threads", "0",
    "-y", "-progress", "pipe:2", "-nostats", output,
  ], duration, onProgress, { mustSucceed: true });
}

function runFfmpeg(ffmpeg, args, totalDuration, onProgress, { mustSucceed = false, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], ...(cwd ? { cwd } : {}) });
    let stderr = "";

    p.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        const m = line.match(/out_time_us=(\d+)/);
        if (m && totalDuration > 0) {
          const pct = Math.min(99, Math.floor((parseInt(m[1]) / 1e6 / totalDuration) * 100));
          onProgress(pct);
        }
      }
    });

    p.on("close", (code) => {
      if (mustSucceed && code !== 0) {
        reject(new Error(`ffmpeg saiu com código ${code}:\n${stderr.slice(-500)}`));
      } else {
        resolve(code === 0);
      }
    });
  });
}

async function detectResolution(ffprobe, files) {
  let maxW = 1280, maxH = 720;
  for (const f of files) {
    await new Promise((resolve) => {
      const p = spawn(ffprobe, [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0", f,
      ]);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", () => {
        const [w, h] = out.trim().split(",").map(Number);
        if (w && h && w * h > maxW * maxH) { maxW = w; maxH = h; }
        resolve();
      });
    });
  }
  return { w: maxW & ~1, h: maxH & ~1 };
}

// ─── Upload multipart via CF Worker ───────────────────────────────────────────

async function uploadMultipart(workerUrl, token, key, data, onProgress) {
  // 1. Iniciar
  const initRes = await fetch(`${workerUrl}/upload/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, token }),
  });
  if (!initRes.ok) throw new Error(`Upload initiate falhou: ${initRes.status}`);
  const { uploadId, key: uploadKey } = await initRes.json();

  // 2. Partes
  const totalParts = Math.ceil(data.length / CHUNK_SIZE);
  const parts = [];

  for (let i = 0; i < totalParts; i++) {
    const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const partRes = await fetch(`${workerUrl}/upload/part`, {
      method: "PUT",
      headers: {
        "x-upload-id": uploadId,
        "x-upload-key": uploadKey,
        "x-part-number": String(i + 1),
        "x-token": token,
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    });
    if (!partRes.ok) throw new Error(`Parte ${i + 1} falhou: ${partRes.status}`);
    parts.push(await partRes.json());
    onProgress(Math.floor(((i + 1) / totalParts) * 90));
  }

  // 3. Completar
  const completeRes = await fetch(`${workerUrl}/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, key: uploadKey, parts, token }),
  });
  if (!completeRes.ok) throw new Error(`Upload complete falhou: ${completeRes.status}`);
  const { fileUrl } = await completeRes.json();
  onProgress(100);
  return fileUrl;
}

// ─── Appwrite ──────────────────────────────────────────────────────────────────

async function renderTelemetryOverlay(req) {
  const {
    videoUrl,
    telemetryJson,
    widgets = [],
    cfWorkerUrl,
    cfWorkerToken,
    outputKey = `telemetry-export-${Date.now()}.mp4`,
    trimStartSec,
    trimEndSec,
    orientation = "horizontal",
  } = req;
  if (!videoUrl) throw new Error("videoUrl obrigatorio.");
  if (!cfWorkerUrl || !cfWorkerToken) throw new Error("Storage nao configurado.");

  const enabled = Array.isArray(widgets) ? widgets.filter((w) => ["altitude", "speed", "heading"].includes(w)) : [];
  if (enabled.length === 0) throw new Error("Selecione pelo menos altitude, velocidade ou rumo para exportar.");

  const parsed = typeof telemetryJson === "string" ? JSON.parse(telemetryJson || "{}") : telemetryJson;
  const points = normalizeTelemetryPoints(Array.isArray(parsed?.points) ? parsed.points : []);
  if (points.length < 2) throw new Error("Telemetria insuficiente para gerar overlay.");

  const ffmpeg = findBin("ffmpeg");
  if (!ffmpeg) throw new Error("ffmpeg nao encontrado.");
  const encoder = await detectEncoder(ffmpeg);

  const isVertical = orientation === "vertical";
  const tmpDir = path.join(os.tmpdir(), `flight-overlay-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const inputPath = path.join(tmpDir, "input.mp4");
  const assPath = path.join(tmpDir, "overlay.ass");
  const outputPath = path.join(tmpDir, "output.mp4");

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download do video falhou: ${response.status}`);
    fs.writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));
    fs.writeFileSync(assPath, buildTelemetryAss(points, enabled, isVertical), "utf8");

    // Input seeking rápido (antes de -i)
    const seekArgs = [];
    if (Number.isFinite(trimStartSec) && trimStartSec > 0) seekArgs.push("-ss", String(trimStartSec));

    // Duração de saída (relativa ao -ss se usado)
    const durationArgs = [];
    if (Number.isFinite(trimEndSec) && trimEndSec > 0) {
      const duration = Number.isFinite(trimStartSec) ? trimEndSec - trimStartSec : trimEndSec;
      if (duration > 0) durationArgs.push("-t", String(duration));
    }

    // Filtro de vídeo: [crop +] subtitles
    // Usa nomes relativos para evitar problemas com drive letter (C:) no Windows
    const cropPrefix = isVertical
      ? "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,"
      : "";
    const vf = `${cropPrefix}subtitles=overlay.ass`;

    await runFfmpeg(ffmpeg, [
      ...seekArgs,
      "-i", "input.mp4",
      ...durationArgs,
      "-vf", vf,
      ...encoderArgs(encoder),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-threads", "0",
      "-y", "output.mp4",
    ], 0, () => {}, { mustSucceed: true, cwd: tmpDir });

    const fileBytes = fs.readFileSync(outputPath);
    const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerToken, outputKey, fileBytes, () => {});
    return { ok: true, fileUrl, fileSize: fileBytes.length };
  } finally {
    cleanup(tmpDir);
  }
}

// Magic that identifies the JPEG-frames binary format sent by the browser: "JFRS"
const JFRS_MAGIC = 0x4a465253;

function extractJpegFrames(overlayBuffer, tmpDir) {
  const frameCount = overlayBuffer.readUInt32BE(4);
  let offset = 8;
  for (let i = 0; i < frameCount; i++) {
    const frameSize = overlayBuffer.readUInt32BE(offset);
    offset += 4;
    fs.writeFileSync(
      path.join(tmpDir, `frame_${String(i).padStart(6, "0")}.png`),
      overlayBuffer.slice(offset, offset + frameSize),
    );
    offset += frameSize;
  }
  return frameCount;
}

async function compositeOverlay(
  { videoUrl, cfWorkerUrl, cfWorkerToken, outputKey, trimStartSec, trimEndSec,
    orientation, fps, durationSec, overlayBuffer },
  job, jobId,
) {
  const ffmpeg = findBin("ffmpeg");
  if (!ffmpeg) throw new Error("ffmpeg não encontrado.");
  const encoder = await detectEncoder(ffmpeg);

  const isVertical = orientation === "vertical";
  const tmpDir = path.join(os.tmpdir(), `flight-composite-${jobId || Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    sendProgress(jobId, { stage: "process", percent: 2 });

    // Download source video
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download do vídeo falhou: ${response.status}`);
    fs.writeFileSync(path.join(tmpDir, "input.mp4"), Buffer.from(await response.arrayBuffer()));

    sendProgress(jobId, { stage: "process", percent: 12 });

    // Detect overlay format
    const isJpegFrames = overlayBuffer.length >= 8 &&
      overlayBuffer.readUInt32BE(0) === JFRS_MAGIC;

    let overlayInputArgs;
    if (isJpegFrames) {
      const frameCount = extractJpegFrames(overlayBuffer, tmpDir);
      console.log(`[${jobId}] JPEG frames extraídos: ${frameCount} @ ${fps}fps`);
      overlayInputArgs = ["-framerate", String(fps || 10), "-i", "frame_%06d.png"];
    } else {
      // Legacy WebM overlay
      fs.writeFileSync(path.join(tmpDir, "overlay.webm"), overlayBuffer);
      console.log(`[${jobId}] overlay WebM: ${overlayBuffer.length} bytes`);
      overlayInputArgs = ["-r", String(fps || 30), "-i", "overlay.webm"];
    }

    // Input seeking (fast seek before -i for source video)
    const seekArgs = [];
    if (Number.isFinite(trimStartSec) && trimStartSec > 0) seekArgs.push("-ss", String(trimStartSec));

    const durationArgs = [];
    if (Number.isFinite(trimEndSec) && trimEndSec > 0) {
      const dur = Number.isFinite(trimStartSec) && trimStartSec > 0 ? trimEndSec - trimStartSec : trimEndSec;
      if (dur > 0) durationArgs.push("-t", String(dur));
    }

    // filter_complex: chromakey overlay on top of scaled/cropped source.
    // Higher similarity/blend tolerances to handle JPEG compression artifacts on the green background.
    const baseFilter = isVertical
      ? `[1:v]crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,scale=608:1080[base]`
      : `[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[base]`;
    const filterComplex =
      `${baseFilter};[base][0:v]overlay=0:0,format=yuv420p[outv]`;

    const effectiveDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;

    await runFfmpeg(ffmpeg, [
      // Input 0: overlay (JPEG frames or WebM)
      ...overlayInputArgs,
      // Input 1: source video with optional seek
      ...seekArgs, "-i", "input.mp4",
      ...durationArgs,
      "-filter_complex", filterComplex,
      "-map", "[outv]", "-map", "1:a?",
      ...encoderArgs(encoder),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-threads", "0",
      "-y", "output.mp4",
    ], effectiveDuration, (pct) => {
      if (!job.cancelled) sendProgress(jobId, { stage: "process", percent: 12 + Math.round(pct * 0.73) });
    }, { mustSucceed: true, cwd: tmpDir });

    sendProgress(jobId, { stage: "upload", percent: 0 });

    const fileBytes = fs.readFileSync(path.join(tmpDir, "output.mp4"));
    const key = outputKey || `telemetry-export-${Date.now()}.mp4`;
    const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerToken, key, fileBytes, (pct) => {
      sendProgress(jobId, { stage: "upload", percent: pct });
    });

    return fileUrl;
  } finally {
    cleanup(tmpDir);
  }
}

function buildTelemetryAss(points, widgets, isVertical = false) {
  const endMs = Math.max(...points.map((p) => p.timeMs));
  const playResX = isVertical ? 608 : 1920;
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    "PlayResY: 1080",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Telemetry,Arial,44,&H00FFFFFF,&H00FFFFFF,&H90000000,&HAA000000,1,0,0,0,100,100,0,0,3,3,0,7,46,46,46,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (let t = 0; t <= endMs + 1000; t += 1000) {
    const p = pointAtTime(points, t);
    if (!p) continue;
    const text = formatOverlayText(p, widgets).replace(/\n/g, "\\N");
    lines.push(`Dialogue: 0,${assTime(t)},${assTime(t + 1000)},Telemetry,,0,0,0,,${text}`);
  }
  return lines.join("\n");
}

function pointAtTime(points, timeMs) {
  let best = points[0];
  for (const point of points) {
    if (point.timeMs > timeMs) break;
    best = point;
  }
  return best ?? null;
}

function formatOverlayText(point, widgets) {
  const rows = [];
  if (widgets.includes("speed") && Number.isFinite(point.speed)) rows.push(`VEL ${formatSpeedForOverlay(point.speed)}`);
  if (widgets.includes("altitude") && Number.isFinite(point.altitude)) rows.push(`ALT ${Math.round(point.altitude * 3.28084)} ft`);
  if (widgets.includes("heading") && Number.isFinite(point.heading)) rows.push(`HDG ${Math.round(point.heading)} deg`);
  return rows.join("\n") || "TELEMETRIA";
}

function formatSpeedForOverlay(speed) {
  return `${Math.round(speed * 1.94384)} kt`;
}

function assTime(ms) {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const secTotal = Math.floor(total / 100);
  const s = secTotal % 60;
  const minTotal = Math.floor(secTotal / 60);
  const m = minTotal % 60;
  const h = Math.floor(minTotal / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function updateAppwrite(endpoint, projectId, dbId, colId, docId, jwt, fileUrl, fileSize, durationSec, telemetry) {
  if (!jwt || !colId) return false;
  const url = `${endpoint}/databases/${dbId}/collections/${colId}/documents/${docId}`;
  const headers = {
    "X-Appwrite-Project": projectId,
    "X-Appwrite-JWT": jwt,
    "Content-Type": "application/json",
  };
  const baseData = { file_url: fileUrl, file_size: fileSize, duration_sec: durationSec, processing_status: "ready" };
  const fullRes = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      data: {
        ...baseData,
        telemetry_present: Boolean(telemetry?.telemetryPresent),
        telemetry_source: telemetry?.source ?? "none",
        telemetry_json: telemetry?.telemetryJson ?? "",
        available_widgets: JSON.stringify(telemetry?.availableWidgets ?? []),
      },
    }),
  });
  // #region agent log
  const fullBody = await fullRes.text().catch(() => "");
  agentDebugLog("helper.js:updateAppwrite", "full patch", {
    ok: fullRes.ok,
    status: fullRes.status,
    telemetryPresent: Boolean(telemetry?.telemetryPresent),
    telemetrySource: telemetry?.source ?? "none",
    telemetryJsonBytes: Buffer.byteLength(telemetry?.telemetryJson ?? "", "utf8"),
    hasJwt: Boolean(jwt),
    responseSnippet: fullBody.slice(0, 200),
  }, "D");
  // #endregion
  if (fullRes.ok) return true;
  const fallbackRes = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ data: baseData }),
  });
  // #region agent log
  agentDebugLog("helper.js:updateAppwrite", "fallback patch", {
    ok: fallbackRes.ok,
    status: fallbackRes.status,
  }, "D");
  // #endregion
  return fallbackRes.ok;
}

// ─── Utilitários ───────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
}

function pipe(readable, writable) {
  return new Promise((resolve, reject) => {
    readable.pipe(writable);
    writable.on("finish", resolve);
    writable.on("error", reject);
    readable.on("error", reject);
  });
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-À-ɏ]/g, "_");
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ─── Auto-start no Windows ─────────────────────────────────────────────────────

function registerAutoStart() {
  if (process.platform !== "win32") return;
  try {
    const startupDir = path.join(
      process.env.APPDATA,
      "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
    );
    const batPath = path.join(startupDir, "FlightVideoHelper.bat");
    if (fs.existsSync(batPath)) return; // já registrado

    const exePath = process.pkg ? process.execPath : `node "${path.resolve(__filename)}"`;
    const bat = `@echo off\nstart /min "" ${exePath}\n`;
    fs.writeFileSync(batPath, bat);
    console.log("✓ Auto-start registrado na pasta Startup do Windows.");
  } catch {}
}

// ─── CLI: testar telemetria em arquivo local ───────────────────────────────────

async function cliDetectTelemetry(videoPath) {
  const resolved = path.resolve(videoPath);
  if (!fs.existsSync(resolved)) {
    console.error("Arquivo não encontrado:", resolved);
    process.exit(1);
  }
  const ffmpeg = findBin("ffmpeg");
  const ffprobe = findBin("ffprobe");
  const tmpDir = path.join(os.tmpdir(), `flight-cli-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const telemetry = await detectVideoTelemetry(ffmpeg, ffprobe, [resolved], [], tmpDir);
    console.log(JSON.stringify({
      file: resolved,
      telemetry_present: telemetry.telemetryPresent,
      telemetry_source: telemetry.source,
      available_widgets: telemetry.availableWidgets,
      telemetry_json_bytes: Buffer.byteLength(telemetry.telemetryJson, "utf8"),
      point_count: (() => {
        try { return JSON.parse(telemetry.telemetryJson).points?.length ?? 0; } catch { return 0; }
      })(),
    }, null, 2));
  } finally {
    cleanup(tmpDir);
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────

const cliTelemetryArg = process.argv.indexOf("--detect-telemetry");
if (cliTelemetryArg >= 0) {
  const videoArg = process.argv[cliTelemetryArg + 1];
  if (!videoArg) {
    console.error("Uso: node helper.js --detect-telemetry \"C:\\caminho\\video.MP4\"");
    process.exit(1);
  }
  cliDetectTelemetry(videoArg).catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else server.listen(PORT, "127.0.0.1", () => {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     Flight Video Helper — rodando                ║");
  console.log(`║     http://127.0.0.1:${PORT}                       ║`);
  console.log("║     Deixe esta janela aberta.                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  registerAutoStart();
});

if (cliTelemetryArg < 0) server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já em uso. O helper já está rodando?`);
    process.exit(1);
  }
  throw e;
});
