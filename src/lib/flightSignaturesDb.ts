import { Query } from "appwrite";
import { databases, FLIGHT_SIGNATURES_COL_ID, ID, isAppwriteConfigured, SCHOOL_ID } from "./appwrite";
import type { UserRole } from "./rbac";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const FLIGHTS_COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;
const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";

export type SignerRole = "student" | "instructor" | "admin_operator";

export type FlightSignatureDoc = {
  id: string;
  flight_id: string;
  signer_user_id: string;
  signer_role: SignerRole;
  signed_at: string;
  user_agent: string | null;
  content_hash: string | null;
  school_id: string;
  status: "active";
  created_at: string;
};

export type FlightSignaturesForFlight = {
  student: FlightSignatureDoc | null;
  instructor: FlightSignatureDoc | null;
  admin_operator: FlightSignatureDoc | null;
};

export type PendingAdminSignatureRow = {
  id: string;
  flight_date: string | null;
  aircraft_ident: string | null;
  student_user_id: string | null;
  instructor_user_id: string | null;
  instructor_signed: boolean;
  student_signed: boolean;
  admin_operator_signed: boolean;
  instructor_signed_at: string | null;
  deadlineStatus: "ok" | "warning" | "overdue" | "unknown";
};

function toSignatureDoc(d: Record<string, unknown> & { $id: string; $createdAt: string }): FlightSignatureDoc {
  return {
    id: d.$id,
    flight_id: d.flight_id as string,
    signer_user_id: d.signer_user_id as string,
    signer_role: d.signer_role as SignerRole,
    signed_at: d.signed_at as string,
    user_agent: (d.user_agent as string | null | undefined) ?? null,
    content_hash: (d.content_hash as string | null | undefined) ?? null,
    school_id: d.school_id as string,
    status: "active",
    created_at: d.$createdAt,
  };
}

function calcDeadlineStatus(instructorSignedAt: string | null): PendingAdminSignatureRow["deadlineStatus"] {
  if (!instructorSignedAt) return "unknown";
  const signedMs = new Date(instructorSignedAt).getTime();
  if (Number.isNaN(signedMs)) return "unknown";
  const daysElapsed = (Date.now() - signedMs) / (1000 * 60 * 60 * 24);
  const daysRemaining = 15 - daysElapsed;
  if (daysRemaining > 5) return "ok";
  if (daysRemaining > 0) return "warning";
  return "overdue";
}

