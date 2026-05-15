import { Query } from "appwrite";
import {
  ADMIN_USERS_FUNCTION_ID,
  databases,
  functions,
  ID,
  isAppwriteConfigured,
  MANEUVERS_ARTICLES_COL_ID,
  MANEUVERS_MEDIA_BUCKET_ID,
  Permission,
  Role,
  MANEUVERS_SECTIONS_COL_ID,
  MANEUVERS_SUBSECTIONS_COL_ID,
  SCHOOL_ID,
  storage,
} from "./appwrite";

const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";
import type {
  ManeuverArticle,
  ManeuverArticlePayload,
  ManeuverCatalog,
  ManeuverMediaUpload,
  ManeuverRichContent,
  ManeuverSection,
  ManeuverSectionPayload,
  ManeuverSubsection,
  ManeuverSubsectionPayload,
} from "../types/maneuver";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

type PrivilegedManeuverResponse = {
  document?: Record<string, unknown>;
  message?: string;
};

function isManeuversConfigured(): boolean {
  return Boolean(
    isAppwriteConfigured &&
      databases &&
      DB_ID &&
      MANEUVERS_SECTIONS_COL_ID &&
      MANEUVERS_SUBSECTIONS_COL_ID &&
      MANEUVERS_ARTICLES_COL_ID,
  );
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSection(doc: Record<string, unknown>): ManeuverSection {
  return {
    id: doc.$id as string,
    title: (doc.title as string | undefined) ?? "",
    description: asNullableString(doc.description),
    order: (doc.order as number | undefined) ?? 0,
    isPublished: Boolean(doc.is_published),
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

function toSubsection(doc: Record<string, unknown>): ManeuverSubsection {
  return {
    id: doc.$id as string,
    sectionId: (doc.section_id as string | undefined) ?? "",
    title: (doc.title as string | undefined) ?? "",
    description: asNullableString(doc.description),
    order: (doc.order as number | undefined) ?? 0,
    isPublished: Boolean(doc.is_published),
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

function toArticle(doc: Record<string, unknown>): ManeuverArticle {
  return {
    id: doc.$id as string,
    sectionId: (doc.section_id as string | undefined) ?? "",
    subsectionId: asNullableString(doc.subsection_id),
    title: (doc.title as string | undefined) ?? "",
    summary: asNullableString(doc.summary),
    contentJson: parseJson<ManeuverRichContent>(doc.content_json, { type: "doc", content: [] }),
    contentHtml: (doc.content_html as string | undefined) ?? "",
    plainText: (doc.plain_text as string | undefined) ?? "",
    tags: parseJson<string[]>(doc.tags_json, []),
    order: (doc.order as number | undefined) ?? 0,
    sourcePageStart: asNullableNumber(doc.source_page_start),
    sourcePageEnd: asNullableNumber(doc.source_page_end),
    isPublished: Boolean(doc.is_published),
    createdBy: asNullableString(doc.created_by),
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

function articlePayload(payload: ManeuverArticlePayload): Record<string, unknown> {
  return {
    section_id: payload.sectionId,
    subsection_id: payload.subsectionId ?? null,
    title: payload.title,
    summary: payload.summary ?? null,
    content_json: JSON.stringify(payload.contentJson ?? { type: "doc", content: [] }),
    content_html: payload.contentHtml,
    plain_text: payload.plainText,
    tags_json: JSON.stringify(payload.tags ?? []),
    order: payload.order,
    source_page_start: payload.sourcePageStart ?? null,
    source_page_end: payload.sourcePageEnd ?? null,
    is_published: payload.isPublished,
    created_by: payload.actorUserId ?? null,
  };
}

function parseFunctionResponse(body: string | undefined): PrivilegedManeuverResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as PrivilegedManeuverResponse;
  } catch {
    return {};
  }
}

async function executePrivilegedManeuver(payload: Record<string, unknown>): Promise<PrivilegedManeuverResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada para salvar manobras.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseFunctionResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao salvar manobra pela função administrativa.");
  }
  return response;
}

function canUsePrivilegedManeuverExecutor(): boolean {
  return Boolean(functions && ADMIN_USERS_FUNCTION_ID);
}

export async function listManeuverCatalog(includeDrafts = false): Promise<{ data: ManeuverCatalog; error: Error | null }> {
  const empty: ManeuverCatalog = { sections: [], subsections: [], articles: [] };
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SECTIONS_COL_ID || !MANEUVERS_SUBSECTIONS_COL_ID || !MANEUVERS_ARTICLES_COL_ID) {
    return { data: empty, error: null };
  }

  try {
    const schoolFilter = Query.equal("school_id", [DEFAULT_SCHOOL_ID]);
    const publishedFilter = includeDrafts ? [] : [Query.equal("is_published", [true])];
    const [sectionsRes, subsectionsRes, articlesRes] = await Promise.all([
      databases.listDocuments(DB_ID, MANEUVERS_SECTIONS_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(100)]),
      databases.listDocuments(DB_ID, MANEUVERS_SUBSECTIONS_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(300)]),
      databases.listDocuments(DB_ID, MANEUVERS_ARTICLES_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(300)]),
    ]);
    return {
      data: {
        sections: sectionsRes.documents.map((doc) => toSection(doc as Record<string, unknown>)),
        subsections: subsectionsRes.documents.map((doc) => toSubsection(doc as Record<string, unknown>)),
        articles: articlesRes.documents.map((doc) => toArticle(doc as Record<string, unknown>)),
      },
      error: null,
    };
  } catch (error) {
    return { data: empty, error: error as Error };
  }
}

