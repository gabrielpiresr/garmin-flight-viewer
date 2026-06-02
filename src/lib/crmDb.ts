import { Query } from "appwrite";
import { CRM_LEADS_COL_ID, databases, ID, isAppwriteConfigured, Permission, Role } from "./appwrite";
import type { CrmLead, CrmLeadInput, CrmLeadQualInput, CrmStatus, AvailableDay, AvailablePeriod } from "../types/crm";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_LEADS_COL_ID);
}

type CrmLeadDoc = {
  $id: string;
  user_id?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  crm_status?: string;
  desired_course?: string | null;
  desired_hours?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  available_days_json?: string | null;
  available_period?: string | null;
  start_date?: string | null;
  weekly_hours?: number | null;
  notes?: string | null;
  anac_code?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  saga_anac_json?: string | null;
  theoretical_exam_done?: boolean | null;
  qual_token?: string | null;
  qual_filled_at?: string | null;
  referrer_user_id?: string | null;
  $createdAt?: string;
  $updatedAt?: string;
};

function normalizeCrmStatus(value: string | undefined | null): CrmStatus {
  const valid: CrmStatus[] = [
    "novo_lead",
    "aguardando_qualificacao",
    "aguardando_proposta",
    "proposta_enviada",
    "registro_enviado",
    "registro_preenchido",
    "matricula_enviada",
    "aguardando_assinatura_pagamento",
    "aluno_pronto",
    "lead_perdido",
  ];
  // Migrar status antigos
  const migrations: Record<string, CrmStatus> = {
    qualificacao:          "aguardando_qualificacao",
    orcamento_enviado:     "proposta_enviada",
    matricula:             "registro_enviado",
    proposta_aceita:       "registro_enviado",
    aguardando_assinatura: "aguardando_assinatura_pagamento",
    aguardando_pagamento:  "aguardando_assinatura_pagamento",
  };
  if (value && migrations[value]) return migrations[value];
  return (valid.includes(value as CrmStatus) ? value : "novo_lead") as CrmStatus;
}

function parseAvailableDays(value: string | null | undefined): AvailableDay[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const valid: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
    return parsed.filter((d): d is AvailableDay => valid.includes(d as AvailableDay));
  } catch {
    return [];
  }
}

function normalizeAvailablePeriod(value: string | null | undefined): AvailablePeriod | null {
  if (value === "manha" || value === "tarde" || value === "ambos") return value;
  return null;
}

function toLeadFromDoc(doc: CrmLeadDoc): CrmLead {
  return {
    id: doc.$id,
    userId: doc.user_id ?? null,
    referrerUserId: doc.referrer_user_id ?? null,
    name: doc.name ?? "",
    email: doc.email ?? "",
    phone: doc.phone ?? "",
    crmStatus: normalizeCrmStatus(doc.crm_status),
    desiredCourse: doc.desired_course ?? null,
    desiredHours: typeof doc.desired_hours === "number" ? doc.desired_hours : null,
    weightKg: typeof doc.weight_kg === "number" ? doc.weight_kg : null,
    heightCm: typeof doc.height_cm === "number" ? doc.height_cm : null,
    availableDays: parseAvailableDays(doc.available_days_json),
    availablePeriod: normalizeAvailablePeriod(doc.available_period),
    startDate: doc.start_date ?? null,
    weeklyHours: typeof doc.weekly_hours === "number" ? doc.weekly_hours : null,
    notes: doc.notes ?? null,
    anacCode: doc.anac_code ?? null,
    birthDate: doc.birth_date ?? null,
    cpf: doc.cpf ?? null,
    sagaAnacJson: doc.saga_anac_json ?? null,
    theoreticalExamDone: typeof doc.theoretical_exam_done === "boolean" ? doc.theoretical_exam_done : null,
    qualToken: doc.qual_token ?? null,
    qualFilledAt: doc.qual_filled_at ?? null,
    createdAt: doc.$createdAt ?? "",
    updatedAt: doc.$updatedAt ?? "",
  };
}

/** Permissões de documento que visitantes e alunos podem atribuir ao criar lead (form público). */
function publicLeadDocumentPermissions(): string[] {
  return [Permission.read(Role.any()), Permission.update(Role.any())];
}

