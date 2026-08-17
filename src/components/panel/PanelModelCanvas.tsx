import { Bounds, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useMemo,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { has3dHotspot } from "../../lib/panelPayload";
import type { PanelInstrument } from "../../types/panel";

type Mode = "view" | "edit";

type Props = {
  modelUrl: string;
  instruments: PanelInstrument[];
  selectedId?: string | null;
  mode?: Mode;
  disabled?: boolean;
  className?: string;
  onSelect: (instrument: PanelInstrument) => void;
  onSelectId?: (id: string | null) => void;
  onPlace?: (point: { x: number; y: number; z: number }) => void;
};

class ModelErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Panel 3D model error", error, info.componentStack);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center px-6 text-center text-sm text-amber-200">
          Não foi possível carregar o modelo 3D. Confira se o arquivo é um GLB válido.
          {this.state.error.message ? (
            <span className="mt-2 block text-[11px] text-slate-400">{this.state.error.message}</span>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}

function markerRadius(size: THREE.Vector3) {
  const max = Math.max(size.x, size.y, size.z, 0.001);
  return THREE.MathUtils.clamp(max * 0.018, 0.008, 0.08);
}

function PanelHotspotMarker({
  instrument,
  radius,
  selected,
  mode,
  onSelect,
}: {
  instrument: PanelInstrument;
  radius: number;
  selected: boolean;
  mode: Mode;
  onSelect: (instrument: PanelInstrument) => void;
}) {
  const color = selected ? "#fbbf24" : "#38bdf8";
  return (
    <group
      position={[instrument.pos_x ?? 0, instrument.pos_y ?? 0, instrument.pos_z ?? 0]}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerOver={(event) => {
        event.stopPropagation();
        const canvas = event.nativeEvent.target as HTMLElement | null;
        if (canvas?.style) canvas.style.cursor = "pointer";
      }}
      onPointerOut={(event) => {
        const canvas = event.nativeEvent.target as HTMLElement | null;
        if (canvas?.style) canvas.style.cursor = "";
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(instrument);
      }}
    >
      <mesh>
        <sphereGeometry args={[radius * (selected ? 1.25 : 1), 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.85 : 0.45}
          transparent
          opacity={0.92}
          depthTest
        />
      </mesh>
      <mesh>
        <ringGeometry args={[radius * 1.35, radius * 1.7, 24]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      {selected || mode === "edit" ? (
        <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-medium text-sky-100 shadow">
            {instrument.name}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function LoadedPanelModel({
  modelUrl,
  instruments,
  selectedId,
  mode = "view",
  disabled,
  onSelect,
  onPlace,
}: Omit<Props, "className" | "onSelectId">) {
  const gltf = useGLTF(modelUrl);
  const pointerDown = useRef<{ x: number; y: number; point: THREE.Vector3 } | null>(null);
  const cloned = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
    });
    return copy;
  }, [gltf.scene]);
  const modelSize = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    return box.getSize(new THREE.Vector3());
  }, [cloned]);
  const radius = markerRadius(modelSize);
  const placed = instruments.filter(has3dHotspot);

  function handleModelPointerDown(event: ThreeEvent<PointerEvent>) {
    if (mode !== "edit" || disabled || event.button !== 0) return;
    pointerDown.current = {
      x: event.clientX,
      y: event.clientY,
      point: event.point.clone(),
    };
  }

  function handleModelPointerUp(event: ThreeEvent<PointerEvent>) {
    if (mode !== "edit" || disabled || !onPlace || event.button !== 0) return;
    const down = pointerDown.current;
    pointerDown.current = null;
    if (!down) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (dx * dx + dy * dy > 36) return;
    onPlace({ x: down.point.x, y: down.point.y, z: down.point.z });
  }

  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight color="#f8fafc" groundColor="#1e293b" intensity={0.55} />
      <directionalLight position={[2.4, 3.2, 2.6]} intensity={1.35} />
      <directionalLight position={[-2.2, 1.1, -1.4]} intensity={0.4} />
      <Bounds fit observe margin={1.3}>
        <primitive
          object={cloned}
          onPointerDown={handleModelPointerDown}
          onPointerUp={handleModelPointerUp}
        />
      </Bounds>
      {placed.map((instrument) => (
        <PanelHotspotMarker
          key={instrument.id}
          instrument={instrument}
          radius={radius}
          selected={instrument.id === selectedId}
          mode={mode}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.15}
        maxDistance={12}
      />
    </>
  );
}

function LoadingHint() {
  return (
    <Html center>
      <p className="rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">Carregando modelo 3D...</p>
    </Html>
  );
}

export function PanelModelCanvas({
  modelUrl,
  instruments,
  selectedId = null,
  mode = "view",
  disabled = false,
  className,
  onSelect,
  onSelectId,
  onPlace,
}: Props) {
  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className ?? "h-[min(72vh,640px)] min-h-[420px]"}`}>
      <ModelErrorBoundary resetKey={modelUrl}>
        <Canvas
          key={modelUrl}
          gl={{ antialias: true, alpha: false, powerPreference: "default", stencil: false }}
          dpr={[1, 1.5]}
          camera={{ fov: 40, near: 0.01, far: 200, position: [0, 0.35, 1.8] }}
          onCreated={({ gl }) => {
            gl.domElement.style.touchAction = "none";
          }}
          onPointerMissed={() => {
            if (mode === "edit") onSelectId?.(null);
          }}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          className="h-full w-full touch-none"
        >
          <color attach="background" args={["#020617"]} />
          <Suspense fallback={<LoadingHint />}>
            <LoadedPanelModel
              modelUrl={modelUrl}
              instruments={instruments}
              selectedId={selectedId}
              mode={mode}
              disabled={disabled}
              onSelect={onSelect}
              onPlace={onPlace}
            />
          </Suspense>
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
