import { useCallback, useEffect, useRef, useState } from "react";
import type { ProvaPctPoint } from "../../types/provas";

type Props = {
  imageUrl: string;
  polygon: ProvaPctPoint[];
  clickPoint?: ProvaPctPoint | null;
  revealPolygon?: ProvaPctPoint[] | null;
  mode: "draw" | "click" | "review";
  onChange?: (points: ProvaPctPoint[]) => void;
  onClickPoint?: (point: ProvaPctPoint) => void;
};

function toSvg(points: ProvaPctPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function ProvaImageAreaEditor({
  imageUrl,
  polygon,
  clickPoint = null,
  revealPolygon = null,
  mode,
  onChange,
  onClickPoint,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });

  const eventToPct = useCallback((e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  function handleClick(e: React.PointerEvent) {
    const pct = eventToPct(e);
    if (!pct) return;
    if (mode === "draw") onChange?.([...polygon, pct]);
    if (mode === "click") onClickPoint?.(pct);
  }

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.src = imageUrl;
  }, [imageUrl]);

  const showPoly = polygon.length >= 2;
  const showReveal = (revealPolygon ?? []).length >= 3;

  if (!imageUrl) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-500">
        Envie uma imagem para delimitar a área
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
        style={{ aspectRatio: `${natural.w} / ${natural.h}` }}
        onPointerDown={handleClick}
      >
        <img src={imageUrl} alt="" className="block h-full w-full select-none object-contain" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {showPoly ? (
            polygon.length < 3 ? (
              <polyline points={toSvg(polygon)} fill="none" stroke="#22c55e" strokeWidth="0.6" strokeDasharray="1.5 1" />
            ) : (
              <polygon points={toSvg(polygon)} fill="rgba(34,197,94,0.28)" stroke="#22c55e" strokeWidth="0.6" />
            )
          ) : null}
          {showReveal ? (
            <polygon
              points={toSvg(revealPolygon!)}
              fill="rgba(34,197,94,0.22)"
              stroke="#4ade80"
              strokeWidth="0.6"
            />
          ) : null}
          {polygon.map((p, i) => (
            <circle key={`${p.x}-${p.y}-${i}`} cx={p.x} cy={p.y} r="1.1" fill="#bbf7d0" stroke="#14532d" strokeWidth="0.3" />
          ))}
          {clickPoint ? <circle cx={clickPoint.x} cy={clickPoint.y} r="1.6" fill="#f43f5e" stroke="#fff" strokeWidth="0.4" /> : null}
        </svg>
      </div>
      {mode === "draw" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange?.(polygon.slice(0, -1))}
            disabled={!polygon.length}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-40"
          >
            Desfazer ponto
          </button>
          <button
            type="button"
            onClick={() => onChange?.([])}
            disabled={!polygon.length}
            className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-40"
          >
            Limpar área
          </button>
          <p className="self-center text-xs text-slate-500">Clique para desenhar o polígono da resposta certa.</p>
        </div>
      ) : mode === "click" ? (
        <p className="text-xs text-slate-500">Clique na imagem para marcar a resposta.</p>
      ) : null}
    </div>
  );
}
