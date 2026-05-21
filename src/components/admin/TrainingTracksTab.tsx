import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHOOL_ID } from "../../lib/appwrite";
import { listManeuverCatalog } from "../../lib/maneuversDb";
import {
  createTrainingTrack,
  listTrainingTracks,
  summarizeStages,
  updateTrainingTrack,
} from "../../lib/trainingTracksDb";
import type { TrainingMission, TrainingMissionType, TrainingStage, TrainingTrack } from "../../types/trainingTrack";
import type { ManeuverSection } from "../../types/maneuver";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { RewardsEditor } from "./RewardsEditor";

const schoolId = SCHOOL_ID ?? "escola_principal";
const TYPE_LABEL: Record<TrainingMissionType, string> = {
  DC: "Duplo comando",
  SL: "Solo",
  PIC: "Piloto em comando",
};

type MissionDraft = Omit<TrainingMission, "durationMinutes" | "maneuvers"> & {
  duration: string;
  maneuversText: string;
  maneuverSectionIds: string[];
};

type StageDraft = Omit<TrainingStage, "missions"> & {
  missions: MissionDraft[];
};

type TrackDraft = {
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: StageDraft[];
};

type TrackEditorTab = "missions" | "achievements";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function parseDuration(value: string): number {
  const raw = value.trim();
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  const number = Number(raw.replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 60) : 0;
}

function durationToInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function emptyMission(order: number): MissionDraft {
  return {
    id: uid("mission"),
    name: "",
    duration: "01:00",
    type: "DC",
    maneuversText: "",
    maneuverSectionIds: [],
    order,
  };
}

function emptyStage(order: number): StageDraft {
  return {
    id: uid("stage"),
    name: `Etapa ${order}`,
    order,
    missions: [emptyMission(1)],
  };
}

function toDraft(track?: TrainingTrack | null): TrackDraft {
  if (!track) {
    return {
      name: "",
      isDefault: false,
      isActive: true,
      stages: [emptyStage(1)],
    };
  }
  return {
    name: track.name,
    isDefault: track.isDefault,
    isActive: track.isActive,
    stages: track.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      order: stage.order,
      missions: stage.missions.map((mission) => ({
        id: mission.id,
        name: mission.name,
        duration: durationToInput(mission.durationMinutes),
        type: mission.type,
        maneuversText: mission.maneuvers.join("\n"),
        maneuverSectionIds: mission.maneuverSectionIds ?? [],
        order: mission.order,
      })),
    })),
  };
}

function normalizeDraftStages(stages: StageDraft[]): TrainingStage[] {
  return stages
    .map((stage, stageIndex) => ({
      id: stage.id || uid("stage"),
      name: stage.name.trim() || `Etapa ${stageIndex + 1}`,
      order: stageIndex + 1,
      missions: stage.missions
        .map((mission, missionIndex) => ({
          id: mission.id || uid("mission"),
          name: mission.name.trim() || `Missão ${missionIndex + 1}`,
          durationMinutes: Math.max(0, parseDuration(mission.duration)),
          type: mission.type,
          maneuvers: mission.maneuversText
            .split(/\r?\n/)
            .map((item) => item.trim().replace(/^[-*]\s+/, ""))
            .filter(Boolean),
          maneuverSectionId: mission.maneuverSectionIds[0] ?? null,
          maneuverSectionIds: mission.maneuverSectionIds,
          order: missionIndex + 1,
        }))
        .filter((mission) => mission.name.trim()),
    }))
    .filter((stage) => stage.name.trim());
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM7 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM7 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM16 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM16 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM16 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 4.5c-4.2 0-7 3.6-8 5.5 1 1.9 3.8 5.5 8 5.5s7-3.6 8-5.5c-1-1.9-3.8-5.5-8-5.5zm0 8.5a3 3 0 110-6 3 3 0 010 6z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 3.5a.75.75 0 01.75.75v5h5a.75.75 0 010 1.5h-5v5a.75.75 0 01-1.5 0v-5h-5a.75.75 0 010-1.5h5v-5A.75.75 0 0110 3.5z" />
    </svg>
  );
}

