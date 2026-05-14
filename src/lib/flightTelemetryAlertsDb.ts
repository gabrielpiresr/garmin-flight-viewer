import { Query } from "appwrite";
import { getAircraftByRegistration } from "./aircraftDb";
import {
  databases,
  FLIGHT_TELEMETRY_ALERTS_COL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  SCHOOL_ID,
} from "./appwrite";
import { evaluateTelemetryAlerts, type TriggeredTelemetryAlert, type TelemetryAlertSeverity } from "./telemetryAlerts";
import { listActiveTelemetryAlertRulesByModel } from "./telemetryAlertRulesDb";
import type { ParseResult } from "./parseGarminCsv";
import type { TelemetryIdentity } from "./flightTelemetryMetrics";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type FlightTelemetryAlertDoc = {
  id: string;
  flightId: string;
  ruleId: string;
  modelId: string;
  studentUserId: string;
  instructorUserId: string | null;
  aircraftIdent: string | null;
  flightDate: string | null;
  severity: TelemetryAlertSeverity;
  ruleName: string;
  phase: string | null;
  matchedAt: string | null;
  durationSec: number | null;
  ruleSnapshotJson: string;
  evidenceJson: string;
  createdAt: string;
};

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && FLIGHT_TELEMETRY_ALERTS_COL_ID);
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function alertPermissions(actorUserId: string) {
  return Array.from(
    new Set([
      Permission.read(Role.users()),
      Permission.read(Role.user(actorUserId)),
      Permission.update(Role.user(actorUserId)),
      Permission.delete(Role.user(actorUserId)),
      Permission.read(Role.label("instrutor")),
      Permission.update(Role.label("instrutor")),
      Permission.delete(Role.label("instrutor")),
    ]),
  );
}

function toAlertDoc(doc: Record<string, unknown>): FlightTelemetryAlertDoc {
  return {
    id: doc.$id as string,
    flightId: (doc.flight_id as string) ?? "",
    ruleId: (doc.rule_id as string) ?? "",
    modelId: (doc.model_id as string) ?? "",
    studentUserId: (doc.student_user_id as string) ?? "",
    instructorUserId: (doc.instructor_user_id as string | null | undefined) ?? null,
    aircraftIdent: (doc.aircraft_ident as string | null | undefined) ?? null,
    flightDate: (doc.flight_date as string | null | undefined) ?? null,
    severity: (doc.severity as TelemetryAlertSeverity) ?? "leve",
    ruleName: (doc.rule_name as string) ?? "",
    phase: (doc.phase as string | null | undefined) ?? null,
    matchedAt: (doc.matched_at as string | null | undefined) ?? null,
    durationSec: (doc.duration_sec as number | null | undefined) ?? null,
    ruleSnapshotJson: (doc.rule_snapshot_json as string | null | undefined) ?? "{}",
    evidenceJson: (doc.evidence_json as string | null | undefined) ?? "{}",
    createdAt: (doc.$createdAt as string) ?? "",
  };
}

async function deleteByFlight(flightId: string): Promise<void> {
  if (!databases || !DB_ID || !FLIGHT_TELEMETRY_ALERTS_COL_ID) return;
  let cursor: string | null = null;
  while (true) {
    const queries = [Query.equal("flight_id", [flightId]), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FLIGHT_TELEMETRY_ALERTS_COL_ID, queries);
    await Promise.all(res.documents.map((doc) => databases!.deleteDocument(DB_ID, FLIGHT_TELEMETRY_ALERTS_COL_ID, doc.$id)));
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1]?.$id ?? null;
    if (!cursor) break;
  }
}

function alertDocument(flightId: string, identity: TelemetryIdentity, alert: TriggeredTelemetryAlert) {
  return {
    flight_id: flightId,
    rule_id: alert.ruleId,
    model_id: alert.modelId,
    student_user_id: identity.studentUserId,
    instructor_user_id: cleanString(identity.instructorUserId),
    aircraft_ident: cleanString(identity.aircraftIdent),
    flight_date: cleanString(identity.flightDate),
    start_time: cleanString(identity.startTime),
    severity: alert.severity,
    rule_name: alert.ruleName,
    phase: alert.evidence.phase,
    matched_at: cleanString(alert.evidence.matchedAt),
    duration_sec: cleanNumber(alert.evidence.durationSec),
    rule_snapshot_json: JSON.stringify({
      name: alert.ruleName,
      severity: alert.severity,
      phases: alert.phases,
      conditions: alert.conditions,
      durationSec: alert.durationSec,
    }),
    evidence_json: JSON.stringify(alert.evidence),
  };
}

