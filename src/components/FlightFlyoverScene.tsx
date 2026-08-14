import { Html, Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import type { AirspaceLayerType } from "../lib/airspaceLayersDb";
import type { AirspaceVolume } from "../lib/airspaceIntersect";
import { airspaceHitColor } from "../lib/flightPlanFormat";
import {
  FLYOVER_EXAGGERATION,
  FLYOVER_CHASE_END,
  FLYOVER_HEIGHT,
  FLYOVER_MAX_CORRIDORS,
  FLYOVER_MAX_LABELS,
  FLYOVER_MAX_VOLUMES,
  FLYOVER_REVEAL_LEAD_SECONDS,
  FLYOVER_REVEAL_SECONDS,
  FLYOVER_WIDTH,
  sampleFlyoverAt,
  type FlyoverSample,
  type FlyoverTrack,
} from "../lib/flightFlyover";
import type { ProjectedFlyoverLabel } from "../lib/flightFlyoverRecorder";
import { destinationPoint } from "../lib/geoClip";
import type { GeoPoly } from "../lib/geoClip";
import { corridorPrismGeometry, type LegCorridorInfo } from "../lib/legCorridor";
import {
  altFtToY,
  buildTerrainGeometry,
  computeRouteOrigin,
  geometryCentroidEnu,
  geometryToShapes,
  lngLatToEnu,
  resolveVolumeAlts,
  sceneCeilingFt,
  terrainBaseY,
  type EnuOrigin,
} from "../lib/route3d";
import type { RunwayRecord } from "../lib/runwaysDb";
import { sampleGridHeightM, type TerrainGrid } from "../lib/terrainTiles";

const CORRIDOR_COLOR = "#a16207";
const _ndc = new THREE.Vector3();
const _size = new THREE.Vector2();

export type FlyoverSceneHandle = {
  renderAt: (progress: number) => {
    sample: FlyoverSample;
    canvas: HTMLCanvasElement;
    labels: ProjectedFlyoverLabel[];
  };
};

type WorldLabel = {
  text: string;
  x: number;
  y: number;
  z: number;
  color: string;
};

type FatLine = {
  geometry: { setPositions: (positions: number[] | Float32Array) => void };
  computeLineDistances: () => void;
  material: { resolution?: THREE.Vector2 };
};

type Props = {
  track: FlyoverTrack;
  progress: number;
  exporting?: boolean;
  terrain: TerrainGrid | null;
  satelliteTexture: THREE.Texture | null;
  airspaceVolumes: AirspaceVolume[];
  hiddenAirspaceTypes: Set<AirspaceLayerType>;
  reaCorridors: LegCorridorInfo[];
  rehCorridors: LegCorridorInfo[];
  showRea: boolean;
  showReh: boolean;
  runways?: RunwayRecord[];
  playbackRef?: MutableRefObject<number>;
  playing?: boolean;
  durationSec?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerpAngleDeg(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function headingFromPoints(ax: number, az: number, bx: number, bz: number): number | null {
  const dx = bx - ax;
  const dz = bz - az;
  if (dx * dx + dz * dz < 4) return null;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

function principalAxisXZ(points: THREE.Vector3[]): { x: number; z: number } {
  let mx = 0;
  let mz = 0;
  for (const point of points) {
    mx += point.x;
    mz += point.z;
  }
  const n = Math.max(1, points.length);
  mx /= n;
  mz /= n;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const point of points) {
    const dx = point.x - mx;
    const dz = point.z - mz;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  const diff = xx - zz;
  const half = 0.5 * (xx + zz + Math.sqrt(diff * diff + 4 * xz * xz));
  let ax = xz;
  let az = half - xx;
  if (ax * ax + az * az < 1e-8) {
    ax = xx >= zz ? 1 : 0;
    az = xx >= zz ? 0 : 1;
  }
  const len = Math.hypot(ax, az) || 1;
  return { x: ax / len, z: az / len };
}

function computeOverviewCamera(points: THREE.Vector3[]): {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  distToCenter: number;
} {
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3(0, 4_000, 4_000);
  if (points.length < 2) return { pos, look, distToCenter: 6_000 };

  const box = new THREE.Box3().setFromPoints(points);
  box.getCenter(look);
  const size = new THREE.Vector3();
  box.getSize(size);
  const groundRadius = Math.max(400, 0.5 * Math.hypot(size.x, size.z));
  const axis = principalAxisXZ(points);
  const start = points[0]!;
  const end = points[points.length - 1]!;
  if (axis.x * (start.x - end.x) + axis.z * (start.z - end.z) < 0) {
    axis.x = -axis.x;
    axis.z = -axis.z;
  }

  const yaw = Math.PI / 5;
  const dirX = axis.x * Math.cos(yaw) - axis.z * Math.sin(yaw);
  const dirZ = axis.x * Math.sin(yaw) + axis.z * Math.cos(yaw);
  const elev = Math.PI / 6;

  const fov = 52;
  const aspect = FLYOVER_WIDTH / FLYOVER_HEIGHT;
  const cam = new THREE.PerspectiveCamera(fov, aspect, 2, 1_000_000);
  const scratch = new THREE.Vector3();
  const ground = new THREE.Vector3();

  const place = (dist: number) => {
    const horiz = dist * Math.cos(elev);
    const vert = dist * Math.sin(elev);
    cam.position.set(look.x + dirX * horiz, look.y + vert, look.z + dirZ * horiz);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
  };

  const overflow = (): number => {
    let maxAbs = 0;
    for (const point of points) {
      ground.set(point.x, look.y, point.z);
      scratch.copy(ground).project(cam);
      if (!Number.isFinite(scratch.x) || !Number.isFinite(scratch.y)) continue;
      maxAbs = Math.max(maxAbs, Math.abs(scratch.x) / 0.9, Math.abs(scratch.y) / 0.82);
    }
    return maxAbs || 2;
  };

  const vHalf = THREE.MathUtils.degToRad(fov / 2);
  const guess = clamp(groundRadius / Math.tan(vHalf) / 0.78, groundRadius * 1.7, groundRadius * 3.4);
  let lo = guess * 0.55;
  let hi = guess;
  place(hi);
  if (overflow() > 1) {
    hi = Math.min(groundRadius * 3.6, hi * 1.35);
  }
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    place(mid);
    if (overflow() > 1) lo = mid;
    else hi = mid;
  }
  const distToCenter = clamp(hi, groundRadius * 1.6, groundRadius * 3.5);
  place(distToCenter);
  pos.copy(cam.position);
  return { pos, look, distToCenter };
}

function VolumeShapeMesh({
  shape,
  extrude,
  color,
  opacity,
  lowerY,
}: {
  shape: THREE.Shape;
  extrude: THREE.ExtrudeGeometryOptions;
  color: string;
  opacity: number;
  lowerY: number;
}) {
  const geom = useMemo(() => new THREE.ExtrudeGeometry(shape, extrude), [extrude, shape]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 28), [geom]);
  useEffect(
    () => () => {
      geom.dispose();
      edges.dispose();
    },
    [edges, geom],
  );
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, lowerY, 0]}>
      <mesh geometry={geom} raycast={() => {}}>
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
      <lineSegments geometry={edges} raycast={() => {}}>
        <lineBasicMaterial color={color} transparent opacity={Math.min(0.55, opacity * 2.3)} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function VolumePrism({
  geometry,
  origin,
  lowerFt,
  upperFt,
  exaggeration,
  color,
  opacity,
}: {
  geometry: GeoPoly;
  origin: EnuOrigin;
  lowerFt: number;
  upperFt: number;
  exaggeration: number;
  color: string;
  opacity: number;
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
        />
      ))}
    </group>
  );
}

