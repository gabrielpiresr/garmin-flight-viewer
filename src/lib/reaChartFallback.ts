/**
 * CCV REA/REH sheets that exist as WMS raster but have no CV_* vector features
 * in GeoAISWEB (`CV_REA_BR_COMPLETO` / `CV_REH_BR_COMPLETO`).
 *
 * Audit (AIRAC snapshot vs WMS extents, Aug 2026):
 * - REA WH Belo Horizonte — carta WMS ok, zero features no WFS / snapshot
 * - REH WH Belo Horizonte — idem
 * - REA CY Cuiabá — carta WMS com código CY, mas vetores WY-CUIABA cobrem a mesma área
 *   (não precisa de fallback raster)
 *
 * Outside WAC mode the vector overlay cannot draw these corridors; we show the
 * chart sheets below as a transparent WMS overlay instead.
 */

export type ChartSheetExtent = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export const REA_CHART_FALLBACK_WMS_LAYERS = [
  "ICA:CCV_REA_WH_BELO_HORIZONTE",
] as const;

export const REH_CHART_FALLBACK_WMS_LAYERS = [
  "ICA:CCV_REH_WH_BELO_HORIZONTE",
] as const;

/** LatLon extents from GeoAISWEB GetCapabilities (same source as api/geoaisweb/layerExtents.js). */
export const REA_CHART_FALLBACK_EXTENTS: Record<string, ChartSheetExtent> = {
  "ICA:CCV_REA_WH_BELO_HORIZONTE": {
    minLon: -44.86666666666663,
    minLat: -20.91666666666661,
    maxLon: -42.86646401226663,
    maxLat: -18.64993795146662,
  },
  "ICA:CCV_REH_WH_BELO_HORIZONTE": {
    minLon: -44.28333333333332,
    minLat: -20.200000000000003,
    maxLon: -43.63330986833334,
    maxLat: -19.383303851666668,
  },
};

/** Proxy layerSet ids for `/api/geoaisweb/wms` (sheet-filtered). */
export type ReaChartFallbackLayerSet = "rea-fallback" | "reh-fallback";

export const REA_CHART_FALLBACK_BY_KIND = {
  rea: {
    layerSet: "rea-fallback" as const,
    layers: REA_CHART_FALLBACK_WMS_LAYERS,
    attribution: "REA WH GeoAISWEB DECEA (carta — sem vetor publicado)",
  },
  reh: {
    layerSet: "reh-fallback" as const,
    layers: REH_CHART_FALLBACK_WMS_LAYERS,
    attribution: "REH WH GeoAISWEB DECEA (carta — sem vetor publicado)",
  },
} as const;

function extentsIntersect(a: ChartSheetExtent, b: ChartSheetExtent): boolean {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

/** True when the map viewport overlaps any fallback chart sheet for the kind. */
export function viewportNeedsReaChartFallback(
  kind: "rea" | "reh",
  bounds: { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number },
  padDeg = 0.15,
): boolean {
  const view: ChartSheetExtent = {
    minLon: bounds.getWest() - padDeg,
    minLat: bounds.getSouth() - padDeg,
    maxLon: bounds.getEast() + padDeg,
    maxLat: bounds.getNorth() + padDeg,
  };
  const layers = REA_CHART_FALLBACK_BY_KIND[kind].layers;
  return layers.some((name) => {
    const ext = REA_CHART_FALLBACK_EXTENTS[name];
    return ext ? extentsIntersect(view, ext) : false;
  });
}
