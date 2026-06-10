import L from "leaflet";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
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
import { listAerodromesByCodes, type Aerodrome } from "../lib/aerodromesDb";
import {
  aggregateJourneyMetrics,
  type JourneyBadge,
  type JourneyEvolutionPeriod,
  type JourneyLandingDistributionPoint,
  type JourneyMetrics,
} from "../lib/journeyMetrics";
import {
  listJourneyLandings,
  listJourneyTakeoffs,
  listJourneyTelemetrySummaries,
} from "../lib/flightTelemetryMetricsDb";
import { listJourneyRewards } from "../lib/rewardsDb";
import { evaluateRewards, rewardsToLegacyBadges } from "../lib/rewardEvaluation";
import { listGroundAircraftIdents } from "../lib/aircraftDb";
import { SCHOOL_ID } from "../lib/appwrite";
import type { SavedFlightFull, SavedFlightListItem } from "../lib/flightsDb";
import { DEFAULT_SCHOOL_RULES } from "../types/schoolRules";
import { JourneyShareStickersModal } from "./JourneyShareStickersModal";
import { RewardIcon } from "./rewards/RewardIcon";
import { Skeleton } from "./ui/Skeleton";
import { useAuth } from "../contexts/AuthContext";

type FormationSlice = {
  flights: Array<SavedFlightListItem & { trainingMissionIds: string[] }>;
  fullFlights: SavedFlightFull[];
};

type JourneyState = {
  metrics: JourneyMetrics;
  loading: boolean;
  error: string | null;
};

type VisitedAerodrome = Aerodrome & { code: string };

type VisitedAerodromesState = {
  points: VisitedAerodrome[];
  missingCodes: string[];
  loading: boolean;
  error: string | null;
};

type MonthlyMetricKey = "hours" | "distanceNm" | "landings";

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
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
};
const SCHOOL_REWARD_COLOR = DEFAULT_SCHOOL_RULES.theme.primaryColor;

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const MONTHLY_METRICS: Record<MonthlyMetricKey, { label: string; stroke: string; gradientId: string }> = {
  hours: { label: "Horas", stroke: "#38bdf8", gradientId: "journeyHours" },
  distanceNm: { label: "Milhas", stroke: "#a78bfa", gradientId: "journeyDistance" },
  landings: { label: "Pousos", stroke: "#34d399", gradientId: "journeyLandings" },
};

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

