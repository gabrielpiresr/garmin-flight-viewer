import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getEmailSettings, saveEmailSettings, sendTestEmail } from "../../lib/notificationsDb";
import type { EmailSettings, EmailSettingsInput, EmailTemplateType } from "../../types/notification";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";
import { TrainingTracksTab } from "./TrainingTracksTab";
import { TrainingExercisesTab } from "./TrainingExercisesTab";
import { RewardsEditor } from "./RewardsEditor";
import { SchoolCostsPanel } from "./SchoolCostsPanel";
import { SchoolProductsPanel } from "./SchoolProductsPanel";
import { useOpenedTabs } from "../../lib/routedTabs";
import { usePermissions } from "../../contexts/PermissionsContext";
import type { AdminTabKey } from "../../types/rolePermissions";
import {
  AppearanceSettingsPanel,
  EmailBrandSettingsPanel,
  EmailNotificationRulesPanel,
  ScheduleRulesPanel,
} from "./PlatformSettingsExtraPanels";

const RolesSettingsTab = lazy(() =>
  import("./RolesSettingsTab").then((m) => ({ default: m.RolesSettingsTab })),
);

export type SettingsSubTab = "email" | "brand" | "rules" | "badges" | "tracks" | "exercises" | "financeiro" | "roles";

const SUB_TABS: Array<{ id: SettingsSubTab; label: string; icon: ReactNode }> = [
  {
    id: "rules",
    label: "Regras",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M9.664 1.319a.75.75 0 01.672 0l6.25 3.125A.75.75 0 0117 5.115v4.768c0 3.227-1.953 6.133-4.942 7.346l-1.776.721a.75.75 0 01-.564 0l-1.776-.721A7.93 7.93 0 013 9.883V5.115a.75.75 0 01.414-.671l6.25-3.125zM13.78 7.78a.75.75 0 00-1.06-1.06L9 10.44 7.28 8.72a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "brand",
    label: "Aparencia",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11.5A2.5 2.5 0 004.5 18h11A2.5 2.5 0 0018 15.5V4a2 2 0 00-2-2H4zm0 2h12v7.5l-2.4-2.4a1 1 0 00-1.414 0L9 12.286 7.314 10.6a1 1 0 00-1.414 0L4 12.5V4zm10 2.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "tracks",
    label: "Trilhas",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4 3.5A2.5 2.5 0 016.5 1h7A2.5 2.5 0 0116 3.5v13a.75.75 0 01-1.18.615L10 13.742l-4.82 3.373A.75.75 0 014 16.5v-13zM6.5 2.5A1 1 0 005.5 3.5v11.56l4.07-2.85a.75.75 0 01.86 0l4.07 2.85V3.5a1 1 0 00-1-1h-7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "badges",
    label: "Badges",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2.5l2.25 4.56 5.03.73-3.64 3.55.86 5.01L10 13.98l-4.5 2.37.86-5.01-3.64-3.55 5.03-.73L10 2.5z" />
      </svg>
    ),
  },
  {
    id: "exercises",
    label: "Exercicios",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18h11a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0015.5 2h-11zM6 6.75A.75.75 0 016.75 6h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 016 6.75zM6.75 9.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM6 13.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "email",
    label: "E-mails",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4a2 2 0 00-2 2v.217l9 4.5 9-4.5V6a2 2 0 00-2-2H3z" />
        <path d="M19 8.383l-8.553 4.276a1 1 0 01-.894 0L1 8.383V14a2 2 0 002 2h14a2 2 0 002-2V8.383z" />
      </svg>
    ),
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.983-.045 1.71-.818 1.71-1.76 0-.07-.005-.137-.015-.203-.001-.01-.003-.021-.004-.031a1.23 1.23 0 0 0-.093-.32 1.72 1.72 0 0 0-.351-.468c-.237-.216-.59-.397-1.012-.544a5.37 5.37 0 0 0-.373-.056ZM9.25 9.182V6.568c-.309.076-.604.18-.882.306-.424.19-.768.458-.98.787-.168.263-.238.557-.238.839 0 .434.22.83.618 1.13.266.198.606.362 1.01.5.155.052.31.1.472.052ZM10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm-.75 4.5v-.25a.75.75 0 0 1 1.5 0v.328c.47.112.898.296 1.256.557.655.473 1.119 1.21 1.119 2.115 0 1.56-1.21 2.814-2.875 2.914V14.5h1.25a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1 0-1.5h.75V12.18c-.46-.102-.88-.277-1.228-.519-.69-.483-1.147-1.25-1.147-2.161 0-.68.215-1.287.627-1.79.384-.47.91-.812 1.498-1.028V6.5Z" />
      </svg>
    ),
  },
  {
    id: "roles" as SettingsSubTab,
    label: "Roles",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
      </svg>
    ),
  },
];

