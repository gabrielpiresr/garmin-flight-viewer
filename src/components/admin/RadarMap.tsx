import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  WINDY_OVERLAYS,
  buildWindyEmbedUrl,
  type WindyOverlayId,
} from "../../lib/windyEmbed";
import { WindyIsobarsIcon, WindyOverlayIcon } from "../../lib/windyOverlayIcons";
import type { FlightRadarLivePosition, FlightRadarTrackPoint } from "../../types/flightRadar";
import { REA_LAYER_TOGGLES, ReaRoutesOverlay, ReaRoutesOverlayBoundary } from "../ReaRoutesOverlay";

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

type RadarLayerId = (typeof WMS_LAYERS)[number]["id"] | (typeof REA_LAYER_TOGGLES)[number]["id"];

const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

type WindyView = { lat: number; lon: number; zoom: number };

export type RadarMapAircraft = FlightRadarLivePosition & {
  label: string;
  color: string;
  selected?: boolean;
};

type Props = {
  aircraft: RadarMapAircraft[];
  trail: FlightRadarTrackPoint[];
  center: { lat: number; lon: number; zoom: number };
  /** One-shot recenter request (nonce must change to re-trigger). */
  focusTarget?: { lat: number; lon: number; zoom?: number; nonce: number } | null;
  onSelect: (fr24Id: string) => void;
  className?: string;
};

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

