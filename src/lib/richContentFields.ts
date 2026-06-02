import { createEmptyRichContent, richContentToPlainText } from "./maneuverContent";
import type { ManeuverRichContent } from "../types/maneuver";
import type { ReferralProgramConfig } from "../types/referAndEarn";
import type { OnboardingStep } from "../types/onboarding";

export function legacyPlainTextToRichDoc(text: string): ManeuverRichContent {
  const trimmed = text.trim();
  if (!trimmed) return createEmptyRichContent();
  const blocks = trimmed.split(/\n\s*\n/).filter(Boolean);
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((block) => ({
          type: "paragraph",
          content: [{ type: "text", text: block.replace(/\n/g, " ") }],
        }))
      : [{ type: "paragraph" }],
  };
}

export function parseStoredRichJson(value: unknown): ManeuverRichContent | null {
  if (value && typeof value === "object" && (value as { type?: string }).type === "doc") {
    return value as ManeuverRichContent;
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { type?: string };
      if (parsed?.type === "doc") return parsed as ManeuverRichContent;
    } catch {
      return null;
    }
  }
  return null;
}

export function hasRichTextContent(content: ManeuverRichContent): boolean {
  return richContentToPlainText(content).length > 0;
}

export function normalizeReferralProgram(
  raw: Partial<ReferralProgramConfig & { rules?: string }> | null | undefined,
): ReferralProgramConfig {
  const input = raw && typeof raw === "object" ? raw : {};
  const requiredHours = Number(input.requiredHours);
  const parsedJson = parseStoredRichJson(input.rulesJson);
  if (parsedJson) {
    return {
      active: Boolean(input.active),
      prize: String(input.prize ?? ""),
      requiredHours: Number.isFinite(requiredHours) && requiredHours > 0 ? requiredHours : 10,
      rulesJson: parsedJson,
      rulesHtml: String(input.rulesHtml ?? ""),
    };
  }
  const legacyRules = typeof input.rules === "string" ? input.rules : "";
  return {
    active: Boolean(input.active),
    prize: String(input.prize ?? ""),
    requiredHours: Number.isFinite(requiredHours) && requiredHours > 0 ? requiredHours : 10,
    rulesJson: legacyRules.trim() ? legacyPlainTextToRichDoc(legacyRules) : createEmptyRichContent(),
    rulesHtml: String(input.rulesHtml ?? ""),
  };
}

export function normalizeOnboardingStep(
  raw: Partial<{
    description?: string;
    description_json?: unknown;
    descriptionJson?: unknown;
    description_html?: string;
    descriptionHtml?: string;
  }>,
): Pick<OnboardingStep, "description" | "descriptionJson" | "descriptionHtml"> {
  const plainLegacy = String(raw.description ?? "").trim();
  const parsedJson =
    parseStoredRichJson(raw.descriptionJson) ??
    parseStoredRichJson(raw.description_json) ??
    (plainLegacy ? legacyPlainTextToRichDoc(plainLegacy) : createEmptyRichContent());
  const descriptionHtml = String(raw.descriptionHtml ?? raw.description_html ?? "");
  const description = plainLegacy || richContentToPlainText(parsedJson);
  return {
    description,
    descriptionJson: parsedJson,
    descriptionHtml,
  };
}
