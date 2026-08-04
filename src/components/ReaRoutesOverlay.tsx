import L from "leaflet";
import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import {
  corridorDisplayName,
  endpointA,
  endpointB,
  formatReaHeading,
  loadReaRoutes,
  numOrNull,
  pointKey,
  resolveReaAltitudes,
  type ReaRouteFeature,
  type ReaRouteKind,
  type ReaRouteProps,
} from "../lib/reaRoutesDb";

/** Abaixo do overlayPane (400) — trajeto/marcadores ficam por cima. */
const REA_PANE_Z = "350";
/** Abaixo disso, some legendas — zoom out = menos detalhe. */
const LABEL_MIN_ZOOM = 9;
const POINT_MIN_ZOOM = 10;
const HDG_MIN_ZOOM = 9;

type Props = {
  kind: ReaRouteKind;
  enabled: boolean;
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

function featureInBounds(feature: ReaRouteFeature, bounds: L.LatLngBounds): boolean {
  const a = endpointA(feature.properties || {});
  const b = endpointB(feature.properties || {});
  const pts: [number, number][] = [];
  if (a.lat != null && a.lon != null) pts.push([a.lat, a.lon]);
  if (b.lat != null && b.lon != null) pts.push([b.lat, b.lon]);
  if (pts.length === 0) return true;
  return pts.some(([lat, lon]) => bounds.contains([lat, lon]));
}

function ensurePane(map: L.Map, paneName: string, zIndex: string) {
  let pane = map.getPane(paneName);
  if (!pane) {
    pane = map.createPane(paneName);
    pane.style.zIndex = zIndex;
    pane.style.pointerEvents = "none";
  } else {
    pane.style.zIndex = zIndex;
    pane.style.pointerEvents = "none";
  }
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
    .rea-label-icon > div {
      will-change: transform;
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
export function ReaRoutesOverlay({ kind, enabled }: Props) {
  const map = useMap();
  const featuresRef = useRef<ReaRouteFeature[]>([]);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const enabledRef = useRef(enabled);
  const kindRef = useRef(kind);
  const redrawTimer = useRef<number | null>(null);
  const paneName = `rea-routes-${kind}`;

  enabledRef.current = enabled;
  kindRef.current = kind;

  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
    try {
      ensureLabelIconStyle();
      ensurePane(map, paneName, REA_PANE_Z);
      if (!groupRef.current) {
        groupRef.current = L.layerGroup().addTo(map);
      }

      const group = groupRef.current;
      group.clearLayers();
      if (!enabledRef.current || featuresRef.current.length === 0) return;
      if (!map.getSize().x || !map.getSize().y) return;

      const zoom = map.getZoom();
      const bounds = map.getBounds().pad(0.15);
      const currentKind = kindRef.current;
      const showLabels = zoom >= LABEL_MIN_ZOOM;
      const showPoints = zoom >= POINT_MIN_ZOOM;
      const showHdg = zoom >= HDG_MIN_ZOOM;
      const seenPoints = new Set<string>();
      const nameShowCount = new Map<string, number>();

      const fill = currentKind === "rea" ? "#fde047" : "#7dd3fc";
      const stroke = currentKind === "rea" ? "#a16207" : "#0369a1";

      const visible = featuresRef.current.filter(
        (feature) => feature.geometry && featureInBounds(feature, bounds),
      );
      if (visible.length === 0) return;

      // Fill sem stroke — as capas perpendiculares nas pontas não são desenhadas.
      // Laterais (paralelas ao eixo) vão como polylines separadas.
      L.geoJSON(
        { type: "FeatureCollection", features: visible } as GeoJSON.FeatureCollection,
        {
          pane: paneName,
          style: {
            stroke: false,
            fillColor: fill,
            fillOpacity: currentKind === "rea" ? 0.12 : 0.1,
            interactive: false,
          },
        },
      ).addTo(group);

      const edgeWeight = zoom >= 11 ? 2.2 : 1.6;
      for (const feature of visible) {
        const props = feature.properties || {};
        const a = endpointA(props);
        const b = endpointB(props);
        let axis: number | null = null;
        if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
          axis = calcBearing(a.lat, a.lon, b.lat, b.lon);
        } else {
          // Fallback: rumo da aresta mais longa do anel
          let bestLen = 0;
          for (const ring of outerRings(feature.geometry)) {
            for (let i = 0; i < ring.length - 1; i++) {
              const [lon1, lat1] = ring[i];
              const [lon2, lat2] = ring[i + 1];
              const dlat = lat2 - lat1;
              const dlon = lon2 - lon1;
              const len2 = dlat * dlat + dlon * dlon;
              if (len2 > bestLen) {
                bestLen = len2;
                axis = calcBearing(lat1, lon1, lat2, lon2);
              }
            }
          }
        }
        if (axis == null) continue;
        for (const latlngs of corridorSideLatLngs(feature.geometry, axis)) {
          L.polyline(latlngs, {
            pane: paneName,
            color: stroke,
            weight: edgeWeight,
            opacity: 0.95,
            interactive: false,
            lineJoin: "round",
            lineCap: "round",
          }).addTo(group);
        }
      }

      if (!showLabels && !showPoints && !showHdg) return;

      for (const feature of visible) {
        const props = feature.properties || {};
        const a = endpointA(props);
        const b = endpointB(props);
        const mid = midLatLng(props);
        if (!mid || a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;

        const bearingAb = calcBearing(a.lat, a.lon, b.lat, b.lon);
        // Orientação SEMPRE pelo eixo geográfico do corredor (paralelo às bordas)
        const alongAb = parallelPresentation(bearingAb);
        const alongBa = parallelPresentation(bearingAb + 180);
        const halfWidthM = Math.max(600, numOrNull(props.semi_largura) ?? 1400);
        // Nome FORA do corredor
        const nameOutsideM = halfWidthM + Math.max(250, halfWidthM * 0.25);
        const namePos = offsetAlongBearing(mid[0], mid[1], bearingAb + 90, nameOutsideM);

        const namePx = mapFontPx(12, zoom, 20);
        const altPx = mapFontPx(10, zoom, 15);
        const hdgPx = mapFontPx(10, zoom, 14);
        const ptPx = mapFontPx(11, zoom, 17);

        if (showLabels && namePx != null) {
          const name = corridorDisplayName(props.nome);
          if (name) {
            // Um trecho sim, um não — evita repetir o nome em todo segmento
            const shown = nameShowCount.get(name) ?? 0;
            nameShowCount.set(name, shown + 1);
            if (shown % 2 === 0) {
              L.marker(namePos, {
                icon: makeLabelIcon(nameHtml(name, namePx, currentKind), alongAb.css),
                pane: paneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
            }
          }

          if (altPx != null) {
            const { max, min } = resolveReaAltitudes(props);
            const alt = altLimitsHtml(max, min, altPx);
            if (alt) {
              L.marker(mid, {
                icon: makeLabelIcon(alt, alongAb.css),
                pane: paneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
            }
          }
        }

        if (showHdg && hdgPx != null) {
          // Só sentidos com rumo definido no AIS (mão única = um dos dois null)
          const rumoAb = numOrNull(props.rumoa_to_b);
          const rumoBa = numOrNull(props.rumob_to_a);
          // Afasta proas da altitude no centro (evita sobrepor o 4500)
          const alongM = Math.max(1200, halfWidthM * 1.1);
          if (rumoAb != null) {
            const hdgAb = formatReaHeading(rumoAb);
            if (hdgAb) {
              const pos = offsetAlongBearing(mid[0], mid[1], bearingAb, alongM);
              L.marker(pos, {
                icon: makeLabelIcon(headingHtml(hdgAb, hdgPx, alongAb.reverse), alongAb.css),
                pane: paneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
            }
          }
          if (rumoBa != null) {
            const hdgBa = formatReaHeading(rumoBa);
            if (hdgBa) {
              const pos = offsetAlongBearing(mid[0], mid[1], bearingAb + 180, alongM);
              L.marker(pos, {
                icon: makeLabelIcon(headingHtml(hdgBa, hdgPx, alongBa.reverse), alongBa.css),
                pane: paneName,
                interactive: false,
                keyboard: false,
              }).addTo(group);
            }
          }
        }

        if (showPoints && ptPx != null) {
          for (const end of [a, b]) {
            if (end.lat == null || end.lon == null || !end.name) continue;
            const key = pointKey(end.lat, end.lon, end.name);
            if (seenPoints.has(key)) continue;
            seenPoints.add(key);
            L.marker([end.lat, end.lon], {
              icon: makeLabelIcon(pointIconHtml(end.name.toUpperCase(), ptPx)),
              pane: paneName,
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

  const scheduleRedraw = () => {
    if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => {
      redrawTimer.current = null;
      redrawRef.current();
    }, 60);
  };

  useEffect(() => {
    ensurePane(map, paneName, REA_PANE_Z);
  }, [map, paneName]);

  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }
    return () => {
      if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!enabled) {
      featuresRef.current = [];
      redrawRef.current();
      return;
    }
    let cancelled = false;
    void loadReaRoutes(kind)
      .then((collection) => {
        if (cancelled) return;
        featuresRef.current = collection.features;
        scheduleRedraw();
      })
      .catch((err) => {
        console.warn("[ReaRoutesOverlay] falha ao carregar", err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, kind]);

  useMapEvents({
    moveend() {
      if (enabledRef.current) scheduleRedraw();
    },
    zoomend() {
      if (enabledRef.current) scheduleRedraw();
    },
  });

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

/** No mapa de planejamento, REA começa desligada (evita travar a aba ao abrir). */
export const REA_LAYER_TOGGLES_PLANNING = REA_LAYER_TOGGLES.map((t) =>
  t.id === "rea" ? { ...t, defaultOn: false } : t,
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
