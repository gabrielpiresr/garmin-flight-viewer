import { useCallback, useMemo, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { FlightCharts } from "./components/FlightCharts";
import { FlightMap } from "./components/FlightMap";
import { SavedFlightsPanel } from "./components/SavedFlightsPanel";
import { UploadZone } from "./components/UploadZone";
import { useAuth } from "./contexts/AuthContext";
import { suggestFlightName } from "./lib/flightNaming";
import { getSavedFlight, insertFlight } from "./lib/flightsDb";
import {
  chartDurationSec,
  formatAltFt,
  formatDistM,
  formatDuration,
  formatSpeedKt,
  summarizeFlight,
} from "./lib/flightStats";
import { parseGarminCsv } from "./lib/parseGarminCsv";
import type { ChartRow } from "./lib/telemetryCharts";
import type { FlightPoint } from "./types/flight";

export default function App() {
  const { user, configured: supabaseReady } = useAuth();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string | null>(null);
  const [points, setPoints] = useState<FlightPoint[]>([]);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [hasChartTime, setHasChartTime] = useState(false);
  const [chartTimeBaseMs, setChartTimeBaseMs] = useState<number | null>(null);
  const [telemetryColumns, setTelemetryColumns] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [meta, setMeta] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedListVersion, setSavedListVersion] = useState(0);

  const load = useCallback(async (text: string, name: string) => {
    setLoading(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      const r = parseGarminCsv(text);
      setFileName(name);
      setRawCsvText(text);
      setPoints(r.points);
      setChartData(r.chartData);
      setHasChartTime(r.hasChartTime);
      setChartTimeBaseMs(r.chartTimeBaseMs);
      setTelemetryColumns(r.telemetryColumns);
      setWarnings(r.warnings);
      setMeta(r.metaLines);
      setSaveMessage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const openSavedFlight = useCallback(
    async (id: string) => {
      setSaveMessage(null);
      const { data, error } = await getSavedFlight(id);
      if (error || !data) {
        setSaveMessage(error?.message ?? "Voo não encontrado.");
        return;
      }
      await load(data.csv_text, data.source_filename);
    },
    [load],
  );

  const saveToCloud = useCallback(async () => {
    if (!user || !rawCsvText || !fileName) return;
    setSaveBusy(true);
    setSaveMessage(null);
    const name = suggestFlightName(chartTimeBaseMs, fileName);
    const { error } = await insertFlight({
      userId: user.id,
      name,
      source_filename: fileName,
      csv_text: rawCsvText,
    });
    setSaveBusy(false);
    if (error) {
      setSaveMessage(error.message);
      return;
    }
    setSaveMessage(`Salvo como “${name}”.`);
    setSavedListVersion((v) => v + 1);
  }, [user, rawCsvText, fileName, chartTimeBaseMs]);

  const summary = useMemo(() => summarizeFlight(points), [points]);
  const durationDisplay = useMemo(() => {
    const fromChart = chartDurationSec(chartData, hasChartTime);
    if (fromChart !== null) return formatDuration(fromChart);
    return formatDuration(summary.durationSec);
  }, [chartData, hasChartTime, summary.durationSec]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 md:px-8">
      {loading ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-950/75 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          <p className="text-sm font-medium text-slate-200">Lendo e processando o CSV…</p>
          <p className="max-w-xs text-center text-xs text-slate-500">Arquivos grandes podem levar alguns segundos.</p>
        </div>
      ) : null}

      <header className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-sky-400/90">Piloto &amp; aluno</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Análise de voo (Garmin CSV)
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-400">
            Importe o arquivo exportado do ecossistema Garmin para ver trajeto no mapa, perfil de altitude,
            velocidade e resumo do trecho — tudo responsivo no telefone ou no tablet na cabine de estudos.
          </p>
        </div>
        <AuthPanel />
      </header>

      <main className="mx-auto mt-10 max-w-5xl space-y-10">
        {supabaseReady && user ? (
          <SavedFlightsPanel onOpen={(id) => void openSavedFlight(id)} refreshKey={savedListVersion} />
        ) : null}
        <UploadZone onText={load} disabled={loading} />

        {fileName ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium text-slate-100">Arquivo: {fileName}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {user && rawCsvText && supabaseReady ? (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      disabled={saveBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void saveToCloud()}
                    >
                      {saveBusy ? "Salvando…" : "Salvar na nuvem"}
                    </button>
                    <span className="max-w-xs text-right text-xs text-slate-500">
                      Nome automático: {suggestFlightName(chartTimeBaseMs, fileName)}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="text-sm text-sky-400 underline-offset-4 hover:underline"
                  onClick={() => {
                    setFileName(null);
                    setRawCsvText(null);
                    setPoints([]);
                    setChartData([]);
                    setHasChartTime(false);
                    setChartTimeBaseMs(null);
                    setTelemetryColumns({});
                    setWarnings([]);
                    setMeta([]);
                    setSaveMessage(null);
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>

            {saveMessage ? (
              <p className="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
                {saveMessage}
              </p>
            ) : null}

            {warnings.length > 0 ? (
              <ul className="list-inside list-disc rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {meta.length > 0 ? (
              <ul className="rounded-xl border border-slate-700/80 bg-slate-900/50 px-4 py-3 text-xs text-slate-400">
                {meta.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}

            {Object.keys(telemetryColumns).length > 0 ? (
              <details className="rounded-xl border border-slate-700/60 bg-slate-950/30 px-4 py-3 text-xs text-slate-500">
                <summary className="cursor-pointer text-slate-400">Colunas mapeadas ({Object.keys(telemetryColumns).length})</summary>
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-slate-500">
                  {Object.entries(telemetryColumns).map(([key, col]) => (
                    <li key={key}>
                      <span className="text-slate-400">{key}</span> ← {col}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {points.length > 0 || chartData.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    label="Pontos GPS"
                    value={summary.pointCount > 0 ? String(summary.pointCount) : "—"}
                  />
                  <Stat label="Linhas no CSV" value={String(chartData.length)} />
                  <Stat
                    label="Distância"
                    value={summary.pointCount >= 2 ? formatDistM(summary.distanceM) : "—"}
                  />
                  <Stat label="Duração" value={durationDisplay} />
                  <Stat
                    label="Altitude máx / mín"
                    value={
                      summary.pointCount > 0
                        ? `${formatAltFt(summary.altMaxM)} / ${formatAltFt(summary.altMinM)}`
                        : "—"
                    }
                  />
                  <Stat
                    label="Velocidade média / máx"
                    value={
                      summary.pointCount > 0
                        ? `${formatSpeedKt(summary.speedAvgMs)} / ${formatSpeedKt(summary.speedMaxMs)}`
                        : "—"
                    }
                  />
                </div>

                {points.length >= 2 ? (
                  <FlightMap points={points} />
                ) : (
                  <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                    Trajeto no mapa indisponível — não há pelo menos dois pontos GPS válidos. Os gráficos de telemetria
                    abaixo usam todas as linhas do arquivo.
                  </p>
                )}
                <FlightCharts
                  chartData={chartData}
                  hasTime={hasChartTime}
                  chartTimeBaseMs={chartTimeBaseMs}
                  resolved={telemetryColumns}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">Nada para exibir ainda — envie um CSV com latitude e longitude.</p>
            )}
          </section>
        ) : null}
      </main>

      <footer className="mx-auto mt-16 max-w-5xl border-t border-slate-800 py-8 text-center text-xs text-slate-600">
        Uso educacional. Valide sempre com as fontes oficiais de registro de voo e procedimentos da sua escola
        de aviação.
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}
