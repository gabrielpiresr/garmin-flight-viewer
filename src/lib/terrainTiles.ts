import { routeBoundingBox } from "./flightPlanningRoute";

export type TerrainGrid = {
  west: number;
  south: number;
  east: number;
  north: number;
  cols: number;
  rows: number;
  /** Row 0 = south, column 0 = west. */
  heightsM: Float32Array;
  minM: number;
  maxM: number;
};

const MAX_TILES = 80;
const MAX_SAT_TILES = 36;
const TARGET_CELLS = 400;
const TILE_SIZE = 256;
/** ~160 NM de margem em cada lado. */
const PAD_DEG = 2.6;
const DEFAULT_MAX_ZOOM = 12;

export type TerrainFetchOptions = {
  signal?: AbortSignal;
  padDeg?: number;
  maxTiles?: number;
  maxSatTiles?: number;
  maxZoom?: number;
  targetCells?: number;
};

function tileUrl(z: number, x: number, y: number): string {
  if (import.meta.env.DEV) return `/terrain-proxy/${z}/${x}/${y}.png`;
  return `/api/terrain/terrarium?z=${z}&x=${x}&y=${y}`;
}

function latLngToTile(lat: number, lng: number, z: number): { x: number; y: number; xf: number; yf: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const xf = ((lng + 180) / 360) * n;
  const yf =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x: Math.floor(xf), y: Math.floor(yf), xf, yf };
}

function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

function chooseZoom(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  maxTiles = MAX_TILES,
  maxZoom = DEFAULT_MAX_ZOOM,
): number {
  const startZ = Math.min(19, Math.max(6, Math.round(maxZoom)));
  for (let z = startZ; z >= 0; z--) {
    const nw = latLngToTile(bbox.maxLat, bbox.minLng, z);
    const se = latLngToTile(bbox.minLat, bbox.maxLng, z);
    const cols = Math.abs(se.x - nw.x) + 1;
    const rows = Math.abs(se.y - nw.y) + 1;
    if (Number.isFinite(cols) && Number.isFinite(rows) && cols * rows <= maxTiles) return z;
  }
  return 0;
}

