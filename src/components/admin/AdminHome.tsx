import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { listAircrafts } from "../../lib/aircraftDb";
import { getAdminDashboardSummary, listAdminFlightReports } from "../../lib/adminUsersDb";
import { loadAircraftBaseHours, type AircraftBaseHours } from "../../lib/aircraftHoursProjection";
import { listProgramItemsByModel, listWorkOrders } from "../../lib/maintenanceDb";
import { getPublicSchedule, type PublicScheduleFlight } from "../../lib/scheduleBookingDb";
import { useAuth } from "../../contexts/AuthContext";
import type { AdminDashboardAircraftUtilization, AdminDashboardData } from "../../types/adminDashboard";
import type { AdminFlightReportRow } from "../../types/adminFlightReports";
import type { Aircraft, MaintenanceProgramItem, MaintenanceWorkOrder } from "../../types/admin";
import { Skeleton } from "../ui/Skeleton";

type Props = {
  onOpenReports: () => void;
  onOpenAlerts: () => void;
  onOpenNoTelemetry: () => void;
};

type ProjectionDay = {
  date: string;
  scheduledHours: number;
  projectedHours: number | null;
  maintenanceCode: string | null;
};

type ScheduledAircraftFlight = {
  dateMs: number;
  hours: number;
};

type UpcomingMaintenance = {
  id: string;
  code: string;
  title: string;
  intervalHours: number | null;
  dueAtHours: number | null;
  remainingHours: number | null;
  forecast: string;
};

type AircraftHomeCard = {
  aircraft: Aircraft;
  modelName: string;
  baseHours: AircraftBaseHours | null;
  nextMaintenance: UpcomingMaintenance | null;
  projectionDays: ProjectionDay[];
};

type InstructorMonthSummary = {
  key: string;
  label: string;
  flights: number;
  hours: number;
};

type AdminHomeState = {
  dashboard: AdminDashboardData;
  aircraftCards: AircraftHomeCard[];
};

type AdminHomeCacheEntry = {
  at: number;
  primary: AdminHomeState;
  instructorSummary: InstructorMonthSummary[] | null;
};

type RecurrenceRules = {
  hours: number | null;
  days: number | null;
};

const EMPTY_ALERT_LIMIT = 1;
const FLIGHT_REPORT_PAGE_SIZE = 200;
const ADMIN_HOME_CACHE_TTL_MS = 60_000;
const DONUT_COLORS = ["#34d399", "#38bdf8", "#f59e0b", "#a78bfa", "#fb7185", "#22d3ee", "#84cc16", "#f472b6"];
const adminHomeCache = new Map<string, AdminHomeCacheEntry>();

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateText: string, days: number): string {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function currentMonthPeriod(): { fromDate: string; toDate: string } {
  const today = isoDate(new Date());
  return { fromDate: `${today.slice(0, 8)}01`, toDate: today };
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits })
    : "0";
}

function fmtInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "0";
}

function fmtHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "sem horímetro";
  return `${fmtNumber(value, 1)} h`;
}

function fmtRemainingHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "sem previsão por horas";
  if (value < 0) return `vencida ${fmtNumber(Math.abs(value), 1)} h`;
  return `em ${fmtNumber(value, 1)} h`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "Sem data";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fmtDateMs(value: number): string {
  return fmtDate(new Date(value).toISOString().slice(0, 10));
}

function fmtWeekday(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
}

function aircraftName(aircraft: Aircraft, modelName?: string): string {
  return [aircraft.registration, aircraft.nickname, modelName].filter(Boolean).join(" · ");
}

function normalizeRegistration(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function parseRecurrenceRules(value: string): RecurrenceRules {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return { hours: null, days: null };
    const hoursRule = parsed.find((rule) => (rule as { type?: string })?.type === "hours") as { value?: number } | undefined;
    const calendarRule = parsed.find((rule) => {
      const typed = rule as { type?: string; unit?: string };
      return typed.type === "calendar" && typed.unit === "days";
    }) as { value?: number } | undefined;
    return {
      hours: typeof hoursRule?.value === "number" ? hoursRule.value : null,
      days: typeof calendarRule?.value === "number" ? calendarRule.value : null,
    };
  } catch {
    return { hours: null, days: null };
  }
}

