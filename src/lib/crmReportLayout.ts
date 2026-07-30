import type { CrmReportSnapshot } from "./crmReportMetrics";

export type CrmReportPanelType =
  | "kpi_total"
  | "kpi_conversion"
  | "kpi_closed_win"
  | "kpi_qual_rate"
  | "kpi_lost_rate"
  | "kpi_avg_score"
  | "kpi_avg_days_funnel"
  | "kpi_with_account"
  | "kpi_open_pipeline"
  | "kpi_fups"
  | "kpi_transfer"
  | "funnel_status"
  | "conversion_stages"
  | "leads_timeline"
  | "loss_reasons"
  | "qual_course"
  | "qual_start_date"
  | "qual_weekly_hours"
  | "qual_period"
  | "qual_theoretical"
  | "qual_study_status"
  | "referral_source"
  | "score_histogram"
  | "available_days"
  | "transfer_split"
  | "fup_health"
  | "aging_by_status";

export type CrmReportViz = "auto" | "stat" | "bar" | "hbar" | "line" | "area" | "pie" | "table";

/** Width in 12-col grid units; height in row spans. */
export type CrmReportPanelSize = {
  w: 3 | 4 | 6 | 8 | 12;
  h: 1 | 2 | 3;
};

export type CrmReportPanel = {
  id: string;
  type: CrmReportPanelType;
  viz: CrmReportViz;
  size: CrmReportPanelSize;
};

export type CrmReportPanelMeta = {
  type: CrmReportPanelType;
  label: string;
  description: string;
  category: "kpi" | "funil" | "qualificacao" | "perda" | "operacao";
  defaultViz: CrmReportViz;
  defaultSize: CrmReportPanelSize;
  allowedViz: CrmReportViz[];
};

export const CRM_REPORT_PANEL_CATALOG: CrmReportPanelMeta[] = [
  {
    type: "kpi_total",
    label: "Total de leads",
    description: "Quantidade de leads no recorte filtrado",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_conversion",
    label: "Taxa de conversão",
    description: "Alunos em curso / total de leads",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_closed_win",
    label: "Win rate (fechados)",
    description: "Ganhos / (ganhos + perdidos)",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_qual_rate",
    label: "Taxa de qualificação",
    description: "Leads que preencheram a qualificação",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_lost_rate",
    label: "Taxa de perda",
    description: "Leads perdidos / total",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_avg_score",
    label: "Score médio",
    description: "Média do lead score dos qualificados",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_avg_days_funnel",
    label: "Dias médios no funil",
    description: "Tempo médio desde a entrada no funil",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_with_account",
    label: "Com conta criada",
    description: "Leads com usuário vinculado",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_open_pipeline",
    label: "Pipeline aberto",
    description: "Leads ainda em andamento",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_fups",
    label: "FUPs em aberto",
    description: "Pendentes e atrasados",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "kpi_transfer",
    label: "Transferências",
    description: "Leads vindos de outra escola",
    category: "kpi",
    defaultViz: "stat",
    defaultSize: { w: 3, h: 1 },
    allowedViz: ["stat"],
  },
  {
    type: "funnel_status",
    label: "Distribuição por status",
    description: "Quantidade atual em cada coluna do CRM",
    category: "funil",
    defaultViz: "hbar",
    defaultSize: { w: 6, h: 2 },
    allowedViz: ["bar", "hbar", "pie", "table"],
  },
  {
    type: "conversion_stages",
    label: "Funil de conversão",
    description: "Alcance acumulado por etapa do funil",
    category: "funil",
    defaultViz: "bar",
    defaultSize: { w: 6, h: 2 },
    allowedViz: ["bar", "hbar", "table"],
  },
  {
    type: "leads_timeline",
    label: "Entrada de leads",
    description: "Volume ao longo do tempo (entrada filtrada)",
    category: "funil",
    defaultViz: "area",
    defaultSize: { w: 8, h: 2 },
    allowedViz: ["line", "area", "bar", "table"],
  },
  {
    type: "loss_reasons",
    label: "Motivos de perda",
    description: "Por que os leads foram perdidos",
    category: "perda",
    defaultViz: "pie",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["pie", "bar", "hbar", "table"],
  },
  {
    type: "qual_course",
    label: "Curso desejado",
    description: "Respostas de curso na qualificação",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "hbar", "pie", "table"],
  },
  {
    type: "qual_start_date",
    label: "Quando quer começar",
    description: "Urgência declarada na qualificação",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "hbar", "pie", "table"],
  },
  {
    type: "qual_weekly_hours",
    label: "Horas por semana",
    description: "Disponibilidade semanal declarada",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "hbar", "pie", "table"],
  },
  {
    type: "qual_period",
    label: "Período disponível",
    description: "Manhã, tarde ou ambos",
    category: "qualificacao",
    defaultViz: "pie",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["pie", "bar", "table"],
  },
  {
    type: "qual_theoretical",
    label: "Banca teórica",
    description: "Já fez a banca PPL?",
    category: "qualificacao",
    defaultViz: "pie",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["pie", "bar", "table"],
  },
  {
    type: "qual_study_status",
    label: "Estudos teóricos",
    description: "Status dos estudos para a banca",
    category: "qualificacao",
    defaultViz: "hbar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["hbar", "bar", "pie", "table"],
  },
  {
    type: "referral_source",
    label: "Origem / indicação",
    description: "De onde vieram os leads",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 6, h: 2 },
    allowedViz: ["bar", "hbar", "pie", "table"],
  },
  {
    type: "score_histogram",
    label: "Distribuição de score",
    description: "Faixas de lead score dos qualificados",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "table"],
  },
  {
    type: "available_days",
    label: "Dias disponíveis",
    description: "Dias da semana marcados na qualificação",
    category: "qualificacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "table"],
  },
  {
    type: "transfer_split",
    label: "Transferência vs novo",
    description: "Perfil de origem acadêmica",
    category: "operacao",
    defaultViz: "pie",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["pie", "bar", "table"],
  },
  {
    type: "fup_health",
    label: "Saúde dos FUPs",
    description: "Atrasados, pendentes e sem follow-up",
    category: "operacao",
    defaultViz: "bar",
    defaultSize: { w: 4, h: 2 },
    allowedViz: ["bar", "pie", "table"],
  },
  {
    type: "aging_by_status",
    label: "Tempo médio por status",
    description: "Dias médios parados em cada etapa",
    category: "operacao",
    defaultViz: "hbar",
    defaultSize: { w: 6, h: 2 },
    allowedViz: ["hbar", "bar", "table"],
  },
];

