import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, WMSTileLayer, useMap } from "react-leaflet";
import type { FlightPlanWaypoint } from "../types/flightPlanning";

type MapStyle = "satellite" | "roads" | "terrain";

const TILES: Record<MapStyle, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
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
    maxZoom: 19,
  },
};

const WMS_LAYERS = [
  { id: "cta", label: "CTA", layer: "ICA:CTA", defaultOn: true },
  { id: "tma", label: "TMA", layer: "ICA:TMA", defaultOn: true },
  { id: "ctr", label: "CTR", layer: "ICA:CTR", defaultOn: true },
  { id: "atz", label: "ATZ", layer: "ICA:ATZ", defaultOn: false },
] as const;

const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

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
  const [mapStyle, setMapStyle] = useState<MapStyle>("terrain");
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(WMS_LAYERS.map((l) => [l.id, l.defaultOn])),
  );

  const positions = useMemo(
    () => waypoints.map((w) => [w.lat, w.lng] as [number, number]),
    [waypoints],
  );
  const tiles = TILES[mapStyle];

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
      <div className="h-[360px] w-full bg-slate-950 [&_.leaflet-control-attribution]:text-[9px]">
        <MapContainer
          center={positions[0]!}
          zoom={8}
          className="h-full w-full"
          scrollWheelZoom
          zoomControl
        >
          <FitRoute positions={positions} />
          <TileLayer
            key={mapStyle}
            attribution={tiles.attribution}
            url={tiles.url}
            maxZoom={tiles.maxZoom}
            {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
          />
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
    </div>
  );
}
