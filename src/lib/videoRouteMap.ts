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

/** Pinta fundo + rota (chamar quando map/points mudam). */
export function drawVideoRouteMapBase(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  fallbackStyle: "hud" | "compact",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = map?.width ?? 320;
  const height = map?.height ?? 224;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const routePts = map?.routePoints.length ? map.routePoints : projectFallbackRoute(points, width, height);

  if (map && map.tiles.length > 0) {
    paintTiles(ctx, map);
  } else {
    ctx.fillStyle = fallbackStyle === "hud" ? "#1e3a4f" : "rgba(15,23,42,.85)";
    ctx.fillRect(0, 0, width, height);
  }

  paintRouteLine(ctx, routePts);
}

/** Redesenha mapa + marcador usando tiles em cache (síncrono, sem piscar). */
export function drawVideoRouteMapMarker(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  fallbackStyle: "hud" | "compact",
): void {
  drawVideoRouteMapBase(canvas, map, points, fallbackStyle);
  if (!current) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintMarker(ctx, map, current, map?.width ?? 320, map?.height ?? 224);
}

/** Desenho completo (export / fallback). */
export function drawVideoRouteMap(
  canvas: HTMLCanvasElement,
  map: VideoRouteMapData | null,
  points: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  fallbackStyle: "hud" | "compact",
): void {
  drawVideoRouteMapBase(canvas, map, points, fallbackStyle);
  if (current) {
    const ctx = canvas.getContext("2d");
    if (ctx) paintMarker(ctx, map, current, map?.width ?? 320, map?.height ?? 224);
  }
}
