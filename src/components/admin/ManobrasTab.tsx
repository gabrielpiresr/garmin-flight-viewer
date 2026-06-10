import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listTrainingExercises } from "../../lib/trainingExercisesDb";
import type { TrainingExercise } from "../../types/trainingExercise";
import {
  createManeuverArticle,
  createManeuverSection,
  deleteManeuverArticle,
  deleteManeuverSection,
  listManeuverCatalog,
  updateManeuverArticle,
  updateManeuverSection,
  uploadManeuverMedia,
} from "../../lib/maneuversDb";
import {
  createEmptyRichContent,
  renderRichContent,
  richContentToHtml,
  richContentToPlainText,
} from "../../lib/maneuverContent";
import type {
  ManeuverArticle,
  ManeuverCatalog,
  ManeuverMediaUpload,
  ManeuverRichContent,
  ManeuverSection,
} from "../../types/maneuver";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";

type SectionForm = {
  title: string;
  description: string;
  isPublished: boolean;
  exerciseIds: string[];
};

type ArticleForm = {
  sectionId: string;
  /** Mantido apenas para preservar o valor de artigos antigos — sem UI. */
  subsectionId: string;
  title: string;
  summary: string;
  contentJson: ManeuverRichContent;
  tags: string;
  isPublished: boolean;
};

const SECTION_AUTOSAVE_DELAY_MS = 800;

function sectionFormFromSection(section: ManeuverSection): SectionForm {
  return {
    title: section.title,
    description: section.description ?? "",
    isPublished: section.isPublished,
    exerciseIds: section.exerciseIds ?? [],
  };
}

function createEmptyArticleForm(sectionId = ""): ArticleForm {
  return {
    sectionId,
    subsectionId: "",
    title: "",
    summary: "",
    contentJson: createEmptyRichContent(),
    tags: "",
    isPublished: true,
  };
}

