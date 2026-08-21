import { Query } from "appwrite";
import {
  databases,
  DEFAULT_SCHOOL_ID,
  ID,
  isAppwriteConfigured,
  PROVA_JOURNEY_REQUIREMENTS_COL_ID,
} from "./appwrite";
import type { ProvaJourneyRequirement, ProvaJourneyRequirementInput } from "../types/provas";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && PROVA_JOURNEY_REQUIREMENTS_COL_ID);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toRequirement(doc: Record<string, unknown>): ProvaJourneyRequirement {
  return {
    id: str(doc.$id),
    schoolId: str(doc.school_id, DEFAULT_SCHOOL_ID),
    provaId: str(doc.prova_id),
    provaTitle: str(doc.prova_title),
    trackId: str(doc.track_id),
    trackName: str(doc.track_name),
    startMissionId: str(doc.start_mission_id),
    startMissionName: str(doc.start_mission_name),
    endMissionId: str(doc.end_mission_id),
    endMissionName: str(doc.end_mission_name),
    requiredToAdvance: Boolean(doc.required_to_advance),
    isActive: doc.is_active !== false,
    createdAt: str(doc.$createdAt),
    updatedAt: str(doc.updated_at) || str(doc.$updatedAt),
  };
}

function toPayload(input: ProvaJourneyRequirementInput): Record<string, unknown> {
  return {
    school_id: input.schoolId || DEFAULT_SCHOOL_ID,
    prova_id: input.provaId,
    prova_title: input.provaTitle.trim(),
    track_id: input.trackId,
    track_name: input.trackName.trim(),
    start_mission_id: input.startMissionId,
    start_mission_name: input.startMissionName.trim(),
    end_mission_id: input.endMissionId,
    end_mission_name: input.endMissionName.trim(),
    required_to_advance: input.requiredToAdvance,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
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

export async function listProvaJourneyRequirements(options?: {
  schoolId?: string;
  trackId?: string;
  includeInactive?: boolean;
}): Promise<{ data: ProvaJourneyRequirement[]; error: Error | null }> {
  if (!configured() || !PROVA_JOURNEY_REQUIREMENTS_COL_ID) return { data: [], error: null };
  try {
    const schoolId = options?.schoolId ?? DEFAULT_SCHOOL_ID;
    const queries = [Query.equal("school_id", schoolId), Query.orderDesc("updated_at")];
    if (options?.trackId) queries.unshift(Query.equal("track_id", options.trackId));
    if (!options?.includeInactive) queries.unshift(Query.equal("is_active", true));
    const docs = await listAll(PROVA_JOURNEY_REQUIREMENTS_COL_ID, queries);
    return { data: docs.map(toRequirement), error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function createProvaJourneyRequirement(
  input: ProvaJourneyRequirementInput,
): Promise<{ data: ProvaJourneyRequirement | null; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !PROVA_JOURNEY_REQUIREMENTS_COL_ID) {
    return { data: null, error: new Error("Coleção de vínculos da jornada não configurada.") };
  }
  try {
    const doc = await databases.createDocument(
      DB_ID,
      PROVA_JOURNEY_REQUIREMENTS_COL_ID,
      ID.unique(),
      toPayload(input),
    );
    return { data: toRequirement(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateProvaJourneyRequirement(
  id: string,
  input: ProvaJourneyRequirementInput,
): Promise<{ data: ProvaJourneyRequirement | null; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !PROVA_JOURNEY_REQUIREMENTS_COL_ID) {
    return { data: null, error: new Error("Coleção de vínculos da jornada não configurada.") };
  }
  try {
    const doc = await databases.updateDocument(DB_ID, PROVA_JOURNEY_REQUIREMENTS_COL_ID, id, toPayload(input));
    return { data: toRequirement(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteProvaJourneyRequirement(id: string): Promise<{ error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !PROVA_JOURNEY_REQUIREMENTS_COL_ID) {
    return { error: new Error("Coleção de vínculos da jornada não configurada.") };
  }
  try {
    await databases.deleteDocument(DB_ID, PROVA_JOURNEY_REQUIREMENTS_COL_ID, id);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
