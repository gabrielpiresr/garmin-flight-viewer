/**
 * Flightradar24 API proxy + school radar settings.
 * Token stays server-side (env or platform settings). Never returned to clients.
 */

const FR24_API_BASE = "https://fr24api.flightradar24.com/api";
const SETTINGS_KEY = "flightRadarSettings";
const MAX_REGISTRATIONS = 15;
const DEFAULT_POLL_INTERVAL_SEC = 60;
const DEFAULT_MAP_CENTER = { lat: -22.9754, lon: -44.3074, zoom: 10 };

function cleanString(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRegistration(value) {
  return cleanString(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function sanitizeRegistrations(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const reg = normalizeRegistration(item);
    if (!reg || seen.has(reg)) continue;
    seen.add(reg);
    out.push(reg);
    if (out.length >= 40) break;
  }
  return out;
}

function sanitizePollInterval(raw) {
  const n = Number(raw);
  // Migrate previous 15s default to 60s to cut credit burn.
  if (!Number.isFinite(n) || n === 15) return DEFAULT_POLL_INTERVAL_SEC;
  return Math.min(300, Math.max(30, Math.round(n)));
}

function sanitizeMapCenter(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  const zoom = Number(raw?.zoom);
  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_MAP_CENTER.lat,
    lon: Number.isFinite(lon) ? lon : DEFAULT_MAP_CENTER.lon,
    zoom: Number.isFinite(zoom) ? Math.min(16, Math.max(4, Math.round(zoom))) : DEFAULT_MAP_CENTER.zoom,
  };
}

function defaultSettings() {
  return {
    trackedRegistrations: [],
    pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC,
    mapCenter: { ...DEFAULT_MAP_CENTER },
    hasApiToken: Boolean(cleanString(process.env.FLIGHTRADAR24_API_TOKEN)),
    updatedAt: null,
  };
}

function publicSettings(raw, updatedAt) {
  const apiToken = cleanString(raw?.apiToken);
  const envToken = cleanString(process.env.FLIGHTRADAR24_API_TOKEN);
  return {
    trackedRegistrations: sanitizeRegistrations(raw?.trackedRegistrations),
    pollIntervalSec: sanitizePollInterval(raw?.pollIntervalSec),
    mapCenter: sanitizeMapCenter(raw?.mapCenter),
    hasApiToken: Boolean(apiToken || envToken),
    updatedAt: updatedAt || raw?.updatedAt || null,
  };
}

async function loadRawSettings(deps) {
  const doc = await deps.getSettingDoc(SETTINGS_KEY);
  if (!doc) return { raw: {}, updatedAt: null };
  let raw = {};
  try {
    raw = JSON.parse(doc.settings_json || "{}");
  } catch {
    raw = {};
  }
  return { raw, updatedAt: doc.$updatedAt || raw.updatedAt || null };
}

async function loadSettings(deps) {
  const { raw, updatedAt } = await loadRawSettings(deps);
  return publicSettings(raw, updatedAt);
}

async function resolveApiToken(deps) {
  const envToken = cleanString(process.env.FLIGHTRADAR24_API_TOKEN);
  if (envToken) return envToken;
  const { raw } = await loadRawSettings(deps);
  return cleanString(raw?.apiToken);
}

async function saveSettings(deps, input) {
  const { raw } = await loadRawSettings(deps);
  const nextToken = cleanString(input?.apiToken);
  const keepToken = nextToken || cleanString(raw?.apiToken);
  const next = {
    trackedRegistrations: sanitizeRegistrations(
      input?.trackedRegistrations ?? raw?.trackedRegistrations,
    ),
    pollIntervalSec: sanitizePollInterval(
      input?.pollIntervalSec ?? raw?.pollIntervalSec,
    ),
    mapCenter: sanitizeMapCenter(input?.mapCenter ?? raw?.mapCenter),
    updatedAt: nowIso(),
  };
  if (keepToken) next.apiToken = keepToken;

  const saved = await deps.upsertPlatformSettingDoc(SETTINGS_KEY, next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar as configurações do Radar."), {
      status: 500,
    });
  }
  return publicSettings(next, next.updatedAt);
}

async function fr24Fetch(token, path, query = {}) {
  if (!token) {
    throw Object.assign(
      new Error(
        "Token Flightradar24 não configurado. Defina FLIGHTRADAR24_API_TOKEN ou salve o token nas configurações do Radar.",
      ),
      { status: 400 },
    );
  }
  const url = new URL(`${FR24_API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Version": "v1",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      cleanString(body?.details) ||
      cleanString(body?.message) ||
      `Falha Flightradar24 (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 502 : response.status });
  }
  return body;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function normalizePosition(row) {
  if (!row || typeof row !== "object") return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    fr24Id: cleanString(row.fr24_id),
    flight: cleanString(row.flight) || null,
    callsign: cleanString(row.callsign) || null,
    lat,
    lon,
    track: Number.isFinite(Number(row.track)) ? Number(row.track) : null,
    alt: Number.isFinite(Number(row.alt)) ? Number(row.alt) : null,
    gspeed: Number.isFinite(Number(row.gspeed)) ? Number(row.gspeed) : null,
    vspeed: Number.isFinite(Number(row.vspeed)) ? Number(row.vspeed) : null,
    squawk: row.squawk != null ? String(row.squawk) : null,
    timestamp: cleanString(row.timestamp) || null,
    source: cleanString(row.source) || null,
    hex: cleanString(row.hex) || null,
    type: cleanString(row.type) || null,
    reg: normalizeRegistration(row.reg) || null,
    paintedAs: cleanString(row.painted_as) || null,
    operatingAs: cleanString(row.operating_as) || null,
    origIata: cleanString(row.orig_iata) || null,
    origIcao: cleanString(row.orig_icao) || null,
    destIata: cleanString(row.dest_iata) || null,
    destIcao: cleanString(row.dest_icao) || null,
    eta: cleanString(row.eta) || null,
  };
}

