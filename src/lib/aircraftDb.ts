import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, isAppwriteConfigured, Permission, Role, AIRCRAFTS_COL_ID, ADMIN_USER_ID, storage } from "./appwrite";
import type { Aircraft } from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AIRCRAFTS_COL_ID);
}

function toAircraft(doc: Record<string, unknown>): Aircraft {
  return {
    id: doc.$id as string,
    school_id: (doc.school_id as string) ?? "",
    model_id: (doc.model_id as string) ?? "",
    registration: (doc.registration as string) ?? "",
    nickname: (doc.nickname as string | null) ?? null,
    image_url: (doc.image_url as string | null) ?? null,
    active: (doc.active as boolean) ?? true,
    created_at: (doc.$createdAt as string) ?? "",
  };
}

export async function listAircrafts(schoolId: string): Promise<Aircraft[]> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFTS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, AIRCRAFTS_COL_ID, [
    Query.equal("school_id", [schoolId]),
    Query.orderAsc("registration"),
    Query.limit(500),
  ]);
  return res.documents.map((d) => toAircraft(d as Record<string, unknown>));
}

export async function createAircraft(data: {
  school_id: string;
  model_id: string;
  registration: string;
  nickname?: string;
  image_url?: string;
  active?: boolean;
}): Promise<Aircraft> {
  if (!databases || !DB_ID || !AIRCRAFTS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.createDocument(
    DB_ID,
    AIRCRAFTS_COL_ID,
    ID.unique(),
    {
      school_id: data.school_id,
      model_id: data.model_id,
      registration: data.registration.toUpperCase(),
      nickname: data.nickname ?? null,
      image_url: data.image_url ?? null,
      active: data.active ?? true,
    },
    [
      Permission.read(Role.user(ADMIN_USER_ID!)),
      Permission.read(Role.label("admin")),
      Permission.read(Role.label("instrutor")),
      Permission.update(Role.user(ADMIN_USER_ID!)),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.user(ADMIN_USER_ID!)),
      Permission.delete(Role.label("admin")),
    ],
  );
  return toAircraft(doc as unknown as Record<string, unknown>);
}

export async function updateAircraft(
  id: string,
  data: Partial<{ model_id: string; registration: string; nickname: string | null; image_url: string | null; active: boolean }>,
): Promise<Aircraft> {
  if (!databases || !DB_ID || !AIRCRAFTS_COL_ID) throw new Error("Appwrite não configurado");
  const payload = { ...data };
  if (payload.registration) payload.registration = payload.registration.toUpperCase();
  const doc = await databases.updateDocument(DB_ID, AIRCRAFTS_COL_ID, id, payload);
  return toAircraft(doc as unknown as Record<string, unknown>);
}

export async function toggleAircraftActive(id: string, active: boolean): Promise<Aircraft> {
  return updateAircraft(id, { active });
}

export async function uploadAircraftPhoto(file: File): Promise<string> {
  if (!storage || !BUCKET_ID) throw new Error("Bucket de arquivos não configurado");
  const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file);
  return storage.getFileView(BUCKET_ID, uploaded.$id).toString();
}
