import { Query } from "appwrite";
import {
  account,
  databases,
  DEFAULT_SCHOOL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
} from "./appwrite";
import type { FplPlanForm, FplProTips, FplSavedPlan, FplPlanStatus } from "../types/fplSim";
import { emptyFplForm } from "./fplSimCatalog";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PLANS_COL =
  (import.meta.env.VITE_APPWRITE_FPL_SIM_PLANS_COL_ID as string | undefined) ?? "fpl_sim_plans";
const TIPS_COL =
  (import.meta.env.VITE_APPWRITE_FPL_SIM_TIPS_COL_ID as string | undefined) ?? "fpl_sim_tips";

const PLANS_LOCAL = "gfv_fpl_sim_plans_v1";
const TIPS_LOCAL = "gfv_fpl_sim_tips_v1";

function cloudReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && account && DB_ID);
}

async function userId(): Promise<string> {
  if (!account) throw new Error("Appwrite não configurado.");
  const me = await account.get();
  return me.$id;
}

function ownerPerms(uid: string): string[] {
  return [
    Permission.read(Role.user(uid)),
    Permission.update(Role.user(uid)),
    Permission.delete(Role.user(uid)),
  ];
}

function parseForm(raw: unknown): FplPlanForm {
  const base = emptyFplForm("pvs");
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<FplPlanForm>;
  return {
    ...base,
    ...obj,
    eq10a: Array.isArray(obj.eq10a) ? obj.eq10a.map(String) : [],
    eq10b: Array.isArray(obj.eq10b) ? obj.eq10b.map(String) : [],
    item18Keys: Array.isArray(obj.item18Keys) ? obj.item18Keys.map(String) : [],
    item18: obj.item18 && typeof obj.item18 === "object" ? { ...obj.item18 } : {},
    item19: { ...base.item19, ...(obj.item19 ?? {}) },
  };
}

function toSaved(doc: Record<string, unknown>, fallbackUser: string, fallbackSchool: string): FplSavedPlan {
  let form: FplPlanForm = emptyFplForm("pvs");
  try {
    form = parseForm(typeof doc.form_json === "string" ? JSON.parse(doc.form_json) : doc.form_json);
  } catch {
    form = emptyFplForm("pvs");
  }
  let lastErrors: string[] = [];
  try {
    const parsed = typeof doc.last_errors_json === "string" ? JSON.parse(doc.last_errors_json) : doc.last_errors_json;
    lastErrors = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    lastErrors = [];
  }
  return {
    id: String(doc.$id || doc.id || ""),
    userId: String(doc.user_id || fallbackUser),
    schoolId: String(doc.school_id || fallbackSchool),
    status: (doc.status as FplPlanStatus) || "draft",
    form,
    lastErrors,
    createdAt: String(doc.created_at || doc.$createdAt || new Date().toISOString()),
    updatedAt: String(doc.updated_at || doc.$updatedAt || new Date().toISOString()),
  };
}

function localKey(userIdValue: string): string {
  return `${PLANS_LOCAL}:${userIdValue}`;
}