function normalizeTrackPoint(row) {
  if (!row || typeof row !== "object") return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    timestamp: cleanString(row.timestamp) || null,
    lat,
    lon,
    alt: Number.isFinite(Number(row.alt)) ? Number(row.alt) : null,
    gspeed: Number.isFinite(Number(row.gspeed)) ? Number(row.gspeed) : null,
    vspeed: Number.isFinite(Number(row.vspeed)) ? Number(row.vspeed) : null,
    track: Number.isFinite(Number(row.track)) ? Number(row.track) : null,
    squawk: row.squawk != null ? String(row.squawk) : null,
    callsign: cleanString(row.callsign) || null,
    source: cleanString(row.source) || null,
  };
}

async function fetchLivePositions(deps, input = {}) {
  const token = await resolveApiToken(deps);
  const settings = await loadSettings(deps);
  const fromInput = sanitizeRegistrations(input.registrations);
  const callsigns = sanitizeCallsigns(input.callsigns);
  const registrations =
    fromInput.length > 0 ? fromInput : callsigns.length > 0 ? [] : settings.trackedRegistrations;

  if (!registrations.length && !callsigns.length) {
    return {
      positions: [],
      trackedRegistrations: settings.trackedRegistrations,
      fetchedAt: nowIso(),
      message: "Nenhuma matrícula selecionada para acompanhamento.",
    };
  }

  const positions = [];
  const seen = new Set();

  function recoverRegistration(pos, requestedRegs) {
    if (pos.reg) return pos.reg;
    const cs = cleanString(pos.callsign)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    for (const requested of requestedRegs) {
      const compact = String(requested).replace(/-/g, "");
      if (!compact) continue;
      if (cs && (cs === compact || cs.includes(compact) || compact.includes(cs))) {
        return requested;
      }
    }
    if (requestedRegs.length === 1) return requestedRegs[0];
    return null;
  }

  async function ingest(query, requestedRegs = []) {
    // Light endpoint: 6 credits/flight vs 8 on full — enough for live map.
    // Note: light omits `reg`; we recover it from the requested registrations.
    const body = await fr24Fetch(token, "/live/flight-positions/light", {
      ...query,
      limit: 300,
    });
    const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    for (const row of rows) {
      const pos = normalizePosition(row);
      if (!pos?.fr24Id || seen.has(pos.fr24Id)) continue;
      if (!pos.reg) pos.reg = recoverRegistration(pos, requestedRegs);
      seen.add(pos.fr24Id);
      positions.push(pos);
    }
  }

  for (const batch of chunk(registrations, MAX_REGISTRATIONS)) {
    await ingest({ registrations: batch.join(",") }, batch);
  }
  for (const batch of chunk(callsigns, MAX_REGISTRATIONS)) {
    await ingest({ callsigns: batch.join(",") }, []);
  }

  // Drop sandbox demo rows that don't belong to the requested set.
  const wantedRegs = new Set(registrations.map((r) => r.replace(/-/g, "")));
  const wantedCallsigns = new Set(callsigns);
  const filtered = positions.filter((pos) => {
    if (!looksLikeSandboxDemo(pos)) return true;
    const regCompact = normalizeRegistration(pos.reg || "").replace(/-/g, "");
    const cs = cleanString(pos.callsign).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (wantedRegs.size && regCompact && wantedRegs.has(regCompact)) return true;
    if (wantedCallsigns.size && cs && wantedCallsigns.has(cs)) return true;
    return false;
  });

  return {
    positions: filtered,
    trackedRegistrations: registrations.length ? registrations : settings.trackedRegistrations,
    fetchedAt: nowIso(),
    sandboxLikely: positions.length > 0 && filtered.length === 0 && positions.every(looksLikeSandboxDemo),
    message:
      positions.length > 0 && filtered.length === 0 && positions.every(looksLikeSandboxDemo)
        ? "Chave Sandbox detectada: a API devolveu só o voo demo (EI-SIN). Troque pela API key de produção no Flightradar24."
        : undefined,
  };
}

function sanitizeCallsigns(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const value = cleanString(item)
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9]/g, "");
    if (!value || value.length < 2 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 40) break;
  }
  return out;
}

