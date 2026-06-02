import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const i = trimmed.indexOf("=");
  env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
}

const databases = new sdk.Databases(
  new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY),
);
const db = env.VITE_APPWRITE_DATABASE_ID;
const flightsCol = env.VITE_APPWRITE_COLLECTION_ID;
const creditsCol = env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID;
const profilesCol = env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const schoolId = env.VITE_SCHOOL_ID || "escola_principal";

const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const flights = await databases.listDocuments({
  databaseId: db,
  collectionId: flightsCol,
  queries: [
    sdk.Query.equal("school_id", [schoolId]),
    sdk.Query.greaterThan("$updatedAt", since),
    sdk.Query.orderDesc("$updatedAt"),
    sdk.Query.limit(100),
  ],
});

const sagaFlights = flights.documents.filter((d) =>
  String(d.source_filename || "").includes("saga") || String(d.saga_flight_id || "").length > 0,
);

const credits = await databases.listDocuments({
  databaseId: db,
  collectionId: creditsCol,
  queries: [
    sdk.Query.equal("school_id", [schoolId]),
    sdk.Query.greaterThan("$updatedAt", since),
    sdk.Query.orderDesc("$updatedAt"),
    sdk.Query.limit(50),
  ],
});

const sagaCredits = credits.documents.filter((d) =>
  String(d.notes || "").includes("SAGA") || String(d.payment_method || "").includes("SAGA"),
);

const byStudent = new Map();
for (const f of sagaFlights) {
  const sid = f.student_user_id || f.user_id;
  const list = byStudent.get(sid) || [];
  list.push({
    id: f.$id,
    saga_flight_id: f.saga_flight_id,
    flight_date: f.flight_date,
    name: f.name,
    source_filename: f.source_filename,
    updatedAt: f.$updatedAt,
  });
  byStudent.set(sid, list);
}

const profileRes = await databases.listDocuments({
  databaseId: db,
  collectionId: profilesCol,
  queries: [sdk.Query.equal("school_id", [schoolId]), sdk.Query.limit(100)],
});

const profileByUser = new Map(profileRes.documents.map((p) => [p.user_id, p]));

const report = {
  since,
  sagaFlightsTotal: sagaFlights.length,
  sagaCreditsTotal: sagaCredits.length,
  students: Array.from(byStudent.entries()).map(([userId, fl]) => {
    const p = profileByUser.get(userId);
    return {
      userId,
      name: p?.name || p?.full_name,
      anac: p?.anac_code,
      saga_user_id: p?.saga_user_id,
      flightCount: fl.length,
      flights: fl.sort((a, b) => String(a.flight_date).localeCompare(String(b.flight_date))),
    };
  }),
  credits: sagaCredits.map((c) => ({
    id: c.$id,
    userId: c.user_id,
    model: c.aircraft_model_name,
    hours: c.hours,
    purchaseDate: c.purchase_date,
    notes: c.notes,
    updatedAt: c.$updatedAt,
  })),
};

for (const [userId] of byStudent) {
  const p = profileByUser.get(userId);
  if (p) continue;
  try {
    const one = await databases.getDocument({ databaseId: db, collectionId: profilesCol, documentId: userId });
    profileByUser.set(userId, one);
  } catch {
    const q = await databases.listDocuments({
      databaseId: db,
      collectionId: profilesCol,
      queries: [sdk.Query.equal("user_id", [userId]), sdk.Query.limit(1)],
    });
    if (q.documents[0]) profileByUser.set(userId, q.documents[0]);
  }
}
for (const entry of report.students) {
  const p = profileByUser.get(entry.userId);
  entry.name = p?.name || p?.full_name;
  entry.anac = p?.anac_code;
  entry.saga_user_id = p?.saga_user_id;
  entry.role = p?.role;
  const allCredits = await databases.listDocuments({
    databaseId: db,
    collectionId: creditsCol,
    queries: [sdk.Query.equal("user_id", [entry.userId]), sdk.Query.limit(20)],
  });
  entry.creditsInDb = allCredits.total;
  entry.credits = allCredits.documents.map((c) => ({
    id: c.$id,
    hours: c.hours,
    model: c.aircraft_model_name,
    notes: String(c.notes || "").slice(0, 80),
  }));
}

console.log(JSON.stringify(report, null, 2));

const logPath = path.join(root, "debug-8edc56.log");
const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
fs.writeFileSync(
  logPath,
  existing + "\n" + JSON.stringify({ type: "db_audit", timestamp: Date.now(), report }) + "\n",
);
