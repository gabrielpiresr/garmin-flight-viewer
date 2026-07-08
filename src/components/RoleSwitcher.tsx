import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import { ROLE_DISPLAY_LABELS } from "../lib/rbac";
import { beginRoleMigration } from "../lib/roleMigration";
import { listTenantRoles } from "../lib/tenantRolesDb";
import type { TenantRole } from "../types/rolePermissions";
import { RoleMigrationOverlay } from "./RoleMigrationOverlay";

type RoleSwitcherProps = {
  compact?: boolean;
  className?: string;
};

function slugLabel(slug: string, tenantRoles: TenantRole[]): string {
  if (slug === "admin") return "Admin";
  const match = tenantRoles.find((role) => role.slug === slug);
  if (match?.name) return match.name;
  return ROLE_DISPLAY_LABELS[slug as keyof typeof ROLE_DISPLAY_LABELS] ?? slug;
}

export function RoleSwitcher({ compact = false, className = "" }: RoleSwitcherProps) {
  const { user, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [migratingLabel, setMigratingLabel] = useState<string | null>(null);
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>([]);

  useEffect(() => {
    if (!user?.schoolId) return;
    void listTenantRoles(user.schoolId || DEFAULT_SCHOOL_ID).then(setTenantRoles).catch(() => undefined);
  }, [user?.schoolId]);

  if (!user || user.assignedRoleSlugs.length <= 1) return null;

  async function handleChange(nextSlug: string) {
    if (nextSlug === user?.activeRoleSlug || switching) return;
    const label = slugLabel(nextSlug, tenantRoles);
    setSwitching(true);
    setMigratingLabel(label);
    const { error } = await switchRole(nextSlug);
    if (error) {
      setSwitching(false);
      setMigratingLabel(null);
      window.alert(error.message || "Não foi possível trocar o role.");
      return;
    }
    // Mantém o overlay visível através do reload (relido no boot do App).
    beginRoleMigration(label);
    window.location.reload();
  }

  return (
    <div className={`inline-flex flex-wrap gap-1 ${className}`}>
      {migratingLabel ? <RoleMigrationOverlay label={migratingLabel} /> : null}
      {user.assignedRoleSlugs.map((slug) => {
        const active = user.activeRoleSlug === slug;
        return (
          <button
            key={slug}
            type="button"
            disabled={switching}
            onClick={() => void handleChange(slug)}
            className={`rounded-xl border font-medium transition disabled:opacity-60 ${
              compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } ${
              active
                ? "border-cyan-500 bg-cyan-500/20 text-cyan-200"
                : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
            title={slug}
          >
            {slugLabel(slug, tenantRoles)}
          </button>
        );
      })}
    </div>
  );
}

/** Badge estático ou button group — usado no canto superior esquerdo em mobile/tablet. */
export function HeaderRoleControl({
  fallbackLabel,
  fallbackClassName,
}: {
  fallbackLabel: string;
  fallbackClassName: string;
}) {
  const { user } = useAuth();

  if (user && user.assignedRoleSlugs.length > 1) {
    return <RoleSwitcher compact className="max-w-[min(100%,20rem)]" />;
  }

  return (
    <span
      className={`w-fit rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${fallbackClassName}`}
    >
      {fallbackLabel}
    </span>
  );
}

export function UserEmailWithRoleSwitcher({
  email,
  sidebarCollapsed = false,
  header = false,
}: {
  email?: string | null;
  sidebarCollapsed?: boolean;
  header?: boolean;
}) {
  if (!email) return null;

  if (header) {
    return (
      <span className="hidden max-w-48 truncate text-xs text-slate-600 sm:inline">{email}</span>
    );
  }

  if (sidebarCollapsed) return null;

  return (
    <div className="space-y-2">
      <p className="truncate text-xs text-slate-500">{email}</p>
      <RoleSwitcher />
    </div>
  );
}
