/** WFS CTA/TMA/CTR/ATZ para desenho vetorial no mapa de planejamento. */

export type AirspaceLayerType = "CTA" | "TMA" | "CTR" | "ATZ";

export type AirspaceFeatureProps = {
  typ?: string;
  ident?: string;
  nam?: string;
  name?: string;
  icaocode?: string;
  relatedfir?: string;
  upperlimit?: number | string | null;
  uplimituni?: string | null;
  lowerlimi1?: number | string | null;
  lowerlimit?: string | null;
  codedistv1?: string | null;
  codewrkhr?: string | null;
  txtrmk_loc?: string | null;
  classrmklo?: string | null;
  txtlocalty?: string | null;
  entryrpt?: string | null;
  [key: string]: unknown;
};

export type AirspaceFeature = {
  type: "Feature";
  id?: string | number;
  properties: AirspaceFeatureProps;
  geometry: { type: string; coordinates?: unknown } | null;
  /** Layer type from which this feature was loaded. */
  layerType: AirspaceLayerType;
};

export type AirspaceFeatureCollection = {
  type: "FeatureCollection";
  features: AirspaceFeature[];
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const APP_WFS_PROXY = "/api/geoaisweb/wfs";

export const AIRSPACE_LAYER_DEFS: Array<{
  id: Lowercase<AirspaceLayerType>;
  type: AirspaceLayerType;
  layer: string;
  defaultOn: boolean;
  /** Fill / stroke base color (hex). */
  color: string;
}> = [
  { id: "cta", type: "CTA", layer: "ICA:CTA", defaultOn: false, color: "#f59e0b" },
  { id: "tma", type: "TMA", layer: "ICA:TMA", defaultOn: true, color: "#8b5cf6" },
  { id: "ctr", type: "CTR", layer: "ICA:CTR", defaultOn: true, color: "#0ea5e9" },
  { id: "atz", type: "ATZ", layer: "ICA:ATZ", defaultOn: true, color: "#10b981" },
];

function wfsBases(): string[] {
  // Em prod o GeoAISWEB bloqueia CORS no browser — usar proxy Vercel.
  return import.meta.env.DEV
    ? [DEV_PROXY_BASE, GEOAISWEB_WFS]
    : [APP_WFS_PROXY, GEOAISWEB_WFS];
}

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

async function fetchLayer(
  baseUrl: string,
  typeName: string,
  bbox: Bbox,
  layerType: AirspaceLayerType,
): Promise<AirspaceFeature[]> {
  const params =
    baseUrl === APP_WFS_PROXY
      ? new URLSearchParams({
          kind: layerType.toLowerCase(),
          bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
          maxFeatures: "200",
        })
      : new URLSearchParams({
          service: "WFS",
          version: "1.0.0",
          request: "GetFeature",
          typeName,
          bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
          outputFormat: "application/json",
          maxFeatures: "200",
        });
  const response = await fetch(`${baseUrl}?${params.toString()}`);
  if (!response.ok) throw new Error(`WFS ${typeName} falhou (${response.status})`);
  const data = (await response.json()) as {
    features?: Array<{
      type: "Feature";
      id?: string | number;
      properties?: AirspaceFeatureProps | null;
      geometry: AirspaceFeature["geometry"];
    }>;
  };
  return (data.features || []).map((f) => ({
    type: "Feature" as const,
    id: f.id,
    properties: f.properties || {},
    geometry: f.geometry,
    layerType,
  }));
}

export async function loadAirspaceFeaturesInBbox(
  layerType: AirspaceLayerType,
  bbox: Bbox,
): Promise<AirspaceFeature[]> {
  const def = AIRSPACE_LAYER_DEFS.find((d) => d.type === layerType);
  if (!def) return [];
  let lastError: unknown = null;
  for (const base of wfsBases()) {
    try {
      return await fetchLayer(base, def.layer, bbox, layerType);
    } catch (err) {
      lastError = err;
    }
  }
  console.warn("[airspaceLayersDb] falha WFS", layerType, lastError);
  return [];
}

function formatLimit(value: unknown, unit: unknown): string | null {
  if (value == null || value === "") return null;
  const u = String(unit || "").toUpperCase();
  const n = Number(value);
  if (u === "FL" && Number.isFinite(n)) return `FL${String(Math.round(n)).padStart(3, "0")}`;
  if (u === "SFC" || String(value).toUpperCase() === "SFC") return "Superfície";
  if (Number.isFinite(n) && n === 0 && (u === "FT" || u === "SFC" || !u)) return "Superfície";
  if (Number.isFinite(n)) return `${Math.round(n)} ${u || "FT"}`.trim();
  return String(value);
}

export type AirspaceInfo = {
  type: AirspaceLayerType;
  ident: string;
  name: string;
  fir: string | null;
  upper: string | null;
  lower: string | null;
  workHours: string | null;
  airspaceClass: string | null;
  remarks: string | null;
  locality: string | null;
  color: string;
};

export function airspaceFeatureToInfo(feature: AirspaceFeature): AirspaceInfo {
  const props = feature.properties || {};
  const def = AIRSPACE_LAYER_DEFS.find((d) => d.type === feature.layerType);
  const ident = String(props.ident || props.icaocode || feature.id || "").trim() || "—";
  const name = String(props.nam || props.name || ident).trim();
  const lower =
    formatLimit(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ||
    formatLimit(props.lowerlimi1, props.codedistv1);
  const upper = formatLimit(props.upperlimit, props.uplimituni || props.uomdistver);
  return {
    type: feature.layerType,
    ident,
    name,
    fir: props.relatedfir ? String(props.relatedfir) : null,
    upper,
    lower,
    workHours: props.codewrkhr ? String(props.codewrkhr) : null,
    airspaceClass: props.classrmklo ? String(props.classrmklo) : null,
    remarks: props.txtrmk_loc ? String(props.txtrmk_loc) : null,
    locality: props.txtlocalty ? String(props.txtlocalty) : null,
    color: def?.color || "#94a3b8",
  };
}

export function airspaceFeatureKey(feature: AirspaceFeature): string {
  const props = feature.properties || {};
  return `${feature.layerType}:${props.ident || ""}:${props.nam || ""}:${feature.id ?? ""}`;
}

/**
 * Suaviza anéis com Chaikin (arredonda cantos "quadradões" do WFS).
 * Conserva o primeiro/último ponto de anéis fechados.
 */
export function chaikinSmoothRing(ring: number[][], iterations = 2): number[][] {
  if (!ring || ring.length < 4) return ring;
  let pts = ring.slice();
  const closed =
    pts.length > 1 &&
    pts[0]![0] === pts[pts.length - 1]![0] &&
    pts[0]![1] === pts[pts.length - 1]![1];
  if (closed) pts = pts.slice(0, -1);
  for (let iter = 0; iter < iterations; iter++) {
    const next: number[][] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      next.push([0.75 * a[0]! + 0.25 * b[0]!, 0.75 * a[1]! + 0.25 * b[1]!]);
      next.push([0.25 * a[0]! + 0.75 * b[0]!, 0.25 * a[1]! + 0.75 * b[1]!]);
    }
    pts = next;
  }
  if (closed && pts.length) pts.push([pts[0]![0]!, pts[0]![1]!]);
  return pts;
}

export function smoothAirspaceGeometry(
  geometry: AirspaceFeature["geometry"],
  iterations = 2,
): AirspaceFeature["geometry"] {
  if (!geometry?.coordinates) return geometry;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return {
      type: "Polygon",
      coordinates: rings.map((ring) => chaikinSmoothRing(ring, iterations)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    return {
      type: "MultiPolygon",
      coordinates: polys.map((poly) => poly.map((ring) => chaikinSmoothRing(ring, iterations))),
    };
  }
  return geometry;
}