/** Mapeamento de sub-aba de configurações → AdminTabKey para controle de permissões */
const SETTINGS_SUB_TAB_KEY: Record<SettingsSubTab, AdminTabKey> = {
  rules:       "settings.regras",
  email:       "settings.email",
  brand:       "settings.aparencia",
  badges:      "settings.badges",
  tracks:      "settings.trilhas",
  exercises:   "settings.exercicios",
  financeiro:  "settings.financeiro",
  roles:       "settings.roles",
};

const TEMPLATE_OPTIONS: Array<{ id: EmailTemplateType; label: string }> = [
  { id: "test", label: "Teste geral" },
  { id: "flight.scheduled", label: "Voo agendado" },
  { id: "flight.updated", label: "Voo alterado" },
  { id: "flight.cancelled", label: "Voo cancelado" },
  { id: "weeklyPlan.submitted", label: "Intenção enviada" },
  { id: "notice.published", label: "Novo aviso" },
];

const emptyForm: EmailSettingsInput = {
  enabled: false,
  fromName: "",
  fromEmail: "",
  replyTo: "",
  subjectPrefix: "",
  resendApiKey: "",
};


function toForm(settings: EmailSettings): EmailSettingsInput {
  return {
    enabled: settings.enabled,
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyTo: settings.replyTo,
    subjectPrefix: settings.subjectPrefix,
    resendApiKey: "",
  };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Nunca salvo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function EmailSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState<EmailSettingsInput>(emptyForm);
  const [testEmail, setTestEmail] = useState("");
  const [testTemplate, setTestTemplate] = useState<EmailTemplateType>("test");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getEmailSettings();
      setSettings(next);
      setForm(toForm(next));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  async function handleSave() {
    if (!form.fromEmail.trim()) {
      setError("Informe o email do remetente.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveEmailSettings({
        ...form,
        resendApiKey: form.resendApiKey?.trim() || null,
      });
      setSettings(saved);
      setForm(toForm(saved));
      showToast({ variant: "success", message: "Configuração de email salva." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const to = testEmail.trim();
    if (!to) {
      setError("Informe o email de destino para o teste.");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      await sendTestEmail(to, testTemplate);
      showToast({ variant: "success", message: "Email de teste do template enviado." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Configuração de email</h3>
          <p className="mt-1 text-xs text-slate-500">
            A chave da Resend fica armazenada no Appwrite e não é exibida novamente depois de salva.
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          <p>
            Status:{" "}
            <span className={settings?.apiKeyConfigured ? "text-emerald-300" : "text-amber-300"}>
              {settings?.apiKeyConfigured ? "Chave configurada" : "Chave não configurada"}
            </span>
          </p>
          <p>Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            className="h-4 w-4 accent-emerald-500"
          />
          Habilitar disparos de email
        </label>

        <label className="text-xs text-slate-400">
          Nome do remetente
          <input
            type="text"
            value={form.fromName}
            onChange={(e) => setForm((prev) => ({ ...prev, fromName: e.target.value }))}
            placeholder="Ex: Escola de Aviação"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          Email do remetente
          <input
            type="email"
            value={form.fromEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, fromEmail: e.target.value }))}
            placeholder="noreply@seudominio.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          Reply-to
          <input
            type="email"
            value={form.replyTo ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, replyTo: e.target.value }))}
            placeholder="contato@seudominio.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          Prefixo de assunto
          <input
            type="text"
            value={form.subjectPrefix ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, subjectPrefix: e.target.value }))}
            placeholder="Ex: [Escola]"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400 md:col-span-2">
          Resend API key
          <input
            type="password"
            value={form.resendApiKey ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, resendApiKey: e.target.value }))}
            placeholder={settings?.apiKeyConfigured ? "••••••••••••••••••••••••••••••••" : "re_..."}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <span className="mt-1 block text-[11px] text-slate-600">Deixe em branco para manter a chave atual.</span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-slate-800 pt-4">
        <div className="grid flex-1 gap-2 sm:max-w-2xl sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="email@destino.com"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <select
            value={testTemplate}
            onChange={(e) => setTestTemplate(e.target.value as EmailTemplateType)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            {TEMPLATE_OPTIONS.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || !settings?.apiKeyConfigured}
            className="rounded-lg border border-cyan-500/50 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/10 disabled:opacity-50"
          >
            {testing ? "Enviando..." : "Testar template"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
    </section>
  );
}


