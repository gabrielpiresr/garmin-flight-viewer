import { Query } from "appwrite";
import {
  BUCKET_ID,
  databases,
  ID,
  isAppwriteConfigured,
  JOURNEY_REWARDS_COL_ID,
  Permission,
  Role, DEFAULT_SCHOOL_ID,
  storage,
} from "./appwrite";
import { DEFAULT_REWARD_ICON_ID, rewardIconExists } from "./rewardIcons";
import type { JourneyReward, JourneyRewardInput, RewardMetric, RewardOperator, RewardRules, RewardVisual } from "../types/rewards";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

const DEFAULT_RULES: RewardRules = { mode: "all", conditions: [{ metric: "flight_count", operator: "gte", value: 1 }] };
const DEFAULT_VISUAL: RewardVisual = { type: "libraryIcon", iconId: DEFAULT_REWARD_ICON_ID, colorMode: "school" };

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && JOURNEY_REWARDS_COL_ID);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanVisual(value: unknown): RewardVisual {
  const visual = parseJson<RewardVisual>(value, DEFAULT_VISUAL);
  if (visual.type === "uploadedImage" && visual.imageUrl) {
    return {
      type: "uploadedImage",
      imageUrl: visual.imageUrl,
      imageFileId: visual.imageFileId ?? null,
      colorMode: visual.colorMode,
      color: visual.color,
    };
  }
  return {
    type: "libraryIcon",
    iconId:
      visual.type === "libraryIcon" && rewardIconExists(visual.iconId)
        ? visual.iconId
        : DEFAULT_REWARD_ICON_ID,
    colorMode: visual.type === "libraryIcon" ? visual.colorMode ?? "school" : "school",
    color: visual.type === "libraryIcon" ? visual.color : undefined,
  };
}

function cleanRules(value: unknown): RewardRules {
  const rules = parseJson<RewardRules>(value, DEFAULT_RULES);
  const mode = rules.mode === "any" ? "any" : "all";
  const conditions = Array.isArray(rules.conditions)
    ? rules.conditions
        .filter((condition) => condition && typeof condition.metric === "string")
        .map((condition) => ({
          metric: condition.metric as RewardMetric,
          operator: (condition.operator === "lte" || condition.operator === "eq" ? condition.operator : "gte") as RewardOperator,
          value: Number.isFinite(Number(condition.value)) ? Number(condition.value) : 0,
        }))
    : [];
  return { mode, conditions: conditions.length > 0 ? conditions : DEFAULT_RULES.conditions };
}

function toReward(doc: Record<string, unknown>): JourneyReward {
  const kind = doc.kind === "achievement" ? "achievement" : "badge";
  return {
    id: doc.$id as string,
    schoolId: typeof doc.school_id === "string" ? doc.school_id : DEFAULT_SCHOOL_ID,
    kind,
    trackId: typeof doc.track_id === "string" && doc.track_id ? doc.track_id : null,
    title: typeof doc.title === "string" ? doc.title : "Recompensa",
    description: typeof doc.description === "string" ? doc.description : "",
    visual: cleanVisual(doc.visual_json),
    rules: cleanRules(doc.rules_json),
    isActive: Boolean(doc.is_active),
    order: typeof doc.order === "number" ? doc.order : 0,
    updatedAt: typeof doc.updated_at === "string" ? doc.updated_at : String(doc.$updatedAt ?? ""),
    createdAt: typeof doc.$createdAt === "string" ? doc.$createdAt : undefined,
  };
}

function toPayload(input: JourneyRewardInput): Record<string, unknown> {
  return {
    school_id: input.schoolId || DEFAULT_SCHOOL_ID,
    kind: input.kind,
    track_id: input.kind === "achievement" ? input.trackId ?? null : null,
    title: input.title.trim(),
    description: input.description.trim(),
    visual_json: JSON.stringify(input.visual),
    rules_json: JSON.stringify(input.rules),
    is_active: input.isActive,
    order: Math.round(input.order || 0),
    updated_at: new Date().toISOString(),
  };
}

export function defaultRewardInput(kind: JourneyRewardInput["kind"], trackId: string | null = null): JourneyRewardInput {
  return {
    schoolId: DEFAULT_SCHOOL_ID,
    kind,
    trackId: kind === "achievement" ? trackId : null,
    title: "",
    description: "",
    visual: DEFAULT_VISUAL,
    rules: DEFAULT_RULES,
    isActive: true,
    order: 0,
  };
}

export async function listJourneyRewards(options?: {
  kind?: JourneyRewardInput["kind"];
  trackId?: string | null;
  includeInactive?: boolean;
  schoolId?: string;
}): Promise<{ data: JourneyReward[]; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !JOURNEY_REWARDS_COL_ID) return { data: [], error: null };
  try {
    const queries = [
      Query.equal("school_id", [options?.schoolId ?? DEFAULT_SCHOOL_ID]),
      Query.orderAsc("order"),
      Query.limit(200),
    ];
    if (options?.kind) queries.splice(1, 0, Query.equal("kind", [options.kind]));
    if (!options?.includeInactive) queries.splice(1, 0, Query.equal("is_active", [true]));
    const res = await databases.listDocuments(DB_ID, JOURNEY_REWARDS_COL_ID, queries);
    let data = res.documents.map((doc) => toReward(doc as Record<string, unknown>));
    if (options?.kind === "achievement") {
      data = data.filter((reward) => reward.trackId === options.trackId);
    }
    return { data: data.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR")), error: null };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function saveJourneyReward(
  rewardId: string | null,
  input: JourneyRewardInput,
): Promise<{ data: JourneyReward | null; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !JOURNEY_REWARDS_COL_ID) {
    return { data: null, error: new Error("Coleção de badges/conquistas não configurada.") };
  }
  try {
    const payload = toPayload(input);
    const doc = rewardId
      ? await databases.updateDocument(DB_ID, JOURNEY_REWARDS_COL_ID, rewardId, payload)
      : await databases.createDocument(DB_ID, JOURNEY_REWARDS_COL_ID, ID.unique(), payload);
    return { data: toReward(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteJourneyReward(rewardId: string): Promise<{ error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !JOURNEY_REWARDS_COL_ID) return { error: null };
  try {
    await databases.deleteDocument(DB_ID, JOURNEY_REWARDS_COL_ID, rewardId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadRewardImage(file: File): Promise<{ visual: RewardVisual | null; error: Error | null }> {
  if (!storage || !BUCKET_ID) return { visual: null, error: new Error("Bucket Appwrite não configurado.") };
  try {
    const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, [
      Permission.read(Role.users()),
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ]);
    const url = storage.getFileView(BUCKET_ID, uploaded.$id).toString();
    return { visual: { type: "uploadedImage", imageUrl: url, imageFileId: uploaded.$id }, error: null };
  } catch (error) {
    return { visual: null, error: error as Error };
  }
}
