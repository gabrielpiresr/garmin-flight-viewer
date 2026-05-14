import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { getSavedFlight, listSavedFlights, type SavedFlightListItem } from "../lib/flightsDb";
import {
  listJourneyLandings,
  listJourneyTakeoffs,
  listJourneyTelemetrySummaries,
} from "../lib/flightTelemetryMetricsDb";
import {
  aggregateJourneyMetrics,
  type JourneyBadge,
  type JourneyLandingDistributionPoint,
  type JourneyMetrics,
} from "../lib/journeyMetrics";
import { listStudentTrainingTracks } from "../lib/trainingTracksDb";
import type { StudentTrainingTrack, TrainingMission, TrainingStage, TrainingTrack } from "../types/trainingTrack";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";

type JourneyState = {
  metrics: JourneyMetrics;
  loading: boolean;
  error: string | null;
};

type FormationState = {
  tracks: StudentTrainingTrack[];
  flights: Array<SavedFlightListItem & { trainingMissionIds: string[] }>;
  loading: boolean;
  error: string | null;
};

type MissionTimelineItem = {
  stage: TrainingStage;
  mission: TrainingMission;
  index: number;
  status: "done" | "next" | "locked";
};

type MonthlyMetricKey = "hours" | "distanceNm" | "landings";
type JourneySection = "formacao" | "evolucao";

const EMPTY_METRICS = aggregateJourneyMetrics({ summaries: [], landings: [], takeoffs: [] });
const CHART_GRID = "#334155";
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(71,85,105,0.8)",
  borderRadius: "0.4875rem",
  color: "#e2e8f0",
};
const PIE_COLORS = ["#34d399", "#fbbf24", "#fb7185"];
const BADGE_TONE_CLASS: Record<JourneyBadge["tone"], string> = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const MONTHLY_METRICS: Record<MonthlyMetricKey, { label: string; stroke: string; gradientId: string }> = {
  hours: { label: "Horas", stroke: "#38bdf8", gradientId: "journeyHours" },
  distanceNm: { label: "Milhas", stroke: "#a78bfa", gradientId: "journeyDistance" },
  landings: { label: "Pousos", stroke: "#34d399", gradientId: "journeyLandings" },
};

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

