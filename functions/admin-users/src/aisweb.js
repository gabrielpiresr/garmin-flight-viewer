"use strict";

const AISWEB_API_BASE = "https://aisweb.decea.mil.br/api/";
const AISWEB_SETTINGS_KEY = "aiswebSettings";
const AISWEB_WATCHLIST_PREFIX = "aiswebWatchlist:";
const AISWEB_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_WATCHLIST = 12;

const DEFAULT_MINIMUMS = [
  { condition: "vfr_diurno", label: "VFR DIURNO", ceilingFt: 2000, visibilityKm: 5, maxWindKt: 14 },
  { condition: "vfr_noturno", label: "VFR NOTURNO", ceilingFt: 5000, visibilityKm: 10, maxWindKt: 8 },
  { condition: "aluno_solo", label: "ALUNO SOLO", ceilingFt: 5000, visibilityKm: 10, maxWindKt: 8 },
];

const metCache = new Map();
const notamCache = new Map();
const rotaerCache = new Map();
const solCache = new Map();
const cartasCache = new Map();
const suplementosCache = new Map();
const geilocCache = new Map();

const GEOAISWEB_WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

function cleanString(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIcao(value) {
  return cleanString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function aiswebCredentials() {
  return {
    apiKey: cleanString(process.env.AISWEB_API_KEY) || "1729957010",
    apiPass: cleanString(process.env.AISWEB_API_PASS) || "e4d1ca4f-43ca-11f1-a4e0-0050569ac2e1",
  };
}

function stripCdata(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .trim();
}

function decodeXmlEntities(value) {
  return stripCdata(String(value ?? ""))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = String(xml || "").match(re);
  return match ? decodeXmlEntities(match[1]).trim() : "";
}

function xmlAttr(openTag, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = String(openTag || "").match(re);
  return match ? decodeXmlEntities(match[1]).trim() : "";
}

function runwayHeadingFromIdent(ident) {
  const match = cleanString(ident).toUpperCase().match(/^(\d{2})/);
  if (!match) return null;
  let heading = Number(match[1]) * 10;
  if (heading === 360) heading = 0;
  if (!Number.isFinite(heading) || heading < 0 || heading > 360) return null;
  return heading;
}

function parseMetar(raw) {
  const metar = cleanString(raw);
  if (!metar) return null;
  const cavok = /\bCAVOK\b/.test(metar);

  let observedAt = null;
  const timeMatch = metar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  if (timeMatch) {
    const now = new Date();
    const day = Number(timeMatch[1]);
    const hour = Number(timeMatch[2]);
    const minute = Number(timeMatch[3]);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, minute, 0));
    if (candidate.getTime() - now.getTime() > 12 * 60 * 60 * 1000) {
      candidate.setUTCMonth(candidate.getUTCMonth() - 1);
    }
    observedAt = candidate.toISOString();
  }

  let windDirDeg = null;
  let windSpeedKt = null;
  let windGustKt = null;
  const windMatch = metar.match(/\b(?:VRB|(\d{3}))(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (windMatch) {
    windDirDeg = windMatch[1] ? Number(windMatch[1]) : null;
    windSpeedKt = Number(windMatch[2]);
    windGustKt = windMatch[3] ? Number(windMatch[3]) : null;
  }

  let windVarFromDeg = null;
  let windVarToDeg = null;
  const varMatch = metar.match(/\b(\d{3})V(\d{3})\b/);
  if (varMatch) {
    windVarFromDeg = Number(varMatch[1]);
    windVarToDeg = Number(varMatch[2]);
  }

  let visibilityM = null;
  if (cavok) visibilityM = 10000;
  else {
    const afterWind = metar.replace(/^\S+\s+\S+\s+\S+\s+(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT(?:\s+\d{3}V\d{3})?\s+/i, "");
    const visMatch = afterWind.match(/^(?:(\d{4})|(\d{1,2})SM)\b/);
    if (visMatch?.[1]) {
      visibilityM = Number(visMatch[1]);
      // METAR 9999 = 10 km or more — normalize so 10 km minimums pass (>=).
      if (visibilityM >= 9999) visibilityM = 10000;
    } else if (visMatch?.[2]) visibilityM = Math.round(Number(visMatch[2]) * 1609.34);
  }

  const weather = [
    ...metar.matchAll(
      /\b(?:VC)?(?:[-+])?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)\b/g,
    ),
  ].map((m) => m[0]);

  const clouds = [...metar.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})?(CB|TCU)?\b/g)].map((m) => ({
    cover: m[1],
    heightFt: m[2] ? Number(m[2]) * 100 : null,
    convect: m[3] || null,
    raw: m[0],
  }));

  let ceilingFt = null;
  if (cavok) ceilingFt = 10000;
  else {
    const ceilingLayers = clouds.filter(
      (c) => (c.cover === "BKN" || c.cover === "OVC" || c.cover === "VV") && c.heightFt != null,
    );
    if (ceilingLayers.length) ceilingFt = Math.min(...ceilingLayers.map((c) => c.heightFt));
  }

  const cloudsText = cavok
    ? "CAVOK"
    : clouds.length
      ? clouds.map((c) => c.raw).join(" ")
      : "N/D";

  let remarks = null;
  const rmkMatch = metar.match(/\bRMK\b\s+(.+?)(?:\s*=\s*)?$/i);
  if (rmkMatch) remarks = cleanString(rmkMatch[1]);

  return {
    observedAt,
    windDirDeg,
    windSpeedKt,
    windGustKt,
    windVarFromDeg,
    windVarToDeg,
    visibilityM,
    visibilityKm: visibilityM == null ? null : visibilityM / 1000,
    ceilingFt,
    clouds,
    cloudsText,
    weather,
    remarks,
    cavok,
  };
}

