import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, DEFAULT_SCHOOL_ID, TENANT_ROLES_COL_ID } from "./appwrite";
import { mergeWithDefaults } from "./defaultRolePermissions";
import type { TenantRole, TenantRoleInput, PortalType, RolePermissions } from "../types/rolePermissions";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

type RoleDoc = {
  $id: string;
  school_id?: string;
  name?: string;
  slug?: string;
  portal_type?: string;
  is_system?: boolean;
  permissions_json?: string;
  created_at?: string;
  updated_at?: string;
};

function isPortalType(v: unknown): v is PortalType {
  return v === "admin" || v === "instrutor" || v === "aluno";
}

function parsePermissions(json: string | undefined): RolePermissions {
  if (!json) return { tabs: {}, actions: {} };
  try {
    const parsed = JSON.parse(json) as Partial<RolePermissions>;
    return {
      tabs: (parsed.tabs ?? {}) as RolePermissions["tabs"],
      actions: (parsed.actions ?? {}) as RolePermissions["actions"],
    };
  } catch {
    return { tabs: {}, actions: {} };
  }
}

function docToRole(doc: RoleDoc): TenantRole {
  const portalType = isPortalType(doc.portal_type) ? doc.portal_type : "admin";
  const rawPermissions = parsePermissions(doc.permissions_json);
  return {
    $id: doc.$id,
    schoolId: doc.school_id ?? DEFAULT_SCHOOL_ID,
    name: doc.name ?? "",
    slug: doc.slug ?? "",
    portalType,
    isSystem: doc.is_system ?? false,
    permissions: mergeWithDefaults(rawPermissions, portalType),
    createdAt: doc.created_at ?? "",
    updatedAt: doc.updated_at ?? "",
  };
}

function isConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && TENANT_ROLES_COL_ID);
}

/** Lista todos os roles de um tenant, deduplicando por slug (mantém o mais antigo) */
export async function listTenantRoles(schoolId: string = DEFAULT_SCHOOL_ID): Promise<TenantRole[]> {
  if (!isConfigured()) return [];
  try {
    const res = await databases!.listDocuments(DB_ID!, TENANT_ROLES_COL_ID!, [
      Query.equal("school_id", [schoolId]),
      Query.limit(100),
    ]);
    const all = (res.documents as unknown as RoleDoc[]).map(docToRole);
    // Deduplica por slug — caso a collection não tenha índice único ainda
    const seen = new Set<string>();
    return all.filter((r) => {
      if (seen.has(r.slug)) return false;
      seen.add(r.slug);
      return true;
    });
  } catch {
    return [];
  }
}

/** Busca um role pelo slug */
export async function getTenantRoleBySlug(
  slug: string,
  schoolId: string = DEFAULT_SCHOOL_ID,
): Promise<TenantRole | null> {
  if (!isConfigured()) return null;
  try {
    const res = await databases!.listDocuments(DB_ID!, TENANT_ROLES_COL_ID!, [
      Query.equal("school_id", [schoolId]),
      Query.equal("slug", [slug]),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as unknown as RoleDoc | undefined;
    return doc ? docToRole(doc) : null;
  } catch {
    return null;
  }
}

/** Cria um role customizado */
export async function createTenantRole(
  input: TenantRoleInput,
  schoolId: string = DEFAULT_SCHOOL_ID,
): Promise<TenantRole> {
  if (!isConfigured()) throw new Error("Appwrite não configurado");
  const now = new Date().toISOString();
  const doc = await databases!.createDocument(DB_ID!, TENANT_ROLES_COL_ID!, ID.unique(), {
    school_id: schoolId,
    name: input.name,
    slug: input.slug,
    portal_type: input.portalType,
    is_system: false,
    permissions_json: JSON.stringify(input.permissions),
    created_at: now,
    updated_at: now,
  });
  return docToRole(doc as unknown as RoleDoc);
}

/** Atualiza um role existente (não pode alterar is_system nem slug de roles sistema) */
export async function updateTenantRole(
  roleId: string,
  input: Partial<TenantRoleInput>,
): Promise<TenantRole> {
  if (!isConfigured()) throw new Error("Appwrite não configurado");
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (input.name !== undefined) updates.name = input.name;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.portalType !== undefined) updates.portal_type = input.portalType;
  if (input.permissions !== undefined) updates.permissions_json = JSON.stringify(input.permissions);

  const doc = await databases!.updateDocument(DB_ID!, TENANT_ROLES_COL_ID!, roleId, updates);
  return docToRole(doc as unknown as RoleDoc);
}

/** Remove um role customizado (roles sistema são protegidos) */
export async function deleteTenantRole(roleId: string): Promise<void> {
  if (!isConfigured()) throw new Error("Appwrite não configurado");
  await databases!.deleteDocument(DB_ID!, TENANT_ROLES_COL_ID!, roleId);
}

// Cache de promises em andamento por schoolId — evita chamadas concorrentes (React StrictMode roda efeitos 2x)
const ensureInProgress = new Map<string, Promise<void>>();

/**
 * Garante que os roles padrão (instrutor, aluno) existam para o tenant.
 * Chamado no login do admin — idempotente. Usa cache de promise para evitar
 * race condition em React StrictMode (que executa useEffect duas vezes em dev).
 */
export async function ensureSystemRoles(schoolId: string = DEFAULT_SCHOOL_ID): Promise<void> {
  if (!isConfigured()) return;

  // Se já há uma execução em andamento para este schoolId, aguarda ela (não duplica)
  const inProgress = ensureInProgress.get(schoolId);
  if (inProgress) return inProgress;

  const promise = _doEnsureSystemRoles(schoolId).finally(() => {
    ensureInProgress.delete(schoolId);
  });
  ensureInProgress.set(schoolId, promise);
  return promise;
}

async function _doEnsureSystemRoles(schoolId: string): Promise<void> {
  const { DEFAULT_INSTRUTOR_PERMISSIONS, DEFAULT_ALUNO_PERMISSIONS } = await import("./defaultRolePermissions");

  const existing = await listTenantRoles(schoolId);

  // Deduplicar por slug no caso de já haver duplicatas (cleanup defensivo)
  const seenSlugs = new Set<string>();
  const toDelete: string[] = [];
  for (const role of existing) {
    if (seenSlugs.has(role.slug)) {
      toDelete.push(role.$id);
    } else {
      seenSlugs.add(role.slug);
    }
  }
  // Apaga silenciosamente documentos duplicados encontrados
  for (const id of toDelete) {
    try { await databases!.deleteDocument(DB_ID!, TENANT_ROLES_COL_ID!, id); } catch { /* ignorar */ }
  }

  const systemRoles: Array<{ slug: string; name: string; portalType: PortalType; permissions: RolePermissions }> = [
    { slug: "instrutor", name: "Instrutor", portalType: "instrutor", permissions: DEFAULT_INSTRUTOR_PERMISSIONS },
    { slug: "aluno", name: "Aluno", portalType: "aluno", permissions: DEFAULT_ALUNO_PERMISSIONS },
  ];

  for (const role of systemRoles) {
    if (seenSlugs.has(role.slug)) continue;
    const now = new Date().toISOString();
    try {
      await databases!.createDocument(DB_ID!, TENANT_ROLES_COL_ID!, ID.unique(), {
        school_id: schoolId,
        name: role.name,
        slug: role.slug,
        portal_type: role.portalType,
        is_system: true,
        permissions_json: JSON.stringify(role.permissions),
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Ignora conflito de índice único (segunda chamada simultânea)
    }
  }
}
