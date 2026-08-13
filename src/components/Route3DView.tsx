import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { AiswebAirportBundle } from "../types/aisweb";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { loadAirspaceVolumesInBbox, type AirspaceVolume } from "../lib/airspaceIntersect";
import type { Aerodrome } from "../lib/aerodromesDb";
import { AIRSPACE_LAYER_DEFS, type AirspaceInfo } from "../lib/airspaceLayersDb";
import { airspaceHitColor } from "../lib/flightPlanFormat";
import { uniqueCorridorVolumes, corridorPrismGeometry, reaFeatureToCorridor, type LegCorridorInfo } from "../lib/legCorridor";
import { destinationPoint } from "../lib/geoClip";
import { loadReaRoutesInBbox } from "../lib/reaRoutesDb";
import type { RoutePerformanceProfile } from "../lib/routePerformanceProfile";
import { findRunwaysByAirports, type RunwayRecord } from "../lib/runwaysDb";
import { formatCompactAviationCoord } from "../lib/flightPlanningRoute";
import {
  altFtToY,
  buildRoute3dMarkers,
  buildRoute3dPath,
  buildTerrainGeometry,
  computeRouteOrigin,
  enuToLngLat,
  geometryCentroidEnu,
  geometryToShapes,
  lngLatToEnu,
  resolveVolumeAlts,
  routeSpanM,
  sceneCeilingFt,
  terrainBaseY,
  type EnuOrigin,
} from "../lib/route3d";
import { fetchSatelliteCanvas, fetchTerrainGrid, sampleGridHeightM, type TerrainGrid } from "../lib/terrainTiles";
import { AerodromeMapPopupContent } from "./AerodromePlanningModals";
import { AirspaceInfoPanel } from "./AirspaceInfoPanel";

type Props = {
  waypoints: FlightPlanWaypoint[];
  totalDistanceNm: number;
  performance?: RoutePerformanceProfile | null;
  corridors?: Array<LegCorridorInfo | null>;
  airspaceVolumes?: AirspaceVolume[];
  aerodromes?: Aerodrome[];
  onAerodromeDetails?: (bundle: AiswebAirportBundle) => void;
  /** `section` = full-height compact chrome + layers sheet; `embedded` = desktop stack bar. */
  variant?: "embedded" | "section";
  className?: string;
  /** Override canvas height utilities (embedded default h-[480px]). */
  canvasClassName?: string;
};

type TerrainStyle = "hypsometric" | "satellite";

type LayerToggles = {
  terrain: boolean;
  route: boolean;
  corridors: boolean;
  airspaces: boolean;
};

type SceneSelection =
  | { kind: "aerodrome"; icao: string; name: string }
  | { kind: "airspace"; info: AirspaceInfo }
  | { kind: "corridor"; name: string; altMin: number | null; altMax: number | null }
  | { kind: "waypoint"; label: string; lat: number; lng: number; markerKind: string };

function volumeToInfo(volume: AirspaceVolume): AirspaceInfo {
  if (volume.info) return volume.info;
  const def = AIRSPACE_LAYER_DEFS.find((d) => d.type === volume.type);
  return {
    type: volume.type,
    ident: volume.ident,
    name: volume.name,
    fir: null,
    upper: volume.upperFt != null ? `${Math.round(volume.upperFt)} FT` : null,
    lower: volume.lowerFt != null ? `${Math.round(volume.lowerFt)} FT` : null,
    workHours: null,
    airspaceClass: null,
    remarks: null,
    locality: null,
    frequency: null,
    color: def?.color || airspaceHitColor(volume.type),
  };
}

function pointerCursor(gl: THREE.WebGLRenderer) {
  return {
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      gl.domElement.style.cursor = "pointer";
    },
    onPointerOut: () => {
      gl.domElement.style.cursor = "auto";
    },
  };
}

const DEFAULT_TOGGLES: LayerToggles = {
  terrain: true,
  route: true,
  corridors: true,
  airspaces: true,
};

const AIRSPACE_OFF_BY_DEFAULT = new Set<AirspaceVolume["type"]>(["FIR", "FIS"]);
const CORRIDOR_COLOR = "#a16207";
const FT_TYPES: AirspaceVolume["type"][] = ["TMA", "CTR", "ATZ", "FIZ", "CTA", "AFIS", "P", "R", "D", "FIR", "FIS"];

function markerColor(kind: string): string {
  switch (kind) {
    case "origin":
      return "#34d399";
    case "destination":
      return "#f472b6";
    case "toc":
      return "#c4b5fd";
    case "tod":
      return "#f0abfc";
    default:
      return "#e2e8f0";
  }
}

function CameraRig({ spanM, resetNonce }: { spanM: number; resetNonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
    minDistance: number;
    maxDistance: number;
  } | undefined;
  useLayoutEffect(() => {
    const dist = Math.max(1_200, spanM * 0.72);
    camera.position.set(dist * 0.55, dist * 0.4, dist * 0.74);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(2, dist / 250);
      camera.far = Math.max(80_000, spanM * 12);
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.target.set(0, Math.max(40, spanM * 0.01), 0);
      controls.update();
    }
  }, [camera, controls, resetNonce, spanM]);
  return null;
}

