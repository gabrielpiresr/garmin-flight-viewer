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
    if (visMatch?.[1]) visibilityM = Number(visMatch[1]);
    else if (visMatch?.[2]) visibilityM = Math.round(Number(visMatch[2]) * 1609.34);
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

async function aiswebFetch(area, icaoCode) {
  const { apiKey, apiPass } = aiswebCredentials();
  const url = new URL(AISWEB_API_BASE);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("apiPass", apiPass);
  url.searchParams.set("area", area);
  url.searchParams.set("icaoCode", icaoCode);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  const xml = await response.text();
  if (!xml || !xml.includes("<aisweb")) {
    const snippet = cleanString(xml).slice(0, 180);
    throw Object.assign(new Error(snippet || `Falha AISWEB (${area}/${icaoCode}).`), { status: 502 });
  }
  if (/<service[^>]*total="error"/i.test(xml)) {
    throw Object.assign(new Error(xmlTag(xml, "msg") || `Erro AISWEB (${area}).`), { status: 502 });
  }
  return xml;
}

async function fetchMet(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) {
    return { icao: icao || "", metar: "", taf: "", parsed: null, error: "Código ICAO inválido." };
  }
  const cached = cacheGet(metCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("met", icao);
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

async function fetchNotams(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  if (!icao || icao.length !== 4) return [];
  const cached = cacheGet(notamCache, icao);
  if (cached) return cached;
  try {
    const xml = await aiswebFetch("notam", icao);
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
    // Runway-level lights: collect light tags that are not inside <thr>
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
    const xml = await aiswebFetch("rotaer", icao);
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
    const xml = await aiswebFetch("sol", icao);
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
    const xml = await aiswebFetch("cartas", icao);
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

async function fetchAirportBundle(icaoCode) {
  const icao = normalizeIcao(icaoCode);
  const [met, notams, rotaer, sun, charts] = await Promise.all([
    fetchMet(icao),
    fetchNotams(icao),
    fetchRotaer(icao),
    fetchSun(icao),
    fetchCartas(icao),
  ]);
  return {
    icao,
    met,
    rotaer,
    notams,
    sun,
    charts,
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

async function loadWatchlist(deps, userId, defaultIcao) {
  const doc = await deps.getSettingDoc(watchlistKey(userId));
  if (!doc) {
    return {
      icaoCodes: sanitizeIcaoList([], { fallbackDefault: defaultIcao }),
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
  return {
    // Lista vazia (ou primeira visita) usa o aeródromo padrão da escola.
    icaoCodes: savedCodes.length
      ? savedCodes
      : sanitizeIcaoList([], { fallbackDefault: defaultIcao }),
    updatedAt: doc.$updatedAt || raw.updatedAt || null,
  };
}

async function saveWatchlist(deps, userId, icaoCodes) {
  const next = {
    icaoCodes: sanitizeIcaoList(icaoCodes, { allowEmpty: true }),
    updatedAt: nowIso(),
  };
  const saved = await deps.upsertPlatformSettingDoc(watchlistKey(userId), next);
  if (!saved) {
    throw Object.assign(new Error("Não foi possível salvar a watchlist AISWEB."), { status: 500 });
  }
  return next;
}

async function buildDashboard(deps, userId) {
  const settings = await loadSettings(deps);
  const watchlist = await loadWatchlist(deps, userId, settings.defaultIcao);
  const airports = [];
  for (const icao of watchlist.icaoCodes) {
    airports.push(await fetchAirportBundle(icao));
  }
  const notams = sortNotams(airports.flatMap((item) => item.notams || []));
  return { settings, watchlist, airports, notams };
}

module.exports = {
  AISWEB_SETTINGS_KEY,
  DEFAULT_MINIMUMS,
  normalizeIcao,
  loadSettings,
  saveSettings,
  loadWatchlist,
  saveWatchlist,
  fetchAirportBundle,
  buildDashboard,
  publicSettings,
  fetchChartPreview,
};
