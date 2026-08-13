import * as THREE from "three";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import type { GeoPoly } from "./geoClip";
import { pointAlongRoute, type ProfilePhasePoint, type RoutePhaseMarker } from "./routePerformanceProfile";
import type { TerrainGrid } from "./terrainTiles";

export type EnuOrigin = { lat: number; lng: number };

export type Route3dMarker = {
  x: number;
  y: number;
  z: number;
  lat: number;
  lng: number;
  label: string;
  kind: "origin" | "destination" | "waypoint" | "toc" | "tod";
};

const FT_TO_M = 0.3048;
const UNL_FT = 100_000;

export function computeRouteOrigin(waypoints: Array<{ lat: number; lng: number }>): EnuOrigin | null {
  if (!waypoints.length) return null;
  let lat = 0;
  let lng = 0;
  for (const wp of waypoints) {
    lat += wp.lat;
    lng += wp.lng;
  }
  return { lat: lat / waypoints.length, lng: lng / waypoints.length };
}

function metersPerDeg(origin: EnuOrigin): { lat: number; lng: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  return {
    lat: 111_132.92,
    lng: 111_320 * Math.cos(latRad),
  };
}

export function lngLatToEnu(lat: number, lng: number, origin: EnuOrigin): { x: number; z: number } {
  const m = metersPerDeg(origin);
  return {
    x: (lng - origin.lng) * m.lng,
    z: -(lat - origin.lat) * m.lat,
  };
}

export function enuToLngLat(x: number, z: number, origin: EnuOrigin): { lat: number; lng: number } {
  const m = metersPerDeg(origin);
  return {
    lng: origin.lng + x / Math.max(1e-6, m.lng),
    lat: origin.lat - z / Math.max(1e-6, m.lat),
  };
}

export function altFtToY(altFt: number, exaggeration: number): number {
  return altFt * FT_TO_M * exaggeration;
}

export function routeSpanM(waypoints: Array<{ lat: number; lng: number }>, origin: EnuOrigin): number {
  let max = 2_000;
  for (const wp of waypoints) {
    const p = lngLatToEnu(wp.lat, wp.lng, origin);
    max = Math.max(max, Math.hypot(p.x, p.z));
  }
  return Math.max(8_000, max * 2.2 + 300_000);
}

export function sceneCeilingFt(input: {
  plannedFt?: number | null;
  terrainMaxM?: number | null;
  volumeUppersFt?: Array<number | null | undefined>;
}): number {
  let maxFt = 12_000;
  if (input.plannedFt != null && Number.isFinite(input.plannedFt)) {
    maxFt = Math.max(maxFt, input.plannedFt * 1.25);
  }
  if (input.terrainMaxM != null && Number.isFinite(input.terrainMaxM)) {
    maxFt = Math.max(maxFt, (input.terrainMaxM / FT_TO_M) * 1.2);
  }
  for (const raw of input.volumeUppersFt ?? []) {
    if (raw == null || !Number.isFinite(raw) || raw >= UNL_FT) continue;
    maxFt = Math.max(maxFt, raw);
  }
  return Math.ceil(maxFt / 500) * 500;
}

export function resolveVolumeAlts(
  lowerFt: number | null | undefined,
  upperFt: number | null | undefined,
  ceilingFt: number,
): { lowerFt: number; upperFt: number } | null {
  let lo = lowerFt == null || !Number.isFinite(lowerFt) ? 0 : lowerFt;
  let hi = upperFt == null || !Number.isFinite(upperFt) || upperFt >= UNL_FT ? ceilingFt : upperFt;
  if (lo === hi) {
    lo = Math.max(0, lo - 100);
    hi = lo + 200;
  }
  if (lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  hi = Math.min(hi, ceilingFt);
  if (hi - lo < 20) return null;
  return { lowerFt: lo, upperFt: hi };
}

export function buildRoute3dPath(
  waypoints: FlightPlanWaypoint[],
  profile: ProfilePhasePoint[] | null | undefined,
  origin: EnuOrigin,
  exaggeration: number,
): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  if (profile?.length) {
    for (const p of profile) {
      const ll = pointAlongRoute(waypoints, p.xNm);
      if (!ll) continue;
      const enu = lngLatToEnu(ll.lat, ll.lng, origin);
      points.push([enu.x, altFtToY(p.altFt, exaggeration), enu.z]);
    }
  } else {
    for (const wp of waypoints) {
      const enu = lngLatToEnu(wp.lat, wp.lng, origin);
      points.push([enu.x, altFtToY(wp.altitudeFt ?? 0, exaggeration), enu.z]);
    }
  }
  return points;
}

