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
import { getAvailableFlightCreditPackages } from "./flightCreditSalesDb";
import { isWeekendDate } from "./creditWeekday";

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
  weekday_only?: boolean;
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

/** Arredonda SEM clampar em zero — para saldos que podem ficar negativos (aluno devendo). */
function roundSignedHours(value: number): number {
  return Number(value.toFixed(2));
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
    weekdayOnly: Boolean(doc.weekday_only),
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
    weekday_only: input.weekdayOnly ?? false,
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
  const hours = roundHours(totalMinutes / 60);
  const isScheduled = isCreditStatementScheduledFlight(item);
  if (hours <= 0 || isScheduled) return null;

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
  return mappedSources;
}

/** Última compra primeiro; se esgotar, passa para a compra imediatamente anterior. */
function creditLifoSort(a: MutableCredit, b: MutableCredit): number {
  return b.purchaseDate.localeCompare(a.purchaseDate) || b.expiresAt.localeCompare(a.expiresAt);
}

function creditEligibleForFlight(credit: MutableCredit, flight: FlightSource, simplified: boolean): boolean {
  if (credit.remainingHours <= EPSILON) return false;
  if (!simplified) {
    if (credit.expiresAt < flight.flightDate) return false;
    if (credit.isNight !== flight.isNight) return false;
  }
  return true;
}

function totalPenaltyHours(adjustments: StudentCreditStatement["adjustments"]): number {
  return roundHours(
    adjustments.reduce((acc, adj) => acc + Math.abs(Math.min(0, adj.hours)), 0),
  );
}

function applyGlobalPenaltiesToPools(
  pools: { weekdayOnly: number; anyDay: number },
  adjustments: StudentCreditStatement["adjustments"],
): { weekdayOnly: number; anyDay: number } {
  let result = pools;
  for (const adj of adjustments) {
    const penalty = Math.abs(Math.min(0, adj.hours));
    if (penalty <= EPSILON) continue;
    result = applyPenaltyToPools(result, penalty, adj.flightDate);
  }
  return result;
}

type LedgerReplay = {
  mutableCredits: MutableCredit[];
  debits: StudentCreditFlightDebit[];
  debtHours: number;
};

/** Replay cronológico: compras ativam crédito; voos debitam LIFO; dívida é coberta por compras futuras. */
function replayCreditLedger(params: {
  purchases: StudentCreditPurchase[];
  flights: FlightSource[];
  aircrafts: Aircraft[];
  modelsById: Map<string, AircraftModel>;
  simplified: boolean;
}): LedgerReplay {
  const aircraftByRegistration = new Map(
    params.aircrafts.map((aircraft) => [normalizeRegistration(aircraft.registration), aircraft]),
  );
  const mutableCredits: MutableCredit[] = params.purchases.map((purchase) => ({
    ...purchase,
    remainingHours: 0,
  }));
  const creditsById = new Map(mutableCredits.map((credit) => [credit.id, credit]));

  type TimelineEvent =
    | { kind: "purchase"; date: string; creditId: string }
    | { kind: "flight"; date: string; flight: FlightSource };

  const events: TimelineEvent[] = [
    ...params.purchases.map((purchase) => ({
      kind: "purchase" as const,
      date: purchase.purchaseDate,
      creditId: purchase.id,
    })),
    ...params.flights.map((flight) => ({
      kind: "flight" as const,
      date: flight.flightDate,
      flight,
    })),
  ].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind === "purchase" && b.kind === "flight") return -1;
    if (a.kind === "flight" && b.kind === "purchase") return 1;
    return 0;
  });

  const debits: StudentCreditFlightDebit[] = [];
  let debtHours = 0;

  for (const event of events) {
    if (event.kind === "purchase") {
      const credit = creditsById.get(event.creditId);
      if (!credit) continue;
      let incoming = credit.hours;
      if (debtHours > EPSILON) {
        const cover = Math.min(debtHours, incoming);
        debtHours = roundHours(debtHours - cover);
        incoming = roundHours(incoming - cover);
      }
      credit.remainingHours = incoming;
      continue;
    }

    const flight = event.flight;
    const aircraft = aircraftByRegistration.get(normalizeRegistration(flight.aircraftIdent));
    const aircraftModelId = aircraft?.model_id || null;
    const eligibleCredits = mutableCredits
      .filter((credit) => creditEligibleForFlight(credit, flight, params.simplified))
      .sort(creditLifoSort);

    let remainingDebit = flight.hours;
    const allocations = [];
    for (const credit of eligibleCredits) {
      if (remainingDebit <= EPSILON) break;
      const used = Math.min(credit.remainingHours, remainingDebit);
      credit.remainingHours = roundHours(credit.remainingHours - used);
      remainingDebit = roundHours(remainingDebit - used);
      allocations.push({ creditId: credit.id, hours: roundHours(used) });
    }

    if (remainingDebit > EPSILON) {
      debtHours = roundHours(debtHours + remainingDebit);
    }

    const allocatedHours = roundHours(flight.hours - remainingDebit);
    debits.push({
      id: flight.id,
      flightId: flight.id,
      flightDate: flight.flightDate,
      aircraftIdent: flight.aircraftIdent,
      isNight: flight.isNight,
      aircraftModelId,
      aircraftModelName: modelName(aircraftModelId, params.modelsById),
      hours: flight.hours,
      allocatedHours,
      unallocatedHours: roundHours(remainingDebit),
      allocations,
    });
  }

  return { mutableCredits, debits, debtHours };
}