function parseNotamValidity(value) {
  const raw = cleanString(value);
  if (!/^\d{10}$/.test(raw)) return null;
  const yy = Number(raw.slice(0, 2));
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const month = raw.slice(2, 4);
  const day = raw.slice(4, 6);
  const hour = raw.slice(6, 8);
  const minute = raw.slice(8, 10);
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : iso;
}

function parseNotamItems(xml, fallbackIcao) {
  const items = [];
  const itemRe = /<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(String(xml || ""))) !== null) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const status = xmlTag(body, "status") || xmlTag(body, "state") || "";
    if (status && status.toUpperCase() !== "ACTIVE") continue;
    const icao = normalizeIcao(xmlTag(body, "loc") || xmlTag(body, "icaoairport_id") || fallbackIcao);
    const issuedAt = cleanString(xmlTag(body, "dt")) || null;
    const validFromRaw = xmlTag(body, "b");
    const validToRaw = xmlTag(body, "c");
    items.push({
      id: xmlAttr(attrs, "id") || xmlTag(body, "id") || `${icao}-${xmlTag(body, "n") || items.length}`,
      number: xmlTag(body, "n") || "",
      icao,
      status: status || "ACTIVE",
      type: xmlTag(body, "tp") || "",
      issuedAt,
      validFrom: parseNotamValidity(validFromRaw) || issuedAt,
      validTo: parseNotamValidity(validToRaw),
      schedule: xmlTag(body, "d") || null,
      text: xmlTag(body, "e") || "",
      lowerLimit: xmlTag(body, "f") || null,
      upperLimit: xmlTag(body, "g") || null,
      category: xmlTag(body, "cat") || null,
      qCode: xmlTag(body, "cod") || null,
      airportName: xmlTag(body, "aero") || null,
      city: xmlTag(body, "cidade") || null,
      uf: xmlTag(body, "uf") || null,
    });
  }
  return items;
}

function cacheGet(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + AISWEB_CACHE_TTL_MS });
  return value;
}

async function aiswebFetch(area, params = {}) {
  const { apiKey, apiPass } = aiswebCredentials();
  const url = new URL(AISWEB_API_BASE);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("apiPass", apiPass);
  url.searchParams.set("area", area);
  const entries =
    typeof params === "string"
      ? [["icaoCode", params]]
      : Object.entries(params || {});
  for (const [key, value] of entries) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  const xml = await response.text();
  if (!xml || !xml.includes("<aisweb")) {
    const snippet = cleanString(xml).slice(0, 180);
    throw Object.assign(new Error(snippet || `Falha AISWEB (${area}).`), { status: 502 });
  }
  if (/<service[^>]*total="error"/i.test(xml)) {
    throw Object.assign(new Error(xmlTag(xml, "msg") || `Erro AISWEB (${area}).`), { status: 502 });
  }
  return xml;
}

