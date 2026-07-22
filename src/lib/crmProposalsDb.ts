import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  CRM_PROPOSALS_COL_ID,
  DEFAULT_SCHOOL_ID,
  ADMIN_USERS_FUNCTION_ID,
  functions,
} from "./appwrite";
import type { CrmProposal, CrmProposalInput, ProposalProduct, ProposalInfoPackage } from "../types/proposal";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_PROPOSALS_COL_ID);
}

type PublicProposalFunctionResponse = {
  proposal?: Partial<CrmProposal>;
  message?: string;
};

type ProposalDoc = {
  $id: string;
  $createdAt: string;
  school_id?: string;
  lead_id?: string;
  lead_name?: string;
  lead_email?: string;
  hours?: number | null;
  hour_price?: number | null;
  total_value?: number | null;
  products_json?: string | null;
  public_token?: string;
  status?: string | null;
  cakto_offer_id?: string | null;
  payment_url?: string | null;
  payment_status?: string | null;
  payment_error?: string | null;
  payment_updated_at?: string | null;
  proposal_type?: string | null;
  student_user_id?: string | null;
  credit_package_id?: string | null;
  credit_package_snapshot_json?: string | null;
  credit_id?: string | null;
};

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

function toProposal(doc: ProposalDoc): CrmProposal {
  const productsData = safeParse<unknown>(doc.products_json, []);
  const isObject = productsData !== null && typeof productsData === "object" && !Array.isArray(productsData);
  const packageMetadata =
    isObject && (productsData as Record<string, unknown>).kind === "student_credit_package"
      ? productsData as {
          studentUserId?: string;
          packageId?: string;
          creditId?: string;
          snapshot?: CrmProposal["creditPackageSnapshot"];
          products?: ProposalProduct[];
        }
      : null;
  const notes = isObject ? String((productsData as Record<string, unknown>).notes ?? "") : "";
  const infoPackagesRaw = isObject ? (productsData as Record<string, unknown>).infoPackages : [];
  const infoPackages = Array.isArray(infoPackagesRaw)
    ? infoPackagesRaw
      .map((item): ProposalInfoPackage | null => {
        const row = item as Record<string, unknown>;
        const hours = Number(row?.hours);
        const hourPrice = Number(row?.hourPrice);
        const validityDays = Number(row?.validityDays);
        if (!Number.isFinite(hours) || !Number.isFinite(hourPrice) || !Number.isFinite(validityDays)) return null;
        return {
          id: String(row?.id ?? ""),
          hours,
          hourPrice,
          validityDays,
          aircraftModelName: String(row?.aircraftModelName ?? ""),
        };
      })
      .filter((item): item is ProposalInfoPackage => Boolean(item))
    : [];
  return {
    id: doc.$id,
    schoolId: doc.school_id ?? DEFAULT_SCHOOL_ID,
    leadId: doc.lead_id ?? "",
    leadName: doc.lead_name ?? "",
    leadEmail: doc.lead_email ?? "",
    hours: doc.hours ?? 0,
    hourPrice: doc.hour_price ?? 0,
    totalValue: doc.total_value ?? 0,
    products: Array.isArray(productsData)
      ? productsData as ProposalProduct[]
      : Array.isArray((productsData as Record<string, unknown> | null)?.products)
        ? ((productsData as Record<string, unknown>).products as ProposalProduct[])
        : [],
    infoPackages,
    notes,
    publicToken: doc.public_token ?? "",
    status: (doc.status === "sent" ? "sent" : "draft") as CrmProposal["status"],
    caktoOfferId: doc.cakto_offer_id ?? "",
    paymentUrl: doc.payment_url ?? "",
    paymentStatus: ["created", "paid", "failed"].includes(doc.payment_status || "")
      ? doc.payment_status as CrmProposal["paymentStatus"]
      : "pending",
    paymentError: doc.payment_error ?? "",
    paymentUpdatedAt: doc.payment_updated_at ?? null,
    proposalType: packageMetadata ? "student_credit_package" : "commercial",
    studentUserId: packageMetadata?.studentUserId ?? "",
    creditPackageId: packageMetadata?.packageId ?? "",
    creditPackageSnapshot: packageMetadata?.snapshot ?? null,
    creditId: packageMetadata?.creditId ?? "",
    createdAt: doc.$createdAt ?? "",
  };
}

