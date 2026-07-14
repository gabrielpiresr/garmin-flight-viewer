import { Account, Client, Databases, Functions, ID, Permission, Role, Storage } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;

export const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID as string | undefined;
export const NOTICES_BUCKET_ID = import.meta.env.VITE_APPWRITE_NOTICES_BUCKET_ID as string | undefined;
export const SYNC_ANAC_FUNCTION_ID = import.meta.env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID as string | undefined;
export const ADMIN_USERS_FUNCTION_ID = import.meta.env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID as string | undefined;
export const SCHEDULE_BOOKING_FUNCTION_ID =
  (import.meta.env.VITE_APPWRITE_SCHEDULE_BOOKING_FUNCTION_ID as string | undefined) ?? "schedule-booking";
export const CREDIT_ADJUSTMENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CREDIT_ADJUSTMENTS_COL_ID as string | undefined) ?? "credit_adjustments";
export const INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID as string | undefined) ?? "instructor-patch-flight";
export const SIGN_FLIGHT_FUNCTION_ID =
  (import.meta.env.VITE_APPWRITE_SIGN_FLIGHT_FUNCTION_ID as string | undefined) ?? "sign-flight";
export const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;

// Admin — frota e configuração operacional
export const SCHOOL_ID = import.meta.env.VITE_SCHOOL_ID as string | undefined;
/** Único ponto de fallback para school_id. Importar daqui em vez de redeclarar localmente. */
export const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";
export const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID as string | undefined;
export const AIRCRAFT_MODELS_COL_ID = import.meta.env.VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID as string | undefined;
export const AIRCRAFTS_COL_ID = import.meta.env.VITE_APPWRITE_AIRCRAFTS_COL_ID as string | undefined;
export const AERODROMES_COL_ID =
  (import.meta.env.VITE_APPWRITE_AERODROMES_COL_ID as string | undefined) ?? "aerodromes";
export const RUNWAYS_COL_ID =
  (import.meta.env.VITE_APPWRITE_RUNWAYS_COL_ID as string | undefined) ?? "runways";
export const MAINTENANCE_RULES_COL_ID = import.meta.env.VITE_APPWRITE_MAINTENANCE_RULES_COL_ID as string | undefined;
export const MAINTENANCE_PROGRAM_ITEMS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID as string | undefined;
export const MAINTENANCE_WORK_ORDERS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID as string | undefined;
export const MAINTENANCE_ATTACHMENTS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_ATTACHMENTS_COL_ID as string | undefined;
export const FUELINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FUELINGS_COL_ID as string | undefined) ?? "aircraft_fuelings";
export const AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID as string | undefined) ?? "aircraft_horimeter_corrections";
export const OP_WEEKS_COL_ID = import.meta.env.VITE_APPWRITE_OP_WEEKS_COL_ID as string | undefined;

// Student planning collections
export const WEEKLY_PLANS_COL_ID = import.meta.env.VITE_APPWRITE_WEEKLY_PLANS_COL_ID as string | undefined;
export const NOTICES_COL_ID = import.meta.env.VITE_APPWRITE_NOTICES_COL_ID as string | undefined;
export const MANEUVERS_SECTIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID as string | undefined) ?? "6a0461a3001603e99577";
export const MANEUVERS_SUBSECTIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID as string | undefined) ?? "6a0461c5002ac4794ec4";
export const MANEUVERS_ARTICLES_COL_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID as string | undefined) ?? "6a0461d0001a1ceefdad";
export const MANEUVERS_MEDIA_BUCKET_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVERS_MEDIA_BUCKET_ID as string | undefined) ?? BUCKET_ID;
export const HELP_SECTIONS_COL_ID = import.meta.env.VITE_APPWRITE_HELP_SECTIONS_COL_ID as string | undefined;
export const HELP_SUBSECTIONS_COL_ID = import.meta.env.VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID as string | undefined;
export const HELP_ARTICLES_COL_ID = import.meta.env.VITE_APPWRITE_HELP_ARTICLES_COL_ID as string | undefined;
export const INSTRUCTOR_HELP_SECTIONS_COL_ID =
  import.meta.env.VITE_APPWRITE_INSTRUCTOR_HELP_SECTIONS_COL_ID as string | undefined;
export const INSTRUCTOR_HELP_ARTICLES_COL_ID =
  import.meta.env.VITE_APPWRITE_INSTRUCTOR_HELP_ARTICLES_COL_ID as string | undefined;
export const HELP_MEDIA_BUCKET_ID =
  (import.meta.env.VITE_APPWRITE_HELP_MEDIA_BUCKET_ID as string | undefined) ?? BUCKET_ID;
export const INSTRUCTOR_PREFS_COL_ID = import.meta.env.VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID as string | undefined;
export const STUDENT_CREDITS_COL_ID = import.meta.env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID as string | undefined;
export const PLATFORM_SETTINGS_COL_ID = import.meta.env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID as string | undefined;
export const ONBOARDING_STEPS_COL_ID =
  (import.meta.env.VITE_APPWRITE_ONBOARDING_STEPS_COL_ID as string | undefined) ?? "6a1f23d2001937e83aa9";