function isExcludedMaintenanceItem(item: MaintenanceProgramItem): boolean {
  const haystack = `${item.code} ${item.title}`.toLowerCase();
  return haystack.includes("transit") || haystack.includes("trânsito") || haystack.includes("diaria") || haystack.includes("diária");
}

function isCompletedMaintenance(order: MaintenanceWorkOrder): boolean {
  return order.work_order_type !== "migration_baseline"
    && order.status !== "canceled"
    && (order.status === "completed" || order.status === "released" || order.aircraft_released);
}

function intervalIncludes(parentInterval: number | null, childInterval: number | null): boolean {
  if (parentInterval == null || childInterval == null || parentInterval < childInterval || childInterval <= 0) return false;
  const ratio = parentInterval / childInterval;
  return Math.abs(ratio - Math.round(ratio)) < 0.0001;
}

function nextDueHours(params: {
  currentHours: number | null;
  interval: number | null;
  encompassingOrders: MaintenanceWorkOrder[];
}): { remaining: number | null; dueAt: number | null } {
  const { currentHours, interval, encompassingOrders } = params;
  if (interval == null || interval <= 0 || currentHours == null) return { remaining: null, dueAt: null };
  const latestPerformed = encompassingOrders
    .filter(isCompletedMaintenance)
    .sort((a, b) => b.aircraft_ttaf - a.aircraft_ttaf)[0];
  const dueAt = latestPerformed
    ? latestPerformed.aircraft_ttaf + interval
    : Math.ceil((currentHours - 0.0001) / interval) * interval;
  return {
    remaining: Number((dueAt - currentHours).toFixed(1)),
    dueAt,
  };
}

function buildNextMaintenance(params: {
  modelItems: MaintenanceProgramItem[];
  aircraftOrders: MaintenanceWorkOrder[];
  currentHours: number | null;
  scheduledFlights: ScheduledAircraftFlight[];
}): UpcomingMaintenance | null {
  const itemsWithRules = params.modelItems
    .filter((item) => !isExcludedMaintenanceItem(item))
    .map((item) => ({ item, rules: parseRecurrenceRules(item.recurrence_rules) }))
    .filter(({ rules }) => rules.hours != null && rules.hours > 0);

  const rows = itemsWithRules
    .map(({ item, rules }) => {
      const encompassingItemIds = new Set(
        itemsWithRules
          .filter(({ rules: candidateRules }) => intervalIncludes(candidateRules.hours, rules.hours))
          .map(({ item: candidate }) => candidate.id),
      );
      const encompassingOrders = params.aircraftOrders.filter(
        (order) => order.maintenance_program_item_id != null && encompassingItemIds.has(order.maintenance_program_item_id),
      );
      const hoursDue = nextDueHours({
        currentHours: params.currentHours,
        interval: rules.hours,
        encompassingOrders,
      });
      return {
        id: item.id,
        code: item.code,
        title: item.title,
        intervalHours: rules.hours,
        dueAtHours: hoursDue.dueAt,
        remainingHours: hoursDue.remaining,
        forecast: predictByScheduledFlights(hoursDue.remaining, params.scheduledFlights),
      };
    })
    .filter((candidate, _, allRows) => !allRows.some((other) =>
      other.id !== candidate.id
      && candidate.dueAtHours != null
      && other.dueAtHours != null
      && Math.abs(other.dueAtHours - candidate.dueAtHours) < 0.05
      && intervalIncludes(other.intervalHours, candidate.intervalHours)
      && (other.intervalHours ?? 0) > (candidate.intervalHours ?? 0),
    ))
    .sort((a, b) => (a.remainingHours ?? Number.POSITIVE_INFINITY) - (b.remainingHours ?? Number.POSITIVE_INFINITY));

  return rows[0] ?? null;
}

function maintenanceTone(item: UpcomingMaintenance | null): string {
  const value = item?.remainingHours;
  if (value == null || !Number.isFinite(value)) return "border-slate-800 bg-slate-950/30 text-slate-300";
  if (value < 5) return "border-red-500/40 bg-red-500/10 text-red-200";
  if (value < 20) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-800 bg-slate-950/30 text-slate-300";
}