function parseAiswebTimestamp(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const tsMatch = raw.match(/\{ts\s+'([^']+)'\}/i);
  const candidate = tsMatch ? tsMatch[1] : raw;
  const normalized = candidate.includes("T")
    ? candidate
    : candidate.replace(" ", "T") + (candidate.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(candidate) ? "" : "Z");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAviationCoord(raw) {
  const text = cleanString(raw).toUpperCase().replace(/\s+/g, "");
  if (!text) return null;
  // DDMM.mmH or DDDMM.mmH
  const match = text.match(/^(\d{2,3})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!match) {
    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  const degrees = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  let value = degrees + minutes / 60;
  const hemi = match[3];
  if (hemi === "S" || hemi === "W") value = -value;
  return value;
}

function stripHtml(value) {
  return cleanString(decodeXmlEntities(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchMet(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) {
    return { icao: icao || "", metar: "", taf: "", parsed: null, error: "Código ICAO inválido." };
  }
  const cached = cacheGet(metCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("met", { icaoCode: icao });
    const metar = xmlTag(xml, "metar");
    const taf = xmlTag(xml, "taf");
    const loc = normalizeIcao(xmlTag(xml, "loc")) || icao;
    const value = {
      icao: loc,
      metar,
      taf,
      parsed: parseMetar(metar),
      error: null,
    };
    return cacheSet(metCache, icao, value);
  } catch (err) {
    return {
      icao,
      metar: "",
      taf: "",
      parsed: null,
      error: err?.message || "Falha ao buscar METAR/TAF.",
    };
  }
}

async function fetchNotams(icaoCode, options = {}) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) return [];
  const bypassCache = options?.bypassCache === true;
  if (!bypassCache) {
    const cached = cacheGet(notamCache, icao);
    if (cached) return cached;
  }
  try {
    const xml = await aiswebFetch("notam", { icaoCode: icao });
    const items = parseNotamItems(xml, icao);
    return cacheSet(notamCache, icao, items);
  } catch {
    return [];
  }
}

function surfaceLabel(code) {
  const key = cleanString(code).toUpperCase();
  const map = {
    ASPH: "Asphalt",
    CONC: "Concrete",
    GRASS: "Grass",
    GRAVEL: "Gravel",
    DIRT: "Dirt",
    WATER: "Water",
    BITU: "Bituminous",
    MACA: "Macadam",
  };
  return map[key] || (key || null);
}

function parseLights(xmlChunk) {
  const lights = [];
  const re = /<light\b([^>]*)>([\s\S]*?)<\/light>/gi;
  let match;
  while ((match = re.exec(String(xmlChunk || ""))) !== null) {
    const code = cleanString(match[2]);
    if (!code) continue;
    lights.push({
      code,
      description: xmlAttr(match[1], "descr") || null,
    });
  }
  return lights;
}

function parseFuel(xml) {
  const fuelBlock = String(xml || "").match(/<fuel\b[^>]*>([\s\S]*?)<\/fuel>/i)?.[1] || "";
  if (!fuelBlock.trim()) return null;
  const spanMatch = fuelBlock.match(/<span\b([^>]*)>([\s\S]*?)<\/span>/i);
  const hoursRaw = spanMatch ? xmlAttr(spanMatch[1], "title") : "";
  const hours = cleanString(hoursRaw.replace(/^\(|\)$/g, "")) || null;
  const text = cleanString(decodeXmlEntities(spanMatch ? spanMatch[2] : fuelBlock));
  if (!text && !hours) return null;
  const types = [...text.matchAll(/\b(PF|TF|AVGAS|JET[\s-]?A1?|JET)\b/gi)].map((m) =>
    cleanString(m[1]).toUpperCase().replace(/\s+/g, ""),
  );
  const uniqueTypes = [...new Set(types)];
  const categoryMatch = text.match(/\[(\d+)\]/);
  return {
    text: text || null,
    hours,
    types: uniqueTypes,
    category: categoryMatch ? categoryMatch[1] : null,
  };
}

function parseWorkingHours(xml) {
  const schedules = [];
  const sheetRe = /<timesheet\b([^>]*)>([\s\S]*?)<\/timesheet>/gi;
  let match;
  while ((match = sheetRe.exec(String(xml || ""))) !== null) {
    const body = match[2] || "";
    const days = [];
    const dayRe = /<day\b[^>]*>([\s\S]*?)<\/day>/gi;
    let dayMatch;
    while ((dayMatch = dayRe.exec(body)) !== null) {
      const day = cleanString(decodeXmlEntities(dayMatch[1]));
      if (day) days.push(day);
    }
    const begin = xmlTag(body, "begin") || null;
    const end = xmlTag(body, "end") || null;
    const holidays = xmlTag(body, "hol") === "1";
    if (!days.length && !begin && !end) continue;
    schedules.push({
      days,
      begin,
      end,
      holidays,
    });
  }
  const workinghourAttr = String(xml || "").match(/<workinghour\b([^>]*)\/?>/i);
  const workinghourText = workinghourAttr ? xmlAttr(workinghourAttr[1], "compl") : "";
  return {
    text: cleanString(workinghourText) || null,
    schedules,
  };
}

function parseNavaids(xml) {
  const navaids = [];
  const svcRe = /<service\b([^>]*)>([\s\S]*?)<\/service>/gi;
  let match;
  while ((match = svcRe.exec(String(xml || ""))) !== null) {
    const open = match[1] || "";
    if (!/type\s*=\s*"NAV"/i.test(open)) continue;
    const body = match[2] || "";
    const type = xmlTag(body, "type") || "NAV";
    const ident = xmlTag(body, "ident") || null;
    const freq = xmlTag(body, "freq") || null;
    const thr = xmlTag(body, "thr") || null;
    const lat = parseAviationCoord(xmlTag(body, "lat"));
    const lng = parseAviationCoord(xmlTag(body, "lng"));
    if (!type && !ident && !freq) continue;
    navaids.push({
      type,
      ident,
      frequencyMhz: freq,
      threshold: thr,
      lat,
      lng,
      category: xmlTag(body, "cat") || null,
    });
  }
  return navaids;
}

function parseDeclaredDistances(xml) {
  const items = [];
  const re = /<rmkDist\b[^>]*>([\s\S]*?)<\/rmkDist>/gi;
  let match;
  while ((match = re.exec(String(xml || ""))) !== null) {
    const body = match[1] || "";
    const rwy = cleanString(xmlTag(body, "rwy"));
    if (!rwy) continue;
    const toNumber = (tag) => {
      const raw = cleanString(xmlTag(body, tag)).replace(",", ".");
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    items.push({
      rwy,
      toraM: toNumber("tora"),
      todaM: toNumber("toda"),
      asdaM: toNumber("asda"),
      ldaM: toNumber("lda"),
      latText: xmlTag(body, "lat") || null,
      lngText: xmlTag(body, "lng") || null,
    });
  }
  return items;
}

function parseRotaer(xml, fallbackIcao) {
  const icao = normalizeIcao(xmlTag(xml, "AeroCode")) || fallbackIcao;
  const runways = [];
  const runwayRe = /<runway\b([^>]*)>([\s\S]*?)<\/runway>/gi;
  let match;
  while ((match = runwayRe.exec(String(xml || ""))) !== null) {
    const body = match[2] || "";
    const ident = xmlTag(body, "ident");
    const surface = xmlTag(body, "surface") || null;
    const thresholds = [];
    const thrRe = /<thr\b([^>]*)>([\s\S]*?)<\/thr>/gi;
    let thrMatch;
    while ((thrMatch = thrRe.exec(body)) !== null) {
      const thrBody = thrMatch[2] || "";
      const thrIdent = xmlTag(thrBody, "ident");
      if (!thrIdent) continue;
      thresholds.push({
        ident: thrIdent,
        headingDeg: runwayHeadingFromIdent(thrIdent),
        lights: parseLights(thrBody),
      });
    }
    if (!thresholds.length && ident.includes("/")) {
      for (const part of ident.split("/")) {
        const thrIdent = cleanString(part);
        if (!thrIdent) continue;
        thresholds.push({ ident: thrIdent, headingDeg: runwayHeadingFromIdent(thrIdent), lights: [] });
      }
    }
    const bodyWithoutThr = body.replace(/<thr\b[\s\S]*?<\/thr>/gi, "");
    runways.push({
      ident: ident || "RWY",
      surface,
      surfaceLabel: surfaceLabel(surface),
      lengthM: Number(xmlTag(body, "length")) || null,
      widthM: Number(xmlTag(body, "width")) || null,
      pcn: xmlTag(body, "surface_c") || null,
      lights: parseLights(bodyWithoutThr),
      thresholds,
    });
  }

  const frequencies = [];
  const comRe = /<service\b([^>]*)>([\s\S]*?)<\/service>/gi;
  let svcMatch;
  while ((svcMatch = comRe.exec(String(xml || ""))) !== null) {
    const open = svcMatch[1] || "";
    const body = svcMatch[2] || "";
    if (!/type\s*=\s*"COM"/i.test(open)) continue;
    const freqs = [];
    const freqRe = /<freq\b[^>]*>([\s\S]*?)<\/freq>/gi;
    let fMatch;
    while ((fMatch = freqRe.exec(body)) !== null) {
      const mhz = cleanString(fMatch[1]);
      if (mhz) freqs.push(mhz);
    }
    if (!freqs.length) continue;
    frequencies.push({
      service: xmlTag(body, "type") || "COM",
      callsign: xmlTag(body, "callsign") || null,
      frequenciesMhz: freqs,
    });
  }

  const remarks = [];
  const rmkRe = /<rmkText\b([^>]*)>([\s\S]*?)<\/rmkText>/gi;
  let rmkMatch;
  while ((rmkMatch = rmkRe.exec(String(xml || ""))) !== null) {
    const text = decodeXmlEntities(rmkMatch[2] || "");
    if (!text) continue;
    remarks.push({
      code: xmlAttr(rmkMatch[1], "cod") || null,
      text,
    });
  }

  const complements = [];
  const complRe = /<compl\b([^>]*)>([\s\S]*?)<\/compl>/gi;
  let complMatch;
  while ((complMatch = complRe.exec(String(xml || ""))) !== null) {
    const text = decodeXmlEntities(complMatch[2] || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const nRaw = xmlAttr(complMatch[1], "n");
    complements.push({
      code: xmlAttr(complMatch[1], "cod") || null,
      index: nRaw ? Number(nRaw) || null : null,
      text,
    });
  }
  complements.sort((a, b) => (a.index || 0) - (b.index || 0));

  const utcRaw = cleanString(xmlTag(xml, "utc"));
  const utcOffsetHours = utcRaw ? Number(utcRaw) : null;

  return {
    icao,
    name: xmlTag(xml, "name") || null,
    city: xmlTag(xml, "city") || null,
    uf: xmlTag(xml, "uf") || null,
    typeOpr: xmlTag(xml, "typeOpr") || null,
    typeUtil: xmlTag(xml, "typeUtil") || null,
    altFt: Number(xmlTag(xml, "altFt")) || null,
    fir: xmlTag(xml, "fir") || null,
    lat: Number(xmlTag(xml, "lat")) || null,
    lng: Number(xmlTag(xml, "lng")) || null,
    utcOffsetHours: Number.isFinite(utcOffsetHours) ? utcOffsetHours : null,
    cityDistance: xmlTag(xml, "distance") || null,
    fuel: parseFuel(xml),
    workingHours: parseWorkingHours(xml),
    navaids: parseNavaids(xml),
    declaredDistances: parseDeclaredDistances(xml),
    runways,
    frequencies,
    remarks,
    complements,
    error: null,
  };
}

function emptyRotaer(icao, error) {
  return {
    icao: icao || "",
    name: null,
    city: null,
    uf: null,
    typeOpr: null,
    typeUtil: null,
    altFt: null,
    fir: null,
    lat: null,
    lng: null,
    utcOffsetHours: null,
    cityDistance: null,
    fuel: null,
    workingHours: { text: null, schedules: [] },
    navaids: [],
    declaredDistances: [],
    runways: [],
    frequencies: [],
    remarks: [],
    complements: [],
    error: error || null,
  };
}

async function fetchRotaer(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) {
    return emptyRotaer(icao, "ICAO inválido.");
  }
  const cached = cacheGet(rotaerCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("rotaer", { icaoCode: icao });
    const value = parseRotaer(xml, icao);
    return cacheSet(rotaerCache, icao, value);
  } catch (err) {
    return emptyRotaer(icao, err?.message || "Falha ao buscar ROTAER.");
  }
}

async function fetchSun(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) return null;
  const cached = cacheGet(solCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("sol", { icaoCode: icao });
    const value = {
      date: xmlTag(xml, "date") || null,
      sunriseUtc: xmlTag(xml, "sunrise") || null,
      sunsetUtc: xmlTag(xml, "sunset") || null,
      weekDay: Number(xmlTag(xml, "weekDay")) || null,
    };
    return cacheSet(solCache, icao, value);
  } catch {
    return null;
  }
}

async function fetchCartas(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) return [];
  const cached = cacheGet(cartasCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("cartas", { icaoCode: icao });
    const items = [];
    const itemRe = /<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRe.exec(String(xml || ""))) !== null) {
      const body = match[2] || "";
      const id = xmlTag(body, "id") || xmlAttr(match[1], "id");
      const link = xmlTag(body, "link");
      if (!id || !link) continue;
      items.push({
        id,
        name: xmlTag(body, "nome") || id,
        tipo: xmlTag(body, "tipo") || "?",
        tipoDescr: xmlTag(body, "tipo_descr") || null,
        date: xmlTag(body, "dt") || xmlTag(body, "dtPublic") || null,
        link,
      });
    }
    // Prefer airport overview / visual charts first
    const rank = (t) => {
      const u = String(t || "").toUpperCase();
      if (u === "ADC") return 0;
      if (u === "VAC") return 1;
      if (u === "IAC") return 2;
      if (u === "SID") return 3;
      if (u === "STAR") return 4;
      return 9;
    };
    items.sort((a, b) => rank(a.tipo) - rank(b.tipo) || String(b.date || "").localeCompare(String(a.date || "")));
    return cacheSet(cartasCache, icao, items);
  } catch {
    return [];
  }
}

