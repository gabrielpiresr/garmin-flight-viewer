import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteFlightPhoto,
  listFlightPhotos,
  uploadFlightPhoto,
  type FlightPhoto,
} from "../lib/flightPhotosDb";
import { Skeleton } from "./ui/Skeleton";

type UploadItemStatus = "queued" | "uploading" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadItemStatus;
  error?: string;
};

function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

async function downloadPhoto(photo: FlightPhoto): Promise<void> {
  const url = photo.download_url || photo.file_url;
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao baixar foto.");
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = photo.file_name || "foto-do-voo.jpg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const STAFF_PHOTO_BATCH_SIZE = 32;
const VIEWER_PHOTO_BATCH_SIZE = 16;

export function PhotosTab({
  flightId,
  publicMode = false,
  publicPhotos,
}: {
  flightId: string | undefined;
  publicMode?: boolean;
  publicPhotos?: FlightPhoto[];
}) {
  const { user } = useAuth();
  const canUpload = !publicMode && (user?.role === "admin" || user?.role === "instrutor");
  const compactStaffGallery = canUpload;
  const photoBatchSize = compactStaffGallery ? STAFF_PHOTO_BATCH_SIZE : VIEWER_PHOTO_BATCH_SIZE;
  const [photos, setPhotos] = useState<FlightPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(photoBatchSize);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const uploadItemsRef = useRef<UploadItem[]>([]);

  const loadPhotos = useCallback(async () => {
    setError(null);
    if (publicMode) {
      setPhotos([...(publicPhotos ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setLoading(false);
      return;
    }
    if (!flightId) return;
    setLoading(true);
    const { data, error: listError } = await listFlightPhotos(flightId);
    if (listError) setError(listError.message);
    setPhotos((data ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setLoading(false);
  }, [flightId, publicMode, publicPhotos]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    uploadItemsRef.current = uploadItems;
  }, [uploadItems]);

  useEffect(() => {
    return () => {
      for (const item of uploadItemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  useEffect(() => {
    setVisiblePhotoCount(photoBatchSize);
  }, [flightId, photoBatchSize, photos.length]);

  const activeIndex = useMemo(
    () => photos.findIndex((photo) => photo.id === activePhotoId),
    [activePhotoId, photos],
  );
  const activePhoto = activeIndex >= 0 ? photos[activeIndex] : null;

  function addFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList).filter(isImageFile);
    if (nextFiles.length === 0) {
      setError("Selecione arquivos de imagem.");
      return;
    }
    setError(null);
    setUploadItems((current) => {
      const existing = new Set(current.map((item) => fileKey(item.file)));
      const next = nextFiles
        .filter((file) => !existing.has(fileKey(file)))
        .map((file) => ({
          id: `${fileKey(file)}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: "queued" as const,
        }));
      return [...current, ...next];
    });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  }

  function removeUploadItem(itemId: string) {
    setUploadItems((current) => {
      const item = current.find((entry) => entry.id === itemId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== itemId);
    });
  }

  async function handleUpload() {
    if (!flightId || !user || !canUpload || uploadItems.length === 0) return;
    setUploading(true);
    setError(null);

    for (const item of uploadItems) {
      setUploadItems((current) =>
        current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", error: undefined } : entry),
      );
      const { error: uploadError } = await uploadFlightPhoto({
        flightId,
        file: item.file,
        actorUserId: user.id,
        actorRole: user.role,
      });
      setUploadItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: uploadError ? "error" : "done",
                error: uploadError?.message,
              }
            : entry,
        ),
      );
    }

    setUploading(false);
    await loadPhotos();
    setUploadItems((current) => {
      const failed = current.filter((item) => item.status === "error");
      const done = current.filter((item) => item.status !== "error");
      for (const item of done) URL.revokeObjectURL(item.previewUrl);
      return failed;
    });
  }

  async function handleDelete(photo: FlightPhoto) {
    if (!canUpload) return;
    const { error: deleteError } = await deleteFlightPhoto(photo);
    if (deleteError) setError(deleteError.message);
    await loadPhotos();
  }

  async function handleDownloadAll() {
    for (const photo of photos) {
      await downloadPhoto(photo);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }

  const queuedCount = uploadItems.filter((item) => item.status === "queued" || item.status === "error").length;
  const uploadPreviewGridClass = "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8";
  const galleryGridClass = compactStaffGallery ? uploadPreviewGridClass : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";
  const galleryCardClass = compactStaffGallery
    ? "group overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50"
    : "group overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50";
  const galleryInfoClass = compactStaffGallery ? "space-y-1.5 p-2" : "space-y-2 p-3";
  const galleryTitleClass = compactStaffGallery
    ? "truncate text-xs font-semibold text-slate-100"
    : "truncate text-sm font-semibold text-slate-100";
  const gallerySkeletonCount = compactStaffGallery ? 8 : 4;
  const visiblePhotos = useMemo(() => photos.slice(0, visiblePhotoCount), [photos, visiblePhotoCount]);
  const hasMorePhotos = visiblePhotoCount < photos.length;
  const upcomingSkeletonCount = hasMorePhotos ? Math.min(photoBatchSize, photos.length - visiblePhotoCount) : 0;

  useEffect(() => {
    if (!hasMorePhotos) return;
    const node = loadMoreRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisiblePhotoCount(photos.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisiblePhotoCount((current) => Math.min(current + photoBatchSize, photos.length));
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMorePhotos, photoBatchSize, photos.length]);

  return (
    <div className="space-y-4">
      {canUpload ? (
        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Fotos do voo</p>
              <h3 className="mt-1 text-lg font-bold text-slate-100">Enviar fotos em lote</h3>
              <p className="mt-1 text-sm text-slate-500">Arraste várias imagens ou selecione tudo de uma vez.</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              <span aria-hidden="true">+</span>
              Selecionar fotos
            </button>
          </div>

          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleInputChange} />

          <div
            className={`mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition ${
              dragOver
                ? "border-sky-400 bg-sky-500/10 text-sky-100"
                : "border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:bg-slate-900/60"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <div className="flex size-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-xl">+</div>
            <p className="mt-3 text-sm font-semibold text-slate-200">Solte as fotos aqui</p>
            <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP, GIF ou HEIC.</p>
          </div>

          {uploadItems.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className={uploadPreviewGridClass}>
                {uploadItems.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50">
                    <div className="aspect-[4/3] bg-slate-900">
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
                        decoding="async"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-1.5 p-2">
                      <p className="truncate text-xs font-semibold text-slate-200" title={item.file.name}>{item.file.name}</p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>{formatBytes(item.file.size)}</span>
                        <UploadStatus status={item.status} />
                      </div>
                      {item.error ? <p className="text-[11px] text-red-300">{item.error}</p> : null}
                      {item.status !== "uploading" ? (
                        <button
                          type="button"
                          onClick={() => removeUploadItem(item.id)}
                          className="text-[11px] font-medium text-slate-500 hover:text-red-300"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {uploadItems.length} foto{uploadItems.length > 1 ? "s" : ""} selecionada{uploadItems.length > 1 ? "s" : ""}.
                </p>
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={uploading || queuedCount === 0}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                >
                  {uploading ? "Enviando..." : `Enviar ${queuedCount} foto${queuedCount > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Galeria do voo</h3>
            <p className="mt-1 text-sm text-slate-500">
              {photos.length > 0
                ? `${photos.length} foto${photos.length > 1 ? "s" : ""} disponível${photos.length > 1 ? "eis" : ""}.`
                : "Fotos enviadas para este voo aparecerão aqui."}
            </p>
          </div>
          {photos.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleDownloadAll()}
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20"
            >
              Baixar todas
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}

        {loading && photos.length === 0 ? (
          <div className={galleryGridClass}>
            {Array.from({ length: gallerySkeletonCount }).map((_, index) => (
              <Skeleton key={index} className={`aspect-[4/3] ${compactStaffGallery ? "rounded-lg" : "rounded-xl"}`} />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <PhotosEmptyState canUpload={canUpload} onPick={() => inputRef.current?.click()} />
        ) : (
          <div className={galleryGridClass}>
            {visiblePhotos.map((photo) => (
              <article key={photo.id} className={galleryCardClass}>
                <button
                  type="button"
                  onClick={() => setActivePhotoId(photo.id)}
                  className="block aspect-[4/3] w-full overflow-hidden bg-slate-900"
                >
                  <LazyPhotoImage src={photo.file_url} alt={photo.file_name} />
                </button>
                <div className={galleryInfoClass}>
                  <p className={galleryTitleClass} title={photo.file_name}>{photo.file_name}</p>
                  <p className="text-xs text-slate-500">
                    {[formatBytes(photo.file_size), formatDate(photo.created_at)].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActivePhotoId(photo.id)}
                      className="text-xs font-medium text-sky-300 underline-offset-4 hover:underline"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadPhoto(photo)}
                      className="text-xs font-medium text-sky-300 underline-offset-4 hover:underline"
                    >
                      Baixar
                    </button>
                    {canUpload ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(photo)}
                        className="text-xs font-medium text-slate-600 underline-offset-4 hover:text-red-300 hover:underline"
                      >
                        Apagar
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            {Array.from({ length: upcomingSkeletonCount }).map((_, index) => (
              <Skeleton
                key={`photo-skeleton-${visiblePhotoCount + index}`}
                className={`aspect-[4/3] ${compactStaffGallery ? "rounded-lg" : "rounded-xl"}`}
              />
            ))}
            {hasMorePhotos ? <div ref={loadMoreRef} className="col-span-full h-px" aria-hidden="true" /> : null}
          </div>
        )}
      </section>

      {activePhoto ? (
        <PhotoLightbox
          photo={activePhoto}
          count={photos.length}
          index={activeIndex}
          onClose={() => setActivePhotoId(null)}
          onPrev={() => setActivePhotoId(photos[(activeIndex - 1 + photos.length) % photos.length]?.id ?? null)}
          onNext={() => setActivePhotoId(photos[(activeIndex + 1) % photos.length]?.id ?? null)}
          onDownload={() => void downloadPhoto(activePhoto)}
        />
      ) : null}
    </div>
  );
}

function UploadStatus({ status }: { status: UploadItemStatus }) {
  if (status === "uploading") {
    return <span className="text-sky-300">Enviando</span>;
  }
  if (status === "done") {
    return <span className="text-emerald-300">Enviada</span>;
  }
  if (status === "error") {
    return <span className="text-red-300">Falhou</span>;
  }
  return <span>Na fila</span>;
}

function LazyPhotoImage({ src, alt }: { src: string; alt: string }) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShouldLoad(false);
    setLoaded(false);
  }, [src]);

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
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden bg-slate-900">
      {!loaded ? <Skeleton className="absolute inset-0 h-full w-full rounded-none" /> : null}
      {shouldLoad ? (
        <img
          src={src}
          alt={alt}
          className={`h-full w-full object-cover transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
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

function PhotosEmptyState({ canUpload, onPick }: { canUpload: boolean; onPick: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-2xl">□</div>
      <h3 className="mt-4 text-base font-bold text-slate-100">Nenhuma foto neste voo</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Quando o instrutor adicionar imagens, elas ficam organizadas aqui para visualizar e baixar rapidamente.
      </p>
      {canUpload ? (
        <button
          type="button"
          onClick={onPick}
          className="mt-5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
        >
          Adicionar fotos
        </button>
      ) : null}
    </div>
  );
}

function PhotoLightbox({
  photo,
  count,
  index,
  onClose,
  onPrev,
  onNext,
  onDownload,
}: {
  photo: FlightPhoto;
  count: number;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
}) {
  const hasMany = count > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-slate-100" role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{photo.file_name}</p>
          <p className="text-xs text-slate-500">{index + 1} de {count}</p>
        </div>
        <div className="flex items-center gap-2">
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
            aria-label="Fechar"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        {hasMany ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-xl text-slate-200 hover:bg-slate-800"
              aria-label="Foto anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-xl text-slate-200 hover:bg-slate-800"
              aria-label="Próxima foto"
            >
              ›
            </button>
          </>
        ) : null}
        <img src={photo.file_url} alt={photo.file_name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      </div>
    </div>
  );
}
