import { useCallback, useEffect, useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { listModels } from "../../lib/aircraftModelsDb";
import { TELEMETRY_FIELD_MAP, TELEMETRY_PARAMETER_LABELS } from "../../lib/flightManeuverAnalysis";
import {
  createManeuverTemplate,
  createManeuverTemplateStep,
  deleteManeuverTemplateStep,
  listManeuverTemplates,
  listManeuverTemplateSteps,
  updateManeuverTemplate,
  updateManeuverTemplateStep,
} from "../../lib/maneuverTemplatesDb";
import type { AircraftModel } from "../../types/admin";
import type {
  ManeuverCategory,
  ManeuverTemplate,
  ManeuverTemplateStep,
  ParameterSeverity,
  StepParameter,
} from "../../types/flightReview";
import { MANEUVER_CATEGORY_LABELS } from "../../types/flightReview";

// ---------- Constants ----------

const CATEGORIES = Object.entries(MANEUVER_CATEGORY_LABELS) as [ManeuverCategory, string][];

/** Categorias que permitem "por perna do circuito" como condição de fim. */
const LANDING_CATEGORIES: ManeuverCategory[] = ["landing", "touch_and_go"];

/** Labels em português para as pernas visíveis. */
const LEG_LABELS_PT: Record<"downwind" | "base" | "final", string> = {
  downwind: "Do vento",
  base:     "Base",
  final:    "Final",
};

const AVAILABLE_PARAMS = Object.keys(TELEMETRY_FIELD_MAP);

const SEVERITY_OPTIONS: { value: ParameterSeverity; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

const SEVERITY_COLORS: Record<ParameterSeverity, string> = {
  low: "text-sky-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const OPERATOR_OPTIONS: { value: ">=" | "<=" | ">" | "<"; label: string }[] = [
  { value: ">=", label: "≥ (atingir ou superar)" },
  { value: "<=", label: "≤ (cair até ou abaixo)" },
  { value: ">", label: "> (superar)" },
  { value: "<", label: "< (cair abaixo)" },
];

// ---------- Form types ----------

type TemplateFormData = {
  name: string;
  category: ManeuverCategory;
  aircraft_model_id: string;
  description: string;
  is_active: boolean;
};

type EndConditionForm =
  | { type: "none" }
  | { type: "time"; value_seconds: number }
  | { type: "parameter"; parameter: string; operator: ">=" | "<=" | ">" | "<"; value: number }
  | { type: "traffic_pattern_leg"; leg: "downwind" | "base" | "final" };

type ParameterForm = {
  parameter: string;
  label: string;
  min: string;
  max: string;
  min_end: string;
  max_end: string;
  severity: ParameterSeverity;
  alert_message_min: string;
  alert_message_max: string;
};

type StepFormData = {
  name: string;
  order_index: number;
  description: string;
  expected_execution_text: string;
  end_condition: EndConditionForm;
  parameters: ParameterForm[];
};

// ---------- Helpers ----------

function emptyTemplateForm(): TemplateFormData {
  return { name: "", category: "takeoff", aircraft_model_id: "", description: "", is_active: true };
}

function emptyParameterForm(param = ""): ParameterForm {
  return {
    parameter: param,
    label: param ? (TELEMETRY_PARAMETER_LABELS[param] ?? param) : "",
    min: "",
    max: "",
    min_end: "",
    max_end: "",
    severity: "high",
    alert_message_min: "",
    alert_message_max: "",
  };
}

function emptyStepForm(nextOrder: number): StepFormData {
  return {
    name: "",
    order_index: nextOrder,
    description: "",
    expected_execution_text: "",
    end_condition: { type: "none" },
    parameters: [],
  };
}

function stepToForm(step: ManeuverTemplateStep): StepFormData {
  let end_condition: EndConditionForm;
  if (!step.end_condition) {
    end_condition = { type: "none" };
  } else if (step.end_condition.type === "time") {
    end_condition = { type: "time", value_seconds: step.end_condition.value_seconds };
  } else if (step.end_condition.type === "traffic_pattern_leg") {
    end_condition = { type: "traffic_pattern_leg", leg: step.end_condition.leg };
  } else {
    end_condition = {
      type: "parameter",
      parameter: step.end_condition.parameter,
      operator: step.end_condition.operator,
      value: step.end_condition.value,
    };
  }
  return {
    name: step.name,
    order_index: step.order_index,
    description: step.description ?? "",
    expected_execution_text: step.expected_execution_text ?? "",
    end_condition,
    parameters: step.parameters.map((p) => ({
      parameter: p.parameter,
      label: p.label,
      min: (p.min_start !== undefined ? p.min_start : p.min) !== undefined
        ? String(p.min_start !== undefined ? p.min_start : p.min)
        : "",
      max: (p.max_start !== undefined ? p.max_start : p.max) !== undefined
        ? String(p.max_start !== undefined ? p.max_start : p.max)
        : "",
      min_end: p.min_end !== undefined ? String(p.min_end) : "",
      max_end: p.max_end !== undefined ? String(p.max_end) : "",
      severity: p.severity,
      alert_message_min: p.alert_message_min ?? "",
      alert_message_max: p.alert_message_max ?? "",
    })),
  };
}

function formToParameters(pfs: ParameterForm[]): StepParameter[] {
  return pfs
    .filter((p) => p.parameter)
    .map((p) => {
      const hasMin = p.min !== "" && !isNaN(Number(p.min));
      const hasMax = p.max !== "" && !isNaN(Number(p.max));
      const hasMinEnd = p.min_end !== "" && !isNaN(Number(p.min_end));
      const hasMaxEnd = p.max_end !== "" && !isNaN(Number(p.max_end));
      return {
        parameter: p.parameter,
        label: p.label || TELEMETRY_PARAMETER_LABELS[p.parameter] || p.parameter,
        ...(hasMin ? { min_start: Number(p.min), min: Number(p.min) } : {}),
        ...(hasMax ? { max_start: Number(p.max), max: Number(p.max) } : {}),
        ...(hasMinEnd ? { min_end: Number(p.min_end) } : {}),
        ...(hasMaxEnd ? { max_end: Number(p.max_end) } : {}),
        severity: p.severity,
        ...(p.alert_message_min.trim() ? { alert_message_min: p.alert_message_min.trim() } : {}),
        ...(p.alert_message_max.trim() ? { alert_message_max: p.alert_message_max.trim() } : {}),
      };
    });
}

// ---------- Small display components ----------

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
        active
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-slate-600/40 bg-slate-800/40 text-slate-500"
      }`}
    >
      {active ? "Ativa" : "Inativa"}
    </span>
  );
}

// ---------- Shared input style ----------

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500";

// ---------- EndConditionEditor ----------

function EndConditionEditor({
  value,
  onChange,
  templateCategory,
}: {
  value: EndConditionForm;
  onChange: (v: EndConditionForm) => void;
  templateCategory?: ManeuverCategory;
}) {
  const isLanding = templateCategory ? LANDING_CATEGORIES.includes(templateCategory) : false;

  const handleTypeChange = (type: string) => {
    if (type === "none") onChange({ type: "none" });
    else if (type === "time") onChange({ type: "time", value_seconds: 30 });
    else if (type === "traffic_pattern_leg") onChange({ type: "traffic_pattern_leg", leg: "final" });
    else onChange({ type: "parameter", parameter: AVAILABLE_PARAMS[0] ?? "ias", operator: ">=", value: 0 });
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <div>
        <span className={labelCls}>Condição de fim da etapa</span>
        <select
          value={value.type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={inputCls}
        >
          <option value="none">Nenhuma — etapa cobre toda a manobra</option>
          <option value="time">Por tempo (duração fixa em segundos)</option>
          <option value="parameter">Por parâmetro (aguardar condição na telemetria)</option>
          {isLanding && (
            <option value="traffic_pattern_leg">Por perna do circuito</option>
          )}
        </select>
      </div>

      {value.type === "time" && (
        <div>
          <span className={labelCls}>Duração (segundos)</span>
          <input
            type="number"
            min={1}
            value={value.value_seconds}
            onChange={(e) =>
              onChange({ type: "time", value_seconds: Math.max(1, Number(e.target.value)) })
            }
            className={inputCls}
          />
        </div>
      )}

      {value.type === "parameter" && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className={labelCls}>Parâmetro</span>
            <select
              value={value.parameter}
              onChange={(e) => onChange({ ...value, parameter: e.target.value })}
              className={inputCls}
            >
              {AVAILABLE_PARAMS.map((p) => (
                <option key={p} value={p}>
                  {TELEMETRY_PARAMETER_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>Operador</span>
            <select
              value={value.operator}
              onChange={(e) =>
                onChange({ ...value, operator: e.target.value as ">=" | "<=" | ">" | "<" })
              }
              className={inputCls}
            >
              {OPERATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>Valor</span>
            <input
              type="number"
              value={value.value}
              onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {value.type === "traffic_pattern_leg" && (
        <div>
          <span className={labelCls}>Perna do circuito</span>
          <select
            value={value.leg}
            onChange={(e) =>
              onChange({ type: "traffic_pattern_leg", leg: e.target.value as "downwind" | "base" | "final" })
            }
            className={inputCls}
          >
            {(Object.entries(LEG_LABELS_PT) as Array<["downwind" | "base" | "final", string]>).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            O sistema detecta automaticamente a perna na telemetria e usa esse período como a etapa.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- ParameterEditor ----------

function ParameterCard({
  param,
  index,
  onChange,
  onRemove,
}: {
  param: ParameterForm;
  index: number;
  onChange: (i: number, p: ParameterForm) => void;
  onRemove: (i: number) => void;
}) {
  const set = (partial: Partial<ParameterForm>) => onChange(index, { ...param, ...partial });

  const handleParamChange = (p: string) => {
    set({ parameter: p, label: TELEMETRY_PARAMETER_LABELS[p] ?? p });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <span className={labelCls}>Parâmetro</span>
          <select
            value={param.parameter}
            onChange={(e) => handleParamChange(e.target.value)}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {AVAILABLE_PARAMS.map((p) => (
              <option key={p} value={p}>
                {TELEMETRY_PARAMETER_LABELS[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32 shrink-0">
          <span className={labelCls}>Severidade</span>
          <select
            value={param.severity}
            onChange={(e) => set({ severity: e.target.value as ParameterSeverity })}
            className={`${inputCls} ${SEVERITY_COLORS[param.severity]}`}
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="mt-5 shrink-0 rounded-lg border border-red-800/40 p-1.5 text-red-400 hover:bg-red-950/30"
          title="Remover parâmetro"
        >
          ✕
        </button>
      </div>
      <div>
        <span className={labelCls}>Label exibido no relatório</span>
        <input
          type="text"
          value={param.label}
          onChange={(e) => set({ label: e.target.value })}
          className={inputCls}
          placeholder="Ex: IAS (kt)"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={labelCls}>Mín. esperado (início)</span>
          <input
            type="number"
            value={param.min}
            onChange={(e) => set({ min: e.target.value })}
            className={inputCls}
            placeholder="Sem limite"
          />
        </div>
        <div>
          <span className={labelCls}>Máx. esperado (início)</span>
          <input
            type="number"
            value={param.max}
            onChange={(e) => set({ max: e.target.value })}
            className={inputCls}
            placeholder="Sem limite"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={labelCls}>Mín. esperado (fim) <span className="normal-case font-normal text-slate-600">(opcional)</span></span>
          <input
            type="number"
            value={param.min_end}
            onChange={(e) => set({ min_end: e.target.value })}
            className={inputCls}
            placeholder="Mesmo que início"
          />
        </div>
        <div>
          <span className={labelCls}>Máx. esperado (fim) <span className="normal-case font-normal text-slate-600">(opcional)</span></span>
          <input
            type="number"
            value={param.max_end}
            onChange={(e) => set({ max_end: e.target.value })}
            className={inputCls}
            placeholder="Mesmo que início"
          />
        </div>
      </div>
      {(param.min_end !== "" || param.max_end !== "") && (
        <p className="text-xs text-slate-500">Se início e fim configurados, o limite é interpolado linearmente ao longo da etapa.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={labelCls}>Alerta se abaixo do mín. <span className="normal-case font-normal text-slate-600">(opcional)</span></span>
          <input
            type="text"
            value={param.alert_message_min}
            onChange={(e) => set({ alert_message_min: e.target.value })}
            className={inputCls}
            placeholder="Ex: IAS muito baixa — risco de estol"
          />
        </div>
        <div>
          <span className={labelCls}>Alerta se acima do máx. <span className="normal-case font-normal text-slate-600">(opcional)</span></span>
          <input
            type="text"
            value={param.alert_message_max}
            onChange={(e) => set({ alert_message_max: e.target.value })}
            className={inputCls}
            placeholder="Ex: RPM acima do limite — verifique potência"
          />
        </div>
      </div>
    </div>
  );
}

// ---------- StepRow (list display) ----------

function StepRow({
  step,
  onEdit,
  onDelete,
}: {
  step: ManeuverTemplateStep;
  onEdit: (step: ManeuverTemplateStep) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-400">
        {step.order_index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-200">{step.name}</p>
        {step.expected_execution_text && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{step.expected_execution_text}</p>
        )}
        <p className="mt-1 text-xs text-slate-600">
          {step.parameters.length} parâmetro(s)
          {step.end_condition
            ? ` · Fim: ${
                step.end_condition.type === "time"
                  ? `${step.end_condition.value_seconds}s`
                  : step.end_condition.type === "traffic_pattern_leg"
                    ? `perna ${LEG_LABELS_PT[step.end_condition.leg]}`
                    : `quando ${TELEMETRY_PARAMETER_LABELS[step.end_condition.parameter] ?? step.end_condition.parameter} ${step.end_condition.operator} ${step.end_condition.value}`
              }`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(step.id)}
          className="rounded border border-red-800/40 px-2 py-1 text-xs text-red-400 hover:bg-red-950/30"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

// ---------- StepModal ----------

function StepModal({
  initialData,
  templateId,
  templateCategory,
  onClose,
  onSaved,
}: {
  initialData: { step?: ManeuverTemplateStep; nextOrder: number };
  templateId: string;
  templateCategory: ManeuverCategory;
  onClose: () => void;
  onSaved: (step: ManeuverTemplateStep) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<StepFormData>(() =>
    initialData.step ? stepToForm(initialData.step) : emptyStepForm(initialData.nextOrder),
  );
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof StepFormData>(k: K, v: StepFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addParameter = () =>
    setField("parameters", [...form.parameters, emptyParameterForm(AVAILABLE_PARAMS[0] ?? "")]);

  const updateParameter = (i: number, p: ParameterForm) =>
    setField(
      "parameters",
      form.parameters.map((old, idx) => (idx === i ? p : old)),
    );

  const removeParameter = (i: number) =>
    setField(
      "parameters",
      form.parameters.filter((_, idx) => idx !== i),
    );

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast({ variant: "error", message: "Nome da etapa é obrigatório." });
      return;
    }
    if (form.parameters.some((p) => !p.parameter)) {
      showToast({ variant: "error", message: "Selecione o parâmetro em todas as linhas ou remova as vazias." });
      return;
    }
    if (
      form.end_condition.type === "parameter" &&
      !form.end_condition.parameter
    ) {
      showToast({ variant: "error", message: "Selecione o parâmetro da condição de fim." });
      return;
    }

    setSaving(true);
    try {
      const endCondition =
        form.end_condition.type === "none"
          ? null
          : form.end_condition.type === "time"
            ? { type: "time" as const, value_seconds: form.end_condition.value_seconds }
            : form.end_condition.type === "traffic_pattern_leg"
              ? { type: "traffic_pattern_leg" as const, leg: form.end_condition.leg }
              : {
                  type: "parameter" as const,
                  parameter: form.end_condition.parameter,
                  operator: form.end_condition.operator,
                  value: form.end_condition.value,
                };

      const stepData = {
        template_id: templateId,
        order_index: form.order_index,
        name: form.name.trim(),
        description: form.description.trim() || null,
        expected_execution_text: form.expected_execution_text.trim() || null,
        end_condition: endCondition,
        parameters: formToParameters(form.parameters),
      };

      let saved: ManeuverTemplateStep;
      if (initialData.step) {
        saved = await updateManeuverTemplateStep(initialData.step.id, stepData);
      } else {
        saved = await createManeuverTemplateStep(stepData);
      }
      onSaved(saved);
      showToast({ variant: "success", message: "Etapa salva." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <div
        className="w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        style={{ maxHeight: "92vh" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {initialData.step ? "Editar etapa" : "Nova etapa"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Nome + Ordem */}
          <div className="flex gap-3">
            <label className="flex-1">
              <span className={labelCls}>Nome da etapa *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                className={inputCls}
                placeholder="Ex: Aceleração para decolagem"
              />
            </label>
            <label className="w-24">
              <span className={labelCls}>Ordem</span>
              <input
                type="number"
                min={1}
                value={form.order_index}
                onChange={(e) => setField("order_index", Number(e.target.value))}
                className={inputCls}
              />
            </label>
          </div>

          {/* Texto de execução */}
          <label>
            <span className={labelCls}>Texto de execução esperada</span>
            <textarea
              rows={3}
              value={form.expected_execution_text}
              onChange={(e) => setField("expected_execution_text", e.target.value)}
              className={inputCls}
              placeholder="Descreva como o aluno deve executar esta etapa..."
            />
          </label>

          {/* Condição de fim */}
          <EndConditionEditor
            value={form.end_condition}
            onChange={(v) => setField("end_condition", v)}
            templateCategory={templateCategory}
          />

          {/* Parâmetros monitorados */}
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <div className="flex items-center justify-between">
              <span className={labelCls}>Parâmetros monitorados ({form.parameters.length})</span>
              <button
                type="button"
                onClick={addParameter}
                className="rounded-lg border border-dashed border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-sky-500/40 hover:text-sky-400"
              >
                + Adicionar
              </button>
            </div>
            {form.parameters.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-600">
                Nenhum parâmetro. Clique em "+ Adicionar" para monitorar valores da telemetria.
              </p>
            ) : (
              <div className="space-y-2">
                {form.parameters.map((param, i) => (
                  <ParameterCard
                    key={i}
                    param={param}
                    index={i}
                    onChange={updateParameter}
                    onRemove={removeParameter}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Descrição técnica (interna) */}
          <label>
            <span className={labelCls}>Notas internas (admin)</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              className={inputCls}
              placeholder="Observações internas sobre esta etapa..."
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar etapa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- StepsList ----------

function StepsList({ template }: { template: ManeuverTemplate }) {
  const { showToast } = useToast();
  const [steps, setSteps] = useState<ManeuverTemplateStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState<{ step?: ManeuverTemplateStep; nextOrder: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSteps(await listManeuverTemplateSteps(template.id));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [template.id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta etapa?")) return;
    try {
      await deleteManeuverTemplateStep(id);
      setSteps((prev) => prev.filter((s) => s.id !== id));
      showToast({ variant: "success", message: "Etapa excluída." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    }
  };

  const handleSaved = (saved: ManeuverTemplateStep) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next.sort((a, b) => a.order_index - b.order_index);
      }
      return [...prev, saved].sort((a, b) => a.order_index - b.order_index);
    });
    setEditingStep(null);
  };

  return (
    <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
      {loading ? (
        <div className="h-8 animate-pulse rounded bg-slate-800/50" />
      ) : steps.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma etapa cadastrada.</p>
      ) : (
        steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            onEdit={(s) => setEditingStep({ step: s, nextOrder: steps.length + 1 })}
            onDelete={(id) => void handleDelete(id)}
          />
        ))
      )}
      <button
        type="button"
        onClick={() => setEditingStep({ nextOrder: steps.length + 1 })}
        className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-sky-500/40 hover:text-sky-400"
      >
        <span>+</span> Adicionar etapa
      </button>
      {editingStep && (
        <StepModal
          initialData={editingStep}
          templateId={template.id}
          templateCategory={template.category}
          onClose={() => setEditingStep(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ---------- TemplateCard ----------

function TemplateCard({
  template,
  models,
  onUpdated,
}: {
  template: ManeuverTemplate;
  models: AircraftModel[];
  onUpdated: (t: ManeuverTemplate) => void;
}) {
  const { showToast } = useToast();
  const [showSteps, setShowSteps] = useState(false);
  const [toggling, setToggling] = useState(false);

  const modelName = models.find((m) => m.id === template.aircraft_model_id)?.name ?? template.aircraft_model_id;

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await updateManeuverTemplate(template.id, { is_active: !template.is_active });
      onUpdated(updated);
      showToast({
        variant: "success",
        message: updated.is_active ? "Manobra ativada." : "Manobra desativada.",
      });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-100">{template.name}</p>
            <ActiveBadge active={template.is_active} />
            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">
              {MANEUVER_CATEGORY_LABELS[template.category] ?? template.category}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Aeronave: {modelName}</p>
          {template.description && (
            <p className="mt-1 text-sm text-slate-400">{template.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={toggling}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            {template.is_active ? "Desativar" : "Ativar"}
          </button>
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            {showSteps ? "Ocultar etapas" : "Gerenciar etapas"}
          </button>
        </div>
      </div>
      {showSteps && <StepsList template={template} />}
    </div>
  );
}

// ---------- TemplateModal ----------

function TemplateModal({
  initial,
  models,
  onClose,
  onSaved,
}: {
  initial?: ManeuverTemplate;
  models: AircraftModel[];
  onClose: () => void;
  onSaved: (t: ManeuverTemplate) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<TemplateFormData>(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          aircraft_model_id: initial.aircraft_model_id,
          description: initial.description ?? "",
          is_active: initial.is_active,
        }
      : emptyTemplateForm(),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast({ variant: "error", message: "Nome da manobra é obrigatório." });
      return;
    }
    if (!form.aircraft_model_id) {
      showToast({ variant: "error", message: "Selecione o modelo de aeronave." });
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        category: form.category,
        aircraft_model_id: form.aircraft_model_id,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      const saved = initial
        ? await updateManeuverTemplate(initial.id, data)
        : await createManeuverTemplate(data);
      onSaved(saved);
      showToast({ variant: "success", message: "Template salvo." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {initial ? "Editar manobra" : "Nova manobra"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <label>
            <span className={labelCls}>Nome da manobra *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Decolagem normal"
            />
          </label>
          <label>
            <span className={labelCls}>Categoria *</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ManeuverCategory }))}
              className={inputCls}
            >
              {CATEGORIES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Modelo de aeronave *</span>
            <select
              value={form.aircraft_model_id}
              onChange={(e) => setForm((f) => ({ ...f, aircraft_model_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">Selecione o modelo</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Descrição</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputCls}
              placeholder="Descreva brevemente a manobra..."
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-600 accent-sky-500"
            />
            <span className="text-sm text-slate-300">Ativa (visível para instrutores)</span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- FlightReviewAdminTab ----------

export function FlightReviewAdminTab() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<ManeuverTemplate[]>([]);
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<
    { mode: "create" } | { mode: "edit"; template: ManeuverTemplate } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmpl, mdls] = await Promise.all([listManeuverTemplates(), listModels()]);
      setTemplates(tmpl);
      setModels(mdls);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = (saved: ManeuverTemplate) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setModalOpen(null);
  };

  const active = templates.filter((t) => t.is_active);
  const inactive = templates.filter((t) => !t.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Flight Review</h2>
          <p className="text-sm text-slate-400">Templates de manobras para análise de telemetria</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen({ mode: "create" })}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          + Nova manobra
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/40" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-400">Nenhum template cadastrado.</p>
          <p className="mt-1 text-sm text-slate-500">Crie o primeiro template de manobra para começar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Ativas ({active.length})
              </p>
              {active.map((t) => (
                <TemplateCard key={t.id} template={t} models={models} onUpdated={handleSaved} />
              ))}
            </section>
          )}
          {inactive.length > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Inativas ({inactive.length})
              </p>
              {inactive.map((t) => (
                <TemplateCard key={t.id} template={t} models={models} onUpdated={handleSaved} />
              ))}
            </section>
          )}
        </div>
      )}

      {modalOpen && (
        <TemplateModal
          initial={modalOpen.mode === "edit" ? modalOpen.template : undefined}
          models={models}
          onClose={() => setModalOpen(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
