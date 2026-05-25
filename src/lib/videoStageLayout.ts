export type VideoStageFit = "contain" | "cover";

/** Tamanho do retângulo visível do vídeo no player (preview). */
export function computeVideoStageSize(
  parentWidth: number,
  parentHeight: number,
  videoWidth: number,
  videoHeight: number,
  rotationDeg: number,
  fit: VideoStageFit,
): { width: number; height: number } {
  if (parentWidth <= 0 || parentHeight <= 0) return { width: 0, height: 0 };
  if (fit === "cover") {
    return { width: Math.floor(parentWidth), height: Math.floor(parentHeight) };
  }
  if (!videoWidth || !videoHeight) {
    return { width: Math.floor(parentWidth), height: Math.floor(parentHeight) };
  }
  const rot = ((rotationDeg % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const srcW = swapped ? videoHeight : videoWidth;
  const srcH = swapped ? videoWidth : videoHeight;
  const scale = Math.min(parentWidth / srcW, parentHeight / srcH);
  return {
    width: Math.max(1, Math.floor(srcW * scale)),
    height: Math.max(1, Math.floor(srcH * scale)),
  };
}

/** Padding para centralizar vídeo no export 16:9 (mesma lógica do preview contain). */
export function computeHorizontalExportPad(
  outWidth: number,
  outHeight: number,
  videoWidth: number,
  videoHeight: number,
  rotationDeg: number,
): { stageWidth: number; stageHeight: number; padX: number; padY: number } {
  const stage = computeVideoStageSize(outWidth, outHeight, videoWidth, videoHeight, rotationDeg, "contain");
  return {
    stageWidth: stage.width,
    stageHeight: stage.height,
    padX: Math.max(0, Math.floor((outWidth - stage.width) / 2)),
    padY: Math.max(0, Math.floor((outHeight - stage.height) / 2)),
  };
}

/** Pontos de telemetria usados nos gráficos (respeita toggle de corte). */
export function telemetryChartPoints<T extends { timeMs: number }>(
  points: T[],
  trimStartSec: number | null,
  trimEndSec: number | null,
  chartsFollowTrim: boolean,
): T[] {
  if (!chartsFollowTrim || (trimStartSec === null && trimEndSec === null)) return points;
  const startMs = (trimStartSec ?? 0) * 1000;
  const endMs = (trimEndSec ?? (points.at(-1)?.timeMs ?? Infinity) + 1) * 1000;
  return points.filter((p) => p.timeMs >= startMs && p.timeMs <= endMs);
}
