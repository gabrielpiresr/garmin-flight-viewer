import { readFileSync, existsSync } from "node:fs";
import { Client, Databases, Permission, Query, Role, Users } from "node-appwrite";

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const ROLE_PRIORITY = ["admin", "instrutor", "aluno"];
const APPLY = process.argv.includes("--apply");

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

function env(name, fallbackName) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
}

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = env("APPWRITE_API_KEY", "VITE_APPWRITE_API_KEY");
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");
const PROFILES_COLLECTION_ID = env("APPWRITE_PROFILES_COLLECTION_ID", "VITE_APPWRITE_PROFILES_COLLECTION_ID");
const TENANT_ROLES_COLLECTION_ID = env("APPWRITE_TENANT_ROLES_COL_ID", "VITE_APPWRITE_TENANT_ROLES_COL_ID");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_PROFILES_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const users = new Users(client);

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeRole(value) {
  const role = cleanString(value);
  return VALID_ROLES.has(role) ? role : "aluno";
}

function normalizeSlugList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .filter((slug, index, arr) => arr.indexOf(slug) === index);
}

function parseRoleCustomSlugsJson(profile) {
  const raw = profile?.role_custom_slugs_json;
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getEffectiveRole(profile) {
  return normalizeRole(cleanString(profile?.active_role) || cleanString(profile?.role));
}

function normalizeRoleList(value, fallback = "aluno") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(String(item)))
      .filter((role, index, arr) => arr.indexOf(role) === index);
    if (roles.length > 0) return roles;
  }
  if (typeof value === "string" && value.trim()) return [normalizeRole(value)];
  return [normalizeRole(fallback)];
}

function pickDefaultActiveSlug(slugs) {
  for (const portal of ROLE_PRIORITY) {
    const match = slugs.find((slug) => slug === portal);
    if (match) return match;
  }
  return slugs[0] || "aluno";
}

function parseProfileRoles(profile) {
  const legacyRole = normalizeRole(profile?.role);
  const roles = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? normalizeRoleList(profile.roles, legacyRole)
    : [legacyRole];
  const activeCandidate = getEffectiveRole(profile);
  const activeRole = roles.includes(activeCandidate)
    ? activeCandidate
    : roles.find((role) => role === "admin") || roles.find((role) => role === "instrutor") || roles[0] || "aluno";
  return { roles, activeRole };
}

function parseAssignedRoleSlugs(profile) {
  if (Array.isArray(profile?.assigned_role_slugs) && profile.assigned_role_slugs.length > 0) {
    return normalizeSlugList(profile.assigned_role_slugs);
  }
  if (Array.isArray(profile?.roles) && profile.roles.length > 0) {
    const slugs = normalizeSlugList(profile.roles);
    if (slugs.length > 0) return slugs;
  }
  const { roles } = parseProfileRoles(profile);
  const slugsMap = parseRoleCustomSlugsJson(profile);
  return roles.map((portal) => slugsMap[portal] || portal);
}

function parseActiveRoleSlug(profile, assignedSlugs) {
  const explicit = cleanString(profile?.active_role_slug);
  if (explicit && assignedSlugs.includes(explicit)) return explicit;
  const activePortal = getEffectiveRole(profile);
  const slugsMap = parseRoleCustomSlugsJson(profile);
  const mapped = slugsMap[activePortal];
  if (mapped && assignedSlugs.includes(mapped)) return mapped;
  if (assignedSlugs.includes(activePortal)) return activePortal;
  return pickDefaultActiveSlug(assignedSlugs);
}

async function listAllDocuments(collectionId, queries = []) {
  const out = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(limit),
      Query.offset(offset),
    ]);
    out.push(...res.documents);
    if (res.documents.length < limit || out.length >= res.total) break;
  }
  return out;
}

async function listAllUsers() {
  const out = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const res = await users.list({ queries: [Query.limit(limit), Query.offset(offset)], total: true });
    out.push(...res.users);
    if (res.users.length < limit || out.length >= res.total) break;
  }
  return out;
}

async function loadTenantRolePortals() {
  const portals = new Map();
  for (const role of VALID_ROLES) portals.set(role, role);
  if (!TENANT_ROLES_COLLECTION_ID) return portals;
  try {
    const docs = await listAllDocuments(TENANT_ROLES_COLLECTION_ID);
    for (const doc of docs) {
      const slug = cleanString(doc.slug);
      const portal = cleanString(doc.portal_type);
      if (slug && VALID_ROLES.has(portal)) portals.set(slug, portal);
    }
  } catch (error) {
    console.warn(`Could not read tenant roles: ${error?.message || error}`);
  }
  return portals;
}