function isCancelledScheduleFlight(flight: PublicScheduleFlight): boolean {
  return flight.status === "Cancelado";
}

/**
 * Evento de bloqueio de agenda (usuário de bloqueio ID 139 no SAGA). Não é voo:
 * nunca soma nas projeções de horas/horímetro nem na previsão de manutenção.
 */
function isBlockScheduleFlight(flight: PublicScheduleFlight): boolean {
  const norm = (value?: string | null) => String(value || "").replace(/^saga[:_-]?/i, "").trim();
  if (norm(flight.studentUserId) === "139") return true;
  return /bloqueio/i.test(flight.studentName || "") || /bloqueio/i.test(flight.notes || "");
}

function scheduledAircraftFlights(params: {
  aircraft: Aircraft;
  scheduleFlights: PublicScheduleFlight[];
  nowMs: number;
}): ScheduledAircraftFlight[] {
  const registration = normalizeRegistration(params.aircraft.registration);
  return params.scheduleFlights
    .filter((flight) => !isCancelledScheduleFlight(flight) && !isBlockScheduleFlight(flight))
    .filter((flight) => normalizeRegistration(flight.aircraftIdent) === registration)
    .map((flight) => {
      const dateMs = new Date(`${flight.flightDate}T${flight.startTime || "00:00"}:00`).getTime();
      return {
        dateMs,
        hours: Math.max(0, flight.durationMinutes / 60),
      };
    })
    .filter((flight) => Number.isFinite(flight.dateMs) && flight.dateMs > params.nowMs && flight.hours > 0)
    .sort((a, b) => a.dateMs - b.dateMs);
}

function predictByScheduledFlights(remainingHours: number | null, scheduledFlights: ScheduledAircraftFlight[]): string {
  if (remainingHours == null || !Number.isFinite(remainingHours)) return "sem previsão por horas";
  if (remainingHours <= 0) return "atingida agora";
  let accumulated = 0;
  let lastFlightMs: number | null = null;
  for (let index = 0; index < scheduledFlights.length; index += 1) {
    const flight = scheduledFlights[index]!;
    lastFlightMs = flight.dateMs;
    accumulated += flight.hours;
    if (accumulated >= remainingHours) {
      return `prevista no ${index + 1}º voo agendado (${fmtDateMs(flight.dateMs)})`;
    }
  }
  if (!lastFlightMs) return "sem voos programados";
  const missingHours = Math.max(0, remainingHours - accumulated);
  return `${scheduledFlights.length} voo${scheduledFlights.length === 1 ? "" : "s"} agendado${scheduledFlights.length === 1 ? "" : "s"} até ${fmtDateMs(lastFlightMs)}; faltam ${fmtHours(missingHours)}`;
}

function buildProjectionDays(params: {
  aircraft: Aircraft;
  baseHours: AircraftBaseHours | null;
  scheduleFlights: PublicScheduleFlight[];
  today: string;
  nowMs: number;
}): ProjectionDay[] {
  const registration = normalizeRegistration(params.aircraft.registration);
  const dayHours = new Map<string, number>();
  for (const flight of params.scheduleFlights) {
    if (isCancelledScheduleFlight(flight)) continue;
    if (isBlockScheduleFlight(flight)) continue;
    if (normalizeRegistration(flight.aircraftIdent) !== registration) continue;
    const startMs = new Date(`${flight.flightDate}T${flight.startTime || "00:00"}:00`).getTime();
    if (Number.isFinite(startMs) && startMs < params.nowMs) continue;
    const hours = Math.max(0, flight.durationMinutes / 60);
    dayHours.set(flight.flightDate, (dayHours.get(flight.flightDate) ?? 0) + hours);
  }

  let previous = params.baseHours?.hours ?? null;
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDaysIso(params.today, index);
    const scheduledHours = Number((dayHours.get(date) ?? 0).toFixed(1));
    const previousHours = previous;
    const projectedHours = previousHours == null ? null : Number((previousHours + scheduledHours).toFixed(1));
    const maintenance = projectedHours == null || previousHours == null
      ? null
      : (params.baseHours?.maintenanceDue ?? [])
        .filter((item) => {
          const nextMultiple = (Math.floor(previousHours / item.intervalHours) + 1) * item.intervalHours;
          return nextMultiple <= projectedHours + 1e-9;
        })
        .sort((a, b) => b.intervalHours - a.intervalHours)[0] ?? null;
    previous = projectedHours;
    return {
      date,
      scheduledHours,
      projectedHours,
      maintenanceCode: maintenance?.code ?? null,
    };
  });
}

