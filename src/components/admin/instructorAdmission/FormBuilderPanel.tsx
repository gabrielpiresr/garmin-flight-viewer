import { useState } from "react";
import {
  FIELD_TYPE_LABELS,
  INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS,
  INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS,
  INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES,
  SYSTEM_PROPERTY_LABELS,
  type InstructorAdmissionFieldType,
  type InstructorAdmissionForm,
  type InstructorAdmissionFormField,
  type InstructorAdmissionFormInput,
  type InstructorAdmissionScoreAvailabilityAspect,
  type InstructorAdmissionScoreCompareOp,
  type InstructorAdmissionScoreMatchMode,
  type InstructorAdmissionScoreRule,
  type InstructorAdmissionSystemProperty,
} from "../../../types/instructorAdmission";
import { AVAILABLE_DAY_LABELS } from "../../../types/crm";
import {
  AVAILABILITY_ALL_DAYS,
  AVAILABILITY_PRESETS,
} from "../../../lib/availabilityPresets";

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

function newScoreRule(fields: InstructorAdmissionFormField[]): InstructorAdmissionScoreRule {
  const first = fields.find((f) => f.type !== "attachment") || fields[0];
  const type = first?.type;
  return {
    id: crypto.randomUUID(),
    fieldId: first?.id || "",
    answerValue:
      type === "checkbox"
        ? "true"
        : type === "availability"
          ? "seg,ter,qua,qui,sex"
          : first?.options?.[0] || "",
    points: 10,
    compareOp: type === "number" ? "eq" : undefined,
    matchMode: type === "multiselect" || type === "availability" ? "all" : undefined,
    availabilityAspect: type === "availability" ? "days" : undefined,
  };
}

function fieldTypeBadge(type: InstructorAdmissionFieldType): string {
  return FIELD_TYPE_LABELS[type] || type;
}

