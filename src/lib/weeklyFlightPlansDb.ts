import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  OP_WEEKS_COL_ID,
  DEFAULT_SCHOOL_ID,
  WEEKLY_PLANS_COL_ID,
} from "./appwrite";

import { getSchoolRules } from "./schoolRulesDb";
import type { OperationalWeek } from "../types/admin";
import type {
  WeeklyFlightPlan,
  WeeklyFlightPlanItemFull,
  WeeklyFlightPlanFull,
  SavePlanPayload,
  WeeklyFlightPlanStatus,
  FlexibilityLevel,
  AvailabilityPeriod,
  AvailabilityType,
} from "../types/planning";
import { DEFAULT_SCHOOL_RULES, type SchoolRules } from "../types/schoolRules";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(
    isAppwriteConfigured &&
    databases &&
    DB_ID &&
    OP_WEEKS_COL_ID &&
    WEEKLY_PLANS_COL_ID,
  );
}

function toPlan(doc: Record<string, unknown>): WeeklyFlightPlan {
  return {
    id: doc.$id as string,
    student_id: (doc.student_id as string) ?? "",
    operational_week_id: (doc.operational_week_id as string) ?? "",
    week_start: (doc.week_start as string) ?? "",
    requested_flights_count: (doc.requested_flights_count as number) ?? 0,
    status: ((doc.status as string) ?? "draft") as WeeklyFlightPlanStatus,
    updated_at: (doc.$updatedAt as string) ?? "",
    items_json: (doc.items_json as string | null) ?? null,
  };
}

function toWeekDoc(doc: Record<string, unknown>): OperationalWeek {
  return {
    id: doc.$id as string,
    aircraft_id: (doc.aircraft_id as string) ?? "",
    week_start: (doc.week_start as string) ?? "",
    week_end: (doc.week_end as string) ?? "",
    created_by: (doc.created_by as string) ?? "",
    created_at: (doc.$createdAt as string) ?? "",
    is_open_for_requests: (doc.is_open_for_requests as boolean) ?? true,
    schedule_closed_at: (doc.schedule_closed_at as string | null) ?? null,
    daily_caps_json: null,
    group_caps_json: null,
    slots_json: null,
  };
}

type SerializedItem = {
  position: number;
  durationHours: number;
  flexibilityLevel: FlexibilityLevel;
  preferredAircraft: string | null;
  priorityLevel: 1 | 2 | 3;
  notes: string | null;
  isNight?: boolean;
  availability: { dayOfWeek: number; period: AvailabilityPeriod; availabilityType: AvailabilityType }[];
};

function parseItems(json: string | null, planId: string): WeeklyFlightPlanItemFull[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as SerializedItem[];
    return raw.map((item, i) => ({
      id: `${planId}-item-${i}`,
      weekly_plan_id: planId,
      position: item.position,
      duration_hours: item.durationHours,
      flexibility_level: item.flexibilityLevel,
      preferred_aircraft: item.preferredAircraft,
      priority_level: item.priorityLevel,
      notes: item.notes,
      isNight: item.isNight ?? false,
      availability: item.availability.map((a, j) => ({
        id: `${planId}-item-${i}-avail-${j}`,
        plan_item_id: `${planId}-item-${i}`,
        day_of_week: a.dayOfWeek,
        period: a.period,
        availability_type: a.availabilityType,
      })),
    }));
  } catch {
    return [];
  }
}

function serializeItems(items: SavePlanPayload["items"]): string {
  const serialized: SerializedItem[] = items.map((item) => ({
    position: item.position,
    durationHours: item.durationHours,
    flexibilityLevel: item.flexibilityLevel,
    preferredAircraft: item.preferredAircraft,
    priorityLevel: item.priorityLevel,
    notes: item.notes,
    isNight: item.isNight ?? false,
    availability: item.availability,
  }));
  return JSON.stringify(serialized);
}

function studentPlanPerms(studentId: string) {
  return [
    Permission.read(Role.user(studentId)),
    Permission.update(Role.user(studentId)),
    Permission.delete(Role.user(studentId)),
  ];
}

function validDurationStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) <= 0.001;
}

function sanitizePlanItems(items: SavePlanPayload["items"], rules: SchoolRules): SavePlanPayload["items"] {
  return items.map((item, index) => {
    const durationHours = Number(item.durationHours);
    if (
      !Number.isFinite(durationHours) ||
      durationHours < rules.schedule.minRequestHours ||
      durationHours > rules.schedule.maxRequestHours ||
      !validDurationStep(durationHours)
    ) {
      throw new Error(`Duração inválida no voo ${index + 1}.`);
    }
    if (!item.preferredAircraft) {
      throw new Error(`Selecione o modelo de aeronave no voo ${index + 1}.`);
    }
    if (![1, 2, 3].includes(item.priorityLevel)) {
      throw new Error(`Prioridade inválida no voo ${index + 1}.`);
    }
    const isNight = item.isNight ?? false;
    if (isNight && !rules.schedule.allowNightFlights) {
      throw new Error(`Voos noturnos não estão habilitados pela escola (voo ${index + 1}).`);
    }
    const availability = item.availability.filter((entry) => {
      if (![0, 1, 2, 3, 4, 5, 6].includes(entry.dayOfWeek)) return false;
      if (!(entry.availabilityType === "available" || entry.availabilityType === "preferred")) return false;
      if (isNight) return entry.period === "night";
      return entry.period === "morning" || entry.period === "afternoon";
    });
    if (availability.length === 0) throw new Error(`Informe disponibilidade no voo ${index + 1}.`);
    return {
      position: index,
      durationHours,
      flexibilityLevel: item.flexibilityLevel ?? "medium",
      preferredAircraft: item.preferredAircraft ? String(item.preferredAircraft).slice(0, 64) : null,
      priorityLevel: item.priorityLevel,
      notes: item.notes ? String(item.notes).slice(0, 512) : null,
      isNight,
      availability,
    };
  });
}

