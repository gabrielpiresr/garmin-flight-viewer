import { Query } from "appwrite";
import { resolveSharedDocumentPermissions } from "./appwriteClientPermissions";
import { databases, FUELINGS_COL_ID, ID, isAppwriteConfigured } from "./appwrite";
import type { UserRole } from "./rbac";
import type { AircraftFueling, CreateFuelingInput, FuelingFilters, FuelingPaymentMethod, FuelType } from "../types/fueling";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FUELINGS_COL_ID);
}

function text(doc: Record<string, unknown>, key: string): string | null {
  const value = doc[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(doc: Record<string, unknown>, key: string): number {
  const value = doc[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizePaymentMethod(value: unknown): FuelingPaymentMethod {
  return value === "Pix" || value === "Crédito" || value === "Débito" || value === "Linha de crédito" ? value : "Pix";
}

function normalizeFuelType(value: unknown): FuelType {
  return value === "AVGAS" || value === "Jet A" || value === "Jet A1" ? value : "AVGAS";
}

function toFueling(doc: Record<string, unknown>): AircraftFueling {
  return {
    id: doc.$id as string,
    school_id: (doc.school_id as string) ?? "",
    occurred_at: (doc.occurred_at as string) ?? "",
    aerodrome: (doc.aerodrome as string) ?? "",
    responsible_user_id: (doc.responsible_user_id as string) ?? "",
    responsible_name: (doc.responsible_name as string) ?? "",
    aircraft_id: (doc.aircraft_id as string) ?? "",
    aircraft_registration: (doc.aircraft_registration as string) ?? "",
    quantity_liters: num(doc, "quantity_liters"),
    price_per_liter: num(doc, "price_per_liter"),
    total_value: num(doc, "total_value"),
    payment_method: normalizePaymentMethod(doc.payment_method),
    fuel_type: normalizeFuelType(doc.fuel_type),
    student_user_id: text(doc, "student_user_id"),
    student_name: text(doc, "student_name"),
    flight_id: text(doc, "flight_id"),
    created_by: (doc.created_by as string) ?? "",
    created_at: (doc.$createdAt as string) ?? "",
    updated_at: (doc.$updatedAt as string) ?? "",
  };
}

function buildQueries(schoolId: string, filters: FuelingFilters = {}): string[] {
  const queries = [Query.equal("school_id", [schoolId]), Query.orderDesc("occurred_at"), Query.limit(500)];
  if (filters.aircraftId) queries.push(Query.equal("aircraft_id", [filters.aircraftId]));
  if (filters.responsibleUserId) queries.push(Query.equal("responsible_user_id", [filters.responsibleUserId]));
  if (filters.studentUserId) queries.push(Query.equal("student_user_id", [filters.studentUserId]));
  if (filters.fromDate) queries.push(Query.greaterThanEqual("occurred_at", filters.fromDate));
  if (filters.toDate) queries.push(Query.lessThanEqual("occurred_at", filters.toDate));
  return queries;
}

export async function listFuelings(schoolId: string, filters: FuelingFilters = {}): Promise<AircraftFueling[]> {
  if (!isReady() || !databases || !DB_ID || !FUELINGS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, FUELINGS_COL_ID, buildQueries(schoolId, filters));
  return res.documents.map((doc) => toFueling(doc as Record<string, unknown>));
}

export async function createFueling(
  data: CreateFuelingInput,
  actor: { userId: string; role: UserRole },
): Promise<AircraftFueling> {
  if (!databases || !DB_ID || !FUELINGS_COL_ID) throw new Error("Coleção de abastecimentos não configurada.");
  const doc = await databases.createDocument(
    DB_ID,
    FUELINGS_COL_ID,
    ID.unique(),
    {
      school_id: data.school_id,
      occurred_at: data.occurred_at,
      aerodrome: data.aerodrome.trim().toUpperCase(),
      responsible_user_id: data.responsible_user_id,
      responsible_name: data.responsible_name,
      aircraft_id: data.aircraft_id,
      aircraft_registration: data.aircraft_registration,
      quantity_liters: data.quantity_liters,
      price_per_liter: data.price_per_liter,
      total_value: data.total_value,
      payment_method: data.payment_method,
      fuel_type: data.fuel_type,
      student_user_id: data.student_user_id,
      student_name: data.student_name,
      flight_id: data.flight_id,
      created_by: data.created_by,
    },
    resolveSharedDocumentPermissions(actor.userId, actor.role),
  );
  return toFueling(doc as Record<string, unknown>);
}
