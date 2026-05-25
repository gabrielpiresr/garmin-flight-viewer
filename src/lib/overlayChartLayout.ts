/**
 * Dimensões dos gráficos do overlay — espelha overlayScaleClasses (cqh/cqw/em).
 * Usar sempre a largura/altura do frame de desenho (canvas de export ou overlay root).
 */

export type ChartLayoutMode = "hud" | "compact" | "vertical";

const REF_H = 1080;

/** font-size do .video-overlay-root: clamp(0.5rem, 1.35cqh, 1.0625rem) */
export function overlayEmPx(frameH: number): number {
  const fromCqh = frameH * 0.0135;
  return Math.min(17, Math.max(8, fromCqh));
}

function cqhPx(cqh: number, frameH: number): number {
  return frameH * (cqh / 100);
}

function minPercentCqw(percent: number, cqw: number, frameW: number): number {
  return Math.min(frameW * (percent / 100), frameW * (cqw / 100));
}

function chartCanvasHeight(mode: ChartLayoutMode, frameH: number, emPx: number): number {
  const caps: Record<ChartLayoutMode, { cqh: number; maxRem: number }> = {
    hud: { cqh: 21.25, maxRem: 8.125 },
    compact: { cqh: 24, maxRem: 9 },
    vertical: { cqh: 15.6, maxRem: 8.45 },
  };
  const { cqh, maxRem } = caps[mode];
  return Math.round(Math.min(cqhPx(cqh, frameH), maxRem * emPx));
}

export type ChartPanelMetrics = {
  emPx: number;
  innerH: number;
  padTop: number;
  padBot: number;
  padX: number;
  titleSz: number;
  titleGap: number;
  panelH: number;
  radius: number;
};

export function chartPanelMetrics(mode: ChartLayoutMode, frameH: number, frameW: number): ChartPanelMetrics {
  const emPx = overlayEmPx(frameH);
  const innerH = chartCanvasHeight(mode, frameH, emPx);
  const padTop = Math.round(0.4 * emPx);
  const padBot = Math.round(0.15 * emPx);
  const padX = padTop;
  const titleSz = Math.round(0.82 * emPx);
  const titleGap = Math.round(0.2 * emPx);
  const panelH = padTop + titleSz + titleGap + innerH + padBot;
  const radius = Math.round(4 * Math.min(frameW / 1920, frameH / REF_H));
  return { emPx, innerH, padTop, padBot, padX, titleSz, titleGap, panelH, radius };
}

export type CornerChartsLayout = {
  insetL: number;
  gap: number;
  chartGap: number;
  totalW: number;
  eachW: number;
  panel: ChartPanelMetrics;
};

/** HUD / compacto canto esquerdo (export + referência). */
export function cornerChartsLayout(
  mode: ChartLayoutMode,
  frameW: number,
  frameH: number,
  chartCount: number,
  stackedBoth: boolean,
): CornerChartsLayout {
  const panel = chartPanelMetrics(mode, frameH, frameW);
  const insetL = Math.round(frameW * 0.015);
  const gap = Math.round(0.35 * panel.emPx);
  const chartGap = stackedBoth ? Math.round(1.05 * panel.emPx) : gap;

  let totalW: number;
  if (mode === "compact") {
    totalW = Math.round(minPercentCqw(23.1, 19.425, frameW));
  } else if (chartCount === 2) {
    totalW = Math.round(minPercentCqw(30, 30, frameW));
  } else {
    totalW = Math.round(minPercentCqw(15, 15, frameW));
  }

  const eachW = chartCount === 1 ? totalW : Math.floor((totalW - gap) / 2);

  return { insetL, gap, chartGap, totalW, eachW, panel };
}

/** Escala de desenho: frame de export 1920×1080 ou 608×1080 (não o tamanho do player no DOM). */
export function overlayDrawScale(frameW: number, frameH: number, isVertical: boolean): { sx: number; sy: number } {
  return {
    sx: frameW / (isVertical ? 608 : 1920),
    sy: frameH / REF_H,
  };
}

/** Vertical 9:16 — painéis lado a lado na base. */
export function verticalChartsLayout(frameW: number, frameH: number, chartCount: number) {
  const panel = chartPanelMetrics("vertical", frameH, frameW);
  const insetL = Math.round(frameW * 0.015);
  const insetR = Math.round(frameW * 0.015);
  const gap = Math.round(0.35 * panel.emPx);
  const usableW = frameW - insetL - insetR;
  const eachW = chartCount === 2 ? Math.floor((usableW - gap) / 2) : usableW;
  return { panel, insetL, gap, eachW };
}
