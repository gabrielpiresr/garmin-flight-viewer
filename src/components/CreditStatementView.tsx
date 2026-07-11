import type { ReactNode } from "react";
import type { StudentCreditPurchase, StudentCreditStatement } from "../types/credits";

type Props = {
  statement: StudentCreditStatement;
  title?: string;
  description?: string;
  showHeading?: boolean;
  compact?: boolean;
  renderPurchaseActions?: (purchase: StudentCreditPurchase) => ReactNode;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatFlightSchedule(flightDate: string | null, flightStartTime: string | null): string | null {
  if (!flightDate) return null;
  const dateLabel = formatDate(flightDate);
  if (!flightStartTime) return dateLabel;
  return `${dateLabel} às ${flightStartTime}`;
}

function formatHours(value: number): string {
  return `${Number(value || 0).toFixed(1)}h`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function MetricCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="border-l border-slate-700/70 pl-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClassName ?? "text-slate-100"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function CreditStatementView({
  statement,
  title = "Créditos",
  description = "Saldo consolidado, compras e saídas por voo.",
  showHeading = true,
  compact = false,
  renderPurchaseActions,
}: Props) {
  const hasCredits = statement.purchases.length > 0 || statement.flightDebits.length > 0 || statement.adjustments.length > 0;
  const totalPenaltyHours = statement.totals.penaltyHours ?? statement.adjustments.reduce(
    (acc, adj) => acc + Math.abs(Math.min(0, adj.hours)),
    0,
  );
  const studentBalanceHours = statement.totals.balanceHours
    ?? Number((statement.totals.purchasedHours - statement.totals.consumedHours - totalPenaltyHours).toFixed(2));
  const weekdayOnlyTotal = statement.totals.weekdayOnlyAvailableHours ?? 0;
  const anyDayTotal = statement.totals.anyDayAvailableHours ?? 0;
  const weekdayOnlyForHint =
    anyDayTotal <= 0.001
      ? Math.min(weekdayOnlyTotal, Math.max(0, studentBalanceHours))
      : weekdayOnlyTotal;
  const weekdayApplicableHours = Number((weekdayOnlyForHint + anyDayTotal).toFixed(1));
  const weekdayOnlyPurchased = statement.purchases
    .filter((purchase) => purchase.weekdayOnly)
    .reduce((acc, purchase) => acc + purchase.hours, 0);
  const showWeekdayPools = weekdayOnlyTotal > 0.001 || weekdayOnlyPurchased > 0.001;
  const weekdayPoolHint = (() => {
    if (!showWeekdayPools) return undefined;
    if (weekdayOnlyTotal <= 0.001 && weekdayOnlyPurchased > 0.001) {
      return `0h só seg–sex restantes (${formatHours(weekdayOnlyPurchased)} compradas seg–sex já alocadas)`;
    }
    if (weekdayOnlyForHint <= 0.001) return undefined;
    if (Math.abs(weekdayApplicableHours - studentBalanceHours) <= 0.15) {
      if (anyDayTotal < -0.001) {
        return `Na semana: ${formatHours(weekdayApplicableHours)} (${formatHours(weekdayOnlyForHint)} seg–sex + ${formatHours(anyDayTotal)} pool livre)`;
      }
      return `dos quais ${formatHours(weekdayOnlyForHint)} só seg–sex`;
    }
    return `dos quais ${formatHours(weekdayOnlyForHint)} só seg–sex`;
  })();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showHeading ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
        ) : (
          <div />
        )}
        <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-400">
          Atualizado em {formatDate(statement.generatedAt)}
        </span>
      </div>

      <div className={`grid gap-4 border-y border-slate-800 py-3 ${compact ? "md:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
        <MetricCard
          label="Saldo disponível"
          value={formatHours(studentBalanceHours)}
          hint={weekdayPoolHint}
          valueClassName={studentBalanceHours < 0 ? "text-red-300" : "text-emerald-300"}
        />
        <MetricCard label="Horas compradas" value={formatHours(statement.totals.purchasedHours)} />
        <MetricCard label="Horas consumidas" value={formatHours(statement.totals.consumedHours)} />
        <MetricCard label="Horas vencidas" value={formatHours(statement.totals.expiredHours)} />
        <MetricCard label="Valor pago" value={formatCurrency(statement.totals.amountPaid)} />
      </div>

      {statement.totals.unallocatedFlightHours > 0.001 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {formatHours(statement.totals.unallocatedFlightHours)} de voos ainda não foram cobertos por compras (saldo devedor).
        </p>
      ) : null}

      {showWeekdayPools && anyDayTotal < -0.001 ? (
        <p className="rounded-lg border border-slate-700/80 bg-slate-950/30 px-3 py-2 text-xs text-slate-400">
          Há {formatHours(Math.abs(anyDayTotal))} de dívida no pool &quot;qualquer dia&quot;. Em dias úteis o saldo líquido é{" "}
          {formatHours(weekdayApplicableHours)} (restrito seg–sex + pool livre). No fim de semana só vale o pool livre (
          {formatHours(anyDayTotal)}).
        </p>
      ) : null}

      {statement.summaries.length > 0 ? (
        <>
        <div className="grid gap-2 md:hidden">
          {statement.summaries.map((summary) => (
            <article key={summary.aircraftModelId} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-semibold text-slate-100">{summary.aircraftModelName}</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Compradas {formatHours(summary.purchasedHours)} · usadas {formatHours(summary.consumedHours)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-lg border px-2 py-1 text-sm font-semibold ${
                  summary.availableHours < 0 ? "border-red-500/30 text-red-300" : "border-emerald-500/30 text-emerald-300"
                }`}>
                  {formatHours(summary.availableHours)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {showWeekdayPools ? (
                  <div>
                    <p className="text-slate-500">seg-sex</p>
                    <p className="font-semibold text-sky-300">{formatHours(summary.weekdayOnlyAvailableHours)}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-slate-500">vencidas</p>
                  <p className="font-semibold text-slate-300">{formatHours(summary.expiredHours)}</p>
                </div>
                <div>
                  <p className="text-slate-500">pendentes</p>
                  <p className="font-semibold text-amber-300">{formatHours(summary.unallocatedFlightHours)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-slate-800 md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Disponível</th>
                {showWeekdayPools ? <th className="px-3 py-2 font-medium">seg–sex</th> : null}
                <th className="px-3 py-2 font-medium">Compradas</th>
                <th className="px-3 py-2 font-medium">Saídas</th>
                <th className="px-3 py-2 font-medium">Vencidas</th>
                <th className="px-3 py-2 font-medium">Pendentes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
          {statement.summaries.map((summary) => (
            <tr key={summary.aircraftModelId} className="text-slate-300">
              <td className="px-3 py-2 font-medium text-slate-100">{summary.aircraftModelName}</td>
              <td className="px-3 py-2 text-emerald-300">{formatHours(summary.availableHours)}</td>
              {showWeekdayPools ? (
                <td className="px-3 py-2 text-sky-300">{formatHours(summary.weekdayOnlyAvailableHours)}</td>
              ) : null}
              <td className="px-3 py-2">{formatHours(summary.purchasedHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.consumedHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.expiredHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.unallocatedFlightHours)}</td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}

      {!hasCredits ? (
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Nenhum crédito ou saída encontrada para este aluno.
        </p>
      ) : (
        <div className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Extrato de compras</h4>
            <div className="mt-2 rounded-lg border border-slate-800 md:overflow-x-auto">
              {statement.purchases.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Nenhuma compra registrada.</p>
              ) : (
                <>
                <div className="divide-y divide-slate-800 md:hidden">
                  {statement.purchases.map((purchase) => {
                    const payment = purchase.paymentInstallments
                      ? `${purchase.paymentMethod} (${purchase.paymentInstallments}x)`
                      : purchase.paymentMethod || "Forma não informada";
                    return (
                      <article key={purchase.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{purchase.aircraftModelName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{formatDate(purchase.purchaseDate)} · {payment}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-emerald-300">{formatHours(purchase.hours)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>{formatCurrency(purchase.amountPaid)}</span>
                          <span>Validade {formatDate(purchase.expiresAt)}</span>
                          {purchase.isNight ? <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 text-[10px] text-indigo-300">Noturno</span> : null}
                          {purchase.weekdayOnly ? <span className="rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] text-sky-300">seg-sex</span> : null}
                        </div>
                        {renderPurchaseActions ? <div className="mt-2 flex flex-wrap gap-2">{renderPurchaseActions(purchase)}</div> : null}
                      </article>
                    );
                  })}
                </div>
                <table className="hidden w-full min-w-[900px] text-left text-sm md:table">
                  <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Modelo</th>
                      <th className="px-3 py-2 font-medium">Pagamento</th>
                      <th className="px-3 py-2 font-medium">Valor</th>
                      <th className="px-3 py-2 font-medium">Horas</th>
                      <th className="px-3 py-2 font-medium">Validade</th>
                      {renderPurchaseActions ? <th className="px-3 py-2 font-medium">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {statement.purchases.map((purchase) => {
                      const payment = purchase.paymentInstallments
                        ? `${purchase.paymentMethod} (${purchase.paymentInstallments}x)`
                        : purchase.paymentMethod || "Forma não informada";
                      return (
                        <tr key={purchase.id} className="text-slate-300">
                          <td className="px-3 py-2">{formatDate(purchase.purchaseDate)}</td>
                          <td className="px-3 py-2 font-medium text-slate-100">
                            {purchase.aircraftModelName}
                            {purchase.isNight && (
                              <span className="ml-2 rounded bg-indigo-900/60 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">Noturno</span>
                            )}
                            {purchase.weekdayOnly && (
                              <span className="ml-2 rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">seg-sex</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{payment}</td>
                          <td className="px-3 py-2">{formatCurrency(purchase.amountPaid)}</td>
                          <td className="px-3 py-2">{formatHours(purchase.hours)}</td>
                          <td className="px-3 py-2">{formatDate(purchase.expiresAt)}</td>
                          {renderPurchaseActions ? (
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">{renderPurchaseActions(purchase)}</div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200">Extrato de saídas (voos)</h4>
            <div className="mt-2 rounded-lg border border-slate-800 md:overflow-x-auto">
              {statement.flightDebits.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Nenhuma saída por voo encontrada.</p>
              ) : (
                <>
                <div className="divide-y divide-slate-800 md:hidden">
                  {statement.flightDebits.map((debit) => (
                    <article key={debit.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{debit.aircraftIdent || "Aeronave não informada"}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatDate(debit.flightDate)}</p>
                        </div>
                        <span className="shrink-0 rounded-lg border border-red-500/30 px-2 py-1 text-sm font-semibold text-red-300">
                          -{formatHours(debit.hours)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {debit.aircraftModelName} · {debit.isNight ? "Noturno" : "Diurno"}
                      </p>
                    </article>
                  ))}
                </div>
                <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
                  <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Aeronave</th>
                      <th className="px-3 py-2 font-medium">Período</th>
                      <th className="px-3 py-2 font-medium">Modelo</th>
                      <th className="px-3 py-2 font-medium">Horas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {statement.flightDebits.map((debit) => (
                      <tr key={debit.id} className="text-slate-300">
                        <td className="px-3 py-2">{formatDate(debit.flightDate)}</td>
                        <td className="px-3 py-2">{debit.aircraftIdent || "Aeronave não informada"}</td>
                        <td className="px-3 py-2">{debit.isNight ? "Noturno" : "Diurno"}</td>
                        <td className="px-3 py-2">{debit.aircraftModelName}</td>
                        <td className="px-3 py-2">{formatHours(debit.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {statement.adjustments.length > 0 ? (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-rose-200">Ajustes e multas</h3>
          <div className="space-y-2">
            {statement.adjustments.map((adjustment) => {
              const flightSchedule = formatFlightSchedule(adjustment.flightDate, adjustment.flightStartTime);
              return (
              <div key={adjustment.id} className="rounded-lg border border-rose-500/20 bg-slate-950/30 px-3 py-2.5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-slate-200">{adjustment.reason || "Multa de cancelamento"}</p>
                    <p className="text-slate-400">
                      {adjustment.aircraftIdent || "Aeronave não informada"}
                      {adjustment.percentage > 0 ? ` · multa de ${adjustment.percentage}%` : ""}
                    </p>
                    {flightSchedule ? (
                      <p className="text-slate-500">
                        Voo cancelado: <span className="text-slate-300">{flightSchedule}</span>
                      </p>
                    ) : null}
                    <p className="text-slate-500">
                      Cancelamento em: <span className="text-slate-300">{formatDateTime(adjustment.occurredAt)}</span>
                    </p>
                  </div>
                  <strong className="shrink-0 text-rose-300">{Math.abs(adjustment.hours).toFixed(2)}h</strong>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
