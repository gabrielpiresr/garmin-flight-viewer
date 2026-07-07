const sdk = require("node-appwrite");
const crypto = require("node:crypto");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");
const databases = new sdk.Databases(client);
const functions = new sdk.Functions(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID;
const PROFILES_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const AIRCRAFTS_ID = process.env.APPWRITE_AIRCRAFTS_COLLECTION_ID;
const CREDITS_ID = process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID;
const ADJUSTMENTS_ID = process.env.APPWRITE_CREDIT_ADJUSTMENTS_COLLECTION_ID || "credit_adjustments";
const AUDIT_ID = process.env.APPWRITE_SCHEDULE_AUDIT_COLLECTION_ID || "schedule_audit_events";
const LOCKS_ID = process.env.APPWRITE_SCHEDULE_SLOT_LOCKS_COLLECTION_ID || "schedule_slot_locks";
const SETTINGS_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
const OP_WEEKS_ID = process.env.APPWRITE_OPERATIONAL_WEEKS_COLLECTION_ID || "aircraft_operational_weeks";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";
const ADMIN_USERS_FUNCTION_ID = process.env.APPWRITE_ADMIN_USERS_FUNCTION_ID || "";
const ACTIVE_STATUSES = ["Pendente", "Confirmado"];

function response(res, status, body) {
  return res.json(body, status);
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function clean(value) {
  return String(value || "").trim();
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback, min = 0, max = 3650) {
  return Math.min(max, Math.max(min, Math.round(number(value, fallback))));
}

function defaultScheduleRules() {
  return {
    mode: "intentions",
    sagaOnlySchedule: false,
    bufferBeforeMinutes: 30,
    bufferAfterMinutes: 15,
    slotMinutes: 30,
    scheduleStartTime: "06:00",
    weekdayMinHours: 1,
    weekdayMaxHours: 4,
    weekendMinHours: 1,
    weekendMaxHours: 4,
    weekdayMaxFlightsPerDay: null,
    weekendMaxFlightsPerDay: null,
    weeklyMaxFlightHours: null,
    weeklyMaxFlights: null,
    weekendMaxFlightHours: null,
    weekendMaxFlights: null,
    allowZeroCreditOneHour: false,
    requireCreditsForBooking: false,
    allowNightFlights: false,
    nightFlightStartHour: 18,
    nightBookingWeekdays: [],
    cancellationPenalty48hPct: 0,
    cancellationPenalty24hPct: 0,
    cancellationPenalty12hPct: 0,
    cancellationPenalty1hPct: 0,
    autoDebitCancellationPenalty: false,
    minBookingLeadDays: 0,
    maxBookingLeadDays: 365,
    studentHiddenAircraftIdents: [],
    studentWaitlistAircraftIdents: [],
  };
}

function normalizeRules(raw) {
  const defaults = defaultScheduleRules();
  const mode = ["booking", "view", "closed", "intentions"].includes(raw?.mode) ? raw.mode : defaults.mode;
  const slot = [15, 30, 45, 60].includes(Number(raw?.slotMinutes)) ? Number(raw.slotMinutes) : 30;
  // nightFlightStartHour stored as decimal hours (e.g. 18.5 = 18:30)
  const nightH = Number(raw?.nightFlightStartHour);
  const nightFlightStartHour = Number.isFinite(nightH) && nightH >= 0 && nightH < 24 ? nightH : defaults.nightFlightStartHour;
  return {
    ...defaults,
    ...raw,
    mode,
    sagaOnlySchedule: raw?.sagaOnlySchedule === true,
    slotMinutes: slot,
    nightFlightStartHour,
    bufferBeforeMinutes: integer(raw?.bufferBeforeMinutes, 30, 0, 360),
    bufferAfterMinutes: integer(raw?.bufferAfterMinutes, 15, 0, 360),
    scheduleStartTime: /^\d{2}:\d{2}$/.test(raw?.scheduleStartTime) ? raw.scheduleStartTime : defaults.scheduleStartTime,
    weekdayMinHours: Math.max(0.25, number(raw?.weekdayMinHours, raw?.minRequestHours || 1)),
    weekdayMaxHours: Math.max(0.25, number(raw?.weekdayMaxHours, raw?.maxRequestHours || 4)),
    weekendMinHours: Math.max(0.25, number(raw?.weekendMinHours, raw?.minRequestHours || 1)),
    weekendMaxHours: Math.max(0.25, number(raw?.weekendMaxHours, raw?.maxRequestHours || 4)),
    minBookingLeadDays: integer(raw?.minBookingLeadDays, 0),
    maxBookingLeadDays: integer(raw?.maxBookingLeadDays, 365),
    nightBookingWeekdays: Array.isArray(raw?.nightBookingWeekdays) ? raw.nightBookingWeekdays.map(Number) : [],
    weeklyMaxFlightHours: number(raw?.weeklyMaxFlightHours, 0) > 0 ? number(raw.weeklyMaxFlightHours, 0) : null,
    weeklyMaxFlights: number(raw?.weeklyMaxFlights, 0) > 0 ? Math.round(number(raw.weeklyMaxFlights, 0)) : null,
    weekendMaxFlightHours: number(raw?.weekendMaxFlightHours, 0) > 0 ? number(raw.weekendMaxFlightHours, 0) : null,
    weekendMaxFlights: number(raw?.weekendMaxFlights, 0) > 0 ? Math.round(number(raw.weekendMaxFlights, 0)) : null,
    allowZeroCreditOneHour: raw?.allowZeroCreditOneHour === true,
    studentHiddenAircraftIdents: Array.isArray(raw?.studentHiddenAircraftIdents)
      ? [...new Set(raw.studentHiddenAircraftIdents.map((value) => normalizeRegistration(value)).filter(Boolean))]
      : [],
    // Preserva o texto original (é o rótulo exibido); comparações usam normalizeRegistration.
    studentWaitlistAircraftIdents: Array.isArray(raw?.studentWaitlistAircraftIdents)
      ? [...new Set(raw.studentWaitlistAircraftIdents.map((value) => clean(value).toUpperCase()).filter(Boolean))]
      : [],
  };
}

async function getRules() {
  const result = await databases.listDocuments(DATABASE_ID, SETTINGS_ID, [
    sdk.Query.equal("key", ["schoolRules"]),
    sdk.Query.limit(1),
  ]);
  const body = parseJson(result.documents[0]?.settings_json, {});
  return normalizeRules(body.schedule || {});
}

/**
 * Modo simplificado de créditos: quando a escola configura
 * flightCreditSales.nightHoursDifferentFromDay = false, dia e noite compartilham o
 * mesmo saldo. O extrato do aluno (buildStudentCreditStatement em src/lib/creditsDb.ts)
 * respeita isso; a verificação do servidor precisa fazer o mesmo, senão o front mostra
 * saldo (ex.: 5h) e a API rejeita o agendamento por filtrar créditos por is_night/expiração.
 * Default false (dia ≠ noite) quando o config não existe — igual ao padrão do front.
 */
async function getCreditSalesSimplified() {
  try {
    const result = await databases.listDocuments(DATABASE_ID, SETTINGS_ID, [
      sdk.Query.equal("key", ["flightCreditSales"]),
      sdk.Query.limit(1),
    ]);
    const body = parseJson(result.documents[0]?.settings_json, {});
    return body.nightHoursDifferentFromDay === false;
  } catch {
    return false;
  }
}

async function getProfile(userId) {
  const result = await databases.listDocuments(DATABASE_ID, PROFILES_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  const profile = result.documents[0];
  if (!profile) fail("Perfil não encontrado.", 403);
  return profile;
}

function getEffectiveRole(profile) {
  const active = clean(profile?.active_role);
  const legacy = clean(profile?.role);
  const role = active || legacy;
  return role === "admin" || role === "instrutor" || role === "aluno" ? role : "aluno";
}

function dateTimeMs(date, time) {
  const parsed = Date.parse(`${date}T${time}:00-03:00`);
  if (!Number.isFinite(parsed)) fail("Data ou horário inválido.");
  return parsed;
}

function clock(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function parseClock(value) {
  const match = clean(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) fail("Horário inválido.");
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 0 || minutes >= 1440) fail("Horário inválido.");
  return minutes;
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weekStart(date) {
  const day = dayOfWeek(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function scheduleTimes(date, startTime, durationMinutes, rules) {
  const start = parseClock(startTime);
  const presentation = start - rules.bufferBeforeMinutes;
  const cutoff = start + durationMinutes;
  const end = cutoff + rules.bufferAfterMinutes;
  if (presentation < 0 || end >= 1440) fail("O intervalo completo deve permanecer no mesmo dia.");
  return {
    presentationTime: clock(presentation),
    startTime: clock(start),
    cutoffTime: clock(cutoff),
    endTime: clock(end),
    occupiedStartAt: new Date(dateTimeMs(date, clock(presentation))).toISOString(),
    occupiedEndAt: new Date(dateTimeMs(date, clock(end))).toISOString(),
  };
}

async function getAircraft(registration) {
  const result = await databases.listDocuments(DATABASE_ID, AIRCRAFTS_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("registration", [registration]),
    sdk.Query.equal("active", [true]),
    sdk.Query.limit(1),
  ]);
  const aircraft = result.documents[0];
  if (!aircraft) fail("Aeronave indisponível.");
  return aircraft;
}

async function listFlights(dateFrom, dateTo) {
  const result = await databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.greaterThanEqual("flight_date", dateFrom),
    sdk.Query.lessThanEqual("flight_date", dateTo),
    sdk.Query.orderAsc("flight_date"),
    sdk.Query.orderAsc("start_time"),
    sdk.Query.limit(5000),
  ]);
  return result.documents;
}

async function triggerSagaSync(flightId) {
  if (!ADMIN_USERS_FUNCTION_ID) return;
  try {
    await functions.createExecution(
      ADMIN_USERS_FUNCTION_ID,
      JSON.stringify({ action: "syncSagaScheduleEvent", flightId, mode: "upsert", allowCreate: true }),
      true, // async — don't block the booking response
    );
  } catch {
    // SAGA sync failure is non-fatal; the booking was already confirmed.
  }
}

function brDate(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso || "");
}

/** Aviso aos admins quando o ALUNO solicita/altera/cancela um voo (fire-and-forget). */
function notifyAdminsStudentAction(kind, data) {
  if (!ADMIN_USERS_FUNCTION_ID) return;
  functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "notifyStudentScheduleEvent", kind, data }),
    true, // async — a notificação nunca bloqueia nem derruba a ação do aluno
  ).catch(() => {});
}

/**
 * Lança no SAGA a multa de cancelamento como remoção de crédito (fire-and-forget).
 * A admin-users tem a sessão/CSRF do SAGA e faz o POST /credits?action=remove.
 * Best-effort: nunca bloqueia nem derruba o cancelamento (aluno ou admin).
 */
function registerSagaCancellationPenalty(data) {
  if (!ADMIN_USERS_FUNCTION_ID) return;
  functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "registerSagaCancellationPenalty", ...data }),
    true, // async
  ).catch(() => {});
}

/** Componentes BR (data DD/MM/AAAA e hora HH:MM em UTC-3) do instante do cancelamento. */
function brCancelStamp() {
  const iso = new Date(Date.now() - 3 * 3600000).toISOString();
  return { isoDate: iso.slice(0, 10), br: `${brDate(iso.slice(0, 10))}, ${iso.slice(11, 16)}` };
}

/**
 * Antecedência mínima/máxima em NÍVEL DE DATA — mesmo critério da trava do
 * formulário do aluno (que valida por data, não por horas corridas).
 */
