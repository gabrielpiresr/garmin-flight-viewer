import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const execute = process.argv.includes("--execute");
const aliasPrefix = "gabrielpirexs+";
const aliasDomain = "@gmail.com";

function parseEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function onlyDigits(value) {
  return clean(value).replace(/\D/g, "");
}

function isAliasEmail(email) {
  const value = lower(email);
  return value.startsWith(aliasPrefix) && value.endsWith(aliasDomain);
}

function aliasLocalPart(email) {
  const value = lower(email);
  if (!isAliasEmail(value)) return "";
  return value.slice(aliasPrefix.length, -aliasDomain.length);
}

function isAliasProfile(profile) {
  return isAliasEmail(profile.email) || clean(profile.user_id).startsWith("saga_alias_");
}

function originalEmailFromAlias(email) {
  const local = aliasLocalPart(email);
  return local ? `${local}${aliasDomain}` : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceUserPermissions(permissions, fromUserId, toUserId) {
  const from = `user:${fromUserId}`;
  const to = `user:${toUserId}`;
  return Array.from(new Set((permissions || []).map((permission) => clean(permission).replaceAll(from, to)).filter(Boolean)));
}

function replaceUserIdInStrings(doc, fields, fromUserId, toUserId) {
  const patch = {};
  const pattern = new RegExp(escapeRegExp(fromUserId), "g");
  for (const field of fields) {
    if (typeof doc[field] !== "string" || !doc[field].includes(fromUserId)) continue;
    patch[field] = doc[field].replace(pattern, toUserId);
  }
  return patch;
}

async function listAllDocuments(databases, databaseId, collectionId, queries = []) {
  if (!collectionId) return [];
  const documents = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await databases.listDocuments({
      databaseId,
      collectionId,
      queries: [...queries, sdk.Query.limit(limit), sdk.Query.offset(offset)],
    });
    documents.push(...(page.documents || []));
    if (!page.documents || page.documents.length < limit || documents.length >= (page.total || 0)) break;
    offset += page.documents.length;
  }
  return documents;
}

async function listDocsByEqual(databases, databaseId, collectionId, field, value) {
  try {
    return await listAllDocuments(databases, databaseId, collectionId, [sdk.Query.equal(field, [value])]);
  } catch (error) {
    return { error: clean(error?.message || error) };
  }
}

function profileLabel(profile) {
  return [profile.full_name, profile.email, profile.user_id].map(clean).filter(Boolean).join(" | ");
}

function chooseTargetProfile(aliasProfile, profiles) {
  const aliasUserId = clean(aliasProfile.user_id);
  const aliasEmail = lower(aliasProfile.email);
  const originalEmail = originalEmailFromAlias(aliasEmail);
  const aliasLocal = aliasLocalPart(aliasEmail);
  const aliasSagaId = clean(aliasProfile.saga_user_id);
  const aliasAnac = clean(aliasProfile.anac_code);
  const aliasCpf = onlyDigits(aliasProfile.cpf);
  const candidates = [];

  for (const profile of profiles) {
    const userId = clean(profile.user_id);
    if (!userId || userId === aliasUserId || isAliasProfile(profile)) continue;

    let score = 0;
    const reasons = [];
    if (aliasSagaId && clean(profile.saga_user_id) === aliasSagaId) {
      score += 100;
      reasons.push("saga_user_id");
    }
    if (aliasAnac && clean(profile.anac_code) === aliasAnac) {
      score += 90;
      reasons.push("anac_code");
    }
    if (aliasCpf && onlyDigits(profile.cpf) === aliasCpf) {
      score += 80;
      reasons.push("cpf");
    }
    if (originalEmail && lower(profile.email) === originalEmail) {
      score += 70;
      reasons.push("email_original");
    }
    if (aliasLocal && lower(profile.email).split("@", 1)[0] === aliasLocal) {
      score += 40;
      reasons.push("email_local");
    }
    if (score > 0) candidates.push({ profile, score, reasons });
  }

  candidates.sort((a, b) => b.score - a.score || clean(a.profile.user_id).localeCompare(clean(b.profile.user_id)));
  const best = candidates[0] || null;
  const second = candidates[1] || null;
  if (!best) return { target: null, reasons: [], ambiguous: false };
  if (second && second.score === best.score) {
    return { target: null, reasons: best.reasons, ambiguous: true, candidates: candidates.slice(0, 3) };
  }
  return { target: best.profile, reasons: best.reasons, ambiguous: false };
}

async function updateDocumentReference({ databases, databaseId, collection, doc, patch, fromUserId, toUserId, summary }) {
  const permissions = replaceUserPermissions(doc.$permissions || [], fromUserId, toUserId);
  const changedPermissions = JSON.stringify(permissions) !== JSON.stringify(doc.$permissions || []);
  if (!Object.keys(patch).length && !changedPermissions) return;

  summary.documentsUpdated += 1;
  summary.updatedByCollection[collection.name] = (summary.updatedByCollection[collection.name] || 0) + 1;
  if (!execute) return;

  await databases.updateDocument({
    databaseId,
    collectionId: collection.id,
    documentId: doc.$id,
    data: patch,
    permissions: changedPermissions ? permissions : undefined,
  });
}