export const ONBOARDING_MEDIA_BUCKET_ID =
  (import.meta.env.VITE_APPWRITE_ONBOARDING_MEDIA_BUCKET_ID as string | undefined) ?? "6a1f21ba003cd923ba15";
export const PUSH_SUBSCRIPTIONS_COL_ID = import.meta.env.VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID as string | undefined;
export const NOTIFICATION_DELIVERIES_COL_ID = import.meta.env
  .VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID as string | undefined;
export const FLIGHT_TELEMETRY_SUMMARIES_COL_ID = import.meta.env
  .VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID as string | undefined;
export const FLIGHT_LANDINGS_COL_ID = import.meta.env.VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID as string | undefined;
export const FLIGHT_TAKEOFFS_COL_ID = import.meta.env.VITE_APPWRITE_FLIGHT_TAKEOFFS_COL_ID as string | undefined;
export const TELEMETRY_ALERT_RULES_COL_ID =
  (import.meta.env.VITE_APPWRITE_TELEMETRY_ALERT_RULES_COL_ID as string | undefined) ?? "telemetry_alert_rules";
export const FLIGHT_TELEMETRY_ALERTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID as string | undefined) ?? "flight_telemetry_alerts";
export const FLIGHT_SIGNATURES_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID as string | undefined) ?? "flight_signatures";
export const LOGBOOK_OPENING_SIGNATURES_COL_ID =
  (import.meta.env.VITE_APPWRITE_LOGBOOK_OPENING_SIGNATURES_COL_ID as string | undefined) ?? "logbook_opening_signatures";
export const FLIGHT_DISCREPANCIES_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_DISCREPANCIES_COL_ID as string | undefined) ?? "flight_discrepancies";
export const AUDIT_EVENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUDIT_EVENTS_COL_ID as string | undefined) ?? "audit_events";
export const TRAINING_EXERCISES_COL_ID = import.meta.env.VITE_APPWRITE_TRAINING_EXERCISES_COL_ID as string | undefined;
export const TRAINING_TRACKS_COL_ID =
  (import.meta.env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID as string | undefined) ?? "training_tracks";
export const STUDENT_TRACKS_COL_ID =
  (import.meta.env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID as string | undefined) ?? "student_training_tracks";
export const JOURNEY_REWARDS_COL_ID =
  (import.meta.env.VITE_APPWRITE_JOURNEY_REWARDS_COL_ID as string | undefined) ?? "journey_rewards";
export const STUDENT_OBSERVATIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_STUDENT_OBSERVATIONS_COL_ID as string | undefined) ?? "student_observations";
export const INSTRUCTOR_STUDENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID as string | undefined) ?? "instructor_students";
export const PROFILE_DOCUMENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_PROFILE_DOCUMENTS_COL_ID as string | undefined) ?? "profile_documents";

// Custos e financeiro
export const INSTRUCTOR_COSTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_COSTS_COL_ID as string | undefined) ?? "instructor_costs";
export const SCHOOL_COSTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_SCHOOL_COSTS_COL_ID as string | undefined) ?? "school_costs";
export const FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID as string | undefined) ?? "flight_instructor_payments";
export const SCHOOL_PRODUCTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_SCHOOL_PRODUCTS_COL_ID as string | undefined) ?? "school_products";
export const PRODUCT_SALES_COL_ID =
  (import.meta.env.VITE_APPWRITE_PRODUCT_SALES_COL_ID as string | undefined) ?? "product_sales";
export const FINANCIAL_MONTHLY_CLOSINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID as string | undefined) ?? "financial_monthly_closings";
export const FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID =
  (import.meta.env.VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID as string | undefined) ??
  "financial_monthly_closing_lines";

// Manuais
export const MANUALS_BUCKET_ID = import.meta.env.VITE_APPWRITE_MANUALS_BUCKET_ID as string | undefined;
export const MANUALS_COL_ID = import.meta.env.VITE_APPWRITE_MANUALS_COL_ID as string | undefined;

// Manuais internos (admin + instrutor)
export const INTERNAL_MANUALS_BUCKET_ID =
  (import.meta.env.VITE_APPWRITE_INTERNAL_MANUALS_BUCKET_ID as string | undefined) ?? MANUALS_BUCKET_ID;
export const INTERNAL_MANUALS_COL_ID = import.meta.env.VITE_APPWRITE_INTERNAL_MANUALS_COL_ID as string | undefined;

// Email MKT
export const BROADCAST_SEGMENTS_COL_ID = import.meta.env.VITE_APPWRITE_BROADCAST_SEGMENTS_COL_ID as string | undefined;
export const BROADCAST_MESSAGES_COL_ID = import.meta.env.VITE_APPWRITE_BROADCAST_MESSAGES_COL_ID as string | undefined;

