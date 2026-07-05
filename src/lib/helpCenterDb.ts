import { Query } from "appwrite";
import {
  ADMIN_USERS_FUNCTION_ID,
  databases,
  DEFAULT_SCHOOL_ID,
  functions,
  HELP_ARTICLES_COL_ID,
  HELP_MEDIA_BUCKET_ID,
  HELP_SECTIONS_COL_ID,
  HELP_SUBSECTIONS_COL_ID,
  INSTRUCTOR_HELP_ARTICLES_COL_ID,
  INSTRUCTOR_HELP_SECTIONS_COL_ID,
  ID,
  isAppwriteConfigured,
  storage,
} from "./appwrite";
import type {
  HelpArticle,
  HelpArticlePayload,
  HelpCatalog,
  HelpCenterAudience,
  HelpMediaUpload,
  HelpRichContent,
  HelpSection,
  HelpSectionPayload,
  HelpSubsection,
  HelpSubsectionPayload,
} from "../types/helpCenter";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

type HelpCollectionIds = {
  sections: string | undefined;
  subsections: string | undefined;
  articles: string | undefined;
};

type PrivilegedHelpResponse = {
  document?: Record<string, unknown>;
  message?: string;
};

function getHelpCollectionIds(audience: HelpCenterAudience): HelpCollectionIds {
  if (audience === "instructor") {
    return {
      sections: INSTRUCTOR_HELP_SECTIONS_COL_ID,
      subsections: undefined,
      articles: INSTRUCTOR_HELP_ARTICLES_COL_ID,
    };
  }
  return {
    sections: HELP_SECTIONS_COL_ID,
    subsections: HELP_SUBSECTIONS_COL_ID,
    articles: HELP_ARTICLES_COL_ID,
  };
}

function isHelpCenterConfigured(audience: HelpCenterAudience): boolean {
  const { sections, articles } = getHelpCollectionIds(audience);
  return Boolean(isAppwriteConfigured && databases && DB_ID && sections && articles);
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

function privilegedAction(
  audience: HelpCenterAudience,
  base: "createHelpSection" | "updateHelpSection" | "deleteHelpSection" | "createHelpSubsection" | "updateHelpSubsection" | "deleteHelpSubsection" | "createHelpArticle" | "updateHelpArticle" | "deleteHelpArticle",
): string {
  if (audience === "instructor") {
    return `${base}Instructor`;
  }
  return base;
}

export async function listHelpCatalog(
  includeDrafts = false,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpCatalog; error: Error | null }> {
  const empty: HelpCatalog = { sections: [], subsections: [], articles: [] };
  const { sections: sectionsColId, subsections: subsectionsColId, articles: articlesColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !sectionsColId || !articlesColId) {
    return {
      data: empty,
      error: new Error("Central de ajuda não configurada. Verifique as variáveis de ambiente no Appwrite."),
    };
  }

  try {
    const schoolFilter = Query.equal("school_id", [DEFAULT_SCHOOL_ID]);
    const publishedFilter = includeDrafts ? [] : [Query.equal("is_published", [true])];
    const [sectionsRes, articlesRes] = await Promise.all([
      databases.listDocuments(DB_ID, sectionsColId, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(100)]),
      databases.listDocuments(DB_ID, articlesColId, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(500)]),
    ]);
    let subsections: HelpSubsection[] = [];
    if (audience === "student" && subsectionsColId) {
      const subsectionsRes = await databases.listDocuments(DB_ID, subsectionsColId, [schoolFilter, ...publishedFilter, Query.orderAsc("order"), Query.limit(300)]);
      subsections = subsectionsRes.documents.map((doc) => toSubsection(doc as Record<string, unknown>));
    }
    return {
      data: {
        sections: sectionsRes.documents.map((doc) => toSection(doc as Record<string, unknown>)),
        subsections,
        articles: articlesRes.documents.map((doc) => toArticle(doc as Record<string, unknown>)),
      },
      error: null,
    };
  } catch (error) {
    return { data: empty, error: error as Error };
  }
}

