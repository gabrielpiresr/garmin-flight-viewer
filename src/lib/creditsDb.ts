import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, SCHOOL_ID, DEFAULT_SCHOOL_ID, STUDENT_CREDITS_COL_ID, CREDIT_ADJUSTMENTS_COL_ID } from "./appwrite";
import { getSchoolCosts } from "./schoolCostsDb";
import type { StudentPaymentMethod } from "../types/costs";


import { listAircrafts } from "./aircraftDb";
import { listModels } from "./aircraftModelsDb";
import { decodeFlightRecord } from "./flightRecordCodec";
import { flightBlockMinutesFromMeta } from "./flightHours";
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

/** Scheduled imports and explicit pending/confirmed flights are not consumed credits yet. */
function isCreditStatementScheduledFlight(item: SavedFlightListItem): boolean {
  const source = String(item.source_filename || "").toLowerCase();
  if (source.includes("saga-schedule") || source.includes("saga-test-schedule")) return true;
  if (item.saga_schedule_id) return true;
  return ["Pendente", "Confirmado", "Previsto"].includes(String(item.flight_status || "").trim());
}

function buildFlightSource(item: SavedFlightListItem, full: SavedFlightFull | null): FlightSource | null {
  const decoded = full?.csv_text ? decodeFlightRecord(full.csv_text) : { meta: null };
  const meta = decoded.meta;
  const flightDate = asIsoDate(meta?.header.date || item.flight_date || item.created_at);

  // Priority: block_time_minutes (departure → engine cutoff) > meta block time > leg sum > GPS
  const blockMinutes =
    (typeof item.block_time_minutes === "number" && item.block_time_minutes > 0 ? item.block_time_minutes : null) ??
    flightBlockMinutesFromMeta(meta);
  const legSumMinutes =
    meta?.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0) ||
    item.total_flight_minutes ||
    (typeof item.duration_sec === "number" ? Math.round(item.duration_sec / 60) : 0);
  const totalMinutes = blockMinutes ?? legSumMinutes;
  const landings =
    meta?.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0) ??
    item.landings ??
    0;
  const hours = roundHours(totalMinutes / 60);
  const isScheduled = isCreditStatementScheduledFlight(item);
  if (hours <= 0 || isScheduled) {
    if (item.id === "saga_flight_739" || String(item.id || "").startsWith("saga_flight_")) {
      // #region agent log
      fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-consumed-debug',hypothesisId:'H10',location:'creditsDb.ts:buildFlightSource',message:'flight excluded from credit statement source',data:{flightId:item.id,flightDate,itemLandings:item.landings,metaLandings:meta?.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0) ?? null,hours,totalMinutes,blockTimeMinutes:item.block_time_minutes ?? null,totalFlightMinutes:item.total_flight_minutes ?? null,durationSec:item.duration_sec ?? null,isNight:meta?.header.isNight ?? item.is_night ?? false,flightStatus:item.flight_status ?? null,isScheduled,sourceFilename:item.source_filename},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    return null;
  }

  if (item.id === "saga_flight_739") {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-consumed-debug',hypothesisId:'H10',location:'creditsDb.ts:buildFlightSource',message:'flight included in credit statement source',data:{flightId:item.id,flightDate,hours,landings,isNight:meta?.header.isNight ?? item.is_night ?? false},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

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
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-consumed-debug',hypothesisId:'H11',location:'creditsDb.ts:listFlightSourcesForStudent',message:'raw flight items before source mapping',data:{viewerUserId:viewer.userId,viewerRole:viewer.role,studentUserId,itemsCount:items.length,sample:items.slice(0,25).map((item)=>({id:item.id,flightDate:item.flight_date,status:item.flight_status,landings:item.landings,blockTime:item.block_time_minutes,totalFlight:item.total_flight_minutes,durationSec:item.duration_sec}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const fullFlights = await mapWithConcurrency(items, 4, async (item) => {
    const hasMaterializedSource =
      ((typeof item.block_time_minutes === "number" && item.block_time_minutes > 0) ||
        (typeof item.total_flight_minutes === "number" && item.total_flight_minutes > 0)) &&
      typeof item.landings === "number" &&
      item.landings > 0;
    if (hasMaterializedSource) return [item, null] as const;
    const result = await getSavedFlight(item.id);
    return [item, result.data] as const;
  });

  const mappedSources = fullFlights
    .map(([item, full]) => buildFlightSource(item, full))
    .filter((source): source is FlightSource => Boolean(source))
    .sort((a, b) => a.flightDate.localeCompare(b.flightDate));
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-consumed-debug',hypothesisId:'H11',location:'creditsDb.ts:listFlightSourcesForStudent',message:'mapped flight sources for credit statement',data:{viewerUserId:viewer.userId,viewerRole:viewer.role,studentUserId,sourcesCount:mappedSources.length,has739:mappedSources.some((source)=>source.id==='saga_flight_739'),sample:mappedSources.slice(0,25)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return mappedSources;
}

