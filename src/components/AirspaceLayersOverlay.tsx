import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import {
  AIRSPACE_LAYER_DEFS,
  AIRSPACE_WFS_LAYER_DEFS,
  airspaceFeatureKey,
  airspaceFeatureToInfo,
  airspaceMapLabel,
  airspaceTypeLabel,
  loadAirspaceFeaturesInBbox,
  smoothAirspaceGeometry,
  type AirspaceFeature,
  type AirspaceInfo,
} from "../lib/airspaceLayersDb";

const FILL_PANE_Z = "700";
const SELECTED_PANE_Z = "710";
const LABEL_PANE_Z = "715";
/** Offset da legenda para o interior do polígono (px). */
const LABEL_INSET_PX = 10;

/** Fill só quando selecionado (mesma cor da borda); clique na borda. */
export const AIRSPACE_STYLE = {
  fillOpacity: 0,
  fillOpacitySelected: 0.28,
  strokeOpacity: 0.95,
  weight: 2.25,
  weightSelected: 3,
  /** Distância máx. (px) do clique até a borda para selecionar. */
  edgeHitPx: 14,
} as const;

type Props = {
  enabledTypes: Record<string, boolean>;
  selectedKey: string | null;
  onSelect: (info: AirspaceInfo | null, key: string | null) => void;
};

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function ensurePane(map: L.Map, paneName: string, zIndex: string) {
  let pane = map.getPane(paneName);
  if (!pane) {
    pane = map.createPane(paneName);
    pane.style.zIndex = zIndex;
  } else {
    pane.style.zIndex = zIndex;
  }
  return pane;
}

function pathStyle(color: string, selected: boolean): L.PathOptions {
  return {
    color,
    weight: selected ? AIRSPACE_STYLE.weightSelected : AIRSPACE_STYLE.weight,
    opacity: AIRSPACE_STYLE.strokeOpacity,
    fillColor: color,
    fillOpacity: selected ? AIRSPACE_STYLE.fillOpacitySelected : AIRSPACE_STYLE.fillOpacity,
    lineJoin: "round",
    lineCap: "round",
    interactive: true,
  };
}

function distPointToSegPx(
  p: L.Point,
  a: L.Point,
  b: L.Point,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return p.distanceTo(a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = L.point(a.x + t * dx, a.y + t * dy);
  return p.distanceTo(proj);
}

function flattenLatLngs(latlngs: L.LatLng[] | L.LatLng[][] | L.LatLng[][][]): L.LatLng[][] {
  if (!latlngs?.length) return [];
  const first = latlngs[0];
  if (first instanceof L.LatLng) return [latlngs as L.LatLng[]];
  if (Array.isArray(first) && first[0] instanceof L.LatLng) return latlngs as L.LatLng[][];
  const out: L.LatLng[][] = [];
  for (const poly of latlngs as L.LatLng[][][]) {
    for (const ring of poly) out.push(ring);
  }
  return out;
}

/** true se o clique está perto da borda (não no miolo do polígono). */
function isClickNearPolygonEdge(map: L.Map, latlng: L.LatLng, layer: L.Polygon): boolean {
  const rings = flattenLatLngs(layer.getLatLngs() as L.LatLng[] | L.LatLng[][] | L.LatLng[][][]);
  const p = map.latLngToLayerPoint(latlng);
  let minPx = Infinity;
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = map.latLngToLayerPoint(ring[i]!);
      const b = map.latLngToLayerPoint(ring[(i + 1) % ring.length]!);
      minPx = Math.min(minPx, distPointToSegPx(p, a, b));
      if (minPx <= AIRSPACE_STYLE.edgeHitPx) return true;
    }
  }
  return minPx <= AIRSPACE_STYLE.edgeHitPx;
}

function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng &&
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat
  );
}

