import { useState } from "react";
import {
  FIELD_TYPE_LABELS,
  INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES,
  SYSTEM_PROPERTY_LABELS,
  type InstructorAdmissionFieldType,
  type InstructorAdmissionForm,
  type InstructorAdmissionFormField,
  type InstructorAdmissionFormInput,
  type InstructorAdmissionSystemProperty,
} from "../../../types/instructorAdmission";

function newField(order: number): InstructorAdmissionFormField {
  return {
    id: crypto.randomUUID(),
    label: "Novo campo",
    type: "text",
    required: false,
    order,
    placeholder: "",
    helpText: "",
    options: [],
  };
}

function FieldEditor({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: InstructorAdmissionFormField;
  onChange: (field: InstructorAdmissionFormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [optionsText, setOptionsText] = useState((field.options || []).join("\n"));

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400 sm:col-span-2">
            Rótulo do campo
            <input
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="text-xs text-slate-400">
            Tipo
            <select
              value={field.type}
              onChange={(e) =>
                onChange({
                  ...field,
                  type: e.target.value as InstructorAdmissionFieldType,
                  options: e.target.value === "select" ? field.options || ["Opção 1"] : undefined,
                })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(FIELD_TYPE_LABELS) as InstructorAdmissionFieldType[]).map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-400 flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
              className="accent-sky-500"
            />
            Obrigatório
          </label>

          {field.type !== "checkbox" && field.type !== "attachment" && (
            <label className="text-xs text-slate-400 sm:col-span-2">
              Placeholder
              <input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          )}

          <label className="text-xs text-slate-400 sm:col-span-2">
            Vincular a propriedade do sistema
            <select
              value={field.systemProperty || ""}
              onChange={(e) =>
                onChange({
                  ...field,
                  systemProperty: (e.target.value || undefined) as InstructorAdmissionSystemProperty | undefined,
                })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Nenhum (campo livre)</option>
              {INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES.map((property) => (
                <option key={property} value={property}>
                  {SYSTEM_PROPERTY_LABELS[property]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-400 sm:col-span-2">
            Texto de ajuda
            <input
              value={field.helpText || ""}
              onChange={(e) => onChange({ ...field, helpText: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          {field.type === "select" && (
            <label className="text-xs text-slate-400 sm:col-span-2">
              Opções (uma por linha)
              <textarea
                value={optionsText}
                onChange={(e) => {
                  setOptionsText(e.target.value);
                  onChange({
                    ...field,
                    options: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  });
                }}
                rows={3}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={isFirst}
            onClick={onMoveUp}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={onMoveDown}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-red-900/50 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export function FormBuilderPanel({
  form,
  onSave,
  onClose,
}: {
  form: InstructorAdmissionForm | null;
  onSave: (input: InstructorAdmissionFormInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(form?.title || "Candidatura de Instrutor");
  const [description, setDescription] = useState(form?.description || "");
  const [published, setPublished] = useState(form?.published ?? false);
  const [fields, setFields] = useState<InstructorAdmissionFormField[]>(
    form?.fields?.length ? form.fields : [
      { id: crypto.randomUUID(), label: "Nome completo", type: "text", required: true, order: 10 },
      { id: crypto.randomUUID(), label: "E-mail", type: "email", required: true, order: 20 },
      { id: crypto.randomUUID(), label: "Telefone", type: "phone", required: false, order: 30 },
      { id: crypto.randomUUID(), label: "Experiência como piloto", type: "textarea", required: false, order: 40 },
      { id: crypto.randomUUID(), label: "Currículo ou documentos", type: "attachment", required: false, order: 50 },
    ],
  );
  const [saving, setSaving] = useState(false);

  function updateField(index: number, next: InstructorAdmissionFormField) {
    setFields((current) => current.map((f, i) => (i === index ? next : f)));
  }

  function removeField(index: number) {
    setFields((current) => current.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: (i + 1) * 10 }));
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        published,
        fields: fields.map((f, i) => ({ ...f, order: (i + 1) * 10 })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="border-b border-slate-800 px-5 py-4">
          <h3 className="text-lg font-semibold text-white">Editor de formulário</h3>
          <p className="mt-1 text-xs text-slate-500">
            Configure os campos do formulário público de candidatura.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-slate-400 sm:col-span-2">
              Título do formulário
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-slate-400 sm:col-span-2">
              Descrição (exibida no topo do formulário)
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="accent-emerald-500"
              />
              Publicar formulário (aceitar candidaturas)
            </label>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-200">Campos ({fields.length})</h4>
            <button
              type="button"
              onClick={() => setFields((current) => [...current, newField((current.length + 1) * 10)])}
              className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-950/50"
            >
              + Adicionar campo
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <FieldEditor
                key={field.id}
                field={field}
                onChange={(next) => updateField(index, next)}
                onRemove={() => removeField(index)}
                onMoveUp={() => moveField(index, -1)}
                onMoveDown={() => moveField(index, 1)}
                isFirst={index === 0}
                isLast={index === fields.length - 1}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-slate-400">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !title.trim() || fields.length === 0}
            className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar formulário"}
          </button>
        </div>
      </div>
    </div>
  );
}
