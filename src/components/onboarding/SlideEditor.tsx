import { useCallback, useEffect, useState } from "react";
import { ManeuverRichTextEditor } from "../admin/ManeuverRichTextEditor";
import {
  createOnboardingStep,
  deleteOnboardingStep,
  getOnboardingImageUrl,
  reorderOnboardingSteps,
  updateOnboardingStep,
  uploadOnboardingImage,
  uploadOnboardingVideo,
} from "../../lib/onboardingDb";
import { uploadManeuverMedia } from "../../lib/maneuversDb";
import { createEmptyRichContent, richContentToPlainText } from "../../lib/maneuverContent";
import { useToast } from "../ui/ToastProvider";
import type { MediaPosition, OnboardingStep, OnboardingStepInput, SlideLayout } from "../../types/onboarding";
import type { ManeuverMediaUpload, ManeuverRichContent } from "../../types/maneuver";

const LAYOUTS: Array<{ id: SlideLayout; label: string; icon: string; desc: string }> = [
  { id: "hero", label: "Hero", icon: "🖼️", desc: "Imagem de fundo com texto sobre" },
  { id: "split", label: "Dois Lados", icon: "⬛⬛", desc: "Texto à esquerda, mídia à direita" },
  { id: "text-only", label: "Somente Texto", icon: "📄", desc: "Texto em largura total" },
  { id: "video-focus", label: "Foco em Vídeo", icon: "▶️", desc: "Vídeo centralizado com legenda" },
  { id: "list", label: "Lista", icon: "📋", desc: "Ícone + título + bullets" },
];

export type SlideDraft = {
  title: string;
  subtitle: string;
  descriptionJson: ManeuverRichContent;
  videoUrl: string;
  layout: SlideLayout;
  mediaPosition: MediaPosition;
  imageFileId: string | null;
};

type Props = {
  steps: OnboardingStep[];
  currentIndex: number;
  onStepsChange: (steps: OnboardingStep[]) => void;
  onNavigateTo: (index: number) => void;
  onDraftChange: (draft: SlideDraft) => void;
  onClose: () => void;
};

type Draft = SlideDraft;

function emptyDraft(): Draft {
  return {
    title: "",
    subtitle: "",
    descriptionJson: createEmptyRichContent(),
    videoUrl: "",
    layout: "hero",
    mediaPosition: "right",
    imageFileId: null,
  };
}

function stepToDraft(step: OnboardingStep): Draft {
  return {
    title: step.title,
    subtitle: step.subtitle ?? "",
    descriptionJson: step.descriptionJson,
    videoUrl: step.videoUrl ?? "",
    layout: step.layout,
    mediaPosition: step.mediaPosition,
    imageFileId: step.imageFileId,
  };
}

