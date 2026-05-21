import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, SCHOOL_COSTS_COL_ID, DEFAULT_SCHOOL_ID } from "./appwrite";
import {
  defaultProfitDeductions,
  defaultSchoolCosts,
  defaultTaxConfig,
  type ManualDreLine,
  type ManualDreMonthlyValue,
  STUDENT_PAYMENT_METHODS,
  type PaymentMethodCost,
  type ProfitDeductions,
  type SchoolCosts,
  type TaxConfig,
} from "../types/costs";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && SCHOOL_COSTS_COL_ID);
}

function parsePaymentMethodCosts(raw: string | null | undefined): SchoolCosts["paymentMethodCosts"] {
  const defaults = defaultSchoolCosts().paymentMethodCosts;
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return defaults;
    const obj = parsed as Record<string, unknown>;
    const result = { ...defaults };
    for (const method of STUDENT_PAYMENT_METHODS) {
      const entry = obj[method] as Record<string, unknown> | undefined;
      if (entry) {
        result[method] = {
          fixedCost: Number(entry.fixedCost ?? 0),
          percentCost: Number(entry.percentCost ?? 0),
        } satisfies PaymentMethodCost;
      }
    }
    return result;
  } catch {
    return defaults;
  }
}

function parseProfitDeductions(raw: unknown): ProfitDeductions {
  const defaults = defaultProfitDeductions();
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    aircraftCosts: Boolean(obj.aircraftCosts ?? false),
    fuelCosts: Boolean(obj.fuelCosts ?? false),
    instructorTransfer: Boolean(obj.instructorTransfer ?? false),
    paymentMethodFees: Boolean(obj.paymentMethodFees ?? false),
    workOrderCosts: Boolean(obj.workOrderCosts ?? false),
  };
}

function parseTaxConfig(raw: string | null | undefined): TaxConfig {
  const defaults = defaultTaxConfig();
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return defaults;
    const obj = parsed as Record<string, unknown>;
    return {
      revenueRatePercent: Number(obj.revenueRatePercent ?? 0),
      grossProfitRatePercent: Number(obj.grossProfitRatePercent ?? 0),
      netProfitRatePercent: Number(obj.netProfitRatePercent ?? 0),
      grossProfitDeductions: parseProfitDeductions(obj.grossProfitDeductions),
      netProfitDeductions: parseProfitDeductions(obj.netProfitDeductions),
    } satisfies TaxConfig;
  } catch {
    return defaults;
  }
}

function parseManualDreLines(raw: string | null | undefined): ManualDreLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const obj = entry as Record<string, unknown>;
        const id = String(obj.id || "").trim();
        const name = String(obj.name || "").trim();
        const sectionKey = String(obj.sectionKey || "").trim();
        if (!id || !name || !sectionKey) return null;
        return {
          id,
          name,
          defaultAmount: Number(obj.defaultAmount ?? 0),
          sectionKey,
          active: obj.active !== false,
          createdAt: String(obj.createdAt || ""),
          updatedAt: String(obj.updatedAt || ""),
        } satisfies ManualDreLine;
      })
      .filter((entry): entry is ManualDreLine => Boolean(entry));
  } catch {
    return [];
  }
}

function parseManualDreValues(raw: string | null | undefined): ManualDreMonthlyValue {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ManualDreMonthlyValue = {};
    for (const [month, values] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}$/.test(month) || !values || typeof values !== "object" || Array.isArray(values)) continue;
      result[month] = {};
      for (const [lineId, amount] of Object.entries(values as Record<string, unknown>)) {
        const n = Number(amount);
        if (lineId && Number.isFinite(n)) result[month][lineId] = n;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function toSchoolCosts(doc: Record<string, unknown>): SchoolCosts {
  return {
    id: (doc.$id as string) ?? null,
    enrollmentCost: Number(doc.enrollment_cost ?? 0),
    paymentMethodCosts: parsePaymentMethodCosts(doc.payment_method_costs_json as string | null),
    taxConfig: parseTaxConfig(doc.tax_config_json as string | null),
    manualDreLines: parseManualDreLines(doc.manual_dre_lines_json as string | null),
    manualDreValues: parseManualDreValues(doc.manual_dre_values_json as string | null),
    updatedAt: (doc.updated_at as string | null) ?? null,
    updatedBy: (doc.updated_by as string | null) ?? null,
  };
}

export async function getSchoolCosts(): Promise<SchoolCosts> {
  if (!isReady() || !databases) return defaultSchoolCosts();
  try {
    const res = await databases.listDocuments(DB_ID, SCHOOL_COSTS_COL_ID!, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    return doc ? toSchoolCosts(doc as unknown as Record<string, unknown>) : defaultSchoolCosts();
  } catch {
    return defaultSchoolCosts();
  }
}

export async function saveSchoolCosts(
  costs: Pick<SchoolCosts, "enrollmentCost" | "paymentMethodCosts" | "taxConfig" | "manualDreLines" | "manualDreValues">,
  actorUserId: string,
): Promise<SchoolCosts> {
  if (!isReady() || !databases || !SCHOOL_COSTS_COL_ID) throw new Error("Appwrite não configurado");
  const now = new Date().toISOString();
  const payload = {
    school_id: DEFAULT_SCHOOL_ID,
    enrollment_cost: costs.enrollmentCost,
    payment_method_costs_json: JSON.stringify(costs.paymentMethodCosts),
    tax_config_json: JSON.stringify(costs.taxConfig),
    manual_dre_lines_json: JSON.stringify(costs.manualDreLines),
    manual_dre_values_json: JSON.stringify(costs.manualDreValues),
    updated_at: now,
    updated_by: actorUserId,
  };
  const existing = await getSchoolCosts();
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  let doc: Record<string, unknown>;
  if (existing.id) {
    doc = (await databases.updateDocument(DB_ID, SCHOOL_COSTS_COL_ID, existing.id, payload, permissions)) as unknown as Record<string, unknown>;
  } else {
    doc = (await databases.createDocument(DB_ID, SCHOOL_COSTS_COL_ID, ID.unique(), payload, permissions)) as unknown as Record<string, unknown>;
  }
  return toSchoolCosts(doc as Record<string, unknown>);
}
