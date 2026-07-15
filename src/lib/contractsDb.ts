import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, CONTRACTS_COL_ID, functions, ADMIN_USERS_FUNCTION_ID, storage } from "./appwrite";
import type { Contract, ContractKind, ContractStandardType, ContractStatus, ContractProfileData } from "../types/contracts";
import { resolveSystemVars } from "../types/contracts";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;

function docToContract(doc: Record<string, unknown>): Contract {
  let customVarValues: Record<string, string> = {};
  try {
    if (typeof doc.custom_var_values_json === "string" && doc.custom_var_values_json) {
      customVarValues = JSON.parse(doc.custom_var_values_json) as Record<string, string>;
    }
  } catch {
    customVarValues = {};
  }
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    templateId: (doc.template_id as string) ?? "",
    templateName: (doc.template_name as string) ?? "",
    leadId: (doc.lead_id as string | null) ?? null,
    standardType: normalizeStandardType(doc.standard_type as string | undefined),
    contractKind: normalizeContractKind(doc.contract_kind as string | undefined),
    recipientUserId: (doc.recipient_user_id as string) ?? "",
    recipientName: (doc.recipient_name as string) ?? "",
    contentResolvedJson: (doc.content_resolved_json as string) ?? "",
    customVarValues,
    status: ((doc.status as string) ?? "pending") as ContractStatus,
    createdBy: (doc.created_by as string) ?? "",
    createdAt: (doc.created_at as string) ?? (doc.$createdAt as string) ?? "",
    signedByRecipientAt: (doc.signed_by_recipient_at as string | null) ?? null,
    signedByAdminAt: (doc.signed_by_admin_at as string | null) ?? null,
    emailSentAt: (doc.email_sent_at as string | null) ?? null,
    enrollmentPdfFileId: (doc.enrollment_pdf_file_id as string | null) ?? null,
    signedPdfFileId: (doc.signed_pdf_file_id as string | null) ?? null,
  };
}

function normalizeStandardType(value: string | undefined): ContractStandardType {
  return value === "matricula" || value === "instrutor" ? value : "";
}

function normalizeContractKind(value: string | undefined): ContractKind {
  return value === "enrollment_form" ? "enrollment_form" : "standard_contract";
}

export type ContractFilters = {
  recipientUserId?: string;
  status?: ContractStatus;
  cursor?: string | null;
};

export async function listContracts(
  schoolId: string,
  filters: ContractFilters = {},
): Promise<{ items: Contract[]; nextCursor: string | null }> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) return { items: [], nextCursor: null };

  const queries: string[] = [
    Query.equal("school_id", schoolId),
    Query.orderDesc("created_at"),
    Query.limit(25),
  ];
  if (filters.recipientUserId) {
    queries.push(Query.equal("recipient_user_id", filters.recipientUserId));
  }
  if (filters.status) {
    queries.push(Query.equal("status", filters.status));
  }
  if (filters.cursor) {
    queries.push(Query.cursorAfter(filters.cursor));
  }

  const res = await databases.listDocuments(DB_ID, CONTRACTS_COL_ID, queries);
  const items = res.documents.map((d) => docToContract(d as unknown as Record<string, unknown>));
  const lastItem = items[items.length - 1];
  const nextCursor = res.documents.length === 25 && lastItem ? lastItem.id : null;
  return { items, nextCursor };
}

export async function listContractsForUser(schoolId: string, userId: string): Promise<Contract[]> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, CONTRACTS_COL_ID, [
    Query.equal("school_id", schoolId),
    Query.equal("recipient_user_id", userId),
    Query.orderDesc("created_at"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => docToContract(d as unknown as Record<string, unknown>));
}