function positionMatchesQuery(pos, query) {
  const q = cleanString(query)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
  if (!q) return false;
  const qCompact = q.replace(/-/g, "");
  const candidates = [pos.reg, pos.callsign, pos.flight, pos.fr24Id]
    .map((v) => cleanString(v).toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  return candidates.some((value) => {
    const compact = value.replace(/-/g, "");
    return (
      value === q ||
      compact === qCompact ||
      value.includes(q) ||
      compact.includes(qCompact) ||
      q.includes(value) ||
      qCompact.includes(compact)
    );
  });
}

function looksLikeSandboxDemo(pos) {
  const reg = normalizeRegistration(pos?.reg || "");
  const callsign = cleanString(pos?.callsign).toUpperCase();
  const fr24Id = cleanString(pos?.fr24Id || pos?.fr24_id);
  // Static sandbox payload repeatedly seen with demo keys.
  return reg === "EI-SIN" || callsign === "SAS7679" || fr24Id === "333ca4a2";
}

/**
 * Search live traffic by registration, callsign or flight number.
 * Useful for tracking aircraft outside the school fleet.
 */
async function searchLiveAircraft(deps, query) {
  const token = await resolveApiToken(deps);
  const raw = cleanString(query).toUpperCase().replace(/\s+/g, "");
  if (!raw || raw.length < 2) {
    throw Object.assign(new Error("Informe matrícula, callsign ou número de voo."), { status: 400 });
  }

  const reg = normalizeRegistration(raw);
  const callsign = sanitizeCallsigns([raw])[0] || "";
  const positions = [];
  const seen = new Set();
  const tried = [];
  let sawSandboxDemo = false;

  async function tryQuery(label, params) {
    tried.push(label);
    try {
      const body = await fr24Fetch(token, "/live/flight-positions/full", {
        ...params,
        limit: 30,
      });
      const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      for (const row of rows) {
        const pos = normalizePosition(row);
        if (!pos?.fr24Id || seen.has(pos.fr24Id)) continue;
        if (looksLikeSandboxDemo(pos) && !positionMatchesQuery(pos, raw)) {
          sawSandboxDemo = true;
          continue;
        }
        if (!positionMatchesQuery(pos, raw)) continue;
        seen.add(pos.fr24Id);
        positions.push(pos);
      }
    } catch {
      // Invalid filter for this query shape — try the next strategy.
    }
  }

  if (reg) await tryQuery("registrations", { registrations: reg });
  if (callsign) await tryQuery("callsigns", { callsigns: callsign });
  if (callsign) await tryQuery("flights", { flights: callsign });

  let message;
  if (!positions.length) {
    message = sawSandboxDemo
      ? "A chave atual parece ser Sandbox do Flightradar24 (retorna sempre o voo demo EI-SIN). Use uma API key de produção no painel FR24 para ver aeronaves reais como PS-ASF."
      : "Nenhuma aeronave encontrada agora para essa busca.";
  }

  return {
    query: raw,
    positions,
    tried,
    fetchedAt: nowIso(),
    message,
    sandboxLikely: sawSandboxDemo && positions.length === 0,
  };
}

function extractFlightTracksPayload(body, fallbackId) {
  // FR24 returns either:
  //   [{ fr24_id, tracks: [...] }]
  //   { fr24_id, tracks: [...] }
  //   { data: [{ fr24_id, tracks: [...] }] }
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
      ? body.data
      : body && typeof body === "object" && Array.isArray(body.tracks)
        ? [body]
        : [];
  const match =
    rows.find((row) => cleanString(row?.fr24_id) === fallbackId) ||
    rows.find((row) => Array.isArray(row?.tracks) && row.tracks.length) ||
    rows[0] ||
    null;
  const rawTracks = Array.isArray(match?.tracks)
    ? match.tracks
    : Array.isArray(body?.tracks)
      ? body.tracks
      : [];
  const points = rawTracks
    .map(normalizeTrackPoint)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""));
  return {
    fr24Id: cleanString(match?.fr24_id) || fallbackId,
    tracks: points,
  };
}

async function fetchFlightTrack(deps, flightId) {
  const id = cleanString(flightId);
  if (!id) {
    throw Object.assign(new Error("Informe o flight_id do Flightradar24."), { status: 400 });
  }
  const token = await resolveApiToken(deps);
  const body = await fr24Fetch(token, "/flight-tracks", { flight_id: id });
  const parsed = extractFlightTracksPayload(body, id);
  return {
    fr24Id: parsed.fr24Id,
    tracks: parsed.tracks,
    fetchedAt: nowIso(),
  };
}

async function fetchFlightSummary(deps, input = {}) {
  const token = await resolveApiToken(deps);
  const settings = await loadSettings(deps);
  const registrations = sanitizeRegistrations(
    input.registrations?.length ? input.registrations : settings.trackedRegistrations,
  );
  if (!registrations.length) {
    return { summaries: [], fetchedAt: nowIso() };
  }

  const to = parseFlexibleDate(input.datetimeTo || input.to) || new Date();
  let from =
    parseFlexibleDate(input.datetimeFrom || input.from) ||
    new Date(to.getTime() - 24 * 60 * 60 * 1000);
  if (from.getTime() > to.getTime()) {
    throw Object.assign(new Error("Intervalo de datas inválido para o resumo Flightradar24."), {
      status: 400,
    });
  }
  // FR24 limits historical windows; clamp to 14 days to avoid hard API errors.
  const maxSpanMs = 14 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxSpanMs) {
    from = new Date(to.getTime() - maxSpanMs);
  }
  const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z").slice(0, 19);
  const summaries = [];
  const seen = new Set();

  for (const batch of chunk(registrations, MAX_REGISTRATIONS)) {
    try {
      const body = await fr24Fetch(token, "/flight-summary/full", {
        registrations: batch.join(","),
        flight_datetime_from: fmt(from),
        flight_datetime_to: fmt(to),
      });
      const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      for (const row of rows) {
        const flightId = cleanString(row?.fr24_id || row?.flight_id);
        if (!flightId || seen.has(flightId)) continue;
        seen.add(flightId);
        summaries.push({
          fr24Id: flightId,
          flight: cleanString(row.flight) || null,
          callsign: cleanString(row.callsign) || null,
          reg: normalizeRegistration(row.reg) || null,
          type: cleanString(row.type) || null,
          origIcao: cleanString(row.orig_icao) || null,
          destIcao: cleanString(row.dest_icao) || cleanString(row.dest_icao_actual) || null,
          takeoff: cleanString(row.datetime_takeoff) || cleanString(row.first_seen) || null,
          landed: cleanString(row.datetime_landed) || cleanString(row.last_seen) || null,
          firstSeen: cleanString(row.first_seen) || null,
          lastSeen: cleanString(row.last_seen) || null,
          flightTime: Number.isFinite(Number(row.flight_time)) ? Number(row.flight_time) : null,
          flightEnded: row.flight_ended === true,
        });
      }
    } catch (err) {
      // Summary is optional enrichment — don't fail the whole radar if plan lacks credits.
      if (Number(err?.status) === 402 || Number(err?.status) === 403) {
        return {
          summaries: [],
          fetchedAt: nowIso(),
          message: cleanString(err.message) || "Resumo de voos indisponível no plano atual.",
        };
      }
      throw err;
    }
  }

  return {
    summaries,
    fetchedAt: nowIso(),
    datetimeFrom: fmt(from),
    datetimeTo: fmt(to),
  };
}

function parseFlexibleDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcParts(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`,
  };
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function trackToGarminCsv(points, opts = {}) {
  const sorted = [...(points || [])]
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""));

  const lines = [
    "# Flightradar24 track export",
    "# Generated-By: garmin-flight-viewer",
  ];
  if (opts.fr24Id) lines.push(`# fr24_id: ${opts.fr24Id}`);
  if (opts.registration) lines.push(`# registration: ${opts.registration}`);
  lines.push("# Note: ADS-B only (no engine / Garmin G1000 parameters).");
  lines.push(
    "UTC Date,UTC Time,Latitude,Longitude,GPS Altitude ft,GPS Ground Speed kt,GPS Ground Track,Vertical Speed",
  );

  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const parts = formatUtcParts(point.timestamp);
    if (!parts) continue;
    const alt = point.alt != null && Number.isFinite(point.alt) ? Math.round(point.alt) : "";
    const gspeed =
      point.gspeed != null && Number.isFinite(point.gspeed) ? Number(point.gspeed).toFixed(1) : "";
    const heading =
      point.track != null && Number.isFinite(point.track) ? Math.round(point.track) : "";
    let vspeed = "";
    if (point.vspeed != null && Number.isFinite(point.vspeed) && point.vspeed !== 0) {
      vspeed = Math.round(point.vspeed);
    } else if (
      typeof alt === "number" &&
      i > 0 &&
      sorted[i - 1].alt != null &&
      sorted[i - 1].timestamp &&
      point.timestamp
    ) {
      const dtSec = (Date.parse(point.timestamp) - Date.parse(sorted[i - 1].timestamp)) / 1000;
      if (dtSec > 0 && dtSec < 180) {
        vspeed = Math.round(((alt - Number(sorted[i - 1].alt)) / dtSec) * 60);
      }
    }
    lines.push(
      [parts.date, parts.time, point.lat.toFixed(6), point.lon.toFixed(6), alt, gspeed, heading, vspeed]
        .map(csvEscape)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function fr24TelemetryFileName(fr24Id) {
  const safe = String(fr24Id || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32) || "track";
  return `fr24-${safe}.csv`;
}

const SAO_PAULO_TZ = "America/Sao_Paulo";

function partsInTimeZone(ms, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(ms));
  const read = (type) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Interpret school local date+HH:MM as UTC ms (America/Sao_Paulo). */
function flightLocalMs(flightDate, startTime) {
  if (!flightDate || !startTime) return null;
  const timeMatch = String(startTime).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const [year, month, day] = String(flightDate).slice(0, 10).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;

  const guessUtc = Date.UTC(year, month - 1, day, hour + 3, minute, 0);
  const local = partsInTimeZone(guessUtc, SAO_PAULO_TZ);
  if (
    local.year === year &&
    local.month === month &&
    local.day === day &&
    local.hour === hour &&
    local.minute === minute
  ) {
    return guessUtc;
  }
  for (let offsetHours = -2; offsetHours <= 6; offsetHours += 1) {
    const candidate = Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0);
    const parts = partsInTimeZone(candidate, SAO_PAULO_TZ);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      return candidate;
    }
  }
  return Date.UTC(year, month - 1, day, hour + 3, minute, 0);
}

/**
 * Match FR24 summary + track for a school flight. Used by SAGA auto-attach.
 * Returns null when no confident match (never throws on "not found").
 */
async function prepareTelemetryFromFr24(deps, input = {}) {
  const registration = normalizeRegistration(input.aircraftIdent || input.registration);
  if (!registration) {
    return { ok: false, message: "Sem matrícula para buscar no Flightradar24." };
  }

  let token;
  try {
    token = await resolveApiToken(deps);
  } catch (err) {
    return { ok: false, message: cleanString(err?.message) || "Token Flightradar24 não configurado." };
  }
  if (!token) {
    return { ok: false, message: "Token Flightradar24 não configurado." };
  }

  const startMs = flightLocalMs(input.flightDate, input.startTime);
  if (startMs == null) {
    return { ok: false, message: "Sem data/hora da ficha para casar com o Flightradar24." };
  }
  const durationSec = Number(input.durationSec);
  const durationMs =
    Number.isFinite(durationSec) && durationSec > 0
      ? Math.min(durationSec * 1000, 6 * 60 * 60 * 1000)
      : 2 * 60 * 60 * 1000;
  const from = new Date(startMs - 45 * 60 * 1000);
  const to = new Date(startMs + durationMs + 3 * 60 * 60 * 1000);

  let summaryResult;
  try {
    summaryResult = await fetchFlightSummary(deps, {
      registrations: [registration],
      datetimeFrom: from.toISOString(),
      datetimeTo: to.toISOString(),
    });
  } catch (err) {
    return { ok: false, message: cleanString(err?.message) || "Falha ao consultar resumo FR24." };
  }

  const depIcao = cleanString(input.depIcao).toUpperCase() || null;
  const MATCH_TOLERANCE_MIN = 45;
  const candidates = (summaryResult.summaries || [])
    .map((summary) => {
      const takeoffMs = Date.parse(summary.takeoff || "");
      const firstSeenMs = Date.parse(summary.firstSeen || "");
      const eventMs = Number.isFinite(takeoffMs)
        ? takeoffMs
        : Number.isFinite(firstSeenMs)
          ? firstSeenMs
          : Date.parse(summary.landed || "");
      let deltaMin = null;
      if (startMs != null && Number.isFinite(eventMs)) {
        deltaMin = Math.abs(eventMs - startMs) / 60_000;
        if (deltaMin > MATCH_TOLERANCE_MIN) return null;
      }
      let score = deltaMin != null ? Math.max(0, 200 - deltaMin * 4) : 0;
      if (Number.isFinite(takeoffMs)) score += 40;
      if (depIcao && summary.origIcao && summary.origIcao.toUpperCase() === depIcao) score += 25;
      return { summary, deltaMin, score };
    })
    .filter(Boolean)
    .sort((a, b) => (a.deltaMin ?? 9999) - (b.deltaMin ?? 9999) || b.score - a.score);

  const best = candidates[0];
  if (!best?.summary?.fr24Id) {
    return {
      ok: false,
      message: `Nenhum voo FR24 perto do horário da ficha para ${registration}.`,
    };
  }

  let track;
  try {
    track = await fetchFlightTrack(deps, best.summary.fr24Id);
  } catch (err) {
    return { ok: false, message: cleanString(err?.message) || "Falha ao baixar trilha FR24." };
  }
  if (!track.tracks?.length) {
    return { ok: false, message: "FR24 não retornou pontos de trajetória." };
  }

  const csv = trackToGarminCsv(track.tracks, {
    fr24Id: track.fr24Id,
    registration,
  });
  const firstTs = Date.parse(track.tracks[0].timestamp || "");
  const lastTs = Date.parse(track.tracks[track.tracks.length - 1].timestamp || "");
  const durationFromTrack =
    Number.isFinite(firstTs) && Number.isFinite(lastTs) && lastTs > firstTs
      ? Math.round((lastTs - firstTs) / 1000)
      : null;

  return {
    ok: true,
    fr24Id: track.fr24Id,
    points: track.tracks.length,
    deltaMin: best.deltaMin,
    sourceFileName: fr24TelemetryFileName(track.fr24Id),
    csv,
    durationSec: durationFromTrack,
    label: `${registration} · ${best.summary.origIcao || "????"} → ${best.summary.destIcao || "????"} · ${best.summary.takeoff || best.summary.firstSeen || ""}`,
  };
}

