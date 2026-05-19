import {
  altitudeMToFt,
  formatVerticalSpeedFpm,
  formatVideoAltitude,
  formatVideoHeading,
  formatVideoSpeed,
  speedMpsToKt,
  type AirspeedArcLimits,
  type VideoTelemetryPoint,
  type VideoTelemetryWidget,
} from "./videoTelemetry";
import { drawTelemetryChart } from "../components/VideoTelemetryOverlay";
import type { TelemetryOverlayStyle } from "../components/VideoTelemetryOverlay";

export { type TelemetryOverlayStyle };
export const CHROMAKEY_CSS = "#00ff00";

// ─── Interpolation (used by renderOverlayVideo) ───────────────────────────────

export function getPointAtMs(
  points: VideoTelemetryPoint[],
  ms: number,
): VideoTelemetryPoint | null {
  if (points.length === 0) return null;
  if (ms <= points[0].timeMs) return points[0];
  if (ms >= points[points.length - 1].timeMs) return points[points.length - 1];

  let lo = 0, hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timeMs <= ms) lo = mid;
    else hi = mid;
  }

  const a = points[lo], b = points[hi];
  const t = (ms - a.timeMs) / (b.timeMs - a.timeMs);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    timeMs: ms,
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    altitude: a.altitude != null && b.altitude != null ? lerp(a.altitude, b.altitude) : (a.altitude ?? b.altitude),
    speed: a.speed != null && b.speed != null ? lerp(a.speed, b.speed) : (a.speed ?? b.speed),
    heading: a.heading != null && b.heading != null ? lerp(a.heading, b.heading) : (a.heading ?? b.heading),
  };
}

// ─── Vertical speed ───────────────────────────────────────────────────────────

function computeVsFpm(points: VideoTelemetryPoint[], currentMs: number): number | null {
  if (points.length < 2) return null;
  const windowMs = 3000;
  const a = getPointAtMs(points, currentMs - windowMs);
  const b = getPointAtMs(points, currentMs);
  if (!a || !b || a.altitude == null || b.altitude == null) return null;
  const dtMin = (b.timeMs - a.timeMs) / 60000;
  if (dtMin <= 0) return null;
  return ((b.altitude - a.altitude) * 3.28084) / dtMin;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

type Ctx2D = CanvasRenderingContext2D;

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draw a chart panel (bg-black/55 border-white/15). Returns panel height.
function drawChartPanel(
  ctx: Ctx2D,
  points: VideoTelemetryPoint[],
  currentPoint: VideoTelemetryPoint | null,
  key: "altitude" | "speed",
  title: string,
  x: number, y: number, w: number, chartH: number,
  r: number, titleSize: number, titleGap: number, pad: number,
): number {
  const panelH = pad + titleSize + titleGap + chartH + pad;

  roundRect(ctx, x, y, w, panelH, r);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  roundRect(ctx, x, y, w, panelH, r);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = `700 ${titleSize}px system-ui,sans-serif`;
  ctx.fillStyle = "#e0f2fe";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, x + pad, y + pad);

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = Math.round(w - pad * 2);
  tmpCanvas.height = Math.round(chartH);
  drawTelemetryChart(tmpCanvas, points, currentPoint, key);
  ctx.drawImage(tmpCanvas, x + pad, y + pad + titleSize + titleGap, w - pad * 2, chartH);

  return panelH;
}

