import { useCallback, useEffect, useState } from "react";
import {
  createOnboardingStep,
  deleteOnboardingStep,
  getOnboardingConfig,
  getOnboardingImageUrl,
  reorderOnboardingSteps,
  saveOnboardingConfig,
  updateOnboardingStep,
  uploadOnboardingImage,
} from "../../lib/onboardingDb";
import { uploadManeuverMedia } from "../../lib/maneuversDb";
import { createEmptyRichContent, richContentToHtml, richContentToPlainText } from "../../lib/maneuverContent";
import { hasRichTextContent } from "../../lib/richContentFields";
import type { OnboardingStep, OnboardingStepInput } from "../../types/onboarding";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type StepDraft = OnboardingStepInput & { id?: string };

const emptyDraft = (sortOrder: number): StepDraft => ({
  title: "",
  description: "",
  descriptionJson: createEmptyRichContent(),
  descriptionHtml: "",
  imageFileId: null,
  sortOrder,
});

export function OnboardingSettingsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [showInStudentMenu, setShowInStudentMenu] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [draft, setDraft] = useState<StepDraft | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOnboardingConfig();
      setEnabled(data.onboarding.enabled);
      setShowInStudentMenu(data.onboarding.showInStudentMenu);
      setSteps(data.steps);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(next: boolean) {
    if (next && steps.length === 0) {
      showToast({ variant: "warning", message: "Adicione pelo menos uma etapa antes de ativar o onboarding." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveOnboardingConfig({ enabled: next, showInStudentMenu });
      setEnabled(saved.enabled);
      showToast({ variant: "success", message: next ? "Onboarding ativado." : "Onboarding desativado." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleMenuToggle(next: boolean) {
    setSaving(true);
    try {
      const saved = await saveOnboardingConfig({ enabled, showInStudentMenu: next });
      setShowInStudentMenu(saved.showInStudentMenu);
      showToast({ variant: "success", message: next ? "Link adicionado ao menu do aluno." : "Link removido do menu do aluno." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft) return;
    if (!draft.title.trim() || !hasRichTextContent(draft.descriptionJson)) {
      showToast({ variant: "warning", message: "Título e descrição são obrigatórios." });
      return;
    }
    setSaving(true);
    try {
      const descriptionHtml = richContentToHtml(draft.descriptionJson);
      const payload: OnboardingStepInput = {
        title: draft.title.trim(),
        description: richContentToPlainText(draft.descriptionJson),
        descriptionJson: draft.descriptionJson,
        descriptionHtml,
        imageFileId: draft.imageFileId ?? null,
        sortOrder: draft.sortOrder,
      };
      if (draft.id) {
        const { data, error } = await updateOnboardingStep(draft.id, payload);
        if (error || !data) throw error ?? new Error("Falha ao atualizar etapa.");
        setSteps((prev) => prev.map((s) => (s.id === data.id ? data : s)).sort((a, b) => a.sortOrder - b.sortOrder));
      } else {
        const { data, error } = await createOnboardingStep(payload);
        if (error || !data) throw error ?? new Error("Falha ao criar etapa.");
        setSteps((prev) => [...prev, data].sort((a, b) => a.sortOrder - b.sortOrder));
      }
      setDraft(null);
      showToast({ variant: "success", message: "Etapa salva." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(step: OnboardingStep) {
    if (!window.confirm(`Remover a etapa "${step.title}"?`)) return;
    const { error } = await deleteOnboardingStep(step.id);
    if (error) {
      showToast({ variant: "error", message: error.message });
      return;
    }
    setSteps((prev) => prev.filter((s) => s.id !== step.id));
    if (draft?.id === step.id) setDraft(null);
    showToast({ variant: "success", message: "Etapa removida." });
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    const index = steps.findIndex((s) => s.id === stepId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= steps.length) return;
    const reordered = [...steps];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    const orderedIds = reordered.map((s) => s.id);
    const { error } = await reorderOnboardingSteps(orderedIds);
    if (error) {
      showToast({ variant: "error", message: error.message });
      return;
    }
    setSteps(reordered.map((s, i) => ({ ...s, sortOrder: i + 1 })));
  }

  async function handleImageUpload(file: File) {
    if (!draft) return;
    setUploadingImage(true);
    try {
      const { fileId, error } = await uploadOnboardingImage(file);
      if (error || !fileId) throw error ?? new Error("Falha no upload da imagem.");
      setDraft((prev) => (prev ? { ...prev, imageFileId: fileId } : prev));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setUploadingImage(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Onboarding</h2>
          <p className="mt-1 text-sm text-slate-400">
            Exibido no primeiro acesso de alunos aprovados. Cada etapa é uma tela com título, descrição e imagem opcional.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5">
            <span className="text-sm text-slate-300">Ativar onboarding</span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={(e) => void handleToggle(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5">
            <div>
              <span className="text-sm text-slate-300">Mostrar no menu do aluno</span>
              <p className="text-xs text-slate-500">Exibe link na barra lateral para o aluno acessar a qualquer hora</p>
            </div>
            <input
              type="checkbox"
              checked={showInStudentMenu}
              disabled={saving}
              onChange={(e) => void handleMenuToggle(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <article
            key={step.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Etapa {index + 1}</p>
              <h3 className="mt-1 font-medium text-slate-100">{step.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{step.description}</p>
              {step.imageFileId ? (
                <img
                  src={getOnboardingImageUrl(step.imageFileId)}
                  alt=""
                  className="mt-3 max-h-24 rounded-lg border border-slate-700 object-contain"
                />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={index === 0 || saving}
                onClick={() => void moveStep(step.id, -1)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Subir
              </button>
              <button
                type="button"
                disabled={index === steps.length - 1 || saving}
                onClick={() => void moveStep(step.id, 1)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Descer
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: step.id,
                    title: step.title,
                    description: step.description,
                    descriptionJson: step.descriptionJson,
                    descriptionHtml: step.descriptionHtml,
                    imageFileId: step.imageFileId,
                    sortOrder: step.sortOrder,
                  })
                }
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(step)}
                className="rounded-lg border border-red-700/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
              >
                Remover
              </button>
            </div>
          </article>
        ))}
        {steps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            Nenhuma etapa configurada.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setDraft(emptyDraft(steps.length + 1))}
        className="rounded-lg border border-cyan-700/50 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20"
      >
        Adicionar etapa
      </button>

      {draft ? (
        <div className="space-y-4 rounded-xl border border-cyan-700/40 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">{draft.id ? "Editar etapa" : "Nova etapa"}</h3>
            <button type="button" onClick={() => setDraft(null)} className="text-xs text-slate-500 hover:text-slate-300">
              Fechar
            </button>
          </div>
          <input
            value={draft.title}
            onChange={(e) => setDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
            placeholder="Título"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Descrição</label>
            <ManeuverRichTextEditor
              value={draft.descriptionJson}
              disabled={saving}
              placeholder="Descreva esta etapa do onboarding..."
              onChange={(descriptionJson) => setDraft((prev) => (prev ? { ...prev, descriptionJson } : prev))}
              onUploadMedia={async (file) => {
                const { data } = await uploadManeuverMedia(file);
                return data;
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">
              {uploadingImage ? "Enviando…" : "Imagem (opcional)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploadingImage}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {draft.imageFileId ? (
              <>
                <img
                  src={getOnboardingImageUrl(draft.imageFileId)}
                  alt=""
                  className="max-h-20 rounded border border-slate-700 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setDraft((prev) => (prev ? { ...prev, imageFileId: null } : prev))}
                  className="text-xs text-slate-500 hover:text-red-300"
                >
                  Remover imagem
                </button>
              </>
            ) : null}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveDraft()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Salvar etapa
          </button>
        </div>
      ) : null}
    </section>
  );
}
