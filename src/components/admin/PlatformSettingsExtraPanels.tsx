import { useCallback, useEffect, useState } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";
import { getEmailBrandSettings, saveEmailBrandSettings } from "../../lib/notificationsDb";
import { applySchoolTheme, getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import type { EmailBrandSettings, EmailBrandSettingsInput } from "../../types/notification";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  DEFAULT_SCHOOL_RULES,
  EMAIL_NOTIFICATION_EVENT_OPTIONS,
  SCHOOL_FONT_OPTIONS,
  type SchoolRules,
  type SchoolRulesInput,
} from "../../types/schoolRules";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const defaultBrandForm: EmailBrandSettingsInput = {
  schoolName: "",
  logoUrl: "",
  logoFileId: null,
  primaryColor: "#0ea5e9",
  accentColor: "#10b981",
  appUrl: "",
  supportEmail: "",
  footerText: "Este é um email automático da plataforma.",
  faviconUrl: "",
};

function toBrandForm(settings: EmailBrandSettings): EmailBrandSettingsInput {
  return {
    schoolName: settings.schoolName,
    logoUrl: settings.logoUrl,
    logoFileId: settings.logoFileId,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    appUrl: settings.appUrl || "",
    supportEmail: settings.supportEmail,
    footerText: settings.footerText,
    faviconUrl: settings.faviconUrl ?? "",
  };
}

