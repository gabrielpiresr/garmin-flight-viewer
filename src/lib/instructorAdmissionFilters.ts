import type { InstructorAdmissionCandidate, InstructorAdmissionCandidateSource } from "../types/instructorAdmission";
import type { InstructorHoursMap } from "./instructorAdmissionMetrics";
import { computeInstructorAdmissionScore } from "./instructorAdmissionScore";
import type { InstructorAdmissionForm } from "../types/instructorAdmission";

export type InstructorAdmissionFilters = {
  sources: InstructorAdmissionCandidateSource[];
  referralSources: string[];
  accountStatuses: Array<"linked" | "pending">;
  formStatuses: Array<"filled" | "pending">;
  scoreMin: number | null;
  scoreMax: number | null;
  totalHoursMin: number | null;
  totalHoursMax: number | null;
};

export const EMPTY_INSTRUCTOR_ADMISSION_FILTERS: InstructorAdmissionFilters = {
  sources: [],
  referralSources: [],
  accountStatuses: [],
  formStatuses: [],
  scoreMin: null,
  scoreMax: null,
  totalHoursMin: null,
  totalHoursMax: null,
};

export function countInstructorAdmissionFilters(filters: InstructorAdmissionFilters): number {
  let count = 0;
  if (filters.sources.length > 0) count += 1;
  if (filters.referralSources.length > 0) count += 1;
  if (filters.accountStatuses.length > 0) count += 1;
  if (filters.formStatuses.length > 0) count += 1;
  if (filters.scoreMin != null || filters.scoreMax != null) count += 1;
  if (filters.totalHoursMin != null || filters.totalHoursMax != null) count += 1;
  return count;
}

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

export function collectInstructorReferralSources(candidates: InstructorAdmissionCandidate[]): string[] {
  const set = new Set<string>();
  for (const c of candidates) {
    const value = c.referralSource?.trim();
    if (value) set.add(value);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterInstructorAdmissionCandidates(
  candidates: InstructorAdmissionCandidate[],
  filters: InstructorAdmissionFilters,
  searchQuery: string,
  form: InstructorAdmissionForm | null,
  hoursMap: InstructorHoursMap,
): InstructorAdmissionCandidate[] {
  const q = searchQuery.trim().toLowerCase();

  return candidates.filter((candidate) => {
    if (q) {
      const haystack = [
        candidate.name,
        candidate.nickname || "",
        candidate.email,
        candidate.phone || "",
        candidate.notes || "",
        candidate.referralSource || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (filters.sources.length > 0 && !filters.sources.includes(candidate.source)) return false;

    if (filters.referralSources.length > 0) {
      const src = candidate.referralSource?.trim() || "";
      if (!filters.referralSources.includes(src)) return false;
    }

    if (filters.accountStatuses.length > 0) {
      const linked = Boolean(candidate.userId);
      const ok = filters.accountStatuses.some((status) =>
        status === "linked" ? linked : !linked,
      );
      if (!ok) return false;
    }

    if (filters.formStatuses.length > 0) {
      const filled = Boolean(candidate.formFilledAt);
      const ok = filters.formStatuses.some((status) =>
        status === "filled" ? filled : !filled,
      );
      if (!ok) return false;
    }

    if (filters.scoreMin != null || filters.scoreMax != null) {
      if (!form?.scoreRules?.length) return false;
      const score = computeInstructorAdmissionScore(
        candidate.responses,
        form.scoreRules,
        form.fields,
      ).total;
      if (!inRange(score, filters.scoreMin, filters.scoreMax)) return false;
    }

    if (filters.totalHoursMin != null || filters.totalHoursMax != null) {
      const hours = candidate.userId ? hoursMap[candidate.userId]?.totalHours ?? null : null;
      if (!inRange(hours, filters.totalHoursMin, filters.totalHoursMax)) return false;
    }

    return true;
  });
}
