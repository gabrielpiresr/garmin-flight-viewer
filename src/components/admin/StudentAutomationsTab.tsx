import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  deleteStudentAutomation,
  duplicateStudentAutomation,
  listAutomationEmailTemplates,
  listStudentAutomations,
  listStudentCrmStatuses,
  saveStudentAutomation,
  setStudentAutomationStatus,
  simulateStudentAutomation,
  testStudentAutomation,
} from "../../lib/studentAutomationsDb";
import { getAdminStudentsProgress } from "../../lib/adminUsersDb";
import { listWppTemplates } from "../../lib/wppDb";
import { listTrainingTracks } from "../../lib/trainingTracksDb";
import type { AdminStudentProgressRow } from "../../types/adminStudents";
import type { TrainingTrack } from "../../types/trainingTrack";
import type { WppTemplate } from "../../types/wpp";
import {
  AUTOMATION_TEMPLATE_VARIABLES,
  EMPTY_CONDITION_TREE,
  type AutomationCondition,
  type AutomationConditionField,
  type AutomationConditionGroup,
  type AutomationEmailTemplate,
  type AutomationOperator,
  type AutomationRecipient,
  type AutomationSimulation,
  type AutomationStep,
  type AutomationTriggerType,
  type StudentAutomation,
  type StudentAutomationInput,
  type StudentCrmStatus,
} from "../../types/studentAutomation";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";
import { usePermissions } from "../../contexts/PermissionsContext";

const TRIGGERS: Array<{
  id: AutomationTriggerType;
  label: string;
  group: string;
}> = [
  { id: "student.created", label: "Aluno criado", group: "Aluno" },
  {
    id: "student.crm_status_changed",
    label: "Status CRM alterado",
    group: "Aluno",
  },
  {
    id: "student.days_without_flight_reached",
    label: "Dias sem voar atingidos",
    group: "Aluno",
  },
  { id: "student.birthday", label: "Aniversário do aluno", group: "Aluno" },
  {
    id: "training.progress_reached",
    label: "% da trilha atingido",
    group: "Trilha",
  },
  {
    id: "training.track_changed",
    label: "Trilha atribuída/alterada",
    group: "Trilha",
  },
  { id: "flight.created", label: "Voo criado", group: "Voo" },
  {
    id: "flight.status_changed",
    label: "Status do voo alterado",
    group: "Voo",
  },
  { id: "flight.completed", label: "Voo realizado", group: "Voo" },
  { id: "flight.solo_completed", label: "Voo solo realizado", group: "Voo" },
  {
    id: "credits.balance_crossed",
    label: "Saldo de créditos cruzou valor",
    group: "Créditos",
  },
  {
    id: "credits.expiring",
    label: "Crédito próximo do vencimento",
    group: "Créditos",
  },
  {
    id: "schedule.no_future_flight",
    label: "Aluno sem próximo voo",
    group: "Agenda",
  },
  {
    id: "schedule.next_flight_in",
    label: "Próximo voo dentro de X dias",
    group: "Agenda",
  },
];

const CONDITION_FIELDS: Array<{
  id: AutomationConditionField;
  label: string;
  kind: "number" | "text" | "boolean";
}> = [
  {
    id: "training.progress_percent",
    label: "% concluído da trilha",
    kind: "number",
  },
  { id: "training.track_id", label: "Trilha", kind: "text" },
  { id: "training.track_status", label: "Status da trilha", kind: "text" },
  {
    id: "activity.days_without_flight",
    label: "Dias sem voar",
    kind: "number",
  },
  { id: "activity.flight_count", label: "Quantidade de voos", kind: "number" },
  { id: "activity.solo_flight_count", label: "Voos solo", kind: "number" },
  { id: "flight.status", label: "Status atual do voo", kind: "text" },
  {
    id: "flight.previous_status",
    label: "Status anterior do voo",
    kind: "text",
  },
  {
    id: "credits.balance_hours",
    label: "Saldo de créditos (h)",
    kind: "number",
  },
  {
    id: "credits.expires_in_days",
    label: "Crédito vence em dias",
    kind: "number",
  },
  { id: "student.crm_status_id", label: "Status CRM", kind: "text" },
  {
    id: "schedule.has_future_flight",
    label: "Possui voo futuro",
    kind: "boolean",
  },
  {
    id: "schedule.next_flight_in_days",
    label: "Próximo voo em dias",
    kind: "number",
  },
  {
    id: "student.days_since_created",
    label: "Dias desde o cadastro",
    kind: "number",
  },
  { id: "contact.has_email", label: "Possui email", kind: "boolean" },
  { id: "contact.has_phone", label: "Possui telefone", kind: "boolean" },
  { id: "contact.has_push", label: "Possui push", kind: "boolean" },
  { id: "contact.has_instructor", label: "Possui instrutor", kind: "boolean" },
];

const OPERATORS: Array<{ id: AutomationOperator; label: string }> = [
  { id: "eq", label: "é igual a" },
  { id: "neq", label: "não é igual a" },
  { id: "gt", label: "é maior que" },
  { id: "gte", label: "é maior ou igual" },
  { id: "lt", label: "é menor que" },
  { id: "lte", label: "é menor ou igual" },
  { id: "in", label: "está entre" },
  { id: "not_in", label: "não está entre" },
  { id: "exists", label: "existe" },
  { id: "not_exists", label: "não existe" },
];

const RECIPIENTS: Array<{ id: AutomationRecipient; label: string }> = [
  { id: "student", label: "Aluno" },
  { id: "instructors", label: "Instrutores vinculados" },
  { id: "admins", label: "Admins" },
];
const FLIGHT_STATUSES = [
  "Pendente",
  "Confirmado",
  "Previsto",
  "Cancelado",
  "Realizado",
];
const TRACK_STATUSES = [
  { value: "active", label: "Ativa" },
  { value: "paused", label: "Pausada" },
  { value: "completed", label: "Concluída" },
];
const MULTISELECT_FIELDS = new Set<AutomationConditionField>([
  "training.track_id",
  "training.track_status",
  "student.crm_status_id",
  "flight.status",
  "flight.previous_status",
]);

