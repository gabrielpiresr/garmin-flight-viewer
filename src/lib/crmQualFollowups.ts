import type { CrmLead, CrmLeadFollowup, CrmQualFollowupRule, CrmStatus } from "../types/crm";
import { addDaysIso } from "./crmStatusMove";
import { getLeadQualFieldValue } from "./crmLeadScore";

export function buildQualFollowupsFromRules(
  lead: Pick<
    CrmLead,
    | "startDate"
    | "desiredCourse"
    | "weeklyHours"
    | "availablePeriod"
    | "theoreticalExamDone"
    | "theoreticalStudyStatus"
  >,
  rules: CrmQualFollowupRule[],
  qualFilledAt: string,
  currentStatus: CrmStatus,
): CrmLeadFollowup[] {
  const result: CrmLeadFollowup[] = [];

  for (const rule of rules) {
    const value = getLeadQualFieldValue(lead as CrmLead, rule.field);
    if (value == null || value !== rule.answerValue) continue;
    for (const template of rule.followups) {
      if (!template.title.trim()) continue;
      result.push({
        id: crypto.randomUUID(),
        status: currentStatus,
        title: template.title.trim(),
        triggeredAt: addDaysIso(qualFilledAt, template.days),
        completedAt: null,
        qualAuto: true,
      });
    }
  }

  return result;
}

export function mergeQualFollowups(
  existingFollowups: CrmLeadFollowup[],
  qualFollowups: CrmLeadFollowup[],
): CrmLeadFollowup[] {
  const kept = existingFollowups.filter((item) => !item.qualAuto);
  return [...kept, ...qualFollowups];
}

export function applyQualFollowupRules(
  lead: Pick<
    CrmLead,
    | "startDate"
    | "desiredCourse"
    | "weeklyHours"
    | "availablePeriod"
    | "theoreticalExamDone"
    | "theoreticalStudyStatus"
    | "followups"
  >,
  rules: CrmQualFollowupRule[],
  qualFilledAt: string,
  currentStatus: CrmStatus,
): CrmLeadFollowup[] {
  const qualFollowups = buildQualFollowupsFromRules(lead, rules, qualFilledAt, currentStatus);
  return mergeQualFollowups(lead.followups ?? [], qualFollowups);
}
