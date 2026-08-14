import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  cancelFlightReviewClubSubscription,
  createFlightReviewClubCheckout,
  getFlightReviewClubStatus,
  quoteFlightReviewClubCheckout,
} from "../lib/caktoDb";
import type { FlightReviewClubMembership, FlightReviewClubQuote, FlightReviewClubStatus } from "../types/cakto";
import type { FlightReviewClubBillingMode, FlightReviewClubSubscriptionPlan } from "../types/schoolRules";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatHours(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

function formatRange(quote: FlightReviewClubQuote): string {
  const min = formatHours(quote.minHours);
  if (quote.maxHours === null || quote.maxHours === undefined) return `a partir de ${min}`;
  return `entre ${min} e ${formatHours(quote.maxHours)}`;
}

function originalAmountFromDiscount(amount: number, discountPercent: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
    return null;
  }
  return Math.round((amount / (1 - discountPercent / 100)) * 100) / 100;
}

function formatRecurrence(days: number): string {
  if (days === 30) return "mensal";
  if (days === 90) return "trimestral";
  if (days === 180) return "semestral";
  if (days === 365) return "anual";
  return `a cada ${days} dias`;
}

function formatDate(value: string | null): string {
  if (!value) return "data ainda não disponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function membershipStatusLabel(membership: FlightReviewClubMembership | null): string {
  if (!membership) return "Ativo por trilha";
  if (membership.status === "trial") return "Trial";
  if (membership.status === "active") return "Ativa";
  if (membership.status === "canceled") return "Cancelada";
  return membership.status || "Indefinida";
}

