import { Permission, Query, Role } from "appwrite";
import { databases, ID, INSTRUCTOR_PREFS_COL_ID, isAppwriteConfigured, DEFAULT_SCHOOL_ID } from "./appwrite";


import type { InstructorIdentity, InstructorPreferenceLevel, SchedulePeriod } from "../types/schedule";
import type { AvailabilityType } from "../types/planning";
import type { FuelingResponsibleOption, FuelingStudentOption } from "../types/fueling";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;

export type UserRole = "admin" | "instrutor" | "aluno";
export type AnacSyncStatus = "pending" | "success" | "error";
export type PilotRating = { habilitacao: string; validade: string };
export type PilotLicense = { licenca: string; expedicao: string };
export type PilotMedical = {
  classe: string;
  validade: string;
  orgao_expedidor: string;
  observacoes: string;
};
export type PilotProfile = {
  docId: string;
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  weightKg: number | null;
  heightCm: number | null;
  anacCode: string;
  anacRatings: PilotRating[];
  anacLicenses: PilotLicense[];
  anacMedical: PilotMedical;
  anacPhotoFileId: string;
  anacSyncStatus: AnacSyncStatus;
  anacSyncError: string;
  anacLastSyncAt: string;
  instructorAvailability: InstructorIdentity["defaultAvailability"];
};

export type PilotProfileSummary = Pick<PilotProfile, "fullName" | "anacCode">;

export type StudentOption = {
  userId: string;
  email: string;
};

export type ScheduleStudentIdentity = {
  userId: string;
  label: string;
  email: string | null;
  anacCode: string | null;
  weightKg: number | null;
  heightCm: number | null;
};

type ProfileDoc = {
  user_id?: string;
  role?: string;
  email?: string;
  full_name?: string;
  cpf?: string;
  phone?: string;
  birth_date?: string;
  weight_kg?: number;
  height_cm?: number;
  anac_code?: string;
  anac_ratings_json?: string;
  anac_licenses_json?: string;
  anac_medical_json?: string;
  anac_photo_file_id?: string;
  anac_sync_status?: string;
  anac_sync_error?: string;
  anac_last_sync_at?: string;
};

type InstructorPreferenceDoc = {
  user_id?: string;
  preference_level?: string;
  availability_json?: string;
};

export type EnsureProfileUpdates = Partial<{
  full_name: string;
  cpf: string;
  phone: string;
  birth_date: string;
  weight_kg: number;
  height_cm: number;
  anac_code: string;
  anac_ratings_json: string;
  anac_licenses_json: string;
  anac_medical_json: string;
  anac_photo_file_id: string;
  anac_sync_status: AnacSyncStatus;
  anac_sync_error: string;
  anac_last_sync_at: string;
  instructor_availability_json: string;
  instructor_preference_level: InstructorPreferenceLevel;
}>;

function normalizeInstructorPreference(value: string | null | undefined): InstructorPreferenceLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function parseInstructorAvailability(value: unknown): InstructorIdentity["defaultAvailability"] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as Array<{
      dayOfWeek?: number;
      period?: string;
      availabilityType?: string;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => {
        const type = row.availabilityType;
        return (
          typeof row.dayOfWeek === "number" &&
          (row.period === "morning" || row.period === "afternoon" || row.period === "night") &&
          (type === "available" || type === "preferred")
        );
      })
      .map((row) => ({
        dayOfWeek: row.dayOfWeek!,
        period: row.period as SchedulePeriod,
        availabilityType: row.availabilityType as AvailabilityType,
      }));
  } catch {
    return [];
  }
}

function parseJsonList<T>(value: unknown): T[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function toStudentOption(doc: ProfileDoc): StudentOption | null {
  const userId = doc.user_id ?? "";
  const email = doc.email ?? "";
  if (!userId || !email) return null;
  return { userId, email };
}

function toInstructorIdentity(doc: ProfileDoc): InstructorIdentity | null {
  const userId = doc.user_id ?? "";
  if (!userId) return null;
  const label = doc.full_name?.trim() || doc.email || userId;
  return {
    userId,
    label,
    anacCode: doc.anac_code || null,
    weightKg: typeof doc.weight_kg === "number" ? doc.weight_kg : null,
    heightCm: typeof doc.height_cm === "number" ? doc.height_cm : null,
    defaultPreferenceLevel: "medium",
    defaultAvailability: [],
  };
}

function withInstructorPreference(
  instructor: InstructorIdentity,
  preference: InstructorPreferenceDoc | undefined,
): InstructorIdentity {
  return {
    ...instructor,
    defaultPreferenceLevel: normalizeInstructorPreference(preference?.preference_level),
    defaultAvailability: parseInstructorAvailability(preference?.availability_json),
  };
}

async function getInstructorPreference(userId: string): Promise<InstructorPreferenceDoc | undefined> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !INSTRUCTOR_PREFS_COL_ID) return undefined;
  const res = await databases.listDocuments(DB_ID, INSTRUCTOR_PREFS_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.equal("user_id", [userId]),
    Query.limit(1),
  ]);
  return res.documents[0] as InstructorPreferenceDoc | undefined;
}

