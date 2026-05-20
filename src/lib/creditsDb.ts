import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, SCHOOL_ID, STUDENT_CREDITS_COL_ID } from "./appwrite";

const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";
import { listAircrafts } from "./aircraftDb";
import { listModels } from "./aircraftModelsDb";
import { decodeFlightRecord } from "./flightRecordCodec";
import {
  getSavedFlight,
  listAllSavedFlights,
  listStudentFlightHistory,
  type SavedFlightFull,
  type SavedFlightListItem,
} from "./flightsDb";
import type { UserRole } from "./rbac";
import type { Aircraft, AircraftModel } from "../types/admin";
import type {
  StudentCreditFlightDebit,
  StudentCreditInput,
  StudentCreditModelSummary,
  StudentCreditPurchase,
  StudentCreditStatement,
} from "../types/credits";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const EPSILON = 0.0001;

type CreditDoc = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  user_id?: string;
  purchase_date?: string;
  aircraft_model_id?: string;
  aircraft_model_name?: string;
  amount_paid?: number;
  payment_method?: string;
  payment_installments?: number;
  validity_days?: number;
  hours?: number;
  expires_at?: string;
  notes?: string;
  is_night?: boolean;
  created_by?: string;
  updated_by?: string;
};

type FlightSource = {
  id: string;
  flightDate: string;
  aircraftIdent: string;
  hours: number;
  isNight: boolean;
};

type MutableCredit = StudentCreditPurchase & {
  remainingHours: number;
};

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && STUDENT_CREDITS_COL_ID);
}

