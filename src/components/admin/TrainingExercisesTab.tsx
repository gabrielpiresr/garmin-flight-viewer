import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHOOL_ID } from "../../lib/appwrite";
import {
  createTrainingExercise,
  deleteTrainingExercise,
  listTrainingExercises,
  updateTrainingExercise,
} from "../../lib/trainingExercisesDb";
import type { TrainingExercise } from "../../types/trainingExercise";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type ExerciseForm = {
  title: string;
  acceptableProficiency: string;
  order: string;
  isActive: boolean;
};

const emptyForm: ExerciseForm = {
  title: "",
  acceptableProficiency: "",
  order: "1",
  isActive: true,
};

const schoolId = SCHOOL_ID ?? "escola_principal";

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function TrainingExercisesTab() {
  const { showToast } = useToast();
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingExercise | null>(null);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listTrainingExercises({ includeInactive: true, schoolId });
    if (result.error) {
      setError(result.error.message);
      setExercises([]);
    } else {
      setExercises(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const activeCount = useMemo(() => exercises.filter((exercise) => exercise.isActive).length, [exercises]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      order: String(exercises.length + 1),
    });
    setEditorOpen(true);
  }

  function openEdit(exercise: TrainingExercise) {
    setEditing(exercise);
    setForm({
      title: exercise.title,
      acceptableProficiency: exercise.acceptableProficiency,
      order: String(exercise.order),
      isActive: exercise.isActive,
    });
    setEditorOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.acceptableProficiency.trim()) {
      setError("Informe o critério e a proficiência aceitável.");
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      schoolId,
      title: form.title.trim(),
      acceptableProficiency: form.acceptableProficiency.trim(),
      order: Math.max(1, Math.round(toNumber(form.order, exercises.length + 1))),
      isActive: form.isActive,
    };
    const result = editing
      ? await updateTrainingExercise(editing.id, payload)
      : await createTrainingExercise(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    showToast({ variant: "success", message: editing ? "Critério atualizado." : "Critério criado." });
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function toggleActive(exercise: TrainingExercise) {
    const result = await updateTrainingExercise(exercise.id, {
      schoolId: exercise.schoolId,
      title: exercise.title,
      acceptableProficiency: exercise.acceptableProficiency,
      order: exercise.order,
      isActive: !exercise.isActive,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: result.data?.isActive ? "Critério ativado." : "Critério inativado." });
    await load();
  }

  async function handleDelete(exercise: TrainingExercise) {
    const ok = confirm(`Apagar critério "${exercise.title}"?`);
    if (!ok) return;
    const result = await deleteTrainingExercise(exercise.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: "Critério apagado." });
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Critérios da ficha</h2>
          <p className="text-xs text-slate-500">
            {exercises.length} cadastrados, {activeCount} ativos para novas fichas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          Novo critério
        </button>
      </div>

      {editorOpen ? (
        <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{editing ? "Editar critério" : "Novo critério"}</h3>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Critério</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                maxLength={255}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Ordem</span>
              <input
                type="number"
                min={1}
                value={form.order}
                onChange={(e) => setForm((prev) => ({ ...prev, order: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Proficiência aceitável</span>
            <textarea
              value={form.acceptableProficiency}
              onChange={(e) => setForm((prev) => ({ ...prev, acceptableProficiency: e.target.value }))}
              rows={4}
              maxLength={2048}
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Ativo nas novas fichas
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar critério"}
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
          Nenhum critério cadastrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ordem</th>
                  <th className="px-3 py-2">Critério</th>
                  <th className="px-3 py-2">Proficiência aceitável</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {exercises.map((exercise) => (
                  <tr key={exercise.id} className="align-top text-slate-300">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">{exercise.order}</td>
                    <td className="min-w-56 px-3 py-3 font-medium text-slate-100">{exercise.title}</td>
                    <td className="min-w-96 px-3 py-3 text-xs leading-relaxed text-slate-400">
                      {exercise.acceptableProficiency}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          exercise.isActive
                            ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-700 bg-slate-800 text-slate-400"
                        }`}
                      >
                        {exercise.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(exercise)}
                        className="mr-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(exercise)}
                        className="mr-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {exercise.isActive ? "Inativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(exercise)}
                        className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
                      >
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