function TerrainMesh({
  grid,
  origin,
  exaggeration,
  satelliteTexture,
}: {
  grid: TerrainGrid;
  origin: EnuOrigin;
  exaggeration: number;
  satelliteTexture: THREE.Texture | null;
}) {
  const geom = useMemo(
    () => buildTerrainGeometry(grid, origin, exaggeration),
    [exaggeration, grid, origin],
  );
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} raycast={() => {}}>
      {satelliteTexture ? (
        <meshBasicMaterial map={satelliteTexture} toneMapped={false} side={THREE.DoubleSide} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} side={THREE.DoubleSide} />
      )}
    </mesh>
  );
}

function MarkerBall() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.15, 24, 24]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.45} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.48, 16, 16]} />
        <meshBasicMaterial color="#e0f2fe" />
      </mesh>
    </group>
  );
}

function RunwayStrips({
  runways,
  origin,
  terrain,
  exaggeration,
}: {
  runways: RunwayRecord[];
  origin: EnuOrigin;
  terrain: TerrainGrid | null;
  exaggeration: number;
}) {
  return (
    <>
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
        const width = paved ? 48 : 32;
        const yaw = Math.atan2(dx, dz);
        return (
          <mesh key={rwy.$id} position={[(a.x + b.x) / 2, y, (a.z + b.z) / 2]} rotation={[0, yaw, 0]}>
            <boxGeometry args={[width, Math.max(1.1, 0.28 * exaggeration), len]} />
            <meshStandardMaterial color={paved ? "#6b7280" : "#a8a29e"} roughness={0.88} />
          </mesh>
        );
      })}
    </>
  );
}