function expandBbox(b: Bbox, factor: number): Bbox {
  const w = (b.maxLng - b.minLng) * factor;
  const h = (b.maxLat - b.minLat) * factor;
  return {
    minLng: b.minLng - w,
    maxLng: b.maxLng + w,
    minLat: b.minLat - h,
    maxLat: b.maxLat + h,
  };
}

function ringCentroid(ring: L.LatLng[]): L.LatLng {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = Math.max(1, ring.length);
  for (const p of ring) {
    const lat = (p.lat * Math.PI) / 180;
    const lng = (p.lng * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  }
  x /= n;
  y /= n;
  z /= n;
  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);
  return L.latLng((lat * 180) / Math.PI, (lng * 180) / Math.PI);
}

function normalizeCssAngle(deg: number): number {
  let a = ((deg + 180) % 360) - 180;
  if (a <= -180) a += 360;
  return a;
}

/**
 * Posiciona a legenda no segmento mais longo do anel externo,
 * paralela à linha e deslocada para o interior do polígono.
 */
function placeAirspaceEdgeLabel(
  map: L.Map,
  rings: L.LatLng[][],
  text: string,
  color: string,
): L.Marker | null {
  const outer = rings[0];
  if (!outer || outer.length < 2) return null;

  let bestLen = 0;
  let bestA: L.LatLng | null = null;
  let bestB: L.LatLng | null = null;
  const count = outer.length;
  const closed =
    count > 2 &&
    outer[0]!.lat === outer[count - 1]!.lat &&
    outer[0]!.lng === outer[count - 1]!.lng;
  const n = closed ? count - 1 : count;
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    const len = map.distance(a, b);
    if (len > bestLen) {
      bestLen = len;
      bestA = a;
      bestB = b;
    }
  }
  if (!bestA || !bestB || bestLen < 80) return null;

  const mid = L.latLng((bestA.lat + bestB.lat) / 2, (bestA.lng + bestB.lng) / 2);
  const pa = map.latLngToLayerPoint(bestA);
  const pb = map.latLngToLayerPoint(bestB);
  const pm = map.latLngToLayerPoint(mid);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const lenPx = Math.sqrt(dx * dx + dy * dy) || 1;
  // Normal perpendicular (direita do sentido A→B).
  let nx = -dy / lenPx;
  let ny = dx / lenPx;
  const centroid = ringCentroid(outer);
  const pc = map.latLngToLayerPoint(centroid);
  const toCenterX = pc.x - pm.x;
  const toCenterY = pc.y - pm.y;
  // Garante que o offset aponta para dentro.
  if (nx * toCenterX + ny * toCenterY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const inset = map.layerPointToLatLng(L.point(pm.x + nx * LABEL_INSET_PX, pm.y + ny * LABEL_INSET_PX));

  let bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
  let css = normalizeCssAngle(bearing);
  if (css > 90 || css < -90) {
    css = normalizeCssAngle(css + 180);
  }

  const safe = text.replace(/[<>&"]/g, "");
  const icon = L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%) rotate(${css.toFixed(1)}deg);transform-origin:center center;pointer-events:none;white-space:nowrap;font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.04em;color:${color};text-shadow:0 0 3px rgba(15,23,42,.95),0 1px 2px rgba(0,0,0,.85);opacity:0.95">${safe}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  return L.marker(inset, {
    icon,
    interactive: false,
    keyboard: false,
    pane: "airspace-label",
  });
}

/**
 * Overlay vetorial CTA/TMA/CTR/ATZ/EAC (WFS) — cantos suavizados, fill leve,
 * borda na cor do preenchimento, clique seleciona e destaca.
 * Otimizado: canvas, geometria suavizada em cache, refetch só se sair do bbox.
 */
