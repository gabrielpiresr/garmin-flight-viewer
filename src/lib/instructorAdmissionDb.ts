import { Query } from "appwrite";
import {
  BUCKET_ID,
  databases,
  ID,
  INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID,
  INSTRUCTOR_ADMISSION_COMMENTS_COL_ID,
  INSTRUCTOR_ADMISSION_FORM_COL_ID,
  INSTRUCTOR_ADMISSION_STAGES_COL_ID,
  isAppwriteConfigured,
  Permission,
  Role,
  storage,
} from "./appwrite";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionCandidateInput,
  InstructorAdmissionComment,
  InstructorAdmissionFieldValue,
  InstructorAdmissionFileValue,
  InstructorAdmissionForm,
  InstructorAdmissionFormField,
  InstructorAdmissionFormInput,
  InstructorAdmissionScoreRule,
  InstructorAdmissionStage,
  InstructorAdmissionStageInput,
} from "../types/instructorAdmission";
import {
  CANONICAL_STAGE_NAMES,
  DEFAULT_STAGES as DEFAULT_STAGE_SEED,
  INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES,
  suggestStageNameForInstructionHours,
  type InstructorAdmissionSystemProperty,
} from "../types/instructorAdmission";
import { getAdminUserDetail, listAdminUserSummaries, updateAdminUserProfile } from "./adminUsersDb";
import type { AdminUserDetail, AdminUserSummary } from "../types/adminUsers";
import { extractAdmissionFieldsFromResponses } from "./instructorAdmissionFormFields";
import type { InstructorHoursMap } from "./instructorAdmissionMetrics";
import { isAvailabilityComplete, normalizeAvailabilityValue } from "./availabilityPresets";

function userHasInstructorPortal(user: AdminUserSummary | AdminUserDetail): boolean {
  const slugs = user.assignedRoleSlugs?.length
    ? user.assignedRoleSlugs
    : user.roles?.length
      ? user.roles
      : [];
  if (slugs.includes("instrutor")) return true;
  return user.role === "instrutor" || user.activeRole === "instrutor";
}

async function listAllInstructorUsers(): Promise<AdminUserSummary[]> {
  const instructors: AdminUserSummary[] = [];
  const pageSize = 100;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await listAdminUserSummaries({ search: "", limit: pageSize, offset });
    total = page.total;
    for (const user of page.users) {
      if (userHasInstructorPortal(user)) instructors.push(user);
    }
    offset += page.users.length;
    if (page.users.length === 0) break;
  }

  return instructors;
}

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const FORM_DOC_ID = "default";

function staffDocumentPermissions(): string[] {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function publicCandidateDocumentPermissions(): string[] {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.read(Role.any()),
    Permission.update(Role.any()),
  ];
}

function commentDocumentPermissions(): string[] {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function configured(): boolean {
  return Boolean(
    isAppwriteConfigured &&
      databases &&
      DB_ID &&
      INSTRUCTOR_ADMISSION_STAGES_COL_ID &&
      INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID,
  );
}

function formConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && INSTRUCTOR_ADMISSION_FORM_COL_ID);
}

function commentsConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && INSTRUCTOR_ADMISSION_COMMENTS_COL_ID);
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseFormFieldsArray(parsed: unknown[]): InstructorAdmissionFormField[] {
  return parsed
    .map((item): InstructorAdmissionFormField | null => {
      const id = String((item as { id?: unknown })?.id || "").trim();
      const label = String((item as { label?: unknown })?.label || "").trim();
      const type = String((item as { type?: unknown })?.type || "text").trim();
      if (!id || !label) return null;
        const validTypes = [
          "text",
          "email",
          "phone",
          "number",
          "date",
          "textarea",
          "select",
          "multiselect",
          "availability",
          "checkbox",
          "attachment",
          "hidden",
        ];
      if (!validTypes.includes(type)) return null;
      const validProperties = new Set(INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES);
      const systemProperty = (item as { systemProperty?: unknown })?.systemProperty
        ? String((item as { systemProperty?: unknown }).systemProperty).trim()
        : undefined;
      const row = item as {
        required?: unknown;
        placeholder?: unknown;
        helpText?: unknown;
        options?: unknown;
        order?: unknown;
        queryKey?: unknown;
        defaultValue?: unknown;
      };
      return {
        id,
        label,
        type: type as InstructorAdmissionFormField["type"],
        required: type === "hidden" ? false : Boolean(row.required),
        placeholder: row.placeholder ? String(row.placeholder) : undefined,
        helpText: row.helpText ? String(row.helpText) : undefined,
        options: Array.isArray(row.options)
          ? row.options.map((o: unknown) => String(o).trim()).filter(Boolean)
          : undefined,
        order: Math.round(Number(row.order) || 0),
        systemProperty:
          systemProperty && validProperties.has(systemProperty as InstructorAdmissionSystemProperty)
            ? (systemProperty as InstructorAdmissionSystemProperty)
            : undefined,
        queryKey: row.queryKey ? String(row.queryKey).trim().slice(0, 64) : undefined,
        defaultValue:
          row.defaultValue != null && String(row.defaultValue).trim()
            ? String(row.defaultValue).trim().slice(0, 2000)
            : undefined,
      };
    })
    .filter((item): item is InstructorAdmissionFormField => Boolean(item))
    .sort((a, b) => a.order - b.order);
}