/** Evita clipping e câmera abaixo do relevo, sem impedir deitar o olhar. */
function OrbitGuard({
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
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | undefined;
  useFrame(() => {
    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) return;
    if (terrain) {
      const camLl = enuToLngLat(camera.position.x, camera.position.z, origin);
      const camGround = sampleGridHeightM(terrain, camLl.lat, camLl.lng) * exaggeration;
      if (camera.position.y < camGround + 18) {
        camera.position.y = camGround + 18;
      }
    } else if (camera.position.y < 18) {
      camera.position.y = 18;
    }
    const dist = camera.position.distanceTo(controls.target);
    const near = Math.max(1.2, Math.min(40, dist / 220));
    const far = Math.max(spanM * 12, dist * 30, 80_000);
    if (Math.abs(camera.near - near) > 0.5 || Math.abs(camera.far - far) > 400) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  });
  return null;
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
  const tMax = 380_000;
  for (let i = 1; i <= 40; i++) {
    const t = 12 * Math.pow(tMax / 12, i / 40);
    const x = ray.origin.x + ray.direction.x * t;
    const y = ray.origin.y + ray.direction.y * t;
    const z = ray.origin.z + ray.direction.z * t;
    const ll = enuToLngLat(x, z, origin);
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
    const ll = enuToLngLat(x, z, origin);
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

/** Zoom no cursor (lerp). Se o raio não pega o relevo, aproxima do alvo da órbita — nunca trava. */
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
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!controls) return;
      const rect = canvas.getBoundingClientRect();
      _ndc.set(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
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
      const maxDist = Math.max(spanM * 8, 40_000);
      const dist = camera.position.distanceTo(hit);
      const notches = Math.min(3, Math.max(0.35, Math.abs(event.deltaY) / 120));
      const k = 1 - Math.pow(0.78, notches);
      const zoomIn = event.deltaY < 0;

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
        const ll = enuToLngLat(camera.position.x, camera.position.z, origin);
        const ground = sampleGridHeightM(terrain, ll.lat, ll.lng) * exaggeration;
        if (camera.position.y < ground + 20) camera.position.y = ground + 20;
      }
      controls.update();
    };
    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [camera, controls, exaggeration, gl, origin, spanM, terrain]);
  return null;
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

function lineHitsTerrain(
  from: THREE.Vector3,
  to: THREE.Vector3,
  grid: TerrainGrid,
  origin: EnuOrigin,
  exaggeration: number,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 40) return false;
  const steps = Math.min(20, Math.max(8, Math.floor(dist / 1_200)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t < 0.08 || t > 0.9) continue;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    const ll = enuToLngLat(x, z, origin);
    if (ll.lat < grid.south || ll.lat > grid.north || ll.lng < grid.west || ll.lng > grid.east) continue;
    if (sampleGridHeightM(grid, ll.lat, ll.lng) * exaggeration > y + 16) return true;
  }
  return false;
}

const TerrainMesh = forwardRef<
  THREE.Mesh,
  {
    grid: TerrainGrid;
    origin: EnuOrigin;
    exaggeration: number;
    satelliteTexture: THREE.Texture | null;
  }
>(function TerrainMesh({ grid, origin, exaggeration, satelliteTexture }, ref) {
  const geom = useMemo(
    () => buildTerrainGeometry(grid, origin, exaggeration),
    [exaggeration, grid, origin],
  );
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh ref={ref} geometry={geom} raycast={() => {}}>
      {satelliteTexture ? (
        <meshBasicMaterial map={satelliteTexture} toneMapped={false} side={THREE.DoubleSide} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} side={THREE.DoubleSide} />
      )}
    </mesh>
  );
});

