import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Aerodrome, AerodromeMapFilter } from "../lib/aerodromesDb";
import { EMPTY_AERODROME_MAP_FILTER, filterAerodromesForMap } from "../lib/aerodromesDb";
import {
  buildFlightPlanLegs,
  formatBearingDeg,
  formatCompactAviationCoord,
  haversineM,
  nearestRouteLegIndex,
} from "../lib/flightPlanningRoute";
import {
  WINDY_OVERLAYS,
  buildWindyEmbedUrl,
  type WindyOverlayId,
} from "../lib/windyEmbed";
import { WindyIsobarsIcon, WindyOverlayIcon } from "../lib/windyOverlayIcons";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { REA_LAYER_TOGGLES_PLANNING, ReaRoutesOverlay, ReaRoutesOverlayBoundary } from "./ReaRoutesOverlay";
import { AerodromeMapPopupContent } from "./AerodromePlanningModals";
import { fetchAiswebMetBatch } from "../lib/aiswebDb";
import { parseMetar } from "../lib/aiswebMetar";
import { isValidMetar, metarFlightRule, metarFlightRuleColor, type MetarFlightRule } from "../lib/route3dWeather";
import type { AiswebAirportBundle, AiswebMetarTaf } from "../types/aisweb";
import type { RouteNotamHit } from "../lib/routeNotams";
import { RouteNotamInfoPanel, RouteNotamsOverlay } from "./RouteNotamsOverlay";

type MapStyle = "satellite" | "roads" | "terrain" | "windy" | "wac";
type BaseMapStyle = Exclude<MapStyle, "windy" | "wac">;

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

const TILES_NO_LABELS: Record<BaseMapStyle, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  satellite: TILES.satellite,
  roads: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, © CARTO",
    maxZoom: 19,
    subdomains: "abcd",
  },
  terrain: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, © CARTO",
    maxZoom: 19,
    subdomains: "abcd",
  },
};

const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_WMS_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const GEOAISWEB_WMS_PROXY_BASE = "/api/geoaisweb/wms";
type GeoaiswebLayerSet = "wac" | "rea" | "reh";
const WAC_WMS_LAYERS = [
  "ICA:WAC_2825_CABO_ORANGE",
  "ICA:WAC_2826_MONTE_RORAIMA",
  "ICA:WAC_2827_SERRA_PACARAIMA",
  "ICA:WAC_2892_PICO_DA_NEBLINA",
  "ICA:WAC_2893_BOA_VISTA",
  "ICA:WAC_2894_TUMUCUMAQUE",
  "ICA:WAC_2895_MACAPA",
  "ICA:WAC_2944_FORTALEZA",
  "ICA:WAC_2945_SAO_LUIS",
  "ICA:WAC_2946_BELEM",
  "ICA:WAC_2947_SANTAREM",
  "ICA:WAC_2948_MANAUS",
  "ICA:WAC_2949_SAO_GABRIEL_DA_CACHOEIRA",
  "ICA:WAC_3012_CRUZEIRO_DO_SUL",
  "ICA:WAC_3013_TABATINGA",
  "ICA:WAC_3014_HUMAITA",
  "ICA:WAC_3015_ITAITUBA",
  "ICA:WAC_3016_IMPERATRIZ",
  "ICA:WAC_3017_TERESINA",
  "ICA:WAC_3018_NATAL",
  "ICA:WAC_3019_FERNANDO_DE_NORONHA",
  "ICA:WAC_3066_RECIFE",
  "ICA:WAC_3067_PETROLINA",
  "ICA:WAC_3068_PORTO_NACIONAL",
  "ICA:WAC_3069_CACHIMBO",
  "ICA:WAC_3070_JI_PARANA",
  "ICA:WAC_3071_PORTO_VELHO",
  "ICA:WAC_3072_TARAUACA",
  "ICA:WAC_3137_PRINCIPE_DA_BEIRA",
  "ICA:WAC_3138_CUIABA",
  "ICA:WAC_3139_ARAGARCAS",
  "ICA:WAC_3140_BRASILIA",
  "ICA:WAC_3141_SALVADOR",
  "ICA:WAC_3189_BELO_HORIZONTE",
  "ICA:WAC_3190_GOIANIA",
  "ICA:WAC_3191_RONDONOPOLIS",
  "ICA:WAC_3192_CORUMBA",
  "ICA:WAC_3260_BELA_VISTA",
  "ICA:WAC_3261_CAMPO_GRANDE",
  "ICA:WAC_3262_SAO_PAULO",
  "ICA:WAC_3263_RIO_DE_JANEIRO",
  "ICA:WAC_3313_CURITIBA",
  "ICA:WAC_3314_FOZ_DO_IGUACU",
  "ICA:WAC_3383_URUGUAIANA",
  "ICA:WAC_3384_PORTO_ALEGRE",
  "ICA:WAC_3434_RIO_DA_PRATA",
] as const;

const REA_CHART_WMS_LAYERS = [
  "ICA:CCV_REA_CY_CUIABA",
  "ICA:CCV_REA_PI-PARINTINS",
  "ICA:CCV_REA_WA_TABATINGA",
  "ICA:CCV_REA_WB_BELEM",
  "ICA:CCV_REA_WF_RECIFE",
  "ICA:CCV_REA_WG_CAMPO_GRANDE",
  "ICA:CCV_REA_WH_BELO_HORIZONTE",
  "ICA:CCV_REA_WJ1_RIO_DE_JANEIRO",
  "ICA:CCV_REA_WK_PORTO_SEGURO",
  "ICA:CCV_REA_WN2_MANAUS",
  "ICA:CCV_REA_WP_PORTO_ALEGRE",
  "ICA:CCV_REA_WR_BRASILIA",
  "ICA:CCV_REA_WS_SAO_LUIS",
  "ICA:CCV_REA_WX_SANTAREM",
  "ICA:CCV_REA_WZ_FORTALEZA",
  "ICA:CCV_REA_XF_FLORIANOPOLIS",
  "ICA:CCV_REA_XK_MACAPA",
  "ICA:CCV_REA_XN-ANAPOLIS",
  "ICA:CCV_REA_XP1_SAO_PAULO",
  "ICA:CCV_REA_XP2_SAO_PAULO",
  "ICA:CCV_REA_XR_VITORIA",
  "ICA:CCV_REA_XS_SALVADOR",
  "ICA:CCV_REA_XT_NATAL",
] as const;

const REH_CHART_WMS_LAYERS = [
  "ICA:CCV_REH_WH_BELO_HORIZONTE",
  "ICA:CCV_REH_WJ1_CABO_FRIO",
  "ICA:CCV_REH_WJ2_RIO_DE_JANEIRO",
  "ICA:CCV_REH_WJ3_RIO_DE_JANEIRO",
  "ICA:CCV_REH_XP1_SAO_JOSE_DOS_CAMPOS",
  "ICA:CCV_REH_XP1_SOROCABA",
  "ICA:CCV_REH_XP2_CAMPINAS",
  "ICA:CCV_REH_XP2_SAO_PAULO_1",
  "ICA:CCV_REH_XP2_SAO_PAULO_2",
] as const;

import { AIRSPACE_LAYER_DEFS, AIRSPACE_WFS_LAYER_DEFS, type AirspaceInfo } from "../lib/airspaceLayersDb";
import { loadChartTileObjectUrl } from "../lib/chartTileCache";
import { enqueueChartTileLoad, releaseChartTileSlot } from "../lib/chartTileQueue";
import {
  CHART_OVERLAY_MIN_ZOOM,
  CHART_NATIVE_ZOOM,
  WMS_LAYER_LIMITS,
  WMS_TILE_DEFAULTS,
  chartXyzUrlTemplate,
  loadChartTilesManifest,
  xyzAvailableFor,
  type ChartLayerSet,
  type ChartTilesManifest,
} from "../lib/chartTiles";
import { AirspaceInfoPanel } from "./AirspaceInfoPanel";
import { parseCoordAreaText, coordAreaError } from "../lib/coordArea";
import type { SavedRouteArea } from "../lib/savedFlightRoutes";
import { AirspaceLayersOverlay } from "./AirspaceLayersOverlay";
import { FcaAdOverlay } from "./FcaAdOverlay";
import { AfisAdOverlay } from "./AfisAdOverlay";

const AIRSPACE_TOGGLES = AIRSPACE_LAYER_DEFS.map((d) => ({
  id: d.id,
  label: d.label,
  defaultOn: d.defaultOn,
  color: d.color,
}));

type PlanLayerId =
  | (typeof AIRSPACE_TOGGLES)[number]["id"]
  | (typeof REA_LAYER_TOGGLES_PLANNING)[number]["id"]
  | "airports"
  | "rea_points"
  | "city_labels";

const FEATURE_LAYER_TOGGLES: Array<{
  id: Extract<PlanLayerId, "airports" | "rea_points" | "city_labels">;
  label: string;
  defaultOn: boolean;
}> = [
  { id: "airports", label: "Aeroportos", defaultOn: true },
  { id: "rea_points", label: "Pontos REA", defaultOn: true },
  { id: "city_labels", label: "Cidades", defaultOn: true },
];

const DEFAULT_CENTER: [number, number] = [-15.78, -47.93];

type WindyView = { lat: number; lon: number; zoom: number };
type WindyTransform = { dx: number; dy: number; scale: number };
const IDENTITY_TRANSFORM: WindyTransform = { dx: 0, dy: 0, scale: 1 };

export type MapPickCandidate = {
  lat: number;
  lng: number;
  label: string;
  kind: "airport" | "fix" | "rea";
  name?: string;
  city?: string;
  uf?: string;
  icao?: string;
  altitude?: string;
  operation?: string;
};

const METAR_MARKER_BATCH_SIZE = 40;
const METAR_MARKER_MAX_ICAOS = 120;
const METAR_MARKER_CACHE = new Map<string, AiswebMetarTaf>();

function pendingViewportTiles(layer: L.GridLayer): number {
  const tiles = (layer as unknown as { _tiles?: Record<string, { loaded?: boolean; current?: boolean; el?: HTMLElement }> })
    ._tiles;
  if (!tiles) return 0;
  let pending = 0;
  for (const tile of Object.values(tiles)) {
    if (tile.current && !tile.loaded) pending += 1;
  }
  return pending;
}

