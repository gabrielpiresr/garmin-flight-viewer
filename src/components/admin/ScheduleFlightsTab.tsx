import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { listAircrafts } from "../../lib/aircraftDb";
import { SCHOOL_ID } from "../../lib/appwrite";
import { decodeFlightRecord, encodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { deleteSavedFlight, getSavedFlight, insertFlight, updateFlight, FLIGHT_STATUS_OPTIONS, normalizeScheduleFlightStatus, type FlightStatus } from "../../lib/flightsDb";
import { dispatchNotificationEvent, syncFlightCalendarEvent } from "../../lib/notificationsDb";
import { cancelScheduleFlight, confirmScheduleFlight } from "../../lib/scheduleBookingDb";
import {
  cancelSagaScheduleDirect,
  syncSagaScheduleEvent,
  upsertSagaScheduleDirect,
  type SagaDirectScheduleItem,
  type SagaScheduleSyncMode,
  type SagaScheduleSyncResult,
} from "../../lib/sagaImportDb";
import {
  buildConflictsByFlightId,
  detectFlightConflicts,
  type DetectedFlightConflict,
} from "../../lib/scheduleConflicts";
import {
  AUTO_SOURCE_PREFIX,
  generateScheduleWeekPickerOptions,
  getCurrentWeekStart,
  getScheduleWeekPickerOptions,
  pickDefaultScheduleWeek,
  MANUAL_SOURCE_PREFIX,
} from "../../lib/scheduleGenerationDb";
import { shortName } from "../../lib/flightDisplay";
import { ScheduleStudentSummaryPanel } from "./ScheduleStudentSummaryPanel";
import { getStudentCreditStatement } from "../../lib/creditsDb";
import { getFlightCreditSalesConfig } from "../../lib/flightCreditSalesDb";
import { type AircraftBaseHours } from "../../lib/aircraftHoursProjection";
import { fetchPlaneItAircraftTotals, type PlaneItAircraftTotal } from "../../lib/planeItDb";
import {
  getSagaScheduleEventsCached,
  getScheduleWeekDataCached,
  invalidateSagaScheduleEvents,
  loadFleetMaintenanceContextCached,
  peekSagaScheduleEvents,
} from "../../lib/scheduleCache";
import { getSchoolRules } from "../../lib/schoolRulesDb";
import type { StudentCreditStatement } from "../../types/credits";
import { listStudentTrainingTracks } from "../../lib/trainingTracksDb";
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
import { useDirectionalSlide } from "../../hooks/useDirectionalSlide";
import {
  AIRCRAFT_COLOR_CLASSES,
  aircraftCardColor,
  buildAircraftScheduleColorMap,
} from "../../lib/aircraftColors";

export { AIRCRAFT_COLOR_CLASSES } from "../../lib/aircraftColors";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };

/** Viewport mobile (< 640px) — mesmo critério do useIsMobile da escala do aluno. */
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

const MOBILE_MIN_COLUMN_PX = 130;
const MOBILE_HOURS_GUTTER_PX = 36;

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

