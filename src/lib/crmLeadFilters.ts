import type { CrmLead, CrmLeadFilters, CrmLeadScoreRule, CrmStatus, CrmStatusSetting } from "../types/crm";
import { computeLeadScore } from "./crmLeadScore";
import { countOverdueFollowups, countPendingFollowups, isLeadStatusExpired } from "./crmStatusMove";

export const EMPTY_CRM_LEAD_FILTERS: CrmLeadFilters = {
  desiredCourses: [],
  startDates: [],
  weeklyHours: [],
  availableDays: [],
  availablePeriods: [],
  theoreticalExam: [],
  accountStatuses: [],
  transferStatuses: [],
  qualStatuses: [],
  fupStatuses: [],
  expiredStatuses: [],
  weightMin: null,
  weightMax: null,
  heightMin: null,
  heightMax: null,
  scoreMin: null,
  scoreMax: null,
};

export function hasActiveFilters(filters: CrmLeadFilters): boolean {
  return countActiveFilters(filters) > 0;
}

export function countActiveFilters(filters: CrmLeadFilters): number {
  let count = 0;
  if (filters.desiredCourses.length > 0) count += 1;
  if (filters.startDates.length > 0) count += 1;
  if (filters.weeklyHours.length > 0) count += 1;
  if (filters.availableDays.length > 0) count += 1;
  if (filters.availablePeriods.length > 0) count += 1;
  if (filters.theoreticalExam.length > 0) count += 1;
  if (filters.accountStatuses.length > 0) count += 1;
  if (filters.transferStatuses.length > 0) count += 1;
  if (filters.qualStatuses.length > 0) count += 1;
  if (filters.fupStatuses.length > 0) count += 1;
  if (filters.expiredStatuses.length > 0) count += 1;
  if (filters.weightMin != null || filters.weightMax != null) count += 1;
  if (filters.heightMin != null || filters.heightMax != null) count += 1;
  if (filters.scoreMin != null || filters.scoreMax != null) count += 1;
  return count;
}

function matchesAnyQualStatus(lead: CrmLead, statuses: CrmLeadFilters["qualStatuses"]): boolean {
  return statuses.some((status) => {
    if (status === "filled") return Boolean(lead.qualFilledAt);
    if (status === "pending") return !lead.qualFilledAt;
    return false;
  });
}

function matchesAnyFupStatus(
  statuses: CrmLeadFilters["fupStatuses"],
  overdue: number,
  pending: number,
): boolean {
  return statuses.some((status) => {
    if (status === "overdue") return overdue > 0;
    if (status === "pending") return pending > 0;
    if (status === "none") return overdue === 0 && pending === 0;
    return false;
  });
}

function matchesAnyExpiredStatus(
  lead: CrmLead,
  statuses: CrmLeadFilters["expiredStatuses"],
  statusSettings: CrmStatusSetting[],
): boolean {
  const expired = isLeadStatusExpired(lead, statusSettings);
  return statuses.some((status) => {
    if (status === "expired") return expired;
    if (status === "active") return !expired;
    return false;
  });
}

function matchesTheoreticalExam(lead: CrmLead, values: CrmLeadFilters["theoreticalExam"]): boolean {
  return values.some((value) => {
    if (value === "true") return lead.theoreticalExamDone === true;
    if (value === "false") return lead.theoreticalExamDone === false;
    if (value === "unknown") return lead.theoreticalExamDone == null;
    return false;
  });
}

function matchesAccountStatus(lead: CrmLead, values: CrmLeadFilters["accountStatuses"]): boolean {
  return values.some((value) => {
    if (value === "created") return Boolean(lead.userId);
    if (value === "pending") return !lead.userId;
    return false;
  });
}

function matchesTransferStatus(lead: CrmLead, values: CrmLeadFilters["transferStatuses"]): boolean {
  const hasTransfer = Boolean(lead.transferSchool?.trim());
  return values.some((value) => {
    if (value === "yes") return hasTransfer;
    if (value === "no") return !hasTransfer;
    return false;
  });
}

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

export function filterCrmLeads(
  leads: CrmLead[],
  filters: CrmLeadFilters,
  searchQuery: string,
  statusSettings: CrmStatusSetting[],
  scoreRules: CrmLeadScoreRule[],
  status?: CrmStatus,
): CrmLead[] {
  const q = searchQuery.trim().toLowerCase();

  return leads.filter((lead) => {
    if (status && lead.crmStatus !== status) return false;

    if (q) {
      const matchesSearch =
        lead.name.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        (lead.phone && lead.phone.toLowerCase().includes(q)) ||
        (lead.desiredCourse && lead.desiredCourse.toLowerCase().includes(q)) ||
        (lead.anacCode && lead.anacCode.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    if (filters.desiredCourses.length > 0) {
      if (!lead.desiredCourse || !filters.desiredCourses.includes(lead.desiredCourse)) return false;
    }
    if (filters.startDates.length > 0) {
      if (!lead.startDate || !filters.startDates.includes(lead.startDate)) return false;
    }
    if (filters.weeklyHours.length > 0) {
      if (!filters.weeklyHours.includes(String(lead.weeklyHours ?? ""))) return false;
    }
    if (filters.availableDays.length > 0) {
      if (!filters.availableDays.some((day) => lead.availableDays.includes(day))) return false;
    }
    if (filters.availablePeriods.length > 0) {
      if (!lead.availablePeriod || !filters.availablePeriods.includes(lead.availablePeriod)) return false;
    }
    if (filters.theoreticalExam.length > 0 && !matchesTheoreticalExam(lead, filters.theoreticalExam)) {
      return false;
    }
    if (filters.accountStatuses.length > 0 && !matchesAccountStatus(lead, filters.accountStatuses)) {
      return false;
    }
    if (filters.transferStatuses.length > 0 && !matchesTransferStatus(lead, filters.transferStatuses)) {
      return false;
    }
    if (filters.qualStatuses.length > 0 && !matchesAnyQualStatus(lead, filters.qualStatuses)) {
      return false;
    }

    const overdue = countOverdueFollowups(lead.followups);
    const pending = countPendingFollowups(lead.followups);
    if (filters.fupStatuses.length > 0 && !matchesAnyFupStatus(filters.fupStatuses, overdue, pending)) {
      return false;
    }

    if (filters.expiredStatuses.length > 0 && !matchesAnyExpiredStatus(lead, filters.expiredStatuses, statusSettings)) {
      return false;
    }

    if (filters.weightMin != null || filters.weightMax != null) {
      if (!inRange(lead.weightKg, filters.weightMin, filters.weightMax)) return false;
    }
    if (filters.heightMin != null || filters.heightMax != null) {
      if (!inRange(lead.heightCm, filters.heightMin, filters.heightMax)) return false;
    }

    const score = computeLeadScore(lead, scoreRules).total;
    if (filters.scoreMin != null && score < filters.scoreMin) return false;
    if (filters.scoreMax != null && score > filters.scoreMax) return false;

    return true;
  });
}