function normalizePublicProposal(proposal: Partial<CrmProposal>): CrmProposal {
  return {
    id: proposal.id ?? "",
    schoolId: proposal.schoolId ?? DEFAULT_SCHOOL_ID,
    leadId: proposal.leadId ?? "",
    leadName: proposal.leadName ?? "",
    leadEmail: proposal.leadEmail ?? "",
    hours: Number(proposal.hours) || 0,
    hourPrice: Number(proposal.hourPrice) || 0,
    totalValue: Number(proposal.totalValue) || 0,
    products: Array.isArray(proposal.products) ? proposal.products : [],
    infoPackages: Array.isArray(proposal.infoPackages) ? proposal.infoPackages : [],
    notes: proposal.notes ?? "",
    publicToken: proposal.publicToken ?? "",
    status: proposal.status === "sent" ? "sent" : "draft",
    caktoOfferId: proposal.caktoOfferId ?? "",
    paymentUrl: proposal.paymentUrl ?? "",
    paymentStatus: ["created", "paid", "failed"].includes(proposal.paymentStatus || "")
      ? proposal.paymentStatus as CrmProposal["paymentStatus"]
      : "pending",
    paymentError: proposal.paymentError ?? "",
    paymentUpdatedAt: proposal.paymentUpdatedAt ?? null,
    proposalType: proposal.proposalType === "student_credit_package" ? "student_credit_package" : "commercial",
    studentUserId: proposal.studentUserId ?? "",
    creditPackageId: proposal.creditPackageId ?? "",
    creditPackageSnapshot: proposal.creditPackageSnapshot ?? null,
    creditId: proposal.creditId ?? "",
    createdAt: proposal.createdAt ?? "",
  };
}

export async function createProposal(input: CrmProposalInput): Promise<{ data: CrmProposal | null; error: Error | null }> {
  if (!configured() || !databases) return { data: null, error: new Error("Appwrite não configurado") };
  try {
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const totalValue = Math.round(input.hours * input.hourPrice * 100) / 100;
    const perms = [
      Permission.read(Role.any()),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ];
    const doc = await databases.createDocument(
      DB_ID,
      CRM_PROPOSALS_COL_ID!,
      ID.unique(),
      {
        school_id: DEFAULT_SCHOOL_ID,
        lead_id: input.leadId,
        lead_name: input.leadName,
        lead_email: input.leadEmail,
        hours: input.hours,
        hour_price: input.hourPrice,
        total_value: totalValue,
        products_json: JSON.stringify(input.products),
        public_token: token,
        status: "draft",
      },
      perms,
    );
    return { data: toProposal(doc as unknown as ProposalDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getProposalByToken(token: string): Promise<{ data: CrmProposal | null; error: Error | null }> {
  if (!configured() || !databases) return { data: null, error: new Error("Appwrite não configurado") };
  try {
    const res = await databases.listDocuments(DB_ID, CRM_PROPOSALS_COL_ID!, [
      Query.equal("public_token", [token]),
      Query.limit(1),
    ]);
    if (res.total === 0) return { data: null, error: null };
    return { data: toProposal(res.documents[0] as unknown as ProposalDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

function publicProposalCompatFallbackEnabled(): boolean {
  return String(import.meta.env.VITE_ADMIN_USERS_SECURITY_MODE || "compat").toLowerCase() !== "strict";
}

export async function getPublicProposalByToken(token: string): Promise<{ data: CrmProposal | null; error: Error | null }> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    if (publicProposalCompatFallbackEnabled()) return getProposalByToken(token);
    return { data: null, error: new Error("Funcao administrativa nao configurada.") };
  }

  try {
    const execution = await functions.createExecution(
      ADMIN_USERS_FUNCTION_ID,
      JSON.stringify({ action: "getPublicProposal", token }),
      false,
    );
    let body: PublicProposalFunctionResponse = {};
    try {
      body = JSON.parse(execution.responseBody || "{}") as PublicProposalFunctionResponse;
    } catch {
      body = {};
    }
    if (execution.status === "failed" || execution.responseStatusCode >= 400 || !body.proposal) {
      throw new Error(body.message || "Proposta nao encontrada ou link invalido.");
    }
    return { data: normalizePublicProposal(body.proposal), error: null };
  } catch (error) {
    if (publicProposalCompatFallbackEnabled()) return getProposalByToken(token);
    return { data: null, error: error as Error };
  }
}

export async function getProposalsByLead(leadId: string): Promise<CrmProposal[]> {
  if (!configured() || !databases) return [];
  try {
    const res = await databases.listDocuments(DB_ID, CRM_PROPOSALS_COL_ID!, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.equal("lead_id", [leadId]),
      Query.orderDesc("$createdAt"),
      Query.limit(20),
    ]);
    return res.documents.map((d) => toProposal(d as unknown as ProposalDoc));
  } catch {
    return [];
  }
}

export async function updateProposalStatus(id: string, status: "draft" | "sent"): Promise<{ error: Error | null }> {
  if (!configured() || !databases) return { error: new Error("Appwrite não configurado") };
  try {
    await databases.updateDocument(DB_ID, CRM_PROPOSALS_COL_ID!, id, { status });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