function FieldEditor({
  field,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
}: {
  field: InstructorAdmissionFormField;
  expanded: boolean;
  onToggle: () => void;
  onChange: (field: InstructorAdmissionFormField) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  dragging: boolean;
}) {
  const [optionsText, setOptionsText] = useState((field.options || []).join("\n"));
  const isHidden = field.type === "hidden";
  const needsOptions = field.type === "select" || field.type === "multiselect";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-xl border bg-slate-900/50 transition ${
        dragging ? "border-sky-500/60 opacity-60" : "border-slate-700/80"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
          title="Arrastar para reordenar"
          onClick={(e) => e.stopPropagation()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
          </svg>
        </button>

        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-100">{field.label || "Sem título"}</span>
            {field.required && !isHidden && (
              <span className="shrink-0 text-[10px] text-red-400">obrigatório</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {fieldTypeBadge(field.type)}
            {isHidden ? " · não aparece ao candidato" : ""}
          </p>
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800"
        >
          {expanded ? "Recolher" : "Editar"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-red-900/50 px-2 py-1 text-[11px] text-red-400 hover:bg-red-950/40"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-slate-800 px-4 py-4 sm:grid-cols-2">
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
              onChange={(e) => {
                const type = e.target.value as InstructorAdmissionFieldType;
                onChange({
                  ...field,
                  type,
                  required: type === "hidden" || type === "availability" ? field.required : field.required,
                  options:
                    type === "select" || type === "multiselect"
                      ? field.options?.length
                        ? field.options
                        : ["Opção 1", "Opção 2"]
                      : undefined,
                });
              }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(FIELD_TYPE_LABELS) as InstructorAdmissionFieldType[]).map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          {!isHidden && (
            <label className="flex items-end gap-2 pb-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ ...field, required: e.target.checked })}
                className="accent-sky-500"
              />
              Obrigatório
            </label>
          )}

          {isHidden && (
            <p className="self-end pb-2 text-[11px] text-amber-400/90">
              Não aparece para o candidato. Valor via URL ou padrão.
            </p>
          )}

          {field.type === "availability" && (
            <p className="sm:col-span-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-500">
              Campo de disponibilidade com os mesmos presets, dias e período da qualificação do aluno.
            </p>
          )}

          {isHidden ? (
            <>
              <label className="text-xs text-slate-400 sm:col-span-2">
                Parâmetro da URL (query key)
                <input
                  value={field.queryKey || ""}
                  onChange={(e) => onChange({ ...field, queryKey: e.target.value.trim() })}
                  placeholder={field.id}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400 sm:col-span-2">
                Valor padrão (se a URL não enviar)
                <input
                  value={field.defaultValue || ""}
                  onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </>
          ) : (
            <>
              {field.type !== "checkbox" &&
                field.type !== "attachment" &&
                field.type !== "availability" &&
                field.type !== "multiselect" && (
                  <label className="text-xs text-slate-400 sm:col-span-2">
                    Placeholder
                    <input
                      value={field.placeholder || ""}
                      onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                )}

              {field.type !== "availability" && (
                <label className="text-xs text-slate-400 sm:col-span-2">
                  Vincular a propriedade do sistema
                  <select
                    value={field.systemProperty || ""}
                    onChange={(e) =>
                      onChange({
                        ...field,
                        systemProperty: (e.target.value || undefined) as
                          | InstructorAdmissionSystemProperty
                          | undefined,
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
              )}

              <label className="text-xs text-slate-400 sm:col-span-2">
                Texto de ajuda
                <input
                  value={field.helpText || ""}
                  onChange={(e) => onChange({ ...field, helpText: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>

              {field.type !== "availability" && (
                <label className="text-xs text-slate-400 sm:col-span-2">
                  Pré-preencher via URL (opcional)
                  <input
                    value={field.queryKey || ""}
                    onChange={(e) => onChange({ ...field, queryKey: e.target.value.trim() })}
                    placeholder="Ex.: email, campanha..."
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
              )}
            </>
          )}

          {needsOptions && (
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
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreRuleEditor({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: InstructorAdmissionScoreRule;
  fields: InstructorAdmissionFormField[];
  onChange: (patch: Partial<InstructorAdmissionScoreRule>) => void;
  onRemove: () => void;
}) {
  const scoreableFields = fields.filter((f) => f.type !== "attachment");
  const field = scoreableFields.find((f) => f.id === rule.fieldId) || scoreableFields[0];
  const isNumber = field?.type === "number";
  const isCheckbox = field?.type === "checkbox";
  const isSelect = field?.type === "select";
  const isMultiselect = field?.type === "multiselect";
  const isAvailability = field?.type === "availability";
  const aspect: InstructorAdmissionScoreAvailabilityAspect = rule.availabilityAspect || "days";

  const selectedOptions = rule.answerValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function toggleOption(option: string) {
    const next = selectedOptions.includes(option)
      ? selectedOptions.filter((o) => o !== option)
      : [...selectedOptions, option];
    onChange({ answerValue: next.join(",") });
  }

  function toggleDay(day: string) {
    toggleOption(day);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          Campo / pergunta
          <select
            value={rule.fieldId}
            onChange={(e) => {
              const nextField = scoreableFields.find((f) => f.id === e.target.value);
              const type = nextField?.type;
              onChange({
                fieldId: e.target.value,
                compareOp: type === "number" ? rule.compareOp || "eq" : undefined,
                matchMode: type === "multiselect" || type === "availability" ? rule.matchMode || "all" : undefined,
                availabilityAspect: type === "availability" ? rule.availabilityAspect || "days" : undefined,
                answerValue:
                  type === "checkbox"
                    ? "true"
                    : type === "availability"
                      ? rule.availabilityAspect === "period"
                        ? "ambos"
                        : type === "availability" && rule.availabilityAspect === "preset"
                          ? "uteis"
                          : "seg,ter,qua,qui,sex"
                      : nextField?.options?.[0] || "",
              });
            }}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {scoreableFields.length === 0 ? (
              <option value="">Cadastre campos primeiro</option>
            ) : (
              scoreableFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                  {f.type === "hidden" ? " (oculto)" : ""}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="text-xs text-slate-400">
          Pontos
          <input
            type="number"
            value={rule.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {isNumber && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Comparador
            <select
              value={rule.compareOp ?? "eq"}
              onChange={(e) =>
                onChange({ compareOp: e.target.value as InstructorAdmissionScoreCompareOp })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS) as InstructorAdmissionScoreCompareOp[]).map(
                (op) => (
                  <option key={op} value={op}>
                    {INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS[op]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Valor
            <input
              value={rule.answerValue}
              onChange={(e) => onChange({ answerValue: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      )}

      {isCheckbox && (
        <label className="text-xs text-slate-400">
          Resposta
          <select
            value={rule.answerValue}
            onChange={(e) => onChange({ answerValue: e.target.value })}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
      )}

      {isSelect && (
        <label className="text-xs text-slate-400">
          Opção da resposta
          <select
            value={rule.answerValue}
            onChange={(e) => onChange({ answerValue: e.target.value })}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {(field?.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )}

      {isMultiselect && (
        <div className="space-y-2">
          <label className="text-xs text-slate-400">
            Modo de correspondência
            <select
              value={rule.matchMode ?? "all"}
              onChange={(e) =>
                onChange({ matchMode: e.target.value as InstructorAdmissionScoreMatchMode })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS) as InstructorAdmissionScoreMatchMode[]).map(
                (mode) => (
                  <option key={mode} value={mode}>
                    {INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS[mode]}
                  </option>
                ),
              )}
            </select>
          </label>
          <div>
            <p className="mb-1.5 text-xs text-slate-400">Opções (mesmo padrão do CRM / dias)</p>
            <div className="flex flex-wrap gap-1.5">
              {(field?.options || []).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    selectedOptions.includes(option)
                      ? "bg-sky-600 text-white"
                      : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isAvailability && (
        <div className="space-y-3">
          <label className="text-xs text-slate-400">
            Pontuar por
            <select
              value={aspect}
              onChange={(e) => {
                const next = e.target.value as InstructorAdmissionScoreAvailabilityAspect;
                onChange({
                  availabilityAspect: next,
                  answerValue:
                    next === "days"
                      ? "seg,ter,qua,qui,sex"
                      : next === "period"
                        ? "ambos"
                        : "uteis",
                  matchMode: next === "days" ? rule.matchMode || "all" : undefined,
                });
              }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="days">Dias disponíveis</option>
              <option value="period">Período</option>
              <option value="preset">Preset</option>
            </select>
          </label>

          {aspect === "days" && (
            <>
              <label className="text-xs text-slate-400">
                Modo de correspondência
                <select
                  value={rule.matchMode ?? "all"}
                  onChange={(e) =>
                    onChange({ matchMode: e.target.value as InstructorAdmissionScoreMatchMode })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="all">Tem todos os dias selecionados</option>
                  <option value="any">Tem pelo menos um dos dias</option>
                </select>
              </label>
              <div>
                <p className="mb-1.5 text-xs text-slate-400">Dias da semana</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABILITY_ALL_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`rounded-md px-2.5 py-1 text-xs transition ${
                        selectedOptions.includes(day)
                          ? "bg-sky-600 text-white"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {AVAILABLE_DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {aspect === "period" && (
            <label className="text-xs text-slate-400">
              Período
              <select
                value={rule.answerValue}
                onChange={(e) => onChange({ answerValue: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="ambos">Ambos</option>
              </select>
            </label>
          )}

          {aspect === "preset" && (
            <label className="text-xs text-slate-400">
              Preset
              <select
                value={rule.answerValue}
                onChange={(e) => onChange({ answerValue: e.target.value })}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {AVAILABILITY_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {!isNumber && !isCheckbox && !isSelect && !isMultiselect && !isAvailability && (
        <label className="text-xs text-slate-400">
          Valor da resposta (exato)
          <input
            value={rule.answerValue}
            onChange={(e) => onChange({ answerValue: e.target.value })}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-red-900/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30"
        >
          Remover regra
        </button>
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
  const [tab, setTab] = useState<"fields" | "score">("fields");
  const [title, setTitle] = useState(form?.title || "Candidatura de Instrutor");
  const [description, setDescription] = useState(form?.description || "");
  const [published, setPublished] = useState(form?.published ?? false);
  const [fields, setFields] = useState<InstructorAdmissionFormField[]>(
    form?.fields?.length
      ? form.fields
      : [
          { id: crypto.randomUUID(), label: "Nome completo", type: "text", required: true, order: 10 },
          { id: crypto.randomUUID(), label: "E-mail", type: "email", required: true, order: 20 },
          { id: crypto.randomUUID(), label: "Telefone", type: "phone", required: false, order: 30 },
          {
            id: crypto.randomUUID(),
            label: "Experiência como piloto",
            type: "textarea",
            required: false,
            order: 40,
          },
          {
            id: crypto.randomUUID(),
            label: "Currículo ou documentos",
            type: "attachment",
            required: false,
            order: 50,
          },
        ],
  );
  const [scoreRules, setScoreRules] = useState<InstructorAdmissionScoreRule[]>(form?.scoreRules || []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(index: number, next: InstructorAdmissionFormField) {
    setFields((current) => current.map((f, i) => (i === index ? next : f)));
  }

  function removeField(index: number) {
    const removedId = fields[index]?.id;
    setFields((current) => current.filter((_, i) => i !== index));
    if (removedId) {
      setScoreRules((current) => current.filter((rule) => rule.fieldId !== removedId));
      if (expandedId === removedId) setExpandedId(null);
    }
  }

  function reorderField(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setFields((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(to, 0, item);
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
        fields: fields.map((f, i) => ({
          ...f,
          order: (i + 1) * 10,
          required: f.type === "hidden" ? false : f.required,
        })),
        scoreRules: scoreRules.filter((r) => r.fieldId && r.answerValue && r.points !== 0),
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
            Campos públicos, ocultos e regras de score da candidatura.
          </p>
          <div className="mt-3 flex gap-1">
            {(
              [
                ["fields", "Campos"],
                ["score", "Score"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === id
                    ? "bg-sky-600 text-white"
                    : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {tab === "fields" ? (
            <>
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

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
                Referral: use{" "}
                <span className="font-mono text-slate-400">?referral=campanha</span> no link. Arraste as
                perguntas pelo ícone ⠿ para reordenar.
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-200">Campos ({fields.length})</h4>
                <button
                  type="button"
                  onClick={() => {
                    const field = newField((fields.length + 1) * 10);
                    setFields((current) => [...current, field]);
                    setExpandedId(field.id);
                  }}
                  className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-950/50"
                >
                  + Adicionar campo
                </button>
              </div>

              <div
                className="space-y-2"
                onDragEnd={() => setDragIndex(null)}
              >
                {fields.map((field, index) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    expanded={expandedId === field.id}
                    dragging={dragIndex === index}
                    onToggle={() =>
                      setExpandedId((current) => (current === field.id ? null : field.id))
                    }
                    onChange={(next) => updateField(index, next)}
                    onRemove={() => removeField(index)}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={() => {
                      if (dragIndex == null) return;
                      reorderField(dragIndex, index);
                      setDragIndex(null);
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Configure pontos por resposta do formulário. O score do candidato é a soma de todas as
                regras que batem (igual ao CRM).
              </p>
              {scoreRules.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
                  Nenhuma regra de pontuação.
                </p>
              ) : (
                scoreRules.map((rule) => (
                  <ScoreRuleEditor
                    key={rule.id}
                    rule={rule}
                    fields={fields}
                    onChange={(patch) =>
                      setScoreRules((prev) =>
                        prev.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)),
                      )
                    }
                    onRemove={() => setScoreRules((prev) => prev.filter((r) => r.id !== rule.id))}
                  />
                ))
              )}
              <button
                type="button"
                onClick={() => setScoreRules((prev) => [...prev, newScoreRule(fields)])}
                disabled={fields.filter((f) => f.type !== "attachment").length === 0}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Adicionar regra de pontos
              </button>
            </div>
          )}
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