function toRulesForm(settings: SchoolRules): SchoolRulesInput {
  return {
    studentTabs: { ...settings.studentTabs },
    theme: { ...settings.theme },
    schedule: { ...settings.schedule },
    scheduleStudentHelp: { ...settings.scheduleStudentHelp },
    flightReviewClub: { ...settings.flightReviewClub },
    emailNotifications: Object.fromEntries(
      EMAIL_NOTIFICATION_EVENT_OPTIONS.map((item) => [item.id, { ...settings.emailNotifications[item.id] }]),
    ) as SchoolRulesInput["emailNotifications"],
  };
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Nunca salvo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function SettingsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <Skeleton className="h-5 w-48" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

async function uploadPublicAsset(file: File, label: string): Promise<string> {
  const bucketId = NOTICES_BUCKET_ID ?? BUCKET_ID;
  if (!storage || !bucketId) throw new Error(`${label} não configurado.`);
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  return storage.getFileView(bucketId, uploaded.$id).toString();
}

export function AppearanceSettingsPanel() {
  const { showToast } = useToast();
  const [brandForm, setBrandForm] = useState<EmailBrandSettingsInput>(defaultBrandForm);
  const [rulesForm, setRulesForm] = useState<SchoolRulesInput>(toRulesForm(DEFAULT_SCHOOL_RULES));
  const [brandUpdatedAt, setBrandUpdatedAt] = useState<string | null>(null);
  const [rulesUpdatedAt, setRulesUpdatedAt] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brand, rules] = await Promise.all([getEmailBrandSettings(), getSchoolRules()]);
      setBrandForm(toBrandForm(brand));
      setRulesForm(toRulesForm(rules));
      setBrandUpdatedAt(brand.updatedAt);
      setRulesUpdatedAt(rules.updatedAt);
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
    if (!/^https?:\/\//i.test(String(brandForm.appUrl ?? ""))) {
      setError("Informe a URL completa da plataforma, começando com http:// ou https://.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const logoUrl = logoFile ? await uploadPublicAsset(logoFile, "Storage de logos") : brandForm.logoUrl ?? "";
      const faviconUrl = faviconFile ? await uploadPublicAsset(faviconFile, "Storage de favicon") : brandForm.faviconUrl ?? null;
      const [currentBrand, currentRules] = await Promise.all([getEmailBrandSettings(), getSchoolRules()]);
      const savedBrand = await saveEmailBrandSettings({
        ...toBrandForm(currentBrand),
        schoolName: brandForm.schoolName,
        appUrl: brandForm.appUrl,
        logoUrl,
        logoFileId: logoFile ? null : brandForm.logoFileId ?? null,
        faviconUrl,
      });
      const savedRules = await saveSchoolRules({
        ...toRulesForm(currentRules),
        studentTabs: rulesForm.studentTabs,
        theme: rulesForm.theme,
      });
      setBrandForm(toBrandForm(savedBrand));
      setRulesForm(toRulesForm(savedRules));
      setBrandUpdatedAt(savedBrand.updatedAt);
      setRulesUpdatedAt(savedRules.updatedAt);
      setLogoFile(null);
      setFaviconFile(null);
      applySchoolTheme(savedRules, { schoolName: savedBrand.schoolName, faviconUrl: savedBrand.faviconUrl });
      showToast({ variant: "success", message: "Aparência da plataforma salva." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettingsSkeleton rows={8} />;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Identidade da plataforma</h3>
            <p className="mt-1 text-xs text-slate-500">Nome exibido, endereço do app e favicon por upload.</p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(brandUpdatedAt)}
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Nome da escola
            <input
              type="text"
              value={brandForm.schoolName}
              onChange={(e) => setBrandForm((prev) => ({ ...prev, schoolName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-xs text-slate-400">
            URL da plataforma
            <input
              type="url"
              value={brandForm.appUrl ?? ""}
              onChange={(e) => setBrandForm((prev) => ({ ...prev, appUrl: e.target.value }))}
              placeholder="https://app.suaescola.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Logo</label>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="flex min-h-28 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                {brandForm.logoUrl ? (
                  <img src={brandForm.logoUrl} alt="Logo atual" className="max-h-20 max-w-full object-contain" />
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
                  value={brandForm.logoUrl ?? ""}
                  onChange={(e) => setBrandForm((prev) => ({ ...prev, logoUrl: e.target.value, logoFileId: null }))}
                  placeholder="Ou cole uma URL pública da logo"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 md:col-span-2">
            <label className="block">
              Favicon
              <div className="mt-1 grid gap-3 md:grid-cols-[64px_minmax(0,1fr)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/50">
                  {brandForm.faviconUrl ? (
                    <img src={brandForm.faviconUrl} alt="Favicon" className="h-8 w-8 rounded object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-500">ico</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                  onChange={(e) => setFaviconFile(e.target.files?.[0] ?? null)}
                  className="w-full self-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-200"
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Portal do aluno</h3>
            <p className="mt-1 text-xs text-slate-500">Fonte, modo e duas cores principais da interface. Abas são configuradas em Roles.</p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(rulesUpdatedAt)}
          </p>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cores da plataforma</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["primaryColor", "Cor principal"],
                    ["accentColor", "Cor de destaque"],
                  ] as [keyof SchoolRulesInput["theme"], string][]
                ).map(([key, label]) => (
                  <label key={key} className="text-xs text-slate-400">
                    {label}
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={String(rulesForm.theme[key] ?? "#000000")}
                        onChange={(e) => setRulesForm((prev) => ({ ...prev, theme: { ...prev.theme, [key]: e.target.value } }))}
                        className="h-10 w-14 rounded border border-slate-700 bg-slate-800"
                      />
                      <input
                        type="text"
                        value={String(rulesForm.theme[key] ?? "")}
                        onChange={(e) => setRulesForm((prev) => ({ ...prev, theme: { ...prev.theme, [key]: e.target.value } }))}
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
                    value={rulesForm.theme.fontFamily ?? ""}
                    onChange={(e) => setRulesForm((prev) => ({ ...prev, theme: { ...prev.theme, fontFamily: e.target.value } }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {SCHOOL_FONT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Modo de cor
                  <div className="mt-1 flex gap-2">
                    {(["dark", "light"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setRulesForm((prev) => ({ ...prev, theme: { ...prev.theme, colorMode: mode } }))}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                          rulesForm.theme.colorMode === mode
                            ? "border-cyan-500 bg-cyan-600/20 text-cyan-300"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {mode === "dark" ? "Escuro" : "Claro"}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>
          </div>
          {(() => {
            const isLight = rulesForm.theme.colorMode === "light";
            const previewBg = isLight ? "#f8fafc" : "#020617";
            const previewPanel = isLight ? "#ffffff" : "#0f172a";
            const previewText = isLight ? "#0f172a" : "#e2e8f0";
            const previewMuted = isLight ? "#475569" : "#94a3b8";
            return (
              <div className="rounded-2xl border p-4" style={{ background: previewBg, borderColor: rulesForm.theme.primaryColor, color: previewText }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: rulesForm.theme.accentColor }}>Preview do aluno</p>
                <div className="mt-3 rounded-xl p-3" style={{ background: previewPanel }}>
                  <div className="mb-3 h-2 w-20 rounded-full" style={{ background: rulesForm.theme.primaryColor }} />
                  <p className="text-sm font-semibold" style={{ color: previewText }}>Portal do aluno</p>
                  <p className="mt-1 text-xs" style={{ color: previewMuted }}>Navegação, cards e ações principais usarão essas cores.</p>
                  <button type="button" className="mt-4 rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: rulesForm.theme.primaryColor, color: "#ffffff" }}>
                    Enviar planejamento
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => void handleSave()} disabled={saving || loading} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar aparência"}
        </button>
      </div>
    </section>
  );
}

export function ScheduleRulesPanel() {
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
    setSaving(true);
    setError(null);
    try {
      const current = await getSchoolRules();
      const saved = await saveSchoolRules({ ...toRulesForm(current), schedule: form.schedule });
      setSettings(saved);
      setForm(toRulesForm(saved));
      showToast({ variant: "success", message: "Regras da escola salvas." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettingsSkeleton rows={4} />;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Escala de voo</h3>
            <p className="mt-1 text-xs text-slate-500">Regras operacionais para solicitações de intenção de voo.</p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Mínimo de horas por solicitação
            <input type="number" min={0.5} step={0.5} value={form.schedule.minRequestHours} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, minRequestHours: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="text-xs text-slate-400">
            Máximo de horas por solicitação
            <input type="number" min={0.5} step={0.5} value={form.schedule.maxRequestHours} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, maxRequestHours: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
            <input type="checkbox" checked={form.schedule.allowStudentFlightIntentions} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, allowStudentFlightIntentions: e.target.checked } }))} className="h-4 w-4 accent-emerald-500" />
            Permitir o aluno fazer solicitação de intenção de voo
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
            <input type="checkbox" checked={form.schedule.requireCreditsForIntentions} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, requireCreditsForIntentions: e.target.checked } }))} className="h-4 w-4 accent-emerald-500" />
            Aluno só consegue solicitar intenções condizentes com seus créditos
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-indigo-700/40 bg-indigo-950/20 p-3 text-sm text-slate-200 md:col-span-2">
            <input type="checkbox" checked={form.schedule.allowNightFlights} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, allowNightFlights: e.target.checked } }))} className="h-4 w-4 accent-indigo-500" />
            Permitir voos noturnos
          </label>
          {form.schedule.allowNightFlights && (
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-400">Início do voo noturno (hora base)</label>
              <input type="number" min={0} max={23} step={1} value={form.schedule.nightFlightStartHour} onChange={(e) => setForm((prev) => ({ ...prev, schedule: { ...prev.schedule, nightFlightStartHour: Number(e.target.value) } }))} className="w-32 rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none" placeholder="18" />
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar regras"}
        </button>
      </div>
    </section>
  );
}

export function EmailNotificationRulesPanel() {
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
    setSaving(true);
    setError(null);
    try {
      const current = await getSchoolRules();
      const saved = await saveSchoolRules({ ...toRulesForm(current), emailNotifications: form.emailNotifications });
      setSettings(saved);
      setForm(toRulesForm(saved));
      showToast({ variant: "success", message: "Regras de email salvas." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettingsSkeleton rows={5} />;

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Eventos de e-mail</h3>
          <p className="mt-1 text-xs text-slate-500">Ative ou desative notificações por evento e defina avisos curtos nos templates.</p>
        </div>
        <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {EMAIL_NOTIFICATION_EVENT_OPTIONS.map((event) => {
          const current = form.emailNotifications[event.id];
          return (
            <div key={event.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <input type="checkbox" checked={current.enabled} onChange={(e) => setForm((prev) => ({ ...prev, emailNotifications: { ...prev.emailNotifications, [event.id]: { ...prev.emailNotifications[event.id], enabled: e.target.checked } } }))} className="h-4 w-4 accent-emerald-500" />
                {event.label}
              </label>
              <textarea value={current.customNotice} onChange={(e) => setForm((prev) => ({ ...prev, emailNotifications: { ...prev.emailNotifications, [event.id]: { ...prev.emailNotifications[event.id], customNotice: e.target.value } } }))} maxLength={500} rows={2} placeholder="Aviso opcional exibido no email deste evento." className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar eventos"}
        </button>
      </div>
    </section>
  );
}

export function EmailBrandSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<EmailBrandSettings | null>(null);
  const [form, setForm] = useState<EmailBrandSettingsInput>(defaultBrandForm);
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

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveEmailBrandSettings(form);
      setSettings(saved);
      setForm(toBrandForm(saved));
      showToast({ variant: "success", message: "Aparência dos emails salva." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettingsSkeleton />;

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Template dos e-mails</h3>
          <p className="mt-1 text-xs text-slate-500">Duas cores, contato de suporte e rodap? usados nos emails.</p>
        </div>
        <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {(
          [
            ["primaryColor", "Cor principal do email"],
            ["accentColor", "Cor de destaque do email"],
          ] as [keyof EmailBrandSettingsInput, string][]
        ).map(([key, label]) => (
          <label key={key} className="text-xs text-slate-400">
            {label}
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={String(form[key] ?? "#000000")}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-10 w-14 rounded border border-slate-700 bg-slate-800"
              />
              <input
                type="text"
                value={String(form[key] ?? "")}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
          </label>
        ))}

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
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar template"}
        </button>
      </div>
    </section>
  );
}

export function FlightReviewClubPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SchoolRules | null>(null);
  const [form, setForm] = useState<SchoolRulesInput>(toRulesForm(DEFAULT_SCHOOL_RULES));
  const [newBenefit, setNewBenefit] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const club = form.flightReviewClub ?? DEFAULT_FLIGHT_REVIEW_CLUB_RULES;

  const setClub = (patch: Partial<typeof club>) =>
    setForm((prev) => ({ ...prev, flightReviewClub: { ...(prev.flightReviewClub ?? DEFAULT_FLIGHT_REVIEW_CLUB_RULES), ...patch } }));

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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (error) showToast({ variant: "error", message: error }); }, [error, showToast]);

  async function handleSave() {
    if (club.enabled && club.landingPageType === "external_url" && !club.externalUrl.trim()) {
      setError("Informe o link externo da Landing Page do Flight Review Club.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const current = await getSchoolRules();
      const saved = await saveSchoolRules({ ...toRulesForm(current), flightReviewClub: club });
      setSettings(saved);
      setForm(toRulesForm(saved));
      showToast({ variant: "success", message: "Configurações do Flight Review Club salvas." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addBenefit() {
    const trimmed = newBenefit.trim();
    if (!trimmed || club.benefits.length >= 20) return;
    setClub({ benefits: [...club.benefits, trimmed] });
    setNewBenefit("");
  }

  function removeBenefit(index: number) {
    setClub({ benefits: club.benefits.filter((_, i) => i !== index) });
  }

  if (loading) return <SettingsSkeleton rows={4} />;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Flight Review Club</h3>
            <p className="mt-1 text-xs text-slate-500">Módulo opcional para acesso exclusivo a telemetria, vídeos e análises de voo.</p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
            <input type="checkbox" checked={club.enabled} onChange={(e) => setClub({ enabled: e.target.checked })} className="h-4 w-4 accent-sky-500" />
            Ativar Flight Review Club
          </label>

          {club.enabled && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Tipo de Landing Page
                  <select
                    value={club.landingPageType}
                    onChange={(e) => setClub({ landingPageType: e.target.value as "internal_public_page" | "external_url" })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  >
                    <option value="internal_public_page">Página pública interna (/flight-review-club)</option>
                    <option value="external_url">URL externa</option>
                  </select>
                </label>

                {club.landingPageType === "external_url" && (
                  <label className="text-xs text-slate-400">
                    Link externo da Landing Page
                    <input
                      type="url"
                      value={club.externalUrl}
                      onChange={(e) => setClub({ externalUrl: e.target.value })}
                      placeholder="https://suaescola.com/clube"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                )}
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={club.showInStudentMenu} onChange={(e) => setClub({ showInStudentMenu: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                Mostrar no menu lateral do aluno (abre a LP em nova aba)
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Link do CTA de assinatura (botão da página interna)
                  <input
                    type="url"
                    value={club.ctaSubscriptionUrl}
                    onChange={(e) => setClub({ ctaSubscriptionUrl: e.target.value })}
                    placeholder="https://suaescola.com/assinar"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Voos de trial (0 = desativado)
                  <p className="mt-0.5 text-[11px] text-slate-500">Primeiros N voos da trilha liberados sem membership.</p>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={1}
                    value={club.trialFlightCount}
                    onChange={(e) => setClub({ trialFlightCount: Math.max(0, Math.round(Number(e.target.value))) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </label>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Benefícios (moldam a página interna)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Até 20 itens. Se vazio, serão exibidos benefícios padrão.</p>
                <div className="mt-2 space-y-2">
                  {club.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm text-slate-200">{benefit}</span>
                      <button
                        type="button"
                        onClick={() => removeBenefit(index)}
                        className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Remover benefício"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {club.benefits.length < 20 && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newBenefit}
                      onChange={(e) => setNewBenefit(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBenefit(); } }}
                      placeholder="Adicionar benefício..."
                      maxLength={500}
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={addBenefit}
                      disabled={!newBenefit.trim()}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
                    >
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar Flight Review Club"}
        </button>
      </div>
    </section>
  );
}
