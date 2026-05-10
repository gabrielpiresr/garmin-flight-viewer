import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { FlightPoint } from "../types/flight";

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [28, 28] });
  }, [map, positions]);
  return null;
}

type Props = {
  points: FlightPoint[];
};

export function FlightMap({ points }: Props) {
  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lon] as [number, number]),
    [points],
  );
  const center = useMemo(() => {
    if (!points.length) return [-15.78, -47.93] as [number, number];
    const mid = Math.floor(points.length / 2);
    return [points[mid]!.lat, points[mid]!.lon] as [number, number];
  }, [points]);

  if (positions.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 text-sm text-slate-500">
        Trajeto indisponível (menos de 2 pontos).
      </div>
    );
  }

  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-700 md:h-96">
      <MapContainer
        center={center}
        zoom={11}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positions} pathOptions={{ color: "#38bdf8", weight: 4, opacity: 0.9 }} />
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
}
