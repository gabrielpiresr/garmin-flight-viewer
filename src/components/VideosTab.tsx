import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ExportModal, type ExportProgress } from "./ExportModal";
import { renderOverlayVideo, uploadOverlayAndComposite } from "../lib/renderOverlayVideo";
import { useAuth } from "../contexts/AuthContext";
import { account } from "../lib/appwrite";
import { getCachedBrandSettings, getEmailBrandSettings } from "../lib/notificationsDb";
import { Skeleton } from "./ui/Skeleton";
import {
  createFlightVideoDoc,
  deleteFlightVideo,
  listFlightVideos,
  updateFlightVideoFailed,
  updateFlightVideoReady,
  type FlightVideo,
} from "../lib/flightVideosDb";
import {
  hasStuckProcessingVideos,
  reconcileProcessingVideosFromR2,
} from "../lib/reconcileFlightVideoFromR2";
import { getWorkerConfig, isVideoStorageConfigured } from "../lib/videoStorage";
import { getAircraftByRegistration } from "../lib/aircraftDb";
import { getModelById } from "../lib/aircraftModelsDb";
import { SCHOOL_ID } from "../lib/appwrite";
import { getSavedFlight } from "../lib/flightsDb";
import {
  parseAvailableWidgets,
  parseVideoTelemetryJson,
  pointAtVideoTime,
  verticalSpeedFpmAtTime,
  type AirspeedArcLimits,
  type VideoTelemetryPoint,
  type VideoTelemetryWidget,
} from "../lib/videoTelemetry";
import {
  buildVideoRouteMap,
  drawVideoRouteMapBase,
  drawVideoRouteMapMarker,
  type VideoRouteMapData,
} from "../lib/videoRouteMap";
import {
  computeVideoStageSize,
  telemetryChartPoints,
  type VideoStageFit,
} from "../lib/videoStageLayout";
import { routeMapSourceSize } from "../lib/overlayRouteLayout";
import type { AircraftModel } from "../types/admin";
import {
  CompactTelemetryOverlay,
  drawTelemetryChart,
  HudTelemetryOverlay,
  TelemetryBrandMark,
  VerticalCompactOverlay,
  type TelemetryOverlayStyle,
} from "./VideoTelemetryOverlay";


const HELPER_URL = "http://127.0.0.1:7842";
const HELPER_SETUP_PATH = "/video-helper";

type HelperStatus = "checking" | "online" | "offline";
type SelectedFile = { name: string; path: string; size: number };
type ProcessingMode = "original" | "compatible" | "compressed";
type ProcessingStrategy = "direct" | "remux" | "concat-copy" | "transcode";

type ProcessStage =
  | "telemetry-detect"
  | "direct"
  | "remux"
  | "concat-copy"
  | "transcode"
  | "concat"
  | "watermark"
  | "compress"
  | "upload"
  | "done"
  | "error";

type ProgressPayload = {
  stage: ProcessStage;
  percent: number;
  message?: string;
  strategy?: ProcessingStrategy;
  file_url?: string;
  file_size?: number;
  duration_sec?: number;
  telemetry_present?: boolean;
  telemetry_source?: string;
  available_widgets?: string[];
  telemetry_json?: string;
};

type FileAnalysis = {
  strategy: ProcessingStrategy;
  requiresTranscode: boolean;
  encoder: string;
  hardwareAccelerated: boolean;
  reason: string;
  outputExtension: string;
  playbackRisk: "low" | "medium" | "high";
  playbackWarning: string;
  estimatedSeconds: number | null;
  totalDurationSec: number;
};


function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDurationSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Barra de reprodução fora do vídeo — não gira com a rotação do frame. */
function VideoPlaybackControls({
  videoRef,
  durationSec,
  currentTimeSec,
  playbackBindKey,
  onSeek,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  durationSec: number;
  currentTimeSec: number;
  playbackBindKey: string;
  onSeek: (t: number) => void;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    setPlaying(!el.paused);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [videoRef, playbackBindKey]);

  const duration = useMemo(() => {
    const el = videoRef.current;
    const fromEl = el?.duration;
    if (fromEl != null && Number.isFinite(fromEl) && fromEl > 0) return fromEl;
    return Math.max(0.01, durationSec);
  }, [videoRef, durationSec, currentTimeSec, playbackBindKey]);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-slate-800 bg-slate-950/95 px-2 py-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-sm text-white hover:bg-slate-700"
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.05}
        value={Math.min(currentTimeSec, duration)}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="min-w-0 flex-1 accent-sky-500"
        aria-label="Posição no vídeo"
      />
      <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
        {formatTimecode(currentTimeSec)} / {formatTimecode(duration)}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isVideoUploadFile(name: string): boolean {
  return /\.(mp4|mov|avi|mkv|mts|m2ts|webm)$/i.test(name);
}

function isMobileOrTabletDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const uaData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (uaData.userAgentData?.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua);
}

