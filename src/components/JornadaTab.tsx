import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { getSavedFlight, listStudentTrainingFlights, type SavedFlightFull, type SavedFlightListItem } from "../lib/flightsDb";
import { aggregateJourneyMetrics, type JourneyMetrics } from "../lib/journeyMetrics";
import { listJourneyTelemetrySummaries } from "../lib/flightTelemetryMetricsDb";
import { renderRichContent } from "../lib/maneuverContent";
import { listManeuverCatalog } from "../lib/maneuversDb";
import { completedStagesForTrack, evaluateRewards } from "../lib/rewardEvaluation";
import { listJourneyRewards } from "../lib/rewardsDb";
import { listStudentTrainingTracks } from "../lib/trainingTracksDb";
import type { EvaluatedJourneyReward, JourneyReward } from "../types/rewards";
import type { ManeuverArticle, ManeuverCatalog } from "../types/maneuver";
import type { StudentTrainingTrack, TrainingMission, TrainingStage, TrainingTrack } from "../types/trainingTrack";
import { RewardIcon } from "./rewards/RewardIcon";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";
import { DEFAULT_SCHOOL_RULES } from "../types/schoolRules";

const JornadaEvolutionPanel = lazy(() =>
  import("./JornadaEvolutionPanel").then((module) => ({ default: module.JornadaEvolutionPanel })),
);

type FormationState = {
  tracks: StudentTrainingTrack[];
  flights: Array<SavedFlightListItem & { trainingMissionIds: string[] }>;
  fullFlights: SavedFlightFull[];
  loading: boolean;
  error: string | null;
};

type MissionTimelineItem = {
  stage: TrainingStage;
  mission: TrainingMission;
  index: number;
  status: "done" | "next" | "locked";
};

type JourneySection = "formacao" | "evolucao";

const EMPTY_METRICS = aggregateJourneyMetrics({ summaries: [], landings: [], takeoffs: [] });
const SCHOOL_REWARD_COLOR = DEFAULT_SCHOOL_RULES.theme.primaryColor;

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const JOURNEY_SECTIONS: Array<{ id: JourneySection; label: string; icon: ReactNode }> = [
  {
    id: "formacao",
    label: "Formação",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2.25a.9.9 0 01.36.075l7 3.05a.9.9 0 010 1.65l-7 3.05a.9.9 0 01-.72 0l-7-3.05a.9.9 0 010-1.65l7-3.05A.9.9 0 0110 2.25z" />
        <path d="M4.25 8.75v3.4c0 .8.54 1.5 1.31 1.72l3.95 1.13c.32.09.66.09.98 0l3.95-1.13a1.8 1.8 0 001.31-1.72v-3.4l-4.79 2.09a2.4 2.4 0 01-1.92 0L4.25 8.75z" />
      </svg>
    ),
  },
  {
    id: "evolucao",
    label: "Evolução",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.5 3.75A.75.75 0 014.25 3h11.5a.75.75 0 010 1.5H5v10.75a.75.75 0 01-1.5 0V3.75z" />
        <path d="M7 13.5a1 1 0 100 2 1 1 0 000-2zm4-4a1 1 0 100 2 1 1 0 000-2zm4-3.5a1 1 0 100 2 1 1 0 000-2zM7.53 13.03l3-3 1.06 1.06-3 3-1.06-1.06zm4.04-2.6l2.9-3.38 1.14.98-2.9 3.38-1.14-.98z" />
      </svg>
    ),
  },
];

const FLIGHT_DETAIL_BATCH = 4;

