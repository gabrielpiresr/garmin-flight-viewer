import { Query } from "appwrite";
import {
  account,
  BUCKET_ID,
  databases,
  ID,
  isAppwriteConfigured,
  MAINTENANCE_ATTACHMENTS_COL_ID,
  MAINTENANCE_PROGRAM_ITEMS_COL_ID,
  MAINTENANCE_WORK_ORDERS_COL_ID,
  Permission,
  Role,
  storage,
} from "./appwrite";
import type {
  MaintenanceAttachment,
  MaintenanceAttachmentType,
  MaintenanceProgramTask,
  MaintenanceProgramItem,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderChecklistTask,
} from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function hasProgramCollection(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MAINTENANCE_PROGRAM_ITEMS_COL_ID);
}

function hasWorkOrderCollection(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MAINTENANCE_WORK_ORDERS_COL_ID);
}

function hasAttachmentCollection(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && MAINTENANCE_ATTACHMENTS_COL_ID);
}

function text(doc: Record<string, unknown>, key: string): string | null {
  const value = doc[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(doc: Record<string, unknown>, key: string): number | null {
  const value = doc[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(doc: Record<string, unknown>, key: string, fallback = false): boolean {
  return typeof doc[key] === "boolean" ? (doc[key] as boolean) : fallback;
}

function cleanPayload<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringifyJsonObject(value: Record<string, unknown>): string | null {
  const compact = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""));
  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : null;
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeProgramTasks(value: unknown): MaintenanceProgramTask[] {
  return parseJsonArray(value)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return null;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `task-${index + 1}`;
      const description = typeof row.description === "string" ? row.description : "";
      const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index + 1;
      return { id, title, description, order };
    })
    .filter((item): item is MaintenanceProgramTask => Boolean(item))
    .sort((a, b) => a.order - b.order);
}

function normalizeWorkOrderChecklist(value: unknown): MaintenanceWorkOrderChecklistTask[] {
  return parseJsonArray(value)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return null;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `task-${index + 1}`;
      const description = typeof row.description === "string" ? row.description : "";
      const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index + 1;
      const done = typeof row.done === "boolean" ? row.done : false;
      const observation = typeof row.observation === "string" ? row.observation : "";
      return { id, title, description, order, done, observation };
    })
    .filter((item): item is MaintenanceWorkOrderChecklistTask => Boolean(item))
    .sort((a, b) => a.order - b.order);
}

function stringifyJsonArray(value: unknown[]): string | null {
  return value.length > 0 ? JSON.stringify(value) : null;
}

