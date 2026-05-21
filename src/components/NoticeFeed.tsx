import { useCallback, useEffect, useMemo, useState } from "react";
import { renderMarkdownBlocks } from "../lib/markdown";
import { listPublishedNotices } from "../lib/noticesDb";
import type { Notice } from "../types/notice";
import { Skeleton } from "./ui/Skeleton";

function formatPublishedAt(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

type NoticeFeedProps = {
  className?: string;
  limit?: number;
  eyebrow?: string;
  title?: string;
  showHeader?: boolean;
  emptyMessage?: string;
  showRefresh?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export function NoticeFeed({
  className = "w-full lg:w-1/2",
  limit,
  eyebrow = "Comunicados",
  title = "Feed de avisos",
  showHeader = true,
  emptyMessage = "Nenhum aviso publicado no momento.",
  showRefresh = true,
  actionLabel,
  onAction,
}: NoticeFeedProps) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listPublishedNotices();
    if (listError) {
      setError(listError.message);
      setItems([]);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    if (typeof limit !== "number" || limit <= 0) return items;
    return items.slice(0, limit);
  }, [items, limit]);

  return (
    <section className={`${className} min-w-0`}>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
        <div
          className={`flex flex-col items-stretch gap-3 sm:flex-row sm:items-center ${
            showHeader ? "mb-4 sm:justify-between" : "mb-3 justify-end"
          }`}
        >
          {showHeader ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">{eyebrow}</p>
              <h2 className="break-words text-lg font-semibold text-white">{title}</h2>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className="flex-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 sm:flex-none"
              >
                {actionLabel}
              </button>
            ) : null}
            {showRefresh ? (
              <button
                type="button"
                onClick={() => void load()}
                className="flex-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 sm:flex-none"
              >
                Atualizar
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/30">
                <Skeleton className="h-40 w-full rounded-none" />
                <div className="space-y-3 p-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((notice) => (
              <article key={notice.id} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/30">
                {notice.bannerUrl ? (
                  <img src={notice.bannerUrl} alt={notice.title} className="h-40 w-full object-cover" />
                ) : null}
                <div className="space-y-3 p-4">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-slate-100 [overflow-wrap:anywhere]">{notice.title}</h3>
                    <p className="text-xs text-slate-500">{formatPublishedAt(notice.publishedAt)}</p>
                  </div>

                  <div className="space-y-2 text-sm">{renderMarkdownBlocks(notice.contentMd)}</div>

                  {notice.ctaLabel && notice.ctaUrl ? (
                    <a
                      href={notice.ctaUrl}
                      target={isExternalUrl(notice.ctaUrl) ? "_blank" : undefined}
                      rel={isExternalUrl(notice.ctaUrl) ? "noreferrer" : undefined}
                      className="inline-flex rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                    >
                      {notice.ctaLabel}
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
