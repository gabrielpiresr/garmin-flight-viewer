export type AutomationStatus = "draft" | "active" | "paused" | "deleted";

export type AutomationTriggerType =
  | "student.created"
  | "student.crm_status_changed"
  | "training.progress_reached"
  | "training.track_changed"
  | "student.days_without_flight_reached"
  | "flight.created"
  | "flight.status_changed"
  | "flight.completed"
  | "flight.solo_completed"
  | "credits.balance_crossed"
  | "credits.expiring"
  | "schedule.no_future_flight"
  | "schedule.next_flight_in"
  | "student.birthday";

export type AutomationConditionField =
  | "training.progress_percent"
  | "training.track_id"
  | "training.track_status"
  | "activity.days_without_flight"
  | "activity.flight_count"
  | "activity.solo_flight_count"
  | "flight.status"
  | "flight.previous_status"
  | "credits.balance_hours"
  | "credits.expires_in_days"
  | "student.crm_status_id"
  | "schedule.has_future_flight"
  | "schedule.next_flight_in_days"
  | "student.days_since_created"
  | "contact.has_email"
  | "contact.has_phone"
  | "contact.has_push"
  | "contact.has_instructor";

export type AutomationOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "exists" | "not_exists";

export type AutomationCondition = {
  id: string;
  field: AutomationConditionField;
  operator: AutomationOperator;
  value: string | number | boolean | string[] | null;
};

export type AutomationConditionGroup = {
  id: string;
  mode: "all" | "any";
  conditions: AutomationCondition[];
};

export type AutomationConditionTree = {
  mode: "all" | "any";
  groups: AutomationConditionGroup[];
};

export type AutomationRecipient = "student" | "instructors" | "admins";

export type AutomationStep =
  | { id: string; type: "email"; templateId: string; recipients: AutomationRecipient[] }
  | { id: string; type: "wpp"; templateName: string; language: string; headerVariables: string[]; bodyVariables: string[]; recipients: AutomationRecipient[] }
  | { id: string; type: "push"; title: string; body: string; url: string; recipients: AutomationRecipient[] }
  | { id: string; type: "crm_status"; statusId: string }
  | { id: string; type: "wait"; amount: number; unit: "minutes" | "hours" | "days" };

export type AutomationTriggerConfig = {
  threshold?: number;
  operator?: AutomationOperator;
  status?: string;
  statuses?: string[];
  trackId?: string;
  days?: number;
  direction?: "above" | "below";
};

export type StudentAutomation = {
  id: string;
  schoolId: string;
  name: string;
  description: string;
  status: AutomationStatus;
  version: number;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  conditions: AutomationConditionTree;
  steps: AutomationStep[];
  cooldownMinutes: number;
  baselineAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentAutomationInput = Pick<StudentAutomation, "name" | "description" | "triggerType" | "triggerConfig" | "conditions" | "steps" | "cooldownMinutes">;

export type AutomationRunStatus = "running" | "waiting" | "succeeded" | "partial_failed" | "failed" | "cancelled" | "skipped";

export type AutomationRun = {
  id: string;
  automationId: string;
  automationName: string;
  automationVersion: number;
  studentUserId: string;
  studentName: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  currentStep: number;
  rootRunId: string;
  chainDepth: number;
  context: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type AutomationStepRun = {
  id: string;
  runId: string;
  automationId: string;
  stepId: string;
  stepIndex: number;
  stepType: AutomationStep["type"];
  recipientUserId: string | null;
  recipientLabel: string | null;
  channel: "email" | "wpp" | "push" | "crm_status" | "wait";
  status: "pending" | "scheduled" | "sent" | "succeeded" | "skipped" | "failed" | "cancelled";
  providerMessageId: string | null;
  resolvedContent: Record<string, unknown>;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type AutomationRunDetail = { run: AutomationRun; steps: AutomationStepRun[] };

export type AutomationEmailTemplate = {
  id: string;
  schoolId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyJson: Record<string, unknown> | null;
  active: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationEmailTemplateInput = Pick<AutomationEmailTemplate, "name" | "subject" | "bodyHtml" | "bodyJson" | "active">;

export type StudentCrmStatus = {
  id: string;
  schoolId: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudentCrmStatusInput = Pick<StudentCrmStatus, "name" | "color" | "order" | "isDefault" | "archived">;

export type StudentCrmProfile = {
  studentUserId: string;
  studentName: string;
  email: string;
  statusId: string;
  statusName: string;
  statusColor: string;
  changedAt: string | null;
};

export type AutomationSimulation = {
  studentUserId: string;
  studentName: string;
  matched: boolean;
  triggerMatched: boolean;
  conditionsMatched: boolean;
  context: Record<string, unknown>;
  recipients: Record<AutomationRecipient, Array<{ userId: string; name: string; email?: string; phone?: string }>>;
  warnings: string[];
};

export const EMPTY_CONDITION_TREE: AutomationConditionTree = { mode: "all", groups: [] };

export const AUTOMATION_TEMPLATE_VARIABLES = [
  "student.name",
  "student.first_name",
  "student.email",
  "student.phone",
  "student.crm_status",
  "training.track_name",
  "training.progress_percent",
  "activity.days_without_flight",
  "activity.last_flight_date",
  "credits.balance_hours",
  "flight.date",
  "flight.time",
  "flight.status",
  "flight.aircraft",
  "instructor.name",
  "school.name",
  "school.app_url",
] as const;
