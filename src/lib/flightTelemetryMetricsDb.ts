import { Query } from "appwrite";
import {
  databases,
  FLIGHT_LANDINGS_COL_ID,
  FLIGHT_TAKEOFFS_COL_ID,
  FLIGHT_TELEMETRY_SUMMARIES_COL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
} from "./appwrite";
import type {
  FlightLandingMetric,
  FlightTakeoffMetric,
  FlightTelemetryMetricsBundle,
  FlightTelemetrySummaryMetrics,
  TelemetryIdentity,
} from "./flightTelemetryMetrics";
import type { UserRole } from "./rbac";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const APPWRITE_UID_RE = /^[A-Za-z0-9][A-Za-z0-9_]{0,35}$/;

type JourneyViewer = {
  userId: string;
  role: UserRole;
};

type MetricDocumentBase = {
  $id: string;
  flight_id?: string;
  student_user_id?: string;
  instructor_user_id?: string | null;
  aircraft_ident?: string | null;
  flight_date?: string | null;
  start_time?: string | null;
};

export type JourneyTelemetrySummaryDoc = MetricDocumentBase & {
  telemetry_present?: boolean;
  duration_sec?: number | null;
  distance_nm?: number | null;
  takeoff_count?: number;
  landing_count?: number;
  tgl_count?: number;
  smooth_landing_count?: number;
  medium_landing_count?: number;
  hard_landing_count?: number;
  best_touchdown_g?: number | null;
  best_touchdown_vert_speed_fpm?: number | null;
  slowest_landing_ias_kt?: number | null;
  slowest_landing_gs_kt?: number | null;
  max_touchdown_g?: number | null;
  max_descent_rate_fpm?: number | null;
  longest_takeoff_ground_roll_ft?: number | null;
  shortest_takeoff_ground_roll_ft?: number | null;
  fastest_takeoff_ias_kt?: number | null;
  max_headwind_kt?: number | null;
  max_tailwind_kt?: number | null;
  max_crosswind_kt?: number | null;
  aerodrome_count?: number;
  aerodromes_json?: string | null;
};

export type JourneyLandingDoc = MetricDocumentBase & {
  sequence?: number;
  segment_type?: string;
  touchdown_time?: string | null;
  impact_label?: string | null;
  td_impact_g?: number | null;
  td_vert_speed_fpm?: number | null;
  td_ias_kt?: number | null;
  td_gs_kt?: number | null;
  td_pitch_deg?: number | null;
  td_crab_angle_deg?: number | null;
  flare_duration_sec?: number | null;
  flare_dist_ft?: number | null;
  lda_ft?: number | null;
  max_braking_g?: number | null;
};

export type JourneyTakeoffDoc = MetricDocumentBase & {
  sequence?: number;
  segment_type?: string;
  liftoff_time?: string | null;
  ground_roll_ft?: number | null;
  ground_roll_duration_sec?: number | null;
  time_to_agl100_sec?: number | null;
  time_to_agl500_sec?: number | null;
  rotation_ias_kt?: number | null;
  liftoff_ias_kt?: number | null;
  rpm_at_liftoff?: number | null;
  map_at_liftoff?: number | null;
  fuel_flow_at_liftoff?: number | null;
};

function isValidCollectionId(value: string | null | undefined): value is string {
  return Boolean(value && !value.startsWith("your_") && APPWRITE_UID_RE.test(value));
}

function metricsCollectionsConfigured(): boolean {
  return Boolean(
    isValidCollectionId(FLIGHT_TELEMETRY_SUMMARIES_COL_ID) &&
      isValidCollectionId(FLIGHT_LANDINGS_COL_ID) &&
      isValidCollectionId(FLIGHT_TAKEOFFS_COL_ID),
  );
}

function configured(): boolean {
  return Boolean(
    isAppwriteConfigured &&
      databases &&
      DB_ID,
  );
}

function viewerQueries(viewer: JourneyViewer): string[] {
  if (viewer.role === "aluno") return [Query.equal("student_user_id", [viewer.userId])];
  if (viewer.role === "instrutor") return [Query.equal("instructor_user_id", [viewer.userId])];
  return [];
}

