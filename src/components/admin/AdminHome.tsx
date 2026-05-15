import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAdminDashboardSummary } from "../../lib/adminUsersDb";
import { formatDuration } from "../../lib/flightStats";
import { TELEMETRY_ALERT_SEVERITIES, type TelemetryAlertSeverity } from "../../lib/telemetryAlerts";
import type {
  AdminDashboardAircraftForecast,
  AdminDashboardAircraftUtilization,
  AdminDashboardAlert,
  AdminDashboardData,
  AdminDashboardFlight,
} from "../../types/adminDashboard";
import { TelemetriaTab } from "../TelemetriaTab";
import { Skeleton } from "../ui/Skeleton";

type PeriodPresetKey = "all" | "thisWeek" | "thisMonth" | "last30" | "thisYear" | "custom";

type Props = {
  onOpenReports: () => void;
  onOpenAlerts: () => void;
  onOpenNoTelemetry: () => void;
};

const PERIOD_PRESETS: Array<{ key: PeriodPresetKey; label: string }> = [
  { key: "thisMonth", label: "Mês atual" },
  { key: "thisWeek", label: "Semana" },
  { key: "last30", label: "Últimos 30 dias" },
  { key: "thisYear", label: "Ano" },
  { key: "all", label: "Todos" },
  { key: "custom", label: "Custom" },
];

const SEVERITY_ORDER: TelemetryAlertSeverity[] = ["risco", "atencao", "leve"];

