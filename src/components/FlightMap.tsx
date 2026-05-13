import L from "leaflet";
import { memo, useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { FlightPoint } from "../types/flight";

// ── helpers ──────────────────────────────────────────────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [28, 28] });
  }, [map, positions]);
  return null;
}

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
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

// Top-down airplane icon for hover cursor (Material Design "flight" icon, facing up)
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

// ── Map bounds tracker — fires only on moveend/zoomend (not continuous) ──────

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

// ── Imperative hover cursor — bypasses React state entirely ──────────────────

type ImperativeCursorProps = {
  hoverCallbackRef: React.MutableRefObject<((pos: [number, number] | null) => void) | null>;
};

function ImperativeCursor({ hoverCallbackRef }: ImperativeCursorProps) {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker([0, 0] as [number, number], { icon: cursorPlaneIcon(), zIndexOffset: 1000 });

    hoverCallbackRef.current = (pos) => {
      if (!pos) {
        if (map.hasLayer(marker)) marker.removeFrom(map);
        return;
      }
      marker.setLatLng(pos);
      if (!map.hasLayer(marker)) marker.addTo(map);
      if (!map.getBounds().contains(pos)) {
        map.panTo(pos, { animate: true, duration: 0.25, noMoveStart: true });
      }
    };

    return () => {
      marker.removeFrom(map);
      hoverCallbackRef.current = null;
    };
  }, [map, hoverCallbackRef]);

  return null;
}

// ── Static layers — memoized, never re-renders during hover ──────────────────

type StaticLayersProps = {
  positions: [number, number][];
  selectedPositions: [number, number][];
  waypointPositions: [number, number][];
  arrowMarkers: { pos: [number, number]; deg: number }[];
  planeMarker: { pos: [number, number]; deg: number } | null;
};

const StaticMapLayers = memo(function StaticMapLayers({
  positions,
  selectedPositions,
  waypointPositions,
  arrowMarkers,
  planeMarker,
}: StaticLayersProps) {
  const canvasRenderer = useMemo(() => L.canvas(), []);

  return (
    <>
      <Polyline
        renderer={canvasRenderer}
        positions={positions}
        pathOptions={{
          color: "#d946ef",
          weight: 2.4,
          opacity: selectedPositions.length > 1 ? 0.35 : 0.9,
          dashArray: selectedPositions.length > 1 ? "8 8" : undefined,
        }}
      />
      {selectedPositions.length > 1 && (
        <Polyline
          renderer={canvasRenderer}
          positions={selectedPositions}
          pathOptions={{ color: "#d946ef", weight: 3.4, opacity: 0.95 }}
        />
      )}
      {waypointPositions.map((pos, i) => (
        <CircleMarker
          key={i}
          center={pos}
          radius={3}
          renderer={canvasRenderer}
          pathOptions={{ color: "#fff", fillColor: "#d946ef", fillOpacity: 0.7, weight: 1 }}
        />
      ))}
      {arrowMarkers.map((m, i) => (
        <Marker key={i} position={m.pos} icon={arrowIcon(m.deg)} />
      ))}
      {planeMarker && <Marker position={planeMarker.pos} icon={planeIcon(planeMarker.deg)} />}
    </>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

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
    const selectedPositions = useMemo(
      () => selectedPoints.map((p) => [p.lat, p.lon] as [number, number]),
      [selectedPoints],
    );

    const center = useMemo((): [number, number] => {
      if (!points.length) return [-15.78, -47.93];
      const mid = Math.floor(points.length / 2);
      return [points[mid]!.lat, points[mid]!.lon];
    }, [points]);

    const waypointPositions = useMemo(() => {
      const step = Math.max(1, Math.floor(positions.length / 20));
      return positions.filter((_, i) => i % step === 0);
    }, [positions]);

    const arrowMarkers = useMemo(() => {
      const step = Math.max(1, Math.floor(positions.length / 10));
      const markers: { pos: [number, number]; deg: number }[] = [];
      for (let i = step; i < positions.length; i += step) {
        const prev = positions[i - 1]!;
        const curr = positions[i]!;
        const heading = points[i]?.headingDeg;
        markers.push({
          pos: curr,
          deg:
            typeof heading === "number" && Number.isFinite(heading)
              ? heading
              : calcBearing(prev[0], prev[1], curr[0], curr[1]),
        });
      }
      return markers;
    }, [positions, points]);

    const planeMarker = useMemo(() => {
      if (positions.length < 2) return null;
      const last = positions[positions.length - 1]!;
      const prev = positions[positions.length - 2]!;
      const lastHeading = points[points.length - 1]?.headingDeg;
      return {
        pos: last,
        deg:
          typeof lastHeading === "number" && Number.isFinite(lastHeading)
            ? lastHeading
            : calcBearing(prev[0], prev[1], last[0], last[1]),
      };
    }, [positions, points]);

    if (positions.length < 2) {
      return (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 text-sm text-slate-500">
          Trajeto indisponível (menos de 2 pontos).
        </div>
      );
    }

    return (
      <div className={className ?? "h-72 w-full overflow-hidden rounded-xl border border-slate-700 md:h-96"}>
        <MapContainer center={center} zoom={11} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
          <StaticMapLayers
            positions={positions}
            selectedPositions={selectedPositions}
            waypointPositions={waypointPositions}
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
  // Only re-render when the flight track itself changes — refs are stable objects
  (prev, next) =>
    prev.points === next.points &&
    prev.selectedRangeT === next.selectedRangeT &&
    prev.className === next.className &&
    prev.hoverCallbackRef === next.hoverCallbackRef &&
    prev.boundsCallbackRef === next.boundsCallbackRef,
);
