import L from "leaflet";
import polygonClipping from "polygon-clipping";
import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import {
  corridorDisplayName,
  endpointA,
  endpointB,
  formatReaHeading,
  loadReaRoutes,
  loadReaRoutesInBbox,
  numOrNull,
  pointKey,
  resolveReaAltitudes,
  type ReaRouteFeature,
  type ReaRouteKind,
  type ReaRouteProps,
} from "../lib/reaRoutesDb";

/** Fill/bordas abaixo do trajeto (overlayPane 400). */
const REA_FILL_PANE_Z = "350";
/** Bordas em pane próprio (opacidade 100%); fill fica a 3% no pane de fill. */
const REA_EDGE_PANE_Z = "351";
/**
 * Legendas em pane próprio acima do fill/SVG do corredor.
 * (HTML markers no mesmo pane do SVG ficavam atrás das laterais após zoom.)
 */
const REA_LABEL_PANE_Z = "455";
/** Abaixo disso, some legendas — zoom out = menos detalhe. */
const LABEL_MIN_ZOOM = 9;
const POINT_MIN_ZOOM = 10;
const HDG_MIN_ZOOM = 9;

type Props = {
  kind: ReaRouteKind;
  enabled: boolean;
  /** Desenha triângulos nos extremos (desligar se outro layer já plota pontos clicáveis). */
  showEndpointMarkers?: boolean;
  /** Nomes, rumos e altitudes dos corredores. */
  showLabels?: boolean;
};

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** CSS rotate: 0° = leste. Converte rumo geográfico (0° = norte) → ângulo CSS. */
function bearingToCss(bearingDeg: number): number {
  return bearingDeg - 90;
}

function normalizeCssAngle(deg: number): number {
  let a = ((deg + 180) % 360) - 180;
  if (a <= -180) a += 360;
  return a;
}

function angDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Anéis externos de Polygon / MultiPolygon → [lon, lat][]. */
function outerRings(geometry: { type: string; coordinates?: unknown } | null): number[][][] {
  if (!geometry?.coordinates) return [];
  const coords = geometry.coordinates as number[][][] | number[][][][];
  if (geometry.type === "Polygon") return [coords[0] as number[][]];
  if (geometry.type === "MultiPolygon") {
    return (coords as number[][][][]).map((poly) => poly[0]).filter(Boolean);
  }
  return [];
}

/**
 * Extrai as laterais do corredor (paralelas ao eixo), omitindo as capas
 * perpendiculares nas pontas (onde ficam os pontos A/B).
 */
function corridorSideLatLngs(
  geometry: { type: string; coordinates?: unknown } | null,
  axisBearing: number,
): [number, number][][] {
  const sides: [number, number][][] = [];
  for (const ring of outerRings(geometry)) {
    if (!ring || ring.length < 3) continue;
    let run: [number, number][] | null = null;
    for (let i = 0; i < ring.length - 1; i++) {
      const lon1 = ring[i][0];
      const lat1 = ring[i][1];
      const lon2 = ring[i + 1][0];
      const lat2 = ring[i + 1][1];
      if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) ||
        !Number.isFinite(lon2)
      ) {
        continue;
      }
      const brg = calcBearing(lat1, lon1, lat2, lon2);
      const vsPerp = Math.min(angDiffDeg(brg, axisBearing + 90), angDiffDeg(brg, axisBearing + 270));
      const isEndCap = vsPerp < 40;
      if (isEndCap) {
        if (run && run.length >= 2) sides.push(run);
        run = null;
      } else {
        if (!run) run = [[lat1, lon1]];
        const last = run[run.length - 1];
        if (last[0] !== lat2 || last[1] !== lon2) run.push([lat2, lon2]);
      }
    }
    if (run && run.length >= 2) sides.push(run);
  }
  return sides;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Fonte no mapa: cresce com o zoom, mas de forma amortecida.
 * Referência no z11; fator 0.5× por nível (em vez de ~dobrar).
 */
