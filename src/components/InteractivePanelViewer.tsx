import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { hasPanelModel } from "../lib/panelPayload";
import type { AircraftPanel, PanelInstrument } from "../types/panel";

const PanelModelCanvas = lazy(() =>
  import("./panel/PanelModelCanvas").then((mod) => ({ default: mod.PanelModelCanvas })),
);

type AircraftOption = {
  id: string;
  label: string;
};

type Props = {
  panels: AircraftPanel[];
  aircraftOptions: AircraftOption[];
  /** When set, lock to this panel (admin preview). */
  fixedPanelId?: string | null;
  emptyMessage?: string;
};

function HotspotButton({
  instrument,
  onClick,
  showLabel,
}: {
  instrument: PanelInstrument;
  onClick: () => void;
  showLabel?: boolean;
}) {
  const isCircle = instrument.shape === "circle";
  return (
    <button
      type="button"
      onClick={onClick}
      title={instrument.name}
      aria-label={instrument.name}
      className={`absolute z-10 border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        isCircle ? "rounded-full" : "rounded-md"
      } border-sky-400/50 bg-sky-400/10 hover:border-sky-300 hover:bg-sky-400/25`}
      style={{
        left: `${instrument.x}%`,
        top: `${instrument.y}%`,
        width: `${instrument.w}%`,
        height: `${instrument.h}%`,
        minWidth: 28,
        minHeight: 28,
      }}
    >
      {showLabel ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-medium text-sky-200 opacity-0 shadow transition group-hover:opacity-100 peer-hover:opacity-100">
          {instrument.name}
        </span>
      ) : null}
    </button>
  );
}

function InstrumentModal({
  instrument,
  panelImageUrl,
  onClose,
}: {
  instrument: PanelInstrument;
  panelImageUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomSrc = instrument.zoom_image_url || panelImageUrl;
  const useCropFallback = !instrument.zoom_image_url && Boolean(panelImageUrl);
  const hasVisual = Boolean(instrument.zoom_image_url || panelImageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-instrument-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Instrumento</p>
            <h2 id="panel-instrument-title" className="text-lg font-semibold text-slate-100">
              {instrument.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {hasVisual ? (
            <div
              className={`mx-auto overflow-hidden border border-slate-800 bg-slate-900 ${
                instrument.shape === "circle" ? "aspect-square max-w-sm rounded-full" : "rounded-xl"
              }`}
            >
              {useCropFallback ? (
                <div
                  className="h-64 w-full bg-cover bg-no-repeat sm:h-80"
                  style={{
                    backgroundImage: `url(${panelImageUrl})`,
                    backgroundPosition: `${instrument.x + instrument.w / 2}% ${instrument.y + instrument.h / 2}%`,
                    backgroundSize: `${Math.max(120, 10000 / Math.max(instrument.w, 8))}%`,
                  }}
                  role="img"
                  aria-label={instrument.name}
                />
              ) : (
                <img src={zoomSrc} alt={instrument.name} className="mx-auto max-h-[50vh] w-full object-contain" />
              )}
            </div>
          ) : null}
          {instrument.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{instrument.description}</p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Sem descrição cadastrada para este instrumento.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function InteractivePanelViewer({
  panels,
  aircraftOptions,
  fixedPanelId = null,
  emptyMessage = "Nenhum painel publicado ainda.",
}: Props) {
  const published = useMemo(
    () => (fixedPanelId ? panels.filter((p) => p.id === fixedPanelId) : panels.filter((p) => p.published)),
    [panels, fixedPanelId],
  );

  const labelByAircraft = useMemo(() => {
    const map = new Map(aircraftOptions.map((a) => [a.id, a.label]));
    return map;
  }, [aircraftOptions]);

  const [selectedId, setSelectedId] = useState<string>("");
  const [active, setActive] = useState<PanelInstrument | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");

  useEffect(() => {
    if (fixedPanelId) {
      setSelectedId(fixedPanelId);
      return;
    }
    if (!published.length) {
      setSelectedId("");
      return;
    }
    if (!published.some((p) => p.id === selectedId)) {
      setSelectedId(published[0]!.id);
    }
  }, [published, selectedId, fixedPanelId]);

  const panel = published.find((p) => p.id === selectedId) ?? null;
  const instruments = useMemo(
    () => [...(panel?.instruments ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [panel],
  );
  const show3d = Boolean(panel && hasPanelModel(panel) && (viewMode === "3d" || !panel.panel_image_url));
  const show2d = Boolean(panel?.panel_image_url && (!hasPanelModel(panel) || viewMode === "2d"));

  useEffect(() => {
    setViewMode(panel?.panel_model_url?.trim() ? "3d" : "2d");
  }, [panel?.id, panel?.panel_model_url]);

  if (!published.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!fixedPanelId ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Painel interativo</h2>
            <p className="text-sm text-slate-400">
              {show3d
                ? "Gire o painel e toque em um instrumento para ver o zoom e os detalhes."
                : "Toque em um instrumento para ver o zoom e os detalhes."}
            </p>
          </div>
          <label className="block text-sm sm:w-72">
            <span className="mb-1 block text-xs font-medium text-slate-400">Aeronave</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              {published.map((p) => (
                <option key={p.id} value={p.id}>
                  {labelByAircraft.get(p.aircraft_id) ?? p.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {panel ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
            <div>
              {panel.title}
              {labelByAircraft.get(panel.aircraft_id) ? (
                <span className="text-slate-600"> · {labelByAircraft.get(panel.aircraft_id)}</span>
              ) : null}
            </div>
            {hasPanelModel(panel) && panel.panel_image_url ? (
              <div className="flex rounded-lg border border-slate-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("3d")}
                  className={`rounded-md px-2 py-1 text-[11px] ${
                    viewMode === "3d" ? "bg-sky-600 text-white" : "text-slate-400"
                  }`}
                >
                  3D
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("2d")}
                  className={`rounded-md px-2 py-1 text-[11px] ${
                    viewMode === "2d" ? "bg-sky-600 text-white" : "text-slate-400"
                  }`}
                >
                  Foto
                </button>
              </div>
            ) : hasPanelModel(panel) ? (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">3D</span>
            ) : null}
          </div>
          {show3d && panel.panel_model_url ? (
            <Suspense
              fallback={
                <div className="grid h-[min(72vh,640px)] min-h-[420px] place-items-center text-sm text-slate-400">
                  Carregando painel 3D...
                </div>
              }
            >
              <PanelModelCanvas
                modelUrl={panel.panel_model_url}
                instruments={instruments}
                mode="view"
                onSelect={setActive}
              />
            </Suspense>
          ) : null}
          {show2d ? (
            <div className="relative w-full select-none">
              <img
                src={panel.panel_image_url}
                alt={panel.title}
                className="block w-full"
                draggable={false}
                decoding="async"
                style={{ imageRendering: "auto" }}
              />
              {instruments.map((inst) => (
                <HotspotButton key={inst.id} instrument={inst} onClick={() => setActive(inst)} />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-slate-800 px-4 py-3">
            {instruments.map((inst) => (
              <button
                key={`chip-${inst.id}`}
                type="button"
                onClick={() => setActive(inst)}
                className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-sky-600 hover:text-sky-200"
              >
                {inst.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {active && panel ? (
        <InstrumentModal instrument={active} panelImageUrl={panel.panel_image_url} onClose={() => setActive(null)} />
      ) : null}
    </div>
  );
}