export function ManobrasTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { canAction } = usePermissions();
  const canEdit = canAction("content.edit");
  const [catalog, setCatalog] = useState<ManeuverCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionForm | null>(null);
  const [sectionSaveState, setSectionSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleForm, setArticleForm] = useState<ArticleForm>(createEmptyArticleForm());
  const [articleEditorOpen, setArticleEditorOpen] = useState(false);
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);
  const [dragArticleId, setDragArticleId] = useState<string | null>(null);

  // Snapshot do último form persistido — evita autosave redundante ao abrir o editor.
  const sectionSnapshotRef = useRef<string>("");
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: listError }, { data: exData }] = await Promise.all([
      listManeuverCatalog(true),
      listTrainingExercises({ includeInactive: true, schoolId: DEFAULT_SCHOOL_ID }),
    ]);
    if (listError) {
      setError(listError.message);
      setCatalog({ sections: [], subsections: [], articles: [] });
    } else {
      setCatalog(data);
      setSelectedSectionId((current) => current || data.sections[0]?.id || "");
    }
    setExercises(exData);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const selectedSection = useMemo(
    () => catalog.sections.find((section) => section.id === selectedSectionId) ?? null,
    [catalog.sections, selectedSectionId],
  );

  const articlesForSelected = useMemo(
    () => catalog.articles.filter((article) => article.sectionId === selectedSectionId),
    [catalog.articles, selectedSectionId],
  );

  // ── Seções: edição com autosave ───────────────────────────────────────────

  const persistSection = useCallback(
    async (sectionId: string, form: SectionForm) => {
      if (!form.title.trim()) return; // aguarda um título válido
      setSectionSaveState("saving");
      const currentOrder =
        catalogRef.current.sections.find((s) => s.id === sectionId)?.order ??
        catalogRef.current.sections.length + 1;
      const result = await updateManeuverSection(sectionId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        order: currentOrder,
        isPublished: form.isPublished,
        exerciseIds: form.exerciseIds,
      });
      if (result.error) {
        setSectionSaveState("error");
        setError(result.error.message);
        return;
      }
      sectionSnapshotRef.current = JSON.stringify(form);
      setSectionSaveState("saved");
      if (result.data) {
        const updated = result.data;
        setCatalog((prev) => ({
          ...prev,
          sections: prev.sections.map((s) => (s.id === sectionId ? { ...updated, order: s.order } : s)),
        }));
      }
    },
    [],
  );

  // Autosave com debounce: qualquer mudança no form da seção salva sozinha.
  useEffect(() => {
    if (!editingSectionId || !sectionForm) return;
    if (JSON.stringify(sectionForm) === sectionSnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persistSection(editingSectionId, sectionForm);
    }, SECTION_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sectionForm, editingSectionId, persistSection]);

  const flushSectionSave = useCallback(() => {
    if (!editingSectionId || !sectionForm) return;
    if (JSON.stringify(sectionForm) === sectionSnapshotRef.current) return;
    void persistSection(editingSectionId, sectionForm);
  }, [editingSectionId, sectionForm, persistSection]);

  function openSectionEditor(section: ManeuverSection) {
    const form = sectionFormFromSection(section);
    sectionSnapshotRef.current = JSON.stringify(form);
    setEditingSectionId(section.id);
    setSectionForm(form);
    setSectionSaveState("idle");
    setArticleEditorOpen(false);
    setEditingArticleId(null);
  }

  function closeSectionEditor() {
    flushSectionSave();
    setEditingSectionId(null);
    setSectionForm(null);
    setSectionSaveState("idle");
  }

  async function handleCreateSection() {
    flushSectionSave();
    setSaving(true);
    const result = await createManeuverSection({
      title: "Nova seção",
      description: null,
      order: catalog.sections.length + 1,
      isPublished: false,
      exerciseIds: [],
    });
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Falha ao criar seção.");
      return;
    }
    const created = result.data;
    setCatalog((prev) => ({ ...prev, sections: [...prev.sections, created] }));
    setSelectedSectionId(created.id);
    openSectionEditor(created);
    showToast({ variant: "success", message: "Seção criada como rascunho — edite o título; tudo salva sozinho." });
  }

  function handleSelectSection(sectionId: string) {
    if (sectionId === selectedSectionId && !articleEditorOpen) {
      // Reclick na mesma seção: nada a fazer além de garantir o save pendente.
      flushSectionSave();
      return;
    }
    flushSectionSave();
    setSelectedSectionId(sectionId);
    setArticleEditorOpen(false);
    setEditingArticleId(null);
    // Se o editor de seção está aberto, passa a editar a seção clicada.
    if (editingSectionId) {
      const next = catalogRef.current.sections.find((s) => s.id === sectionId);
      if (next) openSectionEditor(next);
    }
  }

  async function handleDeleteSection(section: ManeuverSection) {
    if (!confirm(`Apagar seção "${section.title}"? Os artigos vinculados devem ser removidos separadamente.`)) return;
    const result = await deleteManeuverSection(section.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: "Seção apagada." });
    if (editingSectionId === section.id) {
      setEditingSectionId(null);
      setSectionForm(null);
    }
    if (selectedSectionId === section.id) setSelectedSectionId("");
    await load();
  }

  // ── Ordenação por arrastar ────────────────────────────────────────────────

  function handleSectionDragEnter(targetId: string) {
    if (!dragSectionId || dragSectionId === targetId) return;
    setCatalog((prev) => {
      const list = [...prev.sections];
      const from = list.findIndex((s) => s.id === dragSectionId);
      const to = list.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return { ...prev, sections: list };
    });
  }

  async function persistSectionOrder() {
    const list = catalogRef.current.sections;
    const changed = list
      .map((section, index) => ({ section, newOrder: index + 1 }))
      .filter(({ section, newOrder }) => section.order !== newOrder);
    if (changed.length === 0) return;
    setCatalog((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        const c = changed.find((item) => item.section.id === s.id);
        return c ? { ...s, order: c.newOrder } : s;
      }),
    }));
    const results = await Promise.all(
      changed.map(({ section, newOrder }) =>
        updateManeuverSection(section.id, {
          title: section.title,
          description: section.description,
          order: newOrder,
          isPublished: section.isPublished,
          exerciseIds: section.exerciseIds ?? [],
        }),
      ),
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError.message);
      await load();
    }
  }

  function handleArticleDragEnter(targetId: string) {
    if (!dragArticleId || dragArticleId === targetId) return;
    setCatalog((prev) => {
      const list = [...prev.articles];
      const from = list.findIndex((a) => a.id === dragArticleId);
      const to = list.findIndex((a) => a.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return { ...prev, articles: list };
    });
  }

  async function persistArticleOrder() {
    const list = catalogRef.current.articles.filter((a) => a.sectionId === selectedSectionId);
    const changed = list
      .map((article, index) => ({ article, newOrder: index + 1 }))
      .filter(({ article, newOrder }) => article.order !== newOrder);
    if (changed.length === 0) return;
    setCatalog((prev) => ({
      ...prev,
      articles: prev.articles.map((a) => {
        const c = changed.find((item) => item.article.id === a.id);
        return c ? { ...a, order: c.newOrder } : a;
      }),
    }));
    const results = await Promise.all(
      changed.map(({ article, newOrder }) =>
        updateManeuverArticle(article.id, {
          sectionId: article.sectionId,
          subsectionId: article.subsectionId,
          title: article.title,
          summary: article.summary,
          contentJson: article.contentJson,
          contentHtml: article.contentHtml,
          plainText: article.plainText,
          tags: article.tags,
          order: newOrder,
          sourcePageStart: article.sourcePageStart,
          sourcePageEnd: article.sourcePageEnd,
          isPublished: article.isPublished,
          actorUserId: article.createdBy,
        }),
      ),
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError.message);
      await load();
    }
  }

  // ── Artigos ───────────────────────────────────────────────────────────────

  function openArticleCreate() {
    flushSectionSave();
    setEditingArticleId(null);
    setArticleForm(createEmptyArticleForm(selectedSectionId));
    setEditingSectionId(null);
    setSectionForm(null);
    setArticleEditorOpen(true);
  }

  function openArticleEdit(article: ManeuverArticle) {
    flushSectionSave();
    setEditingArticleId(article.id);
    setArticleForm({
      sectionId: article.sectionId,
      subsectionId: article.subsectionId ?? "",
      title: article.title,
      summary: article.summary ?? "",
      contentJson: article.contentJson,
      tags: article.tags.join(", "),
      isPublished: article.isPublished,
    });
    setEditingSectionId(null);
    setSectionForm(null);
    setArticleEditorOpen(true);
  }

  async function handleUploadMedia(file: File): Promise<ManeuverMediaUpload | null> {
    const result = await uploadManeuverMedia(file);
    if (result.error) {
      setError(result.error.message);
      return null;
    }
    showToast({ variant: "success", message: "Mídia enviada." });
    return result.data;
  }

  async function handleSaveArticle() {
    if (!articleForm.sectionId || !articleForm.title.trim()) {
      setError("Escolha a seção e informe o título do artigo.");
      return;
    }
    const plainText = richContentToPlainText(articleForm.contentJson);
    if (!plainText.trim()) {
      setError("O artigo precisa de conteúdo.");
      return;
    }
    setSaving(true);
    const existing = editingArticleId
      ? catalog.articles.find((a) => a.id === editingArticleId) ?? null
      : null;
    const payload = {
      sectionId: articleForm.sectionId,
      subsectionId: articleForm.subsectionId || null,
      title: articleForm.title.trim(),
      summary: articleForm.summary.trim() || null,
      contentJson: articleForm.contentJson,
      contentHtml: richContentToHtml(articleForm.contentJson),
      plainText,
      tags: articleForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      order: existing?.order ?? articlesForSelected.length + 1,
      sourcePageStart: null,
      sourcePageEnd: null,
      isPublished: articleForm.isPublished,
      actorUserId: user?.id ?? null,
    };
    const result = editingArticleId
      ? await updateManeuverArticle(editingArticleId, payload)
      : await createManeuverArticle(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: editingArticleId ? "Artigo atualizado." : "Artigo criado." });
    setArticleEditorOpen(false);
    setEditingArticleId(null);
    await load();
  }

  async function handleDeleteArticle(article: ManeuverArticle) {
    if (!confirm(`Apagar artigo "${article.title}"?`)) return;
    const result = await deleteManeuverArticle(article.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: "Artigo apagado." });
    await load();
  }

  const sectionSaveLabel =
    sectionSaveState === "saving"
      ? "Salvando…"
      : sectionSaveState === "saved"
        ? "Salvo ✓"
        : sectionSaveState === "error"
          ? "Erro ao salvar"
          : "Alterações salvam automaticamente";

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Manobras</p>
            <h2 className="text-xl font-semibold text-slate-100">Gestão do material de estudo</h2>
            <p className="mt-1 text-sm text-slate-500">
              Arraste seções e artigos para reordenar. As alterações da seção salvam automaticamente.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCreateSection()}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Nova seção
              </button>
              <button
                type="button"
                onClick={openArticleCreate}
                disabled={!selectedSectionId}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                Novo artigo
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr]">
          <aside className="max-h-[calc(100vh-11rem)] overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900/50 p-2">
            {catalog.sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                draggable={canEdit}
                onDragStart={() => setDragSectionId(section.id)}
                onDragEnter={() => handleSectionDragEnter(section.id)}
                onDragOver={(event) => event.preventDefault()}
                onDragEnd={() => {
                  void persistSectionOrder();
                  setDragSectionId(null);
                }}
                onClick={() => handleSelectSection(section.id)}
                className={`block w-full border-b border-slate-800/80 px-3 py-3 text-left text-sm transition last:border-b-0 ${
                  dragSectionId === section.id ? "opacity-40" : ""
                } ${
                  section.id === selectedSectionId
                    ? "rounded-xl border-b-transparent bg-emerald-500/10 text-emerald-400"
                    : "text-slate-300 hover:rounded-xl hover:bg-slate-800/70"
                } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <span>Seção {index + 1}</span>
                  <span className="flex items-center gap-1.5">
                    {!section.isPublished ? (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-400/90">
                        Rascunho
                      </span>
                    ) : null}
                    {canEdit ? <span className="text-slate-600">⠿</span> : null}
                  </span>
                </span>
                <span className="mt-0.5 block font-medium leading-snug">{section.title}</span>
              </button>
            ))}
          </aside>

          <main className="min-w-0 space-y-4">
            {!articleEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Seção selecionada</p>
                    <h3 className="mt-1 break-words text-xl font-semibold text-slate-100">
                      {selectedSection ? selectedSection.title : "Selecione uma seção"}
                    </h3>
                    {selectedSection?.description ? (
                      <p className="mt-1 text-sm text-slate-500">{selectedSection.description}</p>
                    ) : null}
                  </div>
                  {selectedSection && canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {editingSectionId !== selectedSection.id ? (
                        <button
                          type="button"
                          onClick={() => openSectionEditor(selectedSection)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Editar seção
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDeleteSection(selectedSection)}
                        className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Apagar seção
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {!articleEditorOpen && editingSectionId && sectionForm ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">Editar seção</h3>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs ${
                        sectionSaveState === "error"
                          ? "text-red-400"
                          : sectionSaveState === "saving"
                            ? "text-amber-300"
                            : "text-slate-500"
                      }`}
                    >
                      {sectionSaveLabel}
                    </span>
                    <button
                      type="button"
                      onClick={closeSectionEditor}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                  <input
                    value={sectionForm.title}
                    onChange={(event) => setSectionForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                    placeholder="Título da seção"
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={sectionForm.isPublished}
                      onChange={(event) =>
                        setSectionForm((prev) => (prev ? { ...prev, isPublished: event.target.checked } : prev))
                      }
                    />
                    Publicada
                  </label>
                  <textarea
                    value={sectionForm.description}
                    onChange={(event) =>
                      setSectionForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                    }
                    placeholder="Descrição opcional"
                    rows={2}
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 md:col-span-2"
                  />
                </div>
                {exercises.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-slate-400">Critérios vinculados a esta manobra</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {exercises.map((ex) => (
                        <label
                          key={ex.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300 hover:border-slate-600"
                        >
                          <input
                            type="checkbox"
                            checked={sectionForm.exerciseIds.includes(ex.id)}
                            onChange={(e) =>
                              setSectionForm((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      exerciseIds: e.target.checked
                                        ? [...prev.exerciseIds, ex.id]
                                        : prev.exerciseIds.filter((id) => id !== ex.id),
                                    }
                                  : prev,
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">{ex.title}</span>
                          {!ex.isActive ? (
                            <span className="shrink-0 rounded px-1 text-[10px] text-slate-500">inativo</span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {articleEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">{editingArticleId ? "Editar artigo" : "Novo artigo"}</h3>
                  <button
                    type="button"
                    onClick={() => setArticleEditorOpen(false)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Voltar
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Título do artigo</span>
                    <input
                      value={articleForm.title}
                      onChange={(event) => setArticleForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Ex.: Decolagem normal"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Tags</span>
                    <input
                      value={articleForm.tags}
                      onChange={(event) => setArticleForm((prev) => ({ ...prev, tags: event.target.value }))}
                      placeholder="Separadas por vírgula"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400 md:col-span-2">
                    <span>Resumo</span>
                    <input
                      value={articleForm.summary}
                      onChange={(event) => setArticleForm((prev) => ({ ...prev, summary: event.target.value }))}
                      placeholder="Resumo exibido antes do conteúdo"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={articleForm.isPublished}
                      onChange={(event) => setArticleForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
                    />
                    Publicado
                  </label>
                </div>
                <div className="mt-4">
                  <ManeuverRichTextEditor
                    value={articleForm.contentJson}
                    onChange={(contentJson) => setArticleForm((prev) => ({ ...prev, contentJson }))}
                    onUploadMedia={handleUploadMedia}
                    disabled={saving}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveArticle()}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : editingArticleId ? "Salvar artigo" : "Criar artigo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setArticleEditorOpen(false)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              </section>
            ) : null}

            {!articleEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Artigos</p>
                    <h3 className="text-lg font-semibold text-slate-100">{selectedSection?.title ?? "Selecione uma seção"}</h3>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={openArticleCreate}
                      disabled={!selectedSectionId}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Novo artigo
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3">
                  {articlesForSelected.length ? (
                    articlesForSelected.map((article, index) => (
                      <article
                        key={article.id}
                        draggable={canEdit}
                        onDragStart={() => setDragArticleId(article.id)}
                        onDragEnter={() => handleArticleDragEnter(article.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnd={() => {
                          void persistArticleOrder();
                          setDragArticleId(null);
                        }}
                        className={`rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 ${
                          dragArticleId === article.id ? "opacity-40" : ""
                        } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            {canEdit ? <span className="mt-1 shrink-0 text-slate-600">⠿</span> : null}
                            <div className="min-w-0">
                              <h4 className="break-words text-base font-semibold text-slate-100">
                                {index + 1}. {article.title}
                              </h4>
                              <p className="text-xs text-slate-500">{article.isPublished ? "Publicado" : "Rascunho"}</p>
                            </div>
                          </div>
                          {canEdit ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openArticleEdit(article)}
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteArticle(article)}
                                className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                              >
                                Apagar
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {article.summary ? <p className="mt-2 text-sm text-slate-400">{article.summary}</p> : null}
                        <div className="mt-3 line-clamp-3 space-y-2 text-sm text-slate-300">
                          {renderRichContent(article.contentJson)}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-xl border border-slate-700/40 bg-slate-950/20 p-10 text-center text-sm text-slate-500">
                      Nenhum artigo nesta seção.
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
