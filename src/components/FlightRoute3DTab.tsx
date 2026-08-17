import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Route3dAircraftPose } from "../lib/route3d";
import { fetchFr24TrackPointsForFlight } from "../lib/attachFlightTelemetryFromFr24";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { summarizeFlight } from "../lib/flightStats";
import { getSavedFlight } from "../lib/flightsDb";
import type { ParseResult } from "../lib/parseGarminCsv";
import { colorForKey, labelForKey, type ChartRow } from "../lib/telemetryCharts";
import type { FlightPoint } from "../types/flight";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import CsvWorker from "../workers/csvWorker?worker";
import { FlightReviewClubGate } from "./FlightReviewClubGate";

const Route3DView = lazy(() => import("./Route3DView"));

const ROUTE_3D_CLASS = "rounded-none border-0";
const ROUTE_3D_CANVAS = "h-[min(78vh,760px)] min-h-[560px]";

const FlightRoute3DScene = memo(function FlightRoute3DScene({
  currentAircraftRef,
  chartsControl,
  totalDistanceNm,
  waypoints,
}: {
  currentAircraftRef: MutableRefObject<Route3dAircraftPose | null>;
  chartsControl?: { available: boolean; active: boolean; onToggle: () => void };
  totalDistanceNm: number;
  waypoints: FlightPlanWaypoint[];
}) {
  return (
    <Suspense
      fallback={
        <section className="grid h-[min(78vh,760px)] min-h-[560px] place-items-center bg-slate-950 text-[11px] text-slate-500">
          Carregando vista 3D...
        </section>
      }
    >
      <Route3DView
        waypoints={waypoints}
        totalDistanceNm={totalDistanceNm}
        markerMode="endpoints"
        currentAircraftRef={currentAircraftRef}
        className={ROUTE_3D_CLASS}
        canvasClassName={ROUTE_3D_CANVAS}
        navigationOptimized
        liteTerrain
        autoLoadAreaLayers
        defaultVisibleAirspaceTypes={["CTR", "ATZ"]}
        areaLayerKinds={["rea"]}
        chartsControl={chartsControl}
        enableWeatherLayers={false}
      />
    </Suspense>
  );
});

type Props = {
  flightId?: string;
  parsedResult?: ParseResult | null;
  sourceName?: string | null;
  publicMode?: boolean;
  clubLocked?: boolean;
};

type RouteSource = "aircraft" | "fr24" | "none";

const MAX_ROUTE_POINTS = 240;
const MAX_CHART_ROWS = 360;

function isValidRoutePoint(point: FlightPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180 &&
    !(point.lat === 0 && point.lon === 0)
  );
}

function sourceFromName(name: string | null | undefined): RouteSource {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw) return "aircraft";
  return raw.startsWith("fr24-") || raw.includes("flightradar") ? "fr24" : "aircraft";
}

function downsampleRows(rows: ChartRow[], maxRows = MAX_CHART_ROWS): ChartRow[] {
  if (rows.length <= maxRows) return rows;
  const step = Math.ceil(rows.length / maxRows);
  const sampled = rows.filter((_, index) => index % step === 0);
  const last = rows[rows.length - 1];
  if (last && sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function slimParsedRoute(parsed: ParseResult): {
  points: FlightPoint[];
  chartData: ChartRow[];
  telemetryColumns: Record<string, string>;
} {
  return {
    points: compactPoints(parsed.points),
    chartData: downsampleRows(parsed.chartData),
    telemetryColumns: parsed.telemetryColumns,
  };
}

function parseCsvInWorker(csv: string): { promise: Promise<ParseResult>; terminate: () => void } {
  const worker = new CsvWorker();
  const promise = new Promise<ParseResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: ParseResult; error?: string }>) => {
      worker.terminate();
      if (!event.data.ok || !event.data.result) {
        reject(new Error(event.data.error ?? "Erro ao processar CSV."));
        return;
      }
      resolve(event.data.result);
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };
    worker.postMessage({ csv, slim: true, maxPoints: MAX_ROUTE_POINTS, maxChartRows: MAX_CHART_ROWS });
  });
  return {
    promise,
    terminate: () => worker.terminate(),
  };
}

