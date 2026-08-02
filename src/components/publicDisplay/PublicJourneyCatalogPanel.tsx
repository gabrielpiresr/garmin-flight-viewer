import { useEffect, useMemo, useState } from "react";
import { listManeuverCatalog } from "../../lib/maneuversDb";
import { listTrainingTracks } from "../../lib/trainingTracksDb";
import type { ManeuverArticle, ManeuverCatalog } from "../../types/maneuver";
import type { TrainingMission, TrainingTrack } from "../../types/trainingTrack";
import { ManobrasTab } from "../ManobrasTab";
import { Skeleton } from "../ui/Skeleton";

const EMPTY_CATALOG: ManeuverCatalog = { sections: [], subsections: [], articles: [] };

function formatHours(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  return `${hours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

export function PublicJourneyCatalogPanel() {
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [maneuverCatalog, setManeuverCatalog] = useState<ManeuverCatalog>(EMPTY_CATALOG);
  const [studyMission, setStudyMission] = useState<{
    mission: TrainingMission;
    articleIds: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([listTrainingTracks(), listManeuverCatalog(false)]).then(([tracksRes, catalogRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (tracksRes.error) {
        setError("Não foi possível carregar as trilhas.");
        return;
      }
      setError(null);
      setTracks(tracksRes.data ?? []);
      setManeuverCatalog(catalogRes.data ?? EMPTY_CATALOG);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const track = useMemo(
    () => tracks.find((row) => row.id === selectedTrackId) ?? tracks[0] ?? null,
    [selectedTrackId, tracks],
  );

  const stage = useMemo(() => {
    if (!track) return null;
    return track.stages.find((row) => row.id === selectedStageId) ?? track.stages[0] ?? null;
  }, [selectedStageId, track]);

  const maneuverArticlesBySection = useMemo(() => {
    const map = new Map<string, ManeuverArticle[]>();
    for (const article of maneuverCatalog.articles) {
      if (!article.sectionId) continue;
      const list = map.get(article.sectionId) ?? [];
      list.push(article);
      map.set(article.sectionId, list);
    }
    map.forEach((articles) => articles.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR")));
    return map;
  }, [maneuverCatalog.articles]);

  if (studyMission) {
    return (
      <ManobrasTab
        articleIds={studyMission.articleIds}
        mission={studyMission.mission}
        onBack={() => setStudyMission(null)}
        backLabel="Missões"
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 p-8 text-center">
        <p className="text-sm font-medium text-slate-300">Nenhuma trilha ativa</p>
        <p className="mt-1 text-xs text-slate-500">As missões aparecerão aqui quando houver trilhas publicadas.</p>
      </div>
    );
  }

  const missions = stage?.missions ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Trilha</p>
        <div className="flex flex-wrap gap-2">
          {tracks.map((row) => {
            const active = row.id === track.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelectedTrackId(row.id);
                  setSelectedStageId("");
                }}
                className={`min-h-12 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
                  active
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-300 active:bg-slate-800"
                }`}
              >
                {row.name}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          {track.missionCount} missões · {formatHours(track.totalMinutes)} planejadas
        </p>
      </div>

      {track.stages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Fase</p>
          <div className="flex flex-wrap gap-2">
            {track.stages.map((row) => {
              const active = row.id === stage?.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedStageId(row.id)}
                  className={`min-h-11 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                      : "border-slate-700 bg-slate-900/50 text-slate-400 active:bg-slate-800"
                  }`}
                >
                  {row.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {missions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 p-6 text-center text-sm text-slate-400">
          Nenhuma missão nesta fase.
        </div>
      ) : (
        <div className="space-y-3">
          {missions.map((mission, index) => {
            const articleIds: string[] = Array.from(
              new Set(
                (mission.maneuverSectionIds ?? []).flatMap((sectionId) =>
                  (maneuverArticlesBySection.get(sectionId) ?? []).map((article) => article.id),
                ),
              ),
            );
            return (
              <article
                key={mission.id}
                className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-black text-slate-200">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold leading-tight text-slate-100">{mission.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {mission.durationMinutes} min · {mission.type}
                    </p>
                    {mission.maneuvers.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                        {mission.maneuvers.map((maneuver, maneuverIndex) => (
                          <li key={`${mission.id}-${maneuverIndex}`} className="leading-snug">
                            · {maneuver}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Sem manobras listadas.</p>
                    )}
                    {articleIds.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setStudyMission({ mission, articleIds })}
                        className="mt-4 min-h-11 w-full rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-2.5 text-sm font-semibold text-sky-300 transition active:bg-sky-500/20"
                      >
                        Ver conteúdo das manobras
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
