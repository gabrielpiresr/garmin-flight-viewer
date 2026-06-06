import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelScheduleFlight,
  checkScheduleAvailability,
  getPublicSchedule,
  previewScheduleCancellation,
  requestScheduleFlight,
  type PublicBlockedSlot,
  type PublicScheduleAircraft,
  type PublicScheduleFlight,
} from "../lib/scheduleBookingDb";
import { getStudentCreditStatement } from "../lib/creditsDb";
import type { StudentCreditModelSummary } from "../types/credits";
import { DEFAULT_FLIGHT_SCHEDULE_RULES, type FlightScheduleRules } from "../types/schoolRules";
import type { FlightStatus } from "../lib/flightsDb";
import { useAuth } from "../contexts/AuthContext";
import { AgendamentoTab } from "./AgendamentoTab";
import {
  CalendarGrid,
  type CalendarDropTarget,
  type CalendarFlightItem,
} from "./admin/ScheduleFlightsTab";
import { useToast } from "./ui/ToastProvider";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const CAL_START_HOUR = 6;
const CAL_ROW_HEIGHT = 40;

const STATUS_COLOR: Record<string, string> = {
  "Pendente": "bg-orange-600/90 border-orange-400/70",
  "Confirmado": "bg-emerald-600/90 border-emerald-400/70",
  "Cancelado": "bg-red-700/90 border-red-500/70",
  "Não confirmado": "bg-slate-600/90 border-slate-500/60",
  "Realizado": "bg-sky-600/90 border-sky-400/70",
  "Previsto": "bg-emerald-600/90 border-emerald-400/70",
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  "Pendente": "text-orange-300",
  "Confirmado": "text-emerald-300",
  "Cancelado": "text-red-300",
  "Não confirmado": "text-slate-400",
  "Realizado": "text-sky-300",
  "Previsto": "text-emerald-300",
};

function studentItemColor(item: CalendarFlightItem): string {
  if (item.isBlocked) return "bg-red-900/60";
  if (!item.isOwn) return "bg-slate-700/70";
  const cls = STATUS_COLOR[item.flightStatus ?? "Não confirmado"] ?? "bg-slate-600/90";
  return cls.split(" ").filter((p) => !p.startsWith("border-")).join(" ");
}

// ─── Date / Time helpers ──────────────────────────────────────────────────────