/** WhatsApp fleet takeoff/landing watches (opt-in, 24h). */
const FLIGHT_RADAR_WATCH_PREFIX = "flightRadarWatch:";
const FLIGHT_RADAR_WATCH_STATE_KEY = "flightRadarWatchState";
const FLIGHT_RADAR_WATCH_HOURS = 24;
const OFFLINE_LANDING_STREAK = 2;

function flightRadarWatchKey(phone) {
  const digits = cleanString(phone).replace(/\D/g, "");
  if (!digits) return "";
  return `${FLIGHT_RADAR_WATCH_PREFIX}${digits}`;
}

function phoneFromFlightRadarWatchKey(key) {
  const raw = cleanString(key);
  if (!raw.startsWith(FLIGHT_RADAR_WATCH_PREFIX)) return "";
  return raw.slice(FLIGHT_RADAR_WATCH_PREFIX.length).replace(/\D/g, "");
}

function publicFlightRadarWatch(raw, updatedAt = null) {
  const phone = cleanString(raw?.phone).replace(/\D/g, "");
  const hours = FLIGHT_RADAR_WATCH_HOURS;
  const startedAt = cleanString(raw?.startedAt) || null;
  const expiresAt = cleanString(raw?.expiresAt) || null;
  const active = raw?.active !== false && Boolean(phone && expiresAt);
  return {
    phone,
    hours,
    startedAt,
    expiresAt,
    nickname: cleanString(raw?.nickname) || "",
    userId: cleanString(raw?.userId) || "",
    active,
    updatedAt: updatedAt || raw?.updatedAt || null,
  };
}

async function loadFlightRadarWatch(deps, phone) {
  const key = flightRadarWatchKey(phone);
  if (!key) return null;
  const doc = await deps.getSettingDoc(key);
  if (!doc) return null;
  let raw = {};
  try {
    raw = JSON.parse(doc.settings_json || "{}");
  } catch {
    raw = {};
  }
  return publicFlightRadarWatch(
    { ...raw, phone: raw.phone || phoneFromFlightRadarWatchKey(doc.key) },
    doc.$updatedAt || raw.updatedAt || null,
  );
}

async function listFlightRadarWatchDocs(deps) {
  if (typeof deps.listSettingDocsByPrefix !== "function") return [];
  return deps.listSettingDocsByPrefix(FLIGHT_RADAR_WATCH_PREFIX).catch(() => []);
}

async function listActiveFlightRadarWatches(deps, { includeExpired = false } = {}) {
  const docs = await listFlightRadarWatchDocs(deps);
  const out = [];
  const seen = new Set();
  const now = Date.now();
  for (const doc of Array.isArray(docs) ? docs : []) {
    let raw = {};
    try {
      raw = JSON.parse(doc.settings_json || "{}");
    } catch {
      raw = {};
    }
    const watch = publicFlightRadarWatch(
      { ...raw, phone: raw.phone || phoneFromFlightRadarWatchKey(doc.key) },
      doc.$updatedAt || raw.updatedAt || null,
    );
    if (!watch.phone || seen.has(watch.phone)) continue;
    const expiresMs = Date.parse(watch.expiresAt || "") || 0;
    const stillValid = watch.active && expiresMs > now;
    if (!includeExpired && !stillValid) continue;
    if (!includeExpired && !watch.active) continue;
    seen.add(watch.phone);
    out.push({ ...watch, docKey: doc.key, expired: !stillValid || !watch.active });
  }
  return out;
}

