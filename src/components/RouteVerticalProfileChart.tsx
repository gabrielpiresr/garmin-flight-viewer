import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlightPlanAirspaceHit, FlightPlanWaypoint } from "../types/flightPlanning";
import type { FlightPlanLeg } from "../lib/flightPlanningRoute";
import type { LegCorridorInfo } from "../lib/legCorridor";
import {
  getRouteElevation,
  routeGeometryKey,
  type RouteElevationPoint,
} from "../lib/routeElevationDb";
import type { RoutePerformanceProfile } from "../lib/routePerformanceProfile";
import { formatEteClock } from "../lib/flightPlanningRoute";
import { airspaceTypeLabel } from "../lib/airspaceLayersDb";
import {
  buildAirspaceProfileBands,
  buildCorridorBands,
  buildVerticalProfileChartData,
  buildWaypointDistanceMarks,
  type AirspaceProfileBand,
} from "../lib/routeVerticalProfile";

type Props = {
  waypoints: FlightPlanWaypoint[];
  legs: FlightPlanLeg[];
  totalDistanceNm: number;
  performance?: RoutePerformanceProfile | null;
  corridors?: Array<LegCorridorInfo | null>;
  airspaces?: FlightPlanAirspaceHit[];
  onWaypointAltitudeChange?: (index: number, altitudeFt: number) => void;
};

type ChartMouseState = {
  activeLabel?: string | number;
  activePayload?: Array<{ payload?: ChartRow }>;
  chartX?: number;
};

type XDomain = [number, number];

const PLOT_LEFT_PX = 40;
const PLOT_RIGHT_PX = 12;

