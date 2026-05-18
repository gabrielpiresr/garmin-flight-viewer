import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { listModels } from "../../lib/aircraftModelsDb";
import { listRecentFlightTelemetryAlerts, type FlightTelemetryAlertDoc } from "../../lib/flightTelemetryAlertsDb";
import { getProfile, type PilotProfile } from "../../lib/rbac";
import {
  createTelemetryAlertRule,
  deleteTelemetryAlertRule,
  listTelemetryAlertRulesByModel,
  updateTelemetryAlertRule,
  type TelemetryAlertRule,
} from "../../lib/telemetryAlertRulesDb";
import {
  isTouchdownProperty,
  propertyLabel,
  propertyUnit,
  TELEMETRY_ALERT_PHASES,
  TELEMETRY_ALERT_PROPERTIES,
  TELEMETRY_ALERT_SEVERITIES,
  type TelemetryAlertCondition,
  type TelemetryAlertOperator,
  type TelemetryAlertPhase,
  type TelemetryAlertProperty,
  type TelemetryAlertSeverity,
} from "../../lib/telemetryAlerts";
import type { AircraftModel } from "../../types/admin";
import { TelemetriaTab } from "../TelemetriaTab";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";

type AdminAlertsSubTab = "triggered" | "settings";

type ConditionDraft = {
  property: TelemetryAlertProperty;
  operator: TelemetryAlertOperator;
  value: string;
};

type FormDraft = {
  name: string;
  severity: TelemetryAlertSeverity;
  phases: TelemetryAlertPhase[];
  conditions: ConditionDraft[];
  durationSec: string;
  active: boolean;
};

type AlertFilters = {
  periodPreset: PeriodPresetKey;
  fromDate: string;
  toDate: string;
  models: string[];
  aircrafts: string[];
  instructors: string[];
  students: string[];
  alertNames: string[];
  severities: string[];
};

type AlertProfile = Pick<PilotProfile, "fullName" | "email" | "anacCode">;
type AlertProfileMap = Record<string, AlertProfile | null>;
type PeriodPresetKey = "custom" | "thisWeek" | "thisMonth" | "last30" | "thisYear" | "lastYear" | "all";
type MultiFilterKey = "models" | "aircrafts" | "instructors" | "students" | "alertNames" | "severities";

const ADMIN_ALERT_TABS: Array<{ id: AdminAlertsSubTab; label: string; icon: ReactNode }> = [
  { id: "triggered", label: "Alertas disparados", icon: <TriggeredAlertsIcon /> },
  { id: "settings", label: "Configurações", icon: <SettingsIcon /> },
];

const PERIOD_PRESETS: Array<{ key: PeriodPresetKey; label: string }> = [
  { key: "custom", label: "Personalizado" },
  { key: "thisWeek", label: "Essa semana" },
  { key: "thisMonth", label: "Esse mês" },
  { key: "last30", label: "Últimos 30 dias" },
  { key: "thisYear", label: "Esse ano" },
  { key: "lastYear", label: "Ano passado" },
  { key: "all", label: "Todo período" },
];

const emptyCondition: ConditionDraft = { property: "oilPsi", operator: "gt", value: "" };

const emptyForm: FormDraft = {
  name: "",
  severity: "leve",
  phases: ["all"],
  conditions: [emptyCondition],
  durationSec: "10",
  active: true,
};

const emptyAlertFilters: AlertFilters = {
  periodPreset: "all",
  fromDate: "",
  toDate: "",
  models: [],
  aircrafts: [],
  instructors: [],
  students: [],
  alertNames: [],
  severities: [],
};

