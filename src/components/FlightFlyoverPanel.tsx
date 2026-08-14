import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAirspaceVolumesInBbox, type AirspaceVolume } from "../lib/airspaceIntersect";
import { AIRSPACE_LAYER_DEFS, type AirspaceLayerType } from "../lib/airspaceLayersDb";
import {
  FLYOVER_DEFAULT_HIDDEN_AIRSPACES,
  FLYOVER_DURATION_OPTIONS,
  FLYOVER_HEIGHT,
  FLYOVER_MAX_CORRIDORS,
  FLYOVER_MAX_SAT_TILES,
  FLYOVER_PAD_DEG,
  FLYOVER_CHASE_END,
  FLYOVER_SAT_MAX_ZOOM,
  FLYOVER_TERRAIN_MAX_TILES,
  FLYOVER_TERRAIN_MAX_ZOOM,
  FLYOVER_TERRAIN_TARGET_CELLS,
  FLYOVER_WIDTH,
  flyoverAirspaceTypes,
  flyoverFileName,
  flyoverHudValues,
  flyoverTerrainCacheKey,
  flyoverVideoDurationSec,
  getFlyoverTerrainCache,
  icaosFromShareData,
  resolveFlyoverTrack,
  sampleFlyoverAt,
  setFlyoverTerrainCache,
  trackWaypoints,
  type FlyoverDurationSec,
  type FlyoverTrack,
} from "../lib/flightFlyover";
import { downloadFlyoverFile, recordFlyoverVideo } from "../lib/flightFlyoverRecorder";
import type { FlightShareData } from "../lib/flightShareStickers";
import { reaFeatureToCorridor, uniqueCorridorVolumes, type LegCorridorInfo } from "../lib/legCorridor";
import { loadReaRoutesInBbox } from "../lib/reaRoutesDb";
import { destinationPoint } from "../lib/geoClip";
import { findRunwaysByAirports, type RunwayRecord } from "../lib/runwaysDb";
import { fetchSatelliteCanvas, fetchTerrainGrid, type TerrainGrid } from "../lib/terrainTiles";
import { FlightFlyoverScene, type FlyoverSceneHandle } from "./FlightFlyoverScene";
import { useToast } from "./ui/ToastProvider";

type Props = {
  shareData: FlightShareData;
  shareText: string;
};

type NavigatorWithFiles = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

const PREVIEW_W = 360;
const PREVIEW_H = Math.round((FLYOVER_HEIGHT / FLYOVER_WIDTH) * PREVIEW_W);

