import type {
  CrmLead,
  CrmLeadFollowup,
  CrmStatus,
  CrmStatusFollowupTemplate,
  CrmStatusSetting,
} from "../types/crm";

export function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString();
}

export function daysUntil(value: string): number {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function getStatusSetting(settings: CrmStatusSetting[], status: CrmStatus): CrmStatusSetting {
  return settings.find((item) => item.status === status) ?? { id: "", status, followups: [], expirationDays: null };
}

export function hasExpirationConfigured(setting: CrmStatusSetting): boolean {
  return setting.expirationDays != null;
}

export function getExpirationAt(lead: Pick<CrmLead, "crmStatus" | "statusEnteredAt">, settings: CrmStatusSetting[]): string | null {
  const setting = getStatusSetting(settings, lead.crmStatus);
  if (!lead.statusEnteredAt || setting.expirationDays == null) return null;
  return addDaysIso(lead.statusEnteredAt, setting.expirationDays);
}

export function isLeadStatusExpired(
  lead: Pick<CrmLead, "crmStatus" | "statusEnteredAt">,
  settings: CrmStatusSetting[],
): boolean {
  const expirationAt = getExpirationAt(lead, settings);
  if (!expirationAt) return false;
  return daysUntil(expirationAt) < 0;
}

export function buildFollowupsForStatus(
  status: CrmStatus,
  enteredAt: string,
  templates: CrmStatusFollowupTemplate[],
): CrmLeadFollowup[] {
  return templates.map((template) => ({
    id: crypto.randomUUID(),
    status,
    title: template.title,
    triggeredAt: addDaysIso(enteredAt, template.days),
    completedAt: null,
  }));
}

export type CrmStatusMoveFields = {
  crmStatus: CrmStatus;
  statusEnteredAt: string;
  funnelEnteredAt: string;
  followups: CrmLeadFollowup[];
};

export function buildLeadStatusMove(
  lead: Pick<CrmLead, "crmStatus" | "funnelEnteredAt"> & { followups?: CrmLeadFollowup[] },
  targetStatus: CrmStatus,
  settings: CrmStatusSetting[],
  options?: { enteredAt?: string },
): CrmStatusMoveFields {
  const enteredAt = options?.enteredAt ?? new Date().toISOString();
  const setting = getStatusSetting(settings, targetStatus);
  const manualFollowups = (lead.followups ?? []).filter((item) => item.manual);
  return {
    crmStatus: targetStatus,
    statusEnteredAt: enteredAt,
    funnelEnteredAt: lead.funnelEnteredAt || enteredAt,
    followups: [...buildFollowupsForStatus(targetStatus, enteredAt, setting.followups), ...manualFollowups],
  };
}

export function countOverdueFollowups(followups: CrmLeadFollowup[], now = Date.now()): number {
  return followups.filter((item) => !item.completedAt && new Date(item.triggeredAt).getTime() <= now).length;
}

export function countPendingFollowups(followups: CrmLeadFollowup[], now = Date.now()): number {
  return followups.filter((item) => !item.completedAt && new Date(item.triggeredAt).getTime() > now).length;
}

export function dueDateInputToTriggeredAt(dateValue: string): string {
  const [year, month, day] = dateValue.split("-").map((part) => Number(part));
  if (!year || !month || !day) return new Date().toISOString();
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  return date.toISOString();
}

export function buildManualFollowup(status: CrmStatus, title: string, dueDate: string): CrmLeadFollowup {
  return {
    id: crypto.randomUUID(),
    status,
    title: title.trim(),
    triggeredAt: dueDateInputToTriggeredAt(dueDate),
    completedAt: null,
    manual: true,
  };
}

export function applyLeadStatusMove(
  lead: CrmLead,
  targetStatus: CrmStatus,
  settings: CrmStatusSetting[],
  options?: { enteredAt?: string },
): CrmLead {
  if (lead.crmStatus === targetStatus) return lead;
  return { ...lead, ...buildLeadStatusMove(lead, targetStatus, settings, options) };
}

export function countOpenFollowups(followups: CrmLeadFollowup[], now = Date.now()): number {
  return countOverdueFollowups(followups, now);
}
