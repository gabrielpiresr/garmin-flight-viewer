import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSavedFlight } from "../lib/flightsDb";
import { Skeleton } from "./ui/Skeleton";
import {
  chartDurationSec,
  formatAltFt,
  formatDistM,
  formatDuration,
  formatSpeedKt,
  summarizeFlight,
} from "../lib/flightStats";
import { detectFlightSegments } from "../lib/flightSegments";
import type { ParseResult } from "../lib/parseGarminCsv";
import type { ChartRow } from "../lib/telemetryCharts";
import type { FlightPoint } from "../types/flight";
import CsvWorker from "../workers/csvWorker?worker";
import { FlightCharts } from "./FlightCharts";
import { FlightMap } from "./FlightMap";
import { SegmentSelector } from "./SegmentSelector";
import { SegmentSummary } from "./SegmentSummary";

type Props = {
  flightId?: string;
  parsedResult?: ParseResult;
};

/** Binary search: finds GPS point closest to targetT (ms epoch). O(log n). */
function findHoverPos(
  points: FlightPoint[],
  chartTimeBaseMs: number,
  x: number,
): [number, number] | null {
  if (points.length === 0) return null;
  const targetT = chartTimeBaseMs + x;
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
  for (const p of [points[lo - 1], points[lo]]) {
    if (!p || p.t == null) continue;
    const diff = Math.abs(p.t - targetT);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best ? [best.lat, best.lon] : null;
}

export function TelemetriaTab({ flightId, parsedResult }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [points, setPoints] = useState<FlightPoint[]>([]);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [hasChartTime, setHasChartTime] = useState(false);
  const [chartTimeBaseMs, setChartTimeBaseMs] = useState<number | null>(null);
  const [telemetryColumns, setTelemetryColumns] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [chartDomain, setChartDomain] = useState<[number, number] | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Imperative hover bridge — no React state involved during hover
  const hoverCallbackRef = useRef<((pos: [number, number] | null) => void) | null>(null);
  const boundsCallbackRef = useRef<((b: L.LatLngBounds) => void) | null>(null);
  // Stable refs so callbacks never need to change (empty useCallback deps)
  const pointsRef = useRef<FlightPoint[]>(points);
  const chartTimeBaseMsRef = useRef<number | null>(chartTimeBaseMs);
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { chartTimeBaseMsRef.current = chartTimeBaseMs; }, [chartTimeBaseMs]);

  /** Called on map moveend/zoomend — updates the chart domain to match visible route. */
  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    const pts = pointsRef.current;
    const base = chartTimeBaseMsRef.current;
    if (base === null || pts.length === 0) { setChartDomain(null); return; }

    const visibleTs: number[] = [];
    for (const p of pts) {
      if (p.t !== null && bounds.contains([p.lat, p.lon])) visibleTs.push(p.t);
    }

    if (visibleTs.length < 2) { setChartDomain(null); return; }

    const allTs = pts.map((p) => p.t).filter((t): t is number => t !== null);
    const totalMin = Math.min(...allTs);
    const totalMax = Math.max(...allTs);
    const visMin = Math.min(...visibleTs);
    const visMax = Math.max(...visibleTs);

    // If nearly the entire route is visible, reset to full view
    const coverage = (visMax - visMin) / (totalMax - totalMin || 1);
    if (coverage > 0.97) { setChartDomain(null); return; }

    setChartDomain([visMin - base, visMax - base]);
  }, []);

  // Wire the bounds callback ref so FlightMap can call it without re-rendering
  useEffect(() => { boundsCallbackRef.current = handleBoundsChange; }, [handleBoundsChange]);

  /** Called by synchronized charts on tooltip move. Zero React re-renders — purely imperative. */
  const handleHoverX = useCallback((x: number | null) => {
    if (!hoverCallbackRef.current) return;
    if (x === null || chartTimeBaseMsRef.current === null) {
      hoverCallbackRef.current(null);
      return;
    }
    const pos = findHoverPos(pointsRef.current, chartTimeBaseMsRef.current, x);
    hoverCallbackRef.current(pos);
  }, []); // stable — no deps needed, uses refs

  const applyResult = useCallback((r: ParseResult, name: string) => {
    setFileName(name);
    setPoints(r.points);
    setChartData(r.chartData);
    setHasChartTime(r.hasChartTime);
    setChartTimeBaseMs(r.chartTimeBaseMs);
    setTelemetryColumns(r.telemetryColumns);
    setWarnings(r.warnings);
  }, []);

  useEffect(() => {
    if (!parsedResult) return;
    applyResult(parsedResult, "voo importado");
  }, [parsedResult, applyResult]);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  useEffect(() => {
    if (!flightId) return;
    workerRef.current?.terminate();
    setLoading(true);
    setLoadError(null);

    void getSavedFlight(flightId).then(({ data, error }) => {
      if (error || !data) {
        setLoading(false);
        setLoadError(error?.message ?? "Voo não encontrado.");
        return;
      }
      const worker = new CsvWorker();
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParseResult; error?: string }>) => {
        worker.terminate();
        workerRef.current = null;
        setLoading(false);
        if (!e.data.ok || !e.data.result) {
          setLoadError(e.data.error ?? "Erro ao processar CSV.");
          return;
        }
        applyResult(e.data.result, data.source_filename);
      };
      worker.onerror = (err) => {
        worker.terminate();
        workerRef.current = null;
        setLoading(false);
        setLoadError(err.message);
      };
      worker.postMessage(data.csv_text);
    });
  }, [flightId, applyResult]);

  const segments = useMemo(
    () => chartData.length > 0 && hasChartTime
      ? detectFlightSegments(chartData, chartTimeBaseMs, points)
      : [],
    [chartData, hasChartTime, chartTimeBaseMs, points],
  );

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId],
  );

  const selectedRangeT = useMemo<[number, number] | null>(() => {
    if (!selectedSegment || chartTimeBaseMs == null) return null;
    return [chartTimeBaseMs + selectedSegment.startX, chartTimeBaseMs + selectedSegment.endX];
  }, [selectedSegment, chartTimeBaseMs]);

  const selectedXDomain = useMemo<[number, number] | null>(
    () => selectedSegment ? [selectedSegment.startX, selectedSegment.endX] : null,
    [selectedSegment],
  );

  const activeChartXDomain = useMemo<[number, number] | null>(
    () => selectedXDomain ?? chartDomain,
    [selectedXDomain, chartDomain],
  );

  const focusDomain = useMemo<[number, number] | null>(
    () => selectedSegment ? null : chartDomain,
    [selectedSegment, chartDomain],
  );

  const summary = useMemo(() => summarizeFlight(points), [points]);
  const durationDisplay = useMemo(() => {
    const fromChart = chartDurationSec(chartData, hasChartTime);
    if (fromChart !== null) return formatDuration(fromChart);
    return formatDuration(summary.durationSec);
  }, [chartData, hasChartTime, summary.durationSec]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-4 w-48" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-28 rounded-lg" />
            ))}
          </div>
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">
        {loadError}
      </p>
    );
  }

  if (!fileName) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Nenhum arquivo carregado.
      </p>
    );
  }

  return (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-medium text-slate-300 [overflow-wrap:anywhere]">Arquivo: {fileName}</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatInline label="Distância" value={summary.pointCount >= 2 ? formatDistM(summary.distanceM) : "—"} />
          <StatInline label="Duração" value={durationDisplay} />
          <StatInline
            label="Alt máx/mín"
            value={summary.pointCount > 0 ? `${formatAltFt(summary.altMaxM)} / ${formatAltFt(summary.altMinM)}` : "—"}
          />
          <StatInline
            label="Vel média/máx"
            value={summary.pointCount > 0 ? `${formatSpeedKt(summary.speedAvgMs)} / ${formatSpeedKt(summary.speedMaxMs)}` : "—"}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="list-inside list-disc rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {segments.length > 0 && (
        <SegmentSelector
          segments={segments}
          selectedId={selectedSegmentId}
          onChange={setSelectedSegmentId}
        />
      )}

      {(points.length > 0 || chartData.length > 0) && (
        <div className="h-[calc(100vh-1.5rem)] min-h-[520px] md:min-h-[700px]">
          <div className={`grid h-full min-h-0 gap-2 ${selectedSegment ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-1"}`}>
            {selectedSegment && (
              <div className="min-h-0 overflow-y-auto">
                <SegmentSummary segment={selectedSegment} />
              </div>
            )}

            <div className="grid h-full min-h-0 min-w-0 grid-rows-2 gap-2">
              {points.length >= 2 ? (
                <FlightMap
                  points={points}
                  selectedRangeT={selectedRangeT}
                  className="h-full min-h-0 w-full overflow-hidden rounded-xl border border-slate-700"
                  hoverCallbackRef={hoverCallbackRef}
                  boundsCallbackRef={boundsCallbackRef}
                />
              ) : (
                <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Trajeto no mapa indisponível — não há pelo menos dois pontos GPS válidos.
                </p>
              )}

              <div className="min-h-0 min-w-0">
                <FlightCharts
                  chartData={chartData}
                  hasTime={hasChartTime}
                  chartTimeBaseMs={chartTimeBaseMs}
                  resolved={telemetryColumns}
                  onHoverX={handleHoverX}
                  xDomain={activeChartXDomain}
                  focusDomain={focusDomain}
                  events={selectedSegment?.events}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700/80 bg-slate-900/40 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xs font-semibold text-slate-100">{value}</p>
    </div>
  );
}
