import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { useAuth } from "../contexts/AuthContext";
import {
  listUserMediaAlbum,
  type AlbumMediaItem,
} from "../lib/mediaAlbumDb";
import {
  isGoproFlightVideo,
  resolveGoproVideoPlayback,
} from "../lib/goproDb";
import { openFlightFromAlbum } from "../lib/pendingFlightOpen";
import {
  deriveThumbUrl,
  getDownscaledPreviewUrl,
  getLightboxPreviewUrl,
  probeImageUrl,
} from "../lib/photoThumbnails";
import type { UserRole } from "../lib/rbac";
import { downloadVideoFile } from "../lib/videoDownload";
import { Skeleton } from "./ui/Skeleton";

type MediaFilter = "all" | "photo" | "video";

const LIGHTBOX_SWIPE_THRESHOLD_PX = 56;
const MEDIA_VIEWER_HISTORY_KEY = "mediaAlbumViewer";
const BATCH_SIZE = 48;
const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10] as const;
const GOPRO_HIGH_QUALITY_MAX_HEIGHT = 1080;
const GOPRO_FAST_PLAYBACK_MAX_HEIGHT = 720;

const lightboxPreviewByPhotoId = new Map<string, string>();

function preloadImageUrl(url: string | undefined | null): void {
  const src = String(url || "").trim();
  if (!src || typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

function formatDuration(sec: number | null | undefined): string {
  const value = Number(sec ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPlaybackRate(rate: number): string {
  return rate === 1 ? "1×" : `${rate}×`;
}

function formatTimecode(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function videoRotationStyle(rotationDeg: number): CSSProperties | undefined {
  const rot = ((rotationDeg % 360) + 360) % 360;
  if (!rot) return undefined;
  return { transform: `rotate(${rot}deg)`, transformOrigin: "center center" };
}

function dayKey(iso: string): string {
  const raw = (iso || "").trim();
  if (!raw) return "sem-data";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "sem-data";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeading(key: string): string {
  if (key === "sem-data") return "Sem data";
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = dayKey(yesterday.toISOString());
  if (key === todayKey) return "Hoje";
  if (key === yesterdayKey) return "Ontem";

  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, d || 1);
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatMonthLabel(key: string): string {
  if (key === "sem-data") return "";
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function itemIsGopro(item: AlbumMediaItem): boolean {
  return Boolean(item.video && isGoproFlightVideo(item.video));
}

function itemCanDownload(item: AlbumMediaItem): boolean {
  if (item.kind === "photo") return Boolean(item.fileUrl);
  return Boolean(item.fileUrl) && !itemIsGopro(item);
}

async function downloadPhoto(item: AlbumMediaItem): Promise<void> {
  const photo = item.photo;
  const url = photo?.download_url || item.downloadUrl || item.fileUrl;
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao baixar.");
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = item.fileName || "foto-do-voo.jpg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function downloadAlbumItem(item: AlbumMediaItem): Promise<void> {
  if (!itemCanDownload(item)) return;
  if (item.kind === "photo") {
    await downloadPhoto(item);
    return;
  }
  await downloadVideoFile(item.fileUrl);
}

function pickGoproHlsLevel(levels: Array<{ height?: number }>, maxHeight: number): number {
  return levels.reduce((bestIndex, level, index) => {
    if (!level.height || level.height > maxHeight) return bestIndex;
    if (bestIndex < 0) return index;
    return level.height > (levels[bestIndex]?.height || 0) ? index : bestIndex;
  }, -1);
}

function pinGoproHlsLevel(hls: Hls, maxHeight: number) {
  const cappedLevel = pickGoproHlsLevel(hls.levels, maxHeight);
  if (cappedLevel < 0) {
    hls.autoLevelCapping = -1;
    return;
  }
  hls.autoLevelCapping = cappedLevel;
  hls.currentLevel = cappedLevel;
  hls.loadLevel = cappedLevel;
  hls.nextLevel = cappedLevel;
}

function createGoproHlsPlayer(): Hls {
  return new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    capLevelToPlayerSize: true,
    startLevel: -1,
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 80 * 1000 * 1000,
    backBufferLength: 30,
    abrEwmaDefaultEstimate: 1_500_000,
    fragLoadingTimeOut: 20_000,
    manifestLoadingTimeOut: 15_000,
    levelLoadingTimeOut: 15_000,
    fragLoadingMaxRetry: 8,
    manifestLoadingMaxRetry: 5,
    levelLoadingMaxRetry: 5,
  });
}

type DayGroup = {
  key: string;
  heading: string;
  monthLabel: string;
  items: AlbumMediaItem[];
};

export function MediaAlbumTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<AlbumMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const historyPushedRef = useRef(false);
  const viewerWasOpenRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id || !user.role) return;
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listUserMediaAlbum({
      userId: user.id,
      role: user.role as UserRole,
    });
    if (listError) setError(listError.message);
    setItems(data ?? []);
    setLoading(false);
  }, [user?.id, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.kind === filter);
  }, [filter, items]);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [filter, items.length]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const dayGroups = useMemo(() => {
    const groups: DayGroup[] = [];
    const byKey = new Map<string, AlbumMediaItem[]>();
    for (const item of visibleItems) {
      const key = dayKey(item.sortAt || item.createdAt);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(item);
      else byKey.set(key, [item]);
    }
    const keys = Array.from(byKey.keys()).sort((a, b) => b.localeCompare(a));
    for (const key of keys) {
      groups.push({
        key,
        heading: formatDayHeading(key),
        monthLabel: formatMonthLabel(key),
        items: byKey.get(key) ?? [],
      });
    }
    return groups;
  }, [visibleItems]);

  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filtered.length));
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, hasMore, visibleCount]);

  const activeItem = useMemo(
    () => filtered.find((item) => item.id === activeId) ?? null,
    [activeId, filtered],
  );

  const photoItems = useMemo(
    () => filtered.filter((item) => item.kind === "photo"),
    [filtered],
  );

  const activePhotoIndex = useMemo(() => {
    if (!activeItem || activeItem.kind !== "photo") return -1;
    return photoItems.findIndex((item) => item.id === activeItem.id);
  }, [activeItem, photoItems]);

  const selectedItems = useMemo(
    () => filtered.filter((item) => selectedIds.has(item.id)),
    [filtered, selectedIds],
  );

  const closeViewer = useCallback(() => {
    if (historyPushedRef.current) {
      historyPushedRef.current = false;
      window.history.back();
      return;
    }
    setActiveId(null);
  }, []);

  useEffect(() => {
    const isOpen = Boolean(activeId);
    if (isOpen && !viewerWasOpenRef.current) {
      window.history.pushState({ [MEDIA_VIEWER_HISTORY_KEY]: "1" }, "");
      historyPushedRef.current = true;
    }
    if (!isOpen) historyPushedRef.current = false;
    viewerWasOpenRef.current = isOpen;
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const onPopState = () => {
      historyPushedRef.current = false;
      setActiveId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectVisibleDownloadable = useCallback(() => {
    setSelectedIds(new Set(visibleItems.filter(itemCanDownload).map((item) => item.id)));
  }, [visibleItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const downloadable = selectedItems.filter(itemCanDownload);
    const skipped = selectedItems.length - downloadable.length;
    if (downloadable.length === 0) {
      setDownloadNotice(
        skipped > 0
          ? "Vídeos GoPro não podem ser baixados por aqui. Selecione fotos ou vídeos enviados."
          : "Nenhum arquivo selecionado para baixar.",
      );
      return;
    }
    setDownloading(true);
    setDownloadNotice(null);
    for (const item of downloadable) {
      await downloadAlbumItem(item);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    setDownloading(false);
    setDownloadNotice(
      skipped > 0
        ? `${downloadable.length} arquivo(s) baixado(s). ${skipped} GoPro ignorado(s).`
        : `${downloadable.length} arquivo(s) baixado(s).`,
    );
  }, [selectedItems]);

  const goToFlight = useCallback(
    (item: AlbumMediaItem) => {
      if (!item.flightId) return;
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setActiveId(null);
      openFlightFromAlbum({
        flightId: item.flightId,
        role: user?.role,
        mediaKind: item.kind,
      });
    },
    [user?.role],
  );

  const photoCount = items.filter((i) => i.kind === "photo").length;
  const videoCount = items.filter((i) => i.kind === "video").length;

  return (
    <div
      className={`mx-auto w-full max-w-6xl space-y-5 px-1 sm:px-0 ${
        selectMode
          ? "pb-[calc(11.5rem+env(safe-area-inset-bottom))] lg:pb-28"
          : "pb-24 lg:pb-6"
      }`}
    >
      <header className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-950 to-sky-950/40 px-5 py-6 sm:px-7 sm:py-7">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-sky-500/10 blur-3xl"
          aria-hidden="true"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400/80">Álbum</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
          Suas memórias de voo
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Fotos e vídeos dos seus voos, organizados no tempo — no estilo de uma galeria pessoal.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1">
            {photoCount} foto{photoCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1">
            {videoCount} vídeo{videoCount === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-950/90 px-1 py-3 backdrop-blur-md sm:mx-0 sm:px-0">
        <div
          className="inline-flex rounded-xl border border-slate-700/80 bg-slate-900/80 p-1"
          role="tablist"
          aria-label="Filtrar mídia"
        >
          {(
            [
              { id: "all", label: "Tudo" },
              { id: "photo", label: "Fotos" },
              { id: "video", label: "Vídeos" },
            ] as const
          ).map((option) => {
            const selected = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(option.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                  selected
                    ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectMode((prev) => {
              if (prev) setSelectedIds(new Set());
              return !prev;
            });
          }}
          className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition ${
            selectMode
              ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
              : "border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800"
          }`}
        >
          {selectMode ? "Cancelar seleção" : "Selecionar"}
        </button>
      </div>

      {downloadNotice ? (
        <p className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-300">
          {downloadNotice}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <AlbumSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyAlbum filter={filter} />
      ) : (
        <div className="space-y-8">
          {dayGroups.map((group, groupIndex) => {
            const prevMonth = groupIndex > 0 ? dayGroups[groupIndex - 1]?.monthLabel : null;
            const showMonth = Boolean(group.monthLabel) && group.monthLabel !== prevMonth;
            return (
              <section key={group.key} className="space-y-3">
                {showMonth ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {group.monthLabel}
                  </p>
                ) : null}
                <h2 className="sticky top-[3.25rem] z-10 -mx-1 bg-gradient-to-b from-slate-950 via-slate-950/95 to-transparent px-1 pb-2 pt-1 text-base font-semibold capitalize text-slate-100 sm:top-[3.5rem]">
                  {group.heading}
                </h2>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 md:grid-cols-5 lg:grid-cols-6">
                  {group.items.map((item) => (
                    <AlbumTile
                      key={item.id}
                      item={item}
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onOpen={() => setActiveId(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      onDownload={() => void downloadAlbumItem(item)}
                      onGoToFlight={() => goToFlight(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {hasMore ? <div ref={loadMoreRef} className="h-8" aria-hidden="true" /> : null}
        </div>
      )}

      {selectMode ? (
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 border-t border-slate-700/80 bg-slate-950/95 px-4 py-3 backdrop-blur-md lg:bottom-0 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{selectedIds.size}</span> selecionado
              {selectedIds.size === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectVisibleDownloadable}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Selecionar visíveis
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Limpar
              </button>
              <button
                type="button"
                disabled={downloading || selectedIds.size === 0}
                onClick={() => void handleDownloadSelected()}
                className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? "Baixando…" : "Baixar selecionados"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeItem?.kind === "photo" ? (
        <AlbumPhotoLightbox
          item={activeItem}
          count={photoItems.length}
          index={activePhotoIndex}
          neighborItems={
            activePhotoIndex >= 0
              ? [
                  photoItems[(activePhotoIndex - 1 + photoItems.length) % photoItems.length],
                  photoItems[(activePhotoIndex + 1) % photoItems.length],
                ].filter((neighbor): neighbor is AlbumMediaItem =>
                  Boolean(neighbor && neighbor.id !== activeItem.id),
                )
              : []
          }
          onClose={closeViewer}
          onPrev={() => {
            if (activePhotoIndex < 0 || photoItems.length === 0) return;
            const prev = photoItems[(activePhotoIndex - 1 + photoItems.length) % photoItems.length];
            if (prev) setActiveId(prev.id);
          }}
          onNext={() => {
            if (activePhotoIndex < 0 || photoItems.length === 0) return;
            const next = photoItems[(activePhotoIndex + 1) % photoItems.length];
            if (next) setActiveId(next.id);
          }}
          onDownload={() => void downloadPhoto(activeItem)}
          onGoToFlight={() => goToFlight(activeItem)}
        />
      ) : null}

      {activeItem?.kind === "video" ? (
        <AlbumVideoModal
          item={activeItem}
          onClose={closeViewer}
          onGoToFlight={() => goToFlight(activeItem)}
        />
      ) : null}
    </div>
  );
}

function AlbumTile({
  item,
  selectMode,
  selected,
  onOpen,
  onToggleSelect,
  onDownload,
  onGoToFlight,
}: {
  item: AlbumMediaItem;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onDownload: () => void;
  onGoToFlight: () => void;
}) {
  const duration = formatDuration(item.durationSec);
  const caption = [item.aircraftIdent, item.flightDate].filter(Boolean).join(" · ");
  const gopro = itemIsGopro(item);
  const canDownload = itemCanDownload(item);

  function handleClick() {
    if (selectMode) {
      onToggleSelect();
      return;
    }
    onOpen();
  }

  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative aspect-square overflow-hidden rounded-md bg-slate-900 outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
        selected ? "ring-2 ring-sky-400" : "ring-sky-400/0 hover:ring-2 hover:ring-sky-400/50"
      }`}
      aria-label={item.kind === "video" ? `Abrir vídeo ${item.fileName}` : `Abrir foto ${item.fileName}`}
      aria-pressed={selectMode ? selected : undefined}
    >
      {item.kind === "photo" ? (
        <LazyAlbumImage
          thumbSrc={item.thumbUrl || (item.photo ? deriveThumbUrl(item.fileUrl, item.photo.r2_key) : "")}
          fullSrc={item.fileUrl}
          decodeSrc={item.downloadUrl || item.fileUrl}
          alt={item.fileName}
        />
      ) : gopro ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
          <span className="rounded-full border border-slate-600 bg-slate-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            GoPro
          </span>
        </div>
      ) : (
        <VideoThumb url={item.fileUrl} />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

      {selectMode ? (
        <span
          className={`absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border text-xs font-bold ${
            selected
              ? "border-sky-400 bg-sky-500 text-slate-950"
              : "border-white/40 bg-slate-950/50 text-transparent"
          }`}
        >
          ✓
        </span>
      ) : null}

      {item.kind === "video" ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-lg backdrop-blur-sm transition group-hover:scale-105">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            </span>
          </span>
          {duration ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-100">
              {duration}
            </span>
          ) : null}
        </>
      ) : null}

      {!selectMode ? (
        <div className="absolute right-1.5 top-1.5 hidden gap-1 opacity-0 transition group-hover:opacity-100 md:flex">
          {canDownload ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                stop(event);
                onDownload();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onDownload();
                }
              }}
              className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-slate-600/80 bg-slate-950/80 text-slate-100 hover:bg-sky-500 hover:text-slate-950"
              title="Baixar"
              aria-label="Baixar arquivo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
            </span>
          ) : null}
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              stop(event);
              onGoToFlight();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onGoToFlight();
              }
            }}
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-slate-600/80 bg-slate-950/80 text-slate-100 hover:bg-sky-500 hover:text-slate-950"
            title="Ver voo"
            aria-label="Abrir detalhes do voo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.087l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.197.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
            </svg>
          </span>
        </div>
      ) : null}

      {caption ? (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 hidden max-w-[70%] truncate rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-slate-200 opacity-0 transition group-hover:inline group-hover:opacity-100">
          {caption}
        </span>
      ) : null}
    </button>
  );
}

