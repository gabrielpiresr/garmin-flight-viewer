import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getTenantRoleBySlug } from "../lib/tenantRolesDb";
import { getDefaultPermissionsForPortal } from "../lib/defaultRolePermissions";
import type { ActionKey, AnyTabKey, RolePermissions } from "../types/rolePermissions";

type PermissionsState = {
  /** Permissões ativas para o usuário logado */
  permissions: RolePermissions | null;
  /** true enquanto carrega as permissões do Appwrite */
  isLoading: boolean;
  /**
   * Verifica se o usuário pode acessar uma aba.
   * Admin sem customRole sempre retorna true.
   */
  canTab: (tabKey: AnyTabKey) => boolean;
  /**
   * Verifica se o usuário pode executar uma ação.
   * Admin sem customRole sempre retorna true.
   */
  canAction: (actionKey: ActionKey) => boolean;
};

const PermissionsContext = createContext<PermissionsState | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setPermissions(null);
      return;
    }

    // Admin puro (sem role customizado) = acesso total, sem necessidade de fetch
    if (user.role === "admin" && !user.customRoleSlug) {
      setPermissions(null); // null = acesso total para admin
      setIsLoading(false);
      return;
    }

    // Para roles customizados ou roles padrão (instrutor/aluno): carregar do Appwrite
    const slugToFetch = user.customRoleSlug ?? user.role;
    setIsLoading(true);

    getTenantRoleBySlug(slugToFetch, user.schoolId)
      .then((role) => {
        if (role) {
          setPermissions(role.permissions);
        } else {
          // Role não encontrado → usar defaults do portal
          setPermissions(getDefaultPermissionsForPortal(user.role));
        }
      })
      .catch(() => {
        setPermissions(getDefaultPermissionsForPortal(user.role));
      })
      .finally(() => setIsLoading(false));
  }, [user?.id, user?.role, user?.customRoleSlug, user?.schoolId]);

  const canTab = useMemo(
    () =>
      (tabKey: AnyTabKey): boolean => {
        if (!user) return false;
        // Admin sem role customizado tem acesso total
        if (user.role === "admin" && !user.customRoleSlug) return true;
        // Enquanto carrega permissões, ocultar para evitar flash de acesso não autorizado
        if (isLoading) return false;
        if (!permissions) return true; // sem permissões definidas = acesso padrão do portal
        const val = permissions.tabs[tabKey];
        return val !== false; // undefined = permitido por padrão
      },
    [permissions, user, isLoading],
  );

  const canAction = useMemo(
    () =>
      (actionKey: ActionKey): boolean => {
        if (!user) return false;
        // Admin sem role customizado tem acesso total
        if (user.role === "admin" && !user.customRoleSlug) return true;
        // Enquanto carrega permissões, bloquear ações
        if (isLoading) return false;
        if (!permissions) return true; // sem permissões definidas = acesso padrão do portal
        const val = permissions.actions[actionKey];
        return val !== false; // undefined = permitido por padrão
      },
    [permissions, user, isLoading],
  );

  const value = useMemo<PermissionsState>(
    () => ({ permissions, isLoading, canTab, canAction }),
    [permissions, isLoading, canTab, canAction],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsState {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
