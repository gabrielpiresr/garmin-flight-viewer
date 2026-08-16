import L from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { listAerodromes, type Aerodrome } from "../../lib/aerodromesDb";
import { collectReaFixPoints, loadReaRoutes, type ReaFixPoint } from "../../lib/reaRoutesDb";
import { AIRSPACE_WFS_LAYER_DEFS, type AirspaceInfo } from "../../lib/airspaceLayersDb";
import {
  CHART_NATIVE_ZOOM,
  chartXyzUrlTemplate,
  loadChartTilesManifest,
  xyzAvailableFor,
  type ChartTilesManifest,
} from "../../lib/chartTiles";
import type { ProvaLatLng, ProvaMapBasemap, ProvaMapLayerId } from "../../types/provas";
import { PROVA_MAP_LAYER_DEFS, defaultProvaMapLayersOn } from "../../types/provas";
import { AirspaceLayersOverlay } from "../AirspaceLayersOverlay";
import { AfisAdOverlay } from "../AfisAdOverlay";
import { FcaAdOverlay } from "../FcaAdOverlay";
import { ReaRoutesOverlay, ReaRoutesOverlayBoundary } from "../ReaRoutesOverlay";
import { AirspaceInfoPanel } from "../AirspaceInfoPanel";

const CARTO_LABELS = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const CARTO_NOLABELS = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png";
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const WMS_APP_PROXY = "/api/geoaisweb/wms";

type Mode = "draw" | "click" | "review";

type Props = {
  center: ProvaLatLng;
  zoom: number;
  layersOn: Partial<Record<ProvaMapLayerId, boolean>>;
  allowedLayerIds?: ProvaMapLayerId[];
  mode: Mode;
  polygon?: ProvaLatLng[];
  clickPoint?: ProvaLatLng | null;
  revealPolygon?: ProvaLatLng[] | null;
  heightClass?: string;
  basemap?: ProvaMapBasemap;
  onLayersChange?: (next: Record<ProvaMapLayerId, boolean>) => void;
  onViewChange?: (view: { center: ProvaLatLng; zoom: number }) => void;
  onPolygonChange?: (points: ProvaLatLng[]) => void;
  onClickPoint?: (point: ProvaLatLng) => void;
  onBasemapChange?: (basemap: ProvaMapBasemap) => void;
};

