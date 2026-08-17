import { useCallback, useEffect, useRef, useState } from "react";
import { createPanelInstrument } from "../../lib/panelPayload";
import type { InstrumentShape, PanelInstrument } from "../../types/panel";

type Props = {
  panelImageUrl: string;
  instruments: PanelInstrument[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: PanelInstrument[]) => void;
  disabled?: boolean;
};

type DragMode = "move" | "resize" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function PanelHotspotEditor({
  panelImageUrl,
  instruments,
  selectedId,
  onSelect,
  onChange,
  disabled = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    id: string;
    startX: number;
    startY: number;
    orig: PanelInstrument;
  } | null>(null);
  const [draftShape, setDraftShape] = useState<InstrumentShape>("rect");

  const updateOne = useCallback(
    (id: string, patch: Partial<PanelInstrument>) => {
      onChange(instruments.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [instruments, onChange],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const wrap = wrapRef.current;
      if (!drag || !wrap || disabled) return;
      const rect = wrap.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      if (drag.mode === "move") {
        updateOne(drag.id, {
          x: clamp(drag.orig.x + dx, 0, 100 - drag.orig.w),
          y: clamp(drag.orig.y + dy, 0, 100 - drag.orig.h),
        });
      } else if (drag.mode === "resize") {
        const w = clamp(drag.orig.w + dx, 3, 100 - drag.orig.x);
        const h =
          drag.orig.shape === "circle"
            ? w * (rect.width / rect.height)
            : clamp(drag.orig.h + dy, 3, 100 - drag.orig.y);
        updateOne(drag.id, {
          w,
          h: drag.orig.shape === "circle" ? clamp(h, 3, 100 - drag.orig.y) : h,
        });
      }
    },
    [disabled, updateOne],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [onPointerMove, endDrag]);

  function addInstrument() {
    if (disabled) return;
    const size = draftShape === "circle" ? 10 : 14;
    const next = createPanelInstrument({
      name: "Novo instrumento",
      shape: draftShape,
      x: 40,
      y: 35,
      w: size,
      h: draftShape === "circle" ? size : 12,
      sort_order: instruments.length + 1,
    });
    onChange([...instruments, next]);
    onSelect(next.id);
  }

  function startDrag(mode: DragMode, inst: PanelInstrument, e: React.PointerEvent) {
    if (disabled || !mode) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(inst.id);
    dragRef.current = {
      mode,
      id: inst.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...inst },
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Formato
          <select
            value={draftShape}
            onChange={(e) => setDraftShape(e.target.value as InstrumentShape)}
            disabled={disabled}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          >
            <option value="rect">Retangular</option>
            <option value="circle">Circular</option>
          </select>
        </label>
        <button
          type="button"
          onClick={addInstrument}
          disabled={disabled || !panelImageUrl}
          className="rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-900/50 disabled:opacity-50"
        >
          + Adicionar instrumento
        </button>
        <span className="text-[11px] text-slate-500">Arraste para mover · canto para redimensionar</span>
      </div>

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
        onClick={() => onSelect(null)}
      >
        {panelImageUrl ? (
          <img src={panelImageUrl} alt="Painel" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Envie a imagem do painel</div>
        )}
        {instruments.map((inst) => {
          const selected = inst.id === selectedId;
          const isCircle = inst.shape === "circle";
          return (
            <div
              key={inst.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(inst.id);
              }}
              onPointerDown={(e) => startDrag("move", inst, e)}
              className={`absolute z-10 cursor-move border-2 ${
                isCircle ? "rounded-full" : "rounded-md"
              } ${selected ? "border-amber-400 bg-amber-400/20" : "border-sky-400/70 bg-sky-400/15"}`}
              style={{
                left: `${inst.x}%`,
                top: `${inst.y}%`,
                width: `${inst.w}%`,
                height: `${inst.h}%`,
              }}
            >
              <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-950 px-1 text-[9px] text-slate-200">
                {inst.name}
              </span>
              {selected && !disabled ? (
                <span
                  onPointerDown={(e) => startDrag("resize", inst, e)}
                  className="absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-1/3 translate-y-1/3 cursor-se-resize rounded-sm border border-amber-300 bg-amber-400"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
