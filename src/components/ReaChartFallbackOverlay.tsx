import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { CHART_OVERLAY_MIN_ZOOM, WMS_LAYER_LIMITS, WMS_TILE_DEFAULTS } from "../lib/chartTiles";
import {
  REA_CHART_FALLBACK_BY_KIND,
  viewportNeedsReaChartFallback,
  type ReaChartFallbackLayerSet,
} from "../lib/reaChartFallback";
import type { ReaRouteKind } from "../lib/reaRoutesDb";

const GEOAISWEB_WMS_PROXY_BASE = "/api/geoaisweb/wms";

type Props = {
  kind: ReaRouteKind;
  enabled: boolean;
  opacity?: number;
  zIndex?: number;
};

/**
 * Raster CCV for REA/REH sheets without published vectors (WH Belo Horizonte).
 * Used on non-WAC basemaps so BH corridors remain visible.
 */
export function ReaChartFallbackOverlay({
  kind,
  enabled,
  opacity = 0.92,
  zIndex = kind === "rea" ? 640 : 660,
}: Props) {
  const map = useMap();
  const spec = REA_CHART_FALLBACK_BY_KIND[kind];
  const layerSet: ReaChartFallbackLayerSet = spec.layerSet;
  const limits = WMS_LAYER_LIMITS[kind];

  useEffect(() => {
    if (!enabled) return;

    const tileSize = WMS_TILE_DEFAULTS.tileSize;
    const wmsLayer = L.tileLayer.wms(GEOAISWEB_WMS_PROXY_BASE, {
      layers: layerSet,
      layerSet,
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      attribution: spec.attribution,
      tileSize,
      opacity,
      zIndex,
      keepBuffer: limits.keepBuffer,
      updateWhenIdle: true,
      updateWhenZooming: false,
      updateInterval: WMS_TILE_DEFAULTS.updateInterval,
      maxZoom: 18,
      maxNativeZoom: limits.maxNativeZoom,
      className: "rea-chart-fallback-tile",
      crossOrigin: true,
    } as L.WMSOptions & { layerSet: string });

    const baseGetTileUrl = wmsLayer.getTileUrl.bind(wmsLayer);
    wmsLayer.getTileUrl = (coords: L.Coords) => {
      const url = new URL(baseGetTileUrl(coords), window.location.origin);
      url.searchParams.set("width", String(tileSize));
      url.searchParams.set("height", String(tileSize));
      url.searchParams.set("layerSet", layerSet);
      url.searchParams.set("layers", layerSet);
      const sorted = new URLSearchParams(
        [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
      );
      url.search = sorted.toString();
      return url.origin === window.location.origin
        ? `${url.pathname}?${url.searchParams.toString()}`
        : url.href;
    };

    const sync = () => {
      const show =
        map.getZoom() >= CHART_OVERLAY_MIN_ZOOM &&
        viewportNeedsReaChartFallback(kind, map.getBounds());
      if (show) {
        if (!map.hasLayer(wmsLayer)) wmsLayer.addTo(map);
      } else if (map.hasLayer(wmsLayer)) {
        wmsLayer.removeFrom(map);
      }
    };

    sync();
    map.on("zoomend moveend", sync);
    return () => {
      map.off("zoomend moveend", sync);
      wmsLayer.removeFrom(map);
    };
  }, [
    enabled,
    kind,
    layerSet,
    limits.keepBuffer,
    limits.maxNativeZoom,
    map,
    opacity,
    spec.attribution,
    zIndex,
  ]);

  return null;
}
