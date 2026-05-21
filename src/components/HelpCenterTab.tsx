import { useCallback, useEffect, useMemo, useState } from "react";
import { listHelpCatalog } from "../lib/helpCenterDb";
import { renderRichContent } from "../lib/maneuverContent";
import type { HelpArticle, HelpCatalog, HelpSection } from "../types/helpCenter";
import { Skeleton } from "./ui/Skeleton";

type HelpCenterTabProps = {
  className?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function articleMatches(article: HelpArticle, term: string): boolean {
  const haystack = normalize([article.title, article.summary ?? "", article.plainText, article.tags.join(" ")].join(" "));
  return haystack.includes(term);
}

export function HelpCenterTab({ className = "w-full max-w-[96rem]" }: HelpCenterTabProps) {
  const [catalog, setCatalog] = useState<HelpCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listHelpCatalog(false);
    if (listError) {
      setError(listError.message);
      setCatalog({ sections: [], subsections: [], articles: [] });
    } else {
      setCatalog(data);
      setSelectedSectionId((current) => current || data.sections[0]?.id || "");
      setSelectedArticleId((current) => current || data.articles[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredArticles = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return catalog.articles;
    return catalog.articles.filter((article) => articleMatches(article, term));
  }, [catalog.articles, query]);

  const filteredIds = useMemo(() => new Set(filteredArticles.map((article) => article.id)), [filteredArticles]);

  const visibleSections = useMemo(() => {
    if (!query.trim()) return catalog.sections;
    const sectionIds = new Set(filteredArticles.map((article) => article.sectionId));
    return catalog.sections.filter((section) => sectionIds.has(section.id));
  }, [catalog.sections, filteredArticles, query]);

  const selectedSection = useMemo(() => {
    return catalog.sections.find((section) => section.id === selectedSectionId) ?? visibleSections[0] ?? null;
  }, [catalog.sections, selectedSectionId, visibleSections]);

  const selectedSectionArticles = useMemo(() => {
    if (!selectedSection) return [];
    return filteredArticles.filter((article) => article.sectionId === selectedSection.id);
  }, [filteredArticles, selectedSection]);

  const selectedArticle = useMemo(() => {
    const current = catalog.articles.find((article) => article.id === selectedArticleId);
    if (current && filteredIds.has(current.id) && current.sectionId === selectedSection?.id) return current;
    return selectedSectionArticles[0] ?? null;
  }, [catalog.articles, filteredIds, selectedArticleId, selectedSection?.id, selectedSectionArticles]);

  const selectedSubsection = useMemo(() => {
    if (!selectedArticle?.subsectionId) return null;
    return catalog.subsections.find((subsection) => subsection.id === selectedArticle.subsectionId) ?? null;
  }, [catalog.subsections, selectedArticle]);

  const sectionGroups = useMemo(() => {
    return visibleSections.map((section) => {
      const sectionArticles = filteredArticles.filter((article) => article.sectionId === section.id);
      const subsections = catalog.subsections
        .filter((subsection) => subsection.sectionId === section.id)
        .map((subsection) => ({
          subsection,
          articles: sectionArticles.filter((article) => article.subsectionId === subsection.id),
        }))
        .filter((group) => group.articles.length > 0);
      const looseArticles = sectionArticles.filter((article) => !article.subsectionId);
      return { section, subsections, looseArticles, articleCount: sectionArticles.length };
    }).filter((group) => group.articleCount > 0 || !query.trim());
  }, [catalog.subsections, filteredArticles, query, visibleSections]);

  function selectSection(section: HelpSection) {
    setSelectedSectionId(section.id);
    const firstArticle = filteredArticles.find((article) => article.sectionId === section.id);
    setSelectedArticleId(firstArticle?.id ?? "");
  }

  function selectArticle(article: HelpArticle) {
    setSelectedSectionId(article.sectionId);
    setSelectedArticleId(article.id);
  }

  return (
    <section className={`${className} mx-auto min-w-0 space-y-5`}>
      <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50">
        <div className="border-b border-slate-800 bg-slate-900 px-4 py-6 text-center md:px-8 md:py-8">
          <div className="mx-auto max-w-3xl">
            <label className="sr-only" htmlFor="help-search">Buscar artigos de ajuda</label>
            <input
              id="help-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Busque por senha, agendamento, voos, créditos..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100 shadow-lg shadow-slate-950/30 outline-none transition focus:border-cyan-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 p-4 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">{error}</div>
        ) : catalog.articles.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-base font-medium text-slate-300">Nenhum artigo publicado ainda.</p>
            <p className="mt-1 text-sm text-slate-500">Quando a escola publicar conteúdos de ajuda, eles aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[22rem_1fr]">
            <aside className="border-b border-slate-800 p-4 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {sectionGroups.length ? sectionGroups.map(({ section, articleCount }) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => selectSection(section)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selectedSection?.id === section.id
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-slate-700/60 bg-slate-950/30 hover:border-slate-600 hover:bg-slate-900"
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300">Seção</span>
                    <h3 className="mt-1 break-words text-base font-semibold text-slate-100 [overflow-wrap:anywhere]">{section.title}</h3>
                    {section.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{section.description}</p> : null}
                    <p className="mt-3 text-xs text-slate-500">{articleCount} artigo{articleCount === 1 ? "" : "s"}</p>
                  </button>
                )) : (
                  <p className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 text-sm text-slate-500">Nenhum resultado para sua busca.</p>
                )}
              </div>
            </aside>

            <div className="grid min-w-0 gap-0 xl:grid-cols-[18rem_1fr]">
              <aside className="border-b border-slate-800 p-4 xl:max-h-[calc(100vh-15rem)] xl:overflow-y-auto xl:border-b-0 xl:border-r">
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Nesta seção</p>
                <h3 className="mt-1 break-words text-base font-semibold text-slate-100 [overflow-wrap:anywhere]">{selectedSection?.title ?? "Selecione uma seção"}</h3>
                <div className="mt-4 space-y-4">
                  {sectionGroups.find((group) => group.section.id === selectedSection?.id)?.looseArticles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => selectArticle(article)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        selectedArticle?.id === article.id ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {article.title}
                    </button>
                  ))}
                  {sectionGroups.find((group) => group.section.id === selectedSection?.id)?.subsections.map(({ subsection, articles }) => (
                    <div key={subsection.id}>
                      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{subsection.title}</p>
                      {articles.map((article) => (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() => selectArticle(article)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                            selectedArticle?.id === article.id ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {article.title}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </aside>

              <article className="min-w-0 p-4 md:p-6">
                {selectedArticle ? (
                  <div className="mx-auto max-w-3xl space-y-5">
                    <header className="space-y-3 border-b border-slate-800 pb-5">
                      <p className="break-words text-xs font-medium text-slate-500 [overflow-wrap:anywhere]">
                        Central de ajuda / {selectedSection?.title ?? "Seção"}{selectedSubsection ? ` / ${selectedSubsection.title}` : ""}
                      </p>
                      <h1 className="break-words text-2xl font-semibold text-slate-50 [overflow-wrap:anywhere] md:text-3xl">{selectedArticle.title}</h1>
                      {selectedArticle.summary ? <p className="text-base leading-relaxed text-slate-400">{selectedArticle.summary}</p> : null}
                      {selectedArticle.tags.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedArticle.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-400">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                    </header>
                    <div className="space-y-4 text-sm md:text-base">{renderRichContent(selectedArticle.contentJson)}</div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Selecione um artigo para leitura.</p>
                )}
              </article>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
