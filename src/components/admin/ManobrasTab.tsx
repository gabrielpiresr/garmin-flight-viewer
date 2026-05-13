import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createManeuverArticle,
  createManeuverSection,
  createManeuverSubsection,
  deleteManeuverArticle,
  deleteManeuverSection,
  deleteManeuverSubsection,
  listManeuverCatalog,
  updateManeuverArticle,
  updateManeuverSection,
  updateManeuverSubsection,
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
  ManeuverSubsection,
} from "../../types/maneuver";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";

type SectionForm = {
  title: string;
  description: string;
  order: string;
  isPublished: boolean;
};

type SubsectionForm = SectionForm & {
  sectionId: string;
};

type ArticleForm = {
  sectionId: string;
  subsectionId: string;
  title: string;
  summary: string;
  contentJson: ManeuverRichContent;
  tags: string;
  order: string;
  isPublished: boolean;
};

const emptySectionForm: SectionForm = {
  title: "",
  description: "",
  order: "1",
  isPublished: true,
};

const emptySubsectionForm: SubsectionForm = {
  ...emptySectionForm,
  sectionId: "",
};

function createEmptyArticleForm(sectionId = ""): ArticleForm {
  return {
    sectionId,
    subsectionId: "",
    title: "",
    summary: "",
    contentJson: createEmptyRichContent(),
    tags: "",
    order: "1",
    isPublished: true,
  };
}

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ManobrasTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState<ManeuverCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionForm>(emptySectionForm);
  const [editingSubsectionId, setEditingSubsectionId] = useState<string | null>(null);
  const [subsectionForm, setSubsectionForm] = useState<SubsectionForm>(emptySubsectionForm);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleForm, setArticleForm] = useState<ArticleForm>(createEmptyArticleForm());
  const [articleEditorOpen, setArticleEditorOpen] = useState(false);
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);
  const [subsectionEditorOpen, setSubsectionEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listManeuverCatalog(true);
    if (listError) {
      setError(listError.message);
      setCatalog({ sections: [], subsections: [], articles: [] });
    } else {
      setCatalog(data);
      setSelectedSectionId((current) => current || data.sections[0]?.id || "");
    }
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

  const subsectionsForSelected = useMemo(
    () => catalog.subsections.filter((subsection) => subsection.sectionId === selectedSectionId),
    [catalog.subsections, selectedSectionId],
  );

  const articlesForSelected = useMemo(
    () => catalog.articles.filter((article) => article.sectionId === selectedSectionId),
    [catalog.articles, selectedSectionId],
  );

  function resetSectionForm() {
    setEditingSectionId(null);
    setSectionForm({
      ...emptySectionForm,
      order: String(catalog.sections.length + 1),
    });
    setSectionEditorOpen(true);
  }

  function resetSubsectionForm(sectionId = selectedSectionId) {
    setEditingSubsectionId(null);
    setSubsectionForm({
      ...emptySubsectionForm,
      sectionId,
      order: String(subsectionsForSelected.length + 1),
    });
    setSubsectionEditorOpen(true);
  }

  function openArticleCreate() {
    setEditingArticleId(null);
    setArticleForm(createEmptyArticleForm(selectedSectionId));
    setSectionEditorOpen(false);
    setSubsectionEditorOpen(false);
    setArticleEditorOpen(true);
  }

  function openArticleEdit(article: ManeuverArticle) {
    setEditingArticleId(article.id);
    setArticleForm({
      sectionId: article.sectionId,
      subsectionId: article.subsectionId ?? "",
      title: article.title,
      summary: article.summary ?? "",
      contentJson: article.contentJson,
      tags: article.tags.join(", "),
      order: String(article.order),
      isPublished: article.isPublished,
    });
    setSectionEditorOpen(false);
    setSubsectionEditorOpen(false);
    setArticleEditorOpen(true);
  }

  function handleSelectSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    setArticleEditorOpen(false);
    setEditingArticleId(null);
    setSubsectionEditorOpen(false);
    setEditingSubsectionId(null);
  }

  async function handleSaveSection() {
    if (!sectionForm.title.trim()) {
      setError("Informe o título da seção.");
      return;
    }
    setSaving(true);
    const payload = {
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim() || null,
      order: toNumber(sectionForm.order, catalog.sections.length + 1),
      isPublished: sectionForm.isPublished,
    };
    const result = editingSectionId
      ? await updateManeuverSection(editingSectionId, payload)
      : await createManeuverSection(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: editingSectionId ? "Seção atualizada." : "Seção criada." });
    if (result.data) setSelectedSectionId(result.data.id);
    setSectionEditorOpen(false);
    setEditingSectionId(null);
    setSectionForm({ ...emptySectionForm, order: String(catalog.sections.length + 1) });
    await load();
  }

  async function handleDeleteSection(section: ManeuverSection) {
    if (!confirm(`Apagar seção "${section.title}"? Os artigos vinculados devem ser removidos separadamente.`)) return;
    const result = await deleteManeuverSection(section.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: "Seção apagada." });
    if (selectedSectionId === section.id) setSelectedSectionId("");
    await load();
  }

  async function handleSaveSubsection() {
    if (!subsectionForm.sectionId || !subsectionForm.title.trim()) {
      setError("Escolha a seção e informe o título da subseção.");
      return;
    }
    setSaving(true);
    const payload = {
      sectionId: subsectionForm.sectionId,
      title: subsectionForm.title.trim(),
      description: subsectionForm.description.trim() || null,
      order: toNumber(subsectionForm.order, subsectionsForSelected.length + 1),
      isPublished: subsectionForm.isPublished,
    };
    const result = editingSubsectionId
      ? await updateManeuverSubsection(editingSubsectionId, payload)
      : await createManeuverSubsection(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: editingSubsectionId ? "Subseção atualizada." : "Subseção criada." });
    setSubsectionEditorOpen(false);
    setEditingSubsectionId(null);
    setSubsectionForm({ ...emptySubsectionForm, sectionId: payload.sectionId, order: String(subsectionsForSelected.length + 1) });
    await load();
  }

  async function handleDeleteSubsection(subsection: ManeuverSubsection) {
    if (!confirm(`Apagar subseção "${subsection.title}"?`)) return;
    const result = await deleteManeuverSubsection(subsection.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: "Subseção apagada." });
    await load();
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
    const payload = {
      sectionId: articleForm.sectionId,
      subsectionId: articleForm.subsectionId || null,
      title: articleForm.title.trim(),
      summary: articleForm.summary.trim() || null,
      contentJson: articleForm.contentJson,
      contentHtml: richContentToHtml(articleForm.contentJson),
      plainText,
      tags: articleForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      order: toNumber(articleForm.order, articlesForSelected.length + 1),
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

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Manobras</p>
            <h2 className="text-xl font-semibold text-white">Gestão do material de estudo</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecione uma seção, revise seus artigos e abra os formulários apenas quando precisar editar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetSectionForm}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
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
            {catalog.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSelectSection(section.id)}
                className={`block w-full border-b border-slate-800/80 px-3 py-3 text-left text-sm transition last:border-b-0 ${
                  section.id === selectedSectionId
                    ? "rounded-xl border-b-transparent bg-emerald-500/10 text-emerald-100"
                    : "text-slate-300 hover:rounded-xl hover:bg-slate-800/70"
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Seção {section.order}
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
                    <h3 className="mt-1 break-words text-xl font-semibold text-white">
                      {selectedSection ? `${selectedSection.order}. ${selectedSection.title}` : "Selecione uma seção"}
                    </h3>
                    {selectedSection?.description ? <p className="mt-1 text-sm text-slate-500">{selectedSection.description}</p> : null}
                  </div>
                  {selectedSection ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSectionId(selectedSection.id);
                          setSectionForm({
                            title: selectedSection.title,
                            description: selectedSection.description ?? "",
                            order: String(selectedSection.order),
                            isPublished: selectedSection.isPublished,
                          });
                          setSectionEditorOpen(true);
                        }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Editar seção
                      </button>
                      <button
                        type="button"
                        onClick={() => resetSubsectionForm(selectedSection.id)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Nova subseção
                      </button>
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

            {sectionEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">{editingSectionId ? "Editar seção" : "Nova seção"}</h3>
                  <button type="button" onClick={() => setSectionEditorOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                    Fechar
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_7rem_10rem]">
                  <input value={sectionForm.title} onChange={(event) => setSectionForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título da seção" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <input value={sectionForm.order} onChange={(event) => setSectionForm((prev) => ({ ...prev, order: event.target.value }))} placeholder="Ordem" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
                    <input type="checkbox" checked={sectionForm.isPublished} onChange={(event) => setSectionForm((prev) => ({ ...prev, isPublished: event.target.checked }))} />
                    Publicada
                  </label>
                  <textarea value={sectionForm.description} onChange={(event) => setSectionForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição opcional" rows={2} className="md:col-span-3 w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </div>
                <button type="button" disabled={saving} onClick={() => void handleSaveSection()} className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60">
                  {editingSectionId ? "Salvar seção" : "Criar seção"}
                </button>
              </section>
            ) : null}

            {subsectionEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">{editingSubsectionId ? "Editar subseção" : "Nova subseção"}</h3>
                  <button type="button" onClick={() => setSubsectionEditorOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                    Fechar
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_7rem_10rem]">
                  <input value={subsectionForm.title} onChange={(event) => setSubsectionForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Título da subseção" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <input value={subsectionForm.order} onChange={(event) => setSubsectionForm((prev) => ({ ...prev, order: event.target.value }))} placeholder="Ordem" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
                    <input type="checkbox" checked={subsectionForm.isPublished} onChange={(event) => setSubsectionForm((prev) => ({ ...prev, isPublished: event.target.checked }))} />
                    Publicada
                  </label>
                </div>
                <button type="button" disabled={saving || !selectedSectionId} onClick={() => void handleSaveSubsection()} className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60">
                  {editingSubsectionId ? "Salvar subseção" : "Criar subseção"}
                </button>
              </section>
            ) : null}

            {articleEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">{editingArticleId ? "Editar artigo" : "Novo artigo"}</h3>
                  <button type="button" onClick={() => setArticleEditorOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                    Voltar
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Título do artigo</span>
                    <input value={articleForm.title} onChange={(event) => setArticleForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Ex.: Decolagem normal" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Subseção</span>
                    <select value={articleForm.subsectionId} onChange={(event) => setArticleForm((prev) => ({ ...prev, subsectionId: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500">
                      <option value="">Sem subseção</option>
                      {subsectionsForSelected.map((subsection) => <option key={subsection.id} value={subsection.id}>{subsection.title}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400 md:col-span-2">
                    <span>Resumo</span>
                    <input value={articleForm.summary} onChange={(event) => setArticleForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="Resumo exibido antes do conteúdo" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Tags</span>
                    <input value={articleForm.tags} onChange={(event) => setArticleForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Separadas por vírgula" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Ordem</span>
                    <input value={articleForm.order} onChange={(event) => setArticleForm((prev) => ({ ...prev, order: event.target.value }))} placeholder="Ordem" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500" />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300">
                    <input type="checkbox" checked={articleForm.isPublished} onChange={(event) => setArticleForm((prev) => ({ ...prev, isPublished: event.target.checked }))} />
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
                  <button type="button" disabled={saving} onClick={() => void handleSaveArticle()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60">
                    {saving ? "Salvando..." : editingArticleId ? "Salvar artigo" : "Criar artigo"}
                  </button>
                  <button type="button" onClick={() => setArticleEditorOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800">
                    Cancelar
                  </button>
                </div>
              </section>
            ) : null}

            {!articleEditorOpen ? <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">Subseções</h3>
                  <button type="button" onClick={() => resetSubsectionForm(selectedSectionId)} disabled={!selectedSectionId} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                    Nova
                  </button>
                </div>
                <div className="space-y-2">
                  {subsectionsForSelected.length ? subsectionsForSelected.map((subsection) => (
                    <div key={subsection.id} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
                      <p className="text-sm font-medium text-slate-200">{subsection.order}. {subsection.title}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubsectionId(subsection.id);
                            setSubsectionForm({
                              sectionId: subsection.sectionId,
                              title: subsection.title,
                              description: subsection.description ?? "",
                              order: String(subsection.order),
                              isPublished: subsection.isPublished,
                            });
                            setSubsectionEditorOpen(true);
                          }}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button type="button" onClick={() => void handleDeleteSubsection(subsection)} className="rounded border border-red-700/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">
                          Apagar
                        </button>
                      </div>
                    </div>
                  )) : <p className="rounded-lg border border-slate-800 bg-slate-950/20 p-4 text-sm text-slate-500">Nenhuma subseção nesta seção.</p>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Artigos</p>
                    <h3 className="text-lg font-semibold text-white">{selectedSection?.title ?? "Selecione uma seção"}</h3>
                  </div>
                  <button type="button" onClick={openArticleCreate} disabled={!selectedSectionId} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                    Novo artigo
                  </button>
                </div>
                <div className="grid gap-3">
                  {articlesForSelected.length ? articlesForSelected.map((article) => (
                    <article key={article.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="break-words text-base font-semibold text-slate-100">{article.order}. {article.title}</h4>
                          <p className="text-xs text-slate-500">{article.isPublished ? "Publicado" : "Rascunho"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openArticleEdit(article)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                            Editar
                          </button>
                          <button type="button" onClick={() => void handleDeleteArticle(article)} className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">
                            Apagar
                          </button>
                        </div>
                      </div>
                      {article.summary ? <p className="mt-2 text-sm text-slate-400">{article.summary}</p> : null}
                      <div className="mt-3 line-clamp-3 space-y-2 text-sm text-slate-300">{renderRichContent(article.contentJson)}</div>
                    </article>
                  )) : (
                    <div className="rounded-xl border border-slate-700/40 bg-slate-950/20 p-10 text-center text-sm text-slate-500">
                      Nenhum artigo nesta seção.
                    </div>
                  )}
                </div>
              </section>
            </div> : null}
          </main>
        </div>
      )}
    </div>
  );
}
