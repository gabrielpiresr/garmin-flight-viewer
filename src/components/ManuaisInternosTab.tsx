import { useEffect, useState } from "react";
import {
  getManualInternoDownloadUrl,
  getManualInternoViewUrl,
  listManuaisInternos,
  type ManualInterno,
} from "../lib/manuaisInternosDb";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileIconProps = { mime: string | null; size?: "sm" | "md"; isExternalLink?: boolean };

function FileIcon({ mime, size = "md", isExternalLink }: FileIconProps) {
  const m = (mime ?? "").toLowerCase();
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-xs";

  if (isExternalLink)
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-sky-500/15 font-bold text-sky-400 ${dim}`}>URL</span>;
  if (m.includes("pdf"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-red-500/15 font-bold text-red-400 ${dim}`}>PDF</span>;
  if (m.includes("word") || m.includes("document"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-blue-500/15 font-bold text-blue-400 ${dim}`}>DOC</span>;
  if (m.includes("sheet") || m.includes("excel"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 font-bold text-emerald-400 ${dim}`}>XLS</span>;
  if (m.includes("presentation") || m.includes("powerpoint"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-orange-500/15 font-bold text-orange-400 ${dim}`}>PPT</span>;
  if (m.includes("image"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-purple-500/15 font-bold text-purple-400 ${dim}`}>IMG</span>;
  if (m.includes("zip") || m.includes("rar"))
    return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-yellow-500/15 font-bold text-yellow-400 ${dim}`}>ZIP</span>;
  return <span className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-700/60 font-bold text-slate-400 ${dim}`}>ARQ</span>;
}

function groupByCategory(manuals: ManualInterno[]): Map<string, ManualInterno[]> {
  const map = new Map<string, ManualInterno[]>();
  for (const m of manuals) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return map;
}

function canPreviewInline(mime: string | null): boolean {
  const m = (mime ?? "").toLowerCase();
  return m.includes("pdf") || m.includes("image");
}