function compactPoints(points: FlightPoint[], maxPoints = MAX_ROUTE_POINTS): FlightPoint[] {
  const clean = points.filter(isValidRoutePoint);
  if (clean.length <= maxPoints) return clean;
  const step = Math.ceil(clean.length / maxPoints);
  const sampled = clean.filter((_, index) => index % step === 0);
  const last = clean[clean.length - 1]!;
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function bearingDeg(a: FlightPoint, b: FlightPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function aircraftPoseFromPoints(
  activePoint: FlightPoint | null,
  nextPoint: FlightPoint | null,
  prevPoint: FlightPoint | null,
): Route3dAircraftPose | null {
  if (!activePoint) return null;
  const headingDeg =
    activePoint.headingDeg != null && Number.isFinite(activePoint.headingDeg)
      ? activePoint.headingDeg
      : nextPoint && nextPoint !== activePoint
        ? bearingDeg(activePoint, nextPoint)
        : prevPoint && prevPoint !== activePoint
          ? bearingDeg(prevPoint, activePoint)
          : null;
  return {
    lat: activePoint.lat,
    lng: activePoint.lon,
    altitudeFt: activePoint.altM != null ? activePoint.altM / 0.3048 : 0,
    headingDeg,
  };
}

function formatTimelineTime(point: FlightPoint | null): string {
  if (!point?.t) return "--:--";
  try {
    return new Date(point.t).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function waypointLabel(point: FlightPoint, index: number, total: number): string {
  if (index === 0) return "Inicio";
  if (index === total - 1) return "Fim";
  if (point.t != null) {
    try {
      return new Date(point.t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return `P${index + 1}`;
    }
  }
  return `P${index + 1}`;
}

function pointsToWaypoints(points: FlightPoint[]): FlightPlanWaypoint[] {
  return points.map((point, index) => ({
    raw: waypointLabel(point, index, points.length),
    label: waypointLabel(point, index, points.length),
    lat: point.lat,
    lng: point.lon,
    kind: index === 0 ? "origin" : index === points.length - 1 ? "destination" : "fix",
    altitudeFt: point.altM != null && Number.isFinite(point.altM) ? point.altM / 0.3048 : 0,
  }));
}

function routeSourceLabel(source: RouteSource): string {
  if (source === "fr24") return "Flightradar24";
  if (source === "aircraft") return "Aeronave";
  return "Sem fonte";
}

export function FlightRoute3DTab({
  flightId,
  parsedResult,
  sourceName,
  publicMode = false,
  clubLocked = false,
}: Props) {
  const [points, setPoints] = useState<FlightPoint[]>(() => compactPoints(parsedResult?.points ?? []));
  const [chartData, setChartData] = useState<ChartRow[]>(() => downsampleRows(parsedResult?.chartData ?? []));
  const [telemetryColumns, setTelemetryColumns] = useState<Record<string, string>>(
    () => parsedResult?.telemetryColumns ?? {},
  );
  const [source, setSource] = useState<RouteSource>(() =>
    parsedResult?.points.length ? sourceFromName(sourceName) : "none",
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCharts, setShowCharts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parsedResult) return;
    const slim = slimParsedRoute(parsedResult);
    setPoints(slim.points);
    setChartData(slim.chartData);
    setTelemetryColumns(slim.telemetryColumns);
    setSource(slim.points.length >= 2 ? sourceFromName(sourceName) : "none");
    setCurrentIndex(0);
    setError(null);
  }, [parsedResult, sourceName]);

  useEffect(() => {
    if (clubLocked || parsedResult || !flightId || publicMode) return;
    let cancelled = false;
    let workerTerminate: (() => void) | null = null;
    setLoading(true);
    setError(null);

    void (async () => {
      const saved = await getSavedFlight(flightId);
      if (cancelled) return;
      if (saved.error || !saved.data) {
        throw saved.error ?? new Error("Voo nao encontrado.");
      }

      const decoded = decodeFlightRecord(saved.data.csv_text);
      const telemetryText = decoded.meta ? decoded.telemetryCsv : saved.data.csv_text;
      if (telemetryText.trim()) {
        const job = parseCsvInWorker(telemetryText);
        workerTerminate = job.terminate;
        const parsed = await job.promise;
        if (cancelled) return;
        const slim = slimParsedRoute(parsed);
        const firstSource = decoded.telemetryFiles?.[0]?.name ?? saved.data.source_filename;
        setPoints(slim.points);
        setChartData(slim.chartData);
        setTelemetryColumns(slim.telemetryColumns);
        setSource(slim.points.length >= 2 ? sourceFromName(firstSource) : "none");
        setCurrentIndex(0);
        return;
      }

      if (publicMode) {
        setPoints([]);
        setSource("none");
        return;
      }

      const fr24 = await fetchFr24TrackPointsForFlight(flightId);
      if (!fr24.ok) throw fr24.error;
      if (cancelled) return;
      setPoints(compactPoints(fr24.points));
      setChartData([]);
      setTelemetryColumns({});
      setSource("fr24");
      setCurrentIndex(0);
    })()
      .catch((err) => {
        if (!cancelled) {
          setPoints([]);
          setSource("none");
          setError((err as Error).message || "Nao foi possivel carregar a rota 3D.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      workerTerminate?.();
    };
  }, [clubLocked, flightId, parsedResult, publicMode]);

  const routePoints = useMemo(() => compactPoints(points), [points]);
  const waypoints = useMemo(() => pointsToWaypoints(routePoints), [routePoints]);
  const summary = useMemo(() => summarizeFlight(points.filter(isValidRoutePoint)), [points]);
  const totalDistanceNm = summary.distanceM / 1852;
  const cleanPoints = useMemo(() => points.filter(isValidRoutePoint), [points]);
  const safeIndex = Math.min(currentIndex, Math.max(0, cleanPoints.length - 1));
  const activePoint = cleanPoints[safeIndex] ?? null;
  const nextPoint = cleanPoints[Math.min(safeIndex + 1, Math.max(0, cleanPoints.length - 1))] ?? null;
  const prevPoint = cleanPoints[Math.max(0, safeIndex - 1)] ?? null;
  const firstTimeMs = cleanPoints.find((point) => point.t != null)?.t ?? null;
  const lastTimeMs = [...cleanPoints].reverse().find((point) => point.t != null)?.t ?? null;
  const hasTimelineTime = firstTimeMs != null && lastTimeMs != null && lastTimeMs > firstTimeMs;
  const activeElapsedMs = hasTimelineTime && activePoint?.t != null ? activePoint.t - firstTimeMs : 0;
  const totalElapsedMs = hasTimelineTime ? lastTimeMs - firstTimeMs : 0;
  const currentAircraftRef = useRef<Route3dAircraftPose | null>(null);
  const cleanPointsRef = useRef(cleanPoints);
  cleanPointsRef.current = cleanPoints;
  currentAircraftRef.current = aircraftPoseFromPoints(activePoint, nextPoint, prevPoint);

  const seekTimeline = (index: number) => {
    const pts = cleanPointsRef.current;
    const nextIndex = Math.min(Math.max(0, index), Math.max(0, pts.length - 1));
    const active = pts[nextIndex] ?? null;
    const next = pts[Math.min(nextIndex + 1, Math.max(0, pts.length - 1))] ?? null;
    const prev = pts[Math.max(0, nextIndex - 1)] ?? null;
    currentAircraftRef.current = aircraftPoseFromPoints(active, next, prev);
    setCurrentIndex(nextIndex);
  };
  const seekTimelineElapsedSec = (elapsedSec: number) => {
    if (!hasTimelineTime || firstTimeMs == null) {
      seekTimeline(elapsedSec);
      return;
    }
    const target = firstTimeMs + elapsedSec * 1000;
    const pts = cleanPointsRef.current;
    let bestIndex = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const t = pts[i]?.t;
      if (t == null) continue;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
      if (t > target && diff > bestDiff) break;
    }
    seekTimeline(bestIndex);
  };
  const availableChartKeys = useMemo(() => {
    const resolved = Object.keys(telemetryColumns);
    const keys = resolved.length
      ? resolved
      : Object.keys(chartData[0] ?? {}).filter((key) => key !== "x");
    return keys.filter((key) =>
      chartData.some((row) => {
        const value = row[key];
        return value != null && Number.isFinite(value);
      }),
    );
  }, [chartData, telemetryColumns]);
  const [chartKeyA, setChartKeyA] = useState("gpsAltFt");
  const [chartKeyB, setChartKeyB] = useState("gsKt");

  useEffect(() => {
    if (!availableChartKeys.length) return;
    setChartKeyA((current) => (availableChartKeys.includes(current) ? current : availableChartKeys[0]!));
    setChartKeyB((current) => {
      if (availableChartKeys.includes(current)) return current;
      return availableChartKeys.find((key) => key !== availableChartKeys[0]) ?? availableChartKeys[0]!;
    });
  }, [availableChartKeys]);

  if (clubLocked) return <FlightReviewClubGate feature="rota-3d" />;

  if (loading) {
    return (
      <section className="grid min-h-[24rem] place-items-center rounded-xl border border-slate-800 bg-slate-950/60 text-sm text-slate-400">
        Carregando rota 3D...
      </section>
    );
  }

  if (error || waypoints.length < 2 || totalDistanceNm <= 0) {
    return (
      <section className="grid min-h-[24rem] place-items-center rounded-xl border border-slate-800 bg-slate-950/60 px-6 text-center">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Rota 3D indisponivel</h3>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            {error || "Este voo ainda nao tem pontos GPS suficientes na telemetria."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Rota 3D</p>
          <p className="text-sm text-slate-400">
            Fonte: {routeSourceLabel(source)} | {points.length.toLocaleString("pt-BR")} pontos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-xs font-semibold text-slate-300">
            {totalDistanceNm.toFixed(1)} NM
          </span>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
        <FlightRoute3DScene
          waypoints={waypoints}
          totalDistanceNm={totalDistanceNm}
          currentAircraftRef={currentAircraftRef}
          chartsControl={
            availableChartKeys.length > 0
              ? {
                  available: true,
                  active: showCharts,
                  onToggle: () => setShowCharts((value) => !value),
                }
              : undefined
          }
        />
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-20 space-y-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {showCharts && availableChartKeys.length > 0 ? (
            <TelemetryChartOverlay
              chartData={chartData}
              chartKeyA={chartKeyA}
              chartKeyB={chartKeyB}
              currentIndex={safeIndex}
              pointCount={cleanPoints.length}
              onChartKeyA={setChartKeyA}
              onChartKeyB={setChartKeyB}
              availableKeys={availableChartKeys}
              onSeekRatio={(ratio) => {
                const max = Math.max(0, cleanPoints.length - 1);
                seekTimeline(Math.round(ratio * max));
              }}
            />
          ) : null}
          <div className="pointer-events-auto rounded-xl border border-slate-700/70 bg-slate-950/75 px-3 py-2 shadow-2xl backdrop-blur">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-300">
              <span className="font-semibold text-slate-100">{formatTimelineTime(activePoint)}</span>
              <span>
                {hasTimelineTime
                  ? `${formatElapsed(activeElapsedMs)} / ${formatElapsed(totalElapsedMs)}`
                  : `${safeIndex + 1}/${cleanPoints.length}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={hasTimelineTime ? Math.max(0, Math.round(totalElapsedMs / 1000)) : Math.max(0, cleanPoints.length - 1)}
              step={1}
              value={hasTimelineTime ? Math.round(activeElapsedMs / 1000) : safeIndex}
              onChange={(event) =>
                hasTimelineTime
                  ? seekTimelineElapsedSec(Number(event.target.value))
                  : seekTimeline(Number(event.target.value))
              }
              className="h-2 w-full accent-sky-400"
              aria-label="Timeline da rota 3D"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TelemetryChartOverlay({
  availableKeys,
  chartData,
  chartKeyA,
  chartKeyB,
  currentIndex,
  pointCount,
  onChartKeyA,
  onChartKeyB,
  onSeekRatio,
}: {
  availableKeys: string[];
  chartData: ChartRow[];
  chartKeyA: string;
  chartKeyB: string;
  currentIndex: number;
  pointCount: number;
  onChartKeyA: (key: string) => void;
  onChartKeyB: (key: string) => void;
  onSeekRatio: (ratio: number) => void;
}) {
  const rows = chartData.length ? chartData : [];
  const cursorRatio = pointCount > 1 ? currentIndex / (pointCount - 1) : 0;
  return (
    <div className="pointer-events-auto rounded-xl border border-slate-700/70 bg-slate-950/65 p-2 shadow-2xl backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ChartSelect value={chartKeyA} keys={availableKeys} onChange={onChartKeyA} />
        <ChartSelect value={chartKeyB} keys={availableKeys} onChange={onChartKeyB} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <MiniTelemetryChart rows={rows} chartKey={chartKeyA} cursorRatio={cursorRatio} onSeekRatio={onSeekRatio} />
        <MiniTelemetryChart rows={rows} chartKey={chartKeyB} cursorRatio={cursorRatio} onSeekRatio={onSeekRatio} />
      </div>
    </div>
  );
}

function ChartSelect({
  keys,
  onChange,
  value,
}: {
  keys: string[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-200 outline-none focus:border-sky-400"
    >
      {keys.map((key) => (
        <option key={key} value={key}>
          {labelForKey(key)}
        </option>
      ))}
    </select>
  );
}

function MiniTelemetryChart({
  cursorRatio,
  chartKey,
  rows,
  onSeekRatio,
}: {
  cursorRatio: number;
  chartKey: string;
  rows: ChartRow[];
  onSeekRatio: (ratio: number) => void;
}) {
  const width = 420;
  const height = 110;
  const pad = 8;
  const samples = useMemo(() => {
    const clean = rows
      .map((row, index) => ({ index, value: row[chartKey] }))
      .filter((row): row is { index: number; value: number } => row.value != null && Number.isFinite(row.value));
    if (clean.length <= 180) return clean;
    const step = Math.ceil(clean.length / 180);
    return clean.filter((_, index) => index % step === 0);
  }, [chartKey, rows]);
  if (samples.length < 2) {
    return (
      <div className="grid h-[110px] place-items-center rounded-lg border border-slate-800 bg-slate-950/40 text-xs text-slate-500">
        Sem dados para {labelForKey(chartKey)}
      </div>
    );
  }
  let min = samples[0]!.value;
  let max = samples[0]!.value;
  for (const sample of samples) {
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;
  }
  const span = max - min || 1;
  const maxIndex = Math.max(1, rows.length - 1);
  const d = samples
    .map((sample, index) => {
      const x = pad + (sample.index / maxIndex) * (width - pad * 2);
      const y = height - pad - ((sample.value - min) / span) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const cursorX = pad + Math.max(0, Math.min(1, cursorRatio)) * (width - pad * 2);
  const seekFromClient = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    const ratio = (x - pad) / Math.max(1, width - pad * 2);
    onSeekRatio(Math.max(0, Math.min(1, ratio)));
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-200">{labelForKey(chartKey)}</span>
        <span className="text-slate-500">
          {min.toFixed(0)} - {max.toFixed(0)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[110px] w-full cursor-crosshair overflow-visible"
        onPointerDown={(event) => {
          event.preventDefault();
          seekFromClient(event.clientX, event.currentTarget);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          seekFromClient(event.clientX, event.currentTarget);
        }}
      >
        <path d={d} fill="none" stroke={colorForKey(chartKey)} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={cursorX} x2={cursorX} y1={pad} y2={height - pad} stroke="#f8fafc" strokeOpacity="0.75" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