async function migrateCollectionReferences(databases, databaseId, collection, fromUserId, toUserId, summary) {
  if (!collection.id) return;
  const docsById = new Map();
  for (const field of collection.fields) {
    const result = await listDocsByEqual(databases, databaseId, collection.id, field, fromUserId);
    if (Array.isArray(result)) {
      for (const doc of result) docsById.set(doc.$id, doc);
    } else {
      summary.queryErrors.push({ collection: collection.name, field, message: result.error });
    }
  }

  for (const doc of docsById.values()) {
    const patch = {};
    for (const field of collection.fields) {
      if (clean(doc[field]) === fromUserId) patch[field] = toUserId;
    }
    Object.assign(patch, replaceUserIdInStrings(doc, collection.stringFields || [], fromUserId, toUserId));
    try {
      await updateDocumentReference({ databases, databaseId, collection, doc, patch, fromUserId, toUserId, summary });
    } catch (error) {
      summary.updateErrors.push({
        collection: collection.name,
        documentId: doc.$id,
        message: clean(error?.message || error),
      });
    }
  }
}

const env = parseEnv(envPath);
const endpoint = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const databaseId = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const apiKey = env.APPWRITE_API_KEY;
const schoolId = env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error("Missing Appwrite endpoint/project/database/api key in .env.local.");
  process.exit(1);
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new sdk.Databases(client);
const users = new sdk.Users(client);

const collections = [
  {
    name: "flights",
    id: env.APPWRITE_FLIGHTS_COLLECTION_ID || env.APPWRITE_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID,
    fields: ["student_user_id", "user_id", "instructor_user_id"],
    stringFields: ["csv_text", "training_snapshot_json", "training_mission_ids_json"],
  },
  {
    name: "flight_signatures",
    id: env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID || env.APPWRITE_FLIGHT_SIGNATURES_COL_ID || env.VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID,
    fields: ["signer_user_id", "student_user_id", "instructor_user_id"],
  },
  {
    name: "flight_telemetry_summaries",
    id: env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID || env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID || env.VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID,
    fields: ["student_user_id", "instructor_user_id"],
  },
  {
    name: "flight_landings",
    id: env.APPWRITE_FLIGHT_LANDINGS_COLLECTION_ID || env.APPWRITE_FLIGHT_LANDINGS_COL_ID || env.VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID,
    fields: ["student_user_id", "instructor_user_id"],
  },
  {
    name: "flight_takeoffs",
    id: env.APPWRITE_FLIGHT_TAKEOFFS_COLLECTION_ID || env.APPWRITE_FLIGHT_TAKEOFFS_COL_ID || env.VITE_APPWRITE_FLIGHT_TAKEOFFS_COL_ID,
    fields: ["student_user_id", "instructor_user_id"],
  },
  {
    name: "flight_telemetry_alerts",
    id: env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID || env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID || env.VITE_APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID,
    fields: ["student_user_id", "instructor_user_id"],
  },
  {
    name: "flight_maneuvers",
    id: env.APPWRITE_FLIGHT_MANEUVERS_COLLECTION_ID || env.APPWRITE_FLIGHT_MANEUVERS_COL_ID || env.VITE_APPWRITE_FLIGHT_MANEUVERS_COL_ID,
    fields: ["student_id", "instructor_id", "created_by"],
  },
  {
    name: "student_credits",
    id: env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID || env.APPWRITE_STUDENT_CREDITS_COL_ID || env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID,
    fields: ["user_id", "created_by", "updated_by"],
  },
  {
    name: "student_training_tracks",
    id: env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || env.APPWRITE_STUDENT_TRACKS_COL_ID || env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID,
    fields: ["student_user_id"],
  },
  {
    name: "weekly_flight_plans",
    id: env.APPWRITE_WEEKLY_PLANS_COLLECTION_ID || env.APPWRITE_WEEKLY_PLANS_COL_ID || env.VITE_APPWRITE_WEEKLY_PLANS_COL_ID,
    fields: ["student_id"],
  },
  {
    name: "student_observations",
    id: env.APPWRITE_STUDENT_OBSERVATIONS_COLLECTION_ID || env.APPWRITE_STUDENT_OBSERVATIONS_COL_ID || env.VITE_APPWRITE_STUDENT_OBSERVATIONS_COL_ID,
    fields: ["student_user_id", "author_user_id"],
  },
  {
    name: "profile_documents",
    id: env.APPWRITE_PROFILE_DOCUMENTS_COLLECTION_ID || env.APPWRITE_PROFILE_DOCUMENTS_COL_ID || env.VITE_APPWRITE_PROFILE_DOCUMENTS_COL_ID,
    fields: ["user_id"],
  },
  {
    name: "flight_videos",
    id: env.APPWRITE_FLIGHT_VIDEOS_COLLECTION_ID || env.APPWRITE_VIDEOS_COLLECTION_ID || env.VITE_APPWRITE_VIDEOS_COLLECTION_ID,
    fields: ["uploaded_by"],
  },
  {
    name: "flight_photos",
    id: env.APPWRITE_FLIGHT_PHOTOS_COLLECTION_ID || env.APPWRITE_FLIGHT_PHOTOS_COL_ID || env.VITE_APPWRITE_FLIGHT_PHOTOS_COLLECTION_ID,
    fields: ["uploaded_by"],
  },
  {
    name: "product_sales",
    id: env.APPWRITE_PRODUCT_SALES_COLLECTION_ID || env.APPWRITE_PRODUCT_SALES_COL_ID || env.VITE_APPWRITE_PRODUCT_SALES_COL_ID,
    fields: ["user_id", "created_by", "updated_by"],
  },
  {
    name: "contracts",
    id: env.APPWRITE_CONTRACTS_COLLECTION_ID || env.APPWRITE_CONTRACTS_COL_ID || env.VITE_APPWRITE_CONTRACTS_COL_ID,
    fields: ["recipient_user_id", "created_by", "updated_by"],
  },
  {
    name: "contract_signatures",
    id: env.APPWRITE_CONTRACT_SIGNATURES_COLLECTION_ID || env.APPWRITE_CONTRACT_SIGNATURES_COL_ID || env.VITE_APPWRITE_CONTRACT_SIGNATURES_COL_ID,
    fields: ["signer_user_id"],
  },
  {
    name: "fuelings",
    id: env.APPWRITE_FUELINGS_COLLECTION_ID || env.APPWRITE_FUELINGS_COL_ID || env.VITE_APPWRITE_FUELINGS_COL_ID,
    fields: ["student_user_id", "responsible_user_id"],
  },
  {
    name: "instructor_students",
    id: env.APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID || env.VITE_APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID,
    fields: ["student_user_id", "instructor_user_id"],
  },
  {
    name: "crm_leads",
    id: env.APPWRITE_CRM_LEADS_COLLECTION_ID || env.APPWRITE_CRM_LEADS_COL_ID || env.VITE_APPWRITE_CRM_LEADS_COL_ID,
    fields: ["user_id"],
  },
  {
    name: "student_crm_profiles",
    id: env.APPWRITE_STUDENT_CRM_PROFILES_COLLECTION_ID || env.APPWRITE_STUDENT_CRM_PROFILES_COL_ID || env.VITE_APPWRITE_STUDENT_CRM_PROFILES_COL_ID,
    fields: ["user_id"],
  },
];

