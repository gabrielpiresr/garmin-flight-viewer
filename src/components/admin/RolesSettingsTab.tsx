import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createTenantRole,
  deleteTenantRole,
  listTenantRoles,
  updateTenantRole,
} from "../../lib/tenantRolesDb";
import {
  ACTION_LABELS,
  INSTRUCTOR_TAB_LABELS,
  STUDENT_TAB_LABELS,
  type ActionKey,
  type AdminTabKey,
  type InstructorTabKey,
  type PortalType,
  type RolePermissions,
  type StudentTabKey,
  type TenantRole,
  type TenantRoleInput,
} from "../../types/rolePermissions";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_ALUNO_PERMISSIONS, DEFAULT_INSTRUTOR_PERMISSIONS } from "../../lib/defaultRolePermissions";
import { useToast } from "../ui/ToastProvider";

// ─── Estrutura hierárquica das abas admin ─────────────────────────────────────

type TabGroup = {
  label: string;
  parentKey: AdminTabKey;
  children?: Array<{ key: AdminTabKey; label: string }>;
};

const ADMIN_TAB_GROUPS: TabGroup[] = [
  { label: "Home", parentKey: "home" },
  {
    label: "Escala",
    parentKey: "schedule",
    children: [
      { key: "schedule.voos", label: "Voos" },
      { key: "schedule.disponibilidades", label: "Disponibilidades" },
      { key: "schedule.gerador", label: "Gerador" },
      { key: "schedule.configuracoes", label: "Configurações" },
    ],
  },
  { label: "Alunos", parentKey: "students" },
  {
    label: "Relatórios",
    parentKey: "reports",
    children: [
      { key: "reports.all-flights", label: "Todos os Voos" },
      { key: "reports.relatorios", label: "Relatórios" },
      { key: "reports.assinaturas", label: "Assinaturas" },
      { key: "reports.sem-telemetria", label: "Flight Review" },
      { key: "reports.alertas", label: "Alertas" },
    ],
  },
  {
    label: "Frota",
    parentKey: "fleet",
    children: [
      { key: "fleet.avioes", label: "Aviões" },
      { key: "fleet.modelos", label: "Modelos" },
      { key: "fleet.programa", label: "Programa de Manutenção" },
      { key: "fleet.ordens-servico", label: "Ordens de Serviço" },
    ],
  },
  {
    label: "Conteúdos",
    parentKey: "contents",
    children: [
      { key: "contents.manobras", label: "Manobras" },
      { key: "contents.manuais", label: "Manuais" },
      { key: "contents.manuais-internos", label: "Manuais internos" },
      { key: "contents.ajuda", label: "Central de Ajuda" },
      { key: "contents.ajuda-instrutor", label: "Manual do Instrutor" },
      { key: "settings.onboarding", label: "Manual do Aluno" },
      { key: "contents.exercicios", label: "Critérios" },
    ],
  },
  { label: "Usuários", parentKey: "users" },
  { label: "Import", parentKey: "import" },
  {
    label: "Disparos",
    parentKey: "disparos",
    children: [
      { key: "disparos.email-mkt", label: "Email MKT" },
      { key: "disparos.avisos", label: "Avisos" },
    ],
  },
  { label: "Diário de Bordo", parentKey: "logbook" },
  { label: "Abastecimentos", parentKey: "fuelings" },
  { label: "DRE", parentKey: "dre" },
  { label: "Recebimentos", parentKey: "receipts" },
  { label: "CRM", parentKey: "crm" },
  { label: "Instrutores", parentKey: "instructor-admission" },
  { label: "Flight Review", parentKey: "flight-review" },
  {
    label: "Contratos",
    parentKey: "contracts",
    children: [
      { key: "contracts.layouts", label: "Layouts" },
      { key: "contracts.emitidos", label: "Emitidos" },
    ],
  },
  {
    label: "Atualizações",
    parentKey: "atualizacoes",
    children: [
      { key: "atualizacoes.agendamentos", label: "Agendamentos" },
    ],
  },
  {
    label: "Configurações",
    parentKey: "settings",
    children: [
      { key: "settings.regras", label: "Regras" },
      { key: "settings.email", label: "E-mail" },
      { key: "settings.aparencia", label: "Aparência" },
      { key: "settings.badges", label: "Badges" },
      { key: "settings.trilhas", label: "Trilhas" },
      { key: "settings.exercicios", label: "Critérios" },
      { key: "settings.financeiro", label: "Financeiro" },
      { key: "settings.indique-ganhe", label: "Indique e ganhe" },
      { key: "settings.roles", label: "Roles" },
      { key: "settings.propostas", label: "Propostas" },
    ],
  },
];

const INSTRUCTOR_TABS: Array<{ key: InstructorTabKey; label: string }> = Object.entries(INSTRUCTOR_TAB_LABELS).map(
  ([key, label]) => ({ key: key as InstructorTabKey, label }),
);

const INSTRUCTOR_SCHEDULE_SUBTABS: InstructorTabKey[] = [
  "schedule.voos",
  "schedule.disponibilidades",
  "schedule.gerador",
];