function mapFontPx(basePxAtZoom11: number, zoom: number, maxPx: number): number | null {
  const px = basePxAtZoom11 * Math.pow(2, (zoom - 11) * 0.5);
  if (px < 7) return null;
  return clamp(px, 7, maxPx);
}

/**
 * Orientação paralela ao eixo do corredor (bearing geográfico).
 * `reverse` = texto legível sem inverter o sentido da seta local.
 */
function parallelPresentation(bearingDeg: number): { css: number; reverse: boolean } {
  let css = normalizeCssAngle(bearingToCss(bearingDeg));
  let reverse = false;
  if (css > 90 || css < -90) {
    css = normalizeCssAngle(css + 180);
    reverse = true;
  }
  return { css, reverse };
}

function midLatLng(props: ReaRouteProps): [number, number] | null {
  const a = endpointA(props);
  const b = endpointB(props);
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  return [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
}

function offsetAlongBearing(
  lat: number,
  lon: number,
  bearingDeg: number,
  meters: number,
): [number, number] {
  const R = 6371000;
  const δ = meters / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * sinφ2,
    );
  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

function halo(color = "#fff"): string {
  return `text-shadow:-1px -1px 0 ${color},1px -1px 0 ${color},-1px 1px 0 ${color},1px 1px 0 ${color},0 0 3px ${color}`;
}

function nameHtml(name: string, fontPx: number, kind: ReaRouteKind): string {
  const color = kind === "rea" ? "#111" : "#0c4a6e";
  return `<div style="white-space:nowrap;font-size:${fontPx}px;font-weight:800;letter-spacing:0.05em;color:${color};line-height:1;${halo()}">${name}</div>`;
}

/**
 * Altitude estilo carta. Traços com a largura exata do número (centrados).
 * Se teto === base, mostra um único valor.
 */
function altLimitsHtml(max: number | null, min: number | null, fontPx: number): string {
  if (max == null && min == null) return "";
  const lineH = Math.max(1.5, fontPx * 0.14);
  const gap = Math.max(1, Math.round(fontPx * 0.12));
  const bar = `<div style="width:100%;height:${lineH}px;background:#111;flex:0 0 auto"></div>`;
  const num = (v: number | string) =>
    `<div style="font-size:${fontPx}px;line-height:1;text-align:center;padding:0 ${Math.round(fontPx * 0.05)}px">${v}</div>`;
  if (max != null && min != null && max === min) {
    return `<div style="display:inline-flex;flex-direction:column;align-items:stretch;gap:${gap}px;font-variant-numeric:tabular-nums;font-weight:800;color:#111;${halo()}">${bar}${num(max)}${bar}</div>`;
  }
  return `<div style="display:inline-flex;flex-direction:column;align-items:stretch;gap:${gap}px;font-variant-numeric:tabular-nums;font-weight:800;color:#111;${halo()}">${bar}${num(max ?? "—")}${num(min ?? "—")}${bar}</div>`;
}

/**
 * Rumo magnético (número) + seta. Orientação vem do eixo do corredor (`reverse`).
 */
function headingHtml(degLabel: string, fontPx: number, reverse: boolean): string {
  const arrowW = Math.max(12, Math.round(fontPx * 1.5));
  const arrowH = Math.max(8, Math.round(fontPx * 1.05));
  const arrow = reverse
    ? `<svg width="${arrowW}" height="${arrowH}" viewBox="0 0 14 10" aria-hidden="true" style="flex:0 0 auto;display:block">
        <path d="M14 4.2 H5.8 V2.2 L0 5 L5.8 7.8 V5.8 H14 Z" fill="#111"/>
      </svg>`
    : `<svg width="${arrowW}" height="${arrowH}" viewBox="0 0 14 10" aria-hidden="true" style="flex:0 0 auto;display:block">
        <path d="M0 4.2 H8.2 V2.2 L14 5 L8.2 7.8 V5.8 H0 Z" fill="#111"/>
      </svg>`;
  const label = `<span style="display:block">${degLabel}</span>`;
  const gap = Math.max(2, Math.round(fontPx * 0.25));
  const body = reverse ? `${arrow}${label}` : `${label}${arrow}`;
  return `<div style="display:inline-flex;align-items:center;gap:${gap}px;white-space:nowrap;color:#111;font-weight:800;font-size:${fontPx}px;line-height:1;${halo()}">${body}</div>`;
}

function pointIconHtml(name: string, fontPx: number): string {
  const tri = Math.max(14, Math.round(fontPx * 1.35));
  return `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
    <svg width="${tri}" height="${Math.round(tri * 0.92)}" viewBox="0 0 12 11" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 1.2 L10.8 10 H1.2 Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>
    <span style="margin-top:2px;font-size:${fontPx}px;font-weight:800;color:#111;white-space:nowrap;${halo()}">${name}</span>
  </div>`;
}

type FeatureBbox = { minLat: number; maxLat: number; minLon: number; maxLon: number };

const featureBboxCache = new WeakMap<ReaRouteFeature, FeatureBbox | null>();
const featureCorridorCache = new WeakMap<ReaRouteFeature, [number, number][] | null>();

function featureIdentity(feature: ReaRouteFeature): string {
  return String(feature.id ?? JSON.stringify(feature.properties));
}

function ringBbox(ring: number[][]): FeatureBbox | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let any = false;
  for (const pt of ring) {
    const lon = pt[0];
    const lat = pt[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    any = true;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return any ? { minLat, maxLat, minLon, maxLon } : null;
}

function mergeBbox(a: FeatureBbox | null, b: FeatureBbox | null): FeatureBbox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLon: Math.max(a.maxLon, b.maxLon),
  };
}

