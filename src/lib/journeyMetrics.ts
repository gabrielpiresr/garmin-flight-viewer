import type {
  JourneyLandingDoc,
  JourneyTakeoffDoc,
  JourneyTelemetrySummaryDoc,
} from "./flightTelemetryMetricsDb";

export type JourneyMonthlyPoint = {
  month: string;
  label: string;
  flights: number;
  hours: number;
  distanceNm: number;
  landings: number;
  smoothLandings: number;
  takeoffs: number;
};

export type JourneyLandingDistributionPoint = {
  name: "Suaves" | "Médios" | "Duros";
  value: number;
};

export type JourneyWeekPoint = {
  label: string;
  active: boolean;
  current: boolean;
};

export type JourneyBadge = {
  id: string;
  title: string;
  description: string;
  achieved: boolean;
  tone: "emerald" | "sky" | "violet" | "amber";
};

export type JourneyMetrics = {
  hasData: boolean;
  streakWeeks: number;
  latestFlightDate: string | null;
  totals: {
    flights: number;
    hours: number;
    distanceNm: number;
    landings: number;
    smoothLandings: number;
    mediumLandings: number;
    hardLandings: number;
    takeoffs: number;
    tgls: number;
    instructors: number;
    students: number;
    aircraft: number;
    airports: number;
    smoothLandingRate: number;
  };
  records: {
    softestLandingFpm: number | null;
    softestLandingG: number | null;
    slowestLandingIasKt: number | null;
    slowestLandingGsKt: number | null;
    maxLandingGsKt: number | null;
    longestSoftLandingStreak: number;
    longestTakeoffRollFt: number | null;
    shortestTakeoffRollFt: number | null;
    fastestTakeoffIasKt: number | null;
    fastestTakeoffTimeSec: number | null;
    averageTakeoffRollFt: number | null;
    maxHeadwindKt: number | null;
    maxTailwindKt: number | null;
    maxCrosswindKt: number | null;
    bestMonth: JourneyMonthlyPoint | null;
  };
  monthly: JourneyMonthlyPoint[];
  weeklyStreak: JourneyWeekPoint[];
  landingDistribution: JourneyLandingDistributionPoint[];
  badges: JourneyBadge[];
  level: {
    name: string;
    points: number;
    nextPoints: number | null;
    progressPct: number;
  };
  airports: string[];
};

