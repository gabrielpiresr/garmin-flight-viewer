#!/usr/bin/env node
// Flight Video Helper — processa vídeos localmente e envia para R2
// Sem dependências externas. Requer Node.js 18+ e ffmpeg/ffprobe no PATH ou na mesma pasta.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { spawn, execSync } = require("child_process");

const PORT = Number(process.env.PORT || 7842);
const CHUNK_SIZE = 16 * 1024 * 1024;
const MEMORY_LIMIT_BYTES = Math.floor(os.totalmem() * 0.5);
const MAX_UPLOAD_RETRIES = 8;
// Watchdog de estol: se o ffmpeg ficar este tempo sem avançar o out_time (típico de
// encoder de hardware — QSV/NVENC/AMF — que estola no meio do arquivo), matamos o
// processo. Em etapas de recodificação isso dispara uma nova tentativa via CPU (libx264).
const FFMPEG_STALL_TIMEOUT_MS = Number(process.env.FFMPEG_STALL_TIMEOUT_MS || 90000);
// Folga de disco exigida ANTES de iniciar (múltiplo da soma dos arquivos de entrada).
// Transcode escreve joined + final + reescrita do faststart (pico ~2,5×); copy/remux
// reescrevem o final via faststart (~2,2×). Evita rodar 40 min para morrer em ENOSPC.
const DISK_HEADROOM_TRANSCODE = Number(process.env.DISK_HEADROOM_TRANSCODE || 2.5);
const DISK_HEADROOM_COPY = Number(process.env.DISK_HEADROOM_COPY || 2.2);
const HELPER_DIR = process.env.HELPER_RESOURCES
  || path.dirname(process.execPath.endsWith("node.exe") ? process.argv[1] : process.execPath);

// ─── Log persistente em arquivo ─────────────────────────────────────────────
// O app Electron descarta o stdout/stderr do helper (main.js), então espelhamos
// os logs num arquivo para permitir diagnosticar falhas (estol, disco cheio, etc.)
// depois que acontecem. Local: %LOCALAPPDATA%\Flight Video Helper\logs\helper.log.
const LOG_DIR = process.env.HELPER_LOG_DIR
  || (process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Flight Video Helper", "logs")
    : os.tmpdir());
