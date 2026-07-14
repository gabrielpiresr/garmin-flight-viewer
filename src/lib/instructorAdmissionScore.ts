import type {
  InstructorAdmissionFieldValue,
  InstructorAdmissionFormField,
  InstructorAdmissionScoreBreakdownItem,
  InstructorAdmissionScoreCompareOp,
  InstructorAdmissionScoreResult,
  InstructorAdmissionScoreRule,
} from "../types/instructorAdmission";
import {
  INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS,
  INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS,
} from "../types/instructorAdmission";
import { AVAILABLE_DAY_LABELS } from "../types/crm";
import {
  AVAILABILITY_PRESETS,
  isAvailabilityValue,
  normalizeAvailabilityValue,
} from "./availabilityPresets";

function responseAsString(value: InstructorAdmissionFieldValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) return value.map(String).join(",");
  return null;
}

function responseAsNumber(value: InstructorAdmissionFieldValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function selectedList(value: InstructorAdmissionFieldValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return parseList(value);
  if (isAvailabilityValue(value)) return value.days;
  return [];
}

function matchesNumericRule(
  value: InstructorAdmissionFieldValue | undefined,
  rule: InstructorAdmissionScoreRule,
): boolean {
  const current = responseAsNumber(value);
  const threshold = Number(rule.answerValue);
  if (current == null || !Number.isFinite(threshold)) return false;
  const op: InstructorAdmissionScoreCompareOp = rule.compareOp ?? "eq";
  if (op === "gt") return current > threshold;
  if (op === "lt") return current < threshold;
  return current === threshold;
}

function matchesListRule(
  selected: string[],
  rule: InstructorAdmissionScoreRule,
): boolean {
  const required = parseList(rule.answerValue);
  if (required.length === 0 || selected.length === 0) return false;
  const mode = rule.matchMode ?? "all";
  if (mode === "all") return required.every((item) => selected.includes(item));
  return required.some((item) => selected.includes(item));
}

export function matchesInstructorAdmissionScoreRule(
  responses: Record<string, InstructorAdmissionFieldValue>,
  rule: InstructorAdmissionScoreRule,
  field?: InstructorAdmissionFormField,
): boolean {
  const value = responses[rule.fieldId];

  if (field?.type === "number" || (rule.compareOp && field?.type !== "multiselect" && field?.type !== "availability")) {
    return matchesNumericRule(value, rule);
  }

  if (field?.type === "checkbox") {
    const asBool =
      value === true ? "true" : value === false ? "false" : responseAsString(value);
    return asBool != null && asBool === rule.answerValue;
  }

  if (field?.type === "multiselect") {
    return matchesListRule(selectedList(value), rule);
  }

  if (field?.type === "availability") {
    const avail = normalizeAvailabilityValue(value);
    const aspect = rule.availabilityAspect || "days";
    if (aspect === "days") return matchesListRule(avail.days, rule);
    if (aspect === "period") return avail.period === rule.answerValue;
    if (aspect === "preset") return avail.preset === rule.answerValue;
    return false;
  }

  const asString = responseAsString(value);
  return asString != null && asString === rule.answerValue;
}

function answerLabel(
  rule: InstructorAdmissionScoreRule,
  field?: InstructorAdmissionFormField,
): string {
  if (field?.type === "number" || rule.compareOp) {
    const op = INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS[rule.compareOp ?? "eq"];
    return `${op} ${rule.answerValue}`;
  }
  if (field?.type === "checkbox") {
    if (rule.answerValue === "true") return "Sim";
    if (rule.answerValue === "false") return "Não";
  }
  if (field?.type === "multiselect") {
    const mode = INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS[rule.matchMode ?? "all"];
    return `${mode}: ${parseList(rule.answerValue).join(", ")}`;
  }
  if (field?.type === "availability") {
    const aspect = rule.availabilityAspect || "days";
    if (aspect === "days") {
      const days = parseList(rule.answerValue)
        .map((d) => AVAILABLE_DAY_LABELS[d as keyof typeof AVAILABLE_DAY_LABELS] || d)
        .join(", ");
      const mode = rule.matchMode === "any" ? "pelo menos um" : "todos";
      return `Dias (${mode}): ${days}`;
    }
    if (aspect === "period") {
      return rule.answerValue === "manha"
        ? "Período: Manhã"
        : rule.answerValue === "tarde"
          ? "Período: Tarde"
          : "Período: Ambos";
    }
    const preset = AVAILABILITY_PRESETS.find((p) => p.id === rule.answerValue);
    return `Preset: ${preset?.label || rule.answerValue}`;
  }
  return rule.answerValue;
}

export function computeInstructorAdmissionScore(
  responses: Record<string, InstructorAdmissionFieldValue>,
  rules: InstructorAdmissionScoreRule[],
  fields: InstructorAdmissionFormField[] = [],
): InstructorAdmissionScoreResult {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const breakdown: InstructorAdmissionScoreBreakdownItem[] = [];
  let total = 0;

  for (const rule of rules) {
    const field = fieldById.get(rule.fieldId);
    if (!matchesInstructorAdmissionScoreRule(responses, rule, field)) continue;
    const fieldLabel = field?.label || rule.fieldId;
    breakdown.push({
      ruleId: rule.id,
      fieldId: rule.fieldId,
      answerValue: rule.answerValue,
      label: `${fieldLabel}: ${answerLabel(rule, field)}`,
      points: rule.points,
    });
    total += rule.points;
  }

  return { total, breakdown };
}

export function instructorAdmissionScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  if (score > 0) return "text-slate-300";
  return "text-slate-500";
}

/** Preenche campos a partir de query params / defaultValue (inclui ocultos). */
export function applyQueryPrefillToResponses(
  fields: InstructorAdmissionFormField[],
  params: URLSearchParams,
  base: Record<string, InstructorAdmissionFieldValue> = {},
): Record<string, InstructorAdmissionFieldValue> {
  const next = { ...base };
  for (const field of fields) {
    if (next[field.id] !== undefined && next[field.id] !== "") continue;
    const key = field.queryKey?.trim() || (field.type === "hidden" ? field.id : "");
    const fromUrl = key ? params.get(key)?.trim() : null;
    if (fromUrl) {
      if (field.type === "number") {
        const n = Number(fromUrl);
        next[field.id] = Number.isFinite(n) ? n : fromUrl;
      } else if (field.type === "checkbox") {
        next[field.id] = fromUrl === "true" || fromUrl === "1" || fromUrl === "sim";
      } else if (field.type === "multiselect") {
        next[field.id] = fromUrl.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        next[field.id] = fromUrl.slice(0, 2000);
      }
      continue;
    }
    if (field.defaultValue != null && field.defaultValue !== "") {
      next[field.id] = field.defaultValue;
    }
  }
  return next;
}

export function isVisibleInstructorAdmissionField(field: InstructorAdmissionFormField): boolean {
  return field.type !== "hidden";
}