function parseScoreRulesArray(parsed: unknown[]): InstructorAdmissionScoreRule[] {
  return parsed
    .map((item): InstructorAdmissionScoreRule | null => {
      const row = item as {
        id?: unknown;
        fieldId?: unknown;
        answerValue?: unknown;
        points?: unknown;
        compareOp?: unknown;
        matchMode?: unknown;
        availabilityAspect?: unknown;
      };
      const id = String(row?.id || "").trim();
      const fieldId = String(row?.fieldId || "").trim();
      const answerValue = String(row?.answerValue ?? "").trim();
      const points = Math.round(Number(row?.points) || 0);
      if (!id || !fieldId || !answerValue || !Number.isFinite(points) || points === 0) return null;
      const compareOpRaw = row?.compareOp ? String(row.compareOp).trim() : "";
      const compareOp =
        compareOpRaw === "eq" || compareOpRaw === "gt" || compareOpRaw === "lt"
          ? compareOpRaw
          : undefined;
      const matchModeRaw = row?.matchMode ? String(row.matchMode).trim() : "";
      const matchMode =
        matchModeRaw === "all" || matchModeRaw === "any" ? matchModeRaw : undefined;
      const aspectRaw = row?.availabilityAspect ? String(row.availabilityAspect).trim() : "";
      const availabilityAspect =
        aspectRaw === "days" || aspectRaw === "period" || aspectRaw === "preset"
          ? aspectRaw
          : undefined;
      return { id, fieldId, answerValue, points, compareOp, matchMode, availabilityAspect };
    })
    .filter((item): item is InstructorAdmissionScoreRule => Boolean(item));
}

