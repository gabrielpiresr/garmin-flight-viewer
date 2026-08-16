"use strict";

const MAX_NEAREST_AD_NM = 12;
const PUBLIC_AD_DISTANCE_BONUS_NM = 8;

function cleanString(value) {
  return String(value ?? "").trim();
}

function identKey(value) {
  return cleanString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseClockMinutes(value) {
  const match = cleanString(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clockFromMinutes(total) {
  const wrapped = ((Number(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateTimeMs(date, hhmm) {
  const day = cleanString(date);
  const time = cleanString(hhmm).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${day}T${time}:00-03:00`);
  return Number.isFinite(ms) ? ms : null;
}

function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

function formatDurationFromIso(fromIso, toIso) {
  const from = Date.parse(fromIso || "");
  const to = Date.parse(toIso || "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "";
  return formatDurationMinutes((to - from) / 60_000);
}

function cleanScheduleNotes(value) {
  return cleanString(value)
    .split("|")
    .map((part) => cleanString(part))
    .filter((part) => {
      if (!part) return false;
      if (part === "GFV escala") return false;
      if (/^Aluno:/i.test(part)) return false;
      if (/^Aeronave:/i.test(part)) return false;
      return true;
    })
    .map((part) => {
      if (/^Agendado via plataforma$/i.test(part)) return "Via NS";
      return part
        .replace(
          /^(Solicitado|Alterado|Cancelado) pelo aluno\s+.+?\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+(?:as|às)\s+(\d{2}:\d{2})/i,
          "$1 pelo aluno em $2 às $3",
        )
        .replace(/^Flexibilidade:/i, "Flex.:");
    })
    .join(" | ");
}

function formatAdLabel(icao, name) {
  const code = cleanString(icao).toUpperCase();
  const label = cleanString(name);
  if (code && label && !label.toUpperCase().includes(code)) return `${code} · ${label}`;
  return code || label;
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isPublicAerodrome(ad) {
  if (ad?.isPublic === true) return true;
  const icao = cleanString(ad?.icao).toUpperCase();
  return icao.startsWith("SB");
}

function nearestAerodrome(aerodromes, lat, lon, maxNm = MAX_NEAREST_AD_NM) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const ad of Array.isArray(aerodromes) ? aerodromes : []) {
    const nm = haversineNm(lat, lon, ad?.lat, ad?.lon);
    if (nm == null || nm > maxNm) continue;
    const score = isPublicAerodrome(ad) ? nm - PUBLIC_AD_DISTANCE_BONUS_NM : nm;
    if (!best || score < bestScore) {
      best = { ...ad, nm };
      bestScore = score;
    }
  }
  return best;
}

function applyScheduleBuffers(blockStart, blockEnd, bufferBeforeMinutes, bufferAfterMinutes) {
  const start = parseClockMinutes(blockStart);
  const end = parseClockMinutes(blockEnd);
  if (start == null) {
    return { takeoff: cleanString(blockStart).slice(0, 5), landing: cleanString(blockEnd).slice(0, 5) };
  }
  const before = Math.max(0, Math.round(Number(bufferBeforeMinutes) || 0));
  const after = Math.max(0, Math.round(Number(bufferAfterMinutes) || 0));
  const takeoff = clockFromMinutes(start + before);
  const landing =
    end == null
      ? ""
      : clockFromMinutes(Math.max(start + before, end - after));
  return { takeoff, landing };
}

function slotWindowMs(slot) {
  const takeoffMs = dateTimeMs(slot.flightDate, slot.scheduledTakeoff || slot.blockStart);
  const landingMs = dateTimeMs(slot.flightDate, slot.scheduledLanding || slot.blockEnd);
  const startMs = takeoffMs != null ? takeoffMs - 45 * 60_000 : null;
  const endMs = landingMs != null ? landingMs + 20 * 60_000 : startMs != null ? startMs + 4 * 60 * 60_000 : null;
  return { startMs, endMs, takeoffMs };
}

function matchScheduleSlot(slots, registration, atIso) {
  const wanted = identKey(registration);
  if (!wanted) return null;
  const atMs = Date.parse(atIso || "") || Date.now();
  const candidates = (Array.isArray(slots) ? slots : []).filter((slot) => identKey(slot?.aircraftIdent) === wanted);
  if (!candidates.length) return null;

  const inWindow = candidates.filter((slot) => {
    const { startMs, endMs } = slotWindowMs(slot);
    if (startMs == null || endMs == null) return false;
    return atMs >= startMs && atMs <= endMs;
  });
  const pool = inWindow.length ? inWindow : candidates;
  return pool.slice().sort((a, b) => {
    const aMs = slotWindowMs(a).takeoffMs;
    const bMs = slotWindowMs(b).takeoffMs;
    const aDelta = aMs == null ? Number.POSITIVE_INFINITY : Math.abs(aMs - atMs);
    const bDelta = bMs == null ? Number.POSITIVE_INFINITY : Math.abs(bMs - atMs);
    return aDelta - bDelta;
  })[0] || null;
}

function icaoOrEmpty(value) {
  const code = cleanString(value).toUpperCase();
  return /^[A-Z]{4}$/.test(code) ? code : "";
}

function pickTakeoffIcao(event, slot) {
  return (
    icaoOrEmpty(event?.origIcao) ||
    icaoOrEmpty(event?.takeoffIcao) ||
    icaoOrEmpty(event?.lastTakeoffIcao) ||
    icaoOrEmpty(slot?.takeoffIcao)
  );
}

function pickLandingIcao(event, slot) {
  return icaoOrEmpty(event?.destIcao) || icaoOrEmpty(event?.landingIcao) || icaoOrEmpty(slot?.landingIcao);
}

module.exports = {
  MAX_NEAREST_AD_NM,
  cleanString,
  identKey,
  parseClockMinutes,
  clockFromMinutes,
  dateTimeMs,
  formatDurationMinutes,
  formatDurationFromIso,
  cleanScheduleNotes,
  formatAdLabel,
  haversineNm,
  isPublicAerodrome,
  nearestAerodrome,
  applyScheduleBuffers,
  matchScheduleSlot,
  pickTakeoffIcao,
  pickLandingIcao,
};
