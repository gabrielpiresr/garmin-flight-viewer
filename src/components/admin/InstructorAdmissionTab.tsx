import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createInstructorAdmissionCandidate,
  deleteInstructorAdmissionCandidate,
  ensureCanonicalInstructorAdmissionStages,
  getInstructorAdmissionForm,
  listInstructorAdmissionCandidates,
  listInstructorAdmissionStages,
  moveInstructorAdmissionCandidate,
  saveInstructorAdmissionForm,
  saveInstructorAdmissionStage,
  shouldBootstrapInstructorAdmissionStages,
  syncActiveInstructorsToAdmission,
  updateInstructorAdmissionCandidate,
} from "../../lib/instructorAdmissionDb";
import { downloadCsv } from "../../lib/csvExport";
import { loadInstructorHoursMap, type InstructorHoursMap } from "../../lib/instructorAdmissionMetrics";
import { formatAvailabilitySummary, isAvailabilityValue } from "../../lib/availabilityPresets";
import { computeInstructorAdmissionScore } from "../../lib/instructorAdmissionScore";
import {
  INSTRUCTOR_CARD_FIELD_DEFS,
  instructorCardFieldsStorageKey,
  loadInstructorCardFields,
  saveInstructorCardFields,
  type InstructorCardFieldKey,
} from "../../lib/instructorAdmissionCardFields";
import {
  collectInstructorReferralSources,
  EMPTY_INSTRUCTOR_ADMISSION_FILTERS,
  filterInstructorAdmissionCandidates,
  type InstructorAdmissionFilters,
} from "../../lib/instructorAdmissionFilters";
import {
  defaultInstructorSortAscForKey,
  loadInstructorAdmissionSort,
  saveInstructorAdmissionSort,
  sortInstructorAdmissionCandidates,
  type InstructorAdmissionSortKey,
} from "../../lib/instructorAdmissionSort";
import {
  type InstructorAdmissionCandidate,
  type InstructorAdmissionFieldValue,
  type InstructorAdmissionFileValue,
  type InstructorAdmissionForm,
  type InstructorAdmissionFormInput,
  type InstructorAdmissionFormField,
  type InstructorAdmissionStage,
  type InstructorAdmissionStageInput,
} from "../../types/instructorAdmission";
import { candidateDisplayName } from "../../types/instructorAdmission";
import { formatHoursLabel } from "../../lib/instructorAdmissionMetrics";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";
import { CandidateDetailDrawer } from "./instructorAdmission/CandidateDetailDrawer";
import { FormBuilderPanel } from "./instructorAdmission/FormBuilderPanel";
import { InstructorAdmissionFiltersPanel } from "./instructorAdmission/InstructorAdmissionFiltersPanel";
import { InstructorAdmissionSortControl } from "./instructorAdmission/InstructorAdmissionSortControl";
import { KanbanColumn } from "./instructorAdmission/KanbanColumn";
import { RegistrationLinkModal } from "./instructorAdmission/RegistrationLinkModal";
import { StageEditorModal } from "./instructorAdmission/StageEditorModal";

type LoadPhase = "stages" | "candidates" | "metrics" | "ready";

const INSTRUCTOR_SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  form: "Formulário",
  instructor: "Instrutor ativo",
};

function exportDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function exportDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isFileValue(value: InstructorAdmissionFieldValue): value is InstructorAdmissionFileValue {
  return Boolean(value && typeof value === "object" && "fileName" in value);
}

function spreadsheetText(value: string | null | undefined): string {
  return value ? `\t${value}` : "";
}