const SEVERITY_CLASS: Record<TelemetryAlertSeverity, string> = {
  leve: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  risco: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const AIRCRAFT_TAG_PALETTES = [
  "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "border-violet-500/40 bg-violet-500/10 text-violet-300",
  "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "border-rose-500/40 bg-rose-500/10 text-rose-300",
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  "border-lime-500/40 bg-lime-500/10 text-lime-300",
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText.slice(0, 10);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return isoDate(date);
}

function endOfIsoWeek(dateText: string): string {
  const date = new Date(`${startOfIsoWeek(dateText)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return isoDate(date);
}

function periodForPreset(key: PeriodPresetKey): { fromDate: string; toDate: string } {
  const today = new Date();
  const todayIso = isoDate(today);
  if (key === "all" || key === "custom") return { fromDate: "", toDate: "" };
  if (key === "thisWeek") return { fromDate: startOfIsoWeek(todayIso), toDate: endOfIsoWeek(todayIso) };
  if (key === "thisMonth") return { fromDate: `${todayIso.slice(0, 8)}01`, toDate: todayIso };
  if (key === "last30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { fromDate: isoDate(from), toDate: todayIso };
  }
  return { fromDate: `${todayIso.slice(0, 4)}-01-01`, toDate: todayIso };
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : "0";
}

function fmtInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "0";
}

function fmtCurrency(value: number | null | undefined): string {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "Sem data";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fmtDateTimeKey(value: string | null | undefined): string {
  if (!value) return "Sem previsão";
  const [date, time] = value.split("T");
  return `${fmtDate(date)}${time ? ` ${time.slice(0, 5)}` : ""}`;
}

function fmtTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "--:--";
}

function fmtDayMonth(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function flightDurationLabel(flight: AdminDashboardFlight): string {
  if (flight.durationSec != null && flight.durationSec > 0) return formatDuration(flight.durationSec);
  if (flight.hours > 0) return `${fmtNumber(flight.hours, 1)} h`;
  return "—";
}

function aircraftTagClass(ident: string | null | undefined): string {
  const key = (ident || "sem").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return AIRCRAFT_TAG_PALETTES[hash % AIRCRAFT_TAG_PALETTES.length];
}

function severityLabel(value: TelemetryAlertSeverity): string {
  return TELEMETRY_ALERT_SEVERITIES.find((severity) => severity.key === value)?.label ?? value;
}

function aircraftLabel(row: { aircraftIdent: string | null; aircraftNickname?: string | null }): string {
  return [row.aircraftIdent || "Sem avião", row.aircraftNickname].filter(Boolean).join(" · ");
}

export function AdminHome({ onOpenReports, onOpenAlerts, onOpenNoTelemetry }: Props) {
  const initialPeriod = useMemo(() => periodForPreset("thisMonth"), []);
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>("thisMonth");
  const [fromDate, setFromDate] = useState(initialPeriod.fromDate);
  const [toDate, setToDate] = useState(initialPeriod.toDate);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AdminDashboardAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAdminDashboardSummary({ fromDate, toDate, upcomingLimit: 12, alertLimit: 6 });
      setDashboard(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  function setPresetPeriod(key: PeriodPresetKey) {
    setPeriodPreset(key);
    if (key === "custom") return;
    const next = periodForPreset(key);
    setFromDate(next.fromDate);
    setToDate(next.toDate);
  }

  const periodLabel = fromDate || toDate ? `${fromDate || "início"} até ${toDate || "hoje"}` : "Todos os períodos";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Home admin</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Dashboard operacional</h2>
            <p className="mt-1 text-sm text-slate-400">
              Visão rápida de voos, alertas, frota e receita. Período: {periodLabel}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodPreset}
              onChange={(event) => setPresetPeriod(event.target.value as PeriodPresetKey)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              {PERIOD_PRESETS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPeriodPreset("custom");
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPeriodPreset("custom");
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</p>
      ) : null}

      {loading && !dashboard ? <DashboardSkeleton /> : dashboard ? (
        <>
          <SummaryGrid dashboard={dashboard} onOpenNoTelemetry={onOpenNoTelemetry} />
          <div className="grid gap-4 xl:grid-cols-12">
            <UpcomingFlightsBoard flights={dashboard.upcomingFlights.items} onOpenReports={onOpenReports} />
            <AlertsBoard dashboard={dashboard} onOpenAlerts={onOpenAlerts} onOpenAlert={setSelectedAlert} />
            <AircraftForecastBoard rows={dashboard.aircraftForecast} />
            <AircraftUtilizationBoard rows={dashboard.aircraftUtilization} />
          </div>
          {selectedAlert ? <TelemetryAlertFlightModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} /> : null}
        </>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl xl:col-span-4" />
        <Skeleton className="h-80 rounded-2xl xl:col-span-8" />
      </div>
    </div>
  );
}

function SummaryGrid({
  dashboard,
  onOpenNoTelemetry,
}: {
  dashboard: AdminDashboardData;
  onOpenNoTelemetry: () => void;
}) {
  const { summary, finance } = dashboard;
  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <MetricCard label="Voos executados" value={fmtInt(summary.executedFlights)} detail={`${fmtInt(summary.landings)} pousos no período`} />
      <MetricCard label="Horas voadas" value={`${fmtNumber(summary.executedHours, 1)} h`} detail="Executadas no período" />
      <MetricCard label="Voos futuros" value={fmtInt(summary.futureFlights)} detail={`${fmtNumber(summary.plannedHours, 1)} h planejadas`} />
      <MetricCard label="Sem instrutor" value={fmtInt(summary.futureFlightsWithoutInstructor)} detail="Voos futuros sem INVA" tone="amber" />
      <MetricCard label="Alunos ativos" value={fmtInt(summary.studentsActive)} detail={`${fmtInt(summary.instructorsActive)} instrutores`} />
      <MetricCard label="Receita" value={fmtCurrency(finance.amountPaid)} detail={`${fmtNumber(finance.purchasedHours, 1)} h compradas`} />
      <MetricCard label="Alertas críticos" value={fmtInt(summary.alerts.risco)} detail={`${fmtInt(summary.alerts.atencao)} atenção · ${fmtInt(summary.alerts.leve)} leves`} tone="rose" />
      <MetricCard
        label="Sem telemetria"
        value={fmtInt(summary.flightsWithoutTelemetry)}
        detail={`${fmtInt(summary.telemetryFlights)} voos com telemetria`}
        tone="amber"
        onClick={onOpenNoTelemetry}
      />
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "emerald",
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "emerald" | "amber" | "rose";
  onClick?: () => void;
}) {
  const toneClass = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-emerald-300";
  const body = (
    <>
      <p className="line-clamp-2 text-[10px] font-medium uppercase leading-snug tracking-wide text-slate-500 sm:text-[11px] sm:tracking-wider">
        {label}
      </p>
      <p className={`mt-2 break-words text-lg font-semibold leading-tight sm:text-xl lg:text-2xl ${toneClass}`}>{value}</p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400 sm:text-xs">{detail}</p>
    </>
  );
  const className =
    "flex min-h-[7.25rem] min-w-0 flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:min-h-[7.75rem] sm:p-4";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer text-left transition hover:border-amber-500/40 hover:bg-slate-900/80`}
      >
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function UpcomingFlightsBoard({ flights, onOpenReports }: { flights: AdminDashboardFlight[]; onOpenReports: () => void }) {
  return (
    <Board className="xl:col-span-4" title="Próximos voos" subtitle="Agenda global dos próximos voos futuros." actionLabel="Ver relatórios" onAction={onOpenReports}>
      {flights.length ? (
        <div className="divide-y divide-slate-800">
          {flights.map((flight) => (
            <div key={flight.id} className="grid gap-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-center">
              <div className="shrink-0">
                <p className="text-sm font-semibold capitalize text-slate-100">{fmtDayMonth(flight.flightDate)}</p>
                <p className="text-xs font-medium text-white">{fmtTime(flight.startTime)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{flightDurationLabel(flight)}</p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex max-w-full shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${aircraftTagClass(flight.aircraftIdent)}`}
                  >
                    {flight.aircraftIdent || "Sem avião"}
                  </span>
                  {flight.aircraftNickname ? (
                    <span className="truncate text-xs text-slate-500">{flight.aircraftNickname}</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {flight.studentName || "Aluno não informado"} · {flight.instructorName || "Instrutor não informado"}
                </p>
                {flight.modelName ? <p className="truncate text-[11px] text-slate-600">{flight.modelName}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Nenhum voo futuro encontrado." />
      )}
    </Board>
  );
}

function AlertsBoard({
  dashboard,
  onOpenAlerts,
  onOpenAlert,
}: {
  dashboard: AdminDashboardData;
  onOpenAlerts: () => void;
  onOpenAlert: (alert: AdminDashboardAlert) => void;
}) {
  return (
    <Board className="xl:col-span-8" title="Alertas recentes" subtitle="Últimos disparos separados por gravidade." actionLabel="Ver alertas" onAction={onOpenAlerts}>
      <div className="grid gap-3 lg:grid-cols-3">
        {SEVERITY_ORDER.map((severity) => {
          const bucket = dashboard.alertsBySeverity[severity];
          return (
            <div key={severity} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[severity]}`}>
                  {severityLabel(severity)}
                </span>
                <span className="text-xs text-slate-500">{fmtInt(bucket.total)} total</span>
              </div>
              <div className="space-y-2">
                {bucket.items.length ? bucket.items.map((alert) => <AlertItem key={alert.id} alert={alert} onOpen={() => onOpenAlert(alert)} />) : <EmptyState text="Sem alertas." compact />}
              </div>
            </div>
          );
        })}
      </div>
    </Board>
  );
}

function AlertItem({ alert, onOpen }: { alert: AdminDashboardAlert; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-left transition hover:border-sky-500/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
    >
      <span className="block truncate text-xs font-semibold text-slate-100">{alert.ruleName || "Regra sem nome"}</span>
      <span className="mt-1 block truncate text-[11px] text-slate-500">{aircraftLabel(alert)} · {fmtDate(alert.flightDate)}</span>
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-slate-400">{alert.studentName || "Aluno não informado"}</span>
        <span className="shrink-0 text-[11px] font-medium text-sky-300">Telemetria</span>
      </span>
    </button>
  );
}

function AircraftForecastBoard({ rows }: { rows: AdminDashboardAircraftForecast[] }) {
  const [mode, setMode] = useState<"hours" | "flights">("hours");
  const visibleRows = rows.filter((row) => row.active || row.hoursNext7Days > 0).slice(0, 12);
  const valueFor = (row: AdminDashboardAircraftForecast, window: "today" | "2d" | "5d" | "7d") => {
    if (mode === "flights") {
      const value =
        window === "today"
          ? row.futureFlightsToday
          : window === "2d"
            ? row.futureFlightsNext2Days
            : window === "5d"
              ? row.futureFlightsNext5Days
              : row.futureFlights7Days;
      return fmtInt(value);
    }
    const value =
      window === "today"
        ? row.hoursToday
        : window === "2d"
          ? row.hoursNext2Days
          : window === "5d"
            ? row.hoursNext5Days
            : row.hoursNext7Days;
    return fmtNumber(value, 1);
  };
  return (
    <Board
      className="xl:col-span-6"
      title="Previsão por avião"
      subtitle={`Janelas acumuladas de hoje até os próximos 7 dias em ${mode === "hours" ? "horas" : "voos"}.`}
      action={
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("hours")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === "hours" ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400 hover:bg-slate-800"}`}
          >
            Horas
          </button>
          <button
            type="button"
            onClick={() => setMode("flights")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === "flights" ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400 hover:bg-slate-800"}`}
          >
            Voos
          </button>
        </div>
      }
    >
      {visibleRows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-2 py-2">Avião</th>
                <th className="px-2 py-2 text-right">Hoje</th>
                <th className="px-2 py-2 text-right">2d</th>
                <th className="px-2 py-2 text-right">5d</th>
                <th className="px-2 py-2 text-right">7d</th>
                <th className="px-2 py-2">Próximo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleRows.map((row) => (
                <tr key={row.aircraftIdent}>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-100">{aircraftLabel(row)}</p>
                    <p className="text-xs text-slate-500">{row.modelName || "Sem modelo"}</p>
                  </td>
                  <td className="px-2 py-3 text-right font-semibold text-slate-200">{valueFor(row, "today")}</td>
                  <td className="px-2 py-3 text-right font-semibold text-slate-200">{valueFor(row, "2d")}</td>
                  <td className="px-2 py-3 text-right font-semibold text-slate-200">{valueFor(row, "5d")}</td>
                  <td className="px-2 py-3 text-right font-semibold text-emerald-300">{valueFor(row, "7d")}</td>
                  <td className="px-2 py-3 text-xs text-slate-500">{fmtDateTimeKey(row.nextFlightAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Sem previsão de uso nos próximos 7 dias." />
      )}
    </Board>
  );
}

function AircraftUtilizationBoard({ rows }: { rows: AdminDashboardAircraftUtilization[] }) {
  const visibleRows = rows
    .filter((row) => row.executedFlights > 0 || row.futureFlights > 0 || row.alertCounts.risco > 0 || row.alertCounts.atencao > 0)
    .slice(0, 10);
  return (
    <Board className="xl:col-span-6" title="Utilização e risco" subtitle="Resumo por avião no período filtrado.">
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <div key={row.aircraftIdent} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{aircraftLabel(row)}</p>
                  <p className="truncate text-xs text-slate-500">{row.modelName || "Sem modelo"}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">{fmtNumber(row.executedHours, 1)} h</p>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <MiniMetric label="Voos" value={fmtInt(row.executedFlights)} />
                <MiniMetric label="Pousos" value={fmtInt(row.landings)} />
                <MiniMetric label="Duros" value={fmtInt(row.hardLandingCount)} />
                <MiniMetric label="Risco" value={fmtInt(row.alertCounts.risco)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Sem utilização no período selecionado." />
      )}
    </Board>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/70 px-2 py-2">
      <p className="text-xs font-semibold text-slate-200">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}

function Board({
  title,
  subtitle,
  actionLabel,
  onAction,
  action,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/40 p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {action ?? (actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            {actionLabel}
          </button>
        ) : null)}
      </div>
      {children}
    </section>
  );
}

function TelemetryAlertFlightModal({ alert, onClose }: { alert: AdminDashboardAlert; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[alert.severity]}`}>
                {severityLabel(alert.severity)}
              </span>
              <h3 className="truncate text-sm font-semibold text-slate-100">{alert.ruleName || "Regra sem nome"}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {alert.studentName || "Aluno não informado"} · {alert.instructorName || "Sem INVA"} · {aircraftLabel(alert)} · {fmtDate(alert.flightDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TelemetriaTab flightId={alert.flightId} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <p className={`rounded-lg border border-slate-800 bg-slate-950/40 text-center text-sm text-slate-500 ${compact ? "px-2 py-3" : "px-4 py-8"}`}>
      {text}
    </p>
  );
}
