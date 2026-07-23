import { Query } from "appwrite";
import { CRM_LEADS_COL_ID, CRM_STATUS_SETTINGS_COL_ID, databases, ID, isAppwriteConfigured, Permission, Role } from "./appwrite";
import { getCrmAutomationSettings } from "./crmAutomationDb";
import { applyQualFollowupRules } from "./crmQualFollowups";
import { buildFollowupsForStatus, buildLeadStatusMove, getStatusSetting } from "./crmStatusMove";
import type {
  CrmLead,
  CrmLeadFollowup,
  CrmLeadInput,
  CrmLeadQualInput,
  CrmStatus,
  CrmStatusFollowupTemplate,
  CrmStatusSetting,
  AvailableDay,
  AvailablePeriod,
} from "../types/crm";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_LEADS_COL_ID);
}

function settingsConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_STATUS_SETTINGS_COL_ID);
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
  motivo_perda?: string | null;
  motivo_perda_notas?: string | null;
  /** @deprecated atributos travados no Appwrite; mantido só para leitura legada */
  loss_reason?: string | null;
  loss_reason_notes?: string | null;
  anac_code?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  saga_anac_json?: string | null;
  theoretical_exam_done?: boolean | null;
  theoretical_study_status?: string | null;
  transfer_school?: string | null;
  qual_token?: string | null;
  qual_filled_at?: string | null;
  referrer_user_id?: string | null;
  referral_source?: string | null;
  accepted_proposal_id?: string | null;
  status_entered_at?: string | null;
  funnel_entered_at?: string | null;
  followups_json?: string | null;
  pay_in_person?: boolean | null;
  $createdAt?: string;
  $updatedAt?: string;
};

type CrmStatusSettingDoc = {
  $id: string;
  status?: string | null;
  followups_json?: string | null;
  expiration_days?: number | null;
};

function normalizeCrmStatus(value: string | undefined | null): CrmStatus {
  const valid: CrmStatus[] = [
    "novo_lead",
    "aguardando_qualificacao",
    "aguardando_proposta",
    "proposta_enviada",
    "registro_enviado",
    "registro_preenchido",
    "aguardando_transferencia",
    "matricula_enviada",
    "aguardando_assinatura_pagamento",
    "ground_agendado",
    "cadastro_anac",
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

function parseLeadFollowups(value: string | null | undefined): CrmLeadFollowup[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): CrmLeadFollowup | null => {
        const id = String(item?.id || "").trim();
        const status = normalizeCrmStatus(item?.status);
        const title = String(item?.title || "").trim();
        const triggeredAt = String(item?.triggeredAt || "").trim();
        const completedAt = item?.completedAt ? String(item.completedAt) : null;
        const manual = Boolean(item?.manual);
        const qualAuto = Boolean(item?.qualAuto);
        if (!id || !title || !triggeredAt) return null;
        return { id, status, title, triggeredAt, completedAt, manual: manual || undefined, qualAuto: qualAuto || undefined };
      })
      .filter((item): item is CrmLeadFollowup => Boolean(item));
  } catch {
    return [];
  }
}

function parseStatusFollowups(value: string | null | undefined): CrmStatusFollowupTemplate[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): CrmStatusFollowupTemplate | null => {
        const id = String(item?.id || "").trim() || crypto.randomUUID();
        const title = String(item?.title || "").trim();
        const days = Math.max(0, Math.round(Number(item?.days) || 0));
        if (!title) return null;
        return { id, title, days };
      })
      .filter((item): item is CrmStatusFollowupTemplate => Boolean(item));
  } catch {
    return [];
  }
}

function toStatusSettingFromDoc(doc: CrmStatusSettingDoc): CrmStatusSetting {
  return {
    id: doc.$id,
    status: normalizeCrmStatus(doc.status),
    followups: parseStatusFollowups(doc.followups_json),
    expirationDays:
      typeof doc.expiration_days === "number" && doc.expiration_days >= 0
        ? Math.round(doc.expiration_days)
        : null,
  };
}

const LOSS_BLOCK_RE = /(?:^|\r?\n\r?\n)---CRM_LOSS---\r?\n([\s\S]*?)\r?\n---END_CRM_LOSS---\s*$/;