const LOG_FILE = path.join(LOG_DIR, "helper.log");
const LOG_MAX_BYTES = 5 * 1024 * 1024;
function appendLog(level, args) {
  try {
    const parts = args.map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level}] ${parts.join(" ")}\n`);
  } catch {}
}
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, "helper.log.old"));
  }
} catch {}
for (const level of ["log", "warn", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { appendLog(level, args); orig(...args); };
}
process.on("uncaughtException", (err) => {
  appendLog("fatal", ["uncaughtException", err?.stack || err?.message || String(err)]);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  appendLog("error", ["unhandledRejection", reason?.stack || reason?.message || String(reason)]);
});

// #region agent log
const AGENT_DEBUG_ENDPOINT = "http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1";
const AGENT_DEBUG_SESSION = "673562";
function agentDebugLog() {}
// #endregion

// ─── Estado dos jobs ───────────────────────────────────────────────────────────

const jobs = new Map(); // jobId → { listeners: res[], buffer: string[], cancelled: bool, cancel: fn }

const pickFileRequests = new Map();
let activeJobId = null;
let detectedEncoderPromise = null;

function createJob(jobId) {
  const job = {
    id: jobId,
    listeners: [],
    buffer: [],
    cancelled: false,
    stage: "queued",
    percent: 0,
    message: null,
    result: null,
    strategy: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ffmpegPid: null,
    ffmpegProcess: null,
    lastAppwriteStage: "",
    lastAppwritePercent: -1,
    lastAppwriteAt: 0,
    appwritePatchChain: Promise.resolve(),
  };
  job.cancel = () => {
    job.cancelled = true;
    job.ffmpegProcess?.kill("SIGTERM");
  };
  jobs.set(jobId, job);
  return job;
}

function sendProgress(jobId, data) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.stage = data.stage ?? job.stage;
  job.percent = Number.isFinite(data.percent) ? data.percent : job.percent;
  job.message = data.message ?? null;
  job.strategy = data.strategy ?? job.strategy;
  job.updatedAt = new Date().toISOString();
  if (data.stage === "done") job.result = data;
  const line = `data: ${JSON.stringify(data)}\n\n`;
  job.buffer.push(line);
  if (job.buffer.length > 200) job.buffer.splice(0, job.buffer.length - 200);
  for (const res of job.listeners) {
    try { res.write(line); } catch {}
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    stage: job.stage,
    percent: job.percent,
    message: job.message,
    result: job.result,
    strategy: job.strategy,
    cancelled: job.cancelled,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

function pickFilesNative() {
  if (typeof process.send !== "function") {
    return Promise.reject(new Error("O seletor nativo requer o aplicativo Flight Video Helper."));
  }
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pickFileRequests.delete(requestId);
      reject(new Error("O seletor de arquivos nao respondeu."));
    }, 120000);
    pickFileRequests.set(requestId, { resolve, reject, timer });
    process.send({ type: "pick-files", requestId });
  });
}

process.on("message", (message) => {
  if (!message || message.type !== "pick-files-result") return;
  const pending = pickFileRequests.get(message.requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pickFileRequests.delete(message.requestId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(Array.isArray(message.paths) ? message.paths : []);
});

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
    return json(res, {
      ok: true,
      version: "1.6.0",
      activeJobId,
      memoryLimitBytes: MEMORY_LIMIT_BYTES,
      memoryUsedBytes: process.memoryUsage().rss,
    });
  }

  // GET /disks — volumes disponíveis + espaço livre, para o seletor de disco no app
  if (url === "/disks" && req.method === "GET") {
    return json(res, { ...listDisks(), lastWorkDir: readConfig().lastWorkDir || "" });
  }

  if (url === "/pick-files" && req.method === "POST") {
    try {
      const paths = await pickFilesNative();
      const files = paths
        .filter((filePath) => fs.existsSync(filePath))
        .map((filePath) => {
          const stat = fs.statSync(filePath);
          return {
            path: filePath,
            name: path.basename(filePath),
            size: stat.size,
            modifiedAtMs: stat.mtimeMs,
          };
        })
        .sort((a, b) => a.modifiedAtMs - b.modifiedAtMs || a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }));
      return json(res, { files });
    } catch (error) {
      return json(res, { error: error.message }, 500);
    }
  }

  if (url === "/analyze-files" && req.method === "POST") {
    let body;
    try { body = await readJson(req); } catch { return json(res, { error: "JSON invalido" }, 400); }
    try {
      return json(res, await analyzeVideoFiles(body, { estimateCpu: true }));
    } catch (error) {
      return json(res, { error: error.message }, 400);
    }
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

    if (activeJobId && !["done", "error"].includes(jobs.get(activeJobId)?.stage)) {
      return json(res, { error: "Ja existe um video sendo processado.", activeJobId }, 409);
    }
    let analysis;
    try {
      analysis = await analyzeVideoFiles(body, { estimateCpu: false });
    } catch (error) {
      return json(res, { error: error.message }, 400);
    }
    if (analysis.requiresTranscode && body.confirmTranscode !== true) {
      return json(res, {
        error: "A recodificacao exige confirmacao explicita.",
        code: "TRANSCODE_CONFIRMATION_REQUIRED",
        analysis,
      }, 409);
    }
    body.analysis = analysis;
    const job = createJob(body.jobId);
    activeJobId = body.jobId;
    json(res, { ok: true, jobId: body.jobId });

    setImmediate(() => runPipeline(body, job)
      .catch((error) => {
        sendProgress(body.jobId, { stage: "error", percent: 0, message: error.message });
      })
      .finally(() => {
        if (activeJobId === body.jobId) activeJobId = null;
      }));
    return;
  }

  // POST /upload-direct — envia um arquivo sem concat/ffmpeg
  if (url === "/upload-direct" && req.method === "POST") {
    let body;
    try { body = await readJson(req); } catch { return json(res, { error: "JSON inválido" }, 400); }

    if (activeJobId && !["done", "error"].includes(jobs.get(activeJobId)?.stage)) {
      return json(res, { error: "Ja existe um video sendo processado.", activeJobId }, 409);
    }
    if (!body?.jobId || !body?.filePath || !body?.cfWorkerUrl || !body?.cfWorkerToken || !body?.videoKey) {
      return json(res, { error: "Parametros obrigatorios ausentes para upload direto." }, 400);
    }

    const job = createJob(body.jobId);
    activeJobId = body.jobId;
    json(res, { ok: true, jobId: body.jobId });

    setImmediate(() => runDirectUploadPipeline(body, job)
      .catch((error) => {
        sendProgress(body.jobId, { stage: "error", percent: 0, message: error.message });
      })
      .finally(() => {
        if (activeJobId === body.jobId) activeJobId = null;
      }));
    return;
  }

  const jobMatch = url.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    const job = jobs.get(jobMatch[1]);
    return job ? json(res, { job: publicJob(job) }) : json(res, { error: "Job nao encontrado" }, 404);
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
            orientation, fps: fps || 30, durationSec, overlayBuffer,
            videoRotationDeg: params.videoRotationDeg,
            verticalCropPct: params.verticalCropPct,
            sourceVideoWidth: params.sourceVideoWidth,
            sourceVideoHeight: params.sourceVideoHeight },
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

    if (!job) {
      return json(res, { error: "Job nao encontrado" }, 404);
    }

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
    jobId, videoPaths, cfWorkerUrl, cfWorkerToken, videoKey,
    appwriteEndpoint, appwriteProjectId, appwriteDbId, videosColId,
    sessionJwt, flightVideoDocId, applyLogo = false, logoUrl = "",
    processingMode = "original",
  } = req;

  const fail = (msg) => {
    console.error(`[${jobId}] ERRO: ${msg}`);
    sendProgress(jobId, { stage: "error", percent: 0, message: msg });
    void patchAppwriteProgress(req, "error", 0, msg).catch(() => {});
  };

  const progress = (stage, percent, extra = {}) => {
    sendProgress(jobId, { stage, percent, strategy: req.analysis?.strategy, ...extra });
    const rounded = Math.max(0, Math.min(100, Math.round(percent || 0)));
    const now = Date.now();
    const shouldPersist = stage !== job.lastAppwriteStage
      || rounded >= job.lastAppwritePercent + 5
      || now - job.lastAppwriteAt >= 10000
      || stage === "done";
    if (shouldPersist) {
      job.lastAppwriteStage = stage;
      job.lastAppwritePercent = rounded;
      job.lastAppwriteAt = now;
      job.appwritePatchChain = job.appwritePatchChain
        .catch(() => {})
        .then(() => patchAppwriteProgress(req, stage, rounded, ""));
    }
  };

  // Localizar ffmpeg
  const ffmpeg = findBin("ffmpeg");
  const ffprobe = findBin("ffprobe");
  if (!ffmpeg) return fail("ffmpeg não encontrado. Coloque ffmpeg.exe na mesma pasta do helper.js ou instale no PATH.");

  const analysis = req.analysis || await analyzeVideoFiles(req, { estimateCpu: false });
  req.analysis = analysis;
  const encoder = analysis.encoder;
  console.log(`[${jobId}] Encoder selecionado: ${encoder}`);

  const workBase = resolveWorkDir(req.workDir);
  if (path.resolve(workBase) !== path.resolve(os.tmpdir())) {
    writeConfig({ lastWorkDir: workBase });
    console.log(`[${jobId}] Disco de trabalho: ${workBase}`);
  }
  const tmpDir = path.join(workBase, `flight-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const selectedFiles = Array.isArray(videoPaths) ? videoPaths.map((item) => path.resolve(String(item))) : [];
  const videoFiles = selectedFiles.filter((file) => isVideoFile(file));
  const sidecarFiles = selectedFiles.filter((file) => isSrtFile(file));

  for (const f of videoFiles) {
    if (!fs.existsSync(f)) return fail(`Arquivo não encontrado no servidor: ${f}`);
  }

  if (videoFiles.length === 0) return fail("Selecione pelo menos um arquivo de video.");

  const joinedPath = path.join(tmpDir, "joined.mp4");
  const finalPath = path.join(tmpDir, "final.mp4");
  let uploadPath = finalPath;

  // Duração total para calcular progresso
  const totalDuration = ffprobe ? await getTotalDuration(ffprobe, videoFiles) : 0;

  // ── Checagem de espaço em disco (antes de gastar 40 min para morrer em ENOSPC) ──
  // Estratégia "direct" envia o original sem escrever no temp → não precisa de folga.
  if (analysis.strategy !== "direct") {
    const inputBytes = videoFiles.reduce((sum, f) => {
      try { return sum + fs.statSync(f).size; } catch { return sum; }
    }, 0);
    const factor = analysis.strategy === "transcode" ? DISK_HEADROOM_TRANSCODE : DISK_HEADROOM_COPY;
    const requiredBytes = Math.round(inputBytes * factor);
    const freeBytes = await getFreeDiskBytes(workBase);
    const gb = (b) => (b / 1e9).toFixed(1);
    console.log(`[${jobId}] Disco ${workBase} (${analysis.strategy}): precisa ~${gb(requiredBytes)} GB, livre ${freeBytes == null ? "?" : gb(freeBytes)} GB (fator ${factor}).`);
    if (freeBytes != null && freeBytes < requiredBytes) {
      return fail(
        `Espaco em disco insuficiente para processar este voo. ` +
        `Necessario ~${gb(requiredBytes)} GB livres no disco de trabalho (${workBase}), disponivel ${gb(freeBytes)} GB. ` +
        `Escolha outro disco no seletor ou libere espaco e tente novamente.`
      );
    }
  }

  try {
    // ── Stage 1: Concat ──────────────────────────────────────────────────────
    progress("telemetry-detect", 0);
    const telemetry = await detectVideoTelemetry(ffmpeg, ffprobe, videoFiles, sidecarFiles, tmpDir);
    progress("telemetry-detect", 100, {
      telemetry_present: telemetry.telemetryPresent,
      telemetry_source: telemetry.source,
      available_widgets: telemetry.availableWidgets,
    });

    if (job.cancelled) return fail("Cancelado");
    progress(analysis.strategy, 0, {
      strategy: analysis.strategy,
      encoder,
      message: analysis.reason,
    });

    // ── Stage 2: Watermark + Compress (passo único) ─────────────────────────
    if (analysis.strategy === "direct") {
      uploadPath = videoFiles[0];
      progress("direct", 100, { strategy: "direct" });
    } else if (analysis.strategy === "remux") {
      await remuxVideo(ffmpeg, videoFiles[0], finalPath, totalDuration, (pct) => {
        if (!job.cancelled) progress("remux", pct, { strategy: "remux" });
      }, job);
    } else if (analysis.strategy === "concat-copy") {
      await concatVideosCopy(ffmpeg, videoFiles, finalPath, totalDuration, (pct) => {
        if (!job.cancelled) progress("concat-copy", pct, { strategy: "concat-copy" });
      }, job);
    } else {
      const watermarkPath = applyLogo ? await prepareWatermark(logoUrl, tmpDir) : null;
      let transcodeInput = videoFiles[0];
      if (videoFiles.length > 1) {
        const concatResult = await concatVideos(ffmpeg, ffprobe, encoder, videoFiles, joinedPath, totalDuration, (pct) => {
          if (!job.cancelled) progress("transcode", Math.round(pct * 0.45), { strategy: "transcode" });
        }, job);
        transcodeInput = joinedPath;
        if (concatResult.transcoded && !applyLogo && ["fast", "original"].includes(processingMode)) {
          uploadPath = joinedPath;
          transcodeInput = null;
        }
      }
      if (transcodeInput) {
        await applyWatermarkAndCompress(ffmpeg, encoder, transcodeInput, watermarkPath, finalPath, totalDuration, (pct) => {
          if (!job.cancelled) progress("transcode", videoFiles.length > 1 ? 45 + Math.round(pct * 0.55) : pct, {
            strategy: "transcode",
          });
        }, job);
      }
    }

    if (job.cancelled) return fail("Cancelado");

    // ── Stage 4: Upload multipart ────────────────────────────────────────────
    progress("upload", 0);
    const fileSize = fs.statSync(uploadPath).size;

    const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerToken, videoKey, uploadPath, (pct) => {
      progress("upload", pct);
    });

    // Duração do arquivo final
    const finalDuration = ffprobe ? (await probeDuration(ffprobe, uploadPath)) ?? totalDuration : totalDuration;

    // Atualizar Appwrite
    await job.appwritePatchChain.catch(() => {});
    const appwriteOk = await updateAppwrite(appwriteEndpoint, appwriteProjectId, appwriteDbId, videosColId,
      flightVideoDocId, sessionJwt, fileUrl, fileSize, finalDuration, telemetry);
    if (!appwriteOk) {
      console.warn(`[${jobId}] Appwrite não atualizado — o browser deve finalizar via SDK`);
    }

    // Limpar temporários
    cleanup(tmpDir);

    sendProgress(jobId, {
      stage: "done",
      percent: 100,
      file_url: fileUrl,
      file_size: fileSize,
      duration_sec: finalDuration,
      telemetry_present: telemetry.telemetryPresent,
      telemetry_source: telemetry.source,
      available_widgets: telemetry.availableWidgets,
      telemetry_json: telemetry.telemetryJson,
      strategy: analysis.strategy,
    });
    console.log(`[${jobId}] Concluído: ${fileUrl}`);

  } catch (e) {
    fail(e.message);
    cleanup(tmpDir);
  }
}

