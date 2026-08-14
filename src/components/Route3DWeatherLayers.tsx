import { useLayoutEffect, useMemo, useRef } from "react";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { altFtToY } from "../lib/route3d";
import {
  buildRouteCloudPuffs3d,
  type MetarCloudHit,
  type MetarCloudInstance,
  type MetarCloudKind,
  type MetarCloudStation3d,
  type RouteCloudPuff3d,
  type RouteCloudSample3d,
} from "../lib/route3dWeather";

const NM_IN_M = 1852;

type MetarSelect = (hit: MetarCloudHit) => void;
type RouteSelect = (sample: RouteCloudSample3d) => void;

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const geo of parts) {
    const pos = geo.getAttribute("position");
    const nrm = geo.getAttribute("normal");
    const idx = geo.getIndex();
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nrm) normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    }
    offset += pos.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setIndex(indices);
  return out;
}

/** Several overlapping spheres — reads as a cumulus, not a pancake. */
function createCumulusGeometry(): THREE.BufferGeometry {
  const blobs = [
    { x: 0, y: 0.06, z: 0, r: 0.72 },
    { x: 0.46, y: 0.1, z: 0.12, r: 0.52 },
    { x: -0.42, y: 0.08, z: 0.18, r: 0.5 },
    { x: 0.1, y: 0.42, z: -0.16, r: 0.48 },
    { x: -0.22, y: 0.32, z: -0.34, r: 0.4 },
    { x: 0.3, y: -0.04, z: -0.3, r: 0.38 },
  ];
  const parts = blobs.map((b) => {
    const geo = new THREE.SphereGeometry(b.r, 9, 7);
    geo.translate(b.x, b.y, b.z);
    return geo;
  });
  const merged = mergeGeometries(parts);
  parts.forEach((geo) => geo.dispose());
  merged.computeVertexNormals();
  return merged;
}

const CUMULUS_GEOMETRY = createCumulusGeometry();
const CUMULUS_METAR_PUFF = CUMULUS_GEOMETRY.clone();
const CUMULUS_METAR_TOWER = CUMULUS_GEOMETRY.clone();
const CUMULUS_ROUTE = CUMULUS_GEOMETRY.clone();
const FLAT_KINDS: MetarCloudKind[] = ["disc", "fog", "ring", "ceiling"];

function kindGeometry(kind: MetarCloudKind) {
  if (kind === "disc" || kind === "fog") return <circleGeometry args={[1, 24]} />;
  if (kind === "ring" || kind === "ceiling") return <ringGeometry args={[0.97, 1, 48]} />;
  return null;
}

