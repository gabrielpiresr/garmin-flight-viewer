import { Permission, Query, Role } from "appwrite";
import {
  databases,
  DEFAULT_SCHOOL_ID,
  FLIGHT_EVALUATIONS_COL_ID,
  ID,
  isAppwriteConfigured,
} from "./appwrite";
import {
  averageFlightEvaluationScores,
  clampFlightEvaluationScore,
  FLIGHT_EVALUATION_CRITERION_KEYS,
  type FlightEvaluation,
  type FlightEvaluationCriterionKey,
  type FlightEvaluationInput,
  type FlightEvaluationScores,
} from "../types/flightEvaluation";
import { getCachedSchoolRules, getSchoolRules } from "./schoolRulesDb";
import type { FlightEvaluationRules } from "../types/flightEvaluation";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function requireDb() {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_EVALUATIONS_COL_ID) {
    throw new Error("Avaliação de voo não configurada (Appwrite / collection).");
  }
  return { databases, dbId: DB_ID, colId: FLIGHT_EVALUATIONS_COL_ID };
}

function toScores(doc: Record<string, unknown>): FlightEvaluationScores | null {
  const instruction = clampFlightEvaluationScore(doc.score_instruction);
  const safety = clampFlightEvaluationScore(doc.score_safety);
  const learning = clampFlightEvaluationScore(doc.score_learning);
  if (instruction == null || safety == null || learning == null) return null;
  return { instruction, safety, learning };
}

function toEvaluation(doc: Record<string, unknown> & { $id: string; $createdAt?: string; $updatedAt?: string }): FlightEvaluation | null {
  const scores = toScores(doc);
  if (!scores) return null;
  return {
    id: doc.$id,
    flightId: String(doc.flight_id ?? ""),
    studentUserId: String(doc.student_user_id ?? ""),
    instructorUserId: doc.instructor_user_id ? String(doc.instructor_user_id) : null,
    schoolId: String(doc.school_id ?? DEFAULT_SCHOOL_ID),
    scores,
    average: averageFlightEvaluationScores(scores),
    comment: String(doc.comment ?? ""),
    criteriaSnapshotJson: doc.criteria_snapshot_json ? String(doc.criteria_snapshot_json) : null,
    createdAt: String(doc.created_at ?? doc.$createdAt ?? ""),
    updatedAt: String(doc.updated_at ?? doc.$updatedAt ?? ""),
  };
}

function evaluationPermissions(studentUserId: string) {
  // Aluno só pode atribuir permissões dentro do próprio escopo (user/label:aluno/users).
  // Leitura ampla via Role.users(); admin/instrutor leem pela coleção + function com API key.
  return [Permission.read(Role.users()), Permission.read(Role.user(studentUserId))];
}

export async function getFlightEvaluationRules(): Promise<FlightEvaluationRules> {
  const cached = getCachedSchoolRules();
  if (cached) return cached.flightEvaluation;
  const rules = await getSchoolRules();
  return rules.flightEvaluation;
}

export async function listEvaluationsByFlightIds(flightIds: string[]): Promise<Map<string, FlightEvaluation>> {
  const map = new Map<string, FlightEvaluation>();
  const ids = [...new Set(flightIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { databases: db, dbId, colId } = requireDb();

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const page = await db.listDocuments(dbId, colId, [Query.equal("flight_id", batch), Query.limit(100)]);
    for (const doc of page.documents) {
      const evaluation = toEvaluation(doc as Record<string, unknown> & { $id: string });
      if (evaluation?.flightId) map.set(evaluation.flightId, evaluation);
    }
  }
  return map;
}

export async function listEvaluationsByStudent(studentUserId: string): Promise<Map<string, FlightEvaluation>> {
  const map = new Map<string, FlightEvaluation>();
  if (!studentUserId) return map;
  const { databases: db, dbId, colId } = requireDb();
  let cursor: string | undefined;
  for (let safety = 0; safety < 40; safety += 1) {
    const queries = [
      Query.equal("student_user_id", [studentUserId]),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await db.listDocuments(dbId, colId, queries);
    for (const doc of page.documents) {
      const evaluation = toEvaluation(doc as Record<string, unknown> & { $id: string });
      if (evaluation?.flightId) map.set(evaluation.flightId, evaluation);
    }
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1]?.$id;
    if (!cursor) break;
  }
  return map;
}

export async function getEvaluationForFlight(flightId: string): Promise<FlightEvaluation | null> {
  if (!flightId) return null;
  const map = await listEvaluationsByFlightIds([flightId]);
  return map.get(flightId) ?? null;
}

export async function submitFlightEvaluation(
  studentUserId: string,
  input: FlightEvaluationInput,
  criteriaSnapshot?: FlightEvaluationRules,
): Promise<FlightEvaluation> {
  if (!studentUserId) throw new Error("Usuário não autenticado.");
  const flightId = String(input.flightId || "").trim();
  if (!flightId) throw new Error("Voo inválido.");

  const scores: FlightEvaluationScores = {
    instruction: clampFlightEvaluationScore(input.scores.instruction) ?? 0,
    safety: clampFlightEvaluationScore(input.scores.safety) ?? 0,
    learning: clampFlightEvaluationScore(input.scores.learning) ?? 0,
  };
  for (const key of FLIGHT_EVALUATION_CRITERION_KEYS) {
    if (scores[key] < 1 || scores[key] > 5) {
      throw new Error("Informe nota de 1 a 5 em todos os critérios.");
    }
  }

  const existing = await getEvaluationForFlight(flightId);
  if (existing) throw new Error("Este voo já foi avaliado.");

  const { databases: db, dbId, colId } = requireDb();
  const now = new Date().toISOString();
  const payload = {
    flight_id: flightId,
    student_user_id: studentUserId,
    instructor_user_id: input.instructorUserId ? String(input.instructorUserId) : null,
    school_id: DEFAULT_SCHOOL_ID,
    score_instruction: scores.instruction,
    score_safety: scores.safety,
    score_learning: scores.learning,
    comment: String(input.comment ?? "").trim().slice(0, 2000),
    criteria_snapshot_json: criteriaSnapshot ? JSON.stringify(criteriaSnapshot).slice(0, 8000) : null,
    created_at: now,
    updated_at: now,
  };

  const doc = await db.createDocument(dbId, colId, ID.unique(), payload, evaluationPermissions(studentUserId));
  const evaluation = toEvaluation(doc as Record<string, unknown> & { $id: string });
  if (!evaluation) throw new Error("Falha ao salvar avaliação.");
  return evaluation;
}

export function scoreLabel(key: FlightEvaluationCriterionKey, rules?: FlightEvaluationRules): string {
  return rules?.criteria[key]?.title ?? key;
}