export async function getContract(id: string): Promise<Contract | null> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) return null;
  try {
    const doc = await databases.getDocument(DB_ID, CONTRACTS_COL_ID, id);
    return docToContract(doc as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function loadRecipientProfile(userId: string): Promise<ContractProfileData | null> {
  if (!databases || !DB_ID || !PROFILES_COL_ID) return null;
  try {
    const doc = await databases.getDocument(DB_ID, PROFILES_COL_ID, userId);
    const d = doc as unknown as Record<string, unknown>;
    return {
      fullName: (d.full_name as string) ?? "",
      cpf: (d.cpf as string) ?? "",
      phone: (d.phone as string) ?? "",
      birthDate: (d.birth_date as string) ?? "",
      email: (d.email as string) ?? "",
      rg: (d.rg as string) ?? "",
      rgOrgaoExpedidor: (d.rg_orgao_expedidor as string) ?? "",
      endereco: (d.endereco as string) ?? "",
      nacionalidade: (d.nacionalidade as string) ?? "",
      estadoCivil: (d.estado_civil as string) ?? "",
      anacCode: (d.anac_code as string) ?? "",
    };
  } catch {
    return null;
  }
}

export async function createContract(input: {
  schoolId: string;
  templateId: string;
  templateName: string;
  templateContentJson: string;
  leadId?: string | null;
  standardType?: ContractStandardType;
  contractKind?: ContractKind;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  customVarValues: Record<string, string>;
  createdBy: string;
}): Promise<Contract> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }

  const profile = await loadRecipientProfile(input.recipientUserId);
  const profileData: ContractProfileData = profile ?? {
    fullName: input.recipientName,
    cpf: "",
    phone: "",
    birthDate: "",
    email: input.recipientEmail,
    rg: "",
    rgOrgaoExpedidor: "",
    endereco: "",
    nacionalidade: "",
    estadoCivil: "",
    anacCode: "",
  };

  const contentResolved = resolveSystemVars(input.templateContentJson, profileData);
  const now = new Date().toISOString();

  const doc = await databases.createDocument(DB_ID, CONTRACTS_COL_ID, ID.unique(), {
    school_id: input.schoolId,
    template_id: input.templateId,
    template_name: input.templateName,
    ...(input.leadId !== undefined ? { lead_id: input.leadId } : {}),
    ...(input.standardType !== undefined ? { standard_type: input.standardType } : {}),
    ...(input.contractKind !== undefined ? { contract_kind: input.contractKind } : {}),
    recipient_user_id: input.recipientUserId,
    recipient_name: input.recipientName,
    content_resolved_json: contentResolved,
    custom_var_values_json: JSON.stringify(input.customVarValues),
    status: "pending",
    created_by: input.createdBy,
    created_at: now,
  });

  return docToContract(doc as unknown as Record<string, unknown>);
}

export async function updateContractStatus(
  id: string,
  signerRole: "aluno" | "instrutor" | "admin",
): Promise<Contract> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }

  const current = await getContract(id);
  if (!current) throw new Error("Contrato não encontrado");

  const now = new Date().toISOString();
  const isRecipient = signerRole === "aluno" || signerRole === "instrutor";
  const isAdmin = signerRole === "admin";

  const recipientSigned = isRecipient ? true : current.signedByRecipientAt !== null;
  const adminSigned = isAdmin ? true : current.signedByAdminAt !== null;

  let newStatus: ContractStatus = current.status;
  if (recipientSigned && adminSigned) {
    newStatus = "signed_both";
  } else if (adminSigned) {
    newStatus = "signed_admin";
  } else if (recipientSigned) {
    newStatus = "signed_recipient";
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (isRecipient && !current.signedByRecipientAt) {
    updateData.signed_by_recipient_at = now;
  }
  if (isAdmin && !current.signedByAdminAt) {
    updateData.signed_by_admin_at = now;
  }

  const doc = await databases.updateDocument(DB_ID, CONTRACTS_COL_ID, id, updateData);
  return docToContract(doc as unknown as Record<string, unknown>);
}

export async function cancelContract(id: string): Promise<void> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) return;
  await databases.updateDocument(DB_ID, CONTRACTS_COL_ID, id, { status: "cancelled" });
}