const profilesCollectionId = env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const profiles = await listAllDocuments(databases, databaseId, profilesCollectionId, [
  sdk.Query.equal("school_id", [schoolId]),
]);
const aliases = profiles.filter(isAliasProfile);
const summary = {
  mode: execute ? "execute" : "dry-run",
  schoolId,
  aliasProfilesFound: aliases.length,
  mappings: [],
  skipped: [],
  documentsUpdated: 0,
  updatedByCollection: {},
  profilesDeleted: 0,
  authUsersDeleted: 0,
  queryErrors: [],
  updateErrors: [],
  deleteErrors: [],
};

for (const aliasProfile of aliases) {
  const fromUserId = clean(aliasProfile.user_id);
  const choice = chooseTargetProfile(aliasProfile, profiles);
  if (!fromUserId || !choice.target) {
    summary.skipped.push({
      aliasUserId: fromUserId,
      aliasEmail: aliasProfile.email || "",
      reason: choice.ambiguous ? "ambiguous_target" : "target_not_found",
      candidates: (choice.candidates || []).map((item) => ({
        userId: item.profile.user_id,
        email: item.profile.email,
        score: item.score,
        reasons: item.reasons,
      })),
    });
    continue;
  }

  const toUserId = clean(choice.target.user_id);
  summary.mappings.push({
    aliasUserId: fromUserId,
    alias: profileLabel(aliasProfile),
    targetUserId: toUserId,
    target: profileLabel(choice.target),
    reasons: choice.reasons,
  });

  for (const collection of collections) {
    await migrateCollectionReferences(databases, databaseId, collection, fromUserId, toUserId, summary);
  }

  if (execute) {
    try {
      await databases.deleteDocument({
        databaseId,
        collectionId: profilesCollectionId,
        documentId: aliasProfile.$id,
      });
      summary.profilesDeleted += 1;
    } catch (error) {
      summary.deleteErrors.push({ type: "profile", userId: fromUserId, message: clean(error?.message || error) });
    }
    try {
      await users.delete({ userId: fromUserId });
      summary.authUsersDeleted += 1;
    } catch (error) {
      summary.deleteErrors.push({ type: "auth_user", userId: fromUserId, message: clean(error?.message || error) });
    }
  } else {
    summary.profilesDeleted += 1;
    summary.authUsersDeleted += 1;
  }
}

console.log(JSON.stringify(summary, null, 2));
