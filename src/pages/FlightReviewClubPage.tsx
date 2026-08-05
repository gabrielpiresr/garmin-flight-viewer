import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { AuthPanel } from "../components/AuthPanel";
import { FlightReviewClubCheckoutModal } from "../components/FlightReviewClubCheckoutModal";
import { getEmailBrandSettings } from "../lib/notificationsDb";
import { getSchoolRules } from "../lib/schoolRulesDb";
import type { EmailBrandSettings } from "../types/notification";
import type { FlightReviewClubRules } from "../types/schoolRules";

const DEFAULT_BENEFITS = [
  "Analise da telemetria de cada voo.",
  "Analise detalhada das principais manobras.",
  "Video completo do voo com audio do aluno e do instrutor.",
  "Registro da evolucao do aluno ao longo da formacao.",
  "Revisao dos voos para chegar mais preparado na proxima aula.",
  "Conteudos, reunioes ou beneficios exclusivos oferecidos pela escola.",
];

const DEFAULT_VALUE_PROPS = [
  "Evoluir mais rapido revisando cada voo.",
  "Estudar acertos e pontos de melhoria com base em dados reais.",
  "Chegar mais preparado para a proxima aula.",
  "Documentar momentos importantes da formacao.",
  "Acompanhar sua trajetoria de forma mais completa.",
];

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

export function FlightReviewClubPage() {
  const { user } = useAuth();
  const [club, setClub] = useState<FlightReviewClubRules | null>(null);
  const [brand, setBrand] = useState<EmailBrandSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
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
    if (!user || !pendingCheckoutAfterAuth) return;
    setPendingCheckoutAfterAuth(false);
    setAuthOpen(false);
    if (user.role === "aluno") setCheckoutOpen(true);
    else setCheckoutError("A assinatura do Flight Review Club esta disponivel para alunos.");
  }, [pendingCheckoutAfterAuth, user]);

  if (loading) return <LoadingState />;

  if (!club?.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
          <h1 className="mt-2 text-2xl font-black">Programa nao disponivel</h1>
          <p className="mt-2 text-sm text-slate-400">
            O Flight Review Club ainda nao esta disponivel nesta escola.
          </p>
        </div>
      </div>
    );
  }

  const activeClub = club;
  const benefitItems = activeClub.lpBenefitItems.length > 0
    ? activeClub.lpBenefitItems
    : (activeClub.benefits.length > 0 ? activeClub.benefits : DEFAULT_BENEFITS).map((text) => ({ text, imageUrl: "" }));
  const valueProps = activeClub.lpValueProps.length > 0 ? activeClub.lpValueProps : DEFAULT_VALUE_PROPS;
  const schoolName = brand?.schoolName?.trim() || "Flight Review Club";
  const logoSrc = brand?.logoDataUrl || brand?.logoUrl || null;
  const coverImageUrl = activeClub.lpCoverImageUrl.trim();

  async function handleCta() {
    setCheckoutError(null);
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
    setCheckoutError("A assinatura do Flight Review Club esta disponivel para alunos.");
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-16 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">{schoolName}</p>
            <h1 className="mt-0.5 text-xl font-black text-white">Flight Review Club</h1>
          </div>
          {logoSrc ? <img src={logoSrc} alt={schoolName} className="h-10 w-auto max-w-36 object-contain" /> : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-5 py-10">
        <section
          className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-slate-900 px-6 py-10 shadow-2xl shadow-slate-950/60 sm:px-12"
          style={coverImageUrl ? {
            backgroundImage: `linear-gradient(90deg, rgba(2,6,23,0.94), rgba(2,6,23,0.62)), url(${coverImageUrl})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          } : undefined}
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
              Programa premium - {schoolName}
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">{activeClub.lpHeroTitle}</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">{activeClub.lpHeroSubtitle}</p>
            <button
              type="button"
              onClick={() => void handleCta()}
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
            >
              {activeClub.lpCtaLabel}
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </button>
            {checkoutError ? <p className="mt-3 max-w-xl text-xs text-amber-200">{checkoutError}</p> : null}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Beneficios</h2>
          <h3 className="mt-2 text-2xl font-black text-white">O que voce recebe</h3>
          <ul className="mt-6 grid gap-3">
            {benefitItems.map((benefit, index) => (
              <li key={index} className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50">
                  {benefit.imageUrl ? (
                    <img src={benefit.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </div>
                <span className="self-center text-sm leading-6 text-slate-200">{benefit.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-6 py-7">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">Por que entrar</h2>
          <h3 className="mt-2 text-xl font-black text-white">Sua evolucao como piloto</h3>
          <ul className="mt-5 space-y-2">
            {valueProps.map((prop, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1 text-emerald-400">-&gt;</span>
                {prop}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-sm text-slate-400">Pronto para elevar seu nivel de formacao?</p>
          <button
            type="button"
            onClick={() => void handleCta()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-7 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
          >
            {activeClub.lpCtaLabel}
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </main>
      <FlightReviewClubCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        fallbackUrl={activeClub.ctaSubscriptionUrl}
        adhesionTermUrl={activeClub.adhesionTermUrl}
      />
      {authOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/80 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6" onClick={() => setAuthOpen(false)}>
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
