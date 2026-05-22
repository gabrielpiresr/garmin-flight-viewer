import { createAdminAuditEvent } from "./adminUsersDb";
import { listAircrafts } from "./aircraftDb";
import { SCHOOL_ID } from "./appwrite";
import { listFlightDiscrepancies, syncFlightDiscrepanciesFromMetas, type FlightDiscrepancy } from "./flightDiscrepanciesDb";
import { listSignaturesForFlights, type FlightSignaturesForFlight } from "./flightSignaturesDb";
import {
  getFlightRecordMetaBatch,
  listAllFlightsByAircraft,
  type SavedFlightListItem,
} from "./flightsDb";
import {
  buildAnacLogbookEntries,
  enrichLogbookLandingTotals,
  type AnacLogbookEntry,
} from "./logbookAnac";
import { buildMaintenanceAsOfFlight, type MaintenanceAsOfFlight } from "./maintenanceAtDate";
import { listProgramItemsByModel, listWorkOrders } from "./maintenanceDb";
import { listProfileSummariesByUserIds } from "./rbac";
import type { Aircraft, MaintenanceWorkOrder } from "../types/admin";

const DB_NAME = "gfv_offline_logbook";
const DB_VERSION = 1;
const STORE_NAME = "offline_aircraft_packages";
const PACKAGE_TTL_HOURS = 24;

export type OfflineFlightSummary = Pick<
  SavedFlightListItem,
  | "id"
  | "flight_date"
  | "start_time"
  | "aircraft_ident"
  | "from_to"
  | "flight_status"
  | "instructor_signed"
  | "student_signed"
  | "admin_operator_signed"
  | "instructor_signed_at"
  | "flight_seq_number"
>;

export type OfflineAircraftLogbookPackage = {
  id: string;
  school_id: string;
  aircraft_ident: string;
  generated_at: string;
  valid_from: string;
  valid_to: string;
  expires_at: string;
  aircraft_snapshot: Aircraft;
  flights: OfflineFlightSummary[];
  entries: AnacLogbookEntry[];
  signatures: Record<string, FlightSignaturesForFlight>;
  maintenance_snapshot: Record<string, MaintenanceAsOfFlight>;
  discrepancies: FlightDiscrepancy[];
  work_orders: MaintenanceWorkOrder[];
  package_hash: string;
  unsigned_instructor_flight_ids: string[];
};

export type OfflineCoverageStatus = {
  state: "ok" | "warning" | "error";
  label: string;
  messages: string[];
};

