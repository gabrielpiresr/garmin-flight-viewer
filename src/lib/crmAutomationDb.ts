import type {
  CrmAutomationSettings,
  CrmLeadScoreRule,
  CrmQualFollowupRule,
  CrmQualFollowupTemplate,
} from "../types/crm";
import { DEFAULT_CRM_LOSS_REASONS } from "../types/crm";
import { CRM_AUTOMATION_SETTINGS_COL_ID, databases, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const LS_KEY = "crm_automation_settings_v1";
const DOC_ID = "default";

export const DEFAULT_CRM_AUTOMATION_SETTINGS: CrmAutomationSettings = {
  lossReasons: [...DEFAULT_CRM_LOSS_REASONS],
  qualFollowupRules: [
    {
      id: "rule-start-60",
      field: "startDate",
      answerValue: "60_dias",
      followups: [
        { id: "fup-60-30", title: "Check-in meio período (60 dias)", days: 30 },
        { id: "fup-60-60", title: "Data prevista de início", days: 60 },
      ],
    },
    {
      id: "rule-start-30",
      field: "startDate",
      answerValue: "30_dias",
      followups: [
        { id: "fup-30-15", title: "Check-in meio período (30 dias)", days: 15 },
        { id: "fup-30-30", title: "Data prevista de início", days: 30 },
      ],
    },
    {
      id: "rule-start-imediato",
      field: "startDate",
      answerValue: "imediato",
      followups: [
        { id: "fup-imm-3", title: "Contato imediato — dia 3", days: 3 },
        { id: "fup-imm-7", title: "Contato imediato — semana 1", days: 7 },
      ],
    },
  ],
  scoreRules: [
    { id: "score-start-imediato", field: "startDate", answerValue: "imediato", points: 40 },
    { id: "score-start-30", field: "startDate", answerValue: "30_dias", points: 30 },
    { id: "score-start-60", field: "startDate", answerValue: "60_dias", points: 20 },
    { id: "score-start-mais60", field: "startDate", answerValue: "mais_60", points: 5 },
    { id: "score-hours-8", field: "weeklyHours", answerValue: "8", points: 25 },
    { id: "score-hours-6", field: "weeklyHours", answerValue: "6", points: 20 },
    { id: "score-hours-4", field: "weeklyHours", answerValue: "4", points: 15 },
    { id: "score-hours-2", field: "weeklyHours", answerValue: "2", points: 10 },
    { id: "score-hours-1", field: "weeklyHours", answerValue: "1", points: 5 },
    { id: "score-banca-sim", field: "theoreticalExamDone", answerValue: "true", points: 15 },
    { id: "score-banca-nao", field: "theoreticalExamDone", answerValue: "false", points: 5 },
    {
      id: "score-weekdays",
      field: "availableDays",
      answerValue: "seg,ter,qua,qui,sex",
      matchMode: "all",
      points: 20,
    },
  ],
};

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_AUTOMATION_SETTINGS_COL_ID);
}

function parseFollowupTemplates(value: unknown): CrmQualFollowupTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CrmQualFollowupTemplate | null => {
      const id = String(item?.id || "").trim() || crypto.randomUUID();
      const title = String(item?.title || "").trim();
      const days = Math.max(0, Math.round(Number(item?.days) || 0));
      if (!title) return null;
      return { id, title, days };
    })
    .filter((item): item is CrmQualFollowupTemplate => Boolean(item));
}

function parseQualFollowupRules(value: unknown): CrmQualFollowupRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CrmQualFollowupRule | null => {
      const id = String(item?.id || "").trim() || crypto.randomUUID();
      const field = String(item?.field || "").trim();
      const answerValue = String(item?.answerValue || "").trim();
      const followups = parseFollowupTemplates(item?.followups);
      if (!field || !answerValue) return null;
      return { id, field: field as CrmQualFollowupRule["field"], answerValue, followups };
    })
    .filter((item): item is CrmQualFollowupRule => Boolean(item));
}

