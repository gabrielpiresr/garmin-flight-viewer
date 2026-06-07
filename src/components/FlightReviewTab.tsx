import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getAircraftByRegistration } from "../lib/aircraftDb";
import {
  analyzeFlightManeuver,
  buildReviewSummary,
  deriveReviewStatus,
  TELEMETRY_FIELD_MAP,
  TELEMETRY_PARAMETER_LABELS,
} from "../lib/flightManeuverAnalysis";
import { makeConsecutiveLegs } from "../lib/trafficPattern";
import {
  createFlightManeuver,
  deleteFlightManeuver,
  listFlightManeuvers,
  listFlightManeuverReviews,
  updateFlightManeuver,
  upsertFlightManeuverReview,
} from "../lib/flightManeuversDb";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { getSavedFlight } from "../lib/flightsDb";
import { detectFlightSegments } from "../lib/flightSegments";
import { parseGarminCsv } from "../lib/parseGarminCsv";
import type { ParseResult } from "../lib/parseGarminCsv";
import { listManeuverTemplates, listManeuverTemplateSteps, getManeuverTemplate } from "../lib/maneuverTemplatesDb";
import { DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import type { SavedFlightFull, SavedFlightListItem } from "../lib/flightsDb";
import type {
  AnalyzedParameter,
  AnalyzedStep,
  FlightManeuver,
  FlightManeuverReview,
  ManeuverTemplate,
  ManeuverTemplateStep,
} from "../types/flightReview";
import { MANEUVER_CATEGORY_LABELS } from "../types/flightReview";
import type { FlightPoint } from "../types/flight";
import { FlightMap } from "./FlightMap";
import { useToast } from "./ui/ToastProvider";
import CsvWorker from "../workers/csvWorker?worker";

// ---------- Constants ----------

const STEP_COLORS = [
  "#38bdf8", "#f59e0b", "#34d399", "#f87171",
  "#a78bfa", "#fb923c", "#22d3ee", "#c084fc",
  "#86efac", "#fda4af",
];

const SEVERITY_LINE_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

/** Cores das pernas do circuito (mesmas que PatternLegBar). */
const LEG_COLORS: Record<string, string> = {
  downwind: "#c4b5fd",
  base:     "#fdba74",
  final:    "#86efac",
};

const LEG_LABELS: Record<string, string> = {
  downwind: "Do vento",
  base:     "Base",
  final:    "Final",
};

// ---------- Helpers ----------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDateTime(iso: string): string {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

// ---------- Telemetry helpers ----------

/** Extract per-second data points for one telemetry field within a time window. */
function extractFieldPoints(
  parsed: ParseResult,
  startMs: number,
  endMs: number,
  fieldKey: string,
): Array<{ t: number; v: number }> {
  if (!parsed.chartTimeBaseMs) return [];
  const base = parsed.chartTimeBaseMs;
  return parsed.chartData
    .filter((row) => {
      const abs = base + row.x;
      return abs >= startMs && abs <= endMs && row[fieldKey] != null;
    })
    .map((row) => ({
      t: Math.round((base + row.x - startMs) / 1000),
      v: row[fieldKey] as number,
    }));
}

/** Y-axis domain with 20% padding, also stretching to cover reference lines.
 *  If `symmetric` is true the result is forced to be symmetric around 0 (e.g. bank angle). */
function computeYDomain(
  data: Array<{ v: number }>,
  refMin: number | null,
  refMax: number | null,
  symmetric = false,
): [number, number] {
  const vals = data.map((d) => d.v);
  if (refMin !== null) vals.push(refMin);
  if (refMax !== null) vals.push(refMax);
  if (vals.length === 0) return symmetric ? [-1, 1] : [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo || Math.abs(lo) * 0.1 || 1;
  const pad = range * 0.2;
  if (symmetric) {
    const edge = Math.ceil(Math.max(Math.abs(lo - pad), Math.abs(hi + pad)));
    return [-edge, edge];
  }
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}

/** Binary-search for the closest GPS point at a given chart x-offset (ms from base). */
function findHoverPos(
  points: FlightPoint[],
  baseMs: number,
  xMs: number,
): [number, number] | null {
  if (points.length === 0) return null;
  const targetT = baseMs + xMs;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const t = points[mid]?.t;
    if (t != null && t < targetT) lo = mid + 1;
    else hi = mid;
  }
  let best: FlightPoint | null = null;
  let bestDiff = Infinity;
  for (const p of [points[Math.max(0, lo - 1)], points[lo]]) {
    if (!p || p.t == null) continue;
    const diff = Math.abs(p.t - targetT);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best ? [best.lat, best.lon] : null;
}

// ---------- Status display ----------

const REVIEW_STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  ok: { label: "OK", badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  attention: { label: "Atenção", badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  critical: { label: "Crítico", badgeClass: "bg-red-500/10 text-red-400 border-red-500/20" },
  unavailable: { label: "Indisponível", badgeClass: "bg-slate-500/10 text-slate-400 border-slate-600/30" },
  draft: { label: "Rascunho", badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  analyzed: { label: "Analisada", badgeClass: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = REVIEW_STATUS_CONFIG[status] ?? REVIEW_STATUS_CONFIG.unavailable;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  );
}

const SEVERITY_CONFIG: Record<string, string> = {
  low: "text-sky-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

// ---------- Charts ----------

type ReviewChartRange = {
  x1: number;
  x2: number;
  color: string;
};

type ReviewChartReference = {
  y: number;
  /** Se definido, a linha é diagonal — sobe/desce de y (início) até y_end (fim do chart). */
  y_end?: number;
  color: string;
  label?: string;
};

type ReviewChartVerticalLine = {
  t: number;
  color: string;
  label?: string;
};

function CanvasReviewChart({
  data,
  label,
  color,
  domain,
  height,
  ranges = [],
  references = [],
  verticalLines = [],
  zeroCrossLine = false,
  formatY,
  activeT,
  onHoverT,
}: {
  data: Array<{ t: number; v: number }>;
  label: string;
  color: string;
  domain: [number, number];
  height: number;
  ranges?: ReviewChartRange[];
  references?: ReviewChartReference[];
  verticalLines?: ReviewChartVerticalLine[];
  /** Se true, traça uma linha horizontal pontilhada em y=0 (útil para ângulos como rolagem). */
  zeroCrossLine?: boolean;
  formatY: (value: number) => string;
  activeT?: number | null;
  onHoverT?: (t: number | null) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeTRef = useRef<number | null>(activeT ?? null);
  const scheduleDrawRef = useRef<(() => void) | null>(null);
  const lastHoverTRef = useRef<number | null>(null);

  useEffect(() => {
    activeTRef.current = activeT ?? null;
    scheduleDrawRef.current?.();
  }, [activeT]);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas || data.length === 0) return undefined;
    let frame = 0;
    let delayedTimers: number[] = [];

    const draw = () => {
      frame = 0;
      const rect = shell.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = Math.floor(width * dpr);
      const canvasHeight = Math.floor(height * dpr);
      if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
      if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
      const styleWidth = `${width}px`;
      const styleHeight = `${height}px`;
      if (canvas.style.width !== styleWidth) canvas.style.width = styleWidth;
      if (canvas.style.height !== styleHeight) canvas.style.height = styleHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const left = 48;
      const right = 10;
      const top = 8;
      const bottom = 22;
      const plotW = Math.max(1, width - left - right);
      const plotH = Math.max(1, height - top - bottom);
      const xMin = data[0]?.t ?? 0;
      const xMax = data[data.length - 1]?.t ?? 1;
      const yMin = domain[0];
      const yMax = domain[1];
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const toX = (x: number) => left + ((x - xMin) / xSpan) * plotW;
      const toY = (y: number) => top + plotH - ((y - yMin) / ySpan) * plotH;

      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#64748b";
      ctx.font = "10px system-ui, sans-serif";
      ctx.lineWidth = 1;
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i += 1) {
        const y = top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillText(formatY(yMax - (ySpan * i) / 4), 4, y);
      }
      ctx.textBaseline = "top";
      for (let i = 0; i <= 4; i += 1) {
        const x = left + (plotW * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        ctx.fillText(`${Math.round(xMin + (xSpan * i) / 4)}s`, Math.min(width - 32, Math.max(left, x - 10)), top + plotH + 4);
      }

      for (const range of ranges) {
        const x1 = toX(range.x1);
        const x2 = toX(range.x2);
        ctx.fillStyle = hexToRgba(range.color, 0.12);
        ctx.fillRect(Math.min(x1, x2), top, Math.abs(x2 - x1), plotH);
        ctx.strokeStyle = hexToRgba(range.color, 0.45);
        ctx.strokeRect(Math.min(x1, x2), top, Math.abs(x2 - x1), plotH);
      }

      for (const reference of references) {
        const yStart = reference.y;
        const yEndVal = reference.y_end ?? reference.y;
        if (yStart < yMin && yEndVal < yMin) continue;
        if (yStart > yMax && yEndVal > yMax) continue;
        const yPixStart = toY(yStart);
        const yPixEnd = toY(yEndVal);
        ctx.save();
        ctx.strokeStyle = reference.color;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(left, yPixStart);
        ctx.lineTo(width - right, yPixEnd);
        ctx.stroke();
        ctx.restore();
        if (reference.label) {
          ctx.fillStyle = reference.color;
          ctx.fillText(reference.label, left + 4, Math.max(top, yPixStart - 12));
        }
      }

      // Linha horizontal em y=0 (ex: rolagem neutra)
      if (zeroCrossLine && yMin <= 0 && yMax >= 0) {
        const y0 = toY(0);
        ctx.save();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, y0);
        ctx.lineTo(width - right, y0);
        ctx.stroke();
        ctx.setLineDash([]);
        // Labels de lado: positivo = Dir. (direita/subida), negativo = Esq. (esquerda/descida)
        ctx.fillStyle = "#64748b";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        if (y0 - top > 22) ctx.fillText("Dir. ▲", width - right - 4, y0 - 14);
        if (top + plotH - y0 > 22) ctx.fillText("Esq. ▼", width - right - 4, y0 + 14);
        ctx.textAlign = "left";
        ctx.restore();
      }

      // Linhas verticais de evento (ex: touchdown)
      for (const vLine of verticalLines) {
        if (vLine.t < xMin || vLine.t > xMax) continue;
        const x = toX(vLine.t);
        ctx.save();
        ctx.strokeStyle = vLine.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        ctx.restore();
        if (vLine.label) {
          ctx.fillStyle = vLine.color;
          ctx.font = "10px system-ui, sans-serif";
          ctx.textBaseline = "top";
          const lx = Math.min(x + 3, width - right - 40);
          ctx.fillText(vLine.label, lx, top + 2);
        }
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.9;
      const linePoints: Array<{ x: number; y: number }> = [];
      for (const point of data) {
        if (!Number.isFinite(point.v)) continue;
        linePoints.push({ x: toX(point.t), y: toY(point.v) });
      }
      drawSmoothReviewLine(ctx, linePoints);

      const activeTValue = activeTRef.current;
      if (activeTValue != null) {
        const activePoint = findNearestReviewPoint(data, activeTValue);
        if (activePoint && activePoint.t >= xMin && activePoint.t <= xMax && Number.isFinite(activePoint.v)) {
          const x = toX(activePoint.t);
          const y = toY(activePoint.v);
          ctx.save();
          ctx.strokeStyle = "rgba(226, 232, 240, 0.72)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#0f172a";
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    const scheduleDraw = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    };
    const delayedDraw = () => {
      delayedTimers.forEach((timer) => window.clearTimeout(timer));
      delayedTimers = [];
      scheduleDraw();
      delayedTimers = [220, 700].map((delay) => window.setTimeout(scheduleDraw, delay));
    };
    scheduleDrawRef.current = scheduleDraw;

    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(shell);
    const visibilityObserver =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) scheduleDraw();
          })
        : null;
    visibilityObserver?.observe(shell);
    window.addEventListener("resize", delayedDraw);
    window.addEventListener("orientationchange", delayedDraw);
    window.addEventListener("pageshow", delayedDraw);
    document.addEventListener("visibilitychange", delayedDraw);
    window.visualViewport?.addEventListener("resize", delayedDraw);
    delayedDraw();
    return () => {
      observer.disconnect();
      visibilityObserver?.disconnect();
      window.removeEventListener("resize", delayedDraw);
      window.removeEventListener("orientationchange", delayedDraw);
      window.removeEventListener("pageshow", delayedDraw);
      document.removeEventListener("visibilitychange", delayedDraw);
      window.visualViewport?.removeEventListener("resize", delayedDraw);
      delayedTimers.forEach((timer) => window.clearTimeout(timer));
      if (scheduleDrawRef.current === scheduleDraw) scheduleDrawRef.current = null;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [color, data, domain, formatY, height, ranges, references, verticalLines, zeroCrossLine]);

  useEffect(() => {
    const shell = shellRef.current;
    const tooltip = tooltipRef.current;
    if (!shell || !tooltip || activeT == null || data.length === 0) {
      hideReviewTooltip(tooltipRef.current);
      return;
    }
    const point = findNearestReviewPoint(data, activeT);
    if (!point) {
      hideReviewTooltip(tooltip);
      return;
    }
    const rect = shell.getBoundingClientRect();
    const left = 48;
    const right = 10;
    const top = 8;
    const bottom = 22;
    const plotW = Math.max(1, rect.width - left - right);
    const plotH = Math.max(1, height - top - bottom);
    const xMin = data[0]?.t ?? 0;
    const xMax = data[data.length - 1]?.t ?? 1;
    if (activeT < xMin || activeT > xMax) {
      hideReviewTooltip(tooltip);
      return;
    }
    const xSpan = xMax - xMin || 1;
    const ySpan = domain[1] - domain[0] || 1;
    const x = left + ((point.t - xMin) / xSpan) * plotW;
    const y = top + plotH - ((point.v - domain[0]) / ySpan) * plotH;
    showReviewTooltip(tooltip, label, point.t, formatY(point.v), x, y, rect.width);
  }, [activeT, data, domain, formatY, height, label]);

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") return;
    const shell = shellRef.current;
    if (!shell || data.length === 0) return;
    const rect = shell.getBoundingClientRect();
    const left = 48;
    const right = 10;
    const plotW = Math.max(1, rect.width - left - right);
    const xMin = data[0]?.t ?? 0;
    const xMax = data[data.length - 1]?.t ?? 1;
    const xSpan = xMax - xMin || 1;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - left) / plotW));
    const point = findNearestReviewPoint(data, xMin + ratio * xSpan);
    if (point && point.t !== lastHoverTRef.current) {
      lastHoverTRef.current = point.t;
      onHoverT?.(point.t);
    }
  };

  const handlePointerLeave = () => {
    lastHoverTRef.current = null;
    onHoverT?.(null);
    hideReviewTooltip(tooltipRef.current);
  };

  return (
    <div ref={shellRef} className="relative min-w-0 overflow-hidden rounded-md bg-slate-950/30" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 hidden rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-200 shadow-lg"
      />
    </div>
  );
}