function cumulusForKind(kind: MetarCloudKind): THREE.BufferGeometry | undefined {
  if (kind === "puff") return CUMULUS_METAR_PUFF;
  if (kind === "tower") return CUMULUS_METAR_TOWER;
  return undefined;
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

function KindInstances({
  kind,
  items,
  opacity,
}: {
  kind: MetarCloudKind;
  items: MetarCloudInstance[];
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !items.length) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(FLAT_KINDS.includes(kind) ? -Math.PI / 2 : 0, 0, 0);
      if (FLAT_KINDS.includes(kind)) {
        dummy.scale.set(item.sx, item.sz || item.sx, 1);
      } else {
        dummy.scale.set(item.sx, item.sy, item.sz);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(item.color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, kind]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[cumulusForKind(kind), undefined, items.length]}
      frustumCulled={false}
      raycast={() => {}}
    >
      {kindGeometry(kind)}
      <meshBasicMaterial
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function MetarHitDiscs({
  stations,
  onSelect,
}: {
  stations: MetarCloudStation3d[];
  onSelect: MetarSelect;
}) {
  const gl = useThree((s) => s.gl);
  const hover = pointerCursor(gl);
  return (
    <>
      {stations.map((station) => (
        <mesh
          key={`hit-${station.icao}`}
          position={[station.hit.x, station.hit.y, station.hit.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(station.hit);
          }}
          onPointerOver={hover.onPointerOver}
          onPointerOut={hover.onPointerOut}
        >
          <ringGeometry args={[station.hit.radiusM * 0.86, station.hit.radiusM * 1.12, 48]} />
          <meshBasicMaterial transparent opacity={0.04} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

function RouteCloudPuffs({
  samples,
  exaggeration,
  lite,
  onSelect,
}: {
  samples: RouteCloudSample3d[];
  exaggeration: number;
  lite: boolean;
  onSelect: RouteSelect;
}) {
  const gl = useThree((s) => s.gl);
  const hover = pointerCursor(gl);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const puffs = useMemo(
    () => buildRouteCloudPuffs3d({ samples, exaggeration, lite }),
    [exaggeration, lite, samples],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !puffs.length) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]!;
      dummy.position.set(puff.x, puff.y, puff.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(puff.sx, puff.sy, puff.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(i % 2 === 0 ? "#f8fafc" : "#e2e8f0");
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [puffs]);

  if (!puffs.length) return null;

  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const id = event.instanceId;
    const puff: RouteCloudPuff3d | undefined = id == null ? undefined : puffs[id];
    const sample = puff ? samples[puff.sampleIndex] : samples[0];
    if (sample) onSelect(sample);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[CUMULUS_ROUTE, undefined, puffs.length]}
      frustumCulled={false}
      onClick={pick}
      onPointerOver={hover.onPointerOver}
      onPointerOut={hover.onPointerOut}
    >
      <meshBasicMaterial transparent opacity={0.82} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

function PrecipPlanes({ samples, exaggeration }: { samples: RouteCloudSample3d[]; exaggeration: number }) {
  const items = useMemo(
    () =>
      samples
        .filter((s) => s.precipMm > 0.2 || s.weatherCode >= 51)
        .slice(0, 6)
        .map((s) => ({
          x: s.x,
          y: (altFtToY(s.groundFt, exaggeration) + altFtToY(8_000, exaggeration)) / 2,
          z: s.z,
          h: Math.max(20, altFtToY(8_000, exaggeration) - altFtToY(s.groundFt, exaggeration)),
        })),
    [exaggeration, samples],
  );
  if (!items.length) return null;
  const w = 2 * NM_IN_M;
  return (
    <>
      {items.map((item, idx) => (
        <mesh key={`precip-${idx}`} position={[item.x, item.y, item.z]} raycast={() => {}}>
          <planeGeometry args={[w, item.h]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

export function Route3DWeatherLayers({
  metarStations,
  routeSamples,
  showMetar,
  showRouteClouds,
  skipMid,
  exaggeration,
  onSelectMetar,
  onSelectRouteCloud,
}: {
  metarStations: MetarCloudStation3d[];
  routeSamples: RouteCloudSample3d[];
  showMetar: boolean;
  showRouteClouds: boolean;
  skipMid: boolean;
  exaggeration: number;
  onSelectMetar: MetarSelect;
  onSelectRouteCloud: RouteSelect;
}) {
  const byKind = useMemo(() => {
    const groups: Record<MetarCloudKind, MetarCloudInstance[]> = {
      puff: [],
      disc: [],
      tower: [],
      fog: [],
      ceiling: [],
      ring: [],
    };
    if (!showMetar) return groups;
    for (const station of metarStations) {
      for (const inst of station.instances) groups[inst.kind].push(inst);
    }
    return groups;
  }, [metarStations, showMetar]);

  return (
    <>
      {showMetar ? (
        <>
          <KindInstances kind="fog" items={byKind.fog} opacity={0.18} />
          <KindInstances kind="disc" items={byKind.disc} opacity={0.4} />
          <KindInstances kind="puff" items={byKind.puff} opacity={0.72} />
          <KindInstances kind="tower" items={byKind.tower} opacity={0.5} />
          <KindInstances kind="ring" items={byKind.ring} opacity={0.92} />
          <KindInstances kind="ceiling" items={byKind.ceiling} opacity={0.85} />
          <MetarHitDiscs stations={metarStations} onSelect={onSelectMetar} />
        </>
      ) : null}
      {showRouteClouds && routeSamples.length >= 2 ? (
        <>
          <RouteCloudPuffs
            samples={routeSamples}
            exaggeration={exaggeration}
            lite={skipMid}
            onSelect={onSelectRouteCloud}
          />
          <PrecipPlanes samples={routeSamples} exaggeration={exaggeration} />
        </>
      ) : null}
    </>
  );
}
