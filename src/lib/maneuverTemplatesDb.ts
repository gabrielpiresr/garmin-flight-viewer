import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  MANEUVER_TEMPLATES_COL_ID,
  MANEUVER_TEMPLATE_STEPS_COL_ID,
} from "./appwrite";
import type {
  ManeuverTemplate,
  ManeuverTemplateStep,
  StepEndCondition,
  StepParameter,
} from "../types/flightReview";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MANEUVER_TEMPLATES_COL_ID);
}

function isStepsReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MANEUVER_TEMPLATE_STEPS_COL_ID);
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toTemplate(doc: Record<string, unknown>): ManeuverTemplate {
  return {
    id: doc.$id as string,
    name: (doc.name as string) ?? "",
    category: (doc.category as ManeuverTemplate["category"]) ?? "other",
    aircraft_model_id: (doc.aircraft_model_id as string) ?? "",
    description: (doc.description as string | null) ?? null,
    is_active: (doc.is_active as boolean) ?? true,
    created_at: (doc.created_at as string) ?? "",
    updated_at: (doc.updated_at as string) ?? "",
  };
}

function toStep(doc: Record<string, unknown>): ManeuverTemplateStep {
  return {
    id: doc.$id as string,
    template_id: (doc.template_id as string) ?? "",
    order_index: (doc.order_index as number) ?? 0,
    name: (doc.name as string) ?? "",
    description: (doc.description as string | null) ?? null,
    expected_execution_text: (doc.expected_execution_text as string | null) ?? null,
    end_condition: safeParseJson<StepEndCondition | null>(doc.end_condition_json, null),
    parameters: safeParseJson<StepParameter[]>(doc.parameters_json, []),
    created_at: (doc.created_at as string) ?? "",
    updated_at: (doc.updated_at as string) ?? "",
  };
}


export async function listManeuverTemplates(opts?: {
  activeOnly?: boolean;
  aircraftModelId?: string;
}): Promise<ManeuverTemplate[]> {
  if (!isReady()) return [];
  const queries: string[] = [Query.limit(200), Query.orderAsc("name")];
  if (opts?.activeOnly) queries.push(Query.equal("is_active", true));
  if (opts?.aircraftModelId) queries.push(Query.equal("aircraft_model_id", opts.aircraftModelId));
  const res = await databases!.listDocuments(DB_ID, MANEUVER_TEMPLATES_COL_ID!, queries);
  return res.documents.map((d) => toTemplate(d as Record<string, unknown>));
}

export async function getManeuverTemplate(id: string): Promise<ManeuverTemplate | null> {
  if (!id || !isReady()) return null;
  try {
    const doc = await databases!.getDocument(DB_ID, MANEUVER_TEMPLATES_COL_ID!, id);
    return toTemplate(doc as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function createManeuverTemplate(
  data: Omit<ManeuverTemplate, "id" | "created_at" | "updated_at">,
): Promise<ManeuverTemplate> {
  if (!isReady()) throw new Error("Appwrite not configured");
  const now = new Date().toISOString();
  const doc = await databases!.createDocument(
    DB_ID,
    MANEUVER_TEMPLATES_COL_ID!,
    ID.unique(),
    {
      name: data.name,
      category: data.category,
      aircraft_model_id: data.aircraft_model_id,
      description: data.description ?? null,
      is_active: data.is_active,
      created_at: now,
      updated_at: now,
    },
  );
  return toTemplate(doc as Record<string, unknown>);
}

export async function updateManeuverTemplate(
  id: string,
  data: Partial<Omit<ManeuverTemplate, "id" | "created_at">>,
): Promise<ManeuverTemplate> {
  if (!isReady()) throw new Error("Appwrite not configured");
  const doc = await databases!.updateDocument(DB_ID, MANEUVER_TEMPLATES_COL_ID!, id, {
    ...data,
    updated_at: new Date().toISOString(),
  });
  return toTemplate(doc as Record<string, unknown>);
}

// ---------- Steps ----------


export async function listManeuverTemplateSteps(templateId: string): Promise<ManeuverTemplateStep[]> {
  if (!templateId || !isStepsReady()) return [];
  const res = await databases!.listDocuments(DB_ID, MANEUVER_TEMPLATE_STEPS_COL_ID!, [
    Query.equal("template_id", templateId),
    Query.orderAsc("order_index"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => toStep(d as Record<string, unknown>));
}

export async function createManeuverTemplateStep(
  data: Omit<ManeuverTemplateStep, "id" | "created_at" | "updated_at">,
): Promise<ManeuverTemplateStep> {
  if (!isStepsReady()) throw new Error("Appwrite not configured");
  const now = new Date().toISOString();
  const doc = await databases!.createDocument(
    DB_ID,
    MANEUVER_TEMPLATE_STEPS_COL_ID!,
    ID.unique(),
    {
      template_id: data.template_id,
      order_index: data.order_index,
      name: data.name,
      description: data.description ?? null,
      expected_execution_text: data.expected_execution_text ?? null,
      end_condition_json: data.end_condition ? JSON.stringify(data.end_condition) : null,
      parameters_json: data.parameters.length > 0 ? JSON.stringify(data.parameters) : null,
      created_at: now,
      updated_at: now,
    },
  );
  return toStep(doc as Record<string, unknown>);
}

export async function updateManeuverTemplateStep(
  id: string,
  data: Partial<Omit<ManeuverTemplateStep, "id" | "template_id" | "created_at">>,
): Promise<ManeuverTemplateStep> {
  if (!isStepsReady()) throw new Error("Appwrite not configured");
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) payload.name = data.name;
  if (data.order_index !== undefined) payload.order_index = data.order_index;
  if (data.description !== undefined) payload.description = data.description;
  if (data.expected_execution_text !== undefined) payload.expected_execution_text = data.expected_execution_text;
  if (data.end_condition !== undefined)
    payload.end_condition_json = data.end_condition ? JSON.stringify(data.end_condition) : null;
  if (data.parameters !== undefined)
    payload.parameters_json = data.parameters.length > 0 ? JSON.stringify(data.parameters) : null;
  const doc = await databases!.updateDocument(DB_ID, MANEUVER_TEMPLATE_STEPS_COL_ID!, id, payload);
  return toStep(doc as Record<string, unknown>);
}

export async function deleteManeuverTemplateStep(id: string): Promise<void> {
  if (!isStepsReady()) throw new Error("Appwrite not configured");
  await databases!.deleteDocument(DB_ID, MANEUVER_TEMPLATE_STEPS_COL_ID!, id);
}