async function listAllMonthReports(fromDate: string, toDate: string): Promise<AdminFlightReportRow[]> {
  const rows: AdminFlightReportRow[] = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    const page = await listAdminFlightReports({
      fromDate,
      toDate,
      status: "Realizado",
      limit: FLIGHT_REPORT_PAGE_SIZE,
      cursor,
    });
    rows.push(...page.flights);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return rows;
}

function buildInstructorSummary(rows: AdminFlightReportRow[], nicknameByUserId: ReadonlyMap<string, string>): InstructorMonthSummary[] {
  const map = new Map<string, InstructorMonthSummary>();
  for (const row of rows.filter((item) => item.status === "Realizado")) {
    const key = row.instructorUserId || row.instructorName || "sem-instrutor";
    const current = map.get(key) ?? {
      key,
      label: (row.instructorUserId ? nicknameByUserId.get(row.instructorUserId) : null) || row.instructorName || "Sem instrutor",
      flights: 0,
      hours: 0,
    };
    current.flights += 1;
    current.hours += row.hours || 0;
    map.set(key, current);
  }
  return Array.from(map.values())
    .map((row) => ({ ...row, hours: Number(row.hours.toFixed(1)) }))
    .sort((a, b) => b.hours - a.hours || b.flights - a.flights || a.label.localeCompare(b.label));
}

function aircraftSummaryRows(rows: AdminDashboardAircraftUtilization[]): AdminDashboardAircraftUtilization[] {
  return rows
    .filter((row) => row.executedFlights > 0 || row.executedHours > 0)
    .sort((a, b) => b.executedHours - a.executedHours || b.executedFlights - a.executedFlights || a.aircraftIdent.localeCompare(b.aircraftIdent));
}