function normalizeForMatch(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function existingSystemField(
  fields: InstructorAdmissionFormField[],
  property: InstructorAdmissionSystemProperty,
): InstructorAdmissionFormField | undefined {
  return fields.find((field) => {
    if (field.systemProperty === property) return true;
    const haystack = `${normalizeForMatch(field.id)} ${normalizeForMatch(field.label)}`;
    if (property === "cpf") return /\bcpf\b/.test(haystack);
    if (property === "anacCode") return /anac|canac/.test(haystack);
    if (property === "birthDate") return /nascimento|birth|data de nasc/.test(haystack);
    if (property === "fullName") return field.type === "text" && /\bnome\b/.test(haystack);
    if (property === "email") return field.type === "email" || /e-?mail|email/.test(haystack);
    if (property === "phone") return field.type === "phone" || /telefone|celular|whatsapp|phone/.test(haystack);
    if (property === "nickname") return /apelido|nickname/.test(haystack);
    return false;
  });
}

function systemFieldSeed(
  property: InstructorAdmissionSystemProperty,
  order: number,
): InstructorAdmissionFormField {
  const common = {
    id: `system_${property}`,
    required: true,
    order,
    systemProperty: property,
  };
  if (property === "anacCode") {
    return {
      ...common,
      label: "Código ANAC",
      type: "text",
      placeholder: "Somente números",
      helpText: "Usado para consultar seus dados de licença e CMA na ANAC.",
    };
  }
  if (property === "cpf") {
    return {
      ...common,
      label: "CPF",
      type: "text",
      placeholder: "000.000.000-00",
      helpText: "Necessário para validar a consulta ANAC.",
    };
  }
  return {
    ...common,
    label: "Data de nascimento",
    type: "date",
    helpText: "Necessária para validar a consulta ANAC.",
  };
}

function ensureInstructorAdmissionLookupFields(
  fields: InstructorAdmissionFormField[],
): InstructorAdmissionFormField[] {
  const next = fields.map((field) => ({ ...field }));
  for (const property of ["fullName", "email", "phone"] as const) {
    const field = existingSystemField(next, property);
    if (field && !field.systemProperty) field.systemProperty = property;
  }
  let maxOrder = next.reduce((max, field) => Math.max(max, Number(field.order) || 0), 0);
  for (const property of ["anacCode", "cpf", "birthDate"] as const) {
    const field = existingSystemField(next, property);
    if (field) {
      field.systemProperty = property;
      field.required = true;
      if (property === "birthDate") field.type = "date";
      continue;
    }
    maxOrder += 10;
    next.push(systemFieldSeed(property, maxOrder));
  }
  return next.sort((a, b) => a.order - b.order);
}

/** fields_json aceita array legado ou envelope `{ v:2, fields, scoreRules }`. */
function parseFormDocument(value: string | null | undefined): {
  fields: InstructorAdmissionFormField[];
  scoreRules: InstructorAdmissionScoreRule[];
} {
  if (!value) return { fields: [], scoreRules: [] };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { fields: parseFormFieldsArray(parsed), scoreRules: [] };
    }
    if (parsed && typeof parsed === "object") {
      const fieldsRaw = Array.isArray(parsed.fields) ? parsed.fields : [];
      const rulesRaw = Array.isArray(parsed.scoreRules) ? parsed.scoreRules : [];
      return {
        fields: parseFormFieldsArray(fieldsRaw),
        scoreRules: parseScoreRulesArray(rulesRaw),
      };
    }
    return { fields: [], scoreRules: [] };
  } catch {
    return { fields: [], scoreRules: [] };
  }
}

function serializeFormDocument(
  fields: InstructorAdmissionFormField[],
  scoreRules: InstructorAdmissionScoreRule[],
): string {
  return JSON.stringify({
    v: 2,
    fields: fields
      .map((f, index) => ({ ...f, order: f.order ?? index * 10 }))
      .sort((a, b) => a.order - b.order),
    scoreRules: scoreRules || [],
  });
}

function parseResponses(value: string | null | undefined): Record<string, InstructorAdmissionFieldValue> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, InstructorAdmissionFieldValue>;
  } catch {
    return {};
  }
}

function mapStage(doc: {
  $id: string;
  name?: string;
  color?: string;
  description?: string;
  order?: number;
  is_default?: boolean;
  archived?: boolean;
}): InstructorAdmissionStage {
  return {
    id: doc.$id,
    name: String(doc.name || "").trim() || "Sem nome",
    color: String(doc.color || "#64748b").trim(),
    description: String(doc.description || "").trim(),
    order: Math.round(Number(doc.order) || 0),
    isDefault: Boolean(doc.is_default),
    archived: Boolean(doc.archived),
  };
}

function mapCandidate(doc: {
  $id: string;
  user_id?: string;
  nickname?: string;
  stage_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  referral_source?: string;
  responses_json?: string;
  source?: string;
  registration_token?: string;
  form_filled_at?: string;
  status_entered_at?: string;
  $createdAt?: string;
  $updatedAt?: string;
}): InstructorAdmissionCandidate {
  const source = doc.source === "form" ? "form" : doc.source === "instructor" ? "instructor" : "manual";
  const referral = doc.referral_source ? String(doc.referral_source).trim() : "";
  return {
    id: doc.$id,
    stageId: String(doc.stage_id || "").trim(),
    userId: doc.user_id ? String(doc.user_id).trim() : undefined,
    nickname: doc.nickname ? String(doc.nickname).trim() : undefined,
    name: String(doc.name || "").trim(),
    email: String(doc.email || "").trim(),
    phone: doc.phone ? String(doc.phone).trim() : undefined,
    notes: doc.notes ? String(doc.notes).trim() : undefined,
    referralSource: referral || null,
    responses: parseResponses(doc.responses_json),
    source,
    registrationToken: doc.registration_token ? String(doc.registration_token).trim() : undefined,
    formFilledAt: doc.form_filled_at ? String(doc.form_filled_at).trim() : undefined,
    statusEnteredAt: String(doc.status_entered_at || doc.$createdAt || new Date().toISOString()),
    createdAt: String(doc.$createdAt || new Date().toISOString()),
    updatedAt: String(doc.$updatedAt || new Date().toISOString()),
  };
}

