import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";
import {
  getEmailBrandSettings,
  getEmailSettings,
  saveEmailBrandSettings,
  saveEmailSettings,
  sendTestEmail,
} from "../../lib/notificationsDb";
import { getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import type {
  EmailBrandSettings,
  EmailBrandSettingsInput,
  EmailSettings,
  EmailSettingsInput,
  EmailTemplateType,
} from "../../types/notification";
import {
  DEFAULT_SCHOOL_RULES,
  EMAIL_NOTIFICATION_EVENT_OPTIONS,
  SCHOOL_FONT_OPTIONS,
  STUDENT_PORTAL_TAB_OPTIONS,
  type SchoolRules,
  type SchoolRulesInput,
} from "../../types/schoolRules";
import { applySchoolTheme } from "../../lib/schoolRulesDb";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";
import { TrainingTracksTab } from "./TrainingTracksTab";
import { TrainingExercisesTab } from "./TrainingExercisesTab";
import { NoticesTab } from "./NoticesTab";
import { RewardsEditor } from "./RewardsEditor";
import { useOpenedTabs } from "../../lib/routedTabs";

export type SettingsSubTab = "email" | "brand" | "rules" | "badges" | "tracks" | "exercises" | "notices";

const SUB_TABS: Array<{ id: SettingsSubTab; label: string; icon: ReactNode }> = [
  {
    id: "email",
    label: "Email",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4a2 2 0 00-2 2v.217l9 4.5 9-4.5V6a2 2 0 00-2-2H3z" />
        <path d="M19 8.383l-8.553 4.276a1 1 0 01-.894 0L1 8.383V14a2 2 0 002 2h14a2 2 0 002-2V8.383z" />
      </svg>
    ),
  },
  {
    id: "brand",
    label: "Aparência",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11.5A2.5 2.5 0 004.5 18h11A2.5 2.5 0 0018 15.5V4a2 2 0 00-2-2H4zm0 2h12v7.5l-2.4-2.4a1 1 0 00-1.414 0L9 12.286 7.314 10.6a1 1 0 00-1.414 0L4 12.5V4zm10 2.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clipRule="evenodd" />
      </svg>
    ),
  },
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
    id: "badges",
    label: "Badges",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2.5l2.25 4.56 5.03.73-3.64 3.55.86 5.01L10 13.98l-4.5 2.37.86-5.01-3.64-3.55 5.03-.73L10 2.5z" />
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
    id: "exercises",
    label: "Exercícios",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18h11a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0015.5 2h-11zM6 6.75A.75.75 0 016.75 6h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 016 6.75zM6.75 9.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM6 13.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "notices",
    label: "Avisos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M1.5 8.67c0-1.213.84-2.266 2.024-2.49l13.5-2.56a2.25 2.25 0 012.669 2.21v12.34a2.25 2.25 0 01-2.67 2.21l-13.5-2.56A2.532 2.532 0 011.5 15.33V8.67z" />
        <path d="M20.25 8.99a.75.75 0 011.5 0v5.02a.75.75 0 01-1.5 0V8.99z" />
      </svg>
    ),
  },
];

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

