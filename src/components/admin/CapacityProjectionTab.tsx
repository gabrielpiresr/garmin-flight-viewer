import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadFleetMaintenanceContext, type FleetMaintenanceContext } from "../../lib/aircraftHoursProjection";
import {
  aircraftMonthTrace,
  buildCapacityProjection,
  formatHours,
  monthStudentHours,
  studentTrace,
  suggestHoursLookup,
  suggestIntensityBands,
  type ClassifiedStudent,
  type MonthProjection,
} from "../../lib/capacityProjection";
import {
  clearCapacityStudentOverride,
  listCapacityStudentOverrides,
  saveCapacityProjectionSettings,
  saveCapacityStudentOverride,
  settingsFromRules,
} from "../../lib/capacityProjectionDb";
import { getCapacityProjectionInputs } from "../../lib/adminUsersDb";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { getSchoolRules } from "../../lib/schoolRulesDb";
import {
  CALENDAR_LABELS,
  CALENDAR_MODES,
  COURSE_CODES,
  COURSE_HALVES,
  COURSE_LABELS,
  HALF_LABELS,
  INTENSITY_LABELS,
  INTENSITY_LEVELS,
  VERDICT_LABELS,
  cloneHoursLookup,
  lookupMonthlyHours,
  type CalendarMode,
  type CapacityAircraftInput,
  type CapacityProjectionSettings,
  type CapacityStudentOverride,
  type CourseCode,
  type HypotheticalIntake,
  type IntensityLevel,
  type TraceBlock,
  type VerdictKind,
} from "../../types/capacityProjection";
import type { MaintenanceWorkOrder } from "../../types/admin";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toAircraftInputs(ctx: FleetMaintenanceContext): CapacityAircraftInput[] {
  const open = ctx.workOrders.filter((order) => order.status === "open" || order.status === "in_progress");
  return ctx.aircrafts.map((aircraft) => {
    const base = ctx.baseHours.find((row) => row.registration === aircraft.registration);
    const wo = open.find((order) => order.aircraft_id === aircraft.id && !order.aircraft_released);
    return {
      id: aircraft.id,
      registration: aircraft.registration,
      type: aircraft.type,
      active: aircraft.active,
      currentHours: base?.hours ?? null,
      maintenanceItems: (base?.maintenanceDue ?? []).map((item) => ({
        code: item.code,
        title: item.title,
        intervalHours: item.intervalHours,
        downtimeDays: item.downtimeDays,
      })),
      groundedNow: Boolean(wo),
      groundedReason: wo ? workOrderLabel(wo) : null,
      groundedDaysFromToday: 3,
    };
  });
}

function workOrderLabel(order: MaintenanceWorkOrder): string {
  return order.discrepancy_reported || order.work_order_number || "OS aberta";
}