function mapForm(doc: {
  $id: string;
  title?: string;
  description?: string;
  fields_json?: string;
  published?: boolean;
  $updatedAt?: string;
}): InstructorAdmissionForm {
  const { fields, scoreRules } = parseFormDocument(doc.fields_json);
  return {
    id: doc.$id,
    title: String(doc.title || "Candidatura de Instrutor").trim(),
    description: String(doc.description || "").trim(),
    fields: ensureInstructorAdmissionLookupFields(fields),
    scoreRules,
    published: Boolean(doc.published),
    updatedAt: String(doc.$updatedAt || new Date().toISOString()),
  };
}

// ─── Stages ───────────────────────────────────────────────────────────────────

function dedupeStagesByName(stages: InstructorAdmissionStage[]): InstructorAdmissionStage[] {
  const byName = new Map<string, InstructorAdmissionStage>();
  for (const stage of stages) {
    const current = byName.get(stage.name);
    if (!current) {
      byName.set(stage.name, stage);
      continue;
    }
    const preferCurrent =
      (!current.archived && stage.archived) ||
      (current.archived === stage.archived && current.order <= stage.order);
    if (!preferCurrent) byName.set(stage.name, stage);
  }
  return [...byName.values()].sort((a, b) => a.order - b.order);
}

async function archiveDuplicateStages(): Promise<void> {
  const all = await listInstructorAdmissionStages(true);
  const groups = new Map<string, InstructorAdmissionStage[]>();
  for (const stage of all) {
    const list = groups.get(stage.name) || [];
    list.push(stage);
    groups.set(stage.name, list);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.order - b.order;
    });
    const keeper = sorted[0];
    for (const stage of sorted.slice(1)) {
      if (!stage.archived || stage.id !== keeper.id) {
        await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, stage.id, {
          archived: true,
        });
      }
    }
  }
}

export async function listInstructorAdmissionStages(
  includeArchived = false,
): Promise<InstructorAdmissionStage[]> {
  if (!configured()) return [];
  const response = await databases!.listDocuments(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, [
    Query.limit(100),
    Query.orderAsc("order"),
  ]);
  const stages = response.documents.map((doc) => mapStage(doc as Parameters<typeof mapStage>[0]));
  const active = includeArchived ? stages : stages.filter((s) => !s.archived);
  return dedupeStagesByName(active);
}

export async function ensureCanonicalInstructorAdmissionStages(): Promise<InstructorAdmissionStage[]> {
  if (!configured()) return [];

  await archiveDuplicateStages();

  const existing = await listInstructorAdmissionStages(true);
  const byName = new Map(existing.map((stage) => [stage.name, stage]));

  for (const seed of DEFAULT_STAGE_SEED) {
    const current = byName.get(seed.name);
    if (current) {
      await saveInstructorAdmissionStage({ ...seed, archived: false }, current.id);
    } else {
      await saveInstructorAdmissionStage(seed);
    }
  }

  await archiveDuplicateStages();
  return listInstructorAdmissionStages();
}

export async function shouldBootstrapInstructorAdmissionStages(): Promise<boolean> {
  if (!configured()) return false;
  const response = await databases!.listDocuments(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, [
    Query.limit(100),
  ]);
  const stages = response.documents.map((doc) => mapStage(doc as Parameters<typeof mapStage>[0]));
  const active = stages.filter((stage) => !stage.archived);
  if (active.length === 0) return true;

  const names = active.map((stage) => stage.name);
  if (new Set(names).size !== names.length) return true;

  return CANONICAL_STAGE_NAMES.some((name) => !names.includes(name));
}

/** @deprecated use ensureCanonicalInstructorAdmissionStages */
export async function ensureDefaultInstructorAdmissionStages(): Promise<InstructorAdmissionStage[]> {
  return ensureCanonicalInstructorAdmissionStages();
}