// HUD-corner chart panel (hudCorner style: flex-1 p-1.5 pb-0.5). Draws in-place.
function drawHudChartPanel(
  ctx: Ctx2D,
  points: VideoTelemetryPoint[],
  currentPoint: VideoTelemetryPoint | null,
  key: "altitude" | "speed",
  title: string,
  x: number, y: number, w: number, h: number,
  r: number, sy: number,
): void {
  const padTop  = Math.round(6 * sy);   // p-1.5
  const padBot  = Math.round(2 * sy);   // pb-0.5
  const padX    = Math.round(6 * sy);
  const titleSz = Math.round(9 * sy);   // text-[9px]
  const titleGap = Math.round(2 * sy);  // mb-0.5

  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = `700 ${titleSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#e0f2fe";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, x + padX, y + padTop);

  const chartX = x + padX;
  const chartY = y + padTop + titleSz + titleGap;
  const chartW = w - padX * 2;
  const chartH = h - padTop - titleSz - titleGap - padBot;
  if (chartW > 0 && chartH > 0) {
    const tmp = document.createElement("canvas");
    tmp.width = Math.round(chartW);
    tmp.height = Math.round(chartH);
    drawTelemetryChart(tmp, points, currentPoint, key);
    ctx.drawImage(tmp, chartX, chartY, chartW, chartH);
  }
}

// TelemetryPill: rounded-md border-white/15 bg-black/65 label+value
function drawPill(
  ctx: Ctx2D,
  label: string, value: string,
  x: number, y: number,
  padX: number, padY: number,
  labelSize: number, valueSize: number, r: number,
): number {
  ctx.font = `700 ${labelSize}px system-ui,sans-serif`;
  const labelW = ctx.measureText(label + " ").width;
  ctx.font = `600 ${valueSize}px system-ui,sans-serif`;
  const valueW = ctx.measureText(value).width;
  const pillW = padX * 2 + labelW + valueW;
  const pillH = padY * 2 + valueSize;

  roundRect(ctx, x, y - pillH, pillW, pillH, r);
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fill();
  roundRect(ctx, x, y - pillH, pillW, pillH, r);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = `700 ${labelSize}px system-ui,sans-serif`;
  ctx.fillStyle = "#bae6fd";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y - pillH / 2);

  ctx.font = `600 ${valueSize}px system-ui,sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(value, x + padX + labelW, y - pillH / 2);

  return pillW;
}

// Brand mark: bg-black/45 with school name
function drawBrandMark(
  ctx: Ctx2D, name: string,
  x: number, y: number,
  textSize: number, padX: number, padY: number, r: number,
) {
  if (!name) return;
  ctx.font = `700 ${textSize}px system-ui,sans-serif`;
  const textW = ctx.measureText(name.toUpperCase()).width;
  const w = padX * 2 + textW;
  const h = padY * 2 + textSize;

  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), x + padX, y + h / 2);
}

// ─── HUD tape helpers ─────────────────────────────────────────────────────────

type TapeKind = "speed" | "altitude";

const VSI_SCALE_MIN = -10;
const VSI_SCALE_MAX = 10;
const SPEED_ARC_OPACITY = 0.55;

function tapeSpan(kind: TapeKind): number { return kind === "speed" ? 60 : 600; }
function tapeStep(kind: TapeKind): number { return kind === "speed" ? 10 : 100; }
function tapeInvert(kind: TapeKind): boolean { return kind === "speed" || kind === "altitude"; }

function tapeRange(kind: TapeKind, value: number, arcs?: AirspeedArcLimits | null): { min: number; max: number } {
  if (kind === "speed" && arcs) {
    const vals = [arcs.whiteMin, arcs.whiteMax, arcs.greenMin, arcs.greenMax, arcs.yellowMin, arcs.yellowMax, arcs.vne]
      .filter((n): n is number => n != null && Number.isFinite(n));
    const pad = 10;
    return { min: Math.min(...vals, value) - pad, max: Math.max(...vals, arcs.vne ?? value, value) + pad };
  }
  const span = tapeSpan(kind);
  return { min: value - span / 2, max: value + span / 2 };
}

function arcSegments(arcs: AirspeedArcLimits, tapeMax: number): Array<{ min: number; max: number; color: string }> {
  const segs: Array<{ min: number; max: number; color: string }> = [];
  if (arcs.whiteMin != null && arcs.whiteMax != null) segs.push({ min: arcs.whiteMin, max: arcs.whiteMax, color: "#f8fafc" });
  if (arcs.greenMin != null && arcs.greenMax != null) segs.push({ min: arcs.greenMin, max: arcs.greenMax, color: "#22c55e" });
  if (arcs.yellowMin != null && arcs.yellowMax != null) segs.push({ min: arcs.yellowMin, max: arcs.yellowMax, color: "#eab308" });
  const redFrom = arcs.yellowMax ?? arcs.vne;
  if (redFrom != null && tapeMax > redFrom) segs.push({ min: redFrom, max: tapeMax, color: "#ef4444" });
  return segs;
}

// ─── HUD scrolling tape ───────────────────────────────────────────────────────
// Matches HudScrollingTape React component exactly.
// cx/cy = CENTER of the tape rectangle in canvas pixels.

