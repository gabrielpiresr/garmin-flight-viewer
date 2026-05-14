import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHOOL_ID } from "../../lib/appwrite";
import {
  createTrainingTrack,
  listTrainingTracks,
  summarizeStages,
  updateTrainingTrack,
} from "../../lib/trainingTracksDb";
import type { TrainingMission, TrainingMissionType, TrainingStage, TrainingTrack } from "../../types/trainingTrack";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";
const TYPE_LABEL: Record<TrainingMissionType, string> = {
  DC: "Duplo comando",
  SL: "Solo",
  PIC: "Piloto em comando",
};

type MissionDraft = Omit<TrainingMission, "durationMinutes" | "maneuvers"> & {
  duration: string;
  maneuversText: string;
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

export function TrainingTracksTab() {
  const { showToast } = useToast();
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrackDraft>(() => toDraft(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  function selectTrack(track: TrainingTrack) {
    setSelectedId(track.id);
    setDraft(toDraft(track));
  }

  function createDraft() {
    setSelectedId(null);
    setDraft(toDraft(null));
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("Informe o nome da trilha.");
      return;
    }
    if (summary.missionCount === 0) {
      setError("Cadastre ao menos uma missao.");
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
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                  : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <span className="block font-medium">{track.name}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {track.missionCount} missoes · {formatMinutes(track.totalMinutes)}
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
              {summary.missionCount} missoes · {formatMinutes(summary.totalMinutes)} totais
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

        <div className="space-y-4">
          {draft.stages.map((stage, stageIndex) => (
            <div key={stage.id} className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-slate-400">
                  Etapa
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => updateStage(stageIndex, { name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  />
                </label>
                <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stages: moveItem(prev.stages, stageIndex, stageIndex - 1) }))} className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
                  Subir
                </button>
                <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stages: moveItem(prev.stages, stageIndex, stageIndex + 1) }))} className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
                  Descer
                </button>
                <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stages: prev.stages.filter((_, idx) => idx !== stageIndex) }))} className="rounded border border-red-900/60 px-2 py-2 text-xs text-red-300 hover:bg-red-950/40">
                  Remover
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {stage.missions.map((mission, missionIndex) => (
                  <div key={mission.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3 md:grid-cols-[8rem_7rem_10rem_minmax(0,1fr)_auto]">
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
                    <label className="text-xs text-slate-400">
                      Manobras
                      <textarea value={mission.maneuversText} onChange={(e) => updateMission(stageIndex, missionIndex, { maneuversText: e.target.value })} rows={2} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500" />
                    </label>
                    <div className="flex flex-wrap items-end gap-1">
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: moveItem(stage.missions, missionIndex, missionIndex - 1) })} className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">↑</button>
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: moveItem(stage.missions, missionIndex, missionIndex + 1) })} className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">↓</button>
                      <button type="button" onClick={() => updateStage(stageIndex, { missions: stage.missions.filter((_, idx) => idx !== missionIndex) })} className="rounded border border-red-900/60 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/40">X</button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addMission(stageIndex)} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Adicionar missao
              </button>
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
      </section>
    </div>
  );
}
