import { useCallback, useEffect, useRef, useState } from "react";
import { listAircrafts } from "../../lib/aircraftDb";
import { listModels } from "../../lib/aircraftModelsDb";
import { getWeekConfig, listWeeksByAircraft, saveWeekConfig } from "../../lib/operationalWeeksDb";
import { SCHOOL_ID } from "../../lib/appwrite";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";
import type {
  Aircraft,
  AircraftModel,
  SlotMatrix,
  SlotState,
  WeekConfigFull,
} from "../../types/admin";
import { SLOT_HOURS, WEEK_DAYS, DAY_LABELS } from "../../types/admin";

const schoolId = SCHOOL_ID ?? "escola_principal";

// Weeks: generate 12 weeks around today
function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

type Week = { start: string; end: string; label: string };

function generateWeeks(): Week[] {
  const today = new Date();
  const monday = getWeekMonday(today);
  const weeks: Week[] = [];
  for (let i = -2; i < 10; i++) {
    const start = addDays(monday, i * 7);
    const end = addDays(start, 6);
    const label = `${start.getDate().toString().padStart(2, "0")}/${(start.getMonth() + 1).toString().padStart(2, "0")} – ${end.getDate().toString().padStart(2, "0")}/${(end.getMonth() + 1).toString().padStart(2, "0")} ${end.getFullYear()}`;
    weeks.push({ start: formatISO(start), end: formatISO(end), label });
  }
  return weeks;
}

const WEEKS = generateWeeks();
const CURRENT_WEEK_IDX = 2;

// Slot color/label map
const SLOT_META: Record<SlotState, { bg: string; border: string; label: string; toolBg: string }> = {
  preferred: { bg: "bg-emerald-600", border: "border-emerald-500", label: "Preferencial", toolBg: "bg-emerald-600 hover:bg-emerald-500" },
  normal: { bg: "bg-sky-600", border: "border-sky-500", label: "Normal", toolBg: "bg-sky-600 hover:bg-sky-500" },
  avoid: { bg: "bg-amber-500", border: "border-amber-400", label: "Despreferencial", toolBg: "bg-amber-500 hover:bg-amber-400" },
  blocked: { bg: "bg-red-600", border: "border-red-500", label: "Bloqueado", toolBg: "bg-red-600 hover:bg-red-500" },
};
const TOOL_ORDER: (SlotState | "clear")[] = ["preferred", "normal", "avoid", "blocked", "clear"];

// Daily caps: day labels ordered same as WEEK_DAYS (Seg=1 first, Dom=0 last)
const DAILY_CAP_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type GroupCapLocal = { id: string; maxHours: string; days: number[] };

function slotKey(day: number, hour: number): string {
  return `${day}-${hour}`;
}

