import { Html, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import * as THREE from "three";
import { destinationPoint } from "../lib/geoClip";
import {
  buildTerrainGeometry,
  lngLatToEnu,
  terrainBaseY,
  type EnuOrigin,
} from "../lib/route3d";
import { findRunwaysByAirport, type RunwayRecord } from "../lib/runwaysDb";
import { fetchSatelliteCanvas, fetchTerrainGrid, sampleGridHeightM, type TerrainGrid } from "../lib/terrainTiles";
import type { AiswebAirportBundle, AiswebRotaer } from "../types/aisweb";
import { buildMetarCloudStations3d, type MetarCloudHit } from "../lib/route3dWeather";
import { Route3DWeatherLayers } from "./Route3DWeatherLayers";

const NM_IN_M = 1852;
const FT_TO_M = 0.3048;
const VIEW_RADIUS_NM = 10;
const VIEW_RADIUS_M = VIEW_RADIUS_NM * NM_IN_M;
const MAX_RENDERED_OBSTACLES = 70;
const MAX_LISTED_OBSTACLES = 120;
const SIM_TARGET_AGL_FT = 2000;

type SceneRunway = {
  id: string;
  ident: string;
  aIdent: string;
  bIdent: string;
  a: { lat: number; lng: number; elevFt: number | null };
  b: { lat: number; lng: number; elevFt: number | null };
  lengthM: number | null;
  widthM: number;
  surface: string | null;
};

type RunwayEndOption = {
  key: string;
  label: string;
  runway: SceneRunway;
  start: SceneRunway["a"];
  end: SceneRunway["b"];
};

type FlightSimulationConfig = {
  enabled: boolean;
  mode: "takeoff" | "landing";
  runwayKey: string;
  takeoffRunwayM: number;
  climbRateFpm: number;
  climbSpeedKt: number;
  landingMode: "angle" | "rate";
  glideAngleDeg: number;
  approachSpeedKt: number;
  descentRateFpm: number;
};

class Airport3DCanvasErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AiswebAirport3DTab canvas error", error, info.componentStack);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center bg-slate-950 px-6 text-center text-[12px] text-amber-200">
          <div>
            <p>A vista 3D encontrou um erro e foi protegida.</p>
            {this.state.error.message ? (
              <p className="mt-2 text-[10px] text-slate-400">{this.state.error.message}</p>
            ) : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Obstacle3d = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  elevM: number | null;
  distanceM: number;
  raw: string;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePtNumber(value: string): number | null {
  const raw = value.trim();
  const cleaned = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDmsCoord(match: RegExpMatchArray): { lat: number; lng: number } | null {
  const latDeg = Number(match[1]);
  const latMin = Number(match[2]);
  const latSec = Number(String(match[3]).replace(",", "."));
  const latHem = match[4];
  const lngDeg = Number(match[5]);
  const lngMin = Number(match[6]);
  const lngSec = Number(String(match[7]).replace(",", "."));
  const lngHem = match[8];
  if (![latDeg, latMin, latSec, lngDeg, lngMin, lngSec].every(Number.isFinite)) return null;
  let lat = latDeg + latMin / 60 + latSec / 3600;
  let lng = lngDeg + lngMin / 60 + lngSec / 3600;
  if (latHem?.toUpperCase() === "S") lat *= -1;
  if (lngHem?.toUpperCase() === "W") lng *= -1;
  return { lat, lng };
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function obstacleLabelFromContext(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const cut = compact.split(/\b\d+\s*[-–]\s*/).pop() || compact;
  const withoutCoord = cut.replace(/\bCOORD\b.*$/i, "").trim();
  return withoutCoord.replace(/^[\s:;,.|-]+/, "").slice(0, 44) || "Obstáculo";
}

function collectObstacleTexts(rotaer: AiswebRotaer | null): string[] {
  const sources = [
    ...(rotaer?.complements || []).map((item) => item.text),
    ...(rotaer?.remarks || []).map((item) => item.text),
  ];
  return sources.filter((text) => /\bOBST/i.test(text));
}

function parseObstacles(rotaer: AiswebRotaer | null, center: { lat: number; lng: number }): Obstacle3d[] {
  const coordRe = /(\d{2})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([NS])\s*\/\s*(\d{3})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([EW])/gi;
  const seen = new Set<string>();
  const out: Obstacle3d[] = [];
  for (const text of collectObstacleTexts(rotaer)) {
    for (const match of text.matchAll(coordRe)) {
      const parsed = parseDmsCoord(match);
      if (!parsed) continue;
      const distM = distanceM(center, parsed);
      if (distM > VIEW_RADIUS_M * 1.08) continue;
      const start = match.index ?? 0;
      const before = text.slice(Math.max(0, start - 90), start);
      const after = text.slice(start, Math.min(text.length, start + 120));
      const elevMatch = after.match(/\bELEV\s+([\d.,]+)\s*M\b/i);
      const elevM = elevMatch?.[1] ? parsePtNumber(elevMatch[1]) : null;
      const key = `${parsed.lat.toFixed(6)},${parsed.lng.toFixed(6)},${elevM ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `obs-${out.length}`,
        label: obstacleLabelFromContext(before),
        lat: parsed.lat,
        lng: parsed.lng,
        elevM,
        distanceM: distM,
        raw: `${before}${after}`.replace(/\s+/g, " ").trim(),
      });
    }
  }
  out.sort((a, b) => {
    const aHeight = a.elevM ?? 0;
    const bHeight = b.elevM ?? 0;
    const aScore = a.distanceM / VIEW_RADIUS_M - aHeight / 6000;
    const bScore = b.distanceM / VIEW_RADIUS_M - bHeight / 6000;
    return aScore - bScore;
  });
  return out;
}

function runwayFromRecord(record: RunwayRecord): SceneRunway | null {
  if (record.closed) return null;
  if (record.le.lat == null || record.le.lon == null || record.he.lat == null || record.he.lon == null) return null;
  const lengthM = record.lengthFt != null ? record.lengthFt * FT_TO_M : null;
  return {
    id: record.$id,
    ident: [record.le.ident, record.he.ident].filter(Boolean).join("/") || record.airportIdent,
    aIdent: record.le.ident || "",
    bIdent: record.he.ident || "",
    a: { lat: record.le.lat, lng: record.le.lon, elevFt: record.le.elevationFt },
    b: { lat: record.he.lat, lng: record.he.lon, elevFt: record.he.elevationFt },
    lengthM,
    widthM: 35,
    surface: record.surface,
  };
}

function runwayFallbacks(rotaer: AiswebRotaer | null): SceneRunway[] {
  if (rotaer?.lat == null || rotaer.lng == null) return [];
  const center = { lat: rotaer.lat, lng: rotaer.lng };
  return (rotaer.runways || [])
    .map((runway, index) => {
      const heading = runway.thresholds?.[0]?.headingDeg ?? null;
      const lengthM = runway.lengthM ?? null;
      if (heading == null || lengthM == null || lengthM <= 0) return null;
      const a = destinationPoint(center.lat, center.lng, (heading + 180) % 360, lengthM / 2);
      const b = destinationPoint(center.lat, center.lng, heading, lengthM / 2);
      return {
        id: `rotaer-${runway.ident}-${index}`,
        ident: runway.ident,
        aIdent: runway.thresholds?.[0]?.ident || runway.ident.split("/")[0] || "",
        bIdent: runway.thresholds?.[1]?.ident || runway.ident.split("/")[1] || "",
        a: { lat: a.lat, lng: a.lng, elevFt: rotaer.altFt },
        b: { lat: b.lat, lng: b.lng, elevFt: rotaer.altFt },
        lengthM,
        widthM: runway.widthM ?? 30,
        surface: runway.surfaceLabel || runway.surface,
      } satisfies SceneRunway;
    })
    .filter(Boolean) as SceneRunway[];
}

function runwayEndOptions(runways: SceneRunway[]): RunwayEndOption[] {
  return runways.flatMap((runway) => {
    if (!finiteLatLng(runway.a) || !finiteLatLng(runway.b)) return [];
    const aLabel = runway.aIdent || runway.ident.split("/")[0] || runway.ident;
    const bLabel = runway.bIdent || runway.ident.split("/")[1] || runway.ident;
    return [
      {
        key: `${runway.id}:a`,
        label: `${aLabel} (${runway.ident})`,
        runway,
        start: runway.a,
        end: runway.b,
      },
      {
        key: `${runway.id}:b`,
        label: `${bLabel} (${runway.ident})`,
        runway,
        start: runway.b,
        end: runway.a,
      },
    ];
  });
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function distanceForVerticalProfileM(verticalFt: number, speedKt: number, rateFpm: number): number {
  const safeRate = clampNumber(Math.abs(rateFpm), 50, 6000);
  const safeSpeed = clampNumber(Math.abs(speedKt), 10, 400);
  return (verticalFt / safeRate) * (safeSpeed / 60) * NM_IN_M;
}

function distanceForGlideAngleM(verticalFt: number, angleDeg: number): number {
  const safeAngle = clampNumber(Math.abs(angleDeg), 0.5, 8);
  return (verticalFt * FT_TO_M) / Math.tan((safeAngle * Math.PI) / 180);
}

function formatSimDistance(distanceM: number): string {
  if (distanceM >= NM_IN_M * 0.5) return `${(distanceM / NM_IN_M).toFixed(1)} NM`;
  return `${Math.round(distanceM)} m`;
}

function inputNumberOrCurrent(input: HTMLInputElement, current: number): number {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : current;
}

function finiteLatLng(point: { lat: number; lng: number } | null | undefined): point is { lat: number; lng: number } {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function finiteVec3(point: [number, number, number] | null): point is [number, number, number] {
  return !!point && point.every(Number.isFinite);
}

function formatWind(airport: AiswebAirportBundle): string {
  const parsed = airport.met.parsed;
  if (!parsed || parsed.windSpeedKt == null) return "Vento indisponível";
  const dir = parsed.windDirDeg == null ? "VRB" : String(Math.round(parsed.windDirDeg)).padStart(3, "0");
  const gust = parsed.windGustKt != null ? `G${parsed.windGustKt}` : "";
  return `${dir}° ${parsed.windSpeedKt}${gust} kt`;
}

function terrainPoints(center: { lat: number; lng: number }): Array<{ lat: number; lng: number }> {
  const points = [center];
  for (let bearing = 0; bearing < 360; bearing += 22.5) {
    points.push(destinationPoint(center.lat, center.lng, bearing, VIEW_RADIUS_M));
  }
  return points;
}

function TerrainMesh({
  grid,
  origin,
  texture,
  exaggeration,
}: {
  grid: TerrainGrid;
  origin: EnuOrigin;
  texture: THREE.Texture | null;
  exaggeration: number;
}) {
  const geometry = useMemo(() => buildTerrainGeometry(grid, origin, exaggeration), [exaggeration, grid, origin]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => {}}>
      {texture ? (
        <meshStandardMaterial key="satellite" map={texture} roughness={0.92} metalness={0} toneMapped={false} side={THREE.DoubleSide} />
      ) : (
        <meshStandardMaterial key="terrain" map={null} vertexColors roughness={0.94} metalness={0} side={THREE.DoubleSide} />
      )}
    </mesh>
  );
}

function CameraRig({ spanM }: { spanM: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | undefined;
  useLayoutEffect(() => {
    const dist = Math.max(1200, spanM * 0.72);
    camera.position.set(dist * 0.55, dist * 0.4, dist * 0.74);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(2, dist / 250);
      camera.far = Math.max(80000, spanM * 12);
      camera.updateProjectionMatrix();
    }
    controls?.target.set(0, Math.max(40, spanM * 0.01), 0);
    controls?.update();
  }, [camera, controls, spanM]);
  return null;
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}

function CanvasLifecycle() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    const onLost = (event: Event) => {
      event.preventDefault();
    };
    canvas.addEventListener("webglcontextlost", onLost, false);
    return () => {
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener("webglcontextlost", onLost, false);
    };
  }, [gl]);
  return null;
}

function AirportOrbitControls({ spanM }: { spanM: number }) {
  const coarsePointer = useCoarsePointer();
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={coarsePointer ? 0.12 : 0.08}
      enablePan
      enableRotate
      enableZoom
      zoomToCursor={!coarsePointer}
      zoomSpeed={coarsePointer ? 0.62 : 0.85}
      panSpeed={coarsePointer ? 0.72 : 1.1}
      rotateSpeed={coarsePointer ? 0.56 : 0.85}
      screenSpacePanning={coarsePointer}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      minPolarAngle={0.04}
      maxPolarAngle={Math.PI / 2 - 0.002}
      minDistance={40}
      maxDistance={spanM * 8}
    />
  );
}

function OrbitTerrainGuard({
  spanM,
  terrain,
  origin,
  exaggeration,
}: {
  spanM: number;
  terrain: TerrainGrid | null;
  origin: EnuOrigin;
  exaggeration: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | undefined;
  useFrame(() => {
    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) return;
    const cameraLl = enuToLatLng(camera.position.x, camera.position.z, origin);
    const groundM = terrain
      ? sampleGridHeightM(terrain, cameraLl.lat, cameraLl.lng)
      : 0;
    const minY = groundM * exaggeration + 35;
    let changed = false;
    if (camera.position.y < minY) {
      const lift = minY - camera.position.y;
      camera.position.y = minY;
      controls.target.y += lift;
      changed = true;
    }
    if (controls.target.y < 5) {
      controls.target.y = 5;
      changed = true;
    }
    const dist = camera.position.distanceTo(controls.target);
    const near = Math.max(1.2, Math.min(40, dist / 220));
    const far = Math.max(spanM * 12, dist * 30, 80000);
    if (Math.abs(camera.near - near) > 0.5 || Math.abs(camera.far - far) > 400) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    if (changed) controls.update();
  });
  return null;
}

function enuToLatLng(x: number, z: number, origin: EnuOrigin): { lat: number; lng: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  const metersPerLat = 111132.92;
  const metersPerLng = Math.max(1e-6, 111320 * Math.cos(latRad));
  return {
    lng: origin.lng + x / metersPerLng,
    lat: origin.lat - z / metersPerLat,
  };
}

const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _zoomRay = new THREE.Raycaster();
const _zoomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function marchRayToTerrain(
  ray: THREE.Ray,
  grid: TerrainGrid,
  origin: EnuOrigin,
  exaggeration: number,
): THREE.Vector3 | null {
  let tHit: number | null = null;
  let prevAbove = true;
  const tMax = 380000;
  for (let i = 1; i <= 40; i++) {
    const t = 12 * Math.pow(tMax / 12, i / 40);
    const x = ray.origin.x + ray.direction.x * t;
    const y = ray.origin.y + ray.direction.y * t;
    const z = ray.origin.z + ray.direction.z * t;
    const ll = enuToLatLng(x, z, origin);
    if (ll.lat < grid.south || ll.lat > grid.north || ll.lng < grid.west || ll.lng > grid.east) {
      prevAbove = y > 0;
      continue;
    }
    const ground = sampleGridHeightM(grid, ll.lat, ll.lng) * exaggeration;
    const above = y > ground + 4;
    if (prevAbove && !above) {
      tHit = t;
      break;
    }
    prevAbove = above;
  }
  if (tHit == null) return null;
  let lo = tHit * 0.7;
  let hi = tHit;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const x = ray.origin.x + ray.direction.x * mid;
    const y = ray.origin.y + ray.direction.y * mid;
    const z = ray.origin.z + ray.direction.z * mid;
    const ll = enuToLatLng(x, z, origin);
    const ground = sampleGridHeightM(grid, ll.lat, ll.lng) * exaggeration;
    if (y > ground + 4) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return _hit.set(
    ray.origin.x + ray.direction.x * t,
    ray.origin.y + ray.direction.y * t,
    ray.origin.z + ray.direction.z * t,
  );
}

function TerrainZoom({
  terrain,
  origin,
  exaggeration,
  spanM,
}: {
  terrain: TerrainGrid | null;
  origin: EnuOrigin;
  exaggeration: number;
  spanM: number;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | undefined;
  useEffect(() => {
    const canvas = gl.domElement;
    const root = canvas.parentElement ?? canvas;
    const applyZoomAt = (clientX: number, clientY: number, zoomIn: boolean, notches: number) => {
      if (!controls) return;
      const rect = canvas.getBoundingClientRect();
      _ndc.set(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      _zoomRay.setFromCamera(_ndc, camera);
      let hit: THREE.Vector3 | null = null;
      if (terrain) hit = marchRayToTerrain(_zoomRay.ray, terrain, origin, exaggeration);
      if (!hit) {
        _zoomPlane.constant = -controls.target.y;
        hit = _zoomRay.ray.intersectPlane(_zoomPlane, _hit);
      }
      if (!hit) hit = _hit.copy(controls.target);

      const minDist = 50;
      const maxDist = Math.max(spanM * 8, 40000);
      const dist = camera.position.distanceTo(hit);
      const k = 1 - Math.pow(0.92, Math.max(0.05, notches));

      if (zoomIn) {
        camera.position.lerp(hit, k);
        if (camera.position.distanceTo(hit) < minDist) {
          camera.position.sub(hit).setLength(minDist).add(hit);
        }
        controls.target.lerp(hit, k);
      } else {
        const scale = 1 / Math.max(0.2, 1 - k);
        const next = Math.min(maxDist, Math.max(dist, minDist) * scale);
        if (dist > 1e-3) {
          camera.position.sub(hit).setLength(next).add(hit);
        } else {
          camera.position.addScaledVector(_zoomRay.ray.direction, -next);
        }
      }

      if (terrain) {
        const ll = enuToLatLng(camera.position.x, camera.position.z, origin);
        const ground = sampleGridHeightM(terrain, ll.lat, ll.lng) * exaggeration;
        if (camera.position.y < ground + 20) camera.position.y = ground + 20;
      }
      controls.update();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const notches = Math.min(2, Math.abs(event.deltaY) / 120);
      applyZoomAt(event.clientX, event.clientY, event.deltaY < 0, notches);
    };

    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      root.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [camera, controls, exaggeration, gl, origin, spanM, terrain]);
  return null;
}

function RangeRings({
  center,
  terrain,
  origin,
  exaggeration,
}: {
  center: { lat: number; lng: number; altFt: number | null };
  terrain: TerrainGrid | null;
  origin: EnuOrigin;
  exaggeration: number;
}) {
  const radiiNm = [1, 2, 4, 8];
  const rings = useMemo(
    () =>
      radiiNm.map((radiusNm) => {
        const radiusM = radiusNm * NM_IN_M;
        const points: Array<[number, number, number]> = [];
        for (let bearing = 0; bearing <= 360; bearing += 5) {
          const ll = destinationPoint(center.lat, center.lng, bearing, radiusM);
          const p = lngLatToEnu(ll.lat, ll.lng, origin);
          const groundM = terrain ? sampleGridHeightM(terrain, ll.lat, ll.lng) : (center.altFt ?? 0) * FT_TO_M;
          points.push([p.x, groundM * exaggeration + 14, p.z]);
        }
        const labelLl = destinationPoint(center.lat, center.lng, 45, radiusM);
        const labelP = lngLatToEnu(labelLl.lat, labelLl.lng, origin);
        const labelGroundM = terrain ? sampleGridHeightM(terrain, labelLl.lat, labelLl.lng) : (center.altFt ?? 0) * FT_TO_M;
        return {
          radiusNm,
          points,
          labelPosition: [labelP.x, labelGroundM * exaggeration + 42, labelP.z] as [number, number, number],
        };
      }),
    [center.altFt, center.lat, center.lng, exaggeration, origin, terrain],
  );
  return (
    <group>
      {rings.map((ring) => (
        <group key={ring.radiusNm}>
        <Line
          points={ring.points}
          color="#facc15"
          lineWidth={1}
          transparent
          opacity={0.38}
          depthWrite={false}
        />
        <Html center position={ring.labelPosition} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
          <span className="whitespace-nowrap rounded border border-yellow-300/35 bg-slate-950/75 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-yellow-200 shadow">
            {ring.radiusNm} NM
          </span>
        </Html>
        </group>
      ))}
    </group>
  );
}

function RunwayMesh({ runway, grid, origin, exaggeration }: { runway: SceneRunway; grid: TerrainGrid | null; origin: EnuOrigin; exaggeration: number }) {
  const a = lngLatToEnu(runway.a.lat, runway.a.lng, origin);
  const b = lngLatToEnu(runway.b.lat, runway.b.lng, origin);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.max(60, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const groundA = grid ? sampleGridHeightM(grid, runway.a.lat, runway.a.lng) : (runway.a.elevFt ?? 0) * FT_TO_M;
  const groundB = grid ? sampleGridHeightM(grid, runway.b.lat, runway.b.lng) : (runway.b.elevFt ?? 0) * FT_TO_M;
  const y = Math.max(groundA, groundB) * exaggeration + 3;
  const paved = /asp|conc|paved|asphalt|concreto|cimento/i.test(runway.surface || "");
  const thresholdInset = Math.min(Math.max(length * 0.16, 48), 180);
  const textSize = Math.min(Math.max(runway.widthM * 0.72, 16), 38);
  return (
    <group position={[(a.x + b.x) / 2, y, (a.z + b.z) / 2]} rotation={[0, yaw, 0]}>
      <mesh raycast={() => {}}>
        <boxGeometry args={[Math.max(18, runway.widthM), 3, length]} />
        <meshStandardMaterial color={paved ? "#5b6472" : "#9a8f80"} roughness={0.82} />
      </mesh>
      <Line points={[[0, 5, -length / 2], [0, 5, length / 2]]} color="#f8fafc" lineWidth={2} />
      {runway.aIdent ? (
        <Text
          position={[0, 8, -length / 2 + thresholdInset]}
          rotation={[-Math.PI / 2, 0, Math.PI]}
          fontSize={textSize}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
        >
          {runway.aIdent}
          <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} depthWrite={false} />
        </Text>
      ) : null}
      {runway.bIdent ? (
        <Text
          position={[0, 8, length / 2 - thresholdInset]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={textSize}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
        >
          {runway.bIdent}
          <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} depthWrite={false} />
        </Text>
      ) : null}
      <Html center position={[0, 20, 0]} style={{ pointerEvents: "none" }}>
        <span className="rounded bg-slate-950/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow">
          {runway.ident}
        </span>
      </Html>
    </group>
  );
}

function ObstacleMarker({ obstacle, grid, origin, exaggeration }: { obstacle: Obstacle3d; grid: TerrainGrid | null; origin: EnuOrigin; exaggeration: number }) {
  const [hovered, setHovered] = useState(false);
  const gl = useThree((s) => s.gl);
  const p = lngLatToEnu(obstacle.lat, obstacle.lng, origin);
  const groundM = grid ? sampleGridHeightM(grid, obstacle.lat, obstacle.lng) : 0;
  const topM = Math.max(obstacle.elevM ?? groundM + 35, groundM + 18);
  const baseY = groundM * exaggeration + 3;
  const height = Math.max(18, (topM - groundM) * exaggeration);
  const color = obstacle.elevM != null && obstacle.elevM - groundM > 120 ? "#ef4444" : "#f97316";
  return (
    <group position={[p.x, baseY, p.z]}>
      <mesh
        position={[0, height / 2, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          gl.domElement.style.cursor = "pointer";
          setHovered(true);
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "auto";
          setHovered(false);
        }}
      >
        <cylinderGeometry args={[7, 10, height, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.35} />
      </mesh>
      <mesh
        position={[0, height + 8, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          gl.domElement.style.cursor = "pointer";
          setHovered(true);
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "auto";
          setHovered(false);
        }}
      >
        <sphereGeometry args={[13, 8, 8]} />
        <meshStandardMaterial color="#fecaca" emissive="#ef4444" emissiveIntensity={0.55} />
      </mesh>
      {hovered ? (
      <Html center position={[0, height + 48, 0]} style={{ pointerEvents: "none" }}>
        <span className="block max-w-[9rem] rounded border border-red-400/40 bg-slate-950/90 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-red-100 shadow">
          {obstacle.label}
          {obstacle.elevM != null ? <span className="block font-mono text-[9px] text-red-200">{Math.round(obstacle.elevM)} m</span> : null}
        </span>
      </Html>
      ) : null}
    </group>
  );
}

function WindArrow({ airport, origin, terrain, exaggeration }: { airport: AiswebAirportBundle; origin: EnuOrigin; terrain: TerrainGrid | null; exaggeration: number }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const gl = useThree((s) => s.gl);
  const parsed = airport.met.parsed;
  const lat = airport.rotaer?.lat;
  const lng = airport.rotaer?.lng;
  if (lat == null || lng == null || !parsed || parsed.windDirDeg == null || parsed.windSpeedKt == null) return null;
  const centerGround = terrain ? sampleGridHeightM(terrain, lat, lng) : (airport.rotaer?.altFt ?? 0) * FT_TO_M;
  const y = centerGround * exaggeration + 82;
  const from = destinationPoint(lat, lng, parsed.windDirDeg, VIEW_RADIUS_M * 0.019);
  const to = destinationPoint(lat, lng, (parsed.windDirDeg + 180) % 360, VIEW_RADIUS_M * 0.019);
  const a = lngLatToEnu(from.lat, from.lng, origin);
  const b = lngLatToEnu(to.lat, to.lng, origin);
  const start = new THREE.Vector3(a.x, y, a.z);
  const end = new THREE.Vector3(b.x, y, b.z);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1) return null;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const showTooltip = hovered || pinned;
  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    gl.domElement.style.cursor = "pointer";
    setHovered(true);
  };
  const handlePointerOut = () => {
    gl.domElement.style.cursor = "auto";
    setHovered(false);
  };
  return (
    <group>
      <mesh position={mid} quaternion={quaternion}>
        <cylinderGeometry args={[3.5, 3.5, length, 10]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.4} roughness={0.35} />
      </mesh>
      <mesh
        position={[(a.x + b.x) / 2, y, (a.z + b.z) / 2]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={(event) => {
          event.stopPropagation();
          setPinned((value) => !value);
        }}
      >
        <sphereGeometry args={[85, 10, 10]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.002} depthWrite={false} />
      </mesh>
      <mesh
        position={end}
        quaternion={quaternion}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={(event) => {
          event.stopPropagation();
          setPinned((value) => !value);
        }}
      >
        <coneGeometry args={[15, 34, 12]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#0284c7" emissiveIntensity={0.45} roughness={0.4} />
      </mesh>
      {showTooltip ? (
      <Html center position={[(a.x + b.x) / 2, y + 34, (a.z + b.z) / 2]} style={{ pointerEvents: "none" }}>
        <span className="block whitespace-nowrap rounded-full border border-sky-300/50 bg-slate-950/90 px-2 py-0.5 text-[11px] font-bold leading-none text-sky-100 shadow">
          Vento {formatWind(airport)}
        </span>
      </Html>
      ) : null}
    </group>
  );
}

function initialBearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function StablePathLine({
  points,
  color,
  opacity = 1,
}: {
  points: Array<[number, number, number]>;
  color: string;
  opacity?: number;
}) {
  const line = useMemo(() => {
    const flat = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      flat[index * 3] = point[0];
      flat[index * 3 + 1] = point[1];
      flat[index * 3 + 2] = point[2];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(flat, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const next = new THREE.Line(geometry, material);
    next.frustumCulled = false;
    return next;
  }, [color, opacity, points]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      if (Array.isArray(line.material)) line.material.forEach((material) => material.dispose());
      else line.material.dispose();
    },
    [line],
  );

  return <primitive object={line} />;
}

function SimulationPath({
  airport,
  simulation,
  runways,
  terrain,
  origin,
  exaggeration,
}: {
  airport: AiswebAirportBundle;
  simulation: FlightSimulationConfig;
  runways: SceneRunway[];
  terrain: TerrainGrid | null;
  origin: EnuOrigin;
  exaggeration: number;
}) {
  const options = useMemo(() => runwayEndOptions(runways), [runways]);
  const runwayEnd = useMemo(() => options.find((option) => option.key === simulation.runwayKey) ?? null, [options, simulation.runwayKey]);
  const path = useMemo(() => {
    if (!simulation.enabled || !runwayEnd) return null;
    if (!finiteLatLng(runwayEnd.start) || !finiteLatLng(runwayEnd.end)) return null;
    const heading = initialBearingDeg(runwayEnd.start, runwayEnd.end);
    if (!Number.isFinite(heading)) return null;
    const adGroundM = terrain
      ? sampleGridHeightM(terrain, airport.rotaer?.lat ?? runwayEnd.start.lat, airport.rotaer?.lng ?? runwayEnd.start.lng)
      : (airport.rotaer?.altFt ?? runwayEnd.start.elevFt ?? 0) * FT_TO_M;
    if (!Number.isFinite(adGroundM)) return null;
    const targetAglM = SIM_TARGET_AGL_FT * FT_TO_M;
    const color = simulation.mode === "takeoff" ? "#fb923c" : "#34d399";
    const points: Array<[number, number, number]> = [];
    const maxProfileDistanceM = VIEW_RADIUS_M * 0.96;
    const samplePoint = (ll: { lat: number; lng: number }, aglM: number): [number, number, number] | null => {
      if (!finiteLatLng(ll) || !Number.isFinite(aglM)) return null;
      const p = lngLatToEnu(ll.lat, ll.lng, origin);
      const terrainGroundM = terrain ? sampleGridHeightM(terrain, ll.lat, ll.lng) : adGroundM;
      const plannedY = (adGroundM + aglM) * exaggeration + 22;
      const point: [number, number, number] = [p.x, Math.max(plannedY, terrainGroundM * exaggeration + 22), p.z];
      return finiteVec3(point) ? point : null;
    };
    const addPoint = (ll: { lat: number; lng: number }, aglM: number) => {
      const point = samplePoint(ll, aglM);
      if (point) points.push(point);
    };

    if (simulation.mode === "takeoff") {
      const rollM = clampNumber(simulation.takeoffRunwayM, 0, 6000);
      const rawClimbDistanceM = distanceForVerticalProfileM(SIM_TARGET_AGL_FT, simulation.climbSpeedKt, simulation.climbRateFpm);
      const climbDistanceM = clampNumber(rawClimbDistanceM, 1, Math.max(1, maxProfileDistanceM - rollM));
      const rollSteps = Math.max(2, Math.ceil(rollM / 180));
      for (let i = 0; i <= rollSteps; i++) {
        const ll = destinationPoint(runwayEnd.start.lat, runwayEnd.start.lng, heading, (rollM * i) / rollSteps);
        addPoint(ll, 0);
      }
      const climbSteps = Math.max(8, Math.ceil(climbDistanceM / 450));
      for (let i = 1; i <= climbSteps; i++) {
        const t = i / climbSteps;
        const ll = destinationPoint(runwayEnd.start.lat, runwayEnd.start.lng, heading, rollM + climbDistanceM * t);
        addPoint(ll, targetAglM * t);
      }
      const endLl = destinationPoint(runwayEnd.start.lat, runwayEnd.start.lng, heading, rollM + climbDistanceM);
      const labelPosition = samplePoint(endLl, targetAglM);
      if (!labelPosition || points.length < 2) return null;
      return {
        key: `${simulation.mode}:${runwayEnd.key}:${rollM}:${climbDistanceM}`,
        color,
        points,
        label: `Decolagem ${runwayEnd.label} · ${formatSimDistance(rollM)} pista · ${formatSimDistance(climbDistanceM)} subida`,
        labelPosition,
      };
    }

    const rawApproachDistanceM =
      simulation.landingMode === "angle"
        ? distanceForGlideAngleM(SIM_TARGET_AGL_FT, simulation.glideAngleDeg)
        : distanceForVerticalProfileM(SIM_TARGET_AGL_FT, simulation.approachSpeedKt, simulation.descentRateFpm);
    const approachDistanceM = clampNumber(rawApproachDistanceM, 1, maxProfileDistanceM);
    const steps = Math.max(10, Math.ceil(approachDistanceM / 420));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ll = destinationPoint(runwayEnd.start.lat, runwayEnd.start.lng, (heading + 180) % 360, approachDistanceM * (1 - t));
      addPoint(ll, targetAglM * (1 - t));
    }
    const startLl = destinationPoint(runwayEnd.start.lat, runwayEnd.start.lng, (heading + 180) % 360, approachDistanceM);
    const labelPosition = samplePoint(startLl, targetAglM);
    if (!labelPosition || points.length < 2) return null;
    return {
      key: `${simulation.mode}:${runwayEnd.key}:${simulation.landingMode}:${approachDistanceM}`,
      color,
      points,
      label:
        simulation.landingMode === "angle"
          ? `Pouso ${runwayEnd.label} · ${simulation.glideAngleDeg.toFixed(1)}° · ${formatSimDistance(approachDistanceM)}`
          : `Pouso ${runwayEnd.label} · ${simulation.descentRateFpm} fpm · ${formatSimDistance(approachDistanceM)}`,
      labelPosition,
    };
  }, [airport.rotaer?.altFt, airport.rotaer?.lat, airport.rotaer?.lng, exaggeration, origin, runwayEnd, simulation, terrain]);

  if (!path || path.points.length < 2) return null;
  const first = path.points[0];
  const last = path.points[path.points.length - 1];
  return (
    <group key={path.key}>
      <StablePathLine points={path.points} color={path.color} opacity={0.92} />
      {[first, last].map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[34, 12, 12]} />
          <meshStandardMaterial color={path.color} emissive={path.color} emissiveIntensity={0.35} roughness={0.35} />
        </mesh>
      ))}
      <Html center position={path.labelPosition} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span className="block whitespace-nowrap rounded-full border border-white/25 bg-slate-950/90 px-2 py-1 text-[11px] font-bold leading-none text-white shadow">
          {path.label}
        </span>
      </Html>
    </group>
  );
}

function AirportScene({
  airport,
  terrain,
  texture,
  runways,
  obstacles,
  simulation,
  showMetar,
  onSelectMetar,
}: {
  airport: AiswebAirportBundle;
  terrain: TerrainGrid | null;
  texture: THREE.Texture | null;
  runways: SceneRunway[];
  obstacles: Obstacle3d[];
  simulation: FlightSimulationConfig;
  showMetar: boolean;
  onSelectMetar: (hit: MetarCloudHit) => void;
}) {
  const lat = airport.rotaer?.lat ?? 0;
  const lng = airport.rotaer?.lng ?? 0;
  const origin = useMemo(() => ({ lat, lng }), [lat, lng]);
  const exaggeration = 2.4;
  const spanM = VIEW_RADIUS_M * 2.35;
  const metarStations = useMemo(
    () =>
      showMetar
        ? buildMetarCloudStations3d({
            mets: [airport.met],
            fixes: [
              {
                icao: airport.icao,
                lat,
                lng,
                elevFt: airport.rotaer?.altFt ?? null,
              },
            ],
            origin,
            exaggeration,
            terrain,
          })
        : [],
    [airport.icao, airport.met, airport.rotaer?.altFt, exaggeration, lat, lng, origin, showMetar, terrain],
  );
  return (
    <>
      <color attach="background" args={["#07111f"]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#dbeafe", "#2f1f12", 0.45]} />
      <directionalLight position={[9000, 13000, 7000]} intensity={1.2} />
      <CanvasLifecycle />
      <CameraRig spanM={spanM} />
      <AirportOrbitControls spanM={spanM} />
      <OrbitTerrainGuard spanM={spanM} terrain={terrain} origin={origin} exaggeration={exaggeration} />
      <TerrainZoom terrain={terrain} origin={origin} exaggeration={exaggeration} spanM={spanM} />
      {terrain ? (
        <>
          <TerrainMesh grid={terrain} origin={origin} texture={texture} exaggeration={exaggeration} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, terrainBaseY(terrain, exaggeration) - 5, 0]} raycast={() => {}}>
            <planeGeometry args={[spanM * 2, spanM * 2]} />
            <meshStandardMaterial color="#111827" roughness={1} />
          </mesh>
        </>
      ) : null}
      <RangeRings
        center={{ lat, lng, altFt: airport.rotaer?.altFt ?? null }}
        terrain={terrain}
        origin={origin}
        exaggeration={exaggeration}
      />
      {runways.map((runway) => (
        <RunwayMesh key={runway.id} runway={runway} grid={terrain} origin={origin} exaggeration={exaggeration} />
      ))}
      <SimulationPath
        airport={airport}
        simulation={simulation}
        runways={runways}
        terrain={terrain}
        origin={origin}
        exaggeration={exaggeration}
      />
      {obstacles.map((obstacle) => (
        <ObstacleMarker key={obstacle.id} obstacle={obstacle} grid={terrain} origin={origin} exaggeration={exaggeration} />
      ))}
      <WindArrow airport={airport} origin={origin} terrain={terrain} exaggeration={exaggeration} />
      <Route3DWeatherLayers
        metarStations={metarStations}
        routeSamples={[]}
        showMetar={showMetar}
        showRouteClouds={false}
        skipMid
        exaggeration={exaggeration}
        onSelectMetar={onSelectMetar}
        onSelectRouteCloud={() => {}}
      />
    </>
  );
}

type Basemap3D = "terrain" | "satellite";

export function AiswebAirport3DTab({ airport }: { airport: AiswebAirportBundle }) {
  const coarsePointer = useCoarsePointer();
  const [terrain, setTerrain] = useState<TerrainGrid | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [runwayRecords, setRunwayRecords] = useState<RunwayRecord[]>([]);
  const [basemap, setBasemap] = useState<Basemap3D>("terrain");
  const [showMetar, setShowMetar] = useState(false);
  const [selectedMetar, setSelectedMetar] = useState<MetarCloudHit | null>(null);
  const [simulation, setSimulation] = useState<FlightSimulationConfig>({
    enabled: false,
    mode: "takeoff",
    runwayKey: "",
    takeoffRunwayM: 600,
    climbRateFpm: 300,
    climbSpeedKt: 65,
    landingMode: "angle",
    glideAngleDeg: 3,
    approachSpeedKt: 75,
    descentRateFpm: 500,
  });
  const [satLoading, setSatLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const lat = finiteNumber(airport.rotaer?.lat);
  const lng = finiteNumber(airport.rotaer?.lng);
  const center = lat != null && lng != null ? { lat, lng } : null;
  const obstacles = useMemo(() => (center ? parseObstacles(airport.rotaer, center) : []), [airport.rotaer, center]);
  const sceneObstacles = useMemo(
    () => obstacles.slice(0, coarsePointer ? 36 : MAX_RENDERED_OBSTACLES),
    [coarsePointer, obstacles],
  );
  const listedObstacles = useMemo(() => obstacles.slice(0, MAX_LISTED_OBSTACLES), [obstacles]);
  const runways = useMemo(() => {
    const precise = runwayRecords.map(runwayFromRecord).filter(Boolean) as SceneRunway[];
    return precise.length ? precise : runwayFallbacks(airport.rotaer);
  }, [airport.rotaer, runwayRecords]);
  const runwayOptions = useMemo(() => runwayEndOptions(runways), [runways]);
  const canvasResetKey = `${airport.icao}:${simulation.enabled ? "sim" : "idle"}:${simulation.mode}:${simulation.runwayKey}`;

  useEffect(() => {
    if (!runwayOptions.length) return;
    setSimulation((current) =>
      runwayOptions.some((option) => option.key === current.runwayKey)
        ? current
        : { ...current, runwayKey: runwayOptions[0].key },
    );
  }, [runwayOptions]);

  useEffect(() => {
    textureRef.current = texture;
  }, [texture]);

  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTerrain(null);
    setTexture((prev) => {
      prev?.dispose();
      return null;
    });
    void Promise.all([
      fetchTerrainGrid(terrainPoints(center), {
        signal: controller.signal,
        padDeg: 0.015,
        maxTiles: 120,
        maxSatTiles: 120,
        maxZoom: 15,
        targetCells: 720,
      }),
      findRunwaysByAirport(airport.icao),
    ])
      .then(async ([grid, records]) => {
        if (cancelled) return;
        setTerrain(grid);
        setRunwayRecords(records);
        if (!grid) {
          setError("Relevo indisponível para este aeródromo.");
          return;
        }
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar a vista 3D.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [airport.icao, center?.lat, center?.lng]);

  useEffect(() => {
    if (!terrain || basemap !== "satellite") {
      setSatLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSatLoading(true);
    void fetchSatelliteCanvas(terrain, {
      signal: controller.signal,
      maxSatTiles: coarsePointer ? 48 : 120,
      maxZoom: coarsePointer ? 14 : 15,
    })
      .then((canvas) => {
        if (cancelled || !canvas) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = coarsePointer ? 2 : 8;
        tex.flipY = true;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setTexture((prev) => {
          prev?.dispose();
          return tex;
        });
      })
      .finally(() => {
        if (!cancelled) setSatLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [basemap, coarsePointer, terrain]);

  if (!center) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-400">
        Coordenadas do aeródromo indisponíveis no ROTAER.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative h-[min(72dvh,760px)] min-h-[380px] overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950 sm:min-h-[460px]">
        <Airport3DCanvasErrorBoundary resetKey={canvasResetKey}>
          <Canvas
            gl={{
              antialias: !coarsePointer,
              alpha: false,
              powerPreference: coarsePointer ? "low-power" : "high-performance",
              stencil: false,
            }}
            dpr={coarsePointer ? 1 : [1, 1.5]}
            camera={{ fov: 48, near: 2, far: 220000, position: [12000, 7000, 14000] }}
            style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
            className="h-full w-full touch-none"
          >
            <AirportScene
              airport={airport}
              terrain={terrain}
              texture={basemap === "satellite" ? texture : null}
              runways={runways}
              obstacles={sceneObstacles}
              simulation={simulation}
              showMetar={showMetar}
              onSelectMetar={setSelectedMetar}
            />
          </Canvas>
        </Airport3DCanvasErrorBoundary>
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-2 text-xs text-slate-200 shadow-xl sm:left-3 sm:right-auto sm:top-3 sm:max-w-[min(58%,28rem)]">
          <p className="font-semibold text-white">{airport.icao} · 10 NM</p>
          <p className="text-[11px] text-slate-400">
            {runways.length} pista(s) · {sceneObstacles.length}/{obstacles.length} obstáculo(s) · {formatWind(airport)}
          </p>
        </div>
        <div className="absolute right-2 top-[4.6rem] z-10 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1.5 sm:right-3 sm:top-3 sm:max-w-[40%]">
          {([
            ["terrain", "Terreno"],
            ["satellite", "Satélite"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasemap(id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-xl transition ${
                basemap === id
                  ? "border-cyan-300/60 bg-cyan-500/25 text-cyan-50"
                  : "border-slate-700/80 bg-slate-950/85 text-slate-300 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setShowMetar((value) => !value);
              setSelectedMetar(null);
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-xl transition ${
              showMetar
                ? "border-sky-300/60 bg-sky-500/25 text-sky-50"
                : "border-slate-700/80 bg-slate-950/85 text-slate-300 hover:border-slate-500"
            }`}
          >
            METAR
          </button>
          <button
            type="button"
            onClick={() => setSimulation((current) => ({ ...current, enabled: !current.enabled }))}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-xl transition ${
              simulation.enabled
                ? "border-orange-300/60 bg-orange-500/25 text-orange-50"
                : "border-slate-700/80 bg-slate-950/85 text-slate-300 hover:border-slate-500"
            }`}
          >
            SIM
          </button>
        </div>
        {simulation.enabled ? (
          <div
            className="absolute bottom-2 left-2 right-2 z-10 max-h-[45%] overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur sm:bottom-3 sm:left-3 sm:right-auto sm:max-h-[70%] sm:w-[min(24rem,calc(100%-1.5rem))]"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {([
                ["takeoff", "Decolagem"],
                ["landing", "Pouso"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSimulation((current) => ({ ...current, mode }))}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                    simulation.mode === mode
                      ? "border-orange-300/60 bg-orange-500/25 text-orange-50"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Pista
              <select
                value={runwayOptions.some((option) => option.key === simulation.runwayKey) ? simulation.runwayKey : ""}
                disabled={!runwayOptions.length}
                onChange={(event) => {
                  const nextKey = event.currentTarget.value;
                  if (!runwayOptions.some((option) => option.key === nextKey)) return;
                  setSimulation((current) => ({ ...current, runwayKey: nextKey }));
                }}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-orange-300/70"
              >
                {runwayOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {simulation.mode === "takeoff" ? (
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Pista m
                  <input
                    type="number"
                    min={0}
                    max={6000}
                    step={50}
                    value={simulation.takeoffRunwayM}
                    onChange={(event) =>
                      setSimulation((current) => ({
                        ...current,
                        takeoffRunwayM: inputNumberOrCurrent(event.currentTarget, current.takeoffRunwayM),
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-orange-300/70"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Subida fpm
                  <input
                    type="number"
                    min={50}
                    max={6000}
                    step={50}
                    value={simulation.climbRateFpm}
                    onChange={(event) =>
                      setSimulation((current) => ({
                        ...current,
                        climbRateFpm: inputNumberOrCurrent(event.currentTarget, current.climbRateFpm),
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-orange-300/70"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Vel kt
                  <input
                    type="number"
                    min={10}
                    max={400}
                    step={5}
                    value={simulation.climbSpeedKt}
                    onChange={(event) =>
                      setSimulation((current) => ({
                        ...current,
                        climbSpeedKt: inputNumberOrCurrent(event.currentTarget, current.climbSpeedKt),
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-orange-300/70"
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="mb-2 flex gap-1.5">
                  {([
                    ["angle", "Graus"],
                    ["rate", "Razão"],
                  ] as const).map(([landingMode, label]) => (
                    <button
                      key={landingMode}
                      type="button"
                      onClick={() => setSimulation((current) => ({ ...current, landingMode }))}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                        simulation.landingMode === landingMode
                          ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-50"
                          : "border-slate-700 bg-slate-900 text-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {simulation.landingMode === "angle" ? (
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Rampa °
                    <input
                      type="number"
                      min={0.5}
                      max={8}
                      step={0.1}
                      value={simulation.glideAngleDeg}
                      onChange={(event) =>
                        setSimulation((current) => ({
                          ...current,
                          glideAngleDeg: inputNumberOrCurrent(event.currentTarget, current.glideAngleDeg),
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-300/70"
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Vel kt
                      <input
                        type="number"
                        min={10}
                        max={400}
                        step={5}
                        value={simulation.approachSpeedKt}
                        onChange={(event) =>
                          setSimulation((current) => ({
                            ...current,
                            approachSpeedKt: inputNumberOrCurrent(event.currentTarget, current.approachSpeedKt),
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-300/70"
                      />
                    </label>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Descida fpm
                      <input
                        type="number"
                        min={50}
                        max={6000}
                        step={50}
                        value={simulation.descentRateFpm}
                        onChange={(event) =>
                          setSimulation((current) => ({
                            ...current,
                            descentRateFpm: inputNumberOrCurrent(event.currentTarget, current.descentRateFpm),
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-300/70"
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
        {selectedMetar ? (
          <div className="absolute left-2 right-2 top-[7.4rem] z-10 max-h-[40%] overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 text-xs text-slate-200 shadow-2xl sm:left-auto sm:right-3 sm:top-16 sm:max-w-[min(22rem,calc(100%-1.5rem))]">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{selectedMetar.icao} · METAR 3D</p>
              <button
                type="button"
                onClick={() => setSelectedMetar(null)}
                className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Fechar METAR"
              >
                x
              </button>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-slate-300">{selectedMetar.metar || "METAR indisponível"}</p>
            {selectedMetar.cloudsText ? (
              <p className="mt-1 text-[11px] text-slate-500">{selectedMetar.cloudsText}</p>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-slate-950/80 px-2 py-1 text-[11px] text-cyan-200">
            Carregando relevo em alta qualidade...
          </div>
        ) : null}
        {satLoading ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-slate-950/80 px-2 py-1 text-[11px] text-cyan-200">
            Carregando satélite em alta qualidade...
          </div>
        ) : null}
        {error ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-amber-950/80 px-2 py-1 text-[11px] text-amber-100">
            {error}
          </div>
        ) : null}
      </div>
      {obstacles.length ? (
        <>
          {obstacles.length > sceneObstacles.length ? (
            <p className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-xs text-slate-400">
              {obstacles.length} obstáculos encontrados em 10 NM. Para manter o 3D fluido, os {sceneObstacles.length} mais relevantes estão desenhados na cena.
            </p>
          ) : null}
          <div className="grid gap-2 @2xl:grid-cols-2">
            {listedObstacles.map((obstacle) => (
              <div key={obstacle.id} className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                <p className="font-semibold text-red-100">{obstacle.label}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {obstacle.lat.toFixed(5)}, {obstacle.lng.toFixed(5)}
                  {obstacle.elevM != null ? ` · ${obstacle.elevM.toLocaleString("pt-BR")} m` : ""}
                </p>
              </div>
            ))}
          </div>
          {obstacles.length > listedObstacles.length ? (
            <p className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-xs text-slate-500">
              Lista reduzida para {listedObstacles.length} itens para evitar travamento da página.
            </p>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-xs text-slate-500">
          Nenhum obstáculo com coordenada foi identificado nos textos OBST do ROTAER dentro de 10 NM.
        </p>
      )}
    </div>
  );
}
