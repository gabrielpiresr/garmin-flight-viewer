import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deleteAiswebWeatherAlert,
  listAiswebWeatherAlerts,
  runAiswebWeatherAlertScanNow,
  saveAiswebWeatherAlert,
} from "../lib/aiswebDb";
import type {
  AiswebWeatherAlert,
  AiswebWeatherAlertComparator,
  AiswebWeatherAlertCondition,
  AiswebWeatherAlertCriterion,
  AiswebWeatherAlertHistoryItem,
  AiswebWeatherAlertRepeatMode,
  AiswebWeatherAlertSource,
} from "../types/aisweb";
import { AiswebAerodromePicker } from "./AiswebAerodromePicker";
import { useToast } from "./ui/ToastProvider";

type WeatherAlertsTab = "history" | "mine";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const selectClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/60 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
const fieldLabelClass = "space-y-1.5";
const fieldTitleClass = "block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

const CONDITION_LABELS: Record<AiswebWeatherAlertCondition, string> = {
  wind_total: "Vento total",
  crosswind: "Vento de través",
  gust: "Rajada",
  visibility: "Visibilidade",
  ceiling: "Teto",
  phenomenon: "Fenômeno específico",
};

const UNIT_LABELS: Record<AiswebWeatherAlertCondition, string> = {
  wind_total: "kt",
  crosswind: "kt",
  gust: "kt",
  visibility: "km",
  ceiling: "ft",
  phenomenon: "código",
};

const PHENOMENA_OPTIONS = [
  { value: "RA", label: "Chuva (RA)" },
  { value: "DZ", label: "Chuvisco (DZ)" },
  { value: "TS", label: "Trovoada (TS)" },
  { value: "SH", label: "Pancadas (SH)" },
  { value: "FG", label: "Nevoeiro (FG)" },
  { value: "BR", label: "Névoa úmida (BR)" },
  { value: "HZ", label: "Névoa seca (HZ)" },
  { value: "FU", label: "Fumaça (FU)" },
  { value: "GR", label: "Granizo (GR)" },
  { value: "GS", label: "Granizo pequeno (GS)" },
  { value: "SQ", label: "Linha de instabilidade (SQ)" },
  { value: "FC", label: "Tornado ou tromba d'água (FC)" },
  { value: "VA", label: "Cinza vulcânica (VA)" },
  { value: "DU", label: "Poeira (DU)" },
  { value: "SS", label: "Tempestade de areia (SS)" },
  { value: "DS", label: "Tempestade de poeira (DS)" },
];

const emptyCriterion = (): AiswebWeatherAlertCriterion => ({
  id: crypto.randomUUID(),
  source: "metar",
  condition: "wind_total",
  comparator: "gt",
  value: 10,
  valueMax: null,
});

