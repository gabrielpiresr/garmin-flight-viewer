/**
 * Reconcilia flight_videos em "processing" (sem file_url) com MP4 já presentes no R2.
 *
 * Uso:
 *   APPWRITE_API_KEY=... VITE_CF_WORKER_URL=... VITE_CF_WORKER_SECRET=... node scripts/reconcile-processing-videos.mjs
 *   node scripts/reconcile-processing-videos.mjs --watch          # repete a cada 60s
 *   node scripts/reconcile-processing-videos.mjs --watch --interval=120
 *
 * Requer deploy do worker com POST /storage/list (workers/video-upload-worker).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const fileEnv = parseEnvFile(envPath);
const env = (key, fallbackKey) => process.env[key] || fileEnv[key] || (fallbackKey ? fileEnv[fallbackKey] : undefined);

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");
const VIDEOS_COL_ID = env("APPWRITE_VIDEOS_COLLECTION_ID", "VITE_APPWRITE_VIDEOS_COLLECTION_ID");
const WORKER_URL = (env("CF_WORKER_URL", "VITE_CF_WORKER_URL") || "").replace(/\/$/, "");
const WORKER_SECRET = env("CF_WORKER_SECRET", "VITE_CF_WORKER_SECRET");

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const DRY_RUN = args.includes("--dry-run");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const INTERVAL_MS = intervalArg ? Math.max(15_000, Number(intervalArg.split("=")[1]) * 1000) : 60_000;
const MAX_AGE_HOURS = Number(env("RECONCILE_MAX_AGE_HOURS") || "48");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !VIDEOS_COL_ID) {
  console.error("Faltam variáveis Appwrite (endpoint, project, database, videos collection, APPWRITE_API_KEY).");
  process.exit(1);
}
if (!WORKER_URL || !WORKER_SECRET) {
  console.error("Faltam VITE_CF_WORKER_URL e VITE_CF_WORKER_SECRET (ou CF_WORKER_*).");
  process.exit(1);
}

const appwriteHeaders = {
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
  "Content-Type": "application/json",
};

const KEY_TS_RE = /-(\d{13})\.mp4$/;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function keyTimestampMs(key) {
  const m = key.match(KEY_TS_RE);
  return m ? Number(m[1]) : null;
}

async function listStuckVideos() {
  const stuck = [];
  let cursor = undefined;
  const qProcessing = encodeURIComponent(JSON.stringify({ method: "equal", attribute: "processing_status", values: ["processing"] }));

  for (;;) {
    const cursorQ = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const url = `${ENDPOINT}/databases/${DATABASE_ID}/collections/${VIDEOS_COL_ID}/documents?queries[]=${qProcessing}&limit=100${cursorQ}`;
    const res = await fetch(url, { headers: appwriteHeaders });
    if (!res.ok) throw new Error(`Appwrite list: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const doc of data.documents ?? []) {
      const fileUrl = (doc.file_url || "").trim();
      if (fileUrl) continue;
      stuck.push({
        id: doc.$id,
        flight_id: doc.flight_id,
        created_at: doc.created_at || doc.$createdAt,
        uploaded_by: doc.uploaded_by,
      });
    }
    if (!data.documents?.length || data.documents.length < 100) break;
    cursor = data.documents.at(-1).$id;
  }
  return stuck;
}

async function listR2ForFlight(flightId) {
  const prefix = `flights/flight-${flightId}-`;
  const res = await fetch(`${WORKER_URL}/storage/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, secret: WORKER_SECRET, limit: 200 }),
  });
  if (res.status === 404) {
    throw new Error("Worker sem /storage/list — faça deploy de workers/video-upload-worker");
  }
  if (!res.ok) throw new Error(`R2 list: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.objects ?? []).filter((o) => o.key?.endsWith(".mp4"));
}

function pickBestMatch(doc, candidates, usedKeys) {
  const docMs = new Date(doc.created_at).getTime();
  const minTs = docMs - 2 * 60 * 1000;
  const maxTs = docMs + MAX_AGE_HOURS * 60 * 60 * 1000;

  const eligible = candidates
    .filter((o) => !usedKeys.has(o.key))
    .map((o) => ({ ...o, keyMs: keyTimestampMs(o.key) }))
    .filter((o) => o.keyMs != null && o.keyMs >= minTs && o.keyMs <= maxTs)
    .sort((a, b) => Math.abs(a.keyMs - docMs) - Math.abs(b.keyMs - docMs));

  return eligible[0] ?? null;
}

async function patchReady(docId, { fileUrl, fileSize }) {
  const res = await fetch(`${ENDPOINT}/databases/${DATABASE_ID}/collections/${VIDEOS_COL_ID}/documents/${docId}`, {
    method: "PATCH",
    headers: appwriteHeaders,
    body: JSON.stringify({
      data: {
        file_url: fileUrl,
        file_size: fileSize,
        processing_status: "ready",
      },
    }),
  });
  if (!res.ok) throw new Error(`PATCH ${docId}: ${res.status} ${await res.text()}`);
}

async function runOnce() {
  const started = new Date().toISOString();
  const stuck = await listStuckVideos();
  console.log(`[${started}] ${stuck.length} vídeo(s) em processing sem file_url`);

  if (stuck.length === 0) return { reconciled: 0, skipped: 0 };

  const byFlight = new Map();
  for (const doc of stuck) {
    if (!doc.flight_id) continue;
    if (!byFlight.has(doc.flight_id)) byFlight.set(doc.flight_id, []);
    byFlight.get(doc.flight_id).push(doc);
  }

  let reconciled = 0;
  let skipped = 0;
  const usedKeys = new Set();

  for (const [flightId, docs] of byFlight) {
    let r2Objects;
    try {
      r2Objects = await listR2ForFlight(flightId);
    } catch (e) {
      console.warn(`  flight ${flightId}: ${e.message}`);
      skipped += docs.length;
      continue;
    }

    if (r2Objects.length === 0) {
      console.log(`  flight ${flightId}: nenhum MP4 no R2 (${docs.length} doc(s) aguardando)`);
      skipped += docs.length;
      continue;
    }

    const sortedDocs = [...docs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const doc of sortedDocs) {
      const match = pickBestMatch(doc, r2Objects, usedKeys);
      if (!match) {
        console.log(`  ${doc.id}: sem MP4 correspondente no R2`);
        skipped++;
        continue;
      }

      let fileSize = match.size ?? null;
      if (fileSize == null) {
        try {
          const head = await fetch(match.fileUrl, { method: "HEAD" });
          if (head.ok) {
            const len = head.headers.get("content-length");
            if (len) fileSize = Number(len);
          }
        } catch {
          /* ignore */
        }
      }

      console.log(`  ${doc.id} → ${match.key} (${fileSize ? `${(fileSize / 1e6).toFixed(1)} MB` : "?"})`);
      if (!DRY_RUN) {
        await patchReady(doc.id, { fileUrl: match.fileUrl, fileSize });
        usedKeys.add(match.key);
        reconciled++;
      } else {
        usedKeys.add(match.key);
        reconciled++;
      }
    }
  }

  console.log(`Concluído: ${reconciled} reconciliado(s), ${skipped} ainda aguardando${DRY_RUN ? " (dry-run)" : ""}.`);
  return { reconciled, skipped };
}

async function main() {
  if (WATCH) {
    console.log(`Modo watch — intervalo ${INTERVAL_MS / 1000}s (Ctrl+C para parar)`);
    for (;;) {
      try {
        await runOnce();
      } catch (e) {
        console.error("Erro:", e.message);
      }
      await sleep(INTERVAL_MS);
    }
  } else {
    await runOnce();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