function parseSuplementos(xml, fallbackIcao) {
  const items = [];
  const itemRe = /<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(String(xml || ""))) !== null) {
    const body = match[2] || "";
    const id = xmlTag(body, "id") || xmlAttr(match[1], "id");
    if (!id) continue;
    const status = cleanString(xmlTag(body, "status")).toLowerCase();
    if (status && !status.includes("vigor") && status !== "active") continue;
    const n = xmlTag(body, "n");
    const serie = xmlTag(body, "serie");
    const number = [serie, n].filter(Boolean).join("") || n || id;
    items.push({
      id,
      number,
      serie: serie || null,
      n: n || null,
      icao: normalizeIcao(xmlTag(body, "local") || fallbackIcao),
      status: xmlTag(body, "status") || null,
      tipo: xmlTag(body, "tipo") || null,
      title: stripHtml(xmlTag(body, "titulo")) || null,
      text: stripHtml(xmlTag(body, "texto")) || "",
      duration: stripHtml(xmlTag(body, "duracao")) || null,
      validFrom: parseAiswebTimestamp(xmlTag(body, "data_inicio")),
      validTo: parseAiswebTimestamp(xmlTag(body, "data_fim")),
      publishedAt: xmlTag(body, "dt") || null,
      ref: xmlTag(body, "ref") || null,
      anexo: xmlTag(body, "anexo") || null,
    });
  }
  items.sort((a, b) => {
    const ta = Date.parse(a.validFrom || a.publishedAt || "") || 0;
    const tb = Date.parse(b.validFrom || b.publishedAt || "") || 0;
    return tb - ta;
  });
  return items;
}