function projectLabel(
  camera: THREE.Camera,
  width: number,
  height: number,
  label: WorldLabel,
): ProjectedFlyoverLabel | null {
  _ndc.set(label.x, label.y, label.z).project(camera);
  if (_ndc.z > 1 || _ndc.z < -1) return null;
  return {
    text: label.text,
    x: (_ndc.x * 0.5 + 0.5) * width,
    y: (-_ndc.y * 0.5 + 0.5) * height,
    color: label.color,
  };
}

function headingToForward(headingDeg: number): { x: number; z: number } {
  const rad = (headingDeg * Math.PI) / 180;
  return { x: Math.sin(rad), z: -Math.cos(rad) };
}

function copyRendererToCanvas(
  renderer: THREE.WebGLRenderer,
  dest: HTMLCanvasElement,
  pixels: Uint8Array,
  flipped: Uint8ClampedArray,
) {
  const gl = renderer.getContext();
  const width = dest.width;
  const height = dest.height;
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    flipped.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  const ctx = dest.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(flipped, width, height), 0, 0);
}

function SceneRig({
  track,
  progressRef,
  origin,
  spanM,
  terrain,
  satelliteTexture,
  airspaceVolumes,
  hiddenAirspaceTypes,
  corridors,
  exporting,
  runways,
  apiRef,
  playbackRef,
  playing = false,
  durationSec = 30,
}: {
  track: FlyoverTrack;
  progressRef: MutableRefObject<number>;
  origin: EnuOrigin;
  spanM: number;
  terrain: TerrainGrid | null;
  satelliteTexture: THREE.Texture | null;
  airspaceVolumes: AirspaceVolume[];
  hiddenAirspaceTypes: Set<AirspaceLayerType>;
  corridors: LegCorridorInfo[];
  exporting: boolean;
  runways: RunwayRecord[];
  apiRef: MutableRefObject<FlyoverSceneHandle | null>;
  playbackRef?: MutableRefObject<number>;
  playing?: boolean;
  durationSec?: number;
}) {
  const { gl, scene, camera, size } = useThree();
  const aircraftRef = useRef<THREE.Group>(null);
  const flownLineRef = useRef<FatLine | null>(null);
  const camPos = useRef(new THREE.Vector3());
  const camLook = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const camInited = useRef(false);
  const smoothHeading = useRef(0);
  const lastProgress = useRef(0);
  const projReady = useRef(false);
  const lastFlownCount = useRef(0);
  const copyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef<Uint8Array | null>(null);
  const flippedRef = useRef<Uint8ClampedArray | null>(null);
  const exaggeration = FLYOVER_EXAGGERATION;

  const ceilingFt = useMemo(
    () =>
      sceneCeilingFt({
        plannedFt: null,
        terrainMaxM: terrain?.maxM ?? null,
        volumeUppersFt: [
          ...airspaceVolumes.map((v) => v.upperFt),
          ...corridors.map((c) => c.altMax),
        ],
      }),
    [airspaceVolumes, corridors, terrain?.maxM],
  );

  const fullPath = useMemo(() => {
    return track.samples.map((sample) => {
      const enu = lngLatToEnu(sample.lat, sample.lon, origin);
      return new THREE.Vector3(enu.x, sample.altM * exaggeration, enu.z);
    });
  }, [exaggeration, origin, track.samples]);

  const worldLabels = useMemo(() => {
    const out: WorldLabel[] = [];
    for (const volume of airspaceVolumes
      .filter((v) => !hiddenAirspaceTypes.has(v.type))
      .slice(0, FLYOVER_MAX_VOLUMES)) {
      const alts = resolveVolumeAlts(volume.lowerFt, volume.upperFt, ceilingFt);
      if (!alts) continue;
      const c = geometryCentroidEnu(volume.geometry, origin);
      if (!c) continue;
      const label =
        volume.ident && volume.ident !== "—" ? `${volume.type} ${volume.ident}` : `${volume.type} ${volume.name}`;
      out.push({
        text: label,
        x: c.x,
        y: altFtToY((alts.lowerFt + alts.upperFt) / 2, exaggeration),
        z: c.z,
        color: airspaceHitColor(volume.type),
      });
    }
    for (const corridor of corridors.slice(0, FLYOVER_MAX_CORRIDORS)) {
      const alts = resolveVolumeAlts(corridor.altMin, corridor.altMax, ceilingFt);
      if (!alts) continue;
      let x = 0;
      let z = 0;
      if (corridor.endpointA && corridor.endpointB) {
        const lat = (corridor.endpointA.lat + corridor.endpointB.lat) / 2;
        const lng = (corridor.endpointA.lng + corridor.endpointB.lng) / 2;
        const enu = lngLatToEnu(lat, lng, origin);
        x = enu.x;
        z = enu.z;
      } else {
        const geom = corridorPrismGeometry(corridor);
        const c = geom ? geometryCentroidEnu(geom, origin) : null;
        if (!c) continue;
        x = c.x;
        z = c.z;
      }
      out.push({
        text: corridor.name,
        x,
        y: altFtToY((alts.lowerFt + alts.upperFt) / 2, exaggeration),
        z,
        color: CORRIDOR_COLOR,
      });
    }
    return out;
  }, [airspaceVolumes, ceilingFt, corridors, exaggeration, hiddenAirspaceTypes, origin]);

  const overview = useMemo(() => computeOverviewCamera(fullPath), [fullPath]);

  useEffect(() => {
    camInited.current = false;
    projReady.current = false;
  }, [track]);

  useEffect(() => {
    if (exporting) camInited.current = false;
  }, [exporting]);

  const applyPose = (progress: number, dt: number, snap: boolean): FlyoverSample => {
    const chaseEnd = FLYOVER_CHASE_END;
    const chaseU = Math.min(1, progress / Math.max(0.001, chaseEnd));
    const revealStart = Math.max(0.42, chaseEnd - FLYOVER_REVEAL_LEAD_SECONDS / Math.max(1, durationSec));
    const revealEnd = Math.min(0.985, revealStart + FLYOVER_REVEAL_SECONDS / Math.max(1, durationSec));
    const reveal = smoothstep((progress - revealStart) / Math.max(0.001, revealEnd - revealStart));
    const sample = sampleFlyoverAt(track, chaseU * track.durationMs);
    const enu = lngLatToEnu(sample.lat, sample.lon, origin);
    let y = sample.altM * exaggeration;
    if (terrain) {
      const ground = sampleGridHeightM(terrain, sample.lat, sample.lon) * exaggeration;
      y = Math.max(y, ground + 12);
    }

    const jumped = Math.abs(progress - lastProgress.current) > 0.08;
    lastProgress.current = progress;
    const hardSnap = snap || !camInited.current || jumped;

    const tangentMs = Math.max(5_000, track.durationMs * 0.005);
    const prev = sampleFlyoverAt(track, Math.max(0, sample.elapsedMs - tangentMs));
    const next = sampleFlyoverAt(track, Math.min(track.durationMs, sample.elapsedMs + tangentMs));
    const prevEnu = lngLatToEnu(prev.lat, prev.lon, origin);
    const nextEnu = lngLatToEnu(next.lat, next.lon, origin);
    const desiredHeading =
      headingFromPoints(prevEnu.x, prevEnu.z, nextEnu.x, nextEnu.z) ?? sample.headingDeg;

    if (hardSnap) {
      smoothHeading.current = desiredHeading;
    } else {
      smoothHeading.current = lerpAngleDeg(smoothHeading.current, desiredHeading, 1 - Math.exp(-dt * 2.1));
    }
    const heading = smoothHeading.current;
    const fwd = headingToForward(heading);
    const bx = enu.x;
    const by = y;
    const bz = enu.z;

    const dist = clamp(Math.max(spanM * 0.44, Math.abs(by) * 0.95, 1_900), 1_800, 6_200);
    const height = clamp(Math.max(spanM * 0.18, Math.abs(by) * 0.48, 680), 640, 2_800);

    targetPos.current.set(bx - fwd.x * dist, by + height, bz - fwd.z * dist);
    targetLook.current.set(bx, by, bz);
    if (reveal > 0) {
      targetPos.current.lerp(overview.pos, reveal);
      targetLook.current.lerp(overview.look, reveal);
    }

    if (hardSnap) {
      camPos.current.copy(targetPos.current);
      camLook.current.copy(targetLook.current);
      camInited.current = true;
    } else {
      camPos.current.copy(targetPos.current);
      camLook.current.copy(targetLook.current);
    }

    if (camera instanceof THREE.PerspectiveCamera && !projReady.current) {
      camera.near = 4;
      camera.far = Math.max(spanM * 22, overview.distToCenter * 6, 80_000);
      camera.fov = 52;
      camera.updateProjectionMatrix();
      projReady.current = true;
    }
    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);

    if (aircraftRef.current) {
      aircraftRef.current.position.set(bx, by, bz);
      aircraftRef.current.scale.setScalar(clamp(dist * 0.018, 22, 46));
    }

    const count = Math.max(2, Math.round(chaseU * (fullPath.length - 1)) + 1);
    const flown = flownLineRef.current;
    if (flown?.geometry?.setPositions && count !== lastFlownCount.current) {
      lastFlownCount.current = count;
      const positions: number[] = [];
      for (let i = 0; i < Math.min(fullPath.length, count); i++) {
        const p = fullPath[i]!;
        positions.push(p.x, p.y, p.z);
      }
      flown.geometry.setPositions(positions);
      flown.computeLineDistances();
      flown.material.resolution?.set(size.width || FLYOVER_WIDTH, size.height || FLYOVER_HEIGHT);
    }
    return sample;
  };

  useFrame((_, delta) => {
    if (exporting) return;
    const dt = Math.min(0.05, delta);
    if (playing && playbackRef) {
      let next = playbackRef.current + dt / Math.max(0.001, durationSec);
      if (next >= 1) next = 0;
      playbackRef.current = next;
    }
    applyPose(playbackRef?.current ?? progressRef.current, dt, false);
  });

  useEffect(() => {
    apiRef.current = {
      renderAt: (progress: number) => {
        const prevRatio = gl.getPixelRatio();
        gl.getSize(_size);
        gl.setPixelRatio(1);
        gl.setSize(FLYOVER_WIDTH, FLYOVER_HEIGHT, false);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = FLYOVER_WIDTH / FLYOVER_HEIGHT;
        }
        const sample = applyPose(progress, 1 / 30, false);
        gl.render(scene, camera);

        if (!copyCanvasRef.current) {
          const canvas = document.createElement("canvas");
          canvas.width = FLYOVER_WIDTH;
          canvas.height = FLYOVER_HEIGHT;
          copyCanvasRef.current = canvas;
        }
        const bytes = FLYOVER_WIDTH * FLYOVER_HEIGHT * 4;
        if (!pixelsRef.current || pixelsRef.current.length !== bytes) {
          pixelsRef.current = new Uint8Array(bytes);
          flippedRef.current = new Uint8ClampedArray(bytes);
        }
        const pixels = pixelsRef.current;
        const flipped = flippedRef.current;
        if (pixels && flipped) {
          copyRendererToCanvas(gl, copyCanvasRef.current, pixels, flipped);
        }

        gl.setPixelRatio(prevRatio);
        const restoreW = Math.max(1, _size.x);
        const restoreH = Math.max(1, _size.y);
        gl.setSize(restoreW, restoreH, false);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = restoreW / restoreH;
          camera.updateProjectionMatrix();
        }

        const labels = worldLabels
          .map((label) => projectLabel(camera, FLYOVER_WIDTH, FLYOVER_HEIGHT, label))
          .filter((label): label is ProjectedFlyoverLabel => Boolean(label))
          .slice(0, FLYOVER_MAX_LABELS);
        return { sample, canvas: copyCanvasRef.current, labels };
      },
    };
    return () => {
      apiRef.current = null;
    };
  });

  return (
    <>
      <color attach="background" args={["#0b1220"]} />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#94a3b8", "#3f2e1a", 0.42]} />
      <directionalLight position={[spanM * 0.4, spanM * 0.8, spanM * 0.2]} intensity={1.05} />

      {terrain ? (
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
            <planeGeometry args={[spanM * 18, spanM * 18]} />
            <meshStandardMaterial color="#14110e" roughness={1} />
          </mesh>
        </>
      ) : null}

      <RunwayStrips runways={runways} origin={origin} terrain={terrain} exaggeration={exaggeration} />

      {airspaceVolumes
        .filter((v) => !hiddenAirspaceTypes.has(v.type))
        .slice(0, FLYOVER_MAX_VOLUMES)
        .map((volume, idx) => {
          const alts = resolveVolumeAlts(volume.lowerFt, volume.upperFt, ceilingFt);
          if (!alts) return null;
          const opacity = volume.type === "FIR" || volume.type === "FIS" ? 0.05 : 0.1;
          return (
            <VolumePrism
              key={`a-${volume.type}-${volume.ident}-${idx}`}
              geometry={volume.geometry}
              origin={origin}
              lowerFt={alts.lowerFt}
              upperFt={alts.upperFt}
              exaggeration={exaggeration}
              color={airspaceHitColor(volume.type)}
              opacity={opacity}
            />
          );
        })}

      {corridors.slice(0, FLYOVER_MAX_CORRIDORS).map((corridor, idx) => {
        const geom = corridorPrismGeometry(corridor);
        if (!geom) return null;
        const alts = resolveVolumeAlts(corridor.altMin, corridor.altMax, ceilingFt);
        if (!alts) return null;
        return (
          <VolumePrism
            key={`c-${corridor.name}-${idx}`}
            geometry={geom}
            origin={origin}
            lowerFt={alts.lowerFt}
            upperFt={alts.upperFt}
            exaggeration={exaggeration}
            color={CORRIDOR_COLOR}
            opacity={0.14}
          />
        );
      })}

      {fullPath.length >= 2 ? (
        <>
          <Line points={fullPath} color="#fb923c" lineWidth={6} transparent opacity={0.92} />
          <Line
            ref={flownLineRef as never}
            points={fullPath}
            color="#f97316"
            lineWidth={9}
            opacity={1}
          />
        </>
      ) : null}

      <group ref={aircraftRef}>
        <MarkerBall />
      </group>

      {!exporting
        ? worldLabels.slice(0, FLYOVER_MAX_LABELS).map((label) => (
            <Html
              key={`${label.text}-${label.x.toFixed(0)}-${label.z.toFixed(0)}`}
              position={[label.x, label.y, label.z]}
              center
              style={{ pointerEvents: "none" }}
              zIndexRange={[10, 0]}
            >
              <span
                className="whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold text-slate-100 shadow"
                style={{ background: "rgba(15,23,42,0.82)", borderColor: label.color }}
              >
                {label.text}
              </span>
            </Html>
          ))
        : null}
    </>
  );
}

