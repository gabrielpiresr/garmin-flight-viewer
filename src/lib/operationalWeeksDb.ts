import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  OP_WEEKS_COL_ID,
} from "./appwrite";
import type {
  OperationalWeek,
  DailyCap,
  GroupCap,
  OperationalSlot,
  WeekConfigPayload,
  WeekConfigFull,
  SlotState,
} from "../types/admin";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function weekDocPerms() {
  return [
    Permission.read(Role.users()),
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && OP_WEEKS_COL_ID);
}

function toWeek(doc: Record<string, unknown>): OperationalWeek {
  return {
    id: doc.$id as string,
    aircraft_id: (doc.aircraft_id as string) ?? "",
    week_start: (doc.week_start as string) ?? "",
    week_end: (doc.week_end as string) ?? "",
    created_by: (doc.created_by as string) ?? "",
    created_at: (doc.$createdAt as string) ?? "",
    is_open_for_requests: (doc.is_open_for_requests as boolean) ?? false,
    schedule_closed_at: (doc.schedule_closed_at as string | null) ?? null,
    daily_caps_json: (doc.daily_caps_json as string | null) ?? null,
    group_caps_json: (doc.group_caps_json as string | null) ?? null,
    slots_json: (doc.slots_json as string | null) ?? null,
  };
}

function parseDailyCaps(json: string | null): DailyCap[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Record<string, number>;
    return Object.entries(raw).map(([day, maxHours]) => ({
      id: day,
      operational_week_id: "",
      day_of_week: Number(day),
      max_hours: maxHours,
    }));
  } catch {
    return [];
  }
}

function parseGroupCaps(json: string | null, weekId: string): GroupCap[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Array<{ maxHours: number; days: number[] }>;
    return raw.map((gc, i) => ({
      id: String(i),
      operational_week_id: weekId,
      max_hours: gc.maxHours,
      days: gc.days,
    }));
  } catch {
    return [];
  }
}

function parseSlots(json: string | null, weekId: string): OperationalSlot[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Record<string, SlotState>;
    return Object.entries(raw).map(([key, state]) => {
      const parts = key.split("-");
      const d = Number(parts[0]);
      const isNight = parts[1] === "night";
      const h = isNight ? -1 : Number(parts[1]);
      return {
        id: key,
        operational_week_id: weekId,
        day_of_week: d,
        start_hour: h,
        state,
      };
    });
  } catch {
    return [];
  }
}

export function isNightSlot(slot: OperationalSlot): boolean {
  return slot.start_hour === -1;
}

function serializeDailyCaps(caps: WeekConfigPayload["dailyCaps"]): string {
  const record: Record<string, number> = {};
  for (const cap of caps) record[cap.dayOfWeek] = cap.maxHours;
  return JSON.stringify(record);
}

function serializeGroupCaps(caps: WeekConfigPayload["groupCaps"]): string {
  return JSON.stringify(caps.map((gc) => ({ maxHours: gc.maxHours, days: gc.days })));
}

function serializeSlots(slots: WeekConfigPayload["slots"], nightSlots?: WeekConfigPayload["nightSlots"]): string {
  const record: Record<string, SlotState> = {};
  for (const slot of slots) record[`${slot.dayOfWeek}-${slot.startHour}`] = slot.state;
  if (nightSlots) {
    for (const ns of nightSlots) record[`${ns.dayOfWeek}-night`] = ns.state;
  }
  return JSON.stringify(record);
}

export async function listWeeksByAircraft(aircraftId: string): Promise<OperationalWeek[]> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("aircraft_id", [aircraftId]),
    Query.orderDesc("week_start"),
    Query.limit(100),
  ]);
  return res.documents.map((d) => toWeek(d as Record<string, unknown>));
}

export async function getWeekConfig(aircraftId: string, weekStart: string): Promise<WeekConfigFull | null> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return null;

  const res = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("aircraft_id", [aircraftId]),
    Query.equal("week_start", [weekStart]),
    Query.limit(1),
  ]);

  if (res.total === 0 || !res.documents[0]) return null;
  const week = toWeek(res.documents[0] as unknown as Record<string, unknown>);

  return {
    week,
    dailyCaps: parseDailyCaps(week.daily_caps_json),
    groupCaps: parseGroupCaps(week.group_caps_json, week.id),
    slots: parseSlots(week.slots_json, week.id),
  };
}

export async function saveWeekConfig(payload: WeekConfigPayload): Promise<WeekConfigFull> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }

  const daily_caps_json = serializeDailyCaps(payload.dailyCaps);
  const group_caps_json = serializeGroupCaps(payload.groupCaps);
  const slots_json = serializeSlots(payload.slots, payload.nightSlots);

  const existing = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("aircraft_id", [payload.aircraftId]),
    Query.equal("week_start", [payload.weekStart]),
    Query.limit(1),
  ]);

  let weekDoc: Record<string, unknown>;

  if (existing.total > 0 && existing.documents[0]) {
    const weekId = existing.documents[0].$id;
    weekDoc = await databases.updateDocument(DB_ID, OP_WEEKS_COL_ID, weekId, {
      is_open_for_requests: payload.isOpenForRequests ?? false,
      daily_caps_json,
      group_caps_json,
      slots_json,
    }) as unknown as Record<string, unknown>;
  } else {
    weekDoc = await databases.createDocument(
      DB_ID,
      OP_WEEKS_COL_ID,
      ID.unique(),
      {
        aircraft_id: payload.aircraftId,
        week_start: payload.weekStart,
        week_end: payload.weekEnd,
        created_by: payload.createdBy,
        is_open_for_requests: payload.isOpenForRequests ?? false,
        schedule_closed_at: null,
        daily_caps_json,
        group_caps_json,
        slots_json,
      },
      weekDocPerms(),
    ) as unknown as Record<string, unknown>;
  }

  const week = toWeek(weekDoc);
  return {
    week,
    dailyCaps: parseDailyCaps(week.daily_caps_json),
    groupCaps: parseGroupCaps(week.group_caps_json, week.id),
    slots: parseSlots(week.slots_json, week.id),
  };
}

export async function updateWeekOpenStatus(weekId: string, isOpen: boolean): Promise<void> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }
  await databases.updateDocument(DB_ID, OP_WEEKS_COL_ID, weekId, {
    is_open_for_requests: isOpen,
  });
}

export async function closeScheduleWeek(weekStart: string): Promise<{ closedAt: string; updated: number }> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) {
    throw new Error("Appwrite não configurado");
  }

  const docs = await databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
    Query.equal("week_start", [weekStart]),
    Query.limit(200),
  ]);
  const closedAt = new Date().toISOString();

  for (const doc of docs.documents) {
    await databases.updateDocument(DB_ID, OP_WEEKS_COL_ID, doc.$id, {
      is_open_for_requests: false,
      schedule_closed_at: closedAt,
    });
  }

  return { closedAt, updated: docs.documents.length };
}