export function AdminHome(_props: Props) {
  const { user } = useAuth();
  const monthPeriod = useMemo(() => currentMonthPeriod(), []);
  const scheduleEnd = useMemo(() => addDaysIso(monthPeriod.toDate, 179), [monthPeriod.toDate]);
  const [data, setData] = useState<AdminHomeState | null>(null);
  const [instructorSummary, setInstructorSummary] = useState<InstructorMonthSummary[]>([]);
  const [instructorLoading, setInstructorLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstructorSummary = useCallback(async (cacheKey: string, force = false) => {
    const cached = adminHomeCache.get(cacheKey);
    if (!force && cached?.instructorSummary && Date.now() - cached.at < ADMIN_HOME_CACHE_TTL_MS) {
      setInstructorSummary(cached.instructorSummary);
      return;
    }

    setInstructorLoading(true);
    try {
      const reportRows = await listAllMonthReports(monthPeriod.fromDate, monthPeriod.toDate);
      const summary = buildInstructorSummary(reportRows, new Map<string, string>());
      setInstructorSummary(summary);
      const current = adminHomeCache.get(cacheKey);
      if (current) {
        adminHomeCache.set(cacheKey, { ...current, instructorSummary: summary });
      }
    } catch {
      setInstructorSummary([]);
    } finally {
      setInstructorLoading(false);
    }
  }, [monthPeriod.fromDate, monthPeriod.toDate]);

  const load = useCallback(async (force = false) => {
    const schoolId = user?.schoolId || "escola_principal";
    const cacheKey = `${schoolId}|${monthPeriod.fromDate}|${monthPeriod.toDate}|${scheduleEnd}`;
    const cached = adminHomeCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < ADMIN_HOME_CACHE_TTL_MS) {
      setData(cached.primary);
      setInstructorSummary(cached.instructorSummary ?? []);
      setLoading(false);
      setError(null);
      if (!cached.instructorSummary) void loadInstructorSummary(cacheKey);
      return;
    }

    setLoading(true);
    setInstructorSummary([]);
    setError(null);
    try {
      const [dashboard, aircrafts, baseHoursRows, workOrders, schedule] = await Promise.all([
        getAdminDashboardSummary({ ...monthPeriod, upcomingLimit: 1, alertLimit: EMPTY_ALERT_LIMIT }),
        listAircrafts(schoolId),
        loadAircraftBaseHours(schoolId),
        listWorkOrders().catch(() => [] as MaintenanceWorkOrder[]),
        getPublicSchedule(monthPeriod.toDate, scheduleEnd).catch(() => ({ flights: [] as PublicScheduleFlight[] })),
      ]);

      const airplaneRows = aircrafts.filter((aircraft) => aircraft.type === "aviao");
      const uniqueModelIds = [...new Set(airplaneRows.map((aircraft) => aircraft.model_id).filter(Boolean))];
      const programEntries = await Promise.all(
        uniqueModelIds.map(async (modelId) => [modelId, await listProgramItemsByModel(modelId).catch(() => [])] as const),
      );
      const programItemsByModel = new Map(programEntries);
      const baseByRegistration = new Map(baseHoursRows.map((row) => [normalizeRegistration(row.registration), row]));
      const utilizationByRegistration = new Map(dashboard.aircraftUtilization.map((row) => [normalizeRegistration(row.aircraftIdent), row]));
      const workOrdersByAircraftId = new Map<string, MaintenanceWorkOrder[]>();
      for (const order of workOrders) {
        const rows = workOrdersByAircraftId.get(order.aircraft_id) ?? [];
        rows.push(order);
        workOrdersByAircraftId.set(order.aircraft_id, rows);
      }

      const nowMs = Date.now();
      const aircraftCards = airplaneRows
        .map((aircraft) => {
          const baseHours = baseByRegistration.get(normalizeRegistration(aircraft.registration)) ?? null;
          const modelName = utilizationByRegistration.get(normalizeRegistration(aircraft.registration))?.modelName ?? "";
          const modelItems = programItemsByModel.get(aircraft.model_id) ?? [];
          const aircraftOrders = workOrdersByAircraftId.get(aircraft.id) ?? [];
          const aircraftScheduledFlights = scheduledAircraftFlights({ aircraft, scheduleFlights: schedule.flights, nowMs });
          return {
            aircraft,
            modelName,
            baseHours,
            nextMaintenance: buildNextMaintenance({
              modelItems,
              aircraftOrders,
              currentHours: baseHours?.hours ?? null,
              scheduledFlights: aircraftScheduledFlights,
            }),
            projectionDays: buildProjectionDays({
              aircraft,
              baseHours,
              scheduleFlights: schedule.flights,
              today: monthPeriod.toDate,
              nowMs,
            }),
          };
        })
        .sort((a, b) => Number(b.aircraft.active) - Number(a.aircraft.active) || a.aircraft.registration.localeCompare(b.aircraft.registration));

      const primary = {
        dashboard,
        aircraftCards,
      };
      setData(primary);
      adminHomeCache.set(cacheKey, { at: Date.now(), primary, instructorSummary: null });
      void loadInstructorSummary(cacheKey, force);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a Home admin.");
    } finally {
      setLoading(false);
    }
  }, [loadInstructorSummary, monthPeriod, scheduleEnd, user?.schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Home admin</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Dashboard operacional</h2>
            <p className="mt-1 text-sm text-slate-400">
              Horímetros, manutenções e resumo do mês ({fmtDate(monthPeriod.fromDate)} até {fmtDate(monthPeriod.toDate)}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="w-fit rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</p>
      ) : null}

      {loading && !data ? <AdminHomeSkeleton /> : data ? (
        <>
          <AircraftCards cards={data.aircraftCards} />
          <MonthSummary
            aircraftRows={aircraftSummaryRows(data.dashboard.aircraftUtilization)}
            instructorRows={instructorSummary}
            instructorLoading={instructorLoading}
          />
        </>
      ) : null}
    </div>
  );
}

function AdminHomeSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-80 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

