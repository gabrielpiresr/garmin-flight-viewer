import type {
  AvailableDay,
  CrmLead,
  CrmLeadScoreBreakdownItem,
  CrmLeadScoreResult,
  CrmLeadScoreRule,
  CrmQualRuleField,
  CrmScoreRuleField,
} from "../types/crm";
import {
  AVAILABLE_DAY_LABELS,
  CRM_AVAILABLE_PERIOD_OPTIONS,
  CRM_SCORE_COMPARE_LABELS,
  CRM_SCORE_DAYS_MATCH_LABELS,
  CRM_SCORE_RULE_FIELD_LABELS,
  CRM_START_DATE_OPTIONS,
} from "../types/crm";

export function isNumericScoreField(field: CrmScoreRuleField): boolean {
  return field === "weightKg" || field === "heightCm";
}

export function isDaysScoreField(field: CrmScoreRuleField): boolean {
  return field === "availableDays";
}

export function getLeadQualFieldValue(lead: CrmLead, field: CrmQualRuleField): string | null {
  switch (field) {
    case "startDate":
      return lead.startDate;
    case "desiredCourse":
      return lead.desiredCourse;
    case "weeklyHours":
      return lead.weeklyHours != null ? String(lead.weeklyHours) : null;
    case "availablePeriod":
      return lead.availablePeriod;
    case "theoreticalExamDone":
      if (lead.theoreticalExamDone == null) return null;
      return lead.theoreticalExamDone ? "true" : "false";
    case "theoreticalStudyStatus":
      return lead.theoreticalStudyStatus;
    default:
      return null;
  }
}

function getLeadNumericValue(lead: CrmLead, field: "weightKg" | "heightCm"): number | null {
  const value = field === "weightKg" ? lead.weightKg : lead.heightCm;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDaysValue(value: string): AvailableDay[] {
  const valid: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  return value
    .split(",")
    .map((d) => d.trim())
    .filter((d): d is AvailableDay => valid.includes(d as AvailableDay));
}

function matchesNumericRule(lead: CrmLead, rule: CrmLeadScoreRule): boolean {
  if (rule.field !== "weightKg" && rule.field !== "heightCm") return false;
  const current = getLeadNumericValue(lead, rule.field);
  const threshold = Number(rule.answerValue);
  if (current == null || !Number.isFinite(threshold)) return false;
  const op = rule.compareOp ?? "eq";
  if (op === "gt") return current > threshold;
  if (op === "lt") return current < threshold;
  return current === threshold;
}

function matchesDaysRule(lead: CrmLead, rule: CrmLeadScoreRule): boolean {
  const required = parseDaysValue(rule.answerValue);
  if (required.length === 0 || lead.availableDays.length === 0) return false;
  const mode = rule.matchMode ?? "all";
  if (mode === "all") return required.every((day) => lead.availableDays.includes(day));
  return required.some((day) => lead.availableDays.includes(day));
}

export function matchesScoreRule(lead: CrmLead, rule: CrmLeadScoreRule): boolean {
  if (isNumericScoreField(rule.field)) return matchesNumericRule(lead, rule);
  if (isDaysScoreField(rule.field)) return matchesDaysRule(lead, rule);
  const value = getLeadQualFieldValue(lead, rule.field as CrmQualRuleField);
  return value != null && value === rule.answerValue;
}

function answerLabel(field: CrmScoreRuleField, rule: CrmLeadScoreRule): string {
  if (isNumericScoreField(field)) {
    const op = CRM_SCORE_COMPARE_LABELS[rule.compareOp ?? "eq"];
    return `${op} ${rule.answerValue}${field === "weightKg" ? " kg" : " cm"}`;
  }
  if (isDaysScoreField(field)) {
    const days = parseDaysValue(rule.answerValue).map((d) => AVAILABLE_DAY_LABELS[d]).join(", ");
    const mode = CRM_SCORE_DAYS_MATCH_LABELS[rule.matchMode ?? "all"];
    return `${mode}: ${days}`;
  }
  if (field === "startDate") {
    return CRM_START_DATE_OPTIONS.find((o) => o.value === rule.answerValue)?.label ?? rule.answerValue;
  }
  if (field === "availablePeriod") {
    return CRM_AVAILABLE_PERIOD_OPTIONS.find((o) => o.value === rule.answerValue)?.label ?? rule.answerValue;
  }
  if (field === "theoreticalExamDone") {
    if (rule.answerValue === "true") return "Já fez banca";
    if (rule.answerValue === "false") return "Ainda não fez banca";
  }
  if (field === "weeklyHours") return `${rule.answerValue} h/sem`;
  return rule.answerValue;
}

export function computeLeadScore(lead: CrmLead, rules: CrmLeadScoreRule[]): CrmLeadScoreResult {
  const breakdown: CrmLeadScoreBreakdownItem[] = [];
  let total = 0;

  for (const rule of rules) {
    if (!matchesScoreRule(lead, rule)) continue;
    breakdown.push({
      ruleId: rule.id,
      field: rule.field,
      answerValue: rule.answerValue,
      label: `${CRM_SCORE_RULE_FIELD_LABELS[rule.field]}: ${answerLabel(rule.field, rule)}`,
      points: rule.points,
    });
    total += rule.points;
  }

  return { total, breakdown };
}

export function leadScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  if (score > 0) return "text-slate-300";
  return "text-slate-500";
}

export function estimateMaxLeadScore(rules: CrmLeadScoreRule[]): number {
  if (rules.length === 0) return 150;
  const byField = new Map<string, number>();
  for (const rule of rules) {
    const key = `${rule.field}:${rule.compareOp ?? "eq"}:${rule.matchMode ?? "all"}`;
    byField.set(key, Math.max(byField.get(key) ?? 0, rule.points));
  }
  const sum = Array.from(byField.values()).reduce((acc, pts) => acc + pts, 0);
  return Math.max(150, sum);
}