const SEVERITY_CLASS: Record<TelemetryAlertSeverity, string> = {
  leve: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  risco: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionText(condition: TelemetryAlertCondition): string {
  const unit = propertyUnit(condition.property);
  return `${propertyLabel(condition.property)} ${condition.operator === "gt" ? ">" : "<"} ${condition.value}${unit ? ` ${unit}` : ""}`;
}

function formatRule(rule: TelemetryAlertRule): string {
  const conditions = rule.conditions.map(conditionText).join(" E ");
  const duration = rule.durationSec ? ` por ${rule.durationSec}s` : "";
  return `${conditions}${duration}`;
}

function baseValueText(conditions: TelemetryAlertCondition[]): string {
  return conditions.map(conditionText).join(" E ");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText.slice(0, 10);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return isoDate(date);
}

function endOfIsoWeek(dateText: string): string {
  const date = new Date(`${startOfIsoWeek(dateText)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return isoDate(date);
}

function periodForPreset(key: PeriodPresetKey): { fromDate: string; toDate: string } {
  const today = new Date();
  const todayIso = isoDate(today);
  if (key === "all" || key === "custom") return { fromDate: "", toDate: "" };
  if (key === "thisWeek") return { fromDate: startOfIsoWeek(todayIso), toDate: endOfIsoWeek(todayIso) };
  if (key === "thisMonth") return { fromDate: todayIso.slice(0, 8) + "01", toDate: todayIso };
  if (key === "last30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { fromDate: isoDate(from), toDate: todayIso };
  }
  if (key === "thisYear") return { fromDate: `${todayIso.slice(0, 4)}-01-01`, toDate: todayIso };
  const year = Number(todayIso.slice(0, 4)) - 1;
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}

function severityLabel(value: TelemetryAlertSeverity): string {
  return TELEMETRY_ALERT_SEVERITIES.find((severity) => severity.key === value)?.label ?? value;
}

function formatFlightDate(value: string | null): string {
  if (!value) return "sem data";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return value;
  }
}

function formatAlertTime(value: string | null): string {
  if (!value) return "horário indisponível";
  try {
    return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return value;
  }
}

function shortUserId(userId: string): string {
  return userId.length > 10 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;
}

function formatPerson(profileMap: AlertProfileMap, userId: string | null | undefined, fallback: string): string {
  if (!userId) return fallback;
  const profile = profileMap[userId];
  return profile?.fullName?.trim() || profile?.email?.trim() || shortUserId(userId);
}

function parseEvidenceValues(evidenceJson: string): Partial<Record<TelemetryAlertProperty, number>> {
  try {
    const parsed = JSON.parse(evidenceJson) as { values?: Partial<Record<TelemetryAlertProperty, number>> };
    return parsed.values ?? {};
  } catch {
    return {};
  }
}

function formatParameterValue(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  return unit ? `${rounded}${unit}` : rounded;
}

function formatTriggeredParameters(alert: FlightTelemetryAlertDoc): string {
  const values = parseEvidenceValues(alert.evidenceJson);
  const text = Object.entries(values)
    .map(([key, value]) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      const property = key as TelemetryAlertProperty;
      return `${propertyLabel(property)}: ${formatParameterValue(value, propertyUnit(property))}`;
    })
    .filter(Boolean)
    .join(", ");
  return text || "—";
}

function normalizeForm(rule: TelemetryAlertRule): FormDraft {
  return {
    name: rule.name,
    severity: rule.severity,
    phases: rule.phases.length ? rule.phases : ["all"],
    conditions: rule.conditions.length
      ? rule.conditions.map((condition) => ({
          property: condition.property,
          operator: condition.operator,
          value: String(condition.value),
        }))
      : [emptyCondition],
    durationSec: rule.durationSec != null ? String(rule.durationSec) : "",
    active: rule.active,
  };
}

function TriggeredAlertsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 2.25a6.25 6.25 0 00-6.25 6.25v2.63L2.47 13.7A.75.75 0 003.14 14.8h13.72a.75.75 0 00.67-1.1l-1.28-2.57V8.5A6.25 6.25 0 0010 2.25zm0 15.5a2.5 2.5 0 002.35-1.65h-4.7A2.5 2.5 0 0010 17.75z" clipRule="evenodd" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M11.49 2.17a1.5 1.5 0 00-2.98 0l-.12.92a7.84 7.84 0 00-1.7.7l-.74-.56a1.5 1.5 0 00-2.1 2.1l.56.74c-.28.54-.52 1.1-.7 1.7l-.92.12a1.5 1.5 0 000 2.98l.92.12c.18.6.42 1.16.7 1.7l-.56.74a1.5 1.5 0 102.1 2.1l.74-.56c.54.28 1.1.52 1.7.7l.12.92a1.5 1.5 0 002.98 0l.12-.92c.6-.18 1.16-.42 1.7-.7l.74.56a1.5 1.5 0 102.1-2.1l-.56-.74c.28-.54.52-1.1.7-1.7l.92-.12a1.5 1.5 0 000-2.98l-.92-.12a7.84 7.84 0 00-.7-1.7l.56-.74a1.5 1.5 0 00-2.1-2.1l-.74.56a7.84 7.84 0 00-1.7-.7l-.12-.92zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" />
    </svg>
  );
}

function FilterMultiSelect({
  label,
  options,
  value,
  open,
  onOpen,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  open: boolean;
  onOpen: () => void;
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const buttonLabel = value.length === 0 ? `Todas ${label.toLowerCase()}` : value.length === 1 ? value[0] : `${value.length} selecionados`;

  function toggle(item: string) {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange(Array.from(next));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-10 w-full items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-left text-sm text-slate-100 outline-none hover:border-slate-600"
      >
        <span className="min-w-0 truncate">
          <span className="text-slate-500">{label}: </span>
          {buttonLabel}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-slate-950">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${value.length === 0 ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-slate-800"}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${value.length === 0 ? "border-emerald-400 bg-emerald-500/20" : "border-slate-600"}`}>
              {value.length === 0 ? "✓" : ""}
            </span>
            Todas
          </button>
          {options.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
              <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} className="h-4 w-4 accent-emerald-500" />
              <span className="min-w-0 truncate">{item}</span>
            </label>
          ))}
          {!options.length ? <p className="px-2 py-3 text-xs text-slate-500">Nenhuma opção disponível.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function TelemetryAlertsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<AdminAlertsSubTab>("triggered");
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [rules, setRules] = useState<TelemetryAlertRule[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormDraft>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<FlightTelemetryAlertDoc[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [alertProfiles, setAlertProfiles] = useState<AlertProfileMap>({});
  const [alertFilters, setAlertFilters] = useState<AlertFilters>(emptyAlertFilters);
  const [openFilter, setOpenFilter] = useState<MultiFilterKey | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<FlightTelemetryAlertDoc | null>(null);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    setLoadingModels(true);
    listModels()
      .then((items) => {
        setModels(items);
        if (items[0]) setSelectedModelId(items[0].id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingModels(false));
  }, []);

  const loadRules = useCallback(async (modelId: string) => {
    if (!modelId) return;
    setLoadingRules(true);
    setError(null);
    try {
      setRules(await listTelemetryAlertRulesByModel(modelId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (selectedModelId) void loadRules(selectedModelId);
  }, [selectedModelId, loadRules]);

  const loadRecentAlerts = useCallback(async () => {
    setRecentLoading(true);
    const result = await listRecentFlightTelemetryAlerts(500);
    setRecentLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRecentAlerts(result.data);
  }, []);

  useEffect(() => {
    void loadRecentAlerts();
  }, [loadRecentAlerts]);

  useEffect(() => {
    let cancelled = false;
    const userIds = Array.from(
      new Set(
        recentAlerts
          .flatMap((alert) => [alert.studentUserId, alert.instructorUserId])
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (userIds.length === 0) {
      setAlertProfiles({});
      return;
    }

    void Promise.all(
      userIds.map(async (userId) => {
        try {
          const { data } = await getProfile(userId);
          return [
            userId,
            data ? { fullName: data.fullName, email: data.email, anacCode: data.anacCode } : null,
          ] as const;
        } catch {
          return [userId, null] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setAlertProfiles(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
  }, [recentAlerts]);

  const selectedModel = models.find((model) => model.id === selectedModelId);
  const hasTouchdownCondition = form.conditions.some((condition) => isTouchdownProperty(condition.property));
  const hasContinuousCondition = form.conditions.some((condition) => !isTouchdownProperty(condition.property));
  const modelNameById = useMemo(() => new Map(models.map((model) => [model.id, model.name])), [models]);
  const alertOptions = useMemo(
    () => {
      const uniqueOptions = (values: Array<string | null | undefined>) =>
        Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
          .sort((a, b) => a.localeCompare(b));

      return {
        models: uniqueOptions(recentAlerts.map((alert) => modelNameById.get(alert.modelId) ?? alert.modelId)),
        aircrafts: uniqueOptions(recentAlerts.map((alert) => alert.aircraftIdent)),
        instructors: uniqueOptions(recentAlerts.map((alert) => formatPerson(alertProfiles, alert.instructorUserId, "Sem INVA"))),
        students: uniqueOptions(recentAlerts.map((alert) => formatPerson(alertProfiles, alert.studentUserId, "Aluno"))),
        alertNames: uniqueOptions(recentAlerts.map((alert) => alert.ruleName)),
        severities: TELEMETRY_ALERT_SEVERITIES.map((severity) => severity.label),
      };
    },
    [alertProfiles, modelNameById, recentAlerts],
  );
  const filteredAlerts = useMemo(() => {
    return recentAlerts.filter((alert) => {
      const date = alert.flightDate || alert.createdAt.slice(0, 10);
      const modelName = modelNameById.get(alert.modelId) ?? alert.modelId;
      const instructorName = formatPerson(alertProfiles, alert.instructorUserId, "Sem INVA");
      const studentName = formatPerson(alertProfiles, alert.studentUserId, "Aluno");

      if (alertFilters.fromDate && date < alertFilters.fromDate) return false;
      if (alertFilters.toDate && date > alertFilters.toDate) return false;
      if (alertFilters.models.length && !alertFilters.models.includes(modelName)) return false;
      if (alertFilters.aircrafts.length && !alertFilters.aircrafts.includes(alert.aircraftIdent ?? "")) return false;
      if (alertFilters.instructors.length && !alertFilters.instructors.includes(instructorName)) return false;
      if (alertFilters.students.length && !alertFilters.students.includes(studentName)) return false;
      if (alertFilters.alertNames.length && !alertFilters.alertNames.includes(alert.ruleName)) return false;
      if (alertFilters.severities.length && !alertFilters.severities.includes(severityLabel(alert.severity))) return false;

      return true;
    });
  }, [alertFilters, alertProfiles, modelNameById, recentAlerts]);

  function setPresetPeriod(key: PeriodPresetKey) {
    setAlertFilters((current) => {
      if (key === "custom") return { ...current, periodPreset: key };
      const next = periodForPreset(key);
      return { ...current, periodPreset: key, fromDate: next.fromDate, toDate: next.toDate };
    });
  }

  const validationMessage = useMemo(() => {
    if (!selectedModelId) return "Selecione um modelo.";
    if (!form.name.trim()) return "Informe o nome do alerta.";
    if (form.conditions.length < 1 || form.conditions.length > 3) return "Use de 1 a 3 condicoes.";
    if (hasTouchdownCondition && hasContinuousCondition) return "Nao misture propriedades de toque com propriedades continuas.";
    for (const condition of form.conditions) {
      if (parseNumber(condition.value) === null) return "Informe um valor valido para cada condicao.";
    }
    if (!hasTouchdownCondition && (!parseNumber(form.durationSec) || Number(form.durationSec) <= 0)) {
      return "Informe por quantos segundos a regra precisa permanecer ativa.";
    }
    return null;
  }, [form, hasContinuousCondition, hasTouchdownCondition, selectedModelId]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(rule: TelemetryAlertRule) {
    setEditingId(rule.id);
    setForm(normalizeForm(rule));
    setShowForm(true);
  }

  function togglePhase(phase: TelemetryAlertPhase) {
    setForm((current) => {
      if (phase === "all") return { ...current, phases: ["all"] };
      const withoutAll = current.phases.filter((item) => item !== "all");
      const phases = withoutAll.includes(phase)
        ? withoutAll.filter((item) => item !== phase)
        : [...withoutAll, phase];
      return { ...current, phases: phases.length ? phases : ["all"] };
    });
  }

  function updateCondition(index: number, patch: Partial<ConditionDraft>) {
    setForm((current) => {
      const conditions = current.conditions.map((condition, itemIndex) =>
        itemIndex === index ? { ...condition, ...patch } : condition,
      );
      const touchesTouchdown = conditions.some((condition) => isTouchdownProperty(condition.property));
      return {
        ...current,
        conditions,
        durationSec: touchesTouchdown ? "" : current.durationSec || "10",
      };
    });
  }

  function removeCondition(index: number) {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addCondition() {
    setForm((current) => {
      if (current.conditions.length >= 3) return current;
      return {
        ...current,
        conditions: [...current.conditions, { ...emptyCondition }],
      };
    });
  }

  async function handleSave() {
    if (validationMessage || !user) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        modelId: selectedModelId,
        name: form.name.trim(),
        severity: form.severity,
        phases: form.phases,
        conditions: form.conditions.map((condition) => ({
          property: condition.property,
          operator: condition.operator,
          value: parseNumber(condition.value)!,
        })),
        durationSec: hasTouchdownCondition ? null : parseNumber(form.durationSec),
        active: form.active,
      };
      if (editingId) {
        const updated = await updateTelemetryAlertRule(editingId, payload, user.id);
        setRules((prev) => prev.map((rule) => (rule.id === editingId ? updated : rule)));
        showToast({ variant: "success", message: "Alerta atualizado." });
      } else {
        const created = await createTelemetryAlertRule(payload, user.id);
        setRules((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showToast({ variant: "success", message: "Alerta criado." });
      }
      setShowForm(false);
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTelemetryAlertRule(id);
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      showToast({ variant: "success", message: "Alerta excluido." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteConfirm(null);
    }
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Alertas de Telemetria</h2>
        <p className="text-xs text-slate-500">Acompanhe ocorrências disparadas e gerencie regras por modelo.</p>
      </div>

      <Tabs
        items={ADMIN_ALERT_TABS}
        value={activeSubTab}
        onChange={(tab) => {
          setActiveSubTab(tab);
          if (tab === "triggered") setShowForm(false);
        }}
        ariaLabel="Seções de alertas de telemetria"
        accent="sky"
      />

      {activeSubTab === "triggered" ? (
        <TriggeredTelemetryAlertsPanel
          alerts={filteredAlerts}
          filters={alertFilters}
          loading={recentLoading}
          models={models}
          onCloseFilter={() => setOpenFilter(null)}
          onClearFilters={() => setAlertFilters(emptyAlertFilters)}
          onFilterChange={(patch) => setAlertFilters((current) => ({ ...current, ...patch }))}
          onOpenFilter={(key) => setOpenFilter((current) => current === key ? null : key)}
          onOpenAlert={setSelectedAlert}
          onSetPresetPeriod={setPresetPeriod}
          openFilter={openFilter}
          options={alertOptions}
          profileMap={alertProfiles}
          totalCount={recentAlerts.length}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Configurações</h3>
              <p className="text-xs text-slate-500">Regras por modelo aplicadas automaticamente ao anexar ou editar um CSV/INVA.</p>
            </div>
            {selectedModelId ? (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
              >
                Novo alerta
              </button>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Modelo</p>
            {loadingModels ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-28 rounded-lg" />)}
              </div>
            ) : models.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum modelo cadastrado. Crie modelos na aba Modelos.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModelId(model.id);
                      setShowForm(false);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      selectedModelId === model.id
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showForm ? (
            <div className="rounded-xl border border-sky-700/30 bg-slate-900/70 p-5 shadow-xl">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{editingId ? "Editar alerta" : "Novo alerta"}</h3>
                  <p className="text-xs text-slate-500">
                    Modelo: <span className="text-sky-300">{selectedModel?.name}</span>
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                  />
                  Ativo
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome do aviso *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="ex: Pressão do óleo alta na decolagem"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-400">Tipo</p>
                    <div className="flex flex-wrap gap-2">
                      {TELEMETRY_ALERT_SEVERITIES.map((severity) => (
                        <button
                          key={severity.key}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, severity: severity.key }))}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            form.severity === severity.key
                              ? SEVERITY_CLASS[severity.key]
                              : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                          }`}
                        >
                          {severity.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-400">Fases do voo</p>
                    <div className="flex flex-wrap gap-2">
                      {TELEMETRY_ALERT_PHASES.map((phase) => (
                        <button
                          key={phase.key}
                          type="button"
                          onClick={() => togglePhase(phase.key)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            form.phases.includes(phase.key)
                              ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                              : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                          }`}
                        >
                          {phase.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Resumo</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {form.name.trim() || "Alerta sem nome"} quando{" "}
                    {form.conditions.map((condition) => {
                      const value = parseNumber(condition.value);
                      return `${propertyLabel(condition.property)} ${condition.operator === "gt" ? ">" : "<"} ${
                        value ?? "..."
                      } ${propertyUnit(condition.property)}`;
                    }).join(" E ")}
                    {!hasTouchdownCondition && form.durationSec ? ` por ${form.durationSec}s` : ""}.
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Valor base:{" "}
                    {form.conditions.map((condition) => {
                      const value = parseNumber(condition.value);
                      return `${propertyLabel(condition.property)} ${condition.operator === "gt" ? ">" : "<"} ${
                        value ?? "..."
                      } ${propertyUnit(condition.property)}`.trim();
                    }).join(" E ")}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Condicoes</p>
                    <p className="text-xs text-slate-500">Todas as condicoes precisam ser verdadeiras ao mesmo tempo.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addCondition}
                    disabled={form.conditions.length >= 3}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    + Condicao
                  </button>
                </div>

                {form.conditions.map((condition, index) => (
                  <div key={index} className="grid gap-2 rounded-lg bg-slate-900/80 p-3 md:grid-cols-[1.3fr_0.7fr_0.8fr_auto]">
                    <select
                      value={condition.property}
                      onChange={(event) => updateCondition(index, { property: event.target.value as TelemetryAlertProperty })}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      {TELEMETRY_ALERT_PROPERTIES.map((property) => (
                        <option key={property.key} value={property.key}>
                          {property.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(event) => updateCondition(index, { operator: event.target.value as TelemetryAlertOperator })}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="gt">maior que</option>
                      <option value="lt">menor que</option>
                    </select>
                    <div className="relative">
                      <input
                        type="number"
                        value={condition.value}
                        onChange={(event) => updateCondition(index, { value: event.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-16 text-sm text-slate-100 outline-none focus:border-sky-500"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-500">{propertyUnit(condition.property)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      disabled={form.conditions.length === 1}
                      className="rounded-lg px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10 disabled:text-slate-600 disabled:hover:bg-transparent"
                    >
                      Remover
                    </button>
                  </div>
                ))}

                {!hasTouchdownCondition ? (
                  <div className="max-w-xs">
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Por pelo menos</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={form.durationSec}
                        onChange={(event) => setForm((current) => ({ ...current, durationSec: event.target.value }))}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-14 text-sm text-slate-100 outline-none focus:border-sky-500"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-500">seg</span>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                    IAS de toque e VS de toque são avaliados no evento de touchdown e não usam gatilho por tempo.
                  </p>
                )}
              </div>

              {validationMessage ? <p className="mt-3 text-xs text-amber-300">{validationMessage}</p> : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || Boolean(validationMessage)}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar alerta"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {loadingRules ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-80" />
                </div>
              ))}
            </div>
          ) : rules.length === 0 && selectedModelId ? (
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 py-12 text-center">
              <p className="text-sm text-slate-500">Nenhum alerta configurado para {selectedModel?.name}.</p>
              <button type="button" onClick={openCreate} className="mt-3 text-sm text-sky-400 hover:underline">
                Criar primeiro alerta
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-xl border bg-slate-900/40 p-4 ${rule.active ? "border-slate-700/60" : "border-slate-800 opacity-60"}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[rule.severity]}`}>
                          {severityLabel(rule.severity)}
                        </span>
                        {!rule.active ? <span className="text-xs text-slate-500">Inativo</span> : null}
                        <h3 className="text-sm font-semibold text-slate-100">{rule.name}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{formatRule(rule)}</p>
                      <p className="mt-1 text-xs text-slate-500">Valor base: {baseValueText(rule.conditions)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Fases: {rule.phases.includes("all") ? "Todas" : rule.phases.join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(rule)}
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                      >
                        Editar
                      </button>
                      {deleteConfirm === rule.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDelete(rule.id)}
                            className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-700"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(rule.id)}
                          className="rounded px-2 py-1 text-xs text-red-500/60 hover:bg-red-500/10 hover:text-red-400"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedAlert ? (
        <TelemetryAlertFlightModal
          alert={selectedAlert}
          models={models}
          onClose={() => setSelectedAlert(null)}
          profileMap={alertProfiles}
        />
      ) : null}
    </div>
  );
}

type SortDirection = "asc" | "desc";
type AlertColumnKey = "ruleName" | "student" | "instructor" | "aircraft" | "model" | "flightDate" | "matchedAt" | "severity";

type AlertColumnDef = {
  key: AlertColumnKey;
  label: string;
  sortable: boolean;
  sortValue: (alert: FlightTelemetryAlertDoc, profileMap: AlertProfileMap, modelNameById: Map<string, string>) => string | number | null;
};

const ALERT_COLUMNS: AlertColumnDef[] = [
  { key: "ruleName",   label: "Alerta",     sortable: true,  sortValue: (a) => a.ruleName },
  { key: "student",    label: "Aluno",      sortable: true,  sortValue: (a, pm) => formatPerson(pm, a.studentUserId, "") },
  { key: "instructor", label: "INVA",       sortable: true,  sortValue: (a, pm) => formatPerson(pm, a.instructorUserId, "") },
  { key: "aircraft",   label: "Avião",      sortable: true,  sortValue: (a) => a.aircraftIdent ?? "" },
  { key: "model",      label: "Modelo",     sortable: true,  sortValue: (a, _pm, mnb) => mnb.get(a.modelId) ?? "" },
  { key: "flightDate", label: "Data",       sortable: true,  sortValue: (a) => a.flightDate ?? "" },
  { key: "matchedAt",  label: "Horário",    sortable: true,  sortValue: (a) => a.matchedAt ?? "" },
  { key: "ruleName",   label: "Parâmetros", sortable: false, sortValue: () => null },
  { key: "severity",   label: "Gravidade",  sortable: true,  sortValue: (a) => a.severity },
];

function sortAlertRows(
  rows: FlightTelemetryAlertDoc[],
  column: AlertColumnDef | undefined,
  direction: SortDirection,
  profileMap: AlertProfileMap,
  modelNameById: Map<string, string>,
): FlightTelemetryAlertDoc[] {
  if (!column) return rows;
  const mul = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = column.sortValue(a, profileMap, modelNameById);
    const bv = column.sortValue(b, profileMap, modelNameById);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true }) * mul;
  });
}

function TriggeredTelemetryAlertsPanel({
  alerts,
  filters,
  loading,
  models,
  onCloseFilter,
  onClearFilters,
  onFilterChange,
  onOpenFilter,
  onOpenAlert,
  onSetPresetPeriod,
  openFilter,
  options,
  profileMap,
  totalCount,
}: {
  alerts: FlightTelemetryAlertDoc[];
  filters: AlertFilters;
  loading: boolean;
  models: AircraftModel[];
  onCloseFilter: () => void;
  onClearFilters: () => void;
  onFilterChange: (patch: Partial<AlertFilters>) => void;
  onOpenFilter: (key: MultiFilterKey) => void;
  onOpenAlert: (alert: FlightTelemetryAlertDoc) => void;
  onSetPresetPeriod: (key: PeriodPresetKey) => void;
  openFilter: MultiFilterKey | null;
  options: Record<MultiFilterKey, string[]>;
  profileMap: AlertProfileMap;
  totalCount: number;
}) {
  const modelNameById = useMemo(() => new Map(models.map((model) => [model.id, model.name])), [models]);

  const [sortKey, setSortKey] = useState<AlertColumnKey>("flightDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function handleSort(col: AlertColumnDef) {
    if (!col.sortable) return;
    if (sortKey === col.key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col.key); setSortDirection("asc"); }
  }

  const sortColumn = useMemo(() => ALERT_COLUMNS.find((c) => c.key === sortKey), [sortKey]);
  const sortedAlerts = useMemo(
    () => sortAlertRows(alerts, sortColumn, sortDirection, profileMap, modelNameById),
    [alerts, sortColumn, sortDirection, profileMap, modelNameById],
  );

  const hasActiveFilters =
    Boolean(filters.fromDate) ||
    Boolean(filters.toDate) ||
    filters.models.length > 0 ||
    filters.aircrafts.length > 0 ||
    filters.instructors.length > 0 ||
    filters.students.length > 0 ||
    filters.alertNames.length > 0 ||
    filters.severities.length > 0;

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Alertas disparados</h3>
            <p className="text-xs text-slate-500">Clique em uma ocorrência para abrir a telemetria completa do voo.</p>
          </div>
          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
            {alerts.length} de {totalCount}
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <select
            value={filters.periodPreset}
            onChange={(event) => onSetPresetPeriod(event.target.value as PeriodPresetKey)}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          >
            {PERIOD_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) => onFilterChange({ fromDate: event.target.value, periodPreset: "custom" })}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(event) => onFilterChange({ toDate: event.target.value, periodPreset: "custom" })}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
          <FilterMultiSelect label="Modelos" options={options.models} value={filters.models} open={openFilter === "models"} onOpen={() => onOpenFilter("models")} onChange={(value) => onFilterChange({ models: value })} />
          <FilterMultiSelect label="Aviões" options={options.aircrafts} value={filters.aircrafts} open={openFilter === "aircrafts"} onOpen={() => onOpenFilter("aircrafts")} onChange={(value) => onFilterChange({ aircrafts: value })} />
          <FilterMultiSelect label="Instrutores" options={options.instructors} value={filters.instructors} open={openFilter === "instructors"} onOpen={() => onOpenFilter("instructors")} onChange={(value) => onFilterChange({ instructors: value })} />
          <FilterMultiSelect label="Alunos" options={options.students} value={filters.students} open={openFilter === "students"} onOpen={() => onOpenFilter("students")} onChange={(value) => onFilterChange({ students: value })} />
          <FilterMultiSelect label="Alertas" options={options.alertNames} value={filters.alertNames} open={openFilter === "alertNames"} onOpen={() => onOpenFilter("alertNames")} onChange={(value) => onFilterChange({ alertNames: value })} />
          <FilterMultiSelect label="Gravidades" options={options.severities} value={filters.severities} open={openFilter === "severities"} onOpen={() => onOpenFilter("severities")} onChange={(value) => onFilterChange({ severities: value })} />
        </div>

        <div className="border-t border-slate-800" />

        <div className="flex flex-wrap items-start justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              onCloseFilter();
              onClearFilters();
            }}
            className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 104.545 8.59.75.75 0 111.24.844A7 7 0 117.33 1.79l.22-.22a.75.75 0 011.28.53v3.15a.75.75 0 01-.75.75H4.93a.75.75 0 01-.53-1.28l.83-.83A6.973 6.973 0 018.5 3z" clipRule="evenodd" />
            </svg>
            Limpar filtros
          </button>
        </div>

        {!hasActiveFilters ? null : <div className="sr-only">Filtros ativos</div>}
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded border border-slate-800 bg-slate-950/30 p-4">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
          Nenhum alerta disparado encontrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-800 bg-slate-900/30">
          <div className="min-w-[1320px]">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.75fr_0.95fr_0.75fr_0.75fr_1.1fr_0.75fr_0.85fr] gap-3 border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {ALERT_COLUMNS.map((col) =>
                col.sortable ? (
                  <button
                    key={col.label}
                    type="button"
                    onClick={() => handleSort(col)}
                    className="flex items-center gap-1 text-left hover:text-slate-200"
                  >
                    <span>{col.label}</span>
                    {sortKey === col.key
                      ? <span className="text-emerald-300">{sortDirection === "asc" ? "↑" : "↓"}</span>
                      : <span className="text-slate-700">↕</span>}
                  </button>
                ) : (
                  <span key={col.label}>{col.label}</span>
                )
              )}
              <span>Ação</span>
            </div>
            <div className="divide-y divide-slate-800">
              {sortedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="grid grid-cols-[1.2fr_1fr_1fr_0.75fr_0.95fr_0.75fr_0.75fr_1.1fr_0.75fr_0.85fr] items-center gap-3 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800/40"
                >
                  <span className="min-w-0 truncate font-medium text-slate-100">{alert.ruleName}</span>
                  <span className="min-w-0 truncate">{formatPerson(profileMap, alert.studentUserId, "Aluno")}</span>
                  <span className="min-w-0 truncate">{formatPerson(profileMap, alert.instructorUserId, "Sem INVA")}</span>
                  <span className="min-w-0 truncate">{alert.aircraftIdent ?? "Aeronave"}</span>
                  <span className="min-w-0 truncate">{modelNameById.get(alert.modelId) ?? "Modelo"}</span>
                  <span>{formatFlightDate(alert.flightDate)}</span>
                  <span>{formatAlertTime(alert.matchedAt)}</span>
                  <span className="min-w-0 truncate">{formatTriggeredParameters(alert)}</span>
                  <span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[alert.severity]}`}>
                      {severityLabel(alert.severity)}
                    </span>
                  </span>
                  <span>
                    <button
                      type="button"
                      onClick={() => onOpenAlert(alert)}
                      className="rounded border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
                    >
                      Ver telemetria
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TelemetryAlertFlightModal({
  alert,
  models,
  onClose,
  profileMap,
}: {
  alert: FlightTelemetryAlertDoc;
  models: AircraftModel[];
  onClose: () => void;
  profileMap: AlertProfileMap;
}) {
  const modelName = models.find((model) => model.id === alert.modelId)?.name ?? "Modelo";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[alert.severity]}`}>
                {severityLabel(alert.severity)}
              </span>
              <h3 className="truncate text-sm font-semibold text-slate-100">{alert.ruleName}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatPerson(profileMap, alert.studentUserId, "Aluno")} · {formatPerson(profileMap, alert.instructorUserId, "Sem INVA")} ·{" "}
              {alert.aircraftIdent ?? "Aeronave"} · {modelName} · {formatFlightDate(alert.flightDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TelemetriaTab flightId={alert.flightId} />
        </div>
      </div>
    </div>
  );
}
