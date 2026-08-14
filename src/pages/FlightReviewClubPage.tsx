import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { AuthPanel } from "../components/AuthPanel";
import { FlightReviewClubCheckoutModal } from "../components/FlightReviewClubCheckoutModal";
import { getEmailBrandSettings } from "../lib/notificationsDb";
import { getSchoolRules } from "../lib/schoolRulesDb";
import { cancelFlightReviewClubSubscription, getFlightReviewClubStatus } from "../lib/caktoDb";
import type { FlightReviewClubStatus } from "../types/cakto";
import type { EmailBrandSettings } from "../types/notification";
import type { FlightReviewClubRules, FlightReviewClubScreenshotItem } from "../types/schoolRules";

const DEFAULT_BENEFITS = [
  "Análise da telemetria de cada voo.",
  "Link público para compartilhamento do voo.",
  "Curso de Segurança de Voo EAD.",
  "Camiseta da escola + crachá exclusivo na primeira assinatura.",
  "Acesso gratuito ao NexAtlas (etapa manual).",
  "Acesso gratuito ao Clube 360 (etapa manual).",
  "Descontos no Marketplace da epeac.",
  "Pelo menos 1 webinar por mês exclusivo para integrantes.",
  "Agendamento antecipado para voos com até 30 dias de antecedência.",
  "Planejamento de voo e rotas.",
  "Figurinhas e animacoes dos voos.",
  "Jornada gamificada com histórico detalhado.",
  "Vídeos com fonia e fotos dos voos.",
];

const DEFAULT_VALUE_PROPS = [
  "Revise cada voo com dados reais e transforme a aula seguinte em continuidade.",
  "Centralize registros, fotos, vídeos, planejamento e histórico em uma jornada mais completa.",
  "Receba benefícios manuais da escola sem perder o controle do que já foi entregue.",
];

const DEFAULT_SCREENSHOTS: FlightReviewClubScreenshotItem[] = [
  { title: "Telemetria", description: "Análise visual dos dados de voo e pontos de melhoria.", imageUrl: "" },
  { title: "Link público", description: "Página compartilhável para mostrar o voo com contexto.", imageUrl: "" },
  { title: "Planejamento", description: "Rotas, aeródromos e preparação do próximo voo.", imageUrl: "" },
  { title: "Jornada", description: "Histórico gamificado e progresso do aluno.", imageUrl: "" },
  { title: "Álbum", description: "Vídeos com fonia, fotos e registros dos voos.", imageUrl: "" },
  { title: "Marketplace", description: "Vantagens e descontos para integrantes.", imageUrl: "" },
];

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#071018]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

function formatRenewalDate(value: string | null | undefined): string {
  if (!value) return "data ainda não disponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function ScreenshotVisual({ item, index }: { item: FlightReviewClubScreenshotItem; index: number }) {
  if (item.imageUrl) {
    return <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />;
  }
  const bars = [66, 48, 82, 56, 72, 38];
  return (
    <div className="flex h-full w-full flex-col bg-[#0b1720] p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
      </div>
      <div className="mt-5 grid flex-1 grid-cols-[1fr_88px] gap-3">
        <div className="space-y-2">
          {bars.map((bar, barIndex) => (
            <span
              key={barIndex}
              className="block h-3 rounded-full bg-slate-700/80"
              style={{ width: `${Math.max(30, (bar + index * 7 + barIndex * 3) % 86)}%` }}
            />
          ))}
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-2">
          <div className="h-full rounded-md border border-sky-500/30 bg-sky-500/10" />
        </div>
      </div>
      <div className="mt-4 h-16 rounded-lg border border-emerald-500/20 bg-emerald-500/10" />
    </div>
  );
}

function BenefitIcon({ index }: { index: number }) {
  const labels = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-300/30 bg-sky-300/10 text-xs font-black text-sky-100">
      {labels[index] ?? "OK"}
    </span>
  );
}