function useVisitedAerodromes(codes: string[]): VisitedAerodromesState {
  const [state, setState] = useState<VisitedAerodromesState>({ points: [], missingCodes: [], loading: false, error: null });
  const codesKey = useMemo(() => codes.map((code) => code.trim().toUpperCase()).filter(Boolean).sort().join("|"), [codes]);

  useEffect(() => {
    let cancelled = false;
    const wantedCodes = codesKey.split("|").filter(Boolean);
    if (wantedCodes.length === 0) {
      setState({ points: [], missingCodes: [], loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const aerodromes = await listAerodromesByCodes(wantedCodes);
        if (cancelled) return;
        const byCode = new Map<string, Aerodrome>();
        aerodromes.forEach((aerodrome) => {
          [aerodrome.icao, aerodrome.ciad].filter(Boolean).forEach((code) => {
            if (!byCode.has(code)) byCode.set(code, aerodrome);
          });
        });

        const points: VisitedAerodrome[] = [];
        const missingCodes: string[] = [];
        wantedCodes.forEach((code) => {
          const aerodrome = byCode.get(code);
          const latitude = aerodrome?.latitudeGeoPoint;
          const longitude = aerodrome?.longitudeGeoPoint;
          if (!aerodrome || latitude == null || longitude == null) {
            missingCodes.push(code);
            return;
          }
          points.push({ ...aerodrome, code });
        });
        setState({ points, missingCodes, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            points: [],
            missingCodes: wantedCodes,
            loading: false,
            error: err instanceof Error ? err.message : "Erro ao carregar aerodromos",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [codesKey]);

  return state;
}

function useEvaluatedBadges(metrics: JourneyMetrics, formation: FormationSlice): JourneyBadge[] {
  const [badges, setBadges] = useState<JourneyBadge[]>(metrics.badges);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [rewards, groundAircraftIdents] = await Promise.all([
        listJourneyRewards({ kind: "badge" }),
        listGroundAircraftIdents(SCHOOL_ID ?? "escola_principal"),
      ]);
      if (cancelled) return;
      if (rewards.error || rewards.data.length === 0) {
        setBadges(metrics.badges);
        return;
      }
      const evaluated = evaluateRewards(rewards.data, {
        journey: metrics,
        flights: formation.flights,
        fullFlights: formation.fullFlights,
        formation: null,
        groundAircraftIdents,
      });
      setBadges(rewardsToLegacyBadges(evaluated));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [formation.flights, formation.fullFlights, metrics]);

  return badges;
}

function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatHours(value: number): string {
  return `${value >= 10 ? integerFormatter.format(Math.round(value)) : decimalFormatter.format(value)} h`;
}

function formatMetersFromFt(value: number | null): string {
  return value === null ? "-" : `${integerFormatter.format(Math.round(value * 0.3048))} m`;
}

function formatSeconds(value: number | null): string {
  return value === null ? "-" : `${decimalFormatter.format(value)} s`;
}

function formatKt(value: number | null): string {
  return value === null ? "-" : `${decimalFormatter.format(value)} kt`;
}

function formatFpm(value: number | null): string {
  return value === null ? "-" : `${integerFormatter.format(Math.round(value))} fpm`;
}

function formatG(value: number | null): string {
  return value === null ? "-" : `${decimalFormatter.format(value)} g`;
}

function formatPercent(value: number): string {
  return `${integerFormatter.format(Math.round(value))}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "Sem voos ainda";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Sem voos ainda" : date.toLocaleDateString("pt-BR");
}

function latestEvolution(metrics: JourneyMetrics, period: JourneyEvolutionPeriod) {
  const limit = period === "day" ? 14 : period === "week" ? 12 : 8;
  return metrics.evolution[period].slice(-limit).map((item) => ({
    ...item,
    hours: Number(item.hours.toFixed(1)),
    distanceNm: Math.round(item.distanceNm),
  }));
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

function WeeklyStreakCard({ metrics, compact = false }: { metrics: JourneyMetrics; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-amber-300/20 bg-amber-400/10 ${compact ? "p-3" : "p-4"} text-center`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[0.8125rem] bg-amber-400 text-2xl shadow-lg shadow-amber-950/30">
        <span className="drop-shadow-sm">🔥</span>
      </div>
      <p className={`${compact ? "mt-1 text-3xl" : "mt-2 text-4xl"} font-black leading-none text-amber-300`}>
        {formatInteger(metrics.streakWeeks)}
      </p>
      <p className="mt-1 text-xs font-bold lowercase tracking-wide text-amber-400">semanas streak</p>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {metrics.weeklyStreak.map((week) => (
          <div key={week.label} className="space-y-1">
            <p className={`text-[9px] font-bold ${week.current ? "text-amber-400" : "text-slate-500"}`}>{week.label}</p>
            <span
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                week.active
                  ? week.current
                    ? "bg-sky-400 text-white ring-2 ring-sky-200/80"
                    : "bg-amber-400 text-amber-950"
                  : "bg-slate-800 text-slate-600"
              }`}
            >
              {week.active ? "*" : ""}
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

function FitVisitedAerodromes({ points }: { points: VisitedAerodrome[] }) {
  const map = useMap();
  const boundsKey = points.map((point) => `${point.code}:${point.latitudeGeoPoint},${point.longitudeGeoPoint}`).join("|");

  useEffect(() => {
    const positions = points
      .map((point) => [point.latitudeGeoPoint, point.longitudeGeoPoint] as [number | null, number | null])
      .filter((position): position is [number, number] => position[0] !== null && position[1] !== null);
    if (positions.length === 0) {
      map.setView([-14.235, -51.9253], 4);
    } else if (positions.length === 1) {
      map.setView(positions[0], 10);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [44, 44], maxZoom: 10 });
    }
  }, [boundsKey, map, points]);

  return null;
}

function BrazilVisitedMap({ state, totalAirports }: { state: VisitedAerodromesState; totalAirports: number }) {
  const knownCount = state.points.length;
  const topPlaces = state.points.slice(0, 8);

  return (
    <SectionCard title="Mapa da jornada" subtitle="Aerodromos visitados no Brasil.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
        <div className="relative h-[28rem] overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-950">
          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 shadow-lg shadow-slate-950/30 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/90">Territorio explorado</p>
            <p className="mt-0.5 text-2xl font-black leading-none text-white">{formatInteger(totalAirports)}</p>
          </div>
          <MapContainer center={[-14.235, -51.9253]} zoom={4} className="h-full w-full" scrollWheelZoom zoomControl>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              maxZoom={18}
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            />
            {state.points.map((point) => {
              if (point.latitudeGeoPoint === null || point.longitudeGeoPoint === null) return null;
              const place = [point.municipality, point.uf].filter(Boolean).join(" - ");
              return (
                <CircleMarker
                  key={`${point.code}-${point.id}`}
                  center={[point.latitudeGeoPoint, point.longitudeGeoPoint]}
                  radius={8}
                  pathOptions={{ color: "#f8fafc", fillColor: "#facc15", fillOpacity: 0.95, weight: 2 }}
                >
                  <LeafletTooltip permanent direction="right" offset={[10, 0]} className="journey-airport-label">
                    {point.code}
                  </LeafletTooltip>
                  <Popup>
                    <div className="min-w-40">
                      <strong>{point.code}</strong>
                      <br />
                      {point.name || "Aerodromo"}
                      {place ? (
                        <>
                          <br />
                          {place}
                        </>
                      ) : null}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
            <FitVisitedAerodromes points={state.points} />
          </MapContainer>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
              <p className="text-2xl font-black text-emerald-300">{formatInteger(knownCount)}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">No mapa</p>
            </div>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3">
              <p className="text-2xl font-black text-amber-300">{formatInteger(state.missingCodes.length)}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Sem posicao</p>
            </div>
          </div>
          {state.loading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : state.error ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-300">{state.error}</p>
          ) : topPlaces.length > 0 ? (
            <div className="space-y-2">
              {topPlaces.map((point) => (
                <div key={`place-${point.code}-${point.id}`} className="rounded-xl border border-slate-700/70 bg-slate-950/35 px-3 py-2">
                  <p className="text-sm font-black text-slate-100">{point.code}</p>
                  <p className="line-clamp-1 text-xs text-slate-400">{[point.name, point.municipality, point.uf].filter(Boolean).join(" - ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/30 p-3 text-sm text-slate-500">
              Coordenadas ainda nao encontradas para os aerodromos visitados.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-3">
      <div className={`mb-3 h-1 w-10 rounded-full ${accent}`} />
      <p className="text-2xl font-black leading-none text-slate-100">{value}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
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

function JourneyHero({ metrics }: { metrics: JourneyMetrics }) {
  return (
    <div className="max-w-xl">
      <WeeklyStreakCard metrics={metrics} />
    </div>
  );
}

function JourneySkeletonPage() {
  return (
    <div className="space-y-5">
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
          {badge.visual ? (
            <RewardIcon visual={badge.visual} achieved={badge.achieved} schoolColor={SCHOOL_REWARD_COLOR} className="h-6 w-6" />
          ) : badge.achieved ? "OK" : "•"}
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

type Props = {
  formation: FormationSlice;
};

export function JornadaEvolutionPanel({ formation }: Props) {
  const { user } = useAuth();
  const { metrics, loading, error } = useJourneyMetrics();
  const badges = useEvaluatedBadges(metrics, formation);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [monthlyMetric, setMonthlyMetric] = useState<MonthlyMetricKey>("hours");
  const [evolutionPeriod, setEvolutionPeriod] = useState<JourneyEvolutionPeriod>("month");
  const chartData = useMemo(() => latestEvolution(metrics, evolutionPeriod), [evolutionPeriod, metrics]);
  const selectedMonthlyMetric = MONTHLY_METRICS[monthlyMetric];
  const relationshipLabel = user?.role === "instrutor" ? "Alunos" : "Instrutores";
  const relationshipValue = user?.role === "instrutor" ? metrics.totals.students : metrics.totals.instructors;
  const visitedAerodromes = useVisitedAerodromes(metrics.airports);

  if (loading) return <JourneySkeletonPage />;
  if (error) return <ErrorCard message={error} />;
  if (!metrics.hasData) return <EmptyJourneyCard />;

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShareModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-gradient-to-r from-fuchsia-500/15 via-pink-500/15 to-orange-400/15 px-3 py-1.5 text-sm font-semibold text-pink-100 transition hover:border-pink-400/60 hover:from-fuchsia-500/25 hover:via-pink-500/25 hover:to-orange-400/25"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3.25" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
          </svg>
          Compartilhar
        </button>
      </div>

      <JourneyHero metrics={metrics} />

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Voos" value={formatInteger(metrics.totals.flights)} accent="bg-sky-400" />
        <MetricCard label="Horas" value={decimalFormatter.format(metrics.totals.hours)} accent="bg-emerald-400" />
        <MetricCard label="Milhas navegadas" value={formatInteger(metrics.totals.distanceNm)} accent="bg-violet-400" />
        <MetricCard label={relationshipLabel} value={formatInteger(relationshipValue)} accent="bg-amber-400" />
        <MetricCard label="Aeronave" value={formatInteger(metrics.totals.aircraft)} accent="bg-sky-400" />
        <MetricCard label="Aeroportos visitados" value={formatInteger(metrics.totals.airports)} accent="bg-emerald-400" />
      </div>

      <SectionCard title="Aeródromos">
        {metrics.airports.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {metrics.airports.map((airport) => (
              <span key={airport} className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-sm font-semibold text-slate-200">
                {airport}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nenhum aeródromo registrado ainda.</p>
        )}
      </SectionCard>

      <BrazilVisitedMap state={visitedAerodromes} totalAirports={metrics.totals.airports} />

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
          value={metrics.records.bestMonth?.label ?? "-"}
          accent="bg-amber-400"
          rows={[
            {
              label: "Melhor mês",
              value: metrics.records.bestMonth
                ? `${formatHours(metrics.records.bestMonth.hours)} / ${formatInteger(metrics.records.bestMonth.landings)} pousos`
                : "-",
            },
            { label: "Último voo", value: formatDate(metrics.latestFlightDate) },
            { label: "Maior GS", value: formatKt(metrics.records.maxLandingGsKt) },
            { label: "Badges", value: formatInteger(badges.filter((badge) => badge.achieved).length) },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <SectionCard title="Evolução" subtitle="Escolha a métrica e o período exibido.">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950/50 p-1">
              {([
                ["day", "Dia"],
                ["week", "Semana"],
                ["month", "Mês"],
              ] as const).map(([period, label]) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setEvolutionPeriod(period)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    evolutionPeriod === period ? "bg-emerald-500 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
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

      <SectionCard title="Badges" subtitle="Badges desbloqueados automaticamente.">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {badges.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </SectionCard>

      {shareModalOpen ? <JourneyShareStickersModal onClose={() => setShareModalOpen(false)} /> : null}
    </>
  );
}
