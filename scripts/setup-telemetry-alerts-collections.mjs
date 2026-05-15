import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

const ALERT_RULES_ID = process.env.APPWRITE_TELEMETRY_ALERT_RULES_COL_ID || "telemetry_alert_rules";
const FLIGHT_ALERTS_ID = process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID || "flight_telemetry_alerts";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const RULE_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const FLIGHT_ALERT_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.create("users/unverified"),
  Permission.create(Role.label("instrutor")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")),
  Permission.create(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(id, name, permissions) {
  try {
    const existing = await db.getCollection(DATABASE_ID, id);
    const currentPermissions = new Set(existing.$permissions ?? []);
    let changed = false;
    for (const permission of permissions) {
      if (!currentPermissions.has(permission)) {
        currentPermissions.add(permission);
        changed = true;
      }
    }
    if (changed || existing.name !== name || !existing.documentSecurity) {
      await db.updateCollection(DATABASE_ID, id, name, Array.from(currentPermissions), true, existing.enabled);
      console.log(`  ✓ Updated collection "${name}" (${id})`);
    } else {
      console.log(`  • Collection "${name}" already exists (${id})`);
    }
    return existing;
  } catch (error) {
    if (error?.code !== 404) throw error;
    const created = await db.createCollection(DATABASE_ID, id, name, permissions, true, true);
    console.log(`  ✓ Created collection "${name}" (${created.$id})`);
    return created;
  }
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function setupRules() {
  console.log("\n[1/2] telemetry_alert_rules...");
  await ensureCollection(ALERT_RULES_ID, "telemetry_alert_rules", RULE_PERMISSIONS);
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "model_id", 64, true), "model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "name", 128, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "severity", 16, true), "severity");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "phases_json", 512, true), "phases_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "conditions_json", 4096, true), "conditions_json");
  await attr(() => db.createFloatAttribute(DATABASE_ID, ALERT_RULES_ID, "duration_sec", false), "duration_sec");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, ALERT_RULES_ID, "active", true), "active");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "created_by", 64, false), "created_by");
  await attr(() => db.createStringAttribute(DATABASE_ID, ALERT_RULES_ID, "updated_by", 64, false), "updated_by");
  await idx(ALERT_RULES_ID, "alert_rules_model_idx", ["model_id"]);
  await idx(ALERT_RULES_ID, "alert_rules_active_idx", ["active"]);
  await idx(ALERT_RULES_ID, "alert_rules_severity_idx", ["severity"]);
}

async function setupFlightAlerts() {
  console.log("\n[2/2] flight_telemetry_alerts...");
  await ensureCollection(FLIGHT_ALERTS_ID, "flight_telemetry_alerts", FLIGHT_ALERT_PERMISSIONS);
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "flight_id", 64, true), "flight_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "rule_id", 64, true), "rule_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "model_id", 64, true), "model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "student_user_id", 64, true), "student_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "instructor_user_id", 64, false), "instructor_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "aircraft_ident", 64, false), "aircraft_ident");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "flight_date", 10, false), "flight_date");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "start_time", 8, false), "start_time");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "severity", 16, true), "severity");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "rule_name", 128, true), "rule_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "phase", 16, false), "phase");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "matched_at", 64, false), "matched_at");
  await attr(() => db.createFloatAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "duration_sec", false), "duration_sec");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "rule_snapshot_json", 4096, true), "rule_snapshot_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, FLIGHT_ALERTS_ID, "evidence_json", 4096, true), "evidence_json");
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_flight_idx", ["flight_id"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_model_idx", ["model_id"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_severity_idx", ["severity"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_date_idx", ["flight_date"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_student_idx", ["student_user_id"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_instructor_idx", ["instructor_user_id"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_matched_idx", ["matched_at"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_severity_date_idx", ["severity", "flight_date"], ["ASC", "DESC"]);
  await idx(FLIGHT_ALERTS_ID, "flight_alerts_severity_matched_idx", ["severity", "matched_at"], ["ASC", "DESC"]);
}

async function main() {
  console.log("Starting Appwrite telemetry alerts setup...");
  await setupRules();
  await setupFlightAlerts();
  console.log("\nTelemetry alerts setup complete. Frontend defaults use these fixed IDs:");
  console.log(`VITE_APPWRITE_TELEMETRY_ALERT_RULES_COL_ID=${ALERT_RULES_ID}`);
  console.log(`VITE_APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID=${FLIGHT_ALERTS_ID}`);
}

main().catch((error) => {
  console.error("Telemetry alerts setup failed:", error?.message ?? error);
  process.exit(1);
});
