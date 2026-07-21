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
import { loadInstructorHoursMap, type InstructorHoursMap } from "../../lib/instructorAdmissionMetrics";
import {
  type InstructorAdmissionCandidate,
  type InstructorAdmissionForm,
  type InstructorAdmissionFormInput,
  type InstructorAdmissionStage,
  type InstructorAdmissionStageInput,
} from "../../types/instructorAdmission";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";
import { CandidateDetailDrawer } from "./instructorAdmission/CandidateDetailDrawer";
import { FormBuilderPanel } from "./instructorAdmission/FormBuilderPanel";
import { KanbanColumn } from "./instructorAdmission/KanbanColumn";
import { RegistrationLinkModal } from "./instructorAdmission/RegistrationLinkModal";
import { StageEditorModal } from "./instructorAdmission/StageEditorModal";

type LoadPhase = "stages" | "candidates" | "metrics" | "ready";

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
  const [dragging, setDragging] = useState<InstructorAdmissionCandidate | null>(null);
  const [selected, setSelected] = useState<InstructorAdmissionCandidate | null>(null);
  const [editingStage, setEditingStage] = useState<InstructorAdmissionStage | "new" | null>(null);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [quickAddStageId, setQuickAddStageId] = useState<string | null>(null);
  const [registrationModal, setRegistrationModal] = useState<InstructorAdmissionCandidate | null>(null);

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

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.nickname || "").toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const candidatesByStage = useMemo(() => {
    const map = new Map<string, InstructorAdmissionCandidate[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const candidate of filteredCandidates) {
      const list = map.get(candidate.stageId);
      if (list) list.push(candidate);
    }
    return map;
  }, [filteredCandidates, stages]);

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
            onClick={() => setEditingStage("new")}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            + Nova etapa
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nickname, nome, e-mail ou telefone..."
          className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          disabled={loadPhase === "stages"}
        />
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{filteredCandidates.length} registro(s)</span>
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
