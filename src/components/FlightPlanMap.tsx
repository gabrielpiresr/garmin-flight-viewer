import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  WINDY_OVERLAYS,
  buildWindyEmbedUrl,
  type WindyOverlayId,
} from "../lib/windyEmbed";
import { WindyIsobarsIcon, WindyOverlayIcon } from "../lib/windyOverlayIcons";
import type { FlightPlanWaypoint } from "../types/flightPlanning";

type MapStyle = "satellite" | "roads" | "terrain" | "windy";

type BaseMapStyle = Exclude<MapStyle, "windy">;

const TILES: Record<BaseMapStyle, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
    maxZoom: 19,
  },
  roads: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
    subdomains: "abc",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
    maxZoom: 18,
  },
};

const WMS_LAYERS = [
  { id: "cta", label: "CTA", layer: "ICA:CTA", defaultOn: false },
  { id: "tma", label: "TMA", layer: "ICA:TMA", defaultOn: false },
  { id: "ctr", label: "CTR", layer: "ICA:CTR", defaultOn: false },
  { id: "atz", label: "ATZ", layer: "ICA:ATZ", defaultOn: true },
] as const;

const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

type WindyView = { lat: number; lon: number; zoom: number };

type WindyTransform = { dx: number; dy: number; scale: number };

const IDENTITY_TRANSFORM: WindyTransform = { dx: 0, dy: 0, scale: 1 };

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    window.requestAnimationFrame(() => {
      map.invalidateSize(false);
      if (positions.length === 1) {
        map.setView(positions[0]!, 10, { animate: false });
        return;
      }
      map.fitBounds(L.latLngBounds(positions), { padding: [36, 36], animate: false });
    });
  }, [map, positions]);
  return null;
}

function buildViewUrl(view: WindyView, overlay: WindyOverlayId, pressure: boolean) {
  return buildWindyEmbedUrl({
    lat: view.lat,
    lon: view.lon,
    zoom: view.zoom,
    overlay,
    pressure,
    marker: false,
    message: false,
  });
}

function seedFromPositions(positions: [number, number][]): WindyView {
  if (positions.length === 1) {
    return { lat: positions[0]![0], lon: positions[0]![1], zoom: 10 };
  }
  const center = L.latLngBounds(positions).getCenter();
  return { lat: center.lat, lon: center.lng, zoom: 8 };
}

function readViewFromUrl(url: string): WindyView | null {
  try {
    const u = new URL(url);
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    const zoom = Number(u.searchParams.get("zoom"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return null;
    return { lat, lon, zoom };
  } catch {
    return null;
  }
}

/**
 * Durante pan/zoom: CSS transform acompanha o Leaflet.
 * Ao soltar: pede reload do embed (double-buffer no pai).
 */
function WindyBackgroundSync({
  overlay,
  pressure,
  committedView,
  onTransform,
  onSettle,
}: {
  overlay: WindyOverlayId;
  pressure: boolean;
  committedView: WindyView | null;
  onTransform: (t: WindyTransform) => void;
  onSettle: (view: WindyView, opts?: { force?: boolean }) => void;
}) {
  const map = useMap();
  const committedRef = useRef(committedView);
  committedRef.current = committedView;
  const onTransformRef = useRef(onTransform);
  onTransformRef.current = onTransform;
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const settleTimer = useRef<number | null>(null);

  const applyTransform = useCallback(() => {
    const committed = committedRef.current;
    if (!committed) return;
    const scale = 2 ** (map.getZoom() - committed.zoom);
    const pt = map.latLngToContainerPoint([committed.lat, committed.lon]);
    const size = map.getSize();
    onTransformRef.current({
      dx: pt.x - size.x / 2,
      dy: pt.y - size.y / 2,
      scale,
    });
  }, [map]);

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const c = map.getCenter();
      onSettleRef.current({
        lat: c.lat,
        lon: c.lng,
        zoom: Math.round(map.getZoom()),
      });
    }, 220);
  }, [map]);

  useMapEvents({
    move: applyTransform,
    zoom: applyTransform,
    moveend: scheduleSettle,
    zoomend: scheduleSettle,
  });

  // Overlay / isóbaras: forçar novo embed no view atual.
  useEffect(() => {
    const boot = window.setTimeout(() => {
      const c = map.getCenter();
      onSettleRef.current(
        {
          lat: c.lat,
          lon: c.lng,
          zoom: Math.round(map.getZoom()),
        },
        { force: true },
      );
    }, 100);
    return () => window.clearTimeout(boot);
  }, [map, overlay, pressure]);

  useEffect(() => {
    return () => {
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    };
  }, []);

  return null;
}

