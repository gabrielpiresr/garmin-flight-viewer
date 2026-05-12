import { SLOT_HOURS } from "../types/admin";
import type {
  AircraftUtilizationSummary,
  AllocationLayer,
  CandidateRejectionCode,
  InstructorIdentity,
  InstructorWeeklyConfig,
  NonAllocationReasonCode,
  ScheduleGeneratorInput,
  SchedulePreview,
  ScheduledFlightSuggestion,
  StudentRequestDemand,
  StudentServiceSummary,
  UnallocatedDemand,
} from "../types/schedule";

const PERIOD_HOURS: Record<"morning" | "afternoon", number[]> = {
  morning: [6, 7, 8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16, 17],
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_RANK = new Map<number, number>(DAY_ORDER.map((day, index) => [day, index]));

const REASON_LABEL: Record<NonAllocationReasonCode, string> = {
  noAvailableSlot: "Sem slot compatível disponível",
  dailyCapReached: "Cap diário da aeronave atingido",
  gapConflict: "Conflito com intervalo mínimo entre voos",
  existingFlightConflict: "Conflito com voo já existente na semana",
  preferenceIncompatible: "Preferências incompatíveis com a oferta da semana",
  insufficientContiguousTime: "Não há bloco contínuo de horário para a duração solicitada",
};

type Candidate = {
  aircraftId: string;
  aircraftRegistration: string;
  dayOfWeek: number;
  weekDate: string;
  startHour: number;
  startMinute: number;
  endMinute: number;
  durationHours: number;
  layer: AllocationLayer;
  timePreferred: boolean;
  modelPreferred: boolean;
  operationalPreferenceRank: number;
};

type OccupiedInterval = {
  startMinute: number;
  endMinute: number;
  existing: boolean;
};

type StudentOccupied = {
  date: string;
  startMinute: number;
  endMinute: number;
};

type InstructorOccupied = {
  date: string;
  startMinute: number;
  endMinute: number;
};

type DemandSortState = {
  served: number;
  requested: number;
};

function minutesToHHMM(totalMinutes: number): string {
  const hh = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = Math.round(totalMinutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hh}:${mm}`;
}

function addDays(weekStart: string, dayOfWeek: number): string {
  const date = new Date(`${weekStart}T12:00:00`);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function compareFlexibility(a: "low" | "medium" | "high", b: "low" | "medium" | "high"): number {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[a] - rank[b];
}

function layerOrderForDemand(demand: StudentRequestDemand): AllocationLayer[] {
  if (!demand.preferredModelId) return ["A", "D"];
  return ["A", "B", "C", "D"];
}

function resolveLayer(params: {
  hasPreferredModel: boolean;
  modelPreferred: boolean;
  timePreferred: boolean;
}): AllocationLayer {
  if (params.hasPreferredModel) {
    if (params.timePreferred && params.modelPreferred) return "A";
    if (params.timePreferred && !params.modelPreferred) return "B";
    if (!params.timePreferred && params.modelPreferred) return "C";
    return "D";
  }
  if (params.timePreferred) return "A";
  return "D";
}

function toRelaxationLevel(layer: AllocationLayer): ScheduledFlightSuggestion["relaxationLevel"] {
  if (layer === "A") return "none";
  if (layer === "B") return "aircraft_only";
  if (layer === "C") return "time_only";
  return "aircraft_and_time";
}

function isContiguousHours(startIndex: number, units: number): boolean {
  if (units <= 1) return true;
  for (let i = 1; i < units; i += 1) {
    const prev = SLOT_HOURS[startIndex + i - 1];
    const next = SLOT_HOURS[startIndex + i];
    if (prev === undefined || next === undefined) return false;
    if (next - prev !== 1) return false;
  }
  return true;
}

function buildAvailabilitySets(demand: StudentRequestDemand): {
  preferred: Set<string>;
  available: Set<string>;
  hasAnyAvailability: boolean;
} {
  const preferred = new Set<string>();
  const available = new Set<string>();
  for (const row of demand.availability) {
    const hours = PERIOD_HOURS[row.period] ?? [];
    for (const hour of hours) {
      const key = `${row.dayOfWeek}-${hour}`;
      available.add(key);
      if (row.availabilityType === "preferred") preferred.add(key);
    }
  }
  return { preferred, available, hasAnyAvailability: demand.availability.length > 0 };
}

function passesAvailability(
  demandAvailability: ReturnType<typeof buildAvailabilitySets>,
  dayOfWeek: number,
  usedHours: number[],
): { allowed: boolean; preferred: boolean } {
  if (!demandAvailability.hasAnyAvailability) return { allowed: true, preferred: false };
  const keys = usedHours.map((hour) => `${dayOfWeek}-${hour}`);
  const allowed = keys.every((key) => demandAvailability.available.has(key));
  const preferred = keys.every((key) => demandAvailability.preferred.has(key));
  return { allowed, preferred };
}

function flightPeriods(startMinute: number, endMinute: number): Array<"morning" | "afternoon"> {
  const periods = new Set<"morning" | "afternoon">();
  const firstHour = Math.floor(startMinute / 60);
  const lastHour = Math.max(firstHour, Math.ceil(endMinute / 60) - 1);
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    if (PERIOD_HOURS.morning.includes(hour)) periods.add("morning");
    if (PERIOD_HOURS.afternoon.includes(hour)) periods.add("afternoon");
  }
  return [...periods];
}

function defaultInstructorConfig(instructorId: string): InstructorWeeklyConfig {
  return {
    instructorId,
    availableThisWeek: true,
    preferenceLevel: "medium",
    availability: [1, 2, 3, 4, 5, 6, 0].flatMap((dayOfWeek) =>
      (["morning", "afternoon"] as const).map((period) => ({
        dayOfWeek,
        period,
        available: true,
        availabilityType: "available" as const,
      })),
    ),
  };
}

function instructorPreferenceRank(level: InstructorWeeklyConfig["preferenceLevel"]): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function getInstructorAvailability(
  config: InstructorWeeklyConfig,
  dayOfWeek: number,
  period: "morning" | "afternoon",
): "none" | "available" | "preferred" {
  const row = config.availability.find((entry) => entry.dayOfWeek === dayOfWeek && entry.period === period);
  if (!row) return "available";
  if (!row.available) return "none";
  return row.availabilityType === "preferred" ? "preferred" : "available";
}

function hasIntervalConflict(intervals: InstructorOccupied[], date: string, startMinute: number, endMinute: number): boolean {
  return intervals.some((interval) => {
    if (interval.date !== date) return false;
    return startMinute < interval.endMinute && endMinute > interval.startMinute;
  });
}

function suggestionInterval(row: ScheduledFlightSuggestion): { startMinute: number; endMinute: number } {
  const [hh, mm] = row.startTime.split(":").map(Number);
  const startMinute = (Number.isFinite(hh) ? hh : row.startHour) * 60 + (Number.isFinite(mm) ? mm : 0);
  return {
    startMinute,
    endMinute: startMinute + Math.round(row.durationHours * 60),
  };
}

export function assignInstructorsToSuggestions(input: {
  suggestions: ScheduledFlightSuggestion[];
  instructors: InstructorIdentity[];
  instructorConfigs: InstructorWeeklyConfig[];
  existingFlights?: ScheduleGeneratorInput["existingFlights"];
}): ScheduledFlightSuggestion[] {
  const configsByInstructor = new Map(input.instructorConfigs.map((config) => [config.instructorId, config]));
  const occupiedByInstructor = new Map<string, InstructorOccupied[]>();
  const loadByInstructor = new Map<string, number>();
  const suggestionDemandIds = new Set(input.suggestions.map((row) => row.demandId));

  const reserve = (instructorId: string, date: string, startMinute: number, endMinute: number, durationHours: number) => {
    const intervals = occupiedByInstructor.get(instructorId) ?? [];
    intervals.push({ date, startMinute, endMinute });
    occupiedByInstructor.set(instructorId, intervals);
    loadByInstructor.set(instructorId, (loadByInstructor.get(instructorId) ?? 0) + durationHours);
  };

  for (const existing of input.existingFlights ?? []) {
    if (!existing.instructorId || suggestionDemandIds.has(existing.demandId)) continue;
    const [hh, mm] = existing.startTime.split(":").map(Number);
    const startMinute = (Number.isFinite(hh) ? hh : 6) * 60 + (Number.isFinite(mm) ? mm : 0);
    const endMinute = startMinute + Math.round(existing.durationHours * 60);
    reserve(existing.instructorId, existing.date, startMinute, endMinute, existing.durationHours);
  }

  for (const row of input.suggestions) {
    if (row.instructorAssignmentMode !== "manual" || !row.instructorId) continue;
    const { startMinute, endMinute } = suggestionInterval(row);
    reserve(row.instructorId, row.weekDate, startMinute, endMinute, row.durationHours);
  }

  return input.suggestions.map((row) => {
    if (row.instructorAssignmentMode === "manual") return row;

    const { startMinute, endMinute } = suggestionInterval(row);
    const requiredPeriods = flightPeriods(startMinute, endMinute);
    const candidates = input.instructors.filter((instructor) => {
      const config = configsByInstructor.get(instructor.userId) ?? defaultInstructorConfig(instructor.userId);
      if (!config.availableThisWeek) return false;
      if (!requiredPeriods.every((period) => getInstructorAvailability(config, row.dayOfWeek, period) !== "none")) return false;
      const intervals = occupiedByInstructor.get(instructor.userId) ?? [];
      return !hasIntervalConflict(intervals, row.weekDate, startMinute, endMinute);
    });

    candidates.sort((a, b) => {
      const aConfig = configsByInstructor.get(a.userId) ?? defaultInstructorConfig(a.userId);
      const bConfig = configsByInstructor.get(b.userId) ?? defaultInstructorConfig(b.userId);
      const aPeriodPreference = requiredPeriods.filter(
        (period) => getInstructorAvailability(aConfig, row.dayOfWeek, period) === "preferred",
      ).length;
      const bPeriodPreference = requiredPeriods.filter(
        (period) => getInstructorAvailability(bConfig, row.dayOfWeek, period) === "preferred",
      ).length;
      const periodCmp = bPeriodPreference - aPeriodPreference;
      if (periodCmp !== 0) return periodCmp;
      const preferenceCmp = instructorPreferenceRank(bConfig.preferenceLevel) - instructorPreferenceRank(aConfig.preferenceLevel);
      if (preferenceCmp !== 0) return preferenceCmp;
      const currentCmp = Number(b.userId === row.instructorId) - Number(a.userId === row.instructorId);
      if (currentCmp !== 0) return currentCmp;
      const loadCmp = (loadByInstructor.get(a.userId) ?? 0) - (loadByInstructor.get(b.userId) ?? 0);
      if (loadCmp !== 0) return loadCmp;
      return a.label.localeCompare(b.label, "pt-BR");
    });

    const selected = candidates[0] ?? null;
    if (!selected) {
      return {
        ...row,
        instructorId: null,
        instructorLabel: null,
        instructorAnac: null,
        instructorAssignmentMode: "auto",
      };
    }

    reserve(selected.userId, row.weekDate, startMinute, endMinute, row.durationHours);
    return {
      ...row,
      instructorId: selected.userId,
      instructorLabel: selected.label,
      instructorAnac: selected.anacCode,
      instructorAssignmentMode: "auto",
    };
  });
}

function rejectReasonPriority(codes: Set<CandidateRejectionCode>): NonAllocationReasonCode {
  if (codes.has("dailyCapReached")) return "dailyCapReached";
  if (codes.has("existingFlightConflict")) return "existingFlightConflict";
  if (codes.has("gapConflict")) return "gapConflict";
  return "insufficientContiguousTime";
}

function slotStateRank(state: "preferred" | "normal" | "avoid" | "blocked" | undefined): number {
  if (state === "preferred") return 2;
  if (state === "normal") return 1;
  if (state === "avoid") return 0;
  return -1;
}

export function generateSchedulePreview(input: ScheduleGeneratorInput): SchedulePreview {
  const occupiedByAircraftDay = new Map<string, OccupiedInterval[]>();
  const usedHoursByAircraftDay = new Map<string, number>();
  const studentOccupiedByStudent = new Map<string, StudentOccupied[]>();
  const studentUsedDays = new Set<string>();

  const allSupplies = input.supplies.filter((supply) => supply.aircraftId.length > 0);
  for (const supply of allSupplies) {
    for (const day of [1, 2, 3, 4, 5, 6, 0]) {
      const key = `${supply.aircraftId}-${day}`;
      usedHoursByAircraftDay.set(key, 0);
      occupiedByAircraftDay.set(key, []);
    }
  }

  for (const existing of input.existingFlights) {
    const supply = allSupplies.find((row) => row.aircraftRegistration === existing.aircraftRegistration);
    if (!supply) continue;
    const date = new Date(`${existing.date}T12:00:00`);
    const day = date.getDay();
    const [hh, mm] = existing.startTime.split(":").map(Number);
    const startMinute = (hh ?? 6) * 60 + (mm ?? 0);
    const endMinute = startMinute + Math.round(existing.durationHours * 60);
    const dayKey = `${supply.aircraftId}-${day}`;
    const intervals = occupiedByAircraftDay.get(dayKey) ?? [];
    intervals.push({ startMinute, endMinute, existing: true });
    occupiedByAircraftDay.set(dayKey, intervals);
    usedHoursByAircraftDay.set(dayKey, (usedHoursByAircraftDay.get(dayKey) ?? 0) + existing.durationHours);
    const studentRows = studentOccupiedByStudent.get(existing.studentId) ?? [];
    studentRows.push({ date: existing.date, startMinute, endMinute });
    studentOccupiedByStudent.set(existing.studentId, studentRows);
    studentUsedDays.add(`${existing.studentId}-${existing.date}`);
  }

  const demandStats = new Map<string, DemandSortState>();
  for (const demand of input.demands) {
    const current = demandStats.get(demand.studentId) ?? { served: 0, requested: 0 };
    current.requested += 1;
    demandStats.set(demand.studentId, current);
  }

  const orderedDemands = [...input.demands].sort((a, b) => {
    if (a.priorityLevel !== b.priorityLevel) return a.priorityLevel - b.priorityLevel;
    const flexCmp = compareFlexibility(a.flexibilityLevel, b.flexibilityLevel);
    if (flexCmp !== 0) return flexCmp;
    if (a.durationHours !== b.durationHours) return b.durationHours - a.durationHours;
    const aStats = demandStats.get(a.studentId) ?? { served: 0, requested: 1 };
    const bStats = demandStats.get(b.studentId) ?? { served: 0, requested: 1 };
    const aRatio = aStats.served / Math.max(1, aStats.requested);
    const bRatio = bStats.served / Math.max(1, bStats.requested);
    return aRatio - bRatio;
  });

  const suggestions: ScheduledFlightSuggestion[] = [];
  const unallocatedDemands: UnallocatedDemand[] = [];

  for (const demand of orderedDemands) {
    const demandAvailability = buildAvailabilitySets(demand);
    const units = Math.max(1, Math.ceil(demand.durationHours));
    const candidates: Candidate[] = [];
    let hadNonContiguousAttempt = false;

    for (const supply of allSupplies) {
      for (const day of [1, 2, 3, 4, 5, 6, 0]) {
        for (let i = 0; i < SLOT_HOURS.length; i += 1) {
          if (!isContiguousHours(i, units)) {
            hadNonContiguousAttempt = true;
            continue;
          }
          const hours = SLOT_HOURS.slice(i, i + units);
          if (hours.length < units) continue;
          const slotKeys = hours.map((hour) => `${day}-${hour}`);
          const hasBlocked = slotKeys.some((slotKey) => {
            const state = supply.slotStates[slotKey];
            return !state || state === "blocked";
          });
          if (hasBlocked) continue;

          const availabilityCheck = passesAvailability(demandAvailability, day, hours);
          if (!availabilityCheck.allowed) continue;

          const startHour = hours[0]!;
          const startMinute = startHour * 60;
          const endMinute = startMinute + Math.round(demand.durationHours * 60);
          const modelPreferred = Boolean(demand.preferredModelId && supply.aircraftModelId === demand.preferredModelId);
          const operationalPreferenceRank = Math.min(
            ...slotKeys.map((slotKey) => slotStateRank(supply.slotStates[slotKey])),
          );
          const layer = resolveLayer({
            hasPreferredModel: Boolean(demand.preferredModelId),
            modelPreferred,
            timePreferred: availabilityCheck.preferred,
          });
          candidates.push({
            aircraftId: supply.aircraftId,
            aircraftRegistration: supply.aircraftRegistration,
            dayOfWeek: day,
            weekDate: addDays(input.weekStart, day),
            startHour,
            startMinute,
            endMinute,
            durationHours: demand.durationHours,
            layer,
            timePreferred: availabilityCheck.preferred,
            modelPreferred,
            operationalPreferenceRank,
          });
        }
      }
    }

    if (candidates.length === 0) {
      const reasonCode: NonAllocationReasonCode = hadNonContiguousAttempt
        ? "insufficientContiguousTime"
        : demand.preferredModelId
          ? "preferenceIncompatible"
          : "noAvailableSlot";
      unallocatedDemands.push({
        demandId: demand.demandId,
        studentId: demand.studentId,
        studentLabel: demand.studentLabel,
        durationHours: demand.durationHours,
        reasonCode,
        reasonLabel: REASON_LABEL[reasonCode],
      });
      continue;
    }

    const attemptsByLayer = new Map<AllocationLayer, Candidate[]>();
    for (const candidate of candidates) {
      const list = attemptsByLayer.get(candidate.layer) ?? [];
      list.push(candidate);
      attemptsByLayer.set(candidate.layer, list);
    }

    let allocated: Candidate | null = null;
    const rejectionCodes = new Set<CandidateRejectionCode>();

    for (const layer of layerOrderForDemand(demand)) {
      const layerCandidates = attemptsByLayer.get(layer) ?? [];
      if (layerCandidates.length === 0) continue;

      layerCandidates.sort((a, b) => {
        const dayCmp = (DAY_RANK.get(a.dayOfWeek) ?? 99) - (DAY_RANK.get(b.dayOfWeek) ?? 99);
        if (dayCmp !== 0) return dayCmp;
        const opCmp = b.operationalPreferenceRank - a.operationalPreferenceRank;
        if (opCmp !== 0) return opCmp;
        const hourCmp = a.startHour - b.startHour;
        if (hourCmp !== 0) return hourCmp;
        const aDayKey = `${a.aircraftId}-${a.dayOfWeek}`;
        const bDayKey = `${b.aircraftId}-${b.dayOfWeek}`;
        const aUsage = usedHoursByAircraftDay.get(aDayKey) ?? 0;
        const bUsage = usedHoursByAircraftDay.get(bDayKey) ?? 0;
        return aUsage - bUsage;
      });

      for (const candidate of layerCandidates) {
        const dayKey = `${candidate.aircraftId}-${candidate.dayOfWeek}`;
        const studentDayKey = `${demand.studentId}-${candidate.weekDate}`;
        if (studentUsedDays.has(studentDayKey)) {
          rejectionCodes.add("existingFlightConflict");
          continue;
        }
        const supply = allSupplies.find((row) => row.aircraftId === candidate.aircraftId);
        const cap = supply?.dailyCaps[candidate.dayOfWeek];
        const used = usedHoursByAircraftDay.get(dayKey) ?? 0;
        if (typeof cap === "number" && used + candidate.durationHours > cap) {
          rejectionCodes.add("dailyCapReached");
          continue;
        }

        const aircraftIntervals = occupiedByAircraftDay.get(dayKey) ?? [];
        const hasAircraftConflict = aircraftIntervals.some((interval) => {
          const overlap = candidate.startMinute < interval.endMinute && candidate.endMinute > interval.startMinute;
          if (overlap && interval.existing) {
            rejectionCodes.add("existingFlightConflict");
            return true;
          }
          if (overlap) {
            rejectionCodes.add("gapConflict");
            return true;
          }
          const minGap = Math.max(0, input.minGapMinutes);
          const noGapBefore = candidate.startMinute < interval.endMinute + minGap;
          const noGapAfter = interval.startMinute < candidate.endMinute + minGap;
          const gapConflict = noGapBefore && noGapAfter;
          if (gapConflict && interval.existing) {
            rejectionCodes.add("existingFlightConflict");
            return true;
          }
          if (gapConflict) {
            rejectionCodes.add("gapConflict");
            return true;
          }
          return false;
        });
        if (hasAircraftConflict) continue;

        const studentIntervals = studentOccupiedByStudent.get(demand.studentId) ?? [];
        const hasStudentConflict = studentIntervals.some((interval) => {
          if (interval.date !== candidate.weekDate) return false;
          return candidate.startMinute < interval.endMinute && candidate.endMinute > interval.startMinute;
        });
        if (hasStudentConflict) {
          rejectionCodes.add("existingFlightConflict");
          continue;
        }

        allocated = candidate;
        break;
      }

      if (allocated) break;
    }

    if (!allocated) {
      const reasonCode = rejectReasonPriority(rejectionCodes);
      unallocatedDemands.push({
        demandId: demand.demandId,
        studentId: demand.studentId,
        studentLabel: demand.studentLabel,
        durationHours: demand.durationHours,
        reasonCode,
        reasonLabel: REASON_LABEL[reasonCode],
      });
      continue;
    }

    const dayKey = `${allocated.aircraftId}-${allocated.dayOfWeek}`;
    const aircraftIntervals = occupiedByAircraftDay.get(dayKey) ?? [];
    aircraftIntervals.push({
      startMinute: allocated.startMinute,
      endMinute: allocated.endMinute,
      existing: false,
    });
    occupiedByAircraftDay.set(dayKey, aircraftIntervals);
    usedHoursByAircraftDay.set(dayKey, (usedHoursByAircraftDay.get(dayKey) ?? 0) + demand.durationHours);
    const studentIntervals = studentOccupiedByStudent.get(demand.studentId) ?? [];
    studentIntervals.push({
      date: allocated.weekDate,
      startMinute: allocated.startMinute,
      endMinute: allocated.endMinute,
    });
    studentOccupiedByStudent.set(demand.studentId, studentIntervals);
    studentUsedDays.add(`${demand.studentId}-${allocated.weekDate}`);

    const stats = demandStats.get(demand.studentId) ?? { served: 0, requested: 0 };
    stats.served += 1;
    demandStats.set(demand.studentId, stats);

    suggestions.push({
      demandId: demand.demandId,
      studentId: demand.studentId,
      studentLabel: demand.studentLabel,
      aircraftId: allocated.aircraftId,
      aircraftRegistration: allocated.aircraftRegistration,
      dayOfWeek: allocated.dayOfWeek,
      weekDate: allocated.weekDate,
      startHour: allocated.startHour,
      startTime: minutesToHHMM(allocated.startMinute),
      endTime: minutesToHHMM(allocated.endMinute),
      durationHours: demand.durationHours,
      priorityLevel: demand.priorityLevel,
      flexibilityLevel: demand.flexibilityLevel,
      preferredModelId: demand.preferredModelId,
      instructorId: null,
      instructorLabel: null,
      instructorAnac: null,
      instructorAssignmentMode: "auto",
      allocationLayer: allocated.layer,
      relaxationLevel: toRelaxationLevel(allocated.layer),
      notes: demand.notes,
      source: "generated",
    });
  }

  const assignedSuggestions = assignInstructorsToSuggestions({
    suggestions,
    instructors: input.instructors ?? [],
    instructorConfigs: input.instructorConfigs ?? [],
    existingFlights: input.existingFlights,
  });

  const aircraftSummary: AircraftUtilizationSummary[] = allSupplies.map((supply) => {
    const dayUsage = [1, 2, 3, 4, 5, 6, 0].map((day) => {
      const key = `${supply.aircraftId}-${day}`;
      return {
        dayOfWeek: day,
        usedHours: Number((usedHoursByAircraftDay.get(key) ?? 0).toFixed(2)),
        capHours: typeof supply.dailyCaps[day] === "number" ? supply.dailyCaps[day]! : null,
      };
    });
    const scheduledFlights = assignedSuggestions.filter((f) => f.aircraftId === supply.aircraftId).length;
    const scheduledHours = assignedSuggestions
      .filter((f) => f.aircraftId === supply.aircraftId)
      .reduce((acc, row) => acc + row.durationHours, 0);
    return {
      aircraftId: supply.aircraftId,
      aircraftRegistration: supply.aircraftRegistration,
      scheduledFlights,
      scheduledHours: Number(scheduledHours.toFixed(2)),
      dayUsage,
    };
  });

  const studentSummaryMap = new Map<string, StudentServiceSummary>();
  for (const demand of input.demands) {
    if (!studentSummaryMap.has(demand.studentId)) {
      studentSummaryMap.set(demand.studentId, {
        studentId: demand.studentId,
        studentLabel: demand.studentLabel,
        requestedFlights: 0,
        allocatedFlights: 0,
        requestedHours: 0,
        allocatedHours: 0,
        unmetReasons: [],
      });
    }
    const row = studentSummaryMap.get(demand.studentId)!;
    row.requestedFlights += 1;
    row.requestedHours += demand.durationHours;
  }

  for (const suggestion of assignedSuggestions) {
    const row = studentSummaryMap.get(suggestion.studentId);
    if (!row) continue;
    row.allocatedFlights += 1;
    row.allocatedHours += suggestion.durationHours;
  }

  for (const unallocated of unallocatedDemands) {
    const row = studentSummaryMap.get(unallocated.studentId);
    if (!row) continue;
    row.unmetReasons.push(unallocated.reasonCode);
  }

  const studentSummary = [...studentSummaryMap.values()].map((row) => ({
    ...row,
    requestedHours: Number(row.requestedHours.toFixed(2)),
    allocatedHours: Number(row.allocatedHours.toFixed(2)),
  }));

  return { suggestions: assignedSuggestions, unallocatedDemands, aircraftSummary, studentSummary };
}

export function nonAllocationReasonLabel(reasonCode: NonAllocationReasonCode): string {
  return REASON_LABEL[reasonCode];
}
