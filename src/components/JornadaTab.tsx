import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";
import { decodeFlightRecord, type FlightRecordMeta } from "../lib/flightRecordCodec";
import { getFlightRecordMetaBatch, getSavedFlight, listStudentTrainingFlights, type SavedFlightFull, type SavedFlightListItem } from "../lib/flightsDb";
import { aggregateJourneyMetrics, type JourneyMetrics } from "../lib/journeyMetrics";
import { listJourneyTelemetrySummaries } from "../lib/flightTelemetryMetricsDb";
import { listManeuverCatalog } from "../lib/maneuversDb";
import { completedStagesForTrack, evaluateRewards } from "../lib/rewardEvaluation";
import { listJourneyRewards } from "../lib/rewardsDb";
import { listStudentTrainingTracks } from "../lib/trainingTracksDb";
import type { EvaluatedJourneyReward, JourneyReward } from "../types/rewards";
import type { ManeuverArticle, ManeuverCatalog } from "../types/maneuver";
import type { StudentTrainingTrack, TrainingMission, TrainingStage, TrainingTrack } from "../types/trainingTrack";
import { RewardIcon } from "./rewards/RewardIcon";
import { JourneyFlightReviewPage } from "./JourneyFlightReviewPage";
import { ManobrasTab } from "./ManobrasTab";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";
import { DEFAULT_SCHOOL_RULES } from "../types/schoolRules";

const JornadaEvolutionPanel = lazy(() =>
  import("./JornadaEvolutionPanel").then((module) => ({ default: module.JornadaEvolutionPanel })),
);

type FlightOutcome = "approved" | "failed" | "";