type PlatformSettingsTabProps = {
  subTab?: SettingsSubTab;
  onSubTabChange?: (tab: SettingsSubTab) => void;
};

export function PlatformSettingsTab({ subTab: controlledSubTab, onSubTabChange }: PlatformSettingsTabProps = {}) {
  const [internalSubTab, setInternalSubTab] = useState<SettingsSubTab>("rules");
  const { canTab } = usePermissions();

  // Filtra sub-abas pelas permissões do role ativo
  const visibleSubTabs = useMemo(
    () => SUB_TABS.filter((t) => canTab(SETTINGS_SUB_TAB_KEY[t.id] as AdminTabKey)),
    [canTab],
  );

  const subTab = controlledSubTab ?? internalSubTab;
  // Se a sub-aba ativa não está mais visível, redireciona para a primeira visível
  const activeSubTab: SettingsSubTab =
    visibleSubTabs.some((t) => t.id === subTab)
      ? subTab
      : (visibleSubTabs[0]?.id ?? "rules");

  const openedSubTabs = useOpenedTabs(activeSubTab);

  function changeSubTab(next: SettingsSubTab) {
    if (onSubTabChange) {
      onSubTabChange(next);
      return;
    }
    setInternalSubTab(next);
  }

  return (
    <div className="w-full space-y-4">
      <Tabs items={visibleSubTabs} value={activeSubTab} onChange={changeSubTab} ariaLabel="Configurações da plataforma" accent="cyan" />

      {openedSubTabs.has("email") ? (
        <div hidden={activeSubTab !== "email"} className="space-y-4">
          <EmailSettingsPanel />
          <EmailBrandSettingsPanel />
          <EmailNotificationRulesPanel />
        </div>
      ) : null}
      {openedSubTabs.has("brand") ? (
        <div hidden={activeSubTab !== "brand"}>
          <AppearanceSettingsPanel />
        </div>
      ) : null}
      {openedSubTabs.has("rules") ? (
        <div hidden={activeSubTab !== "rules"}>
          <ScheduleRulesPanel />
        </div>
      ) : null}
      {openedSubTabs.has("badges") ? (
        <div hidden={activeSubTab !== "badges"}>
          <RewardsEditor
            kind="badge"
            title="Badges da evolução"
            subtitle="Configure recompensas globais do aluno, exibidas na aba Evolução."
          />
        </div>
      ) : null}
      {openedSubTabs.has("tracks") ? (
        <div hidden={activeSubTab !== "tracks"}>
          <TrainingTracksTab />
        </div>
      ) : null}
      {openedSubTabs.has("exercises") ? (
        <div hidden={activeSubTab !== "exercises"}>
          <TrainingExercisesTab />
        </div>
      ) : null}
      {openedSubTabs.has("financeiro") ? (
        <div hidden={activeSubTab !== "financeiro"} className="space-y-4">
          <SchoolCostsPanel />
          <SchoolProductsPanel />
        </div>
      ) : null}
      {openedSubTabs.has("roles") ? (
        <div hidden={activeSubTab !== "roles"}>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-slate-800/50" />}>
            <RolesSettingsTab />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
