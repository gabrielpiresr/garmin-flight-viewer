import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { decodeFlightRecord, encodeFlightRecord, type FlightRecordTelemetryFile } from "../lib/flightRecordCodec";
import { listFlightTelemetryAlerts, type FlightTelemetryAlertDoc } from "../lib/flightTelemetryAlertsDb";
import { getSavedFlight, updateFlight } from "../lib/flightsDb";
import { Skeleton } from "./ui/Skeleton";
import {
  TelemetryProcessingOverlay,
  TelemetryProcessingProgress,
} from "./ui/TelemetryProcessingProgress";
import {
  chartDurationSec,
  formatAltFt,
  formatDuration,
  formatSpeedKt,
  summarizeFlight,
} from "../lib/flightStats";
import { detectFlightSegments } from "../lib/flightSegments";
import { buildFlightTelemetryMetrics, deriveIdentity } from "../lib/flightTelemetryMetrics";
import { parseGarminCsv, type ParseResult } from "../lib/parseGarminCsv";
import {
  MAX_TELEMETRY_CSV_FILES,
  mergeTelemetryCsvFiles,
  type TelemetryCsvFileMeta,
  type TelemetryCsvGap,
} from "../lib/telemetryCsvMerge";
import { propertyLabel, propertyUnit, type TelemetryAlertProperty } from "../lib/telemetryAlerts";
import type { ChartRow } from "../lib/telemetryCharts";
import type { FlightPoint, FlightSegment, FlightSummary } from "../types/flight";
import CsvWorker from "../workers/csvWorker?worker";
import { FlightCharts } from "./FlightCharts";
import { FlightMap } from "./FlightMap";
import { SegmentSelector } from "./SegmentSelector";
import { SegmentSummary } from "./SegmentSummary";
import { useToast } from "./ui/ToastProvider";

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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [telemetryCharCount, setTelemetryCharCount] = useState(0);
  const [telemetrySources, setTelemetrySources] = useState<FlightRecordTelemetryFile[]>([]);
  const [telemetryFileMetas, setTelemetryFileMetas] = useState<TelemetryCsvFileMeta[]>([]);
  const [telemetryGapSec, setTelemetryGapSec] = useState<number | null>(null);
  const [telemetryGaps, setTelemetryGaps] = useState<TelemetryCsvGap[]>([]);
  const [telemetryDirty, setTelemetryDirty] = useState(false);
  const [points, setPoints] = useState<FlightPoint[]>([]);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [hasChartTime, setHasChartTime] = useState(false);
  const [chartTimeBaseMs, setChartTimeBaseMs] = useState<number | null>(null);
  const [telemetryColumns, setTelemetryColumns] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingTelemetry, setSavingTelemetry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flightAlerts, setFlightAlerts] = useState<FlightTelemetryAlertDoc[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const [chartDomain, setChartDomain] = useState<[number, number] | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Imperative hover bridge — no React state involved during hover
  const hoverCallbackRef = useRef<((pos: [number, number] | null) => void) | null>(null);
  const boundsCallbackRef = useRef<((b: L.LatLngBounds) => void) | null>(null);
  // Stable refs so callbacks never need to change (empty useCallback deps)
  const pointsRef = useRef<FlightPoint[]>(points);
  const chartTimeBaseMsRef = useRef<number | null>(chartTimeBaseMs);
  const selectedSegmentIdRef = useRef<string | null>(selectedSegmentId);
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { chartTimeBaseMsRef.current = chartTimeBaseMs; }, [chartTimeBaseMs]);
  useEffect(() => { selectedSegmentIdRef.current = selectedSegmentId; }, [selectedSegmentId]);

  const canEditTelemetry = user?.role === "instrutor" || user?.role === "admin";

  const loadFlightAlerts = useCallback(async () => {
    if (!flightId) {
      setFlightAlerts([]);
      return;
    }
    setAlertsLoading(true);
    const result = await listFlightTelemetryAlerts(flightId);
    setAlertsLoading(false);
    if (result.error) {
      showToast({ variant: "error", message: result.error.message });
      return;
    }
    setFlightAlerts(result.data);
  }, [flightId, showToast]);

  useEffect(() => {
    void loadFlightAlerts();
  }, [loadFlightAlerts]);

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

    const coverage = (visMax - visMin) / (totalMax - totalMin || 1);
    if (coverage > 0.75 && selectedSegmentIdRef.current) {
      setSelectedSegmentId(null);
      setChartDomain(null);
      return;
    }
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

  const applyResult = useCallback((r: ParseResult, name: string, charCount?: number) => {
    setFileName(name);
    if (typeof charCount === "number") setTelemetryCharCount(charCount);
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
    setTelemetrySources([]);
    setTelemetryFileMetas([]);
    setTelemetryGapSec(null);
    setTelemetryGaps([]);
    setTelemetryDirty(false);
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
      const decoded = decodeFlightRecord(data.csv_text);
      const telemetryText = decoded.meta ? decoded.telemetryCsv : data.csv_text;
      if (!telemetryText.trim()) {
        setLoading(false);
        setFileName(null);
        setTelemetryCharCount(0);
        setTelemetrySources([]);
        setTelemetryFileMetas([]);
        setTelemetryGapSec(null);
        setTelemetryGaps([]);
        setTelemetryDirty(false);
        setPoints([]);
        setChartData([]);
        setWarnings([]);
        return;
      }
      const loadedSources =
        decoded.telemetryFiles && decoded.telemetryFiles.length > 0
          ? decoded.telemetryFiles
          : [{ name: data.source_filename || "telemetria.csv", text: telemetryText }];
      let loadedFileMetas = decoded.telemetryFileMetadata ?? [];
      let loadedGapSec = decoded.telemetryGapSec ?? null;
      let loadedGaps = decoded.telemetryGaps ?? [];
      if (loadedFileMetas.length === 0 && loadedSources.length > 0) {
        try {
          const merged = mergeTelemetryCsvFiles(loadedSources);
          loadedFileMetas = merged.files;
          loadedGapSec = merged.totalGapSec;
          loadedGaps = merged.gaps;
        } catch {
          loadedFileMetas = [];
          loadedGapSec = null;
          loadedGaps = [];
        }
      }
      setTelemetrySources(loadedSources);
      setTelemetryFileMetas(loadedFileMetas);
      setTelemetryGapSec(loadedGapSec);
      setTelemetryGaps(loadedGaps);
      setTelemetryDirty(false);
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
        applyResult(e.data.result, data.source_filename, telemetryText.length);
      };
      worker.onerror = (err) => {
        worker.terminate();
        workerRef.current = null;
        setLoading(false);
        setLoadError(err.message);
      };
      worker.postMessage(telemetryText);
    });
  }, [flightId, applyResult]);

  const handleTelemetryFilesSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !flightId || !user || !canEditTelemetry) return;
    if (telemetrySources.length + files.length > MAX_TELEMETRY_CSV_FILES) {
      showToast({ variant: "error", message: `Selecione no máximo ${MAX_TELEMETRY_CSV_FILES} CSVs por voo.` });
      return;
    }

    setLoadError(null);
    try {
      const nextSources = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          text: await file.text(),
        })),
      );
      setTelemetrySources((current) => [...current, ...nextSources]);
      setTelemetryDirty(true);
      showToast({ variant: "success", message: "CSV adicionado. Clique em Processar telemetria para validar." });
    } catch (err) {
      showToast({ variant: "error", message: (err as Error).message || "Falha ao ler CSV de telemetria." });
    }
  };

  const removeTelemetrySource = (index: number) => {
    setTelemetrySources((current) => current.filter((_, i) => i !== index));
    setTelemetryDirty(true);
  };

  const handleProcessTelemetry = async () => {
    if (!flightId || !user || !canEditTelemetry) return;
    if (telemetrySources.length === 0) {
      showToast({ variant: "error", message: "Selecione pelo menos um CSV para processar." });
      return;
    }

    setSavingTelemetry(true);
    setLoadError(null);
    try {
      const saved = await getSavedFlight(flightId);
      if (saved.error || !saved.data) throw saved.error ?? new Error("Voo não encontrado.");

      const decoded = decodeFlightRecord(saved.data.csv_text);
      if (!decoded.meta) throw new Error("Ficha do voo sem metadados para anexar telemetria.");

      const merged = mergeTelemetryCsvFiles(telemetrySources);
      if (!merged.csv.trim()) throw new Error("Nenhum CSV de telemetria selecionado.");

      const parsed = parseGarminCsv(merged.csv);
      const parsedSummary = summarizeFlight(parsed.points);
      const durationSec = chartDurationSec(parsed.chartData, parsed.hasChartTime) ?? parsedSummary.durationSec;
      const csvText = encodeFlightRecord({
        meta: decoded.meta,
        telemetryCsv: merged.csv,
        telemetryFiles: telemetrySources,
      });
      const identity = deriveIdentity({
        meta: decoded.meta,
        studentUserId: saved.data.student_user_id ?? decoded.meta.header.studentUserId,
        instructorUserId: saved.data.instructor_user_id ?? decoded.meta.header.instructorUserId ?? null,
        aircraftIdent: saved.data.aircraft_ident ?? decoded.meta.header.aircraft ?? null,
      });
      const telemetryMetrics = buildFlightTelemetryMetrics({ parsed, identity, meta: decoded.meta });
      const result = await updateFlight(flightId, {
        actorUserId: user.id,
        actorRole: user.role,
        studentUserId: saved.data.student_user_id ?? decoded.meta.header.studentUserId,
        instructorUserId: saved.data.instructor_user_id ?? decoded.meta.header.instructorUserId ?? null,
        source_filename: merged.sourceFileName,
        csv_text: csvText,
        aircraft_ident: saved.data.aircraft_ident ?? decoded.meta.header.aircraft ?? null,
        duration_sec: durationSec,
        telemetryMetrics,
        telemetryAlertParsed: parsed,
      });

      if (result.error) throw result.error;

      applyResult(parsed, merged.sourceFileName, merged.csv.length);
      setTelemetryFileMetas(merged.files);
      setTelemetryGapSec(merged.totalGapSec);
      setTelemetryGaps(merged.gaps);
      setTelemetryDirty(false);
      await loadFlightAlerts();
      showToast({ variant: "success", message: "Telemetria processada." });
    } catch (err) {
      showToast({ variant: "error", message: (err as Error).message || "Falha ao processar telemetria." });
    } finally {
      setSavingTelemetry(false);
    }
  };

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

  const fullXDomain = useMemo<[number, number] | null>(() => {
    if (chartData.length < 2) return null;
    return [chartData[0]!.x, chartData[chartData.length - 1]!.x];
  }, [chartData]);

  const selectedRangeT = useMemo<[number, number] | null>(() => {
    if (!selectedSegment || chartTimeBaseMs == null) return null;
    return [chartTimeBaseMs + selectedSegment.startX, chartTimeBaseMs + selectedSegment.endX];
  }, [selectedSegment, chartTimeBaseMs]);

  const selectedXDomain = useMemo<[number, number] | null>(
    () => selectedSegment ? [selectedSegment.startX, selectedSegment.endX] : null,
    [selectedSegment],
  );

  const activeChartXDomain = useMemo<[number, number] | null>(
    () => chartDomain ?? selectedXDomain,
    [selectedXDomain, chartDomain],
  );

  const focusDomain = useMemo<[number, number] | null>(
    () => selectedSegment ? null : chartDomain,
    [selectedSegment, chartDomain],
  );

  const handleChartDomainChange = useCallback((domain: [number, number] | null) => {
    if (!domain) {
      setSelectedSegmentId(null);
      setChartDomain(null);
      return;
    }
    if (fullXDomain) {
      const coverage = (domain[1] - domain[0]) / (fullXDomain[1] - fullXDomain[0] || 1);
      if (coverage > 0.75 && selectedSegmentIdRef.current) {
        setSelectedSegmentId(null);
        setChartDomain(null);
        return;
      }
    }
    setChartDomain(domain);
  }, [fullXDomain]);

  const handleSegmentChange = useCallback((id: string | null) => {
    setChartDomain(null);
    setSelectedSegmentId(id);
  }, []);

  const summary = useMemo(() => summarizeFlight(points), [points]);
  const durationDisplay = useMemo(() => {
    const fromChart = chartDurationSec(chartData, hasChartTime);
    if (fromChart !== null) return formatDuration(fromChart);
    return formatDuration(summary.durationSec);
  }, [chartData, hasChartTime, summary.durationSec]);

  const processedTelemetryFileCount = telemetryFileMetas.length || (fileName ? 1 : 0);
  const canAddTelemetryFiles = canEditTelemetry && telemetrySources.length < MAX_TELEMETRY_CSV_FILES;

  const uploadPanel = (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-5">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-slate-200">
            CSVs de telemetria ({telemetrySources.length}/{MAX_TELEMETRY_CSV_FILES})
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {fileName
              ? `Último processamento: ${fileName} (${telemetryCharCount.toLocaleString("pt-BR")} chars)`
              : "Nenhum CSV de telemetria carregado."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            A ordem de processamento é definida pelos horários nas linhas dos CSVs, não pela ordem de seleção.
          </p>
        </div>

        {telemetrySources.length > 0 ? (
          <div className="grid gap-2">
            {telemetrySources.map((source, index) => (
              <div
                key={`${source.name}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-slate-200">{source.name}</p>
                  <p className="text-xs text-slate-500">{source.text.length.toLocaleString("pt-BR")} chars</p>
                </div>
                {canEditTelemetry ? (
                  <button
                    type="button"
                    onClick={() => removeTelemetrySource(index)}
                    disabled={savingTelemetry}
                    className="self-start rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 sm:self-auto"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {telemetryDirty ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
            Há alterações pendentes. Clique em Processar telemetria para validar e salvar.
          </p>
        ) : null}

        {canEditTelemetry && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <label
              className={`inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 ${
                canAddTelemetryFiles && !savingTelemetry ? "cursor-pointer hover:bg-slate-800" : "cursor-not-allowed opacity-50"
              }`}
            >
              Adicionar CSVs
              <input
                type="file"
                multiple
                accept=".csv,text/csv,text/plain"
                disabled={!canAddTelemetryFiles || savingTelemetry}
                onChange={(e) => void handleTelemetryFilesSelected(e)}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleProcessTelemetry()}
              disabled={savingTelemetry || telemetrySources.length === 0}
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {savingTelemetry ? "Processando..." : "Processar telemetria"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <TelemetryProcessingProgress className="min-h-[min(420px,60vh)]" />;
  }

  if (loadError) {
    return (
      <div className="relative min-w-0 space-y-3">
        {uploadPanel}
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">
          {loadError}
        </p>
        {savingTelemetry ? <TelemetryProcessingOverlay /> : null}
      </div>
    );
  }

  if (!fileName) {
    return (
      <div className="relative min-w-0 space-y-3">
        {uploadPanel}
        <p className="py-12 text-center text-sm text-slate-500">
          {telemetrySources.length > 0
            ? "Arquivos selecionados. Clique em Processar telemetria para validar os dados."
            : "Nenhum arquivo carregado."}
        </p>
        {savingTelemetry ? <TelemetryProcessingOverlay /> : null}
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex flex-col gap-2">
      {savingTelemetry ? <TelemetryProcessingOverlay /> : null}
      {uploadPanel}
      <TelemetryAlertsPanel alerts={flightAlerts} loading={alertsLoading} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-medium text-slate-300 [overflow-wrap:anywhere]">
          Arquivos processados: {fileName}
        </h3>
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
          onChange={handleSegmentChange}
        />
      )}

      {(points.length > 0 || chartData.length > 0) && (
        <div className="h-[calc(100vh-1.5rem)] min-h-[520px] md:min-h-[700px]">
          <div className={`grid h-full min-h-0 gap-2 ${chartData.length > 0 ? "xl:grid-cols-[460px_minmax(0,1fr)]" : "grid-cols-1"}`}>
            {chartData.length > 0 && (
              <div className="min-h-0 overflow-y-auto">
                {selectedSegment ? (
                  <SegmentSummary segment={selectedSegment} />
                ) : (
                  <FullFlightSummary
                    chartData={chartData}
                    chartTimeBaseMs={chartTimeBaseMs}
                    durationDisplay={durationDisplay}
                    segments={segments}
                    summary={summary}
                    telemetryFileCount={processedTelemetryFileCount}
                    telemetryGapSec={telemetryGapSec}
                    telemetryGaps={telemetryGaps}
                  />
                )}
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
                  onXDomainChange={handleChartDomainChange}
                  xDomain={activeChartXDomain}
                  fullXDomain={fullXDomain}
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

const ALERT_SEVERITY_CLASS: Record<string, string> = {
  leve: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  risco: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

function parseEvidenceValues(evidenceJson: string): Partial<Record<TelemetryAlertProperty, number>> {
  try {
    const parsed = JSON.parse(evidenceJson) as { values?: Partial<Record<TelemetryAlertProperty, number>> };
    return parsed.values ?? {};
  } catch {
    return {};
  }
}

function formatAlertTime(value: string | null): string {
  if (!value) return "horario indisponivel";
  try {
    return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return value;
  }
}

function TelemetryAlertsPanel({ alerts, loading }: { alerts: FlightTelemetryAlertDoc[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Alertas ativados</h3>
          <p className="text-xs text-slate-500">Regras configuradas pelo admin que foram disparadas neste voo.</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {alerts.map((alert) => {
          const values = parseEvidenceValues(alert.evidenceJson);
          const valueText = Object.entries(values)
            .map(([key, value]) => `${propertyLabel(key as TelemetryAlertProperty)}: ${value} ${propertyUnit(key as TelemetryAlertProperty)}`)
            .join(" | ");
          return (
            <div key={alert.id} className={`rounded-lg border px-3 py-2 ${ALERT_SEVERITY_CLASS[alert.severity] ?? ALERT_SEVERITY_CLASS.leve}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{alert.ruleName}</p>
                <span className="text-[11px] uppercase tracking-wider">{alert.severity}</span>
              </div>
              <p className="mt-1 text-xs opacity-80">
                {alert.phase ?? "fase"} · {formatAlertTime(alert.matchedAt)}
                {alert.durationSec ? ` · ${alert.durationSec}s` : ""}
              </p>
              {valueText ? <p className="mt-1 text-xs opacity-90">{valueText}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FullFlightSummary({
  chartData,
  chartTimeBaseMs,
  durationDisplay,
  segments,
  summary,
  telemetryFileCount,
  telemetryGapSec,
  telemetryGaps,
}: {
  chartData: ChartRow[];
  chartTimeBaseMs: number | null;
  durationDisplay: string;
  segments: FlightSegment[];
  summary: FlightSummary;
  telemetryFileCount: number;
  telemetryGapSec: number | null;
  telemetryGaps: TelemetryCsvGap[];
}) {
  const landingSegments = segments.filter((seg) => seg.type === "landing" || seg.type === "tgl");
  const takeoffSegments = segments.filter((seg) => seg.type === "takeoff");
  const gsMax = maxSampleFromRows(chartData, "gsKt");
  const wind = computeWindComponents(chartData);
  const operational = computeOperationalSummary(chartData, chartTimeBaseMs, segments, telemetryGapSec, telemetryFileCount, telemetryGaps);

  return (
    <div className="grid gap-4">
      <OperationalTimelineCard summary={operational} />

      <SummaryCard title="Voo completo">
        <InfoRow label="Distância" value={formatDistanceNmKm(summary.distanceM)} />
        <InfoRow label="Duração" value={durationDisplay} />
        <InfoRow label="Alt máx" value={formatAltFt(summary.altMaxM)} />
        <InfoRow label="Vel média" value={formatSpeedKt(summary.speedAvgMs)} />
        <InfoRow label="GS máx" value={fmtKtAt(gsMax, chartTimeBaseMs)} />
        <InfoRow label="Maior vento de proa" value={fmtKtAt(wind.maxHeadwind, chartTimeBaseMs)} />
        <InfoRow label="Maior vento de cauda" value={fmtKtAt(wind.maxTailwind, chartTimeBaseMs)} />
        <InfoRow label="Maior vento de través" value={fmtKtAt(wind.maxCrosswind, chartTimeBaseMs)} />
      </SummaryCard>

      <SummaryCard title="Resumo de pousos">
        <InfoRow label="Qtd de pousos" value={String(landingSegments.length)} />
        <div className="mt-3 grid gap-3">
          {landingSegments.map((seg, idx) => (
            <div key={seg.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pouso {String(idx + 1).padStart(2, "0")}
              </p>
              <InfoRow
                label="Impacto"
                value={formatImpact(seg.landingMetrics?.tdImpactG, seg.landingMetrics?.tdImpactLabel)}
              />
              <InfoRow label="VA toque" value={fmtKt(seg.landingMetrics?.tdIasKt)} />
              <InfoRow label="GS toque" value={fmtKt(seg.landingMetrics?.tdGsKt)} />
              <InfoRow label="VS toque" value={fmtFpm(seg.landingMetrics?.tdVertSpeedFpm)} />
            </div>
          ))}
        </div>
      </SummaryCard>

      <SummaryCard title="Resumo de decolagens">
        <InfoRow label="Qtd de decolagens" value={String(takeoffSegments.length)} />
        <div className="mt-3 grid gap-3">
          {takeoffSegments.map((seg, idx) => (
            <div key={seg.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Decolagem {String(idx + 1).padStart(2, "0")}
              </p>
              <InfoRow label="Distância de decolagem" value={fmtMetersFromFt(seg.takeoffMetrics?.groundRollFt)} />
              <InfoRow label="Tempo até decolagem" value={fmtSeconds(seg.takeoffMetrics?.groundRollDurationSec)} />
              <InfoRow label="Tempo até AGL 100" value={fmtSeconds(seg.takeoffMetrics?.timeToAgl100Sec)} />
              <InfoRow label="Tempo até AGL 500" value={fmtSeconds(seg.takeoffMetrics?.timeToAgl500Sec)} />
            </div>
          ))}
        </div>
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

type OperationalSummary = {
  startup: string;
  shutdown: string;
  brakesOff: string;
  brakesOn: string;
  takeoff: string;
  airtimeDuration: string;
  landing: string;
  startupToShutdown: string;
  brakesDuration: string;
  telemetryGapDuration: string | null;
  telemetryGaps: Array<{
    startTime: string;
    endTime: string;
    duration: string;
  }>;
};

function OperationalTimelineCard({ summary }: { summary: OperationalSummary }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
      <div className="grid gap-3 text-sm">
        <TimelineRow
          leftLabel="Startup"
          leftValue={summary.startup}
          center={summary.startupToShutdown}
          rightLabel="Shutdown"
          rightValue={summary.shutdown}
        />
        <TimelineRow
          leftLabel="Brakes off"
          leftValue={summary.brakesOff}
          center={summary.brakesDuration}
          rightLabel="Brakes on"
          rightValue={summary.brakesOn}
        />
        <TimelineRow
          leftLabel="Takeoff"
          leftValue={summary.takeoff}
          center={summary.airtimeDuration}
          centerLabel="Airtime"
          rightLabel="Landing"
          rightValue={summary.landing}
        />
        {summary.telemetryGaps.length > 0 ? (
          summary.telemetryGaps.map((gap, index) => (
            <TimelineRow
              key={`${gap.startTime}-${gap.endTime}-${index}`}
              leftLabel={summary.telemetryGaps.length > 1 ? `Fim telemetria ${index + 1}` : "Fim telemetria"}
              leftValue={gap.startTime}
              center={gap.duration}
              centerLabel="Parado sem telemetria"
              rightLabel="Retorno telemetria"
              rightValue={gap.endTime}
            />
          ))
        ) : summary.telemetryGapDuration ? (
          <TimelineRow
            leftLabel="Fim telemetria"
            leftValue="—"
            center={summary.telemetryGapDuration}
            centerLabel="Parado sem telemetria"
            rightLabel="Retorno telemetria"
            rightValue="—"
          />
        ) : null}
      </div>
    </div>
  );
}

function TimelineRow({
  center,
  centerLabel,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  center: string;
  centerLabel?: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-end gap-2">
      <div>
        <p className="text-[11px] text-indigo-300/80">{leftLabel}</p>
        <p className="font-medium text-slate-100">{leftValue}</p>
      </div>
      <div className="grid gap-1 text-center">
        {centerLabel && <p className="text-[11px] text-indigo-300/80">{centerLabel}</p>}
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-slate-600" />
          <span className="rounded-full bg-slate-600 px-3 py-1 text-sm font-semibold text-white">{center}</span>
          <span className="h-px flex-1 bg-slate-600" />
        </div>
      </div>
      <div className="text-right">
        <p className="text-[11px] text-indigo-300/80">{rightLabel}</p>
        <p className="font-medium text-slate-100">{rightValue}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800 py-1.5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-100">{value}</span>
    </div>
  );
}

type TimedValue = { value: number; x: number } | null;

function maxSampleFromRows(rows: ChartRow[], key: string): TimedValue {
  let best: TimedValue = null;
  rows.forEach((row) => {
    const value = row[key];
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    if (best === null || value > best.value) best = { value, x: row.x };
  });
  return best;
}

function computeWindComponents(rows: ChartRow[]) {
  let maxHeadwind: TimedValue = null;
  let maxTailwind: TimedValue = null;
  let maxCrosswind: TimedValue = null;

  rows.forEach((row) => {
    const windKt = row.windKt;
    const windDirDeg = row.windDirDeg;
    const referenceDeg = row.hdgMag ?? row.trackDeg;
    if (isFiniteNumber(windKt) && isFiniteNumber(windDirDeg) && isFiniteNumber(referenceDeg)) {
      const diffRad = (angleDiffDeg(windDirDeg, referenceDeg) * Math.PI) / 180;
      const headwind = windKt * Math.cos(diffRad);
      const crosswind = Math.abs(windKt * Math.sin(diffRad));
      if (headwind >= 0) {
        if (maxHeadwind === null || headwind > maxHeadwind.value) {
          maxHeadwind = { value: headwind, x: row.x };
        }
      } else {
        const tailwind = Math.abs(headwind);
        if (maxTailwind === null || tailwind > maxTailwind.value) {
          maxTailwind = { value: tailwind, x: row.x };
        }
      }
      if (maxCrosswind === null || crosswind > maxCrosswind.value) {
        maxCrosswind = { value: crosswind, x: row.x };
      }
      return;
    }

    const gsKt = row.gsKt;
    const tasKt = row.tasKt;
    if (!isFiniteNumber(gsKt) || !isFiniteNumber(tasKt)) return;

    const longitudinalWind = tasKt - gsKt;
    if (longitudinalWind >= 0) {
      if (maxHeadwind === null || longitudinalWind > maxHeadwind.value) {
        maxHeadwind = { value: longitudinalWind, x: row.x };
      }
    } else {
      const tailwind = Math.abs(longitudinalWind);
      if (maxTailwind === null || tailwind > maxTailwind.value) {
        maxTailwind = { value: tailwind, x: row.x };
      }
    }
  });

  return { maxHeadwind, maxTailwind, maxCrosswind };
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function computeOperationalSummary(
  chartData: ChartRow[],
  chartTimeBaseMs: number | null,
  segments: FlightSegment[],
  telemetryGapSec: number | null,
  telemetryFileCount: number,
  telemetryGaps: TelemetryCsvGap[],
): OperationalSummary {
  const startupX = findFirstRunningEngineX(chartData) ?? chartData[0]?.x ?? null;
  const shutdownX = findShutdownX(chartData) ?? chartData[chartData.length - 1]?.x ?? null;
  const firstTakeoff = segments.find((seg) => seg.type === "takeoff");
  const landingSegments = segments.filter((seg) => seg.type === "landing" || seg.type === "tgl");
  const finalLanding = landingSegments[landingSegments.length - 1] ?? null;

  const firstLiftoff = firstTakeoff?.events.find((ev) => ev.type === "liftoff") ?? null;
  const finalTouchdown = finalLanding?.events.find((ev) => ev.type === "touchdown") ?? null;
  const brakesOffX = findFirstGroundSpeedX(chartData);
  const brakesOnX = findLastGroundSpeedX(chartData);
  const airtimeSec =
    firstLiftoff && finalTouchdown ? Math.max(0, (finalTouchdown.xMs - firstLiftoff.xMs) / 1000) : null;

  return {
    startup: formatShortTime(startupX, chartTimeBaseMs),
    shutdown: formatShortTime(shutdownX, chartTimeBaseMs),
    brakesOff: formatShortTime(brakesOffX, chartTimeBaseMs),
    brakesOn: formatShortTime(brakesOnX, chartTimeBaseMs),
    takeoff: formatShortTime(firstLiftoff?.xMs ?? null, chartTimeBaseMs),
    airtimeDuration: formatCompactDuration(airtimeSec),
    landing: formatShortTime(finalTouchdown?.xMs ?? null, chartTimeBaseMs),
    startupToShutdown: formatCompactDuration(startupX !== null && shutdownX !== null ? (shutdownX - startupX) / 1000 : null),
    brakesDuration: formatCompactDuration(brakesOffX !== null && brakesOnX !== null ? (brakesOnX - brakesOffX) / 1000 : null),
    telemetryGapDuration: telemetryFileCount > 1 ? formatCompactDuration(telemetryGapSec ?? 0) : null,
    telemetryGaps: telemetryGaps.map((gap) => ({
      startTime: formatAbsoluteShortTime(gap.startMs),
      endTime: formatAbsoluteShortTime(gap.endMs),
      duration: formatCompactDuration(gap.durationSec),
    })),
  };
}

function findFirstRunningEngineX(chartData: ChartRow[]): number | null {
  const row = chartData.find((sample) => isRunningEngine(sample.rpm));
  return row?.x ?? null;
}

function findShutdownX(chartData: ChartRow[]): number | null {
  let lastRunningIdx = -1;
  for (let i = 0; i < chartData.length; i++) {
    if (isRunningEngine(chartData[i]?.rpm)) lastRunningIdx = i;
  }
  if (lastRunningIdx < 0) return null;
  for (let i = lastRunningIdx + 1; i < chartData.length; i++) {
    const rpm = chartData[i]?.rpm;
    if (rpm !== null && rpm !== undefined && !isRunningEngine(rpm)) return chartData[i]!.x;
  }
  return chartData[chartData.length - 1]?.x ?? null;
}

function isRunningEngine(rpm: number | null | undefined): boolean {
  return rpm !== null && rpm !== undefined && Number.isFinite(rpm) && rpm > 300;
}

function findFirstGroundSpeedX(chartData: ChartRow[]): number | null {
  const row = chartData.find((sample) => hasGroundSpeedIndication(sample.gsKt));
  return row?.x ?? null;
}

function findLastGroundSpeedX(chartData: ChartRow[]): number | null {
  for (let i = chartData.length - 1; i >= 0; i--) {
    if (hasGroundSpeedIndication(chartData[i]?.gsKt)) return chartData[i]!.x;
  }
  return null;
}

function hasGroundSpeedIndication(gsKt: number | null | undefined): boolean {
  return gsKt !== null && gsKt !== undefined && Number.isFinite(gsKt) && gsKt > 1;
}

function angleDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function formatDistanceNmKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return `${(meters / 1852).toFixed(1)} NM / ${(meters / 1000).toFixed(1)} km`;
}

function fmtKt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(0)} kt`;
}

function fmtKtAt(sample: TimedValue, baseMs: number | null): string {
  if (sample === null) return "—";
  const time = formatSampleTime(sample.x, baseMs);
  return `${sample.value.toFixed(0)} kt${time ? ` às ${time}` : ""}`;
}

function fmtFpm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(0)} fpm`;
}

function fmtMetersFromFt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 0.3048).toFixed(0)} m`;
}

function fmtSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} s`;
}

function formatCompactDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function formatImpact(value: number | null | undefined, label: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return label ?? "—";
  return `${value.toFixed(2)} G${label ? ` (${label})` : ""}`;
}

function formatShortTime(xMs: number | null | undefined, baseMs: number | null): string {
  if (xMs === null || xMs === undefined || baseMs === null) return "—";
  try {
    return `${new Date(baseMs + xMs).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}z`;
  } catch {
    return "—";
  }
}

function formatAbsoluteShortTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  try {
    return `${new Date(ms).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}z`;
  } catch {
    return "—";
  }
}

function formatSampleTime(xMs: number, baseMs: number | null): string {
  if (baseMs === null) return "";
  try {
    return new Date(baseMs + xMs).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
