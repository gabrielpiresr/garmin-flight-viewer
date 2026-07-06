import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import { listManeuverCatalog } from "../lib/maneuversDb";
import { listTrainingExercises } from "../lib/trainingExercisesDb";
import { renderRichContent } from "../lib/maneuverContent";
import { openManeuverCatalogPdf } from "../lib/maneuverPdf";
import { getPdfBrand } from "../lib/pdfBrand";
import type { ManeuverCatalog } from "../types/maneuver";
import type { TrainingExercise } from "../types/trainingExercise";
import type { TrainingMission, TrainingMissionType } from "../types/trainingTrack";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";

const MISSION_TYPE_LABEL: Record<TrainingMissionType, string> = {
  DC: "Duplo comando",
  SL: "Solo",
  PIC: "Piloto em comando",
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}min`;
}

type ManobrasTabProps = {
  className?: string;
  articleIds?: string[];
  introText?: string;
  mission?: TrainingMission;
  onBack?: () => void;
  backLabel?: string;
};

type MissionDetailTab = "manobras" | "criterios";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const IconArrowLeft = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
  </svg>
);

const IconArrowRight = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
  </svg>
);

const IconDoc = ({ className = "h-4 w-4 shrink-0" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
  </svg>
);

const IconCheckSmall = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
  </svg>
);

function AnimatedPane({ paneKey, children }: { paneKey: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [paneKey]);

  return (
    <div className={`transition-all duration-300 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
      {children}
    </div>
  );
}

