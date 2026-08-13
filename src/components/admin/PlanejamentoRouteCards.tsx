import { useState, type ReactNode } from "react";
import type { FlightPlanWaypoint } from "../../types/flightPlanning";
import {
  formatBearingDeg,
  formatCompactAviationCoord,
  formatEteClock,
  formatFuel,
} from "../../lib/flightPlanningRoute";
import type { LegCorridorInfo } from "../../lib/legCorridor";

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
  legs: LegLike[];
  legCorridors: Array<LegCorridorInfo | null | undefined>;
  accumMode: "etapa" | "acumulado";
  fuelUnit: string;
  bulkAltitudeFt: string;
  onBulkAltitudeFtChange: (value: string) => void;
  onApplyBulkAltitude: () => void;
  onAccumModeChange: (mode: "etapa" | "acumulado") => void;
  onAltitudeChange: (index: number, value: string) => void;
  onNoteChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onImport: () => void;
  onExport: () => void;
  waypointDisplayName: (wp: FlightPlanWaypoint) => string;
  noteInput: (props: { value: string; onChange: (v: string) => void }) => ReactNode;
};

export function PlanejamentoRouteCards({
  waypoints,
  legs,
  legCorridors,
  accumMode,
  fuelUnit,
  bulkAltitudeFt,
  onBulkAltitudeFtChange,
  onApplyBulkAltitude,
  onAccumModeChange,
  onAltitudeChange,
  onNoteChange,
  onRemove,
  onMove,
  onImport,
  onExport,
  waypointDisplayName,
  noteInput,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-0.5">
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
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition ${
                accumMode === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-lg text-slate-200"
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
                    className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
                    placeholder="Alt ft"
                    value={bulkAltitudeFt}
                    onChange={(e) => onBulkAltitudeFtChange(e.target.value)}
                  />
                  <button
                    type="button"
                    className="min-h-10 shrink-0 rounded-lg border border-slate-700 px-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
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
                  className="block w-full px-3 py-2.5 text-left text-sm text-cyan-300 hover:bg-slate-900"
                  onClick={() => {
                    setMenuOpen(false);
                    onImport();
                  }}
                >
                  Importar rota
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm text-emerald-300 hover:bg-slate-900 disabled:opacity-40"
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
        <ul className="space-y-2.5">
          {waypoints.map((wp, idx) => {
            const leg = idx > 0 ? legs[idx - 1] : null;
            const corridor = idx > 0 ? legCorridors[idx] : null;
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
                key={`card-${wp.lat}-${wp.lng}-${idx}`}
                className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-30"
                      disabled={idx === 0}
                      aria-label="Mover para cima"
                      onClick={() => onMove(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-30"
                      disabled={idx >= waypoints.length - 1}
                      aria-label="Mover para baixo"
                      onClick={() => onMove(idx, 1)}
                    >
                      ↓
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          #{idx + 1}
                        </p>
                        <p className="truncate text-base font-semibold text-slate-100">
                          {waypointDisplayName(wp)}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {formatCompactAviationCoord(wp.lat, wp.lng)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl text-slate-500 hover:bg-slate-900 hover:text-rose-300"
                        aria-label={`Remover ${waypointDisplayName(wp)}`}
                        onClick={() => onRemove(idx)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Proa</p>
                        <p className="font-semibold text-emerald-400">
                          {leg ? formatBearingDeg(leg.bearingDeg) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Dist</p>
                        <p className="font-mono text-slate-200">
                          {dist != null ? `${dist.toFixed(1)} nm` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Tempo</p>
                        <p className="font-mono text-slate-200">{formatEteClock(ete)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Comb.</p>
                        <p className="font-mono text-slate-200">
                          {fuel != null ? formatFuel(fuel, fuelUnit) : "—"}
                        </p>
                      </div>
                    </div>
                    {corridor ? (
                      <p className="text-[11px] text-cyan-300/90">
                        Corredor {corridor.name}
                        {corridor.altMin != null || corridor.altMax != null
                          ? ` · ${corridor.altMin ?? "—"}–${corridor.altMax ?? "—"} ft`
                          : ""}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block min-w-[7rem] flex-1">
                        <span className="text-[10px] uppercase text-slate-500">Alt ft</span>
                        <input
                          type="number"
                          className="mt-0.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                          value={wp.altitudeFt ?? ""}
                          placeholder="—"
                          onChange={(e) => onAltitudeChange(idx, e.target.value)}
                        />
                      </label>
                      <div className="min-w-[10rem] flex-[2]">
                        <span className="text-[10px] uppercase text-slate-500">Obs</span>
                        <div className="mt-0.5">
                          {noteInput({
                            value: wp.note ?? "",
                            onChange: (v) => onNoteChange(idx, v),
                          })}
                        </div>
                      </div>
                    </div>
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
