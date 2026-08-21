const DEFAULT_HOURS_LOOKUP = {
  weekday: {
    low: { first: 4, second: 6 },
    medium: { first: 8, second: 10 },
    high: { first: 12, second: 14 },
  },
  weekend: {
    low: { first: 3, second: 4 },
    medium: { first: 6, second: 8 },
    high: { first: 10, second: 12 },
  },
  mixed: {
    low: { first: 4, second: 5 },
    medium: { first: 7, second: 9 },
    high: { first: 11, second: 13 },
  },
};

const CALENDARS = ["weekday", "weekend", "mixed"];
const INTENSITIES = ["low", "medium", "high"];
const COURSES = ["PP", "PC", "INVA", "HOBBY"];
const RATED_COURSES = ["PP", "PC", "INVA"];

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asLookup(raw) {
  const source = raw && typeof raw === "object" ? raw : DEFAULT_HOURS_LOOKUP;
  const table = {};
  for (const calendar of CALENDARS) {
    table[calendar] = {};
    for (const intensity of INTENSITIES) {
      const half = source?.[calendar]?.[intensity] || DEFAULT_HOURS_LOOKUP[calendar][intensity];
      table[calendar][intensity] = {
        first: clamp(half.first, 0, 80, DEFAULT_HOURS_LOOKUP[calendar][intensity].first),
        second: clamp(half.second, 0, 80, DEFAULT_HOURS_LOOKUP[calendar][intensity].second),
      };
    }
  }
  return table;
}

function sanitizeCapacityProjectionSettings(input, fallbackAvgHoursPerDay) {
  const raw = input && typeof input === "object" ? input : {};
  const avgFallback = Number(fallbackAvgHoursPerDay) > 0 ? Number(fallbackAvgHoursPerDay) : 5;
  const excluded = Array.isArray(raw.excludedCrmStatusNames)
    ? raw.excludedCrmStatusNames.map((name) => String(name).trim()).filter(Boolean).slice(0, 20)
    : ["Desistente", "Concluído", "Pausado"];
  const courseHours = raw.courseHours && typeof raw.courseHours === "object" ? raw.courseHours : {};
  return {
    abandonmentDays: Math.round(clamp(raw.abandonmentDays, 7, 365, 30)),
    lookbackDays: Math.round(clamp(raw.lookbackDays, 30, 365, 90)),
    horizonMonths: Math.round(clamp(raw.horizonMonths, 3, 24, 12)),
    decisionHorizonMonths: Math.round(clamp(raw.decisionHorizonMonths, 1, 12, 6)),
    slackPercent: clamp(raw.slackPercent, 0, 50, 10),
    weekendShareHigh: clamp(raw.weekendShareHigh, 0.5, 1, 0.7),
    weekendShareLow: clamp(raw.weekendShareLow, 0, 0.5, 0.3),
    intensityLowMaxHoursPerMonth: clamp(raw.intensityLowMaxHoursPerMonth, 0.5, 40, 5),
    intensityHighMinHoursPerMonth: clamp(raw.intensityHighMinHoursPerMonth, 1, 80, 10),
    weekdayAvgHoursPerDay: clamp(raw.weekdayAvgHoursPerDay, 0.25, 16, avgFallback),
    weekendAvgHoursPerDay: clamp(raw.weekendAvgHoursPerDay, 0.25, 16, avgFallback),
    courseHours: {
      PP: clamp(courseHours.PP, 5, 200, 42),
      PC: clamp(courseHours.PC, 5, 300, 110),
      INVA: clamp(courseHours.INVA, 1, 80, 15),
    },
    conversionPpToPc: clamp(raw.conversionPpToPc, 0, 1, 0.7),
    conversionPcToInva: clamp(raw.conversionPcToInva, 0, 1, 0.4),
    hoursLookup: asLookup(raw.hoursLookup),
    hoursLookupSource: raw.hoursLookupSource === "custom" ? "custom" : "suggested",
    intakeTemplate: {
      course: RATED_COURSES.includes(raw.intakeTemplate?.course) ? raw.intakeTemplate.course : "PP",
      calendar: CALENDARS.includes(raw.intakeTemplate?.calendar) ? raw.intakeTemplate.calendar : "weekend",
      intensity: INTENSITIES.includes(raw.intakeTemplate?.intensity) ? raw.intakeTemplate.intensity : "medium",
    },
    excludedCrmStatusNames: excluded.length ? excluded : ["Desistente", "Concluído", "Pausado"],
  };
}

function projectionCourseCode(value) {
  const source = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!source.trim()) return null;
  if (/\binv\b|instrutor|inva/.test(source)) return "INVA";
  if (/\bpc\b|piloto comercial|comercial/.test(source)) return "PC";
  if (/\bpp\b|piloto privado|privado/.test(source)) return "PP";
  return null;
}

function isWeekendIso(isoDate) {
  const day = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function resolveCourseFlownHours({ careerHours, currentCourse, currentTrackId, flights }) {
  const career = Math.max(0, Number(careerHours) || 0);
  if (!currentCourse || currentCourse === "HOBBY") return Number(career.toFixed(1));
  let current = 0;
  let other = 0;
  for (const flight of flights || []) {
    const hours = Number(flight.hours) || 0;
    if (!(hours > 0)) continue;
    const flightCourse = projectionCourseCode(flight.trackName);
    const onCurrentTrack = Boolean(currentTrackId && flight.trackId && flight.trackId === currentTrackId);
    const onCurrentCourse = flightCourse === currentCourse;
    const onOtherCourse = Boolean(flightCourse && flightCourse !== currentCourse);
    if (onCurrentTrack || onCurrentCourse) current += hours;
    else if (onOtherCourse) other += hours;
  }
  if (current > 0.05) return Number(current.toFixed(1));
  if (other > 0.05) return Number(Math.max(0, career - other).toFixed(1));
  return Number(career.toFixed(1));
}

module.exports = {
  sanitizeCapacityProjectionSettings,
  projectionCourseCode,
  isWeekendIso,
  resolveCourseFlownHours,
};
