import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { shortName } from "../../lib/flightDisplay";
import {
  calendarTopPx,
  minutesToScheduleHHMM,
  parseScheduleTimeToMinutes,
} from "../../lib/scheduleTimeGrid";
import { SLOT_HOURS, type SlotState } from "../../types/admin";
import { FlightReviewClubBadge } from "../FlightReviewClubBadge";
import { Skeleton } from "../ui/Skeleton";

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };

export const AIRCRAFT_COLOR_CLASSES = [
  "bg-sky-600 border-sky-400/70",
  "bg-emerald-600 border-emerald-400/70",
  "bg-violet-600 border-violet-400/70",
  "bg-amber-600 border-amber-400/70",
  "bg-cyan-600 border-cyan-400/70",
  "bg-fuchsia-600 border-fuchsia-400/70",
  "bg-rose-600 border-rose-400/70",
];

export const FLIGHT_STATUS_CARD_COLOR: Record<string, string> = {
  "Confirmado": "bg-emerald-600",
  "Previsto": "bg-sky-600",
  "Pendente": "bg-orange-600",
  "Cancelado": "bg-red-700",
  "Realizado": "bg-sky-600",
  "Não confirmado": "bg-slate-600",
};

const MOBILE_MIN_COLUMN_PX = 130;
const MOBILE_HOURS_GUTTER_PX = 36;
const CALENDAR_START_HOUR = SLOT_HOURS[0] ?? 6;
const CALENDAR_MIN_END_HOUR = (SLOT_HOURS[SLOT_HOURS.length - 1] ?? 17) + 1;
const CALENDAR_MAX_END_HOUR = 24;

const SLOT_BG_TINT: Record<SlotState, string> = {
  preferred: "bg-emerald-500/20",
  normal: "bg-sky-500/20",
  avoid: "bg-amber-400/20",
  blocked: "bg-red-500/22",
};

export type CalendarFlightItem = {
  id: string;
  studentId: string;
  studentLabel: string;
  instructorId: string | null;
  instructorLabel: string | null;
  totalWeightLabel: string;
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
  flightHours?: number;
  flightStatus?: string;
  startTime: string;
  endTime: string;
  isNight?: boolean;
  isOutsideGenerator?: boolean;
  isOwn?: boolean;
  isBlocked?: boolean;
  notes?: string | null;
};

export type ProjectionCell = {
  hours: number | null;
  maintenance?: string;
};

export type AircraftProjectionRow = {
  registration: string;
  hoursByDay: Partial<Record<number, ProjectionCell>>;
};

export type AircraftColumn = {
  registration: string;
  colorClass: string;
};

export type ScheduleGroupBy = "aircraft" | "instructor" | "none";

export type ScheduleColumn = {
  key: string;
  label: string;
  colorClass: string;
  groupBy: ScheduleGroupBy;
  aircraftRegistration?: string;
  instructorId?: string | null;
};

export type CalendarDropTarget = {
  dayOfWeek: number;
  startHour: number;
  startTime: string;
  isNight: boolean;
  targetInstructorId?: string | null;
  targetAircraftRegistration?: string;
};

type ScheduleGridSupply = {
  slotStates: Record<string, SlotState>;
};

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function buildCalendarHours(items: CalendarFlightItem[]): number[] {
  const latestEndMinute = items.reduce((latest, item) => {
    const endMinute = parseScheduleTimeToMinutes(item.startTime) + Math.round(item.durationHours * 60);
    return Math.max(latest, endMinute);
  }, CALENDAR_MIN_END_HOUR * 60);
  const endHour = Math.min(
    CALENDAR_MAX_END_HOUR,
    Math.max(CALENDAR_MIN_END_HOUR, Math.ceil(latestEndMinute / 60)),
  );
  return Array.from({ length: endHour - CALENDAR_START_HOUR }, (_, index) => CALENDAR_START_HOUR + index);
}

