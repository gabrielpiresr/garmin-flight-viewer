import L from "leaflet";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { AIRSPACE_LAYER_DEFS, AIRSPACE_WFS_LAYER_DEFS, type AirspaceInfo } from "../lib/airspaceLayersDb";
import { makeConsecutiveLegs } from "../lib/trafficPattern";
import type { FlightPoint, TrafficPatternAnalysis } from "../types/flight";
import { AirspaceInfoPanel } from "./AirspaceInfoPanel";
import { AirspaceLayersOverlay } from "./AirspaceLayersOverlay";
import { REA_LAYER_TOGGLES, ReaRoutesOverlay, ReaRoutesOverlayBoundary } from "./ReaRoutesOverlay";

type AirspaceLayerId = (typeof REA_LAYER_TOGGLES)[number]["id"];
type MapStyle = "terrain" | "satellite" | "roads";

const TILES: Record<MapStyle, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles (c) Esri",
    maxZoom: 19,
  },
  roads: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "(c) OpenStreetMap",
    maxZoom: 19,
    subdomains: "abc",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles (c) Esri",
    maxZoom: 18,
  },
};

const AIRSPACE_LAYER_TOGGLES = AIRSPACE_LAYER_DEFS
  .filter((d) => d.layer && d.kind)
  .map((d) => ({
    id: d.id,
    label: d.label,
    defaultOn: d.id === "ctr" || d.id === "atz",
    color: d.color,
  }));

type FlightMapLayerId = AirspaceLayerId | (typeof AIRSPACE_LAYER_TOGGLES)[number]["id"];

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function arrowIcon(deg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid rgba(217,70,239,0.85);transform:rotate(${deg}deg);transform-origin:center"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function planeIcon(deg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:22px;line-height:1;transform:rotate(${deg}deg);transform-origin:center;filter:drop-shadow(0 0 3px rgba(0,0,0,0.9));color:#fff">✈</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function cursorPlaneIcon() {
  return L.divIcon({
    className: "",
    html: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="22" height="22" style="filter:drop-shadow(0 0 4px rgba(0,0,0,0.9))">
      <path fill="#d946ef" stroke="white" stroke-width="0.8"
        d="M12 2c-.55 0-1 .45-1 1v7.59L3.71 14H3v2l8-2.59V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.59L21 16v-2h-.71L13 10.59V3c0-.55-.45-1-1-1z"/>
    </svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 14],
  });
}

function MapToolIconMap({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function MapToolIconAirspace({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="3" cy="3" r="1.65" />
      <circle cx="9" cy="3" r="1.65" />
      <circle cx="15" cy="3" r="1.65" />
      <circle cx="21" cy="3" r="1.65" />
      <circle cx="3" cy="9" r="1.65" />
      <circle cx="21" cy="9" r="1.65" />
      <circle cx="3" cy="15" r="1.65" />
      <circle cx="21" cy="15" r="1.65" />
      <circle cx="3" cy="21" r="1.65" />
      <circle cx="9" cy="21" r="1.65" />
      <circle cx="15" cy="21" r="1.65" />
      <circle cx="21" cy="21" r="1.65" />
    </svg>
  );
}

function sampleForMarkers<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = Math.max(1, Math.floor(items.length / count));
  return items.filter((_, index) => index % step === 0);
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (positions.length < 2) return;
    const first = positions[0]!;
    const last = positions[positions.length - 1]!;
    const fitKey = `${positions.length}:${first[0].toFixed(5)},${first[1].toFixed(5)}:${last[0].toFixed(5)},${last[1].toFixed(5)}`;
    if (fittedKeyRef.current === fitKey) return;
    fittedKeyRef.current = fitKey;
    window.requestAnimationFrame(() => {
      map.invalidateSize(false);
      map.fitBounds(L.latLngBounds(positions), { padding: [28, 28], animate: false });
    });
  }, [map, positions]);
  return null;
}

function ResizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const invalidate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        map.invalidateSize(false);
      });
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);
    const timers = [50, 180, 420].map((delay) => window.setTimeout(invalidate, delay));
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [map]);
  return null;
}

