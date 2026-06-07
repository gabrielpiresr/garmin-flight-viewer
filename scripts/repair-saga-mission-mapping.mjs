import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Query, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const index = trimmed.indexOf("=");
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
}

const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const settingsCollectionId = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const tracksCollectionId = env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID;
const schoolId = env.VITE_SCHOOL_ID || "escola_principal";
if (!endpoint || !projectId || !apiKey || !databaseId || !settingsCollectionId || !tracksCollectionId) {
  throw new Error("Configuracao Appwrite incompleta.");
}

const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
const clean = (value) => String(value ?? "").trim();
const key = (value) => clean(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");
function canonical(value) {
  const normalized = key(value);
  const match = normalized.match(/^([A-Z]{1,8})0*(\d+)([A-Z]?)$/);
  return match ? `${match[1]}${Number(match[2])}${match[3]}` : normalized;
}
function aliases(mission) {
  return new Set([
    mission?.id,
    mission?.code,
    mission?.name,
    mission?.title,
    `${mission?.type || ""}${mission?.order || ""}`,
  ].flatMap((value) => [key(value), canonical(value)]).filter(Boolean));
}
function scopedAliases(mission) {
  return new Set([
    mission?.code,
    mission?.name,
    mission?.title,
  ].flatMap((value) => [key(value), canonical(value)]).filter(Boolean));
}

const settingsPage = await databases.listDocuments(databaseId, settingsCollectionId, [
  Query.equal("key", ["sagaImportMapping"]),
  Query.limit(1),
]);
const settingsDoc = settingsPage.documents[0];
if (!settingsDoc) throw new Error("De-para sagaImportMapping nao encontrado.");
const mapping = JSON.parse(settingsDoc.settings_json || "{}");

const tracksPage = await databases.listDocuments(databaseId, tracksCollectionId, [
  Query.equal("school_id", [schoolId]),
  Query.limit(100),
]);
const mappedTrackIds = new Set(Object.values(mapping.courseBySaga || {}).map(clean).filter(Boolean));
const tracks = tracksPage.documents
  .filter((track) => mappedTrackIds.has(track.$id))
  .map((track) => ({
    id: track.$id,
    stages: JSON.parse(track.stages_json || "[]"),
  }));
const missionRows = tracks.flatMap((track) =>
  track.stages.flatMap((stage) =>
    (stage.missions || []).map((mission) => ({
      trackId: track.id,
      missionId: clean(mission.id),
      aliases: aliases(mission),
      scopedAliases: scopedAliases(mission),
    })),
  ),
);

const next = { ...(mapping.missionBySaga || {}) };
let repairedGlobal = 0;
let addedScoped = 0;
let addedUniqueGlobal = 0;

for (const row of missionRows) {
  for (const alias of row.scopedAliases) {
    const scopedKey = `${row.trackId}::${alias}`;
    if (next[scopedKey] !== row.missionId) {
      next[scopedKey] = row.missionId;
      addedScoped += 1;
    }
  }
}

for (const [lookupKey, currentMissionId] of Object.entries(mapping.missionBySaga || {})) {
  if (lookupKey.includes("::")) continue;
  const matches = missionRows.filter((row) => row.aliases.has(key(lookupKey)) || row.aliases.has(canonical(lookupKey)));
  const uniqueIds = [...new Set(matches.map((row) => row.missionId))];
  if (uniqueIds.length === 1 && uniqueIds[0] !== currentMissionId) {
    next[lookupKey] = uniqueIds[0];
    repairedGlobal += 1;
  }
}

const aliasesToRows = new Map();
for (const row of missionRows) {
  for (const alias of row.scopedAliases) {
    const rows = aliasesToRows.get(alias) || [];
    rows.push(row);
    aliasesToRows.set(alias, rows);
  }
}
for (const [alias, rows] of aliasesToRows) {
  const uniqueIds = [...new Set(rows.map((row) => row.missionId))];
  if (uniqueIds.length === 1 && !next[alias]) {
    next[alias] = uniqueIds[0];
    addedUniqueGlobal += 1;
  }
}

const settingsJson = JSON.stringify({
  ...mapping,
  missionBySaga: next,
  updatedAt: new Date().toISOString(),
});
if (settingsJson.length > 15000) {
  throw new Error(`De-para reparado excede o limite seguro: ${settingsJson.length} caracteres.`);
}

await databases.updateDocument(
  databaseId,
  settingsCollectionId,
  settingsDoc.$id,
  { key: "sagaImportMapping", settings_json: settingsJson },
  [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ],
);

console.log(JSON.stringify({
  tracks: tracks.length,
  mappingsBefore: Object.keys(mapping.missionBySaga || {}).length,
  mappingsAfter: Object.keys(next).length,
  repairedGlobal,
  addedScoped,
  addedUniqueGlobal,
  ma04: next.MA04 || null,
}, null, 2));