export async function saveInstructorAdmissionStage(
  input: InstructorAdmissionStageInput,
  id?: string,
): Promise<InstructorAdmissionStage> {
  if (!configured()) throw new Error("Appwrite não configurado para admissão de instrutores.");

  if (input.isDefault) {
    const all = await listInstructorAdmissionStages(true);
    for (const stage of all) {
      if (stage.isDefault && stage.id !== id) {
        await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, stage.id, {
          is_default: false,
        });
      }
    }
  }

  const data = {
    name: input.name.trim(),
    color: input.color.trim() || "#64748b",
    description: input.description.trim(),
    order: Math.round(input.order),
    is_default: input.isDefault,
    archived: input.archived,
  };

  if (id) {
    const doc = await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, id, data);
    return mapStage(doc as Parameters<typeof mapStage>[0]);
  }

  const doc = await databases!.createDocument(
    DB_ID!,
    INSTRUCTOR_ADMISSION_STAGES_COL_ID!,
    ID.unique(),
    data,
    staffDocumentPermissions(),
  );
  return mapStage(doc as Parameters<typeof mapStage>[0]);
}

export async function archiveInstructorAdmissionStage(id: string): Promise<void> {
  if (!configured()) throw new Error("Appwrite não configurado.");
  const stages = await listInstructorAdmissionStages(true);
  const target = stages.find((s) => s.id === id);
  if (!target) throw new Error("Etapa não encontrada.");
  if (target.isDefault) throw new Error("Não é possível arquivar a etapa inicial padrão.");
  await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_STAGES_COL_ID!, id, { archived: true });
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export async function getInstructorAdmissionForm(): Promise<InstructorAdmissionForm | null> {
  if (!formConfigured()) return null;
  try {
    const doc = await databases!.getDocument(DB_ID!, INSTRUCTOR_ADMISSION_FORM_COL_ID!, FORM_DOC_ID);
    return mapForm(doc as Parameters<typeof mapForm>[0]);
  } catch {
    return null;
  }
}

export async function getPublicInstructorAdmissionForm(): Promise<InstructorAdmissionForm | null> {
  const form = await getInstructorAdmissionForm();
  if (!form?.published) return null;
  return form;
}

export async function saveInstructorAdmissionForm(
  input: InstructorAdmissionFormInput,
): Promise<InstructorAdmissionForm> {
  if (!formConfigured()) throw new Error("Appwrite não configurado para formulário de admissão.");

  const data = {
    title: input.title.trim() || "Candidatura de Instrutor",
    description: input.description.trim(),
    fields_json: serializeFormDocument(input.fields, input.scoreRules || []),
    published: input.published,
  };

  const publicFormPermissions = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.read(Role.any()),
  ];

  try {
    try {
      const doc = await databases!.updateDocument(
        DB_ID!,
        INSTRUCTOR_ADMISSION_FORM_COL_ID!,
        FORM_DOC_ID,
        data,
        publicFormPermissions,
      );
      return mapForm(doc as Parameters<typeof mapForm>[0]);
    } catch {
      const doc = await databases!.updateDocument(
        DB_ID!,
        INSTRUCTOR_ADMISSION_FORM_COL_ID!,
        FORM_DOC_ID,
        data,
      );
      return mapForm(doc as Parameters<typeof mapForm>[0]);
    }
  } catch {
    const doc = await databases!.createDocument(
      DB_ID!,
      INSTRUCTOR_ADMISSION_FORM_COL_ID!,
      FORM_DOC_ID,
      data,
      publicFormPermissions,
    );
    return mapForm(doc as Parameters<typeof mapForm>[0]);
  }
}

// ─── Candidates ─────────────────────────────────────────────────────────────

export async function listInstructorAdmissionCandidates(): Promise<InstructorAdmissionCandidate[]> {
  if (!configured()) return [];
  const response = await databases!.listDocuments(DB_ID!, INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!, [
    Query.limit(500),
    Query.orderDesc("$createdAt"),
  ]);
  return response.documents.map((doc) => mapCandidate(doc as Parameters<typeof mapCandidate>[0]));
}