function mondayIso(date = new Date()): string {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next.toISOString().slice(0, 10);
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
  onEmptySlotClick,
  selectedDay,
  onSelectDay,
  onPrevDay,
  onNextDay,
  showDayPicker,
}: {
  days: readonly number[];
  items: CalendarFlightItem[];
  aircrafts: PublicScheduleAircraft[];
  weekStart: string;
  nightStartHour: number;
  onItemClick: (item: CalendarFlightItem) => void;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  showDayPicker?: boolean;
}) {
  const maxEndMinute = items.reduce((m, item) => {
    const end = timeToMinutes(item.endTime || item.startTime);
    return Math.max(m, end);
  }, (nightStartHour + 2) * 60);
  const endHour = Math.min(24, Math.max(nightStartHour + 1, Math.ceil(maxEndMinute / 60)));
  const hours = Array.from({ length: endHour - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i);
  const boardHeight = hours.length * CAL_ROW_HEIGHT;

  return (
    <div className="space-y-4">
      {showDayPicker && onSelectDay && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrevDay} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">‹</button>
          <div className="flex min-w-0 flex-1 gap-0.5 sm:gap-1">
            {DAY_ORDER.map((day) => {
              const date = dayOfWeekToDate(weekStart, day);
              const today = isDateToday(date);
              const selected = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={`flex min-w-0 flex-1 flex-col items-center rounded border px-0.5 py-1.5 text-[10px] transition-colors sm:px-1.5 sm:text-[11px] ${
                    selected ? "border-sky-500 bg-sky-600/20 text-sky-300"
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
                  style={{ minWidth: `${cols.length * 160 + 48}px` }}
                >
                  <thead>
                    <tr>
                      <th className="w-10" />
                      {cols.map((col) => (
                        <th key={col.registration} className="pb-1 text-center">
                          <span className="text-xs font-semibold text-slate-300">{col.registration}</span>
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
                            <div key={h} className="absolute right-0 text-right text-[10px] font-mono text-slate-600" style={{ top: `${idx * CAL_ROW_HEIGHT}px`, width: "2.2rem" }}>
                              {h}h
                            </div>
                          ))}
                        </div>
                      </td>
                      {cols.map((col) => (
                        <td key={col.registration} className="align-top p-0">
                          <div
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
                              const colorCls = item.isBlocked
                                ? "bg-red-900/60 border-red-500/50 text-red-200"
                                : item.isOwn
                                  ? (STATUS_COLOR[item.flightStatus ?? "Não confirmado"] ?? "bg-slate-600/90 border-slate-500/60")
                                  : "bg-slate-700/70 border-slate-600/50";
                              const isInteractive = !item.isBlocked;
                              return (
                                <div
                                  key={item.id}
                                  role={isInteractive ? "button" : undefined}
                                  tabIndex={isInteractive ? 0 : undefined}
                                  onClick={(e) => { if (!isInteractive) return; e.stopPropagation(); onItemClick(item); }}
                                  className={`absolute overflow-hidden rounded border-2 px-1.5 py-1 text-left text-[10px] text-white ${isInteractive ? "hover:ring-1 hover:ring-white/60 cursor-pointer z-10" : "pointer-events-none z-0"} ${colorCls}`}
                                  style={{ top: `${topPx}px`, height: `${heightPx - 4}px`, left: "4px", right: "4px" }}
                                >
                                  <p className="truncate font-semibold">{item.studentLabel}</p>
                                  <p className="truncate opacity-90">{item.startTime}–{item.endTime}</p>
                                </div>
                              );
                            })}
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
  { status: "Confirmado", label: "Confirmado" },
  { status: "Cancelado", label: "Cancelado" },
  { status: "Não confirmado", label: "Não confirmado" },
];

// ─── Flight List View ─────────────────────────────────────────────────────────

function FlightListView({
  flights,
  onFlightClick,
}: {
  flights: PublicScheduleFlight[];
  onFlightClick: (flight: PublicScheduleFlight) => void;
}) {
  const ownFlights = useMemo(
    () => [...flights.filter((f) => f.isOwn)].sort((a, b) => {
      if (a.flightDate !== b.flightDate) return a.flightDate.localeCompare(b.flightDate);
      return a.startTime.localeCompare(b.startTime);
    }),
    [flights],
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

function FlightDetailModal({
  flight,
  onClose,
  onCancel,
}: {
  flight: PublicScheduleFlight;
  onClose: () => void;
  onCancel: () => void;
}) {
  const statusCls = STATUS_COLOR[flight.status] ?? "bg-slate-600/90 border-slate-500/60";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
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

        {flight.canCancel && (
          <div className="flex justify-end">
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

function CancellationModal({
  flight,
  rules,
  onClose,
  onConfirm,
}: {
  flight: PublicScheduleFlight;
  rules: FlightScheduleRules;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [penaltyPct, setPenaltyPct] = useState(0);
  const [penaltyHours, setPenaltyHours] = useState(0);
  const [confirming, setConfirming] = useState(false);
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
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
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

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Voltar
          </button>
          <button
            type="button"
            disabled={loading || confirming}
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

export function StudentScheduleTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [weekStart, setWeekStart] = useState(mondayIso);
  const [rules, setRules] = useState<FlightScheduleRules>(DEFAULT_FLIGHT_SCHEDULE_RULES);
  const [mode, setMode] = useState<FlightScheduleRules["mode"]>("intentions");
  const [aircrafts, setAircrafts] = useState<PublicScheduleAircraft[]>([]);
  const [flights, setFlights] = useState<PublicScheduleFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aircraftIdent, setAircraftIdent] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [flexibilityMinutes, setFlexibilityMinutes] = useState(30);
  const [agendaView, setAgendaView] = useState<"weekly" | "daily" | "list">("weekly");
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [onlyMyFlights, setOnlyMyFlights] = useState(false);
  const [blockedSlots, setBlockedSlots] = useState<PublicBlockedSlot[]>([]);

  // Credits from creditsDb
  const [creditSummaries, setCreditSummaries] = useState<StudentCreditModelSummary[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // Flight detail / cancellation modals
  const [detailFlight, setDetailFlight] = useState<PublicScheduleFlight | null>(null);
  const [cancelFlight, setCancelFlight] = useState<PublicScheduleFlight | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPublicSchedule(weekStart, addDays(weekStart, 6));
      setRules(data.rules);
      setMode(data.mode);
      setAircrafts(data.aircrafts);
      setFlights(data.flights);
      setBlockedSlots(data.blockedSlots);
      setAircraftIdent((current) => current || data.aircrafts[0]?.registration || "");
      setFlightDate((current) => current || weekStart);
      setFlexibilityMinutes(data.rules.slotMinutes);
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [showToast, weekStart]);

  useEffect(() => { void load(); }, [load]);

  // Load credits from creditsDb (same source as CreditosTab)
  useEffect(() => {
    if (!user?.id || !user.role) return;
    setCreditsLoading(true);
    getStudentCreditStatement({ viewer: { userId: user.id, role: user.role }, studentUserId: user.id })
      .then((stmt) => setCreditSummaries(stmt.summaries))
      .catch(() => setCreditSummaries([]))
      .finally(() => setCreditsLoading(false));
  }, [user?.id, user?.role]);

  useEffect(() => { setFlexibilityMinutes(rules.slotMinutes); }, [rules.slotMinutes]);

  const durationOptions = useMemo(() => {
    const weekend = [0, 6].includes(new Date(`${flightDate}T12:00:00`).getDay());
    const min = (weekend ? rules.weekendMinHours : rules.weekdayMinHours) * 60;
    const max = (weekend ? rules.weekendMaxHours : rules.weekdayMaxHours) * 60;
    const values: number[] = [];
    for (let value = min; value <= max; value += rules.slotMinutes) values.push(value);
    return values;
  }, [flightDate, rules]);

  // All time slot options (item 8)
  const timeSlotOptions = useMemo(() => {
    const startTotalMin = rules.scheduleStartTime ? timeToMinutes(rules.scheduleStartTime) : CAL_START_HOUR * 60;
    const nightTotalMin = Math.round(rules.nightFlightStartHour * 60);
    const opts: Array<{ value: string; isNight: boolean }> = [];
    for (let totalMin = startTotalMin; totalMin < 24 * 60; totalMin += rules.slotMinutes) {
      const isNight = totalMin >= nightTotalMin;
      if (isNight && !rules.allowNightFlights) continue;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      opts.push({ value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, isNight });
    }
    return opts;
  }, [rules]);

  const dayTimeOptions = timeSlotOptions.filter((o) => !o.isNight);
  const nightTimeOptions = timeSlotOptions.filter((o) => o.isNight);

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
        if (flight.status === "Cancelado" && !flight.isOwn) return false;
        if (onlyMyFlights && !flight.isOwn) return false;
        return true;
      })
      .map((flight) => {
        const occupiedStart = flight.presentationTime || flight.startTime;
        const occupiedEnd = flight.endTime || flight.cutoffTime || flight.startTime;
        const occupiedMinutes = Math.max(rules.slotMinutes, timeToMinutes(occupiedEnd) - timeToMinutes(occupiedStart));
        const date = new Date(`${flight.flightDate}T12:00:00`);
        return {
          id: flight.id,
          studentId: flight.studentUserId || flight.id,
          studentLabel: flight.isOwn ? (flight.status === "Pendente" ? "Solicitado" : flight.status) : "Ocupado",
          instructorId: null,
          instructorLabel: null,
          totalWeightLabel: "",
          aircraftRegistration: flight.aircraftIdent,
          dayOfWeek: date.getDay(),
          startHour: timeToMinutes(occupiedStart) / 60,
          durationHours: occupiedMinutes / 60,
          flightStatus: flight.status,
          startTime: occupiedStart,
          endTime: occupiedEnd,
          isOwn: flight.isOwn,
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
  }, [flights, rules.slotMinutes, onlyMyFlights, blockedSlots]);

  const selectedDayIndex = Math.max(0, DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]));
  const visibleDays = agendaView === "weekly"
    ? DAY_ORDER
    : agendaView === "daily"
      ? [DAY_ORDER[selectedDayIndex]!]
      : DAY_ORDER; // list uses all

  // Calendar-level blocked slots (aggregate — kept for CalendarGrid overlay)
  const calendarBlockedSlots = useMemo(
    () => blockedSlots.map(({ dayOfWeek, startHour, endHour }) => ({ dayOfWeek, startHour, endHour })),
    [blockedSlots],
  );

  function openBookingAt(target?: CalendarDropTarget) {
    if (target) {
      setFlightDate(addDays(weekStart, target.dayOfWeek === 0 ? 6 : target.dayOfWeek - 1));
      setStartTime(addMinutes(target.startTime, rules.bufferBeforeMinutes));
      if (target.targetAircraftRegistration) setAircraftIdent(target.targetAircraftRegistration);
    }
    setBookingOpen(true);
  }

  function moveCalendar(direction: -1 | 1) {
    if (agendaView === "weekly" || agendaView === "list") {
      setWeekStart((current) => addDays(current, direction * 7));
      return;
    }
    const nextIndex = selectedDayIndex + direction;
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

  async function executeCancelFlight(flight: PublicScheduleFlight) {
    await cancelScheduleFlight(flight.id);
    showToast({ variant: "success", message: "Voo cancelado." });
    setCancelFlight(null);
    setDetailFlight(null);
    await load();
  }

  async function submitBooking() {
    setSaving(true);
    try {
      const availability = await checkScheduleAvailability({ aircraftIdent, flightDate, startTime, durationMinutes });
      if (rules.requireCreditsForBooking && !availability.creditSufficient) {
        throw new Error(`Crédito insuficiente. Disponível: ${availability.creditAvailableHours.toFixed(2)}h.`);
      }
      await requestScheduleFlight({ aircraftIdent, flightDate, startTime, durationMinutes, flexibilityMinutes });
      showToast({ variant: "success", message: "Solicitação enviada como Pendente." });
      setBookingOpen(false);
      await load();
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (mode === "intentions") return <AgendamentoTab />;
  if (mode === "closed") {
    return <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-400">A escala está fechada no momento.</div>;
  }

  const isNonWeekly = agendaView === "daily";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View selector */}
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {([
            ["weekly", "Semanal"],
            ["daily", "Diária"],
            ["list", "Lista"],
          ] as const).map(([value, label]) => (
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

        {/* "Only my flights" toggle (only in non-list views) */}
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

        <p className="ml-auto text-xs font-medium text-slate-400">
          {formatDate(weekStart)} a {formatDate(addDays(weekStart, 6))}
        </p>

        {/* Week navigation */}
        <div className="flex gap-1">
          <button type="button" onClick={() => moveCalendar(-1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">‹</button>
          <button type="button" onClick={() => moveCalendar(1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700">›</button>
        </div>

        {mode === "booking" && (
          <button type="button" onClick={() => openBookingAt()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500">
            Marcar voo
          </button>
        )}
      </div>

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

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Carregando escala...</p>
      ) : (
        <>
          {/* List view */}
          {agendaView === "list" && (
            <FlightListView flights={flights} onFlightClick={setDetailFlight} />
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
              hasPrevWeek
              hasNextWeek
              onPrevWeek={() => moveCalendar(-1)}
              onNextWeek={() => moveCalendar(1)}
              getItemColor={studentItemColor}
              blockedSlots={calendarBlockedSlots}
              onItemClick={handleItemClick}
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
                onItemClick={handleItemClick}
                onEmptySlotClick={mode === "booking" ? openBookingAt : undefined}
              />
              <div className="mt-3 flex justify-end gap-1">
                <button type="button" onClick={() => moveCalendar(-1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">‹ Semana ant.</button>
                <button type="button" onClick={() => moveCalendar(1)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">Próx. semana ›</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Flight detail modal */}
      {detailFlight && !cancelFlight && (
        <FlightDetailModal
          flight={detailFlight}
          onClose={() => setDetailFlight(null)}
          onCancel={() => setCancelFlight(detailFlight)}
        />
      )}

      {/* Cancellation modal */}
      {cancelFlight && (
        <CancellationModal
          flight={cancelFlight}
          rules={rules}
          onClose={() => setCancelFlight(null)}
          onConfirm={() => executeCancelFlight(cancelFlight)}
        />
      )}

      {/* Booking modal */}
      {bookingOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pt-8">
          <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h3 className="font-semibold text-slate-100">Solicitar voo</h3>
              <p className="text-xs text-slate-500">O pedido ficará Pendente até confirmação.</p>
            </div>

            {/* Credits by model (real data from creditsDb) */}
            {!creditsLoading && creditSummaries.length > 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-300">Seus créditos disponíveis</p>
                <div className="space-y-1">
                  {creditSummaries.map((row) => (
                    <div key={row.aircraftModelId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{row.aircraftModelName}</span>
                      <span className="text-slate-400">
                        Disponível: <strong className={row.availableHours > 0 ? "text-emerald-300" : "text-red-300"}>{minutesToHHMM(Math.round(row.availableHours * 60))}</strong>
                      </span>
                    </div>
                  ))}
                </div>
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
                <input type="date" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
              </label>

              {/* Hora de acionamento — todos os slots disponíveis + noturno */}
              <label className="text-xs text-slate-400">Hora de acionamento
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
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
                  {timeSlotOptions.length === 0 && <option value={startTime}>{startTime}</option>}
                </select>
              </label>

              {/* Tempo de voo em HH:MM */}
              <label className="text-xs text-slate-400">Tempo de voo
                <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
                  {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutesToHHMM(minutes)}</option>)}
                </select>
              </label>
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

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100 sm:grid-cols-4">
              <div><p className="text-sky-300">Apresentação</p><strong>{preview.presentation}</strong></div>
              <div><p className="text-sky-300">Acionamento</p><strong>{preview.start}</strong></div>
              <div><p className="text-sky-300">Corte</p><strong>{preview.cutoff}</strong></div>
              <div><p className="text-sky-300">Encerramento</p><strong>{preview.end}</strong></div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBookingOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Voltar</button>
              <button type="button" disabled={saving || !aircraftIdent} onClick={() => void submitBooking()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Enviando..." : "Solicitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
