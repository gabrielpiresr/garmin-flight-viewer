import type { ReactNode } from "react";
import type { StudentCreditPurchase, StudentCreditStatement } from "../types/credits";

type Props = {
  statement: StudentCreditStatement;
  title?: string;
  description?: string;
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

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function CreditStatementView({
  statement,
  title = "Créditos",
  description = "Saldo consolidado, compras e saídas por voo.",
  compact = false,
  renderPurchaseActions,
}: Props) {
  const hasCredits = statement.purchases.length > 0 || statement.flightDebits.length > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-400">
          Atualizado em {formatDate(statement.generatedAt)}
        </span>
      </div>

      <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
        <MetricCard label="Saldo disponível" value={formatHours(statement.totals.availableHours)} />
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
        <div className="grid gap-3 lg:grid-cols-2">
          {statement.summaries.map((summary) => (
            <div key={summary.aircraftModelId} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-100">{summary.aircraftModelName}</h4>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  {formatHours(summary.availableHours)} disponíveis
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
                <span>Compradas: {formatHours(summary.purchasedHours)}</span>
                <span>Saídas: {formatHours(summary.consumedHours)}</span>
                <span>Vencidas: {formatHours(summary.expiredHours)}</span>
                <span>Pendentes: {formatHours(summary.unallocatedFlightHours)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!hasCredits ? (
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-500">
          Nenhum crédito ou saída encontrada para este aluno.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
            <h4 className="text-sm font-semibold text-slate-200">Extrato de compras</h4>
            <div className="mt-3 space-y-2">
              {statement.purchases.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma compra registrada.</p>
              ) : (
                statement.purchases.map((purchase) => {
                  const expired = purchase.expiresAt < statement.generatedAt;
                  return (
                    <div key={purchase.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">{purchase.aircraftModelName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDate(purchase.purchaseDate)} · {purchase.paymentMethod || "Forma nao informada"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                            expired ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
                          }`}>
                            {expired ? "Vencido" : "Ativo"}
                          </span>
                          {renderPurchaseActions ? renderPurchaseActions(purchase) : null}
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-3">
                        <span>Horas: {formatHours(purchase.hours)}</span>
                        <span>Valor: {formatCurrency(purchase.amountPaid)}</span>
                        <span>Validade: {formatDate(purchase.expiresAt)}</span>
                      </div>
                      {purchase.notes ? <p className="mt-2 text-xs text-slate-500">{purchase.notes}</p> : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
            <h4 className="text-sm font-semibold text-slate-200">Extrato de saídas (voos)</h4>
            <div className="mt-3 space-y-2">
              {statement.flightDebits.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma saída por voo encontrada.</p>
              ) : (
                statement.flightDebits.map((debit) => (
                  <div key={debit.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{debit.flightName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(debit.flightDate)} · {debit.aircraftIdent || "Aeronave nao informada"}
                        </p>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        debit.unallocatedHours > 0 ? "bg-amber-500/15 text-amber-300" : "bg-sky-500/15 text-sky-300"
                      }`}>
                        {debit.unallocatedHours > 0 ? "Parcial" : "Debitado"}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-3">
                      <span>Modelo: {debit.aircraftModelName}</span>
                      <span>Debitado: {formatHours(debit.allocatedHours)}</span>
                      <span>Pendente: {formatHours(debit.unallocatedHours)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
