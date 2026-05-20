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

async function listAllCollections() {
  const collections = [];
  let cursor;
  do {
    const queries = ["limit(100)"];
    if (cursor) queries.push(`cursorAfter("${cursor}")`);
    const page = await db.listCollections(DATABASE_ID, queries);
    collections.push(...page.collections);
    cursor = page.collections.at(-1)?.$id;
    if (collections.length >= page.total || page.collections.length === 0) break;
  } while (cursor);
  return collections;
}

async function ensureCollection(name) {
  const list = await listAllCollections();
  const found = list.find((collection) => collection.name === name);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, ADMIN_PERMS, true, true);
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const created = await db.createCollection(DATABASE_ID, ID.unique(), name, ADMIN_PERMS, true, true);
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

async function setupProgramItems() {
  console.log("\n[1/3] maintenance_program_items...");
  const col = await ensureCollection("maintenance_program_items");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_model_id", 64, true), "aircraft_model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "code", 64, true), "code");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 256, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "item_type", 32, true), "item_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "category", 32, true), "category");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "maintenance_area", 32, true), "maintenance_area");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "priority", 32, true), "priority");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 2048, true), "description");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "reference_type", 16, true), "reference_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "reference_document", 512, true), "reference_document");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "recurrence_rules", 2048, true), "recurrence_rules");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "tolerance_rules", 2048, false), "tolerance_rules");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "reference_details_json", 512, false), "reference_details_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "applicability_json", 1024, false), "applicability_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "baseline_json", 1024, false), "baseline_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "checklist_json", 16384, false), "checklist_json");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "grounding_if_overdue", false, false), "grounding_if_overdue");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "block_dispatch", false, false), "block_dispatch");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "requires_release", false, true), "requires_release");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "deleted_at", 64, false), "deleted_at");
  await idx(id, "mpi_model_idx", ["aircraft_model_id"]);
  await idx(id, "mpi_model_code_idx", ["aircraft_model_id", "code"]);
  await idx(id, "mpi_deleted_idx", ["deleted_at"]);
  return id;
}

async function setupWorkOrders() {
  console.log("\n[2/3] maintenance_work_orders...");
  const col = await ensureCollection("maintenance_work_orders");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "work_order_number", 64, true), "work_order_number");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_id", 64, true), "aircraft_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "maintenance_program_item_id", 64, false), "maintenance_program_item_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "work_order_type", 32, true), "work_order_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 32, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "opened_at", 64, true), "opened_at");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "aircraft_ttaf", true), "aircraft_ttaf");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description_performed", 2048, true), "description_performed");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "reference_type", 32, false), "reference_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "reference_document", 512, false), "reference_document");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "mechanic_name", 128, false), "mechanic_name");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "aircraft_released", false, false), "aircraft_released");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "legacy_update", false, false), "legacy_update");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "data_origin", 32, false, "native"), "data_origin");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "legacy_reference", 512, false), "legacy_reference");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "deleted_at", 64, false), "deleted_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "times_json", 2048, false), "times_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "technical_json", 2048, false), "technical_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "mechanic_json", 2048, false), "mechanic_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "release_json", 2048, false), "release_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "migration_json", 2048, false), "migration_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "checklist_execution_json", 32768, false), "checklist_execution_json");
  await idx(id, "mwo_aircraft_idx", ["aircraft_id"]);
  await idx(id, "mwo_opened_idx", ["opened_at"], ["DESC"]);
  await idx(id, "mwo_type_idx", ["work_order_type"]);
  await idx(id, "mwo_status_idx", ["status"]);
  await idx(id, "mwo_origin_idx", ["data_origin"]);
  await idx(id, "mwo_deleted_idx", ["deleted_at"]);
  return id;
}

async function setupAttachments() {
  console.log("\n[3/3] maintenance_attachments...");
  const col = await ensureCollection("maintenance_attachments");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "work_order_id", 64, true), "work_order_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "attachment_type", 32, true), "attachment_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "file_name", 512, true), "file_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "file_url", 2048, true), "file_url");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "uploaded_by", 64, true), "uploaded_by");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "uploaded_at", 64, true), "uploaded_at");
  await idx(id, "matt_work_order_idx", ["work_order_id"]);
  await idx(id, "matt_uploaded_idx", ["uploaded_at"], ["DESC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Maintenance Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}`);
  const programItemsId = await setupProgramItems();
  const workOrdersId = await setupWorkOrders();
  const attachmentsId = await setupAttachments();
  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID=${programItemsId}`);
  console.log(`VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID=${workOrdersId}`);
  console.log(`VITE_APPWRITE_MAINTENANCE_ATTACHMENTS_COL_ID=${attachmentsId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
