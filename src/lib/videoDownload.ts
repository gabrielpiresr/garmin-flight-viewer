const CF_WORKER_URL = (import.meta.env.VITE_CF_WORKER_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

function fileKeyFromUrl(fileUrl: string): string | null {
  try {
    const key = decodeURIComponent(new URL(fileUrl).pathname.replace(/^\/+/, ""));
    return key || null;
  } catch {
    return null;
  }
}

export function videoDownloadFilename(fileUrl: string): string {
  return fileKeyFromUrl(fileUrl)?.split("/").pop() || "video.mp4";
}

/** HEAD sem headers extras = simple request (sem preflight); worker responde com CORS. */
async function workerDownloadAvailable(downloadUrl: string): Promise<boolean> {
  try {
    const res = await fetch(downloadUrl, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function triggerNavigationDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Baixa o arquivo de vídeo de verdade via rota /download do worker
 * (Content-Disposition: attachment — download por navegação, sem CORS).
 * Se o worker ainda não tiver a rota (deploy antigo), cai no comportamento
 * anterior de abrir o vídeo em nova aba.
 */
export async function downloadVideoFile(fileUrl: string): Promise<void> {
  const key = fileKeyFromUrl(fileUrl);
  if (CF_WORKER_URL && key) {
    const downloadUrl = `${CF_WORKER_URL}/download?key=${encodeURIComponent(key)}`;
    if (await workerDownloadAvailable(downloadUrl)) {
      triggerNavigationDownload(downloadUrl, videoDownloadFilename(fileUrl));
      return;
    }
  }
  window.open(fileUrl, "_blank", "noopener,noreferrer");
}