export function FlightReviewClubCheckoutModal({
  open,
  onClose,
  fallbackUrl = "",
  adhesionTermUrl = "",
  plans = [],
  billingMode = "both",
}: {
  open: boolean;
  onClose: () => void;
  fallbackUrl?: string;
  adhesionTermUrl?: string;
  plans?: FlightReviewClubSubscriptionPlan[];
  billingMode?: FlightReviewClubBillingMode;
}) {
  const recurringPlans = useMemo(
    () => plans.filter((plan) => plan.enabled && Number(plan.amount) > 0),
    [plans],
  );
  const canUseRecurring = billingMode !== "legacy_one_time" && recurringPlans.length > 0;
  const defaultPlanId = recurringPlans[0]?.id ?? "";
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId);
  const [status, setStatus] = useState<FlightReviewClubStatus | null>(null);
  const [quote, setQuote] = useState<FlightReviewClubQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedPlanId(defaultPlanId);
  }, [defaultPlanId, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const planId = canUseRecurring ? (selectedPlanId || defaultPlanId) : undefined;
    const mode = canUseRecurring ? "student_subscription" : "legacy_one_time";
    setQuote(null);
    setStatus(null);
    setError(null);
    setAcceptedTerms(false);
    setLoading(true);
    void (async () => {
      const nextStatus = await getFlightReviewClubStatus();
      if (cancelled) return;
      setStatus(nextStatus);
      if (nextStatus.hasAccess) return;
      const nextQuote = await quoteFlightReviewClubCheckout(planId, mode);
      if (!cancelled) setQuote(nextQuote);
    })()
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Nao foi possivel carregar o Flight Review Club agora.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canUseRecurring, defaultPlanId, open, selectedPlanId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  async function handleCheckout() {
    if (checkoutBusy) return;
    if (!acceptedTerms) {
      setError("Confirme que voce leu e esta ciente do termo de adesao antes de continuar.");
      return;
    }
    setCheckoutBusy(true);
    setError(null);
    try {
      const checkout = await createFlightReviewClubCheckout(
        canUseRecurring ? (selectedPlanId || defaultPlanId) : undefined,
        canUseRecurring ? "student_subscription" : "legacy_one_time",
      );
      window.location.href = checkout.paymentUrl;
    } catch (err) {
      setError((err as Error).message || "Nao foi possivel gerar o checkout.");
      if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleCancel() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setError(null);
    try {
      setStatus(await cancelFlightReviewClubSubscription());
    } catch (err) {
      setError((err as Error).message || "Nao foi possivel cancelar sua assinatura agora.");
    } finally {
      setCancelBusy(false);
    }
  }

  if (!open) return null;
  const membership = status?.membership ?? null;
  const discountPercent = quote?.discountPercent ?? 0;
  const originalAmount = quote ? originalAmountFromDiscount(quote.amount, discountPercent) : null;
  const isSubscriptionQuote = quote?.billingMode === "student_subscription";

  const body = (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/80 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Assinar Flight Review Club"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl shadow-black/50 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
            <h3 className="mt-1 text-xl font-black text-white">{status?.hasAccess ? "Sua assinatura" : "Confira sua assinatura"}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {status?.hasAccess
                ? "Seu acesso ao FRC esta ativo na plataforma."
                : isSubscriptionQuote
                  ? "Escolha a recorrencia e finalize a assinatura pela Cakto."
                  : "Voce esta comprando acesso em pagamento unico, valido ate o final do curso vinculado a sua trilha atual."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="mt-5 space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-slate-800/60" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-800/40" />
          </div>
        ) : status?.hasAccess ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/80">Status</p>
              <p className="mt-1 text-2xl font-black text-white">{membershipStatusLabel(membership)}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plano</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{membership?.planName || "FRC legado por trilha"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Próxima cobrança</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{formatDate(membership?.nextPaymentDate ?? null)}</p>
                </div>
              </div>
            </div>
            {membership?.caktoSubscriptionId && ["active", "trial"].includes(membership.status) ? (
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelBusy}
                className="w-full min-h-11 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
              >
                {cancelBusy ? "Cancelando..." : "Cancelar assinatura"}
              </button>
            ) : null}
          </div>
        ) : quote ? (
          <div className="mt-5 space-y-4">
            {canUseRecurring ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {recurringPlans.map((plan) => {
                  const active = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        active ? "border-sky-400 bg-sky-400/10 text-white" : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <span className="block text-sm font-black">{plan.label}</span>
                      <span className="mt-1 block text-xs text-slate-400">{formatCurrency(plan.amount)} / {formatRecurrence(plan.recurrencePeriodDays)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-sky-200/80">Valor encontrado</p>
                  {originalAmount ? <p className="mt-2 text-sm font-semibold text-slate-400 line-through">{formatCurrency(originalAmount)}</p> : null}
                  <p className="text-3xl font-black text-white">{formatCurrency(quote.amount)}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {isSubscriptionQuote ? `Assinatura ${formatRecurrence(quote.recurrencePeriodDays ?? 30)} pela Cakto.` : "Pagamento unico pela Cakto."}
                  </p>
                </div>
                {discountPercent > 0 ? (
                  <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-right">
                    <p className="text-[11px] font-black uppercase tracking-wide text-amber-200">{discountPercent}% OFF</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-amber-100">Desconto ativo nesta faixa</p>
                  </div>
                ) : null}
              </div>
            </div>

            {!isSubscriptionQuote ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trilha</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{quote.trainingTrackName || "Trilha do aluno"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Horas voadas</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{formatHours(quote.flownHours)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Faixa</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{formatRange(quote)}</p>
                </div>
              </div>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => {
                  setAcceptedTerms(event.target.checked);
                  if (event.target.checked) setError(null);
                }}
                className="mt-1 h-4 w-4 shrink-0 accent-sky-400"
              />
              <span>
                Estou ciente e de acordo com o{" "}
                {adhesionTermUrl ? (
                  <a href={adhesionTermUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-300 underline underline-offset-4">
                    termo de adesao
                  </a>
                ) : (
                  <span className="font-semibold text-sky-300">termo de adesao</span>
                )}{" "}
                do Flight Review Club.
              </span>
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{error}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
            {status?.hasAccess ? "Fechar" : "Agora nao"}
          </button>
          {!status?.hasAccess ? (
            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={loading || !quote || checkoutBusy || !acceptedTerms}
              className="min-h-11 rounded-xl bg-sky-400 px-5 py-2 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60"
            >
              {checkoutBusy ? "Gerando checkout..." : "Ir para assinatura"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
