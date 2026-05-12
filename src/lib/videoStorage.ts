const WORKER_URL = import.meta.env.VITE_CF_WORKER_URL as string | undefined;
const WORKER_SECRET = import.meta.env.VITE_CF_WORKER_SECRET as string | undefined;

export function isVideoStorageConfigured(): boolean {
  return Boolean(WORKER_URL && WORKER_SECRET);
}

export function getWorkerConfig(): { url: string; secret: string } | null {
  if (!WORKER_URL || !WORKER_SECRET) return null;
  return { url: WORKER_URL, secret: WORKER_SECRET };
}
