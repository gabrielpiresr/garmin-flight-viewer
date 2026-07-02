import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

function upsertEnv(file, key, value) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const next = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = next;
  else lines.push(next);
  fs.writeFileSync(file, lines.join("\n"));
}

const env = parseEnv(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
if (!endpoint || !projectId || !apiKey || !databaseId) throw new Error("Configure endpoint, project, API key e database do Appwrite.");

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const perms = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];
const docPerms = [
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const collections = [
  {
    id: "student_automations", name: "Student Automations", env: "VITE_APPWRITE_STUDENT_AUTOMATIONS_COL_ID",
    attrs: [
      ["string", "school_id", 64, true], ["string", "name", 160, true], ["string", "description", 1000, false],
      ["string", "status", 16, true, "draft"], ["integer", "version", true, 1], ["string", "trigger_type", 64, true],
      ["string", "trigger_config_json", 4096, true], ["string", "conditions_json", 16384, true], ["string", "steps_json", 32768, true],
      ["integer", "cooldown_minutes", true, 10080], ["datetime", "baseline_at", false], ["datetime", "last_run_at", false],
      ["integer", "run_count", true, 0], ["integer", "success_count", true, 0], ["integer", "failure_count", true, 0],
      ["string", "created_by", 64, false], ["string", "updated_by", 64, false], ["datetime", "deleted_at", false],
    ],
    indexes: [["automations_school_status_idx", ["school_id", "status"]], ["automations_trigger_idx", ["trigger_type"]], ["automations_updated_idx", ["$updatedAt"], ["DESC"]]],
  },
  {
    id: "student_automation_states", name: "Student Automation States", env: "VITE_APPWRITE_AUTOMATION_STATES_COL_ID",
    attrs: [["string", "automation_id", 64, true], ["string", "student_user_id", 64, true], ["string", "state_key", 160, true], ["boolean", "last_match", true, false], ["boolean", "armed", true, true], ["string", "last_value_json", 4096, false], ["datetime", "last_triggered_at", false], ["datetime", "cooldown_until", false], ["datetime", "updated_at", true]],
    indexes: [["automation_state_unique_idx", ["state_key"], ["ASC"], "unique"], ["automation_state_student_idx", ["student_user_id"]], ["automation_state_automation_idx", ["automation_id"]]],
  },
  {
    id: "student_automation_runs", name: "Student Automation Runs", env: "VITE_APPWRITE_AUTOMATION_RUNS_COL_ID",
    attrs: [["string", "automation_id", 64, true], ["string", "automation_name", 160, true], ["integer", "automation_version", true, 1], ["string", "student_user_id", 64, true], ["string", "student_name", 160, true], ["string", "trigger_type", 64, true], ["string", "status", 32, true], ["integer", "current_step", true, 0], ["string", "root_run_id", 64, true], ["integer", "chain_depth", true, 0], ["string", "context_json", 32768, true], ["string", "flow_snapshot_json", 65535, true], ["string", "error", 2048, false], ["datetime", "started_at", true], ["datetime", "completed_at", false], ["boolean", "test_mode", true, false]],
    indexes: [["automation_runs_started_idx", ["started_at"], ["DESC"]], ["automation_runs_automation_idx", ["automation_id"]], ["automation_runs_student_idx", ["student_user_id"]], ["automation_runs_status_idx", ["status"]]],
  },
  {
    id: "student_automation_step_runs", name: "Student Automation Step Runs", env: "VITE_APPWRITE_AUTOMATION_STEP_RUNS_COL_ID",
    attrs: [["string", "run_id", 64, true], ["string", "automation_id", 64, true], ["string", "step_id", 64, true], ["integer", "step_index", true], ["string", "step_type", 32, true], ["string", "recipient_user_id", 64, false], ["string", "recipient_label", 160, false], ["string", "channel", 32, true], ["string", "status", 32, true], ["string", "provider_message_id", 255, false], ["string", "resolved_content_json", 32768, false], ["string", "error", 2048, false], ["integer", "duration_ms", false], ["datetime", "created_at", true], ["datetime", "completed_at", false]],
    indexes: [["automation_steps_run_idx", ["run_id", "step_index"]], ["automation_steps_status_idx", ["status"]], ["automation_steps_channel_idx", ["channel"]], ["automation_steps_created_idx", ["created_at"], ["DESC"]]],
  },
  {
    id: "student_automation_jobs", name: "Student Automation Jobs", env: "VITE_APPWRITE_AUTOMATION_JOBS_COL_ID",
    attrs: [["string", "run_id", 64, true], ["string", "automation_id", 64, true], ["string", "status", 32, true], ["datetime", "due_at", true], ["integer", "step_index", true], ["string", "execution_id", 64, false], ["string", "token_hash", 64, true], ["datetime", "created_at", true], ["datetime", "completed_at", false]],
    indexes: [["automation_jobs_status_due_idx", ["status", "due_at"]], ["automation_jobs_run_idx", ["run_id"]], ["automation_jobs_automation_idx", ["automation_id"]]],
  },
  {
    id: "student_automation_email_templates", name: "Student Automation Email Templates", env: "VITE_APPWRITE_AUTOMATION_EMAIL_TEMPLATES_COL_ID",
    attrs: [["string", "school_id", 64, true], ["string", "name", 160, true], ["string", "subject", 255, true], ["string", "body_html", 65535, true], ["string", "body_json", 65535, false], ["boolean", "active", true, true], ["string", "created_by", 64, false], ["string", "updated_by", 64, false]],
    indexes: [["automation_templates_school_idx", ["school_id"]], ["automation_templates_name_idx", ["name"]]],
  },
  {
    id: "student_crm_statuses", name: "Student CRM Statuses", env: "VITE_APPWRITE_STUDENT_CRM_STATUSES_COL_ID",
    attrs: [["string", "school_id", 64, true], ["string", "name", 80, true], ["string", "color", 16, true], ["integer", "order", true], ["boolean", "is_default", true, false], ["boolean", "archived", true, false]],
    indexes: [["student_crm_status_school_idx", ["school_id", "order"]], ["student_crm_status_default_idx", ["school_id", "is_default"]]],
  },
  {
    id: "student_crm_profiles", name: "Student CRM Profiles", env: "VITE_APPWRITE_STUDENT_CRM_PROFILES_COL_ID",
    attrs: [["string", "school_id", 64, true], ["string", "student_user_id", 64, true], ["string", "status_id", 64, true], ["string", "changed_by", 64, false], ["string", "origin_run_id", 64, false], ["integer", "chain_depth", true, 0], ["datetime", "changed_at", true]],
    indexes: [["student_crm_profile_unique_idx", ["student_user_id"], ["ASC"], "unique"], ["student_crm_profile_status_idx", ["status_id"]], ["student_crm_profile_school_idx", ["school_id"]]],
  },
];

async function ensureCollection(spec) {
  try {
    return await databases.getCollection(databaseId, spec.id);
  } catch (error) {
    if (error?.code !== 404) throw error;
    return databases.createCollection(databaseId, spec.id, spec.name, perms, true, true);
  }
}

async function ensureAttr(collectionId, spec) {
  const [type, key, ...args] = spec;
  try {
    if (type === "string") await databases.createStringAttribute(databaseId, collectionId, key, args[0], args[1], args[1] ? undefined : args[2]);
    else if (type === "integer") await databases.createIntegerAttribute(databaseId, collectionId, key, args[0], undefined, undefined, args[0] ? undefined : args[1]);
    else if (type === "boolean") await databases.createBooleanAttribute(databaseId, collectionId, key, args[0], args[0] ? undefined : args[1]);
    else if (type === "datetime") await databases.createDatetimeAttribute(databaseId, collectionId, key, args[0]);
    await sleep(350);
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes("already exists")) throw error;
  }
}

