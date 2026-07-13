import type { CrmLead, CrmLeadScoreRule, CrmStatusSetting } from "../types/crm";
import { computeLeadScore } from "./crmLeadScore";
import { countOverdueFollowups } from "./crmStatusMove";

export type CrmLeadSortKey =
  | "createdAt"
  | "name"
  | "score"
  | "course"
  | "startDate"
  | "weeklyHours"
  | "weightKg"
  | "overdueFups"
  | "qualFilledAt"
  | "statusEnteredAt";

export const CRM_LEAD_SORT_OPTIONS: { value: CrmLeadSortKey; label: string; defaultAsc: boolean }[] = [
  { value: "createdAt", label: "Data de criação", defaultAsc: false },
  { value: "name", label: "Nome", defaultAsc: true },
  { value: "score", label: "Lead score", defaultAsc: false },
  { value: "course", label: "Curso desejado", defaultAsc: true },
  { value: "startDate", label: "Início dos voos", defaultAsc: true },
  { value: "weeklyHours", label: "Horas por semana", defaultAsc: false },
  { value: "weightKg", label: "Peso", defaultAsc: false },
  { value: "overdueFups", label: "FUPs vencidos", defaultAsc: false },
  { value: "qualFilledAt", label: "Data da qualificação", defaultAsc: false },
  { value: "statusEnteredAt", label: "Tempo no status", defaultAsc: true },
];

export const DEFAULT_CRM_LEAD_SORT: CrmLeadSortKey = "createdAt";

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function numValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

export function compareCrmLeads(
  a: CrmLead,
  b: CrmLead,
  sortKey: CrmLeadSortKey,
  scoreRules: CrmLeadScoreRule[],
): number {
  switch (sortKey) {
    case "name":
      return a.name.localeCompare(b.name, "pt-BR");
    case "score":
      return computeLeadScore(a, scoreRules).total - computeLeadScore(b, scoreRules).total;
    case "course":
      return (a.desiredCourse ?? "").localeCompare(b.desiredCourse ?? "", "pt-BR");
    case "startDate":
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    case "weeklyHours":
      return numValue(a.weeklyHours) - numValue(b.weeklyHours);
    case "weightKg":
      return numValue(a.weightKg) - numValue(b.weightKg);
    case "overdueFups":
      return countOverdueFollowups(a.followups) - countOverdueFollowups(b.followups);
    case "qualFilledAt":
      return dateValue(a.qualFilledAt) - dateValue(b.qualFilledAt);
    case "statusEnteredAt":
      return dateValue(a.statusEnteredAt) - dateValue(b.statusEnteredAt);
    case "createdAt":
    default:
      return dateValue(a.createdAt) - dateValue(b.createdAt);
  }
}

export function sortCrmLeads(
  leads: CrmLead[],
  sortKey: CrmLeadSortKey,
  sortAsc: boolean,
  scoreRules: CrmLeadScoreRule[],
  _statusSettings?: CrmStatusSetting[],
): CrmLead[] {
  const copy = [...leads];
  copy.sort((a, b) => {
    const cmp = compareCrmLeads(a, b, sortKey, scoreRules);
    return sortAsc ? cmp : -cmp;
  });
  return copy;
}

export function defaultSortAscForKey(sortKey: CrmLeadSortKey): boolean {
  return CRM_LEAD_SORT_OPTIONS.find((o) => o.value === sortKey)?.defaultAsc ?? false;
}