function HighDpiWmsTileLayer({
  layers,
  layerSet,
  attribution,
  transparent = true,
  opacity = 1,
  zIndex = 1,
  tileSize = WMS_TILE_DEFAULTS.tileSize,
  pixelRatio = 1,
  keepBuffer,
  maxNativeZoom,
  minNativeZoom,
  className = "flight-plan-chart-tile",
}: {
  layers: readonly string[];
  layerSet?: GeoaiswebLayerSet;
  attribution: string;
  transparent?: boolean;
  opacity?: number;
  zIndex?: number;
  tileSize?: number;
  pixelRatio?: number;
  keepBuffer?: number;
  maxNativeZoom?: number;
  minNativeZoom?: number;
  className?: string;
}) {
  const map = useMap();
  const layerKey = layers.join(",");

  useEffect(() => {
    if (!layers.length) return;

    // Prefer app proxy in prod (sheet filter + cache headers). In DEV use Vite proxy with full layer list.
    const useAppProxy = Boolean(layerSet);
    const baseUrl = useAppProxy
      ? GEOAISWEB_WMS_PROXY_BASE
      : import.meta.env.DEV
        ? DEV_WMS_PROXY_BASE
        : WMS_BASE;
    const requestedSize = Math.round(tileSize * Math.max(1, pixelRatio));
    const wmsLayer = L.tileLayer.wms(baseUrl, {
      layers: useAppProxy && layerSet ? layerSet : layerKey,
      ...(useAppProxy && layerSet ? { layerSet } : {}),
      format: "image/png",
      transparent,
      version: "1.1.1",
      attribution,
      tileSize,
      opacity,
      zIndex,
      keepBuffer: keepBuffer ?? WMS_TILE_DEFAULTS.keepBuffer,
      updateWhenIdle: true,
      updateWhenZooming: false,
      updateInterval: WMS_TILE_DEFAULTS.updateInterval,
      maxZoom: 18,
      ...(maxNativeZoom != null ? { maxNativeZoom } : {}),
      ...(minNativeZoom != null ? { minNativeZoom } : {}),
      className,
      crossOrigin: true,
    });

    const baseGetTileUrl = wmsLayer.getTileUrl.bind(wmsLayer);
    const normalizeUrl = (rawUrl: string, size: number) => {
      const url = new URL(rawUrl, window.location.origin);
      url.searchParams.set("width", String(size));
      url.searchParams.set("height", String(size));
      if (useAppProxy && layerSet) {
        url.searchParams.set("layerSet", layerSet);
        url.searchParams.set("layers", layerSet);
      }
      const sorted = new URLSearchParams(
        [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
      );
      url.search = sorted.toString();
      return url.origin === window.location.origin ? `${url.pathname}?${url.searchParams.toString()}` : url.href;
    };
    const tileUrlFor = (coords: L.Coords, size: number) => normalizeUrl(baseGetTileUrl(coords), size);
    wmsLayer.getTileUrl = (coords: L.Coords) => tileUrlFor(coords, requestedSize);

    const retries = new Map<string, number>();
    const objectUrls = new WeakMap<HTMLImageElement, string>();

    const clearObjectUrl = (img: HTMLImageElement) => {
      const prev = objectUrls.get(img);
      if (prev) {
        URL.revokeObjectURL(prev);
        objectUrls.delete(img);
      }
    };

    const tileKey = (coords: L.Coords) => `${coords.x}:${coords.y}:${coords.z}`;

    (wmsLayer as unknown as { createTile: (c: L.Coords, done?: L.DoneCallback) => HTMLElement }).createTile = (
      coords: L.Coords,
      done?: L.DoneCallback,
    ) => {
      const tile = document.createElement("img");
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      tile.className = className;
      const url = tileUrlFor(coords, requestedSize);
      const key = tileKey(coords);

      let settled = false;
      const settleOk = () => {
        if (settled) return;
        settled = true;
        releaseChartTileSlot();
        done?.(undefined, tile);
      };
      const settleErr = () => {
        if (settled) return;
        settled = true;
        releaseChartTileSlot();
        done?.(new Error("tile error"), tile);
      };

      const wire = (src: string, useQueue: boolean) => {
        const onLoad = () => {
          tile.removeEventListener("load", onLoad);
          tile.removeEventListener("error", onError);
          settleOk();
        };
        const onError = () => {
          tile.removeEventListener("load", onLoad);
          tile.removeEventListener("error", onError);
          const attempt = (retries.get(key) || 0) + 1;
          retries.set(key, attempt);
          if (attempt <= WMS_TILE_DEFAULTS.maxRetries) {
            // Free the concurrency slot from the failed attempt, then retry.
            releaseChartTileSlot();
            settled = false;
            window.setTimeout(() => {
              clearObjectUrl(tile);
              tile.addEventListener("load", onLoad);
              tile.addEventListener("error", onError);
              void loadChartTileObjectUrl(url)
                .then((objectUrl) => {
                  objectUrls.set(tile, objectUrl);
                  enqueueChartTileLoad(tile, objectUrl);
                })
                .catch(() => {
                  enqueueChartTileLoad(tile, `${url}${url.includes("?") ? "&" : "?"}_retry=${attempt}`);
                });
            }, 280 * attempt);
            return;
          }
          settleErr();
        };
        tile.addEventListener("load", onLoad);
        tile.addEventListener("error", onError);
        if (useQueue) enqueueChartTileLoad(tile, src);
        else {
          tile.src = src;
        }
      };

      void loadChartTileObjectUrl(url)
        .then((objectUrl) => {
          objectUrls.set(tile, objectUrl);
          wire(objectUrl, true);
        })
        .catch(() => wire(url, true));

      return tile;
    };

    const coordsFor = (x: number, y: number, z: number): L.Coords =>
      Object.assign(L.point(x, y), { z }) as L.Coords;

    const addPrefetchUrlsForZoom = (urls: Set<string>, zoom: number, padTiles: number, maxForZoom: number) => {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const center = map.project(map.getCenter(), zoom);
      const half = size.divideBy(2);
      const bounds = L.bounds(center.subtract(half), center.add(half));
      const min = bounds.min!.divideBy(tileSize).floor();
      const max = bounds.max!.divideBy(tileSize).floor();
      let added = 0;
      for (let y = min.y - padTiles; y <= max.y + padTiles; y++) {
        for (let x = min.x - padTiles; x <= max.x + padTiles; x++) {
          urls.add(tileUrlFor(coordsFor(x, y, zoom), requestedSize));
          added += 1;
          if (added >= maxForZoom) return;
        }
      }
    };

    let prefetchTimer: number | null = null;

    const schedulePrefetchAfterVisible = () => {
      if (prefetchTimer != null) window.clearTimeout(prefetchTimer);
      prefetchTimer = window.setTimeout(() => {
        prefetchTimer = null;
        if (pendingViewportTiles(wmsLayer) > 0) {
          schedulePrefetchAfterVisible();
          return;
        }
        const zoom = Math.round(map.getZoom());
        const urls = new Set<string>();
        const effectiveZoom = maxNativeZoom != null ? Math.min(zoom, maxNativeZoom) : zoom;
        addPrefetchUrlsForZoom(urls, effectiveZoom, 1, 36);
        addPrefetchUrlsForZoom(urls, Math.max(0, effectiveZoom - 1), 1, 24);

        // Warm IDB/memory even without SW (DEV).
        for (const u of urls) {
          void loadChartTileObjectUrl(u).catch(() => {});
        }

        if (layerSet && navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "GFV_PREFETCH_MAP_TILES",
            urls: [...urls],
          });
        }
      }, 400);
    };

    const onTileLoad = () => schedulePrefetchAfterVisible();
    const onMoveEnd = () => {
      // Re-request failed current tiles after pan/zoom settles.
      const tiles =
        ((wmsLayer as unknown as { _tiles?: Record<string, { loaded?: boolean; current?: boolean; el?: HTMLImageElement; coords?: L.Coords }> })
          ._tiles || {});
      for (const tile of Object.values(tiles)) {
        if (!tile.current || tile.loaded || !tile.el || !tile.coords) continue;
        const img = tile.el;
        if (img.complete && img.naturalWidth > 0) continue;
        const url = tileUrlFor(tile.coords, requestedSize);
        void loadChartTileObjectUrl(url)
          .then((objectUrl) => {
            clearObjectUrl(img);
            objectUrls.set(img, objectUrl);
            img.src = objectUrl;
          })
          .catch(() => {
            img.src = url;
          });
      }
      schedulePrefetchAfterVisible();
    };

    wmsLayer.on("load", onTileLoad);
    map.on("moveend zoomend", onMoveEnd);

    wmsLayer.addTo(map);
    window.setTimeout(() => schedulePrefetchAfterVisible(), 120);
    return () => {
      if (prefetchTimer != null) window.clearTimeout(prefetchTimer);
      wmsLayer.off("load", onTileLoad);
      map.off("moveend zoomend", onMoveEnd);
      wmsLayer.removeFrom(map);
    };
  }, [
    attribution,
    className,
    keepBuffer,
    layerKey,
    layerSet,
    layers.length,
    map,
    maxNativeZoom,
    minNativeZoom,
    opacity,
    pixelRatio,
    tileSize,
    transparent,
    zIndex,
  ]);

  return null;
}

function ChartXyzTileLayer({
  layerSet,
  attribution,
  opacity = 1,
  zIndex = 1,
  format = "webp",
  className = "flight-plan-chart-tile",
}: {
  layerSet: ChartLayerSet;
  attribution: string;
  opacity?: number;
  zIndex?: number;
  format?: "webp" | "png";
  className?: string;
}) {
  const map = useMap();
  const limits = CHART_NATIVE_ZOOM[layerSet];

  useEffect(() => {
    const url = chartXyzUrlTemplate(layerSet, format);
    const layer = L.tileLayer(url, {
      attribution,
      opacity,
      zIndex,
      tileSize: 256,
      minZoom: limits.min,
      maxZoom: limits.max,
      maxNativeZoom: limits.maxNative,
      minNativeZoom: limits.min,
      keepBuffer: 4,
      updateWhenIdle: true,
      updateWhenZooming: false,
      className,
      crossOrigin: true,
    });

    const objectUrls = new WeakMap<HTMLImageElement, string>();
    (layer as unknown as { createTile: (c: L.Coords, done?: L.DoneCallback) => HTMLElement }).createTile = (
      coords: L.Coords,
      done?: L.DoneCallback,
    ) => {
      const tile = document.createElement("img");
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      const src = layer.getTileUrl(coords);
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        releaseChartTileSlot();
        done?.(err, tile);
      };
      const onLoad = () => {
        tile.removeEventListener("load", onLoad);
        tile.removeEventListener("error", onError);
        settle();
      };
      const onError = () => {
        tile.removeEventListener("load", onLoad);
        tile.removeEventListener("error", onError);
        settle(new Error("xyz tile error"));
      };
      tile.addEventListener("load", onLoad);
      tile.addEventListener("error", onError);
      void loadChartTileObjectUrl(src)
        .then((objectUrl) => {
          objectUrls.set(tile, objectUrl);
          enqueueChartTileLoad(tile, objectUrl);
        })
        .catch(() => enqueueChartTileLoad(tile, src));
      return tile;
    };

    layer.addTo(map);
    return () => {
      layer.removeFrom(map);
    };
  }, [attribution, className, format, layerSet, limits.max, limits.maxNative, limits.min, map, opacity, zIndex]);

  return null;
}

function MapZoomValue({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const publish = () => onZoom(map.getZoom());
    publish();
    map.on("zoomend", publish);
    return () => {
      map.off("zoomend", publish);
    };
  }, [map, onZoom]);
  return null;
}

function FitRoute({
  positions,
  fitKey,
}: {
  positions: [number, number][];
  /** Change this key to trigger a one-shot fit; ignore routine waypoint edits. */
  fitKey: string | number | null;
}) {
  const map = useMap();
  const lastKey = useRef<string | number | null>(null);
  useEffect(() => {
    if (fitKey == null || fitKey === lastKey.current) return;
    const valid = positions.filter(
      (p): p is [number, number] =>
        Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
    );
    if (valid.length === 0) return;
    lastKey.current = fitKey;
    window.requestAnimationFrame(() => {
      map.invalidateSize(false);
      if (valid.length === 1) {
        map.setView(valid[0]!, 10, { animate: false });
        return;
      }
      map.fitBounds(L.latLngBounds(valid), { padding: [48, 48], animate: false });
    });
  }, [map, positions, fitKey]);
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
  const valid = positions.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  if (valid.length === 0) {
    return { lat: DEFAULT_CENTER[0], lon: DEFAULT_CENTER[1], zoom: 5 };
  }
  if (valid.length === 1) {
    return { lat: valid[0]![0], lon: valid[0]![1], zoom: 10 };
  }
  const center = L.latLngBounds(valid).getCenter();
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
  const safe = label.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:10px;height:10px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45)"></div>
      <span style="font:700 9px/1 ui-monospace,monospace;color:#fff;background:rgba(2,6,23,.88);padding:2px 5px;border-radius:4px">${safe}</span>
    </div>`,
    iconSize: [72, 28],
    iconAnchor: [36, 7],
  });
}

function normalizeCssAngle(deg: number): number {
  let a = ((deg + 180) % 360) - 180;
  if (a <= -180) a += 360;
  return a;
}

/**
 * Rumo geográfico → ângulo CSS (0° = leste).
 * `reverse` = texto espelhado para ficar legível sem inverter o sentido da seta.
 */
function legLabelPresentation(bearingDeg: number): { css: number; reverse: boolean } {
  let css = normalizeCssAngle(bearingDeg - 90);
  let reverse = false;
  if (css > 90 || css < -90) {
    css = normalizeCssAngle(css + 180);
    reverse = true;
  }
  return { css, reverse };
}

function legBubbleIcon(text: string, bearingDeg: number, scale = 1) {
  const safe = text.replace(/[<>&"]/g, "");
  const { css: rot, reverse } = legLabelPresentation(bearingDeg);
  const s = Math.max(0.7, Math.min(1.4, scale));
  const fontPx = Math.max(11, Math.round(14 * s));
  const padY = Math.max(2, Math.round(4 * s));
  const padX = Math.max(5, Math.round(9 * s));
  const tipOuter = Math.max(7, Math.round(10 * s));
  const tipInner = Math.max(6, Math.round(8.5 * s));
  const tipBorder = Math.max(8, Math.round(11 * s));
  const tipFill = Math.max(7, Math.round(9.5 * s));
  // Ponta aponta no sentido da proa; se o texto foi espelhado, a ponta vai à esquerda.
  const tipHtml = reverse
    ? `<span style="display:block;width:0;height:0;border-top:${tipOuter}px solid transparent;border-bottom:${tipOuter}px solid transparent;border-right:${tipBorder}px solid #0a0a0a;position:relative;margin-right:-0.5px">
        <span style="position:absolute;top:-${tipInner}px;right:-${tipBorder}px;width:0;height:0;border-top:${tipInner}px solid transparent;border-bottom:${tipInner}px solid transparent;border-right:${tipFill}px solid #0f766e"></span>
      </span>
      <span style="display:inline-block;white-space:nowrap;font:700 ${fontPx}px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#0f766e;padding:${padY}px ${padX}px;border:1.5px solid #0a0a0a;border-left:none;border-radius:0 4px 4px 0;letter-spacing:0.02em">${safe}</span>`
    : `<span style="display:inline-block;white-space:nowrap;font:700 ${fontPx}px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#0f766e;padding:${padY}px ${padX}px;border:1.5px solid #0a0a0a;border-right:none;border-radius:4px 0 0 4px;letter-spacing:0.02em">${safe}</span>
      <span style="display:block;width:0;height:0;border-top:${tipOuter}px solid transparent;border-bottom:${tipOuter}px solid transparent;border-left:${tipBorder}px solid #0a0a0a;position:relative;margin-left:-0.5px">
        <span style="position:absolute;top:-${tipInner}px;left:-${tipBorder}px;width:0;height:0;border-top:${tipInner}px solid transparent;border-bottom:${tipInner}px solid transparent;border-left:${tipFill}px solid #0f766e"></span>
      </span>`;
  const html = `<div class="leg-bubble" style="transform:translate(-50%,-50%) rotate(${rot}deg) scale(${s});transform-origin:center center;display:inline-flex;align-items:center;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">${tipHtml}</div>`;
  return L.divIcon({
    className: "leg-bubble-icon",
    html,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function legBubbleScaleForZoom(zoom: number): number {
  // z11 ≈ tamanho base; um pouco maior que o original, sem explodir no zoom.
  return Math.max(0.75, Math.min(1.35, Math.pow(2, (zoom - 11) * 0.35)));
}

function legBubbleMinNmForZoom(zoom: number): number {
  // Zoom longe: some as legendas (e esconde tudo abaixo de z7).
  if (zoom < 7) return Number.POSITIVE_INFINITY;
  if (zoom >= 12) return 1.5;
  if (zoom >= 10) return 5;
  if (zoom >= 8) return 14;
  return 28;
}

/** Material "location_searching" — círculo com mira nos 4 eixos. */
function aerodromeLocationSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.55))">
    <path fill="#a78bfa" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
  </svg>`;
}