async function loadTileImageData(z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageData | null> {
  const response = await fetch(tileUrl(z, x, y), { signal });
  if (!response.ok) return null;
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

function pixelHeight(
  tiles: Map<string, ImageData>,
  tileX: number,
  tileY: number,
  px: number,
  py: number,
): number | null {
  let tx = tileX;
  let ty = tileY;
  let x = px;
  let y = py;
  if (x < 0) {
    tx -= 1;
    x += TILE_SIZE;
  } else if (x >= TILE_SIZE) {
    tx += 1;
    x -= TILE_SIZE;
  }
  if (y < 0) {
    ty -= 1;
    y += TILE_SIZE;
  } else if (y >= TILE_SIZE) {
    ty += 1;
    y -= TILE_SIZE;
  }
  const img = tiles.get(`${tx}/${ty}`);
  if (!img) return null;
  const ix = Math.min(TILE_SIZE - 1, Math.max(0, x));
  const iy = Math.min(TILE_SIZE - 1, Math.max(0, y));
  const i = (iy * TILE_SIZE + ix) * 4;
  const h = terrariumHeight(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
  if (!Number.isFinite(h) || h < -500) return null;
  return h;
}

function sampleHeight(
  tiles: Map<string, ImageData>,
  z: number,
  lat: number,
  lng: number,
): number | null {
  const t = latLngToTile(lat, lng, z);
  const fx = (t.xf - t.x) * TILE_SIZE;
  const fy = (t.yf - t.y) * TILE_SIZE;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = pixelHeight(tiles, t.x, t.y, x0, y0);
  const h10 = pixelHeight(tiles, t.x, t.y, x0 + 1, y0);
  const h01 = pixelHeight(tiles, t.x, t.y, x0, y0 + 1);
  const h11 = pixelHeight(tiles, t.x, t.y, x0 + 1, y0 + 1);
  if (h00 == null) return null;
  const a = h00;
  const b = h10 ?? h00;
  const c = h01 ?? h00;
  const d = h11 ?? h10 ?? h01 ?? h00;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function tileWindow(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  z: number,
  maxTiles: number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const nw = latLngToTile(bbox.maxLat, bbox.minLng, z);
  const se = latLngToTile(bbox.minLat, bbox.maxLng, z);
  const minX = Math.min(nw.x, se.x);
  const maxX = Math.max(nw.x, se.x);
  const minY = Math.min(nw.y, se.y);
  const maxY = Math.max(nw.y, se.y);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  if (cols < 1 || rows < 1 || cols * rows > maxTiles) return null;
  return { minX, maxX, minY, maxY };
}

export async function fetchTerrainGrid(
  waypoints: Array<{ lat: number; lng: number }>,
  options?: TerrainFetchOptions,
): Promise<TerrainGrid | null> {
  const padDeg = options?.padDeg ?? PAD_DEG;
  const maxTiles = options?.maxTiles ?? MAX_TILES;
  const maxZoom = options?.maxZoom ?? DEFAULT_MAX_ZOOM;
  const bbox = routeBoundingBox(waypoints, padDeg);
  if (!bbox) return null;
  const z = chooseZoom(bbox, maxTiles, maxZoom);
  const range = tileWindow(bbox, z, maxTiles);
  if (!range) return null;
  const { minX, maxX, minY, maxY } = range;

  const tiles = new Map<string, ImageData>();
  const jobs: Array<Promise<void>> = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      jobs.push(
        loadTileImageData(z, x, y, options?.signal).then((data) => {
          if (data) tiles.set(`${x}/${y}`, data);
        }),
      );
    }
  }
  await Promise.all(jobs);
  if (!tiles.size) return null;

  const width = Math.max(0.0001, bbox.maxLng - bbox.minLng);
  const height = Math.max(0.0001, bbox.maxLat - bbox.minLat);
  const aspect = width / height;
  const targetCells = options?.targetCells ?? TARGET_CELLS;
  const cellCap = targetCells >= 512 ? 720 : targetCells > TARGET_CELLS ? 640 : 512;
  const cols = Math.max(64, Math.min(cellCap, Math.round(targetCells * Math.sqrt(aspect))));
  const rows = Math.max(64, Math.min(cellCap, Math.round(targetCells / Math.sqrt(aspect))));
  const heightsM = new Float32Array(cols * rows);
  let minM = Infinity;
  let maxM = -Infinity;
  let filled = 0;

  for (let r = 0; r < rows; r++) {
    const lat = bbox.minLat + (r / Math.max(1, rows - 1)) * height;
    for (let c = 0; c < cols; c++) {
      const lng = bbox.minLng + (c / Math.max(1, cols - 1)) * width;
      const h = sampleHeight(tiles, z, lat, lng);
      const idx = r * cols + c;
      if (h == null) {
        heightsM[idx] = Number.NaN;
        continue;
      }
      heightsM[idx] = h;
      filled += 1;
      minM = Math.min(minM, h);
      maxM = Math.max(maxM, h);
    }
  }

  if (!filled) return null;
  if (!Number.isFinite(minM)) minM = 0;
  if (!Number.isFinite(maxM)) maxM = minM;

  fillHeightHoles(heightsM, cols, rows, minM);
  despikeHeights(heightsM, cols, rows);
  smoothHeights(heightsM, cols, rows, cols * rows < 80_000 ? 3 : 2);

  minM = Infinity;
  maxM = -Infinity;
  for (let i = 0; i < heightsM.length; i++) {
    const h = heightsM[i]!;
    minM = Math.min(minM, h);
    maxM = Math.max(maxM, h);
  }
  if (!Number.isFinite(minM)) minM = 0;
  if (!Number.isFinite(maxM)) maxM = minM;

  return {
    west: bbox.minLng,
    south: bbox.minLat,
    east: bbox.maxLng,
    north: bbox.maxLat,
    cols,
    rows,
    heightsM,
    minM,
    maxM,
  };
}

function fillHeightHoles(heights: Float32Array, cols: number, rows: number, fallback: number): void {
  const tmp = new Float32Array(heights.length);
  for (let pass = 0; pass < 12; pass++) {
    let remaining = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cur = heights[i]!;
        if (Number.isFinite(cur)) {
          tmp[i] = cur;
          continue;
        }
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
            const h = heights[rr * cols + cc]!;
            if (!Number.isFinite(h)) continue;
            sum += h;
            n += 1;
          }
        }
        if (n) tmp[i] = sum / n;
        else {
          tmp[i] = Number.NaN;
          remaining += 1;
        }
      }
    }
    heights.set(tmp);
    if (!remaining) break;
  }
  for (let i = 0; i < heights.length; i++) {
    if (!Number.isFinite(heights[i]!)) heights[i] = fallback;
  }
}

function despikeHeights(heights: Float32Array, cols: number, rows: number): void {
  const tmp = new Float32Array(heights);
  const neigh: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      neigh.length = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          neigh.push(heights[rr * cols + cc]!);
        }
      }
      if (neigh.length < 3) continue;
      const sorted = neigh.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)]!;
      let spread = 0;
      for (const n of neigh) spread = Math.max(spread, Math.abs(n - med));
      const h = heights[r * cols + c]!;
      if (Math.abs(h - med) > Math.max(180, spread * 2.5 + 40)) tmp[r * cols + c] = med;
    }
  }
  heights.set(tmp);
}

