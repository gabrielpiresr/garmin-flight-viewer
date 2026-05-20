/**
 * Marca um flight_videos como "ready" quando o MP4 já está no R2 mas o Appwrite ficou em "processing".
 *
 * Uso (PowerShell):
 *   $env:APPWRITE_API_KEY="sua_chave"
 *   $env:FILE_URL="https://pub-....r2.dev/flights/flight-XXX-123.mp4"
 *   node scripts/repair-flight-video-ready.mjs 6a0c7a27001c3005e839
 */
const DOC_ID = process.argv[2];
const FILE_URL = process.env.FILE_URL;
const KEY = process.env.APPWRITE_API_KEY;
const PROJECT = process.env.APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const DB = process.env.APPWRITE_DATABASE_ID ?? "6a01afae001bc352d1b1";
const COL = process.env.APPWRITE_VIDEOS_COLLECTION_ID ?? "6a0200bf00297bfc2231";

if (!DOC_ID || !FILE_URL || !KEY) {
  console.error("Uso: FILE_URL=... APPWRITE_API_KEY=... node scripts/repair-flight-video-ready.mjs <docId>");
  process.exit(1);
}

const headers = {
  "X-Appwrite-Project": PROJECT,
  "X-Appwrite-Key": KEY,
  "Content-Type": "application/json",
};

let fileSize = null;
let durationSec = null;
try {
  const head = await fetch(FILE_URL, { method: "HEAD" });
  if (head.ok) {
    const len = head.headers.get("content-length");
    if (len) fileSize = Number(len);
  }
} catch {
  /* ignore */
}

const res = await fetch(`${ENDPOINT}/databases/${DB}/collections/${COL}/documents/${DOC_ID}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    data: {
      file_url: FILE_URL,
      file_size: fileSize,
      duration_sec: durationSec,
      processing_status: "ready",
    },
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error("Falha:", res.status, text);
  process.exit(1);
}
console.log("OK — documento atualizado:", DOC_ID);
console.log(text.slice(0, 400));
