import type { TelemetryOverlayStyle } from "../components/VideoTelemetryOverlay";

export type RouteMapRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: "contain" | "cover";
  style: "hud" | "compact";
  radius: number;
  /** 0–1; painel do mapa (9:16 usa 0.9). */
  panelOpacity: number;
};

/** Tamanho fonte para buildVideoRouteMap (tiles). */
export function routeMapSourceSize(
  frameWidth: number,
  frameHeight: number,
  isVertical: boolean,
): { w: number; h: number } {
  if (isVertical) {
    return {
      w: Math.max(120, Math.round(frameWidth * 0.48)),
      h: Math.max(96, Math.round(frameHeight * 0.2)),
    };
  }
  return { w: 320, h: 224 };
}

export function routeMapRect(
  frameWidth: number,
  frameHeight: number,
  isVertical: boolean,
  overlayStyle: TelemetryOverlayStyle,
  hasCharts: boolean,
  sx: number,
  sy: number,
): RouteMapRect | null {
  const insetL = Math.round(frameWidth * 0.015);
  const r = Math.round(4 * Math.min(sx, sy));

  if (isVertical) {
    return {
      x: insetL,
      y: Math.round(frameHeight * 0.05),
      w: Math.round(frameWidth * 0.48),
      h: Math.round(frameHeight * 0.2),
      fit: "cover",
      style: "compact",
      radius: Math.round(12 * Math.min(sx, sy)),
      panelOpacity: 0.9,
    };
  }

  const mapW = Math.min(Math.round(frameWidth * 0.28), Math.round(frameWidth * (15 / 100)));
  const mapH = hasCharts
    ? Math.round(Math.min(frameHeight * 0.2, 9.5 * 72 * sy))
    : Math.round(Math.min(frameHeight * 0.26, 12 * 72 * sy));

  return {
    x: insetL,
    y: Math.round(frameHeight * 0.015),
    w: mapW,
    h: mapH,
    fit: "cover",
    style: overlayStyle === "hud" ? "hud" : "compact",
    radius: r,
    panelOpacity: 1,
  };
}
