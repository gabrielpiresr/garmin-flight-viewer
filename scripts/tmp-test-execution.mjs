import { Client, Functions } from "node-appwrite";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split(/\r?\n/)
    .flatMap((l) => {
      const i = l.indexOf("=");
      return i <= 0 || l.startsWith("#") ? [] : [[l.slice(0, i).trim(), l.slice(i + 1).trim()]];
    }),
);

const fn = new Functions(
  new Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID),
);
const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
console.log("functionId", functionId);

try {
  const created = await fn.createExecution({
    functionId,
    body: JSON.stringify({ action: "sagaGetLastImportSummary" }),
    async: false,
  });
  console.log("sync exec id", created.$id, "status", created.status);
} catch (e) {
  console.error("sync failed", e.message);
}

try {
  const created = await fn.createExecution({
    functionId,
    body: JSON.stringify({ action: "sagaGetLastImportSummary" }),
    async: true,
  });
  console.log("async exec id", created.$id, "status", created.status);
  const got = await fn.getExecution({ functionId, executionId: created.$id });
  console.log("getExecution ok", got.status);
} catch (e) {
  console.error("async/get failed", e.message);
}

// Test deprecated positional API used in sagaImportDb
try {
  const created = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaGetLastImportSummary" }),
    true,
  );
  console.log("deprecated async exec id", created.$id, "status", created.status);
  const got = await fn.getExecution(functionId, created.$id);
  console.log("deprecated getExecution ok", got.status);
} catch (e) {
  console.error("deprecated async/get failed", e.message);
}
