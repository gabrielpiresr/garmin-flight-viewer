import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  INTERNAL_MANUALS_BUCKET_ID,
  INTERNAL_MANUALS_COL_ID,
  DEFAULT_SCHOOL_ID,
  storage,
} from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type ManualInterno = {
  id: string;
  schoolId: string;
  name: string;
  category: string;
  fileId: string;
  originalName: string;
  mimeType: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateManualInternoPayload = {
  name: string;
  category: string;
  /** Provide either file OR externalUrl, not both. */
  file?: File;
  externalUrl?: string;
  actorUserId?: string;
};

function isConfigured(): boolean {
  return Boolean(
    isAppwriteConfigured && databases && storage && DB_ID && INTERNAL_MANUALS_COL_ID && INTERNAL_MANUALS_BUCKET_ID,
  );
}

function toManualInterno(doc: Record<string, unknown>): ManualInterno {
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string | undefined) ?? "",
    name: (doc.name as string | undefined) ?? "",
    category: (doc.category as string | undefined) ?? "",
    fileId: (doc.file_id as string | undefined) ?? "",
    originalName: (doc.original_name as string | undefined) ?? "",
    mimeType: (doc.mime_type as string | null | undefined) ?? null,
    fileSize: (doc.file_size as number | null | undefined) ?? null,
    externalUrl: (doc.external_url as string | null | undefined) ?? null,
    sortOrder: (doc.sort_order as number | undefined) ?? 0,
    createdBy: (doc.created_by as string | null | undefined) ?? null,
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

export function getManualInternoDownloadUrl(fileId: string): string | null {
  if (!storage || !INTERNAL_MANUALS_BUCKET_ID || !fileId) return null;
  return storage.getFileDownload(INTERNAL_MANUALS_BUCKET_ID, fileId).toString();
}

export function getManualInternoViewUrl(fileId: string): string | null {
  if (!storage || !INTERNAL_MANUALS_BUCKET_ID || !fileId) return null;
  return storage.getFileView(INTERNAL_MANUALS_BUCKET_ID, fileId).toString();
}

export async function listManuaisInternos(): Promise<{ data: ManualInterno[] | null; error: Error | null }> {
  if (!isConfigured() || !DB_ID || !INTERNAL_MANUALS_COL_ID) {
    return { data: [], error: null };
  }
  try {
    const res = await databases!.listDocuments(DB_ID, INTERNAL_MANUALS_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.orderAsc("category"),
      Query.orderAsc("sort_order"),
      Query.orderAsc("name"),
      Query.limit(500),
    ]);
    return { data: res.documents.map((doc) => toManualInterno(doc as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createManualInterno(
  payload: CreateManualInternoPayload,
): Promise<{ data: ManualInterno | null; error: Error | null }> {
  if (!isConfigured() || !DB_ID || !INTERNAL_MANUALS_COL_ID || !INTERNAL_MANUALS_BUCKET_ID) {
    return {
      data: null,
      error: new Error(
        "Módulo de manuais internos não configurado. Defina VITE_APPWRITE_INTERNAL_MANUALS_COL_ID e VITE_APPWRITE_INTERNAL_MANUALS_BUCKET_ID no .env.local.",
      ),
    };
  }

  // ── External link (no file upload) ──────────────────────────────────────────
  if (payload.externalUrl) {
    try {
      const doc = await databases!.createDocument(DB_ID, INTERNAL_MANUALS_COL_ID, ID.unique(), {
        school_id: DEFAULT_SCHOOL_ID,
        name: payload.name,
        category: payload.category,
        file_id: "",
        original_name: "",
        mime_type: null,
        file_size: null,
        external_url: payload.externalUrl,
        sort_order: 0,
        created_by: payload.actorUserId ?? null,
      });
      return { data: toManualInterno(doc as unknown as Record<string, unknown>), error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  // ── File upload ──────────────────────────────────────────────────────────────
  const file = payload.file!;
  let fileId: string | null = null;
  try {
    const uploaded = await storage!.createFile(INTERNAL_MANUALS_BUCKET_ID, ID.unique(), file);
    fileId = uploaded.$id;
  } catch (error) {
    return { data: null, error: error as Error };
  }

  try {
    const doc = await databases!.createDocument(DB_ID, INTERNAL_MANUALS_COL_ID, ID.unique(), {
      school_id: DEFAULT_SCHOOL_ID,
      name: payload.name,
      category: payload.category,
      file_id: fileId,
      original_name: file.name,
      mime_type: file.type || null,
      file_size: file.size || null,
      external_url: null,
      sort_order: 0,
      created_by: payload.actorUserId ?? null,
    });
    return { data: toManualInterno(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    try {
      await storage!.deleteFile(INTERNAL_MANUALS_BUCKET_ID, fileId!);
    } catch {
      // ignore
    }
    return { data: null, error: error as Error };
  }
}

export async function deleteManualInterno(manualId: string): Promise<{ error: Error | null }> {
  if (!isConfigured() || !DB_ID || !INTERNAL_MANUALS_COL_ID || !INTERNAL_MANUALS_BUCKET_ID) {
    return { error: new Error("Módulo de manuais internos não configurado.") };
  }
  try {
    const doc = await databases!.getDocument(DB_ID, INTERNAL_MANUALS_COL_ID, manualId);
    const fileId = (doc.file_id as string | null | undefined) ?? null;
    await databases!.deleteDocument(DB_ID, INTERNAL_MANUALS_COL_ID, manualId);
    if (fileId) {
      try {
        await storage!.deleteFile(INTERNAL_MANUALS_BUCKET_ID, fileId);
      } catch {
        // ignore orphaned file
      }
    }
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateManualInternoMeta(
  manualId: string,
  updates: { name?: string; category?: string; sortOrder?: number; externalUrl?: string | null },
): Promise<{ data: ManualInterno | null; error: Error | null }> {
  if (!isConfigured() || !DB_ID || !INTERNAL_MANUALS_COL_ID) {
    return { data: null, error: new Error("Módulo de manuais internos não configurado.") };
  }
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
    if (updates.externalUrl !== undefined) payload.external_url = updates.externalUrl;
    const doc = await databases!.updateDocument(DB_ID, INTERNAL_MANUALS_COL_ID, manualId, payload);
    return { data: toManualInterno(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
