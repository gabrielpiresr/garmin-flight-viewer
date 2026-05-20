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
  fuel_consumption_lph: number | null;
  created_at: string;
};

export type Aircraft = {
  id: string;
  school_id: string;
  model_id: string;
  registration: string;
  nickname: string | null;
  serial_number: string | null;
  owner_name: string | null;
  operator_name: string | null;
  logbook_sequence_number: string | null;
  logbook_opening_date: string | null;
  logbook_ttaf: number | null;
  logbook_landings: number | null;
  logbook_engine_hours: number | null;
  logbook_propeller_hours: number | null;
  logbook_tach_hours: number | null;
  logbook_cycles: number | null;
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

export type MaintenanceProgramItemType = "inspection" | "AD" | "SB" | "overhaul" | "component" | "preventive" | "corrective";
export type MaintenanceCategory = "routine" | "mandatory" | "recommended";
export type MaintenanceArea = "engine" | "airframe" | "avionics" | "propeller" | "electrical" | "landing_gear";
export type MaintenancePriority = "normal" | "warning" | "grounding";
export type MaintenanceReferenceType = "MM" | "AMM" | "IPC" | "SB" | "AD" | "ICA" | "OEM";
export type MaintenanceBaselineSource = "manual" | "migration" | "imported" | "calculated";

export type MaintenanceProgramTask = {
  id: string;
  title: string;
  description: string;
  order: number;
};

export type MaintenanceProgramItem = {
  id: string;
  aircraft_model_id: string;
  code: string;
  title: string;
  item_type: MaintenanceProgramItemType;
  category: MaintenanceCategory;
  maintenance_area: MaintenanceArea;
  priority: MaintenancePriority;
  description: string;
  reference_type: MaintenanceReferenceType;
  reference_document: string;
  reference_revision: string | null;
  reference_section: string | null;
  recurrence_rules: string;
  tolerance_rules: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_from: string | null;
  serial_to: string | null;
  engine_model: string | null;
  baseline_source: MaintenanceBaselineSource | null;
  baseline_notes: string | null;
  grounding_if_overdue: boolean;
  block_dispatch: boolean;
  requires_release: boolean;
  checklist_tasks: MaintenanceProgramTask[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceWorkOrderType =
  | "scheduled"
  | "unscheduled"
  | "corrective"
  | "preventive"
  | "inspection"
  | "overhaul"
  | "migration_baseline";
export type MaintenanceWorkOrderStatus = "open" | "in_progress" | "completed" | "released" | "canceled";
export type WorkOrderReferenceType = MaintenanceReferenceType | "LEGACY_RECORD";
export type MechanicLicenseType = "MMA" | "CEL" | "GMP";
export type MaintenanceDataOrigin = "native" | "migration" | "imported" | "corrected";
export type SourceConfidence = "low" | "medium" | "high";
export type MaintenanceAttachmentType =
  | "pdf"
  | "image"
  | "invoice"
  | "certificate"
  | "CRS"
  | "AD"
  | "SB"
  | "logbook"
  | "legacy_record"
  | "migration_evidence";

export type MaintenanceWorkOrderChecklistTask = MaintenanceProgramTask & {
  done: boolean;
  observation: string;
};

export type MaintenanceWorkOrder = {
  id: string;
  work_order_number: string;
  aircraft_id: string;
  maintenance_program_item_id: string | null;
  work_order_type: MaintenanceWorkOrderType;
  status: MaintenanceWorkOrderStatus;
  opened_at: string;
  started_at: string | null;
  completed_at: string | null;
  released_at: string | null;
  aircraft_ttaf: number;
  aircraft_total_landings: number | null;
  engine_time: number | null;
  propeller_time: number | null;
  tach_time: number | null;
  cycles: number | null;
  description_performed: string;
  discrepancy_reported: string | null;
  corrective_action: string | null;
  linked_discrepancy_id: string | null;
  reference_type: WorkOrderReferenceType | null;
  reference_document: string | null;
  reference_revision: string | null;
  reference_section: string | null;
  mechanic_name: string | null;
  mechanic_canac: string | null;
  mechanic_license_type: MechanicLicenseType | null;
  mechanic_signature: string | null;
  approved_return_to_service: boolean;
  release_statement: string | null;
  aircraft_released: boolean;
  grounding_removed: boolean;
  legacy_update: boolean;
  data_origin: MaintenanceDataOrigin;
  source_confidence: SourceConfidence | null;
  source_notes: string | null;
  legacy_reference: string | null;
  migrated_at: string | null;
  migrated_by: string | null;
  parts_cost: number | null;
  labor_cost: number | null;
  other_costs: number | null;
  created_by: string | null;
  released_by_user_id: string | null;
  released_by_name: string | null;
  released_by_canac: string | null;
  released_by_license_type: MechanicLicenseType | null;
  checklist_execution: MaintenanceWorkOrderChecklistTask[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceAttachment = {
  id: string;
  work_order_id: string;
  attachment_type: MaintenanceAttachmentType;
  file_name: string;
  file_url: string;
  uploaded_by: string;
  uploaded_at: string;
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
  nightSlots?: { dayOfWeek: number; state: SlotState }[];
};

export type WeekConfigFull = {
  week: OperationalWeek;
  dailyCaps: DailyCap[];
  groupCaps: GroupCap[];
  slots: OperationalSlot[];
};

export const SLOT_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;
export type SlotHour = (typeof SLOT_HOURS)[number];
export const NIGHT_SLOT_KEY_SUFFIX = "night" as const;

// 0=Dom,1=Seg,2=Ter,3=Qua,4=Qui,5=Sex,6=Sab — ISO week starts Monday
export const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const; // display order: Seg→Dom