type FormationState = {
  tracks: StudentTrainingTrack[];
  flights: Array<SavedFlightListItem & { trainingMissionIds: string[] }>;
  fullFlights: SavedFlightFull[];
  approvedMissionIds: Set<string>;
  flightOutcomes: Map<string, FlightOutcome>;
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

type FormationDrillView =
  | { kind: "timeline" }
  | { kind: "maneuver-study"; mission: TrainingMission; articleIds: string[] }
  | { kind: "flight-review"; missionName: string; flightId: string; missionIndex: number };

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
  const [state, setState] = useState<FormationState>({ tracks: [], flights: [], fullFlights: [], approvedMissionIds: new Set(), flightOutcomes: new Map(), loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!configured || !user) {
      setState({ tracks: [], flights: [], fullFlights: [], approvedMissionIds: new Set(), flightOutcomes: new Map(), loading: false, error: configured ? null : "Appwrite não configurado" });
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
      // Parte A: busca completa APENAS para voos sem mission IDs materializados (comportamento original)
      const flightsNeedingFullData = baseFlights.filter(
        (flight) => flight.training_track_id && flightMissionIds(flight).length === 0,
      );
      // Parte B: busca leve de meta (apenas 1ª linha do CSV via Range HTTP) para TODOS os voos da trilha
      const allTrackFlightIds = baseFlights
        .filter((f) => f.training_track_id)
        .map((f) => f.id);

      if (flightsNeedingFullData.length === 0 && allTrackFlightIds.length === 0) return;
      if (cancelled) return;

      const fullFlights: SavedFlightFull[] = [];
      const fullById = new Map<string, SavedFlightFull>();

      // Executa A e B em paralelo — A é pesado mas raro; B é leve e cobre todos
      const [, metaMap] = await Promise.all([
        (async () => {
          for (let index = 0; index < flightsNeedingFullData.length; index += FLIGHT_DETAIL_BATCH) {
            if (cancelled) return;
            const batch = flightsNeedingFullData.slice(index, index + FLIGHT_DETAIL_BATCH);
            const results = await Promise.all(batch.map((flight) => getSavedFlight(flight.id)));
            results.forEach((full, batchIndex) => {
              if (!full.data) return;
              fullFlights.push(full.data);
              fullById.set(batch[batchIndex]!.id, full.data);
            });
          }
        })(),
        allTrackFlightIds.length > 0
          ? getFlightRecordMetaBatch(allTrackFlightIds, { concurrency: 8 })
          : Promise.resolve(new Map<string, FlightRecordMeta | null>()),
      ]);

      if (cancelled) return;

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

      // Calcula approved + outcomes usando o meta leve (sem precisar do CSV de telemetria)
      const approvedMissionIds = new Set<string>();
      const flightOutcomes = new Map<string, FlightOutcome>();
      for (const enrichedFlight of trainingFlights) {
        const meta = metaMap.get(enrichedFlight.id) ?? null;
        if (!meta?.risk) continue;
        const explicitOutcome = meta.risk.instructorOutcome;
        let resolvedOutcome: FlightOutcome = explicitOutcome ?? "";
        if (!explicitOutcome && meta.risk.instructorOpinionMd) {
          const normalized = meta.risk.instructorOpinionMd
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase();
          if (/\b(aprovado|aprovada|satisfatorio|apto|apta)\b/.test(normalized)) resolvedOutcome = "approved";
          else if (/\b(reprovado|reprovada|insatisfatorio|inapto|nao aprovado|nao aprovada)\b/.test(normalized)) resolvedOutcome = "failed";
        }
        flightOutcomes.set(enrichedFlight.id, resolvedOutcome);
        if (resolvedOutcome === "approved") {
          enrichedFlight.trainingMissionIds.forEach((id) => approvedMissionIds.add(id));
        }
      }

      if (cancelled) return;
      setState({
        tracks,
        flights: trainingFlights,
        fullFlights,
        approvedMissionIds,
        flightOutcomes,
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
        approvedMissionIds: new Set(),
        flightOutcomes: new Map(),
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


function formatFlightDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

function AchievementsSkeleton() {
  return (
    <SectionCard title="Conquistas" subtitle="Objetivos liberados conforme seu avanco na trilha.">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-700/70 bg-slate-950/30 p-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

const DEFAULT_CLUB_BENEFITS = [
  "Acesso completo à telemetria de todos os voos",
  "Análise detalhada de manobras e performance",
  "Vídeos de cockpit e gravações de voo",
  "Flight Review com feedback do instrutor",
  "Histórico de evolução e progresso",
  "Compartilhamento de voos com link público",
];

function ClubMemberBadge() {
  const { enabled, isClubMember, lpUrl, benefits } = useFlightReviewClub();
  const [open, setOpen] = useState(false);
  if (!enabled || !isClubMember) return null;
  const displayBenefits = benefits.length > 0 ? benefits : DEFAULT_CLUB_BENEFITS;
  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-bold text-sky-300">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 1a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L10 13.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L2.818 7.124a.75.75 0 01.416-1.28l4.21-.611L9.327 1.418A.75.75 0 0110 1z" clipRule="evenodd" />
          </svg>
          Flight Review Club
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-sky-400/70 underline-offset-2 hover:text-sky-300 hover:underline"
        >
          Ver benefícios
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-sky-500/30 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">Membership ativo</p>
                <h3 className="mt-0.5 text-lg font-black text-white">Flight Review Club</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                aria-label="Fechar"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {displayBenefits.map((benefit, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-200">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                  {benefit}
                </li>
              ))}
            </ul>
            <a
              href={lpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 block rounded-xl border border-sky-500/30 bg-sky-500/10 py-2 text-center text-sm font-semibold text-sky-300 hover:bg-sky-500/20"
            >
              Ver página do clube
            </a>
          </div>
        </div>
      )}
    </>
  );
}

function FormationJourney({ state }: { state: FormationState }) {
  const { user, configured } = useAuth();
  const [journeyMetrics, setJourneyMetrics] = useState<JourneyMetrics>(EMPTY_METRICS);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [autoSelectedStageKey, setAutoSelectedStageKey] = useState("");
  const [trackRewards, setTrackRewards] = useState<JourneyReward[]>([]);
  const [trackRewardsLoading, setTrackRewardsLoading] = useState(false);
  const [maneuverCatalog, setManeuverCatalog] = useState<ManeuverCatalog>({ sections: [], subsections: [], articles: [] });
  const [drillView, setDrillView] = useState<FormationDrillView>({ kind: "timeline" });
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
  const approvedMissionIds = state.approvedMissionIds;
  const missionRows = useMemo(() => (track ? flattenTrackMissions(track) : []), [track]);
  const firstOpenIndex = missionRows.findIndex((row) => !approvedMissionIds.has(row.mission.id));
  const nextIndex = firstOpenIndex >= 0 ? firstOpenIndex : missionRows.length - 1;
  const timeline: MissionTimelineItem[] = missionRows.map((row, index) => ({
    ...row,
    index,
    status: approvedMissionIds.has(row.mission.id) ? "done" : index === nextIndex && firstOpenIndex >= 0 ? "next" : "locked",
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
  const completedStageIds = useMemo(() => completedStagesForTrack(track, approvedMissionIds), [approvedMissionIds, track]);
  const evaluatedAchievements = useMemo(
    () =>
      evaluateRewards(trackRewards, {
        journey: journeyMetrics,
        flights: state.flights,
        fullFlights: state.fullFlights,
        formation: { selectedTrack: track, completedMissionIds: approvedMissionIds, completedStageIds },
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
        setTrackRewardsLoading(false);
        return;
      }
      setTrackRewardsLoading(true);
      const result = await listJourneyRewards({ kind: "achievement", trackId: track.id });
      if (!cancelled) {
        setTrackRewards(result.data);
        setTrackRewardsLoading(false);
      }
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

  if (drillView.kind === "maneuver-study") {
    return (
      <ManobrasTab
        articleIds={drillView.articleIds}
        mission={drillView.mission}
        onBack={() => setDrillView({ kind: "timeline" })}
        backLabel="Jornada"
      />
    );
  }

  if (drillView.kind === "flight-review") {
    return (
      <JourneyFlightReviewPage
        flightId={drillView.flightId}
        missionName={drillView.missionName}
        missionIndex={drillView.missionIndex}
        onBack={() => setDrillView({ kind: "timeline" })}
      />
    );
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
            <ClubMemberBadge />
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

      {false && evaluatedAchievements.length > 0 ? (
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
            const missionFlights = trackFlights.filter((flight) => flight.trainingMissionIds.includes(item.mission.id));
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
              <div className="mt-3 space-y-2">
                {maneuverArticles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setDrillView({
                      kind: "maneuver-study",
                      mission: item.mission,
                      articleIds: maneuverArticles.map((article) => article.id),
                    })}
                    className="block w-full rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-left text-xs font-semibold text-sky-400 hover:bg-sky-500/20"
                  >
                    Detalhes das manobras
                  </button>
                ) : null}
                {missionFlights.map((missionFlight) => {
                  const outcome = state.flightOutcomes.get(missionFlight.id) ?? null;
                  return (
                    <button
                      key={missionFlight.id}
                      type="button"
                      onClick={() => setDrillView({
                        kind: "flight-review",
                        missionName: item.mission.name,
                        flightId: missionFlight.id,
                        missionIndex: item.index,
                      })}
                      className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs font-semibold transition ${
                        outcome === "approved"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          : outcome === "failed"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                            : "border-slate-600/50 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                      }`}
                    >
                      Flight Review{missionFlight.flight_date ? ` · ${formatFlightDate(missionFlight.flight_date)}` : ""}
                    </button>
                  );
                })}
              </div>
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
      {trackRewardsLoading ? (
        <AchievementsSkeleton />
      ) : evaluatedAchievements.length > 0 ? (
        <SectionCard title="Conquistas" subtitle="Objetivos liberados conforme seu avanco na trilha.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2.5">
            {evaluatedAchievements.map((reward) => (
              <AchievementCard key={reward.id} reward={reward} />
            ))}
          </div>
        </SectionCard>
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