const VARIABLE_LABELS: Record<string, string> = {
  "student.name": "Nome completo do aluno",
  "student.first_name": "Primeiro nome do aluno",
  "student.email": "Email do aluno",
  "student.phone": "Telefone do aluno",
  "student.crm_status": "Status CRM atual",
  "training.track_name": "Nome da trilha principal",
  "training.progress_percent": "Progresso da trilha (%)",
  "activity.days_without_flight": "Dias desde o último voo",
  "activity.last_flight_date": "Data do último voo",
  "credits.balance_hours": "Saldo de créditos em horas",
  "flight.date": "Data do voo do gatilho",
  "flight.time": "Horário do voo do gatilho",
  "flight.status": "Status do voo do gatilho",
  "flight.aircraft": "Aeronave do voo",
  "instructor.name": "Nome do instrutor destinatário",
  "school.name": "Nome da escola",
  "school.app_url": "Link do aplicativo",
};

function variableToken(variable: string) {
  return `{{${variable}}}`;
}
function componentText(template: WppTemplate, type: string) {
  return (
    template.components.find(
      (component) => component.type.toUpperCase() === type,
    )?.text || ""
  );
}
function positionalVariables(text: string) {
  const numbers = Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (match) =>
    Number(match[1]),
  );
  return numbers.length ? Math.max(...numbers) : 0;
}
function namedVariables(...values: string[]) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        Array.from(
          value.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi),
          (match) => match[1],
        ),
      ),
    ),
  );
}

function uid() {
  return crypto.randomUUID();
}
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function triggerLabel(id: AutomationTriggerType) {
  return TRIGGERS.find((item) => item.id === id)?.label || id;
}
function statusClass(status: StudentAutomation["status"]) {
  return status === "active"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : status === "paused"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : "border-slate-700 bg-slate-800 text-slate-400";
}

const EMPTY_AUTOMATION: StudentAutomationInput = {
  name: "",
  description: "",
  triggerType: "student.days_without_flight_reached",
  triggerConfig: { threshold: 14, operator: "gte" },
  conditions: EMPTY_CONDITION_TREE,
  steps: [],
  cooldownMinutes: 10080,
};

function toInput(automation: StudentAutomation | null): StudentAutomationInput {
  if (!automation)
    return {
      ...EMPTY_AUTOMATION,
      conditions: { mode: "all", groups: [] },
      steps: [],
    };
  const conditions = {
    ...automation.conditions,
    groups: automation.conditions.groups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => {
        if (!MULTISELECT_FIELDS.has(condition.field)) return condition;
        return {
          ...condition,
          operator:
            condition.operator === "neq"
              ? "not_in"
              : condition.operator === "eq"
                ? "in"
                : condition.operator,
          value: Array.isArray(condition.value)
            ? condition.value
            : condition.value
              ? [String(condition.value)]
              : [],
        };
      }),
    })),
  };
  return {
    name: automation.name,
    description: automation.description,
    triggerType: automation.triggerType,
    triggerConfig: automation.triggerConfig,
    conditions,
    steps: automation.steps,
    cooldownMinutes: automation.cooldownMinutes,
  };
}

function triggerSummary(draft: StudentAutomationInput) {
  const config = draft.triggerConfig;
  if (
    [
      "training.progress_reached",
      "student.days_without_flight_reached",
      "credits.balance_crossed",
      "credits.expiring",
      "schedule.next_flight_in",
    ].includes(draft.triggerType)
  )
    return `${triggerLabel(draft.triggerType)} · ${config.operator || "gte"} ${config.threshold ?? config.days ?? 0}`;
  if (draft.triggerType === "flight.status_changed")
    return `${triggerLabel(draft.triggerType)} · ${config.status || "qualquer status"}`;
  return triggerLabel(draft.triggerType);
}

function stepLabel(step: AutomationStep) {
  if (step.type === "email") return "Enviar email";
  if (step.type === "wpp") return "Enviar WPP";
  if (step.type === "push") return "Enviar push";
  if (step.type === "crm_status") return "Alterar status CRM";
  return `Aguardar ${step.amount} ${step.unit === "days" ? "dia(s)" : step.unit === "hours" ? "hora(s)" : "minuto(s)"}`;
}

function flowNodes(draft: StudentAutomationInput): Node[] {
  const nodes: Node[] = [
    {
      id: "trigger",
      type: "input",
      position: { x: 190, y: 20 },
      data: { label: `⚡ ${triggerSummary(draft)}` },
      draggable: false,
      style: {
        background: "#052e2b",
        color: "#a7f3d0",
        border: "1px solid #10b981",
        borderRadius: 12,
        width: 280,
      },
    },
    {
      id: "conditions",
      position: { x: 190, y: 125 },
      data: {
        label: `◇ Condições · ${draft.conditions.groups.reduce((sum, group) => sum + group.conditions.length, 0)}`,
      },
      draggable: false,
      style: {
        background: "#172033",
        color: "#cbd5e1",
        border: "1px solid #475569",
        borderRadius: 12,
        width: 280,
      },
    },
  ];
  draft.steps.forEach((step, index) =>
    nodes.push({
      id: `step:${step.id}`,
      type: index === draft.steps.length - 1 ? "output" : "default",
      position: { x: 190, y: 230 + index * 110 },
      data: { label: `${index + 1}. ${stepLabel(step)}` },
      style: {
        background: step.type === "wait" ? "#422006" : "#0f2942",
        color: step.type === "wait" ? "#fde68a" : "#bae6fd",
        border: `1px solid ${step.type === "wait" ? "#d97706" : "#0284c7"}`,
        borderRadius: 12,
        width: 280,
      },
    }),
  );
  return nodes;
}