async function fetchSupplements(icaoCode, options = {}) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) return [];
  const bypassCache = options?.bypassCache === true;
  if (!bypassCache) {
    const cached = cacheGet(suplementosCache, icao);
    if (cached) return cached;
  }
  try {
    const xml = await aiswebFetch("suplementos", { icaoCode: icao });
    const items = parseSuplementos(xml, icao);
    return cacheSet(suplementosCache, icao, items);
  } catch {
    return [];
  }
}

async function fetchGeilocByType(type) {
  const key = cleanString(type).toUpperCase() || "ALL";
  const cached = cacheGet(geilocCache, key);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("geiloc", type ? { type } : {});
    const items = [];
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRe.exec(String(xml || ""))) !== null) {
      const body = match[1] || "";
      const code = normalizeIcao(xmlTag(body, "IcaoCode"));
      const name = xmlTag(body, "name") || null;
      if (!code && !name) continue;
      items.push({
        id: xmlTag(body, "id") || null,
        type: xmlTag(body, "type") || type || null,
        icao: code || null,
        name,
        status: xmlTag(body, "status") || null,
        city: xmlTag(body, "city") || null,
        uf: xmlTag(body, "uf") || null,
      });
    }
    return cacheSet(geilocCache, key, items);
  } catch {
    return cacheSet(geilocCache, key, []);
  }
}