function hasRbacCollections(): boolean {
  return Boolean(DB_ID && PROFILES_COL_ID);
}

export function isUserRole(value: string | null | undefined): value is UserRole {
  return value === "admin" || value === "instrutor" || value === "aluno";
}

export function normalizeUserRole(value: string | null | undefined): UserRole {
  return isUserRole(value) ? value : "aluno";
}

export function deriveRoleFromLabels(labels: string[] | undefined): UserRole {
  const normalized = new Set((labels ?? []).map((label) => String(label).toLowerCase()));
  if (normalized.has("admin")) return "admin";
  if (normalized.has("instrutor")) return "instrutor";
  return "aluno";
}

export async function getUserRole(userId: string): Promise<UserRole> {
  if (!isAppwriteConfigured || !databases || !hasRbacCollections() || !DB_ID || !PROFILES_COL_ID) {
    return "aluno";
  }

  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = (res.documents[0] ?? {}) as ProfileDoc;
    return normalizeUserRole(doc.role);
  } catch {
    return "aluno";
  }
}

export async function getProfile(userId: string): Promise<{ data: PilotProfile | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { data: null, error: null };
  }
  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = (res.documents[0] ?? null) as (ProfileDoc & { $id: string }) | null;
    if (!doc) return { data: null, error: null };

    const defaultMedical: PilotMedical = {
      classe: "",
      validade: "",
      orgao_expedidor: "",
      observacoes: "",
    };
    const role = normalizeUserRole(doc.role);
    const instructorPreference = role === "instrutor" ? await getInstructorPreference(doc.user_id ?? userId) : undefined;

    return {
      data: {
        docId: doc.$id,
        userId: doc.user_id ?? userId,
        email: doc.email ?? "",
        role,
        fullName: doc.full_name ?? "",
        cpf: doc.cpf ?? "",
        phone: doc.phone ?? "",
        birthDate: doc.birth_date ?? "",
        weightKg: typeof doc.weight_kg === "number" ? doc.weight_kg : null,
        heightCm: typeof doc.height_cm === "number" ? doc.height_cm : null,
        anacCode: doc.anac_code ?? "",
        anacRatings: parseJsonList<PilotRating>(doc.anac_ratings_json),
        anacLicenses: parseJsonList<PilotLicense>(doc.anac_licenses_json),
        anacMedical: parseJsonObject<PilotMedical>(doc.anac_medical_json, defaultMedical),
        anacPhotoFileId: doc.anac_photo_file_id ?? "",
        anacSyncStatus:
          doc.anac_sync_status === "success" || doc.anac_sync_status === "error" ? doc.anac_sync_status : "pending",
        anacSyncError: doc.anac_sync_error ?? "",
        anacLastSyncAt: doc.anac_last_sync_at ?? "",
        instructorAvailability: parseInstructorAvailability(instructorPreference?.availability_json),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function listProfileSummariesByUserIds(
  userIds: string[],
): Promise<Record<string, PilotProfileSummary>> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return {};

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const out: Record<string, PilotProfileSummary> = {};
  const chunkSize = 25;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", chunk),
      Query.limit(chunk.length),
    ]);
    for (const doc of res.documents) {
      const userId = (doc.user_id as string | undefined) ?? "";
      if (!userId) continue;
      out[userId] = {
        fullName: (doc.full_name as string | undefined) ?? "",
        anacCode: (doc.anac_code as string | undefined) ?? "",
      };
    }
  }

  return out;
}

export async function ensureProfile(
  userId: string,
  email: string,
  role: UserRole = "aluno",
  updates: EnsureProfileUpdates = {},
): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { error: null };
  }

  try {
    const existing = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);

    if (existing.total > 0 && existing.documents[0]) {
      const currentRole = normalizeUserRole((existing.documents[0].role as string | undefined) ?? null);
      await databases.updateDocument(DB_ID, PROFILES_COL_ID, existing.documents[0].$id, {
        email,
        role: currentRole || role,
        school_id: DEFAULT_SCHOOL_ID,
        ...updates,
      });
      return { error: null };
    }

    await databases.createDocument(
      DB_ID,
      PROFILES_COL_ID,
      ID.unique(),
      { user_id: userId, email, role, school_id: DEFAULT_SCHOOL_ID, ...updates },
      [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
        Permission.read(Role.label("admin")),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
        Permission.read(Role.label("instrutor")),
      ],
    );
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