async function runDirectUploadPipeline(req, job) {
  const {
    jobId,
    filePath,
    cfWorkerUrl,
    cfWorkerToken,
    videoKey,
  } = req;

  const ffprobe = findBin("ffprobe");
  const resolvedPath = path.resolve(String(filePath || ""));
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    sendProgress(jobId, { stage: "error", percent: 0, message: "Arquivo nao encontrado para upload direto." });
    return;
  }
  if (!isVideoFile(resolvedPath)) {
    sendProgress(jobId, { stage: "error", percent: 0, message: "O upload direto aceita apenas arquivos de video." });
    return;
  }

  sendProgress(jobId, { stage: "upload", percent: 0, strategy: "direct" });
  const fileSize = fs.statSync(resolvedPath).size;
  const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerToken, videoKey, resolvedPath, (pct) => {
    if (!job.cancelled) sendProgress(jobId, { stage: "upload", percent: pct, strategy: "direct" });
  });
  if (job.cancelled) {
    sendProgress(jobId, { stage: "error", percent: 0, message: "Cancelado" });
    return;
  }

  const durationSec = ffprobe ? (await probeDuration(ffprobe, resolvedPath)) ?? null : null;
  sendProgress(jobId, {
    stage: "done",
    percent: 100,
    strategy: "direct",
    file_url: fileUrl,
    file_size: fileSize,
    duration_sec: durationSec,
    telemetry_present: false,
    telemetry_source: "none",
    available_widgets: [],
    telemetry_json: "",
  });
}

// ─── FFmpeg helpers ────────────────────────────────────────────────────────────