export function AirspaceLayersOverlay({ enabledTypes, selectedKey, onSelect }: Props) {
  const map = useMap();
  const featuresRef = useRef<AirspaceFeature[]>([]);
  const smoothedCacheRef = useRef<Map<string, AirspaceFeature>>(new Map());
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selectedKeyRef = useRef(selectedKey);
  const onSelectRef = useRef(onSelect);
  const enabledRef = useRef(enabledTypes);
  const redrawTimer = useRef<number | null>(null);
  const fetchTimer = useRef<number | null>(null);
  const lastFetchBbox = useRef<Bbox | null>(null);
  const interactingRef = useRef(false);
  const canvasRendererRef = useRef<L.Canvas | null>(null);

  selectedKeyRef.current = selectedKey;
  onSelectRef.current = onSelect;
  enabledRef.current = enabledTypes;

  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
    try {
      if (interactingRef.current) return;
      ensurePane(map, "airspace-fill", FILL_PANE_Z);
      ensurePane(map, "airspace-selected", SELECTED_PANE_Z);
      ensurePane(map, "airspace-label", LABEL_PANE_Z);
      if (!canvasRendererRef.current) {
        canvasRendererRef.current = L.canvas({ padding: 0.5 });
      }
      if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
      const group = groupRef.current;
      group.clearLayers();

      const enabled = enabledRef.current;
      const selected = selectedKeyRef.current;
      const visible = featuresRef.current.filter((f) => enabled[f.layerType.toLowerCase()] === true);
      if (!visible.length) return;

      const renderer = canvasRendererRef.current;
      const zoom = map.getZoom();
      const showLabels = zoom >= 6;

      for (const feature of visible) {
        if (!feature.geometry) continue;
        const def = AIRSPACE_LAYER_DEFS.find((d) => d.type === feature.layerType);
        const color = def?.color || "#94a3b8";
        const key = airspaceFeatureKey(feature);
        const isSelected = selected === key;

        let smoothed = smoothedCacheRef.current.get(key);
        if (!smoothed) {
          smoothed = {
            ...feature,
            geometry: smoothAirspaceGeometry(feature.geometry, 1),
          };
          smoothedCacheRef.current.set(key, smoothed);
        }

        const style = { ...pathStyle(color, isSelected), renderer };
        const layer = L.geoJSON(smoothed as GeoJSON.Feature, {
          pane: isSelected ? "airspace-selected" : "airspace-fill",
          style: () => style,
          onEachFeature(_f, lyr) {
            if (lyr instanceof L.Path) {
              lyr.setStyle(style);
              lyr.on("click", (e) => {
                if (lyr instanceof L.Polygon && !isClickNearPolygonEdge(map, e.latlng, lyr)) {
                  return;
                }
                L.DomEvent.stopPropagation(e);
                const info = airspaceFeatureToInfo(feature);
                if (selectedKeyRef.current === key) {
                  onSelectRef.current(null, null);
                } else {
                  onSelectRef.current(info, key);
                }
              });
            }
            if (showLabels && lyr instanceof L.Polygon) {
              const rings = flattenLatLngs(
                lyr.getLatLngs() as L.LatLng[] | L.LatLng[][] | L.LatLng[][][],
              );
              const label = placeAirspaceEdgeLabel(map, rings, airspaceMapLabel(feature), color);
              if (label) label.addTo(group);
            }
          },
        });
        layer.addTo(group);
      }
    } catch (err) {
      console.warn("[AirspaceLayersOverlay] falha ao desenhar", err);
    }
  };

  const scheduleRedraw = (delay = 80) => {
    if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => {
      redrawTimer.current = null;
      redrawRef.current();
    }, delay);
  };

  const scheduleFetchRef = useRef((_force = false) => {});
  scheduleFetchRef.current = (force = false) => {
    if (fetchTimer.current != null) window.clearTimeout(fetchTimer.current);
    fetchTimer.current = window.setTimeout(() => {
      fetchTimer.current = null;
      const enabled = enabledRef.current;
      const types = AIRSPACE_WFS_LAYER_DEFS.filter((d) => enabled[d.id] === true).map((d) => d.type);
      if (!types.length) {
        featuresRef.current = [];
        smoothedCacheRef.current.clear();
        lastFetchBbox.current = null;
        scheduleRedraw(0);
        return;
      }
      const b = map.getBounds();
      const view: Bbox = {
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      };
      // Já temos dados cobrindo a viewport (+ margem) — só redesenha se necessário.
      if (!force && lastFetchBbox.current && bboxContains(lastFetchBbox.current, view)) {
        return;
      }
      const bbox = expandBbox(view, 0.35);
      void Promise.all(types.map((t) => loadAirspaceFeaturesInBbox(t, bbox))).then((chunks) => {
        const byKey = new Map<string, AirspaceFeature>();
        for (const list of chunks) {
          for (const f of list) {
            byKey.set(airspaceFeatureKey(f), f);
          }
        }
        featuresRef.current = [...byKey.values()];
        // Mantém cache só das features atuais
        const nextCache = new Map<string, AirspaceFeature>();
        for (const f of featuresRef.current) {
          const k = airspaceFeatureKey(f);
          const hit = smoothedCacheRef.current.get(k);
          if (hit) nextCache.set(k, hit);
        }
        smoothedCacheRef.current = nextCache;
        lastFetchBbox.current = bbox;
        scheduleRedraw(0);
      });
    }, force ? 80 : 500);
  };

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    scheduleFetchRef.current(true);
    return () => {
      if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
      if (fetchTimer.current != null) window.clearTimeout(fetchTimer.current);
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
      canvasRendererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    lastFetchBbox.current = null;
    scheduleFetchRef.current(true);
  }, [enabledTypes]);

  useEffect(() => {
    scheduleRedraw(0);
  }, [selectedKey]);

  useMapEvents({
    zoomstart() {
      interactingRef.current = true;
    },
    movestart() {
      interactingRef.current = true;
    },
    moveend() {
      interactingRef.current = false;
      scheduleFetchRef.current(false);
    },
    zoomend() {
      interactingRef.current = false;
      scheduleFetchRef.current(false);
      scheduleRedraw(120);
    },
  });

  return null;
}

