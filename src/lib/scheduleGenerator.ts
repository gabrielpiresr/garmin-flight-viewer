import {
  buildDiurnalStartMinutes,
  hoursOverlappingInterval,
  integerHoursAreContiguous,
  minutesToScheduleHHMM,
  startMinuteToSortHour,
} from "./scheduleTimeGrid";
import type {
  AircraftWeekSupply,
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
  groupCapReached: "Teto por grupo de dias da aeronave atingido",
  gapConflict: "Conflito com intervalo mínimo entre voos",
  existingFlightConflict: "Conflito com voo já existente na semana",
  preferenceIncompatible: "Preferências incompatíveis com a oferta da semana",
  insufficientContiguousTime: "Não há bloco contínuo de horário para a duração solicitada",
  nightCapReached: "Limite de 1 voo noturno por aeronave/instrutor por dia atingido",
  insufficientNightCredits: "Saldo de créditos noturnos insuficiente",
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

type DemandWorkItem = {
  demand: StudentRequestDemand;
  originalIndex: number;
};

type CandidateBuildResult = {
  candidates: Candidate[];
  hadNonContiguousAttempt: boolean;
};

type CandidateEvaluation = {
  allocated: Candidate | null;
  validCandidateCount: number;
  rejectionCodes: Set<CandidateRejectionCode>;
};

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

function buildAvailabilitySets(demand: StudentRequestDemand): {
  preferred: Set<string>;
  available: Set<string>;
  hasAnyAvailability: boolean;
} {
  const preferred = new Set<string>();
  const available = new Set<string>();
  for (const row of demand.availability) {
    if (row.period === "night") {
      const key = `${row.dayOfWeek}-night`;
      available.add(key);
      if (row.availabilityType === "preferred") preferred.add(key);
    } else {
      const hours = PERIOD_HOURS[row.period] ?? [];
      for (const hour of hours) {
        const key = `${row.dayOfWeek}-${hour}`;
        available.add(key);
        if (row.availabilityType === "preferred") preferred.add(key);
      }
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

/** Aeronave: não permite sobreposição nem violar intervalo mínimo. */
function hasAircraftScheduleConflict(
  intervals: Array<{ startMinute: number; endMinute: number }>,
  startMinute: number,
  endMinute: number,
  minGapMinutes: number,
): boolean {
  const minGap = Math.max(0, minGapMinutes);
  for (const interval of intervals) {
    const overlap = startMinute < interval.endMinute && endMinute > interval.startMinute;
    if (overlap) return true;
    const gapConflict =
      startMinute < interval.endMinute + minGap && interval.startMinute < endMinute + minGap;
    if (gapConflict) return true;
  }
  return false;
}

/**
 * Instrutor: permite dois voos no mesmo horário (aviões diferentes).
 * Só exige intervalo mínimo entre voos sequenciais do mesmo instrutor.
 */
function hasInstructorGapConflict(
  intervals: Array<{ startMinute: number; endMinute: number }>,
  startMinute: number,
  endMinute: number,
  minGapMinutes: number,
): boolean {
  const minGap = Math.max(0, minGapMinutes);
  for (const interval of intervals) {
    const overlap = startMinute < interval.endMinute && endMinute > interval.startMinute;
    if (overlap) continue;
    const gapConflict =
      startMinute < interval.endMinute + minGap && interval.startMinute < endMinute + minGap;
    if (gapConflict) return true;
  }
  return false;
}

function hasInstructorForSlot(params: {
  dayOfWeek: number;
  weekDate: string;
  startMinute: number;
  endMinute: number;
  minGapMinutes: number;
  instructors: InstructorIdentity[];
  instructorConfigs: InstructorWeeklyConfig[];
  occupiedByInstructor: Map<string, InstructorOccupied[]>;
}): boolean {
  return (
    pickInstructorForSlot({
      ...params,
      preferredInstructorId: null,
    }) !== null
  );
}

function pickInstructorForSlot(params: {
  dayOfWeek: number;
  weekDate: string;
  startMinute: number;
  endMinute: number;
  minGapMinutes: number;
  instructors: InstructorIdentity[];
  instructorConfigs: InstructorWeeklyConfig[];
  occupiedByInstructor: Map<string, InstructorOccupied[]>;
  preferredInstructorId?: string | null;
}): InstructorIdentity | null {
  const requiredPeriods = flightPeriods(params.startMinute, params.endMinute);
  const configsByInstructor = new Map(params.instructorConfigs.map((config) => [config.instructorId, config]));

  const candidates = params.instructors.filter((instructor) => {
    const config = configsByInstructor.get(instructor.userId) ?? defaultInstructorConfig(instructor.userId);
    if (!config.availableThisWeek) return false;
    if (!requiredPeriods.every((period) => getInstructorAvailability(config, params.dayOfWeek, period) !== "none")) {
      return false;
    }
    const intervals = params.occupiedByInstructor.get(instructor.userId) ?? [];
    const dayIntervals = intervals.filter((interval) => interval.date === params.weekDate);
    return !hasInstructorGapConflict(dayIntervals, params.startMinute, params.endMinute, params.minGapMinutes);
  });

  const loadByInstructor = new Map<string, number>();
  for (const [instructorId, intervals] of params.occupiedByInstructor) {
    let hours = 0;
    for (const interval of intervals) {
      hours += (interval.endMinute - interval.startMinute) / 60;
    }
    loadByInstructor.set(instructorId, hours);
  }

  candidates.sort((a, b) => {
    const aConfig = configsByInstructor.get(a.userId) ?? defaultInstructorConfig(a.userId);
    const bConfig = configsByInstructor.get(b.userId) ?? defaultInstructorConfig(b.userId);
    const aPeriodPreference = requiredPeriods.filter(
      (period) => getInstructorAvailability(aConfig, params.dayOfWeek, period) === "preferred",
    ).length;
    const bPeriodPreference = requiredPeriods.filter(
      (period) => getInstructorAvailability(bConfig, params.dayOfWeek, period) === "preferred",
    ).length;
    const periodCmp = bPeriodPreference - aPeriodPreference;
    if (periodCmp !== 0) return periodCmp;
    const preferenceCmp = instructorPreferenceRank(bConfig.preferenceLevel) - instructorPreferenceRank(aConfig.preferenceLevel);
    if (preferenceCmp !== 0) return preferenceCmp;
    const currentCmp = Number(b.userId === params.preferredInstructorId) - Number(a.userId === params.preferredInstructorId);
    if (currentCmp !== 0) return currentCmp;
    const loadCmp = (loadByInstructor.get(a.userId) ?? 0) - (loadByInstructor.get(b.userId) ?? 0);
    if (loadCmp !== 0) return loadCmp;
    return a.label.localeCompare(b.label, "pt-BR");
  });

  return candidates[0] ?? null;
}

function reserveInstructorInterval(
  occupiedByInstructor: Map<string, InstructorOccupied[]>,
  instructorId: string,
  date: string,
  startMinute: number,
  endMinute: number,
) {
  const intervals = occupiedByInstructor.get(instructorId) ?? [];
  intervals.push({ date, startMinute, endMinute });
  occupiedByInstructor.set(instructorId, intervals);
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
  minGapMinutes?: number;
}): ScheduledFlightSuggestion[] {
  const minGapMinutes = Math.max(0, input.minGapMinutes ?? 0);
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

  for (const existing of (input.existingFlights ?? []).filter((flight) => flight.flightStatus !== "Cancelado")) {
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
      const dayIntervals = intervals.filter((interval) => interval.date === row.weekDate);
      return !hasInstructorGapConflict(dayIntervals, startMinute, endMinute, minGapMinutes);
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
  if (codes.has("groupCapReached")) return "groupCapReached";
  if (codes.has("existingFlightConflict")) return "existingFlightConflict";
  if (codes.has("gapConflict")) return "gapConflict";
  return "insufficientContiguousTime";
}

function reachesGroupCap(params: {
  supply: AircraftWeekSupply;
  dayOfWeek: number;
  durationHours: number;
  usedHoursByAircraftDay: Map<string, number>;
}): boolean {
  for (const groupCap of params.supply.groupCaps) {
    if (!groupCap.days.includes(params.dayOfWeek)) continue;
    const usedInGroup = groupCap.days.reduce((total, day) => {
      return total + (params.usedHoursByAircraftDay.get(`${params.supply.aircraftId}-${day}`) ?? 0);
    }, 0);
    if (usedInGroup + params.durationHours > groupCap.maxHours) return true;
  }
  return false;
}

function groupCapUsedHours(
  supply: AircraftWeekSupply,
  groupDays: number[],
  usedHoursByAircraftDay: Map<string, number>,
): number {
  return groupDays.reduce((total, day) => {
    return total + (usedHoursByAircraftDay.get(`${supply.aircraftId}-${day}`) ?? 0);
  }, 0);
}

function slotStateRank(state: "preferred" | "normal" | "avoid" | "blocked" | undefined): number {
  if (state === "preferred") return 2;
  if (state === "normal") return 1;
  if (state === "avoid") return 0;
  return -1;
}

function findSupplyByRegistration(
  supplies: AircraftWeekSupply[],
  aircraftRegistration: string | null | undefined,
): AircraftWeekSupply | undefined {
  const key = (aircraftRegistration ?? "").trim().toUpperCase();
  if (!key) return undefined;
  return supplies.find((row) => row.aircraftRegistration.trim().toUpperCase() === key);
}

export function generateSchedulePreview(input: ScheduleGeneratorInput): SchedulePreview {
  const occupiedByAircraftDay = new Map<string, OccupiedInterval[]>();
  const occupiedByInstructor = new Map<string, InstructorOccupied[]>();
  const usedHoursByAircraftDay = new Map<string, number>();
  const studentOccupiedByStudent = new Map<string, StudentOccupied[]>();
  const studentUsedDays = new Set<string>();
  const nightFlightsPerAircraftDay = new Map<string, number>();
  const allowNightFlights = input.allowNightFlights ?? false;
  const nightFlightStartHour = input.nightFlightStartHour ?? 18;
  const instructors = input.instructors ?? [];
  const instructorConfigs = input.instructorConfigs ?? [];
  const activeExistingFlights = input.existingFlights.filter((flight) => flight.flightStatus !== "Cancelado");

  const allSupplies = input.supplies.filter((supply) => supply.aircraftId.length > 0);
  const aircraftWeekHours = new Map<string, number>();
  const aircraftWeekFlights = new Map<string, number>();
  for (const supply of allSupplies) {
    aircraftWeekHours.set(supply.aircraftId, 0);
    aircraftWeekFlights.set(supply.aircraftId, 0);
    for (const day of [1, 2, 3, 4, 5, 6, 0]) {
      const key = `${supply.aircraftId}-${day}`;
      usedHoursByAircraftDay.set(key, 0);
      occupiedByAircraftDay.set(key, []);
    }
  }

  const aircraftLoadScore = (aircraftId: string): number => {
    const hours = aircraftWeekHours.get(aircraftId) ?? 0;
    const flights = aircraftWeekFlights.get(aircraftId) ?? 0;
    return hours * 10 + flights;
  };

  for (const existing of activeExistingFlights) {
    const supply = findSupplyByRegistration(allSupplies, existing.aircraftRegistration);
    if (!supply) continue;
    aircraftWeekHours.set(
      supply.aircraftId,
      (aircraftWeekHours.get(supply.aircraftId) ?? 0) + existing.durationHours,
    );
    aircraftWeekFlights.set(supply.aircraftId, (aircraftWeekFlights.get(supply.aircraftId) ?? 0) + 1);
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
    if (existing.instructorId) {
      reserveInstructorInterval(
        occupiedByInstructor,
        existing.instructorId,
        existing.date,
        startMinute,
        endMinute,
      );
    }
  }

  const demandStats = new Map<string, DemandSortState>();
  for (const demand of input.demands) {
    const current = demandStats.get(demand.studentId) ?? { served: 0, requested: 0 };
    current.requested += 1;
    demandStats.set(demand.studentId, current);
  }

  for (const existing of activeExistingFlights) {
    const stats = demandStats.get(existing.studentId);
    if (!stats) continue;
    stats.served = Math.min(stats.requested, stats.served + 1);
  }

  const suggestions: ScheduledFlightSuggestion[] = [];
  const unallocatedDemands: UnallocatedDemand[] = [];
  const remainingDemands: DemandWorkItem[] = input.demands.map((demand, originalIndex) => ({ demand, originalIndex }));

  const buildCandidates = (demand: StudentRequestDemand): CandidateBuildResult => {
    const isNightDemand = (demand.isNight ?? false) && allowNightFlights;
    const demandAvailability = buildAvailabilitySets(demand);
    const durationMinutes = Math.round(demand.durationHours * 60);
    const diurnalStartMinutes = buildDiurnalStartMinutes(durationMinutes);
    const candidates: Candidate[] = [];
    let hadNonContiguousAttempt = false;

    for (const supply of allSupplies) {
      for (const day of [1, 2, 3, 4, 5, 6, 0]) {
        if (isNightDemand) {
          const nightSlotKey = `${day}-night`;
          const nightState = supply.slotStates[nightSlotKey];
          if (!nightState || nightState === "blocked") continue;

          const nightAvailKey = `${day}-night`;
          if (demandAvailability.hasAnyAvailability && !demandAvailability.available.has(nightAvailKey)) continue;
          const timePreferred = demandAvailability.preferred.has(nightAvailKey);

          const startHour = nightFlightStartHour;
          const startMinute = startHour * 60;
          const endMinute = startMinute + Math.round(demand.durationHours * 60);
          const modelPreferred = Boolean(demand.preferredModelId && supply.aircraftModelId === demand.preferredModelId);
          const operationalPreferenceRank = slotStateRank(nightState);
          const layer = resolveLayer({
            hasPreferredModel: Boolean(demand.preferredModelId),
            modelPreferred,
            timePreferred,
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
            timePreferred,
            modelPreferred,
            operationalPreferenceRank,
          });
        } else {
          for (const startMinute of diurnalStartMinutes) {
            const endMinute = startMinute + durationMinutes;
            const hours = hoursOverlappingInterval(startMinute, endMinute);
            if (hours.length === 0) continue;
            if (!integerHoursAreContiguous(hours)) {
              hadNonContiguousAttempt = true;
              continue;
            }

            const slotKeys = hours.map((hour) => `${day}-${hour}`);
            const hasBlocked = slotKeys.some((slotKey) => {
              const state = supply.slotStates[slotKey];
              return !state || state === "blocked";
            });
            if (hasBlocked) continue;

            const availabilityCheck = passesAvailability(demandAvailability, day, hours);
            if (!availabilityCheck.allowed) continue;

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
              startHour: startMinuteToSortHour(startMinute),
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
    }

    return { candidates, hadNonContiguousAttempt };
  };

  const rejectionForCandidate = (
    demand: StudentRequestDemand,
    candidate: Candidate,
  ): CandidateRejectionCode | null => {
    const dayKey = `${candidate.aircraftId}-${candidate.dayOfWeek}`;
    const studentDayKey = `${demand.studentId}-${candidate.weekDate}`;
    if (studentUsedDays.has(studentDayKey)) return "existingFlightConflict";

    if (demand.isNight) {
      const nightAircraftKey = `${candidate.aircraftId}-${candidate.dayOfWeek}`;
      if ((nightFlightsPerAircraftDay.get(nightAircraftKey) ?? 0) >= 1) return "nightCapReached";
    }

    const supply = allSupplies.find((row) => row.aircraftId === candidate.aircraftId);
    const cap = supply?.dailyCaps[candidate.dayOfWeek];
    const used = usedHoursByAircraftDay.get(dayKey) ?? 0;
    if (typeof cap === "number" && used + candidate.durationHours > cap) return "dailyCapReached";
    if (
      supply &&
      reachesGroupCap({
        supply,
        dayOfWeek: candidate.dayOfWeek,
        durationHours: candidate.durationHours,
        usedHoursByAircraftDay,
      })
    ) {
      return "groupCapReached";
    }

    const aircraftIntervals = occupiedByAircraftDay.get(dayKey) ?? [];
    for (const interval of aircraftIntervals) {
      const overlap = candidate.startMinute < interval.endMinute && candidate.endMinute > interval.startMinute;
      if (overlap) return interval.existing ? "existingFlightConflict" : "gapConflict";
      const minGap = Math.max(0, input.minGapMinutes);
      const gapConflict =
        candidate.startMinute < interval.endMinute + minGap &&
        interval.startMinute < candidate.endMinute + minGap;
      if (gapConflict) return interval.existing ? "existingFlightConflict" : "gapConflict";
    }

    if (
      instructors.length > 0 &&
      !hasInstructorForSlot({
        dayOfWeek: candidate.dayOfWeek,
        weekDate: candidate.weekDate,
        startMinute: candidate.startMinute,
        endMinute: candidate.endMinute,
        minGapMinutes: input.minGapMinutes,
        instructors,
        instructorConfigs,
        occupiedByInstructor,
      })
    ) {
      return "gapConflict";
    }

    const studentIntervals = studentOccupiedByStudent.get(demand.studentId) ?? [];
    const hasStudentConflict = studentIntervals.some((interval) => {
      if (interval.date !== candidate.weekDate) return false;
      return candidate.startMinute < interval.endMinute && candidate.endMinute > interval.startMinute;
    });
    if (hasStudentConflict) return "existingFlightConflict";

    return null;
  };

  const evaluateCandidates = (
    demand: StudentRequestDemand,
    candidates: Candidate[],
    candidateImpactScore?: (candidate: Candidate) => number,
  ): CandidateEvaluation => {
    const attemptsByLayer = new Map<AllocationLayer, Candidate[]>();
    for (const candidate of candidates) {
      const list = attemptsByLayer.get(candidate.layer) ?? [];
      list.push(candidate);
      attemptsByLayer.set(candidate.layer, list);
    }

    let allocated: Candidate | null = null;
    const rejectionCodes = new Set<CandidateRejectionCode>();
    let validCandidateCount = 0;

    for (const layer of layerOrderForDemand(demand)) {
      const layerCandidates = attemptsByLayer.get(layer) ?? [];
      if (layerCandidates.length === 0) continue;

      layerCandidates.sort((a, b) => {
        const opCmp = b.operationalPreferenceRank - a.operationalPreferenceRank;
        if (opCmp !== 0) return opCmp;
        const loadCmp = aircraftLoadScore(a.aircraftId) - aircraftLoadScore(b.aircraftId);
        if (loadCmp !== 0) return loadCmp;
        const impactCmp = (candidateImpactScore?.(a) ?? 0) - (candidateImpactScore?.(b) ?? 0);
        if (impactCmp !== 0) return impactCmp;
        const dayCmp = (DAY_RANK.get(a.dayOfWeek) ?? 99) - (DAY_RANK.get(b.dayOfWeek) ?? 99);
        if (dayCmp !== 0) return dayCmp;
        const hourCmp = a.startHour - b.startHour;
        if (hourCmp !== 0) return hourCmp;
        return a.aircraftId.localeCompare(b.aircraftId);
      });

      for (const candidate of layerCandidates) {
        const rejection = rejectionForCandidate(demand, candidate);
        if (rejection) {
          rejectionCodes.add(rejection);
          continue;
        }

        validCandidateCount += 1;
        allocated ??= candidate;
      }

      if (allocated) break;
    }

    return { allocated, validCandidateCount, rejectionCodes };
  };

  while (remainingDemands.length > 0) {
    const buildResults = new Map<string, CandidateBuildResult>();
    const validCandidatesByDemand = new Map<string, Candidate[]>();
    for (const item of remainingDemands) {
      const buildResult = buildCandidates(item.demand);
      buildResults.set(item.demand.demandId, buildResult);
      validCandidatesByDemand.set(
        item.demand.demandId,
        buildResult.candidates.filter((candidate) => !rejectionForCandidate(item.demand, candidate)),
      );
    }

    const wouldAllocationRejectCandidate = (allocation: Candidate, candidate: Candidate): boolean => {
      if (allocation.aircraftId === candidate.aircraftId && allocation.dayOfWeek === candidate.dayOfWeek) {
        if (
          hasAircraftScheduleConflict(
            [{ startMinute: allocation.startMinute, endMinute: allocation.endMinute }],
            candidate.startMinute,
            candidate.endMinute,
            input.minGapMinutes,
          )
        ) {
          return true;
        }

        const supply = allSupplies.find((row) => row.aircraftId === candidate.aircraftId);
        const cap = supply?.dailyCaps[candidate.dayOfWeek];
        const used = usedHoursByAircraftDay.get(`${candidate.aircraftId}-${candidate.dayOfWeek}`) ?? 0;
        if (typeof cap === "number" && used + allocation.durationHours + candidate.durationHours > cap) return true;
      }

      const supply = allSupplies.find((row) => row.aircraftId === candidate.aircraftId);
      if (supply) {
        const groupRejected = supply.groupCaps.some((groupCap) => {
          if (!groupCap.days.includes(allocation.dayOfWeek) || !groupCap.days.includes(candidate.dayOfWeek)) return false;
          const used = groupCapUsedHours(supply, groupCap.days, usedHoursByAircraftDay);
          return used + allocation.durationHours + candidate.durationHours > groupCap.maxHours;
        });
        if (groupRejected) return true;
      }

      return false;
    };

    const impactCache = new Map<string, number>();
    const makeCandidateImpactScore = (currentDemand: StudentRequestDemand) => (candidate: Candidate): number => {
      const cacheKey = [
        currentDemand.demandId,
        candidate.aircraftId,
        candidate.dayOfWeek,
        candidate.startMinute,
        candidate.durationHours,
      ].join("::");
      const cached = impactCache.get(cacheKey);
      if (typeof cached === "number") return cached;

      let score = 0;
      for (const item of remainingDemands) {
        if (item.demand.demandId === currentDemand.demandId) continue;
        const validCandidates = validCandidatesByDemand.get(item.demand.demandId) ?? [];
        if (validCandidates.length === 0) continue;

        let lostCandidates = 0;
        for (const otherCandidate of validCandidates) {
          const sameStudentDay =
            item.demand.studentId === currentDemand.studentId && otherCandidate.weekDate === candidate.weekDate;
          if (sameStudentDay || wouldAllocationRejectCandidate(candidate, otherCandidate)) {
            lostCandidates += 1;
          }
        }
        if (lostCandidates === 0) continue;

        score += lostCandidates / validCandidates.length;
        if (lostCandidates === validCandidates.length) score += 100;
      }

      impactCache.set(cacheKey, score);
      return score;
    };

    const evaluations = remainingDemands.map((item, remainingIndex) => {
      const buildResult = buildResults.get(item.demand.demandId) ?? { candidates: [], hadNonContiguousAttempt: false };
      const candidateEvaluation = evaluateCandidates(item.demand, buildResult.candidates);
      return {
        ...item,
        remainingIndex,
        ...buildResult,
        ...candidateEvaluation,
      };
    });

    evaluations.sort((a, b) => {
      const aHasAllocation = a.allocated ? 1 : 0;
      const bHasAllocation = b.allocated ? 1 : 0;
      if (aHasAllocation !== bHasAllocation) return bHasAllocation - aHasAllocation;
      if (a.validCandidateCount !== b.validCandidateCount) return a.validCandidateCount - b.validCandidateCount;
      if (a.demand.priorityLevel !== b.demand.priorityLevel) return a.demand.priorityLevel - b.demand.priorityLevel;
      const flexCmp = compareFlexibility(a.demand.flexibilityLevel, b.demand.flexibilityLevel);
      if (flexCmp !== 0) return flexCmp;
      const aStats = demandStats.get(a.demand.studentId) ?? { served: 0, requested: 1 };
      const bStats = demandStats.get(b.demand.studentId) ?? { served: 0, requested: 1 };
      const aRatio = aStats.served / Math.max(1, aStats.requested);
      const bRatio = bStats.served / Math.max(1, bStats.requested);
      if (aRatio !== bRatio) return aRatio - bRatio;
      if (a.demand.durationHours !== b.demand.durationHours) return b.demand.durationHours - a.demand.durationHours;
      return a.originalIndex - b.originalIndex;
    });

    const selected = evaluations[0];
    if (!selected) break;
    remainingDemands.splice(selected.remainingIndex, 1);

    const demand = selected.demand;
    const allocated = evaluateCandidates(
      demand,
      selected.candidates,
      makeCandidateImpactScore(demand),
    ).allocated;

    if (!allocated) {
      const reasonCode: NonAllocationReasonCode =
        selected.candidates.length === 0
          ? selected.hadNonContiguousAttempt
            ? "insufficientContiguousTime"
            : demand.preferredModelId
              ? "preferenceIncompatible"
              : "noAvailableSlot"
          : rejectReasonPriority(selected.rejectionCodes);
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

    if (demand.isNight) {
      const nightAircraftKey = `${allocated.aircraftId}-${allocated.dayOfWeek}`;
      nightFlightsPerAircraftDay.set(nightAircraftKey, (nightFlightsPerAircraftDay.get(nightAircraftKey) ?? 0) + 1);
    }

    aircraftWeekHours.set(
      allocated.aircraftId,
      (aircraftWeekHours.get(allocated.aircraftId) ?? 0) + demand.durationHours,
    );
    aircraftWeekFlights.set(allocated.aircraftId, (aircraftWeekFlights.get(allocated.aircraftId) ?? 0) + 1);

    suggestions.push({
      demandId: demand.demandId,
      studentId: demand.studentId,
      studentLabel: demand.studentLabel,
      aircraftId: allocated.aircraftId,
      aircraftRegistration: allocated.aircraftRegistration,
      dayOfWeek: allocated.dayOfWeek,
      weekDate: allocated.weekDate,
      startHour: startMinuteToSortHour(allocated.startMinute),
      startTime: minutesToScheduleHHMM(allocated.startMinute),
      endTime: minutesToScheduleHHMM(allocated.endMinute),
      durationHours: demand.durationHours,
      priorityLevel: demand.priorityLevel,
      flexibilityLevel: demand.flexibilityLevel,
      preferredModelId: demand.preferredModelId,
      isNight: demand.isNight ?? false,
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
    instructors,
    instructorConfigs,
    existingFlights: activeExistingFlights,
    minGapMinutes: input.minGapMinutes,
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

  const assignedDemandIds = new Set(assignedSuggestions.map((row) => row.demandId));

  for (const suggestion of assignedSuggestions) {
    const row = studentSummaryMap.get(suggestion.studentId);
    if (!row) continue;
    row.allocatedFlights += 1;
    row.allocatedHours += suggestion.durationHours;
  }

  for (const existing of activeExistingFlights) {
    if (assignedDemandIds.has(existing.demandId)) continue;
    const row = studentSummaryMap.get(existing.studentId);
    if (!row) continue;
    row.allocatedFlights += 1;
    row.allocatedHours += existing.durationHours;
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