async function prepareWatermark(logoUrl, tmpDir) {
  const fallback = path.join(HELPER_DIR, "watermark.png");
  if (!logoUrl) {
    if (fs.existsSync(fallback)) return fallback;
    throw new Error("A escola nao possui logo configurada.");
  }
  const output = path.join(tmpDir, "school-logo.png");
  if (String(logoUrl).startsWith("data:image/")) {
    const comma = String(logoUrl).indexOf(",");
    if (comma < 0) throw new Error("Logo da escola invalida.");
    fs.writeFileSync(output, Buffer.from(String(logoUrl).slice(comma + 1), "base64"));
    return output;
  }
  const response = await retryRequest(() => fetch(logoUrl), "download da logo");
  if (!response.ok) throw new Error(`Download da logo falhou: ${response.status}`);
  const file = fs.createWriteStream(output);
  await pipe(Readable.fromWeb(response.body), file);
  return output;
}

async function patchAppwriteProgress(req, stage, percent, errorMessage) {
  const {
    appwriteEndpoint,
    appwriteProjectId,
    appwriteDbId,
    videosColId,
    flightVideoDocId,
    sessionJwt,
    applyLogo,
    videoKey,
  } = req;
  if (!sessionJwt || !videosColId || !flightVideoDocId) return false;
  const url = `${appwriteEndpoint}/databases/${appwriteDbId}/collections/${videosColId}/documents/${flightVideoDocId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "X-Appwrite-Project": appwriteProjectId,
      "X-Appwrite-JWT": sessionJwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        apply_logo: Boolean(applyLogo),
        video_key: videoKey || "",
        processing_stage: stage,
        processing_percent: Math.max(0, Math.min(100, Math.round(percent || 0))),
        processing_error: String(errorMessage || "").slice(0, 2048),
        processing_updated_at: new Date().toISOString(),
        processing_status: stage === "error" ? "failed" : stage === "upload" ? "uploading" : stage === "done" ? "ready" : "processing",
      },
    }),
  });
  return response.ok;
}

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

async function analyzeVideoFiles(req, { estimateCpu = true } = {}) {
  const selected = Array.isArray(req.videoPaths) ? req.videoPaths.map((item) => path.resolve(String(item))) : [];
  const videoFiles = selected.filter(isVideoFile);
  if (videoFiles.length === 0) throw new Error("Selecione pelo menos um arquivo de video.");
  for (const file of videoFiles) {
    if (!fs.existsSync(file)) throw new Error(`Arquivo nao encontrado: ${file}`);
  }

  const ffmpeg = findBin("ffmpeg");
  const ffprobe = findBin("ffprobe");
  if (!ffmpeg || !ffprobe) throw new Error("FFmpeg/FFprobe nao encontrado no helper.");

  const files = [];
  for (const file of videoFiles) files.push(await probeMediaInfo(ffprobe, file));
  const encoder = await detectEncoder(ffmpeg);
  const processingMode = normalizeProcessingMode(req.processingMode);
  const applyLogo = req.applyLogo === true;
  const compatibleStreams = files.every(isFastMp4Compatible);
  const compatibleConcat = compatibleStreams && files.every((item) => streamSignature(item) === streamSignature(files[0]));
  const copyCompatibleStreams = files.every(isMp4CopyCompatible);
  const copyCompatibleConcat = copyCompatibleStreams
    && files.every((item) => streamSignature(item) === streamSignature(files[0]));

  let strategy;
  let reason;
  let outputExtension = ".mp4";
  if (applyLogo) {
    strategy = "transcode";
    reason = "Aplicar a logo exige recodificar o video.";
  } else if (processingMode === "compressed") {
    strategy = "transcode";
    reason = "A compactacao foi solicitada.";
  } else if (processingMode === "original" && files.length === 1 && files[0].extension === ".mp4") {
    strategy = "direct";
    reason = "O arquivo original sera enviado sem recodificacao.";
  } else if (processingMode === "original" && files.length === 1 && copyCompatibleStreams) {
    strategy = "remux";
    reason = "Os codecs originais serao preservados e apenas o conteiner sera ajustado para MP4.";
  } else if (processingMode === "original" && files.length > 1 && copyCompatibleConcat) {
    strategy = "concat-copy";
    reason = "Arquivos equivalentes: uniao rapida preservando os codecs originais.";
  } else if (processingMode === "compatible" && files.length === 1 && files[0].extension === ".mp4" && compatibleStreams) {
    strategy = "direct";
    reason = "MP4 H.264 compativel: envio direto, sem recodificacao.";
  } else if (processingMode === "compatible" && files.length === 1 && compatibleStreams) {
    strategy = "remux";
    reason = "Codec H.264 compativel: apenas troca do conteiner para MP4.";
  } else if (processingMode === "compatible" && files.length > 1 && compatibleConcat) {
    strategy = "concat-copy";
    reason = "Arquivos H.264 compativeis: uniao rapida sem recodificacao.";
  } else {
    strategy = "transcode";
    reason = processingMode === "compatible"
      ? "A conversao para H.264 foi escolhida para aumentar a compatibilidade de reproducao."
      : "Os arquivos possuem configuracoes diferentes e nao podem ser unidos sem recodificacao.";
  }

  const requiresTranscode = strategy === "transcode";
  const playback = assessPlaybackCompatibility(files, outputExtension, strategy);
  const totalDuration = files.reduce((sum, item) => sum + item.durationSec, 0);
  let estimatedSeconds = null;
  if (requiresTranscode && encoder === "libx264" && estimateCpu) {
    estimatedSeconds = await estimateCpuTranscodeSeconds(ffmpeg, videoFiles[0], files[0].durationSec, totalDuration);
  }

  return {
    strategy,
    requiresTranscode,
    encoder,
    hardwareAccelerated: encoder !== "libx264",
    reason,
    outputExtension,
    playbackRisk: playback.risk,
    playbackWarning: playback.warning,
    estimatedSeconds,
    totalDurationSec: totalDuration,
    files: files.map((item) => ({
      name: item.name,
      extension: item.extension,
      videoCodec: item.videoCodec,
      audioCodec: item.audioCodec,
      width: item.width,
      height: item.height,
      durationSec: item.durationSec,
    })),
  };
}

function normalizeProcessingMode(value) {
  if (value === "compressed") return "compressed";
  if (value === "compatible") return "compatible";
  return "original";
}

function probeMediaInfo(ffprobe, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channel_layout,channels",
      "-of", "json",
      file,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Nao foi possivel analisar ${path.basename(file)}: ${stderr.slice(-300)}`));
      try {
        const data = JSON.parse(stdout);
        const video = (data.streams || []).find((stream) => stream.codec_type === "video") || {};
        const audio = (data.streams || []).find((stream) => stream.codec_type === "audio") || null;
        resolve({
          path: file,
          name: path.basename(file),
          extension: path.extname(file).toLowerCase(),
          formatName: String(data.format?.format_name || ""),
          durationSec: Number(data.format?.duration || 0),
          videoCodec: String(video.codec_name || ""),
          audioCodec: audio ? String(audio.codec_name || "") : "",
          width: Number(video.width || 0),
          height: Number(video.height || 0),
          pixFmt: String(video.pix_fmt || ""),
          frameRate: String(video.r_frame_rate || ""),
          sampleRate: audio ? String(audio.sample_rate || "") : "",
          channelLayout: audio ? String(audio.channel_layout || audio.channels || "") : "",
        });
      } catch (error) {
        reject(new Error(`Resposta invalida do FFprobe para ${path.basename(file)}: ${error.message}`));
      }
    });
  });
}