/** Painel flutuante à direita com detalhes da área selecionada. */
export function AirspaceInfoPanel({
  info,
  onClose,
}: {
  info: AirspaceInfo;
  onClose: () => void;
}) {
  const typeLabel = airspaceTypeLabel(info.type);
  const rows: Array<{ label: string; value: string }> = [
    { label: "Tipo", value: typeLabel },
    { label: "Ident", value: info.ident },
    { label: "Nome", value: info.name },
    ...(info.frequency ? [{ label: "Frequência FCA", value: info.frequency }] : []),
    ...(info.fir ? [{ label: "FIR", value: info.fir }] : []),
    ...(info.upper ? [{ label: "Limite superior", value: info.upper }] : []),
    ...(info.lower ? [{ label: "Limite inferior", value: info.lower }] : []),
    ...(info.workHours ? [{ label: "Horário de operação", value: info.workHours }] : []),
    ...(info.airspaceClass ? [{ label: "Classe", value: info.airspaceClass }] : []),
    ...(info.locality ? [{ label: "Localidade", value: info.locality }] : []),
    ...(info.remarks ? [{ label: "Observações", value: info.remarks }] : []),
  ];

  return (
    <aside
      className="pointer-events-auto flex max-h-[calc(100%-1rem)] w-[min(100%-1rem,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950 shadow-2xl shadow-black/50"
      style={{ borderTopColor: info.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: info.color }}>
            {typeLabel}
          </p>
          <p className="truncate font-mono text-sm font-bold tracking-wide text-slate-100">
            {info.ident}
          </p>
          <p className="truncate text-[11px] text-slate-400">{info.name}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={onClose}
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto px-3 py-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{row.label}</p>
            <p className="whitespace-pre-wrap break-words text-[12px] leading-snug text-slate-200">
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
