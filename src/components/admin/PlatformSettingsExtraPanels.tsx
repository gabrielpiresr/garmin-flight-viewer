import { useCallback, useEffect, useState } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";
import { getEmailBrandSettings, saveEmailBrandSettings } from "../../lib/notificationsDb";
import { applySchoolTheme, getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import { listTrainingTracks } from "../../lib/trainingTracksDb";
import type { EmailBrandSettings, EmailBrandSettingsInput } from "../../types/notification";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  DEFAULT_SCHOOL_RULES,
  DEFAULT_SOLO_FLIGHT_RULES,
  EMAIL_NOTIFICATION_EVENT_OPTIONS,
  SCHOOL_FONT_OPTIONS,
  STUDENT_PORTAL_TAB_OPTIONS,
  type FlightReviewClubSubscriptionPlan,
  type SchoolRules,
  type SchoolRulesInput,
  type SoloFlightAutomaticCriterionKey,
} from "../../types/schoolRules";
import type { TrainingTrack } from "../../types/trainingTrack";
import {
  DEFAULT_FLIGHT_EVALUATION_RULES,
  FLIGHT_EVALUATION_CRITERION_KEYS,
  type FlightEvaluationCriterionKey,
  type FlightEvaluationRules,
} from "../../types/flightEvaluation";
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
    flightReviewClub: {
      ...settings.flightReviewClub,
      pricingRules: settings.flightReviewClub.pricingRules.map((item) => ({ ...item })),
      lpBenefitItems: settings.flightReviewClub.lpBenefitItems.map((item) => ({ ...item })),
      lpScreenshotItems: (settings.flightReviewClub.lpScreenshotItems ?? []).map((item) => ({ ...item })),
      lpSections: (settings.flightReviewClub.lpSections ?? []).map((item) => ({ ...item })),
      checklistTemplate: settings.flightReviewClub.checklistTemplate.map((item) => ({ ...item })),
      lpValueProps: [...settings.flightReviewClub.lpValueProps],
      lpHeroChips: [...(settings.flightReviewClub.lpHeroChips ?? [])],
      benefits: [...settings.flightReviewClub.benefits],
      subscriptionPlans: settings.flightReviewClub.subscriptionPlans.map((item) => ({ ...item })),
      exclusiveStudentTabs: [...settings.flightReviewClub.exclusiveStudentTabs],
    },
    flightEvaluation: {
      enabled: settings.flightEvaluation.enabled,
      criteria: {
        instruction: { ...settings.flightEvaluation.criteria.instruction },
        safety: { ...settings.flightEvaluation.criteria.safety },
        learning: { ...settings.flightEvaluation.criteria.learning },
      },
      comment: { ...settings.flightEvaluation.comment },
      disclaimer: settings.flightEvaluation.disclaimer,
    },
    soloFlight: {
      ...settings.soloFlight,
      automaticCriteria: { ...settings.soloFlight.automaticCriteria },
      manualCriteria: settings.soloFlight.manualCriteria.map((item) => ({ ...item })),
    },
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
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
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
      const [next, trackResult] = await Promise.all([
        getSchoolRules(),
        listTrainingTracks({ includeInactive: true }),
      ]);
      setSettings(next);
      setForm(toRulesForm(next));
      setTracks(trackResult.data ?? []);
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
    const legacyEnabled = club.billingMode !== "student_subscription";
    const recurringEnabled = club.billingMode !== "legacy_one_time";
    const activeSubscriptionPlans = club.subscriptionPlans.filter((plan) => plan.enabled);
    if (legacyEnabled && club.pricingRules.some((rule) => rule.active && (!rule.trainingTrackId || rule.amount <= 0))) {
      setError("Cada regra de preco ativa precisa ter trilha e valor.");
      return;
    }
    if (recurringEnabled && activeSubscriptionPlans.some((plan) => plan.amount <= 0)) {
      setError("Cada plano recorrente ativo precisa ter valor maior que zero.");
      return;
    }
    if (club.enabled && recurringEnabled && activeSubscriptionPlans.length > 0 && !club.caktoSubscriptionProductId.trim()) {
      setError("Informe o Product ID recorrente da Cakto para usar planos por assinatura.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const current = await getSchoolRules();
      const saved = await saveSchoolRules({ ...toRulesForm(current), flightReviewClub: club });
      setSettings(saved);
      setForm(toRulesForm(saved));
      showToast({ variant: "success", message: "Configuracoes do Flight Review Club salvas." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addPricingRule() {
    const track = tracks[0];
    setClub({
      pricingRules: [
        ...club.pricingRules,
        {
          id: crypto.randomUUID(),
          trainingTrackId: track?.id ?? "",
          trainingTrackName: track?.name ?? "",
          minHours: 0,
          maxHours: null,
          amount: 0,
          discountPercent: 0,
          active: true,
        },
      ],
    });
  }

  function updatePricingRule(index: number, patch: Partial<(typeof club.pricingRules)[number]>) {
    setClub({
      pricingRules: club.pricingRules.map((rule, i) => {
        if (i !== index) return rule;
        const next = { ...rule, ...patch };
        if (patch.trainingTrackId !== undefined) {
          const track = tracks.find((item) => item.id === patch.trainingTrackId);
          next.trainingTrackName = track?.name ?? "";
        }
        return next;
      }),
    });
  }

  function updateSubscriptionPlan(planId: FlightReviewClubSubscriptionPlan["id"], patch: Partial<FlightReviewClubSubscriptionPlan>) {
    setClub({
      subscriptionPlans: club.subscriptionPlans.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan),
    });
  }

  function toggleExclusiveStudentTab(tabId: string, checked: boolean) {
    const current = new Set(club.exclusiveStudentTabs);
    if (checked) current.add(tabId as (typeof club.exclusiveStudentTabs)[number]);
    else current.delete(tabId as (typeof club.exclusiveStudentTabs)[number]);
    setClub({ exclusiveStudentTabs: STUDENT_PORTAL_TAB_OPTIONS.map((tab) => tab.id).filter((tab) => current.has(tab)) });
  }

  if (loading) return <SettingsSkeleton rows={8} />;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Flight Review Club</h3>
            <p className="mt-1 text-xs text-slate-500">Acesso, LP, checkout Cakto e preco por trilha/faixa de horas.</p>
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

          {club.enabled ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Tipo de landing page
                  <select value={club.landingPageType} onChange={(e) => setClub({ landingPageType: e.target.value as "internal_public_page" | "external_url" })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
                    <option value="internal_public_page">Pagina publica interna (/flight-review-club)</option>
                    <option value="external_url">URL externa</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Link externo da LP
                  <input type="url" value={club.externalUrl} onChange={(e) => setClub({ externalUrl: e.target.value })} disabled={club.landingPageType !== "external_url"} placeholder="https://suaescola.com/clube" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50" />
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200 md:col-span-2">
                  <input type="checkbox" checked={club.showInStudentMenu} onChange={(e) => setClub({ showInStudentMenu: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                  Mostrar no menu lateral do aluno
                </label>
                <label className="text-xs text-slate-400">
                  Link fallback do CTA
                  <input type="url" value={club.ctaSubscriptionUrl} onChange={(e) => setClub({ ctaSubscriptionUrl: e.target.value })} placeholder="https://suaescola.com/assinar" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <span className="mt-1 block text-[11px] text-slate-500">Usado para visitantes sem login ou quando nao houver preco aplicavel.</span>
                </label>
                <label className="text-xs text-slate-400">
                  Termo de adesao
                  <input type="url" value={club.adhesionTermUrl} onChange={(e) => setClub({ adhesionTermUrl: e.target.value })} placeholder="https://suaescola.com/termo-frc.pdf" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <span className="mt-1 block text-[11px] text-slate-500">Link aberto no checkbox de aceite antes do checkout.</span>
                </label>
                <label className="text-xs text-slate-400">
                  Voos de trial
                  <input type="number" min={0} max={500} step={1} value={club.trialFlightCount} onChange={(e) => setClub({ trialFlightCount: Math.max(0, Math.round(Number(e.target.value))) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </label>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cobranca e recorrencia</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    Modo de cobranca
                    <select
                      value={club.billingMode}
                      onChange={(e) => setClub({ billingMode: e.target.value as typeof club.billingMode })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="both">Legado por trilha + assinatura por aluno</option>
                      <option value="student_subscription">Somente assinatura por aluno</option>
                      <option value="legacy_one_time">Somente pagamento unico por trilha</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Product ID recorrente da Cakto
                    <input
                      value={club.caktoSubscriptionProductId}
                      onChange={(e) => setClub({ caktoSubscriptionProductId: e.target.value })}
                      placeholder="prod_..."
                      disabled={club.billingMode === "legacy_one_time"}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">Use um produto Cakto do tipo subscription para os planos recorrentes.</span>
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {club.subscriptionPlans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                        <input
                          type="checkbox"
                          checked={plan.enabled}
                          disabled={club.billingMode === "legacy_one_time"}
                          onChange={(e) => updateSubscriptionPlan(plan.id, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-sky-500 disabled:opacity-50"
                        />
                        {plan.label}
                      </label>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <input
                          value={plan.label}
                          onChange={(e) => updateSubscriptionPlan(plan.id, { label: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={plan.amount}
                          onChange={(e) => updateSubscriptionPlan(plan.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">Recorrencia fixa: {plan.recurrencePeriodDays} dias.</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Abas exclusivas para FRC</p>
                <p className="mt-1 text-xs text-slate-500">As abas continuam no menu. Alunos sem FRC ativo veem o aviso de acesso ao abrir.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {STUDENT_PORTAL_TAB_OPTIONS.map((tab) => (
                    <label key={tab.id} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={club.exclusiveStudentTabs.includes(tab.id)}
                        onChange={(e) => toggleExclusiveStudentTab(tab.id, e.target.checked)}
                        className="h-4 w-4 accent-amber-400"
                      />
                      {tab.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Landing page interna</p>
                <p className="mt-2 text-sm text-slate-400">Textos e imagens agora são editados direto na página pública.</p>
                <a href="/flight-review-club?edit=1" className="mt-3 inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400">
                  Abrir landing para editar
                </a>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preco por trilha e horas voadas</p>
                    <p className="mt-1 text-[11px] text-slate-500">Ex.: Piloto privado, 0 a 20h, R$ 1490. O checkout usa a primeira regra ativa compativel.</p>
                  </div>
                  <button type="button" onClick={addPricingRule} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">+ Regra</button>
                </div>
                <div className="mt-3 space-y-2">
                  {club.pricingRules.map((rule, index) => (
                    <div key={rule.id || index} className="grid gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 md:grid-cols-[minmax(180px,1.4fr)_100px_100px_120px_105px_auto_auto] md:items-end">
                      <label className="text-xs text-slate-400">
                        Trilha
                        <select value={rule.trainingTrackId} onChange={(e) => updatePricingRule(index, { trainingTrackId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
                          <option value="">Selecione</option>
                          {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-slate-400">
                        Horas min
                        <input type="number" min={0} step={0.1} value={rule.minHours} onChange={(e) => updatePricingRule(index, { minHours: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                      </label>
                      <label className="text-xs text-slate-400">
                        Horas max
                        <input type="number" min={0} step={0.1} value={rule.maxHours ?? ""} onChange={(e) => updatePricingRule(index, { maxHours: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} placeholder="Sem max" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                      </label>
                      <label className="text-xs text-slate-400">
                        Valor
                        <input type="number" min={0} step={0.01} value={rule.amount} onChange={(e) => updatePricingRule(index, { amount: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                      </label>
                      <label className="text-xs text-slate-400">
                        Desconto %
                        <input type="number" min={0} max={95} step={1} value={rule.discountPercent ?? 0} onChange={(e) => updatePricingRule(index, { discountPercent: Math.min(95, Math.max(0, Math.round(Number(e.target.value) || 0))) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                      </label>
                      <label className="flex items-center gap-2 pb-2 text-xs text-slate-300">
                        <input type="checkbox" checked={rule.active} onChange={(e) => updatePricingRule(index, { active: e.target.checked })} className="accent-sky-500" />
                        Ativa
                      </label>
                      <button type="button" onClick={() => setClub({ pricingRules: club.pricingRules.filter((_, i) => i !== index) })} className="rounded px-2 py-2 text-xs text-red-300 hover:bg-red-500/10">Remover</button>
                    </div>
                  ))}
                  {club.pricingRules.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center text-sm text-slate-500">Nenhuma regra de preco configurada.</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
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

export function FlightReviewClubPanelLegacy() {
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
                    max={500}
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

const EVAL_CRITERION_LABELS: Record<FlightEvaluationCriterionKey, string> = {
  instruction: "Critério 1",
  safety: "Critério 2",
  learning: "Critério 3",
};

export function FlightEvaluationSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SchoolRules | null>(null);
  const [form, setForm] = useState<SchoolRulesInput>(toRulesForm(DEFAULT_SCHOOL_RULES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluation: FlightEvaluationRules = form.flightEvaluation ?? DEFAULT_FLIGHT_EVALUATION_RULES;

  const setEvaluation = (patch: Partial<FlightEvaluationRules>) =>
    setForm((prev) => ({
      ...prev,
      flightEvaluation: {
        ...(prev.flightEvaluation ?? DEFAULT_FLIGHT_EVALUATION_RULES),
        ...patch,
      },
    }));

  const setCriterion = (key: FlightEvaluationCriterionKey, patch: { title?: string; description?: string }) => {
    setEvaluation({
      criteria: {
        ...evaluation.criteria,
        [key]: { ...evaluation.criteria[key], ...patch },
      },
    });
  };

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
      const saved = await saveSchoolRules({ ...toRulesForm(current), flightEvaluation: evaluation });
      setSettings(saved);
      setForm(toRulesForm(saved));
      showToast({ variant: "success", message: "Configurações de avaliação do voo salvas." });
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
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Avaliação do voo</h3>
            <p className="mt-1 text-xs text-slate-500">
              Permitir que o aluno avalie os voos com 3 critérios (1 a 5 estrelas) e um comentário aberto.
            </p>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={evaluation.enabled}
              onChange={(e) => setEvaluation({ enabled: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
            Ativar avaliação do voo pelo aluno
          </label>

          {evaluation.enabled ? (
            <div className="space-y-4">
              {FLIGHT_EVALUATION_CRITERION_KEYS.map((key) => (
                <div key={key} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {EVAL_CRITERION_LABELS[key]}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-400">
                      Título
                      <input
                        type="text"
                        value={evaluation.criteria[key].title}
                        onChange={(e) => setCriterion(key, { title: e.target.value })}
                        maxLength={120}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                      />
                    </label>
                    <label className="text-xs text-slate-400 sm:col-span-2">
                      Descrição
                      <textarea
                        value={evaluation.criteria[key].description}
                        onChange={(e) => setCriterion(key, { description: e.target.value })}
                        rows={2}
                        maxLength={500}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Campo aberto</p>
                <div className="grid gap-3">
                  <label className="text-xs text-slate-400">
                    Título
                    <input
                      type="text"
                      value={evaluation.comment.title}
                      onChange={(e) => setEvaluation({ comment: { ...evaluation.comment, title: e.target.value } })}
                      maxLength={120}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Descrição / placeholder
                    <textarea
                      value={evaluation.comment.description}
                      onChange={(e) =>
                        setEvaluation({ comment: { ...evaluation.comment, description: e.target.value } })
                      }
                      rows={2}
                      maxLength={500}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Disclaimer</p>
                <label className="text-xs text-slate-400">
                  Texto de aviso no modal (opcional)
                  <textarea
                    value={evaluation.disclaimer}
                    onChange={(e) => setEvaluation({ disclaimer: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ex.: Sua avaliação é confidencial e ajuda a melhorar a qualidade da instrução."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar avaliação do voo"}
        </button>
      </div>
    </section>
  );
}

const SOLO_AUTO_LABELS: Record<SoloFlightAutomaticCriterionKey, string> = {
  recentDualCommand: "Voo duplo comando recente",
  minimumAge: "Idade mínima",
  activeEndorsement: "Endosso ativo anexado",
  cutoffBefore: "Corte antes do limite",
  previousDestinationNavigation: "Navegação prévia ao destino",
  previousAlternateFlight: "Voo prévio ao alternativo",
  metarAlunoSolo: "METAR dentro do mínimo aluno_solo",
};

export function SoloFlightRulesPanel() {
  const { showToast } = useToast();
  const [form, setForm] = useState<SchoolRulesInput>(toRulesForm(DEFAULT_SCHOOL_RULES));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rules = await getSchoolRules();
      setForm(toRulesForm(rules));
      setUpdatedAt(rules.updatedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const current = await getSchoolRules();
      const saved = await saveSchoolRules({ ...toRulesForm(current), soloFlight: form.soloFlight });
      setForm(toRulesForm(saved));
      setUpdatedAt(saved.updatedAt);
      showToast({ variant: "success", message: "Critérios de voo solo salvos." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message || "Falha ao salvar voo solo." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettingsSkeleton rows={6} />;
  if (error) return <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200">{error}</section>;

  const solo = form.soloFlight ?? DEFAULT_SOLO_FLIGHT_RULES;

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Voo solo</h2>
          <p className="mt-1 text-sm text-slate-500">Última atualização: {formatUpdatedAt(updatedAt)}</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {saving ? "Salvando..." : "Salvar critérios"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
          <input type="checkbox" checked={solo.enabled} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, enabled: e.target.checked } }))} />
          Fluxo ativo
        </label>
        <label className="text-xs font-medium text-slate-400">Janela DC (dias)
          <input type="number" min={1} max={30} value={solo.dualCommandWindowDays} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, dualCommandWindowDays: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="text-xs font-medium text-slate-400">Idade mínima
          <input type="number" min={14} max={80} value={solo.minimumAge} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, minimumAge: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="text-xs font-medium text-slate-400">Corte antes de
          <input type="time" value={solo.cutoffBeforeTime} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, cutoffBeforeTime: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {(Object.keys(SOLO_AUTO_LABELS) as SoloFlightAutomaticCriterionKey[]).map((key) => (
          <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
            <span>{SOLO_AUTO_LABELS[key]}</span>
            <input type="checkbox" checked={solo.automaticCriteria[key]} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, automaticCriteria: { ...solo.automaticCriteria, [key]: e.target.checked } } }))} />
          </label>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Critérios manuais</h3>
          <button type="button" onClick={() => setForm((current) => ({ ...current, soloFlight: { ...solo, manualCriteria: [...solo.manualCriteria, { id: `manual_${Date.now()}`, label: "", enabled: true }] } }))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Adicionar</button>
        </div>
        {solo.manualCriteria.map((item, index) => (
          <div key={item.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <input type="checkbox" checked={item.enabled} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, manualCriteria: solo.manualCriteria.map((row) => row.id === item.id ? { ...row, enabled: e.target.checked } : row) } }))} />
            <input value={item.label} onChange={(e) => setForm((current) => ({ ...current, soloFlight: { ...solo, manualCriteria: solo.manualCriteria.map((row) => row.id === item.id ? { ...row, label: e.target.value } : row) } }))} placeholder={`Criterio manual ${index + 1}`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            <button type="button" onClick={() => setForm((current) => ({ ...current, soloFlight: { ...solo, manualCriteria: solo.manualCriteria.filter((row) => row.id !== item.id) } }))} className="rounded-lg border border-red-900/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/30">Remover</button>
          </div>
        ))}
      </div>
    </section>
  );
}