function drawScrollingTape(
  ctx: Ctx2D,
  kind: TapeKind,
  value: number,
  arcs: AirspeedArcLimits | null,
  cx: number, cy: number, tapeW: number, tapeH: number,
  sx: number, sy: number,
  side: "left" | "right",
) {
  const invert = tapeInvert(kind);
  const { min, max } = tapeRange(kind, value, arcs ?? undefined);
  const span = max - min || 1;
  const step = tapeStep(kind);
  const r = Math.round(4 * Math.min(sx, sy));
  const x = cx - tapeW / 2;
  const y = cy - tapeH / 2;

  // Background (slate-900/42)
  roundRect(ctx, x, y, tapeW, tapeH, r);
  ctx.fillStyle = "rgba(15,23,42,0.42)";
  ctx.fill();

  // Label at top: pt-0.5 + text-[9px] ≈ 14px CSS
  const labelH = Math.round(14 * sy);
  // Unit at bottom: pb-0.5 + text-[8px] ≈ 12px CSS
  const unitH = Math.round(12 * sy);
  // Track margins: mx-1.5 = 6px
  const mxPx = Math.round(6 * sx);

  const trackX = x + mxPx;
  const trackY = y + labelH;
  const trackW = tapeW - mxPx * 2;
  const trackH = tapeH - labelH - unitH;
  const trackCenterY = trackY + trackH / 2;
  const pxPerUnit = trackH / span;

  // Clip to track
  ctx.save();
  ctx.beginPath();
  ctx.rect(trackX, trackY, trackW, trackH);
  ctx.clip();

  // Color arcs (speed only) — right side, w-2 = 8px
  if (kind === "speed" && arcs) {
    const arcW = Math.round(8 * sx);
    for (const seg of arcSegments(arcs, max)) {
      // For inverted tape: higher values appear above center
      // topRelY = relativeY of the higher value (above = negative)
      const topRelY = invert ? (value - seg.max) * pxPerUnit : (seg.max - value) * pxPerUnit;
      const botRelY = invert ? (value - seg.min) * pxPerUnit : (seg.min - value) * pxPerUnit;
      const arcTop = trackCenterY + topRelY;
      const arcBot = trackCenterY + botRelY;
      const arcH = Math.max(2, arcBot - arcTop);
      if (arcH > 0 && arcBot > trackY && arcTop < trackY + trackH) {
        ctx.fillStyle = seg.color;
        ctx.globalAlpha = SPEED_ARC_OPACITY;
        ctx.fillRect(x + tapeW - mxPx - arcW, arcTop, arcW, arcH);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Tick marks and labels
  const tickLabelSz = Math.round(9 * sy);
  const tickW = Math.round(12 * sx);   // w-3
  const tickLabelW = Math.round(20 * sx); // w-5

  const startTick = Math.floor(min / step) * step;
  for (let tick = startTick; tick <= max + step; tick += step) {
    // relY: positive = below center, negative = above center
    const relY = invert ? (value - tick) * pxPerUnit : (tick - value) * pxPerUnit;
    const screenY = trackCenterY + relY;
    if (screenY < trackY - 2 || screenY > trackY + trackH + 2) continue;

    // Tick line on right side
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + tapeW - mxPx - tickW, screenY);
    ctx.lineTo(x + tapeW - mxPx, screenY);
    ctx.stroke();

    // Tick label on left side
    const label = kind === "altitude"
      ? String(Math.round(tick / 100) * 100).slice(0, 4)
      : String(Math.round(tick));
    ctx.font = `${tickLabelSz}px system-ui,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, trackX + tickLabelW, screenY);
  }

  ctx.restore();

  // Center reference line (inset-x-0 top-1/2 h-px bg-white/35)
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(trackX, trackCenterY);
  ctx.lineTo(trackX + trackW, trackCenterY);
  ctx.stroke();

  // Current value box (black/85 bg, pointer arrow)
  const valueStr = String(Math.round(value));
  const valSz = Math.round(18 * sy);  // text-lg
  ctx.font = `700 ${valSz}px system-ui,sans-serif`;
  const valTxtW = ctx.measureText(valueStr).width;
  const bpX = Math.round(8 * sx);  // px-2
  const bpY = Math.round(4 * sy);  // py-1
  const boxW = valTxtW + bpX * 2;
  const boxH = valSz + bpY * 2;
  const arrowW = Math.round(7 * sx);
  const arrowH = Math.round(6 * sy);

  const boxX = side === "left" ? trackX : trackX + trackW - boxW;
  const boxY = trackCenterY - boxH / 2;

  ctx.fillStyle = "rgba(0,0,0,0.85)";
  roundRect(ctx, boxX, boxY, boxW, boxH, Math.round(4 * Math.min(sx, sy)));
  ctx.fill();

  // Arrow (triangle pointing away from box toward center)
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  if (side === "left") {
    // box on left → arrow points right
    ctx.moveTo(boxX + boxW, trackCenterY - arrowH);
    ctx.lineTo(boxX + boxW + arrowW, trackCenterY);
    ctx.lineTo(boxX + boxW, trackCenterY + arrowH);
  } else {
    // box on right → arrow points left
    ctx.moveTo(boxX, trackCenterY - arrowH);
    ctx.lineTo(boxX - arrowW, trackCenterY);
    ctx.lineTo(boxX, trackCenterY + arrowH);
  }
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 ${valSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(valueStr, boxX + bpX, trackCenterY);

  // Top label (SPD/ALT in sky-200, text-[9px])
  const topLblSz = Math.round(9 * sy);
  ctx.font = `700 ${topLblSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#bae6fd";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(kind === "speed" ? "SPD" : "ALT", cx, y + Math.round(2 * sy));

  // Bottom unit (kt/ft in slate-400, text-[8px])
  const unitSz = Math.round(8 * sy);
  ctx.font = `${unitSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(kind === "speed" ? "kt" : "ft", cx, y + tapeH - Math.round(2 * sy));
}

// ─── HUD VSI tape ─────────────────────────────────────────────────────────────
// Matches HudVsiTape React component: fixed -10…+10 scale, pointer moves.
// cx/cy = CENTER of VSI tape rectangle.

function drawVsiTape(
  ctx: Ctx2D,
  vsFpm: number,
  cx: number, cy: number, tapeW: number, tapeH: number,
  sx: number, sy: number,
) {
  const x = cx - tapeW / 2;
  const y = cy - tapeH / 2;
  const r = Math.round(4 * Math.min(sx, sy));

  // Background (slate-900/42)
  roundRect(ctx, x, y, tapeW, tapeH, r);
  ctx.fillStyle = "rgba(15,23,42,0.42)";
  ctx.fill();

  const labelH = Math.round(14 * sy);
  const unitH  = Math.round(12 * sy);
  const mxPx   = Math.round(2 * sx);  // mx-0.5

  const trackX = x + mxPx;
  const trackY = y + labelH;
  const trackW = tapeW - mxPx * 2;
  const trackH = tapeH - labelH - unitH;
  const span   = VSI_SCALE_MAX - VSI_SCALE_MIN; // 20

  const displayFpm  = Math.round(vsFpm / 50) * 50;
  const scaleValue  = Math.max(VSI_SCALE_MIN, Math.min(VSI_SCALE_MAX, displayFpm / 100));

  // Fixed ticks every 2 units
  const tickLblSz = Math.round(9 * sy);
  const tickLblW  = Math.round(24 * sx); // w-6
  const tickLineW = Math.round(8 * sx);  // mr-1 w-2

  for (let t = VSI_SCALE_MIN; t <= VSI_SCALE_MAX; t += 2) {
    const tickY = trackY + ((t - VSI_SCALE_MIN) / span) * trackH;
    const label = t === 0 ? "0" : t > 0 ? `+${t}` : String(t);
    ctx.font = `${tickLblSz}px system-ui,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, trackX + tickLblW, tickY);

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + tapeW - mxPx - tickLineW, tickY);
    ctx.lineTo(x + tapeW - mxPx, tickY);
    ctx.stroke();
  }

  // Center reference line
  const midY = trackY + trackH / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(trackX, midY);
  ctx.lineTo(trackX + trackW, midY);
  ctx.stroke();

  // Moving pointer box (side="right" in React: box on right side with left-pointing arrow)
  const pointerY = trackY + ((scaleValue - VSI_SCALE_MIN) / span) * trackH;
  const valStr   = formatVerticalSpeedFpm(displayFpm);
  const valSz    = Math.round(14 * sy); // text-sm
  ctx.font = `700 ${valSz}px system-ui,sans-serif`;
  const valTxtW  = ctx.measureText(valStr).width;
  const bpX      = Math.round(4 * sx);
  const bpY      = Math.round(2 * sy);
  const boxW     = Math.max(Math.round(36 * sx), valTxtW + bpX * 2); // min-w-[2.25rem]=36px
  const boxH     = valSz + bpY * 2;
  const arrowW   = Math.round(7 * sx);
  const arrowH   = Math.round(6 * sy);

  // In React: side="right", so the box is on the right and arrow points left
  const boxX = trackX + trackW - boxW;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  roundRect(ctx, boxX, pointerY - boxH / 2, boxW, boxH, Math.round(4 * Math.min(sx, sy)));
  ctx.fill();

  // Arrow pointing left (from box toward center of tape)
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.moveTo(boxX, pointerY - arrowH);
  ctx.lineTo(boxX - arrowW, pointerY);
  ctx.lineTo(boxX, pointerY + arrowH);
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 ${valSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(valStr, boxX + boxW / 2, pointerY);

  // Top label "VS" sky-200
  const topLblSz = Math.round(9 * sy);
  ctx.font = `700 ${topLblSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#bae6fd";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("VS", cx, y + Math.round(2 * sy));

  // Bottom unit "fpm" slate-400
  const unitSz = Math.round(8 * sy);
  ctx.font = `${unitSz}px system-ui,sans-serif`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("fpm", cx, y + tapeH - Math.round(2 * sy));
}

// ─── HUD geometry elements ────────────────────────────────────────────────────

// Horizon arc: absolute inset-x-0 top-5 → h-44 w-[34rem] max-w-[58%] rounded-full border-t-2 border-white/85
function drawHorizonArc(ctx: Ctx2D, width: number, sx: number, sy: number) {
  const divH   = 176 * sy;  // h-44
  const divW   = Math.min(544 * sx, 0.58 * width); // w-[34rem] max-w-[58%]
  const centerX = width / 2;
  const divTop  = 20 * sy;  // top-5
  const ellipseCy = divTop + divH / 2;
  const rx = divW / 2;
  const ry = divH / 2;

  ctx.beginPath();
  // Counterclockwise from 0 (right) to π (left) traces the upper arc through -π/2 (top)
  ctx.ellipse(centerX, ellipseCy, rx, ry, 0, 0, Math.PI, true);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2 * Math.min(sx, sy);
  ctx.stroke();
}

// Crosshairs: two horizontal lines at 44% and 52% height
function drawCrosshairs(ctx: Ctx2D, width: number, height: number, sx: number, sy: number) {
  // top-[44%] w-24 (96px) bg-white/80
  const line1Y = height * 0.44;
  const line1W = 96 * sx;
  ctx.strokeStyle = "rgba(255,255,255,0.80)";
  ctx.lineWidth = Math.max(1, sy);
  ctx.beginPath();
  ctx.moveTo(width / 2 - line1W / 2, line1Y);
  ctx.lineTo(width / 2 + line1W / 2, line1Y);
  ctx.stroke();

  // top-[52%] w-16 (64px) bg-white/70
  const line2Y = height * 0.52;
  const line2W = 64 * sx;
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.beginPath();
  ctx.moveTo(width / 2 - line2W / 2, line2Y);
  ctx.lineTo(width / 2 + line2W / 2, line2Y);
  ctx.stroke();
}

// ─── HUD overlay layout ───────────────────────────────────────────────────────

function drawHudOverlay(
  ctx: Ctx2D,
  point: VideoTelemetryPoint,
  allPoints: VideoTelemetryPoint[],
  widgets: VideoTelemetryWidget[],
  width: number, height: number,
  brand: string,
  airspeedArcs: AirspeedArcLimits | null,
  sx: number, sy: number,
) {
  const show = (w: VideoTelemetryWidget) => widgets.includes(w);
  const r4 = Math.round(4 * Math.min(sx, sy));

  // ── Brand mark: absolute left-1/2 top-6 -translate-x-1/2 ─────────────────
  if (brand) {
    // text-sm=14px, px-2.5=10px, py-1.5=6px
    const txtSz = Math.round(14 * sy);
    const padX  = Math.round(10 * sx);
    const padY  = Math.round(6  * sy);
    ctx.font = `700 ${txtSz}px system-ui,sans-serif`;
    const textW = ctx.measureText(brand.toUpperCase()).width;
    const bw = padX * 2 + textW;
    const bh = padY * 2 + txtSz;
    const bx = width / 2 - bw / 2;
    const by = Math.round(24 * sy); // top-6

    roundRect(ctx, bx, by, bw, bh, r4);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(brand.toUpperCase(), bx + padX, by + bh / 2);
  }

  // ── Horizon arc ────────────────────────────────────────────────────────────
  drawHorizonArc(ctx, width, sx, sy);

  // ── Crosshairs ─────────────────────────────────────────────────────────────
  drawCrosshairs(ctx, width, height, sx, sy);

  // ── Speed tape: HUD_TAPE_ANCHOR = absolute top-1/2 -translate-x-1/2 -translate-y-1/2
  //    HUD_SPEED_TAPE_X = left-[27%], HUD_TAPE_HEIGHT = h-[56%], w-24 = 96px
  const tapeCY   = height / 2;
  const tapeH    = 0.56 * height;

  if (show("speed")) {
    const speedKt = speedMpsToKt(point.speed ?? null);
    if (speedKt != null) {
      const spdCX = 0.27 * width;
      const spdW  = Math.round(96 * sx); // w-24, inCluster
      drawScrollingTape(ctx, "speed", speedKt, airspeedArcs, spdCX, tapeCY, spdW, tapeH, sx, sy, "left");
    }
  }

  // ── Alt+VSI cluster: left-[73%], flex w-[12.5rem]=200px, gap-0.5=2px
  //    ALT tape: w-20=80px, embedded; VSI tape: w-[3.25rem]=52px
  if (show("altitude")) {
    const altFt = altitudeMToFt(point.altitude ?? null);
    if (altFt != null) {
      const vsFpm    = computeVsFpm(allPoints, point.timeMs) ?? 0;
      const clusterW = Math.round(200 * sx); // 12.5rem = 200px
      const gapPx    = Math.round(2 * sx);   // gap-0.5
      const altW     = Math.round(80 * sx);  // w-20
      const vsiW     = Math.round(52 * sx);  // w-[3.25rem]
      const clusterCX = 0.73 * width;
      // Cluster spans from (clusterCX - clusterW/2) to (clusterCX + clusterW/2)
      const clusterLeft = clusterCX - clusterW / 2;
      const altCX = clusterLeft + altW / 2;
      const vsiCX = clusterLeft + altW + gapPx + vsiW / 2;

      drawScrollingTape(ctx, "altitude", altFt, null, altCX, tapeCY, altW, tapeH, sx, sy, "right");
      drawVsiTape(ctx, vsFpm, vsiCX, tapeCY, vsiW, tapeH, sx, sy);
    }
  }

  // ── Heading pill: absolute bottom-12 left-1/2 -translate-x-1/2
  //    rounded bg-black/55 px-3 py-1.5 text-lg font-black text-white
  //    "HDG " + heading value in sky-200
  if (show("heading")) {
    const hdgVal = formatVideoHeading(point.heading ?? null);
    const hdgSz  = Math.round(18 * sy); // text-lg
    const padX   = Math.round(12 * sx); // px-3
    const padY   = Math.round(6  * sy); // py-1.5

    ctx.font = `900 ${hdgSz}px system-ui,sans-serif`;
    const lblW = ctx.measureText("HDG ").width; // space included
    const valW = ctx.measureText(hdgVal).width;
    const pillW = padX * 2 + lblW + valW;
    const pillH = padY * 2 + hdgSz;
    const pillX = width / 2 - pillW / 2;
    const pillY = height - Math.round(48 * sy); // bottom-12 = 48px

    roundRect(ctx, pillX, pillY - pillH, pillW, pillH, r4);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill();

    ctx.font = `900 ${hdgSz}px system-ui,sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("HDG ", pillX + padX, pillY - pillH / 2);
    ctx.fillStyle = "#bae6fd"; // sky-200
    ctx.fillText(hdgVal, pillX + padX + lblW, pillY - pillH / 2);
  }

  // ── HUD charts (HudLeftCorner): absolute bottom-8 left-3 flex gap-1.5
  //    Chart height: clamp(3.5rem,12vh,4.5rem) = clamp(56px,12vh,72px)
  const hasAltChart   = show("altitudeChart");
  const hasSpeedChart = show("speedChart");
  if (hasAltChart || hasSpeedChart) {
    const chartCount = (hasAltChart ? 1 : 0) + (hasSpeedChart ? 1 : 0);
    const left3  = Math.round(12 * sx);
    const bottom8 = Math.round(32 * sy); // bottom-8
    const gap1_5 = Math.round(6 * sx);  // gap-1.5

    // HUD_LEFT_CORNER_MAX = calc(22%-1rem) = 0.22*playerWidth - 16px (in CSS)
    // We work in canvas pixels so: 0.22*width - 16*sx
    const maxW = 0.22 * width - Math.round(16 * sx);

    let totalW: number;
    if (chartCount === 2) {
      totalW = Math.min(maxW, Math.round(352 * sx)); // min(calc(22%-1rem), 22rem=352px)
    } else {
      totalW = Math.min(Math.round(184 * sx), maxW); // min(11.5rem=184px, calc(22%-1rem))
    }

    // Chart panel height: clamp(56px, 12vh=0.12*height, 72px) in canvas pixels
    const chartInnerH = Math.round(Math.max(56 * sy, Math.min(0.12 * height, 72 * sy)));

    // Title + padding to compute full panel height
    const padTop   = Math.round(6 * sy);  // p-1.5
    const padBot   = Math.round(2 * sy);  // pb-0.5
    const titleSz  = Math.round(9 * sy);
    const titleGap = Math.round(2 * sy);
    const panelH   = padTop + titleSz + titleGap + chartInnerH + padBot;

    const panelY = height - bottom8 - panelH;

    const eachW = chartCount === 1
      ? totalW
      : Math.floor((totalW - gap1_5) / 2);

    let curX = left3;
    if (hasAltChart) {
      drawHudChartPanel(ctx, allPoints, point, "altitude", "ALT FT", curX, panelY, eachW, panelH, r4, sy);
      curX += eachW + gap1_5;
    }
    if (hasSpeedChart) {
      drawHudChartPanel(ctx, allPoints, point, "speed", "SPD KT", curX, panelY, eachW, panelH, r4, sy);
    }
  }
}

// ─── Compact overlay layout ───────────────────────────────────────────────────

function drawCompactOverlay(
  ctx: Ctx2D,
  point: VideoTelemetryPoint,
  allPoints: VideoTelemetryPoint[],
  widgets: VideoTelemetryWidget[],
  width: number, height: number,
  brand: string,
  sx: number, sy: number,
) {
  const show = (w: VideoTelemetryWidget) => widgets.includes(w);

  const left3    = Math.round(12 * sx);
  const top3     = Math.round(12 * sy);
  const top12    = Math.round(48 * sy);
  const bottom14 = Math.round(56 * sy);
  const gap2     = Math.round(8 * sx);
  const padX     = Math.round(10 * sx);
  const padY     = Math.round(4  * sy);
  const chartPad = Math.round(6 * Math.min(sx, sy));
  const r6       = Math.round(6 * Math.min(sx, sy));
  const r4       = Math.round(4 * Math.min(sx, sy));
  const textSm   = Math.round(14 * sy);
  const text10   = Math.round(10 * sy);
  const text9    = Math.round(9  * sy);
  const text11   = Math.round(11 * sy);
  const titleGap = Math.round(4 * sy);
  const chartH   = Math.round(Math.max(64 * sy, Math.min(height * 0.14, 96 * sy)));

  // Brand mark: left-3 top-3 (compact style)
  if (brand) {
    drawBrandMark(ctx, brand, left3, top3, text11, Math.round(10 * sx), Math.round(6 * sy), r4);
  }

  // LeftTelemetryStack: left-3 top-12, w-[min(15rem,42vw)]
  const stackW = Math.min(Math.round(240 * sx), Math.round(width * 0.42));
  let stackY = top12;

  if (show("altitudeChart")) {
    const h = drawChartPanel(ctx, allPoints, point, "altitude", "ALTITUDE", left3, stackY, stackW, chartH, r4, text9, titleGap, chartPad);
    stackY += h + gap2;
  }

  if (show("speedChart")) {
    drawChartPanel(ctx, allPoints, point, "speed", "VELOCIDADE", left3, stackY, stackW, chartH, r4, text9, titleGap, chartPad);
  }

  // Pills: absolute bottom-14 left-3
  const pillsY = height - bottom14;
  let pillX = left3;

  if (show("speed")) {
    const w = drawPill(ctx, "SPD", formatVideoSpeed(point.speed ?? null), pillX, pillsY, padX, padY, text10, textSm, r6);
    pillX += w + gap2;
  }

  if (show("altitude")) {
    const w = drawPill(ctx, "ALT", formatVideoAltitude(point.altitude ?? null), pillX, pillsY, padX, padY, text10, textSm, r6);
    pillX += w + gap2;
    const vsFpm = computeVsFpm(allPoints, point.timeMs);
    const vsVal = vsFpm != null ? `${formatVerticalSpeedFpm(vsFpm)} fpm` : "-";
    const w2 = drawPill(ctx, "VS", vsVal, pillX, pillsY, padX, padY, text10, textSm, r6);
    pillX += w2 + gap2;
  }

  if (show("heading")) {
    drawPill(ctx, "HDG", formatVideoHeading(point.heading ?? null), pillX, pillsY, padX, padY, text10, textSm, r6);
  }
}

// ─── Vertical overlay layout ──────────────────────────────────────────────────
// Matches VerticalCompactOverlay React component exactly.

function drawVerticalOverlay(
  ctx: Ctx2D,
  point: VideoTelemetryPoint,
  allPoints: VideoTelemetryPoint[],
  widgets: VideoTelemetryWidget[],
  width: number, height: number,
  brand: string,
  sx: number, sy: number,
) {
  const show = (w: VideoTelemetryWidget) => widgets.includes(w);
  const r4 = Math.round(4 * Math.min(sx, sy));

  // Usable height (bottom-[9%] in React)
  const usableH = Math.round(height * 0.91);
  const left2   = Math.round(8 * sx);
  const right2  = Math.round(8 * sx);
  const usableW = width - left2 - right2;
  const gap1    = Math.round(4 * sx);  // gap-1

  // Brand mark: compact style → left-3 top-3
  if (brand) {
    const top3 = Math.round(12 * sy); // top-3 ≈ 12px
    drawBrandMark(ctx, brand, left2, top3, Math.round(11 * sy), Math.round(10 * sx), Math.round(6 * sy), r4);
  }

  // Chart panel dimensions
  const hasAltChart   = show("altitudeChart");
  const hasSpeedChart = show("speedChart");
  const hasCharts     = hasAltChart || hasSpeedChart;
  const chartPad    = Math.round(4 * sx);   // p-1
  const chartTitleSz = Math.round(9 * sy);  // text-[9px]
  const chartTitleGap = Math.round(2 * sy); // mb-0.5
  const chartInnerH = Math.round(64 * sy);  // h-16
  const panelH = chartPad + chartTitleSz + chartTitleGap + chartInnerH + chartPad;

  // Pills geometry
  const pillPadX  = Math.round(10 * sx);
  const pillPadY  = Math.round(4  * sy);
  const pillLblSz = Math.round(10 * sy);
  const pillValSz = Math.round(14 * sy);
  const pillH     = pillPadY * 2 + pillValSz;
  const pillGap   = Math.round(6 * sx); // gap-1.5
  const pillPb    = Math.round(2 * sy); // pb-0.5

  // Compute stacking from bottom: pills → charts → gap
  const pillsBottomY = usableH - pillPb;               // bottom of pills
  const chartsBottomY = pillsBottomY - pillH - gap1;   // bottom of charts row
  const chartsTopY   = chartsBottomY - panelH;

  // Draw charts (side by side)
  if (hasCharts) {
    const chartCount = (hasAltChart ? 1 : 0) + (hasSpeedChart ? 1 : 0);
    const eachW = chartCount === 2 ? Math.floor((usableW - gap1) / 2) : usableW;
    let curX = left2;
    if (hasAltChart) {
      drawHudChartPanel(ctx, allPoints, point, "altitude", "ALT FT", curX, chartsTopY, eachW, panelH, r4, sy);
      curX += eachW + gap1;
    }
    if (hasSpeedChart) {
      drawHudChartPanel(ctx, allPoints, point, "speed", "SPD KT", curX, chartsTopY, eachW, panelH, r4, sy);
    }
  }

  // Draw pills (inline, left-aligned)
  let pillX = left2;
  const drawP = (label: string, value: string) => {
    const w = drawPill(ctx, label, value, pillX, pillsBottomY, pillPadX, pillPadY, pillLblSz, pillValSz, r4);
    pillX += w + pillGap;
  };
  if (show("speed"))    drawP("SPD", formatVideoSpeed(point.speed ?? null));
  if (show("altitude")) {
    drawP("ALT", formatVideoAltitude(point.altitude ?? null));
    const vsFpm = computeVsFpm(allPoints, point.timeMs);
    drawP("VS", vsFpm != null ? `${formatVerticalSpeedFpm(vsFpm)} fpm` : "-");
  }
  if (show("heading"))  drawP("HDG", formatVideoHeading(point.heading ?? null));
}

// ─── Main draw ────────────────────────────────────────────────────────────────

export function drawOverlayFrame(
  ctx: Ctx2D,
  point: VideoTelemetryPoint | null,
  allPoints: VideoTelemetryPoint[],
  widgets: VideoTelemetryWidget[],
  width: number,
  height: number,
  brand: string,
  isVertical: boolean,
  playerWidth: number,
  playerHeight: number,
  overlayStyle: TelemetryOverlayStyle = "compact",
  airspeedArcs: AirspeedArcLimits | null = null,
) {
  // Transparent background (alpha channel used for compositing)
  ctx.clearRect(0, 0, width, height);

  if (!point) return;

  const sx = width / playerWidth;
  const sy = height / playerHeight;

  if (isVertical) {
    drawVerticalOverlay(ctx, point, allPoints, widgets, width, height, brand, sx, sy);
  } else if (overlayStyle === "hud") {
    drawHudOverlay(ctx, point, allPoints, widgets, width, height, brand, airspeedArcs, sx, sy);
  } else {
    drawCompactOverlay(ctx, point, allPoints, widgets, width, height, brand, sx, sy);
  }
}
