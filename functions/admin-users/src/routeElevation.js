/**
 * OpenTopoData (SRTM) elevation proxy for planned-route vertical profiles.
 * Public API: max 100 locations/request, 1 call/sec, 1000 calls/day.
 */

const OPENTOPO_URL = "https://api.opentopodata.org/v1/srtm30m";
const DATASET = "srtm30m";
const MAX_WAYPOINTS = 40;
const DEFAULT_SAMPLES = 80;
const MAX_SAMPLES = 100;
const MIN_SAMPLES = 10;
const M_TO_FT = 3.28084;
const MIN_INTERVAL_MS = 1100;

let lastCallAt = 0;
let queue = Promise.resolve();

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeWaypoints(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const lat = cleanNumber(item?.lat ?? item?.latitude);
    const lng = cleanNumber(item?.lng ?? item?.lon ?? item?.longitude);
    if (lat == null || lng == null) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    out.push({ lat, lng });
    if (out.length >= MAX_WAYPOINTS) break;
  }
  return out;
}

function sanitizeSamples(raw, waypointCount) {
  const n = Number(raw);
  const fallback = Math.min(DEFAULT_SAMPLES, Math.max(MIN_SAMPLES, waypointCount * 8));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.round(n)));
}

function waitForRateLimit() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now);
  return new Promise((resolve) => {
    setTimeout(() => {
      lastCallAt = Date.now();
      resolve();
    }, wait);
  });
}

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchOpenTopo({ locations, samples }) {
  await waitForRateLimit();
  const body = JSON.stringify({
    locations,
    samples,
    interpolation: "bilinear",
    nodata_value: "null",
  });
  const response = await fetch(OPENTOPO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const msg =
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      `OpenTopoData HTTP ${response.status}`;
    throw Object.assign(new Error(msg), { status: response.status >= 500 ? 502 : 400 });
  }
  if (data.status && String(data.status).toUpperCase() !== "OK") {
    throw Object.assign(new Error(data.error || `OpenTopoData status ${data.status}`), {
      status: 502,
    });
  }
  return data;
}

/**
 * Sample terrain elevation along a route.
 * @param {{ waypoints?: unknown, samples?: unknown }} input
 */
async function fetchRouteElevation(input = {}) {
  const waypoints = sanitizeWaypoints(input.waypoints);
  if (waypoints.length < 2) {
    throw Object.assign(new Error("Informe ao menos 2 waypoints com lat/lng."), { status: 400 });
  }
  const samples = sanitizeSamples(input.samples, waypoints.length);
  const locations = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");

  return enqueue(async () => {
    const data = await fetchOpenTopo({ locations, samples });
    const results = Array.isArray(data.results) ? data.results : [];
    const count = results.length;
    const points = results.map((row, index) => {
      const elevM = cleanNumber(row?.elevation);
      const lat = cleanNumber(row?.location?.lat) ?? null;
      const lng = cleanNumber(row?.location?.lng) ?? null;
      const elevFt = elevM == null ? null : Math.round(elevM * M_TO_FT);
      const distanceFraction = count <= 1 ? 0 : index / (count - 1);
      return { distanceFraction, elevFt, elevM, lat, lng };
    });
    return {
      points,
      dataset: DATASET,
      samples: count,
      fetchedAt: new Date().toISOString(),
    };
  });
}

module.exports = {
  fetchRouteElevation,
  sanitizeWaypoints,
  sanitizeSamples,
};