function isFastMp4Compatible(info) {
  return info.videoCodec === "h264" && (!info.audioCodec || info.audioCodec === "aac" || info.audioCodec === "mp3");
}

function isMp4CopyCompatible(info) {
  const videoCodecs = new Set(["h264", "hevc", "av1", "mpeg4"]);
  const audioCodecs = new Set(["", "aac", "mp3", "ac3", "eac3", "alac"]);
  return videoCodecs.has(info.videoCodec) && audioCodecs.has(info.audioCodec);
}

function assessPlaybackCompatibility(files, outputExtension, strategy) {
  if (strategy === "transcode") {
    return { risk: "low", warning: "O resultado H.264 tem ampla compatibilidade com navegadores e dispositivos." };
  }
  const codecs = new Set(files.map((item) => item.videoCodec));
  const browserAudioCompatible = files.every((item) => !item.audioCodec || item.audioCodec === "aac" || item.audioCodec === "mp3");
  if (codecs.size === 1 && codecs.has("h264") && outputExtension === ".mp4" && browserAudioCompatible) {
    return { risk: "low", warning: "" };
  }
  if (codecs.size === 1 && codecs.has("hevc") && browserAudioCompatible) {
    return {
      risk: "medium",
      warning: "HEVC/H.265 pode nao reproduzir em alguns computadores Windows, Linux ou navegadores sem suporte ao codec.",
    };
  }
  if (codecs.size === 1 && codecs.has("av1") && browserAudioCompatible) {
    return {
      risk: "medium",
      warning: "AV1 pode exigir navegador e hardware recentes para reproducao fluida.",
    };
  }
  return {
    risk: "high",
    warning: "O formato original pode nao ser reproduzido diretamente por alguns navegadores. O download do arquivo continuara disponivel.",
  };
}

function streamSignature(info) {
  return [
    info.videoCodec,
    info.audioCodec,
    info.width,
    info.height,
    info.pixFmt,
    info.frameRate,
    info.sampleRate,
    info.channelLayout,
  ].join("|");
}

async function estimateCpuTranscodeSeconds(ffmpeg, file, fileDuration, totalDuration) {
  const sampleSeconds = Math.max(1, Math.min(8, Number(fileDuration) || 8));
  const startedAt = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(ffmpeg, [
      "-v", "error", "-i", file,
      "-t", String(sampleSeconds),
      "-map", "0:v:0", "-an",
      ...encoderArgs("libx264"),
      "-threads", String(ffmpegThreadLimit()),
      "-f", "null", "-",
    ], { stdio: "ignore", windowsHide: true });
    child.on("error", () => resolve(-1));
    child.on("close", resolve);
  });
  if (code !== 0) return null;
  const elapsedSeconds = Math.max(0.1, (Date.now() - startedAt) / 1000);
  return Math.max(1, Math.round((elapsedSeconds / sampleSeconds) * Math.max(totalDuration, sampleSeconds)));
}

async function detectEncoder(ffmpeg) {
  if (!detectedEncoderPromise) {
    detectedEncoderPromise = (async () => {
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
    })();
  }
  return detectedEncoderPromise;
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

async function remuxVideo(ffmpeg, input, output, totalDuration, onProgress, job = null) {
  await runFfmpeg(ffmpeg, [
    "-i", input,
    "-map", "0:v:0", "-map", "0:a?",
    "-c", "copy",
    "-movflags", "+faststart",
    "-y", "-progress", "pipe:2", "-nostats", output,
  ], totalDuration, onProgress, { mustSucceed: true, job });
}

async function concatVideosCopy(ffmpeg, files, output, totalDuration, onProgress, job = null) {
  const tmpList = output.replace(/\.mp4$/i, "_concat_list.txt");
  const lines = files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(tmpList, lines);
  await runFfmpeg(ffmpeg, [
    "-f", "concat", "-safe", "0", "-i", tmpList,
    "-map", "0:v:0", "-map", "0:a?",
    "-c", "copy",
    "-movflags", "+faststart",
    "-y", "-progress", "pipe:2", "-nostats", output,
  ], totalDuration, onProgress, { mustSucceed: true, job });
}

async function concatVideos(ffmpeg, ffprobe, encoder, files, output, totalDuration, onProgress, job = null) {
  const tmpList = output.replace("joined.mp4", "concat_list.txt");
  const lines = files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(tmpList, lines);

  // Tenta concat sem reencode primeiro
  let ok = false;
  try {
    ok = await runFfmpeg(ffmpeg, [
      "-f", "concat", "-safe", "0", "-i", tmpList,
      "-c", "copy", "-y", "-progress", "pipe:2", "-nostats", output,
    ], totalDuration, onProgress, { job });
  } catch (err) {
    if (job?.cancelled) throw err;
    ok = false; // copy travou/falhou → cai no reencode
  }

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

    const buildArgs = (enc) => [
      ...inputs, "-filter_complex", filter,
      "-map", "[outv]", "-map", "[outa]",
      ...encoderArgs(enc),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-threads", String(ffmpegThreadLimit()),
      "-y", "-progress", "pipe:2", "-nostats", output,
    ];
    await runEncodeWithFallback(ffmpeg, encoder, buildArgs, totalDuration, onProgress, { job, output });
    return { transcoded: true };
  }
  return { transcoded: false };
}

async function applyWatermarkAndCompress(ffmpeg, encoder, input, watermark, output, duration, onProgress, job = null) {
  const hasWatermark = Boolean(watermark && fs.existsSync(watermark));
  const filterArgs = hasWatermark
    ? [
        "-i", input, "-i", watermark,
        // Logo reduzida à metade (iw/2 x ih/2) antes do overlay no canto inferior direito.
        "-filter_complex", "[1:v]scale=iw/2:ih/2[wm];[0:v][wm]overlay=W-w-20:H-h-20,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[outv]",
        "-map", "[outv]", "-map", "0:a",
      ]
    : [
        "-i", input,
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      ];

  const buildArgs = (enc) => [
    ...filterArgs,
    ...encoderArgs(enc),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-threads", String(ffmpegThreadLimit()),
    "-y", "-progress", "pipe:2", "-nostats", output,
  ];
  await runEncodeWithFallback(ffmpeg, encoder, buildArgs, duration, onProgress, { job, output });
}