/** Motivo de perda fica em campos separados na UI; no Appwrite vai embutido em `notes`
 * enquanto atributos dedicados estão indisponíveis (fila de attrs travada). */
function splitStoredNotes(raw: string | null | undefined): {
  notes: string | null;
  lossReason: string | null;
  lossReasonNotes: string | null;
} {
  if (!raw) return { notes: null, lossReason: null, lossReasonNotes: null };
  const text = raw.replace(/^\uFEFF/, "");
  const blockMatch = text.match(LOSS_BLOCK_RE);
  if (blockMatch && blockMatch.index != null) {
    const notes = text.slice(0, blockMatch.index).trim() || null;
    const payload = blockMatch[1].trim();
    try {
      const parsed = JSON.parse(payload) as { reason?: unknown; notes?: unknown };
      return {
        notes,
        lossReason: String(parsed.reason ?? "").trim() || null,
        lossReasonNotes: String(parsed.notes ?? "").trim() || null,
      };
    } catch {
      // fallback linha a linha: reason=... / notes=...
      const lines = payload.split(/\r?\n/);
      let reason = "";
      let detail = "";
      for (const line of lines) {
        if (line.startsWith("reason=")) reason = line.slice("reason=".length);
        else if (line.startsWith("notes=")) detail = line.slice("notes=".length);
        else if (!reason) reason = line;
        else detail = detail ? `${detail}\n${line}` : line;
      }
      return {
        notes,
        lossReason: reason.trim() || null,
        lossReasonNotes: detail.trim() || null,
      };
    }
  }

  // Formato antigo: "Motivo de perda: ..." prepended into notes
  const legacy = text.match(/^Motivo de perda:\s*([\s\S]+?)(?:\n\n---\n([\s\S]*))?$/);
  if (legacy) {
    return {
      notes: legacy[2]?.trim() || null,
      lossReason: "Outro",
      lossReasonNotes: legacy[1].trim() || null,
    };
  }

  return { notes: text, lossReason: null, lossReasonNotes: null };
}

function joinStoredNotes(
  notes: string | null | undefined,
  lossReason: string | null | undefined,
  lossReasonNotes: string | null | undefined,
): string | null {
  const base = (notes ?? "").trim();
  const reason = (lossReason ?? "").trim();
  const detail = (lossReasonNotes ?? "").trim();
  if (!reason && !detail) return base || null;
  const block = `---CRM_LOSS---\n${JSON.stringify({ reason, notes: detail })}\n---END_CRM_LOSS---`;
  return base ? `${base}\n\n${block}` : block;
}