function roundHours(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function asIsoDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return todayIso();
  return date.toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${asIsoDate(value)}T12:00:00`);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function parsePositiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseDurationToMinutes(value: string): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || "0") * 60 + Number(hhmm[2] || "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

function toCredit(doc: CreditDoc): StudentCreditPurchase {
  const purchaseDate = asIsoDate(doc.purchase_date);
  const validityDays = Math.max(0, Math.round(Number(doc.validity_days) || 0));
  return {
    id: doc.$id,
    userId: doc.user_id || "",
    purchaseDate,
    aircraftModelId: doc.aircraft_model_id || "",
    aircraftModelName: doc.aircraft_model_name || "Modelo não informado",
    amountPaid: parsePositiveNumber(Number(doc.amount_paid)),
    paymentMethod: doc.payment_method || "",
    paymentInstallments: typeof doc.payment_installments === "number" && doc.payment_installments > 0 ? doc.payment_installments : null,
    validityDays,
    hours: parsePositiveNumber(Number(doc.hours)),
    expiresAt: doc.expires_at || addDaysIso(purchaseDate, validityDays),
    notes: doc.notes || "",
    isNight: doc.is_night ?? false,
    createdAt: doc.$createdAt || "",
    updatedAt: doc.$updatedAt || "",
    createdBy: doc.created_by || null,
    updatedBy: doc.updated_by || null,
  };
}

function toPayload(input: StudentCreditInput, actorUserId?: string) {
  const purchaseDate = asIsoDate(input.purchaseDate);
  const validityDays = Math.max(0, Math.round(Number(input.validityDays) || 0));
  return {
    user_id: input.userId,
    aircraft_model_id: input.aircraftModelId,
    aircraft_model_name: input.aircraftModelName,
    purchase_date: purchaseDate,
    expires_at: addDaysIso(purchaseDate, validityDays),
    amount_paid: parsePositiveNumber(Number(input.amountPaid)),
    payment_method: input.paymentMethod.trim(),
    payment_installments:
      typeof input.paymentInstallments === "number" && input.paymentInstallments > 0
        ? Math.round(input.paymentInstallments)
        : null,
    validity_days: validityDays,
    hours: parsePositiveNumber(Number(input.hours)),
    notes: input.notes?.trim() || null,
    is_night: input.isNight ?? false,
    updated_by: actorUserId || null,
  };
}

function buildCreditPermissions(userId: string, actorUserId: string) {
  return [
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
    Permission.read(Role.user(userId)),
    Permission.read(Role.label("instrutor")),
  ];
}

function validateInput(input: StudentCreditInput) {
  if (!input.userId) throw new Error("Aluno não informado.");
  if (!input.aircraftModelId) throw new Error("Modelo de avião não informado.");
  if (!input.aircraftModelName.trim()) throw new Error("Nome do modelo não informado.");
  if (!input.purchaseDate) throw new Error("Data do crédito não informada.");
  if (!input.paymentMethod.trim()) throw new Error("Forma de pagamento não informada.");
  if (input.paymentMethod === "Parcelado" && (!input.paymentInstallments || input.paymentInstallments <= 0)) {
    throw new Error("Informe a quantidade de parcelas.");
  }
  if (!Number.isFinite(input.amountPaid) || input.amountPaid < 0) throw new Error("Valor pago inválido.");
  if (!Number.isFinite(input.validityDays) || input.validityDays < 0) throw new Error("Dias de validade inválidos.");
  if (!Number.isFinite(input.hours) || input.hours <= 0) throw new Error("Quantidade de horas inválida.");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function normalizeRegistration(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function modelName(modelId: string | null, modelsById: Map<string, AircraftModel>): string {
  if (!modelId) return "Modelo não identificado";
  return modelsById.get(modelId)?.name || "Modelo não identificado";
}

function buildFlightSource(item: SavedFlightListItem, full: SavedFlightFull | null): FlightSource | null {
  const decoded = full?.csv_text ? decodeFlightRecord(full.csv_text) : { meta: null };
  const meta = decoded.meta;
  const flightDate = asIsoDate(meta?.header.date || item.flight_date || item.created_at);

  const totalMinutes =
    meta?.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0) ||
    item.total_flight_minutes ||
    (typeof item.duration_sec === "number" ? Math.round(item.duration_sec / 60) : 0);
  const landings =
    meta?.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0) ??
    item.landings ??
    0;
  const hours = roundHours(totalMinutes / 60);
  if (hours <= 0 || landings <= 0) return null;

  return {
    id: item.id,
    flightDate,
    aircraftIdent: normalizeRegistration(meta?.header.aircraft || item.aircraft_ident),
    hours,
    isNight: meta?.header.isNight ?? item.is_night ?? false,
  };
}

async function listFlightSourcesForStudent(viewer: { userId: string; role: UserRole }, studentUserId: string) {
  const flightsResult =
    viewer.role === "aluno"
      ? await listAllSavedFlights({ userId: viewer.userId, role: viewer.role })
      : await listStudentFlightHistory({ actorUserId: viewer.userId, actorRole: viewer.role, studentUserId });
  if (flightsResult.error) throw flightsResult.error;

  const items = flightsResult.data ?? [];
  const fullFlights = await mapWithConcurrency(items, 4, async (item) => {
    const hasMaterializedSource =
      typeof item.total_flight_minutes === "number" &&
      typeof item.landings === "number" &&
      item.total_flight_minutes > 0 &&
      item.landings > 0;
    if (hasMaterializedSource) return [item, null] as const;
    const result = await getSavedFlight(item.id);
    return [item, result.data] as const;
  });

  return fullFlights
    .map(([item, full]) => buildFlightSource(item, full))
    .filter((source): source is FlightSource => Boolean(source))
    .sort((a, b) => a.flightDate.localeCompare(b.flightDate));
}

function summarizeModel(
  modelId: string,
  modelLabel: string,
  purchases: MutableCredit[],
  debits: StudentCreditFlightDebit[],
  generatedDate: string,
): StudentCreditModelSummary {
  const purchasedHours = purchases.reduce((acc, credit) => acc + credit.hours, 0);
  const consumedHours = debits.reduce((acc, debit) => acc + debit.allocatedHours, 0);
  const expiredHours = purchases
    .filter((credit) => credit.expiresAt < generatedDate)
    .reduce((acc, credit) => acc + credit.remainingHours, 0);
  const availableHours = purchases
    .filter((credit) => credit.expiresAt >= generatedDate)
    .reduce((acc, credit) => acc + credit.remainingHours, 0);
  const unallocatedFlightHours = debits.reduce((acc, debit) => acc + debit.unallocatedHours, 0);
  return {
    aircraftModelId: modelId,
    aircraftModelName: modelLabel,
    purchasedHours: roundHours(purchasedHours),
    consumedHours: roundHours(consumedHours),
    expiredHours: roundHours(expiredHours),
    availableHours: roundHours(availableHours),
    unallocatedFlightHours: roundHours(unallocatedFlightHours),
  };
}

export function buildStudentCreditStatement(params: {
  userId: string;
  purchases: StudentCreditPurchase[];
  flights: FlightSource[];
  aircrafts: Aircraft[];
  models: AircraftModel[];
  generatedAt?: string;
}): StudentCreditStatement {
  const generatedDate = asIsoDate(params.generatedAt || todayIso());
  const modelsById = new Map(params.models.map((model) => [model.id, model]));
  const aircraftByRegistration = new Map(params.aircrafts.map((aircraft) => [normalizeRegistration(aircraft.registration), aircraft]));
  const mutableCredits: MutableCredit[] = params.purchases
    .map((purchase) => ({ ...purchase, remainingHours: purchase.hours }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.purchaseDate.localeCompare(b.purchaseDate));

  const debits: StudentCreditFlightDebit[] = params.flights.map((flight) => {
    const aircraft = aircraftByRegistration.get(normalizeRegistration(flight.aircraftIdent));
    const aircraftModelId = aircraft?.model_id || null;
    const eligibleCredits = mutableCredits
      .filter(
        (credit) =>
          credit.aircraftModelId === aircraftModelId &&
          credit.expiresAt >= flight.flightDate &&
          credit.remainingHours > EPSILON &&
          credit.isNight === flight.isNight,
      )
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.purchaseDate.localeCompare(b.purchaseDate));

    let remainingDebit = flight.hours;
    const allocations = [];
    for (const credit of eligibleCredits) {
      if (remainingDebit <= EPSILON) break;
      const used = Math.min(credit.remainingHours, remainingDebit);
      credit.remainingHours = roundHours(credit.remainingHours - used);
      remainingDebit = roundHours(remainingDebit - used);
      allocations.push({ creditId: credit.id, hours: roundHours(used) });
    }

    return {
      id: flight.id,
      flightId: flight.id,
      flightDate: flight.flightDate,
      aircraftIdent: flight.aircraftIdent,
      aircraftModelId,
      aircraftModelName: modelName(aircraftModelId, modelsById),
      hours: flight.hours,
      allocatedHours: roundHours(flight.hours - remainingDebit),
      unallocatedHours: roundHours(remainingDebit),
      allocations,
    };
  });

  const modelIds = new Set<string>();
  for (const credit of mutableCredits) modelIds.add(credit.aircraftModelId);
  for (const debit of debits) modelIds.add(debit.aircraftModelId || "unresolved");

  const summaries = Array.from(modelIds)
    .map((modelId) => {
      const modelLabel =
        modelId === "unresolved"
          ? "Modelo não identificado"
          : modelsById.get(modelId)?.name ||
            mutableCredits.find((credit) => credit.aircraftModelId === modelId)?.aircraftModelName ||
            "Modelo não identificado";
      return summarizeModel(
        modelId,
        modelLabel,
        mutableCredits.filter((credit) => credit.aircraftModelId === modelId),
        debits.filter((debit) => (debit.aircraftModelId || "unresolved") === modelId),
        generatedDate,
      );
    })
    .sort((a, b) => a.aircraftModelName.localeCompare(b.aircraftModelName, "pt-BR"));

  return {
    userId: params.userId,
    generatedAt: generatedDate,
    purchases: [...params.purchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    flightDebits: [...debits].sort((a, b) => b.flightDate.localeCompare(a.flightDate)),
    summaries,
    totals: {
      purchasedHours: roundHours(summaries.reduce((acc, item) => acc + item.purchasedHours, 0)),
      consumedHours: roundHours(summaries.reduce((acc, item) => acc + item.consumedHours, 0)),
      expiredHours: roundHours(summaries.reduce((acc, item) => acc + item.expiredHours, 0)),
      availableHours: roundHours(summaries.reduce((acc, item) => acc + item.availableHours, 0)),
      unallocatedFlightHours: roundHours(summaries.reduce((acc, item) => acc + item.unallocatedFlightHours, 0)),
      amountPaid: Number(params.purchases.reduce((acc, item) => acc + item.amountPaid, 0).toFixed(2)),
    },
  };
}

export async function listStudentCredits(userId: string): Promise<StudentCreditPurchase[]> {
  if (!isReady() || !databases || !DB_ID || !STUDENT_CREDITS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, STUDENT_CREDITS_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.equal("user_id", [userId]),
    Query.orderDesc("purchase_date"),
    Query.limit(500),
  ]);
  return res.documents.map((doc) => toCredit(doc as unknown as CreditDoc));
}

export async function createStudentCredit(input: StudentCreditInput, actorUserId: string): Promise<StudentCreditPurchase> {
  if (!isReady() || !databases || !DB_ID || !STUDENT_CREDITS_COL_ID) throw new Error("Coleção de créditos não configurada.");
  validateInput(input);
  const doc = await databases.createDocument(
    DB_ID,
    STUDENT_CREDITS_COL_ID,
    ID.unique(),
    {
      ...toPayload(input, actorUserId),
      school_id: DEFAULT_SCHOOL_ID,
      created_by: actorUserId || null,
    },
    buildCreditPermissions(input.userId, actorUserId),
  );
  return toCredit(doc as unknown as CreditDoc);
}

export async function updateStudentCredit(
  creditId: string,
  input: StudentCreditInput,
  actorUserId: string,
): Promise<StudentCreditPurchase> {
  if (!isReady() || !databases || !DB_ID || !STUDENT_CREDITS_COL_ID) throw new Error("Coleção de créditos não configurada.");
  validateInput(input);
  const doc = await databases.updateDocument(DB_ID, STUDENT_CREDITS_COL_ID, creditId, toPayload(input, actorUserId));
  return toCredit(doc as unknown as CreditDoc);
}

export async function deleteStudentCredit(creditId: string): Promise<void> {
  if (!isReady() || !databases || !DB_ID || !STUDENT_CREDITS_COL_ID) throw new Error("Coleção de créditos não configurada.");
  await databases.deleteDocument(DB_ID, STUDENT_CREDITS_COL_ID, creditId);
}

export async function getStudentCreditStatement(params: {
  viewer: { userId: string; role: UserRole };
  studentUserId: string;
}): Promise<StudentCreditStatement> {
  if (params.viewer.role === "aluno" && params.viewer.userId !== params.studentUserId) {
    throw new Error("Aluno so pode consultar seus proprios creditos.");
  }

  const [purchases, flights, aircrafts, models] = await Promise.all([
    listStudentCredits(params.studentUserId),
    listFlightSourcesForStudent(params.viewer, params.studentUserId),
    listAircrafts(SCHOOL_ID ?? ""),
    listModels(),
  ]);

  return buildStudentCreditStatement({
    userId: params.studentUserId,
    purchases,
    flights,
    aircrafts,
    models,
  });
}
