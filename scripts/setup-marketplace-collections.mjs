import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Query, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function readEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
      const index = line.indexOf("=");
      if (index <= 0 || line.trim().startsWith("#")) return [];
      return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
    }),
  );
}

function upsertEnvLocal(entries) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const map = new Map();
  for (const [key, value] of Object.entries(entries)) map.set(key, value);
  const next = lines.map((line) => {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) return line;
    const key = line.slice(0, index).trim();
    if (!map.has(key)) return line;
    const value = map.get(key);
    map.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of map.entries()) next.push(`${key}=${value}`);
  const body = `${next.filter((line, idx, arr) => !(line === "" && arr[idx - 1] === "")).join("\n").replace(/\n*$/, "\n")}`;
  fs.writeFileSync(envPath, body, "utf8");
}

const env = readEnv();
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const CATEGORIES_ID =
  process.env.APPWRITE_MARKETPLACE_CATEGORIES_COL_ID ||
  env.VITE_APPWRITE_MARKETPLACE_CATEGORIES_COL_ID ||
  "marketplace_categories";
const PRODUCTS_ID =
  process.env.APPWRITE_MARKETPLACE_PRODUCTS_COL_ID ||
  env.VITE_APPWRITE_MARKETPLACE_PRODUCTS_COL_ID ||
  "marketplace_products";
const ORDERS_ID =
  process.env.APPWRITE_MARKETPLACE_ORDERS_COL_ID ||
  env.VITE_APPWRITE_MARKETPLACE_ORDERS_COL_ID ||
  "marketplace_orders";