function aerodromeIcon(icao: string, showLabel: boolean) {
  const safe = icao.replace(/[<>&"]/g, "");
  if (!showLabel) {
    return L.divIcon({
      className: "",
      html: `<div style="cursor:pointer;line-height:0">${aerodromeLocationSvg(18)}</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;line-height:0">
      ${aerodromeLocationSvg(20)}
      <span style="margin-top:1px;font:700 8px/1 ui-monospace,monospace;color:#ede9fe;background:rgba(15,23,42,.8);padding:1px 3px;border-radius:3px">${safe}</span>
    </div>`,
    iconSize: [56, 32],
    iconAnchor: [28, 10],
  });
}

function metarRuleLabel(rule: MetarFlightRule): string {
  if (rule === "ifr") return "IFR";
  if (rule === "mvfr") return "MVFR";
  if (rule === "vfr") return "VFR";
  return "METAR";
}

function metarDotSizeForZoom(zoom: number): number {
  if (zoom < 5.5) return 6;
  if (zoom < 6.5) return 8;
  if (zoom < 7.5) return 10;
  return 12;
}

function metarDotIcon(icao: string, rule: MetarFlightRule, showLabel: boolean, zoom: number) {
  const safe = icao.replace(/[<>&"]/g, "");
  const color = metarFlightRuleColor(rule);
  const dot = metarDotSizeForZoom(zoom);
  const halo = Math.max(2, Math.round(dot / 3));
  const iconSide = dot + halo * 2 + 2;
  const label = showLabel
    ? `<span style="margin-top:2px;font:800 8px/1 ui-monospace,monospace;color:#f8fafc;background:rgba(15,23,42,.86);padding:1px 3px;border-radius:3px">${safe}</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div title="${safe} ${metarRuleLabel(rule)}" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;line-height:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">
      <span style="display:block;width:${dot}px;height:${dot}px;border-radius:9999px;background:${color};box-shadow:0 0 0 1.5px rgba(15,23,42,.85),0 0 0 ${halo}px ${color}30"></span>
      ${label}
    </div>`,
    iconSize: showLabel ? [58, 28] : [iconSide, iconSide],
    iconAnchor: showLabel ? [29, dot / 2] : [iconSide / 2, iconSide / 2],
  });
}

function formatMetarTooltipTime(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{6}Z$/i.test(value)) return value.toUpperCase();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(11, 16)}Z`;
}

function MetarHoverCard({
  icao,
  met,
  rule,
}: {
  icao: string;
  met: AiswebMetarTaf;
  rule: MetarFlightRule;
}) {
  const observed = formatMetarTooltipTime(met.parsed?.observedAt);
  return (
    <div className="w-[min(84vw,25rem)] rounded-2xl border border-slate-500/50 bg-slate-950/85 p-3 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[15px] font-bold tracking-widest text-cyan-200">{icao}</p>
          {observed ? <p className="text-[11px] font-medium text-slate-400">{observed}</p> : null}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: metarFlightRuleColor(rule) }}
        >
          {metarRuleLabel(rule)}
        </span>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">METAR</p>
          <p className="mt-1 whitespace-normal break-words font-mono text-[13px] leading-relaxed text-slate-100">
            {met.metar?.trim() || "-"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TAF</p>
          <p className="mt-1 whitespace-normal break-words font-mono text-[13px] leading-relaxed text-slate-200">
            {met.taf?.trim() || "-"}
          </p>
        </div>
      </div>
    </div>
  );
}

function SoftScrollZoom() {
  const map = useMap();
  useEffect(() => {
    // Zoom contínuo mais leve: menos snaps fracionários = menos troca de tiles.
    map.options.wheelPxPerZoomLevel = 90;
    map.options.zoomSnap = 0;
    map.options.zoomDelta = 0.65;
    const scroll = map.scrollWheelZoom as L.Handler & { _delta?: number };
    if (scroll && typeof scroll.enable === "function") {
      scroll.disable();
      scroll.enable();
    }
  }, [map]);
  return null;
}

function reaFixIcon(name: string, showLabel: boolean) {
  const safe = name.replace(/[<>&"]/g, "");
  const tri = `<svg width="12" height="11" viewBox="0 0 12 11" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 1.2 L10.8 10 H1.2 Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>`;
  if (!showLabel) {
    return L.divIcon({
      className: "",
      html: `<div style="cursor:pointer;line-height:0">${tri}</div>`,
      iconSize: [12, 11],
      iconAnchor: [6, 8],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;line-height:0">
      ${tri}
      <span style="margin-top:2px;font:700 8px/1 ui-sans-serif,system-ui;color:#111;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safe}</span>
    </div>`,
    iconSize: [90, 28],
    iconAnchor: [45, 8],
  });
}

function MapClickHandler({
  enabled,
  onMapClick,
  onBlankClick,
  suppressUntilRef,
}: {
  enabled: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  /** Sempre (ex.: limpar seleção de espaço aéreo). */
  onBlankClick?: () => void;
  suppressUntilRef?: MutableRefObject<number>;
}) {
  useMapEvents({
    popupclose() {
      if (suppressUntilRef) suppressUntilRef.current = Date.now() + 450;
    },
    click(e) {
      // Espaço aéreo trata seleção no preclick e marca o evento.
      if ((e.originalEvent as { _airspaceEdge?: boolean } | undefined)?._airspaceEdge) {
        return;
      }
      onBlankClick?.();
      if (!enabled || !onMapClick) return;
      if (suppressUntilRef && Date.now() < suppressUntilRef.current) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const PLAN_POPUP = {
  autoPan: false,
  keepInView: false,
  autoClose: true,
  closeOnClick: true,
  closeOnEscapeKey: true,
} as const;

function AerodromePlanningPopup({
  icao,
  fallbackName,
  lat,
  lng,
  city,
  uf,
  altitude,
  operation,
  onPick,
  onOpenDetails,
}: {
  icao: string;
  fallbackName?: string;
  lat: number;
  lng: number;
  city?: string;
  uf?: string;
  altitude?: string;
  operation?: string;
  onPick?: (candidate: MapPickCandidate) => void;
  onOpenDetails?: (bundle: AiswebAirportBundle) => void;
}) {
  return (
    <Popup maxWidth={320} minWidth={280} {...PLAN_POPUP}>
      <AerodromeMapPopupContent
        icao={icao}
        fallbackName={fallbackName}
        onOpenDetails={onOpenDetails}
        onAddToRoute={
          onPick
            ? () =>
                onPick({
                  lat,
                  lng,
                  label: icao,
                  kind: "airport",
                  name: fallbackName,
                  city,
                  uf,
                  icao,
                  altitude,
                  operation,
                })
            : undefined
        }
      />
    </Popup>
  );
}

function PendingPickPopup({
  pick,
  onConfirm,
  onClose,
}: {
  pick: MapPickCandidate;
  onConfirm: (candidate: MapPickCandidate) => void;
  onClose: () => void;
}) {
  return (
    <Popup
      position={[pick.lat, pick.lng]}
      {...PLAN_POPUP}
      eventHandlers={{
        remove: () => onClose(),
      }}
    >
      <div className="min-w-[180px] space-y-2 text-slate-900">
        <div>
          {pick.kind === "airport" ? (
            <>
              <p className="text-sm font-bold leading-tight">{pick.name || pick.icao || pick.label}</p>
              {[pick.city, pick.uf].filter(Boolean).length ? (
                <p className="text-xs text-slate-600">{[pick.city, pick.uf].filter(Boolean).join(", ")}</p>
              ) : null}
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">{pick.icao || pick.label}</p>
              {pick.altitude ? (
                <p className="text-[11px] text-slate-600">Elevação: {pick.altitude}</p>
              ) : null}
              {pick.operation ? (
                <p className="text-[11px] text-slate-600">Operação: {pick.operation}</p>
              ) : null}
            </>
          ) : pick.kind === "rea" ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">REA / REH</p>
              <p className="text-sm font-bold leading-tight">{pick.label}</p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ponto</p>
              <p className="font-mono text-sm font-semibold">{pick.label}</p>
            </>
          )}
        </div>
        <button
          type="button"
          className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-left text-xs font-semibold text-white hover:bg-emerald-500"
          onClick={() => {
            onConfirm(pick);
            onClose();
          }}
        >
          + Adicionar à rota
        </button>
      </div>
    </Popup>
  );
}

function MeasureTool({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const [points, setPoints] = useState<[number, number][]>([]);
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    return () => {
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      groupRef.current?.clearLayers();
    }
  }, [enabled]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    if (points.length === 0) return;
    for (const [lat, lng] of points) {
      L.circleMarker([lat, lng], {
        radius: 5,
        color: "#fff",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 1,
      }).addTo(group);
    }
    if (points.length >= 2) {
      L.polyline(points, { color: "#f59e0b", weight: 3, dashArray: "6 4", opacity: 0.95 }).addTo(group);
      let totalM = 0;
      for (let i = 1; i < points.length; i++) {
        totalM += haversineM(
          { lat: points[i - 1]![0], lng: points[i - 1]![1] },
          { lat: points[i]![0], lng: points[i]![1] },
        );
      }
      const last = points[points.length - 1]!;
      const nm = totalM / 1852;
      const km = totalM / 1000;
      L.marker(last, {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#0f172a;color:#fbbf24;border:1px solid #f59e0b;border-radius:6px;padding:2px 6px;font:700 11px/1.2 ui-monospace,monospace;white-space:nowrap">${nm.toFixed(1)} nm · ${km.toFixed(1)} km</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 18],
        }),
        interactive: false,
      }).addTo(group);
    }
  }, [points]);

  useMapEvents({
    click(e) {
      if (!enabled) return;
      L.DomEvent.stopPropagation(e);
      setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    },
  });

  return null;
}

