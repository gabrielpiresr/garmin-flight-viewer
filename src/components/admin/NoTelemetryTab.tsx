import { useCallback, useEffect, useMemo, useState } from "react";
import { listAdminFlightReports } from "../../lib/adminUsersDb";
import { listFlightVideoFlags } from "../../lib/flightVideosDb";
import { importAllInstructorFlightsFromSaga, type SagaImportProgress } from "../../lib/sagaImportDb";
import type { AdminFlightReportRow } from "../../types/adminFlightReports";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import {
  AdminReportFilterBar,
  periodForPreset,
  type AdminReportFilterState,
  type MultiFilterKey,
} from "./AdminReportFilterBar";
import { TelemetryBulkImportPanel } from "./TelemetryBulkImportPanel";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function hasTelemetry(row: AdminFlightReportRow): boolean {
  const summaryPresent = row.telemetry?.telemetryPresent === true;
  const docPresent = row.telemetryPresentOnDoc === true;
  return summaryPresent || docPresent;
}

function needsFlightReviewAttention(row: AdminFlightReportRow, videoOk: boolean): boolean {
  return !hasTelemetry(row) || !videoOk;
}

function resolveInitialSubTab(telemetryOk: boolean, videoOk: boolean): "telemetria" | "videos" | "flight-review" {
  if (!telemetryOk) return "telemetria";
  if (!videoOk) return "videos";
  return "flight-review";
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {label}
    </span>
  );
}

