import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, preferredId = ID.unique()) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((collection) => collection.name === name);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, ADMIN_PERMS, true, true);
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const created = await db.createCollection(DATABASE_ID, preferredId, name, ADMIN_PERMS, true, true);
  console.log(`  ✓ Created collection "${name}" (${created.$id})`);
  return created;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(650);
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

async function idx(colId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, colId, key, "key", attributes, orders);
    await sleep(650);
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

async function setupOpeningSignatures() {
  console.log("\n[1/2] logbook_opening_signatures...");
  const col = await ensureCollection("logbook_opening_signatures", "logbook_opening_signatures");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_id", 64, true), "aircraft_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "signer_user_id", 64, true), "signer_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "signed_at", 64, true), "signed_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "user_agent", 512, false), "user_agent");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_hash", 64, false), "content_hash");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "snapshot_json", 4096, true), "snapshot_json");
  await idx(id, "los_aircraft_idx", ["aircraft_id"]);
  await idx(id, "los_aircraft_status_idx", ["aircraft_id", "status"]);
  return id;
}

async function setupDiscrepancies() {
  console.log("\n[2/2] flight_discrepancies...");
  const col = await ensureCollection("flight_discrepancies", "flight_discrepancies");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_ident", 16, true), "aircraft_ident");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "flight_id", 64, true), "flight_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "leg_index", true), "leg_index");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "flight_date", 16, false), "flight_date");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "system", 64, false), "system");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "discrepancy_text", 2048, true), "discrepancy_text");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "canac_reported", 64, false), "canac_reported");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "linked_work_order_id", 64, false), "linked_work_order_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "corrective_action", 2048, false), "corrective_action");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "responsible_canac", 64, false), "responsible_canac");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "pic_canac", 64, false), "pic_canac");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await idx(id, "fd_aircraft_idx", ["aircraft_ident"]);
  await idx(id, "fd_flight_idx", ["flight_id"]);
  await idx(id, "fd_work_order_idx", ["linked_work_order_id"]);
  return id;
}

async function main() {
  console.log("=== Appwrite ANAC Logbook Setup ===");
  const openingSignaturesId = await setupOpeningSignatures();
  const discrepanciesId = await setupDiscrepancies();
  console.log("\n=== Setup Complete ===");
  console.log(`VITE_APPWRITE_LOGBOOK_OPENING_SIGNATURES_COL_ID=${openingSignaturesId}`);
  console.log(`VITE_APPWRITE_FLIGHT_DISCREPANCIES_COL_ID=${discrepanciesId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
