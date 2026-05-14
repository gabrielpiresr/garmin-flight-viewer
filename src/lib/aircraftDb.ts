import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, isAppwriteConfigured, Permission, Role, AIRCRAFTS_COL_ID, ADMIN_USER_ID, storage } from "./appwrite";
import type { Aircraft } from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AIRCRAFTS_COL_ID);
}

function adminScopedPermissions(): string[] {
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
    Permission.read(Role.label("aluno")),
    Permission.read(Role.users()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];

  if (ADMIN_USER_ID) {
    permissions.push(
      Permission.read(Role.user(ADMIN_USER_ID)),
      Permission.update(Role.user(ADMIN_USER_ID)),
      Permission.delete(Role.user(ADMIN_USER_ID)),
    );
  }

  return Array.from(new Set(permissions));
}

function aircraftPhotoPermissions(): string[] {
  return Array.from(
    new Set([
      Permission.read(Role.any()),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
      ...(ADMIN_USER_ID
        ? [Permission.update(Role.user(ADMIN_USER_ID)), Permission.delete(Role.user(ADMIN_USER_ID))]
        : []),
    ]),
  );
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
    wb_empty_weight_kg: (doc.wb_empty_weight_kg as number | null | undefined) ?? null,
    wb_empty_arm_mm: (doc.wb_empty_arm_mm as number | null | undefined) ?? null,
    wb_occupants_arm_mm: (doc.wb_occupants_arm_mm as number | null | undefined) ?? null,
    wb_occupants_max_kg: (doc.wb_occupants_max_kg as number | null | undefined) ?? null,
    wb_baggage_arm_mm: (doc.wb_baggage_arm_mm as number | null | undefined) ?? null,
    wb_baggage_max_kg: (doc.wb_baggage_max_kg as number | null | undefined) ?? null,
    wb_fuel_arm_mm: (doc.wb_fuel_arm_mm as number | null | undefined) ?? null,
    wb_fuel_max_kg: (doc.wb_fuel_max_kg as number | null | undefined) ?? null,
    wb_fuel_density_kg_l: (doc.wb_fuel_density_kg_l as number | null | undefined) ?? null,
    wb_max_weight_kg: (doc.wb_max_weight_kg as number | null | undefined) ?? null,
    wb_arm_min_mm: (doc.wb_arm_min_mm as number | null | undefined) ?? null,
    wb_arm_max_mm: (doc.wb_arm_max_mm as number | null | undefined) ?? null,
    created_at: (doc.$createdAt as string) ?? "",
  };
}

type AircraftWeightBalanceData = Partial<{
  wb_empty_weight_kg: number | null;
  wb_empty_arm_mm: number | null;
  wb_occupants_arm_mm: number | null;
  wb_occupants_max_kg: number | null;
  wb_baggage_arm_mm: number | null;
  wb_baggage_max_kg: number | null;
  wb_fuel_arm_mm: number | null;
  wb_fuel_max_kg: number | null;
  wb_fuel_density_kg_l: number | null;
  wb_max_weight_kg: number | null;
  wb_arm_min_mm: number | null;
  wb_arm_max_mm: number | null;
}>;

export async function listAircrafts(schoolId: string): Promise<Aircraft[]> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFTS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, AIRCRAFTS_COL_ID, [
    Query.equal("school_id", [schoolId]),
    Query.orderAsc("registration"),
    Query.limit(500),
  ]);
  return res.documents.map((d) => toAircraft(d as Record<string, unknown>));
}

export async function getAircraftByRegistration(registration: string, schoolId: string): Promise<Aircraft | null> {
  const normalized = registration.trim().toUpperCase();
  if (!normalized || !isReady() || !databases || !DB_ID || !AIRCRAFTS_COL_ID) return null;
  const queries = [
    Query.equal("registration", [normalized]),
    Query.limit(1),
  ];
  if (schoolId) queries.unshift(Query.equal("school_id", [schoolId]));
  const res = await databases.listDocuments(DB_ID, AIRCRAFTS_COL_ID, queries);
  const doc = res.documents[0];
  return doc ? toAircraft(doc as unknown as Record<string, unknown>) : null;
}

export async function createAircraft(data: {
  school_id: string;
  model_id: string;
  registration: string;
  nickname?: string;
  image_url?: string;
  active?: boolean;
} & AircraftWeightBalanceData): Promise<Aircraft> {
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
      wb_empty_weight_kg: data.wb_empty_weight_kg ?? null,
      wb_empty_arm_mm: data.wb_empty_arm_mm ?? null,
      wb_occupants_arm_mm: data.wb_occupants_arm_mm ?? null,
      wb_occupants_max_kg: data.wb_occupants_max_kg ?? null,
      wb_baggage_arm_mm: data.wb_baggage_arm_mm ?? null,
      wb_baggage_max_kg: data.wb_baggage_max_kg ?? null,
      wb_fuel_arm_mm: data.wb_fuel_arm_mm ?? null,
      wb_fuel_max_kg: data.wb_fuel_max_kg ?? null,
      wb_fuel_density_kg_l: data.wb_fuel_density_kg_l ?? null,
      wb_max_weight_kg: data.wb_max_weight_kg ?? null,
      wb_arm_min_mm: data.wb_arm_min_mm ?? null,
      wb_arm_max_mm: data.wb_arm_max_mm ?? null,
    },
    adminScopedPermissions(),
  );
  return toAircraft(doc as unknown as Record<string, unknown>);
}

export async function updateAircraft(
  id: string,
  data: Partial<{ model_id: string; registration: string; nickname: string | null; image_url: string | null; active: boolean }> & AircraftWeightBalanceData,
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
  const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, aircraftPhotoPermissions());
  return storage.getFileView(BUCKET_ID, uploaded.$id).toString();
}