export async function createHelpSection(
  payload: HelpSectionPayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpSection | null; error: Error | null }> {
  const { sections: sectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !sectionsColId) {
    return { data: null, error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: privilegedAction(audience, "createHelpSection"),
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
    const doc = await databases.createDocument(DB_ID, sectionsColId, ID.unique(), {
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

export async function updateHelpSection(
  sectionId: string,
  payload: HelpSectionPayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpSection | null; error: Error | null }> {
  const { sections: sectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !sectionsColId) {
    return { data: null, error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: privilegedAction(audience, "updateHelpSection"),
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
    const doc = await databases.updateDocument(DB_ID, sectionsColId, sectionId, {
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

export async function deleteHelpSection(
  sectionId: string,
  audience: HelpCenterAudience = "student",
): Promise<{ error: Error | null }> {
  const { sections: sectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !sectionsColId) {
    return { error: new Error("Coleção de seções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: privilegedAction(audience, "deleteHelpSection"), documentId: sectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, sectionsColId, sectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createHelpSubsection(
  payload: HelpSubsectionPayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpSubsection | null; error: Error | null }> {
  if (audience === "instructor") {
    return { data: null, error: new Error("Subseções não são usadas no manual do instrutor.") };
  }
  const { subsections: subsectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !subsectionsColId) {
    return { data: null, error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: privilegedAction(audience, "createHelpSubsection"),
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
    const doc = await databases.createDocument(DB_ID, subsectionsColId, ID.unique(), {
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

export async function updateHelpSubsection(
  subsectionId: string,
  payload: HelpSubsectionPayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpSubsection | null; error: Error | null }> {
  if (audience === "instructor") {
    return { data: null, error: new Error("Subseções não são usadas no manual do instrutor.") };
  }
  const { subsections: subsectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !subsectionsColId) {
    return { data: null, error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: privilegedAction(audience, "updateHelpSubsection"),
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
    const doc = await databases.updateDocument(DB_ID, subsectionsColId, subsectionId, {
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

export async function deleteHelpSubsection(
  subsectionId: string,
  audience: HelpCenterAudience = "student",
): Promise<{ error: Error | null }> {
  if (audience === "instructor") {
    return { error: new Error("Subseções não são usadas no manual do instrutor.") };
  }
  const { subsections: subsectionsColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !subsectionsColId) {
    return { error: new Error("Coleção de subseções da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: privilegedAction(audience, "deleteHelpSubsection"), documentId: subsectionId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, subsectionsColId, subsectionId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createHelpArticle(
  payload: HelpArticlePayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpArticle | null; error: Error | null }> {
  const { articles: articlesColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !articlesColId) {
    return { data: null, error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    const data = audience === "instructor" ? { ...articlePayload(payload), subsection_id: null } : articlePayload(payload);
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({ action: privilegedAction(audience, "createHelpArticle"), data });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.createDocument(DB_ID, articlesColId, ID.unique(), data);
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateHelpArticle(
  articleId: string,
  payload: HelpArticlePayload,
  audience: HelpCenterAudience = "student",
): Promise<{ data: HelpArticle | null; error: Error | null }> {
  const { articles: articlesColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !articlesColId) {
    return { data: null, error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    const data = audience === "instructor" ? { ...articlePayload(payload), subsection_id: null } : articlePayload(payload);
    if (canUsePrivilegedHelpExecutor()) {
      const response = await executePrivilegedHelp({
        action: privilegedAction(audience, "updateHelpArticle"),
        documentId: articleId,
        data,
      });
      if (response.document) return { data: toArticle(response.document), error: null };
    }
    const doc = await databases.updateDocument(DB_ID, articlesColId, articleId, data);
    return { data: toArticle(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteHelpArticle(
  articleId: string,
  audience: HelpCenterAudience = "student",
): Promise<{ error: Error | null }> {
  const { articles: articlesColId } = getHelpCollectionIds(audience);
  if (!isHelpCenterConfigured(audience) || !databases || !DB_ID || !articlesColId) {
    return { error: new Error("Coleção de artigos da central de ajuda não configurada.") };
  }
  try {
    if (canUsePrivilegedHelpExecutor()) {
      await executePrivilegedHelp({ action: privilegedAction(audience, "deleteHelpArticle"), documentId: articleId });
      return { error: null };
    }
    await databases.deleteDocument(DB_ID, articlesColId, articleId);
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
    const uploaded = await storage.createFile(HELP_MEDIA_BUCKET_ID, ID.unique(), file);
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