const emptyDraft = (): Partial<AiswebWeatherAlert> => ({
  id: "",
  name: "",
  icaoCodes: [],
  matchMode: "any",
  repeatMode: "once_until_normal",
  criteria: [emptyCriterion()],
  enabled: true,
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function criterionUnit(condition: AiswebWeatherAlertCondition): string {
  return UNIT_LABELS[condition] || "";
}

function criterionLabel(item: AiswebWeatherAlertCriterion): string {
  const source = item.source.toUpperCase();
  const condition = CONDITION_LABELS[item.condition];
  const unit = criterionUnit(item.condition);
  if (item.condition === "phenomenon") return `${source} · ${condition} contém ${String(item.value || "").toUpperCase()}`;
  if (item.comparator === "between") return `${source} · ${condition} entre ${item.value} e ${item.valueMax ?? "—"} ${unit}`;
  const op = item.comparator === "gt" ? "maior que" : "menor que";
  return `${source} · ${condition} ${op} ${item.value} ${unit}`;
}

function channelLabel(status: string | null | undefined): string {
  if (!status) return "—";
  if (status === "sent") return "enviado";
  if (status === "skipped") return "não enviado";
  if (status === "failed") return "falhou";
  return status;
}

function IconPlus() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M14.7 2.9a2.2 2.2 0 013.1 3.1l-9.2 9.2-4.1.8.8-4.1 9.4-9zM4 17a.75.75 0 000 1.5h12a.75.75 0 000-1.5H4z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M8.5 2.5A1.5 1.5 0 017 4H4.75a.75.75 0 000 1.5h.55l.7 10.1A2 2 0 008 17.5h4a2 2 0 002-1.9l.7-10.1h.55a.75.75 0 000-1.5H13a1.5 1.5 0 01-1.5-1.5h-3zM8 7.25A.75.75 0 018.75 8v6a.75.75 0 01-1.5 0V8A.75.75 0 018 7.25zm4 .75a.75.75 0 00-1.5 0v6a.75.75 0 001.5 0V8z" clipRule="evenodd" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 01-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="inline-flex items-center gap-2 text-xs font-medium text-slate-300"
      onClick={() => onChange(!checked)}
    >
      <span
        className={`relative h-5 w-9 rounded-full border transition ${
          checked ? "border-cyan-400/60 bg-cyan-500/40" : "border-slate-600 bg-slate-800"
        }`}
      >
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

function ValueWithUnit({
  children,
  unit,
}: {
  children: ReactNode;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 text-xs font-semibold text-slate-400">{unit}</span>
    </div>
  );
}

function HistoryPanel({ history, loading, onRefresh }: {
  history: AiswebWeatherAlertHistoryItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) return <p className="text-sm text-slate-500">Carregando histórico…</p>;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {history.length} alerta{history.length === 1 ? "" : "s"} disparado{history.length === 1 ? "" : "s"} nos últimos 30 dias.
        </p>
        <button type="button" className={btnSecondary} onClick={onRefresh}>
          Atualizar
        </button>
      </div>
      {history.length === 0 ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum alerta disparado recentemente.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.alertName}</p>
                  <p className="text-[11px] text-slate-500">
                    {item.icao} · {item.source.toUpperCase()} · {formatDateTime(item.triggeredAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                  <span className="rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-slate-300">
                    e-mail: {channelLabel(item.emailStatus)}
                  </span>
                  <span className="rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-slate-300">
                    WhatsApp: {channelLabel(item.wppStatus)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-200">{item.summary}</p>
              {item.details.length ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {item.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function AiswebWeatherAlertsPanel({ tab }: { tab: WeatherAlertsTab }) {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<AiswebWeatherAlert[]>([]);
  const [history, setHistory] = useState<AiswebWeatherAlertHistoryItem[]>([]);
  const [draft, setDraft] = useState<Partial<AiswebWeatherAlert>>(emptyDraft);
  const [draftIcaos, setDraftIcaos] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const criteria = useMemo(() => draft.criteria?.length ? draft.criteria : [emptyCriterion()], [draft.criteria]);

  async function load() {
    setLoading(true);
    try {
      const data = await listAiswebWeatherAlerts();
      setAlerts(data.alerts);
      setHistory(data.history);
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao carregar alertas.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateCriterion(id: string, patch: Partial<AiswebWeatherAlertCriterion>) {
    setDraft((current) => ({
      ...current,
      criteria: criteria.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.condition === "phenomenon") {
          next.comparator = "contains";
          next.value = typeof next.value === "string" && next.value ? next.value : PHENOMENA_OPTIONS[0].value;
          next.valueMax = null;
        } else if (item.condition === "phenomenon" && patch.condition) {
          next.comparator = "gt";
          next.value = 0;
          next.valueMax = null;
        }
        if (patch.comparator === "between" && (next.valueMax == null || !Number.isFinite(Number(next.valueMax)))) {
          next.valueMax = Number(next.value) || 0;
        }
        if (patch.comparator && patch.comparator !== "between") {
          next.valueMax = null;
        }
        return next;
      }),
    }));
  }

  function openNewModal() {
    setDraft(emptyDraft());
    setDraftIcaos([]);
    setModalOpen(true);
  }

  function openEditModal(alert: AiswebWeatherAlert) {
    setDraft(alert);
    setDraftIcaos(alert.icaoCodes);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setDraft(emptyDraft());
    setDraftIcaos([]);
  }

  async function handleSave() {
    const name = String(draft.name || "").trim();
    const icaoCodes = draftIcaos;
    if (!name) {
      showToast({ variant: "warning", message: "Informe o nome do alerta." });
      return;
    }
    if (!icaoCodes.length) {
      showToast({ variant: "warning", message: "Informe ao menos um aeródromo." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAiswebWeatherAlert({
        ...draft,
        name,
        icaoCodes,
        criteria,
      });
      setAlerts((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(emptyDraft());
      setDraftIcaos([]);
      setModalOpen(false);
      showToast({ variant: "success", message: "Alerta salvo." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar alerta.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteAiswebWeatherAlert(id);
      setAlerts((current) => current.filter((item) => item.id !== id));
      if (draft.id === id) {
        setDraft(emptyDraft());
        setDraftIcaos([]);
        setModalOpen(false);
      }
      showToast({ variant: "success", message: "Alerta apagado." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao apagar alerta.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRunNow() {
    setScanning(true);
    try {
      await runAiswebWeatherAlertScanNow();
      await load();
      showToast({ variant: "success", message: "Validação executada." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao validar alertas.",
      });
    } finally {
      setScanning(false);
    }
  }

  if (tab === "history") {
    return <HistoryPanel history={history} loading={loading} onRefresh={() => void load()} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {alerts.length} alerta{alerts.length === 1 ? "" : "s"} configurado{alerts.length === 1 ? "" : "s"}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={() => void handleRunNow()} disabled={scanning}>
            {scanning ? "Validando..." : "Validar agora"}
          </button>
          <button type="button" className={btnPrimary} onClick={openNewModal}>
            <IconPlus />
            Novo alerta
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Carregando alertas...</p> : null}
      {!loading && alerts.length === 0 ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum alerta configurado.
        </div>
      ) : null}

      <div className="grid gap-3 @3xl:grid-cols-2">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{alert.name}</p>
                <p className="text-[11px] text-slate-500">
                  {alert.icaoCodes.join(", ")} · {alert.matchMode === "all" ? "todos os critérios" : "um critério"} · {alert.enabled ? "ativo" : "inativo"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  alert.active
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    : "border-slate-600 bg-slate-950 text-slate-400"
                }`}>
                  {alert.active ? "condição ativa" : "normal"}
                </span>
                <button type="button" className={iconButtonClass} onClick={() => openEditModal(alert)} aria-label={`Editar ${alert.name}`}>
                  <IconPencil />
                </button>
                <button
                  type="button"
                  className={iconButtonClass}
                  onClick={() => void handleDelete(alert.id)}
                  disabled={deletingId === alert.id}
                  aria-label={`Apagar ${alert.name}`}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              {alert.criteria.map((criterion) => (
                <p key={criterion.id}>{criterionLabel(criterion)}</p>
              ))}
            </div>
          </article>
        ))}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl shadow-black/60">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-slate-100">{draft.id ? "Editar alerta" : "Novo alerta"}</h4>
                <p className="text-xs text-slate-500">Configure os aeródromos, critérios e o comportamento de disparo.</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.enabled !== false}
                  label="Alerta ativo"
                  onChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))}
                />
                <button type="button" className={iconButtonClass} onClick={closeModal} aria-label="Fechar">
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 @2xl:grid-cols-2">
                <label className={fieldLabelClass}>
                  <span className={fieldTitleClass}>Nome do alerta</span>
                  <input
                    className={inputClass}
                    value={draft.name || ""}
                    maxLength={120}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex.: Vento acima do limite"
                  />
                </label>
                <AiswebAerodromePicker
                  label="Aeródromos"
                  value={draftIcaos}
                  onChange={setDraftIcaos}
                  helper="Escolha um ou mais aeródromos para monitorar."
                />
              </div>

              <div className="grid gap-3 @2xl:grid-cols-2">
                <label className={fieldLabelClass}>
                  <span className={fieldTitleClass}>Relação entre critérios</span>
                  <select
                    className={selectClass}
                    value={draft.matchMode || "any"}
                    onChange={(event) => setDraft((current) => ({ ...current, matchMode: event.target.value as "any" | "all" }))}
                  >
                    <option value="any">Disparar se um critério for atingido</option>
                    <option value="all">Disparar se todos os critérios forem atingidos</option>
                  </select>
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTitleClass}>Ao disparar</span>
                  <select
                    className={selectClass}
                    value={draft.repeatMode || "once_until_normal"}
                    onChange={(event) => setDraft((current) => ({ ...current, repeatMode: event.target.value as AiswebWeatherAlertRepeatMode }))}
                  >
                    <option value="once_until_normal">Avisar apenas uma vez até a condição voltar ao normal</option>
                    <option value="continuous">Continuar avisando enquanto a condição permanecer ativa</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">Critérios</p>
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => setDraft((current) => ({ ...current, criteria: [...criteria, emptyCriterion()] }))}
                    aria-label="Adicionar critério"
                    title="Adicionar critério"
                  >
                    <IconPlus />
                  </button>
                </div>

                {criteria.map((criterion, index) => {
                  const isPhenomenon = criterion.condition === "phenomenon";
                  const unit = criterionUnit(criterion.condition);
                  return (
                    <div key={criterion.id} className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-300">Critério {index + 1}</p>
                        {criteria.length > 1 ? (
                          <button
                            type="button"
                            className={iconButtonClass}
                            onClick={() => setDraft((current) => ({ ...current, criteria: criteria.filter((item) => item.id !== criterion.id) }))}
                            aria-label={`Remover critério ${index + 1}`}
                          >
                            <IconClose />
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 @2xl:grid-cols-6">
                        <label className={fieldLabelClass}>
                          <span className={fieldTitleClass}>Tipo</span>
                          <select
                            className={selectClass}
                            value={criterion.source}
                            onChange={(event) => updateCriterion(criterion.id, { source: event.target.value as AiswebWeatherAlertSource })}
                          >
                            <option value="metar">METAR</option>
                            <option value="taf">TAF</option>
                          </select>
                        </label>
                        <label className={fieldLabelClass}>
                          <span className={fieldTitleClass}>Condição</span>
                          <select
                            className={selectClass}
                            value={criterion.condition}
                            onChange={(event) => updateCriterion(criterion.id, { condition: event.target.value as AiswebWeatherAlertCondition })}
                          >
                            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className={fieldLabelClass}>
                          <span className={fieldTitleClass}>Comparador</span>
                          <select
                            className={selectClass}
                            value={criterion.comparator}
                            disabled={isPhenomenon}
                            onChange={(event) => updateCriterion(criterion.id, { comparator: event.target.value as AiswebWeatherAlertComparator })}
                          >
                            {isPhenomenon ? <option value="contains">contém</option> : null}
                            {!isPhenomenon ? <option value="gt">maior que</option> : null}
                            {!isPhenomenon ? <option value="lt">menor que</option> : null}
                            {!isPhenomenon ? <option value="between">entre</option> : null}
                          </select>
                        </label>
                        {isPhenomenon ? (
                          <label className="@2xl:col-span-3 space-y-1.5">
                            <span className={fieldTitleClass}>Fenômeno</span>
                            <select
                              className={selectClass}
                              value={String(criterion.value || PHENOMENA_OPTIONS[0].value)}
                              onChange={(event) => updateCriterion(criterion.id, { value: event.target.value })}
                            >
                              {PHENOMENA_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                          </label>
                        ) : criterion.comparator === "between" ? (
                          <>
                            <label className={fieldLabelClass}>
                              <span className={fieldTitleClass}>De</span>
                              <ValueWithUnit unit={unit}>
                                <input
                                  className={inputClass}
                                  value={String(criterion.value ?? "")}
                                  type="number"
                                  step={criterion.condition === "visibility" ? "0.1" : "1"}
                                  onChange={(event) => updateCriterion(criterion.id, { value: Number(event.target.value) })}
                                />
                              </ValueWithUnit>
                            </label>
                            <label className={fieldLabelClass}>
                              <span className={fieldTitleClass}>Até</span>
                              <ValueWithUnit unit={unit}>
                                <input
                                  className={inputClass}
                                  value={String(criterion.valueMax ?? "")}
                                  type="number"
                                  step={criterion.condition === "visibility" ? "0.1" : "1"}
                                  onChange={(event) => updateCriterion(criterion.id, { valueMax: Number(event.target.value) })}
                                />
                              </ValueWithUnit>
                            </label>
                          </>
                        ) : (
                          <label className="@2xl:col-span-3 space-y-1.5">
                            <span className={fieldTitleClass}>Valor</span>
                            <ValueWithUnit unit={unit}>
                              <input
                                className={inputClass}
                                value={String(criterion.value ?? "")}
                                type="number"
                                step={criterion.condition === "visibility" ? "0.1" : "1"}
                                onChange={(event) => updateCriterion(criterion.id, { value: Number(event.target.value) })}
                              />
                            </ValueWithUnit>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={closeModal} disabled={saving}>
                Cancelar
              </button>
              <button type="button" className={btnPrimary} onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Salvando..." : "Salvar alerta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