function AircraftCards({ cards }: { cards: AircraftHomeCard[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {cards.length ? cards.map((card) => <AircraftCard key={card.aircraft.id} card={card} />) : (
        <EmptyState text="Nenhum avião cadastrado na frota." />
      )}
    </section>
  );
}

function AircraftCard({ card }: { card: AircraftHomeCard }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-100">{aircraftName(card.aircraft, card.modelName)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{card.aircraft.active ? "Ativo" : "Inativo"}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300">Horímetro</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-100">{fmtHours(card.baseHours?.hours)}</p>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border px-3 py-3 ${maintenanceTone(card.nextMaintenance)}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-75">Próxima manutenção</p>
          <p className="text-sm font-semibold">{fmtRemainingHours(card.nextMaintenance?.remainingHours)}</p>
        </div>
        {card.nextMaintenance ? (
          <>
            <p className="mt-1 truncate text-sm">
              {card.nextMaintenance.title}
            </p>
            <p className="mt-1 text-[11px] opacity-80">{card.nextMaintenance.forecast}</p>
          </>
        ) : (
          <p className="mt-1 text-sm opacity-80">Nenhuma manutenção por horas cadastrada.</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Próximos 7 dias</p>
        <div className="mt-2 divide-y divide-slate-800">
          {card.projectionDays.map((day) => (
            <div key={day.date} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 py-1.5 text-sm">
              <span className="text-xs font-medium capitalize text-slate-400">{fmtWeekday(day.date)}</span>
              <span className="text-xs text-slate-500">+{fmtNumber(day.scheduledHours, 1)} h</span>
              <span className={`rounded border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                day.maintenanceCode
                  ? "border-red-500/60 bg-red-500/15 text-red-300"
                  : "border-slate-800 bg-slate-900/70 text-slate-200"
              }`}>
                {day.projectedHours == null ? "—" : `${fmtNumber(day.projectedHours, 1)} h`}
                {day.maintenanceCode ? ` · ${day.maintenanceCode}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function MonthSummary({
  aircraftRows,
  instructorRows,
  instructorLoading,
}: {
  aircraftRows: AdminDashboardAircraftUtilization[];
  instructorRows: InstructorMonthSummary[];
  instructorLoading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-100">Resumo do mês</h3>
        <p className="mt-1 text-sm text-slate-500">Quantidade de voos e horas executadas.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryTable
          title="Por avião"
          emptyText="Nenhum voo realizado por avião neste mês."
          rows={aircraftRows.map((row) => ({
            key: row.aircraftId || row.aircraftIdent,
            label: [row.aircraftIdent || "Sem avião", row.aircraftNickname].filter(Boolean).join(" · "),
            flights: row.executedFlights,
            hours: row.executedHours,
          }))}
        />
        <SummaryTable
          title="Por instrutor"
          emptyText="Nenhum voo realizado por instrutor neste mês."
          rows={instructorRows}
          loading={instructorLoading}
        />
      </div>
    </section>
  );
}

function SummaryTable({
  title,
  rows,
  emptyText,
  loading = false,
}: {
  title: string;
  rows: Array<{ key: string; label: string; flights: number; hours: number }>;
  emptyText: string;
  loading?: boolean;
}) {
  const totalFlights = rows.reduce((sum, row) => sum + row.flights, 0);
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const percent = (value: number, total: number) => (total > 0 ? `${fmtNumber((value / total) * 100, 0)}%` : "0%");
  const donutRows = rows
    .filter((row) => row.hours > 0)
    .map((row) => ({ name: row.label, value: row.hours }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        {rows.length ? <p className="text-xs text-slate-500">{fmtNumber(totalHours, 1)} h</p> : null}
      </div>
      {loading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : rows.length ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
            <div className="relative h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutRows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {donutRows.map((row, index) => (
                      <Cell key={row.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold text-slate-100">{fmtNumber(totalHours, 1)}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">horas</span>
              </div>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {donutRows.slice(0, 8).map((row, index) => (
                <div key={row.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/50 px-2 py-1.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-slate-300">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-200">{percent(row.value, totalHours)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2 text-right">Voos (%)</th>
                  <th className="px-2 py-2 text-right">Horas (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="max-w-0 truncate px-2 py-2 font-medium text-slate-200">{row.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                      {fmtInt(row.flights)} <span className="text-slate-500">({percent(row.flights, totalFlights)})</span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-emerald-300">
                      {fmtNumber(row.hours, 1)} h <span className="font-normal text-slate-500">({percent(row.hours, totalHours)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-500 xl:col-span-2">
      {text}
    </p>
  );
}
