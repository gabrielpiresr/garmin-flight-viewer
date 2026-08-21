/**
 * Dry-run: simula adoptDeletedSagaFlightIds no PS-DZB de agosto.
 * Nao grava nada. Busca o relatorio SAGA direto (sem chamar a function).
 */
import fs from "node:fs";
import * as sdk from "node-appwrite";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i)] = t.slice(i + 1);
}

const client = new sdk.Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new sdk.Databases(client);
const databaseId = env.VITE_APPWRITE_DATABASE_ID;
const flightsId = env.VITE_APPWRITE_COLLECTION_ID;
const settingsId = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const SAGA_BASE_URL = "https://epeac.saga.aero";
const START_DATE = "2026-08-01";
const END_DATE = "2026-08-20";

function cleanString(value) {
  return String(value ?? "").trim();
}
function normalizeCanac(value) {
  return cleanString(value).replace(/\D/g, "");
}
function sagaNormalizeLogbookId(value) {
  return cleanString(value).replace(/^ID\s+/i, "").replace(/\s+/g, "").toUpperCase();
}
function sagaIdentKey(value) {
  return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function parseClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function dateBrToIso(value) {
  const match = cleanString(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function identNorm(value) {
  return sagaIdentKey(value);
}
function round1(value) {
  return Number((Number(value) || 0).toFixed(1));
}
function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function sagaTextFromHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function sagaSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=\s]+=[^;,]*;)/g).map((cookie) => cookie.trim()).filter(Boolean);
}
function sagaMergeCookies(cookieJar, headers) {
  for (const cookie of sagaSetCookieHeaders(headers)) {
    const pair = String(cookie).split(";", 1)[0] || "";
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) cookieJar.set(pair.slice(0, eqIndex), pair.slice(eqIndex + 1));
  }
}
function sagaCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}
function sagaPersistableCookieKey(key) {
  const normalized = cleanString(key);
  if (!normalized) return false;
  return normalized === "XSRF-TOKEN" || /session/i.test(normalized);
}
function sagaHasAuthCookie(cookieJar) {
  if (!cookieJar || cookieJar.size === 0) return false;
  if (cookieJar.get("saga_session")) return true;
  for (const key of cookieJar.keys()) {
    if (/session/i.test(String(key))) return true;
  }
  return false;
}
function sagaCookieJarFromObject(cookies) {
  const jar = new Map();
  if (!cookies || typeof cookies !== "object") return jar;
  for (const [key, value] of Object.entries(cookies)) {
    const normalizedKey = cleanString(key);
    const normalizedValue = cleanString(value);
    if (normalizedKey && normalizedValue && sagaPersistableCookieKey(normalizedKey)) {
      jar.set(normalizedKey, normalizedValue);
    }
  }
  return jar;
}
function extractSagaCsrfToken(html) {
  const text = String(html || "");
  const patterns = [
    /<input\b[^>]*name=["']_token["'][^>]*value=["']([^"']+)["']/i,
    /<input\b[^>]*value=["']([^"']+)["'][^>]*name=["']_token["']/i,
    /<meta\b[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}
async function sagaFetch(path, options, cookieJar) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    ...options.headers,
  };
  const cookie = sagaCookieHeader(cookieJar);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${SAGA_BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  sagaMergeCookies(cookieJar, response.headers);
  const html = await response.text();
  return { response, html };
}
function isSagaLoginResponse(result) {
  const status = result?.response?.status || 0;
  const location = result?.response?.headers?.get?.("location") || "";
  const html = String(result?.html || "");
  const hasLoginForm = /<form\b[^>]*action=["'][^"']*\/login["']/i.test(html) ||
    (/<input\b[^>]*name=["']email["']/i.test(html) && /<input\b[^>]*name=["']password["']/i.test(html));
  return (status >= 300 && status < 400 && /\/login(?:$|[?#])/i.test(location)) || hasLoginForm;
}

const SAGA_FLIGHT_COLUMN_DEFS = [
  { key: "id", defaultIndex: 0 },
  { key: "perna", defaultIndex: 1 },
  { key: "dataDoVoo", defaultIndex: 2 },
  { key: "base", defaultIndex: 3 },
  { key: "aeronave", defaultIndex: 4 },
  { key: "instrutor", defaultIndex: 5 },
  { key: "canacInstrutor", defaultIndex: 6 },
  { key: "aluno", defaultIndex: 7 },
  { key: "canacAluno", defaultIndex: 8 },
  { key: "horimetroInicial", defaultIndex: 9 },
  { key: "horimetroFinal", defaultIndex: 10 },
  { key: "missaoDoAluno", defaultIndex: 11 },
  { key: "origem", defaultIndex: 12 },
  { key: "destino", defaultIndex: 13 },
  { key: "acionamento", defaultIndex: 14 },
  { key: "decolagem", defaultIndex: 15 },
  { key: "pouso", defaultIndex: 16 },
  { key: "corte", defaultIndex: 17 },
  { key: "tempoDeVooHhmm", defaultIndex: 18 },
  { key: "tempoDeServicoHhmm", defaultIndex: 19 },
  { key: "tempoDeVooHoras", defaultIndex: 20 },
  { key: "tempoDeServicoHoras", defaultIndex: 21 },
  { key: "numeroPousos", defaultIndex: 22 },
  { key: "distancia", defaultIndex: 23 },
  { key: "funcaoABordo", defaultIndex: 24 },
  { key: "regrasDeVoo", defaultIndex: 25 },
  { key: "diurnoOuNoturno", defaultIndex: 26 },
  { key: "diarioDeBordo", defaultIndex: 27 },
  { key: "grau", defaultIndex: 28 },
  { key: "combustivel", defaultIndex: 29 },
  { key: "ce", defaultIndex: 30 },
  { key: "oleo", defaultIndex: 31 },
  { key: "valorDoVoo", defaultIndex: 32 },
  { key: "curso", defaultIndex: 33 },
];
const SAGA_DEFAULT_FLIGHT_COLUMN_MAP = Object.fromEntries(SAGA_FLIGHT_COLUMN_DEFS.map((def) => [def.key, def.defaultIndex]));

function sagaFlightFromCells(cells, columnMap = SAGA_DEFAULT_FLIGHT_COLUMN_MAP) {
  const rawCells = Array.isArray(cells) ? cells : [];
  const item = {};
  for (const def of SAGA_FLIGHT_COLUMN_DEFS) {
    const index = Number.isInteger(columnMap?.[def.key]) ? columnMap[def.key] : def.defaultIndex;
    item[def.key] = rawCells[index] || "";
  }
  item.rawCells = rawCells;
  return item;
}
function sagaHtmlTables(html) {
  const tables = [];
  const tableMatches = String(html || "").matchAll(/<table\b[\s\S]*?<\/table>/gi);
  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[0];
    const rows = [];
    const rowMatches = tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const rowHtml = rowMatch[0];
      const cells = [];
      const cellMatches = rowHtml.matchAll(/<(th|td)\b[\s\S]*?<\/\1>/gi);
      for (const cellMatch of cellMatches) {
        cells.push({ tag: cellMatch[1].toLowerCase(), text: sagaTextFromHtml(cellMatch[0]) });
      }
      if (cells.some((cell) => cell.text)) rows.push(cells);
    }
    if (!rows.length) continue;
    const firstHeaderIndex = rows.findIndex((row) => row.some((cell) => cell.tag === "th"));
    const headerIndex = firstHeaderIndex >= 0 ? firstHeaderIndex : 0;
    const headerRow = rows[headerIndex];
    const bodyRows = rows
      .filter((row) => row.every((cell) => cell.tag !== "th"))
      .map((row) => row.map((cell) => cell.text))
      .filter((row) => row.some(Boolean));
    tables.push({ headers: headerRow.map((cell) => cell.text).filter(Boolean), rows: bodyRows });
  }
  return tables;
}
function findSagaTable(html, requiredHeaders) {
  const normalizedRequired = requiredHeaders.map((header) => normalizeSearch(header));
  let best = null;
  let bestScore = -1;
  for (const table of sagaHtmlTables(html)) {
    const normalizedHeaders = table.headers.map((header) => normalizeSearch(header));
    const score = normalizedRequired.filter((header) => normalizedHeaders.includes(header)).length;
    if (score > bestScore || (score === bestScore && table.rows.length > (best?.rows.length || 0))) {
      best = table;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}
function translateSagaFlightRows(html) {
  const table = findSagaTable(html, ["ID", "Perna", "Data do Voo", "Aeronave", "Aluno"]);
  if (!table) return { rows: [], headers: [] };
  return { rows: table.rows.map((cells) => sagaFlightFromCells(cells)), headers: table.headers };
}

function groupSagaFlightsById(flights) {
  const map = new Map();
  for (const flight of flights || []) {
    const id = cleanString(flight.id);
    if (!id) continue;
    if (!map.has(id)) map.set(id, { id, key: id, ordinal: 1, legs: [] });
    map.get(id).legs.push(flight);
  }
  return [...map.values()];
}

function sagaLegsFromDoc(doc) {
  try {
    const parsed = JSON.parse(doc?.saga_legs_json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function sagaLogbookIdsFromLegs(legs) {
  return new Set((legs || []).map((leg) => sagaNormalizeLogbookId(leg?.diarioDeBordo)).filter(Boolean));
}
function sagaFlightWindowFromLegs(legs, fallbackDate = "", fallbackStart = "") {
  const list = Array.isArray(legs) ? legs : [];
  const first = list[0] || {};
  const last = list[list.length - 1] || first;
  const date = dateBrToIso(first.dataDoVoo) || cleanString(fallbackDate).slice(0, 10);
  const start = parseClockMinutes(first.acionamento || first.decolagem || fallbackStart);
  let end = parseClockMinutes(last.corte || last.pouso);
  if (start == null) return { date, start: null, end: null };
  if (end == null) end = start + 1;
  else if (end <= start) end += 24 * 60;
  return {
    date,
    start,
    end,
    canac: normalizeCanac(first.canacAluno),
    aircraftRaw: cleanString(first.aeronave),
  };
}
function sagaWindowsOverlap(left, right) {
  if (!left?.date || !right?.date || left.date !== right.date) return false;
  if (left.start == null || right.start == null || left.end == null || right.end == null) return false;
  return left.start < right.end && right.start < left.end;
}
function sagaGroupMatchFingerprint(group, mapping = {}) {
  const legs = group?.legs || [];
  const first = legs[0] || {};
  const window = sagaFlightWindowFromLegs(legs, dateBrToIso(first.dataDoVoo), first.acionamento || first.decolagem);
  const mappedAircraft = cleanString(mapping.aircraftBySaga?.[window.aircraftRaw]) || window.aircraftRaw;
  return {
    key: cleanString(group?.key || group?.id),
    logbookIds: sagaLogbookIdsFromLegs(legs),
    window,
    aircraftKey: sagaIdentKey(mappedAircraft) || sagaIdentKey(window.aircraftRaw),
    canac: window.canac,
    aluno: cleanString(first.aluno),
    missao: cleanString(first.missaoDoAluno),
  };
}
function sagaLocalMatchFingerprint(doc, mapping = {}) {
  const legs = sagaLegsFromDoc(doc);
  const window = sagaFlightWindowFromLegs(legs, doc?.flight_date, doc?.start_time);
  const mappedFromLegs = cleanString(mapping.aircraftBySaga?.[window.aircraftRaw]) || window.aircraftRaw;
  const raw = cleanString(doc?.saga_flight_id);
  let key = raw.startsWith("test:") ? raw.slice(5) : raw;
  if (key.toLowerCase().startsWith("schedule:")) key = "";
  return {
    key,
    logbookIds: sagaLogbookIdsFromLegs(legs),
    window: { ...window, date: window.date || cleanString(doc?.flight_date).slice(0, 10) },
    aircraftKey: sagaIdentKey(doc?.aircraft_ident) || sagaIdentKey(mappedFromLegs),
    canac: window.canac,
    name: cleanString(doc?.name),
    hours: Number(doc?.block_time_minutes || 0) / 60,
    created: doc?.$createdAt,
    telemetry: Boolean(doc?.telemetry_present || doc?.csv_file_id),
    source: cleanString(doc?.source_filename),
  };
}
function pickFirstSagaSuccessor(matches) {
  return [...(matches || [])].sort((left, right) => {
    const dateCmp = cleanString(left?.window?.date).localeCompare(cleanString(right?.window?.date));
    if (dateCmp) return dateCmp;
    const startCmp = (Number(left?.window?.start) || 1e9) - (Number(right?.window?.start) || 1e9);
    if (startCmp) return startCmp;
    const leftNum = Number(left?.key);
    const rightNum = Number(right?.key);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) return leftNum - rightNum;
    return cleanString(left?.key).localeCompare(cleanString(right?.key));
  })[0] || null;
}

function sagaDeletedFlightLooksLikeSuccessor(stale, incoming) {
  if (!stale?.key || !incoming?.key || stale.key === incoming.key) return false;
  const sharedLogbook = [...stale.logbookIds].some((id) => incoming.logbookIds.has(id));
  if (sharedLogbook) return true;
  if (!stale.canac || !incoming.canac || stale.canac !== incoming.canac) return false;
  if (!stale.aircraftKey || !incoming.aircraftKey || stale.aircraftKey !== incoming.aircraftKey) return false;
  return sagaWindowsOverlap(stale.window, incoming.window);
}

async function listAll(collectionId, queries) {
  const docs = [];
  let cursor = null;
  for (let page = 0; page < 30; page += 1) {
    const q = [...queries, sdk.Query.limit(100)];
    if (cursor) q.push(sdk.Query.cursorAfter(cursor));
    const res = await db.listDocuments({ databaseId, collectionId, queries: q });
    const batch = res.documents || [];
    docs.push(...batch);
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1].$id;
  }
  return docs;
}

async function loginSaga(cookieJar, email, password) {
  const preLogin = await sagaFetch("/login", {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  }, cookieJar);
  const token = extractSagaCsrfToken(preLogin.html);
  if (!token) throw new Error("Token CSRF do SAGA nao encontrado.");
  const form = new URLSearchParams();
  form.set("_token", token);
  form.set("email", email);
  form.set("password", password);
  const login = await sagaFetch("/login", {
    method: "POST",
    body: form.toString(),
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: SAGA_BASE_URL,
      referer: `${SAGA_BASE_URL}/login`,
    },
  }, cookieJar);
  const redirectedToDashboard = login.response.status === 302 && String(login.response.headers.get("location") || "").includes("/dashboard");
  const loginReturnedDashboard = login.response.status === 200 && /dashboard|logout|\/users/i.test(login.html) && !/name=["']_token["']/i.test(login.html);
  if (!redirectedToDashboard && !loginReturnedDashboard) {
    throw new Error("Login SAGA nao confirmado.");
  }
}

const mappingDoc = await db.listDocuments({
  databaseId,
  collectionId: settingsId,
  queries: [sdk.Query.equal("key", ["sagaImportMapping"]), sdk.Query.limit(1)],
});
const mapping = JSON.parse(mappingDoc.documents[0]?.settings_json || "{}");

const credDoc = await db.listDocuments({
  databaseId,
  collectionId: settingsId,
  queries: [sdk.Query.equal("key", ["sagaImportCredentials"]), sdk.Query.limit(1)],
});
const cred = JSON.parse(credDoc.documents[0]?.settings_json || "{}");
if (!cred.email || !cred.password) {
  throw new Error("Credenciais SAGA nao encontradas nas settings.");
}

const sessionDoc = await db.listDocuments({
  databaseId,
  collectionId: settingsId,
  queries: [sdk.Query.equal("key", ["sagaAuthSession"]), sdk.Query.limit(1)],
});
const session = JSON.parse(sessionDoc.documents[0]?.settings_json || "{}");
const cookieJar = sagaCookieJarFromObject(session.cookies);

console.log(`Buscando relatorio SAGA ${START_DATE} a ${END_DATE}...`);
const operationsPath = `/reports/operations?start_date=${START_DATE}&end_date=${END_DATE}`;
let operations = await sagaFetch(operationsPath, {
  method: "GET",
  headers: {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    referer: `${SAGA_BASE_URL}/users`,
  },
}, cookieJar);

if (!sagaHasAuthCookie(cookieJar) || isSagaLoginResponse(operations)) {
  console.log("Sessao SAGA expirada; fazendo login...");
  await loginSaga(cookieJar, cred.email, cred.password);
  operations = await sagaFetch(operationsPath, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: `${SAGA_BASE_URL}/users`,
    },
  }, cookieJar);
}
if (isSagaLoginResponse(operations)) {
  throw new Error("SAGA ainda retornou tela de login apos autenticar.");
}

const parsed = translateSagaFlightRows(operations.html);
const columnMap = mapping.flightColumnMap || SAGA_DEFAULT_FLIGHT_COLUMN_MAP;
const flights = parsed.rows.map((row) => sagaFlightFromCells(row.rawCells || [], columnMap));
const sagaGroups = groupSagaFlightsById(flights);
const presentKeys = new Set(sagaGroups.map((g) => g.key));
console.log(`SAGA: ${flights.length} linhas, ${sagaGroups.length} grupos.`);

const local = (await listAll(flightsId, [
  sdk.Query.greaterThanEqual("flight_date", "2026-08-01"),
  sdk.Query.lessThanEqual("flight_date", "2026-08-31"),
  sdk.Query.orderAsc("flight_date"),
])).filter((d) => identNorm(d.aircraft_ident).includes("DZB") && d.flight_status === "Realizado");

const incomingAll = sagaGroups.map((g) => sagaGroupMatchFingerprint(g, mapping));
const incomingDzb = incomingAll.filter((item) => item.aircraftKey === "PSDZB" || item.aircraftKey.includes("DZB"));

const staleDocs = [];
for (const doc of local) {
  const stale = sagaLocalMatchFingerprint(doc, mapping);
  if (!stale.key) continue;
  if (presentKeys.has(stale.key)) continue;
  staleDocs.push(doc);
}

const adoptedKeys = new Set();
const adopted = [];
const purged = [];
for (const doc of staleDocs) {
  const stale = sagaLocalMatchFingerprint(doc, mapping);
  const matches = incomingAll.filter((item) => !adoptedKeys.has(item.key) && sagaDeletedFlightLooksLikeSuccessor(stale, item));
  const successor = pickFirstSagaSuccessor(matches);
  if (!successor) {
    purged.push({
      deleteLocal: doc.$id,
      fromSagaId: stale.key,
      date: doc.flight_date,
      hoursDropped: round1(stale.hours),
      reason: "sem sucessor",
      telemetry: stale.telemetry,
      name: stale.name,
    });
    continue;
  }
  const successorDoc = local.find((d) => d.$id === `saga_flight_${successor.key}`)
    || local.find((d) => cleanString(d.saga_flight_id) === successor.key);
  adoptedKeys.add(successor.key);
  adopted.push({
    keepLocal: successorDoc?.$id || `saga_flight_${successor.key}`,
    deleteLocal: doc.$id,
    fromSagaId: stale.key,
    toSagaId: successor.key,
    candidates: [successor.key, ...matches.map((item) => item.key).filter((key) => key !== successor.key)],
    date: doc.flight_date,
    aluno: successor.aluno,
    missao: successor.missao,
    hoursDropped: round1(stale.hours),
    enrichmentSource: stale.source,
    telemetryMoved: stale.telemetry,
    matchBy: [...stale.logbookIds].some((id) => successor.logbookIds.has(id)) ? "diario" : "janela",
    logbook: [...stale.logbookIds][0] || "",
  });
}

const localHours = local.reduce((s, d) => s + Number(d.block_time_minutes || 0) / 60, 0);
const droppedHours = adopted.reduce((s, row) => s + row.hoursDropped, 0)
  + purged.reduce((s, row) => s + row.hoursDropped, 0);
const afterHours = localHours - droppedHours;

const watched = ["1273", "1287", "1281", "1288", "1291", "1316", "1318", "1320", "1321", "1324", "1325"];
const watchStatus = watched.map((id) => ({
  id,
  inSaga: presentKeys.has(id),
  inLocal: local.some((d) => d.$id === `saga_flight_${id}` || d.saga_flight_id === id),
  keep: adopted.some((row) => row.toSagaId === id),
  delete: adopted.some((row) => row.fromSagaId === id) || purged.some((row) => row.fromSagaId === id),
}));

const sevenDayStart = "2026-08-13";
const adoptedInCron7d = adopted.filter((row) => row.date >= sevenDayStart);

console.log(JSON.stringify({
  dryRun: true,
  wroteNothing: true,
  sagaWindow: { start: START_DATE, end: END_DATE },
  sagaGroups: sagaGroups.length,
  sagaDzbGroups: incomingDzb.length,
  localDzbRealizado: local.length,
  localHours: round1(localHours),
  staleNotInSaga: staleDocs.length,
  wouldAdopt: adopted.length,
  wouldPurgeNoSuccessor: purged,
  hoursAfter: round1(afterHours),
  vsSaga89_3: round1(afterHours - 89.3),
  cron7dWouldCatch: adoptedInCron7d.map((row) => `${row.fromSagaId}->${row.toSagaId}`),
  adopted,
  watchStatus,
}, null, 2));