export function SlideEditor({ steps, currentIndex, onStepsChange, onNavigateTo, onDraftChange, onClose }: Props) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft>(
    steps[currentIndex] ? stepToDraft(steps[currentIndex]) : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoInputMode, setVideoInputMode] = useState<"url" | "file">("url");

  const currentStep = steps[currentIndex];

  useEffect(() => {
    const next = currentStep ? stepToDraft(currentStep) : emptyDraft();
    setDraft(next);
    onDraftChange(next);
  }, [currentIndex, currentStep?.id]);

  function updateDraft(updater: (prev: Draft) => Draft) {
    setDraft((prev) => {
      const next = updater(prev);
      onDraftChange(next);
      return next;
    });
  }

  const handleMediaUpload = useCallback(async (file: File): Promise<ManeuverMediaUpload | null> => {
    const { data, error } = await uploadManeuverMedia(file);
    if (error) {
      showToast({ variant: "error", message: "Erro ao enviar mídia." });
      return null;
    }
    return data;
  }, [showToast]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const { fileId, error } = await uploadOnboardingImage(file);
    setUploadingImage(false);
    if (error || !fileId) {
      showToast({ variant: "error", message: "Erro ao enviar imagem." });
      return;
    }
    updateDraft((d) => ({ ...d, imageFileId: fileId }));
  }

  async function handleVideoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingVideo(true);
    const { videoUrl, error } = await uploadOnboardingVideo(file);
    setUploadingVideo(false);
    if (error || !videoUrl) {
      showToast({ variant: "error", message: "Erro ao enviar vídeo." });
      return;
    }
    updateDraft((d) => ({ ...d, videoUrl }));
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      showToast({ variant: "warning", message: "Informe o título do slide." });
      return;
    }
    setSaving(true);
    const plainText = richContentToPlainText(draft.descriptionJson);
    const input: OnboardingStepInput = {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      description: plainText,
      descriptionJson: draft.descriptionJson,
      descriptionHtml: "",
      imageFileId: draft.imageFileId,
      videoUrl: draft.videoUrl.trim() || null,
      layout: draft.layout,
      mediaPosition: draft.mediaPosition,
      sortOrder: currentStep ? currentStep.sortOrder : steps.length + 1,
    };

    if (currentStep) {
      const { data, error } = await updateOnboardingStep(currentStep.id, input);
      if (error || !data) {
        showToast({ variant: "error", message: error?.message ?? "Erro ao salvar." });
      } else {
        const updated = steps.map((s) => (s.id === data.id ? data : s));
        onStepsChange(updated);
        showToast({ variant: "success", message: "Slide salvo." });
      }
    } else {
      const { data, error } = await createOnboardingStep(input);
      if (error || !data) {
        showToast({ variant: "error", message: error?.message ?? "Erro ao criar slide." });
      } else {
        const updated = [...steps, data];
        onStepsChange(updated);
        onNavigateTo(updated.length - 1);
        showToast({ variant: "success", message: "Slide criado." });
      }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!currentStep) return;
    if (!window.confirm(`Remover o slide "${currentStep.title}"?`)) return;
    setDeleting(true);
    const { error } = await deleteOnboardingStep(currentStep.id);
    if (error) {
      showToast({ variant: "error", message: error.message });
    } else {
      const updated = steps.filter((s) => s.id !== currentStep.id);
      onStepsChange(updated);
      onNavigateTo(Math.max(0, currentIndex - 1));
      showToast({ variant: "success", message: "Slide removido." });
    }
    setDeleting(false);
  }

  async function handleAddSlide() {
    setSaving(true);
    const emptyContent: ManeuverRichContent = createEmptyRichContent();
    const input: OnboardingStepInput = {
      title: "Novo slide",
      subtitle: null,
      description: "",
      descriptionJson: emptyContent,
      descriptionHtml: "",
      mediaPosition: "right",
      imageFileId: null,
      videoUrl: null,
      layout: "hero",
      sortOrder: steps.length + 1,
    };
    const { data, error } = await createOnboardingStep(input);
    if (error || !data) {
      showToast({ variant: "error", message: error?.message ?? "Erro ao criar slide." });
    } else {
      const updated = [...steps, data];
      onStepsChange(updated);
      onNavigateTo(updated.length - 1);
    }
    setSaving(false);
  }

  async function handleMoveUp() {
    if (!currentStep || currentIndex === 0) return;
    const newOrder = [...steps];
    [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
    await reorderOnboardingSteps(newOrder.map((s) => s.id));
    onStepsChange(newOrder);
    onNavigateTo(currentIndex - 1);
  }

  async function handleMoveDown() {
    if (!currentStep || currentIndex === steps.length - 1) return;
    const newOrder = [...steps];
    [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
    await reorderOnboardingSteps(newOrder.map((s) => s.id));
    onStepsChange(newOrder);
    onNavigateTo(currentIndex + 1);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">Editar Slide</span>
          {currentStep && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
              {currentIndex + 1}/{steps.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Layout Picker */}
        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">Layout</label>
          <div className="grid grid-cols-5 gap-1">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => updateDraft((d) => ({ ...d, layout: l.id }))}
                title={l.desc}
                className={`flex flex-col items-center rounded-lg border p-2 text-center transition ${
                  draft.layout === l.id
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
                }`}
              >
                <span className="text-lg">{l.icon}</span>
                <span className="mt-1 text-[10px] leading-tight">{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Título *</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => updateDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Título do slide"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Subtítulo</label>
          <input
            type="text"
            value={draft.subtitle}
            onChange={(e) => updateDraft((d) => ({ ...d, subtitle: e.target.value }))}
            placeholder="Subtítulo opcional"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>

        {/* Rich Text */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Conteúdo</label>
          <ManeuverRichTextEditor
            value={draft.descriptionJson as never}
            onChange={(val) => updateDraft((d) => ({ ...d, descriptionJson: val }))}
            onUploadMedia={handleMediaUpload}
            placeholder="Escreva o conteúdo do slide..."
          />
        </div>

        {/* Media Position — only for layouts that have a positionable media */}
        {(draft.layout === "split" || draft.layout === "text-only" || draft.layout === "list") && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Posição da mídia
            </label>
            <div className="flex gap-2">
              {(draft.layout === "split"
                ? ([
                    { value: "left", label: "← Esquerda", icon: "▤" },
                    { value: "right", label: "Direita →", icon: "▥" },
                  ] as const)
                : ([
                    { value: "top", label: "↑ Acima", icon: "▲" },
                    { value: "bottom", label: "Abaixo ↓", icon: "▼" },
                  ] as const)
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateDraft((d) => ({ ...d, mediaPosition: opt.value as MediaPosition }))}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${
                    draft.mediaPosition === opt.value
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image Upload */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Imagem {draft.layout === "hero" ? "(usada como fundo)" : ""}
          </label>
          {draft.imageFileId && (
            <div className="mb-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
              <div className="relative">
                <img
                  src={getOnboardingImageUrl(draft.imageFileId)}
                  alt="Preview"
                  className="h-32 w-full object-cover"
                />
                <button
                  onClick={() => updateDraft((d) => ({ ...d, imageFileId: null }))}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600/90 text-white transition hover:bg-red-500"
                  title="Remover imagem"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {uploadingImage ? "Enviando..." : "Selecionar imagem"}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
          </label>
        </div>

        {/* Video */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">Vídeo</label>
            <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setVideoInputMode("url")}
                className={`rounded px-2 py-1 transition ${videoInputMode === "url" ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
              >
                URL
              </button>
              <button
                type="button"
                onClick={() => setVideoInputMode("file")}
                className={`rounded px-2 py-1 transition ${videoInputMode === "file" ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
              >
                Arquivo local
              </button>
            </div>
          </div>
          {videoInputMode === "url" ? (
            <input
              type="url"
              value={draft.videoUrl}
              onChange={(e) => updateDraft((d) => ({ ...d, videoUrl: e.target.value }))}
              placeholder="https://youtube.com/watch?v=... ou link de vídeo MP4"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />
          ) : (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-300">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M9 10h6v4H9m0-4H6a2 2 0 00-2 2v0a2 2 0 002 2h3" />
                </svg>
                {uploadingVideo ? "Enviando vídeo..." : "Selecionar arquivo de vídeo (MP4, WebM, MOV)"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  className="hidden"
                  disabled={uploadingVideo}
                  onChange={handleVideoFileUpload}
                />
              </label>
              {draft.videoUrl && !draft.videoUrl.includes("youtube") && !draft.videoUrl.includes("youtu.be") && (
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
                  <span className="truncate text-xs text-slate-400">Vídeo carregado</span>
                  <button
                    type="button"
                    onClick={() => updateDraft((d) => ({ ...d, videoUrl: "" }))}
                    className="ml-2 flex-shrink-0 text-xs text-slate-500 hover:text-red-300"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          )}
          {draft.videoUrl && (
            <p className="mt-1 truncate text-[10px] text-slate-500">{draft.videoUrl}</p>
          )}
        </div>

        {/* Reorder */}
        {steps.length > 1 && currentStep && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Reordenar</label>
            <div className="flex gap-2">
              <button
                onClick={() => void handleMoveUp()}
                disabled={currentIndex === 0}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Mover para cima
              </button>
              <button
                onClick={() => void handleMoveDown()}
                disabled={currentIndex === steps.length - 1}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Mover para baixo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-slate-700 p-4 space-y-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar slide"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => void handleAddSlide()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-600 bg-slate-800 py-2 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo slide
          </button>
          {currentStep && (
            <button
              onClick={() => void handleDelete()}
              disabled={deleting || saving}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-800 bg-red-950/50 py-2 text-xs text-red-400 transition hover:bg-red-900/50 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
