import { Query } from "appwrite";
import { databases, ID, CONTRACT_SIGNATURES_COL_ID } from "./appwrite";
import type { ContractSignature } from "../types/contracts";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function docToSignature(doc: Record<string, unknown>): ContractSignature {
  return {
    id: doc.$id as string,
    contractId: (doc.contract_id as string) ?? "",
    signerUserId: (doc.signer_user_id as string) ?? "",
    signerRole: ((doc.signer_role as string) ?? "aluno") as ContractSignature["signerRole"],
    signedAt: (doc.signed_at as string) ?? "",
    schoolId: (doc.school_id as string) ?? "",
    createdAt: (doc.created_at as string) ?? (doc.$createdAt as string) ?? "",
  };
}

export async function createContractSignature(input: {
  contractId: string;
  signerUserId: string;
  signerRole: ContractSignature["signerRole"];
  schoolId: string;
}): Promise<ContractSignature> {
  if (!databases || !DB_ID || !CONTRACT_SIGNATURES_COL_ID) {
    throw new Error("Appwrite não configurado");
  }
  const now = new Date().toISOString();
  const doc = await databases.createDocument(DB_ID, CONTRACT_SIGNATURES_COL_ID, ID.unique(), {
    contract_id: input.contractId,
    signer_user_id: input.signerUserId,
    signer_role: input.signerRole,
    signed_at: now,
    school_id: input.schoolId,
    created_at: now,
  });
  return docToSignature(doc as unknown as Record<string, unknown>);
}

export async function listSignaturesForContract(contractId: string): Promise<ContractSignature[]> {
  if (!databases || !DB_ID || !CONTRACT_SIGNATURES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, CONTRACT_SIGNATURES_COL_ID, [
    Query.equal("contract_id", contractId),
    Query.orderAsc("signed_at"),
  ]);
  return res.documents.map((d) => docToSignature(d as unknown as Record<string, unknown>));
}