function VisibleAerodromes({
  aerodromes,
  show,
  filter,
  onPick,
  onOpenDetails,
  onSuppressMapPick,
  hideIcaos,
  hideLabelIcaos,
  onLoadingChange,
}: {
  aerodromes: Aerodrome[];
  show: boolean;
  filter: AerodromeMapFilter;
  onPick?: (candidate: MapPickCandidate) => void;
  onOpenDetails?: (bundle: AiswebAirportBundle) => void;
  /** Evita abrir "novo ponto" no mesmo clique que fecha o popup. */
  onSuppressMapPick?: () => void;
  /** ICAOs já na rota — não desenha label/ícone de fundo (evita sobreposição). */
  hideIcaos?: Set<string>;
  hideLabelIcaos?: Set<string>;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [enrichTick, setEnrichTick] = useState(0);
  const boundsTimer = useRef<number | null>(null);

  useMapEvents({
    movestart: () => {
      onLoadingChange?.(true);
    },
    zoomstart: () => {
      onLoadingChange?.(true);
    },
    moveend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
        onLoadingChange?.(false);
      }, 150);
    },
    zoomend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
        onLoadingChange?.(false);
      }, 150);
    },
  });

  useEffect(() => {
    return () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      onLoadingChange?.(false);
    };
  }, [onLoadingChange]);

  const needsOpsEnrichment = filter.nightOpsOnly || filter.avgasOnly || filter.jetOnly;

  // Candidatos geográficos SEM filtro de combustível/noturna — senão ADs
  // com flag desconhecida nunca entram em `visible` e nunca são enriquecidos (ex.: SBMG).
  const geoCandidates = useMemo(() => {
    if (!show || zoom < 7 || !needsOpsEnrichment) return [] as Aerodrome[];
    const baseFilter: AerodromeMapFilter = {
      ...filter,
      avgasOnly: false,
      jetOnly: false,
      nightOpsOnly: false,
    };
    const base = filterAerodromesForMap(aerodromes, baseFilter);
    const pad = 0.15;
    const south = bounds.getSouth() - pad;
    const north = bounds.getNorth() + pad;
    const west = bounds.getWest() - pad;
    const east = bounds.getEast() + pad;
    const max = zoom >= 10 ? 800 : zoom >= 8 ? 350 : 120;
    const out: Aerodrome[] = [];
    for (const ad of base) {
      const lat = ad.latitudeGeoPoint;
      const lng = ad.longitudeGeoPoint;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < south || lat > north || lng < west || lng > east) continue;
      out.push(ad);
      if (out.length > max) return [];
    }
    return out;
  }, [aerodromes, bounds, filter, needsOpsEnrichment, show, zoom]);

  const filtered = useMemo(
    () => filterAerodromesForMap(aerodromes, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aerodromes, filter, enrichTick],
  );

  const showLabels = zoom >= 9;
  const visible = useMemo(() => {
    if (!show || zoom < 7) return [];
    const pad = 0.15;
    const south = bounds.getSouth() - pad;
    const north = bounds.getNorth() + pad;
    const west = bounds.getWest() - pad;
    const east = bounds.getEast() + pad;
    const max = zoom >= 10 ? 800 : zoom >= 8 ? 350 : 120;
    const out: Aerodrome[] = [];
    for (const ad of filtered) {
      const lat = ad.latitudeGeoPoint;
      const lng = ad.longitudeGeoPoint;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < south || lat > north || lng < west || lng > east) continue;
      out.push(ad);
      if (out.length > max) return [];
    }
    return out;
  }, [filtered, bounds, show, zoom]);

  useEffect(() => {
    if (!needsOpsEnrichment || !geoCandidates.length) return;
    let cancelled = false;
    const icaos = geoCandidates.map((ad) => ad.icao).filter((c) => /^[A-Z0-9]{4}$/.test(c));
    void import("../lib/aerodromeOpsEnrichment").then(({ enrichAerodromeOpsBatch }) =>
      enrichAerodromeOpsBatch(icaos, {
        concurrency: 3,
        onProgress: () => {
          if (!cancelled) setEnrichTick((n) => n + 1);
        },
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [needsOpsEnrichment, geoCandidates]);

  if (!show) return null;

  return (
    <>
      {visible.map((ad) => {
        const lat = ad.latitudeGeoPoint!;
        const lng = ad.longitudeGeoPoint!;
        const code = ad.icao || ad.ciad || "?";
        const codeUpper = code.toUpperCase();
        // AD já está na rota: o waypoint da rota já carrega a label — ocultar o de fundo.
        if (hideIcaos?.has(codeUpper)) return null;
        return (
          <Marker
            key={ad.id}
            position={[lat, lng]}
            icon={aerodromeIcon(code, showLabels && !hideLabelIcaos?.has(codeUpper))}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
              },
              popupclose: () => {
                onSuppressMapPick?.();
              },
            }}
          >
            {/^[A-Z0-9]{4}$/.test(code) ? (
              <AerodromePlanningPopup
                icao={code}
                fallbackName={ad.name}
                lat={lat}
                lng={lng}
                city={ad.municipality}
                uf={ad.uf}
                altitude={ad.altitudeText || undefined}
                operation={ad.operation || undefined}
                onPick={onPick}
                onOpenDetails={onOpenDetails}
              />
            ) : (
              <Popup {...PLAN_POPUP}>
                <div className="text-xs text-slate-800">
                  <p className="font-semibold">{ad.name || code}</p>
                  <p className="font-mono text-[11px]">{code}</p>
                </div>
              </Popup>
            )}
          </Marker>
        );
      })}
    </>
  );
}