function matchTmaForAirport(tmas, rotaer) {
  const city = normalizeSearchText(rotaer?.city);
  const name = normalizeSearchText(rotaer?.name);
  const uf = normalizeSearchText(rotaer?.uf);
  if (!city && !name) return null;
  const scored = [];
  for (const tma of tmas) {
    const tmaName = normalizeSearchText(String(tma.name || "").replace(/\/TMA$/i, ""));
    if (!tmaName) continue;
    let score = 0;
    if (city && (tmaName === city || tmaName.includes(city) || city.includes(tmaName))) score += 10;
    if (name) {
      const nameToken = name.split(" ")[0];
      if (nameToken && tmaName.includes(nameToken)) score += 3;
    }
    if (uf && normalizeSearchText(tma.uf) === uf) score += 1;
    if (score > 0) scored.push({ tma, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.tma || null;
}

async function resolveAirspace(rotaer) {
  const firCode = normalizeIcao(rotaer?.fir);
  const [firs, tmas] = await Promise.all([fetchGeilocByType("FIR"), fetchGeilocByType("TMA")]);
  const fir = firCode ? firs.find((item) => item.icao === firCode) || null : null;
  const tma = matchTmaForAirport(tmas, rotaer);
  return {
    fir: fir
      ? { code: fir.icao, name: fir.name }
      : firCode
        ? { code: firCode, name: null }
        : null,
    tma: tma ? { code: tma.icao, name: tma.name } : null,
    wms: {
      baseUrl: GEOAISWEB_WMS_BASE,
      layers: [
        { id: "tma", label: "TMA", layer: "ICA:TMA" },
        { id: "ctr", label: "CTR", layer: "ICA:CTR" },
        { id: "atz", label: "ATZ", layer: "ICA:ATZ" },
        { id: "fir", label: "FIR", layer: "ICA:SETOR_FIR" },
      ],
    },
  };
}

async function fetchAirportBundle(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  const [met, notams, rotaer, sun, charts, supplements] = await Promise.all([
    fetchMet(icao),
    fetchNotams(icao),
    fetchRotaer(icao),
    fetchSun(icao),
    fetchCartas(icao),
    fetchSupplements(icao),
  ]);
  const airspace = rotaer && !rotaer.error ? await resolveAirspace(rotaer) : null;
  return {
    icao,
    met,
    rotaer,
    notams,
    supplements,
    sun,
    charts,
    airspace,
    error: met.error || rotaer.error || null,
  };
}

function isAllowedChartUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host !== "aisweb.decea.gov.br" && host !== "aisweb.decea.mil.br") return false;
    return u.pathname.startsWith("/download");
  } catch {
    return false;
  }
}