function validateBookingLeadDates(date, presentationMs, rules) {
  if (presentationMs <= Date.now()) fail("O horário selecionado já passou.");
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const minDate = addDays(today, rules.minBookingLeadDays);
  if (date < minDate) {
    fail(`Antecedência mínima de ${rules.minBookingLeadDays} dia(s): escolha a partir de ${brDate(minDate)}.`);
  }
  const maxDate = addDays(today, rules.maxBookingLeadDays);
  if (date > maxDate) {
    fail(`Agendamento permitido até ${brDate(maxDate)} (${rules.maxBookingLeadDays} dias de antecedência).`);
  }
}

// ─── Modo "escala somente no SAGA" ────────────────────────────────────────────
// Quando rules.sagaOnlySchedule está ativo a escala não é persistida no sistema:
// os eventos são lidos/criados/removidos diretamente na agenda do SAGA via a
// function admin-users. As regras de agendamento continuam validadas aqui.

async function execAdminUsers(payload) {
  if (!ADMIN_USERS_FUNCTION_ID) fail("Função administrativa não configurada para o modo SAGA.", 500);
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const body = parseJson(execution.responseBody, {});
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || body.ok === false) {
    fail(body.message || "Falha na integração com a agenda SAGA.", 502);
  }
  return body;
}

async function listSagaEvents() {
  const body = await execAdminUsers({ action: "sagaListSchedulesDirect", monthCount: 3 });
  return Array.isArray(body.schedules) ? body.schedules : [];
}

function sagaLocalParts(value) {
  const raw = clean(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (match) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: match[4] ? `${match[4]}:${match[5]}` : "" };
  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (match) return { date: `${match[3]}-${match[2]}-${match[1]}`, time: match[4] ? `${match[4]}:${match[5]}` : "" };
  return { date: "", time: "" };
}

function sagaEventIsCancelled(event) {
  const status = clean(event?.status).toUpperCase();
  if (["CANCELED", "CANCELLED", "CANCELADO", "CANCELADA"].includes(status)) return true;
  return event?.active === false;
}

/** Status da agenda (SAGA, DB, legado) → rótulo usado nas cores dos cards. */
function normalizeScheduleFlightStatus(value) {
  const raw = clean(value);
  if (!raw) return "Confirmado";
  const upper = raw.toUpperCase();
  if (["CANCELED", "CANCELLED", "CANCELADO", "CANCELADA"].includes(upper)) return "Cancelado";
  if (upper === "PENDING" || upper === "PENDENTE") return "Pendente";
  if (upper === "PLANNED" || upper === "PREVISTO") return "Previsto";
  if (["CONFIRMED", "CONFIRMADO", "CONFIRMADA"].includes(upper)) return "Confirmado";
  if (["REALIZED", "REALIZADO", "COMPLETED", "CONCLUIDO", "CONCLUÍDO"].includes(upper)) return "Realizado";
  if (upper === "NÃO CONFIRMADO" || upper === "NAO CONFIRMADO") return "Não confirmado";
  if (["Pendente", "Previsto", "Confirmado", "Cancelado", "Realizado", "Não confirmado"].includes(raw)) return raw;
  return "Confirmado";
}

/** Status do evento SAGA traduzido para o vocabulário da escala. */
function sagaEventStatusLabel(event) {
  if (sagaEventIsCancelled(event)) return "Cancelado";
  return normalizeScheduleFlightStatus(event?.status);
}

/**
 * Datas/horários derivados de um evento SAGA, no vocabulário da escala local.
 * O horário do SAGA é o BLOCO completo (com briefing/debriefing): saga 10–12 com
 * buffers 30/15 → apresentação 10:00, acionamento 10:30, corte 11:45, encerramento
 * 12:00, tempo de voo 1h15.
 */
function sagaEventTimes(event, rules) {
  const start = sagaLocalParts(event.startAtRaw || event.startAt);
  const end = sagaLocalParts(event.endAtRaw || event.endAt);
  if (!start.date || !start.time) return null;
  const blockStartMinute = parseClock(start.time);
  let blockEndMinute = end.time ? parseClock(end.time) : blockStartMinute + 60;
  if (end.date && end.date > start.date) blockEndMinute += 1440;
  const startMinute = Math.min(blockEndMinute, blockStartMinute + rules.bufferBeforeMinutes); // acionamento
  const cutoffMinute = Math.max(startMinute, blockEndMinute - rules.bufferAfterMinutes); // corte
  const durationMinutes = Math.max(0, cutoffMinute - startMinute); // tempo de voo (acionamento→corte)
  return {
    flightDate: start.date,
    startMinute,
    durationMinutes,
    blockDurationMinutes: Math.max(0, blockEndMinute - blockStartMinute),
    presentationTime: clock(blockStartMinute),
    startTime: clock(Math.min(1439, startMinute)),
    cutoffTime: clock(Math.min(1439, cutoffMinute)),
    endTime: clock(Math.min(1439, blockEndMinute)),
    presentationMs: dateTimeMs(start.date, clock(blockStartMinute)),
    occupiedStartMs: dateTimeMs(start.date, clock(blockStartMinute)),
    occupiedEndMs: dateTimeMs(start.date, clock(Math.min(1439, blockEndMinute))),
  };
}

function normalizeRegistration(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Aeronaves ocultas para o aluno (studentHiddenAircraftIdents). Só se aplica ao aluno —
 * admin/instrutor sempre veem tudo. Voos e a própria aeronave somem da escala do aluno.
 */
function aircraftHiddenForRole(rules, registration, actorRole) {
  if (actorRole !== "aluno") return false;
  const hidden = Array.isArray(rules.studentHiddenAircraftIdents) ? rules.studentHiddenAircraftIdents : [];
  if (hidden.length === 0) return false;
  return hidden.includes(normalizeRegistration(registration));
}

// ─── Lista de espera ──────────────────────────────────────────────────────────
// Agendas SAGA marcadas como lista de espera funcionam como um "avião virtual":
// conflitos de horário valem nela (1 evento por intervalo), mas o aluno só pode
// usá-la quando NENHUM avião real disponível consegue atender o bloco do voo.

function waitlistIdents(rules) {
  return Array.isArray(rules.studentWaitlistAircraftIdents) ? rules.studentWaitlistAircraftIdents : [];
}

function isWaitlistIdent(rules, registration) {
  const target = normalizeRegistration(registration);
  if (!target) return false;
  return waitlistIdents(rules).some((ident) => normalizeRegistration(ident) === target);
}

async function listActiveAircrafts() {
  const result = await databases.listDocuments(DATABASE_ID, AIRCRAFTS_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("active", [true]),
    sdk.Query.limit(500),
  ]);
  return result.documents;
}

/** Modelo usado para validar créditos na lista de espera (ela não é uma aeronave local). */
async function waitlistFallbackModelId(rules) {
  const aircrafts = await listActiveAircrafts().catch(() => []);
  const candidate = aircrafts.find((doc) => doc.model_id && !isWaitlistIdent(rules, doc.registration));
  return candidate?.model_id || null;
}

/** true quando a aeronave tem algum evento SAGA ativo sobrepondo o intervalo. */
function sagaAircraftHasConflict(events, rules, registration, occupiedStartAt, occupiedEndAt, ignoreEventId = "") {
  const requestedStart = Date.parse(occupiedStartAt);
  const requestedEnd = Date.parse(occupiedEndAt);
  const reg = normalizeRegistration(registration);
  return events.some((event) => {
    if (clean(event.id) === clean(ignoreEventId)) return false;
    if (sagaEventIsCancelled(event)) return false;
    if (normalizeRegistration(event.aircraft) !== reg) return false;
    const times = sagaEventTimes(event, rules);
    if (!times) return false;
    return times.occupiedStartMs < requestedEnd && times.occupiedEndMs > requestedStart;
  });
}

async function slotBlockedForAircraft(aircraftId, date, startMinute, endMinute) {
  try {
    await validateBlockedSlot(aircraftId, date, startMinute, endMinute);
    return false;
  } catch {
    return true;
  }
}

/**
 * Barreira da lista de espera (somente aluno): se QUALQUER avião real que o aluno pode
 * agendar estiver livre (sem conflito e sem bloqueio) no bloco completo do voo, a
 * solicitação na lista de espera é recusada — ele deve agendar no avião livre.
 */
async function validateWaitlistNoAircraftFree(events, rules, actorRole, date, blockStartMinute, blockEndMinute, occupiedStartAt, occupiedEndAt, ignoreEventId = "") {
  if (actorRole !== "aluno") return;
  const aircrafts = await listActiveAircrafts().catch(() => []);
  for (const doc of aircrafts) {
    const registration = clean(doc.registration).toUpperCase();
    if (!registration || isWaitlistIdent(rules, registration)) continue;
    if (aircraftHiddenForRole(rules, registration, actorRole)) continue;
    if (sagaAircraftHasConflict(events, rules, registration, occupiedStartAt, occupiedEndAt, ignoreEventId)) continue;
    if (await slotBlockedForAircraft(doc.$id, date, blockStartMinute, blockEndMinute)) continue;
    fail(
      `O avião ${registration} está livre neste horário. A lista de espera só pode ser usada quando todos os aviões estiverem ocupados — agende diretamente no avião disponível.`,
      409,
    );
  }
}

/** ID SAGA numérico de um usuário local: perfil.saga_user_id ("70" ou "saga_70") ou user_id no padrão "saga_70". */
function sagaUserIdOf(profile, userId) {
  const fromProfile = normalizeSagaUserId(profile?.saga_user_id);
  if (fromProfile) return fromProfile;
  return clean(userId).match(/^saga_(\d+)$/i)?.[1] || "";
}

function normalizeSagaUserId(value) {
  const raw = clean(value);
  const match = raw.match(/^saga[_-]?(\d+)$/i);
  const numeric = match ? match[1] : raw;
  if (/^\d+$/.test(numeric)) return String(Number(numeric));
  return numeric;
}

function sameSagaUserId(left, right) {
  const a = normalizeSagaUserId(left);
  const b = normalizeSagaUserId(right);
  return Boolean(a) && a === b;
}

function sagaEventBelongsTo(event, actorId, actorSagaId) {
  const studentUserId = clean(event.studentUserId);
  if (studentUserId && studentUserId === actorId) return true;
  if (!clean(event.studentSagaId)) return false;
  if (actorSagaId && sameSagaUserId(event.studentSagaId, actorSagaId)) return true;
  return actorId === `saga_${normalizeSagaUserId(event.studentSagaId)}`;
}

function publicSagaFlight(event, rules, actorId, actorRole, actorSagaId) {
  const times = sagaEventTimes(event, rules);
  if (!times) return null;
  const cancelled = sagaEventIsCancelled(event);
  // "Meu voo": aluno do evento — ou, para instrutores, eventos em que ele é o instrutor.
  const ownAsInstructor = actorRole === "instrutor" && (
    (clean(event.instructorUserId) && clean(event.instructorUserId) === actorId) ||
    (Boolean(actorSagaId) && clean(event.instructorSagaId) === clean(actorSagaId))
  );
  const own = sagaEventBelongsTo(event, actorId, actorSagaId) || ownAsInstructor;
  const privileged = actorRole === "admin" || actorRole === "instrutor";
  const status = sagaEventStatusLabel(event);
  return {
    id: clean(event.id),
    aircraftIdent: clean(event.aircraft).toUpperCase(),
    aircraftModelId: null,
    flightDate: times.flightDate,
    // Bloco do SAGA = apresentação→encerramento; acionamento/corte derivados pelos buffers.
    presentationTime: times.presentationTime,
    startTime: times.startTime,
    cutoffTime: times.cutoffTime,
    endTime: times.endTime,
    durationMinutes: times.durationMinutes,
    status,
    isOwn: own,
    studentUserId: privileged || own ? clean(event.studentUserId) || (own ? actorId : null) : null,
    instructorUserId: privileged || own ? clean(event.instructorUserId) || null : null,
    studentName: privileged || own ? clean(event.studentName) : null,
    instructorName: privileged || own ? clean(event.instructorName) : null,
    notes: privileged || own ? clean(event.notes) || null : null,
    // Voo já apresentado não pode mais ser cancelado/alterado pelo aluno — sem o
    // check a UI mostrava os botões e o servidor rejeitava depois.
    canCancel: own && !cancelled && times.presentationMs > Date.now(),
  };
}