function ffmpegThreadLimit() {
  // Usa quase todos os núcleos (reserva alguns p/ o sistema) — antes era metade, o que
  // estrangulava principalmente o fallback por CPU (libx264). Continua limitado pela
  // memória disponível. Ajustável por FFMPEG_RESERVE_CORES / FFMPEG_MAX_THREADS.
  const reserve = Number(process.env.FFMPEG_RESERVE_CORES || 1);
  const cpuLimit = Math.max(1, os.cpus().length - reserve);
  const memoryLimit = Math.max(1, Math.floor(MEMORY_LIMIT_BYTES / (768 * 1024 * 1024)));
  const cap = Number(process.env.FFMPEG_MAX_THREADS || 16);
  return Math.min(cpuLimit, memoryLimit, cap);
}

function queryWindowsProcessRss(pid) {
  if (process.platform !== "win32" || !pid) return Promise.resolve(0);
  return new Promise((resolve) => {
    const child = spawn("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("close", () => {
      const match = output.match(/"([\d.,]+)\s+K"/i);
      const kb = match ? Number(match[1].replace(/[.,]/g, "")) : 0;
      resolve(Number.isFinite(kb) ? kb * 1024 : 0);
    });
    child.on("error", () => resolve(0));
  });
}

function runFfmpeg(ffmpeg, args, totalDuration, onProgress, { mustSucceed = false, cwd, job = null, stallTimeoutMs = FFMPEG_STALL_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], ...(cwd ? { cwd } : {}) });
    if (job) {
      job.ffmpegPid = p.pid;
      job.ffmpegProcess = p;
    }
    let stderr = "";
    let memoryExceeded = false;
    let stalled = false;
    let reachedEnd = false;
    let lastOutTimeUs = -1;
    let lastAdvanceAt = Date.now();
    const watchTimer = setInterval(async () => {
      // Watchdog de estol: out_time parado tempo demais → encoder travou (comum no QSV/NVENC).
      // Depois de "progress=end" o encode terminou e o ffmpeg está reescrevendo o arquivo
      // para o -movflags +faststart (out_time fica parado por minutos em arquivos grandes):
      // NÃO é estol, então não matamos — só o watchdog de memória segue ativo.
      if (!reachedEnd && stallTimeoutMs > 0 && Date.now() - lastAdvanceAt > stallTimeoutMs) {
        stalled = true;
        p.kill("SIGTERM");
        return;
      }
      // Watchdog de memória.
      const ffmpegRss = await queryWindowsProcessRss(p.pid);
      const used = process.memoryUsage().rss + ffmpegRss;
      if (used > MEMORY_LIMIT_BYTES) {
        memoryExceeded = true;
        p.kill("SIGTERM");
      }
    }, 2000);

    p.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.includes("progress=end")) reachedEnd = true;
        const m = line.match(/out_time_us=(\d+)/);
        if (m && totalDuration > 0) {
          const us = parseInt(m[1]);
          if (us > lastOutTimeUs) {
            lastOutTimeUs = us;
            lastAdvanceAt = Date.now();
          }
          const pct = Math.min(99, Math.floor((us / 1e6 / totalDuration) * 100));
          onProgress(pct);
        }
      }
    });

    p.on("close", (code) => {
      clearInterval(watchTimer);
      if (job) {
        job.ffmpegPid = null;
        job.ffmpegProcess = null;
      }
      if (job?.cancelled) {
        reject(new Error("Cancelado"));
        return;
      }
      if (stalled) {
        const err = new Error(`ffmpeg travou: sem progresso por ${Math.round(stallTimeoutMs / 1000)}s (encoder pode ter estolado).`);
        err.stalled = true;
        reject(err);
        return;
      }
      if (memoryExceeded) {
        reject(new Error("Processamento interrompido antes de ultrapassar 50% da memoria do computador."));
        return;
      }
      if (mustSucceed && code !== 0) {
        const err = new Error(`ffmpeg saiu com código ${code}:\n${stderr.slice(-500)}`);
        err.ffmpegExitCode = code;
        reject(err);
      } else {
        resolve(code === 0);
      }
    });
  });
}

// errno (negativos) em que refazer no libx264 NÃO ajuda — o problema é disco/IO/memória,
// não o encoder. Refazer por CPU só desperdiça tempo e bate no mesmo erro.
const FFMPEG_NON_RETRYABLE_ERRNO = new Set([-28 /*ENOSPC: disco cheio*/, -12 /*ENOMEM*/, -5 /*EIO*/]);

function ffmpegSignedExit(code) {
  if (typeof code !== "number") return null;
  // No Windows o código vem como uint32 (ex.: -28 chega como 4294967268).
  return code > 0x7fffffff ? code - 0x100000000 : code;
}