/** Proxy chart PDF as base64 so the browser can preview (API sends Content-Disposition: attachment). */
async function fetchChartPreview(rawUrl) {
  if (!isAllowedChartUrl(rawUrl)) {
    throw Object.assign(new Error("URL de carta inválida."), { status: 400 });
  }
  const response = await fetch(String(rawUrl), {
    method: "GET",
    headers: { Accept: "application/pdf,*/*" },
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Falha ao baixar carta (${response.status}).`), { status: 502 });
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
    throw Object.assign(new Error("Carta vazia."), { status: 502 });
  }
  // Soft cap ~8MB decoded to keep function payloads sane.
  if (buffer.length > 8 * 1024 * 1024) {
    throw Object.assign(new Error("Carta grande demais para preview. Abra o PDF."), { status: 413 });
  }
  const disposition = response.headers.get("content-disposition") || "";
  const nameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
  const filename = nameMatch ? decodeURIComponent(nameMatch[1].replace(/"/g, "").trim()) : "carta.pdf";
  return {
    contentType: "application/pdf",
    filename,
    base64: buffer.toString("base64"),
    byteLength: buffer.length,
  };
}

function sanitizeMinimums(input) {
  const list = Array.isArray(input) ? input : DEFAULT_MINIMUMS;
  const byCondition = new Map(DEFAULT_MINIMUMS.map((item) => [item.condition, item]));
  for (const raw of list) {
    const condition = cleanString(raw?.condition);
    if (!byCondition.has(condition)) continue;
    const base = byCondition.get(condition);
    const ceiling = Number(raw?.ceilingFt);
    const visibility = Number(raw?.visibilityKm);
    const wind = Number(raw?.maxWindKt);
    byCondition.set(condition, {
      condition,
      label: cleanString(raw?.label) || base.label,
      ceilingFt: Math.max(0, Number.isFinite(ceiling) ? ceiling : base.ceilingFt),
      visibilityKm: Math.max(0, Number.isFinite(visibility) ? visibility : base.visibilityKm),
      maxWindKt: Math.max(0, Number.isFinite(wind) ? wind : base.maxWindKt),
    });
  }
  return DEFAULT_MINIMUMS.map((item) => byCondition.get(item.condition));
}

function defaultSettings() {
  return {
    defaultIcao: "SBSP",
    minimums: DEFAULT_MINIMUMS.map((item) => ({ ...item })),
    updatedAt: null,
  };
}

function publicSettings(raw, updatedAt = null) {
  const base = defaultSettings();
  return {
    defaultIcao: normalizeIcao(raw?.defaultIcao) || base.defaultIcao,
    minimums: sanitizeMinimums(raw?.minimums),
    updatedAt: updatedAt || raw?.updatedAt || null,
  };
}

function watchlistKey(userId) {
  return `${AISWEB_WATCHLIST_PREFIX}${cleanString(userId)}`;
}

function sanitizeIcaoList(values, { fallbackDefault = "", allowEmpty = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const icao = normalizeIcao(value);
    if (!icao || icao.length !== 4 || seen.has(icao)) continue;
    seen.add(icao);
    out.push(icao);
    if (out.length >= MAX_WATCHLIST) break;
  }
  if (!out.length && !allowEmpty) {
    const fallback = normalizeIcao(fallbackDefault);
    if (fallback && fallback.length === 4) out.push(fallback);
  }
  return out;
}

function sortNotams(items) {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.issuedAt || a.validFrom || "") || 0;
    const tb = Date.parse(b.issuedAt || b.validFrom || "") || 0;
    return tb - ta;
  });
}

async function loadSettings(deps) {
  const doc = await deps.getSettingDoc(AISWEB_SETTINGS_KEY);
  if (!doc) return defaultSettings();
  let raw = {};
  try {
    raw = JSON.parse(doc.settings_json || "{}");
  } catch {
    raw = {};
  }
  return publicSettings(raw, doc.$updatedAt || raw.updatedAt || null);
}

async function saveSettings(deps, input) {
  const next = publicSettings({
    defaultIcao: input?.defaultIcao,
    minimums: input?.minimums,
    updatedAt: nowIso(),
  }, nowIso());
  const saved = await deps.upsertPlatformSettingDoc(AISWEB_SETTINGS_KEY, next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar as configurações AISWEB."), { status: 500 });
  }
  return next;
}

function sanitizeNotamAlerts(rawAlerts, icaoCodes) {
  const out = {};
  const allowed = new Set(icaoCodes);
  const source =
    rawAlerts && typeof rawAlerts === "object" && !Array.isArray(rawAlerts) ? rawAlerts : {};
  for (const icao of allowed) {
    out[icao] = source[icao] === true;
  }
  return out;
}

function sanitizeSupplementAlerts(rawAlerts, icaoCodes) {
  return sanitizeNotamAlerts(rawAlerts, icaoCodes);
}

function sanitizeSeenNotamIds(rawSeen, icaoCodes, notamAlerts) {
  const out = {};
  const allowed = new Set(icaoCodes.filter((icao) => notamAlerts[icao] === true));
  const source = rawSeen && typeof rawSeen === "object" && !Array.isArray(rawSeen) ? rawSeen : {};
  for (const icao of allowed) {
    const list = Array.isArray(source[icao]) ? source[icao] : null;
    if (!list) continue;
    const ids = [];
    const seen = new Set();
    for (const value of list) {
      const id = cleanString(value);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= 200) break;
    }
    out[icao] = ids;
  }
  return out;
}

function sanitizeSeenSupplementIds(rawSeen, icaoCodes, supplementAlerts) {
  return sanitizeSeenNotamIds(rawSeen, icaoCodes, supplementAlerts);
}

function publicWatchlist(raw, updatedAt) {
  const icaoCodes = sanitizeIcaoList(raw?.icaoCodes, { allowEmpty: true });
  const notamAlerts = sanitizeNotamAlerts(raw?.notamAlerts, icaoCodes);
  const supplementAlerts = sanitizeSupplementAlerts(raw?.supplementAlerts, icaoCodes);
  return {
    icaoCodes,
    notamAlerts,
    supplementAlerts,
    updatedAt: updatedAt || raw?.updatedAt || null,
  };
}

async function loadWatchlist(deps, userId, defaultIcao) {
  const doc = await deps.getSettingDoc(watchlistKey(userId));
  if (!doc) {
    const icaoCodes = sanitizeIcaoList([], { fallbackDefault: defaultIcao });
    return {
      icaoCodes,
      notamAlerts: sanitizeNotamAlerts({}, icaoCodes),
      supplementAlerts: sanitizeSupplementAlerts({}, icaoCodes),
      seenNotamIds: {},
      seenSupplementIds: {},
      updatedAt: null,
    };
  }
  let raw = {};
  try {
    raw = JSON.parse(doc.settings_json || "{}");
  } catch {
    raw = {};
  }
  const savedCodes = sanitizeIcaoList(raw.icaoCodes, { allowEmpty: true });
  const icaoCodes = savedCodes.length
    ? savedCodes
    : sanitizeIcaoList([], { fallbackDefault: defaultIcao });
  const notamAlerts = sanitizeNotamAlerts(raw.notamAlerts, icaoCodes);
  const supplementAlerts = sanitizeSupplementAlerts(raw.supplementAlerts, icaoCodes);
  return {
    icaoCodes,
    notamAlerts,
    supplementAlerts,
    seenNotamIds: sanitizeSeenNotamIds(raw.seenNotamIds, icaoCodes, notamAlerts),
    seenSupplementIds: sanitizeSeenSupplementIds(raw.seenSupplementIds, icaoCodes, supplementAlerts),
    updatedAt: doc.$updatedAt || raw.updatedAt || null,
  };
}

async function saveWatchlist(deps, userId, input = {}) {
  const previous = await loadWatchlist(deps, userId, "");
  const icaoCodes = sanitizeIcaoList(
    Array.isArray(input) ? input : input?.icaoCodes,
    { allowEmpty: true },
  );
  const notamAlerts = sanitizeNotamAlerts(
    Array.isArray(input)
      ? previous.notamAlerts
      : input?.notamAlerts != null
        ? input.notamAlerts
        : previous.notamAlerts,
    icaoCodes,
  );
  const supplementAlerts = sanitizeSupplementAlerts(
    Array.isArray(input)
      ? previous.supplementAlerts
      : input?.supplementAlerts != null
        ? input.supplementAlerts
        : previous.supplementAlerts,
    icaoCodes,
  );

  const nextSeen = { ...(previous.seenNotamIds || {}) };
  for (const icao of Object.keys(nextSeen)) {
    if (!icaoCodes.includes(icao) || !notamAlerts[icao]) delete nextSeen[icao];
  }
  for (const icao of icaoCodes) {
    const wasOn = previous.notamAlerts?.[icao] === true;
    const isOn = notamAlerts[icao] === true;
    if (isOn && !wasOn) {
      const items = await fetchNotams(icao, { bypassCache: true }).catch(() => []);
      nextSeen[icao] = items.map((item) => cleanString(item.id)).filter(Boolean).slice(0, 200);
    }
  }

  const nextSeenSup = { ...(previous.seenSupplementIds || {}) };
  for (const icao of Object.keys(nextSeenSup)) {
    if (!icaoCodes.includes(icao) || !supplementAlerts[icao]) delete nextSeenSup[icao];
  }
  for (const icao of icaoCodes) {
    const wasOn = previous.supplementAlerts?.[icao] === true;
    const isOn = supplementAlerts[icao] === true;
    if (isOn && !wasOn) {
      const items = await fetchSupplements(icao, { bypassCache: true }).catch(() => []);
      nextSeenSup[icao] = items.map((item) => cleanString(item.id)).filter(Boolean).slice(0, 200);
    }
  }

  const next = {
    icaoCodes,
    notamAlerts,
    supplementAlerts,
    seenNotamIds: sanitizeSeenNotamIds(nextSeen, icaoCodes, notamAlerts),
    seenSupplementIds: sanitizeSeenSupplementIds(nextSeenSup, icaoCodes, supplementAlerts),
    updatedAt: nowIso(),
  };
  const saved = await deps.upsertPlatformSettingDoc(watchlistKey(userId), next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar a watchlist AISWEB."), { status: 500 });
  }
  return publicWatchlist(next, next.updatedAt);
}

function userIdFromWatchlistKey(key) {
  const raw = cleanString(key);
  if (!raw.startsWith(AISWEB_WATCHLIST_PREFIX)) return "";
  return cleanString(raw.slice(AISWEB_WATCHLIST_PREFIX.length));
}

function mergeSeenNotamIds(previousIds, currentIds) {
  const out = [];
  const seen = new Set();
  for (const id of [...currentIds, ...(previousIds || [])]) {
    const value = cleanString(id);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 200) break;
  }
  return out;
}

async function buildBootstrap(deps, userId) {
  const settings = await loadSettings(deps);
  const watchlistFull = await loadWatchlist(deps, userId, settings.defaultIcao);
  const watchlist = publicWatchlist(watchlistFull, watchlistFull.updatedAt);
  return { settings, watchlist };
}

async function buildDashboard(deps, userId) {
  const { settings, watchlist } = await buildBootstrap(deps, userId);
  const airports = await Promise.all(watchlist.icaoCodes.map((icao) => fetchAirportBundle(icao)));
  const notams = sortNotams(airports.flatMap((item) => item.notams || []));
  return { settings, watchlist, airports, notams };
}

module.exports = {
  AISWEB_SETTINGS_KEY,
  AISWEB_WATCHLIST_PREFIX,
  DEFAULT_MINIMUMS,
  normalizeIcao,
  loadSettings,
  saveSettings,
  loadWatchlist,
  saveWatchlist,
  publicWatchlist,
  userIdFromWatchlistKey,
  mergeSeenNotamIds,
  fetchNotams,
  fetchSupplements,
  fetchAirportBundle,
  buildBootstrap,
  buildDashboard,
  publicSettings,
  fetchChartPreview,
};
