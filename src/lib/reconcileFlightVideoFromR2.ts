import { updateFlightVideoReady, type FlightVideo } from "./flightVideosDb";
import { getWorkerConfig } from "./videoStorage";

const KEY_TS_RE = /-(\d{13})\.mp4$/;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type R2VideoObject = {
  key: string;
  size: number | null;
  fileUrl: string;
};

function keyTimestampMs(key: string): number | null {
  const m = key.match(KEY_TS_RE);
  return m ? Number(m[1]) : null;
}

export async function listR2VideosForFlight(flightId: string): Promise<R2VideoObject[]> {
  const cfg = getWorkerConfig();
  if (!cfg) return [];

  const prefix = `flights/flight-${flightId}-`;
  try {
    const res = await fetch(`${cfg.url}/storage/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, secret: cfg.secret, limit: 200 }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { objects?: Array<{ key: string; size?: number; fileUrl: string }> };
    return (data.objects ?? [])
      .filter((o) => o.key?.endsWith(".mp4"))
      .map((o) => ({ key: o.key, size: o.size ?? null, fileUrl: o.fileUrl }));
  } catch {
    return [];
  }
}

function pickBestR2Match(
  doc: { id: string; created_at: string },
  candidates: R2VideoObject[],
  usedKeys: Set<string>,
): R2VideoObject | null {
  const docMs = new Date(doc.created_at).getTime();
  const minTs = docMs - 2 * 60 * 1000;
  const maxTs = docMs + MAX_AGE_MS;

  const eligible = candidates
    .filter((o) => !usedKeys.has(o.key))
    .map((o) => ({ ...o, keyMs: keyTimestampMs(o.key) }))
    .filter((o): o is R2VideoObject & { keyMs: number } => o.keyMs != null && o.keyMs >= minTs && o.keyMs <= maxTs)
    .sort((a, b) => Math.abs(a.keyMs - docMs) - Math.abs(b.keyMs - docMs));

  return eligible[0] ?? null;
}

async function resolveFileSize(fileUrl: string, knownSize: number | null): Promise<number | null> {
  if (knownSize != null) return knownSize;
  try {
    const head = await fetch(fileUrl, { method: "HEAD" });
    if (!head.ok) return null;
    const len = head.headers.get("content-length");
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

/** Atualiza no Appwrite vídeos em processing cujo MP4 já existe no R2. Retorna quantos foram corrigidos. */
export async function reconcileProcessingVideosFromR2(
  flightId: string,
  videos: FlightVideo[],
): Promise<number> {
  if (!getWorkerConfig()) return 0;

  const stuck = videos.filter(
    (v) => v.processing_status === "processing" && !(v.file_url ?? "").trim(),
  );
  if (stuck.length === 0) return 0;

  const r2Objects = await listR2VideosForFlight(flightId);
  if (r2Objects.length === 0) return 0;

  const usedKeys = new Set<string>();
  let fixed = 0;

  const sorted = [...stuck].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const doc of sorted) {
    const match = pickBestR2Match({ id: doc.id, created_at: doc.created_at }, r2Objects, usedKeys);
    if (!match) continue;

    const fileSize = await resolveFileSize(match.fileUrl, match.size);
    const { error } = await updateFlightVideoReady(doc.id, {
      fileUrl: match.fileUrl,
      fileSize,
      durationSec: null,
    });
    if (!error) {
      usedKeys.add(match.key);
      fixed++;
    }
  }

  return fixed;
}

export function hasStuckProcessingVideos(videos: FlightVideo[]): boolean {
  return videos.some((v) => v.processing_status === "processing" && !(v.file_url ?? "").trim());
}