function xNmFromChartState(state: ChartMouseState | null, domain: XDomain, width: number): number | null {
  if (state?.chartX != null && Number.isFinite(state.chartX) && width > 0) {
    const plotW = Math.max(1, width - PLOT_LEFT_PX - PLOT_RIGHT_PX);
    const ratio = Math.min(1, Math.max(0, (state.chartX - PLOT_LEFT_PX) / plotW));
    return domain[0] + (domain[1] - domain[0]) * ratio;
  }
  if (!state) return null;
  if (typeof state.activeLabel === "number" && Number.isFinite(state.activeLabel)) {
    return state.activeLabel;
  }
  const parsed = Number(state.activeLabel);
  if (state.activeLabel != null && state.activeLabel !== "" && Number.isFinite(parsed)) {
    return parsed;
  }
  const x = state.activePayload?.[0]?.payload?.xNm;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function clampDomain(min: number, max: number, full: XDomain): XDomain {
  const lo = Math.max(full[0], Math.min(min, max));
  const hi = Math.min(full[1], Math.max(min, max));
  return [lo, hi];
}

function airspaceFillOpacity(type: FlightPlanAirspaceHit["type"], altitudeMiss: boolean): number {
  const base = (() => {
    switch (type) {
      case "FIR":
        return 0.02;
      case "FIS":
        return 0.025;
      case "CTA":
        return 0.03;
      case "TMA":
        return 0.04;
      case "P":
      case "R":
      case "D":
        return 0.07;
      default:
        return 0.045;
    }
  })();
  return altitudeMiss ? base * 0.65 : base;
}

type VisibleAirspaceBand = AirspaceProfileBand & { y1: number; y2: number };

function clipAirspaceBandToScale(
  band: AirspaceProfileBand,
  xDomain: XDomain,
  yDomain: [number, number],
): VisibleAirspaceBand | null {
  const x0 = Math.max(band.x0Nm, xDomain[0]);
  const x1 = Math.min(band.x1Nm, xDomain[1]);
  if (!(x1 > x0)) return null;
  const rawTop = band.unlimited ? yDomain[1] : band.altMax;
  const y1 = Math.max(band.altMin, yDomain[0]);
  const y2 = Math.min(rawTop, yDomain[1]);
  if (!(y2 > y1)) return null;
  return { ...band, x0Nm: x0, x1Nm: x1, y1, y2 };
}

const LABEL_TYPE_PRIORITY: FlightPlanAirspaceHit["type"][] = [
  "P",
  "R",
  "D",
  "ATZ",
  "CTR",
  "FIZ",
  "AFIS",
  "TMA",
  "CTA",
  "FIS",
  "FIR",
];

function firstChartAxis(map: unknown): { scale?: (v: number) => number } | null {
  if (!map || typeof map !== "object") return null;
  const first = Object.values(map as Record<string, { scale?: (v: number) => number }>)[0];
  return first ?? null;
}

function AirspaceLabelsOverlay({
  chartProps,
  bands,
}: {
  chartProps: Record<string, unknown>;
  bands: VisibleAirspaceBand[];
}) {
  const xAxis = firstChartAxis(chartProps.xAxisMap);
  const yAxis = firstChartAxis(chartProps.yAxisMap);
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;
  const offset = chartProps.offset as
    | { top?: number; left?: number; width?: number; height?: number }
    | undefined;
  if (typeof xScale !== "function" || typeof yScale !== "function") return null;

  const plotLeft = offset?.left ?? 0;
  const plotTop = offset?.top ?? 0;
  const plotW = offset?.width ?? 0;
  const plotH = offset?.height ?? 0;
  const plotRight = plotLeft + plotW;
  const plotBottom = plotTop + plotH;
  const pad = 3;
  const lineH = 12;

  type Box = { x: number; y: number; w: number; h: number; text: string; color: string };
  const placed: Box[] = [];
  const priority = new Map(LABEL_TYPE_PRIORITY.map((t, i) => [t, i]));
  const sorted = [...bands].sort((a, b) => {
    const pa = priority.get(a.type) ?? 99;
    const pb = priority.get(b.type) ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.x1Nm - a.x0Nm) * (a.y2 - a.y1) - (b.x1Nm - b.x0Nm) * (b.y2 - b.y1);
  });

  for (const b of sorted) {
    if (b.type === "FIR") continue;
    const left = Math.min(xScale(b.x0Nm), xScale(b.x1Nm));
    const right = Math.max(xScale(b.x0Nm), xScale(b.x1Nm));
    const top = Math.min(yScale(b.y2), yScale(b.y1));
    const bot = Math.max(yScale(b.y2), yScale(b.y1));
    const cl = Math.max(left, plotLeft);
    const cr = Math.min(right, plotRight);
    const ct = Math.max(top, plotTop);
    const cb = Math.min(bot, plotBottom);
    const bw = cr - cl;
    const bh = cb - ct;
    if (bw < 32 || bh < 14) continue;

    const tw = Math.min(bw - pad * 2, b.name.length * 5.7 + 6);
    if (tw < 18) continue;
    const candidates = [
      { x: cl + (bw - tw) / 2, y: ct + pad },
      { x: cl + pad, y: ct + pad },
      { x: cr - tw - pad, y: ct + pad },
      { x: cl + (bw - tw) / 2, y: cb - lineH - pad },
      { x: cl + pad, y: (ct + cb - lineH) / 2 },
      { x: cr - tw - pad, y: (ct + cb - lineH) / 2 },
    ];

    for (const c of candidates) {
      const box: Box = {
        x: Math.max(cl + 1, Math.min(c.x, cr - tw - 1)),
        y: Math.max(ct + 1, Math.min(c.y, cb - lineH - 1)),
        w: tw,
        h: lineH,
        text: b.name,
        color: b.color,
      };
      if (box.x < cl || box.y < ct || box.x + box.w > cr || box.y + box.h > cb) continue;
      const overlaps = placed.some(
        (p) =>
          !(box.x + box.w + 3 < p.x || p.x + p.w + 3 < box.x || box.y + box.h + 2 < p.y || p.y + p.h + 2 < box.y),
      );
      if (!overlaps) {
        placed.push(box);
        break;
      }
    }
  }

  return (
    <g pointerEvents="none">
      {placed.map((p) => (
        <text
          key={`${p.text}-${p.x.toFixed(1)}-${p.y.toFixed(1)}`}
          x={p.x + p.w / 2}
          y={p.y + p.h - 2}
          textAnchor="middle"
          fill={p.color}
          fontSize={9}
          fontWeight={600}
          stroke="#0f172a"
          strokeWidth={3}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {p.text}
        </text>
      ))}
    </g>
  );
}

