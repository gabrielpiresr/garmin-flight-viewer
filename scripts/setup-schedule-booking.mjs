import fs from "node:fs";
import { Client, Databases, Functions, ID, Permission, Project, Query, Role } from "node-appwrite";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const flightsId = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID;
const platformSettingsId = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const schoolId = process.env.SCHOOL_ID || process.env.VITE_SCHOOL_ID || "escola_principal";

if (!endpoint || !projectId || !apiKey || !databaseId || !flightsId || !platformSettingsId) {
  throw new Error("Configuração Appwrite incompleta.");
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const functions = new Functions(client);
const project = new Project(client);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safe(label, run) {
  try {
    const result = await run();
    console.log(`OK ${label}`);
    await sleep(500);
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`SKIP ${label}`);
      return null;
    }
    throw error;
  }
}

async function ensureCollection(id, name, permissions) {
  try {
    return await databases.getCollection(databaseId, id);
  } catch {
    return databases.createCollection(databaseId, id, name, permissions, true, true);
  }
}

async function waitForAttributes(collectionId, keys) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const attributes = await Promise.all(keys.map((key) => databases.getAttribute(databaseId, collectionId, key).catch(() => null)));
    if (attributes.every((attribute) => attribute?.status === "available")) return;
    const failed = attributes.find((attribute) => attribute?.status === "failed");
    if (failed) throw new Error(`Atributo ${collectionId}.${failed.key} falhou: ${failed.error || "erro desconhecido"}`);
    await sleep(2000);
  }
  throw new Error(`Timeout aguardando atributos de ${collectionId}.`);
}

async function ensureAttribute(collectionId, key, run) {
  try {
    await databases.getAttribute(databaseId, collectionId, key);
    console.log(`SKIP ${collectionId}.${key}`);
  } catch (error) {
    if (Number(error?.code) !== 404) throw error;
    await safe(`${collectionId}.${key}`, run);
  }
}

async function createFlightSchema() {
  const attrs = [
    ["aircraft_model_id", () => databases.createStringAttribute(databaseId, flightsId, "aircraft_model_id", 64, false)],
    ["requested_duration_minutes", () => databases.createIntegerAttribute(databaseId, flightsId, "requested_duration_minutes", false)],
    ["presentation_time", () => databases.createStringAttribute(databaseId, flightsId, "presentation_time", 8, false)],
    ["cutoff_time", () => databases.createStringAttribute(databaseId, flightsId, "cutoff_time", 8, false)],
    ["schedule_end_time", () => databases.createStringAttribute(databaseId, flightsId, "schedule_end_time", 8, false)],
    ["occupied_start_at", () => databases.createDatetimeAttribute(databaseId, flightsId, "occupied_start_at", false)],
    ["occupied_end_at", () => databases.createDatetimeAttribute(databaseId, flightsId, "occupied_end_at", false)],
    ["schedule_origin", () => databases.createStringAttribute(databaseId, flightsId, "schedule_origin", 32, false)],
    ["confirmed_at", () => databases.createDatetimeAttribute(databaseId, flightsId, "confirmed_at", false)],
    ["confirmed_by", () => databases.createStringAttribute(databaseId, flightsId, "confirmed_by", 64, false)],
    ["cancelled_at", () => databases.createDatetimeAttribute(databaseId, flightsId, "cancelled_at", false)],
  ];
  for (const [label, run] of attrs) await ensureAttribute(flightsId, label, run);
  await waitForAttributes(flightsId, attrs.map(([label]) => label));
  await safe("index flights aircraft/date/status", () => databases.createIndex(databaseId, flightsId, "flights_booking_aircraft_idx", "key", ["school_id", "aircraft_ident", "flight_date", "flight_status"], ["ASC", "ASC", "ASC", "ASC"]));
  await safe("index flights student/date/status", () => databases.createIndex(databaseId, flightsId, "flights_booking_student_idx", "key", ["school_id", "student_user_id", "flight_date", "flight_status"], ["ASC", "ASC", "ASC", "ASC"]));
  await safe("index flights occupied", () => databases.createIndex(databaseId, flightsId, "flights_occupied_idx", "key", ["occupied_start_at", "occupied_end_at"], ["ASC", "ASC"]));
}

