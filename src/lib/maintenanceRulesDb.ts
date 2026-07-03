import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, MAINTENANCE_RULES_COL_ID, ADMIN_USER_ID } from "./appwrite";
import type { MaintenanceRule } from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MAINTENANCE_RULES_COL_ID);
}

function adminScopedPermissions(): string[] {
  return Array.from(
    new Set([
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
      ...(ADMIN_USER_ID
        ? [
            Permission.read(Role.user(ADMIN_USER_ID)),
            Permission.update(Role.user(ADMIN_USER_ID)),
            Permission.delete(Role.user(ADMIN_USER_ID)),
          ]
        : []),
    ]),
  );
}

function toRule(doc: Record<string, unknown>): MaintenanceRule {
  return {
    id: doc.$id as string,
    model_id: (doc.model_id as string) ?? "",
    name: (doc.name as string) ?? "",
    max_flight_hours: (doc.max_flight_hours as number | null) ?? null,
    max_days: (doc.max_days as number | null) ?? null,
    estimated_downtime_days: (doc.estimated_downtime_days as number | null) ?? null,
    estimated_cost: (doc.estimated_cost as number | null) ?? null,
    created_at: (doc.$createdAt as string) ?? "",
  };
}

export async function listRulesByModel(modelId: string): Promise<MaintenanceRule[]> {
  if (!isReady() || !databases || !DB_ID || !MAINTENANCE_RULES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, MAINTENANCE_RULES_COL_ID, [
    Query.equal("model_id", [modelId]),
    Query.orderAsc("max_flight_hours"),
    Query.limit(200),
  ]);
  return res.documents.map((d) => toRule(d as Record<string, unknown>));
}

function validateRuleTriggers(max_flight_hours: number | null | undefined, max_days: number | null | undefined): void {
  if ((max_flight_hours ?? null) === null && (max_days ?? null) === null) {
    throw new Error("A regra de manutenção precisa de pelo menos um gatilho: horas de voo ou dias calendário.");
  }
}

export async function createRule(data: {
  model_id: string;
  name: string;
  max_flight_hours?: number | null;
  max_days?: number | null;
  estimated_downtime_days?: number | null;
  estimated_cost?: number | null;
}): Promise<MaintenanceRule> {
  if (!databases || !DB_ID || !MAINTENANCE_RULES_COL_ID) throw new Error("Appwrite não configurado");
  validateRuleTriggers(data.max_flight_hours, data.max_days);
  const doc = await databases.createDocument(
    DB_ID,
    MAINTENANCE_RULES_COL_ID,
    ID.unique(),
    {
      model_id: data.model_id,
      name: data.name,
      max_flight_hours: data.max_flight_hours ?? null,
      max_days: data.max_days ?? null,
      estimated_downtime_days: data.estimated_downtime_days ?? null,
      estimated_cost: data.estimated_cost ?? null,
    },
    adminScopedPermissions(),
  );
  return toRule(doc as unknown as Record<string, unknown>);
}

export async function updateRule(
  id: string,
  data: Partial<{
    name: string;
    max_flight_hours: number | null;
    max_days: number | null;
    estimated_downtime_days: number | null;
    estimated_cost: number | null;
  }>,
): Promise<MaintenanceRule> {
  if (!databases || !DB_ID || !MAINTENANCE_RULES_COL_ID) throw new Error("Appwrite não configurado");
  // Only validate triggers if at least one is being set explicitly
  if ("max_flight_hours" in data || "max_days" in data) {
    const existing = await databases.getDocument(DB_ID, MAINTENANCE_RULES_COL_ID, id);
    const resolvedHours = "max_flight_hours" in data ? data.max_flight_hours : (existing.max_flight_hours as number | null);
    const resolvedDays = "max_days" in data ? data.max_days : (existing.max_days as number | null);
    validateRuleTriggers(resolvedHours, resolvedDays);
  }
  const doc = await databases.updateDocument(DB_ID, MAINTENANCE_RULES_COL_ID, id, data);
  return toRule(doc as unknown as Record<string, unknown>);
}

export async function deleteRule(id: string): Promise<void> {
  if (!databases || !DB_ID || !MAINTENANCE_RULES_COL_ID) throw new Error("Appwrite não configurado");
  await databases.deleteDocument(DB_ID, MAINTENANCE_RULES_COL_ID, id);
}