function requireStudentSagaId(profile) {
  const sagaId = sagaUserIdOf(profile, profile?.user_id);
  if (!sagaId) fail("O aluno não possui ID do SAGA cadastrado no perfil. Fale com a secretaria.", 422);
  return sagaId;
}

/** Conflito de aeronave contra os eventos ativos da agenda SAGA. */
function validateSagaConflict(events, rules, registration, occupiedStartAt, occupiedEndAt, ignoreEventId = "") {
  if (sagaAircraftHasConflict(events, rules, registration, occupiedStartAt, occupiedEndAt, ignoreEventId)) {
    fail("A aeronave já possui um voo neste intervalo na agenda SAGA.", 409);
  }
}

/** O aluno não pode ter outro voo ativo (em qualquer aeronave) no mesmo intervalo. */
function validateSagaStudentOverlap(events, rules, studentSagaId, occupiedStartAt, occupiedEndAt, ignoreEventId = "") {
  if (!studentSagaId) return;
  const requestedStart = Date.parse(occupiedStartAt);
  const requestedEnd = Date.parse(occupiedEndAt);
  const conflict = events.some((event) => {
    if (clean(event.id) === clean(ignoreEventId)) return false;
    if (sagaEventIsCancelled(event)) return false;
    if (!sameSagaUserId(event.studentSagaId, studentSagaId)) return false;
    const times = sagaEventTimes(event, rules);
    if (!times) return false;
    return times.occupiedStartMs < requestedEnd && times.occupiedEndMs > requestedStart;
  });
  if (conflict) fail("O aluno já possui outro voo agendado neste intervalo.", 409);
}

/** Horas de voo futuras já reservadas no SAGA pelo aluno para um modelo (acionamento→corte). */
async function sagaReservedHoursForModel(events, studentSagaId, modelId, rules, ignoreEventId = "") {
  if (!modelId || !studentSagaId) return { weekdayHours: 0, weekendHours: 0 };
  const aircrafts = await databases.listDocuments(DATABASE_ID, AIRCRAFTS_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.limit(500),
  ]).catch(() => ({ documents: [] }));
  const modelByReg = {};
  for (const doc of aircrafts.documents) modelByReg[normalizeRegistration(doc.registration)] = doc.model_id;
  const now = Date.now();
  let weekdayMinutes = 0;
  let weekendMinutes = 0;
  for (const event of events) {
    if (clean(event.id) === clean(ignoreEventId)) continue;
    if (sagaEventIsCancelled(event)) continue;
    if (!sameSagaUserId(event.studentSagaId, studentSagaId)) continue;
    if (modelByReg[normalizeRegistration(event.aircraft)] !== modelId) continue;
    const times = sagaEventTimes(event, rules);
    if (!times || dateTimeMs(times.flightDate, times.startTime) <= now) continue;
    const day = dayOfWeek(times.flightDate);
    if (day === 0 || day === 6) weekendMinutes += times.durationMinutes;
    else weekdayMinutes += times.durationMinutes;
  }
  return { weekdayHours: weekdayMinutes / 60, weekendHours: weekendMinutes / 60 };
}

async function findSagaEventOrFail(events, eventId) {
  const event = events.find((row) => clean(row.id) === clean(eventId));
  if (!event) fail("Evento não encontrado na agenda SAGA.", 404);
  return event;
}

async function resolveLocalUserIdBySagaId(sagaUserId) {
  const target = clean(sagaUserId);
  if (!target) return null;
  // Consulta indexada quando disponível; caso contrário varre os perfis em páginas.
  const indexed = await databases.listDocuments(DATABASE_ID, PROFILES_ID, [
    sdk.Query.equal("saga_user_id", [target]),
    sdk.Query.limit(1),
  ]).catch(() => null);
  if (indexed) return indexed.documents[0]?.user_id || null;
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const queries = [sdk.Query.limit(500)];
    if (cursor) queries.push(sdk.Query.cursorAfter(cursor));
    const result = await databases.listDocuments(DATABASE_ID, PROFILES_ID, queries).catch(() => null);
    if (!result || result.documents.length === 0) return null;
    const match = result.documents.find((doc) => clean(doc.saga_user_id) === target);
    if (match) return match.user_id || null;
    if (result.documents.length < 500) return null;
    cursor = result.documents[result.documents.length - 1].$id;
  }
  return null;
}

async function validateBlockedSlot(aircraftId, date, startMinute, endMinute) {
  try {
    const result = await databases.listDocuments(DATABASE_ID, OP_WEEKS_ID, [
      sdk.Query.equal("aircraft_id", [aircraftId]),
      sdk.Query.equal("week_start", [weekStart(date)]),
      sdk.Query.limit(1),
    ]);
    const states = parseJson(result.documents[0]?.slots_json, {});
    const day = dayOfWeek(date);
    for (let minute = Math.floor(startMinute / 60) * 60; minute < endMinute; minute += 60) {
      if (states[`${day}-${Math.floor(minute / 60)}`] === "blocked") fail("O horário está bloqueado na disponibilidade da aeronave.");
    }
  } catch (error) {
    if (error?.status) throw error;
    // Operational availability is optional for legacy schools.
  }
}

function occupiedRange(doc) {
  const start = doc.occupied_start_at
    ? Date.parse(doc.occupied_start_at)
    : dateTimeMs(doc.flight_date, doc.presentation_time || doc.start_time);
  const fallbackDuration = number(doc.requested_duration_minutes, 0);
  const end = doc.occupied_end_at
    ? Date.parse(doc.occupied_end_at)
    : dateTimeMs(doc.flight_date, doc.schedule_end_time || doc.cutoff_time || clock(parseClock(doc.start_time) + fallbackDuration));
  return { start, end };
}

async function validateFlightConflict(registration, date, occupiedStartAt, occupiedEndAt) {
  const result = await databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("aircraft_ident", [registration]),
    sdk.Query.equal("flight_date", [date]),
    sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Previsto"]),
    sdk.Query.limit(500),
  ]);
  const requestedStart = Date.parse(occupiedStartAt);
  const requestedEnd = Date.parse(occupiedEndAt);
  const conflict = result.documents.some((doc) => {
    const occupied = occupiedRange(doc);
    return occupied.start < requestedEnd && occupied.end > requestedStart;
  });
  if (conflict) fail("A aeronave já possui um voo neste intervalo.", 409);
}

/** O aluno não pode ter outro voo ativo (em qualquer aeronave) no mesmo intervalo. */
async function validateStudentFlightOverlap(studentId, date, occupiedStartAt, occupiedEndAt) {
  const result = await databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
    sdk.Query.equal("student_user_id", [studentId]),
    sdk.Query.equal("flight_date", [date]),
    sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Previsto"]),
    sdk.Query.limit(100),
  ]);
  const requestedStart = Date.parse(occupiedStartAt);
  const requestedEnd = Date.parse(occupiedEndAt);
  const conflict = result.documents.some((doc) => {
    const occupied = occupiedRange(doc);
    return occupied.start < requestedEnd && occupied.end > requestedStart;
  });
  if (conflict) fail("O aluno já possui outro voo agendado neste intervalo.", 409);
}

function adjustmentHours(doc) {
  return Math.abs(number(doc.hours, 0));
}

function isWeekendDate(date) {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

function flightCreditHours(doc) {
  if (doc.flight_status === "Realizado") {
    return number(doc.block_time_minutes || doc.total_flight_minutes, 0) / 60;
  }
  return number(doc.requested_duration_minutes, 0) / 60;
}

function creditPurchaseDate(doc) {
  const raw = clean(doc.purchase_date);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** Última compra primeiro; se esgotar, passa para a compra imediatamente anterior. */
function creditLifoSort(a, b) {
  return b.purchaseDate.localeCompare(a.purchaseDate) || a.expiresAt.localeCompare(b.expiresAt);
}

function creditEligibleForFlight(credit, flight, isNight, simplified = false) {
  if (credit.remainingHours <= 0.0001) return false;
  // No modo simplificado dia/noite e validade não segregam créditos (espelha o front).
  if (simplified) return true;
  if (credit.isNight !== isNight) return false;
  if (credit.expiresAt < flight.flightDate) return false;
  return true;
}

function adjustmentPenaltyHours(doc) {
  return Math.abs(Math.min(0, number(doc.hours, 0)));
}

function applyPenaltyToPools(pools, penaltyHours, flightDate) {
  if (penaltyHours <= 0.0001) return pools;
  if (!flightDate || isWeekendDate(flightDate)) {
    let anyDay = pools.anyDay - penaltyHours;
    if (anyDay < -0.0001 && pools.weekdayOnly > 0.0001) {
      const spill = Math.min(pools.weekdayOnly, Math.abs(anyDay));
      return {
        weekdayOnly: Number((pools.weekdayOnly - spill).toFixed(2)),
        anyDay: Number((anyDay + spill).toFixed(2)),
      };
    }
    return { weekdayOnly: pools.weekdayOnly, anyDay: Number(anyDay.toFixed(2)) };
  }
  const fromWeekday = Math.min(pools.weekdayOnly, penaltyHours);
  const remainder = penaltyHours - fromWeekday;
  let anyDay = pools.anyDay - remainder;
  const weekdayLeft = pools.weekdayOnly - fromWeekday;
  if (anyDay < -0.0001 && weekdayLeft > 0.0001) {
    const spill = Math.min(weekdayLeft, Math.abs(anyDay));
    return {
      weekdayOnly: Number((weekdayLeft - spill).toFixed(2)),
      anyDay: Number((anyDay + spill).toFixed(2)),
    };
  }
  return {
    weekdayOnly: Number((pools.weekdayOnly - fromWeekday).toFixed(2)),
    anyDay: Number(anyDay.toFixed(2)),
  };
}

/** Replay cronológico + LIFO — espelha replayCreditLedger em src/lib/creditsDb.ts */
function computeCreditPools(creditDocs, flightDocs, adjustmentDocs, isNight, simplified = false) {
  const mutable = creditDocs.map((doc) => ({
    id: clean(doc.$id),
    purchaseDate: creditPurchaseDate(doc),
    expiresAt: clean(doc.expires_at),
    isNight: Boolean(doc.is_night),
    weekdayOnly: Boolean(doc.weekday_only),
    totalHours: number(doc.hours, 0),
    remainingHours: 0,
  }));
  const creditsById = new Map(mutable.map((credit) => [credit.id, credit]));

  const flights = flightDocs
    .map((doc) => ({
      flightDate: clean(doc.flight_date),
      hours: flightCreditHours(doc),
      isNight: Boolean(doc.is_night),
    }))
    .filter((flight) => flight.flightDate);

  const events = [
    ...mutable
      .filter((credit) => credit.purchaseDate)
      .map((credit) => ({ kind: "purchase", date: credit.purchaseDate, creditId: credit.id })),
    ...flights.map((flight) => ({ kind: "flight", date: flight.flightDate, flight })),
  ].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind === "purchase" && b.kind === "flight") return -1;
    if (a.kind === "flight" && b.kind === "purchase") return 1;
    return 0;
  });

  let debtHours = 0;
  for (const event of events) {
    if (event.kind === "purchase") {
      const credit = creditsById.get(event.creditId);
      if (!credit) continue;
      let incoming = credit.totalHours;
      if (debtHours > 0.0001) {
        const cover = Math.min(debtHours, incoming);
        debtHours = Number((debtHours - cover).toFixed(2));
        incoming = Number((incoming - cover).toFixed(2));
      }
      credit.remainingHours = incoming;
      continue;
    }
    const flight = event.flight;
    // Simplificado: todos os voos consomem o pool único; segregado: só os do mesmo turno.
    if (!simplified && flight.isNight !== isNight) continue;
    const eligible = mutable
      .filter((credit) => creditEligibleForFlight(credit, flight, isNight, simplified))
      .sort(creditLifoSort);
    let remainingDebit = flight.hours;
    for (const credit of eligible) {
      if (remainingDebit <= 0.0001) break;
      const used = Math.min(credit.remainingHours, remainingDebit);
      credit.remainingHours = Number((credit.remainingHours - used).toFixed(2));
      remainingDebit = Number((remainingDebit - used).toFixed(2));
    }
    if (remainingDebit > 0.0001) {
      debtHours = Number((debtHours + remainingDebit).toFixed(2));
    }
  }

  let pools = { weekdayOnly: 0, anyDay: 0 };
  for (const credit of mutable) {
    if (credit.remainingHours <= 0.0001) continue;
    if (credit.weekdayOnly) pools.weekdayOnly += credit.remainingHours;
    else pools.anyDay += credit.remainingHours;
  }
  pools = {
    weekdayOnly: Number(pools.weekdayOnly.toFixed(2)),
    anyDay: Number(pools.anyDay.toFixed(2)),
  };

  for (const doc of adjustmentDocs) {
    if (!simplified && Boolean(doc.is_night) !== isNight) continue;
    const penalty = adjustmentPenaltyHours(doc);
    if (penalty <= 0.0001) continue;
    pools = applyPenaltyToPools(pools, penalty, clean(doc.flight_date) || null);
  }

  return {
    availWk: Math.max(0, pools.weekdayOnly),
    rawAny: pools.anyDay,
  };
}