async function createAuditEvents() {
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.create(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
  ];
  await ensureCollection("schedule_audit_events", "schedule_audit_events", permissions);
  const id = "schedule_audit_events";
  const attrs = [
    ["school_id", () => databases.createStringAttribute(databaseId, id, "school_id", 128, true)],
    ["flight_id", () => databases.createStringAttribute(databaseId, id, "flight_id", 64, true)],
    ["student_user_id", () => databases.createStringAttribute(databaseId, id, "student_user_id", 64, true)],
    ["event_type", () => databases.createStringAttribute(databaseId, id, "event_type", 32, true)],
    ["actor_user_id", () => databases.createStringAttribute(databaseId, id, "actor_user_id", 64, true)],
    ["actor_role", () => databases.createStringAttribute(databaseId, id, "actor_role", 16, true)],
    ["reason", () => databases.createStringAttribute(databaseId, id, "reason", 1024, false)],
    ["penalty_percentage", () => databases.createFloatAttribute(databaseId, id, "penalty_percentage", false)],
    ["penalty_hours", () => databases.createFloatAttribute(databaseId, id, "penalty_hours", false)],
    ["penalty_waived", () => databases.createBooleanAttribute(databaseId, id, "penalty_waived", false)],
    ["occurred_at", () => databases.createDatetimeAttribute(databaseId, id, "occurred_at", true)],
  ];
  for (const [label, run] of attrs) await ensureAttribute(id, label, run);
  await waitForAttributes(id, attrs.map(([label]) => label));
  await safe("index audit flight/type", () => databases.createIndex(databaseId, id, "schedule_audit_flight_type_idx", "unique", ["flight_id", "event_type"], ["ASC", "ASC"]));
  await safe("index audit student/date", () => databases.createIndex(databaseId, id, "schedule_audit_student_date_idx", "key", ["student_user_id", "occurred_at"], ["ASC", "DESC"]));
}

async function createAdjustments() {
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.create(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
  ];
  await ensureCollection("credit_adjustments", "credit_adjustments", permissions);
  const id = "credit_adjustments";
  const attrs = [
    ["school_id", () => databases.createStringAttribute(databaseId, id, "school_id", 128, true)],
    ["student_user_id", () => databases.createStringAttribute(databaseId, id, "student_user_id", 64, true)],
    ["aircraft_model_id", () => databases.createStringAttribute(databaseId, id, "aircraft_model_id", 64, true)],
    ["aircraft_ident", () => databases.createStringAttribute(databaseId, id, "aircraft_ident", 32, false)],
    ["flight_id", () => databases.createStringAttribute(databaseId, id, "flight_id", 64, false)],
    ["adjustment_type", () => databases.createStringAttribute(databaseId, id, "adjustment_type", 32, true)],
    ["hours", () => databases.createFloatAttribute(databaseId, id, "hours", true)],
    ["percentage", () => databases.createFloatAttribute(databaseId, id, "percentage", false)],
    ["is_night", () => databases.createBooleanAttribute(databaseId, id, "is_night", false)],
    ["reason", () => databases.createStringAttribute(databaseId, id, "reason", 1024, false)],
    ["flight_date", () => databases.createStringAttribute(databaseId, id, "flight_date", 10, false)],
    ["flight_start_time", () => databases.createStringAttribute(databaseId, id, "flight_start_time", 8, false)],
    ["created_by", () => databases.createStringAttribute(databaseId, id, "created_by", 64, false)],
    ["occurred_at", () => databases.createDatetimeAttribute(databaseId, id, "occurred_at", true)],
  ];
  for (const [label, run] of attrs) await ensureAttribute(id, label, run);
  await waitForAttributes(id, attrs.map(([label]) => label));
  await safe("index adjustments student/model", () => databases.createIndex(databaseId, id, "adjustments_student_model_idx", "key", ["student_user_id", "aircraft_model_id"], ["ASC", "ASC"]));
  await safe("index adjustments flight", () => databases.createIndex(databaseId, id, "adjustments_flight_idx", "unique", ["flight_id"], ["ASC"]));
  await safe("index adjustments occurred", () => databases.createIndex(databaseId, id, "adjustments_occurred_idx", "key", ["occurred_at"], ["DESC"]));
}

async function createLocks() {
  await ensureCollection("schedule_slot_locks", "schedule_slot_locks", [], false);
  const id = "schedule_slot_locks";
  const attrs = [
    ["school_id", () => databases.createStringAttribute(databaseId, id, "school_id", 128, true)],
    ["aircraft_ident", () => databases.createStringAttribute(databaseId, id, "aircraft_ident", 32, true)],
    ["flight_date", () => databases.createStringAttribute(databaseId, id, "flight_date", 10, true)],
    ["slot_minute", () => databases.createIntegerAttribute(databaseId, id, "slot_minute", true)],
    ["flight_id", () => databases.createStringAttribute(databaseId, id, "flight_id", 64, true)],
    ["student_user_id", () => databases.createStringAttribute(databaseId, id, "student_user_id", 64, true)],
  ];
  for (const [label, run] of attrs) await ensureAttribute(id, label, run);
  await waitForAttributes(id, attrs.map(([label]) => label));
  await safe("index locks flight", () => databases.createIndex(databaseId, id, "slot_locks_flight_idx", "key", ["flight_id"], ["ASC"]));
  await safe("index locks aircraft/date", () => databases.createIndex(databaseId, id, "slot_locks_aircraft_date_idx", "key", ["school_id", "aircraft_ident", "flight_date"], ["ASC", "ASC", "ASC"]));
}

