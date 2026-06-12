// Inspeção rápida: lista eventos da agenda SAGA via admin-users (saga-only mode)
import { Client, Functions } from "node-appwrite";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1")
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const functions = new Functions(client);

const execution = await functions.createExecution(
  env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID,
  JSON.stringify({ action: "sagaListSchedulesDirect", monthCount: 1 }),
  false,
);
const body = JSON.parse(execution.responseBody || "{}");
if (!body.ok) {
  console.error("FALHOU:", execution.responseStatusCode, body.message);
  process.exit(1);
}
const rows = (body.schedules || []).slice(-25);
for (const row of rows) {
  console.log(
    `${row.id} | ${row.startAtRaw} -> ${row.endAtRaw} | status=${row.status} active=${row.active} | ac=${row.aircraft} | aluno=${row.studentName}(${row.studentSagaId}) | instr=${row.instructorName || "-"}(${row.instructorSagaId || "-"}) | notes=${(row.notes || "").slice(0, 90)}`,
  );
}
console.log(`total mês: ${(body.schedules || []).length}`);
