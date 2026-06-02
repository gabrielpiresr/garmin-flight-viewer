import { Query } from "appwrite";
import { databases, ID, CONTRACT_TEMPLATES_COL_ID } from "./appwrite";
import type { ContractStandardType, ContractTemplate, CustomVariable } from "../types/contracts";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function docToTemplate(doc: Record<string, unknown>): ContractTemplate {
  let customVariables: CustomVariable[] = [];
  try {
    if (typeof doc.custom_variables_json === "string" && doc.custom_variables_json) {
      customVariables = JSON.parse(doc.custom_variables_json) as CustomVariable[];
    }
  } catch {
    customVariables = [];
  }
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    name: (doc.name as string) ?? "",
    standardType: normalizeStandardType(doc.standard_type as string | undefined),
    contentJson: (doc.content_json as string) ?? "",
    customVariables,
    createdBy: (doc.created_by as string) ?? "",
    createdAt: (doc.created_at as string) ?? (doc.$createdAt as string) ?? "",
    updatedAt: (doc.updated_at as string) ?? (doc.$updatedAt as string) ?? "",
  };
}

function normalizeStandardType(value: string | undefined): ContractStandardType {
  return value === "matricula" || value === "instrutor" ? value : "";
}

export async function listContractTemplates(schoolId: string): Promise<ContractTemplate[]> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, CONTRACT_TEMPLATES_COL_ID, [
    Query.equal("school_id", schoolId),
    Query.orderDesc("created_at"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => docToTemplate(d as unknown as Record<string, unknown>));
}

export async function listStandardContractTemplates(
  schoolId: string,
  standardType: Exclude<ContractStandardType, "">,
): Promise<ContractTemplate[]> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, CONTRACT_TEMPLATES_COL_ID, [
    Query.equal("school_id", schoolId),
    Query.equal("standard_type", standardType),
    Query.orderDesc("created_at"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => docToTemplate(d as unknown as Record<string, unknown>));
}

export async function getContractTemplate(id: string): Promise<ContractTemplate | null> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) return null;
  try {
    const doc = await databases.getDocument(DB_ID, CONTRACT_TEMPLATES_COL_ID, id);
    return docToTemplate(doc as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function createContractTemplate(input: {
  schoolId: string;
  name: string;
  standardType: ContractStandardType;
  contentJson: string;
  customVariables: CustomVariable[];
  createdBy: string;
}): Promise<ContractTemplate> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) {
    throw new Error("Appwrite não configurado");
  }
  const now = new Date().toISOString();
  const doc = await databases.createDocument(DB_ID, CONTRACT_TEMPLATES_COL_ID, ID.unique(), {
    school_id: input.schoolId,
    name: input.name,
    standard_type: input.standardType,
    content_json: input.contentJson,
    custom_variables_json: JSON.stringify(input.customVariables),
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
  });
  return docToTemplate(doc as unknown as Record<string, unknown>);
}

export async function updateContractTemplate(
  id: string,
  input: {
    name: string;
    standardType: ContractStandardType;
    contentJson: string;
    customVariables: CustomVariable[];
  },
): Promise<ContractTemplate> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) {
    throw new Error("Appwrite não configurado");
  }
  const now = new Date().toISOString();
  const doc = await databases.updateDocument(DB_ID, CONTRACT_TEMPLATES_COL_ID, id, {
    name: input.name,
    standard_type: input.standardType,
    content_json: input.contentJson,
    custom_variables_json: JSON.stringify(input.customVariables),
    updated_at: now,
  });
  return docToTemplate(doc as unknown as Record<string, unknown>);
}

export async function deleteContractTemplate(id: string): Promise<void> {
  if (!databases || !DB_ID || !CONTRACT_TEMPLATES_COL_ID) return;
  await databases.deleteDocument(DB_ID, CONTRACT_TEMPLATES_COL_ID, id);
}
