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

const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
const functions = new sdk.Functions(
  new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY),
);

const list = await functions.listExecutions({
  functionId,
  queries: [sdk.Query.orderDesc("$createdAt"), sdk.Query.limit(100)],
});

const out = [];
for (const ex of list.executions || []) {
  const full = await functions.getExecution({ functionId, executionId: ex.$id });
  const logs = full.logs || "";
  if (!/sagaImportData|sagaFetchUsers|sagaSaveImportMapping/.test(logs)) continue;
  const action = logs.match(/action=(\w+)/)?.[1] || "?";
  const row = {
    executionId: full.$id,
    action,
    status: full.status,
    responseStatusCode: full.responseStatusCode,
    duration: full.duration,
    responseBodyLength: (full.responseBody || "").length,
    createdAt: full.$createdAt,
    logs,
  };
  out.push(row);
  if (action === "sagaImportData") {
    console.log(JSON.stringify(row, null, 2));
    if (full.responseBody) {
      const parsed = JSON.parse(full.responseBody);
      const s = parsed.summary;
      console.log("SUMMARY:", JSON.stringify({
        ok: parsed.ok,
        flightsCreated: s?.flightsCreated,
        flightsUpdated: s?.flightsUpdated,
        flightsSkipped: s?.flightsSkipped,
        skippedFlights: s?.skippedFlights,
        creditsCreated: s?.creditsCreated,
        creditsSkipped: s?.creditsSkipped,
        skippedCredits: s?.skippedCredits,
        missing: s?.missing,
        logs: (s?.logs || []).slice(-25),
      }, null, 2));
    } else {
      console.log("NO RESPONSE BODY (Appwrite API returned empty)");
    }
  }
}

const logPath = path.join(root, "debug-8edc56.log");
fs.writeFileSync(logPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`\nFound ${out.length} saga-related executions. Wrote ${logPath}`);
