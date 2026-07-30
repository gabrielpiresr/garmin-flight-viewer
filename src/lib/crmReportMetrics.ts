import {
  AVAILABLE_DAY_LABELS,
  CRM_AVAILABLE_PERIOD_OPTIONS,
  CRM_START_DATE_OPTIONS,
  CRM_STATUS_LABELS,
  CRM_STATUSES,
  type AvailableDay,
  type CrmLead,
  type CrmLeadScoreRule,
  type CrmStatus,
} from "../types/crm";
import { computeLeadScore } from "./crmLeadScore";
import { countOverdueFollowups, countPendingFollowups } from "./crmStatusMove";

export type CrmReportDateField = "createdAt" | "funnelEnteredAt" | "qualFilledAt";

export type CrmReportDateFilter = {
  from: string; // YYYY-MM-DD
  to: string;
  field: CrmReportDateField;
};

export type CrmReportExtraFilters = {
  statuses: CrmStatus[];
  courses: string[];
  lossReasons: string[];
  referralSources: string[];
  qualOnly: boolean | null; // true = only filled, false = only pending, null = all
  includeLost: boolean;
};

export type CrmReportBucket = { key: string; label: string; value: number; color?: string };

export type CrmReportSeriesPoint = {
  key: string;
  label: string;
  value: number;
  won?: number;
  lost?: number;
  open?: number;
  qualified?: number;
};

export type CrmReportKpis = {
  total: number;
  qualified: number;
  qualRate: number;
  won: number;
  lost: number;
  open: number;
  conversionRate: number; // won / total
  closedWinRate: number; // won / (won + lost)
  lostRate: number;
  withAccount: number;
  accountRate: number;
  avgScore: number | null;
  avgDaysInFunnel: number | null;
  avgDaysInStatus: number | null;
  overdueFups: number;
  pendingFups: number;
  transferCount: number;
  transferRate: number;
};

export type CrmReportSnapshot = {
  kpis: CrmReportKpis;
  byStatus: CrmReportBucket[];
  timeline: CrmReportSeriesPoint[];
  lossReasons: CrmReportBucket[];
  courses: CrmReportBucket[];
  startDates: CrmReportBucket[];
  weeklyHours: CrmReportBucket[];
  periods: CrmReportBucket[];
  theoreticalExam: CrmReportBucket[];
  studyStatus: CrmReportBucket[];
  referralSources: CrmReportBucket[];
  availableDays: CrmReportBucket[];
  scoreHistogram: CrmReportBucket[];
  transferSplit: CrmReportBucket[];
  fupHealth: CrmReportBucket[];
  conversionStages: CrmReportBucket[];
  agingByStatus: CrmReportBucket[];
};

const CHART_PALETTE = [
  "#38bdf8",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f472b6",
  "#fb923c",
  "#2dd4bf",
  "#818cf8",
  "#f87171",
  "#94a3b8",
  "#4ade80",
  "#c084fc",
  "#67e8f9",
];

const STATUS_COLORS: Partial<Record<CrmStatus, string>> = {
  novo_lead: "#64748b",
  aguardando_qualificacao: "#0ea5e9",
  aguardando_proposta: "#8b5cf6",
  proposta_enviada: "#f59e0b",
  registro_enviado: "#f97316",
  registro_preenchido: "#14b8a6",
  aguardando_transferencia: "#6366f1",
  matricula_enviada: "#3b82f6",
  aguardando_assinatura_pagamento: "#e11d48",
  ground_agendado: "#06b6d4",
  cadastro_anac: "#84cc16",
  aluno_pronto: "#10b981",
  lead_perdido: "#71717a",
};

const CONVERSION_STAGE_STATUSES: CrmStatus[] = [
  "novo_lead",
  "aguardando_qualificacao",
  "aguardando_proposta",
  "proposta_enviada",
  "registro_enviado",
  "registro_preenchido",
  "matricula_enviada",
  "aguardando_assinatura_pagamento",
  "ground_agendado",
  "cadastro_anac",
  "aluno_pronto",
];

function parseDay(isoDate: string): number | null {
  if (!isoDate) return null;
  const t = Date.parse(isoDate.length === 10 ? `${isoDate}T12:00:00` : isoDate);
  return Number.isFinite(t) ? t : null;
}