const emptyBrandForm: EmailBrandSettingsInput = {
  schoolName: "",
  logoUrl: "",
  logoFileId: null,
  primaryColor: "#0ea5e9",
  accentColor: "#10b981",
  appUrl: typeof window !== "undefined" ? window.location.origin : "",
  supportEmail: "",
  footerText: "Este é um email automático da plataforma.",
  faviconUrl: "",
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

function toBrandForm(settings: EmailBrandSettings): EmailBrandSettingsInput {
  return {
    schoolName: settings.schoolName,
    logoUrl: settings.logoUrl,
    logoFileId: settings.logoFileId,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    appUrl: settings.appUrl || (typeof window !== "undefined" ? window.location.origin : ""),
    supportEmail: settings.supportEmail,
    footerText: settings.footerText,
    faviconUrl: settings.faviconUrl ?? "",
  };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Nunca salvo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toRulesForm(settings: SchoolRules): SchoolRulesInput {
  return {
    studentTabs: { ...settings.studentTabs },
    theme: { ...settings.theme },
    schedule: { ...settings.schedule },
    emailNotifications: Object.fromEntries(
      EMAIL_NOTIFICATION_EVENT_OPTIONS.map((item) => [
        item.id,
        { ...settings.emailNotifications[item.id] },
      ]),
    ) as SchoolRulesInput["emailNotifications"],
  };
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

function BrandSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<EmailBrandSettings | null>(null);
  const [form, setForm] = useState<EmailBrandSettingsInput>(emptyBrandForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getEmailBrandSettings();
      setSettings(next);
      setForm(toBrandForm(next));
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

  async function uploadLogoIfNeeded(): Promise<Pick<EmailBrandSettingsInput, "logoUrl" | "logoFileId">> {
    if (!logoFile) return { logoUrl: form.logoUrl ?? "", logoFileId: form.logoFileId ?? null };
    const bucketId = NOTICES_BUCKET_ID ?? BUCKET_ID;
    if (!storage || !bucketId) throw new Error("Storage de logos não configurado.");
    const uploaded = await storage.createFile(bucketId, ID.unique(), logoFile, [Permission.read(Role.any())]);
    return {
      logoFileId: uploaded.$id,
      logoUrl: storage.getFileView(bucketId, uploaded.$id).toString(),
    };
  }

  async function handleSave() {
    if (!/^https?:\/\//i.test(String(form.appUrl ?? ""))) {
      setError("Informe a URL completa da plataforma, começando com http:// ou https://.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const logo = await uploadLogoIfNeeded();
      const saved = await saveEmailBrandSettings({
        ...form,
        ...logo,
      });
      setSettings(saved);
      setForm(toBrandForm(saved));
      setLogoFile(null);
      showToast({ variant: "success", message: "Aparência dos emails salva." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Aparência dos emails</h3>
          <p className="mt-1 text-xs text-slate-500">
            Personalize logo, cores, CTA e rodapé usados nos emails transacionais.
          </p>
        </div>
        <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-slate-400">
          Nome da escola
          <input
            type="text"
            value={form.schoolName}
            onChange={(e) => setForm((prev) => ({ ...prev, schoolName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          URL da plataforma
          <input
            type="url"
            value={form.appUrl ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, appUrl: e.target.value }))}
            placeholder="https://app.suaescola.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">Logo da escola</label>
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex min-h-28 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo atual" className="max-h-20 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Sem logo</span>
              )}
            </div>
            <div className="space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-200"
              />
              <input
                type="url"
                value={form.logoUrl ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, logoUrl: e.target.value, logoFileId: null }))}
                placeholder="Ou cole uma URL pública da logo"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <p className="text-[11px] text-slate-600">
                Para maior compatibilidade em clientes de email, prefira uma URL pública ou um bucket com leitura pública.
              </p>
            </div>
          </div>
        </div>

        <label className="text-xs text-slate-400">
          Cor principal
          <div className="mt-1 flex gap-2">
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
              className="h-10 w-14 rounded border border-slate-700 bg-slate-800"
            />
            <input
              type="text"
              value={form.primaryColor}
              onChange={(e) => setForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </div>
        </label>

        <label className="text-xs text-slate-400">
          Cor de destaque
          <div className="mt-1 flex gap-2">
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              className="h-10 w-14 rounded border border-slate-700 bg-slate-800"
            />
            <input
              type="text"
              value={form.accentColor}
              onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </div>
        </label>

        <label className="text-xs text-slate-400">
          Email de suporte
          <input
            type="email"
            value={form.supportEmail ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, supportEmail: e.target.value }))}
            placeholder="suporte@suaescola.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="text-xs text-slate-400">
          Texto do rodapé
          <input
            type="text"
            value={form.footerText ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, footerText: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <div className="text-xs text-slate-400 md:col-span-2">
          <label className="block">
            URL do favicon
            <div className="mt-1 flex items-center gap-3">
              {form.faviconUrl ? (
                <img src={form.faviconUrl} alt="Favicon" className="h-8 w-8 rounded object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-[10px] text-slate-400">ico</div>
              )}
              <input
                type="url"
                value={form.faviconUrl ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, faviconUrl: e.target.value }))}
                placeholder="https://suaescola.com/favicon.ico"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-600">URL pública de um arquivo .ico, .png ou .svg para o ícone da aba do navegador.</p>
          </label>
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar aparência"}
        </button>
      </div>
    </section>
  );
}

function RulesSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SchoolRules | null>(null);
  const [form, setForm] = useState<SchoolRulesInput>(toRulesForm(DEFAULT_SCHOOL_RULES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSchoolRules();
      setSettings(next);
      setForm(toRulesForm(next));
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
    if (form.schedule.minRequestHours <= 0 || form.schedule.maxRequestHours <= 0) {
      setError("As horas mínima e máxima precisam ser maiores que zero.");
      return;
    }
    if (form.schedule.minRequestHours > form.schedule.maxRequestHours) {
      setError("A hora mínima não pode ser maior que a máxima.");
      return;
    }
    if (!Object.values(form.studentTabs).some(Boolean)) {
      setError("Mantenha ao menos uma aba disponível para os alunos.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await saveSchoolRules(form);
      setSettings(saved);
      setForm(toRulesForm(saved));
      applySchoolTheme(saved); // apply font + colorMode immediately
      showToast({ variant: "success", message: "Regras da escola salvas." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Regras gerais</h3>
            <p className="mt-1 text-xs text-slate-500">
              Escolha quais áreas aparecem para alunos e personalize as cores principais da plataforma.
            </p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Abas disponíveis para alunos</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {STUDENT_PORTAL_TAB_OPTIONS.map((tab) => (
                  <label
                    key={tab.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={form.studentTabs[tab.id]}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          studentTabs: { ...prev.studentTabs, [tab.id]: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 accent-emerald-500"
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cores da plataforma</p>
              <p className="mt-1 text-[11px] text-slate-600">
                Fundo e cards são definidos automaticamente pelo modo de cor escolhido abaixo.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["primaryColor", "Cor principal"],
                    ["accentColor", "Cor de destaque"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <label key={key} className="text-xs text-slate-400">
                    {label}
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={String(form.theme[key as keyof SchoolRulesInput["theme"]] ?? "")}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, [key]: e.target.value },
                          }))
                        }
                        className="h-10 w-14 rounded border border-slate-700 bg-slate-800"
                      />
                      <input
                        type="text"
                        value={String(form.theme[key as keyof SchoolRulesInput["theme"]] ?? "")}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, [key]: e.target.value },
                          }))
                        }
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fonte e modo de cor</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Fonte da plataforma
                  <select
                    value={form.theme.fontFamily ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, theme: { ...prev.theme, fontFamily: e.target.value } }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {SCHOOL_FONT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {form.theme.fontFamily ? (
                    <p
                      className="mt-1 text-xs text-slate-400"
                      style={{ fontFamily: `'${form.theme.fontFamily}', system-ui` }}
                    >
                      Preview: O piloto voou sobre as montanhas.
                    </p>
                  ) : null}
                </label>

                <label className="text-xs text-slate-400">
                  Modo de cor
                  <div className="mt-1 flex gap-2">
                    {(["dark", "light"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, theme: { ...prev.theme, colorMode: mode } }))
                        }
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                          form.theme.colorMode === mode
                            ? "border-cyan-500 bg-cyan-600/20 text-cyan-300"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {mode === "dark" ? "🌙 Escuro" : "☀️ Claro"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    O modo claro inverte automaticamente os tons de interface.
                  </p>
                </label>
              </div>
            </div>
          </div>

          {(() => {
            const isLight = form.theme.colorMode === "light";
            const previewBg = isLight ? "#f8fafc" : "#020617";
            const previewPanel = isLight ? "#ffffff" : "#0f172a";
            const previewText = isLight ? "#0f172a" : "#e2e8f0";
            const previewMuted = isLight ? "#475569" : "#94a3b8";
            return (
              <div
                className="rounded-2xl border p-4"
                style={{ background: previewBg, borderColor: form.theme.primaryColor, color: previewText }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: form.theme.accentColor }}>
                  Preview do aluno
                </p>
                <div className="mt-3 rounded-xl p-3" style={{ background: previewPanel }}>
                  <div className="mb-3 h-2 w-20 rounded-full" style={{ background: form.theme.primaryColor }} />
                  <p className="text-sm font-semibold" style={{ color: previewText }}>Portal do aluno</p>
                  <p className="mt-1 text-xs" style={{ color: previewMuted }}>
                    Navegação, cards e ações principais usarão essas cores.
                  </p>
                  <button
                    type="button"
                    className="mt-4 rounded-lg px-4 py-2 text-xs font-semibold"
                    style={{ background: form.theme.primaryColor, color: "#ffffff" }}
                  >
                    Enviar planejamento
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Escala de voo</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Mínimo de horas por solicitação
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={form.schedule.minRequestHours}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, minRequestHours: Number(e.target.value) },
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            Máximo de horas por solicitação
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={form.schedule.maxRequestHours}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, maxRequestHours: Number(e.target.value) },
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={form.schedule.allowStudentFlightIntentions}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, allowStudentFlightIntentions: e.target.checked },
                }))
              }
              className="h-4 w-4 accent-emerald-500"
            />
            Permitir o aluno fazer solicitação de intenção de voo
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={form.schedule.requireCreditsForIntentions}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, requireCreditsForIntentions: e.target.checked },
                }))
              }
              className="h-4 w-4 accent-emerald-500"
            />
            Aluno só consegue solicitar intenções condizentes com seus créditos
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-indigo-700/40 bg-indigo-950/20 p-3 text-sm text-slate-200 md:col-span-2">
            <input
              type="checkbox"
              checked={form.schedule.allowNightFlights}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, allowNightFlights: e.target.checked },
                }))
              }
              className="h-4 w-4 accent-indigo-500"
            />
            Permitir voos noturnos
          </label>
          {form.schedule.allowNightFlights && (
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Início do voo noturno (hora base)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                step={1}
                value={form.schedule.nightFlightStartHour}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    schedule: { ...prev.schedule, nightFlightStartHour: Number(e.target.value) },
                  }))
                }
                className="w-32 rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                placeholder="18"
              />
              <p className="mt-1 text-xs text-slate-500">
                Voos noturnos serão agendados a partir desta hora (ex: 18 = 18:00).
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Emails</h3>
        <p className="mt-1 text-xs text-slate-500">
          Ative ou desative notificações por email e adicione um aviso curto ao template de cada evento.
        </p>
        <div className="mt-4 space-y-3">
          {EMAIL_NOTIFICATION_EVENT_OPTIONS.map((event) => {
            const current = form.emailNotifications[event.id];
            return (
              <div key={event.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
                  <input
                    type="checkbox"
                    checked={current.enabled}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        emailNotifications: {
                          ...prev.emailNotifications,
                          [event.id]: { ...prev.emailNotifications[event.id], enabled: e.target.checked },
                        },
                      }))
                    }
                    className="h-4 w-4 accent-emerald-500"
                  />
                  {event.label}
                </label>
                <textarea
                  value={current.customNotice}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      emailNotifications: {
                        ...prev.emailNotifications,
                        [event.id]: { ...prev.emailNotifications[event.id], customNotice: e.target.value },
                      },
                    }))
                  }
                  maxLength={500}
                  rows={2}
                  placeholder="Aviso opcional exibido no email deste evento."
                  className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar regras"}
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
  const [internalSubTab, setInternalSubTab] = useState<SettingsSubTab>("email");
  const subTab = controlledSubTab ?? internalSubTab;
  const openedSubTabs = useOpenedTabs(subTab);

  function changeSubTab(next: SettingsSubTab) {
    if (onSubTabChange) {
      onSubTabChange(next);
      return;
    }
    setInternalSubTab(next);
  }

  return (
    <div className="w-full space-y-4">
      <Tabs items={SUB_TABS} value={subTab} onChange={changeSubTab} ariaLabel="Configurações da plataforma" accent="cyan" />

      {openedSubTabs.has("email") ? (
        <div hidden={subTab !== "email"}>
          <EmailSettingsPanel />
        </div>
      ) : null}
      {openedSubTabs.has("brand") ? (
        <div hidden={subTab !== "brand"}>
          <BrandSettingsPanel />
        </div>
      ) : null}
      {openedSubTabs.has("rules") ? (
        <div hidden={subTab !== "rules"}>
          <RulesSettingsPanel />
        </div>
      ) : null}
      {openedSubTabs.has("badges") ? (
        <div hidden={subTab !== "badges"}>
          <RewardsEditor
            kind="badge"
            title="Badges da evolução"
            subtitle="Configure recompensas globais do aluno, exibidas na aba Evolução."
          />
        </div>
      ) : null}
      {openedSubTabs.has("tracks") ? (
        <div hidden={subTab !== "tracks"}>
          <TrainingTracksTab />
        </div>
      ) : null}
      {openedSubTabs.has("exercises") ? (
        <div hidden={subTab !== "exercises"}>
          <TrainingExercisesTab />
        </div>
      ) : null}
      {openedSubTabs.has("notices") ? (
        <div hidden={subTab !== "notices"}>
          <NoticesTab />
        </div>
      ) : null}
    </div>
  );
}
