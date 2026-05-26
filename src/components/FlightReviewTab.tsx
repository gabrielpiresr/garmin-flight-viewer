import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { useAuth } from "../contexts/AuthContext";
import { getAircraftByRegistration } from "../lib/aircraftDb";
import {
  analyzeFlightManeuver,
  buildReviewSummary,
  deriveReviewStatus,
  TELEMETRY_FIELD_MAP,
} from "../lib/flightManeuverAnalysis";
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
import { parseGarminCsv } from "../lib/parseGarminCsv";
import type { ParseResult } from "../lib/parseGarminCsv";
import { listManeuverTemplates, listManeuverTemplateSteps, getManeuverTemplate } from "../lib/maneuverTemplatesDb";
import { DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import type { SavedFlightListItem } from "../lib/flightsDb";
import type {
  AnalyzedParameter,
  AnalyzedStep,
  FlightManeuver,
  FlightManeuverReview,
  ManeuverTemplate,
} from "../types/flightReview";
import { MANEUVER_CATEGORY_LABELS } from "../types/flightReview";
import type { FlightPoint } from "../types/flight";
import { FlightMap } from "./FlightMap";
import { useToast } from "./ui/ToastProvider";

// ---------- Constants ----------

const STEP_COLORS = [
  "#38bdf8", "#f59e0b", "#34d399", "#f87171",
  "#a78bfa", "#fb923c", "#22d3ee", "#c084fc",
  "#86efac", "#fda4af",
];

function InvalidateMapSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const invalidate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        map.invalidateSize(false);
      });
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);
    const timers = [50, 180, 420].map((delay) => window.setTimeout(invalidate, delay));
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [map]);
  return null;
}

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