function leadDateValue(lead: CrmLead, field: CrmReportDateField): string | null {
  if (field === "createdAt") return lead.createdAt || null;
  if (field === "funnelEnteredAt") return lead.funnelEnteredAt || lead.createdAt || null;
  return lead.qualFilledAt || null;
}

function inDateRange(lead: CrmLead, filter: CrmReportDateFilter): boolean {
  if (!filter.from && !filter.to) return true;
  const raw = leadDateValue(lead, filter.field);
  if (!raw) return false;
  const t = parseDay(raw);
  if (t == null) return false;
  if (filter.from) {
    const from = parseDay(filter.from);
    if (from != null && t < from) return false;
  }
  if (filter.to) {
    const to = parseDay(filter.to);
    if (to != null) {
      // inclusive end-of-day
      const end = to + 24 * 60 * 60 * 1000 - 1;
      if (t > end) return false;
    }
  }
  return true;
}

export function filterLeadsForReport(
  leads: CrmLead[],
  dateFilter: CrmReportDateFilter,
  extra: CrmReportExtraFilters,
): CrmLead[] {
  return leads.filter((lead) => {
    if (!inDateRange(lead, dateFilter)) return false;
    if (!extra.includeLost && lead.crmStatus === "lead_perdido") return false;
    if (extra.statuses.length > 0 && !extra.statuses.includes(lead.crmStatus)) return false;
    if (extra.courses.length > 0) {
      const course = lead.desiredCourse?.trim() || "";
      if (!extra.courses.includes(course)) return false;
    }
    if (extra.lossReasons.length > 0) {
      if (lead.crmStatus !== "lead_perdido") return false;
      const reason = lead.lossReason?.trim() || "Sem motivo";
      if (!extra.lossReasons.includes(reason)) return false;
    }
    if (extra.referralSources.length > 0) {
      const src = lead.referralSource?.trim() || "Não informado";
      if (!extra.referralSources.includes(src)) return false;
    }
    if (extra.qualOnly === true && !lead.qualFilledAt) return false;
    if (extra.qualOnly === false && lead.qualFilledAt) return false;
    return true;
  });
}

function daysBetween(fromIso: string | null, toMs = Date.now()): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return null;
  return Math.max(0, (toMs - from) / (1000 * 60 * 60 * 24));
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function countBy(
  items: string[],
  labelFor: (key: string) => string = (k) => k,
  colorFor?: (key: string, index: number) => string,
): CrmReportBucket[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item || "Não informado";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], index) => ({
      key,
      label: labelFor(key),
      value,
      color: colorFor?.(key, index) ?? CHART_PALETTE[index % CHART_PALETTE.length],
    }));
}

