import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { listAircrafts } from "../lib/aircraftDb";
import { listModels } from "../lib/aircraftModelsDb";
import { SCHOOL_ID } from "../lib/appwrite";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";
import {
  findOpenWeeks,
  getStudentPlan,
  getPreviousStudentPlan,
  saveStudentPlan,
  submitStudentPlan,
} from "../lib/weeklyFlightPlansDb";
import type { OperationalWeek } from "../types/admin";
import type { AircraftModel } from "../types/admin";
import type {
  AvailabilityPeriod,
  AvailabilityType,
  FlightItemLocal,
  FlexibilityLevel,
  WeeklyFlightPlanFull,
  WeeklyFlightPlanItemFull,
  SavePlanPayload,
} from "../types/planning";

const PLAN_DAYS = [1, 2, 3, 4, 5, 6] as const;
const PLAN_DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PLAN_PERIODS: { id: AvailabilityPeriod; label: string }[] = [
  { id: "morning", label: "Manhã" },
  { id: "afternoon", label: "Tarde" },
];

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3];

const AVAIL_CYCLE: (AvailabilityType | undefined)[] = [undefined, "available", "preferred"];

function cycleAvailability(current: AvailabilityType | undefined): AvailabilityType | undefined {
  const idx = AVAIL_CYCLE.indexOf(current);
  return AVAIL_CYCLE[(idx + 1) % AVAIL_CYCLE.length];
}

function availKey(day: number, period: AvailabilityPeriod): string {
  return `${day}-${period}`;
}

function makeEmptyItem(): FlightItemLocal {
  return {
    localId: crypto.randomUUID(),
    durationHours: 1,
    flexibilityLevel: "medium",
    preferredAircraft: null,
    priorityLevel: 2,
    notes: "",
    availability: {},
  };
}

function itemFullToLocal(item: WeeklyFlightPlanItemFull): FlightItemLocal {
  const availability: Record<string, AvailabilityType> = {};
  for (const a of item.availability) {
    const period = (a as { period: string }).period;
    if (period === "morning" || period === "afternoon") {
      availability[availKey(a.day_of_week, period)] = a.availability_type;
      continue;
    }
    availability[availKey(a.day_of_week, "morning")] = a.availability_type;
    availability[availKey(a.day_of_week, "afternoon")] = a.availability_type;
  }
  return {
    localId: item.id,
    durationHours: Math.max(1, item.duration_hours),
    flexibilityLevel: item.flexibility_level,
    preferredAircraft: item.preferred_aircraft,
    priorityLevel: item.priority_level,
    notes: item.notes ?? "",
    availability,
  };
}

function hasAnyAvailability(item: FlightItemLocal): boolean {
  return Object.keys(item.availability).length > 0;
}

function localItemToPayload(item: FlightItemLocal, position: number): SavePlanPayload["items"][number] {
  return {
    position,
    durationHours: item.durationHours,
    flexibilityLevel: item.flexibilityLevel,
    preferredAircraft: item.preferredAircraft,
    priorityLevel: item.priorityLevel,
    notes: item.notes || null,
    availability: Object.entries(item.availability).map(([key, availType]) => {
      const dashIdx = key.indexOf("-");
      const dayStr = key.slice(0, dashIdx);
      const period = key.slice(dashIdx + 1) as AvailabilityPeriod;
      return {
        dayOfWeek: Number(dayStr),
        period,
        availabilityType: availType,
      };
    }),
  };
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(weekEnd + "T12:00:00");
  const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  return `${fmt(start)} a ${fmt(end)}/${end.getFullYear()}`;
}

const PRIORITY_LABELS: Record<1 | 2 | 3, string> = { 1: "Alta", 2: "Média", 3: "Baixa" };
const PRIORITY_COLORS: Record<1 | 2 | 3, string> = {
  1: "bg-red-600/20 text-red-400 border-red-600/30",
  2: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  3: "bg-slate-700/50 text-slate-400 border-slate-600/40",
};
const FLEX_LABELS: Record<FlexibilityLevel, string> = { low: "Baixa", medium: "Média", high: "Alta" };

// ─── FlightItemCard ────────────────────────────────────────────────────────────

type FlightItemCardProps = {
  index: number;
  item: FlightItemLocal;
  modelOptions: AircraftModel[];
  onChange: (updated: FlightItemLocal) => void;
  onReplicate: () => void;
};