export async function createInstructorAdmissionCandidate(
  input: InstructorAdmissionCandidateInput,
): Promise<InstructorAdmissionCandidate> {
  if (!configured()) throw new Error("Appwrite não configurado.");

  const now = new Date().toISOString();
  const base = {
    stage_id: input.stageId,
    user_id: input.userId?.trim() || "",
    nickname: input.nickname?.trim() || "",
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || "",
    notes: input.notes?.trim() || "",
    responses_json: JSON.stringify(input.responses || {}),
    source: input.source || "manual",
    status_entered_at: now,
  };
  const withReferral = {
    ...base,
    referral_source: input.referralSource?.trim().slice(0, 255) || "",
  };

  try {
    const doc = await databases!.createDocument(
      DB_ID!,
      INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!,
      ID.unique(),
      withReferral,
      publicCandidateDocumentPermissions(),
    );
    return mapCandidate(doc as Parameters<typeof mapCandidate>[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/referral_source/i.test(message)) throw error;
    const doc = await databases!.createDocument(
      DB_ID!,
      INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!,
      ID.unique(),
      base,
      publicCandidateDocumentPermissions(),
    );
    return mapCandidate(doc as Parameters<typeof mapCandidate>[0]);
  }
}

export async function updateInstructorAdmissionCandidate(
  id: string,
  patch: Partial<InstructorAdmissionCandidateInput> & { responses?: Record<string, InstructorAdmissionFieldValue> },
): Promise<InstructorAdmissionCandidate> {
  if (!configured()) throw new Error("Appwrite não configurado.");

  const data: Record<string, unknown> = {};
  if (patch.stageId !== undefined) data.stage_id = patch.stageId;
  if (patch.userId !== undefined) data.user_id = patch.userId?.trim() || "";
  if (patch.nickname !== undefined) data.nickname = patch.nickname?.trim() || "";
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.email !== undefined) data.email = patch.email.trim().toLowerCase();
  if (patch.phone !== undefined) data.phone = patch.phone?.trim() || "";
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || "";
  if (patch.referralSource !== undefined) {
    data.referral_source = patch.referralSource?.trim().slice(0, 255) || "";
  }
  if (patch.responses !== undefined) data.responses_json = JSON.stringify(patch.responses);
  if (patch.source !== undefined) data.source = patch.source;
  if (patch.registrationToken !== undefined) data.registration_token = patch.registrationToken?.trim() || "";
  if (patch.formFilledAt !== undefined) data.form_filled_at = patch.formFilledAt || "";

  try {
    const doc = await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!, id, data);
    return mapCandidate(doc as Parameters<typeof mapCandidate>[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!data.referral_source || !/referral_source/i.test(message)) throw error;
    const { referral_source: _ignored, ...withoutReferral } = data;
    const doc = await databases!.updateDocument(
      DB_ID!,
      INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!,
      id,
      withoutReferral,
    );
    return mapCandidate(doc as Parameters<typeof mapCandidate>[0]);
  }
}

export async function moveInstructorAdmissionCandidate(
  id: string,
  stageId: string,
): Promise<InstructorAdmissionCandidate> {
  if (!configured()) throw new Error("Appwrite não configurado.");
  const now = new Date().toISOString();
  const doc = await databases!.updateDocument(DB_ID!, INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!, id, {
    stage_id: stageId,
    status_entered_at: now,
  });
  return mapCandidate(doc as Parameters<typeof mapCandidate>[0]);
}

export async function deleteInstructorAdmissionCandidate(id: string): Promise<void> {
  if (!configured()) throw new Error("Appwrite não configurado.");
  await databases!.deleteDocument(DB_ID!, INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!, id);
}

export async function getInstructorAdmissionCandidateByRegistrationToken(
  token: string,
): Promise<InstructorAdmissionCandidate | null> {
  if (!configured() || !token.trim()) return null;
  const response = await databases!.listDocuments(DB_ID!, INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID!, [
    Query.equal("registration_token", token.trim()),
    Query.limit(1),
  ]);
  const doc = response.documents[0];
  return doc ? mapCandidate(doc as Parameters<typeof mapCandidate>[0]) : null;
}

export async function generateInstructorRegistrationToken(
  candidateId: string,
): Promise<{ token: string | null; error: Error | null }> {
  try {
    const token = crypto.randomUUID();
    await updateInstructorAdmissionCandidate(candidateId, { registrationToken: token });
    return { token, error: null };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error : new Error("Falha ao gerar link de registro."),
    };
  }
}

async function syncCandidateProfileFromResponses(
  userId: string,
  form: InstructorAdmissionForm,
  responses: Record<string, InstructorAdmissionFieldValue>,
): Promise<void> {
  const { profilePatch } = extractAdmissionFieldsFromResponses(form, responses);
  if (Object.keys(profilePatch).length === 0) return;
  await updateAdminUserProfile(userId, profilePatch);
}

