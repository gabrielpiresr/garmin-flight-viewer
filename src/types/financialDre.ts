export type FinancialDreValueType = "money" | "percent" | "number" | "hours";

export type FinancialClosingStatus = "open" | "closed" | "reopened";

export type FinancialDreMonth = {
  key: string;
  label: string;
  status: FinancialClosingStatus;
  closingId: string | null;
  isPast: boolean;
};

export type FinancialDreBreakdownItem = {
  label: string;
  amount: number;
  valueType?: FinancialDreValueType;
  meta?: Record<string, string | number | boolean | null>;
};

export type FinancialDreBreakdown = Record<string, FinancialDreBreakdownItem[]>;

export type FinancialDreLine = {
  key: string;
  parentKey: string | null;
  level: 1 | 2 | 3;
  section: string;
  label: string;
  valueType: FinancialDreValueType;
  formulaLabel: string;
  values: Record<string, number>;
  breakdown?: Record<string, FinancialDreBreakdown>;
  isManual?: boolean;
  manualLineId?: string;
};

export type FinancialDreCard = {
  key: string;
  label: string;
  valueType: FinancialDreValueType;
  values: Record<string, number>;
  total: number;
  details: FinancialDreBreakdown;
};

export type FinancialDreResponse = {
  fromMonth: string;
  toMonth: string;
  months: FinancialDreMonth[];
  lines: FinancialDreLine[];
  cards: FinancialDreCard[];
  generatedAt: string;
};

export type FinancialDreParams = {
  fromMonth: string;
  toMonth: string;
};

export const DRE_LEVEL1_SECTIONS = [
  { key: "section_revenue", label: "Receita" },
  { key: "section_commercial_deductions", label: "Deducoes e Perdas Comerciais" },
  { key: "section_variable_costs", label: "Custos Variaveis" },
  { key: "section_operational_margin", label: "Margem Operacional" },
  { key: "section_fixed_costs", label: "Custos Fixos" },
  { key: "section_ebitda", label: "EBITDA (Resultado Operacional)" },
  { key: "section_taxes", label: "Impostos" },
  { key: "section_net_profit", label: "Lucro liquido" },
] as const;