/** Y-axis domain with 20% padding, also stretching to cover reference lines. */
function computeYDomain(
  data: Array<{ v: number }>,
  refMin: number | null,
  refMax: number | null,
): [number, number] {
  const vals = data.map((d) => d.v);
  if (refMin !== null) vals.push(refMin);
  if (refMax !== null) vals.push(refMax);
  if (vals.length === 0) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo || Math.abs(lo) * 0.1 || 1;
  const pad = range * 0.2;
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

function ParameterChart({ param, syncId }: { param: AnalyzedParameter; syncId: string }) {
  if (param.data_points.length === 0) return null;
  const data = param.data_points;
  const domain = computeYDomain(data, param.expected_min, param.expected_max);
  const lineColor =
    param.status === "out_of_range" ? "#ef4444" : param.status === "warning" ? "#f59e0b" : "#38bdf8";
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-slate-400">{param.label}</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="t" tickFormatter={(v: number) => `${v}s`} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} domain={domain} width={48} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
            labelFormatter={(v: number) => `t=${v}s`}
            formatter={(v: number) => [typeof v === "number" ? v.toFixed(1) : v, param.label]}
          />
          {param.expected_min !== null && (
            <ReferenceLine y={param.expected_min} stroke="#f59e0b" strokeDasharray="4 2"
              label={{ value: `min ${param.expected_min}`, fill: "#f59e0b", fontSize: 10 }} />
          )}
          {param.expected_max !== null && (
            <ReferenceLine y={param.expected_max} stroke="#f59e0b" strokeDasharray="4 2"
              label={{ value: `max ${param.expected_max}`, fill: "#f59e0b", fontSize: 10 }} />
          )}
          <Line type="monotone" dataKey="v" stroke={lineColor} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimpleFieldChart({
  data,
  label,
  color,
  syncId,
  unit = "",
}: {
  data: Array<{ t: number; v: number }>;
  label: string;
  color: string;
  syncId: string;
  unit?: string;
}) {
  if (data.length === 0) return null;
  const domain = computeYDomain(data, null, null);
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="t" tickFormatter={(v: number) => `${v}s`} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} domain={domain} width={48} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
            labelFormatter={(v: number) => `t=${v}s`}
            formatter={(v: number) => [`${typeof v === "number" ? v.toFixed(1) : v}${unit ? " " + unit : ""}`, label]}
          />
          <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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

  // GPS segments for the map: full maneuver path + per-step colored segments
  const { allMapPos, stepSegments } = useMemo(() => {
    const pts = parsedResult.points.filter(
      (p) => p.t !== null && p.t >= maneuverStartMs && p.t <= maneuverEndMs,
    );
    const allPos = pts.map((p) => [p.lat, p.lon] as [number, number]);

    const segs = review.analysis.steps.map((step, i) => {
      const sMs = new Date(step.start_time).getTime();
      const eMs = new Date(step.end_time).getTime();
      return {
        pts: parsedResult.points
          .filter((p) => p.t !== null && (p.t as number) >= sMs && (p.t as number) <= eMs)
          .map((p) => [p.lat, p.lon] as [number, number]),
        color: STEP_COLORS[i % STEP_COLORS.length]!,
        name: step.name,
      };
    });

    return { allMapPos: allPos, stepSegments: segs };
  }, [parsedResult.points, review.analysis.steps, maneuverStartMs, maneuverEndMs]);

  const syncId = "maneuver-overview";
  const altDomain = useMemo(() => computeYDomain(altPoints, null, null), [altPoints]);
  const iasDomain = useMemo(() => computeYDomain(iasPoints, null, null), [iasPoints]);

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
        {/* Step legend */}
        {stepRanges.length > 0 && (
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
        )}
      </div>

      {/* Route map with per-step colored segments */}
      {hasMap && (
        <div className="h-[220px] min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <MapContainer
            bounds={allMapPos}
            className="h-full w-full"
            scrollWheelZoom={false}
            zoomControl={true}
            attributionControl={false}
            preferCanvas
          >
            <InvalidateMapSize />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {/* Faded full-maneuver background path */}
            <Polyline positions={allMapPos} color="#475569" weight={2} opacity={0.35} />
            {/* Per-step highlighted segments */}
            {stepSegments.map((seg, i) =>
              seg.pts.length >= 2 ? (
                <Polyline
                  key={i}
                  positions={seg.pts}
                  color={seg.color}
                  weight={5}
                  opacity={0.9}
                />
              ) : null,
            )}
          </MapContainer>
        </div>
      )}

      {/* Altitude chart with step shading */}
      {hasAlt && (
        <div className="flex h-[154px] min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-slate-400">Altitude (ft)</p>
          <ResponsiveContainer width="100%" height="100%" debounce={50} className="min-h-0 flex-1">
            <LineChart data={altPoints} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => `${v}s`}
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} domain={altDomain} width={48} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                labelFormatter={(v: number) => `t=${v}s`}
                formatter={(v: number) => [`${Math.round(v)}ft`, "Altitude"]}
              />
              {stepRanges.map((s, i) => (
                <ReferenceArea
                  key={i}
                  x1={s.startSec}
                  x2={s.endSec}
                  fill={s.color}
                  fillOpacity={0.1}
                  stroke={s.color}
                  strokeOpacity={0.3}
                  strokeWidth={1}
                />
              ))}
              <Line
                type="monotone"
                dataKey="v"
                stroke="#94a3b8"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* IAS chart with step shading */}
      {hasIas && (
        <div className="flex h-[134px] min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-slate-400">IAS (kt)</p>
          <ResponsiveContainer width="100%" height="100%" debounce={50} className="min-h-0 flex-1">
            <LineChart data={iasPoints} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => `${v}s`}
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} domain={iasDomain} width={48} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                labelFormatter={(v: number) => `t=${v}s`}
                formatter={(v: number) => [`${v.toFixed(1)}kt`, "IAS"]}
              />
              {stepRanges.map((s, i) => (
                <ReferenceArea
                  key={i}
                  x1={s.startSec}
                  x2={s.endSec}
                  fill={s.color}
                  fillOpacity={0.1}
                  stroke={s.color}
                  strokeOpacity={0.3}
                  strokeWidth={1}
                />
              ))}
              <Line
                type="monotone"
                dataKey="v"
                stroke="#38bdf8"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
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
                {showAlt && <SimpleFieldChart data={altPoints} label="Altitude (ft)" color="#94a3b8" syncId={syncId} unit="ft" />}
                {showIas && <SimpleFieldChart data={iasPoints} label="IAS (kt)" color="#38bdf8" syncId={syncId} unit="kt" />}
                {step.parameters.map((p, i) => (
                  <ParameterChart key={i} param={p} syncId={syncId} />
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
  parsedResult,
  onDeleted,
  onAnalyzed,
}: {
  maneuver: FlightManeuver;
  template: ManeuverTemplate | undefined;
  review: FlightManeuverReview | undefined;
  isInstructor: boolean;
  flightId: string;
  parsedResult: ParseResult | null;
  onDeleted: (id: string) => void;
  onAnalyzed: (review: FlightManeuverReview, updatedManeuver: FlightManeuver) => void;
}) {
  const { showToast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={analyzing}
                className="rounded border border-violet-700/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20 disabled:opacity-50"
              >
                {analyzing ? "Analisando..." : review ? "Reanalisar" : "Analisar"}
              </button>
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
}: {
  flightId: string;
  flight: SavedFlightListItem;
  csvText: string | null;
  templates: ManeuverTemplate[];
  onClose: () => void;
  onAdded: (maneuver: FlightManeuver) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [templateId, setTemplateId] = useState("");
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
  const handleChartClick = useCallback(
    (chartEvent: unknown) => {
      const ev = chartEvent as { activePayload?: Array<{ payload: { x: number } }> } | null;
      const xMs = ev?.activePayload?.[0]?.payload?.x;
      if (xMs == null) return;
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
      const created = await createFlightManeuver({
        flight_id: flightId,
        template_id: templateId,
        instructor_id: user?.id ?? "",
        student_id: flight.student_user_id,
        aircraft_ident: flight.aircraft_ident,
        start_time: new Date(telemetry.baseMs + startX).toISOString(),
        end_time: new Date(telemetry.baseMs + endX).toISOString(),
        status: "draft",
        created_by: user?.id ?? "",
      });
      onAdded(created);
      showToast({ variant: "success", message: "Manobra adicionada." });
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
      <div className="my-4 w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">Adicionar manobra</h3>
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

                {/* Charts — all share the same syncId for universal tooltip */}
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
                      <ResponsiveContainer width="100%" height={height}>
                        <LineChart
                          data={telemetry.points}
                          syncId="modal-charts"
                          onClick={handleChartClick}
                          onMouseMove={(data: { activePayload?: Array<{ payload: { x: number } }> }) => {
                            const xMs = data?.activePayload?.[0]?.payload?.x;
                            if (xMs == null) return;
                            const pos = findHoverPos(telemetry.flightPoints, telemetry.baseMs, xMs);
                            mapHoverRef.current?.(pos);
                          }}
                          onMouseLeave={() => mapHoverRef.current?.(null)}
                          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="x"
                            type="number"
                            domain={chartDomain ?? [0, telemetry.totalMs]}
                            tickFormatter={(v: number) => formatHHMM(v, telemetry.baseMs)}
                            tick={{ fontSize: 9, fill: "#475569" }}
                            minTickGap={40}
                            allowDataOverflow
                          />
                          <YAxis dataKey={dataKey} tick={{ fontSize: 9, fill: "#475569" }} width={44} tickFormatter={tickFmt} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                            labelFormatter={(v: number) => formatHHMMSS(v, telemetry.baseMs)}
                            formatter={(v: number) => [tickFmt(v), label]}
                          />
                          {startX !== null && endX !== null && (
                            <ReferenceArea x1={startX} x2={endX} fill="#22d3ee" fillOpacity={0.12} stroke="#22d3ee" strokeOpacity={0.3} />
                          )}
                          {startX !== null && (
                            <ReferenceLine x={startX} stroke="#22d3ee" strokeWidth={2}
                              label={{ value: "Início", position: "top", fill: "#22d3ee", fontSize: 9 }} />
                          )}
                          {endX !== null && (
                            <ReferenceLine x={endX} stroke="#f97316" strokeWidth={2}
                              label={{ value: "Fim", position: "top", fill: "#f97316", fontSize: 9 }} />
                          )}
                          <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
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
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export function FlightReviewTab({ flightId }: { flightId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isInstructor = user?.role === "instrutor" || user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [flight, setFlight] = useState<SavedFlightListItem | null>(null);
  const [flightCsvText, setFlightCsvText] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ManeuverTemplate[]>([]);
  const [maneuvers, setManeuvers] = useState<FlightManeuver[]>([]);
  const [reviewMap, setReviewMap] = useState<Record<string, FlightManeuverReview>>({});
  const [templateMap, setTemplateMap] = useState<Record<string, ManeuverTemplate>>({});
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
  }, [flightId, showToast]);

  useEffect(() => { void load(); }, [load]);

  /** Parsed CSV for reconstructing chart data_points at render time (charts survive page reload). */
  const parsedCsvResult = useMemo<ParseResult | null>(() => {
    if (!flightCsvText) return null;
    try { return parseGarminCsv(flightCsvText); } catch { return null; }
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100">Flight Review</h3>
          <p className="text-xs text-slate-500">Análise de manobras com base na telemetria do voo</p>
        </div>
        {isInstructor && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            + Adicionar manobra
          </button>
        )}
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
              parsedResult={parsedCsvResult}
              onDeleted={handleDeleted}
              onAnalyzed={handleAnalyzed}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
