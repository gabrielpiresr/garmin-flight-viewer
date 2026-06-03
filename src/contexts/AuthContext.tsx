import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { account, ID, isAppwriteConfigured, DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import { executeAnacSync } from "../lib/anacSync";
import { deriveRoleFromLabels, ensureProfile, getApprovalStatus, getUserRoleInfo, type ApprovalStatus, type UserRole } from "../lib/rbac";
import { ensureSystemRoles } from "../lib/tenantRolesDb";
import { createLead, getLeadByEmail, updateLead } from "../lib/crmDb";
import { parseRootAccessLogin, requestRootAccessSession } from "../lib/rootAccess";

type AppwriteUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Slug do role customizado atribuído (ex: "chefe-de-oficina"). Null = role padrão do portal. */
  customRoleSlug: string | null;
  schoolId: string;
  approvalStatus: ApprovalStatus;
};

export type SignUpProfileInput = {
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  weightKg: number;
  heightCm: number;
  anacCode: string;
  rg?: string;
  rgOrgaoExpedidor?: string;
  endereco?: string;
  nacionalidade?: string;
  estadoCivil?: string;
};

type AuthState = {
  user: AppwriteUser | null;
  isRoot: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string, redirectUrl: string) => Promise<{ error: Error | null }>;
  completePasswordReset: (userId: string, secret: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    profile: SignUpProfileInput,
  ) => Promise<{ error: Error | null; anacSyncPending: boolean }>;
  signOut: () => Promise<void>;
  configured: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

async function resolveUser(u: {
  $id: string;
  email: string;
  name: string;
  labels?: unknown;
}): Promise<AppwriteUser> {
  const { role: profileRole, customRoleSlug } = await getUserRoleInfo(u.$id);
  const labelRole = deriveRoleFromLabels((u.labels as string[] | undefined) ?? []);
  const role = profileRole === "aluno" ? labelRole : profileRole;
  await ensureProfile(u.$id, u.email, role);

  // Para admins, garantir que roles sistema existam no tenant
  if (role === "admin") {
    void ensureSystemRoles(DEFAULT_SCHOOL_ID);
  }

  const approvalStatus = role === "aluno" ? await getApprovalStatus(u.$id) : "approved";

  return {
    id: u.$id,
    email: u.email,
    name: u.name,
    role,
    customRoleSlug,
    schoolId: DEFAULT_SCHOOL_ID,
    approvalStatus,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [isRoot, setIsRoot] = useState(false);
  const [loading, setLoading] = useState(isAppwriteConfigured);

  useEffect(() => {
    if (!isAppwriteConfigured || !account) {
      setLoading(false);
      return;
    }
    account
      .get()
      .then(async (u) => {
        const resolved = await resolveUser(u);
        setUser(resolved);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!account) return { error: new Error("Appwrite não configurado") };
    try {
      const rootAccess = parseRootAccessLogin(email);
      if (rootAccess) {
        const sessionToken = await requestRootAccessSession({ ...rootAccess, password });
        await account.deleteSession("current").catch(() => undefined);
        await account.createSession(sessionToken.userId, sessionToken.secret);
        setIsRoot(true);
      } else {
        await account.createEmailPasswordSession(email, password);
        setIsRoot(false);
      }
      const u = await account.get();
      const resolved = await resolveUser(u);
      setUser(resolved);
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string, redirectUrl: string) => {
    if (!account) return { error: new Error("Appwrite nao configurado") };
    try {
      await account.createRecovery({ email, url: redirectUrl });
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, []);

  const completePasswordReset = useCallback(async (userId: string, secret: string, password: string) => {
    if (!account) return { error: new Error("Appwrite nao configurado") };
    try {
      await account.updateRecovery({ userId, secret, password });
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, profile: SignUpProfileInput) => {
    if (!account) return { error: new Error("Appwrite não configurado"), anacSyncPending: true };
    try {
      await account.create(ID.unique(), email, password);
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      const baseProfileData = {
        full_name: profile.fullName,
        cpf: profile.cpf,
        phone: profile.phone,
        birth_date: profile.birthDate,
        weight_kg: profile.weightKg,
        height_cm: profile.heightCm,
        anac_code: profile.anacCode,
        anac_sync_status: "pending" as const,
        anac_sync_error: "",
        rg: profile.rg ?? "",
        rg_orgao_expedidor: profile.rgOrgaoExpedidor ?? "",
        endereco: profile.endereco ?? "",
        nacionalidade: profile.nacionalidade ?? "",
        estado_civil: profile.estadoCivil ?? "",
      };

      const { error, trackError } = await ensureProfile(u.$id, u.email, "aluno", baseProfileData);
      if (error) {
        return {
          error: new Error(
            "Conta criada, mas o perfil não foi salvo. Entre com o mesmo e-mail e senha para concluir o cadastro.",
          ),
          anacSyncPending: true,
        };
      }
      if (trackError) {
        return {
          error: new Error(
            "Conta criada, mas a trilha de treinamento padrão não foi vinculada. Entre novamente com o mesmo e-mail e senha para tentar de novo.",
          ),
          anacSyncPending: true,
        };
      }

      const syncResult = await executeAnacSync({
        cpf: profile.cpf,
        anacCode: profile.anacCode,
        birthDate: profile.birthDate,
      });
      const anacSyncPending = syncResult.pending;

      if (anacSyncPending) {
        await ensureProfile(u.$id, u.email, "aluno", {
          anac_sync_status: "pending",
          anac_sync_error: syncResult.error?.message || "ANAC sync pending",
        });
      } else {
        await ensureProfile(u.$id, u.email, "aluno", {
          anac_sync_status: "success",
          anac_sync_error: "",
          anac_last_sync_at: new Date().toISOString(),
        });
      }

      // Criar ou vincular lead no CRM (best-effort)
      void (async () => {
        const { data: existing } = await getLeadByEmail(u.email);
        if (existing) {
          // Lead já existe (veio do form de qualificação ou cadastro) — só vincula userId
          void updateLead(existing.id, { userId: u.$id });
        } else {
          void createLead({ userId: u.$id, name: profile.fullName, email: u.email, phone: profile.phone, crmStatus: "novo_lead" });
        }
      })();

      setUser({
        id: u.$id,
        email: u.email,
        name: u.name,
        role: "aluno",
        customRoleSlug: null,
        schoolId: DEFAULT_SCHOOL_ID,
        approvalStatus: "pending",
      });
      return { error: null, anacSyncPending };
    } catch (e) {
      return { error: e as Error, anacSyncPending: true };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!account) return;
    try {
      await account.deleteSession("current");
    } finally {
      setUser(null);
      setIsRoot(false);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isRoot,
      loading,
      signIn,
      requestPasswordReset,
      completePasswordReset,
      signUp,
      signOut,
      configured: isAppwriteConfigured,
    }),
    [user, isRoot, loading, signIn, requestPasswordReset, completePasswordReset, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