function poolHoursFromCredits(
  credits: MutableCredit[],
  generatedDate: string,
  simplified: boolean,
): { weekdayOnly: number; anyDay: number } {
  const active = credits.filter((credit) => simplified || credit.expiresAt >= generatedDate);
  let weekdayOnly = 0;
  let anyDay = 0;
  for (const credit of active) {
    if (credit.remainingHours <= EPSILON) continue;
    if (credit.weekdayOnly) weekdayOnly += credit.remainingHours;
    else anyDay += credit.remainingHours;
  }
  return { weekdayOnly: roundHours(weekdayOnly), anyDay: roundHours(anyDay) };
}

function applyPenaltyToPools(
  pools: { weekdayOnly: number; anyDay: number },
  penaltyHours: number,
  flightDate: string | null,
): { weekdayOnly: number; anyDay: number } {
  if (penaltyHours <= EPSILON) return pools;
  if (!flightDate || isWeekendDate(flightDate)) {
    let anyDay = roundSignedHours(pools.anyDay - penaltyHours);
    if (anyDay < -EPSILON && pools.weekdayOnly > EPSILON) {
      const spill = Math.min(pools.weekdayOnly, Math.abs(anyDay));
      return {
        weekdayOnly: roundHours(pools.weekdayOnly - spill),
        anyDay: roundSignedHours(anyDay + spill),
      };
    }
    return { weekdayOnly: pools.weekdayOnly, anyDay };
  }
  const fromWeekday = Math.min(pools.weekdayOnly, penaltyHours);
  const remainder = penaltyHours - fromWeekday;
  let anyDay = roundSignedHours(pools.anyDay - remainder);
  if (anyDay < -EPSILON && pools.weekdayOnly - fromWeekday > EPSILON) {
    const spill = Math.min(pools.weekdayOnly - fromWeekday, Math.abs(anyDay));
    return {
      weekdayOnly: roundHours(pools.weekdayOnly - fromWeekday - spill),
      anyDay: roundSignedHours(anyDay + spill),
    };
  }
  return {
    weekdayOnly: roundHours(pools.weekdayOnly - fromWeekday),
    anyDay,
  };
}

function finalizePoolSummary(
  pools: { weekdayOnly: number; anyDay: number },
  simplified: boolean,
): { weekdayOnlyAvailableHours: number; anyDayAvailableHours: number } {
  if (!simplified) {
    return {
      weekdayOnlyAvailableHours: roundHours(Math.max(0, pools.weekdayOnly)),
      // Pool livre pode ficar negativo (dívida); seg–sex usa restrito + livre na semana.
      anyDayAvailableHours: roundSignedHours(pools.anyDay),
    };
  }
  const total = pools.weekdayOnly + pools.anyDay;
  if (total >= 0) {
    return {
      weekdayOnlyAvailableHours: roundHours(pools.weekdayOnly),
      anyDayAvailableHours: roundHours(pools.anyDay),
    };
  }
  return { weekdayOnlyAvailableHours: 0, anyDayAvailableHours: roundSignedHours(total) };
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
  const creditConsumedHours = purchases.reduce(
    (acc, credit) => acc + Math.max(0, credit.hours - credit.remainingHours),
    0,
  );
  const modelFlownHours = debits.reduce((acc, debit) => acc + debit.hours, 0);
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
      balanceHours: roundSignedHours(purchasedHours - totalFlownHours),
      unallocatedFlightHours: 0,
      weekdayOnlyAvailableHours: 0,
      anyDayAvailableHours: roundHours(purchasedHours - totalFlownHours),
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
    consumedHours: roundHours(creditConsumedHours),
    expiredHours: roundHours(expiredHours),
    availableHours: roundHours(availableHours),
    balanceHours: roundSignedHours(purchasedHours - modelFlownHours),
    unallocatedFlightHours: roundHours(unallocatedFlightHours),
    weekdayOnlyAvailableHours: 0,
    anyDayAvailableHours: roundHours(availableHours),
  };
}