function smoothHeights(heights: Float32Array, cols: number, rows: number, passes: number): void {
  const tmp = new Float32Array(heights.length);
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const self = heights[i]!;
        if (self <= 1.2) {
          tmp[i] = self;
          continue;
        }
        const left = heights[r * cols + Math.max(0, c - 1)]!;
        const right = heights[r * cols + Math.min(cols - 1, c + 1)]!;
        tmp[i] = left * 0.25 + self * 0.5 + right * 0.25;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (heights[i]! <= 1.2) continue;
        const self = tmp[i]!;
        const up = tmp[Math.max(0, r - 1) * cols + c]!;
        const down = tmp[Math.min(rows - 1, r + 1) * cols + c]!;
        heights[i] = up * 0.25 + self * 0.5 + down * 0.25;
      }
    }
  }
}

export function sampleGridHeightM(grid: TerrainGrid, lat: number, lng: number): number {
  const width = Math.max(1e-9, grid.east - grid.west);
  const height = Math.max(1e-9, grid.north - grid.south);
  const u = (lng - grid.west) / width;
  const v = (lat - grid.south) / height;
  const c = Math.min(grid.cols - 1, Math.max(0, u * (grid.cols - 1)));
  const r = Math.min(grid.rows - 1, Math.max(0, v * (grid.rows - 1)));
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const c1 = Math.min(grid.cols - 1, c0 + 1);
  const r1 = Math.min(grid.rows - 1, r0 + 1);
  const tc = c - c0;
  const tr = r - r0;
  const h00 = grid.heightsM[r0 * grid.cols + c0] ?? grid.minM;
  const h10 = grid.heightsM[r0 * grid.cols + c1] ?? h00;
  const h01 = grid.heightsM[r1 * grid.cols + c0] ?? h00;
  const h11 = grid.heightsM[r1 * grid.cols + c1] ?? h10;
  return h00 * (1 - tc) * (1 - tr) + h10 * tc * (1 - tr) + h01 * (1 - tc) * tr + h11 * tc * tr;
}

async function loadImageryBitmap(z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageBitmap | null> {
  const urls = import.meta.env.DEV
    ? [
        `/esri-imagery-proxy/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        `/esri-proxy/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      ]
    : [`/api/esri/imagery?z=${z}&y=${y}&x=${x}`];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.size || blob.type.includes("json") || blob.type.includes("text")) continue;
      return await createImageBitmap(blob);
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}

function lngToTileXf(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

function latToTileYf(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z;
}

/** Mosaic of Esri World Imagery cropped to the terrain bbox. */
export async function fetchSatelliteCanvas(
  grid: TerrainGrid,
  options?: TerrainFetchOptions,
): Promise<HTMLCanvasElement | null> {
  const bbox = { minLng: grid.west, minLat: grid.south, maxLng: grid.east, maxLat: grid.north };
  const maxSatTiles = options?.maxSatTiles ?? MAX_SAT_TILES;
  const maxZoom = options?.maxZoom ?? DEFAULT_MAX_ZOOM;
  const z = chooseZoom(bbox, maxSatTiles, maxZoom);
  const range = tileWindow(bbox, z, maxSatTiles);
  if (!range) return null;
  const { minX, maxX, minY, maxY } = range;
  const mosaicW = (maxX - minX + 1) * TILE_SIZE;
  const mosaicH = (maxY - minY + 1) * TILE_SIZE;
  if (mosaicW > 8192 || mosaicH > 8192) return null;

  const mosaic = document.createElement("canvas");
  mosaic.width = mosaicW;
  mosaic.height = mosaicH;
  const mctx = mosaic.getContext("2d");
  if (!mctx) return null;
  mctx.fillStyle = "#1e3a5f";
  mctx.fillRect(0, 0, mosaic.width, mosaic.height);

  let loaded = 0;
  const jobs: Array<Promise<void>> = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      jobs.push(
        loadImageryBitmap(z, x, y, options?.signal).then((bmp) => {
          if (!bmp) return;
          mctx.drawImage(bmp, (x - minX) * TILE_SIZE, (y - minY) * TILE_SIZE);
          bmp.close();
          loaded += 1;
        }),
      );
    }
  }
  await Promise.all(jobs);
  if (!loaded) return null;

  const x0 = (lngToTileXf(grid.west, z) - minX) * TILE_SIZE;
  const x1 = (lngToTileXf(grid.east, z) - minX) * TILE_SIZE;
  const y0 = (latToTileYf(grid.north, z) - minY) * TILE_SIZE;
  const y1 = (latToTileYf(grid.south, z) - minY) * TILE_SIZE;
  const sx = Math.max(0, Math.min(mosaic.width - 1, x0));
  const sy = Math.max(0, Math.min(mosaic.height - 1, y0));
  const sw = Math.max(1, Math.min(mosaic.width - sx, x1 - x0));
  const sh = Math.max(1, Math.min(mosaic.height - sy, y1 - y0));

  const crop = document.createElement("canvas");
  crop.width = Math.max(256, Math.round(sw));
  crop.height = Math.max(256, Math.round(sh));
  const cctx = crop.getContext("2d");
  if (!cctx) return mosaic;
  cctx.drawImage(mosaic, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
  return crop;
}
