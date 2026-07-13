export type WeeklyFlightPlanStatus = "draft" | "submitted";
export type FlexibilityLevel = "low" | "medium" | "high";
export type AvailabilityPeriod = "morning" | "afternoon" | "night";
export type AvailabilityType = "available" | "preferred" | "blocked";

export type WeeklyFlightPlan = {
  id: string;
  student_id: string;
  operational_week_id: string;
  week_start: string;
  requested_flights_count: number;
  status: WeeklyFlightPlanStatus;
  updated_at: string;
  // Items embedded como JSON (null em planos criados antes desta versão)
  items_json: string | null;
};

export type WeeklyFlightPlanItem = {
  id: string;
  weekly_plan_id: string;
  position: number;
  duration_hours: number;
  flexibility_level: FlexibilityLevel;
  preferred_aircraft: string | null;
  priority_level: 1 | 2 | 3;
  notes: string | null;
  isNight?: boolean;
};

export type WeeklyFlightPlanAvailability = {
  id: string;
  plan_item_id: string;
  day_of_week: number;
  period: AvailabilityPeriod;
  availability_type: AvailabilityType;
};

export type WeeklyFlightPlanItemFull = WeeklyFlightPlanItem & {
  availability: WeeklyFlightPlanAvailability[];
};

export type WeeklyFlightPlanFull = WeeklyFlightPlan & {
  items: WeeklyFlightPlanItemFull[];
};

export type SavePlanPayload = {
  studentId: string;
  operationalWeekId: string;
  weekStart: string;
  requestedFlightsCount: number;
  items: {
    position: number;
    durationHours: number;
    flexibilityLevel: FlexibilityLevel;
    preferredAircraft: string | null;
    priorityLevel: 1 | 2 | 3;
    notes: string | null;
    isNight?: boolean;
    availability: {
      dayOfWeek: number;
      period: AvailabilityPeriod;
      availabilityType: AvailabilityType;
    }[];
  }[];
};

export type FlightItemLocal = {
  localId: string;
  durationHours: number;
  flexibilityLevel: FlexibilityLevel;
  preferredAircraft: string | null;
  priorityLevel: 1 | 2 | 3;
  notes: string;
  isNight: boolean;
  // key: "${dayOfWeek}-${period}" → AvailabilityType | undefined (absent = not selected)
  availability: Record<string, AvailabilityType>;
};