function readLocalPlans(userIdValue: string): FplSavedPlan[] {
  try {
    const raw = localStorage.getItem(localKey(userIdValue));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FplSavedPlan[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPlans(userIdValue: string, plans: FplSavedPlan[]) {
  localStorage.setItem(localKey(userIdValue), JSON.stringify(plans));
}

export async function listFplPlans(userIdValue: string, schoolId: string): Promise<FplSavedPlan[]> {
  if (cloudReady() && databases) {
    try {
      const res = await databases.listDocuments(DB_ID!, PLANS_COL, [
        Query.equal("user_id", userIdValue),
        Query.orderDesc("$updatedAt"),
        Query.limit(100),
      ]);
      return res.documents.map((doc) => toSaved(doc as unknown as Record<string, unknown>, userIdValue, schoolId));
    } catch {
      /* fallback local */
    }
  }
  return readLocalPlans(userIdValue).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveFplPlan(input: {
  id?: string;
  userId: string;
  schoolId: string;
  form: FplPlanForm;
  status: FplPlanStatus;
  lastErrors: string[];
}): Promise<FplSavedPlan> {
  const now = new Date().toISOString();
  const payload = {
    user_id: input.userId,
    school_id: input.schoolId || DEFAULT_SCHOOL_ID,
    kind: input.form.kind,
    status: input.status,
    dep_ad: input.form.depAd.trim().toUpperCase(),
    dest_ad: input.form.destAd.trim().toUpperCase(),
    eobt: input.form.depTime,
    form_json: JSON.stringify(input.form),
    last_errors_json: JSON.stringify(input.lastErrors),
    created_at: now,
    updated_at: now,
  };

  if (cloudReady() && databases) {
    try {
      const uid = await userId();
      if (input.id) {
        const { created_at: _created, ...updatePayload } = payload;
        const doc = await databases.updateDocument(DB_ID!, PLANS_COL, input.id, updatePayload);
        return toSaved(doc as unknown as Record<string, unknown>, input.userId, input.schoolId);
      }
      const doc = await databases.createDocument(DB_ID!, PLANS_COL, ID.unique(), payload, ownerPerms(uid));
      return toSaved(doc as unknown as Record<string, unknown>, input.userId, input.schoolId);
    } catch {
      /* local fallback */
    }
  }

  const existing = readLocalPlans(input.userId);
  if (input.id) {
    const next = existing.map((plan) =>
      plan.id === input.id
        ? { ...plan, form: input.form, status: input.status, lastErrors: input.lastErrors, updatedAt: now }
        : plan,
    );
    writeLocalPlans(input.userId, next);
    return next.find((plan) => plan.id === input.id)!;
  }
  const created: FplSavedPlan = {
    id: crypto.randomUUID(),
    userId: input.userId,
    schoolId: input.schoolId,
    status: input.status,
    form: input.form,
    lastErrors: input.lastErrors,
    createdAt: now,
    updatedAt: now,
  };
  writeLocalPlans(input.userId, [created, ...existing]);
  return created;
}

export async function deleteFplPlan(id: string, userIdValue: string): Promise<void> {
  if (cloudReady() && databases) {
    try {
      await databases.deleteDocument(DB_ID!, PLANS_COL, id);
      return;
    } catch {
      /* local */
    }
  }
  writeLocalPlans(
    userIdValue,
    readLocalPlans(userIdValue).filter((plan) => plan.id !== id),
  );
}

function readLocalTips(schoolId: string): FplProTips {
  try {
    const raw = localStorage.getItem(`${TIPS_LOCAL}:${schoolId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as FplProTips) : {};
  } catch {
    return {};
  }
}

export async function getFplProTips(schoolId: string): Promise<FplProTips> {
  if (cloudReady() && databases) {
    try {
      const res = await databases.listDocuments(DB_ID!, TIPS_COL, [Query.equal("school_id", schoolId), Query.limit(1)]);
      const doc = res.documents[0] as { tips_json?: string } | undefined;
      if (doc?.tips_json) return JSON.parse(doc.tips_json) as FplProTips;
    } catch {
      /* local */
    }
  }
  return readLocalTips(schoolId);
}

export async function saveFplProTips(schoolId: string, tips: FplProTips): Promise<void> {
  localStorage.setItem(`${TIPS_LOCAL}:${schoolId}`, JSON.stringify(tips));
  if (!cloudReady() || !databases) return;
  try {
    const res = await databases.listDocuments(DB_ID!, TIPS_COL, [Query.equal("school_id", schoolId), Query.limit(1)]);
    const payload = { school_id: schoolId, tips_json: JSON.stringify(tips) };
    const existing = res.documents[0];
    if (existing) {
      await databases.updateDocument(DB_ID!, TIPS_COL, existing.$id, payload);
    } else {
      await databases.createDocument(DB_ID!, TIPS_COL, ID.unique(), payload, [
        Permission.read(Role.users()),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ]);
    }
  } catch {
    /* already saved locally */
  }
}
