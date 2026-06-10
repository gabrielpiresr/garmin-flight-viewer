import { decodeFlightRecord } from "./flightRecordCodec";
import type { SavedFlightFull, SavedFlightListItem } from "./flightsDb";
import type { JourneyMetrics } from "./journeyMetrics";
import type { TrainingTrack } from "../types/trainingTrack";
import type { EvaluatedJourneyReward, JourneyReward, RewardMetric, RewardRules } from "../types/rewards";

type FormationProgress = {
  selectedTrack: TrainingTrack | null;
  completedMissionIds: Set<string>;
  completedStageIds: Set<string>;
};

export type RewardMetricContext = {
  journey: JourneyMetrics;
  flights: SavedFlightListItem[];
  fullFlights?: SavedFlightFull[];
  formation?: FormationProgress | null;
  /** Matrículas (maiúsculas) de aeronaves tipo "ground" — voos nelas não contam para conquistas. */
  groundAircraftIdents?: Set<string>;
};

export function normalizeAircraftIdent(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function withoutGroundFlights(context: RewardMetricContext): RewardMetricContext {
  const ground = context.groundAircraftIdents;
  if (!ground || ground.size === 0) return context;
  return {
    ...context,
    flights: context.flights.filter((flight) => !ground.has(normalizeAircraftIdent(flight.aircraft_ident))),
    fullFlights: context.fullFlights?.filter((flight) => !ground.has(normalizeAircraftIdent(flight.aircraft_ident))),
  };
}

function parseTimeToHours(value: string | null | undefined): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,3}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || 0) + Number(hhmm[2] || 0) / 60;
  const decimal = Number(raw.replace(",", "."));
  return Number.isFinite(decimal) && decimal > 0 ? decimal : 0;
}

