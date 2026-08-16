import { Query } from "appwrite";
import {
  BUCKET_ID,
  databases,
  DEFAULT_SCHOOL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  PROVA_CATEGORIES_COL_ID,
  PROVA_QUESTIONS_COL_ID,
  PROVAS_COL_ID,
  Role,
  storage,
} from "./appwrite";
import type {
  Prova,
  ProvaBankCard,
  ProvaCategory,
  ProvaCategoryInput,
  ProvaInput,
  ProvaQuestion,
  ProvaQuestionInput,
  ProvaQuestionPayload,
  ProvaQuestionType,
  ProvaStatus,
} from "../types/provas";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && PROVAS_COL_ID && PROVA_CATEGORIES_COL_ID && PROVA_QUESTIONS_COL_ID);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parsePayload(raw: unknown): ProvaQuestionPayload {
  if (raw && typeof raw === "object") return raw as ProvaQuestionPayload;
  if (typeof raw !== "string" || !raw.trim()) return { options: [], correctOptionId: "", imageUrls: [] };
  try {
    return JSON.parse(raw) as ProvaQuestionPayload;
  } catch {
    return { options: [], correctOptionId: "", imageUrls: [] };
  }
}

function toProva(doc: Record<string, unknown>): Prova {
  const status = str(doc.status, "draft") === "published" ? "published" : "draft";
  return {
    id: str(doc.$id),
    schoolId: str(doc.school_id, DEFAULT_SCHOOL_ID),
    title: str(doc.title),
    description: str(doc.description),
    passingPercent: num(doc.passing_percent, 70),
    timeLimitHours: num(doc.time_limit_hours, 24),
    status: status as ProvaStatus,
    createdAt: str(doc.$createdAt),
    updatedAt: str(doc.$updatedAt),
  };
}

function toCategory(doc: Record<string, unknown>): ProvaCategory {
  return {
    id: str(doc.$id),
    schoolId: str(doc.school_id, DEFAULT_SCHOOL_ID),
    provaId: str(doc.prova_id),
    name: str(doc.name),
    order: num(doc.order),
    drawCount: num(doc.draw_count, 1),
  };
}

function toQuestion(doc: Record<string, unknown>): ProvaQuestion {
  const typeRaw = str(doc.type, "mc");
  const type: ProvaQuestionType = typeRaw === "map" || typeRaw === "image" ? typeRaw : "mc";
  return {
    id: str(doc.$id),
    schoolId: str(doc.school_id, DEFAULT_SCHOOL_ID),
    provaId: str(doc.prova_id),
    categoryId: str(doc.category_id),
    type,
    title: str(doc.title),
    description: str(doc.description),
    order: num(doc.order),
    payload: parsePayload(doc.payload_json),
  };
}