function formatInstructorResponseValue(
  value: InstructorAdmissionFieldValue | undefined,
  field?: InstructorAdmissionFormField,
): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "";
  if (Array.isArray(value)) return value.join(", ");
  if (isAvailabilityValue(value)) return formatAvailabilitySummary(value);
  if (isFileValue(value)) return value.fileName;
  if (typeof value === "string") {
    if (field?.type === "date") return exportDate(value);
    if (field?.type === "phone" || field?.systemProperty === "phone" || field?.systemProperty === "cpf" || field?.systemProperty === "anacCode") {
      return spreadsheetText(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

function exportInstructorCandidatesCsv(
  rows: InstructorAdmissionCandidate[],
  stages: InstructorAdmissionStage[],
  form: InstructorAdmissionForm | null,
  hoursMap: InstructorHoursMap,
): void {
  const stageById = new Map(stages.map((stage) => [stage.id, stage.name]));
  const stageOrderById = new Map(stages.map((stage, index) => [stage.id, index]));
  const orderedRows = rows.slice().sort((a, b) => {
    const stageOrder = (stageOrderById.get(a.stageId) ?? 9999) - (stageOrderById.get(b.stageId) ?? 9999);
    if (stageOrder !== 0) return stageOrder;
    return candidateDisplayName(a).localeCompare(candidateDisplayName(b), "pt-BR", { numeric: true });
  });
  const formFields = (form?.fields || []).slice().sort((a, b) => a.order - b.order);
  const responseHeaders = formFields.map((field) => `Resposta: ${field.label}${field.type === "hidden" ? " (oculto)" : ""}`);
  const header = [
    "Nome de exibição",
    "Nome completo",
    "Nickname",
    "E-mail",
    "Telefone",
    "Etapa",
    "Origem",
    "Fonte / campanha",
    "Score",
    "Horas totais",
    "Horas no mês",
    "Usuário vinculado",
    "Formulário preenchido em",
    "Entrada na etapa",
    "Criado em",
    "Atualizado em",
    "Observações",
    ...responseHeaders,
  ];

  const body = orderedRows.map((candidate) => {
    const hours = candidate.userId ? hoursMap[candidate.userId] : undefined;
    const score = form?.scoreRules?.length
      ? computeInstructorAdmissionScore(candidate.responses, form.scoreRules, form.fields).total
      : "";
    return [
      candidateDisplayName(candidate),
      candidate.name,
      candidate.nickname ?? "",
      candidate.email,
      spreadsheetText(candidate.phone),
      stageById.get(candidate.stageId) ?? "",
      INSTRUCTOR_SOURCE_LABELS[candidate.source] ?? candidate.source,
      candidate.referralSource ?? "",
      score,
      hours ? formatHoursLabel(hours.totalHours) : "",
      hours ? formatHoursLabel(hours.monthHours) : "",
      candidate.userId ? "Sim" : "Não",
      exportDateTime(candidate.formFilledAt),
      exportDateTime(candidate.statusEnteredAt),
      exportDateTime(candidate.createdAt),
      exportDateTime(candidate.updatedAt),
      candidate.notes ?? "",
      ...formFields.map((field) => formatInstructorResponseValue(candidate.responses[field.id], field)),
    ];
  });

  downloadCsv([header, ...body], `instrutores-${new Date().toISOString().slice(0, 10)}.csv`);
}

function CardSettingsModal({
  visibleFields,
  onToggle,
  onClose,
}: {
  visibleFields: Set<InstructorCardFieldKey>;
  onToggle: (key: InstructorCardFieldKey) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Campos do card</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="space-y-1 p-4">
          {INSTRUCTOR_CARD_FIELD_DEFS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-800/60">
              <input
                type="checkbox"
                checked={visibleFields.has(key)}
                onChange={() => onToggle(key)}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <span className="text-sm text-slate-200">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAddModal({
  stageName,
  onClose,
  onSave,
}: {
  stageName: string;
  onClose: () => void;
  onSave: (data: { name: string; email: string; phone?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Novo candidato</h3>
        <p className="mt-1 text-xs text-slate-500">Etapa: {stageName}</p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate-400">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Telefone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-slate-400">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !name.trim() || !email.trim()}
            className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstructorAdmissionTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("stages");
  const [stages, setStages] = useState<InstructorAdmissionStage[]>([]);
  const [candidates, setCandidates] = useState<InstructorAdmissionCandidate[]>([]);
  const [form, setForm] = useState<InstructorAdmissionForm | null>(null);
  const [hoursMap, setHoursMap] = useState<InstructorHoursMap>({});
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InstructorAdmissionFilters>(EMPTY_INSTRUCTOR_ADMISSION_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortState, setSortState] = useState(() => loadInstructorAdmissionSort());
  const cardFieldsKey = instructorCardFieldsStorageKey(user?.id);
  const [visibleFields, setVisibleFields] = useState<Set<InstructorCardFieldKey>>(() =>
    loadInstructorCardFields(cardFieldsKey),
  );
  const [cardSettingsOpen, setCardSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState<InstructorAdmissionCandidate | null>(null);
  const [selected, setSelected] = useState<InstructorAdmissionCandidate | null>(null);
  const [editingStage, setEditingStage] = useState<InstructorAdmissionStage | "new" | null>(null);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [quickAddStageId, setQuickAddStageId] = useState<string | null>(null);
  const [registrationModal, setRegistrationModal] = useState<InstructorAdmissionCandidate | null>(null);

  useEffect(() => {
    setVisibleFields(loadInstructorCardFields(cardFieldsKey));
  }, [cardFieldsKey]);

  const load = useCallback(async () => {
    setLoadPhase("stages");
    setHoursMap({});
    try {
      let nextStages = await listInstructorAdmissionStages();
      if (await shouldBootstrapInstructorAdmissionStages()) {
        nextStages = await ensureCanonicalInstructorAdmissionStages();
      }
      setStages(nextStages);
      setLoadPhase("candidates");

      const [nextCandidates, nextForm] = await Promise.all([
        listInstructorAdmissionCandidates(),
        getInstructorAdmissionForm(),
      ]);
      setCandidates(nextCandidates);
      setForm(nextForm);
      setLoadPhase("metrics");

      void loadInstructorHoursMap([])
        .then(async (allHours) => {
          setHoursMap(allHours);
          setLoadPhase("ready");
          setBackgroundSyncing(true);
          try {
            const result = await syncActiveInstructorsToAdmission(nextStages, allHours);
            if (result.created > 0 || result.linked > 0) {
              const refreshed = await listInstructorAdmissionCandidates();
              setCandidates(refreshed);
              if (result.created > 0) {
                showToast({
                  variant: "success",
                  message: `${result.created} instrutor(es) sincronizado(s).`,
                });
              }
            }
          } finally {
            setBackgroundSyncing(false);
          }
        })
        .catch(() => setLoadPhase("ready"));
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao carregar instrutores.",
      });
      setLoadPhase("ready");
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCandidates = useMemo(
    () => filterInstructorAdmissionCandidates(candidates, filters, search, form, hoursMap),
    [candidates, filters, search, form, hoursMap],
  );

  const sortedFilteredCandidates = useMemo(
    () =>
      sortInstructorAdmissionCandidates(
        filteredCandidates,
        sortState.key,
        sortState.asc,
        form,
        hoursMap,
      ),
    [filteredCandidates, sortState.key, sortState.asc, form, hoursMap],
  );

  const candidatesByStage = useMemo(() => {
    const map = new Map<string, InstructorAdmissionCandidate[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const candidate of sortedFilteredCandidates) {
      const list = map.get(candidate.stageId);
      if (list) list.push(candidate);
    }
    return map;
  }, [sortedFilteredCandidates, stages]);

  const referralOptions = useMemo(() => collectInstructorReferralSources(candidates), [candidates]);

  const scoreUpper = useMemo(() => {
    if (!form?.scoreRules?.length) return 100;
    return Math.max(
      100,
      ...candidates.map((c) =>
        computeInstructorAdmissionScore(c.responses, form.scoreRules, form.fields).total,
      ),
      ...form.scoreRules.map((rule) => Math.max(0, rule.points)),
    );
  }, [candidates, form]);

  const hoursUpper = useMemo(() => {
    let max = 0;
    for (const hours of Object.values(hoursMap)) {
      if (hours.totalHours > max) max = hours.totalHours;
    }
    return max || 100;
  }, [hoursMap]);

  function toggleCardField(key: InstructorCardFieldKey) {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveInstructorCardFields(cardFieldsKey, next);
      return next;
    });
  }

  function handleSortChange(key: InstructorAdmissionSortKey, asc?: boolean) {
    const nextAsc = asc ?? defaultInstructorSortAscForKey(key);
    setSortState({ key, asc: nextAsc });
    saveInstructorAdmissionSort(key, nextAsc);
  }

  const publicFormUrl = `${window.location.origin}/admissao-instrutor`;

  async function handleDrop(stageId: string) {
    if (!dragging || dragging.stageId === stageId) return;
    try {
      const updated = await moveInstructorAdmissionCandidate(dragging.id, stageId);
      setCandidates((current) => current.map((c) => (c.id === updated.id ? updated : c)));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao mover candidato.",
      });
    } finally {
      setDragging(null);
    }
  }

  async function handleSaveStage(input: InstructorAdmissionStageInput, id?: string) {
    const saved = await saveInstructorAdmissionStage(input, id);
    const nextStages = await listInstructorAdmissionStages();
    setStages(nextStages);
    showToast({ variant: "success", message: `Etapa "${saved.name}" salva.` });
  }

  async function handleDeleteCandidate(candidate: InstructorAdmissionCandidate) {
    if (!window.confirm(`Excluir "${candidate.nickname || candidate.name}"?`)) return;
    try {
      await deleteInstructorAdmissionCandidate(candidate.id);
      setCandidates((current) => current.filter((c) => c.id !== candidate.id));
      if (selected?.id === candidate.id) setSelected(null);
      showToast({ variant: "success", message: "Registro excluído." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao excluir.",
      });
    }
  }

  async function handleQuickAdd(data: { name: string; email: string; phone?: string }, stageId: string) {
    const created = await createInstructorAdmissionCandidate({
      stageId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      source: "manual",
    });
    setCandidates((current) => [created, ...current]);
    showToast({ variant: "success", message: "Candidato adicionado." });
  }

  async function handleSaveForm(input: InstructorAdmissionFormInput) {
    const saved = await saveInstructorAdmissionForm(input);
    setForm(saved);
    showToast({ variant: "success", message: "Formulário salvo." });
  }

  function copyFormLink() {
    void navigator.clipboard.writeText(publicFormUrl);
    showToast({ variant: "success", message: "Link do formulário copiado." });
  }

  function handleExportCandidates() {
    if (filteredCandidates.length === 0) {
      showToast({ variant: "warning", message: "Nenhum instrutor para exportar com os filtros atuais." });
      return;
    }
    exportInstructorCandidatesCsv(filteredCandidates, stages, form, hoursMap);
    showToast({ variant: "success", message: `${filteredCandidates.length} instrutor(es) exportado(s).` });
  }

  const nextStageOrder = stages.length ? Math.max(...stages.map((s) => s.order)) + 10 : 10;
  const quickAddStage = stages.find((s) => s.id === quickAddStageId);
  const showStageSkeleton = loadPhase === "stages";
  const candidatesLoading = loadPhase === "stages" || loadPhase === "candidates";
  const hoursLoading = loadPhase === "metrics";

  return (
    <div className="space-y-4" data-search-anchor="Instrutores">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Instrutores</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Admissão, formação e gestão dos instrutores ativos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backgroundSyncing && (
            <span className="text-xs text-slate-500 animate-pulse">Sincronizando...</span>
          )}
          <button
            type="button"
            onClick={copyFormLink}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Copiar link do formulário
          </button>
          <button
            type="button"
            onClick={() => setShowFormBuilder(true)}
            className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-950/50"
          >
            Editar formulário
          </button>
          <button
            type="button"
            onClick={() => setCardSettingsOpen(true)}
            title="Campos do card"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleExportCandidates}
            disabled={filteredCandidates.length === 0 || candidatesLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.5 3A1.5 1.5 0 003 4.5v11A1.5 1.5 0 004.5 17h11a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0015.5 3h-11zM5 5h3v3H5V5zm5 0h5v3h-5V5zM5 10h3v5H5v-5zm5 0h5v5h-5v-5z" clipRule="evenodd" />
            </svg>
            Exportar
          </button>
          <button
            type="button"
            onClick={() => setEditingStage("new")}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            + Nova etapa
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nickname, nome, e-mail ou telefone..."
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600"
            disabled={loadPhase === "stages"}
          />
          <InstructorAdmissionFiltersPanel
            filters={filters}
            onChange={setFilters}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            referralOptions={referralOptions}
            scoreUpper={scoreUpper}
            hoursUpper={hoursUpper}
          />
          <InstructorAdmissionSortControl
            sortKey={sortState.key}
            sortAsc={sortState.asc}
            onSortChange={handleSortChange}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>
            {filteredCandidates.length}
            <span className="text-slate-600">/{candidates.length}</span> registro(s)
          </span>
          <span>{stages.length} etapa(s)</span>
          {form?.published ? (
            <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-400">Formulário publicado</span>
          ) : (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-400">Formulário não publicado</span>
          )}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {showStageSkeleton
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[420px] w-[280px] shrink-0" />
            ))
          : stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                candidates={candidatesByStage.get(stage.id) || []}
                form={form}
                hoursMap={hoursMap}
                hoursLoading={hoursLoading}
                candidatesLoading={candidatesLoading}
                visibleFields={visibleFields}
                onDrop={handleDrop}
                onDragStart={setDragging}
                onClick={setSelected}
                onEdit={setSelected}
                onDelete={handleDeleteCandidate}
                onQuickAdd={setQuickAddStageId}
                onConfigureStage={(s) => setEditingStage(s)}
                onSendRegistrationLink={setRegistrationModal}
              />
            ))}
      </div>

      {cardSettingsOpen && (
        <CardSettingsModal
          visibleFields={visibleFields}
          onToggle={toggleCardField}
          onClose={() => setCardSettingsOpen(false)}
        />
      )}

      {editingStage && (
        <StageEditorModal
          value={editingStage === "new" ? null : editingStage}
          nextOrder={nextStageOrder}
          onClose={() => setEditingStage(null)}
          onSave={handleSaveStage}
        />
      )}

      {showFormBuilder && (
        <FormBuilderPanel form={form} onSave={handleSaveForm} onClose={() => setShowFormBuilder(false)} />
      )}

      {quickAddStageId && quickAddStage && (
        <QuickAddModal
          stageName={quickAddStage.name}
          onClose={() => setQuickAddStageId(null)}
          onSave={(data) => handleQuickAdd(data, quickAddStageId)}
        />
      )}

      {selected && (
        <CandidateDetailDrawer
          candidate={selected}
          stages={stages}
          form={form}
          hoursMap={hoursMap}
          authorName={user?.name ?? user?.email ?? "Admin"}
          onClose={() => setSelected(null)}
          onLinked={(updated) => {
            setCandidates((current) => current.map((c) => (c.id === updated.id ? updated : c)));
            setSelected(updated);
          }}
          onChanged={(updated) => {
            setCandidates((current) => current.map((c) => (c.id === updated.id ? updated : c)));
            setSelected(updated);
          }}
          onSendRegistrationLink={setRegistrationModal}
          onSave={async (patch) => {
            const updated = await updateInstructorAdmissionCandidate(selected.id, patch);
            setCandidates((current) => current.map((c) => (c.id === updated.id ? updated : c)));
            setSelected(updated);
          }}
          onMoveStage={async (stageId) => {
            const updated = await moveInstructorAdmissionCandidate(selected.id, stageId);
            setCandidates((current) => current.map((c) => (c.id === updated.id ? updated : c)));
            setSelected(updated);
          }}
        />
      )}

      {registrationModal && (
        <RegistrationLinkModal
          candidate={registrationModal}
          onClose={() => setRegistrationModal(null)}
          onGenerated={(token) => {
            setCandidates((current) =>
              current.map((candidate) =>
                candidate.id === registrationModal.id ? { ...candidate, registrationToken: token } : candidate,
              ),
            );
            if (selected?.id === registrationModal.id) {
              setSelected((current) => (current ? { ...current, registrationToken: token } : current));
            }
            setRegistrationModal((current) =>
              current ? { ...current, registrationToken: token } : current,
            );
          }}
        />
      )}
    </div>
  );
}
