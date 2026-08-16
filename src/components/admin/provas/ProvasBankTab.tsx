import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SCHOOL_ID } from "../../../lib/appwrite";
import {
  createProva,
  createProvaCategory,
  createProvaQuestion,
  deleteProva,
  deleteProvaCategory,
  deleteProvaQuestion,
  listProvaCategories,
  listProvaQuestions,
  listProvas,
  updateProva,
  updateProvaCategory,
  updateProvaQuestion,
} from "../../../lib/provasDb";
import {
  emptyMcPayload,
  type ProvaBankCard,
  type ProvaCategory,
  type ProvaMcPayload,
  type ProvaQuestion,
  type ProvaQuestionInput,
  type ProvaQuestionType,
  type ProvaStatus,
} from "../../../types/provas";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/ToastProvider";
import { ProvaQuestionEditor } from "../../provas/ProvaQuestionEditor";

const schoolId = DEFAULT_SCHOOL_ID;
const PROVA_AUTOSAVE_DELAY_MS = 800;

type ProvaForm = {
  title: string;
  description: string;
  passingPercent: number;
  timeLimitHours: number;
  status: ProvaStatus;
};

type CategoryForm = {
  name: string;
  drawCount: number;
};

function provaFormFromCard(card: ProvaBankCard): ProvaForm {
  return {
    title: card.title,
    description: card.description ?? "",
    passingPercent: card.passingPercent,
    timeLimitHours: card.timeLimitHours,
    status: card.status,
  };
}

function categoryFormFromCategory(category: ProvaCategory): CategoryForm {
  return {
    name: category.name,
    drawCount: category.drawCount,
  };
}

function questionTypeLabel(type: ProvaQuestionType) {
  if (type === "map") return "Mapa";
  if (type === "image") return "Imagem";
  return "Múltipla escolha";
}

function questionSummary(question: ProvaQuestion) {
  if (question.description.trim()) return question.description;
  if (question.type === "mc") {
    const payload = question.payload as ProvaMcPayload;
    const count = payload.options?.length ?? 0;
    return count ? `${count} alternativas` : "Sem alternativas";
  }
  if (question.type === "map") return "Clique no mapa";
  return "Clique na imagem";
}

