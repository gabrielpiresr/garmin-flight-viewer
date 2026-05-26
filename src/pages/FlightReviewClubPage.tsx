import { useEffect, useState } from "react";
import { getEmailBrandSettings } from "../lib/notificationsDb";
import { getSchoolRules } from "../lib/schoolRulesDb";
import type { EmailBrandSettings } from "../types/notification";
import type { FlightReviewClubRules } from "../types/schoolRules";

const DEFAULT_BENEFITS = [
  "Análise da telemetria de cada voo.",
  "Análise detalhada das principais manobras.",
  "Vídeo completo do voo com áudio do aluno e do instrutor.",
  "Registro da evolução do aluno ao longo da formação.",
  "Revisão dos voos para chegar mais preparado na próxima aula.",
  "Possibilidade de conteúdos, reuniões ou benefícios exclusivos oferecidos pela escola.",
];

const VALUE_PROPS = [
  "Evoluir mais rápido revisando cada voo.",
  "Estudar acertos e pontos de melhoria com base em dados reais.",
  "Chegar mais preparado para a próxima aula.",
  "Documentar momentos importantes, como primeiro voo, primeiro solo e primeiras navegações.",
  "Acompanhar sua trajetória de formação de forma mais completa.",
];

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

export function FlightReviewClubPage() {
  const [club, setClub] = useState<FlightReviewClubRules | null>(null);
  const [brand, setBrand] = useState<EmailBrandSettings | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <LoadingState />;

  if (!club?.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
          <h1 className="mt-2 text-2xl font-black">Programa não disponível</h1>
          <p className="mt-2 text-sm text-slate-400">
            O Flight Review Club ainda não está disponível nesta escola. Entre em contato com a escola para mais informações.
          </p>
        </div>
      </div>
    );
  }

  const benefits = club.benefits.length > 0 ? club.benefits : DEFAULT_BENEFITS;
  const schoolName = brand?.schoolName?.trim() || "Flight Review Club";
  const logoSrc = brand?.logoDataUrl || brand?.logoUrl || null;

  return (
    <div className="min-h-screen bg-slate-950 pb-16 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">{schoolName}</p>
            <h1 className="mt-0.5 text-xl font-black text-white">Flight Review Club</h1>
          </div>
          {logoSrc ? (
            <img src={logoSrc} alt={schoolName} className="h-10 w-auto max-w-36 object-contain" />
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-5 py-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(15,23,42,0.96)_42%,rgba(16,185,129,0.18))] px-6 py-10 shadow-2xl shadow-slate-950/60 sm:px-12">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
              Programa premium · {schoolName}
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Flight Review Club
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Um programa premium da escola para alunos que desejam revisar seus voos com mais dados, acompanhar
              a própria evolução e investir mais na formação como piloto.
            </p>
            {club.ctaSubscriptionUrl ? (
              <a
                href={club.ctaSubscriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
              >
                Quero fazer parte do Flight Review Club
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </a>
            ) : null}
          </div>
        </section>

        {/* Benefícios */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Benefícios</h2>
          <h3 className="mt-2 text-2xl font-black text-white">O que você recebe</h3>
          <ul className="mt-6 space-y-3">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="text-sm text-slate-200">{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Proposta de valor */}
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-6 py-7">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">Por que entrar</h2>
          <h3 className="mt-2 text-xl font-black text-white">Sua evolução como piloto</h3>
          <ul className="mt-5 space-y-2">
            {VALUE_PROPS.map((prop, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1 text-emerald-400">→</span>
                {prop}
              </li>
            ))}
          </ul>
        </section>

        {/* CTA final */}
        {club.ctaSubscriptionUrl ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-sm text-slate-400">Pronto para elevar seu nível de formação?</p>
            <a
              href={club.ctaSubscriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-7 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
            >
              Quero fazer parte do Flight Review Club
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-slate-500">
            Entre em contato com a escola para saber como participar do Flight Review Club.
          </div>
        )}
      </main>
    </div>
  );
}