function parseDistanceNm(value: string | null | undefined): number {
  const parsed = Number(String(value || "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sheetTotals(fullFlights: SavedFlightFull[]) {
  let ifrHours = 0;
  let nightHours = 0;
  let navigationHours = 0;
  let navigationDistanceNm = 0;
  const navigationFlightIds = new Set<string>();

  for (const flight of fullFlights) {
    const meta = decodeFlightRecord(flight.csv_text).meta;
    if (!meta) continue;
    let flightHasNavigation = false;
    for (const leg of meta.legs) {
      const navHours = parseTimeToHours(leg.navTime);
      const navDistance = parseDistanceNm(leg.distance);
      ifrHours += parseTimeToHours(leg.ifrTime);
      nightHours += parseTimeToHours(leg.nightTime);
      navigationHours += navHours;
      navigationDistanceNm += navDistance;
      if (navHours > 0 || navDistance > 0) flightHasNavigation = true;
    }
    if (flightHasNavigation) navigationFlightIds.add(flight.id);
  }

  return {
    ifrHours,
    nightHours,
    navigationHours,
    navigationDistanceNm,
    navigationFlightCount: navigationFlightIds.size,
  };
}

type SheetTotals = ReturnType<typeof sheetTotals>;

type RewardEvaluationCache = {
  sheetTotals?: SheetTotals;
  flightTotals?: {
    flightCount: number;
    totalHours: number;
    totalDistanceNm: number;
    totalLandings: number;
  };
};

function getSheetTotals(fullFlights: SavedFlightFull[], cache?: RewardEvaluationCache): SheetTotals {
  if (!cache) return sheetTotals(fullFlights);
  cache.sheetTotals ??= sheetTotals(fullFlights);
  return cache.sheetTotals;
}

function flightTotals(flights: SavedFlightListItem[]) {
  return flights.reduce(
    (acc, flight) => {
      acc.flightCount += 1;
      acc.totalHours += (flight.block_time_minutes ?? Math.round((flight.duration_sec ?? 0) / 60)) / 60;
      acc.totalDistanceNm += flight.total_miles ?? 0;
      acc.totalLandings += Math.max(0, flight.landings ?? 0);
      return acc;
    },
    { flightCount: 0, totalHours: 0, totalDistanceNm: 0, totalLandings: 0 },
  );
}

function getFlightTotals(
  flights: SavedFlightListItem[],
  cache?: RewardEvaluationCache,
): { flightCount: number; totalHours: number; totalDistanceNm: number; totalLandings: number } {
  if (!cache) return flightTotals(flights);
  cache.flightTotals ??= flightTotals(flights);
  return cache.flightTotals;
}

function missionTypeForFlight(flight: SavedFlightListItem, track: TrainingTrack | null | undefined): string | null {
  if (!track || !flight.training_mission_id) return null;
  for (const stage of track.stages) {
    const mission = stage.missions.find((item) => item.id === flight.training_mission_id);
    if (mission) return mission.type;
  }
  return null;
}

function metricValueWithCache(metric: RewardMetric, context: RewardMetricContext, cache?: RewardEvaluationCache): number {
  const { journey, flights, formation } = context;
  const fullFlights = context.fullFlights ?? [];

  switch (metric) {
    case "flight_count":
      return Math.max(journey.totals.flights, getFlightTotals(flights, cache).flightCount);
    case "total_hours":
      return Math.max(journey.totals.hours, getFlightTotals(flights, cache).totalHours);
    case "total_distance_nm":
      return Math.max(journey.totals.distanceNm, getFlightTotals(flights, cache).totalDistanceNm);
    case "total_landings":
      return Math.max(journey.totals.landings, getFlightTotals(flights, cache).totalLandings);
    case "smooth_landings":
      return journey.totals.smoothLandings;
    case "smooth_landing_rate":
      return journey.totals.smoothLandingRate;
    case "smooth_landing_streak":
      return journey.records.longestSoftLandingStreak;
    case "weekly_streak":
      return journey.streakWeeks;
    case "longest_flight_distance_nm":
      return flights.reduce((max, flight) => Math.max(max, flight.total_miles ?? 0), 0);
    case "longest_flight_duration_min":
      return flights.reduce((max, flight) => {
        const minutes = flight.block_time_minutes ?? Math.round((flight.duration_sec ?? 0) / 60);
        return Math.max(max, minutes);
      }, 0);
    case "solo_flight_count":
      return flights.filter((flight) => missionTypeForFlight(flight, formation?.selectedTrack) === "SL").length;
    case "solo_hours":
      return flights
        .filter((flight) => missionTypeForFlight(flight, formation?.selectedTrack) === "SL")
        .reduce((acc, flight) => {
          const minutes = flight.block_time_minutes ?? Math.round((flight.duration_sec ?? 0) / 60);
          return acc + minutes / 60;
        }, 0);
    case "night_hours":
      return getSheetTotals(fullFlights, cache).nightHours;
    case "ifr_hours":
      return getSheetTotals(fullFlights, cache).ifrHours;
    case "navigation_hours":
      return getSheetTotals(fullFlights, cache).navigationHours;
    case "navigation_distance_nm":
      return getSheetTotals(fullFlights, cache).navigationDistanceNm;
    case "navigation_flight_count":
      return getSheetTotals(fullFlights, cache).navigationFlightCount;
    case "mission_completed_count":
      return formation?.completedMissionIds.size ?? 0;
    case "stage_completed_count":
      return formation?.completedStageIds.size ?? 0;
    default:
      return 0;
  }
}

export function metricValue(metric: RewardMetric, context: RewardMetricContext): number {
  return metricValueWithCache(metric, withoutGroundFlights(context));
}

function conditionProgress(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function evaluateRules(rules: RewardRules, context: RewardMetricContext, cache: RewardEvaluationCache) {
  const conditions = rules.conditions.length > 0 ? rules.conditions : [];
  if (conditions.length === 0) return { achieved: false, progressPct: 0, currentValue: 0, targetValue: 0 };

  const evaluated = conditions.map((condition) => {
    const current = metricValueWithCache(condition.metric, context, cache);
    const target = condition.value;
    const achieved =
      condition.operator === "lte" ? current <= target : condition.operator === "eq" ? current === target : current >= target;
    return { current, target, achieved, progressPct: conditionProgress(current, target) };
  });
  const achieved = rules.mode === "any" ? evaluated.some((item) => item.achieved) : evaluated.every((item) => item.achieved);
  const progressPct =
    rules.mode === "any"
      ? Math.max(...evaluated.map((item) => item.progressPct))
      : Math.min(...evaluated.map((item) => item.progressPct));
  const primary = evaluated[0] ?? { current: 0, target: 0 };
  return { achieved, progressPct, currentValue: primary.current, targetValue: primary.target };
}

export function evaluateRewards(rewards: JourneyReward[], context: RewardMetricContext): EvaluatedJourneyReward[] {
  const cache: RewardEvaluationCache = {};
  const scopedContext = withoutGroundFlights(context);
  return rewards
    .filter((reward) => reward.isActive)
    .map((reward) => ({ ...reward, ...evaluateRules(reward.rules, scopedContext, cache) }))
    .sort((a, b) => Number(b.achieved) - Number(a.achieved) || a.order - b.order || a.title.localeCompare(b.title, "pt-BR"));
}

export function completedStagesForTrack(track: TrainingTrack | null, completedMissionIds: Set<string>): Set<string> {
  const completed = new Set<string>();
  if (!track) return completed;
  for (const stage of track.stages) {
    if (stage.missions.length > 0 && stage.missions.every((mission) => completedMissionIds.has(mission.id))) {
      completed.add(stage.id);
    }
  }
  return completed;
}

export function rewardsToLegacyBadges(rewards: EvaluatedJourneyReward[]): JourneyMetrics["badges"] {
  const tones: JourneyMetrics["badges"][number]["tone"][] = ["sky", "emerald", "violet", "amber"];
  return rewards.map((reward, index) => ({
    id: reward.id,
    title: reward.title,
    description: reward.description,
    achieved: reward.achieved,
    tone: tones[index % tones.length]!,
    visual: reward.visual,
    progressPct: reward.progressPct,
  }));
}
