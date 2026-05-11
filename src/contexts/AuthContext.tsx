import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { account, isAppwriteConfigured, ID } from "../lib/appwrite";

type AppwriteUser = { id: string; email: string };

type AuthState = {
  user: AppwriteUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
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
      .then((u) => setUser({ id: u.$id, email: u.email }))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!account) return { error: new Error("Appwrite não configurado") };
    try {
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      setUser({ id: u.$id, email: u.email });
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!account) return { error: new Error("Appwrite não configurado") };
    try {
      await account.create(ID.unique(), email, password);
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      setUser({ id: u.$id, email: u.email });
      return { error: null };
    } catch (e) {
      return { error: e as Error };
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
