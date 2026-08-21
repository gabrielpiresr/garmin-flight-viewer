/**
 * Cria (ou atualiza) o role "Álbum" (portal admin, só aba album)
 * e um usuário com esse role — vê todas as fotos/vídeos via label admin.
 *
 * Uso:
 *   node scripts/provision-album-admin-user.mjs
 *   ALBUM_USER_EMAIL=... ALBUM_USER_PASSWORD=... ALBUM_USER_NAME=... node scripts/provision-album-admin-user.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Client, Databases, ID, Permission, Query, Role, Users } from "node-appwrite";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID =
  process.env.APPWRITE_PROFILES_COLLECTION_ID || process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const TENANT_ROLES_COLLECTION_ID =
  process.env.APPWRITE_TENANT_ROLES_COLLECTION_ID || process.env.VITE_APPWRITE_TENANT_ROLES_COL_ID;
const SCHOOL_ID = process.env.VITE_SCHOOL_ID || process.env.APPWRITE_SCHOOL_ID || "escola_principal";

const ROLE_SLUG = process.env.ALBUM_ROLE_SLUG || "album";
const ROLE_NAME = process.env.ALBUM_ROLE_NAME || "Álbum";
const USER_EMAIL = (process.env.ALBUM_USER_EMAIL || "album@escola.local").trim().toLowerCase();
const USER_NAME = (process.env.ALBUM_USER_NAME || "Gestor Álbum").trim();
const USER_PASSWORD = process.env.ALBUM_USER_PASSWORD || crypto.randomBytes(12).toString("base64url");

const ALL_ADMIN_TABS = [
  "home",
  "schedule", "schedule.voos", "schedule.disponibilidades", "schedule.gerador", "schedule.projecoes", "schedule.configuracoes",
  "students",
  "reports", "reports.all-flights", "reports.relatorios", "reports.assinaturas", "reports.sem-telemetria", "reports.alertas",
  "fleet", "fleet.avioes", "fleet.modelos", "fleet.programa", "fleet.ordens-servico",
  "contents", "contents.manobras", "contents.manuais", "contents.manuais-internos", "contents.ajuda", "contents.ajuda-instrutor", "contents.painel",
  "aisweb",
  "radar",
  "users",
  "import",
  "disparos", "disparos.email-mkt", "disparos.avisos",
  "logbook",
  "fuelings",
  "dre",
  "receipts",
  "crm",
  "instructor-admission",
  "flight-review",
  "settings", "settings.regras", "settings.email", "settings.aparencia",
  "settings.badges", "settings.trilhas", "settings.exercicios", "settings.financeiro", "settings.onboarding", "settings.indique-ganhe", "settings.roles", "settings.propostas", "settings.wpp", "settings.gopro", "settings.aisweb",
  "atualizacoes", "atualizacoes.agendamentos",
  "contracts", "contracts.layouts", "contracts.emitidos",
  "album",
];

const ALL_ACTIONS = [
  "fueling.launch", "fueling.edit", "os.create", "flight.create", "flight.edit", "flight.delete",
  "content.edit", "credit.launch", "credit.edit", "credit.delete",
  "users.manage", "schedule.generate", "onboarding.edit",
  "students.automations.view", "students.automations.manage", "students.templates.manage",
  "students.history.view", "students.statuses.manage",
];

function buildAlbumOnlyPermissions() {
  return {
    tabs: Object.fromEntries(ALL_ADMIN_TABS.map((k) => [k, k === "album"])),
    actions: Object.fromEntries(ALL_ACTIONS.map((k) => [k, false])),
  };
}

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID || !TENANT_ROLES_COLLECTION_ID) {
  console.error("Missing Appwrite env (endpoint/project/apiKey/database/profiles/tenant_roles).");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const users = new Users(client);

async function ensureRole() {
  const existing = await databases.listDocuments(DATABASE_ID, TENANT_ROLES_COLLECTION_ID, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("slug", [ROLE_SLUG]),
    Query.limit(1),
  ]);
  const now = new Date().toISOString();
  const permissionsJson = JSON.stringify(buildAlbumOnlyPermissions());
  const payload = {
    school_id: SCHOOL_ID,
    name: ROLE_NAME,
    slug: ROLE_SLUG,
    portal_type: "admin",
    is_system: false,
    permissions_json: permissionsJson,
    updated_at: now,
  };

  if (existing.total > 0 && existing.documents[0]) {
    const doc = existing.documents[0];
    await databases.updateDocument(DATABASE_ID, TENANT_ROLES_COLLECTION_ID, doc.$id, payload);
    console.log(`Role atualizado: ${ROLE_NAME} (${ROLE_SLUG}) → ${doc.$id}`);
    return doc.$id;
  }

  const created = await databases.createDocument(
    DATABASE_ID,
    TENANT_ROLES_COLLECTION_ID,
    ID.unique(),
    { ...payload, created_at: now },
  );
  console.log(`Role criado: ${ROLE_NAME} (${ROLE_SLUG}) → ${created.$id}`);
  return created.$id;
}

async function findUserByEmail(email) {
  let cursor;
  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await users.list({ queries, total: false });
    const match = res.users.find((u) => String(u.email || "").trim().toLowerCase() === email);
    if (match) return match;
    if (res.users.length < 100) return null;
    cursor = res.users[res.users.length - 1]?.$id;
    if (!cursor) return null;
  }
}

async function upsertProfile(userId, email) {
  const existing = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    Query.equal("user_id", [userId]),
    Query.limit(1),
  ]);

  const data = {
    user_id: userId,
    email,
    full_name: USER_NAME,
    role: "admin",
    roles: [ROLE_SLUG],
    assigned_role_slugs: [ROLE_SLUG],
    active_role: "admin",
    active_role_slug: ROLE_SLUG,
    custom_role_slug: ROLE_SLUG,
    role_custom_slugs_json: JSON.stringify({ admin: ROLE_SLUG }),
    school_id: SCHOOL_ID,
    is_active: true,
  };

  const perms = [
    Permission.read(Role.users()),
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
  ];

  if (existing.total > 0 && existing.documents[0]) {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, existing.documents[0].$id, data);
    return existing.documents[0].$id;
  }

  const created = await databases.createDocument(
    DATABASE_ID,
    PROFILES_COLLECTION_ID,
    ID.unique(),
    data,
    perms,
  );
  return created.$id;
}

async function ensureUser() {
  let user = await findUserByEmail(USER_EMAIL);
  let created = false;
  let passwordToPrint = null;

  if (!user) {
    user = await users.create({
      userId: ID.unique(),
      email: USER_EMAIL,
      password: USER_PASSWORD,
      name: USER_NAME.slice(0, 128),
    });
    created = true;
    passwordToPrint = USER_PASSWORD;
    console.log(`Usuário criado: ${USER_EMAIL} (${user.$id})`);
  } else {
    console.log(`Usuário já existe: ${USER_EMAIL} (${user.$id}) — atualizando role/labels`);
    if (process.env.ALBUM_USER_PASSWORD) {
      await users.updatePassword({ userId: user.$id, password: USER_PASSWORD });
      passwordToPrint = USER_PASSWORD;
      console.log("Senha atualizada com ALBUM_USER_PASSWORD.");
    }
    if (USER_NAME && user.name !== USER_NAME) {
      await users.updateName({ userId: user.$id, name: USER_NAME.slice(0, 128) });
    }
  }

  const labels = Array.from(
    new Set([...(user.labels || []).filter((l) => !["admin", "instrutor", "aluno"].includes(String(l))), "admin"]),
  );
  await users.updateLabels({ userId: user.$id, labels });
  const profileId = await upsertProfile(user.$id, USER_EMAIL);

  return { userId: user.$id, profileId, created, passwordToPrint };
}

async function run() {
  console.log(`School: ${SCHOOL_ID}`);
  await ensureRole();
  const result = await ensureUser();
  console.log("");
  console.log("=== Álbum admin provisionado ===");
  console.log(`Role:     ${ROLE_NAME} (slug=${ROLE_SLUG}, portal=admin, tabs=album)`);
  console.log(`User ID:  ${result.userId}`);
  console.log(`Profile:  ${result.profileId}`);
  console.log(`Email:    ${USER_EMAIL}`);
  if (result.passwordToPrint) {
    console.log(`Senha:    ${result.passwordToPrint}`);
  } else {
    console.log("Senha:    (inalterada — defina ALBUM_USER_PASSWORD para resetar)");
  }
  console.log("Portal:   /admin/album (somente aba Álbum)");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