export function ManobrasTab({
  className = "w-full max-w-[96rem]",
  articleIds,
  introText,
  mission,
  onBack,
  backLabel = "Voltar",
}: ManobrasTabProps) {
  const [catalog, setCatalog] = useState<ManeuverCatalog>({
    sections: [],
    subsections: [],
    articles: [],
  });
  const [selectedSectionId, setSelectedSectionId] = useState(""); // "" = section index
  const [selectedView, setSelectedView] = useState(""); // "" | "exercises" | articleId
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [missionDetailTab, setMissionDetailTab] = useState<MissionDetailTab>("manobras");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listManeuverCatalog(false);
    if (listError) {
      setError(listError.message);
      setCatalog({ sections: [], subsections: [], articles: [] });
    } else {
      setCatalog(data);
      setSelectedSectionId("");
      setSelectedView("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void listTrainingExercises({ schoolId: DEFAULT_SCHOOL_ID }).then((res) => {
      if (!res.error) setExercises(res.data);
    });
  }, [load]);

  useEffect(() => {
    setMissionDetailTab("manobras");
  }, [mission?.id]);

  const allowedArticleIds = useMemo(
    () => (articleIds?.length ? new Set(articleIds) : null),
    [articleIds],
  );

  const scopedArticles = useMemo(() => {
    if (!allowedArticleIds) return catalog.articles;
    return catalog.articles.filter((a) => allowedArticleIds.has(a.id));
  }, [allowedArticleIds, catalog.articles]);

  const exportCatalog = useMemo<ManeuverCatalog>(() => {
    const articleIdsForExport = new Set(scopedArticles.map((article) => article.id));
    const sectionIds = new Set(scopedArticles.map((article) => article.sectionId));
    const subsectionIds = new Set(
      scopedArticles
        .map((article) => article.subsectionId)
        .filter((id): id is string => Boolean(id)),
    );
    return {
      sections: catalog.sections.filter((section) => sectionIds.has(section.id)),
      subsections: catalog.subsections.filter(
        (subsection) => sectionIds.has(subsection.sectionId) && subsectionIds.has(subsection.id),
      ),
      articles: catalog.articles.filter((article) => articleIdsForExport.has(article.id)),
    };
  }, [catalog.articles, catalog.sections, catalog.subsections, scopedArticles]);

  const filteredArticles = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return scopedArticles;
    return scopedArticles.filter((a) => {
      const haystack = normalize(
        [a.title, a.summary ?? "", a.plainText, a.tags.join(" ")].join(" "),
      );
      return haystack.includes(term);
    });
  }, [query, scopedArticles]);

  const visibleSections = useMemo(() => {
    const sectionIds = new Set(filteredArticles.map((a) => a.sectionId));
    return catalog.sections.filter((s) => sectionIds.has(s.id));
  }, [catalog.sections, filteredArticles]);

  const primarySectionIds = useMemo(
    () => new Set(mission?.primaryManeuverSectionIds ?? []),
    [mission],
  );
  const primarySections = useMemo(
    () => visibleSections.filter((s) => primarySectionIds.has(s.id)),
    [visibleSections, primarySectionIds],
  );
  const secondarySections = useMemo(
    () => visibleSections.filter((s) => !primarySectionIds.has(s.id)),
    [visibleSections, primarySectionIds],
  );

  const selectedSection = useMemo(
    () => catalog.sections.find((s) => s.id === selectedSectionId) ?? null,
    [catalog.sections, selectedSectionId],
  );

  const selectedSectionArticles = useMemo(() => {
    if (!selectedSection) return [];
    return filteredArticles.filter((a) => a.sectionId === selectedSection.id);
  }, [filteredArticles, selectedSection]);

  const selectedSectionContent = useMemo(() => {
    if (!selectedSection) return { subsections: [], looseArticles: [] };
    const subsections = catalog.subsections
      .filter((ss) => ss.sectionId === selectedSection.id)
      .map((ss) => ({
        subsection: ss,
        articles: selectedSectionArticles.filter((a) => a.subsectionId === ss.id),
      }))
      .filter((g) => g.articles.length > 0);
    const looseArticles = selectedSectionArticles.filter((a) => !a.subsectionId);
    return { subsections, looseArticles };
  }, [catalog.subsections, selectedSection, selectedSectionArticles]);

  const sectionExercises = useMemo(() => {
    if (!selectedSection) return [];
    const ids = new Set(selectedSection.exerciseIds ?? []);
    return exercises.filter((ex) => ids.has(ex.id));
  }, [selectedSection, exercises]);

  const selectedArticle = useMemo(() => {
    if (!selectedView || selectedView === "exercises") return null;
    return scopedArticles.find((a) => a.id === selectedView) ?? null;
  }, [scopedArticles, selectedView]);

  const sectionStats = useMemo(() => {
    const map = new Map<string, { articleCount: number; exerciseCount: number }>();
    for (const section of catalog.sections) {
      const articleCount = filteredArticles.filter((a) => a.sectionId === section.id).length;
      const exerciseIds = new Set(section.exerciseIds ?? []);
      const exerciseCount = exercises.filter((ex) => exerciseIds.has(ex.id)).length;
      map.set(section.id, { articleCount, exerciseCount });
    }
    return map;
  }, [catalog.sections, filteredArticles, exercises]);

  const exercisesById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

  const missionCriteriaGroups = useMemo(() => {
    if (!mission) return [];
    const sectionIds = new Set(mission.maneuverSectionIds ?? []);
    return catalog.sections
      .filter((section) => sectionIds.has(section.id))
      .map((section) => ({
        section,
        exercises: (section.exerciseIds ?? []).map((exerciseId) => exercisesById.get(exerciseId)).filter((exercise): exercise is TrainingExercise => Boolean(exercise)),
      }))
      .filter((group) => group.exercises.length > 0);
  }, [catalog.sections, exercisesById, mission]);

  const missionDetailTabs: Array<{ id: MissionDetailTab; label: string }> = [
    { id: "manobras", label: "Manobras" },
    { id: "criterios", label: "Critérios" },
  ];

  function defaultViewForSection(sectionId: string): string {
    const section = catalog.sections.find((item) => item.id === sectionId);
    const hasExercises = (section?.exerciseIds ?? []).some((exerciseId) => exercisesById.has(exerciseId));
    if (hasExercises) return "exercises";
    return filteredArticles.find((article) => article.sectionId === sectionId)?.id ?? "";
  }

  function goToSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    setSelectedView(defaultViewForSection(sectionId));
  }

  function goToIndex() {
    setSelectedSectionId("");
    setSelectedView("");
  }

  const isInsideSection = selectedSectionId !== "";
  // mobile: show right panel when something is selected
  const isShowingContent = selectedView !== "";

  return (
    <section className={`${className} mx-auto min-w-0 space-y-4`}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-sky-400 underline-offset-4 hover:text-sky-300 hover:underline"
        >
          &larr; {backLabel}
        </button>
      ) : null}

      {/* Top bar: mission context or search */}
      {mission ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-400/80">Missão</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">{mission.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => openManeuverCatalogPdf(exportCatalog, { title: `Manobras - ${mission.name}`, brand: getPdfBrand() })}
              disabled={loading || exportCatalog.articles.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-700/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V8m0 8-3-3m3 3 3-3M5 20h14" />
              </svg>
              Baixar PDF
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-medium text-slate-300">
              {MISSION_TYPE_LABEL[mission.type]}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-medium text-slate-300">
              {formatDuration(mission.durationMinutes)}
            </span>
          </div>
          <Tabs
            items={missionDetailTabs}
            value={missionDetailTab}
            onChange={setMissionDetailTab}
            ariaLabel="Conteúdo da missão"
            accent="sky"
            className="mt-4"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-sm text-slate-500">
              {introText ??
                "Consulte procedimentos, sequências, erros comuns e referências publicadas pela escola."}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openManeuverCatalogPdf(exportCatalog, { title: "Manual de manobras", brand: getPdfBrand() })}
                disabled={loading || exportCatalog.articles.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-700/50 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V8m0 8-3-3m3 3 3-3M5 20h14" />
                </svg>
                Baixar PDF
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
              >
                Atualizar
              </button>
            </div>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar manobra, procedimento, erro comum..."
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
        </div>
      )}

      {/* Content area */}
      <AnimatedPane paneKey={`${mission?.id ?? "global"}:${missionDetailTab}:${selectedSectionId}:${selectedView}:${loading ? "loading" : "loaded"}:${error ?? "ok"}`}>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : scopedArticles.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-10 text-center">
          <p className="text-base font-medium text-slate-300">Nenhuma manobra publicada ainda.</p>
          <p className="mt-1 text-sm text-slate-500">
            Assim que o admin publicar o conteúdo, ele aparecerá aqui.
          </p>
        </div>
      ) : mission && missionDetailTab === "criterios" ? (
        <div className="space-y-3">
          {missionCriteriaGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 p-4 text-sm text-slate-400">
              Nenhum critério avaliado foi vinculado às manobras desta missão.
            </div>
          ) : (
            missionCriteriaGroups.map(({ section, exercises: sectionExercises }) => {
              const isPrimary = primarySectionIds.has(section.id);
              return (
                <div
                  key={section.id}
                  className={`rounded-2xl border p-4 ${
                    isPrimary
                      ? "border-amber-400/40 bg-amber-500/[0.07]"
                      : "border-slate-700/70 bg-slate-900/40"
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-semibold ${isPrimary ? "text-amber-200" : "text-slate-100"}`}>
                      {section.title}
                    </p>
                    {isPrimary ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        ★ Principal
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {sectionExercises.map((exercise) => (
                      <div
                        key={exercise.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-900/50 p-3"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-emerald-500 bg-emerald-500/15 text-emerald-400">
                          <IconCheckSmall />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100">{exercise.title}</p>
                          {exercise.acceptableProficiency ? (
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              {exercise.acceptableProficiency}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : !isInsideSection ? (
        /* ── Section index ────────────────────────────────────────────────────── */
        (() => {
          const renderSectionCard = (section: (typeof visibleSections)[number], isPrimary: boolean) => {
            const stats = sectionStats.get(section.id) ?? {
              articleCount: 0,
              exerciseCount: 0,
            };
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSection(section.id)}
                className={`group flex flex-col gap-2 rounded-2xl border p-5 text-left transition ${
                  isPrimary
                    ? "border-amber-400/50 bg-amber-500/[0.07] hover:border-amber-300/70 hover:bg-amber-500/[0.12]"
                    : "border-slate-700/60 bg-slate-900/40 hover:border-sky-500/40 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-base font-semibold leading-snug ${
                    isPrimary ? "text-amber-100 group-hover:text-amber-200" : "text-slate-100 group-hover:text-sky-300"
                  }`}>
                    {section.title}
                  </h3>
                  <span className={`mt-0.5 shrink-0 transition ${
                    isPrimary ? "text-amber-500/70 group-hover:text-amber-300" : "text-slate-600 group-hover:text-sky-400"
                  }`}>
                    <IconArrowRight />
                  </span>
                </div>
                {isPrimary ? (
                  <span className="w-fit rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    ★ Principal
                  </span>
                ) : null}
                {section.description ? (
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {section.description}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {stats.articleCount > 0 ? (
                    <span className="text-[11px] text-slate-600">
                      {stats.articleCount}{" "}
                      {stats.articleCount === 1 ? "manual" : "manuais"}
                    </span>
                  ) : null}
                  {stats.exerciseCount > 0 ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                      {stats.exerciseCount}{" "}
                      {stats.exerciseCount === 1 ? "critério" : "critérios"}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          };

          if (mission && primarySections.length > 0) {
            return (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-amber-300">Manobras principais</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {primarySections.map((section) => renderSectionCard(section, true))}
                  </div>
                </div>
                {secondarySections.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-400">Manobras secundárias</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {secondarySections.map((section) => renderSectionCard(section, false))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div className="space-y-3">
              {mission ? (
                <p className="text-sm font-semibold text-slate-400">O que será cobrado</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSections.map((section) => renderSectionCard(section, false))}
              </div>
            </div>
          );
        })()
      ) : (
        /* ── Two-panel layout ─────────────────────────────────────────────────── */
        <div className="flex min-h-[28rem] overflow-hidden rounded-2xl border border-slate-700/60">

          {/* ── Left panel: section header + nav list ─────────────────────────── */}
          <div
            className={`flex shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 ${
              isShowingContent
                ? "hidden w-64 md:flex lg:w-72"
                : "flex w-full md:w-64 lg:w-72"
            }`}
          >
            {/* Section title / back button */}
            <div className="p-3 border-b border-slate-800">
              <button
                type="button"
                onClick={goToIndex}
                className="group flex w-full items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2.5 text-left transition hover:border-slate-600 hover:bg-slate-800/60"
              >
                <span className="shrink-0 text-slate-500 transition group-hover:text-sky-400">
                  <IconArrowLeft />
                </span>
                <span className="flex-1 truncate text-sm font-semibold text-slate-200">
                  {selectedSection?.title}
                </span>
              </button>
            </div>

            {/* Nav list */}
            <nav className="flex-1 overflow-y-auto p-2">
              {/* Exercises nav item */}
              {sectionExercises.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedView("exercises")}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      selectedView === "exercises"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                        selectedView === "exercises"
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-slate-600 text-transparent"
                      }`}
                    >
                      <IconCheckSmall />
                    </span>
                    <span className="flex-1">Critérios avaliados</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selectedView === "exercises"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      {sectionExercises.length}
                    </span>
                  </button>
                  {selectedSectionArticles.length > 0 ? (
                    <div className="my-2 border-t border-slate-800/80" />
                  ) : null}
                </>
              ) : null}

              {/* Manuais subtitle */}
              {selectedSectionArticles.length > 0 ? (
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Manuais
                </p>
              ) : null}

              {/* Loose articles (no subsection) */}
              {selectedSectionContent.looseArticles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedView(article.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    selectedView === article.id
                      ? "bg-sky-500/10 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                  }`}
                >
                  <span className={selectedView === article.id ? "text-sky-400" : "text-slate-600"}>
                    <IconDoc />
                  </span>
                  <span className="flex-1 leading-snug">{article.title}</span>
                </button>
              ))}

              {/* Articles grouped by subsection */}
              {selectedSectionContent.subsections.map(({ subsection, articles }) => (
                <div key={subsection.id} className="mt-1">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {subsection.title}
                  </p>
                  {articles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setSelectedView(article.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        selectedView === article.id
                          ? "bg-sky-500/10 text-sky-300"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                      }`}
                    >
                      <span
                        className={selectedView === article.id ? "text-sky-400" : "text-slate-600"}
                      >
                        <IconDoc />
                      </span>
                      <span className="flex-1 leading-snug">{article.title}</span>
                    </button>
                  ))}
                </div>
              ))}

              {selectedSectionArticles.length === 0 && sectionExercises.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-600">Nenhum conteúdo nesta seção.</p>
              ) : null}
            </nav>
          </div>

          {/* ── Right panel: content ───────────────────────────────────────────── */}
          <div
            className={`min-w-0 flex-1 bg-slate-900/20 ${
              !isShowingContent ? "hidden md:block" : "block"
            }`}
          >
            {selectedView === "" ? (
              /* Desktop: nothing selected yet */
              <div className="flex h-full items-center justify-center p-8">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-400">{selectedSection?.title}</p>
                  {selectedSection?.description ? (
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-600">
                      {selectedSection.description}
                    </p>
                  ) : null}
                  <p className="mt-4 text-xs text-slate-600">
                    Selecione um item no painel à esquerda.
                  </p>
                </div>
              </div>
            ) : selectedView === "exercises" ? (
              /* ── Exercises: checklist ─────────────────────────────────────────── */
              <div className="p-5 md:p-6">
                {/* Mobile back button */}
                <button
                  type="button"
                  onClick={() => setSelectedView("")}
                  className="mb-5 flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 md:hidden"
                >
                  <IconArrowLeft />
                  Voltar
                </button>

                <div className="mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
                    {selectedSection?.title}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-slate-100">
                    Critérios avaliados
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Habilidades avaliadas durante os voos desta manobra.
                  </p>
                </div>

                <div className="space-y-2">
                  {sectionExercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-900/50 p-4"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-emerald-500 bg-emerald-500/15 text-emerald-400">
                        <IconCheckSmall />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100">{ex.title}</p>
                        {ex.acceptableProficiency ? (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {ex.acceptableProficiency}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedArticle ? (
              /* ── Article reader ───────────────────────────────────────────────── */
              <article className="p-5 md:p-6">
                {/* Mobile back button */}
                <button
                  type="button"
                  onClick={() => setSelectedView("")}
                  className="mb-5 flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 md:hidden"
                >
                  <IconArrowLeft />
                  Voltar
                </button>

                <header className="space-y-2 border-b border-slate-800 pb-4">
                  <h3 className="break-words text-xl font-semibold text-slate-100 [overflow-wrap:anywhere]">
                    {selectedArticle.title}
                  </h3>
                  {selectedArticle.summary ? (
                    <p className="text-sm text-slate-400">{selectedArticle.summary}</p>
                  ) : null}
                  {selectedArticle.tags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedArticle.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </header>

                <div className="mt-5 space-y-4 text-sm md:text-base">
                  {renderRichContent(selectedArticle.contentJson)}
                </div>
              </article>
            ) : (
              /* Article filtered out by search */
              <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-slate-600">
                  Artigo não encontrado nos resultados de busca.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      </AnimatedPane>
    </section>
  );
}