function FlightItemCard({ index, item, modelOptions, onChange, onReplicate }: FlightItemCardProps) {
  const [expanded, setExpanded] = useState(index === 0);

  function toggleCell(day: number, period: AvailabilityPeriod) {
    const key = availKey(day, period);
    const current = item.availability[key];
    const next = cycleAvailability(current);
    const newAvail = { ...item.availability };
    if (next === undefined) {
      delete newAvail[key];
    } else {
      newAvail[key] = next;
    }
    onChange({ ...item, availability: newAvail });
  }

  function cellStyle(day: number, period: AvailabilityPeriod): string {
    const v = item.availability[availKey(day, period)];
    if (v === "preferred") return "bg-emerald-600 border-emerald-500 text-white";
    if (v === "available") return "bg-sky-600 border-sky-500 text-white";
    return "bg-slate-800/40 border-slate-700/60 text-slate-600 hover:border-slate-600 hover:bg-slate-700/40";
  }

  const availCount = Object.keys(item.availability).length;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs font-semibold text-violet-300">
          {index + 1}
        </span>
        <span className="flex-1 text-sm text-slate-200">
          Voo {index + 1}
          <span className="ml-2 text-slate-500">· {item.durationHours}h</span>
          <span className="ml-2 text-slate-500">· Prioridade {PRIORITY_LABELS[item.priorityLevel]}</span>
          {availCount > 0 && (
            <span className="ml-2 text-slate-600">· {availCount} período{availCount !== 1 ? "s" : ""}</span>
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/60 px-4 pb-4 pt-4 space-y-5">
          {/* Duration + Priority + Flexibility */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Duration */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Duração</p>
              <select
                value={item.durationHours}
                onChange={(e) => onChange({ ...item, durationHours: parseFloat(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
              >
                {DURATION_OPTIONS.map((h) => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Prioridade</p>
              <div className="flex gap-1.5">
                {([1, 2, 3] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange({ ...item, priorityLevel: p })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      item.priorityLevel === p
                        ? PRIORITY_COLORS[p]
                        : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Flexibility */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Flexibilidade</p>
              <div className="flex gap-1.5">
                {(["low", "medium", "high"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onChange({ ...item, flexibilityLevel: f })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      item.flexibilityLevel === f
                        ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                        : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    {FLEX_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Model preference */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Modelo de aeronave</p>
            <select
              value={item.preferredAircraft ?? ""}
              onChange={(e) => onChange({ ...item, preferredAircraft: e.target.value || null })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 sm:max-w-xs"
            >
              <option value="">Sem preferência de modelo</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* Availability grid */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              Disponibilidade
              <span className="ml-2 font-normal text-slate-600">Clique para marcar: disponível → preferencial → nenhum</span>
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-[520px] border-separate border-spacing-1 md:w-full">
                <thead>
                  <tr>
                    <th className="w-20 pb-1" />
                    {PLAN_DAYS.map((day, i) => (
                      <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                        {PLAN_DAY_LABELS[i]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_PERIODS.map((period) => (
                    <tr key={period.id}>
                      <td className="pr-2 text-right text-[11px] text-slate-500">{period.label}</td>
                      {PLAN_DAYS.map((day) => {
                        const v = item.availability[availKey(day, period.id)];
                        return (
                          <td key={day} className="p-0">
                            <button
                              type="button"
                              onClick={() => toggleCell(day, period.id)}
                              aria-label={`${PLAN_DAY_LABELS[PLAN_DAYS.indexOf(day)]} ${period.label}${v ? ` — ${v === "available" ? "Disponível" : "Preferencial"}` : ""}`}
                              className={`h-8 w-full rounded-md border transition-all duration-75 ${cellStyle(day, period.id)}`}
                            >
                              {v === "preferred" && (
                                <span className="text-[10px] font-bold">★</span>
                              )}
                              {v === "available" && (
                                <span className="text-[10px]">✓</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-sky-600" />
                <span className="text-[10px] text-slate-500">Disponível</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-emerald-600" />
                <span className="text-[10px] text-slate-500">Preferencial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm border border-slate-700/60 bg-slate-800/40" />
                <span className="text-[10px] text-slate-500">Não disponível</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Observações</p>
            <textarea
              value={item.notes}
              onChange={(e) => onChange({ ...item, notes: e.target.value })}
              maxLength={512}
              rows={2}
              placeholder="Informações adicionais para este voo…"
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500"
            />
          </div>

          {/* Replicate button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onReplicate}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M2 8a.75.75 0 01.75-.75h8.69L9.22 5.03a.75.75 0 011.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06-1.06l2.22-2.22H2.75A.75.75 0 012 8z" />
              </svg>
              Replicar configuração para outros voos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AgendamentoTab ────────────────────────────────────────────────────────────

type AgendamentoView = "loading" | "no-open-week" | "week-select" | "submitted" | "form";

export function AgendamentoTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState<AgendamentoView>("loading");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openWeeks, setOpenWeeks] = useState<OperationalWeek[]>([]);
  const [openWeek, setOpenWeek] = useState<OperationalWeek | null>(null);
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);
  const [submittedPlan, setSubmittedPlan] = useState<WeeklyFlightPlanFull | null>(null);
  const [hasPreviousPlan, setHasPreviousPlan] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  const [flightCount, setFlightCount] = useState(1);
  const [flightItems, setFlightItems] = useState<FlightItemLocal[]>([makeEmptyItem()]);
  const [modelOptions, setModelOptions] = useState<AircraftModel[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setView("loading");
    setError(null);
    try {
      const [weeks, fleetList, allModels] = await Promise.all([
        findOpenWeeks(),
        listAircrafts(SCHOOL_ID ?? "escola_principal"),
        listModels(),
      ]);

      const activeFleet = fleetList.filter((a) => a.active);
      const modelIdsInFleet = new Set(activeFleet.map((a) => a.model_id));
      setModelOptions(allModels.filter((m) => modelIdsInFleet.has(m.id)));

      if (weeks.length === 0) {
        setView("no-open-week");
        return;
      }

      setOpenWeeks(weeks);

      if (weeks.length === 1) {
        // Only one open week — skip the selector and go directly
        await selectWeek(weeks[0]!, user.id);
      } else {
        setView("week-select");
      }
    } catch (e) {
      setError((e as Error).message);
      setView("no-open-week");
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectWeek(week: OperationalWeek, studentId: string) {
    setError(null);
    try {
      setOpenWeek(week);
      const [existing, prevPlan] = await Promise.all([
        getStudentPlan(studentId, week.week_start),
        getPreviousStudentPlan(studentId),
      ]);

      setHasPreviousPlan(prevPlan !== null && (existing === null || existing.week_start !== prevPlan.week_start));

      if (!existing) {
        setFlightCount(1);
        setFlightItems([makeEmptyItem()]);
        setView("form");
        return;
      }

      if (existing.status === "submitted") {
        setSubmittedPlan(existing);
        setView("submitted");
        return;
      }

      setExistingPlanId(existing.id);
      setFlightCount(existing.requested_flights_count);
      setFlightItems(existing.items.map(itemFullToLocal));
      setView("form");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  function handleFlightCountChange(count: number) {
    setFlightCount(count);
    setFlightItems((prev) => {
      if (count > prev.length) {
        const extras = Array.from({ length: count - prev.length }, () => makeEmptyItem());
        return [...prev, ...extras];
      }
      return prev.slice(0, count);
    });
  }

  async function handleLoadPrevious() {
    if (!user) return;
    setLoadingPrevious(true);
    setError(null);
    try {
      const prev = await getPreviousStudentPlan(user.id);
      if (!prev) return;
      setFlightCount(prev.requested_flights_count);
      setFlightItems(prev.items.map(itemFullToLocal));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingPrevious(false);
    }
  }

  function handleReplicate(sourceLocalId: string) {
    const source = flightItems.find((f) => f.localId === sourceLocalId);
    if (!source) return;
    setFlightItems((prev) =>
      prev.map((item) =>
        item.localId === sourceLocalId
          ? item
          : {
              ...item,
              durationHours: source.durationHours,
              flexibilityLevel: source.flexibilityLevel,
              preferredAircraft: source.preferredAircraft,
              priorityLevel: source.priorityLevel,
              availability: { ...source.availability },
            },
      ),
    );
  }

  function handleItemChange(localId: string, updated: FlightItemLocal) {
    setFlightItems((prev) => prev.map((item) => (item.localId === localId ? updated : item)));
  }

  function validatePlanningItems(): string | null {
    const items = flightItems.slice(0, flightCount);
    const missingAvailabilityIdx = items.findIndex((item) => !hasAnyAvailability(item));
    if (missingAvailabilityIdx >= 0) {
      return `Preencha ao menos 1 slot de disponibilidade no voo ${missingAvailabilityIdx + 1}.`;
    }
    return null;
  }

  async function handleSaveDraft() {
    if (!user || !openWeek) return;
    const validationMessage = validatePlanningItems();
    if (validationMessage) {
      showToast({ variant: "error", message: validationMessage });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveStudentPlan({
        studentId: user.id,
        operationalWeekId: openWeek.id,
        weekStart: openWeek.week_start,
        requestedFlightsCount: flightCount,
        items: flightItems.slice(0, flightCount).map(localItemToPayload),
      });
      setExistingPlanId(result.id);
      showToast({ variant: "success", message: "Rascunho salvo." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!user || !openWeek) return;
    const validationMessage = validatePlanningItems();
    if (validationMessage) {
      showToast({ variant: "error", message: validationMessage });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveStudentPlan({
        studentId: user.id,
        operationalWeekId: openWeek.id,
        weekStart: openWeek.week_start,
        requestedFlightsCount: flightCount,
        items: flightItems.slice(0, flightCount).map(localItemToPayload),
      });
      await submitStudentPlan(result.id);
      setSubmittedPlan({ ...result, status: "submitted" });
      setView("submitted");
      showToast({ variant: "success", message: "Planejamento enviado." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSubmitted() {
    if (!user || !openWeek || !submittedPlan) return;
    setExistingPlanId(submittedPlan.id);
    setFlightCount(submittedPlan.requested_flights_count);
    setFlightItems(submittedPlan.items.map(itemFullToLocal));
    setView("form");
  }

  // ── Render: loading ──────────────────────────────────────────────────────────

  if (view === "loading") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-4">
          <Skeleton className="h-4 w-48" />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-700/60 p-3 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render: no open week ─────────────────────────────────────────────────────

  if (view === "no-open-week") {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-slate-500">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-base font-medium text-slate-300">Solicitações ainda não abertas para esta semana.</p>
        <p className="mt-1 text-sm text-slate-600">A coordenação irá abrir o planejamento em breve.</p>
      </div>
    );
  }

  // ── Render: week selector ────────────────────────────────────────────────────

  if (view === "week-select") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Planejamento semanal de voos</p>
          <p className="mt-0.5 text-base font-semibold text-slate-200">Selecione a semana</p>
        </div>
        <div className="space-y-2">
          {openWeeks.map((week) => (
            <button
              key={week.week_start}
              type="button"
              onClick={() => user && void selectWeek(week, user.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-5 py-4 text-left transition hover:border-violet-500/50 hover:bg-slate-800/60 active:scale-[0.99]"
            >
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Semana de {formatWeekRange(week.week_start, week.week_end)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{week.week_start}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 flex-shrink-0 text-slate-500">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Render: submitted ────────────────────────────────────────────────────────

  if (view === "submitted" && submittedPlan && openWeek) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Planejamento enviado</p>
              <p className="text-xs text-emerald-600">
                Semana de {formatWeekRange(openWeek.week_start, openWeek.week_end)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {submittedPlan.requested_flights_count} voo{submittedPlan.requested_flights_count !== 1 ? "s" : ""} planejado{submittedPlan.requested_flights_count !== 1 ? "s" : ""}
          </p>
          {submittedPlan.items.map((item, i) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs font-semibold text-violet-300">
                {i + 1}
              </span>
              <span className="text-sm text-slate-300">{item.duration_hours}h</span>
              <span className={`ml-auto rounded border px-2 py-0.5 text-xs ${PRIORITY_COLORS[item.priority_level]}`}>
                {PRIORITY_LABELS[item.priority_level]}
              </span>
              <span className="text-xs text-slate-500">{FLEX_LABELS[item.flexibility_level]}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleEditSubmitted()}
          className="w-full rounded-xl border border-slate-700 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          Editar planejamento
        </button>
      </div>
    );
  }

  // ── Render: form ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Week header */}
      {openWeek && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {openWeeks.length > 1 && (
              <button
                type="button"
                onClick={() => setView("week-select")}
                className="flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300"
              >
                ← Semanas
              </button>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Planejamento semanal de voos</p>
              <p className="mt-0.5 text-base font-semibold text-slate-200">
                Semana de {formatWeekRange(openWeek.week_start, openWeek.week_end)}
              </p>
            </div>
          </div>
          {hasPreviousPlan && (
            <button
              type="button"
              onClick={() => void handleLoadPrevious()}
              disabled={loadingPrevious}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition hover:border-slate-600 hover:text-slate-200 disabled:opacity-50"
            >
              {loadingPrevious ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M8 3.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM2 8a6 6 0 1110.743 3.68l1.538 1.539a.75.75 0 01-1.06 1.06l-1.54-1.538A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              )}
              Usar planejamento da semana passada
            </button>
          )}
        </div>
      )}

      {/* Flight count selector */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <p className="mb-3 text-sm font-medium text-slate-300">Quantos voos deseja fazer nesta semana?</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleFlightCountChange(n)}
              className={`h-10 w-10 rounded-xl border text-sm font-semibold transition ${
                flightCount === n
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Flight item cards */}
      <div className="space-y-3">
        {flightItems.slice(0, flightCount).map((item, i) => (
          <FlightItemCard
            key={item.localId}
            index={i}
            item={item}
            modelOptions={modelOptions}
            onChange={(updated) => handleItemChange(item.localId, updated)}
            onReplicate={() => handleReplicate(item.localId)}
          />
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => void handleSaveDraft()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 active:scale-95 disabled:opacity-50 sm:w-auto"
        >
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : null}
          Salvar rascunho
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-500 active:scale-95 disabled:opacity-50 sm:w-auto"
        >
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          )}
          Enviar planejamento
        </button>
        {existingPlanId && !saving && (
          <span className="text-xs text-slate-600">Rascunho salvo</span>
        )}
      </div>
    </div>
  );
}