export async function clearFlightTelemetryAlerts(flightId: string): Promise<{ error: Error | null }> {
  if (!configured()) return { error: null };
  try {
    await deleteByFlight(flightId);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function replaceFlightTelemetryAlertsForFlight(params: {
  flightId: string;
  actorUserId: string;
  identity: TelemetryIdentity;
  parsed: ParseResult | null;
}): Promise<{ count: number; error: Error | null }> {
  if (!configured()) return { count: 0, error: null };
  try {
    await deleteByFlight(params.flightId);
    if (!params.parsed || !databases || !DB_ID || !FLIGHT_TELEMETRY_ALERTS_COL_ID) return { count: 0, error: null };

    const aircraft = await getAircraftByRegistration(params.identity.aircraftIdent ?? "", SCHOOL_ID ?? "");
    const modelId = aircraft?.model_id ?? null;
    if (!modelId) return { count: 0, error: null };

    const rules = await listActiveTelemetryAlertRulesByModel(modelId);
    if (rules.length === 0) return { count: 0, error: null };

    const triggered = evaluateTelemetryAlerts({ rules, parsed: params.parsed });
    if (triggered.length === 0) return { count: 0, error: null };

    const permissions = alertPermissions(params.actorUserId);
    await Promise.all(
      triggered.map((alert) =>
        databases!.createDocument(
          DB_ID,
          FLIGHT_TELEMETRY_ALERTS_COL_ID,
          ID.unique(),
          alertDocument(params.flightId, params.identity, alert),
          permissions,
        ),
      ),
    );
    return { count: triggered.length, error: null };
  } catch (e) {
    return { count: 0, error: e as Error };
  }
}

export async function listFlightTelemetryAlerts(flightId: string): Promise<{ data: FlightTelemetryAlertDoc[]; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !FLIGHT_TELEMETRY_ALERTS_COL_ID || !flightId) return { data: [], error: null };
  try {
    const rows: FlightTelemetryAlertDoc[] = [];
    let cursor: string | null = null;
    while (true) {
      const queries = [
        Query.equal("flight_id", [flightId]),
        Query.limit(100),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const res = await databases.listDocuments(DB_ID, FLIGHT_TELEMETRY_ALERTS_COL_ID, queries);
      rows.push(...res.documents.map((doc) => toAlertDoc(doc as unknown as Record<string, unknown>)));
      if (res.documents.length < 100) break;
      cursor = res.documents[res.documents.length - 1]?.$id ?? null;
      if (!cursor) break;
    }
    const severityRank: Record<TelemetryAlertSeverity, number> = { risco: 3, atencao: 2, leve: 1 };
    rows.sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        (a.matchedAt ?? "").localeCompare(b.matchedAt ?? ""),
    );
    return { data: rows, error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}

export async function listRecentFlightTelemetryAlerts(limit = 200): Promise<{ data: FlightTelemetryAlertDoc[]; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !FLIGHT_TELEMETRY_ALERTS_COL_ID) return { data: [], error: null };
  try {
    const rows: FlightTelemetryAlertDoc[] = [];
    let cursor: string | null = null;
    const targetLimit = Math.max(limit, 1);

    while (rows.length < targetLimit) {
      const queries = [
        Query.orderDesc("$createdAt"),
        Query.limit(Math.min(targetLimit - rows.length, 100)),
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const res = await databases.listDocuments(DB_ID, FLIGHT_TELEMETRY_ALERTS_COL_ID, queries);
      rows.push(...res.documents.map((doc) => toAlertDoc(doc as unknown as Record<string, unknown>)));
      if (res.documents.length < 100) break;
      cursor = res.documents[res.documents.length - 1]?.$id ?? null;
      if (!cursor) break;
    }

    return { data: rows, error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}
