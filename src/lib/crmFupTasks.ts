import type { CrmLead, CrmLeadFollowup, CrmLeadScoreRule } from "../types/crm";
import { compareCrmLeads, type CrmLeadSortKey } from "./crmLeadSort";

export type CrmFupTask = {
  lead: CrmLead;
  followup: CrmLeadFollowup;
  isOverdue: boolean;
};

export function collectOpenFupTasks(leads: CrmLead[], now = Date.now()): CrmFupTask[] {
  const tasks: CrmFupTask[] = [];
  for (const lead of leads) {
    for (const followup of lead.followups) {
      if (followup.completedAt) continue;
      const isOverdue = new Date(followup.triggeredAt).getTime() <= now;
      tasks.push({ lead, followup, isOverdue });
    }
  }
  return tasks;
}

export function sortFupTasks(
  tasks: CrmFupTask[],
  sortKey: CrmLeadSortKey,
  sortAsc: boolean,
  scoreRules: CrmLeadScoreRule[],
): CrmFupTask[] {
  const copy = [...tasks];
  copy.sort((a, b) => {
    let cmp = compareCrmLeads(a.lead, b.lead, sortKey, scoreRules);
    if (cmp === 0) {
      cmp = new Date(a.followup.triggeredAt).getTime() - new Date(b.followup.triggeredAt).getTime();
    }
    if (cmp === 0 && a.isOverdue !== b.isOverdue) {
      cmp = a.isOverdue ? -1 : 1;
    }
    return sortAsc ? cmp : -cmp;
  });
  return copy;
}

export function countOpenFupTasks(leads: CrmLead[]): { total: number; overdue: number } {
  let total = 0;
  let overdue = 0;
  const now = Date.now();
  for (const lead of leads) {
    for (const followup of lead.followups) {
      if (followup.completedAt) continue;
      total += 1;
      if (new Date(followup.triggeredAt).getTime() <= now) overdue += 1;
    }
  }
  return { total, overdue };
}