function useFormationProgress(): FormationState {
  const { user, configured } = useAuth();
  const [state, setState] = useState<FormationState>({ tracks: [], flights: [], fullFlights: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!configured || !user) {
      setState({ tracks: [], flights: [], fullFlights: [], loading: false, error: configured ? null : "Appwrite não configurado" });
      return () => {
        cancelled = true;
      };
    }
    const currentUser = user;

    async function enrichFlightDetails(
      baseFlights: SavedFlightListItem[],
      tracks: StudentTrainingTrack[],
      errorMessage: string | null,
    ) {
      const flightsNeedingDetails = baseFlights.filter(
        (flight) => flight.training_track_id && flightMissionIds(flight).length === 0,
      );
      if (flightsNeedingDetails.length === 0 || cancelled) return;

      const fullFlights: SavedFlightFull[] = [];
      const fullById = new Map<string, SavedFlightFull>();

      for (let index = 0; index < flightsNeedingDetails.length; index += FLIGHT_DETAIL_BATCH) {
        if (cancelled) return;
        const batch = flightsNeedingDetails.slice(index, index + FLIGHT_DETAIL_BATCH);
        const results = await Promise.all(batch.map((flight) => getSavedFlight(flight.id)));
        results.forEach((full, batchIndex) => {
          if (!full.data) return;
          fullFlights.push(full.data);
          fullById.set(batch[batchIndex]!.id, full.data);
        });
      }

      const trainingFlights = baseFlights.map((flight) => {
        const materializedMissionIds = flightMissionIds(flight);
        const full = fullById.get(flight.id);
        if (!full) return { ...flight, trainingMissionIds: materializedMissionIds };
        const meta = decodeFlightRecord(full.csv_text).meta;
        return {
          ...flight,
          trainingMissionIds: Array.from(
            new Set([
              ...(meta?.training?.missionIds ?? []),
              meta?.training?.missionId ?? "",
              ...materializedMissionIds,
            ].filter(Boolean)),
          ),
        };
      });

      if (cancelled) return;
      setState({
        tracks,
        flights: trainingFlights,
        fullFlights,
        loading: false,
        error: errorMessage,
      });
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const tracksRes = await listStudentTrainingTracks(currentUser.id);
      if (cancelled) return;

      const tracks = tracksRes.data ?? [];
      const trackIds = tracks.map((row) => row.trackId).filter(Boolean);
      const flightsRes = await listStudentTrainingFlights({ userId: currentUser.id, role: currentUser.role }, trackIds);
      if (cancelled) return;

      const error = tracksRes.error ?? flightsRes.error;
      const baseFlights = flightsRes.data ?? [];
      const initialFlights = baseFlights.map((flight) => ({ ...flight, trainingMissionIds: flightMissionIds(flight) }));

      setState({
        tracks,
        flights: initialFlights,
        fullFlights: [],
        loading: false,
        error: error?.message ?? null,
      });

      void enrichFlightDetails(baseFlights, tracks, error?.message ?? null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  return state;
}

function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatHours(value: number): string {
  return `${value >= 10 ? integerFormatter.format(Math.round(value)) : decimalFormatter.format(value)} h`;
}

function formatPercent(value: number): string {
  return `${integerFormatter.format(Math.round(value))}%`;
}

function flightMissionIds(flight: SavedFlightListItem): string[] {
  const fromMaterialized = (() => {
    if (!flight.training_mission_ids_json) return [];
    try {
      const parsed = JSON.parse(flight.training_mission_ids_json);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
    } catch {
      return [];
    }
  })();
  return Array.from(new Set([...fromMaterialized, flight.training_mission_id ?? ""].filter(Boolean)));
}

function flattenTrackMissions(track: TrainingTrack): Array<{ stage: TrainingStage; mission: TrainingMission }> {
  return track.stages.flatMap((stage) => stage.missions.map((mission) => ({ stage, mission })));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function EmptyJourneyCard({ title = "Jornada pronta para decolar" }: { title?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-700/80 bg-slate-900/30 p-5 text-center md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-300/80">Jornada</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
        Assim que os voos com telemetria entrarem nas coleções de métricas, este painel vira um placar com evolução,
        recordes, pousos, decolagens, milhas e conquistas.
      </p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-400">
      Não foi possível carregar a Jornada: {message}
    </div>
  );
}

function SectionCard({ title, subtitle, compact = false, children }: { title: string; subtitle?: string; compact?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-700/60 bg-slate-900/40 ${compact ? "p-3" : "p-3.5 md:p-4"}`}>
      <div className={compact ? "mb-2" : "mb-3"}>
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">{title}</p>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function AchievementCard({ reward }: { reward: EvaluatedJourneyReward }) {
  return (
    <div className={`rounded-2xl border p-3 ${reward.achieved ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-slate-700/70 bg-slate-950/30 text-slate-500"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${reward.achieved ? "border-white/20 bg-white/10" : "border-slate-700 bg-slate-900"}`}>
          <RewardIcon visual={reward.visual} achieved={reward.achieved} schoolColor={SCHOOL_REWARD_COLOR} className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{reward.title}</p>
          <p className="mt-1 text-xs opacity-80">{reward.description}</p>
          {!reward.achieved ? (
            <div className="mt-3">
              <ProgressBar value={reward.progressPct} />
              <p className="mt-1 text-[11px] text-slate-500">
                {formatPercent(reward.progressPct)} · {decimalFormatter.format(reward.currentValue)} de {decimalFormatter.format(reward.targetValue)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-emerald-400/80">
              {decimalFormatter.format(reward.currentValue)} de {decimalFormatter.format(reward.targetValue)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ManeuverArticleModal({ article, onClose }: { article: ManeuverArticle; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Material de estudo</p>
            <h3 className="mt-1 break-words text-xl font-semibold text-slate-100 [overflow-wrap:anywhere]">{article.title}</h3>
            {article.summary ? <p className="mt-1 text-sm text-slate-400">{article.summary}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
        </header>
        <div className="max-h-[calc(88vh-6rem)] overflow-y-auto p-4 text-sm md:p-6 md:text-base">
          <div className="space-y-4">{renderRichContent(article.contentJson)}</div>
        </div>
      </div>
    </div>
  );
}

function FormationJourney({ state }: { state: FormationState }) {
  const { user, configured } = useAuth();
  const [journeyMetrics, setJourneyMetrics] = useState<JourneyMetrics>(EMPTY_METRICS);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [autoSelectedStageKey, setAutoSelectedStageKey] = useState("");
  const [trackRewards, setTrackRewards] = useState<JourneyReward[]>([]);
  const [maneuverCatalog, setManeuverCatalog] = useState<ManeuverCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedManeuverArticle, setSelectedManeuverArticle] = useState<ManeuverArticle | null>(null);
  const activeTracks = useMemo(
    () => state.tracks.filter((row) => row.status === "active" && row.track).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    [state.tracks],
  );
  const selectedAssignment = activeTracks.find((row) => row.trackId === selectedTrackId) ?? activeTracks[0] ?? null;
  const track = selectedAssignment?.track ?? null;
  const trackFlights = useMemo(
    () => (track ? state.flights.filter((flight) => flight.training_track_id === track.id) : []),
    [state.flights, track],
  );
  const completedMissionIds = useMemo(
    () => new Set(trackFlights.flatMap((flight) => flight.trainingMissionIds)),
    [trackFlights],
  );
  const missionRows = useMemo(() => (track ? flattenTrackMissions(track) : []), [track]);
  const firstOpenIndex = missionRows.findIndex((row) => !completedMissionIds.has(row.mission.id));
  const nextIndex = firstOpenIndex >= 0 ? firstOpenIndex : missionRows.length - 1;
  const timeline: MissionTimelineItem[] = missionRows.map((row, index) => ({
    ...row,
    index,
    status: completedMissionIds.has(row.mission.id) ? "done" : index === nextIndex && firstOpenIndex >= 0 ? "next" : "locked",
  }));
  const completedCount = timeline.filter((item) => item.status === "done").length;
  const nextMission = timeline.find((item) => item.status === "next") ?? null;
  const currentStageId = nextMission?.stage.id ?? timeline[timeline.length - 1]?.stage.id ?? track?.stages[0]?.id ?? "";
  const currentStageSelectionKey = `${selectedAssignment?.trackId ?? ""}:${currentStageId}`;
  const visibleStageId = track?.stages.some((stage) => stage.id === selectedStageId) ? selectedStageId : currentStageId;
  const visibleStage = track?.stages.find((stage) => stage.id === visibleStageId) ?? null;
  const visibleTimeline = timeline.filter((item) => item.stage.id === visibleStageId);
  const stageTabs = useMemo(
    () =>
      track?.stages.map((stage) => ({
        id: stage.id,
        label: `${stage.name}${stage.id === currentStageId ? " · Atual" : ""}`,
      })) ?? [],
    [currentStageId, track],
  );
  const visibleStageCompletedCount = visibleTimeline.filter((item) => item.status === "done").length;
  const visibleStageTotalMinutes = visibleTimeline.reduce((acc, item) => acc + item.mission.durationMinutes, 0);
  const maneuverArticlesBySection = useMemo(() => {
    const map = new Map<string, ManeuverArticle[]>();
    maneuverCatalog.articles.forEach((article) => {
      if (!article.sectionId) return;
      const list = map.get(article.sectionId) ?? [];
      list.push(article);
      map.set(article.sectionId, list);
    });
    map.forEach((articles) => articles.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR")));
    return map;
  }, [maneuverCatalog.articles]);
  const completedStageIds = useMemo(() => completedStagesForTrack(track, completedMissionIds), [completedMissionIds, track]);
  const evaluatedAchievements = useMemo(
    () =>
      evaluateRewards(trackRewards, {
        journey: journeyMetrics,
        flights: state.flights,
        fullFlights: state.fullFlights,
        formation: { selectedTrack: track, completedMissionIds, completedStageIds },
      }),
    [completedMissionIds, completedStageIds, journeyMetrics, state.flights, state.fullFlights, track, trackRewards],
  );

  useEffect(() => {
    let cancelled = false;
    if (!configured || !user) return () => {
      cancelled = true;
    };
    void listJourneyTelemetrySummaries({ userId: user.id, role: user.role }).then((res) => {
      if (cancelled || res.error) return;
      setJourneyMetrics(
        aggregateJourneyMetrics({
          summaries: res.data ?? [],
          landings: [],
          takeoffs: [],
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  useEffect(() => {
    if (selectedTrackId && activeTracks.some((row) => row.trackId === selectedTrackId)) return;
    setSelectedTrackId(activeTracks.find((row) => row.isPrimary)?.trackId ?? activeTracks[0]?.trackId ?? "");
  }, [activeTracks, selectedTrackId]);

  useEffect(() => {
    if (!track) {
      if (selectedStageId) setSelectedStageId("");
      if (autoSelectedStageKey) setAutoSelectedStageKey("");
      return;
    }
    if (autoSelectedStageKey !== currentStageSelectionKey) {
      setSelectedStageId(currentStageId);
      setAutoSelectedStageKey(currentStageSelectionKey);
      return;
    }
    if (selectedStageId && track.stages.some((stage) => stage.id === selectedStageId)) return;
    setSelectedStageId(currentStageId);
  }, [autoSelectedStageKey, currentStageId, currentStageSelectionKey, selectedStageId, track]);

  useEffect(() => {
    let cancelled = false;
    async function loadRewards() {
      if (!track) {
        setTrackRewards([]);
        return;
      }
      const result = await listJourneyRewards({ kind: "achievement", trackId: track.id });
      if (!cancelled) setTrackRewards(result.data);
    }
    void loadRewards();
    return () => {
      cancelled = true;
    };
  }, [track]);

  useEffect(() => {
    let cancelled = false;
    async function loadManeuvers() {
      const result = await listManeuverCatalog(false);
      if (!cancelled && !result.error) setManeuverCatalog(result.data);
    }
    void loadManeuvers();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (state.error) return <ErrorCard message={state.error} />;
  if (activeTracks.length === 0) {
    return <EmptyJourneyCard title="Nenhuma trilha ativa vinculada" />;
  }
  if (!track) {
    return <EmptyJourneyCard title="Nenhuma trilha ativa vinculada" />;
  }

  const flownHours = trackFlights.reduce((acc, flight) => acc + ((flight.duration_sec ?? 0) / 3600), 0);
  const trackHours = track.totalMinutes / 60;
  const hoursPct = trackHours > 0 ? clampPercent((flownHours / trackHours) * 100) : 0;
  const missionPct = track.missionCount > 0 ? clampPercent((completedCount / track.missionCount) * 100) : 0;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(6,78,59,0.84),rgba(15,23,42,0.92)_48%,rgba(88,28,135,0.72))] p-4 shadow-2xl shadow-slate-950/40 md:p-5">
        <div className="grid gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400/80">Formação</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">{track.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-emerald-50/80">
              Progresso da trilha, missões conquistadas e próximo objetivo em uma linha do tempo navegável.
            </p>
            {activeTracks.length > 1 ? (
              <select
                value={selectedAssignment?.trackId ?? ""}
                onChange={(event) => {
                  setSelectedTrackId(event.target.value);
                  setSelectedStageId("");
                }}
                className="mt-4 w-full max-w-sm rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300"
              >
                {activeTracks.map((row) => (
                  <option key={row.id} value={row.trackId}>
                    {row.track?.name ?? row.trackId}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-xs uppercase tracking-widest text-emerald-300/90">Próxima missão</p>
            <p className="mt-1 line-clamp-2 text-xl font-black leading-tight text-white">{nextMission?.mission.name ?? "Trilha completa"}</p>
            <p className="mt-1 text-xs text-emerald-50/70">
              {nextMission ? `${nextMission.stage.name} · ${nextMission.mission.durationMinutes} min · ${nextMission.mission.type}` : "Todas as missões foram marcadas."}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Total de horas</p>
                <p className="mt-1 text-2xl font-black text-white">{formatPercent(hoursPct)}</p>
              </div>
              <p className="text-xs text-emerald-50/70">{formatHours(flownHours)} de {formatHours(trackHours)}</p>
            </div>
            <div className="mt-2"><ProgressBar value={hoursPct} /></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90">Missões completadas</p>
                <p className="mt-1 text-2xl font-black text-white">{formatPercent(missionPct)}</p>
              </div>
              <p className="text-xs text-emerald-50/70">{formatInteger(completedCount)} de {formatInteger(track.missionCount)}</p>
            </div>
            <div className="mt-2"><ProgressBar value={missionPct} /></div>
          </div>
        </div>
      </section>

      {evaluatedAchievements.length > 0 ? (
        <SectionCard title="Conquistas" subtitle="Objetivos liberados conforme seu avanço na trilha.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2.5">
            {evaluatedAchievements.map((reward) => (
              <AchievementCard key={reward.id} reward={reward} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Missões da trilha" subtitle="Escolha uma fase para ver as missões. A fase atual abre automaticamente.">
        {stageTabs.length > 0 ? (
          <Tabs
            items={stageTabs}
            value={visibleStageId}
            onChange={setSelectedStageId}
            ariaLabel="Fases da trilha de formação"
            accent="sky"
            className="mb-3"
          />
        ) : null}
        {visibleStage ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{formatInteger(visibleStageCompletedCount)} de {formatInteger(visibleTimeline.length)} missões concluídas</span>
            <span>{formatHours(visibleStageTotalMinutes / 60)} planejadas</span>
          </div>
        ) : null}
        {visibleTimeline.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleTimeline.map((item) => {
            const maneuverSectionIds = item.mission.maneuverSectionIds ?? [];
            const maneuverArticles = Array.from(
              new Map(
                maneuverSectionIds
                  .flatMap((sectionId) => maneuverArticlesBySection.get(sectionId) ?? [])
                  .map((article) => [article.id, article]),
              ).values(),
            );
            return (
            <article
              key={item.mission.id}
              className={`w-64 shrink-0 rounded-2xl border p-3 transition ${
                item.status === "done"
                  ? "border-emerald-400/40 bg-emerald-500/10"
                  : item.status === "next"
                    ? "border-amber-300/60 bg-amber-400/10 shadow-lg shadow-amber-950/20"
                    : "border-slate-700/70 bg-slate-950/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                  item.status === "done" ? "bg-emerald-400 text-emerald-950" : item.status === "next" ? "bg-amber-300 text-amber-950" : "bg-slate-800 text-slate-500"
                }`}>
                  {item.status === "done" ? "OK" : item.index + 1}
                </span>
                <h3 className="min-w-0 flex-1 pt-0.5 text-base font-black leading-tight text-slate-100">{item.mission.name}</h3>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                  {item.status === "done" ? "Concluída" : item.status === "next" ? "Próxima" : "Futura"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{item.mission.durationMinutes} min · {item.mission.type}</p>
              {item.mission.maneuvers.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {item.mission.maneuvers.slice(0, 3).map((maneuver, idx) => (
                    <li key={`${item.mission.id}-${idx}`} className="line-clamp-2">{maneuver}</li>
                  ))}
                </ul>
              ) : null}
              {maneuverArticles.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Detalhes das manobras:</p>
                  {maneuverArticles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setSelectedManeuverArticle(article)}
                      className="block w-full rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-left text-xs font-semibold text-sky-400 hover:bg-sky-500/20"
                    >
                      {article.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
            );
          })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 p-4 text-sm text-slate-400">
            Nenhuma missão cadastrada nesta fase.
          </div>
        )}
      </SectionCard>
      {selectedManeuverArticle ? (
        <ManeuverArticleModal article={selectedManeuverArticle} onClose={() => setSelectedManeuverArticle(null)} />
      ) : null}
    </div>
  );
}

function EvolutionLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-40 rounded-full" />
      <Skeleton className="h-48 rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function JornadaTab() {
  const formationState = useFormationProgress();
  const [section, setSection] = useState<JourneySection>("formacao");

  return (
    <div className="min-w-0 space-y-4">
      <Tabs
        items={JOURNEY_SECTIONS}
        value={section}
        onChange={setSection}
        ariaLabel="Subabas da jornada"
        accent="sky"
      />
      {section === "formacao" ? (
        <FormationJourney state={formationState} />
      ) : (
        <Suspense fallback={<EvolutionLoading />}>
          <JornadaEvolutionPanel
            formation={{
              flights: formationState.flights,
              fullFlights: formationState.fullFlights,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