export const FlightFlyoverScene = forwardRef<FlyoverSceneHandle, Props>(function FlightFlyoverScene(
  {
    track,
    progress,
    exporting = false,
    terrain,
    satelliteTexture,
    airspaceVolumes,
    hiddenAirspaceTypes,
    reaCorridors,
    rehCorridors,
    showRea,
    showReh,
    runways = [],
    playbackRef,
    playing = false,
    durationSec = 30,
  },
  ref,
) {
  const origin = useMemo(
    () => computeRouteOrigin(track.samples.map((s) => ({ lat: s.lat, lng: s.lon }))),
    [track.samples],
  );
  const spanM = useMemo(() => {
    if (!origin) return 2_000;
    let max = 600;
    for (const sample of track.samples) {
      const p = lngLatToEnu(sample.lat, sample.lon, origin);
      max = Math.max(max, Math.hypot(p.x, p.z));
    }
    return Math.max(1_400, max * 2.35);
  }, [origin, track.samples]);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const apiRef = useRef<FlyoverSceneHandle | null>(null);
  const corridors = useMemo(() => {
    const list: LegCorridorInfo[] = [];
    if (showRea) list.push(...reaCorridors);
    if (showReh) list.push(...rehCorridors);
    return list;
  }, [reaCorridors, rehCorridors, showRea, showReh]);

  useImperativeHandle(ref, () => ({
    renderAt: (nextProgress: number) => {
      progressRef.current = nextProgress;
      const api = apiRef.current;
      if (!api) throw new Error("Cena 3D ainda não está pronta.");
      return api.renderAt(nextProgress);
    },
  }));

  if (!origin) return null;

  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
      dpr={1}
      camera={{ fov: 54, near: 4, far: 80_000, position: [800, 600, 1100] }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <SceneRig
        track={track}
        progressRef={progressRef}
        origin={origin}
        spanM={spanM}
        terrain={terrain}
        satelliteTexture={satelliteTexture}
        airspaceVolumes={airspaceVolumes}
        hiddenAirspaceTypes={hiddenAirspaceTypes}
        corridors={corridors}
        exporting={exporting}
        runways={runways}
        apiRef={apiRef}
        playbackRef={playbackRef}
        playing={playing}
        durationSec={durationSec}
      />
    </Canvas>
  );
});