function periodLabel(value: string | null): string {
  if (!value) return "Não informado";
  return CRM_AVAILABLE_PERIOD_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function startDateLabel(value: string | null): string {
  if (!value) return "Não informado";
  return CRM_START_DATE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function theoreticalLabel(value: boolean | null): string {
  if (value === true) return "Já fez banca";
  if (value === false) return "Ainda não";
  return "Não informado";
}

function timelineKey(iso: string, granularity: "day" | "week" | "month"): { key: string; label: string } {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { key: "invalid", label: "?" };
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (granularity === "month") {
    return { key: `${y}-${m}`, label: `${m}/${y}` };
  }
  if (granularity === "week") {
    const tmp = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekKey = `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    return { key: weekKey, label: `S${week}/${tmp.getUTCFullYear()}` };
  }
  return { key: `${y}-${m}-${day}`, label: `${day}/${m}` };
}

export function inferTimelineGranularity(from: string, to: string): "day" | "week" | "month" {
  const a = parseDay(from);
  const b = parseDay(to || new Date().toISOString().slice(0, 10));
  if (a == null || b == null) return "week";
  const days = Math.max(1, (b - a) / 86400000);
  if (days <= 45) return "day";
  if (days <= 180) return "week";
  return "month";
}

function buildScoreHistogram(leads: CrmLead[], scoreRules: CrmLeadScoreRule[]): CrmReportBucket[] {
  const buckets = [
    { key: "0-20", min: 0, max: 20, value: 0 },
    { key: "21-40", min: 21, max: 40, value: 0 },
    { key: "41-60", min: 41, max: 60, value: 0 },
    { key: "61-80", min: 61, max: 80, value: 0 },
    { key: "81+", min: 81, max: Infinity, value: 0 },
  ];
  for (const lead of leads) {
    if (!lead.qualFilledAt) continue;
    const score = computeLeadScore(lead, scoreRules).total;
    const bucket = buckets.find((b) => score >= b.min && score <= b.max);
    if (bucket) bucket.value += 1;
  }
  return buckets.map((b, i) => ({
    key: b.key,
    label: b.key,
    value: b.value,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));
}

function buildConversionStages(leads: CrmLead[]): CrmReportBucket[] {
  // Cumulative reach: lead reached this stage or any later stage in funnel order
  const order = CONVERSION_STAGE_STATUSES;
  const indexOf = (status: CrmStatus) => {
    const i = order.indexOf(status);
    return i >= 0 ? i : -1;
  };
  return order.map((status, stageIdx) => {
    const reached = leads.filter((lead) => {
      if (lead.crmStatus === "lead_perdido") {
        // Lost leads: we only know current status; count them if they ever were past early stages
        // Without history we approximate: lost never counted as reached later stages
        return false;
      }
      return indexOf(lead.crmStatus) >= stageIdx;
    }).length;
    return {
      key: status,
      label: CRM_STATUS_LABELS[status],
      value: reached,
      color: STATUS_COLORS[status] ?? CHART_PALETTE[stageIdx % CHART_PALETTE.length],
    };
  });
}

export function buildCrmReportSnapshot(
  leads: CrmLead[],
  scoreRules: CrmLeadScoreRule[],
  dateFilter: CrmReportDateFilter,
  options?: { timelineGranularity?: "day" | "week" | "month" },
): CrmReportSnapshot {
  const total = leads.length;
  const qualified = leads.filter((l) => Boolean(l.qualFilledAt)).length;
  const won = leads.filter((l) => l.crmStatus === "aluno_pronto").length;
  const lost = leads.filter((l) => l.crmStatus === "lead_perdido").length;
  const open = total - won - lost;
  const withAccount = leads.filter((l) => Boolean(l.userId)).length;
  const transferCount = leads.filter((l) => Boolean(l.transferSchool?.trim())).length;

  const scores = leads
    .filter((l) => l.qualFilledAt)
    .map((l) => computeLeadScore(l, scoreRules).total);
  const funnelDays = leads
    .map((l) => daysBetween(l.funnelEnteredAt || l.createdAt))
    .filter((n): n is number => n != null);
  const statusDays = leads
    .map((l) => daysBetween(l.statusEnteredAt || l.updatedAt))
    .filter((n): n is number => n != null);

  let overdueFups = 0;
  let pendingFups = 0;
  for (const lead of leads) {
    overdueFups += countOverdueFollowups(lead.followups);
    pendingFups += countPendingFollowups(lead.followups);
  }

  const kpis: CrmReportKpis = {
    total,
    qualified,
    qualRate: total ? (qualified / total) * 100 : 0,
    won,
    lost,
    open,
    conversionRate: total ? (won / total) * 100 : 0,
    closedWinRate: won + lost ? (won / (won + lost)) * 100 : 0,
    lostRate: total ? (lost / total) * 100 : 0,
    withAccount,
    accountRate: total ? (withAccount / total) * 100 : 0,
    avgScore: avg(scores),
    avgDaysInFunnel: avg(funnelDays),
    avgDaysInStatus: avg(statusDays),
    overdueFups,
    pendingFups,
    transferCount,
    transferRate: total ? (transferCount / total) * 100 : 0,
  };

  const byStatus = CRM_STATUSES.map((status, i) => ({
    key: status,
    label: CRM_STATUS_LABELS[status],
    value: leads.filter((l) => l.crmStatus === status).length,
    color: STATUS_COLORS[status] ?? CHART_PALETTE[i % CHART_PALETTE.length],
  })).filter((b) => b.value > 0);

  const granularity =
    options?.timelineGranularity ??
    inferTimelineGranularity(dateFilter.from, dateFilter.to || new Date().toISOString().slice(0, 10));

  const timelineMap = new Map<string, CrmReportSeriesPoint>();
  for (const lead of leads) {
    const raw = leadDateValue(lead, dateFilter.field) || lead.createdAt;
    const { key, label } = timelineKey(raw, granularity);
    const point = timelineMap.get(key) ?? { key, label, value: 0, won: 0, lost: 0, open: 0, qualified: 0 };
    point.value += 1;
    if (lead.crmStatus === "aluno_pronto") point.won = (point.won ?? 0) + 1;
    else if (lead.crmStatus === "lead_perdido") point.lost = (point.lost ?? 0) + 1;
    else point.open = (point.open ?? 0) + 1;
    if (lead.qualFilledAt) point.qualified = (point.qualified ?? 0) + 1;
    timelineMap.set(key, point);
  }
  const timeline = Array.from(timelineMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  const lossReasons = countBy(
    leads.filter((l) => l.crmStatus === "lead_perdido").map((l) => l.lossReason?.trim() || "Sem motivo"),
  );

  const courses = countBy(leads.map((l) => l.desiredCourse?.trim() || "Não informado"));
  const startDates = countBy(
    leads.map((l) => l.startDate || "Não informado"),
    (k) => (k === "Não informado" ? k : startDateLabel(k)),
  );
  const weeklyHours = countBy(
    leads.map((l) => (l.weeklyHours != null ? String(l.weeklyHours) : "Não informado")),
    (k) => (k === "Não informado" ? k : `${k}h/semana`),
  );
  const periods = countBy(
    leads.map((l) => l.availablePeriod || "Não informado"),
    (k) => (k === "Não informado" ? k : periodLabel(k)),
  );
  const theoreticalExam = countBy(
    leads.map((l) => theoreticalLabel(l.theoreticalExamDone)),
  );
  const studyStatus = countBy(
    leads.map((l) => l.theoreticalStudyStatus?.trim() || "Não informado"),
  );
  const referralSources = countBy(
    leads.map((l) => l.referralSource?.trim() || "Não informado"),
  );

  const dayCounts: Record<AvailableDay, number> = {
    seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0, dom: 0,
  };
  for (const lead of leads) {
    for (const day of lead.availableDays ?? []) {
      if (day in dayCounts) dayCounts[day as AvailableDay] += 1;
    }
  }
  const availableDays: CrmReportBucket[] = (Object.keys(dayCounts) as AvailableDay[]).map((day, i) => ({
    key: day,
    label: AVAILABLE_DAY_LABELS[day],
    value: dayCounts[day],
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  const transferSplit: CrmReportBucket[] = [
    {
      key: "transfer",
      label: "Transferência",
      value: transferCount,
      color: "#818cf8",
    },
    {
      key: "new",
      label: "Novo aluno",
      value: total - transferCount,
      color: "#34d399",
    },
  ].filter((b) => b.value > 0);

  const fupHealth: CrmReportBucket[] = [
    { key: "overdue", label: "FUPs atrasados", value: overdueFups, color: "#f59e0b" },
    { key: "pending", label: "FUPs futuros", value: pendingFups, color: "#38bdf8" },
    {
      key: "none",
      label: "Leads sem FUP aberto",
      value: leads.filter((l) => countOverdueFollowups(l.followups) === 0 && countPendingFollowups(l.followups) === 0).length,
      color: "#64748b",
    },
  ];

  const agingByStatus = CRM_STATUSES.map((status, i) => {
    const days = leads
      .filter((l) => l.crmStatus === status)
      .map((l) => daysBetween(l.statusEnteredAt || l.updatedAt))
      .filter((n): n is number => n != null);
    const mean = avg(days);
    return {
      key: status,
      label: CRM_STATUS_LABELS[status],
      value: mean != null ? Math.round(mean * 10) / 10 : 0,
      color: STATUS_COLORS[status] ?? CHART_PALETTE[i % CHART_PALETTE.length],
    };
  }).filter((b) => b.value > 0);

  return {
    kpis,
    byStatus,
    timeline,
    lossReasons,
    courses,
    startDates,
    weeklyHours,
    periods,
    theoreticalExam,
    studyStatus,
    referralSources,
    availableDays,
    scoreHistogram: buildScoreHistogram(leads, scoreRules),
    transferSplit,
    fupHealth,
    conversionStages: buildConversionStages(leads),
    agingByStatus,
  };
}

export function collectReferralSources(leads: CrmLead[]): string[] {
  const set = new Set<string>();
  for (const lead of leads) {
    set.add(lead.referralSource?.trim() || "Não informado");
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function collectLossReasonsFromLeads(leads: CrmLead[]): string[] {
  const set = new Set<string>();
  for (const lead of leads) {
    if (lead.crmStatus === "lead_perdido") {
      set.add(lead.lossReason?.trim() || "Sem motivo");
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatNum(value: number, digits = 0): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export { CHART_PALETTE, STATUS_COLORS };