export async function submitInstructorAdmissionForm(
  responses: Record<string, InstructorAdmissionFieldValue>,
  options?: {
    token?: string;
    stages?: InstructorAdmissionStage[];
    referralSource?: string | null;
  },
): Promise<InstructorAdmissionCandidate> {
  const form = await getPublicInstructorAdmissionForm();
  if (!form) throw new Error("Formulário não disponível no momento.");

  let activeStages = options?.stages;
  if (!activeStages?.length) {
    activeStages = await listInstructorAdmissionStages();
  }
  const defaultStage =
    activeStages.find((s) => s.isDefault) || activeStages.sort((a, b) => a.order - b.order)[0];
  if (!defaultStage) {
    throw new Error(
      "Nenhuma etapa configurada ou sem permissão para listar etapas. Peça ao admin para publicar o processo seletivo.",
    );
  }

  for (const field of form.fields) {
    if (field.type === "hidden") continue;
    if (!field.required) continue;
    const value = responses[field.id];
    if (field.type === "checkbox") {
      if (typeof value !== "boolean") throw new Error(`O campo "${field.label}" é obrigatório.`);
      continue;
    }
    if (field.type === "attachment") {
      const file = value as InstructorAdmissionFileValue | undefined;
      if (!file?.fileId) throw new Error(`O anexo "${field.label}" é obrigatório.`);
      continue;
    }
    if (field.type === "multiselect") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`O campo "${field.label}" é obrigatório.`);
      }
      continue;
    }
    if (field.type === "availability") {
      if (!isAvailabilityComplete(normalizeAvailabilityValue(value))) {
        throw new Error(`O campo "${field.label}" é obrigatório.`);
      }
      continue;
    }
    if (!value || (typeof value === "string" && !value.trim())) {
      throw new Error(`O campo "${field.label}" é obrigatório.`);
    }
  }

  const extracted = extractAdmissionFieldsFromResponses(form, responses);
  const name = extracted.name?.trim() || "";
  const email = extracted.email?.trim().toLowerCase() || "";
  const phone = extracted.phone?.trim();
  const nickname = extracted.nickname?.trim();
  const referralSource = options?.referralSource?.trim().slice(0, 255) || null;

  if (!name) throw new Error("Informe seu nome completo.");
  if (!email) throw new Error("Informe seu e-mail.");

  const now = new Date().toISOString();
  const token = options?.token?.trim();
  const existing = token ? await getInstructorAdmissionCandidateByRegistrationToken(token) : null;

  if (existing) {
    const updated = await updateInstructorAdmissionCandidate(existing.id, {
      name,
      email,
      phone: phone || undefined,
      nickname: nickname || undefined,
      responses,
      source: "form",
      formFilledAt: now,
      referralSource: existing.referralSource || referralSource,
    });
    if (updated.userId) {
      await syncCandidateProfileFromResponses(updated.userId, form, responses);
    }
    return updated;
  }

  const created = await createInstructorAdmissionCandidate({
    stageId: defaultStage.id,
    name,
    email,
    phone: phone || undefined,
    nickname: nickname || undefined,
    responses,
    source: "form",
    formFilledAt: now,
    referralSource,
  });
  if (created.userId) {
    await syncCandidateProfileFromResponses(created.userId, form, responses);
  }
  return created;
}

export async function syncActiveInstructorsToAdmission(
  stages: InstructorAdmissionStage[],
  hoursMap: InstructorHoursMap,
): Promise<{ created: number; linked: number }> {
  if (!configured()) return { created: 0, linked: 0 };

  const instructors = await listAllInstructorUsers();
  const candidates = await listInstructorAdmissionCandidates();
  const byUserId = new Map(
    candidates.filter((candidate) => candidate.userId).map((candidate) => [candidate.userId!, candidate]),
  );
  const byEmail = new Map(candidates.map((candidate) => [candidate.email.toLowerCase(), candidate]));

  let created = 0;
  let linked = 0;

  for (const instructor of instructors) {
    const metrics = hoursMap[instructor.userId] || { totalHours: 0, monthHours: 0 };
    const suggestedStageName = suggestStageNameForInstructionHours(metrics.totalHours);
    const suggestedStage = stages.find((stage) => stage.name === suggestedStageName);
    if (!suggestedStage) continue;

    const name = instructor.profile.fullName?.trim() || instructor.email;
    const nickname = instructor.profile.nickname?.trim() || "";
    const email = instructor.email.trim().toLowerCase();
    const phone = instructor.profile.phone?.trim() || "";
    const anacNote = instructor.profile.anacCode?.trim()
      ? `Código ANAC: ${instructor.profile.anacCode.trim()}`
      : "";

    const existing =
      byUserId.get(instructor.userId) || byEmail.get(email);

    if (existing) {
      const patch: Partial<InstructorAdmissionCandidateInput> = {
        name,
        nickname: nickname || undefined,
        email,
        phone: phone || undefined,
        userId: instructor.userId,
        source: existing.source === "form" ? "form" : "instructor",
      };
      if (anacNote && !(existing.notes || "").includes(anacNote)) {
        patch.notes = [existing.notes, anacNote].filter(Boolean).join("\n");
      }
      await updateInstructorAdmissionCandidate(existing.id, patch);
      if (!existing.userId) linked += 1;
      continue;
    }

    await createInstructorAdmissionCandidate({
      stageId: suggestedStage.id,
      userId: instructor.userId,
      nickname: nickname || undefined,
      name,
      email,
      phone: phone || undefined,
      notes: anacNote || undefined,
      source: "instructor",
    });
    created += 1;
  }

  return { created, linked };
}