async function listAll(collectionId: string, queries: string[]): Promise<Record<string, unknown>[]> {
  if (!databases || !DB_ID) return [];
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await databases.listDocuments(DB_ID, collectionId, [...queries, Query.limit(limit), Query.offset(offset)]);
    out.push(...(res.documents as unknown as Record<string, unknown>[]));
    if (res.documents.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function listProvas(schoolId: string = DEFAULT_SCHOOL_ID): Promise<{ data: ProvaBankCard[]; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVAS_COL_ID) {
    return { data: [], error: new Error("Coleção de provas não configurada.") };
  }
  try {
    const provas = (await listAll(PROVAS_COL_ID, [Query.equal("school_id", schoolId), Query.orderDesc("$updatedAt")])).map(toProva);
    const categories = (await listAll(PROVA_CATEGORIES_COL_ID!, [Query.equal("school_id", schoolId)])).map(toCategory);
    const questions = (await listAll(PROVA_QUESTIONS_COL_ID!, [Query.equal("school_id", schoolId)])).map(toQuestion);
    const data = provas.map((prova) => {
      const cats = categories.filter((c) => c.provaId === prova.id);
      const qs = questions.filter((q) => q.provaId === prova.id);
      return {
        ...prova,
        categoryCount: cats.length,
        questionCount: qs.length,
        drawTotal: cats.reduce((sum, cat) => sum + Math.min(cat.drawCount, qs.filter((q) => q.categoryId === cat.id).length), 0),
      };
    });
    return { data, error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function getProva(id: string): Promise<{ data: Prova | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVAS_COL_ID) {
    return { data: null, error: new Error("Coleção de provas não configurada.") };
  }
  try {
    const doc = await databases.getDocument(DB_ID, PROVAS_COL_ID, id);
    return { data: toProva(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createProva(input: ProvaInput): Promise<{ data: Prova | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVAS_COL_ID) {
    return { data: null, error: new Error("Coleção de provas não configurada.") };
  }
  try {
    const doc = await databases.createDocument(DB_ID, PROVAS_COL_ID, ID.unique(), {
      school_id: input.schoolId || DEFAULT_SCHOOL_ID,
      title: input.title.trim(),
      description: input.description.trim(),
      passing_percent: input.passingPercent,
      time_limit_hours: input.timeLimitHours,
      status: input.status,
    });
    return { data: toProva(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateProva(id: string, input: Partial<ProvaInput>): Promise<{ data: Prova | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVAS_COL_ID) {
    return { data: null, error: new Error("Coleção de provas não configurada.") };
  }
  try {
    const data: Record<string, unknown> = {};
    if (input.title != null) data.title = input.title.trim();
    if (input.description != null) data.description = input.description.trim();
    if (input.passingPercent != null) data.passing_percent = input.passingPercent;
    if (input.timeLimitHours != null) data.time_limit_hours = input.timeLimitHours;
    if (input.status != null) data.status = input.status;
    const doc = await databases.updateDocument(DB_ID, PROVAS_COL_ID, id, data);
    return { data: toProva(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteProva(id: string): Promise<{ error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVAS_COL_ID) {
    return { error: new Error("Coleção de provas não configurada.") };
  }
  try {
    const categories = await listProvaCategories(id);
    const questions = await listProvaQuestions(id);
    await Promise.all(questions.data.map((q) => databases!.deleteDocument(DB_ID!, PROVA_QUESTIONS_COL_ID!, q.id)));
    await Promise.all(categories.data.map((c) => databases!.deleteDocument(DB_ID!, PROVA_CATEGORIES_COL_ID!, c.id)));
    await databases.deleteDocument(DB_ID, PROVAS_COL_ID, id);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function listProvaCategories(provaId: string): Promise<{ data: ProvaCategory[]; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_CATEGORIES_COL_ID) {
    return { data: [], error: new Error("Coleção de categorias não configurada.") };
  }
  try {
    const docs = await listAll(PROVA_CATEGORIES_COL_ID, [Query.equal("prova_id", provaId), Query.orderAsc("order")]);
    return { data: docs.map(toCategory), error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function createProvaCategory(input: ProvaCategoryInput): Promise<{ data: ProvaCategory | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_CATEGORIES_COL_ID) {
    return { data: null, error: new Error("Coleção de categorias não configurada.") };
  }
  try {
    const doc = await databases.createDocument(DB_ID, PROVA_CATEGORIES_COL_ID, ID.unique(), {
      school_id: input.schoolId || DEFAULT_SCHOOL_ID,
      prova_id: input.provaId,
      name: input.name.trim(),
      order: input.order,
      draw_count: Math.max(0, input.drawCount),
    });
    return { data: toCategory(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateProvaCategory(
  id: string,
  patch: Partial<Pick<ProvaCategoryInput, "name" | "order" | "drawCount">>,
): Promise<{ data: ProvaCategory | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_CATEGORIES_COL_ID) {
    return { data: null, error: new Error("Coleção de categorias não configurada.") };
  }
  try {
    const data: Record<string, unknown> = {};
    if (patch.name != null) data.name = patch.name.trim();
    if (patch.order != null) data.order = patch.order;
    if (patch.drawCount != null) data.draw_count = Math.max(0, patch.drawCount);
    const doc = await databases.updateDocument(DB_ID, PROVA_CATEGORIES_COL_ID, id, data);
    return { data: toCategory(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteProvaCategory(id: string, provaId: string): Promise<{ error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_CATEGORIES_COL_ID) {
    return { error: new Error("Coleção de categorias não configurada.") };
  }
  try {
    const questions = await listProvaQuestions(provaId, id);
    await Promise.all(questions.data.map((q) => databases!.deleteDocument(DB_ID!, PROVA_QUESTIONS_COL_ID!, q.id)));
    await databases.deleteDocument(DB_ID, PROVA_CATEGORIES_COL_ID, id);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function listProvaQuestions(
  provaId: string,
  categoryId?: string,
): Promise<{ data: ProvaQuestion[]; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_QUESTIONS_COL_ID) {
    return { data: [], error: new Error("Coleção de questões não configurada.") };
  }
  try {
    const queries = [Query.equal("prova_id", provaId), Query.orderAsc("order")];
    if (categoryId) queries.unshift(Query.equal("category_id", categoryId));
    const docs = await listAll(PROVA_QUESTIONS_COL_ID, queries);
    return { data: docs.map(toQuestion), error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function createProvaQuestion(input: ProvaQuestionInput): Promise<{ data: ProvaQuestion | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_QUESTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de questões não configurada.") };
  }
  try {
    const doc = await databases.createDocument(DB_ID, PROVA_QUESTIONS_COL_ID, ID.unique(), {
      school_id: input.schoolId || DEFAULT_SCHOOL_ID,
      prova_id: input.provaId,
      category_id: input.categoryId,
      type: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      order: input.order,
      payload_json: JSON.stringify(input.payload),
    });
    return { data: toQuestion(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateProvaQuestion(
  id: string,
  input: Partial<ProvaQuestionInput>,
): Promise<{ data: ProvaQuestion | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_QUESTIONS_COL_ID) {
    return { data: null, error: new Error("Coleção de questões não configurada.") };
  }
  try {
    const data: Record<string, unknown> = {};
    if (input.categoryId != null) data.category_id = input.categoryId;
    if (input.type != null) data.type = input.type;
    if (input.title != null) data.title = input.title.trim();
    if (input.description != null) data.description = input.description.trim();
    if (input.order != null) data.order = input.order;
    if (input.payload != null) data.payload_json = JSON.stringify(input.payload);
    const doc = await databases.updateDocument(DB_ID, PROVA_QUESTIONS_COL_ID, id, data);
    return { data: toQuestion(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteProvaQuestion(id: string): Promise<{ error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !PROVA_QUESTIONS_COL_ID) {
    return { error: new Error("Coleção de questões não configurada.") };
  }
  try {
    await databases.deleteDocument(DB_ID, PROVA_QUESTIONS_COL_ID, id);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadProvaMedia(file: File): Promise<{ data: { fileId: string; url: string } | null; error: Error | null }> {
  if (!storage || !BUCKET_ID) {
    return { data: null, error: new Error("Bucket de arquivos não configurado.") };
  }
  try {
    const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, [
      Permission.read(Role.any()),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ]);
    return {
      data: {
        fileId: uploaded.$id,
        url: storage.getFileView(BUCKET_ID, uploaded.$id).toString(),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