function findNearestReviewPoint(data: Array<{ t: number; v: number }>, targetT: number) {
  if (data.length === 0) return null;
  let lo = 0;
  let hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((data[mid]?.t ?? 0) < targetT) lo = mid + 1;
    else hi = mid;
  }
  const prev = data[Math.max(0, lo - 1)];
  const next = data[lo];
  if (!prev) return next ?? null;
  if (!next) return prev;
  return Math.abs(prev.t - targetT) <= Math.abs(next.t - targetT) ? prev : next;
}

function drawSmoothReviewLine(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  if (points.length === 1) {
    ctx.lineTo(points[0]!.x + 0.01, points[0]!.y);
  } else {
    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i]!;
      const next = points[i + 1]!;
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = points[points.length - 1]!;
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

function showReviewTooltip(
  tooltip: HTMLDivElement,
  label: string,
  t: number,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  tooltip.classList.remove("hidden");
  tooltip.innerHTML = `<div class="font-medium text-slate-100">${label}</div><div>${Math.round(t)}s - ${value}</div>`;
  const tooltipWidth = tooltip.offsetWidth || 112;
  // Flipa para esquerda quando o ponto está no terço direito do gráfico
  const preferLeft = x > width * 0.65;
  const rawLeft = preferLeft ? x - tooltipWidth - 10 : x + 10;
  const left = Math.min(Math.max(6, rawLeft), Math.max(6, width - tooltipWidth - 6));
  const top = Math.max(6, y - 28);
  tooltip.style.transform = `translate(${left}px, ${top}px)`;
}

function hideReviewTooltip(tooltip: HTMLDivElement | null) {
  if (!tooltip) return;
  tooltip.classList.add("hidden");
}

type ModalTelemetryPoint = {
  x: number;
  alt: number | null;
  ias: number | null;
  rpm: number | null;
};

function ModalTelemetryChart({
  color,
  data,
  dataKey,
  domain,
  extraMarks,
  height,
  label,
  onHoverX,
  onSelectX,
  selectionEnd,
  selectionStart,
  tickFmt,
  telemetryBaseMs,
  totalMs,
}: {
  color: string;
  data: ModalTelemetryPoint[];
  dataKey: "alt" | "ias" | "rpm";
  domain: [number, number] | null;
  extraMarks?: Array<{ x: number; color: string; label: string }>;
  height: number;
  label: string;
  onHoverX: (x: number | null) => void;
  onSelectX: (x: number) => void;
  selectionEnd: number | null;
  selectionStart: number | null;
  tickFmt: (value: number) => string;
  telemetryBaseMs: number;
  totalMs: number;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const xDomain = useMemo<[number, number]>(() => domain ?? [0, totalMs], [domain, totalMs]);
  const visibleData = useMemo(
    () => data.filter((point) => point.x >= xDomain[0] && point.x <= xDomain[1] && point[dataKey] !== null),
    [data, dataKey, xDomain],
  );
  const yDomain = useMemo(() => {
    const values = visibleData.map((point) => point[dataKey]).filter((value): value is number => value !== null);
    if (values.length === 0) return [0, 1] as [number, number];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = min === max ? Math.max(Math.abs(min) * 0.08, 1) : (max - min) * 0.08;
    return [min - pad, max + pad] as [number, number];
  }, [dataKey, visibleData]);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) return undefined;
    let frame = 0;

    const draw = () => {
      frame = 0;
      const rect = shell.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const left = 48;
      const right = 10;
      const top = 8;
      const bottom = 22;
      const plotW = Math.max(1, width - left - right);
      const plotH = Math.max(1, height - top - bottom);
      const [xMin, xMax] = xDomain;
      const [yMin, yMax] = yDomain;
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const toX = (x: number) => left + ((x - xMin) / xSpan) * plotW;
      const toY = (y: number) => top + plotH - ((y - yMin) / ySpan) * plotH;

      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#64748b";
      ctx.font = "10px system-ui, sans-serif";
      ctx.lineWidth = 1;
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i += 1) {
        const y = top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillText(tickFmt(yMax - (ySpan * i) / 4), 4, y);
      }
      ctx.textBaseline = "top";
      for (let i = 0; i <= 4; i += 1) {
        const x = left + (plotW * i) / 4;
        const value = xMin + (xSpan * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        ctx.fillText(formatHHMM(value, telemetryBaseMs), Math.min(width - right - 42, Math.max(left, x - 18)), top + plotH + 4);
      }

      if (selectionStart !== null && selectionEnd !== null) {
        const sx1 = toX(selectionStart);
        const sx2 = toX(selectionEnd);
        ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
        ctx.fillRect(Math.min(sx1, sx2), top, Math.abs(sx2 - sx1), plotH);
        ctx.strokeStyle = "rgba(34, 211, 238, 0.35)";
        ctx.strokeRect(Math.min(sx1, sx2), top, Math.abs(sx2 - sx1), plotH);
      }

      for (const marker of [
        { x: selectionStart, color: "#22d3ee", text: "Inicio" },
        { x: selectionEnd, color: "#f97316", text: "Fim" },
      ]) {
        if (marker.x === null || marker.x < xMin || marker.x > xMax) continue;
        const x = toX(marker.x);
        ctx.save();
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        ctx.fillStyle = marker.color;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(marker.text, Math.min(width - right - 24, Math.max(left + 24, x)), top + 2);
        ctx.restore();
      }

      if (extraMarks) {
        for (const em of extraMarks) {
          if (em.x < xMin || em.x > xMax) continue;
          const x = toX(em.x);
          ctx.save();
          ctx.strokeStyle = em.color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = em.color;
          ctx.font = "9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(em.label, Math.min(width - right - 20, Math.max(left + 20, x)), top + plotH - 14);
          ctx.restore();
        }
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      let active = false;
      for (const point of visibleData) {
        const value = point[dataKey];
        if (value === null || !Number.isFinite(value)) {
          active = false;
          continue;
        }
        const x = toX(point.x);
        const y = toY(value);
        if (!active) {
          ctx.moveTo(x, y);
          active = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    const scheduleDraw = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(shell);
    scheduleDraw();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [color, dataKey, extraMarks, height, selectionEnd, selectionStart, telemetryBaseMs, visibleData, xDomain, yDomain, tickFmt]);

  const xFromClient = (clientX: number): number | null => {
    const shell = shellRef.current;
    if (!shell) return null;
    const rect = shell.getBoundingClientRect();
    const left = 48;
    const right = 10;
    const plotW = Math.max(1, rect.width - left - right);
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - left) / plotW));
    return xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
  };

  const nearest = (x: number): ModalTelemetryPoint | null => {
    if (data.length === 0) return null;
    let best = data[0] ?? null;
    let bestDiff = Infinity;
    for (const point of data) {
      const diff = Math.abs(point.x - x);
      if (diff < bestDiff) {
        best = point;
        bestDiff = diff;
      } else if (point.x > x && diff > bestDiff) {
        break;
      }
    }
    return best;
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const tooltip = tooltipRef.current;
    const shell = shellRef.current;
    const x = xFromClient(event.clientX);
    if (!tooltip || !shell || x === null) return;
    const point = nearest(x);
    if (!point) return;
    onHoverX(point.x);
    const value = point[dataKey];
    tooltip.classList.remove("hidden");
    tooltip.innerHTML = `<div class="font-medium text-slate-100">${label}</div><div>${formatHHMMSS(point.x, telemetryBaseMs)} - ${value === null ? "-" : tickFmt(value)}</div>`;
    const rect = shell.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 132;
    const left = Math.min(Math.max(6, event.clientX - rect.left + 10), Math.max(6, rect.width - tooltipWidth - 6));
    const top = Math.max(6, event.clientY - rect.top - 18);
    tooltip.style.transform = `translate(${left}px, ${top}px)`;
  };

  const handlePointerLeave = () => {
    onHoverX(null);
    tooltipRef.current?.classList.add("hidden");
  };

  const handleClick = (event: PointerEvent<HTMLCanvasElement>) => {
    const x = xFromClient(event.clientX);
    if (x === null) return;
    const point = nearest(x);
    onSelectX(point?.x ?? x);
  };

  return (
    <div ref={shellRef} className="relative min-w-0 overflow-hidden rounded-md bg-slate-950/30" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 hidden rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-200 shadow-lg"
      />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Agrupa parâmetros pelo mesmo indicador de telemetria (ex: dois "bank" → um gráfico só). */
function groupParamsByIndicator(params: AnalyzedParameter[]): AnalyzedParameter[][] {
  const seen = new Set<string>();
  const result: AnalyzedParameter[][] = [];
  for (const p of params) {
    if (seen.has(p.parameter)) continue;
    seen.add(p.parameter);
    result.push(params.filter((q) => q.parameter === p.parameter));
  }
  return result;
}

/** Gera referências para um grupo de parâmetros com mesmo indicador. */
function buildGroupedRefs(group: AnalyzedParameter[]): {
  refs: ReviewChartReference[];
  domain: [number, number];
} {
  if (group.length === 0) return { refs: [], domain: [0, 1] };
  const p0 = group[0]!;
  const isBank = p0.parameter === "bank";
  const data = p0.data_points;
  const refs: ReviewChartReference[] = [];
  let domainMin: number | null = null;
  let domainMax: number | null = null;
  const multi = group.length > 1;

  for (const p of group) {
    const refColor = SEVERITY_LINE_COLORS[p.severity] ?? "#f59e0b";

    if (p.expected_min !== null) {
      const absMin = Math.abs(p.expected_min);
      // Para banco: pula o min negativo se ele tiver o mesmo valor absoluto que o max
      // (min=-10, max=10 são o mesmo limite ±10, não duplicar)
      const skipBankMin = isBank && p.expected_min < 0 &&
        p.expected_max !== null && Math.abs(absMin - Math.abs(p.expected_max)) < 0.01;
      if (!skipBankMin) {
        const yVal = isBank ? absMin : p.expected_min;
        const lbl = multi ? `mín ${absMin} (${p.label})` : isBank ? `±${absMin}` : `mín ${p.expected_min}`;
        // Positivo: label aqui
        refs.push({
          y: yVal,
          ...(p.expected_min_end != null ? { y_end: isBank ? Math.abs(p.expected_min_end) : p.expected_min_end } : {}),
          color: refColor,
          label: lbl,
        });
        if (isBank) {
          // Negativo: sem label (simétrico já identificado pelo positivo)
          refs.push({
            y: -absMin,
            ...(p.expected_min_end != null ? { y_end: -Math.abs(p.expected_min_end) } : {}),
            color: refColor,
          });
          if (domainMin === null || -absMin < domainMin) domainMin = -absMin;
        } else {
          if (domainMin === null || p.expected_min < domainMin) domainMin = p.expected_min;
        }
      }
    }

    if (p.expected_max !== null) {
      const absMax = Math.abs(p.expected_max);
      const yVal = isBank ? absMax : p.expected_max;
      const lbl = multi ? `máx ${absMax} (${p.label})` : isBank ? `±${absMax}` : `máx ${p.expected_max}`;
      // Positivo: label aqui
      refs.push({
        y: yVal,
        ...(p.expected_max_end != null ? { y_end: isBank ? Math.abs(p.expected_max_end) : p.expected_max_end } : {}),
        color: refColor,
        label: lbl,
      });
      if (isBank) {
        // Negativo: sem label
        refs.push({
          y: -absMax,
          ...(p.expected_max_end != null ? { y_end: -Math.abs(p.expected_max_end) } : {}),
          color: refColor,
        });
        if (domainMax === null || absMax > domainMax) domainMax = absMax;
      } else {
        if (domainMax === null || p.expected_max > domainMax) domainMax = p.expected_max;
      }
    }
  }

  const domain = computeYDomain(data, domainMin, domainMax, isBank);
  return { refs, domain };
}

function ParameterChart({
  params,
  syncId,
  activeT,
  onHoverT,
}: {
  params: AnalyzedParameter[];
  syncId: string;
  activeT: number | null;
  onHoverT: (t: number | null) => void;
}) {
  if (params.length === 0 || params[0]!.data_points.length === 0) return null;
  const p0 = params[0]!;
  const isBank = p0.parameter === "bank";
  const isPitch = p0.parameter === "pitch";
  const label = params.map((p) => p.label).filter((l, i, arr) => arr.indexOf(l) === i).join(" / ");
  const { refs, domain } = buildGroupedRefs(params);
  void syncId;
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
      <CanvasReviewChart
        data={p0.data_points}
        label={label}
        color="#38bdf8"
        domain={domain}
        height={200}
        references={refs}
        zeroCrossLine={isBank || isPitch}
        formatY={(value) => value.toFixed(1)}
        activeT={activeT}
        onHoverT={onHoverT}
      />
    </div>
  );
}

function SimpleFieldChart({
  data,
  label,
  color,
  syncId,
  activeT,
  onHoverT,
  unit = "",
}: {
  data: Array<{ t: number; v: number }>;
  label: string;
  color: string;
  syncId: string;
  activeT: number | null;
  onHoverT: (t: number | null) => void;
  unit?: string;
}) {
  if (data.length === 0) return null;
  const domain = computeYDomain(data, null, null);
  void syncId;
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
      <CanvasReviewChart
        data={data}
        label={label}
        color={color}
        domain={domain}
        height={180}
        formatY={(value) => `${value.toFixed(0)}${unit ? ` ${unit}` : ""}`}
        activeT={activeT}
        onHoverT={onHoverT}
      />
    </div>
  );
}

function routePointsForWindow(points: FlightPoint[], startMs: number, endMs: number): FlightPoint[] {
  const timed = points
    .map((point, index) => ({ point, index }))
    .filter((entry) => entry.point.t !== null);
  if (timed.length < 2) return [];

  const selected = new Set<number>();
  for (const entry of timed) {
    const t = entry.point.t as number;
    if (t >= startMs && t <= endMs) selected.add(entry.index);
  }
  if (selected.size >= 2) {
    return points.filter((_, index) => selected.has(index));
  }

  let before: { point: FlightPoint; index: number } | null = null;
  let after: { point: FlightPoint; index: number } | null = null;
  for (const entry of timed) {
    const t = entry.point.t as number;
    if (t <= startMs) before = entry;
    if (!after && t >= endMs) after = entry;
  }

  if (before) selected.add(before.index);
  if (after) selected.add(after.index);

  if (selected.size < 2) {
    const firstInside = timed.find((entry) => selected.has(entry.index));
    const anchorIndex = firstInside?.index ?? before?.index ?? after?.index ?? timed[0]!.index;
    const timedAnchorIndex = timed.findIndex((entry) => entry.index === anchorIndex);
    const previous = timed[Math.max(0, timedAnchorIndex - 1)];
    const next = timed[Math.min(timed.length - 1, timedAnchorIndex + 1)];
    if (previous) selected.add(previous.index);
    if (next) selected.add(next.index);
  }

  return points.filter((_, index) => selected.has(index));
}

// ---------- Maneuver overview (map + alt + IAS with per-step coloring) ----------

function ManeuverOverview({
  maneuver,
  review,
  parsedResult,
}: {
  maneuver: FlightManeuver;
  review: FlightManeuverReview;
  parsedResult: ParseResult;
}) {
  const maneuverStartMs = useMemo(() => new Date(maneuver.start_time).getTime(), [maneuver.start_time]);
  const maneuverEndMs = useMemo(() => new Date(maneuver.end_time).getTime(), [maneuver.end_time]);

  const altPoints = useMemo(
    () => extractFieldPoints(parsedResult, maneuverStartMs, maneuverEndMs, "gpsAltFt"),
    [parsedResult, maneuverStartMs, maneuverEndMs],
  );
  const iasPoints = useMemo(
    () => extractFieldPoints(parsedResult, maneuverStartMs, maneuverEndMs, "iasKt"),
    [parsedResult, maneuverStartMs, maneuverEndMs],
  );

  // Per-step color + time ranges (seconds offset from maneuver start)
  const stepRanges = useMemo(
    () =>
      review.analysis.steps.map((step, i) => ({
        name: step.name,
        color: STEP_COLORS[i % STEP_COLORS.length]!,
        startSec: Math.round((new Date(step.start_time).getTime() - maneuverStartMs) / 1000),
        endSec: Math.round((new Date(step.end_time).getTime() - maneuverStartMs) / 1000),
      })),
    [review.analysis.steps, maneuverStartMs],
  );

  // Traffic pattern leg ranges — com pernas consecutivas (sem gaps)
  const legRanges = useMemo(() => {
    const tp = review.analysis.trafficPattern;
    const baseMs = parsedResult.chartTimeBaseMs;
    if (!tp || !baseMs) return null;
    // Calcula o domínio da manobra em chart-x space (ms offset desde chartTimeBaseMs)
    const xMin = maneuverStartMs - baseMs;
    const xMax = maneuverEndMs   - baseMs;
    const consecutive = makeConsecutiveLegs(tp.legs, xMin, xMax, tp.touchdownX);
    if (consecutive.length === 0) return null;
    return consecutive.map((l) => ({
      type: l.type,
      color: LEG_COLORS[l.type] ?? "#94a3b8",
      label: LEG_LABELS[l.type] ?? l.type,
      startSec: Math.round((baseMs + l.startX - maneuverStartMs) / 1000),
      endSec:   Math.round((baseMs + l.endX   - maneuverStartMs) / 1000),
    }));
  }, [review.analysis.trafficPattern, parsedResult.chartTimeBaseMs, maneuverStartMs, maneuverEndMs]);

  // Segundo do toque (para marcador vertical nos gráficos)
  const touchdownVertLines = useMemo<ReviewChartVerticalLine[]>(() => {
    const tp = review.analysis.trafficPattern;
    const baseMs = parsedResult.chartTimeBaseMs;
    if (!tp || !baseMs || tp.touchdownX == null) return [];
    const t = (baseMs + tp.touchdownX - maneuverStartMs) / 1000;
    return [{ t, color: "#94a3b8", label: "TD" }];
  }, [review.analysis.trafficPattern, parsedResult.chartTimeBaseMs, maneuverStartMs]);

  // GPS segments for the map: full maneuver path + per-leg or per-step colored segments
  const { allMapPos, stepSegments } = useMemo(() => {
    const pts = routePointsForWindow(parsedResult.points, maneuverStartMs, maneuverEndMs);
    const allPos = pts.map((p) => [p.lat, p.lon] as [number, number]);
    const baseMs = parsedResult.chartTimeBaseMs;

    // Use leg segments when traffic pattern available
    let segs: { pts: [number, number][]; color: string; name: string }[];
    if (legRanges && baseMs) {
      const lastLegEnd = legRanges.length > 0 ? legRanges[legRanges.length - 1]!.endSec : -Infinity;
      segs = [
        ...legRanges.map((l) => {
          const sMs = maneuverStartMs + l.startSec * 1000;
          const eMs = maneuverStartMs + l.endSec * 1000;
          return {
            pts: routePointsForWindow(parsedResult.points, sMs, eMs).map((p) => [p.lat, p.lon] as [number, number]),
            color: l.color,
            name: l.label,
          };
        }),
        // Etapas após a última perna (ex: rolagem após pouso)
        ...review.analysis.steps
          .map((step, i) => ({ step, i }))
          .filter(({ step }) => {
            const endSec = Math.round((new Date(step.end_time).getTime() - maneuverStartMs) / 1000);
            return endSec > lastLegEnd;
          })
          .map(({ step, i }) => {
            const sMs = new Date(step.start_time).getTime();
            const eMs = new Date(step.end_time).getTime();
            return {
              pts: routePointsForWindow(parsedResult.points, sMs, eMs).map((p) => [p.lat, p.lon] as [number, number]),
              color: STEP_COLORS[i % STEP_COLORS.length]!,
              name: step.name,
            };
          }),
      ];
    } else {
      segs = review.analysis.steps.map((step, i) => {
        const sMs = new Date(step.start_time).getTime();
        const eMs = new Date(step.end_time).getTime();
        return {
          pts: routePointsForWindow(parsedResult.points, sMs, eMs).map((p) => [p.lat, p.lon] as [number, number]),
          color: STEP_COLORS[i % STEP_COLORS.length]!,
          name: step.name,
        };
      });
    }

    return { allMapPos: allPos, stepSegments: segs };
  }, [parsedResult.points, parsedResult.chartTimeBaseMs, review.analysis.steps, legRanges, maneuverStartMs, maneuverEndMs]);
  void stepSegments;

  const selectedRangeT = useMemo<[number, number]>(() => [maneuverStartMs, maneuverEndMs], [maneuverStartMs, maneuverEndMs]);

  const mapColoredSegments = useMemo(() => {
    const baseMs = parsedResult.chartTimeBaseMs;
    if (legRanges && baseMs) return null;
    return review.analysis.steps.map((step, i) => ({
      color: STEP_COLORS[i % STEP_COLORS.length]!,
      startMs: new Date(step.start_time).getTime(),
      endMs: new Date(step.end_time).getTime(),
    }));
  }, [legRanges, parsedResult.chartTimeBaseMs, review.analysis.steps]);

  const syncId = "maneuver-overview";
  const [hoverT, setHoverT] = useState<number | null>(null);
  const altDomain = useMemo(() => computeYDomain(altPoints, null, null), [altPoints]);
  const iasDomain = useMemo(() => computeYDomain(iasPoints, null, null), [iasPoints]);
  const chartRanges = useMemo(() => {
    if (legRanges && legRanges.length > 0) {
      // Pernas do circuito + etapas após a última perna (ex: rolagem após pouso)
      const legPart = legRanges.map((l) => ({ x1: l.startSec, x2: l.endSec, color: l.color }));
      const lastLegEnd = legRanges[legRanges.length - 1]!.endSec;
      const postLeg = stepRanges
        .filter((s) => s.endSec > lastLegEnd)
        .map((s) => ({ x1: s.startSec, x2: s.endSec, color: s.color }));
      return [...legPart, ...postLeg];
    }
    return stepRanges.map((s) => ({ x1: s.startSec, x2: s.endSec, color: s.color }));
  }, [stepRanges, legRanges]);
  void syncId;

  const hasMap = allMapPos.length >= 2;
  const hasAlt = altPoints.length > 0;
  const hasIas = iasPoints.length > 0;

  if (!hasMap && !hasAlt && !hasIas) return null;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Visão geral da manobra
        </p>
        {/* Leg legend (when traffic pattern detected) or step legend */}
        {legRanges && legRanges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-slate-500">Pernas:</span>
            {legRanges.map((l, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="text-xs" style={{ color: l.color }}>{l.label}</span>
              </div>
            ))}
            {/* Etapas após a última perna (ex: rolagem pós-pouso) */}
            {stepRanges
              .filter((s) => s.endSec > legRanges[legRanges.length - 1]!.endSec)
              .map((s, i) => (
                <div key={`post-${i}`} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-400">{s.name}</span>
                </div>
              ))
            }
          </div>
        ) : stepRanges.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {stepRanges.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-xs text-slate-400">{s.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Route map with per-step colored segments */}
      {hasMap && (
        <FlightMap
          points={parsedResult.points}
          selectedRangeT={selectedRangeT}
          className="h-[220px] min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950"
          chartTimeBaseMs={parsedResult.chartTimeBaseMs}
          trafficPattern={review.analysis.trafficPattern ?? null}
          coloredSegments={mapColoredSegments}
        />
      )}

      {/* Altitude chart with step shading */}
      {hasAlt && (
        <div className="flex h-[154px] min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-slate-400">Altitude (ft)</p>
          <CanvasReviewChart
            data={altPoints}
            label="Altitude (ft)"
            color="#94a3b8"
            domain={altDomain}
            height={130}
            ranges={chartRanges}
            verticalLines={touchdownVertLines}
            formatY={(value) => `${Math.round(value)}ft`}
            activeT={hoverT}
            onHoverT={setHoverT}
          />
        </div>
      )}

      {/* IAS chart with step shading */}
      {hasIas && (
        <div className="flex h-[134px] min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-slate-400">IAS (kt)</p>
          <CanvasReviewChart
            data={iasPoints}
            label="IAS (kt)"
            color="#38bdf8"
            domain={iasDomain}
            height={110}
            ranges={chartRanges}
            verticalLines={touchdownVertLines}
            formatY={(value) => `${value.toFixed(1)}kt`}
            activeT={hoverT}
            onHoverT={setHoverT}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Step view ----------

function StepCard({
  step,
  stepIndex,
  parsedResult,
}: {
  step: AnalyzedStep;
  stepIndex: number;
  parsedResult: ParseResult | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const syncId = `step-${stepIndex}`;

  const startMs = useMemo(() => new Date(step.start_time).getTime(), [step.start_time]);
  const endMs = useMemo(() => new Date(step.end_time).getTime(), [step.end_time]);

  const altPoints = useMemo(
    () => (parsedResult ? extractFieldPoints(parsedResult, startMs, endMs, "gpsAltFt") : []),
    [parsedResult, startMs, endMs],
  );
  const iasPoints = useMemo(
    () => (parsedResult ? extractFieldPoints(parsedResult, startMs, endMs, "iasKt") : []),
    [parsedResult, startMs, endMs],
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusBadge status={step.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200">{step.name}</p>
          <p className="text-xs text-slate-500">
            {formatDateTime(step.start_time)} → {formatDateTime(step.end_time)} · {formatDuration(step.duration_seconds)}
          </p>
        </div>
        <span className="text-slate-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-4">
          {step.expected_execution_text && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-500">
                Execução esperada
              </p>
              <p className="text-sm text-sky-200 leading-relaxed">{step.expected_execution_text}</p>
            </div>
          )}

          {step.alerts.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Alertas</p>
              {step.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className={`mt-0.5 text-xs font-bold ${SEVERITY_CONFIG[alert.severity] ?? "text-slate-400"}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <p className="text-xs text-slate-300">{alert.message}</p>
                </div>
              ))}
            </div>
          )}

          {step.parameters.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Parâmetros</p>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="px-3 py-2 text-left font-medium">Parâmetro</th>
                      <th className="px-3 py-2 text-right font-medium">Mín obs.</th>
                      <th className="px-3 py-2 text-right font-medium">Máx obs.</th>
                      <th className="px-3 py-2 text-right font-medium">Média</th>
                      <th className="px-3 py-2 text-right font-medium">Faixa esperada</th>
                      <th className="px-3 py-2 text-right font-medium">Fora (s)</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.parameters.map((p, i) => (
                      <tr key={i} className="border-b border-slate-800/50 last:border-0">
                        <td className="px-3 py-2 text-slate-300">{p.label}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.min_observed !== null ? p.min_observed : "–"}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.max_observed !== null ? p.max_observed : "–"}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.avg_observed !== null ? p.avg_observed : "–"}</td>
                        <td className="px-3 py-2 text-right text-slate-400">
                          {p.expected_min !== null || p.expected_max !== null
                            ? `${p.expected_min ?? "–"} – ${p.expected_max ?? "–"}`
                            : "–"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.time_out_of_range_seconds}</td>
                        <td className="px-3 py-2 text-center"><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reference charts (altitude + IAS only if not already a configured parameter) */}
          {(() => {
            const paramKeys = new Set(step.parameters.map((p) => p.parameter));
            const showAlt = !paramKeys.has("altitude") && altPoints.length > 0;
            const showIas = !paramKeys.has("ias") && iasPoints.length > 0;
            const hasAnyChart = showAlt || showIas || step.parameters.length > 0;
            if (!hasAnyChart) return null;
            return (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Gráficos</p>
                {showAlt && (
                  <SimpleFieldChart
                    data={altPoints}
                    label="Altitude (ft)"
                    color="#94a3b8"
                    syncId={syncId}
                    unit="ft"
                    activeT={hoverT}
                    onHoverT={setHoverT}
                  />
                )}
                {showIas && (
                  <SimpleFieldChart
                    data={iasPoints}
                    label="IAS (kt)"
                    color="#38bdf8"
                    syncId={syncId}
                    unit="kt"
                    activeT={hoverT}
                    onHoverT={setHoverT}
                  />
                )}
                {groupParamsByIndicator(step.parameters).map((group, i) => (
                  <ParameterChart key={i} params={group} syncId={syncId} activeT={hoverT} onHoverT={setHoverT} />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ---------- Maneuver card ----------

function ManeuverCard({
  maneuver,
  template,
  review,
  isInstructor,
  flightId,
  csvText,
  parsedResult,
  onDeleted,
  onAnalyzed,
  onMarked,
  onEdit,
}: {
  maneuver: FlightManeuver;
  template: ManeuverTemplate | undefined;
  review: FlightManeuverReview | undefined;
  isInstructor: boolean;
  flightId: string;
  csvText: string | null;
  parsedResult: ParseResult | null;
  onDeleted: (id: string) => void;
  onAnalyzed: (review: FlightManeuverReview, updatedManeuver: FlightManeuver) => void;
  onMarked: (updated: FlightManeuver) => void;
  onEdit?: () => void;
}) {
  const { showToast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMarkSteps, setShowMarkSteps] = useState(false);
  const [templateSteps, setTemplateSteps] = useState<ManeuverTemplateStep[] | null>(null);

  // Carrega as etapas do template para detectar se há etapas com instructor_marked
  useEffect(() => {
    if (!isInstructor) return;
    listManeuverTemplateSteps(maneuver.template_id).then(setTemplateSteps);
  }, [isInstructor, maneuver.template_id]);

  const sortedTemplateSteps = useMemo(
    () => (templateSteps ?? []).slice().sort((a, b) => a.order_index - b.order_index),
    [templateSteps],
  );

  const hasInstructorMarkedSteps = useMemo(
    () =>
      sortedTemplateSteps.some(
        (s, i) => s.end_condition?.type === "instructor_marked" && i < sortedTemplateSteps.length - 1,
      ),
    [sortedTemplateSteps],
  );

  const needsMarking =
    hasInstructorMarkedSteps && !(maneuver.instructor_step_marks?.length);

  const durationMs =
    maneuver.start_time && maneuver.end_time
      ? new Date(maneuver.end_time).getTime() - new Date(maneuver.start_time).getTime()
      : 0;
  const durationSec = Math.round(durationMs / 1000);

  /**
   * When loaded from DB, data_points are stripped (size limit).
   * Reconstruct them from the already-parsed CSV so charts always work.
   * When review comes fresh from handleAnalyze (in-memory), data_points are
   * already populated — skip reconstruction in that case.
   */
  const liveReview = useMemo<FlightManeuverReview | undefined>(() => {
    if (!review || !parsedResult?.chartTimeBaseMs) return review;
    const alreadyHasData = review.analysis.steps.some((s) =>
      s.parameters.some((p) => p.data_points.length > 0),
    );
    if (alreadyHasData) return review;
    const augSteps = review.analysis.steps.map((step) => {
      const sMs = new Date(step.start_time).getTime();
      const eMs = new Date(step.end_time).getTime();
      const augParams = step.parameters.map((param) => {
        const fieldKey = TELEMETRY_FIELD_MAP[param.parameter] ?? param.parameter;
        return { ...param, data_points: extractFieldPoints(parsedResult, sMs, eMs, fieldKey) };
      });
      return { ...step, parameters: augParams };
    });
    return { ...review, analysis: { ...review.analysis, steps: augSteps } };
  }, [review, parsedResult]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const { data: flightData } = await getSavedFlight(flightId);
      const { telemetryCsv: analysisCsv } = decodeFlightRecord(flightData?.csv_text ?? "");
      if (!analysisCsv) {
        showToast({ variant: "error", message: "Telemetria não encontrada para análise." });
        return;
      }
      const [tmpl, steps] = await Promise.all([
        getManeuverTemplate(maneuver.template_id),
        listManeuverTemplateSteps(maneuver.template_id),
      ]);
      if (!tmpl) {
        showToast({ variant: "error", message: "Template de manobra não encontrado." });
        return;
      }
      const analysisResult = analyzeFlightManeuver(maneuver, tmpl, steps, analysisCsv);
      const status = deriveReviewStatus(analysisResult);
      const summary = buildReviewSummary(analysisResult, status);
      const savedReview = await upsertFlightManeuverReview({
        flight_maneuver_id: maneuver.id,
        flight_id: flightId,
        status,
        summary,
        analysis: analysisResult,
        existing_id: review?.id,
      });
      const updatedManeuver = await updateFlightManeuver(maneuver.id, { status: "analyzed" });
      // Use full in-memory analysis (with data_points for charts) rather than the stripped DB response
      onAnalyzed({ ...savedReview, analysis: analysisResult }, updatedManeuver);
      setExpanded(true);
      showToast({ variant: "success", message: "Análise concluída." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Excluir esta marcação de manobra?")) return;
    setDeleting(true);
    try {
      await deleteFlightManeuver(maneuver.id);
      onDeleted(maneuver.id);
      showToast({ variant: "success", message: "Manobra removida." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-100">{template?.name ?? "Manobra"}</p>
            <StatusBadge status={maneuver.status} />
            {review && <StatusBadge status={review.status} />}
            {template && (
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">
                {MANEUVER_CATEGORY_LABELS[template.category] ?? template.category}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDateTime(maneuver.start_time)} → {formatDateTime(maneuver.end_time)} · {formatDuration(durationSec)}
          </p>
          {review && (
            <p className="mt-1 text-xs text-slate-400">
              {buildReviewSummary(review.analysis, review.status)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isInstructor && (
            <>
              {hasInstructorMarkedSteps && (
                <button
                  type="button"
                  onClick={() => setShowMarkSteps(true)}
                  className={`rounded border px-3 py-1.5 text-xs font-medium ${
                    needsMarking
                      ? "border-amber-600/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      : "border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {needsMarking ? "Marcar etapas !" : "Marcar etapas"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={analyzing}
                className="rounded border border-violet-700/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20 disabled:opacity-50"
              >
                {analyzing ? "Analisando..." : review ? "Reanalisar" : "Analisar"}
              </button>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded border border-red-800/40 px-2 py-1 text-xs text-red-400 hover:bg-red-950/30 disabled:opacity-50"
              >
                Excluir
              </button>
            </>
          )}
          {liveReview && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
            >
              {expanded ? "Ocultar review" : "Ver review"}
            </button>
          )}
        </div>
      </div>

      {expanded && liveReview && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-3">
          {/* Overview: map + alt + IAS with per-step coloring */}
          {liveReview.analysis.steps.length > 0 && parsedResult && (
            <ManeuverOverview maneuver={maneuver} review={liveReview} parsedResult={parsedResult} />
          )}

          {liveReview.analysis.alerts.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-500">
                Alertas gerais
              </p>
              <ul className="space-y-1">
                {liveReview.analysis.alerts.map((alert, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-200">
                    <span className={`font-bold ${SEVERITY_CONFIG[alert.severity] ?? ""}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span>{alert.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {liveReview.analysis.steps.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Etapas ({liveReview.analysis.steps.length})
              </p>
              {liveReview.analysis.steps.map((step, i) => (
                <StepCard key={i} step={step} stepIndex={i} parsedResult={parsedResult} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhuma etapa analisada.</p>
          )}
        </div>
      )}

      {showMarkSteps && (
        <MarkStepsModal
          maneuver={maneuver}
          csvText={csvText}
          templateId={maneuver.template_id}
          onClose={() => setShowMarkSteps(false)}
          onMarked={(updated) => {
            onMarked(updated);
            setShowMarkSteps(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Mark steps modal ----------

/** Cores para as marcações de etapa (sequencial, reaproveita a paleta de step colors). */
const MARK_COLORS = ["#f59e0b", "#34d399", "#f87171", "#a78bfa", "#fb923c", "#22d3ee", "#c084fc"];

function MarkStepsModal({
  maneuver,
  csvText,
  templateId,
  onClose,
  onMarked,
}: {
  maneuver: FlightManeuver;
  csvText: string | null;
  templateId: string;
  onClose: () => void;
  onMarked: (updated: FlightManeuver) => void;
}) {
  const { showToast } = useToast();
  const [templateSteps, setTemplateSteps] = useState<ManeuverTemplateStep[] | null>(null);
  const [marks, setMarks] = useState<number[]>(() => {
    if (!maneuver.instructor_step_marks?.length) return [];
    return [];
  });
  const [saving, setSaving] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const mapHoverRef = useRef<((pos: [number, number] | null) => void) | null>(null);

  const telemetry = useMemo<TelemetryPreview | null>(() => {
    if (!csvText) return null;
    try {
      const parsed = parseGarminCsv(csvText);
      const { chartData, chartTimeBaseMs, points: flightPoints } = parsed;
      if (!chartTimeBaseMs || chartData.length === 0) return null;
      const totalMs = chartData[chartData.length - 1]?.x ?? 0;
      const step = Math.max(1, Math.ceil(chartData.length / 500));
      const points = chartData
        .filter((_, i) => i % step === 0)
        .map((row) => ({
          x: row.x as number,
          alt: (row["gpsAltFt"] as number | null) ?? null,
          ias: (row["iasKt"] as number | null) ?? null,
          rpm: (row["rpm"] as number | null) ?? null,
        }));
      return { points, baseMs: chartTimeBaseMs, totalMs, flightPoints };
    } catch {
      return null;
    }
  }, [csvText]);

  // Pré-carrega os marks existentes no estado assim que temos telemetria
  useEffect(() => {
    if (!maneuver.instructor_step_marks?.length || !telemetry) return;
    const preloaded = maneuver.instructor_step_marks
      .map((iso) => new Date(iso).getTime() - telemetry.baseMs)
      .filter((x) => x >= 0);
    setMarks(preloaded);
  // Só na montagem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry]);

  useEffect(() => {
    listManeuverTemplateSteps(templateId).then(setTemplateSteps);
  }, [templateId]);

  const sortedSteps = useMemo(
    () => (templateSteps ?? []).slice().sort((a, b) => a.order_index - b.order_index),
    [templateSteps],
  );

  // Etapas que precisam de marcação: as que têm instructor_marked, exceto a última etapa do template
  const stepsToMark = useMemo(
    () =>
      sortedSteps.filter(
        (s, i) => s.end_condition?.type === "instructor_marked" && i < sortedSteps.length - 1,
      ),
    [sortedSteps],
  );

  const marksNeeded = stepsToMark.length;
  const currentMarkIdx = marks.length; // índice da próxima marcação a fazer

  // Limites da manobra no eixo X da telemetria
  const maneuverStartX = telemetry ? new Date(maneuver.start_time).getTime() - telemetry.baseMs : 0;
  const maneuverEndX = telemetry ? new Date(maneuver.end_time).getTime() - telemetry.baseMs : 0;
  // Domínio fixo no janela da manobra
  const chartDomain = telemetry ? ([maneuverStartX, maneuverEndX] as [number, number]) : null;

  const handleChartSelect = useCallback(
    (xMs: number) => {
      if (currentMarkIdx >= marksNeeded) return;
      const minX = marks.length > 0 ? marks[marks.length - 1]! : maneuverStartX;
      if (xMs <= minX || xMs >= maneuverEndX) return;
      setMarks((prev) => [...prev, xMs]);
    },
    [currentMarkIdx, marksNeeded, marks, maneuverStartX, maneuverEndX],
  );

  const handleUndo = () => setMarks((prev) => prev.slice(0, -1));
  const handleReset = () => setMarks([]);

  const handleSave = async () => {
    if (!telemetry) return;
    setSaving(true);
    try {
      const isoMarks = marks.map((x) => new Date(telemetry.baseMs + x).toISOString());
      const updated = await updateFlightManeuver(maneuver.id, { instructor_step_marks: isoMarks });
      onMarked(updated);
      showToast({ variant: "success", message: "Marcações de etapa salvas." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const extraMarks = useMemo(
    () =>
      marks.map((x, i) => ({
        x,
        color: MARK_COLORS[i % MARK_COLORS.length]!,
        label: stepsToMark[i]?.name ?? `Etapa ${i + 1}`,
      })),
    [marks, stepsToMark],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4">
      <div className="my-4 w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">Marcar limites de etapa</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {templateSteps === null ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            Carregando etapas...
          </div>
        ) : marksNeeded === 0 ? (
          <p className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400">
            Nenhuma etapa deste template requer marcação manual pelo instrutor.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Progresso */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Etapas a marcar ({marks.length}/{marksNeeded})
              </p>
              <div className="space-y-1">
                {stepsToMark.map((step, i) => {
                  const isDone = i < marks.length;
                  const isCurrent = i === currentMarkIdx;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                        isDone
                          ? "text-emerald-400"
                          : isCurrent
                            ? "text-sky-300 font-semibold"
                            : "text-slate-600"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: isDone
                            ? MARK_COLORS[i % MARK_COLORS.length]
                            : isCurrent
                              ? "#38bdf8"
                              : "#334155",
                        }}
                      />
                      <span className="flex-1">{step.name}</span>
                      {isDone && telemetry && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          {formatDateTime(new Date(telemetry.baseMs + marks[i]!).toISOString())}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-xs text-sky-500">← marque no gráfico</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gráfico */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {currentMarkIdx < marksNeeded
                    ? <>Clique para marcar o fim de: <span className="text-sky-300">{stepsToMark[currentMarkIdx]?.name}</span></>
                    : <span className="text-emerald-400">Todas as etapas marcadas</span>
                  }
                </span>
                <div className="flex gap-2">
                  {marks.length > 0 && (
                    <button type="button" onClick={handleUndo} className="text-xs text-slate-500 hover:text-slate-300">
                      Desfazer
                    </button>
                  )}
                  {marks.length > 0 && (
                    <button type="button" onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300">
                      Resetar
                    </button>
                  )}
                </div>
              </div>

              {!csvText ? (
                <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                  Carregando telemetria...
                </div>
              ) : !telemetry ? (
                <p className="h-32 flex items-center justify-center text-xs text-slate-500">
                  Telemetria não disponível.
                </p>
              ) : (
                <div ref={chartContainerRef} className="select-none" style={{ cursor: currentMarkIdx < marksNeeded ? "crosshair" : "default" }}>
                  {telemetry.flightPoints.length > 0 && (
                    <div className="mb-2 overflow-hidden rounded-lg border border-slate-700" style={{ height: 140 }}>
                      <FlightMap
                        points={telemetry.flightPoints}
                        selectedRangeT={[new Date(maneuver.start_time).getTime(), new Date(maneuver.end_time).getTime()]}
                        hoverCallbackRef={mapHoverRef}
                        className="h-full w-full"
                      />
                    </div>
                  )}
                  {[
                    { dataKey: "alt" as const, label: "Altitude (ft)", color: "#94a3b8", height: 120, tickFmt: (v: number) => `${Math.round(v)}ft` },
                    { dataKey: "ias" as const, label: "IAS (kt)", color: "#38bdf8", height: 80, tickFmt: (v: number) => `${Math.round(v)}kt` },
                  ].map(({ dataKey, label, color, height, tickFmt }) => (
                    <div key={dataKey}>
                      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
                      <ModalTelemetryChart
                        color={color}
                        data={telemetry.points}
                        dataKey={dataKey}
                        domain={chartDomain}
                        extraMarks={extraMarks}
                        height={height}
                        label={label}
                        onHoverX={(xMs) => {
                          if (xMs === null) { mapHoverRef.current?.(null); return; }
                          const pos = findHoverPos(telemetry.flightPoints, telemetry.baseMs, xMs);
                          mapHoverRef.current?.(pos);
                        }}
                        onSelectX={handleChartSelect}
                        selectionStart={maneuverStartX}
                        selectionEnd={maneuverEndX}
                        tickFmt={tickFmt}
                        telemetryBaseMs={telemetry.baseMs}
                        totalMs={telemetry.totalMs}
                      />
                    </div>
                  ))}
                  <p className="mt-1 text-center text-xs text-slate-600">
                    Janela da manobra: {formatHHMMSS(maneuverStartX, telemetry.baseMs)} → {formatHHMMSS(maneuverEndX, telemetry.baseMs)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          {marksNeeded > 0 && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || marks.length === 0}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar marcações"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Add maneuver modal ----------

type TelemetryPreview = {
  points: Array<{ x: number; alt: number | null; ias: number | null; rpm: number | null }>;
  baseMs: number;
  totalMs: number;
  flightPoints: import("../types/flight").FlightPoint[];
};

function msToDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatHHMM(ms: number, baseMs: number): string {
  const d = new Date(baseMs + ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatHHMMSS(ms: number, baseMs: number): string {
  const d = new Date(baseMs + ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function AddManeuverModal({
  flightId,
  flight,
  csvText,
  templates,
  onClose,
  onAdded,
  initialManeuver,
  onEdited,
}: {
  flightId: string;
  flight: SavedFlightListItem;
  csvText: string | null;
  templates: ManeuverTemplate[];
  onClose: () => void;
  onAdded: (maneuver: FlightManeuver) => void;
  initialManeuver?: FlightManeuver;
  onEdited?: (maneuver: FlightManeuver) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [templateId, setTemplateId] = useState(initialManeuver?.template_id ?? "");
  const [saving, setSaving] = useState(false);

  // Imperative ref for the FlightMap cursor — no React state needed
  const mapHoverRef = useRef<((pos: [number, number] | null) => void) | null>(null);

  // Zoom state for modal charts
  const [chartDomain, setChartDomain] = useState<[number, number] | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wheelDeltaRef = useRef(0);
  const wheelClientXRef = useRef(0);
  const wheelFrameRef = useRef<number | null>(null);
  const chartDomainRef = useRef<[number, number] | null>(null);
  chartDomainRef.current = chartDomain; // keep ref in sync with state (avoids stale closure in rAF)

  // Selection: offsets in ms from telemetry start
  const [startX, setStartX] = useState<number | null>(null);
  const [endX, setEndX] = useState<number | null>(null);
  // "start" = next click sets start marker; "end" = next click sets end marker
  const [phase, setPhase] = useState<"start" | "end">("start");

  // Parse telemetry synchronously from the prop (already fetched by parent)
  const telemetry = useMemo<TelemetryPreview | null>(() => {
    if (!csvText) return null;
    try {
      const parsed = parseGarminCsv(csvText);
      const { chartData, chartTimeBaseMs, points: flightPoints } = parsed;
      if (!chartTimeBaseMs || chartData.length === 0) return null;
      const totalMs = chartData[chartData.length - 1]?.x ?? 0;
      const step = Math.max(1, Math.ceil(chartData.length / 500));
      const points = chartData
        .filter((_, i) => i % step === 0)
        .map((row) => ({
          x: row.x as number,
          alt: (row["gpsAltFt"] as number | null) ?? null,
          ias: (row["iasKt"] as number | null) ?? null,
          rpm: (row["rpm"] as number | null) ?? null,
        }));
      return { points, baseMs: chartTimeBaseMs, totalMs, flightPoints };
    } catch {
      return null;
    }
  }, [csvText]);

  // Reset zoom when CSV changes
  useEffect(() => { setChartDomain(null); }, [csvText]);

  // Pre-fill start/end from existing maneuver when editing
  useEffect(() => {
    if (!initialManeuver || !telemetry) return;
    const s = new Date(initialManeuver.start_time).getTime() - telemetry.baseMs;
    const e = new Date(initialManeuver.end_time).getTime() - telemetry.baseMs;
    setStartX(Math.max(0, Math.min(s, telemetry.totalMs)));
    setEndX(Math.max(0, Math.min(e, telemetry.totalMs)));
    setPhase("start");
  // Only run once when telemetry first becomes available in edit mode
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, initialManeuver?.id]);

  // Wheel zoom for modal charts (mirrors FlightCharts.tsx anchor-based zoom)
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !telemetry) return;
    const fullMin = 0;
    const fullMax = telemetry.totalMs;
    const fullSpan = fullMax - fullMin;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      wheelDeltaRef.current += e.deltaY;
      wheelClientXRef.current = e.clientX;
      if (wheelFrameRef.current !== null) return;
      wheelFrameRef.current = requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const delta = wheelDeltaRef.current;
        wheelDeltaRef.current = 0;
        const current = chartDomainRef.current ?? [fullMin, fullMax];
        const currentSpan = current[1] - current[0];
        const factor = Math.exp(delta * 0.0015);
        const nextSpan = Math.max(5000, Math.min(currentSpan * factor, fullSpan));
        if (nextSpan >= fullSpan * 0.75) {
          setChartDomain(null);
          return;
        }
        const rect = container.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (wheelClientXRef.current - rect.left) / rect.width));
        const anchor = current[0] + currentSpan * ratio;
        const newLeft = Math.max(fullMin, anchor - nextSpan * ratio);
        const newRight = Math.min(fullMax, newLeft + nextSpan);
        const adjustedLeft = Math.max(fullMin, newRight - nextSpan);
        setChartDomain([adjustedLeft, newRight]);
      });
    };

    container.addEventListener("wheel", handler, { passive: false });
    return () => {
      container.removeEventListener("wheel", handler);
      if (wheelFrameRef.current !== null) {
        cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
    };
  }, [telemetry]);

  // Derived datetime-local strings (editable, synced with chart)
  const startLocal = useMemo(
    () => (telemetry && startX !== null ? msToDatetimeLocal(telemetry.baseMs + startX) : ""),
    [telemetry, startX],
  );
  const endLocal = useMemo(
    () => (telemetry && endX !== null ? msToDatetimeLocal(telemetry.baseMs + endX) : ""),
    [telemetry, endX],
  );

  const handleManualStart = (v: string) => {
    if (!telemetry || !v) return;
    const offset = new Date(v).getTime() - telemetry.baseMs;
    if (!isNaN(offset)) setStartX(Math.max(0, Math.min(offset, telemetry.totalMs)));
  };

  const handleManualEnd = (v: string) => {
    if (!telemetry || !v) return;
    const offset = new Date(v).getTime() - telemetry.baseMs;
    if (!isNaN(offset)) setEndX(Math.max(0, Math.min(offset, telemetry.totalMs)));
  };

  // Chart click: first click = start, second = end, subsequent = restart
  const handleChartSelect = useCallback(
    (xMs: number) => {
      if (phase === "start") {
        setStartX(xMs);
        setEndX(null);
        setPhase("end");
      } else {
        if (startX !== null && xMs > startX) {
          setEndX(xMs);
          setPhase("start");
        } else {
          // clicked at or before start → treat as new start
          setStartX(xMs);
          setEndX(null);
        }
      }
    },
    [phase, startX],
  );

  const handleReset = () => {
    setStartX(null);
    setEndX(null);
    setPhase("start");
  };

  const activeTemplates = useMemo(() => templates.filter((t) => t.is_active), [templates]);

  const selectionDuration =
    startX !== null && endX !== null
      ? formatDuration(Math.round((endX - startX) / 1000))
      : null;

  const handleSave = async () => {
    if (!templateId) {
      showToast({ variant: "error", message: "Selecione o template de manobra." });
      return;
    }
    if (startX === null || endX === null || !telemetry) {
      showToast({ variant: "error", message: "Selecione o trecho da manobra no gráfico." });
      return;
    }
    if (endX <= startX) {
      showToast({ variant: "error", message: "O fim deve ser depois do início." });
      return;
    }
    setSaving(true);
    try {
      const startIso = new Date(telemetry.baseMs + startX).toISOString();
      const endIso = new Date(telemetry.baseMs + endX).toISOString();
      if (initialManeuver && onEdited) {
        // Edit mode: update existing maneuver
        const updated = await updateFlightManeuver(initialManeuver.id, {
          template_id: templateId,
          start_time: startIso,
          end_time: endIso,
        });
        onEdited(updated);
        showToast({ variant: "success", message: "Manobra atualizada." });
      } else {
        // Create mode
        const created = await createFlightManeuver({
          flight_id: flightId,
          template_id: templateId,
          instructor_id: user?.id ?? "",
          student_id: flight.student_user_id,
          aircraft_ident: flight.aircraft_ident,
          start_time: startIso,
          end_time: endIso,
          status: "draft",
          created_by: user?.id ?? "",
        });
        onAdded(created);
        showToast({ variant: "success", message: "Manobra adicionada." });
      }
      onClose();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4">
      <div className="my-4 w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {initialManeuver ? "Editar janela de horário" : "Adicionar manobra"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* Template select */}
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Template de manobra *
            </span>
            {activeTemplates.length === 0 ? (
              <p className="text-sm text-amber-400">
                Nenhum template ativo compatível com o modelo desta aeronave.
              </p>
            ) : (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputCls}
              >
                <option value="">Selecione a manobra</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {MANEUVER_CATEGORY_LABELS[t.category] ?? t.category}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Telemetry chart */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Telemetria — selecione o trecho
              </span>
              {(startX !== null || endX !== null) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Redefinir
                </button>
              )}
            </div>

            {!csvText ? (
              <div className="flex h-44 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                <span className="ml-2 text-xs text-slate-500">Carregando telemetria…</span>
              </div>
            ) : !telemetry ? (
              <div className="flex h-44 items-center justify-center">
                <p className="text-xs text-slate-500">Telemetria não disponível para este voo.</p>
              </div>
            ) : (
              <>
                {/* Instruction */}
                <p className="mb-2 text-xs text-slate-400">
                  {startX === null ? (
                    <>Clique no gráfico para marcar o <span className="font-semibold text-sky-400">início</span> da manobra.</>
                  ) : endX === null ? (
                    <>Início marcado. Clique para marcar o <span className="font-semibold text-orange-400">fim</span> da manobra.</>
                  ) : (
                    <>Trecho selecionado: <span className="font-semibold text-emerald-400">{selectionDuration}</span>. Ajuste os campos abaixo ou clique em "Redefinir".</>
                  )}
                </p>

                {/* Route map with moving-plane cursor synced to chart hover */}
                {telemetry.flightPoints.length > 0 && (
                  <div className="mb-2 overflow-hidden rounded-lg border border-slate-700" style={{ height: 180 }}>
                    <FlightMap
                      points={telemetry.flightPoints}
                      selectedRangeT={
                        startX !== null && endX !== null
                          ? [telemetry.baseMs + startX, telemetry.baseMs + endX]
                          : null
                      }
                      hoverCallbackRef={mapHoverRef}
                      className="h-full w-full"
                    />
                  </div>
                )}

                {/* Charts */}
                <div
                  ref={chartContainerRef}
                  className="select-none"
                  style={{ cursor: "crosshair" }}
                >
                  {/* Zoom hint + reset button */}
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600">
                      {chartDomain ? "Zoom ativo — scroll para ajustar" : "Scroll com mouse para dar zoom"}
                    </span>
                    {chartDomain && (
                      <button
                        type="button"
                        onClick={() => setChartDomain(null)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800"
                      >
                        Resetar zoom
                      </button>
                    )}
                  </div>

                  {/* Reusable selection overlays */}
                  {[
                    { dataKey: "alt", label: "Altitude (ft)", color: "#94a3b8", height: 130, tickFmt: (v: number) => `${Math.round(v)}ft` },
                    { dataKey: "ias", label: "IAS (kt)", color: "#38bdf8", height: 90, tickFmt: (v: number) => `${Math.round(v)}kt` },
                    ...(telemetry.points.some((p) => p.rpm != null)
                      ? [{ dataKey: "rpm", label: "RPM", color: "#a78bfa", height: 90, tickFmt: (v: number) => `${Math.round(v)}` }]
                      : []),
                  ].map(({ dataKey, label, color, height, tickFmt }) => (
                    <div key={dataKey}>
                      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
                      <ModalTelemetryChart
                        color={color}
                        data={telemetry.points}
                        dataKey={dataKey as "alt" | "ias" | "rpm"}
                        domain={chartDomain}
                        height={height}
                        label={label}
                        onHoverX={(xMs) => {
                          if (xMs === null) {
                            mapHoverRef.current?.(null);
                            return;
                          }
                          const pos = findHoverPos(telemetry.flightPoints, telemetry.baseMs, xMs);
                          mapHoverRef.current?.(pos);
                        }}
                        onSelectX={handleChartSelect}
                        selectionEnd={endX}
                        selectionStart={startX}
                        telemetryBaseMs={telemetry.baseMs}
                        tickFmt={tickFmt}
                        totalMs={telemetry.totalMs}
                      />
                    </div>
                  ))}
                </div>

                {/* Telemetry bounds info */}
                <p className="mt-1 text-center text-xs text-slate-600">
                  Telemetria disponível:{" "}
                  {formatHHMMSS(0, telemetry.baseMs)} → {formatHHMMSS(telemetry.totalMs, telemetry.baseMs)}
                  {" "}({formatDuration(Math.round(telemetry.totalMs / 1000))})
                </p>
              </>
            )}
          </div>

          {/* Fine-tune inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Início
              </span>
              <input
                type="datetime-local"
                step="1"
                value={startLocal}
                onChange={(e) => handleManualStart(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Fim
              </span>
              <input
                type="datetime-local"
                step="1"
                value={endLocal}
                onChange={(e) => handleManualEnd(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || activeTemplates.length === 0 || startX === null || endX === null}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : initialManeuver ? "Salvar alterações" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main component ----------

type PublicFlightReviewData = {
  flight: SavedFlightFull;
  maneuvers: FlightManeuver[];
  maneuverReviews: FlightManeuverReview[];
  maneuverTemplates: ManeuverTemplate[];
};

export function FlightReviewTab({ flightId, publicData, publicMode = false }: {
  flightId: string;
  publicData?: PublicFlightReviewData;
  publicMode?: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isInstructor = !publicMode && (user?.role === "instrutor" || user?.role === "admin");

  const [loading, setLoading] = useState(true);
  const [flight, setFlight] = useState<SavedFlightListItem | null>(null);
  const [flightCsvText, setFlightCsvText] = useState<string | null>(null);
  const [parsedCsvResult, setParsedCsvResult] = useState<ParseResult | null>(null);
  const [parsedCsvLoading, setParsedCsvLoading] = useState(false);
  const [parsedCsvError, setParsedCsvError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ManeuverTemplate[]>([]);
  const [maneuvers, setManeuvers] = useState<FlightManeuver[]>([]);
  const [reviewMap, setReviewMap] = useState<Record<string, FlightManeuverReview>>({});
  const [templateMap, setTemplateMap] = useState<Record<string, ManeuverTemplate>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editManeuver, setEditManeuver] = useState<FlightManeuver | null>(null);
  const [autoAdding, setAutoAdding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsManId, setFsManId] = useState<string | null>(null);
  const [fsStepIdx, setFsStepIdx] = useState(-1); // -1 = "Completa" (visão geral)
  const [fsHoverT, setFsHoverT] = useState<number | null>(null);
  const [fsExtraFields, setFsExtraFields] = useState<Record<number, string[]>>({});
  const fsContainerRef = useRef<HTMLDivElement>(null);
  const fsMapHoverRef = useRef<((pos: [number, number] | null) => void) | null>(null);
  const csvWorkerRef = useRef<Worker | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (publicData) {
        setFlight(publicData.flight);
        const { telemetryCsv } = decodeFlightRecord(publicData.flight.csv_text);
        setFlightCsvText(telemetryCsv || null);
        const tmplMap: Record<string, ManeuverTemplate> = {};
        for (const t of publicData.maneuverTemplates) tmplMap[t.id] = t;
        const rvMap: Record<string, FlightManeuverReview> = {};
        for (const r of publicData.maneuverReviews) rvMap[r.flight_maneuver_id] = r;
        setTemplates(publicData.maneuverTemplates);
        setManeuvers(publicData.maneuvers);
        setTemplateMap(tmplMap);
        setReviewMap(rvMap);
        return;
      }
      const { data: flightData } = await getSavedFlight(flightId);
      if (!flightData) return;
      setFlight(flightData);
      const { telemetryCsv } = decodeFlightRecord(flightData.csv_text);
      setFlightCsvText(telemetryCsv || null);

      // Resolve aircraft model
      let aircraftModelId: string | null = null;
      if (flightData.aircraft_ident) {
        try {
          const aircraft = await getAircraftByRegistration(flightData.aircraft_ident, DEFAULT_SCHOOL_ID);
          if (aircraft) aircraftModelId = aircraft.model_id;
        } catch {
          // aircraft not found – show all active templates
        }
      }

      const [tmplList, maneuverList, reviewList] = await Promise.all([
        listManeuverTemplates({ activeOnly: false, ...(aircraftModelId ? { aircraftModelId } : {}) }),
        listFlightManeuvers(flightId),
        listFlightManeuverReviews(flightId),
      ]);

      const tmplMap: Record<string, ManeuverTemplate> = {};
      for (const t of tmplList) tmplMap[t.id] = t;

      const rvMap: Record<string, FlightManeuverReview> = {};
      for (const r of reviewList) rvMap[r.flight_maneuver_id] = r;

      setTemplates(tmplList);
      setManeuvers(maneuverList);
      setTemplateMap(tmplMap);
      setReviewMap(rvMap);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [flightId, publicData, showToast]);

  useEffect(() => { void load(); }, [load]);

  /** Parsed CSV for reconstructing chart data_points at render time (charts survive page reload). */
  useEffect(() => {
    csvWorkerRef.current?.terminate();
    csvWorkerRef.current = null;
    setParsedCsvResult(null);
    setParsedCsvError(null);

    if (!flightCsvText?.trim()) {
      setParsedCsvLoading(false);
      return undefined;
    }

    let cancelled = false;
    setParsedCsvLoading(true);
    const worker = new CsvWorker();
    csvWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: ParseResult; error?: string }>) => {
      worker.terminate();
      if (csvWorkerRef.current === worker) csvWorkerRef.current = null;
      if (cancelled) return;
      setParsedCsvLoading(false);
      if (!event.data.ok || !event.data.result) {
        setParsedCsvResult(null);
        setParsedCsvError(event.data.error ?? "Erro ao processar a telemetria do Flight Review.");
        return;
      }
      setParsedCsvResult(event.data.result);
    };

    worker.onerror = (error) => {
      worker.terminate();
      if (csvWorkerRef.current === worker) csvWorkerRef.current = null;
      if (cancelled) return;
      setParsedCsvLoading(false);
      setParsedCsvResult(null);
      setParsedCsvError(error.message || "Erro ao processar a telemetria do Flight Review.");
    };

    worker.postMessage(flightCsvText);

    return () => {
      cancelled = true;
      worker.terminate();
      if (csvWorkerRef.current === worker) csvWorkerRef.current = null;
    };
  }, [flightCsvText]);

  const handleAdded = (m: FlightManeuver) => {
    setManeuvers((prev) => [...prev, m].sort((a, b) => a.start_time.localeCompare(b.start_time)));
  };

  const handleDeleted = (id: string) => {
    setManeuvers((prev) => prev.filter((m) => m.id !== id));
    setReviewMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAnalyzed = (review: FlightManeuverReview, updatedManeuver: FlightManeuver) => {
    setReviewMap((prev) => ({ ...prev, [updatedManeuver.id]: review }));
    setManeuvers((prev) => prev.map((m) => (m.id === updatedManeuver.id ? updatedManeuver : m)));
  };

  const handleEdited = (updated: FlightManeuver) => {
    setManeuvers((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m)).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    );
    setEditManeuver(null);
  };

  const handleMarked = (updated: FlightManeuver) => {
    setManeuvers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  // ---- Fullscreen derived state ----
  const fsManeuver = useMemo(() => (fsManId ? maneuvers.find((m) => m.id === fsManId) ?? null : null), [fsManId, maneuvers]);

  const fsLiveReview = useMemo(() => {
    if (!fsManId || !parsedCsvResult?.chartTimeBaseMs) return reviewMap[fsManId ?? ""];
    const review = reviewMap[fsManId];
    if (!review) return undefined;
    const alreadyHasData = review.analysis.steps.some((s) => s.parameters.some((p) => p.data_points.length > 0));
    if (alreadyHasData) return review;
    const augSteps = review.analysis.steps.map((step) => {
      const sMs = new Date(step.start_time).getTime();
      const eMs = new Date(step.end_time).getTime();
      const augParams = step.parameters.map((param) => {
        const fieldKey = TELEMETRY_FIELD_MAP[param.parameter] ?? param.parameter;
        return { ...param, data_points: extractFieldPoints(parsedCsvResult, sMs, eMs, fieldKey) };
      });
      return { ...step, parameters: augParams };
    });
    return { ...review, analysis: { ...review.analysis, steps: augSteps } };
  }, [fsManId, reviewMap, parsedCsvResult]);

  // fsStepIdx === -1 → "Completa" view (não há etapa selecionada)
  const fsStep = fsStepIdx >= 0 ? (fsLiveReview?.analysis.steps[fsStepIdx] ?? null) : null;

  const fsRangeT = useMemo((): [number, number] | null => {
    if (!fsManeuver) return null;
    if (fsStep) return [new Date(fsStep.start_time).getTime(), new Date(fsStep.end_time).getTime()];
    return [new Date(fsManeuver.start_time).getTime(), new Date(fsManeuver.end_time).getTime()];
  }, [fsManeuver, fsStep]);

  // Alt/IAS para o passo selecionado (para exibição nos gráficos da etapa)
  const fsStepAltPoints = useMemo(() => {
    if (!fsStep || !parsedCsvResult) return [];
    return extractFieldPoints(parsedCsvResult, new Date(fsStep.start_time).getTime(), new Date(fsStep.end_time).getTime(), "gpsAltFt");
  }, [fsStep, parsedCsvResult]);

  const fsStepIasPoints = useMemo(() => {
    if (!fsStep || !parsedCsvResult) return [];
    return extractFieldPoints(parsedCsvResult, new Date(fsStep.start_time).getTime(), new Date(fsStep.end_time).getTime(), "iasKt");
  }, [fsStep, parsedCsvResult]);

  // Alt/IAS para a manobra completa (visão geral "Completa")
  const fsManAltPoints = useMemo(() => {
    if (!fsManeuver || !parsedCsvResult) return [];
    return extractFieldPoints(parsedCsvResult, new Date(fsManeuver.start_time).getTime(), new Date(fsManeuver.end_time).getTime(), "gpsAltFt");
  }, [fsManeuver, parsedCsvResult]);

  const fsManIasPoints = useMemo(() => {
    if (!fsManeuver || !parsedCsvResult) return [];
    return extractFieldPoints(parsedCsvResult, new Date(fsManeuver.start_time).getTime(), new Date(fsManeuver.end_time).getTime(), "iasKt");
  }, [fsManeuver, parsedCsvResult]);

  // Ranges para os gráficos da visão geral (pernas ou etapas como cores)
  const fsManLegRanges = useMemo(() => {
    const tp = fsLiveReview?.analysis.trafficPattern;
    const baseMs = parsedCsvResult?.chartTimeBaseMs;
    if (!tp || !baseMs || !fsManeuver) return null;
    const manStartMs = new Date(fsManeuver.start_time).getTime();
    const manEndMs = new Date(fsManeuver.end_time).getTime();
    const xMin = manStartMs - baseMs;
    const xMax = manEndMs - baseMs;
    const consecutive = makeConsecutiveLegs(tp.legs, xMin, xMax, tp.touchdownX);
    if (consecutive.length === 0) return null;
    return consecutive.map((l) => ({
      color: LEG_COLORS[l.type] ?? "#94a3b8",
      label: LEG_LABELS[l.type] ?? l.type,
      x1: Math.round((baseMs + l.startX - manStartMs) / 1000),
      x2: Math.round((baseMs + l.endX - manStartMs) / 1000),
    }));
  }, [fsLiveReview, parsedCsvResult, fsManeuver]);

  const fsManStepRanges = useMemo(() => {
    if (!fsLiveReview || !fsManeuver) return [];
    const manStartMs = new Date(fsManeuver.start_time).getTime();
    return fsLiveReview.analysis.steps.map((step, i) => ({
      name: step.name,
      color: STEP_COLORS[i % STEP_COLORS.length]!,
      x1: Math.round((new Date(step.start_time).getTime() - manStartMs) / 1000),
      x2: Math.round((new Date(step.end_time).getTime() - manStartMs) / 1000),
    }));
  }, [fsLiveReview, fsManeuver]);

  const fsManChartRanges = useMemo<ReviewChartRange[]>(() => {
    if (fsManLegRanges && fsManLegRanges.length > 0) {
      const legPart = fsManLegRanges.map((r) => ({ x1: r.x1, x2: r.x2, color: r.color }));
      const lastLegX2 = fsManLegRanges[fsManLegRanges.length - 1]!.x2;
      const postLeg = fsManStepRanges
        .filter((r) => r.x2 > lastLegX2)
        .map((r) => ({ x1: r.x1, x2: r.x2, color: r.color }));
      return [...legPart, ...postLeg];
    }
    return fsManStepRanges.map((r) => ({ x1: r.x1, x2: r.x2, color: r.color }));
  }, [fsManLegRanges, fsManStepRanges]);

  // Segmentos coloridos para o FlightMap fullscreen (etapas quando não há circuito de tráfego)
  const fsMapColoredSegments = useMemo(() => {
    if (!fsManeuver || !fsLiveReview || fsManStepRanges.length === 0) return null;
    // Quando há circuito de tráfego, o FlightMap já usa legSegments via trafficPattern
    if (fsManLegRanges && fsManLegRanges.length > 0) return null;
    const manStartMs = new Date(fsManeuver.start_time).getTime();
    return fsManStepRanges.map((r) => ({
      color: r.color,
      startMs: manStartMs + r.x1 * 1000,
      endMs: manStartMs + r.x2 * 1000,
    }));
  }, [fsManeuver, fsLiveReview, fsManLegRanges, fsManStepRanges]);

  // Linha vertical de touchdown para os gráficos da manobra completa
  const fsManTdLines = useMemo<ReviewChartVerticalLine[]>(() => {
    const tp = fsLiveReview?.analysis.trafficPattern;
    const baseMs = parsedCsvResult?.chartTimeBaseMs;
    if (!tp || !baseMs || tp.touchdownX == null || !fsManeuver) return [];
    const t = (baseMs + tp.touchdownX - new Date(fsManeuver.start_time).getTime()) / 1000;
    return t >= 0 ? [{ t, color: "#94a3b8", label: "TD" }] : [];
  }, [fsLiveReview, parsedCsvResult, fsManeuver]);

  // Linha vertical de touchdown para os gráficos da etapa selecionada
  const fsStepTdLines = useMemo<ReviewChartVerticalLine[]>(() => {
    const tp = fsLiveReview?.analysis.trafficPattern;
    const baseMs = parsedCsvResult?.chartTimeBaseMs;
    if (!tp || !baseMs || tp.touchdownX == null || !fsStep) return [];
    const t = (baseMs + tp.touchdownX - new Date(fsStep.start_time).getTime()) / 1000;
    const stepDuration = (new Date(fsStep.end_time).getTime() - new Date(fsStep.start_time).getTime()) / 1000;
    return t >= 0 && t <= stepDuration ? [{ t, color: "#94a3b8", label: "TD" }] : [];
  }, [fsLiveReview, parsedCsvResult, fsStep]);

  // Janela de viewport para calcular altura ideal de gráficos
  const [fsWindowH, setFsWindowH] = useState(typeof window !== "undefined" ? window.innerHeight : 600);
  useEffect(() => {
    if (!isFullscreen) return;
    const update = () => setFsWindowH(window.innerHeight);
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, [isFullscreen]);

  // Número de gráficos na área de charts (para calcular altura)
  const fsTotalCharts = useMemo(() => {
    if (fsStepIdx === -1) return (fsManAltPoints.length > 0 ? 1 : 0) + (fsManIasPoints.length > 0 ? 1 : 0);
    if (!fsStep) return 0;
    const paramKeys = new Set(fsStep.parameters.map((p) => p.parameter));
    const showAlt = !paramKeys.has("altitude") && fsStepAltPoints.length > 0;
    const showIas = !paramKeys.has("ias") && fsStepIasPoints.length > 0;
    const paramCharts = groupParamsByIndicator(fsStep.parameters).filter((g) => g[0]!.data_points.length > 0).length;
    const extraCharts = (fsExtraFields[fsStepIdx] ?? []).length;
    return (showAlt ? 1 : 0) + (showIas ? 1 : 0) + paramCharts + extraCharts;
  }, [fsStepIdx, fsStep, fsManAltPoints.length, fsManIasPoints.length, fsStepAltPoints.length, fsStepIasPoints.length, fsExtraFields]);

  // Altura ideal de cada chart para maximizar espaço vertical
  const fsChartH = useMemo(() => {
    const rows = Math.max(1, Math.ceil(fsTotalCharts / 2));
    const availH = fsWindowH / 2 - 60 - 16; // metade da tela - barra de tags (~48px) - padding vertical
    const labelH = 18; // altura da label acima de cada chart
    const gapH = 4;   // gap-1
    const h = Math.floor((availH - rows * labelH - (rows - 1) * gapH) / rows);
    return Math.max(100, h);
  }, [fsWindowH, fsTotalCharts]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === fsContainerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = fsContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };

  const handleFsHoverT = useCallback((t: number | null) => {
    setFsHoverT(t);
    if (t === null || !parsedCsvResult?.points.length) {
      fsMapHoverRef.current?.(null);
      return;
    }
    // Use step start when a step is selected; fall back to maneuver start for "Completa" view
    const refStartMs = fsStep
      ? new Date(fsStep.start_time).getTime()
      : fsManeuver
        ? new Date(fsManeuver.start_time).getTime()
        : null;
    if (refStartMs === null) {
      fsMapHoverRef.current?.(null);
      return;
    }
    const targetMs = refStartMs + t * 1000;
    const pts = parsedCsvResult.points;
    let nearest = pts[0];
    let minDiff = Infinity;
    for (const pt of pts) {
      if (pt.t === null) continue;
      const diff = Math.abs(pt.t - targetMs);
      if (diff < minDiff) { minDiff = diff; nearest = pt; }
      else if (diff > minDiff + 5000) break;
    }
    if (nearest) fsMapHoverRef.current?.([nearest.lat, nearest.lon]);
  }, [fsStep, fsManeuver, parsedCsvResult?.points]);

  const SEG_CATEGORY_MAP: Record<string, string> = { takeoff: "takeoff", landing: "landing", tgl: "touch_and_go" };

  const handleAutoAddSegments = async () => {
    if (!parsedCsvResult || !flight || !user) return;
    const { chartData, chartTimeBaseMs, points } = parsedCsvResult;
    if (!chartTimeBaseMs || chartData.length === 0) {
      showToast({ variant: "error", message: "Telemetria insuficiente para detecção automática." });
      return;
    }
    setAutoAdding(true);
    try {
      const segments = detectFlightSegments(chartData, chartTimeBaseMs, points);
      if (segments.length === 0) {
        showToast({ variant: "error", message: "Nenhuma decolagem, pouso ou TGL detectados na telemetria." });
        return;
      }
      let added = 0;
      for (const seg of segments) {
        const category = SEG_CATEGORY_MAP[seg.type];
        if (!category) continue;
        const tmpl = templates.find((t) => t.category === category && t.is_active);
        if (!tmpl) continue;
        const startIso = new Date(chartTimeBaseMs + seg.startX).toISOString();
        const endIso = new Date(chartTimeBaseMs + seg.endX).toISOString();
        const created = await createFlightManeuver({
          flight_id: flightId,
          template_id: tmpl.id,
          instructor_id: user.id,
          student_id: flight.student_user_id,
          aircraft_ident: flight.aircraft_ident,
          start_time: startIso,
          end_time: endIso,
          status: "draft",
          created_by: user.id,
        });
        handleAdded(created);
        added += 1;
      }
      if (added === 0) {
        showToast({ variant: "error", message: "Nenhum template compatível encontrado para os segmentos detectados." });
      } else {
        showToast({ variant: "success", message: `${added} manobra${added > 1 ? "s" : ""} adicionada${added > 1 ? "s" : ""} automaticamente.` });
      }
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setAutoAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/40" />
        ))}
      </div>
    );
  }

  if (!flight) {
    return <p className="py-8 text-center text-sm text-slate-500">Voo não encontrado.</p>;
  }

  // No telemetry
  if (!flight.telemetry_present) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
        <svg
          className="mx-auto mb-3 h-8 w-8 text-slate-600"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z"
            clipRule="evenodd"
          />
        </svg>
        {isInstructor ? (
          <>
            <p className="font-medium text-slate-300">Telemetria não disponível</p>
            <p className="mt-1 text-sm text-slate-500">
              Este voo ainda não possui telemetria. Para gerar o Flight Review, primeiro envie ou vincule a telemetria do voo.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-slate-300">Flight Review</p>
            <p className="mt-1 text-sm text-slate-500">Flight Review ainda não disponível para este voo.</p>
          </>
        )}
      </div>
    );
  }

  const normalView = (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100">Flight Review</h3>
          <p className="text-xs text-slate-500">Análise de manobras com base na telemetria do voo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isInstructor && (
            <>
              <button
                type="button"
                onClick={() => void handleAutoAddSegments()}
                disabled={autoAdding || !parsedCsvResult}
                className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/30 disabled:opacity-50"
              >
                {autoAdding ? "Detectando…" : "Adicionar decolagens, pousos e TGLs"}
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                + Adicionar manobra
              </button>
            </>
          )}
          {parsedCsvResult && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              title="Tela cheia"
            >
              ⤢ Tela cheia
            </button>
          )}
        </div>
      </div>

      {/* Detected events info */}
      {(flight.landings !== null) && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <span className="text-slate-500">Pousos detectados:</span>{" "}
            <span className="font-semibold text-slate-200">{flight.landings ?? 0}</span>
          </div>
        </div>
      )}

      {parsedCsvLoading ? (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Processando telemetria do Flight Review...
        </div>
      ) : parsedCsvError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Nao foi possivel montar os graficos do Flight Review: {parsedCsvError}
        </div>
      ) : null}

      {/* Maneuvers list */}
      {maneuvers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <p className="text-slate-400">Nenhuma manobra registrada.</p>
          {isInstructor && (
            <p className="mt-1 text-sm text-slate-500">
              Clique em "Adicionar manobra" para marcar e analisar uma manobra.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {maneuvers.map((m) => (
            <ManeuverCard
              key={m.id}
              maneuver={m}
              template={templateMap[m.template_id]}
              review={reviewMap[m.id]}
              isInstructor={isInstructor}
              flightId={flightId}
              csvText={flightCsvText}
              parsedResult={parsedCsvResult}
              onDeleted={handleDeleted}
              onAnalyzed={handleAnalyzed}
              onMarked={handleMarked}
              onEdit={isInstructor ? () => setEditManeuver(m) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );

  // buildFsRefs replaced by buildGroupedRefs (defined at module level)

  const fullscreenView = (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top half: maneuver list (25%) + map (75%) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: maneuver list */}
        <div className="flex w-1/4 flex-col overflow-hidden border-r border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Manobras</p>
            <button type="button" onClick={toggleFullscreen} className="text-xs text-slate-500 hover:text-slate-300">✕ Sair</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
            {maneuvers.length === 0 ? (
              <p className="px-1 text-xs text-slate-500">Nenhuma manobra registrada.</p>
            ) : (
              maneuvers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setFsManId(m.id); setFsStepIdx(-1); }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    fsManId === m.id
                      ? "border border-sky-600/40 bg-sky-600/20 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="font-medium leading-tight">{templateMap[m.template_id]?.name ?? "—"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {MANEUVER_CATEGORY_LABELS[templateMap[m.template_id]?.category ?? "other"]}
                    {reviewMap[m.id] && (
                      <span className={`ml-2 ${reviewMap[m.id]!.status === "ok" ? "text-emerald-400" : reviewMap[m.id]!.status === "critical" ? "text-red-400" : "text-yellow-400"}`}>
                        ● {reviewMap[m.id]!.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {formatDateTime(m.start_time)} → {formatDateTime(m.end_time)}
                    {" · "}{formatDuration(Math.round((new Date(m.end_time).getTime() - new Date(m.start_time).getTime()) / 1000))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        {/* Right: animated map */}
        <div className="min-w-0 flex-1">
          {parsedCsvResult && parsedCsvResult.points.length > 0 ? (
            <FlightMap
              points={parsedCsvResult.points}
              selectedRangeT={fsRangeT}
              className="h-full w-full"
              hoverCallbackRef={fsMapHoverRef}
              chartTimeBaseMs={parsedCsvResult.chartTimeBaseMs}
              trafficPattern={fsManId ? (fsLiveReview?.analysis.trafficPattern ?? null) : null}
              coloredSegments={fsMapColoredSegments}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Trajeto não disponível</div>
          )}
        </div>
      </div>

      {/* Bottom half */}
      <div className="flex min-h-0 flex-1 overflow-hidden border-t border-slate-800">
        {/* Left 25%: step tags (topo) + info */}
        <div className="flex w-1/4 flex-col overflow-hidden border-r border-slate-800">
          {/* Step TAGs – canto superior esquerdo da metade inferior */}
          {fsLiveReview && (fsLiveReview.analysis.steps.length > 0 || fsManAltPoints.length > 0 || fsManIasPoints.length > 0) && (
            <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
              {/* "Completa" sempre aparece primeiro */}
              <button
                type="button"
                onClick={() => setFsStepIdx(-1)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  fsStepIdx === -1
                    ? "bg-sky-600 text-white"
                    : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                Completa
              </button>
              {fsLiveReview.analysis.steps.map((step, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFsStepIdx(i)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    fsStepIdx === i
                      ? "bg-sky-600 text-white"
                      : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {step.name}
                </button>
              ))}
            </div>
          )}

          {/* Conteúdo do painel esquerdo inferior */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-3">
            {/* Vista "Completa": legenda de pernas / etapas */}
            {fsStepIdx === -1 && fsLiveReview && (
              <>
                {/* Pernas do circuito (quando há traffic pattern) */}
                {fsManLegRanges && fsManLegRanges.map((r, i) => (
                  <div key={`leg-${i}`} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                    <span className="text-xs" style={{ color: r.color }}>{r.label}</span>
                  </div>
                ))}
                {/* Etapas: todas (sem circuito) ou apenas as pós-perna-final (com circuito) */}
                {fsManStepRanges
                  .filter((r) => !fsManLegRanges?.length || r.x2 > (fsManLegRanges[fsManLegRanges.length - 1]?.x2 ?? -Infinity))
                  .map((r, i) => (
                    <div key={`step-${i}`} className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                      <span className="text-xs text-slate-300">{r.name}</span>
                    </div>
                  ))
                }
                {fsLiveReview.analysis.alerts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Alertas gerais</p>
                    <div className="space-y-1">
                      {fsLiveReview.analysis.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-2 py-1.5 text-xs ${
                          a.severity === "critical" ? "bg-red-950/40 text-red-300"
                          : a.severity === "high" ? "bg-orange-950/40 text-orange-300"
                          : a.severity === "medium" ? "bg-yellow-950/40 text-yellow-300"
                          : "bg-slate-800/40 text-slate-400"
                        }`}>{a.message}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Vista de etapa: execução esperada + alertas + tabela de parâmetros */}
            {fsStep && (
              <>
                {fsStep.expected_execution_text && (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-500">
                      Execução esperada
                    </p>
                    <p className="text-xs text-sky-200 leading-relaxed">{fsStep.expected_execution_text}</p>
                  </div>
                )}
                {fsStep.alerts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Alertas</p>
                    <div className="space-y-1">
                      {fsStep.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-2 py-1.5 text-xs ${
                          a.severity === "critical" ? "bg-red-950/40 text-red-300"
                          : a.severity === "high" ? "bg-orange-950/40 text-orange-300"
                          : a.severity === "medium" ? "bg-yellow-950/40 text-yellow-300"
                          : "bg-slate-800/40 text-slate-400"
                        }`}>{a.message}</div>
                      ))}
                    </div>
                  </div>
                )}
                {fsStep.parameters.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Parâmetros</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="py-1 text-left font-medium">Param.</th>
                            <th className="py-1 text-right font-medium">Mín</th>
                            <th className="py-1 text-right font-medium">Máx</th>
                            <th className="py-1 text-right font-medium">Méd.</th>
                            <th className="py-1 text-right font-medium">Esperado</th>
                            <th className="py-1 text-right font-medium">Fora(s)</th>
                            <th className="py-1 text-center font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fsStep.parameters.map((p, i) => (
                            <tr key={i} className="border-t border-slate-800/60">
                              <td className="py-1 text-slate-300">{p.label}</td>
                              <td className="py-1 text-right text-slate-400">{p.min_observed !== null ? p.min_observed : "—"}</td>
                              <td className="py-1 text-right text-slate-400">{p.max_observed !== null ? p.max_observed : "—"}</td>
                              <td className={`py-1 text-right ${p.status === "out_of_range" ? "text-red-400" : p.status === "warning" ? "text-yellow-400" : "text-slate-300"}`}>
                                {p.avg_observed !== null ? p.avg_observed.toFixed(1) : "—"}
                              </td>
                              <td className="py-1 text-right text-slate-500">
                                {p.expected_min !== null || p.expected_max !== null
                                  ? `${p.expected_min ?? "—"} – ${p.expected_max ?? "—"}`
                                  : "—"}
                              </td>
                              <td className="py-1 text-right text-slate-400">{p.time_out_of_range_seconds}</td>
                              <td className="py-1 text-center"><StatusBadge status={p.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Seletor de gráficos extras por telemetria */}
                {parsedCsvResult && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Gráficos extras
                    </p>
                    <select
                      value=""
                      onChange={(e) => {
                        const key = e.target.value;
                        if (!key) return;
                        setFsExtraFields((prev) => {
                          const current = prev[fsStepIdx] ?? [];
                          if (current.includes(key)) return prev;
                          return { ...prev, [fsStepIdx]: [...current, key] };
                        });
                        e.target.value = "";
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="">＋ Adicionar parâmetro…</option>
                      {Object.entries(TELEMETRY_PARAMETER_LABELS).map(([key, lbl]) => (
                        <option key={key} value={key}>{lbl}</option>
                      ))}
                    </select>
                    {(fsExtraFields[fsStepIdx] ?? []).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {(fsExtraFields[fsStepIdx] ?? []).map((key) => (
                          <div key={key} className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{TELEMETRY_PARAMETER_LABELS[key] ?? key}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setFsExtraFields((prev) => ({
                                  ...prev,
                                  [fsStepIdx]: (prev[fsStepIdx] ?? []).filter((k) => k !== key),
                                }))
                              }
                              className="ml-1 text-slate-600 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {!fsManId && (
              <p className="mt-4 text-center text-xs text-slate-500">Selecione uma manobra na lista</p>
            )}
          </div>
        </div>

        {/* Right 75%: gráficos maximizados */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {fsStepIdx === -1 && fsManeuver ? (
            /* Vista "Completa": alt + IAS com ranges de etapa/perna + touchdown */
            <div className={`overflow-y-auto flex-1 p-1 grid gap-1 ${fsTotalCharts > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {fsManAltPoints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">Altitude (ft)</p>
                  <CanvasReviewChart
                    data={fsManAltPoints}
                    label="Altitude (ft)"
                    color="#94a3b8"
                    domain={computeYDomain(fsManAltPoints, null, null)}
                    height={fsChartH}
                    ranges={fsManChartRanges}
                    verticalLines={fsManTdLines}
                    formatY={(v) => `${Math.round(v)}ft`}
                    activeT={fsHoverT}
                    onHoverT={handleFsHoverT}
                  />
                </div>
              )}
              {fsManIasPoints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">IAS (kt)</p>
                  <CanvasReviewChart
                    data={fsManIasPoints}
                    label="IAS (kt)"
                    color="#38bdf8"
                    domain={computeYDomain(fsManIasPoints, null, null)}
                    height={fsChartH}
                    ranges={fsManChartRanges}
                    verticalLines={fsManTdLines}
                    formatY={(v) => `${v.toFixed(1)}kt`}
                    activeT={fsHoverT}
                    onHoverT={handleFsHoverT}
                  />
                </div>
              )}
              {(!fsManAltPoints.length && !fsManIasPoints.length) && (
                <div className="col-span-2 flex h-full items-center justify-center text-sm text-slate-500">
                  Telemetria insuficiente para visão geral.
                </div>
              )}
            </div>
          ) : fsStep ? (
            /* Vista de etapa: alt/IAS (se não em params) + parâmetros da etapa */
            (() => {
              const paramKeys = new Set(fsStep.parameters.map((p) => p.parameter));
              const showAlt = !paramKeys.has("altitude") && fsStepAltPoints.length > 0;
              const showIas = !paramKeys.has("ias") && fsStepIasPoints.length > 0;
              const cols = fsTotalCharts > 1 ? "grid-cols-2" : "grid-cols-1";
              return (
                <div className={`overflow-y-auto flex-1 p-1 grid gap-1 ${cols}`}>
                  {showAlt && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-400">Altitude (ft)</p>
                      <CanvasReviewChart
                        data={fsStepAltPoints}
                        label="Altitude (ft)"
                        color="#94a3b8"
                        domain={computeYDomain(fsStepAltPoints, null, null)}
                        height={fsChartH}
                        verticalLines={fsStepTdLines}
                        formatY={(v) => `${Math.round(v)}ft`}
                        activeT={fsHoverT}
                        onHoverT={handleFsHoverT}
                      />
                    </div>
                  )}
                  {showIas && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-400">IAS (kt)</p>
                      <CanvasReviewChart
                        data={fsStepIasPoints}
                        label="IAS (kt)"
                        color="#38bdf8"
                        domain={computeYDomain(fsStepIasPoints, null, null)}
                        height={fsChartH}
                        verticalLines={fsStepTdLines}
                        formatY={(v) => `${v.toFixed(1)}kt`}
                        activeT={fsHoverT}
                        onHoverT={handleFsHoverT}
                      />
                    </div>
                  )}
                  {groupParamsByIndicator(fsStep.parameters).map((group, i) => {
                    const p0 = group[0]!;
                    if (p0.data_points.length === 0) return null;
                    const isBank = p0.parameter === "bank";
                    const isPitch = p0.parameter === "pitch";
                    const { refs, domain } = buildGroupedRefs(group);
                    const chartLabel = group.map((p) => p.label).filter((l, li, arr) => arr.indexOf(l) === li).join(" / ");
                    return (
                      <div key={i}>
                        <p className="mb-1 text-xs font-medium text-slate-400">{chartLabel}</p>
                        <CanvasReviewChart
                          data={p0.data_points}
                          label={chartLabel}
                          color="#38bdf8"
                          domain={domain}
                          height={fsChartH}
                          references={refs}
                          verticalLines={fsStepTdLines}
                          zeroCrossLine={isBank || isPitch}
                          formatY={(v) => v.toFixed(1)}
                          activeT={fsHoverT}
                          onHoverT={handleFsHoverT}
                        />
                      </div>
                    );
                  })}
                  {/* Gráficos extras selecionados pelo usuário */}
                  {parsedCsvResult && (fsExtraFields[fsStepIdx] ?? []).map((fieldKey) => {
                    const fieldMap = TELEMETRY_FIELD_MAP[fieldKey];
                    if (!fieldMap) return null;
                    const stepStartMs = new Date(fsStep.start_time).getTime();
                    const stepEndMs = new Date(fsStep.end_time).getTime();
                    const pts = extractFieldPoints(parsedCsvResult, stepStartMs, stepEndMs, fieldMap);
                    if (pts.length === 0) return null;
                    const extraLabel = TELEMETRY_PARAMETER_LABELS[fieldKey] ?? fieldKey;
                    const isZeroCross = fieldKey === "bank" || fieldKey === "pitch";
                    return (
                      <div key={fieldKey}>
                        <p className="mb-1 text-xs font-medium text-slate-400">{extraLabel}</p>
                        <CanvasReviewChart
                          data={pts}
                          label={extraLabel}
                          color="#a78bfa"
                          domain={computeYDomain(pts, null, null, isZeroCross)}
                          height={fsChartH}
                          verticalLines={fsStepTdLines}
                          zeroCrossLine={isZeroCross}
                          formatY={(v) => v.toFixed(1)}
                          activeT={fsHoverT}
                          onHoverT={handleFsHoverT}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {fsManId ? "Selecione uma etapa ou a visão geral acima." : "Selecione uma manobra para ver os gráficos."}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const content = (
    <div ref={fsContainerRef}>
      {isFullscreen ? fullscreenView : normalView}
      {addOpen && flight && (
        <AddManeuverModal
          flightId={flightId}
          flight={flight}
          csvText={flightCsvText}
          templates={templates}
          onClose={() => setAddOpen(false)}
          onAdded={handleAdded}
        />
      )}
      {editManeuver && flight && (
        <AddManeuverModal
          flightId={flightId}
          flight={flight}
          csvText={flightCsvText}
          templates={templates}
          onClose={() => setEditManeuver(null)}
          onAdded={handleAdded}
          initialManeuver={editManeuver}
          onEdited={handleEdited}
        />
      )}
    </div>
  );

  return content;
}
