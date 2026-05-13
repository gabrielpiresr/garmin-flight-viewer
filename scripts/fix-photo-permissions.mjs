const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const AIRCRAFTS_COLLECTION_ID =
  process.env.APPWRITE_AIRCRAFTS_COLLECTION_ID || process.env.VITE_APPWRITE_AIRCRAFTS_COL_ID;
const PROFILES_COLLECTION_ID =
  process.env.APPWRITE_PROFILES_COLLECTION_ID || process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const FALLBACK_BUCKET_ID = process.env.APPWRITE_BUCKET_ID || process.env.VITE_APPWRITE_BUCKET_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || process.env.VITE_ADMIN_USER_ID;
const AIRCRAFT_DOCUMENT_ID = process.env.APPWRITE_AIRCRAFT_DOCUMENT_ID;

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const endpoint = ENDPOINT.replace(/\/+$/, "");

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function adminUserPermissions(actions) {
  if (!ADMIN_USER_ID) return [];
  return actions.map((action) => `${action}("user:${ADMIN_USER_ID}")`);
}

function aircraftCollectionPermissions() {
  return unique([
    'read("label:admin")',
    'read("label:instrutor")',
    'create("label:admin")',
    'update("label:admin")',
    'delete("label:admin")',
    ...adminUserPermissions(["read", "create", "update", "delete"]),
  ]);
}

function aircraftDocumentPermissions() {
  return unique([
    'read("label:admin")',
    'read("label:instrutor")',
    'update("label:admin")',
    'delete("label:admin")',
    ...adminUserPermissions(["read", "update", "delete"]),
  ]);
}

function aircraftPhotoPermissions() {
  return unique([
    'read("any")',
    'update("label:admin")',
    'delete("label:admin")',
    ...adminUserPermissions(["update", "delete"]),
  ]);
}

function profileCollectionPermissions() {
  return [
    'read("users")',
    'read("label:instrutor")',
    'read("label:admin")',
    'create("users")',
    'update("label:admin")',
    'delete("label:admin")',
  ];
}

function profileDocumentPermissions(userId) {
  return unique([
    'read("users")',
    `read("user:${userId}")`,
    'read("label:instrutor")',
    'read("label:admin")',
    `update("user:${userId}")`,
    `delete("user:${userId}")`,
    'update("label:admin")',
    'delete("label:admin")',
  ]);
}

async function appwrite(path, options = {}) {
  const url = new URL(`${endpoint}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item, index) => {
      const queryKey = key.endsWith("[]") ? `${key.slice(0, -2)}[${index}]` : key;
      url.searchParams.append(queryKey, item);
    });
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${data.message || text || response.statusText}`);
  }
  return data;
}

async function listCollections() {
  const data = await appwrite(`/databases/${DATABASE_ID}/collections`);
  return data.collections || [];
}

async function resolveCollection(collections, explicitId, name) {
  const collection = explicitId
    ? collections.find((item) => item.$id === explicitId)
    : collections.find((item) => item.name === name);
  if (!collection) throw new Error(`Collection not found: ${explicitId || name}`);
  return collection;
}

async function updateCollectionPermissions(collection, permissions) {
  await appwrite(`/databases/${DATABASE_ID}/collections/${collection.$id}`, {
    method: "PUT",
    body: {
      name: collection.name,
      permissions,
      documentSecurity: collection.documentSecurity,
      enabled: collection.enabled,
    },
  });
}

async function listDocuments(collectionId) {
  const data = await appwrite(`/databases/${DATABASE_ID}/collections/${collectionId}/documents`);
  return data.documents || [];
}

async function updateDocumentPermissions(collectionId, documentId, permissions) {
  await appwrite(`/databases/${DATABASE_ID}/collections/${collectionId}/documents/${documentId}`, {
    method: "PATCH",
    body: { data: {}, permissions },
  });
}

