import { Query } from "appwrite";
import { databases, FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type InstructorPaymentSnapshotRow = {
  id: string;
  flightId: string;
  instructorUserId: string;
  aircraftModelId: string | null;
  aircraftModelName: string | null;
  isNight: boolean;
  hourlyRateApplied: number;
  fixedRateApplied: number;
  flightMinutesConsidered: number;
  totalCalculated: number;
  calculatedAt: string;
};

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID);
}

function toPaymentSnapshot(doc: Record<string, unknown>): InstructorPaymentSnapshotRow {
  return {
    id: String(doc.$id ?? ""),
    flightId: String(doc.flight_id ?? ""),
    instructorUserId: String(doc.instructor_user_id ?? ""),
    aircraftModelId: (doc.aircraft_model_id as string | null | undefined) ?? null,
    aircraftModelName: (doc.aircraft_model_name as string | null | undefined) ?? null,
    isNight: Boolean(doc.is_night),
    hourlyRateApplied: Number(doc.hourly_rate_applied ?? 0) || 0,
    fixedRateApplied: Number(doc.fixed_rate_applied ?? 0) || 0,
    flightMinutesConsidered: Number(doc.flight_minutes_considered ?? 0) || 0,
    totalCalculated: Number(doc.total_calculated ?? 0) || 0,
    calculatedAt: String(doc.calculated_at ?? ""),
  };
}

export async function listInstructorPaymentSnapshotsByFlightIds(flightIds: string[]): Promise<InstructorPaymentSnapshotRow[]> {
  if (!isReady() || !databases || !DB_ID || !FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID) return [];
  const ids = Array.from(new Set(flightIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return [];

  const rows: InstructorPaymentSnapshotRow[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const res = await databases.listDocuments(DB_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID, [
        Query.equal("flight_id", ids.slice(i, i + 50)),
        Query.limit(100),
      ]);
      rows.push(...res.documents.map((doc) => toPaymentSnapshot(doc as unknown as Record<string, unknown>)));
    } catch {
      // Older deployments may not expose this collection to the current session.
    }
  }
  return rows;
}
