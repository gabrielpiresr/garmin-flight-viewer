/** Gallery / upload preview helpers — keep grid cells off full-resolution originals. */

export const GALLERY_THUMB_MAX_EDGE = 480;
export const UPLOAD_PREVIEW_MAX_EDGE = 320;

const previewUrlCache = new Map<string, string>();
const previewInflight = new Map<string, Promise<string>>();

let activeDecodes = 0;
const decodeWaiters: Array<() => void> = [];
const MAX_CONCURRENT_DECODES = 2;

function acquireDecodeSlot(): Promise<void> {
  if (activeDecodes < MAX_CONCURRENT_DECODES) {
    activeDecodes += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    decodeWaiters.push(() => {
      activeDecodes += 1;
      resolve();
    });
  });
}

function releaseDecodeSlot(): void {
  activeDecodes = Math.max(0, activeDecodes - 1);
  const next = decodeWaiters.shift();
  if (next) next();
}

export function thumbR2KeyFromOriginal(r2Key: string): string {
  return String(r2Key || "").replace(/(\.[^.]+)$/i, "-thumb.jpg");
}

/** Public thumb URL derived from the original object key (uploaded alongside full image). */
export function deriveThumbUrl(fileUrl: string, r2Key: string): string {
  const key = String(r2Key || "").trim();
  const url = String(fileUrl || "").trim();
  if (!key || !url) return "";
  const thumbKey = thumbR2KeyFromOriginal(key);
  if (thumbKey === key) return "";
  if (url.includes(key)) return url.replace(key, thumbKey);
  return url.replace(/(\.[^.]+)$/i, "-thumb.jpg");
}

export async function createResizedJpegBlob(
  source: Blob,
  maxEdge: number,
  quality = 0.72,
): Promise<Blob> {
  let bitmap = await createImageBitmap(source);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > maxEdge) {
    const targetWidth = Math.max(1, Math.round(bitmap.width * (maxEdge / longest)));
    bitmap.close();
    try {
      bitmap = await createImageBitmap(source, {
        resizeWidth: targetWidth,
        resizeQuality: "medium",
      });
    } catch {
      bitmap = await createImageBitmap(source);
    }
  }

  const width = bitmap.width;
  const height = bitmap.height;
  if (Math.max(width, height) > maxEdge) {
    const scale = maxEdge / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Canvas indisponível para gerar preview.");
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await canvasToJpeg(canvas, quality);
    return blob;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas indisponível para gerar preview.");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasToJpeg(canvas, quality);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar JPEG de preview."));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function createLocalPreviewUrl(
  source: Blob,
  maxEdge: number,
  quality = 0.72,
): Promise<string> {
  const blob = await createResizedJpegBlob(source, maxEdge, quality);
  return URL.createObjectURL(blob);
}

/**
 * Loads a remote image and returns a small object-URL suitable for gallery cells.
 * Caps concurrent decode work so opening a flight with dozens of photos does not freeze the tab.
 */
export async function getDownscaledPreviewUrl(
  src: string,
  maxEdge: number = GALLERY_THUMB_MAX_EDGE,
): Promise<string> {
  const cached = previewUrlCache.get(src);
  if (cached) return cached;

  const existing = previewInflight.get(src);
  if (existing) return existing;

  const task = (async () => {
    await acquireDecodeSlot();
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const previewUrl = await createLocalPreviewUrl(blob, maxEdge, 0.7);
      previewUrlCache.set(src, previewUrl);
      return previewUrl;
    } finally {
      releaseDecodeSlot();
      previewInflight.delete(src);
    }
  })();

  previewInflight.set(src, task);
  return task;
}

const probeCache = new Map<string, boolean>();
const probeInflight = new Map<string, Promise<boolean>>();

export function probeImageUrl(url: string): Promise<boolean> {
  const key = String(url || "").trim();
  if (!key) return Promise.resolve(false);
  const cached = probeCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = probeInflight.get(key);
  if (existing) return existing;

  const task = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      probeCache.set(key, true);
      probeInflight.delete(key);
      resolve(true);
    };
    img.onerror = () => {
      probeCache.set(key, false);
      probeInflight.delete(key);
      resolve(false);
    };
    img.decoding = "async";
    img.src = key;
  });
  probeInflight.set(key, task);
  return task;
}