function VolumePrism({
  geometry,
  origin,
  lowerFt,
  upperFt,
  exaggeration,
  color,
  opacity,
  onClick,
}: {
  geometry: AirspaceVolume["geometry"];
  origin: EnuOrigin;
  lowerFt: number;
  upperFt: number;
  exaggeration: number;
  color: string;
  opacity: number;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const shapes = useMemo(() => geometryToShapes(geometry, origin), [geometry, origin]);
  const lowerY = altFtToY(lowerFt, exaggeration);
  const heightY = Math.max(4, altFtToY(upperFt, exaggeration) - lowerY);
  const extrude = useMemo(
    () => ({ depth: heightY, bevelEnabled: false as const, curveSegments: 1 }),
    [heightY],
  );
  if (!shapes.length) return null;
  return (
    <group>
      {shapes.map((shape, idx) => (
        <VolumeShapeMesh
          key={idx}
          shape={shape}
          extrude={extrude}
          color={color}
          opacity={opacity}
          lowerY={lowerY}
          onClick={onClick}
        />
      ))}
    </group>
  );
}

function VolumeShapeMesh({
  shape,
  extrude,
  color,
  opacity,
  lowerY,
  onClick,
}: {
  shape: THREE.Shape;
  extrude: { depth: number; bevelEnabled: false; curveSegments: number };
  color: string;
  opacity: number;
  lowerY: number;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const geom = useMemo(() => new THREE.ExtrudeGeometry(shape, extrude), [extrude, shape]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 28), [geom]);
  const gl = useThree((s) => s.gl);
  useEffect(
    () => () => {
      geom.dispose();
      edges.dispose();
    },
    [edges, geom],
  );
  const edgeOpacity = Math.min(0.55, opacity * 2.3);
  const hover = onClick ? pointerCursor(gl) : null;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, lowerY, 0]}>
      <mesh
        geometry={geom}
        onClick={onClick}
        onPointerOver={hover?.onPointerOver}
        onPointerOut={hover?.onPointerOut}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={edgeOpacity} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function SceneContent({
  waypoints,
  performance,
  corridors,
  airspaceVolumes,
  terrain,
  exaggeration,
  toggles,
  hiddenAirspaceTypes,
  spanM,
  origin,
  resetNonce,
  satelliteTexture,
  visibleAerodromes,
  runways,
  onSelect,
}: {
  waypoints: FlightPlanWaypoint[];
  performance?: RoutePerformanceProfile | null;
  corridors: LegCorridorInfo[];
  airspaceVolumes: AirspaceVolume[];
  terrain: TerrainGrid | null;
  exaggeration: number;
  toggles: LayerToggles;
  hiddenAirspaceTypes: Set<AirspaceVolume["type"]>;
  spanM: number;
  origin: EnuOrigin;
  resetNonce: number;
  satelliteTexture: THREE.Texture | null;
  visibleAerodromes: Aerodrome[];
  runways: RunwayRecord[];
  onSelect: (selection: SceneSelection) => void;
}) {
  const gl = useThree((s) => s.gl);
  const hover = pointerCursor(gl);
  const ceilingFt = useMemo(
    () =>
      sceneCeilingFt({
        plannedFt: performance?.cruiseAltFt ?? null,
        terrainMaxM: terrain?.maxM ?? null,
        volumeUppersFt: [
          ...airspaceVolumes.map((v) => v.upperFt),
          ...corridors.map((c) => c.altMax),
        ],
      }),
    [airspaceVolumes, corridors, performance?.cruiseAltFt, terrain?.maxM],
  );
  const path = useMemo(
    () => buildRoute3dPath(waypoints, performance?.profile ?? null, origin, exaggeration),
    [exaggeration, origin, performance?.profile, waypoints],
  );
  const markers = useMemo(
    () => buildRoute3dMarkers(waypoints, performance?.phaseMarkers ?? null, origin, exaggeration),
    [exaggeration, origin, performance?.phaseMarkers, waypoints],
  );
  const markerRadius = Math.min(220, Math.max(28, spanM * 0.00105));
  const labelScale = Math.max(420, Math.min(1800, spanM * 0.0055));
  const routeIcaos = useMemo(() => {
    const set = new Set<string>();
    for (const wp of waypoints) {
      const code = wp.label.trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(code)) set.add(code);
    }
    return set;
  }, [waypoints]);

  return (
    <>
      <color attach="background" args={["#0b1220"]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#94a3b8", "#3f2e1a", 0.45]} />
      <directionalLight position={[spanM * 0.4, spanM * 0.8, spanM * 0.2]} intensity={1.15} />
      <CameraRig spanM={spanM} resetNonce={resetNonce} />
      <OrbitGuard spanM={spanM} terrain={terrain} origin={origin} exaggeration={exaggeration} />
      <TerrainZoom terrain={terrain} origin={origin} exaggeration={exaggeration} spanM={spanM} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableZoom={false}
        screenSpacePanning={false}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_ROTATE,
        }}
        minPolarAngle={0.04}
        maxPolarAngle={Math.PI / 2 - 0.002}
        minDistance={40}
        maxDistance={spanM * 8}
      />

      {toggles.terrain && terrain ? (
        <>
          <TerrainMesh
            grid={terrain}
            origin={origin}
            exaggeration={exaggeration}
            satelliteTexture={satelliteTexture}
          />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, terrainBaseY(terrain, exaggeration) - 4, 0]}
            raycast={() => {}}
          >
            <planeGeometry args={[spanM * 5, spanM * 5]} />
            <meshStandardMaterial color="#14110e" roughness={1} />
          </mesh>
        </>
      ) : null}

      {toggles.corridors
        ? corridors.map((corridor, idx) => {
            const geom = corridorPrismGeometry(corridor);
            if (!geom) return null;
            const alts = resolveVolumeAlts(corridor.altMin, corridor.altMax, ceilingFt);
            if (!alts) return null;
            const midY = altFtToY((alts.lowerFt + alts.upperFt) / 2, exaggeration);
            let labelPos: [number, number, number] | null = null;
            if (corridor.endpointA && corridor.endpointB) {
              const lat = (corridor.endpointA.lat + corridor.endpointB.lat) / 2;
              const lng = (corridor.endpointA.lng + corridor.endpointB.lng) / 2;
              const enu = lngLatToEnu(lat, lng, origin);
              labelPos = [enu.x, midY, enu.z];
            } else {
              const c = geometryCentroidEnu(geom, origin);
              if (c) labelPos = [c.x, midY, c.z];
            }
            return (
              <group key={`c-${corridor.name}-${idx}`}>
                <VolumePrism
                  geometry={geom}
                  origin={origin}
                  lowerFt={alts.lowerFt}
                  upperFt={alts.upperFt}
                  exaggeration={exaggeration}
                  color={CORRIDOR_COLOR}
                  opacity={0.14}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({
                      kind: "corridor",
                      name: corridor.name,
                      altMin: corridor.altMin,
                      altMax: corridor.altMax,
                    });
                  }}
                />
                {labelPos ? (
                  <WorldLabel
                    position={labelPos}
                    worldScale={labelScale}
                    maxDistance={spanM * 0.9}
                    className="whitespace-nowrap rounded border border-amber-700/70 bg-slate-950/85 px-1.5 py-0.5 font-semibold text-amber-200 shadow"
                  >
                    {corridor.name}
                  </WorldLabel>
                ) : null}
              </group>
            );
          })
        : null}

      {toggles.airspaces
        ? airspaceVolumes
            .filter((v) => !hiddenAirspaceTypes.has(v.type))
            .slice(0, 60)
            .map((volume, idx) => {
              const alts = resolveVolumeAlts(volume.lowerFt, volume.upperFt, ceilingFt);
              if (!alts) return null;
              const opacity = volume.type === "FIR" || volume.type === "FIS" ? 0.05 : 0.1;
              const midY = altFtToY((alts.lowerFt + alts.upperFt) / 2, exaggeration);
              const c = geometryCentroidEnu(volume.geometry, origin);
              const label = volume.ident && volume.ident !== "—" ? `${volume.type} ${volume.ident}` : `${volume.type} ${volume.name}`;
              return (
                <group key={`a-${volume.type}-${volume.ident}-${idx}`}>
                  <VolumePrism
                    geometry={volume.geometry}
                    origin={origin}
                    lowerFt={alts.lowerFt}
                    upperFt={alts.upperFt}
                    exaggeration={exaggeration}
                    color={airspaceHitColor(volume.type)}
                    opacity={opacity}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect({ kind: "airspace", info: volumeToInfo(volume) });
                    }}
                  />
                  {c && idx < 18 ? (
                    <WorldLabel
                      position={[c.x, midY, c.z]}
                      worldScale={labelScale}
                      maxDistance={spanM * 0.55}
                      className="whitespace-nowrap rounded border border-slate-600/80 bg-slate-950/85 px-1.5 py-0.5 font-semibold text-slate-100 shadow"
                    >
                      {label}
                    </WorldLabel>
                  ) : null}
                </group>
              );
            })
        : null}

      {toggles.route && path.length >= 2 ? (
        <Line points={path} color="#22d3ee" lineWidth={2.5} />
      ) : null}

      {toggles.route
        ? markers.map((m, idx) => (
            <group key={`${m.kind}-${m.label}-${idx}`} position={[m.x, m.y, m.z]}>
              <mesh
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({
                    kind: "waypoint",
                    label: m.label,
                    lat: m.lat,
                    lng: m.lng,
                    markerKind: m.kind,
                  });
                }}
                onPointerOver={hover.onPointerOver}
                onPointerOut={hover.onPointerOut}
              >
                <sphereGeometry args={[markerRadius * (m.kind === "waypoint" ? 0.75 : 1), 12, 12]} />
                <meshStandardMaterial color={markerColor(m.kind)} roughness={0.4} />
              </mesh>
              <WorldLabel
                position={[0, markerRadius * 4.2, 0]}
                worldScale={labelScale}
                maxDistance={spanM * 1.4}
                className={`whitespace-nowrap rounded bg-slate-950/80 px-1.5 py-0.5 font-semibold shadow ${
                  m.kind === "toc"
                    ? "text-violet-200"
                    : m.kind === "tod"
                      ? "text-fuchsia-200"
                      : "text-slate-100"
                }`}
              >
                {m.label}
              </WorldLabel>
            </group>
          ))
        : null}

      {visibleAerodromes.map((ad) => {
        if (!ad.latitudeGeoPoint || !ad.longitudeGeoPoint) return null;
        const icao = ad.icao.trim().toUpperCase();
        if (routeIcaos.has(icao)) return null;
        const enu = lngLatToEnu(ad.latitudeGeoPoint, ad.longitudeGeoPoint, origin);
        const ground = terrain ? sampleGridHeightM(terrain, ad.latitudeGeoPoint, ad.longitudeGeoPoint) : 0;
        const size = Math.min(220, Math.max(50, spanM * 0.00085));
        const y = ground * exaggeration + size * 0.55;
        return (
          <group key={ad.id} position={[enu.x, y, enu.z]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelect({ kind: "aerodrome", icao: icao || ad.name, name: ad.name });
              }}
              onPointerOver={hover.onPointerOver}
              onPointerOut={hover.onPointerOut}
            >
              <coneGeometry args={[size * 0.38, size, 4]} />
              <meshStandardMaterial color="#fbbf24" roughness={0.45} />
            </mesh>
            <WorldLabel
              position={[0, size * 0.95, 0]}
              worldScale={labelScale * 0.85}
              maxDistance={spanM * 0.7}
              terrain={toggles.terrain ? terrain : null}
              origin={origin}
              exaggeration={exaggeration}
              className="whitespace-nowrap rounded bg-slate-950/80 px-1.5 py-0.5 font-semibold text-amber-100 shadow"
            >
              {icao || ad.name}
            </WorldLabel>
          </group>
        );
      })}

      {runways.map((rwy) => {
        if (rwy.closed) return null;
        let aLat = rwy.le.lat;
        let aLng = rwy.le.lon;
        let bLat = rwy.he.lat;
        let bLng = rwy.he.lon;
        if ((aLat == null || aLng == null) && rwy.he.lat != null && rwy.he.lon != null) {
          aLat = rwy.he.lat;
          aLng = rwy.he.lon;
        }
        if ((bLat == null || bLng == null) && aLat != null && aLng != null) {
          const hdg = rwy.le.headingTrue ?? rwy.he.headingTrue;
          const lenM = rwy.lengthFt != null ? rwy.lengthFt * 0.3048 : null;
          if (hdg != null && lenM != null && lenM > 40) {
            const dest = destinationPoint(aLat, aLng, hdg, lenM);
            bLat = dest.lat;
            bLng = dest.lng;
          }
        }
        if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
        const a = lngLatToEnu(aLat, aLng, origin);
        const b = lngLatToEnu(bLat, bLng, origin);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 40) return null;
        const midLat = (aLat + bLat) / 2;
        const midLng = (aLng + bLng) / 2;
        const ground = terrain ? sampleGridHeightM(terrain, midLat, midLng) : 0;
        const y = ground * exaggeration + Math.max(1.5, 0.4 * exaggeration);
        const paved = /asp|conc|paved|asphalt|cimento|concreto/i.test(rwy.surface || "");
        const width = paved ? 45 : 28;
        const yaw = Math.atan2(dx, dz);
        return (
          <mesh
            key={rwy.$id}
            position={[(a.x + b.x) / 2, y, (a.z + b.z) / 2]}
            rotation={[0, yaw, 0]}
          >
            <boxGeometry args={[width, Math.max(0.9, 0.22 * exaggeration), len]} />
            <meshStandardMaterial color={paved ? "#6b7280" : "#a8a29e"} roughness={0.88} />
          </mesh>
        );
      })}
    </>
  );
}