function extractFileRef(imageUrl) {
  const text = String(imageUrl || "");
  const match = text.match(/\/storage\/buckets\/([^/]+)\/files\/([^/?#]+)\/view/i);
  if (!match) return null;
  return { bucketId: decodeURIComponent(match[1]), fileId: decodeURIComponent(match[2]) };
}

async function updateFilePermissions(bucketId, fileId, permissions) {
  const file = await appwrite(`/storage/buckets/${bucketId}/files/${fileId}`);
  await appwrite(`/storage/buckets/${bucketId}/files/${fileId}`, {
    method: "PATCH",
    body: { name: file.name, permissions },
  });
}

async function syncUserLabelsFromProfiles(profileDocs) {
  let updated = 0;
  for (const profile of profileDocs) {
    const userId = String(profile.user_id || "").trim();
    const role = String(profile.role || "").trim().toLowerCase();
    if (!userId || !VALID_ROLES.has(role)) continue;

    try {
      const user = await appwrite(`/users/${userId}`);
      const current = Array.isArray(user.labels) ? user.labels : [];
      const labels = unique([...current.filter((label) => !VALID_ROLES.has(String(label).toLowerCase())), role]);
      if (labels.join("\n") === current.join("\n")) continue;
      await appwrite(`/users/${userId}/labels`, { method: "PUT", body: { labels } });
      updated += 1;
    } catch (error) {
      console.warn(`  ! Could not sync labels for ${userId}: ${error.message}`);
    }
  }
  return updated;
}

async function main() {
  console.log("=== Fix photo-related Appwrite permissions ===");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Database: ${DATABASE_ID}`);

  const collections = await listCollections();
  const aircrafts = await resolveCollection(collections, AIRCRAFTS_COLLECTION_ID, "aircrafts");
  const profiles = PROFILES_COLLECTION_ID
    ? await resolveCollection(collections, PROFILES_COLLECTION_ID, "profiles")
    : collections.find((item) => item.name === "profiles");

  await updateCollectionPermissions(aircrafts, aircraftCollectionPermissions());
  console.log(`✓ aircrafts collection permissions updated (${aircrafts.$id})`);

  const aircraftDocs = await listDocuments(aircrafts.$id);
  if (AIRCRAFT_DOCUMENT_ID && !aircraftDocs.some((doc) => doc.$id === AIRCRAFT_DOCUMENT_ID)) {
    aircraftDocs.push({ $id: AIRCRAFT_DOCUMENT_ID });
  }
  for (const doc of aircraftDocs) {
    await updateDocumentPermissions(aircrafts.$id, doc.$id, aircraftDocumentPermissions());
  }
  console.log(`✓ aircraft document permissions updated: ${aircraftDocs.length}`);

  const fileRefs = new Map();
  for (const doc of aircraftDocs) {
    const ref = extractFileRef(doc.image_url);
    if (ref) fileRefs.set(`${ref.bucketId}/${ref.fileId}`, ref);
  }
  if (!fileRefs.size && FALLBACK_BUCKET_ID) {
    console.log(`• No aircraft file URLs found to patch in bucket ${FALLBACK_BUCKET_ID}`);
  }
  let fileUpdates = 0;
  for (const ref of fileRefs.values()) {
    try {
      await updateFilePermissions(ref.bucketId, ref.fileId, aircraftPhotoPermissions());
      fileUpdates += 1;
    } catch (error) {
      console.warn(`  ! Could not update file ${ref.bucketId}/${ref.fileId}: ${error.message}`);
    }
  }
  console.log(`✓ aircraft photo file permissions updated: ${fileUpdates}`);

  if (profiles) {
    await updateCollectionPermissions(profiles, profileCollectionPermissions());
    console.log(`✓ profiles collection permissions updated (${profiles.$id})`);

    const profileDocs = await listDocuments(profiles.$id);
    for (const doc of profileDocs) {
      const userId = String(doc.user_id || "").trim();
      if (!userId) continue;
      await updateDocumentPermissions(profiles.$id, doc.$id, profileDocumentPermissions(userId));
    }
    console.log(`✓ profile document permissions updated: ${profileDocs.length}`);

    const labelUpdates = await syncUserLabelsFromProfiles(profileDocs);
    console.log(`✓ auth labels synced from profiles: ${labelUpdates}`);
  } else {
    console.log("• profiles collection not found; skipped ANAC/profile permission repair");
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
