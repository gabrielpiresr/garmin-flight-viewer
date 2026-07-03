import { useState } from "react";
import { renderRichContent } from "../../lib/maneuverContent";
import type { ScheduleOnboardingStep } from "../../types/scheduleStudentHelp";

type ScheduleOnboardingModalProps = {
  steps: ScheduleOnboardingStep[];
  onComplete: () => Promise<void>;
};

export function ScheduleOnboardingModal({ steps, onComplete }: ScheduleOnboardingModalProps) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  if (!step) return null;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (e) {
      setError((e as Error).message || "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (!isLast) {
      setIndex((prev) => prev + 1);
      return;
    }
    await finish();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-onboarding-title"
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-700 bg-slate-900 shadow-xl sm:max-h-[88vh] sm:rounded-2xl">
        <div className="shrink-0 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-widest text-sky-400/90">
              Primeiro acesso · {index + 1} de {steps.length}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-50"
            >
              Pular
            </button>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-sky-500" : "w-1.5 bg-slate-600"}`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <h2 id="schedule-onboarding-title" className="text-lg font-semibold text-slate-100">
            {step.title}
          </h2>
          <div className="maneuver-article-content mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
            {renderRichContent(step.descriptionJson)}
          </div>
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>

        <div className="shrink-0 flex gap-2 border-t border-slate-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          {!isFirst ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setIndex((prev) => prev - 1)}
              className="flex-1 rounded-xl border border-slate-600 bg-slate-800 py-3 text-sm text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Anterior
            </button>
          ) : (
            <div className="hidden flex-1 sm:block" />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext()}
            className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "Salvando…" : isLast ? "Entendi" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}
