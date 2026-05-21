import { useCallback, useEffect, useMemo, useState } from "react";
import { listAdminFlightReports } from "../../lib/adminUsersDb";
import type { AdminFlightReportRow } from "../../types/adminFlightReports";
import { TelemetriaTab } from "../TelemetriaTab";
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

function isWithoutTelemetry(row: AdminFlightReportRow): boolean {
  const summaryMissing = !row.telemetry?.telemetryPresent;
  const docMissing = !(row.telemetryPresentOnDoc ?? false);
  return summaryMissing && docMissing;
}

function NoTelemetryFlightModal({
  row,
  onClose,
  onSaved,
}: {
  row: AdminFlightReportRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">Adicionar telemetria</h3>
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
          <TelemetriaTab flightId={row.id} />
        </div>
      </div>
    </div>
  );
}

export function NoTelemetryTab() {
  const { showToast } = useToast();
  const initialPeriod = useMemo(() => periodForPreset("last30"), []);
  const [rows, setRows] = useState<AdminFlightReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFilter, setOpenFilter] = useState<MultiFilterKey | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminFlightReportRow | null>(null);
  const [filterState, setFilterState] = useState<AdminReportFilterState>({
    periodPreset: "last30",
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

  const withoutTelemetry = useMemo(
    () => rows.filter((row) => row.status === "Realizado" && isWithoutTelemetry(row)),
    [rows],
  );

  const options = useMemo(() => {
    const instructors = new Set<string>();
    const students = new Set<string>();
    const aircrafts = new Set<string>();
    for (const row of withoutTelemetry) {
      if (row.instructorName) instructors.add(row.instructorName);
      if (row.studentName) students.add(row.studentName);
      if (row.aircraftIdent) aircrafts.add(row.aircraftIdent);
    }
    return {
      instructors: Array.from(instructors).sort((a, b) => a.localeCompare(b, "pt-BR")),
      students: Array.from(students).sort((a, b) => a.localeCompare(b, "pt-BR")),
      aircrafts: Array.from(aircrafts).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [withoutTelemetry]);

  const filtered = useMemo(() => {
    return withoutTelemetry.filter((row) => {
      const date = row.flightDate || row.createdAt.slice(0, 10);
      if (filterState.fromDate && date < filterState.fromDate) return false;
      if (filterState.toDate && date > filterState.toDate) return false;
      if (filterState.instructors.length && !filterState.instructors.includes(row.instructorName)) return false;
      if (filterState.students.length && !filterState.students.includes(row.studentName)) return false;
      if (filterState.aircrafts.length && !filterState.aircrafts.includes(row.aircraftIdent ?? "")) return false;
      return true;
    });
  }, [filterState, withoutTelemetry]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Voos executados sem CSV Garmin importado. Use os filtros e importe individualmente ou em massa.
          </p>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-amber-300">{filtered.length}</span> voo(s) no filtro
        </p>
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
                <th className="px-3 py-2.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((row) => (
                <tr key={row.id} className="text-slate-200 hover:bg-slate-800/30">
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(row.flightDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{row.startTime || "—"}</td>
                  <td className="px-3 py-2.5">{row.studentName}</td>
                  <td className="px-3 py-2.5">{row.instructorName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{row.aircraftIdent || "—"}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-400" title={row.route}>
                    {row.route || "—"}
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
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhum voo sem telemetria para os filtros atuais.</p>
          ) : null}
        </div>
      )}

      {selectedRow ? (
        <NoTelemetryFlightModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