async function listStudentsFromProfiles(actorUserId: string): Promise<StudentOption[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.limit(200),
  ]);

  const students = res.documents
    .filter((doc) => {
      const userId = (doc.user_id as string | undefined) ?? "";
      const role = normalizeUserRole((doc.role as string | undefined) ?? null);
      if (!userId || userId === actorUserId) return false;
      return role !== "admin" && role !== "instrutor";
    })
    .map((doc) =>
      toStudentOption({
        user_id: (doc.user_id as string | undefined) ?? "",
        email: (doc.email as string | undefined) ?? "",
      }),
    )
    .filter((doc): doc is StudentOption => Boolean(doc));

  return students.sort((a, b) => a.email.localeCompare(b.email, "pt-BR"));
}

export async function listAssignableStudents(actorUserId: string, actorRole: UserRole): Promise<StudentOption[]> {
  if (!isAppwriteConfigured || !databases || !hasRbacCollections() || !DB_ID || !PROFILES_COL_ID) {
    return [];
  }

  if (actorRole === "admin" || actorRole === "instrutor") {
    return listStudentsFromProfiles(actorUserId);
  }

  return [];
}

/** Uma query em perfis — evita N× getProfile na escala. */
export async function listStudentIdentitiesForSchedule(actorUserId: string): Promise<ScheduleStudentIdentity[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return [];

  const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.limit(200),
  ]);

  return res.documents
    .filter((doc) => {
      const userId = (doc.user_id as string | undefined) ?? "";
      const role = normalizeUserRole((doc.role as string | undefined) ?? null);
      if (!userId || userId === actorUserId) return false;
      return role !== "admin" && role !== "instrutor";
    })
    .map((doc) => {
      const userId = (doc.user_id as string | undefined) ?? "";
      const email = (doc.email as string | undefined) ?? "";
      const fullName = ((doc.full_name as string | undefined) ?? "").trim();
      return {
        userId,
        label: fullName || email || userId,
        email: email || null,
        anacCode: (doc.anac_code as string | undefined) || null,
        weightKg: typeof doc.weight_kg === "number" ? doc.weight_kg : null,
        heightCm: typeof doc.height_cm === "number" ? doc.height_cm : null,
      };
    })
    .filter((row) => row.userId.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function listFuelingStudents(actorUserId: string, actorRole: UserRole): Promise<FuelingStudentOption[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return [];
  if (actorRole !== "admin" && actorRole !== "instrutor") return [];

  const students = await listStudentIdentitiesForSchedule(actorUserId);
  return students.map((student) => ({
    userId: student.userId,
    label: student.label,
    email: student.email,
  }));
}

export async function listFuelingResponsibleUsers(actorRole: UserRole): Promise<FuelingResponsibleOption[]> {
  if (!isAppwriteConfigured || !databases || !hasRbacCollections() || !DB_ID || !PROFILES_COL_ID) {
    return [];
  }
  if (actorRole !== "admin" && actorRole !== "instrutor") return [];

  const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.limit(200),
  ]);

  return res.documents
    .map((doc) => {
      const role = normalizeUserRole((doc.role as string | undefined) ?? null);
      if (role !== "admin" && role !== "instrutor") return null;
      const userId = (doc.user_id as string | undefined) ?? "";
      if (!userId) return null;
      const email = (doc.email as string | undefined) ?? "";
      const fullName = ((doc.full_name as string | undefined) ?? "").trim();
      return {
        userId,
        email,
        role,
        label: fullName || email || userId,
      } satisfies FuelingResponsibleOption;
    })
    .filter((item): item is FuelingResponsibleOption => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function listAssignableInstructors(actorRole: UserRole): Promise<InstructorIdentity[]> {
  if (!isAppwriteConfigured || !databases || !hasRbacCollections() || !DB_ID || !PROFILES_COL_ID) {
    return [];
  }

  if (actorRole !== "admin" && actorRole !== "instrutor") return [];

  const [profilesRes, preferencesRes] = await Promise.all([
    databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.limit(200),
    ]),
    INSTRUCTOR_PREFS_COL_ID
      ? databases.listDocuments(DB_ID, INSTRUCTOR_PREFS_COL_ID, [
          Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
          Query.limit(200),
        ])
      : Promise.resolve({ documents: [] }),
  ]);
  const preferenceByUserId = new Map(
    (preferencesRes.documents as unknown as InstructorPreferenceDoc[]).map((doc) => [doc.user_id ?? "", doc]),
  );
  return profilesRes.documents
    .filter((doc) => normalizeUserRole((doc.role as string | undefined) ?? null) === "instrutor")
    .map((doc) =>
      toInstructorIdentity({
        user_id: (doc.user_id as string | undefined) ?? "",
        email: (doc.email as string | undefined) ?? "",
        full_name: (doc.full_name as string | undefined) ?? "",
        weight_kg: doc.weight_kg as number | undefined,
        height_cm: doc.height_cm as number | undefined,
        anac_code: (doc.anac_code as string | undefined) ?? "",
      }),
    )
    .filter((doc): doc is InstructorIdentity => Boolean(doc))
    .map((instructor) => withInstructorPreference(instructor, preferenceByUserId.get(instructor.userId)))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
