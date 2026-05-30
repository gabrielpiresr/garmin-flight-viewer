import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "6a01afae001bc352d1b1";
const SECTIONS_COL_ID = "6a0461a3001603e99577";

if (!API_KEY) {
  console.error("Missing APPWRITE_API_KEY env var.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Checking maneuver_sections collection for exercise_ids attribute...");

  try {
    await db.getAttribute(DATABASE_ID, SECTIONS_COL_ID, "exercise_ids");
    console.log("  • exercise_ids already exists — nothing to do.");
    return;
  } catch {
    // Attribute doesn't exist yet; continue to create it.
  }

  console.log("  Creating exercise_ids (string array, size=36, optional)...");
  await db.createStringAttribute(DATABASE_ID, SECTIONS_COL_ID, "exercise_ids", 36, false, null, true);
  await sleep(1500);
  console.log("  ✓ exercise_ids created successfully.");
  console.log("\nDone. Existing section documents will return exercise_ids=[] until updated.");
}

main().catch((err) => {
  console.error("Migration failed:", err?.message ?? err);
  process.exit(1);
});