async function ensureWeekIsOpen(operationalWeekId: string, weekStart: string) {
  if (!databases || !DB_ID || !OP_WEEKS_COL_ID) return;
  const res = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("week_start", [weekStart]),
    Query.equal("is_open_for_requests", [true]),
    Query.limit(50),
  ]);
  const matching = res.documents.find((doc) => doc.$id === operationalWeekId) ?? res.documents[0];
  if (!matching || (matching as unknown as Record<string, unknown>).schedule_closed_at) {
    throw new Error("As solicitações para esta semana não estão abertas.");
  }
}

// Returns all open weeks whose week_end >= today, deduplicated by week_start (one entry per calendar week).
export async function findOpenWeeks(): Promise<OperationalWeek[]> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return [];
  const today = new Date().toISOString().slice(0, 10);
  const res = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("is_open_for_requests", [true]),
    Query.greaterThanEqual("week_end", today),
    Query.orderAsc("week_start"),
    Query.limit(20),
  ]);
  const seen = new Set<string>();
  const weeks: OperationalWeek[] = [];
  for (const doc of res.documents) {
    const d = doc as unknown as Record<string, unknown>;
    if (d.schedule_closed_at) continue;
    const ws = (d.week_start as string) ?? "";
    if (!seen.has(ws)) {
      seen.add(ws);
      weeks.push(toWeekDoc(d));
    }
  }
  return weeks;
}

export async function getStudentPlan(
  studentId: string,
  weekStart: string,
): Promise<WeeklyFlightPlanFull | null> {
  if (!isReady() || !databases || !DB_ID || !WEEKLY_PLANS_COL_ID) return null;

  const res = await databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.equal("student_id", [studentId]),
    Query.equal("week_start", [weekStart]),
    Query.limit(1),
  ]);
  if (res.total === 0 || !res.documents[0]) return null;

  const plan = toPlan(res.documents[0] as unknown as Record<string, unknown>);
  return { ...plan, items: parseItems(plan.items_json, plan.id) };
}

export async function getPreviousStudentPlan(
  studentId: string,
): Promise<WeeklyFlightPlanFull | null> {
  if (!isReady() || !databases || !DB_ID || !WEEKLY_PLANS_COL_ID) return null;

  const res = await databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.equal("student_id", [studentId]),
    Query.equal("status", ["submitted"]),
    Query.orderDesc("week_start"),
    Query.limit(1),
  ]);
  if (res.total === 0 || !res.documents[0]) return null;

  const plan = toPlan(res.documents[0] as unknown as Record<string, unknown>);
  return { ...plan, items: parseItems(plan.items_json, plan.id) };
}

export async function saveStudentPlan(
  payload: SavePlanPayload,
): Promise<WeeklyFlightPlanFull> {
  if (!isReady() || !databases || !DB_ID || !WEEKLY_PLANS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }

  const rules = await getSchoolRules().catch(() => DEFAULT_SCHOOL_RULES);
  if (!rules.schedule.allowStudentFlightIntentions) {
    throw new Error("A escola desativou solicitações de intenção de voo no momento.");
  }
  await ensureWeekIsOpen(payload.operationalWeekId, payload.weekStart);

  const requestedFlightsCount = Math.round(Number(payload.requestedFlightsCount));
  if (!Number.isInteger(requestedFlightsCount) || requestedFlightsCount < 1 || requestedFlightsCount > 7) {
    throw new Error("Informe entre 1 e 7 voos para a semana.");
  }
  if (payload.items.length !== requestedFlightsCount) {
    throw new Error("Quantidade de voos diferente dos itens informados.");
  }
  const sanitizedItems = sanitizePlanItems(payload.items, rules);
  const items_json = serializeItems(sanitizedItems);
  const now = new Date().toISOString();

  const existing = await databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.equal("student_id", [payload.studentId]),
    Query.equal("week_start", [payload.weekStart]),
    Query.limit(1),
  ]);

  let planDoc: Record<string, unknown>;

  if (existing.total > 0 && existing.documents[0]) {
    planDoc = await databases.updateDocument(DB_ID, WEEKLY_PLANS_COL_ID, existing.documents[0].$id, {
      requested_flights_count: requestedFlightsCount,
      status: "draft",
      updated_at: now,
      items_json,
    }) as unknown as Record<string, unknown>;
  } else {
    planDoc = await databases.createDocument(
      DB_ID,
      WEEKLY_PLANS_COL_ID,
      ID.unique(),
      {
        school_id: DEFAULT_SCHOOL_ID,
        student_id: payload.studentId,
        operational_week_id: payload.operationalWeekId,
        week_start: payload.weekStart,
        requested_flights_count: requestedFlightsCount,
        status: "draft",
        updated_at: now,
        items_json,
      },
      studentPlanPerms(payload.studentId),
    ) as unknown as Record<string, unknown>;
  }

  const plan = toPlan(planDoc);
  return { ...plan, items: parseItems(plan.items_json, plan.id) };
}

export async function submitStudentPlan(planId: string): Promise<void> {
  if (!isReady() || !databases || !DB_ID || !WEEKLY_PLANS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }
  const plan = await databases.getDocument(DB_ID, WEEKLY_PLANS_COL_ID, planId);
  await ensureWeekIsOpen(
    String((plan as unknown as Record<string, unknown>).operational_week_id ?? ""),
    String((plan as unknown as Record<string, unknown>).week_start ?? ""),
  );
  await databases.updateDocument(DB_ID, WEEKLY_PLANS_COL_ID, planId, {
    status: "submitted",
    updated_at: new Date().toISOString(),
  });
}