function AirspaceBorderOverlay({
  chartProps,
  bands,
  hoveredKey,
  onHover,
}: {
  chartProps: Record<string, unknown>;
  bands: VisibleAirspaceBand[];
  hoveredKey: string | null;
  onHover: (band: VisibleAirspaceBand | null, clientX: number, clientY: number) => void;
}) {
  const xAxis = firstChartAxis(chartProps.xAxisMap);
  const yAxis = firstChartAxis(chartProps.yAxisMap);
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;
  if (typeof xScale !== "function" || typeof yScale !== "function") return null;

  return (
    <g>
      {bands.map((b) => {
        const x = Math.min(xScale(b.x0Nm), xScale(b.x1Nm));
        const y = Math.min(yScale(b.y2), yScale(b.y1));
        const w = Math.abs(xScale(b.x1Nm) - xScale(b.x0Nm));
        const h = Math.abs(yScale(b.y2) - yScale(b.y1));
        if (!(w > 1) || !(h > 1)) return null;
        const hovered = hoveredKey === b.key;
        return (
          <g key={`border-${b.key}`}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke={b.color}
              strokeOpacity={0.02}
              strokeWidth={12}
              pointerEvents="stroke"
              style={{ cursor: "pointer" }}
              onMouseEnter={(event) => onHover(b, event.clientX, event.clientY)}
              onMouseMove={(event) => onHover(b, event.clientX, event.clientY)}
              onMouseLeave={() => onHover(null, 0, 0)}
              onMouseDown={(event) => event.stopPropagation()}
            />
            {hovered ? (
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="none"
                stroke={b.color}
                strokeOpacity={0.95}
                strokeWidth={2}
                strokeDasharray={b.altitudeMiss ? "4 3" : undefined}
                pointerEvents="none"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function AirspaceHoverCard({ band }: { band: VisibleAirspaceBand }) {
  const typeLabel = airspaceTypeLabel(band.type);
  const limits = `${band.lowerLabel} / ${band.upperLabel}`;
  const span = `${band.x0Nm.toFixed(1)}–${band.x1Nm.toFixed(1)} NM`;
  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${band.color}99`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "#e2e8f0",
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        pointerEvents: "none",
        minWidth: 180,
        maxWidth: 260,
      }}
    >
      <p style={{ margin: 0, marginBottom: 4, fontWeight: 700, color: band.color }}>
        {band.type} · {typeLabel}
      </p>
      <p style={{ margin: "2px 0", color: "#f1f5f9", fontWeight: 600 }}>{band.fullName}</p>
      {band.ident && band.ident !== "—" ? (
        <p style={{ margin: "2px 0", color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{band.ident}</p>
      ) : null}
      <p style={{ margin: "2px 0", color: "#cbd5e1" }}>Limites: {limits}</p>
      <p style={{ margin: "2px 0", color: "#94a3b8" }}>Na rota: {span}</p>
      {band.frequencies ? (
        <p style={{ margin: "2px 0", color: "#a5b4fc" }}>{band.frequencies}</p>
      ) : null}
      {band.altitudeMiss ? (
        <p style={{ margin: "4px 0 0", color: "#fbbf24" }}>Rota passa fora da altitude deste espaço</p>
      ) : null}
    </div>
  );
}

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

function TriangleMarker(props: {
  cx?: number;
  cy?: number;
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const { cx, cy, onPointerDown } = props;
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const size = 6;
  return (
    <g
      style={{ cursor: onPointerDown ? "ns-resize" : undefined }}
      onPointerDown={(event) => {
        if (!onPointerDown) return;
        event.stopPropagation();
        event.preventDefault();
        onPointerDown(event);
      }}
    >
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      <polygon
        points={`${cx},${cy - size} ${cx - size * 0.9},${cy + size * 0.7} ${cx + size * 0.9},${cy + size * 0.7}`}
        fill="#22d3ee"
        stroke="#ecfeff"
        strokeWidth={1}
      />
    </g>
  );
}

function AltitudeConfirmPopover({
  edit,
  plotWidth,
  plotHeight,
  plotLeft,
  plotTop,
  onCancel,
  onConfirm,
}: {
  edit: { label: string; fromFt: number; previewFt: number; clientX: number; clientY: number };
  plotWidth: number;
  plotHeight: number;
  plotLeft: number;
  plotTop: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const left = Math.min(Math.max(8, edit.clientX - plotLeft - 90), Math.max(8, plotWidth - 188));
  const top = Math.min(Math.max(8, edit.clientY - plotTop - 84), Math.max(8, plotHeight - 108));
  return (
    <div
      className="absolute z-40 w-44 rounded-lg border border-slate-700 bg-slate-950 p-2.5 shadow-xl"
      style={{ left, top }}
    >
      <p className="truncate text-[11px] font-semibold text-slate-100">{edit.label}</p>
      <p className="mt-1 font-mono text-[11px] text-cyan-200">
        {edit.fromFt} → {edit.previewFt} ft
      </p>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
          onClick={onConfirm}
        >
          Aplicar
        </button>
      </div>
    </div>
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
  airspaces = [],
  onWaypointAltitudeChange,
}: Props) {
  const [terrain, setTerrain] = useState<RouteElevationPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAirspaces, setShowAirspaces] = useState(false);
  const [airspaceHover, setAirspaceHover] = useState<{
    band: VisibleAirspaceBand;
    x: number;
    y: number;
  } | null>(null);
  const [xZoom, setXZoom] = useState<XDomain | null>(null);
  const [dragRange, setDragRange] = useState<XDomain | null>(null);
  const requestIdRef = useRef(0);
  const plotShellRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const xZoomRef = useRef<XDomain | null>(null);
  const fullXDomainRef = useRef<XDomain>([0, Math.max(0, totalDistanceNm)]);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelClientXRef = useRef<number | null>(null);
  const altDraggingRef = useRef(false);
  const yDomainRef = useRef<[number, number]>([0, 500]);
  const xAxisHeightRef = useRef(40);
  const altitudeDragRef = useRef<{
    index: number;
    label: string;
    fromFt: number;
    previewFt: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [altitudeDrag, setAltitudeDrag] = useState<{
    index: number;
    label: string;
    fromFt: number;
    previewFt: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [altitudeConfirm, setAltitudeConfirm] = useState<{
    index: number;
    label: string;
    fromFt: number;
    previewFt: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const geometryKey = useMemo(
    () =>
      waypoints.length >= 2
        ? routeGeometryKey(waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })))
        : "",
    [waypoints],
  );

  const fullXDomain = useMemo<XDomain>(
    () => [0, Math.max(0, totalDistanceNm)],
    [totalDistanceNm],
  );
  const visibleXDomain = xZoom ?? fullXDomain;

  useEffect(() => {
    xZoomRef.current = xZoom;
  }, [xZoom]);
  useEffect(() => {
    fullXDomainRef.current = fullXDomain;
  }, [fullXDomain]);

  useEffect(() => {
    if (!showAirspaces) setAirspaceHover(null);
  }, [showAirspaces]);

  useEffect(() => {
    setXZoom(null);
    setDragRange(null);
    setAirspaceHover(null);
    dragStartXRef.current = null;
  }, [geometryKey, totalDistanceNm]);

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

  const airspaceBands = useMemo(
    () => buildAirspaceProfileBands(airspaces, totalDistanceNm),
    [airspaces, totalDistanceNm],
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

  const tickValues = useMemo(() => {
    const [x0, x1] = visibleXDomain;
    const visible = waypointMarks.filter((m) => m.xNm >= x0 - 0.05 && m.xNm <= x1 + 0.05).map((m) => m.xNm);
    return visible.length ? visible : undefined;
  }, [waypointMarks, visibleXDomain]);
  const labelByNm = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of waypointMarks) {
      map.set(nmKey(m.xNm), m.label);
    }
    return map;
  }, [waypointMarks]);
  const rowByNm = useMemo(
    () => assignWaypointTickRows(waypointMarks, Math.max(visibleXDomain[1] - visibleXDomain[0], 1)),
    [waypointMarks, visibleXDomain],
  );
  const xAxisHeight = useMemo(() => {
    let maxRow = 0;
    for (const row of rowByNm.values()) maxRow = Math.max(maxRow, row);
    return 40 + maxRow * X_TICK_ROW_STEP;
  }, [rowByNm]);

  const yDomain = useMemo(() => {
    const [x0, x1] = visibleXDomain;
    let maxFt = 500;
    for (const p of chartData) {
      if (p.xNm < x0 || p.xNm > x1) continue;
      if (p.terrainFt != null) maxFt = Math.max(maxFt, p.terrainFt);
      if (p.plannedFt != null) maxFt = Math.max(maxFt, p.plannedFt);
      if (p.phaseFt != null) maxFt = Math.max(maxFt, p.phaseFt);
    }
    for (const b of corridorBands) {
      if (b.x1Nm < x0 || b.x0Nm > x1) continue;
      maxFt = Math.max(maxFt, b.altMax);
    }
    if (performance?.cruiseAltFt) maxFt = Math.max(maxFt, performance.cruiseAltFt);
    if (altitudeDrag) maxFt = Math.max(maxFt, altitudeDrag.previewFt);
    if (altitudeConfirm) maxFt = Math.max(maxFt, altitudeConfirm.previewFt);
    const padded = Math.ceil((maxFt * 1.15) / 500) * 500;
    return [0, Math.max(500, padded)] as [number, number];
  }, [chartData, performance, corridorBands, visibleXDomain, altitudeDrag, altitudeConfirm]);
  yDomainRef.current = yDomain;
  xAxisHeightRef.current = xAxisHeight;

  const applyZoom = (next: XDomain | null) => {
    if (!next) {
      setXZoom(null);
      return;
    }
    const full = fullXDomainRef.current;
    const [min, max] = clampDomain(next[0], next[1], full);
    const fullSpan = full[1] - full[0] || 1;
    if (max - min < fullSpan * 0.005) return;
    if (max - min >= fullSpan * 0.92) {
      setXZoom(null);
      return;
    }
    setXZoom([min, max]);
  };

  const finishDragZoom = (endX: number | null) => {
    const start = dragStartXRef.current;
    dragStartXRef.current = null;
    setDragRange(null);
    if (altDraggingRef.current) return;
    if (start == null || endX == null) return;
    applyZoom([start, endX]);
  };

  function snapAltitudeFt(raw: number): number {
    return Math.max(0, Math.round(raw / 100) * 100);
  }

  function altitudeFtFromClientY(clientY: number): number {
    const el = plotShellRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const top = 14;
    const bottom = rect.height - xAxisHeightRef.current - 4;
    const plotH = Math.max(1, bottom - top);
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top - top) / plotH));
    const [y0, y1] = yDomainRef.current;
    return snapAltitudeFt(y1 - ratio * (y1 - y0));
  }

  function waypointIndexFromXNm(xNm: number): number {
    let best = 0;
    let bestDist = Infinity;
    waypointMarks.forEach((mark, index) => {
      const dist = Math.abs(mark.xNm - xNm);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return bestDist <= 1 ? best : -1;
  }

  function startAltitudeDrag(xNm: number, event: ReactPointerEvent) {
    if (!onWaypointAltitudeChange) return;
    const index = waypointIndexFromXNm(xNm);
    if (index < 0) return;
    const mark = waypointMarks[index];
    const wp = waypoints[index];
    const fromFt =
      wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)
        ? snapAltitudeFt(wp.altitudeFt)
        : mark?.altitudeFt != null
          ? snapAltitudeFt(mark.altitudeFt)
          : snapAltitudeFt(altitudeFtFromClientY(event.clientY));
    altDraggingRef.current = true;
    dragStartXRef.current = null;
    setDragRange(null);
    setAltitudeConfirm(null);
    const next = {
      index,
      label: mark?.label || wp?.label || `Ponto ${index + 1}`,
      fromFt,
      previewFt: fromFt,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    altitudeDragRef.current = next;
    setAltitudeDrag(next);
  }

  useEffect(() => {
    if (dragRange == null) return undefined;
    const onUp = () => finishDragZoom(dragRange[1]);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragRange]);

  const isAltitudeDrag = altitudeDrag != null;
  useEffect(() => {
    if (!isAltitudeDrag) return undefined;
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      const prev = altitudeDragRef.current;
      if (!prev) return;
      const next = {
        ...prev,
        previewFt: altitudeFtFromClientY(event.clientY),
        clientX: event.clientX,
        clientY: event.clientY,
      };
      altitudeDragRef.current = next;
      setAltitudeDrag(next);
    };
    const onUp = (event: PointerEvent) => {
      const prev = altitudeDragRef.current;
      const nextFt = altitudeFtFromClientY(event.clientY);
      altDraggingRef.current = false;
      altitudeDragRef.current = null;
      setAltitudeDrag(null);
      if (prev && nextFt !== prev.fromFt) {
        setAltitudeConfirm({
          ...prev,
          previewFt: nextFt,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isAltitudeDrag]);

  const hasPlanned = chartData.some((p) => p.plannedFt != null);
  const ready = waypoints.length >= 2 && totalDistanceNm > 0;
  const tocCount = performance?.phaseMarkers.filter((m) => m.label === "TOC").length ?? 0;
  const todCount = performance?.phaseMarkers.filter((m) => m.label === "TOD").length ?? 0;
  const zoomed = xZoom != null;
  const visibleAirspaceBands = useMemo(() => {
    if (!showAirspaces) return [];
    return airspaceBands
      .map((b) => clipAirspaceBandToScale(b, visibleXDomain, yDomain))
      .filter((b): b is VisibleAirspaceBand => b != null);
  }, [showAirspaces, airspaceBands, visibleXDomain, yDomain]);

  useEffect(() => {
    const el = plotShellRef.current;
    if (!el) return undefined;

    const applyWheelZoom = () => {
      wheelFrameRef.current = null;
      const full = fullXDomainRef.current;
      const [fullMin, fullMax] = full;
      const fullSpan = fullMax - fullMin;
      if (fullSpan <= 0) return;
      const current = xZoomRef.current ?? full;
      const currentSpan = current[1] - current[0];
      const rect = el.getBoundingClientRect();
      const left = PLOT_LEFT_PX;
      const right = PLOT_RIGHT_PX;
      const plotW = Math.max(1, rect.width - left - right);
      const clientX = wheelClientXRef.current ?? rect.left + left + plotW / 2;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left - left) / plotW));
      const anchor = current[0] + currentSpan * ratio;
      const factor = Math.exp(wheelDeltaRef.current * 0.0012);
      wheelDeltaRef.current = 0;
      const nextSpan = Math.min(fullSpan, Math.max(fullSpan / 800, currentSpan * factor));
      if (nextSpan >= fullSpan * 0.92) {
        setXZoom(null);
        return;
      }
      let nextMin = anchor - nextSpan * ratio;
      let nextMax = nextMin + nextSpan;
      if (nextMin < fullMin) {
        nextMin = fullMin;
        nextMax = fullMin + nextSpan;
      }
      if (nextMax > fullMax) {
        nextMax = fullMax;
        nextMin = fullMax - nextSpan;
      }
      setXZoom([nextMin, nextMax]);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      wheelDeltaRef.current += event.deltaY;
      wheelClientXRef.current = event.clientX;
      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = window.requestAnimationFrame(applyWheelZoom);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    };
  }, [ready, chartData.length]);

  return (
    <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">Perfil vertical</h3>
          <span className="text-[10px] text-slate-500">Arraste o ponto para altitude · o fundo para ampliar</span>
        </div>
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
          <button
            type="button"
            disabled={airspaces.length === 0}
            onClick={() => setShowAirspaces((v) => !v)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              showAirspaces
                ? "bg-violet-600 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            }`}
          >
            Espaços aéreos
          </button>
          {zoomed ? (
            <button
              type="button"
              onClick={() => setXZoom(null)}
              className="rounded-md bg-cyan-600 px-2 py-0.5 text-[11px] font-medium text-white"
            >
              Ver rota toda
            </button>
          ) : null}
        </div>
      </div>
      <div className="px-1 pt-1">
        {!ready ? (
          <p className="grid h-72 place-items-center text-[11px] text-slate-600">
            Defina origem e destino para ver o perfil
          </p>
        ) : chartData.length > 1 && (hasPlanned || terrain.length > 0) ? (
          <div ref={plotShellRef} className="relative h-52 w-full cursor-crosshair select-none overscroll-contain sm:h-80 lg:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 14, right: 12, left: 0, bottom: 4 }}
                onMouseDown={(state) => {
                  if (altDraggingRef.current || altitudeConfirm) return;
                  const width = plotShellRef.current?.clientWidth ?? 0;
                  const x = xNmFromChartState(state as ChartMouseState, visibleXDomain, width);
                  if (x == null) return;
                  dragStartXRef.current = x;
                  setDragRange([x, x]);
                }}
                onMouseMove={(state) => {
                  if (altDraggingRef.current || dragStartXRef.current == null) return;
                  const width = plotShellRef.current?.clientWidth ?? 0;
                  const x = xNmFromChartState(state as ChartMouseState, visibleXDomain, width);
                  if (x == null) return;
                  setDragRange([dragStartXRef.current, x]);
                }}
                onMouseUp={(state) => {
                  const width = plotShellRef.current?.clientWidth ?? 0;
                  finishDragZoom(xNmFromChartState(state as ChartMouseState, visibleXDomain, width));
                }}
                onDoubleClick={() => setXZoom(null)}
              >
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
                  domain={visibleXDomain}
                  allowDataOverflow
                  ticks={tickValues}
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
                  key={dragRange || airspaceHover || altitudeDrag || altitudeConfirm ? "paused" : "live"}
                  content={<ProfileTooltip />}
                  cursor={dragRange || airspaceHover || altitudeDrag || altitudeConfirm ? false : { stroke: "#64748b", strokeDasharray: "3 3" }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 20, pointerEvents: "none" }}
                  offset={12}
                  active={dragRange || airspaceHover || altitudeDrag || altitudeConfirm ? false : undefined}
                />
                {showAirspaces
                  ? visibleAirspaceBands.map((b) => (
                      <ReferenceArea
                        key={`airspace-${b.key}`}
                        x1={b.x0Nm}
                        x2={b.x1Nm}
                        y1={b.y1}
                        y2={b.y2}
                        stroke={b.color}
                        strokeOpacity={b.altitudeMiss ? 0.28 : 0.4}
                        strokeWidth={1}
                        strokeDasharray={b.altitudeMiss ? "4 3" : undefined}
                        fill={b.color}
                        fillOpacity={airspaceFillOpacity(b.type, b.altitudeMiss)}
                        ifOverflow="hidden"
                      />
                    ))
                  : null}
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
                  shape={(props: ScatterShapeProps) => (
                    <TriangleMarker
                      cx={props.cx}
                      cy={props.cy}
                      onPointerDown={
                        onWaypointAltitudeChange
                          ? (event) => {
                              const payload = props.payload as ChartRow | undefined;
                              if (payload?.xNm == null) return;
                              startAltitudeDrag(payload.xNm, event);
                            }
                          : undefined
                      }
                    />
                  )}
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
                {showAirspaces && visibleAirspaceBands.length > 0 ? (
                  <Customized
                    component={(chartProps: Record<string, unknown>) => (
                      <g>
                        <AirspaceLabelsOverlay chartProps={chartProps} bands={visibleAirspaceBands} />
                        <AirspaceBorderOverlay
                          chartProps={chartProps}
                          bands={visibleAirspaceBands}
                          hoveredKey={airspaceHover?.band.key ?? null}
                          onHover={(band, clientX, clientY) => {
                            if (!band) {
                              setAirspaceHover(null);
                              return;
                            }
                            const rect = plotShellRef.current?.getBoundingClientRect();
                            setAirspaceHover({
                              band,
                              x: rect ? clientX - rect.left : clientX,
                              y: rect ? clientY - rect.top : clientY,
                            });
                          }}
                        />
                      </g>
                    )}
                  />
                ) : null}
                {dragRange ? (
                  <ReferenceArea
                    x1={Math.min(dragRange[0], dragRange[1])}
                    x2={Math.max(dragRange[0], dragRange[1])}
                    y1={yDomain[0]}
                    y2={yDomain[1]}
                    stroke="rgba(125, 211, 252, 0.85)"
                    fill="rgba(14, 165, 233, 0.18)"
                    ifOverflow="hidden"
                  />
                ) : null}
                {altitudeDrag || altitudeConfirm ? (
                  <ReferenceLine
                    y={(altitudeDrag ?? altitudeConfirm)!.previewFt}
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: `${(altitudeDrag ?? altitudeConfirm)!.previewFt} ft`,
                      position: "insideTopRight",
                      fill: "#a5f3fc",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
            {showAirspaces && airspaceHover ? (
              <div
                className="pointer-events-none absolute z-30"
                style={{
                  left: Math.min(airspaceHover.x + 14, (plotShellRef.current?.clientWidth ?? 320) - 200),
                  top: Math.max(8, airspaceHover.y - 10),
                }}
              >
                <AirspaceHoverCard band={airspaceHover.band} />
              </div>
            ) : null}
            {altitudeConfirm ? (
              <AltitudeConfirmPopover
                edit={altitudeConfirm}
                plotWidth={plotShellRef.current?.clientWidth ?? 320}
                plotHeight={plotShellRef.current?.clientHeight ?? 240}
                plotLeft={plotShellRef.current?.getBoundingClientRect().left ?? 0}
                plotTop={plotShellRef.current?.getBoundingClientRect().top ?? 0}
                onCancel={() => setAltitudeConfirm(null)}
                onConfirm={() => {
                  onWaypointAltitudeChange?.(altitudeConfirm.index, altitudeConfirm.previewFt);
                  setAltitudeConfirm(null);
                }}
              />
            ) : null}
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
