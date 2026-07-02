import { Query } from "appwrite";
import { resolveProfileDocumentPermissions } from "./appwriteClientPermissions";
import { ensureDefaultStudentTrainingTrack } from "./trainingTracksDb";
import {
  BUCKET_ID,
  databases,
  ID,
  INSTRUCTOR_PREFS_COL_ID,
  isAppwriteConfigured,
  DEFAULT_SCHOOL_ID,
  Permission,
  PROFILE_DOCUMENTS_COL_ID,
  Role,
  storage,
} from "./appwrite";


import type { InstructorIdentity, InstructorPreferenceLevel, SchedulePeriod } from "../types/schedule";
import type { AvailabilityType } from "../types/planning";
import type { FuelingResponsibleOption, FuelingStudentOption } from "../types/fueling";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;

export type UserRole = "admin" | "instrutor" | "aluno";
export type RoleCustomSlugs = Partial<Record<UserRole, string>>;

export const ROLE_DISPLAY_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  instrutor: "Instrutor",
  aluno: "Aluno",
};

const ROLE_PRIORITY: UserRole[] = ["admin", "instrutor", "aluno"];
export type AnacSyncStatus = "pending" | "success" | "error";
export type ApprovalStatus = "pending" | "approved";
export type PilotRating = { habilitacao: string; validade: string };
export type PilotLicense = { licenca: string; expedicao: string };
export type PilotMedical = {
  classe: string;
  validade: string;
  orgao_expedidor: string;
  observacoes: string;
};
export type ProfileDocumentType =
  | "identification"
  | "voterTitle"
  | "proofOfResidence"
  | "militaryCertificate"
  | "enrollmentForm"
  | "schoolCertificate"
  | "transferDocument";
export type ProfileDocumentAttachment = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};
export type ProfileDocumentAttachments = Partial<Record<ProfileDocumentType, ProfileDocumentAttachment>>;
export type PilotProfile = {
  docId: string;
  userId: string;
  isActive: boolean;
  email: string;
  role: UserRole;
  fullName: string;
  cpf: string;
  rg: string;
  rgOrgaoExpedidor: string;
  phone: string;
  birthDate: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
  nacionalidade: string;
  estadoCivil: string;
  sexo: string;
  naturalidade: string;
  filiacaoPai: string;
  filiacaoMae: string;
  rgDataEmissao: string;
  escolaridade: string;
  escolaridadePeriodo: string;
  escolaridadeCurso: string;
  alergiasMedicamentos: string;
  emergenciaNome: string;
  emergenciaParentesco: string;
  emergenciaEndereco: string;
  emergenciaTelefone: string;
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
  documents: ProfileDocumentAttachments;
  instructorAvailability: InstructorIdentity["defaultAvailability"];
  approvalStatus: ApprovalStatus;
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
  is_active?: boolean;
  role?: string;
  roles?: string[];
  active_role?: string;
  assigned_role_slugs?: string[];
  active_role_slug?: string;
  role_custom_slugs_json?: string;
  custom_role_slug?: string;
  email?: string;
  full_name?: string;
  cpf?: string;
  rg?: string;
  rg_orgao_expedidor?: string;
  phone?: string;
  birth_date?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  nacionalidade?: string;
  estado_civil?: string;
  sexo?: string;
  naturalidade?: string;
  filiacao_pai?: string;
  filiacao_mae?: string;
  rg_data_emissao?: string;
  escolaridade?: string;
  escolaridade_periodo?: string;
  escolaridade_curso?: string;
  alergias_medicamentos?: string;
  emergencia_nome?: string;
  emergencia_parentesco?: string;
  emergencia_endereco?: string;
  emergencia_telefone?: string;
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
  documents_json?: string;
  approval_status?: string;
};

type InstructorPreferenceDoc = {
  user_id?: string;
  preference_level?: string;
  availability_json?: string;
};