export function ProvasBankTab() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<ProvaBankCard[]>([]);
  const [categories, setCategories] = useState<ProvaCategory[]>([]);
  const [questions, setQuestions] = useState<ProvaQuestion[]>([]);
  const [selectedProvaId, setSelectedProvaId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingProvaId, setEditingProvaId] = useState<string | null>(null);
  const [provaForm, setProvaForm] = useState<ProvaForm | null>(null);
  const [provaSaveState, setProvaSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [categorySaveState, setCategorySaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragQuestionId, setDragQuestionId] = useState<string | null>(null);

  const provaSnapshotRef = useRef("");
  const categorySnapshotRef = useRef("");
  const categoriesRef = useRef(categories);
  const questionsRef = useRef(questions);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const loadCards = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const result = await listProvas(schoolId);
    if (result.error) showToast({ variant: "error", message: result.error.message });
    setCards(result.data);
    if (!opts?.silent) setLoading(false);
  }, [showToast]);

  const loadDetails = useCallback(async (provaId: string) => {
    setDetailsLoading(true);
    const [catRes, qRes] = await Promise.all([listProvaCategories(provaId), listProvaQuestions(provaId)]);
    if (catRes.error) showToast({ variant: "error", message: catRes.error.message });
    if (qRes.error) showToast({ variant: "error", message: qRes.error.message });
    setCategories(catRes.data);
    setQuestions(qRes.data);
    setSelectedCategoryId((current) =>
      catRes.data.some((item) => item.id === current) ? current : catRes.data[0]?.id || "",
    );
    setDetailsLoading(false);
  }, [showToast]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!selectedProvaId) {
      setCategories([]);
      setQuestions([]);
      setSelectedCategoryId("");
      return;
    }
    void loadDetails(selectedProvaId);
  }, [selectedProvaId, loadDetails]);

  useEffect(() => {
    if (!selectedProvaId) return;
    const categoryCount = categories.length;
    const questionCount = questions.length;
    const drawTotal = categories.reduce(
      (sum, cat) => sum + Math.min(cat.drawCount, questions.filter((q) => q.categoryId === cat.id).length),
      0,
    );
    setCards((prev) => {
      const current = prev.find((card) => card.id === selectedProvaId);
      if (
        !current ||
        (current.categoryCount === categoryCount &&
          current.questionCount === questionCount &&
          current.drawTotal === drawTotal)
      ) {
        return prev;
      }
      return prev.map((card) =>
        card.id === selectedProvaId ? { ...card, categoryCount, questionCount, drawTotal } : card,
      );
    });
  }, [selectedProvaId, categories, questions]);

  const selectedProva = useMemo(
    () => cards.find((card) => card.id === selectedProvaId) ?? null,
    [cards, selectedProvaId],
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const questionsForSelected = useMemo(
    () => questions.filter((question) => question.categoryId === selectedCategoryId),
    [questions, selectedCategoryId],
  );
  const editingQuestion = questions.find((question) => question.id === editingQuestionId) ?? null;

  const persistProva = useCallback(
    async (provaId: string, form: ProvaForm) => {
      if (!form.title.trim()) return;
      setProvaSaveState("saving");
      const result = await updateProva(provaId, {
        title: form.title.trim(),
        description: form.description.trim(),
        passingPercent: form.passingPercent,
        timeLimitHours: form.timeLimitHours,
        status: form.status,
      });
      if (result.error) {
        setProvaSaveState("error");
        showToast({ variant: "error", message: result.error.message });
        return;
      }
      provaSnapshotRef.current = JSON.stringify(form);
      setProvaSaveState("saved");
      if (result.data) {
        const updated = result.data;
        setCards((prev) => prev.map((card) => (card.id === provaId ? { ...card, ...updated } : card)));
      }
    },
    [showToast],
  );

  const persistCategory = useCallback(
    async (categoryId: string, form: CategoryForm) => {
      if (!form.name.trim()) return;
      setCategorySaveState("saving");
      const result = await updateProvaCategory(categoryId, {
        name: form.name.trim(),
        drawCount: form.drawCount,
      });
      if (result.error) {
        setCategorySaveState("error");
        showToast({ variant: "error", message: result.error.message });
        return;
      }
      categorySnapshotRef.current = JSON.stringify(form);
      setCategorySaveState("saved");
      if (result.data) {
        setCategories((prev) => prev.map((item) => (item.id === categoryId ? result.data! : item)));
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!editingProvaId || !provaForm) return;
    if (JSON.stringify(provaForm) === provaSnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persistProva(editingProvaId, provaForm);
    }, PROVA_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [provaForm, editingProvaId, persistProva]);

  useEffect(() => {
    if (!editingCategoryId || !categoryForm) return;
    if (JSON.stringify(categoryForm) === categorySnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persistCategory(editingCategoryId, categoryForm);
    }, PROVA_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [categoryForm, editingCategoryId, persistCategory]);

  const flushProvaSave = useCallback(() => {
    if (!editingProvaId || !provaForm) return;
    if (JSON.stringify(provaForm) === provaSnapshotRef.current) return;
    void persistProva(editingProvaId, provaForm);
  }, [editingProvaId, provaForm, persistProva]);

  const flushCategorySave = useCallback(() => {
    if (!editingCategoryId || !categoryForm) return;
    if (JSON.stringify(categoryForm) === categorySnapshotRef.current) return;
    void persistCategory(editingCategoryId, categoryForm);
  }, [editingCategoryId, categoryForm, persistCategory]);

  function openProvaEditor(card: ProvaBankCard) {
    const form = provaFormFromCard(card);
    provaSnapshotRef.current = JSON.stringify(form);
    setEditingProvaId(card.id);
    setProvaForm(form);
    setProvaSaveState("idle");
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
  }

  function closeProvaEditor() {
    flushProvaSave();
    setEditingProvaId(null);
    setProvaForm(null);
    setProvaSaveState("idle");
  }

  function openCategoryEditor(category: ProvaCategory) {
    const form = categoryFormFromCategory(category);
    categorySnapshotRef.current = JSON.stringify(form);
    setEditingCategoryId(category.id);
    setCategoryForm(form);
    setCategorySaveState("idle");
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
  }

  function closeCategoryEditor() {
    flushCategorySave();
    setEditingCategoryId(null);
    setCategoryForm(null);
    setCategorySaveState("idle");
  }

  function goBackToList() {
    flushProvaSave();
    flushCategorySave();
    setSelectedProvaId("");
    setSelectedCategoryId("");
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
    setEditingProvaId(null);
    setProvaForm(null);
    setEditingCategoryId(null);
    setCategoryForm(null);
    void loadCards({ silent: true });
  }

  function handleSelectCategory(categoryId: string) {
    if (categoryId === selectedCategoryId && !questionEditorOpen) {
      flushCategorySave();
      return;
    }
    flushCategorySave();
    setSelectedCategoryId(categoryId);
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
    if (editingCategoryId) {
      const next = categoriesRef.current.find((item) => item.id === categoryId);
      if (next) openCategoryEditor(next);
    }
  }

  async function handleCreateProva() {
    flushProvaSave();
    flushCategorySave();
    setSaving(true);
    const result = await createProva({
      schoolId,
      title: "Nova prova",
      description: "",
      passingPercent: 70,
      timeLimitHours: 24,
      status: "draft",
    });
    if (result.error || !result.data) {
      setSaving(false);
      showToast({ variant: "error", message: result.error?.message || "Não foi possível criar." });
      return;
    }
    await createProvaCategory({
      schoolId,
      provaId: result.data.id,
      name: "Geral",
      order: 0,
      drawCount: 1,
    });
    setSaving(false);
    setSelectedProvaId(result.data.id);
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
    await loadCards({ silent: true });
    const created: ProvaBankCard = {
      ...result.data,
      categoryCount: 1,
      questionCount: 0,
      drawTotal: 1,
    };
    openProvaEditor(created);
    showToast({ variant: "success", message: "Prova criada como rascunho. Edite o título — as alterações são salvas automaticamente." });
  }

  async function handleDeleteProva(card: ProvaBankCard) {
    if (!confirm(`Apagar prova "${card.title}" e todas as categorias e questões?`)) return;
    const result = await deleteProva(card.id);
    if (result.error) {
      showToast({ variant: "error", message: result.error.message });
      return;
    }
    showToast({ variant: "success", message: "Prova apagada." });
    if (editingProvaId === card.id) {
      setEditingProvaId(null);
      setProvaForm(null);
    }
    if (selectedProvaId === card.id) setSelectedProvaId("");
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
    await loadCards({ silent: true });
  }

  async function handleCreateCategory() {
    if (!selectedProvaId) return;
    flushCategorySave();
    const result = await createProvaCategory({
      schoolId,
      provaId: selectedProvaId,
      name: `Categoria ${categories.length + 1}`,
      order: categories.length,
      drawCount: 1,
    });
    if (result.error || !result.data) {
      showToast({ variant: "error", message: result.error?.message || "Não foi possível criar a categoria." });
      return;
    }
    setCategories((prev) => [...prev, result.data!]);
    setSelectedCategoryId(result.data.id);
    openCategoryEditor(result.data);
    showToast({ variant: "success", message: "Categoria criada." });
  }

  async function handleDeleteCategory(category: ProvaCategory) {
    if (!confirm(`Apagar categoria "${category.name}" e as questões dela?`)) return;
    await deleteProvaCategory(category.id, selectedProvaId);
    const remaining = categories.filter((item) => item.id !== category.id);
    setCategories(remaining);
    setQuestions((prev) => prev.filter((question) => question.categoryId !== category.id));
    if (selectedCategoryId === category.id) setSelectedCategoryId(remaining[0]?.id ?? "");
    if (editingCategoryId === category.id) {
      setEditingCategoryId(null);
      setCategoryForm(null);
    }
    setQuestionEditorOpen(false);
    setEditingQuestionId(null);
    showToast({ variant: "success", message: "Categoria apagada." });
  }

  async function handleCreateQuestion() {
    if (!selectedProvaId || !selectedCategoryId) return;
    flushProvaSave();
    flushCategorySave();
    const result = await createProvaQuestion({
      schoolId,
      provaId: selectedProvaId,
      categoryId: selectedCategoryId,
      type: "mc",
      title: "Nova questão",
      description: "",
      order: questionsForSelected.length,
      payload: emptyMcPayload(),
    });
    if (result.error || !result.data) {
      showToast({ variant: "error", message: result.error?.message || "Não foi possível criar a questão." });
      return;
    }
    setQuestions((prev) => [...prev, result.data!]);
    setEditingQuestionId(result.data.id);
    setQuestionEditorOpen(true);
    setEditingProvaId(null);
    setProvaForm(null);
    setEditingCategoryId(null);
    setCategoryForm(null);
  }

  function openQuestionEdit(question: ProvaQuestion) {
    flushProvaSave();
    flushCategorySave();
    setEditingQuestionId(question.id);
    setQuestionEditorOpen(true);
    setEditingProvaId(null);
    setProvaForm(null);
    setEditingCategoryId(null);
    setCategoryForm(null);
  }

  async function patchQuestion(id: string, patch: Partial<ProvaQuestionInput>) {
    setQuestions((prev) =>
      prev.map((question) => (question.id === id ? { ...question, ...patch, payload: patch.payload ?? question.payload } : question)),
    );
    const result = await updateProvaQuestion(id, patch);
    if (result.error) showToast({ variant: "error", message: result.error.message });
  }

  async function handleDeleteQuestion(id: string) {
    await deleteProvaQuestion(id);
    setQuestions((prev) => prev.filter((question) => question.id !== id));
    setEditingQuestionId(null);
    setQuestionEditorOpen(false);
    showToast({ variant: "success", message: "Questão apagada." });
  }

  function handleCategoryDragEnter(targetId: string) {
    if (!dragCategoryId || dragCategoryId === targetId) return;
    setCategories((prev) => {
      const list = [...prev];
      const from = list.findIndex((item) => item.id === dragCategoryId);
      const to = list.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return list;
    });
  }

  async function persistCategoryOrder() {
    const list = categoriesRef.current;
    const changed = list
      .map((category, index) => ({ category, newOrder: index }))
      .filter(({ category, newOrder }) => category.order !== newOrder);
    if (changed.length === 0) return;
    setCategories((prev) => prev.map((item, index) => ({ ...item, order: index })));
    const results = await Promise.all(
      changed.map(({ category, newOrder }) => updateProvaCategory(category.id, { order: newOrder })),
    );
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      showToast({ variant: "error", message: firstError.message });
      await loadDetails(selectedProvaId);
    }
  }

  function handleQuestionDragEnter(targetId: string) {
    if (!dragQuestionId || dragQuestionId === targetId) return;
    setQuestions((prev) => {
      const others = prev.filter((question) => question.categoryId !== selectedCategoryId);
      const list = prev.filter((question) => question.categoryId === selectedCategoryId);
      const from = list.findIndex((item) => item.id === dragQuestionId);
      const to = list.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return [...others, ...list];
    });
  }

  async function persistQuestionOrder() {
    const list = questionsRef.current.filter((question) => question.categoryId === selectedCategoryId);
    const changed = list
      .map((question, index) => ({ question, newOrder: index }))
      .filter(({ question, newOrder }) => question.order !== newOrder);
    if (changed.length === 0) return;
    setQuestions((prev) => {
      const others = prev.filter((question) => question.categoryId !== selectedCategoryId);
      const next = prev
        .filter((question) => question.categoryId === selectedCategoryId)
        .map((question, index) => ({ ...question, order: index }));
      return [...others, ...next];
    });
    const results = await Promise.all(
      changed.map(({ question, newOrder }) => updateProvaQuestion(question.id, { order: newOrder })),
    );
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      showToast({ variant: "error", message: firstError.message });
      await loadDetails(selectedProvaId);
    }
  }

  const provaSaveLabel =
    provaSaveState === "saving"
      ? "Salvando…"
      : provaSaveState === "saved"
        ? "Salvo ✓"
        : provaSaveState === "error"
          ? "Erro ao salvar"
          : "Alterações salvam automaticamente";

  const categorySaveLabel =
    categorySaveState === "saving"
      ? "Salvando…"
      : categorySaveState === "saved"
        ? "Salvo ✓"
        : categorySaveState === "error"
          ? "Erro ao salvar"
          : "Alterações salvam automaticamente";

  if (!selectedProvaId) {
    return (
      <div className="mx-auto w-full max-w-[96rem] space-y-4">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Provas</p>
              <h2 className="text-xl font-semibold text-slate-100">Banco de questões</h2>
              <p className="mt-1 text-sm text-slate-500">
                Monte categorias, o banco de questões e quantas serão sorteadas para o aluno.
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreateProva()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              Nova prova
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
            Nenhuma prova ainda. Crie a primeira para começar o banco de questões.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedProvaId(card.id)}
                className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 text-left transition hover:border-sky-500/30 hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-100">{card.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      card.status === "published" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-amber-300"
                    }`}
                  >
                    {card.status === "published" ? "Publicada" : "Rascunho"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {card.categoryCount} categorias · {card.questionCount} no banco · {card.drawTotal} sorteadas
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Aprovação {card.passingPercent}% · {card.timeLimitHours}h para fazer após iniciar
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Provas</p>
            <h2 className="text-xl font-semibold text-slate-100">Banco de questões</h2>
            <p className="mt-1 text-sm text-slate-500">
              Prova → categoria → questão. Arraste categorias e questões para reordenar. As alterações salvam automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goBackToList}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              ← Banco de provas
            </button>
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Nova categoria
            </button>
            <button
              type="button"
              disabled={!selectedCategoryId}
              onClick={() => void handleCreateQuestion()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              Nova questão
            </button>
          </div>
        </div>
      </div>

      {detailsLoading && !categories.length && !questions.length ? (
        <Skeleton className="h-96" />
      ) : (
        <main className="min-w-0 space-y-4">
            {!questionEditorOpen ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Prova selecionada</p>
                    <h3 className="mt-1 break-words text-xl font-semibold text-slate-100">
                      {selectedProva ? selectedProva.title : "Selecione uma prova"}
                    </h3>
                    {selectedProva?.description ? (
                      <p className="mt-1 text-sm text-slate-500">{selectedProva.description}</p>
                    ) : null}
                    {selectedProva ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Aprovação {selectedProva.passingPercent}% · {selectedProva.timeLimitHours}h para fazer após iniciar
                      </p>
                    ) : null}
                  </div>
                  {selectedProva ? (
                    <div className="flex flex-wrap gap-2">
                      {editingProvaId !== selectedProva.id ? (
                        <button
                          type="button"
                          onClick={() => openProvaEditor(selectedProva)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Editar prova
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleCreateCategory()}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Nova categoria
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProva(selectedProva)}
                        className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Apagar prova
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {!questionEditorOpen && editingProvaId && provaForm ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">Editar prova</h3>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs ${
                        provaSaveState === "error"
                          ? "text-red-400"
                          : provaSaveState === "saving"
                            ? "text-amber-300"
                            : "text-slate-500"
                      }`}
                    >
                      {provaSaveLabel}
                    </span>
                    <button
                      type="button"
                      onClick={closeProvaEditor}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_8rem_8rem_10rem]">
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Título</span>
                    <input
                      value={provaForm.title}
                      onChange={(event) => setProvaForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                      placeholder="Ex.: Navegação visual I"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Nota mínima (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={provaForm.passingPercent}
                      onChange={(event) =>
                        setProvaForm((prev) => (prev ? { ...prev, passingPercent: Number(event.target.value) } : prev))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Tempo para realizar (horas)</span>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={provaForm.timeLimitHours}
                      onChange={(event) =>
                        setProvaForm((prev) => (prev ? { ...prev, timeLimitHours: Number(event.target.value) } : prev))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                    <span className="font-normal text-slate-500">Conta a partir do momento em que o aluno inicia.</span>
                  </label>
                  <label className="flex items-end gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={provaForm.status === "published"}
                      onChange={(event) =>
                        setProvaForm((prev) =>
                          prev ? { ...prev, status: event.target.checked ? "published" : "draft" } : prev,
                        )
                      }
                    />
                    Publicada
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400 md:col-span-4">
                    <span>Descrição</span>
                    <textarea
                      value={provaForm.description}
                      onChange={(event) =>
                        setProvaForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                      }
                      placeholder="Opcional"
                      rows={2}
                      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {!questionEditorOpen && editingCategoryId && categoryForm ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">Editar categoria</h3>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs ${
                        categorySaveState === "error"
                          ? "text-red-400"
                          : categorySaveState === "saving"
                            ? "text-amber-300"
                            : "text-slate-500"
                      }`}
                    >
                      {categorySaveLabel}
                    </span>
                    <button
                      type="button"
                      onClick={closeCategoryEditor}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Nome da categoria</span>
                    <input
                      value={categoryForm.name}
                      onChange={(event) =>
                        setCategoryForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                      }
                      placeholder="Ex.: Espaço aéreo"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-400">
                    <span>Questões sorteadas</span>
                    <input
                      type="number"
                      min={0}
                      value={categoryForm.drawCount}
                      onChange={(event) =>
                        setCategoryForm((prev) => (prev ? { ...prev, drawCount: Number(event.target.value) } : prev))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-normal text-slate-100 outline-none focus:border-sky-500"
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {questionEditorOpen && editingQuestion ? (
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">Editar questão</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestionEditorOpen(false);
                      setEditingQuestionId(null);
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Voltar
                  </button>
                </div>
                <ProvaQuestionEditor
                  embedded
                  question={editingQuestion}
                  onChange={(patch) => void patchQuestion(editingQuestion.id, patch)}
                  onDelete={() => void handleDeleteQuestion(editingQuestion.id)}
                />
              </section>
            ) : null}

            {!questionEditorOpen ? (
              detailsLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
                  <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2 px-2 py-2">
                      <h3 className="text-sm font-semibold text-slate-100">Categorias</h3>
                      <button
                        type="button"
                        onClick={() => void handleCreateCategory()}
                        disabled={!selectedProvaId}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Nova
                      </button>
                    </div>
                    <div>
                      {categories.length ? (
                        categories.map((category, index) => {
                          const count = questions.filter((question) => question.categoryId === category.id).length;
                          return (
                            <button
                              key={category.id}
                              type="button"
                              draggable
                              onDragStart={() => setDragCategoryId(category.id)}
                              onDragEnter={() => handleCategoryDragEnter(category.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDragEnd={() => {
                                void persistCategoryOrder();
                                setDragCategoryId(null);
                              }}
                              onClick={() => handleSelectCategory(category.id)}
                              className={`block w-full cursor-grab border-b border-slate-800/80 px-3 py-3 text-left text-sm transition last:border-b-0 active:cursor-grabbing ${
                                dragCategoryId === category.id ? "opacity-40" : ""
                              } ${
                                category.id === selectedCategoryId
                                  ? "rounded-xl border-b-transparent bg-emerald-500/10 text-emerald-400"
                                  : "text-slate-300 hover:rounded-xl hover:bg-slate-800/70"
                              }`}
                            >
                              <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                                <span>Categoria {index + 1}</span>
                                <span className="text-slate-600">⠿</span>
                              </span>
                              <span className="mt-0.5 block font-medium leading-snug">{category.name}</span>
                              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
                                Sortear {category.drawCount} de {count}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="rounded-lg border border-slate-800 bg-slate-950/20 p-4 text-sm text-slate-500">
                          Nenhuma categoria nesta prova.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Questões</p>
                        <h3 className="text-lg font-semibold text-slate-100">
                          {selectedCategory?.name ?? "Selecione uma categoria"}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedCategory ? (
                          <>
                            {editingCategoryId !== selectedCategory.id ? (
                              <button
                                type="button"
                                onClick={() => openCategoryEditor(selectedCategory)}
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                              >
                                Editar categoria
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleDeleteCategory(selectedCategory)}
                              className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                            >
                              Apagar categoria
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleCreateQuestion()}
                          disabled={!selectedCategoryId}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                        >
                          Nova questão
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {questionsForSelected.length ? (
                        questionsForSelected.map((question, index) => (
                          <article
                            key={question.id}
                            draggable
                            onDragStart={() => setDragQuestionId(question.id)}
                            onDragEnter={() => handleQuestionDragEnter(question.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDragEnd={() => {
                              void persistQuestionOrder();
                              setDragQuestionId(null);
                            }}
                            className={`cursor-grab rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 active:cursor-grabbing ${
                              dragQuestionId === question.id ? "opacity-40" : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="mt-1 shrink-0 text-slate-600">⠿</span>
                                <div className="min-w-0">
                                  <h4 className="break-words text-base font-semibold text-slate-100">
                                    {index + 1}. {question.title || "Sem título"}
                                  </h4>
                                  <p className="text-xs text-slate-500">{questionTypeLabel(question.type)}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => openQuestionEdit(question)}
                                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteQuestion(question.id)}
                                  className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                                >
                                  Apagar
                                </button>
                              </div>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-400">{questionSummary(question)}</p>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-xl border border-slate-700/40 bg-slate-950/20 p-10 text-center text-sm text-slate-500">
                          {selectedCategory
                            ? "Nenhuma questão nesta categoria."
                            : "Selecione uma categoria para ver as questões."}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )
            ) : null}
        </main>
      )}
    </div>
  );
}