async function getHelperStatus(): Promise<HelperStatus> {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

function getCachedVideoBrand(): { schoolName: string; logoUrl: string } {
  const settings = getCachedBrandSettings();
  return {
    schoolName: settings?.schoolName?.trim() || "Escola",
    logoUrl: settings?.logoDataUrl || settings?.logoUrl || "",
  };
}

async function pickFilesFromHelper(): Promise<SelectedFile[]> {
  const response = await fetch(`${HELPER_URL}/pick-files`, { method: "POST" });
  const body = await response.json().catch(() => ({})) as { files?: SelectedFile[]; error?: string };
  if (!response.ok) throw new Error(body.error || "Falha ao abrir o seletor de arquivos.");
  return Array.isArray(body.files) ? body.files : [];
}

export function VideosTab({ flightId, publicMode = false, publicVideos }: {
  flightId: string | undefined;
  publicMode?: boolean;
  publicVideos?: FlightVideo[];
}) {
  const { user } = useAuth();
  const isInstructor = !publicMode && (user?.role === "instrutor" || user?.role === "admin");

  const [helperStatus, setHelperStatus] = useState<HelperStatus>("checking");
  const [videos, setVideos] = useState<FlightVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<ProcessStage | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [applyLogo, setApplyLogo] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("original");
  const [processingStrategy, setProcessingStrategy] = useState<ProcessingStrategy | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  const checkHelper = useCallback(async () => {
    setHelperStatus("checking");
    setHelperStatus(await getHelperStatus());
  }, []);

  const loadVideos = useCallback(async () => {
    if (publicMode) {
      setVideos((publicVideos ?? []).filter((video) => video.processing_status === "ready" && Boolean(video.file_url)));
      setLoadingVideos(false);
      return;
    }
    if (!flightId) return;
    setLoadingVideos(true);
    const { data } = await listFlightVideos(flightId);
    let list = data ?? [];
    if (list.length > 0 && isVideoStorageConfigured()) {
      const fixed = await reconcileProcessingVideosFromR2(flightId, list);
      if (fixed > 0) {
        const refreshed = await listFlightVideos(flightId);
        if (refreshed.data) list = refreshed.data;
      }
    }
    setLoadingVideos(false);
    setVideos(list);
  }, [flightId, publicMode, publicVideos]);

  useEffect(() => {
    if (!publicMode) void checkHelper();
    void loadVideos();
  }, [checkHelper, loadVideos, publicMode]);

  // Enquanto houver vídeo em processing sem URL, reconsultar R2 periodicamente
  useEffect(() => {
    if (publicMode || !flightId || !hasStuckProcessingVideos(videos)) return;
    const interval = window.setInterval(() => {
      void loadVideos();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [flightId, publicMode, videos, loadVideos]);

  // Ao voltar para a aba, tentar reconciliar de novo
  useEffect(() => {
    const onVisible = () => {
      if (!publicMode && document.visibilityState === "visible") void loadVideos();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadVideos, publicMode]);

  useEffect(() => {
    if (publicMode || processingJobId || helperStatus !== "online") return;
    const candidate = videos.find((video) =>
      (video.processing_status === "processing" || video.processing_status === "uploading") && !video.file_url
    );
    if (!candidate) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`${HELPER_URL}/jobs/${candidate.id}`);
        if (!response.ok || cancelled) return;
        const body = await response.json() as {
          job?: { stage?: ProcessStage; percent?: number; message?: string; strategy?: ProcessingStrategy };
        };
        if (!body.job || cancelled) return;
        setProcessingJobId(candidate.id);
        setProgressStage(body.job.stage ?? "concat");
        setProgress(body.job.percent ?? 0);
        setProcessingStrategy(body.job.strategy ?? null);
        if (body.job.stage === "done") {
          setIsDone(true);
          void loadVideos();
          return;
        }
        if (body.job.stage === "error") {
          setProcessingError(body.job.message || candidate.processing_error || "Erro no processamento");
          return;
        }
        timer = window.setTimeout(poll, 2000);
      } catch {
        // O helper pode estar iniciando; a reconciliacao com R2 continua independente.
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [helperStatus, loadVideos, processingJobId, publicMode, videos]);

  useEffect(() => {
    if (!processingJobId || evtSourceRef.current) return;
    const source = new EventSource(`${HELPER_URL}/progress/${processingJobId}`);
    evtSourceRef.current = source;
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as ProgressPayload;
      setProgressStage(payload.stage);
      setProgress(payload.percent);
      if (payload.strategy) setProcessingStrategy(payload.strategy);
      if (payload.stage === "done") {
        source.close();
        evtSourceRef.current = null;
        setIsDone(true);
        void loadVideos();
      } else if (payload.stage === "error") {
        source.close();
        evtSourceRef.current = null;
        setProcessingError(payload.message || "Erro no processamento");
      }
    };
    source.onerror = () => {
      source.close();
      evtSourceRef.current = null;
    };
    return () => {
      source.close();
      if (evtSourceRef.current === source) evtSourceRef.current = null;
    };
  }, [loadVideos, processingJobId]);

  const handleOpenFilePicker = async () => {
    try {
      const files = await pickFilesFromHelper();
      if (files.length === 0) return;
      setSelectedFiles(files);
      setIsDone(false);
      setProcessingError(null);
      setProcessingJobId(null);
      setProcessingStrategy(null);
    } catch (error) {
      setProcessingError((error as Error).message);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setSelectedFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      dragIndexRef.current = index;
      return next;
    });
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
  };

  const handleGenerate = async () => {
    if (!flightId || !user || selectedFiles.length === 0) return;
    if (!selectedFiles.some((item) => isVideoUploadFile(item.name))) {
      setProcessingError("Selecione pelo menos um arquivo de video. O SRT deve acompanhar o MP4/MOV, nao substituir o video.");
      return;
    }

    setProcessingError(null);
    setIsAnalyzing(true);
    let analysis: FileAnalysis;
    try {
      const response = await fetch(`${HELPER_URL}/analyze-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPaths: selectedFiles.map((file) => file.path),
          applyLogo,
          processingMode,
        }),
      });
      const body = await response.json().catch(() => ({})) as FileAnalysis & { error?: string };
      if (!response.ok) throw new Error(body.error || `Nao foi possivel analisar os arquivos (${response.status}).`);
      analysis = body;
    } catch (error) {
      setProcessingError((error as Error).message);
      return;
    } finally {
      setIsAnalyzing(false);
    }

    setProcessingStrategy(analysis.strategy);
    if (!analysis.requiresTranscode && analysis.playbackRisk !== "low" && analysis.playbackWarning) {
      const confirmed = window.confirm(
        `${analysis.reason}\n\nAviso de compatibilidade: ${analysis.playbackWarning}\n\nDeseja enviar o arquivo original mesmo assim?`,
      );
      if (!confirmed) return;
    } else if (analysis.requiresTranscode) {
      const slowCpu = !analysis.hardwareAccelerated;
      const incompatibleOriginalMerge = processingMode === "original" && !applyLogo;
      if (slowCpu || incompatibleOriginalMerge) {
        const estimate = analysis.estimatedSeconds
          ? `\n\nTempo estimado nesta maquina: aproximadamente ${formatDurationSec(analysis.estimatedSeconds)}.`
          : "";
        const guidance = applyLogo
          ? "\n\nPara evitar a recodificacao, cancele e desmarque a logo."
          : incompatibleOriginalMerge
            ? "\n\nPara evitar a recodificacao, envie os arquivos separadamente."
            : "\n\nPara ganhar velocidade, cancele e escolha Preservar arquivo original.";
        const confirmed = window.confirm(
          `${analysis.reason}\n\nEncoder: ${analysis.hardwareAccelerated ? analysis.encoder : "CPU (libx264)"}.${estimate}${guidance}\n\nDeseja continuar?`,
        );
        if (!confirmed) return;
      }
    }

    setProgress(0);
    setProgressStage("telemetry-detect");

    const safeExtension = /^\.[a-z0-9]{1,8}$/i.test(analysis.outputExtension)
      ? analysis.outputExtension.toLowerCase()
      : ".mp4";
    const videoKey = `flight-${flightId}-${Date.now()}${safeExtension}`;
    const { id: docId, error: docError } = await createFlightVideoDoc({
      flightId,
      uploadedBy: user.id,
      originalFilesCount: selectedFiles.filter((item) => isVideoUploadFile(item.name)).length,
      actorUserId: user.id,
      actorRole: user.role,
      applyLogo,
      videoKey,
    });
    if (docError || !docId) {
      setProcessingError(docError?.message ?? "Erro ao criar registro do vídeo");
      return;
    }

    let sessionJwt = "";
    try {
      if (account) {
        const jwtResult = await account.createJWT();
        sessionJwt = jwtResult.jwt;
      }
    } catch {
      // sem JWT o helper não atualizará o Appwrite, mas continua (frontend reconcilia no R2)
    }

    const appwriteEndpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string;
    const appwriteProjectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string;
    const appwriteDbId = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
    const videosColId = import.meta.env.VITE_APPWRITE_VIDEOS_COLLECTION_ID as string;
    let workerConfig: { url: string; token: string } | null = null;
    try {
      workerConfig = await getWorkerConfig({ mode: "upload", flightId, key: videoKey });
    } catch (e) {
      await updateFlightVideoFailed(docId, (e as Error).message);
      setProcessingError((e as Error).message);
      setProcessingJobId(null);
      return;
    }
    if (!workerConfig) {
      const message = "Storage não configurado. Verifique a Function administrativa e as variáveis CF_WORKER_URL/WORKER_SECRET.";
      await updateFlightVideoFailed(docId, message);
      setProcessingError(message);
      setProcessingJobId(null);
      return;
    }

    try {
      const res = await fetch(`${HELPER_URL}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: docId,
          videoPaths: selectedFiles.map((file) => file.path),
          cfWorkerUrl: workerConfig.url,
          cfWorkerToken: workerConfig.token,
          videoKey,
          appwriteEndpoint,
          appwriteProjectId,
          appwriteDbId,
          videosColId,
          sessionJwt,
          flightVideoDocId: docId,
          applyLogo,
          logoUrl: applyLogo ? getCachedVideoBrand().logoUrl : "",
          processingMode,
          confirmTranscode: analysis.requiresTranscode,
        }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Helper retornou ${res.status}`);
    } catch (e) {
      const message = `Erro ao iniciar processamento: ${(e as Error).message}`;
      await updateFlightVideoFailed(docId, message);
      setProcessingError(message);
      setProcessingJobId(null);
      return;
    }

    evtSourceRef.current?.close();
    const evtSource = new EventSource(`${HELPER_URL}/progress/${docId}`);
    evtSourceRef.current = evtSource;
    setProcessingJobId(docId);

    evtSource.onmessage = async (e) => {
      const payload = JSON.parse(e.data) as ProgressPayload;
      setProgressStage(payload.stage);
      setProgress(payload.percent);
      if (payload.strategy) setProcessingStrategy(payload.strategy);

      if (payload.stage === "done") {
        evtSource.close();
        if (payload.file_url) {
          await updateFlightVideoReady(docId, {
            fileUrl: payload.file_url,
            fileSize: payload.file_size ?? null,
            durationSec: payload.duration_sec ?? null,
            telemetryPresent: payload.telemetry_present,
            telemetrySource: payload.telemetry_source,
            telemetryJson: payload.telemetry_json,
            availableWidgets: payload.available_widgets,
          });
        }
        setIsDone(true);
        void loadVideos();
      } else if (payload.stage === "error") {
        evtSource.close();
        setProcessingError(payload.message ?? "Erro desconhecido no processamento");
        setProcessingJobId(null);
        void updateFlightVideoFailed(docId, payload.message ?? "Erro desconhecido no processamento");
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      // Se isDone já está true, ignorar o erro de fechamento
    };
  };

  const handleCancel = async () => {
    if (!processingJobId) return;
    evtSourceRef.current?.close();
    try {
      await fetch(`${HELPER_URL}/cancel/${processingJobId}`, { method: "POST" });
    } catch {
      // ignorar
    }
    await updateFlightVideoFailed(processingJobId, "Cancelado pelo usuario");
    setProcessingJobId(null);
    setProcessingStrategy(null);
    setProgress(0);
    setProgressStage(null);
  };

  const handleDeleteVideo = async (id: string) => {
    if (!confirm("Apagar este vídeo?")) return;
    await deleteFlightVideo(id);
    void loadVideos();
  };

  const handleRetry = async (docId: string) => {
    await deleteFlightVideo(docId);
    setSelectedFiles([]);
    void loadVideos();
  };

  // --- Renderização ---

  if (!flightId) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
        Salve o voo primeiro para adicionar vídeos.
      </div>
    );
  }

  const isActive = !!processingJobId && !isDone;
  const showPickButton = isInstructor && selectedFiles.length === 0 && !isActive && !isDone;
  const showFileSelection = isInstructor && selectedFiles.length > 0 && !isActive && !isDone;
  const showProgressUI = !!processingJobId && !isDone;

  const mainVideosContent = (
    <div className="space-y-6">
      {/* Instrutor: seção de ação */}
      {isInstructor && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-5">
          <p className="mb-4 text-sm font-medium text-slate-200">Processar gravação do voo</p>

          {/* Status do helper */}
          <HelperStatusBadge status={helperStatus} onRetry={checkHelper} />

          {/* Aviso de storage não configurado */}
          {!isVideoStorageConfigured() && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              Storage não configurado. Verifique a Function administrativa e as variáveis <code>CF_WORKER_URL</code>/<code>WORKER_SECRET</code>.
            </div>
          )}

          {/* Botão selecionar arquivos */}
          {showPickButton && helperStatus === "online" && isVideoStorageConfigured() && (
            <button
              type="button"
              onClick={handleOpenFilePicker}
              className="mt-4 flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              <span>📂</span> Selecionar vídeos
            </button>
          )}

          {/* Lista de arquivos selecionados */}
          {showFileSelection && (
            <FileSelectionList
              files={selectedFiles}
              onRemove={handleRemoveFile}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onGenerate={() => void handleGenerate()}
              onAddMore={handleOpenFilePicker}
              applyLogo={applyLogo}
              onApplyLogoChange={setApplyLogo}
              processingMode={processingMode}
              onProcessingModeChange={setProcessingMode}
              isAnalyzing={isAnalyzing}
            />
          )}

          {/* UI de envio + processamento unificada */}
          {showProgressUI && (
            <UploadProgress
              stage={progressStage}
              percent={progress}
              strategy={processingStrategy}
              onCancel={() => void handleCancel()}
            />
          )}

          {/* Concluído */}
          {isDone && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-950/20 px-3 py-2 text-sm text-green-300">
              <span>✓</span>
              <span>Vídeo processado e enviado com sucesso.</span>
              <button
                type="button"
                onClick={() => {
                  setIsDone(false);
                  setSelectedFiles([]);
                  setProcessingJobId(null);
                  setApplyLogo(false);
                }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-200"
              >
                Processar outro
              </button>
            </div>
          )}

          {/* Erro */}
          {processingError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-300">
              {processingError}
            </div>
          )}
        </div>
      )}

      {/* Lista de vídeos */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">
            {loadingVideos && videos.length === 0
              ? "Carregando vídeos…"
              : videos.length === 0
              ? "Nenhum vídeo ainda"
              : `${videos.length} vídeo${videos.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {loadingVideos && videos.length === 0 ? (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-16 w-24 shrink-0 rounded" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : videos.length > 0 ? (
          <ul className="space-y-2">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                isInstructor={isInstructor}
                publicMode={publicMode}
                onDelete={() => void handleDeleteVideo(v.id)}
                onRetry={() => void handleRetry(v.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );

  return mainVideosContent;
}

// --- Sub-componentes ---

function HelperStatusBadge({ status, onRetry }: { status: HelperStatus; onRetry: () => void }) {
  const isProduction = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
        Verificando helper local…
      </div>
    );
  }

  if (status === "online") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        Helper local ativo
      </div>
    );
  }

  async function requestPermission() {
    try {
      // Chrome 131+ expõe local-network-access como permissão explícita
      const result = await (navigator.permissions as unknown as { request: (d: object) => Promise<{ state: string }> }).request({ name: "local-network-access" });
      if (result.state === "granted") onRetry();
    } catch {
      // API não suportada — usuário precisa configurar manualmente
    }
  }

  if (isProduction) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Helper bloqueado pelo Chrome
        </div>
        <p className="text-xs text-amber-400/80">
          O Chrome bloqueia acesso ao helper local quando o sistema é aberto pelo link da nuvem. Você tem duas opções:
        </p>
        <div className="space-y-2 text-xs text-slate-300">
          <div className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1">
            <p className="font-medium text-slate-200">Opção 1 — Liberar no Chrome (uma vez por máquina)</p>
            <p className="text-slate-400">
              Clique no ícone de controles/ferramentas à esquerda da URL e habilite a permissão para permitir apps no dispositivo ou acesso à rede local.
            </p>
            <p className="text-slate-400">Se preferir, abra uma nova aba e cole:</p>
            <code className="block select-all rounded bg-slate-900 px-2 py-1 text-sky-400 text-[11px]">
              chrome://settings/content/localNetworkAccess
            </code>
            <p className="text-slate-400">Clique em <strong className="text-slate-300">Adicionar</strong> e insira <strong className="text-slate-300">{window.location.origin}</strong></p>
          </div>
          <div className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1">
            <p className="font-medium text-slate-200">Opção 2 — Abrir o sistema localmente</p>
            <p className="text-slate-400">Com o helper rodando, acesse o sistema pelo endereço local em vez do link da nuvem.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={requestPermission} className="text-xs text-sky-400 underline-offset-4 hover:underline">
            Solicitar permissão
          </button>
          <a
            href={HELPER_SETUP_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 underline-offset-4 hover:underline"
          >
            Ver passo a passo
          </a>
          <button type="button" onClick={onRetry} className="text-xs text-slate-400 underline-offset-4 hover:underline">
            Verificar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Helper local não encontrado
      </div>
      <p className="mt-1.5 text-xs text-amber-400/80">
        Para processar vídeos, baixe e execute o <strong>Garmin Flight Video Helper</strong> na sua máquina. Ele deve estar rodando em segundo plano.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a
          href={HELPER_SETUP_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 underline-offset-4 hover:underline"
        >
          Ver passo a passo
        </a>
        <button type="button" onClick={onRetry} className="text-xs text-slate-400 underline-offset-4 hover:underline">
          Verificar novamente
        </button>
      </div>
    </div>
  );
}

function FileSelectionList({
  files,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onGenerate,
  onAddMore,
  applyLogo,
  onApplyLogoChange,
  processingMode,
  onProcessingModeChange,
  isAnalyzing,
}: {
  files: SelectedFile[];
  onRemove: (i: number) => void;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDragEnd: () => void;
  onGenerate: () => void;
  onAddMore: () => void;
  applyLogo: boolean;
  onApplyLogoChange: (value: boolean) => void;
  processingMode: ProcessingMode;
  onProcessingModeChange: (value: ProcessingMode) => void;
  isAnalyzing: boolean;
}) {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-slate-500">Arraste para reordenar. Ordem = sequência de concatenação.</p>
      <ul className="space-y-1.5">
        {files.map((f, i) => (
          <li
            key={`${f.name}-${i}`}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={(e) => onDragOver(e, i)}
            onDragEnd={onDragEnd}
            className="flex min-w-0 cursor-grab items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 active:cursor-grabbing"
          >
            <span className="shrink-0 text-slate-600">⠿</span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{f.name}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="shrink-0 text-xs text-slate-600 hover:text-red-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 lg:grid-cols-3">
        <label className={`cursor-pointer rounded-lg border px-3 py-2.5 text-xs ${
          processingMode === "original"
            ? "border-sky-500/60 bg-sky-950/30 text-sky-100"
            : "border-slate-700/60 bg-slate-900/50 text-slate-300"
        }`}>
          <span className="flex items-center gap-2 font-medium">
            <input
              type="radio"
              name="video-processing-mode"
              checked={processingMode === "original"}
              onChange={() => onProcessingModeChange("original")}
              className="accent-sky-500"
            />
            Preservar arquivo original
          </span>
          <span className="mt-1 block pl-5 text-[10px] leading-4 text-slate-400">
            Mais rápido. Aceita HEVC e outros codecs, com possível limitação de reprodução.
          </span>
        </label>
        <label className={`cursor-pointer rounded-lg border px-3 py-2.5 text-xs ${
          processingMode === "compatible"
            ? "border-sky-500/60 bg-sky-950/30 text-sky-100"
            : "border-slate-700/60 bg-slate-900/50 text-slate-300"
        }`}>
          <span className="flex items-center gap-2 font-medium">
            <input
              type="radio"
              name="video-processing-mode"
              checked={processingMode === "compatible"}
              onChange={() => onProcessingModeChange("compatible")}
              className="accent-sky-500"
            />
            Compatibilidade máxima
          </span>
          <span className="mt-1 block pl-5 text-[10px] leading-4 text-slate-400">
            Mantém H.264 compatível ou converte outros codecs quando necessário.
          </span>
        </label>
        <label className={`cursor-pointer rounded-lg border px-3 py-2.5 text-xs ${
          processingMode === "compressed"
            ? "border-sky-500/60 bg-sky-950/30 text-sky-100"
            : "border-slate-700/60 bg-slate-900/50 text-slate-300"
        }`}>
          <span className="flex items-center gap-2 font-medium">
            <input
              type="radio"
              name="video-processing-mode"
              checked={processingMode === "compressed"}
              onChange={() => onProcessingModeChange("compressed")}
              className="accent-sky-500"
            />
            Compactar para economizar espaço
          </span>
          <span className="mt-1 block pl-5 text-[10px] leading-4 text-slate-400">
            Usa GPU ou CPU e pode demorar bastante em computadores fracos.
          </span>
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={applyLogo}
          onChange={(event) => onApplyLogoChange(event.target.checked)}
          className="size-4 accent-sky-500"
        />
        Aplicar a logo da escola no vídeo
        <span className="ml-auto text-[10px] text-slate-500">exige recodificação</span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isAnalyzing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {isAnalyzing ? "Analisando computador e arquivos..." : "Continuar com o upload"}
        </button>
        <button
          type="button"
          onClick={onAddMore}
          className="text-center text-xs text-slate-400 underline-offset-4 hover:underline sm:text-left"
        >
          + Selecionar outros
        </button>
      </div>
    </div>
  );
}

type PipelineStep = { key: ProcessStage; label: string };

function strategyStep(strategy: ProcessingStrategy | null): PipelineStep {
  if (strategy === "direct") return { key: "direct", label: "Preparando envio do arquivo original" };
  if (strategy === "remux") return { key: "remux", label: "Convertendo rapidamente para MP4" };
  if (strategy === "concat-copy") return { key: "concat-copy", label: "Unindo vídeos sem compactar" };
  return { key: "transcode", label: "Recodificando vídeo" };
}

function UploadProgress({
  stage,
  percent,
  strategy,
  onCancel,
}: {
  stage: ProcessStage | null;
  percent: number;
  strategy: ProcessingStrategy | null;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, []);

  const inferredStrategy: ProcessingStrategy | null = strategy
    ?? (stage === "direct" || stage === "remux" || stage === "concat-copy" || stage === "transcode" ? stage : null);
  const processStep = strategyStep(inferredStrategy);
  const pipeline: PipelineStep[] = [
    { key: "telemetry-detect", label: "Procurando telemetria GPS" },
    processStep,
    { key: "upload", label: "Enviando para armazenamento" },
  ];
  const currentKey: ProcessStage = stage === "concat" || stage === "compress" || stage === "watermark"
    ? "transcode"
    : stage ?? processStep.key;
  const currentIdx = pipeline.findIndex((p) => p.key === currentKey);

  return (
    <div className="mt-4 space-y-4">
      {/* Aviso contextual */}
      <p
        className="flex items-center gap-1.5 text-[11px] text-slate-400"
      >
        <span>ℹ</span>
        <span>Pode fechar esta aba. Mantenha o Flight Video Helper aberto.</span>
      </p>

      {/* Pipeline de etapas */}
      <div className="space-y-2.5">
        {pipeline.map(({ key, label }, i) => {
          const isActive = key === currentKey;
          const isPast = i < currentIdx;
          const pct = isPast
            ? 1
            : isActive
              ? percent / 100
              : 0;
          const pctLabel = isPast ? "✓" : isActive ? `${Math.round(pct * 100)}%` : "—";

          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`text-xs font-medium ${isActive ? "text-sky-300" : isPast ? "text-emerald-400" : "text-slate-600"}`}
                >
                  {i + 1}. {label}
                </span>
                <span
                  className={`text-[11px] tabular-nums ${isActive ? "text-sky-400" : isPast ? "text-emerald-500" : "text-slate-700"}`}
                >
                  {pctLabel}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isActive ? "bg-sky-500" : isPast ? "bg-emerald-500" : "bg-slate-700"}`}
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé: tempo decorrido + cancelar */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500">Decorrido: {fmt(elapsed)}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 underline-offset-4 hover:text-red-400 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function toKt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function modelToAirspeedArcs(model: AircraftModel | null): AirspeedArcLimits | null {
  if (!model) return null;
  const arcs: AirspeedArcLimits = {
    whiteMin: toKt(model.white_arc_min_kt),
    whiteMax: toKt(model.white_arc_max_kt),
    greenMin: toKt(model.green_arc_min_kt),
    greenMax: toKt(model.green_arc_max_kt),
    yellowMin: toKt(model.yellow_arc_min_kt),
    yellowMax: toKt(model.yellow_arc_max_kt),
    vne: toKt(model.vne_kt),
  };
  const hasArc = Object.values(arcs).some((value) => value != null);
  return hasArc ? arcs : null;
}

function videoRotationStyle(rotationDeg: number): CSSProperties | undefined {
  const rot = ((rotationDeg % 360) + 360) % 360;
  if (!rot) return undefined;
  return { transform: `rotate(${rot}deg)`, transformOrigin: "center center" };
}

function useVideoStageSize(
  parentRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  rotationDeg: number,
  bindKey: string,
  fit: VideoStageFit,
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const parent = parentRef.current;
    const video = videoRef.current;
    if (!parent) return;

    const update = () => {
      const pr = parent.getBoundingClientRect();
      const vw = video?.videoWidth ?? 0;
      const vh = video?.videoHeight ?? 0;
      setSize(computeVideoStageSize(pr.width, pr.height, vw, vh, rotationDeg, fit));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("loadeddata", update);
    return () => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", update);
      video?.removeEventListener("loadeddata", update);
    };
  }, [parentRef, videoRef, rotationDeg, bindKey, fit]);

  return size;
}

function TelemetryVideoPlayer({ video, publicMode = false }: { video: FlightVideo; publicMode?: boolean }) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoStageParentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const altitudeChartRef = useRef<HTMLCanvasElement>(null);
  const speedChartRef = useRef<HTMLCanvasElement>(null);
  const points = useMemo(() => parseVideoTelemetryJson(video.telemetry_json), [video.telemetry_json]);
  const available = useMemo(() => expandAvailableTelemetryWidgets(parseAvailableWidgets(video.available_widgets), points), [points, video.available_widgets]);
  const defaultWidgets = useMemo(() => available.filter((w) => w !== "route").slice(0, 4), [available]);
  const [enabledWidgets, setEnabledWidgets] = useState<VideoTelemetryWidget[]>(defaultWidgets);
  const [overlayStyle, setOverlayStyle] = useState<TelemetryOverlayStyle>("hud");
  const [currentPoint, setCurrentPoint] = useState<VideoTelemetryPoint | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [airspeedArcs, setAirspeedArcs] = useState<AirspeedArcLimits | null>(null);
  const [routeMap, setRouteMap] = useState<VideoRouteMapData | null>(null);
  const [trimStartSec, setTrimStartSec] = useState<number | null>(null);
  const [trimEndSec, setTrimEndSec] = useState<number | null>(null);
  const [chartsFollowTrim, setChartsFollowTrim] = useState(true);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [videoRotationDeg, setVideoRotationDeg] = useState(0);
  const [verticalCropPct, setVerticalCropPct] = useState(50);
  const videoStageFit: VideoStageFit = orientation === "vertical" ? "cover" : "contain";
  const videoStageSize = useVideoStageSize(
    videoStageParentRef,
    videoRef,
    videoRotationDeg,
    `${orientation}-${video.id}`,
    videoStageFit,
  );
  const videoStageStyle = useMemo((): CSSProperties => {
    if (orientation === "vertical") {
      return { width: "100%", height: "100%" };
    }
    if (videoStageSize) {
      return { width: videoStageSize.width, height: videoStageSize.height };
    }
    return { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" };
  }, [orientation, videoStageSize]);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadHelperStatus, setDownloadHelperStatus] = useState<HelperStatus>("checking");
  const [brand, setBrand] = useState(() => getCachedVideoBrand());
  const verticalDragRef = useRef<{ startX: number; startCrop: number; moved: boolean } | null>(null);
  const currentTimeRef = useRef(0);

  const verticalSpeedFpm = useMemo(
    () => verticalSpeedFpmAtTime(points, currentTimeSec),
    [points, currentTimeSec],
  );

  useEffect(() => {
    setEnabledWidgets(defaultWidgets);
  }, [defaultWidgets, video.id]);

  useEffect(() => {
    let cancelled = false;
    void getEmailBrandSettings()
      .then((settings) => {
        if (cancelled) return;
        setBrand({
          schoolName: settings.schoolName?.trim() || "Escola",
          logoUrl: settings.logoDataUrl || settings.logoUrl || "",
        });
      })
      .catch(() => {
        if (!cancelled) setBrand(getCachedVideoBrand());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (publicMode) {
      setAirspeedArcs(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const flight = await getSavedFlight(video.flight_id);
      if (cancelled || !flight.data?.aircraft_ident) {
        if (!cancelled) setAirspeedArcs(null);
        return;
      }
      const aircraft = await getAircraftByRegistration(flight.data.aircraft_ident, SCHOOL_ID ?? "");
      if (cancelled || !aircraft?.model_id) {
        if (!cancelled) setAirspeedArcs(null);
        return;
      }
      const model = await getModelById(aircraft.model_id);
      if (cancelled) return;
      setAirspeedArcs(modelToAirspeedArcs(model));
    })();
    return () => {
      cancelled = true;
    };
  }, [video.flight_id, publicMode]);

  useEffect(() => {
    let cancelled = false;
    if (points.length < 2) {
      setRouteMap(null);
      return;
    }
    const frameW = orientation === "vertical" ? 608 : 1920;
    const frameH = 1080;
    const { w: mapW, h: mapH } = routeMapSourceSize(frameW, frameH, orientation === "vertical");
    void buildVideoRouteMap(points, mapW, mapH).then((map) => {
      if (!cancelled) setRouteMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [points, orientation]);

  const syncPlaybackState = useCallback((el: HTMLVideoElement) => {
    const time = el.currentTime;
    currentTimeRef.current = time;
    setCurrentTimeSec(time);
    setCurrentPoint(points.length > 0 ? pointAtVideoTime(points, time) : null);
  }, [points]);

  // The 16:9 and 9:16 previews mount different <video> elements. Rebind listeners
  // when orientation changes so widgets and the trim playhead keep following playback.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let restoredTime = false;
    const restoreAndSync = () => {
      if (!restoredTime) {
        const targetTime = currentTimeRef.current;
        const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
        const clampedTime = duration === null ? targetTime : Math.max(0, Math.min(duration, targetTime));
        if (clampedTime > 0 && Math.abs(el.currentTime - clampedTime) > 0.25) {
          try {
            el.currentTime = clampedTime;
            restoredTime = true;
          } catch {
            // Some browsers reject seeks before metadata is ready; loadedmetadata will retry.
          }
        } else {
          restoredTime = true;
        }
      }
      syncPlaybackState(el);
    };
    const update = () => syncPlaybackState(el);

    if (el.readyState >= 1) restoreAndSync();
    else update();

    el.addEventListener("loadedmetadata", restoreAndSync);
    el.addEventListener("loadeddata", restoreAndSync);
    el.addEventListener("durationchange", restoreAndSync);
    el.addEventListener("timeupdate", update);
    el.addEventListener("seeked", update);
    el.addEventListener("play", update);
    return () => {
      el.removeEventListener("loadedmetadata", restoreAndSync);
      el.removeEventListener("loadeddata", restoreAndSync);
      el.removeEventListener("durationchange", restoreAndSync);
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("seeked", update);
      el.removeEventListener("play", update);
    };
  }, [orientation, syncPlaybackState, video.id]);

  useEffect(() => {
    // Double-rAF: first frame commits the DOM (new canvas mounts), second frame draws after layout
    let raf1: number;
    let raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const mapFit = "cover";
        const mapStyle = overlayStyle === "hud" ? "hud" : "compact";
        const mapPanelOpacity = orientation === "vertical" ? 0.9 : 1;
        drawVideoRouteMapBase(canvas, routeMap, points, mapStyle, mapFit, mapPanelOpacity);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [points, routeMap, overlayStyle, orientation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mapFit = "cover";
    const mapStyle = overlayStyle === "hud" ? "hud" : "compact";
    const mapPanelOpacity = orientation === "vertical" ? 0.9 : 1;
    drawVideoRouteMapMarker(canvas, routeMap, points, currentPoint, mapStyle, mapFit, mapPanelOpacity);
  }, [points, currentPoint, routeMap, overlayStyle, orientation]);

  const chartPoints = useMemo(
    () => telemetryChartPoints(points, trimStartSec, trimEndSec, chartsFollowTrim),
    [points, trimStartSec, trimEndSec, chartsFollowTrim],
  );

  const chartDrawStyle = "hud" as const;

  const redrawCharts = useCallback(() => {
    if (altitudeChartRef.current) {
      drawTelemetryChart(altitudeChartRef.current, chartPoints, currentPoint, "altitude", chartDrawStyle);
    }
    if (speedChartRef.current) {
      drawTelemetryChart(speedChartRef.current, chartPoints, currentPoint, "speed", chartDrawStyle);
    }
  }, [chartPoints, currentPoint, chartDrawStyle]);

  const redrawRouteMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mapFit = "cover";
    const mapStyle = overlayStyle === "hud" ? "hud" : "compact";
    const mapPanelOpacity = orientation === "vertical" ? 0.9 : 1;
    drawVideoRouteMapBase(canvas, routeMap, points, mapStyle, mapFit, mapPanelOpacity);
    drawVideoRouteMapMarker(canvas, routeMap, points, currentPoint, mapStyle, mapFit, mapPanelOpacity);
  }, [points, currentPoint, routeMap, overlayStyle, orientation]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      redrawCharts();
      redrawRouteMap();
    });
    return () => cancelAnimationFrame(raf);
  }, [redrawCharts, redrawRouteMap, enabledWidgets, overlayStyle, orientation]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!overlay && !container) return;
    const observer = new ResizeObserver(() => {
      redrawCharts();
      redrawRouteMap();
    });
    if (overlay) observer.observe(overlay);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [redrawCharts, redrawRouteMap]);

  const hasTelemetry = video.telemetry_present && points.length > 1 && available.length > 0;
  const isStudent = user?.role !== "instrutor" && user?.role !== "admin";
  const isMobileOrTablet = useMemo(() => isMobileOrTabletDevice(), []);

  const checkDownloadHelper = useCallback(async () => {
    setDownloadHelperStatus("checking");
    setDownloadHelperStatus(await getHelperStatus());
  }, []);

  const seekVideo = useCallback(
    (t: number) => {
      currentTimeRef.current = t;
      setCurrentTimeSec(t);
      setCurrentPoint(points.length > 0 ? pointAtVideoTime(points, t) : null);
      if (videoRef.current) videoRef.current.currentTime = t;
    },
    [points],
  );

  const togglePlayPause = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("Tela cheia indisponível:", err);
    }
  }, []);

  function toggleWidget(widget: VideoTelemetryWidget) {
    setEnabledWidgets((current) =>
      current.includes(widget) ? current.filter((item) => item !== widget) : [...current, widget],
    );
  }

  async function handleRenderedDownload() {
    const exportWidgets = enabledWidgets.filter((w) => w !== "route");
    if (exportWidgets.length === 0) {
      setExportError("Selecione altitude, velocidade ou rumo para gerar o MP4.");
      return;
    }
    const startSec = trimStartSec ?? 0;
    const endSec = trimEndSec ?? (points.length > 0 ? points[points.length - 1].timeMs / 1000 : 0);
    if (endSec <= startSec) {
      setExportError("Trecho inválido — marque início antes do fim.");
      return;
    }

    const jobId = `overlay-${Date.now()}`;
    const outputKey = `flight-${video.flight_id}-${video.id}-telemetry-${Date.now()}.mp4`;
    const blank: ExportProgress = {
      stage: "render", renderPct: 0, uploadPct: 0, processPct: 0, finalizePct: 0,
    };

    setExporting(true);
    setExportError(null);
    setExportProgress(blank);

    const upd = (patch: Partial<ExportProgress>) =>
      setExportProgress((p) => ({ ...(p ?? blank), ...patch }));

    try {
      const workerConfig = await getWorkerConfig({ mode: "upload", flightId: video.flight_id, key: outputKey });
      if (!workerConfig) {
        setExportError("Storage nao configurado para exportar o MP4.");
        setExporting(false);
        return;
      }
      // Stage 1 — render overlay video in browser (dims = área útil do overlay, não o container externo)
      const overlayEl = overlayRef.current;
      const playerWidth = overlayEl?.clientWidth ?? containerRef.current?.clientWidth ?? 1280;
      const playerHeight = overlayEl?.clientHeight ?? containerRef.current?.clientHeight ?? 720;
      const videoEl = videoRef.current;
      const overlay = await renderOverlayVideo({
        points,
        chartPoints,
        widgets: enabledWidgets,
        startSec,
        endSec,
        orientation,
        brand: brand?.schoolName ?? "",
        playerWidth,
        playerHeight,
        overlayStyle,
        airspeedArcs,
        routeMap: enabledWidgets.includes("route") ? routeMap : null,
        onProgress: (stage, pct) => {
          if (stage === "render") upd({ stage: "render", renderPct: pct });
        },
      });

      // Stage 2 — upload overlay to helper + start composite job
      upd({ stage: "upload", renderPct: 1 });
      await uploadOverlayAndComposite(
        HELPER_URL,
        overlay,
        {
          videoUrl: video.file_url!,
          cfWorkerUrl: workerConfig.url,
          cfWorkerToken: workerConfig.token,
          outputKey,
          trimStartSec: trimStartSec ?? undefined,
          trimEndSec: trimEndSec ?? undefined,
          orientation,
          verticalCropPct: orientation === "vertical" ? verticalCropPct : undefined,
          videoRotationDeg: videoRotationDeg || undefined,
          sourceVideoWidth: videoEl?.videoWidth || undefined,
          sourceVideoHeight: videoEl?.videoHeight || undefined,
          jobId,
        },
        (pct) => upd({ uploadPct: pct }),
      );

      // Stages 3 & 4 — watch SSE progress from helper
      upd({ stage: "process", uploadPct: 1 });
      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(`${HELPER_URL}/progress/${jobId}`);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string) as {
              stage: string; percent: number; fileUrl?: string; message?: string;
            };
            if (data.stage === "upload") {
              upd({ stage: "finalize", processPct: 1, finalizePct: data.percent / 100 });
            } else if (data.stage === "done") {
              upd({ stage: "done", finalizePct: 1, fileUrl: data.fileUrl });
              es.close();
              resolve();
            } else if (data.stage === "error") {
              es.close();
              reject(new Error(data.message ?? "Erro no helper"));
            } else {
              upd({ stage: "process", processPct: data.percent / 100 });
            }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => { es.close(); reject(new Error("Conexão com helper perdida")); };
      });

    } catch (e) {
      const msg = (e as Error).message;
      setExportError(msg);
      upd({ stage: "error", errorMsg: msg });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative aspect-video w-full rounded-lg border border-slate-800 bg-black flex items-center justify-center overflow-hidden"
      >
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title="Tela cheia"
          className="absolute right-2 top-2 z-30 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-black/75"
        >
          ⛶
        </button>
        {orientation === "vertical" ? (
          <div className="flex h-full aspect-[9/16] flex-col overflow-hidden select-none">
            <div
              ref={videoStageParentRef}
              className="relative min-h-0 flex-1 overflow-hidden bg-black"
            >
              <div
                ref={overlayRef}
                className="video-overlay-root relative h-full w-full overflow-hidden"
                style={videoStageStyle}
              >
                <video
                  ref={videoRef}
                  src={video.file_url}
                  preload="metadata"
                  playsInline
                  className="absolute inset-0 h-full w-full bg-black object-cover"
                  style={{
                    objectPosition: `${verticalCropPct}% center`,
                    ...videoRotationStyle(videoRotationDeg),
                  }}
                />
                {hasTelemetry && (
                  <div className="absolute inset-0">
                    <TelemetryBrandMark brand={brand} compact />
                    <VerticalCompactOverlay
                      altitudeChartRef={altitudeChartRef}
                      canvasRef={canvasRef}
                      currentPoint={currentPoint}
                      enabledWidgets={enabledWidgets}
                      speedChartRef={speedChartRef}
                      verticalSpeedFpm={verticalSpeedFpm}
                    />
                  </div>
                )}
              <div
                className="video-stage-interactive absolute inset-0 z-10 cursor-ew-resize touch-none"
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  verticalDragRef.current = { startX: e.clientX, startCrop: verticalCropPct, moved: false };
                }}
                onPointerMove={(e) => {
                  if (!verticalDragRef.current) return;
                  const deltaX = Math.abs(e.clientX - verticalDragRef.current.startX);
                  if (deltaX > 4) verticalDragRef.current.moved = true;
                  const el = e.currentTarget as HTMLElement;
                  const deltaPct = ((e.clientX - verticalDragRef.current.startX) / el.clientWidth) * 100;
                  setVerticalCropPct(Math.max(0, Math.min(100, verticalDragRef.current.startCrop - deltaPct)));
                }}
                onPointerUp={() => {
                  if (verticalDragRef.current && !verticalDragRef.current.moved) togglePlayPause();
                  verticalDragRef.current = null;
                }}
                onPointerCancel={() => { verticalDragRef.current = null; }}
              />
                <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-[9px] text-white/60">
                  ← arraste para enquadrar →
                </div>
              </div>
            </div>
            <VideoPlaybackControls
              videoRef={videoRef}
              durationSec={video.duration_sec ?? 0}
              currentTimeSec={currentTimeSec}
              playbackBindKey={`${orientation}-${video.id}`}
              onSeek={seekVideo}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <div
              ref={videoStageParentRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
            >
              <div
                ref={overlayRef}
                className="video-overlay-root relative max-h-full max-w-full shrink-0 overflow-hidden"
                style={videoStageStyle}
              >
                <video
                  ref={videoRef}
                  src={video.file_url}
                  preload="metadata"
                  playsInline
                  className="absolute inset-0 h-full w-full bg-black object-cover"
                  style={videoRotationStyle(videoRotationDeg)}
                />
                <button
                  type="button"
                  className="video-stage-interactive absolute inset-0 z-[4] cursor-pointer border-0 bg-transparent p-0"
                  aria-label="Reproduzir ou pausar"
                  onClick={togglePlayPause}
                />
                {hasTelemetry && (
                  <div className="absolute inset-0">
                    <TelemetryBrandMark brand={brand} compact={overlayStyle === "compact"} />
                    {overlayStyle === "hud" ? (
                      <HudTelemetryOverlay
                        airspeedArcs={airspeedArcs}
                        altitudeChartRef={altitudeChartRef}
                        canvasRef={canvasRef}
                        currentPoint={currentPoint}
                        enabledWidgets={enabledWidgets}
                        speedChartRef={speedChartRef}
                        verticalSpeedFpm={verticalSpeedFpm}
                      />
                    ) : (
                      <CompactTelemetryOverlay
                        airspeedArcs={airspeedArcs}
                        altitudeChartRef={altitudeChartRef}
                        canvasRef={canvasRef}
                        currentPoint={currentPoint}
                        enabledWidgets={enabledWidgets}
                        speedChartRef={speedChartRef}
                        verticalSpeedFpm={verticalSpeedFpm}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            <VideoPlaybackControls
              videoRef={videoRef}
              durationSec={video.duration_sec ?? 0}
              currentTimeSec={currentTimeSec}
              playbackBindKey={`${orientation}-${video.id}`}
              onSeek={seekVideo}
            />
          </div>
        )}
      </div>

      {hasTelemetry && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/35 p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(["hud", "compact"] as TelemetryOverlayStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => { setOverlayStyle(style); }}
                  disabled={orientation === "vertical"}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-40 ${
                    overlayStyle === style && orientation !== "vertical" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {style === "hud" ? "HUD" : "Compacto"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {available.map((widget) => (
                <button
                  key={widget}
                  type="button"
                  onClick={() => toggleWidget(widget)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    enabledWidgets.includes(widget)
                      ? "bg-sky-500/20 text-sky-200"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {widgetLabel(widget)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Seleção de trecho + orientação */}
      {!publicMode && (
      <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Botões de orientação — à esquerda, junto dos botões de corte */}
          {(["horizontal", "vertical"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                if (videoRef.current) currentTimeRef.current = videoRef.current.currentTime;
                setOrientation(o);
              }}
              title={o === "horizontal" ? "Horizontal (16:9)" : "Vertical (9:16)"}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
                orientation === o ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {o === "horizontal" ? (
                <span
                  className="inline-block rounded-sm border-[1.5px] border-current"
                  style={{ width: 18, height: 11 }}
                />
              ) : (
                <span
                  className="inline-block rounded-sm border-[1.5px] border-current"
                  style={{ width: 10, height: 16 }}
                />
              )}
              <span>{o === "horizontal" ? "16:9" : "9:16"}</span>
            </button>
          ))}
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
          {videoRotationDeg !== 0 && (
            <button
              type="button"
              onClick={() => setVideoRotationDeg(0)}
              title="Resetar rotação"
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-700"
            >
              {videoRotationDeg}°
            </button>
          )}
          <span className="text-[11px] font-medium text-slate-600">|</span>
          <span className="text-[11px] font-medium text-slate-500">Trecho:</span>
          <button
            type="button"
            onClick={() => setTrimStartSec(currentTimeSec)}
            className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            title="Marcar tempo atual como início"
          >
            ✂ Início{trimStartSec !== null ? ` ${formatDurationSec(trimStartSec)}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTrimEndSec(currentTimeSec)}
            className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            title="Marcar tempo atual como fim"
          >
            ✂ Fim{trimEndSec !== null ? ` ${formatDurationSec(trimEndSec)}` : ""}
          </button>
          {(trimStartSec !== null || trimEndSec !== null) && (
            <button
              type="button"
              onClick={() => { setTrimStartSec(null); setTrimEndSec(null); }}
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-700 hover:text-red-400"
            >
              × Limpar
            </button>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-800/60 px-2 py-1 text-[11px] font-medium text-slate-300">
            <input
              type="checkbox"
              checked={chartsFollowTrim}
              onChange={(e) => setChartsFollowTrim(e.target.checked)}
              className="size-3.5 rounded border-slate-600 accent-sky-500"
            />
            Ajustar gráficos de acordo com o corte
          </label>
        </div>
        {trimStartSec !== null && trimEndSec !== null && trimEndSec > trimStartSec && (
          <p className="text-[10px] text-slate-500">
            Trecho: {formatDurationSec(trimStartSec)} → {formatDurationSec(trimEndSec)}{" "}
            ({formatDurationSec(trimEndSec - trimStartSec)})
          </p>
        )}
        {trimStartSec !== null && trimEndSec !== null && trimEndSec <= trimStartSec && (
          <p className="text-[10px] text-red-400">O fim deve ser depois do início.</p>
        )}
        {/* Timeline visual do corte */}
        {(video.duration_sec ?? 0) > 0 && (
          <TrimTimeline
            durationSec={video.duration_sec!}
            currentTimeSec={currentTimeSec}
            trimStartSec={trimStartSec}
            trimEndSec={trimEndSec}
            onSeek={(t) => {
              currentTimeRef.current = t;
              setCurrentTimeSec(t);
              setCurrentPoint(points.length > 0 ? pointAtVideoTime(points, t) : null);
              if (videoRef.current) videoRef.current.currentTime = t;
            }}
          />
        )}
        {/* Botão de download */}
        <button
          type="button"
          onClick={() => {
            setShowDownloadModal(true);
            if (isStudent && !isMobileOrTablet) void checkDownloadHelper();
          }}
          className="mt-0.5 self-start rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-slate-700"
        >
          ↓ Baixar
        </button>
      </div>
      )}

      {exportError && !exportProgress && (
        <HelperOfflinePanel error={exportError} />
      )}
      {video.telemetry_source === "gopro" && !video.telemetry_present && (
        <p className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200">
          Track GoPro detectado, mas o parser GPMF completo ainda nao extraiu pontos para overlay.
        </p>
      )}

      {!publicMode && showDownloadModal && (
        <DownloadChoiceModal
          videoUrl={video.file_url!}
          hasTelemetry={hasTelemetry}
          exporting={exporting}
          enhancedDownloadBlockedReason={
            isStudent && isMobileOrTablet
              ? "O download com corte e instrumentos só é possível no computador."
              : isStudent && downloadHelperStatus === "checking"
                ? "Verificando a ferramenta de edição..."
                : isStudent && downloadHelperStatus === "offline"
                  ? "É necessário configurar a ferramenta de edição neste computador."
                  : null
          }
          helperSetupHref={HELPER_SETUP_PATH}
          onClose={() => setShowDownloadModal(false)}
          onRetryHelper={checkDownloadHelper}
          onDownloadWithWidgets={() => {
            setShowDownloadModal(false);
            void handleRenderedDownload();
          }}
        />
      )}

      {exportProgress && (
        <ExportModal
          progress={exportProgress}
          onClose={() => { setExportProgress(null); setExporting(false); }}
        />
      )}
    </div>
  );
}

function widgetLabel(widget: VideoTelemetryWidget): string {
  if (widget === "route") return "Rota";
  if (widget === "altitude") return "Altitude";
  if (widget === "speed") return "Velocidade";
  if (widget === "heading") return "Rumo";
  if (widget === "altitudeChart") return "Graf. altitude";
  return "Graf. velocidade";
}

function expandAvailableTelemetryWidgets(available: VideoTelemetryWidget[], points: VideoTelemetryPoint[]): VideoTelemetryWidget[] {
  const set = new Set(available);
  if (points.some((p) => Number.isFinite(p.altitude))) set.add("altitudeChart");
  if (points.some((p) => Number.isFinite(p.speed))) set.add("speedChart");
  return Array.from(set);
}


function VideoCard({
  video,
  isInstructor,
  publicMode = false,
  onDelete,
  onRetry,
}: {
  video: FlightVideo;
  isInstructor: boolean;
  publicMode?: boolean;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const isReady = video.processing_status === "ready";
  const isFailed = video.processing_status === "failed";
  const isPending = !isReady && !isFailed;

  return (
    <li className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <div className="flex flex-col gap-4">
        {isReady && video.file_url && (
          <TelemetryVideoPlayer video={video} publicMode={publicMode} />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-base">
            🎬
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-slate-100">
                Vídeo do voo
              </p>
              <StatusBadge status={video.processing_status} />
            </div>
            <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
              {video.file_size != null && <span>{formatBytes(video.file_size)}</span>}
              {video.duration_sec != null && (
                <span> · {formatDurationSec(video.duration_sec)}</span>
              )}
              {video.original_files_count != null && video.original_files_count > 1 && (
                <span> · {video.original_files_count} arquivos</span>
              )}
              <span> · {formatDate(video.created_at)}</span>
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            {/* Download is handled within TelemetryVideoPlayer via DownloadChoiceModal */}
            {isPending && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            )}
            {isFailed && isInstructor && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs text-amber-400 underline-offset-4 hover:underline"
              >
                Tentar novamente
              </button>
            )}
            {isInstructor && (
              <button
                type="button"
                onClick={onDelete}
                className="text-xs text-slate-600 underline-offset-4 hover:text-red-400 hover:underline"
              >
                Apagar
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function HelperOfflinePanel({ error }: { error: string }) {
  const isConnError = error.toLowerCase().includes("fetch") || error.toLowerCase().includes("connect") || error.toLowerCase().includes("econnrefused") || error.toLowerCase().includes("network");

  if (!isConnError) {
    return (
      <p className="rounded-md border border-red-500/30 bg-red-950/20 px-2 py-1.5 text-xs text-red-300">{error}</p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-2 text-xs text-amber-200">
      <p className="font-semibold">Helper não encontrado</p>
      <p>Para baixar vídeos com telemetria, instale o Flight Video Helper:</p>
      <ol className="list-decimal list-inside space-y-0.5 text-amber-300">
        <li>Baixe o instalador para seu sistema (Windows ou Mac)</li>
        <li>Abra o instalador e siga os passos</li>
        <li>O ícone aparecerá na bandeja do sistema — pronto!</li>
      </ol>
      <a
        href={HELPER_SETUP_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex text-xs font-medium text-sky-300 underline-offset-4 hover:underline"
      >
        Abrir página de ajuda
      </a>
      <p className="text-amber-400/70 text-[10px]">Erro: {error}</p>
    </div>
  );
}

function TrimTimeline({
  durationSec,
  currentTimeSec,
  trimStartSec,
  trimEndSec,
  onSeek,
}: {
  durationSec: number;
  currentTimeSec: number;
  trimStartSec: number | null;
  trimEndSec: number | null;
  onSeek: (t: number) => void;
}) {
  const dur = Math.max(1, durationSec);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / dur) * 100))}%`;

  return (
    <div
      className="relative mt-1 h-5 w-full cursor-pointer rounded bg-slate-800"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(dur, ratio * dur)));
      }}
    >
      {/* Trim region highlight */}
      {trimStartSec !== null && trimEndSec !== null && trimEndSec > trimStartSec && (
        <div
          className="absolute top-0 h-full rounded bg-sky-500/25"
          style={{ left: pct(trimStartSec), width: pct(trimEndSec - trimStartSec) }}
        />
      )}
      {/* Start marker */}
      {trimStartSec !== null && (
        <div
          className="absolute top-0 flex h-full flex-col items-center"
          style={{ left: pct(trimStartSec) }}
        >
          <div className="h-full w-0.5 bg-sky-400" />
          <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1 text-[9px] text-sky-300">
            {formatDurationSec(trimStartSec)}
          </span>
        </div>
      )}
      {/* End marker */}
      {trimEndSec !== null && (
        <div
          className="absolute top-0 flex h-full flex-col items-center"
          style={{ left: pct(trimEndSec) }}
        >
          <div className="h-full w-0.5 bg-amber-400" />
          <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1 text-[9px] text-amber-300">
            {formatDurationSec(trimEndSec)}
          </span>
        </div>
      )}
      {/* Playhead */}
      <div
        className="absolute top-0 h-full w-0.5 bg-white/70"
        style={{ left: pct(currentTimeSec) }}
      />
    </div>
  );
}

function DownloadChoiceModal({
  videoUrl,
  hasTelemetry,
  exporting,
  enhancedDownloadBlockedReason,
  helperSetupHref,
  onClose,
  onRetryHelper,
  onDownloadWithWidgets,
}: {
  videoUrl: string;
  hasTelemetry: boolean;
  exporting: boolean;
  enhancedDownloadBlockedReason: string | null;
  helperSetupHref: string;
  onClose: () => void;
  onRetryHelper: () => void;
  onDownloadWithWidgets: () => void;
}) {
  const enhancedDisabled = exporting || Boolean(enhancedDownloadBlockedReason);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-sm font-semibold text-slate-100">Como deseja baixar?</p>
        <div className="flex flex-col gap-3">
          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700"
            onClick={onClose}
          >
            <span className="text-lg">🎬</span>
            <div>
              <p className="font-medium">Vídeo completo</p>
              <p className="text-xs text-slate-500">Sem instrumentos e sem corte</p>
            </div>
          </a>
          {hasTelemetry && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={enhancedDisabled}
                onClick={onDownloadWithWidgets}
                className="flex w-full items-center gap-3 rounded-lg border border-sky-700/50 bg-sky-950/40 px-4 py-3 text-sm text-sky-200 hover:bg-sky-900/40 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/50 disabled:text-slate-500"
              >
                <span className="text-lg">📊</span>
                <div className="text-left">
                  <p className="font-medium">Vídeo com corte e instrumentos</p>
                  <p className="text-xs text-sky-400/70">Aplica trecho e overlay de telemetria</p>
                </div>
              </button>
              {enhancedDownloadBlockedReason && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  <p>{enhancedDownloadBlockedReason}</p>
                  {enhancedDownloadBlockedReason.includes("ferramenta de edição") && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <a
                        href={helperSetupHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky-300 underline-offset-4 hover:underline"
                      >
                        Ver passo a passo
                      </a>
                      <button
                        type="button"
                        onClick={() => void onRetryHelper()}
                        className="font-medium text-slate-300 underline-offset-4 hover:underline"
                      >
                        Verificar novamente
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-slate-600 hover:text-slate-400"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") {
    return <span className="rounded bg-green-900/60 px-1.5 py-0.5 text-[10px] font-medium text-green-400">Pronto</span>;
  }
  if (status === "failed") {
    return <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Falhou</span>;
  }
  if (status === "uploading") {
    return <span className="rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">Enviando</span>;
  }
  return <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Processando</span>;
}