async function updateRules() {
  const result = await databases.listDocuments(databaseId, platformSettingsId, [
    Query.equal("key", ["schoolRules"]),
    Query.limit(1),
  ]);
  const current = result.documents[0];
  const body = current ? JSON.parse(current.settings_json || "{}") : {};
  body.studentTabs = { ...(body.studentTabs || {}), schedule: true };
  body.schedule = {
    mode: "intentions",
    bufferBeforeMinutes: 30,
    bufferAfterMinutes: 15,
    slotMinutes: 30,
    weekdayMinHours: body.schedule?.minRequestHours ?? 1,
    weekdayMaxHours: body.schedule?.maxRequestHours ?? 4,
    weekendMinHours: body.schedule?.minRequestHours ?? 1,
    weekendMaxHours: body.schedule?.maxRequestHours ?? 4,
    weekdayMaxFlightsPerDay: null,
    weekendMaxFlightsPerDay: null,
    requireCreditsForBooking: false,
    nightBookingWeekdays: [],
    cancellationPenalty48hPct: 0,
    cancellationPenalty24hPct: 0,
    cancellationPenalty12hPct: 0,
    cancellationPenalty1hPct: 0,
    autoDebitCancellationPenalty: false,
    minBookingLeadDays: 0,
    maxBookingLeadDays: 365,
    ...(body.schedule || {}),
  };
  const data = { key: "schoolRules", settings_json: JSON.stringify(body) };
  if (current) await databases.updateDocument(databaseId, platformSettingsId, current.$id, data);
  else await databases.createDocument(databaseId, platformSettingsId, ID.unique(), data, [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ]);
  console.log("OK schoolRules");
}

async function migrateStatuses() {
  let updated = 0;
  while (true) {
    const result = await databases.listDocuments(databaseId, flightsId, [
      Query.equal("flight_status", ["Previsto"]),
      Query.limit(100),
    ]);
    if (!result.documents.length) break;
    for (const doc of result.documents) {
      await databases.updateDocument(databaseId, flightsId, doc.$id, { flight_status: "Confirmado" });
      updated += 1;
    }
  }
  console.log(`OK status backfill (${updated})`);
}

async function updateRoles() {
  const configuredId = process.env.VITE_APPWRITE_TENANT_ROLES_COL_ID;
  const roles = configuredId
    ? await databases.getCollection(databaseId, configuredId).catch(() => null)
    : (await databases.listCollections(databaseId, [Query.limit(100)])).collections.find((item) => item.name === "tenant_roles");
  if (!roles) return;
  const documents = await databases.listDocuments(databaseId, roles.$id, [Query.limit(500)]);
  for (const doc of documents.documents) {
    const permissions = JSON.parse(doc.permissions_json || '{"tabs":{},"actions":{}}');
    permissions.tabs ||= {};
    if (doc.portal_type === "aluno") permissions.tabs.schedule = permissions.tabs.schedule ?? true;
    if (doc.portal_type === "admin") {
      permissions.tabs.schedule = permissions.tabs.schedule ?? true;
      permissions.tabs["schedule.configuracoes"] = permissions.tabs["schedule.configuracoes"] ?? true;
    }
    await databases.updateDocument(databaseId, roles.$id, doc.$id, {
      permissions_json: JSON.stringify(permissions),
      updated_at: new Date().toISOString(),
    });
  }
  console.log(`OK tenant roles (${documents.total})`);
}

async function ensureFunction() {
  try {
    return await functions.get({ functionId: "schedule-booking" });
  } catch {
    return functions.create({
      functionId: "schedule-booking",
      name: "Schedule Booking",
      runtime: "node-22",
      execute: ["users"],
      timeout: 30,
      enabled: true,
      logging: true,
      entrypoint: "src/main.js",
      commands: "npm install",
      scopes: ["databases.read", "databases.write"],
    });
  }
}

async function ensureRuntimeDatabaseKey() {
  const variables = await functions.listVariables({ functionId: "schedule-booking" });
  const keyId = "schedule-booking-runtime";
  const keys = await project.listKeys();
  const stale = keys.keys.find((item) => item.$id === keyId || item.name === "Schedule Booking Runtime");
  const scopes = ["documents.read", "documents.write"];
  if (stale && variables.variables.some((item) => item.key === "APPWRITE_API_KEY")) {
    await project.updateKey({ keyId: stale.$id, name: "Schedule Booking Runtime", scopes });
    console.log("OK escopos da chave técnica da função");
    return;
  }
  if (stale) await project.deleteKey({ keyId: stale.$id });
  const runtimeKey = await project.createKey({
    keyId,
    name: "Schedule Booking Runtime",
    scopes,
  });
  await functions.createVariable({
    functionId: "schedule-booking",
    variableId: "runtime-database-key",
    key: "APPWRITE_API_KEY",
    value: runtimeKey.secret,
    secret: true,
  });
  console.log("OK chave técnica restrita da função");
}

await createFlightSchema();
await createAuditEvents();
await createAdjustments();
await createLocks();
await updateRules();
await migrateStatuses();
await updateRoles();
await ensureFunction();
await ensureRuntimeDatabaseKey();
console.log("Setup da escala concluído.");
