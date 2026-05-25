import type { VideoTelemetryPoint } from "./videoTelemetry";

export type VideoRouteMapTile = {
  href: string;
  x: number;
  y: number;
};

export type VideoRouteMapData = {
  width: number;
  height: number;
  zoom: number;
  left: number;
  top: number;
  tiles: VideoRouteMapTile[];
  routePoints: Array<{ x: number; y: number }>;
};

const tileImageCache = new Map<string, HTMLImageElement>();

function projectOsm(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function chooseOsmZoom(points: Array<{ lat: number; lon: number }>, targetWidth: number, targetHeight: number): number {
  for (let zoom = 16; zoom >= 3; zoom--) {
    const projected = points.map((point) => projectOsm(point.lat, point.lon, zoom));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    if (width <= targetWidth && height <= targetHeight) return zoom;
  }
  return 3;
}

function samplePoints<T extends { lat: number; lon: number }>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]!);
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadTileImage(href: string): Promise<HTMLImageElement> {
  const cached = tileImageCache.get(href);
  if (cached?.complete) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const existing = tileImageCache.get(href);
    if (existing) {
      existing.onload = () => resolve(existing);
      existing.onerror = () => reject(new Error("tile"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      tileImageCache.set(href, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("tile"));
    img.src = href;
    tileImageCache.set(href, img);
  });
}

export async function buildVideoRouteMap(
  points: VideoTelemetryPoint[],
  width = 320,
  height = 224,
): Promise<VideoRouteMapData | null> {
  if (points.length < 2) return null;
  const padding = 20;
  const sampled = samplePoints(points, 600);
  const zoom = chooseOsmZoom(sampled, width - padding * 2, height - padding * 2);
  const projected = sampled.map((point) => projectOsm(point.lat, point.lon, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const maxTile = 2 ** zoom;
  const tileMinX = Math.floor(left / 256);
  const tileMaxX = Math.floor((left + width) / 256);
  const tileMinY = Math.max(0, Math.floor(top / 256));
  const tileMaxY = Math.min(maxTile - 1, Math.floor((top + height) / 256));
  const tiles: VideoRouteMapTile[] = [];

  for (let tileX = tileMinX; tileX <= tileMaxX; tileX++) {
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY++) {
      const wrappedX = ((tileX % maxTile) + maxTile) % maxTile;
      const subdomain = ["a", "b", "c"][Math.abs(tileX + tileY) % 3] ?? "a";
      const tileUrl = `https://${subdomain}.tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`;
      const href = await imageUrlToDataUrl(tileUrl);
      if (!href) continue;
      tiles.push({
        href,
        x: tileX * 256 - left,
        y: tileY * 256 - top,
      });
    }
  }

  await Promise.allSettled(tiles.map((tile) => loadTileImage(tile.href)));

  return {
    width,
    height,
    zoom,
    left,
    top,
    tiles,
    routePoints: projected.map((point) => ({ x: point.x - left, y: point.y - top })),
  };
}

export function projectPointOnVideoRouteMap(
  map: VideoRouteMapData,
  lat: number,
  lon: number,
): { x: number; y: number } {
  const projected = projectOsm(lat, lon, map.zoom);
  return { x: projected.x - map.left, y: projected.y - map.top };
}

function projectFallbackRoute(points: VideoTelemetryPoint[], width: number, height: number): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const pad = 14;
  return points.map((p) => ({
    x: pad + ((p.lon - minLon) / (maxLon - minLon || 1)) * (width - pad * 2),
    y: height - pad - ((p.lat - minLat) / (maxLat - minLat || 1)) * (height - pad * 2),
  }));
}

function paintTiles(ctx: CanvasRenderingContext2D, map: VideoRouteMapData): void {
  for (const tile of map.tiles) {
    const img = tileImageCache.get(tile.href);
    if (img?.complete) {
      ctx.drawImage(img, tile.x, tile.y, 256, 256);
    }
  }
}

function paintRouteLine(ctx: CanvasRenderingContext2D, routePts: Array<{ x: number; y: number }>): void {
  if (routePts.length < 2) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
  ctx.beginPath();
  routePts.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
}

function paintMarker(
  ctx: CanvasRenderingContext2D,
  map: VideoRouteMapData | null,
  current: VideoTelemetryPoint,
  width: number,
  height: number,
): void {
  const pos = map
    ? projectPointOnVideoRouteMap(map, current.lat, current.lon)
    : projectFallbackRoute([current], width, height)[0];
  if (!pos) return;
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#0284c7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function canvasDisplaySize(canvas: HTMLCanvasElement, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width > 0 ? Math.round(rect.width * dpr) : fallbackWidth;
  const height = rect.height > 0 ? Math.round(rect.height * dpr) : fallbackHeight;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function applyRouteMapViewport(
  ctx: CanvasRenderingContext2D,
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fit: "contain" | "cover" = "cover",
): void {
  const scale =
    fit === "contain"
      ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const offsetX = (targetWidth - sourceWidth * scale) / 2;
  const offsetY = (targetHeight - sourceHeight * scale) / 2;
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
}

function routeMapPanelColor(style: "hud" | "compact", opacity: number): string {
  const rgb = style === "hud" ? "30, 58, 79" : "15, 23, 42";
  return `rgba(${rgb}, ${opacity})`;
}

/** Pinta fundo + rota (chamar quando map/points mudam). */
export function drawVideoRouteMapBase(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  fallbackStyle: "hud" | "compact",
  mapFit: "contain" | "cover" = "cover",
  panelOpacity = 1,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sourceWidth = map?.width ?? 320;
  const sourceHeight = map?.height ?? 224;
  const { width, height } = canvasDisplaySize(canvas, sourceWidth, sourceHeight);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (panelOpacity < 1) {
    ctx.fillStyle = routeMapPanelColor(fallbackStyle, panelOpacity);
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const routePts = map?.routePoints.length ? map.routePoints : projectFallbackRoute(points, sourceWidth, sourceHeight);

  ctx.save();
  applyRouteMapViewport(ctx, width, height, sourceWidth, sourceHeight, mapFit);

  if (map && map.tiles.length > 0) {
    paintTiles(ctx, map);
  } else {
    ctx.fillStyle = routeMapPanelColor(fallbackStyle, panelOpacity < 1 ? panelOpacity : 0.85);
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
  }

  paintRouteLine(ctx, routePts);
  ctx.restore();
}

/** Redesenha mapa + marcador usando tiles em cache (síncrono, sem piscar). */
export function drawVideoRouteMapMarker(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  fallbackStyle: "hud" | "compact",
  mapFit: "contain" | "cover" = "cover",
  panelOpacity = 1,
): void {
  drawVideoRouteMapBase(canvas, map, points, fallbackStyle, mapFit, panelOpacity);
  if (!current) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sourceWidth = map?.width ?? 320;
  const sourceHeight = map?.height ?? 224;
  const { width, height } = canvasDisplaySize(canvas, sourceWidth, sourceHeight);
  ctx.save();
  applyRouteMapViewport(ctx, width, height, sourceWidth, sourceHeight, mapFit);
  paintMarker(ctx, map, current, sourceWidth, sourceHeight);
  ctx.restore();
}

/** Mapa em retângulo fixo (export / overlayCanvas). Fundo opaco + rota + marcador. */
export function drawRouteMapInRect(
  ctx: CanvasRenderingContext2D,
  map: VideoRouteMapData | null,
  allPoints: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  fallbackStyle: "hud" | "compact",
  mapFit: "contain" | "cover" = "cover",
  cornerRadius = 0,
  panelOpacity = 1,
): void {
  if (destW <= 0 || destH <= 0) return;
  const sourceWidth = map?.width ?? 320;
  const sourceHeight = map?.height ?? 224;
  const routePts =
    map?.routePoints.length ? map.routePoints : projectFallbackRoute(allPoints, sourceWidth, sourceHeight);

  ctx.save();
  if (cornerRadius > 0) {
    roundRectPath(ctx, destX, destY, destW, destH, cornerRadius);
    ctx.clip();
  }

  ctx.fillStyle = routeMapPanelColor(fallbackStyle, panelOpacity);
  ctx.fillRect(destX, destY, destW, destH);

  ctx.save();
  ctx.translate(destX, destY);
  applyRouteMapViewport(ctx, destW, destH, sourceWidth, sourceHeight, mapFit);

  if (map && map.tiles.length > 0) {
    paintTiles(ctx, map);
  } else {
    ctx.fillStyle = routeMapPanelColor(fallbackStyle, panelOpacity);
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
  }

  paintRouteLine(ctx, routePts);

  if (current) {
    paintMarker(ctx, map, current, sourceWidth, sourceHeight);
  }

  ctx.restore();
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Desenho completo (export / fallback). */
export function drawVideoRouteMap(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  fallbackStyle: "hud" | "compact",
  mapFit: "contain" | "cover" = "cover",
): void {
  drawVideoRouteMapMarker(canvas, map, points, current, fallbackStyle, mapFit);
}