function ManualPreviewModal({ manual, onClose }: { manual: ManualInterno; onClose: () => void }) {
  const viewUrl = getManualInternoViewUrl(manual.fileId);
  const downloadUrl = getManualInternoDownloadUrl(manual.fileId);
  const mime = (manual.mimeType ?? "").toLowerCase();
  const isPdf = mime.includes("pdf");
  const isImage = mime.includes("image");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-interno-preview-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p id="manual-interno-preview-title" className="truncate text-sm font-semibold text-slate-100">
              {manual.name}
            </p>
            {manual.fileSize ? (
              <p className="text-xs text-slate-500">{formatBytes(manual.fileSize)}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={manual.originalName}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Baixar
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-2">
          {!viewUrl ? (
            <p className="p-6 text-center text-sm text-slate-500">Visualização indisponível.</p>
          ) : isPdf ? (
            <iframe
              title={manual.name}
              src={viewUrl}
              className="h-[min(78vh,720px)] w-full rounded-lg border border-slate-800 bg-white"
            />
          ) : isImage ? (
            <img
              src={viewUrl}
              alt={manual.name}
              className="mx-auto max-h-[min(78vh,720px)] w-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-slate-400">Este formato não pode ser exibido aqui.</p>
              {viewUrl ? (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Abrir em nova aba
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function ManuaisInternosTab() {
  const [manuals, setManuals] = useState<ManualInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [previewManual, setPreviewManual] = useState<ManualInterno | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listManuaisInternos().then(({ data, error: err }) => {
      if (cancelled) return;
      setLoading(false);
      if (err) {
        setError("Não foi possível carregar os manuais internos.");
        return;
      }
      setManuals(data ?? []);
      setExpandedCategories(new Set([...new Set((data ?? []).map((m) => m.category))]));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const filtered = search.trim()
    ? manuals.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.category.toLowerCase().includes(search.toLowerCase()),
      )
    : manuals;

  const categories = [...new Set(filtered.map((m) => m.category))].sort();
  const grouped = groupByCategory(filtered);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-800/60" />
        ))}
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

  return (
    <div className="space-y-4">
      {manuals.length > 0 && (
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar manuais internos…"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
          />
        </div>
      )}

      {manuals.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-10 w-10 text-slate-700">
            <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
          </svg>
          <p className="text-sm font-medium text-slate-400">Nenhum material disponível</p>
          <p className="mt-1 text-xs text-slate-600">Os materiais internos aparecerão aqui quando forem publicados.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-8 text-center">
          <p className="text-sm text-slate-400">Nenhum resultado para "{search}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const items = grouped.get(cat) ?? [];
            const isOpen = expandedCategories.has(cat);
            return (
              <div key={cat} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-500">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-200">{cat}</span>
                    <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      {items.length}
                    </span>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {isOpen && (
                  <div className="divide-y divide-slate-800/50 border-t border-slate-800/60">
                    {items.map((m) => {
                      const isLink = !!m.externalUrl;
                      const downloadUrl = isLink ? null : getManualInternoDownloadUrl(m.fileId);
                      const viewUrl = isLink ? null : getManualInternoViewUrl(m.fileId);
                      const previewable = Boolean(viewUrl && canPreviewInline(m.mimeType));
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-slate-800/30 sm:flex-nowrap"
                        >
                          <FileIcon mime={m.mimeType} size="sm" isExternalLink={isLink} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">{m.name}</p>
                            {isLink ? (
                              <p className="truncate text-xs text-slate-500">{m.externalUrl}</p>
                            ) : m.fileSize ? (
                              <p className="text-xs text-slate-500">{formatBytes(m.fileSize)}</p>
                            ) : null}
                          </div>
                          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:ml-auto sm:w-auto">
                            {isLink ? (
                              <a
                                href={m.externalUrl!}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300 sm:flex-none"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                  <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v4.5c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 018.75 13h-4.5A2.25 2.25 0 012 10.75v-4.5A2.25 2.25 0 014.25 4h2a.75.75 0 010 1.5h-2z" clipRule="evenodd" />
                                  <path fillRule="evenodd" d="M6.194 9.003a.75.75 0 001.06.053L12.5 4.44v2.31a.75.75 0 001.5 0v-4a.75.75 0 00-.75-.75h-4a.75.75 0 000 1.5h2.053l-4.056 3.694a.75.75 0 00-.053 1.01z" clipRule="evenodd" />
                                </svg>
                                Abrir link
                              </a>
                            ) : (
                              <>
                                {previewable ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewManual(m)}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300 sm:flex-none"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                      <path d="M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM7.25 6a.75.75 0 011.5 0v2.69l1.22 1.22a.75.75 0 11-1.06 1.06l-1.5-1.5a.75.75 0 01-.16-.78V6z" />
                                    </svg>
                                    Visualizar
                                  </button>
                                ) : viewUrl ? (
                                  <a
                                    href={viewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300 sm:flex-none"
                                  >
                                    Abrir
                                  </a>
                                ) : null}
                                {downloadUrl ? (
                                  <a
                                    href={downloadUrl}
                                    download={m.originalName}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300 sm:flex-none"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                      <path d="M8.75 2.75a.75.75 0 00-1.5 0v5.69L5.03 6.22a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l3.5-3.5a.75.75 0 00-1.06-1.06L8.75 8.44V2.75z" />
                                      <path d="M3.5 9.75a.75.75 0 00-1.5 0v1.5A2.75 2.75 0 004.75 14h6.5A2.75 2.75 0 0014 11.25v-1.5a.75.75 0 00-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5z" />
                                    </svg>
                                    Baixar
                                  </a>
                                ) : (
                                  <span className="rounded-xl border border-slate-800 px-3 py-1.5 text-xs text-slate-600">
                                    Indisponível
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewManual ? <ManualPreviewModal manual={previewManual} onClose={() => setPreviewManual(null)} /> : null}
    </div>
  );
}