/** Bbox sem L.geoJSON — crítico p/ performance em redes densas (SP). */
function getFeatureBbox(feature: ReaRouteFeature): FeatureBbox | null {
  const cached = featureBboxCache.get(feature);
  if (cached !== undefined) return cached;
  const props = feature.properties || {};
  const a = endpointA(props);
  const b = endpointB(props);
  let box: FeatureBbox | null = null;
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
    box = {
      minLat: Math.min(a.lat, b.lat),
      maxLat: Math.max(a.lat, b.lat),
      minLon: Math.min(a.lon, b.lon),
      maxLon: Math.max(a.lon, b.lon),
    };
  }
  for (const ring of outerRings(feature.geometry)) {
    box = mergeBbox(box, ringBbox(ring));
  }
  featureBboxCache.set(feature, box);
  return box;
}

function featureInBounds(feature: ReaRouteFeature, bounds: L.LatLngBounds): boolean {
  const props = feature.properties || {};
  const a = endpointA(props);
  const b = endpointB(props);
  if (a.lat != null && a.lon != null && bounds.contains([a.lat, a.lon])) return true;
  if (b.lat != null && b.lon != null && bounds.contains([b.lat, b.lon])) return true;
  const box = getFeatureBbox(feature);
  if (!box) return false;
  return !(
    box.maxLat < bounds.getSouth() ||
    box.minLat > bounds.getNorth() ||
    box.maxLon < bounds.getWest() ||
    box.minLon > bounds.getEast()
  );
}

/**
 * Corredor largura constante — fill retangular (bordas vêm do contorno da união).
 */
function buildConstantWidthCorridor(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  halfWidthM: number,
): [number, number][] {
  const hw = Math.max(200, halfWidthM);
  const bearing = calcBearing(aLat, aLon, bLat, bLon);
  const leftBrg = bearing - 90;
  const rightBrg = bearing + 90;
  const aL = offsetAlongBearing(aLat, aLon, leftBrg, hw);
  const aR = offsetAlongBearing(aLat, aLon, rightBrg, hw);
  const bL = offsetAlongBearing(bLat, bLon, leftBrg, hw);
  const bR = offsetAlongBearing(bLat, bLon, rightBrg, hw);
  return [aL, bL, bR, aR];
}

