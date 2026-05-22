import { Query } from "appwrite";
import { Permission, Role } from "appwrite";
import {
  databases,
  FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID,
  FLIGHT_SIGNATURES_COL_ID,
  ID,
  isAppwriteConfigured,
  DEFAULT_SCHOOL_ID,
  functions,
  SIGN_FLIGHT_FUNCTION_ID,
  STUDENT_CREDITS_COL_ID,
} from "./appwrite";
import type { UserRole } from "./rbac";
import { getInstructorCosts } from "./instructorCostsDb";
import { getAircraftByRegistration } from "./aircraftDb";
import { flightBlockMinutesFromMeta } from "./flightHours";
import { getFlightRecordMetaOnly } from "./flightsDb";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const FLIGHTS_COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;

export type SignerRole = "student" | "instructor" | "admin_operator";

export type FlightSignatureDoc = {
  id: string;
  flight_id: string;
  signer_user_id: string;
  signer_role: SignerRole;
  signed_at: string;
  user_agent: string | null;
  content_hash: string | null;
  payload_version: string | null;
  payload_hash_alg: string | null;
  payload_snapshot_json: string | null;
  reauthenticated_at: string | null;
  auth_method: string | null;
  school_id: string;
  status: "active" | "invalidated";
  invalidated_at: string | null;
  invalidated_by: string | null;
  invalidation_reason: string | null;
  invalidated_by_event_id: string | null;
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
    payload_version: (d.payload_version as string | null | undefined) ?? null,
    payload_hash_alg: (d.payload_hash_alg as string | null | undefined) ?? null,
    payload_snapshot_json: (d.payload_snapshot_json as string | null | undefined) ?? null,
    reauthenticated_at: (d.reauthenticated_at as string | null | undefined) ?? null,
    auth_method: (d.auth_method as string | null | undefined) ?? null,
    school_id: d.school_id as string,
    status: d.status === "invalidated" ? "invalidated" : "active",
    invalidated_at: (d.invalidated_at as string | null | undefined) ?? null,
    invalidated_by: (d.invalidated_by as string | null | undefined) ?? null,
    invalidation_reason: (d.invalidation_reason as string | null | undefined) ?? null,
    invalidated_by_event_id: (d.invalidated_by_event_id as string | null | undefined) ?? null,
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
        if (sig.status !== "active") continue;
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
      if (sig.status !== "active") continue;
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
  csvText?: string;
  password: string;
  userAgent?: string;
}): Promise<{ data: FlightSignatureDoc | null; error: Error | null }> {
  if (!isAppwriteConfigured || !functions || !SIGN_FLIGHT_FUNCTION_ID) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }

  try {
    const execution = await functions.createExecution(
      SIGN_FLIGHT_FUNCTION_ID,
      JSON.stringify({
        flightId: params.flightId,
        signerRole: params.signerRole,
        password: params.password,
        userAgent: params.userAgent ?? navigator.userAgent.slice(0, 512),
      }),
      false,
    );
    const raw = execution.responseBody || "{}";
    const parsed = JSON.parse(raw) as { signature?: Record<string, unknown> & { id?: string; created_at?: string }; message?: string };
    if (execution.status !== "completed" || !parsed.signature) {
      return { data: null, error: new Error(parsed.message || "Falha ao assinar o voo.") };
    }
    const sig = parsed.signature;
    const signedAt = String(sig.signed_at ?? new Date().toISOString());
    const signatureDoc = toSignatureDoc({
      ...sig,
      $id: String(sig.id ?? ""),
      $createdAt: String(sig.created_at ?? signedAt),
    } as Record<string, unknown> & { $id: string; $createdAt: string });

    if (params.signerRole === "instructor") {
      try {
        await saveInstructorPaymentSnapshot(params.flightId, params.actorUserId, signedAt);
      } catch (paymentErr) {
        return {
          data: null,
          error:
            paymentErr instanceof Error
              ? paymentErr
              : new Error("Voo assinado, mas falhou o lançamento financeiro. Contate o administrador."),
        };
      }
    }

    return { data: signatureDoc, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }

  /*
  // Legacy direct-client signing kept disabled. Signing now always runs through the sign-flight Function.
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
    const contentHash = await computeContentHash(params.csvText ?? "");

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

    // When instructor signs, the payment snapshot is mandatory — roll back the signature if it fails
    if (params.signerRole === "instructor") {
      try {
        await saveInstructorPaymentSnapshot(params.flightId, params.actorUserId, signedAt);
      } catch (snapshotErr) {
        // Roll back: remove the signature document we just created
        try {
          await databases.deleteDocument(DB_ID, FLIGHT_SIGNATURES_COL_ID!, doc.$id);
        } catch {
          // ignore rollback failure — signature may remain orphaned but payment data is missing either way
        }
        return { data: null, error: snapshotErr as Error };
      }
    }

    return { data: toSignatureDoc(doc as Record<string, unknown> & { $id: string; $createdAt: string }), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
  */
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

// ─── Student hourly rate resolution ──────────────────────────────────────────

type StudentRateSource = "model_credit" | "last_student_credit" | "last_model_credit" | "none";

type StudentRateResult = {
  hourlyRate: number;
  source: StudentRateSource;
  creditId: string | null;
};

/**
 * Resolves the effective hourly rate the student paid for flights of this
 * model + day/night type, following the fallback chain:
 *
 * 1. Student has non-expired credits for this model + type → use oldest non-expired credit's rate.
 * 2. Student has no matching credits → use rate from their most recent purchase (any model/type).
 * 3. Student has never bought anything → use rate from the most recent purchase by anyone in
 *    the school for this model + type.
 * 4. Nothing found anywhere → rate = 0, source = "none".
 */
async function resolveStudentHourlyRate(
  studentUserId: string,
  modelId: string | null,
  isNight: boolean,
): Promise<StudentRateResult> {
  if (!databases || !STUDENT_CREDITS_COL_ID || !DB_ID) {
    return { hourlyRate: 0, source: "none", creditId: null };
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  // ── 1. Student's non-expired credits for this model + type ──────────────
  if (modelId) {
    try {
      const res = await databases.listDocuments(DB_ID, STUDENT_CREDITS_COL_ID, [
        Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
        Query.equal("user_id", [studentUserId]),
        Query.equal("aircraft_model_id", [modelId]),
        Query.equal("is_night", [isNight]),
        Query.greaterThanEqual("expires_at", todayIso),
        Query.orderAsc("expires_at"),
        Query.limit(20),
      ]);
      for (const doc of res.documents) {
        const hours = Number(doc.hours ?? 0);
        const amountPaid = Number(doc.amount_paid ?? 0);
        if (hours > 0) {
          return {
            hourlyRate: amountPaid / hours,
            source: "model_credit",
            creditId: doc.$id,
          };
        }
      }
    } catch {
      // ignore query errors — fall through to next strategy
    }
  }

  // ── 2. Student's most recent purchase (any model/type) ──────────────────
  try {
    const res = await databases.listDocuments(DB_ID, STUDENT_CREDITS_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.equal("user_id", [studentUserId]),
      Query.orderDesc("purchase_date"),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    if (doc) {
      const hours = Number(doc.hours ?? 0);
      const amountPaid = Number(doc.amount_paid ?? 0);
      return {
        hourlyRate: hours > 0 ? amountPaid / hours : 0,
        source: "last_student_credit",
        creditId: doc.$id,
      };
    }
  } catch {
    // ignore — fall through
  }

  // ── 3. Most recent purchase by anyone for this model + type ─────────────
  if (modelId) {
    try {
      const res = await databases.listDocuments(DB_ID, STUDENT_CREDITS_COL_ID, [
        Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
        Query.equal("aircraft_model_id", [modelId]),
        Query.equal("is_night", [isNight]),
        Query.orderDesc("purchase_date"),
        Query.limit(1),
      ]);
      const doc = res.documents[0];
      if (doc) {
        const hours = Number(doc.hours ?? 0);
        const amountPaid = Number(doc.amount_paid ?? 0);
        return {
          hourlyRate: hours > 0 ? amountPaid / hours : 0,
          source: "last_model_credit",
          creditId: doc.$id,
        };
      }
    } catch {
      // ignore
    }
  }

  return { hourlyRate: 0, source: "none", creditId: null };
}

// ─── Instructor payment snapshot (+ student payment) ─────────────────────────

export async function saveInstructorPaymentSnapshot(
  flightId: string,
  instructorUserId: string,
  calculatedAt: string,
): Promise<void> {
  if (!isAppwriteConfigured || !databases || !FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID) {
    throw new Error("Coleção de pagamentos de voo não configurada.");
  }

  const existingPayment = await databases.listDocuments(DB_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID, [
    Query.equal("flight_id", [flightId]),
    Query.limit(1),
  ]);
  if (existingPayment.total > 0) return;

  // Fetch flight fields — block_time_minutes is the materialized departure → engine cutoff value.
  const flightDoc = await databases.getDocument(DB_ID, FLIGHTS_COL_ID, flightId, [
    Query.select(["aircraft_ident", "block_time_minutes", "total_flight_minutes", "is_night", "student_user_id"]),
  ]);

  const aircraftIdent = (flightDoc.aircraft_ident as string | null) ?? null;
  const isNight = Boolean(flightDoc.is_night);
  const studentUserId = (flightDoc.student_user_id as string | null) ?? null;

  // Priority: block_time_minutes (departure → cutoff, pre-materialized) > meta from CSV/storage > total_flight_minutes (leg sum).
  const blockTimeMat =
    typeof flightDoc.block_time_minutes === "number" && (flightDoc.block_time_minutes as number) > 0
      ? (flightDoc.block_time_minutes as number)
      : null;
  let totalMinutes: number;
  if (blockTimeMat !== null) {
    totalMinutes = blockTimeMat;
  } else {
    // getFlightRecordMetaOnly handles both inline csv_text and CSV stored in file storage.
    const { meta } = await getFlightRecordMetaOnly(flightId);
    const blockMinutes = flightBlockMinutesFromMeta(meta);
    totalMinutes = blockMinutes ?? Number(flightDoc.total_flight_minutes ?? 0);
  }

  // ── Resolve aircraft model ───────────────────────────────────────────────
  let modelId: string | null = null;
  let modelName: string | null = null;
  if (aircraftIdent) {
    const aircraft = await getAircraftByRegistration(aircraftIdent, DEFAULT_SCHOOL_ID);
    if (aircraft) {
      modelId = aircraft.model_id ?? null;
      const { listModels } = await import("./aircraftModelsDb");
      const models = await listModels();
      const model = models.find((m) => m.id === modelId);
      modelName = model?.name ?? null;
    }
  }

  // ── Instructor cost calculation ──────────────────────────────────────────
  const costs = await getInstructorCosts(instructorUserId);
  const modelCost = costs?.modelCosts.find((mc) => mc.modelId === modelId);
  const hourlyRate = isNight ? (modelCost?.hourlyNightRate ?? 0) : (modelCost?.hourlyDayRate ?? 0);
  const fixedRate = isNight ? (modelCost?.fixedNightRate ?? 0) : (modelCost?.fixedDayRate ?? 0);
  const flightHours = totalMinutes / 60;
  const totalCalculated = hourlyRate * flightHours + fixedRate;

  // ── Student payment calculation ──────────────────────────────────────────
  let studentHourlyRate = 0;
  let studentAmountCalculated = 0;
  let studentRateSource: StudentRateSource = "none";
  let studentCreditId: string | null = null;
  if (studentUserId) {
    const studentRate = await resolveStudentHourlyRate(studentUserId, modelId, isNight);
    studentHourlyRate = studentRate.hourlyRate;
    studentAmountCalculated = studentRate.hourlyRate * flightHours;
    studentRateSource = studentRate.source;
    studentCreditId = studentRate.creditId;
  }

  // ── Persist snapshot ─────────────────────────────────────────────────────
  // INVA no browser só pode conceder label:instrutor e o próprio user — não label:admin.
  const paymentPermissions = [
    Permission.read(Role.label("instrutor")),
    Permission.read(Role.user(instructorUserId)),
    Permission.update(Role.user(instructorUserId)),
  ];

  await databases.createDocument(
    DB_ID,
    FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID,
    ID.unique(),
    {
      flight_id: flightId,
      instructor_user_id: instructorUserId,
      school_id: DEFAULT_SCHOOL_ID,
      aircraft_model_id: modelId,
      aircraft_model_name: modelName,
      is_night: isNight,
      hourly_rate_applied: hourlyRate,
      fixed_rate_applied: fixedRate,
      flight_minutes_considered: totalMinutes,
      total_calculated: totalCalculated,
      calculated_at: calculatedAt,
      student_user_id: studentUserId,
      student_hourly_rate_applied: studentHourlyRate,
      student_amount_calculated: studentAmountCalculated,
      student_rate_source: studentRateSource,
      student_credit_id: studentCreditId,
    },
    paymentPermissions,
  );
}