function MapBoundsTracker({
  boundsCallbackRef,
}: {
  boundsCallbackRef: React.MutableRefObject<((b: L.LatLngBounds) => void) | null>;
}) {
  const userMoveRef = useRef(false);

  useMapEvents({
    dragstart() {
      userMoveRef.current = true;
    },
    zoomstart(e) {
      if ((e as L.LeafletEvent & { originalEvent?: Event }).originalEvent) {
        userMoveRef.current = true;
      }
    },
    moveend(e) {
      if (!userMoveRef.current) return;
      boundsCallbackRef.current?.(e.target.getBounds());
    },
    zoomend(e) {
      if (!userMoveRef.current) return;
      boundsCallbackRef.current?.(e.target.getBounds());
      window.setTimeout(() => {
        userMoveRef.current = false;
      }, 0);
    },
  });
  return null;
}

function ImperativeCursor({
  hoverCallbackRef,
}: {
  hoverCallbackRef: React.MutableRefObject<((pos: [number, number] | null) => void) | null>;
}) {
  const map = useMap();
  useEffect(() => {
    const marker = L.marker([0, 0] as [number, number], { icon: cursorPlaneIcon(), zIndexOffset: 1000, interactive: false });
    hoverCallbackRef.current = (pos) => {
      if (!pos) {
        if (map.hasLayer(marker)) marker.removeFrom(map);
        return;
      }
      marker.setLatLng(pos);
      if (!map.hasLayer(marker)) marker.addTo(map);
    };
    return () => {
      marker.removeFrom(map);
      hoverCallbackRef.current = null;
    };
  }, [map, hoverCallbackRef]);
  return null;
}

function ImperativeRouteLayers({
  positions,
  selectedPositions,
  arrowMarkers,
  planeMarker,
  legSegments,
}: {
  positions: [number, number][];
  selectedPositions: [number, number][];
  arrowMarkers: { pos: [number, number]; deg: number }[];
  planeMarker: { pos: [number, number]; deg: number } | null;
  legSegments?: { color: string; positions: [number, number][] }[] | null;
}) {
  const map = useMap();

  useEffect(() => {
    // Garante trajeto acima da REA (pane 350)
    let routePane = map.getPane("flight-route-pane");
    if (!routePane) {
      routePane = map.createPane("flight-route-pane");
      routePane.style.zIndex = "450";
    }

    const renderer = L.canvas({ padding: 0.35, pane: "flight-route-pane" });
    const group = L.layerGroup().addTo(map);

    // Trajeto base (todo o voo) — esmaecido quando há seleção
    L.polyline(positions, {
      renderer,
      pane: "flight-route-pane",
      color: "#d946ef",
      weight: 2.4,
      opacity: selectedPositions.length > 1 ? 0.4 : 0.9,
      dashArray: selectedPositions.length > 1 ? "8 8" : undefined,
      interactive: false,
    }).addTo(group);

    const hasLegs = legSegments && legSegments.length > 0 && selectedPositions.length > 1;

    if (hasLegs) {
      // Trajeto do segmento colorido por perna do circuito
      for (const seg of legSegments!) {
        if (seg.positions.length < 2) continue;
        L.polyline(seg.positions, {
          renderer,
          pane: "flight-route-pane",
          color: seg.color,
          weight: 3.4,
          opacity: 0.95,
          interactive: false,
        }).addTo(group);
      }
    } else if (selectedPositions.length > 1) {
      // Sem padrão de circuito — trajeto selecionado em fúcsia uniforme
      L.polyline(selectedPositions, {
        renderer,
        pane: "flight-route-pane",
        color: "#d946ef",
        weight: 3.4,
        opacity: 0.95,
        interactive: false,
      }).addTo(group);
    }

    for (const pos of sampleForMarkers(positions, 20)) {
      L.circleMarker(pos, {
        renderer,
        pane: "flight-route-pane",
        radius: 3,
        color: "#fff",
        fillColor: "#d946ef",
        fillOpacity: 0.7,
        weight: 1,
        interactive: false,
      }).addTo(group);
    }

    for (const marker of arrowMarkers) {
      L.marker(marker.pos, {
        icon: arrowIcon(marker.deg),
        pane: "flight-route-pane",
        interactive: false,
      }).addTo(group);
    }
    if (planeMarker) {
      L.marker(planeMarker.pos, {
        icon: planeIcon(planeMarker.deg),
        pane: "flight-route-pane",
        interactive: false,
      }).addTo(group);
    }

    map.invalidateSize(false);
    return () => {
      group.removeFrom(map);
    };
  }, [arrowMarkers, legSegments, map, planeMarker, positions, selectedPositions]);

  return null;
}

