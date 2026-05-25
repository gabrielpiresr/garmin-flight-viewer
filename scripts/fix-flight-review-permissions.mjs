/**
 * Adds Permission.delete("label:instrutor") to the two flight-review
 * collections that were created without it.
 *
 * Usage:
 *   APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
 *   APPWRITE_DATABASE_ID=... \
 *   FLIGHT_MANEUVERS_COL_ID=6a1464e300079d599e22 \
 *   FLIGHT_MANEUVER_REVIEWS_COL_ID=6a1464f40014e9bd5f5b \
 *   node scripts/fix-flight-review-permissions.mjs
 */
import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "6a01afae001bc352d1b1";
const MANEUVERS_COL = process.env.FLIGHT_MANEUVERS_COL_ID ?? "6a1464e300079d599e22";
const REVIEWS_COL = process.env.FLIGHT_MANEUVER_REVIEWS_COL_ID ?? "6a1464f40014e9bd5f5b";

if (!API_KEY) {
  console.error("Missing APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const FLIGHT_MANEUVER_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")), // <- was missing
];

async function fix(colId, name) {
  console.log(`\nUpdating permissions for: ${name} (${colId})`);
  const col = await db.getCollection(DATABASE_ID, colId);
  await db.updateCollection(DATABASE_ID, colId, col.name, FLIGHT_MANEUVER_PERMS);
  console.log(`  ✓ Done`);
}

try {
  await fix(MANEUVERS_COL, "flight_maneuvers");
  await fix(REVIEWS_COL, "flight_maneuver_reviews");
  console.log("\nAll permissions updated. Instructors can now delete maneuvers.");
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