const SETTINGS_ID =
  process.env.APPWRITE_PLATFORM_SETTINGS_COL_ID ||
  env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID ||
  env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID ||
  "platform_settings";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT (or VITE_*), APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const CATALOG_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const ORDER_PERMS = [
  Permission.read(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(id, name, permissions, documentSecurity = true) {
  try {
    const col = await db.getCollection(DATABASE_ID, id);
    await db.updateCollection(DATABASE_ID, id, col.name || name, permissions, documentSecurity, true);
    console.log(`  - Collection already exists (${id}); permissions updated`);
    return col;
  } catch (error) {
    const msg = (error?.message ?? String(error)).toLowerCase();
    if (!msg.includes("not found") && !msg.includes("could not be found")) throw error;
  }
  const col = await db.createCollection(DATABASE_ID, id, name, permissions, documentSecurity, true);
  console.log(`  + Created collection ${name} (${col.$id})`);
  return col;
}

async function attr(collectionId, createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     + ${label}`);
  } catch (error) {
    const msg = (error?.message ?? String(error)).toLowerCase();
    if (msg.includes("already exists")) {
      console.log(`     - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function dropAttr(collectionId, key) {
  try {
    await db.deleteAttribute(DATABASE_ID, collectionId, key);
    await sleep(900);
    console.log(`     x dropped ${key}`);
  } catch (error) {
    const msg = (error?.message ?? String(error)).toLowerCase();
    if (msg.includes("not found") || msg.includes("could not be found")) {
      console.log(`     - ${key} already absent`);
      return;
    }
    console.log(`     ! could not drop ${key}: ${error?.message || error}`);
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     + index ${key}`);
  } catch (error) {
    const msg = (error?.message ?? String(error)).toLowerCase();
    if (msg.includes("already exists")) {
      console.log(`     - index ${key} already exists`);
      return;
    }
    throw error;
  }
}

async function ensureMarketplaceSettingsDoc() {
  try {
    const page = await db.listDocuments(DATABASE_ID, SETTINGS_ID, [Query.equal("key", ["marketplace"]), Query.limit(1)]);
    if (page.documents?.length) {
      console.log("  - platform_settings key=marketplace already exists");
      return;
    }
  } catch {
    // fall through
  }
  try {
    await db.createDocument(
      DATABASE_ID,
      SETTINGS_ID,
      "marketplace",
      {
        key: "marketplace",
        settings_json: JSON.stringify({
          enabled: false,
          storeTitle: "Marketplace",
          storeSubtitle: "Produtos e serviços da escola",
        }),
      },
      [
        Permission.read(Role.users()),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ],
    );
    console.log("  + Created platform_settings key=marketplace (enabled=false)");
  } catch (error) {
    console.log(`  ! Could not create marketplace settings doc: ${error?.message || error}`);
  }
}

async function setupCategories() {
  console.log("\n-- marketplace_categories --");
  await ensureCollection(CATEGORIES_ID, "marketplace_categories", CATALOG_PERMS);
  await attr(CATEGORIES_ID, () => db.createStringAttribute(DATABASE_ID, CATEGORIES_ID, "school_id", 64, true), "school_id");
  await attr(CATEGORIES_ID, () => db.createStringAttribute(DATABASE_ID, CATEGORIES_ID, "name", 120, true), "name");
  await attr(CATEGORIES_ID, () => db.createStringAttribute(DATABASE_ID, CATEGORIES_ID, "slug", 120, true), "slug");
  await attr(CATEGORIES_ID, () => db.createIntegerAttribute(DATABASE_ID, CATEGORIES_ID, "sort_order", false, 0), "sort_order");
  await attr(CATEGORIES_ID, () => db.createBooleanAttribute(DATABASE_ID, CATEGORIES_ID, "active", false, true), "active");
  await attr(CATEGORIES_ID, () => db.createStringAttribute(DATABASE_ID, CATEGORIES_ID, "deleted_at", 40, false), "deleted_at");
  await idx(CATEGORIES_ID, "mp_cat_school_idx", ["school_id"]);
  await idx(CATEGORIES_ID, "mp_cat_active_idx", ["school_id", "active"]);
}

async function setupProducts() {
  console.log("\n-- marketplace_products (lean schema) --");
  await ensureCollection(PRODUCTS_ID, "marketplace_products", CATALOG_PERMS);

  // Free slot budget: drop bulky/legacy attrs from the partial first run.
  for (const key of [
    "short_description",
    "description",
    "kind",
    "frc_discount_percent",
    "frc_payment_url",
    "cakto_offer_id",
    "frc_cakto_offer_id",
    "variants_json",
    "attributes_json",
    "images_json",
  ]) {
    await dropAttr(PRODUCTS_ID, key);
  }

  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "school_id", 64, true), "school_id");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "category_id", 64, true), "category_id");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "name", 180, true), "name");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "slug", 180, true), "slug");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "payment_mode", 32, true), "payment_mode");
  await attr(PRODUCTS_ID, () => db.createFloatAttribute(DATABASE_ID, PRODUCTS_ID, "price", false, 0), "price");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "payment_url", 2000, true), "payment_url");
  await attr(PRODUCTS_ID, () => db.createBooleanAttribute(DATABASE_ID, PRODUCTS_ID, "track_stock", false, false), "track_stock");
  await attr(PRODUCTS_ID, () => db.createIntegerAttribute(DATABASE_ID, PRODUCTS_ID, "stock", false), "stock");
  await attr(PRODUCTS_ID, () => db.createBooleanAttribute(DATABASE_ID, PRODUCTS_ID, "featured", false, false), "featured");
  await attr(PRODUCTS_ID, () => db.createBooleanAttribute(DATABASE_ID, PRODUCTS_ID, "active", false, true), "active");
  await attr(PRODUCTS_ID, () => db.createIntegerAttribute(DATABASE_ID, PRODUCTS_ID, "sort_order", false, 0), "sort_order");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "deleted_at", 40, false), "deleted_at");
  await attr(PRODUCTS_ID, () => db.createStringAttribute(DATABASE_ID, PRODUCTS_ID, "details_json", 8000, false), "details_json");
  await idx(PRODUCTS_ID, "mp_prod_school_idx", ["school_id"]);
  await idx(PRODUCTS_ID, "mp_prod_cat_idx", ["school_id", "category_id"]);
  await idx(PRODUCTS_ID, "mp_prod_active_idx", ["school_id", "active"]);
}

async function setupOrders() {
  console.log("\n-- marketplace_orders (lean schema) --");
  await ensureCollection(ORDERS_ID, "marketplace_orders", ORDER_PERMS);
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "school_id", 64, true), "school_id");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "product_id", 64, true), "product_id");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "buyer_user_id", 64, true), "buyer_user_id");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "buyer_email", 254, true), "buyer_email");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "cakto_offer_id", 120, false), "cakto_offer_id");
  await attr(ORDERS_ID, () => db.createFloatAttribute(DATABASE_ID, ORDERS_ID, "amount", false, 0), "amount");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "status", 32, true), "status");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "paid_at", 40, false), "paid_at");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "admin_notes", 4000, false), "admin_notes");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "cakto_receipt_id", 64, false), "cakto_receipt_id");
  await attr(ORDERS_ID, () => db.createStringAttribute(DATABASE_ID, ORDERS_ID, "snapshot_json", 8000, false), "snapshot_json");
  await idx(ORDERS_ID, "mp_ord_school_idx", ["school_id"]);
  await idx(ORDERS_ID, "mp_ord_buyer_idx", ["buyer_user_id"]);
  await idx(ORDERS_ID, "mp_ord_status_idx", ["school_id", "status"]);
  await idx(ORDERS_ID, "mp_ord_offer_idx", ["cakto_offer_id", "status"]);
  await idx(ORDERS_ID, "mp_ord_email_idx", ["buyer_email", "status"]);
}

async function main() {
  console.log("=== Appwrite Marketplace Collections Setup ===");
  await setupCategories();
  await setupProducts();
  await setupOrders();
  await ensureMarketplaceSettingsDoc();
  upsertEnvLocal({
    VITE_APPWRITE_MARKETPLACE_CATEGORIES_COL_ID: CATEGORIES_ID,
    VITE_APPWRITE_MARKETPLACE_PRODUCTS_COL_ID: PRODUCTS_ID,
    VITE_APPWRITE_MARKETPLACE_ORDERS_COL_ID: ORDERS_ID,
  });
  console.log("\nUpdated .env.local with marketplace collection IDs.");
  console.log("Store default: DISABLED (enabled=false). Enable in Admin › Marketplace › Configurações.");
  console.log("Student/instructor tabs: OFF by default.");
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