function ViewSync({
  onViewChange,
}: {
  onViewChange?: (view: { center: ProvaLatLng; zoom: number }) => void;
}) {
  const map = useMap();
  useMapEvents({
    moveend() {
      const c = map.getCenter();
      onViewChange?.({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
    },
    zoomend() {
      const c = map.getCenter();
      onViewChange?.({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
    },
  });
  return null;
}

function ClickOrDraw({
  mode,
  onPolygonPoint,
  onClickPoint,
}: {
  mode: Mode;
  onPolygonPoint: (point: ProvaLatLng) => void;
  onClickPoint: (point: ProvaLatLng) => void;
}) {
  useMapEvents({
    click(e) {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (mode === "draw") onPolygonPoint(point);
      if (mode === "click") onClickPoint(point);
    },
  });
  return null;
}

function ViewportAirports({ aerodromes, enabled }: { aerodromes: Aerodrome[]; enabled: boolean }) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({
    moveend() {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
    zoomend() {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
  });
  if (!enabled || zoom < 7) return null;
  const max = zoom >= 10 ? 80 : 40;
  const visible = aerodromes
    .filter((ad) => {
      const lat = ad.latitudeGeoPoint;
      const lng = ad.longitudeGeoPoint;
      return lat != null && lng != null && bounds.contains([lat, lng]);
    })
    .slice(0, max);
  return (
    <>
      {visible.map((ad) => (
        <CircleMarker
          key={ad.id}
          center={[ad.latitudeGeoPoint!, ad.longitudeGeoPoint!]}
          radius={zoom >= 10 ? 5 : 4}
          pathOptions={{ color: "#0f766e", weight: 1, fillColor: "#14b8a6", fillOpacity: 0.9 }}
        >
          {zoom >= 9 ? (
            <Tooltip direction="right" offset={[8, 0]} permanent className="prova-ad-tooltip">
              {ad.icao || ad.name}
            </Tooltip>
          ) : null}
        </CircleMarker>
      ))}
    </>
  );
}

function ViewportReaPoints({ fixes, enabled }: { fixes: ReaFixPoint[]; enabled: boolean }) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({
    moveend() {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
    zoomend() {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
  });
  if (!enabled || zoom < 8) return null;
  const max = zoom >= 11 ? 60 : 30;
  const visible = fixes
    .filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon) && bounds.contains([fix.lat, fix.lon]))
    .slice(0, max);
  return (
    <>
      {visible.map((fix) => (
        <CircleMarker
          key={`${fix.name}-${fix.lat}-${fix.lon}`}
          center={[fix.lat, fix.lon]}
          radius={4}
          pathOptions={{ color: "#b45309", weight: 1, fillColor: "#f59e0b", fillOpacity: 0.95 }}
        >
          {zoom >= 10 ? (
            <Tooltip direction="top" offset={[0, -6]} permanent className="prova-rea-tooltip">
              {fix.name}
            </Tooltip>
          ) : null}
        </CircleMarker>
      ))}
    </>
  );
}

function WacBasemap() {
  const [manifest, setManifest] = useState<ChartTilesManifest | null>(null);
  useEffect(() => {
    void loadChartTilesManifest().then(setManifest);
  }, []);
  const useXyz = xyzAvailableFor(manifest, "wac");
  const limits = CHART_NATIVE_ZOOM.wac;
  if (useXyz) {
    return (
      <TileLayer
        url={chartXyzUrlTemplate("wac", manifest?.layers?.wac?.format || "webp")}
        attribution="WAC GeoAISWEB DECEA"
        minZoom={limits.min}
        maxZoom={limits.max}
        maxNativeZoom={limits.maxNative}
        tileSize={256}
      />
    );
  }
  return (
    <WMSTileLayer
      url={WMS_APP_PROXY}
      layers="wac"
      format="image/png"
      transparent={false}
      version="1.1.1"
      attribution="WAC GeoAISWEB DECEA"
      maxZoom={16}
    />
  );
}

const clickIcon = L.divIcon({
  className: "prova-click-pin",
  html: `<span class="block h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function normalizeBasemap(value: ProvaMapBasemap | undefined): ProvaMapBasemap {
  if (value === "sat" || value === "wac") return value;
  return "map";
}

export function ProvaExamMap({
  center,
  zoom,
  layersOn,
  allowedLayerIds,
  mode,
  polygon = [],
  clickPoint = null,
  revealPolygon = null,
  heightClass = "h-[420px]",
  basemap: basemapProp,
  onLayersChange,
  onViewChange,
  onPolygonChange,
  onClickPoint,
  onBasemapChange,
}: Props) {
  const allowed = useMemo(
    () => new Set(allowedLayerIds ?? PROVA_MAP_LAYER_DEFS.map((l) => l.id)),
    [allowedLayerIds],
  );
  const [localLayers, setLocalLayers] = useState<Record<ProvaMapLayerId, boolean>>(() => {
    const defaults = defaultProvaMapLayersOn();
    return { ...defaults, ...layersOn };
  });
  const [aerodromes, setAerodromes] = useState<Aerodrome[]>([]);
  const [reaFixes, setReaFixes] = useState<ReaFixPoint[]>([]);
  const [selectedAirspace, setSelectedAirspace] = useState<{ info: AirspaceInfo; key: string } | null>(null);
  const [basemap, setBasemap] = useState<ProvaMapBasemap>(() => normalizeBasemap(basemapProp));

  useEffect(() => {
    setLocalLayers((prev) => ({ ...prev, ...layersOn }));
  }, [layersOn]);

  useEffect(() => {
    setBasemap(normalizeBasemap(basemapProp));
  }, [basemapProp]);

  useEffect(() => {
    let cancelled = false;
    void listAerodromes().then((rows) => {
      if (!cancelled) setAerodromes(rows);
    });
    void Promise.all([loadReaRoutes("rea"), loadReaRoutes("reh")]).then(([rea, reh]) => {
      if (!cancelled) setReaFixes(collectReaFixPoints([...rea.features, ...reh.features]));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const effective = useCallback(
    (id: ProvaMapLayerId) => allowed.has(id) && localLayers[id] === true,
    [allowed, localLayers],
  );

  function toggleLayer(id: ProvaMapLayerId) {
    if (!allowed.has(id)) return;
    setLocalLayers((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      onLayersChange?.(next);
      return next;
    });
  }

  function changeBasemap(next: ProvaMapBasemap) {
    setBasemap(next);
    onBasemapChange?.(next);
  }

  function selectAirspace(info: AirspaceInfo | null, key: string | null) {
    if (mode !== "draw") return;
    if (!info || !key) setSelectedAirspace(null);
    else setSelectedAirspace({ info, key });
  }

  const grouped = useMemo(
    () => ({
      airspace: PROVA_MAP_LAYER_DEFS.filter((l) => l.group === "airspace" && allowed.has(l.id)),
      routes: PROVA_MAP_LAYER_DEFS.filter((l) => l.group === "routes" && allowed.has(l.id)),
      features: PROVA_MAP_LAYER_DEFS.filter((l) => l.group === "features" && allowed.has(l.id)),
    }),
    [allowed],
  );

  const positions = polygon.map((p) => [p.lat, p.lng] as [number, number]);
  const revealPositions = (revealPolygon ?? []).map((p) => [p.lat, p.lng] as [number, number]);
  const cityLabelsOn = effective("city_labels");
  const corridorLabelsOn = effective("corridor_labels");
  const isWac = basemap === "wac";
  const tileUrl = basemap === "sat" ? SATELLITE : cityLabelsOn ? CARTO_LABELS : CARTO_NOLABELS;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 ${heightClass}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom
        zoomControl
        zoomSnap={isWac ? 1 : 0}
        zoomDelta={isWac ? 1 : 0.5}
      >
        {isWac ? (
          <WacBasemap />
        ) : (
          <TileLayer
            key={`${tileUrl}-${cityLabelsOn}`}
            url={tileUrl}
            attribution="© OpenStreetMap, © CARTO, © Esri"
            maxZoom={19}
            subdomains="abcd"
          />
        )}
        {basemap === "sat" && cityLabelsOn ? (
          <TileLayer url={ESRI_LABELS} attribution="Labels © Esri" maxZoom={19} zIndex={2} />
        ) : null}
        <ViewSync onViewChange={onViewChange} />
        <ClickOrDraw
          mode={mode}
          onPolygonPoint={(point) => onPolygonChange?.([...polygon, point])}
          onClickPoint={(point) => onClickPoint?.(point)}
        />
        {AIRSPACE_WFS_LAYER_DEFS.some((l) => effective(l.id as ProvaMapLayerId)) ? (
          <AirspaceLayersOverlay
            enabledTypes={Object.fromEntries(
              AIRSPACE_WFS_LAYER_DEFS.map((layer) => [layer.id, effective(layer.id as ProvaMapLayerId)]),
            )}
            selectedKey={mode === "draw" ? selectedAirspace?.key ?? null : null}
            onSelect={selectAirspace}
          />
        ) : null}
        <FcaAdOverlay
          enabled={effective("fca_ad")}
          aerodromes={aerodromes}
            selectedKey={mode === "draw" ? selectedAirspace?.key ?? null : null}
            onSelect={selectAirspace}
        />
        <AfisAdOverlay
          enabled={effective("afis")}
          aerodromes={aerodromes}
            selectedKey={mode === "draw" ? selectedAirspace?.key ?? null : null}
            onSelect={selectAirspace}
        />
        <ReaRoutesOverlayBoundary>
          <ReaRoutesOverlay
            kind="rea"
            enabled={!isWac && effective("rea")}
            showEndpointMarkers={false}
            showLabels={corridorLabelsOn}
          />
          <ReaRoutesOverlay
            kind="reh"
            enabled={!isWac && effective("reh")}
            showEndpointMarkers={false}
            showLabels={corridorLabelsOn}
          />
        </ReaRoutesOverlayBoundary>
        <ViewportAirports aerodromes={aerodromes} enabled={effective("airports")} />
        <ViewportReaPoints fixes={reaFixes} enabled={effective("rea_points")} />
        {positions.length >= 2 ? (
          mode === "draw" && positions.length < 3 ? (
            <Polyline positions={positions} pathOptions={{ color: "#22c55e", weight: 2, dashArray: "6 6" }} />
          ) : (
            <Polygon positions={positions} pathOptions={{ color: "#22c55e", weight: 2, fillOpacity: 0.22 }} />
          )
        ) : null}
        {revealPositions.length >= 3 ? (
          <Polygon positions={revealPositions} pathOptions={{ color: "#22c55e", weight: 2, fillOpacity: 0.18 }} />
        ) : null}
        {clickPoint ? <Marker position={[clickPoint.lat, clickPoint.lng]} icon={clickIcon} /> : null}
      </MapContainer>

      {mode === "draw" ? (
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex items-start justify-between gap-3">
        <div className="pointer-events-auto max-h-[min(70%,22rem)] w-[min(100%,18rem)] overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-950 p-3 shadow-2xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Camadas</p>
          {(["airspace", "routes", "features"] as const).map((group) =>
            grouped[group].length ? (
              <div key={group} className="mb-2 last:mb-0">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">
                  {group === "airspace" ? "Espaço aéreo" : group === "routes" ? "Rotas" : "Referências"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {grouped[group].map((layer) => {
                    const on = effective(layer.id);
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => toggleLayer(layer.id)}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          on
                            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-50"
                            : "border-slate-700 bg-slate-900 text-slate-500"
                        }`}
                      >
                        {layer.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}
          <div className="mt-2 flex gap-1">
            {(
              [
                ["map", "Mapa"],
                ["sat", "Satélite"],
                ["wac", "WAC"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => changeBasemap(id)}
                className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase ${
                  basemap === id ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-50" : "border-slate-700 text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {selectedAirspace ? (
          <div className="pointer-events-auto">
            <AirspaceInfoPanel info={selectedAirspace.info} onClose={() => setSelectedAirspace(null)} />
          </div>
        ) : null}
      </div>
      ) : null}

      {mode === "draw" ? (
        <div className="absolute bottom-3 left-3 z-[1000] flex gap-2">
          <button
            type="button"
            onClick={() => onPolygonChange?.(polygon.slice(0, -1))}
            disabled={polygon.length === 0}
            className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
          >
            Desfazer ponto
          </button>
          <button
            type="button"
            onClick={() => onPolygonChange?.([])}
            disabled={polygon.length === 0}
            className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Limpar área
          </button>
        </div>
      ) : null}
      {mode === "click" ? (
        <p className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
          Clique no mapa para marcar a resposta
        </p>
      ) : null}
    </div>
  );
}
