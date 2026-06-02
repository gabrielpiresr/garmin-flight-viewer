import { useState } from "react";
import { getOnboardingImageUrl } from "../lib/onboardingDb";
import { renderRichContent } from "../lib/maneuverContent";
import type { OnboardingStep } from "../types/onboarding";

type OnboardingFlowProps = {
  steps: OnboardingStep[];
  onComplete: () => Promise<void>;
};

export function OnboardingFlow({ steps, onComplete }: OnboardingFlowProps) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const imageUrl = step?.imageFileId ? getOnboardingImageUrl(step.imageFileId) : "";

  async function handleNext() {
    if (!isLast) {
      setIndex((prev) => prev + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (e) {
      setError((e as Error).message || "Não foi possível concluir o onboarding.");
    } finally {
      setBusy(false);
    }
  }

  if (!step) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-cyan-400/90">
          Boas-vindas · {index + 1} de {steps.length}
        </p>

        {imageUrl ? (
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50">
            <img src={imageUrl} alt="" className="max-h-56 w-full object-contain" />
          </div>
        ) : null}

        <h1 className="mb-3 text-center text-xl font-semibold text-slate-100">{step.title}</h1>
        <div className="maneuver-article-content mb-8 space-y-2 text-center text-sm leading-relaxed text-slate-400">
          {renderRichContent(step.descriptionJson)}
        </div>

        {error ? <p className="mb-4 text-center text-sm text-red-400">{error}</p> : null}

        <div className="flex gap-3">
          {!isFirst ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setIndex((prev) => prev - 1)}
              className="flex-1 rounded-xl border border-slate-600 bg-slate-800 py-2.5 text-sm text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Anterior
            </button>
          ) : (
            <div className="flex-1" />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext()}
            className="flex-1 rounded-xl bg-cyan-600 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            {busy ? "Salvando…" : isLast ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}