function VisibleMetarAerodromes({
  aerodromes,
  show,
  filter,
  priorityIcaos,
  onVisibleMetarIcaosChange,
  onLoadingChange,
  onPick,
  onOpenDetails,
  onSuppressMapPick,
}: {
  aerodromes: Aerodrome[];
  show: boolean;
  filter: AerodromeMapFilter;
  priorityIcaos?: Set<string>;
  onVisibleMetarIcaosChange?: (icaos: Set<string>) => void;
  onLoadingChange?: (loading: boolean) => void;
  onPick?: (candidate: MapPickCandidate) => void;
  onOpenDetails?: (bundle: AiswebAirportBundle) => void;
  onSuppressMapPick?: () => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [mets, setMets] = useState<AiswebMetarTaf[]>([]);
  const boundsTimer = useRef<number | null>(null);

  useMapEvents({
    moveend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
      }, 250);
    },
    zoomend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
      }, 250);
    },
  });

  useEffect(() => {
    return () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
    };
  }, []);

  const visibleAerodromes = useMemo(() => {
    if (!show || zoom < 5) return [] as Aerodrome[];
    const filtered = filterAerodromesForMap(aerodromes, filter);
    const pad = 0.12;
    const south = bounds.getSouth() - pad;
    const north = bounds.getNorth() + pad;
    const west = bounds.getWest() - pad;
    const east = bounds.getEast() + pad;
    const out: Aerodrome[] = [];
    for (const ad of filtered) {
      const lat = ad.latitudeGeoPoint;
      const lng = ad.longitudeGeoPoint;
      const code = String(ad.icao || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) continue;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < south || lat > north || lng < west || lng > east) continue;
      out.push(ad);
      if (out.length > METAR_MARKER_MAX_ICAOS) return [];
    }
    out.sort((a, b) => {
      const ac = String(a.icao || "").trim().toUpperCase();
      const bc = String(b.icao || "").trim().toUpperCase();
      const ap = priorityIcaos?.has(ac) ? 0 : 1;
      const bp = priorityIcaos?.has(bc) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return ac.localeCompare(bc);
    });
    return out;
  }, [aerodromes, bounds, filter, priorityIcaos, show, zoom]);

  const visibleIcaos = useMemo(
    () =>
      visibleAerodromes
        .map((ad) => String(ad.icao || "").trim().toUpperCase())
        .filter((code) => /^[A-Z0-9]{4}$/.test(code)),
    [visibleAerodromes],
  );
  const icaoKey = visibleIcaos.join("|");

  useEffect(() => {
    if (!show || !icaoKey) {
      setMets([]);
      onLoadingChange?.(false);
      return;
    }
    let cancelled = false;
    const cached = visibleIcaos
      .map((icao) => METAR_MARKER_CACHE.get(icao))
      .filter((met): met is AiswebMetarTaf => Boolean(met));
    const missing = visibleIcaos.filter((icao) => !METAR_MARKER_CACHE.has(icao));
    if (!missing.length) {
      setMets(cached);
      onLoadingChange?.(false);
      return;
    }
    onLoadingChange?.(true);
    setMets([]);
    const timer = window.setTimeout(() => {
      const chunks: string[][] = [];
      for (let i = 0; i < missing.length; i += METAR_MARKER_BATCH_SIZE) {
        chunks.push(missing.slice(i, i + METAR_MARKER_BATCH_SIZE));
      }
      void Promise.all(chunks.map((chunk) => fetchAiswebMetBatch(chunk)))
        .then((list) => {
          for (const met of list.flat()) {
            const code = String(met.icao || "").trim().toUpperCase();
            if (/^[A-Z0-9]{4}$/.test(code)) METAR_MARKER_CACHE.set(code, met);
          }
          if (!cancelled) {
            setMets(
              visibleIcaos
                .map((icao) => METAR_MARKER_CACHE.get(icao))
                .filter((met): met is AiswebMetarTaf => Boolean(met)),
            );
          }
        })
        .catch(() => {
          if (!cancelled) setMets([]);
        })
        .finally(() => {
          if (!cancelled) onLoadingChange?.(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      onLoadingChange?.(false);
      window.clearTimeout(timer);
    };
  }, [icaoKey, onLoadingChange, show, visibleIcaos]);

  const metarByIcao = useMemo(() => {
    const mapByIcao = new Map<string, { met: AiswebMetarTaf; rule: MetarFlightRule }>();
    for (const met of mets) {
      const parsed = met.parsed || parseMetar(met.metar);
      if (!isValidMetar(met, parsed)) continue;
      mapByIcao.set(String(met.icao || "").trim().toUpperCase(), {
        met: parsed === met.parsed ? met : { ...met, parsed },
        rule: metarFlightRule(parsed),
      });
    }
    return mapByIcao;
  }, [mets]);

  useEffect(() => {
    if (!show || !metarByIcao.size) {
      onVisibleMetarIcaosChange?.(new Set());
      return;
    }
    onVisibleMetarIcaosChange?.(new Set(metarByIcao.keys()));
    return () => onVisibleMetarIcaosChange?.(new Set());
  }, [metarByIcao, onVisibleMetarIcaosChange, show]);

  if (!show || !metarByIcao.size) return null;

  const showLabels = zoom >= 9;
  return (
    <>
      {visibleAerodromes.map((ad) => {
        const code = String(ad.icao || "").trim().toUpperCase();
        const entry = metarByIcao.get(code);
        if (!entry || ad.latitudeGeoPoint == null || ad.longitudeGeoPoint == null) return null;
        const lat = ad.latitudeGeoPoint;
        const lng = ad.longitudeGeoPoint;
        return (
          <Marker
            key={`metar-${code}`}
            position={[lat, lng]}
            icon={metarDotIcon(code, entry.rule, showLabels, zoom)}
            zIndexOffset={900}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                e.target.closeTooltip();
              },
              popupopen: (e) => {
                e.target.closeTooltip();
              },
              popupclose: () => {
                onSuppressMapPick?.();
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -10]}
              opacity={1}
              sticky={false}
              interactive={false}
              className="metar-hover-tooltip"
            >
              <MetarHoverCard icao={code} met={entry.met} rule={entry.rule} />
            </Tooltip>
            <AerodromePlanningPopup
              icao={code}
              fallbackName={ad.name}
              lat={lat}
              lng={lng}
              city={ad.municipality}
              uf={ad.uf}
              altitude={ad.altitudeText || undefined}
              operation={ad.operation || undefined}
              onPick={onPick}
              onOpenDetails={onOpenDetails}
            />
          </Marker>
        );
      })}
    </>
  );
}

function VisibleReaFixes({
  fixes,
  show,
  onPick,
}: {
  fixes: Array<{ lat: number; lon: number; name: string }>;
  show: boolean;
  onPick?: (candidate: MapPickCandidate) => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  const boundsTimer = useRef<number | null>(null);

  useMapEvents({
    moveend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
      }, 150);
    },
    zoomend: () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
      boundsTimer.current = window.setTimeout(() => {
        boundsTimer.current = null;
        setBounds(map.getBounds());
        setZoom(map.getZoom());
      }, 150);
    },
  });

  useEffect(() => {
    return () => {
      if (boundsTimer.current != null) window.clearTimeout(boundsTimer.current);
    };
  }, []);

  const showLabels = zoom >= 10;
  const visible = useMemo(() => {
    if (!show || zoom < 9 || !onPick) return [];
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const out: Array<{ lat: number; lon: number; name: string }> = [];
    const seen = new Set<string>();
    const max = zoom >= 12 ? 80 : zoom >= 10 ? 50 : 30;
    for (const fix of fixes) {
      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || !fix.name?.trim()) continue;
      if (fix.lat < south || fix.lat > north || fix.lon < west || fix.lon > east) continue;
      const key = `${fix.name}|${fix.lat.toFixed(4)}|${fix.lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fix);
      if (out.length >= max) break;
    }
    return out;
  }, [bounds, fixes, onPick, show, zoom]);

  if (!show || !onPick) return null;

  return (
    <>
      {visible.map((fix) => {
        const name = fix.name.trim().toUpperCase();
        return (
          <Marker
            key={`${name}-${fix.lat}-${fix.lon}`}
            position={[fix.lat, fix.lon]}
            icon={reaFixIcon(name, showLabels)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
              },
            }}
          >
            <Popup {...PLAN_POPUP}>
              <div className="min-w-[160px] space-y-2 text-slate-900">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">REA / REH</p>
                  <p className="text-sm font-bold leading-tight">{name}</p>
                </div>
                <button
                  type="button"
                  className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-left text-xs font-semibold text-white hover:bg-emerald-500"
                  onClick={() =>
                    onPick({
                      lat: fix.lat,
                      lng: fix.lon,
                      label: name,
                      kind: "rea",
                      name,
                    })
                  }
                >
                  + Adicionar à rota
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

type FlightPlanMapProps = {
  waypoints: FlightPlanWaypoint[];
  originLabel?: string | null;
  destLabel?: string | null;
  className?: string;
  /** Interactive route building (click map / aerodromes). */
  interactive?: boolean;
  pickMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onPickPoint?: (
    candidate: MapPickCandidate,
    opts?: { insertIndex?: number; confirmBetween?: boolean },
  ) => void;
  /** @deprecated use onPickPoint */
  onPickAerodrome?: (
    candidate: MapPickCandidate,
    opts?: { insertIndex?: number; confirmBetween?: boolean },
  ) => void;
  aerodromes?: Aerodrome[];
  aerodromeFilter?: AerodromeMapFilter;
  onAerodromeFilterChange?: (filter: AerodromeMapFilter) => void;
  reaFixes?: Array<{ lat: number; lon: number; name: string }>;
  rehFixes?: Array<{ lat: number; lon: number; name: string }>;
  showAerodromes?: boolean;
  cruiseSpeedKt?: number | null;
  showLegBubbles?: boolean;
  /** Change to trigger a one-shot fitBounds (e.g. after load/import). */
  fitKey?: string | number | null;
  mapHeightClass?: string;
  /** Conteúdo flutuante sobre a área do mapa (ex.: coluna de planejamento). */
  mapOverlay?: ReactNode;
  /** Largura máxima da coluna flutuante esquerda. */
  mapOverlayMaxWidthClass?: string;
  /** TOC / TOD markers along the route. */
  phaseMarkers?: Array<{ lat: number; lng: number; label: string }>;
  /** Controlado pelo painel de planejamento. */
  measureMode?: boolean;
  onMeasureModeChange?: (on: boolean) => void;
  onWaypointRemove?: (index: number) => void;
  onAerodromeDetails?: (bundle: AiswebAirportBundle) => void;
  customAreas?: SavedRouteArea[];
  onCustomAreasChange?: (areas: SavedRouteArea[]) => void;
  routeNotams?: RouteNotamHit[];
  showRouteNotamsOnMap?: boolean;
  onShowRouteNotamsOnMapChange?: (on: boolean) => void;
  filterNotamsByVerticalProfile?: boolean;
  onFilterNotamsByVerticalProfileChange?: (on: boolean) => void;
  onSnapToVisualCorridors?: () => void;
  corridorSnapEnabled?: boolean;
};

type MapToolPanel = "filters" | "basemap" | "windy" | "layers" | "areas" | "notams" | null;

/**
 * Arrasta um trecho da rota até um AD/REA: ao soltar perto de um ponto,
 * propõe inserção entre os extremos daquele trecho.
 */
function RouteDragToInsert({
  positions,
  waypoints,
  aerodromes,
  reaFixes,
  rehFixes,
  enabled,
  onPropose,
}: {
  positions: [number, number][];
  waypoints: FlightPlanWaypoint[];
  aerodromes: Aerodrome[];
  reaFixes: Array<{ lat: number; lon: number; name: string }>;
  rehFixes: Array<{ lat: number; lon: number; name: string }>;
  enabled: boolean;
  onPropose: (candidate: MapPickCandidate, insertIndex: number) => void;
}) {
  const map = useMap();
  const dragRef = useRef<{
    legIndex: number;
    from: [number, number];
    to: [number, number];
    moved: boolean;
  } | null>(null);
  const previewRef = useRef<L.Polyline | null>(null);
  const cursorRef = useRef<L.CircleMarker | null>(null);

  const clearPreview = useCallback(() => {
    previewRef.current?.remove();
    previewRef.current = null;
    cursorRef.current?.remove();
    cursorRef.current = null;
  }, []);

  const findSnapCandidate = useCallback(
    (lat: number, lng: number, maxM: number): MapPickCandidate | null => {
      let best: MapPickCandidate | null = null;
      let bestDist = maxM;
      for (const ad of aerodromes) {
        const alat = ad.latitudeGeoPoint;
        const alng = ad.longitudeGeoPoint;
        if (alat == null || alng == null) continue;
        const d = haversineM({ lat, lng }, { lat: alat, lng: alng });
        if (d < bestDist) {
          bestDist = d;
          best = {
            lat: alat,
            lng: alng,
            label: ad.icao,
            kind: "airport",
            icao: ad.icao,
            name: ad.name || ad.icao,
          };
        }
      }
      for (const fix of [...reaFixes, ...rehFixes]) {
        if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || !fix.name?.trim()) continue;
        const d = haversineM({ lat, lng }, { lat: fix.lat, lng: fix.lon });
        if (d < bestDist) {
          bestDist = d;
          const name = fix.name.trim().toUpperCase();
          best = { lat: fix.lat, lng: fix.lon, label: name, kind: "rea", name };
        }
      }
      return best;
    },
    [aerodromes, reaFixes, rehFixes],
  );

  useEffect(() => {
    if (!enabled || positions.length < 2) return;

    const finish = (latlng: L.LatLng) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      map.dragging.enable();
      const didMove = drag.moved;
      clearPreview();
      if (!didMove) return;

      const zoom = map.getZoom();
      const snapM = zoom >= 11 ? 1852 * 3.5 : zoom >= 9 ? 1852 * 6 : 1852 * 10;
      const cand = findSnapCandidate(latlng.lat, latlng.lng, snapM);
      if (!cand) return;
      if (waypoints.some((w) => haversineM(w, cand) < 1852 * 0.4)) return;
      onPropose(cand, drag.legIndex + 1);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        drag.moved = true;
        map.dragging.disable();
        clearPreview();
        previewRef.current = L.polyline([drag.from, [e.latlng.lat, e.latlng.lng], drag.to], {
          color: "#14b8a6",
          weight: 3,
          dashArray: "6 6",
          opacity: 0.9,
          interactive: false,
        }).addTo(map);
        cursorRef.current = L.circleMarker(e.latlng, {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: "#14b8a6",
          fillOpacity: 1,
          interactive: false,
        }).addTo(map);
      } else {
        previewRef.current?.setLatLngs([drag.from, [e.latlng.lat, e.latlng.lng], drag.to]);
        cursorRef.current?.setLatLng(e.latlng);
      }
    };

    const onDocMouseUp = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const latlng = map.mouseEventToLatLng(ev);
      finish(latlng);
    };

    map.on("mousemove", onMouseMove);
    document.addEventListener("mouseup", onDocMouseUp);
    return () => {
      map.off("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onDocMouseUp);
      map.dragging.enable();
      clearPreview();
      dragRef.current = null;
    };
  }, [clearPreview, enabled, findSnapCandidate, map, onPropose, positions.length, waypoints]);

  if (!enabled || positions.length < 2) return null;

  return (
    <Polyline
      positions={positions}
      pathOptions={{ color: "#0f766e", weight: 18, opacity: 0, interactive: true }}
      pane="overlayPane"
      eventHandlers={{
        mousedown: (e) => {
          if ((e.originalEvent as MouseEvent).button !== 0) return;
          const legIndex = nearestRouteLegIndex(waypoints, e.latlng, 1852 * 25);
          if (legIndex < 0) return;
          const a = waypoints[legIndex]!;
          const b = waypoints[legIndex + 1]!;
          dragRef.current = {
            legIndex,
            from: [a.lat, a.lng],
            to: [b.lat, b.lng],
            moved: false,
          };
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);
        },
      }}
    />
  );
}

function LegBubbles({
  legs,
}: {
  legs: ReturnType<typeof buildFlightPlanLegs>;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoom() {
      setZoom(map.getZoom());
    },
    zoomend() {
      setZoom(map.getZoom());
    },
  });

  const scale = legBubbleScaleForZoom(zoom);
  const minNm = legBubbleMinNmForZoom(zoom);
  if (!Number.isFinite(minNm)) return null;

  return (
    <>
      {legs.map((leg) => {
        if (leg.distanceNm < minNm) return null;
        const midLat = (leg.from.lat + leg.to.lat) / 2;
        const midLng = (leg.from.lng + leg.to.lng) / 2;
        const text = `${formatBearingDeg(leg.bearingDeg)} ${Math.round(leg.distanceNm)}nm`;
        return (
          <Marker
            key={`leg-${leg.toIndex}-${fontKey(scale)}`}
            position={[midLat, midLng]}
            icon={legBubbleIcon(text, leg.bearingDeg, scale)}
            interactive={false}
            zIndexOffset={800}
          />
        );
      })}
    </>
  );
}

function fontKey(scale: number): string {
  return String(Math.round(scale * 20));
}

function MapToolIconFilter({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
    </svg>
  );
}

function MapToolIconMap({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
    </svg>
  );
}

function MapToolIconCloud({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  );
}

function MapToolIconAirspace({ className = "h-5 w-5" }: { className?: string }) {
  // Ícone "select" — moldura pontilhada (espaços aéreos).
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
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

function MapToolIconArea({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M3 5v14h18V5H3zm16 12H5V7h14v10z" />
      <path d="M7 9h4v2H7zm6 4h4v2h-4z" />
    </svg>
  );
}

function MapToolIconNotam({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 3.2 19.2 12 12 20.8 4.8 12 12 3.2zm0 4.4L8.2 12 12 16.4 15.8 12 12 7.6z" />
    </svg>
  );
}

function MapToolIconCorridor({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4 5h3v14H4V5zm13 0h3v14h-3V5zM9.8 7.1 11.2 5.7 19 13.5l-1.4 1.4-6.4-6.4-1.4 1.4-1.4-1.4 1.4-1.4zm0 6.5 1.4-1.4 5.4 5.4-1.4 1.4-4-4-2.2 2.2-1.4-1.4 2.2-2.2z" />
    </svg>
  );
}

const AREA_COLORS = ["#f472b6", "#f59e0b", "#34d399", "#818cf8", "#fb7185", "#22d3ee"];

function areaColor(index: number): string {
  return AREA_COLORS[index % AREA_COLORS.length]!;
}

function FitLatLngs({
  points,
  fitKey,
}: {
  points: Array<{ lat: number; lng: number }>;
  fitKey: string | null;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!fitKey || fitKey === lastKey.current || points.length < 2) return;
    lastKey.current = fitKey;
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48], animate: false, maxZoom: 11 },
    );
  }, [fitKey, map, points]);
  return null;
}

function CustomAreaPolygons({
  areas,
  preview,
  onRemove,
}: {
  areas: SavedRouteArea[];
  preview: Array<{ lat: number; lng: number }> | null;
  onRemove?: (id: string) => void;
}) {
  return (
    <>
      {areas.map((area, idx) => {
        const color = areaColor(idx);
        const positions = area.points.map((p) => [p.lat, p.lng] as [number, number]);
        return (
          <Polygon
            key={area.id}
            positions={positions}
            pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.18 }}
          >
            <Popup {...PLAN_POPUP}>
              <div className="min-w-[140px] space-y-1.5 text-slate-900">
                <p className="text-sm font-semibold">{area.name}</p>
                <p className="text-[10px] text-slate-500">{area.points.length} vértices</p>
                {onRemove ? (
                  <button
                    type="button"
                    className="w-full rounded-md bg-rose-600 px-2 py-1 text-left text-[11px] font-semibold text-white hover:bg-rose-500"
                    onClick={() => onRemove(area.id)}
                  >
                    Remover área
                  </button>
                ) : null}
              </div>
            </Popup>
            <Tooltip direction="center" permanent={false}>
              {area.name}
            </Tooltip>
          </Polygon>
        );
      })}
      {preview && preview.length >= 3 ? (
        <Polygon
          positions={preview.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: "#e879f9", weight: 2, dashArray: "6 4", fillColor: "#e879f9", fillOpacity: 0.12 }}
        />
      ) : null}
    </>
  );
}

export function FlightPlanMap({
  waypoints,
  originLabel,
  destLabel,
  className = "",
  interactive = false,
  pickMode = false,
  onPickPoint,
  onPickAerodrome,
  aerodromes = [],
  aerodromeFilter = EMPTY_AERODROME_MAP_FILTER,
  onAerodromeFilterChange,
  reaFixes = [],
  rehFixes = [],
  showAerodromes = false,
  cruiseSpeedKt = null,
  showLegBubbles = true,
  fitKey = null,
  mapHeightClass = "h-[450px]",
  mapOverlay = null,
  mapOverlayMaxWidthClass = "w-[min(100%-1rem,22rem)]",
  phaseMarkers = [],
  measureMode: measureModeProp,
  onMeasureModeChange: _onMeasureModeChange,
  onWaypointRemove,
  onAerodromeDetails,
  customAreas = [],
  onCustomAreasChange,
  routeNotams = [],
  showRouteNotamsOnMap = true,
  onShowRouteNotamsOnMapChange,
  filterNotamsByVerticalProfile = true,
  onFilterNotamsByVerticalProfileChange,
  onSnapToVisualCorridors,
  corridorSnapEnabled = false,
}: FlightPlanMapProps) {
  const handlePick = onPickPoint || onPickAerodrome;
  const [pendingPick, setPendingPick] = useState<MapPickCandidate | null>(null);
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | undefined>(undefined);
  const [mapStyle, setMapStyle] = useState<MapStyle>(interactive ? "terrain" : "windy");
  const [windyOverlay, setWindyOverlay] = useState<WindyOverlayId>("clouds");
  const [windyPressure, setWindyPressure] = useState(false);
  const measureMode = measureModeProp ?? false;
  const [layersOn, setLayersOn] = useState<Record<PlanLayerId, boolean>>(() =>
    Object.fromEntries([
      ...AIRSPACE_TOGGLES.map((l) => [l.id, l.defaultOn]),
      ...REA_LAYER_TOGGLES_PLANNING.map((l) => [l.id, l.defaultOn]),
      ...FEATURE_LAYER_TOGGLES.map((l) => [l.id, l.id === "airports" ? showAerodromes : l.defaultOn]),
    ]) as Record<PlanLayerId, boolean>,
  );
  const [selectedAirspace, setSelectedAirspace] = useState<{
    info: AirspaceInfo;
    key: string;
  } | null>(null);
  const [selectedRouteNotams, setSelectedRouteNotams] = useState<{
    hits: RouteNotamHit[];
    activeId: string;
  } | null>(null);
  const [toolPanel, setToolPanel] = useState<MapToolPanel>(null);

  useEffect(() => {
    setSelectedRouteNotams((prev) => {
      if (!prev) return prev;
      const ids = new Set(routeNotams.map((hit) => hit.id));
      const hits = prev.hits.filter((hit) => ids.has(hit.id));
      if (!hits.length) return null;
      const activeId = ids.has(prev.activeId) ? prev.activeId : hits[0]!.id;
      if (hits.length === prev.hits.length && activeId === prev.activeId) return prev;
      return { hits, activeId };
    });
  }, [routeNotams]);

  const suppressMapPickUntil = useRef(0);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const [mapZoom, setMapZoom] = useState(5);
  const [chartManifest, setChartManifest] = useState<ChartTilesManifest | null>(null);
  const [visibleMetarIcaos, setVisibleMetarIcaos] = useState<Set<string>>(() => new Set());
  const [aerodromeLoading, setAerodromeLoading] = useState(false);
  const [metarLoading, setMetarLoading] = useState(false);
  const [areaDraftText, setAreaDraftText] = useState("");
  const [areaDraftName, setAreaDraftName] = useState("");
  const [areaPreview, setAreaPreview] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [areaFitKey, setAreaFitKey] = useState<string | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadChartTilesManifest().then((manifest) => {
      if (!cancelled) setChartManifest(manifest);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = mapShellRef.current;
    if (!el || !interactive) return;
    const blockScrollChain = (event: WheelEvent) => {
      event.stopPropagation();
    };
    el.addEventListener("wheel", blockScrollChain, { passive: true });
    return () => el.removeEventListener("wheel", blockScrollChain);
  }, [interactive]);

  const useXyzWac = xyzAvailableFor(chartManifest, "wac");
  const useXyzRea = xyzAvailableFor(chartManifest, "rea");
  const useXyzReh = xyzAvailableFor(chartManifest, "reh");
  const showChartOverlays = mapZoom >= CHART_OVERLAY_MIN_ZOOM;

  const adFilterActiveCount =
    (aerodromeFilter.minRunwayLengthM != null && aerodromeFilter.minRunwayLengthM > 0 ? 1 : 0) +
    (aerodromeFilter.pavedOnly ? 1 : 0) +
    (aerodromeFilter.nightOpsOnly ? 1 : 0) +
    (aerodromeFilter.publicOnly ? 1 : 0) +
    (aerodromeFilter.avgasOnly ? 1 : 0) +
    (aerodromeFilter.jetOnly ? 1 : 0);

  function toggleToolPanel(id: Exclude<MapToolPanel, null>) {
    setToolPanel((prev) => (prev === id ? null : id));
  }

  function patchFilter(patch: Partial<AerodromeMapFilter>) {
    onAerodromeFilterChange?.({ ...aerodromeFilter, ...patch });
  }

  const positions = useMemo(
    () =>
      waypoints
        .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng))
        .map((w) => [w.lat, w.lng] as [number, number]),
    [waypoints],
  );

  /** ICAOs dos ADs já na rota — oculta marcadores de fundo para não duplicar label. */
  const routeIcaos = useMemo(() => {
    const set = new Set<string>();
    for (const wp of waypoints) {
      const kind = wp.kind;
      if (kind === "fix" || kind === "rea") continue;
      const code = String(wp.label || "")
        .trim()
        .toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(code)) set.add(code);
    }
    return set;
  }, [waypoints]);

  const updateVisibleMetarIcaos = useCallback((next: Set<string>) => {
    setVisibleMetarIcaos((prev) => {
      if (prev.size === next.size && [...prev].every((icao) => next.has(icao))) return prev;
      return next;
    });
  }, []);

  const legs = useMemo(
    () =>
      showLegBubbles && positions.length >= 2
        ? buildFlightPlanLegs(waypoints, { cruiseSpeedKt })
        : [],
    [waypoints, cruiseSpeedKt, showLegBubbles, positions.length],
  );

  const isWindy = mapStyle === "windy";
  const isWac = mapStyle === "wac";
  const tilesBase =
    mapStyle === "terrain" || mapStyle === "satellite" || mapStyle === "roads"
      ? TILES[mapStyle]
      : null;
  const unlabeledStyle = mapStyle === "terrain" || mapStyle === "roads" ? mapStyle : null;
  const tiles =
    tilesBase && unlabeledStyle && layersOn.city_labels === false
      ? TILES_NO_LABELS[unlabeledStyle]
      : tilesBase;
  // Keep Windy seed stable in interactive mode so adding points doesn't reset the view.
  const seedView = useMemo(
    () => (interactive ? { lat: DEFAULT_CENTER[0], lon: DEFAULT_CENTER[1], zoom: 5 } : seedFromPositions(positions)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactive, isWindy],
  );
  const activeOverlay = WINDY_OVERLAYS.find((o) => o.id === windyOverlay);
  const mapLoadingLabel =
    showAerodromes && aerodromeLoading
      ? "Carregando aeroportos"
      : showAerodromes && metarLoading
        ? "Carregando metar"
        : "";

  const [committedView, setCommittedView] = useState<WindyView | null>(null);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [front, setFront] = useState<"a" | "b">("a");
  const [loadingSlot, setLoadingSlot] = useState<"a" | "b" | null>(null);
  const [transform, setTransform] = useState<WindyTransform>(IDENTITY_TRANSFORM);

  const frontUrl = front === "a" ? slotA : slotB;
  const center = positions[0] ?? DEFAULT_CENTER;

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

  function resolveBlankMapClick(lat: number, lng: number) {
    if (Date.now() < suppressMapPickUntil.current) return;
    // Prefer nearby aerodrome / REA for the popup label — never auto-add.
    const NEAR_AD_M = 1852 * 1.2;
    const NEAR_FIX_M = 1852 * 1.5;
    let bestAd: Aerodrome | null = null;
    let bestAdDist = Infinity;
    for (const ad of aerodromes) {
      if (ad.latitudeGeoPoint == null || ad.longitudeGeoPoint == null) continue;
      const d = haversineM({ lat, lng }, { lat: ad.latitudeGeoPoint, lng: ad.longitudeGeoPoint });
      if (d < bestAdDist) {
        bestAdDist = d;
        bestAd = ad;
      }
    }
    if (bestAd && bestAdDist <= NEAR_AD_M) {
      const code = bestAd.icao || bestAd.ciad;
      setPendingInsertIndex(undefined);
      setPendingPick({
        lat: bestAd.latitudeGeoPoint!,
        lng: bestAd.longitudeGeoPoint!,
        label: code,
        kind: "airport",
        name: bestAd.name,
        city: bestAd.municipality,
        uf: bestAd.uf,
        icao: code,
        altitude: bestAd.altitudeText || undefined,
        operation: bestAd.operation || undefined,
      });
      return;
    }

    let bestFix: { lat: number; lon: number; name: string } | null = null;
    let bestFixDist = Infinity;
    const fixesForSnap = [
      ...(layersOn.rea ? reaFixes : []),
      ...(layersOn.reh ? rehFixes : []),
    ];
    for (const fix of fixesForSnap) {
      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || !fix.name?.trim()) continue;
      const d = haversineM({ lat, lng }, { lat: fix.lat, lng: fix.lon });
      if (d < bestFixDist) {
        bestFixDist = d;
        bestFix = fix;
      }
    }
    if (bestFix && bestFixDist <= NEAR_FIX_M) {
      const name = bestFix.name.trim().toUpperCase();
      setPendingInsertIndex(undefined);
      setPendingPick({
        lat: bestFix.lat,
        lng: bestFix.lon,
        label: name,
        kind: "rea",
        name,
      });
      return;
    }

    // Clique em área vazia: limpa seleção de espaço aéreo.
    setSelectedAirspace(null);

    const label = formatCompactAviationCoord(lat, lng);
    setPendingInsertIndex(undefined);
    setPendingPick({ lat, lng, label, kind: "fix" });
  }

  function traceAreaDraft() {
    const points = parseCoordAreaText(areaDraftText);
    const error = coordAreaError(points);
    if (error) {
      setAreaPreview(null);
      setAreaError(error);
      return;
    }
    setAreaError(null);
    setAreaPreview(points);
    setAreaFitKey(`area-${Date.now()}`);
  }

  function saveAreaDraft() {
    const points = areaPreview || parseCoordAreaText(areaDraftText);
    const error = coordAreaError(points);
    if (error) {
      setAreaError(error);
      return;
    }
    const name = areaDraftName.trim() || `Área ${customAreas.length + 1}`;
    onCustomAreasChange?.([
      ...customAreas,
      {
        id: `area_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        sourceText: areaDraftText.trim(),
        points,
      },
    ]);
    setAreaDraftName("");
    setAreaDraftText("");
    setAreaPreview(null);
    setAreaError(null);
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-700/70 ${className} ${
        pickMode ? "ring-2 ring-emerald-500/50" : ""
      }`}
    >
      <div
        ref={mapShellRef}
        className={`relative w-full shrink-0 overflow-hidden overscroll-contain bg-[#d4d4c8] [&_.leaflet-container]:bg-[#d4d4c8] [&_.leaflet-control-attribution]:text-[9px] ${mapHeightClass}`}
      >
        {mapOverlay && !toolPanel ? (
          <div className="pointer-events-none absolute inset-0 z-[500]">
            <div
              className={`pointer-events-auto absolute left-2 top-2 flex max-h-[calc(100%-1rem)] flex-col overflow-hidden ${mapOverlayMaxWidthClass}`}
            >
              {mapOverlay}
            </div>
          </div>
        ) : null}

        {mapLoadingLabel ? (
          <div className="pointer-events-none absolute bottom-3 right-14 z-[540] rounded-full border border-slate-600/70 bg-slate-950/80 px-3 py-1.5 text-[11px] font-semibold text-slate-100 shadow-xl shadow-black/35 backdrop-blur-md">
            {mapLoadingLabel}
          </div>
        ) : null}

        {/* Menu vertical direito (estilo NexAtlas) */}
        <div className="pointer-events-none absolute bottom-3 right-2 top-2 z-[530] flex items-start justify-end gap-2">
          {toolPanel ? (
            <div className="pointer-events-auto flex max-h-full w-[min(100%-3.5rem,17rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-md max-sm:absolute max-sm:inset-x-2 max-sm:bottom-14 max-sm:top-auto max-sm:max-h-[55%] max-sm:w-auto">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                  {toolPanel === "filters"
                    ? "Filtros"
                    : toolPanel === "basemap"
                      ? "Tipo de mapa"
                      : toolPanel === "windy"
                        ? "Camada Windy"
                        : toolPanel === "areas"
                          ? "Áreas"
                          : toolPanel === "notams"
                            ? "NOTAMs"
                            : "Espaços aéreos"}
                </p>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  onClick={() => setToolPanel(null)}
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {toolPanel === "filters" ? (
                  <div className="space-y-2.5">
                    <label className="block">
                      <span className="text-[11px] text-slate-400">Tamanho mínimo de pista (m)</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                        placeholder="Ex.: 800"
                        value={aerodromeFilter.minRunwayLengthM ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const n = Number(raw);
                          patchFilter({
                            minRunwayLengthM: raw && Number.isFinite(n) && n > 0 ? n : null,
                          });
                        }}
                      />
                    </label>
                    {(
                      [
                        ["pavedOnly", "Pista pavimentada"],
                        ["nightOpsOnly", "Operação noturna"],
                        ["publicOnly", "AD público"],
                        ["avgasOnly", "Combustível Avgas"],
                        ["jetOnly", "Combustível Jet"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-300">{label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={aerodromeFilter[key]}
                          onClick={() => patchFilter({ [key]: !aerodromeFilter[key] })}
                          className={`inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            aerodromeFilter[key] ? "bg-emerald-600" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              aerodromeFilter[key] ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                    {adFilterActiveCount > 0 ? (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                        onClick={() => onAerodromeFilterChange?.(EMPTY_AERODROME_MAP_FILTER)}
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                    {(aerodromeFilter.nightOpsOnly ||
                      aerodromeFilter.avgasOnly ||
                      aerodromeFilter.jetOnly) && (
                      <p className="text-[10px] leading-snug text-slate-500">
                        Noturna/combustível: consulta AISWEB/ROTAER dos ADs visíveis.
                      </p>
                    )}
                  </div>
                ) : null}

                {toolPanel === "basemap" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["terrain", "Relevo"],
                        ["satellite", "Satélite"],
                        ["roads", "Rodoviário"],
                        ["wac", "WAC"],
                        ["windy", "Windy"],
                      ] as const
                    ).map(([id, label]) => {
                      const on = mapStyle === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setMapStyle(id);
                          }}
                          className={`rounded-xl border px-2 py-3 text-center text-[11px] font-semibold transition ${
                            on
                              ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-100"
                              : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {toolPanel === "windy" ? (
                  <div className="space-y-2">
                    {mapStyle !== "windy" ? (
                      <button
                        type="button"
                        className="mb-1 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-[11px] font-semibold text-cyan-200"
                        onClick={() => setMapStyle("windy")}
                      >
                        Ativar fundo Windy
                      </button>
                    ) : null}
                    <div className="grid grid-cols-2 gap-1.5">
                      {WINDY_OVERLAYS.map((item) => {
                        const on = windyOverlay === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.description}
                            onClick={() => {
                              setMapStyle("windy");
                              setWindyOverlay(item.id);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide transition ${
                              on
                                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                                : "border-slate-700 bg-slate-900/50 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <WindyOverlayIcon id={item.id} className="h-3 w-3 shrink-0" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      title="Isóbaras de pressão"
                      onClick={() => {
                        setMapStyle("windy");
                        setWindyPressure((v) => !v);
                      }}
                      className={`inline-flex w-full items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                        windyPressure
                          ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                          : "border-slate-700 bg-slate-900/50 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <WindyIsobarsIcon className="h-3 w-3" />
                      Isóbaras
                    </button>
                    {activeOverlay ? (
                      <p className="text-[10px] text-slate-500">{activeOverlay.description}</p>
                    ) : null}
                  </div>
                ) : null}

                {toolPanel === "layers" ? (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Espaço aéreo
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {AIRSPACE_TOGGLES.map((layer) => {
                          const on = layersOn[layer.id] === true;
                          return (
                            <button
                              key={layer.id}
                              type="button"
                              title={layer.label}
                              onClick={() =>
                                setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))
                              }
                              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                                on
                                  ? "border-white/25 text-white"
                                  : "border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300"
                              }`}
                              style={on ? { backgroundColor: `${layer.color}55` } : undefined}
                            >
                              {layer.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Rotas especiais
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {REA_LAYER_TOGGLES_PLANNING.map((layer) => {
                          const on = layersOn[layer.id] === true;
                          return (
                            <button
                              key={layer.id}
                              type="button"
                              title={layer.title}
                              onClick={() =>
                                setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))
                              }
                              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                                on
                                  ? "border-amber-400/50 bg-amber-500/25 text-amber-50"
                                  : "border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {layer.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Referências
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {FEATURE_LAYER_TOGGLES.map((layer) => {
                          const on = layersOn[layer.id] === true;
                          return (
                            <button
                              key={layer.id}
                              type="button"
                              title={layer.label}
                              onClick={() =>
                                setLayersOn((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))
                              }
                              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                                on
                                  ? "border-sky-400/50 bg-sky-500/20 text-sky-50"
                                  : "border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {layer.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {toolPanel === "notams" ? (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400">
                      {routeNotams.length
                        ? `${routeNotams.length} NOTAM${routeNotams.length === 1 ? "" : "s"} na rota ou até 10 NM`
                        : "Nenhum NOTAM na rota ou até 10 NM"}
                    </p>
                    {(
                      [
                        ["onMap", "Exibir NOTAMs na rota", showRouteNotamsOnMap],
                        ["onProfile", "Filtrar pelo perfil vertical", filterNotamsByVerticalProfile],
                      ] as const
                    ).map(([key, label, on]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-300">{label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => {
                            if (key === "onMap") {
                              const nextOn = !showRouteNotamsOnMap;
                              if (!nextOn) setSelectedRouteNotams(null);
                              onShowRouteNotamsOnMapChange?.(nextOn);
                              return;
                            }
                            onFilterNotamsByVerticalProfileChange?.(!filterNotamsByVerticalProfile);
                          }}
                          className={`inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            on ? "bg-red-600" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              on ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] leading-snug text-slate-500">
                      As áreas ficam só no contorno até o clique. O filtro vertical vale no mapa 2D: some NOTAM fora da altitude planejada.
                    </p>
                  </div>
                ) : null}

                {toolPanel === "areas" && onCustomAreasChange ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Área por coordenadas
                    </p>
                    <textarea
                      className="h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600"
                      placeholder="COORD 252823S0541627W - 244835S0542041W - ..."
                      value={areaDraftText}
                      onChange={(event) => {
                        setAreaDraftText(event.target.value);
                        setAreaError(null);
                      }}
                    />
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
                      placeholder="Nome da área"
                      value={areaDraftName}
                      onChange={(event) => setAreaDraftName(event.target.value)}
                    />
                    {areaError ? <p className="text-[11px] text-amber-200">{areaError}</p> : null}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                        onClick={traceAreaDraft}
                      >
                        Traçar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                        onClick={saveAreaDraft}
                      >
                        Salvar na rota
                      </button>
                    </div>
                    {customAreas.length ? (
                      <div className="space-y-1">
                        {customAreas.map((area, idx) => (
                          <div
                            key={area.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5"
                          >
                            <span className="truncate text-[11px] font-semibold text-slate-200">
                              <span
                                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: areaColor(idx) }}
                              />
                              {area.name}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] text-rose-300 hover:text-rose-200"
                              onClick={() => onCustomAreasChange(customAreas.filter((item) => item.id !== area.id))}
                            >
                              Excluir
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">Cole um polígono COORD, trace e salve com um nome.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-slate-600/80 bg-slate-950/85 p-1 shadow-2xl shadow-black/40 backdrop-blur-md">
            {(
              [
                {
                  id: "filters" as const,
                  title: "Filtros de aeródromos",
                  icon: <MapToolIconFilter />,
                  badge: adFilterActiveCount > 0 ? adFilterActiveCount : null,
                },
                { id: "basemap" as const, title: "Tipo de mapa", icon: <MapToolIconMap />, badge: null },
                ...(isWindy
                  ? [{ id: "windy" as const, title: "Camada Windy", icon: <MapToolIconCloud />, badge: null }]
                  : []),
                { id: "layers" as const, title: "Espaços aéreos", icon: <MapToolIconAirspace />, badge: null },
                {
                  id: "notams" as const,
                  title: "NOTAMs",
                  icon: <MapToolIconNotam />,
                  badge: routeNotams.length > 0 ? routeNotams.length : null,
                },
                ...(onCustomAreasChange
                  ? [
                      {
                        id: "areas" as const,
                        title: "Áreas por coordenadas",
                        icon: <MapToolIconArea />,
                        badge: customAreas.length > 0 ? customAreas.length : null,
                      },
                    ]
                  : []),
              ] as const
            ).map((btn) => {
              const on = toolPanel === btn.id;
              const notamsLive = btn.id === "notams" && showRouteNotamsOnMap;
              return (
                <button
                  key={btn.id}
                  type="button"
                  title={btn.title}
                  onClick={() => toggleToolPanel(btn.id)}
                  className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                    on
                      ? "bg-cyan-500/30 text-cyan-100 ring-1 ring-cyan-400/50"
                      : notamsLive
                        ? "text-red-200 hover:bg-slate-800 hover:text-red-100"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {btn.icon}
                  {btn.badge != null ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                      {btn.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {onSnapToVisualCorridors ? (
              <button
                type="button"
                title={
                  corridorSnapEnabled
                    ? "Ajustar rota nos corredores visuais"
                    : "Coloque origem e destino para ajustar nos corredores"
                }
                disabled={!corridorSnapEnabled}
                onClick={() => onSnapToVisualCorridors()}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  corridorSnapEnabled
                    ? "text-amber-100 ring-1 ring-amber-400/40 hover:bg-amber-500/20 hover:text-amber-50"
                    : "cursor-not-allowed text-slate-600"
                }`}
              >
                <MapToolIconCorridor />
              </button>
            ) : null}
          </div>
        </div>

        {selectedRouteNotams && showRouteNotamsOnMap ? (
          <div className="absolute bottom-14 right-14 top-2 z-[526] flex w-[min(18rem,calc(100%-4.5rem))] flex-col overflow-hidden">
            <RouteNotamInfoPanel
              hits={selectedRouteNotams.hits}
              activeId={selectedRouteNotams.activeId}
              onActiveIdChange={(id) =>
                setSelectedRouteNotams((prev) => (prev ? { ...prev, activeId: id } : prev))
              }
              onClose={() => setSelectedRouteNotams(null)}
            />
          </div>
        ) : selectedAirspace ? (
          <div className="absolute right-14 top-2 z-[525] w-[min(15rem,calc(100%-1rem))]">
            <AirspaceInfoPanel
              info={selectedAirspace.info}
              onClose={() => setSelectedAirspace(null)}
            />
          </div>
        ) : null}
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
          center={center}
          zoom={positions.length ? 8 : 5}
          className={`relative z-10 h-full w-full ${isWindy ? "flight-plan-windy-overlay" : ""} ${
            isWac ? "flight-plan-wac-map" : ""
          } ${
            pickMode || measureMode ? "cursor-crosshair" : ""
          }`}
          scrollWheelZoom
          zoomSnap={isWac ? 1 : 0}
          zoomDelta={isWac ? 1 : 0.5}
          wheelPxPerZoomLevel={isWac ? 70 : 90}
          zoomAnimation
          fadeAnimation={!isWac}
          markerZoomAnimation
          preferCanvas
          zoomControl
          closePopupOnClick
        >
          {!isWac ? <SoftScrollZoom /> : null}
          {isWac ? <MapZoomValue onZoom={setMapZoom} /> : null}
          <FitRoute positions={positions} fitKey={fitKey} />
          {areaPreview ? <FitLatLngs points={areaPreview} fitKey={areaFitKey} /> : null}
          <MapClickHandler
            enabled={Boolean(interactive && pickMode && !measureMode)}
            onMapClick={resolveBlankMapClick}
            suppressUntilRef={suppressMapPickUntil}
            onBlankClick={() => {
              // Áreas aéreas já fazem stopPropagation no clique delas.
              if (!(interactive && pickMode && !measureMode)) {
                setSelectedAirspace(null);
              }
            }}
          />
          {interactive ? <MeasureTool enabled={measureMode} /> : null}
          {pendingPick && !measureMode ? (
            <PendingPickPopup
              pick={pendingPick}
              onConfirm={(c) => {
                handlePick?.(
                  c,
                  pendingInsertIndex != null ? { insertIndex: pendingInsertIndex } : undefined,
                );
                setPendingInsertIndex(undefined);
              }}
              onClose={() => {
                setPendingPick(null);
                setPendingInsertIndex(undefined);
              }}
            />
          ) : null}
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
              key={`${mapStyle}-${layersOn.city_labels ? "labels" : "nolabels"}`}
              attribution={tiles.attribution}
              url={tiles.url}
              maxZoom={tiles.maxZoom}
              keepBuffer={6}
              updateWhenIdle={false}
              updateWhenZooming
              {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
            />
          ) : null}
          {!isWindy && !isWac && mapStyle === "satellite" && layersOn.city_labels === true ? (
            <TileLayer
              key="esri-place-labels"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution="Labels © Esri"
              maxZoom={19}
              zIndex={2}
            />
          ) : null}
          {isWac && useXyzWac ? (
            <ChartXyzTileLayer
              key="wac-xyz"
              layerSet="wac"
              attribution="WAC GeoAISWEB DECEA"
              zIndex={1}
              format={chartManifest?.layers?.wac?.format || "webp"}
            />
          ) : null}
          {isWac && !useXyzWac ? (
            <HighDpiWmsTileLayer
              key="wac-coarse"
              layers={WAC_WMS_LAYERS}
              layerSet="wac"
              attribution="WAC GeoAISWEB DECEA"
              transparent={false}
              tileSize={WMS_TILE_DEFAULTS.tileSize}
              zIndex={1}
              pixelRatio={WMS_LAYER_LIMITS["wac-coarse"].pixelRatio}
              maxNativeZoom={WMS_LAYER_LIMITS["wac-coarse"].maxNativeZoom}
              minNativeZoom={WMS_LAYER_LIMITS["wac-coarse"].minNativeZoom}
              keepBuffer={WMS_LAYER_LIMITS["wac-coarse"].keepBuffer}
              className="flight-plan-chart-tile flight-plan-chart-tile--coarse"
            />
          ) : null}
          {isWac && !useXyzWac ? (
            <HighDpiWmsTileLayer
              key="wac-sharp"
              layers={WAC_WMS_LAYERS}
              layerSet="wac"
              attribution="WAC GeoAISWEB DECEA"
              transparent
              tileSize={WMS_TILE_DEFAULTS.tileSize}
              zIndex={2}
              pixelRatio={WMS_LAYER_LIMITS.wac.pixelRatio}
              maxNativeZoom={WMS_LAYER_LIMITS.wac.maxNativeZoom}
              keepBuffer={WMS_LAYER_LIMITS.wac.keepBuffer}
              className="flight-plan-chart-tile flight-plan-chart-tile--sharp"
            />
          ) : null}
          {isWac && layersOn.rea === true && showChartOverlays && useXyzRea ? (
            <ChartXyzTileLayer
              key="rea-xyz"
              layerSet="rea"
              attribution="REA GeoAISWEB DECEA"
              opacity={0.94}
              zIndex={650}
              format={chartManifest?.layers?.rea?.format || "webp"}
            />
          ) : null}
          {isWac && layersOn.rea === true && showChartOverlays && !useXyzRea ? (
            <HighDpiWmsTileLayer
              key="rea-chart"
              layers={REA_CHART_WMS_LAYERS}
              layerSet="rea"
              attribution="REA GeoAISWEB DECEA"
              opacity={0.94}
              transparent
              tileSize={WMS_TILE_DEFAULTS.tileSize}
              zIndex={650}
              pixelRatio={WMS_LAYER_LIMITS.rea.pixelRatio}
              maxNativeZoom={WMS_LAYER_LIMITS.rea.maxNativeZoom}
              keepBuffer={WMS_LAYER_LIMITS.rea.keepBuffer}
            />
          ) : null}
          {isWac && layersOn.reh === true && showChartOverlays && useXyzReh ? (
            <ChartXyzTileLayer
              key="reh-xyz"
              layerSet="reh"
              attribution="REH GeoAISWEB DECEA"
              opacity={0.94}
              zIndex={670}
              format={chartManifest?.layers?.reh?.format || "webp"}
            />
          ) : null}
          {isWac && layersOn.reh === true && showChartOverlays && !useXyzReh ? (
            <HighDpiWmsTileLayer
              key="reh-chart"
              layers={REH_CHART_WMS_LAYERS}
              layerSet="reh"
              attribution="REH GeoAISWEB DECEA"
              opacity={0.94}
              transparent
              tileSize={WMS_TILE_DEFAULTS.tileSize}
              zIndex={670}
              pixelRatio={WMS_LAYER_LIMITS.reh.pixelRatio}
              maxNativeZoom={WMS_LAYER_LIMITS.reh.maxNativeZoom}
              keepBuffer={WMS_LAYER_LIMITS.reh.keepBuffer}
            />
          ) : null}
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
          <FcaAdOverlay
            enabled={layersOn.fca_ad === true}
            aerodromes={aerodromes}
            selectedKey={selectedAirspace?.key ?? null}
            onSelect={(info, key) => {
              if (!info || !key) setSelectedAirspace(null);
              else setSelectedAirspace({ info, key });
            }}
          />
          <AfisAdOverlay
            enabled={layersOn.afis === true}
            aerodromes={aerodromes}
            selectedKey={selectedAirspace?.key ?? null}
            onSelect={(info, key) => {
              if (!info || !key) setSelectedAirspace(null);
              else setSelectedAirspace({ info, key });
            }}
          />
          <ReaRoutesOverlayBoundary>
            <ReaRoutesOverlay kind="rea" enabled={!isWac && layersOn.rea === true} showEndpointMarkers={false} />
            <ReaRoutesOverlay kind="reh" enabled={!isWac && layersOn.reh === true} showEndpointMarkers={false} />
          </ReaRoutesOverlayBoundary>

          <VisibleAerodromes
            aerodromes={aerodromes}
            show={layersOn.airports === true && aerodromes.length > 0}
            filter={aerodromeFilter}
            hideIcaos={routeIcaos}
            hideLabelIcaos={visibleMetarIcaos}
            onPick={handlePick}
            onOpenDetails={onAerodromeDetails}
            onLoadingChange={setAerodromeLoading}
            onSuppressMapPick={() => {
              suppressMapPickUntil.current = Date.now() + 400;
            }}
          />
          <VisibleMetarAerodromes
            aerodromes={aerodromes}
            show={layersOn.airports === true && aerodromes.length > 0}
            filter={aerodromeFilter}
            priorityIcaos={routeIcaos}
            onVisibleMetarIcaosChange={updateVisibleMetarIcaos}
            onLoadingChange={setMetarLoading}
            onPick={handlePick}
            onOpenDetails={onAerodromeDetails}
            onSuppressMapPick={() => {
              suppressMapPickUntil.current = Date.now() + 400;
            }}
          />
          <VisibleReaFixes
            fixes={reaFixes}
            show={!isWac && interactive && layersOn.rea_points === true}
            onPick={handlePick}
          />
          <VisibleReaFixes
            fixes={rehFixes}
            show={!isWac && interactive && layersOn.rea_points === true}
            onPick={handlePick}
          />

          <RouteNotamsOverlay
            hits={routeNotams}
            show={showRouteNotamsOnMap}
            selectedId={selectedRouteNotams?.activeId ?? null}
            onSelect={(hits, activeId) => {
              setSelectedAirspace(null);
              setSelectedRouteNotams({ hits, activeId });
            }}
          />

          <CustomAreaPolygons
            areas={customAreas}
            preview={areaPreview}
            onRemove={
              onCustomAreasChange
                ? (id) => onCustomAreasChange(customAreas.filter((area) => area.id !== id))
                : undefined
            }
          />
          {positions.length >= 2 ? (
            <>
              <Polyline
                positions={positions}
                pathOptions={{ color: "#0f766e", weight: 5, opacity: 0.95 }}
                pane="overlayPane"
              />
              <RouteDragToInsert
                positions={positions}
                waypoints={waypoints}
                aerodromes={aerodromes}
                reaFixes={reaFixes}
                rehFixes={rehFixes}
                enabled={interactive && !measureMode}
                onPropose={(candidate, insertIndex) => {
                  setPendingInsertIndex(insertIndex);
                  setPendingPick(candidate);
                }}
              />
            </>
          ) : null}

          {showLegBubbles && legs.length > 0 ? <LegBubbles legs={legs} /> : null}

          {positions.map((pos, idx) => {
            const wp = waypoints[idx];
            const isFirst = idx === 0;
            const isLast = idx === positions.length - 1;
            const label = isFirst
              ? originLabel || wp?.label || "DEP"
              : isLast
                ? destLabel || wp?.label || "ARR"
                : wp?.reaName || wp?.label || String(idx);
            const color = isFirst ? "#34d399" : isLast ? "#f472b6" : "#38bdf8";
            return (
              <Marker key={`wp-${idx}-${pos[0]}-${pos[1]}`} position={pos} icon={pointIcon(label, color)}>
                {interactive && onWaypointRemove ? (
                  <Popup {...PLAN_POPUP}>
                    <div className="min-w-[120px] space-y-1.5 text-slate-900">
                      <p className="text-[11px] font-semibold">{label}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {formatCompactAviationCoord(pos[0]!, pos[1]!)}
                      </p>
                      <button
                        type="button"
                        className="w-full rounded-md bg-rose-600 px-2 py-1 text-left text-[11px] font-semibold text-white hover:bg-rose-500"
                        onClick={() => onWaypointRemove(idx)}
                      >
                        Excluir ponto
                      </button>
                    </div>
                  </Popup>
                ) : null}
              </Marker>
            );
          })}

          {phaseMarkers.map((m) => {
            const color = m.label === "TOC" ? "#a78bfa" : "#e879f9";
            return (
              <Marker
                key={`phase-${m.label}-${m.lat}-${m.lng}`}
                position={[m.lat, m.lng]}
                icon={pointIcon(m.label, color)}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {m.label}
                </Tooltip>
              </Marker>
            );
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
        .flight-plan-wac-map.leaflet-container,
        .flight-plan-wac-map .leaflet-container,
        .flight-plan-wac-map .leaflet-tile-pane,
        .flight-plan-wac-map .leaflet-map-pane {
          background: #d8d0a8 !important;
        }
        .flight-plan-wac-map .leaflet-tile {
          transition: none !important;
        }
        .flight-plan-wac-map .leaflet-image-layer {
          transition: none !important;
          will-change: opacity, transform;
        }
        .leaflet-div-icon.leg-bubble-icon {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }
        .leaflet-popup-content .ad-map-popup p,
        .leaflet-popup-content .ad-map-popup {
          margin: 0 !important;
        }
        .leaflet-popup-content {
          margin: 10px 12px !important;
          line-height: 1.25 !important;
        }
        .metar-hover-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          opacity: 1 !important;
        }
        .metar-hover-tooltip::before {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
