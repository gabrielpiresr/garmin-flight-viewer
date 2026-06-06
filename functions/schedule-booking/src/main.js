const sdk = require("node-appwrite");
const crypto = require("node:crypto");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY || "");
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

async function getProfile(userId) {
  const result = await databases.listDocuments(DATABASE_ID, PROFILES_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  const profile = result.documents[0];
  if (!profile) fail("Perfil não encontrado.", 403);
  return profile;
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

function adjustmentHours(doc) {
  return Math.abs(number(doc.hours, 0));
}

async function creditAvailable(studentId, modelId, isNight, requestedHours) {
  // Bug 5 guard: if aircraft has no model configured, credits can't be verified
  if (!modelId) return { availableHours: 0, sufficient: false };

  const today = new Date().toISOString().slice(0, 10);
  const [credits, adjustments, flights] = await Promise.all([
    databases.listDocuments(DATABASE_ID, CREDITS_ID, [
      sdk.Query.equal("user_id", [studentId]),
      sdk.Query.equal("aircraft_model_id", [modelId]),
      sdk.Query.greaterThanEqual("expires_at", today),
      sdk.Query.limit(500),
    ]),
    databases.listDocuments(DATABASE_ID, ADJUSTMENTS_ID, [
      sdk.Query.equal("student_user_id", [studentId]),
      sdk.Query.equal("aircraft_model_id", [modelId]),
      sdk.Query.limit(500),
    ]).catch(() => ({ documents: [] })),
    databases.listDocuments(DATABASE_ID, FLIGHTS_ID, [
      sdk.Query.equal("student_user_id", [studentId]),
      sdk.Query.equal("aircraft_model_id", [modelId]),
      sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Realizado"]),
      sdk.Query.limit(5000),
    ]),
  ]);
  const purchased = credits.documents
    .filter((doc) => Boolean(doc.is_night) === isNight)
    .reduce((sum, doc) => sum + number(doc.hours, 0), 0);
  const penalties = adjustments.documents
    .filter((doc) => Boolean(doc.is_night) === isNight)
    .reduce((sum, doc) => sum + adjustmentHours(doc), 0);
  const used = flights.documents
    .filter((doc) => Boolean(doc.is_night) === isNight)
    .reduce((sum, doc) => {
      if (doc.flight_status === "Realizado") {
        return sum + number(doc.block_time_minutes || doc.total_flight_minutes, 0) / 60;
      }
      return sum + number(doc.requested_duration_minutes, 0) / 60;
    }, 0);
  return { availableHours: Math.max(0, purchased - penalties - used), sufficient: purchased - penalties - used + 0.0001 >= requestedHours };
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
    status: doc.flight_status === "Previsto" ? "Confirmado" : doc.flight_status,
    isOwn: own,
    studentUserId: privileged ? doc.student_user_id : own ? actorId : null,
    instructorUserId: privileged || own ? doc.instructor_user_id || null : null,
    canCancel: own && ACTIVE_STATUSES.includes(doc.flight_status === "Previsto" ? "Confirmado" : doc.flight_status),
  };
}

function penaltyFor(hoursBefore, rules) {
  if (hoursBefore < 1) return number(rules.cancellationPenalty1hPct, 0);
  if (hoursBefore < 12) return number(rules.cancellationPenalty12hPct, 0);
  if (hoursBefore < 24) return number(rules.cancellationPenalty24hPct, 0);
  if (hoursBefore < 48) return number(rules.cancellationPenalty48hPct, 0);
  return 0;
}

async function handleCalendar(payload, actorId, actorRole, rules) {
  if (rules.mode === "closed" && actorRole === "aluno") return { mode: rules.mode, rules, aircrafts: [], flights: [] };
  const from = clean(payload.dateFrom);
  const to = clean(payload.dateTo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail("Período inválido.");
  const wkStart = weekStart(from);
  const [flights, aircrafts, opWeeks] = await Promise.all([
    listFlights(from, to),
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

  return {
    mode: rules.mode,
    rules,
    aircrafts: aircrafts.documents.map((doc) => ({ id: doc.$id, registration: doc.registration, modelId: doc.model_id, imageUrl: doc.image_url || null })),
    flights: flights.map((doc) => publicFlight(doc, actorId, actorRole)),
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
  const aircraft = await getAircraft(registration);
  const day = dayOfWeek(date);
  const weekend = day === 0 || day === 6;
  const minHours = weekend ? rules.weekendMinHours : rules.weekdayMinHours;
  const maxHours = weekend ? rules.weekendMaxHours : rules.weekdayMaxHours;
  if (durationMinutes % rules.slotMinutes !== 0) fail(`A duração precisa ser múltipla de ${rules.slotMinutes} minutos.`);
  if (durationMinutes < minHours * 60 || durationMinutes > maxHours * 60) fail(`A duração deve ficar entre ${minHours}h e ${maxHours}h.`);
  const startMinute = parseClock(payload.startTime);
  if (startMinute % rules.slotMinutes !== 0) fail(`O início precisa respeitar slots de ${rules.slotMinutes} minutos.`);
  const scheduleStartMinute = parseClock(rules.scheduleStartTime || "06:00");
  if (startMinute < scheduleStartMinute) fail(`Agendamentos a partir das ${rules.scheduleStartTime || "06:00"}.`);
  const times = scheduleTimes(date, payload.startTime, durationMinutes, rules);
  const presentationMs = Date.parse(times.occupiedStartAt);
  const now = Date.now();
  const leadDays = (presentationMs - now) / 86400000;
  if (leadDays < rules.minBookingLeadDays || leadDays > rules.maxBookingLeadDays + 1) fail("A data está fora da antecedência permitida.");
  const isNight = startMinute >= rules.nightFlightStartHour * 60;
  if (isNight && (!rules.allowNightFlights || !rules.nightBookingWeekdays.includes(day))) fail("Voos noturnos não podem ser marcados neste dia.");
  await validateBlockedSlot(aircraft.$id, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes);
  await validateFlightConflict(registration, date, times.occupiedStartAt, times.occupiedEndAt);
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
  if (rules.requireCreditsForBooking) {
    const credit = await creditAvailable(studentId, aircraft.model_id, isNight, durationMinutes / 60);
    if (!credit.sufficient) fail(`Crédito insuficiente. Disponível: ${credit.availableHours.toFixed(2)}h.`);
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
  const aircraft = await getAircraft(registration);
  const startMinute = parseClock(payload.startTime);
  const times = scheduleTimes(date, payload.startTime, durationMinutes, rules);
  await validateBlockedSlot(aircraft.$id, date, startMinute - rules.bufferBeforeMinutes, startMinute + durationMinutes + rules.bufferAfterMinutes);
  await validateFlightConflict(registration, date, times.occupiedStartAt, times.occupiedEndAt);
  const isNight = startMinute >= rules.nightFlightStartHour * 60;
  const credit = await creditAvailable(studentId, aircraft.model_id, isNight, durationMinutes / 60);
  return {
    available: true,
    creditAvailableHours: credit.availableHours,
    creditSufficient: credit.sufficient,
    presentationTime: times.presentationTime,
    startTime: times.startTime,
    cutoffTime: times.cutoffTime,
    endTime: times.endTime,
  };
}

async function handleConfirm(payload, actorId, actorRole) {
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

async function handleCancel(payload, actorId, actorRole, rules) {
  const id = clean(payload.flightId);
  const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, id);
  const own = doc.student_user_id === actorId;
  if (actorRole === "aluno" && !own) fail("Você só pode cancelar seus próprios voos.", 403);
  const currentStatus = doc.flight_status === "Previsto" ? "Confirmado" : doc.flight_status;
  if (!ACTIVE_STATUSES.includes(currentStatus)) fail("Este voo não pode mais ser cancelado.");
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
  return { flight: publicFlight(updated, actorId, actorRole), penaltyPct, penaltyHours: shouldDebit ? penaltyHours : 0 };
}

module.exports = async ({ req, res, error }) => {
  try {
    if (!DATABASE_ID || !FLIGHTS_ID || !PROFILES_ID || !AIRCRAFTS_ID || !SETTINGS_ID) {
      return response(res, 500, { ok: false, message: "Configuração incompleta da função." });
    }
    const actorId = clean(req.headers["x-appwrite-user-id"]);
    if (!actorId) return response(res, 401, { ok: false, message: "Não autenticado." });
    const payload = req.bodyJson || parseJson(req.body, {});
    const profile = await getProfile(actorId);
    const actorRole = clean(profile.role);
    const rules = await getRules();
    let data;
    if (payload.action === "getCalendar") data = await handleCalendar(payload, actorId, actorRole, rules);
    else if (payload.action === "checkAvailability") data = await handleAvailability(payload, actorId, actorRole, rules);
    else if (payload.action === "requestFlight") data = await handleRequest(payload, actorId, actorRole, profile, rules);
    else if (payload.action === "confirmFlight") data = await handleConfirm(payload, actorId, actorRole);
    else if (payload.action === "cancelFlight") data = await handleCancel(payload, actorId, actorRole, rules);
    else if (payload.action === "previewCancellation") {
      const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_ID, clean(payload.flightId));
      if (actorRole === "aluno" && doc.student_user_id !== actorId) fail("Sem permissão.", 403);
      const hoursBefore = (dateTimeMs(doc.flight_date, doc.presentation_time || doc.start_time) - Date.now()) / 3600000;
      const penaltyPct = penaltyFor(hoursBefore, rules);
      data = { penaltyPct, penaltyHours: Number(((number(doc.requested_duration_minutes, 0) / 60) * penaltyPct / 100).toFixed(2)) };
    } else fail("Ação inválida.");
    return response(res, 200, { ok: true, ...data });
  } catch (err) {
    if (typeof error === "function") error(err?.stack || err?.message || String(err));
    return response(res, err?.status || (err?.code === 404 ? 404 : 500), { ok: false, message: err?.message || "Erro interno." });
  }
};