function summarizeGlobalBalance(
  purchasedHours: number,
  flownHours: number,
  penaltyHours: number,
  remainingHours: number,
  debtHours: number,
): number {
  const ledgerBalance = roundSignedHours(purchasedHours - flownHours - penaltyHours);
  const poolBalance = roundSignedHours(remainingHours - debtHours - penaltyHours);
  if (Math.abs(ledgerBalance - poolBalance) <= 0.05) return ledgerBalance;
  // Saldo devedor: comprado − voado é a referência do card (21,1 − 21,3 = −0,2).
  if (ledgerBalance < -EPSILON || debtHours > EPSILON) return ledgerBalance;
  // Créditos vencidos / restrições de alocação: confia no pool remanescente.
  return poolBalance;
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
  // LIFO global (última compra primeiro) — espelha computeCreditPools em schedule-booking.
  const simplified = params.nightHoursDifferentFromDay === false;
  const generatedDate = asIsoDate(params.generatedAt || todayIso());
  const modelsById = new Map(params.models.map((model) => [model.id, model]));
  const { mutableCredits, debits: replayDebits, debtHours } = replayCreditLedger({
    purchases: params.purchases,
    flights: params.flights,
    aircrafts: params.aircrafts,
    modelsById,
    simplified,
  });
  const debits = simplified
    ? replayDebits.map((debit) => ({
        ...debit,
        allocatedHours: debit.hours,
        unallocatedHours: 0,
      }))
    : replayDebits;

  const modelIds = new Set<string>();
  for (const credit of mutableCredits) modelIds.add(credit.aircraftModelId);
  for (const debit of debits) modelIds.add(debit.aircraftModelId || "unresolved");

  const adjustments = params.adjustments ?? [];
  const adjustmentsByModel = new Map<string, number>();
  const adjustmentRowsByModel = new Map<string, StudentCreditStatement["adjustments"]>();
  for (const adj of adjustments) {
    const modelId = String(adj.aircraftModelId || "").trim() || "unresolved";
    const penalty = Math.abs(Math.min(0, adj.hours));
    if (penalty <= EPSILON) continue;
    adjustmentsByModel.set(modelId, roundHours((adjustmentsByModel.get(modelId) ?? 0) + penalty));
    const rows = adjustmentRowsByModel.get(modelId) ?? [];
    rows.push(adj);
    adjustmentRowsByModel.set(modelId, rows);
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
      let pools = poolHoursFromCredits(
        mutableCredits.filter((credit) => credit.aircraftModelId === modelId),
        generatedDate,
        simplified,
      );
      for (const adj of adjustmentRowsByModel.get(modelId) ?? []) {
        const penalty = Math.abs(Math.min(0, adj.hours));
        if (penalty <= EPSILON) continue;
        pools = applyPenaltyToPools(pools, penalty, adj.flightDate);
      }
      const poolSummary = finalizePoolSummary(pools, simplified);
      if (penaltyHours <= EPSILON) {
        return { ...summary, ...poolSummary };
      }
      return {
        ...summary,
        ...poolSummary,
        consumedHours: roundHours(summary.consumedHours + penaltyHours),
        availableHours: simplified
          ? roundHours(summary.availableHours - penaltyHours)
          : roundHours(Math.max(0, summary.availableHours - penaltyHours)),
        balanceHours: roundSignedHours(summary.balanceHours - penaltyHours),
      };
    })
    .sort((a, b) => a.aircraftModelName.localeCompare(b.aircraftModelName, "pt-BR"));

  const globalPools = applyGlobalPenaltiesToPools(
    poolHoursFromCredits(mutableCredits, generatedDate, simplified),
    adjustments,
  );
  const penalties = totalPenaltyHours(adjustments);
  const totalPurchasedHours = roundHours(params.purchases.reduce((acc, item) => acc + item.hours, 0));
  const totalFlownHours = roundHours(debits.reduce((acc, item) => acc + item.hours, 0));
  const totalRemainingHours = roundSignedHours(
    mutableCredits
      .filter((credit) => simplified || credit.expiresAt >= generatedDate)
      .reduce((acc, credit) => acc + credit.remainingHours, 0),
  );
  const globalPoolSummary = finalizePoolSummary(globalPools, simplified);
  const balanceHours = summarizeGlobalBalance(
    totalPurchasedHours,
    totalFlownHours,
    penalties,
    totalRemainingHours,
    debtHours,
  );
  const outstandingDebtHours = roundHours(Math.max(debtHours, totalFlownHours - totalPurchasedHours));
  return {
    userId: params.userId,
    generatedAt: generatedDate,
    purchases: [...params.purchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    flightDebits: [...debits].sort((a, b) => b.flightDate.localeCompare(a.flightDate)),
    adjustments,
    summaries,
    totals: {
      purchasedHours: totalPurchasedHours,
      consumedHours: totalFlownHours,
      expiredHours: roundHours(summaries.reduce((acc, item) => acc + item.expiredHours, 0)),
      availableHours: roundHours(Math.max(0, balanceHours)),
      balanceHours,
      penaltyHours: penalties,
      weekdayOnlyAvailableHours: globalPoolSummary.weekdayOnlyAvailableHours,
      anyDayAvailableHours: globalPoolSummary.anyDayAvailableHours,
      unallocatedFlightHours: outstandingDebtHours,
      debtHours: roundHours(debtHours),
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
          flightStartTime: adjustment.flightStartTime || flight.start_time || null,
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

  let nightHoursDifferentFromDay = params.nightHoursDifferentFromDay;
  if (nightHoursDifferentFromDay === undefined) {
    const config = await getAvailableFlightCreditPackages().catch(() => null);
    nightHoursDifferentFromDay = config?.nightHoursDifferentFromDay !== false;
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
    nightHoursDifferentFromDay,
    adjustments,
  });
}
