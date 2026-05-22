import { useCallback, useEffect, useMemo, useState } from "react";
import { closeFinancialMonth, getFinancialDre, reopenFinancialMonth, saveFinancialDreManualValue } from "../../lib/financialDreDb";
import type { FinancialDreLine, FinancialDreResponse, FinancialDreValueType } from "../../types/financialDre";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { DreAnalytics } from "./DreAnalytics";
import { DrePresentation } from "./DrePresentation";
import { DreSectionCards } from "./DreSectionCards";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, (monthNumber || 1) - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatValue(value: number, type: FinancialDreValueType): string {
  if (type === "percent") return `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (type === "hours") return `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  if (type === "number") return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseSignedValue(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function statusLabel(status: string): string {
  if (status === "closed") return "Fechado";
  if (status === "reopened") return "Reaberto";
  return "Aberto";
}

function statusClass(status: string): string {
  if (status === "closed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "reopened") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}>
      <path
        fillRule="evenodd"
        d="M7.22 4.72a.75.75 0 011.06 0l4.75 4.75a.75.75 0 010 1.06l-4.75 4.75a.75.75 0 01-1.06-1.06L11.44 10 7.22 5.78a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}

const EXTRA_SECTION_KEYS = new Set(["section_cash_revenue", "section_asset_variation"]);
// Meta lines are DRE lines used internally (e.g. saved in closed snapshots) but not displayed in the table.
const META_SECTION_KEYS = new Set(["meta_flown_hours", "meta_fuel_liters"]);

function detailGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    by_student: "Por aluno",
    by_aircraft: "Por aeronave",
    by_instructor: "Por instrutor",
    by_model: "Por modelo",
    by_product: "Por produto",
    by_payment_method: "Por forma de pagamento",
    price_deviation: "Desvio de preço ideal",
    by_source: "Por fonte",
    source_share: "Participação por fonte",
    taxes: "Impostos",
    after_tax: "Após imposto",
    payment_fees: "Taxas de recebimento",
    by_credit: "Por crédito",
    instructors: "Por instrutor",
    per_hour: "Por hora",
    fuel: "Combustível",
    work_orders: "Ordens de serviço",
    aircrafts: "Por aeronave",
    costs: "Custos",
    margin: "Margem",
    tax: "Imposto",
    total: "Total",
    hours_sold: "Horas vendidas",
  };
  return labels[group] ?? group.replace(/_/g, " ");
}

function buildVisibleRows(
  dre: FinancialDreResponse | null,
  openSections: ReadonlySet<string>,
  openDetails: ReadonlySet<string>,
  sectionFilter: (line: FinancialDreLine) => boolean,
) {
  if (!dre) return [];
  const sectionRows = dre.lines.filter((line) => line.level === 1 && sectionFilter(line));
  const rows: Array<{ kind: "line"; line: FinancialDreLine } | { kind: "detail"; parent: FinancialDreLine; label: string; values: Record<string, number>; valueType: FinancialDreValueType }> = [];
  for (const section of sectionRows) {
    rows.push({ kind: "line", line: section });
    if (!openSections.has(section.key)) continue;
    const children = dre.lines.filter((line) => line.parentKey === section.key);
    for (const child of children) {
      rows.push({ kind: "line", line: child });
      if (!openDetails.has(child.key)) continue;
      const detailMap = new Map<string, { label: string; values: Record<string, number>; valueType: FinancialDreValueType }>();
      for (const month of dre.months) {
        const breakdown = child.breakdown?.[month.key] ?? {};
        for (const [groupLabel, items] of Object.entries(breakdown)) {
          for (const item of items) {
            const key = `${groupLabel}:${item.label}:${item.valueType ?? child.valueType}`;
            const current = detailMap.get(key) ?? {
              label: `${detailGroupLabel(groupLabel)} - ${item.label}`,
              values: {},
              valueType: item.valueType ?? child.valueType,
            };
            current.values[month.key] = item.amount;
            detailMap.set(key, current);
          }
        }
      }
      for (const detail of detailMap.values()) rows.push({ kind: "detail", parent: child, ...detail });
    }
  }
  return rows;
}

export function AdminDreTab() {
  const { showToast } = useToast();
  const [fromMonth, setFromMonth] = useState(() => addMonths(currentMonth(), -5));
  const [toMonth, setToMonth] = useState(() => currentMonth());
  const [loading, setLoading] = useState(true);
  const [actingMonth, setActingMonth] = useState<string | null>(null);
  const [dre, setDre] = useState<FinancialDreResponse | null>(null);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());
  const [openDetails, setOpenDetails] = useState<ReadonlySet<string>>(() => new Set());
  const [savingManualCell, setSavingManualCell] = useState<string | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFinancialDre({ fromMonth, toMonth });
      setDre(data);
      setOpenSections(new Set());
      setOpenDetails(new Set());
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "Erro ao carregar DRE.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [fromMonth, showToast, toMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const dreRows = useMemo(
    () => buildVisibleRows(dre, openSections, openDetails, (line) => !EXTRA_SECTION_KEYS.has(line.key) && !META_SECTION_KEYS.has(line.key)),
    [dre, openDetails, openSections],
  );
  const extraRows = useMemo(
    () => buildVisibleRows(dre, openSections, openDetails, (line) => EXTRA_SECTION_KEYS.has(line.key)),
    [dre, openDetails, openSections],
  );
  const exportRows = useMemo(() => [...dreRows, ...extraRows], [dreRows, extraRows]);

  function toggleSection(key: string) {
    setOpenSections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDetail(key: string) {
    setOpenDetails((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCloseMonth(month: string) {
    const confirmed = window.confirm(
      "Deseja fechar este mês? Os valores da DRE serão travados e mudanças futuras em cadastros ou configurações não alterarão este resultado.",
    );
    if (!confirmed) return;
    setActingMonth(month);
    try {
      await closeFinancialMonth(month);
      showToast({ message: "Mês fechado com sucesso.", variant: "success" });
      await load();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "Erro ao fechar mês.", variant: "error" });
    } finally {
      setActingMonth(null);
    }
  }

  async function handleReopenMonth(month: string) {
    const confirmed = window.confirm("Deseja reabrir este mês? A DRE voltará a calcular os valores atuais on demand.");
    if (!confirmed) return;
    setActingMonth(month);
    try {
      await reopenFinancialMonth(month);
      showToast({ message: "Mês reaberto.", variant: "success" });
      await load();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "Erro ao reabrir mês.", variant: "error" });
    } finally {
      setActingMonth(null);
    }
  }

  async function handleSaveManualValue(month: string, line: FinancialDreLine, value: string) {
    if (!line.manualLineId) return;
    const amount = parseSignedValue(value);
    const current = line.values[month] ?? 0;
    if (amount === current) return;
    const cellKey = `${month}:${line.manualLineId}`;
    setSavingManualCell(cellKey);
    try {
      const next = await saveFinancialDreManualValue(month, line.manualLineId, amount);
      setDre(next);
      showToast({ message: "Lancamento manual atualizado.", variant: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "Erro ao salvar lancamento manual.", variant: "error" });
    } finally {
      setSavingManualCell(null);
    }
  }

  function exportCsv() {
    if (!dre) return;
    const header = ["Linha DRE", ...dre.months.map((month) => month.label)];
    const rows = exportRows.map((row) => {
      if (row.kind === "line") {
        return [row.line.label, ...dre.months.map((month) => formatValue(row.line.values[month.key] ?? 0, row.line.valueType))];
      }
      return [row.label, ...dre.months.map((month) => formatValue(row.values[month.key] ?? 0, row.valueType))];
    });
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dre-${dre.fromMonth}-${dre.toMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    setShowPresentation(true);
  }

  return (
    <section className="space-y-4">
      <style>{`
        @media print {
          body:not(.dre-pres-active) { background: white !important; }
          body:not(.dre-pres-active) aside,
          body:not(.dre-pres-active) header,
          body:not(.dre-pres-active) nav,
          body:not(.dre-pres-active) .dre-no-print { display: none !important; }
          body:not(.dre-pres-active) main { padding: 0 !important; overflow: visible !important; }
          body:not(.dre-pres-active) .dre-print-area { color: #0f172a !important; background: white !important; }
          body:not(.dre-pres-active) .dre-print-area * { color: #0f172a !important; border-color: #cbd5e1 !important; }
        }
      `}</style>

      <div className="dre-no-print flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Período inicial
            <input
              type="month"
              value={fromMonth}
              onChange={(event) => setFromMonth(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            Período final
            <input
              type="month"
              value={toMonth}
              onChange={(event) => setToMonth(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Atualizar
          </button>
          <button type="button" onClick={exportCsv} disabled={!dre} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            CSV
          </button>
          <button type="button" onClick={printPdf} disabled={!dre} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            PDF
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : dre ? (
        <div className="dre-print-area space-y-4">
          <DreSectionCards dre={dre} />

          <div className="dre-no-print grid gap-3 md:hidden">
            {dre.months.map((month) => (
              <section key={month.key} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{month.label}</h3>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(month.status)}`}>
                      {statusLabel(month.status)}
                    </span>
                  </div>
                  <MonthActions month={month} actingMonth={actingMonth} onClose={handleCloseMonth} onReopen={handleReopenMonth} />
                </div>
                <div className="space-y-2">
                  {dreRows.map((row) => {
                    if (row.kind === "detail") {
                      return (
                        <div key={`${month.key}-${row.parent.key}-${row.label}`} className="flex justify-between gap-3 rounded bg-slate-950/60 px-3 py-2 pl-8 text-xs">
                          <span className="text-slate-400">{row.label}</span>
                          <span className="font-medium text-slate-200">{formatValue(row.values[month.key] ?? 0, row.valueType)}</span>
                        </div>
                      );
                    }
                    const line = row.line;
                    const canToggle = line.level === 1 || line.level === 2;
                    const isOpen = line.level === 1 ? openSections.has(line.key) : openDetails.has(line.key);
                    return (
                      <button
                        key={`${month.key}-${line.key}`}
                        type="button"
                        onClick={() => (line.level === 1 ? toggleSection(line.key) : toggleDetail(line.key))}
                        className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left ${
                          line.level === 1 ? "bg-slate-800 text-sm font-semibold text-slate-100" : "bg-slate-950/60 pl-6 text-xs text-slate-300"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          {canToggle ? <Chevron open={isOpen} /> : null}
                          <span className="truncate">{line.label}</span>
                        </span>
                        <span className="font-medium">
                          <DreValueCell month={month} line={line} savingManualCell={savingManualCell} onSaveManualValue={handleSaveManualValue} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 md:block">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="sticky left-0 z-10 min-w-72 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Linha DRE
                  </th>
                  {dre.months.map((month) => (
                    <th key={month.key} className="min-w-40 px-4 py-3 text-right align-top">
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-sm font-semibold text-slate-100">{month.label}</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(month.status)}`}>
                          {statusLabel(month.status)}
                        </span>
                        <MonthActions month={month} actingMonth={actingMonth} onClose={handleCloseMonth} onReopen={handleReopenMonth} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dreRows.map((row) => {
                  if (row.kind === "detail") {
                    return (
                      <tr key={`${row.parent.key}-${row.label}`} className="border-b border-slate-800/60 bg-slate-950/30">
                        <td className="sticky left-0 z-10 bg-slate-950 px-4 py-2 pl-12 text-xs text-slate-400">{row.label}</td>
                        {dre.months.map((month) => (
                          <td key={month.key} className="px-4 py-2 text-right text-xs text-slate-300">
                            {formatValue(row.values[month.key] ?? 0, row.valueType)}
                          </td>
                        ))}
                      </tr>
                    );
                  }
                  const line = row.line;
                  const isSection = line.level === 1;
                  const isOpen = isSection ? openSections.has(line.key) : openDetails.has(line.key);
                  return (
                    <tr key={line.key} className={`border-b border-slate-800/70 ${isSection ? "bg-slate-800/70" : "bg-slate-900/20"}`}>
                      <td className={`sticky left-0 z-10 px-4 py-3 ${isSection ? "bg-slate-800 font-semibold text-slate-100" : "bg-slate-900 pl-8 text-slate-200"}`}>
                        <button
                          type="button"
                          onClick={() => (isSection ? toggleSection(line.key) : toggleDetail(line.key))}
                          className="flex max-w-96 items-center gap-2 text-left"
                        >
                          <Chevron open={isOpen} />
                          <span>{line.label}</span>
                        </button>
                      </td>
                      {dre.months.map((month) => (
                        <td key={month.key} className={`px-4 py-3 text-right ${isSection ? "font-semibold text-slate-100" : "text-slate-200"}`}>
                          <DreValueCell month={month} line={line} savingManualCell={savingManualCell} onSaveManualValue={handleSaveManualValue} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {extraRows.length > 0 ? (
            <section className="space-y-3">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Extras</h3>
                  <p className="text-xs text-slate-500">Informações gerenciais fora do resultado de competência.</p>
                </div>
              </div>

              <div className="dre-no-print grid gap-3 md:hidden">
                {dre.months.map((month) => (
                  <section key={`extra-${month.key}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <h4 className="mb-3 text-sm font-semibold text-slate-100">{month.label}</h4>
                    <div className="space-y-2">
                      {extraRows.map((row) => {
                        if (row.kind === "detail") {
                          return (
                            <div key={`extra-${month.key}-${row.parent.key}-${row.label}`} className="flex justify-between gap-3 rounded bg-slate-950/60 px-3 py-2 pl-8 text-xs">
                              <span className="text-slate-400">{row.label}</span>
                              <span className="font-medium text-slate-200">{formatValue(row.values[month.key] ?? 0, row.valueType)}</span>
                            </div>
                          );
                        }
                        const line = row.line;
                        const isOpen = line.level === 1 ? openSections.has(line.key) : openDetails.has(line.key);
                        return (
                          <button
                            key={`extra-${month.key}-${line.key}`}
                            type="button"
                            onClick={() => (line.level === 1 ? toggleSection(line.key) : toggleDetail(line.key))}
                            className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left ${
                              line.level === 1 ? "bg-slate-800 text-sm font-semibold text-slate-100" : "bg-slate-950/60 pl-6 text-xs text-slate-300"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-1">
                              <Chevron open={isOpen} />
                              <span className="truncate">{line.label}</span>
                            </span>
                            <span className="font-medium">
                              <DreValueCell month={month} line={line} savingManualCell={savingManualCell} onSaveManualValue={handleSaveManualValue} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 md:block">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="sticky left-0 z-10 min-w-72 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Linha extra
                      </th>
                      {dre.months.map((month) => (
                        <th key={month.key} className="min-w-40 px-4 py-3 text-right text-sm font-semibold text-slate-100">
                          {month.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extraRows.map((row) => {
                      if (row.kind === "detail") {
                        return (
                          <tr key={`extra-${row.parent.key}-${row.label}`} className="border-b border-slate-800/60 bg-slate-950/30">
                            <td className="sticky left-0 z-10 bg-slate-950 px-4 py-2 pl-12 text-xs text-slate-400">{row.label}</td>
                            {dre.months.map((month) => (
                              <td key={month.key} className="px-4 py-2 text-right text-xs text-slate-300">
                                {formatValue(row.values[month.key] ?? 0, row.valueType)}
                              </td>
                            ))}
                          </tr>
                        );
                      }
                      const line = row.line;
                      const isSection = line.level === 1;
                      const isOpen = isSection ? openSections.has(line.key) : openDetails.has(line.key);
                      return (
                        <tr key={`extra-${line.key}`} className={`border-b border-slate-800/70 ${isSection ? "bg-slate-800/70" : "bg-slate-900/20"}`}>
                          <td className={`sticky left-0 z-10 px-4 py-3 ${isSection ? "bg-slate-800 font-semibold text-slate-100" : "bg-slate-900 pl-8 text-slate-200"}`}>
                            <button
                              type="button"
                              onClick={() => (isSection ? toggleSection(line.key) : toggleDetail(line.key))}
                              className="flex max-w-96 items-center gap-2 text-left"
                            >
                              <Chevron open={isOpen} />
                              <span>{line.label}</span>
                            </button>
                          </td>
                          {dre.months.map((month) => (
                            <td key={month.key} className={`px-4 py-3 text-right ${isSection ? "font-semibold text-slate-100" : "text-slate-200"}`}>
                              <DreValueCell month={month} line={line} savingManualCell={savingManualCell} onSaveManualValue={handleSaveManualValue} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <DreAnalytics dre={dre} />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">Nenhum dado financeiro encontrado.</div>
      )}

      {showPresentation && dre ? (
        <DrePresentation dre={dre} onClose={() => setShowPresentation(false)} />
      ) : null}
    </section>
  );
}

type MonthActionsProps = {
  month: FinancialDreResponse["months"][number];
  actingMonth: string | null;
  onClose: (month: string) => void;
  onReopen: (month: string) => void;
};

function DreValueCell({
  month,
  line,
  savingManualCell,
  onSaveManualValue,
}: {
  month: FinancialDreResponse["months"][number];
  line: FinancialDreLine;
  savingManualCell: string | null;
  onSaveManualValue: (month: string, line: FinancialDreLine, value: string) => void;
}) {
  const value = line.values[month.key] ?? 0;
  const cellKey = `${month.key}:${line.manualLineId ?? ""}`;
  if (line.isManual && line.manualLineId && month.status !== "closed") {
    return (
      <input
        key={`${cellKey}:${value}`}
        type="number"
        step="0.01"
        defaultValue={String(value)}
        disabled={savingManualCell === cellKey}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onSaveManualValue(month.key, line, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
      />
    );
  }
  return <>{formatValue(value, line.valueType)}</>;
}

function MonthActions({ month, actingMonth, onClose, onReopen }: MonthActionsProps) {
  const busy = actingMonth === month.key;
  if (month.status === "closed") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onReopen(month.key)}
        className="dre-no-print rounded border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
      >
        {busy ? "..." : "Reabrir"}
      </button>
    );
  }
  if (!month.isPast) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onClose(month.key)}
      className="dre-no-print rounded border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
    >
      {busy ? "..." : "Fechar mês"}
    </button>
  );
}