function getConstantWidthCorridor(feature: ReaRouteFeature): [number, number][] | null {
  const cached = featureCorridorCache.get(feature);
  if (cached !== undefined) return cached;
  const props = feature.properties || {};
  const a = endpointA(props);
  const b = endpointB(props);
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) {
    featureCorridorCache.set(feature, null);
    return null;
  }
  const halfWidthM = Math.max(600, numOrNull(props.semi_largura) ?? 1400);
  const ring = buildConstantWidthCorridor(a.lat, a.lon, b.lat, b.lon, halfWidthM);
  featureCorridorCache.set(feature, ring);
  return ring;
}

/**
 * Contorno externo da união — só para STROKE.
 * Fills continuam individuais (não vira um blob amarelo único).
 */
function unionStrokeRings(rings: [number, number][][]): [number, number][][] {
  if (!rings.length) return [];
  try {
    const geoms = rings.map((ring) => {
      const lngLat: [number, number][] = ring.map(([lat, lng]) => [lng, lat]);
      const a = lngLat[0]!;
      const z = lngLat[lngLat.length - 1]!;
      if (a[0] !== z[0] || a[1] !== z[1]) lngLat.push([a[0], a[1]]);
      return [lngLat] as polygonClipping.Polygon;
    });
    const united = polygonClipping.union(geoms[0]!, ...geoms.slice(1));
    const out: [number, number][][] = [];
    for (const poly of united) {
      // anel externo + buracos (se houver) — todos como stroke
      for (const ring of poly) {
        if (!ring || ring.length < 4) continue;
        out.push(ring.map(([lng, lat]) => [lat, lng] as [number, number]));
      }
    }
    return out;
  } catch (err) {
    console.warn("[ReaRoutesOverlay] union stroke falhou", err);
    // fallback: laterais de cada retângulo (sem capa)
    return rings.map((r) => {
      if (r.length < 4) return r;
      // aL,bL,bR,aR → laterais aL-bL e aR-bR como dois anéis abertos via polyline caller
      return r;
    });
  }
}

/** Densidade de pontos nas laterais — menos vértices em zoom afastado. */
function simplifyLatLngs(latlngs: [number, number][], zoom: number): [number, number][] {
  if (latlngs.length <= 3) return latlngs;
  const step = zoom >= 12 ? 1 : zoom >= 10 ? 2 : zoom >= 8 ? 3 : 5;
  if (step <= 1) return latlngs;
  const out: [number, number][] = [latlngs[0]];
  for (let i = step; i < latlngs.length - 1; i += step) out.push(latlngs[i]);
  out.push(latlngs[latlngs.length - 1]);
  return out;
}

function ensurePane(map: L.Map, paneName: string, zIndex: string, opacity?: string) {
  let pane = map.getPane(paneName);
  if (!pane) {
    pane = map.createPane(paneName);
    pane.style.zIndex = zIndex;
    pane.style.pointerEvents = "none";
  } else {
    pane.style.zIndex = zIndex;
    pane.style.pointerEvents = "none";
  }
  if (opacity != null) pane.style.opacity = opacity;
  return pane;
}

const LABEL_ICON_STYLE_ID = "rea-routes-label-icon-style";

function ensureLabelIconStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LABEL_ICON_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LABEL_ICON_STYLE_ID;
  style.textContent = `
    .rea-label-icon {
      background: transparent !important;
      border: none !important;
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);
}

function makeLabelIcon(html: string, rotationDeg = 0): L.DivIcon {
  // iconSize 0: o latlng fica no canto; o conteúdo real se centra com translate(-50%,-50%)
  // (antes o translate usava 50% de um box 2×2px e desalinhava traços/números).
  const inner =
    rotationDeg !== 0
      ? `<div style="transform:translate(-50%,-50%) rotate(${rotationDeg}deg);transform-origin:center center;position:absolute;left:0;top:0">${html}</div>`
      : `<div style="transform:translate(-50%,-50%);position:absolute;left:0;top:0">${html}</div>`;
  return L.divIcon({
    className: "rea-label-icon",
    html: inner,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * Overlay estilo carta CCV: bordas amarelo escuro, fill amarelo leve, nome fora,
 * altitudes com traço acima/abaixo, rumo magnético + seta.
 */
export function ReaRoutesOverlay({ kind, enabled, showEndpointMarkers = true, showLabels = true }: Props) {
  const map = useMap();
  const featuresRef = useRef<ReaRouteFeature[]>([]);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const fillRendererRef = useRef<L.Canvas | null>(null);
  const edgeRendererRef = useRef<L.Canvas | null>(null);
  const enabledRef = useRef(enabled);
  const kindRef = useRef(kind);
  const showEndpointsRef = useRef(showEndpointMarkers);
  const showLabelsRef = useRef(showLabels);
  const redrawTimer = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const lastDrawSignatureRef = useRef<string | null>(null);
  const unionCacheRef = useRef<Map<string, [number, number][][]>>(new Map());
  const fillPaneName = `rea-routes-${kind}-fill`;
  const edgePaneName = `rea-routes-${kind}-edges`;
  const labelPaneName = `rea-routes-${kind}-labels`;

  enabledRef.current = enabled;
  kindRef.current = kind;
  showEndpointsRef.current = showEndpointMarkers;
  showLabelsRef.current = showLabels;

  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
    try {
      if (interactingRef.current) return;
      ensureLabelIconStyle();
      // Fill a 3% no pane inteiro → overlaps não somam opacidade.
      ensurePane(map, fillPaneName, REA_FILL_PANE_Z, "0.03");
      ensurePane(map, edgePaneName, REA_EDGE_PANE_Z, "1");
      ensurePane(map, labelPaneName, REA_LABEL_PANE_Z);
      if (!fillRendererRef.current) {
        fillRendererRef.current = L.canvas({ padding: 0.6, pane: fillPaneName });
      }
      if (!edgeRendererRef.current) {
        edgeRendererRef.current = L.canvas({ padding: 0.6, pane: edgePaneName });
      }
      if (!groupRef.current) {
        groupRef.current = L.layerGroup().addTo(map);
      }

      const group = groupRef.current;
      if (!enabledRef.current || featuresRef.current.length === 0) {
        lastDrawSignatureRef.current = null;
        group.clearLayers();
        return;
      }
      if (!map.getSize().x || !map.getSize().y) return;

      const zoom = map.getZoom();
      const bounds = map.getBounds().pad(0.12);
      const currentKind = kindRef.current;
      const labelsOn = showLabelsRef.current && zoom >= LABEL_MIN_ZOOM;
      const showPoints = showEndpointsRef.current && zoom >= POINT_MIN_ZOOM;
      const showHdg = showLabelsRef.current && zoom >= HDG_MIN_ZOOM;
      const seenPoints = new Set<string>();
      const nameShowCount = new Map<string, number>();
      const fillRenderer = fillRendererRef.current;
      const edgeRenderer = edgeRendererRef.current;

      const fill = currentKind === "rea" ? "#fde047" : "#7dd3fc";
      const stroke = currentKind === "rea" ? "#a16207" : "#0369a1";

      const visible = featuresRef.current.filter(
        (feature) => feature.geometry && featureInBounds(feature, bounds),
      );
      if (visible.length === 0) {
        lastDrawSignatureRef.current = null;
        group.clearLayers();
        return;
      }

      const maxFill = zoom >= 11 ? 400 : zoom >= 9 ? 220 : zoom >= 7 ? 120 : 60;
      const drawList = visible.length > maxFill ? visible.slice(0, maxFill) : visible;
      const zoomBucket = Math.round(zoom * 2) / 2;
      const drawSignature = [
        currentKind,
        zoomBucket,
        labelsOn ? 1 : 0,
        showPoints ? 1 : 0,
        showHdg ? 1 : 0,
        drawList.map(featureIdentity).join("|"),
      ].join(":");
      if (drawSignature === lastDrawSignatureRef.current) return;
      lastDrawSignatureRef.current = drawSignature;
      group.clearLayers();

      const edgeWeight = zoom >= 12 ? 2.2 : zoom >= 10 ? 1.7 : zoom >= 8 ? 1.3 : 1;
      const edgeOpacity = zoom < 8 ? 0.65 : zoom < 10 ? 0.8 : 0.95;

      const built: [number, number][][] = [];

      for (const feature of drawList) {
        const props = feature.properties || {};
        const a = endpointA(props);
        const b = endpointB(props);
        if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) {
          let axis: number | null = null;
          let bestLen = 0;
          for (const ring of outerRings(feature.geometry)) {
            for (let i = 0; i < ring.length - 1; i++) {
              const [lon1, lat1] = ring[i];
              const [lon2, lat2] = ring[i + 1];
              const len2 = (lat2 - lat1) ** 2 + (lon2 - lon1) ** 2;
              if (len2 > bestLen) {
                bestLen = len2;
                axis = calcBearing(lat1, lon1, lat2, lon2);
              }
            }
          }
          if (axis == null) continue;
          for (const latlngs of corridorSideLatLngs(feature.geometry, axis)) {
            L.polyline(simplifyLatLngs(latlngs, zoom), {
              pane: edgePaneName,
              color: stroke,
              weight: edgeWeight,
              opacity: edgeOpacity,
              interactive: false,
              lineJoin: "round",
              lineCap: "butt",
              renderer: edgeRenderer,
            }).addTo(group);
          }
          continue;
        }

        const ring = getConstantWidthCorridor(feature);
        if (ring) built.push(ring);
      }

      // Fill: cada corredor separado (faixas distintas, pane 3%).
      for (const ring of built) {
        L.polygon(ring, {
          pane: fillPaneName,
          stroke: false,
          fill: true,
          fillColor: fill,
          fillOpacity: 1,
          interactive: false,
          renderer: fillRenderer,
        }).addTo(group);
      }

      // Stroke: só o contorno externo da união — sem X / pontas passando do limite.
      let strokeRings = unionCacheRef.current.get(drawSignature);
      if (!strokeRings) {
        strokeRings = unionStrokeRings(built);
        unionCacheRef.current.set(drawSignature, strokeRings);
        if (unionCacheRef.current.size > 80) {
          const oldest = unionCacheRef.current.keys().next().value;
          if (oldest) unionCacheRef.current.delete(oldest);
        }
      }
      const edgeOpts: L.PolylineOptions = {
        pane: edgePaneName,
        color: stroke,
        weight: edgeWeight,
        opacity: edgeOpacity,
        interactive: false,
        lineJoin: "round",
        lineCap: "round",
        renderer: edgeRenderer,
      };
      for (const ring of strokeRings) {
        if (ring.length >= 2) L.polyline(ring, edgeOpts).addTo(group);
      }

      if (!labelsOn && !showPoints && !showHdg) return;

      // Caps de HTML markers — DivIcons são o maior custo em SP.
      const maxNameLabels = zoom >= 12 ? 50 : 28;
      const maxAltLabels = zoom >= 12 ? 50 : 28;
      const maxHdgLabels = zoom >= 12 ? 60 : 32;
      const maxPointLabels = zoom >= 12 ? 80 : 40;
      let nameDrawn = 0;
      let altDrawn = 0;
      let hdgDrawn = 0;

      for (const feature of drawList) {
        const props = feature.properties || {};
        const a = endpointA(props);
        const b = endpointB(props);
        const mid = midLatLng(props);
        if (!mid || a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;

        const bearingAb = calcBearing(a.lat, a.lon, b.lat, b.lon);
        const alongAb = parallelPresentation(bearingAb);
        const alongBa = parallelPresentation(bearingAb + 180);
        const halfWidthM = Math.max(600, numOrNull(props.semi_largura) ?? 1400);
        const nameOutsideM = halfWidthM + Math.max(250, halfWidthM * 0.25);
        const namePos = offsetAlongBearing(mid[0], mid[1], bearingAb + 90, nameOutsideM);

        const namePx = mapFontPx(12, zoom, 20);
        const altPx = mapFontPx(10, zoom, 15);
        const hdgPx = mapFontPx(10, zoom, 14);
        const ptPx = mapFontPx(11, zoom, 17);

        if (labelsOn && namePx != null && nameDrawn < maxNameLabels) {
          const name = corridorDisplayName(props.nome);
          if (name) {
            const shown = nameShowCount.get(name) ?? 0;
            nameShowCount.set(name, shown + 1);
            if (shown % 2 === 0) {
              L.marker(namePos, {
                icon: makeLabelIcon(nameHtml(name, namePx, currentKind), alongAb.css),
                pane: labelPaneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
              nameDrawn += 1;
            }
          }
        }

        if (labelsOn && altPx != null && altDrawn < maxAltLabels) {
          const { max, min } = resolveReaAltitudes(props);
          const alt = altLimitsHtml(max, min, altPx);
          if (alt) {
            L.marker(mid, {
              icon: makeLabelIcon(alt, alongAb.css),
              pane: labelPaneName,
              interactive: false,
              keyboard: false,
            }).addTo(group);
            altDrawn += 1;
          }
        }

        if (showHdg && hdgPx != null && hdgDrawn < maxHdgLabels) {
          const rumoAb = numOrNull(props.rumoa_to_b);
          const rumoBa = numOrNull(props.rumob_to_a);
          const alongM = Math.max(1200, halfWidthM * 1.1);
          if (rumoAb != null) {
            const hdgAb = formatReaHeading(rumoAb);
            if (hdgAb) {
              const pos = offsetAlongBearing(mid[0], mid[1], bearingAb, alongM);
              L.marker(pos, {
                icon: makeLabelIcon(headingHtml(hdgAb, hdgPx, alongAb.reverse), alongAb.css),
                pane: labelPaneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
              hdgDrawn += 1;
            }
          }
          if (rumoBa != null && hdgDrawn < maxHdgLabels) {
            const hdgBa = formatReaHeading(rumoBa);
            if (hdgBa) {
              const pos = offsetAlongBearing(mid[0], mid[1], bearingAb + 180, alongM);
              L.marker(pos, {
                icon: makeLabelIcon(headingHtml(hdgBa, hdgPx, alongBa.reverse), alongBa.css),
                pane: labelPaneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
              hdgDrawn += 1;
            }
          }
        }

        if (showPoints && ptPx != null && seenPoints.size < maxPointLabels) {
          for (const end of [a, b]) {
            if (end.lat == null || end.lon == null || !end.name) continue;
            if (seenPoints.size >= maxPointLabels) break;
            const key = pointKey(end.lat, end.lon, end.name);
            if (seenPoints.has(key)) continue;
            seenPoints.add(key);
            L.marker([end.lat, end.lon], {
              icon: makeLabelIcon(pointIconHtml(end.name.toUpperCase(), ptPx)),
              pane: labelPaneName,
              interactive: false,
              keyboard: false,
            }).addTo(group);
          }
        }
      }
    } catch (err) {
      console.warn("[ReaRoutesOverlay] falha ao desenhar", err);
    }
  };

  const scheduleRedraw = (delay = 180) => {
    if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => {
      redrawTimer.current = null;
      redrawRef.current();
    }, delay);
  };

  useEffect(() => {
    ensurePane(map, fillPaneName, REA_FILL_PANE_Z, "0.03");
    ensurePane(map, edgePaneName, REA_EDGE_PANE_Z, "1");
    ensurePane(map, labelPaneName, REA_LABEL_PANE_Z);
  }, [map, fillPaneName, edgePaneName, labelPaneName]);

  useEffect(() => {
    scheduleRedraw(0);
  }, [showEndpointMarkers, showLabels]);

  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }
    return () => {
      if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
      fillRendererRef.current = null;
      edgeRendererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!enabled) {
      featuresRef.current = [];
      redrawRef.current();
      return;
    }
    let cancelled = false;
    void loadReaRoutes(kind, {
      onUpdate: (collection) => {
        if (cancelled) return;
        featuresRef.current = collection.features;
        scheduleRedraw(0);
      },
    })
      .then((collection) => {
        if (cancelled) return;
        featuresRef.current = collection.features;
        scheduleRedraw(0);
        scheduleBboxFetchRef.current();
      })
      .catch((err) => {
        console.warn("[ReaRoutesOverlay] falha ao carregar", err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, kind]);

  const bboxTimer = useRef<number | null>(null);
  const scheduleBboxFetchRef = useRef(() => {});
  scheduleBboxFetchRef.current = () => {
    if (bboxTimer.current != null) window.clearTimeout(bboxTimer.current);
    bboxTimer.current = window.setTimeout(() => {
      bboxTimer.current = null;
      if (!enabledRef.current) return;
      const b = map.getBounds();
      const pad = 0.15;
      void loadReaRoutesInBbox(kindRef.current, {
        minLng: b.getWest() - pad,
        minLat: b.getSouth() - pad,
        maxLng: b.getEast() + pad,
        maxLat: b.getNorth() + pad,
      }).then((extra) => {
        if (!extra.length || !enabledRef.current) return;
        const byId = new Map<string, ReaRouteFeature>();
        for (const f of featuresRef.current) {
          byId.set(String(f.id ?? JSON.stringify(f.properties)), f);
        }
        let added = 0;
        for (const f of extra) {
          const key = String(f.id ?? JSON.stringify(f.properties));
          if (!byId.has(key)) {
            byId.set(key, f);
            added += 1;
          }
        }
        if (added === 0) return;
        featuresRef.current = [...byId.values()];
        scheduleRedraw(0);
      });
    }, 600);
  };

  useMapEvents({
    zoomstart() {
      interactingRef.current = true;
    },
    movestart() {
      interactingRef.current = true;
    },
    moveend() {
      interactingRef.current = false;
      if (enabledRef.current) {
        scheduleRedraw(220);
        scheduleBboxFetchRef.current();
      }
    },
    zoomend() {
      interactingRef.current = false;
      if (enabledRef.current) {
        scheduleRedraw(220);
        scheduleBboxFetchRef.current();
      }
    },
  });

  useEffect(() => {
    return () => {
      if (bboxTimer.current != null) window.clearTimeout(bboxTimer.current);
    };
  }, []);

  return null;
}

export const REA_LAYER_TOGGLES = [
  {
    id: "rea" as const,
    label: "REA",
    title: "Rotas especiais VFR (REA) — nomes, rumos, altitudes e pontos",
    defaultOn: true,
  },
  {
    id: "reh" as const,
    label: "REH",
    title: "Rotas especiais de helicóptero (REH)",
    defaultOn: false,
  },
] as const;

/** No mapa de planejamento: REA ligada por padrão; REH desligada. */
export const REA_LAYER_TOGGLES_PLANNING = REA_LAYER_TOGGLES.map((t) =>
  t.id === "rea" ? { ...t, defaultOn: true } : t,
);

/** Isola falhas só do overlay REA — não deve envolver o mapa inteiro. */
export class ReaRoutesOverlayBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[ReaRoutesOverlay] boundary", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