function useJourneyMetrics(): JourneyState {
  const { user, configured } = useAuth();
  const [state, setState] = useState<JourneyState>({
    metrics: EMPTY_METRICS,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!configured || !user) {
      setState({ metrics: EMPTY_METRICS, loading: false, error: configured ? null : "Appwrite não configurado" });
      return () => {
        cancelled = true;
      };
    }
    const currentUser = user;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const [summaries, landings, takeoffs] = await Promise.all([
        listJourneyTelemetrySummaries({ userId: currentUser.id, role: currentUser.role }),
        listJourneyLandings({ userId: currentUser.id, role: currentUser.role }),
        listJourneyTakeoffs({ userId: currentUser.id, role: currentUser.role }),
      ]);
      if (cancelled) return;
      // #region agent log
      fetch("http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0a56a4" }, body: JSON.stringify({ sessionId: "0a56a4", runId: "pre-fix", hypothesisId: "H2,H3,H5", location: "src/components/JornadaTab.tsx:90", message: "Journey metric load results", data: { userRole: currentUser.role, summaries: { count: summaries.data?.length ?? null, error: summaries.error?.message ?? null }, landings: { count: landings.data?.length ?? null, error: landings.error?.message ?? null }, takeoffs: { count: takeoffs.data?.length ?? null, error: takeoffs.error?.message ?? null } }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      const error = summaries.error ?? landings.error ?? takeoffs.error;
      if (error) {
        setState({ metrics: EMPTY_METRICS, loading: false, error: error.message });
        return;
      }
      setState({
        metrics: aggregateJourneyMetrics({
          summaries: summaries.data ?? [],
          landings: landings.data ?? [],
          takeoffs: takeoffs.data ?? [],
        }),
        loading: false,
        error: null,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  return state;
}

function useFormationProgress(): FormationState {
  const { user, configured } = useAuth();
  const [state, setState] = useState<FormationState>({ tracks: [], flights: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!configured || !user) {
      setState({ tracks: [], flights: [], loading: false, error: configured ? null : "Appwrite não configurado" });
      return () => {
        cancelled = true;
      };
    }
    const currentUser = user;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const [tracksRes, flightsRes] = await Promise.all([
        listStudentTrainingTracks(currentUser.id),
        listSavedFlights({ userId: currentUser.id, role: currentUser.role }),
      ]);
      if (cancelled) return;
      const error = tracksRes.error ?? flightsRes.error;
      const baseFlights = flightsRes.data ?? [];
      const trainingFlights = await Promise.all(
        baseFlights.map(async (flight) => {
          if (!flight.training_track_id) return { ...flight, trainingMissionIds: flightMissionIds(flight) };
          const full = await getSavedFlight(flight.id);
          if (full.error || !full.data) return { ...flight, trainingMissionIds: flightMissionIds(flight) };
          const meta = decodeFlightRecord(full.data.csv_text).meta;
          return {
            ...flight,
            trainingMissionIds: Array.from(new Set([...(meta?.training?.missionIds ?? []), ...flightMissionIds(flight)].filter(Boolean))),
          };
        }),
      );
      if (cancelled) return;
      setState({
        tracks: tracksRes.data ?? [],
        flights: trainingFlights,
        loading: false,
        error: error?.message ?? null,
      });
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

function formatNm(value: number): string {
  return `${integerFormatter.format(Math.round(value))} NM`;
}

function formatMetersFromFt(value: number | null): string {
  return value === null ? "—" : `${integerFormatter.format(Math.round(value * 0.3048))} m`;
}

function formatSeconds(value: number | null): string {
  return value === null ? "—" : `${decimalFormatter.format(value)} s`;
}

function formatKt(value: number | null): string {
  return value === null ? "—" : `${decimalFormatter.format(value)} kt`;
}

function formatFpm(value: number | null): string {
  return value === null ? "—" : `${integerFormatter.format(Math.round(value))} fpm`;
}

function formatG(value: number | null): string {
  return value === null ? "—" : `${decimalFormatter.format(value)} g`;
}

function formatPercent(value: number): string {
  return `${integerFormatter.format(Math.round(value))}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "Sem voos ainda";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Sem voos ainda" : date.toLocaleDateString("pt-BR");
}

function latestMonths(metrics: JourneyMetrics) {
  return metrics.monthly.slice(-8).map((item) => ({
    ...item,
    hours: Number(item.hours.toFixed(1)),
    distanceNm: Math.round(item.distanceNm),
  }));
}

function flightMissionIds(flight: SavedFlightListItem): string[] {
  return Array.from(new Set([flight.training_mission_id ?? ""].filter(Boolean)));
}

function flattenTrackMissions(track: TrainingTrack): Array<{ stage: TrainingStage; mission: TrainingMission }> {
  return track.stages.flatMap((stage) => stage.missions.map((mission) => ({ stage, mission })));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function LoadingHero() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/50 p-4 shadow-2xl shadow-slate-950/30 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[34rem]">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
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
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
      Não foi possível carregar a Jornada: {message}
    </div>
  );
}

function WeeklyStreakCard({ metrics, compact = false }: { metrics: JourneyMetrics; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-amber-300/20 bg-amber-400/10 ${compact ? "p-3" : "p-4"} text-center`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[0.8125rem] bg-amber-400 text-2xl shadow-lg shadow-amber-950/30">
        <span className="drop-shadow-sm">🔥</span>
      </div>
      <p className={`${compact ? "mt-1 text-3xl" : "mt-2 text-4xl"} font-black leading-none text-amber-300`}>
        {formatInteger(metrics.streakWeeks)}
      </p>
      <p className="mt-1 text-xs font-bold lowercase tracking-wide text-amber-200">semanas streak</p>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {metrics.weeklyStreak.map((week) => (
          <div key={week.label} className="space-y-1">
            <p className={`text-[9px] font-bold ${week.current ? "text-amber-200" : "text-slate-500"}`}>{week.label}</p>
            <span
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                week.active
                  ? week.current
                    ? "bg-sky-400 text-white ring-2 ring-sky-200/80"
                    : "bg-amber-400 text-amber-950"
                  : "bg-slate-800 text-slate-600"
              }`}
            >
              {week.active ? "✓" : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {metrics.streakWeeks > 0
          ? `Você manteve voos por ${formatInteger(metrics.streakWeeks)} semanas consecutivas.`
          : "Registre um voo nesta semana para iniciar a sequência."}
      </p>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-3.5 md:p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">{title}</p>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-3">
      <div className={`mb-2 h-1 w-10 rounded-full ${accent}`} />
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
    </div>
  );
}

function SummaryDash({
  title,
  value,
  accent,
  rows,
}: {
  title: string;
  value: string;
  accent: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className={`mb-3 h-1 w-10 rounded-full ${accent}`} />
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black text-slate-100">{value}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">{row.label}</span>
            <span className="text-right font-semibold text-slate-200">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
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

function JourneyHero({ metrics, roleLabel }: { metrics: JourneyMetrics; roleLabel: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.2),transparent_36%),rgba(15,23,42,0.88)] p-4 shadow-2xl shadow-slate-950/40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">Jornada {roleLabel}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">{metrics.level.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-300">
            Evolução operacional, consistência nos pousos e recordes pessoais extraídos da telemetria.
          </p>
          <div className="mt-4 max-w-2xl">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>Progresso de nível</span>
              <span>{formatPercent(metrics.level.progressPct)}</span>
            </div>
            <ProgressBar value={metrics.level.progressPct} />
            <p className="mt-2 text-xs text-slate-500">
              {metrics.level.nextPoints
                ? `${formatInteger(Math.max(metrics.level.nextPoints - metrics.level.points, 0))} pontos até o próximo nível.`
                : "Nível máximo alcançado."}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">Pontos</p>
          <p className="text-3xl font-black text-emerald-300">{formatInteger(metrics.level.points)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatInteger(metrics.badges.filter((badge) => badge.achieved).length)} conquistas</p>
        </div>
      </div>
    </section>
  );
}

function JourneySkeletonPage() {
  return (
    <div className="space-y-5">
      <LoadingHero />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: JourneyBadge }) {
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        badge.achieved ? BADGE_TONE_CLASS[badge.tone] : "border-slate-700/70 bg-slate-950/30 text-slate-500"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black ${
            badge.achieved ? "border-white/20 bg-white/10 text-white" : "border-slate-700 bg-slate-900 text-slate-600"
          }`}
        >
          {badge.achieved ? "✓" : "•"}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{badge.title}</p>
          <p className="mt-1 text-xs opacity-80">{badge.description}</p>
        </div>
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload?: JourneyLandingDistributionPoint; value?: number }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  const percent = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl shadow-slate-950/50">
      <p className="font-semibold text-slate-100">{item.name}</p>
      <p className="mt-0.5 text-slate-400">
        {formatInteger(item.value)} pousos · {percent}%
      </p>
    </div>
  );
}

function LandingDistribution({ metrics }: { metrics: JourneyMetrics }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={metrics.landingDistribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={4}>
              {metrics.landingDistribution.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index] ?? "#38bdf8"} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={metrics.totals.landings} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 text-sm">
        {metrics.landingDistribution.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/30 px-3 py-2">
            <span className="flex items-center gap-2 text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index] ?? "#38bdf8" }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-100">{formatInteger(item.value)}</span>
          </div>
        ))}
        <p className="px-3 text-xs text-slate-500">{formatPercent(metrics.totals.smoothLandingRate)} de pousos suaves.</p>
      </div>
    </div>
  );
}

function FormationJourney({ state }: { state: FormationState }) {
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const activeTracks = useMemo(
    () => state.tracks.filter((row) => row.status === "active" && row.track).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    [state.tracks],
  );

  useEffect(() => {
    if (selectedTrackId && activeTracks.some((row) => row.trackId === selectedTrackId)) return;
    setSelectedTrackId(activeTracks.find((row) => row.isPrimary)?.trackId ?? activeTracks[0]?.trackId ?? "");
  }, [activeTracks, selectedTrackId]);

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

  const selectedAssignment = activeTracks.find((row) => row.trackId === selectedTrackId) ?? activeTracks[0]!;
  const track = selectedAssignment.track!;
  const trackFlights = state.flights.filter((flight) => flight.training_track_id === track.id);
  const completedMissionIds = new Set(trackFlights.flatMap((flight) => flight.trainingMissionIds));
  const missionRows = flattenTrackMissions(track);
  const firstOpenIndex = missionRows.findIndex((row) => !completedMissionIds.has(row.mission.id));
  const nextIndex = firstOpenIndex >= 0 ? firstOpenIndex : missionRows.length - 1;
  const timeline: MissionTimelineItem[] = missionRows.map((row, index) => ({
    ...row,
    index,
    status: completedMissionIds.has(row.mission.id) ? "done" : index === nextIndex && firstOpenIndex >= 0 ? "next" : "locked",
  }));
  const completedCount = timeline.filter((item) => item.status === "done").length;
  const flownHours = trackFlights.reduce((acc, flight) => acc + ((flight.duration_sec ?? 0) / 3600), 0);
  const trackHours = track.totalMinutes / 60;
  const hoursPct = trackHours > 0 ? clampPercent((flownHours / trackHours) * 100) : 0;
  const missionPct = track.missionCount > 0 ? clampPercent((completedCount / track.missionCount) * 100) : 0;
  const nextMission = timeline.find((item) => item.status === "next") ?? null;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(6,78,59,0.84),rgba(15,23,42,0.92)_48%,rgba(88,28,135,0.72))] p-4 shadow-2xl shadow-slate-950/40 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200/80">Formação</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">{track.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-emerald-50/80">
              Progresso da trilha, missões conquistadas e próximo objetivo em uma linha do tempo navegável.
            </p>
            {activeTracks.length > 1 ? (
              <select
                value={selectedAssignment.trackId}
                onChange={(event) => setSelectedTrackId(event.target.value)}
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
            <p className="text-xs uppercase tracking-widest text-emerald-100/70">Próxima missão</p>
            <p className="mt-1 text-2xl font-black text-white">{nextMission?.mission.name ?? "Trilha completa"}</p>
            <p className="mt-1 text-xs text-emerald-50/70">
              {nextMission ? `${nextMission.stage.name} · ${nextMission.mission.durationMinutes} min · ${nextMission.mission.type}` : "Todas as missões foram marcadas."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Horas na trilha" subtitle={`${formatHours(flownHours)} de ${formatHours(trackHours)} planejadas`}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-slate-100">{formatPercent(hoursPct)}</p>
            <p className="text-sm text-slate-400">{formatInteger(trackFlights.length)} voos vinculados</p>
          </div>
          <div className="mt-3"><ProgressBar value={hoursPct} /></div>
        </SectionCard>
        <SectionCard title="Missões completadas" subtitle={`${formatInteger(completedCount)} de ${formatInteger(track.missionCount)} na trilha`}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-slate-100">{formatPercent(missionPct)}</p>
            <p className="text-sm text-slate-400">{formatInteger(Math.max(track.missionCount - completedCount, 0))} restantes</p>
          </div>
          <div className="mt-3"><ProgressBar value={missionPct} /></div>
        </SectionCard>
      </div>

      <SectionCard title="Timeline da trilha" subtitle="Arraste para ver missões passadas, atual e futuras.">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {timeline.map((item) => (
            <article
              key={item.mission.id}
              className={`min-h-52 w-64 shrink-0 rounded-2xl border p-3 transition ${
                item.status === "done"
                  ? "border-emerald-400/40 bg-emerald-500/10"
                  : item.status === "next"
                    ? "border-amber-300/60 bg-amber-400/10 shadow-lg shadow-amber-950/20"
                    : "border-slate-700/70 bg-slate-950/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                  item.status === "done" ? "bg-emerald-400 text-emerald-950" : item.status === "next" ? "bg-amber-300 text-amber-950" : "bg-slate-800 text-slate-500"
                }`}>
                  {item.status === "done" ? "OK" : item.index + 1}
                </span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                  {item.status === "done" ? "Concluída" : item.status === "next" ? "Próxima" : "Futura"}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-500">{item.stage.name}</p>
              <h3 className="mt-1 text-lg font-black text-slate-100">{item.mission.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{item.mission.durationMinutes} min · {item.mission.type}</p>
              {item.mission.maneuvers.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {item.mission.maneuvers.slice(0, 3).map((maneuver, idx) => (
                    <li key={`${item.mission.id}-${idx}`} className="line-clamp-2">{maneuver}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function JornadaTab() {
  const { user } = useAuth();
  const { metrics, loading, error } = useJourneyMetrics();
  const formationState = useFormationProgress();
  const [section, setSection] = useState<JourneySection>("formacao");
  const [monthlyMetric, setMonthlyMetric] = useState<MonthlyMetricKey>("hours");
  const roleLabel = user?.role === "instrutor" ? "do INVA" : "do aluno";
  const chartData = useMemo(() => latestMonths(metrics), [metrics]);
  const selectedMonthlyMetric = MONTHLY_METRICS[monthlyMetric];
  const relationshipLabel = user?.role === "instrutor" ? "Alunos" : "Instrutores";
  const relationshipValue = user?.role === "instrutor" ? metrics.totals.students : metrics.totals.instructors;

  return (
    <div className="min-w-0 space-y-4">
      <Tabs items={JOURNEY_SECTIONS} value={section} onChange={setSection} ariaLabel="Subabas da jornada" accent="sky" />

      {section === "formacao" ? (
        <FormationJourney state={formationState} />
      ) : loading ? (
        <JourneySkeletonPage />
      ) : error ? (
        <ErrorCard message={error} />
      ) : !metrics.hasData ? (
        <EmptyJourneyCard />
      ) : (
        <>
      <JourneyHero metrics={metrics} roleLabel={roleLabel} />

      <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <WeeklyStreakCard metrics={metrics} />
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Voos" value={formatInteger(metrics.totals.flights)} detail="Total com telemetria" accent="bg-sky-400" />
          <MetricCard label="Horas" value={formatHours(metrics.totals.hours)} detail="Tempo total de voo" accent="bg-emerald-400" />
          <MetricCard label="Milhas navegadas" value={formatNm(metrics.totals.distanceNm)} detail="Distância GPS consolidada" accent="bg-violet-400" />
          <MetricCard label={relationshipLabel} value={formatInteger(relationshipValue)} detail="Vínculos na jornada" accent="bg-amber-400" />
          <MetricCard label="Aeronaves" value={formatInteger(metrics.totals.aircraft)} detail="Matrículas diferentes" accent="bg-sky-400" />
          <MetricCard label="Aeroportos" value={formatInteger(metrics.totals.airports)} detail="Aeródromos visitados" accent="bg-emerald-400" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryDash
          title="Pousos"
          value={formatInteger(metrics.totals.landings)}
          accent="bg-emerald-400"
          rows={[
            { label: "Suaves", value: `${formatInteger(metrics.totals.smoothLandings)} (${formatPercent(metrics.totals.smoothLandingRate)})` },
            { label: "Médios / duros", value: `${formatInteger(metrics.totals.mediumLandings)} / ${formatInteger(metrics.totals.hardLandings)}` },
            {
              label: "Razão do mais suave",
              value: `${formatFpm(metrics.records.softestLandingFpm)} · ${formatG(metrics.records.softestLandingG)}`,
            },
            { label: "Mais lento (kt)", value: formatKt(metrics.records.slowestLandingIasKt ?? metrics.records.slowestLandingGsKt) },
            { label: "Sequência suave", value: formatInteger(metrics.records.longestSoftLandingStreak) },
          ]}
        />
        <SummaryDash
          title="Decolagens"
          value={formatInteger(metrics.totals.takeoffs)}
          accent="bg-sky-400"
          rows={[
            { label: "Mais curta", value: formatMetersFromFt(metrics.records.shortestTakeoffRollFt) },
            { label: "Mais longa", value: formatMetersFromFt(metrics.records.longestTakeoffRollFt) },
            { label: "Mais rápida", value: formatSeconds(metrics.records.fastestTakeoffTimeSec) },
            { label: "Rolagem média", value: formatMetersFromFt(metrics.records.averageTakeoffRollFt) },
          ]}
        />
        <SummaryDash
          title="Vento"
          value={formatKt(metrics.records.maxCrosswindKt)}
          accent="bg-violet-400"
          rows={[
            { label: "Través máximo", value: formatKt(metrics.records.maxCrosswindKt) },
            { label: "Proa máxima", value: formatKt(metrics.records.maxHeadwindKt) },
            { label: "Cauda máxima", value: formatKt(metrics.records.maxTailwindKt) },
          ]}
        />
        <SummaryDash
          title="Insights"
          value={metrics.records.bestMonth?.label ?? "—"}
          accent="bg-amber-400"
          rows={[
            {
              label: "Melhor mês",
              value: metrics.records.bestMonth
                ? `${formatHours(metrics.records.bestMonth.hours)} / ${formatInteger(metrics.records.bestMonth.landings)} pousos`
                : "—",
            },
            { label: "Último voo", value: formatDate(metrics.latestFlightDate) },
            { label: "Maior GS", value: formatKt(metrics.records.maxLandingGsKt) },
            { label: "Conquistas", value: formatInteger(metrics.badges.filter((badge) => badge.achieved).length) },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <SectionCard title="Evolução mensal" subtitle="Escolha a métrica exibida no período.">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(MONTHLY_METRICS) as MonthlyMetricKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMonthlyMetric(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  monthlyMetric === key ? "bg-sky-500 text-white" : "bg-slate-950/50 text-slate-400 hover:text-slate-200"
                }`}
              >
                {MONTHLY_METRICS[key].label}
              </button>
            ))}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {Object.entries(MONTHLY_METRICS).map(([key, config]) => (
                    <linearGradient key={key} id={config.gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor={config.stroke} stopOpacity={0.55} />
                      <stop offset="95%" stopColor={config.stroke} stopOpacity={0.04} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" opacity={0.45} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#bae6fd" }} />
                <Area
                  type="monotone"
                  dataKey={monthlyMetric}
                  name={selectedMonthlyMetric.label}
                  stroke={selectedMonthlyMetric.stroke}
                  strokeWidth={2}
                  fill={`url(#${selectedMonthlyMetric.gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Distribuição dos pousos" subtitle="Qualidade do toque no solo.">
          <LandingDistribution metrics={metrics} />
        </SectionCard>
      </div>

      <SectionCard title="Conquistas" subtitle="Badges desbloqueados automaticamente.">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.badges.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </SectionCard>
        </>
      )}
    </div>
  );
}