/**
 * Saldo livre para agendar na data — espelha buildStudentCreditStatement em src/lib/creditsDb.ts.
 * Reserva SAGA de semana consome availWk primeiro; excedente vaza pro pool livre; fds consome só o livre.
 */
function freeBalanceForDate(pools, reserved, flightDate) {
  const availWk = number(pools.availWk, 0);
  const rawAny = number(pools.rawAny, 0);
  let remainingAny = rawAny;
  remainingAny -= number(reserved.weekendHours, 0);
  const weekdayReserve = number(reserved.weekdayHours, 0);
  const wkOverflow = Math.max(0, weekdayReserve - availWk);
  const remainingWk = Math.max(0, availWk - weekdayReserve);
  remainingAny -= wkOverflow;
  if (isWeekendDate(flightDate)) return remainingAny;
  return remainingWk + remainingAny;
}

function creditInsufficientMessage(freeBalance, flightHours, flightDate, availWk, sagaReserved) {
  if (freeBalance + 0.0001 >= flightHours) return null;
  if (isWeekendDate(flightDate)) {
    const restrictedLeft = Math.max(0, availWk - number(sagaReserved?.weekdayHours, 0));
    if (restrictedLeft > 0.001) {
      return `Crédito insuficiente para fim de semana. Você possui ${restrictedLeft.toFixed(2)}h válidas apenas de segunda a sexta…`;
    }
  }
  return `Crédito insuficiente. Disponível: ${Math.max(0, freeBalance).toFixed(2)}h.`;
}

async function creditAvailable(studentId, modelId, isNight, flightHours, flightDate, sagaReserved = { weekdayHours: 0, weekendHours: 0 }, simplified = false) {
  // Bug 5 guard: if aircraft has no model configured, credits can't be verified
  if (!modelId) {
    return {
      availableHours: 0,
      sufficient: false,
      rawAvailableHours: 0,
      weekdayOnlyAvailableHours: 0,
      anyDayAvailableHours: 0,
      grossWeekdayPoolHours: 0,
      grossAnyDayPoolHours: 0,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  // No modo simplificado o extrato do aluno inclui créditos vencidos; a query só filtra
  // por validade quando dia/noite são segregados (senão o servidor divergiria do front).
  const creditQueries = [sdk.Query.equal("user_id", [studentId]), sdk.Query.limit(500)];
  if (!simplified) creditQueries.push(sdk.Query.greaterThanEqual("expires_at", today));
  const [credits, adjustments, flights] = await Promise.all([
    databases.listDocuments(DATABASE_ID, CREDITS_ID, creditQueries),
    databases.listDocuments(DATABASE_ID, ADJUSTMENTS_ID, [
      sdk.Query.equal("student_user_id", [studentId]),
      sdk.Query.limit(500),
    ]).catch(() => ({ documents: [] })),
    databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
      sdk.Query.equal("student_user_id", [studentId]),
      sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Previsto", "Realizado"]),
      sdk.Query.limit(5000),
    ]),
  ]);

  // Simplificado: pool único (todos os créditos); segregado: só os do mesmo turno.
  const scopedCredits = simplified
    ? credits.documents
    : credits.documents.filter((doc) => Boolean(doc.is_night) === isNight);
  const pools = computeCreditPools(scopedCredits, flights.documents, adjustments.documents, isNight, simplified);
  const { availWk, rawAny } = pools;
  const freeBalance = freeBalanceForDate(pools, sagaReserved, flightDate);
  const weekdayReserve = number(sagaReserved.weekdayHours, 0);
  const weekendReserve = number(sagaReserved.weekendHours, 0);
  const weekdayOnlyAvailableHours = Math.max(0, availWk - weekdayReserve);
  const wkOverflowReserve = Math.max(0, weekdayReserve - availWk);
  const anyDayAvailableHours = rawAny - weekendReserve - wkOverflowReserve;

  return {
    availableHours: Math.max(0, freeBalance),
    rawAvailableHours: freeBalance,
    weekdayOnlyAvailableHours,
    anyDayAvailableHours,
    grossWeekdayPoolHours: availWk,
    grossAnyDayPoolHours: rawAny,
    sufficient: freeBalance + 0.0001 >= flightHours,
    insufficientMessage: creditInsufficientMessage(freeBalance, flightHours, flightDate, availWk, sagaReserved),
  };
}

/** Saldo livre para agendar = créditos disponíveis menos horas futuras já reservadas. */
function schedulingFreeBalance(rawAvailableHours, reservedHours = 0) {
  return rawAvailableHours - reservedHours;
}

/**
 * Exceção "1h com crédito zerado": quando ativa, aluno sem saldo livre negativo pode
 * marcar um voo de até 1h (ele é avisado que precisa repor antes do voo).
 */
function zeroCreditExceptionApplies(rules, freeBalanceHours, durationMinutes, credit = null) {
  if (rules.allowZeroCreditOneHour !== true || durationMinutes > 60 || freeBalanceHours < -0.001) return false;
  if (credit) {
    const weekday = number(credit.grossWeekdayPoolHours, 0);
    const anyDay = number(credit.grossAnyDayPoolHours, 0);
    if (weekday > 0.0001 || anyDay > 0.0001) return false;
  }
  return true;
}

/** Uso semanal do aluno na agenda SAGA (somente voos ativos; horas = acionamento→corte). */
function sagaStudentWeekUsage(events, rules, studentSagaId, date, ignoreEventId = "") {
  const wkStart = weekStart(date);
  const wkEnd = addDays(wkStart, 6);
  const usage = { flights: 0, hours: 0, weekendFlights: 0, weekendHours: 0 };
  for (const event of events) {
    if (clean(event.id) === clean(ignoreEventId)) continue;
    if (sagaEventIsCancelled(event)) continue;
    if (!sameSagaUserId(event.studentSagaId, studentSagaId)) continue;
    const times = sagaEventTimes(event, rules);
    if (!times || times.flightDate < wkStart || times.flightDate > wkEnd) continue;
    usage.flights += 1;
    usage.hours += times.durationMinutes / 60;
    const day = dayOfWeek(times.flightDate);
    if (day === 0 || day === 6) {
      usage.weekendFlights += 1;
      usage.weekendHours += times.durationMinutes / 60;
    }
  }
  return usage;
}

/** Limites semanais do aluno (horas de voo e quantidade). Admin/instrutor não têm travas. */
function validateWeeklyLimits(rules, usage, durationMinutes, isWeekendFlight) {
  const newHours = durationMinutes / 60;
  if (rules.weeklyMaxFlights && usage.flights + 1 > rules.weeklyMaxFlights) {
    fail(`Limite de ${rules.weeklyMaxFlights} voo(s) por semana atingido.`);
  }
  if (rules.weeklyMaxFlightHours && usage.hours + newHours > rules.weeklyMaxFlightHours + 0.0001) {
    fail(`Limite de ${rules.weeklyMaxFlightHours}h de voo por semana atingido.`);
  }
  if (isWeekendFlight) {
    if (rules.weekendMaxFlights && usage.weekendFlights + 1 > rules.weekendMaxFlights) {
      fail(`Limite de ${rules.weekendMaxFlights} voo(s) no fim de semana atingido.`);
    }
    if (rules.weekendMaxFlightHours && usage.weekendHours + newHours > rules.weekendMaxFlightHours + 0.0001) {
      fail(`Limite de ${rules.weekendMaxFlightHours}h de voo no fim de semana atingido.`);
    }
  }
}

function lockId(registration, date, minute) {
  return crypto.createHash("sha256").update(`${SCHOOL_ID}|${registration}|${date}|${minute}`).digest("hex").slice(0, 36);
}

async function acquireLocks(registration, date, start, end, slotMinutes, flightId, userId) {
  const created = [];
  for (let minute = Math.floor(start / slotMinutes) * slotMinutes; minute < end; minute += slotMinutes) {
    const id = lockId(registration, date, minute);
    const data = { school_id: SCHOOL_ID, aircraft_ident: registration, flight_date: date, slot_minute: minute, flight_id: flightId, student_user_id: userId };
    try {
      await databases.createDocument(DATABASE_ID, LOCKS_ID, id, data);
      created.push(id);
    } catch (lockErr) {
      if (lockErr?.code !== 409) {
        // Unexpected error — release already-created locks and re-throw
        await Promise.all(created.map((cid) => databases.deleteDocument(DATABASE_ID, LOCKS_ID, cid).catch(() => null)));
        fail("Erro ao reservar horário. Tente novamente.", 500);
      }
      // 409 conflict: check if the existing lock is stale (its flight is no longer active)
      let isStale = false;
      try {
        const existingLock = await databases.getDocument(DATABASE_ID, LOCKS_ID, id);
        if (existingLock?.flight_id) {
          const linkedFlight = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, existingLock.flight_id).catch(() => null);
          const st = linkedFlight?.flight_status === "Previsto" ? "Confirmado" : linkedFlight?.flight_status;
          if (!linkedFlight || !ACTIVE_STATUSES.includes(st)) isStale = true;
        } else {
          isStale = true; // orphaned lock with no flight_id
        }
      } catch { /* couldn't verify — assume active */ }

      if (isStale) {
        // Delete the stale lock and create fresh
        await databases.deleteDocument(DATABASE_ID, LOCKS_ID, id).catch(() => null);
        try {
          await databases.createDocument(DATABASE_ID, LOCKS_ID, id, data);
          created.push(id);
        } catch {
          await Promise.all(created.map((cid) => databases.deleteDocument(DATABASE_ID, LOCKS_ID, cid).catch(() => null)));
          fail("Este horário acabou de ser reservado. Atualize a agenda e escolha outro horário.", 409);
        }
      } else {
        await Promise.all(created.map((cid) => databases.deleteDocument(DATABASE_ID, LOCKS_ID, cid).catch(() => null)));
        fail("Este horário já está reservado por outro voo ativo.", 409);
      }
    }
  }
}

async function releaseLocks(flightId) {
  const result = await databases.listDocuments(DATABASE_ID, LOCKS_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    sdk.Query.limit(500),
  ]);
  await Promise.all(result.documents.map((doc) => databases.deleteDocument(DATABASE_ID, LOCKS_ID, doc.$id).catch(() => null)));
}