export function TrainingTracksTab() {
  const { showToast } = useToast();
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrackDraft>(() => toDraft(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openStageIds, setOpenStageIds] = useState<Set<string>>(() => new Set());
  const [editorTab, setEditorTab] = useState<TrackEditorTab>("missions");
  const [draggedStageIndex, setDraggedStageIndex] = useState<number | null>(null);
  const [maneuverSections, setManeuverSections] = useState<ManeuverSection[]>([]);

  const selected = useMemo(() => tracks.find((track) => track.id === selectedId) ?? null, [selectedId, tracks]);
  const normalizedStages = useMemo(() => normalizeDraftStages(draft.stages), [draft.stages]);
  const summary = useMemo(() => summarizeStages(normalizedStages), [normalizedStages]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listTrainingTracks({ includeInactive: true, schoolId });
    if (result.error) {
      setError(result.error.message);
      setTracks([]);
    } else {
      setTracks(result.data);
      const nextSelected = selectedId && result.data.some((track) => track.id === selectedId) ? selectedId : result.data[0]?.id ?? null;
      setSelectedId(nextSelected);
      setDraft(toDraft(result.data.find((track) => track.id === nextSelected) ?? null));
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadManeuverSections() {
      const result = await listManeuverCatalog(true);
      if (!cancelled && !result.error) setManeuverSections(result.data.sections);
    }
    void loadManeuverSections();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  function selectTrack(track: TrainingTrack) {
    setSelectedId(track.id);
    setDraft(toDraft(track));
    setOpenStageIds(new Set());
  }

  function createDraft() {
    setSelectedId(null);
    setDraft(toDraft(null));
    setOpenStageIds(new Set());
    setEditorTab("missions");
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("Informe o nome da trilha.");
      return;
    }
    if (summary.missionCount === 0) {
      setError("Cadastre ao menos uma missão.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      schoolId,
      name: draft.name.trim(),
      isDefault: draft.isDefault,
      isActive: draft.isActive,
      stages: normalizedStages,
    };
    const result = selected ? await updateTrainingTrack(selected.id, payload) : await createTrainingTrack(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: selected ? "Trilha atualizada." : "Trilha criada." });
    await load();
  }

  function updateStage(index: number, patch: Partial<StageDraft>) {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.map((stage, idx) => (idx === index ? { ...stage, ...patch } : stage)),
    }));
  }

  function updateMission(stageIndex: number, missionIndex: number, patch: Partial<MissionDraft>) {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.map((stage, idx) =>
        idx === stageIndex
          ? {
              ...stage,
              missions: stage.missions.map((mission, mIdx) => (mIdx === missionIndex ? { ...mission, ...patch } : mission)),
            }
          : stage,
      ),
    }));
  }

  function toggleMissionManeuverSection(stageIndex: number, missionIndex: number, sectionId: string) {
    const mission = draft.stages[stageIndex]?.missions[missionIndex];
    if (!mission) return;
    const current = new Set(mission.maneuverSectionIds);
    if (current.has(sectionId)) current.delete(sectionId);
    else current.add(sectionId);
    updateMission(stageIndex, missionIndex, { maneuverSectionIds: Array.from(current) });
  }

  function addMission(stageIndex: number) {
    setDraft((prev) => ({
      ...prev,
      stages: prev.stages.map((stage, idx) =>
        idx === stageIndex
          ? { ...stage, missions: [...stage.missions, emptyMission(stage.missions.length + 1)] }
          : stage,
      ),
    }));
  }

  function toggleStage(stageId: string) {
    setOpenStageIds((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  function dropStage(targetIndex: number) {
    if (draggedStageIndex === null || draggedStageIndex === targetIndex) return;
    setDraft((prev) => ({ ...prev, stages: moveItem(prev.stages, draggedStageIndex, targetIndex) }));
    setDraggedStageIndex(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <button
          type="button"
          onClick={createDraft}
          className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          Nova trilha
        </button>
        <div className="space-y-2">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => selectTrack(track)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                selectedId === track.id
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                  : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <span className="block font-medium">{track.name}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {track.missionCount} missões · {formatMinutes(track.totalMinutes)}
                {track.isDefault ? " · default" : ""}
              </span>
            </button>
          ))}
          {tracks.length === 0 ? <p className="rounded-lg border border-slate-800 p-3 text-sm text-slate-500">Nenhuma trilha cadastrada.</p> : null}
        </div>
      </aside>

      <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              {selected ? "Editar trilha" : "Nova trilha"}
            </h3>
            <p className="text-xs text-slate-500">
              {summary.missionCount} missões · {formatMinutes(summary.totalMinutes)} totais
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar trilha"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="text-xs text-slate-400">
            Nome
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Ativa
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
            <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft((prev) => ({ ...prev, isDefault: e.target.checked }))} />
            Default
          </label>
        </div>

        <div className="flex gap-1 border-b border-slate-700/70">
          {([
            ["missions", "Missões"],
            ["achievements", "Conquistas"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEditorTab(id)}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${
                editorTab === id
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {editorTab === "missions" ? (
        <>
        <div className="space-y-4">
          {draft.stages.map((stage, stageIndex) => (
            <div
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropStage(stageIndex)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDraggedStageIndex(stageIndex)}
                  onDragEnd={() => setDraggedStageIndex(null)}
                  className="inline-flex cursor-grab items-center rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 active:cursor-grabbing"
                  title="Arrastar etapa"
                  aria-label="Arrastar etapa"
                >
                  <GripIcon />
                </button>
                <label className="min-w-0 flex-1 text-xs text-slate-400">
                  Etapa
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => updateStage(stageIndex, { name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  />
                </label>
                <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stages: prev.stages.filter((_, idx) => idx !== stageIndex) }))} className="rounded border border-red-900/60 px-2 py-2 text-xs text-red-300 hover:bg-red-950/40">
                  Remover
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{stage.missions.length} missões</span>
                <span>{formatMinutes(stage.missions.reduce((acc, mission) => acc + parseDuration(mission.duration), 0))}</span>
              </div>

              {openStageIds.has(stage.id) ? (
              <div className="mt-3 space-y-3">
                {stage.missions.map((mission, missionIndex) => (
                  <div key={mission.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3 md:grid-cols-[minmax(0,1fr)_7rem_10rem_auto]">
                    <label className="text-xs text-slate-400">
                      Missão
                      <input value={mission.name} onChange={(e) => updateMission(stageIndex, missionIndex, { name: e.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                    </label>
                    <label className="text-xs text-slate-400">
                      Duração
                      <input value={mission.duration} onChange={(e) => updateMission(stageIndex, missionIndex, { duration: e.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                    </label>
                    <label className="text-xs text-slate-400">
                      Tipo
                      <select value={mission.type} onChange={(e) => updateMission(stageIndex, missionIndex, { type: e.target.value as TrainingMissionType })} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500">
                        {Object.entries(TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap items-end gap-1">
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: moveItem(stage.missions, missionIndex, missionIndex - 1) })} className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Up</button>
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: moveItem(stage.missions, missionIndex, missionIndex + 1) })} className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Down</button>
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: stage.missions.filter((_, idx) => idx !== missionIndex) })} className="rounded border border-red-900/60 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/40">X</button>
                    </div>
                    <label className="text-xs text-slate-400 md:col-span-4">
                      Manobras
                      <textarea value={mission.maneuversText} onChange={(e) => updateMission(stageIndex, missionIndex, { maneuversText: e.target.value })} rows={2} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                    </label>
                    <div className="text-xs text-slate-400 md:col-span-4">
                      <p>Seções de manobras vinculadas</p>
                      <div className="mt-1 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {maneuverSections.map((section) => (
                          <label key={section.id} className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/70 px-2 py-1.5 text-slate-200">
                            <input
                              type="checkbox"
                              checked={mission.maneuverSectionIds.includes(section.id)}
                              onChange={() => toggleMissionManeuverSection(stageIndex, missionIndex, section.id)}
                            />
                            <span className="min-w-0 truncate">{section.title}</span>
                          </label>
                        ))}
                        {maneuverSections.length === 0 ? <p className="text-slate-500">Nenhuma seção cadastrada.</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleStage(stage.id)}
                  aria-expanded={openStageIds.has(stage.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <EyeIcon />
                  {openStageIds.has(stage.id) ? "Ocultar missões" : "Mostrar missões"}
                </button>
                <button type="button" onClick={() => addMission(stageIndex)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  <PlusIcon />
                  Adicionar missão
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDraft((prev) => ({ ...prev, stages: [...prev.stages, emptyStage(prev.stages.length + 1)] }))}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Adicionar etapa
        </button>
        </>
        ) : selected ? (
          <RewardsEditor
            kind="achievement"
            trackId={selected.id}
            title="Conquistas da trilha"
            subtitle="Configure conquistas exibidas na Formação para alunos vinculados a esta trilha."
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/30 p-4 text-sm text-slate-400">
            Salve a trilha antes de cadastrar conquistas.
          </div>
        )}
      </section>
    </div>
  );
}
