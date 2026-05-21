import { Query } from "appwrite";
import {
  BUCKET_ID,
  databases,
  ID,
  isAppwriteConfigured,
  NOTICES_BUCKET_ID,
  NOTICES_COL_ID, DEFAULT_SCHOOL_ID,
  storage,
} from "./appwrite";


import type { CreateNoticePayload, Notice, UpdateNoticePayload } from "../types/notice";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function getNoticeBucketId(): string | undefined {
  return NOTICES_BUCKET_ID ?? BUCKET_ID;
}

function isNoticesConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && NOTICES_COL_ID);
}

function toNotice(doc: Record<string, unknown>): Notice {
  const bannerFileId = (doc.banner_file_id as string | null | undefined) ?? null;
  const bucketId = getNoticeBucketId();
  const bannerUrl =
    bannerFileId && storage && bucketId ? storage.getFileView(bucketId, bannerFileId).toString() : null;

  return {
    id: doc.$id as string,
    title: (doc.title as string | undefined) ?? "",
    contentMd: (doc.content_md as string | undefined) ?? "",
    bannerFileId,
    bannerUrl,
    ctaLabel: (doc.cta_label as string | null | undefined) ?? null,
    ctaUrl: (doc.cta_url as string | null | undefined) ?? null,
    publishedAt: (doc.published_at as string | undefined) ?? ((doc.$createdAt as string | undefined) ?? ""),
    isPublished: Boolean(doc.is_published),
    createdBy: (doc.created_by as string | null | undefined) ?? null,
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

async function uploadBanner(file: File): Promise<{ fileId: string | null; error: Error | null }> {
  const bucketId = getNoticeBucketId();
  if (!storage || !bucketId) {
    return { fileId: null, error: new Error("Bucket de banners não configurado") };
  }
  try {
    const uploaded = await storage.createFile(bucketId, ID.unique(), file);
    return { fileId: uploaded.$id, error: null };
  } catch (error) {
    return { fileId: null, error: error as Error };
  }
}

async function deleteBannerFile(fileId: string | null | undefined): Promise<void> {
  const bucketId = getNoticeBucketId();
  if (!fileId || !storage || !bucketId) return;
  try {
    await storage.deleteFile(bucketId, fileId);
  } catch {
    // Banner cleanup is best effort.
  }
}

export async function listPublishedNotices(): Promise<{ data: Notice[] | null; error: Error | null }> {
  if (!isNoticesConfigured() || !DB_ID || !NOTICES_COL_ID) {
    return { data: [], error: null };
  }
  try {
    const res = await databases!.listDocuments(DB_ID, NOTICES_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.equal("is_published", [true]),
      Query.orderDesc("published_at"),
      Query.limit(100),
    ]);
    return { data: res.documents.map((doc) => toNotice(doc as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function listAllNotices(): Promise<{ data: Notice[] | null; error: Error | null }> {
  if (!isNoticesConfigured() || !DB_ID || !NOTICES_COL_ID) {
    return { data: [], error: null };
  }
  try {
    const res = await databases!.listDocuments(DB_ID, NOTICES_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.orderDesc("published_at"),
      Query.limit(200),
    ]);
    return { data: res.documents.map((doc) => toNotice(doc as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createNotice(payload: CreateNoticePayload): Promise<{ data: Notice | null; error: Error | null }> {
  if (!isNoticesConfigured() || !DB_ID || !NOTICES_COL_ID) {
    return {
      data: null,
      error: new Error("Coleção de avisos não configurada. Defina VITE_APPWRITE_NOTICES_COL_ID no .env.local."),
    };
  }

  let bannerFileId: string | null = null;
  if (payload.bannerFile) {
    const uploaded = await uploadBanner(payload.bannerFile);
    if (uploaded.error) return { data: null, error: uploaded.error };
    bannerFileId = uploaded.fileId;
  }

  try {
    const doc = await databases!.createDocument(
      DB_ID,
      NOTICES_COL_ID,
      ID.unique(),
      {
        school_id: DEFAULT_SCHOOL_ID,
        title: payload.title,
        content_md: payload.contentMd,
        banner_file_id: bannerFileId,
        cta_label: payload.ctaLabel ?? null,
        cta_url: payload.ctaUrl ?? null,
        published_at: payload.publishedAt,
        is_published: payload.isPublished,
        created_by: payload.actorUserId,
      },
    );

    return { data: toNotice(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    await deleteBannerFile(bannerFileId);
    return { data: null, error: error as Error };
  }
}

export async function updateNotice(
  noticeId: string,
  payload: UpdateNoticePayload,
): Promise<{ data: Notice | null; error: Error | null }> {
  if (!isNoticesConfigured() || !DB_ID || !NOTICES_COL_ID) {
    return {
      data: null,
      error: new Error("Coleção de avisos não configurada. Defina VITE_APPWRITE_NOTICES_COL_ID no .env.local."),
    };
  }

  let uploadedBannerId: string | null = null;
  try {
    const existing = await databases!.getDocument(DB_ID, NOTICES_COL_ID, noticeId);
    const currentBannerId = (existing.banner_file_id as string | null | undefined) ?? null;

    if (payload.bannerFile) {
      const uploaded = await uploadBanner(payload.bannerFile);
      if (uploaded.error) return { data: null, error: uploaded.error };
      uploadedBannerId = uploaded.fileId;
    }

    const nextBannerId = payload.removeBanner ? null : uploadedBannerId ?? currentBannerId;
    const updated = await databases!.updateDocument(DB_ID, NOTICES_COL_ID, noticeId, {
      title: payload.title,
      content_md: payload.contentMd,
      banner_file_id: nextBannerId,
      cta_label: payload.ctaLabel ?? null,
      cta_url: payload.ctaUrl ?? null,
      published_at: payload.publishedAt,
      is_published: payload.isPublished,
      created_by: payload.actorUserId,
    });

    if (payload.removeBanner && currentBannerId) {
      await deleteBannerFile(currentBannerId);
    } else if (uploadedBannerId && currentBannerId && uploadedBannerId !== currentBannerId) {
      await deleteBannerFile(currentBannerId);
    }

    return { data: toNotice(updated as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    if (uploadedBannerId) await deleteBannerFile(uploadedBannerId);
    return { data: null, error: error as Error };
  }
}

export async function deleteNotice(noticeId: string): Promise<{ error: Error | null }> {
  if (!isNoticesConfigured() || !DB_ID || !NOTICES_COL_ID) {
    return { error: new Error("Coleção de avisos não configurada. Defina VITE_APPWRITE_NOTICES_COL_ID no .env.local.") };
  }
  try {
    const doc = await databases!.getDocument(DB_ID, NOTICES_COL_ID, noticeId);
    await databases!.deleteDocument(DB_ID, NOTICES_COL_ID, noticeId);
    const bannerFileId = (doc.banner_file_id as string | null | undefined) ?? null;
    await deleteBannerFile(bannerFileId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