function flightPermissions(studentId, instructorId) {
  const permissions = [
    sdk.Permission.read(sdk.Role.user(studentId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
    sdk.Permission.update(sdk.Role.label("instrutor")),
  ];
  if (instructorId) permissions.push(sdk.Permission.read(sdk.Role.user(instructorId)), sdk.Permission.update(sdk.Role.user(instructorId)));
  return permissions;
}

function buildRecord({ studentId, studentLabel, registration, date, times, durationMinutes, isNight }) {
  const meta = {
    header: {
      studentUserId: studentId,
      studentLabel,
      date,
      startTime: times.startTime,
      departureTimeUtc: times.startTime,
      engineCutoffTimeUtc: times.cutoffTime,
      aircraft: registration,
      isNight,
    },
    schedule: { version: "AUTO_SCHEDULE_V1", weekStart: weekStart(date), demandId: `booking-${studentId}-${Date.now()}` },
    preFlight: { objectiveMd: "", briefingMd: "" },
    legs: [{
      id: "leg-1", date, role: "student", dep: "", arr: "", landings: 0,
      flightTime: `${String(Math.floor(durationMinutes / 60)).padStart(2, "0")}:${String(durationMinutes % 60).padStart(2, "0")}`,
      navTime: "00:00", ifrTime: "00:00", nightTime: isNight ? `${Math.floor(durationMinutes / 60)}:${String(durationMinutes % 60).padStart(2, "0")}` : "00:00",
      serviceTime: "00:00", engineStart: times.startTime, engineCut: times.cutoffTime, distance: "",
    }],
    risk: { commentsMd: "", dangerMd: "", riskMd: "", managementMd: "", instructorOpinionMd: "" },
  };
  return `#GFV_META_V1:${Buffer.from(JSON.stringify(meta), "utf8").toString("base64")}\n`;
}

function publicFlight(doc, actorId, actorRole) {
  const own = doc.student_user_id === actorId;
  const privileged = actorRole === "admin" || actorRole === "instrutor";
  const durationMinutes = number(
    doc.requested_duration_minutes
      || doc.total_flight_minutes
      || doc.block_time_minutes
      || number(doc.duration_sec, 0) / 60,
    0,
  );
  const derivedCutoff = doc.start_time && durationMinutes > 0
    ? clock(parseClock(doc.start_time) + durationMinutes)
    : null;
  const status = normalizeScheduleFlightStatus(doc.flight_status);
  const cancelStatus = status === "Previsto" ? "Confirmado" : status;
  let presentationMs = 0;
  try {
    presentationMs = dateTimeMs(doc.flight_date, doc.presentation_time || doc.start_time);
  } catch {
    presentationMs = 0;
  }
  return {
    id: doc.$id,
    aircraftIdent: doc.aircraft_ident || "",
    aircraftModelId: privileged || own ? doc.aircraft_model_id || null : null,
    flightDate: doc.flight_date,
    presentationTime: doc.presentation_time || doc.start_time,
    startTime: doc.start_time,
    cutoffTime: doc.cutoff_time || derivedCutoff,
    endTime: doc.schedule_end_time || doc.cutoff_time || derivedCutoff,
    durationMinutes,
    status,
    isOwn: own,
    studentUserId: privileged ? doc.student_user_id : own ? actorId : null,
    instructorUserId: privileged || own ? doc.instructor_user_id || null : null,
    // Voo já apresentado não pode mais ser cancelado pelo aluno.
    canCancel: own && ACTIVE_STATUSES.includes(cancelStatus) && presentationMs > Date.now(),
  };
}

function penaltyFor(hoursBefore, rules) {
  if (hoursBefore < 1) return number(rules.cancellationPenalty1hPct, 0);
  if (hoursBefore < 12) return number(rules.cancellationPenalty12hPct, 0);
  if (hoursBefore < 24) return number(rules.cancellationPenalty24hPct, 0);
  if (hoursBefore < 48) return number(rules.cancellationPenalty48hPct, 0);
  return 0;
}

async function handleCalendar(payload, actorId, actorRole, rules, profile) {
  if (rules.mode === "closed" && actorRole === "aluno") return { mode: rules.mode, rules, aircrafts: [], flights: [] };
  const from = clean(payload.dateFrom);
  const to = clean(payload.dateTo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail("Período inválido.");
  const wkStart = weekStart(from);
  const [flights, aircrafts, opWeeks] = await Promise.all([
    rules.sagaOnlySchedule ? listSagaEvents() : listFlights(from, to),
    databases.listDocuments(DATABASE_ID, AIRCRAFTS_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("active", [true]),
      sdk.Query.limit(500),
    ]),
    databases.listDocuments(DATABASE_ID, OP_WEEKS_ID, [
      sdk.Query.equal("week_start", [wkStart]),
      sdk.Query.limit(500),
    ]).catch(() => ({ documents: [] })),
  ]);
  const aircraftRegByDocId = {};
  for (const doc of aircrafts.documents) aircraftRegByDocId[doc.$id] = doc.registration;

  // Build blocked slots per aircraft per dayOfWeek per hour
  const blockedSlots = [];
  for (const weekDoc of opWeeks.documents) {
    const registration = aircraftRegByDocId[weekDoc.aircraft_id];
    if (!registration) continue;
    const states = parseJson(weekDoc.slots_json, {});
    const hoursByDay = {};
    for (const [key, state] of Object.entries(states)) {
      if (state !== "blocked") continue;
      const parts = key.split("-");
      if (parts.length !== 2) continue;
      const day = parseInt(parts[0], 10);
      const hour = parseInt(parts[1], 10);
      if (!Number.isFinite(day) || !Number.isFinite(hour)) continue;
      if (!hoursByDay[day]) hoursByDay[day] = [];
      hoursByDay[day].push(hour);
    }
    for (const [day, hours] of Object.entries(hoursByDay)) {
      const sorted = [...new Set(hours)].sort((a, b) => a - b);
      // Merge consecutive hours into ranges
      let rangeStart = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i <= sorted.length; i++) {
        const cur = sorted[i];
        if (cur !== prev + 1) {
          blockedSlots.push({ aircraftRegistration: registration, dayOfWeek: parseInt(day, 10), startHour: rangeStart, endHour: prev + 1 });
          rangeStart = cur;
        }
        prev = cur;
      }
    }
  }

  const publicFlights = (rules.sagaOnlySchedule
    ? flights
        .map((event) => publicSagaFlight(event, rules, actorId, actorRole, sagaUserIdOf(profile, actorId)))
        .filter((flight) => flight && flight.flightDate >= from && flight.flightDate <= to)
    : flights.map((doc) => publicFlight(doc, actorId, actorRole))
  ).filter((flight) => flight && !aircraftHiddenForRole(rules, flight.aircraftIdent, actorRole));

  const publicAircrafts = aircrafts.documents
    .filter((doc) => !aircraftHiddenForRole(rules, doc.registration, actorRole))
    .map((doc) => ({ id: doc.$id, registration: doc.registration, modelId: doc.model_id, imageUrl: doc.image_url || null }));

  // Lista de espera (modo SAGA): entra como coluna/"avião virtual" para agendamento.
  // Créditos usam o modelo da frota — a agenda não é uma aeronave local.
  if (rules.sagaOnlySchedule) {
    const fallbackModelId =
      aircrafts.documents.find((doc) => doc.model_id && !isWaitlistIdent(rules, doc.registration))?.model_id || null;
    for (const ident of waitlistIdents(rules)) {
      if (aircraftHiddenForRole(rules, ident, actorRole)) continue;
      if (publicAircrafts.some((row) => normalizeRegistration(row.registration) === normalizeRegistration(ident))) continue;
      publicAircrafts.push({
        id: `waitlist-${normalizeRegistration(ident)}`,
        registration: ident,
        modelId: fallbackModelId,
        imageUrl: null,
        isWaitlist: true,
      });
    }
  }

  return {
    mode: rules.mode,
    rules,
    aircrafts: publicAircrafts,
    flights: publicFlights,
    blockedSlots,
  };
}

async function handleRequest(payload, actorId, actorRole, profile, rules) {
  if (rules.mode !== "booking") fail("A escala não está aberta para agendamento.");
  const studentId = actorRole === "aluno" ? actorId : clean(payload.studentUserId);
  if (!studentId) fail("Aluno não informado.");
  const student = actorRole === "aluno" ? profile : await getProfile(studentId);
  const date = clean(payload.flightDate);
  const registration = clean(payload.aircraftIdent).toUpperCase();
  const durationMinutes = integer(payload.durationMinutes, 0, 1, 24 * 60);
  if (aircraftHiddenForRole(rules, registration, actorRole)) fail("Esta aeronave não está disponível para agendamento.", 403);
  // Lista de espera: não é uma aeronave local — só existe no modo SAGA.
  const waitlistBooking = isWaitlistIdent(rules, registration);
  if (waitlistBooking && !rules.sagaOnlySchedule) fail("A lista de espera está disponível apenas no modo SAGA.");
  const aircraft = waitlistBooking ? null : await getAircraft(registration);
  const aircraftModelId = waitlistBooking ? await waitlistFallbackModelId(rules) : aircraft.model_id;
  const day = dayOfWeek(date);
  const weekend = day === 0 || day === 6;
  const minHours = weekend ? rules.weekendMinHours : rules.weekdayMinHours;
  const maxHours = weekend ? rules.weekendMaxHours : rules.weekdayMaxHours;
  if (durationMinutes % rules.slotMinutes !== 0) fail(`A duração precisa ser múltipla de ${rules.slotMinutes} minutos.`);
  if (durationMinutes < minHours * 60 || durationMinutes > maxHours * 60) fail(`A duração deve ficar entre ${minHours}h e ${maxHours}h.`);
  const startMinute = parseClock(payload.startTime);
  // Admin/instrutor podem iniciar em meio-slot (ex.: slot 30min → passos de 15min).
  const startStep = actorRole === "aluno" ? rules.slotMinutes : Math.max(5, Math.round(rules.slotMinutes / 2));
  if (startMinute % startStep !== 0) fail(`O início precisa respeitar slots de ${startStep} minutos.`);
  const scheduleStartMinute = parseClock(rules.scheduleStartTime || "06:00");
  if (startMinute < scheduleStartMinute) fail(`Agendamentos a partir das ${rules.scheduleStartTime || "06:00"}.`);
  const times = scheduleTimes(date, payload.startTime, durationMinutes, rules);
  const presentationMs = Date.parse(times.occupiedStartAt);
  validateBookingLeadDates(date, presentationMs, rules);
  const isNight = startMinute >= rules.nightFlightStartHour * 60;
  if (isNight && (!rules.allowNightFlights || !rules.nightBookingWeekdays.includes(day))) fail("Voos noturnos não podem ser marcados neste dia.");
  if (!waitlistBooking) {
    await validateBlockedSlot(aircraft.$id, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes);
  }

  if (rules.sagaOnlySchedule) {
    // Mesmas regras, mas o evento vive apenas na agenda SAGA — nada é salvo no sistema.
    const studentSagaId = requireStudentSagaId(student);
    const events = await listSagaEvents();
    // A lista de espera se comporta como um avião: só um voo por intervalo nela.
    validateSagaConflict(events, rules, registration, times.occupiedStartAt, times.occupiedEndAt);
    validateSagaStudentOverlap(events, rules, studentSagaId, times.occupiedStartAt, times.occupiedEndAt);
    if (waitlistBooking) {
      await validateWaitlistNoAircraftFree(
        events,
        rules,
        actorRole,
        date,
        startMinute - rules.bufferBeforeMinutes,
        startMinute + durationMinutes + rules.bufferAfterMinutes,
        times.occupiedStartAt,
        times.occupiedEndAt,
      );
    }
    // Travas de quantidade/horas valem apenas para o aluno — admin e instrutor marcam livremente.
    if (actorRole === "aluno") {
      const dailyLimitSaga = weekend ? rules.weekendMaxFlightsPerDay : rules.weekdayMaxFlightsPerDay;
      if (dailyLimitSaga) {
        const sameDay = events.filter((event) => {
          if (sagaEventIsCancelled(event)) return false;
          if (!sameSagaUserId(event.studentSagaId, studentSagaId)) return false;
          const eventTimes = sagaEventTimes(event, rules);
          return eventTimes?.flightDate === date;
        });
        if (sameDay.length >= dailyLimitSaga) fail("O limite diário de voos foi atingido.");
      }
      validateWeeklyLimits(rules, sagaStudentWeekUsage(events, rules, studentSagaId, date), durationMinutes, weekend);
    }
    if (rules.requireCreditsForBooking) {
      const reserved = await sagaReservedHoursForModel(events, studentSagaId, aircraftModelId, rules);
      const credit = await creditAvailable(studentId, aircraftModelId, isNight, durationMinutes / 60, date, reserved, rules.creditSimplified);
      const freeBalanceHours = credit.rawAvailableHours;
      if (!credit.sufficient && !zeroCreditExceptionApplies(rules, freeBalanceHours, durationMinutes, credit)) {
        fail(credit.insufficientMessage || `Crédito insuficiente. Disponível: ${Math.max(0, freeBalanceHours).toFixed(2)}h.`);
      }
    }
    // O evento no SAGA armazena o bloco completo (apresentação→encerramento).
    // Solicitação de aluno entra como PENDING (pendente de confirmação da escola).
    const sagaStatus = actorRole === "aluno" ? "PENDING" : "PLANNED";
    const flexibilityMinutes = integer(payload.flexibilityMinutes, 0, 0, 8 * 60);
    const observation = clean(payload.notes).slice(0, 180);
    const bookingNotes = [
      waitlistBooking ? "LISTA DE ESPERA" : "",
      "Agendado via plataforma",
      flexibilityMinutes > 0 ? `Flexibilidade: ±${clock(flexibilityMinutes)}` : "",
      observation ? `Obs: ${observation}` : "",
    ].filter(Boolean).join(" | ");
    let result;
    try {
      result = await execAdminUsers({
        action: "sagaUpsertScheduleDirect",
        aircraftIdent: registration,
        studentSagaId,
        studentName: clean(student.full_name || student.email || "Aluno"),
        instructorUserId: actorRole === "instrutor" ? actorId : null,
        date,
        startTime: times.presentationTime,
        durationMinutes: rules.bufferBeforeMinutes + durationMinutes + rules.bufferAfterMinutes,
        sagaStatus,
        notes: bookingNotes,
      });
    } catch (sagaError) {
      // O SAGA é a fonte da verdade: se ele recusar (ex.: o horário acabou de ser
      // reservado por outra pessoa), o voo NÃO foi criado.
      const detail = clean(sagaError?.message);
      fail(
        `Não foi possível criar o voo na agenda SAGA${detail ? ` — ${detail}` : ""}. Atualize a agenda e tente novamente.`,
        409,
      );
    }
    if (actorRole === "aluno") {
      notifyAdminsStudentAction("requested", {
        studentName: clean(student.full_name || student.email || "Aluno"),
        aircraft: registration,
        flightDate: date,
        startTime: times.startTime,
        durationMinutes,
        notes: observation,
      });
    }
    return {
      flight: {
        id: clean(result.scheduleId),
        aircraftIdent: registration,
        aircraftModelId: aircraftModelId || null,
        flightDate: date,
        presentationTime: times.presentationTime,
        startTime: times.startTime,
        cutoffTime: times.cutoffTime,
        endTime: times.endTime,
        durationMinutes,
        status: sagaStatus === "PENDING" ? "Pendente" : "Previsto",
        isOwn: actorRole === "aluno",
        studentUserId: studentId,
        instructorUserId: actorRole === "instrutor" ? actorId : null,
        canCancel: actorRole === "aluno",
      },
    };
  }

  await validateFlightConflict(registration, date, times.occupiedStartAt, times.occupiedEndAt);
  await validateStudentFlightOverlap(studentId, date, times.occupiedStartAt, times.occupiedEndAt);
  // Travas de quantidade/horas valem apenas para o aluno — admin e instrutor marcam livremente.
  if (actorRole === "aluno") {
    const dailyLimit = weekend ? rules.weekendMaxFlightsPerDay : rules.weekdayMaxFlightsPerDay;
    if (dailyLimit) {
      const daily = await databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
        sdk.Query.equal("student_user_id", [studentId]),
        sdk.Query.equal("flight_date", [date]),
        sdk.Query.equal("flight_status", ACTIVE_STATUSES),
        sdk.Query.limit(dailyLimit),
      ]);
      if (daily.total >= dailyLimit) fail("O limite diário de voos foi atingido.");
    }
    if (rules.weeklyMaxFlights || rules.weeklyMaxFlightHours || rules.weekendMaxFlights || rules.weekendMaxFlightHours) {
      const wkStart = weekStart(date);
      const weekFlights = await databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
        sdk.Query.equal("student_user_id", [studentId]),
        sdk.Query.greaterThanEqual("flight_date", wkStart),
        sdk.Query.lessThanEqual("flight_date", addDays(wkStart, 6)),
        sdk.Query.equal("flight_status", ACTIVE_STATUSES),
        sdk.Query.limit(200),
      ]);
      const usage = { flights: 0, hours: 0, weekendFlights: 0, weekendHours: 0 };
      for (const doc of weekFlights.documents) {
        const docHours = number(doc.requested_duration_minutes, 0) / 60;
        usage.flights += 1;
        usage.hours += docHours;
        const docDay = dayOfWeek(doc.flight_date);
        if (docDay === 0 || docDay === 6) {
          usage.weekendFlights += 1;
          usage.weekendHours += docHours;
        }
      }
      validateWeeklyLimits(rules, usage, durationMinutes, weekend);
    }
  }
  if (rules.requireCreditsForBooking) {
    const credit = await creditAvailable(studentId, aircraft.model_id, isNight, durationMinutes / 60, date, undefined, rules.creditSimplified);
    const freeBalanceHours = credit.rawAvailableHours;
    if (!credit.sufficient && !zeroCreditExceptionApplies(rules, freeBalanceHours, durationMinutes, credit)) {
      fail(credit.insufficientMessage || `Crédito insuficiente. Disponível: ${Math.max(0, freeBalanceHours).toFixed(2)}h.`);
    }
  }
  const id = sdk.ID.unique();
  await acquireLocks(registration, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes, rules.slotMinutes, id, studentId);
  const source = `student-booking-${date}-${id}.csv`;
  try {
    const record = buildRecord({
      studentId,
      studentLabel: clean(student.full_name || student.email || "Aluno"),
      registration,
      date,
      times,
      durationMinutes,
      isNight,
    });
    const doc = await databases.createDocument(DATABASE_ID, FLIGHTS_ID, id, {
      school_id: SCHOOL_ID,
      name: `${date} - ${registration}`,
      source_filename: source,
      user_id: studentId,
      student_user_id: studentId,
      instructor_user_id: actorRole === "instrutor" ? actorId : null,
      created_by_role: actorRole,
      csv_text: record,
      aircraft_ident: registration,
      aircraft_model_id: aircraft.model_id,
      duration_sec: durationMinutes * 60,
      requested_duration_minutes: durationMinutes,
      flight_date: date,
      start_time: times.startTime,
      presentation_time: times.presentationTime,
      cutoff_time: times.cutoffTime,
      schedule_end_time: times.endTime,
      occupied_start_at: times.occupiedStartAt,
      occupied_end_at: times.occupiedEndAt,
      schedule_origin: actorRole === "aluno" ? "student_booking" : "instructor_booking",
      schedule_week_start: weekStart(date),
      schedule_demand_id: `booking-${id}`,
      flight_status: "Pendente",
      is_night: isNight,
    }, flightPermissions(studentId, actorRole === "instrutor" ? actorId : null));
    void triggerSagaSync(id); // fire-and-forget — errors caught internally
    if (actorRole === "aluno") {
      notifyAdminsStudentAction("requested", {
        studentName: clean(student.full_name || student.email || "Aluno"),
        aircraft: registration,
        flightDate: date,
        startTime: times.startTime,
        durationMinutes,
      });
    }
    return { flight: publicFlight(doc, actorId, actorRole) };
  } catch (err) {
    await releaseLocks(id);
    throw err;
  }
}