// Recodifica tentando o encoder de hardware; se ele ESTOLAR (watchdog) ou falhar por
// motivo que a CPU resolveria, repete UMA vez via libx264. Erros de disco/IO/memória
// NÃO são refeitos (viram mensagem clara). buildArgs(enc) monta os args para o encoder.
async function runEncodeWithFallback(ffmpeg, encoder, buildArgs, totalDuration, onProgress, { job = null, output = null } = {}) {
  try {
    return await runFfmpeg(ffmpeg, buildArgs(encoder), totalDuration, onProgress, { mustSucceed: true, job });
  } catch (err) {
    if (job?.cancelled) throw err;
    const signed = ffmpegSignedExit(err?.ffmpegExitCode);
    // Disco cheio: não adianta refazer em lugar nenhum — devolve mensagem amigável.
    if (signed === -28 || /No space left on device/i.test(err?.message || "")) {
      const e = new Error("Sem espaço em disco para finalizar o vídeo (ffmpeg ENOSPC). Libere espaço no drive temporário e tente de novo.");
      e.diskFull = true;
      throw e;
    }
    const isHardware = encoder && encoder !== "libx264";
    const nonRetryable = signed != null && FFMPEG_NON_RETRYABLE_ERRNO.has(signed);
    // Só refaz via CPU quando faz sentido: estol do encoder de HW, ou falha de HW que
    // não seja disco/IO/memória.
    if (!isHardware || (nonRetryable && !err?.stalled)) throw err;
    const motivo = err?.stalled ? "estolou" : `falhou (código ${signed ?? err?.ffmpegExitCode ?? "?"})`;
    console.warn(`[${job?.id ?? "job"}] Encoder ${encoder} ${motivo} — repetindo via CPU (libx264).`);
    if (output) { try { if (fs.existsSync(output)) fs.unlinkSync(output); } catch {} }
    onProgress(0); // reinicia a barra para a passada por CPU
    return await runFfmpeg(ffmpeg, buildArgs("libx264"), totalDuration, onProgress, { mustSucceed: true, job });
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryRequest(factory, label, retries = MAX_UPLOAD_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await factory();
      if (response.ok || (response.status < 500 && response.status !== 408 && response.status !== 429)) {
        return response;
      }
      lastError = new Error(`${label} retornou ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      const delay = Math.min(30000, 1000 * (2 ** attempt)) + Math.floor(Math.random() * 500);
      await sleep(delay);
    }
  }
  throw lastError || new Error(`${label} falhou`);
}

async function uploadMultipart(workerUrl, token, key, source, onProgress) {
  const isPath = typeof source === "string";
  const totalBytes = isPath ? fs.statSync(source).size : source.length;
  const fileHandle = isPath ? await fs.promises.open(source, "r") : null;

  const initRes = await retryRequest(() => fetch(`${workerUrl}/upload/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, token }),
  }), "inicio do upload");
  if (!initRes.ok) throw new Error(`Upload initiate falhou: ${initRes.status}`);
  const { uploadId, key: uploadKey } = await initRes.json();

  const totalParts = Math.ceil(totalBytes / CHUNK_SIZE);
  const parts = [];

  try {
    for (let i = 0; i < totalParts; i++) {
      const offset = i * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, totalBytes - offset);
      let chunk;
      if (fileHandle) {
        chunk = Buffer.allocUnsafe(length);
        const { bytesRead } = await fileHandle.read(chunk, 0, length, offset);
        if (bytesRead !== length) throw new Error(`Leitura incompleta da parte ${i + 1}`);
      } else {
        chunk = source.subarray(offset, offset + length);
      }
      const partRes = await retryRequest(() => fetch(`${workerUrl}/upload/part`, {
        method: "PUT",
        headers: {
          "x-upload-id": uploadId,
          "x-upload-key": uploadKey,
          "x-part-number": String(i + 1),
          "x-token": token,
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      }), `parte ${i + 1}`);
      if (!partRes.ok) throw new Error(`Parte ${i + 1} falhou: ${partRes.status}`);
      parts.push(await partRes.json());
      onProgress(Math.floor(((i + 1) / totalParts) * 90));
    }
  } finally {
    await fileHandle?.close();
  }

  const completeRes = await retryRequest(() => fetch(`${workerUrl}/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, key: uploadKey, parts, token }),
  }), "conclusao do upload");
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
      "-threads", String(ffmpegThreadLimit()),
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

function rotationFilterPrefix(deg) {
  const d = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
  if (d === 90) return "transpose=1,";
  if (d === 270) return "transpose=2,";
  if (d === 180) return "transpose=1,transpose=1,";
  return "";
}

/** Mesma lógica do preview (contain no 16:9, cover no 9:16). */
function computeVideoStageSize(
  parentWidth,
  parentHeight,
  videoWidth,
  videoHeight,
  rotationDeg,
  fit,
) {
  if (parentWidth <= 0 || parentHeight <= 0) return { width: 0, height: 0 };
  if (fit === "cover") {
    return { width: Math.floor(parentWidth), height: Math.floor(parentHeight) };
  }
  if (!videoWidth || !videoHeight) {
    return { width: Math.floor(parentWidth), height: Math.floor(parentHeight) };
  }
  const rot = ((Math.round(Number(rotationDeg) || 0) % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const srcW = swapped ? videoHeight : videoWidth;
  const srcH = swapped ? videoWidth : videoHeight;
  const scale = Math.min(parentWidth / srcW, parentHeight / srcH);
  return {
    width: Math.max(1, Math.floor(srcW * scale)),
    height: Math.max(1, Math.floor(srcH * scale)),
  };
}

function buildVideoBaseFilter({
  isVertical,
  verticalCropPct,
  videoRotationDeg,
  sourceVideoWidth,
  sourceVideoHeight,
}) {
  const rotPrefix = rotationFilterPrefix(videoRotationDeg);
  const outW = isVertical ? 608 : 1920;
  const outH = 1080;

  if (isVertical) {
    const pct = Math.max(0, Math.min(100, Number(verticalCropPct) || 50)) / 100;
    const cropW = "trunc(ih*9/16/2)*2";
    const cropX = `(iw-${cropW})*${pct}`;
    return `[1:v]${rotPrefix}crop=${cropW}:ih:${cropX}:0,scale=${outW}:${outH}[base]`;
  }

  const vw = Number(sourceVideoWidth) || 0;
  const vh = Number(sourceVideoHeight) || 0;
  if (vw > 0 && vh > 0) {
    const stage = computeVideoStageSize(outW, outH, vw, vh, videoRotationDeg, "contain");
    const padX = Math.max(0, Math.floor((outW - stage.width) / 2));
    const padY = Math.max(0, Math.floor((outH - stage.height) / 2));
    return `[1:v]${rotPrefix}scale=${stage.width}:${stage.height},pad=${outW}:${outH}:${padX}:${padY}[base]`;
  }

  return `[1:v]${rotPrefix}scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2[base]`;
}

async function compositeOverlay(
  { videoUrl, cfWorkerUrl, cfWorkerToken, outputKey, trimStartSec, trimEndSec,
    orientation, fps, durationSec, overlayBuffer, videoRotationDeg,
    verticalCropPct, sourceVideoWidth, sourceVideoHeight },
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

    // Download source video — streaming para disco (vídeos de vários GB não
    // cabem num ArrayBuffer) com progresso mapeado em 2%→12%.
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download do vídeo falhou: ${response.status}`);
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    const inputStream = fs.createWriteStream(path.join(tmpDir, "input.mp4"));
    let receivedBytes = 0;
    let lastDownloadPct = 2;
    for await (const chunk of Readable.fromWeb(response.body)) {
      receivedBytes += chunk.length;
      if (!inputStream.write(chunk)) {
        await new Promise((resolve) => inputStream.once("drain", resolve));
      }
      if (totalBytes > 0) {
        const pct = 2 + Math.min(10, Math.floor((receivedBytes / totalBytes) * 10));
        if (pct !== lastDownloadPct) {
          lastDownloadPct = pct;
          sendProgress(jobId, { stage: "process", percent: pct });
        }
      }
    }
    await new Promise((resolve, reject) => inputStream.end((err) => (err ? reject(err) : resolve())));

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

    const baseFilter = buildVideoBaseFilter({
      isVertical,
      verticalCropPct,
      videoRotationDeg,
      sourceVideoWidth,
      sourceVideoHeight,
    });
    const filterComplex = `${baseFilter};[base][0:v]overlay=0:0,format=yuv420p[outv]`;

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
      "-threads", String(ffmpegThreadLimit()),
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
  const baseData = {
    file_url: fileUrl,
    file_size: fileSize,
    duration_sec: durationSec,
    processing_status: "ready",
    processing_stage: "done",
    processing_percent: 100,
    processing_error: "",
    processing_updated_at: new Date().toISOString(),
  };
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

// ─── Espaço em disco ─────────────────────────────────────────────────────────

// Bytes livres no volume que contém `dir`. Usa fs.statfs (Node 18.15+/Electron 25+);
// se indisponível, tenta o Windows (PowerShell/wmic). Retorna null se não conseguir
// medir — nesse caso o chamador NÃO bloqueia (nunca falha por não saber o espaço).
async function getFreeDiskBytes(dir) {
  try {
    if (typeof fs.statfs === "function") {
      const st = await new Promise((resolve, reject) =>
        fs.statfs(dir, (err, stats) => (err ? reject(err) : resolve(stats))));
      const free = Number(st.bavail) * Number(st.bsize);
      if (Number.isFinite(free) && free > 0) return free;
    }
  } catch {}
  if (process.platform === "win32") {
    const drive = path.parse(path.resolve(dir)).root.replace(/[\\/]+$/, "");
    try {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-PSDrive ${drive.replace(/:$/, "")}).Free"`,
        { windowsHide: true, timeout: 8000 },
      ).toString().trim();
      const free = Number(out);
      if (Number.isFinite(free) && free > 0) return free;
    } catch {}
    try {
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`,
        { windowsHide: true, timeout: 8000 },
      ).toString();
      const m = out.match(/FreeSpace=(\d+)/);
      if (m) return Number(m[1]);
    } catch {}
  }
  return null;
}

// ─── Config persistente + disco de trabalho ─────────────────────────────────

const CONFIG_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Flight Video Helper")
  : os.tmpdir();
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}
function writeConfig(patch) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), ...patch }));
  } catch {}
}

// Lista os volumes fixos/removíveis do Windows (para o seletor de disco no app).
// tempDrive = a letra onde fica o %TEMP% (o padrão do sistema).
function listDisks() {
  const tempDrive = path.parse(os.tmpdir()).root.replace(/[\\/]+$/, "");
  let disks = [];
  if (process.platform === "win32") {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' | Select-Object DeviceID,VolumeName,FreeSpace,Size | ConvertTo-Json -Compress"`,
        { windowsHide: true, timeout: 8000 },
      ).toString().trim();
      if (out) {
        let data = JSON.parse(out);
        if (!Array.isArray(data)) data = [data];
        disks = data
          .map((d) => ({
            deviceId: String(d.DeviceID || "").replace(/[\\/]+$/, ""),
            label: String(d.VolumeName || ""),
            freeBytes: Number(d.FreeSpace) || 0,
            totalBytes: Number(d.Size) || 0,
          }))
          .filter((d) => /^[A-Za-z]:$/.test(d.deviceId));
      }
    } catch (e) {
      console.warn(`[disks] falha ao listar volumes: ${e.message}`);
    }
  }
  return { tempDrive, disks };
}