function summarizeModel(
  modelId: string,
  modelLabel: string,
  purchases: MutableCredit[],
  debits: StudentCreditFlightDebit[],
  generatedDate: string,
  simplified = false,
): StudentCreditModelSummary {
  const purchasedHours = purchases.reduce((acc, credit) => acc + credit.hours, 0);
  const consumedHours = debits.reduce((acc, debit) => acc + debit.allocatedHours, 0);
  if (simplified) {
    // No modo simplificado: soma TODAS as horas voadas (incluindo parciais),
    // permitindo saldo negativo quando o aluno voou mais do que comprou.
    const totalFlownHours = debits.reduce((acc, debit) => acc + debit.hours, 0);
    return {
      aircraftModelId: modelId,
      aircraftModelName: modelLabel,
      purchasedHours: roundHours(purchasedHours),
      consumedHours: roundHours(totalFlownHours),
      expiredHours: 0,
      availableHours: roundHours(purchasedHours - totalFlownHours),
      unallocatedFlightHours: 0,
    };
  }
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
  adjustments?: StudentCreditStatement["adjustments"];
  nightHoursDifferentFromDay?: boolean;
}): StudentCreditStatement {
  const simplified = params.nightHoursDifferentFromDay === false;
  const generatedDate = asIsoDate(params.generatedAt || todayIso());
  const modelsById = new Map(params.models.map((model) => [model.id, model]));
  const aircraftByRegistration = new Map(params.aircrafts.map((aircraft) => [normalizeRegistration(aircraft.registration), aircraft]));
  const mutableCredits: MutableCredit[] = params.purchases
    .map((purchase) => ({ ...purchase, remainingHours: purchase.hours }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.purchaseDate.localeCompare(b.purchaseDate));

  const debits: StudentCreditFlightDebit[] = params.flights.map((flight) => {
    const aircraft = aircraftByRegistration.get(normalizeRegistration(flight.aircraftIdent));
    const aircraftModelId = aircraft?.model_id || null;
    const candidateCredits = mutableCredits.filter(
      (credit) => credit.aircraftModelId === aircraftModelId && credit.remainingHours > EPSILON,
    );
    const eligibleCredits = simplified
      ? mutableCredits
          .filter(
            (credit) => credit.aircraftModelId === aircraftModelId && credit.remainingHours > EPSILON,
          )
          .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.purchaseDate.localeCompare(b.purchaseDate))
      : mutableCredits
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

    const allocatedHours = roundHours(flight.hours - remainingDebit);
    const unallocatedHours = roundHours(remainingDebit);
    if (unallocatedHours > 0 || flight.id === "saga_flight_773") {
      // #region agent log
      fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-debit-debug',hypothesisId:'H9',location:'creditsDb.ts:buildStudentCreditStatement',message:'credit debit allocation snapshot',data:{userId:params.userId,flightId:flight.id,flightDate:flight.flightDate,flightHours:flight.hours,flightAircraftIdent:flight.aircraftIdent,flightModelId:aircraftModelId,flightIsNight:flight.isNight,candidateCredits:candidateCredits.map((credit)=>({id:credit.id,modelId:credit.aircraftModelId,isNight:credit.isNight,purchaseDate:credit.purchaseDate,expiresAt:credit.expiresAt,remainingHours:credit.remainingHours})).slice(0,20),eligibleCredits:eligibleCredits.map((credit)=>({id:credit.id,remainingHours:credit.remainingHours,isNight:credit.isNight,purchaseDate:credit.purchaseDate,expiresAt:credit.expiresAt})).slice(0,20),allocations,allocatedHours,unallocatedHours},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }

    return {
      id: flight.id,
      flightId: flight.id,
      flightDate: flight.flightDate,
      aircraftIdent: flight.aircraftIdent,
      isNight: flight.isNight,
      aircraftModelId,
      aircraftModelName: modelName(aircraftModelId, modelsById),
      hours: flight.hours,
      allocatedHours,
      unallocatedHours,
      allocations,
    };
  });

  const modelIds = new Set<string>();
  for (const credit of mutableCredits) modelIds.add(credit.aircraftModelId);
  for (const debit of debits) modelIds.add(debit.aircraftModelId || "unresolved");

  const adjustments = params.adjustments ?? [];
  const adjustmentsByModel = new Map<string, number>();
  for (const adj of adjustments) {
    const modelId = String(adj.aircraftModelId || "").trim() || "unresolved";
    const penalty = Math.abs(Math.min(0, adj.hours));
    if (penalty <= EPSILON) continue;
    adjustmentsByModel.set(modelId, roundHours((adjustmentsByModel.get(modelId) ?? 0) + penalty));
    modelIds.add(modelId);
  }

  const summaries = Array.from(modelIds)
    .map((modelId) => {
      const modelLabel =
        modelId === "unresolved"
          ? "Modelo não identificado"
          : modelsById.get(modelId)?.name ||
            mutableCredits.find((credit) => credit.aircraftModelId === modelId)?.aircraftModelName ||
            "Modelo não identificado";
      const summary = summarizeModel(
        modelId,
        modelLabel,
        mutableCredits.filter((credit) => credit.aircraftModelId === modelId),
        debits.filter((debit) => (debit.aircraftModelId || "unresolved") === modelId),
        generatedDate,
        simplified,
      );
      const penaltyHours = adjustmentsByModel.get(modelId) ?? 0;
      if (penaltyHours <= EPSILON) return summary;
      return {
        ...summary,
        consumedHours: roundHours(summary.consumedHours + penaltyHours),
        availableHours: simplified
          ? roundHours(summary.availableHours - penaltyHours)
          : roundHours(Math.max(0, summary.availableHours - penaltyHours)),
      };
    })
    .sort((a, b) => a.aircraftModelName.localeCompare(b.aircraftModelName, "pt-BR"));

  const debit739 = debits.find((debit) => debit.flightId === "saga_flight_739");
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'credit-consumed-debug',hypothesisId:'H10',location:'creditsDb.ts:buildStudentCreditStatement',message:'credit statement totals snapshot',data:{userId:params.userId,debitsCount:debits.length,has739:!!debit739,debit739:debit739?{hours:debit739.hours,allocatedHours:debit739.allocatedHours,unallocatedHours:debit739.unallocatedHours,isNight:debit739.isNight}:null,consumedHours:roundHours(summaries.reduce((acc, item) => acc + item.consumedHours, 0)),unallocatedHours:roundHours(summaries.reduce((acc, item) => acc + item.unallocatedFlightHours, 0))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const totalAvailableHours = roundHours(summaries.reduce((acc, item) => acc + item.availableHours, 0));
  return {
    userId: params.userId,
    generatedAt: generatedDate,
    purchases: [...params.purchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    flightDebits: [...debits].sort((a, b) => b.flightDate.localeCompare(a.flightDate)),
    adjustments,
    summaries,
    totals: {
      purchasedHours: roundHours(summaries.reduce((acc, item) => acc + item.purchasedHours, 0)),
      consumedHours: roundHours(summaries.reduce((acc, item) => acc + item.consumedHours, 0)),
      expiredHours: roundHours(summaries.reduce((acc, item) => acc + item.expiredHours, 0)),
      availableHours: simplified ? totalAvailableHours : roundHours(Math.max(0, totalAvailableHours)),
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

  let costSnapshotJson: string | null = null;
  try {
    const schoolCosts = await getSchoolCosts();
    const method = input.paymentMethod as StudentPaymentMethod;
    const methodCost = schoolCosts.paymentMethodCosts[method] ?? { fixedCost: 0, percentCost: 0 };
    const totalCostCalculated = methodCost.fixedCost + (input.amountPaid * methodCost.percentCost) / 100;
    costSnapshotJson = JSON.stringify({
      enrollmentCost: schoolCosts.enrollmentCost,
      paymentMethodFixedCost: methodCost.fixedCost,
      paymentMethodPercentCost: methodCost.percentCost,
      totalCostCalculated,
      appliedAt: new Date().toISOString(),
    });
  } catch {
    // non-blocking — proceed without snapshot if costs unavailable
  }

  const doc = await databases.createDocument(
    DB_ID,
    STUDENT_CREDITS_COL_ID,
    ID.unique(),
    {
      ...toPayload(input, actorUserId),
      school_id: DEFAULT_SCHOOL_ID,
      created_by: actorUserId || null,
      ...(costSnapshotJson ? { cost_snapshot_json: costSnapshotJson } : {}),
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

  let costSnapshotJson: string | null = null;
  try {
    const schoolCosts = await getSchoolCosts();
    const method = input.paymentMethod as StudentPaymentMethod;
    const methodCost = schoolCosts.paymentMethodCosts[method] ?? { fixedCost: 0, percentCost: 0 };
    const totalCostCalculated = methodCost.fixedCost + (input.amountPaid * methodCost.percentCost) / 100;
    costSnapshotJson = JSON.stringify({
      enrollmentCost: schoolCosts.enrollmentCost,
      paymentMethodFixedCost: methodCost.fixedCost,
      paymentMethodPercentCost: methodCost.percentCost,
      totalCostCalculated,
      appliedAt: new Date().toISOString(),
    });
  } catch {
    // non-blocking — proceed without snapshot if costs unavailable
  }

  const payload = {
    ...toPayload(input, actorUserId),
    ...(costSnapshotJson ? { cost_snapshot_json: costSnapshotJson } : {}),
  };
  const doc = await databases.updateDocument(DB_ID, STUDENT_CREDITS_COL_ID, creditId, payload);
  return toCredit(doc as unknown as CreditDoc);
}

export async function deleteStudentCredit(creditId: string): Promise<void> {
  if (!isReady() || !databases || !DB_ID || !STUDENT_CREDITS_COL_ID) throw new Error("Coleção de créditos não configurada.");
  await databases.deleteDocument(DB_ID, STUDENT_CREDITS_COL_ID, creditId);
}

type CreditAdjustmentRow = StudentCreditStatement["adjustments"][number];

function mapCreditAdjustment(doc: Record<string, unknown>): CreditAdjustmentRow {
  return {
    id: String(doc.$id ?? ""),
    flightId: (doc.flight_id as string | null | undefined) ?? null,
    aircraftModelId: String(doc.aircraft_model_id ?? ""),
    aircraftIdent: String(doc.aircraft_ident ?? ""),
    hours: Number(doc.hours ?? 0),
    percentage: Number(doc.percentage ?? 0),
    reason: String(doc.reason ?? ""),
    occurredAt: String(doc.occurred_at ?? doc.$createdAt ?? ""),
    flightDate: String(doc.flight_date ?? "").trim() || null,
    flightStartTime: String(doc.flight_start_time ?? "").trim() || null,
  };
}

async function enrichCreditAdjustments(adjustments: CreditAdjustmentRow[]): Promise<CreditAdjustmentRow[]> {
  return Promise.all(
    adjustments.map(async (adjustment) => {
      if (adjustment.flightDate && adjustment.flightStartTime) return adjustment;
      const rawFlightId = adjustment.flightId?.replace(/^saga-/, "") ?? "";
      if (!rawFlightId) return adjustment;
      try {
        const result = await getSavedFlight(rawFlightId);
        const flight = result.data;
        if (!flight) return adjustment;
        return {
          ...adjustment,
          flightDate: adjustment.flightDate || flight.flight_date || null,
          flightStartTime: adjustment.flightStartTime || flight.start_time || flight.presentation_time || null,
        };
      } catch {
        return adjustment;
      }
    }),
  );
}

export async function getStudentCreditStatement(params: {
  viewer: { userId: string; role: UserRole };
  studentUserId: string;
  nightHoursDifferentFromDay?: boolean;
}): Promise<StudentCreditStatement> {
  if (params.viewer.role === "aluno" && params.viewer.userId !== params.studentUserId) {
    throw new Error("Aluno so pode consultar seus proprios creditos.");
  }

  const [purchases, flights, aircrafts, models, adjustmentDocs] = await Promise.all([
    listStudentCredits(params.studentUserId),
    listFlightSourcesForStudent(params.viewer, params.studentUserId),
    listAircrafts(SCHOOL_ID ?? ""),
    listModels(),
    databases && DB_ID
      ? databases.listDocuments(DB_ID, CREDIT_ADJUSTMENTS_COL_ID, [
          Query.equal("student_user_id", [params.studentUserId]),
          Query.orderDesc("occurred_at"),
          Query.limit(500),
        ]).catch(() => ({ documents: [] }))
      : Promise.resolve({ documents: [] }),
  ]);

  const adjustments = await enrichCreditAdjustments(adjustmentDocs.documents.map((doc) => mapCreditAdjustment(doc as Record<string, unknown>)));

  return buildStudentCreditStatement({
    userId: params.studentUserId,
    purchases,
    flights,
    aircrafts,
    models,
    nightHoursDifferentFromDay: params.nightHoursDifferentFromDay,
    adjustments,
  });
}