export async function listLeads(): Promise<{ data: CrmLead[] | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    const res = await databases!.listDocuments(DB_ID!, CRM_LEADS_COL_ID!, [
      Query.orderDesc("$createdAt"),
      Query.limit(250),
    ]);
    return { data: (res.documents as unknown as CrmLeadDoc[]).map(toLeadFromDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getLead(id: string): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    const doc = await databases!.getDocument(DB_ID!, CRM_LEADS_COL_ID!, id);
    return { data: toLeadFromDoc(doc as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getLeadByEmail(email: string): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: null };
  try {
    const res = await databases!.listDocuments(DB_ID!, CRM_LEADS_COL_ID!, [
      Query.equal("email", [email]),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);
    if (res.total === 0) return { data: null, error: null };
    return { data: toLeadFromDoc(res.documents[0] as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getLeadByToken(token: string): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    const res = await databases!.listDocuments(DB_ID!, CRM_LEADS_COL_ID!, [
      Query.equal("qual_token", [token]),
      Query.limit(1),
    ]);
    if (res.total === 0) return { data: null, error: null };
    return { data: toLeadFromDoc(res.documents[0] as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function createLead(input: CrmLeadInput): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    const doc = await databases!.createDocument(
      DB_ID!,
      CRM_LEADS_COL_ID!,
      ID.unique(),
      {
        user_id: input.userId ?? null,
        name: input.name,
        email: input.email,
        phone: input.phone,
        crm_status: input.crmStatus ?? "qualificacao",
      },
      publicLeadDocumentPermissions(),
    );
    return { data: toLeadFromDoc(doc as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function updateLead(
  id: string,
  updates: Partial<{
    name: string;
    email: string;
    phone: string;
    crmStatus: CrmStatus;
    userId: string | null;
    qualToken: string | null;
    qualFilledAt: string | null;
    referrerUserId: string | null;
  }> & CrmLeadQualInput,
): Promise<{ error: Error | null }> {
  if (!configured()) return { error: new Error("CRM não configurado.") };
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.cpf !== undefined) payload.cpf = updates.cpf;
    if (updates.crmStatus !== undefined) payload.crm_status = updates.crmStatus;
    if (updates.userId !== undefined) payload.user_id = updates.userId;
    if (updates.qualToken !== undefined) payload.qual_token = updates.qualToken;
    if (updates.qualFilledAt !== undefined) payload.qual_filled_at = updates.qualFilledAt;
    if (updates.referrerUserId !== undefined) payload.referrer_user_id = updates.referrerUserId;
    if (updates.desiredCourse !== undefined) payload.desired_course = updates.desiredCourse;
    if (updates.desiredHours !== undefined) payload.desired_hours = updates.desiredHours;
    if (updates.weightKg !== undefined) payload.weight_kg = updates.weightKg;
    if (updates.heightCm !== undefined) payload.height_cm = updates.heightCm;
    if (updates.availableDays !== undefined) payload.available_days_json = JSON.stringify(updates.availableDays);
    if (updates.availablePeriod !== undefined) payload.available_period = updates.availablePeriod;
    if (updates.startDate !== undefined) payload.start_date = updates.startDate;
    if (updates.weeklyHours !== undefined) payload.weekly_hours = updates.weeklyHours;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.anacCode !== undefined) payload.anac_code = updates.anacCode;
    if (updates.birthDate !== undefined) payload.birth_date = updates.birthDate;
    if (updates.theoreticalExamDone !== undefined) payload.theoretical_exam_done = updates.theoreticalExamDone;

    await databases!.updateDocument(DB_ID!, CRM_LEADS_COL_ID!, id, payload);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/** Cria ou atualiza lead pelo e-mail. Usado pelo form de qualificação genérico. */
export async function upsertLeadByEmail(
  input: { name: string; email: string; phone: string } & CrmLeadQualInput,
): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    // Buscar lead existente pelo email
    const res = await databases!.listDocuments(DB_ID!, CRM_LEADS_COL_ID!, [
      Query.equal("email", [input.email]),
      Query.limit(1),
    ]);

    const qualPayload: Record<string, unknown> = {};
    if (input.name) qualPayload.name = input.name;
    if (input.phone) qualPayload.phone = input.phone;
    if (input.desiredCourse !== undefined) qualPayload.desired_course = input.desiredCourse;
    if (input.desiredHours !== undefined) qualPayload.desired_hours = input.desiredHours;
    if (input.weightKg !== undefined) qualPayload.weight_kg = input.weightKg;
    if (input.heightCm !== undefined) qualPayload.height_cm = input.heightCm;
    if (input.availableDays !== undefined) qualPayload.available_days_json = JSON.stringify(input.availableDays);
    if (input.availablePeriod !== undefined) qualPayload.available_period = input.availablePeriod;
    if (input.startDate !== undefined) qualPayload.start_date = input.startDate;
    if (input.weeklyHours !== undefined) qualPayload.weekly_hours = input.weeklyHours;
    if (input.anacCode !== undefined) qualPayload.anac_code = input.anacCode;
    if (input.birthDate !== undefined) qualPayload.birth_date = input.birthDate;
    if (input.cpf !== undefined) qualPayload.cpf = input.cpf;
    if (input.theoreticalExamDone !== undefined) qualPayload.theoretical_exam_done = input.theoreticalExamDone;
    qualPayload.qual_filled_at = new Date().toISOString();
    const safeReferrer = input.referrerUserId?.trim() || null;
    if (safeReferrer) qualPayload.referrer_user_id = safeReferrer;

    let doc;
    if (res.total > 0 && res.documents[0]) {
      const existingDoc = res.documents[0] as unknown as CrmLeadDoc;
      const currentStatus = normalizeCrmStatus(existingDoc.crm_status);
      if (currentStatus === "novo_lead" || currentStatus === "aguardando_qualificacao") {
        qualPayload.crm_status = "aguardando_proposta";
      }
      if (!existingDoc.referrer_user_id && safeReferrer) {
        qualPayload.referrer_user_id = safeReferrer;
      }
      doc = await databases!.updateDocument(DB_ID!, CRM_LEADS_COL_ID!, res.documents[0].$id, qualPayload);
    } else {
      doc = await databases!.createDocument(
        DB_ID!,
        CRM_LEADS_COL_ID!,
        ID.unique(),
        {
          name: input.name,
          email: input.email,
          phone: input.phone ?? "",
          crm_status: "aguardando_proposta",
          referrer_user_id: safeReferrer,
          ...qualPayload,
        },
        publicLeadDocumentPermissions(),
      );
    }
    return { data: toLeadFromDoc(doc as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function deleteLead(id: string): Promise<{ error: Error | null }> {
  if (!configured()) return { error: new Error("CRM não configurado.") };
  try {
    await databases!.deleteDocument(DB_ID!, CRM_LEADS_COL_ID!, id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

/** Gera token único para o link de cadastro e persiste no lead. */
export async function generateCadastroToken(id: string): Promise<{ token: string | null; error: Error | null }> {
  const token = crypto.randomUUID();
  const { error } = await updateLead(id, { qualToken: token });
  if (error) return { token: null, error };
  return { token, error: null };
}

/** @deprecated use generateCadastroToken */
export const generateQualToken = generateCadastroToken;
