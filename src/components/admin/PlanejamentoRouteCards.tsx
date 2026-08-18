import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { AltitudeRefMode, FlightPlanWaypoint } from "../../types/flightPlanning";
import {
  formatBearingDeg,
  formatCompactAviationCoord,
  formatEteClock,
  formatFuel,
} from "../../lib/flightPlanningRoute";
import type { LegCorridorInfo } from "../../lib/legCorridor";
import { altitudeRefMode } from "../../lib/routePerformanceProfile";
import type { RouteTableViewRow } from "../../lib/routeTableDisplay";

type LegLike = {
  bearingDeg: number;
  distanceNm: number;
  cumulativeDistanceNm: number;
  eteHours: number | null;
  cumulativeEteHours: number | null;
  fuelEstimate: number | null;
  cumulativeFuel: number | null;
};

type Props = {
  waypoints: FlightPlanWaypoint[];
  tableViewRows: RouteTableViewRow[];
  legs: LegLike[];
  legCorridors: Array<LegCorridorInfo | null | undefined>;
  accumMode: "etapa" | "acumulado";
  fuelUnit: string;
  bulkAltitudeFt: string;
  onBulkAltitudeFtChange: (value: string) => void;
  onApplyBulkAltitude: () => void;
  onAccumModeChange: (mode: "etapa" | "acumulado") => void;
  onAltitudeChange: (index: number, value: string) => void;
  onAltitudeRefChange: (index: number, mode: AltitudeRefMode) => void;
  onNoteChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onImport: () => void;
  onExport: () => void;
  waypointDisplayName: (wp: FlightPlanWaypoint) => string;
  noteInput: (props: { value: string; onChange: (v: string) => void }) => ReactNode;
};

const ALTITUDE_REF_OPTIONS: Array<{ id: AltitudeRefMode; label: string; title: string; active: string }> = [
  { id: "bs", label: "BS", title: "Before Segment: sobe/desce logo antes de começar o segmento", active: "bg-sky-500/20 text-sky-200" },
  { id: "as", label: "AS", title: "After Segment: sobe/desce logo após iniciar o segmento", active: "bg-emerald-500/20 text-emerald-200" },
  { id: "be", label: "BE", title: "Before End: atinge a altitude no ponto final do segmento", active: "bg-cyan-500/20 text-cyan-200" },
  { id: "ae", label: "AE", title: "After End: sobe/desce logo após passar o ponto", active: "bg-amber-500/20 text-amber-200" },
];

