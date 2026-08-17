import { createPanelInstrument, has3dHotspot } from "../../lib/panelPayload";
import type { PanelInstrument } from "../../types/panel";
import { PanelModelCanvas } from "./PanelModelCanvas";

type Props = {
  modelUrl: string;
  instruments: PanelInstrument[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: PanelInstrument[]) => void;
  disabled?: boolean;
};

export function PanelModelHotspotEditor({
  modelUrl,
  instruments,
  selectedId,
  onSelect,
  onChange,
  disabled = false,
}: Props) {
  const selected = instruments.find((item) => item.id === selectedId) ?? null;
  const placedCount = instruments.filter(has3dHotspot).length;

  function addInstrument() {
    if (disabled) return;
    const next = createPanelInstrument({
      sort_order: instruments.length + 1,
    });
    onChange([...instruments, next]);
    onSelect(next.id);
  }

  function placeAt(point: { x: number; y: number; z: number }) {
    if (disabled) return;
    if (selectedId) {
      onChange(
        instruments.map((item) =>
          item.id === selectedId ? { ...item, pos_x: point.x, pos_y: point.y, pos_z: point.z } : item,
        ),
      );
      return;
    }
    const next = createPanelInstrument({
      sort_order: instruments.length + 1,
      pos_x: point.x,
      pos_y: point.y,
      pos_z: point.z,
    });
    onChange([...instruments, next]);
    onSelect(next.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addInstrument}
          disabled={disabled}
          className="rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-900/50 disabled:opacity-50"
        >
          + Adicionar instrumento
        </button>
        <span className="text-[11px] text-slate-500">
          {selected
            ? `Clique no modelo para posicionar “${selected.name}”.`
            : "Selecione um instrumento e clique no modelo para posicionar o hotspot."}
        </span>
        <span className="text-[11px] text-slate-600">
          {placedCount}/{instruments.length} posicionados
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <PanelModelCanvas
          modelUrl={modelUrl}
          instruments={instruments}
          selectedId={selectedId}
          mode="edit"
          disabled={disabled}
          className="h-[min(64vh,560px)] min-h-[380px]"
          onSelect={(instrument) => onSelect(instrument.id)}
          onSelectId={onSelect}
          onPlace={placeAt}
        />
      </div>
    </div>
  );
}
