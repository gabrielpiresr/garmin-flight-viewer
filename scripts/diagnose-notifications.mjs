import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = env.VITE_APPWRITE_DATABASE_ID;
const platformCol = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const flightsCol = env.VITE_APPWRITE_COLLECTION_ID;
const deliveriesCol = env.VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID;
const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
const adminUserId = env.VITE_ADMIN_USER_ID;

if (!apiKey) {
  console.error("Missing APPWRITE_API_KEY");
  process.exit(1);
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new sdk.Databases(client);
const functions = new sdk.Functions(client);
const users = new sdk.Users(client);

async function main() {
  const settingsRes = await db.listDocuments(databaseId, platformCol, [
    sdk.Query.equal("key", ["email"]),
    sdk.Query.limit(1),
  ]);
  if (settingsRes.documents[0]) {
    const s = JSON.parse(settingsRes.documents[0].settings_json);
    console.log("Email settings:", {
      enabled: s.enabled,
      fromEmail: s.fromEmail,
      hasResendKey: Boolean(s.resendApiKey),
      keyLen: (s.resendApiKey || "").length,
    });
  } else {
    console.log("Email settings: NO DOC (defaults = disabled)");
  }

  const rulesRes = await db.listDocuments(databaseId, platformCol, [
    sdk.Query.equal("key", ["schoolRules"]),
    sdk.Query.limit(1),
  ]);
  if (rulesRes.documents[0]) {
    const r = JSON.parse(rulesRes.documents[0].settings_json);
    console.log("Flight email rules:", {
      scheduled: r.emailNotifications?.["flight.scheduled"],
      updated: r.emailNotifications?.["flight.updated"],
    });
  }

  const flightsRes = await db.listDocuments(databaseId, flightsCol, [
    sdk.Query.orderDesc("$createdAt"),
    sdk.Query.limit(5),
  ]);
  console.log("\nRecent flights:");
  for (const f of flightsRes.documents) {
    console.log(
      `  ${f.$id} student=${f.student_user_id || f.user_id || "(none)"} instructor=${f.instructor_user_id || "(none)"}`,
    );
  }

  if (deliveriesCol) {
    const delRes = await db.listDocuments(databaseId, deliveriesCol, [
      sdk.Query.orderDesc("$createdAt"),
      sdk.Query.limit(10),
    ]);
    console.log("\nRecent notification deliveries:");
    for (const row of delRes.documents) {
      console.log(
        `  ${row.event_type} ${row.channel} ${row.status} recipient=${row.recipient_user_id} provider=${row.provider_message_id || "-"} err=${row.error || ""}`,
      );
    }
  }

  const sampleFlight = flightsRes.documents.find((f) => f.student_user_id || f.user_id);
  if (!sampleFlight || !adminUserId) {
    console.log("\nSkip dispatch test: need flight with student and VITE_ADMIN_USER_ID");
    return;
  }

  const studentId = sampleFlight.student_user_id || sampleFlight.user_id;
  let studentEmail = "";
  try {
    const u = await users.get({ userId: studentId });
    studentEmail = u.email || "";
  } catch {
    studentEmail = "(user lookup failed)";
  }
  console.log(`\nStudent ${studentId} email: ${studentEmail || "(empty)"}`);

  const dedupeKey = `diagnostic.test:${Date.now()}`;
  const body = JSON.stringify({
    action: "dispatchEvent",
    event: {
      eventType: "flight.updated",
      flightId: sampleFlight.$id,
      dedupeKey,
      channels: ["email"],
      data: { aircraft: sampleFlight.aircraft_ident || "TEST", flightDate: "2026-05-21", startTime: "10:00" },
    },
  });

  console.log("\nExecuting dispatchEvent (body only, no spoofed x-appwrite headers)...");
  const execution = await functions.createExecution({
    functionId,
    body,
    async: false,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  console.log("Execution status:", execution.status, "HTTP", execution.responseStatusCode);
  console.log("Response body:", execution.responseBody?.slice(0, 1200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
