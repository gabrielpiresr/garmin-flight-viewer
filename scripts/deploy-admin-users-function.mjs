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
  const variables = [];
  let offset = 0;
  while (true) {
    const page = await functions.listVariables({
      functionId,
      queries: [sdk.Query.limit(100), sdk.Query.offset(offset)],
    });
    variables.push(...(page.variables || []));
    if (!page.variables || page.variables.length < 100 || variables.length >= (page.total || 0)) break;
    offset += 100;
  }
  const existing = { variables };
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
  const productSalesCollectionId =
    process.env.APPWRITE_PRODUCT_SALES_COLLECTION_ID || env.VITE_APPWRITE_PRODUCT_SALES_COL_ID || "product_sales";
  const schoolCostsCollectionId =
    process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || env.VITE_APPWRITE_SCHOOL_COSTS_COL_ID || "school_costs";
  const instructorCostsCollectionId =
    process.env.APPWRITE_INSTRUCTOR_COSTS_COLLECTION_ID || env.VITE_APPWRITE_INSTRUCTOR_COSTS_COL_ID || "instructor_costs";
  const flightInstructorPaymentsCollectionId =
    process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID ||
    env.VITE_APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID ||
    "flight_instructor_payments";
  const fuelingsCollectionId = process.env.APPWRITE_FUELINGS_COLLECTION_ID || env.VITE_APPWRITE_FUELINGS_COL_ID || "aircraft_fuelings";
  const aircraftsCollectionId = process.env.APPWRITE_AIRCRAFTS_COLLECTION_ID || env.VITE_APPWRITE_AIRCRAFTS_COL_ID;
  const aircraftModelsCollectionId =
    process.env.APPWRITE_AIRCRAFT_MODELS_COLLECTION_ID || env.VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID;
  const maintenanceWorkOrdersCollectionId =
    process.env.APPWRITE_MAINTENANCE_WORK_ORDERS_COLLECTION_ID ||
    env.VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID ||
    "maintenance_work_orders";
  const financialMonthlyClosingsCollectionId =
    process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID ||
    env.VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID ||
    "financial_monthly_closings";
  const financialMonthlyClosingLinesCollectionId =
    process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID ||
    env.VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID ||
    "financial_monthly_closing_lines";
  const flightTelemetrySummariesCollectionId =
    process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID ||
    env.VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID;
  const flightLandingsCollectionId =
    process.env.APPWRITE_FLIGHT_LANDINGS_COLLECTION_ID || env.VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID;
  const flightTelemetryAlertsCollectionId =
    process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID ||
    env.VITE_APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID ||
    "flight_telemetry_alerts";
  const maneuversSectionsCollectionId =
    process.env.APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID;
  const maneuversSubsectionsCollectionId =
    process.env.APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID;
  const maneuversArticlesCollectionId =
    process.env.APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID || env.VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID;
  const helpSectionsCollectionId =
    process.env.APPWRITE_HELP_SECTIONS_COLLECTION_ID || env.VITE_APPWRITE_HELP_SECTIONS_COL_ID;
  const helpSubsectionsCollectionId =
    process.env.APPWRITE_HELP_SUBSECTIONS_COLLECTION_ID || env.VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID;
  const helpArticlesCollectionId =
    process.env.APPWRITE_HELP_ARTICLES_COLLECTION_ID || env.VITE_APPWRITE_HELP_ARTICLES_COL_ID;
  const platformSettingsCollectionId =
    process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID || env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
  const trainingTracksCollectionId =
    process.env.APPWRITE_TRAINING_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID || "training_tracks";
  const studentTracksCollectionId =
    process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID || "student_training_tracks";
  const pushSubscriptionsCollectionId =
    process.env.APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID || env.VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID;
  const notificationDeliveriesCollectionId =
    process.env.APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID || env.VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID;
  const webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || env.VITE_WEB_PUSH_PUBLIC_KEY;
  const webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || env.WEB_PUSH_PRIVATE_KEY;
  const webPushContact = process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com";
  const appUrl = process.env.APP_URL || env.VITE_APP_URL || "";
  const cfWorkerUrl = process.env.CF_WORKER_URL || env.VITE_CF_WORKER_URL || "";
  const workerSecret = process.env.WORKER_SECRET || env.WORKER_SECRET || env.VITE_CF_WORKER_SECRET || "";
  // Identificador da escola — isola dados em ambiente multi-tenant.
  const schoolId = process.env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";

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
  if (!aircraftsCollectionId) missing.push("VITE_APPWRITE_AIRCRAFTS_COL_ID");
  if (!aircraftModelsCollectionId) missing.push("VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID");
  if (!flightTelemetrySummariesCollectionId) missing.push("VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID");
  if (!flightLandingsCollectionId) missing.push("VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID");
  if (!maneuversSectionsCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID");
  if (!maneuversSubsectionsCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID");
  if (!maneuversArticlesCollectionId) missing.push("VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID");
  if (!helpSectionsCollectionId) missing.push("VITE_APPWRITE_HELP_SECTIONS_COL_ID");
  if (!helpSubsectionsCollectionId) missing.push("VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID");
  if (!helpArticlesCollectionId) missing.push("VITE_APPWRITE_HELP_ARTICLES_COL_ID");
  if (!platformSettingsCollectionId) missing.push("VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID");
  if (!pushSubscriptionsCollectionId) missing.push("VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID");
  if (!notificationDeliveriesCollectionId) missing.push("VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID");
  if (!cfWorkerUrl) missing.push("CF_WORKER_URL or VITE_CF_WORKER_URL");
  if (!workerSecret) missing.push("WORKER_SECRET");
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
  await upsertVariable(functions, "APPWRITE_PRODUCT_SALES_COLLECTION_ID", productSalesCollectionId);
  await upsertVariable(functions, "APPWRITE_SCHOOL_COSTS_COLLECTION_ID", schoolCostsCollectionId);
  await upsertVariable(functions, "APPWRITE_INSTRUCTOR_COSTS_COLLECTION_ID", instructorCostsCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID", flightInstructorPaymentsCollectionId);
  await upsertVariable(functions, "APPWRITE_FUELINGS_COLLECTION_ID", fuelingsCollectionId);
  await upsertVariable(functions, "APPWRITE_AIRCRAFTS_COLLECTION_ID", aircraftsCollectionId);
  await upsertVariable(functions, "APPWRITE_AIRCRAFT_MODELS_COLLECTION_ID", aircraftModelsCollectionId);
  await upsertVariable(functions, "APPWRITE_MAINTENANCE_WORK_ORDERS_COLLECTION_ID", maintenanceWorkOrdersCollectionId);
  await upsertVariable(functions, "APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID", financialMonthlyClosingsCollectionId);
  await upsertVariable(functions, "APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID", financialMonthlyClosingLinesCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID", flightTelemetrySummariesCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHT_LANDINGS_COLLECTION_ID", flightLandingsCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID", flightTelemetryAlertsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID", maneuversSectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID", maneuversSubsectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID", maneuversArticlesCollectionId);
  await upsertVariable(functions, "APPWRITE_HELP_SECTIONS_COLLECTION_ID", helpSectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_HELP_SUBSECTIONS_COLLECTION_ID", helpSubsectionsCollectionId);
  await upsertVariable(functions, "APPWRITE_HELP_ARTICLES_COLLECTION_ID", helpArticlesCollectionId);
  await upsertVariable(functions, "APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID", platformSettingsCollectionId);
  await upsertVariable(functions, "APPWRITE_TRAINING_TRACKS_COLLECTION_ID", trainingTracksCollectionId);
  await upsertVariable(functions, "APPWRITE_STUDENT_TRACKS_COLLECTION_ID", studentTracksCollectionId);
  await upsertVariable(functions, "APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID", pushSubscriptionsCollectionId);
  await upsertVariable(functions, "APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID", notificationDeliveriesCollectionId);
  if (webPushPublicKey) await upsertVariable(functions, "WEB_PUSH_PUBLIC_KEY", webPushPublicKey);
  if (webPushPrivateKey) await upsertVariable(functions, "WEB_PUSH_PRIVATE_KEY", webPushPrivateKey, true);
  await upsertVariable(functions, "WEB_PUSH_CONTACT", webPushContact);
  if (appUrl) await upsertVariable(functions, "APP_URL", appUrl);
  await upsertVariable(functions, "CF_WORKER_URL", cfWorkerUrl);
  await upsertVariable(functions, "WORKER_SECRET", workerSecret, true);
  await upsertVariable(functions, "SCHOOL_ID", schoolId);

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
