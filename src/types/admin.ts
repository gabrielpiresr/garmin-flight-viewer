export type AircraftCategory = "PPL" | "IFR" | "Multi-Engine" | "Helicopter" | "Outro";
export type TemperatureUnit = "C" | "F";

export type AircraftModel = {
  id: string;
  name: string;
  manufacturer: string;
  category: AircraftCategory;
  default_image: string | null;
  vx_kt: number | null;
  vy_kt: number | null;
  vs_clean_kt: number | null;
  vso_kt: number | null;
  white_arc_min_kt: number | null;
  white_arc_max_kt: number | null;
  green_arc_min_kt: number | null;
  green_arc_max_kt: number | null;
  yellow_arc_min_kt: number | null;
  yellow_arc_max_kt: number | null;
  vne_kt: number | null;
  va_kt: number | null;
  best_glide_kt: number | null;
  vref_flap0_kt: number | null;
  vref_flap1_kt: number | null;
  vref_flap2_kt: number | null;
  rpm_cruise: number | null;
  rpm_takeoff_max: number | null;
  op_oil_temp_unit: TemperatureUnit;
  op_oil_temp_attention: number | null;
  op_oil_temp_danger: number | null;
  op_oil_pressure_attention_psi: number | null;
  op_oil_pressure_danger_psi: number | null;
  op_rpm_attention: number | null;
  op_rpm_danger: number | null;
  op_fuel_pressure_attention_psi: number | null;
  op_fuel_pressure_danger_psi: number | null;
  op_gload_attention: number | null;
  op_gload_danger: number | null;
  op_touchdown_ias_attention_kt: number | null;
  op_touchdown_ias_danger_kt: number | null;
  op_best_climb_after_takeoff_kt: number | null;
  created_at: string;
};

export type Aircraft = {
  id: string;
  school_id: string;
  model_id: string;
  registration: string;
  nickname: string | null;
  image_url: string | null;
  active: boolean;
  wb_empty_weight_kg: number | null;
  wb_empty_arm_mm: number | null;
  wb_occupants_arm_mm: number | null;
  wb_occupants_max_kg: number | null;
  wb_baggage_arm_mm: number | null;
  wb_baggage_max_kg: number | null;
  wb_fuel_arm_mm: number | null;
  wb_fuel_max_kg: number | null;
  wb_fuel_density_kg_l: number | null;
  wb_max_weight_kg: number | null;
  wb_arm_min_mm: number | null;
  wb_arm_max_mm: number | null;
  created_at: string;
  // joined client-side
  model?: AircraftModel;
};

export type MaintenanceRule = {
  id: string;
  model_id: string;
  name: string;
  max_flight_hours: number | null;
  max_days: number | null;
  estimated_downtime_days: number | null;
  estimated_cost: number | null;
  created_at: string;
};

export type OperationalWeek = {
  id: string;
  aircraft_id: string;
  week_start: string; // ISO date "2025-05-18"
  week_end: string;   // ISO date "2025-05-24"
  created_by: string;
  created_at: string;
  is_open_for_requests: boolean;
  schedule_closed_at: string | null;
  // Dados embedded como JSON (null em semanas criadas antes desta versão)
  daily_caps_json: string | null;
  group_caps_json: string | null;
  slots_json: string | null;
};

export type DailyCap = {
  id: string;
  operational_week_id: string;
  day_of_week: number; // 0=Dom, 1=Seg, ..., 6=Sab
  max_hours: number;
};

export type GroupCap = {
  id: string;
  operational_week_id: string;
  max_hours: number;
  // joined client-side
  days?: number[];
};

export type GroupCapDay = {
  id: string;
  group_cap_id: string;
  day_of_week: number;
};

export type SlotState = "preferred" | "normal" | "avoid" | "blocked";

export type OperationalSlot = {
  id: string;
  operational_week_id: string;
  day_of_week: number;
  start_hour: number;
  state: SlotState;
};

// Matrix local state — key is "${dayOfWeek}-${startHour}"
export type SlotMatrix = Record<string, SlotState>;

export type WeekConfigPayload = {
  aircraftId: string;
  weekStart: string;
  weekEnd: string;
  createdBy: string;
  isOpenForRequests?: boolean;
  dailyCaps: { dayOfWeek: number; maxHours: number }[];
  groupCaps: { maxHours: number; days: number[] }[];
  slots: { dayOfWeek: number; startHour: number; state: SlotState }[];
};

export type WeekConfigFull = {
  week: OperationalWeek;
  dailyCaps: DailyCap[];
  groupCaps: GroupCap[];
  slots: OperationalSlot[];
};

export const SLOT_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;
export type SlotHour = (typeof SLOT_HOURS)[number];

// 0=Dom,1=Seg,2=Ter,3=Qua,4=Qui,5=Sex,6=Sab — ISO week starts Monday
export const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const; // display order: Seg→Dom
