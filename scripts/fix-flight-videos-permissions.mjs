import { Client, Databases, Permission, Query, Role } from "node-appwrite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, "../.env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = process.env[key] || val;
    if (key.startsWith("VITE_")) process.env[key.slice(5)] = process.env[key.slice(5)] || val;
  }
}

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID
  || process.env.APPWRITE_COLLECTION_ID
  || "6a01afb1002232d33950";
const VIDEOS_COLLECTION_ID = process.env.APPWRITE_VIDEOS_COLLECTION_ID;
const DRY_RUN = !process.argv.includes("--confirm");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !VIDEOS_COLLECTION_ID || !FLIGHTS_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, " +
      "APPWRITE_VIDEOS_COLLECTION_ID or APPWRITE_FLIGHTS_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildVideoPermissions(video, flight) {
  const uploadedBy = String(video.uploaded_by || "").trim();
  const studentUserId = String(flight?.student_user_id || flight?.user_id || "").trim();
  const instructorUserId = String(flight?.instructor_user_id || "").trim();

  const permissions = [
    Permission.read(Role.users()),
    Permission.read(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
    uploadedBy ? Permission.read(Role.user(uploadedBy)) : "",
    studentUserId ? Permission.read(Role.user(studentUserId)) : "",
    instructorUserId ? Permission.read(Role.user(instructorUserId)) : "",
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    uploadedBy ? Permission.update(Role.user(uploadedBy)) : "",
    uploadedBy ? Permission.delete(Role.user(uploadedBy)) : "",
  ];

  return unique(permissions);
}

async function listAll(collectionId, queriesForPage) {
  const docs = [];
  let cursor = null;
  while (true) {
    const queries = [Query.limit(100), ...queriesForPage()];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DATABASE_ID, collectionId, queries);
    docs.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents.at(-1).$id;
  }
  return docs;
}

async function getFlight(flightId, cache) {
  if (!flightId) return null;
  if (cache.has(flightId)) return cache.get(flightId);
  try {
    const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, [
      Query.select(["$id", "student_user_id", "instructor_user_id", "user_id"]),
    ]);
    cache.set(flightId, flight);
    return flight;
  } catch {
    cache.set(flightId, null);
    return null;
  }
}

async function updateCollectionPermissions() {
  const current = await databases.getCollection(DATABASE_ID, VIDEOS_COLLECTION_ID);
  const permissions = [
    Permission.create(Role.users()),
    Permission.read(Role.users()),
    Permission.create(Role.label("admin")),
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.create(Role.label("instrutor")),
    Permission.read(Role.label("instrutor")),
  ];

  if (DRY_RUN) return permissions;

  await databases.updateCollection(
    DATABASE_ID,
    VIDEOS_COLLECTION_ID,
    current.name,
    unique(permissions),
    current.documentSecurity,
    current.enabled,
  );
  return permissions;
}

async function run() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`);

  const collectionPermissions = await updateCollectionPermissions();
  console.log("Target collection permissions:");
  for (const permission of collectionPermissions) console.log(`- ${permission}`);

  const videos = await listAll(VIDEOS_COLLECTION_ID, () => [
    Query.select(["$id", "$permissions", "flight_id", "uploaded_by"]),
  ]);
  const flightCache = new Map();
  let updated = 0;
  let skipped = 0;
  let missingFlight = 0;

  for (const video of videos) {
    const flight = await getFlight(String(video.flight_id || ""), flightCache);
    if (!flight) missingFlight += 1;

    const nextPermissions = buildVideoPermissions(video, flight);
    const currentPermissions = video.$permissions || [];
    const same =
      currentPermissions.length === nextPermissions.length &&
      nextPermissions.every((permission) => currentPermissions.includes(permission));

    if (same) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (!DRY_RUN) {
      await databases.updateDocument(DATABASE_ID, VIDEOS_COLLECTION_ID, video.$id, {}, nextPermissions);
    }
  }

  console.log(`Videos scanned: ${videos.length}`);
  console.log(`Videos ${DRY_RUN ? "to update" : "updated"}: ${updated}`);
  console.log(`Videos already OK: ${skipped}`);
  console.log(`Videos without readable flight link: ${missingFlight}`);
}

run().catch((error) => {
  console.error("Failed:", error?.message ?? error);
  process.exit(1);
});
