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
const HELPER_DIR = path.dirname(process.execPath.endsWith("node.exe") ? process.argv[1] : process.execPath);

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");

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

    try {
      await pipe(req, ws);
      return json(res, { ok: true });
    } catch (e) {
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

  // GET /progress/:jobId — SSE
  const progressMatch = url.match(/^\/progress\/([^/]+)$/);
  if (progressMatch && req.method === "GET") {
    const [, jobId] = progressMatch;
    const job = jobs.get(jobId);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
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
    jobId, sessionId, fileOrder, cfWorkerUrl, cfWorkerSecret, videoKey,
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
  const videoFiles = fileOrder.map(({ index, name }) =>
    path.join(tmpDir, `input_${index}_${sanitizeFilename(name)}`)
  );

  for (const f of videoFiles) {
    if (!fs.existsSync(f)) return fail(`Arquivo não encontrado no servidor: ${f}`);
  }

  const joinedPath = path.join(tmpDir, "joined.mp4");
  const finalPath = path.join(tmpDir, "final.mp4");

  // Duração total para calcular progresso
  const totalDuration = ffprobe ? await getTotalDuration(ffprobe, videoFiles) : 0;

  try {
    // ── Stage 1: Concat ──────────────────────────────────────────────────────
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

    const fileUrl = await uploadMultipart(cfWorkerUrl, cfWorkerSecret, videoKey, fileBytes, (pct) => {
      progress("upload", pct);
    });

    // Duração do arquivo final
    const finalDuration = ffprobe ? (await probeDuration(ffprobe, finalPath)) ?? totalDuration : totalDuration;

    // Atualizar Appwrite
    await updateAppwrite(appwriteEndpoint, appwriteProjectId, appwriteDbId, videosColId,
      flightVideoDocId, sessionJwt, fileUrl, fileSize, finalDuration);

    // Limpar temporários
    cleanup(tmpDir);

    progress("done", 100, { file_url: fileUrl, file_size: fileSize, duration_sec: finalDuration });
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

function runFfmpeg(ffmpeg, args, totalDuration, onProgress, { mustSucceed = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
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

async function uploadMultipart(workerUrl, secret, key, data, onProgress) {
  // 1. Iniciar
  const initRes = await fetch(`${workerUrl}/upload/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, secret }),
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
        "x-secret": secret,
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
    body: JSON.stringify({ uploadId, key: uploadKey, parts, secret }),
  });
  if (!completeRes.ok) throw new Error(`Upload complete falhou: ${completeRes.status}`);
  const { fileUrl } = await completeRes.json();
  onProgress(100);
  return fileUrl;
}

// ─── Appwrite ──────────────────────────────────────────────────────────────────

async function updateAppwrite(endpoint, projectId, dbId, colId, docId, jwt, fileUrl, fileSize, durationSec) {
  if (!jwt || !colId) return;
  const url = `${endpoint}/databases/${dbId}/collections/${colId}/documents/${docId}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-JWT": jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: { file_url: fileUrl, file_size: fileSize, duration_sec: durationSec, processing_status: "ready" },
    }),
  });
}

// ─── Utilitários ───────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
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

// ─── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, "127.0.0.1", () => {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     Flight Video Helper — rodando                ║");
  console.log(`║     http://127.0.0.1:${PORT}                       ║`);
  console.log("║     Deixe esta janela aberta.                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  registerAutoStart();
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já em uso. O helper já está rodando?`);
    process.exit(1);
  }
  throw e;
});
