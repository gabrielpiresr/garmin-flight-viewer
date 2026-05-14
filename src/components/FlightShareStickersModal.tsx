import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  buildFlightShareStickers,
  buildCustomFlightShareSticker,
  DEFAULT_CUSTOM_STICKER_OPTIONS,
  loadFlightShareData,
  stickerToPngFile,
  svgToDataUri,
  svgToPngBlob,
  type CustomStickerOptions,
  type FlightShareData,
  type FlightShareSticker,
} from "../lib/flightShareStickers";
import { useToast } from "./ui/ToastProvider";

type Props = {
  flightId: string;
  onClose: () => void;
};

type BusyAction = "share" | "download" | "copy" | null;
type StickerMode = "ready" | "custom";

type NavigatorWithFiles = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

const checkerboardStyle = {
  backgroundColor: "#111827",
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.09) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.09) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.09) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.09) 75%)",
  backgroundPosition: "0 0, 0 16px, 16px -16px, -16px 0px",
  backgroundSize: "32px 32px",
} satisfies CSSProperties;

function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3.25" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
      <path d="M4.5 13.25a.75.75 0 00-1.5 0v1.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-1.5a.75.75 0 00-1.5 0v1.5a.75.75 0 01-.75.75h-9.5a.75.75 0 01-.75-.75v-1.5z" />
    </svg>
  );
}

function CopyIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.75 2A2.75 2.75 0 004 4.75v8.5A2.75 2.75 0 006.75 16h6.5A2.75 2.75 0 0016 13.25v-8.5A2.75 2.75 0 0013.25 2h-6.5zM5.5 4.75c0-.69.56-1.25 1.25-1.25h6.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-8.5z" />
      <path d="M2.75 5a.75.75 0 00-.75.75v8.5A3.75 3.75 0 005.75 18h6.5a.75.75 0 000-1.5h-6.5a2.25 2.25 0 01-2.25-2.25v-8.5A.75.75 0 002.75 5z" />
    </svg>
  );
}

function ShareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M13.5 4.5a2.5 2.5 0 11.77 1.8L7.98 9.45a2.6 2.6 0 010 1.1l6.29 3.15a2.5 2.5 0 11-.67 1.34l-6.3-3.15a2.5 2.5 0 110-3.78l6.3-3.15a2.5 2.5 0 01-.1-.46z" />
    </svg>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function canCopyImage(): boolean {
  return typeof window !== "undefined" && "ClipboardItem" in window && Boolean(navigator.clipboard?.write);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StickerPreview({
  sticker,
  onSwipeLeft,
  onSwipeRight,
}: {
  sticker: FlightShareSticker;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const canSwipe = Boolean(onSwipeLeft || onSwipeRight);

  return (
    <div
      className="relative mx-auto flex h-full max-h-[58vh] min-h-[360px] w-full max-w-[360px] touch-pan-y items-center justify-center rounded-[1.3rem] border border-slate-700/80 p-4 shadow-2xl shadow-black/40"
      style={checkerboardStyle}
      onTouchStart={(event) => {
        if (!canSwipe) return;
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (!canSwipe || touchStartX.current === null) return;
        const endX = event.changedTouches[0]?.clientX;
        if (typeof endX !== "number") return;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 56) return;
        if (delta < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }}
    >
      <img
        src={svgToDataUri(sticker.svg)}
        alt={sticker.title}
        className="h-full max-h-[54vh] w-auto object-contain drop-shadow-2xl"
        draggable={false}
      />
      {canSwipe ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-[11px] font-semibold text-slate-200 sm:hidden">
          Deslize para trocar
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-w-[92px] flex-1 flex-col items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[112px] sm:flex-none"
    >
      {children}
    </button>
  );
}

function ToggleOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-sky-500"
      />
    </label>
  );
}

export function FlightShareStickersModal({ flightId, onClose }: Props) {
  const { showToast } = useToast();
  const [shareData, setShareData] = useState<FlightShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [mode, setMode] = useState<StickerMode>("ready");
  const [readyShowBackground, setReadyShowBackground] = useState(true);
  const [customOptions, setCustomOptions] = useState<CustomStickerOptions>(DEFAULT_CUSTOM_STICKER_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    setShareData(null);
    setError(null);
    setActiveIndex(0);
    setMode("ready");
    setReadyShowBackground(true);

    void loadFlightShareData(flightId)
      .then((next) => {
        if (!cancelled) setShareData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message || "Não foi possível preparar as figurinhas.");
      });

    return () => {
      cancelled = true;
    };
  }, [flightId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const stickers = useMemo(
    () => shareData ? buildFlightShareStickers(shareData, { showBackground: readyShowBackground }) : [],
    [readyShowBackground, shareData],
  );
  const customSticker = useMemo(
    () => shareData ? buildCustomFlightShareSticker(shareData, customOptions) : null,
    [customOptions, shareData],
  );
  const activeSticker = mode === "custom"
    ? customSticker
    : stickers[activeIndex] ?? stickers[0] ?? null;
  const supportsCopy = canCopyImage();
  const updateCustomOptions = (patch: Partial<CustomStickerOptions>) => {
    setCustomOptions((current) => ({ ...current, ...patch }));
  };

  const handleDownload = async () => {
    if (!activeSticker) return;
    setBusyAction("download");
    try {
      const blob = await svgToPngBlob(activeSticker.svg, activeSticker.width, activeSticker.height);
      downloadBlob(blob, activeSticker.fileName);
      showToast({ variant: "success", message: "Figurinha baixada em PNG com fundo transparente." });
    } catch (err) {
      showToast({ variant: "error", message: (err as Error).message || "Falha ao baixar a figurinha." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = async () => {
    if (!activeSticker || !supportsCopy) return;
    setBusyAction("copy");
    try {
      const blob = await svgToPngBlob(activeSticker.svg, activeSticker.width, activeSticker.height);
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      showToast({ variant: "success", message: "Imagem copiada para a área de transferência." });
    } catch (err) {
      showToast({ variant: "error", message: (err as Error).message || "Falha ao copiar a imagem." });
    } finally {
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    if (!activeSticker) return;
    const nav = navigator as NavigatorWithFiles;
    if (!nav.share) {
      showToast({ variant: "warning", message: "Compartilhamento direto indisponível neste navegador. Use Baixar PNG." });
      return;
    }

    setBusyAction("share");
    try {
      const file = await stickerToPngFile(activeSticker);
      const payload: ShareData = {
        title: activeSticker.title,
        text: "Confira meu voo.",
        files: [file],
      };
      if (nav.canShare && !nav.canShare(payload)) {
        showToast({ variant: "warning", message: "Este navegador não aceita compartilhar imagens. Use Baixar PNG." });
        return;
      }
      await nav.share(payload);
    } catch (err) {
      if (!isAbortError(err)) {
        showToast({ variant: "error", message: (err as Error).message || "Falha ao compartilhar a figurinha." });
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Compartilhar voo">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-950 shadow-2xl shadow-black sm:h-[min(880px,calc(100vh-2rem))] sm:rounded-3xl sm:border sm:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              aria-label="Fechar"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 101.06 1.06L10 11.06l4.72 4.72a.75.75 0 101.06-1.06L11.06 10l4.72-4.72a.75.75 0 00-1.06-1.06L10 8.94 5.28 4.22z" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">Compartilhar voo</p>
              <p className="truncate text-xs text-slate-500">Figurinhas transparentes para stories</p>
            </div>
          </div>
          <InstagramIcon className="h-6 w-6 text-pink-300" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {!shareData && !error ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center gap-3 text-center">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
              <p className="text-sm text-slate-400">Preparando figurinhas do voo...</p>
            </div>
          ) : error ? (
            <div className="mx-auto flex min-h-[520px] max-w-md flex-col items-center justify-center gap-3 text-center">
              <p className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</p>
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
                Voltar
              </button>
            </div>
          ) : activeSticker ? (
            <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div className="flex flex-col items-center gap-4">
                <StickerPreview
                  sticker={activeSticker}
                  onSwipeLeft={mode === "ready" && stickers.length > 1 ? () => setActiveIndex((current) => (current + 1) % stickers.length) : undefined}
                  onSwipeRight={mode === "ready" && stickers.length > 1 ? () => setActiveIndex((current) => (current - 1 + stickers.length) % stickers.length) : undefined}
                />
                {mode === "ready" ? (
                  <div className="flex items-center justify-center gap-2">
                    {stickers.map((sticker, index) => (
                      <button
                        key={sticker.id}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        aria-label={`Selecionar ${sticker.title}`}
                        className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-8 bg-white" : "w-2.5 bg-slate-600 hover:bg-slate-400"}`}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-center text-[11px] font-semibold text-sky-100 lg:hidden">
                  Role para baixo para ver opções, download e compartilhamento
                </div>
              </div>

              <aside className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("ready")}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${mode === "ready" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Prontas
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("custom")}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${mode === "custom" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Montar
                  </button>
                </div>

                <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{mode === "ready" ? "Modelo" : "Personalizar"}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-100">{activeSticker.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{activeSticker.description}</p>

                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Aparência</p>
                  <ToggleOption
                    checked={mode === "ready" ? readyShowBackground : customOptions.showBackground}
                    label="Mostrar fundo"
                    onChange={(checked) => {
                      if (mode === "ready") setReadyShowBackground(checked);
                      else updateCustomOptions({ showBackground: checked });
                    }}
                  />
                </div>

                {mode === "ready" ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {stickers.map((sticker, index) => (
                      <button
                        key={sticker.id}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`rounded-2xl border p-2 text-left transition ${
                          index === activeIndex
                            ? "border-sky-400/60 bg-sky-500/10"
                            : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                        }`}
                      >
                        <div className="aspect-[9/16] overflow-hidden rounded-xl p-1" style={checkerboardStyle}>
                          <img src={svgToDataUri(sticker.svg)} alt="" className="h-full w-full object-contain" draggable={false} />
                        </div>
                        <p className="mt-2 truncate text-xs font-semibold text-slate-200">{sticker.title}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <label className="block text-xs text-slate-400">
                      Título opcional
                      <input
                        value={customOptions.title}
                        onChange={(event) => updateCustomOptions({ title: event.target.value })}
                        maxLength={32}
                        placeholder="Sem título"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                      />
                    </label>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Rota</p>
                      <div className="grid gap-2">
                        {([
                          ["map", "Com mapa"],
                          ["clean", "Sem mapa"],
                          ["legs", "Pernas do voo"],
                          ["hidden", "Ocultar rota"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateCustomOptions({ routeMode: value })}
                            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                              customOptions.routeMode === value
                                ? "border-sky-400/60 bg-sky-500/10 text-sky-100"
                                : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Métricas</p>
                      <div className="grid gap-2">
                        <ToggleOption checked={customOptions.showDistance} label="Distância" onChange={(checked) => updateCustomOptions({ showDistance: checked })} />
                        <ToggleOption checked={customOptions.showTime} label="Tempo" onChange={(checked) => updateCustomOptions({ showTime: checked })} />
                        <ToggleOption checked={customOptions.showAltitude} label="Altitude máxima" onChange={(checked) => updateCustomOptions({ showAltitude: checked })} />
                        <ToggleOption checked={customOptions.showSpeed} label="Velocidade máxima" onChange={(checked) => updateCustomOptions({ showSpeed: checked })} />
                        <ToggleOption checked={customOptions.showAircraft} label="Aeronave" onChange={(checked) => updateCustomOptions({ showAircraft: checked })} />
                        <ToggleOption checked={customOptions.showDate} label="Data" onChange={(checked) => updateCustomOptions({ showDate: checked })} />
                        <ToggleOption checked={customOptions.showStudent} label="Aluno" onChange={(checked) => updateCustomOptions({ showStudent: checked })} />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Gráficos</p>
                      <div className="grid gap-2">
                        <ToggleOption checked={customOptions.showAltitudeChart} label="Gráfico de altitude" onChange={(checked) => updateCustomOptions({ showAltitudeChart: checked })} />
                        <ToggleOption checked={customOptions.showSpeedChart} label="Gráfico de velocidade" onChange={(checked) => updateCustomOptions({ showSpeedChart: checked })} />
                      </div>
                      <p className="mt-2 text-[11px] leading-4 text-slate-500">
                        A logo da escola fica sempre presente. Se houver muitos itens, a arte prioriza o que cabe sem vazar.
                      </p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-800 bg-slate-900/90 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-100">Compartilhar com</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            <ActionButton disabled={!activeSticker || busyAction !== null} onClick={() => void handleShare()}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white">
                <InstagramIcon />
              </span>
              {busyAction === "share" ? "Abrindo..." : "Stories"}
            </ActionButton>
            <ActionButton disabled={!activeSticker || busyAction !== null} onClick={() => void handleShare()}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-100">
                <ShareIcon />
              </span>
              Compartilhar
            </ActionButton>
            <ActionButton disabled={!activeSticker || busyAction !== null} onClick={() => void handleDownload()}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-100">
                <DownloadIcon />
              </span>
              {busyAction === "download" ? "Baixando..." : "Download"}
            </ActionButton>
            <ActionButton disabled={!activeSticker || busyAction !== null || !supportsCopy} onClick={() => void handleCopy()}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-100">
                <CopyIcon />
              </span>
              Copiar
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