type AggregateInput = {
  summaries: JourneyTelemetrySummaryDoc[];
  landings: JourneyLandingDoc[];
  takeoffs: JourneyTakeoffDoc[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNumbers<T>(items: T[], read: (item: T) => number | null | undefined): number {
  return items.reduce((acc, item) => acc + (finite(read(item)) ?? 0), 0);
}

function minNumber(values: Array<number | null | undefined>): number | null {
  const nums = values.map(finite).filter((value): value is number => value !== null);
  return nums.length ? Math.min(...nums) : null;
}

function maxNumber(values: Array<number | null | undefined>): number | null {
  const nums = values.map(finite).filter((value): value is number => value !== null);
  return nums.length ? Math.max(...nums) : null;
}

function averageNumber(values: Array<number | null | undefined>): number | null {
  const nums = values.map(finite).filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((acc, value) => acc + value, 0) / nums.length;
}

function dateValue(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(iso: string | null | undefined): string | null {
  return iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null;
}

function monthLabel(key: string): string {
  const date = new Date(`${key}-15T12:00:00Z`);
  const label = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  return label.replace(".", "");
}

function weekIndex(iso: string | null | undefined): number | null {
  const date = dateValue(iso);
  if (!date) return null;
  const day = date.getUTCDay() || 7;
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1);
  return Math.floor(start / WEEK_MS);
}

function parseAerodromes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function sortLanding(a: JourneyLandingDoc, b: JourneyLandingDoc): number {
  const aTime = a.touchdown_time ?? `${a.flight_date ?? ""}T${a.start_time ?? "00:00:00"}`;
  const bTime = b.touchdown_time ?? `${b.flight_date ?? ""}T${b.start_time ?? "00:00:00"}`;
  const byTime = aTime.localeCompare(bTime);
  if (byTime !== 0) return byTime;
  return (a.sequence ?? 0) - (b.sequence ?? 0);
}

function longestSmoothLandingStreak(landings: JourneyLandingDoc[]): number {
  let current = 0;
  let best = 0;
  [...landings].sort(sortLanding).forEach((landing) => {
    if (landing.impact_label === "Low") {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  });
  return best;
}

function buildMonthly(summaries: JourneyTelemetrySummaryDoc[]): JourneyMonthlyPoint[] {
  const map = new Map<string, JourneyMonthlyPoint>();
  summaries.forEach((summary) => {
    const key = monthKey(summary.flight_date);
    if (!key) return;
    const current =
      map.get(key) ??
      ({
        month: key,
        label: monthLabel(key),
        flights: 0,
        hours: 0,
        distanceNm: 0,
        landings: 0,
        smoothLandings: 0,
        takeoffs: 0,
      } satisfies JourneyMonthlyPoint);
    current.flights += 1;
    current.hours += (finite(summary.duration_sec) ?? 0) / 3600;
    current.distanceNm += finite(summary.distance_nm) ?? 0;
    current.landings += summary.landing_count ?? 0;
    current.smoothLandings += summary.smooth_landing_count ?? 0;
    current.takeoffs += summary.takeoff_count ?? 0;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function buildBadges(metrics: Pick<JourneyMetrics, "streakWeeks" | "totals">): JourneyBadge[] {
  return [
    {
      id: "first-flight",
      title: "Primeira etapa",
      description: "Registrou o primeiro voo com telemetria.",
      achieved: metrics.totals.flights >= 1,
      tone: "sky",
    },
    {
      id: "steady-weeks",
      title: "Ritmo de treinamento",
      description: "Manteve 4 semanas consecutivas com voos.",
      achieved: metrics.streakWeeks >= 4,
      tone: "emerald",
    },
    {
      id: "soft-touch",
      title: "Toque de seda",
      description: "Alcançou 70% de pousos suaves com pelo menos 10 pousos.",
      achieved: metrics.totals.landings >= 10 && metrics.totals.smoothLandingRate >= 70,
      tone: "violet",
    },
    {
      id: "navigator",
      title: "Navegador",
      description: "Somou 100 NM navegadas.",
      achieved: metrics.totals.distanceNm >= 100,
      tone: "sky",
    },
    {
      id: "landing-ace",
      title: "Mão calibrada",
      description: "Acumulou 50 pousos registrados.",
      achieved: metrics.totals.landings >= 50,
      tone: "emerald",
    },
  ];
}

function buildWeeklyStreak(weekKeys: number[]): JourneyWeekPoint[] {
  const latestWeek = weekKeys.at(-1);
  const activeWeeks = new Set(weekKeys);
  if (latestWeek === undefined) {
    return ["S-6", "S-5", "S-4", "S-3", "S-2", "S-1", "Atual"].map((label, index) => ({
      label,
      active: false,
      current: index === 6,
    }));
  }
  return [-6, -5, -4, -3, -2, -1, 0].map((offset) => ({
    label: offset === 0 ? "Atual" : `S${offset}`,
    active: activeWeeks.has(latestWeek + offset),
    current: offset === 0,
  }));
}

function buildLevel(totals: JourneyMetrics["totals"], achievedBadges: number): JourneyMetrics["level"] {
  const points = Math.round(
    totals.flights * 80 +
      totals.hours * 45 +
      totals.smoothLandings * 25 +
      totals.distanceNm * 2 +
      totals.airports * 60 +
      achievedBadges * 120,
  );
  const levels = [
    { name: "Aluno em subida", points: 0 },
    { name: "Navegador visual", points: 600 },
    { name: "Piloto consistente", points: 1600 },
    { name: "Mestre do circuito", points: 3200 },
    { name: "Comandante da jornada", points: 5600 },
  ];
  const currentIndex = levels.findIndex((level, index) => {
    const next = levels[index + 1];
    return points >= level.points && (!next || points < next.points);
  });
  const current = levels[Math.max(currentIndex, 0)] ?? levels[0]!;
  const next = levels[Math.max(currentIndex, 0) + 1] ?? null;
  const progressPct = next ? Math.round(((points - current.points) / (next.points - current.points)) * 100) : 100;
  return {
    name: current.name,
    points,
    nextPoints: next?.points ?? null,
    progressPct: Math.max(0, Math.min(100, progressPct)),
  };
}

export function aggregateJourneyMetrics({ summaries, landings, takeoffs }: AggregateInput): JourneyMetrics {
  const totalLandingsFromSummaries = sumNumbers(summaries, (summary) => summary.landing_count);
  const totalTakeoffsFromSummaries = sumNumbers(summaries, (summary) => summary.takeoff_count);
  const smoothFromSummaries = sumNumbers(summaries, (summary) => summary.smooth_landing_count);
  const mediumFromSummaries = sumNumbers(summaries, (summary) => summary.medium_landing_count);
  const hardFromSummaries = sumNumbers(summaries, (summary) => summary.hard_landing_count);
  const landingsTotal = totalLandingsFromSummaries || landings.length;
  const takeoffsTotal = totalTakeoffsFromSummaries || takeoffs.length;
  const smoothLandings = smoothFromSummaries || landings.filter((landing) => landing.impact_label === "Low").length;
  const mediumLandings = mediumFromSummaries || landings.filter((landing) => landing.impact_label === "Medium").length;
  const hardLandings = hardFromSummaries || landings.filter((landing) => landing.impact_label === "High").length;
  const airports = new Set<string>();
  const instructors = new Set<string>();
  const students = new Set<string>();
  const aircraft = new Set<string>();

  summaries.forEach((summary) => {
    parseAerodromes(summary.aerodromes_json).forEach((code) => airports.add(code.trim().toUpperCase()));
    if (summary.instructor_user_id) instructors.add(summary.instructor_user_id);
    if (summary.student_user_id) students.add(summary.student_user_id);
    if (summary.aircraft_ident) aircraft.add(summary.aircraft_ident);
  });

  const monthly = buildMonthly(summaries);
  const weekKeys = Array.from(new Set(summaries.map((summary) => weekIndex(summary.flight_date)).filter((week): week is number => week !== null))).sort(
    (a, b) => a - b,
  );
  let streakWeeks = 0;
  for (let i = weekKeys.length - 1; i >= 0; i -= 1) {
    if (i === weekKeys.length - 1 || weekKeys[i + 1]! - weekKeys[i]! === 1) streakWeeks += 1;
    else break;
  }

  const totals: JourneyMetrics["totals"] = {
    flights: summaries.length,
    hours: sumNumbers(summaries, (summary) => summary.duration_sec) / 3600,
    distanceNm: sumNumbers(summaries, (summary) => summary.distance_nm),
    landings: landingsTotal,
    smoothLandings,
    mediumLandings,
    hardLandings,
    takeoffs: takeoffsTotal,
    tgls: sumNumbers(summaries, (summary) => summary.tgl_count),
    instructors: instructors.size,
    students: students.size,
    aircraft: aircraft.size,
    airports: airports.size || Math.max(...summaries.map((summary) => summary.aerodrome_count ?? 0), 0),
    smoothLandingRate: landingsTotal > 0 ? (smoothLandings / landingsTotal) * 100 : 0,
  };

  const bestMonth =
    monthly.length > 0
      ? [...monthly].sort((a, b) => b.hours + b.landings * 0.2 + b.distanceNm * 0.02 - (a.hours + a.landings * 0.2 + a.distanceNm * 0.02))[0]!
      : null;
  const summarySoftestFpm = maxNumber(summaries.map((summary) => summary.best_touchdown_vert_speed_fpm));
  const landingSoftestFpm = maxNumber(landings.map((landing) => landing.td_vert_speed_fpm));
  const summarySoftestG = minNumber(summaries.map((summary) => summary.best_touchdown_g));
  const landingSoftestG = minNumber(landings.map((landing) => landing.td_impact_g));

  const records: JourneyMetrics["records"] = {
    softestLandingFpm: landingSoftestFpm ?? summarySoftestFpm,
    softestLandingG: landingSoftestG ?? summarySoftestG,
    slowestLandingIasKt:
      minNumber(landings.map((landing) => landing.td_ias_kt)) ??
      minNumber(summaries.map((summary) => summary.slowest_landing_ias_kt)),
    slowestLandingGsKt:
      minNumber(landings.map((landing) => landing.td_gs_kt)) ??
      minNumber(summaries.map((summary) => summary.slowest_landing_gs_kt)),
    maxLandingGsKt: maxNumber(landings.map((landing) => landing.td_gs_kt)),
    longestSoftLandingStreak: longestSmoothLandingStreak(landings),
    longestTakeoffRollFt:
      maxNumber(takeoffs.map((takeoff) => takeoff.ground_roll_ft)) ??
      maxNumber(summaries.map((summary) => summary.longest_takeoff_ground_roll_ft)),
    shortestTakeoffRollFt:
      minNumber(takeoffs.map((takeoff) => takeoff.ground_roll_ft)) ??
      minNumber(summaries.map((summary) => summary.shortest_takeoff_ground_roll_ft)),
    fastestTakeoffIasKt:
      maxNumber(takeoffs.map((takeoff) => takeoff.liftoff_ias_kt ?? takeoff.rotation_ias_kt)) ??
      maxNumber(summaries.map((summary) => summary.fastest_takeoff_ias_kt)),
    fastestTakeoffTimeSec: minNumber(takeoffs.map((takeoff) => takeoff.ground_roll_duration_sec)),
    averageTakeoffRollFt: averageNumber(takeoffs.map((takeoff) => takeoff.ground_roll_ft)),
    maxHeadwindKt: maxNumber(summaries.map((summary) => summary.max_headwind_kt)),
    maxTailwindKt: maxNumber(summaries.map((summary) => summary.max_tailwind_kt)),
    maxCrosswindKt: maxNumber(summaries.map((summary) => summary.max_crosswind_kt)),
    bestMonth,
  };

  const badges = buildBadges({ streakWeeks, totals });
  return {
    hasData: summaries.length > 0 || landings.length > 0 || takeoffs.length > 0,
    streakWeeks,
    latestFlightDate: summaries.map((summary) => summary.flight_date).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null,
    totals,
    records,
    monthly,
    weeklyStreak: buildWeeklyStreak(weekKeys),
    landingDistribution: [
      { name: "Suaves", value: smoothLandings },
      { name: "Médios", value: mediumLandings },
      { name: "Duros", value: hardLandings },
    ],
    badges,
    level: buildLevel(totals, badges.filter((badge) => badge.achieved).length),
    airports: Array.from(airports).sort((a, b) => a.localeCompare(b)),
  };
}
