/** Chart tile config: XYZ pyramid (NexAtlas-style) with WMS fallback. */

export type ChartLayerSet = "wac" | "rea" | "reh";

/** AIRAC cycle folder under /charts/{airac}/… — bump when regenerating tiles. */
export const CHART_TILES_AIRAC =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_CHART_TILES_AIRAC) || "current";

/**
 * Optional absolute CDN base (no trailing slash), e.g. https://cdn.example.com/charts.
 * Empty → same-origin `/charts/{airac}/…`.
 */
export const CHART_TILES_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_CHART_TILES_BASE) || "";

export const CHART_NATIVE_ZOOM: Record<ChartLayerSet, { min: number; maxNative: number; max: number }> = {
  wac: { min: 5, maxNative: 10, max: 16 },
  rea: { min: 7, maxNative: 13, max: 16 },
  reh: { min: 8, maxNative: 14, max: 16 },
};

/** Show raster REA/REH overlays only at/above this map zoom. */
export const CHART_OVERLAY_MIN_ZOOM = 8;

export const WMS_TILE_DEFAULTS = {
  tileSize: 512,
  keepBuffer: 6,
  updateInterval: 260,
  concurrencyHint: 5,
  maxRetries: 3,
} as const;

export const WMS_LAYER_LIMITS: Record<
  ChartLayerSet | "wac-coarse",
  { maxNativeZoom: number; pixelRatio: number; keepBuffer: number; minNativeZoom?: number }
> = {
  "wac-coarse": { maxNativeZoom: 7, pixelRatio: 1, keepBuffer: 8, minNativeZoom: 4 },
  wac: { maxNativeZoom: 9, pixelRatio: 1, keepBuffer: 6 },
  rea: { maxNativeZoom: 11, pixelRatio: 1, keepBuffer: 4 },
  reh: { maxNativeZoom: 12, pixelRatio: 1, keepBuffer: 4 },
};

export type ChartTilesManifest = {
  airac: string;
  generatedAt?: string;
  layers: Partial<
    Record<
      ChartLayerSet,
      {
        format: "webp" | "png";
        minZoom: number;
        maxZoom: number;
        tileSize?: number;
      }
    >
  >;
};

let manifestPromise: Promise<ChartTilesManifest | null> | null = null;

function chartsRoot(): string {
  if (CHART_TILES_BASE) return `${CHART_TILES_BASE.replace(/\/$/, "")}/${CHART_TILES_AIRAC}`;
  return `/charts/${CHART_TILES_AIRAC}`;
}

export function chartXyzUrlTemplate(layerSet: ChartLayerSet, format: "webp" | "png" = "webp"): string {
  return `${chartsRoot()}/${layerSet}/{z}/{x}/{y}.${format}`;
}

export async function loadChartTilesManifest(force = false): Promise<ChartTilesManifest | null> {
  if (!force && manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const res = await fetch(`${chartsRoot()}/manifest.json`, { cache: "no-cache" });
      if (!res.ok) return null;
      return (await res.json()) as ChartTilesManifest;
    } catch {
      return null;
    }
  })();
  return manifestPromise;
}

export function xyzAvailableFor(manifest: ChartTilesManifest | null, layerSet: ChartLayerSet): boolean {
  return Boolean(manifest?.layers?.[layerSet]);
}
