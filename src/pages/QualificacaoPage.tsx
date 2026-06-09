import { useEffect, useState } from "react";
import { upsertLeadByEmail } from "../lib/crmDb";
import { getCachedBrandSettings } from "../lib/notificationsDb";
import { getReferralWelcome } from "../lib/referAndEarnDb";
import { executeSagaAnacLookup } from "../lib/sagaAnacSync";
import type { AvailableDay, AvailablePeriod } from "../types/crm";
import { AVAILABLE_DAY_LABELS } from "../types/crm";

// ─── Constantes ────────────────────────────────────────────────────────────────

const ALL_DAYS: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const WEEK_DAYS: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex"];
const WEEKEND_DAYS: AvailableDay[] = ["sab", "dom"];

const COURSES = [
  { value: "Piloto Privado",   label: "Piloto Privado" },
  { value: "Piloto Comercial", label: "Piloto Comercial" },
  { value: "INVA",             label: "INVA" },
  { value: "Recheque",         label: "Recheque" },
  { value: "Aperfeiçoamento",  label: "Aperfeiçoamento" },
];

const WEEKLY_HOURS = [1, 2, 4, 6, 8];

const START_OPTIONS = [
  { value: "imediato", label: "Imediatamente" },
  { value: "30_dias",  label: "Nos próximos 30 dias" },
  { value: "60_dias",  label: "Em até 60 dias" },
  { value: "mais_60",  label: "Mais de 60 dias" },
];

type PresetId = "fds" | "uteis" | "manhas" | "tardes" | "todos" | "personalizado";

