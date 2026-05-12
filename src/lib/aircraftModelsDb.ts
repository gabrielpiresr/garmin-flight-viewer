import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, AIRCRAFT_MODELS_COL_ID, ADMIN_USER_ID } from "./appwrite";
import type { AircraftModel, AircraftCategory } from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AIRCRAFT_MODELS_COL_ID);
}

function toModel(doc: Record<string, unknown>): AircraftModel {
  return {
    id: doc.$id as string,
    name: (doc.name as string) ?? "",
    manufacturer: (doc.manufacturer as string) ?? "",
    category: (doc.category as AircraftCategory) ?? "PPL",
    default_image: (doc.default_image as string | null) ?? null,
    vx_kt: (doc.vx_kt as number | null | undefined) ?? null,
    vy_kt: (doc.vy_kt as number | null | undefined) ?? null,
    vs_clean_kt: (doc.vs_clean_kt as number | null | undefined) ?? null,
    vso_kt: (doc.vso_kt as number | null | undefined) ?? null,
    white_arc_min_kt: (doc.white_arc_min_kt as number | null | undefined) ?? null,
    white_arc_max_kt: (doc.white_arc_max_kt as number | null | undefined) ?? null,
    green_arc_min_kt: (doc.green_arc_min_kt as number | null | undefined) ?? null,
    green_arc_max_kt: (doc.green_arc_max_kt as number | null | undefined) ?? null,
    yellow_arc_min_kt: (doc.yellow_arc_min_kt as number | null | undefined) ?? null,
    yellow_arc_max_kt: (doc.yellow_arc_max_kt as number | null | undefined) ?? null,
    vne_kt: (doc.vne_kt as number | null | undefined) ?? null,
    va_kt: (doc.va_kt as number | null | undefined) ?? null,
    best_glide_kt: (doc.best_glide_kt as number | null | undefined) ?? null,
    vref_flap0_kt: (doc.vref_flap0_kt as number | null | undefined) ?? null,
    vref_flap1_kt: (doc.vref_flap1_kt as number | null | undefined) ?? null,
    vref_flap2_kt: (doc.vref_flap2_kt as number | null | undefined) ?? null,
    rpm_cruise: (doc.rpm_cruise as number | null | undefined) ?? null,
    rpm_takeoff_max: (doc.rpm_takeoff_max as number | null | undefined) ?? null,
    created_at: (doc.$createdAt as string) ?? "",
  };
}

export async function listModels(): Promise<AircraftModel[]> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_MODELS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, AIRCRAFT_MODELS_COL_ID, [Query.orderAsc("name"), Query.limit(200)]);
  return res.documents.map((d) => toModel(d as Record<string, unknown>));
}

export async function createModel(data: {
  name: string;
  manufacturer: string;
  category: AircraftCategory;
  default_image?: string;
  vx_kt?: number | null;
  vy_kt?: number | null;
  vs_clean_kt?: number | null;
  vso_kt?: number | null;
  white_arc_min_kt?: number | null;
  white_arc_max_kt?: number | null;
  green_arc_min_kt?: number | null;
  green_arc_max_kt?: number | null;
  yellow_arc_min_kt?: number | null;
  yellow_arc_max_kt?: number | null;
  vne_kt?: number | null;
  va_kt?: number | null;
  best_glide_kt?: number | null;
  vref_flap0_kt?: number | null;
  vref_flap1_kt?: number | null;
  vref_flap2_kt?: number | null;
  rpm_cruise?: number | null;
  rpm_takeoff_max?: number | null;
}): Promise<AircraftModel> {
  if (!databases || !DB_ID || !AIRCRAFT_MODELS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.createDocument(
    DB_ID,
    AIRCRAFT_MODELS_COL_ID,
    ID.unique(),
    {
      name: data.name,
      manufacturer: data.manufacturer,
      category: data.category,
      default_image: data.default_image ?? null,
      vx_kt: data.vx_kt ?? null,
      vy_kt: data.vy_kt ?? null,
      vs_clean_kt: data.vs_clean_kt ?? null,
      vso_kt: data.vso_kt ?? null,
      white_arc_min_kt: data.white_arc_min_kt ?? null,
      white_arc_max_kt: data.white_arc_max_kt ?? null,
      green_arc_min_kt: data.green_arc_min_kt ?? null,
      green_arc_max_kt: data.green_arc_max_kt ?? null,
      yellow_arc_min_kt: data.yellow_arc_min_kt ?? null,
      yellow_arc_max_kt: data.yellow_arc_max_kt ?? null,
      vne_kt: data.vne_kt ?? null,
      va_kt: data.va_kt ?? null,
      best_glide_kt: data.best_glide_kt ?? null,
      vref_flap0_kt: data.vref_flap0_kt ?? null,
      vref_flap1_kt: data.vref_flap1_kt ?? null,
      vref_flap2_kt: data.vref_flap2_kt ?? null,
      rpm_cruise: data.rpm_cruise ?? null,
      rpm_takeoff_max: data.rpm_takeoff_max ?? null,
    },
    [
      Permission.read(Role.user(ADMIN_USER_ID!)),
      Permission.update(Role.user(ADMIN_USER_ID!)),
      Permission.delete(Role.user(ADMIN_USER_ID!)),
    ],
  );
  return toModel(doc as unknown as Record<string, unknown>);
}

export async function updateModel(
  id: string,
  data: Partial<{
    name: string;
    manufacturer: string;
    category: AircraftCategory;
    default_image: string | null;
    vx_kt: number | null;
    vy_kt: number | null;
    vs_clean_kt: number | null;
    vso_kt: number | null;
    white_arc_min_kt: number | null;
    white_arc_max_kt: number | null;
    green_arc_min_kt: number | null;
    green_arc_max_kt: number | null;
    yellow_arc_min_kt: number | null;
    yellow_arc_max_kt: number | null;
    vne_kt: number | null;
    va_kt: number | null;
    best_glide_kt: number | null;
    vref_flap0_kt: number | null;
    vref_flap1_kt: number | null;
    vref_flap2_kt: number | null;
    rpm_cruise: number | null;
    rpm_takeoff_max: number | null;
  }>,
): Promise<AircraftModel> {
  if (!databases || !DB_ID || !AIRCRAFT_MODELS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, AIRCRAFT_MODELS_COL_ID, id, data);
  return toModel(doc as unknown as Record<string, unknown>);
}

export async function deleteModel(id: string): Promise<void> {
  if (!databases || !DB_ID || !AIRCRAFT_MODELS_COL_ID) throw new Error("Appwrite não configurado");
  await databases.deleteDocument(DB_ID, AIRCRAFT_MODELS_COL_ID, id);
}