async function handleAvailability(payload, actorId, actorRole, rules) {
  if (rules.mode !== "booking") fail("A escala não está aberta para agendamento.");
  const studentId = actorRole === "aluno" ? actorId : clean(payload.studentUserId);
  if (!studentId) fail("Aluno não informado.");
  const date = clean(payload.flightDate);
  const registration = clean(payload.aircraftIdent).toUpperCase();
  const durationMinutes = integer(payload.durationMinutes, 0, 1, 24 * 60);
  const waitlistBooking = isWaitlistIdent(rules, registration);
  if (waitlistBooking && !rules.sagaOnlySchedule) fail("A lista de espera está disponível apenas no modo SAGA.");
  const aircraft = waitlistBooking ? null : await getAircraft(registration);
  const aircraftModelId = waitlistBooking ? await waitlistFallbackModelId(rules) : aircraft.model_id;
  const startMinute = parseClock(payload.startTime);
  const times = scheduleTimes(date, payload.startTime, durationMinutes, rules);
  if (!waitlistBooking) {
    await validateBlockedSlot(aircraft.$id, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes);
  }
  const isNight = startMinute >= rules.nightFlightStartHour * 60;
  let reservedSaga = { weekdayHours: 0, weekendHours: 0 };
  if (rules.sagaOnlySchedule) {
    const events = await listSagaEvents();
    validateSagaConflict(events, rules, registration, times.occupiedStartAt, times.occupiedEndAt);
    if (waitlistBooking) {
      await validateWaitlistNoAircraftFree(
        events,
        rules,
        actorRole,
        date,
        startMinute - rules.bufferBeforeMinutes,
        startMinute + durationMinutes + rules.bufferAfterMinutes,
        times.occupiedStartAt,
        times.occupiedEndAt,
      );
    }
    const profile = await getProfile(studentId);
    reservedSaga = await sagaReservedHoursForModel(events, sagaUserIdOf(profile, studentId), aircraftModelId, rules);
  } else {
    await validateFlightConflict(registration, date, times.occupiedStartAt, times.occupiedEndAt);
  }
  const credit = await creditAvailable(studentId, aircraftModelId, isNight, durationMinutes / 60, date, reservedSaga, rules.creditSimplified);
  const freeBalanceHours = credit.rawAvailableHours;
  const zeroCreditExceptionAvailable =
    rules.requireCreditsForBooking && zeroCreditExceptionApplies(rules, freeBalanceHours, durationMinutes, credit);
  return {
    available: true,
    creditAvailableHours: credit.availableHours,
    creditFreeHours: freeBalanceHours,
    creditSufficient: credit.sufficient,
    weekdayOnlyAvailableHours: credit.weekdayOnlyAvailableHours,
    anyDayAvailableHours: credit.anyDayAvailableHours,
    zeroCreditExceptionAvailable,
    presentationTime: times.presentationTime,
    startTime: times.startTime,
    cutoffTime: times.cutoffTime,
    endTime: times.endTime,
  };
}