export const CRM_REPORT_CATEGORY_LABELS: Record<CrmReportPanelMeta["category"], string> = {
  kpi: "Indicadores",
  funil: "Funil",
  qualificacao: "Qualificação",
  perda: "Perdas",
  operacao: "Operação",
};

export function getPanelMeta(type: CrmReportPanelType): CrmReportPanelMeta {
  return CRM_REPORT_PANEL_CATALOG.find((p) => p.type === type) ?? CRM_REPORT_PANEL_CATALOG[0]!;
}

export function createPanel(type: CrmReportPanelType): CrmReportPanel {
  const meta = getPanelMeta(type);
  return {
    id: `${type}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    viz: meta.defaultViz,
    size: { ...meta.defaultSize },
  };
}

export const DEFAULT_CRM_REPORT_LAYOUT: CrmReportPanel[] = [
  createPanel("kpi_total"),
  createPanel("kpi_conversion"),
  createPanel("kpi_qual_rate"),
  createPanel("kpi_lost_rate"),
  createPanel("kpi_avg_score"),
  createPanel("kpi_open_pipeline"),
  createPanel("kpi_fups"),
  createPanel("kpi_avg_days_funnel"),
  { ...createPanel("leads_timeline"), size: { w: 8, h: 2 } },
  { ...createPanel("loss_reasons"), size: { w: 4, h: 2 } },
  { ...createPanel("funnel_status"), size: { w: 6, h: 2 } },
  { ...createPanel("conversion_stages"), size: { w: 6, h: 2 } },
  { ...createPanel("qual_course"), size: { w: 4, h: 2 } },
  { ...createPanel("qual_start_date"), size: { w: 4, h: 2 } },
  { ...createPanel("referral_source"), size: { w: 4, h: 2 } },
  { ...createPanel("fup_health"), size: { w: 4, h: 2 } },
  { ...createPanel("score_histogram"), size: { w: 4, h: 2 } },
  { ...createPanel("aging_by_status"), size: { w: 4, h: 2 } },
];

export function resolvePanelBuckets(
  type: CrmReportPanelType,
  snapshot: CrmReportSnapshot,
): { label: string; key: string; value: number; color?: string }[] | null {
  switch (type) {
    case "funnel_status":
      return snapshot.byStatus;
    case "conversion_stages":
      return snapshot.conversionStages;
    case "loss_reasons":
      return snapshot.lossReasons;
    case "qual_course":
      return snapshot.courses;
    case "qual_start_date":
      return snapshot.startDates;
    case "qual_weekly_hours":
      return snapshot.weeklyHours;
    case "qual_period":
      return snapshot.periods;
    case "qual_theoretical":
      return snapshot.theoreticalExam;
    case "qual_study_status":
      return snapshot.studyStatus;
    case "referral_source":
      return snapshot.referralSources;
    case "score_histogram":
      return snapshot.scoreHistogram;
    case "available_days":
      return snapshot.availableDays;
    case "transfer_split":
      return snapshot.transferSplit;
    case "fup_health":
      return snapshot.fupHealth;
    case "aging_by_status":
      return snapshot.agingByStatus;
    default:
      return null;
  }
}

export function resolveKpi(
  type: CrmReportPanelType,
  snapshot: CrmReportSnapshot,
): { value: string; subtitle: string; tone: "sky" | "emerald" | "amber" | "rose" | "violet" | "slate" } | null {
  const { kpis } = snapshot;
  switch (type) {
    case "kpi_total":
      return { value: String(kpis.total), subtitle: "leads no recorte", tone: "sky" };
    case "kpi_conversion":
      return {
        value: `${kpis.conversionRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.won} em curso`,
        tone: "emerald",
      };
    case "kpi_closed_win":
      return {
        value: `${kpis.closedWinRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.won} ganhos · ${kpis.lost} perdidos`,
        tone: "emerald",
      };
    case "kpi_qual_rate":
      return {
        value: `${kpis.qualRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.qualified} qualificaram`,
        tone: "violet",
      };
    case "kpi_lost_rate":
      return {
        value: `${kpis.lostRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.lost} perdidos`,
        tone: "rose",
      };
    case "kpi_avg_score":
      return {
        value: kpis.avgScore == null ? "—" : kpis.avgScore.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
        subtitle: "score médio",
        tone: "amber",
      };
    case "kpi_avg_days_funnel":
      return {
        value:
          kpis.avgDaysInFunnel == null
            ? "—"
            : kpis.avgDaysInFunnel.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
        subtitle: "dias no funil",
        tone: "slate",
      };
    case "kpi_with_account":
      return {
        value: `${kpis.accountRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.withAccount} com conta`,
        tone: "sky",
      };
    case "kpi_open_pipeline":
      return {
        value: String(kpis.open),
        subtitle: "em andamento",
        tone: "sky",
      };
    case "kpi_fups":
      return {
        value: String(kpis.overdueFups + kpis.pendingFups),
        subtitle: `${kpis.overdueFups} atrasados · ${kpis.pendingFups} futuros`,
        tone: kpis.overdueFups > 0 ? "amber" : "sky",
      };
    case "kpi_transfer":
      return {
        value: `${kpis.transferRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        subtitle: `${kpis.transferCount} transferências`,
        tone: "violet",
      };
    default:
      return null;
  }
}

