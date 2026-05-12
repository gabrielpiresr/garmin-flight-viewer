import { Client, Databases, ID, Permission, Query, Role, Users } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;

const USER_EMAIL = process.env.TARGET_USER_EMAIL;
const USER_ID = process.env.TARGET_USER_ID;
const TARGET_ROLE = process.env.TARGET_ROLE;

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID or APPWRITE_PROFILES_COLLECTION_ID.",
  );
  process.exit(1);
}

if (!TARGET_ROLE || !VALID_ROLES.has(TARGET_ROLE)) {
  console.error("TARGET_ROLE is required and must be one of: admin, instrutor, aluno.");
  process.exit(1);
}

if (!USER_EMAIL && !USER_ID) {
  console.error("Set TARGET_USER_EMAIL or TARGET_USER_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const users = new Users(client);

async function resolveUser() {
  if (USER_ID) {
    const user = await users.get({ userId: USER_ID });
    return { userId: user.$id, email: user.email, labels: user.labels ?? [] };
  }

  const res = await users.list({
    queries: [Query.limit(100)],
    total: true,
  });
  const normalizedTarget = String(USER_EMAIL).trim().toLowerCase();
  const user = res.users.find((entry) => String(entry.email).trim().toLowerCase() === normalizedTarget);
  if (!user) throw new Error(`User not found for email: ${USER_EMAIL}`);
  return { userId: user.$id, email: user.email, labels: user.labels ?? [] };
}

async function upsertProfile(userId, email, role) {
  const existing = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    Query.equal("user_id", [userId]),
    Query.limit(1),
  ]);

  const data = { user_id: userId, email, role };

  if (existing.total > 0 && existing.documents[0]) {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, existing.documents[0].$id, data);
    return existing.documents[0].$id;
  }

  const created = await databases.createDocument(
    DATABASE_ID,
    PROFILES_COLLECTION_ID,
    ID.unique(),
    data,
    [
      Permission.read(Role.users()),
      Permission.read(Role.user(userId)),
      Permission.read(Role.label("instrutor")),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ],
  );
  return created.$id;
}

async function updateLabels(userId, currentLabels, role) {
  const withoutRoleLabels = currentLabels.filter((label) => !VALID_ROLES.has(label));
  const labels = Array.from(new Set([...withoutRoleLabels, role]));
  if (role === "admin" && !labels.includes("admin")) {
    labels.push("admin");
  }
  await users.updateLabels({ userId, labels });
  return labels;
}

async function run() {
  const user = await resolveUser();
  const profileId = await upsertProfile(user.userId, user.email, TARGET_ROLE);
  const labels = await updateLabels(user.userId, user.labels, TARGET_ROLE);

  console.log(`User updated: ${user.email} (${user.userId})`);
  console.log(`Profile ID: ${profileId}`);
  console.log(`Role: ${TARGET_ROLE}`);
  console.log(`Labels: ${labels.join(", ")}`);
}

run().catch((error) => {
  console.error("Failed to set role:", error?.message ?? error);
  process.exit(1);
});