function toLeadFromDoc(doc: CrmLeadDoc): CrmLead {
  const fromNotes = splitStoredNotes(doc.notes);
  return {
    id: doc.$id,
    userId: doc.user_id ?? null,
    referrerUserId: doc.referrer_user_id ?? null,
    referralSource: doc.referral_source ?? null,
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
    notes: fromNotes.notes,
    lossReason: doc.motivo_perda ?? doc.loss_reason ?? fromNotes.lossReason,
    lossReasonNotes: doc.motivo_perda_notas ?? doc.loss_reason_notes ?? fromNotes.lossReasonNotes,
    anacCode: doc.anac_code ?? null,
    birthDate: doc.birth_date ?? null,
    cpf: doc.cpf ?? null,
    sagaAnacJson: doc.saga_anac_json ?? null,
    theoreticalExamDone: typeof doc.theoretical_exam_done === "boolean" ? doc.theoretical_exam_done : null,
    theoreticalStudyStatus: doc.theoretical_study_status ?? null,
    transferSchool: doc.transfer_school ?? null,
    acceptedProposalId: doc.accepted_proposal_id ?? null,
    qualToken: doc.qual_token ?? null,
    qualFilledAt: doc.qual_filled_at ?? null,
    statusEnteredAt: doc.status_entered_at ?? null,
    funnelEnteredAt: doc.funnel_entered_at ?? null,
    followups: parseLeadFollowups(doc.followups_json),
    payInPerson: Boolean(doc.pay_in_person),
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

async function resolveFollowupsForNewLead(
  status: CrmStatus,
  enteredAt: string,
  provided?: CrmLeadFollowup[],
): Promise<CrmLeadFollowup[]> {
  if (provided && provided.length > 0) return provided;
  const { data: settings } = await listCrmStatusSettings();
  const setting = getStatusSetting(settings, status);
  return buildFollowupsForStatus(status, enteredAt, setting.followups);
}

export async function createLead(input: CrmLeadInput): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };
  try {
    const now = new Date().toISOString();
    const crmStatus = normalizeCrmStatus(input.crmStatus ?? "novo_lead");
    const statusEnteredAt = input.statusEnteredAt ?? now;
    const followups = await resolveFollowupsForNewLead(crmStatus, statusEnteredAt, input.followups);
    const doc = await databases!.createDocument(
      DB_ID!,
      CRM_LEADS_COL_ID!,
      ID.unique(),
      {
        user_id: input.userId ?? null,
        name: input.name,
        email: input.email,
        phone: input.phone,
        anac_code: input.anacCode ?? null,
        crm_status: crmStatus,
        status_entered_at: statusEnteredAt,
        funnel_entered_at: input.funnelEnteredAt ?? statusEnteredAt,
        followups_json: JSON.stringify(followups),
        pay_in_person: input.payInPerson ?? false,
      },
      publicLeadDocumentPermissions(),
    );
    return { data: toLeadFromDoc(doc as unknown as CrmLeadDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

type CrmLeadStatusExtraUpdates = Partial<{
  name: string;
  email: string;
  phone: string;
  userId: string | null;
  qualToken: string | null;
  qualFilledAt: string | null;
  referrerUserId: string | null;
  referralSource: string | null;
  acceptedProposalId: string | null;
  payInPerson: boolean;
  notes: string | null;
  weightKg: number | null;
  heightCm: number | null;
}> & CrmLeadQualInput;

export async function moveLeadToCrmStatus(
  id: string,
  targetStatus: CrmStatus,
  options?: {
    currentLead?: CrmLead;
    settings?: CrmStatusSetting[];
    enteredAt?: string;
    extraUpdates?: CrmLeadStatusExtraUpdates;
  },
): Promise<{ data: CrmLead | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("CRM não configurado.") };

  try {
    let currentLead = options?.currentLead ?? null;
    if (!currentLead) {
      const { data, error } = await getLead(id);
      if (error || !data) return { data: null, error: error ?? new Error("Lead não encontrado.") };
      currentLead = data;
    }

    const normalizedTarget = normalizeCrmStatus(targetStatus);
    const settings = options?.settings ?? (await listCrmStatusSettings()).data;
    const extraUpdates = options?.extraUpdates ?? {};

    const payload: Record<string, unknown> = {};
    if (extraUpdates.name !== undefined) payload.name = extraUpdates.name;
    if (extraUpdates.email !== undefined) payload.email = extraUpdates.email;
    if (extraUpdates.phone !== undefined) payload.phone = extraUpdates.phone;
    if (extraUpdates.notes !== undefined) {
      // currentLead já vem com notes/loss separados; reembute o bloco ao gravar
      payload.notes = joinStoredNotes(extraUpdates.notes, currentLead.lossReason, currentLead.lossReasonNotes);
    }
    if (extraUpdates.userId !== undefined) payload.user_id = extraUpdates.userId;
    if (extraUpdates.qualToken !== undefined) payload.qual_token = extraUpdates.qualToken;
    if (extraUpdates.qualFilledAt !== undefined) payload.qual_filled_at = extraUpdates.qualFilledAt;
    if (extraUpdates.referrerUserId !== undefined) payload.referrer_user_id = extraUpdates.referrerUserId;
    if (extraUpdates.referralSource !== undefined) payload.referral_source = extraUpdates.referralSource;
    if (extraUpdates.acceptedProposalId !== undefined) payload.accepted_proposal_id = extraUpdates.acceptedProposalId;
    if (extraUpdates.payInPerson !== undefined) payload.pay_in_person = extraUpdates.payInPerson;
    if (extraUpdates.desiredCourse !== undefined) payload.desired_course = extraUpdates.desiredCourse;
    if (extraUpdates.desiredHours !== undefined) payload.desired_hours = extraUpdates.desiredHours;
    if (extraUpdates.weightKg !== undefined) payload.weight_kg = extraUpdates.weightKg;
    if (extraUpdates.heightCm !== undefined) payload.height_cm = extraUpdates.heightCm;
    if (extraUpdates.availableDays !== undefined) payload.available_days_json = JSON.stringify(extraUpdates.availableDays);
    if (extraUpdates.availablePeriod !== undefined) payload.available_period = extraUpdates.availablePeriod;
    if (extraUpdates.startDate !== undefined) payload.start_date = extraUpdates.startDate;
    if (extraUpdates.weeklyHours !== undefined) payload.weekly_hours = extraUpdates.weeklyHours;
    if (extraUpdates.anacCode !== undefined) payload.anac_code = extraUpdates.anacCode;
    if (extraUpdates.birthDate !== undefined) payload.birth_date = extraUpdates.birthDate;
    if (extraUpdates.cpf !== undefined) payload.cpf = extraUpdates.cpf;
    if (extraUpdates.theoreticalExamDone !== undefined) payload.theoretical_exam_done = extraUpdates.theoreticalExamDone;
    if (extraUpdates.theoreticalStudyStatus !== undefined) payload.theoretical_study_status = extraUpdates.theoreticalStudyStatus;
    if (extraUpdates.transferSchool !== undefined) payload.transfer_school = extraUpdates.transferSchool;

    if (currentLead.crmStatus !== normalizedTarget) {
      const move = buildLeadStatusMove(currentLead, normalizedTarget, settings, { enteredAt: options?.enteredAt });
      payload.crm_status = move.crmStatus;
      payload.status_entered_at = move.statusEnteredAt;
      payload.funnel_entered_at = move.funnelEnteredAt;
      payload.followups_json = JSON.stringify(move.followups);
    } else if (normalizedTarget !== targetStatus) {
      payload.crm_status = normalizedTarget;
    }

    await databases!.updateDocument(DB_ID!, CRM_LEADS_COL_ID!, id, payload);
    const { data, error } = await getLead(id);
    return { data, error };
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
    referralSource: string | null;
    acceptedProposalId: string | null;
    statusEnteredAt: string | null;
    funnelEnteredAt: string | null;
    followups: CrmLeadFollowup[];
    payInPerson: boolean;
    lossReason: string | null;
    lossReasonNotes: string | null;
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
    if (updates.referralSource !== undefined) payload.referral_source = updates.referralSource;
    if (updates.desiredCourse !== undefined) payload.desired_course = updates.desiredCourse;
    if (updates.desiredHours !== undefined) payload.desired_hours = updates.desiredHours;
    if (updates.weightKg !== undefined) payload.weight_kg = updates.weightKg;
    if (updates.heightCm !== undefined) payload.height_cm = updates.heightCm;
    if (updates.availableDays !== undefined) payload.available_days_json = JSON.stringify(updates.availableDays);
    if (updates.availablePeriod !== undefined) payload.available_period = updates.availablePeriod;
    if (updates.startDate !== undefined) payload.start_date = updates.startDate;
    if (updates.weeklyHours !== undefined) payload.weekly_hours = updates.weeklyHours;
    if (
      updates.notes !== undefined
      || updates.lossReason !== undefined
      || updates.lossReasonNotes !== undefined
    ) {
      let notes = updates.notes;
      let lossReason = updates.lossReason;
      let lossReasonNotes = updates.lossReasonNotes;
      if (notes === undefined || lossReason === undefined || lossReasonNotes === undefined) {
        const current = await databases!.getDocument(DB_ID!, CRM_LEADS_COL_ID!, id);
        const parsed = splitStoredNotes((current as { notes?: string | null }).notes);
        if (notes === undefined) notes = parsed.notes;
        if (lossReason === undefined) {
          lossReason =
            (current as { motivo_perda?: string | null; loss_reason?: string | null }).motivo_perda
            ?? (current as { loss_reason?: string | null }).loss_reason
            ?? parsed.lossReason;
        }
        if (lossReasonNotes === undefined) {
          lossReasonNotes =
            (current as { motivo_perda_notas?: string | null; loss_reason_notes?: string | null }).motivo_perda_notas
            ?? (current as { loss_reason_notes?: string | null }).loss_reason_notes
            ?? parsed.lossReasonNotes;
        }
      }
      payload.notes = joinStoredNotes(notes ?? null, lossReason ?? null, lossReasonNotes ?? null);
    }
    if (updates.anacCode !== undefined) payload.anac_code = updates.anacCode;
    if (updates.birthDate !== undefined) payload.birth_date = updates.birthDate;
    if (updates.theoreticalExamDone !== undefined) payload.theoretical_exam_done = updates.theoreticalExamDone;
    if (updates.theoreticalStudyStatus !== undefined) payload.theoretical_study_status = updates.theoreticalStudyStatus;
    if (updates.transferSchool !== undefined) payload.transfer_school = updates.transferSchool;
    if (updates.acceptedProposalId !== undefined) payload.accepted_proposal_id = updates.acceptedProposalId;
    if (updates.statusEnteredAt !== undefined) payload.status_entered_at = updates.statusEnteredAt;
    if (updates.funnelEnteredAt !== undefined) payload.funnel_entered_at = updates.funnelEnteredAt;
    if (updates.followups !== undefined) payload.followups_json = JSON.stringify(updates.followups);
    if (updates.payInPerson !== undefined) payload.pay_in_person = updates.payInPerson;

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
    if (input.theoreticalStudyStatus !== undefined) qualPayload.theoretical_study_status = input.theoreticalStudyStatus;
    if (input.transferSchool !== undefined) qualPayload.transfer_school = input.transferSchool;
    if (input.notes !== undefined) {
      // Preserva bloco de motivo de perda embutido, se existir.
      if (res.total > 0 && res.documents[0]) {
        const existing = splitStoredNotes((res.documents[0] as unknown as CrmLeadDoc).notes);
        qualPayload.notes = joinStoredNotes(input.notes, existing.lossReason, existing.lossReasonNotes);
      } else {
        qualPayload.notes = input.notes;
      }
    }
    qualPayload.qual_filled_at = new Date().toISOString();
    const safeReferrer = input.referrerUserId?.trim() || null;
    const safeReferralSource = input.referralSource?.trim().slice(0, 255) || null;
    if (safeReferrer) qualPayload.referrer_user_id = safeReferrer;
    if (safeReferralSource) qualPayload.referral_source = safeReferralSource;

    const { data: statusSettings } = await listCrmStatusSettings();
    const { data: automationSettings } = await getCrmAutomationSettings();
    const enteredAt = new Date().toISOString();

    let doc;
    if (res.total > 0 && res.documents[0]) {
      const existingDoc = res.documents[0] as unknown as CrmLeadDoc;
      const currentStatus = normalizeCrmStatus(existingDoc.crm_status);
      const existingFollowups = parseLeadFollowups(existingDoc.followups_json);
      let nextFollowups = existingFollowups;
      let targetStatus = currentStatus;

      if (currentStatus === "novo_lead" || currentStatus === "aguardando_qualificacao") {
        targetStatus = "aguardando_proposta";
        const move = buildLeadStatusMove(
          {
            crmStatus: currentStatus,
            funnelEnteredAt: existingDoc.funnel_entered_at ?? null,
            followups: existingFollowups,
          },
          targetStatus,
          statusSettings,
          { enteredAt },
        );
        qualPayload.crm_status = move.crmStatus;
        qualPayload.status_entered_at = move.statusEnteredAt;
        qualPayload.funnel_entered_at = existingDoc.funnel_entered_at || move.funnelEnteredAt;
        nextFollowups = move.followups;
      }

      const qualLead = {
        startDate: (qualPayload.start_date as string | undefined) ?? existingDoc.start_date ?? null,
        desiredCourse: (qualPayload.desired_course as string | undefined) ?? existingDoc.desired_course ?? null,
        weeklyHours:
          typeof qualPayload.weekly_hours === "number"
            ? qualPayload.weekly_hours
            : typeof existingDoc.weekly_hours === "number"
              ? existingDoc.weekly_hours
              : null,
        availablePeriod: normalizeAvailablePeriod(
          (qualPayload.available_period as string | undefined) ?? existingDoc.available_period ?? null,
        ),
        theoreticalExamDone:
          typeof qualPayload.theoretical_exam_done === "boolean"
            ? qualPayload.theoretical_exam_done
            : typeof existingDoc.theoretical_exam_done === "boolean"
              ? existingDoc.theoretical_exam_done
              : null,
        theoreticalStudyStatus:
          (qualPayload.theoretical_study_status as string | undefined) ?? existingDoc.theoretical_study_status ?? null,
        followups: nextFollowups,
      };

      qualPayload.followups_json = JSON.stringify(
        applyQualFollowupRules(
          qualLead,
          automationSettings.qualFollowupRules,
          enteredAt,
          targetStatus,
        ),
      );
      if (!existingDoc.referrer_user_id && safeReferrer) {
        qualPayload.referrer_user_id = safeReferrer;
      }
      if (!existingDoc.referral_source && safeReferralSource) {
        qualPayload.referral_source = safeReferralSource;
      }
      doc = await databases!.updateDocument(DB_ID!, CRM_LEADS_COL_ID!, res.documents[0].$id, qualPayload);
    } else {
      const targetStatus: CrmStatus = "aguardando_proposta";
      const move = buildLeadStatusMove({ crmStatus: targetStatus, funnelEnteredAt: null }, targetStatus, statusSettings, { enteredAt });
      const qualLead = {
        startDate: (qualPayload.start_date as string | undefined) ?? null,
        desiredCourse: (qualPayload.desired_course as string | undefined) ?? null,
        weeklyHours: typeof qualPayload.weekly_hours === "number" ? qualPayload.weekly_hours : null,
        availablePeriod: normalizeAvailablePeriod((qualPayload.available_period as string | undefined) ?? null),
        theoreticalExamDone:
          typeof qualPayload.theoretical_exam_done === "boolean" ? qualPayload.theoretical_exam_done : null,
        theoreticalStudyStatus: (qualPayload.theoretical_study_status as string | undefined) ?? null,
        followups: move.followups,
      };
      const followups = applyQualFollowupRules(
        qualLead,
        automationSettings.qualFollowupRules,
        enteredAt,
        targetStatus,
      );
      doc = await databases!.createDocument(
        DB_ID!,
        CRM_LEADS_COL_ID!,
        ID.unique(),
        {
          name: input.name,
          email: input.email,
          phone: input.phone ?? "",
          crm_status: move.crmStatus,
          status_entered_at: move.statusEnteredAt,
          funnel_entered_at: move.funnelEnteredAt,
          followups_json: JSON.stringify(followups),
          referrer_user_id: safeReferrer,
          referral_source: safeReferralSource,
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

export async function listCrmStatusSettings(): Promise<{ data: CrmStatusSetting[]; error: Error | null }> {
  if (!settingsConfigured()) return { data: [], error: new Error("ConfiguraÃ§Ãµes do CRM nÃ£o configuradas.") };
  try {
    const res = await databases!.listDocuments(DB_ID!, CRM_STATUS_SETTINGS_COL_ID!, [
      Query.limit(100),
    ]);
    return { data: (res.documents as unknown as CrmStatusSettingDoc[]).map(toStatusSettingFromDoc), error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}

export async function saveCrmStatusSetting(
  setting: Pick<CrmStatusSetting, "status" | "followups" | "expirationDays">,
): Promise<{ data: CrmStatusSetting | null; error: Error | null }> {
  if (!settingsConfigured()) return { data: null, error: new Error("ConfiguraÃ§Ãµes do CRM nÃ£o configuradas.") };
  try {
    const payload = {
      status: setting.status,
      followups_json: JSON.stringify(setting.followups),
      expiration_days: setting.expirationDays ?? null,
    };
    const existing = await databases!.listDocuments(DB_ID!, CRM_STATUS_SETTINGS_COL_ID!, [
      Query.equal("status", [setting.status]),
      Query.limit(1),
    ]);
    const doc = existing.total > 0 && existing.documents[0]
      ? await databases!.updateDocument(DB_ID!, CRM_STATUS_SETTINGS_COL_ID!, existing.documents[0].$id, payload)
      : await databases!.createDocument(
          DB_ID!,
          CRM_STATUS_SETTINGS_COL_ID!,
          ID.unique(),
          payload,
        );
    return { data: toStatusSettingFromDoc(doc as unknown as CrmStatusSettingDoc), error: null };
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