function VideoThumb({ url }: { url: string }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative h-full w-full bg-slate-900">
      {!ready ? <Skeleton className="absolute inset-0 h-full w-full rounded-none" /> : null}
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className={`h-full w-full object-cover transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}
        onLoadedData={() => setReady(true)}
        onError={() => setReady(true)}
      />
    </div>
  );
}

function LazyAlbumImage({
  thumbSrc,
  fullSrc,
  decodeSrc,
  alt,
}: {
  thumbSrc?: string;
  fullSrc: string;
  decodeSrc?: string;
  alt: string;
}) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sourceForDecode = decodeSrc || fullSrc;

  useEffect(() => {
    setShouldLoad(false);
    setDisplaySrc(null);
    setLoaded(false);
  }, [thumbSrc, fullSrc, sourceForDecode]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "180px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad || !fullSrc) return;
    let cancelled = false;
    void (async () => {
      const candidateThumb = (thumbSrc || "").trim();
      if (candidateThumb && candidateThumb !== fullSrc) {
        const thumbOk = await probeImageUrl(candidateThumb);
        if (cancelled) return;
        if (thumbOk) {
          setDisplaySrc(candidateThumb);
          return;
        }
      }
      try {
        const previewUrl = await getDownscaledPreviewUrl(sourceForDecode);
        if (cancelled) return;
        setDisplaySrc(previewUrl);
      } catch {
        if (cancelled) return;
        setDisplaySrc(fullSrc);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldLoad, thumbSrc, fullSrc, sourceForDecode]);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden bg-slate-900 [content-visibility:auto] [contain-intrinsic-size:160px_160px]"
    >
      {!loaded ? <Skeleton className="absolute inset-0 h-full w-full rounded-none" /> : null}
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={alt}
          className={`h-full w-full object-cover transition duration-200 group-hover:scale-[1.03] ${loaded ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          fetchPriority="low"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : null}
    </div>
  );
}