async function handleConfirm(payload, actorId, actorRole, rules) {
  if (rules?.sagaOnlySchedule) fail("No modo SAGA os eventos já entram confirmados na agenda; não há confirmação manual.");
  if (actorRole !== "admin" && actorRole !== "instrutor") fail("Sem permissão para confirmar.", 403);
  const id = clean(payload.flightId);
  const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, id);
  if ((doc.flight_status === "Previsto" ? "Confirmado" : doc.flight_status) !== "Pendente") fail("Somente voos pendentes podem ser confirmados.");
  const updated = await databases.updateDocument(DATABASE_ID, FLIGHTS_ID, id, {
    flight_status: "Confirmado",
    confirmed_at: new Date().toISOString(),
    confirmed_by: actorId,
  });
  return { flight: publicFlight(updated, actorId, actorRole) };
}

async function handleCancelSagaOnly(payload, actorId, actorRole, rules, profile) {
  const id = clean(payload.flightId);
  const events = await listSagaEvents();
  const event = await findSagaEventOrFail(events, id);
  const actorSagaId = sagaUserIdOf(profile, actorId);
  const own = sagaEventBelongsTo(event, actorId, actorSagaId);
  if (actorRole === "aluno" && !own) fail("Você só pode cancelar seus próprios voos.", 403);
  if (sagaEventIsCancelled(event)) fail("Este voo não pode mais ser cancelado.");
  if (actorRole === "aluno" && !clean(payload.reason)) fail("Informe o motivo do cancelamento.");
  const times = sagaEventTimes(event, rules);
  if (!times) fail("Evento SAGA sem data ou horário válido.", 422);
  if (actorRole === "aluno" && Date.now() >= times.presentationMs) fail("O prazo de cancelamento pelo aluno terminou.");

  const hoursBefore = (times.presentationMs - Date.now()) / 3600000;
  const penaltyPct = penaltyFor(hoursBefore, rules);
  const penaltyHours = Number(((times.durationMinutes / 60) * penaltyPct / 100).toFixed(2));
  const waive = actorRole !== "aluno" && Boolean(payload.waivePenalty);

  const studentUserId =
    clean(event.studentUserId) ||
    (own ? actorId : await resolveLocalUserIdBySagaId(event.studentSagaId));
  const aircraft = await getAircraft(clean(event.aircraft).toUpperCase()).catch(() => null);
  // Multa e auditoria continuam registradas no sistema — apenas a escala vive no SAGA.
  const shouldDebit = rules.autoDebitCancellationPenalty && !waive && penaltyHours > 0 && Boolean(studentUserId);
  if (shouldDebit) {
    await databases.createDocument(DATABASE_ID, ADJUSTMENTS_ID, `cancel-saga-${id}`.slice(0, 36), {
      school_id: SCHOOL_ID,
      student_user_id: studentUserId,
      aircraft_model_id: aircraft?.model_id || "",
      aircraft_ident: clean(event.aircraft).toUpperCase(),
      flight_id: `saga-${id}`,
      flight_date: times.flightDate,
      flight_start_time: times.startTime,
      adjustment_type: "cancellation_penalty",
      hours: -penaltyHours,
      percentage: penaltyPct,
      is_night: times.startMinute >= rules.nightFlightStartHour * 60,
      reason: clean(payload.reason || "Cancelamento de voo"),
      created_by: actorId,
      occurred_at: new Date().toISOString(),
    }, [
      sdk.Permission.read(sdk.Role.user(studentUserId)),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.read(sdk.Role.label("instrutor")),
    ]).catch((error) => {
      if (error?.code !== 409) throw error;
    });
    // Espelha a multa como remoção de crédito no SAGA (best-effort, não bloqueia).
    const stamp = brCancelStamp();
    registerSagaCancellationPenalty({
      studentUserId,
      aircraftModelId: aircraft?.model_id || "",
      aircraftIdent: clean(event.aircraft).toUpperCase(),
      penaltyHours,
      penaltyPct,
      isNight: times.startMinute >= rules.nightFlightStartHour * 60,
      createdAt: stamp.isoDate,
      flightWhen: `${brDate(times.flightDate)} às ${times.startTime}`,
      cancelledWhen: stamp.br,
      penaltyRef: `saga-${id}`,
    });
  }
  if (studentUserId) {
    await databases.createDocument(DATABASE_ID, AUDIT_ID, `cancel-saga-${id}`.slice(0, 36), {
      school_id: SCHOOL_ID,
      flight_id: `saga-${id}`,
      student_user_id: studentUserId,
      event_type: "cancelled",
      actor_user_id: actorId,
      actor_role: actorRole,
      reason: clean(payload.reason || "Cancelamento de voo").slice(0, 1024),
      penalty_percentage: penaltyPct,
      penalty_hours: shouldDebit ? penaltyHours : 0,
      penalty_waived: waive,
      occurred_at: new Date().toISOString(),
    }, [
      sdk.Permission.read(sdk.Role.user(studentUserId)),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.read(sdk.Role.label("instrutor")),
    ]).catch((error) => {
      if (error?.code !== 409) throw error;
    });
  }

  // O evento NÃO é excluído do SAGA: o status vira CANCELED e a nota registra quem cancelou.
  const cancelNote = `Cancelado via plataforma (${actorRole})${clean(payload.reason) ? ` - ${clean(payload.reason)}` : ""}`;
  try {
    await execAdminUsers({
      action: "sagaUpsertScheduleDirect",
      scheduleId: id,
      aircraftIdent: clean(event.aircraft).toUpperCase(),
      studentSagaId: clean(event.studentSagaId),
      studentName: clean(event.studentName),
      ...(clean(event.instructorSagaId) && clean(event.instructorSagaId) !== "0"
        ? { instructorSagaId: clean(event.instructorSagaId), instructorName: clean(event.instructorName) }
        : {}),
      date: times.flightDate,
      startTime: times.presentationTime,
      durationMinutes: times.blockDurationMinutes,
      sagaStatus: "CANCELED",
      rawNotes: [clean(event.notes), cancelNote].filter(Boolean).join(" | "),
    });
  } catch {
    // Fallback: se o SAGA recusar a alteração de status, remove o evento para não deixar o voo ativo.
    await execAdminUsers({ action: "sagaCancelScheduleDirect", scheduleId: id });
  }

  if (actorRole === "aluno") {
    notifyAdminsStudentAction("cancelled", {
      studentName: clean(event.studentName) || clean(profile.full_name || profile.email || "Aluno"),
      aircraft: clean(event.aircraft).toUpperCase(),
      flightDate: times.flightDate,
      startTime: times.startTime,
      durationMinutes: times.durationMinutes,
      reason: clean(payload.reason),
      penaltyHours: shouldDebit ? penaltyHours : 0,
    });
  }

  const flight = publicSagaFlight(event, rules, actorId, actorRole, actorSagaId);
  return {
    flight: { ...flight, status: "Cancelado", canCancel: false },
    penaltyPct,
    penaltyHours: shouldDebit ? penaltyHours : 0,
  };
}

/**
 * Alteração de um voo agendado (modo SAGA): mesmas regras de prazo do cancelamento
 * para o aluno + validações completas de agendamento no novo horário. Sem multa —
 * o evento é movido (PUT) na agenda SAGA preservando aluno/instrutor/status.
 */
async function handleRescheduleSagaOnly(payload, actorId, actorRole, profile, rules) {
  if (rules.mode !== "booking") fail("A escala não está aberta para agendamento.");
  const id = clean(payload.flightId);
  const events = await listSagaEvents();
  const event = await findSagaEventOrFail(events, id);
  const actorSagaId = sagaUserIdOf(profile, actorId);
  const own = sagaEventBelongsTo(event, actorId, actorSagaId);
  if (actorRole === "aluno" && !own) fail("Você só pode alterar seus próprios voos.", 403);
  if (sagaEventIsCancelled(event)) fail("Voos cancelados não podem ser alterados.");
  const currentTimes = sagaEventTimes(event, rules);
  if (!currentTimes) fail("Evento SAGA sem data ou horário válido.", 422);
  if (actorRole === "aluno" && Date.now() >= currentTimes.presentationMs) {
    fail("O prazo de alteração pelo aluno terminou.");
  }

  // Validações do novo horário — mesmas regras do agendamento
  const date = clean(payload.flightDate);
  const registration = clean(payload.aircraftIdent).toUpperCase();
  const durationMinutes = integer(payload.durationMinutes, 0, 1, 24 * 60);
  if (aircraftHiddenForRole(rules, registration, actorRole)) fail("Esta aeronave não está disponível para agendamento.", 403);
  // Alteração PARA a lista de espera segue as mesmas regras da solicitação nela.
  const waitlistBooking = isWaitlistIdent(rules, registration);
  const aircraft = waitlistBooking ? null : await getAircraft(registration);
  const aircraftModelId = waitlistBooking ? await waitlistFallbackModelId(rules) : aircraft.model_id;
  const day = dayOfWeek(date);
  const weekend = day === 0 || day === 6;
  const minHours = weekend ? rules.weekendMinHours : rules.weekdayMinHours;
  const maxHours = weekend ? rules.weekendMaxHours : rules.weekdayMaxHours;
  if (durationMinutes % rules.slotMinutes !== 0) fail(`A duração precisa ser múltipla de ${rules.slotMinutes} minutos.`);
  if (durationMinutes < minHours * 60 || durationMinutes > maxHours * 60) fail(`A duração deve ficar entre ${minHours}h e ${maxHours}h.`);
  const startMinute = parseClock(payload.startTime);
  const rescheduleStartStep = actorRole === "aluno" ? rules.slotMinutes : Math.max(5, Math.round(rules.slotMinutes / 2));
  if (startMinute % rescheduleStartStep !== 0) fail(`O início precisa respeitar slots de ${rescheduleStartStep} minutos.`);
  const scheduleStartMinute = parseClock(rules.scheduleStartTime || "06:00");
  if (startMinute < scheduleStartMinute) fail(`Agendamentos a partir das ${rules.scheduleStartTime || "06:00"}.`);
  const times = scheduleTimes(date, payload.startTime, durationMinutes, rules);
  const presentationMs = Date.parse(times.occupiedStartAt);
  validateBookingLeadDates(date, presentationMs, rules);
  const isNight = startMinute >= rules.nightFlightStartHour * 60;
  if (isNight && (!rules.allowNightFlights || !rules.nightBookingWeekdays.includes(day))) fail("Voos noturnos não podem ser marcados neste dia.");
  if (!waitlistBooking) {
    await validateBlockedSlot(aircraft.$id, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes);
  }
  validateSagaConflict(events, rules, registration, times.occupiedStartAt, times.occupiedEndAt, id);
  validateSagaStudentOverlap(
    events,
    rules,
    clean(event.studentSagaId) || actorSagaId,
    times.occupiedStartAt,
    times.occupiedEndAt,
    id,
  );
  if (waitlistBooking) {
    await validateWaitlistNoAircraftFree(
      events,
      rules,
      actorRole,
      date,
      startMinute - rules.bufferBeforeMinutes,
      startMinute + durationMinutes + rules.bufferAfterMinutes,
      times.occupiedStartAt,
      times.occupiedEndAt,
      id,
    );
  }
  if (actorRole === "aluno") {
    const studentSagaIdForLimits = clean(event.studentSagaId) || actorSagaId;
    const dailyLimit = weekend ? rules.weekendMaxFlightsPerDay : rules.weekdayMaxFlightsPerDay;
    if (dailyLimit) {
      const sameDay = events.filter((row) => {
        if (clean(row.id) === clean(id)) return false;
        if (sagaEventIsCancelled(row)) return false;
        if (!sameSagaUserId(row.studentSagaId, studentSagaIdForLimits)) return false;
        return sagaEventTimes(row, rules)?.flightDate === date;
      });
      if (sameDay.length >= dailyLimit) fail("O limite diário de voos foi atingido.");
    }
    validateWeeklyLimits(
      rules,
      sagaStudentWeekUsage(events, rules, studentSagaIdForLimits, date, id),
      durationMinutes,
      weekend,
    );
  }
  if (rules.requireCreditsForBooking) {
    const studentSagaId = clean(event.studentSagaId) || actorSagaId;
    const studentUserId = clean(event.studentUserId) || (own ? actorId : null);
    const reserved = await sagaReservedHoursForModel(events, studentSagaId, aircraftModelId, rules, id);
    if (studentUserId) {
      const credit = await creditAvailable(studentUserId, aircraftModelId, isNight, durationMinutes / 60, date, reserved, rules.creditSimplified);
      const freeBalanceHours = credit.rawAvailableHours;
      if (!credit.sufficient && !zeroCreditExceptionApplies(rules, freeBalanceHours, durationMinutes, credit)) {
        fail(credit.insufficientMessage || `Crédito insuficiente. Disponível: ${Math.max(0, freeBalanceHours).toFixed(2)}h.`);
      }
    }
  }

  // Motivo da alteração: obrigatório para o aluno e registrado nas observações.
  const rescheduleReason = clean(payload.reason).slice(0, 180);
  if (actorRole === "aluno" && !rescheduleReason) fail("Informe o motivo da alteração.");
  const rescheduleNote = `Alterado via plataforma${rescheduleReason ? ` - ${rescheduleReason}` : ""}`;

  const currentStatus = clean(event.status).toUpperCase();
  const keepStatus = ["PLANNED", "PENDING", "CONFIRMED"].includes(currentStatus) ? currentStatus : "PLANNED";
  // Alteração feita pelo aluno volta para "Pendente": a escola precisa reconfirmar
  // o novo horário (antes o voo seguia Confirmado sem ninguém revisar).
  const nextStatus = actorRole === "aluno" && keepStatus === "CONFIRMED" ? "PENDING" : keepStatus;
  await execAdminUsers({
    action: "sagaUpsertScheduleDirect",
    scheduleId: id,
    aircraftIdent: registration,
    studentSagaId: clean(event.studentSagaId) || actorSagaId,
    studentName: clean(event.studentName),
    ...(clean(event.instructorSagaId) ? { instructorSagaId: clean(event.instructorSagaId), instructorName: clean(event.instructorName) } : {}),
    date,
    startTime: times.presentationTime,
    durationMinutes: rules.bufferBeforeMinutes + durationMinutes + rules.bufferAfterMinutes,
    sagaStatus: nextStatus,
    // Preserva as notas existentes (obs do aluno, flexibilidade) e registra a alteração.
    ...(clean(event.notes)
      ? { rawNotes: `${clean(event.notes)} | ${rescheduleNote}` }
      : { notes: rescheduleNote }),
  });

  if (actorRole === "aluno") {
    notifyAdminsStudentAction("rescheduled", {
      studentName: clean(event.studentName) || clean(profile.full_name || profile.email || "Aluno"),
      aircraft: registration,
      flightDate: date,
      startTime: times.startTime,
      durationMinutes,
      previousAircraft: clean(event.aircraft).toUpperCase(),
      previousFlightDate: currentTimes.flightDate,
      previousStartTime: currentTimes.startTime,
      statusReverted: nextStatus !== keepStatus,
      reason: rescheduleReason,
    });
  }

  return {
    flight: {
      id,
      aircraftIdent: registration,
      aircraftModelId: aircraftModelId || null,
      flightDate: date,
      presentationTime: times.presentationTime,
      startTime: times.startTime,
      cutoffTime: times.cutoffTime,
      endTime: times.endTime,
      durationMinutes,
      status: nextStatus === "CONFIRMED" ? "Confirmado" : nextStatus === "PENDING" ? "Pendente" : "Previsto",
      isOwn: own,
      studentUserId: clean(event.studentUserId) || (own ? actorId : null),
      instructorUserId: clean(event.instructorUserId) || null,
      canCancel: own,
    },
  };
}

