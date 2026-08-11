import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import type { FlightPlanLeg } from "../lib/flightPlanningRoute";
import type { LegCorridorInfo } from "../lib/legCorridor";
import {
  getRouteElevation,
  routeGeometryKey,
  type RouteElevationPoint,
} from "../lib/routeElevationDb";
import type { RoutePerformanceProfile } from "../lib/routePerformanceProfile";
import { formatEteClock } from "../lib/flightPlanningRoute";
import {
  buildCorridorBands,
  buildVerticalProfileChartData,
  buildWaypointDistanceMarks,
} from "../lib/routeVerticalProfile";

type Props = {
  waypoints: FlightPlanWaypoint[];
  legs: FlightPlanLeg[];
  totalDistanceNm: number;
  performance?: RoutePerformanceProfile | null;
  corridors?: Array<LegCorridorInfo | null>;
};

type ChartRow = {
  xNm: number;
  terrainFt: number | null;
  plannedFt: number | null;
  waypointFt: number | null;
  phaseFt: number | null;
  label?: string;
  phaseLabel?: string;
  eteHours?: number | null;
};

type ScatterShapeProps = {
  cx?: number;
  cy?: number;
  payload?: unknown;
};

const terrainCache = new Map<string, RouteElevationPoint[]>();

function TriangleMarker(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const size = 6;
  return (
    <polygon
      points={`${cx},${cy - size} ${cx - size * 0.9},${cy + size * 0.7} ${cx + size * 0.9},${cy + size * 0.7}`}
      fill="#22d3ee"
      stroke="#ecfeff"
      strokeWidth={1}
    />
  );
}

function PhaseMarker(props: { cx?: number; cy?: number; payload?: ChartRow }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const isToc = payload?.phaseLabel === "TOC";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={isToc ? "#a78bfa" : "#e879f9"}
      stroke="#f8fafc"
      strokeWidth={1.5}
    />
  );
}

function ProfileTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
    payload?: ChartRow;
  }>;
  label?: number | string;
  coordinate?: { x?: number; y?: number };
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((p) => p.payload)?.payload;
  if (!row) return null;
  const nm = `${Number(row.xNm).toFixed(1)} NM`;
  const ete = formatEteClock(row.eteHours ?? null);
  const title = row.phaseLabel || row.label || null;

  const lines: Array<{ text: string; color: string }> = [];
  lines.push({ text: `Distância: ${nm}`, color: "#94a3b8" });
  lines.push({ text: `ETE: ${ete}`, color: "#a5b4fc" });
  if (row.terrainFt != null) {
    lines.push({ text: `Terreno: ${Math.round(row.terrainFt)} ft`, color: "#ca8a04" });
  }
  if (row.plannedFt != null) {
    lines.push({ text: `Planejado: ${Math.round(row.plannedFt)} ft`, color: "#22d3ee" });
  }
  if (row.phaseFt != null && row.phaseLabel) {
    lines.push({
      text: `${row.phaseLabel}: ${Math.round(row.phaseFt)} ft`,
      color: row.phaseLabel === "TOC" ? "#c4b5fd" : "#f0abfc",
    });
  } else if (row.waypointFt != null && row.label) {
    lines.push({ text: `Ponto: ${Math.round(row.waypointFt)} ft`, color: "#67e8f9" });
  }

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "#e2e8f0",
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        pointerEvents: "none",
      }}
    >
      <p style={{ margin: 0, marginBottom: 4, fontWeight: 600, color: "#f1f5f9" }}>
        {title || "Perfil"}
      </p>
      {lines.map((l) => (
        <p key={l.text} style={{ margin: "2px 0", color: l.color }}>
          {l.text}
        </p>
      ))}
    </div>
  );
}

const X_TICK_NAME_MAX = 14;
/** Min spacing (as fraction of total route NM) before labels share a row. */
const X_TICK_MIN_GAP_FRAC = 0.085;
const X_TICK_MIN_GAP_NM = 5;
const X_TICK_ROW_STEP = 28;

function nmKey(xNm: number): number {
  return Number(xNm.toFixed(4));
}

function shortenWaypointLabel(name: string, max = X_TICK_NAME_MAX): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** Assign vertical rows so nearby waypoint labels do not overwrite each other. */
function assignWaypointTickRows(
  marks: Array<{ xNm: number }>,
  totalDistanceNm: number,
): Map<number, number> {
  const minGap = Math.max(totalDistanceNm * X_TICK_MIN_GAP_FRAC, X_TICK_MIN_GAP_NM);
  const sorted = [...marks].sort((a, b) => a.xNm - b.xNm);
  const rowByNm = new Map<number, number>();
  const lastXByRow: number[] = [];

  for (const m of sorted) {
    let row = 0;
    while (row < lastXByRow.length && m.xNm - (lastXByRow[row] ?? -Infinity) < minGap) {
      row += 1;
    }
    // Cap depth so labels stay readable; wrap to next free-enough slot.
    if (row > 2) {
      row = 0;
      for (let r = 0; r < lastXByRow.length; r++) {
        if (m.xNm - (lastXByRow[r] ?? -Infinity) >= minGap * 0.55) {
          row = r;
          break;
        }
      }
    }
    lastXByRow[row] = m.xNm;
    rowByNm.set(nmKey(m.xNm), row);
  }
  return rowByNm;
}

function WaypointAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: number };
  labelByNm: Map<number, string>;
  rowByNm: Map<number, number>;
}) {
  const { x = 0, y = 0, payload, labelByNm, rowByNm } = props;
  const v = Number(payload?.value ?? 0);
  const key = nmKey(v);
  const name = labelByNm.get(key);
  const row = rowByNm.get(key) ?? 0;
  const nameText = name ? shortenWaypointLabel(name) : "";
  const distText = `${v.toFixed(0)} nm`;
  const baseDy = 11 + row * X_TICK_ROW_STEP;
  return (
    <g transform={`translate(${x},${y})`}>
      {nameText ? (
        <text dy={baseDy} textAnchor="middle" fill="#94a3b8" fontSize={10} fontWeight={600}>
          {name && name !== nameText ? <title>{name}</title> : null}
          {nameText}
        </text>
      ) : null}
      <text
        dy={nameText ? baseDy + 14 : baseDy}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={11}
        fontWeight={500}
      >
        {distText}
      </text>
    </g>
  );
}

export function RouteVerticalProfileChart({
  waypoints,
  legs,
  totalDistanceNm,
  performance = null,
  corridors = [],
}: Props) {
  const [terrain, setTerrain] = useState<RouteElevationPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const geometryKey = useMemo(
    () =>
      waypoints.length >= 2
        ? routeGeometryKey(waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })))
        : "",
    [waypoints],
  );

  useEffect(() => {
    if (!geometryKey || waypoints.length < 2 || !(totalDistanceNm > 0)) {
      setTerrain([]);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = terrainCache.get(geometryKey);
    if (cached) {
      setTerrain(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void getRouteElevation(
        waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })),
        { samples: 80 },
      )
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          terrainCache.set(geometryKey, result.points);
          setTerrain(result.points);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setTerrain([]);
          setLoading(false);
          setError(err instanceof Error ? err.message : "Falha ao carregar terreno.");
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [geometryKey, waypoints, totalDistanceNm]);

  const corridorBands = useMemo(
    () => buildCorridorBands(legs, corridors),
    [legs, corridors],
  );

  const chartData = useMemo(() => {
    const base = buildVerticalProfileChartData({
      waypoints,
      legs,
      terrain,
      totalDistanceNm,
      performanceProfile: performance?.profile ?? null,
    });

    const byX = new Map<number, ChartRow>();
    for (const p of base) {
      byX.set(Number(p.xNm.toFixed(4)), {
        xNm: p.xNm,
        terrainFt: p.terrainFt,
        plannedFt: p.plannedFt,
        waypointFt: p.waypointFt,
        phaseFt: null,
        label: p.label,
        eteHours: p.eteHours ?? null,
      });
    }

    for (const m of performance?.phaseMarkers ?? []) {
      const key = Number(m.xNm.toFixed(4));
      const existing = byX.get(key);
      if (existing) {
        byX.set(key, {
          ...existing,
          plannedFt: existing.plannedFt ?? m.altFt,
          phaseFt: m.altFt,
          phaseLabel: m.label,
          label: existing.label || m.label,
          eteHours: existing.eteHours ?? m.eteHours ?? null,
        });
      } else {
        byX.set(key, {
          xNm: m.xNm,
          terrainFt: null,
          plannedFt: m.altFt,
          waypointFt: null,
          phaseFt: m.altFt,
          phaseLabel: m.label,
          label: m.label,
          eteHours: m.eteHours ?? null,
        });
      }
    }

    return [...byX.values()].sort((a, b) => a.xNm - b.xNm);
  }, [waypoints, legs, terrain, totalDistanceNm, performance]);

  const waypointMarks = useMemo(
    () => buildWaypointDistanceMarks(waypoints, legs),
    [waypoints, legs],
  );

  const tickValues = useMemo(() => waypointMarks.map((m) => m.xNm), [waypointMarks]);
  const labelByNm = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of waypointMarks) {
      map.set(nmKey(m.xNm), m.label);
    }
    return map;
  }, [waypointMarks]);
  const rowByNm = useMemo(
    () => assignWaypointTickRows(waypointMarks, totalDistanceNm),
    [waypointMarks, totalDistanceNm],
  );
  const xAxisHeight = useMemo(() => {
    let maxRow = 0;
    for (const row of rowByNm.values()) maxRow = Math.max(maxRow, row);
    return 40 + maxRow * X_TICK_ROW_STEP;
  }, [rowByNm]);

  const yDomain = useMemo(() => {
    let maxFt = 500;
    for (const p of chartData) {
      if (p.terrainFt != null) maxFt = Math.max(maxFt, p.terrainFt);
      if (p.plannedFt != null) maxFt = Math.max(maxFt, p.plannedFt);
      if (p.phaseFt != null) maxFt = Math.max(maxFt, p.phaseFt);
    }
    for (const b of corridorBands) {
      maxFt = Math.max(maxFt, b.altMax);
    }
    if (performance?.cruiseAltFt) maxFt = Math.max(maxFt, performance.cruiseAltFt);
    const padded = Math.ceil((maxFt * 1.15) / 500) * 500;
    return [0, Math.max(500, padded)] as [number, number];
  }, [chartData, performance, corridorBands]);

  const hasPlanned = chartData.some((p) => p.plannedFt != null);
  const ready = waypoints.length >= 2 && totalDistanceNm > 0;
  const tocCount = performance?.phaseMarkers.filter((m) => m.label === "TOC").length ?? 0;
  const todCount = performance?.phaseMarkers.filter((m) => m.label === "TOD").length ?? 0;

  return (
    <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-100">Perfil vertical</h3>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          {loading ? <span className="text-cyan-300/80">Atualizando relevo…</span> : null}
          {error ? <span className="text-amber-300/90">{error}</span> : null}
          {tocCount > 0 ? (
            <span className="font-mono text-violet-300/90">
              TOC×{tocCount}
            </span>
          ) : null}
          {todCount > 0 ? (
            <span className="font-mono text-fuchsia-300/90">
              TOD×{todCount}
            </span>
          ) : null}
        </div>
      </div>
      <div className="px-1 pt-1">
        {!ready ? (
          <p className="grid h-72 place-items-center text-[11px] text-slate-600">
            Defina origem e destino para ver o perfil
          </p>
        ) : chartData.length > 1 && (hasPlanned || terrain.length > 0) ? (
          <div className="h-80 w-full sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="routeTerrainFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c4a574" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#8b6914" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="xNm"
                  type="number"
                  domain={[0, "dataMax"]}
                  ticks={tickValues.length ? tickValues : undefined}
                  interval={0}
                  tick={<WaypointAxisTick labelByNm={labelByNm} rowByNm={rowByNm} />}
                  height={xAxisHeight}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={{ stroke: "#334155" }}
                />
                <YAxis
                  width={40}
                  domain={yDomain}
                  allowDataOverflow
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickFormatter={(v) => {
                    const n = Number(v);
                    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
                    return `${Math.round(n)}`;
                  }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={{ stroke: "#334155" }}
                />
                <Tooltip
                  content={<ProfileTooltip />}
                  cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 20, pointerEvents: "none" }}
                  offset={12}
                />
                {corridorBands.map((b) => (
                  <ReferenceArea
                    key={`corridor-${b.name}-${b.x0Nm}-${b.x1Nm}`}
                    x1={b.x0Nm}
                    x2={b.x1Nm}
                    y1={b.altMin}
                    y2={b.altMax}
                    stroke="#f87171"
                    strokeOpacity={0.7}
                    strokeDasharray="4 3"
                    fill="#f87171"
                    fillOpacity={0.05}
                    ifOverflow="extendDomain"
                    label={{
                      value: b.name,
                      position: "insideBottom",
                      fill: "#fca5a5",
                      fontSize: 9,
                      fontWeight: 600,
                    }}
                  />
                ))}
                {waypointMarks.map((m) => (
                  <ReferenceLine
                    key={`wp-${m.xNm}-${m.label}`}
                    x={m.xNm}
                    stroke="#334155"
                    strokeDasharray="2 4"
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="terrainFt"
                  stroke="#a16207"
                  fill="url(#routeTerrainFill)"
                  strokeWidth={1}
                  name="terrainFt"
                  connectNulls
                  isAnimationActive={false}
                  baseValue={0}
                />
                <Line
                  type="linear"
                  dataKey="plannedFt"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, stroke: "#ecfeff", strokeWidth: 1 }}
                  name="plannedFt"
                  connectNulls
                  isAnimationActive={false}
                />
                <Scatter
                  dataKey="waypointFt"
                  name="waypointFt"
                  shape={(props: ScatterShapeProps) => <TriangleMarker cx={props.cx} cy={props.cy} />}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Scatter
                  dataKey="phaseFt"
                  name="phaseFt"
                  shape={(props: ScatterShapeProps) => (
                    <PhaseMarker cx={props.cx} cy={props.cy} payload={props.payload as ChartRow} />
                  )}
                  isAnimationActive={false}
                  legendType="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="grid h-72 place-items-center text-[11px] text-slate-600">
            {loading ? "Carregando relevo…" : "Sem dados de perfil ainda"}
          </p>
        )}
      </div>
    </section>
  );
}