export function WeeklyConfigTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>("");
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(CURRENT_WEEK_IDX);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  // Config state
  const [dailyCaps, setDailyCaps] = useState<Record<number, string>>({});
  const [groupCaps, setGroupCaps] = useState<GroupCapLocal[]>([]);
  const [slotMatrix, setSlotMatrix] = useState<SlotMatrix>({});

  const [isOpenForRequests, setIsOpenForRequests] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);

  // Active tool
  const [activeTool, setActiveTool] = useState<SlotState | "clear">("preferred");

  // Drag painting
  const isDragging = useRef(false);

  useEffect(() => {
    Promise.all([listAircrafts(schoolId), listModels()])
      .then(([acs, ms]) => {
        setAircrafts(acs.filter((a) => a.active));
        setModels(ms);
        if (acs.filter((a) => a.active)[0]) setSelectedAircraftId(acs.filter((a) => a.active)[0].id);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  const loadConfig = useCallback(async (aircraftId: string, weekStart: string) => {
    if (!aircraftId || !weekStart) return;
    try {
      const config: WeekConfigFull | null = await getWeekConfig(aircraftId, weekStart);
      if (config) {
        // Daily caps
        const caps: Record<number, string> = {};
        for (const dc of config.dailyCaps) caps[dc.day_of_week] = String(dc.max_hours);
        setDailyCaps(caps);
        // Group caps
        setGroupCaps(config.groupCaps.map((gc) => ({
          id: gc.id,
          maxHours: String(gc.max_hours),
          days: gc.days ?? [],
        })));
        // Matrix
        const matrix: SlotMatrix = {};
        for (const slot of config.slots) matrix[slotKey(slot.day_of_week, slot.start_hour)] = slot.state;
        setSlotMatrix(matrix);
        setIsOpenForRequests(config.week.is_open_for_requests ?? false);
      } else {
        setDailyCaps({});
        setGroupCaps([]);
        setSlotMatrix({});
        setIsOpenForRequests(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (selectedAircraftId && WEEKS[selectedWeekIdx]) {
      void loadConfig(selectedAircraftId, WEEKS[selectedWeekIdx]!.start);
    }
  }, [selectedAircraftId, selectedWeekIdx, loadConfig]);

  function applyTool(day: number, hour: number) {
    const key = slotKey(day, hour);
    setSlotMatrix((prev) => {
      const next = { ...prev };
      if (activeTool === "clear") {
        delete next[key];
      } else {
        next[key] = activeTool;
      }
      return next;
    });
  }

  function handleCellMouseDown(day: number, hour: number) {
    isDragging.current = true;
    applyTool(day, hour);
  }

  function handleCellMouseEnter(day: number, hour: number) {
    if (isDragging.current) applyTool(day, hour);
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  function fillMornings() {
    setSlotMatrix((prev) => {
      const next = { ...prev };
      for (const day of WEEK_DAYS) {
        for (const hour of [6, 7, 8, 9, 10]) {
          next[slotKey(day, hour)] = "preferred";
        }
      }
      return next;
    });
  }

  function blockSunday() {
    setSlotMatrix((prev) => {
      const next = { ...prev };
      for (const hour of SLOT_HOURS) next[slotKey(0, hour)] = "blocked";
      return next;
    });
  }

  function clearMatrix() {
    setSlotMatrix({});
  }

  function addGroupCap() {
    setGroupCaps((prev) => [...prev, { id: crypto.randomUUID(), maxHours: "", days: [] }]);
  }

  function removeGroupCap(id: string) {
    setGroupCaps((prev) => prev.filter((g) => g.id !== id));
  }

  function toggleGroupDay(id: string, day: number) {
    setGroupCaps((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const days = g.days.includes(day) ? g.days.filter((d) => d !== day) : [...g.days, day];
        return { ...g, days };
      }),
    );
  }

  async function handleCopyPreviousWeek() {
    if (!selectedAircraftId || !WEEKS[selectedWeekIdx]) return;
    setCopyingWeek(true);
    setError(null);
    try {
      const allWeeks = await listWeeksByAircraft(selectedAircraftId);
      const currentStart = WEEKS[selectedWeekIdx]!.start;
      const previous = allWeeks.find((w) => w.week_start < currentStart);
      if (!previous) {
        setError("Nenhuma semana anterior encontrada para esta aeronave.");
        return;
      }
      const config = await getWeekConfig(selectedAircraftId, previous.week_start);
      if (!config) {
        setError("Configuração da semana anterior não encontrada.");
        return;
      }
      const caps: Record<number, string> = {};
      for (const dc of config.dailyCaps) caps[dc.day_of_week] = String(dc.max_hours);
      setDailyCaps(caps);
      setGroupCaps(config.groupCaps.map((gc) => ({ id: crypto.randomUUID(), maxHours: String(gc.max_hours), days: gc.days ?? [] })));
      const matrix: SlotMatrix = {};
      for (const slot of config.slots) matrix[slotKey(slot.day_of_week, slot.start_hour)] = slot.state;
      setSlotMatrix(matrix);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCopyingWeek(false);
    }
  }

  async function handleSave() {
    if (!selectedAircraftId || !WEEKS[selectedWeekIdx] || !user) return;
    setSaving(true);
    setError(null);
    try {
      const week = WEEKS[selectedWeekIdx]!;
      await saveWeekConfig({
        aircraftId: selectedAircraftId,
        weekStart: week.start,
        weekEnd: week.end,
        createdBy: user.id,
        isOpenForRequests,
        dailyCaps: Object.entries(dailyCaps)
          .filter(([, v]) => v !== "" && Number(v) >= 0)
          .map(([day, v]) => ({ dayOfWeek: Number(day), maxHours: parseFloat(v) })),
        groupCaps: groupCaps
          .filter((g) => g.days.length > 0 && g.maxHours !== "")
          .map((g) => ({ maxHours: parseFloat(g.maxHours), days: g.days })),
        slots: Object.entries(slotMatrix).map(([key, state]) => {
          const [d, h] = key.split("-").map(Number);
          return { dayOfWeek: d!, startHour: h!, state };
        }),
      });
      showToast({ variant: "success", message: "Configuração salva com sucesso." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const modelMap = Object.fromEntries(models.map((m) => [m.id, m]));
  const selectedAircraft = aircrafts.find((a) => a.id === selectedAircraftId);
  const selectedWeek = WEEKS[selectedWeekIdx];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="space-y-1">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <div className="grid min-w-[640px] grid-cols-7 gap-px bg-slate-800/60 p-2">
            {Array.from({ length: 7 }).map((_, d) => (
              <div key={d} className="space-y-1.5">
                <Skeleton className="h-3 w-8 mx-auto" />
                {Array.from({ length: 8 }).map((_, h) => (
                  <Skeleton key={h} className="h-8 w-full rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-6xl space-y-5 select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Configuração Semanal Operacional</h2>
        <p className="text-xs text-slate-500">Disponibilidade, capacidade e prioridade por aeronave e semana</p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Aircraft */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Aeronave</p>
          {aircrafts.length === 0 ? (
            <p className="text-xs text-slate-600">Nenhuma aeronave ativa. Cadastre aeronaves na aba Frota.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {aircrafts.map((ac) => {
                const model = modelMap[ac.model_id];
                return (
                  <button
                    key={ac.id}
                    type="button"
                    onClick={() => setSelectedAircraftId(ac.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      selectedAircraftId === ac.id
                        ? "border-violet-500/50 bg-violet-500/10 text-violet-200"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    <span className="font-mono font-semibold">{ac.registration}</span>
                    {model && <span className="text-xs opacity-60">{model.name}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Week */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Semana</p>
          <select
            value={selectedWeekIdx}
            onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
          >
            {WEEKS.map((w, i) => (
              <option key={w.start} value={i}>
                {i === CURRENT_WEEK_IDX ? `▶ Semana atual — ${w.label}` : w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedAircraftId && selectedWeek && (
        <>
          {/* ─── Open for requests toggle ─── */}
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">Semana aberta para solicitações</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Alunos poderão enviar planejamentos de voo para esta semana.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOpenForRequests}
                onClick={() => setIsOpenForRequests((v) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  isOpenForRequests ? "bg-violet-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isOpenForRequests ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </section>

          {/* ─── A) Daily Caps ─── */}
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-sky-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">A — Teto por dia (horas)</p>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[520px] grid-cols-7 gap-2">
                {WEEK_DAYS.map((day, i) => (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <p className="text-xs font-medium text-slate-500">{DAILY_CAP_LABELS[i]}</p>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={dailyCaps[day] ?? ""}
                      onChange={(e) =>
                        setDailyCaps((prev) => {
                          const next = { ...prev };
                          if (e.target.value === "") delete next[day];
                          else next[day] = e.target.value;
                          return next;
                        })
                      }
                      placeholder="—"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-center text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ─── B) Group Caps ─── */}
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-emerald-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">B — Teto por grupo de dias</p>
              </div>
              <button
                type="button"
                onClick={addGroupCap}
                className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
                </svg>
                Novo grupo
              </button>
            </div>

            {groupCaps.length === 0 ? (
              <p className="text-xs text-slate-600">Sem grupos definidos. Clique em "Novo grupo" para adicionar.</p>
            ) : (
              <div className="space-y-3">
                {groupCaps.map((gc) => (
                  <div key={gc.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                    {/* Day toggles */}
                    <div className="flex flex-wrap gap-1">
                      {WEEK_DAYS.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleGroupDay(gc.id, day)}
                          className={`rounded px-2 py-1 text-xs font-medium transition ${
                            gc.days.includes(day)
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                          }`}
                        >
                          {DAILY_CAP_LABELS[i]}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">máx</span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={gc.maxHours}
                          onChange={(e) =>
                            setGroupCaps((prev) =>
                              prev.map((g) => (g.id === gc.id ? { ...g, maxHours: e.target.value } : g)),
                            )
                          }
                          placeholder="30"
                          className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 pr-7 text-center text-sm text-slate-100 outline-none focus:border-emerald-500"
                        />
                        <span className="absolute right-2 top-1.5 text-xs text-slate-500">h</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeGroupCap(gc.id)}
                      className="ml-auto rounded p-1 text-slate-600 hover:bg-slate-700 hover:text-red-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                        <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ─── C) Operational Matrix ─── */}
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">C — Matriz Operacional</p>
              <span className="ml-auto text-xs text-slate-600">Clique ou arraste para aplicar</span>
            </div>

            {/* Tool palette */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TOOL_ORDER.map((tool) => {
                const isActive = activeTool === tool;
                if (tool === "clear") {
                  return (
                    <button
                      key="clear"
                      type="button"
                      onClick={() => setActiveTool("clear")}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "border-slate-500 bg-slate-700 text-slate-200"
                          : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      ✕ Limpar
                    </button>
                  );
                }
                const meta = SLOT_META[tool];
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => setActiveTool(tool)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium text-white transition ${
                      isActive
                        ? `${meta.bg} border-transparent ring-2 ring-white/30`
                        : `border-transparent opacity-40 ${meta.bg} hover:opacity-70`
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}

              {/* Quick actions */}
              <div className="flex w-full flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto">
                <button
                  type="button"
                  onClick={fillMornings}
                  className="rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
                >
                  Manhãs pref.
                </button>
                <button
                  type="button"
                  onClick={blockSunday}
                  className="rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
                >
                  Bloquear Dom
                </button>
                <button
                  type="button"
                  onClick={clearMatrix}
                  className="rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-red-500/60 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  Limpar tudo
                </button>
              </div>
            </div>

            {/* Matrix */}
            <div className="overflow-x-auto">
              <table className="min-w-[640px] border-separate border-spacing-1 md:w-full">
                <thead>
                  <tr>
                    <th className="w-12 pb-1 text-right text-[10px] font-medium text-slate-600" />
                    {WEEK_DAYS.map((day) => (
                      <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                        {DAY_LABELS[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOT_HOURS.map((hour) => (
                    <tr key={hour}>
                      <td className="pr-2 text-right text-[11px] font-mono text-slate-600">{hour}h</td>
                      {WEEK_DAYS.map((day) => {
                        const key = slotKey(day, hour);
                        const state = slotMatrix[key];
                        const meta = state ? SLOT_META[state] : null;
                        return (
                          <td key={day} className="p-0">
                            <button
                              type="button"
                              onMouseDown={() => handleCellMouseDown(day, hour)}
                              onMouseEnter={() => handleCellMouseEnter(day, hour)}
                              className={`h-8 w-full rounded-md border transition-all duration-75 ${
                                meta
                                  ? `${meta.bg} ${meta.border} opacity-90 hover:opacity-100`
                                  : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-700/50"
                              }`}
                              aria-label={`${DAY_LABELS[day]} ${hour}h${state ? ` — ${SLOT_META[state]?.label}` : ""}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3">
              {Object.entries(SLOT_META).map(([state, meta]) => (
                <div key={state} className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded-sm ${meta.bg}`} />
                  <span className="text-[10px] text-slate-500">{meta.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm border border-slate-700/60 bg-slate-800/40" />
                <span className="text-[10px] text-slate-500">Sem definição</span>
              </div>
            </div>
          </section>

          {/* Save / copy buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || copyingWeek}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-500 active:scale-95 disabled:opacity-50 sm:w-auto"
            >
              {saving ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Salvando…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  Salvar configuração
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleCopyPreviousWeek()}
              disabled={saving || copyingWeek}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 active:scale-95 disabled:opacity-40 sm:w-auto"
            >
              {copyingWeek ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              ) : null}
              Copiar semana anterior
            </button>

            {selectedAircraft && selectedWeek && (
              <span className="text-xs text-slate-600 sm:ml-auto">
                {selectedAircraft.registration} · {selectedWeek.label}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
