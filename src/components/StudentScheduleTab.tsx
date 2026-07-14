import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelScheduleFlight,
  checkScheduleAvailability,
  getPublicSchedule,
  previewScheduleCancellation,
  requestScheduleFlight,
  rescheduleScheduleFlight,
  type PublicBlockedSlot,
  type PublicScheduleAircraft,
  type PublicScheduleFlight,
} from "../lib/scheduleBookingDb";
import { getPublicScheduleCached, invalidatePublicSchedule } from "../lib/scheduleCache";
import { getStudentCreditStatement } from "../lib/creditsDb";
import { freeBalanceForDateFromPools, isWeekendDate } from "../lib/creditWeekday";
import { getAvailableFlightCreditPackages } from "../lib/flightCreditSalesDb";
import type { StudentCreditModelSummary, StudentCreditStatement } from "../types/credits";
import { DEFAULT_FLIGHT_SCHEDULE_RULES, DEFAULT_SCHOOL_RULES, type FlightScheduleRules } from "../types/schoolRules";
import type { ScheduleStudentHelpConfig } from "../types/scheduleStudentHelp";
import { getSchoolRules } from "../lib/schoolRulesDb";
import { filterScheduleBundleForStudentView } from "../lib/scheduleStudentVisibility";
import { normalizeScheduleFlightStatus, type FlightStatus } from "../lib/flightsDb";
import { useAuth } from "../contexts/AuthContext";
import { AgendamentoTab } from "./AgendamentoTab";
import {
  AIRCRAFT_COLOR_CLASSES,
  getAircraftScheduleColorClass,
} from "../lib/aircraftColors";
import {
  CalendarGrid,
  FLIGHT_STATUS_CARD_COLOR,
  type CalendarDropTarget,
  type CalendarFlightItem,
} from "./schedule/CalendarGrid";
import { navigateToTab } from "../lib/routedTabs";
import { useToast } from "./ui/ToastProvider";
import { ScheduleStudentChrome } from "./schedule/ScheduleStudentChrome";
import { useDirectionalSlide } from "../hooks/useDirectionalSlide";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const CAL_START_HOUR = 6;
const CAL_ROW_HEIGHT = 40;

// Mesmo esquema de cores da escala do admin (FLIGHT_STATUS_CARD_COLOR — fonte única):
// laranja=Pendente, azul=Previsto, verde=Confirmado, vermelho=Cancelado.
// Eventos de terceiros ficam cinza ("Ocupado"). Borda neutra, como no admin.
const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries({ ...FLIGHT_STATUS_CARD_COLOR, "Não confirmado": "bg-slate-600" }).map(
    ([status, color]) => [status, `${color} border-white/70`],
  ),
);

const STATUS_TEXT_COLOR: Record<string, string> = {
  "Pendente": "text-orange-300",
  "Confirmado": "text-emerald-300",
  "Cancelado": "text-red-300",
  "Não confirmado": "text-slate-400",
  "Realizado": "text-sky-300",
  "Previsto": "text-sky-300",
};

function getStudentFlightCardClasses(item: CalendarFlightItem): string {
  if (item.isBlocked) return "bg-red-900/60 border-red-500/50 text-red-200";
  if (!item.isOwn) return "bg-slate-700/70 border-slate-600/50";
  return STATUS_COLOR[item.flightStatus ?? "Não confirmado"] ?? "bg-slate-600/90 border-slate-500/60";
}

function studentItemColor(item: CalendarFlightItem): string {
  return getStudentFlightCardClasses(item)
    .split(" ")
    .filter((part) => !part.startsWith("border-") && !part.startsWith("text-"))
    .join(" ");
}

// ─── Date / Time helpers ──────────────────────────────────────────────────────