// Roles por tenant
export const TENANT_ROLES_COL_ID = import.meta.env.VITE_APPWRITE_TENANT_ROLES_COL_ID as string | undefined;

// Contratos
export const CONTRACT_TEMPLATES_COL_ID =
  (import.meta.env.VITE_APPWRITE_CONTRACT_TEMPLATES_COL_ID as string | undefined) ?? "contract_templates";
export const CONTRACTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CONTRACTS_COL_ID as string | undefined) ?? "contracts";
export const CONTRACT_SIGNATURES_COL_ID =
  (import.meta.env.VITE_APPWRITE_CONTRACT_SIGNATURES_COL_ID as string | undefined) ?? "contract_signatures";

// CRM
export const CRM_LEADS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CRM_LEADS_COL_ID as string | undefined) ?? "crm_leads";
export const CRM_STATUS_SETTINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CRM_STATUS_SETTINGS_COL_ID as string | undefined) ?? "crm_status_settings";
export const CRM_AUTOMATION_SETTINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CRM_AUTOMATION_SETTINGS_COL_ID as string | undefined) ?? "crm_automation_settings";
export const PROPOSAL_CONFIG_COL_ID =
  (import.meta.env.VITE_APPWRITE_PROPOSAL_CONFIG_COL_ID as string | undefined) ?? "proposal_config";
export const CRM_PROPOSALS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CRM_PROPOSALS_COL_ID as string | undefined) ?? "crm_proposals";
export const CRM_LEAD_COMMENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_CRM_LEAD_COMMENTS_COL_ID as string | undefined) ?? "crm_lead_comments";

// CRM de alunos e automações
export const STUDENT_AUTOMATIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_STUDENT_AUTOMATIONS_COL_ID as string | undefined) ?? "student_automations";
export const AUTOMATION_STATES_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUTOMATION_STATES_COL_ID as string | undefined) ?? "student_automation_states";
export const AUTOMATION_RUNS_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUTOMATION_RUNS_COL_ID as string | undefined) ?? "student_automation_runs";
export const AUTOMATION_STEP_RUNS_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUTOMATION_STEP_RUNS_COL_ID as string | undefined) ?? "student_automation_step_runs";
export const AUTOMATION_JOBS_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUTOMATION_JOBS_COL_ID as string | undefined) ?? "student_automation_jobs";
export const AUTOMATION_EMAIL_TEMPLATES_COL_ID =
  (import.meta.env.VITE_APPWRITE_AUTOMATION_EMAIL_TEMPLATES_COL_ID as string | undefined) ?? "student_automation_email_templates";
export const STUDENT_CRM_STATUSES_COL_ID =
  (import.meta.env.VITE_APPWRITE_STUDENT_CRM_STATUSES_COL_ID as string | undefined) ?? "student_crm_statuses";
export const STUDENT_CRM_PROFILES_COL_ID =
  (import.meta.env.VITE_APPWRITE_STUDENT_CRM_PROFILES_COL_ID as string | undefined) ?? "student_crm_profiles";

// Admissão de instrutores
export const INSTRUCTOR_ADMISSION_STAGES_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_STAGES_COL_ID as string | undefined) ??
  "instructor_admission_stages";
export const INSTRUCTOR_ADMISSION_FORM_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_FORM_COL_ID as string | undefined) ??
  "instructor_admission_form";
export const INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID as string | undefined) ??
  "instructor_admission_candidates";
export const INSTRUCTOR_ADMISSION_COMMENTS_COL_ID =
  (import.meta.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_COMMENTS_COL_ID as string | undefined) ??
  "instructor_admission_comments";

// Flight Review
export const MANEUVER_TEMPLATES_COL_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVER_TEMPLATES_COL_ID as string | undefined) ?? "maneuver_templates";
export const MANEUVER_TEMPLATE_STEPS_COL_ID =
  (import.meta.env.VITE_APPWRITE_MANEUVER_TEMPLATE_STEPS_COL_ID as string | undefined) ?? "maneuver_template_steps";
export const FLIGHT_MANEUVERS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_MANEUVERS_COL_ID as string | undefined) ?? "flight_maneuvers";
export const FLIGHT_MANEUVER_REVIEWS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_MANEUVER_REVIEWS_COL_ID as string | undefined) ?? "flight_maneuver_reviews";

// Avaliação do voo (aluno)
export const FLIGHT_EVALUATIONS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_EVALUATIONS_COL_ID as string | undefined) ?? "flight_evaluations";

export const isAppwriteConfigured = Boolean(endpoint && projectId && endpoint.startsWith("http"));

export let client: Client | null = null;
export let account: Account | null = null;
export let databases: Databases | null = null;
export let storage: Storage | null = null;
export let functions: Functions | null = null;

if (isAppwriteConfigured) {
  client = new Client().setEndpoint(endpoint!).setProject(projectId!);
  account = new Account(client);
  databases = new Databases(client);
  storage = new Storage(client);
  functions = new Functions(client);
}

export { ID, Permission, Role };
