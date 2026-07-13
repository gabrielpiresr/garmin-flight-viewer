import { useState } from "react";
import type {
  InstructorAdmissionStage,
  InstructorAdmissionStageInput,
} from "../../../types/instructorAdmission";

const EMPTY: InstructorAdmissionStageInput = {
  name: "",
  color: "#38bdf8",
  description: "",
  order: 10,
  isDefault: false,
  archived: false,
};

export function StageEditorModal({
  value,
  nextOrder,
  onClose,
  onSave,
}: {
  value: InstructorAdmissionStage | null;
  nextOrder: number;
  onClose: () => void;
  onSave: (input: InstructorAdmissionStageInput, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<InstructorAdmissionStageInput>(() =>
    value
      ? {
          name: value.name,
          color: value.color,
          description: value.description,
          order: value.order,
          isDefault: value.isDefault,
          archived: value.archived,
        }
      : { ...EMPTY, order: nextOrder },
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft, value?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">
          {value ? "Editar etapa" : "Nova etapa"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Defina nome, cor e descrição da etapa do processo seletivo.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
            <label className="text-xs text-slate-400">
              Nome da etapa
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                placeholder="Ex: Entrevista"
              />
            </label>
            <label className="text-xs text-slate-400">
              Cor
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-900 p-1"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-400">
            Descrição
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Descreva o que acontece nesta etapa do processo..."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Ordem
              <input
                type="number"
                value={draft.order}
                onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
                className="accent-sky-500"
              />
              Etapa inicial (novos candidatos)
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-slate-400">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft.name.trim()}
            className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