function WorldLabel({
  children,
  position,
  className,
  worldScale,
  maxDistance,
  terrain,
  origin,
  exaggeration,
}: {
  children: ReactNode;
  position?: [number, number, number];
  className: string;
  worldScale: number;
  maxDistance?: number;
  terrain?: TerrainGrid | null;
  origin?: EnuOrigin;
  exaggeration?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const el = wrapRef.current;
    const group = anchor.current;
    if (!el || !group) return;
    group.getWorldPosition(_to);
    const dist = camera.position.distanceTo(_to);
    let hide = maxDistance != null && dist > maxDistance;
    if (!hide && terrain && origin && exaggeration != null) {
      _from.copy(camera.position);
      hide = lineHitsTerrain(_from, _to, terrain, origin, exaggeration);
    }
    const next = hide ? "hidden" : "visible";
    if (el.style.visibility !== next) el.style.visibility = next;
  });
  return (
    <group ref={anchor} position={position}>
      <Html center transform sprite occlude={false} scale={worldScale} style={{ pointerEvents: "none" }}>
        <div ref={wrapRef} className={className} style={{ fontSize: 16, lineHeight: 1.25, fontWeight: 700 }}>
          {children}
        </div>
      </Html>
    </group>
  );
}

function waypointKindLabel(kind: string): string {
  switch (kind) {
    case "origin":
      return "Origem";
    case "destination":
      return "Destino";
    case "toc":
      return "TOC";
    case "tod":
      return "TOD";
    default:
      return "Ponto";
  }
}

function ToggleChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-cyan-700 text-white"
          : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
      }`}
    >
      {children}
    </button>
  );
}

export function Route3DView({
  waypoints,
  totalDistanceNm,
  performance,
  corridors = [],
  airspaceVolumes = [],
  aerodromes = [],
  onAerodromeDetails,
  variant = "embedded",
  className = "",
  canvasClassName,
}: Props) {
  const isSection = variant === "section";
  const [layersOpen, setLayersOpen] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>(DEFAULT_TOGGLES);
  const [exaggeration, setExaggeration] = useState(20);
  const [terrainStyle, setTerrainStyle] = useState<TerrainStyle>("hypsometric");
  const [resetNonce, setResetNonce] = useState(0);
  const [terrain, setTerrain] = useState<TerrainGrid | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [satLoading, setSatLoading] = useState(false);
  const [satError, setSatError] = useState<string | null>(null);
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [runways, setRunways] = useState<RunwayRecord[]>([]);
  const [showAreaAirspaces, setShowAreaAirspaces] = useState(false);
  const [areaVolumes, setAreaVolumes] = useState<AirspaceVolume[]>([]);
  const [areaCorridors, setAreaCorridors] = useState<LegCorridorInfo[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [selection, setSelection] = useState<SceneSelection | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [hiddenAirspaceTypes, setHiddenAirspaceTypes] = useState<Set<AirspaceVolume["type"]>>(
    () => new Set(AIRSPACE_OFF_BY_DEFAULT),
  );

  const origin = useMemo(() => computeRouteOrigin(waypoints), [waypoints]);
  const spanM = useMemo(
    () => (origin ? routeSpanM(waypoints, origin) : 8_000),
    [origin, waypoints],
  );
  const corridorVolumes = useMemo(() => uniqueCorridorVolumes(corridors), [corridors]);
  const displayedCorridors = useMemo(() => {
    if (!showAreaAirspaces || !areaCorridors.length) return corridorVolumes;
    return uniqueCorridorVolumes([...corridorVolumes, ...areaCorridors]);
  }, [areaCorridors, corridorVolumes, showAreaAirspaces]);
  const displayedAirspaceVolumes = useMemo(() => {
    if (!showAreaAirspaces || !areaVolumes.length) return airspaceVolumes;
    const seen = new Set(airspaceVolumes.map((v) => `${v.type}:${v.ident}:${v.name}`));
    return [...airspaceVolumes, ...areaVolumes.filter((v) => !seen.has(`${v.type}:${v.ident}:${v.name}`))];
  }, [airspaceVolumes, areaVolumes, showAreaAirspaces]);
  const presentAirspaceTypes = useMemo(() => {
    const set = new Set<AirspaceVolume["type"]>();
    for (const v of displayedAirspaceVolumes) set.add(v.type);
    return FT_TYPES.filter((t) => set.has(t));
  }, [displayedAirspaceVolumes]);
  const visibleAerodromes = useMemo(() => {
    if (!terrain) return [];
    const midLat = (terrain.south + terrain.north) / 2;
    const midLng = (terrain.west + terrain.east) / 2;
    const inBox: Aerodrome[] = [];
    for (const ad of aerodromes) {
      if (ad.latitudeGeoPoint == null || ad.longitudeGeoPoint == null) continue;
      if (
        ad.latitudeGeoPoint < terrain.south ||
        ad.latitudeGeoPoint > terrain.north ||
        ad.longitudeGeoPoint < terrain.west ||
        ad.longitudeGeoPoint > terrain.east
      ) {
        continue;
      }
      inBox.push(ad);
    }
    inBox.sort((a, b) => {
      const da =
        (a.latitudeGeoPoint! - midLat) ** 2 + (a.longitudeGeoPoint! - midLng) ** 2;
      const db =
        (b.latitudeGeoPoint! - midLat) ** 2 + (b.longitudeGeoPoint! - midLng) ** 2;
      return da - db;
    });
    return inBox.slice(0, 48);
  }, [aerodromes, terrain]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setTerrain(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setTerrainLoading(true);
    setTerrainError(null);
    const timer = window.setTimeout(() => {
      void fetchTerrainGrid(
        waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
        { signal: controller.signal },
      )
        .then((grid) => {
          if (cancelled) return;
          setTerrain(grid);
          if (!grid) setTerrainError("Relevo indisponível");
        })
        .catch((err) => {
          if (cancelled || controller.signal.aborted) return;
          setTerrain(null);
          setTerrainError(err instanceof Error ? err.message : "Falha ao carregar relevo");
        })
        .finally(() => {
          if (!cancelled) setTerrainLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [waypoints]);

  useEffect(() => {
    if (!terrain || terrainStyle !== "satellite") {
      setSatError(null);
      setSatelliteTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSatLoading(true);
    setSatError(null);
    void fetchSatelliteCanvas(terrain, { signal: controller.signal })
      .then((canvas) => {
        if (cancelled) return;
        if (!canvas) {
          setSatError("Imagem de satélite indisponível");
          setSatelliteTexture((prev) => {
            prev?.dispose();
            return null;
          });
          return;
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.flipY = true;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setSatelliteTexture((prev) => {
          prev?.dispose();
          return tex;
        });
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setSatError(err instanceof Error ? err.message : "Falha ao carregar satélite");
        setSatelliteTexture((prev) => {
          prev?.dispose();
          return null;
        });
      })
      .finally(() => {
        if (!cancelled) setSatLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [terrain, terrainStyle]);

  useEffect(() => {
    if (!showAreaAirspaces || !terrain) {
      setAreaVolumes([]);
      setAreaCorridors([]);
      return;
    }
    let cancelled = false;
    setAreaLoading(true);
    const bbox = {
      minLng: terrain.west,
      minLat: terrain.south,
      maxLng: terrain.east,
      maxLat: terrain.north,
    };
    void Promise.all([
      loadAirspaceVolumesInBbox(bbox),
      loadReaRoutesInBbox("rea", bbox),
      loadReaRoutesInBbox("reh", bbox),
    ])
      .then(([volumes, rea, reh]) => {
        if (cancelled) return;
        setAreaVolumes(volumes);
        const nearby = [...rea, ...reh]
          .map(reaFeatureToCorridor)
          .filter((c): c is LegCorridorInfo => c != null)
          .slice(0, 60);
        setAreaCorridors(nearby);
      })
      .catch(() => {
        if (!cancelled) {
          setAreaVolumes([]);
          setAreaCorridors([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAreaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAreaAirspaces, terrain]);

  useEffect(() => {
    const icaos = [
      ...visibleAerodromes.map((a) => a.icao),
      ...waypoints.map((w) => w.label),
    ].filter(Boolean);
    if (!icaos.length) {
      setRunways([]);
      return;
    }
    let cancelled = false;
    void findRunwaysByAirports(icaos.slice(0, 40)).then((list) => {
      if (!cancelled) setRunways(list);
    });
    return () => {
      cancelled = true;
    };
  }, [visibleAerodromes, waypoints]);

  const ready = waypoints.length >= 2 && totalDistanceNm > 0 && origin != null;

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const blockPageScroll = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    el.addEventListener("wheel", blockPageScroll, { passive: false });
    return () => el.removeEventListener("wheel", blockPageScroll);
  }, [ready]);

  const canvasHeightClass = canvasClassName ?? (isSection ? "min-h-0 flex-1" : "h-[480px]");

  const typeFilters =
    toggles.airspaces && presentAirspaceTypes.length > 0 ? (
      <div className={`flex flex-wrap gap-1 ${isSection ? "" : "border-b border-slate-800 px-3 py-1.5"}`}>
        {presentAirspaceTypes.map((type) => {
          const on = !hiddenAirspaceTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() =>
                setHiddenAirspaceTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                on ? "text-slate-100" : "text-slate-500 line-through"
              }`}
              style={{ backgroundColor: on ? `${airspaceHitColor(type)}33` : "#1e293b" }}
            >
              {type}
            </button>
          );
        })}
      </div>
    ) : null;

  const embeddedToolbar = (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
      {terrainLoading ? <span className="text-cyan-300/80">Carregando relevo…</span> : null}
      {satLoading ? <span className="text-cyan-300/80">Carregando satélite…</span> : null}
      {areaLoading ? <span className="text-cyan-300/80">Carregando espaços da área…</span> : null}
      {terrainError ? <span className="text-amber-300/90">{terrainError}</span> : null}
      {satError ? <span className="text-amber-300/90">{satError}</span> : null}
      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
        Exagero
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
          className="h-1 w-20 accent-cyan-500"
        />
        <span className="w-7 font-mono text-slate-300">{exaggeration}×</span>
      </label>
      <ToggleChip active={toggles.terrain} onClick={() => setToggles((t) => ({ ...t, terrain: !t.terrain }))}>
        Terreno
      </ToggleChip>
      <ToggleChip
        active={terrainStyle === "hypsometric"}
        disabled={!toggles.terrain}
        onClick={() => setTerrainStyle("hypsometric")}
      >
        Cores
      </ToggleChip>
      <ToggleChip
        active={terrainStyle === "satellite"}
        disabled={!toggles.terrain}
        onClick={() => setTerrainStyle("satellite")}
      >
        Satélite
      </ToggleChip>
      <ToggleChip active={toggles.route} onClick={() => setToggles((t) => ({ ...t, route: !t.route }))}>
        Rota
      </ToggleChip>
      <ToggleChip
        active={toggles.corridors}
        disabled={displayedCorridors.length === 0 && !showAreaAirspaces}
        onClick={() => setToggles((t) => ({ ...t, corridors: !t.corridors }))}
      >
        Corredores
      </ToggleChip>
      <ToggleChip
        active={toggles.airspaces}
        disabled={displayedAirspaceVolumes.length === 0 && !showAreaAirspaces}
        onClick={() => setToggles((t) => ({ ...t, airspaces: !t.airspaces }))}
      >
        Espaços aéreos
      </ToggleChip>
      <ToggleChip
        active={showAreaAirspaces}
        onClick={() => {
          setShowAreaAirspaces((v) => {
            const next = !v;
            if (next) setToggles((t) => ({ ...t, airspaces: true, corridors: true }));
            return next;
          });
        }}
      >
        Fora da rota
      </ToggleChip>
      <button
        type="button"
        onClick={() => setResetNonce((n) => n + 1)}
        className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
      >
        Resetar câmera
      </button>
    </div>
  );

  return (
    <section
      className={`overflow-hidden bg-slate-950 ${
        isSection
          ? `relative flex h-[calc(100dvh-8.25rem)] min-h-[320px] flex-col rounded-none border-0 ${className}`
          : `shrink-0 rounded-2xl border border-slate-700/70 bg-slate-950/60 ${className}`
      }`}
    >
      <div
        className={`relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 ${
          isSection ? "bg-slate-950" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!isSection ? <h3 className="text-sm font-semibold text-slate-100">Vista 3D</h3> : null}
          <span className="text-[10px] text-slate-500">
            {isSection
              ? "Arraste · pinça zoom · dois dedos para orbitar"
              : "Arraste o terreno · scroll do meio ou Shift+arraste para girar/inclinar"}
          </span>
        </div>
        {isSection ? (
          <div className="flex flex-wrap items-center gap-2">
            {terrainLoading ? <span className="text-[10px] text-cyan-300/80">Relevo…</span> : null}
            {satLoading ? <span className="text-[10px] text-cyan-300/80">Satélite…</span> : null}
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100"
              onClick={() => setLayersOpen(true)}
            >
              Camadas
            </button>
          </div>
        ) : (
          embeddedToolbar
        )}
      </div>
      {!isSection ? typeFilters : null}
      <div
        ref={viewRef}
        className={`relative w-full overflow-hidden overscroll-none touch-none ${
          isSection ? "min-h-0 flex-1" : canvasHeightClass
        }`}
      >
        {!ready || !origin ? (
          <p className="grid h-full place-items-center text-[11px] text-slate-600">
            Defina origem e destino para ver a rota em 3D
          </p>
        ) : (
          <>
            <Canvas
              gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
              dpr={[1, 1.25]}
              camera={{ fov: 50, near: 10, far: 500_000, position: [0, 2_000, 2_000] }}
              onPointerMissed={() => setSelection(null)}
              style={{ width: "100%", height: "100%", display: "block" }}
              className="h-full w-full"
            >
              <SceneContent
                waypoints={waypoints}
                performance={performance}
                corridors={displayedCorridors}
                airspaceVolumes={displayedAirspaceVolumes}
                terrain={terrain}
                exaggeration={exaggeration}
                toggles={toggles}
                hiddenAirspaceTypes={hiddenAirspaceTypes}
                spanM={spanM}
                origin={origin}
                resetNonce={resetNonce}
                satelliteTexture={terrainStyle === "satellite" ? satelliteTexture : null}
                visibleAerodromes={visibleAerodromes}
                runways={runways}
                onSelect={setSelection}
              />
            </Canvas>
            {selection ? (
              <div className="pointer-events-none absolute right-2 top-2 z-10 max-h-[calc(100%-1rem)] overflow-y-auto">
                <div className="pointer-events-auto">
                  {selection.kind === "airspace" ? (
                    <AirspaceInfoPanel info={selection.info} onClose={() => setSelection(null)} />
                  ) : selection.kind === "aerodrome" ? (
                    <div className="w-[min(100%,20rem)] overflow-hidden rounded-2xl border border-slate-600/80 bg-white p-2 shadow-2xl">
                      <div className="mb-1 flex justify-end">
                        <button
                          type="button"
                          className="rounded px-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          onClick={() => setSelection(null)}
                          aria-label="Fechar"
                        >
                          ✕
                        </button>
                      </div>
                      <AerodromeMapPopupContent
                        icao={selection.icao}
                        fallbackName={selection.name}
                        onOpenDetails={(bundle) => {
                          onAerodromeDetails?.(bundle);
                          setSelection(null);
                        }}
                      />
                    </div>
                  ) : (
                    <aside className="flex w-[min(100%,20rem)] flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950 shadow-2xl shadow-black/50">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                            {selection.kind === "corridor" ? "Corredor" : waypointKindLabel(selection.markerKind)}
                          </p>
                          <p className="truncate font-mono text-sm font-bold tracking-wide text-slate-100">
                            {selection.kind === "corridor" ? selection.name : selection.label}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                          onClick={() => setSelection(null)}
                          aria-label="Fechar"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="space-y-2 px-3 py-2.5 text-[12px] text-slate-200">
                        {selection.kind === "corridor" ? (
                          <>
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Limite inferior</p>
                              <p>{selection.altMin != null ? `${Math.round(selection.altMin)} FT` : "—"}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Limite superior</p>
                              <p>{selection.altMax != null ? `${Math.round(selection.altMax)} FT` : "—"}</p>
                            </div>
                          </>
                        ) : (
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Coordenadas</p>
                            <p className="font-mono">{formatCompactAviationCoord(selection.lat, selection.lng)}</p>
                          </div>
                        )}
                      </div>
                    </aside>
                  )}
                </div>
              </div>
            ) : null}
            {isSection ? (
              <button
                type="button"
                className="absolute bottom-20 right-3 z-10 rounded-full border border-slate-600 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-100 shadow-xl sm:bottom-3"
                onClick={() => setLayersOpen(true)}
              >
                Camadas
              </button>
            ) : null}
          </>
        )}
      </div>

      {layersOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setLayersOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Camadas 3D</h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                onClick={() => setLayersOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>Exagero vertical</span>
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    step={1}
                    value={exaggeration}
                    onChange={(e) => setExaggeration(Number(e.target.value))}
                    className="h-1.5 w-28 accent-cyan-500"
                  />
                  <span className="w-8 font-mono text-slate-200">{exaggeration}×</span>
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <ToggleChip active={toggles.terrain} onClick={() => setToggles((t) => ({ ...t, terrain: !t.terrain }))}>
                  Terreno
                </ToggleChip>
                <ToggleChip
                  active={terrainStyle === "hypsometric"}
                  disabled={!toggles.terrain}
                  onClick={() => setTerrainStyle("hypsometric")}
                >
                  Cores
                </ToggleChip>
                <ToggleChip
                  active={terrainStyle === "satellite"}
                  disabled={!toggles.terrain}
                  onClick={() => setTerrainStyle("satellite")}
                >
                  Satélite
                </ToggleChip>
                <ToggleChip active={toggles.route} onClick={() => setToggles((t) => ({ ...t, route: !t.route }))}>
                  Rota
                </ToggleChip>
                <ToggleChip
                  active={toggles.corridors}
                  disabled={displayedCorridors.length === 0 && !showAreaAirspaces}
                  onClick={() => setToggles((t) => ({ ...t, corridors: !t.corridors }))}
                >
                  Corredores
                </ToggleChip>
                <ToggleChip
                  active={toggles.airspaces}
                  disabled={displayedAirspaceVolumes.length === 0 && !showAreaAirspaces}
                  onClick={() => setToggles((t) => ({ ...t, airspaces: !t.airspaces }))}
                >
                  Espaços aéreos
                </ToggleChip>
                <ToggleChip
                  active={showAreaAirspaces}
                  onClick={() => {
                    setShowAreaAirspaces((v) => {
                      const next = !v;
                      if (next) setToggles((t) => ({ ...t, airspaces: true, corridors: true }));
                      return next;
                    });
                  }}
                >
                  Fora da rota
                </ToggleChip>
                <button
                  type="button"
                  onClick={() => setResetNonce((n) => n + 1)}
                  className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  Resetar câmera
                </button>
              </div>
              {typeFilters}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white"
              onClick={() => setLayersOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default Route3DView;
