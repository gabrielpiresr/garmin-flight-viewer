import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createFlightReviewClubCheckout, quoteFlightReviewClubCheckout } from "../lib/caktoDb";
import type { FlightReviewClubQuote } from "../types/cakto";

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

export function FlightReviewClubCheckoutModal({
  open,
  onClose,
  fallbackUrl = "",
  adhesionTermUrl = "",
}: {
  open: boolean;
  onClose: () => void;
  fallbackUrl?: string;
  adhesionTermUrl?: string;
}) {
  const [quote, setQuote] = useState<FlightReviewClubQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuote(null);
    setError(null);
    setAcceptedTerms(false);
    setLoading(true);
    void quoteFlightReviewClubCheckout()
      .then((next) => {
        if (!cancelled) setQuote(next);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Nao foi possivel calcular seu preco agora.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      const checkout = await createFlightReviewClubCheckout();
      window.location.href = checkout.paymentUrl;
    } catch (err) {
      setError((err as Error).message || "Nao foi possivel gerar o checkout.");
      if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (!open) return null;
  const discountPercent = quote?.discountPercent ?? 0;
  const originalAmount = quote ? originalAmountFromDiscount(quote.amount, discountPercent) : null;

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
            <h3 className="mt-1 text-xl font-black text-white">Confira sua assinatura</h3>
            <p className="mt-1 text-sm text-slate-400">
              Voce esta comprando acesso aos beneficios do FRC em pagamento unico, valido ate o final do curso vinculado a sua trilha atual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="mt-5 space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-slate-800/60" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-800/40" />
          </div>
        ) : quote ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-sky-200/80">Valor encontrado</p>
                  {originalAmount ? (
                    <p className="mt-2 text-sm font-semibold text-slate-400 line-through">{formatCurrency(originalAmount)}</p>
                  ) : null}
                  <p className="text-3xl font-black text-white">{formatCurrency(quote.amount)}</p>
                  <p className="mt-1 text-sm text-slate-300">Pagamento unico pela Cakto.</p>
                </div>
                {discountPercent > 0 ? (
                  <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-right">
                    <p className="text-[11px] font-black uppercase tracking-wide text-amber-200">{discountPercent}% OFF</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-amber-100">Desconto ativo nesta faixa</p>
                  </div>
                ) : null}
              </div>
            </div>

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

            {discountPercent > 0 ? (
              <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
                Condicao especial aplicada automaticamente para sua trilha e horas voadas.
              </p>
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

        {error ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            Agora nao
          </button>
          <button
            type="button"
            onClick={() => void handleCheckout()}
            disabled={loading || !quote || checkoutBusy || !acceptedTerms}
            className="min-h-11 rounded-xl bg-sky-400 px-5 py-2 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60"
          >
            {checkoutBusy ? "Gerando checkout..." : "Ir para assinatura"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