const AVAILABILITY_PRESETS: {
  id: PresetId;
  label: string;
  sub: string;
  icon: string;
  days: AvailableDay[];
  period?: AvailablePeriod;
}[] = [
  { id: "fds",          label: "Finais de semana", sub: "Sáb e Dom",            icon: "🏖️", days: WEEKEND_DAYS },
  { id: "uteis",        label: "Dias úteis",        sub: "Seg a Sex",            icon: "💼", days: WEEK_DAYS },
  { id: "manhas",       label: "Todas as manhãs",   sub: "Todos os dias, manhã", icon: "☀️", days: ALL_DAYS, period: "manha" },
  { id: "tardes",       label: "Todas as tardes",   sub: "Todos os dias, tarde", icon: "🌆", days: ALL_DAYS, period: "tarde" },
  { id: "todos",        label: "Todos os dias",     sub: "Seg a Dom, ambos",     icon: "🗓️", days: ALL_DAYS, period: "ambos" },
  { id: "personalizado",label: "Personalizado",     sub: "Escolha os dias",      icon: "✏️", days: [] },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCpfInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isAtLeast16(birthDate: string): boolean {
  if (!birthDate) return true; // campo opcional, não bloqueia
  const birth = new Date(birthDate);
  const today = new Date();
  const age =
    today.getFullYear() - birth.getFullYear() -
    (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
      ? 1
      : 0);
  return age >= 16;
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  cpf: string;
  anacCode: string;
  noAnac: boolean;
  desiredCourse: string;
  theoreticalExamDone: boolean | null;
  desiredHours: string;
  startPeriod: string;
  notes: string;
  weeklyHours: string;
  weightKg: string;
  heightCm: string;
  availabilityPreset: PresetId | null;
  availableDays: AvailableDay[];
  availablePeriod: AvailablePeriod | "";
};

// ─── UI helpers ────────────────────────────────────────────────────────────────

function Divider() {
  return <hr className="border-slate-800" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-base font-semibold text-slate-100">{children}</h2>;
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
      {children}
      {optional && <span className="text-xs font-normal text-slate-600">(opcional)</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 transition";

const REFERRAL_STORAGE_KEY = "referral_user_id";

function resolveReferrerUserId(params: URLSearchParams): string | null {
  const fromUrl = params.get("user_id")?.trim();
  if (fromUrl) {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
}

// ─── QualificacaoPage ──────────────────────────────────────────────────────────

export function QualificacaoPage() {
  const params = new URLSearchParams(window.location.search);
  const emailHint = params.get("email") ?? "";
  const brand = getCachedBrandSettings();
  const logoUrl = brand?.logoUrl || "";
  const [referrerUserId] = useState(() => resolveReferrerUserId(params));
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeLoading, setWelcomeLoading] = useState(Boolean(referrerUserId));
  const [welcomeInfo, setWelcomeInfo] = useState<{ referrerName: string; schoolName: string } | null>(null);

  useEffect(() => {
    if (!referrerUserId) {
      setWelcomeLoading(false);
      return;
    }
    let cancelled = false;
    void getReferralWelcome(referrerUserId)
      .then((info) => {
        if (cancelled) return;
        if (info.valid && (info.referrerNickname || info.referrerFirstName)) {
          setWelcomeInfo({ referrerName: info.referrerNickname ?? info.referrerFirstName ?? "", schoolName: info.schoolName });
          setShowWelcome(true);
        } else {
          setShowWelcome(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setShowWelcome(false);
      })
      .finally(() => {
        if (!cancelled) setWelcomeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [referrerUserId]);

  const [form, setForm] = useState<FormState>({
    name: "",
    email: emailHint,
    phone: "",
    birthDate: "",
    cpf: "",
    anacCode: "",
    noAnac: false,
    desiredCourse: "",
    theoreticalExamDone: null,
    desiredHours: "",
    startPeriod: "",
    notes: "",
    weeklyHours: "",
    weightKg: "",
    heightCm: "",
    availabilityPreset: null,
    availableDays: [],
    availablePeriod: "",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function toggleDay(day: AvailableDay) {
    setForm((p) => ({
      ...p,
      availableDays: p.availableDays.includes(day)
        ? p.availableDays.filter((d) => d !== day)
        : [...p.availableDays, day],
    }));
  }

  function applyPreset(preset: typeof AVAILABILITY_PRESETS[number]) {
    if (preset.id === "personalizado") {
      setForm((p) => ({ ...p, availabilityPreset: "personalizado" }));
    } else {
      setForm((p) => ({
        ...p,
        availabilityPreset: preset.id,
        availableDays: preset.days,
        availablePeriod: preset.period ?? p.availablePeriod,
      }));
    }
  }

  const COURSE_DEFAULT_HOURS: Record<string, number> = {
    "Piloto Privado":   42,
    "Piloto Comercial": 110,
    "INVA":             15,
  };

  function handleCourseChange(course: string) {
    const defaultHours = COURSE_DEFAULT_HOURS[course];
    setForm((p) => ({
      ...p,
      desiredCourse: course,
      desiredHours: defaultHours != null ? String(defaultHours) : p.desiredHours,
      theoreticalExamDone: course === "Piloto Privado" ? (p.theoreticalExamDone ?? null) : null,
    }));
  }

  // ─── Validação ────────────────────────────────────────────────────────────

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Informe seu nome completo.");
    if (!form.email.trim() || !form.email.includes("@")) errs.push("Informe um e-mail válido.");
    if (form.birthDate && !isAtLeast16(form.birthDate))
      errs.push("É necessário ter pelo menos 16 anos para se matricular.");
    if (!form.desiredCourse) errs.push("Selecione o curso desejado.");
    if (!form.desiredHours) errs.push("Informe quantas horas pretende fazer.");
    if (!form.startPeriod) errs.push("Selecione quando deseja começar.");
    if (!form.weeklyHours) errs.push("Selecione a quantidade de horas por semana.");
    if (!form.noAnac) {
      if (!form.anacCode.trim()) errs.push("Informe o código ANAC ou marque que ainda não possui.");
      if (!form.birthDate) errs.push("Informe a data de nascimento para consultar a ANAC.");
      if (onlyDigits(form.cpf).length !== 11) errs.push("Informe um CPF válido para consultar a ANAC.");
    }
    if (form.heightCm && Number(form.heightCm) < 100)
      errs.push("A altura deve ser de no mínimo 100 cm.");
    if (form.desiredCourse === "Piloto Privado" && form.theoreticalExamDone === null)
      errs.push("Informe se já realizou a banca teórica do Piloto Privado.");
    return errs;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSaving(true);

    const { error } = await upsertLeadByEmail({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      referrerUserId: referrerUserId || null,
      birthDate: form.birthDate || null,
      cpf: form.noAnac ? null : onlyDigits(form.cpf) || null,
      anacCode: form.noAnac ? "" : (form.anacCode.trim() || null),
      desiredCourse: form.desiredCourse || null,
      theoreticalExamDone: form.desiredCourse === "Piloto Privado" ? form.theoreticalExamDone : null,
      desiredHours: form.desiredHours ? Number(form.desiredHours) : null,
      startDate: form.startPeriod || null,
      weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      availableDays: form.availableDays,
      availablePeriod: (form.availablePeriod as AvailablePeriod) || null,
      notes: form.notes.trim() || null,
    });

    setSaving(false);
    if (error) {
      setErrors(["Algo deu errado. Tente novamente."]);
    } else {
      if (!form.noAnac && form.anacCode.trim() && form.birthDate && onlyDigits(form.cpf).length === 11) {
        void executeSagaAnacLookup({
          anacCode: form.anacCode.trim(),
          cpf: onlyDigits(form.cpf),
          birthDate: form.birthDate,
          email: form.email.trim().toLowerCase(),
        });
      }
      setSaved(true);
    }
  }

  // ─── Sucesso ──────────────────────────────────────────────────────────────

  if (welcomeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (showWelcome && welcomeInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10 text-4xl">
            ✈️
          </div>
          <h1 className="text-2xl font-bold leading-tight text-slate-50 sm:text-3xl">
            O {welcomeInfo.referrerName} te indicou para {welcomeInfo.schoolName}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Você está a poucos passos de começar sua jornada na aviação. Preencha o formulário e nossa equipe entrará em contato.
          </p>
          <button
            type="button"
            onClick={() => setShowWelcome(false)}
            className="mt-8 w-full rounded-xl bg-sky-600 px-6 py-4 text-base font-bold uppercase tracking-wide text-white transition hover:bg-sky-500 sm:w-auto"
          >
            Comece agora
          </button>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-4xl">
            ✈️
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-100">Recebido!</h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Obrigado, <span className="font-semibold text-slate-200">{form.name.split(" ")[0]}</span>!
            Suas informações foram recebidas e nossa equipe entrará em contato em breve para conversar sobre o seu treinamento.
          </p>
        </div>
      </div>
    );
  }

  const isCustom = form.availabilityPreset === "personalizado";
  const isLocked = form.availabilityPreset !== null && !isCustom;

  // ─── Formulário ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Hero */}
      <div className="border-b border-slate-800/60 bg-slate-900/50 px-4 py-8 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo da escola" className="mx-auto mb-5 max-h-14 max-w-[180px] object-contain" />
        ) : (
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-2xl">
            ✈️
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Pronto para voar?</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Preencha suas informações e nossa equipe montará a proposta ideal para você. Leva menos de 3 minutos.
        </p>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">

          {/* Erros */}
          {errors.length > 0 && (
            <div className="rounded-xl border border-red-700/40 bg-red-950/40 px-4 py-3 space-y-0.5">
              {errors.map((e) => (
                <p key={e} className="text-sm text-red-400">{e}</p>
              ))}
            </div>
          )}

          {/* ── Seus dados ─────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Seus dados</SectionTitle>
            <div className="space-y-3">
              <div>
                <FieldLabel>Nome completo</FieldLabel>
                <input type="text" autoComplete="name" value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Como você se chama?" className={inputCls} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>E-mail</FieldLabel>
                  <input type="email" autoComplete="email" value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="seu@email.com" className={inputCls} />
                </div>
                <div>
                  <FieldLabel optional>Telefone / WhatsApp</FieldLabel>
                  <input type="tel" autoComplete="tel" value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="(11) 99999-9999" className={inputCls} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel optional={form.noAnac}>Data de nascimento</FieldLabel>
                  <input type="date" autoComplete="bday" value={form.birthDate}
                    onChange={(e) => set("birthDate", e.target.value)} className={inputCls} />
                  {form.birthDate && !isAtLeast16(form.birthDate) && (
                    <p className="mt-1.5 text-xs text-red-400">
                      É necessário ter pelo menos 16 anos para se matricular.
                    </p>
                  )}
                </div>
                <div>
                  <FieldLabel optional={form.noAnac}>CPF</FieldLabel>
                  <input
                    type="text" inputMode="numeric" autoComplete="off" value={form.cpf}
                    onChange={(e) => set("cpf", formatCpfInput(e.target.value))}
                    placeholder="000.000.000-00" disabled={form.noAnac}
                    className={`${inputCls} ${form.noAnac ? "opacity-40 cursor-not-allowed" : ""}`}
                  />
                </div>
              </div>

              <div>
                <FieldLabel optional={form.noAnac}>Código ANAC</FieldLabel>
                <input
                  type="text" inputMode="numeric" value={form.anacCode}
                  onChange={(e) => set("anacCode", e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex.: 264933" disabled={form.noAnac}
                  className={`${inputCls} ${form.noAnac ? "opacity-40 cursor-not-allowed" : ""}`}
                />
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={form.noAnac}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((p) => ({
                        ...p,
                        noAnac: checked,
                        ...(checked
                          ? { anacCode: "", cpf: "", desiredCourse: "Piloto Privado", theoreticalExamDone: false }
                          : { theoreticalExamDone: null }),
                      }));
                    }}
                    className="h-3.5 w-3.5 rounded accent-sky-500" />
                  Ainda não tenho código ANAC
                </label>
              </div>
            </div>
          </section>

          <Divider />

          {/* ── Sobre o treinamento ────────────────────────────────────────── */}
          <section>
            <SectionTitle>Sobre o seu treinamento</SectionTitle>
            <div className="space-y-4">

              <div>
                <FieldLabel>Qual curso você deseja fazer?</FieldLabel>
                <select
                  value={form.desiredCourse}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  disabled={form.noAnac}
                  className={`${inputCls} ${form.noAnac ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <option value="">Selecione um curso...</option>
                  {COURSES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {form.noAnac && (
                  <p className="mt-1.5 text-xs text-sky-500/80">
                    Sem código ANAC o curso disponível é Piloto Privado.
                  </p>
                )}
              </div>

              {form.desiredCourse === "Piloto Privado" && (
                <div className={`rounded-xl border border-sky-800/40 bg-sky-950/30 p-4 ${form.noAnac ? "opacity-60 pointer-events-none select-none" : ""}`}>
                  <p className="mb-3 text-sm font-medium text-sky-200">
                    Você já realizou a banca teórica?
                    {!form.noAnac && <span className="ml-1 text-xs font-normal text-red-400">*</span>}
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: true,  label: "Sim, já fiz" },
                      { value: false, label: "Não, ainda não" },
                    ].map((opt) => (
                      <button key={String(opt.value)} type="button"
                        onClick={() => set("theoreticalExamDone", opt.value)}
                        className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                          form.theoreticalExamDone === opt.value
                            ? "border-sky-500 bg-sky-500/20 text-sky-200"
                            : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Quantas horas pretende fazer?</FieldLabel>
                  <input type="number" min={1} value={form.desiredHours}
                    onChange={(e) => set("desiredHours", e.target.value)}
                    placeholder="Ex.: 50" className={inputCls} />
                </div>
                <div>
                  <FieldLabel>Quantas horas deseja voar por semana em média?</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {WEEKLY_HOURS.map((h) => (
                      <button key={h} type="button"
                        onClick={() => set("weeklyHours", form.weeklyHours === String(h) ? "" : String(h))}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                          form.weeklyHours === String(h)
                            ? "border-sky-500 bg-sky-500/20 text-sky-200"
                            : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                        }`}>
                        {h === 8 ? "8+ h/sem" : `${h} h/sem`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quando quer começar — button group */}
              <div>
                <FieldLabel>Quando quer começar?</FieldLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {START_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("startPeriod", form.startPeriod === opt.value ? "" : opt.value)}
                      className={`rounded-xl border px-3 py-3 text-sm font-medium transition text-center ${
                        form.startPeriod === opt.value
                          ? "border-sky-500 bg-sky-500/20 text-sky-200"
                          : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </section>

          <Divider />

          {/* ── Dados físicos ──────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Dados físicos</SectionTitle>
            <p className="mb-4 text-xs text-slate-500 leading-relaxed">
              A aviação possui limites de peso e altura para operar determinadas aeronaves. Essas informações nos ajudam a indicar a melhor opção para você.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel optional>Peso (kg)</FieldLabel>
                <input type="number" inputMode="decimal" min={30} max={300} step={0.1}
                  value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)}
                  placeholder="Ex.: 75" className={inputCls} />
              </div>
              <div>
                <FieldLabel optional>Altura (cm)</FieldLabel>
                <input
                  type="text" inputMode="numeric"
                  value={form.heightCm}
                  onChange={(e) => set("heightCm", e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Ex.: 175" className={inputCls}
                />
                {form.heightCm && Number(form.heightCm) < 100 && (
                  <p className="mt-1.5 text-xs text-red-400">A altura deve ser de no mínimo 100 cm.</p>
                )}
              </div>
            </div>
          </section>

          <Divider />

          {/* ── Detalhes ───────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Detalhes</SectionTitle>
            <div>
              <FieldLabel optional>Quer nos contar algo mais?</FieldLabel>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="Ex.: já tenho experiência com simuladores, tenho disponibilidade somente à tarde durante a semana, gostaria de saber sobre financiamento..."
                className={`${inputCls} resize-none`}
              />
            </div>
          </section>

          <Divider />

          {/* ── Disponibilidade ────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Disponibilidade para voar</SectionTitle>
            <p className="mb-4 text-xs text-slate-500 leading-relaxed">
              Selecione os dias e horários que você costuma ter livres durante a semana. Isso nos ajuda a montar uma grade de voos que se encaixe na sua rotina.
            </p>

            {/* Grade de presets */}
            <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {AVAILABILITY_PRESETS.map((preset) => {
                const isActive = form.availabilityPreset === preset.id;
                return (
                  <button key={preset.id} type="button" onClick={() => applyPreset(preset)}
                    className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                      isActive
                        ? "border-sky-500 bg-sky-500/15"
                        : "border-slate-700 bg-slate-800/30 hover:border-slate-600"
                    }`}
                  >
                    <span className="mb-1 text-lg">{preset.icon}</span>
                    <span className={`text-[11px] font-semibold leading-tight ${isActive ? "text-sky-200" : "text-slate-200"}`}>
                      {preset.label}
                    </span>
                    <span className="mt-0.5 text-[10px] leading-tight text-slate-500">{preset.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Picker — exibido quando qualquer preset está ativo */}
            {form.availabilityPreset !== null && (
              <div className={`space-y-3 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 transition ${isLocked ? "opacity-50 pointer-events-none select-none" : ""}`}>
                {isLocked && (
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Configuração do preset — selecione "Personalizado" para editar
                  </p>
                )}

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-400">Dias da semana</p>
                  <div className="flex gap-1.5">
                    {ALL_DAYS.map((day) => (
                      <button key={day} type="button" onClick={() => toggleDay(day)}
                        className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                          form.availableDays.includes(day)
                            ? "border-sky-500 bg-sky-500/20 text-sky-200"
                            : "border-slate-700 bg-slate-800/30 text-slate-500"
                        }`}>
                        {AVAILABLE_DAY_LABELS[day]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-400">Período preferido</p>
                  <div className="flex gap-2">
                    {(["manha", "tarde", "ambos"] as AvailablePeriod[]).map((p) => (
                      <button key={p} type="button"
                        onClick={() => set("availablePeriod", p === form.availablePeriod ? "" : p)}
                        className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                          form.availablePeriod === p
                            ? "border-sky-500 bg-sky-500/20 text-sky-200"
                            : "border-slate-700 bg-slate-800/30 text-slate-500"
                        }`}>
                        {p === "manha" ? "☀️ Manhã" : p === "tarde" ? "🌆 Tarde" : "✨ Ambos"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── CTA ────────────────────────────────────────────────────────── */}
          <button type="submit" disabled={saving}
            className="w-full rounded-xl bg-sky-600 py-4 text-base font-semibold text-white shadow-lg shadow-sky-900/40 transition hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50">
            {saving ? "Enviando..." : "Quero voar →"}
          </button>

          <p className="pb-4 text-center text-xs text-slate-700">
            Suas informações são tratadas com sigilo e usadas exclusivamente para contato da escola.
          </p>
        </form>
      </div>
    </div>
  );
}