async function saveFlightRadarWatch(deps, input) {
  const phone = cleanString(input?.phone).replace(/\D/g, "");
  const key = flightRadarWatchKey(phone);
  if (!key) {
    throw Object.assign(new Error("Informe um telefone válido para acompanhar a frota."), { status: 400 });
  }
  const startedAt = cleanString(input?.startedAt) || nowIso();
  const hours = FLIGHT_RADAR_WATCH_HOURS;
  const expiresAt =
    cleanString(input?.expiresAt) ||
    new Date(Date.parse(startedAt) + hours * 60 * 60 * 1000).toISOString();
  const next = publicFlightRadarWatch(
    {
      phone,
      hours,
      startedAt,
      expiresAt,
      nickname: input?.nickname,
      userId: input?.userId,
      active: input?.active !== false,
      updatedAt: nowIso(),
    },
    nowIso(),
  );
  const saved = await deps.upsertPlatformSettingDoc(key, next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar o acompanhamento da frota."), { status: 500 });
  }
  return next;
}

async function clearFlightRadarWatch(deps, phone) {
  const key = flightRadarWatchKey(phone);
  if (!key) return { cleared: 0 };
  if (typeof deps.deleteSettingDoc === "function") {
    const ok = await deps.deleteSettingDoc(key);
    return { cleared: ok ? 1 : 0 };
  }
  await deps.upsertPlatformSettingDoc(key, {
    phone: cleanString(phone).replace(/\D/g, ""),
    hours: FLIGHT_RADAR_WATCH_HOURS,
    active: false,
    expiresAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { cleared: 1 };
}

function defaultWatchFleetState() {
  return {
    aircraft: {},
    pendingEvents: [],
    recentEventKeys: [],
    updatedAt: null,
  };
}

function publicOpenLeg(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const studentName = cleanString(raw.studentName);
  const instructorName = cleanString(raw.instructorName);
  const takeoffAt = cleanString(raw.takeoffAt);
  const takeoffIcao = cleanString(raw.takeoffIcao).toUpperCase();
  if (!studentName && !instructorName && !takeoffAt && !takeoffIcao) return null;
  return {
    studentUserId: cleanString(raw.studentUserId),
    instructorUserId: cleanString(raw.instructorUserId),
    studentName,
    instructorName,
    notes: cleanString(raw.notes),
    mission: cleanString(raw.mission),
    scheduledTakeoff: cleanString(raw.scheduledTakeoff),
    scheduledLanding: cleanString(raw.scheduledLanding),
    takeoffIcao,
    takeoffAd: cleanString(raw.takeoffAd),
    takeoffAt,
    slotId: cleanString(raw.slotId),
  };
}

function watchEventKey(event) {
  return [
    cleanString(event?.type),
    normalizeRegistration(event?.reg),
    cleanString(event?.fr24Id),
    cleanString(event?.lastTakeoffAt),
  ].join("|");
}

function publicWatchEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type === "landing" ? "landing" : raw.type === "takeoff" ? "takeoff" : "";
  const reg = normalizeRegistration(raw.reg);
  if (!type || !reg) return null;
  const lat = Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null;
  const lon = Number.isFinite(Number(raw.lon)) ? Number(raw.lon) : null;
  return {
    type,
    reg,
    fr24Id: cleanString(raw.fr24Id) || null,
    callsign: cleanString(raw.callsign) || null,
    alt: Number.isFinite(Number(raw.alt)) ? Number(raw.alt) : null,
    gspeed: Number.isFinite(Number(raw.gspeed)) ? Number(raw.gspeed) : null,
    origIcao: cleanString(raw.origIcao).toUpperCase() || null,
    destIcao: cleanString(raw.destIcao).toUpperCase() || null,
    lat,
    lon,
    groundLat: Number.isFinite(Number(raw.groundLat)) ? Number(raw.groundLat) : null,
    groundLon: Number.isFinite(Number(raw.groundLon)) ? Number(raw.groundLon) : null,
    lastTakeoffAt: cleanString(raw.lastTakeoffAt) || null,
    lastTakeoffIcao: cleanString(raw.lastTakeoffIcao).toUpperCase() || null,
    openLeg: publicOpenLeg(raw.openLeg),
    studentName: cleanString(raw.studentName),
    instructorName: cleanString(raw.instructorName),
    studentUserId: cleanString(raw.studentUserId),
    instructorUserId: cleanString(raw.instructorUserId),
    notes: cleanString(raw.notes),
    mission: cleanString(raw.mission),
    takeoffAd: cleanString(raw.takeoffAd),
    landingAd: cleanString(raw.landingAd),
    takeoffIcao: cleanString(raw.takeoffIcao).toUpperCase(),
    landingIcao: cleanString(raw.landingIcao).toUpperCase(),
    scheduledTakeoff: cleanString(raw.scheduledTakeoff),
    scheduledLanding: cleanString(raw.scheduledLanding),
    duration: cleanString(raw.duration),
    enriched: raw.enriched === true,
  };
}

function mergeWatchEvents(pending, incoming, recentKeys) {
  const known = new Set(
    (Array.isArray(recentKeys) ? recentKeys : []).map((key) => cleanString(key)).filter(Boolean),
  );
  const out = [];
  const seen = new Set();
  for (const event of Array.isArray(pending) ? pending : []) {
    const normalized = publicWatchEvent(event);
    if (!normalized) continue;
    const key = watchEventKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 20) return out;
  }
  for (const event of Array.isArray(incoming) ? incoming : []) {
    const normalized = publicWatchEvent(event);
    if (!normalized) continue;
    const key = watchEventKey(normalized);
    if (!key || seen.has(key) || known.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 20) break;
  }
  return out;
}

function rememberWatchEventKeys(previousKeys, events) {
  const next = [];
  const seen = new Set();
  for (const key of [
    ...(Array.isArray(events) ? events.map((event) => watchEventKey(event)) : []),
    ...(Array.isArray(previousKeys) ? previousKeys : []),
  ]) {
    const value = cleanString(key);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= 50) break;
  }
  return next;
}

