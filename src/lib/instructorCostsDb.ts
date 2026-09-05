import { Query } from "appwrite";
import { databases, ID, INSTRUCTOR_COSTS_COL_ID, isAppwriteConfigured, Permission, Role, DEFAULT_SCHOOL_ID } from "./appwrite";
import type { InstructorCosts, InstructorModelCost } from "../types/costs";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && INSTRUCTOR_COSTS_COL_ID);
}

function parseModelCosts(raw: string | null | undefined): InstructorModelCost[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        modelId: String(obj.modelId ?? ""),
        modelName: String(obj.modelName ?? ""),
        hourlyDayRate: Number(obj.hourlyDayRate ?? 0),
        hourlyNightRate: Number(obj.hourlyNightRate ?? 0),
        fixedDayRate: Number(obj.fixedDayRate ?? 0),
        fixedNightRate: Number(obj.fixedNightRate ?? 0),
        groundSchoolRate: Number(obj.groundSchoolRate ?? 0),
      };
    });
  } catch {
    return [];
  }
}

function toDoc(doc: Record<string, unknown>): InstructorCosts {
  return {
    id: doc.$id as string,
    instructorUserId: (doc.instructor_user_id as string) ?? "",
    monthlyFixedCost: Number(doc.monthly_fixed_cost ?? 0),
    cancellationPenaltySharePct: Number(doc.cancellation_penalty_share_pct ?? 50),
    modelCosts: parseModelCosts(doc.model_costs_json as string | null),
    updatedAt: (doc.updated_at as string | null) ?? null,
    updatedBy: (doc.updated_by as string | null) ?? null,
  };
}

export async function getInstructorCosts(instructorUserId: string): Promise<InstructorCosts | null> {
  if (!isReady() || !databases) return null;
  try {
    const res = await databases.listDocuments(DB_ID, INSTRUCTOR_COSTS_COL_ID!, [
      Query.equal("instructor_user_id", [instructorUserId]),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    return doc ? toDoc(doc as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function listInstructorCosts(instructorUserIds: string[]): Promise<InstructorCosts[]> {
  if (!isReady() || !databases || !DB_ID || !INSTRUCTOR_COSTS_COL_ID) return [];
  const ids = Array.from(new Set(instructorUserIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return [];

  const rows: InstructorCosts[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const res = await databases.listDocuments(DB_ID, INSTRUCTOR_COSTS_COL_ID, [
        Query.equal("instructor_user_id", ids.slice(i, i + 50)),
        Query.limit(100),
      ]);
      rows.push(...res.documents.map((doc) => toDoc(doc as unknown as Record<string, unknown>)));
    } catch {
      // Keep the report usable even if a legacy permission row is not readable.
    }
  }
  return rows;
}

export async function saveInstructorCosts(
  instructorUserId: string,
  data: { monthlyFixedCost: number; cancellationPenaltySharePct?: number; modelCosts: InstructorModelCost[] },
  actorUserId: string,
): Promise<InstructorCosts> {
  if (!isReady() || !databases || !INSTRUCTOR_COSTS_COL_ID) throw new Error("Appwrite não configurado");
  const now = new Date().toISOString();
  const payload = {
    instructor_user_id: instructorUserId,
    school_id: DEFAULT_SCHOOL_ID,
    monthly_fixed_cost: data.monthlyFixedCost,
    cancellation_penalty_share_pct: Number.isFinite(Number(data.cancellationPenaltySharePct))
      ? Math.max(0, Math.min(100, Number(data.cancellationPenaltySharePct)))
      : 50,
    model_costs_json: JSON.stringify(data.modelCosts),
    updated_at: now,
    updated_by: actorUserId,
  };
  const legacyPayload = {
    ...payload,
    cancellation_penalty_share_pct: undefined,
  };
  delete legacyPayload.cancellation_penalty_share_pct;
  const existing = await getInstructorCosts(instructorUserId);
  // Client sessions can only assign ACL targets allowed by the authenticated user context.
  // In admin UI, assigning Role.user(otherUserId) is rejected by Appwrite (401 user_unauthorized).
  // We keep admin full control and grant read access to authenticated users so instructors can
  // read their own row through query filter (instructor_user_id) during payment snapshot flow.
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.read(Role.users()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  let doc: Record<string, unknown>;
  try {
    if (existing) {
      doc = (await databases.updateDocument(DB_ID, INSTRUCTOR_COSTS_COL_ID, existing.id, payload, permissions)) as unknown as Record<string, unknown>;
    } else {
      doc = (await databases.createDocument(DB_ID, INSTRUCTOR_COSTS_COL_ID, ID.unique(), payload, permissions)) as unknown as Record<string, unknown>;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unknown attribute|invalid document structure|attribute.*not/i.test(message)) throw error;
    if (existing) {
      doc = (await databases.updateDocument(DB_ID, INSTRUCTOR_COSTS_COL_ID, existing.id, legacyPayload, permissions)) as unknown as Record<string, unknown>;
    } else {
      doc = (await databases.createDocument(DB_ID, INSTRUCTOR_COSTS_COL_ID, ID.unique(), legacyPayload, permissions)) as unknown as Record<string, unknown>;
    }
  }
  return toDoc({
    ...doc,
    cancellation_penalty_share_pct: (doc as Record<string, unknown>).cancellation_penalty_share_pct ?? payload.cancellation_penalty_share_pct,
    $id: (doc as { $id: string }).$id ?? existing?.id,
  });
}