const LAYOUT_LS_KEY = "crm_report_layout_v1";

export function loadReportLayout(): CrmReportPanel[] {
  try {
    const raw = localStorage.getItem(LAYOUT_LS_KEY);
    if (!raw) return DEFAULT_CRM_REPORT_LAYOUT.map((p) => ({ ...p, size: { ...p.size } }));
    const parsed = JSON.parse(raw) as CrmReportPanel[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_CRM_REPORT_LAYOUT.map((p) => ({ ...p, size: { ...p.size } }));
    }
    const validTypes = new Set(CRM_REPORT_PANEL_CATALOG.map((p) => p.type));
    const cleaned = parsed.filter((p) => p && validTypes.has(p.type) && p.id);
    return cleaned.length > 0
      ? cleaned
      : DEFAULT_CRM_REPORT_LAYOUT.map((p) => ({ ...p, size: { ...p.size } }));
  } catch {
    return DEFAULT_CRM_REPORT_LAYOUT.map((p) => ({ ...p, size: { ...p.size } }));
  }
}

export function saveReportLayout(panels: CrmReportPanel[]) {
  try {
    localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(panels));
  } catch {
    /* ignore */
  }
}

export function resetReportLayout(): CrmReportPanel[] {
  const next = DEFAULT_CRM_REPORT_LAYOUT.map((p) => ({
    ...createPanel(p.type),
    viz: p.viz,
    size: { ...p.size },
  }));
  saveReportLayout(next);
  return next;
}
