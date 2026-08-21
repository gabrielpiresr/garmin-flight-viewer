/**
 * Dispara sync SAGA somente-voos cobrindo agosto (31 dias).
 * Nao commitar.
 */
import fs from "node:fs";
import * as sdk from "node-appwrite";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i)] = t.slice(i + 1);
}

const adminClient = new sdk.Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new sdk.Databases(adminClient);
const users = new sdk.Users(adminClient);
const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID;

const profiles = await db.listDocuments({
  databaseId: env.VITE_APPWRITE_DATABASE_ID,
  collectionId: env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
  queries: [sdk.Query.equal("role", ["admin"]), sdk.Query.limit(10)],
});
const adminProfile = (profiles.documents || []).find((doc) => doc.user_id);
if (!adminProfile?.user_id) {
  throw new Error("Nenhum perfil admin encontrado.");
}
console.log(`Admin: ${adminProfile.full_name || adminProfile.user_id}`);

const jwt = await users.createJWT({ userId: adminProfile.user_id, duration: 3600 });
const userClient = new sdk.Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setJWT(jwt.jwt);
const functions = new sdk.Functions(userClient);

const importRunId = `saga-august-adopt-${Date.now()}`;
console.log(`Disparando sagaSyncAllUsersFlightsOnly run=${importRunId} operationsDays=31`);
const created = await functions.createExecution({
  functionId,
  body: JSON.stringify({
    action: "sagaSyncAllUsersFlightsOnly",
    operationsDays: 31,
    importRunId,
  }),
  async: true,
});
console.log(`execution ${created.$id} status=${created.status}`);

const poll = new sdk.Functions(adminClient);
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const execution = await poll.getExecution({ functionId, executionId: created.$id });
  console.log(`[${attempt + 1}] ${execution.status} http=${execution.responseStatusCode || "-"}`);
  if (execution.status === "completed" || execution.status === "failed") {
    const body = execution.responseBody || "";
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body.slice(0, 2000) };
    }
    console.log(JSON.stringify({
      status: execution.status,
      http: execution.responseStatusCode,
      durationMs: execution.duration,
      errors: execution.errors || "",
      ok: parsed?.ok,
      skipped: parsed?.skipped,
      message: parsed?.message,
      flightsCreated: parsed?.flightsCreated,
      flightsDeleted: parsed?.flightsDeleted,
      adoptedFlights: parsed?.summary?.adoptedFlights || parsed?.adoptedFlights,
      logs: (parsed?.logs || parsed?.summary?.logs || []).slice(-20),
    }, null, 2));
    if (execution.status === "failed" || execution.responseStatusCode >= 400) process.exit(1);
    break;
  }
}
