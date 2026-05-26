/**
 * Barra horizontal com as pernas do circuito de tráfego.
 * Exibe apenas "Do vento", "Base" e "Final" (crosswind omitido).
 * As pernas são sempre consecutivas — gaps preenchidos pelo ponto médio.
 */

import { useState } from "react";
import { makeConsecutiveLegs } from "../lib/trafficPattern";
import type { PatternLeg, PatternLegType, TrafficPatternAnalysis } from "../types/flight";

// Mesmos valores do CanvasPanelChart (compact=false)
const CHART_LEFT_PX  = 44;
const CHART_RIGHT_PX = 10;

const LEG_COLORS: Record<PatternLegType, { bg: string; text: string; border: string }> = {
  crosswind: { bg: "rgba(147,197,253,0.25)", text: "#93c5fd", border: "rgba(147,197,253,0.5)" },
  downwind:  { bg: "rgba(196,181,253,0.25)", text: "#c4b5fd", border: "rgba(196,181,253,0.5)" },
  base:      { bg: "rgba(253,186,116,0.25)", text: "#fdba74", border: "rgba(253,186,116,0.5)" },
  final:     { bg: "rgba(134,239,172,0.25)", text: "#86efac", border: "rgba(134,239,172,0.5)" },
};

const LEG_LABELS: Record<PatternLegType, string> = {
  crosswind: "Vento cruzado",
  downwind:  "Do vento",
  base:      "Base",
  final:     "Final",
};

type Props = {
  pattern: TrafficPatternAnalysis;
  /** Domínio visível do gráfico [xMin, xMax] em ms offset. */
  xDomain: [number, number];
  className?: string;
};

function legPositionStyle(
  leg: PatternLeg,
  xMin: number,
  xMax: number,
): React.CSSProperties {
  const span = xMax - xMin || 1;
  const clampedStart = Math.max(xMin, leg.startX);
  const clampedEnd   = Math.min(xMax, leg.endX);
  if (clampedEnd <= clampedStart) return { display: "none" };
  const leftPct  = ((clampedStart - xMin) / span) * 100;
  const widthPct = ((clampedEnd  - clampedStart) / span) * 100;
  return { left: `${leftPct}%`, width: `${widthPct}%` };
}

export function PatternLegBar({ pattern, xDomain, className = "" }: Props) {
  const [tooltip, setTooltip] = useState<{ leg: PatternLeg; x: number } | null>(null);
  const [xMin, xMax] = xDomain;

  const legs = makeConsecutiveLegs(pattern.legs, xMin, xMax, pattern.touchdownX);
  if (legs.length === 0) return null;

  return (
    <div
      className={`relative select-none ${className}`}
      style={{
        height: 28,
        paddingLeft: CHART_LEFT_PX,
        paddingRight: CHART_RIGHT_PX,
      }}
    >
      {/* Trilho de fundo */}
      <div className="relative h-full w-full overflow-hidden rounded-sm bg-slate-900/60">

        {/* Faixas das pernas */}
        {legs.map((leg, i) => {
          const posStyle = legPositionStyle(leg, xMin, xMax);
          if (posStyle.display === "none") return null;
          const colors = LEG_COLORS[leg.type];
          return (
            <div
              key={i}
              className="absolute inset-y-0 flex items-center justify-center overflow-hidden px-1"
              style={{
                ...posStyle,
                background: colors.bg,
                borderLeft: `1px solid ${colors.border}`,
                borderRight: `1px solid ${colors.border}`,
              }}
              onMouseEnter={(e) => setTooltip({ leg, x: e.clientX })}
              onMouseLeave={() => setTooltip(null)}
            >
              <span
                className="truncate text-[10px] font-medium"
                style={{ color: colors.text }}
              >
                {LEG_LABELS[leg.type]}
              </span>
            </div>
          );
        })}

        {/* Badge da pista (canto direito) */}
        {pattern.runwayIdent && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
            <span className="rounded bg-slate-800/80 px-1 py-0.5 text-[9px] font-semibold text-slate-400">
              RWY {pattern.runwayIdent}
            </span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-300 shadow-lg"
          style={{ left: tooltip.x + 8, top: "auto", transform: "translateY(-110%)" }}
        >
          <div className="font-semibold" style={{ color: LEG_COLORS[tooltip.leg.type].text }}>
            {LEG_LABELS[tooltip.leg.type]}
          </div>
          {tooltip.leg.startAglFt !== null && (
            <div className="text-slate-400">
              AGL entrada: {Math.round(tooltip.leg.startAglFt)} ft
            </div>
          )}
          {tooltip.leg.endAglFt !== null && (
            <div className="text-slate-400">
              AGL saída: {Math.round(tooltip.leg.endAglFt)} ft
            </div>
          )}
          {pattern.runwayIdent && (
            <div className="text-slate-500">
              {pattern.sourceIsDb ? "✓ dados da base" : "derivado telemetria"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
