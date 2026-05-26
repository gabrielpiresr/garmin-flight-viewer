import L from "leaflet";
import { memo, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { makeConsecutiveLegs } from "../lib/trafficPattern";
import type { FlightPoint, TrafficPatternAnalysis } from "../types/flight";

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

function sampleForMarkers<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = Math.max(1, Math.floor(items.length / count));
  return items.filter((_, index) => index % step === 0);
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
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
    const renderer = L.canvas({ padding: 0.35 });
    const group = L.layerGroup().addTo(map);

    // Trajeto base (todo o voo) — esmaecido quando há seleção
    L.polyline(positions, {
      renderer,
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
        color: "#d946ef",
        weight: 3.4,
        opacity: 0.95,
        interactive: false,
      }).addTo(group);
    }

    for (const pos of sampleForMarkers(positions, 20)) {
      L.circleMarker(pos, {
        renderer,
        radius: 3,
        color: "#fff",
        fillColor: "#d946ef",
        fillOpacity: 0.7,
        weight: 1,
        interactive: false,
      }).addTo(group);
    }

    for (const marker of arrowMarkers) {
      L.marker(marker.pos, { icon: arrowIcon(marker.deg), interactive: false }).addTo(group);
    }
    if (planeMarker) {
      L.marker(planeMarker.pos, { icon: planeIcon(planeMarker.deg), interactive: false }).addTo(group);
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
};

export const FlightMap = memo(
  function FlightMap({ points, selectedRangeT, className, hoverCallbackRef, boundsCallbackRef, trafficPattern, chartTimeBaseMs, coloredSegments }: Props) {
    const selectedPoints = useMemo(() => {
      if (!selectedRangeT) return [];
      const [t0, t1] = selectedRangeT;
      return points.filter((p) => p.t !== null && p.t >= t0 && p.t <= t1);
    }, [points, selectedRangeT]);

    const positions = useMemo(() => points.map((p) => [p.lat, p.lon] as [number, number]), [points]);
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
      <div className={className ?? "h-72 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950 md:h-96"}>
        <MapContainer
          center={center}
          zoom={11}
          className="h-full w-full"
          scrollWheelZoom
          zoomAnimation
          markerZoomAnimation
          fadeAnimation
          preferCanvas
        >
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
            keepBuffer={4}
            updateWhenIdle={false}
            updateWhenZooming
            opacity={1}
          />
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
          <FitBounds positions={selectedPositions.length > 1 ? selectedPositions : positions} />
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
