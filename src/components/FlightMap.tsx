import L from "leaflet";
import { memo, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { FlightPoint } from "../types/flight";

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

function MapBoundsTracker({
  boundsCallbackRef,
}: {
  boundsCallbackRef: React.MutableRefObject<((b: L.LatLngBounds) => void) | null>;
}) {
  useMapEvents({
    moveend(e) { boundsCallbackRef.current?.(e.target.getBounds()); },
    zoomend(e) { boundsCallbackRef.current?.(e.target.getBounds()); },
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
}: {
  positions: [number, number][];
  selectedPositions: [number, number][];
  arrowMarkers: { pos: [number, number]; deg: number }[];
  planeMarker: { pos: [number, number]; deg: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    const renderer = L.canvas({ padding: 0.35 });
    const group = L.layerGroup().addTo(map);
    const base = L.polyline(positions, {
      renderer,
      color: "#d946ef",
      weight: 2.4,
      opacity: selectedPositions.length > 1 ? 0.35 : 0.9,
      dashArray: selectedPositions.length > 1 ? "8 8" : undefined,
      interactive: false,
    }).addTo(group);
    void base;

    if (selectedPositions.length > 1) {
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
  }, [arrowMarkers, map, planeMarker, positions, selectedPositions]);

  return null;
}

type Props = {
  points: FlightPoint[];
  selectedRangeT?: [number, number] | null;
  className?: string;
  hoverCallbackRef?: React.MutableRefObject<((pos: [number, number] | null) => void) | null>;
  boundsCallbackRef?: React.MutableRefObject<((b: L.LatLngBounds) => void) | null>;
};

export const FlightMap = memo(
  function FlightMap({ points, selectedRangeT, className, hoverCallbackRef, boundsCallbackRef }: Props) {
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

    if (positions.length < 2) {
      return (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 text-sm text-slate-500">
          Trajeto indisponivel (menos de 2 pontos).
        </div>
      );
    }

    return (
      <div className={className ?? "h-72 w-full overflow-hidden rounded-xl border border-slate-700 md:h-96"}>
        <MapContainer
          center={center}
          zoom={11}
          className="h-full w-full"
          scrollWheelZoom
          zoomAnimation={false}
          markerZoomAnimation={false}
          preferCanvas
        >
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
            updateWhenIdle
            updateWhenZooming={false}
          />
          <ImperativeRouteLayers
            positions={positions}
            selectedPositions={selectedPositions}
            arrowMarkers={arrowMarkers}
            planeMarker={planeMarker}
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
    prev.boundsCallbackRef === next.boundsCallbackRef,
);