async function handleCancel(payload, actorId, actorRole, rules, profile) {
  const id = clean(payload.flightId);
  const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, id);
  const own = doc.student_user_id === actorId;
  if (actorRole === "aluno" && !own) fail("Você só pode cancelar seus próprios voos.", 403);
  const currentStatus = doc.flight_status === "Previsto" ? "Confirmado" : doc.flight_status;
  if (!ACTIVE_STATUSES.includes(currentStatus)) fail("Este voo não pode mais ser cancelado.");
  if (actorRole === "aluno" && !clean(payload.reason)) fail("Informe o motivo do cancelamento.");
  const presentationMs = dateTimeMs(doc.flight_date, doc.presentation_time || doc.start_time);
  if (actorRole === "aluno" && Date.now() >= presentationMs) fail("O prazo de cancelamento pelo aluno terminou.");
  const hoursBefore = (presentationMs - Date.now()) / 3600000;
  const penaltyPct = penaltyFor(hoursBefore, rules);
  const penaltyHours = Number(((number(doc.requested_duration_minutes, 0) / 60) * penaltyPct / 100).toFixed(2));
  const waive = actorRole !== "aluno" && Boolean(payload.waivePenalty);
  const shouldDebit = rules.autoDebitCancellationPenalty && !waive && penaltyHours > 0;
  if (shouldDebit) {
    const adjustmentId = `cancel-${id}`;
    await databases.createDocument(DATABASE_ID, ADJUSTMENTS_ID, adjustmentId, {
      school_id: SCHOOL_ID,
      student_user_id: doc.student_user_id,
      aircraft_model_id: doc.aircraft_model_id || "",
      aircraft_ident: doc.aircraft_ident || "",
      flight_id: id,
      flight_date: doc.flight_date || "",
      flight_start_time: doc.start_time || doc.presentation_time || "",
      adjustment_type: "cancellation_penalty",
      hours: -penaltyHours,
      percentage: penaltyPct,
      is_night: Boolean(doc.is_night),
      reason: clean(payload.reason || "Cancelamento de voo"),
      created_by: actorId,
      occurred_at: new Date().toISOString(),
    }, [
      sdk.Permission.read(sdk.Role.user(doc.student_user_id)),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.read(sdk.Role.label("instrutor")),
    ]).catch((error) => {
      if (error?.code !== 409) throw error;
    });
    // Espelha a multa como remoção de crédito no SAGA (best-effort, não bloqueia).
    const stamp = brCancelStamp();
    registerSagaCancellationPenalty({
      studentUserId: doc.student_user_id,
      aircraftModelId: doc.aircraft_model_id || "",
      aircraftIdent: clean(doc.aircraft_ident).toUpperCase(),
      penaltyHours,
      penaltyPct,
      isNight: Boolean(doc.is_night),
      createdAt: stamp.isoDate,
      flightWhen: `${brDate(doc.flight_date)} às ${clean(doc.start_time)}`,
      cancelledWhen: stamp.br,
      penaltyRef: `local-${id}`,
    });
  }
  await databases.createDocument(DATABASE_ID, AUDIT_ID, `cancel-${id}`, {
    school_id: SCHOOL_ID,
    flight_id: id,
    student_user_id: doc.student_user_id,
    event_type: "cancelled",
    actor_user_id: actorId,
    actor_role: actorRole,
    reason: clean(payload.reason || "Cancelamento de voo").slice(0, 1024),
    penalty_percentage: penaltyPct,
    penalty_hours: shouldDebit ? penaltyHours : 0,
    penalty_waived: waive,
    occurred_at: new Date().toISOString(),
  }, [
    sdk.Permission.read(sdk.Role.user(doc.student_user_id)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
  ]).catch((error) => {
    if (error?.code !== 409) throw error;
  });
  const updated = await databases.updateDocument(DATABASE_ID, FLIGHTS_ID, id, {
    flight_status: "Cancelado",
    cancelled_at: new Date().toISOString(),
  });
  await releaseLocks(id);
  if (actorRole === "aluno") {
    notifyAdminsStudentAction("cancelled", {
      studentName: clean(profile?.full_name || profile?.email || "Aluno"),
      aircraft: clean(doc.aircraft_ident).toUpperCase(),
      flightDate: doc.flight_date,
      startTime: doc.start_time,
      durationMinutes: number(doc.requested_duration_minutes, 0),
      reason: clean(payload.reason),
      penaltyHours: shouldDebit ? penaltyHours : 0,
    });
  }
  return { flight: publicFlight(updated, actorId, actorRole), penaltyPct, penaltyHours: shouldDebit ? penaltyHours : 0 };
}

module.exports = async ({ req, res, error }) => {
  try {
    if (!DATABASE_ID || !FLIGHTS_ID || !PROFILES_ID || !AIRCRAFTS_ID || !SETTINGS_ID) {
      return response(res, 500, { ok: false, message: "Configuração incompleta da função." });
    }
    // A dynamic key (com os scopes da function, incl. executions.write para o modo
    // SAGA) chega via header a cada request — não existe como variável de ambiente.
    const dynamicKey = clean(req.headers["x-appwrite-key"]);
    if (dynamicKey) client.setKey(dynamicKey);
    const actorId = clean(req.headers["x-appwrite-user-id"]);
    if (!actorId) return response(res, 401, { ok: false, message: "Não autenticado." });
    const payload = req.bodyJson || parseJson(req.body, {});
    const profile = await getProfile(actorId);
    const actorRole = getEffectiveRole(profile);
    const rules = await getRules();
    // Flag do modo simplificado de créditos (dia = noite) — threaded via rules p/ as
    // verificações de crédito espelharem o extrato do aluno.
    rules.creditSimplified = await getCreditSalesSimplified();
    let data;
    if (payload.action === "getCalendar") data = await handleCalendar(payload, actorId, actorRole, rules, profile);
    else if (payload.action === "checkAvailability") data = await handleAvailability(payload, actorId, actorRole, rules);
    else if (payload.action === "requestFlight") data = await handleRequest(payload, actorId, actorRole, profile, rules);
    else if (payload.action === "confirmFlight") data = await handleConfirm(payload, actorId, actorRole, rules);
    else if (payload.action === "rescheduleFlight") {
      if (!rules.sagaOnlySchedule) fail("Alteração de voo disponível apenas no modo SAGA.");
      data = await handleRescheduleSagaOnly(payload, actorId, actorRole, profile, rules);
    }
    else if (payload.action === "cancelFlight") {
      data = rules.sagaOnlySchedule
        ? await handleCancelSagaOnly(payload, actorId, actorRole, rules, profile)
        : await handleCancel(payload, actorId, actorRole, rules, profile);
    } else if (payload.action === "previewCancellation") {
      if (rules.sagaOnlySchedule) {
        const events = await listSagaEvents();
        const event = await findSagaEventOrFail(events, clean(payload.flightId));
        if (actorRole === "aluno" && !sagaEventBelongsTo(event, actorId, sagaUserIdOf(profile, actorId))) fail("Sem permissão.", 403);
        const times = sagaEventTimes(event, rules);
        if (!times) fail("Evento SAGA sem data ou horário válido.", 422);
        const hoursBefore = (times.presentationMs - Date.now()) / 3600000;
        const penaltyPct = penaltyFor(hoursBefore, rules);
        data = { penaltyPct, penaltyHours: Number(((times.durationMinutes / 60) * penaltyPct / 100).toFixed(2)) };
      } else {
        const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, clean(payload.flightId));
        if (actorRole === "aluno" && doc.student_user_id !== actorId) fail("Sem permissão.", 403);
        const hoursBefore = (dateTimeMs(doc.flight_date, doc.presentation_time || doc.start_time) - Date.now()) / 3600000;
        const penaltyPct = penaltyFor(hoursBefore, rules);
        data = { penaltyPct, penaltyHours: Number(((number(doc.requested_duration_minutes, 0) / 60) * penaltyPct / 100).toFixed(2)) };
      }
    } else fail("Ação inválida.");
    return response(res, 200, { ok: true, ...data });
  } catch (err) {
    if (typeof error === "function") error(err?.stack || err?.message || String(err));
    return response(res, err?.status || (err?.code === 404 ? 404 : 500), { ok: false, message: err?.message || "Erro interno." });
  }
};
