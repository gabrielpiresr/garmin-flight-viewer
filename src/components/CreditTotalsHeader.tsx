function formatHours(value: number): string {
  return `${Number(value || 0).toFixed(1)}h`;
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="border-l border-slate-700/70 pl-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClassName ?? "text-slate-100"}`}>{value}</p>
    </div>
  );
}

type Props = {
  balanceHours: number;
  purchasedHours: number;
  consumedHours: number;
  expiredHours: number;
  studentLabel?: string;
};

export function CreditTotalsHeader({
  balanceHours,
  purchasedHours,
  consumedHours,
  expiredHours,
  studentLabel,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
      {studentLabel ? (
        <p className="mb-3 text-sm font-medium text-slate-200">{studentLabel}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Saldo disponível"
          value={formatHours(balanceHours)}
          valueClassName={balanceHours < 0 ? "text-red-300" : "text-emerald-300"}
        />
        <MetricCard label="Horas compradas" value={formatHours(purchasedHours)} />
        <MetricCard label="Horas consumidas" value={formatHours(consumedHours)} />
        <MetricCard label="Horas vencidas" value={formatHours(expiredHours)} />
      </div>
    </section>
  );
}