function packageId(schoolId: string, aircraftIdent: string): string {
  return `${schoolId}:${aircraftIdent.trim().toUpperCase()}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function flightAsOfMs(flight: SavedFlightListItem): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function toOfflineSummary(flight: SavedFlightListItem): OfflineFlightSummary {
  return {
    id: flight.id,
    flight_date: flight.flight_date,
    start_time: flight.start_time,
    aircraft_ident: flight.aircraft_ident,
    from_to: flight.from_to,
    flight_status: flight.flight_status,
    instructor_signed: flight.instructor_signed,
    student_signed: flight.student_signed,
    admin_operator_signed: flight.admin_operator_signed,
    instructor_signed_at: flight.instructor_signed_at,
    flight_seq_number: flight.flight_seq_number,
  };
}

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableClone((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value === undefined ? null : value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableClone(value));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

async function storeRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento offline."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Falha na transação offline."));
    };
  });
}

export async function saveOfflineAircraftPackage(pkg: OfflineAircraftLogbookPackage): Promise<void> {
  await storeRequest("readwrite", (store) => store.put(pkg));
}

export async function getOfflineAircraftPackage(
  schoolId: string,
  aircraftIdent: string,
): Promise<OfflineAircraftLogbookPackage | null> {
  return (await storeRequest("readonly", (store) => store.get(packageId(schoolId, aircraftIdent)))) ?? null;
}

export async function listOfflineAircraftPackages(): Promise<OfflineAircraftLogbookPackage[]> {
  return (await storeRequest("readonly", (store) => store.getAll())) ?? [];
}

export function validateOfflinePackageCoverage(pkg: OfflineAircraftLogbookPackage | null): OfflineCoverageStatus {
  if (!pkg) {
    return { state: "error", label: "Sem cache", messages: ["Nenhum pacote offline foi sincronizado neste dispositivo."] };
  }
  const messages: string[] = [];
  const now = Date.now();
  const generatedMs = new Date(pkg.generated_at).getTime();
  const expiresMs = new Date(pkg.expires_at).getTime();
  if (!Number.isFinite(generatedMs) || now - generatedMs > PACKAGE_TTL_HOURS * 60 * 60 * 1000) {
    messages.push("Pacote gerado há mais de 24 horas.");
  }
  if (!Number.isFinite(expiresMs) || expiresMs < now) {
    messages.push("Pacote offline vencido.");
  }
  if (pkg.valid_to < todayIso()) {
    messages.push("A janela offline não cobre a data atual.");
  }
  if (pkg.unsigned_instructor_flight_ids.length > 0) {
    messages.push(`${pkg.unsigned_instructor_flight_ids.length} voo(s) dos últimos 30 dias ainda sem assinatura do instrutor.`);
  }
  if (messages.length === 0) return { state: "ok", label: "OK offline", messages: ["Pacote disponível e dentro da validade."] };
  return { state: "warning", label: "Precisa sincronizar", messages };
}

export async function buildOfflineAircraftLogbookPackage(aircraftIdent: string): Promise<OfflineAircraftLogbookPackage> {
  const schoolId = SCHOOL_ID ?? "escola_principal";
  const normalizedIdent = aircraftIdent.trim().toUpperCase();
  if (!normalizedIdent) throw new Error("Selecione uma aeronave.");

  const validTo = todayIso();
  const validFrom = addDaysIso(validTo, -30);
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PACKAGE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const aircrafts = await listAircrafts(schoolId);
  const aircraft = aircrafts.find((item) => item.registration.trim().toUpperCase() === normalizedIdent) ?? null;
  if (!aircraft) throw new Error("Aeronave não encontrada.");

  const allFlightsRes = await listAllFlightsByAircraft({ aircraftIdent: normalizedIdent });
  if (allFlightsRes.error) throw allFlightsRes.error;
  const allRows = allFlightsRes.data ?? [];
  const rowsInWindow = allRows.filter((flight) => {
    const date = (flight.flight_date ?? flight.created_at).slice(0, 10);
    return date >= validFrom && date <= validTo;
  });
  const rows = rowsInWindow.filter((flight) => flight.instructor_signed === true);
  const unsignedInstructorFlightIds = rowsInWindow.filter((flight) => flight.instructor_signed !== true).map((flight) => flight.id);

  const flightIds = rows.map((row) => row.id);
  const allFlightIds = allRows.map((row) => row.id);
  const modelId = aircraft.model_id;
  const [workOrders, programItems, metaByFlightId, allMetaByFlightId, signaturesByFlightId] = await Promise.all([
    listWorkOrders(),
    modelId ? listProgramItemsByModel(modelId) : Promise.resolve([]),
    getFlightRecordMetaBatch(flightIds, { concurrency: 12 }),
    getFlightRecordMetaBatch(allFlightIds, { concurrency: 12 }),
    listSignaturesForFlights(flightIds),
  ]);

  await syncFlightDiscrepanciesFromMetas(rows, metaByFlightId);
  const discrepancies = await listFlightDiscrepancies(normalizedIdent);

  const profileIds = new Set<string>();
  for (const flight of rows) {
    if (flight.student_user_id) profileIds.add(flight.student_user_id);
    if (flight.instructor_user_id) profileIds.add(flight.instructor_user_id);
  }
  for (const signatures of signaturesByFlightId.values()) {
    if (signatures.admin_operator?.signer_user_id) profileIds.add(signatures.admin_operator.signer_user_id);
  }
  const profiles = await listProfileSummariesByUserIds([...profileIds]);

  const entries: AnacLogbookEntry[] = [];
  const maintenanceSnapshot: Record<string, MaintenanceAsOfFlight> = {};
  for (const flight of rows) {
    const meta = metaByFlightId.get(flight.id);
    if (!meta) continue;
    const signatures = signaturesByFlightId.get(flight.id) ?? { student: null, instructor: null, admin_operator: null };
    const maintenance = buildMaintenanceAsOfFlight({
      aircraft,
      programItems,
      workOrders,
      flights: allRows,
      metaByFlightId: allMetaByFlightId,
      asOfMs: flightAsOfMs(flight),
    });
    maintenanceSnapshot[flight.id] = maintenance;
    entries.push(
      ...buildAnacLogbookEntries({
        flight,
        meta,
        signatures,
        maintenance,
        profileNames: {
          student: flight.student_user_id ? profiles[flight.student_user_id]?.fullName : meta.header.studentName,
          instructor: flight.instructor_user_id ? profiles[flight.instructor_user_id]?.fullName : meta.header.instructorName,
          operator: signatures.admin_operator ? profiles[signatures.admin_operator.signer_user_id]?.fullName : undefined,
        },
      }),
    );
  }

  const enrichedEntries = enrichLogbookLandingTotals({
    entries,
    rows,
    aircraft,
    workOrders,
  }).filter((entry) => Number(entry.landingsPartial) > 0);

  const signatures = Object.fromEntries([...signaturesByFlightId.entries()]);
  const pkgWithoutHash = {
    id: packageId(schoolId, normalizedIdent),
    school_id: schoolId,
    aircraft_ident: normalizedIdent,
    generated_at: generatedAt,
    valid_from: validFrom,
    valid_to: validTo,
    expires_at: expiresAt,
    aircraft_snapshot: aircraft,
    flights: rows.map(toOfflineSummary),
    entries: enrichedEntries,
    signatures,
    maintenance_snapshot: maintenanceSnapshot,
    discrepancies,
    work_orders: workOrders.filter((order) => order.aircraft_id === aircraft.id),
    unsigned_instructor_flight_ids: unsignedInstructorFlightIds,
  };
  const packageHash = await sha256(stableStringify(pkgWithoutHash));
  return { ...pkgWithoutHash, package_hash: packageHash };
}

export async function syncOfflineAircraftLogbookPackage(aircraftIdent: string): Promise<OfflineAircraftLogbookPackage> {
  const pkg = await buildOfflineAircraftLogbookPackage(aircraftIdent);
  await saveOfflineAircraftPackage(pkg);
  await createAdminAuditEvent({
    eventType: "offline_logbook_synced",
    entityType: "aircraft",
    entityId: pkg.aircraft_snapshot.id,
    reason: "Sincronização offline do Diário de Bordo dos últimos 30 dias.",
    afterSnapshot: {
      aircraftIdent: pkg.aircraft_ident,
      validFrom: pkg.valid_from,
      validTo: pkg.valid_to,
      flights: pkg.flights.length,
      entries: pkg.entries.length,
      packageHash: pkg.package_hash,
    },
  });
  return pkg;
}