export async function createManeuverSection(payload: ManeuverSectionPayload): Promise<{ data: ManeuverSection | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de seções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({
        action: "createManeuverSection",
        data: {
          school_id: DEFAULT_SCHOOL_ID,
          title: payload.title,
          description: payload.description ?? null,
          order: payload.order,
          is_published: payload.isPublished,
        },
      });
      if (response.document) return { data: toSection(response.document), error: null };
    }
    const doc = await databases.createDocument(DB_ID, MANEUVERS_SECTIONS_COL_ID, ID.unique(), {
      school_id: DEFAULT_SCHOOL_ID,
      title: payload.title,
      description: payload.description ?? null,
      order: payload.order,
      is_published: payload.isPublished,
    });
    return { data: toSection(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateManeuverSection(sectionId: string, payload: ManeuverSectionPayload): Promise<{ data: ManeuverSection | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de seções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({
        action: "updateManeuverSection",
        documentId: sectionId,
        data: {
          title: payload.title,
          description: payload.description ?? null,
          order: payload.order,
          is_published: payload.isPublished,
        },
      });
      if (response.document) return { data: toSection(response.document), error: null };
    }
    const doc = await databases.updateDocument(DB_ID, MANEUVERS_SECTIONS_COL_ID, sectionId, {
      title: payload.title,
      description: payload.description ?? null,
      order: payload.order,
      is_published: payload.isPublished,
    });
    return { data: toSection(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteManeuverSection(sectionId: string): Promise<{ error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SECTIONS_COL_ID) {
    return { error: new Error("Coleção de seções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      await executePrivilegedManeuver({ action: "deleteManeuverSection", documentId: sectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, MANEUVERS_SECTIONS_COL_ID, sectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createManeuverSubsection(payload: ManeuverSubsectionPayload): Promise<{ data: ManeuverSubsection | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SUBSECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de subseções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({
        action: "createManeuverSubsection",
        data: {
          school_id: DEFAULT_SCHOOL_ID,
          section_id: payload.sectionId,
          title: payload.title,
          description: payload.description ?? null,
          order: payload.order,
          is_published: payload.isPublished,
        },
      });
      if (response.document) return { data: toSubsection(response.document), error: null };
    }
    const doc = await databases.createDocument(DB_ID, MANEUVERS_SUBSECTIONS_COL_ID, ID.unique(), {
      school_id: DEFAULT_SCHOOL_ID,
      section_id: payload.sectionId,
      title: payload.title,
      description: payload.description ?? null,
      order: payload.order,
      is_published: payload.isPublished,
    });
    return { data: toSubsection(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateManeuverSubsection(subsectionId: string, payload: ManeuverSubsectionPayload): Promise<{ data: ManeuverSubsection | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SUBSECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de subseções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({
        action: "updateManeuverSubsection",
        documentId: subsectionId,
        data: {
          section_id: payload.sectionId,
          title: payload.title,
          description: payload.description ?? null,
          order: payload.order,
          is_published: payload.isPublished,
        },
      });
      if (response.document) return { data: toSubsection(response.document), error: null };
    }
    const doc = await databases.updateDocument(DB_ID, MANEUVERS_SUBSECTIONS_COL_ID, subsectionId, {
      section_id: payload.sectionId,
      title: payload.title,
      description: payload.description ?? null,
      order: payload.order,
      is_published: payload.isPublished,
    });
    return { data: toSubsection(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteManeuverSubsection(subsectionId: string): Promise<{ error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_SUBSECTIONS_COL_ID) {
    return { error: new Error("Coleção de subseções de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      await executePrivilegedManeuver({ action: "deleteManeuverSubsection", documentId: subsectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, MANEUVERS_SUBSECTIONS_COL_ID, subsectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createManeuverArticle(payload: ManeuverArticlePayload): Promise<{ data: ManeuverArticle | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_ARTICLES_COL_ID) {
    return { data: null, error: new Error("Coleção de artigos de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({ action: "createManeuverArticle", data: articlePayload(payload) });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.createDocument(DB_ID, MANEUVERS_ARTICLES_COL_ID, ID.unique(), articlePayload(payload));
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateManeuverArticle(articleId: string, payload: ManeuverArticlePayload): Promise<{ data: ManeuverArticle | null; error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_ARTICLES_COL_ID) {
    return { data: null, error: new Error("Coleção de artigos de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      const response = await executePrivilegedManeuver({
        action: "updateManeuverArticle",
        documentId: articleId,
        data: articlePayload(payload),
      });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.updateDocument(DB_ID, MANEUVERS_ARTICLES_COL_ID, articleId, articlePayload(payload));
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteManeuverArticle(articleId: string): Promise<{ error: Error | null }> {
  if (!isManeuversConfigured() || !databases || !DB_ID || !MANEUVERS_ARTICLES_COL_ID) {
    return { error: new Error("Coleção de artigos de manobras não configurada.") };
  }
  try {
    if (canUsePrivilegedManeuverExecutor()) {
      await executePrivilegedManeuver({ action: "deleteManeuverArticle", documentId: articleId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, MANEUVERS_ARTICLES_COL_ID, articleId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadManeuverMedia(file: File): Promise<{ data: ManeuverMediaUpload | null; error: Error | null }> {
  if (!storage || !MANEUVERS_MEDIA_BUCKET_ID) {
    return { data: null, error: new Error("Bucket de mídia de manobras não configurado.") };
  }
  try {
    const uploaded = await storage.createFile(MANEUVERS_MEDIA_BUCKET_ID, ID.unique(), file, [
      Permission.read(Role.any()),
    ]);
    return {
      data: {
        fileId: uploaded.$id,
        url: storage.getFileView(MANEUVERS_MEDIA_BUCKET_ID, uploaded.$id).toString(),
        name: uploaded.name,
        mimeType: uploaded.mimeType,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