function parseScoreRules(value: unknown): CrmLeadScoreRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CrmLeadScoreRule | null => {
      const id = String(item?.id || "").trim() || crypto.randomUUID();
      const field = String(item?.field || "").trim();
      const answerValue = String(item?.answerValue || "").trim();
      const points = Math.round(Number(item?.points) || 0);
      const compareOp = item?.compareOp === "gt" || item?.compareOp === "lt" || item?.compareOp === "eq"
        ? item.compareOp
        : undefined;
      const matchMode = item?.matchMode === "all" || item?.matchMode === "any" ? item.matchMode : undefined;
      if (!field || !answerValue) return null;
      return {
        id,
        field: field as CrmLeadScoreRule["field"],
        answerValue,
        compareOp,
        matchMode,
        points,
      };
    })
    .filter((item): item is CrmLeadScoreRule => Boolean(item));
}

function parseLossReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_CRM_LOSS_REASONS];
  const items = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.length > 0 ? unique : [...DEFAULT_CRM_LOSS_REASONS];
}

function normalizeSettings(raw: Partial<CrmAutomationSettings> | null | undefined): CrmAutomationSettings {
  return {
    qualFollowupRules: parseQualFollowupRules(raw?.qualFollowupRules),
    scoreRules: parseScoreRules(raw?.scoreRules),
    lossReasons: parseLossReasons(raw?.lossReasons),
  };
}

function readLocalSettings(): CrmAutomationSettings {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return DEFAULT_CRM_AUTOMATION_SETTINGS;
    return normalizeSettings(JSON.parse(stored) as Partial<CrmAutomationSettings>);
  } catch {
    return DEFAULT_CRM_AUTOMATION_SETTINGS;
  }
}

function writeLocalSettings(settings: CrmAutomationSettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

export async function getCrmAutomationSettings(): Promise<{ data: CrmAutomationSettings; error: Error | null }> {
  if (!configured()) {
    return { data: readLocalSettings(), error: null };
  }
  try {
    try {
      const doc = await databases!.getDocument(DB_ID!, CRM_AUTOMATION_SETTINGS_COL_ID!, DOC_ID);
      const parsed = (doc as { settings_json?: string }).settings_json
        ? normalizeSettings(JSON.parse(String((doc as { settings_json?: string }).settings_json)))
        : readLocalSettings();
      writeLocalSettings(parsed);
      return { data: parsed, error: null };
    } catch (e) {
      const msg = String((e as Error)?.message || e).toLowerCase();
      if (!msg.includes("not found") && !msg.includes("could not be found")) throw e;
      return { data: readLocalSettings(), error: null };
    }
  } catch (e) {
    return { data: readLocalSettings(), error: e as Error };
  }
}

function isAppwriteNotFoundError(e: unknown): boolean {
  const msg = String((e as Error)?.message || e).toLowerCase();
  return msg.includes("not found") || msg.includes("could not be found");
}

export async function saveCrmAutomationSettings(
  settings: CrmAutomationSettings,
): Promise<{ data: CrmAutomationSettings | null; error: Error | null; warning: string | null }> {
  const normalized = normalizeSettings(settings);
  writeLocalSettings(normalized);

  if (!configured()) {
    return { data: normalized, error: null, warning: null };
  }

  try {
    const payload = { settings_json: JSON.stringify(normalized) };
    try {
      await databases!.updateDocument(DB_ID!, CRM_AUTOMATION_SETTINGS_COL_ID!, DOC_ID, payload);
    } catch (e) {
      if (!isAppwriteNotFoundError(e)) throw e;
      try {
        await databases!.createDocument(DB_ID!, CRM_AUTOMATION_SETTINGS_COL_ID!, DOC_ID, payload);
      } catch (createErr) {
        if (!isAppwriteNotFoundError(createErr)) throw createErr;
        return {
          data: normalized,
          error: null,
          warning:
            "Salvo neste navegador. A collection crm_automation_settings ainda não existe no Appwrite — rode: node scripts/setup-crm-automation.mjs",
        };
      }
    }
    return { data: normalized, error: null, warning: null };
  } catch (e) {
    return { data: normalized, error: e as Error, warning: null };
  }
}