function publicWatchFleetState(raw) {
  const aircraft = {};
  const source = raw?.aircraft && typeof raw.aircraft === "object" && !Array.isArray(raw.aircraft) ? raw.aircraft : {};
  for (const [regRaw, row] of Object.entries(source)) {
    const reg = normalizeRegistration(regRaw);
    if (!reg || !row || typeof row !== "object") continue;
    const status = cleanString(row.status);
    const lastEventType =
      row.lastEventType === "takeoff" || row.lastEventType === "landing" ? row.lastEventType : null;
    aircraft[reg] = {
      status: status === "airborne" || status === "ground" || status === "offline" ? status : "offline",
      fr24Id: cleanString(row.fr24Id) || null,
      alt: Number.isFinite(Number(row.alt)) ? Number(row.alt) : null,
      gspeed: Number.isFinite(Number(row.gspeed)) ? Number(row.gspeed) : null,
      callsign: cleanString(row.callsign) || null,
      offlineStreak: Math.max(0, Math.round(Number(row.offlineStreak) || 0)),
      lastTakeoffFr24Id: cleanString(row.lastTakeoffFr24Id) || null,
      lastLandingFr24Id: cleanString(row.lastLandingFr24Id) || null,
      lastTakeoffAt: cleanString(row.lastTakeoffAt) || null,
      lastTakeoffIcao: cleanString(row.lastTakeoffIcao).toUpperCase() || null,
      lastEventType,
      openLeg: publicOpenLeg(row.openLeg),
      lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
      lon: Number.isFinite(Number(row.lon)) ? Number(row.lon) : null,
      lastGroundLat: Number.isFinite(Number(row.lastGroundLat)) ? Number(row.lastGroundLat) : null,
      lastGroundLon: Number.isFinite(Number(row.lastGroundLon)) ? Number(row.lastGroundLon) : null,
      updatedAt: cleanString(row.updatedAt) || null,
    };
  }
  return {
    aircraft,
    pendingEvents: mergeWatchEvents(raw?.pendingEvents, [], []),
    recentEventKeys: rememberWatchEventKeys(raw?.recentEventKeys, []),
    updatedAt: cleanString(raw?.updatedAt) || null,
  };
}

async function loadWatchFleetState(deps) {
  const doc = await deps.getSettingDoc(FLIGHT_RADAR_WATCH_STATE_KEY);
  if (!doc) return defaultWatchFleetState();
  let raw = {};
  try {
    raw = JSON.parse(doc.settings_json || "{}");
  } catch {
    raw = {};
  }
  return publicWatchFleetState(raw);
}

async function saveWatchFleetState(deps, state) {
  const next = publicWatchFleetState({ ...state, updatedAt: nowIso() });
  const saved = await deps.upsertPlatformSettingDoc(FLIGHT_RADAR_WATCH_STATE_KEY, next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar o estado da frota do Radar Watch."), {
      status: 500,
    });
  }
  return next;
}

async function fetchLivePositionsWithRetry(deps, input = {}, { attempts = 3, delayMs = 800, log } = {}) {
  let lastErr;
  const total = Math.max(1, Math.min(5, Math.round(Number(attempts) || 3)));
  for (let i = 1; i <= total; i += 1) {
    try {
      return await fetchLivePositions(deps, input);
    } catch (err) {
      lastErr = err;
      if (typeof log === "function") {
        log(`[flight-radar-watch] FR24 fetch attempt ${i}/${total} failed: ${err?.message || err}`);
      }
      if (i < total) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * i));
      }
    }
  }
  throw lastErr;
}

function classifyLiveStatus(pos) {
  if (!pos) return "offline";
  const alt = Number(pos.alt) || 0;
  const spd = Number(pos.gspeed) || 0;
  if (alt > 50 || spd > 30) return "airborne";
  return "ground";
}

function emptyAircraftRow() {
  return {
    status: "offline",
    fr24Id: null,
    alt: null,
    gspeed: null,
    callsign: null,
    offlineStreak: 0,
    lastTakeoffFr24Id: null,
    lastLandingFr24Id: null,
    lastTakeoffAt: null,
    lastTakeoffIcao: null,
    lastEventType: null,
    openLeg: null,
    lat: null,
    lon: null,
    lastGroundLat: null,
    lastGroundLon: null,
    updatedAt: null,
  };
}

/**
 * Diff previous fleet state vs current live positions.
 * Returns events + next state snapshot.
 */