function normalizeAircraftIdent(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

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

// ─── Escala somente no SAGA ───────────────────────────────────────────────────
// Em modo saga-only os "voos" da escala são eventos da agenda SAGA: nada é salvo
// no sistema — criar/editar/excluir age direto no SAGA via admin-users.

const SAGA_EVENT_ID_PREFIX = "saga_evt_";
const SAGA_STUDENT_ID_PREFIX = "saga:";

// Usuário "bloqueio" no SAGA (piresr.gabriel+bloqueio@gmail.com, ID 139) — entra como
// aluno E instrutor dos eventos de bloqueio de agenda criados pelo admin.
const SAGA_BLOCK_USER_ID = "139";
const SAGA_BLOCK_USER_NAME = "Bloqueio de agenda";

function isSagaEventRowId(id: string): boolean {
  return id.startsWith(SAGA_EVENT_ID_PREFIX);
}

function sagaDirectDateTimeParts(value: string): { date: string; time: string } {
  const match = (value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (match) return { date: match[1]!, time: match[2]! };
  return { date: (value || "").slice(0, 10), time: "" };
}

function sagaEventIsCancelled(item: SagaDirectScheduleItem): boolean {
  const status = (item.status || "").toUpperCase();
  if (["CANCELED", "CANCELLED", "CANCELADO", "CANCELADA"].includes(status)) return true;
  return item.active === false;
}

/** Status SAGA (CANCELED/CONFIRMED/PENDING/PLANNED + variantes PT) → vocabulário da escala. */
function sagaEventStatusLabel(item: SagaDirectScheduleItem): FlightStatus {
  if (sagaEventIsCancelled(item)) return "Cancelado";
  return normalizeScheduleFlightStatus(item.status);
}

/** Status da escala → status SAGA para o upsert direto. */
function flightStatusToSagaStatus(status: FlightStatus | undefined): "PLANNED" | "PENDING" | "CONFIRMED" {
  if (status === "Confirmado") return "CONFIRMED";
  if (status === "Pendente") return "PENDING";
  return "PLANNED";
}

/** Evento de bloqueio de agenda: usuário de bloqueio (ID 139) como aluno/instrutor, nota, nome ou agenda "bloqueio". */
function sagaEventIsBlock(item: SagaDirectScheduleItem): boolean {
  const norm = (value: string | null | undefined) => String(value || "").replace(/^saga[:_-]?/i, "").trim();
  if (norm(item.studentSagaId) === SAGA_BLOCK_USER_ID || norm(item.instructorSagaId) === SAGA_BLOCK_USER_ID) return true;
  if (norm(item.studentUserId) === `saga_${SAGA_BLOCK_USER_ID}`) return true;
  return /bloqueio/i.test(String(item.notes || ""))
    || /bloqueio/i.test(String(item.studentName || ""))
    || /bloqueio/i.test(String(item.aircraft || ""));
}

function sagaEventToScheduledFlight(item: SagaDirectScheduleItem): ExistingScheduledFlight | null {
  const start = sagaDirectDateTimeParts(item.startAtRaw || item.startAt);
  const end = sagaDirectDateTimeParts(item.endAtRaw || item.endAt);
  if (!start.date || !start.time) return null;
  const startMinutes = parseScheduleTimeToMinutes(start.time);
  let endMinutes = end.time ? parseScheduleTimeToMinutes(end.time) : startMinutes + 60;
  if (end.date && end.date > start.date) endMinutes += 1440;
  return {
    id: `${SAGA_EVENT_ID_PREFIX}${item.id}`,
    demandId: `saga-${item.id}`,
    studentId: item.studentUserId || `${SAGA_STUDENT_ID_PREFIX}${item.studentSagaId}`,
    studentLabel: item.studentName || null,
    instructorId: item.instructorUserId || null,
    instructorLabel: item.instructorName || null,
    instructorAnac: null,
    aircraftRegistration: (item.aircraft || "").toUpperCase() || null,
    date: start.date,
    startTime: start.time,
    durationHours: Math.max(0.25, (endMinutes - startMinutes) / 60),
    flightStatus: sagaEventStatusLabel(item),
    sourceFilename: "saga-schedule",
    sagaScheduleId: item.id,
    notes: item.notes || null,
    isOutsideGenerator: false,
    isBlocked: sagaEventIsBlock(item),
  };
}

/** Tempo efetivo acionamento→corte dentro do bloco completo armazenado no SAGA. */
function sagaEffectiveFlightMinutes(blockMinutes: number, rules: FlightScheduleRules): number {
  return Math.max(0, blockMinutes - rules.bufferBeforeMinutes - rules.bufferAfterMinutes);
}

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
  /** Data explícita do voo (YYYY-MM-DD) escolhida no calendário do modal. */
  dateIso?: string;
  startTime: string;
  startHour: number;
  durationHours: number;
  isNight?: boolean;
  sagaScheduleId?: string | null;
  flightStatus?: FlightStatus;
  cancellationReason?: string;
  cancellationReasonText?: string;
  waiveCancellationPenalty?: boolean;
  notes: string;
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
  /** Tempo de voo líquido (sem briefing/debriefing) — usado nas somas de horas. */
  flightHours?: number;
  flightStatus?: FlightStatus;
  startTime: string;
  endTime: string;
  isNight?: boolean;
  isOutsideGenerator?: boolean;
  isOwn?: boolean;
  isBlocked?: boolean;
  notes?: string | null;
};

/** Cores por status — fonte única usada na escala do admin e na visão do aluno. */
export const FLIGHT_STATUS_CARD_COLOR: Record<string, string> = {
  "Confirmado": "bg-emerald-600",
  "Previsto": "bg-sky-600",
  "Pendente": "bg-orange-600",
  "Cancelado": "bg-red-700",
  "Realizado": "bg-sky-600",
  "Não confirmado": "bg-slate-600",
};

function calendarItemColor(item: Pick<CalendarFlightItem, "aircraftRegistration" | "flightStatus">, colorByAircraft: Map<string, string>): string {
  if (item.flightStatus === "Cancelado") return "bg-red-700";
  return aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
}

/** Cancelados e bloqueios ficam sólidos — sem o estilo "sem instrutor" (opacidade/risco). */
function calendarItemUnassigned(item: Pick<CalendarFlightItem, "instructorId" | "flightStatus" | "isBlocked">): boolean {
  return !item.instructorId && item.flightStatus !== "Cancelado" && !item.isBlocked;
}

function calendarStudentTitle(label: string, isOutsideGenerator: boolean | undefined): string {
  const short = label.trim().split(/\s+/).slice(0, 2).join(" ");
  return isOutsideGenerator ? `*${short}` : short;
}

/**
 * Linha secundária do card. Oculta o dado que já está no cabeçalho da coluna para
 * não duplicar: agrupado por avião → mostra só o instrutor; por instrutor → só o avião.
 */
function calendarItemSubtitle(
  item: Pick<CalendarFlightItem, "aircraftRegistration" | "instructorLabel">,
  groupBy: ScheduleGroupBy,
): string {
  const instructor = shortName(item.instructorLabel) || "Sem instrutor";
  if (groupBy === "aircraft") return instructor;
  if (groupBy === "instructor") return item.aircraftRegistration;
  return `${item.aircraftRegistration} · ${instructor}`;
}

/** Minuto do dia atual (0–1439), atualizado a cada minuto — para a linha de "agora". */
function useNowMinutes(): number {
  const [now, setNow] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Linha vermelha translúcida marcando o horário atual (estilo Google Agenda). */
function CalendarNowLine({
  nowMinutes,
  startHour,
  endHour,
  rowHeight,
  withDot = false,
}: {
  nowMinutes: number;
  startHour: number;
  endHour: number;
  rowHeight: number;
  withDot?: boolean;
}) {
  if (nowMinutes < startHour * 60 || nowMinutes > endHour * 60) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 h-px bg-red-500/50"
      style={{ top: `${calendarTopPx(nowMinutes, rowHeight)}px` }}
    >
      {withDot ? <span className="absolute -left-0.5 -top-[3px] h-1.5 w-1.5 rounded-full bg-red-500/70" /> : null}
    </div>
  );
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

function formatCreditHours(hours: number): string {
  const sign = hours < 0 ? "-" : "";
  const abs = Math.abs(hours);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${hh}h${String(mm).padStart(2, "0")}`;
}

function scheduledFlightMs(flightDate: string, startTime: string): number {
  return new Date(`${flightDate}T${startTime}:00`).getTime();
}

type FormStudentScheduledFlight = {
  flightDate: string;
  startTime: string;
  hours: number;
};

function parseStartHour(startTime: string): number {
  const [hh, mm] = startTime.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
}

function normalizeTimeInput(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function isNightStartTime(startTime: string, rules: FlightScheduleRules): boolean {
  return rules.allowNightFlights && parseScheduleTimeToMinutes(startTime) >= rules.nightFlightStartHour * 60;
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

function nextSingleFocusSelection(prev: string[], value: string, allValues: string[]): string[] {
  const allSelected = allValues.length > 0 && allValues.every((option) => prev.includes(option));
  if (allSelected) return [value];
  return Array.from(new Set([...prev, value]));
}

function buildAutoMeta(draft: FlightFormDraft, weekStart: string, instructor?: InstructorIdentity | null): FlightRecordMeta {
  const weekDate = draft.dateIso || weekDateFromStart(weekStart, draft.dayOfWeek);
  const engineCut = minutesToScheduleHHMM(parseScheduleTimeToMinutes(draft.startTime) + Math.round(draft.durationHours * 60));
  return {
    schedule: {
      version: "AUTO_SCHEDULE_V1",
      weekStart,
      demandId: draft.demandId,
      notes: draft.notes.trim(),
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

/** Célula da linha de projeção de horas por aeronave (abaixo do Total da agenda). */
type ProjectionCell = {
  hours: number | null;
  /** Nome da manutenção que vence neste dia (célula destacada em vermelho). */
  maintenance?: string;
};

type AircraftProjectionRow = {
  registration: string;
  hoursByDay: Partial<Record<number, ProjectionCell>>;
};
type ProjectionHoursSource = "system" | "planeIt";
type PlaneItTotalsState = {
  loading: boolean;
  error: string | null;
  totals: Record<string, PlaneItAircraftTotal>;
};

type AircraftColumn = {
  registration: string;
  colorClass: string;
};

type ScheduleGroupBy = "aircraft" | "instructor" | "none";

type ScheduleColumn = {
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

function eventStyleClasses(color: string, unassigned: boolean, draggable: boolean): string {
  // Sem opacidade no card "sem instrutor": a transparência deixava eventos (ex.: PENDING
  // do SAGA sem instrutor) praticamente invisíveis na agenda. O risco continua como marcador.
  const strike = unassigned ? "line-through decoration-white/40 decoration-1" : "";
  const pointer = draggable ? "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-white/60" : "hover:ring-1 hover:ring-white/60";
  return `overflow-hidden rounded px-1.5 py-1 text-left text-[10px] text-white ${color} ${strike} ${pointer}`;
}

function aircraftProjectionCellClass(maintenance?: string): string {
  return maintenance
    ? "border-red-500/60 bg-red-500/15 font-semibold text-red-300"
    : "border-slate-800/60 bg-slate-950/40 text-slate-400";
}

function AircraftProjectionCell({ cell }: { cell?: ProjectionCell }) {
  const maintenance = cell?.maintenance;
  return (
    <div
      className={`rounded border px-1 py-1 text-center text-xs font-semibold tabular-nums ${aircraftProjectionCellClass(maintenance)}`}
    >
      {cell?.hours == null ? "—" : `${cell.hours.toFixed(1)}h`}
      {maintenance ? (
        <span className="block truncate text-[9px] font-semibold leading-tight text-red-300">
          {maintenance}
        </span>
      ) : null}
    </div>
  );
}

function scheduleColumnItemMatches(item: CalendarFlightItem, column: ScheduleColumn): boolean {
  if (column.groupBy === "none") return true;
  if (column.groupBy === "aircraft") return item.aircraftRegistration === column.aircraftRegistration;
  return (item.instructorId ?? "__none__") === (column.instructorId ?? "__none__");
}

function scheduleColumnTarget(column: ScheduleColumn): Partial<CalendarDropTarget> {
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
  tooltipOnlyClick = false,
  onPrevWeek,
  onNextWeek,
  hasPrevWeek,
  hasNextWeek,
  privacyMode = false,
  showGeneratorLegend = true,
  getItemColor,
  blockedSlots,
  projectionRows,
  projectionLoading = false,
  pastBeforeDate,
  onDayHeaderClick,
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
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  clubMemberByStudentId?: Record<string, boolean>;
  weekStart: string;
  nightStartHour: number;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  /** Quando definido, restringe quais cards podem ser arrastados (ex.: aluno só os próprios). */
  canDragItem?: (item: CalendarFlightItem) => boolean;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  /** Clique abre tooltip (popup) em vez de acionar onItemClick — escala pública. */
  tooltipOnlyClick?: boolean;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  privacyMode?: boolean;
  showGeneratorLegend?: boolean;
  showTotals?: boolean;
  getItemColor?: (item: CalendarFlightItem) => string;
  blockedSlots?: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
  /** Horas totais projetadas por aeronave ao fim de cada dia (linhas extras abaixo do total). */
  projectionRows?: AircraftProjectionRow[];
  /** Horas-base da Frota ainda carregando: mostra skeleton no lugar das linhas de projeção. */
  projectionLoading?: boolean;
  /** Escala do aluno: dias anteriores a esta data (ISO) ficam escurecidos e sem agendamento. */
  pastBeforeDate?: string;
  /** Semanal/3 dias: clicar no cabeçalho do dia abre a visão diária naquele dia. */
  onDayHeaderClick?: (day: number) => void;
}) {
  const calendarDays = days;
  const rowHeight = useCalendarRowHeight(52, 38);
  const isMobile = useIsMobileViewport();
  const nowMinutes = useNowMinutes();
  // Escala do aluno: dias anteriores a `pastBeforeDate` ficam escurecidos e sem clique de agendamento.
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
    const out = new Map<
      string,
      Array<{
        item: CalendarFlightItem;
        columnIndex: number;
        columnCount: number;
      }>
    >();

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
        for (const item of group) {
          entries.push({
            item,
            columnIndex: assigned.get(item.id) ?? 0,
            columnCount: maxColumn,
          });
        }
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
          <ScheduleLegend
            colorScheme={colorScheme}
            groupBy={groupBy}
            aircraftColumns={aircraftCols}
            instructorColumns={instructorCols}
          />
        </div>
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
      {gridColumns.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
          Nenhum voo no período.
        </p>
      ) : (
      <div className="w-full overflow-x-auto">
        <table
          className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1"
          style={isMobile ? { minWidth: `${gridColumns.length * MOBILE_MIN_COLUMN_PX + MOBILE_HOURS_GUTTER_PX}px` } : undefined}
        >
          <thead>
            <tr>
              <th className="w-8 pb-1 text-right text-[10px] font-medium text-slate-600 sm:w-12" />
              {calendarDays.map((day) => {
                const dayColumns = columnsByDay.get(day) ?? [];
                if (dayColumns.length === 0) return null;
                const date = dayOfWeekToDate(weekStart, day);
                const today = isDateToday(date);
                const past = isDayPast(day);
                const clickable = Boolean(onDayHeaderClick);
                return (
                  <th
                    key={day}
                    colSpan={dayColumns.length}
                    onClick={clickable ? () => onDayHeaderClick!(day) : undefined}
                    title={clickable ? "Ver este dia na visão diária" : undefined}
                    className={`rounded-t-md border-l-2 border-sky-500/30 bg-slate-800/25 pb-1 text-center text-[10px] font-semibold text-slate-400 sm:text-xs ${past ? "opacity-40" : ""} ${clickable ? "cursor-pointer transition-colors hover:bg-sky-500/15 hover:text-sky-200" : ""}`}
                  >
                    <span className="block uppercase">{DAY_LABEL[day]}</span>
                    <span className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${today ? "bg-sky-300 text-slate-950" : "text-slate-300"}`}>
                      {date.getDate()}
                    </span>
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
                      // Dia passado (escala do aluno): não abre modal de agendamento.
                      if (cellPast || !onEmptySlotClick || dragState) return;
                      const target = resolveDropTarget(e.clientX, e.clientY);
                      if (target) onEmptySlotClick(target);
                    }}
                  >
                    {cellPast ? <div className="pointer-events-none absolute inset-0 z-20 bg-slate-950/55" /> : null}
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
                    {isDateToday(dayOfWeekToDate(weekStart, day)) ? (
                      <CalendarNowLine
                        nowMinutes={nowMinutes}
                        startHour={CALENDAR_START_HOUR}
                        endHour={calendarEndHour}
                        rowHeight={rowHeight}
                        withDot={isFirstDayColumn}
                      />
                    ) : null}
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
                            // Arrastar para alterar é exclusivo do desktop (mouse);
                            // no celular o toque apenas abre os detalhes via clique.
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
                            if (tooltipOnlyClick) {
                              setTooltip({ item, x: e.clientX, y: e.clientY });
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
                              {privacyMode
                                ? (item.isBlocked || item.isOwn ? item.studentLabel : "Ocupado")
                                : calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}
                            </span>
                            {!privacyMode && clubMemberByStudentId?.[item.studentId] ? <FlightReviewClubBadge /> : null}
                          </p>
                          <p className="truncate opacity-90">{item.startTime}-{item.endTime}</p>
                          <p className="truncate opacity-80">
                            {privacyMode ? (item.isBlocked ? "" : item.aircraftRegistration) : calendarItemSubtitle(item, groupBy)}
                          </p>
                        </div>
                      );
                    })}
                    {dragState?.hasMoved && dragState.preview.dayOfWeek === day && scheduleColumnItemMatches({
                      ...dragState.item,
                      aircraftRegistration: dragState.preview.targetAircraftRegistration ?? dragState.item.aircraftRegistration,
                      instructorId: dragState.preview.targetInstructorId !== undefined ? dragState.preview.targetInstructorId : dragState.item.instructorId,
                    }, column) ? (() => {
                      const item = dragState.item;
                      const entry = (layoutByCell.get(cellKey) ?? []).find((e) => e.item.id === item.id) ?? {
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

// ─── Daily Calendar Grid ──────────────────────────────────────────────────────

type DailyCol = {
  key: string;
  label: string;
  colorClass: string;
  column: ScheduleColumn;
  items: CalendarFlightItem[];
};

function DailyCalendarGrid({
  items,
  selectedDay,
  weekStart,
  groupBy,
  columns: inputColumns,
  colorScheme,
  aircraftColumns,
  instructorColumns,
  nightStartHour,
  colorByAircraft,
  onItemClick,
  onItemDrop,
  onEmptySlotClick,
  tooltipOnlyClick = false,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  hasPrevWeek,
  hasNextWeek,
  backgroundSupply,
  clubMemberByStudentId,
  getItemColor,
  projectionRows,
  projectionLoading = false,
}: {
  items: CalendarFlightItem[];
  selectedDay: number;
  weekStart: string;
  groupBy: ScheduleGroupBy;
  columns: ScheduleColumn[];
  colorScheme: "aircraft" | "status";
  aircraftColumns?: AircraftColumn[];
  instructorColumns?: ScheduleColumn[];
  nightStartHour: number;
  colorByAircraft: Map<string, string>;
  getItemColor?: (item: CalendarFlightItem) => string;
  borderByInstructor: Map<string, string>;
  onItemClick: (item: CalendarFlightItem) => void;
  onItemDrop?: (item: CalendarFlightItem, target: CalendarDropTarget) => void;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  tooltipOnlyClick?: boolean;
  onSelectDay: (day: number) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  clubMemberByStudentId?: Record<string, boolean>;
  projectionRows?: AircraftProjectionRow[];
  projectionLoading?: boolean;
}) {
  const rowHeight = useCalendarRowHeight(64, 38);
  const isMobile = useIsMobileViewport();
  const nowMinutes = useNowMinutes();
  const calendarHours = useMemo(() => buildCalendarHours(items), [items]);
  const calendarEndHour = (calendarHours[calendarHours.length - 1] ?? CALENDAR_START_HOUR) + 1;
  const boardHeight = calendarHours.length * rowHeight;
  const draggable = Boolean(onItemDrop);
  const showNowLine = isDateToday(dayOfWeekToDate(weekStart, selectedDay));

  const dayItems = useMemo(
    () => items.filter((i) => i.dayOfWeek === selectedDay),
    [items, selectedDay],
  );

  const columns = useMemo<DailyCol[]>(() => {
    return inputColumns
      .map((column) => ({
        key: column.key,
        label: column.label,
        colorClass: column.colorClass,
        column,
        items: dayItems.filter((item) => scheduleColumnItemMatches(item, column)),
      }))
      .filter((column) => column.items.length > 0);
  }, [dayItems, inputColumns]);

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
  const [tooltip, setTooltip] = useState<ScheduleTooltipState>(null);
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
        return { ...base, ...scheduleColumnTarget(col.column) };
      }
      return null;
    },
    [calendarEndHour, columns, nightStartHour, selectedDay],
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
    if (hasPrevWeek && onPrevWeek) onPrevWeek();
  }

  function handleNextDay() {
    if (hasNextWeek && onNextWeek) onNextWeek();
  }

  const prevDayDisabled = !hasPrevWeek;
  const nextDayDisabled = !hasNextWeek;

  return (
    <>
      {/* Day selector */}
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={handlePrevDay}
          disabled={prevDayDisabled}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
          title="Semana anterior"
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
          title="Proxima semana"
        >
          ›
        </button>
      </div>

      {draggable ? (
        <p className="mb-2 text-[11px] text-slate-600">Arraste um voo para reagendar. Ao soltar, confirme no modal.</p>
      ) : null}
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agenda diária</p>
        <ScheduleLegend
          colorScheme={colorScheme}
          groupBy={groupBy}
          aircraftColumns={aircraftColumns ?? []}
          instructorColumns={instructorColumns ?? []}
        />
      </div>
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
            style={isMobile ? { minWidth: `${columns.length * MOBILE_MIN_COLUMN_PX + MOBILE_HOURS_GUTTER_PX}px` } : undefined}
          >
            <thead>
              <tr>
                <th className="w-8 pb-2 sm:w-12" />
                {columns.map((col) => (
                  <th key={col.key} className="pb-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded border ${groupBy === "instructor" ? `${col.colorClass} border-2 bg-slate-800` : aircraftCardColor(col.colorClass)}`} />
                      <span className="text-xs font-semibold text-slate-300">{col.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {col.items.length} voo{col.items.length !== 1 ? "s" : ""} · {col.items.reduce((s, i) => s + (i.flightHours ?? i.durationHours), 0).toFixed(1)}h
                    </p>
                    {groupBy === "aircraft" && projectionLoading ? (
                      <Skeleton className="mx-auto mt-1 h-4 w-14 rounded" />
                    ) : groupBy === "aircraft" ? (
                      <AircraftProjectionCell cell={projectionRows?.find((row) => row.registration === col.key)?.hoursByDay[selectedDay]} />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Main time board */}
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
                        {showNowLine ? (
                          <CalendarNowLine
                            nowMinutes={nowMinutes}
                            startHour={CALENDAR_START_HOUR}
                            endHour={calendarEndHour}
                            rowHeight={rowHeight}
                            withDot={columns[0]?.key === col.key}
                          />
                        ) : null}
                        {entries.map((entry) => {
                          if (dragState?.hasMoved && dragState.item.id === entry.item.id) return null;
                          const item = entry.item;
                          const top = calendarTopPx(parseScheduleTimeToMinutes(item.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const color = getItemColor ? getItemColor(item) : calendarItemColor(item, colorByAircraft);
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              {...scheduleTooltipHandlers(item, setTooltip)}
                              onPointerDown={(e) => {
                                // Arrastar para alterar é exclusivo do desktop (mouse);
                                // no celular o toque apenas abre os detalhes via clique.
                                if (!draggable || e.pointerType !== "mouse") return;
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
                                if (tooltipOnlyClick) {
                                  setTooltip({ item, x: e.clientX, y: e.clientY });
                                  return;
                                }
                                onItemClick(item);
                              }}
                              className={`absolute ${eventStyleClasses(color, calendarItemUnassigned(item), draggable)}`}
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
                              <p className="truncate opacity-80">{calendarItemSubtitle(item, groupBy)}</p>
                            </div>
                          );
                        })}
                        {/* Drag preview */}
                        {dragState?.hasMoved && (() => {
                          const item = dragState.item;
                          const entry = entries.find((e) => e.item.id === item.id) ?? { item, columnIndex: 0, columnCount: 1 };
                          const top = calendarTopPx(parseScheduleTimeToMinutes(dragState.preview.startTime), rowHeight);
                          const height = Math.max(rowHeight / 2, item.durationHours * rowHeight);
                          const color = calendarItemColor(item, colorByAircraft);
                          const widthPercent = 100 / Math.max(1, entry.columnCount);
                          const leftPercent = entry.columnIndex * widthPercent;
                          const previewItem = {
                            ...item,
                            aircraftRegistration: dragState.preview.targetAircraftRegistration ?? item.aircraftRegistration,
                            instructorId: dragState.preview.targetInstructorId !== undefined ? dragState.preview.targetInstructorId : item.instructorId,
                          };
                          if (!scheduleColumnItemMatches(previewItem, col.column)) return null;
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
            </tbody>
          </table>
        </div>
      )}
      <ScheduleItemTooltipCard state={tooltip} />
    </>
  );
}

// ─── Linha do tempo horizontal (agenda "invertida") ──────────────────────────
// Eixo do tempo na horizontal: uma linha por dia (semanal/3 dias) ou por
// instrutor/avião (diária). Clique no voo abre a edição normalmente.

type TimelineRow = {
  key: string;
  label: string;
  items: CalendarFlightItem[];
  kind?: "day" | "group";
  dayOfWeek?: number;
  column?: ScheduleColumn;
  dayLabel?: string;
  summaryLabel?: string;
  projectionCell?: ProjectionCell;
};

const TIMELINE_MIN_PX_PER_HOUR = Math.round(96 * 0.8);
const TIMELINE_LANE_HEIGHT = 48;
const TIMELINE_DESKTOP_LANE_HEIGHT = Math.round(TIMELINE_LANE_HEIGHT * 1.3);

function HorizontalTimelineBoard({
  rows,
  title,
  groupBy,
  colorScheme,
  aircraftColumns,
  instructorColumns,
  nightStartHour,
  getItemColor,
  clubMemberByStudentId,
  onItemClick,
  onEmptySlotClick,
  tooltipOnlyClick = false,
  daySelector,
  onPrevWeek,
  onNextWeek,
  hasPrevWeek,
  hasNextWeek,
  showDayInItems = false,
}: {
  rows: TimelineRow[];
  title: string;
  groupBy: ScheduleGroupBy;
  colorScheme: "aircraft" | "status";
  aircraftColumns: AircraftColumn[];
  instructorColumns: ScheduleColumn[];
  nightStartHour: number;
  getItemColor: (item: CalendarFlightItem) => string;
  borderByInstructor: Map<string, string>;
  clubMemberByStudentId?: Record<string, boolean>;
  onItemClick: (item: CalendarFlightItem) => void;
  onEmptySlotClick?: (target: CalendarDropTarget) => void;
  tooltipOnlyClick?: boolean;
  daySelector?: { weekStart: string; selectedDay: number; onSelectDay: (day: number) => void };
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  hasPrevWeek?: boolean;
  hasNextWeek?: boolean;
  showDayInItems?: boolean;
}) {
  const allItems = useMemo(() => rows.flatMap((row) => row.items), [rows]);
  const hours = useMemo(() => buildCalendarHours(allItems), [allItems]);
  const startHour = hours[0] ?? CALENDAR_START_HOUR;
  const endHour = (hours[hours.length - 1] ?? CALENDAR_START_HOUR) + 1;
  const totalMinutes = Math.max(60, (endHour - startHour) * 60);
  const boardMinWidth = hours.length * TIMELINE_MIN_PX_PER_HOUR;
  const laneHeight = useCalendarRowHeight(TIMELINE_LANE_HEIGHT, TIMELINE_DESKTOP_LANE_HEIGHT);
  const rowBoardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [tooltip, setTooltip] = useState<ScheduleTooltipState>(null);

  const layout = useMemo(
    () =>
      rows.map((row) => {
        const sorted = [...row.items].sort((a, b) => {
          const aStart = parseScheduleTimeToMinutes(a.startTime);
          const bStart = parseScheduleTimeToMinutes(b.startTime);
          if (aStart !== bStart) return aStart - bStart;
          return a.durationHours - b.durationHours;
        });
        const active: Array<{ end: number; lane: number }> = [];
        let laneCount = 1;
        const entries = sorted.map((item) => {
          const start = parseScheduleTimeToMinutes(item.startTime);
          const end = start + Math.round(item.durationHours * 60);
          for (let i = active.length - 1; i >= 0; i -= 1) {
            if (active[i]!.end <= start) active.splice(i, 1);
          }
          let lane = 0;
          while (active.some((node) => node.lane === lane)) lane += 1;
          active.push({ end, lane });
          laneCount = Math.max(laneCount, lane + 1);
          return { item, lane };
        });
        return { row, entries, laneCount };
      }),
    [rows],
  );

  const resolveDropTarget = useCallback(
    (row: TimelineRow, clientX: number): CalendarDropTarget | null => {
      if (row.kind === "day" || row.dayOfWeek == null) return null;
      const board = rowBoardRefs.current.get(row.key);
      if (!board) return null;
      const rect = board.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right) return null;
      const minutesFromOrigin = ((clientX - rect.left) / Math.max(1, rect.width)) * totalMinutes;
      const snapped = Math.round(minutesFromOrigin / 30) * 30;
      const maxOffset = Math.max(0, totalMinutes - 30);
      const startMinute = startHour * 60 + Math.min(Math.max(0, snapped), maxOffset);
      return {
        dayOfWeek: row.dayOfWeek,
        startHour: startMinute / 60,
        startTime: minutesToScheduleHHMM(startMinute),
        isNight: startMinute >= nightStartHour * 60,
        ...(row.column ? scheduleColumnTarget(row.column) : {}),
      };
    },
    [nightStartHour, startHour, totalMinutes],
  );

  function handlePrevDay() {
    if (!daySelector) return;
    if (hasPrevWeek && onPrevWeek) onPrevWeek();
  }

  function handleNextDay() {
    if (!daySelector) return;
    if (hasNextWeek && onNextWeek) onNextWeek();
  }

  return (
    <section className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <ScheduleLegend
            colorScheme={colorScheme}
            groupBy={groupBy}
            aircraftColumns={aircraftColumns}
            instructorColumns={instructorColumns}
          />
        </div>
        {!daySelector && (onPrevWeek || onNextWeek) ? (
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
        ) : null}
      </div>
      {daySelector ? (
        <div className="mb-3 flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevDay}
            disabled={!hasPrevWeek}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
            title="Semana anterior"
          >
            ‹
          </button>
          <div className="flex min-w-0 flex-1 gap-0.5 sm:gap-1">
          {DAY_ORDER.map((day) => {
            const date = dayOfWeekToDate(daySelector.weekStart, day);
            const today = isDateToday(date);
            const selected = day === daySelector.selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => daySelector.onSelectDay(day)}
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
            disabled={!hasNextWeek}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
            title="Proxima semana"
          >
            ›
          </button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
          Nenhum voo no período.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: `${boardMinWidth + 148}px`, width: "100%" }}>
            {/* Régua de horas */}
            {layout.map(({ row, entries, laneCount }) => (
              row.kind === "day" ? (
                <div key={row.key} className="mt-2 flex items-stretch rounded border border-sky-500/20 bg-sky-500/10 text-xs font-semibold uppercase tracking-wider text-sky-200">
                  <div className="flex w-24 shrink-0 items-center px-3 py-2 sm:w-36">
                    {row.dayLabel ?? row.label}
                  </div>
                  <div className="relative min-w-0 flex-1" style={{ minWidth: `${boardMinWidth}px` }}>
                    {hours.map((hour, idx) => (
                      <span
                        key={`${row.key}-scale-${hour}`}
                        className="absolute top-1/2 -translate-y-1/2 text-[10px] font-mono text-sky-100/80"
                        style={{ left: `${(idx / Math.max(1, hours.length)) * 100}%` }}
                      >
                        {hour}h
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
              <div key={row.key} className="flex items-stretch border-t border-slate-800/60 py-1">
                <div className="flex w-24 shrink-0 flex-col items-end justify-center pr-1 text-right sm:w-36 sm:pr-2">
                  <span className="max-w-full truncate text-[11px] font-semibold text-slate-300">{row.label}</span>
                  {row.summaryLabel ? <span className="max-w-full truncate text-[10px] font-normal text-slate-500">{row.summaryLabel}</span> : null}
                  {row.projectionCell ? (
                    <span className={`mt-0.5 max-w-full truncate rounded border px-1 py-0.5 text-xs font-semibold tabular-nums ${aircraftProjectionCellClass(row.projectionCell.maintenance)}`}>
                      {row.projectionCell.hours == null ? "—" : `${row.projectionCell.hours.toFixed(1)}h`}
                      {row.projectionCell.maintenance ? ` · ${row.projectionCell.maintenance}` : ""}
                    </span>
                  ) : null}
                </div>
                <div
                  ref={(node) => {
                    if (node) rowBoardRefs.current.set(row.key, node);
                    else rowBoardRefs.current.delete(row.key);
                  }}
                  className="relative min-w-0 flex-1 overflow-hidden rounded border border-slate-700/60 bg-slate-950/40"
                  style={{ minWidth: `${boardMinWidth}px`, height: `${laneCount * laneHeight + 8}px` }}
                  onClick={(event) => {
                    if (!onEmptySlotClick) return;
                    const target = resolveDropTarget(row, event.clientX);
                    if (target) onEmptySlotClick(target);
                  }}
                >
                  {nightStartHour < endHour && nightStartHour >= startHour ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-indigo-950/25"
                      style={{ left: `${(((nightStartHour - startHour) * 60) / totalMinutes) * 100}%` }}
                    />
                  ) : null}
                  {hours.map((hour, idx) => (
                    <div
                      key={`${row.key}-${hour}`}
                      className="absolute inset-y-0 border-l border-slate-700/40"
                      style={{ left: `${(idx / Math.max(1, hours.length)) * 100}%` }}
                    />
                  ))}
                  {entries.map(({ item, lane }) => {
                    const startMinutes = parseScheduleTimeToMinutes(item.startTime);
                    const leftPercent = ((startMinutes - startHour * 60) / totalMinutes) * 100;
                    const widthPercent = ((item.durationHours * 60) / totalMinutes) * 100;
                    const color = getItemColor(item);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        {...scheduleTooltipHandlers(item, setTooltip)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tooltipOnlyClick) {
                            setTooltip({ item, x: e.clientX, y: e.clientY });
                            return;
                          }
                          onItemClick(item);
                        }}
                        className={`absolute ${eventStyleClasses(color, calendarItemUnassigned(item), false)}`}
                        style={{
                          left: `calc(${Math.max(0, leftPercent)}% + 2px)`,
                          top: `${lane * laneHeight + 4}px`,
                          height: `${laneHeight - 8}px`,
                          width: `max(44px, calc(${widthPercent}% - 4px))`,
                        }}
                      >
                        <p className="flex min-w-0 items-center gap-1 font-semibold text-white">
                          <span className="truncate">{calendarStudentTitle(item.studentLabel, item.isOutsideGenerator)}</span>
                          {clubMemberByStudentId?.[item.studentId] ? <FlightReviewClubBadge /> : null}
                        </p>
                        <p className="truncate opacity-90">
                          {showDayInItems ? `${DAY_LABEL[item.dayOfWeek]} ` : ""}{item.startTime}–{item.endTime} · {groupBy === "instructor" ? item.aircraftRegistration : shortName(item.instructorLabel) || "Sem instrutor"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              )
            ))}
          </div>
        </div>
      )}
      <ScheduleItemTooltipCard state={tooltip} />
    </section>
  );
}

type ScheduleFlightsTabProps = {
  /** Semana a exibir após publicar escala no gerador. */
  focusWeekStart?: string | null;
  onFocusWeekConsumed?: () => void;
  /** Vitrine somente leitura: agenda + filtros, sem edição. */
  publicDisplayMode?: boolean;
};

export function ScheduleFlightsTab({ focusWeekStart = null, onFocusWeekConsumed, publicDisplayMode = false }: ScheduleFlightsTabProps = {}) {
  const readOnlyDisplay = publicDisplayMode;
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
  // Troca de semana com dados já carregados: atualiza em segundo plano (sem skeleton/scroll)
  const [weekRefreshing, setWeekRefreshing] = useState(false);
  const [flights, setFlights] = useState<ExistingScheduledFlight[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<string[]>([]);
  const [visibleInstructors, setVisibleInstructors] = useState<string[]>([]);
  // Padrao da aba Escala: semanal (diária no mobile), por aviao, cores por status e timeline normal.
  const [agendaView, setAgendaView] = useState<"weekly" | "three-day" | "daily">(() => (isMobileViewport() ? "daily" : "weekly"));
  const [scheduleGroupBy, setScheduleGroupBy] = useState<ScheduleGroupBy>("aircraft");
  const [hideCancelledFlights, setHideCancelledFlights] = useState(false);
  const [colorScheme, setColorScheme] = useState<"aircraft" | "status">("status");
  const [invertedTimeline, setInvertedTimeline] = useState(false);
  // Mobile: resumos recolhidos por padrão
  const [mobileAircraftSummaryOpen, setMobileAircraftSummaryOpen] = useState(false);
  const [mobileInstructorSummaryOpen, setMobileInstructorSummaryOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());
  const [error, setError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<FlightFormDraft | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const isMobile = useIsMobileViewport();
  // Mobile: subaba do modal de detalhes ("Voo" = formulário, "Aluno" = resumo).
  const [modalMobileTab, setModalMobileTab] = useState<"voo" | "aluno">("voo");
  // Bloqueio de agenda (modo SAGA): cria um evento comum no SAGA com o usuário de bloqueio.
  const [blockDraft, setBlockDraft] = useState<{
    aircraftRegistration: string;
    date: string;
    startTime: string;
    endTime: string;
    notes: string;
  } | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formConflicts, setFormConflicts] = useState<DetectedFlightConflict[]>([]);
  const [forceSaveWithConflict, setForceSaveWithConflict] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [clubMemberByStudentId, setClubMemberByStudentId] = useState<Record<string, boolean>>({});
  const clubMembershipCacheRef = useRef<Map<string, boolean>>(new Map());
  const [scheduleRules, setScheduleRules] = useState<FlightScheduleRules>(DEFAULT_FLIGHT_SCHEDULE_RULES);
  const [sagaSyncLogs, setSagaSyncLogs] = useState<SagaScheduleSyncLogItem[]>([]);
  const [formStudentCreditTotals, setFormStudentCreditTotals] = useState<StudentCreditStatement["totals"] | null>(null);
  const [formStudentCreditsLoading, setFormStudentCreditsLoading] = useState(false);
  const [formStudentSagaScheduledFlights, setFormStudentSagaScheduledFlights] = useState<FormStudentScheduledFlight[] | null>(null);
  const salesConfigFlagRef = useRef<{ at: number; nightDifferent: boolean } | null>(null);
  // Horas totais atuais por aeronave (mesmo cálculo da Frota) — base da projeção na agenda
  const [aircraftBaseHours, setAircraftBaseHours] = useState<Map<string, AircraftBaseHours> | null>(null);
  const [projectionHoursSource, setProjectionHoursSource] = useState<ProjectionHoursSource>("system");
  const [planeIt, setPlaneIt] = useState<PlaneItTotalsState>({ loading: false, error: null, totals: {} });
  const aircraftBaseHoursRequestedRef = useRef(false);
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
  // Admin/instrutor escolhem o início em meio-slot (slot 30min → opções de 15 em 15).
  const threeDayStartIndex = Math.min(
    Math.max(DAY_ORDER.indexOf(selectedDay as (typeof DAY_ORDER)[number]), 0),
    DAY_ORDER.length - 1,
  );
  const threeDayWindow = DAY_ORDER.slice(threeDayStartIndex, threeDayStartIndex + 3);
  const selectedWeekIndex = weekOptions.findIndex((w) => w.weekStart === selectedWeekStart);
  const hasPreviousWeek = selectedWeekIndex > 0;
  const hasNextWeek = selectedWeekIndex >= 0 && selectedWeekIndex < weekOptions.length - 1;

  // Deslize horizontal disparado SÓ pelas setas de navegação (não ao selecionar
  // um dia no cabeçalho da visão diária).
  const { ref: boardSlideRef, slide: slideBoard } = useDirectionalSlide();

  useEffect(() => {
    if (!error || error === lastErrorToastRef.current) return;
    lastErrorToastRef.current = error;
    showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const runSagaScheduleSync = useCallback(
    async (
      flightId: string,
      mode: SagaScheduleSyncMode,
      options: { allowCreate?: boolean; sagaScheduleId?: string | null; notes?: string } = {},
    ) => {
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

  // Cache de semanas (+ eventos SAGA, que cobrem 3 meses numa chamada só). A semana
  // anterior e a seguinte são pré-carregadas em segundo plano para troca instantânea.
  const WEEK_BUNDLE_TTL_MS = 60_000;
  type WeekBundle = {
    at: number;
    data: ScheduleWeekData;
    rows: ExistingScheduledFlight[];
    schedule: FlightScheduleRules;
    aircraftRows: Aircraft[];
  };
  const weekBundleCacheRef = useRef(new Map<string, WeekBundle>());
  const weekFetchInFlightRef = useRef(new Map<string, Promise<WeekBundle>>());
  // Opções de filtro já apresentadas — preserva a seleção do usuário entre semanas.
  const seenFilterAircraftRef = useRef<Set<string>>(new Set());
  const seenFilterInstructorsRef = useRef<Set<string>>(new Set());

  // Busca de eventos SAGA (3 meses numa chamada) via cache compartilhado em módulo:
  // sobrevive à troca de aba e pode ser aquecido pelo prefetch pós-login.
  const getSagaEvents = useCallback(
    (force = false): Promise<SagaDirectScheduleItem[]> => getSagaScheduleEventsCached(3, { force }),
    [],
  );

  const fetchWeekBundle = useCallback(
    async (weekStart: string, weekOption?: ScheduleWeekOption, force = false): Promise<WeekBundle> => {
      if (!actorUserId || !actorRole) throw new Error("Sessão indisponível.");
      const cached = weekBundleCacheRef.current.get(weekStart);
      if (!force && cached && Date.now() - cached.at < WEEK_BUNDLE_TTL_MS) return cached;
      if (!force) {
        const inflight = weekFetchInFlightRef.current.get(weekStart);
        if (inflight) return inflight;
      }

      const promise = (async (): Promise<WeekBundle> => {
        const [data, rules, aircraftRows] = await Promise.all([
          getScheduleWeekDataCached({
            weekStart,
            actorUserId,
            actorRole,
            scope: "flights-only",
            week: weekOption,
          }, { force }),
          getSchoolRules().catch(() => ({ schedule: DEFAULT_FLIGHT_SCHEDULE_RULES })),
          listAircrafts(schoolId).catch(() => []),
        ]);

        let weekFlights = data.existingGeneratedFlights;
        if (rules.schedule.sagaOnlySchedule) {
          // Escala somente no SAGA: uma busca cobre 3 meses — cache compartilhado entre semanas.
          const events = await getSagaEvents(force);
          const weekEnd = weekDateFromStart(weekStart, 0); // domingo da semana
          weekFlights = events
            .map(sagaEventToScheduledFlight)
            .filter((row): row is ExistingScheduledFlight =>
              Boolean(row && row.date >= weekStart && row.date <= weekEnd),
            );
        }

        const rows = [...weekFlights].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.startTime.localeCompare(b.startTime);
        });
        const bundle: WeekBundle = { at: Date.now(), data, rows, schedule: rules.schedule, aircraftRows };
        weekBundleCacheRef.current.set(weekStart, bundle);
        return bundle;
      })();

      weekFetchInFlightRef.current.set(weekStart, promise);
      try {
        return await promise;
      } finally {
        weekFetchInFlightRef.current.delete(weekStart);
      }
    },
    [actorRole, actorUserId, getSagaEvents],
  );

  const prefetchAdjacentWeeks = useCallback(
    (weekStart: string) => {
      const options = weekOptionsRef.current;
      const idx = options.findIndex((row) => row.weekStart === weekStart);
      for (const neighborIdx of [idx - 1, idx + 1]) {
        const neighbor = options[neighborIdx];
        if (!neighbor) continue;
        const cached = weekBundleCacheRef.current.get(neighbor.weekStart);
        if (cached && Date.now() - cached.at < WEEK_BUNDLE_TTL_MS) continue;
        void fetchWeekBundle(neighbor.weekStart, neighbor).catch(() => undefined);
      }
    },
    [fetchWeekBundle],
  );

  // Aplica um bundle na tela preservando os filtros do usuário: opções novas
  // entram visíveis, mas o que ele desmarcou continua desmarcado entre semanas.
  const applyWeekBundle = useCallback((bundle: WeekBundle) => {
    setScheduleRules(bundle.schedule);
    setWeekData(bundle.data);
    setFlights(bundle.rows);
    const actives = bundle.aircraftRows.filter((aircraft) => aircraft.active !== false);
    setActiveAircrafts(actives);

    const activeRegistrationByIdent = new Map(actives.map((aircraft) => [normalizeAircraftIdent(aircraft.registration), aircraft.registration]));
    const aircraftOptionsAll: string[] = [];
    const seenAircraftIdents = new Set<string>();
    const addAircraftOption = (registration: string | null | undefined) => {
      const ident = normalizeAircraftIdent(registration);
      if (!ident || seenAircraftIdents.has(ident)) return;
      seenAircraftIdents.add(ident);
      aircraftOptionsAll.push(activeRegistrationByIdent.get(ident) ?? String(registration || "").trim().toUpperCase());
    };
    for (const aircraft of actives) addAircraftOption(aircraft.registration);
    for (const supply of bundle.data.supplies) addAircraftOption(supply.aircraftRegistration);
    for (const row of bundle.rows) addAircraftOption(row.aircraftRegistration);
    if (seenFilterAircraftRef.current.size === 0) {
      setVisibleAircraft(aircraftOptionsAll);
    } else {
      const fresh = aircraftOptionsAll.filter((registration) => !seenFilterAircraftRef.current.has(registration));
      if (fresh.length > 0) setVisibleAircraft((prev) => Array.from(new Set([...prev, ...fresh])));
    }
    for (const registration of aircraftOptionsAll) seenFilterAircraftRef.current.add(registration);

    const instructorOptionsAll = Array.from(new Set([
      "__none__",
      ...bundle.data.instructors.map((s) => s.userId),
      ...bundle.rows.map((row) => row.instructorId ?? "").filter(Boolean),
    ]));
    if (seenFilterInstructorsRef.current.size === 0) {
      setVisibleInstructors(instructorOptionsAll);
    } else {
      const fresh = instructorOptionsAll.filter((id) => !seenFilterInstructorsRef.current.has(id));
      if (fresh.length > 0) setVisibleInstructors((prev) => Array.from(new Set([...prev, ...fresh])));
    }
    for (const id of instructorOptionsAll) seenFilterInstructorsRef.current.add(id);
  }, []);

  const loadWeek = useCallback(
    async (weekStart: string, weekOverride?: ScheduleWeekOption, options?: { showSkeleton?: boolean; force?: boolean }) => {
      if (!actorUserId || !actorRole || !weekStart) return;

      const requestId = loadWeekRequestRef.current + 1;
      loadWeekRequestRef.current = requestId;
      const weekOption = weekOverride ?? weekOptionsRef.current.find((row) => row.weekStart === weekStart);
      const cached = options?.force ? undefined : weekBundleCacheRef.current.get(weekStart);
      setError(null);

      // Stale-while-revalidate: qualquer cache (mesmo vencido) entra na hora, sem
      // esmaecer nem mexer no scroll; a atualização acontece em segundo plano.
      if (cached) {
        // Limpa indicadores de navegações anteriores que foram superadas (o guard de
        // requestId delas impede que limpem sozinhas) — senão o opacity-60 fica preso.
        setLoadingWeekData(false);
        setWeekRefreshing(false);
        applyWeekBundle(cached);
        prefetchAdjacentWeeks(weekStart);
        if (Date.now() - cached.at < WEEK_BUNDLE_TTL_MS) return;
      } else if (options?.showSkeleton === true || weekDataRef.current === null) {
        setLoadingWeekData(true);
      } else {
        setWeekRefreshing(true);
      }

      try {
        const bundle = await fetchWeekBundle(weekStart, weekOption, options?.force === true);
        if (loadWeekRequestRef.current !== requestId) return;
        applyWeekBundle(bundle);
        prefetchAdjacentWeeks(weekStart);
      } catch (e) {
        if (loadWeekRequestRef.current !== requestId) return;
        if (!cached) {
          setError((e as Error).message);
          setWeekData(null);
          setActiveAircrafts([]);
          setFlights([]);
        }
      } finally {
        if (loadWeekRequestRef.current === requestId) {
          setLoadingWeekData(false);
          setWeekRefreshing(false);
        }
      }
    },
    [actorRole, actorUserId, fetchWeekBundle, prefetchAdjacentWeeks, applyWeekBundle],
  );

  const loadWeekRef = useRef(loadWeek);
  loadWeekRef.current = loadWeek;

  // Navega ±1 semana mantendo a página no lugar (refresh em segundo plano).
  const goToWeekOffset = useCallback(
    (offset: -1 | 1) => {
      const options = weekOptionsRef.current;
      const idx = options.findIndex((w) => w.weekStart === selectedWeekStart);
      const target = options[idx + offset];
      if (!target) return;
      setSelectedWeekStart(target.weekStart);
      void loadWeekRef.current(target.weekStart, target, { showSkeleton: false });
    },
    [selectedWeekStart],
  );

  const goToPreviousThreeDayPeriod = useCallback(() => {
    const targetIndex = threeDayStartIndex - 3;
    if (targetIndex >= 0) {
      setSelectedDay(DAY_ORDER[targetIndex]!);
      return;
    }
    if (hasPreviousWeek) {
      setSelectedDay(DAY_ORDER[Math.max(0, DAY_ORDER.length - 3)]!);
      goToWeekOffset(-1);
    }
  }, [goToWeekOffset, hasPreviousWeek, threeDayStartIndex]);

  const goToNextThreeDayPeriod = useCallback(() => {
    const targetIndex = threeDayStartIndex + 3;
    if (targetIndex < DAY_ORDER.length) {
      setSelectedDay(DAY_ORDER[targetIndex]!);
      return;
    }
    if (hasNextWeek) {
      setSelectedDay(DAY_ORDER[0]!);
      goToWeekOffset(1);
    }
  }, [goToWeekOffset, hasNextWeek, threeDayStartIndex]);

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
    weekBundleCacheRef.current.clear();
    invalidateSagaScheduleEvents();
    seenFilterAircraftRef.current.clear();
    seenFilterInstructorsRef.current.clear();
  }, [actorUserId]);

  const planeItIds = useMemo(
    () => Array.from(new Set(activeAircrafts.map((aircraft) => aircraft.plane_it_id?.trim()).filter((id): id is string => Boolean(id)))),
    [activeAircrafts],
  );

  useEffect(() => {
    let cancelled = false;
    if (!planeItIds.length) {
      setPlaneIt({ loading: false, error: null, totals: {} });
      return;
    }
    setPlaneIt((current) => ({ ...current, loading: true, error: null }));
    fetchPlaneItAircraftTotals(planeItIds)
      .then((result) => {
        if (!cancelled) setPlaneIt({ loading: false, error: null, totals: result.totals });
      })
      .catch((err) => {
        if (!cancelled) {
          setPlaneIt({ loading: false, error: err instanceof Error ? err.message : "Falha ao carregar Plane It.", totals: {} });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planeItIds.join("|")]);

  const planeItHoursByRegistration = useMemo(() => {
    const rows = new Map<string, number>();
    for (const aircraft of activeAircrafts) {
      const planeItId = aircraft.plane_it_id?.trim();
      if (!planeItId) continue;
      const hours = planeIt.totals[planeItId]?.horasVooEtapaDecimalTotal;
      if (hours == null || !Number.isFinite(hours)) continue;
      rows.set(aircraft.registration.trim().toUpperCase(), hours);
    }
    return rows;
  }, [activeAircrafts, planeIt.totals]);

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

  // Apelido (nickname) do aluno por userId — vazio quando não há. Os perfis já vêm
  // carregados em weekData, então este mapa não adiciona nenhuma leitura extra.
  const studentNicknameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of weekData?.students ?? []) {
      const nick = (student.nickname ?? "").trim();
      if (nick) map.set(student.userId, nick);
    }
    return map;
  }, [weekData]);

  // Nome de exibição da escala: prefere o apelido; cai no nome completo quando não há.
  // O `label` (nome completo) segue intacto no formulário/persistência — só o display
  // da agenda usa o apelido.
  const studentDisplayName = useCallback(
    (studentId: string, fallback: string | null | undefined): string =>
      studentNicknameById.get(studentId) || studentLabelMap.get(studentId) || fallback || studentId,
    [studentNicknameById, studentLabelMap],
  );
  const instructorDisplayName = useCallback(
    (instructorId: string | null | undefined, fallback: string | null | undefined): string | null => {
      const identity = instructorId ? instructorById.get(instructorId) : null;
      return (identity?.nickname ?? "").trim() || fallback || identity?.label || instructorId || null;
    },
    [instructorById],
  );

  // Instrutores do cadastro da semana UNIÃO os que aparecem nos voos (ex.: eventos
  // SAGA fora do roster) — mesma ideia do aircraftOptions. É a fonte única de opções
  // do filtro e das colunas ao agrupar por instrutor, para nenhum voo ficar sem coluna.
  const instructorOptions = useMemo<Array<{ userId: string; label: string }>>(() => {
    const labelById = new Map<string, string>();
    for (const instructor of weekData?.instructors ?? []) labelById.set(instructor.userId, instructor.label);
    for (const row of flights) {
      if (row.instructorId && !labelById.has(row.instructorId)) {
        labelById.set(row.instructorId, row.instructorLabel ?? row.instructorId);
      }
    }
    const orderedIds = [
      ...(weekData?.instructors ?? []).map((instructor) => instructor.userId),
      ...flights.map((row) => row.instructorId ?? "").filter(Boolean),
    ];
    const seen = new Set<string>();
    const out: Array<{ userId: string; label: string }> = [];
    for (const id of orderedIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ userId: id, label: labelById.get(id) ?? id });
    }
    return out;
  }, [weekData, flights]);

  const aircraftOptions = useMemo(() => {
    const byRegistration = new Map<string, { registration: string; imageUrl: string | null; hasSupply: boolean }>();
    const activeRegistrationByIdent = new Map(activeAircrafts.map((aircraft) => [normalizeAircraftIdent(aircraft.registration), aircraft.registration]));
    for (const supply of weekData?.supplies ?? []) {
      const ident = normalizeAircraftIdent(supply.aircraftRegistration);
      const registration = activeRegistrationByIdent.get(ident) ?? supply.aircraftRegistration;
      if (!ident) continue;
      byRegistration.set(ident, {
        registration,
        imageUrl: supply.aircraftImageUrl ?? null,
        hasSupply: true,
      });
    }
    for (const aircraft of activeAircrafts) {
      const ident = normalizeAircraftIdent(aircraft.registration);
      if (!ident) continue;
      const current = byRegistration.get(ident);
      byRegistration.set(ident, {
        registration: aircraft.registration,
        imageUrl: current?.imageUrl ?? aircraft.image_url ?? null,
        hasSupply: Boolean(current?.hasSupply),
      });
    }
    for (const row of flights) {
      const registration = row.aircraftRegistration ?? "";
      const ident = normalizeAircraftIdent(registration);
      if (ident && !byRegistration.has(ident)) {
        byRegistration.set(ident, { registration: activeRegistrationByIdent.get(ident) ?? registration, imageUrl: null, hasSupply: false });
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

  const colorByAircraft = useMemo(
    () => buildAircraftScheduleColorMap(aircraftOptions.map((aircraft) => aircraft.registration)),
    [aircraftOptions],
  );

  const calendarAircraftColumns = useMemo<AircraftColumn[]>(
    () =>
      visibleAircraft.map((registration) => ({
        registration,
        colorClass: colorByAircraft.get(registration) ?? AIRCRAFT_COLOR_CLASSES[0]!,
      })),
    [colorByAircraft, visibleAircraft],
  );

  const borderByInstructor = useMemo(() => {
    const map = new Map<string, string>();
    instructorOptions.forEach((instructor, index) =>
      map.set(instructor.userId, INSTRUCTOR_BORDER_CLASSES[index % INSTRUCTOR_BORDER_CLASSES.length]!),
    );
    return map;
  }, [instructorOptions]);

  const calendarInstructorColumns = useMemo<ScheduleColumn[]>(() => {
    const rows: ScheduleColumn[] = instructorOptions
      .filter((instructor) => visibleInstructors.includes(instructor.userId))
      .map((instructor) => ({
        key: instructor.userId,
        label: shortName(instructorDisplayName(instructor.userId, instructor.label) ?? instructor.label, instructor.label),
        colorClass: borderByInstructor.get(instructor.userId) ?? "border-white/80",
        groupBy: "instructor",
        instructorId: instructor.userId,
      }));
    if (visibleInstructors.includes("__none__")) {
      rows.push({
        key: "__none__",
        label: "Sem instrutor",
        colorClass: "border-red-300",
        groupBy: "instructor",
        instructorId: null,
      });
    }
    return rows;
  }, [borderByInstructor, visibleInstructors, instructorOptions, instructorDisplayName]);

  const scheduleColumns = useMemo<ScheduleColumn[]>(
    () => {
      if (scheduleGroupBy === "none") {
        return [{
          key: "__day__",
          label: "Dia",
          colorClass: "border-slate-500",
          groupBy: "none",
        }];
      }
      return scheduleGroupBy === "aircraft"
        ? calendarAircraftColumns.map((aircraft) => ({
            key: aircraft.registration,
            label: aircraft.registration,
            colorClass: aircraft.colorClass,
            groupBy: "aircraft",
            aircraftRegistration: aircraft.registration,
          }))
        : calendarInstructorColumns;
    },
    [calendarAircraftColumns, calendarInstructorColumns, scheduleGroupBy],
  );

  // Cores dos cards: por avião (padrão) ou por status. Cancelado é sempre vermelho.
  const resolveItemColor = useCallback(
    (item: CalendarFlightItem): string => {
      // Bloqueio de agenda: cinza escuro (fora do padrão de status/aeronave e do que vem do SAGA).
      if (item.isBlocked) return "bg-neutral-800";
      const status = normalizeScheduleFlightStatus(item.flightStatus);
      if (status === "Cancelado") return "bg-red-700";
      if (colorScheme === "status") {
        return FLIGHT_STATUS_CARD_COLOR[status] ?? "bg-slate-600";
      }
      return calendarItemColor({ ...item, flightStatus: status }, colorByAircraft);
    },
    [colorScheme, colorByAircraft],
  );

  // Tempo de voo líquido (acionamento→corte): linhas do SAGA carregam o bloco
  // completo com briefing/debriefing, que não deve entrar nas somas de horas.
  const netFlightHours = useCallback(
    (row: ExistingScheduledFlight) => {
      if (!isSagaEventRowId(row.id)) return row.durationHours;
      return sagaEffectiveFlightMinutes(row.durationHours * 60, scheduleRules) / 60;
    },
    [scheduleRules],
  );

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
    const cachedMap: Record<string, boolean> = {};
    const missing = studentIds.filter((studentId) => {
      const cached = clubMembershipCacheRef.current.get(studentId);
      if (cached === undefined) return true;
      cachedMap[studentId] = cached;
      return false;
    });
    setClubMemberByStudentId(cachedMap);
    if (missing.length === 0) return;

    const run = () => {
      void Promise.all(missing.map((studentId) => listStudentTrainingTracks(studentId).catch(() => ({ data: [] })))).then((results) => {
        if (cancelled) return;
        const next: Record<string, boolean> = { ...cachedMap };
        missing.forEach((studentId, index) => {
          const isMember = hasActiveFlightReviewClubTrack(results[index]?.data);
          clubMembershipCacheRef.current.set(studentId, isMember);
          next[studentId] = isMember;
        });
        setClubMemberByStudentId(next);
      });
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleId = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(run, { timeout: 2500 })
      : window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [weekData?.students]);

  // Cada abertura do modal gera um demandId novo — volta para a subaba "Voo" no mobile.
  useEffect(() => {
    if (formDraft) setModalMobileTab("voo");
  }, [formDraft?.demandId]);

  useEffect(() => {
    const studentId = formDraft?.studentId;
    if (!formDraft || !studentId || !user?.id || !user?.role) {
      setFormStudentCreditTotals(null);
      setFormStudentCreditsLoading(false);
      setFormStudentSagaScheduledFlights(null);
      return;
    }
    let cancelled = false;
    setFormStudentCreditTotals(null);
    setFormStudentSagaScheduledFlights(scheduleRules.sagaOnlySchedule ? null : []);
    setFormStudentCreditsLoading(true);
    void (async () => {
      try {
        // Mesmo cálculo da aba Créditos: o flag nightHoursDifferentFromDay muda o modo do extrato.
        if (!salesConfigFlagRef.current || Date.now() - salesConfigFlagRef.current.at > 5 * 60_000) {
          const config = await getFlightCreditSalesConfig().catch(() => null);
          salesConfigFlagRef.current = { at: Date.now(), nightDifferent: config?.nightHoursDifferentFromDay !== false };
        }
        const stmt = await getStudentCreditStatement({
          viewer: { userId: user.id, role: user.role },
          studentUserId: studentId,
          nightHoursDifferentFromDay: salesConfigFlagRef.current.nightDifferent,
        });
        if (cancelled) return;
        setFormStudentCreditTotals(stmt.totals);
      } catch {
        if (!cancelled) setFormStudentCreditTotals(null);
      } finally {
        if (!cancelled) setFormStudentCreditsLoading(false);
      }

      // Voos futuros já agendados (modo SAGA): bloco − buffers, para projeção de saldo.
      if (!scheduleRules.sagaOnlySchedule) return;
      try {
        const events = await getSagaScheduleEventsCached(3);
        if (cancelled) return;
        const now = Date.now();
        const scheduled: FormStudentScheduledFlight[] = [];
        for (const event of events) {
          if (sagaEventIsCancelled(event)) continue;
          if ((event.studentUserId || `${SAGA_STUDENT_ID_PREFIX}${event.studentSagaId}`) !== studentId) continue;
          if (formDraft.sagaScheduleId && event.id === formDraft.sagaScheduleId) continue;
          const start = sagaDirectDateTimeParts(event.startAtRaw || event.startAt);
          const end = sagaDirectDateTimeParts(event.endAtRaw || event.endAt);
          if (!start.date || !start.time) continue;
          const startMs = scheduledFlightMs(start.date, start.time);
          if (!Number.isFinite(startMs) || startMs <= now) continue;
          const startMin = parseScheduleTimeToMinutes(start.time);
          let endMin = end.time ? parseScheduleTimeToMinutes(end.time) : startMin + 60;
          if (end.date && end.date > start.date) endMin += 1440;
          const netMinutes = sagaEffectiveFlightMinutes(endMin - startMin, scheduleRules);
          scheduled.push({
            flightDate: start.date,
            startTime: start.time,
            hours: netMinutes / 60,
          });
        }
        scheduled.sort((a, b) => scheduledFlightMs(a.flightDate, a.startTime) - scheduledFlightMs(b.flightDate, b.startTime));
        setFormStudentSagaScheduledFlights(scheduled);
      } catch {
        if (!cancelled) setFormStudentSagaScheduledFlights(null);
      }
    })();
    return () => { cancelled = true; };
  // formDraft?.demandId changes each time the modal opens (new demandId per session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDraft?.demandId, formDraft?.studentId, user?.id, user?.role, scheduleRules.sagaOnlySchedule]);

  const formStudentScheduledFlights = useMemo((): FormStudentScheduledFlight[] | null => {
    const studentId = formDraft?.studentId;
    if (!studentId) return null;
    if (scheduleRules.sagaOnlySchedule) return formStudentSagaScheduledFlights;

    const now = Date.now();
    const excludeLocalId = formDraft?.id;
    const scheduled: FormStudentScheduledFlight[] = [];
    for (const row of flights) {
      if (row.studentId !== studentId) continue;
      if (row.flightStatus === "Cancelado") continue;
      if (excludeLocalId && row.id === excludeLocalId) continue;
      const startMs = scheduledFlightMs(row.date, row.startTime);
      if (!Number.isFinite(startMs) || startMs <= now) continue;
      scheduled.push({
        flightDate: row.date,
        startTime: row.startTime,
        hours: netFlightHours(row),
      });
    }
    scheduled.sort((a, b) => scheduledFlightMs(a.flightDate, a.startTime) - scheduledFlightMs(b.flightDate, b.startTime));
    return scheduled;
  }, [
    formDraft?.studentId,
    formDraft?.id,
    flights,
    scheduleRules.sagaOnlySchedule,
    formStudentSagaScheduledFlights,
    netFlightHours,
  ]);

  const formStudentCreditDisplay = useMemo(() => {
    if (!formDraft || !formStudentCreditTotals) return null;

    const totals = formStudentCreditTotals;
    const studentBalance = totals.balanceHours ?? Number(
      (totals.purchasedHours - totals.consumedHours - (totals.penaltyHours ?? 0)).toFixed(2),
    );
    const purchasedHours = totals.purchasedHours;
    const usedHours = totals.consumedHours + (totals.penaltyHours ?? 0);

    const flightDate = formDraft.dateIso || (weekData ? weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek) : "");
    const durationMinutes = Math.round(formDraft.durationHours * 60);
    const thisFlightHours = scheduleRules.sagaOnlySchedule
      ? sagaEffectiveFlightMinutes(durationMinutes, scheduleRules) / 60
      : formDraft.durationHours;
    const currentFlightActive = formDraft.flightStatus !== "Cancelado";
    const currentFlightMs = flightDate && formDraft.startTime
      ? scheduledFlightMs(flightDate, formDraft.startTime)
      : NaN;

    const scheduled = formStudentScheduledFlights ?? [];
    const scheduledBeforeHours = Number(
      scheduled
        .filter((flight) => Number.isFinite(currentFlightMs) && scheduledFlightMs(flight.flightDate, flight.startTime) < currentFlightMs)
        .reduce((sum, flight) => sum + flight.hours, 0)
        .toFixed(2),
    );
    const otherScheduledHours = Number(scheduled.reduce((sum, flight) => sum + flight.hours, 0).toFixed(2));
    const activeThisFlightHours = currentFlightActive ? thisFlightHours : 0;
    const allScheduledHours = Number((otherScheduledHours + activeThisFlightHours).toFixed(2));
    const balanceAfterThisFlight = Number((studentBalance - activeThisFlightHours - scheduledBeforeHours).toFixed(2));
    const balanceAfterAllScheduled = Number((studentBalance - allScheduledHours).toFixed(2));

    return {
      studentBalance,
      balanceAfterThisFlight,
      purchasedHours,
      usedHours,
      thisFlightHours: activeThisFlightHours,
      scheduledBeforeHours,
      allScheduledHours,
      balanceAfterAllScheduled,
    };
  }, [formDraft, formStudentCreditTotals, formStudentScheduledFlights, weekData, scheduleRules]);

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
            flightHours: netFlightHours(row),
            studentLabel: studentDisplayName(row.studentId, row.studentLabel),
            instructorId: row.instructorId,
            instructorLabel: instructorDisplayName(row.instructorId, row.instructorLabel),
            totalWeightLabel: totalWeightByFlightId.get(row.id) ?? "—",
            aircraftRegistration: row.aircraftRegistration ?? "Aeronave",
            dayOfWeek,
            startHour,
            durationHours: row.durationHours,
            flightStatus: normalizeScheduleFlightStatus(row.flightStatus),
            startTime: row.startTime,
            endTime: hoursToHHMM(startHour + row.durationHours),
            isNight: row.isNight ?? false,
            isOutsideGenerator: row.isOutsideGenerator ?? false,
            isBlocked: row.isBlocked ?? false,
            notes: row.notes ?? null,
          };
        }),
    [flights, hideCancelledFlights, studentDisplayName, instructorDisplayName, totalWeightByFlightId, visibleAircraft, visibleInstructors, netFlightHours],
  );

  const cancelledFlightCount = useMemo(
    () => flights.filter((row) => row.flightStatus === "Cancelado").length,
    [flights],
  );

  // Carrega as horas-base das aeronaves uma vez (cálculo da Frota), em segundo plano.
  useEffect(() => {
    if (!actorUserId || aircraftBaseHoursRequestedRef.current) return;
    aircraftBaseHoursRequestedRef.current = true;
    void loadFleetMaintenanceContextCached(schoolId)
      .then(({ baseHours }) => setAircraftBaseHours(new Map(baseHours.map((row) => [row.registration.trim().toUpperCase(), row]))))
      .catch(() => setAircraftBaseHours(new Map())); // falha: projeção mostra "—" em vez de skeleton eterno
  }, [actorUserId]);

  // Projeção de horas totais por aeronave (tipo avião) ao fim de cada dia da semana:
  // horas atuais (Frota) + tempo de voo agendado (sem briefing/debriefing) até o dia.
  const projectionRows = useMemo(() => {
    if (!weekData || !aircraftBaseHours) return [];
    const buffers = (scheduleRules.bufferBeforeMinutes + scheduleRules.bufferAfterMinutes) / 60;
    const now = Date.now();
    type ProjEvent = { reg: string; date: string; hours: number };
    const events: ProjEvent[] = [];
    const sagaEvents = scheduleRules.sagaOnlySchedule ? peekSagaScheduleEvents(3) : null;
    if (sagaEvents) {
      for (const event of sagaEvents) {
        if (sagaEventIsCancelled(event)) continue;
        // Bloqueios de agenda não são voos: nunca somam na projeção de horas.
        if (sagaEventIsBlock(event)) continue;
        const start = sagaDirectDateTimeParts(event.startAtRaw || event.startAt);
        if (!start.date || !start.time) continue;
        const startMs = new Date(`${start.date}T${start.time}:00`).getTime();
        if (!Number.isFinite(startMs) || startMs <= now) continue;
        const end = sagaDirectDateTimeParts(event.endAtRaw || event.endAt);
        const startMin = parseScheduleTimeToMinutes(start.time);
        let endMin = end.time ? parseScheduleTimeToMinutes(end.time) : startMin + 60;
        if (end.date && end.date > start.date) endMin += 1440;
        events.push({
          reg: (event.aircraft || "").trim().toUpperCase(),
          date: start.date,
          hours: Math.max(0, (endMin - startMin) / 60 - buffers),
        });
      }
    } else {
      for (const row of flights) {
        if (row.flightStatus === "Cancelado" || row.flightStatus === "Realizado") continue;
        // Bloqueios de agenda não são voos: nunca somam na projeção de horas.
        if (row.isBlocked) continue;
        const startMs = new Date(`${row.date}T${row.startTime}:00`).getTime();
        if (!Number.isFinite(startMs) || startMs <= now) continue;
        events.push({
          reg: (row.aircraftRegistration ?? "").trim().toUpperCase(),
          date: row.date,
          hours: netFlightHours(row),
        });
      }
    }
    const baseWeekStart = weekData.week.weekStart;
    return activeAircrafts
      .filter((aircraft) => aircraft.type === "aviao")
      .map((aircraft) => {
        const reg = aircraft.registration.trim().toUpperCase();
        const info = aircraftBaseHours.get(reg);
        const base = projectionHoursSource === "planeIt"
          ? planeItHoursByRegistration.get(reg) ?? null
          : info?.hours ?? null;
        const dueList = info?.maintenanceDue ?? [];
        const hoursByDay: Partial<Record<number, ProjectionCell>> = {};
        if (base == null) {
          for (const day of DAY_ORDER) hoursByDay[day] = { hours: null };
        } else {
          const regEvents = events.filter((event) => event.reg === reg);
          // Acumulado anterior à semana (eventos futuros antes de segunda) para
          // detectar em qual dia a projeção CRUZA o vencimento da manutenção.
          let previous = base + regEvents
            .filter((event) => event.date < baseWeekStart)
            .reduce((sum, event) => sum + event.hours, 0);
          for (const day of DAY_ORDER) {
            const dayDate = weekDateFromStart(baseWeekStart, day);
            const value = Number((base + regEvents
              .filter((event) => event.date <= dayDate)
              .reduce((sum, event) => sum + event.hours, 0)).toFixed(1));
            // Quando mais de uma manutenção vence no mesmo dia (ex.: 600h também é
            // múltiplo da 100h), prevalece a de MAIOR intervalo — menor frequência.
            const hit = dueList
              .filter((item) => {
                const nextMultiple = (Math.floor(previous / item.intervalHours) + 1) * item.intervalHours;
                return nextMultiple <= value + 1e-9;
              })
              .sort((a, b) => b.intervalHours - a.intervalHours)[0];
            hoursByDay[day] = { hours: value, maintenance: hit ? hit.code : undefined };
            previous = value;
          }
        }
        return { registration: aircraft.registration, hoursByDay };
      });
  }, [weekData, aircraftBaseHours, scheduleRules, flights, activeAircrafts, netFlightHours, projectionHoursSource, planeItHoursByRegistration]);

  const projectionLoading = aircraftBaseHours === null || (projectionHoursSource === "planeIt" && planeIt.loading);

  // Linhas da agenda invertida (linha do tempo horizontal)
  const timelineRows = useMemo<TimelineRow[]>(() => {
    if (!invertedTimeline) return [];
    const days = agendaView === "three-day" ? threeDayWindow : DAY_ORDER;
    const activeDays: number[] = agendaView === "daily" ? [selectedDay] : [...days];
    const baseWeekStart = weekData?.week.weekStart ?? selectedWeekStart;
    const rows: TimelineRow[] = [];
    for (const day of activeDays) {
      const dayItems = calendarItems.filter((item) => item.dayOfWeek === day);
      if (dayItems.length === 0) continue;
      const dayLabel = `${DAY_LABEL[day]} ${formatShortDate(dayOfWeekToDate(baseWeekStart, day))}`;
      rows.push({
        key: `day-${day}`,
        label: dayLabel,
        dayLabel,
        kind: "day",
        items: [],
      });
      const columnsForDay = scheduleGroupBy === "none" ? scheduleColumns.slice(0, 1) : scheduleColumns;
      for (const column of columnsForDay) {
        const rowItems = scheduleGroupBy === "none" ? dayItems : dayItems.filter((item) => scheduleColumnItemMatches(item, column));
        if (rowItems.length === 0) continue;
        const hours = rowItems.reduce((sum, item) => sum + (item.flightHours ?? item.durationHours), 0);
        rows.push({
          key: `${day}-${column.key}`,
          label: column.label,
          kind: "group",
          dayOfWeek: day,
          column,
          items: rowItems,
          summaryLabel: `${rowItems.length} voo${rowItems.length === 1 ? "" : "s"} · ${hours.toFixed(1)}h`,
          projectionCell: scheduleGroupBy === "aircraft"
            ? projectionRows.find((row) => row.registration === column.aircraftRegistration)?.hoursByDay[day]
            : undefined,
        });
      }
    }
    return rows;
  }, [invertedTimeline, agendaView, calendarItems, selectedDay, threeDayWindow, weekData, selectedWeekStart, scheduleColumns, scheduleGroupBy, projectionRows]);

  const selectedSupplyForBackground = useMemo(() => {
    if (!weekData || visibleAircraft.length !== 1) return null;
    const reg = visibleAircraft[0];
    return weekData.supplies.find((supply) => supply.aircraftRegistration === reg) ?? null;
  }, [visibleAircraft, weekData]);

  const scheduleSummary = useMemo(() => {
    const totalStudentIds = new Set<string>();
    let totalHours = 0;
    let unassigned = 0;
    const aircraftStats = new Map<string, { flights: number; hours: number; students: Set<string> }>();
    const instructorStats = new Map<string, { flights: number; hours: number }>();
    const studentStats = new Map<string, { id: string; label: string; flights: number; hours: number }>();
    const activeStudentIds = new Set((weekData?.students ?? []).map((student) => student.userId));
    for (const student of weekData?.students ?? []) {
      studentStats.set(student.userId, { id: student.userId, label: student.label, flights: 0, hours: 0 });
    }
    for (const flight of flights) {
      const hours = netFlightHours(flight);
      totalHours += hours;
      totalStudentIds.add(flight.studentId);
      if (!flight.instructorId) unassigned += 1;

      const registration = flight.aircraftRegistration ?? "";
      if (registration) {
        const current = aircraftStats.get(registration) ?? { flights: 0, hours: 0, students: new Set<string>() };
        current.flights += 1;
        current.hours += hours;
        current.students.add(flight.studentId);
        aircraftStats.set(registration, current);
      }

      if (flight.instructorId) {
        const current = instructorStats.get(flight.instructorId) ?? { flights: 0, hours: 0 };
        current.flights += 1;
        current.hours += hours;
        instructorStats.set(flight.instructorId, current);
      }

      if (activeStudentIds.has(flight.studentId)) {
        const current = studentStats.get(flight.studentId);
        if (current) {
          current.flights += 1;
          current.hours += flight.durationHours;
          studentStats.set(flight.studentId, current);
        }
      }
    }
    const served = [...studentStats.values()].filter((row) => row.flights > 0).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const servedIds = new Set(served.map((row) => row.id));
    return {
      aircraftSummary: weekData
        ? aircraftOptions.map((aircraft) => {
            const stats = aircraftStats.get(aircraft.registration);
            return {
              registration: aircraft.registration,
              imageUrl: aircraft.imageUrl,
              flights: stats?.flights ?? 0,
              hours: Number((stats?.hours ?? 0).toFixed(1)),
              students: stats?.students.size ?? 0,
            };
          })
        : [],
      totalSummary: {
        flights: flights.length,
        hours: Number(totalHours.toFixed(1)),
        students: totalStudentIds.size,
      },
      instructorSummary: weekData
        ? weekData.instructors.map((instructor) => {
            const stats = instructorStats.get(instructor.userId);
            return { instructor, flights: stats?.flights ?? 0, hours: Number((stats?.hours ?? 0).toFixed(1)) };
          })
        : [],
      unassignedInstructorCount: unassigned,
      servedStudents: served,
      notServedStudents: weekData
        ? weekData.students.filter((row) => !servedIds.has(row.userId)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
        : [],
    };
  }, [aircraftOptions, flights, weekData, netFlightHours]);

  const aircraftSummary = scheduleSummary.aircraftSummary;
  const totalSummary = scheduleSummary.totalSummary;
  const instructorSummary = scheduleSummary.instructorSummary;
  const unassignedInstructorCount = scheduleSummary.unassignedInstructorCount;
  const servedStudents = scheduleSummary.servedStudents;
  const notServedStudents = scheduleSummary.notServedStudents;

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
    setFormMode("create");
    setFormDraft({
      demandId: `manual-${crypto.randomUUID()}`,
      studentId: "",
      studentLabel: "",
      ...resolveInstructorDraft(weekData.instructors, null),
      aircraftRegistration: firstAircraft.registration,
      dayOfWeek: selectedDay,
      dateIso: weekDateFromStart(weekData.week.weekStart, selectedDay),
      startTime: minutesToScheduleHHMM((SLOT_HOURS[0] ?? 6) * 60),
      startHour: SLOT_HOURS[0] ?? 6,
      durationHours: 1,
      // No modo SAGA o voo novo entra como "Planejado" (Previsto) por padrão.
      flightStatus: scheduleRules.sagaOnlySchedule ? "Previsto" : "Confirmado",
      isNight: false,
      notes: "",
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function openEditModal(row: ExistingScheduledFlight) {
    if (!canEditFlight) return;
    if (isSagaEventRowId(row.id)) {
      // Evento da agenda SAGA: não há documento local para carregar.
      setFormMode("edit");
      setFormDraft({
        id: row.id,
        demandId: row.demandId,
        studentId: row.studentId,
        studentLabel: row.studentLabel ?? row.studentId,
        instructorId: row.instructorId,
        instructorLabel: row.instructorLabel,
        instructorAnac: null,
        aircraftRegistration: row.aircraftRegistration ?? "",
        dayOfWeek: new Date(`${row.date}T12:00:00`).getDay(),
        dateIso: row.date,
        startTime: row.startTime,
        startHour: parseStartHour(row.startTime),
        durationHours: row.durationHours,
        isNight: row.isNight ?? false,
        sagaScheduleId: row.sagaScheduleId ?? null,
        flightStatus: row.flightStatus ?? "Confirmado",
        waiveCancellationPenalty: true,
        notes: row.notes ?? "",
      });
      setFormConflicts([]);
      setForceSaveWithConflict(false);
      return;
    }
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
      dateIso: row.date,
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
      waiveCancellationPenalty: true,
      notes:
        decoded?.schedule?.notes ??
        (typeof (decoded?.header as Record<string, unknown> | undefined)?.notes === "string"
          ? String((decoded?.header as Record<string, unknown>).notes)
          : decoded?.preFlight.objectiveMd ?? ""),
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function handleSaveForm() {
    if (!user || !weekData || !formDraft) return;
    setError(null);
    if (!normalizeTimeInput(formDraft.startTime)) {
      setError("Informe um horario de inicio valido.");
      return;
    }
    if (scheduleRules.sagaOnlySchedule && Math.round(formDraft.durationHours * 60) <= 0) {
      setError("O fim do bloco SAGA deve ser depois do inicio.");
      return;
    }
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
      if (scheduleRules.sagaOnlySchedule) {
        // Modo saga-only: cria/edita/cancela o evento direto na agenda SAGA,
        // sem criar voo, notificação ou sincronização local.
        const flightDate = formDraft.dateIso || weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek);
        const durationMinutes = Math.round(formDraft.durationHours * 60);
        const existingStatus = formDraft.id ? flights.find((row) => row.id === formDraft.id)?.flightStatus : undefined;
        if (formMode === "edit" && formDraft.flightStatus === "Cancelado" && existingStatus !== "Cancelado") {
          if (!formDraft.sagaScheduleId) throw new Error("Evento sem ID da agenda SAGA.");
          // Passa pela function de escala para aplicar multa/auditoria antes de remover no SAGA.
          await cancelScheduleFlight(formDraft.sagaScheduleId, {
            waivePenalty: formDraft.waiveCancellationPenalty,
            reason: [formDraft.cancellationReason, formDraft.cancellationReasonText].filter(Boolean).join(": "),
          });
          showToast({ variant: "success", message: "Evento cancelado na agenda SAGA." });
        } else {
          const isSagaStudent = formDraft.studentId.startsWith(SAGA_STUDENT_ID_PREFIX);
          const result = await upsertSagaScheduleDirect({
            scheduleId: formMode === "edit" ? formDraft.sagaScheduleId ?? null : null,
            aircraftIdent: formDraft.aircraftRegistration,
            ...(isSagaStudent
              ? {
                  studentSagaId: formDraft.studentId.slice(SAGA_STUDENT_ID_PREFIX.length),
                  studentName: formDraft.studentLabel || null,
                }
              : { studentUserId: formDraft.studentId }),
            instructorUserId: formDraft.instructorId,
            date: flightDate,
            startTime: formDraft.startTime,
            durationMinutes,
            sagaStatus: flightStatusToSagaStatus(formDraft.flightStatus),
            rawNotes: formDraft.notes,
          });
          showToast({ variant: "success", message: result.message });
        }
        setFormDraft(null);
        setFormConflicts([]);
        setForceSaveWithConflict(false);
        await loadWeek(weekData.week.weekStart, undefined, { showSkeleton: false, force: true });
        return;
      }

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
        const nextDate = formDraft.dateIso || weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek);
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
        void runSagaScheduleSync(formDraft.id, "upsert", {
          sagaScheduleId: formDraft.sagaScheduleId ?? null,
          notes: formDraft.notes,
        });
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
          void runSagaScheduleSync(result.id, "upsert", { allowCreate: true, notes: formDraft.notes });
          void dispatchNotificationEvent({
            eventType: "flight.scheduled",
            flightId: result.id,
            dedupeKey: `flight.scheduled:${result.id}:${Date.now()}`,
            recipientUserIds: [formDraft.studentId],
            actorUserId: user.id,
            data: {
              aircraft: formDraft.aircraftRegistration,
              flightDate: formDraft.dateIso || weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek),
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
      await loadWeek(weekData.week.weekStart, undefined, { showSkeleton: false, force: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFormSaving(false);
    }
  }

  function openBlockModal() {
    if (!weekData) return;
    const firstAircraft = aircraftOptions[0];
    if (!firstAircraft) {
      setError("Cadastre uma aeronave ativa para bloquear a agenda.");
      return;
    }
    setBlockDraft({
      aircraftRegistration: firstAircraft.registration,
      date: weekDateFromStart(weekData.week.weekStart, selectedDay),
      startTime: "08:00",
      endTime: "12:00",
      notes: "",
    });
  }

  async function handleSaveBlock() {
    if (!blockDraft) return;
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blockDraft.date)) {
      setError("Informe a data do bloqueio.");
      return;
    }
    const startMin = parseScheduleTimeToMinutes(blockDraft.startTime);
    const endMin = parseScheduleTimeToMinutes(blockDraft.endTime);
    if (!blockDraft.startTime || !blockDraft.endTime || endMin <= startMin) {
      setError("O fim do bloqueio deve ser depois do início.");
      return;
    }
    setBlockSaving(true);
    try {
      const result = await upsertSagaScheduleDirect({
        aircraftIdent: blockDraft.aircraftRegistration,
        studentSagaId: SAGA_BLOCK_USER_ID,
        studentName: SAGA_BLOCK_USER_NAME,
        instructorSagaId: SAGA_BLOCK_USER_ID,
        instructorName: SAGA_BLOCK_USER_NAME,
        date: blockDraft.date,
        startTime: blockDraft.startTime,
        durationMinutes: endMin - startMin,
        sagaStatus: "CONFIRMED",
        rawNotes: ["Bloqueio de agenda via plataforma", blockDraft.notes.trim()].filter(Boolean).join(" | ").slice(0, 255),
      });
      showToast({ variant: "success", message: result.message });
      setBlockDraft(null);
      if (weekData) await loadWeek(weekData.week.weekStart, undefined, { showSkeleton: false, force: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlockSaving(false);
    }
  }

  function handleCalendarItemClick(item: CalendarFlightItem) {
    if (readOnlyDisplay || !canEditFlight) return;
    const selected = flights.find((row) => row.id === item.id);
    if (selected) void openEditModal(selected);
  }

  async function handleDeleteFlight(row: ExistingScheduledFlight) {
    if (isSagaEventRowId(row.id)) {
      if (!window.confirm("Remover este evento da agenda SAGA?")) return;
      setError(null);
      try {
        await cancelSagaScheduleDirect(row.sagaScheduleId ?? row.id.slice(SAGA_EVENT_ID_PREFIX.length));
        showToast({ variant: "success", message: "Evento removido da agenda SAGA." });
        if (selectedWeekStart) await loadWeek(selectedWeekStart, undefined, { showSkeleton: false, force: true });
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
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
      if (selectedWeekStart) await loadWeek(selectedWeekStart, undefined, { showSkeleton: false, force: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Bloco de créditos do aluno — destaque no saldo atual e projeção após este voo.
  function renderStudentCreditsBlock() {
    if (!formDraft) return null;

    const scheduledLoading = scheduleRules.sagaOnlySchedule && formStudentScheduledFlights === null;
    const creditColor = (hours: number) => (
      hours > 0.001 ? "text-emerald-300" : hours < -0.001 ? "text-red-300" : "text-slate-300"
    );
    const display = formStudentCreditDisplay;

    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Créditos do aluno</p>
        {formStudentCreditsLoading ? (
          <p className="animate-pulse text-xs text-slate-500">Carregando créditos…</p>
        ) : !display ? (
          <p className="text-xs text-slate-500">Nenhum crédito encontrado para este aluno.</p>
        ) : (
          <>
            <div className="space-y-2.5 rounded-lg border border-slate-600/50 bg-slate-900/50 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-100">Saldo atual</span>
                <strong className={`text-base font-semibold tabular-nums ${creditColor(display.studentBalance)}`}>
                  {formatCreditHours(display.studentBalance)}
                </strong>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-100">Saldo após este voo</span>
                <strong className={`text-base font-semibold tabular-nums ${scheduledLoading ? "text-slate-400" : creditColor(display.balanceAfterThisFlight)}`}>
                  {scheduledLoading ? "…" : formatCreditHours(display.balanceAfterThisFlight)}
                </strong>
              </div>
              {!scheduledLoading ? (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {formatCreditHours(display.studentBalance)}
                  {" − "}
                  {formatCreditHours(display.thisFlightHours)} (este voo)
                  {display.scheduledBeforeHours > 0.001 ? (
                    <> − {formatCreditHours(display.scheduledBeforeHours)} (agendados antes)</>
                  ) : null}
                </p>
              ) : null}
            </div>

            <div className="mt-3 space-y-1.5 border-t border-slate-700/60 pt-3">
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Horas compradas</span>
                <span className="tabular-nums text-slate-400">{formatCreditHours(display.purchasedHours)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Horas utilizadas (voos + multas)</span>
                <span className="tabular-nums text-slate-400">{formatCreditHours(display.usedHours)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Horas em voos agendados</span>
                <span className="tabular-nums text-slate-400">
                  {scheduledLoading ? "…" : formatCreditHours(display.allScheduledHours)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Saldo após todos os agendamentos</span>
                <span className={`tabular-nums ${scheduledLoading ? "text-slate-400" : creditColor(display.balanceAfterAllScheduled)}`}>
                  {scheduledLoading ? "…" : formatCreditHours(display.balanceAfterAllScheduled)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {readOnlyDisplay ? "Escala pública" : "Escala"}
          </h2>
          <p className="text-xs text-slate-500">
            {readOnlyDisplay
              ? "Visualização somente leitura da agenda — ideal para exibir no computador da escola."
              : "Mesma dinâmica da Escala Automática, focada apenas em voos já marcados."}
          </p>
        </div>
        {!readOnlyDisplay ? (
          <button
            type="button"
            onClick={() => window.open("/escala-publica", "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20"
            title="Abrir escala em nova aba para exibição no computador da escola"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4.75 3A1.75 1.75 0 003 4.75v10.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0017 15.25V4.75A1.75 1.75 0 0015.25 3H4.75zM5 5h10v10H5V5zm7.75 8.25a.75.75 0 00-1.5 0v1.69l-2.22-2.22a.75.75 0 00-1.06 1.06l2.22 2.22H8.5a.75.75 0 000 1.5h3.25a.75.75 0 00.75-.75V13.25z" />
            </svg>
            Escala pública
          </button>
        ) : null}
      </div>

      {!readOnlyDisplay ? <SagaScheduleSyncLogPanel logs={sagaSyncLogs} onClear={() => setSagaSyncLogs([])} /> : null}

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
                void loadWeek(prev.weekStart, prev, { showSkeleton: false });
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
                void loadWeek(value, week, { showSkeleton: false });
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
                void loadWeek(next.weekStart, next, { showSkeleton: false });
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              title="Próxima semana"
            >
              ›
            </button>
          </div>
        </div>
        {canCreateFlight && !readOnlyDisplay ? (
        <div className="flex items-end gap-2 md:col-span-2">
          <button
            type="button"
            onClick={() => openCreateModal()}
            disabled={!weekData}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            Novo voo
          </button>
          {scheduleRules.sagaOnlySchedule ? (
            <button
              type="button"
              onClick={() => openBlockModal()}
              disabled={!weekData}
              className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              Bloquear agenda
            </button>
          ) : null}
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

      {weekData && !readOnlyDisplay ? (
        <section className="order-5">
          {/* Mobile: resumo recolhido por padrão */}
          <button
            type="button"
            onClick={() => setMobileAircraftSummaryOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 md:hidden"
          >
            Resumo por avião
            <span className="text-slate-500">{mobileAircraftSummaryOpen ? "▴" : "▾"}</span>
          </button>
          <div className={`${mobileAircraftSummaryOpen ? "mt-3 grid" : "hidden"} grid-cols-1 gap-3 md:mt-0 md:grid md:grid-cols-4`}>
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
          </div>
        </section>
      ) : null}

      {weekData ? (
        <>
          <section className="order-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
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
                          onChange={() => {
                            const allAircraft = aircraftOptions.map((option) => option.registration);
                            setVisibleAircraft((prev) => nextSingleFocusSelection(prev, aircraft.registration, allAircraft));
                          }}
                        />
                        <span className={`h-3 w-3 rounded border ${color}`} />
                        {aircraft.registration}
                        {!aircraft.hasSupply && !scheduleRules.sagaOnlySchedule ? <span className="text-[10px] text-amber-300">sem disponibilidade</span> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Instrutores</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setVisibleInstructors(["__none__", ...instructorOptions.map((i) => i.userId)])} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Todos</button>
                    <button type="button" onClick={() => setVisibleInstructors([])} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800">Nenhum</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={visibleInstructors.includes("__none__")}
                      onChange={() =>
                        setVisibleInstructors((prev) =>
                          nextSingleFocusSelection(prev, "__none__", ["__none__", ...instructorOptions.map((option) => option.userId)]),
                        )
                      }
                    />
                    <span className="h-3 w-3 rounded border-2 border-red-300 bg-slate-800" />
                    Sem instrutor
                  </label>
                  {instructorOptions.map((instructor) => {
                    const checked = visibleInstructors.includes(instructor.userId);
                    const border = borderByInstructor.get(instructor.userId) ?? "border-white/80";
                    return (
                      <label key={instructor.userId} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setVisibleInstructors((prev) =>
                              nextSingleFocusSelection(prev, instructor.userId, ["__none__", ...instructorOptions.map((option) => option.userId)]),
                            )
                          }
                        />
                        <span className={`h-3 w-3 rounded border-2 ${border} bg-slate-800`} />
                        {shortName(instructorDisplayName(instructor.userId, instructor.label) ?? instructor.label, instructor.label)}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {unassignedInstructorCount > 0 ? (
            <section className="order-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              {unassignedInstructorCount} voo(s) nesta escala estão sem instrutor.
            </section>
          ) : null}

          {/* Calendar grid */}
          <div className={`order-3 space-y-0 transition-opacity ${weekRefreshing ? "pointer-events-none opacity-60" : ""}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* Ocupa a linha inteira no mobile para os botões não ficarem espremidos. */}
              <div className="flex w-full overflow-hidden rounded-lg border border-slate-700 sm:w-auto">
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
              <div className="flex overflow-hidden rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setScheduleGroupBy("aircraft")}
                  className={`border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:py-1.5 ${scheduleGroupBy === "aircraft" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  Por avião
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleGroupBy("instructor")}
                  className={`border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:py-1.5 ${scheduleGroupBy === "instructor" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  Por instrutor
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleGroupBy("none")}
                  className={`px-3 py-2 text-xs transition-colors sm:py-1.5 ${scheduleGroupBy === "none" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  Nenhum
                </button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 sm:py-1.5">
                <input
                  type="checkbox"
                  checked={hideCancelledFlights}
                  onChange={(event) => setHideCancelledFlights(event.target.checked)}
                  className="h-4 w-4 accent-sky-500"
                />
                <span>
                  Ocultar cancelados
                  {cancelledFlightCount > 0 ? <span className="ml-1 text-slate-500">({cancelledFlightCount})</span> : null}
                </span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cores</span>
                <div className="flex overflow-hidden rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setColorScheme("aircraft")}
                    className={`border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:py-1.5 ${colorScheme === "aircraft" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Por avião
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorScheme("status")}
                    className={`px-3 py-2 text-xs transition-colors sm:py-1.5 ${colorScheme === "status" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Por status
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas</span>
                <div className="flex overflow-hidden rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setProjectionHoursSource("system")}
                    className={`border-r border-slate-700 px-3 py-2 text-xs transition-colors sm:py-1.5 ${projectionHoursSource === "system" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Sistema
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectionHoursSource("planeIt")}
                    className={`px-3 py-2 text-xs transition-colors sm:py-1.5 ${projectionHoursSource === "planeIt" ? "bg-sky-600/20 text-sky-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    Plane It
                  </button>
                </div>
                {projectionHoursSource === "planeIt" && planeIt.error ? (
                  <span className="text-[10px] font-medium text-amber-300">indisp.</span>
                ) : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 sm:py-1.5">
                <input
                  type="checkbox"
                  checked={invertedTimeline}
                  onChange={(event) => setInvertedTimeline(event.target.checked)}
                  className="h-4 w-4 accent-sky-500"
                />
                <span>Invertida (tempo na horizontal)</span>
              </label>
            </div>

            {/* Deslize horizontal ao navegar entre datas/semanas. */}
            <div className="overflow-hidden">
            <div ref={boardSlideRef}>
            {invertedTimeline ? (
              <HorizontalTimelineBoard
                rows={timelineRows}
                title={
                  agendaView === "daily"
                    ? "Linha do tempo diária"
                    : agendaView === "three-day"
                      ? "Linha do tempo — 3 dias"
                      : "Linha do tempo semanal"
                }
                groupBy={scheduleGroupBy}
                colorScheme={colorScheme}
                aircraftColumns={calendarAircraftColumns}
                instructorColumns={calendarInstructorColumns}
                nightStartHour={scheduleRules.nightFlightStartHour}
                getItemColor={resolveItemColor}
                borderByInstructor={borderByInstructor}
                clubMemberByStudentId={clubMemberByStudentId}
                showDayInItems={false}
                daySelector={
                  agendaView === "daily"
                    ? { weekStart: weekData.week.weekStart, selectedDay, onSelectDay: setSelectedDay }
                    : undefined
                }
                hasPrevWeek={agendaView === "three-day" ? threeDayStartIndex > 0 || hasPreviousWeek : hasPreviousWeek}
                hasNextWeek={agendaView === "three-day" ? threeDayStartIndex + 3 < DAY_ORDER.length || hasNextWeek : hasNextWeek}
                onPrevWeek={() => { slideBoard("back"); (agendaView === "three-day" ? goToPreviousThreeDayPeriod : () => goToWeekOffset(-1))(); }}
                onNextWeek={() => { slideBoard("forward"); (agendaView === "three-day" ? goToNextThreeDayPeriod : () => goToWeekOffset(1))(); }}
                onItemClick={handleCalendarItemClick}
                tooltipOnlyClick={readOnlyDisplay}
                onEmptySlotClick={readOnlyDisplay ? undefined : (target) => {
                  if (!canCreateFlight) return;
                  openCreateModal();
                  setFormDraft((prev) => {
                    if (!prev) return prev;
                    const base = {
                      ...prev,
                      dayOfWeek: target.dayOfWeek,
                      dateIso: weekDateFromStart(weekData.week.weekStart, target.dayOfWeek),
                      startHour: target.startHour,
                      startTime: target.startTime,
                      isNight: target.isNight,
                      aircraftRegistration: target.targetAircraftRegistration ?? prev.aircraftRegistration,
                    };
                    if (target.targetInstructorId !== undefined) {
                      const instr = weekData.instructors.find((i) => i.userId === target.targetInstructorId) ?? null;
                      return { ...base, instructorId: target.targetInstructorId, instructorLabel: instr?.label ?? null, instructorAnac: instr?.anacCode ?? null };
                    }
                    return base;
                  });
                }}
              />
            ) : agendaView !== "daily" ? (
              <CalendarGrid
                items={calendarItems}
                days={agendaView === "three-day" ? threeDayWindow : DAY_ORDER}
                title={agendaView === "three-day" ? "Agenda de 3 dias" : "Agenda semanal"}
                onDayHeaderClick={(day) => { setSelectedDay(day); setAgendaView("daily"); }}
                groupBy={scheduleGroupBy}
                columns={scheduleColumns}
                colorScheme={colorScheme}
                aircraftColumns={calendarAircraftColumns}
                instructorColumns={calendarInstructorColumns}
                getItemColor={resolveItemColor}
                projectionRows={scheduleGroupBy === "aircraft" ? projectionRows : undefined}
                projectionLoading={projectionLoading}
                colorByAircraft={colorByAircraft}
                borderByInstructor={borderByInstructor}
                backgroundSupply={selectedSupplyForBackground}
                clubMemberByStudentId={clubMemberByStudentId}
                weekStart={weekData.week.weekStart}
                nightStartHour={scheduleRules.nightFlightStartHour}
                hasPrevWeek={agendaView === "three-day"
                  ? threeDayStartIndex > 0 || hasPreviousWeek
                  : hasPreviousWeek}
                hasNextWeek={agendaView === "three-day"
                  ? threeDayStartIndex + 3 < DAY_ORDER.length || hasNextWeek
                  : hasNextWeek}
                onPrevWeek={() => {
                  slideBoard("back");
                  if (agendaView === "three-day") {
                    goToPreviousThreeDayPeriod();
                    return;
                  }
                  goToWeekOffset(-1);
                }}
                onNextWeek={() => {
                  slideBoard("forward");
                  if (agendaView === "three-day") {
                    goToNextThreeDayPeriod();
                    return;
                  }
                  goToWeekOffset(1);
                }}
                onItemClick={handleCalendarItemClick}
                tooltipOnlyClick={readOnlyDisplay}
                onItemDrop={readOnlyDisplay || !canEditFlight ? undefined : (item, target) => {
                  const selected = flights.find((row) => row.id === item.id);
                  if (!selected) return;
                  void (async () => {
                    await openEditModal(selected);
                    setFormDraft((prev) => {
                      if (!prev) return prev;
                      const base = {
                        ...prev,
                        dayOfWeek: target.dayOfWeek,
                        dateIso: weekDateFromStart(weekData.week.weekStart, target.dayOfWeek),
                        startHour: target.startHour,
                        startTime: target.startTime,
                        isNight: target.isNight,
                        aircraftRegistration: target.targetAircraftRegistration ?? prev.aircraftRegistration,
                      };
                      if (target.targetInstructorId !== undefined) {
                        const instr = weekData.instructors.find((i) => i.userId === target.targetInstructorId) ?? null;
                        return { ...base, instructorId: target.targetInstructorId, instructorLabel: instr?.label ?? null, instructorAnac: instr?.anacCode ?? null };
                      }
                      return base;
                    });
                  })();
                }}
                onEmptySlotClick={readOnlyDisplay ? undefined : (target) => {
                  if (!canCreateFlight) return;
                  openCreateModal();
                  setFormDraft((prev) => {
                    if (!prev) return prev;
                    const base = {
                      ...prev,
                      dayOfWeek: target.dayOfWeek,
                      dateIso: weekDateFromStart(weekData.week.weekStart, target.dayOfWeek),
                      startHour: target.startHour,
                      startTime: target.startTime,
                      isNight: target.isNight,
                      aircraftRegistration: target.targetAircraftRegistration ?? prev.aircraftRegistration,
                    };
                    if (target.targetInstructorId !== undefined) {
                      const instr = weekData.instructors.find((i) => i.userId === target.targetInstructorId) ?? null;
                      return { ...base, instructorId: target.targetInstructorId, instructorLabel: instr?.label ?? null, instructorAnac: instr?.anacCode ?? null };
                    }
                    return base;
                  });
                }}
              />
            ) : (
              <section className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 sm:p-4">
                <DailyCalendarGrid
                  items={calendarItems}
                  selectedDay={selectedDay}
                  weekStart={weekData.week.weekStart}
                  groupBy={scheduleGroupBy}
                  columns={scheduleColumns}
                  colorScheme={colorScheme}
                  aircraftColumns={calendarAircraftColumns}
                  instructorColumns={calendarInstructorColumns}
                  nightStartHour={scheduleRules.nightFlightStartHour}
                  getItemColor={resolveItemColor}
                  colorByAircraft={colorByAircraft}
                  borderByInstructor={borderByInstructor}
                  backgroundSupply={selectedSupplyForBackground}
                  clubMemberByStudentId={clubMemberByStudentId}
                  projectionRows={scheduleGroupBy === "aircraft" ? projectionRows : undefined}
                  projectionLoading={projectionLoading}
                  hasPrevWeek={hasPreviousWeek}
                  hasNextWeek={hasNextWeek}
                  onSelectDay={setSelectedDay}
                  onPrevWeek={() => { slideBoard("back"); goToWeekOffset(-1); }}
                  onNextWeek={() => { slideBoard("forward"); goToWeekOffset(1); }}
                  onItemClick={handleCalendarItemClick}
                  tooltipOnlyClick={readOnlyDisplay}
                  onItemDrop={readOnlyDisplay || !canEditFlight ? undefined : (item, target) => {
                    const selected = flights.find((row) => row.id === item.id);
                    if (!selected) return;
                    void (async () => {
                      await openEditModal(selected);
                      setFormDraft((prev) => {
                        if (!prev) return prev;
                        const base = { ...prev, dayOfWeek: target.dayOfWeek, dateIso: weekDateFromStart(weekData.week.weekStart, target.dayOfWeek), startHour: target.startHour, startTime: target.startTime, isNight: target.isNight };
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
                  }}
                  onEmptySlotClick={readOnlyDisplay ? undefined : (target) => {
                    if (!canCreateFlight) return;
                    openCreateModal();
                    setFormDraft((prev) => {
                      if (!prev) return prev;
                      const base = { ...prev, dayOfWeek: target.dayOfWeek, dateIso: weekDateFromStart(weekData.week.weekStart, target.dayOfWeek), startHour: target.startHour, startTime: target.startTime, isNight: target.isNight };
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
            </div>
          </div>

          {!readOnlyDisplay ? (
          <>
          {/* Resumo por instrutor — abaixo da agenda */}
          <section className="order-7 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <button
              type="button"
              onClick={() => setMobileInstructorSummaryOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-slate-500 md:hidden"
            >
              Resumo por instrutor
              <span className="text-slate-600">{mobileInstructorSummaryOpen ? "▴" : "▾"}</span>
            </button>
            <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wider text-slate-500 md:block">Resumo por instrutor</p>
            <div className={`${mobileInstructorSummaryOpen ? "mt-3 grid" : "hidden"} grid-cols-1 gap-3 md:mt-0 md:grid md:grid-cols-4`}>
              {instructorSummary.map((row) => (
                <article key={row.instructor.userId} className={`rounded-xl border bg-slate-800/30 p-3 ${borderByInstructor.get(row.instructor.userId) ?? "border-slate-700"}`}>
                  <p className="truncate text-sm font-semibold text-slate-100">{shortName(instructorDisplayName(row.instructor.userId, row.instructor.label) ?? row.instructor.label, row.instructor.label)}</p>
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

          <section className="order-8 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
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
                        <td className="px-2 py-2 text-slate-200">{shortName(studentDisplayName(row.studentId, row.studentId))}</td>
                        <td className="px-2 py-2 text-slate-300">
                          {shortName(instructorDisplayName(row.instructorId, row.instructorLabel)) || "—"}
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

          <section className="order-9 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    <p className="font-medium text-slate-200">{shortName(studentDisplayName(row.id, row.label))}</p>
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
                      <p className="font-medium text-slate-200">{shortName(studentDisplayName(row.userId, row.label))}</p>
                      <p className="text-xs text-red-300">Sem voo marcado nesta semana</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
          </>
          ) : null}
        </>
      ) : null}

      {!readOnlyDisplay && selectedStudentSchedule ? (
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
                            {shortName(instructorDisplayName(row.instructorId, row.instructorLabel)) || "—"}
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

      {!readOnlyDisplay && formDraft && weekData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border-0 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:max-w-3xl sm:rounded-xl sm:border sm:border-slate-700 lg:max-w-6xl">
            {/* Cabeçalho fixo */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">{formMode === "create" ? "Novo voo" : "Editar voo"}</p>
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            {/* Mobile: subabas Voo / Aluno */}
            {isMobile ? (
              <div className="flex flex-shrink-0 border-b border-slate-700">
                {(["voo", "aluno"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setModalMobileTab(tab)}
                    className={`flex-1 px-3 py-2 text-xs font-semibold ${
                      modalMobileTab === tab
                        ? "border-b-2 border-violet-500 text-violet-200"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab === "voo" ? "Voo" : "Aluno"}
                  </button>
                ))}
              </div>
            ) : null}
            {/* Corpo: formulário (esq.) + resumo do aluno (dir. no desktop / subaba no mobile) */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Coluna esquerda: formulário do voo — rola independente (55% no desktop) */}
              <div className={`min-h-0 w-full overflow-y-auto sm:w-[55%] ${isMobile && modalMobileTab !== "voo" ? "hidden" : ""}`}>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              {(
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400">
                    Status do voo
                    <select
                      value={formDraft.flightStatus ?? "Confirmado"}
                      onChange={(e) => setFormDraft((prev) => prev ? { ...prev, flightStatus: e.target.value as FlightStatus, cancellationReason: "", cancellationReasonText: "" } : prev)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                    >
                      {(formMode === "create"
                        ? (scheduleRules.sagaOnlySchedule
                          ? (["Previsto", "Pendente", "Confirmado"] as FlightStatus[])
                          : (["Pendente", "Confirmado"] as FlightStatus[]))
                        : (scheduleRules.sagaOnlySchedule ? (["Previsto", ...FLIGHT_STATUS_OPTIONS] as FlightStatus[]) : FLIGHT_STATUS_OPTIONS)
                      ).map((s) => (
                        <option key={s} value={s}>{s === "Previsto" ? "Planejado (Previsto)" : s}</option>
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
                          checked={formDraft.waiveCancellationPenalty ?? true}
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
                students={
                  formDraft.studentId.startsWith(SAGA_STUDENT_ID_PREFIX)
                    ? [
                        {
                          userId: formDraft.studentId,
                          label: formDraft.studentLabel || "Aluno (SAGA)",
                          email: null,
                          anacCode: null,
                          weightKg: null,
                          heightCm: null,
                        },
                        ...weekData.students,
                      ]
                    : weekData.students
                }
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
                      {aircraft.registration}{aircraft.hasSupply || scheduleRules.sagaOnlySchedule ? "" : " (sem disponibilidade)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Data
                <input
                  type="date"
                  value={formDraft.dateIso ?? weekDateFromStart(weekData.week.weekStart, formDraft.dayOfWeek)}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setFormDraft((prev) =>
                      prev ? { ...prev, dateIso: value, dayOfWeek: new Date(`${value}T12:00:00`).getDay() } : prev,
                    );
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs text-slate-400">
                {scheduleRules.sagaOnlySchedule ? "Início do bloco SAGA" : "Hora"}
                <input
                  type="time"
                  step={60}
                  value={formDraft.startTime}
                  onChange={(e) => {
                    const nextTime = normalizeTimeInput(e.target.value);
                    if (!nextTime) return;
                    setFormDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            startHour: parseStartHour(nextTime),
                            startTime: nextTime,
                            isNight: isNightStartTime(nextTime, scheduleRules),
                          }
                        : prev,
                    );
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
              {scheduleRules.sagaOnlySchedule ? (
                <label className="text-xs text-slate-400">
                  Final do bloco no SAGA
                  <input
                    type="time"
                    step={60}
                    value={minutesToScheduleHHMM(parseScheduleTimeToMinutes(formDraft.startTime) + Math.round(formDraft.durationHours * 60))}
                    onChange={(e) => {
                      const nextEndTime = normalizeTimeInput(e.target.value);
                      if (!nextEndTime) return;
                      setFormDraft((prev) => {
                        if (!prev) return prev;
                        const startMin = parseScheduleTimeToMinutes(prev.startTime);
                        const endMin = parseScheduleTimeToMinutes(nextEndTime);
                        return { ...prev, durationHours: (endMin - startMin) / 60 };
                      });
                    }}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                  />
                </label>
              ) : (
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
              )}
              <label className="text-xs text-slate-400 md:col-span-2">
                Observações
                <textarea
                  value={formDraft.notes}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, notes: e.target.value.slice(0, 255) } : prev))}
                  rows={3}
                  maxLength={255}
                  placeholder="Observações do voo"
                  className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                />
                <span className="mt-1 block text-right text-[10px] text-slate-500">{formDraft.notes.length}/255</span>
              </label>
            </div>

            {/* Resumo operacional; no SAGA o horário editado representa o bloco completo. */}
            {(() => {
              const startMin = parseScheduleTimeToMinutes(formDraft.startTime);
              const durMin = Math.round(formDraft.durationHours * 60);
              const isSagaBlock = scheduleRules.sagaOnlySchedule;
              const blockEndMin = startMin + durMin;
              const engineStartMin = isSagaBlock ? startMin + scheduleRules.bufferBeforeMinutes : startMin;
              const cutoffMin = isSagaBlock
                ? Math.max(engineStartMin, blockEndMin - scheduleRules.bufferAfterMinutes)
                : startMin + durMin;
              const presentation = minutesToScheduleHHMM(isSagaBlock ? startMin : startMin - scheduleRules.bufferBeforeMinutes);
              const engineStart = minutesToScheduleHHMM(engineStartMin);
              const cutoff = minutesToScheduleHHMM(cutoffMin);
              const end = minutesToScheduleHHMM(isSagaBlock ? blockEndMin : cutoffMin + scheduleRules.bufferAfterMinutes);
              const effectiveFlightTime = hoursToHHMM(sagaEffectiveFlightMinutes(durMin, scheduleRules) / 60);
              return (
                <div className={`mx-4 mb-3 grid grid-cols-2 gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100 ${isSagaBlock ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
                  <div><p className="text-sky-300">Apresentação</p><strong>{presentation}</strong></div>
                  <div><p className="text-sky-300">Acionamento</p><strong>{engineStart}</strong></div>
                  <div><p className="text-sky-300">Corte</p><strong>{cutoff}</strong></div>
                  <div><p className="text-sky-300">Encerramento</p><strong>{end}</strong></div>
                  {isSagaBlock ? <div><p className="text-sky-300">Tempo de voo</p><strong>{effectiveFlightTime}</strong></div> : null}
                </div>
              );
            })()}

            {/* No modo SAGA a disponibilidade operacional local não se aplica. */}
            {!selectedAircraftHasSupply && !scheduleRules.sagaOnlySchedule ? (
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
              </div>
              {/* Coluna direita (desktop) / subaba "Aluno" (mobile): resumo do aluno */}
              <div
                className={`min-h-0 w-full overflow-y-auto border-slate-700 bg-slate-950/30 p-4 sm:w-[45%] sm:flex-shrink-0 sm:border-l ${
                  isMobile ? (modalMobileTab === "aluno" ? "" : "hidden") : ""
                }`}
              >
                <ScheduleStudentSummaryPanel
                  studentUserId={
                    formDraft.studentId && !formDraft.studentId.startsWith(SAGA_STUDENT_ID_PREFIX)
                      ? formDraft.studentId
                      : null
                  }
                  studentLabel={formDraft.studentLabel}
                  viewer={user ? { userId: user.id, role: user.role } : { userId: "", role: "admin" }}
                  creditsSlot={renderStudentCreditsBlock()}
                />
              </div>
            </div>

            <div className="flex flex-shrink-0 flex-col justify-end gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
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

      {/* Modal de bloqueio de agenda (modo SAGA) */}
      {!readOnlyDisplay && blockDraft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-none border-0 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-xl sm:border sm:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">Bloquear agenda</p>
              <button
                type="button"
                onClick={() => setBlockDraft(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <p className="text-xs text-slate-500">
                Cria um evento na agenda SAGA com o usuário de bloqueio, impedindo novos agendamentos no período.
              </p>
              <label className="block text-xs text-slate-400">
                Aeronave
                <select
                  value={blockDraft.aircraftRegistration}
                  onChange={(e) => setBlockDraft((prev) => (prev ? { ...prev, aircraftRegistration: e.target.value } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {aircraftOptions.map((aircraft) => (
                    <option key={aircraft.registration} value={aircraft.registration}>
                      {aircraft.registration}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Data
                <input
                  type="date"
                  value={blockDraft.date}
                  onChange={(e) => setBlockDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-slate-400">
                  Hora de início
                  <input
                    type="time"
                    value={blockDraft.startTime}
                    onChange={(e) => setBlockDraft((prev) => (prev ? { ...prev, startTime: e.target.value } : prev))}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Hora de fim
                  <input
                    type="time"
                    value={blockDraft.endTime}
                    onChange={(e) => setBlockDraft((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-400">
                Observação
                <textarea
                  value={blockDraft.notes}
                  onChange={(e) => setBlockDraft((prev) => (prev ? { ...prev, notes: e.target.value.slice(0, 180) } : prev))}
                  rows={3}
                  maxLength={180}
                  placeholder="Motivo do bloqueio (ex.: manutenção, evento...)"
                  className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
                />
              </label>
            </div>
            <div className="flex flex-col justify-end gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setBlockDraft(null)}
                className="w-full rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveBlock()}
                disabled={blockSaving || !canCreateFlight}
                className="w-full rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 sm:w-auto"
              >
                {blockSaving ? "Bloqueando..." : "Bloquear agenda"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
