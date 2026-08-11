import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
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
import type { AiswebAirportBundle } from "../types/aisweb";

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

import { AIRSPACE_LAYER_DEFS, type AirspaceInfo } from "../lib/airspaceLayersDb";
import { AirspaceInfoPanel, AirspaceLayersOverlay } from "./AirspaceLayersOverlay";

const AIRSPACE_TOGGLES = AIRSPACE_LAYER_DEFS.map((d) => ({
  id: d.id,
  label: d.type,
  defaultOn: d.defaultOn,
  color: d.color,
}));

type PlanLayerId =
  | (typeof AIRSPACE_TOGGLES)[number]["id"]
  | (typeof REA_LAYER_TOGGLES_PLANNING)[number]["id"];

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

function HighDpiWmsTileLayer({
  layers,
  layerSet,
  attribution,
  transparent = true,
  opacity = 1,
  zIndex = 1,
  tileSize = 512,
  pixelRatio = 2,
  keepBuffer,
  maxNativeZoom,
  minNativeZoom,
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
}) {
  const map = useMap();
  const layerKey = layers.join(",");

  useEffect(() => {
    if (!layers.length) return;

    const useAppProxy = Boolean(layerSet && !import.meta.env.DEV);
    const baseUrl = useAppProxy ? GEOAISWEB_WMS_PROXY_BASE : import.meta.env.DEV ? DEV_WMS_PROXY_BASE : WMS_BASE;
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
      keepBuffer: keepBuffer ?? (layerSet === "wac" ? 20 : 16),
      updateWhenIdle: true,
      updateWhenZooming: false,
      updateInterval: 260,
      ...(maxNativeZoom != null ? { maxNativeZoom } : {}),
      ...(minNativeZoom != null ? { minNativeZoom } : {}),
      className: "flight-plan-chart-tile",
    });

    const baseGetTileUrl = wmsLayer.getTileUrl.bind(wmsLayer);
    const normalizeUrl = (rawUrl: string, requestedSize: number) => {
      const url = new URL(rawUrl, window.location.origin);
      url.searchParams.set("width", String(requestedSize));
      url.searchParams.set("height", String(requestedSize));
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
    const tileUrlFor = (coords: L.Coords, requestedSize: number) => normalizeUrl(baseGetTileUrl(coords), requestedSize);
    wmsLayer.getTileUrl = (coords: L.Coords) => tileUrlFor(coords, requestedSize);

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

    let redrawTimer: number | null = null;
    let lastMovePrefetchAt = 0;

    const scheduleHighQualityRedraw = (delay = 180, reset = true) => {
      if (redrawTimer != null) {
        if (!reset) return;
        window.clearTimeout(redrawTimer);
      }
      redrawTimer = window.setTimeout(() => {
        redrawTimer = null;
        if (!layerSet || !navigator.serviceWorker?.controller) return;
        const zoom = Math.round(map.getZoom());
        const urls = new Set<string>();
        const effectiveZoom = maxNativeZoom != null ? Math.min(zoom, maxNativeZoom) : zoom;
        addPrefetchUrlsForZoom(urls, effectiveZoom, layerSet === "wac" ? 4 : 4, layerSet === "wac" ? 120 : 120);
        addPrefetchUrlsForZoom(urls, Math.max(0, effectiveZoom - 1), 3, 72);
        addPrefetchUrlsForZoom(urls, Math.min(maxNativeZoom ?? 18, effectiveZoom + 1), 3, 96);
        const tiles =
          ((wmsLayer as unknown as { _tiles?: Record<string, { coords?: L.Coords }> })._tiles || {});
        for (const tile of Object.values(tiles)) {
          const coords = tile.coords;
          if (!coords) continue;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
              const nextCoords = Object.assign(L.point(coords.x + dx, coords.y + dy), { z: coords.z }) as L.Coords;
              urls.add(tileUrlFor(nextCoords, requestedSize));
              if (urls.size >= 240) break;
            }
            if (urls.size >= 240) break;
          }
          if (urls.size >= 240) break;
        }
        navigator.serviceWorker.controller.postMessage({
          type: "GFV_PREFETCH_MAP_TILES",
          urls: [...urls],
        });
      }, delay);
    };

    const schedulePrefetchDuringMove = () => {
      const now = performance.now();
      if (now - lastMovePrefetchAt < 320) return;
      lastMovePrefetchAt = now;
      scheduleHighQualityRedraw(80, false);
    };
    const schedulePrefetchAfterSettle = () => scheduleHighQualityRedraw(180, true);

    map.on("move zoomstart", schedulePrefetchDuringMove);
    map.on("moveend zoomend", schedulePrefetchAfterSettle);

    wmsLayer.addTo(map);
    window.setTimeout(() => scheduleHighQualityRedraw(0, true), 80);
    return () => {
      if (redrawTimer != null) window.clearTimeout(redrawTimer);
      map.off("move zoomstart", schedulePrefetchDuringMove);
      map.off("moveend zoomend", schedulePrefetchAfterSettle);
      wmsLayer.removeFrom(map);
    };
  }, [attribution, keepBuffer, layerKey, layerSet, layers.length, map, maxNativeZoom, minNativeZoom, opacity, pixelRatio, tileSize, transparent, zIndex]);

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