function mondayIso(date = new Date()): string {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  // toLocalIso, não toISOString: em UTC-3, após as 21h o toISOString já devolve o
  // dia seguinte e a semana inteira ficava deslocada (weekStart caía na terça).
  return toLocalIso(next);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatLongDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatShortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isDateToday(date: Date): boolean {
  const t = new Date();
  return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function dayOfWeekToDate(weekStart: string, dayOfWeek: number): Date {
  const date = new Date(`${weekStart}T12:00:00`);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return date;
}

function addMinutes(value: string, minutes: number): string {
  const [hours, mins] = value.split(":").map(Number);
  const total = (hours || 0) * 60 + (mins || 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string | null): number {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDecimalHours(hours: number): string {
  return `${hours.toFixed(2)}h`;
}

function hasAnyCreditPools(totals: StudentCreditStatement["totals"] | null): boolean {
  if (!totals) return false;
  const weekday = totals.weekdayOnlyAvailableHours ?? 0;
  const anyDay = totals.anyDayAvailableHours ?? 0;
  return weekday > 0.001 || anyDay > 0.001;
}

function canUseZeroCreditOneHourException(
  rules: FlightScheduleRules,
  durationMinutes: number,
  freeHours: number,
  creditTotals: StudentCreditStatement["totals"] | null,
): boolean {
  if (!rules.allowZeroCreditOneHour || durationMinutes > 60 || freeHours < -0.001) return false;
  return !hasAnyCreditPools(creditTotals);
}

function toLocalIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Mesma normalização de matrícula do servidor: maiúsculas, apenas A–Z e 0–9. */
function normalizeIdent(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveDefaultBookingDate(minBookingLeadDays: number): string {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + Math.max(0, Math.ceil(minBookingLeadDays)));
  const minIso = toLocalIso(minDate);
  const tomorrowIso = addDays(toLocalIso(new Date()), 1);
  return tomorrowIso >= minIso ? tomorrowIso : minIso;
}

// ─── Regras de slot compartilhadas (modal de solicitação E modal de alteração) ──

type OccupiedInterval = { start: number; end: number };

/** Slots de acionamento: diurnos a cada slot até o noturno; noturno tem UM horário (o início). */
function buildStartSlotOptions(rules: FlightScheduleRules, flightDate: string): Array<{ value: string; isNight: boolean }> {
  const startTotalMin = rules.scheduleStartTime ? timeToMinutes(rules.scheduleStartTime) : CAL_START_HOUR * 60;
  const nightTotalMin = Math.round(rules.nightFlightStartHour * 60);
  const opts: Array<{ value: string; isNight: boolean }> = [];
  for (let totalMin = startTotalMin; totalMin < Math.min(nightTotalMin, 24 * 60); totalMin += rules.slotMinutes) {
    opts.push({ value: minutesToHHMM(totalMin), isNight: false });
  }
  if (rules.allowNightFlights && nightTotalMin < 24 * 60) {
    const day = new Date(`${flightDate}T12:00:00`).getDay();
    if (rules.nightBookingWeekdays.includes(day)) {
      opts.push({ value: minutesToHHMM(nightTotalMin), isNight: true });
    }
  }
  return opts;
}

/**
 * Um slot "cabe" se o bloco completo (apresentação→encerramento) não conflita com outro
 * voo, não cruza o início do noturno (acionamento diurno), não estoura o dia e não está
 * no passado.
 */
function slotFitsIntervals(
  intervals: OccupiedInterval[],
  rules: FlightScheduleRules,
  flightDate: string,
  startMin: number,
  duration: number,
): boolean {
  const nightStartMin = Math.round(rules.nightFlightStartHour * 60);
  const blockStart = startMin - rules.bufferBeforeMinutes;
  const blockEnd = startMin + duration + rules.bufferAfterMinutes;
  if (blockStart < 0 || blockEnd >= 24 * 60) return false;
  const now = new Date();
  if (flightDate === toLocalIso(now) && startMin <= now.getHours() * 60 + now.getMinutes()) return false;
  if (startMin < nightStartMin && startMin + duration > nightStartMin) return false;
  return !intervals.some((interval) => interval.start < blockEnd && interval.end > blockStart);
}

/** Tempos de voo possíveis: limites do dia + não invadir o noturno a partir do acionamento. */
function buildDurationChoices(rules: FlightScheduleRules, flightDate: string, startTime: string): number[] {
  const weekend = [0, 6].includes(new Date(`${flightDate}T12:00:00`).getDay());
  const min = (weekend ? rules.weekendMinHours : rules.weekdayMinHours) * 60;
  const max = (weekend ? rules.weekendMaxHours : rules.weekdayMaxHours) * 60;
  const startMin = timeToMinutes(startTime);
  const nightStartMin = Math.round(rules.nightFlightStartHour * 60);
  const values: number[] = [];
  for (let value = min; value <= max; value += rules.slotMinutes) {
    if (startMin < nightStartMin && startMin + value > nightStartMin) continue;
    if (startMin + value + rules.bufferAfterMinutes >= 24 * 60) continue;
    values.push(value);
  }
  return values;
}

function minDurationFor(rules: FlightScheduleRules, flightDate: string): number {
  const weekend = [0, 6].includes(new Date(`${flightDate}T12:00:00`).getDay());
  return Math.round((weekend ? rules.weekendMinHours : rules.weekdayMinHours) * 60);
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function defaultAgendaView(): "weekly" | "daily" | "list" {
  if (typeof window === "undefined") return "weekly";
  return window.matchMedia("(max-width: 639px)").matches ? "daily" : "weekly";
}

// ─── Skeleton da agenda (carregamento inicial e troca de semana) ──────────────

function ScheduleSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 sm:p-4">
      <div className="h-4 w-40 rounded bg-slate-800" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-6 rounded bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, col) => (
          <div key={col} className="space-y-1">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="h-10 rounded bg-slate-800/70" style={{ opacity: Math.max(0.25, 0.9 - row * 0.12) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Student Aircraft Board (daily / 3-day view with aircraft columns) ────────

type BoardCol = {
  registration: string;
  items: CalendarFlightItem[];
};

function timeTopPx(timeStr: string): number {
  const minutes = timeToMinutes(timeStr);
  return ((minutes - CAL_START_HOUR * 60) / 60) * CAL_ROW_HEIGHT;
}

function StudentAircraftBoard({
  days,
  items,
  aircrafts,
  weekStart,
  nightStartHour,
  onItemClick,
  onItemDrop,
  canDragItem,
  onEmptySlotClick,
  selectedDay,
  onSelectDay,
  onPrevDay,
  onNextDay,
  showDayPicker,
  headerDays,
  disablePrev,
  minSelectableDate,
}: {
  days: readonly number[];
  items: CalendarFlightItem[];
  aircrafts: PublicScheduleAircraft[];
  weekStart: string;
  nightStartHour: number;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  canDragItem?: (item: CalendarFlightItem) => boolean;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  showDayPicker?: boolean;
  /** Dias exibidos no seletor do topo (no mobile: janela de 3 dias). */
  headerDays?: readonly number[];
  /** Escala do aluno: desabilita a seta de voltar quando o período já contém hoje. */
  disablePrev?: boolean;
  /** Escala do aluno: dias anteriores a esta data (ISO) não podem ser selecionados. */
  minSelectableDate?: string;
}) {
  const isMobile = useIsMobile();
  // Colunas mais estreitas no mobile (160 → 120 → 96) + calha de horas reduzida.
  const colWidthPx = isMobile ? 96 : 160;
  const hoursGutterPx = isMobile ? 30 : 48;
  // Mesma paleta e ordem da escala do admin: cor estável por aeronave.
  const colorByAircraft = useMemo(
    () => new Map(aircrafts.map((aircraft, index) => [
      aircraft.registration,
      getAircraftScheduleColorClass(aircraft.registration, index),
    ])),
    [aircrafts],
  );
  const maxEndMinute = items.reduce((m, item) => {
    const end = timeToMinutes(item.endTime || item.startTime);
    return Math.max(m, end);
  }, (nightStartHour + 2) * 60);
  const endHour = Math.min(24, Math.max(nightStartHour + 1, Math.ceil(maxEndMinute / 60)));
  const hours = Array.from({ length: endHour - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i);
  const boardHeight = hours.length * CAL_ROW_HEIGHT;

  // Drag & drop nas colunas de aeronave (visão diária): arrastar um voo próprio
  // propõe a alteração; o destino traz dia + aeronave + horário (snap de 30min).
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const dragEndedRef = useRef(false);
  const [dragState, setDragState] = useState<{
    item: CalendarFlightItem;
    startX: number;
    startY: number;
    hasMoved: boolean;
    preview: CalendarDropTarget | null;
  } | null>(null);

  const resolveDropTarget = useCallback((clientX: number, clientY: number): CalendarDropTarget | null => {
    for (const [key, el] of colRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      const [dayStr, registration] = key.split("|");
      const minutesFromTop = ((clientY - rect.top) / CAL_ROW_HEIGHT) * 60;
      const snapped = Math.round(minutesFromTop / 30) * 30;
      const totalMinutes = CAL_START_HOUR * 60 + Math.max(0, snapped);
      return {
        dayOfWeek: Number(dayStr),
        startHour: totalMinutes / 60,
        startTime: minutesToHHMM(totalMinutes),
        isNight: totalMinutes / 60 >= nightStartHour,
        targetAircraftRegistration: registration,
      };
    }
    return null;
  }, [nightStartHour]);

  useEffect(() => {
    if (!dragState) return;
    function onMove(e: PointerEvent) {
      setDragState((p) => {
        if (!p) return p;
        const moved = p.hasMoved || Math.hypot(e.clientX - p.startX, e.clientY - p.startY) >= 6;
        const target = moved ? resolveDropTarget(e.clientX, e.clientY) ?? p.preview : p.preview;
        return { ...p, hasMoved: moved, preview: target };
      });
    }
    function onUp(e: PointerEvent) {
      setDragState((p) => {
        if (p?.hasMoved && onItemDrop) {
          dragEndedRef.current = true;
          const target = resolveDropTarget(e.clientX, e.clientY) ?? p.preview;
          if (target) onItemDrop(p.item, target);
        } else if (p) {
          dragEndedRef.current = true;
          onItemClick(p.item);
        }
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragState, onItemDrop, onItemClick, resolveDropTarget]);

  return (
    <div className="space-y-4">
      {showDayPicker && onSelectDay && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevDay}
            disabled={disablePrev}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800"
          >
            ‹
          </button>
          <div className="flex min-w-0 flex-1 gap-0.5 sm:gap-1">
            {(headerDays ?? DAY_ORDER).map((day) => {
              const date = dayOfWeekToDate(weekStart, day);
              const today = isDateToday(date);
              const selected = day === selectedDay;
              // Escala do aluno: dias anteriores a hoje não podem ser selecionados.
              const past = Boolean(minSelectableDate) && toLocalIso(date) < minSelectableDate!;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={past}
                  onClick={() => { if (!past) onSelectDay(day); }}
                  className={`flex min-w-0 flex-1 flex-col items-center rounded border px-0.5 py-1.5 text-[10px] transition-colors sm:px-1.5 sm:text-[11px] ${
                    past ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600 opacity-50"
                      : selected ? "border-sky-500 bg-sky-600/20 text-sky-300"
                      : today ? "border-slate-500 bg-slate-700/50 text-slate-200 hover:bg-slate-700"
                      : "border-slate-700 bg-slate-800/30 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <span className="font-semibold">{DAY_LABEL[day]}</span>
                  <span className={today ? "text-sky-400" : ""}>{formatShortDate(date)}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={onNextDay} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">›</button>
        </div>
      )}

      {days.map((day) => {
        const dayItems = items.filter((i) => i.dayOfWeek === day);
        const dayDate = dayOfWeekToDate(weekStart, day);
        const today = isDateToday(dayDate);

        const colRegs = Array.from(new Set([
          ...aircrafts.map((a) => a.registration),
          ...dayItems.map((i) => i.aircraftRegistration),
        ]));
        const cols: BoardCol[] = colRegs
          .filter((reg) => dayItems.some((i) => i.aircraftRegistration === reg) || aircrafts.some((a) => a.registration === reg))
          .map((reg) => ({
            registration: reg,
            items: dayItems.filter((i) => i.aircraftRegistration === reg),
          }));

        return (
          <div key={day} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-3">
            {days.length > 1 && (
              <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${today ? "text-sky-400" : "text-slate-400"}`}>
                {DAY_LABEL[day]} {formatShortDate(dayDate)}{today ? " · Hoje" : ""}
              </p>
            )}
            {cols.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nenhum voo neste dia.</p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full table-fixed border-separate border-spacing-0.5"
                  style={{ minWidth: `${cols.length * colWidthPx + hoursGutterPx}px` }}
                >
                  <thead>
                    <tr>
                      <th className="w-7 sm:w-10" />
                      {cols.map((col) => (
                        <th key={col.registration} className="pb-1 text-center">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${(colorByAircraft.get(col.registration) ?? AIRCRAFT_COLOR_CLASSES[0]!).split(" ")[0]}`}
                            />
                            {col.registration}
                          </span>
                          <p className="text-[10px] font-normal text-slate-500">{col.items.length} voo{col.items.length !== 1 ? "s" : ""}</p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="align-top pr-1">
                        <div className="relative" style={{ height: `${boardHeight}px` }}>
                          {hours.map((h, idx) => (
                            <div key={h} className="absolute right-0 w-6 text-right text-[10px] font-mono text-slate-600 sm:w-9" style={{ top: `${idx * CAL_ROW_HEIGHT}px` }}>
                              {h}h
                            </div>
                          ))}
                        </div>
                      </td>
                      {cols.map((col) => (
                        <td key={col.registration} className="align-top p-0">
                          <div
                            ref={(el) => {
                              const key = `${day}|${col.registration}`;
                              if (el) colRefs.current.set(key, el);
                              else colRefs.current.delete(key);
                            }}
                            className="relative overflow-hidden rounded border border-slate-700/60 bg-slate-950/40"
                            style={{ height: `${boardHeight}px` }}
                            onClick={(e) => {
                              if (!onEmptySlotClick) return;
                              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                              const minutesFromTop = ((e.clientY - rect.top) / CAL_ROW_HEIGHT) * 60;
                              const snapped = Math.round(minutesFromTop / 30) * 30;
                              const totalMinutes = CAL_START_HOUR * 60 + Math.max(0, snapped);
                              const hh = Math.floor(totalMinutes / 60) % 24;
                              const mm = totalMinutes % 60;
                              const startTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                              onEmptySlotClick({ dayOfWeek: day, startHour: totalMinutes / 60, startTime, isNight: hh >= nightStartHour, targetAircraftRegistration: col.registration });
                            }}
                          >
                            {nightStartHour < endHour && (
                              <div className="pointer-events-none absolute inset-x-0 bg-indigo-950/25" style={{ top: `${(nightStartHour - CAL_START_HOUR) * CAL_ROW_HEIGHT}px`, bottom: 0 }} />
                            )}
                            {hours.map((h, idx) => (
                              <div key={h} className="absolute left-0 right-0 border-b border-slate-700/40" style={{ top: `${idx * CAL_ROW_HEIGHT}px` }} />
                            ))}
                            {col.items.map((item) => {
                              const topPx = timeTopPx(item.startTime);
                              const heightPx = Math.max(CAL_ROW_HEIGHT / 2, item.durationHours * CAL_ROW_HEIGHT);
                              const colorCls = getStudentFlightCardClasses(item);
                              const isInteractive = !item.isBlocked;
                              const itemDraggable = isInteractive && Boolean(onItemDrop) && (canDragItem ? canDragItem(item) : true);
                              return (
                                <div
                                  key={item.id}
                                  role={isInteractive ? "button" : undefined}
                                  tabIndex={isInteractive ? 0 : undefined}
                                  onPointerDown={(e) => {
                                    // Arrastar para alterar é exclusivo do desktop (mouse);
                                    // no celular o toque apenas abre os detalhes via clique.
                                    if (!itemDraggable || e.pointerType !== "mouse") return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    dragEndedRef.current = false;
                                    setDragState({ item, startX: e.clientX, startY: e.clientY, hasMoved: false, preview: null });
                                  }}
                                  onClick={(e) => {
                                    if (!isInteractive) return;
                                    e.stopPropagation();
                                    if (dragEndedRef.current) {
                                      dragEndedRef.current = false;
                                      return;
                                    }
                                    onItemClick(item);
                                  }}
                                  className={`absolute overflow-hidden rounded border-2 px-1.5 py-1 text-left text-[10px] text-white ${isInteractive ? `hover:ring-1 hover:ring-white/60 z-10 ${itemDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}` : "pointer-events-none z-0"} ${colorCls}`}
                                  style={{ top: `${topPx}px`, height: `${heightPx - 4}px`, left: "4px", right: "4px" }}
                                >
                                  <p className="truncate font-semibold">{item.studentLabel}</p>
                                  <p className="truncate opacity-90">{item.startTime}–{item.endTime}</p>
                                </div>
                              );
                            })}
                            {dragState?.hasMoved && dragState.preview
                              && dragState.preview.dayOfWeek === day
                              && dragState.preview.targetAircraftRegistration === col.registration ? (
                              <div
                                className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-white/70 bg-white/10 px-1.5 py-1 text-[10px] text-white"
                                style={{
                                  top: `${timeTopPx(dragState.preview.startTime)}px`,
                                  height: `${Math.max(CAL_ROW_HEIGHT / 2, dragState.item.durationHours * CAL_ROW_HEIGHT) - 4}px`,
                                  left: "4px",
                                  right: "4px",
                                }}
                              >
                                Solte para alterar
                              </div>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status Legend ────────────────────────────────────────────────────────────

const STATUS_LEGEND: Array<{ status: FlightStatus; label: string }> = [
  { status: "Pendente", label: "Solicitado" },
  { status: "Previsto", label: "Previsto" },
  { status: "Confirmado", label: "Confirmado" },
  { status: "Cancelado", label: "Cancelado" },
];

// ─── Flight List View ─────────────────────────────────────────────────────────

function resolveFlightOwn(flight: PublicScheduleFlight, actingForStudentId?: string): boolean {
  if (actingForStudentId) {
    return Boolean(flight.studentUserId && flight.studentUserId === actingForStudentId);
  }
  return flight.isOwn;
}

function FlightListView({
  flights,
  onFlightClick,
  actingForStudentId,
}: {
  flights: PublicScheduleFlight[];
  onFlightClick: (flight: PublicScheduleFlight) => void;
  actingForStudentId?: string;
}) {
  const ownFlights = useMemo(
    () => [...flights.filter((f) => resolveFlightOwn(f, actingForStudentId))].sort((a, b) => {
      if (a.flightDate !== b.flightDate) return a.flightDate.localeCompare(b.flightDate);
      return a.startTime.localeCompare(b.startTime);
    }),
    [flights, actingForStudentId],
  );

  if (ownFlights.length === 0) {
    return <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">Nenhum voo encontrado neste período.</div>;
  }

  return (
    <div className="space-y-2">
      {ownFlights.map((flight) => {
        const statusCls = STATUS_COLOR[flight.status] ?? "bg-slate-600/90 border-slate-500/60";
        const textCls = STATUS_TEXT_COLOR[flight.status] ?? "text-slate-400";
        return (
          <button
            key={flight.id}
            type="button"
            onClick={() => onFlightClick(flight)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                    {flight.status === "Pendente" ? "Solicitado" : flight.status}
                  </span>
                  <span className="text-xs font-semibold text-slate-200">{flight.aircraftIdent}</span>
                  <span className="text-xs text-slate-400">{formatLongDate(flight.flightDate)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-slate-500">Apresentação</p>
                    <p className="font-mono font-semibold text-slate-200">{flight.presentationTime}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Acionamento</p>
                    <p className="font-mono font-semibold text-slate-200">{flight.startTime}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Corte</p>
                    <p className="font-mono font-semibold text-slate-200">{flight.cutoffTime ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Encerramento</p>
                    <p className="font-mono font-semibold text-slate-200">{flight.endTime ?? "—"}</p>
                  </div>
                </div>
              </div>
              <span className={`mt-0.5 text-xs font-semibold ${textCls}`}>
                {minutesToHHMM(flight.durationMinutes)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Flight Detail Modal ──────────────────────────────────────────────────────
// Exportado: também é usado pelo "Meus Voos" (voos futuros no modo escala SAGA).

export type FlightEditConfig = {
  aircrafts: PublicScheduleAircraft[];
  rules: FlightScheduleRules;
  /** Intervalos ocupados (apresentação→encerramento, em minutos) da aeronave na data, sem o próprio voo. */
  getOccupiedIntervals?: (aircraftIdent: string, flightDate: string, ignoreFlightId: string) => OccupiedInterval[];
  onSubmit: (changes: { aircraftIdent: string; flightDate: string; startTime: string; durationMinutes: number; reason: string }) => Promise<void>;
};

// Mesmas regras do modal de solicitação: só horários livres, noturno fixo no início,
// duração limitada pelo noturno e erro (sem troca automática) quando não couber.
function FlightEditForm({ flight, config, onDone }: { flight: PublicScheduleFlight; config: FlightEditConfig; onDone: () => void }) {
  const { showToast } = useToast();
  const [aircraftIdent, setAircraftIdent] = useState(flight.aircraftIdent);
  const [flightDate, setFlightDate] = useState(flight.flightDate);
  const [startTime, setStartTime] = useState(flight.startTime);
  const [durationMinutes, setDurationMinutes] = useState(flight.durationMinutes || 60);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const rules = config.rules;

  const intervals = useMemo(
    () => config.getOccupiedIntervals?.(aircraftIdent, flightDate, flight.id) ?? [],
    [config, aircraftIdent, flightDate, flight.id],
  );
  const timeSlotOptions = useMemo(() => buildStartSlotOptions(rules, flightDate), [rules, flightDate]);
  const availableTimeSlots = useMemo(
    () => timeSlotOptions.filter((opt) =>
      slotFitsIntervals(intervals, rules, flightDate, timeToMinutes(opt.value), minDurationFor(rules, flightDate)),
    ),
    [timeSlotOptions, intervals, rules, flightDate],
  );
  const dayTimeOptions = availableTimeSlots.filter((o) => !o.isNight);
  const nightTimeOptions = availableTimeSlots.filter((o) => o.isNight);
  const durationOptions = useMemo(() => buildDurationChoices(rules, flightDate, startTime), [rules, flightDate, startTime]);

  // Duração se ajusta ao maior valor permitido; o acionamento escolhido nunca muda sozinho.
  useEffect(() => {
    if (durationOptions.length === 0 || durationOptions.includes(durationMinutes)) return;
    const fallback = [...durationOptions].reverse().find((value) => value <= durationMinutes)
      ?? durationOptions[durationOptions.length - 1]!;
    setDurationMinutes(fallback);
  }, [durationOptions, durationMinutes]);

  const startTimeInvalid = useMemo(() => {
    if (!startTime || !flightDate) return false;
    if (!timeSlotOptions.some((opt) => opt.value === startTime)) return true;
    return !slotFitsIntervals(intervals, rules, flightDate, timeToMinutes(startTime), durationMinutes);
  }, [startTime, flightDate, timeSlotOptions, intervals, rules, durationMinutes]);

  // Dia sem nenhum horário livre nesta aeronave: data em vermelho e campos abaixo inativos.
  const noSlotsForDay = Boolean(flightDate) && availableTimeSlots.length === 0;

  async function submit() {
    setSaving(true);
    try {
      await config.onSubmit({ aircraftIdent, flightDate, startTime, durationMinutes, reason: reason.trim() });
      onDone();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
      <p className="text-xs font-semibold text-sky-300">Alterar voo</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">Aeronave
          <select value={aircraftIdent} onChange={(e) => setAircraftIdent(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white">
            {!config.aircrafts.some((a) => a.registration === aircraftIdent) && <option value={aircraftIdent}>{aircraftIdent}</option>}
            {config.aircrafts.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.registration}>{aircraft.registration}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">Data
          <input
            type="date"
            value={flightDate}
            onChange={(e) => setFlightDate(e.target.value)}
            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-white ${noSlotsForDay ? "border-red-600 bg-red-950/40" : "border-slate-700 bg-slate-800"}`}
          />
        </label>
        <label className="text-xs text-slate-400">Acionamento
          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={noSlotsForDay}
            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-white disabled:opacity-50 ${startTimeInvalid && !noSlotsForDay ? "border-red-600 bg-red-950/40" : "border-slate-700 bg-slate-800"}`}
          >
            {!availableTimeSlots.some((opt) => opt.value === startTime) && <option value={startTime}>{startTime}</option>}
            {dayTimeOptions.length > 0 && (
              <optgroup label="Diurno">
                {dayTimeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
              </optgroup>
            )}
            {nightTimeOptions.length > 0 && (
              <optgroup label="Noturno">
                {nightTimeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label className="text-xs text-slate-400">Tempo de voo
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            disabled={noSlotsForDay}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {durationOptions.length === 0 && <option value={durationMinutes}>{minutesToHHMM(durationMinutes)}</option>}
            {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutesToHHMM(minutes)}</option>)}
          </select>
        </label>
      </div>
      {noSlotsForDay && (
        <p className="text-[11px] font-medium text-red-400">
          Não há nenhum horário disponível neste avião para este dia.
        </p>
      )}
      {startTimeInvalid && !noSlotsForDay && (
        <p className="text-[11px] font-medium text-red-400">
          Este horário não comporta o tempo de voo selecionado (ou já está ocupado). Escolha outro horário
          ou reduza o tempo de voo.
        </p>
      )}
      {/* Motivo obrigatório — registrado nas observações do voo */}
      <label className="block text-xs text-slate-400">Motivo da alteração
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={180}
          disabled={noSlotsForDay}
          placeholder="Ex.: compromisso no horário original; prefiro voar mais cedo..."
          className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Voltar</button>
        <button
          type="button"
          disabled={saving || startTimeInvalid || noSlotsForDay || durationOptions.length === 0 || !reason.trim()}
          onClick={() => void submit()}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar alteração"}
        </button>
      </div>
    </div>
  );
}

export function FlightDetailModal({
  flight,
  onClose,
  onCancel,
  onEdit,
  editConfig,
}: {
  flight: PublicScheduleFlight;
  onClose: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  /** Quando presente e o voo permite (mesmas regras do cancelamento), exibe o fluxo "Alterar voo". */
  editConfig?: FlightEditConfig;
}) {
  const statusCls = STATUS_COLOR[flight.status] ?? "bg-slate-600/90 border-slate-500/60";
  const [editing, setEditing] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-100">Detalhes do voo</h3>
            <p className="text-xs text-slate-400">{formatLongDate(flight.flightDate)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">Fechar</button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500">Aeronave</p>
            <p className="font-semibold text-slate-200">{flight.aircraftIdent}</p>
          </div>
          <div>
            <p className="text-slate-500">Status</p>
            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusCls}`}>
              {flight.status === "Pendente" ? "Solicitado" : flight.status}
            </span>
          </div>
          <div>
            <p className="text-slate-500">Apresentação</p>
            <p className="font-mono font-semibold text-slate-200">{flight.presentationTime}</p>
          </div>
          <div>
            <p className="text-slate-500">Acionamento</p>
            <p className="font-mono font-semibold text-slate-200">{flight.startTime}</p>
          </div>
          <div>
            <p className="text-slate-500">Corte</p>
            <p className="font-mono font-semibold text-slate-200">{flight.cutoffTime ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Encerramento</p>
            <p className="font-mono font-semibold text-slate-200">{flight.endTime ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Tempo de voo</p>
            <p className="font-mono font-semibold text-slate-200">{minutesToHHMM(flight.durationMinutes)}</p>
          </div>
        </div>

        {flight.notes ? (
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-2.5 text-xs">
            <p className="text-slate-500">Observações</p>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-300">{flight.notes}</p>
          </div>
        ) : null}

        {editing && editConfig ? (
          <FlightEditForm flight={flight} config={editConfig} onDone={() => setEditing(false)} />
        ) : null}

        {flight.canCancel && !editing && (
          <div className="flex justify-end gap-2">
            {onEdit || editConfig ? (
              <button
                type="button"
                onClick={() => {
                  if (onEdit) onEdit();
                  else setEditing(true);
                }}
                className="rounded-lg border border-sky-700 bg-sky-900/20 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/40"
              >
                Alterar voo
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/40"
            >
              Cancelar voo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cancellation Modal ───────────────────────────────────────────────────────
// Exportado: também é usado pelo "Meus Voos" (voos futuros no modo escala SAGA).

export function CancellationModal({
  flight,
  rules,
  onClose,
  onConfirm,
}: {
  flight: PublicScheduleFlight;
  rules: FlightScheduleRules;
  onClose: () => void;
  /** Recebe o motivo digitado pelo aluno — obrigatório; salvo nas observações do voo. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [penaltyPct, setPenaltyPct] = useState(0);
  const [penaltyHours, setPenaltyHours] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    previewScheduleCancellation(flight.id)
      .then((result) => {
        setPenaltyPct(result.penaltyPct);
        setPenaltyHours(result.penaltyHours);
      })
      .catch((err: Error) => showToast({ variant: "error", message: err.message }))
      .finally(() => setLoading(false));
  }, [flight.id, showToast]);

  const hasPenalty = penaltyHours > 0;
  const hasAnyPenalty = rules.cancellationPenalty48hPct > 0 || rules.cancellationPenalty24hPct > 0 || rules.cancellationPenalty12hPct > 0 || rules.cancellationPenalty1hPct > 0;

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div>
          <h3 className="font-semibold text-red-300">Cancelar voo</h3>
          <p className="text-xs text-slate-400">{formatLongDate(flight.flightDate)} · {flight.aircraftIdent}</p>
        </div>

        {/* Cancellation policy */}
        {hasAnyPenalty && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-3 text-xs text-amber-200">
            <p className="mb-1.5 font-semibold">Política de cancelamento da escola</p>
            <div className="space-y-0.5 text-amber-100/80">
              {rules.cancellationPenalty48hPct > 0 && <p>Entre 24h e 48h antes: <strong>{rules.cancellationPenalty48hPct}%</strong> de multa</p>}
              {rules.cancellationPenalty24hPct > 0 && <p>Entre 12h e 24h antes: <strong>{rules.cancellationPenalty24hPct}%</strong> de multa</p>}
              {rules.cancellationPenalty12hPct > 0 && <p>Entre 1h e 12h antes: <strong>{rules.cancellationPenalty12hPct}%</strong> de multa</p>}
              {rules.cancellationPenalty1hPct > 0 && <p>Menos de 1h antes: <strong>{rules.cancellationPenalty1hPct}%</strong> de multa</p>}
            </div>
          </div>
        )}

        {/* Penalty for this cancellation */}
        {loading ? (
          <p className="text-center text-sm text-slate-500">Calculando multa...</p>
        ) : (
          <div className={`rounded-xl border p-3 text-sm ${hasPenalty ? "border-red-700/40 bg-red-900/20 text-red-200" : "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"}`}>
            {hasPenalty ? (
              <>
                <p className="font-semibold">Este cancelamento gera multa</p>
                <p className="mt-1 text-xs">
                  {penaltyPct}% de {minutesToHHMM(flight.durationMinutes)} = <strong>{minutesToHHMM(Math.round(penaltyHours * 60))}</strong> de crédito serão debitados.
                </p>
              </>
            ) : (
              <p className="font-semibold">Este cancelamento não gera multa.</p>
            )}
          </div>
        )}

        {/* Motivo obrigatório — vai para as observações do voo */}
        <label className="block text-xs text-slate-400">Motivo do cancelamento
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={180}
            placeholder="Ex.: imprevisto no trabalho; condição meteorológica..."
            className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Voltar
          </button>
          <button
            type="button"
            disabled={loading || confirming || !reason.trim()}
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {confirming ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type WeekBundle = Awaited<ReturnType<typeof getPublicSchedule>>;

export type StudentScheduleTabProps = {
  /** Agenda em nome de um aluno (modo tablet da escola). */
  actingForStudent?: {
    userId: string;
    name?: string;
    email?: string;
  };
  /** No modo tablet, direciona para a aba de créditos da mesma página. */
  onStaffCreditsCta?: () => void;
};

export function StudentScheduleTab({ actingForStudent, onStaffCreditsCta }: StudentScheduleTabProps = {}) {
  const { user } = useAuth();
  const actingForStudentId = actingForStudent?.userId;
  const scheduleStudentUserId = actingForStudentId ?? user?.id ?? "";
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(mondayIso);
  const [rules, setRules] = useState<FlightScheduleRules>(DEFAULT_FLIGHT_SCHEDULE_RULES);
  const [helpConfig, setHelpConfig] = useState<ScheduleStudentHelpConfig>(DEFAULT_SCHOOL_RULES.scheduleStudentHelp);
  const [mode, setMode] = useState<FlightScheduleRules["mode"]>("intentions");
  const [aircrafts, setAircrafts] = useState<PublicScheduleAircraft[]>([]);
  const [flights, setFlights] = useState<PublicScheduleFlight[]>([]);
  // Skeleton até a primeira carga (evita o flash de "sem escala") e na troca p/ semana não cacheada.
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [weekLoading, setWeekLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<PublicScheduleFlight | null>(null);
  // Solicitação em 2 etapas: 1 = voo (aeronave/data/horário), 2 = flexibilidade/obs/ciência.
  const [bookingStep, setBookingStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [aircraftIdent, setAircraftIdent] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [flexibilityMinutes, setFlexibilityMinutes] = useState(30);
  const [bookingNotes, setBookingNotes] = useState("");
  // Checkbox obrigatório de ciência (a escola confirma entre 48h e 12h antes)
  const [bookingAck, setBookingAck] = useState(false);
  // Mobile abre direto na visão diária; desktop na semanal.
  const [agendaView, setAgendaView] = useState<"weekly" | "daily" | "list">(() =>
    actingForStudent ? "daily" : defaultAgendaView(),
  );
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [onlyMyFlights, setOnlyMyFlights] = useState(false);
  const [blockedSlots, setBlockedSlots] = useState<PublicBlockedSlot[]>([]);

  // Cache de semanas já carregadas + dedupe de fetches em andamento (invalidado nas mutações).
  const weekCacheRef = useRef(new Map<string, WeekBundle>());
  const weekFetchRef = useRef(new Map<string, Promise<WeekBundle>>());

  // Credits from creditsDb
  const [creditSummaries, setCreditSummaries] = useState<StudentCreditModelSummary[]>([]);
  const [creditTotals, setCreditTotals] = useState<StudentCreditStatement["totals"] | null>(null);
  const [weekdayOnlyPurchasedHours, setWeekdayOnlyPurchasedHours] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const creditsLoadedRef = useRef(false);
  const creditsFetchingRef = useRef(false);

  // Escala futura (mês atual + 2): carregada UMA vez no primeiro acesso ao modal e
  // reaproveitada — só recarrega após solicitar/alterar/cancelar um voo.
  const [futureFlights, setFutureFlights] = useState<PublicScheduleFlight[]>([]);
  const [futureLoading, setFutureLoading] = useState(false);
  const futureLoadedRef = useRef(false);
  const futureFetchingRef = useRef(false);

  // Flight detail / cancellation modals
  const [detailFlight, setDetailFlight] = useState<PublicScheduleFlight | null>(null);
  const [cancelFlight, setCancelFlight] = useState<PublicScheduleFlight | null>(null);
  // Alteração proposta ao arrastar um voo próprio na agenda
  const [proposedChange, setProposedChange] = useState<{
    flight: PublicScheduleFlight;
    aircraftIdent: string;
    flightDate: string;
    startTime: string;
  } | null>(null);
  const [proposedSaving, setProposedSaving] = useState(false);
  // Motivo da alteração proposta pelo arrasto — obrigatório, vai para as observações.
  const [proposedReason, setProposedReason] = useState("");
  // Aviso da exceção "1h com crédito zerado"
  const [zeroCreditConfirmOpen, setZeroCreditConfirmOpen] = useState(false);
  // Modal de confirmação pós-solicitação (substitui o toast): informa o prazo de
  // confirmação/cancelamento; para lista de espera, a janela é de 24h a 48h antes.
  const [bookingSuccess, setBookingSuccess] = useState<{ waitlist: boolean; editing?: boolean } | null>(null);
  const bookingIgnoreFlightId = editingFlight?.id ?? "";

  const weekCacheKey = useCallback(
    (weekStartIso: string) => (actingForStudentId ? `${weekStartIso}|student:${actingForStudentId}` : weekStartIso),
    [actingForStudentId],
  );

  const normalizeWeekBundle = useCallback(
    (data: WeekBundle): WeekBundle => (actingForStudentId ? filterScheduleBundleForStudentView(data) : data),
    [actingForStudentId],
  );

  const fetchWeek = useCallback((ws: string): Promise<WeekBundle> => {
    const cacheKey = weekCacheKey(ws);
    const inFlight = weekFetchRef.current.get(cacheKey);
    if (inFlight) return inFlight;
    const scheduleOpts = actingForStudentId ? { forStudentUserId: actingForStudentId } : undefined;
    const promise = getPublicScheduleCached(ws, addDays(ws, 6), scheduleOpts)
      .then((data) => {
        const view = normalizeWeekBundle(data);
        weekCacheRef.current.set(cacheKey, view);
        return view;
      })
      .finally(() => { weekFetchRef.current.delete(cacheKey); });
    weekFetchRef.current.set(cacheKey, promise);
    return promise;
  }, [actingForStudentId, normalizeWeekBundle, weekCacheKey]);

  useEffect(() => {
    void getSchoolRules()
      .then((schoolRules) => setHelpConfig(schoolRules.scheduleStudentHelp))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apply = (data: WeekBundle) => {
      if (cancelled) return;
      setRules(data.rules);
      setMode(data.mode);
      setAircrafts(data.aircrafts);
      setFlights(data.flights);
      setBlockedSlots(data.blockedSlots);
      setAircraftIdent((current) => {
        if (current && data.aircrafts.some((aircraft) => aircraft.registration === current)) return current;
        return data.aircrafts[0]?.registration || "";
      });
      setFlightDate((current) => current || weekStart);
      setInitialLoaded(true);
      setWeekLoading(false);
      const nextWeekStart = addDays(weekStart, 7);
      if (!weekCacheRef.current.has(weekCacheKey(nextWeekStart))) {
        window.setTimeout(() => {
          if (!cancelled) void fetchWeek(nextWeekStart).catch(() => {});
        }, 0);
      }
    };
    const cached = weekCacheRef.current.get(weekCacheKey(weekStart));
    if (cached) {
      apply(cached);
    } else {
      setWeekLoading(true);
      fetchWeek(weekStart)
        .then(apply)
        .catch((error: Error) => {
          if (cancelled) return;
          showToast({ variant: "error", message: error.message });
          setWeekLoading(false);
          setInitialLoaded(true);
        });
    }
    // Prefetch da próxima semana em segundo plano (não recarrega o que já está no cache).
    return () => { cancelled = true; };
  }, [weekStart, reloadKey, fetchWeek, showToast, weekCacheKey]);

  // Após qualquer mutação (solicitar/alterar/cancelar) o cache é descartado e tudo recarrega.
  const invalidateAndReload = useCallback(() => {
    weekCacheRef.current.clear();
    invalidatePublicSchedule(); // limpa também o cache de módulo (senão o refetch volta dados velhos)
    creditsLoadedRef.current = false;
    futureLoadedRef.current = false;
    setReloadKey((value) => value + 1);
  }, []);

  // Load credits from creditsDb — mesmo cálculo da aba Créditos (inclusive o
  // modo simplificado via nightHoursDifferentFromDay da config de pacotes).
  useEffect(() => {
    if (!bookingOpen || !user?.id || !user.role || !scheduleStudentUserId || creditsLoadedRef.current || creditsFetchingRef.current) return;
    creditsFetchingRef.current = true;
    setCreditsLoading(true);
    void (async () => {
      try {
        const config = await getAvailableFlightCreditPackages().catch(() => null);
        const stmt = await getStudentCreditStatement({
          viewer: { userId: user.id, role: user.role },
          studentUserId: scheduleStudentUserId,
          nightHoursDifferentFromDay: config?.nightHoursDifferentFromDay !== false,
        });
        setCreditSummaries(stmt.summaries);
        setCreditTotals(stmt.totals);
        setWeekdayOnlyPurchasedHours(
          stmt.purchases
            .filter((purchase) => purchase.weekdayOnly)
            .reduce((acc, purchase) => acc + purchase.hours, 0),
        );
        creditsLoadedRef.current = true;
      } catch {
        setCreditSummaries([]);
        setCreditTotals(null);
        setWeekdayOnlyPurchasedHours(0);
        creditsLoadedRef.current = false;
      } finally {
        creditsFetchingRef.current = false;
        setCreditsLoading(false);
      }
    })();
  }, [bookingOpen, user?.id, user?.role, scheduleStudentUserId, reloadKey]);

  useEffect(() => { setFlexibilityMinutes(rules.slotMinutes); }, [rules.slotMinutes]);

  // Escala futura (mês atual + 2 meses): buscada apenas no PRIMEIRO acesso ao modal.
  // futureLoadedRef só é resetado por invalidateAndReload (após uma mutação).
  // IMPORTANTE: o estado de loading é SEMPRE limpo no finally (sem guard de cancelamento)
  // — fechar/reabrir o modal durante o fetch deixava o loading preso para sempre.
  useEffect(() => {
    if (!bookingOpen || futureLoadedRef.current || futureFetchingRef.current) return;
    futureFetchingRef.current = true;
    setFutureLoading(true);
    const now = new Date();
    const from = toLocalIso(now);
    const to = toLocalIso(new Date(now.getFullYear(), now.getMonth() + 3, 0, 12));
    void getPublicSchedule(from, to, actingForStudentId ? { forStudentUserId: actingForStudentId } : undefined)
      .then((data) => {
        futureLoadedRef.current = true;
        const view = actingForStudentId ? filterScheduleBundleForStudentView(data) : data;
        setFutureFlights(view.flights);
      })
      .catch(() => {
        // Falhou: mantém o que tiver e deixa tentar de novo na próxima abertura.
        futureLoadedRef.current = false;
      })
      .finally(() => {
        futureFetchingRef.current = false;
        setFutureLoading(false);
      });
  }, [bookingOpen, reloadKey, actingForStudentId]);

  // Voos futuros do próprio aluno — usados para "Horas futuras agendadas".
  const futureOwnFlights = useMemo(() => {
    const nowMs = Date.now();
    return futureFlights.filter((flight) => {
      if (editingFlight && flight.id === editingFlight.id) return false;
      if (!resolveFlightOwn(flight, actingForStudentId) || flight.status === "Cancelado") return false;
      const startMs = new Date(`${flight.flightDate}T${flight.startTime || "00:00"}:00`).getTime();
      return Number.isFinite(startMs) && startMs > nowMs;
    });
  }, [futureFlights, actingForStudentId, editingFlight]);

  // Saldo global (LIFO entre modelos): pools − horas futuras de todos os modelos.
  const selectedModelBalance = useMemo(() => {
    const modelId = aircrafts.find((aircraft) => aircraft.registration === aircraftIdent)?.modelId ?? null;
    const modelSummary = modelId ? creditSummaries.find((row) => row.aircraftModelId === modelId) : null;
    const globalBalanceHours = creditTotals?.balanceHours
      ?? (creditTotals
        ? Number((creditTotals.purchasedHours - creditTotals.consumedHours - (creditTotals.penaltyHours ?? 0)).toFixed(2))
        : 0);
    const allFutureFlights = futureOwnFlights.map((flight) => ({
      flightDate: flight.flightDate,
      hours: (flight.durationMinutes || 0) / 60,
    }));
    const futureHours = allFutureFlights.reduce((acc, flight) => acc + flight.hours, 0);
    const futureWeekdayHours = allFutureFlights
      .filter((flight) => !isWeekendDate(flight.flightDate))
      .reduce((acc, flight) => acc + flight.hours, 0);
    const futureWeekendHours = futureHours - futureWeekdayHours;
    const pools = creditTotals
      ? freeBalanceForDateFromPools(creditTotals, flightDate, allFutureFlights)
      : { freeHours: 0, weekdayOnlyRemaining: 0, anyDayRemaining: 0 };
    return {
      modelId,
      modelName: modelSummary?.aircraftModelName ?? aircraftIdent,
      creditHours: globalBalanceHours,
      futureHours,
      futureWeekdayHours,
      futureWeekendHours,
      freeHours: pools.freeHours,
      weekdayOnlyRemaining: pools.weekdayOnlyRemaining,
      anyDayRemaining: pools.anyDayRemaining,
      anyDayAvailableHours: creditTotals?.anyDayAvailableHours ?? 0,
      weekdayOnlyAvailableHours: creditTotals?.weekdayOnlyAvailableHours ?? 0,
    };
  }, [aircrafts, aircraftIdent, flightDate, futureOwnFlights, creditSummaries, creditTotals]);

  const showWeekdayCredits = weekdayOnlyPurchasedHours > 0.001;

  // Créditos: bloqueia envio no modal quando saldo livre não cobre o voo (inclui exceção "1h zerado").
  const bookingCreditCheck = useMemo(() => {
    const clear = { blocked: false, message: null as string | null, needsZeroCreditConfirm: false, showCreditsCta: false };
    if (!bookingOpen || !rules.requireCreditsForBooking) return clear;
    if (creditsLoading || futureLoading) {
      return { blocked: true, message: null, needsZeroCreditConfirm: false, showCreditsCta: false };
    }

    const modelId = aircrafts.find((aircraft) => aircraft.registration === aircraftIdent)?.modelId ?? null;
    if (!modelId) {
      return { blocked: true, message: "Aeronave sem modelo configurado — não é possível verificar créditos.", needsZeroCreditConfirm: false, showCreditsCta: false };
    }

    const freeHours = selectedModelBalance?.freeHours ?? 0;
    const requestedHours = durationMinutes / 60;

    if (freeHours + 0.001 >= requestedHours) return clear;

    if (canUseZeroCreditOneHourException(rules, durationMinutes, freeHours, creditTotals)) {
      return { blocked: false, message: null, needsZeroCreditConfirm: true, showCreditsCta: false };
    }

    if (
      isWeekendDate(flightDate) &&
      (selectedModelBalance?.weekdayOnlyRemaining ?? 0) > 0.001 &&
      (selectedModelBalance?.anyDayRemaining ?? 0) + 0.001 < requestedHours
    ) {
      return {
        blocked: true,
        message: `Crédito insuficiente para fim de semana. Você possui ${(selectedModelBalance?.weekdayOnlyRemaining ?? 0).toFixed(2)}h válidas apenas de segunda a sexta…`,
        needsZeroCreditConfirm: false,
        showCreditsCta: true,
      };
    }

    if (freeHours < -0.001) {
      return {
        blocked: true,
        message: `Seu saldo de créditos está negativo. Saldo livre para agendar: ${formatDecimalHours(freeHours)}. Não é possível marcar um voo nesta condição.`,
        needsZeroCreditConfirm: false,
        showCreditsCta: true,
      };
    }

    return {
      blocked: true,
      message: `Crédito insuficiente. Saldo livre para agendar: ${formatDecimalHours(Math.max(0, freeHours))}; este voo precisa de ${formatDecimalHours(durationMinutes / 60)}.`,
      needsZeroCreditConfirm: false,
      showCreditsCta: true,
    };
  }, [
    bookingOpen,
    rules.requireCreditsForBooking,
    rules.allowZeroCreditOneHour,
    creditsLoading,
    futureLoading,
    aircrafts,
    aircraftIdent,
    flightDate,
    selectedModelBalance?.freeHours,
    selectedModelBalance?.weekdayOnlyRemaining,
    selectedModelBalance?.anyDayRemaining,
    creditTotals,
    durationMinutes,
  ]);
  const bookingCreditPending = rules.requireCreditsForBooking && (creditsLoading || futureLoading);

  // Tempo de voo: além dos limites min/max do dia, um acionamento diurno não pode
  // invadir o período noturno — ex.: noturno às 17:30 e acionamento 16:30 → máx. 1h (item 8).
  const durationOptions = useMemo(() => buildDurationChoices(rules, flightDate, startTime), [rules, flightDate, startTime]);

  // Se as opções encolherem (ex.: acionamento perto do noturno), ajusta o tempo de voo
  // para o maior permitido — o horário de acionamento escolhido NUNCA muda sozinho.
  useEffect(() => {
    if (!bookingOpen || durationOptions.length === 0 || durationOptions.includes(durationMinutes)) return;
    const fallback = [...durationOptions].reverse().find((value) => value <= durationMinutes)
      ?? durationOptions[durationOptions.length - 1]!;
    setDurationMinutes(fallback);
  }, [bookingOpen, durationOptions, durationMinutes]);

  const timeSlotOptions = useMemo(() => buildStartSlotOptions(rules, flightDate), [rules, flightDate]);

  // Item 1: só exibe horários realmente livres na aeronave/data escolhidas — o bloco
  // completo do voo (apresentação→encerramento, com buffers) não pode encostar em
  // nenhum outro voo ativo; é isso que garante a folga mínima até o voo seguinte.
  const occupiedByAircraftDate = useMemo(() => {
    const map = new Map<string, Array<OccupiedInterval & { flightId: string }>>();
    const seen = new Set<string>();
    for (const flight of [...flights, ...futureFlights]) {
      if (seen.has(flight.id)) continue;
      seen.add(flight.id);
      if (flight.status === "Cancelado") continue;
      const start = timeToMinutes(flight.presentationTime || flight.startTime);
      const end = Math.max(start + 1, timeToMinutes(flight.endTime || flight.cutoffTime || flight.startTime));
      const key = `${flight.aircraftIdent}|${flight.flightDate}`;
      const rows = map.get(key) ?? [];
      rows.push({ start, end, flightId: flight.id });
      map.set(key, rows);
    }
    return map;
  }, [flights, futureFlights]);

  // Intervalos ocupados de uma aeronave/data — opcionalmente ignorando um voo (alteração/drag).
  const getOccupiedIntervals = useCallback(
    (aircraft: string, date: string, ignoreFlightId = ""): OccupiedInterval[] =>
      (occupiedByAircraftDate.get(`${aircraft}|${date}`) ?? []).filter((interval) => interval.flightId !== ignoreFlightId),
    [occupiedByAircraftDate],
  );

  const slotFits = useCallback(
    (startMin: number, duration: number): boolean =>
      slotFitsIntervals(getOccupiedIntervals(aircraftIdent, flightDate, bookingIgnoreFlightId), rules, flightDate, startMin, duration),
    [getOccupiedIntervals, aircraftIdent, flightDate, rules, bookingIgnoreFlightId],
  );

  // ─── Lista de espera ─────────────────────────────────────────────────────────
  const isWaitlistAircraft = useCallback(
    (ident: string): boolean => {
      const target = normalizeIdent(ident);
      if (!target) return false;
      if ((rules.studentWaitlistAircraftIdents ?? []).some((value) => normalizeIdent(value) === target)) return true;
      return aircrafts.some((aircraft) => aircraft.isWaitlist && normalizeIdent(aircraft.registration) === target);
    },
    [rules.studentWaitlistAircraftIdents, aircrafts],
  );
  const waitlistSelected = isWaitlistAircraft(aircraftIdent);

  // A lista de espera só pode ser usada quando NENHUM avião real comporta o voo no
  // horário escolhido — se algum estiver livre, barramos a passagem para a etapa 2.
  const waitlistFreeAircraft = useMemo(() => {
    if (!waitlistSelected || !flightDate || !startTime) return null;
    for (const aircraft of aircrafts) {
      if (aircraft.isWaitlist || isWaitlistAircraft(aircraft.registration)) continue;
      const intervals = getOccupiedIntervals(aircraft.registration, flightDate, bookingIgnoreFlightId);
      if (slotFitsIntervals(intervals, rules, flightDate, timeToMinutes(startTime), durationMinutes)) {
        return aircraft.registration;
      }
    }
    return null;
  }, [waitlistSelected, aircrafts, isWaitlistAircraft, getOccupiedIntervals, rules, flightDate, startTime, durationMinutes, bookingIgnoreFlightId]);
  const waitlistBlocked = Boolean(waitlistFreeAircraft);

  // Disponibilidade dos slots é avaliada com a duração MÍNIMA do dia: assim um horário
  // que só comporta um voo mais curto continua aparecendo, e o tempo de voo se ajusta.
  const minDurationMinutes = useMemo(() => minDurationFor(rules, flightDate), [rules, flightDate]);

  const availableTimeSlots = useMemo(
    () => timeSlotOptions.filter((opt) => slotFits(timeToMinutes(opt.value), minDurationMinutes)),
    [timeSlotOptions, slotFits, minDurationMinutes],
  );

  const dayTimeOptions = availableTimeSlots.filter((o) => !o.isNight);
  const nightTimeOptions = availableTimeSlots.filter((o) => o.isNight);

  // Item 5: o acionamento escolhido nunca muda sozinho — se a combinação com o tempo
  // de voo não couber, mostramos um erro e bloqueamos o envio.
  const startTimeInvalid = useMemo(() => {
    if (!flightDate || !aircraftIdent || !startTime) return false;
    if (!timeSlotOptions.some((opt) => opt.value === startTime)) return true;
    return !slotFits(timeToMinutes(startTime), durationMinutes);
  }, [flightDate, aircraftIdent, startTime, timeSlotOptions, slotFits, durationMinutes]);

  // Item 11: trava da data pela antecedência mínima configurada.
  const minBookingDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(0, Math.ceil(rules.minBookingLeadDays)));
    return toLocalIso(date);
  }, [rules.minBookingLeadDays]);
  const dateTooEarly = Boolean(flightDate) && flightDate < minBookingDate;

  // Dia sem nenhum horário livre nesta aeronave: data em vermelho e campos abaixo inativos.
  const noSlotsForDay = Boolean(flightDate) && !dateTooEarly && availableTimeSlots.length === 0;

  // Flexibility options (item 5)
  const flexibilityOptions = useMemo(
    () => [1, 2, 3, 4].map((mult) => ({ value: rules.slotMinutes * mult, label: minutesToHHMM(rules.slotMinutes * mult) })),
    [rules.slotMinutes],
  );

  const preview = {
    presentation: addMinutes(startTime, -rules.bufferBeforeMinutes),
    start: startTime,
    cutoff: addMinutes(startTime, durationMinutes),
    end: addMinutes(startTime, durationMinutes + rules.bufferAfterMinutes),
  };

  // Filtered calendar items
  const calendarItems = useMemo<CalendarFlightItem[]>(() => {
    const flightItems = flights
      .filter((flight) => {
        const own = resolveFlightOwn(flight, actingForStudentId);
        if (flight.status === "Cancelado" && !own) return false;
        if (onlyMyFlights && !own) return false;
        return true;
      })
      .map((flight) => {
        const own = resolveFlightOwn(flight, actingForStudentId);
        const occupiedStart = flight.presentationTime || flight.startTime;
        const occupiedEnd = flight.endTime || flight.cutoffTime || flight.startTime;
        const occupiedMinutes = Math.max(rules.slotMinutes, timeToMinutes(occupiedEnd) - timeToMinutes(occupiedStart));
        const date = new Date(`${flight.flightDate}T12:00:00`);
        return {
          id: flight.id,
          studentId: flight.studentUserId || flight.id,
          studentLabel: own ? (flight.status === "Pendente" ? "Solicitado" : flight.status) : "Ocupado",
          instructorId: null,
          instructorLabel: null,
          totalWeightLabel: "",
          aircraftRegistration: flight.aircraftIdent,
          dayOfWeek: date.getDay(),
          startHour: timeToMinutes(occupiedStart) / 60,
          durationHours: occupiedMinutes / 60,
          flightStatus: normalizeScheduleFlightStatus(flight.status),
          startTime: occupiedStart,
          endTime: occupiedEnd,
          isOwn: own,
        } satisfies CalendarFlightItem;
      });

    // Convert blocked slots to calendar items so they appear as cards in all views
    const blockedItems: CalendarFlightItem[] = blockedSlots.map((s) => {
      const startHH = String(Math.floor(s.startHour)).padStart(2, "0");
      const startMM = String(Math.round((s.startHour % 1) * 60)).padStart(2, "0");
      const endHH = String(Math.floor(s.endHour)).padStart(2, "0");
      const endMM = String(Math.round((s.endHour % 1) * 60)).padStart(2, "0");
      return {
        id: `blocked-${s.aircraftRegistration}-${s.dayOfWeek}-${s.startHour}`,
        studentId: "blocked",
        studentLabel: `${s.aircraftRegistration} • Bloqueado`,
        instructorId: null,
        instructorLabel: null,
        totalWeightLabel: "",
        aircraftRegistration: s.aircraftRegistration,
        dayOfWeek: s.dayOfWeek,
        startHour: s.startHour,
        durationHours: s.endHour - s.startHour,
        startTime: `${startHH}:${startMM}`,
        endTime: `${endHH}:${endMM}`,
        isOwn: false,
        isBlocked: true,
      };
    });

    return [...flightItems, ...blockedItems];
  }, [flights, rules.slotMinutes, onlyMyFlights, blockedSlots, actingForStudentId]);

  const selectedDayIndex = Math.max(0, DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]));
  const visibleDays = agendaView === "weekly"
    ? DAY_ORDER
    : agendaView === "daily"
      ? [DAY_ORDER[selectedDayIndex]!]
      : DAY_ORDER; // list uses all

  // Deslize horizontal disparado SÓ pelas setas de navegação (não ao selecionar
  // um dia no cabeçalho).
  const { ref: studentBoardSlideRef, slide: slideStudentBoard } = useDirectionalSlide();

  // Mobile: o seletor da visão diária mostra uma janela de 3 dias em torno do dia
  // selecionado; as setas avançam/recuam a janela (3 dias por clique).
  const headerDays: readonly number[] = isMobile
    ? DAY_ORDER.slice(
        Math.max(0, Math.min(selectedDayIndex - 1, DAY_ORDER.length - 3)),
        Math.max(0, Math.min(selectedDayIndex - 1, DAY_ORDER.length - 3)) + 3,
      )
    : DAY_ORDER;

  // Escala do aluno: dias anteriores a hoje ficam bloqueados (não seleciona, não agenda)
  // e a seta de voltar não pode ir para períodos anteriores ao período que contém hoje.
  const todayIso = toLocalIso(new Date());
  const firstVisibleDayOfWeek = agendaView === "daily" ? (headerDays[0] ?? 1) : (visibleDays[0] ?? 1);
  const firstVisibleDate = toLocalIso(dayOfWeekToDate(weekStart, firstVisibleDayOfWeek));
  const canGoBack = firstVisibleDate > todayIso;

  // A visão semanal não existe no mobile.
  useEffect(() => {
    if (isMobile && agendaView === "weekly") setAgendaView("daily");
  }, [isMobile, agendaView]);

  // Calendar-level blocked slots (aggregate — kept for CalendarGrid overlay)
  const calendarBlockedSlots = useMemo(
    () => blockedSlots.map(({ dayOfWeek, startHour, endHour }) => ({ dayOfWeek, startHour, endHour })),
    [blockedSlots],
  );

  function openBookingAt(target?: CalendarDropTarget) {
    setEditingFlight(null);
    setBookingAck(false);
    setBookingStep(1);
    setBookingNotes("");
    if (target) {
      setFlightDate(addDays(weekStart, target.dayOfWeek === 0 ? 6 : target.dayOfWeek - 1));
      setStartTime(addMinutes(target.startTime, rules.bufferBeforeMinutes));
      if (target.targetAircraftRegistration) setAircraftIdent(target.targetAircraftRegistration);
    } else if (agendaView === "daily") {
      // Na visão diária o default é o dia selecionado (se a antecedência permitir).
      const selectedDate = addDays(weekStart, selectedDay === 0 ? 6 : selectedDay - 1);
      setFlightDate(selectedDate >= minBookingDate ? selectedDate : resolveDefaultBookingDate(rules.minBookingLeadDays));
    } else {
      setFlightDate(resolveDefaultBookingDate(rules.minBookingLeadDays));
    }
    setBookingOpen(true);
  }

  function openBookingForEdit(flight: PublicScheduleFlight) {
    setEditingFlight(flight);
    setBookingAck(false);
    setBookingStep(1);
    setBookingNotes("");
    setAircraftIdent(flight.aircraftIdent);
    setFlightDate(flight.flightDate);
    setStartTime(flight.startTime);
    setDurationMinutes(flight.durationMinutes || 60);
    setFlexibilityMinutes(rules.slotMinutes);
    setDetailFlight(null);
    setBookingOpen(true);
  }

  function closeBookingModal() {
    setBookingOpen(false);
    setZeroCreditConfirmOpen(false);
    setEditingFlight(null);
  }

  function moveCalendar(direction: -1 | 1) {
    // Aluno não volta para períodos anteriores ao que contém o dia de hoje.
    if (direction === -1 && !canGoBack) return;
    // Só as setas chamam moveCalendar → o deslize fica restrito à navegação.
    slideStudentBoard(direction === 1 ? "forward" : "back");
    if (agendaView === "weekly" || agendaView === "list") {
      setWeekStart((current) => addDays(current, direction * 7));
      return;
    }
    // Diária no desktop: as setas trocam a SEMANA inteira (mantendo o dia da semana).
    if (!isMobile) {
      setWeekStart((current) => addDays(current, direction * 7));
      return;
    }
    // Mobile: as setas pulam para os 3 dias seguintes/anteriores.
    const nextIndex = selectedDayIndex + direction * 3;
    if (nextIndex >= 0 && nextIndex < DAY_ORDER.length) {
      setSelectedDay(DAY_ORDER[nextIndex]!);
      return;
    }
    setWeekStart((current) => addDays(current, direction * 7));
    setSelectedDay(direction < 0 ? DAY_ORDER[DAY_ORDER.length - 1]! : DAY_ORDER[0]!);
  }

  function handleItemClick(item: CalendarFlightItem) {
    if (item.isBlocked) return; // blocked slots have no detail modal
    const flight = flights.find((f) => f.id === item.id);
    if (flight) setDetailFlight(flight);
  }

  async function executeCancelFlight(flight: PublicScheduleFlight, reason: string) {
    await cancelScheduleFlight(flight.id, { reason });
    showToast({ variant: "success", message: "Voo cancelado." });
    setCancelFlight(null);
    setDetailFlight(null);
    invalidateAndReload();
  }

  async function confirmBookingRequest() {
    if (editingFlight) {
      await rescheduleScheduleFlight({
        flightId: editingFlight.id,
        aircraftIdent,
        flightDate,
        startTime,
        durationMinutes,
        reason: bookingNotes.trim() || undefined,
      });
      closeBookingModal();
      setBookingNotes("");
      setBookingSuccess({ waitlist: waitlistSelected, editing: true });
      invalidateAndReload();
      return;
    }
    await requestScheduleFlight({
      aircraftIdent,
      flightDate,
      startTime,
      durationMinutes,
      flexibilityMinutes,
      notes: bookingNotes.trim() || undefined,
      ...(actingForStudentId ? { studentUserId: actingForStudentId } : {}),
    });
    closeBookingModal();
    setBookingNotes("");
    // Modal (não toast): informa que é uma solicitação e o prazo da resposta da escola.
    setBookingSuccess({ waitlist: waitlistSelected });
    invalidateAndReload();
  }

  // Cards arrastáveis: somente os voos do próprio aluno, ativos e canceláveis.
  const canDragItem = useCallback(
    (item: CalendarFlightItem) =>
      Boolean(item.isOwn) && !item.isBlocked && item.flightStatus !== "Cancelado",
    [],
  );

  // Item 8: arrastar um voo próprio propõe a alteração — confirmada em modal antes de enviar.
  // O drop em cima de outro voo (ou em horário que não comporta o voo) é recusado.
  function handleItemDrop(item: CalendarFlightItem, target: CalendarDropTarget) {
    if (!canDragItem(item)) return;
    const flight = flights.find((f) => f.id === item.id);
    if (!flight || !flight.canCancel) return;
    const newDate = addDays(weekStart, target.dayOfWeek === 0 ? 6 : target.dayOfWeek - 1);
    // O card é posicionado pela apresentação; o acionamento fica um buffer depois.
    const newStart = addMinutes(target.startTime, rules.bufferBeforeMinutes);
    const newAircraft = target.targetAircraftRegistration || flight.aircraftIdent;
    if (newDate === flight.flightDate && newStart === flight.startTime && newAircraft === flight.aircraftIdent) return;
    // Mesmas regras do formulário: antecedência mínima e horário dentro da grade
    // (início da escala, cadência de slot, noturno só no horário/dia permitido) —
    // sem isso o servidor rejeitava depois do modal de confirmação.
    if (newDate < minBookingDate) {
      showToast({
        variant: "error",
        message: `Antecedência mínima de ${rules.minBookingLeadDays} dia${rules.minBookingLeadDays !== 1 ? "s" : ""} — escolha a partir de ${formatDate(minBookingDate)}.`,
      });
      return;
    }
    if (!buildStartSlotOptions(rules, newDate).some((opt) => opt.value === newStart)) {
      showToast({ variant: "error", message: "Horário fora da grade de agendamento. Solte o voo em um horário válido." });
      return;
    }
    const duration = flight.durationMinutes || 60;
    const intervals = getOccupiedIntervals(newAircraft, newDate, flight.id);
    if (!slotFitsIntervals(intervals, rules, newDate, timeToMinutes(newStart), duration)) {
      showToast({ variant: "error", message: "Horário indisponível: já existe um voo nesse intervalo ou o horário não comporta este voo." });
      return;
    }
    setProposedReason("");
    setProposedChange({ flight, aircraftIdent: newAircraft, flightDate: newDate, startTime: newStart });
  }

  async function confirmProposedChange() {
    if (!proposedChange) return;
    setProposedSaving(true);
    try {
      await rescheduleScheduleFlight({
        flightId: proposedChange.flight.id,
        aircraftIdent: proposedChange.aircraftIdent,
        flightDate: proposedChange.flightDate,
        startTime: proposedChange.startTime,
        durationMinutes: proposedChange.flight.durationMinutes || 60,
        reason: proposedReason.trim(),
      });
      showToast({ variant: "success", message: "Voo alterado." });
      setProposedChange(null);
      invalidateAndReload();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setProposedSaving(false);
    }
  }

  async function submitBooking() {
    if (bookingCreditCheck.blocked) {
      showToast({
        variant: "error",
        message: bookingCreditCheck.message ?? "Crédito insuficiente para este voo.",
      });
      return;
    }
    setSaving(true);
    try {
      const availability = await checkScheduleAvailability({
        aircraftIdent,
        flightDate,
        startTime,
        durationMinutes,
        ...(editingFlight ? { flightId: editingFlight.id } : {}),
        ...(actingForStudentId ? { studentUserId: actingForStudentId } : {}),
      });
      if (rules.requireCreditsForBooking && !availability.creditSufficient) {
        const freeHours =
          availability.creditFreeHours ??
          selectedModelBalance?.freeHours;
        const canUseZeroCreditException = canUseZeroCreditOneHourException(
          rules,
          durationMinutes,
          freeHours ?? -1,
          creditTotals,
        );
        if (canUseZeroCreditException) {
          setZeroCreditConfirmOpen(true);
          return;
        }
        throw new Error(`Crédito insuficiente. Disponível: ${availability.creditAvailableHours.toFixed(2)}h.`);
      }
      await confirmBookingRequest();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function submitZeroCreditBooking() {
    setSaving(true);
    try {
      await confirmBookingRequest();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // Skeleton até a primeira resposta — evita o flash de "sem escala" antes da agenda.
  if (!initialLoaded) {
    return (
      <ScheduleStudentChrome rules={rules} helpConfig={helpConfig} mode={mode}>
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-800" />
        <ScheduleSkeleton />
      </ScheduleStudentChrome>
    );
  }
  if (mode === "intentions") {
    if (actingForStudent) {
      const studentLabel = actingForStudent.name || actingForStudent.email || "o aluno";
      return (
        <ScheduleStudentChrome rules={rules} helpConfig={helpConfig} mode={mode}>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            A escola está no modo de intenções semanais. Peça que {studentLabel} acesse a conta dele para preencher as intenções, ou aguarde a abertura da escala para agendamento.
          </div>
        </ScheduleStudentChrome>
      );
    }
    return (
      <ScheduleStudentChrome rules={rules} helpConfig={helpConfig} mode={mode}>
        <AgendamentoTab />
      </ScheduleStudentChrome>
    );
  }
  if (mode === "closed") {
    return (
      <ScheduleStudentChrome rules={rules} helpConfig={helpConfig} mode={mode}>
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          A escala está fechada no momento.
        </div>
      </ScheduleStudentChrome>
    );
  }

  const isNonWeekly = agendaView === "daily";

  return (
    <ScheduleStudentChrome
      rules={rules}
      helpConfig={helpConfig}
      mode={mode}
      toolbarLeading={
        <>
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {([
              ["weekly", "Semanal"],
              ["daily", "Diária"],
              ["list", "Lista"],
            ] as const).filter(([value]) => !(isMobile && value === "weekly")).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAgendaView(value)}
                className={`border-r border-slate-700 px-3 py-2 text-xs transition-colors last:border-r-0 sm:py-1.5 ${
                  agendaView === value ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {agendaView !== "list" && (
            <button
              type="button"
              onClick={() => setOnlyMyFlights((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                onlyMyFlights ? "border-sky-500 bg-sky-600/20 text-sky-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {onlyMyFlights ? "Todos os voos" : "Somente meus voos"}
            </button>
          )}
        </>
      }
      toolbarTrailing={
        <>
          {agendaView === "list" && (
            <div className="flex gap-1">
              <button type="button" onClick={() => moveCalendar(-1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">‹</button>
              <button type="button" onClick={() => moveCalendar(1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">›</button>
            </div>
          )}
          {mode === "booking" && (
            <button type="button" onClick={() => openBookingAt()} className="inline-flex h-9 shrink-0 items-center rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 sm:h-[38px] sm:px-4 sm:text-sm">
              + Solicitar voo
            </button>
          )}
        </>
      }
    >

      {/* Status legend (not in list view) */}
      {agendaView !== "list" && (
        <div className="flex flex-wrap gap-3">
          {STATUS_LEGEND.map(({ status, label }) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLOR[status]?.split(" ")[0] ?? "bg-slate-600"}`} />
              <span className="text-[11px] text-slate-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-700/70" />
            <span className="text-[11px] text-slate-400">Ocupado</span>
          </div>
        </div>
      )}

      <div className="relative overflow-hidden">
        {weekLoading ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
            <span className="rounded-full border border-sky-500/30 bg-slate-950/90 px-3 py-1 text-xs font-semibold text-sky-300 shadow-lg shadow-slate-950/40">
              Atualizando escala...
            </span>
          </div>
        ) : null}
        <div ref={studentBoardSlideRef} className={weekLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* List view */}
          {agendaView === "list" && (
            <FlightListView
              flights={flights}
              onFlightClick={setDetailFlight}
              actingForStudentId={actingForStudentId}
            />
          )}

          {/* Weekly view */}
          {agendaView === "weekly" && (
            <CalendarGrid
              items={calendarItems.filter((i) => !i.isBlocked)}
              days={visibleDays}
              title="Agenda semanal"
              colorByAircraft={new Map()}
              borderByInstructor={new Map()}
              weekStart={weekStart}
              nightStartHour={rules.nightFlightStartHour}
              privacyMode
              showTotals={false}
              showGeneratorLegend={false}
              hasPrevWeek={canGoBack}
              hasNextWeek
              onPrevWeek={() => moveCalendar(-1)}
              onNextWeek={() => moveCalendar(1)}
              onDayHeaderClick={(day) => {
                setSelectedDay(day);
                setAgendaView("daily");
              }}
              getItemColor={studentItemColor}
              blockedSlots={calendarBlockedSlots}
              pastBeforeDate={todayIso}
              onItemClick={handleItemClick}
              onItemDrop={mode === "booking" && rules.sagaOnlySchedule ? handleItemDrop : undefined}
              canDragItem={canDragItem}
              onEmptySlotClick={mode === "booking" ? openBookingAt : undefined}
            />
          )}

          {/* Daily / 3-day: aircraft column board */}
          {isNonWeekly && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-4">
              <StudentAircraftBoard
                days={visibleDays as number[]}
                items={calendarItems}
                aircrafts={aircrafts}
                weekStart={weekStart}
                nightStartHour={rules.nightFlightStartHour}
                showDayPicker={agendaView === "daily"}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onPrevDay={() => moveCalendar(-1)}
                onNextDay={() => moveCalendar(1)}
                disablePrev={!canGoBack}
                minSelectableDate={todayIso}
                headerDays={headerDays}
                onItemClick={handleItemClick}
                onEmptySlotClick={mode === "booking" ? openBookingAt : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* Flight detail modal */}
      {detailFlight && !cancelFlight && (
        <FlightDetailModal
          flight={detailFlight}
          onClose={() => setDetailFlight(null)}
          onCancel={() => setCancelFlight(detailFlight)}
          onEdit={
            mode === "booking" && rules.sagaOnlySchedule && detailFlight.canCancel
              ? () => openBookingForEdit(detailFlight)
              : undefined
          }
        />
      )}

      {/* Alteração proposta via arrasto */}
      {proposedChange && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h3 className="font-semibold text-sky-300">Alterar voo</h3>
              <p className="text-xs text-slate-400">Revise a alteração proposta antes de confirmar.</p>
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 text-xs">
              <span />
              <span className="font-semibold text-slate-500">De</span>
              <span className="font-semibold text-sky-300">Para</span>
              <span className="text-slate-500">Data</span>
              <span className="text-slate-300">{formatDate(proposedChange.flight.flightDate)}</span>
              <span className="font-semibold text-sky-200">{formatDate(proposedChange.flightDate)}</span>
              <span className="text-slate-500">Acionamento</span>
              <span className="font-mono text-slate-300">{proposedChange.flight.startTime}</span>
              <span className="font-mono font-semibold text-sky-200">{proposedChange.startTime}</span>
              <span className="text-slate-500">Aeronave</span>
              <span className="text-slate-300">{proposedChange.flight.aircraftIdent}</span>
              <span className="font-semibold text-sky-200">{proposedChange.aircraftIdent}</span>
            </div>
            {/* Motivo obrigatório — registrado nas observações do voo */}
            <label className="block text-xs text-slate-400">Motivo da alteração
              <textarea
                value={proposedReason}
                onChange={(e) => setProposedReason(e.target.value)}
                rows={2}
                maxLength={180}
                placeholder="Ex.: compromisso no horário original; prefiro voar mais cedo..."
                className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProposedChange(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={proposedSaving || !proposedReason.trim()}
                onClick={() => void confirmProposedChange()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {proposedSaving ? "Enviando..." : "Confirmar alteração"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation modal */}
      {cancelFlight && (
        <CancellationModal
          flight={cancelFlight}
          rules={rules}
          onClose={() => setCancelFlight(null)}
          onConfirm={(reason) => executeCancelFlight(cancelFlight, reason)}
        />
      )}

      {/* Confirmação pós-solicitação (substitui o toast em todos os cenários) */}
      {bookingSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-emerald-700/50 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h3 className="font-semibold text-emerald-300">
                {bookingSuccess.editing ? "Alteração enviada" : "Solicitação de agendamento enviada"}
              </h3>
              {bookingSuccess.waitlist ? (
                <>
                  <p className="mt-2 text-sm text-slate-300">
                    Sua {bookingSuccess.editing ? "alteração" : "solicitação de agendamento"} foi registrada com sucesso na <strong>lista de espera</strong>.
                  </p>
                  <p className="mt-2 rounded-lg border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-200">
                    O voo poderá ser confirmado a depender de ajustes ou cancelamentos de outros voos — até{" "}
                    <strong>12h antes do voo</strong> você receberá a <strong>confirmação ou o cancelamento</strong> da
                    solicitação.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-300">
                  Sua {bookingSuccess.editing ? "alteração" : "solicitação de agendamento"} foi registrada com sucesso. Até <strong>12h antes do voo</strong> você
                  receberá a <strong>confirmação ou o cancelamento</strong> da solicitação.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setBookingSuccess(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso da exceção "1h com crédito zerado" */}
      {zeroCreditConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-600/50 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h3 className="font-semibold text-amber-300">Crédito insuficiente</h3>
              <p className="mt-2 text-sm text-slate-300">
                Você está sem créditos disponíveis, mas a escola permite marcar <strong>1 hora de voo</strong> nessa condição.
              </p>
              <p className="mt-2 rounded-lg border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-200">
                Ao confirmar, você precisará <strong>repor os créditos até o início do voo</strong>. Caso contrário, o voo
                poderá ser cancelado pela escola.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setZeroCreditConfirmOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitZeroCreditBooking()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {saving ? "Enviando..." : "Entendi, marcar mesmo assim"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking modal — tela cheia no mobile; caixa centralizada no desktop */}
      {bookingOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:border sm:border-slate-700">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-slate-100">{editingFlight ? "Alterar voo" : "Solicitar voo"}</h3>
                <p className="text-xs text-slate-500">
                  {bookingStep === 1 ? "Escolha aeronave, dia e horário." : "Revise os detalhes e confirme a solicitação."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { step: 1, label: "Voo" },
                  { step: 2, label: "Confirmação" },
                ] as const).map(({ step, label }) => {
                  const active = bookingStep === step;
                  const done = bookingStep > step;
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        active
                          ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                          : done
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-700 bg-slate-800/50 text-slate-500"
                      }`}
                    >
                      <span className="font-semibold">Etapa {step}</span>
                      <span className="ml-1">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {bookingStep === 1 && (<>
            {/* Credits by model (real data from creditsDb) */}
            {bookingStep === 1 && rules.requireCreditsForBooking ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-300">Créditos para este voo</p>
                  {bookingCreditPending ? (
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                      verificando
                    </span>
                  ) : null}
                </div>
                {creditsLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-14 animate-pulse rounded-lg bg-slate-700/60" />
                    <div className="h-14 animate-pulse rounded-lg bg-slate-700/60" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Crédito geral</p>
                        <strong
                          className={
                            (selectedModelBalance?.anyDayAvailableHours ?? 0) > 0.001
                              ? "text-base text-emerald-300"
                              : "text-base text-slate-300"
                          }
                        >
                          {formatDecimalHours(selectedModelBalance?.anyDayAvailableHours ?? 0)}
                        </strong>
                      </div>
                      {showWeekdayCredits ? (
                        <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Seg-sex</p>
                          <strong
                            className={
                              (selectedModelBalance?.weekdayOnlyAvailableHours ?? 0) > 0.001
                                ? "text-base text-sky-300"
                                : "text-base text-slate-300"
                            }
                          >
                            {formatDecimalHours(selectedModelBalance?.weekdayOnlyAvailableHours ?? 0)}
                          </strong>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Este voo</p>
                          <strong className="text-base text-slate-200">{formatDecimalHours(durationMinutes / 60)}</strong>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Horas futuras agendadas</span>
                        <strong className="text-sky-300">
                          {futureLoading ? "…" : formatDecimalHours(selectedModelBalance?.futureHours ?? 0)}
                        </strong>
                      </div>
                      {(selectedModelBalance?.futureWeekdayHours ?? 0) > 0.001 ||
                      (selectedModelBalance?.futureWeekendHours ?? 0) > 0.001 ? (
                        <div className="flex flex-wrap justify-end gap-x-3 text-[11px] text-slate-500">
                          {(selectedModelBalance?.futureWeekdayHours ?? 0) > 0.001 ? (
                            <span>dia de semana: {formatDecimalHours(selectedModelBalance?.futureWeekdayHours ?? 0)}</span>
                          ) : null}
                          {(selectedModelBalance?.futureWeekendHours ?? 0) > 0.001 ? (
                            <span>fds: {formatDecimalHours(selectedModelBalance?.futureWeekendHours ?? 0)}</span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Saldo aplicável ao dia{isWeekendDate(flightDate) ? " (final de semana)" : ""}
                        </span>
                        <strong className={(selectedModelBalance?.freeHours ?? 0) > 0.001 ? "text-emerald-300" : "text-red-300"}>
                          {futureLoading ? "…" : formatDecimalHours(selectedModelBalance?.freeHours ?? 0)}
                        </strong>
                      </div>
                      {showWeekdayCredits &&
                      (selectedModelBalance?.weekdayOnlyRemaining ?? 0) > 0.001 &&
                      isWeekendDate(flightDate) ? (
                        <p className="text-[11px] text-amber-300">
                          Você tem {formatDecimalHours(selectedModelBalance?.weekdayOnlyRemaining ?? 0)} válidas só em dia de semana; não valem neste dia.
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {bookingCreditCheck.message && (
              <div className="space-y-2 rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{bookingCreditCheck.message}</span>
                </div>
                {bookingCreditCheck.showCreditsCta && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-800/40 pt-2">
                    <span className="text-red-200/90">
                      {actingForStudent
                        ? "Para adicionar mais créditos, use a aba Créditos nesta página."
                        : "Para adicionar mais créditos acesse a aba Créditos."}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        closeBookingModal();
                        if (actingForStudent && onStaffCreditsCta) {
                          onStaffCreditsCta();
                          return;
                        }
                        navigateToTab("/aluno/creditos");
                      }}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                    >
                      Adicionar créditos
                    </button>
                  </div>
                )}
              </div>
            )}

            {bookingCreditCheck.needsZeroCreditConfirm && (
              <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                Você está sem saldo livre, mas a escola permite marcar <strong>1 hora de voo</strong> nessa condição.
                Ao confirmar, será necessário repor os créditos até o início do voo.
              </div>
            )}

            {/* Lista de espera: contexto + barreira quando existe avião livre no horário */}
            {waitlistSelected && !waitlistBlocked && (
              <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                Você está agendando na <strong>lista de espera</strong>: este horário não garante o voo — a
                solicitação poderá ser confirmada conforme ajustes ou cancelamentos de outros voos.
              </div>
            )}
            {waitlistSelected && waitlistBlocked && (
              <div className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>
                  O avião <strong>{waitlistFreeAircraft}</strong> está livre neste horário. A lista de espera só pode
                  ser usada quando <strong>todos os aviões estiverem ocupados</strong> — agende diretamente no avião disponível.
                </span>
              </div>
            )}

            {/* Blocked aircraft warning */}
            {blockedSlots.some((s) => s.aircraftRegistration === aircraftIdent) && (
              <div className="flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                <span>⚠</span>
                <span>A aeronave <strong>{aircraftIdent}</strong> possui horários bloqueados nesta semana. Verifique a disponibilidade antes de solicitar.</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400">Aeronave
                <select value={aircraftIdent} onChange={(e) => setAircraftIdent(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
                  {aircrafts.map((aircraft) => (
                    <option key={aircraft.id} value={aircraft.registration}>
                      {aircraft.registration}{blockedSlots.some((s) => s.aircraftRegistration === aircraft.registration) ? " ⚠ bloqueado" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">Data
                <input
                  type="date"
                  value={flightDate}
                  min={minBookingDate}
                  onChange={(e) => setFlightDate(e.target.value)}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-white ${dateTooEarly || noSlotsForDay ? "border-red-600 bg-red-950/40" : "border-slate-700 bg-slate-800"}`}
                />
                {dateTooEarly && (
                  <span className="mt-1 block text-[11px] font-medium text-red-400">
                    Antecedência mínima de {rules.minBookingLeadDays} dia{rules.minBookingLeadDays !== 1 ? "s" : ""} — escolha a partir de {formatDate(minBookingDate)}.
                  </span>
                )}
                {noSlotsForDay && (
                  <span className="mt-1 block text-[11px] font-medium text-red-400">
                    Não há nenhum horário disponível neste avião para este dia.
                  </span>
                )}
              </label>

              {/* Hora de acionamento — somente horários livres na aeronave/data escolhidas */}
              <label className="text-xs text-slate-400">Hora de acionamento
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={noSlotsForDay}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-white disabled:opacity-50 ${startTimeInvalid && !noSlotsForDay ? "border-red-600 bg-red-950/40" : "border-slate-700 bg-slate-800"}`}
                >
                  {/* O horário escolhido permanece selecionável mesmo se deixar de caber (item 5) */}
                  {!availableTimeSlots.some((opt) => opt.value === startTime) && (
                    <option value={startTime}>{startTime}</option>
                  )}
                  {dayTimeOptions.length > 0 && (
                    <optgroup label="Diurno">
                      {dayTimeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
                    </optgroup>
                  )}
                  {nightTimeOptions.length > 0 && (
                    <optgroup label="Noturno">
                      {nightTimeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
                    </optgroup>
                  )}
                </select>
                {!noSlotsForDay && (
                  <span className="mt-1 block text-[10px] text-slate-500">Mostrando somente horários disponíveis</span>
                )}
                {startTimeInvalid && !noSlotsForDay && (
                  <span className="mt-1 block text-[11px] font-medium text-red-400">
                    Este horário não comporta o tempo de voo selecionado (ou já está ocupado). Escolha outro horário
                    ou reduza o tempo de voo.
                  </span>
                )}
              </label>

              {/* Tempo de voo em HH:MM — opções já limitadas pelo início do noturno.
                  Fica ativo mesmo com acionamento inválido: reduzir a duração pode
                  fazer o horário escolhido voltar a caber. */}
              <label className="text-xs text-slate-400">Tempo de voo
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  disabled={noSlotsForDay}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {durationOptions.length === 0 && <option value={durationMinutes}>{minutesToHHMM(durationMinutes)}</option>}
                  {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutesToHHMM(minutes)}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100 sm:grid-cols-4">
              <div><p className="text-sky-300">Apresentação</p><strong>{preview.presentation}</strong></div>
              <div><p className="text-sky-300">Acionamento</p><strong>{preview.start}</strong></div>
              <div><p className="text-sky-300">Corte</p><strong>{preview.cutoff}</strong></div>
              <div><p className="text-sky-300">Encerramento</p><strong>{preview.end}</strong></div>
            </div>
            </>)}

            {bookingStep === 2 && (<>
            {/* Aviso da lista de espera — a confirmação depende de ajustes/cancelamentos */}
            {waitlistSelected && (
              <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-3 text-xs text-amber-200">
                <p className="font-semibold">Solicitação para a LISTA DE ESPERA</p>
                <p className="mt-1 text-amber-100/90">
                  Você está solicitando um voo para a <strong>lista de espera</strong>. Ele poderá ser confirmado a
                  depender de ajustes ou cancelamentos de outros voos. Até <strong>12h antes do voo</strong> você
                  receberá a confirmação ou o cancelamento da solicitação.
                </p>
              </div>
            )}

            {/* Resumo do voo escolhido na etapa 1 */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-200">{aircraftIdent}</span>
                <span className="text-slate-400">{flightDate ? formatLongDate(flightDate) : ""}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div><p className="text-slate-500">Apresentação</p><strong className="text-slate-200">{preview.presentation}</strong></div>
                <div><p className="text-slate-500">Acionamento</p><strong className="text-slate-200">{preview.start}</strong></div>
                <div><p className="text-slate-500">Corte</p><strong className="text-slate-200">{preview.cutoff}</strong></div>
                <div><p className="text-slate-500">Encerramento</p><strong className="text-slate-200">{preview.end}</strong></div>
              </div>
            </div>

            {/* Flexibilidade de horário */}
            <div>
              <p className="mb-1 text-xs text-slate-400">Flexibilidade de horário</p>
              <div className="flex gap-1">
                {flexibilityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFlexibilityMinutes(opt.value)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      flexibilityMinutes === opt.value
                        ? "border-sky-500 bg-sky-600/20 text-sky-300"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                A flexibilidade indica o quanto a escola pode ajustar o horário do seu voo. Ex.: {minutesToHHMM(rules.slotMinutes * 2)} = acionamento pode ser adiantado ou atrasado até {minutesToHHMM(rules.slotMinutes * 2)}.
              </p>
            </div>

            {/* Observações do aluno — gravadas nas notas do agendamento (SAGA) */}
            <label className="block text-xs text-slate-400">Observações (opcional)
              <textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={2}
                maxLength={180}
                placeholder="Ex.: prefiro decolar mais cedo; quero treinar TGL..."
                className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              />
            </label>
            </>)}

            </div>

            {/* Footer fixo: navegação das etapas (no mobile fica flutuante na base) */}
            <div className="space-y-3 border-t border-slate-800 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl">
              {bookingStep === 2 && (
                <label className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={bookingAck}
                    onChange={(e) => setBookingAck(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  <span>
                    Estou ciente que isto é apenas uma <strong>solicitação</strong> e a escola irá confirmar ou não este
                    voo entre <strong>48h e 12h</strong> antes do horário planejado.
                  </span>
                </label>
              )}
              <div className="flex justify-end gap-2">
                {bookingStep === 1 ? (
                  <>
                    <button type="button" onClick={closeBookingModal} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Voltar</button>
                    <button
                      type="button"
                      disabled={
                        !aircraftIdent ||
                        dateTooEarly ||
                        noSlotsForDay ||
                        startTimeInvalid ||
                        waitlistBlocked ||
                        durationOptions.length === 0 ||
                        (bookingCreditCheck.blocked && !bookingCreditPending)
                      }
                      onClick={() => setBookingStep(2)}
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Continuar
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setBookingStep(1)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Voltar</button>
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !bookingAck ||
                        dateTooEarly ||
                        noSlotsForDay ||
                        startTimeInvalid ||
                        waitlistBlocked ||
                        bookingCreditCheck.blocked
                      }
                      onClick={() => void submitBooking()}
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? "Enviando..." : editingFlight ? "Alterar" : "Solicitar"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ScheduleStudentChrome>
  );
}
