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
  const studentBalanceHours = statement.totals.purchasedHours - statement.totals.consumedHours;

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
          valueClassName={studentBalanceHours < 0 ? "text-red-300" : "text-emerald-300"}
        />
        <MetricCard label="Horas compradas" value={formatHours(statement.totals.purchasedHours)} />
        <MetricCard label="Horas consumidas" value={formatHours(statement.totals.consumedHours)} />
        <MetricCard label="Horas vencidas" value={formatHours(statement.totals.expiredHours)} />
        <MetricCard label="Valor pago" value={formatCurrency(statement.totals.amountPaid)} />
      </div>

      {statement.totals.unallocatedFlightHours > 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {formatHours(statement.totals.unallocatedFlightHours)} de voos ainda não encontraram crédito válido do mesmo modelo.
        </p>
      ) : null}

      {statement.summaries.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Disponível</th>
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
              <td className="px-3 py-2">{formatHours(summary.purchasedHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.consumedHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.expiredHours)}</td>
              <td className="px-3 py-2">{formatHours(summary.unallocatedFlightHours)}</td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!hasCredits ? (
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Nenhum crédito ou saída encontrada para este aluno.
        </p>
      ) : (
        <div className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Extrato de compras</h4>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              {statement.purchases.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Nenhuma compra registrada.</p>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
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
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200">Extrato de saídas (voos)</h4>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              {statement.flightDebits.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Nenhuma saída por voo encontrada.</p>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Aeronave</th>
                      <th className="px-3 py-2 font-medium">Período</th>
                      <th className="px-3 py-2 font-medium">Modelo</th>
                      <th className="px-3 py-2 font-medium">Horas</th>
                      <th className="px-3 py-2 font-medium">Debitado</th>
                      <th className="px-3 py-2 font-medium">Pendente</th>
                      <th className="px-3 py-2 font-medium">Status</th>
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
                        <td className="px-3 py-2">{formatHours(debit.allocatedHours)}</td>
                        <td className="px-3 py-2">{formatHours(debit.unallocatedHours)}</td>
                        <td className={debit.unallocatedHours > 0 ? "px-3 py-2 text-amber-300" : "px-3 py-2 text-sky-300"}>
                          {debit.unallocatedHours > 0 ? "Parcial" : "Debitado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {statement.adjustments.length > 0 ? (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-rose-200">Ajustes e multas</h3>
          <div className="space-y-2">
            {statement.adjustments.map((adjustment) => (
              <div key={adjustment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/20 bg-slate-950/30 px-3 py-2 text-xs">
                <div>
                  <p className="font-medium text-slate-200">{adjustment.reason || "Multa de cancelamento"}</p>
                  <p className="text-slate-500">{adjustment.aircraftIdent} · {adjustment.percentage}%</p>
                </div>
                <strong className="text-rose-300">{adjustment.hours.toFixed(2)}h</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