type ProfileDocumentDoc = {
  $id: string;
  user_id?: string;
  document_type?: string;
  file_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  uploaded_at?: string;
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
  // Dados pessoais adicionais
  rg: string;
  rg_orgao_expedidor: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
  nacionalidade: string;
  estado_civil: string;
  sexo: string;
  naturalidade: string;
  filiacao_pai: string;
  filiacao_mae: string;
  rg_data_emissao: string;
  escolaridade: string;
  escolaridade_periodo: string;
  escolaridade_curso: string;
  alergias_medicamentos: string;
  emergencia_nome: string;
  emergencia_parentesco: string;
  emergencia_endereco: string;
  emergencia_telefone: string;
  referrer_user_id: string;
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

function parseProfileDocuments(value: unknown): ProfileDocumentAttachments {
  const parsed = parseJsonObject<ProfileDocumentAttachments>(value, {});
  const documents: ProfileDocumentAttachments = {};
  for (const key of ["identification", "voterTitle", "proofOfResidence", "militaryCertificate", "enrollmentForm", "schoolCertificate", "transferDocument"] as const) {
    const item = parsed[key];
    if (!item?.fileId) continue;
    documents[key] = {
      fileId: String(item.fileId),
      fileName: String(item.fileName || "Documento"),
      mimeType: String(item.mimeType || "application/octet-stream"),
      size: Number(item.size || 0),
      uploadedAt: String(item.uploadedAt || ""),
    };
  }
  return documents;
}

function toProfileDocuments(docs: ProfileDocumentDoc[]): ProfileDocumentAttachments {
  const documents: ProfileDocumentAttachments = {};
  for (const doc of docs) {
    const type = doc.document_type as ProfileDocumentType | undefined;
    if (
      type !== "identification" &&
      type !== "voterTitle" &&
      type !== "proofOfResidence" &&
      type !== "militaryCertificate" &&
      type !== "enrollmentForm" &&
      type !== "schoolCertificate" &&
      type !== "transferDocument"
    ) {
      continue;
    }
    if (!doc.file_id) continue;
    documents[type] = {
      fileId: doc.file_id,
      fileName: doc.file_name || "Documento",
      mimeType: doc.mime_type || "application/octet-stream",
      size: typeof doc.file_size === "number" ? doc.file_size : 0,
      uploadedAt: doc.uploaded_at || "",
    };
  }
  return documents;
}

async function listProfileDocumentDocs(userId: string): Promise<ProfileDocumentDoc[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILE_DOCUMENTS_COL_ID) return [];
  try {
    const res = await databases.listDocuments(DB_ID, PROFILE_DOCUMENTS_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(25),
    ]);
    return res.documents as unknown as ProfileDocumentDoc[];
  } catch {
    return [];
  }
}

async function getProfileDocumentDoc(userId: string, type: ProfileDocumentType): Promise<ProfileDocumentDoc | null> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILE_DOCUMENTS_COL_ID) return null;
  const res = await databases.listDocuments(DB_ID, PROFILE_DOCUMENTS_COL_ID, [
    Query.equal("user_id", [userId]),
    Query.equal("document_type", [type]),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as ProfileDocumentDoc | undefined) ?? null;
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

export function normalizeUserRoles(value: unknown, fallback?: UserRole): UserRole[] {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeUserRole(String(item)))
      .filter((role, index, arr) => arr.indexOf(role) === index);
    if (roles.length > 0) return roles;
  }
  if (typeof value === "string" && value.trim()) {
    return [normalizeUserRole(value)];
  }
  return [fallback ?? "aluno"];
}

export function pickDefaultActiveRole(roles: UserRole[]): UserRole {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? "aluno";
}

export function getEffectiveRole(profile: { active_role?: string; role?: string } | null | undefined): UserRole {
  return normalizeUserRole(profile?.active_role || profile?.role);
}

export function parseRoleCustomSlugsJson(value: unknown): RoleCustomSlugs {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const result: RoleCustomSlugs = {};
    for (const role of ROLE_PRIORITY) {
      const slug = parsed[role];
      if (typeof slug === "string" && slug.trim()) result[role] = slug.trim();
    }
    return result;
  } catch {
    return {};
  }
}

