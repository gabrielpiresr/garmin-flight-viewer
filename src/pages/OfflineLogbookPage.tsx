import { useEffect, useMemo, useState } from "react";
import {
  listOfflineAircraftPackages,
  validateOfflinePackageCoverage,
  type OfflineAircraftLogbookPackage,
} from "../lib/offlineLogbookDb";
import { LOGBOOK_CSV_COLUMNS, logbookCellValue, type AnacLogbookEntry } from "../lib/logbookAnac";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusClass(state: "ok" | "warning" | "error"): string {
  if (state === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (state === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function EntryDetail({ entry, pkg }: { entry: AnacLogbookEntry; pkg: OfflineAircraftLogbookPackage }) {
  const signatures = pkg.signatures[entry.flightId];
  const maintenance = pkg.maintenance_snapshot[entry.flightId] ?? entry.maintenance;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Voo</p>
        <p className="mt-2 text-sm text-slate-200">{entry.flightDate} · {entry.aircraft} · {entry.route}</p>
        <p className="mt-1 text-xs text-slate-500">Seq. {entry.seqNumber} · perna {entry.legIndex + 1}/{entry.legCount}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assinaturas</p>
        <div className="mt-2 space-y-1 text-xs text-slate-300">
          <p>Aluno: {signatures?.student ? formatDateTime(signatures.student.signed_at) : "pendente"}</p>
          <p>Instrutor: {signatures?.instructor ? formatDateTime(signatures.instructor.signed_at) : "pendente"}</p>
          <p>Operador: {signatures?.admin_operator ? formatDateTime(signatures.admin_operator.signed_at) : "pendente"}</p>
        </div>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Manutencao</p>
        <div className="mt-2 space-y-1 text-xs text-slate-300">
          <p>Ultima: {maintenance?.lastInterventionType ?? "-"}</p>
          <p>Proxima: {maintenance?.nextInterventionType ?? "-"}</p>
          <p>Horas prox.: {maintenance?.nextInterventionDueHours ?? "-"}</p>
        </div>
      </div>
    </div>
  );
}

export function OfflineLogbookPage() {
  const [packages, setPackages] = useState<OfflineAircraftLogbookPackage[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listOfflineAircraftPackages()
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort((a, b) => a.aircraft_ident.localeCompare(b.aircraft_ident));
        setPackages(sorted);
        setSelectedId((current) => current || (sorted[0]?.id ?? ""));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? null,
    [packages, selectedId],
  );
  const status = validateOfflinePackageCoverage(selectedPackage);
  const selectedEntry = useMemo(() => {
    if (!selectedPackage || !selectedEntryId) return selectedPackage?.entries[0] ?? null;
    return selectedPackage.entries.find((entry) => `${entry.flightId}:${entry.legIndex}` === selectedEntryId) ?? selectedPackage.entries[0] ?? null;
  }, [selectedEntryId, selectedPackage]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Modo a bordo</p>
            <h1 className="text-xl font-semibold">Diario de bordo offline</h1>
          </div>
          <a href="/" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Portal
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">Carregando pacote local...</div>
        ) : packages.length === 0 ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200">
            Nenhum pacote offline encontrado neste dispositivo. Conecte a internet, entre como admin e sincronize uma aeronave.
          </div>
        ) : (
          <>
            <section className="grid gap-3 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,1fr)]">
              <label>
                <span className="mb-1 block text-xs text-slate-500">Aeronave cacheada</span>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setSelectedEntryId(null);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                >
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.aircraft_ident}</option>
                  ))}
                </select>
              </label>
              <div className={`rounded-lg border px-4 py-3 ${statusClass(status.state)}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-sm font-semibold">{status.label}</p>
                  <p className="font-mono text-xs">{selectedPackage?.package_hash.slice(0, 16) ?? "-"}</p>
                </div>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {status.messages.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            </section>

            {selectedPackage ? (
              <>
                <section className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-xs text-slate-500">Matricula</p>
                    <p className="mt-1 font-semibold">{selectedPackage.aircraft_ident}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-xs text-slate-500">Janela</p>
                    <p className="mt-1 font-semibold">{selectedPackage.valid_from} a {selectedPackage.valid_to}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-xs text-slate-500">Gerado</p>
                    <p className="mt-1 font-semibold">{formatDateTime(selectedPackage.generated_at)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-xs text-slate-500">Voos</p>
                    <p className="mt-1 font-semibold">{selectedPackage.flights.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-xs text-slate-500">Entradas</p>
                    <p className="mt-1 font-semibold">{selectedPackage.entries.length}</p>
                  </div>
                </section>

                <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30">
                  <div className="max-h-[62vh] overflow-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400">
                        <tr>
                          {LOGBOOK_CSV_COLUMNS.slice(0, 18).map((col) => (
                            <th key={col.key} className="whitespace-nowrap px-3 py-2 font-semibold">{col.label}</th>
                          ))}
                          <th className="sticky right-0 bg-slate-900 px-3 py-2 font-semibold">Detalhe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedPackage.entries.map((entry) => {
                          const entryId = `${entry.flightId}:${entry.legIndex}`;
                          return (
                            <tr key={entryId} className="hover:bg-slate-800/40">
                              {LOGBOOK_CSV_COLUMNS.slice(0, 18).map((col) => (
                                <td key={col.key} className="max-w-[12rem] truncate whitespace-nowrap px-3 py-2" title={logbookCellValue(entry, col.key)}>
                                  {logbookCellValue(entry, col.key)}
                                </td>
                              ))}
                              <td className="sticky right-0 bg-slate-950/90 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntryId(entryId)}
                                  className="text-emerald-400 hover:underline"
                                >
                                  Abrir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {selectedEntry ? <EntryDetail entry={selectedEntry} pkg={selectedPackage} /> : null}

                <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Integridade</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                    <p>Hash do pacote: <span className="font-mono">{selectedPackage.package_hash}</span></p>
                    <p>Expira em: {formatDateTime(selectedPackage.expires_at)}</p>
                    <p>Discrepancias: {selectedPackage.discrepancies.length}</p>
                    <p>Ordens de servico no pacote: {selectedPackage.work_orders.length}</p>
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
