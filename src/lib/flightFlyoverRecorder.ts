import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { FlightShareBrand } from "./flightShareStickers";
import {
  FLYOVER_FPS,
  FLYOVER_HEIGHT,
  FLYOVER_MAX_LABELS,
  FLYOVER_WIDTH,
  flyoverHudValues,
  type FlyoverSample,
} from "./flightFlyover";

export type ProjectedFlyoverLabel = {
  text: string;
  x: number;
  y: number;
  color: string;
};

export type FlyoverRenderFrame = {
  sample: FlyoverSample;
  canvas: HTMLCanvasElement;
  labels: ProjectedFlyoverLabel[];
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawFlyoverOverlay(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number;
    height: number;
    sample: FlyoverSample;
    brand: FlightShareBrand;
    logo: CanvasImageSource | null;
    labels?: ProjectedFlyoverLabel[];
  },
) {
  const { width, height, sample, brand, logo, labels = [] } = input;

  const topFade = ctx.createLinearGradient(0, 0, 0, 220);
  topFade.addColorStop(0, "rgba(0,0,0,0.55)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, width, 220);

  const bottomFade = ctx.createLinearGradient(0, height - 140, 0, height);
  bottomFade.addColorStop(0, "rgba(0,0,0,0)");
  bottomFade.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, height - 140, width, 140);

  const logoH = 72;
  const logoY = 24;
  if (logo) {
    const srcW = "width" in logo ? Number(logo.width) || logoH : logoH;
    const srcH = "height" in logo ? Number(logo.height) || logoH : logoH;
    const aspect = srcW / Math.max(1, srcH);
    const w = Math.min(260, logoH * aspect);
    ctx.drawImage(logo, (width - w) / 2, logoY, w, logoH);
  } else if (brand.schoolName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 32px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    ctx.fillText(brand.schoolName, width / 2, logoY + 8);
    ctx.shadowBlur = 0;
  }

  const hud = flyoverHudValues(sample);
  const metrics = [
    { label: "DISTÂNCIA", value: hud.distance },
    { label: "ALTITUDE", value: hud.altitude },
    { label: "TEMPO", value: hud.time },
  ];
  const metricsY = 122;
  ctx.textAlign = "center";
  metrics.forEach((metric, index) => {
    const x = width * ((index + 0.5) / metrics.length);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(metric.label, x, metricsY);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 34px ui-sans-serif, system-ui, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 10;
    ctx.fillText(metric.value, x, metricsY + 28);
    ctx.shadowBlur = 0;
  });

  ctx.textAlign = "left";
  for (const label of labels.slice(0, FLYOVER_MAX_LABELS)) {
    if (label.x < 16 || label.x > width - 16 || label.y < 170 || label.y > height - 70) continue;
    ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    const padX = 8;
    const w = ctx.measureText(label.text).width + padX * 2;
    const h = 22;
    ctx.fillStyle = "rgba(15,23,42,0.78)";
    roundRect(ctx, label.x - w / 2, label.y - h / 2, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = label.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, label.x, label.y);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Tiles © Esri", 18, height - 18);
}

async function pickAvcConfig(width: number, height: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === "undefined" || !VideoEncoder.isConfigSupported) return null;
  const codecs = ["avc1.4d002a", "avc1.42001f", "avc1.64001f"];
  for (const codec of codecs) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: 3_200_000,
      framerate: FLYOVER_FPS,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return (support.config as VideoEncoderConfig) ?? config;
    } catch {
      // try next
    }
  }
  return null;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function recordFlyoverVideo(input: {
  renderAt: (progress: number) => FlyoverRenderFrame;
  brand: FlightShareBrand;
  logo: CanvasImageSource | null;
  videoDurationSec: number;
  fileName: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<File> {
  const width = FLYOVER_WIDTH;
  const height = FLYOVER_HEIGHT;
  const frameCount = Math.max(1, Math.round(input.videoDurationSec * FLYOVER_FPS));
  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar o canvas do vídeo.");

  const avcConfig = await pickAvcConfig(width, height);
  if (avcConfig && typeof VideoEncoder !== "undefined") {
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: "avc",
        width,
        height,
        frameRate: FLYOVER_FPS,
      },
      fastStart: "in-memory",
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        throw error;
      },
    });
    encoder.configure(avcConfig);

    for (let i = 0; i < frameCount; i++) {
      if (input.signal?.aborted) {
        encoder.close();
        throw new DOMException("Aborted", "AbortError");
      }
      const progress = frameCount === 1 ? 1 : i / (frameCount - 1);
      const frame = input.renderAt(progress);
      ctx.drawImage(frame.canvas, 0, 0, width, height);
      drawFlyoverOverlay(ctx, {
        width,
        height,
        sample: frame.sample,
        brand: input.brand,
        logo: input.logo,
        labels: frame.labels,
      });
      const videoFrame = new VideoFrame(composite, {
        timestamp: Math.round((i * 1e6) / FLYOVER_FPS),
        duration: Math.round(1e6 / FLYOVER_FPS),
      });
      encoder.encode(videoFrame, { keyFrame: i % FLYOVER_FPS === 0 });
      videoFrame.close();
      if (i % 4 === 0 || i === frameCount - 1) {
        input.onProgress?.(Math.min(92, Math.round(((i + 1) / frameCount) * 92)));
        await waitFrame();
      }
    }

    input.onProgress?.(94);
    await encoder.flush();
    encoder.close();
    input.onProgress?.(97);
    muxer.finalize();
    const buffer = muxer.target.buffer;
    input.onProgress?.(100);
    return new File([buffer], input.fileName.replace(/\.webm$/i, ".mp4"), { type: "video/mp4" });
  }

  return recordFlyoverWebmFallback(input, composite, ctx, frameCount);
}

async function recordFlyoverWebmFallback(
  input: {
    renderAt: (progress: number) => FlyoverRenderFrame;
    brand: FlightShareBrand;
    logo: CanvasImageSource | null;
    videoDurationSec: number;
    fileName: string;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  },
  composite: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  frameCount: number,
): Promise<File> {
  if (typeof MediaRecorder === "undefined" || typeof composite.captureStream !== "function") {
    throw new Error("Este navegador não consegue gerar o vídeo do Flyover.");
  }
  const stream = composite.captureStream(FLYOVER_FPS);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_200_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Falha ao gravar o vídeo."));
  });
  recorder.start();

  const frameMs = 1000 / FLYOVER_FPS;
  let last = performance.now();
  for (let i = 0; i < frameCount; i++) {
    if (input.signal?.aborted) {
      recorder.stop();
      throw new DOMException("Aborted", "AbortError");
    }
    const progress = frameCount === 1 ? 1 : i / (frameCount - 1);
    const frame = input.renderAt(progress);
    ctx.drawImage(frame.canvas, 0, 0, composite.width, composite.height);
    drawFlyoverOverlay(ctx, {
      width: composite.width,
      height: composite.height,
      sample: frame.sample,
      brand: input.brand,
      logo: input.logo,
      labels: frame.labels,
    });
    input.onProgress?.(Math.min(92, Math.round(((i + 1) / frameCount) * 92)));
    const elapsed = performance.now() - last;
    if (elapsed < frameMs) {
      await new Promise((r) => window.setTimeout(r, frameMs - elapsed));
    }
    last = performance.now();
  }

  input.onProgress?.(95);
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(chunks, { type: mime });
  input.onProgress?.(100);
  const name = input.fileName.replace(/\.mp4$/i, ".webm");
  return new File([blob], name, { type: blob.type || "video/webm" });
}

export function downloadFlyoverFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