export function parseAssignedRoleSlugs(
  profile: ProfileDoc | null | undefined,
): string[] {
  if (profile?.assigned_role_slugs?.length) {
    return [...new Set(profile.assigned_role_slugs.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (profile?.roles?.length) {
    const slugs = profile.roles.map((item) => String(item).trim()).filter(Boolean);
    if (slugs.length > 0) return [...new Set(slugs)];
  }
  const { roles } = resolveProfileRoles(profile);
  const roleCustomSlugs = parseRoleCustomSlugsJson(profile?.role_custom_slugs_json);
  return roles.map((portal) => roleCustomSlugs[portal] || portal);
}

export function parseActiveRoleSlug(profile: ProfileDoc | null | undefined, assignedSlugs: string[]): string {
  const explicit = profile?.active_role_slug?.trim();
  if (explicit && assignedSlugs.includes(explicit)) return explicit;
  const activePortal = getEffectiveRole(profile);
  const roleCustomSlugs = parseRoleCustomSlugsJson(profile?.role_custom_slugs_json);
  const mapped = roleCustomSlugs[activePortal];
  if (mapped && assignedSlugs.includes(mapped)) return mapped;
  if (assignedSlugs.includes(activePortal)) return activePortal;
  return assignedSlugs.find((slug) => slug === "admin")
    ?? assignedSlugs.find((slug) => slug === "instrutor")
    ?? assignedSlugs[0]
    ?? "aluno";
}

export function resolveProfileRoles(
  profile: ProfileDoc | null | undefined,
): { roles: UserRole[]; activeRole: UserRole } {
  const legacyRole = normalizeUserRole(profile?.role);
  const roles = profile?.roles?.length ? normalizeUserRoles(profile.roles, legacyRole) : [legacyRole];
  const activeCandidate = getEffectiveRole(profile);
  const activeRole = roles.includes(activeCandidate) ? activeCandidate : pickDefaultActiveRole(roles);
  return { roles, activeRole };
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
    return resolveProfileRoles(doc).activeRole;
  } catch {
    return "aluno";
  }
}

/** Retorna roles, role ativo e custom_role_slug do perfil em uma única query */
export async function getUserRoleInfo(userId: string): Promise<{
  role: UserRole;
  roles: string[];
  activeRole: UserRole;
  assignedRoleSlugs: string[];
  activeRoleSlug: string;
  customRoleSlug: string | null;
  roleCustomSlugs: RoleCustomSlugs;
}> {
  if (!isAppwriteConfigured || !databases || !hasRbacCollections() || !DB_ID || !PROFILES_COL_ID) {
    return {
      role: "aluno",
      roles: ["aluno"],
      activeRole: "aluno",
      assignedRoleSlugs: ["aluno"],
      activeRoleSlug: "aluno",
      customRoleSlug: null,
      roleCustomSlugs: {},
    };
  }

  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = (res.documents[0] ?? {}) as ProfileDoc;
    const assignedRoleSlugs = parseAssignedRoleSlugs(doc);
    const activeRoleSlug = parseActiveRoleSlug(doc, assignedRoleSlugs);
    const activeRole = getEffectiveRole(doc);
    const roleCustomSlugs = parseRoleCustomSlugsJson(doc.role_custom_slugs_json);
    const customRoleSlug = activeRoleSlug === "admin" && activeRole === "admin"
      ? null
      : doc.custom_role_slug ?? roleCustomSlugs[activeRole] ?? (activeRoleSlug !== activeRole ? activeRoleSlug : null);
    return {
      role: activeRole,
      roles: assignedRoleSlugs,
      activeRole,
      assignedRoleSlugs,
      activeRoleSlug,
      customRoleSlug,
      roleCustomSlugs,
    };
  } catch {
    return {
      role: "aluno",
      roles: ["aluno"],
      activeRole: "aluno",
      assignedRoleSlugs: ["aluno"],
      activeRoleSlug: "aluno",
      customRoleSlug: null,
      roleCustomSlugs: {},
    };
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
    const documentDocs = await listProfileDocumentDocs(doc.user_id ?? userId);

    return {
      data: {
        docId: doc.$id,
        userId: doc.user_id ?? userId,
        isActive: doc.is_active !== false,
        email: doc.email ?? "",
        role,
        fullName: doc.full_name ?? "",
        cpf: doc.cpf ?? "",
        rg: doc.rg ?? "",
        rgOrgaoExpedidor: doc.rg_orgao_expedidor ?? "",
        phone: doc.phone ?? "",
        birthDate: doc.birth_date ?? "",
        endereco: doc.endereco ?? "",
        cep: doc.cep ?? "",
        cidade: doc.cidade ?? "",
        uf: doc.uf ?? "",
        nacionalidade: doc.nacionalidade ?? "",
        estadoCivil: doc.estado_civil ?? "",
        sexo: doc.sexo ?? "",
        naturalidade: doc.naturalidade ?? "",
        filiacaoPai: doc.filiacao_pai ?? "",
        filiacaoMae: doc.filiacao_mae ?? "",
        rgDataEmissao: doc.rg_data_emissao ?? "",
        escolaridade: doc.escolaridade ?? "",
        escolaridadePeriodo: doc.escolaridade_periodo ?? "",
        escolaridadeCurso: doc.escolaridade_curso ?? "",
        alergiasMedicamentos: doc.alergias_medicamentos ?? "",
        emergenciaNome: doc.emergencia_nome ?? "",
        emergenciaParentesco: doc.emergencia_parentesco ?? "",
        emergenciaEndereco: doc.emergencia_endereco ?? "",
        emergenciaTelefone: doc.emergencia_telefone ?? "",
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
        documents: documentDocs.length > 0 ? toProfileDocuments(documentDocs) : parseProfileDocuments(doc.documents_json),
        approvalStatus: doc.approval_status === "approved" ? "approved" : "pending",
        instructorAvailability: parseInstructorAvailability(instructorPreference?.availability_json),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateProfileFields(
  userId: string,
  updates: EnsureProfileUpdates & Partial<{ email: string; role: UserRole }>,
): Promise<{ data: PilotProfile | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { data: null, error: new Error("Appwrite nao configurado.") };
  }

  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as (ProfileDoc & { $id: string }) | undefined;
    if (!doc) return { data: null, error: new Error("Perfil nao encontrado.") };
    await databases.updateDocument(DB_ID, PROFILES_COL_ID, doc.$id, {
      school_id: DEFAULT_SCHOOL_ID,
      ...updates,
    });
    return getProfile(userId);
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

function profileDocumentPermissions(userId: string): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.read(Role.users()),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

export function getProfileDocumentUrl(fileId: string, mode: "view" | "download" = "download"): string {
  if (!storage || !BUCKET_ID || !fileId) return "";
  const url = mode === "view" ? storage.getFileView(BUCKET_ID, fileId) : storage.getFileDownload(BUCKET_ID, fileId);
  return url.toString();
}

export async function uploadProfileDocumentAttachment(
  profile: Pick<PilotProfile, "docId" | "userId" | "documents">,
  type: ProfileDocumentType,
  file: File,
): Promise<{ data: ProfileDocumentAttachments | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !storage || !DB_ID || !PROFILE_DOCUMENTS_COL_ID || !BUCKET_ID) {
    return { data: null, error: new Error("Appwrite Storage nao configurado.") };
  }

  let uploadedFileId = "";
  try {
    const previousFileId = profile.documents[type]?.fileId;
    const existingDoc = await getProfileDocumentDoc(profile.userId, type);
    const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, profileDocumentPermissions(profile.userId));
    uploadedFileId = uploaded.$id;
    const nextDocuments: ProfileDocumentAttachments = {
      ...profile.documents,
      [type]: {
        fileId: uploaded.$id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        uploadedAt: new Date().toISOString(),
      },
    };

    const payload = {
      school_id: DEFAULT_SCHOOL_ID,
      user_id: profile.userId,
      document_type: type,
      file_id: uploaded.$id,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
    };

    if (existingDoc) {
      await databases.updateDocument(DB_ID, PROFILE_DOCUMENTS_COL_ID, existingDoc.$id, payload);
    } else {
      await databases.createDocument(
        DB_ID,
        PROFILE_DOCUMENTS_COL_ID,
        ID.unique(),
        payload,
        profileDocumentPermissions(profile.userId),
      );
    }

    if (previousFileId && previousFileId !== uploaded.$id) {
      await storage.deleteFile(BUCKET_ID, previousFileId).catch(() => undefined);
    }

    return { data: nextDocuments, error: null };
  } catch (error) {
    if (uploadedFileId) {
      await storage.deleteFile(BUCKET_ID, uploadedFileId).catch(() => undefined);
    }
    return { data: null, error: error as Error };
  }
}

export async function deleteProfileDocumentAttachment(
  profile: Pick<PilotProfile, "userId" | "documents">,
  type: ProfileDocumentType,
): Promise<{ data: ProfileDocumentAttachments | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !storage || !DB_ID || !PROFILE_DOCUMENTS_COL_ID || !BUCKET_ID) {
    return { data: null, error: new Error("Appwrite Storage nao configurado.") };
  }

  try {
    const fileId = profile.documents[type]?.fileId;
    const existingDoc = await getProfileDocumentDoc(profile.userId, type);
    const nextDocuments: ProfileDocumentAttachments = { ...profile.documents };
    delete nextDocuments[type];

    if (existingDoc) {
      await databases.deleteDocument(DB_ID, PROFILE_DOCUMENTS_COL_ID, existingDoc.$id);
    }

    if (fileId) {
      await storage.deleteFile(BUCKET_ID, fileId).catch(() => undefined);
    }

    return { data: nextDocuments, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function getApprovalStatus(userId: string): Promise<ApprovalStatus> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return "pending";
  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = (res.documents[0] ?? null) as (ProfileDoc & { $id: string }) | null;
    if (!doc) return "pending";
    return doc.approval_status === "approved" ? "approved" : "pending";
  } catch {
    return "pending";
  }
}

export async function approveStudentAccess(userId: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { error: new Error("Appwrite não configurado.") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as (ProfileDoc & { $id: string }) | undefined;
    if (!doc) return { error: new Error("Perfil não encontrado.") };
    await databases.updateDocument(DB_ID, PROFILES_COL_ID, doc.$id, { approval_status: "approved" });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function ensureProfile(
  userId: string,
  email: string,
  role: UserRole = "aluno",
  updates: EnsureProfileUpdates = {},
): Promise<{ error: Error | null; trackError: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { error: null, trackError: null };
  }

  let trackError: Error | null = null;

  try {
    const existing = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);

    const effectiveRole = existing.total > 0 && existing.documents[0]
      ? resolveProfileRoles(existing.documents[0] as ProfileDoc).activeRole
      : role;

    if (existing.total > 0 && existing.documents[0]) {
      const doc = existing.documents[0] as ProfileDoc;
      const assignedRoleSlugs = parseAssignedRoleSlugs(doc);
      const activeRoleSlug = parseActiveRoleSlug(doc, assignedRoleSlugs);
      const activeRole = getEffectiveRole(doc);
      await databases.updateDocument(DB_ID, PROFILES_COL_ID, existing.documents[0].$id, {
        email,
        role: activeRole,
        active_role: activeRole,
        roles: assignedRoleSlugs,
        assigned_role_slugs: assignedRoleSlugs,
        active_role_slug: activeRoleSlug,
        school_id: DEFAULT_SCHOOL_ID,
        ...updates,
      });
    } else {
      await databases.createDocument(
        DB_ID,
        PROFILES_COL_ID,
        ID.unique(),
        {
          user_id: userId,
          email,
          role,
          roles: [role],
          active_role: role,
          assigned_role_slugs: [role],
          active_role_slug: role,
          role_custom_slugs_json: "{}",
          school_id: DEFAULT_SCHOOL_ID,
          is_active: true,
          approval_status: role === "aluno" ? "pending" : "approved",
          ...updates,
        },
        resolveProfileDocumentPermissions(userId, userId),
      );
    }

    if (effectiveRole === "aluno") {
      const trackResult = await ensureDefaultStudentTrainingTrack(userId);
      if (trackResult.error) {
        trackError = trackResult.error;
      } else if (!trackResult.trackId && !trackResult.assigned) {
        trackError = new Error("Nenhuma trilha padrão foi vinculada ao aluno.");
      }
    }

    return { error: null, trackError };
  } catch (error) {
    return { error: error as Error, trackError };
  }
}

async function listStudentsFromProfiles(_actorUserId: string): Promise<StudentOption[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.limit(200),
  ]);

  const students = res.documents
    .filter((doc) => {
      const userId = (doc.user_id as string | undefined) ?? "";
      const role = normalizeUserRole((doc.role as string | undefined) ?? null);
      if (!userId || doc.is_active === false) return false;
      return role !== "admin";
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
export async function listStudentIdentitiesForSchedule(_actorUserId: string): Promise<ScheduleStudentIdentity[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return [];

  const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
    Query.limit(200),
  ]);

  return res.documents
    .filter((doc) => {
      const userId = (doc.user_id as string | undefined) ?? "";
      const role = normalizeUserRole((doc.role as string | undefined) ?? null);
      if (!userId || doc.is_active === false) return false;
      return role !== "admin";
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
      if (doc.is_active === false) return null;
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
    .filter((doc) => doc.is_active !== false && normalizeUserRole((doc.role as string | undefined) ?? null) === "instrutor")
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