async function ensureIndex(collectionId, spec) {
  const [key, attrs, orders = attrs.map(() => "ASC"), type = "key"] = spec;
  try {
    await databases.createIndex(databaseId, collectionId, key, type, attrs, orders);
    await sleep(350);
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes("already exists")) throw error;
  }
}

async function seedStatuses() {
  const existing = await databases.listDocuments(databaseId, "student_crm_statuses", []);
  if ((existing.total || 0) > 0) return;
  const defaults = [
    ["Ativo", "#10b981", 10, true], ["Em risco", "#f59e0b", 20, false], ["Pausado", "#64748b", 30, false],
    ["Concluído", "#38bdf8", 40, false], ["Desistente", "#f43f5e", 50, false],
  ];
  for (const [name, color, order, isDefault] of defaults) {
    await databases.createDocument(databaseId, "student_crm_statuses", `default_${order}`, { school_id: env.VITE_SCHOOL_ID || "escola_principal", name, color, order, is_default: isDefault, archived: false }, docPerms);
  }
}

console.log("Configurando CRM de automações de alunos...");
for (const spec of collections) {
  const collection = await ensureCollection(spec);
  console.log(`- ${spec.name} (${collection.$id})`);
  for (const attr of spec.attrs) await ensureAttr(collection.$id, attr);
  for (const index of spec.indexes) await ensureIndex(collection.$id, index);
  upsertEnv(envPath, spec.env, collection.$id);
}
await seedStatuses();
console.log("Setup concluído. IDs gravados em .env.local.");