export function FlightReviewClubPage() {
  const { user } = useAuth();
  const [club, setClub] = useState<FlightReviewClubRules | null>(null);
  const [brand, setBrand] = useState<EmailBrandSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [frcStatus, setFrcStatus] = useState<FlightReviewClubStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pendingCheckoutAfterAuth, setPendingCheckoutAfterAuth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getSchoolRules().catch(() => null),
      getEmailBrandSettings().catch(() => null),
    ]).then(([rules, brandSettings]) => {
      if (cancelled) return;
      setClub(rules?.flightReviewClub ?? null);
      setBrand(brandSettings);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== "aluno") {
      setFrcStatus(null);
      setStatusLoading(false);
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    void getFlightReviewClubStatus()
      .then((status) => {
        if (!cancelled) setFrcStatus(status);
      })
      .catch(() => {
        if (!cancelled) setFrcStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !pendingCheckoutAfterAuth) return;
    setPendingCheckoutAfterAuth(false);
    setAuthOpen(false);
    if (user.role === "aluno") setCheckoutOpen(true);
    else setCheckoutError("A assinatura do Flight Review Club está disponível para alunos.");
  }, [pendingCheckoutAfterAuth, user]);

  const activePlan = useMemo(() => {
    const plans = club?.subscriptionPlans?.filter((plan) => plan.enabled && plan.amount > 0) ?? [];
    return plans.sort((a, b) => a.amount - b.amount)[0] ?? null;
  }, [club]);

  if (loading) return <LoadingState />;

  if (!club?.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071018] px-4 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
          <h1 className="mt-2 text-2xl font-black">Programa não disponível</h1>
          <p className="mt-2 text-sm text-slate-400">O Flight Review Club ainda não está disponível nesta escola.</p>
        </div>
      </div>
    );
  }

  const activeClub = club;
  const benefitItems = activeClub.lpBenefitItems.length > 0
    ? activeClub.lpBenefitItems
    : DEFAULT_BENEFITS.map((text) => ({ text, imageUrl: "" }));
  const valueProps = activeClub.lpValueProps.length > 0 ? activeClub.lpValueProps : DEFAULT_VALUE_PROPS;
  const screenshots = activeClub.lpScreenshotItems.length > 0 ? activeClub.lpScreenshotItems : DEFAULT_SCREENSHOTS;
  const schoolName = brand?.schoolName?.trim() || "Flight Review Club";
  const logoSrc = brand?.logoDataUrl || brand?.logoUrl || null;
  const coverImageUrl = activeClub.lpCoverImageUrl.trim();
  const hasFrcAccess = frcStatus?.hasAccess === true;
  const membership = frcStatus?.membership ?? null;
  const canCancel = Boolean(membership?.caktoSubscriptionId && ["active", "trial"].includes(membership.status));

  async function handleCta() {
    setCheckoutError(null);
    if (frcStatus?.hasAccess) return;
    if (user?.role === "aluno") {
      setCheckoutOpen(true);
      return;
    }
    if (!user) {
      setPendingCheckoutAfterAuth(true);
      setAuthOpen(true);
      return;
    }
    if (activeClub.ctaSubscriptionUrl) {
      window.open(activeClub.ctaSubscriptionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setCheckoutError("A assinatura do Flight Review Club está disponível para alunos.");
  }

  async function handleCancelSubscription() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCheckoutError(null);
    try {
      setFrcStatus(await cancelFlightReviewClubSubscription());
    } catch (err) {
      setCheckoutError((err as Error).message || "Não foi possível cancelar sua assinatura agora.");
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#071018] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071018]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            {logoSrc ? <img src={logoSrc} alt={schoolName} className="h-10 w-auto max-w-40 object-contain" /> : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/80">{schoolName}</p>
              <p className="text-sm font-black text-white">Flight Review Club</p>
            </div>
          </a>
          <button
            type="button"
            onClick={() => void handleCta()}
            disabled={hasFrcAccess || statusLoading}
            className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/30 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
          >
            {hasFrcAccess ? "Assinatura ativa" : activeClub.lpCtaLabel}
          </button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          {coverImageUrl ? (
            <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,16,24,0.98),rgba(7,16,24,0.78),rgba(7,16,24,0.42))]" />
          <div className="relative mx-auto grid min-h-[calc(100vh-74px)] max-w-7xl items-center gap-10 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_520px]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-200/80">Assinatura premium de formação</p>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                {activeClub.lpHeroTitle || "Flight Review Club"}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">{activeClub.lpHeroSubtitle}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleCta()}
                  disabled={hasFrcAccess || statusLoading}
                  className="rounded-lg bg-sky-300 px-6 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-950/40 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
                >
                  {hasFrcAccess ? "Você já tem acesso" : activeClub.lpCtaLabel}
                </button>
                {activePlan ? (
                  <div className="rounded-lg border border-white/15 bg-white/8 px-4 py-3">
                    <p className="text-xs text-slate-400">A partir de</p>
                    <p className="text-xl font-black text-white">{formatCurrency(activePlan.amount)} <span className="text-xs font-semibold text-slate-400">/{activePlan.label.toLowerCase()}</span></p>
                  </div>
                ) : null}
              </div>
              {checkoutError ? <p className="mt-4 max-w-xl text-sm text-amber-200">{checkoutError}</p> : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/72 p-4 shadow-2xl shadow-black/30">
              <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                <ScreenshotVisual item={screenshots[0] ?? DEFAULT_SCREENSHOTS[0]} index={0} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <HeroStat label="Voos" value="100" helper="trial atual" />
                <HeroStat label="Agenda" value="30d" helper="FRC" />
                <HeroStat label="Manual" value="7+" helper="benefícios" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-3">
          {valueProps.map((prop, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-[#0d1b24] p-5">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-200/80">0{index + 1}</p>
              <p className="mt-3 text-sm leading-6 text-slate-200">{prop}</p>
            </div>
          ))}
        </section>

        <section className="border-y border-white/10 bg-[#0b141c]">
          <div className="mx-auto max-w-7xl px-5 py-14">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200/75">Prints e experiencia</p>
              <h2 className="mt-3 text-3xl font-black text-white">Tudo que sustenta a assinatura fica visivel.</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">Use os prints configurados no admin para mostrar a plataforma real: revisao, planejamento, jornada, album e vantagens.</p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {screenshots.map((item, index) => (
                <article key={`${item.title}-${index}`} className="overflow-hidden rounded-xl border border-white/10 bg-[#071018]">
                  <div className="aspect-[16/10]">
                    <ScreenshotVisual item={item} index={index} />
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-black text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14">
          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200/75">Pacote real</p>
              <h2 className="mt-3 text-3xl font-black text-white">Benefícios do FRC</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                A oferta combina recursos premium da plataforma com entregas manuais controladas pela escola.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {benefitItems.map((benefit, index) => (
                <article key={`${benefit.text}-${index}`} className="flex gap-3 rounded-xl border border-white/10 bg-[#0d1b24] p-4">
                  {benefit.imageUrl ? (
                    <img src={benefit.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <BenefitIcon index={index} />
                  )}
                  <p className="self-center text-sm leading-6 text-slate-200">{benefit.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#0b141c]">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200/75">Assinatura</p>
              <h2 className="mt-3 text-3xl font-black text-white">Entre, revise seus voos e acompanhe sua jornada.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                O cancelamento programado mantém o acesso até o fim do período pago. Benefícios como NexAtlas e Clube 360 entram no fluxo manual da escola.
              </p>
              <button
                type="button"
                onClick={() => void handleCta()}
                disabled={hasFrcAccess || statusLoading}
                className="mt-6 rounded-lg bg-sky-300 px-7 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-950/40 transition hover:bg-sky-200 disabled:cursor-default disabled:border disabled:border-emerald-300/40 disabled:bg-emerald-300/10 disabled:text-emerald-100"
              >
                {hasFrcAccess ? "Assinatura ativa" : activeClub.lpCtaLabel}
              </button>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#071018] p-5">
              {hasFrcAccess ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/80">Seu acesso</p>
                  <h3 className="mt-2 text-xl font-black text-white">{membership?.planName || "Flight Review Club"}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Próxima renovação: <span className="font-semibold text-slate-200">{formatRenewalDate(membership?.nextPaymentDate)}</span>.
                  </p>
                  {membership?.cancelAtPeriodEnd ? (
                    <p className="mt-2 text-sm leading-6 text-amber-200">Cancelamento agendado. Acesso mantido até {formatRenewalDate(membership.accessUntil || membership.nextPaymentDate)}.</p>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => void handleCancelSubscription()}
                      disabled={cancelBusy}
                      className="mt-5 rounded-lg border border-red-300/35 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/10 disabled:opacity-60"
                    >
                      {cancelBusy ? "Cancelando..." : "Cancelar renovação"}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-sky-200/80">Plano</p>
                  <h3 className="mt-2 text-xl font-black text-white">{activePlan ? activePlan.label : "Assinatura FRC"}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {activePlan ? `${formatCurrency(activePlan.amount)} a cada ${activePlan.recurrencePeriodDays} dias.` : "Escolha o plano disponível no checkout da escola."}
                  </p>
                  <p className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                    Trial configurado: {activeClub.trialFlightCount} voos. Menu do aluno controlado pelo admin.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <FlightReviewClubCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        fallbackUrl={activeClub.ctaSubscriptionUrl}
        adhesionTermUrl={activeClub.adhesionTermUrl}
        plans={activeClub.subscriptionPlans}
        billingMode={activeClub.billingMode}
      />
      {authOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/80 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6" onClick={() => setAuthOpen(false)}>
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Entrar para assinar</p>
                <h3 className="mt-1 text-lg font-black text-white">Acesse sua conta de aluno</h3>
              </div>
              <button type="button" onClick={() => setAuthOpen(false)} className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
                Fechar
              </button>
            </div>
            <AuthPanel />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeroStat({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      <p className="text-[11px] text-slate-500">{helper}</p>
    </div>
  );
}
