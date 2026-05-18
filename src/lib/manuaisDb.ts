import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, MANUALS_BUCKET_ID, MANUALS_COL_ID, SCHOOL_ID, storage } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";

export type Manual = {
  id: string;
  schoolId: string;
  name: string;
  category: string;
  fileId: string;
  originalName: string;
  mimeType: string | null;
  fileSize: number | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateManualPayload = {
  name: string;
  category: string;
  file: File;
  actorUserId?: string;
};

function isManuaisConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && storage && DB_ID && MANUALS_COL_ID && MANUALS_BUCKET_ID);
}

function toManual(doc: Record<string, unknown>): Manual {
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string | undefined) ?? "",
    name: (doc.name as string | undefined) ?? "",
    category: (doc.category as string | undefined) ?? "",
    fileId: (doc.file_id as string | undefined) ?? "",
    originalName: (doc.original_name as string | undefined) ?? "",
    mimeType: (doc.mime_type as string | null | undefined) ?? null,
    fileSize: (doc.file_size as number | null | undefined) ?? null,
    sortOrder: (doc.sort_order as number | undefined) ?? 0,
    createdBy: (doc.created_by as string | null | undefined) ?? null,
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

export function getManualDownloadUrl(fileId: string): string | null {
  if (!storage || !MANUALS_BUCKET_ID || !fileId) return null;
  return storage.getFileDownload(MANUALS_BUCKET_ID, fileId).toString();
}

export function getManualViewUrl(fileId: string): string | null {
  if (!storage || !MANUALS_BUCKET_ID || !fileId) return null;
  return storage.getFileView(MANUALS_BUCKET_ID, fileId).toString();
}

export async function listManuals(): Promise<{ data: Manual[] | null; error: Error | null }> {
  if (!isManuaisConfigured() || !DB_ID || !MANUALS_COL_ID) {
    return { data: [], error: null };
  }
  try {
    const res = await databases!.listDocuments(DB_ID, MANUALS_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.orderAsc("category"),
      Query.orderAsc("sort_order"),
      Query.orderAsc("name"),
      Query.limit(500),
    ]);
    return { data: res.documents.map((doc) => toManual(doc as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createManual(payload: CreateManualPayload): Promise<{ data: Manual | null; error: Error | null }> {
  if (!isManuaisConfigured() || !DB_ID || !MANUALS_COL_ID || !MANUALS_BUCKET_ID) {
    return {
      data: null,
      error: new Error("Módulo de manuais não configurado. Execute npm run appwrite:setup-manuals e defina as variáveis no .env.local."),
    };
  }

  let fileId: string | null = null;
  try {
    const uploaded = await storage!.createFile(MANUALS_BUCKET_ID, ID.unique(), payload.file);
    fileId = uploaded.$id;
  } catch (error) {
    return { data: null, error: error as Error };
  }

  try {
    const doc = await databases!.createDocument(DB_ID, MANUALS_COL_ID, ID.unique(), {
      school_id: DEFAULT_SCHOOL_ID,
      name: payload.name,
      category: payload.category,
      file_id: fileId,
      original_name: payload.file.name,
      mime_type: payload.file.type || null,
      file_size: payload.file.size || null,
      sort_order: 0,
      created_by: payload.actorUserId ?? null,
    });
    return { data: toManual(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    // Best-effort cleanup of uploaded file
    try {
      await storage!.deleteFile(MANUALS_BUCKET_ID, fileId!);
    } catch {
      // ignore
    }
    return { data: null, error: error as Error };
  }
}

export async function deleteManual(manualId: string): Promise<{ error: Error | null }> {
  if (!isManuaisConfigured() || !DB_ID || !MANUALS_COL_ID || !MANUALS_BUCKET_ID) {
    return { error: new Error("Módulo de manuais não configurado.") };
  }
  try {
    const doc = await databases!.getDocument(DB_ID, MANUALS_COL_ID, manualId);
    const fileId = (doc.file_id as string | null | undefined) ?? null;
    await databases!.deleteDocument(DB_ID, MANUALS_COL_ID, manualId);
    if (fileId) {
      try {
        await storage!.deleteFile(MANUALS_BUCKET_ID, fileId);
      } catch {
        // ignore orphaned file
      }
    }
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateManualMeta(
  manualId: string,
  updates: { name?: string; category?: string; sortOrder?: number },
): Promise<{ data: Manual | null; error: Error | null }> {
  if (!isManuaisConfigured() || !DB_ID || !MANUALS_COL_ID) {
    return { data: null, error: new Error("Módulo de manuais não configurado.") };
  }
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
    const doc = await databases!.updateDocument(DB_ID, MANUALS_COL_ID, manualId, payload);
    return { data: toManual(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