function flowEdges(draft: StudentAutomationInput) {
  const ids = [
    "trigger",
    "conditions",
    ...draft.steps.map((step) => `step:${step.id}`),
  ];
  return ids.slice(0, -1).map((id, index) => ({
    id: `${id}->${ids[index + 1]}`,
    source: id,
    target: ids[index + 1],
    animated: true,
    style: { stroke: "#475569" },
  }));
}

function RecipientSelector({
  value,
  onChange,
}: {
  value: AutomationRecipient[];
  onChange: (next: AutomationRecipient[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-400">Destinatários</p>
      <div className="space-y-1">
        {RECIPIENTS.map((recipient) => (
          <label
            key={recipient.id}
            className="flex items-center gap-2 text-sm text-slate-300"
          >
            <input
              type="checkbox"
              checked={value.includes(recipient.id)}
              onChange={() =>
                onChange(
                  value.includes(recipient.id)
                    ? value.filter((item) => item !== recipient.id)
                    : [...value, recipient.id],
                )
              }
              className="accent-emerald-500"
            />
            {recipient.label}
          </label>
        ))}
      </div>
    </div>
  );
}

type SelectOption = { value: string; label: string };

function MultiSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string[];
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  const selectedLabels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">
        <span className="truncate">
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <span className="ml-2 text-slate-500">▾</span>
      </summary>
      <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-2xl">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() =>
                onChange(
                  value.includes(option.value)
                    ? value.filter((item) => item !== option.value)
                    : [...value, option.value],
                )
              }
              className="accent-emerald-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    </details>
  );
}

function VariableSourceSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = value.replace(/^\{\{|\}\}$/g, "");
  return (
    <select
      value={normalized}
      onChange={(event) =>
        onChange(event.target.value ? variableToken(event.target.value) : "")
      }
      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
    >
      <option value="">Escolha a origem</option>
      {AUTOMATION_TEMPLATE_VARIABLES.map((variable) => (
        <option key={variable} value={variable}>
          {VARIABLE_LABELS[variable] || variable}
        </option>
      ))}
    </select>
  );
}

