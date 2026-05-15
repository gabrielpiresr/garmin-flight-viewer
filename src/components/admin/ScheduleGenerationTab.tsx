import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { encodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { insertFlight, updateFlight } from "../../lib/flightsDb";
import { dispatchNotificationEvent } from "../../lib/notificationsDb";
import { getScheduleWeekData, getScheduleWeekOptions, AUTO_SOURCE_PREFIX } from "../../lib/scheduleGenerationDb";
import { assignInstructorsToSuggestions, generateSchedulePreview } from "../../lib/scheduleGenerator";
import { closeScheduleWeek } from "../../lib/operationalWeeksDb";
import { getSchoolRules } from "../../lib/schoolRulesDb";
import {
  buildScheduleHourOptions,
  hourSelectValue,
  parseHourSelectValue,
} from "../../lib/scheduleTimeOptions";
import { SLOT_HOURS } from "../../types/admin";
import type { SlotState } from "../../types/admin";
import { DEFAULT_FLIGHT_SCHEDULE_RULES } from "../../types/schoolRules";
import type { FlightScheduleRules } from "../../types/schoolRules";
import type {
  ExistingScheduledFlight,
  SchedulePreview,
  ScheduleWeekData,
  ScheduleWeekOption,
  StudentRequestDemand,
  StudentServiceSummary,
  ScheduledFlightSuggestion,
  InstructorIdentity,
  InstructorWeeklyConfig,
  SchedulePeriod,
} from "../../types/schedule";
import { useToast } from "../ui/ToastProvider";
import { StudentSearchSelect } from "./StudentSearchSelect";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};
const INSTRUCTOR_DAY_ORDER = [1, 2, 3, 4, 5, 6] as const;

const PERIOD_LABEL: Record<SchedulePeriod, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  night: "Noite",
};

