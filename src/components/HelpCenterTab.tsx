import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { findHighlightRange } from "../lib/adminSearchIndex";
import { listHelpCatalog } from "../lib/helpCenterDb";
import { safeRenderRichContent } from "../lib/maneuverContent";
import type { HelpArticle, HelpCatalog, HelpCenterAudience, HelpSection } from "../types/helpCenter";
import { Skeleton } from "./ui/Skeleton";

type HelpCenterTabProps = {
  className?: string;
  audience?: HelpCenterAudience;
};

type SearchHit = {
  article: HelpArticle;
  sectionTitle: string;
  score: number;
  excerpt: string;
};

type SectionGroup = {
  section: HelpSection;
  articles: HelpArticle[];
  articleCount: number;
};

const AUDIENCE_COPY: Record<HelpCenterAudience, { breadcrumb: string; searchPlaceholder: string; homeTitle: string }> = {
  student: {
    breadcrumb: "Central de ajuda",
    searchPlaceholder: "Busque por senha, agendamento, voos, créditos...",
    homeTitle: "Como podemos ajudar?",
  },
  instructor: {
    breadcrumb: "Manual do instrutor",
    searchPlaceholder: "Busque por rotina, briefing, agendamento, comissão...",
    homeTitle: "Guia operacional",
  },
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenizeQuery(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildSearchExcerpt(text: string, query: string, maxLen = 180): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const range = findHighlightRange(cleaned, query);
  if (!range) {
    return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
  }
  const padding = 70;
  const start = Math.max(0, range.start - padding);
  const end = Math.min(cleaned.length, range.end + padding);
  let excerpt = cleaned.slice(start, end).trim();
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < cleaned.length) excerpt = `${excerpt}…`;
  return excerpt;
}

function scoreArticle(article: HelpArticle, term: string, tokens: string[]): number {
  const title = normalize(article.title);
  const summary = normalize(article.summary ?? "");
  const plain = normalize(article.plainText);
  const tags = normalize(article.tags.join(" "));
  let score = 0;
  if (title.includes(term)) score += 120;
  if (summary.includes(term)) score += 60;
  if (plain.includes(term)) score += 40;
  if (tags.includes(term)) score += 30;
  for (const token of tokens) {
    if (title.includes(token)) score += 35;
    if (summary.includes(token)) score += 20;
    if (plain.includes(token)) score += 12;
    if (tags.includes(token)) score += 8;
  }
  return score;
}

function articleMatches(article: HelpArticle, term: string, tokens: string[]): boolean {
  if (!term) return true;
  const haystack = normalize([article.title, article.summary ?? "", article.plainText, article.tags.join(" ")].join(" "));
  if (haystack.includes(term)) return true;
  return tokens.some((token) => haystack.includes(token));
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const range = useMemo(() => findHighlightRange(text, query), [text, query]);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range.start)}
      <mark className="bg-transparent font-semibold text-cyan-400">{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </>
  );
}

function SearchField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative mx-auto max-w-3xl">
      <label className="sr-only" htmlFor={id}>
        Buscar artigos de ajuda
      </label>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-950/80 py-1.5 pl-9 pr-4 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
      />
    </div>
  );
}