async function computeContentHash(csvText: string): Promise<string | null> {
  try {
    const encoded = new TextEncoder().encode(csvText);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}


function emptySignaturesForFlight(): FlightSignaturesForFlight {
  return { student: null, instructor: null, admin_operator: null };
}

export async function listSignaturesForFlights(
  flightIds: string[],
): Promise<Map<string, FlightSignaturesForFlight>> {
  const map = new Map<string, FlightSignaturesForFlight>();
  for (const id of flightIds) {
    map.set(id, emptySignaturesForFlight());
  }
  if (!isAppwriteConfigured || !databases || !FLIGHT_SIGNATURES_COL_ID || flightIds.length === 0) {
    return map;
  }

  const chunkSize = 25;
  for (let i = 0; i < flightIds.length; i += chunkSize) {
    const chunk = flightIds.slice(i, i + chunkSize);
    try {
      const res = await databases.listDocuments(DB_ID, FLIGHT_SIGNATURES_COL_ID, [
        Query.equal("flight_id", chunk),
        Query.limit(100),
      ]);
      for (const doc of res.documents) {
        const sig = toSignatureDoc(doc as Record<string, unknown> & { $id: string; $createdAt: string });
        const current = map.get(sig.flight_id) ?? emptySignaturesForFlight();
        if (sig.signer_role === "student") current.student = sig;
        else if (sig.signer_role === "instructor") current.instructor = sig;
        else if (sig.signer_role === "admin_operator") current.admin_operator = sig;
        map.set(sig.flight_id, current);
      }
    } catch {
      // Mantém entradas vazias para o chunk com falha.
    }
  }
  return map;
}

export async function listSignaturesForFlight(
  flightId: string,
): Promise<{ data: FlightSignaturesForFlight | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !FLIGHT_SIGNATURES_COL_ID) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, FLIGHT_SIGNATURES_COL_ID, [
      Query.equal("flight_id", [flightId]),
      Query.limit(10),
    ]);
    const result: FlightSignaturesForFlight = { student: null, instructor: null, admin_operator: null };
    for (const doc of res.documents) {
      const sig = toSignatureDoc(doc as Record<string, unknown> & { $id: string; $createdAt: string });
      if (sig.signer_role === "student") result.student = sig;
      else if (sig.signer_role === "instructor") result.instructor = sig;
      else if (sig.signer_role === "admin_operator") result.admin_operator = sig;
    }
    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function signFlight(params: {
  flightId: string;
  actorUserId: string;
  actorRole: UserRole;
  signerRole: SignerRole;
  csvText: string;
}): Promise<{ data: FlightSignatureDoc | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !FLIGHT_SIGNATURES_COL_ID) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }

  // Validate role mapping
  if (params.signerRole === "student" && params.actorRole !== "aluno") {
    return { data: null, error: new Error("Papel de assinatura inválido para o seu perfil.") };
  }
  if (params.signerRole === "instructor" && params.actorRole !== "instrutor") {
    return { data: null, error: new Error("Papel de assinatura inválido para o seu perfil.") };
  }
  if (params.signerRole === "admin_operator" && params.actorRole !== "admin") {
    return { data: null, error: new Error("Papel de assinatura inválido para o seu perfil.") };
  }

  try {
    // Fetch flight to validate linkage
    const flightDoc = await databases.getDocument(DB_ID, FLIGHTS_COL_ID, params.flightId, [
      Query.select(["student_user_id", "instructor_user_id", "instructor_signed", "student_signed", "admin_operator_signed"]),
    ]);

    if (params.signerRole === "student" && flightDoc.student_user_id !== params.actorUserId) {
      return { data: null, error: new Error("Você não está vinculado a este voo como aluno.") };
    }
    if (params.signerRole === "instructor" && flightDoc.instructor_user_id !== params.actorUserId) {
      return { data: null, error: new Error("Você não está vinculado a este voo como instrutor.") };
    }

    // Check for duplicate signature
    const existing = await databases.listDocuments(DB_ID, FLIGHT_SIGNATURES_COL_ID, [
      Query.equal("flight_id", [params.flightId]),
      Query.equal("signer_role", [params.signerRole]),
      Query.limit(1),
    ]);
    if (existing.total > 0) {
      return { data: null, error: new Error("Você já assinou este voo.") };
    }

    const signedAt = new Date().toISOString();
    const contentHash = await computeContentHash(params.csvText);

    const doc = await databases.createDocument(
      DB_ID,
      FLIGHT_SIGNATURES_COL_ID,
      ID.unique(),
      {
        flight_id: params.flightId,
        signer_user_id: params.actorUserId,
        signer_role: params.signerRole,
        signed_at: signedAt,
        user_agent: navigator.userAgent.slice(0, 512),
        content_hash: contentHash,
        school_id: DEFAULT_SCHOOL_ID,
        status: "active",
      },
      [],
    );

    // Update materialized fields on the flight document
    await updateFlightSignatureMaterializedFields(params.flightId, params.signerRole, signedAt);

    return { data: toSignatureDoc(doc as Record<string, unknown> & { $id: string; $createdAt: string }), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function updateFlightSignatureMaterializedFields(
  flightId: string,
  signerRole: SignerRole,
  signedAt: string,
): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const patch: Record<string, unknown> = {};
    if (signerRole === "instructor") {
      patch.instructor_signed = true;
      patch.instructor_signed_at = signedAt;
      patch.flight_status = "Realizado";
    } else if (signerRole === "student") {
      patch.student_signed = true;
    } else if (signerRole === "admin_operator") {
      patch.admin_operator_signed = true;
    }
    await databases.updateDocument(DB_ID, FLIGHTS_COL_ID, flightId, patch);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function listFlightsPendingAdminSignature(params: {
  actorRole: UserRole;
  limit?: number;
  cursor?: string | null;
}): Promise<{ data: PendingAdminSignatureRow[] | null; error: Error | null; nextCursor: string | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado"), nextCursor: null };
  }
  if (params.actorRole !== "admin") {
    return { data: null, error: new Error("Acesso não autorizado."), nextCursor: null };
  }

  const limit = Math.min(100, Math.max(1, params.limit ?? 50));

  try {
    const queries = [
      Query.equal("admin_operator_signed", [false]),
      Query.equal("instructor_signed", [true]),
      Query.orderDesc("instructor_signed_at"),
      Query.limit(limit),
      Query.select([
        "$id",
        "flight_date",
        "aircraft_ident",
        "student_user_id",
        "instructor_user_id",
        "instructor_signed",
        "student_signed",
        "admin_operator_signed",
        "instructor_signed_at",
      ]),
    ];
    if (params.cursor) queries.push(Query.cursorAfter(params.cursor));

    const res = await databases.listDocuments(DB_ID, FLIGHTS_COL_ID, queries);

    const data: PendingAdminSignatureRow[] = res.documents.map((d) => ({
      id: d.$id,
      flight_date: (d.flight_date as string | null | undefined) ?? null,
      aircraft_ident: (d.aircraft_ident as string | null | undefined) ?? null,
      student_user_id: (d.student_user_id as string | null | undefined) ?? null,
      instructor_user_id: (d.instructor_user_id as string | null | undefined) ?? null,
      instructor_signed: Boolean(d.instructor_signed),
      student_signed: Boolean(d.student_signed),
      admin_operator_signed: Boolean(d.admin_operator_signed),
      instructor_signed_at: (d.instructor_signed_at as string | null | undefined) ?? null,
      deadlineStatus: calcDeadlineStatus((d.instructor_signed_at as string | null | undefined) ?? null),
    }));

    const nextCursor = res.documents.length === limit ? (res.documents[res.documents.length - 1]?.$id ?? null) : null;
    return { data, error: null, nextCursor };
  } catch (e) {
    return { data: null, error: e as Error, nextCursor: null };
  }
}

export async function listAllFlightsForAdminSignatures(params: {
  actorRole: UserRole;
  filter?: "pending" | "signed" | "all";
  limit?: number;
  cursor?: string | null;
}): Promise<{ data: PendingAdminSignatureRow[] | null; error: Error | null; nextCursor: string | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado"), nextCursor: null };
  }
  if (params.actorRole !== "admin") {
    return { data: null, error: new Error("Acesso não autorizado."), nextCursor: null };
  }

  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const filter = params.filter ?? "pending";

  try {
    const queries: string[] = [
      Query.equal("instructor_signed", [true]),
      Query.orderDesc("instructor_signed_at"),
      Query.limit(limit),
      Query.select([
        "$id",
        "flight_date",
        "aircraft_ident",
        "student_user_id",
        "instructor_user_id",
        "instructor_signed",
        "student_signed",
        "admin_operator_signed",
        "instructor_signed_at",
      ]),
    ];

    if (filter === "pending") {
      queries.push(Query.equal("admin_operator_signed", [false]));
    } else if (filter === "signed") {
      queries.push(Query.equal("admin_operator_signed", [true]));
    }

    if (params.cursor) queries.push(Query.cursorAfter(params.cursor));

    const res = await databases.listDocuments(DB_ID, FLIGHTS_COL_ID, queries);

    const data: PendingAdminSignatureRow[] = res.documents.map((d) => ({
      id: d.$id,
      flight_date: (d.flight_date as string | null | undefined) ?? null,
      aircraft_ident: (d.aircraft_ident as string | null | undefined) ?? null,
      student_user_id: (d.student_user_id as string | null | undefined) ?? null,
      instructor_user_id: (d.instructor_user_id as string | null | undefined) ?? null,
      instructor_signed: Boolean(d.instructor_signed),
      student_signed: Boolean(d.student_signed),
      admin_operator_signed: Boolean(d.admin_operator_signed),
      instructor_signed_at: (d.instructor_signed_at as string | null | undefined) ?? null,
      deadlineStatus: calcDeadlineStatus((d.instructor_signed_at as string | null | undefined) ?? null),
    }));

    const nextCursor = res.documents.length === limit ? (res.documents[res.documents.length - 1]?.$id ?? null) : null;
    return { data, error: null, nextCursor };
  } catch (e) {
    return { data: null, error: e as Error, nextCursor: null };
  }
}

export async function getFlightLockStatus(flightId: string): Promise<{
  locked: boolean;
  instructor_signed: boolean;
  student_signed: boolean;
  admin_operator_signed: boolean;
  error: Error | null;
}> {
  const notFound = { locked: false, instructor_signed: false, student_signed: false, admin_operator_signed: false };
  if (!isAppwriteConfigured || !databases) {
    return { ...notFound, error: new Error("Appwrite não configurado") };
  }
  try {
    const doc = await databases.getDocument(DB_ID, FLIGHTS_COL_ID, flightId, [
      Query.select(["instructor_signed", "student_signed", "admin_operator_signed"]),
    ]);
    const instructor_signed = Boolean(doc.instructor_signed);
    return {
      locked: instructor_signed,
      instructor_signed,
      student_signed: Boolean(doc.student_signed),
      admin_operator_signed: Boolean(doc.admin_operator_signed),
      error: null,
    };
  } catch (e) {
    return { ...notFound, error: e as Error };
  }
}
