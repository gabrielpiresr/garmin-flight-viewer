import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  TELEMETRY_ALERT_RULES_COL_ID,
} from "./appwrite";
import type {
  TelemetryAlertCondition,
  TelemetryAlertPhase,
  TelemetryAlertRuleConfig,
  TelemetryAlertSeverity,
} from "./telemetryAlerts";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type TelemetryAlertRule = TelemetryAlertRuleConfig & {
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type TelemetryAlertRuleInput = {
  modelId: string;
  name: string;
  severity: TelemetryAlertSeverity;
  phases: TelemetryAlertPhase[];
  conditions: TelemetryAlertCondition[];
  durationSec: number | null;
  active: boolean;
};

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && TELEMETRY_ALERT_RULES_COL_ID);
}

function readJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toRule(doc: Record<string, unknown>): TelemetryAlertRule {
  return {
    id: doc.$id as string,
    modelId: (doc.model_id as string) ?? "",
    name: (doc.name as string) ?? "",
    severity: (doc.severity as TelemetryAlertSeverity) ?? "leve",
    phases: readJsonArray<TelemetryAlertPhase>(doc.phases_json),
    conditions: readJsonArray<TelemetryAlertCondition>(doc.conditions_json),
    durationSec: (doc.duration_sec as number | null | undefined) ?? null,
    active: (doc.active as boolean | undefined) ?? true,
    createdAt: (doc.$createdAt as string) ?? "",
    updatedAt: (doc.$updatedAt as string) ?? "",
    createdBy: (doc.created_by as string | null | undefined) ?? null,
    updatedBy: (doc.updated_by as string | null | undefined) ?? null,
  };
}

function rulePayload(input: TelemetryAlertRuleInput, actorUserId?: string) {
  return {
    model_id: input.modelId,
    name: input.name.trim(),
    severity: input.severity,
    phases_json: JSON.stringify(input.phases),
    conditions_json: JSON.stringify(input.conditions),
    duration_sec: input.durationSec,
    active: input.active,
    updated_by: actorUserId ?? null,
  };
}

function rulePermissions() {
  return [
    Permission.read(Role.users()),
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

export async function listTelemetryAlertRulesByModel(modelId: string): Promise<TelemetryAlertRule[]> {
  if (!configured() || !databases || !DB_ID || !TELEMETRY_ALERT_RULES_COL_ID || !modelId) return [];
  const res = await databases.listDocuments(DB_ID, TELEMETRY_ALERT_RULES_COL_ID, [
    Query.equal("model_id", [modelId]),
    Query.limit(200),
  ]);
  return res.documents
    .map((doc) => toRule(doc as unknown as Record<string, unknown>))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function listActiveTelemetryAlertRulesByModel(modelId: string): Promise<TelemetryAlertRuleConfig[]> {
  if (!configured() || !databases || !DB_ID || !TELEMETRY_ALERT_RULES_COL_ID || !modelId) return [];
  const res = await databases.listDocuments(DB_ID, TELEMETRY_ALERT_RULES_COL_ID, [
    Query.equal("model_id", [modelId]),
    Query.equal("active", [true]),
    Query.limit(200),
  ]);
  return res.documents.map((doc) => toRule(doc as unknown as Record<string, unknown>));
}

export async function createTelemetryAlertRule(
  input: TelemetryAlertRuleInput,
  actorUserId?: string,
): Promise<TelemetryAlertRule> {
  if (!databases || !DB_ID || !TELEMETRY_ALERT_RULES_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.createDocument(
    DB_ID,
    TELEMETRY_ALERT_RULES_COL_ID,
    ID.unique(),
    {
      ...rulePayload(input, actorUserId),
      created_by: actorUserId ?? null,
    },
    rulePermissions(),
  );
  return toRule(doc as unknown as Record<string, unknown>);
}

export async function updateTelemetryAlertRule(
  id: string,
  input: TelemetryAlertRuleInput,
  actorUserId?: string,
): Promise<TelemetryAlertRule> {
  if (!databases || !DB_ID || !TELEMETRY_ALERT_RULES_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, TELEMETRY_ALERT_RULES_COL_ID, id, rulePayload(input, actorUserId));
  return toRule(doc as unknown as Record<string, unknown>);
}

export async function deleteTelemetryAlertRule(id: string): Promise<void> {
  if (!databases || !DB_ID || !TELEMETRY_ALERT_RULES_COL_ID) throw new Error("Appwrite não configurado");
  await databases.deleteDocument(DB_ID, TELEMETRY_ALERT_RULES_COL_ID, id);
}