async function syncAuthLabels() {
  const [profiles, authUsers, rolePortals] = await Promise.all([
    listAllDocuments(PROFILES_COLLECTION_ID),
    listAllUsers(),
    loadTenantRolePortals(),
  ]);
  const authById = new Map(authUsers.map((user) => [user.$id, user]));
  const changes = [];

  for (const profile of profiles) {
    const userId = cleanString(profile.user_id);
    if (!userId) continue;
    const authUser = authById.get(userId);
    if (!authUser) continue;
    const assignedSlugs = parseAssignedRoleSlugs(profile);
    const activeSlug = parseActiveRoleSlug(profile, assignedSlugs);
    const activePortal = rolePortals.get(activeSlug) || normalizeRole(profile.active_role || profile.role);
    const currentLabels = authUser.labels || [];
    const nextLabels = Array.from(
      new Set([
        ...currentLabels.filter((label) => !VALID_ROLES.has(String(label).toLowerCase())),
        activePortal,
      ]),
    );
    const changed =
      nextLabels.length !== currentLabels.length ||
      nextLabels.some((label) => !currentLabels.includes(label));
    if (!changed) continue;
    changes.push({ userId, email: authUser.email, activeSlug, activePortal, currentLabels, nextLabels });
    if (APPLY) await users.updateLabels({ userId, labels: nextLabels });
  }

  return changes;
}

function adminCollectionPermissions() {
  return [
    Permission.create(Role.label("admin")),
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function adminDocumentPermissions() {
  return [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function collectionTargets() {
  return [
    ["aircraft_horimeter_corrections", env("APPWRITE_AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID", "VITE_APPWRITE_AIRCRAFT_HORIMETER_CORRECTIONS_COL_ID") || "aircraft_horimeter_corrections"],
    ["aircrafts", env("APPWRITE_AIRCRAFTS_COL_ID", "VITE_APPWRITE_AIRCRAFTS_COL_ID") || "aircrafts"],
    ["aircraft_models", env("APPWRITE_AIRCRAFT_MODELS_COL_ID", "VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID") || "aircraft_models"],
    ["aircraft_model_maintenance_rules", env("APPWRITE_MAINTENANCE_RULES_COL_ID", "VITE_APPWRITE_MAINTENANCE_RULES_COL_ID") || "aircraft_model_maintenance_rules"],
    ["aircraft_operational_weeks", env("APPWRITE_OP_WEEKS_COL_ID", "VITE_APPWRITE_OP_WEEKS_COL_ID") || "aircraft_operational_weeks"],
    ["telemetry_alert_rules", env("APPWRITE_TELEMETRY_ALERT_RULES_COL_ID", "VITE_APPWRITE_TELEMETRY_ALERT_RULES_COL_ID") || "telemetry_alert_rules"],
  ];
}

async function resolveCollection(identifier, collections) {
  return collections.find((col) => col.$id === identifier || col.name === identifier) || null;
}

async function repairCollectionsAndDocs() {
  const collections = (await databases.listCollections(DATABASE_ID, [Query.limit(5000)])).collections;
  const results = [];
  for (const [label, identifier] of collectionTargets()) {
    const collection = await resolveCollection(identifier, collections);
    if (!collection) {
      results.push({ label, status: "missing" });
      continue;
    }

    const requiredCollectionPerms = adminCollectionPermissions();
    const nextCollectionPerms = Array.from(new Set([...(collection.$permissions || []), ...requiredCollectionPerms]));
    const collectionChanged = nextCollectionPerms.length !== (collection.$permissions || []).length;
    if (collectionChanged && APPLY) {
      await databases.updateCollection(
        DATABASE_ID,
        collection.$id,
        collection.name,
        nextCollectionPerms,
        collection.documentSecurity ?? true,
        collection.enabled ?? true,
      );
    }

    const docs = await listAllDocuments(collection.$id);
    let docsChanged = 0;
    for (const doc of docs) {
      const nextDocPerms = Array.from(new Set([...(doc.$permissions || []), ...adminDocumentPermissions()]));
      if (nextDocPerms.length === (doc.$permissions || []).length) continue;
      docsChanged += 1;
      if (APPLY) await databases.updateDocument(DATABASE_ID, collection.$id, doc.$id, {}, nextDocPerms);
    }

    results.push({
      label,
      id: collection.$id,
      collectionChanged,
      documents: docs.length,
      docsChanged,
    });
  }
  return results;
}

console.log(`=== Admin permission repair (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
const labelChanges = await syncAuthLabels();
console.log(`\nAuth labels to sync: ${labelChanges.length}`);
for (const item of labelChanges.slice(0, 25)) {
  console.log(`  - ${item.email || item.userId}: ${item.currentLabels.join(",") || "(none)"} -> ${item.nextLabels.join(",")} [active ${item.activeSlug}]`);
}
if (labelChanges.length > 25) console.log(`  ... ${labelChanges.length - 25} more`);

const collectionResults = await repairCollectionsAndDocs();
console.log("\nCollection/document ACL:");
for (const result of collectionResults) {
  if (result.status === "missing") {
    console.log(`  - ${result.label}: collection not found`);
  } else {
    console.log(
      `  - ${result.label}: collection ${result.collectionChanged ? "needs admin perms" : "ok"}, ` +
        `${result.docsChanged}/${result.documents} docs need admin ACL`,
    );
  }
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to update labels and permissions.");
}