function SectionCard({
  section,
  articleCount,
  active,
  showSectionLabel,
  onClick,
}: {
  section: HelpSection;
  articleCount: number;
  active?: boolean;
  showSectionLabel?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-cyan-500/50 bg-cyan-500/10"
          : "border-slate-700/60 bg-slate-950/30 hover:border-slate-600 hover:bg-slate-900"
      }`}
    >
      {showSectionLabel ? (
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300">Seção</span>
      ) : null}
      <h3 className={`break-words text-base font-semibold text-slate-100 [overflow-wrap:anywhere] ${showSectionLabel ? "mt-1" : ""}`}>
        {section.title}
      </h3>
      {section.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{section.description}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        {articleCount} artigo{articleCount === 1 ? "" : "s"}
      </p>
    </button>
  );
}

export function HelpCenterTab({ className = "w-full max-w-[96rem]", audience = "student" }: HelpCenterTabProps) {
  const copy = AUDIENCE_COPY[audience];
  const [catalog, setCatalog] = useState<HelpCatalog>({ sections: [], subsections: [], articles: [] });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const showHome = !selectedSectionId && !isSearching;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listHelpCatalog(false, audience);
    if (listError) {
      setError(listError.message);
      setCatalog({ sections: [], subsections: [], articles: [] });
    } else {
      setCatalog(data);
    }
    setLoading(false);
  }, [audience]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchTokens = useMemo(() => tokenizeQuery(trimmedQuery), [trimmedQuery]);
  const normalizedTerm = useMemo(() => normalize(trimmedQuery), [trimmedQuery]);

  const sectionById = useMemo(() => {
    const map = new Map<string, HelpSection>();
    for (const section of catalog.sections) map.set(section.id, section);
    return map;
  }, [catalog.sections]);

  const articlesBySection = useMemo(() => {
    const map = new Map<string, HelpArticle[]>();
    for (const section of catalog.sections) {
      map.set(
        section.id,
        catalog.articles.filter((article) => article.sectionId === section.id),
      );
    }
    return map;
  }, [catalog.articles, catalog.sections]);

  const searchHits = useMemo((): SearchHit[] => {
    if (!isSearching) return [];
    return catalog.articles
      .filter((article) => articleMatches(article, normalizedTerm, searchTokens))
      .map((article) => {
        const section = sectionById.get(article.sectionId);
        const excerptSource = article.summary?.trim() || article.plainText;
        return {
          article,
          sectionTitle: section?.title ?? "Seção",
          score: scoreArticle(article, normalizedTerm, searchTokens),
          excerpt: buildSearchExcerpt(excerptSource, trimmedQuery),
        };
      })
      .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "pt-BR"));
  }, [catalog.articles, isSearching, normalizedTerm, searchTokens, sectionById, trimmedQuery]);

  const filteredArticles = useMemo(() => {
    if (!isSearching) return catalog.articles;
    return searchHits.map((hit) => hit.article);
  }, [catalog.articles, isSearching, searchHits]);

  const filteredIds = useMemo(() => new Set(filteredArticles.map((article) => article.id)), [filteredArticles]);

  const visibleSections = useMemo(() => {
    if (!isSearching) return catalog.sections;
    const sectionIds = new Set(filteredArticles.map((article) => article.sectionId));
    return catalog.sections.filter((section) => sectionIds.has(section.id));
  }, [catalog.sections, filteredArticles, isSearching]);

  const sectionGroups = useMemo((): SectionGroup[] => {
    return visibleSections
      .map((section) => {
        const articles = filteredArticles.filter((article) => article.sectionId === section.id);
        return { section, articles, articleCount: articles.length };
      })
      .filter((group) => group.articleCount > 0 || !isSearching);
  }, [filteredArticles, isSearching, visibleSections]);

  const homeSectionGroups = useMemo((): SectionGroup[] => {
    return catalog.sections.map((section) => {
      const articles = articlesBySection.get(section.id) ?? [];
      return { section, articles, articleCount: articles.length };
    });
  }, [articlesBySection, catalog.sections]);

  const selectedSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return catalog.sections.find((section) => section.id === selectedSectionId) ?? null;
  }, [catalog.sections, selectedSectionId]);

  const selectedArticle = useMemo(() => {
    const current = selectedArticleId ? catalog.articles.find((article) => article.id === selectedArticleId) : null;
    if (isSearching) {
      if (current && filteredIds.has(current.id)) return current;
      return searchHits.find((hit) => hit.article.id === selectedArticleId)?.article ?? searchHits[0]?.article ?? null;
    }
    if (current && (!selectedSection || current.sectionId === selectedSection.id)) return current;
    if (selectedSection) {
      return catalog.articles.find((article) => article.sectionId === selectedSection.id) ?? null;
    }
    return null;
  }, [catalog.articles, filteredIds, isSearching, searchHits, selectedArticleId, selectedSection]);

  const activeSectionGroup = useMemo(() => {
    return sectionGroups.find((group) => group.section.id === selectedSection?.id) ?? null;
  }, [sectionGroups, selectedSection?.id]);

  function firstArticleInSection(sectionId: string): string {
    return catalog.articles.find((article) => article.sectionId === sectionId)?.id ?? "";
  }

  function enterSection(section: HelpSection, options?: { keepArticle?: boolean; articleId?: string }) {
    setSelectedSectionId(section.id);
    if (options?.articleId) {
      setSelectedArticleId(options.articleId);
      return;
    }
    if (options?.keepArticle && selectedArticleId) {
      const current = catalog.articles.find((article) => article.id === selectedArticleId);
      if (current?.sectionId === section.id) return;
    }
    const firstArticle =
      filteredArticles.find((article) => article.sectionId === section.id) ??
      catalog.articles.find((article) => article.sectionId === section.id);
    setSelectedArticleId(firstArticle?.id ?? "");
  }

  function goToSection(sectionId: string) {
    setQuery("");
    setSelectedSectionId(sectionId);
    setSelectedArticleId(firstArticleInSection(sectionId));
  }

  function goHome() {
    setQuery("");
    setSelectedSectionId("");
    setSelectedArticleId("");
  }

  function selectSection(section: HelpSection) {
    enterSection(section);
  }

  function selectArticle(article: HelpArticle) {
    setSelectedSectionId(article.sectionId);
    setSelectedArticleId(article.id);
  }

  const articleBody = selectedArticle ? (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-3 border-b border-slate-800 pb-5">
        <nav aria-label="Navegação do artigo" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-slate-500">
          <button type="button" onClick={goHome} className="hover:text-cyan-400 hover:underline">
            {copy.breadcrumb}
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            onClick={() => goToSection(selectedArticle.sectionId)}
            className="text-cyan-400 hover:text-cyan-300 hover:underline"
          >
            {sectionById.get(selectedArticle.sectionId)?.title ?? "Seção"}
          </button>
        </nav>
        <h1 className="break-words text-xl font-semibold text-slate-50 [overflow-wrap:anywhere]">{selectedArticle.title}</h1>
        {selectedArticle.summary ? <p className="text-sm leading-relaxed text-slate-400">{selectedArticle.summary}</p> : null}
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
      <div className="help-article-prose space-y-4 text-sm text-slate-300 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:text-sm [&_p]:text-sm [&_table]:text-sm">
        {safeRenderRichContent(selectedArticle.contentJson)}
      </div>
    </div>
  ) : (
    <p className="text-sm text-slate-500">Selecione um artigo para leitura.</p>
  );

  const searchResultsPanel = (
    <div className="border-b border-slate-800 p-4 lg:border-b-0">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {searchHits.length} resultado{searchHits.length === 1 ? "" : "s"}
      </p>
      {searchHits.length ? (
        <div className="space-y-1">
          {searchHits.map(({ article, sectionTitle, excerpt }) => {
            const active = selectedArticle?.id === article.id;
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => selectArticle(article)}
                className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                    <Highlighted text={article.title} query={trimmedQuery} />
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{sectionTitle}</span>
                </span>
                {excerpt ? (
                  <span className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                    <Highlighted text={excerpt} query={trimmedQuery} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg px-3 py-4 text-sm text-slate-500">Nenhum resultado para “{trimmedQuery}”.</p>
      )}
    </div>
  );

  let bodyContent: ReactNode = null;

  if (loading) {
    bodyContent = (
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  } else if (error) {
    bodyContent = <div className="m-4 rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">{error}</div>;
  } else if (catalog.sections.length === 0 && catalog.articles.length === 0) {
    bodyContent = (
      <div className="p-10 text-center">
        <p className="text-base font-medium text-slate-300">Nenhum artigo publicado ainda.</p>
        <p className="mt-1 text-sm text-slate-500">Quando a escola publicar conteúdos de ajuda, eles aparecerão aqui.</p>
      </div>
    );
  } else if (showHome) {
    bodyContent = (
      <div className="p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-100">{copy.homeTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">Escolha uma seção ou use a busca acima para encontrar um artigo.</p>
          </div>
          {homeSectionGroups.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {homeSectionGroups.map(({ section, articleCount }) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  articleCount={articleCount}
                  onClick={() => selectSection(section)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
              Nenhuma seção publicada ainda.
            </p>
          )}
          {catalog.articles.length > 0 && homeSectionGroups.every((group) => group.articleCount === 0) ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4 text-sm text-amber-200">
              Existem artigos publicados, mas nenhum está vinculado a uma seção visível. Peça ao administrador para revisar o cadastro.
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (isSearching) {
    bodyContent = (
      <div className="grid min-w-0 gap-0 lg:grid-cols-[min(100%,22rem)_1fr]">
        <aside className="border-b border-slate-800 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {searchResultsPanel}
        </aside>
        <article className="min-w-0 p-4 md:p-6">{articleBody}</article>
      </div>
    );
  } else {
    bodyContent = (
      <div className="grid gap-0 lg:grid-cols-[22rem_1fr]">
        <aside className="border-b border-slate-800 p-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <button
            type="button"
            onClick={goHome}
            className="mb-4 flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
          >
            ← Todas as seções
          </button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {sectionGroups.length ? (
              sectionGroups.map(({ section, articleCount }) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  articleCount={articleCount}
                  active={selectedSection?.id === section.id}
                  showSectionLabel={audience !== "instructor"}
                  onClick={() => selectSection(section)}
                />
              ))
            ) : (
              <p className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 text-sm text-slate-500">Nenhum resultado para sua busca.</p>
            )}
          </div>
        </aside>

        <div className="grid min-w-0 gap-0 xl:grid-cols-[18rem_1fr]">
          <aside className="border-b border-slate-800 p-4 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:border-b-0 xl:border-r">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Nesta seção</p>
            <h3 className="mt-1 break-words text-base font-semibold text-slate-100 [overflow-wrap:anywhere]">
              {selectedSection?.title ?? "Selecione uma seção"}
            </h3>
            <div className="mt-4 space-y-1">
              {activeSectionGroup?.articles.map((article) => (
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
          </aside>

          <article className="min-w-0 p-4 md:p-6">{articleBody}</article>
        </div>
      </div>
    );
  }

  return (
    <section className={`${className} mx-auto min-w-0 space-y-5`}>
      <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50">
        <div className="border-b border-slate-800 px-4 py-3 md:px-5">
          <SearchField id="help-search" value={query} placeholder={copy.searchPlaceholder} onChange={setQuery} />
        </div>
        {bodyContent}
      </div>
    </section>
  );
}
