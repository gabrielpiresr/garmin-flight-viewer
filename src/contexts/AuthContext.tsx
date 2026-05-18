import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { account, ID, isAppwriteConfigured, SCHOOL_ID } from "../lib/appwrite";
import { executeAnacSync } from "../lib/anacSync";
import { deriveRoleFromLabels, ensureProfile, getUserRole, type UserRole } from "../lib/rbac";

const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";

type AppwriteUser = { id: string; email: string; name: string; role: UserRole; schoolId: string };
export type SignUpProfileInput = {
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  weightKg: number;
  heightCm: number;
  anacCode: string;
};

type AuthState = {
  user: AppwriteUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    profile: SignUpProfileInput,
  ) => Promise<{ error: Error | null; anacSyncPending: boolean }>;
  signOut: () => Promise<void>;
  configured: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [loading, setLoading] = useState(isAppwriteConfigured);

  useEffect(() => {
    if (!isAppwriteConfigured || !account) {
      setLoading(false);
      return;
    }
    account
      .get()
      .then(async (u) => {
        const profileRole = await getUserRole(u.$id);
        const labelRole = deriveRoleFromLabels((u.labels as string[] | undefined) ?? []);
        const role = profileRole === "aluno" ? labelRole : profileRole;
        await ensureProfile(u.$id, u.email, role);
        setUser({ id: u.$id, email: u.email, name: u.name, role, schoolId: DEFAULT_SCHOOL_ID });
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!account) return { error: new Error("Appwrite não configurado") };
    try {
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      const profileRole = await getUserRole(u.$id);
      const labelRole = deriveRoleFromLabels((u.labels as string[] | undefined) ?? []);
      const role = profileRole === "aluno" ? labelRole : profileRole;
      await ensureProfile(u.$id, u.email, role);
      setUser({ id: u.$id, email: u.email, name: u.name, role, schoolId: DEFAULT_SCHOOL_ID });
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
        anac_sync_status: "pending",
        anac_sync_error: "ANAC sync not started",
      } as const;

      const { error } = await ensureProfile(u.$id, u.email, "aluno", baseProfileData);
      if (error) {
        return { error, anacSyncPending: true };
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

      setUser({ id: u.$id, email: u.email, name: u.name, role: "aluno", schoolId: DEFAULT_SCHOOL_ID });
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
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signUp, signOut, configured: isAppwriteConfigured }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
