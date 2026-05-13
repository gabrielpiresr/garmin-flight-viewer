import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const archivePath = path.join(root, ".tmp", "admin-users-function.tar.gz");
const functionId = process.env.ADMIN_USERS_FUNCTION_ID || "admin-users";

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

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

async function upsertVariable(functions, key, value, secret = false) {
  const existing = await functions.listVariables({ functionId });
  const current = existing.variables.find((variable) => variable.key === key);
  if (current) {
    await functions.updateVariable({
      functionId,
      variableId: current.$id,
      key,
      value,
      secret,
    });
    return;
  }
  await functions.createVariable({
    functionId,
    variableId: sdk.ID.unique(),
    key,
    value,
    secret,
  });
}

async function ensureFunction(functions) {
  const params = {
    functionId,
    name: "Admin Users",
    runtime: sdk.Runtime.Node22,
    execute: [sdk.Role.users()],
    events: [],
    schedule: "",
    timeout: 60,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
    scopes: [
      sdk.Scopes.UsersRead,
      sdk.Scopes.UsersWrite,
      sdk.Scopes.DatabasesRead,
      sdk.Scopes.DatabasesWrite,
    ],
  };

  try {
    await functions.get({ functionId });
    await functions.update(params);
    console.log(`Function updated: ${functionId}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await functions.create(params);
    console.log(`Function created: ${functionId}`);
  }
}

async function waitForDeployment(functions, deploymentId) {
  for (let i = 0; i < 60; i += 1) {
    const deployment = await functions.getDeployment({ functionId, deploymentId });
    const status = deployment.status || deployment.$status;
    if (status === "ready" || status === "failed") return deployment;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return functions.getDeployment({ functionId, deploymentId });
}

async function main() {
  const env = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
  const profilesCollectionId = process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
  const flightsCollectionId = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;
  const weeklyPlansCollectionId =
    process.env.APPWRITE_WEEKLY_PLANS_COLLECTION_ID || env.VITE_APPWRITE_WEEKLY_PLANS_COL_ID;
  const instructorPrefsCollectionId =
    process.env.APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID || env.VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID;
  const studentCreditsCollectionId =
    process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID || env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID;
  const maneuversSectionsCollectionId =
    process.env.APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID;
  const maneuversSubsectionsCollectionId =
    process.env.APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID;
  const maneuversArticlesCollectionId =
    process.env.APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID;
  const platformSettingsCollectionId =
    process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID || env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
  const pushSubscriptionsCollectionId =
    process.env.APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID || env.VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID;
  const notificationDeliveriesCollectionId =
    process.env.APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID || env.VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID;
  const webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || env.VITE_WEB_PUSH_PUBLIC_KEY;
  const webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || env.WEB_PUSH_PRIVATE_KEY;
  const webPushContact = process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com";
  const appUrl = process.env.APP_URL || env.VITE_APP_URL || "";

  const missing = [];
  if (!endpoint) missing.push("VITE_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("VITE_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("VITE_APPWRITE_DATABASE_ID");
  if (!profilesCollectionId) missing.push("VITE_APPWRITE_PROFILES_COLLECTION_ID");
  if (!flightsCollectionId) missing.push("VITE_APPWRITE_COLLECTION_ID");
  if (!weeklyPlansCollectionId) missing.push("VITE_APPWRITE_WEEKLY_PLANS_COL_ID");
  if (!instructorPrefsCollectionId) missing.push("VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID");
  if (!studentCreditsCollectionId) missing.push("VITE_APPWRITE_STUDENT_CREDITS_COL_ID");
  if (!maneuversSectionsCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID");
  if (!maneuversSubsectionsCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID");
  if (!maneuversArticlesCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID");
  if (!platformSettingsCollectionId) missing.push("VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID");
  if (!pushSubscriptionsCollectionId) missing.push("VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID");
  if (!notificationDeliveriesCollectionId) missing.push("VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID");
  if (!webPushPublicKey) missing.push("VITE_WEB_PUSH_PUBLIC_KEY");
  if (!webPushPrivateKey) missing.push("WEB_PUSH_PRIVATE_KEY");
  if (!fs.existsSync(archivePath)) missing.push(archivePath);
  if (missing.length) throw new Error(`Missing required values: ${missing.join(", ")}`);

  const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const functions = new sdk.Functions(client);

  await ensureFunction(functions);
  await upsertVariable(functions, "APPWRITE_API_KEY", apiKey, true);
  await upsertVariable(functions, "APPWRITE_DATABASE_ID", databaseId);
  await upsertVariable(functions, "APPWRITE_PROFILES_COLLECTION_ID", profilesCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHTS_COLLECTION_ID", flightsCollectionId);
  await upsertVariable(functions, "APPWRITE_WEEKLY_PLANS_COLLECTION_ID", weeklyPlansCollectionId);
  await upsertVariable(functions, "APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID", instructorPrefsCollectionId);
  await upsertVariable(functions, "APPWRITE_STUDENT_CREDITS_COLLECTION_ID", studentCreditsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID", maneuversSectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID", maneuversSubsectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID", maneuversArticlesCollectionId);
  await upsertVariable(functions, "APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID", platformSettingsCollectionId);
  await upsertVariable(functions, "APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID", pushSubscriptionsCollectionId);
  await upsertVariable(functions, "APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID", notificationDeliveriesCollectionId);
  await upsertVariable(functions, "WEB_PUSH_PUBLIC_KEY", webPushPublicKey);
  await upsertVariable(functions, "WEB_PUSH_PRIVATE_KEY", webPushPrivateKey, true);
  await upsertVariable(functions, "WEB_PUSH_CONTACT", webPushContact);
  if (appUrl) await upsertVariable(functions, "APP_URL", appUrl);

  const buffer = fs.readFileSync(archivePath);
  const code = new File([buffer], "admin-users-function.tar.gz", { type: "application/gzip" });
  const deployment = await functions.createDeployment({
    functionId,
    code,
    activate: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
  console.log(`Deployment created: ${deployment.$id}`);
  const finalDeployment = await waitForDeployment(functions, deployment.$id);
  console.log(`Deployment status: ${finalDeployment.status || finalDeployment.$status || "unknown"}`);

  upsertEnvLine(envPath, "VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID", functionId);
  console.log("Updated .env.local with VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
