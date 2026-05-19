import { Query } from "appwrite";
import {
  ADMIN_USERS_FUNCTION_ID,
  databases,
  functions,
  HELP_ARTICLES_COL_ID,
  HELP_MEDIA_BUCKET_ID,
  HELP_SECTIONS_COL_ID,
  HELP_SUBSECTIONS_COL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  SCHOOL_ID,
  storage,
} from "./appwrite";
import type {
  HelpArticle,
  HelpArticlePayload,
  HelpCatalog,
  HelpMediaUpload,
  HelpRichContent,
  HelpSection,
  HelpSectionPayload,
  HelpSubsection,
  HelpSubsectionPayload,
} from "../types/helpCenter";

const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

type PrivilegedHelpResponse = {
  document?: Record<string, unknown>;
  message?: string;
};

function isHelpCenterConfigured(): boolean {
  return Boolean(
    isAppwriteConfigured &&
      databases &&
      DB_ID &&
      HELP_SECTIONS_COL_ID &&
      HELP_SUBSECTIONS_COL_ID &&
      HELP_ARTICLES_COL_ID,
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

function toSection(doc: Record<string, unknown>): HelpSection {
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

function toSubsection(doc: Record<string, unknown>): HelpSubsection {
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

function toArticle(doc: Record<string, unknown>): HelpArticle {
  return {
    id: doc.$id as string,
    sectionId: (doc.section_id as string | undefined) ?? "",
    subsectionId: asNullableString(doc.subsection_id),
    title: (doc.title as string | undefined) ?? "",
    summary: asNullableString(doc.summary),
    contentJson: parseJson<HelpRichContent>(doc.content_json, { type: "doc", content: [] }),
    contentHtml: (doc.content_html as string | undefined) ?? "",
    plainText: (doc.plain_text as string | undefined) ?? "",
    tags: parseJson<string[]>(doc.tags_json, []),
    order: (doc.order as number | undefined) ?? 0,
    isPublished: Boolean(doc.is_published),
    createdBy: asNullableString(doc.created_by),
    createdAt: (doc.$createdAt as string | undefined) ?? "",
    updatedAt: (doc.$updatedAt as string | undefined) ?? "",
  };
}

function articlePayload(payload: HelpArticlePayload): Record<string, unknown> {
  return {
    school_id: DEFAULT_SCHOOL_ID,
    section_id: payload.sectionId,
    subsection_id: payload.subsectionId ?? null,
    title: payload.title,
    summary: payload.summary ?? null,
    content_json: JSON.stringify(payload.contentJson ?? { type: "doc", content: [] }),
    content_html: payload.contentHtml,
    plain_text: payload.plainText,
    tags_json: JSON.stringify(payload.tags ?? []),
    order: payload.order,
    is_published: payload.isPublished,
    created_by: payload.actorUserId ?? null,
  };
}

function parseFunctionResponse(body: string | undefined): PrivilegedHelpResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as PrivilegedHelpResponse;
  } catch {
    return {};
  }
}

async function executePrivilegedHelp(payload: Record<string, unknown>): Promise<PrivilegedHelpResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada para salvar a central de ajuda.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseFunctionResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao salvar central de ajuda pela função administrativa.");
  }
  return response;
}

function canUsePrivilegedHelpExecutor(): boolean {
  return Boolean(functions && ADMIN_USERS_FUNCTION_ID);
}

export async function listHelpCatalog(includeDrafts = false): Promise<{ data: HelpCatalog; error: Error | null }> {
  const empty: HelpCatalog = { sections: [], subsections: [], articles: [] };
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SECTIONS_COL_ID || !HELP_SUBSECTIONS_COL_ID || !HELP_ARTICLES_COL_ID) {
    return { data: empty, error: null };
  }

  try {
    const schoolFilter = Query.equal("school_id", [DEFAULT_SCHOOL_ID]);
    const publishedFilter = includeDrafts ? [] : [Query.equal("is_published", [true])];
    const [sectionsRes, subsectionsRes, articlesRes] = await Promise.all([
      databases.listDocuments(DB_ID, HELP_SECTIONS_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(100)]),
      databases.listDocuments(DB_ID, HELP_SUBSECTIONS_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(300)]),
      databases.listDocuments(DB_ID, HELP_ARTICLES_COL_ID, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(500)]),
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

export async function createHelpSection(payload: HelpSectionPayload): Promise<{ data: HelpSection | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: "createHelpSection",
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
    const doc = await databases.createDocument(DB_ID, HELP_SECTIONS_COL_ID, ID.unique(), {
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

export async function updateHelpSection(sectionId: string, payload: HelpSectionPayload): Promise<{ data: HelpSection | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: "updateHelpSection",
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
    const doc = await databases.updateDocument(DB_ID, HELP_SECTIONS_COL_ID, sectionId, {
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

export async function deleteHelpSection(sectionId: string): Promise<{ error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SECTIONS_COL_ID) {
    return { error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: "deleteHelpSection", documentId: sectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, HELP_SECTIONS_COL_ID, sectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createHelpSubsection(payload: HelpSubsectionPayload): Promise<{ data: HelpSubsection | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SUBSECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: "createHelpSubsection",
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
    const doc = await databases.createDocument(DB_ID, HELP_SUBSECTIONS_COL_ID, ID.unique(), {
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

export async function updateHelpSubsection(subsectionId: string, payload: HelpSubsectionPayload): Promise<{ data: HelpSubsection | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SUBSECTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: "updateHelpSubsection",
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
    const doc = await databases.updateDocument(DB_ID, HELP_SUBSECTIONS_COL_ID, subsectionId, {
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

export async function deleteHelpSubsection(subsectionId: string): Promise<{ error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_SUBSECTIONS_COL_ID) {
    return { error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: "deleteHelpSubsection", documentId: subsectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, HELP_SUBSECTIONS_COL_ID, subsectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createHelpArticle(payload: HelpArticlePayload): Promise<{ data: HelpArticle | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_ARTICLES_COL_ID) {
    return { data: null, error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({ action: "createHelpArticle", data: articlePayload(payload) });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.createDocument(DB_ID, HELP_ARTICLES_COL_ID, ID.unique(), articlePayload(payload));
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateHelpArticle(articleId: string, payload: HelpArticlePayload): Promise<{ data: HelpArticle | null; error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_ARTICLES_COL_ID) {
    return { data: null, error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: "updateHelpArticle",
        documentId: articleId,
        data: articlePayload(payload),
      });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.updateDocument(DB_ID, HELP_ARTICLES_COL_ID, articleId, articlePayload(payload));
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteHelpArticle(articleId: string): Promise<{ error: Error | null }> {
  if (!isHelpCenterConfigured() || !databases || !DB_ID || !HELP_ARTICLES_COL_ID) {
    return { error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: "deleteHelpArticle", documentId: articleId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, HELP_ARTICLES_COL_ID, articleId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadHelpMedia(file: File): Promise<{ data: HelpMediaUpload | null; error: Error | null }> {
  if (!storage || !HELP_MEDIA_BUCKET_ID) {
    return { data: null, error: new Error("Bucket de mídia da central de ajuda não configurado.") };
  }
  try {
    const uploaded = await storage.createFile(HELP_MEDIA_BUCKET_ID, ID.unique(), file, [
      Permission.read(Role.any()),
    ]);
    return {
      data: {
        fileId: uploaded.$id,
        url: storage.getFileView(HELP_MEDIA_BUCKET_ID, uploaded.$id).toString(),
        name: uploaded.name,
        mimeType: uploaded.mimeType,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
