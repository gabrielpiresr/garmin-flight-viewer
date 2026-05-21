import { Query } from "appwrite";
import {
  databases,
  FLIGHT_DISCREPANCIES_COL_ID,
  isAppwriteConfigured, DEFAULT_SCHOOL_ID,
} from "./appwrite";
import type { FlightRecordMeta } from "./flightRecordCodec";
import type { SavedFlightListItem } from "./flightsDb";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type FlightDiscrepancyStatus = "open" | "linked" | "resolved";

export type FlightDiscrepancy = {
  id: string;
  aircraft_ident: string;
  flight_id: string;
  leg_index: number;
  flight_date: string | null;
  system: string | null;
  discrepancy_text: string;
  canac_reported: string | null;
  status: FlightDiscrepancyStatus;
  linked_work_order_id: string | null;
  corrective_action: string | null;
  responsible_canac: string | null;
  pic_canac: string | null;
  school_id: string;
  created_at: string;
  updated_at: string;
};

function hasCollection(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FLIGHT_DISCREPANCIES_COL_ID);
}

function toDoc(d: Record<string, unknown> & { $id: string; $createdAt: string; $updatedAt: string }): FlightDiscrepancy {
  return {
    id: d.$id,
    aircraft_ident: (d.aircraft_ident as string) ?? "",
    flight_id: (d.flight_id as string) ?? "",
    leg_index: typeof d.leg_index === "number" ? d.leg_index : 0,
    flight_date: (d.flight_date as string | null | undefined) ?? null,
    system: (d.system as string | null | undefined) ?? null,
    discrepancy_text: (d.discrepancy_text as string) ?? "",
    canac_reported: (d.canac_reported as string | null | undefined) ?? null,
    status: (d.status as FlightDiscrepancyStatus | undefined) ?? "open",
    linked_work_order_id: (d.linked_work_order_id as string | null | undefined) ?? null,
    corrective_action: (d.corrective_action as string | null | undefined) ?? null,
    responsible_canac: (d.responsible_canac as string | null | undefined) ?? null,
    pic_canac: (d.pic_canac as string | null | undefined) ?? null,
    school_id: (d.school_id as string) ?? DEFAULT_SCHOOL_ID,
    created_at: d.$createdAt,
    updated_at: d.$updatedAt,
  };
}

function realDiscrepancy(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized.includes("nao foi constatado") && normalized.includes("discrepancia")) return "";
  return text;
}

function stableDiscrepancyId(flightId: string, legIndex: number): string {
  return `disc_${flightId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}_${legIndex}`;
}

export async function listFlightDiscrepancies(aircraftIdent: string): Promise<FlightDiscrepancy[]> {
  if (!aircraftIdent.trim() || !hasCollection() || !databases || !DB_ID || !FLIGHT_DISCREPANCIES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, FLIGHT_DISCREPANCIES_COL_ID, [
    Query.equal("aircraft_ident", [aircraftIdent.trim().toUpperCase()]),
    Query.orderDesc("flight_date"),
    Query.limit(500),
  ]);
  return res.documents.map((doc) => toDoc(doc as unknown as Record<string, unknown> & { $id: string; $createdAt: string; $updatedAt: string }));
}

export async function syncFlightDiscrepanciesFromMetas(
  rows: SavedFlightListItem[],
  metaByFlightId: Map<string, FlightRecordMeta | null>,
): Promise<void> {
  if (!hasCollection() || !databases || !DB_ID || !FLIGHT_DISCREPANCIES_COL_ID) return;
  await Promise.all(rows.map(async (flight) => {
    const meta = metaByFlightId.get(flight.id);
    const discrepancyText = realDiscrepancy(meta?.technicalLog?.discrepancies);
    if (!meta || !discrepancyText) return;
    const legCount = Math.max(1, meta.legs.length);
    await Promise.all(Array.from({ length: legCount }, async (_, legIndex) => {
      const id = stableDiscrepancyId(flight.id, legIndex);
      const payload = {
        aircraft_ident: (flight.aircraft_ident ?? meta.header.aircraft ?? "").trim().toUpperCase(),
        flight_id: flight.id,
        leg_index: legIndex,
        flight_date: flight.flight_date ?? meta.header.date ?? null,
        system: null,
        discrepancy_text: discrepancyText,
        canac_reported: meta.header.instructorAnac ?? meta.header.studentAnac ?? null,
        status: "open",
        school_id: DEFAULT_SCHOOL_ID,
      };
      try {
        await databases!.createDocument(DB_ID!, FLIGHT_DISCREPANCIES_COL_ID!, id, payload, []);
      } catch (e) {
        const msg = ((e as { message?: string })?.message ?? String(e)).toLowerCase();
        if (!msg.includes("already exists") && !msg.includes("document_already_exists")) throw e;
      }
    }));
  }));
}

export async function linkDiscrepancyToWorkOrder(params: {
  discrepancyId: string | null;
  workOrderId: string;
  status: FlightDiscrepancyStatus;
  correctiveAction?: string | null;
  responsibleCanac?: string | null;
  picCanac?: string | null;
}): Promise<void> {
  if (!params.discrepancyId || !hasCollection() || !databases || !DB_ID || !FLIGHT_DISCREPANCIES_COL_ID) return;
  await databases.updateDocument(DB_ID, FLIGHT_DISCREPANCIES_COL_ID, params.discrepancyId, {
    linked_work_order_id: params.workOrderId,
    status: params.status,
    corrective_action: params.correctiveAction ?? null,
    responsible_canac: params.responsibleCanac ?? null,
    pic_canac: params.picCanac ?? null,
  });
}

export function discrepancyLabel(discrepancy: FlightDiscrepancy): string {
  const date = discrepancy.flight_date ? new Date(`${discrepancy.flight_date}T00:00:00`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "sem data";
  return `${date} - ${discrepancy.discrepancy_text.slice(0, 80)}`;
}