function adminPermissions(): string[] {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function toProgramItem(doc: Record<string, unknown>): MaintenanceProgramItem {
  const referenceDetails = parseJsonObject(doc.reference_details_json);
  const applicability = parseJsonObject(doc.applicability_json);
  const baseline = parseJsonObject(doc.baseline_json);
  return {
    id: doc.$id as string,
    aircraft_model_id: (doc.aircraft_model_id as string) ?? "",
    code: (doc.code as string) ?? "",
    title: (doc.title as string) ?? "",
    item_type: (doc.item_type as MaintenanceProgramItem["item_type"]) ?? "inspection",
    category: (doc.category as MaintenanceProgramItem["category"]) ?? "routine",
    maintenance_area: (doc.maintenance_area as MaintenanceProgramItem["maintenance_area"]) ?? "airframe",
    priority: (doc.priority as MaintenanceProgramItem["priority"]) ?? "normal",
    description: (doc.description as string) ?? "",
    reference_type: (doc.reference_type as MaintenanceProgramItem["reference_type"]) ?? "MM",
    reference_document: (doc.reference_document as string) ?? "",
    reference_revision: text(referenceDetails, "reference_revision"),
    reference_section: text(referenceDetails, "reference_section"),
    recurrence_rules: (doc.recurrence_rules as string) ?? "[]",
    tolerance_rules: text(doc, "tolerance_rules"),
    manufacturer: text(applicability, "manufacturer"),
    model: text(applicability, "model"),
    serial_from: text(applicability, "serial_from"),
    serial_to: text(applicability, "serial_to"),
    engine_model: text(applicability, "engine_model"),
    baseline_source: (text(baseline, "baseline_source") as MaintenanceProgramItem["baseline_source"]) ?? null,
    baseline_notes: text(baseline, "baseline_notes"),
    grounding_if_overdue: bool(doc, "grounding_if_overdue"),
    block_dispatch: bool(doc, "block_dispatch"),
    requires_release: bool(doc, "requires_release", true),
    checklist_tasks: normalizeProgramTasks(doc.checklist_json),
    deleted_at: text(doc, "deleted_at"),
    created_at: (doc.$createdAt as string) ?? "",
    updated_at: (doc.$updatedAt as string) ?? "",
  };
}

function toWorkOrder(doc: Record<string, unknown>): MaintenanceWorkOrder {
  const times = parseJsonObject(doc.times_json);
  const technical = parseJsonObject(doc.technical_json);
  const mechanic = parseJsonObject(doc.mechanic_json);
  const release = parseJsonObject(doc.release_json);
  const migration = parseJsonObject(doc.migration_json);
  return {
    id: doc.$id as string,
    work_order_number: (doc.work_order_number as string) ?? "",
    aircraft_id: (doc.aircraft_id as string) ?? "",
    maintenance_program_item_id: text(doc, "maintenance_program_item_id"),
    work_order_type: (doc.work_order_type as MaintenanceWorkOrder["work_order_type"]) ?? "scheduled",
    status: (doc.status as MaintenanceWorkOrder["status"]) ?? "open",
    opened_at: (doc.opened_at as string) ?? "",
    started_at: text(times, "started_at"),
    completed_at: text(times, "completed_at"),
    released_at: text(times, "released_at"),
    aircraft_ttaf: num(doc, "aircraft_ttaf") ?? 0,
    aircraft_total_landings: num(times, "aircraft_total_landings"),
    engine_time: num(times, "engine_time"),
    propeller_time: num(times, "propeller_time"),
    tach_time: num(times, "tach_time"),
    cycles: num(times, "cycles"),
    description_performed: (doc.description_performed as string) ?? "",
    discrepancy_reported: text(technical, "discrepancy_reported"),
    corrective_action: text(technical, "corrective_action"),
    linked_discrepancy_id: text(technical, "linked_discrepancy_id"),
    reference_type: (text(doc, "reference_type") as MaintenanceWorkOrder["reference_type"]) ?? null,
    reference_document: text(doc, "reference_document"),
    reference_revision: text(technical, "reference_revision"),
    reference_section: text(technical, "reference_section"),
    mechanic_name: text(doc, "mechanic_name"),
    mechanic_canac: text(mechanic, "mechanic_canac"),
    mechanic_license_type: (text(mechanic, "mechanic_license_type") as MaintenanceWorkOrder["mechanic_license_type"]) ?? null,
    mechanic_signature: text(mechanic, "mechanic_signature"),
    approved_return_to_service: bool(release, "approved_return_to_service"),
    release_statement: text(release, "release_statement"),
    released_by_user_id: text(release, "released_by_user_id"),
    released_by_name: text(release, "released_by_name"),
    released_by_canac: text(release, "released_by_canac"),
    released_by_license_type: (text(release, "released_by_license_type") as MaintenanceWorkOrder["released_by_license_type"]) ?? null,
    checklist_execution: normalizeWorkOrderChecklist(doc.checklist_execution_json),
    aircraft_released: bool(doc, "aircraft_released"),
    grounding_removed: bool(release, "grounding_removed"),
    legacy_update: bool(doc, "legacy_update"),
    data_origin: (doc.data_origin as MaintenanceWorkOrder["data_origin"]) ?? "native",
    source_confidence: (text(migration, "source_confidence") as MaintenanceWorkOrder["source_confidence"]) ?? null,
    source_notes: text(migration, "source_notes"),
    legacy_reference: text(doc, "legacy_reference"),
    migrated_at: text(migration, "migrated_at"),
    migrated_by: text(migration, "migrated_by"),
    parts_cost: num(technical, "parts_cost"),
    labor_cost: num(technical, "labor_cost"),
    other_costs: num(technical, "other_costs"),
    created_by: text(migration, "created_by"),
    deleted_at: text(doc, "deleted_at"),
    created_at: (doc.$createdAt as string) ?? "",
    updated_at: (doc.$updatedAt as string) ?? "",
  };
}

function toAttachment(doc: Record<string, unknown>): MaintenanceAttachment {
  return {
    id: doc.$id as string,
    work_order_id: (doc.work_order_id as string) ?? "",
    attachment_type: (doc.attachment_type as MaintenanceAttachmentType) ?? "legacy_record",
    file_name: (doc.file_name as string) ?? "",
    file_url: (doc.file_url as string) ?? "",
    uploaded_by: (doc.uploaded_by as string) ?? "",
    uploaded_at: (doc.uploaded_at as string) ?? "",
  };
}

export type ProgramItemPayload = Omit<MaintenanceProgramItem, "id" | "created_at" | "updated_at" | "deleted_at">;
export type WorkOrderPayload = Omit<MaintenanceWorkOrder, "id" | "created_at" | "updated_at" | "deleted_at">;

function programItemDocument(data: Partial<ProgramItemPayload>): Record<string, unknown> {
  return cleanPayload({
    aircraft_model_id: data.aircraft_model_id,
    code: data.code,
    title: data.title,
    item_type: data.item_type,
    category: data.category,
    maintenance_area: data.maintenance_area,
    priority: data.priority,
    description: data.description,
    reference_type: data.reference_type,
    reference_document: data.reference_document,
    recurrence_rules: data.recurrence_rules,
    tolerance_rules: data.tolerance_rules,
    reference_details_json: stringifyJsonObject({
      reference_revision: data.reference_revision,
      reference_section: data.reference_section,
    }),
    applicability_json: stringifyJsonObject({
      manufacturer: data.manufacturer,
      model: data.model,
      serial_from: data.serial_from,
      serial_to: data.serial_to,
      engine_model: data.engine_model,
    }),
    baseline_json: stringifyJsonObject({
      baseline_source: data.baseline_source,
      baseline_notes: data.baseline_notes,
    }),
    grounding_if_overdue: data.grounding_if_overdue,
    block_dispatch: data.block_dispatch,
    requires_release: data.requires_release,
    checklist_json: data.checklist_tasks ? stringifyJsonArray(data.checklist_tasks) : undefined,
  });
}

function workOrderDocument(data: Partial<WorkOrderPayload>): Record<string, unknown> {
  return cleanPayload({
    work_order_number: data.work_order_number,
    aircraft_id: data.aircraft_id,
    maintenance_program_item_id: data.maintenance_program_item_id,
    work_order_type: data.work_order_type,
    status: data.status,
    opened_at: data.opened_at,
    aircraft_ttaf: data.aircraft_ttaf,
    description_performed: data.description_performed,
    reference_type: data.reference_type,
    reference_document: data.reference_document,
    mechanic_name: data.mechanic_name,
    checklist_execution_json: data.checklist_execution ? stringifyJsonArray(data.checklist_execution) : undefined,
    aircraft_released: data.aircraft_released,
    legacy_update: data.legacy_update,
    data_origin: data.data_origin,
    legacy_reference: data.legacy_reference,
    times_json: stringifyJsonObject({
      started_at: data.started_at,
      completed_at: data.completed_at,
      released_at: data.released_at,
      aircraft_total_landings: data.aircraft_total_landings,
      engine_time: data.engine_time,
      propeller_time: data.propeller_time,
      tach_time: data.tach_time,
      cycles: data.cycles,
    }),
    technical_json: stringifyJsonObject({
      discrepancy_reported: data.discrepancy_reported,
      corrective_action: data.corrective_action,
      linked_discrepancy_id: data.linked_discrepancy_id,
      reference_revision: data.reference_revision,
      reference_section: data.reference_section,
      parts_cost: data.parts_cost,
      labor_cost: data.labor_cost,
      other_costs: data.other_costs,
    }),
    mechanic_json: stringifyJsonObject({
      mechanic_canac: data.mechanic_canac,
      mechanic_license_type: data.mechanic_license_type,
      mechanic_signature: data.mechanic_signature,
    }),
    release_json: stringifyJsonObject({
      approved_return_to_service: data.approved_return_to_service,
      release_statement: data.release_statement,
      grounding_removed: data.grounding_removed,
      released_by_user_id: data.released_by_user_id,
      released_by_name: data.released_by_name,
      released_by_canac: data.released_by_canac,
      released_by_license_type: data.released_by_license_type,
    }),
    migration_json: stringifyJsonObject({
      source_confidence: data.source_confidence,
      source_notes: data.source_notes,
      migrated_at: data.migrated_at,
      migrated_by: data.migrated_by,
      created_by: data.created_by,
    }),
  });
}

export async function listProgramItemsByModel(modelId: string): Promise<MaintenanceProgramItem[]> {
  if (!modelId || !hasProgramCollection() || !databases || !DB_ID || !MAINTENANCE_PROGRAM_ITEMS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, MAINTENANCE_PROGRAM_ITEMS_COL_ID, [
    Query.equal("aircraft_model_id", [modelId]),
    Query.isNull("deleted_at"),
    Query.orderAsc("code"),
    Query.limit(500),
  ]);
  return res.documents.map((doc) => toProgramItem(doc as unknown as Record<string, unknown>));
}

export async function createProgramItem(data: ProgramItemPayload): Promise<MaintenanceProgramItem> {
  if (!hasProgramCollection() || !databases || !DB_ID || !MAINTENANCE_PROGRAM_ITEMS_COL_ID) throw new Error("Appwrite nao configurado");
  const doc = await databases.createDocument(
    DB_ID,
    MAINTENANCE_PROGRAM_ITEMS_COL_ID,
    ID.unique(),
    cleanPayload({ ...programItemDocument(data), deleted_at: null }),
    adminPermissions(),
  );
  return toProgramItem(doc as unknown as Record<string, unknown>);
}

export async function updateProgramItem(id: string, data: Partial<ProgramItemPayload>): Promise<MaintenanceProgramItem> {
  if (!hasProgramCollection() || !databases || !DB_ID || !MAINTENANCE_PROGRAM_ITEMS_COL_ID) throw new Error("Appwrite nao configurado");
  const doc = await databases.updateDocument(DB_ID, MAINTENANCE_PROGRAM_ITEMS_COL_ID, id, programItemDocument(data));
  return toProgramItem(doc as unknown as Record<string, unknown>);
}

export async function softDeleteProgramItem(id: string): Promise<void> {
  if (!hasProgramCollection() || !databases || !DB_ID || !MAINTENANCE_PROGRAM_ITEMS_COL_ID) throw new Error("Appwrite nao configurado");
  await databases.updateDocument(DB_ID, MAINTENANCE_PROGRAM_ITEMS_COL_ID, id, { deleted_at: new Date().toISOString() });
}

export async function listWorkOrders(): Promise<MaintenanceWorkOrder[]> {
  if (!hasWorkOrderCollection() || !databases || !DB_ID || !MAINTENANCE_WORK_ORDERS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, MAINTENANCE_WORK_ORDERS_COL_ID, [
    Query.isNull("deleted_at"),
    Query.orderDesc("opened_at"),
    Query.limit(500),
  ]);
  return res.documents.map((doc) => toWorkOrder(doc as unknown as Record<string, unknown>));
}

async function assertSingleBaseline(aircraftId: string | undefined | null, currentId?: string): Promise<void> {
  if (!aircraftId || !databases || !DB_ID || !MAINTENANCE_WORK_ORDERS_COL_ID) return;
  const res = await databases.listDocuments(DB_ID, MAINTENANCE_WORK_ORDERS_COL_ID, [
    Query.equal("aircraft_id", [aircraftId]),
    Query.equal("work_order_type", ["migration_baseline"]),
    Query.isNull("deleted_at"),
    Query.limit(10),
  ]);
  const hasAnotherBaseline = res.documents.some((doc) => doc.$id !== currentId);
  if (hasAnotherBaseline) throw new Error("Esta aeronave ja possui um baseline tecnico inicial cadastrado.");
}

export async function createWorkOrder(data: WorkOrderPayload): Promise<MaintenanceWorkOrder> {
  if (!hasWorkOrderCollection() || !databases || !DB_ID || !MAINTENANCE_WORK_ORDERS_COL_ID) throw new Error("Appwrite nao configurado");
  if (data.work_order_type === "migration_baseline") await assertSingleBaseline(data.aircraft_id);
  const doc = await databases.createDocument(
    DB_ID,
    MAINTENANCE_WORK_ORDERS_COL_ID,
    ID.unique(),
    cleanPayload({ ...workOrderDocument(data), deleted_at: null }),
    adminPermissions(),
  );
  return toWorkOrder(doc as unknown as Record<string, unknown>);
}

export async function updateWorkOrder(id: string, data: Partial<WorkOrderPayload>): Promise<MaintenanceWorkOrder> {
  if (!hasWorkOrderCollection() || !databases || !DB_ID || !MAINTENANCE_WORK_ORDERS_COL_ID) throw new Error("Appwrite nao configurado");
  if (data.work_order_type === "migration_baseline") await assertSingleBaseline(data.aircraft_id, id);
  const doc = await databases.updateDocument(DB_ID, MAINTENANCE_WORK_ORDERS_COL_ID, id, workOrderDocument(data));
  return toWorkOrder(doc as unknown as Record<string, unknown>);
}

export async function softDeleteWorkOrder(id: string): Promise<void> {
  if (!hasWorkOrderCollection() || !databases || !DB_ID || !MAINTENANCE_WORK_ORDERS_COL_ID) throw new Error("Appwrite nao configurado");
  await databases.updateDocument(DB_ID, MAINTENANCE_WORK_ORDERS_COL_ID, id, { deleted_at: new Date().toISOString() });
}

export async function listAttachments(workOrderId: string): Promise<MaintenanceAttachment[]> {
  if (!workOrderId || !hasAttachmentCollection() || !databases || !DB_ID || !MAINTENANCE_ATTACHMENTS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, MAINTENANCE_ATTACHMENTS_COL_ID, [
    Query.equal("work_order_id", [workOrderId]),
    Query.orderDesc("uploaded_at"),
    Query.limit(100),
  ]);
  return res.documents.map((doc) => toAttachment(doc as unknown as Record<string, unknown>));
}

export async function uploadWorkOrderAttachment(params: {
  workOrderId: string;
  attachmentType: MaintenanceAttachmentType;
  file: File;
}): Promise<MaintenanceAttachment> {
  if (!hasAttachmentCollection() || !databases || !DB_ID || !MAINTENANCE_ATTACHMENTS_COL_ID) throw new Error("Collection de anexos nao configurada");
  if (!storage || !BUCKET_ID) throw new Error("Bucket de arquivos nao configurado");
  const user = await account?.get().catch(() => null);
  const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), params.file, [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ]);
  const fileUrl = storage.getFileView(BUCKET_ID, uploaded.$id).toString();
  const doc = await databases.createDocument(
    DB_ID,
    MAINTENANCE_ATTACHMENTS_COL_ID,
    ID.unique(),
    {
      work_order_id: params.workOrderId,
      attachment_type: params.attachmentType,
      file_name: params.file.name,
      file_url: fileUrl,
      uploaded_by: user?.$id ?? "unknown",
      uploaded_at: new Date().toISOString(),
    },
    adminPermissions(),
  );
  return toAttachment(doc as unknown as Record<string, unknown>);
}
