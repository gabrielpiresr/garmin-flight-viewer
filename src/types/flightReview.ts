export type ManeuverCategory =
  | "takeoff"
  | "landing"
  | "touch_and_go"
  | "climb"
  | "turn"
  | "stall"
  | "emergency"
  | "navigation"
  | "traffic_pattern"
  | "other";

export const MANEUVER_CATEGORY_LABELS: Record<ManeuverCategory, string> = {
  takeoff: "Decolagem",
  landing: "Pouso",
  touch_and_go: "TGL",
  climb: "Subida",
  turn: "Curva",
  stall: "Estol",
  emergency: "Emergência",
  navigation: "Navegação",
  traffic_pattern: "Circuito",
  other: "Outro",
};

export type ParameterSeverity = "low" | "medium" | "high" | "critical";
export type FlightManeuverStatus = "draft" | "analyzed" | "reviewed" | "invalid";
export type ReviewStatus = "ok" | "attention" | "critical" | "unavailable";

export type StepEndCondition =
  | { type: "time"; value_seconds: number }
  | { type: "parameter"; parameter: string; operator: ">=" | "<=" | ">" | "<"; value: number }
  | { type: "traffic_pattern_leg"; leg: "downwind" | "base" | "final" }
  | { type: "instructor_marked" };

export type StepParameter = {
  parameter: string;
  label: string;
  ideal?: number;
  min?: number;
  max?: number;
  /** Mínimo esperado no início da etapa (substitui `min` quando presente). */
  min_start?: number;
  /** Máximo esperado no início da etapa (substitui `max` quando presente). */
  max_start?: number;
  /** Mínimo esperado no fim da etapa. Se definido junto com min_start, interpola linearmente. */
  min_end?: number;
  /** Máximo esperado no fim da etapa. Se definido junto com max_start, interpola linearmente. */
  max_end?: number;
  severity: ParameterSeverity;
  /** Mensagem de alerta quando o valor fica abaixo do mínimo configurado. */
  alert_message_min?: string;
  /** Mensagem de alerta quando o valor fica acima do máximo configurado. */
  alert_message_max?: string;
};

export type ManeuverTemplate = {
  id: string;
  name: string;
  category: ManeuverCategory;
  aircraft_model_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ManeuverTemplateStep = {
  id: string;
  template_id: string;
  order_index: number;
  name: string;
  description: string | null;
  expected_execution_text: string | null;
  end_condition: StepEndCondition | null;
  parameters: StepParameter[];
  created_at: string;
  updated_at: string;
};

export type FlightManeuver = {
  id: string;
  flight_id: string;
  template_id: string;
  instructor_id: string;
  student_id: string | null;
  aircraft_ident: string | null;
  start_time: string;
  end_time: string;
  status: FlightManeuverStatus;
  /** ISO timestamps marcados pelo instrutor para delimitar o fim de cada etapa com condição "instructor_marked". */
  instructor_step_marks?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AnalyzedParameter = {
  parameter: string;
  label: string;
  min_observed: number | null;
  max_observed: number | null;
  avg_observed: number | null;
  expected_min: number | null;
  expected_max: number | null;
  /** Valor do limite mínimo no fim da etapa (presente apenas quando há interpolação). */
  expected_min_end?: number | null;
  /** Valor do limite máximo no fim da etapa (presente apenas quando há interpolação). */
  expected_max_end?: number | null;
  status: "ok" | "warning" | "out_of_range";
  time_out_of_range_seconds: number;
  severity: ParameterSeverity;
  data_points: Array<{ t: number; v: number }>;
};

export type ReviewAlert = {
  severity: ParameterSeverity;
  message: string;
  parameter?: string;
};

export type AnalyzedStep = {
  name: string;
  description: string | null;
  expected_execution_text: string | null;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  status: ReviewStatus;
  parameters: AnalyzedParameter[];
  alerts: ReviewAlert[];
};

import type { TrafficPatternAnalysis } from "./flight";

export type AnalysisResult = {
  steps: AnalyzedStep[];
  alerts: ReviewAlert[];
  /** Padrão de circuito detectado — preenchido apenas em manobras de pouso/TGL. */
  trafficPattern?: TrafficPatternAnalysis | null;
};

export type FlightManeuverReview = {
  id: string;
  flight_maneuver_id: string;
  flight_id: string;
  status: ReviewStatus;
  summary: string | null;
  analysis: AnalysisResult;
  created_at: string;
  updated_at: string;
};
