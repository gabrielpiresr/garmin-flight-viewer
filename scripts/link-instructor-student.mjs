import { Client, Databases, ID, Permission, Query, Role, Users } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const REL_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID;

const INSTRUCTOR_EMAIL = process.env.INSTRUCTOR_EMAIL;
const STUDENT_EMAIL = process.env.STUDENT_EMAIL;
const INSTRUCTOR_USER_ID = process.env.INSTRUCTOR_USER_ID;
const STUDENT_USER_ID = process.env.STUDENT_USER_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID || !REL_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_PROFILES_COLLECTION_ID or APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID.",
  );
  process.exit(1);
}

if ((!INSTRUCTOR_EMAIL && !INSTRUCTOR_USER_ID) || (!STUDENT_EMAIL && !STUDENT_USER_ID)) {
  console.error("Set instructor by INSTRUCTOR_EMAIL or INSTRUCTOR_USER_ID and student by STUDENT_EMAIL or STUDENT_USER_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const users = new Users(client);

async function resolveUser(email, userId) {
  if (userId) {
    const user = await users.get({ userId });
    return { userId: user.$id, email: user.email };
  }
  const res = await users.list({
    queries: [Query.equal("email", [email])],
    total: true,
  });
  const user = res.users[0];
  if (!user) throw new Error(`User not found for email: ${email}`);
  return { userId: user.$id, email: user.email };
}

async function assertRole(userId, expectedRole) {
  const res = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    Query.equal("user_id", [userId]),
    Query.limit(1),
  ]);
  const role = (res.documents[0]?.role ?? "aluno");
  if (role !== expectedRole) {
    throw new Error(`User ${userId} must be '${expectedRole}', current role is '${role}'.`);
  }
}

async function run() {
  const instructor = await resolveUser(INSTRUCTOR_EMAIL, INSTRUCTOR_USER_ID);
  const student = await resolveUser(STUDENT_EMAIL, STUDENT_USER_ID);

  await assertRole(instructor.userId, "instrutor");
  await assertRole(student.userId, "aluno");

  const existing = await databases.listDocuments(DATABASE_ID, REL_COLLECTION_ID, [
    Query.equal("instructor_user_id", [instructor.userId]),
    Query.equal("student_user_id", [student.userId]),
    Query.limit(1),
  ]);

  if (existing.total > 0) {
    console.log("Link already exists.");
    console.log(`${instructor.email} -> ${student.email}`);
    return;
  }

  await databases.createDocument(
    DATABASE_ID,
    REL_COLLECTION_ID,
    ID.unique(),
    {
      instructor_user_id: instructor.userId,
      student_user_id: student.userId,
    },
    [
      Permission.read(Role.user(instructor.userId)),
      Permission.update(Role.user(instructor.userId)),
      Permission.delete(Role.user(instructor.userId)),
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ],
  );

  console.log("Link created:");
  console.log(`${instructor.email} -> ${student.email}`);
}

run().catch((error) => {
  console.error("Failed to link instructor and student:", error?.message ?? error);
  process.exit(1);
});