/** Cores por perna do circuito (devem coincidir com PatternLegBar). */
const LEG_MAP_COLORS: Record<string, string> = {
  downwind: "#c4b5fd",
  base:     "#fdba74",
  final:    "#86efac",
};

type Props = {
  points: FlightPoint[];
  selectedRangeT?: [number, number] | null;
  className?: string;
  hoverCallbackRef?: React.MutableRefObject<((pos: [number, number] | null) => void) | null>;
  boundsCallbackRef?: React.MutableRefObject<((b: L.LatLngBounds) => void) | null>;
  trafficPattern?: TrafficPatternAnalysis | null;
  chartTimeBaseMs?: number | null;
  /** Segmentos coloridos por etapa (substitui legSegments quando não há padrão de circuito). */
  coloredSegments?: { color: string; startMs: number; endMs: number }[] | null;
  /** Postpone REA/REH drawing so the GPS track can paint first. */
  deferHeavyLayers?: boolean;
};

export const FlightMap = memo(
  function FlightMap({ points, selectedRangeT, className, hoverCallbackRef, boundsCallbackRef, trafficPattern, chartTimeBaseMs, coloredSegments, deferHeavyLayers = false }: Props) {
    const [mapStyle, setMapStyle] = useState<MapStyle>("terrain");
    const [toolPanel, setToolPanel] = useState<"basemap" | "layers" | null>(null);
    const [selectedAirspace, setSelectedAirspace] = useState<{ info: AirspaceInfo; key: string } | null>(null);
    const [layersOn, setLayersOn] = useState<Record<FlightMapLayerId, boolean>>(() =>
      Object.fromEntries([
        ...AIRSPACE_LAYER_TOGGLES.map((l) => [l.id, l.defaultOn]),
        ...REA_LAYER_TOGGLES.map((l) => [l.id, l.defaultOn]),
      ]) as Record<FlightMapLayerId, boolean>,
    );
    const [heavyLayersReady, setHeavyLayersReady] = useState(!deferHeavyLayers);
    const tiles = TILES[mapStyle];

    useEffect(() => {
      if (!deferHeavyLayers) {
        setHeavyLayersReady(true);
        return;
      }
      const timer = window.setTimeout(() => setHeavyLayersReady(true), 1_600);
      return () => window.clearTimeout(timer);
    }, [deferHeavyLayers]);

    const selectedPoints = useMemo(() => {
      if (!selectedRangeT) return [];
      const [t0, t1] = selectedRangeT;
      return points.filter((p) => p.t !== null && p.t >= t0 && p.t <= t1);
    }, [points, selectedRangeT]);

    const positions = useMemo(
      () =>
        points
          .filter(
            (p) =>
              Number.isFinite(p.lat) &&
              Number.isFinite(p.lon) &&
              Math.abs(p.lat) <= 90 &&
              Math.abs(p.lon) <= 180,
          )
          .map((p) => [p.lat, p.lon] as [number, number]),
      [points],
    );
    const selectedPositions = useMemo(() => selectedPoints.map((p) => [p.lat, p.lon] as [number, number]), [selectedPoints]);

    const center = useMemo((): [number, number] => {
      if (!points.length) return [-15.78, -47.93];
      const mid = Math.floor(points.length / 2);
      return [points[mid]!.lat, points[mid]!.lon];
    }, [points]);

    const arrowMarkers = useMemo(() => {
      const sampled = sampleForMarkers(positions, 10);
      const markers: { pos: [number, number]; deg: number }[] = [];
      for (let i = 1; i < sampled.length; i += 1) {
        const prev = sampled[i - 1]!;
        const curr = sampled[i]!;
        markers.push({ pos: curr, deg: calcBearing(prev[0], prev[1], curr[0], curr[1]) });
      }
      return markers;
    }, [positions]);

    const planeMarker = useMemo(() => {
      if (positions.length < 2) return null;
      const last = positions[positions.length - 1]!;
      const prev = positions[positions.length - 2]!;
      const lastHeading = points[points.length - 1]?.headingDeg;
      return {
        pos: last,
        deg: typeof lastHeading === "number" && Number.isFinite(lastHeading)
          ? lastHeading
          : calcBearing(prev[0], prev[1], last[0], last[1]),
      };
    }, [positions, points]);

    /** Segmentos coloridos por perna do circuito para o trajeto selecionado. */
    const legSegments = useMemo(() => {
      if (!trafficPattern || chartTimeBaseMs == null || selectedPoints.length < 2 || !selectedRangeT) {
        return null;
      }
      const xMin = selectedRangeT[0] - chartTimeBaseMs;
      const xMax = selectedRangeT[1] - chartTimeBaseMs;
      const consecutive = makeConsecutiveLegs(trafficPattern.legs, xMin, xMax, trafficPattern.touchdownX);
      if (consecutive.length === 0) return null;

      return consecutive.map((leg) => {
        const startT = chartTimeBaseMs + leg.startX;
        const endT   = chartTimeBaseMs + leg.endX;
        const legPositions = selectedPoints
          .filter((p) => p.t != null && p.t >= startT && p.t <= endT)
          .map((p) => [p.lat, p.lon] as [number, number]);
        return {
          color: LEG_MAP_COLORS[leg.type] ?? "#d946ef",
          positions: legPositions,
        };
      }).filter((seg) => seg.positions.length >= 2);
    }, [trafficPattern, chartTimeBaseMs, selectedPoints, selectedRangeT]);

    /** Segmentos externos baseados em etapas (para manobras sem padrão de circuito). */
    const externalSegments = useMemo(() => {
      if (!coloredSegments || coloredSegments.length === 0 || selectedPoints.length < 2) return null;
      const segs = coloredSegments.map((seg) => ({
        color: seg.color,
        positions: selectedPoints
          .filter((p) => p.t != null && p.t >= seg.startMs && p.t <= seg.endMs)
          .map((p) => [p.lat, p.lon] as [number, number]),
      })).filter((s) => s.positions.length >= 2);
      return segs.length > 0 ? segs : null;
    }, [coloredSegments, selectedPoints]);

    // Prioridade: legSegments (circuito) > externalSegments (etapas) > sem coloração
    const effectiveSegments = legSegments ?? externalSegments;

    if (positions.length < 2) {
      return (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 text-sm text-slate-500">
          Trajeto indisponivel (menos de 2 pontos).
        </div>
      );
    }

    return (
      <div
        className={`relative ${className ?? "h-72 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950 md:h-96"}`}
      >
        <div className="pointer-events-none absolute bottom-3 right-2 top-2 z-[1000] flex items-start justify-end gap-2">
          {toolPanel ? (
            <div className="pointer-events-auto flex max-h-full w-[min(100%-3.5rem,17rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                  {toolPanel === "basemap" ? "Tipo de mapa" : "Espacos aereos"}
                </p>
                <button type="button" className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setToolPanel(null)} aria-label="Fechar">
                  x
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {toolPanel === "basemap" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["terrain", "Relevo"],
                      ["satellite", "Satelite"],
                      ["roads", "Rodoviario"],
                    ] as const).map(([id, label]) => {
                      const on = mapStyle === id;
                      return (
                        <button key={id} type="button" onClick={() => setMapStyle(id)} className={`rounded-xl border px-2 py-3 text-center text-[11px] font-semibold transition ${on ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-100" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"}`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {toolPanel === "layers" ? (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Espaco aereo</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {AIRSPACE_LAYER_TOGGLES.map((layer) => {
                          const on = layersOn[layer.id] === true;
                          return (
                            <button key={layer.id} type="button" title={layer.label} onClick={() => setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${on ? "border-white/25 text-white" : "border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300"}`} style={on ? { backgroundColor: `${layer.color}55` } : undefined}>
                              {layer.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rotas especiais</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {REA_LAYER_TOGGLES.map((layer) => {
                          const on = layersOn[layer.id] === true;
                          return (
                            <button key={layer.id} type="button" title={layer.title} onClick={() => setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${on ? "border-amber-400/50 bg-amber-500/25 text-amber-50" : "border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300"}`}>
                              {layer.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-slate-600/80 bg-slate-950/85 p-1 shadow-2xl shadow-black/40 backdrop-blur-md">
            {([
              { id: "basemap" as const, title: "Tipo de mapa", icon: <MapToolIconMap /> },
              { id: "layers" as const, title: "Espacos aereos", icon: <MapToolIconAirspace /> },
            ] as const).map((btn) => {
              const on = toolPanel === btn.id;
              return (
                <button key={btn.id} type="button" title={btn.title} onClick={() => setToolPanel((prev) => (prev === btn.id ? null : btn.id))} className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${on ? "bg-cyan-500/30 text-cyan-100 ring-1 ring-cyan-400/50" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
                  {btn.icon}
                </button>
              );
            })}
          </div>
        </div>
        {selectedAirspace ? (
          <div className="absolute right-14 top-2 z-[995] w-[min(100%-1rem,24rem)]">
            <AirspaceInfoPanel info={selectedAirspace.info} onClose={() => setSelectedAirspace(null)} />
          </div>
        ) : null}
        <div className="hidden">
          <span className="rounded-md bg-slate-950/80 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur-sm">
            Espaço aéreo
          </span>
          {REA_LAYER_TOGGLES.map((layer) => {
            const on = layersOn[layer.id] === true;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                className={`pointer-events-auto rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm transition ${
                  on
                    ? "bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/50"
                    : "bg-slate-950/80 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
                }`}
                title={layer.title}
              >
                {layer.label}
              </button>
            );
          })}
        </div>
        <MapContainer
          key={mapStyle}
          center={center}
          zoom={11}
          className="h-full w-full [&_.leaflet-control-attribution]:text-[9px]"
          scrollWheelZoom
          zoomAnimation
          markerZoomAnimation
          fadeAnimation
          preferCanvas
        >
          <TileLayer
            attribution={`${tiles.attribution} · GeoAISWEB DECEA`}
            url={tiles.url}
            maxZoom={tiles.maxZoom}
            keepBuffer={4}
            updateWhenIdle={false}
            updateWhenZooming
            opacity={1}
            {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
          />
          {AIRSPACE_WFS_LAYER_DEFS.some((l) => layersOn[l.id]) ? (
            <AirspaceLayersOverlay
              enabledTypes={layersOn}
              selectedKey={selectedAirspace?.key ?? null}
              onSelect={(info, key) => {
                if (!info || !key) setSelectedAirspace(null);
                else setSelectedAirspace({ info, key });
              }}
            />
          ) : null}
          <ReaRoutesOverlayBoundary>
            <ReaRoutesOverlay kind="rea" enabled={heavyLayersReady && layersOn.rea === true} />
            <ReaRoutesOverlay kind="reh" enabled={heavyLayersReady && layersOn.reh === true} />
          </ReaRoutesOverlayBoundary>
          <ResizeInvalidator />
          <ImperativeRouteLayers
            positions={positions}
            selectedPositions={selectedPositions}
            arrowMarkers={arrowMarkers}
            planeMarker={planeMarker}
            legSegments={effectiveSegments}
          />
          {hoverCallbackRef && <ImperativeCursor hoverCallbackRef={hoverCallbackRef} />}
          {boundsCallbackRef && <MapBoundsTracker boundsCallbackRef={boundsCallbackRef} />}
          <FitBounds positions={positions} />
        </MapContainer>
      </div>
    );
  },
  (prev, next) =>
    prev.points === next.points &&
    prev.selectedRangeT === next.selectedRangeT &&
    prev.className === next.className &&
    prev.hoverCallbackRef === next.hoverCallbackRef &&
    prev.boundsCallbackRef === next.boundsCallbackRef &&
    prev.trafficPattern === next.trafficPattern &&
    prev.chartTimeBaseMs === next.chartTimeBaseMs &&
    prev.coloredSegments === next.coloredSegments,
);
