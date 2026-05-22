import { Account, Client, Databases, Functions, ID, Permission, Role, Storage } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;

export const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID as string | undefined;
export const NOTICES_BUCKET_ID = import.meta.env.VITE_APPWRITE_NOTICES_BUCKET_ID as string | undefined;
export const SYNC_ANAC_FUNCTION_ID = import.meta.env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID as string | undefined;
export const ADMIN_USERS_FUNCTION_ID = import.meta.env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID as string | undefined;
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
export const MAINTENANCE_RULES_COL_ID = import.meta.env.VITE_APPWRITE_MAINTENANCE_RULES_COL_ID as string | undefined;
export const MAINTENANCE_PROGRAM_ITEMS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID as string | undefined;
export const MAINTENANCE_WORK_ORDERS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID as string | undefined;
export const MAINTENANCE_ATTACHMENTS_COL_ID =
  import.meta.env.VITE_APPWRITE_MAINTENANCE_ATTACHMENTS_COL_ID as string | undefined;
export const FUELINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FUELINGS_COL_ID as string | undefined) ?? "aircraft_fuelings";
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
export const HELP_MEDIA_BUCKET_ID =
  (import.meta.env.VITE_APPWRITE_HELP_MEDIA_BUCKET_ID as string | undefined) ?? BUCKET_ID;
export const INSTRUCTOR_PREFS_COL_ID = import.meta.env.VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID as string | undefined;
export const STUDENT_CREDITS_COL_ID = import.meta.env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID as string | undefined;
export const PLATFORM_SETTINGS_COL_ID = import.meta.env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID as string | undefined;
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

// Email MKT
export const BROADCAST_SEGMENTS_COL_ID = import.meta.env.VITE_APPWRITE_BROADCAST_SEGMENTS_COL_ID as string | undefined;
export const BROADCAST_MESSAGES_COL_ID = import.meta.env.VITE_APPWRITE_BROADCAST_MESSAGES_COL_ID as string | undefined;

// Roles por tenant
export const TENANT_ROLES_COL_ID = import.meta.env.VITE_APPWRITE_TENANT_ROLES_COL_ID as string | undefined;

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