async function listMetricDocuments<T extends MetricDocumentBase>(
  collectionId: string,
  viewer: JourneyViewer,
): Promise<{ data: T[] | null; error: Error | null }> {
  if (!isValidCollectionId(collectionId)) {
    return { data: [], error: null };
  }
  if (!configured() || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }

  try {
    const rows: T[] = [];
    let cursor: string | null = null;
    while (true) {
      const queries = [...viewerQueries(viewer), Query.orderDesc("flight_date"), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const res = await databases.listDocuments(DB_ID, collectionId, queries);
      rows.push(...(res.documents as unknown as T[]));
      if (res.documents.length < 100) break;
      cursor = res.documents[res.documents.length - 1]?.$id ?? null;
      if (!cursor) break;
    }
    return { data: rows, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function listJourneyTelemetrySummaries(
  viewer: JourneyViewer,
): Promise<{ data: JourneyTelemetrySummaryDoc[] | null; error: Error | null }> {
  if (!isValidCollectionId(FLIGHT_TELEMETRY_SUMMARIES_COL_ID)) return { data: [], error: null };
  if (!FLIGHT_TELEMETRY_SUMMARIES_COL_ID) return { data: null, error: new Error("Coleção de resumos não configurada") };
  return listMetricDocuments<JourneyTelemetrySummaryDoc>(FLIGHT_TELEMETRY_SUMMARIES_COL_ID, viewer);
}

export async function listJourneyLandings(
  viewer: JourneyViewer,
): Promise<{ data: JourneyLandingDoc[] | null; error: Error | null }> {
  if (!isValidCollectionId(FLIGHT_LANDINGS_COL_ID)) return { data: [], error: null };
  if (!FLIGHT_LANDINGS_COL_ID) return { data: null, error: new Error("Coleção de pousos não configurada") };
  return listMetricDocuments<JourneyLandingDoc>(FLIGHT_LANDINGS_COL_ID, viewer);
}

export async function listJourneyTakeoffs(
  viewer: JourneyViewer,
): Promise<{ data: JourneyTakeoffDoc[] | null; error: Error | null }> {
  if (!isValidCollectionId(FLIGHT_TAKEOFFS_COL_ID)) return { data: [], error: null };
  if (!FLIGHT_TAKEOFFS_COL_ID) return { data: null, error: new Error("Coleção de decolagens não configurada") };
  return listMetricDocuments<JourneyTakeoffDoc>(FLIGHT_TAKEOFFS_COL_ID, viewer);
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function basePermissions(actorUserId: string, actorRole: UserRole) {
  const permissions = [
    Permission.read(Role.users()),
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
  ];
  if (actorRole === "admin") {
    permissions.push(Permission.read(Role.label("admin")));
    permissions.push(Permission.update(Role.label("admin")));
    permissions.push(Permission.delete(Role.label("admin")));
  } else if (actorRole === "instrutor") {
    permissions.push(Permission.read(Role.label("instrutor")));
    permissions.push(Permission.update(Role.label("instrutor")));
  } else if (actorRole === "aluno") {
    permissions.push(Permission.read(Role.label("aluno")));
  }
  return Array.from(new Set(permissions));
}

function identityDoc(flightId: string, identity: TelemetryIdentity) {
  return {
    flight_id: flightId,
    student_user_id: identity.studentUserId,
    instructor_user_id: cleanString(identity.instructorUserId),
    aircraft_ident: cleanString(identity.aircraftIdent),
    flight_date: cleanString(identity.flightDate),
    start_time: cleanString(identity.startTime),
  };
}

function summaryDoc(flightId: string, summary: FlightTelemetrySummaryMetrics) {
  return {
    ...identityDoc(flightId, summary),
    telemetry_present: summary.telemetryPresent,
    parser_version: summary.parserVersion,
    processed_at: summary.processedAt,
    duration_sec: cleanNumber(summary.durationSec),
    distance_m: cleanNumber(summary.distanceM),
    distance_nm: cleanNumber(summary.distanceNm),
    point_count: summary.pointCount,
    takeoff_count: summary.takeoffCount,
    landing_count: summary.landingCount,
    tgl_count: summary.tglCount,
    smooth_landing_count: summary.smoothLandingCount,
    medium_landing_count: summary.mediumLandingCount,
    hard_landing_count: summary.hardLandingCount,
    best_touchdown_g: cleanNumber(summary.bestTouchdownG),
    best_touchdown_vert_speed_fpm: cleanNumber(summary.bestTouchdownVertSpeedFpm),
    slowest_landing_ias_kt: cleanNumber(summary.slowestLandingIasKt),
    slowest_landing_gs_kt: cleanNumber(summary.slowestLandingGsKt),
    max_touchdown_g: cleanNumber(summary.maxTouchdownG),
    max_descent_rate_fpm: cleanNumber(summary.maxDescentRateFpm),
    longest_takeoff_ground_roll_ft: cleanNumber(summary.longestTakeoffGroundRollFt),
    shortest_takeoff_ground_roll_ft: cleanNumber(summary.shortestTakeoffGroundRollFt),
    fastest_takeoff_ias_kt: cleanNumber(summary.fastestTakeoffIasKt),
    max_headwind_kt: cleanNumber(summary.maxHeadwindKt),
    max_tailwind_kt: cleanNumber(summary.maxTailwindKt),
    max_crosswind_kt: cleanNumber(summary.maxCrosswindKt),
    aerodrome_count: summary.aerodromeCount,
    aerodromes_json: JSON.stringify(summary.aerodromes),
    max_oil_pressure_psi: cleanNumber(summary.maxOilPressurePsi),
    max_oil_temp_f: cleanNumber(summary.maxOilTempF),
    max_normal_g: cleanNumber(summary.maxNormalG),
    max_lateral_g: cleanNumber(summary.maxLateralG),
    max_cht_f: cleanNumber(summary.maxChtF),
    max_egt_f: cleanNumber(summary.maxEgtF),
    max_rpm: cleanNumber(summary.maxRpm),
    max_map_inhg: cleanNumber(summary.maxMapInHg),
    max_fuel_flow_gph: cleanNumber(summary.maxFuelFlowGph),
    max_fuel_pressure_psi: cleanNumber(summary.maxFuelPressurePsi),
    min_fuel_qty: cleanNumber(summary.minFuelQty),
    max_oat_c: cleanNumber(summary.maxOatC),
    summary_json: summary.summaryJson,
  };
}

function landingDoc(flightId: string, landing: FlightLandingMetric) {
  return {
    ...identityDoc(flightId, landing),
    sequence: landing.sequence,
    segment_type: landing.segmentType,
    touchdown_time: cleanString(landing.touchdownTime),
    impact_label: cleanString(landing.impactLabel),
    td_impact_g: cleanNumber(landing.tdImpactG),
    td_vert_speed_fpm: cleanNumber(landing.tdVertSpeedFpm),
    td_ias_kt: cleanNumber(landing.tdIasKt),
    td_gs_kt: cleanNumber(landing.tdGsKt),
    td_pitch_deg: cleanNumber(landing.tdPitchDeg),
    td_crab_angle_deg: cleanNumber(landing.tdCrabAngleDeg),
    flare_duration_sec: cleanNumber(landing.flareDurationSec),
    flare_dist_ft: cleanNumber(landing.flareDistFt),
    lda_ft: cleanNumber(landing.ldaFt),
    max_braking_g: cleanNumber(landing.maxBrakingG),
  };
}

function takeoffDoc(flightId: string, takeoff: FlightTakeoffMetric) {
  return {
    ...identityDoc(flightId, takeoff),
    sequence: takeoff.sequence,
    segment_type: takeoff.segmentType,
    liftoff_time: cleanString(takeoff.liftoffTime),
    ground_roll_ft: cleanNumber(takeoff.groundRollFt),
    ground_roll_duration_sec: cleanNumber(takeoff.groundRollDurationSec),
    time_to_agl100_sec: cleanNumber(takeoff.timeToAgl100Sec),
    time_to_agl500_sec: cleanNumber(takeoff.timeToAgl500Sec),
    rotation_ias_kt: cleanNumber(takeoff.rotationIasKt),
    liftoff_ias_kt: cleanNumber(takeoff.liftoffIasKt),
    rpm_at_liftoff: cleanNumber(takeoff.rpmAtLiftoff),
    map_at_liftoff: cleanNumber(takeoff.mapAtLiftoff),
    fuel_flow_at_liftoff: cleanNumber(takeoff.fuelFlowAtLiftoff),
  };
}

async function deleteByFlight(collectionId: string, flightId: string): Promise<void> {
  if (!databases || !isValidCollectionId(collectionId)) return;
  let cursor: string | null = null;
  while (true) {
    const queries = [Query.equal("flight_id", [flightId]), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, collectionId, queries);
    for (const doc of res.documents) {
      await databases.deleteDocument(DB_ID, collectionId, doc.$id);
    }
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1]?.$id ?? null;
    if (!cursor) break;
  }
}

export async function clearFlightTelemetryMetrics(flightId: string): Promise<{ error: Error | null }> {
  if (!configured() || !metricsCollectionsConfigured()) return { error: null };
  try {
    await Promise.all([
      deleteByFlight(FLIGHT_TELEMETRY_SUMMARIES_COL_ID!, flightId),
      deleteByFlight(FLIGHT_LANDINGS_COL_ID!, flightId),
      deleteByFlight(FLIGHT_TAKEOFFS_COL_ID!, flightId),
    ]);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function replaceFlightTelemetryMetrics(
  flightId: string,
  actorUserId: string,
  metrics: FlightTelemetryMetricsBundle | null,
  actorRole: UserRole = "instrutor",
): Promise<{ error: Error | null }> {
  if (!configured() || !metricsCollectionsConfigured()) return { error: null };
  try {
    await clearFlightTelemetryMetrics(flightId);
    if (!metrics || !databases) return { error: null };

    const permissions = basePermissions(actorUserId, actorRole);
    await databases.createDocument(
      DB_ID,
      FLIGHT_TELEMETRY_SUMMARIES_COL_ID!,
      ID.unique(),
      summaryDoc(flightId, metrics.summary),
      permissions,
    );

    await Promise.all([
      ...metrics.landings.map((landing) =>
        databases!.createDocument(DB_ID, FLIGHT_LANDINGS_COL_ID!, ID.unique(), landingDoc(flightId, landing), permissions),
      ),
      ...metrics.takeoffs.map((takeoff) =>
        databases!.createDocument(DB_ID, FLIGHT_TAKEOFFS_COL_ID!, ID.unique(), takeoffDoc(flightId, takeoff), permissions),
      ),
    ]);

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