function aircraftIcon(label: string, heading: number | null, color: string, selected: boolean) {
  const rot = Number.isFinite(heading) ? Number(heading) : 0;
  const ring = selected
    ? "0 0 0 2px rgba(16,185,129,.95), 0 2px 8px rgba(0,0,0,.45)"
    : "0 1px 4px rgba(0,0,0,.55)";
  // Nose-up silhouette (0° = north). Classic top-down GA / jet outline.
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;transform:translateY(-8px)">
      <div style="transform:rotate(${rot}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,.65))">
        <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="${color}" stroke="#0f172a" stroke-width="0.6" stroke-linejoin="round"
            d="M12 1.2c.35 0 .62.2.72.5l1.35 4.1 7.13 2.35c.55.18.55.94 0 1.12l-7.13 2.35-.5 5.85 2.7 1.55c.4.23.22.82-.25.82h-3.02v2.35c0 .4-.32.72-.72.72s-.72-.32-.72-.72V19.84H8.3c-.47 0-.65-.59-.25-.82l2.7-1.55-.5-5.85-7.13-2.35c-.55-.18-.55-.94 0-1.12l7.13-2.35 1.35-4.1c.1-.3.37-.5.72-.5z"/>
        </svg>
      </div>
      <span style="font:700 10px/1.1 ui-monospace,monospace;color:#f8fafc;background:rgba(2,6,23,.88);padding:2px 5px;border-radius:4px;box-shadow:${ring};white-space:nowrap">${label}</span>
    </div>`,
    iconSize: [84, 44],
    iconAnchor: [42, 16],
  });
}

function FitOrFollow({
  aircraft,
  trail,
  seed,
  focusTarget,
}: {
  aircraft: RadarMapAircraft[];
  trail: [number, number][];
  seed: WindyView;
  focusTarget?: { lat: number; lon: number; zoom?: number; nonce: number } | null;
}) {
  const map = useMap();
  const didFit = useRef(false);
  const lastFocusNonce = useRef<number | null>(null);
  const hadTrail = useRef(false);

  useEffect(() => {
    if (focusTarget && focusTarget.nonce !== lastFocusNonce.current) {
      lastFocusNonce.current = focusTarget.nonce;
      const zoom = focusTarget.zoom ?? Math.max(map.getZoom(), 10);
      map.setView([focusTarget.lat, focusTarget.lon], zoom, { animate: true });
      didFit.current = true;
      return;
    }

    // Frame the FR24 route once when it first arrives (not on every live tip update).
    if (trail.length > 2) {
      if (!hadTrail.current) {
        hadTrail.current = true;
        const bounds = L.latLngBounds(trail);
        map.fitBounds(bounds, { padding: [40, 40], animate: true, maxZoom: 12 });
        didFit.current = true;
        return;
      }
    } else {
      hadTrail.current = false;
    }

    // Initial fit only — never pan on live refreshes.
    if (didFit.current) return;
    if (aircraft.length === 0) {
      map.setView([seed.lat, seed.lon], seed.zoom, { animate: false });
      didFit.current = true;
      return;
    }
    if (aircraft.length === 1) {
      map.setView([aircraft[0]!.lat, aircraft[0]!.lon], Math.max(seed.zoom, 10), { animate: false });
      didFit.current = true;
      return;
    }
    const bounds = L.latLngBounds(aircraft.map((a) => [a.lat, a.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], animate: false, maxZoom: 12 });
    didFit.current = true;
  }, [aircraft, trail, map, seed, focusTarget]);

  return null;
}

function WindyBackgroundSync({
  overlay,
  pressure,
  onSettle,
  onInteracting,
}: {
  overlay: WindyOverlayId;
  pressure: boolean;
  onSettle: (view: WindyView, opts?: { force?: boolean }) => void;
  onInteracting: (active: boolean) => void;
}) {
  const map = useMap();
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const onInteractingRef = useRef(onInteracting);
  onInteractingRef.current = onInteracting;
  const settleTimer = useRef<number | null>(null);

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      onInteractingRef.current(false);
      const c = map.getCenter();
      onSettleRef.current({
        lat: c.lat,
        lon: c.lng,
        zoom: Math.round(map.getZoom()),
      });
    }, 280);
  }, [map]);

  useMapEvents({
    dragstart() {
      onInteractingRef.current(true);
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    },
    zoomstart() {
      onInteractingRef.current(true);
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    },
    moveend: scheduleSettle,
    zoomend: scheduleSettle,
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const c = map.getCenter();
      onSettleRef.current(
        { lat: c.lat, lon: c.lng, zoom: Math.round(map.getZoom()) },
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

export function RadarMap({
  aircraft,
  trail,
  center,
  focusTarget = null,
  onSelect,
  className = "",
}: Props) {
  // Satellite is the smooth default; Windy is opt-in (iframe cannot pan smoothly).
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [windyOverlay, setWindyOverlay] = useState<WindyOverlayId>("clouds");
  const [windyPressure, setWindyPressure] = useState(false);
  const [windyInteracting, setWindyInteracting] = useState(false);
  const [layersOn, setLayersOn] = useState<Record<RadarLayerId, boolean>>(() =>
    Object.fromEntries([
      ...WMS_LAYERS.map((l) => [l.id, l.defaultOn]),
      ...REA_LAYER_TOGGLES.map((l) => [l.id, false]),
    ]) as Record<RadarLayerId, boolean>,
  );

  const seedView = useMemo(
    () => ({ lat: center.lat, lon: center.lon, zoom: center.zoom }),
    [center.lat, center.lon, center.zoom],
  );
  const isWindy = mapStyle === "windy";
  const baseTiles = TILES[isWindy ? "satellite" : mapStyle];
  const activeOverlay = WINDY_OVERLAYS.find((o) => o.id === windyOverlay);

  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [front, setFront] = useState<"a" | "b">("a");
  const [loadingSlot, setLoadingSlot] = useState<"a" | "b" | null>(null);
  const frontUrl = front === "a" ? slotA : slotB;

  const trailPositions = useMemo(() => {
    // Cap points for Leaflet smoothness while keeping shape.
    if (trail.length <= 400) return trail.map((p) => [p.lat, p.lon] as [number, number]);
    const step = Math.ceil(trail.length / 400);
    const out: [number, number][] = [];
    for (let i = 0; i < trail.length; i += step) {
      const p = trail[i]!;
      out.push([p.lat, p.lon]);
    }
    const last = trail[trail.length - 1]!;
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== last.lat || prev[1] !== last.lon) out.push([last.lat, last.lon]);
    return out;
  }, [trail]);

  useEffect(() => {
    if (!isWindy) {
      setSlotA(null);
      setSlotB(null);
      setFront("a");
      setLoadingSlot(null);
      setWindyInteracting(false);
      return;
    }
    const url = buildViewUrl(seedView, windyOverlay, windyPressure);
    setSlotA(url);
    setSlotB(null);
    setFront("a");
    setLoadingSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWindy, seedView]);

  const handleSettle = useCallback(
    (view: WindyView, opts?: { force?: boolean }) => {
      if (!isWindy) return;
      const url = buildViewUrl(view, windyOverlay, windyPressure);
      if (!opts?.force && url === frontUrl && !loadingSlot) return;
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
      setFront(slot);
      setLoadingSlot(null);
    },
    [loadingSlot],
  );

  const showWindyFrame = isWindy && !windyInteracting && (slotA || slotB);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-700/70 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mapa ao vivo</p>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
          {(
            [
              ["satellite", "Satélite"],
              ["terrain", "Relevo"],
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
          <div className="flex flex-wrap gap-1">
            {WINDY_OVERLAYS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.description}
                onClick={() => setWindyOverlay(item.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                  windyOverlay === item.id
                    ? "bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/40"
                    : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
                }`}
              >
                <WindyOverlayIcon id={item.id} />
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWindyPressure((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                windyPressure
                  ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
              }`}
            >
              <WindyIsobarsIcon />
              Isóbaras
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            {activeOverlay?.description ?? ""} · No pan/zoom o Windy pausa (evita arrastar labels) e recarrega ao soltar.
          </p>
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
        {REA_LAYER_TOGGLES.map((layer) => {
          const on = layersOn[layer.id] === true;
          return (
            <button
              key={layer.id}
              type="button"
              title={layer.title}
              onClick={() => setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                on
                  ? "bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/50"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
              }`}
            >
              {layer.label}
            </button>
          );
        })}
      </div>

      <div className="relative h-[min(62vh,620px)] w-full overflow-hidden bg-[#1a2332] [&_.leaflet-control-attribution]:text-[9px]">
        {showWindyFrame ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            {slotA ? (
              <iframe
                key={`a:${slotA}`}
                title="Windy fundo A"
                src={slotA}
                onLoad={() => onSlotLoad("a")}
                className="absolute inset-0 border-0 transition-opacity duration-200 ease-out"
                style={{
                  width: "100%",
                  height: "100%",
                  opacity: front === "a" ? 1 : 0,
                  zIndex: front === "a" ? 2 : 1,
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
                className="absolute inset-0 border-0 transition-opacity duration-200 ease-out"
                style={{
                  width: "100%",
                  height: "100%",
                  opacity: front === "b" ? 1 : 0,
                  zIndex: front === "b" ? 2 : 1,
                }}
                referrerPolicy="no-referrer-when-downgrade"
                tabIndex={-1}
                aria-hidden
              />
            ) : null}
          </div>
        ) : null}

        {isWindy && windyInteracting ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
            <span className="rounded-md bg-slate-950/80 px-2 py-1 text-[10px] font-medium text-slate-300 ring-1 ring-slate-700">
              Solte para atualizar o Windy
            </span>
          </div>
        ) : null}

        <MapContainer
          key={isWindy ? "windy" : mapStyle}
          center={[seedView.lat, seedView.lon]}
          zoom={seedView.zoom}
          className={`absolute inset-0 z-10 h-full w-full ${isWindy && !windyInteracting ? "radar-windy-overlay" : "bg-[#1a2332]"}`}
          zoomControl={false}
          attributionControl={!isWindy || windyInteracting}
        >
          {/* Always keep a tile underlay: fills gaps while panning; replaces Windy during drag. */}
          <TileLayer
            key={isWindy ? "windy-underlay" : mapStyle}
            url={baseTiles.url}
            attribution={baseTiles.attribution}
            maxZoom={baseTiles.maxZoom}
            keepBuffer={8}
            updateWhenIdle={false}
            updateWhenZooming
            opacity={isWindy && !windyInteracting ? 0 : 1}
            {...(baseTiles.subdomains ? { subdomains: baseTiles.subdomains } : {})}
          />
          {isWindy ? (
            <WindyBackgroundSync
              overlay={windyOverlay}
              pressure={windyPressure}
              onSettle={handleSettle}
              onInteracting={setWindyInteracting}
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
                opacity={0.45}
                version="1.3.0"
              />
            ) : null,
          )}
          <ReaRoutesOverlayBoundary>
            <ReaRoutesOverlay kind="rea" enabled={layersOn.rea === true} />
            <ReaRoutesOverlay kind="reh" enabled={layersOn.reh === true} />
          </ReaRoutesOverlayBoundary>
          {trailPositions.length > 1 ? (
            <>
              <Polyline
                positions={trailPositions}
                pathOptions={{
                  color: "#0f172a",
                  weight: 6,
                  opacity: 0.35,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Polyline
                positions={trailPositions}
                pathOptions={{
                  color: "#fbbf24",
                  weight: 3.5,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </>
          ) : null}
          {aircraft.map((ac) => (
            <Marker
              key={ac.fr24Id}
              position={[ac.lat, ac.lon]}
              icon={aircraftIcon(ac.label, ac.track, ac.color, ac.selected === true)}
              eventHandlers={{ click: () => onSelect(ac.fr24Id) }}
            />
          ))}
          <FitOrFollow aircraft={aircraft} trail={trailPositions} seed={seedView} focusTarget={focusTarget} />
        </MapContainer>
      </div>

      <style>{`
        .radar-windy-overlay.leaflet-container {
          background: transparent !important;
        }
        .radar-windy-overlay .leaflet-tile-pane {
          background: transparent !important;
        }
        .radar-windy-overlay .leaflet-pane {
          z-index: auto;
        }
        .radar-windy-overlay .leaflet-overlay-pane,
        .radar-windy-overlay .leaflet-marker-pane,
        .radar-windy-overlay .leaflet-tooltip-pane,
        .radar-windy-overlay .leaflet-popup-pane {
          z-index: 400;
        }
        .radar-windy-overlay .leaflet-control-container {
          z-index: 500;
        }
      `}</style>
    </div>
  );
}
