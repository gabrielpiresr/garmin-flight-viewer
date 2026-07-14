import { Permission, Query, Role } from "appwrite";
import {
  databases,
  DEFAULT_SCHOOL_ID,
  FLIGHT_EVALUATION_DISMISSALS_COL_ID,
  ID,
  isAppwriteConfigured,
} from "./appwrite";
import type { SavedFlightListItem } from "./flightsDb";
import type { FlightEvaluationDismissal } from "../types/flightEvaluation";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function requireDb() {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_EVALUATION_DISMISSALS_COL_ID) {
    throw new Error("Ignorar avaliacao de voo nao configurado (Appwrite / collection).");
  }
  return { databases, dbId: DB_ID, colId: FLIGHT_EVALUATION_DISMISSALS_COL_ID };
}

function toDismissal(
  doc: Record<string, unknown> & { $id: string; $createdAt?: string; $updatedAt?: string },
): FlightEvaluationDismissal {
  return {
    id: doc.$id,
    flightId: String(doc.flight_id ?? ""),
    studentUserId: String(doc.student_user_id ?? ""),
    instructorUserId: doc.instructor_user_id ? String(doc.instructor_user_id) : null,
    schoolId: String(doc.school_id ?? DEFAULT_SCHOOL_ID),
    dismissedAt: String(doc.dismissed_at ?? doc.created_at ?? doc.$createdAt ?? ""),
    createdAt: String(doc.created_at ?? doc.$createdAt ?? ""),
    updatedAt: String(doc.updated_at ?? doc.$updatedAt ?? ""),
  };
}

function dismissalPermissions(studentUserId: string) {
  return [Permission.read(Role.users()), Permission.read(Role.user(studentUserId))];
}

export async function listEvaluationDismissalsByStudent(
  studentUserId: string,
): Promise<Map<string, FlightEvaluationDismissal>> {
  const map = new Map<string, FlightEvaluationDismissal>();
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
      const dismissal = toDismissal(doc as Record<string, unknown> & { $id: string });
      if (dismissal.flightId) map.set(dismissal.flightId, dismissal);
    }
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1]?.$id;
    if (!cursor) break;
  }
  return map;
}

export async function getEvaluationDismissalForFlight(
  studentUserId: string,
  flightId: string,
): Promise<FlightEvaluationDismissal | null> {
  const dismissals = await listEvaluationDismissalsForFlight(studentUserId, flightId);
  return dismissals[0] ?? null;
}

export async function listEvaluationDismissalsForFlight(
  studentUserId: string,
  flightId: string,
): Promise<FlightEvaluationDismissal[]> {
  if (!studentUserId || !flightId) return [];
  const { databases: db, dbId, colId } = requireDb();
  const page = await db.listDocuments(dbId, colId, [
    Query.equal("student_user_id", [studentUserId]),
    Query.equal("flight_id", [flightId]),
    Query.orderDesc("$createdAt"),
    Query.limit(10),
  ]);
  return page.documents.map((doc) => toDismissal(doc as Record<string, unknown> & { $id: string }));
}

export async function dismissFlightEvaluation(
  studentUserId: string,
  flight: Pick<SavedFlightListItem, "id" | "instructor_user_id">,
): Promise<FlightEvaluationDismissal> {
  if (!studentUserId) throw new Error("Usuario nao autenticado.");
  const flightId = String(flight.id || "").trim();
  if (!flightId) throw new Error("Voo invalido.");

  const { databases: db, dbId, colId } = requireDb();
  const now = new Date().toISOString();
  const doc = await db.createDocument(
    dbId,
    colId,
    ID.unique(),
    {
      flight_id: flightId,
      student_user_id: studentUserId,
      instructor_user_id: flight.instructor_user_id ? String(flight.instructor_user_id) : null,
      school_id: DEFAULT_SCHOOL_ID,
      dismissed_at: now,
      created_at: now,
      updated_at: now,
    },
    dismissalPermissions(studentUserId),
  );
  return toDismissal(doc as Record<string, unknown> & { $id: string });
}