const VERDICT_CLASS: Record<VerdictKind, string> = {
  yes: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  tight: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  no: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

function balanceClass(value: number, slack: number): string {
  if (value < 0) return "text-rose-300";
  if (value < slack) return "text-amber-300";
  return "text-emerald-300";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100";

type StudentSortKey = "name" | "remaining" | "course" | "calendar" | "intensity" | "rate" | "status";
type MonthChartView = "supply-demand" | "balance" | "balance-split" | "demand-split" | "supply-split" | "grounded";

function compareStudents(a: ClassifiedStudent, b: ClassifiedStudent, key: StudentSortKey, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (left: string, right: string) => left.localeCompare(right, "pt-BR", { sensitivity: "base" });
  let result = 0;
  if (key === "name") result = cmp(a.input.name, b.input.name);
  else if (key === "remaining") result = (a.remainingHours ?? Number.POSITIVE_INFINITY) - (b.remainingHours ?? Number.POSITIVE_INFINITY);
  else if (key === "course") result = cmp(a.course ?? "", b.course ?? "");
  else if (key === "calendar") result = cmp(a.calendar, b.calendar);
  else if (key === "intensity") result = cmp(a.intensity, b.intensity);
  else if (key === "rate") result = a.monthlyRate - b.monthlyRate;
  else result = Number(a.included) - Number(b.included) || cmp(a.exclusionLabel ?? "", b.exclusionLabel ?? "");
  if (result === 0) result = cmp(a.input.name, b.input.name);
  return result * sign;
}

export function CapacityProjectionTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CapacityProjectionSettings | null>(null);
  const [inputs, setInputs] = useState<Awaited<ReturnType<typeof getCapacityProjectionInputs>> | null>(null);
  const [aircraft, setAircraft] = useState<CapacityAircraftInput[]>([]);
  const [overrides, setOverrides] = useState<CapacityStudentOverride[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hypoCount, setHypoCount] = useState(0);
  const [studentFilter, setStudentFilter] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "included" | "excluded" | "no-course">("all");
  const [studentCourseFilter, setStudentCourseFilter] = useState<"all" | CourseCode | "none">("all");
  const [studentSort, setStudentSort] = useState<{ key: StudentSortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthChartView, setMonthChartView] = useState<MonthChartView>("supply-demand");
  const [trace, setTrace] = useState<TraceBlock | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rules = await getSchoolRules();
      const nextSettings = settingsFromRules(rules);
      const [payload, fleet, nextOverrides] = await Promise.all([
        getCapacityProjectionInputs({ today: todayIso(), lookbackDays: nextSettings.lookbackDays }),
        loadFleetMaintenanceContext(DEFAULT_SCHOOL_ID),
        listCapacityStudentOverrides(),
      ]);
      setSettings(nextSettings);
      setInputs(payload);
      setAircraft(toAircraftInputs(fleet));
      setOverrides(nextOverrides);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar projeções.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hypothetical: HypotheticalIntake | null = useMemo(() => {
    if (!settings || hypoCount <= 0) return null;
    return {
      count: hypoCount,
      calendar: settings.intakeTemplate.calendar,
      intensity: settings.intakeTemplate.intensity,
      course: settings.intakeTemplate.course,
      startMonth: todayIso().slice(0, 7),
    };
  }, [settings, hypoCount]);

  const result = useMemo(() => {
    if (!settings || !inputs) return null;
    return buildCapacityProjection({
      today: inputs.today,
      settings,
      students: inputs.students,
      aircraft,
      overrides,
      actuals: inputs.actuals,
      hypothetical,
    });
  }, [settings, inputs, aircraft, overrides, hypothetical]);

  async function persistSettings(next: CapacityProjectionSettings) {
    setSettings(next);
    setSavingSettings(true);
    try {
      const saved = await saveCapacityProjectionSettings(next);
      setSettings(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function patchOverride(student: ClassifiedStudent, patch: Partial<CapacityStudentOverride>) {
    const current = overrides.find((item) => item.studentUserId === student.input.userId);
    const next = {
      studentUserId: student.input.userId,
      calendarMode: patch.calendarMode === undefined ? (current?.calendarMode ?? null) : patch.calendarMode,
      intensity: patch.intensity === undefined ? (current?.intensity ?? null) : patch.intensity,
      courseCode: patch.courseCode === undefined ? (current?.courseCode ?? null) : patch.courseCode,
      hoursAdjustment: patch.hoursAdjustment === undefined ? (current?.hoursAdjustment ?? 0) : patch.hoursAdjustment,
      excluded: patch.excluded ?? current?.excluded ?? false,
      pausedUntil: patch.pausedUntil === undefined ? (current?.pausedUntil ?? null) : patch.pausedUntil,
    };
    const saved = await saveCapacityStudentOverride(next);
    if (saved) {
      setOverrides((prev) => {
        const without = prev.filter((item) => item.studentUserId !== student.input.userId);
        return [...without, saved];
      });
    }
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">Carregando oferta, alunos e manutenções…</div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void load()}>Tentar de novo</button>
      </div>
    );
  }
  if (!result || !settings) return null;

  const included = result.students.filter((student) => student.included);
  const excluded = result.students.filter((student) => !student.included);
  const query = studentFilter.trim().toLowerCase();
  const visibleStudents = [...result.students]
    .filter((student) => {
      if (query && !`${student.input.name} ${student.input.email}`.toLowerCase().includes(query)) return false;
      if (studentStatusFilter === "included" && !student.included) return false;
      if (studentStatusFilter === "excluded" && student.included) return false;
      if (studentStatusFilter === "no-course" && student.course) return false;
      if (studentCourseFilter === "none" && student.course) return false;
      if (studentCourseFilter !== "all" && studentCourseFilter !== "none" && student.course !== studentCourseFilter) return false;
      return true;
    })
    .sort((a, b) => compareStudents(a, b, studentSort.key, studentSort.dir));
  const activeMonth = result.months.find((month) => month.month === selectedMonth) ?? result.months[0] ?? null;

  return (
    <div className="space-y-4">
      <VerdictCard
        resultKind={result.verdict.kind}
        headline={result.verdict.headline}
        bottleneck={result.verdict.bottleneck}
        weekdayFit={result.verdict.weekdayFit}
        weekendFit={result.verdict.weekendFit}
        lines={result.verdict.trace.lines.slice(0, 5).map((line) => line.formula ? `${line.label}: ${line.value} (${line.formula})` : `${line.label}: ${line.value}`)}
        onOpenTrace={() => setTrace(result.verdict.trace)}
        hypoCount={hypoCount}
        onHypoCount={setHypoCount}
      />

      <MonthMetricChart months={result.months} view={monthChartView} onView={setMonthChartView} />

      <MonthGrid
        months={result.months}
        selectedMonth={activeMonth?.month ?? null}
        onSelectMonth={setSelectedMonth}
      />

      {activeMonth ? (
        <MonthXray
          month={activeMonth}
          onOpenTrace={() => setTrace(activeMonth.trace)}
          onOpenAircraft={(registration) => {
            const item = result.aircraft.find((row) => row.aircraft.registration === registration);
            if (item) setTrace(aircraftMonthTrace(item, activeMonth.month, settings));
          }}
        />
      ) : null}

      <AircraftTable
        aircraft={result.aircraft}
        months={result.months}
        selectedMonth={activeMonth?.month}
        onOpenTrace={setTrace}
        settings={settings}
      />

      <StudentsPanel
        students={visibleStudents}
        includedCount={included.length}
        excludedCount={excluded.length}
        filter={studentFilter}
        onFilter={setStudentFilter}
        statusFilter={studentStatusFilter}
        onStatusFilter={setStudentStatusFilter}
        courseFilter={studentCourseFilter}
        onCourseFilter={setStudentCourseFilter}
        sort={studentSort}
        onSort={setStudentSort}
        onOpenTrace={(student) => setTrace(studentTrace(student, settings))}
        onPatch={patchOverride}
        onReset={async (student) => {
          await clearCapacityStudentOverride(student.input.userId);
          setOverrides((prev) => prev.filter((item) => item.studentUserId !== student.input.userId));
        }}
      />

      <SettingsPanel
        settings={settings}
        onChange={setSettings}
        onSave={() => void persistSettings(settings)}
        saving={savingSettings}
        onSuggestLookup={() => {
          const lookup = suggestHoursLookup(result.students);
          const bands = suggestIntensityBands(result.students.map((student) => student.hoursPerMonthWindow));
          setSettings({
            ...settings,
            hoursLookup: lookup,
            hoursLookupSource: "suggested",
            intensityLowMaxHoursPerMonth: bands.lowMax,
            intensityHighMinHoursPerMonth: bands.highMin,
          });
        }}
      />

      {trace ? <TraceDrawer trace={trace} onClose={() => setTrace(null)} /> : null}
    </div>
  );
}

function VerdictCard(props: {
  resultKind: VerdictKind;
  headline: string;
  bottleneck: string | null;
  weekdayFit: number;
  weekendFit: number;
  lines: string[];
  onOpenTrace: () => void;
  hypoCount: number;
  onHypoCount: (value: number) => void;
}) {
  return (
    <section className={`rounded-2xl border p-5 ${VERDICT_CLASS[props.resultKind]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Posso aceitar mais alunos?</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight">{VERDICT_LABELS[props.resultKind]}</h2>
          <p className="mt-2 max-w-2xl text-sm opacity-90">{props.headline}</p>
        </div>
        <button type="button" onClick={props.onOpenTrace} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
          Ver conta
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-wide opacity-70">Cabem no FDS</p>
          <p className="text-2xl font-bold">{props.weekendFit}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-wide opacity-70">Cabem na semana</p>
          <p className="text-2xl font-bold">{props.weekdayFit}</p>
        </div>
        <label className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-wide opacity-70">E se eu matricular N este mês?</p>
          <input
            type="number"
            min={0}
            max={30}
            value={props.hypoCount}
            onChange={(event) => props.onHypoCount(Math.max(0, Number(event.target.value) || 0))}
            className="mt-1 w-24 rounded-md border border-white/20 bg-black/30 px-2 py-1 text-lg font-semibold"
          />
        </label>
      </div>
      {props.bottleneck ? <p className="mt-3 text-sm">Gargalo: {props.bottleneck}</p> : null}
      <ul className="mt-3 space-y-1 text-xs opacity-90">
        {props.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}

function MonthMetricChart(props: {
  months: MonthProjection[];
  view: MonthChartView;
  onView: (view: MonthChartView) => void;
}) {
  const data = props.months.map((month) => ({
    label: month.label,
    supply: Number((month.supply.weekday + month.supply.weekend).toFixed(1)),
    demand: Number((month.demand.weekday + month.demand.weekend).toFixed(1)),
    balance: Number((month.balance.weekday + month.balance.weekend).toFixed(1)),
    supplyWeekday: month.supply.weekday,
    supplyWeekend: month.supply.weekend,
    demandWeekday: month.demand.weekday,
    demandWeekend: month.demand.weekend,
    balanceWeekday: month.balance.weekday,
    balanceWeekend: month.balance.weekend,
    grounded: month.aircraft.reduce((sum, item) => sum + item.groundedWeekdayDays + item.groundedWeekendDays, 0),
  }));
  const series: Array<{ key: string; label: string; color: string; type: "bar" | "line" }> =
    props.view === "supply-demand" ? [
      { key: "supply", label: "Oferta", color: "#38bdf8", type: "bar" },
      { key: "demand", label: "Demanda", color: "#a78bfa", type: "line" },
    ] : props.view === "balance" ? [
      { key: "balance", label: "Saldo", color: "#34d399", type: "bar" },
    ] : props.view === "balance-split" ? [
      { key: "balanceWeekday", label: "Saldo semana", color: "#38bdf8", type: "bar" },
      { key: "balanceWeekend", label: "Saldo FDS", color: "#a78bfa", type: "bar" },
    ] : props.view === "demand-split" ? [
      { key: "demandWeekday", label: "Demanda semana", color: "#38bdf8", type: "bar" },
      { key: "demandWeekend", label: "Demanda FDS", color: "#a78bfa", type: "bar" },
    ] : props.view === "supply-split" ? [
      { key: "supplyWeekday", label: "Oferta semana", color: "#38bdf8", type: "bar" },
      { key: "supplyWeekend", label: "Oferta FDS", color: "#a78bfa", type: "bar" },
    ] : [
      { key: "grounded", label: "Dias parados", color: "#fb7185", type: "bar" },
    ];
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Série mês a mês</h3>
          <p className="text-xs text-slate-500">Escolha a métrica. O raio-X do mês continua abaixo, na tabela.</p>
        </div>
        <select
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
          value={props.view}
          onChange={(event) => props.onView(event.target.value as MonthChartView)}
        >
          <option value="supply-demand">Oferta × demanda</option>
          <option value="balance">Saldo total</option>
          <option value="balance-split">Saldo semana vs FDS</option>
          <option value="demand-split">Demanda semana vs FDS</option>
          <option value="supply-split">Oferta semana vs FDS</option>
          <option value="grounded">Dias parados</option>
        </select>
      </header>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
              formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}${props.view === "grounded" ? "d" : "h"}`, String(name)]}
            />
            <Legend />
            {series.map((item) => item.type === "line" ? (
              <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} />
            ) : (
              <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[4, 4, 0, 0]} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MonthGrid(props: {
  months: MonthProjection[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-100">Oferta × demanda — 12 meses</h3>
        <p className="text-xs text-slate-500">Clique no mês para abrir o raio-X. Colunas totais = semana + FDS.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 font-medium">Oferta tot.</th>
              <th className="px-3 py-2 font-medium">Demanda tot.</th>
              <th className="px-3 py-2 font-medium">Saldo tot.</th>
              <th className="px-3 py-2 font-medium">Oferta sem.</th>
              <th className="px-3 py-2 font-medium">Demanda sem.</th>
              <th className="px-3 py-2 font-medium">Saldo sem.</th>
              <th className="px-3 py-2 font-medium">Oferta FDS</th>
              <th className="px-3 py-2 font-medium">Demanda FDS</th>
              <th className="px-3 py-2 font-medium">Saldo FDS</th>
            </tr>
          </thead>
          <tbody>
            {props.months.map((month) => {
              const supply = month.supply.weekday + month.supply.weekend;
              const demand = month.demand.weekday + month.demand.weekend;
              const balance = month.balance.weekday + month.balance.weekend;
              const slack = month.slack.weekday + month.slack.weekend;
              const selected = month.month === props.selectedMonth;
              return (
                <tr
                  key={month.month}
                  className={`cursor-pointer border-t border-slate-800/80 hover:bg-slate-800/40 ${selected ? "bg-violet-500/10" : ""}`}
                  onClick={() => props.onSelectMonth(month.month)}
                >
                  <td className="px-3 py-2 font-semibold text-slate-200">{month.label}{month.isCurrent ? " · atual" : ""}</td>
                  <td className="px-3 py-2 font-semibold text-slate-100">{formatHours(supply)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-100">{formatHours(demand)}</td>
                  <td className={`px-3 py-2 font-semibold ${balanceClass(balance, slack)}`}>{formatHours(balance)}</td>
                  <td className="px-3 py-2 text-slate-400">{formatHours(month.supply.weekday)}</td>
                  <td className="px-3 py-2 text-slate-400">{formatHours(month.demand.weekday)}</td>
                  <td className={`px-3 py-2 ${balanceClass(month.balance.weekday, month.slack.weekday)}`}>{formatHours(month.balance.weekday)}</td>
                  <td className="px-3 py-2 text-slate-400">{formatHours(month.supply.weekend)}</td>
                  <td className="px-3 py-2 text-slate-400">{formatHours(month.demand.weekend)}</td>
                  <td className={`px-3 py-2 ${balanceClass(month.balance.weekend, month.slack.weekend)}`}>{formatHours(month.balance.weekend)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AircraftTable(props: {
  aircraft: ReturnType<typeof buildCapacityProjection>["aircraft"];
  months: MonthProjection[];
  selectedMonth?: string | null;
  onOpenTrace: (trace: TraceBlock) => void;
  settings: CapacityProjectionSettings;
}) {
  const currentMonth = props.selectedMonth ?? props.months[0]?.month;
  const label = props.months.find((month) => month.month === currentMonth)?.label ?? "este mês";
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-100">Aviões em {label}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Aeronave</th>
              <th className="px-3 py-2 font-medium">TTAF</th>
              <th className="px-3 py-2 font-medium">Horas sem.</th>
              <th className="px-3 py-2 font-medium">Horas FDS</th>
              <th className="px-3 py-2 font-medium">Dias parado</th>
              <th className="px-3 py-2 font-medium">Manutenções</th>
            </tr>
          </thead>
          <tbody>
            {props.aircraft.map((item) => {
              const row = item.months.find((month) => month.month === currentMonth);
              return (
                <tr
                  key={item.aircraft.id}
                  className="cursor-pointer border-t border-slate-800/80 hover:bg-slate-800/40"
                  onClick={() => props.onOpenTrace(currentMonth ? aircraftMonthTrace(item, currentMonth, props.settings) : item.trace)}
                >
                  <td className="px-3 py-2 font-semibold text-slate-200">{item.aircraft.registration}</td>
                  <td className="px-3 py-2 text-slate-300">{item.aircraft.currentHours == null ? "—" : formatHours(item.aircraft.currentHours)}</td>
                  <td className="px-3 py-2 text-slate-300">{row ? formatHours(row.weekdayHours) : "—"}</td>
                  <td className="px-3 py-2 text-slate-300">{row ? formatHours(row.weekendHours) : "—"}</td>
                  <td className="px-3 py-2 text-slate-300">{row ? row.groundedWeekdayDays + row.groundedWeekendDays : 0}</td>
                  <td className="px-3 py-2 text-slate-400">{row?.maintenances.map((m) => `${m.code} ${m.count}× (${m.days}d)`).join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthXray(props: {
  month: MonthProjection;
  onOpenTrace: () => void;
  onOpenAircraft: (registration: string) => void;
}) {
  const month = props.month;
  const students = monthStudentHours(month);
  const chartRows = students.slice(0, 15).map((row) => ({
    ...row,
    shortName: row.name.split(" ")[0] + (row.name.split(" ").length > 1 ? ` ${row.name.split(" ")[1]?.[0] ?? ""}.` : ""),
  }));
  const supply = month.supply.weekday + month.supply.weekend;
  const demand = month.demand.weekday + month.demand.weekend;
  const balance = month.balance.weekday + month.balance.weekend;
  const groundedDays = month.aircraft.reduce((sum, item) => sum + item.groundedWeekdayDays + item.groundedWeekendDays, 0);
  const events = month.aircraft.flatMap((item) => item.events.map((event) => ({ ...event, registration: item.registration })));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Raio-X do mês</p>
          <h3 className="text-lg font-semibold text-slate-100">{month.label}</h3>
          <p className="text-xs text-slate-500">Horas por aluno (maior → menor) e paradas de manutenção.</p>
        </div>
        <button type="button" onClick={props.onOpenTrace} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          Ver conta
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <XrayStat label="Oferta" value={formatHours(supply)} hint={`${formatHours(month.supply.weekday)} sem · ${formatHours(month.supply.weekend)} FDS`} />
        <XrayStat label="Demanda" value={formatHours(demand)} hint={`${students.length} aluno(s)`} />
        <XrayStat label="Saldo" value={formatHours(balance)} hint={balance < 0 ? "negativo" : "folga no mês"} tone={balance < 0 ? "bad" : balance < month.slack.weekday + month.slack.weekend ? "warn" : "ok"} />
        <XrayStat label="Dias parados" value={String(groundedDays)} hint={`${events.length} inspeção(ões)`} />
        <XrayStat label="Alunos no mês" value={String(students.length)} hint="quem consome horas" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Horas por aluno</h4>
          {chartRows.length ? (
            <div style={{ height: Math.min(420, 28 * chartRows.length + 48) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} unit="h" />
                  <YAxis type="category" dataKey="shortName" width={88} stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                    formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}h`, name === "weekdayHours" ? "Semana" : "FDS"]}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? "")}
                  />
                  <Legend formatter={(value) => (value === "weekdayHours" ? "Semana" : "FDS")} />
                  <Bar dataKey="weekdayHours" stackId="h" fill="#38bdf8" name="weekdayHours" />
                  <Bar dataKey="weekendHours" stackId="h" fill="#a78bfa" name="weekendHours" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum aluno consome horas neste mês.</p>
          )}
          {students.length > chartRows.length ? (
            <p className="mt-2 text-[11px] text-slate-500">Gráfico: 15 maiores. Tabela abaixo tem todos.</p>
          ) : null}
          {students.length ? (
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-950 text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">#</th>
                    <th className="py-1.5 pr-2 font-medium">Aluno</th>
                    <th className="py-1.5 pr-2 font-medium">Total</th>
                    <th className="py-1.5 pr-2 font-medium">Sem.</th>
                    <th className="py-1.5 font-medium">FDS</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row, index) => (
                    <tr key={row.studentUserId} className="border-t border-slate-800/80">
                      <td className="py-1.5 pr-2 text-slate-500">{index + 1}</td>
                      <td className="py-1.5 pr-2 text-slate-200">{row.name}{row.virtual ? " · virtual" : ""}</td>
                      <td className="py-1.5 pr-2 font-semibold text-slate-100">{formatHours(row.hours)}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{formatHours(row.weekdayHours)}</td>
                      <td className="py-1.5 text-slate-400">{formatHours(row.weekendHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Manutenção e dias parados</h4>
          <div className="space-y-2">
            {month.aircraft.map((item) => (
              <button
                key={item.registration}
                type="button"
                onClick={() => props.onOpenAircraft(item.registration)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left hover:border-slate-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{item.registration}</p>
                  <p className="text-xs text-slate-400">{formatHours(item.weekdayHours + item.weekendHours)}</p>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {item.groundedWeekdayDays + item.groundedWeekendDays}d parado · {item.weekdayDays - item.groundedWeekdayDays}d sem. · {item.weekendDays - item.groundedWeekendDays}d FDS
                </p>
                {item.events.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {item.events.map((event) => (
                      <li key={`${event.code}-${event.hitDate}`}>
                        {event.code} em {event.hitDate.slice(8)}/{event.hitDate.slice(5, 7)} · TTAF {formatHours(event.hitHours)} · {event.days}d parado
                        {event.extraWeekendDays ? ` (${event.shopDays}d oficina + ${event.extraWeekendDays}d FDS)` : ` (${event.shopDays}d oficina)`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Sem inspeção neste mês.</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function XrayStat(props: { label: string; value: string; hint: string; tone?: "ok" | "warn" | "bad" }) {
  const tone = props.tone === "bad" ? "text-rose-300" : props.tone === "warn" ? "text-amber-300" : props.tone === "ok" ? "text-emerald-300" : "text-slate-100";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{props.value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{props.hint}</p>
    </div>
  );
}

function SortButton(props: {
  label: string;
  column: StudentSortKey;
  sort: { key: StudentSortKey; dir: "asc" | "desc" };
  onSort: (next: { key: StudentSortKey; dir: "asc" | "desc" }) => void;
}) {
  const active = props.sort.key === props.column;
  return (
    <button
      type="button"
      className={`font-medium ${active ? "text-slate-100" : "text-slate-400"}`}
      onClick={() => props.onSort({
        key: props.column,
        dir: active && props.sort.dir === "asc" ? "desc" : "asc",
      })}
    >
      {props.label}{active ? (props.sort.dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function HoursAdjustmentInput(props: {
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value || ""));
  useEffect(() => {
    setDraft(props.value ? String(props.value) : "");
  }, [props.value]);
  return (
    <input
      type="number"
      step={0.5}
      disabled={props.disabled}
      className={inputClass}
      value={draft}
      placeholder="0"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = eventNumber(draft);
        setDraft(next ? String(next) : "");
        if (next !== props.value) props.onCommit(next);
      }}
    />
  );
}

function eventNumber(value: string): number {
  if (value.trim() === "" || value.trim() === "-") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StudentsPanel(props: {
  students: ClassifiedStudent[];
  includedCount: number;
  excludedCount: number;
  filter: string;
  onFilter: (value: string) => void;
  statusFilter: "all" | "included" | "excluded" | "no-course";
  onStatusFilter: (value: "all" | "included" | "excluded" | "no-course") => void;
  courseFilter: "all" | CourseCode | "none";
  onCourseFilter: (value: "all" | CourseCode | "none") => void;
  sort: { key: StudentSortKey; dir: "asc" | "desc" };
  onSort: (next: { key: StudentSortKey; dir: "asc" | "desc" }) => void;
  onOpenTrace: (student: ClassifiedStudent) => void;
  onPatch: (student: ClassifiedStudent, patch: Partial<CapacityStudentOverride>) => Promise<void>;
  onReset: (student: ClassifiedStudent) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Alunos na projeção</h3>
          <p className="text-xs text-slate-500">{props.includedCount} entram · {props.excludedCount} ficam de fora · sem curso não entra; Hobbie é manual</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" value={props.statusFilter} onChange={(event) => props.onStatusFilter(event.target.value as typeof props.statusFilter)}>
            <option value="all">Todos os status</option>
            <option value="included">Na projeção</option>
            <option value="excluded">Fora</option>
            <option value="no-course">Sem curso</option>
          </select>
          <select className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" value={props.courseFilter} onChange={(event) => props.onCourseFilter(event.target.value as typeof props.courseFilter)}>
            <option value="all">Todos os cursos</option>
            <option value="none">Sem curso</option>
            {COURSE_CODES.map((code) => <option key={code} value={code}>{COURSE_LABELS[code]}</option>)}
          </select>
          <input
            value={props.filter}
            onChange={(event) => props.onFilter(event.target.value)}
            placeholder="Buscar aluno"
            className="w-56 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
          />
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              <th className="px-3 py-2"><SortButton label="Aluno" column="name" sort={props.sort} onSort={props.onSort} /></th>
              <th className="px-3 py-2"><SortButton label="Calendário" column="calendar" sort={props.sort} onSort={props.onSort} /></th>
              <th className="px-3 py-2"><SortButton label="Intensidade" column="intensity" sort={props.sort} onSort={props.onSort} /></th>
              <th className="px-3 py-2"><SortButton label="Curso" column="course" sort={props.sort} onSort={props.onSort} /></th>
              <th className="px-3 py-2"><SortButton label="Restante" column="remaining" sort={props.sort} onSort={props.onSort} /></th>
              <th className="px-3 py-2 font-medium">Ajuste de horas</th>
              <th className="px-3 py-2"><SortButton label="Status" column="status" sort={props.sort} onSort={props.onSort} /></th>
            </tr>
          </thead>
          <tbody>
            {props.students.map((student) => (
              <tr key={student.input.userId} className="border-t border-slate-800/80">
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-semibold text-slate-200 hover:underline" onClick={() => props.onOpenTrace(student)}>
                    {student.input.name}
                  </button>
                  <p className="text-[11px] text-slate-500">{student.overridden ? "ajuste manual" : "sugestão"}{student.course === "HOBBY" ? " · hobbie" : ""}</p>
                </td>
                <td className="px-3 py-2">
                  <select className={inputClass} value={student.calendar} onChange={(event) => void props.onPatch(student, { calendarMode: event.target.value as CalendarMode })}>
                    {CALENDAR_MODES.map((mode) => <option key={mode} value={mode}>{CALENDAR_LABELS[mode]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className={inputClass} value={student.intensity} onChange={(event) => void props.onPatch(student, { intensity: event.target.value as IntensityLevel })}>
                    {INTENSITY_LEVELS.map((level) => <option key={level} value={level}>{INTENSITY_LABELS[level]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className={inputClass} value={student.course ?? ""} onChange={(event) => void props.onPatch(student, { courseCode: (event.target.value || "NONE") as CourseCode | "NONE" })}>
                    <option value="">Sem curso</option>
                    {COURSE_CODES.map((code) => <option key={code} value={code}>{COURSE_LABELS[code]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {student.course === "HOBBY" ? "sem teto" : student.remainingHours == null ? "—" : formatHours(student.remainingHours)}
                  {student.rawRemainingHours != null ? (
                    <p className="text-[11px] text-slate-500">
                      {formatHours(student.flownForCourse)} neste curso
                      {student.hoursAdjustment ? ` · bruto ${formatHours(student.rawRemainingHours)}` : ""}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <HoursAdjustmentInput
                    value={student.hoursAdjustment}
                    disabled={student.course === "HOBBY" || student.rawRemainingHours == null}
                    onCommit={(value) => void props.onPatch(student, { hoursAdjustment: value })}
                  />
                </td>
                <td className="px-3 py-2">
                  {student.included ? (
                    <button type="button" className="text-rose-300 hover:underline" onClick={() => void props.onPatch(student, { excluded: true })}>Excluir</button>
                  ) : (
                    <span className="text-slate-400">{student.exclusionLabel}</span>
                  )}
                  {student.overridden || student.exclusionReason === "override-excluded" ? (
                    <button type="button" className="ml-2 text-cyan-300 hover:underline" onClick={() => void props.onReset(student)}>Voltar à sugestão</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsPanel(props: {
  settings: CapacityProjectionSettings;
  onChange: (next: CapacityProjectionSettings) => void;
  onSave: () => void;
  saving: boolean;
  onSuggestLookup: () => void;
}) {
  const s = props.settings;
  function patch(partial: Partial<CapacityProjectionSettings>) {
    props.onChange({ ...s, ...partial });
  }
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Base de cálculo</h3>
          <p className="text-xs text-slate-500">Ajuste as premissas. A grade e o veredito atualizam na hora; salve para persistir.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={props.onSuggestLookup} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Regenerar sugestão da tabela</button>
          <button type="button" onClick={props.onSave} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">{props.saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Dias sem voar = abandono">
          <input type="number" className={inputClass} value={s.abandonmentDays} onChange={(e) => patch({ abandonmentDays: Number(e.target.value) })} />
        </Field>
        <Field label="Folga (%)">
          <input type="number" className={inputClass} value={s.slackPercent} onChange={(e) => patch({ slackPercent: Number(e.target.value) })} />
        </Field>
        <Field label="Conversão PP → PC">
          <input type="number" step={0.05} min={0} max={1} className={inputClass} value={s.conversionPpToPc} onChange={(e) => patch({ conversionPpToPc: Number(e.target.value) })} />
        </Field>
        <Field label="Conversão PC → INVA">
          <input type="number" step={0.05} min={0} max={1} className={inputClass} value={s.conversionPcToInva} onChange={(e) => patch({ conversionPcToInva: Number(e.target.value) })} />
        </Field>
        <Field label="Média h/dia (semana)">
          <input type="number" step={0.25} className={inputClass} value={s.weekdayAvgHoursPerDay} onChange={(e) => patch({ weekdayAvgHoursPerDay: Number(e.target.value) })} />
        </Field>
        <Field label="Média h/dia (FDS)">
          <input type="number" step={0.25} className={inputClass} value={s.weekendAvgHoursPerDay} onChange={(e) => patch({ weekendAvgHoursPerDay: Number(e.target.value) })} />
        </Field>
        <Field label="Carga PP (h)">
          <input type="number" className={inputClass} value={s.courseHours.PP} onChange={(e) => patch({ courseHours: { ...s.courseHours, PP: Number(e.target.value) } })} />
        </Field>
        <Field label="Carga PC (h)">
          <input type="number" className={inputClass} value={s.courseHours.PC} onChange={(e) => patch({ courseHours: { ...s.courseHours, PC: Number(e.target.value) } })} />
        </Field>
        <Field label="Carga INVA (h)">
          <input type="number" className={inputClass} value={s.courseHours.INVA} onChange={(e) => patch({ courseHours: { ...s.courseHours, INVA: Number(e.target.value) } })} />
        </Field>
        <Field label="Aluno-tipo (calendário)">
          <select className={inputClass} value={s.intakeTemplate.calendar} onChange={(e) => patch({ intakeTemplate: { ...s.intakeTemplate, calendar: e.target.value as CalendarMode } })}>
            {CALENDAR_MODES.map((mode) => <option key={mode} value={mode}>{CALENDAR_LABELS[mode]}</option>)}
          </select>
        </Field>
        <Field label="Share FDS alto (≥)">
          <input type="number" step={0.05} className={inputClass} value={s.weekendShareHigh} onChange={(e) => patch({ weekendShareHigh: Number(e.target.value) })} />
        </Field>
        <Field label="Share FDS baixo (≤)">
          <input type="number" step={0.05} className={inputClass} value={s.weekendShareLow} onChange={(e) => patch({ weekendShareLow: Number(e.target.value) })} />
        </Field>
      </div>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Tabela de horas / mês</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="px-2 py-1">Perfil</th>
              {INTENSITY_LEVELS.flatMap((intensity) => COURSE_HALVES.map((half) => (
                <th key={`${intensity}-${half}`} className="px-2 py-1">{INTENSITY_LABELS[intensity]} · {HALF_LABELS[half]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {CALENDAR_MODES.map((calendar) => (
              <tr key={calendar} className="border-t border-slate-800">
                <td className="px-2 py-1 font-medium text-slate-200">{CALENDAR_LABELS[calendar]}</td>
                {INTENSITY_LEVELS.flatMap((intensity) => COURSE_HALVES.map((half) => (
                  <td key={`${calendar}-${intensity}-${half}`} className="px-2 py-1">
                    <input
                      type="number"
                      step={0.5}
                      className={inputClass}
                      value={lookupMonthlyHours(s.hoursLookup, calendar, intensity, half)}
                      onChange={(event) => {
                        const next = cloneHoursLookup(s.hoursLookup);
                        next[calendar][intensity][half] = Number(event.target.value) || 0;
                        patch({ hoursLookup: next, hoursLookupSource: "custom" });
                      }}
                    />
                  </td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TraceDrawer({ trace, onClose }: { trace: TraceBlock; onClose: () => void }) {
  const forecast = trace.forecast ?? [];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-4xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Memória de cálculo</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-100">{trace.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{trace.summary}</p>
            {trace.finishLabel ? <p className="mt-2 text-sm font-medium text-cyan-300">{trace.finishLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">Fechar</button>
        </div>

        {forecast.length ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Horas projetadas e formação</h4>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
                    formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}h`, name === "hours" ? "Voo no mês" : "Restante do curso"]}
                    labelFormatter={(label, payload) => {
                      const event = payload?.[0]?.payload?.event;
                      return event ? `${label} · ${event}` : String(label);
                    }}
                  />
                  <Legend />
                  <Bar dataKey="hours" name="Voo no mês" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="remainingAfter" name="Restante do curso" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 max-h-40 overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Mês</th>
                    <th className="py-1 pr-2 font-medium">Curso</th>
                    <th className="py-1 pr-2 font-medium">Voa</th>
                    <th className="py-1 pr-2 font-medium">Restante</th>
                    <th className="py-1 font-medium">Marco</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((row) => (
                    <tr key={`${row.month}-${row.course}-${row.event ?? ""}`} className="border-t border-slate-800/80">
                      <td className="py-1 pr-2 text-slate-200">{row.label}</td>
                      <td className="py-1 pr-2 text-slate-400">{row.course ? COURSE_LABELS[row.course as CourseCode] ?? row.course : "—"}</td>
                      <td className="py-1 pr-2 text-slate-100">{formatHours(row.hours)}</td>
                      <td className="py-1 pr-2 text-slate-400">{row.remainingAfter == null ? "—" : formatHours(row.remainingAfter)}</td>
                      <td className="py-1 text-cyan-300">{row.event || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 space-y-3">
          {trace.lines.map((line) => (
            <li key={`${line.label}-${line.value}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{line.label}</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{line.value}</p>
              {line.formula ? <p className="mt-1 text-xs text-slate-500">{line.formula}</p> : null}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