// Resolve o diretório de trabalho pedido pelo app. String vazia → padrão do sistema
// (%TEMP%). Se o caminho não existir/não for gravável, cai no padrão com aviso (nunca
// deixa um voo travar por causa de um disco mal configurado).
function resolveWorkDir(requested) {
  const wanted = typeof requested === "string" ? requested.trim() : "";
  if (!wanted) return os.tmpdir();
  try {
    const dir = path.resolve(wanted);
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return dir;
  } catch (e) {
    console.warn(`[workdir] nao foi possivel usar "${wanted}" (${e.message}) — usando o disco padrao.`);
    return os.tmpdir();
  }
}

// ─── Limpeza de temp órfão ──────────────────────────────────────────────────────

function dirSizeBytes(dir) {
  let total = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    try {
      if (ent.isDirectory()) total += dirSizeBytes(p);
      else total += fs.statSync(p).size;
    } catch {}
  }
  return total;
}

// Na inicialização não há job ativo, então qualquer pasta flight-* no %TEMP% é lixo de
// jobs anteriores que morreram sem limpar (ex.: um estol deixou ~26 GB presos). Remove as
// pastas com mais de 5 min (evita mexer em algo recém-criado por segurança).
function sweepOrphanTempDirs(base = os.tmpdir()) {
  let removed = 0, freed = 0;
  try {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory() || !ent.name.startsWith("flight-")) continue;
      const dir = path.join(base, ent.name);
      try {
        if (fs.statSync(dir).mtimeMs > cutoff) continue;
        const size = dirSizeBytes(dir);
        fs.rmSync(dir, { recursive: true, force: true });
        removed++; freed += size;
      } catch {}
    }
  } catch {}
  return { removed, freed };
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
} else if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║     Flight Video Helper — rodando                ║");
    console.log(`║     http://127.0.0.1:${PORT}                       ║`);
    console.log("║     Deixe esta janela aberta.                    ║");
    console.log("╚══════════════════════════════════════════════════╝");
    const swept = sweepOrphanTempDirs();
    // Também varre o disco de trabalho escolhido pelo usuário (jobs que morreram lá).
    const lastWorkDir = readConfig().lastWorkDir;
    if (lastWorkDir && path.resolve(lastWorkDir) !== path.resolve(os.tmpdir())) {
      const extra = sweepOrphanTempDirs(lastWorkDir);
      swept.removed += extra.removed;
      swept.freed += extra.freed;
    }
    if (swept.removed > 0) {
      console.log(`[startup] Limpeza de temp: ${swept.removed} pasta(s) orfa(s), ${(swept.freed / 1e9).toFixed(2)} GB liberados.`);
    }
    registerAutoStart();
  });
}

// Exporta funções internas para testes (require sem subir o servidor).
module.exports = { runFfmpeg, runEncodeWithFallback, ffmpegSignedExit, sweepOrphanTempDirs, getFreeDiskBytes };

if (cliTelemetryArg < 0) server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já em uso. O helper já está rodando?`);
    process.exit(1);
  }
  throw e;
});
