import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";
import {
  getEmailBrandSettings,
  getEmailSettings,
  saveEmailBrandSettings,
  saveEmailSettings,
  sendTestEmail,
} from "../../lib/notificationsDb";
import type {
  EmailBrandSettings,
  EmailBrandSettingsInput,
  EmailSettings,
  EmailSettingsInput,
  EmailTemplateType,
} from "../../types/notification";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type SettingsSubTab = "email" | "brand";

const SUB_TABS: Array<{ id: SettingsSubTab; label: string; description: string; icon: ReactNode }> = [
  {
    id: "email",
    label: "Email",
    description: "Remetente, chave Resend e envio de teste",
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
    description: "Logo, cores e rodapé dos emails",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11.5A2.5 2.5 0 004.5 18h11A2.5 2.5 0 0018 15.5V4a2 2 0 00-2-2H4zm0 2h12v7.5l-2.4-2.4a1 1 0 00-1.414 0L9 12.286 7.314 10.6a1 1 0 00-1.414 0L4 12.5V4zm10 2.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clipRule="evenodd" />
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
  schoolName: "Garmin Flight Viewer",
  logoUrl: "",
  logoFileId: null,
  primaryColor: "#0ea5e9",
  accentColor: "#10b981",
  appUrl: typeof window !== "undefined" ? window.location.origin : "",
  supportEmail: "",
  footerText: "Este é um email automático da plataforma.",
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

export function PlatformSettingsTab() {
  const [subTab, setSubTab] = useState<SettingsSubTab>("email");
  const active = SUB_TABS.find((tab) => tab.id === subTab)!;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="flex flex-wrap justify-start gap-2">
          {SUB_TABS.map((tab) => {
            const isActive = tab.id === subTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-cyan-500/40 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{active.description}</p>
      </section>

      {subTab === "email" ? <EmailSettingsPanel /> : null}
      {subTab === "brand" ? <BrandSettingsPanel /> : null}
    </div>
  );
}
