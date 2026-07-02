import type { AirspeedArcLimits, VideoTelemetryPoint, VideoTelemetryWidget } from "./videoTelemetry";
import { drawOverlayFrame, getPointAtMs, type VideoRouteMapData } from "./overlayCanvas";
import type { TelemetryOverlayStyle } from "./overlayCanvas";
import { buildVideoRouteMap } from "./videoRouteMap";
import { routeMapSourceSize } from "./overlayRouteLayout";

export interface RenderOverlayParams {
  points: VideoTelemetryPoint[];
  /** Pontos dos gráficos (preview: toggle “ajustar gráficos ao corte”). */
  chartPoints?: VideoTelemetryPoint[];
  widgets: VideoTelemetryWidget[];
  startSec: number;
  endSec: number;
  orientation: "horizontal" | "vertical";
  brand: string;
  playerWidth: number;
  playerHeight: number;
  overlayStyle: TelemetryOverlayStyle;
  airspeedArcs: AirspeedArcLimits | null;
  /** Mapa pré-carregado (preview); se omitido, gera antes dos frames. */
  routeMap?: VideoRouteMapData | null;
  onProgress: (stage: "render" | "encode", pct: number) => void;
}

export interface RenderedOverlay {
  blob: Blob;
  frameCount: number;
  fps: number;
  durationSec: number;
}

// 10fps is enough for telemetry overlays (values change slowly)
// and keeps the payload size reasonable.
const RENDER_FPS = 10;

// Magic bytes to identify our JPEG-frames binary format: "JFRS"
const MAGIC = 0x4a465253;

export async function renderOverlayVideo(
  params: RenderOverlayParams,
): Promise<RenderedOverlay> {
  const {
    points,
    chartPoints = points,
    widgets,
    startSec,
    endSec,
    orientation,
    brand,
    playerWidth,
    playerHeight,
    overlayStyle,
    airspeedArcs,
    routeMap: routeMapInput,
    onProgress,
  } = params;

  const isVertical = orientation === "vertical";
  const width = isVertical ? 608 : 1920;
  const height = 1080;
  const durationSec = endSec - startSec;
  const totalFrames = Math.ceil(durationSec * RENDER_FPS);

  const { w: mapW, h: mapH } = routeMapSourceSize(width, height, isVertical);
  let routeMap = routeMapInput ?? null;
  if (!routeMap && widgets.includes("route") && points.length >= 2) {
    onProgress("render", 0);
    routeMap = await buildVideoRouteMap(points, mapW, mapH);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Collect JPEG frames — each toBlob() call is async but does not need
  // event-loop tricks because we await each one before drawing the next.
  const frameParts: ArrayBuffer[] = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeSec = startSec + frame / RENDER_FPS;
    const point = getPointAtMs(points, timeSec * 1000);
    drawOverlayFrame(
      ctx,
      point,
      points,
      chartPoints,
      widgets,
      width,
      height,
      brand,
      isVertical,
      playerWidth,
      playerHeight,
      overlayStyle,
      airspeedArcs,
      routeMap,
    );

    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png",
      ),
    );
    frameParts.push(await jpeg.arrayBuffer());

    if (frame % 10 === 0) {
      onProgress("render", frame / totalFrames);
    }
  }

  onProgress("render", 1);

  // ── Pack into binary blob ──────────────────────────────────────────────────
  // Layout: [4B magic][4B frameCount][per frame: 4B size + frame bytes]
  const headerBuf = new ArrayBuffer(8);
  const hv = new DataView(headerBuf);
  hv.setUint32(0, MAGIC, false);
  hv.setUint32(4, totalFrames, false);

  const parts: ArrayBuffer[] = [headerBuf];
  for (const frameData of frameParts) {
    const sizeBuf = new ArrayBuffer(4);
    new DataView(sizeBuf).setUint32(0, frameData.byteLength, false);
    parts.push(sizeBuf, frameData);
  }

  const blob = new Blob(parts, { type: "application/octet-stream" });
  return { blob, frameCount: totalFrames, fps: RENDER_FPS, durationSec };
}

/**
 * Overlay JFRS com um único frame transparente — usado para exportar corte,
 * rotação e formato vertical em vídeos sem telemetria. O ffmpeg do helper
 * repete o último frame do overlay até o vídeo-base terminar, então um frame
 * basta e o upload fica em poucos bytes.
 */
export async function buildBlankOverlay(durationSec: number): Promise<RenderedOverlay> {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  // Canvas nasce transparente — nenhum draw necessário.
  const frame = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  const frameData = await frame.arrayBuffer();

  const headerBuf = new ArrayBuffer(8);
  const hv = new DataView(headerBuf);
  hv.setUint32(0, MAGIC, false);
  hv.setUint32(4, 1, false);
  const sizeBuf = new ArrayBuffer(4);
  new DataView(sizeBuf).setUint32(0, frameData.byteLength, false);

  const blob = new Blob([headerBuf, sizeBuf, frameData], { type: "application/octet-stream" });
  return { blob, frameCount: 1, fps: 1, durationSec };
}

// ─── Upload overlay to helper ────────────────────────────────────────────────

export interface CompositeParams {
  videoUrl: string;
  cfWorkerUrl: string;
  cfWorkerToken: string;
  outputKey: string;
  trimStartSec?: number;
  trimEndSec?: number;
  orientation: "horizontal" | "vertical";
  /** 0–100: horizontal crop anchor for vertical export (50 = center). */
  verticalCropPct?: number;
  /** 0, 90, 180 ou 270 — aplicado no ffmpeg antes do crop (como no preview). */
  videoRotationDeg?: number;
  /** Dimensões intrínsecas do arquivo de vídeo (para pad/crop no helper). */
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  jobId: string;
}

export async function uploadOverlayAndComposite(
  helperUrl: string,
  overlay: RenderedOverlay,
  params: CompositeParams,
  onUploadProgress: (pct: number) => void,
): Promise<void> {
  const xParams = JSON.stringify({
    ...params,
    frameCount: overlay.frameCount,
    fps: overlay.fps,
    durationSec: overlay.durationSec,
  });

  // Use XMLHttpRequest so we get upload progress events
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${helperUrl}/composite-overlay`);
    xhr.setRequestHeader("Content-Type", overlay.blob.type);
    xhr.setRequestHeader("X-Params", xParams);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(body.error ?? `Helper retornou ${xhr.status}`));
        } catch {
          reject(new Error(`Helper retornou ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Falha ao conectar ao helper"));
    xhr.send(overlay.blob);
  });
}
