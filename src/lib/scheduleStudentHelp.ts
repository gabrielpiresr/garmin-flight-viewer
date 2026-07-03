import { createEmptyRichContent, richContentToPlainText } from "./maneuverContent";
import { hasRichTextContent, parseStoredRichJson } from "./richContentFields";
import { defaultScheduleStudentHelp } from "./scheduleStudentHelpDefaults";
import { buildSystemFaqItems, SCHEDULE_SYSTEM_FAQ_IDS } from "./scheduleSystemFaqs";
import type { FlightScheduleRules } from "../types/schoolRules";
import type {
  ScheduleCustomFaq,
  ScheduleFaqItem,
  ScheduleOnboardingStep,
  ScheduleStudentHelpConfig,
} from "../types/scheduleStudentHelp";

const MAX_ONBOARDING_STEPS = 5;
const MAX_CUSTOM_FAQS = 10;

function normalizeOnboardingStep(raw: unknown, index: number): ScheduleOnboardingStep | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ScheduleOnboardingStep>;
  const title = String(item.title ?? "").trim().slice(0, 200);
  if (!title) return null;
  const parsedJson = parseStoredRichJson(item.descriptionJson) ?? createEmptyRichContent();
  if (!hasRichTextContent(parsedJson)) return null;
  return {
    id: String(item.id ?? `step-${index}`).slice(0, 64),
    title,
    descriptionJson: parsedJson,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
  };
}

function normalizeCustomFaq(raw: unknown, index: number): ScheduleCustomFaq | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ScheduleCustomFaq>;
  const title = String(item.title ?? "").trim().slice(0, 200);
  if (!title) return null;
  const parsedJson = parseStoredRichJson(item.answerJson) ?? createEmptyRichContent();
  if (!hasRichTextContent(parsedJson)) return null;
  return {
    id: String(item.id ?? `faq-${index}`).slice(0, 64),
    title,
    answerJson: parsedJson,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    enabled: item.enabled !== false,
  };
}

function normalizeSystemFaqTitles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const id of SCHEDULE_SYSTEM_FAQ_IDS) {
    const value = String(input[id] ?? "").trim().slice(0, 200);
    if (value) result[id] = value;
  }
  return result;
}

export function normalizeScheduleStudentHelp(
  raw: unknown,
  scheduleMode: FlightScheduleRules["mode"] = "booking",
): ScheduleStudentHelpConfig {
  const defaults = defaultScheduleStudentHelp(scheduleMode);
  const input = raw && typeof raw === "object" ? (raw as Partial<ScheduleStudentHelpConfig>) : {};

  const onboardingSteps = (Array.isArray(input.onboardingSteps) ? input.onboardingSteps : [])
    .map((step, index) => normalizeOnboardingStep(step, index))
    .filter((step): step is ScheduleOnboardingStep => step !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_ONBOARDING_STEPS);

  const customFaqs = (Array.isArray(input.customFaqs) ? input.customFaqs : [])
    .map((faq, index) => normalizeCustomFaq(faq, index))
    .filter((faq): faq is ScheduleCustomFaq => faq !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_CUSTOM_FAQS);

  const systemFaqEnabled =
    input.systemFaqEnabled && typeof input.systemFaqEnabled === "object"
      ? { ...defaults.systemFaqEnabled, ...input.systemFaqEnabled }
      : defaults.systemFaqEnabled;

  return {
    onboardingEnabled: input.onboardingEnabled ?? defaults.onboardingEnabled,
    onboardingSteps: onboardingSteps.length > 0 ? onboardingSteps : defaults.onboardingSteps,
    customFaqs,
    systemFaqEnabled,
    systemFaqTitles: normalizeSystemFaqTitles(input.systemFaqTitles),
  };
}

export function buildScheduleFaqList(
  rules: FlightScheduleRules,
  helpConfig: ScheduleStudentHelpConfig,
): ScheduleFaqItem[] {
  const system = buildSystemFaqItems(rules, helpConfig.systemFaqEnabled, helpConfig.systemFaqTitles);
  const custom = helpConfig.customFaqs
    .filter((faq) => faq.enabled)
    .map((faq) => ({
      id: faq.id,
      title: faq.title,
      answerJson: faq.answerJson,
      source: "custom" as const,
      plainText: richContentToPlainText(faq.answerJson),
    }));
  return [...system, ...custom];
}

export function activeOnboardingSteps(helpConfig: ScheduleStudentHelpConfig): ScheduleOnboardingStep[] {
  if (!helpConfig.onboardingEnabled) return [];
  return helpConfig.onboardingSteps.filter((step) => hasRichTextContent(step.descriptionJson));
}
