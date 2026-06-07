import { Query } from "appwrite";
import {
  databases,
  FLIGHT_MANEUVERS_COL_ID,
  FLIGHT_MANEUVER_REVIEWS_COL_ID,
  ID,
  isAppwriteConfigured,
} from "./appwrite";
import type {
  AnalysisResult,
  FlightManeuver,
  FlightManeuverReview,
  FlightManeuverStatus,
  ReviewStatus,
} from "../types/flightReview";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isManeuversReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FLIGHT_MANEUVERS_COL_ID);
}

function isReviewsReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FLIGHT_MANEUVER_REVIEWS_COL_ID);
}

function toManeuver(doc: Record<string, unknown>): FlightManeuver {
  let instructor_step_marks: string[] | undefined;
  try {
    if (typeof doc.step_marks_json === "string" && doc.step_marks_json) {
      instructor_step_marks = JSON.parse(doc.step_marks_json) as string[];
    }
  } catch { /* keep undefined */ }
  return {
    id: doc.$id as string,
    flight_id: (doc.flight_id as string) ?? "",
    template_id: (doc.template_id as string) ?? "",
    instructor_id: (doc.instructor_id as string) ?? "",
    student_id: (doc.student_id as string | null) ?? null,
    aircraft_ident: (doc.aircraft_ident as string | null) ?? null,
    start_time: (doc.start_time as string) ?? "",
    end_time: (doc.end_time as string) ?? "",
    status: ((doc.status as string) ?? "draft") as FlightManeuverStatus,
    ...(instructor_step_marks ? { instructor_step_marks } : {}),
    created_by: (doc.created_by as string) ?? "",
    created_at: (doc.created_at as string) ?? "",
    updated_at: (doc.updated_at as string) ?? "",
  };
}

function toReview(doc: Record<string, unknown>): FlightManeuverReview {
  let analysis: AnalysisResult = { steps: [], alerts: [] };
  try {
    if (typeof doc.analysis_json === "string") {
      analysis = JSON.parse(doc.analysis_json) as AnalysisResult;
    }
  } catch {
    // keep empty analysis
  }
  return {
    id: doc.$id as string,
    flight_maneuver_id: (doc.flight_maneuver_id as string) ?? "",
    flight_id: (doc.flight_id as string) ?? "",
    status: ((doc.status as string) ?? "unavailable") as ReviewStatus,
    summary: (doc.summary as string | null) ?? null,
    analysis,
    created_at: (doc.created_at as string) ?? "",
    updated_at: (doc.updated_at as string) ?? "",
  };
}

function stripDataPoints(analysis: AnalysisResult): AnalysisResult {
  return {
    ...analysis,
    steps: analysis.steps.map((s) => ({
      ...s,
      parameters: s.parameters.map((p) => ({ ...p, data_points: [] })),
    })),
  };
}


export async function listFlightManeuvers(flightId: string): Promise<FlightManeuver[]> {
  if (!flightId || !isManeuversReady()) return [];
  const res = await databases!.listDocuments(DB_ID, FLIGHT_MANEUVERS_COL_ID!, [
    Query.equal("flight_id", flightId),
    Query.orderAsc("start_time"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => toManeuver(d as Record<string, unknown>));
}

export async function createFlightManeuver(
  data: Omit<FlightManeuver, "id" | "created_at" | "updated_at">,
): Promise<FlightManeuver> {
  if (!isManeuversReady()) throw new Error("Appwrite not configured");
  const now = new Date().toISOString();
  const doc = await databases!.createDocument(
    DB_ID,
    FLIGHT_MANEUVERS_COL_ID!,
    ID.unique(),
    {
      flight_id: data.flight_id,
      template_id: data.template_id,
      instructor_id: data.instructor_id,
      student_id: data.student_id ?? null,
      aircraft_ident: data.aircraft_ident ?? null,
      start_time: data.start_time,
      end_time: data.end_time,
      status: data.status,
      created_by: data.created_by,
      created_at: now,
      updated_at: now,
    },
  );
  return toManeuver(doc as Record<string, unknown>);
}

export async function updateFlightManeuver(
  id: string,
  data: Partial<Omit<FlightManeuver, "id" | "flight_id" | "created_at" | "created_by">>,
): Promise<FlightManeuver> {
  if (!isManeuversReady()) throw new Error("Appwrite not configured");
  const { instructor_step_marks, ...rest } = data;
  const payload: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
  if (instructor_step_marks !== undefined) {
    payload.step_marks_json = instructor_step_marks.length > 0
      ? JSON.stringify(instructor_step_marks)
      : null;
  }
  const doc = await databases!.updateDocument(DB_ID, FLIGHT_MANEUVERS_COL_ID!, id, payload);
  return toManeuver(doc as Record<string, unknown>);
}

export async function deleteFlightManeuver(id: string): Promise<void> {
  if (!isManeuversReady()) throw new Error("Appwrite not configured");
  await databases!.deleteDocument(DB_ID, FLIGHT_MANEUVERS_COL_ID!, id);
}

// ---------- Reviews ----------

export async function getFlightManeuverReview(flightManeuverAdId: string): Promise<FlightManeuverReview | null> {
  if (!flightManeuverAdId || !isReviewsReady()) return null;
  try {
    const res = await databases!.listDocuments(DB_ID, FLIGHT_MANEUVER_REVIEWS_COL_ID!, [
      Query.equal("flight_maneuver_id", flightManeuverAdId),
      Query.limit(1),
    ]);
    if (res.documents.length === 0) return null;
    return toReview(res.documents[0] as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listFlightManeuverReviews(flightId: string): Promise<FlightManeuverReview[]> {
  if (!flightId || !isReviewsReady()) return [];
  const res = await databases!.listDocuments(DB_ID, FLIGHT_MANEUVER_REVIEWS_COL_ID!, [
    Query.equal("flight_id", flightId),
    Query.limit(100),
  ]);
  return res.documents.map((d) => toReview(d as Record<string, unknown>));
}

export async function upsertFlightManeuverReview(data: {
  flight_maneuver_id: string;
  flight_id: string;
  status: ReviewStatus;
  summary: string | null;
  analysis: AnalysisResult;
  existing_id?: string;
}): Promise<FlightManeuverReview> {
  if (!isReviewsReady()) throw new Error("Appwrite not configured");
  const now = new Date().toISOString();
  const payload = {
    flight_maneuver_id: data.flight_maneuver_id,
    flight_id: data.flight_id,
    status: data.status,
    analysis_json: JSON.stringify(stripDataPoints(data.analysis)),
    updated_at: now,
  };
  if (data.existing_id) {
    const doc = await databases!.updateDocument(DB_ID, FLIGHT_MANEUVER_REVIEWS_COL_ID!, data.existing_id, payload);
    return toReview(doc as Record<string, unknown>);
  }
  const doc = await databases!.createDocument(DB_ID, FLIGHT_MANEUVER_REVIEWS_COL_ID!, ID.unique(), {
    ...payload,
    created_at: now,
  });
  return toReview(doc as Record<string, unknown>);
}