const INSTRUCTOR_PREFERENCE_LABEL: Record<InstructorWeeklyConfig["preferenceLevel"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

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

function formatCalendarDayHeader(weekStart: string, dayOfWeek: number): string {
  const date = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return DAY_LABEL[dayOfWeek];
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return `${DAY_LABEL[dayOfWeek]} ${date.getDate()}`;
}

function hoursToHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function composeEndTime(startHour: number, durationHours: number): string {
  return hoursToHHMM(startHour + durationHours);
}

function parseStartHour(startTime: string): number {
  const [hh, mm] = startTime.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
}

function scheduleSignature(date: string, startTime: string, endTime: string): string {
  return `${date}|${startTime}|${endTime}`;
}

function weekDateFromStart(weekStart: string, dayOfWeek: number): string {
  const base = new Date(`${weekStart}T12:00:00`);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function flightDurationToHHMM(durationHours: number): string {
  const totalMinutes = Math.round(durationHours * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function compareByDayAndHour(a: ScheduledFlightSuggestion, b: ScheduledFlightSuggestion): number {
  const aDayRank = DAY_ORDER.indexOf(a.dayOfWeek as (typeof DAY_ORDER)[number]);
  const bDayRank = DAY_ORDER.indexOf(b.dayOfWeek as (typeof DAY_ORDER)[number]);
  if (aDayRank !== bDayRank) return aDayRank - bDayRank;
  if (a.startHour !== b.startHour) return a.startHour - b.startHour;
  return a.studentLabel.localeCompare(b.studentLabel, "pt-BR");
}

function studentDisplayLine(row: ScheduledFlightSuggestion, weekData: ScheduleWeekData | null): string {
  if (!weekData) return row.studentLabel;
  const student = weekData.students.find((s) => s.userId === row.studentId);
  if (!student) return `${row.studentLabel} / — / — / —`;
  const anac = student.anacCode || "—";
  const weight = student.weightKg !== null ? `${student.weightKg}kg` : "—";
  const height = student.heightCm !== null ? `${student.heightCm}cm` : "—";
  return `${student.label} / ${anac} / ${weight} / ${height}`;
}

function makeDefaultInstructorConfig(instructorId: string): InstructorWeeklyConfig {
  return {
    instructorId,
    availableThisWeek: true,
    preferenceLevel: "medium",
    availability: INSTRUCTOR_DAY_ORDER.flatMap((dayOfWeek) =>
      (["morning", "afternoon", "night"] as const).map((period) => ({
        dayOfWeek,
        period,
        available: true,
        availabilityType: "available" as const,
      })),
    ),
  };
}

function normalizeInstructorConfigs(
  instructors: InstructorIdentity[],
  savedConfigs: InstructorWeeklyConfig[] = [],
): InstructorWeeklyConfig[] {
  const savedByInstructor = new Map(savedConfigs.map((config) => [config.instructorId, config]));
  return instructors.map((instructor) => {
    const saved = savedByInstructor.get(instructor.userId);
    const fallback = {
      ...makeDefaultInstructorConfig(instructor.userId),
      preferenceLevel: instructor.defaultPreferenceLevel,
      availability: makeDefaultInstructorConfig(instructor.userId).availability.map((row) => {
        if (instructor.defaultAvailability.length === 0) return row;
        const defaultRow = instructor.defaultAvailability.find(
          (entry) => entry.dayOfWeek === row.dayOfWeek && entry.period === row.period,
        );
        return defaultRow
          ? { ...row, available: true, availabilityType: defaultRow.availabilityType }
          : { ...row, available: false, availabilityType: "available" as const };
      }),
    };
    if (!saved) return fallback;
    const availabilityByKey = new Map(saved.availability.map((row) => [`${row.dayOfWeek}-${row.period}`, row]));
    return {
      instructorId: instructor.userId,
      availableThisWeek: saved.availableThisWeek ?? true,
      preferenceLevel: saved.preferenceLevel ?? "medium",
      availability: fallback.availability.map((row) => ({
        ...row,
        available: availabilityByKey.get(`${row.dayOfWeek}-${row.period}`)?.available ?? row.available,
        availabilityType:
          availabilityByKey.get(`${row.dayOfWeek}-${row.period}`)?.availabilityType ?? row.availabilityType,
      })),
    };
  });
}

function cycleInstructorAvailability(
  row: InstructorWeeklyConfig["availability"][number],
): InstructorWeeklyConfig["availability"][number] {
  if (!row.available) return { ...row, available: true, availabilityType: "available" };
  if (row.availabilityType === "available") return { ...row, available: true, availabilityType: "preferred" };
  return { ...row, available: false, availabilityType: "available" };
}

function instructorAvailabilityCellClass(row: InstructorWeeklyConfig["availability"][number]): string {
  if (row.available && row.availabilityType === "preferred") return "bg-emerald-600 border-emerald-500 text-white";
  if (row.available) return "bg-sky-600 border-sky-500 text-white";
  return "bg-slate-800/40 border-slate-700/60 text-slate-600 hover:border-slate-600 hover:bg-slate-700/40";
}

function normalizeSuggestion(row: ScheduledFlightSuggestion): ScheduledFlightSuggestion {
  return {
    ...row,
    instructorId: row.instructorId ?? null,
    instructorLabel: row.instructorLabel ?? null,
    instructorAnac: row.instructorAnac ?? null,
    instructorAssignmentMode: row.instructorAssignmentMode ?? "auto",
  };
}

function formatInstructorPhysical(instructor: InstructorIdentity): string {
  const weight = instructor.weightKg !== null ? `${instructor.weightKg}kg` : "—";
  const height = instructor.heightCm !== null ? `${instructor.heightCm}cm` : "—";
  return `${weight} / ${height}`;
}

function toGeneratedSuggestion(
  existing: ExistingScheduledFlight,
  weekStart: string,
  studentLabel: string,
): ScheduledFlightSuggestion {
  const [hh] = existing.startTime.split(":");
  const jsDate = new Date(`${existing.date}T12:00:00`);
  const day = jsDate.getDay();
  return {
    demandId: existing.demandId,
    studentId: existing.studentId,
    studentLabel,
    aircraftId: "",
    aircraftRegistration: existing.aircraftRegistration ?? "Aeronave",
    dayOfWeek: day,
    weekDate: weekDateFromStart(weekStart, day),
    startHour: Number(hh) || 6,
    startTime: existing.startTime,
    endTime: hoursToHHMM((Number(hh) || 6) + existing.durationHours),
    durationHours: existing.durationHours,
    priorityLevel: 2,
    flexibilityLevel: "medium",
    preferredModelId: null,
    instructorId: existing.instructorId,
    instructorLabel: existing.instructorLabel,
    instructorAnac: existing.instructorAnac,
    instructorAssignmentMode: existing.instructorId ? "manual" : "auto",
    allocationLayer: "D",
    relaxationLevel: "aircraft_and_time",
    isNight: existing.isNight ?? false,
    notes: null,
    source: "manual",
  };
}

function buildAutoMeta(
  suggestion: ScheduledFlightSuggestion,
  weekStart: string,
  studentAnac?: string | null,
  instructor?: InstructorIdentity | null,
): FlightRecordMeta {
  return {
    schedule: {
      version: "AUTO_SCHEDULE_V1",
      weekStart,
      demandId: suggestion.demandId,
      allocationLayer: suggestion.allocationLayer,
      relaxationLevel: suggestion.relaxationLevel,
    },
    header: {
      studentUserId: suggestion.studentId,
      studentLabel: suggestion.studentLabel,
      studentName: suggestion.studentLabel,
      studentAnac: studentAnac ?? "",
      instructorUserId: suggestion.instructorId ?? undefined,
      instructorName: instructor?.label ?? suggestion.instructorLabel ?? "",
      instructorAnac: instructor?.anacCode ?? suggestion.instructorAnac ?? "",
      date: suggestion.weekDate,
      startTime: suggestion.startTime,
      aircraft: suggestion.aircraftRegistration,
    },
    preFlight: {
      objectiveMd: "",
      briefingMd: suggestion.notes ?? "",
    },
    legs: [
      {
        id: crypto.randomUUID(),
        date: suggestion.weekDate,
        role: "DUPLO COMANDO",
        dep: "---",
        arr: "---",
        landings: 0,
        flightTime: flightDurationToHHMM(suggestion.durationHours),
        navTime: "00:00",
        ifrTime: "00:00",
        nightTime: "00:00",
        serviceTime: "00:00",
        distance: "0",
      },
    ],
    risk: {
      commentsMd: "",
      dangerMd: "",
      riskMd: "",
      managementMd: "",
      instructorOpinionMd: "",
    },
  };
}

function validateSuggestions(
  suggestions: ScheduledFlightSuggestion[],
  weekData: ScheduleWeekData,
  minGapMinutes: number,
): Map<string, string> {
  const errorByDemand = new Map<string, string>();
  const byAircraftDay = new Map<string, { registration: string; day: number; rows: ScheduledFlightSuggestion[] }>();
  const supplyByRegistration = new Map(weekData.supplies.map((s) => [s.aircraftRegistration, s]));

  for (const suggestion of suggestions) {
    const key = `${suggestion.aircraftRegistration}::${suggestion.dayOfWeek}`;
    const bucket = byAircraftDay.get(key) ?? {
      registration: suggestion.aircraftRegistration,
      day: suggestion.dayOfWeek,
      rows: [],
    };
    bucket.rows.push(suggestion);
    byAircraftDay.set(key, bucket);
  }

  for (const bucket of byAircraftDay.values()) {
    const supply = supplyByRegistration.get(bucket.registration);
    const day = bucket.day;
    const sorted = [...bucket.rows].sort((a, b) => a.startHour - b.startHour);
    let used = 0;

    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i]!;
      used += row.durationHours;
      const slotKey = `${day}-${row.startHour}`;
      if (!supply || !supply.slotStates[slotKey] || supply.slotStates[slotKey] === "blocked") {
        errorByDemand.set(row.demandId, "Slot indisponível na matriz operacional.");
      }
      if (i > 0) {
        const prev = sorted[i - 1]!;
        const prevEnd = prev.startHour + prev.durationHours;
        const gap = row.startHour * 60 - prevEnd * 60;
        if (gap < minGapMinutes) {
          errorByDemand.set(row.demandId, "Conflito com intervalo mínimo entre voos.");
        }
      }
    }

    const cap = supply?.dailyCaps[day];
    if (typeof cap === "number" && used > cap) {
      for (const row of sorted) {
        errorByDemand.set(row.demandId, "Cap diário excedido para esta aeronave.");
      }
    }
  }

  for (const supply of weekData.supplies) {
    const rows = suggestions.filter((row) => row.aircraftRegistration === supply.aircraftRegistration);
    for (const groupCap of supply.groupCaps) {
      const groupRows = rows.filter((row) => groupCap.days.includes(row.dayOfWeek));
      const used = groupRows.reduce((total, row) => total + row.durationHours, 0);
      if (used <= groupCap.maxHours) continue;
      for (const row of groupRows) {
        errorByDemand.set(row.demandId, "Teto por grupo de dias excedido para esta aeronave.");
      }
    }
  }

  const byStudentDay = new Map<string, ScheduledFlightSuggestion[]>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.studentId}-${suggestion.weekDate}`;
    const list = byStudentDay.get(key) ?? [];
    list.push(suggestion);
    byStudentDay.set(key, list);
  }

  for (const list of byStudentDay.values()) {
    if (list.length > 1) {
      for (const row of list) {
        errorByDemand.set(row.demandId, "Regra: máximo de 1 voo por aluno por dia.");
      }
    }
    const sorted = [...list].sort((a, b) => a.startHour - b.startHour);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const prevStart = prev.startHour * 60;
      const prevEnd = prevStart + prev.durationHours * 60;
      const currStart = curr.startHour * 60;
      const currEnd = currStart + curr.durationHours * 60;
      const overlap = currStart < prevEnd && currEnd > prevStart;
      if (overlap) {
        errorByDemand.set(curr.demandId, "Aluno com sobreposição de horário no mesmo dia.");
      }
    }
  }

  const byInstructorDay = new Map<string, ScheduledFlightSuggestion[]>();
  for (const suggestion of suggestions) {
    if (!suggestion.instructorId) continue;
    const key = `${suggestion.instructorId}-${suggestion.weekDate}`;
    const list = byInstructorDay.get(key) ?? [];
    list.push(suggestion);
    byInstructorDay.set(key, list);
  }

  for (const list of byInstructorDay.values()) {
    const sorted = [...list].sort((a, b) => a.startHour - b.startHour);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const prevStart = prev.startHour * 60;
      const prevEnd = prevStart + prev.durationHours * 60;
      const currStart = curr.startHour * 60;
      const currEnd = currStart + curr.durationHours * 60;
      if (currStart < prevEnd && currEnd > prevStart) {
        errorByDemand.set(curr.demandId, "Instrutor com sobreposição de horário.");
      }
    }
  }

  return errorByDemand;
}

type SavedPreviewDraft = {
  weekStart: string;
  minGapMinutes: number;
  suggestions: ScheduledFlightSuggestion[];
  instructorConfigs: InstructorWeeklyConfig[];
  savedAt: string;
};

type StudentPreviewSummary = StudentServiceSummary & {
  fullyServed: boolean;
};

type FlightEditDraft = {
  demandId: string;
  studentId: string;
  instructorId: string | null;
  instructorLabel: string | null;
  instructorAnac: string | null;
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
  isNight?: boolean;
};

function scheduleDraftKey(userId: string, weekStart: string): string {
  return `schedule-preview-draft:${userId}:${weekStart}`;
}

function makePreviewShell(suggestions: ScheduledFlightSuggestion[]): SchedulePreview {
  return {
    suggestions,
    unallocatedDemands: [],
    aircraftSummary: [],
    studentSummary: [],
  };
}

function buildSuggestionFromDraft(
  draft: FlightEditDraft,
  weekStart: string,
  studentLabel: string,
  rules: FlightScheduleRules = DEFAULT_FLIGHT_SCHEDULE_RULES,
): ScheduledFlightSuggestion {
  const isNight = draft.isNight ?? false;
  const startHour = isNight ? rules.nightFlightStartHour : draft.startHour;
  return {
    demandId: draft.demandId,
    studentId: draft.studentId,
    studentLabel,
    aircraftId: "",
    aircraftRegistration: draft.aircraftRegistration,
    dayOfWeek: draft.dayOfWeek,
    weekDate: weekDateFromStart(weekStart, draft.dayOfWeek),
    startHour,
    startTime: hoursToHHMM(startHour),
    endTime: composeEndTime(startHour, draft.durationHours),
    isNight,
    durationHours: draft.durationHours,
    priorityLevel: 2,
    flexibilityLevel: "medium",
    preferredModelId: null,
    instructorId: draft.instructorId,
    instructorLabel: draft.instructorLabel,
    instructorAnac: draft.instructorAnac,
    instructorAssignmentMode: "manual",
    allocationLayer: "D",
    relaxationLevel: "aircraft_and_time",
    notes: null,
    source: "manual",
  };
}

function summarizeStudents(
  demands: StudentRequestDemand[],
  suggestions: ScheduledFlightSuggestion[],
): StudentPreviewSummary[] {
  const map = new Map<string, StudentPreviewSummary>();
  for (const demand of demands) {
    const current = map.get(demand.studentId) ?? {
      studentId: demand.studentId,
      studentLabel: demand.studentLabel,
      requestedFlights: 0,
      allocatedFlights: 0,
      requestedHours: 0,
      allocatedHours: 0,
      unmetReasons: [],
      fullyServed: false,
    };
    current.requestedFlights += 1;
    current.requestedHours += demand.durationHours;
    map.set(demand.studentId, current);
  }

  for (const suggestion of suggestions) {
    const current = map.get(suggestion.studentId) ?? {
      studentId: suggestion.studentId,
      studentLabel: suggestion.studentLabel,
      requestedFlights: 0,
      allocatedFlights: 0,
      requestedHours: 0,
      allocatedHours: 0,
      unmetReasons: [],
      fullyServed: false,
    };
    current.allocatedFlights += 1;
    current.allocatedHours += suggestion.durationHours;
    map.set(suggestion.studentId, current);
  }

  return [...map.values()]
    .map((row) => {
      const requestedHours = Number(row.requestedHours.toFixed(2));
      const allocatedHours = Number(row.allocatedHours.toFixed(2));
      const fullyServed = row.allocatedFlights >= row.requestedFlights && allocatedHours >= requestedHours;
      return { ...row, requestedHours, allocatedHours, fullyServed };
    })
    .sort((a, b) => a.studentLabel.localeCompare(b.studentLabel, "pt-BR"));
}

type CalendarDropTarget = { dayOfWeek: number; startHour: number; isNight: boolean };

function eventStyleClasses(color: string, instructorBorder: string | null, unassigned: boolean, draggable: boolean): string {
  const border = unassigned ? "border-white/25" : (instructorBorder ?? "border-white/80");
  const strike = unassigned ? "line-through decoration-white/40 decoration-1 opacity-75" : "";
  const pointer = draggable ? "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-white/60" : "hover:ring-1 hover:ring-white/60";
  return `overflow-hidden rounded border-2 px-1.5 py-1 text-left text-[10px] text-white ${color} ${border} ${strike} ${pointer}`;
}

type CalendarProps = {
  suggestions: ScheduledFlightSuggestion[];
  title: string;
  weekStart: string;
  colorByAircraft: Map<string, string>;
  borderByInstructor: Map<string, string>;
  totalWeightByDemand: Map<string, string>;
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  onSuggestionClick?: (suggestion: ScheduledFlightSuggestion) => void;
  onItemDrop?: (suggestion: ScheduledFlightSuggestion, target: CalendarDropTarget) => void;
};

function CalendarGrid({
  suggestions,
  title,
  weekStart,
  colorByAircraft,
  borderByInstructor,
  totalWeightByDemand,
  backgroundSupply,
  onSuggestionClick,
  onItemDrop,
}: CalendarProps) {
  const rowHeight = 38;
  const boardHeight = SLOT_HOURS.length * rowHeight;
  const hourIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    SLOT_HOURS.forEach((hour, idx) => map.set(hour, idx));
    return map;
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduledFlightSuggestion[]>();
    for (const day of DAY_ORDER) map.set(day, []);
    for (const row of suggestions) {
      const list = map.get(row.dayOfWeek) ?? [];
      list.push(row);
      map.set(row.dayOfWeek, list);
    }
    for (const day of DAY_ORDER) {
      const list = map.get(day) ?? [];
      list.sort(compareByDayAndHour);
      map.set(day, list);
    }
    return map;
  }, [suggestions]);

  const layoutByDay = useMemo(() => {
    const out = new Map<
      number,
      Array<{
        item: ScheduledFlightSuggestion;
        columnIndex: number;
        columnCount: number;
      }>
    >();

    for (const day of DAY_ORDER) {
      const items = byDay.get(day) ?? [];
      const sorted = [...items].sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.durationHours - b.durationHours;
      });
      const groups: ScheduledFlightSuggestion[][] = [];
      let currentGroup: ScheduledFlightSuggestion[] = [];
      let currentGroupEnd = -1;

      for (const item of sorted) {
        const start = item.startHour * 60;
        const end = start + item.durationHours * 60;
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

      const entries: Array<{ item: ScheduledFlightSuggestion; columnIndex: number; columnCount: number }> = [];
      for (const group of groups) {
        const active: Array<{ end: number; column: number }> = [];
        const assigned = new Map<string, number>();
        let maxColumn = 0;
        for (const item of group) {
          const start = item.startHour * 60;
          const end = start + item.durationHours * 60;
          for (let i = active.length - 1; i >= 0; i -= 1) {
            if (active[i]!.end <= start) active.splice(i, 1);
          }
          let nextColumn = 0;
          while (active.some((node) => node.column === nextColumn)) nextColumn += 1;
          active.push({ end, column: nextColumn });
          assigned.set(item.demandId, nextColumn);
          maxColumn = Math.max(maxColumn, nextColumn + 1);
        }
        for (const item of group) {
          entries.push({
            item,
            columnIndex: assigned.get(item.demandId) ?? 0,
            columnCount: maxColumn,
          });
        }
      }
      out.set(day, entries);
    }
    return out;
  }, [byDay]);

  const dayTotals = useMemo(() => {
    const byDayMap = new Map<number, { flights: number; hours: number }>();
    for (const day of DAY_ORDER) byDayMap.set(day, { flights: 0, hours: 0 });
    for (const item of suggestions) {
      const row = byDayMap.get(item.dayOfWeek) ?? { flights: 0, hours: 0 };
      row.flights += 1;
      row.hours += item.durationHours;
      byDayMap.set(item.dayOfWeek, row);
    }
    let cumFlights = 0;
    let cumHours = 0;
    const cumulative = new Map<number, { flights: number; hours: number }>();
    for (const day of DAY_ORDER) {
      const d = byDayMap.get(day) ?? { flights: 0, hours: 0 };
      cumFlights += d.flights;
      cumHours += d.hours;
      cumulative.set(day, { flights: cumFlights, hours: Number(cumHours.toFixed(1)) });
    }
    return { byDay: byDayMap, cumulative };
  }, [suggestions]);

  const dayBoardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const nightRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [dragState, setDragState] = useState<{ item: ScheduledFlightSuggestion; preview: CalendarDropTarget } | null>(null);
  const dragEndedRef = useRef(false);
  const draggable = Boolean(onItemDrop);

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number): CalendarDropTarget | null => {
      for (const day of DAY_ORDER) {
        const nightEl = nightRowRefs.current.get(day);
        if (nightEl) {
          const r = nightEl.getBoundingClientRect();
          if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            return { dayOfWeek: day, startHour: SLOT_HOURS[SLOT_HOURS.length - 1] ?? 17, isNight: true };
          }
        }
      }
      for (const day of DAY_ORDER) {
        const board = dayBoardRefs.current.get(day);
        if (!board) continue;
        const r = board.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
        const idx = Math.max(0, Math.min(SLOT_HOURS.length - 1, Math.round((clientY - r.top) / rowHeight)));
        return { dayOfWeek: day, startHour: SLOT_HOURS[idx] ?? 6, isNight: false };
      }
      return null;
    },
    [rowHeight],
  );

  useEffect(() => {
    if (!dragState) return;
    function onMove(e: PointerEvent) {
      const t = resolveDropTarget(e.clientX, e.clientY);
      if (t) setDragState((p) => (p ? { ...p, preview: t } : p));
    }
    function onUp(e: PointerEvent) {
      setDragState((p) => {
        if (p && onItemDrop) {
          dragEndedRef.current = true;
          onItemDrop(p.item, resolveDropTarget(e.clientX, e.clientY) ?? p.preview);
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
  }, [dragState, onItemDrop, resolveDropTarget]);

  return (
    <section className="w-full rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {draggable ? (
        <p className="mb-2 text-[11px] text-slate-600">Arraste um voo para reagendar. Ao soltar, confirme no modal.</p>
      ) : null}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-0 table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-12 pb-1 text-right text-[10px] font-medium text-slate-600" />
              {DAY_ORDER.map((day) => (
                <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                  {formatCalendarDayHeader(weekStart, day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="align-top pr-2">
                <div className="relative" style={{ height: `${boardHeight}px` }}>
                  {SLOT_HOURS.map((hour, idx) => (
                    <div
                      key={hour}
                      className="absolute right-0 text-right text-[11px] font-mono text-slate-600"
                      style={{ top: `${idx * rowHeight}px`, width: "2.8rem" }}
                    >
                      {hour}h
                    </div>
                  ))}
                </div>
              </td>
              {DAY_ORDER.map((day) => (
                <td key={day} className="align-top p-0">
                  <div
                    ref={(node) => {
                      if (node) dayBoardRefs.current.set(day, node);
                      else dayBoardRefs.current.delete(day);
                    }}
                    className="relative rounded-md border border-slate-700/60 bg-slate-800/30"
                    style={{ height: `${boardHeight}px` }}
                  >
                      {backgroundSupply
                        ? SLOT_HOURS.map((hour, idx) => {
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
                      {SLOT_HOURS.map((hour, idx) => (
                        <div
                          key={`${day}-${hour}`}
                          className="absolute left-0 right-0 border-b border-slate-700/40"
                          style={{ top: `${idx * rowHeight}px` }}
                        />
                      ))}
                      {(layoutByDay.get(day) ?? []).filter((e) => !e.item.isNight).map((entry) => {
                        const item = entry.item;
                        const hourIdx = hourIndexMap.get(item.startHour) ?? 0;
                        const top = hourIdx * rowHeight;
                        const height = Math.max(rowHeight, item.durationHours * rowHeight);
                        const color = aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
                        const instructorBorder = item.instructorId ? borderByInstructor.get(item.instructorId) ?? null : null;
                        if (dragState?.item.demandId === item.demandId) return null;
                        const widthPercent = 100 / Math.max(1, entry.columnCount);
                        const leftPercent = entry.columnIndex * widthPercent;
                        return (
                          <div
                            key={item.demandId}
                            role="button"
                            tabIndex={0}
                            onPointerDown={(e) => {
                              if (!draggable) return;
                              e.preventDefault();
                              e.stopPropagation();
                              dragEndedRef.current = false;
                              const target = resolveDropTarget(e.clientX, e.clientY) ?? {
                                dayOfWeek: item.dayOfWeek,
                                startHour: item.startHour,
                                isNight: false,
                              };
                              setDragState({ item, preview: target });
                            }}
                            onClick={(e) => {
                              if (dragEndedRef.current) {
                                dragEndedRef.current = false;
                                e.preventDefault();
                                return;
                              }
                              onSuggestionClick?.(item);
                            }}
                            className={`absolute ${eventStyleClasses(color, instructorBorder, !item.instructorId, draggable)}`}
                            style={{
                              top: `${top}px`,
                              height: `${height - 4}px`,
                              left: `calc(${leftPercent}% + 4px)`,
                              width: `calc(${widthPercent}% - 8px)`,
                            }}
                          >
                            <p className="truncate font-semibold">{item.studentLabel}</p>
                            <p className="truncate opacity-90">{item.startTime}-{item.endTime}</p>
                            <p className="truncate opacity-80">{item.aircraftRegistration} · {item.instructorLabel ?? "Sem instrutor"}</p>
                            <p className="truncate opacity-80">Peso: {totalWeightByDemand.get(item.demandId) ?? "—"}</p>
                          </div>
                        );
                      })}
                      {dragState && dragState.preview.dayOfWeek === day && !dragState.preview.isNight ? (() => {
                        const item = dragState.item;
                        const entry = (layoutByDay.get(day) ?? []).find((e) => e.item.demandId === item.demandId) ?? {
                          item,
                          columnIndex: 0,
                          columnCount: 1,
                        };
                        const hourIdx = hourIndexMap.get(dragState.preview.startHour) ?? 0;
                        const top = hourIdx * rowHeight;
                        const height = Math.max(rowHeight, item.durationHours * rowHeight);
                        const widthPercent = 100 / Math.max(1, entry.columnCount);
                        const leftPercent = entry.columnIndex * widthPercent;
                        const color = aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
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
                            <p className="truncate font-semibold">{item.studentLabel}</p>
                            <p className="truncate opacity-80">Solte para confirmar</p>
                          </div>
                        );
                      })() : null}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="pr-2 pt-1 text-right text-[11px] font-mono text-indigo-400/60">Noite</td>
              {DAY_ORDER.map((day) => {
                const nightState = backgroundSupply?.slotStates[`${day}-night`];
                const nightItems = (layoutByDay.get(day) ?? []).filter((e) => e.item.isNight);
                return (
                  <td key={day} className="p-0 pt-1">
                    <div
                      ref={(node) => {
                        if (node) nightRowRefs.current.set(day, node);
                        else nightRowRefs.current.delete(day);
                      }}
                      className={`min-h-[36px] rounded-md border px-1.5 py-1 ${nightState === "blocked" ? "border-slate-700/40 bg-slate-800/20" : nightState ? "border-indigo-700/50 bg-indigo-950/30" : "border-slate-700/30 bg-slate-800/10"}`}
                    >
                      {nightItems.length === 0 && !(dragState?.preview.dayOfWeek === day && dragState.preview.isNight) ? (
                        <p className="text-center text-[10px] text-slate-600">—</p>
                      ) : (
                        <div className="space-y-0.5">
                          {nightItems.map(({ item }) => {
                            const color = aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
                            const instructorBorder = item.instructorId ? borderByInstructor.get(item.instructorId) ?? null : null;
                            if (dragState?.item.demandId === item.demandId) return null;
                            return (
                              <div
                                key={item.demandId}
                                role="button"
                                tabIndex={0}
                                onPointerDown={(e) => {
                                  if (!draggable) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  dragEndedRef.current = false;
                                  setDragState({
                                    item,
                                    preview: { dayOfWeek: day, startHour: item.startHour, isNight: true },
                                  });
                                }}
                                onClick={(e) => {
                                  if (dragEndedRef.current) {
                                    dragEndedRef.current = false;
                                    e.preventDefault();
                                    return;
                                  }
                                  onSuggestionClick?.(item);
                                }}
                                className={eventStyleClasses(color, instructorBorder, !item.instructorId, draggable)}
                              >
                                <p className="truncate font-semibold">{item.studentLabel}</p>
                                <p className="truncate opacity-80">{item.aircraftRegistration} · {item.instructorLabel ?? "Sem instrutor"}</p>
                              </div>
                            );
                          })}
                          {dragState && dragState.preview.dayOfWeek === day && dragState.preview.isNight ? (
                            <div className="pointer-events-none overflow-hidden rounded border-2 border-dashed border-white/70 bg-white/10 px-1 py-0.5 text-[10px] text-white ring-2 ring-violet-400/50">
                              <p className="truncate font-semibold">{dragState.item.studentLabel}</p>
                              <p className="truncate opacity-80">Solte para confirmar</p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="pr-2 pt-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total
              </td>
              {DAY_ORDER.map((day) => {
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
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ScheduleGenerationTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [weekOptions, setWeekOptions] = useState<ScheduleWeekOption[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [weekData, setWeekData] = useState<ScheduleWeekData | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [scheduleRules, setScheduleRules] = useState<FlightScheduleRules>(DEFAULT_FLIGHT_SCHEDULE_RULES);
  const [minGapMinutes, setMinGapMinutes] = useState(30);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [editableSuggestions, setEditableSuggestions] = useState<ScheduledFlightSuggestion[]>([]);
  const [instructorConfigs, setInstructorConfigs] = useState<InstructorWeeklyConfig[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<string[]>([]);
  const [visibleInstructors, setVisibleInstructors] = useState<string[]>([]);
  const [savedPreviewAt, setSavedPreviewAt] = useState<string | null>(null);
  const [hasUnsavedPreviewChanges, setHasUnsavedPreviewChanges] = useState(false);
  const [flightModalDraft, setFlightModalDraft] = useState<FlightEditDraft | null>(null);
  const [flightModalMode, setFlightModalMode] = useState<"create" | "edit">("edit");
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [persistedCount, setPersistedCount] = useState(0);
  const [lastClosedWeekMessage, setLastClosedWeekMessage] = useState<string | null>(null);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (lastClosedWeekMessage) showToast({ variant: "success", message: lastClosedWeekMessage });
  }, [lastClosedWeekMessage, showToast]);

  const readSavedPreview = useCallback((weekStart: string): SavedPreviewDraft | null => {
    if (!user) return null;
    try {
      const raw = localStorage.getItem(scheduleDraftKey(user.id, weekStart));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPreviewDraft;
      if (!Array.isArray(parsed.suggestions)) return null;
      return {
        ...parsed,
        suggestions: parsed.suggestions.map(normalizeSuggestion),
        instructorConfigs: Array.isArray(parsed.instructorConfigs) ? parsed.instructorConfigs : [],
      };
    } catch {
      return null;
    }
  }, [user]);

  const savePreviewDraftToStorage = useCallback((weekStart: string, suggestions: ScheduledFlightSuggestion[]) => {
    if (!user) return;
    const payload: SavedPreviewDraft = {
      weekStart,
      minGapMinutes,
      suggestions,
      instructorConfigs,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(scheduleDraftKey(user.id, weekStart), JSON.stringify(payload));
    setSavedPreviewAt(payload.savedAt);
  }, [instructorConfigs, minGapMinutes, user]);

  const clearSavedPreview = useCallback((weekStart: string) => {
    if (!user) return;
    localStorage.removeItem(scheduleDraftKey(user.id, weekStart));
    setSavedPreviewAt(null);
  }, [user]);

  const loadWeek = useCallback(async (weekStart: string) => {
    if (!user) return;
    if (!weekStart) {
      setWeekData(null);
      setPreview(null);
      setEditableSuggestions([]);
      setInstructorConfigs([]);
      return;
    }
    setWeekLoading(true);
    setError(null);
    try {
      const [data, rules] = await Promise.all([
        getScheduleWeekData({
          weekStart,
          actorUserId: user.id,
          actorRole: user.role,
        }),
        getSchoolRules().catch(() => ({ schedule: DEFAULT_FLIGHT_SCHEDULE_RULES })),
      ]);
      setScheduleRules(rules.schedule);
      setWeekData(data);
      const savedDraft = readSavedPreview(weekStart);
      const nextInstructorConfigs = normalizeInstructorConfigs(data.instructors, savedDraft?.instructorConfigs ?? []);
      setInstructorConfigs(nextInstructorConfigs);
      if (savedDraft) {
        setPreview(makePreviewShell(savedDraft.suggestions));
        setEditableSuggestions(savedDraft.suggestions);
        setMinGapMinutes(savedDraft.minGapMinutes || 30);
        setSavedPreviewAt(savedDraft.savedAt);
      } else {
        setPreview(null);
        setEditableSuggestions([]);
        setSavedPreviewAt(null);
      }
      setVisibleAircraft(data.supplies.map((s) => s.aircraftRegistration));
      setVisibleInstructors(["__none__", ...data.instructors.map((s) => s.userId)]);
      setPersistedCount(0);
      setHasUnsavedPreviewChanges(false);
    } catch (e) {
      setError((e as Error).message);
      setWeekData(null);
    } finally {
      setWeekLoading(false);
    }
  }, [readSavedPreview, user]);

  useEffect(() => {
    if (!user) return;
    setBootLoading(true);
    void getScheduleWeekOptions({ onlyFuture: true, excludeClosed: true })
      .then((weeks) => {
        setWeekOptions(weeks);
        const preferred = weeks[0]?.weekStart ?? "";
        setSelectedWeekStart(preferred);
        if (preferred) {
          void loadWeek(preferred);
        } else {
          setWeekData(null);
          setInstructorConfigs([]);
        }
        setBootLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setBootLoading(false);
      });
  }, [loadWeek, user]);

  useEffect(() => {
    if (!hasUnsavedPreviewChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedPreviewChanges]);

  const requestSummary = useMemo(() => {
    if (!weekData) return null;
    const totalFlights = weekData.demands.length;
    const totalHours = weekData.demands.reduce((acc, d) => acc + d.durationHours, 0);
    const totalStudents = new Set(weekData.demands.map((d) => d.studentId)).size;
    return { totalFlights, totalHours, totalStudents };
  }, [weekData]);

  const availabilitySummary = useMemo(() => {
    if (!weekData) return null;
    let totalSlots = 0;
    let preferredSlots = 0;
    let totalDailyCaps = 0;
    for (const supply of weekData.supplies) {
      for (const state of Object.values(supply.slotStates)) {
        if (state === "blocked") continue;
        totalSlots += 1;
        if (state === "preferred") preferredSlots += 1;
      }
      for (const cap of Object.values(supply.dailyCaps)) {
        totalDailyCaps += cap;
      }
    }
    return {
      aircraftCount: weekData.supplies.length,
      totalSlots,
      preferredSlots,
      totalDailyCaps,
    };
  }, [weekData]);

  const validationErrors = useMemo(() => {
    if (!weekData || editableSuggestions.length === 0) return new Map<string, string>();
    return validateSuggestions(editableSuggestions, weekData, minGapMinutes);
  }, [editableSuggestions, minGapMinutes, weekData]);

  const canGenerateForSelectedWeek = useMemo(() => {
    if (!weekData) return false;
    return weekData.week.isFuture && !weekData.week.isClosed;
  }, [weekData]);

  const demandsByStudent = useMemo(() => {
    if (!weekData) return new Map<string, StudentRequestDemand[]>();
    const map = new Map<string, StudentRequestDemand[]>();
    for (const demand of weekData.demands) {
      const rows = map.get(demand.studentId) ?? [];
      rows.push(demand);
      map.set(demand.studentId, rows);
    }
    for (const [studentId, rows] of map) {
      rows.sort((a, b) => a.priorityLevel - b.priorityLevel || a.durationHours - b.durationHours);
      map.set(studentId, rows);
    }
    return map;
  }, [weekData]);

  const dynamicStudentSummary = useMemo(
    () => (weekData ? summarizeStudents(weekData.demands, editableSuggestions) : []),
    [editableSuggestions, weekData],
  );

  const servedStudents = useMemo(
    () => dynamicStudentSummary.filter((row) => row.fullyServed),
    [dynamicStudentSummary],
  );
  const notServedStudents = useMemo(
    () => dynamicStudentSummary.filter((row) => !row.fullyServed),
    [dynamicStudentSummary],
  );

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorIdentity>();
    for (const instructor of weekData?.instructors ?? []) map.set(instructor.userId, instructor);
    return map;
  }, [weekData]);

  function withAutoInstructorAssignments(
    suggestions: ScheduledFlightSuggestion[],
    configs: InstructorWeeklyConfig[] = instructorConfigs,
  ): ScheduledFlightSuggestion[] {
    if (!weekData) return suggestions.map(normalizeSuggestion);
    return assignInstructorsToSuggestions({
      suggestions: suggestions.map(normalizeSuggestion),
      instructors: weekData.instructors,
      instructorConfigs: configs,
      existingFlights: weekData.existingGeneratedFlights,
    });
  }

  function updateInstructorConfigsAndAssignments(updater: (configs: InstructorWeeklyConfig[]) => InstructorWeeklyConfig[]) {
    const nextConfigs = updater(instructorConfigs);
    setInstructorConfigs(nextConfigs);
    setEditableSuggestions((prev) => withAutoInstructorAssignments(prev, nextConfigs));
    setHasUnsavedPreviewChanges(true);
  }

  function resolveInstructorDraft(instructorId: string | null): Pick<FlightEditDraft, "instructorId" | "instructorLabel" | "instructorAnac"> {
    if (!instructorId) {
      return { instructorId: null, instructorLabel: null, instructorAnac: null };
    }
    const instructor = instructorById.get(instructorId);
    return {
      instructorId,
      instructorLabel: instructor?.label ?? instructorId,
      instructorAnac: instructor?.anacCode ?? null,
    };
  }

  async function handleGeneratePreview() {
    if (!weekData) return;
    if (!canGenerateForSelectedWeek) {
      setError("Apenas semanas futuras e não fechadas podem ser carregadas no gerador.");
      return;
    }
    setGeneratingPreview(true);
    setError(null);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const configs = normalizeInstructorConfigs(weekData.instructors, instructorConfigs);
      setInstructorConfigs(configs);
      const generated = generateSchedulePreview({
        weekStart: weekData.week.weekStart,
        supplies: weekData.supplies,
        demands: weekData.demands,
        existingFlights: weekData.existingGeneratedFlights,
        instructors: weekData.instructors,
        instructorConfigs: configs,
        minGapMinutes,
        allowNightFlights: scheduleRules.allowNightFlights,
        nightFlightStartHour: scheduleRules.nightFlightStartHour,
      });
      setPreview(generated);
      setEditableSuggestions(generated.suggestions);
      setVisibleAircraft(weekData.supplies.map((s) => s.aircraftRegistration));
      setVisibleInstructors(["__none__", ...weekData.instructors.map((s) => s.userId)]);
      setHasUnsavedPreviewChanges(true);
    } finally {
      setGeneratingPreview(false);
    }
  }

  async function handleRegenerateFromRules() {
    if (!weekData) return;
    if (!canGenerateForSelectedWeek) {
      setError("Apenas semanas futuras e não fechadas podem ser carregadas no gerador.");
      return;
    }
    const regenerated = generateSchedulePreview({
      weekStart: weekData.week.weekStart,
      supplies: weekData.supplies,
      demands: weekData.demands,
      existingFlights: weekData.existingGeneratedFlights,
      instructors: weekData.instructors,
      instructorConfigs,
      minGapMinutes,
      allowNightFlights: scheduleRules.allowNightFlights,
      nightFlightStartHour: scheduleRules.nightFlightStartHour,
    });
    setPreview(regenerated);
    setEditableSuggestions(regenerated.suggestions);
    setVisibleAircraft(weekData.supplies.map((s) => s.aircraftRegistration));
    setVisibleInstructors(["__none__", ...weekData.instructors.map((s) => s.userId)]);
    clearSavedPreview(weekData.week.weekStart);
    setHasUnsavedPreviewChanges(true);
  }

  function handleSavePreviewDraft() {
    if (!weekData || editableSuggestions.length === 0) {
      setError("Gere ou carregue um preview antes de salvar.");
      return;
    }
    savePreviewDraftToStorage(weekData.week.weekStart, editableSuggestions);
    setHasUnsavedPreviewChanges(false);
  }

  async function handlePersistScale() {
    if (!user || !weekData) return;
    if (!canGenerateForSelectedWeek) {
      setError("Não é possível gerar escala final para semana já fechada ou que não seja futura.");
      return;
    }
    if (editableSuggestions.length === 0) {
      setError("Nenhum voo no preview para persistir.");
      return;
    }
    if (validationErrors.size > 0) {
      setError("Existem conflitos no preview. Ajuste antes de gerar a escala final.");
      return;
    }

    setPersisting(true);
    setError(null);
    try {
      const byDemand = new Map(weekData.existingGeneratedFlights.map((row) => [row.demandId, row]));
      let successCount = 0;
      const notificationEvents: Array<{
        eventType: "flight.scheduled" | "flight.updated";
        flightId: string;
        aircraft: string;
        flightDate: string;
        startTime: string;
      }> = [];
      for (const suggestion of editableSuggestions) {
        const student = weekData.students.find((row) => row.userId === suggestion.studentId);
        const instructor = suggestion.instructorId ? instructorById.get(suggestion.instructorId) ?? null : null;
        const meta = buildAutoMeta(suggestion, weekData.week.weekStart, student?.anacCode ?? null, instructor);
        const csvText = encodeFlightRecord({ meta, telemetryCsv: "" });
        const payload = {
          actorUserId: user.id,
          actorRole: user.role,
          studentUserId: suggestion.studentId,
          instructorUserId: suggestion.instructorId,
          source_filename: `${AUTO_SOURCE_PREFIX}${weekData.week.weekStart}.csv`,
          csv_text: csvText,
          aircraft_ident: suggestion.aircraftRegistration,
          duration_sec: Math.round(suggestion.durationHours * 3600),
        } as const;

        const existing = byDemand.get(suggestion.demandId);
        if (existing) {
          const flightDate = weekDateFromStart(weekData.week.weekStart, suggestion.dayOfWeek);
          const startTime = hoursToHHMM(suggestion.startHour);
          const previousSignature = scheduleSignature(
            existing.date,
            existing.startTime,
            composeEndTime(parseStartHour(existing.startTime), existing.durationHours),
          );
          const nextSignature = scheduleSignature(flightDate, startTime, composeEndTime(suggestion.startHour, suggestion.durationHours));
          const result = await updateFlight(existing.id, payload);
          if (result.error) throw result.error;
          if (previousSignature !== nextSignature) {
            notificationEvents.push({
              eventType: "flight.updated",
              flightId: existing.id,
              aircraft: suggestion.aircraftRegistration,
              flightDate,
              startTime,
            });
          }
        } else {
          const result = await insertFlight(payload);
          if (result.error) throw result.error;
          if (result.id) {
            notificationEvents.push({
              eventType: "flight.scheduled",
              flightId: result.id,
              aircraft: suggestion.aircraftRegistration,
              flightDate: weekDateFromStart(weekData.week.weekStart, suggestion.dayOfWeek),
              startTime: hoursToHHMM(suggestion.startHour),
            });
          }
        }
        successCount += 1;
      }

      setPersistedCount(successCount);
      const closed = await closeScheduleWeek(weekData.week.weekStart);
      for (const event of notificationEvents) {
        void dispatchNotificationEvent({
          eventType: event.eventType,
          flightId: event.flightId,
          dedupeKey:
            event.eventType === "flight.scheduled"
              ? `flight.scheduled:${event.flightId}`
              : `flight.updated:${event.flightId}:${closed.closedAt}`,
          actorUserId: user.id,
          data: {
            aircraft: event.aircraft,
            flightDate: event.flightDate,
            startTime: event.startTime,
          },
        });
      }
      setLastClosedWeekMessage(
        `Semana ${weekData.week.label} fechada em ${new Date(closed.closedAt).toLocaleString("pt-BR")}.`,
      );
      clearSavedPreview(weekData.week.weekStart);
      setHasUnsavedPreviewChanges(false);
      const refreshedOptions = await getScheduleWeekOptions({ onlyFuture: true, excludeClosed: true });
      setWeekOptions(refreshedOptions);
      const nextWeek = refreshedOptions[0]?.weekStart ?? "";
      setSelectedWeekStart(nextWeek);
      if (nextWeek) {
        await loadWeek(nextWeek);
      } else {
        setWeekData(null);
        setPreview(null);
        setEditableSuggestions([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPersisting(false);
    }
  }

  function updateSuggestion(
    demandId: string,
    updater: (row: ScheduledFlightSuggestion) => ScheduledFlightSuggestion,
  ) {
    setEditableSuggestions((prev) =>
      withAutoInstructorAssignments(prev.map((row) => (row.demandId === demandId ? updater(row) : row))),
    );
    setHasUnsavedPreviewChanges(true);
  }

  function removeSuggestion(demandId: string) {
    setEditableSuggestions((prev) => prev.filter((row) => row.demandId !== demandId));
    setHasUnsavedPreviewChanges(true);
  }

  function openEditFlightModal(suggestion: ScheduledFlightSuggestion) {
    setFlightModalMode("edit");
    setFlightModalDraft({
      demandId: suggestion.demandId,
      studentId: suggestion.studentId,
      instructorId: suggestion.instructorId,
      instructorLabel: suggestion.instructorLabel,
      instructorAnac: suggestion.instructorAnac,
      aircraftRegistration: suggestion.aircraftRegistration,
      dayOfWeek: suggestion.dayOfWeek,
      startHour: (suggestion.isNight ?? false) ? scheduleRules.nightFlightStartHour : suggestion.startHour,
      durationHours: suggestion.durationHours,
      isNight: suggestion.isNight ?? false,
    });
  }

  function openCreateFlightModal() {
    if (!weekData) return;
    const firstStudent = weekData.students[0];
    const firstSupply = weekData.supplies[0];
    const firstInstructor = weekData.instructors[0] ?? null;
    if (!firstStudent || !firstSupply) {
      setError("É preciso ter alunos e aeronaves para adicionar voo manual.");
      return;
    }
    setFlightModalMode("create");
    setFlightModalDraft({
      demandId: `manual-${crypto.randomUUID()}`,
      studentId: firstStudent.userId,
      ...resolveInstructorDraft(firstInstructor?.userId ?? null),
      aircraftRegistration: firstSupply.aircraftRegistration,
      dayOfWeek: 1,
      startHour: SLOT_HOURS[0] ?? 6,
      durationHours: 1,
      isNight: false,
    });
  }

  function handleSaveFlightModal() {
    if (!weekData || !flightModalDraft) return;
    const studentLabel =
      weekData.students.find((row) => row.userId === flightModalDraft.studentId)?.label ?? flightModalDraft.studentId;
    const next = buildSuggestionFromDraft(flightModalDraft, weekData.week.weekStart, studentLabel, scheduleRules);
    if (flightModalMode === "create") {
      setEditableSuggestions((prev) => withAutoInstructorAssignments([...prev, next]));
    } else {
      setEditableSuggestions((prev) => withAutoInstructorAssignments(prev.map((row) => (row.demandId === next.demandId ? next : row))));
    }
    setFlightModalDraft(null);
    setHasUnsavedPreviewChanges(true);
  }

  const sortedEditableSuggestions = useMemo(
    () => [...editableSuggestions].sort(compareByDayAndHour),
    [editableSuggestions],
  );

  const hourOptions = useMemo(() => buildScheduleHourOptions(scheduleRules), [scheduleRules]);

  const colorByAircraft = useMemo(() => {
    const regs = [...new Set((weekData?.supplies ?? []).map((s) => s.aircraftRegistration))];
    const map = new Map<string, string>();
    regs.forEach((reg, index) => {
      map.set(reg, AIRCRAFT_COLOR_CLASSES[index % AIRCRAFT_COLOR_CLASSES.length]!);
    });
    return map;
  }, [weekData]);

  const borderByInstructor = useMemo(() => {
    const map = new Map<string, string>();
    (weekData?.instructors ?? []).forEach((instructor, index) => {
      map.set(instructor.userId, INSTRUCTOR_BORDER_CLASSES[index % INSTRUCTOR_BORDER_CLASSES.length]!);
    });
    return map;
  }, [weekData]);

  const totalWeightByDemand = useMemo(() => {
    const map = new Map<string, string>();
    if (!weekData) return map;
    for (const row of editableSuggestions) {
      const student = weekData.students.find((s) => s.userId === row.studentId);
      const instructor = row.instructorId ? instructorById.get(row.instructorId) : null;
      const total = (student?.weightKg ?? 0) + (instructor?.weightKg ?? 0);
      map.set(row.demandId, total > 0 ? `${total}kg` : "—");
    }
    return map;
  }, [editableSuggestions, instructorById, weekData]);

  const instructorSummary = useMemo(() => {
    if (!weekData) return [];
    return weekData.instructors.map((instructor) => {
      const rows = editableSuggestions.filter((row) => row.instructorId === instructor.userId);
      const hours = rows.reduce((acc, row) => acc + row.durationHours, 0);
      return { instructor, flights: rows.length, hours: Number(hours.toFixed(1)) };
    });
  }, [editableSuggestions, weekData]);

  const unassignedInstructorCount = useMemo(
    () => editableSuggestions.filter((row) => !row.instructorId).length,
    [editableSuggestions],
  );

  const filteredSuggestions = useMemo(
    () =>
      sortedEditableSuggestions.filter(
        (s) =>
          visibleAircraft.includes(s.aircraftRegistration) &&
          (s.instructorId ? visibleInstructors.includes(s.instructorId) : visibleInstructors.includes("__none__")),
      ),
    [sortedEditableSuggestions, visibleAircraft, visibleInstructors],
  );

  const selectedSupplyForBackground = useMemo(() => {
    if (!weekData || visibleAircraft.length !== 1) return null;
    const reg = visibleAircraft[0];
    return weekData.supplies.find((s) => s.aircraftRegistration === reg) ?? null;
  }, [visibleAircraft, weekData]);

  const requestsByStudent = useMemo(() => {
    if (!weekData) return [];
    return weekData.students
      .map((student) => ({
        student,
        demands: weekData.demands
          .filter((d) => d.studentId === student.userId)
          .sort((a, b) => a.priorityLevel - b.priorityLevel || a.durationHours - b.durationHours),
      }))
      .filter((entry) => entry.demands.length > 0);
  }, [weekData]);

  const selectedStudentRequests = useMemo(() => {
    if (!selectedStudentId) return null;
    const student = weekData?.students.find((row) => row.userId === selectedStudentId);
    const demands = demandsByStudent.get(selectedStudentId) ?? [];
    const suggestions = editableSuggestions
      .filter((row) => row.studentId === selectedStudentId)
      .sort(compareByDayAndHour);
    if (!student) return null;
    return { student, demands, suggestions };
  }, [demandsByStudent, editableSuggestions, selectedStudentId, weekData]);

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Escala Automática</h2>
        <p className="text-xs text-slate-500">Cruze intenções dos alunos com disponibilidade operacional e gere voos.</p>
      </div>

      <section className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Semana</p>
          <select
            value={selectedWeekStart}
            onChange={(e) => {
              const value = e.target.value;
              if (
                hasUnsavedPreviewChanges &&
                !window.confirm("Existem alterações no preview não salvas. Deseja trocar de semana mesmo assim?")
              ) {
                return;
              }
              setSelectedWeekStart(value);
              void loadWeek(value);
            }}
            disabled={bootLoading}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
          >
            {weekOptions.length === 0 ? <option value="">Sem semanas elegíveis</option> : null}
            {weekOptions.map((week) => (
              <option key={week.weekStart} value={week.weekStart}>
                {week.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Intervalo mínimo entre voos</p>
          <input
            type="number"
            min={0}
            max={180}
            value={minGapMinutes}
            onChange={(e) => setMinGapMinutes(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void handleGeneratePreview()}
            disabled={!weekData || weekLoading || bootLoading || generatingPreview || !canGenerateForSelectedWeek}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {generatingPreview ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            ) : null}
            {generatingPreview ? "Gerando preview..." : "Gerar preview da escala"}
          </button>
        </div>
      </section>

      {bootLoading ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8">
          <div className="flex items-center justify-center gap-3 text-sm text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            Carregando semanas...
          </div>
        </section>
      ) : null}

      {weekLoading && weekData ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            Atualizando dados da semana selecionada...
          </div>
        </section>
      ) : null}

      {weekData && !bootLoading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo de solicitações</p>
              <button
                type="button"
                onClick={() => setRequestsModalOpen(true)}
                className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                Ver solicitações
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{requestSummary?.totalStudents ?? 0}</p>
                <p className="text-[11px] text-slate-500">Alunos</p>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{requestSummary?.totalFlights ?? 0}</p>
                <p className="text-[11px] text-slate-500">Voos solicitados</p>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{(requestSummary?.totalHours ?? 0).toFixed(1)}h</p>
                <p className="text-[11px] text-slate-500">Horas</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo de disponibilidade</p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{availabilitySummary?.aircraftCount ?? 0}</p>
                <p className="text-[11px] text-slate-500">Aviões</p>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{availabilitySummary?.totalSlots ?? 0}</p>
                <p className="text-[11px] text-slate-500">Slots</p>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{availabilitySummary?.preferredSlots ?? 0}</p>
                <p className="text-[11px] text-slate-500">Preferenciais</p>
              </div>
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                <p className="text-lg font-semibold text-slate-100">{(availabilitySummary?.totalDailyCaps ?? 0).toFixed(1)}h</p>
                <p className="text-[11px] text-slate-500">Caps/dia</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {weekOptions.length === 0 && !bootLoading ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Não há semanas futuras abertas para o gerador no momento.
        </section>
      ) : null}

      {weekData && savedPreviewAt && !preview ? (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-sky-200">Existe um preview salvo para esta semana ({new Date(savedPreviewAt).toLocaleString("pt-BR")}).</p>
            <button
              type="button"
              onClick={() => {
                const draft = readSavedPreview(weekData.week.weekStart);
                if (!draft) return;
                const configs = normalizeInstructorConfigs(weekData.instructors, draft.instructorConfigs);
                setInstructorConfigs(configs);
                setPreview(makePreviewShell(draft.suggestions));
                setEditableSuggestions(draft.suggestions);
                setMinGapMinutes(draft.minGapMinutes || 30);
                setHasUnsavedPreviewChanges(false);
              }}
              className="rounded border border-sky-300/40 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
            >
              Carregar preview salvo
            </button>
          </div>
        </section>
      ) : null}

      {preview ? (
        <>
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Instrutores da semana</p>
                <p className="text-xs text-slate-500">Configure disponibilidade e preferência para recalcular instrutores automáticos.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const configs = normalizeInstructorConfigs(weekData?.instructors ?? []);
                  setInstructorConfigs(configs);
                  setEditableSuggestions((prev) => withAutoInstructorAssignments(prev, configs));
                  setHasUnsavedPreviewChanges(true);
                }}
                disabled={!weekData || (weekData.instructors.length === 0)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Resetar disponibilidade
              </button>
            </div>
            {weekData && weekData.instructors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wider text-slate-500">
                      <th className="border-b border-slate-700 px-2 py-2">Instrutor</th>
                      <th className="border-b border-slate-700 px-2 py-2">Peso / altura</th>
                      <th className="border-b border-slate-700 px-2 py-2">Semana</th>
                      {INSTRUCTOR_DAY_ORDER.map((day) => (
                        <th key={day} className="border-b border-slate-700 px-2 py-2 text-center">
                          {DAY_LABEL[day]}
                        </th>
                      ))}
                      <th className="border-b border-slate-700 px-2 py-2">Preferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekData.instructors.map((instructor) => {
                      const config =
                        instructorConfigs.find((row) => row.instructorId === instructor.userId) ??
                        makeDefaultInstructorConfig(instructor.userId);
                      return (
                        <tr key={instructor.userId} className="border-b border-slate-800/60">
                          <td className="px-2 py-2">
                            <p className="font-medium text-slate-200">{instructor.label}</p>
                            <p className="text-[11px] text-slate-500">ANAC {instructor.anacCode || "—"}</p>
                          </td>
                          <td className="px-2 py-2 text-slate-300">{formatInstructorPhysical(instructor)}</td>
                          <td className="px-2 py-2">
                            <label className="inline-flex items-center gap-2 text-slate-300">
                              <input
                                type="checkbox"
                                checked={config.availableThisWeek}
                                onChange={(e) => {
                                  updateInstructorConfigsAndAssignments((prev) =>
                                    normalizeInstructorConfigs(weekData.instructors, prev).map((row) =>
                                      row.instructorId === instructor.userId
                                        ? { ...row, availableThisWeek: e.target.checked }
                                        : row,
                                    ),
                                  );
                                }}
                              />
                              Disponível
                            </label>
                          </td>
                          {INSTRUCTOR_DAY_ORDER.map((day) => (
                            <td key={`${instructor.userId}-${day}`} className="px-2 py-2">
                              <div className="flex flex-col gap-1">
                                {(["morning", "afternoon", "night"] as const).map((period) => {
                                  const availability =
                                    config.availability.find((row) => row.dayOfWeek === day && row.period === period) ?? {
                                      dayOfWeek: day,
                                      period,
                                      available: false,
                                      availabilityType: "available" as const,
                                    };
                                  return (
                                    <button
                                      key={period}
                                      type="button"
                                      disabled={!config.availableThisWeek}
                                      onClick={() => {
                                          updateInstructorConfigsAndAssignments((prev) =>
                                            normalizeInstructorConfigs(weekData.instructors, prev).map((row) =>
                                              row.instructorId === instructor.userId
                                                ? {
                                                    ...row,
                                                    availability: row.availability.map((entry) =>
                                                      entry.dayOfWeek === day && entry.period === period
                                                        ? cycleInstructorAvailability(entry)
                                                        : entry,
                                                    ),
                                                  }
                                                : row,
                                            ),
                                          );
                                        }}
                                      className={`flex h-9 w-full flex-col items-center justify-center gap-0.5 rounded-md border transition-all duration-75 disabled:opacity-40 ${instructorAvailabilityCellClass(availability)}`}
                                      aria-label={`${DAY_LABEL[day]} ${PERIOD_LABEL[period]}`}
                                    >
                                      <span className="text-[9px] font-medium uppercase leading-none opacity-80">
                                        {PERIOD_LABEL[period]}
                                      </span>
                                      {availability.available && availability.availabilityType === "preferred" ? (
                                        <span className="text-[10px] font-bold leading-none">★</span>
                                      ) : availability.available ? (
                                        <span className="text-[10px] leading-none">✓</span>
                                      ) : (
                                        <span className="text-[10px] leading-none opacity-40">—</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            <select
                              value={config.preferenceLevel}
                              onChange={(e) => {
                                const preferenceLevel = e.target.value as InstructorWeeklyConfig["preferenceLevel"];
                                updateInstructorConfigsAndAssignments((prev) =>
                                  normalizeInstructorConfigs(weekData.instructors, prev).map((row) =>
                                    row.instructorId === instructor.userId ? { ...row, preferenceLevel } : row,
                                  ),
                                );
                              }}
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100"
                            >
                              {(["low", "medium", "high"] as const).map((level) => (
                                <option key={level} value={level}>
                                  {INSTRUCTOR_PREFERENCE_LABEL[level]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            ) : (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Nenhum instrutor encontrado nos perfis. Cadastre perfis com papel de instrutor antes de fechar a escala.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preview + edição manual</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRegenerateFromRules()}
                  disabled={!weekData}
                  className="rounded-lg border border-amber-500/60 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-600/15 disabled:opacity-40"
                >
                  Rodar preview novamente
                </button>
                <button
                  type="button"
                  onClick={() => openCreateFlightModal()}
                  className="rounded-lg border border-violet-500/60 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-600/20"
                >
                  Adicionar voo
                </button>
              </div>
            </div>

            {savedPreviewAt ? (
              <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                Preview salvo em {new Date(savedPreviewAt).toLocaleString("pt-BR")}.
              </div>
            ) : null}

            {persistedCount > 0 ? (
              <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {persistedCount} voo(s) criado(s)/atualizado(s).
              </div>
            ) : null}

            {unassignedInstructorCount > 0 ? (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {unassignedInstructorCount} voo(s) sem instrutor. A escala pode ser salva, mas esses voos ficam destacados na agenda.
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="border-b border-slate-700 px-2 py-2">Aluno</th>
                    <th className="border-b border-slate-700 px-2 py-2">Aeronave</th>
                    <th className="border-b border-slate-700 px-2 py-2">Dia</th>
                    <th className="border-b border-slate-700 px-2 py-2">Hora</th>
                    <th className="border-b border-slate-700 px-2 py-2">Duração</th>
                    <th className="border-b border-slate-700 px-2 py-2">Instrutor</th>
                    <th className="border-b border-slate-700 px-2 py-2">Peso total</th>
                    <th className="border-b border-slate-700 px-2 py-2">Status</th>
                    <th className="border-b border-slate-700 px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEditableSuggestions.map((row) => {
                    const rowError = validationErrors.get(row.demandId);
                    return (
                      <tr key={row.demandId} className="border-b border-slate-800/60">
                        <td className="px-2 py-2 text-slate-200">{studentDisplayLine(row, weekData)}</td>
                        <td className="px-2 py-2">
                          <select
                            value={row.aircraftRegistration}
                            onChange={(e) =>
                              updateSuggestion(row.demandId, (current) => ({
                                ...current,
                                aircraftRegistration: e.target.value,
                              }))
                            }
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                          >
                            {[...new Set(weekData?.supplies.map((s) => s.aircraftRegistration) ?? [])].map((reg) => (
                              <option key={reg} value={reg}>
                                {reg}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={row.dayOfWeek}
                            onChange={(e) =>
                              updateSuggestion(row.demandId, (current) => {
                                const day = Number(e.target.value);
                                return {
                                  ...current,
                                  dayOfWeek: day,
                                  weekDate: weekDateFromStart(weekData?.week.weekStart ?? current.weekDate, day),
                                };
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                          >
                            {DAY_ORDER.map((day) => (
                              <option key={day} value={day}>
                                {DAY_LABEL[day]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={hourSelectValue(row.isNight, row.startHour)}
                            onChange={(e) => {
                              const parsed = parseHourSelectValue(e.target.value, scheduleRules);
                              updateSuggestion(row.demandId, (current) => ({
                                ...current,
                                startHour: parsed.startHour,
                                isNight: parsed.isNight,
                                startTime: hoursToHHMM(parsed.startHour),
                                endTime: composeEndTime(parsed.startHour, current.durationHours),
                              }));
                            }}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                          >
                            {hourOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0.5}
                            max={3}
                            step={0.5}
                            value={row.durationHours}
                            onChange={(e) =>
                              updateSuggestion(row.demandId, (current) => {
                                const duration = Number(e.target.value);
                                return {
                                  ...current,
                                  durationHours: duration,
                                  endTime: composeEndTime(current.startHour, duration),
                                };
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={row.instructorId ?? ""}
                            onChange={(e) => {
                              const next = resolveInstructorDraft(e.target.value || null);
                              updateSuggestion(row.demandId, (current) => ({
                                ...current,
                                ...next,
                                instructorAssignmentMode: "manual",
                              }));
                            }}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                          >
                            <option value="">Sem instrutor</option>
                            {weekData?.instructors.map((instructor) => (
                              <option key={instructor.userId} value={instructor.userId}>
                                {instructor.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {row.instructorId ? (row.instructorAssignmentMode === "manual" ? "Manual" : "Auto") : "Sem instrutor"}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-slate-300">{totalWeightByDemand.get(row.demandId) ?? "—"}</td>
                        <td className="px-2 py-2 text-xs">
                          {rowError ? (
                            <span className="text-red-300">{rowError}</span>
                          ) : !row.instructorId ? (
                            <span className="text-amber-300">Sem instrutor</span>
                          ) : (
                            <span className="text-emerald-300">OK</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditFlightModal(row)}
                              className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSuggestion(row.demandId)}
                              className="rounded border border-red-500/40 px-2 py-1 text-red-300 hover:bg-red-500/10"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo por instrutor</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {instructorSummary.map((row) => (
                <article key={row.instructor.userId} className={`rounded-xl border bg-slate-800/30 p-3 ${borderByInstructor.get(row.instructor.userId) ?? "border-slate-700"}`}>
                  <p className="truncate text-sm font-semibold text-slate-100">{row.instructor.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{row.hours.toFixed(1)}h previstas</p>
                  <p className="text-xs text-slate-500">{row.flights} voos</p>
                </article>
              ))}
              <article className="rounded-xl border border-red-300 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-100">Sem instrutor</p>
                <p className="mt-1 text-xs text-amber-200">{unassignedInstructorCount} voos</p>
              </article>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Filtros</p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Aeronaves</p>
                <div className="flex flex-wrap gap-2">
                  {weekData?.supplies.map((supply) => {
                    const checked = visibleAircraft.includes(supply.aircraftRegistration);
                    const color = colorByAircraft.get(supply.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!;
                    return (
                      <label
                        key={supply.aircraftId}
                        className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setVisibleAircraft((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, supply.aircraftRegistration])]
                                : prev.filter((reg) => reg !== supply.aircraftRegistration),
                            );
                          }}
                        />
                        <span className={`h-3 w-3 rounded border ${color}`} />
                        {supply.aircraftRegistration}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Instrutores</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={visibleInstructors.includes("__none__")}
                      onChange={(e) => {
                        setVisibleInstructors((prev) =>
                          e.target.checked ? [...new Set([...prev, "__none__"])] : prev.filter((id) => id !== "__none__"),
                        );
                      }}
                    />
                    <span className="h-3 w-3 rounded border-2 border-red-300 bg-slate-800" />
                    Sem instrutor
                  </label>
                  {weekData?.instructors.map((instructor) => {
                    const checked = visibleInstructors.includes(instructor.userId);
                    const border = borderByInstructor.get(instructor.userId) ?? "border-white/80";
                    return (
                      <label
                        key={instructor.userId}
                        className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setVisibleInstructors((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, instructor.userId])]
                                : prev.filter((id) => id !== instructor.userId),
                            );
                          }}
                        />
                        <span className={`h-3 w-3 rounded border-2 ${border} bg-slate-800`} />
                        {instructor.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <CalendarGrid
            suggestions={filteredSuggestions}
            title="Agenda semanal"
            weekStart={weekData?.week.weekStart ?? selectedWeekStart}
            colorByAircraft={colorByAircraft}
            borderByInstructor={borderByInstructor}
            totalWeightByDemand={totalWeightByDemand}
            backgroundSupply={selectedSupplyForBackground}
            onSuggestionClick={(suggestion) => openEditFlightModal(suggestion)}
            onItemDrop={(suggestion, target) => {
              openEditFlightModal(suggestion);
              setFlightModalDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      dayOfWeek: target.dayOfWeek,
                      startHour: target.isNight ? scheduleRules.nightFlightStartHour : target.startHour,
                      isNight: target.isNight,
                    }
                  : prev,
              );
            }}
          />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos atendidos</p>
              <div className="space-y-2">
                {servedStudents.map((row) => {
                  return (
                    <button
                      key={row.studentId}
                      type="button"
                      onClick={() => setSelectedStudentId(row.studentId)}
                      className="w-full rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left text-sm hover:bg-slate-800/60"
                    >
                      <p className="font-medium text-slate-200">{row.studentLabel}</p>
                      <p className="text-xs text-slate-500">
                        {row.allocatedFlights}/{row.requestedFlights} voos · {row.allocatedHours.toFixed(1)}/{row.requestedHours.toFixed(1)}h
                      </p>
                      <p className="text-xs text-emerald-300">Atendido</p>
                    </button>
                  );
                })}
                {servedStudents.length === 0 ? <p className="text-sm text-slate-400">Nenhum aluno totalmente atendido.</p> : null}
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
                      key={row.studentId}
                      type="button"
                      onClick={() => setSelectedStudentId(row.studentId)}
                      className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left text-sm hover:bg-red-500/10"
                    >
                      <p className="font-medium text-slate-200">{row.studentLabel}</p>
                      <p className="text-xs text-red-300">
                        {row.allocatedFlights}/{row.requestedFlights} voos · {row.allocatedHours.toFixed(1)}/{row.requestedHours.toFixed(1)}h
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

        </>
      ) : null}

      {weekData?.existingGeneratedFlights && weekData.existingGeneratedFlights.length > 0 ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Escalas já geradas</p>
            <button
              type="button"
              onClick={() => {
                const studentMap = new Map(weekData.students.map((s) => [s.userId, s.label]));
                const loaded = weekData.existingGeneratedFlights.map((row) =>
                  normalizeSuggestion(toGeneratedSuggestion(row, weekData.week.weekStart, studentMap.get(row.studentId) ?? row.studentId)),
                );
                setPreview(makePreviewShell(loaded));
                setEditableSuggestions(loaded);
                setVisibleAircraft(weekData.supplies.map((s) => s.aircraftRegistration));
                setVisibleInstructors(["__none__", ...weekData.instructors.map((s) => s.userId)]);
                setHasUnsavedPreviewChanges(true);
              }}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Carregar na edição
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="border-b border-slate-700 px-2 py-2">Demanda</th>
                  <th className="border-b border-slate-700 px-2 py-2">Aluno</th>
                  <th className="border-b border-slate-700 px-2 py-2">Instrutor</th>
                  <th className="border-b border-slate-700 px-2 py-2">Aeronave</th>
                  <th className="border-b border-slate-700 px-2 py-2">Data</th>
                  <th className="border-b border-slate-700 px-2 py-2">Início</th>
                  <th className="border-b border-slate-700 px-2 py-2">Duração</th>
                </tr>
              </thead>
              <tbody>
                {weekData.existingGeneratedFlights.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/60">
                    <td className="px-2 py-2 font-mono text-xs text-slate-400">{row.demandId.slice(0, 8)}</td>
                    <td className="px-2 py-2 text-slate-200">{row.studentId}</td>
                    <td className="px-2 py-2 text-slate-300">{row.instructorLabel ?? row.instructorId ?? "—"}</td>
                    <td className="px-2 py-2 text-slate-300">{row.aircraftRegistration ?? "—"}</td>
                    <td className="px-2 py-2 text-slate-400">{row.date}</td>
                    <td className="px-2 py-2 text-slate-400">{row.startTime}</td>
                    <td className="px-2 py-2 text-slate-400">{row.durationHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => handleSavePreviewDraft()}
              disabled={editableSuggestions.length === 0}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Salvar preview
            </button>
            <button
              type="button"
              onClick={() => setFinalConfirmOpen(true)}
              disabled={
                persisting ||
                editableSuggestions.length === 0 ||
                validationErrors.size > 0 ||
                !canGenerateForSelectedWeek
              }
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {persisting ? "Gerando escala..." : "Gerar escala final"}
            </button>
          </div>
        </section>
      ) : null}

      {requestsModalOpen && weekData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Solicitações da semana</p>
                <p className="text-xs text-slate-500">{weekData.week.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setRequestsModalOpen(false)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[78vh] space-y-3 overflow-y-auto p-4">
              {requestsByStudent.map(({ student, demands }) => (
                <section key={student.userId} className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-3">
                  <p className="text-sm font-semibold text-slate-100">
                    {student.label} / {student.anacCode || "—"} / {student.weightKg ?? "—"}kg / {student.heightCm ?? "—"}cm
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[680px] border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wider text-slate-500">
                          <th className="border-b border-slate-700 px-2 py-1.5">Prioridade</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Duração</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Flexibilidade</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Modelo</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Disponibilidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {demands.map((demand) => (
                          <tr key={demand.demandId} className="border-b border-slate-800/60">
                            <td className="px-2 py-1.5 text-slate-200">{demand.priorityLevel}</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.durationHours.toFixed(1)}h</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.flexibilityLevel}</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.preferredModelId || "Sem preferência"}</td>
                            <td className="px-2 py-1.5 text-slate-400">
                              {demand.availability
                                .map((a) => `${DAY_LABEL[a.dayOfWeek]}-${a.period === "morning" ? "manhã" : "tarde"}(${a.availabilityType})`)
                                .join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {selectedStudentRequests ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{selectedStudentRequests.student.label}</p>
                <p className="text-xs text-slate-500">
                  {selectedStudentRequests.student.email || "Sem email"} · ANAC {selectedStudentRequests.student.anacCode || "—"}
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
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentRequests.demands.length}</p>
                  <p className="text-[11px] text-slate-500">Solicitações</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentRequests.suggestions.length}</p>
                  <p className="text-[11px] text-slate-500">Voos no preview</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentRequests.student.weightKg ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Peso kg</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentRequests.student.heightCm ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Altura cm</p>
                </div>
              </div>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Solicitações</p>
                {selectedStudentRequests.demands.length === 0 ? (
                  <p className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-sm text-slate-400">
                    Este aluno não enviou intenção de voo para a semana.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[680px] border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wider text-slate-500">
                          <th className="border-b border-slate-700 px-2 py-1.5">Prioridade</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Duração</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Flexibilidade</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Modelo</th>
                          <th className="border-b border-slate-700 px-2 py-1.5">Disponibilidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudentRequests.demands.map((demand) => (
                          <tr key={demand.demandId} className="border-b border-slate-800/60">
                            <td className="px-2 py-1.5 text-slate-200">{demand.priorityLevel}</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.durationHours.toFixed(1)}h</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.flexibilityLevel}</td>
                            <td className="px-2 py-1.5 text-slate-300">{demand.preferredModelId || "Sem preferência"}</td>
                            <td className="px-2 py-1.5 text-slate-400">
                              {demand.availability
                                .map((a) => `${DAY_LABEL[a.dayOfWeek]}-${a.period === "morning" ? "manhã" : "tarde"}(${a.availabilityType})`)
                                .join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Voos no preview</p>
                {selectedStudentRequests.suggestions.length === 0 ? (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-200">
                    Nenhum voo alocado no preview atual.
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
                        {selectedStudentRequests.suggestions.map((suggestion) => (
                          <tr key={suggestion.demandId} className="border-b border-slate-800/60">
                            <td className="px-2 py-1.5 text-slate-200">{DAY_LABEL[suggestion.dayOfWeek]}</td>
                            <td className="px-2 py-1.5 text-slate-300">{suggestion.startTime}</td>
                            <td className="px-2 py-1.5 text-slate-300">{suggestion.durationHours.toFixed(1)}h</td>
                            <td className="px-2 py-1.5 text-slate-300">{suggestion.aircraftRegistration}</td>
                            <td className="px-2 py-1.5 text-slate-300">{suggestion.instructorLabel ?? "Sem instrutor"}</td>
                            <td className="px-2 py-1.5 text-slate-300">{totalWeightByDemand.get(suggestion.demandId) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {finalConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">Gerar escala final?</p>
              <p className="mt-1 text-xs text-slate-500">Esta ação fecha a semana selecionada.</p>
            </div>
            <div className="space-y-3 p-4 text-sm text-slate-300">
              <p>
                Depois que a escala for fechada, não será possível reabrir essa semana no gerador para editar ou gerar
                novamente.
              </p>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Revise conflitos, alunos e horários antes de confirmar.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setFinalConfirmOpen(false)}
                disabled={persisting}
                className="w-full rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinalConfirmOpen(false);
                  void handlePersistScale();
                }}
                disabled={persisting}
                className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
              >
                {persisting ? "Gerando..." : "Confirmar e fechar escala"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {flightModalDraft && weekData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">{flightModalMode === "create" ? "Adicionar voo" : "Editar voo"}</p>
              <button
                type="button"
                onClick={() => setFlightModalDraft(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              <StudentSearchSelect
                label="Aluno"
                students={weekData.students}
                value={flightModalDraft.studentId}
                onChange={(student) => setFlightModalDraft((prev) => (prev ? { ...prev, studentId: student.userId } : prev))}
                className="md:col-span-2"
              />
              <label className="text-xs text-slate-400">
                Instrutor
                <select
                  value={flightModalDraft.instructorId ?? ""}
                  onChange={(e) =>
                    setFlightModalDraft((prev) => (prev ? { ...prev, ...resolveInstructorDraft(e.target.value || null) } : prev))
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  <option value="">Sem instrutor</option>
                  {weekData.instructors.map((instructor) => (
                    <option key={instructor.userId} value={instructor.userId}>
                      {instructor.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Aeronave
                <select
                  value={flightModalDraft.aircraftRegistration}
                  onChange={(e) =>
                    setFlightModalDraft((prev) => (prev ? { ...prev, aircraftRegistration: e.target.value } : prev))
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {weekData.supplies.map((supply) => (
                    <option key={supply.aircraftId} value={supply.aircraftRegistration}>
                      {supply.aircraftRegistration}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Dia
                <select
                  value={flightModalDraft.dayOfWeek}
                  onChange={(e) =>
                    setFlightModalDraft((prev) => (prev ? { ...prev, dayOfWeek: Number(e.target.value) } : prev))
                  }
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
                  value={hourSelectValue(flightModalDraft.isNight, flightModalDraft.startHour)}
                  onChange={(e) => {
                    const parsed = parseHourSelectValue(e.target.value, scheduleRules);
                    setFlightModalDraft((prev) =>
                      prev ? { ...prev, startHour: parsed.startHour, isNight: parsed.isNight } : prev,
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
                  value={flightModalDraft.durationHours}
                  onChange={(e) =>
                    setFlightModalDraft((prev) => (prev ? { ...prev, durationHours: Number(e.target.value) } : prev))
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
            </div>
            <div className="flex flex-col justify-between gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
              {flightModalMode === "edit" ? (
                <button
                  type="button"
                  onClick={() => {
                    removeSuggestion(flightModalDraft.demandId);
                    setFlightModalDraft(null);
                  }}
                  className="w-full rounded border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10 sm:w-auto"
                >
                  Excluir voo
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}
              <button
                type="button"
                onClick={() => handleSaveFlightModal()}
                className="w-full rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 sm:w-auto"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
