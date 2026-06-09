import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { listOnboardingSteps } from "../lib/onboardingDb";
import { openOnboardingPdf } from "../lib/onboardingPdf";
import { SlideRenderer } from "../components/onboarding/SlideLayouts";
import type { MediaPosition, OnboardingStep, SlideLayout } from "../types/onboarding";
import type { ManeuverRichContent } from "../types/maneuver";
import type { SlideDraft } from "../components/onboarding/SlideEditor";

const SlideEditor = lazy(() =>
  import("../components/onboarding/SlideEditor").then((m) => ({ default: m.SlideEditor })),
);

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm transition hover:bg-slate-800"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Voltar ao app
    </button>
  );
}

function ProgressDots({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? "h-2 w-6 bg-cyan-400 sm:h-2.5 sm:w-10"
              : "h-2 w-2 bg-slate-600 hover:bg-slate-500 sm:h-2.5 sm:w-2.5"
          }`}
          aria-label={`Slide ${i + 1}`}
        />
      ))}
    </div>
  );
}

function draftToPreviewStep(base: OnboardingStep, draft: SlideDraft): OnboardingStep {
  return {
    ...base,
    title: draft.title || base.title,
    subtitle: draft.subtitle || null,
    descriptionJson: draft.descriptionJson as ManeuverRichContent,
    videoUrl: draft.videoUrl || null,
    layout: draft.layout as SlideLayout,
    mediaPosition: draft.mediaPosition as MediaPosition,
    imageFileId: draft.imageFileId,
  };
}

export function OnboardingPresentationPage() {
  const { user } = useAuth();
  const { canAction } = usePermissions();
  const canEdit = canAction("onboarding.edit");

  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [animating, setAnimating] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<SlideDraft | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await listOnboardingSteps();
        setSteps(data);
      } catch (e) {
        setError((e as Error).message ?? "Erro ao carregar conteúdo.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (editorOpen) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") navigate("next");
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") navigate("prev");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, steps.length, animating, editorOpen]);

  const navigate = useCallback(
    (dir: "next" | "prev") => {
      if (animating) return;
      if (dir === "next" && index >= steps.length - 1) return;
      if (dir === "prev" && index <= 0) return;
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (dir === "next" ? prev + 1 : prev - 1));
        setAnimating(false);
      }, 300);
    },
    [animating, index, steps.length],
  );

  const navigateTo = useCallback(
    (target: number) => {
      if (animating || target === index) return;
      setDirection(target > index ? "next" : "prev");
      setAnimating(true);
      setTimeout(() => {
        setIndex(target);
        setAnimating(false);
      }, 300);
    },
    [animating, index],
  );

  if (!user) {
    window.location.href = "/";
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <BackButton />
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
        <p className="mb-2 text-sm text-slate-400">Nenhuma apresentação configurada ainda.</p>
        {canEdit && (
          <p className="mb-4 text-xs text-slate-500">Ative o modo de edição para adicionar slides.</p>
        )}
        <div className="flex gap-3">
          {canEdit && (
            <button
              onClick={() => setEditorOpen(true)}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
            >
              Criar primeiro slide
            </button>
          )}
          <BackButton />
        </div>
      </div>
    );
  }

  const savedStep = steps[index];
  const step = editorOpen && previewDraft && savedStep
    ? draftToPreviewStep(savedStep, previewDraft)
    : savedStep;

  const slideOffset = animating
    ? direction === "next"
      ? "-translate-x-12 opacity-0"
      : "translate-x-12 opacity-0"
    : "translate-x-0 opacity-100";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950">
      {/* Main Content */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 py-3 sm:px-5 sm:py-4">
          <BackButton />
          <div className="flex items-center gap-2">
            <button
              onClick={() => openOnboardingPdf(steps)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm transition hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 16v-8m0 8l-3-3m3 3l3-3M5 20h14"
                />
              </svg>
              Baixar PDF
            </button>
            {canEdit && (
              <button
                onClick={() => setEditorOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs backdrop-blur-sm transition ${
                  editorOpen
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-slate-700/80 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                {editorOpen ? "Fechar editor" : "Editar apresentação"}
              </button>
            )}
          </div>
        </div>

        {/* Slide */}
        <div
          className={`h-full w-full transition-all duration-300 ease-in-out ${slideOffset}`}
          style={{ willChange: "transform, opacity" }}
        >
          {step && <SlideRenderer step={step} />}
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
          <button
            onClick={() => navigate("prev")}
            disabled={index === 0 || animating}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 backdrop-blur-sm transition hover:bg-slate-800 disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex flex-col items-center gap-2">
            <ProgressDots total={steps.length} current={index} onSelect={navigateTo} />
            <span className="text-xs text-slate-500">
              {index + 1} de {steps.length}
            </span>
          </div>

          <button
            onClick={() => navigate("next")}
            disabled={index === steps.length - 1 || animating}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 backdrop-blur-sm transition hover:bg-slate-800 disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor Panel */}
      {editorOpen && canEdit && (
        <div className="w-full flex-shrink-0 overflow-hidden border-l border-slate-700 transition-all duration-300 sm:w-[420px] md:w-[520px]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-slate-900">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              </div>
            }
          >
            <SlideEditor
              steps={steps}
              currentIndex={index}
              onStepsChange={setSteps}
              onNavigateTo={navigateTo}
              onDraftChange={setPreviewDraft}
              onClose={() => setEditorOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