function SoftScrollZoom() {
  const map = useMap();
  useEffect(() => {
    // Zoom contínuo mais leve: menos snaps fracionários = menos troca de tiles.
    map.options.wheelPxPerZoomLevel = 120;
    map.options.zoomSnap = 0;
    map.options.zoomDelta = 0.5;
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
      onBlankClick?.();
      if (!enabled || !onMapClick) return;
      if (suppressUntilRef && Date.now() < suppressUntilRef.current) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
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
}: {
  aerodromes: Aerodrome[];
  show: boolean;
  filter: AerodromeMapFilter;
  onPick?: (candidate: MapPickCandidate) => void;
  onOpenDetails?: (bundle: AiswebAirportBundle) => void;
  /** Evita abrir "novo ponto" no mesmo clique que fecha o popup. */
  onSuppressMapPick?: () => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [enrichTick, setEnrichTick] = useState(0);
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
      if (out.length >= max) break;
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
      if (out.length >= max) break;
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
        return (
          <Marker
            key={ad.id}
            position={[lat, lng]}
            icon={aerodromeIcon(code, showLabels)}
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
              <Popup maxWidth={320} minWidth={280} autoPan autoClose closeOnClick closeOnEscapeKey>
                <AerodromeMapPopupContent
                  icao={code}
                  fallbackName={ad.name}
                  onOpenDetails={onOpenDetails}
                  onAddToRoute={
                    onPick
                      ? () =>
                          onPick({
                            lat,
                            lng,
                            label: code,
                            kind: "airport",
                            name: ad.name,
                            city: ad.municipality,
                            uf: ad.uf,
                            icao: code,
                            altitude: ad.altitudeText || undefined,
                            operation: ad.operation || undefined,
                          })
                      : undefined
                  }
                />
              </Popup>
            ) : (
              <Popup>
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
            <Popup>
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
};

type MapToolPanel = "filters" | "basemap" | "windy" | "layers" | null;

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
    ]) as Record<PlanLayerId, boolean>,
  );
  const [selectedAirspace, setSelectedAirspace] = useState<{
    info: AirspaceInfo;
    key: string;
  } | null>(null);
  const [toolPanel, setToolPanel] = useState<MapToolPanel>(null);
  const suppressMapPickUntil = useRef(0);

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

  const legs = useMemo(
    () =>
      showLegBubbles && positions.length >= 2
        ? buildFlightPlanLegs(waypoints, { cruiseSpeedKt })
        : [],
    [waypoints, cruiseSpeedKt, showLegBubbles, positions.length],
  );

  const isWindy = mapStyle === "windy";
  const isWac = mapStyle === "wac";
  const tiles =
    mapStyle === "terrain" || mapStyle === "satellite" || mapStyle === "roads"
      ? TILES[mapStyle]
      : null;
  // Keep Windy seed stable in interactive mode so adding points doesn't reset the view.
  const seedView = useMemo(
    () => (interactive ? { lat: DEFAULT_CENTER[0], lon: DEFAULT_CENTER[1], zoom: 5 } : seedFromPositions(positions)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactive, isWindy],
  );
  const activeOverlay = WINDY_OVERLAYS.find((o) => o.id === windyOverlay);

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

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-700/70 ${className} ${
        pickMode ? "ring-2 ring-emerald-500/50" : ""
      }`}
    >
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-[#d4d4c8] [&_.leaflet-container]:bg-[#d4d4c8] [&_.leaflet-control-attribution]:text-[9px] ${mapHeightClass}`}
      >
        {mapOverlay ? (
          <div className="pointer-events-none absolute inset-0 z-[500]">
            <div
              className={`pointer-events-auto absolute left-2 top-2 max-h-[calc(100%-1rem)] ${mapOverlayMaxWidthClass}`}
            >
              {mapOverlay}
            </div>
          </div>
        ) : null}

        {/* Menu vertical direito (estilo NexAtlas) */}
        <div className="pointer-events-none absolute bottom-3 right-2 top-2 z-[530] flex items-start justify-end gap-2">
          {toolPanel ? (
            <div className="pointer-events-auto flex max-h-full w-[min(100vw-4.5rem,17rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                  {toolPanel === "filters"
                    ? "Filtros"
                    : toolPanel === "basemap"
                      ? "Tipo de mapa"
                      : toolPanel === "windy"
                        ? "Camada Windy"
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
              ] as const
            ).map((btn) => {
              const on = toolPanel === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  title={btn.title}
                  onClick={() => toggleToolPanel(btn.id)}
                  className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                    on
                      ? "bg-cyan-500/30 text-cyan-100 ring-1 ring-cyan-400/50"
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
          </div>
        </div>

        {selectedAirspace ? (
          <div className="absolute right-14 top-2 z-[525] w-[min(100%-1rem,24rem)]">
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
          wheelPxPerZoomLevel={isWac ? 80 : 120}
          zoomAnimation
          fadeAnimation={!isWac}
          markerZoomAnimation
          preferCanvas
          zoomControl
          closePopupOnClick
        >
          {!isWac ? <SoftScrollZoom /> : null}
          <FitRoute positions={positions} fitKey={fitKey} />
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
              key={mapStyle}
              attribution={tiles.attribution}
              url={tiles.url}
              maxZoom={tiles.maxZoom}
              keepBuffer={6}
              updateWhenIdle={false}
              updateWhenZooming
              {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
            />
          ) : null}
          {isWac ? (
            <HighDpiWmsTileLayer
              key="wac-coarse"
              layers={WAC_WMS_LAYERS}
              layerSet="wac"
              attribution="WAC GeoAISWEB DECEA"
              transparent={false}
              tileSize={512}
              zIndex={1}
              pixelRatio={1}
              maxNativeZoom={7}
              keepBuffer={24}
            />
          ) : null}
          {isWac ? (
            <HighDpiWmsTileLayer
              key="wac-sharp"
              layers={WAC_WMS_LAYERS}
              layerSet="wac"
              attribution="WAC GeoAISWEB DECEA"
              transparent
              tileSize={512}
              zIndex={2}
              pixelRatio={1.25}
              keepBuffer={18}
            />
          ) : null}
          {isWac && layersOn.rea === true ? (
            <HighDpiWmsTileLayer
              key="rea-chart"
              layers={REA_CHART_WMS_LAYERS}
              layerSet="rea"
              attribution="REA GeoAISWEB DECEA"
              opacity={0.94}
              transparent
              tileSize={512}
              zIndex={650}
              pixelRatio={1.5}
              keepBuffer={16}
            />
          ) : null}
          {isWac && layersOn.reh === true ? (
            <HighDpiWmsTileLayer
              key="reh-chart"
              layers={REH_CHART_WMS_LAYERS}
              layerSet="reh"
              attribution="REH GeoAISWEB DECEA"
              opacity={0.94}
              transparent
              tileSize={512}
              zIndex={670}
              pixelRatio={1.5}
              keepBuffer={16}
            />
          ) : null}
          {AIRSPACE_TOGGLES.some((l) => layersOn[l.id]) ? (
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
            <ReaRoutesOverlay kind="rea" enabled={!isWac && layersOn.rea === true} showEndpointMarkers={false} />
            <ReaRoutesOverlay kind="reh" enabled={!isWac && layersOn.reh === true} showEndpointMarkers={false} />
          </ReaRoutesOverlayBoundary>

          <VisibleAerodromes
            aerodromes={aerodromes}
            show={showAerodromes && aerodromes.length > 0}
            filter={aerodromeFilter}
            onPick={handlePick}
            onOpenDetails={onAerodromeDetails}
            onSuppressMapPick={() => {
              suppressMapPickUntil.current = Date.now() + 400;
            }}
          />
          <VisibleReaFixes
            fixes={reaFixes}
            show={!isWac && interactive && layersOn.rea === true}
            onPick={handlePick}
          />
          <VisibleReaFixes
            fixes={rehFixes}
            show={!isWac && interactive && layersOn.reh === true}
            onPick={handlePick}
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
                  <Popup>
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

          {positions.length === 1 ? (
            <CircleMarker
              center={positions[0]!}
              radius={6}
              pathOptions={{ color: "#fff", fillColor: "#34d399", fillOpacity: 1, weight: 2 }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {waypoints[0]?.label || "Ponto"}
              </Tooltip>
            </CircleMarker>
          ) : null}
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
      `}</style>
    </div>
  );
}
