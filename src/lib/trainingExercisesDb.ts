import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  DEFAULT_SCHOOL_ID,
  TRAINING_EXERCISES_COL_ID,
} from "./appwrite";
import type { TrainingExercise, TrainingExerciseInput } from "../types/trainingExercise";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isTrainingExercisesConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && TRAINING_EXERCISES_COL_ID);
}

function asNullableString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toTrainingExercise(doc: Record<string, unknown>): TrainingExercise {
  return {
    id: doc.$id as string,
    schoolId: asNullableString(doc.school_id) || DEFAULT_SCHOOL_ID,
    title: asNullableString(doc.title),
    acceptableProficiency: asNullableString(doc.acceptable_proficiency),
    order: typeof doc.order === "number" && Number.isFinite(doc.order) ? doc.order : 0,
    isActive: Boolean(doc.is_active),
    createdAt: asNullableString(doc.$createdAt),
    updatedAt: asNullableString(doc.$updatedAt),
  };
}

function toPayload(input: TrainingExerciseInput): Record<string, unknown> {
  return {
    school_id: input.schoolId || DEFAULT_SCHOOL_ID,
    title: input.title,
    acceptable_proficiency: input.acceptableProficiency,
    order: input.order,
    is_active: input.isActive,
  };
}

export async function listTrainingExercises(options?: {
  includeInactive?: boolean;
  schoolId?: string;
}): Promise<{ data: TrainingExercise[]; error: Error | null }> {
  if (!isTrainingExercisesConfigured() || !databases || !DB_ID || !TRAINING_EXERCISES_COL_ID) {
    return { data: [], error: null };
  }

  try {
    const schoolId = options?.schoolId ?? DEFAULT_SCHOOL_ID;
    const queries = [
      Query.equal("school_id", [schoolId]),
      Query.orderAsc("order"),
      Query.limit(300),
    ];
    if (!options?.includeInactive) queries.splice(1, 0, Query.equal("is_active", [true]));
    const res = await databases.listDocuments(DB_ID, TRAINING_EXERCISES_COL_ID, queries);
    return { data: res.documents.map((doc) => toTrainingExercise(doc as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function createTrainingExercise(
  input: TrainingExerciseInput,
): Promise<{ data: TrainingExercise | null; error: Error | null }> {
  if (!isTrainingExercisesConfigured() || !databases || !DB_ID || !TRAINING_EXERCISES_COL_ID) {
    return { data: null, error: new Error("Coleção de critérios não configurada.") };
  }

  try {
    const doc = await databases.createDocument(DB_ID, TRAINING_EXERCISES_COL_ID, ID.unique(), toPayload(input));
    return { data: toTrainingExercise(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateTrainingExercise(
  exerciseId: string,
  input: TrainingExerciseInput,
): Promise<{ data: TrainingExercise | null; error: Error | null }> {
  if (!isTrainingExercisesConfigured() || !databases || !DB_ID || !TRAINING_EXERCISES_COL_ID) {
    return { data: null, error: new Error("Coleção de critérios não configurada.") };
  }

  try {
    const doc = await databases.updateDocument(DB_ID, TRAINING_EXERCISES_COL_ID, exerciseId, toPayload(input));
    return { data: toTrainingExercise(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteTrainingExercise(exerciseId: string): Promise<{ error: Error | null }> {
  if (!isTrainingExercisesConfigured() || !databases || !DB_ID || !TRAINING_EXERCISES_COL_ID) {
    return { error: new Error("Coleção de critérios não configurada.") };
  }

  try {
    await databases.deleteDocument(DB_ID, TRAINING_EXERCISES_COL_ID, exerciseId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