export function buildRoute3dMarkers(
  waypoints: FlightPlanWaypoint[],
  phaseMarkers: RoutePhaseMarker[] | null | undefined,
  origin: EnuOrigin,
  exaggeration: number,
): Route3dMarker[] {
  const out: Route3dMarker[] = [];
  waypoints.forEach((wp, idx) => {
    const enu = lngLatToEnu(wp.lat, wp.lng, origin);
    const kind = idx === 0 ? "origin" : idx === waypoints.length - 1 ? "destination" : "waypoint";
    out.push({
      x: enu.x,
      y: altFtToY(wp.altitudeFt ?? wp.fieldElevFt ?? 0, exaggeration),
      z: enu.z,
      lat: wp.lat,
      lng: wp.lng,
      label: wp.label,
      kind,
    });
  });
  for (const m of phaseMarkers ?? []) {
    const kind = m.label === "TOC" ? "toc" : m.label === "TOD" ? "tod" : null;
    if (!kind) continue;
    const enu = lngLatToEnu(m.lat, m.lng, origin);
    out.push({
      x: enu.x,
      y: altFtToY(m.altFt, exaggeration),
      z: enu.z,
      lat: m.lat,
      lng: m.lng,
      label: m.label,
      kind,
    });
  }
  return out;
}

function ringToShapePts(ring: Array<[number, number]>, origin: EnuOrigin): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (const c of ring) {
    const enu = lngLatToEnu(c[1], c[0], origin);
    pts.push({ x: enu.x, y: -enu.z });
  }
  if (pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) pts.pop();
  }
  return pts;
}

