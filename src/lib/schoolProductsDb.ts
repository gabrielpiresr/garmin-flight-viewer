import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, DEFAULT_SCHOOL_ID, SCHOOL_PRODUCTS_COL_ID } from "./appwrite";
import type { SchoolProduct, SchoolProductInput } from "../types/costs";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && SCHOOL_PRODUCTS_COL_ID);
}

function toProduct(doc: Record<string, unknown>): SchoolProduct {
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    name: (doc.name as string) ?? "",
    idealPrice: Number(doc.ideal_price ?? 0),
    active: Boolean(doc.active ?? true),
    createdAt: (doc.$createdAt as string) ?? "",
    deletedAt: (doc.deleted_at as string | null | undefined) ?? null,
  };
}

export async function listSchoolProducts(includeInactive = false): Promise<SchoolProduct[]> {
  if (!isReady() || !databases) return [];
  try {
    const queries = [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.isNull("deleted_at"),
      Query.orderAsc("name"),
      Query.limit(500),
    ];
    if (!includeInactive) queries.push(Query.equal("active", [true]));
    const res = await databases.listDocuments(DB_ID, SCHOOL_PRODUCTS_COL_ID!, queries);
    return res.documents.map((d) => toProduct(d as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function createSchoolProduct(input: SchoolProductInput): Promise<SchoolProduct> {
  if (!isReady() || !databases || !SCHOOL_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  const doc = await databases.createDocument(
    DB_ID,
    SCHOOL_PRODUCTS_COL_ID,
    ID.unique(),
    {
      school_id: DEFAULT_SCHOOL_ID,
      name: input.name.trim(),
      ideal_price: input.idealPrice,
      active: true,
      deleted_at: null,
    },
    permissions,
  );
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function updateSchoolProduct(id: string, input: SchoolProductInput): Promise<SchoolProduct> {
  if (!isReady() || !databases || !SCHOOL_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, SCHOOL_PRODUCTS_COL_ID, id, {
    name: input.name.trim(),
    ideal_price: input.idealPrice,
  });
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function toggleSchoolProductActive(id: string, active: boolean): Promise<SchoolProduct> {
  if (!isReady() || !databases || !SCHOOL_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, SCHOOL_PRODUCTS_COL_ID, id, { active });
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function deleteSchoolProduct(id: string): Promise<void> {
  if (!isReady() || !databases || !SCHOOL_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  await databases.updateDocument(DB_ID, SCHOOL_PRODUCTS_COL_ID, id, { deleted_at: new Date().toISOString() });
}