export async function markContractEmailSent(id: string): Promise<void> {
  if (!databases || !DB_ID || !CONTRACTS_COL_ID) return;
  await databases.updateDocument(DB_ID, CONTRACTS_COL_ID, id, {
    email_sent_at: new Date().toISOString(),
  });
}

function parseFunctionResponse(body: string | undefined): {
  contract?: Record<string, unknown>;
  contracts?: Record<string, unknown>[];
  signed?: Record<string, unknown>[];
  deletedIds?: string[];
  failures?: Array<{ id: string; message: string }>;
  fileId?: string;
  message?: string;
} {
  if (!body) return {};
  try {
    return JSON.parse(body) as { contract?: Record<string, unknown>; fileId?: string; message?: string };
  } catch {
    return {};
  }
}

export function getContractPdfUrl(fileId: string, mode: "view" | "download" = "view"): string {
  if (!storage || !BUCKET_ID || !fileId) return "";
  const url = mode === "download" ? storage.getFileDownload(BUCKET_ID, fileId) : storage.getFileView(BUCKET_ID, fileId);
  return url.toString();
}

export async function ensureEnrollmentFormPreviewViaAdminFunction(contractId: string): Promise<string> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao de usuarios nao configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "ensureEnrollmentFormPreview", contractId }),
    false,
  );
  const response = parseFunctionResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao gerar preview da ficha.");
  }
  if (!response.fileId) throw new Error("Preview da ficha nao retornado.");
  return response.fileId;
}

export async function signContractViaAdminFunction(input: {
  contractId: string;
  signerRole: "aluno" | "instrutor" | "admin";
}): Promise<Contract> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "signContract", contractId: input.contractId, signerRole: input.signerRole }),
    false,
  );
  const response = parseFunctionResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.contract) {
    throw new Error(response.message || "Falha ao assinar contrato.");
  }
  return docToContract(response.contract);
}

async function getContractActionExecution(executionId: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await functions!.getExecution(ADMIN_USERS_FUNCTION_ID!, executionId);
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message || "");
      if (!/not be found|not found|404/i.test(message)) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Execução não encontrada.");
}

async function executeContractAdminAction(payload: Record<string, unknown>): Promise<ReturnType<typeof parseFunctionResponse>> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const ids = Array.isArray(payload.contractIds) ? payload.contractIds : [];
  if (ids.length <= 10) {
    const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
    const response = parseFunctionResponse(execution.responseBody);
    if (execution.status === "failed" || execution.responseStatusCode >= 400) {
      throw new Error(response.message || "Falha ao executar ação em massa.");
    }
    return response;
  }

  const created = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), true);
  let execution = await getContractActionExecution(created.$id);
  const startedAt = Date.now();
  while (execution.status === "processing" || execution.status === "waiting") {
    if (Date.now() - startedAt > 5 * 60 * 1000) {
      throw new Error("A ação em massa ainda está em andamento. Aguarde um pouco e atualize a lista.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    execution = await getContractActionExecution(created.$id);
  }
  const response = parseFunctionResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar ação em massa.");
  }
  return response;
}

export async function bulkSignContractsViaAdminFunction(contractIds: string[]): Promise<{
  signed: Contract[];
  failures: Array<{ id: string; message: string }>;
}> {
  const response = await executeContractAdminAction({ action: "bulkSignContracts", contractIds, signerRole: "admin" });
  return {
    signed: (response.signed ?? response.contracts ?? []).map(docToContract),
    failures: response.failures ?? [],
  };
}

export async function bulkDeleteContractsViaAdminFunction(contractIds: string[]): Promise<{
  deletedIds: string[];
  failures: Array<{ id: string; message: string }>;
}> {
  const response = await executeContractAdminAction({ action: "bulkDeleteContracts", contractIds });
  return {
    deletedIds: response.deletedIds ?? [],
    failures: response.failures ?? [],
  };
}