function WppTextPreview({
  text,
  mappings,
}: {
  text: string;
  mappings: string[];
}) {
  if (!text) return null;
  const parts = text.split(/(\{\{\s*\d+\s*\}\})/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
      {parts.map((part, index) => {
        const match = part.match(/\{\{\s*(\d+)\s*\}\}/);
        if (!match) return <span key={index}>{part}</span>;
        const source = mappings[Number(match[1]) - 1]?.replace(
          /^\{\{|\}\}$/g,
          "",
        );
        return (
          <span
            key={index}
            className={`mx-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${source ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
          >
            {source
              ? VARIABLE_LABELS[source] || source
              : `Variável ${match[1]}`}
          </span>
        );
      })}
    </p>
  );
}

function EmailTemplateSummary({
  template,
}: {
  template: AutomationEmailTemplate;
}) {
  const variables = namedVariables(template.subject, template.bodyHtml);
  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Assunto
        </p>
        <p className="mt-1 text-sm font-medium text-white">
          {template.subject}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Mensagem
        </p>
        <div
          className="mt-1 max-h-36 overflow-y-auto rounded bg-white p-3 text-xs text-slate-800"
          dangerouslySetInnerHTML={{ __html: template.bodyHtml }}
        />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Variáveis detectadas
        </p>
        {variables.length ? (
          <div className="mt-2 space-y-1.5">
            {variables.map((variable) => (
              <div
                key={variable}
                className="flex items-center justify-between gap-2 rounded bg-slate-950 px-2 py-1.5"
              >
                <code className="text-[10px] text-emerald-300">
                  {variableToken(variable)}
                </code>
                <span className="text-right text-[10px] text-slate-500">
                  {VARIABLE_LABELS[variable] || "Variável do contexto"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Este template não usa variáveis.
          </p>
        )}
      </div>
    </div>
  );
}

function TriggerEditor({
  draft,
  setDraft,
  statuses,
}: {
  draft: StudentAutomationInput;
  setDraft: (next: StudentAutomationInput) => void;
  statuses: StudentCrmStatus[];
}) {
  const thresholdTrigger = [
    "training.progress_reached",
    "student.days_without_flight_reached",
    "credits.balance_crossed",
    "credits.expiring",
    "schedule.next_flight_in",
  ].includes(draft.triggerType);
  return (
    <div className="space-y-4">
      <label className="block text-xs text-slate-400">
        Gatilho
        <select
          value={draft.triggerType}
          onChange={(e) =>
            setDraft({
              ...draft,
              triggerType: e.target.value as AutomationTriggerType,
              triggerConfig: {},
            })
          }
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          {Array.from(new Set(TRIGGERS.map((item) => item.group))).map(
            (group) => (
              <optgroup key={group} label={group}>
                {TRIGGERS.filter((item) => item.group === group).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      </label>
      {thresholdTrigger ? (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <label className="text-xs text-slate-400">
            Operador
            <select
              value={
                draft.triggerConfig.operator ||
                (draft.triggerType === "credits.expiring" ||
                draft.triggerType === "schedule.next_flight_in"
                  ? "lte"
                  : "gte")
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  triggerConfig: {
                    ...draft.triggerConfig,
                    operator: e.target.value as AutomationOperator,
                  },
                })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
            >
              {OPERATORS.filter((item) =>
                ["gt", "gte", "lt", "lte", "eq"].includes(item.id),
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Valor
            <input
              type="number"
              value={
                draft.triggerConfig.threshold ?? draft.triggerConfig.days ?? ""
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  triggerConfig: {
                    ...draft.triggerConfig,
                    threshold: Number(e.target.value),
                  },
                })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
            />
          </label>
        </div>
      ) : null}
      {draft.triggerType === "flight.status_changed" ? (
        <label className="block text-xs text-slate-400">
          Novo status
          <select
            value={draft.triggerConfig.status || ""}
            onChange={(e) =>
              setDraft({ ...draft, triggerConfig: { status: e.target.value } })
            }
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">Qualquer status</option>
            {FLIGHT_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      ) : null}
      {draft.triggerType === "student.crm_status_changed" ? (
        <label className="block text-xs text-slate-400">
          Novo status CRM
          <select
            value={draft.triggerConfig.status || ""}
            onChange={(e) =>
              setDraft({ ...draft, triggerConfig: { status: e.target.value } })
            }
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">Qualquer status</option>
            {statuses
              .filter((status) => !status.archived)
              .map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <label className="block text-xs text-slate-400">
        Cooldown (minutos)
        <input
          type="number"
          min={0}
          max={525600}
          value={draft.cooldownMinutes}
          onChange={(e) =>
            setDraft({ ...draft, cooldownMinutes: Number(e.target.value) })
          }
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <span className="mt-1 block text-[10px] text-slate-600">
          10080 minutos = 7 dias. Eventos únicos continuam deduplicados.
        </span>
      </label>
    </div>
  );
}

function ConditionEditor({
  draft,
  setDraft,
  statuses,
  tracks,
}: {
  draft: StudentAutomationInput;
  setDraft: (next: StudentAutomationInput) => void;
  statuses: StudentCrmStatus[];
  tracks: TrainingTrack[];
}) {
  function setGroups(groups: AutomationConditionGroup[]) {
    setDraft({ ...draft, conditions: { ...draft.conditions, groups } });
  }
  function addGroup() {
    setGroups([
      ...draft.conditions.groups,
      { id: uid(), mode: "all", conditions: [] },
    ]);
  }
  function addCondition(groupIndex: number) {
    const groups = [...draft.conditions.groups];
    groups[groupIndex] = {
      ...groups[groupIndex],
      conditions: [
        ...groups[groupIndex].conditions,
        {
          id: uid(),
          field: "activity.days_without_flight",
          operator: "gte",
          value: 14,
        },
      ],
    };
    setGroups(groups);
  }
  function updateCondition(
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<AutomationCondition>,
  ) {
    const groups = [...draft.conditions.groups];
    const conditions = [...groups[groupIndex].conditions];
    conditions[conditionIndex] = { ...conditions[conditionIndex], ...patch };
    groups[groupIndex] = { ...groups[groupIndex], conditions };
    setGroups(groups);
  }
  function choiceOptions(
    field: AutomationConditionField,
  ): SelectOption[] | null {
    if (field === "training.track_id")
      return tracks.map((track) => ({ value: track.id, label: track.name }));
    if (field === "training.track_status") return TRACK_STATUSES;
    if (field === "student.crm_status_id")
      return statuses
        .filter((status) => !status.archived)
        .map((status) => ({ value: status.id, label: status.name }));
    if (field === "flight.status" || field === "flight.previous_status")
      return FLIGHT_STATUSES.map((status) => ({
        value: status,
        label: status,
      }));
    return null;
  }
  function selectField(
    groupIndex: number,
    conditionIndex: number,
    field: AutomationConditionField,
  ) {
    const options = choiceOptions(field);
    const definition = CONDITION_FIELDS.find((item) => item.id === field);
    updateCondition(
      groupIndex,
      conditionIndex,
      options
        ? { field, operator: "in", value: [] }
        : definition?.kind === "boolean"
          ? { field, operator: "eq", value: true }
          : {
              field,
              operator: definition?.kind === "number" ? "gte" : "eq",
              value: definition?.kind === "number" ? 0 : "",
            },
    );
  }
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between text-xs text-slate-400">
        Combinar grupos
        <select
          value={draft.conditions.mode}
          onChange={(e) =>
            setDraft({
              ...draft,
              conditions: {
                ...draft.conditions,
                mode: e.target.value as "all" | "any",
              },
            })
          }
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
        >
          <option value="all">Todos (E)</option>
          <option value="any">Qualquer (OU)</option>
        </select>
      </label>
      {draft.conditions.groups.map((group, groupIndex) => (
        <div
          key={group.id}
          className="rounded-xl border border-slate-700 bg-slate-900/60 p-3"
        >
          <div className="mb-3 flex items-center justify-between">
            <select
              value={group.mode}
              onChange={(e) => {
                const groups = [...draft.conditions.groups];
                groups[groupIndex] = {
                  ...group,
                  mode: e.target.value as "all" | "any",
                };
                setGroups(groups);
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
            >
              <option value="all">Todas as condições</option>
              <option value="any">Qualquer condição</option>
            </select>
            <button
              onClick={() =>
                setGroups(
                  draft.conditions.groups.filter(
                    (_, index) => index !== groupIndex,
                  ),
                )
              }
              className="text-xs text-rose-300"
            >
              Remover grupo
            </button>
          </div>
          <div className="space-y-2">
            {group.conditions.map((condition, conditionIndex) => {
              const field = CONDITION_FIELDS.find(
                (item) => item.id === condition.field,
              );
              return (
                <div
                  key={condition.id}
                  className="rounded border border-slate-800 p-2"
                >
                  <select
                    value={condition.field}
                    onChange={(e) =>
                      selectField(
                        groupIndex,
                        conditionIndex,
                        e.target.value as AutomationConditionField,
                      )
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                  >
                    {CONDITION_FIELDS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(groupIndex, conditionIndex, {
                          operator: e.target.value as AutomationOperator,
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    >
                      {OPERATORS.filter((item) => {
                        if (choiceOptions(condition.field))
                          return item.id === "in" || item.id === "not_in";
                        if (field?.kind === "boolean")
                          return item.id === "eq" || item.id === "neq";
                        if (field?.kind === "number")
                          return ![
                            "in",
                            "not_in",
                            "exists",
                            "not_exists",
                          ].includes(item.id);
                        return true;
                      }).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {choiceOptions(condition.field) ? (
                      <MultiSelect
                        value={
                          Array.isArray(condition.value)
                            ? condition.value
                            : condition.value
                              ? [String(condition.value)]
                              : []
                        }
                        options={choiceOptions(condition.field) || []}
                        placeholder={
                          condition.field === "training.track_id"
                            ? "Selecione uma ou mais trilhas"
                            : "Selecione uma ou mais opções"
                        }
                        onChange={(value) =>
                          updateCondition(groupIndex, conditionIndex, { value })
                        }
                      />
                    ) : field?.kind === "boolean" ? (
                      <select
                        value={String(condition.value)}
                        onChange={(e) =>
                          updateCondition(groupIndex, conditionIndex, {
                            value: e.target.value === "true",
                          })
                        }
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    ) : condition.operator === "exists" ||
                      condition.operator === "not_exists" ? (
                      <div className="flex items-center rounded border border-dashed border-slate-700 px-2 text-[10px] text-slate-500">
                        Sem valor adicional
                      </div>
                    ) : (
                      <input
                        type={field?.kind === "number" ? "number" : "text"}
                        value={String(condition.value ?? "")}
                        onChange={(e) =>
                          updateCondition(groupIndex, conditionIndex, {
                            value:
                              field?.kind === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const groups = [...draft.conditions.groups];
                      groups[groupIndex] = {
                        ...group,
                        conditions: group.conditions.filter(
                          (_, index) => index !== conditionIndex,
                        ),
                      };
                      setGroups(groups);
                    }}
                    className="mt-2 text-[10px] text-rose-300"
                  >
                    Excluir condição
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => addCondition(groupIndex)}
            className="mt-2 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
          >
            + Condição
          </button>
        </div>
      ))}
      <button
        onClick={addGroup}
        className="w-full rounded border border-dashed border-slate-600 px-3 py-2 text-sm text-slate-400"
      >
        + Grupo E/OU
      </button>
    </div>
  );
}

function StepEditor({
  step,
  update,
  remove,
  templates,
  statuses,
  wppTemplates,
}: {
  step: AutomationStep;
  update: (step: AutomationStep) => void;
  remove: () => void;
  templates: AutomationEmailTemplate[];
  statuses: StudentCrmStatus[];
  wppTemplates: WppTemplate[];
}) {
  const selectedEmailTemplate =
    step.type === "email"
      ? templates.find((template) => template.id === step.templateId)
      : undefined;
  const selectedWppTemplate =
    step.type === "wpp"
      ? wppTemplates.find(
          (template) =>
            template.name === step.templateName &&
            template.language === step.language,
        )
      : undefined;
  const wppHeaderText = selectedWppTemplate
    ? componentText(selectedWppTemplate, "HEADER")
    : "";
  const wppBodyText = selectedWppTemplate
    ? componentText(selectedWppTemplate, "BODY")
    : "";
  function updateWppMapping(
    kind: "headerVariables" | "bodyVariables",
    index: number,
    value: string,
  ) {
    if (step.type !== "wpp") return;
    const mappings = [...step[kind]];
    mappings[index] = value;
    update({ ...step, [kind]: mappings });
  }
  const recipientSelector =
    step.type === "email" || step.type === "push" || step.type === "wpp" ? (
      <RecipientSelector
        value={step.recipients}
        onChange={(recipients) =>
          update({ ...step, recipients } as AutomationStep)
        }
      />
    ) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-white">{stepLabel(step)}</h4>
        <button onClick={remove} className="text-xs text-rose-300">
          Excluir nó
        </button>
      </div>
      {step.type === "email" ? (
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Template
            <select
              value={step.templateId}
              onChange={(e) => update({ ...step, templateId: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Selecione</option>
              {templates
                .filter((template) => template.active)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
            </select>
          </label>
          {selectedEmailTemplate ? (
            <EmailTemplateSummary template={selectedEmailTemplate} />
          ) : null}
        </div>
      ) : null}
      {step.type === "wpp" ? (
        <>
          <label className="block text-xs text-slate-400">
            Template aprovado
            <select
              value={selectedWppTemplate?.id || ""}
              onChange={(e) => {
                const template = wppTemplates.find(
                  (item) => item.id === e.target.value,
                );
                const headerCount = template
                  ? positionalVariables(componentText(template, "HEADER"))
                  : 0;
                const bodyCount = template
                  ? positionalVariables(componentText(template, "BODY"))
                  : 0;
                update({
                  ...step,
                  templateName: template?.name || "",
                  language: template?.language || "pt_BR",
                  headerVariables: Array.from(
                    { length: headerCount },
                    (_, index) => step.headerVariables[index] || "",
                  ),
                  bodyVariables: Array.from(
                    { length: bodyCount },
                    (_, index) => step.bodyVariables[index] || "",
                  ),
                });
              }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Selecione</option>
              {wppTemplates
                .filter((template) => template.status === "APPROVED")
                .map((template) => (
                  <option key={template.id} value={template.name}>
                    {template.name} · {template.language}
                  </option>
                ))}
            </select>
          </label>
          {selectedWppTemplate ? (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Preview do template
                </p>
                {wppHeaderText ? (
                  <div className="mt-2 rounded-t-lg bg-slate-950 px-3 py-2">
                    <WppTextPreview
                      text={wppHeaderText}
                      mappings={step.headerVariables}
                    />
                  </div>
                ) : null}
                <div
                  className={`${wppHeaderText ? "rounded-b-lg" : "mt-2 rounded-lg"} bg-slate-950 px-3 py-3`}
                >
                  <WppTextPreview
                    text={wppBodyText}
                    mappings={step.bodyVariables}
                  />
                </div>
              </div>
              {step.headerVariables.length ? (
                <div>
                  <p className="text-xs font-medium text-slate-300">
                    Variáveis do cabeçalho
                  </p>
                  <div className="mt-2 space-y-2">
                    {step.headerVariables.map((value, index) => (
                      <div
                        key={`header-${index}`}
                        className="grid grid-cols-[56px_1fr] items-center gap-2"
                      >
                        <code className="text-[10px] text-slate-500">{`{{${index + 1}}}`}</code>
                        <VariableSourceSelect
                          value={value}
                          onChange={(next) =>
                            updateWppMapping("headerVariables", index, next)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {step.bodyVariables.length ? (
                <div>
                  <p className="text-xs font-medium text-slate-300">
                    Variáveis do corpo
                  </p>
                  <div className="mt-2 space-y-2">
                    {step.bodyVariables.map((value, index) => (
                      <div
                        key={`body-${index}`}
                        className="grid grid-cols-[56px_1fr] items-center gap-2"
                      >
                        <code className="text-[10px] text-slate-500">{`{{${index + 1}}}`}</code>
                        <VariableSourceSelect
                          value={value}
                          onChange={(next) =>
                            updateWppMapping("bodyVariables", index, next)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Este template não possui variáveis para mapear.
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
      {step.type === "push" ? (
        <>
          <label className="block text-xs text-slate-400">
            Título
            <input
              value={step.title}
              onChange={(e) => update({ ...step, title: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Mensagem
            <textarea
              value={step.body}
              onChange={(e) => update({ ...step, body: e.target.value })}
              className="mt-1 h-28 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Link
            <input
              value={step.url}
              onChange={(e) => update({ ...step, url: e.target.value })}
              placeholder="{{school.app_url}}"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </>
      ) : null}
      {step.type === "crm_status" ? (
        <label className="block text-xs text-slate-400">
          Novo status
          <select
            value={step.statusId}
            onChange={(e) => update({ ...step, statusId: e.target.value })}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">Selecione</option>
            {statuses
              .filter((status) => !status.archived)
              .map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {step.type === "wait" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">
            Quantidade
            <input
              type="number"
              min={1}
              value={step.amount}
              onChange={(e) =>
                update({ ...step, amount: Number(e.target.value) })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            Unidade
            <select
              value={step.unit}
              onChange={(e) =>
                update({
                  ...step,
                  unit: e.target.value as "minutes" | "hours" | "days",
                })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Dias</option>
            </select>
          </label>
        </div>
      ) : null}
      {recipientSelector}
    </div>
  );
}

function SimulationPanel({ simulation }: { simulation: AutomationSimulation }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-white">{simulation.studentName}</p>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${simulation.matched ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}
        >
          {simulation.matched ? "REGRA ATENDIDA" : "NÃO ATENDE"}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Gatilho: {simulation.triggerMatched ? "sim" : "não"} · Condições:{" "}
        {simulation.conditionsMatched ? "sim" : "não"}
      </p>
      {simulation.warnings.length ? (
        <ul className="mt-2 list-disc pl-4 text-xs text-amber-300">
          {simulation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BuilderModal({
  automation,
  templates,
  statuses,
  tracks,
  wppTemplates,
  students,
  onClose,
  onSaved,
}: {
  automation: StudentAutomation | null;
  templates: AutomationEmailTemplate[];
  statuses: StudentCrmStatus[];
  tracks: TrainingTrack[];
  wppTemplates: WppTemplate[];
  students: AdminStudentProgressRow[];
  onClose: () => void;
  onSaved: (automation: StudentAutomation) => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<StudentAutomationInput>(() =>
    toInput(automation),
  );
  const [selected, setSelected] = useState("trigger");
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes(draft));
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges(draft));
  const [saving, setSaving] = useState(false);
  const [testStudent, setTestStudent] = useState("");
  const [simulation, setSimulation] = useState<AutomationSimulation | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    setNodes(flowNodes(draft));
    setEdges(flowEdges(draft));
  }, [draft, setEdges, setNodes]);
  const selectedStepIndex = selected.startsWith("step:")
    ? draft.steps.findIndex((step) => `step:${step.id}` === selected)
    : -1;
  function addStep(type: AutomationStep["type"]) {
    const id = uid();
    const step: AutomationStep =
      type === "email"
        ? { id, type, templateId: "", recipients: ["student"] }
        : type === "wpp"
          ? {
              id,
              type,
              templateName: "",
              language: "pt_BR",
              headerVariables: [],
              bodyVariables: [],
              recipients: ["student"],
            }
          : type === "push"
            ? {
                id,
                type,
                title: "",
                body: "",
                url: "{{school.app_url}}",
                recipients: ["student"],
              }
            : type === "crm_status"
              ? { id, type, statusId: "" }
              : { id, type: "wait", amount: 1, unit: "days" };
    setDraft({ ...draft, steps: [...draft.steps, step] });
    setSelected(`step:${id}`);
  }
  function updateStep(step: AutomationStep) {
    const steps = [...draft.steps];
    steps[selectedStepIndex] = step;
    setDraft({ ...draft, steps });
  }
  function reorderFromCanvas() {
    const ordered = nodes
      .filter((node) => node.id.startsWith("step:"))
      .sort((a, b) => a.position.y - b.position.y)
      .map((node) => draft.steps.find((step) => `step:${step.id}` === node.id))
      .filter((step): step is AutomationStep => Boolean(step));
    if (
      ordered.length === draft.steps.length &&
      ordered.some((step, index) => step.id !== draft.steps[index]?.id)
    )
      setDraft({ ...draft, steps: ordered });
  }
  async function save() {
    setSaving(true);
    try {
      const saved = await saveStudentAutomation(draft, automation?.id);
      showToast({
        variant: "success",
        message: automation
          ? "Nova versão salva."
          : "Automação criada como rascunho.",
      });
      onSaved(saved);
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Falha ao salvar automação.",
      });
    } finally {
      setSaving(false);
    }
  }
  async function simulate() {
    if (!automation?.id || !testStudent) return;
    setTesting(true);
    try {
      setSimulation(
        await simulateStudentAutomation(automation.id, testStudent),
      );
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha na simulação.",
      });
    } finally {
      setTesting(false);
    }
  }
  async function realTest() {
    if (
      !automation?.id ||
      !testStudent ||
      !window.confirm(
        "Executar um teste real? Email/WPP/push configurados serão enviados ao aluno escolhido.",
      )
    )
      return;
    setTesting(true);
    try {
      await testStudentAutomation(automation.id, testStudent);
      showToast({
        variant: "success",
        message: "Teste iniciado. Confira o histórico.",
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha no teste.",
      });
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/95">
      <div className="flex min-h-screen flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 p-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400">
              Construtor visual
            </p>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Nome da automação"
              className="mt-1 min-w-72 border-0 bg-transparent text-xl font-semibold text-white outline-none placeholder:text-slate-600"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
            >
              Fechar
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar rascunho"}
            </button>
          </div>
        </header>
        <div className="grid flex-1 xl:grid-cols-[220px_1fr_360px]">
          <aside className="border-r border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Adicionar nó
            </p>
            <div className="mt-3 grid gap-2">
              {(
                [
                  ["email", "✉ Email"],
                  ["wpp", "◉ WPP"],
                  ["push", "↗ Push"],
                  ["crm_status", "◆ Status CRM"],
                  ["wait", "◷ Aguardar"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => addStep(type)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm text-slate-300 hover:border-emerald-500/50 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs font-medium text-slate-300">Como montar</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Clique no gatilho, nas condições ou em uma ação para configurar.
                Arraste as ações verticalmente para reordenar.
              </p>
            </div>
          </aside>
          <main className="min-h-[620px] bg-slate-900/20">
            <div className="hidden h-full min-h-[620px] md:block">
              <ReactFlowProvider>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={(_, node) => setSelected(node.id)}
                  onNodeDragStart={(_, node) => setSelected(node.id)}
                  onSelectionChange={({ nodes: selectedNodes }) => {
                    if (selectedNodes.length === 1)
                      setSelected(selectedNodes[0].id);
                  }}
                  onNodeDragStop={reorderFromCanvas}
                  nodesConnectable={false}
                  fitView
                  minZoom={0.5}
                  maxZoom={1.5}
                >
                  <Background color="#334155" gap={24} />
                  <MiniMap
                    nodeColor={(node) =>
                      node.id === "trigger"
                        ? "#10b981"
                        : node.id === "conditions"
                          ? "#64748b"
                          : "#0284c7"
                    }
                  />
                  <Controls />
                </ReactFlow>
              </ReactFlowProvider>
            </div>
            <div className="space-y-2 p-4 md:hidden">
              <button
                onClick={() => setSelected("trigger")}
                className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left text-sm text-emerald-300"
              >
                ⚡ {triggerSummary(draft)}
              </button>
              <button
                onClick={() => setSelected("conditions")}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-left text-sm text-slate-300"
              >
                ◇ Condições · {draft.conditions.groups.length} grupo(s)
              </button>
              {draft.steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setSelected(`step:${step.id}`)}
                  className="w-full rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-left text-sm text-sky-300"
                >
                  {index + 1}. {stepLabel(step)}
                </button>
              ))}
            </div>
          </main>
          <aside className="overflow-y-auto border-l border-slate-800 bg-slate-950 p-4 xl:max-h-[calc(100vh-82px)]">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Configuração
            </p>
            {selected === "trigger" ? (
              <TriggerEditor
                draft={draft}
                setDraft={setDraft}
                statuses={statuses}
              />
            ) : selected === "conditions" ? (
              <ConditionEditor
                draft={draft}
                setDraft={setDraft}
                statuses={statuses}
                tracks={tracks}
              />
            ) : selectedStepIndex >= 0 ? (
              <StepEditor
                step={draft.steps[selectedStepIndex]}
                update={updateStep}
                remove={() => {
                  setDraft({
                    ...draft,
                    steps: draft.steps.filter(
                      (_, index) => index !== selectedStepIndex,
                    ),
                  });
                  setSelected("trigger");
                }}
                templates={templates}
                statuses={statuses}
                wppTemplates={wppTemplates}
              />
            ) : null}
            <label className="mt-5 block text-xs text-slate-400">
              Descrição
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                className="mt-1 h-20 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white"
              />
            </label>
            <div className="mt-6 border-t border-slate-800 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Teste com aluno
              </p>
              <select
                value={testStudent}
                onChange={(e) => {
                  setTestStudent(e.target.value);
                  setSimulation(null);
                }}
                className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Selecione um aluno</option>
                {students.map((student) => (
                  <option key={student.userId} value={student.userId}>
                    {student.profile.fullName || student.name || student.email}
                  </option>
                ))}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  disabled={!automation || !testStudent || testing}
                  onClick={() => void simulate()}
                  className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 disabled:opacity-40"
                >
                  Simular
                </button>
                <button
                  disabled={!automation || !testStudent || testing}
                  onClick={() => void realTest()}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-xs text-amber-300 disabled:opacity-40"
                >
                  Teste real
                </button>
              </div>
              {!automation ? (
                <p className="mt-2 text-[10px] text-slate-600">
                  Salve a automação antes de testar.
                </p>
              ) : null}
              {simulation ? (
                <div className="mt-3">
                  <SimulationPanel simulation={simulation} />
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function StudentAutomationsTab() {
  const { showToast } = useToast();
  const { canAction } = usePermissions();
  const canManage = canAction("students.automations.manage");
  const [automations, setAutomations] = useState<StudentAutomation[]>([]);
  const [templates, setTemplates] = useState<AutomationEmailTemplate[]>([]);
  const [statuses, setStatuses] = useState<StudentCrmStatus[]>([]);
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
  const [wppTemplates, setWppTemplates] = useState<WppTemplate[]>([]);
  const [students, setStudents] = useState<AdminStudentProgressRow[]>([]);
  const [studentsRequested, setStudentsRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentAutomation | "new" | null>(
    null,
  );
  const [query, setQuery] = useState("");
  async function load() {
    setLoading(true);
    try {
      const definitionsRequest = listStudentAutomations();
      const supportingDataRequest = Promise.all([
        listAutomationEmailTemplates().catch(() => []),
        listStudentCrmStatuses().catch(() => []),
        listTrainingTracks().catch(() => ({ data: [], error: null })),
        listWppTemplates().catch(() => []),
      ]);
      const defs = await definitionsRequest;
      setAutomations(defs);
      setLoading(false);
      const [emailTemplates, crmStatuses, trackResult, whatsappTemplates] =
        await supportingDataRequest;
      setTemplates(emailTemplates);
      setStatuses(crmStatuses);
      setTracks(trackResult.data);
      setWppTemplates(whatsappTemplates);
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao carregar automações.",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!editing || studentsRequested) return;
    setStudentsRequested(true);
    void getAdminStudentsProgress({ today: isoToday(), inactiveDays: 365 })
      .then((progress) => setStudents(progress.students || []))
      .catch(() => setStudents([]));
  }, [editing, studentsRequested]);
  const visible = useMemo(
    () =>
      automations.filter((automation) =>
        `${automation.name} ${automation.description} ${automation.triggerType}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [automations, query],
  );
  async function toggle(automation: StudentAutomation) {
    const next = automation.status === "active" ? "paused" : "active";
    if (
      next === "active" &&
      !window.confirm(
        "Ativar esta automação? O estado atual será usado como linha de base e nenhum aluno já enquadrado receberá mensagens imediatamente.",
      )
    )
      return;
    try {
      const updated = await setStudentAutomationStatus(automation.id, next);
      setAutomations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      showToast({
        variant: "success",
        message:
          next === "active"
            ? "Automação ativada."
            : "Automação pausada e esperas canceladas.",
      });
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Falha ao alterar status.",
      });
    }
  }
  async function duplicate(automation: StudentAutomation) {
    try {
      const duplicated = await duplicateStudentAutomation(automation.id);
      setAutomations((current) => [duplicated, ...current]);
      showToast({
        variant: "success",
        message: "Automação duplicada como rascunho.",
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao duplicar.",
      });
    }
  }
  async function remove(automation: StudentAutomation) {
    if (
      !window.confirm(
        `Excluir “${automation.name}”? O histórico será preservado e esperas serão canceladas.`,
      )
    )
      return;
    try {
      await deleteStudentAutomation(automation.id);
      setAutomations((current) =>
        current.filter((item) => item.id !== automation.id),
      );
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao excluir.",
      });
    }
  }
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            CRM operacional
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Automações de alunos
          </h2>
          <p className="text-sm text-slate-400">
            Gatilhos, condições E/OU, mensagens, mudanças de status e esperas
            persistentes.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar automação"
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          {canManage ? (
            <button
              onClick={() => setEditing("new")}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Nova automação
            </button>
          ) : null}
        </div>
      </section>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((automation) => (
            <article
              key={automation.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/45 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-white">
                      {automation.name}
                    </h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(automation.status)}`}
                    >
                      {automation.status === "active"
                        ? "ATIVA"
                        : automation.status === "paused"
                          ? "PAUSADA"
                          : "RASCUNHO"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {automation.description || "Sem descrição"}
                  </p>
                </div>
                {canManage ? (
                  <button
                    role="switch"
                    aria-checked={automation.status === "active"}
                    onClick={() => void toggle(automation)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${automation.status === "active" ? "bg-emerald-500" : "bg-slate-700"}`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${automation.status === "active" ? "left-6" : "left-1"}`}
                    />
                  </button>
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs font-medium text-emerald-300">
                  ⚡ {triggerLabel(automation.triggerType)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {automation.steps.length} passo(s) · cooldown{" "}
                  {Math.round((automation.cooldownMinutes / 1440) * 10) / 10}{" "}
                  dia(s) · versão {automation.version}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <InfoStat label="Execuções" value={automation.runCount} />
                <InfoStat label="Sucesso" value={automation.successCount} />
                <InfoStat label="Falhas" value={automation.failureCount} />
              </div>
              {canManage ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditing(automation)}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void duplicate(automation)}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                  >
                    Duplicar
                  </button>
                  <button
                    onClick={() => void remove(automation)}
                    className="rounded border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300"
                  >
                    Excluir
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 p-14 text-center">
          <p className="text-sm text-slate-400">Nenhuma automação criada.</p>
          {canManage ? (
            <button
              onClick={() => setEditing("new")}
              className="mt-3 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Criar primeiro fluxo
            </button>
          ) : null}
        </div>
      )}
      {editing ? (
        <BuilderModal
          automation={editing === "new" ? null : editing}
          templates={templates}
          statuses={statuses}
          tracks={tracks}
          wppTemplates={wppTemplates}
          students={students}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setAutomations((current) => {
              const exists = current.some((item) => item.id === saved.id);
              return exists
                ? current.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...current];
            });
          }}
        />
      ) : null}
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-900 p-2">
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </p>
    </div>
  );
}
