/**
 * Adiciona campos de multi-role na collection profiles e faz backfill.
 *
 * Uso:
 *   npm run appwrite:migrate:multi-role
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? process.env.VITE_APPWRITE_DATABASE_ID;
const PROFILES_COL_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID ?? process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!API_KEY || !DATABASE_ID || !PROFILES_COL_ID) {
  console.error("Defina APPWRITE_API_KEY, APPWRITE_DATABASE_ID e APPWRITE_PROFILES_COLLECTION_ID no ambiente.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);

function normalizeRole(value) {
  const role = String(value || "").toLowerCase();
  return VALID_ROLES.has(role) ? role : "aluno";
}

function normalizeSlugList(values, fallbackRole) {
  if (!Array.isArray(values) || values.length === 0) return [fallbackRole];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function parseRoleCustomSlugsJson(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function deriveAssignedSlugs(doc) {
  if (Array.isArray(doc.assigned_role_slugs) && doc.assigned_role_slugs.length > 0) {
    return normalizeSlugList(doc.assigned_role_slugs, normalizeRole(doc.role));
  }
  if (Array.isArray(doc.roles) && doc.roles.length > 0) {
    const slugs = normalizeSlugList(doc.roles, normalizeRole(doc.role));
    if (slugs.length > 0) return slugs;
  }
  const role = normalizeRole(doc.role);
  const customMap = parseRoleCustomSlugsJson(doc.role_custom_slugs_json);
  const customSlug = doc.custom_role_slug || customMap[role];
  return customSlug ? [customSlug] : [role];
}

function deriveActiveSlug(doc, assignedSlugs) {
  const explicit = String(doc.active_role_slug || "").trim();
  if (explicit && assignedSlugs.includes(explicit)) return explicit;
  const activePortal = normalizeRole(doc.active_role || doc.role);
  const customMap = parseRoleCustomSlugsJson(doc.role_custom_slugs_json);
  const mapped = customMap[activePortal];
  if (mapped && assignedSlugs.includes(mapped)) return mapped;
  if (assignedSlugs.includes(activePortal)) return activePortal;
  return assignedSlugs.find((slug) => slug === "admin")
    ?? assignedSlugs.find((slug) => slug === "instrutor")
    ?? assignedSlugs[0]
    ?? "aluno";
}

async function ensureAttribute(key, size, array = false) {
  try {
    await db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, key, size, false, undefined, array);
    console.log(`✅  Atributo ${key} criado.`);
    await new Promise((r) => setTimeout(r, 2000));
  } catch (err) {
    if (err?.code === 409) {
      console.log(`ℹ️   Atributo ${key} já existe.`);
    } else if (err?.code === 400 && String(err?.message || "").includes("maximum")) {
      console.log(`⚠️   Atributo ${key} não criado (limite da collection): ${err.message}`);
    } else {
      throw err;
    }
  }
}

async function backfillProfiles() {
  let cursor = null;
  let updated = 0;

  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db.listDocuments(DATABASE_ID, PROFILES_COL_ID, queries);
    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      const role = normalizeRole(doc.role);
      const assignedRoleSlugs = deriveAssignedSlugs(doc);
      const activeRoleSlug = deriveActiveSlug(doc, assignedRoleSlugs);
      const activePortal = normalizeRole(doc.active_role || doc.role);
      const safeActive = assignedRoleSlugs.includes(activePortal) || assignedRoleSlugs.includes(activeRoleSlug)
        ? activePortal
        : (assignedRoleSlugs.includes("admin") ? "admin" : assignedRoleSlugs.includes("instrutor") ? "instrutor" : assignedRoleSlugs.includes("aluno") ? "aluno" : role);
      const slugsJson = typeof doc.role_custom_slugs_json === "string" && doc.role_custom_slugs_json.trim()
        ? doc.role_custom_slugs_json
        : "{}";

      const needsUpdate =
        JSON.stringify(doc.assigned_role_slugs ?? []) !== JSON.stringify(assignedRoleSlugs) ||
        doc.active_role_slug !== activeRoleSlug ||
        JSON.stringify(doc.roles ?? []) !== JSON.stringify(assignedRoleSlugs) ||
        doc.active_role !== safeActive ||
        doc.role !== safeActive ||
        doc.role_custom_slugs_json !== slugsJson;

      if (needsUpdate) {
        await db.updateDocument(DATABASE_ID, PROFILES_COL_ID, doc.$id, {
          assigned_role_slugs: assignedRoleSlugs,
          active_role_slug: activeRoleSlug,
          roles: assignedRoleSlugs,
          active_role: safeActive,
          role: safeActive,
          role_custom_slugs_json: slugsJson,
        });
        updated += 1;
      }
    }

    cursor = page.documents[page.documents.length - 1].$id;
    if (page.documents.length < 100) break;
  }

  console.log(`✅  Backfill concluído (${updated} perfis atualizados).`);
}

async function main() {
  console.log("🔍  Criando atributos multi-role em profiles...");
  await ensureAttribute("roles", 64, true);
  await ensureAttribute("active_role", 64, false);
  await ensureAttribute("assigned_role_slugs", 64, true);
  await ensureAttribute("active_role_slug", 64, false);
  await ensureAttribute("role_custom_slugs_json", 2048, false);
  console.log("⏳  Aguardando Appwrite processar atributos...");
  await new Promise((r) => setTimeout(r, 4000));
  await backfillProfiles();
  console.log("🎉  Pronto! Faça deploy do fn-admin-users e teste o switcher.");
}

main().catch((err) => {
  console.error("❌  Erro:", err?.message ?? err);
  process.exit(1);
});
