import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  LOGBOOK_OPENING_SIGNATURES_COL_ID,
  SCHOOL_ID,
} from "./appwrite";
import type { UserRole } from "./rbac";
import type { Aircraft, AircraftModel } from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";

export type LogbookOpeningSnapshot = {
  diaryNumber: string;
  aircraftRegistration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  ownerName: string;
  operatorName: string;
  openingDate: string | null;
  totalHours: number | null;
  engineHours: number | null;
  propellerHours: number | null;
  tachHours: number | null;
  totalCycles: number | null;
  totalLandings: number | null;
};

export type LogbookOpeningSignature = {
  id: string;
  aircraft_id: string;
  signer_user_id: string;
  signed_at: string;
  user_agent: string | null;
  content_hash: string | null;
  school_id: string;
  status: "active";
  snapshot: LogbookOpeningSnapshot;
  created_at: string;
};

function hasCollection(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && LOGBOOK_OPENING_SIGNATURES_COL_ID);
}

function toDoc(d: Record<string, unknown> & { $id: string; $createdAt: string }): LogbookOpeningSignature {
  let snapshot: Partial<LogbookOpeningSnapshot> = {};
  if (typeof d.snapshot_json === "string") {
    try {
      snapshot = JSON.parse(d.snapshot_json) as Partial<LogbookOpeningSnapshot>;
    } catch {
      snapshot = {};
    }
  }
  return {
    id: d.$id,
    aircraft_id: (d.aircraft_id as string) ?? "",
    signer_user_id: (d.signer_user_id as string) ?? "",
    signed_at: (d.signed_at as string) ?? "",
    user_agent: (d.user_agent as string | null | undefined) ?? null,
    content_hash: (d.content_hash as string | null | undefined) ?? null,
    school_id: (d.school_id as string) ?? DEFAULT_SCHOOL_ID,
    status: "active",
    snapshot: {
      diaryNumber: snapshot.diaryNumber ?? "",
      aircraftRegistration: snapshot.aircraftRegistration ?? "",
      manufacturer: snapshot.manufacturer ?? "",
      model: snapshot.model ?? "",
      serialNumber: snapshot.serialNumber ?? "",
      ownerName: snapshot.ownerName ?? "",
      operatorName: snapshot.operatorName ?? "",
      openingDate: snapshot.openingDate ?? null,
      totalHours: typeof snapshot.totalHours === "number" ? snapshot.totalHours : null,
      engineHours: typeof snapshot.engineHours === "number" ? snapshot.engineHours : null,
      propellerHours: typeof snapshot.propellerHours === "number" ? snapshot.propellerHours : null,
      tachHours: typeof snapshot.tachHours === "number" ? snapshot.tachHours : null,
      totalCycles: typeof snapshot.totalCycles === "number" ? snapshot.totalCycles : null,
      totalLandings: typeof snapshot.totalLandings === "number" ? snapshot.totalLandings : null,
    },
    created_at: d.$createdAt,
  };
}

async function computeContentHash(text: string): Promise<string | null> {
  try {
    const encoded = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function buildOpeningSnapshot(params: {
  aircraft: Aircraft;
  model: AircraftModel | null | undefined;
  totalHours: number | null;
  totalCycles: number | null;
  totalLandings: number | null;
}): LogbookOpeningSnapshot {
  return {
    diaryNumber: params.aircraft.logbook_sequence_number ?? "",
    aircraftRegistration: params.aircraft.registration,
    manufacturer: params.model?.manufacturer ?? "",
    model: params.model?.name ?? "",
    serialNumber: params.aircraft.serial_number ?? "",
    ownerName: params.aircraft.owner_name ?? "",
    operatorName: params.aircraft.operator_name ?? "",
    openingDate: params.aircraft.logbook_opening_date ?? null,
    totalHours: params.aircraft.logbook_ttaf ?? params.totalHours,
    engineHours: params.aircraft.logbook_engine_hours ?? null,
    propellerHours: params.aircraft.logbook_propeller_hours ?? null,
    tachHours: params.aircraft.logbook_tach_hours ?? null,
    totalCycles: params.aircraft.logbook_cycles ?? params.totalCycles,
    totalLandings: params.aircraft.logbook_landings ?? params.totalLandings,
  };
}

export async function getActiveLogbookOpeningSignature(aircraftId: string): Promise<LogbookOpeningSignature | null> {
  if (!aircraftId || !hasCollection() || !databases || !DB_ID || !LOGBOOK_OPENING_SIGNATURES_COL_ID) return null;
  const res = await databases.listDocuments(DB_ID, LOGBOOK_OPENING_SIGNATURES_COL_ID, [
    Query.equal("aircraft_id", [aircraftId]),
    Query.equal("status", ["active"]),
    Query.orderDesc("signed_at"),
    Query.limit(1),
  ]);
  const doc = res.documents[0];
  return doc ? toDoc(doc as unknown as Record<string, unknown> & { $id: string; $createdAt: string }) : null;
}

export async function listActiveLogbookOpeningSignatures(aircraftIds: string[]): Promise<Map<string, LogbookOpeningSignature>> {
  const map = new Map<string, LogbookOpeningSignature>();
  if (aircraftIds.length === 0 || !hasCollection() || !databases || !DB_ID || !LOGBOOK_OPENING_SIGNATURES_COL_ID) return map;
  for (let i = 0; i < aircraftIds.length; i += 25) {
    const chunk = aircraftIds.slice(i, i + 25);
    const res = await databases.listDocuments(DB_ID, LOGBOOK_OPENING_SIGNATURES_COL_ID, [
      Query.equal("aircraft_id", chunk),
      Query.equal("status", ["active"]),
      Query.orderDesc("signed_at"),
      Query.limit(100),
    ]);
    for (const raw of res.documents) {
      const doc = toDoc(raw as unknown as Record<string, unknown> & { $id: string; $createdAt: string });
      if (!map.has(doc.aircraft_id)) map.set(doc.aircraft_id, doc);
    }
  }
  return map;
}

export async function signLogbookOpening(params: {
  aircraftId: string;
  actorUserId: string;
  actorRole: UserRole;
  snapshot: LogbookOpeningSnapshot;
}): Promise<LogbookOpeningSignature> {
  if (!hasCollection() || !databases || !DB_ID || !LOGBOOK_OPENING_SIGNATURES_COL_ID) throw new Error("Colecao de assinatura de abertura nao configurada.");
  if (params.actorRole !== "admin") throw new Error("Apenas admin pode assinar a abertura do diario.");
  const existing = await getActiveLogbookOpeningSignature(params.aircraftId);
  if (existing) throw new Error("Este diario de bordo ja possui termo de abertura assinado.");

  const snapshotJson = JSON.stringify(params.snapshot);
  const signedAt = new Date().toISOString();
  const contentHash = await computeContentHash(snapshotJson);
  const doc = await databases.createDocument(
    DB_ID,
    LOGBOOK_OPENING_SIGNATURES_COL_ID,
    ID.unique(),
    {
      aircraft_id: params.aircraftId,
      signer_user_id: params.actorUserId,
      signed_at: signedAt,
      user_agent: navigator.userAgent.slice(0, 512),
      content_hash: contentHash,
      school_id: DEFAULT_SCHOOL_ID,
      status: "active",
      snapshot_json: snapshotJson,
    },
    [],
  );
  return toDoc(doc as unknown as Record<string, unknown> & { $id: string; $createdAt: string });
}