export async function linkCandidateToInstructorUser(
  candidateId: string,
  instructorUserId: string,
): Promise<InstructorAdmissionCandidate> {
  const instructor = await getAdminUserDetail(instructorUserId);
  if (!userHasInstructorPortal(instructor)) {
    throw new Error("Usuário instrutor não encontrado.");
  }

  return updateInstructorAdmissionCandidate(candidateId, {
    userId: instructor.userId,
    name: instructor.profile.fullName?.trim() || instructor.email,
    nickname: instructor.profile.nickname?.trim() || undefined,
    email: instructor.email.trim().toLowerCase(),
    phone: instructor.profile.phone?.trim() || undefined,
    source: "instructor",
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function listInstructorAdmissionComments(
  candidateId: string,
): Promise<InstructorAdmissionComment[]> {
  if (!commentsConfigured()) return [];
  const response = await databases!.listDocuments(DB_ID!, INSTRUCTOR_ADMISSION_COMMENTS_COL_ID!, [
    Query.equal("candidate_id", candidateId),
    Query.orderAsc("$createdAt"),
    Query.limit(200),
  ]);
  return response.documents.map((doc) => ({
    id: doc.$id,
    candidateId: String((doc as { candidate_id?: string }).candidate_id || ""),
    authorName: String((doc as { author_name?: string }).author_name || "Admin"),
    text: String((doc as { text?: string }).text || ""),
    createdAt: String(doc.$createdAt || new Date().toISOString()),
  }));
}

export async function createInstructorAdmissionComment(
  candidateId: string,
  authorName: string,
  text: string,
): Promise<InstructorAdmissionComment> {
  if (!commentsConfigured()) throw new Error("Comentários não configurados.");
  const doc = await databases!.createDocument(
    DB_ID!,
    INSTRUCTOR_ADMISSION_COMMENTS_COL_ID!,
    ID.unique(),
    {
      candidate_id: candidateId,
      author_name: authorName.trim() || "Admin",
      text: text.trim(),
    },
    commentDocumentPermissions(),
  );
  return {
    id: doc.$id,
    candidateId,
    authorName: authorName.trim() || "Admin",
    text: text.trim(),
    createdAt: String(doc.$createdAt || new Date().toISOString()),
  };
}

export async function deleteInstructorAdmissionComment(id: string): Promise<void> {
  if (!commentsConfigured()) throw new Error("Comentários não configurados.");
  await databases!.deleteDocument(DB_ID!, INSTRUCTOR_ADMISSION_COMMENTS_COL_ID!, id);
}

// ─── File uploads ─────────────────────────────────────────────────────────────

export async function uploadInstructorAdmissionFile(file: File): Promise<InstructorAdmissionFileValue> {
  if (!storage || !BUCKET_ID) throw new Error("Storage não configurado.");
  const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, [
    Permission.read(Role.label("admin")),
    Permission.read(Role.any()),
  ]);
  return {
    fileId: uploaded.$id,
    fileName: file.name,
    bucketId: BUCKET_ID,
  };
}

export function instructorAdmissionFileUrl(file: InstructorAdmissionFileValue): string {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string;
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string;
  return `${endpoint}/storage/buckets/${file.bucketId}/files/${file.fileId}/view?project=${projectId}`;
}