function detectFleetTransitions(previousState, positions, trackedRegistrations) {
  const prev = publicWatchFleetState(previousState);
  const byReg = new Map();
  for (const pos of Array.isArray(positions) ? positions : []) {
    const reg = normalizeRegistration(pos?.reg);
    if (!reg) continue;
    byReg.set(reg, pos);
  }

  const regs = sanitizeRegistrations(
    trackedRegistrations?.length
      ? trackedRegistrations
      : [...new Set([...Object.keys(prev.aircraft), ...byReg.keys()])],
  );

  const events = [];
  const nextAircraft = { ...prev.aircraft };

  for (const reg of regs) {
    const pos = byReg.get(reg) || null;
    const status = classifyLiveStatus(pos);
    const previous = prev.aircraft[reg] || emptyAircraftRow();
    const fr24Id = cleanString(pos?.fr24Id) || previous.fr24Id || null;
    let offlineStreak = 0;
    let nextStatus = status;
    let eventType = null;
    const isSeed = !previous.updatedAt;
    const lastEventType = previous.lastEventType || null;

    if (!isSeed && status === "offline" && previous.status === "airborne") {
      offlineStreak = Math.max(1, previous.offlineStreak + 1);
      if (offlineStreak < OFFLINE_LANDING_STREAK) {
        // ADS-B gap: keep airborne until confirmed missing for N polls.
        nextStatus = "airborne";
      } else if (lastEventType !== "landing") {
        eventType = "landing";
        nextStatus = "offline";
      } else {
        nextStatus = "offline";
      }
    } else if (status === "offline") {
      offlineStreak = !isSeed && previous.status === "offline" ? previous.offlineStreak + 1 : 1;
      nextStatus = "offline";
    } else if (
      !isSeed &&
      status === "airborne" &&
      (previous.status === "ground" || previous.status === "offline") &&
      lastEventType !== "takeoff"
    ) {
      eventType = "takeoff";
      offlineStreak = 0;
    } else if (!isSeed && previous.status === "airborne" && status === "ground" && lastEventType !== "landing") {
      eventType = "landing";
      offlineStreak = 0;
    }

    const lat = Number.isFinite(Number(pos?.lat)) ? Number(pos.lat) : previous.lat;
    const lon = Number.isFinite(Number(pos?.lon)) ? Number(pos.lon) : previous.lon;
    const liveOrigIcao = cleanString(pos?.origIcao).toUpperCase() || null;
    const destIcao = cleanString(pos?.destIcao).toUpperCase() || null;
    const origIcao = liveOrigIcao || (eventType === "landing" ? previous.lastTakeoffIcao : null) || null;
    const lastGroundLat =
      status === "ground" && Number.isFinite(lat) ? lat : previous.lastGroundLat;
    const lastGroundLon =
      status === "ground" && Number.isFinite(lon) ? lon : previous.lastGroundLon;
    let nextEventType = lastEventType;
    let nextOpenLeg = previous.openLeg || null;
    const row = {
      status: nextStatus,
      fr24Id,
      alt: pos?.alt != null && Number.isFinite(Number(pos.alt)) ? Number(pos.alt) : previous.alt,
      gspeed: pos?.gspeed != null && Number.isFinite(Number(pos.gspeed)) ? Number(pos.gspeed) : previous.gspeed,
      callsign: cleanString(pos?.callsign) || previous.callsign || null,
      offlineStreak: nextStatus === "airborne" && status === "offline" ? offlineStreak : status === "offline" ? offlineStreak : 0,
      lastTakeoffFr24Id: previous.lastTakeoffFr24Id,
      lastLandingFr24Id: previous.lastLandingFr24Id,
      lastTakeoffAt: previous.lastTakeoffAt,
      lastTakeoffIcao: previous.lastTakeoffIcao,
      lastEventType: nextEventType,
      openLeg: nextOpenLeg,
      lat,
      lon,
      lastGroundLat,
      lastGroundLon,
      updatedAt: nowIso(),
    };

    // First observation only seeds state (no WhatsApp spam for already-airborne fleet).
    if (isSeed && status === "airborne" && fr24Id) {
      row.lastTakeoffFr24Id = fr24Id;
      row.lastTakeoffAt = previous.lastTakeoffAt || nowIso();
      row.lastTakeoffIcao = origIcao;
      row.lastEventType = "takeoff";
    }

    if (eventType === "takeoff") {
      row.lastTakeoffFr24Id = fr24Id;
      row.lastTakeoffAt = nowIso();
      row.lastTakeoffIcao = origIcao;
      row.lastEventType = "takeoff";
      events.push({
        type: eventType,
        reg,
        fr24Id,
        callsign: row.callsign,
        alt: row.alt,
        gspeed: row.gspeed,
        origIcao,
        destIcao,
        lat,
        lon,
        groundLat: previous.lastGroundLat ?? (previous.status === "ground" ? previous.lat : null),
        groundLon: previous.lastGroundLon ?? (previous.status === "ground" ? previous.lon : null),
        lastTakeoffAt: row.lastTakeoffAt,
        lastTakeoffIcao: row.lastTakeoffIcao,
      });
    } else if (eventType === "landing") {
      row.lastLandingFr24Id = previous.fr24Id || fr24Id;
      row.lastEventType = "landing";
      row.openLeg = null;
      events.push({
        type: eventType,
        reg,
        fr24Id: row.lastLandingFr24Id,
        callsign: row.callsign,
        alt: row.alt,
        gspeed: row.gspeed,
        origIcao,
        destIcao,
        lat,
        lon,
        lastTakeoffAt: previous.lastTakeoffAt,
        lastTakeoffIcao: previous.lastTakeoffIcao,
        openLeg: previous.openLeg || null,
      });
    }

    nextAircraft[reg] = row;
  }

  return {
    events,
    state: {
      aircraft: nextAircraft,
      pendingEvents: prev.pendingEvents,
      recentEventKeys: prev.recentEventKeys,
      updatedAt: nowIso(),
    },
  };
}

/** Quiet hours for school fleet watches: 22:00 inclusive → 06:00 exclusive (America/Sao_Paulo). */
function isFlightRadarWatchQuietHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return hour >= 22 || hour < 6;
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_MAP_CENTER,
  DEFAULT_POLL_INTERVAL_SEC,
  FLIGHT_RADAR_WATCH_PREFIX,
  FLIGHT_RADAR_WATCH_STATE_KEY,
  FLIGHT_RADAR_WATCH_HOURS,
  OFFLINE_LANDING_STREAK,
  normalizeRegistration,
  loadSettings,
  saveSettings,
  fetchLivePositions,
  fetchLivePositionsWithRetry,
  searchLiveAircraft,
  fetchFlightTrack,
  fetchFlightSummary,
  prepareTelemetryFromFr24,
  publicSettings,
  defaultSettings,
  flightRadarWatchKey,
  phoneFromFlightRadarWatchKey,
  publicFlightRadarWatch,
  loadFlightRadarWatch,
  listActiveFlightRadarWatches,
  listFlightRadarWatchDocs,
  saveFlightRadarWatch,
  clearFlightRadarWatch,
  loadWatchFleetState,
  saveWatchFleetState,
  classifyLiveStatus,
  detectFleetTransitions,
  watchEventKey,
  mergeWatchEvents,
  rememberWatchEventKeys,
  publicWatchFleetState,
  isFlightRadarWatchQuietHour,
};