function EmptyAlbum({ filter }: { filter: MediaFilter }) {
  const copy =
    filter === "photo"
      ? "Nenhuma foto encontrada nos seus voos."
      : filter === "video"
        ? "Nenhum vídeo pronto encontrado nos seus voos."
        : "Quando fotos ou vídeos forem adicionados aos seus voos, eles aparecem aqui.";

  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-sky-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
          <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-100">Álbum vazio</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{copy}</p>
    </div>
  );
}

function AlbumSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-40 rounded-md" />
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((__, index) => (
              <Skeleton key={index} className="aspect-square rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FlightCtaButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20"
    >
      Ver voo
    </button>
  );
}

function AlbumPhotoLightbox({
  item,
  count,
  index,
  neighborItems = [],
  onClose,
  onPrev,
  onNext,
  onDownload,
  onGoToFlight,
}: {
  item: AlbumMediaItem;
  count: number;
  index: number;
  neighborItems?: AlbumMediaItem[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
  onGoToFlight: () => void;
}) {
  const hasMany = count > 1;
  const photo = item.photo;
  const thumbSrc = (item.thumbUrl || (photo ? deriveThumbUrl(item.fileUrl, photo.r2_key) : "") || "").trim();
  const fullSrc = (item.fileUrl || "").trim();
  const decodeSrc = (item.downloadUrl || item.fileUrl || "").trim();
  const initialPreview =
    lightboxPreviewByPhotoId.get(item.id) || (thumbSrc && thumbSrc !== fullSrc ? thumbSrc : "");

  const [previewSrc, setPreviewSrc] = useState(initialPreview);
  const [previewVisible, setPreviewVisible] = useState(Boolean(initialPreview));
  const [fullLoaded, setFullLoaded] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const cached = lightboxPreviewByPhotoId.get(item.id);
    const instant = cached || (thumbSrc && thumbSrc !== fullSrc ? thumbSrc : "");
    setPreviewSrc(instant);
    setPreviewVisible(Boolean(instant));
    setFullLoaded(false);

    let cancelled = false;
    const sourceForPreview = decodeSrc || fullSrc;
    if (!sourceForPreview) return undefined;

    void (async () => {
      try {
        const sharpPreview = await getLightboxPreviewUrl(sourceForPreview);
        if (cancelled) return;
        lightboxPreviewByPhotoId.set(item.id, sharpPreview);
        setPreviewSrc(sharpPreview);
        setPreviewVisible(true);
      } catch {
        if (cancelled) return;
        if (thumbSrc) {
          setPreviewSrc(thumbSrc);
          setPreviewVisible(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item.id, thumbSrc, fullSrc, decodeSrc]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!hasMany) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasMany, onClose, onNext, onPrev]);

  useEffect(() => {
    for (const neighbor of neighborItems) {
      const neighborDecode = neighbor.downloadUrl || neighbor.fileUrl;
      if (!neighborDecode) continue;
      void getLightboxPreviewUrl(neighborDecode)
        .then((url) => {
          lightboxPreviewByPhotoId.set(neighbor.id, url);
          preloadImageUrl(url);
        })
        .catch(() => {
          preloadImageUrl(neighbor.thumbUrl || neighbor.fileUrl);
        });
      preloadImageUrl(neighbor.fileUrl);
    }
  }, [neighborItems]);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!hasMany) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!hasMany || !touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(deltaX) < LIGHTBOX_SWIPE_THRESHOLD_PX) return;
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) onNext();
    else onPrev();
  }

  const showSpinner = !previewVisible && !fullLoaded;
  const meta = [item.aircraftIdent, item.flightDate].filter(Boolean).join(" · ");
  const imageFrameClass = "max-h-full max-w-full rounded-lg object-contain [transform:translateZ(0)]";

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização de foto"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.fileName}</p>
          <p className="text-xs text-slate-500">
            {index + 1} de {count}
            {meta ? ` · ${meta}` : ""}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <FlightCtaButton onClick={onGoToFlight} />
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20"
          >
            Baixar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center p-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {hasMany ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-xl text-slate-200 hover:bg-slate-800 sm:left-3"
              aria-label="Foto anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-xl text-slate-200 hover:bg-slate-800 sm:right-3"
              aria-label="Próxima foto"
            >
              ›
            </button>
          </>
        ) : null}

        <div className="relative flex h-full w-full items-center justify-center">
          {showSpinner ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-10 animate-pulse rounded-full border-2 border-slate-600 border-t-sky-400" aria-hidden="true" />
            </div>
          ) : null}
          {previewVisible && previewSrc ? (
            <img
              key={`preview-${item.id}`}
              src={previewSrc}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={`absolute ${imageFrameClass}`}
              decoding="async"
            />
          ) : null}
          <img
            key={`full-${item.id}`}
            src={fullSrc}
            alt={item.fileName}
            draggable={false}
            className={`relative ${imageFrameClass} ${fullLoaded ? "opacity-100" : "opacity-0"}`}
            decoding="async"
            fetchPriority="high"
            onLoad={() => setFullLoaded(true)}
            onError={() => setFullLoaded(true)}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          onClick={onGoToFlight}
          className="min-h-12 flex-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-3 text-base font-semibold text-sky-100"
        >
          Ver voo
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="min-h-12 flex-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-3 text-base font-semibold text-sky-100"
        >
          Baixar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-base font-semibold text-slate-200"
        >
          Fechar
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

