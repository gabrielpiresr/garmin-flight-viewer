import { useMemo, useState } from "react";
import { parseDurationToMinutes, shortName } from "../lib/flightDisplay";
import type { SavedFlightListItem } from "../lib/flightsDb";
import { SLOT_HOURS } from "../types/admin";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const AIRCRAFT_COLORS = [
  "bg-sky-900/60 text-sky-200 border-sky-600/50",
  "bg-violet-900/60 text-violet-200 border-violet-600/50",
  "bg-emerald-900/60 text-emerald-200 border-emerald-600/50",
  "bg-amber-900/60 text-amber-200 border-amber-600/50",
  "bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-600/50",
];

export type AgendaFlightInfo = {
  flightDateIso: string | null;
  startTime: string;
  endTime: string;
  studentName: string;
  instructorName: string;
  aircraft: string;
  totalFlight: string;
};

type AgendaFlightItem = {
  flight: SavedFlightListItem;
  info?: AgendaFlightInfo;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
  dateIso: string;
  startTime: string;
  endTime: string;
};

function aircraftColor(registration: string): string {
  const key = registration || "unknown";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % 997;
  return AIRCRAFT_COLORS[hash % AIRCRAFT_COLORS.length] ?? AIRCRAFT_COLORS[0]!;
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || minutes <= 0) return "";
  const h = Number(match[1] ?? "0");
  const m = Number(match[2] ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + Math.round(minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getFlightDateIso(item: SavedFlightListItem, info?: AgendaFlightInfo): string {
  return info?.flightDateIso ?? item.flight_date ?? (item.created_at ?? "").slice(0, 10);
}

function startOfWeekIso(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function shiftWeek(weekStartIso: string, deltaWeeks: number): string {
  const date = new Date(`${weekStartIso}T12:00:00`);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  if (Number.isNaN(start.getTime())) return "Semana";
  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
}

function formatDayHeader(weekStartIso: string, dayOfWeek: number): string {
  const date = new Date(`${weekStartIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return DAY_LABEL[dayOfWeek];
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return `${DAY_LABEL[dayOfWeek]} ${date.getDate()}`;
}

function parseStartHour(startTime: string): number {
  const [hh, mm] = startTime.split(":").map(Number);
  if (!Number.isFinite(hh)) return SLOT_HOURS[0] ?? 6;
  return hh + (Number.isFinite(mm) ? mm : 0) / 60;
}

function buildAgendaItem(flight: SavedFlightListItem, info?: AgendaFlightInfo): AgendaFlightItem {
  const dateIso = getFlightDateIso(flight, info);
  const date = new Date(`${dateIso}T12:00:00`);
  const startTime = info?.startTime || flight.start_time || "08:00";
  const durationMinutes =
    parseDurationToMinutes(info?.totalFlight ?? "") ||
    (typeof flight.duration_sec === "number" && flight.duration_sec > 0 ? Math.round(flight.duration_sec / 60) : 60);
  const startHour = parseStartHour(startTime);
  return {
    flight,
    info,
    dayOfWeek: Number.isNaN(date.getTime()) ? 1 : date.getDay(),
    startHour,
    durationHours: Math.max(0.5, durationMinutes / 60),
    dateIso,
    startTime,
    endTime: info?.endTime || addMinutesToTime(startTime, durationMinutes) || "--:--",
  };
}

export function FlightsAgendaBoard({
  items,
  infoById,
  onOpen,
}: {
  items: SavedFlightListItem[];
  infoById: Record<string, AgendaFlightInfo | undefined>;
  onOpen: (id: string) => void;
}) {
  const rowHeight = 38;
  const firstHour = SLOT_HOURS[0] ?? 6;
  const boardHeight = SLOT_HOURS.length * rowHeight;
  const todayWeekStart = startOfWeekIso(new Date().toISOString().slice(0, 10));
  const [selectedWeekStart, setSelectedWeekStart] = useState(todayWeekStart);

  const agendaItems = useMemo(
    () => items.map((flight) => buildAgendaItem(flight, infoById[flight.id])),
    [infoById, items],
  );

  const currentWeekItems = useMemo(
    () =>
      agendaItems
        .filter((item) => startOfWeekIso(item.dateIso) === selectedWeekStart)
        .sort((a, b) => {
          if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
          return a.startHour - b.startHour;
        }),
    [agendaItems, selectedWeekStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<number, AgendaFlightItem[]>();
    for (const day of DAY_ORDER) map.set(day, []);
    for (const flight of currentWeekItems) {
      map.set(flight.dayOfWeek, [...(map.get(flight.dayOfWeek) ?? []), flight]);
    }
    return map;
  }, [currentWeekItems]);

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Agenda semanal</p>
          <p className="mt-0.5 text-xs text-slate-600">{currentWeekItems.length} voo(s) nesta semana</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setSelectedWeekStart((week) => shiftWeek(week, -1))}
            className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Semana anterior
          </button>
          <span className="order-first w-full text-center text-xs font-medium text-slate-300 sm:order-none sm:w-auto sm:min-w-36">{formatWeekLabel(selectedWeekStart)}</span>
          <button
            type="button"
            onClick={() => setSelectedWeekStart((week) => shiftWeek(week, 1))}
            className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Próxima semana
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] table-fixed border-separate border-spacing-1 md:w-full">
          <thead>
            <tr>
              <th className="w-12 pb-1 text-right text-[10px] font-medium text-slate-600" />
              {DAY_ORDER.map((day) => (
                <th key={day} className="w-[14.2%] pb-1 text-center text-xs font-semibold text-slate-400">
                  {formatDayHeader(selectedWeekStart, day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="align-top pr-2">
                <div className="relative" style={{ height: `${boardHeight}px` }}>
                  {SLOT_HOURS.map((hour, idx) => (
                    <div key={hour} className="absolute right-0 text-right text-[11px] font-mono text-slate-600" style={{ top: `${idx * rowHeight}px`, width: "2.8rem" }}>
                      {hour}h
                    </div>
                  ))}
                </div>
              </td>
              {DAY_ORDER.map((day) => (
                <td key={day} className="align-top p-0">
                  <div className="relative rounded-md border border-slate-700/60 bg-slate-800/30" style={{ height: `${boardHeight}px` }}>
                    {SLOT_HOURS.map((hour, idx) => (
                      <div key={`${day}-${hour}`} className="absolute left-0 right-0 border-b border-slate-700/40" style={{ top: `${idx * rowHeight}px` }} />
                    ))}
                    {(byDay.get(day) ?? []).map((agendaItem, idx) => {
                      const top = Math.min(boardHeight - rowHeight, Math.max(0, (agendaItem.startHour - firstHour) * rowHeight));
                      const height = Math.max(rowHeight, agendaItem.durationHours * rowHeight);
                      const info = agendaItem.info;
                      const color = aircraftColor(info?.aircraft ?? agendaItem.flight.aircraft_ident ?? "");
                      const widthOffset = idx % 2 === 0 ? "4px" : "10px";
                      return (
                        <button
                          key={agendaItem.flight.id}
                          type="button"
                          onClick={() => onOpen(agendaItem.flight.id)}
                          className={`absolute overflow-hidden rounded border px-1.5 py-1 text-left text-[10px] text-white transition hover:ring-1 hover:ring-white/60 ${color}`}
                          style={{
                            top: `${top}px`,
                            height: `${Math.min(boardHeight - top, height) - 4}px`,
                            left: widthOffset,
                            right: widthOffset,
                          }}
                          title={`${shortName(info?.studentName, "Voo")} • ${info?.aircraft ?? agendaItem.flight.aircraft_ident ?? "—"} • ${agendaItem.startTime}-${agendaItem.endTime}`}
                        >
                          <p className="truncate font-semibold">{shortName(info?.studentName, "Voo")}</p>
                          <p className="truncate opacity-90">{agendaItem.startTime}-{agendaItem.endTime}</p>
                          <p className="truncate opacity-80">{info?.aircraft ?? agendaItem.flight.aircraft_ident ?? "—"} · {shortName(info?.instructorName) || "Sem instrutor"}</p>
                        </button>
                      );
                    })}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