export function snapCalendarPointerToStartMinute(
  clientY: number,
  boardTop: number,
  rowHeightPerHour: number,
  endHour: number,
): number {
  const minutesFromOrigin = Math.max(0, ((clientY - boardTop) / rowHeightPerHour) * 60);
  const snapped = Math.round(minutesFromOrigin / 30) * 30;
  const maxOffset = Math.max(0, (endHour - CALENDAR_START_HOUR) * 60 - 30);
  return CALENDAR_START_HOUR * 60 + Math.min(snapped, maxOffset);
}

export function useCalendarRowHeight(mobileHeight: number, desktopHeight: number): number {
  const [rowHeight, setRowHeight] = useState(desktopHeight);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setRowHeight(media.matches ? mobileHeight : desktopHeight);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [desktopHeight, mobileHeight]);

  return rowHeight;
}

function dayOfWeekToDate(weekStart: string, dayOfWeek: number): Date {
  const date = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return date;
}

function isDateToday(date: Date): boolean {
  const t = new Date();
  return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function weekDateFromStart(weekStart: string, dayOfWeek: number): string {
  const base = new Date(`${weekStart}T12:00:00`);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function aircraftCardColor(className: string): string {
  return className
    .split(" ")
    .filter((part) => !part.startsWith("border-"))
    .join(" ");
}

function calendarItemColor(item: Pick<CalendarFlightItem, "aircraftRegistration" | "flightStatus">, colorByAircraft: Map<string, string>): string {
  if (item.flightStatus === "Cancelado") return "bg-red-700";
  return aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
}

function calendarItemUnassigned(item: Pick<CalendarFlightItem, "instructorId" | "flightStatus" | "isBlocked">): boolean {
  return !item.instructorId && item.flightStatus !== "Cancelado" && !item.isBlocked;
}

function calendarStudentTitle(label: string, isOutsideGenerator: boolean | undefined): string {
  const short = label.trim().split(/\s+/).slice(0, 2).join(" ");
  return isOutsideGenerator ? `*${short}` : short;
}

function eventStyleClasses(color: string, unassigned: boolean, draggable: boolean): string {
  const strike = unassigned ? "line-through decoration-white/40 decoration-1" : "";
  const pointer = draggable ? "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-white/60" : "hover:ring-1 hover:ring-white/60";
  return `overflow-hidden rounded px-1.5 py-1 text-left text-[10px] text-white ${color} ${strike} ${pointer}`;
}

function aircraftProjectionCellClass(maintenance?: string): string {
  return maintenance
    ? "border-red-500/60 bg-red-500/15 font-semibold text-red-300"
    : "border-slate-800/60 bg-slate-950/40 text-slate-400";
}

export function scheduleColumnItemMatches(item: CalendarFlightItem, column: ScheduleColumn): boolean {
  if (column.groupBy === "none") return true;
  if (column.groupBy === "aircraft") return item.aircraftRegistration === column.aircraftRegistration;
  return (item.instructorId ?? "__none__") === (column.instructorId ?? "__none__");
}

export function scheduleColumnTarget(column: ScheduleColumn): Partial<CalendarDropTarget> {
  if (column.groupBy === "aircraft") return { targetAircraftRegistration: column.aircraftRegistration };
  if (column.groupBy === "none") return {};
  return { targetInstructorId: column.instructorId ?? null };
}

type ScheduleTooltipState = {
  item: CalendarFlightItem;
  x: number;
  y: number;
} | null;

function ScheduleItemTooltipCard({ state }: { state: ScheduleTooltipState }) {
  if (!state) return null;
  const item = state.item;
  const notes = item.notes?.trim();
  const left = typeof window === "undefined" ? state.x + 14 : Math.min(state.x + 14, window.innerWidth - 292);
  const top = typeof window === "undefined" ? state.y + 14 : Math.min(state.y + 14, window.innerHeight - 220);
  return (
    <div
      className="pointer-events-none fixed z-[80] w-72 rounded-lg border border-slate-500/55 bg-slate-950/70 p-3 text-left text-xs text-slate-200 shadow-2xl shadow-slate-950/70 ring-1 ring-white/10 backdrop-blur-xl"
      style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}</p>
          <p className="font-mono text-[11px] text-sky-300">{DAY_LABEL[item.dayOfWeek]} {item.startTime}-{item.endTime}</p>
        </div>
        <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
          {item.flightStatus || "Status"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <span className="text-slate-500">Aeronave</span>
        <span className="truncate text-right font-medium text-slate-200">{item.aircraftRegistration}</span>
        <span className="text-slate-500">Instrutor</span>
        <span className="truncate text-right font-medium text-slate-200">{shortName(item.instructorLabel) || "Sem instrutor"}</span>
        <span className="text-slate-500">Horas</span>
        <span className="text-right font-medium text-slate-200">{(item.flightHours ?? item.durationHours).toFixed(1)}h</span>
        <span className="text-slate-500">Peso</span>
        <span className="text-right font-medium text-slate-200">{item.totalWeightLabel}</span>
      </div>
      {notes ? (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Observacoes</p>
          <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-snug text-slate-300">{notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function scheduleTooltipHandlers(
  item: CalendarFlightItem,
  setTooltip: Dispatch<SetStateAction<ScheduleTooltipState>>,
) {
  return {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => setTooltip({ item, x: event.clientX, y: event.clientY }),
    onMouseMove: (event: MouseEvent<HTMLElement>) => setTooltip({ item, x: event.clientX, y: event.clientY }),
    onMouseLeave: () => setTooltip(null),
  };
}

function ScheduleLegend({
  colorScheme,
  groupBy,
  aircraftColumns,
  instructorColumns,
}: {
  colorScheme: "aircraft" | "status";
  groupBy: ScheduleGroupBy;
  aircraftColumns: AircraftColumn[];
  instructorColumns: ScheduleColumn[];
}) {
  if (colorScheme === "status") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span className="font-semibold uppercase tracking-wider text-slate-500">Legenda</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Confirmado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-600" /> Planejado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-orange-600" /> Pendente</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-700" /> Cancelado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-800" /> Bloqueio de agenda</span>
      </div>
    );
  }
  const rows = aircraftColumns.map((aircraft) => ({
    key: aircraft.registration,
    label: aircraft.registration,
    colorClass: aircraft.colorClass,
  }));
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
      <span className="font-semibold uppercase tracking-wider text-slate-500">Legenda</span>
      {rows.map((row) => (
        <span key={row.key} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded border ${aircraftCardColor(row.colorClass)}`} />
          {row.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-800" /> Bloqueio de agenda</span>
      {groupBy === "instructor" && instructorColumns.length > 0 ? (
        <span className="text-slate-600">| Bordas: instrutores</span>
      ) : null}
    </div>
  );
}

export function CalendarGrid({
  items,
  days = DAY_ORDER,
  title = "Agenda semanal",
  groupBy = "aircraft",
  columns,
  colorScheme = "aircraft",
  aircraftColumns,
  instructorColumns,
  colorByAircraft,
  backgroundSupply,
  clubMemberByStudentId,
  weekStart,
  nightStartHour,
  onItemClick,
  onItemDrop,
  canDragItem,
  onEmptySlotClick,
  onPrevWeek,
  onNextWeek,
  onDayHeaderClick,
  hasPrevWeek,
  hasNextWeek,
  privacyMode = false,
  showGeneratorLegend = true,
  getItemColor,
  blockedSlots,
  projectionRows,
  projectionLoading = false,
  pastBeforeDate,
}: {
  items: CalendarFlightItem[];
  days?: readonly number[];
  title?: string;
  groupBy?: ScheduleGroupBy;
  columns?: ScheduleColumn[];
  colorScheme?: "aircraft" | "status";
  aircraftColumns?: AircraftColumn[];
  instructorColumns?: ScheduleColumn[];
  colorByAircraft: Map<string, string>;
  borderByInstructor: Map<string, string>;
  backgroundSupply?: ScheduleGridSupply | null;
  clubMemberByStudentId?: Record<string, boolean>;
  weekStart: string;
  nightStartHour: number;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  canDragItem?: (item: CalendarFlightItem) => boolean;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onDayHeaderClick?: (day: number) => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  privacyMode?: boolean;
  showGeneratorLegend?: boolean;
  showTotals?: boolean;
  getItemColor?: (item: CalendarFlightItem) => string;
  blockedSlots?: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
  projectionRows?: AircraftProjectionRow[];
  projectionLoading?: boolean;
  pastBeforeDate?: string;
}) {
  const calendarDays = days;
  const rowHeight = useCalendarRowHeight(52, 38);
  const isMobile = useIsMobileViewport();
  const isDayPast = (day: number) => Boolean(pastBeforeDate) && weekDateFromStart(weekStart, day) < pastBeforeDate!;
  const calendarHours = useMemo(() => buildCalendarHours(items), [items]);
  const calendarEndHour = (calendarHours[calendarHours.length - 1] ?? CALENDAR_START_HOUR) + 1;
  const boardHeight = calendarHours.length * rowHeight;
  const aircraftCols = aircraftColumns ?? [];
  const instructorCols = instructorColumns ?? [];
  const baseColumns = useMemo<ScheduleColumn[]>(() => {
    if (columns?.length) return columns;
    const registrations = Array.from(new Set(items.map((item) => item.aircraftRegistration)));
    return registrations.map((registration) => ({
      key: registration,
      label: registration,
      colorClass: colorByAircraft.get(registration) ?? AIRCRAFT_COLOR_CLASSES[0]!,
      groupBy: "aircraft",
      aircraftRegistration: registration,
    }));
  }, [colorByAircraft, columns, items]);
  const gridColumns = useMemo(
    () =>
      calendarDays.flatMap((day) =>
        baseColumns
          .filter((column) => items.some((item) => item.dayOfWeek === day && scheduleColumnItemMatches(item, column)))
          .map((column) => ({ day, column })),
      ),
    [baseColumns, calendarDays, items],
  );
  const columnsByDay = useMemo(() => {
    const map = new Map<number, ScheduleColumn[]>();
    for (const day of calendarDays) {
      map.set(day, gridColumns.filter((entry) => entry.day === day).map((entry) => entry.column));
    }
    return map;
  }, [calendarDays, gridColumns]);
  const byCell = useMemo(() => {
    const map = new Map<string, CalendarFlightItem[]>();
    for (const day of calendarDays) {
      for (const column of columnsByDay.get(day) ?? []) map.set(`${day}|${column.key}`, []);
    }
    for (const item of items) {
      if (!calendarDays.includes(item.dayOfWeek)) continue;
      const column = columnsByDay.get(item.dayOfWeek)?.find((candidate) => scheduleColumnItemMatches(item, candidate));
      if (!column) continue;
      const key = `${item.dayOfWeek}|${column.key}`;
      const rows = map.get(key) ?? [];
      rows.push(item);
      map.set(key, rows);
    }
    for (const key of map.keys()) {
      map.set(
        key,
        (map.get(key) ?? []).sort((a, b) => parseScheduleTimeToMinutes(a.startTime) - parseScheduleTimeToMinutes(b.startTime)),
      );
    }
    return map;
  }, [calendarDays, columnsByDay, items]);

  const layoutByCell = useMemo(() => {
    const out = new Map<string, Array<{ item: CalendarFlightItem; columnIndex: number; columnCount: number }>>();
    for (const { day, column } of gridColumns) {
      const key = `${day}|${column.key}`;
      const sorted = [...(byCell.get(key) ?? [])].sort((a, b) => {
        const aStart = parseScheduleTimeToMinutes(a.startTime);
        const bStart = parseScheduleTimeToMinutes(b.startTime);
        if (aStart !== bStart) return aStart - bStart;
        return a.durationHours - b.durationHours;
      });
      const groups: CalendarFlightItem[][] = [];
      let currentGroup: CalendarFlightItem[] = [];
      let currentGroupEnd = -1;

      for (const item of sorted) {
        const start = parseScheduleTimeToMinutes(item.startTime);
        const end = start + Math.round(item.durationHours * 60);
        if (currentGroup.length === 0 || start < currentGroupEnd) {
          currentGroup.push(item);
          currentGroupEnd = Math.max(currentGroupEnd, end);
        } else {
          groups.push(currentGroup);
          currentGroup = [item];
          currentGroupEnd = end;
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);

      const entries: Array<{ item: CalendarFlightItem; columnIndex: number; columnCount: number }> = [];
      for (const group of groups) {
        const active: Array<{ end: number; column: number }> = [];
        const assigned = new Map<string, number>();
        let maxColumn = 0;
        for (const item of group) {
          const start = parseScheduleTimeToMinutes(item.startTime);
          const end = start + Math.round(item.durationHours * 60);
          for (let i = active.length - 1; i >= 0; i -= 1) {
            if (active[i]!.end <= start) active.splice(i, 1);
          }
          let nextColumn = 0;
          while (active.some((node) => node.column === nextColumn)) nextColumn += 1;
          active.push({ end, column: nextColumn });
          assigned.set(item.id, nextColumn);
          maxColumn = Math.max(maxColumn, nextColumn + 1);
        }
        for (const item of group) entries.push({ item, columnIndex: assigned.get(item.id) ?? 0, columnCount: maxColumn });
      }
      out.set(key, entries);
    }
    return out;
  }, [byCell, gridColumns]);

  const cellTotals = useMemo(() => {
    const byCell = new Map<string, { flights: number; hours: number }>();
    for (const { day, column } of gridColumns) byCell.set(`${day}|${column.key}`, { flights: 0, hours: 0 });
    for (const item of items) {
      if (!calendarDays.includes(item.dayOfWeek)) continue;
      const column = columnsByDay.get(item.dayOfWeek)?.find((candidate) => scheduleColumnItemMatches(item, candidate));
      if (!column) continue;
      const key = `${item.dayOfWeek}|${column.key}`;
      const row = byCell.get(key);
      if (!row) continue;
      row.flights += 1;
      row.hours += item.flightHours ?? item.durationHours;
      byCell.set(key, row);
    }
    return byCell;
  }, [calendarDays, columnsByDay, gridColumns, items]);

  const cellBoardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragState, setDragState] = useState<{
    item: CalendarFlightItem;
    preview: CalendarDropTarget;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const dragEndedRef = useRef(false);
  const pointerClickHandledRef = useRef(false);
  const [tooltip, setTooltip] = useState<ScheduleTooltipState>(null);
  const draggable = Boolean(onItemDrop);
  const dragThresholdPx = 5;

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number): CalendarDropTarget | null => {
      for (const { day, column } of gridColumns) {
        const key = `${day}|${column.key}`;
        const board = cellBoardRefs.current.get(key);
        if (!board) continue;
        const r = board.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
        const startMinute = snapCalendarPointerToStartMinute(clientY, r.top, rowHeight, calendarEndHour);
        return {
          dayOfWeek: day,
          startHour: startMinute / 60,
          startTime: minutesToScheduleHHMM(startMinute),
          isNight: startMinute >= nightStartHour * 60,
          ...scheduleColumnTarget(column),
        };
      }
      return null;
    },
    [calendarEndHour, gridColumns, nightStartHour, rowHeight],
  );

  useEffect(() => {
    if (!dragState) return;
    function onMove(e: PointerEvent) {
      setDragState((p) => {
        if (!p) return p;
        const moved = p.hasMoved || Math.hypot(e.clientX - p.startX, e.clientY - p.startY) >= dragThresholdPx;
        const t = moved ? resolveDropTarget(e.clientX, e.clientY) : null;
        return { ...p, hasMoved: moved, preview: t ?? p.preview };
      });
    }
    function onUp(e: PointerEvent) {
      setDragState((p) => {
        if (p?.hasMoved && onItemDrop) {
          dragEndedRef.current = true;
          onItemDrop(p.item, resolveDropTarget(e.clientX, e.clientY) ?? p.preview);
        } else if (p) {
          pointerClickHandledRef.current = true;
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
  }, [dragState, onItemClick, onItemDrop, resolveDropTarget]);

  return (
    <section className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <ScheduleLegend colorScheme={colorScheme} groupBy={groupBy} aircraftColumns={aircraftCols} instructorColumns={instructorCols} />
        </div>
        {(onPrevWeek || onNextWeek) && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrevWeek} disabled={!hasPrevWeek} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30" title="Semana anterior">
              ‹
            </button>
            <button type="button" onClick={onNextWeek} disabled={!hasNextWeek} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30" title="Próxima semana">
              ›
            </button>
          </div>
        )}
      </div>
      {draggable ? <p className="mb-2 text-[11px] text-slate-600">Arraste um voo para reagendar. Ao soltar, confirme no modal.</p> : null}
      {showGeneratorLegend ? (
        <p className="mb-2 text-[11px] text-slate-600">
          <span className="text-amber-200">*</span> Voo agendado fora do gerador automático de escala.
        </p>
      ) : null}
      {gridColumns.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">Nenhum voo no período.</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1" style={isMobile ? { minWidth: `${gridColumns.length * MOBILE_MIN_COLUMN_PX + MOBILE_HOURS_GUTTER_PX}px` } : undefined}>
            <thead>
              <tr>
                <th className="w-8 pb-1 text-right text-[10px] font-medium text-slate-600 sm:w-12" />
                {calendarDays.map((day) => {
                  const dayColumns = columnsByDay.get(day) ?? [];
                  if (dayColumns.length === 0) return null;
                  const date = dayOfWeekToDate(weekStart, day);
                  const today = isDateToday(date);
                  const past = isDayPast(day);
                  const clickable = Boolean(onDayHeaderClick) && !past;
                  return (
                    <th key={day} colSpan={dayColumns.length} className={`rounded-t-md border-l-2 border-sky-500/30 bg-slate-800/25 p-0 text-center text-[10px] font-semibold text-slate-400 sm:text-xs ${past ? "opacity-40" : ""}`}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={clickable ? () => onDayHeaderClick?.(day) : undefined}
                        className={`w-full rounded-t-md pb-1 pt-1 transition-colors ${clickable ? "cursor-pointer hover:bg-sky-500/10 hover:text-sky-300" : "cursor-default"}`}
                        title={clickable ? "Abrir agenda diaria" : undefined}
                      >
                        <span className="block uppercase">{DAY_LABEL[day]}</span>
                        <span className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${today ? "bg-sky-300 text-slate-950" : "text-slate-300"}`}>
                          {date.getDate()}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th className="w-8 pb-1 text-right text-[10px] font-medium text-slate-600 sm:w-12" />
                {gridColumns.map(({ day, column }) => {
                  const key = `${day}|${column.key}`;
                  const totals = cellTotals.get(key) ?? { flights: 0, hours: 0 };
                  const projectionCell = groupBy === "aircraft" ? projectionRows?.find((row) => row.registration === column.aircraftRegistration)?.hoursByDay[day] : undefined;
                  const isFirstDayColumn = (columnsByDay.get(day)?.[0]?.key ?? "") === column.key;
                  return (
                    <th key={`${day}-${column.key}`} className={`bg-slate-800/10 pb-1 text-center ${isFirstDayColumn ? "border-l-2 border-sky-500/30" : ""} ${isDayPast(day) ? "opacity-40" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded border ${groupBy === "instructor" ? `${column.colorClass} border-2 bg-slate-800` : aircraftCardColor(column.colorClass)}`} />
                        <span className="truncate text-[10px] font-semibold text-slate-300 sm:text-[11px]">{column.label}</span>
                      </div>
                      <p className="truncate text-[10px] font-normal text-slate-500">{totals.flights} voo{totals.flights === 1 ? "" : "s"} · {totals.hours.toFixed(1)}h</p>
                      {projectionLoading && groupBy === "aircraft" ? (
                        <Skeleton className="mx-auto mt-1 h-4 w-14 rounded" />
                      ) : projectionCell ? (
                        <p className={`mx-auto mt-1 truncate rounded border px-1 py-0.5 text-[11px] font-semibold ${aircraftProjectionCellClass(projectionCell.maintenance)}`}>
                          {projectionCell.hours == null ? "—" : `${projectionCell.hours.toFixed(1)}h`}
                          {projectionCell.maintenance ? ` · ${projectionCell.maintenance}` : ""}
                        </p>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="align-top pr-1 sm:pr-2">
                  <div className="relative" style={{ height: `${boardHeight}px` }}>
                    {calendarHours.map((hour, idx) => (
                      <div key={hour} className="absolute right-0 w-7 text-right text-[11px] font-mono text-slate-600 sm:w-11" style={{ top: `${idx * rowHeight}px` }}>
                        {hour}h
                      </div>
                    ))}
                  </div>
                </td>
                {gridColumns.map(({ day, column }) => {
                  const cellKey = `${day}|${column.key}`;
                  const isFirstDayColumn = (columnsByDay.get(day)?.[0]?.key ?? "") === column.key;
                  const cellPast = isDayPast(day);
                  return (
                    <td key={cellKey} className={`align-top p-0 ${isFirstDayColumn ? "border-l-2 border-sky-500/30 pl-0.5" : ""}`}>
                      <div
                        ref={(node) => {
                          if (node) cellBoardRefs.current.set(cellKey, node);
                          else cellBoardRefs.current.delete(cellKey);
                        }}
                        className={`relative overflow-hidden rounded border border-slate-700/60 bg-slate-950/40 sm:rounded-md ${cellPast ? "cursor-default" : ""}`}
                        style={{ height: `${boardHeight}px` }}
                        onClick={(e) => {
                          if (cellPast || !onEmptySlotClick || dragState) return;
                          const target = resolveDropTarget(e.clientX, e.clientY);
                          if (target) onEmptySlotClick(target);
                        }}
                      >
                        {cellPast ? <div className="pointer-events-none absolute inset-0 z-20 bg-slate-950/55" /> : null}
                        {nightStartHour < calendarEndHour ? (
                          <div className="pointer-events-none absolute inset-x-0 bg-indigo-950/25" style={{ top: `${Math.max(0, nightStartHour - CALENDAR_START_HOUR) * rowHeight}px`, bottom: 0 }} />
                        ) : null}
                        {backgroundSupply
                          ? calendarHours.map((hour, idx) => {
                              const state = backgroundSupply.slotStates[`${day}-${hour}`];
                              if (!state) return null;
                              return <div key={`bg-${day}-${hour}`} className={`absolute left-0 right-0 ${SLOT_BG_TINT[state]}`} style={{ top: `${idx * rowHeight}px`, height: `${rowHeight}px` }} />;
                            })
                          : null}
                        {calendarHours.map((hour, idx) => (
                          <div key={`${day}-${hour}`} className="absolute left-0 right-0 border-b border-slate-700/40" style={{ top: `${idx * rowHeight}px` }} />
                        ))}
                        {blockedSlots?.filter((s) => s.dayOfWeek === day).map((s, i) => {
                          const startIdx = calendarHours.findIndex((h) => h >= Math.floor(s.startHour));
                          if (startIdx < 0) return null;
                          const endIdx = calendarHours.findIndex((h) => h >= Math.ceil(s.endHour));
                          const spanRows = (endIdx < 0 ? calendarHours.length : endIdx) - startIdx;
                          return (
                            <div key={`blocked-${i}`} className="pointer-events-none absolute inset-x-0 flex items-start justify-center bg-red-500/20" style={{ top: `${startIdx * rowHeight}px`, height: `${Math.max(1, spanRows) * rowHeight}px` }}>
                              <span className="rounded-b bg-red-950/70 px-1 text-[9px] font-medium text-red-300">Bloqueado</span>
                            </div>
                          );
                        })}
                        {(layoutByCell.get(cellKey) ?? []).map((entry) => {
                          const item = entry.item;
                          if (dragState?.hasMoved && dragState.item.id === item.id) return null;
                          const top = calendarTopPx(parseScheduleTimeToMinutes(item.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const color = getItemColor ? getItemColor(item) : calendarItemColor(item, colorByAircraft);
                          const itemDraggable = draggable && (canDragItem ? canDragItem(item) : true);
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              {...scheduleTooltipHandlers(item, setTooltip)}
                              onPointerDown={(e) => {
                                if (!itemDraggable || e.pointerType !== "mouse") return;
                                e.preventDefault();
                                e.stopPropagation();
                                dragEndedRef.current = false;
                                pointerClickHandledRef.current = false;
                                const target = resolveDropTarget(e.clientX, e.clientY) ?? {
                                  dayOfWeek: item.dayOfWeek,
                                  startHour: item.startHour,
                                  startTime: item.startTime,
                                  isNight: Boolean(item.isNight),
                                };
                                setDragState({ item, preview: target, startX: e.clientX, startY: e.clientY, hasMoved: false });
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (dragEndedRef.current) {
                                  dragEndedRef.current = false;
                                  e.preventDefault();
                                  return;
                                }
                                if (pointerClickHandledRef.current) {
                                  pointerClickHandledRef.current = false;
                                  e.preventDefault();
                                  return;
                                }
                                onItemClick(item);
                              }}
                              className={`absolute ${eventStyleClasses(color, !privacyMode && calendarItemUnassigned(item), itemDraggable)}`}
                              style={{
                                top: `${top}px`,
                                height: `${height - 4}px`,
                                left: `calc(${leftPercent}% + 4px)`,
                                width: `calc(${widthPercent}% - 8px)`,
                              }}
                            >
                              <p className="flex min-w-0 items-center gap-1 font-semibold text-white">
                                <span className="truncate">
                                  {privacyMode ? (item.isBlocked || item.isOwn ? item.studentLabel : "Ocupado") : calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}
                                </span>
                                {!privacyMode && clubMemberByStudentId?.[item.studentId] ? <FlightReviewClubBadge /> : null}
                              </p>
                              <p className="truncate opacity-90">{item.startTime}-{item.endTime}</p>
                              <p className="truncate opacity-80">{privacyMode ? (item.isBlocked ? "" : item.aircraftRegistration) : `${item.aircraftRegistration} · ${shortName(item.instructorLabel) || "Sem instrutor"}`}</p>
                              {!privacyMode ? <p className="truncate opacity-80">Peso: {item.totalWeightLabel}</p> : null}
                            </div>
                          );
                        })}
                        {dragState?.hasMoved && dragState.preview.dayOfWeek === day && scheduleColumnItemMatches({
                          ...dragState.item,
                          aircraftRegistration: dragState.preview.targetAircraftRegistration ?? dragState.item.aircraftRegistration,
                          instructorId: dragState.preview.targetInstructorId !== undefined ? dragState.preview.targetInstructorId : dragState.item.instructorId,
                        }, column) ? (() => {
                          const item = dragState.item;
                          const entry = (layoutByCell.get(cellKey) ?? []).find((e) => e.item.id === item.id) ?? { item, columnIndex: 0, columnCount: 1 };
                          const top = calendarTopPx(parseScheduleTimeToMinutes(dragState.preview.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          const color = calendarItemColor(item, colorByAircraft);
                          return (
                            <div key="preview" className={`pointer-events-none absolute overflow-hidden rounded border-2 border-dashed border-white/70 bg-white/10 px-1.5 py-1 text-[10px] text-white shadow-lg ring-2 ring-violet-400/50 ${color}`} style={{ top: `${top}px`, height: `${height - 4}px`, left: `calc(${leftPercent}% + 4px)`, width: `calc(${widthPercent}% - 8px)` }}>
                              <p className="truncate font-semibold">{shortName(item.studentLabel, item.studentLabel)}</p>
                              <p className="truncate opacity-80">Solte para confirmar</p>
                            </div>
                          );
                        })() : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <ScheduleItemTooltipCard state={tooltip} />
    </section>
  );
}