const INSTRUCTOR_SCHEDULE_ACTIONS: ActionKey[] = ["flight.create", "flight.edit", "flight.delete"];

const STUDENT_TABS: Array<{ key: StudentTabKey; label: string }> = Object.entries(STUDENT_TAB_LABELS).map(
  ([key, label]) => ({ key: key as StudentTabKey, label }),
);

const ALL_ACTIONS = Object.entries(ACTION_LABELS).map(([key, label]) => ({
  key: key as ActionKey,
  label,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDefaultPermissionsForPortal(portalType: PortalType): RolePermissions {
  switch (portalType) {
    case "admin": return DEFAULT_ADMIN_PERMISSIONS;
    case "instrutor": return DEFAULT_INSTRUTOR_PERMISSIONS;
    case "aluno": return DEFAULT_ALUNO_PERMISSIONS;
  }
}

// ─── Componente de checklist de abas admin ────────────────────────────────────

function AdminTabsEditor({
  tabs,
  onChange,
}: {
  tabs: RolePermissions["tabs"];
  onChange: (next: RolePermissions["tabs"]) => void;
}) {
  function toggle(key: string, val: boolean) {
    onChange({ ...tabs, [key]: val });
  }

  function toggleGroup(group: TabGroup, val: boolean) {
    const updates: Record<string, boolean> = { [group.parentKey]: val };
    if (group.children) {
      for (const child of group.children) updates[child.key] = val;
    }
    onChange({ ...tabs, ...updates });
  }

  return (
    <div className="space-y-2">
      {ADMIN_TAB_GROUPS.map((group) => {
        const parentEnabled = tabs[group.parentKey] !== false;
        return (
          <div key={group.parentKey} className="rounded-lg border border-slate-700 bg-slate-800/40">
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                checked={parentEnabled}
                onChange={(e) => toggleGroup(group, e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-200">{group.label}</span>
            </label>
            {group.children && (
              <div className="border-t border-slate-700/50 px-4 py-2">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {group.children.map((child) => (
                    <label key={child.key} className="flex cursor-pointer items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={tabs[child.key] !== false}
                        onChange={(e) => toggle(child.key, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-400">{child.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Modal de criação/edição ───────────────────────────────────────────────────

function RoleEditorModal({
  role,
  onSave,
  onClose,
  saving,
}: {
  role: TenantRole | null; // null = novo role
  onSave: (input: TenantRoleInput) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !role;
  const isSystem = role?.isSystem ?? false;

  const [name, setName] = useState(role?.name ?? "");
  const [slug, setSlug] = useState(role?.slug ?? "");
  const [slugManual, setSlugManual] = useState(!isNew);
  const [portalType, setPortalType] = useState<PortalType>(role?.portalType ?? "admin");
  const [permissions, setPermissions] = useState<RolePermissions>(
    role?.permissions ?? getDefaultPermissionsForPortal("admin"),
  );

  // Auto-gera slug a partir do nome (se não editado manualmente)
  useEffect(() => {
    if (!slugManual && name) {
      setSlug(slugify(name));
    }
  }, [name, slugManual]);

  // Atualiza permissões padrão ao mudar portal type em roles novos
  const [prevPortal, setPrevPortal] = useState<PortalType>(portalType);
  useEffect(() => {
    if (isNew && portalType !== prevPortal) {
      setPermissions(getDefaultPermissionsForPortal(portalType));
      setPrevPortal(portalType);
    }
  }, [portalType, prevPortal, isNew]);

  function handleTabsChange(tabs: RolePermissions["tabs"]) {
    setPermissions((prev) => ({ ...prev, tabs }));
  }

  function handleActionToggle(key: ActionKey, val: boolean) {
    setPermissions((prev) => ({ ...prev, actions: { ...prev.actions, [key]: val } }));
  }

  function handleInstructorTabToggle(key: InstructorTabKey, checked: boolean) {
    if (key !== "schedule") {
      handleTabsChange({ ...permissions.tabs, [key]: checked });
      return;
    }
    const next: RolePermissions["tabs"] = { ...permissions.tabs, schedule: checked };
    if (!checked) {
      for (const subKey of INSTRUCTOR_SCHEDULE_SUBTABS) next[subKey] = false;
    }
    handleTabsChange(next);
    if (!checked) {
      setPermissions((prev) => ({
        ...prev,
        actions: {
          ...prev.actions,
          "flight.create": false,
          "flight.edit": false,
          "flight.delete": false,
        },
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({ name, slug, portalType, permissions });
  }

  const portalOptions: Array<{ value: PortalType; label: string }> = [
    { value: "admin", label: "Admin (portal administrativo)" },
    { value: "instrutor", label: "Instrutor (portal do instrutor)" },
    { value: "aluno", label: "Aluno (portal do aluno)" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isNew ? "Novo Role" : `Editar: ${role.name}`}
            </h2>
            {isSystem && (
              <span className="mt-0.5 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                Role Sistema
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 p-6">
          {/* Nome e Slug */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome do Role</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSystem}
                placeholder="Ex: Chefe de Oficina"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Slug (identificador)</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                disabled={isSystem}
                placeholder="chefe-de-oficina"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Portal */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Portal de acesso</label>
            <div className="flex flex-wrap gap-3">
              {portalOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    portalType === opt.value
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-600"
                  } ${isSystem ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    checked={portalType === opt.value}
                    onChange={() => setPortalType(opt.value)}
                    disabled={isSystem}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Abas */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Abas permitidas
            </h3>
            {portalType === "admin" && (
              <AdminTabsEditor tabs={permissions.tabs} onChange={handleTabsChange} />
            )}
            {portalType === "instrutor" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INSTRUCTOR_TABS.filter(({ key }) => !INSTRUCTOR_SCHEDULE_SUBTABS.includes(key)).map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={permissions.tabs[key] !== false}
                        onChange={(e) => handleInstructorTabToggle(key, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500"
                      />
                      <span className="text-sm text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
                {permissions.tabs.schedule !== false ? (
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Escala: subabas visíveis para INVA</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {INSTRUCTOR_SCHEDULE_SUBTABS.map((subKey) => (
                        <label key={subKey} className="flex cursor-pointer items-center gap-2 rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={permissions.tabs[subKey] !== false}
                            onChange={(e) => handleTabsChange({ ...permissions.tabs, [subKey]: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500"
                          />
                          <span className="text-xs text-slate-300">{INSTRUCTOR_TAB_LABELS[subKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            {portalType === "aluno" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STUDENT_TABS.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={permissions.tabs[key] !== false}
                      onChange={(e) => handleTabsChange({ ...permissions.tabs, [key]: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500"
                    />
                    <span className="text-sm text-slate-300">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Ações */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ações permitidas
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_ACTIONS.filter(({ key }) => portalType !== "instrutor" || !key.startsWith("flight.") || INSTRUCTOR_SCHEDULE_ACTIONS.includes(key))
                .map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={permissions.actions[key] !== false}
                    onChange={(e) => handleActionToggle(key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500"
                  />
                  <span className="text-sm text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name || !slug}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Card de role ──────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role: TenantRole;
  onEdit: (role: TenantRole) => void;
  onDelete: (role: TenantRole) => void;
}) {
  const portalBadge: Record<PortalType, { label: string; className: string }> = {
    admin: { label: "Admin", className: "bg-amber-500/20 text-amber-400" },
    instrutor: { label: "Instrutor", className: "bg-sky-500/20 text-sky-400" },
    aluno: { label: "Aluno", className: "bg-violet-500/20 text-violet-400" },
  };
  const badge = portalBadge[role.portalType];

  const enabledTabs = Object.values(role.permissions.tabs).filter(Boolean).length;
  const enabledActions = Object.values(role.permissions.actions).filter(Boolean).length;

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{role.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
            {badge.label}
          </span>
          {role.isSystem && (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">Sistema</span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-xs text-slate-500">{role.slug}</p>
        <p className="mt-1.5 text-xs text-slate-400">
          {enabledTabs} abas · {enabledActions} ações habilitadas
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onEdit(role)}
          className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
        >
          Editar
        </button>
        {!role.isSystem && (
          <button
            type="button"
            onClick={() => onDelete(role)}
            className="rounded-lg border border-red-800/40 px-2.5 py-1.5 text-xs text-red-400 transition hover:border-red-700 hover:bg-red-900/20"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tab principal ─────────────────────────────────────────────────────────────

export function RolesSettingsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalRole, setModalRole] = useState<TenantRole | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listTenantRoles(user?.schoolId);
      setRoles(list.sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }));
    } catch {
      showToast({ variant: "error", message: "Erro ao carregar roles" });
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(input: TenantRoleInput) {
    setSaving(true);
    try {
      if (modalRole === "new") {
        await createTenantRole(input, user?.schoolId);
        showToast({ variant: "success", message: "Role criado com sucesso!" });
      } else if (modalRole) {
        await updateTenantRole(modalRole.$id, input);
        showToast({ variant: "success", message: "Role atualizado com sucesso!" });
      }
      setModalRole(null);
      await load();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message || "Erro ao salvar role" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: TenantRole) {
    if (!confirm(`Tem certeza que deseja excluir o role "${role.name}"? Usuários com este role perderão acesso personalizado.`)) return;
    try {
      await deleteTenantRole(role.$id);
      showToast({ variant: "success", message: "Role excluído" });
      await load();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message || "Erro ao excluir role" });
    }
  }

  const editingRole = modalRole === "new" ? null : (modalRole ?? null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Roles e Permissões</h2>
          <p className="text-xs text-slate-500">Configure quais abas e ações cada role pode acessar.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalRole("new")}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Role
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
          <p className="text-sm text-slate-500">Nenhum role configurado.</p>
          <p className="mt-1 text-xs text-slate-600">Clique em "Novo Role" para criar o primeiro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleCard
              key={role.$id}
              role={role}
              onEdit={setModalRole}
              onDelete={(r) => void handleDelete(r)}
            />
          ))}
        </div>
      )}

      {modalRole !== null && (
        <RoleEditorModal
          role={editingRole}
          onSave={handleSave}
          onClose={() => setModalRole(null)}
          saving={saving}
        />
      )}
    </section>
  );
}