function FlightReviewFlightModal({
  row,
  telemetryOk,
  videoOk,
  onClose,
  onSaved,
}: {
  row: AdminFlightReportRow;
  telemetryOk: boolean;
  videoOk: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialSubTab = resolveInitialSubTab(telemetryOk, videoOk);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">Completar Flight Review</h3>
            <p className="mt-1 text-xs text-slate-500">
              {fmtDate(row.flightDate)} {row.startTime || "—"} · {row.studentName} · {row.instructorName || "Sem INVA"} ·{" "}
              {row.aircraftIdent ?? "—"} · {row.route || "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaved}
              className="rounded-lg border border-emerald-600/50 px-3 py-1.5 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            >
              Atualizar lista
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FlightDetailView
            flightId={row.id}
            onBack={onClose}
            backLabel="Fechar"
            showStudentTab={false}
            initialSubTab={initialSubTab}
            allowedSubTabs={["telemetria", "flight-review", "videos"]}
          />
        </div>
      </div>
    </div>
  );
}

export function NoTelemetryTab() {
  const { showToast } = useToast();
  const initialPeriod = useMemo(() => periodForPreset("last3"), []);
  const [rows, setRows] = useState<AdminFlightReportRow[]>([]);
  const [videoFlags, setVideoFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [openFilter, setOpenFilter] = useState<MultiFilterKey | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminFlightReportRow | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SagaImportProgress | null>(null);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [filterState, setFilterState] = useState<AdminReportFilterState>({
    periodPreset: "last3",
    fromDate: initialPeriod.fromDate,
    toDate: initialPeriod.toDate,
    instructors: [],
    students: [],
    aircrafts: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listAdminFlightReports({
        fromDate: filterState.fromDate,
        toDate: filterState.toDate,
        status: "Realizado",
        limit: 200,
      });
      setRows(page.flights);
      const flags = await listFlightVideoFlags(page.flights.map((row) => row.id));
      setVideoFlags(flags);
    } catch (err) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Falha ao carregar voos.",
      });
    } finally {
      setLoading(false);
    }
  }, [filterState.fromDate, filterState.toDate, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const incompleteFlights = useMemo(
    () =>
      rows.filter(
        (row) => row.status === "Realizado" && needsFlightReviewAttention(row, videoFlags[row.id] ?? false),
      ),
    [rows, videoFlags],
  );

  const options = useMemo(() => {
    const instructors = new Set<string>();
    const students = new Set<string>();
    const aircrafts = new Set<string>();
    for (const row of incompleteFlights) {
      if (row.instructorName) instructors.add(row.instructorName);
      if (row.studentName) students.add(row.studentName);
      if (row.aircraftIdent) aircrafts.add(row.aircraftIdent);
    }
    return {
      instructors: Array.from(instructors).sort((a, b) => a.localeCompare(b, "pt-BR")),
      students: Array.from(students).sort((a, b) => a.localeCompare(b, "pt-BR")),
      aircrafts: Array.from(aircrafts).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [incompleteFlights]);

  const filtered = useMemo(() => {
    return incompleteFlights.filter((row) => {
      const date = row.flightDate || row.createdAt.slice(0, 10);
      if (filterState.fromDate && date < filterState.fromDate) return false;
      if (filterState.toDate && date > filterState.toDate) return false;
      if (filterState.instructors.length && !filterState.instructors.includes(row.instructorName)) return false;
      if (filterState.students.length && !filterState.students.includes(row.studentName)) return false;
      if (filterState.aircrafts.length && !filterState.aircrafts.includes(row.aircraftIdent ?? "")) return false;
      return true;
    });
  }, [filterState, incompleteFlights]);

  const handleSagaSync = async () => {
    if (sagaImporting) return;
    setSagaImporting(true);
    setSyncOverlayVisible(true);
    setSyncProgress(null);
    try {
      const summary = await importAllInstructorFlightsFromSaga({
        onProgress: (progress) => setSyncProgress(progress),
      });
      const novos = (summary.flightsCreated ?? 0) + (summary.flightsUpdated ?? 0);
      const removidos = summary.flightsDeleted ?? 0;
      const deletedIds = (summary.deletedFlights ?? []).map((item) => item.flightId).filter(Boolean);
      showToast({
        message: [
          novos > 0
            ? `${summary.flightsCreated} voo(s) novo(s) e ${summary.flightsUpdated} atualizado(s) importados do SAGA.`
            : "Nenhum voo novo encontrado no SAGA.",
          removidos > 0 ? `${removidos} voo(s) removido(s) localmente por terem sido apagados no SAGA.` : "",
          summary.staleCleanup?.failed
            ? `Falha ao remover ${summary.staleCleanup.failed} voo(s). Abra o console para detalhes.`
            : "",
          deletedIds.length ? `IDs removidos: ${deletedIds.join(", ")}` : "",
        ].filter(Boolean).join(" "),
        variant: novos > 0 || removidos > 0 ? "success" : "info",
      });
      await load();
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setSagaImporting(false);
      window.setTimeout(() => {
        setSyncProgress(null);
        setSyncOverlayVisible(false);
      }, 250);
    }
  };

  const selectedTelemetryOk = selectedRow ? hasTelemetry(selectedRow) : false;
  const selectedVideoOk = selectedRow ? Boolean(videoFlags[selectedRow.id]) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Voos executados sem telemetria ou sem vídeo. Use os filtros, sincronize com o SAGA e complete telemetria, Flight Review ou vídeo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-amber-300">{filtered.length}</span> voo(s) no filtro
          </p>
          <button
            type="button"
            onClick={() => void handleSagaSync()}
            disabled={sagaImporting}
            className="flex items-center gap-2 rounded-lg border border-sky-700/50 bg-sky-900/30 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/40 disabled:opacity-50"
          >
            {sagaImporting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Sincronizando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sincronizar voos
              </>
            )}
          </button>
        </div>
      </div>

      <AdminReportFilterBar
        state={filterState}
        options={options}
        openFilter={openFilter}
        onOpenFilter={setOpenFilter}
        onChange={(patch) => setFilterState((current) => ({ ...current, ...patch }))}
      />

      <TelemetryBulkImportPanel
        flights={filtered}
        aircraftOptions={options.aircrafts}
        onImported={() => void load()}
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Horário</th>
                <th className="px-3 py-2.5 font-medium">Aluno</th>
                <th className="px-3 py-2.5 font-medium">Instrutor</th>
                <th className="px-3 py-2.5 font-medium">Avião</th>
                <th className="px-3 py-2.5 font-medium">Rota</th>
                <th className="px-3 py-2.5 font-medium">Telemetria</th>
                <th className="px-3 py-2.5 font-medium">Vídeo</th>
                <th className="px-3 py-2.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((row) => {
                const telemetryOk = hasTelemetry(row);
                const videoOk = videoFlags[row.id] ?? false;
                return (
                  <tr key={row.id} className="text-slate-200 hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(row.flightDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.startTime || "—"}</td>
                    <td className="px-3 py-2.5">{row.studentName}</td>
                    <td className="px-3 py-2.5">{row.instructorName || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.aircraftIdent || "—"}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-400" title={row.route}>
                      {row.route || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge ok={telemetryOk} label="Telemetria" />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge ok={videoOk} label="Vídeo" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRow(row)}
                        className="rounded-lg border border-sky-600/50 bg-sky-600/10 px-3 py-1 text-xs font-medium text-sky-200 hover:bg-sky-600/20"
                      >
                        Adicionar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              Nenhum voo sem telemetria ou vídeo para os filtros atuais.
            </p>
          ) : null}
        </div>
      )}

      {selectedRow ? (
        <FlightReviewFlightModal
          row={selectedRow}
          telemetryOk={selectedTelemetryOk}
          videoOk={selectedVideoOk}
          onClose={() => setSelectedRow(null)}
          onSaved={() => void load()}
        />
      ) : null}

      {syncOverlayVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <h3 className="text-base font-semibold text-slate-100">Sincronizando voos com SAGA</h3>
            </div>
            <p className="mb-4 text-sm text-slate-300">
              {syncProgress?.message || "Conectando ao SAGA..."}
            </p>
            {syncProgress && syncProgress.total > 0 ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{syncProgress.stage === "import" ? `${syncProgress.current} de ${syncProgress.total} voos` : syncProgress.stage}</span>
                  <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-1.5 rounded-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