export function geometryToShapes(geometry: GeoPoly, origin: EnuOrigin): THREE.Shape[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const shapes: THREE.Shape[] = [];
  for (const rings of polygons) {
    const outer = rings[0];
    if (!outer || outer.length < 3) continue;
    const outerPts = ringToShapePts(outer, origin);
    if (outerPts.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(outerPts[0]!.x, outerPts[0]!.y);
    for (let i = 1; i < outerPts.length; i++) {
      shape.lineTo(outerPts[i]!.x, outerPts[i]!.y);
    }
    shape.closePath();
    for (let h = 1; h < rings.length; h++) {
      const holePts = ringToShapePts(rings[h]!, origin);
      if (holePts.length < 3) continue;
      const hole = new THREE.Path();
      hole.moveTo(holePts[0]!.x, holePts[0]!.y);
      for (let i = 1; i < holePts.length; i++) {
        hole.lineTo(holePts[i]!.x, holePts[i]!.y);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
    shapes.push(shape);
  }
  return shapes;
}

function terrainColor(hM: number, minM: number, maxM: number, target: THREE.Color): THREE.Color {
  if (hM <= 1.2) {
    return target.setRGB(0.07, 0.22, 0.42);
  }
  if (hM < 6) {
    const u = (hM - 1.2) / 4.8;
    return target.setRGB(0.07 + u * 0.12, 0.28 + u * 0.12, 0.42 - u * 0.18);
  }
  const landMin = Math.max(6, minM);
  const span = Math.max(1, maxM - landMin);
  const t = Math.min(1, Math.max(0, (hM - landMin) / span));
  if (t < 0.35) {
    return target.setRGB(0.22 + t * 0.35, 0.42 + t * 0.22, 0.16);
  }
  if (t < 0.7) {
    const u = (t - 0.35) / 0.35;
    return target.setRGB(0.42 + u * 0.35, 0.48 - u * 0.12, 0.22 + u * 0.12);
  }
  const u = (t - 0.7) / 0.3;
  return target.setRGB(0.78 + u * 0.18, 0.72 + u * 0.2, 0.58 + u * 0.35);
}

export function terrainBaseY(grid: TerrainGrid, exaggeration: number): number {
  const pad = Math.max(80, (grid.maxM - grid.minM) * 0.12);
  return (grid.minM - pad) * exaggeration;
}

export function geometryCentroidEnu(geometry: GeoPoly, origin: EnuOrigin): { x: number; z: number } | null {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const rings of polygons) {
    const outer = rings[0];
    if (!outer) continue;
    for (const c of outer) {
      const enu = lngLatToEnu(c[1], c[0], origin);
      sx += enu.x;
      sz += enu.z;
      n += 1;
    }
  }
  if (!n) return null;
  return { x: sx / n, z: sz / n };
}

export function buildTerrainGeometry(
  grid: TerrainGrid,
  origin: EnuOrigin,
  exaggeration: number,
): THREE.BufferGeometry {
  const { cols, rows, heightsM, west, south, east, north, minM, maxM } = grid;
  const surfaceCount = cols * rows;
  const vertCount = surfaceCount * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const color = new THREE.Color();
  const landSkirt = new THREE.Color(0.22, 0.16, 0.1);
  const seaSkirt = new THREE.Color(0.05, 0.14, 0.28);
  const width = east - west;
  const height = north - south;
  const baseY = terrainBaseY(grid, exaggeration);

  for (let r = 0; r < rows; r++) {
    const lat = south + (r / Math.max(1, rows - 1)) * height;
    for (let c = 0; c < cols; c++) {
      const lng = west + (c / Math.max(1, cols - 1)) * width;
      const h = heightsM[r * cols + c] ?? minM;
      const enu = lngLatToEnu(lat, lng, origin);
      const i = (r * cols + c) * 3;
      positions[i] = enu.x;
      positions[i + 1] = h * exaggeration;
      positions[i + 2] = enu.z;
      terrainColor(h, minM, maxM, color);
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
      const uu = cols <= 1 ? 0 : c / (cols - 1);
      const vv = rows <= 1 ? 0 : r / (rows - 1);
      uvs[(r * cols + c) * 2] = uu;
      uvs[(r * cols + c) * 2 + 1] = vv;

      const bi = (surfaceCount + r * cols + c) * 3;
      positions[bi] = enu.x;
      positions[bi + 1] = baseY;
      positions[bi + 2] = enu.z;
      const skirt = h <= 1.2 ? seaSkirt : landSkirt;
      colors[bi] = skirt.r;
      colors[bi + 1] = skirt.g;
      colors[bi + 2] = skirt.b;
      uvs[(surfaceCount + r * cols + c) * 2] = uu;
      uvs[(surfaceCount + r * cols + c) * 2 + 1] = vv;
    }
  }

  const index: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
      const ba = surfaceCount + a;
      const bb = surfaceCount + b;
      const bd = surfaceCount + d;
      const be = surfaceCount + e;
      index.push(ba, bb, bd, bb, be, bd);
    }
  }

  const pushSkirt = (top0: number, top1: number) => {
    const b0 = surfaceCount + top0;
    const b1 = surfaceCount + top1;
    index.push(top0, b0, top1, top1, b0, b1);
  };
  for (let c = 0; c < cols - 1; c++) {
    pushSkirt(c, c + 1);
    const n0 = (rows - 1) * cols + c;
    pushSkirt(n0 + 1, n0);
  }
  for (let r = 0; r < rows - 1; r++) {
    const w0 = r * cols;
    pushSkirt(w0 + cols, w0);
    const e0 = r * cols + (cols - 1);
    pushSkirt(e0, e0 + cols);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(index);
  geom.computeVertexNormals();
  return geom;
}
