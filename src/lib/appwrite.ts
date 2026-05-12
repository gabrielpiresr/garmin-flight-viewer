import { Account, Client, Databases, Functions, ID, Permission, Role, Storage } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;

export const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID as string | undefined;
export const NOTICES_BUCKET_ID = import.meta.env.VITE_APPWRITE_NOTICES_BUCKET_ID as string | undefined;
export const SYNC_ANAC_FUNCTION_ID = import.meta.env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID as string | undefined;
export const ADMIN_USERS_FUNCTION_ID = import.meta.env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID as string | undefined;

// Admin — frota e configuração operacional
export const SCHOOL_ID = import.meta.env.VITE_SCHOOL_ID as string | undefined;
export const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID as string | undefined;
export const AIRCRAFT_MODELS_COL_ID = import.meta.env.VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID as string | undefined;
export const AIRCRAFTS_COL_ID = import.meta.env.VITE_APPWRITE_AIRCRAFTS_COL_ID as string | undefined;
export const MAINTENANCE_RULES_COL_ID = import.meta.env.VITE_APPWRITE_MAINTENANCE_RULES_COL_ID as string | undefined;
export const OP_WEEKS_COL_ID = import.meta.env.VITE_APPWRITE_OP_WEEKS_COL_ID as string | undefined;

// Student planning collections
export const WEEKLY_PLANS_COL_ID = import.meta.env.VITE_APPWRITE_WEEKLY_PLANS_COL_ID as string | undefined;
export const NOTICES_COL_ID = import.meta.env.VITE_APPWRITE_NOTICES_COL_ID as string | undefined;
export const INSTRUCTOR_PREFS_COL_ID = import.meta.env.VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID as string | undefined;
export const STUDENT_CREDITS_COL_ID = import.meta.env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID as string | undefined;

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
