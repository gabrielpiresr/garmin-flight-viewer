import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID);
}

// Appwrite document permissions: read, update, delete, write (no "create")
function adminScopedPermissions(): string[] {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

export type AircraftHorimeterCorrection = {
  id: string;
  aircraft_id: string;
  school_id: string;
  /** ISO datetime — momento em que o horímetro foi lido */
  corrected_at: string;
  /** Valor do horímetro (TTAF) naquele momento */
  ttaf_value: number;
  notes: string | null;
  created_at: string;
};

function toCorrection(doc: Record<string, unknown>): AircraftHorimeterCorrection {
  return {
    id: doc.$id as string,
    aircraft_id: doc.aircraft_id as string,
    school_id: (doc.school_id as string) ?? "",
    corrected_at: doc.corrected_at as string,
    ttaf_value: doc.ttaf_value as number,
    notes: (doc.notes as string | null | undefined) ?? null,
    created_at: (doc.$createdAt as string) ?? "",
  };
}

export async function listAircraftHorimeterCorrections(schoolId: string): Promise<AircraftHorimeterCorrection[]> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID, [
    Query.equal("school_id", [schoolId]),
    Query.orderDesc("corrected_at"),
    Query.limit(500),
  ]);
  return res.documents.map((d) => toCorrection(d as Record<string, unknown>));
}

export async function createAircraftHorimeterCorrection(data: {
  aircraft_id: string;
  school_id: string;
  corrected_at: string;
  ttaf_value: number;
  notes?: string | null;
}): Promise<AircraftHorimeterCorrection> {
  if (!databases || !DB_ID || !AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.createDocument(
    DB_ID,
    AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID,
    ID.unique(),
    {
      aircraft_id: data.aircraft_id,
      school_id: data.school_id,
      corrected_at: data.corrected_at,
      ttaf_value: data.ttaf_value,
      notes: data.notes ?? null,
    },
    adminScopedPermissions(),
  );
  return toCorrection(doc as unknown as Record<string, unknown>);
}

export async function updateAircraftHorimeterCorrection(
  id: string,
  data: { corrected_at: string; ttaf_value: number; notes?: string | null },
): Promise<AircraftHorimeterCorrection> {
  if (!databases || !DB_ID || !AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID, id, {
    corrected_at: data.corrected_at,
    ttaf_value: data.ttaf_value,
    notes: data.notes ?? null,
  });
  return toCorrection(doc as unknown as Record<string, unknown>);
}

export async function deleteAircraftHorimeterCorrection(id: string): Promise<void> {
  if (!databases || !DB_ID || !AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID) throw new Error("Appwrite não configurado");
  await databases.deleteDocument(DB_ID, AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID, id);
}

/**
 * Dado o baseline original da aeronave e uma lista de correções de horímetro,
 * retorna o baseline efetivo (o mais recente <= asOf).
 */
export function resolveEffectiveHoursBaseline(
  originalBaselineMs: number,
  originalTtaf: number | null,
  corrections: AircraftHorimeterCorrection[],
  asOf: number = Date.now(),
): { baselineMs: number; ttaf: number | null } {
  const latest = corrections
    .filter((c) => new Date(c.corrected_at).getTime() <= asOf)
    .sort((a, b) => new Date(b.corrected_at).getTime() - new Date(a.corrected_at).getTime())[0];

  if (!latest) return { baselineMs: originalBaselineMs, ttaf: originalTtaf };

  return {
    baselineMs: new Date(latest.corrected_at).getTime(),
    ttaf: latest.ttaf_value,
  };
}
