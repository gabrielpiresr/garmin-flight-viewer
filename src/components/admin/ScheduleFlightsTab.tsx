import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { listAircrafts } from "../../lib/aircraftDb";
import { SCHOOL_ID } from "../../lib/appwrite";
import { decodeFlightRecord, encodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { deleteSavedFlight, getSavedFlight, insertFlight, updateFlight, FLIGHT_STATUS_OPTIONS, type FlightStatus } from "../../lib/flightsDb";
import { dispatchNotificationEvent, syncFlightCalendarEvent } from "../../lib/notificationsDb";
import { cancelScheduleFlight, confirmScheduleFlight } from "../../lib/scheduleBookingDb";
import { syncSagaScheduleEvent, type SagaScheduleSyncMode, type SagaScheduleSyncResult } from "../../lib/sagaImportDb";
import {
  buildConflictsByFlightId,
  detectFlightConflicts,
  type DetectedFlightConflict,
} from "../../lib/scheduleConflicts";
import {
  AUTO_SOURCE_PREFIX,
  getScheduleWeekData,
  generateScheduleWeekPickerOptions,
  getCurrentWeekStart,
  getScheduleWeekPickerOptions,
  pickDefaultScheduleWeek,
  MANUAL_SOURCE_PREFIX,
} from "../../lib/scheduleGenerationDb";
import { shortName } from "../../lib/flightDisplay";
import { getStudentCreditStatement } from "../../lib/creditsDb";
import { getSchoolRules } from "../../lib/schoolRulesDb";
import type { StudentCreditModelSummary } from "../../types/credits";
import { listStudentTrainingTracks } from "../../lib/trainingTracksDb";
import {
  buildScheduleHourOptions,
  hourSelectValue,
  parseHourSelectValue,
} from "../../lib/scheduleTimeOptions";
import {
  calendarTopPx,
  minutesToScheduleHHMM,
  parseScheduleTimeToMinutes,
} from "../../lib/scheduleTimeGrid";
import { SLOT_HOURS, type SlotState } from "../../types/admin";
import { DEFAULT_FLIGHT_SCHEDULE_RULES, type FlightScheduleRules } from "../../types/schoolRules";
import type {
  ExistingScheduledFlight,
  InstructorIdentity,
  ScheduleWeekData,
  ScheduleWeekOption,
} from "../../types/schedule";
import type { Aircraft } from "../../types/admin";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { StudentSearchSelect } from "./StudentSearchSelect";
import { FlightReviewClubBadge, hasActiveFlightReviewClubTrack } from "../FlightReviewClubBadge";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const AIRCRAFT_COLOR_CLASSES = [
  "bg-sky-600/90 border-sky-400/70",
  "bg-emerald-600/90 border-emerald-400/70",
  "bg-violet-600/90 border-violet-400/70",
  "bg-amber-600/90 border-amber-400/70",
  "bg-cyan-600/90 border-cyan-400/70",
  "bg-fuchsia-600/90 border-fuchsia-400/70",
  "bg-rose-600/90 border-rose-400/70",
];
const INSTRUCTOR_BORDER_CLASSES = [
  "border-lime-300",
  "border-orange-300",
  "border-pink-300",
  "border-teal-300",
  "border-indigo-300",
  "border-red-300",
  "border-yellow-300",
];
const CALENDAR_START_HOUR = SLOT_HOURS[0] ?? 6;
const CALENDAR_MIN_END_HOUR = (SLOT_HOURS[SLOT_HOURS.length - 1] ?? 17) + 1;
const CALENDAR_MAX_END_HOUR = 24;
const schoolId = SCHOOL_ID ?? "escola_principal";

type SagaScheduleSyncLogItem = SagaScheduleSyncResult & {
  id: string;
  createdAt: string;
};

function sagaSyncVariant(status: SagaScheduleSyncResult["status"]): "success" | "warning" | "error" {
  if (status === "synced" || status === "cancelled") return "success";
  if (status === "skipped") return "warning";
  return "error";
}

function normalizeSagaSyncStatus(status: unknown): SagaScheduleSyncResult["status"] {
  return status === "synced" || status === "cancelled" || status === "skipped" || status === "failed"
    ? status
    : "failed";
}

function SagaScheduleSyncLogPanel({
  logs,
  onClear,
}: {
  logs: SagaScheduleSyncLogItem[];
  onClear: () => void;
}) {
  if (!logs.length) return null;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Log SAGA</h3>
          <p className="text-xs text-slate-500">Falhas no SAGA nao desfazem a agenda local.</p>
        </div>
        <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
          Limpar
        </button>
      </div>
      <div className="space-y-2">
        {logs.map((item) => {
          const status = normalizeSagaSyncStatus(item.status);
          return (
            <details key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <summary className="cursor-pointer list-none">
                <span className={`font-semibold ${status === "failed" ? "text-rose-300" : status === "skipped" ? "text-amber-200" : "text-emerald-300"}`}>
                  {status.toUpperCase()}
                </span>
                <span className="ml-2">{item.message || "Sem mensagem retornada pela sincronizacao SAGA."}</span>
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-2 text-[11px] text-slate-400">
{JSON.stringify({
  at: item.createdAt,
  mode: item.mode,
  flightId: item.flightId,
  sagaScheduleId: item.sagaScheduleId,
  endpoint: item.endpoint,
  httpStatus: item.httpStatus,
  requestPayload: item.requestPayload,
  response: item.response,
  logs: item.logs,
}, null, 2)}
              </pre>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function aircraftCardColor(className: string): string {
  return className
    .split(" ")
    .filter((part) => !part.startsWith("border-"))
    .join(" ");
}

const SLOT_BG_TINT: Record<SlotState, string> = {
  preferred: "bg-emerald-500/20",
  normal: "bg-sky-500/20",
  avoid: "bg-amber-400/20",
  blocked: "bg-red-500/22",
};

const FLIGHT_CANCELLATION_REASONS = [
  "Meteorologia - vento",
  "Meteorologia - visibilidade",
  "Meteorologia - outros",
  "Cancelado pelo aluno",
  "Cancelado pelo instrutor",
  "Manutenção corretiva",
  "Manutenção preventiva",
  "Indisponibilidade aeroporto",
  "Aluno atrasado",
  "Aluno não se preparou",
  "Outro",
] as const;

type FlightFormDraft = {
  id?: string;
  demandId: string;
  sourceFilename?: string;
  studentId: string;
  studentLabel: string;
  instructorId: string | null;
  instructorLabel: string | null;
  instructorAnac: string | null;
  aircraftRegistration: string;
  dayOfWeek: number;
  startTime: string;
  startHour: number;
  durationHours: number;
  isNight?: boolean;
  sagaScheduleId?: string | null;
  flightStatus?: FlightStatus;
  cancellationReason?: string;
  cancellationReasonText?: string;
  waiveCancellationPenalty?: boolean;
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
  flightStatus?: FlightStatus;
  startTime: string;
  endTime: string;
  isNight?: boolean;
  isOutsideGenerator?: boolean;
  isOwn?: boolean;
  isBlocked?: boolean;
};

function calendarItemColor(item: Pick<CalendarFlightItem, "aircraftRegistration" | "flightStatus">, colorByAircraft: Map<string, string>): string {
  if (item.flightStatus === "Cancelado") return "bg-red-700/90";
  return aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
}

function calendarStudentTitle(label: string, isOutsideGenerator: boolean | undefined): string {
  const short = label.trim().split(/\s+/).slice(0, 2).join(" ");
  return isOutsideGenerator ? `*${short}` : short;
}

function dayOfWeekToDate(weekStart: string, dayOfWeek: number): Date {
  const date = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return date;
}

function formatShortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function hoursToHHMM(hours: number): string {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseStartHour(startTime: string): number {
  const [hh, mm] = startTime.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
}

function buildCalendarHours(items: CalendarFlightItem[]): number[] {
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

function snapCalendarPointerToStartMinute(
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

function useCalendarRowHeight(mobileHeight: number, desktopHeight: number): number {
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

function buildAutoMeta(draft: FlightFormDraft, weekStart: string, instructor?: InstructorIdentity | null): FlightRecordMeta {
  const weekDate = weekDateFromStart(weekStart, draft.dayOfWeek);
  const engineCut = minutesToScheduleHHMM(parseScheduleTimeToMinutes(draft.startTime) + Math.round(draft.durationHours * 60));
  return {
    schedule: {
      version: "AUTO_SCHEDULE_V1",
      weekStart,
      demandId: draft.demandId,
    },
    header: {
      studentUserId: draft.studentId,
      studentLabel: draft.studentLabel,
      studentName: draft.studentLabel,
      instructorUserId: draft.instructorId ?? undefined,
      instructorName: instructor?.label ?? draft.instructorLabel ?? "",
      instructorAnac: instructor?.anacCode ?? draft.instructorAnac ?? "",
      date: weekDate,
      startTime: draft.startTime,
      departureTimeUtc: draft.startTime,
      engineCutoffTimeUtc: engineCut,
      aircraft: draft.aircraftRegistration,
      isNight: draft.isNight ?? false,
    },
    preFlight: {
      objectiveMd: "",
      briefingMd: "",
    },
    legs: [
      {
        id: crypto.randomUUID(),
        date: weekDate,
        role: "DUPLO COMANDO",
        dep: "---",
        arr: "---",
        landings: 0,
        flightTime: hoursToHHMM(draft.durationHours),
        navTime: "00:00",
        ifrTime: "00:00",
        nightTime: "00:00",
        serviceTime: hoursToHHMM(draft.durationHours),
        engineStart: draft.startTime,
        takeoff: "",
        landing: "",
        engineCut,
        distance: "0",
      },
    ],
    risk: { commentsMd: "", dangerMd: "", riskMd: "", managementMd: "", instructorOpinionMd: "" },
  };
}

function conflictTypeLabel(type: DetectedFlightConflict["type"]): string {
  if (type === "aircraft_blocked") return "Aeronave bloqueada";
  if (type === "min_gap") return "Menos de 30 min entre voos";
  if (type === "overlap") return "Voos sobrepostos";
  return "Outro";
}

function resolveInstructorDraft(
  instructors: InstructorIdentity[],
  instructorId: string | null,
): Pick<FlightFormDraft, "instructorId" | "instructorLabel" | "instructorAnac"> {
  if (!instructorId) return { instructorId: null, instructorLabel: null, instructorAnac: null };
  const instructor = instructors.find((row) => row.userId === instructorId);
  return {
    instructorId,
    instructorLabel: instructor?.label ?? instructorId,
    instructorAnac: instructor?.anacCode ?? null,
  };
}

export type CalendarDropTarget = {
  dayOfWeek: number;
  startHour: number;
  startTime: string;
  isNight: boolean;
  targetInstructorId?: string | null;
  targetAircraftRegistration?: string;
};

function eventStyleClasses(color: string, instructorBorder: string | null, unassigned: boolean, draggable: boolean): string {
  const border = unassigned ? "border-white/25" : (instructorBorder ?? "border-white/80");
  const strike = unassigned ? "line-through decoration-white/40 decoration-1 opacity-75" : "";
  const pointer = draggable ? "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-white/60" : "hover:ring-1 hover:ring-white/60";
  return `overflow-hidden rounded border-2 px-1.5 py-1 text-left text-[10px] text-white ${color} ${border} ${strike} ${pointer}`;
}

export function CalendarGrid({
  items,
  days = DAY_ORDER,
  title = "Agenda semanal",
  colorByAircraft,
  borderByInstructor,
  backgroundSupply,
  clubMemberByStudentId,
  weekStart,
  nightStartHour,
  onItemClick,
  onItemDrop,
  onEmptySlotClick,
  onPrevWeek,
  onNextWeek,
  hasPrevWeek,
  hasNextWeek,
  privacyMode = false,
  showTotals = true,
  showGeneratorLegend = true,
  getItemColor,
  blockedSlots,
}: {
  items: CalendarFlightItem[];
  days?: readonly number[];
  title?: string;
  colorByAircraft: Map<string, string>;
  borderByInstructor: Map<string, string>;
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  clubMemberByStudentId?: Record<string, boolean>;
  weekStart: string;
  nightStartHour: number;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  privacyMode?: boolean;
  showTotals?: boolean;
  showGeneratorLegend?: boolean;
  getItemColor?: (item: CalendarFlightItem) => string;
  blockedSlots?: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
}) {
  const calendarDays = days;
  const rowHeight = useCalendarRowHeight(52, 38);
  const calendarHours = useMemo(() => buildCalendarHours(items), [items]);
  const calendarEndHour = (calendarHours[calendarHours.length - 1] ?? CALENDAR_START_HOUR) + 1;
  const boardHeight = calendarHours.length * rowHeight;
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarFlightItem[]>();
    for (const day of calendarDays) map.set(day, []);
    for (const item of items) {
      if (!calendarDays.includes(item.dayOfWeek)) continue;
      const rows = map.get(item.dayOfWeek) ?? [];
      rows.push(item);
      map.set(item.dayOfWeek, rows);
    }
    for (const day of calendarDays) {
      map.set(
        day,
        (map.get(day) ?? []).sort((a, b) => parseScheduleTimeToMinutes(a.startTime) - parseScheduleTimeToMinutes(b.startTime)),
      );
    }
    return map;
  }, [calendarDays, items]);

  const layoutByDay = useMemo(() => {
    const out = new Map<
      number,
      Array<{
        item: CalendarFlightItem;
        columnIndex: number;
        columnCount: number;
      }>
    >();

    for (const day of calendarDays) {
      const sorted = [...(byDay.get(day) ?? [])].sort((a, b) => {
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
        for (const item of group) {
          entries.push({
            item,
            columnIndex: assigned.get(item.id) ?? 0,
            columnCount: maxColumn,
          });
        }
      }
      out.set(day, entries);
    }

    return out;
  }, [byDay, calendarDays]);

  const dayTotals = useMemo(() => {
    const byDay = new Map<number, { flights: number; hours: number }>();
    for (const day of calendarDays) byDay.set(day, { flights: 0, hours: 0 });
    for (const item of items) {
      if (!calendarDays.includes(item.dayOfWeek)) continue;
      const row = byDay.get(item.dayOfWeek) ?? { flights: 0, hours: 0 };
      row.flights += 1;
      row.hours += item.durationHours;
      byDay.set(item.dayOfWeek, row);
    }
    let cumFlights = 0;
    let cumHours = 0;
    const cumulative = new Map<number, { flights: number; hours: number }>();
    for (const day of calendarDays) {
      const d = byDay.get(day) ?? { flights: 0, hours: 0 };
      cumFlights += d.flights;
      cumHours += d.hours;
      cumulative.set(day, { flights: cumFlights, hours: Number(cumHours.toFixed(1)) });
    }
    return { byDay, cumulative };
  }, [calendarDays, items]);

  const dayBoardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [dragState, setDragState] = useState<{
    item: CalendarFlightItem;
    preview: CalendarDropTarget;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const dragEndedRef = useRef(false);
  const pointerClickHandledRef = useRef(false);
  const draggable = Boolean(onItemDrop);
  const dragThresholdPx = 5;

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number): CalendarDropTarget | null => {
      for (const day of calendarDays) {
        const board = dayBoardRefs.current.get(day);
        if (!board) continue;
        const r = board.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
        const startMinute = snapCalendarPointerToStartMinute(clientY, r.top, rowHeight, calendarEndHour);
        return {
          dayOfWeek: day,
          startHour: startMinute / 60,
          startTime: minutesToScheduleHHMM(startMinute),
          isNight: startMinute >= nightStartHour * 60,
        };
      }
      return null;
    },
    [calendarDays, calendarEndHour, nightStartHour, rowHeight],
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        {(onPrevWeek || onNextWeek) && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrevWeek}
              disabled={!hasPrevWeek}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              title="Semana anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              disabled={!hasNextWeek}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              title="Próxima semana"
            >
              ›
            </button>
          </div>
        )}
      </div>
      {draggable ? (
        <p className="mb-2 text-[11px] text-slate-600">Arraste um voo para reagendar. Ao soltar, confirme no modal.</p>
      ) : null}
      {showGeneratorLegend ? (
        <p className="mb-2 text-[11px] text-slate-600">
          <span className="text-amber-200">*</span> Voo agendado fora do gerador automático de escala.
        </p>
      ) : null}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-0 table-fixed border-separate border-spacing-0.5 sm:border-spacing-1">
          <thead>
            <tr>
              <th className="w-12 pb-1 text-right text-[10px] font-medium text-slate-600" />
              {calendarDays.map((day) => {
                const date = dayOfWeekToDate(weekStart, day);
                const today = isDateToday(date);
                return (
                  <th key={day} className="pb-1 text-center text-[10px] font-semibold text-slate-400 sm:text-xs">
                    <span className="block uppercase">{DAY_LABEL[day]}</span>
                    <span className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${today ? "bg-sky-300 text-slate-950" : "text-slate-300"}`}>
                      {date.getDate()}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="align-top pr-2">
                <div className="relative" style={{ height: `${boardHeight}px` }}>
                  {calendarHours.map((hour, idx) => (
                    <div key={hour} className="absolute right-0 text-right text-[11px] font-mono text-slate-600" style={{ top: `${idx * rowHeight}px`, width: "2.8rem" }}>
                      {hour}h
                    </div>
                  ))}
                </div>
              </td>
              {calendarDays.map((day) => (
                <td key={day} className="align-top p-0">
                  <div
                    ref={(node) => {
                      if (node) dayBoardRefs.current.set(day, node);
                      else dayBoardRefs.current.delete(day);
                    }}
                    className="relative overflow-hidden rounded border border-slate-700/60 bg-slate-950/40 sm:rounded-md"
                    style={{ height: `${boardHeight}px` }}
                    onClick={(e) => {
                      if (!onEmptySlotClick || dragState) return;
                      const target = resolveDropTarget(e.clientX, e.clientY);
                      if (target) onEmptySlotClick(target);
                    }}
                  >
                    {nightStartHour < calendarEndHour ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 bg-indigo-950/25"
                        style={{
                          top: `${Math.max(0, nightStartHour - CALENDAR_START_HOUR) * rowHeight}px`,
                          bottom: 0,
                        }}
                      />
                    ) : null}
                    {backgroundSupply
                      ? calendarHours.map((hour, idx) => {
                          const state = backgroundSupply.slotStates[`${day}-${hour}`];
                          if (!state) return null;
                          return (
                            <div
                              key={`bg-${day}-${hour}`}
                              className={`absolute left-0 right-0 ${SLOT_BG_TINT[state]}`}
                              style={{ top: `${idx * rowHeight}px`, height: `${rowHeight}px` }}
                            />
                          );
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
                        <div
                          key={`blocked-${i}`}
                          className="pointer-events-none absolute inset-x-0 flex items-start justify-center bg-red-500/20"
                          style={{ top: `${startIdx * rowHeight}px`, height: `${Math.max(1, spanRows) * rowHeight}px` }}
                        >
                          <span className="rounded-b bg-red-950/70 px-1 text-[9px] font-medium text-red-300">Bloqueado</span>
                        </div>
                      );
                    })}
                    {(layoutByDay.get(day) ?? []).map((entry) => {
                      const item = entry.item;
                      if (dragState?.item.id === item.id) return null;
                      const top = calendarTopPx(parseScheduleTimeToMinutes(item.startTime), rowHeight);
                      const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                      const color = getItemColor ? getItemColor(item) : calendarItemColor(item, colorByAircraft);
                      const instructorBorder = item.instructorId ? borderByInstructor.get(item.instructorId) ?? null : null;
                      const widthPercent = 100 / Math.max(1, entry.columnCount);
                      const leftPercent = entry.columnIndex * widthPercent;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => {
                            if (!draggable) return;
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
                          className={`absolute ${eventStyleClasses(color, instructorBorder, !item.instructorId, draggable)}`}
                          style={{
                            top: `${top}px`,
                            height: `${height - 4}px`,
                            left: `calc(${leftPercent}% + 4px)`,
                            width: `calc(${widthPercent}% - 8px)`,
                          }}
                        >
                          <p className="flex min-w-0 items-center gap-1 font-semibold text-white">
                            <span className="truncate">
                              {privacyMode
                                ? (item.isBlocked || item.isOwn ? item.studentLabel : "Ocupado")
                                : calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}
                            </span>
                            {!privacyMode && clubMemberByStudentId?.[item.studentId] ? <FlightReviewClubBadge /> : null}
                          </p>
                          <p className="truncate opacity-90">{item.startTime}-{item.endTime}</p>
                          <p className="truncate opacity-80">
                            {privacyMode ? (item.isBlocked ? "" : item.aircraftRegistration) : `${item.aircraftRegistration} · ${shortName(item.instructorLabel) || "Sem instrutor"}`}
                          </p>
                          {!privacyMode ? <p className="truncate opacity-80">Peso: {item.totalWeightLabel}</p> : null}
                        </div>
                      );
                    })}
                    {dragState && dragState.preview.dayOfWeek === day ? (() => {
                      const item = dragState.item;
                      const entry = (layoutByDay.get(day) ?? []).find((e) => e.item.id === item.id) ?? {
                        item,
                        columnIndex: 0,
                        columnCount: 1,
                      };
                      const top = calendarTopPx(parseScheduleTimeToMinutes(dragState.preview.startTime), rowHeight);
                      const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                      const widthPercent = 100 / Math.max(1, entry.columnCount);
                      const leftPercent = entry.columnIndex * widthPercent;
                      const color = calendarItemColor(item, colorByAircraft);
                      return (
                        <div
                          key="preview"
                          className={`pointer-events-none absolute overflow-hidden rounded border-2 border-dashed border-white/70 bg-white/10 px-1.5 py-1 text-[10px] text-white shadow-lg ring-2 ring-violet-400/50 ${color}`}
                          style={{
                            top: `${top}px`,
                            height: `${height - 4}px`,
                            left: `calc(${leftPercent}% + 4px)`,
                            width: `calc(${widthPercent}% - 8px)`,
                          }}
                        >
                          <p className="truncate font-semibold">{shortName(item.studentLabel, item.studentLabel)}</p>
                          <p className="truncate opacity-80">Solte para confirmar</p>
                        </div>
                      );
                    })() : null}
                  </div>
                </td>
              ))}
            </tr>
            {showTotals ? <tr>
              <td className="pr-2 pt-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total
              </td>
              {calendarDays.map((day) => {
                const d = dayTotals.byDay.get(day) ?? { flights: 0, hours: 0 };
                const cum = dayTotals.cumulative.get(day) ?? { flights: 0, hours: 0 };
                return (
                  <td key={day} className="p-0 pt-2">
                    <div className="rounded-md border border-slate-700/50 bg-slate-800/40 px-2 py-2 text-center text-xs leading-snug text-slate-300">
                      <p>
                        <span className="text-sm font-semibold text-slate-100">{d.flights}</span> voos ·{" "}
                        <span className="text-sm font-semibold text-slate-100">{d.hours.toFixed(1)}</span>h
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Σ <span className="font-medium text-slate-200">{cum.flights}</span> ·{" "}
                        <span className="font-medium text-slate-200">{cum.hours.toFixed(1)}</span>h
                      </p>
                    </div>
                  </td>
                );
              })}
            </tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Daily Calendar Grid ──────────────────────────────────────────────────────

type DailyCol = {
  key: string;
  label: string;
  colorClass: string;
  items: CalendarFlightItem[];
};

function DailyCalendarGrid({
  items,
  selectedDay,
  weekStart,
  groupBy,
  nightStartHour,
  colorByAircraft,
  borderByInstructor,
  weekData,
  onItemClick,
  onItemDrop,
  onEmptySlotClick,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  hasPrevWeek,
  hasNextWeek,
  backgroundSupply,
  clubMemberByStudentId,
}: {
  items: CalendarFlightItem[];
  selectedDay: number;
  weekStart: string;
  groupBy: "instructor" | "aircraft";
  nightStartHour: number;
  colorByAircraft: Map<string, string>;
  borderByInstructor: Map<string, string>;
  weekData: ScheduleWeekData;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  onSelectDay: (day: number) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  clubMemberByStudentId?: Record<string, boolean>;
}) {
  const rowHeight = useCalendarRowHeight(64, 38);
  const calendarHours = useMemo(() => buildCalendarHours(items), [items]);
  const calendarEndHour = (calendarHours[calendarHours.length - 1] ?? CALENDAR_START_HOUR) + 1;
  const boardHeight = calendarHours.length * rowHeight;
  const draggable = Boolean(onItemDrop);

  const dayItems = useMemo(
    () => items.filter((i) => i.dayOfWeek === selectedDay),
    [items, selectedDay],
  );

  const columns = useMemo<DailyCol[]>(() => {
    if (groupBy === "instructor") {
      const result: DailyCol[] = [];
      for (const instructor of weekData.instructors) {
        const colItems = dayItems.filter((i) => i.instructorId === instructor.userId);
        if (colItems.length === 0) continue;
        result.push({
          key: instructor.userId,
          label: shortName(instructor.label, instructor.label),
          colorClass: borderByInstructor.get(instructor.userId) ?? "border-white/80",
          items: colItems,
        });
      }
      const unassigned = dayItems.filter((i) => !i.instructorId);
      if (unassigned.length > 0) {
        result.push({ key: "__none__", label: "Sem instrutor", colorClass: "border-red-300", items: unassigned });
      }
      return result;
    } else {
      const seen = new Set<string>();
      const result: DailyCol[] = [];
      for (const item of dayItems) {
        const reg = item.aircraftRegistration;
        if (!seen.has(reg)) {
          seen.add(reg);
          result.push({
            key: reg,
            label: reg,
            colorClass: colorByAircraft.get(reg) ?? AIRCRAFT_COLOR_CLASSES[0]!,
            items: dayItems.filter((i) => i.aircraftRegistration === reg),
          });
        }
      }
      return result;
    }
  }, [dayItems, groupBy, weekData.instructors, borderByInstructor, colorByAircraft]);

  const layoutByCol = useMemo(() => {
    const out = new Map<string, Array<{ item: CalendarFlightItem; columnIndex: number; columnCount: number }>>();
    for (const col of columns) {
      const sorted = [...col.items].sort((a, b) => {
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
          let nextCol = 0;
          while (active.some((n) => n.column === nextCol)) nextCol += 1;
          active.push({ end, column: nextCol });
          assigned.set(item.id, nextCol);
          maxColumn = Math.max(maxColumn, nextCol + 1);
        }
        for (const item of group) {
          entries.push({ item, columnIndex: assigned.get(item.id) ?? 0, columnCount: maxColumn });
        }
      }
      out.set(col.key, entries);
    }
    return out;
  }, [columns]);

  const boardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragState, setDragState] = useState<{
    item: CalendarFlightItem;
    preview: CalendarDropTarget;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const dragEndedRef = useRef(false);
  const pointerClickHandledRef = useRef(false);
  const dragThresholdPx = 5;

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number): CalendarDropTarget | null => {
      for (const col of columns) {
        const board = boardRefs.current.get(col.key);
        if (!board) continue;
        const r = board.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
        const startMinute = snapCalendarPointerToStartMinute(clientY, r.top, rowHeight, calendarEndHour);
        const base: CalendarDropTarget = {
          dayOfWeek: selectedDay,
          startHour: startMinute / 60,
          startTime: minutesToScheduleHHMM(startMinute),
          isNight: startMinute >= nightStartHour * 60,
        };
        return groupBy === "instructor"
          ? { ...base, targetInstructorId: col.key === "__none__" ? null : col.key }
          : { ...base, targetAircraftRegistration: col.key };
      }
      return null;
    },
    [calendarEndHour, columns, groupBy, nightStartHour, selectedDay],
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

  function handlePrevDay() {
    const idx = DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]);
    if (idx > 0) {
      onSelectDay(DAY_ORDER[idx - 1]!);
    } else if (hasPrevWeek && onPrevWeek) {
      onPrevWeek();
      onSelectDay(DAY_ORDER[DAY_ORDER.length - 1]!);
    }
  }

  function handleNextDay() {
    const idx = DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]);
    if (idx < DAY_ORDER.length - 1) {
      onSelectDay(DAY_ORDER[idx + 1]!);
    } else if (hasNextWeek && onNextWeek) {
      onNextWeek();
      onSelectDay(DAY_ORDER[0]!);
    }
  }

  const prevDayDisabled = DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]) === 0 && !hasPrevWeek;
  const nextDayDisabled = DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]) === DAY_ORDER.length - 1 && !hasNextWeek;

  return (
    <>
      {/* Day selector */}
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={handlePrevDay}
          disabled={prevDayDisabled}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
          title="Dia anterior"
        >
          ‹
        </button>
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
                className={`flex min-w-0 flex-1 flex-col items-center rounded border px-0.5 py-1.5 text-[10px] transition-colors sm:rounded-lg sm:px-1.5 sm:text-[11px] ${
                  selected
                    ? "border-sky-500 bg-sky-600/20 text-sky-300"
                    : today
                    ? "border-slate-500 bg-slate-700/50 text-slate-200 hover:bg-slate-700"
                    : "border-slate-700 bg-slate-800/30 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <span className="font-semibold">{DAY_LABEL[day]}</span>
                <span className={today ? "text-sky-400" : ""}>{formatShortDate(date)}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleNextDay}
          disabled={nextDayDisabled}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
          title="Próximo dia"
        >
          ›
        </button>
      </div>

      {draggable ? (
        <p className="mb-2 text-[11px] text-slate-600">Arraste um voo para reagendar. Ao soltar, confirme no modal.</p>
      ) : null}
      <p className="mb-2 text-[11px] text-slate-600">
        <span className="text-amber-200">*</span> Voo agendado fora do gerador automático de escala.
      </p>

      {columns.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
          Nenhum voo neste dia.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table
            className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1"
            style={{ minWidth: columns.length > 1 ? `${Math.max(520, columns.length * 180 + 48)}px` : "100%" }}
          >
            <thead>
              <tr>
                <th className="w-12 pb-2" />
                {columns.map((col) => (
                  <th key={col.key} className="pb-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {groupBy === "instructor" ? (
                        <span className={`h-2.5 w-2.5 rounded-full border-2 ${col.colorClass} bg-slate-800 flex-shrink-0`} />
                      ) : (
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded border ${aircraftCardColor(col.colorClass)}`} />
                      )}
                      <span className="text-xs font-semibold text-slate-300">{col.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{col.items.length} voo{col.items.length !== 1 ? "s" : ""}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Main time board */}
              <tr>
                <td className="align-top pr-2">
                  <div className="relative" style={{ height: `${boardHeight}px` }}>
                    {calendarHours.map((hour, idx) => (
                      <div key={hour} className="absolute right-0 text-right text-[11px] font-mono text-slate-600" style={{ top: `${idx * rowHeight}px`, width: "2.8rem" }}>
                        {hour}h
                      </div>
                    ))}
                  </div>
                </td>
                {columns.map((col) => {
                  const entries = (layoutByCol.get(col.key) ?? []);
                  return (
                    <td key={col.key} className="align-top p-0">
                      <div
                        ref={(node) => { if (node) boardRefs.current.set(col.key, node); else boardRefs.current.delete(col.key); }}
                        className="relative overflow-hidden rounded border border-slate-700/60 bg-slate-950/40 sm:rounded-md"
                        style={{ height: `${boardHeight}px` }}
                        onClick={(e) => {
                          if (!onEmptySlotClick || dragState) return;
                          const t = resolveDropTarget(e.clientX, e.clientY);
                          if (t) onEmptySlotClick(t);
                        }}
                      >
                        {nightStartHour < calendarEndHour ? (
                          <div
                            className="pointer-events-none absolute inset-x-0 bg-indigo-950/25"
                            style={{
                              top: `${Math.max(0, nightStartHour - CALENDAR_START_HOUR) * rowHeight}px`,
                              bottom: 0,
                            }}
                          />
                        ) : null}
                        {backgroundSupply
                          ? calendarHours.map((hour, idx) => {
                              const state = backgroundSupply.slotStates[`${selectedDay}-${hour}`];
                              if (!state) return null;
                              return (
                                <div
                                  key={`bg-${col.key}-${hour}`}
                                  className={`absolute left-0 right-0 ${SLOT_BG_TINT[state]}`}
                                  style={{ top: `${idx * rowHeight}px`, height: `${rowHeight}px` }}
                                />
                              );
                            })
                          : null}
                        {calendarHours.map((hour, idx) => (
                          <div key={`${col.key}-${hour}`} className="absolute left-0 right-0 border-b border-slate-700/40" style={{ top: `${idx * rowHeight}px` }} />
                        ))}
                        {entries.map((entry) => {
                          if (dragState?.item.id === entry.item.id) return null;
                          const item = entry.item;
                          const top = calendarTopPx(parseScheduleTimeToMinutes(item.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const color = calendarItemColor(item, colorByAircraft);
                          const instructorBorder = item.instructorId ? borderByInstructor.get(item.instructorId) ?? null : null;
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onPointerDown={(e) => {
                                if (!draggable) return;
                                e.preventDefault();
                                e.stopPropagation();
                                dragEndedRef.current = false;
                                pointerClickHandledRef.current = false;
                                const t = resolveDropTarget(e.clientX, e.clientY) ?? {
                                  dayOfWeek: selectedDay,
                                  startHour: item.startHour,
                                  startTime: item.startTime,
                                  isNight: Boolean(item.isNight),
                                };
                                setDragState({ item, preview: t, startX: e.clientX, startY: e.clientY, hasMoved: false });
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (dragEndedRef.current) { dragEndedRef.current = false; e.preventDefault(); return; }
                                if (pointerClickHandledRef.current) { pointerClickHandledRef.current = false; e.preventDefault(); return; }
                                onItemClick(item);
                              }}
                              className={`absolute ${eventStyleClasses(color, instructorBorder, !item.instructorId, draggable)}`}
                              style={{
                                top: `${top}px`,
                                height: `${height - 4}px`,
                                left: `calc(${leftPercent}% + 4px)`,
                                width: `calc(${widthPercent}% - 8px)`,
                              }}
                            >
                              <p className="flex min-w-0 items-center gap-1 font-semibold text-white">
                                <span className="truncate">{calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}</span>
                                {clubMemberByStudentId?.[item.studentId] ? <FlightReviewClubBadge /> : null}
                              </p>
                              <p className="truncate opacity-90">{item.startTime}–{item.endTime}</p>
                              {groupBy === "aircraft" ? (
                                <p className="truncate opacity-80">{shortName(item.instructorLabel) || "Sem instrutor"}</p>
                              ) : (
                                <p className="truncate opacity-80">{item.aircraftRegistration}</p>
                              )}
                              <p className="truncate opacity-80">Peso: {item.totalWeightLabel}</p>
                            </div>
                          );
                        })}
                        {/* Drag preview */}
                        {dragState && (() => {
                          const item = dragState.item;
                          const entry = entries.find((e) => e.item.id === item.id) ?? { item, columnIndex: 0, columnCount: 1 };
                          const top = calendarTopPx(parseScheduleTimeToMinutes(dragState.preview.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const color = calendarItemColor(item, colorByAircraft);
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          const previewCol = groupBy === "instructor"
                            ? (dragState.preview.targetInstructorId !== undefined
                                ? (dragState.preview.targetInstructorId ?? "__none__")
                                : col.key)
                            : (dragState.preview.targetAircraftRegistration ?? col.key);
                          if (previewCol !== col.key) return null;
                          return (
                            <div
                              key="preview"
                              className={`pointer-events-none absolute overflow-hidden rounded border-2 border-dashed border-white/70 bg-white/10 px-1.5 py-1 text-[10px] text-white shadow-lg ring-2 ring-violet-400/50 ${color}`}
                              style={{
                                top: `${top}px`,
                                height: `${height - 4}px`,
                                left: `calc(${leftPercent}% + 4px)`,
                                width: `calc(${widthPercent}% - 8px)`,
                              }}
                            >
                              <p className="truncate font-semibold">{shortName(item.studentLabel, item.studentLabel)}</p>
                              <p className="truncate opacity-80">Solte para confirmar</p>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  );
                })}
              </tr>
              {/* Totals */}
              <tr>
                <td className="pr-2 pt-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total</td>
                {columns.map((col) => {
                  const hours = col.items.reduce((s, i) => s + i.durationHours, 0);
                  return (
                    <td key={col.key} className="p-0 pt-2">
                      <div className="rounded-md border border-slate-700/50 bg-slate-800/40 px-2 py-2 text-center text-xs leading-snug text-slate-300">
                        <p>
                          <span className="text-sm font-semibold text-slate-100">{col.items.length}</span> voos ·{" "}
                          <span className="text-sm font-semibold text-slate-100">{hours.toFixed(1)}</span>h
                        </p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type ScheduleFlightsTabProps = {
  /** Semana a exibir após publicar escala no gerador. */
  focusWeekStart?: string | null;
  onFocusWeekConsumed?: () => void;
};

export function ScheduleFlightsTab({ focusWeekStart = null, onFocusWeekConsumed }: ScheduleFlightsTabProps = {}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { canAction } = usePermissions();
  const canCreateFlight = canAction("flight.create");
  const canEditFlight = canAction("flight.edit");
  const canDeleteFlight = canAction("flight.delete");
  const [weekOptions, setWeekOptions] = useState<ScheduleWeekOption[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [weekData, setWeekData] = useState<ScheduleWeekData | null>(null);
  const [activeAircrafts, setActiveAircrafts] = useState<Aircraft[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingWeekData, setLoadingWeekData] = useState(false);
  const [flights, setFlights] = useState<ExistingScheduledFlight[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<string[]>([]);
  const [visibleInstructors, setVisibleInstructors] = useState<string[]>([]);
  const [agendaView, setAgendaView] = useState<"weekly" | "three-day" | "daily">("weekly");
  const [dailyGroupBy, setDailyGroupBy] = useState<"instructor" | "aircraft">("instructor");
  const [hideCancelledFlights, setHideCancelledFlights] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());
  const [error, setError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<FlightFormDraft | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formSaving, setFormSaving] = useState(false);
  const [formConflicts, setFormConflicts] = useState<DetectedFlightConflict[]>([]);
  const [forceSaveWithConflict, setForceSaveWithConflict] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [clubMemberByStudentId, setClubMemberByStudentId] = useState<Record<string, boolean>>({});
  const [scheduleRules, setScheduleRules] = useState<FlightScheduleRules>(DEFAULT_FLIGHT_SCHEDULE_RULES);
  const [sagaSyncLogs, setSagaSyncLogs] = useState<SagaScheduleSyncLogItem[]>([]);
  const [formStudentCredits, setFormStudentCredits] = useState<StudentCreditModelSummary[] | null>(null);
  const [formStudentCreditsLoading, setFormStudentCreditsLoading] = useState(false);
  const weekOptionsRef = useRef<ScheduleWeekOption[]>([]);
  weekOptionsRef.current = weekOptions;
  const loadWeekRequestRef = useRef(0);
  const lastErrorToastRef = useRef<string | null>(null);
  const prevActorUserIdRef = useRef<string | undefined>(undefined);
  const weekDataRef = useRef<ScheduleWeekData | null>(null);
  weekDataRef.current = weekData;

  const actorUserId = user?.id;
  const actorRole = user?.role;

  const minGapMinutes = 30;
  const hourOptions = useMemo(() => buildScheduleHourOptions(scheduleRules), [scheduleRules]);
  const threeDayStartIndex = Math.min(
    Math.max(DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]), 0),
    DAY_ORDER.length - 3,
  );
  const threeDayWindow = DAY_ORDER.slice(threeDayStartIndex, threeDayStartIndex + 3);

  useEffect(() => {
    if (!error || error === lastErrorToastRef.current) return;
    lastErrorToastRef.current = error;
    showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const runSagaScheduleSync = useCallback(
    async (flightId: string, mode: SagaScheduleSyncMode, options: { allowCreate?: boolean; sagaScheduleId?: string | null } = {}) => {
      const result = await syncSagaScheduleEvent(flightId, mode, options).catch((error) => ({
        ok: false,
        mode,
        status: "failed" as const,
        message: error instanceof Error ? error.message : "Falha ao chamar sincronizacao SAGA.",
        flightId,
        sagaScheduleId: null,
        httpStatus: null,
        endpoint: null,
        requestPayload: null,
        response: null,
        logs: [],
      }));
      const normalizedResult = {
        ...result,
        status: normalizeSagaSyncStatus(result.status),
        message: result.message || "Sem mensagem retornada pela sincronizacao SAGA.",
      };
      const item: SagaScheduleSyncLogItem = {
        ...normalizedResult,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
      };
      setSagaSyncLogs((current) => [item, ...current].slice(0, 20));
      if (normalizedResult.sagaScheduleId) {
        const syncedAt = new Date().toISOString();
        setFlights((current) =>
          current.map((row) =>
            row.id === flightId
              ? {
                  ...row,
                  sagaScheduleId: normalizedResult.status === "cancelled" ? null : normalizedResult.sagaScheduleId,
                  sagaScheduleSyncStatus: normalizedResult.status,
                  sagaScheduleSyncedAt: syncedAt,
                }
              : row,
          ),
        );
      }
      showToast({
        variant: sagaSyncVariant(normalizedResult.status),
        title: "SAGA",
        message: normalizedResult.message,
        durationMs: normalizedResult.status === "failed" ? 8000 : 4500,
      });
      return normalizedResult;
    },
    [showToast],
  );

  const loadWeek = useCallback(
    async (weekStart: string, weekOverride?: ScheduleWeekOption, options?: { showSkeleton?: boolean }) => {
      if (!actorUserId || !actorRole || !weekStart) return;

      const requestId = loadWeekRequestRef.current + 1;
      loadWeekRequestRef.current = requestId;
      const showSkeleton = options?.showSkeleton ?? weekDataRef.current === null;

      if (showSkeleton) setLoadingWeekData(true);
      setError(null);

      try {
        const weekOption = weekOverride ?? weekOptionsRef.current.find((row) => row.weekStart === weekStart);
        const [data, rules, aircraftRows] = await Promise.all([
          getScheduleWeekData({
            weekStart,
            actorUserId,
            actorRole,
            scope: "flights-only",
            week: weekOption,
          }),
          getSchoolRules().catch(() => ({ schedule: DEFAULT_FLIGHT_SCHEDULE_RULES })),
          listAircrafts(schoolId).catch(() => []),
        ]);
        if (loadWeekRequestRef.current !== requestId) return;

        setScheduleRules(rules.schedule);
        setWeekData(data);
        const rows = [...data.existingGeneratedFlights].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.startTime.localeCompare(b.startTime);
        });
        setFlights(rows);
        setActiveAircrafts(aircraftRows.filter((aircraft) => aircraft.active !== false));
        setVisibleAircraft(Array.from(new Set([
          ...data.supplies.map((s) => s.aircraftRegistration),
          ...aircraftRows.filter((aircraft) => aircraft.active !== false).map((aircraft) => aircraft.registration),
          ...rows.map((row) => row.aircraftRegistration ?? "").filter(Boolean),
        ])));
        setVisibleInstructors(["__none__", ...data.instructors.map((s) => s.userId)]);
      } catch (e) {
        if (loadWeekRequestRef.current !== requestId) return;
        setError((e as Error).message);
        setWeekData(null);
        setActiveAircrafts([]);
        setFlights([]);
      } finally {
        if (loadWeekRequestRef.current === requestId) setLoadingWeekData(false);
      }
    },
    [actorRole, actorUserId],
  );

  const loadWeekRef = useRef(loadWeek);
  loadWeekRef.current = loadWeek;

  useEffect(() => {
    if (!actorUserId) {
      prevActorUserIdRef.current = undefined;
      return;
    }
    if (prevActorUserIdRef.current === actorUserId) return;
    prevActorUserIdRef.current = actorUserId;
    loadWeekRequestRef.current += 1;
    setWeekData(null);
    setFlights([]);
    setLoadingWeekData(false);
    lastErrorToastRef.current = null;
  }, [actorUserId]);

  useEffect(() => {
    if (!actorUserId) return;

    let cancelled = false;
    const baseWeeks = generateScheduleWeekPickerOptions();
    const defaultWeek = pickDefaultScheduleWeek(baseWeeks);
    setWeekOptions(baseWeeks);
    setSelectedWeekStart(defaultWeek?.weekStart ?? "");
    setLoadingWeeks(false);
    if (defaultWeek) {
      void loadWeekRef.current(defaultWeek.weekStart, defaultWeek, { showSkeleton: true });
    }

    void getScheduleWeekPickerOptions()
      .then((weeks) => {
        if (cancelled) return;
        setWeekOptions(weeks);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [actorUserId]);

  useEffect(() => {
    if (!focusWeekStart || !actorUserId) return;

    let cancelled = false;
    void (async () => {
      const weeks = await getScheduleWeekPickerOptions().catch(() => weekOptionsRef.current);
      if (cancelled) return;

      const mergedWeeks = weeks.length > 0 ? weeks : generateScheduleWeekPickerOptions();
      setWeekOptions(mergedWeeks);

      const weekOption = mergedWeeks.find((row) => row.weekStart === focusWeekStart);

      setSelectedWeekStart(focusWeekStart);
      await loadWeekRef.current(focusWeekStart, weekOption ?? undefined, { showSkeleton: true });
      onFocusWeekConsumed?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [actorUserId, focusWeekStart, onFocusWeekConsumed]);

  const studentLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of weekData?.students ?? []) map.set(student.userId, student.label);
    return map;
  }, [weekData]);

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorIdentity>();
    for (const instructor of weekData?.instructors ?? []) map.set(instructor.userId, instructor);
    return map;
  }, [weekData]);

  const aircraftOptions = useMemo(() => {
    const byRegistration = new Map<string, { registration: string; imageUrl: string | null; hasSupply: boolean }>();
    for (const supply of weekData?.supplies ?? []) {
      byRegistration.set(supply.aircraftRegistration, {
        registration: supply.aircraftRegistration,
        imageUrl: supply.aircraftImageUrl ?? null,
        hasSupply: true,
      });
    }
    for (const aircraft of activeAircrafts) {
      const current = byRegistration.get(aircraft.registration);
      byRegistration.set(aircraft.registration, {
        registration: aircraft.registration,
        imageUrl: current?.imageUrl ?? aircraft.image_url ?? null,
        hasSupply: Boolean(current?.hasSupply),
      });
    }
    for (const row of flights) {
      const registration = row.aircraftRegistration ?? "";
      if (registration && !byRegistration.has(registration)) {
        byRegistration.set(registration, { registration, imageUrl: null, hasSupply: false });
      }
    }
    return Array.from(byRegistration.values()).sort((a, b) => a.registration.localeCompare(b.registration, "pt-BR"));
  }, [activeAircrafts, flights, weekData]);

  const selectedAircraftHasSupply = useMemo(
    () => !formDraft?.aircraftRegistration || Boolean(weekData?.supplies.some((supply) => supply.aircraftRegistration === formDraft.aircraftRegistration)),
    [formDraft?.aircraftRegistration, weekData],
  );

  const conflictsByFlightId = useMemo(() => {
    if (!weekData) return new Map<string, DetectedFlightConflict[]>();
    return buildConflictsByFlightId({
      flights,
      supplies: weekData.supplies,
      minGapMinutes,
      studentLabelMap,
    });
  }, [flights, minGapMinutes, studentLabelMap, weekData]);

  const colorByAircraft = useMemo(() => {
    const regs = aircraftOptions.map((aircraft) => aircraft.registration);
    const map = new Map<string, string>();
    regs.forEach((reg, index) => map.set(reg, AIRCRAFT_COLOR_CLASSES[index % AIRCRAFT_COLOR_CLASSES.length]!));
    return map;
  }, [aircraftOptions]);

  const borderByInstructor = useMemo(() => {
    const map = new Map<string, string>();
    (weekData?.instructors ?? []).forEach((instructor, index) =>
      map.set(instructor.userId, INSTRUCTOR_BORDER_CLASSES[index % INSTRUCTOR_BORDER_CLASSES.length]!),
    );
    return map;
  }, [weekData]);

  const totalWeightByFlightId = useMemo(() => {
    const map = new Map<string, string>();
    if (!weekData) return map;
    for (const row of flights) {
      const student = weekData.students.find((s) => s.userId === row.studentId);
      const instructor = row.instructorId ? instructorById.get(row.instructorId) : null;
      const total = (student?.weightKg ?? 0) + (instructor?.weightKg ?? 0);
      map.set(row.id, total > 0 ? `${total}kg` : "—");
    }
    return map;
  }, [flights, instructorById, weekData]);

  useEffect(() => {
    let cancelled = false;
    const studentIds = Array.from(new Set((weekData?.students ?? []).map((student) => student.userId).filter(Boolean)));
    if (studentIds.length === 0) {
      setClubMemberByStudentId({});
      return;
    }
    void Promise.all(studentIds.map((studentId) => listStudentTrainingTracks(studentId))).then((results) => {
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      studentIds.forEach((studentId, index) => {
        map[studentId] = hasActiveFlightReviewClubTrack(results[index]?.data);
      });
      setClubMemberByStudentId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [weekData?.students]);

  useEffect(() => {
    const studentId = formDraft?.studentId;
    if (!formDraft || !studentId || !user?.id || !user?.role) {
      setFormStudentCredits(null);
      setFormStudentCreditsLoading(false);
      return;
    }
    let cancelled = false;
    setFormStudentCredits(null);
    setFormStudentCreditsLoading(true);
    getStudentCreditStatement({ viewer: { userId: user.id, role: user.role }, studentUserId: studentId })
      .then((stmt) => { if (!cancelled) { setFormStudentCredits(stmt.summaries); setFormStudentCreditsLoading(false); } })
      .catch(() => { if (!cancelled) { setFormStudentCredits([]); setFormStudentCreditsLoading(false); } });
    return () => { cancelled = true; };
  // formDraft?.demandId changes each time the modal opens (new demandId per session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDraft?.demandId, formDraft?.studentId, user?.id, user?.role]);

  const calendarItems = useMemo<CalendarFlightItem[]>(
    () =>
      flights
        .filter(
          (row) =>
            (!hideCancelledFlights || row.flightStatus !== "Cancelado") &&
            visibleAircraft.includes(row.aircraftRegistration ?? "") &&
            (row.instructorId ? visibleInstructors.includes(row.instructorId) : visibleInstructors.includes("__none__")),
        )
        .map((row) => {
          const dayOfWeek = new Date(`${row.date}T12:00:00`).getDay();
          const startHour = parseStartHour(row.startTime);
          return {
            id: row.id,
            studentId: row.studentId,
            studentLabel: studentLabelMap.get(row.studentId) ?? row.studentId,
            instructorId: row.instructorId,
            instructorLabel:
              row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null),
            totalWeightLabel: totalWeightByFlightId.get(row.id) ?? "—",
            aircraftRegistration: row.aircraftRegistration ?? "Aeronave",
            dayOfWeek,
            startHour,
            durationHours: row.durationHours,
            flightStatus: row.flightStatus,
            startTime: row.startTime,
            endTime: hoursToHHMM(startHour + row.durationHours),
            isNight: row.isNight ?? false,
            isOutsideGenerator: row.isOutsideGenerator ?? false,
          };
        }),
    [flights, hideCancelledFlights, instructorById, studentLabelMap, totalWeightByFlightId, visibleAircraft, visibleInstructors],
  );

  const cancelledFlightCount = useMemo(
    () => flights.filter((row) => row.flightStatus === "Cancelado").length,
    [flights],
  );

  const selectedSupplyForBackground = useMemo(() => {
    if (!weekData || visibleAircraft.length !== 1) return null;
    const reg = visibleAircraft[0];
    return weekData.supplies.find((supply) => supply.aircraftRegistration === reg) ?? null;
  }, [visibleAircraft, weekData]);

  const aircraftSummary = useMemo(() => {
    if (!weekData) return [];
    return aircraftOptions.map((aircraft) => {
      const rows = flights.filter((row) => row.aircraftRegistration === aircraft.registration);
      const hours = rows.reduce((acc, row) => acc + row.durationHours, 0);
      const students = new Set(rows.map((row) => row.studentId)).size;
      return {
        registration: aircraft.registration,
        imageUrl: aircraft.imageUrl,
        flights: rows.length,
        hours: Number(hours.toFixed(1)),
        students,
      };
    });
  }, [aircraftOptions, flights, weekData]);

  const totalSummary = useMemo(() => {
    const hours = flights.reduce((acc, row) => acc + row.durationHours, 0);
    return {
      flights: flights.length,
      hours: Number(hours.toFixed(1)),
      students: new Set(flights.map((row) => row.studentId)).size,
    };
  }, [flights]);

  const instructorSummary = useMemo(() => {
    if (!weekData) return [];
    return weekData.instructors.map((instructor) => {
      const rows = flights.filter((row) => row.instructorId === instructor.userId);
      const hours = rows.reduce((acc, row) => acc + row.durationHours, 0);
      return { instructor, flights: rows.length, hours: Number(hours.toFixed(1)) };
    });
  }, [flights, weekData]);

  const unassignedInstructorCount = useMemo(() => flights.filter((row) => !row.instructorId).length, [flights]);

  const servedStudents = useMemo(() => {
    if (!weekData) return [];
    const activeStudentIds = new Set(weekData.students.map((student) => student.userId));
    const map = new Map<string, { id: string; label: string; flights: number; hours: number }>();
    for (const student of weekData.students) {
      map.set(student.userId, { id: student.userId, label: student.label, flights: 0, hours: 0 });
    }
    for (const flight of flights) {
      if (!activeStudentIds.has(flight.studentId)) continue;
      const current = map.get(flight.studentId);
      if (!current) continue;
      current.flights += 1;
      current.hours += flight.durationHours;
      map.set(flight.studentId, current);
    }
    return [...map.values()].filter((row) => row.flights > 0).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [flights, studentLabelMap, weekData]);

  const notServedStudents = useMemo(() => {
    if (!weekData) return [];
    const served = new Set(servedStudents.map((row) => row.id));
    return weekData.students.filter((row) => !served.has(row.userId)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [servedStudents, weekData]);

  const selectedStudentSchedule = useMemo(() => {
    if (!selectedStudentId) return null;
    const student = weekData?.students.find((row) => row.userId === selectedStudentId) ?? null;
    const studentFlights = flights
      .filter((row) => row.studentId === selectedStudentId)
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));
    if (!student && studentFlights.length === 0) return null;
    return {
      student: {
        userId: selectedStudentId,
        label: student?.label ?? studentLabelMap.get(selectedStudentId) ?? selectedStudentId,
        email: student?.email ?? null,
        anacCode: student?.anacCode ?? null,
        weightKg: student?.weightKg ?? null,
        heightCm: student?.heightCm ?? null,
      },
      flights: studentFlights,
    };
  }, [flights, selectedStudentId, studentLabelMap, weekData]);

  function openCreateModal() {
    if (!weekData) return;
    const firstAircraft = aircraftOptions[0];
    if (!firstAircraft) {
      setError("Cadastre uma aeronave ativa para criar voos.");
      return;
    }
    const firstStudent = weekData.students[0];
    const firstInstructor = weekData.instructors[0] ?? null;
    setFormMode("create");
    setFormDraft({
      demandId: `manual-${crypto.randomUUID()}`,
      studentId: firstStudent?.userId ?? "",
      studentLabel: firstStudent?.label ?? "",
      ...resolveInstructorDraft(weekData.instructors, firstInstructor?.userId ?? null),
      aircraftRegistration: firstAircraft.registration,
      dayOfWeek: 1,
      startTime: minutesToScheduleHHMM((SLOT_HOURS[0] ?? 6) * 60),
      startHour: SLOT_HOURS[0] ?? 6,
      durationHours: 1,
      flightStatus: "Confirmado",
      isNight: false,
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function openEditModal(row: ExistingScheduledFlight) {
    if (!canEditFlight) return;
    const full = await getSavedFlight(row.id);
    const decoded = full.data ? decodeFlightRecord(full.data.csv_text).meta : null;
    const existingCancellation = (decoded as Record<string, unknown> | null)?.cancellation as { reasonCode?: string; reasonText?: string } | undefined;
    setFormMode("edit");
    setFormDraft({
      id: row.id,
      demandId: row.demandId,
      sourceFilename: row.sourceFilename,
      studentId: row.studentId,
      studentLabel: decoded?.header.studentLabel || studentLabelMap.get(row.studentId) || row.studentId,
      instructorId: row.instructorId,
      instructorLabel:
        decoded?.header.instructorName ||
        row.instructorLabel ||
        (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null),
      instructorAnac:
        decoded?.header.instructorAnac ||
        row.instructorAnac ||
        (row.instructorId ? instructorById.get(row.instructorId)?.anacCode ?? null : null),
      aircraftRegistration: row.aircraftRegistration ?? "",
      dayOfWeek: new Date(`${row.date}T12:00:00`).getDay(),
      startTime: row.startTime,
      startHour:
        (decoded?.header.isNight ?? row.isNight)
          ? scheduleRules.nightFlightStartHour
          : parseStartHour(row.startTime),
      durationHours: row.durationHours,
      isNight: decoded?.header.isNight ?? row.isNight ?? false,
      sagaScheduleId: row.sagaScheduleId ?? null,
      flightStatus: full.data?.flight_status ?? "Confirmado",
      cancellationReason: existingCancellation?.reasonCode ?? "",
      cancellationReasonText: existingCancellation?.reasonText ?? "",
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function handleSaveForm() {
    if (!user || !weekData || !formDraft) return;
    setError(null);
    const conflicts = detectFlightConflicts({
      draft: {
        ...formDraft,
        studentLabel: formDraft.studentLabel || formDraft.studentId,
        flightStatus: formDraft.flightStatus ?? "Confirmado",
      },
      supplies: weekData.supplies,
      flights,
      minGapMinutes,
    });
    if (conflicts.length > 0 && !forceSaveWithConflict) {
      setFormConflicts(conflicts);
      return;
    }

    setFormSaving(true);
    try {
      const sourcePrefix =
        formDraft.sourceFilename?.startsWith(MANUAL_SOURCE_PREFIX) || formDraft.demandId.startsWith("manual-")
          ? MANUAL_SOURCE_PREFIX
          : AUTO_SOURCE_PREFIX;
      const sourceFilename = `${sourcePrefix}${weekData.week.weekStart}.csv`;
      const normalizedLabel = formDraft.studentLabel.trim() || formDraft.studentId;
      const instructor = formDraft.instructorId ? instructorById.get(formDraft.instructorId) ?? null : null;
      const baseMeta = buildAutoMeta({ ...formDraft, studentLabel: normalizedLabel }, weekData.week.weekStart, instructor);
      const isCancelledFlight = formDraft.flightStatus === "Cancelado";
      const finalMeta: FlightRecordMeta = isCancelledFlight && formDraft.cancellationReason
        ? { ...baseMeta, cancellation: { reasonCode: formDraft.cancellationReason, reasonText: formDraft.cancellationReasonText ?? "", updatedAt: new Date().toISOString() } } as FlightRecordMeta
        : baseMeta;
      const csvText = encodeFlightRecord({ meta: finalMeta, telemetryCsv: "" });
      const payload = {
        actorUserId: user.id,
        actorRole: user.role,
        studentUserId: formDraft.studentId,
        instructorUserId: formDraft.instructorId,
        source_filename: sourceFilename,
        csv_text: csvText,
        aircraft_ident: formDraft.aircraftRegistration,
        duration_sec: Math.round(formDraft.durationHours * 3600),
        flightStatus: formDraft.flightStatus ?? "Confirmado",
      };

      if (formMode === "edit" && formDraft.id) {
        const nextDate = weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek);
        const nextStartTime = formDraft.startTime;
        const existingStatus = flights.find((row) => row.id === formDraft.id)?.flightStatus;
        if (formDraft.flightStatus === "Cancelado" && existingStatus !== "Cancelado") {
          await cancelScheduleFlight(formDraft.id, {
            waivePenalty: formDraft.waiveCancellationPenalty,
            reason: [formDraft.cancellationReason, formDraft.cancellationReasonText].filter(Boolean).join(": "),
          });
        } else {
          if (existingStatus === "Pendente" && formDraft.flightStatus === "Confirmado") {
            await confirmScheduleFlight(formDraft.id);
          }
          const result = await updateFlight(formDraft.id, payload);
          if (result.error) throw result.error;
        }
        void syncFlightCalendarEvent(formDraft.id, "upsert");
        void runSagaScheduleSync(formDraft.id, "upsert", { sagaScheduleId: formDraft.sagaScheduleId ?? null });
        void dispatchNotificationEvent({
          eventType: "flight.updated",
          flightId: formDraft.id,
          dedupeKey: `flight.updated:${formDraft.id}:${Date.now()}`,
          recipientUserIds: [formDraft.studentId],
          actorUserId: user.id,
          data: {
            aircraft: formDraft.aircraftRegistration,
            flightDate: nextDate,
            startTime: nextStartTime,
            studentUserId: formDraft.studentId,
          },
        });
        showToast({ variant: "success", message: "Voo atualizado com sucesso." });
      } else {
        const result = await insertFlight(payload);
        if (result.error) throw result.error;
        if (result.id) {
          void syncFlightCalendarEvent(result.id, "upsert");
          void runSagaScheduleSync(result.id, "upsert", { allowCreate: true });
          void dispatchNotificationEvent({
            eventType: "flight.scheduled",
            flightId: result.id,
            dedupeKey: `flight.scheduled:${result.id}:${Date.now()}`,
            recipientUserIds: [formDraft.studentId],
            actorUserId: user.id,
            data: {
              aircraft: formDraft.aircraftRegistration,
              flightDate: weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek),
              startTime: formDraft.startTime,
              studentUserId: formDraft.studentId,
            },
          });
        }
        showToast({ variant: "success", message: "Voo criado com sucesso." });
      }
      setFormDraft(null);
      setFormConflicts([]);
      setForceSaveWithConflict(false);
      await loadWeek(weekData.week.weekStart, undefined, { showSkeleton: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteFlight(row: ExistingScheduledFlight) {
    if (!window.confirm("Excluir este voo?")) return;
    setError(null);
    try {
      await runSagaScheduleSync(row.id, "cancel", { sagaScheduleId: row.sagaScheduleId ?? null });
      await syncFlightCalendarEvent(row.id, "cancel");
      const result = await deleteSavedFlight(row.id);
      if (result.error) throw result.error;
      void dispatchNotificationEvent({
        eventType: "flight.cancelled",
        dedupeKey: `flight.cancelled:${row.id}:${Date.now()}`,
        recipientUserIds: [row.studentId, row.instructorId].filter((id): id is string => Boolean(id)),
        actorUserId: user?.id ?? null,
        data: {
          aircraft: row.aircraftRegistration,
          flightDate: row.date,
          startTime: row.startTime,
        },
      });
      showToast({ variant: "success", message: "Voo excluído com sucesso." });
      if (selectedWeekStart) await loadWeek(selectedWeekStart, undefined, { showSkeleton: false });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Escala</h2>
        <p className="text-xs text-slate-500">Mesma dinâmica da Escala Automática, focada apenas em voos já marcados.</p>
      </div>

      <SagaScheduleSyncLogPanel logs={sagaSyncLogs} onClear={() => setSagaSyncLogs([])} />

      <section className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Semana</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={loadingWeeks || weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) <= 0}
              onClick={() => {
                const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                const prev = weekOptions[idx - 1];
                if (!prev) return;
                setSelectedWeekStart(prev.weekStart);
                loadWeekRequestRef.current += 1;
                setWeekData(null);
                setFlights([]);
                void loadWeek(prev.weekStart, prev, { showSkeleton: true });
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              title="Semana anterior"
            >
              ‹
            </button>
            <select
              value={selectedWeekStart}
              disabled={loadingWeeks}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedWeekStart(value);
                const week = weekOptions.find((row) => row.weekStart === value);
                loadWeekRequestRef.current += 1;
                setWeekData(null);
                setFlights([]);
                void loadWeek(value, week, { showSkeleton: true });
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {weekOptions.length === 0 ? <option value="">Nenhuma semana encontrada</option> : null}
              {weekOptions.map((week) => {
                const isCurrentWeek = week.weekStart === getCurrentWeekStart();
                const suffix = week.isClosed ? " (Fechada)" : "";
                return (
                  <option key={week.weekStart} value={week.weekStart}>
                    {isCurrentWeek ? `▶ Semana atual — ${week.label}${suffix}` : `${week.label}${suffix}`}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              disabled={loadingWeeks || weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) >= weekOptions.length - 1}
              onClick={() => {
                const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                const next = weekOptions[idx + 1];
                if (!next) return;
                setSelectedWeekStart(next.weekStart);
                loadWeekRequestRef.current += 1;
                setWeekData(null);
                setFlights([]);
                void loadWeek(next.weekStart, next, { showSkeleton: true });
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              title="Próxima semana"
            >
              ›
            </button>
          </div>
        </div>
        {canCreateFlight ? (
        <div className="flex items-end md:col-span-2">
          <button
            type="button"
            onClick={() => openCreateModal()}
            disabled={!weekData}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            Novo voo
          </button>
        </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {loadingWeekData && !weekData ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
            <div className="grid grid-cols-8 gap-px bg-slate-800/40 p-2">
              {Array.from({ length: 8 }).map((_, d) => (
                <div key={d} className="space-y-1">
                  <Skeleton className="h-3 w-8 mx-auto" />
                  {Array.from({ length: 6 }).map((_, h) => (
                    <Skeleton key={h} className="h-9 w-full rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {weekData ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {aircraftSummary.map((row) => (
            <article key={row.registration} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
              <div className="mb-2 h-20 w-full overflow-hidden rounded-md bg-slate-800">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.registration} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">Sem foto</div>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-100">{row.registration}</p>
              <p className="mt-1 text-xs text-slate-400">{row.hours.toFixed(1)}h na semana</p>
              <p className="text-xs text-slate-500">{row.flights} voos</p>
              <p className="text-xs text-slate-500">{row.students} alunos</p>
            </article>
          ))}
          <article className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <div className="mb-2 h-20 w-full rounded-md bg-violet-500/20" />
            <p className="text-sm font-semibold text-violet-400">Total</p>
            <p className="mt-1 text-xs text-violet-400">{totalSummary.hours.toFixed(1)}h na semana</p>
            <p className="text-xs text-violet-400">{totalSummary.flights} voos</p>
            <p className="text-xs text-violet-400">{totalSummary.students} alunos</p>
          </article>
        </section>
      ) : null}

      {weekData ? (
        <>
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo por instrutor</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {instructorSummary.map((row) => (
                <article key={row.instructor.userId} className={`rounded-xl border bg-slate-800/30 p-3 ${borderByInstructor.get(row.instructor.userId) ?? "border-slate-700"}`}>
                  <p className="truncate text-sm font-semibold text-slate-100">{shortName(row.instructor.label, row.instructor.label)}</p>
                  <p className="mt-1 text-xs text-slate-400">{row.hours.toFixed(1)}h previstas</p>
                  <p className="text-xs text-slate-500">{row.flights} voos</p>
                </article>
              ))}
              <article className="rounded-xl border border-red-300 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-400">Sem instrutor</p>
                <p className="mt-1 text-xs text-amber-400">{unassignedInstructorCount} voos</p>
              </article>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Filtros</p>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Aeronaves</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setVisibleAircraft(aircraftOptions.map((a) => a.registration))} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Todos</button>
                    <button type="button" onClick={() => setVisibleAircraft([])} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Nenhum</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aircraftOptions.map((aircraft) => {
                    const checked = visibleAircraft.includes(aircraft.registration);
                    const color = colorByAircraft.get(aircraft.registration) ?? AIRCRAFT_COLOR_CLASSES[0]!;
                    return (
                      <label key={aircraft.registration} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setVisibleAircraft((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, aircraft.registration])]
                                : prev.filter((reg) => reg !== aircraft.registration),
                            );
                          }}
                        />
                        <span className={`h-3 w-3 rounded border ${color}`} />
                        {aircraft.registration}
                        {!aircraft.hasSupply ? <span className="text-[10px] text-amber-300">sem disponibilidade</span> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Instrutores</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setVisibleInstructors(["__none__", ...weekData.instructors.map((i) => i.userId)])} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Todos</button>
                    <button type="button" onClick={() => setVisibleInstructors([])} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Nenhum</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={visibleInstructors.includes("__none__")}
                      onChange={(e) =>
                        setVisibleInstructors((prev) =>
                          e.target.checked ? [...new Set([...prev, "__none__"])] : prev.filter((id) => id !== "__none__"),
                        )
                      }
                    />
                    <span className="h-3 w-3 rounded border-2 border-red-300 bg-slate-800" />
                    Sem instrutor
                  </label>
                  {weekData.instructors.map((instructor) => {
                    const checked = visibleInstructors.includes(instructor.userId);
                    const border = borderByInstructor.get(instructor.userId) ?? "border-white/80";
                    return (
                      <label key={instructor.userId} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setVisibleInstructors((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, instructor.userId])]
                                : prev.filter((id) => id !== instructor.userId),
                            )
                          }
                        />
                        <span className={`h-3 w-3 rounded border-2 ${border} bg-slate-800`} />
                        {shortName(instructor.label, instructor.label)}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {unassignedInstructorCount > 0 ? (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              {unassignedInstructorCount} voo(s) nesta escala estão sem instrutor.
            </section>
          ) : null}

          {/* Calendar grid */}
          <div className="space-y-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-slate-700 sm:flex-none">
                <button
                  type="button"
                  onClick={() => setAgendaView("weekly")}
                  className={`flex-1 border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:flex-none sm:py-1.5 ${agendaView === "weekly" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaView("three-day")}
                  className={`flex-1 border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:flex-none sm:py-1.5 ${agendaView === "three-day" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  3 dias
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaView("daily")}
                  className={`flex-1 px-3 py-2 text-xs transition-colors sm:flex-none sm:py-1.5 ${agendaView === "daily" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  Diária
                </button>
              </div>
              {agendaView === "daily" && (
                <div className="flex w-full overflow-hidden rounded-lg border border-slate-700 sm:ml-auto sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setDailyGroupBy("instructor")}
                    className={`flex-1 border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:flex-none sm:py-1.5 ${dailyGroupBy === "instructor" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Por instrutor
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyGroupBy("aircraft")}
                    className={`flex-1 px-3 py-2 text-xs transition-colors sm:flex-none sm:py-1.5 ${dailyGroupBy === "aircraft" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Por avião
                  </button>
                </div>
              )}
              <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 sm:ml-auto sm:w-auto">
                <span>
                  Ocultar cancelados
                  {cancelledFlightCount > 0 ? <span className="ml-1 text-slate-500">({cancelledFlightCount})</span> : null}
                </span>
                <input
                  type="checkbox"
                  checked={hideCancelledFlights}
                  onChange={(event) => setHideCancelledFlights(event.target.checked)}
                  className="h-4 w-4 accent-sky-500"
                />
              </label>
            </div>

            {agendaView !== "daily" ? (
              <CalendarGrid
                items={calendarItems}
                days={agendaView === "three-day" ? threeDayWindow : DAY_ORDER}
                title={agendaView === "three-day" ? "Agenda de 3 dias" : "Agenda semanal"}
                colorByAircraft={colorByAircraft}
                borderByInstructor={borderByInstructor}
                backgroundSupply={selectedSupplyForBackground}
                clubMemberByStudentId={clubMemberByStudentId}
                weekStart={weekData.week.weekStart}
                nightStartHour={scheduleRules.nightFlightStartHour}
                hasPrevWeek={agendaView === "three-day"
                  ? threeDayStartIndex > 0
                  : weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) > 0}
                hasNextWeek={agendaView === "three-day"
                  ? threeDayStartIndex < DAY_ORDER.length - 3
                  : weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) < weekOptions.length - 1}
                onPrevWeek={() => {
                  if (agendaView === "three-day") {
                    setSelectedDay(DAY_ORDER[Math.max(0, threeDayStartIndex - 1)]!);
                    return;
                  }
                  const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                  const prev = weekOptions[idx - 1];
                  if (!prev) return;
                  setSelectedWeekStart(prev.weekStart);
                  loadWeekRequestRef.current += 1;
                  setWeekData(null);
                  setFlights([]);
                  void loadWeek(prev.weekStart, prev, { showSkeleton: true });
                }}
                onNextWeek={() => {
                  if (agendaView === "three-day") {
                    setSelectedDay(DAY_ORDER[Math.min(DAY_ORDER.length - 3, threeDayStartIndex + 1)]!);
                    return;
                  }
                  const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                  const next = weekOptions[idx + 1];
                  if (!next) return;
                  setSelectedWeekStart(next.weekStart);
                  loadWeekRequestRef.current += 1;
                  setWeekData(null);
                  setFlights([]);
                  void loadWeek(next.weekStart, next, { showSkeleton: true });
                }}
                onItemClick={(item) => {
                  if (!canEditFlight) return;
                  const selected = flights.find((row) => row.id === item.id);
                  if (selected) void openEditModal(selected);
                }}
                onItemDrop={canEditFlight ? (item, target) => {
                  const selected = flights.find((row) => row.id === item.id);
                  if (!selected) return;
                  void (async () => {
                    await openEditModal(selected);
                    setFormDraft((prev) =>
                      prev ? { ...prev, dayOfWeek: target.dayOfWeek, startHour: target.startHour, startTime: target.startTime, isNight: target.isNight } : prev,
                    );
                  })();
                } : undefined}
                onEmptySlotClick={(target) => {
                  if (!canCreateFlight) return;
                  openCreateModal();
                  setFormDraft((prev) =>
                    prev ? { ...prev, dayOfWeek: target.dayOfWeek, startHour: target.startHour, startTime: target.startTime, isNight: target.isNight } : prev,
                  );
                }}
              />
            ) : (
              <section className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-4">
                <DailyCalendarGrid
                  items={calendarItems}
                  selectedDay={selectedDay}
                  weekStart={weekData.week.weekStart}
                  groupBy={dailyGroupBy}
                  nightStartHour={scheduleRules.nightFlightStartHour}
                  colorByAircraft={colorByAircraft}
                  borderByInstructor={borderByInstructor}
                  weekData={weekData}
                  backgroundSupply={selectedSupplyForBackground}
                  clubMemberByStudentId={clubMemberByStudentId}
                  hasPrevWeek={weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) > 0}
                  hasNextWeek={weekOptions.findIndex((w) => w.weekStart === selectedWeekStart) < weekOptions.length - 1}
                  onSelectDay={setSelectedDay}
                  onPrevWeek={() => {
                    const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                    const prev = weekOptions[idx - 1];
                    if (!prev) return;
                    setSelectedWeekStart(prev.weekStart);
                    loadWeekRequestRef.current += 1;
                    setWeekData(null);
                    setFlights([]);
                    void loadWeek(prev.weekStart, prev, { showSkeleton: true });
                  }}
                  onNextWeek={() => {
                    const idx = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
                    const next = weekOptions[idx + 1];
                    if (!next) return;
                    setSelectedWeekStart(next.weekStart);
                    loadWeekRequestRef.current += 1;
                    setWeekData(null);
                    setFlights([]);
                    void loadWeek(next.weekStart, next, { showSkeleton: true });
                  }}
                  onItemClick={(item) => {
                    if (!canEditFlight) return;
                    const selected = flights.find((row) => row.id === item.id);
                    if (selected) void openEditModal(selected);
                  }}
                  onItemDrop={canEditFlight ? (item, target) => {
                    const selected = flights.find((row) => row.id === item.id);
                    if (!selected) return;
                    void (async () => {
                      await openEditModal(selected);
                      setFormDraft((prev) => {
                        if (!prev) return prev;
                        const base = { ...prev, dayOfWeek: target.dayOfWeek, startHour: target.startHour, startTime: target.startTime, isNight: target.isNight };
                        if (target.targetInstructorId !== undefined) {
                          const instr = weekData.instructors.find((i) => i.userId === target.targetInstructorId) ?? null;
                          return { ...base, instructorId: target.targetInstructorId, instructorLabel: instr?.label ?? null, instructorAnac: instr?.anacCode ?? null };
                        }
                        if (target.targetAircraftRegistration) {
                          return { ...base, aircraftRegistration: target.targetAircraftRegistration };
                        }
                        return base;
                      });
                    })();
                  } : undefined}
                  onEmptySlotClick={(target) => {
                    if (!canCreateFlight) return;
                    openCreateModal();
                    setFormDraft((prev) => {
                      if (!prev) return prev;
                      const base = { ...prev, dayOfWeek: target.dayOfWeek, startHour: target.startHour, startTime: target.startTime, isNight: target.isNight };
                      if (target.targetInstructorId !== undefined) {
                        const instr = weekData.instructors.find((i) => i.userId === target.targetInstructorId) ?? null;
                        return { ...base, instructorId: target.targetInstructorId, instructorLabel: instr?.label ?? null, instructorAnac: instr?.anacCode ?? null };
                      }
                      if (target.targetAircraftRegistration) {
                        return { ...base, aircraftRegistration: target.targetAircraftRegistration };
                      }
                      return base;
                    });
                  }}
                />
              </section>
            )}
          </div>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preview + edição manual</p>
              <button
                type="button"
                onClick={() => openCreateModal()}
                disabled={!canCreateFlight}
                className="rounded-lg border border-violet-500/60 px-3 py-2 text-xs font-semibold text-violet-400 hover:bg-violet-600/20"
              >
                Adicionar voo
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="border-b border-slate-700 px-2 py-2">Aluno</th>
                    <th className="border-b border-slate-700 px-2 py-2">Instrutor</th>
                    <th className="border-b border-slate-700 px-2 py-2">Peso total</th>
                    <th className="border-b border-slate-700 px-2 py-2">Aeronave</th>
                    <th className="border-b border-slate-700 px-2 py-2">Dia</th>
                    <th className="border-b border-slate-700 px-2 py-2">Hora</th>
                    <th className="border-b border-slate-700 px-2 py-2">Duração</th>
                    <th className="border-b border-slate-700 px-2 py-2">Status</th>
                    <th className="border-b border-slate-700 px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map((row) => {
                    const conflicts = conflictsByFlightId.get(row.id) ?? [];
                    return (
                      <tr key={row.id} className="border-b border-slate-800/60">
                        <td className="px-2 py-2 text-slate-200">{shortName(studentLabelMap.get(row.studentId) ?? row.studentId, studentLabelMap.get(row.studentId) ?? row.studentId)}</td>
                        <td className="px-2 py-2 text-slate-300">
                          {shortName(row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null)) || "—"}
                        </td>
                        <td className="px-2 py-2 text-slate-300">{totalWeightByFlightId.get(row.id) ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-300">{row.aircraftRegistration ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-300">{DAY_LABEL[new Date(`${row.date}T12:00:00`).getDay()]}</td>
                        <td className="px-2 py-2 text-slate-300">{row.startTime}</td>
                        <td className="px-2 py-2 text-slate-300">{row.durationHours.toFixed(1)}h</td>
                        <td className="px-2 py-2 text-xs">
                          {conflicts.length === 0 ? (
                            row.instructorId ? <span className="text-emerald-300">OK</span> : <span className="text-amber-300">Sem instrutor</span>
                          ) : (
                            <span className="text-amber-300">{conflictTypeLabel(conflicts[0]!.type)}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {canEditFlight ? (
                            <button
                              type="button"
                              onClick={() => void openEditModal(row)}
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              Editar
                            </button>
                            ) : null}
                            {canDeleteFlight ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteFlight(row)}
                              className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                            >
                              Excluir
                            </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos atendidos</p>
              <div className="space-y-2">
                {servedStudents.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedStudentId(row.id)}
                    className="w-full rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left text-sm hover:bg-slate-800/60"
                  >
                    <p className="font-medium text-slate-200">{shortName(row.label, row.label)}</p>
                    <p className="text-xs text-slate-500">{row.flights} voos · {row.hours.toFixed(1)}h</p>
                    <p className="text-xs text-emerald-300">Atendido</p>
                  </button>
                ))}
                {servedStudents.length === 0 ? <p className="text-sm text-slate-400">Nenhum aluno atendido.</p> : null}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos não atendidos</p>
              {notServedStudents.length === 0 ? (
                <p className="text-sm text-emerald-300">Todos os alunos estão atendidos.</p>
              ) : (
                <div className="space-y-2">
                  {notServedStudents.map((row) => (
                    <button
                      key={row.userId}
                      type="button"
                      onClick={() => setSelectedStudentId(row.userId)}
                      className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left text-sm hover:bg-red-500/10"
                    >
                      <p className="font-medium text-slate-200">{shortName(row.label, row.label)}</p>
                      <p className="text-xs text-red-300">Sem voo marcado nesta semana</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {selectedStudentSchedule ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{selectedStudentSchedule.student.label}</p>
                <p className="text-xs text-slate-500">
                  {selectedStudentSchedule.student.email || "Sem email"} · ANAC {selectedStudentSchedule.student.anacCode || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[78vh] space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.flights.length}</p>
                  <p className="text-[11px] text-slate-500">Voos</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">
                    {selectedStudentSchedule.flights.reduce((acc, row) => acc + row.durationHours, 0).toFixed(1)}h
                  </p>
                  <p className="text-[11px] text-slate-500">Horas</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.student.weightKg ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Peso kg</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.student.heightCm ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Altura cm</p>
                </div>
              </div>

              {selectedStudentSchedule.flights.length === 0 ? (
                <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-200">
                  Este aluno ainda não tem voo marcado nesta semana.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] border-collapse text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-wider text-slate-500">
                        <th className="border-b border-slate-700 px-2 py-1.5">Dia</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Hora</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Duração</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Aeronave</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Instrutor</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Peso total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudentSchedule.flights.map((row) => (
                        <tr key={row.id} className="border-b border-slate-800/60">
                          <td className="px-2 py-1.5 text-slate-200">{DAY_LABEL[new Date(`${row.date}T12:00:00`).getDay()]}</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.startTime}</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.durationHours.toFixed(1)}h</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.aircraftRegistration ?? "—"}</td>
                          <td className="px-2 py-1.5 text-slate-300">
                            {shortName(row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null)) || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-300">{totalWeightByFlightId.get(row.id) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {formDraft && weekData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">{formMode === "create" ? "Novo voo" : "Editar voo"}</p>
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              {formMode === "edit" && (
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400">
                    Status do voo
                    <select
                      value={formDraft.flightStatus ?? "Confirmado"}
                      onChange={(e) => setFormDraft((prev) => prev ? { ...prev, flightStatus: e.target.value as FlightStatus, cancellationReason: "", cancellationReasonText: "" } : prev)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                    >
                      {FLIGHT_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {formDraft.flightStatus === "Cancelado" && (
                    <div className="mt-2 space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                      <label className="block text-xs text-slate-400">
                        Motivo do cancelamento *
                        <select
                          value={formDraft.cancellationReason ?? ""}
                          onChange={(e) => setFormDraft((prev) => prev ? { ...prev, cancellationReason: e.target.value } : prev)}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                        >
                          <option value="">Selecione o motivo</option>
                          {FLIGHT_CANCELLATION_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      {formDraft.cancellationReason && (
                        <label className="block text-xs text-slate-400">
                          Descrição adicional
                          <textarea
                            value={formDraft.cancellationReasonText ?? ""}
                            onChange={(e) => setFormDraft((prev) => prev ? { ...prev, cancellationReasonText: e.target.value } : prev)}
                            rows={2}
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                            placeholder="Detalhes sobre o cancelamento..."
                          />
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={formDraft.waiveCancellationPenalty ?? false}
                          onChange={(e) => setFormDraft((prev) => prev ? { ...prev, waiveCancellationPenalty: e.target.checked } : prev)}
                        />
                        Não descontar multa do aluno
                      </label>
                    </div>
                  )}
                </div>
              )}
              <StudentSearchSelect
                label="Aluno"
                students={weekData.students}
                value={formDraft.studentId}
                onChange={(student) =>
                  setFormDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          studentId: student.userId,
                          studentLabel: student.label,
                        }
                      : prev,
                  )
                }
                className="md:col-span-2"
              />
              <label className="text-xs text-slate-400">
                Instrutor
                <select
                  value={formDraft.instructorId ?? ""}
                  onChange={(e) =>
                    setFormDraft((prev) =>
                      prev ? { ...prev, ...resolveInstructorDraft(weekData.instructors, e.target.value || null) } : prev,
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  <option value="">Sem instrutor</option>
                  {weekData.instructors.map((instructor) => (
                    <option key={instructor.userId} value={instructor.userId}>
                      {shortName(instructor.label, instructor.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Aeronave
                <select
                  value={formDraft.aircraftRegistration}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, aircraftRegistration: e.target.value } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {aircraftOptions.map((aircraft) => (
                    <option key={aircraft.registration} value={aircraft.registration}>
                      {aircraft.registration}{aircraft.hasSupply ? "" : " (sem disponibilidade)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Dia
                <select
                  value={formDraft.dayOfWeek}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, dayOfWeek: Number(e.target.value) } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {DAY_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {DAY_LABEL[day]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Hora
                <select
                  value={hourSelectValue(formDraft.isNight, formDraft.startTime, formDraft.startHour)}
                  onChange={(e) => {
                    const parsed = parseHourSelectValue(e.target.value, scheduleRules);
                    setFormDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            startHour: parsed.startHour,
                            startTime: parsed.startTime,
                            isNight: parsed.isNight,
                          }
                        : prev,
                    );
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {hourOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Duração (h)
                <input
                  type="number"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={formDraft.durationHours}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, durationHours: Number(e.target.value) } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
            </div>

            {/* 4-time summary (Apresentação / Acionamento / Corte / Encerramento) */}
            {(() => {
              const startMin = parseScheduleTimeToMinutes(formDraft.startTime);
              const durMin = Math.round(formDraft.durationHours * 60);
              const presentation = minutesToScheduleHHMM(startMin - scheduleRules.bufferBeforeMinutes);
              const cutoff = minutesToScheduleHHMM(startMin + durMin);
              const end = minutesToScheduleHHMM(startMin + durMin + scheduleRules.bufferAfterMinutes);
              return (
                <div className="mx-4 mb-3 grid grid-cols-2 gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100 sm:grid-cols-4">
                  <div><p className="text-sky-300">Apresentação</p><strong>{presentation}</strong></div>
                  <div><p className="text-sky-300">Acionamento</p><strong>{formDraft.startTime}</strong></div>
                  <div><p className="text-sky-300">Corte</p><strong>{cutoff}</strong></div>
                  <div><p className="text-sky-300">Encerramento</p><strong>{end}</strong></div>
                </div>
              );
            })()}

            {/* Student credits — always shown when modal is open */}
            <div className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-300">Créditos disponíveis do aluno</p>
              {formStudentCreditsLoading ? (
                <p className="text-xs text-slate-500">Carregando créditos...</p>
              ) : formStudentCredits && formStudentCredits.length > 0 ? (
                <div className="space-y-1">
                  {formStudentCredits.map((row) => (
                    <div key={row.aircraftModelId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{row.aircraftModelName}</span>
                      <span className="text-slate-400">
                        Disponível: <strong className={row.availableHours > 0 ? "text-emerald-300" : "text-red-300"}>
                          {Math.floor(row.availableHours)}h{String(Math.round((row.availableHours % 1) * 60)).padStart(2, "0")}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nenhum crédito encontrado para este aluno.</p>
              )}
            </div>

            {!selectedAircraftHasSupply ? (
              <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Esta aeronave não possui disponibilidade operacional cadastrada para esta semana. O voo será salvo mesmo assim.
              </div>
            ) : null}

            {formConflicts.length > 0 ? (
              <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <p className="font-semibold">Conflitos detectados:</p>
                <ul className="mt-1 space-y-1">
                  {formConflicts.map((conflict, index) => (
                    <li key={`${conflict.type}-${index}`}>
                      {conflictTypeLabel(conflict.type)}: {conflict.message}
                    </li>
                  ))}
                </ul>
                {!forceSaveWithConflict ? (
                  <button
                    type="button"
                    onClick={() => setForceSaveWithConflict(true)}
                    className="mt-2 rounded border border-amber-300/40 px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-500/20"
                  >
                    Entendi os conflitos, quero salvar mesmo assim
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-amber-400">Conflitos aceitos. O salvamento será permitido.</p>
                )}
              </div>
            ) : null}

            <div className="flex flex-col justify-end gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="w-full rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 sm:w-auto"
              >
                Cancelar
              </button>
              {formMode === "edit" && canDeleteFlight ? (
                <button
                  type="button"
                  onClick={() => {
                    const targetId = formDraft.id;
                    if (!targetId) return;
                    const row = flights.find((flight) => flight.id === targetId);
                    if (!row) return;
                    void (async () => {
                      await handleDeleteFlight(row);
                      setFormDraft(null);
                    })();
                  }}
                  className="w-full rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 sm:w-auto"
                >
                  Excluir voo
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSaveForm()}
                disabled={formSaving || (formMode === "create" ? !canCreateFlight : !canEditFlight)}
                className="w-full rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 sm:w-auto"
              >
                {formSaving ? "Salvando..." : "Salvar voo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