function pointIcon(label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:10px;height:10px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45)"></div>
      <span style="font:700 9px/1 ui-monospace,monospace;color:#e2e8f0;background:rgba(2,6,23,.75);padding:2px 4px;border-radius:4px">${label}</span>
    </div>`,
    iconSize: [64, 28],
    iconAnchor: [32, 8],
  });
}

type FlightPlanMapProps = {
  waypoints: FlightPlanWaypoint[];
  originLabel?: string | null;
  destLabel?: string | null;
  className?: string;
};

export function FlightPlanMap({
  waypoints,
  originLabel,
  destLabel,
  className = "",
}: FlightPlanMapProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>("windy");
  const [windyOverlay, setWindyOverlay] = useState<WindyOverlayId>("clouds");
  const [windyPressure, setWindyPressure] = useState(false);
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(WMS_LAYERS.map((l) => [l.id, l.defaultOn])),
  );

  const positions = useMemo(
    () => waypoints.map((w) => [w.lat, w.lng] as [number, number]),
    [waypoints],
  );

  const isWindy = mapStyle === "windy";
  const tiles = !isWindy ? TILES[mapStyle] : null;
  const seedView = useMemo(() => seedFromPositions(positions), [positions]);
  const activeOverlay = WINDY_OVERLAYS.find((o) => o.id === windyOverlay);

  const [committedView, setCommittedView] = useState<WindyView | null>(null);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [front, setFront] = useState<"a" | "b">("a");
  const [loadingSlot, setLoadingSlot] = useState<"a" | "b" | null>(null);
  const [transform, setTransform] = useState<WindyTransform>(IDENTITY_TRANSFORM);

  const frontUrl = front === "a" ? slotA : slotB;

  useEffect(() => {
    if (!isWindy) {
      setCommittedView(null);
      setSlotA(null);
      setSlotB(null);
      setFront("a");
      setLoadingSlot(null);
      setTransform(IDENTITY_TRANSFORM);
      return;
    }
    const url = buildViewUrl(seedView, windyOverlay, windyPressure);
    setCommittedView(seedView);
    setSlotA(url);
    setSlotB(null);
    setFront("a");
    setLoadingSlot(null);
    setTransform(IDENTITY_TRANSFORM);
    // Seed only when entering windy or route changes — overlay swaps go through onSettle(force).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWindy, seedView]);

  const handleTransform = useCallback((t: WindyTransform) => {
    setTransform(t);
  }, []);

  const handleSettle = useCallback(
    (view: WindyView, opts?: { force?: boolean }) => {
      if (!isWindy) return;
      const url = buildViewUrl(view, windyOverlay, windyPressure);
      if (!opts?.force && url === frontUrl && !loadingSlot) {
        setCommittedView(view);
        setTransform(IDENTITY_TRANSFORM);
        return;
      }
      if (loadingSlot === "a" && slotA === url) return;
      if (loadingSlot === "b" && slotB === url) return;

      const target: "a" | "b" = front === "a" ? "b" : "a";
      if (target === "a") setSlotA(url);
      else setSlotB(url);
      setLoadingSlot(target);
    },
    [isWindy, windyOverlay, windyPressure, frontUrl, front, loadingSlot, slotA, slotB],
  );

  const onSlotLoad = useCallback(
    (slot: "a" | "b") => {
      if (loadingSlot !== slot) return;
      const url = slot === "a" ? slotA : slotB;
      if (!url) return;
      const next = readViewFromUrl(url);
      if (next) setCommittedView(next);
      setFront(slot);
      setLoadingSlot(null);
      setTransform(IDENTITY_TRANSFORM);
    },
    [loadingSlot, slotA, slotB],
  );

  if (positions.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed border-slate-700/70 px-3 py-10 text-center text-xs text-slate-500 ${className}`}>
        Cole a rota do NexAtlas/FPL para ver o preview no mapa.
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-700/70 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preview da rota</p>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
          {(
            [
              ["terrain", "Relevo"],
              ["satellite", "Satélite"],
              ["roads", "Mapa"],
              ["windy", "Windy"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMapStyle(id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                mapStyle === id ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isWindy ? (
        <div className="space-y-1.5 border-b border-slate-800 bg-slate-950/40 px-2.5 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 self-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Camada Windy
            </span>
            {WINDY_OVERLAYS.map((item) => {
              const on = windyOverlay === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.description}
                  onClick={() => setWindyOverlay(item.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                    on
                      ? "bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/40"
                      : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
                  }`}
                >
                  <WindyOverlayIcon id={item.id} className="h-3 w-3" />
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              title="Isóbaras de pressão"
              onClick={() => setWindyPressure((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                windyPressure
                  ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
              }`}
            >
              <WindyIsobarsIcon className="h-3 w-3" />
              Isóbaras
            </button>
          </div>
          {activeOverlay ? (
            <p className="text-[10px] text-slate-500">{activeOverlay.description}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950/40 px-2.5 py-1.5">
        <span className="mr-1 self-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Espaço aéreo
        </span>
        {WMS_LAYERS.map((layer) => {
          const on = layersOn[layer.id] === true;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                on
                  ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
              }`}
            >
              {layer.label}
            </button>
          );
        })}
      </div>

      <div className="relative h-[450px] w-full overflow-hidden bg-slate-950 [&_.leaflet-control-attribution]:text-[9px]">
        {isWindy && (slotA || slotB) ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            {slotA ? (
              <iframe
                key={`a:${slotA}`}
                title="Windy fundo A"
                src={slotA}
                onLoad={() => onSlotLoad("a")}
                className="absolute inset-0 border-0 transition-opacity duration-150 ease-out"
                style={{
                  width: "100%",
                  height: "100%",
                  transformOrigin: "50% 50%",
                  willChange: front === "a" ? "transform, opacity" : "opacity",
                  opacity: front === "a" ? 1 : 0,
                  zIndex: front === "a" ? 2 : 1,
                  transform:
                    front === "a"
                      ? `translate3d(${transform.dx}px, ${transform.dy}px, 0) scale(${transform.scale})`
                      : "none",
                }}
                referrerPolicy="no-referrer-when-downgrade"
                tabIndex={-1}
                aria-hidden
              />
            ) : null}
            {slotB ? (
              <iframe
                key={`b:${slotB}`}
                title="Windy fundo B"
                src={slotB}
                onLoad={() => onSlotLoad("b")}
                className="absolute inset-0 border-0 transition-opacity duration-150 ease-out"
                style={{
                  width: "100%",
                  height: "100%",
                  transformOrigin: "50% 50%",
                  willChange: front === "b" ? "transform, opacity" : "opacity",
                  opacity: front === "b" ? 1 : 0,
                  zIndex: front === "b" ? 2 : 1,
                  transform:
                    front === "b"
                      ? `translate3d(${transform.dx}px, ${transform.dy}px, 0) scale(${transform.scale})`
                      : "none",
                }}
                referrerPolicy="no-referrer-when-downgrade"
                tabIndex={-1}
                aria-hidden
              />
            ) : null}
          </div>
        ) : null}

        <MapContainer
          key={isWindy ? "windy" : mapStyle}
          center={positions[0]!}
          zoom={8}
          className={`relative z-10 h-full w-full ${isWindy ? "flight-plan-windy-overlay" : ""}`}
          scrollWheelZoom
          zoomControl
        >
          <FitRoute positions={positions} />
          {isWindy ? (
            <WindyBackgroundSync
              overlay={windyOverlay}
              pressure={windyPressure}
              committedView={committedView}
              onTransform={handleTransform}
              onSettle={handleSettle}
            />
          ) : null}
          {!isWindy && tiles ? (
            <TileLayer
              key={mapStyle}
              attribution={tiles.attribution}
              url={tiles.url}
              maxZoom={tiles.maxZoom}
              {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
            />
          ) : null}
          {WMS_LAYERS.map((layer) =>
            layersOn[layer.id] ? (
              <WMSTileLayer
                key={layer.id}
                url={WMS_BASE}
                layers={layer.layer}
                format="image/png"
                transparent
                opacity={0.55}
                version="1.1.1"
                attribution="GeoAISWEB DECEA"
              />
            ) : null,
          )}
          <Polyline positions={positions} pathOptions={{ color: "#22d3ee", weight: 3.2, opacity: 0.95 }} />
          {positions.map((pos, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === positions.length - 1;
            const label = isFirst
              ? originLabel || "DEP"
              : isLast
                ? destLabel || "ARR"
                : String(idx);
            const color = isFirst ? "#34d399" : isLast ? "#f472b6" : "#38bdf8";
            return <Marker key={`${pos[0]}-${pos[1]}-${idx}`} position={pos} icon={pointIcon(label, color)} />;
          })}
        </MapContainer>
      </div>

      {isWindy ? (
        <p className="border-t border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-slate-500">
          Fundo Windy acompanha o pan/zoom e só recarrega o embed ao soltar.{" "}
          <a
            href="https://www.windy.com/"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:text-cyan-300"
          >
            windy.com
          </a>
        </p>
      ) : null}

      <style>{`
        .flight-plan-windy-overlay.leaflet-container {
          background: transparent !important;
        }
        .flight-plan-windy-overlay .leaflet-tile-pane {
          background: transparent !important;
        }
        .flight-plan-windy-overlay .leaflet-pane {
          z-index: auto;
        }
        .flight-plan-windy-overlay .leaflet-overlay-pane,
        .flight-plan-windy-overlay .leaflet-marker-pane,
        .flight-plan-windy-overlay .leaflet-tooltip-pane,
        .flight-plan-windy-overlay .leaflet-popup-pane {
          z-index: 400;
        }
        .flight-plan-windy-overlay .leaflet-control-container {
          z-index: 500;
        }
      `}</style>
    </div>
  );
}
