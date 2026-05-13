import { useCallback, useEffect, useMemo, useState } from "react";
import { listManeuverCatalog } from "../lib/maneuversDb";
import { renderRichContent } from "../lib/maneuverContent";
import type { ManeuverCatalog } from "../types/maneuver";
import { Skeleton } from "./ui/Skeleton";

type ManobrasTabProps = {
  className?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ManobrasTab({ className = "w-full max-w-[96rem]" }: ManobrasTabProps) {
  const [catalog, setCatalog] = useState<ManeuverCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listManeuverCatalog(false);
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
    return catalog.articles.filter((article) => {
      const haystack = normalize([
        article.title,
        article.summary ?? "",
        article.plainText,
        article.tags.join(" "),
      ].join(" "));
      return haystack.includes(term);
    });
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

  const selectedSectionContent = useMemo(() => {
    if (!selectedSection) return { subsections: [], looseArticles: [] };
    const subsections = catalog.subsections
      .filter((subsection) => subsection.sectionId === selectedSection.id)
      .map((subsection) => ({
        subsection,
        articles: selectedSectionArticles.filter((article) => article.subsectionId === subsection.id),
      }))
      .filter((group) => group.articles.length > 0);
    const looseArticles = selectedSectionArticles.filter((article) => !article.subsectionId);
    return { subsections, looseArticles };
  }, [catalog.subsections, selectedSection, selectedSectionArticles]);

  function selectSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    const firstArticle = filteredArticles.find((article) => article.sectionId === sectionId);
    setSelectedArticleId(firstArticle?.id ?? "");
  }

  return (
    <section className={`${className} mx-auto min-w-0 space-y-4`}>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Curso de manobras</p>
            <h2 className="text-xl font-semibold text-white">Material de estudo</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Consulte procedimentos, sequências, erros comuns e referências publicadas pela escola.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
          >
            Atualizar
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por manobra, procedimento, erro comum..."
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : catalog.articles.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-10 text-center">
          <p className="text-base font-medium text-slate-300">Nenhuma manobra publicada ainda.</p>
          <p className="mt-1 text-sm text-slate-500">Assim que o admin publicar o conteúdo, ele aparecerá aqui.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr]">
          <aside className="max-h-[calc(100vh-13rem)] overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900/40 p-2">
            {visibleSections.length ? visibleSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={`block w-full border-b border-slate-800/80 px-3 py-3 text-left text-sm transition last:border-b-0 ${
                  selectedSection?.id === section.id
                    ? "rounded-xl border-b-transparent bg-emerald-500/10 text-emerald-100"
                    : "text-slate-300 hover:rounded-xl hover:bg-slate-800/70"
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Seção {section.order}
                </span>
                <span className="mt-0.5 block font-medium leading-snug">{section.title}</span>
              </button>
            )) : (
              <p className="p-4 text-sm text-slate-500">Nenhum resultado para sua busca.</p>
            )}
          </aside>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_1fr]">
            <aside className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-3">
              <p className="px-2 text-xs font-semibold uppercase tracking-widest text-sky-400/80">Nesta seção</p>
              <h3 className="mt-1 px-2 text-base font-semibold text-white">{selectedSection?.title ?? "Selecione uma seção"}</h3>
              <div className="mt-4 space-y-3">
                {selectedSectionContent.looseArticles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setSelectedArticleId(article.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selectedArticle?.id === article.id ? "bg-sky-500/10 text-sky-100" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {article.title}
                  </button>
                ))}
                {selectedSectionContent.subsections.map(({ subsection, articles }) => (
                  <div key={subsection.id}>
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{subsection.title}</p>
                    {articles.map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => setSelectedArticleId(article.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          selectedArticle?.id === article.id ? "bg-sky-500/10 text-sky-100" : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </aside>

            <article className="min-w-0 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-6">
              {selectedArticle ? (
                <div className="space-y-5">
                  <header className="space-y-2 border-b border-slate-800 pb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">
                      Material de estudo
                    </p>
                    <h3 className="break-words text-2xl font-semibold text-white [overflow-wrap:anywhere]">{selectedArticle.title}</h3>
                    {selectedArticle.summary ? <p className="text-sm text-slate-400">{selectedArticle.summary}</p> : null}
                    {selectedArticle.tags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedArticle.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-400">
                            {tag}
                          </span>
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
    </section>
  );
}