function AlbumVideoModal({
  item,
  onClose,
  onGoToFlight,
}: {
  item: AlbumMediaItem;
  onClose: () => void;
  onGoToFlight: () => void;
}) {
  const video = item.video;
  const isGopro = Boolean(video && isGoproFlightVideo(video));
  const meta = [item.aircraftIdent, item.flightDate, formatDuration(item.durationSec)]
    .filter(Boolean)
    .join(" · ");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState(() => (isGopro ? "" : item.fileUrl));
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoRotationDeg, setVideoRotationDeg] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setPlaybackError(null);
    setVideoRotationDeg(0);
    setPlaybackRate(1);
    setCurrentTimeSec(0);

    if (!isGopro || !video) {
      setPlaybackUrl(item.fileUrl);
      setVideoLoading(true);
      return;
    }

    setPlaybackUrl("");
    setVideoLoading(true);
    void resolveGoproVideoPlayback(video)
      .then((playback) => {
        if (!cancelled) setPlaybackUrl(playback.url);
      })
      .catch((error) => {
        if (!cancelled) {
          setPlaybackError(error instanceof Error ? error.message : "Falha ao carregar vídeo GoPro.");
          setVideoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isGopro, item.fileUrl, item.id, video]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !playbackUrl || !isGopro) return;
    if (!playbackUrl.includes("gopro-hls") && !playbackUrl.includes(".m3u8")) return;

    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      if (el.src !== playbackUrl) el.src = playbackUrl;
      return;
    }
    if (!Hls.isSupported()) {
      setPlaybackError("Este navegador não suporta HLS para vídeos GoPro.");
      setVideoLoading(false);
      return;
    }

    const hls = createGoproHlsPlayer();
    hlsRef.current = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const maxHeight = playbackRate > 1.25 ? GOPRO_FAST_PLAYBACK_MAX_HEIGHT : GOPRO_HIGH_QUALITY_MAX_HEIGHT;
      pinGoproHlsLevel(hls, maxHeight);
      el.playbackRate = playbackRate;
      setPlaybackError(null);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad(el.currentTime);
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      setPlaybackError("Falha ao reproduzir vídeo GoPro.");
      setVideoLoading(false);
    });
    hls.attachMedia(el);
    hls.loadSource(playbackUrl);
    return () => {
      if (hlsRef.current === hls) hlsRef.current = null;
      hls.destroy();
    };
  }, [isGopro, playbackUrl]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || !isGopro || hls.levels.length === 0) return;
    const maxHeight = playbackRate > 1.25 ? GOPRO_FAST_PLAYBACK_MAX_HEIGHT : GOPRO_HIGH_QUALITY_MAX_HEIGHT;
    pinGoproHlsLevel(hls, maxHeight);
  }, [isGopro, playbackRate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate, playbackUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setCurrentTimeSec(el.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const markReady = () => {
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setVideoLoading(false);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadeddata", markReady);
    el.addEventListener("canplay", markReady);
    el.addEventListener("playing", markReady);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("loadeddata", markReady);
      el.removeEventListener("canplay", markReady);
      el.removeEventListener("playing", markReady);
    };
  }, [playbackUrl, item.id]);

  const duration = Math.max(
    0.01,
    videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
      ? videoRef.current.duration
      : item.durationSec ?? 0.01,
  );

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-6"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Reprodução de vídeo"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{item.fileName}</p>
            {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FlightCtaButton onClick={onGoToFlight} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="relative flex min-h-[240px] items-center justify-center bg-black sm:min-h-[360px]">
          {videoLoading && !playbackError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              <span className="mt-3 text-xs font-medium text-slate-300">Carregando vídeo…</span>
            </div>
          ) : null}
          {playbackError ? (
            <p className="px-6 py-10 text-center text-sm text-red-300">{playbackError}</p>
          ) : (
            <video
              key={item.id}
              ref={videoRef}
              src={isGopro && Hls.isSupported() ? undefined : playbackUrl || undefined}
              playsInline
              autoPlay
              className={`max-h-[min(70vh,680px)] w-full bg-black object-contain transition-opacity ${videoLoading ? "opacity-0" : "opacity-100"}`}
              style={videoRotationStyle(videoRotationDeg)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 bg-slate-950/95 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) void el.play();
              else el.pause();
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-sm text-white hover:bg-slate-700"
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? "⏸" : "▶"}
          </button>

          <select
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            title="Velocidade de reprodução"
            aria-label="Velocidade de reprodução"
            className="h-8 shrink-0 cursor-pointer rounded-md border border-slate-700 bg-slate-800 px-1.5 text-[11px] font-medium tabular-nums text-slate-300 hover:bg-slate-700 focus:border-sky-500 focus:outline-none"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {formatPlaybackRate(rate)}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-1.5 py-1">
            <span className="px-1 text-[11px] font-medium text-slate-500">Rotação</span>
            <button
              type="button"
              onClick={() => setVideoRotationDeg((d) => (d + 270) % 360)}
              title="Girar 90° anti-horário"
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={() => setVideoRotationDeg((d) => (d + 90) % 360)}
              title="Girar 90° horário"
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            >
              ↻
            </button>
            {videoRotationDeg !== 0 ? (
              <button
                type="button"
                onClick={() => setVideoRotationDeg(0)}
                title="Resetar rotação"
                className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-700"
              >
                {videoRotationDeg}°
              </button>
            ) : null}
          </div>

          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={Math.min(currentTimeSec, duration)}
            onChange={(event) => {
              const next = Number(event.target.value);
              const el = videoRef.current;
              if (el) el.currentTime = next;
              setCurrentTimeSec(next);
            }}
            className="min-w-0 flex-1 accent-sky-500"
            aria-label="Posição no vídeo"
          />
          <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
            {formatTimecode(currentTimeSec)} / {formatTimecode(duration)}
          </span>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
