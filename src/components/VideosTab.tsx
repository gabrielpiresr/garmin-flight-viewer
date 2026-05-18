import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { account } from "../lib/appwrite";
import { Skeleton } from "./ui/Skeleton";
import {
  createFlightVideoDoc,
  deleteFlightVideo,
  listFlightVideos,
  updateFlightVideoFailed,
  type FlightVideo,
} from "../lib/flightVideosDb";
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
import type { AircraftModel } from "../types/admin";
import {
  CompactTelemetryOverlay,
  drawTelemetryChart,
  HudTelemetryOverlay,
  TelemetryBrandMark,
  type TelemetryOverlayStyle,
} from "./VideoTelemetryOverlay";

const HELPER_URL = "http://localhost:7842";

type HelperStatus = "checking" | "online" | "offline";
type SelectedFile = { name: string; file: File };

type ProcessStage = "telemetry-detect" | "concat" | "watermark" | "compress" | "upload" | "done" | "error";

type ProgressPayload = {
  stage: ProcessStage;
  percent: number;
  message?: string;
  file_url?: string;
  file_size?: number;
  duration_sec?: number;
  telemetry_present?: boolean;
  telemetry_source?: string;
  available_widgets?: string[];
};

const STAGE_LABELS: Record<ProcessStage, string> = {
  "telemetry-detect": "Procurando telemetria GPS...",
  concat: "Concatenando vídeos…",
  watermark: "Aplicando watermark…",
  compress: "Compactando…",
  upload: "Enviando para armazenamento…",
  done: "Concluído",
  error: "Erro no processamento",
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isVideoUploadFile(name: string): boolean {
  return /\.(mp4|mov|avi|mkv|mts|m2ts|webm)$/i.test(name);
}

function getCachedVideoBrand(): { schoolName: string; logoUrl: string } {
  try {
    const raw = window.localStorage.getItem("gfv:emailBrandSettings");
    if (!raw) return { schoolName: "Escola", logoUrl: "" };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      schoolName: typeof parsed.schoolName === "string" && parsed.schoolName.trim() ? parsed.schoolName : "Escola",
      logoUrl: typeof parsed.logoUrl === "string" ? parsed.logoUrl : "",
    };
  } catch {
    return { schoolName: "Escola", logoUrl: "" };
  }
}

