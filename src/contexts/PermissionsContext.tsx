import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getTenantRoleBySlug } from "../lib/tenantRolesDb";
import { getDefaultPermissionsForPortal } from "../lib/defaultRolePermissions";
import type { ActionKey, AnyTabKey, RolePermissions } from "../types/rolePermissions";

type PermissionsState = {
  permissions: RolePermissions | null;
  isLoading: boolean;
  canTab: (tabKey: AnyTabKey) => boolean;
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

    const activeSlug = user.activeRoleSlug || user.role;
    if (activeSlug === "admin") {
      setPermissions(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getTenantRoleBySlug(activeSlug, user.schoolId)
      .then((role) => {
        if (role) {
          setPermissions(role.permissions);
        } else {
          setPermissions(getDefaultPermissionsForPortal(user.role));
        }
      })
      .catch(() => {
        setPermissions(getDefaultPermissionsForPortal(user.role));
      })
      .finally(() => setIsLoading(false));
  }, [user?.id, user?.role, user?.activeRoleSlug, user?.schoolId]);

  const canTab = useMemo(
    () =>
      (tabKey: AnyTabKey): boolean => {
        if (!user) return false;
        if ((user.activeRoleSlug || user.role) === "admin") return true;
        if (isLoading) return false;
        if (!permissions) return true;
        const val = permissions.tabs[tabKey];
        return val !== false;
      },
    [permissions, user, isLoading],
  );

  const canAction = useMemo(
    () =>
      (actionKey: ActionKey): boolean => {
        if (!user) return false;
        if ((user.activeRoleSlug || user.role) === "admin") return true;
        if (isLoading) return false;
        if (!permissions) return true;
        const val = permissions.actions[actionKey];
        return val !== false;
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
