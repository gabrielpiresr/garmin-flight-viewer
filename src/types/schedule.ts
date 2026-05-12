import type { AvailabilityType, FlexibilityLevel } from "./planning";
import type { SlotState } from "./admin";

export type ScheduleWeekOption = {
  weekStart: string;
  weekEnd: string;
  label: string;
  isClosed: boolean;
  scheduleClosedAt: string | null;
  isFuture: boolean;
};

export type StudentIdentity = {
  userId: string;
  label: string;
  email: string | null;
  anacCode: string | null;
  weightKg: number | null;
  heightCm: number | null;
};

export type InstructorIdentity = {
  userId: string;
  label: string;
  anacCode: string | null;
  weightKg: number | null;
  heightCm: number | null;
  defaultPreferenceLevel: InstructorPreferenceLevel;
  defaultAvailability: Array<{
    dayOfWeek: number;
    period: SchedulePeriod;
    availabilityType: AvailabilityType;
  }>;
};

export type InstructorPreferenceLevel = "low" | "medium" | "high";
export type SchedulePeriod = "morning" | "afternoon";

export type InstructorWeeklyConfig = {
  instructorId: string;
  availableThisWeek: boolean;
  preferenceLevel: InstructorPreferenceLevel;
  availability: Array<{
    dayOfWeek: number;
    period: SchedulePeriod;
    available: boolean;
    availabilityType: AvailabilityType;
  }>;
};

export type StudentRequestDemand = {
  demandId: string;
  studentId: string;
  studentLabel: string;
  weekStart: string;
  durationHours: number;
  priorityLevel: 1 | 2 | 3;
  flexibilityLevel: FlexibilityLevel;
  preferredModelId: string | null;
  availability: Array<{
    dayOfWeek: number;
    period: "morning" | "afternoon";
    availabilityType: AvailabilityType;
  }>;
  notes: string | null;
};

export type AircraftWeekSupply = {
  aircraftId: string;
  aircraftModelId: string;
  aircraftRegistration: string;
  aircraftImageUrl?: string | null;
  dailyCaps: Record<number, number>;
  slotStates: Record<string, SlotState>;
};

export type ExistingScheduledFlight = {
  id: string;
  demandId: string;
  studentId: string;
  instructorId: string | null;
  instructorLabel: string | null;
  instructorAnac: string | null;
  aircraftRegistration: string | null;
  date: string;
  startTime: string;
  durationHours: number;
  name: string;
  sourceFilename: string;
};

export type ScheduleWeekData = {
  week: ScheduleWeekOption;
  supplies: AircraftWeekSupply[];
  demands: StudentRequestDemand[];
  students: StudentIdentity[];
  instructors: InstructorIdentity[];
  existingGeneratedFlights: ExistingScheduledFlight[];
};

export type AllocationLayer = "A" | "B" | "C" | "D";
export type RelaxationLevel = "none" | "aircraft_only" | "time_only" | "aircraft_and_time";

export type NonAllocationReasonCode =
  | "noAvailableSlot"
  | "dailyCapReached"
  | "gapConflict"
  | "existingFlightConflict"
  | "preferenceIncompatible"
  | "insufficientContiguousTime";

export type CandidateRejectionCode =
  | "dailyCapReached"
  | "gapConflict"
  | "existingFlightConflict"
  | "insufficientContiguousTime";

export type ScheduledFlightSuggestion = {
  demandId: string;
  studentId: string;
  studentLabel: string;
  aircraftId: string;
  aircraftRegistration: string;
  dayOfWeek: number;
  weekDate: string;
  startHour: number;
  startTime: string;
  endTime: string;
  durationHours: number;
  priorityLevel: 1 | 2 | 3;
  flexibilityLevel: FlexibilityLevel;
  preferredModelId: string | null;
  instructorId: string | null;
  instructorLabel: string | null;
  instructorAnac: string | null;
  instructorAssignmentMode: "auto" | "manual";
  allocationLayer: AllocationLayer;
  relaxationLevel: RelaxationLevel;
  notes: string | null;
  source: "generated" | "manual";
};

export type UnallocatedDemand = {
  demandId: string;
  studentId: string;
  studentLabel: string;
  durationHours: number;
  reasonCode: NonAllocationReasonCode;
  reasonLabel: string;
};

export type AircraftUtilizationSummary = {
  aircraftId: string;
  aircraftRegistration: string;
  scheduledFlights: number;
  scheduledHours: number;
  dayUsage: Array<{
    dayOfWeek: number;
    usedHours: number;
    capHours: number | null;
  }>;
};

export type StudentServiceSummary = {
  studentId: string;
  studentLabel: string;
  requestedFlights: number;
  allocatedFlights: number;
  requestedHours: number;
  allocatedHours: number;
  unmetReasons: NonAllocationReasonCode[];
};

export type SchedulePreview = {
  suggestions: ScheduledFlightSuggestion[];
  unallocatedDemands: UnallocatedDemand[];
  aircraftSummary: AircraftUtilizationSummary[];
  studentSummary: StudentServiceSummary[];
};

export type ScheduleGeneratorInput = {
  weekStart: string;
  supplies: AircraftWeekSupply[];
  demands: StudentRequestDemand[];
  existingFlights: ExistingScheduledFlight[];
  instructors?: InstructorIdentity[];
  instructorConfigs?: InstructorWeeklyConfig[];
  minGapMinutes: number;
};