export function AltitudeRefToggle({
  value,
  onChange,
}: {
  value: AltitudeRefMode;
  onChange: (mode: AltitudeRefMode) => void;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded border border-slate-700 bg-slate-950"
      title="BS Before Segment · AS After Segment · BE Before End · AE After End"
    >
      {ALTITUDE_REF_OPTIONS.map((opt, i) => (
        <button
          key={opt.id}
          type="button"
          className={`${i === 0 ? "" : "border-l border-slate-700 "}px-1.5 py-0.5 text-[9px] font-bold transition ${
            value === opt.id ? opt.active : "text-slate-500 hover:text-slate-300"
          }`}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function IconGrip() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
  );
}

export function PlanejamentoRouteCards({
  waypoints,
  tableViewRows,
  legs: _legs,
  legCorridors: _legCorridors,
  accumMode,
  fuelUnit,
  bulkAltitudeFt,
  onBulkAltitudeFtChange,
  onApplyBulkAltitude,
  onAccumModeChange,
  onAltitudeChange,
  onAltitudeRefChange,
  onNoteChange,
  onRemove,
  onReorder,
  onImport,
  onExport,
  waypointDisplayName,
  noteInput,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  function indexFromClientY(y: number, fallback: number) {
    let over = fallback;
    let best = Infinity;
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        over = i;
        best = 0;
        return;
      }
      const d = Math.abs(y - (rect.top + rect.bottom) / 2);
      if (d < best) {
        best = d;
        over = i;
      }
    });
    return over;
  }

  function onGripPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndexRef.current = index;
    setDragIndex(index);
    setDragOverIndex(index);
  }

  function onGripPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const from = dragIndexRef.current;
    if (from == null) return;
    setDragOverIndex(indexFromClientY(event.clientY, from));
  }

  function onGripPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const from = dragIndexRef.current;
    const to = from == null ? null : indexFromClientY(event.clientY, from);
    dragIndexRef.current = null;
    if (from != null && to != null) onReorder(from, to);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className="space-y-2 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {(
              [
                ["etapa", "Etapa"],
                ["acumulado", "Acumulado"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onAccumModeChange(id)}
                className={`min-h-8 rounded-md px-2.5 text-[11px] font-semibold transition ${
                  accumMode === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-base text-slate-200"
            aria-label="Mais ações"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Fechar menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 py-1 shadow-xl">
                <div className="flex items-center gap-1.5 border-b border-slate-800 px-2 py-2">
                  <input
                    type="number"
                    className="h-8 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                    placeholder="Alt ft"
                    value={bulkAltitudeFt}
                    onChange={(e) => onBulkAltitudeFtChange(e.target.value)}
                  />
                  <button
                    type="button"
                    className="h-8 shrink-0 rounded-lg border border-slate-700 px-2 text-[11px] font-semibold text-slate-200 disabled:opacity-40"
                    disabled={waypoints.length < 2 || !bulkAltitudeFt.trim()}
                    onClick={() => {
                      onApplyBulkAltitude();
                      setMenuOpen(false);
                    }}
                  >
                    Alt. todos
                  </button>
                </div>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-cyan-300 hover:bg-slate-900"
                  onClick={() => {
                    setMenuOpen(false);
                    onImport();
                  }}
                >
                  Importar rota
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-emerald-300 hover:bg-slate-900 disabled:opacity-40"
                  disabled={waypoints.length < 2}
                  onClick={() => {
                    setMenuOpen(false);
                    onExport();
                  }}
                >
                  Exportar FPL
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {waypoints.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-8 text-center text-sm text-slate-500">
          Adicione pontos no mapa ou pela busca para montar a rota.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tableViewRows.map((row) => {
            if (row.kind !== "waypoint") {
              const dist = accumMode === "acumulado" ? row.cumulativeNm : row.distanceNm;
              const ete = accumMode === "acumulado" ? row.cumulativeEteHours : row.eteHours;
              const fuel = accumMode === "acumulado" ? row.cumulativeFuel : row.fuel;
              const isToc = row.kind === "toc";
              return (
                <li
                  key={row.key}
                  className={`rounded-xl border px-3 py-2 ${
                    isToc ? "border-violet-500/40 bg-violet-500/10" : "border-fuchsia-500/40 bg-fuchsia-500/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isToc ? "text-violet-300" : "text-fuchsia-300"}`}>
                      {row.label}
                    </span>
                    <p className={`min-w-0 truncate text-sm font-semibold ${isToc ? "text-violet-100" : "text-fuchsia-100"}`}>
                      {isToc ? "Topo de subida" : "Topo de descida"}
                    </p>
                    <span className="ml-auto font-mono text-[11px] text-slate-200">{Math.round(row.altFt)} ft</span>
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-x-2 text-[11px]">
                    <p>
                      <span className="text-slate-500">Proa </span>
                      <span className="font-semibold text-emerald-400">{row.bearing}</span>
                    </p>
                    <p>
                      <span className="text-slate-500">Dist </span>
                      <span className="font-mono text-slate-200">{dist.toFixed(1)}</span>
                    </p>
                    <p>
                      <span className="text-slate-500">ETE </span>
                      <span className="font-mono text-slate-200">{formatEteClock(ete)}</span>
                    </p>
                    <p>
                      <span className="text-slate-500">Comb </span>
                      <span className="font-mono text-slate-200">
                        {fuel != null ? formatFuel(fuel, fuelUnit) : "—"}
                      </span>
                    </p>
                  </div>
                </li>
              );
            }
            const wp = row.wp;
            const idx = row.wpIndex;
            const leg = row.leg;
            const corridor = row.corridor;
            const dist =
              leg == null
                ? null
                : accumMode === "acumulado"
                  ? leg.cumulativeDistanceNm
                  : leg.distanceNm;
            const ete =
              leg == null
                ? null
                : accumMode === "acumulado"
                  ? leg.cumulativeEteHours
                  : leg.eteHours;
            const fuel =
              leg == null
                ? null
                : accumMode === "acumulado"
                  ? leg.cumulativeFuel
                  : leg.fuelEstimate;
            return (
              <li
                key={row.key}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className={`rounded-xl border bg-slate-950/60 px-2 py-1.5 ${
                  dragOverIndex === idx ? "border-emerald-400/70 bg-emerald-500/10" : "border-slate-700/80"
                } ${dragIndex === idx ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-500 active:cursor-grabbing"
                    aria-label={`Arrastar ${waypointDisplayName(wp)}`}
                    onPointerDown={(event) => onGripPointerDown(event, idx)}
                    onPointerMove={onGripPointerMove}
                    onPointerUp={onGripPointerUp}
                    onPointerCancel={onGripPointerUp}
                  >
                    <IconGrip />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-[10px] font-semibold text-slate-500">#{idx + 1}</span>
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-100">
                        {waypointDisplayName(wp)}
                      </p>
                      <p className="hidden min-w-0 truncate font-mono text-[10px] text-slate-500 sm:block">
                        {formatCompactAviationCoord(wp.lat, wp.lng)}
                      </p>
                      <button
                        type="button"
                        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-900 hover:text-rose-300"
                        aria-label={`Remover ${waypointDisplayName(wp)}`}
                        onClick={() => onRemove(idx)}
                      >
                        ×
                      </button>
                    </div>
                    <p className="font-mono text-[10px] text-slate-500 sm:hidden">
                      {formatCompactAviationCoord(wp.lat, wp.lng)}
                    </p>
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-4 gap-x-2 pl-9 text-[11px]">
                  <p>
                    <span className="text-slate-500">Proa </span>
                    <span className="font-semibold text-emerald-400">
                      {leg ? formatBearingDeg(leg.bearingDeg) : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Dist </span>
                    <span className="font-mono text-slate-200">
                      {dist != null ? `${dist.toFixed(1)}` : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">ETE </span>
                    <span className="font-mono text-slate-200">{formatEteClock(ete)}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Comb </span>
                    <span className="font-mono text-slate-200">
                      {fuel != null ? formatFuel(fuel, fuelUnit) : "—"}
                    </span>
                  </p>
                </div>
                {corridor ? (
                  <p className="mt-0.5 truncate pl-9 text-[10px] text-cyan-300/90">
                    {corridor.name}
                    {corridor.altMin != null || corridor.altMax != null
                      ? ` · ${corridor.altMin ?? "—"}–${corridor.altMax ?? "—"} ft`
                      : ""}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-9">
                  <label className="flex w-[5.5rem] shrink-0 items-center gap-1">
                    <span className="text-[10px] uppercase text-slate-500">Alt</span>
                    <input
                      type="number"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      value={wp.altitudeFt ?? ""}
                      placeholder="—"
                      onChange={(e) => onAltitudeChange(idx, e.target.value)}
                    />
                  </label>
                  {idx > 0 && idx < waypoints.length - 1 ? (
                    <AltitudeRefToggle value={altitudeRefMode(wp)} onChange={(mode) => onAltitudeRefChange(idx, mode)} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {noteInput({
                      value: wp.note ?? "",
                      onChange: (v) => onNoteChange(idx, v),
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
