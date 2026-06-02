import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  const entries = {};
  if (!fs.existsSync(filePath)) return entries;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const endpoint = env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const projectId = env.VITE_APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;
const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
const functions = new sdk.Functions(
  new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey),
);
const list = await functions.listExecutions({
  functionId,
  queries: [sdk.Query.orderDesc("$createdAt"), sdk.Query.limit(100)],
});

const sagaImports = [];

const outPath = path.join(root, "debug-8edc56.log");
const lines = [];

for (const ex of list.executions || []) {
  const full = await functions.getExecution({ functionId, executionId: ex.$id });
  const entry = {
    executionId: full.$id,
    status: full.status,
    responseStatusCode: full.responseStatusCode,
    durationSec: full.duration != null ? Number(full.duration) : null,
    responseBodyLength: (full.responseBody || "").length,
    createdAt: full.$createdAt,
    requestPath: full.requestPath,
    requestMethod: full.requestMethod,
    requestBodyPreview: String(full.requestBody || "").slice(0, 120),
  };
  const body = full.responseBody || "";
  if (String(full.requestBody || "").includes("sagaImportData")) entry.action = "sagaImportData";
  else if (String(full.requestBody || "").includes("sagaFetchUsers")) entry.action = "sagaFetchUsers";
  else if (String(full.requestBody || "").includes("sagaSaveImportMapping")) entry.action = "sagaSaveImportMapping";
  if (body) {
    try {
      const parsed = JSON.parse(body);
      entry.parsed = {
        ok: parsed.ok,
        message: parsed.message,
        summary: parsed.summary
          ? {
              testMode: parsed.summary.testMode,
              flightsCreated: parsed.summary.flightsCreated,
              flightsUpdated: parsed.summary.flightsUpdated,
              flightsSkipped: parsed.summary.flightsSkipped,
              duplicateFlights: parsed.summary.duplicateFlights,
              creditsCreated: parsed.summary.creditsCreated,
              creditsUpdated: parsed.summary.creditsUpdated,
              creditsSkipped: parsed.summary.creditsSkipped,
              creditHoursImported: parsed.summary.creditHoursImported,
              skippedFlights: parsed.summary.skippedFlights,
              skippedCredits: parsed.summary.skippedCredits,
              missing: parsed.summary.missing,
              logs: (parsed.summary.logs || []).filter((line) =>
                /credit|Credit|voo|Voo|skip|Skip|Erro|group|flight|import|Import|aluno|CANAC|mapping|mapeamento/i.test(line),
              ),
            }
          : undefined,
      };
      // Only keep saga import executions with summary
      if (!parsed.summary?.logs?.some((l) => /Voos:|Creditos:|Usuarios:/i.test(l))) {
        entry.note = "not_saga_import_or_incomplete";
      }
    } catch {
      entry.bodyPreview = body.slice(0, 500);
    }
  }
  if ((entry.durationSec && entry.durationSec > 1) || entry.responseBodyLength > 500) sagaImports.push(entry);
  if (entry.parsed?.summary || entry.action === "sagaImportData" || entry.responseBodyLength > 500 || (entry.durationSec && entry.durationSec > 1)) {
    lines.push(JSON.stringify(entry));
    console.log(JSON.stringify(entry, null, 2));
  }
}

console.log("\nLong executions (>2s):", sagaImports.length);
for (const item of sagaImports) {
  console.log(" -", item.executionId, item.durationSec + "s", item.status, item.action || "");
}

fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(`\nWrote ${lines.length} entries to ${outPath}`);