export function VideosTab({ flightId }: { flightId: string | undefined }) {
  const { user } = useAuth();
  const isInstructor = user?.role === "instrutor" || user?.role === "admin";

  const [helperStatus, setHelperStatus] = useState<HelperStatus>("checking");
  const [videos, setVideos] = useState<FlightVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<ProcessStage | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [sendingIdx, setSendingIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  const checkHelper = useCallback(async () => {
    setHelperStatus("checking");
    try {
      const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      setHelperStatus(res.ok ? "online" : "offline");
    } catch {
      setHelperStatus("offline");
    }
  }, []);

  const loadVideos = useCallback(async () => {
    if (!flightId) return;
    setLoadingVideos(true);
    const { data } = await listFlightVideos(flightId);
    setLoadingVideos(false);
    if (data) setVideos(data);
  }, [flightId]);

  useEffect(() => {
    void checkHelper();
    void loadVideos();
  }, [checkHelper, loadVideos]);

  // Impedir fechamento acidental durante envio ou processamento
  useEffect(() => {
    if ((!processingJobId && !isSending) || isDone) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [processingJobId, isSending, isDone]);

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setSelectedFiles(files.map((f) => ({ name: f.name, file: f })));
    setIsDone(false);
    setProcessingError(null);
    setProcessingJobId(null);
    e.target.value = "";
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

    const workerConfig = getWorkerConfig();
    if (!workerConfig) {
      setProcessingError("Storage não configurado. Adicione VITE_CF_WORKER_URL e VITE_CF_WORKER_SECRET no .env.local.");
      return;
    }

    setProcessingError(null);
    setProgress(0);
    setProgressStage("concat");

    // 1. Criar doc no Appwrite com status "processing"
    const { id: docId, error: docError } = await createFlightVideoDoc({
      flightId,
      uploadedBy: user.id,
      originalFilesCount: selectedFiles.filter((item) => isVideoUploadFile(item.name)).length,
    });
    if (docError || !docId) {
      setProcessingError(docError?.message ?? "Erro ao criar registro do vídeo");
      return;
    }

    setProcessingJobId(docId);

    // 2. Obter JWT do Appwrite para que o helper possa atualizar o doc
    let sessionJwt = "";
    try {
      if (account) {
        const jwtResult = await account.createJWT();
        sessionJwt = jwtResult.jwt;
      }
    } catch {
      // sem JWT o helper não atualizará o Appwrite, mas continua
    }

    // 3. Transmitir cada arquivo para o helper via streaming HTTP
    const sessionId = crypto.randomUUID();
    setIsSending(true);

    for (let i = 0; i < selectedFiles.length; i++) {
      setSendingIdx(i);
      const { file, name } = selectedFiles[i];
      try {
        const res = await fetch(`${HELPER_URL}/receive-file/${sessionId}/${i}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": name,
          },
          body: file,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (e) {
        setIsSending(false);
        await updateFlightVideoFailed(docId);
        setProcessingError(`Erro ao enviar "${selectedFiles[i].name}": ${(e as Error).message}`);
        setProcessingJobId(null);
        return;
      }
    }

    setIsSending(false);

    // 4. Disparar processamento no helper
    const appwriteEndpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string;
    const appwriteProjectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string;
    const appwriteDbId = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
    const videosColId = import.meta.env.VITE_APPWRITE_VIDEOS_COLLECTION_ID as string;
    const videoKey = `flight-${flightId}-${Date.now()}.mp4`;
    const fileOrder = selectedFiles.map((f, i) => ({ index: i, name: f.name }));

    try {
      const res = await fetch(`${HELPER_URL}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: docId,
          sessionId,
          fileOrder,
          cfWorkerUrl: workerConfig.url,
          cfWorkerSecret: workerConfig.secret,
          videoKey,
          appwriteEndpoint,
          appwriteProjectId,
          appwriteDbId,
          videosColId,
          sessionJwt,
          flightVideoDocId: docId,
        }),
      });
      if (!res.ok) throw new Error(`Helper retornou ${res.status}`);
    } catch (e) {
      await updateFlightVideoFailed(docId);
      setProcessingError(`Erro ao iniciar processamento: ${(e as Error).message}`);
      setProcessingJobId(null);
      return;
    }

    // 5. Conectar SSE para acompanhar progresso
    evtSourceRef.current?.close();
    const evtSource = new EventSource(`${HELPER_URL}/progress/${docId}`);
    evtSourceRef.current = evtSource;

    evtSource.onmessage = (e) => {
      const payload = JSON.parse(e.data) as ProgressPayload;
      setProgressStage(payload.stage);
      setProgress(payload.percent);

      if (payload.stage === "done") {
        evtSource.close();
        setIsDone(true);
        void loadVideos();
      } else if (payload.stage === "error") {
        evtSource.close();
        setProcessingError(payload.message ?? "Erro desconhecido no processamento");
        setProcessingJobId(null);
        void updateFlightVideoFailed(docId);
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
    await updateFlightVideoFailed(processingJobId);
    setProcessingJobId(null);
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

  const isActive = isSending || (!!processingJobId && !isDone);
  const showPickButton = isInstructor && selectedFiles.length === 0 && !isActive && !isDone;
  const showFileSelection = isInstructor && selectedFiles.length > 0 && !isActive && !isDone;
  const showSendingUI = isSending;
  const showProcessingUI = !!processingJobId && !isSending && !isDone;

  return (
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
              Storage não configurado. Adicione <code>VITE_CF_WORKER_URL</code> e <code>VITE_CF_WORKER_SECRET</code> no <code>.env.local</code>.
            </div>
          )}

          {/* Input nativo oculto */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,.mp4,.mov,.avi,.mkv,.mts,.m2ts,.srt"
            className="hidden"
            onChange={handleFilesSelected}
          />

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
            />
          )}

          {/* UI de envio ao helper */}
          {showSendingUI && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3 w-3 animate-spin rounded-full border border-sky-400 border-t-transparent" />
                Enviando arquivo {sendingIdx + 1} de {selectedFiles.length}…
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all duration-300"
                  style={{ width: `${Math.round(((sendingIdx) / selectedFiles.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* UI de progresso */}
          {showProcessingUI && progressStage && (
            <ProcessingProgress
              stage={progressStage}
              percent={progress}
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
                onClick={() => { setIsDone(false); setSelectedFiles([]); setProcessingJobId(null); }}
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
                onDelete={() => void handleDeleteVideo(v.id)}
                onRetry={() => void handleRetry(v.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// --- Sub-componentes ---

function HelperStatusBadge({ status, onRetry }: { status: HelperStatus; onRetry: () => void }) {
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
          href="https://github.com/SEU-REPO/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 underline-offset-4 hover:underline"
        >
          Baixar helper
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
}: {
  files: SelectedFile[];
  onRemove: (i: number) => void;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDragEnd: () => void;
  onGenerate: () => void;
  onAddMore: () => void;
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onGenerate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 sm:w-auto"
        >
          Gerar vídeo final
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

function ProcessingProgress({
  stage,
  percent,
  onCancel,
}: {
  stage: ProcessStage;
  percent: number;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{STAGE_LABELS[stage]}</span>
        <span className="text-slate-500">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-slate-500 underline-offset-4 hover:text-red-400 hover:underline"
      >
        Cancelar
      </button>
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

function TelemetryVideoPlayer({ video }: { video: FlightVideo }) {
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [airspeedArcs, setAirspeedArcs] = useState<AirspeedArcLimits | null>(null);
  const [routeMap, setRouteMap] = useState<VideoRouteMapData | null>(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [trimStartSec, setTrimStartSec] = useState<number | null>(null);
  const [trimEndSec, setTrimEndSec] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const brand = useMemo(() => getCachedVideoBrand(), []);

  const verticalSpeedFpm = useMemo(
    () => verticalSpeedFpmAtTime(points, currentTimeSec),
    [points, currentTimeSec],
  );

  useEffect(() => {
    setEnabledWidgets(defaultWidgets);
  }, [defaultWidgets, video.id]);

  useEffect(() => {
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
  }, [video.flight_id]);

  useEffect(() => {
    let cancelled = false;
    if (points.length < 2) {
      setRouteMap(null);
      return;
    }
    void buildVideoRouteMap(points).then((map) => {
      if (!cancelled) setRouteMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || points.length === 0) return;
    const update = () => {
      setCurrentPoint(pointAtVideoTime(points, el.currentTime));
      setCurrentTimeSec(el.currentTime);
    };
    update();
    el.addEventListener("timeupdate", update);
    el.addEventListener("seeked", update);
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("seeked", update);
    };
  }, [points, video.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawVideoRouteMapBase(canvas, routeMap, points, overlayStyle);
  }, [points, routeMap, overlayStyle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawVideoRouteMapMarker(canvas, routeMap, points, currentPoint, overlayStyle);
  }, [points, currentPoint, routeMap, overlayStyle]);

  const redrawCharts = useCallback(() => {
    if (altitudeChartRef.current) drawTelemetryChart(altitudeChartRef.current, points, currentPoint, "altitude");
    if (speedChartRef.current) drawTelemetryChart(speedChartRef.current, points, currentPoint, "speed");
  }, [points, currentPoint]);

  useEffect(() => {
    redrawCharts();
  }, [redrawCharts, enabledWidgets, overlayStyle]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => redrawCharts());
    observer.observe(container);
    return () => observer.disconnect();
  }, [redrawCharts]);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    let swappingToContainer = false;
    const onFullscreenChange = () => {
      const active = document.fullscreenElement;
      if (active === video && !swappingToContainer) {
        swappingToContainer = true;
        void document.exitFullscreen().then(() =>
          container.requestFullscreen().finally(() => {
            swappingToContainer = false;
          }),
        );
        return;
      }
      setIsPlayerFullscreen(active === container);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const hasTelemetry = video.telemetry_present && points.length > 1 && available.length > 0;

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
    const workerConfig = getWorkerConfig();
    if (!workerConfig) {
      setExportError("Storage nao configurado para exportar o MP4.");
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${HELPER_URL}/render-overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: video.file_url,
          telemetryJson: video.telemetry_json,
          widgets: exportWidgets,
          cfWorkerUrl: workerConfig.url,
          cfWorkerSecret: workerConfig.secret,
          outputKey: `flight-${video.flight_id}-${video.id}-telemetry-${Date.now()}.mp4`,
          trimStartSec: trimStartSec ?? undefined,
          trimEndSec: trimEndSec ?? undefined,
          orientation,
        }),
      });
      const payload = await res.json() as { fileUrl?: string; error?: string };
      if (!res.ok || !payload.fileUrl) throw new Error(payload.error ?? `Helper retornou ${res.status}`);
      window.open(payload.fileUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setExportError((e as Error).message);
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
        {orientation === "vertical" ? (
          <div className="relative h-full aspect-[9/16] overflow-hidden">
            <video
              ref={videoRef}
              src={video.file_url}
              controls
              preload="metadata"
              playsInline
              className="h-full w-full object-cover bg-black"
            />
            {hasTelemetry && (
              <div className="pointer-events-none absolute inset-0">
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
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={video.file_url}
              controls
              preload="metadata"
              playsInline
              className="h-full w-full bg-black"
            />
            {hasTelemetry && (
              <div className="pointer-events-none absolute inset-0">
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
          </>
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
              <span className="self-center text-slate-700">|</span>
              {(["horizontal", "vertical"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrientation(o)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    orientation === o ? "bg-violet-500/20 text-violet-200" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {o === "horizontal" ? "↔ Horiz." : "↕ Vertical"}
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
          <button
            type="button"
            onClick={() => void handleRenderedDownload()}
            disabled={exporting || enabledWidgets.every((w) => w === "route")}
            className="rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {exporting ? "Gerando MP4..." : "Baixar com widgets"}
          </button>
        </div>
      )}

      {/* Seleção de trecho */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
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
        </div>
        {trimStartSec !== null && trimEndSec !== null && trimEndSec > trimStartSec && (
          <p className="text-[10px] text-slate-500">
            Trecho selecionado: {formatDurationSec(trimStartSec)} → {formatDurationSec(trimEndSec)}{" "}
            ({formatDurationSec(trimEndSec - trimStartSec)})
            {hasTelemetry ? " · use 'Baixar com widgets' para baixar o trecho" : ""}
          </p>
        )}
        {trimStartSec !== null && trimEndSec !== null && trimEndSec <= trimStartSec && (
          <p className="text-[10px] text-red-400">O fim deve ser depois do início.</p>
        )}
      </div>

      {exportError && (
        <HelperOfflinePanel error={exportError} />
      )}
      {video.telemetry_source === "gopro" && !video.telemetry_present && (
        <p className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200">
          Track GoPro detectado, mas o parser GPMF completo ainda nao extraiu pontos para overlay.
        </p>
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
  onDelete,
  onRetry,
}: {
  video: FlightVideo;
  isInstructor: boolean;
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
          <TelemetryVideoPlayer video={video} />
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
            {isReady && video.file_url && (
              <a
                href={video.file_url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-slate-700 hover:text-sky-300 sm:flex-none"
              >
                ↓ Baixar
              </a>
            )}
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