function lowestSample(samples: FlyoverTrack["samples"]): FlyoverTrack["samples"][number] {
  return samples.reduce((best, sample) => (sample.altM < best.altM ? sample : best));
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_008.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

function syntheticRunway(id: string, lat: number, lon: number, headingDeg: number, lengthM = 1_400): RunwayRecord {
  const a = destinationPoint(lat, lon, headingDeg + 180, lengthM / 2);
  const b = destinationPoint(lat, lon, headingDeg, lengthM / 2);
  return {
    $id: id,
    airportIdent: "SIM",
    le: { ident: "01", lat: a.lat, lon: a.lng, headingTrue: headingDeg, elevationFt: null },
    he: { ident: "19", lat: b.lat, lon: b.lng, headingTrue: (headingDeg + 180) % 360, elevationFt: null },
    lengthFt: lengthM / 0.3048,
    surface: "asphalt",
    closed: false,
  };
}

function syntheticRunwaysFromTrack(track: FlyoverTrack): RunwayRecord[] {
  const n = track.samples.length;
  if (n < 2) return [];
  const start = lowestSample(track.samples.slice(0, Math.max(2, Math.floor(n * 0.08))));
  const end = lowestSample(track.samples.slice(Math.floor(n * 0.92)));
  const out = [syntheticRunway("sim-dep", start.lat, start.lon, start.headingDeg)];
  if (haversineM(start, end) > 1_600) {
    out.push(syntheticRunway("sim-arr", end.lat, end.lon, end.headingDeg));
  }
  return out;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function loadLogo(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function Chip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${active ? "text-slate-100" : "text-slate-500 line-through"}`}
      style={{ backgroundColor: active ? `${color}33` : "#1e293b" }}
    >
      {label}
    </button>
  );
}

export function FlightFlyoverPanel({ shareData, shareText }: Props) {
  const { showToast } = useToast();
  const sceneRef = useRef<FlyoverSceneHandle>(null);
  const playbackRef = useRef(0);
  const [track, setTrack] = useState<FlyoverTrack | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackLoading, setTrackLoading] = useState(true);
  const [targetDuration, setTargetDuration] = useState<FlyoverDurationSec>(30);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [terrain, setTerrain] = useState<TerrainGrid | null>(null);
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [volumes, setVolumes] = useState<AirspaceVolume[]>([]);
  const [reaCorridors, setReaCorridors] = useState<LegCorridorInfo[]>([]);
  const [rehCorridors, setRehCorridors] = useState<LegCorridorInfo[]>([]);
  const [hiddenAirspaceTypes, setHiddenAirspaceTypes] = useState<Set<AirspaceLayerType>>(
    () => new Set(FLYOVER_DEFAULT_HIDDEN_AIRSPACES),
  );
  const [showRea, setShowRea] = useState(true);
  const [showReh, setShowReh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [runways, setRunways] = useState<RunwayRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    setTrackLoading(true);
    setTrackError(null);
    setTrack(null);
    void resolveFlyoverTrack(shareData)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setTrackError(result.error);
          return;
        }
        setTrack(result.track);
      })
      .finally(() => {
        if (!cancelled) setTrackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareData]);

  useEffect(() => {
    let cancelled = false;
    void loadLogo(shareData.brand.logoDataUrl || shareData.brand.logoUrl || null).then((img) => {
      if (!cancelled) setLogo(img);
    });
    return () => {
      cancelled = true;
    };
  }, [shareData.brand.logoDataUrl, shareData.brand.logoUrl]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    const controller = new AbortController();
    const cacheKey = flyoverTerrainCacheKey(shareData.flightId, track.source, track.samples.length);
    const cached = getFlyoverTerrainCache(cacheKey);
    if (cached) {
      setTerrain(cached.grid);
      if (cached.satelliteCanvas) {
        const tex = new THREE.CanvasTexture(cached.satelliteCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.flipY = true;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setSatelliteTexture((prev) => {
          prev?.dispose();
          return tex;
        });
      }
      setMapLoading(false);
      return;
    }

    setMapLoading(true);
    const waypoints = trackWaypoints(track);
    void fetchTerrainGrid(waypoints, {
      signal: controller.signal,
      padDeg: FLYOVER_PAD_DEG,
      maxTiles: FLYOVER_TERRAIN_MAX_TILES,
      maxZoom: FLYOVER_TERRAIN_MAX_ZOOM,
      targetCells: FLYOVER_TERRAIN_TARGET_CELLS,
    })
      .then(async (grid) => {
        if (cancelled) return;
        setTerrain(grid);
        if (!grid) {
          setSatelliteTexture((prev) => {
            prev?.dispose();
            return null;
          });
          return;
        }
        const canvas = await fetchSatelliteCanvas(grid, {
          signal: controller.signal,
          padDeg: FLYOVER_PAD_DEG,
          maxSatTiles: FLYOVER_MAX_SAT_TILES,
          maxZoom: FLYOVER_SAT_MAX_ZOOM,
        });
        if (cancelled) return;
        setFlyoverTerrainCache(cacheKey, { grid, satelliteCanvas: canvas });
        if (!canvas) {
          setSatelliteTexture((prev) => {
            prev?.dispose();
            return null;
          });
          return;
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.flipY = true;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setSatelliteTexture((prev) => {
          prev?.dispose();
          return tex;
        });
      })
      .catch(() => {
        if (!cancelled) setTerrain(null);
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [shareData.flightId, track]);

  useEffect(() => {
    if (!track) {
      setRunways([]);
      return;
    }
    let cancelled = false;
    const icaos = icaosFromShareData(shareData);
    void findRunwaysByAirports(icaos)
      .then((list) => {
        if (cancelled) return;
        setRunways(list.length ? list : syntheticRunwaysFromTrack(track));
      })
      .catch(() => {
        if (!cancelled) setRunways(syntheticRunwaysFromTrack(track));
      });
    return () => {
      cancelled = true;
    };
  }, [shareData, track]);

  useEffect(() => {
    if (!terrain) {
      setVolumes([]);
      setReaCorridors([]);
      setRehCorridors([]);
      return;
    }
    let cancelled = false;
    const bbox = {
      minLng: terrain.west,
      minLat: terrain.south,
      maxLng: terrain.east,
      maxLat: terrain.north,
    };
    const reaBbox = {
      minLng: terrain.west - 0.2,
      minLat: terrain.south - 0.2,
      maxLng: terrain.east + 0.2,
      maxLat: terrain.north + 0.2,
    };
    void Promise.all([
      loadAirspaceVolumesInBbox(bbox, { types: flyoverAirspaceTypes(), maxTotal: 80 }),
      loadReaRoutesInBbox("rea", reaBbox),
      loadReaRoutesInBbox("reh", reaBbox),
    ])
      .then(([nextVolumes, reaBboxHits, rehBboxHits]) => {
        if (cancelled) return;
        setVolumes(nextVolumes);
        setReaCorridors(
          uniqueCorridorVolumes(reaBboxHits.map(reaFeatureToCorridor)).slice(0, FLYOVER_MAX_CORRIDORS),
        );
        setRehCorridors(
          uniqueCorridorVolumes(rehBboxHits.map(reaFeatureToCorridor)).slice(0, FLYOVER_MAX_CORRIDORS),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setVolumes([]);
          setReaCorridors([]);
          setRehCorridors([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [terrain]);

  const videoDurationSec = useMemo(
    () => (track ? flyoverVideoDurationSec(track.durationMs, targetDuration) : targetDuration),
    [targetDuration, track],
  );

  useEffect(() => {
    if (!playing || !track || exporting) return;
    const id = window.setInterval(() => {
      setProgress(playbackRef.current);
    }, 80);
    return () => window.clearInterval(id);
  }, [exporting, playing, track]);

  useEffect(() => {
    return () => {
      satelliteTexture?.dispose();
    };
  }, [satelliteTexture]);

  const chaseProgress = Math.min(1, progress / FLYOVER_CHASE_END);
  const sample = track ? sampleFlyoverAt(track, chaseProgress * track.durationMs) : null;
  const hud = sample ? flyoverHudValues(sample) : null;
  const presentTypes = useMemo(() => {
    const set = new Set<AirspaceLayerType>();
    for (const volume of volumes) set.add(volume.type);
    return flyoverAirspaceTypes().filter((type) => set.has(type));
  }, [volumes]);

  const sourceLabel = track?.source === "fr24" ? "FlightRadar" : "Garmin";

  const runExport = async (mode: "download" | "share") => {
    if (!track || !sceneRef.current) return;
    setPlaying(false);
    setExporting(true);
    setExportPct(0);
    try {
      const file = await recordFlyoverVideo({
        renderAt: (nextProgress) => {
          playbackRef.current = nextProgress;
          setProgress(nextProgress);
          return sceneRef.current!.renderAt(nextProgress);
        },
        brand: shareData.brand,
        logo,
        videoDurationSec,
        fileName: flyoverFileName(shareData),
        onProgress: setExportPct,
      });
      if (mode === "download") {
        downloadFlyoverFile(file);
        showToast({ variant: "success", message: "Vídeo do Flyover baixado." });
        return;
      }
      const nav = navigator as NavigatorWithFiles;
      if (!nav.share) {
        downloadFlyoverFile(file);
        showToast({ variant: "warning", message: "Compartilhamento indisponível. O vídeo foi baixado." });
        return;
      }
      const payload: ShareData = { title: "Flyover", text: shareText, files: [file] };
      if (nav.canShare && !nav.canShare(payload)) {
        downloadFlyoverFile(file);
        showToast({ variant: "warning", message: "Este navegador não compartilha vídeo. O arquivo foi baixado." });
        return;
      }
      await nav.share(payload);
    } catch (error) {
      if (!isAbortError(error)) {
        showToast({ variant: "error", message: (error as Error).message || "Falha ao gerar o Flyover." });
      }
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  };

  return (
    <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative overflow-hidden rounded-[1.3rem] border border-slate-700/80 bg-slate-950 shadow-2xl shadow-black/40"
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
        >
          {trackLoading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
              Preparando a trilha do Flyover...
            </div>
          ) : trackError || !track ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-200">
              {trackError || "Não há trilha GPS neste voo."}
            </div>
          ) : (
            <>
              <div className="absolute inset-0">
                <FlightFlyoverScene
                  ref={sceneRef}
                  track={track}
                  progress={progress}
                  playbackRef={playbackRef}
                  playing={playing && !exporting}
                  durationSec={videoDurationSec}
                  exporting={exporting}
                  terrain={terrain}
                  satelliteTexture={satelliteTexture}
                  airspaceVolumes={volumes}
                  hiddenAirspaceTypes={hiddenAirspaceTypes}
                  reaCorridors={reaCorridors}
                  rehCorridors={rehCorridors}
                  showRea={showRea}
                  showReh={showReh}
                  runways={runways}
                />
              </div>
              <div className="pointer-events-none absolute inset-0 z-10">
                <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />
                <div className="absolute inset-x-0 top-4 flex flex-col items-center">
                  {shareData.brand.logoDataUrl || shareData.brand.logoUrl ? (
                    <img
                      src={shareData.brand.logoDataUrl || shareData.brand.logoUrl}
                      alt={shareData.brand.schoolName || "Logo da escola"}
                      className="h-11 max-w-[180px] object-contain"
                    />
                  ) : shareData.brand.schoolName ? (
                    <p className="text-base font-bold tracking-wide text-white drop-shadow">{shareData.brand.schoolName}</p>
                  ) : null}
                </div>
                {hud ? (
                  <div className="absolute inset-x-3 top-[4.1rem] grid grid-cols-3 gap-1 text-center text-white">
                    {[
                      ["DISTÂNCIA", hud.distance],
                      ["ALTITUDE", hud.altitude],
                      ["TEMPO", hud.time],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[8px] font-semibold tracking-[0.18em] text-white/70">{label}</p>
                        <p className="text-lg font-bold leading-tight drop-shadow">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="absolute bottom-2 left-3 text-[9px] text-white/55">Tiles © Esri</p>
                {mapLoading ? (
                  <p className="absolute bottom-2 right-3 text-[9px] text-white/70">Carregando satélite...</p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {track ? (
          <div className="flex w-full max-w-[360px] items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              disabled={exporting}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
            >
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              disabled={exporting}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPlaying(false);
                playbackRef.current = value;
                setProgress(value);
              }}
              className="h-1.5 flex-1 accent-orange-400"
            />
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-3 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-2 shadow-xl shadow-black/20">
          <button
            type="button"
            disabled={!track || exporting}
            onClick={() => void runExport("download")}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-40"
          >
            {exporting ? `Gerando... ${exportPct}%` : "Baixar vídeo"}
          </button>
          <button
            type="button"
            disabled={!track || exporting}
            onClick={() => void runExport("share")}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-40"
          >
            Compartilhar
          </button>
        </div>
      </div>

      <aside className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Flyover</p>
        <h3 className="mt-2 text-xl font-bold text-slate-100">Vídeo 3D do voo</h3>
        <p className="mt-1 text-sm text-slate-400">
          Recorte vertical para stories, com satélite, telemetria e espaços aéreos.
        </p>
        <p className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
          Fonte: {trackLoading ? "..." : sourceLabel}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Duração do vídeo</p>
          <div className="grid grid-cols-4 gap-2">
            {FLYOVER_DURATION_OPTIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setTargetDuration(sec)}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold ${
                  targetDuration === sec
                    ? "border-sky-400/60 bg-sky-500/10 text-white"
                    : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700"
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
          {track ? (
            <p className="mt-2 text-[11px] text-slate-500">
              O voo de {Math.round(track.durationMs / 60000) || 1} min cabe em cerca de {Math.round(videoDurationSec)}s.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Espaços aéreos</p>
          <div className="flex flex-wrap gap-1">
            {presentTypes.map((type) => {
              const on = !hiddenAirspaceTypes.has(type);
              const def = AIRSPACE_LAYER_DEFS.find((item) => item.type === type);
              return (
                <Chip
                  key={type}
                  active={on}
                  label={def?.label || type}
                  color={def?.color || "#94a3b8"}
                  onClick={() =>
                    setHiddenAirspaceTypes((prev) => {
                      const next = new Set(prev);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    })
                  }
                />
              );
            })}
            {reaCorridors.length > 0 ? (
              <Chip active={showRea} label="REA" color="#a16207" onClick={() => setShowRea((v) => !v)} />
            ) : null}
            {rehCorridors.length > 0 ? (
              <Chip active={showReh} label="REH" color="#a16207" onClick={() => setShowReh((v) => !v)} />
            ) : null}
          </div>
          {presentTypes.length === 0 && reaCorridors.length === 0 && rehCorridors.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">Carregando camadas da área do voo...</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
