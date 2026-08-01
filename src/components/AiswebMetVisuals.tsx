import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { AiswebCloudLayer, AiswebParsedMetar, AiswebRotaer, AiswebRunway } from "../types/aisweb";
import {
  analyzeWindVsRunways,
  describeWeatherTokens,
  formatWind,
  type AiswebWeatherDetail,
  type AiswebWeatherIntensity,
} from "../lib/aiswebMetar";

function coverLabel(cover: string, convect?: "CB" | "TCU" | null): string {
  const base =
    cover === "FEW"
      ? "Few"
      : cover === "SCT"
        ? "Scattered"
        : cover === "BKN"
          ? "Broken"
          : cover === "OVC"
            ? "Overcast"
            : cover === "VV"
              ? "Vertical"
              : cover;
  if (convect === "CB") return `${base} · CB`;
  if (convect === "TCU") return `${base} · TCU`;
  return base;
}

/** Fraction of the horizon line occupied by this cover (≈ oktas / 8). */
function coverFillFraction(cover: string): number {
  switch (cover) {
    case "FEW":
      return 1.5 / 8; // ~19%
    case "SCT":
      return 0.35; // ~3/8, spread across horizon
    case "BKN":
      return 6 / 8; // 75%
    case "OVC":
    case "VV":
      return 1;
    default:
      return 0.3;
  }
}

function primaryRunways(runways: AiswebRunway[] | undefined): AiswebRunway[] {
  const list = runways || [];
  if (!list.length) return [];
  return [...list]
    .sort((a, b) => (b.lengthM || 0) - (a.lengthM || 0))
    .slice(0, 2);
}

/** Annular sector path for wind variation (degrees from north, clockwise). */
function windVariationSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  fromDeg: number,
  toDeg: number,
): string {
  let sweep = ((toDeg - fromDeg) % 360 + 360) % 360;
  if (sweep === 0) sweep = 360;
  const large = sweep > 180 ? 1 : 0;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const a0 = toRad(fromDeg);
  const a1 = toRad(fromDeg + sweep);
  const x0o = cx + Math.cos(a0) * rOuter;
  const y0o = cy + Math.sin(a0) * rOuter;
  const x1o = cx + Math.cos(a1) * rOuter;
  const y1o = cy + Math.sin(a1) * rOuter;
  const x1i = cx + Math.cos(a1) * rInner;
  const y1i = cy + Math.sin(a1) * rInner;
  const x0i = cx + Math.cos(a0) * rInner;
  const y0i = cy + Math.sin(a0) * rInner;
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

/** Arrow glyph: outer tip at local north (FROM), head points to center. */
function WindArrowGlyph({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <g className="aisweb-wind-flow">
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M ${cx} ${cy - r + 18 + i * 10} L ${cx - 4.5} ${cy - r + 10 + i * 10} M ${cx} ${cy - r + 18 + i * 10} L ${cx + 4.5} ${cy - r + 10 + i * 10}`}
            stroke="rgb(125 211 252)"
            strokeWidth={1.7 - i * 0.12}
            strokeLinecap="round"
            fill="none"
            opacity={0.95 - i * 0.1}
            className="aisweb-wind-streak"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </g>
      <line
        x1={cx}
        y1={cy - r + 14}
        x2={cx}
        y2={cy - 30}
        stroke="rgb(56 189 248)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.92"
        className="aisweb-wind-shaft"
      />
      <path
        d={`M ${cx} ${cy - 18} L ${cx - 9} ${cy - 36} L ${cx} ${cy - 29} L ${cx + 9} ${cy - 36} Z`}
        fill="rgb(56 189 248)"
        stroke="rgb(186 230 253)"
        strokeWidth="0.8"
        className="aisweb-wind-head"
      />
    </>
  );
}

/** Wind rose: 360° circle, runway(s) by heading TO, wind FROM flowing onto runway. */
export function AiswebWindRose({
  parsed,
  rotaer,
}: {
  parsed: AiswebParsedMetar | null;
  rotaer: AiswebRotaer | null;
}) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = 88;
  const windDir = parsed?.windDirDeg;
  const windSpeed = parsed?.windSpeedKt ?? null;
  const windGust = parsed?.windGustKt ?? null;
  const analysis = analyzeWindVsRunways(parsed, rotaer?.runways);
  const runways = primaryRunways(rotaer?.runways);
  const vrb = windDir == null && windSpeed != null;
  const windRotate = windDir == null ? 0 : windDir;
  const varFrom = parsed?.windVarFromDeg;
  const varTo = parsed?.windVarToDeg;
  const hasVar = varFrom != null && varTo != null;
  const varSweep = hasVar ? ((varTo - varFrom) % 360 + 360) % 360 || 360 : 0;
  const varDur = `${Math.max(5.5, (varSweep / 60) * 2.8)}s`;

  const ticks = [0, 45, 90, 135, 180, 225, 270, 315];
  const labels: Array<{ deg: number; text: string }> = [
    { deg: 0, text: "N" },
    { deg: 90, text: "L" },
    { deg: 180, text: "S" },
    { deg: 270, text: "O" },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-gradient-to-b from-slate-950/80 to-slate-900/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vento</p>
        <p className="font-mono text-xs text-slate-300">{formatWind(parsed)}</p>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-visible">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <radialGradient id="aisweb-wind-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.18" />
              <stop offset="70%" stopColor="rgb(15 23 42)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="aisweb-rwy" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(71 85 105)" />
              <stop offset="50%" stopColor="rgb(148 163 184)" />
              <stop offset="100%" stopColor="rgb(71 85 105)" />
            </linearGradient>
            <linearGradient id="aisweb-var-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(14 165 233)" stopOpacity="0.12" />
            </linearGradient>
          </defs>

          <circle cx={cx} cy={cy} r={r + 8} fill="url(#aisweb-wind-glow)" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="rgb(2 6 23 / 0.75)"
            stroke="rgb(71 85 105 / 0.9)"
            strokeWidth="1.5"
          />
          <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke="rgb(51 65 85 / 0.55)" strokeDasharray="2 6" />

          {hasVar ? (
            <g>
              <path
                d={windVariationSectorPath(cx, cy, r - 6, r + 10, varFrom, varTo)}
                fill="url(#aisweb-var-fill)"
                stroke="rgb(56 189 248 / 0.55)"
                strokeWidth="1"
                className="aisweb-wind-var-arc"
              />
              {/* Tick marks at variation limits */}
              {[varFrom, varTo].map((deg) => {
                const rad = ((deg - 90) * Math.PI) / 180;
                return (
                  <line
                    key={deg}
                    x1={cx + Math.cos(rad) * (r - 8)}
                    y1={cy + Math.sin(rad) * (r - 8)}
                    x2={cx + Math.cos(rad) * (r + 12)}
                    y2={cy + Math.sin(rad) * (r + 12)}
                    stroke="rgb(125 211 252)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          ) : null}

          {ticks.map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const major = deg % 90 === 0;
            const inner = r - (major ? 12 : 7);
            const outer = r - 2;
            return (
              <line
                key={deg}
                x1={cx + Math.cos(rad) * inner}
                y1={cy + Math.sin(rad) * inner}
                x2={cx + Math.cos(rad) * outer}
                y2={cy + Math.sin(rad) * outer}
                stroke={major ? "rgb(148 163 184)" : "rgb(71 85 105)"}
                strokeWidth={major ? 1.6 : 1}
              />
            );
          })}

          {labels.map(({ deg, text }) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const lr = r - 22;
            return (
              <text
                key={text}
                x={cx + Math.cos(rad) * lr}
                y={cy + Math.sin(rad) * lr}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                {text}
              </text>
            );
          })}

          {runways.map((runway, idx) => {
            const thrA = runway.thresholds[0];
            const thrB = runway.thresholds[1];
            const axisHeading = thrA?.headingDeg;
            if (axisHeading == null) return null;
            const isBest =
              analysis.bestIdent != null &&
              runway.thresholds.some((t) => t.ident === analysis.bestIdent);
            const bestThr = runway.thresholds.find((t) => t.ident === analysis.bestIdent) || null;
            // Longer than diameter so the strip overflows the circle.
            const len = idx === 0 ? 168 : 142;
            const width = idx === 0 ? 12 : 8;
            return (
              <g key={runway.ident} transform={`rotate(${axisHeading} ${cx} ${cy})`}>
                <rect
                  x={cx - width / 2}
                  y={cy - len / 2}
                  width={width}
                  height={len}
                  rx={1.5}
                  fill={isBest ? "url(#aisweb-rwy)" : "rgb(100 116 139 / 0.75)"}
                  stroke={isBest ? "rgb(56 189 248)" : "rgb(71 85 105)"}
                  strokeWidth={isBest ? 1.2 : 0.8}
                  opacity={isBest ? 1 : 0.55}
                />
                <line
                  x1={cx}
                  y1={cy - len / 2 + 8}
                  x2={cx}
                  y2={cy + len / 2 - 8}
                  stroke="rgb(15 23 42 / 0.7)"
                  strokeWidth="1.2"
                  strokeDasharray="5 3"
                />
                {thrA ? (
                  <g transform={`rotate(${-axisHeading} ${cx} ${cy + len / 2 + 14})`}>
                    <rect
                      x={cx - 14}
                      y={cy + len / 2 + 3}
                      width={28}
                      height={14}
                      rx={3}
                      fill={bestThr?.ident === thrA.ident ? "rgb(8 47 73)" : "rgb(15 23 42 / 0.92)"}
                      stroke={bestThr?.ident === thrA.ident ? "rgb(34 211 238)" : "rgb(71 85 105)"}
                      strokeWidth="1"
                    />
                    <text
                      x={cx}
                      y={cy + len / 2 + 13}
                      textAnchor="middle"
                      className={`text-[11px] font-bold ${
                        bestThr?.ident === thrA.ident ? "fill-cyan-200" : isBest ? "fill-slate-100" : "fill-slate-400"
                      }`}
                    >
                      {thrA.ident}
                    </text>
                  </g>
                ) : null}
                {thrB ? (
                  <g transform={`rotate(${-axisHeading} ${cx} ${cy - len / 2 - 6})`}>
                    <rect
                      x={cx - 14}
                      y={cy - len / 2 - 17}
                      width={28}
                      height={14}
                      rx={3}
                      fill={bestThr?.ident === thrB.ident ? "rgb(8 47 73)" : "rgb(15 23 42 / 0.92)"}
                      stroke={bestThr?.ident === thrB.ident ? "rgb(34 211 238)" : "rgb(71 85 105)"}
                      strokeWidth="1"
                    />
                    <text
                      x={cx}
                      y={cy - len / 2 - 7}
                      textAnchor="middle"
                      className={`text-[11px] font-bold ${
                        bestThr?.ident === thrB.ident ? "fill-cyan-200" : isBest ? "fill-slate-100" : "fill-slate-400"
                      }`}
                    >
                      {thrB.ident}
                    </text>
                  </g>
                ) : null}
                {bestThr ? (
                  <g transform={bestThr.ident === thrA?.ident ? undefined : `rotate(180 ${cx} ${cy})`}>
                    <path
                      d={`M ${cx} ${cy - len / 2 + 18} L ${cx - 6} ${cy - len / 2 + 32} L ${cx} ${cy - len / 2 + 27} L ${cx + 6} ${cy - len / 2 + 32} Z`}
                      fill="rgb(34 211 238)"
                      stroke="rgb(165 243 252)"
                      strokeWidth="0.6"
                    />
                  </g>
                ) : null}
              </g>
            );
          })}

          {windSpeed != null && windSpeed > 0 ? (
            <g>
              {vrb && !hasVar ? (
                <g>
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${cx} ${cy}`}
                    to={`360 ${cx} ${cy}`}
                    dur="16s"
                    repeatCount="indefinite"
                  />
                  <WindArrowGlyph cx={cx} cy={cy} r={r} />
                </g>
              ) : hasVar ? (
                <g>
                  {/* METAR dddVddd is clockwise from→to. Animate via from+sweep so
                      270→020 goes through north (270→380), not the long way down. */}
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    values={`${varFrom as number} ${cx} ${cy};${(varFrom as number) + varSweep} ${cx} ${cy};${varFrom as number} ${cx} ${cy}`}
                    keyTimes="0;0.5;1"
                    dur={varDur}
                    calcMode="spline"
                    keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
                    repeatCount="indefinite"
                  />
                  <WindArrowGlyph cx={cx} cy={cy} r={r} />
                </g>
              ) : (
                <g transform={`rotate(${windRotate} ${cx} ${cy})`}>
                  <WindArrowGlyph cx={cx} cy={cy} r={r} />
                </g>
              )}
            </g>
          ) : null}

          <circle cx={cx} cy={cy} r={22} fill="rgb(15 23 42 / 0.92)" stroke="rgb(71 85 105)" strokeWidth="1" />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-100 text-[13px] font-bold"
          >
            {windSpeed == null ? "—" : `${windSpeed}`}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-500 text-[8px] font-semibold uppercase"
          >
            {windGust != null ? `G${windGust}` : "kt"}
          </text>
        </svg>
      </div>
      <div className="mt-2 space-y-0.5 text-center text-[11px] text-slate-400">
        {vrb ? <p>Direção variável (VRB)</p> : null}
        {hasVar ? (
          <p>
            Variação{" "}
            <span className="font-mono text-cyan-300/90">
              {String(varFrom).padStart(3, "0")}V{String(varTo).padStart(3, "0")}
            </span>
          </p>
        ) : null}
        {analysis.bestIdent ? (
          <p>
            Em uso: <span className="font-semibold text-cyan-300">{analysis.bestIdent}</span>
            {analysis.crosswindKt != null ? ` · través ${analysis.crosswindKt} kt` : ""}
            {analysis.headwindKt != null
              ? ` · ${analysis.headwindKt >= 0 ? "proa" : "cauda"} ${Math.abs(analysis.headwindKt)} kt`
              : ""}
          </p>
        ) : (
          <p className="text-slate-500">Sem cabeceiras ROTAER para cruzar com o vento</p>
        )}
      </div>
    </div>
  );
}

/** Cloud silhouettes spread across the full horizon; total cover ≈ fillFraction. */
function CloudArt({
  layer,
  uid,
  fillFraction,
}: {
  layer: AiswebCloudLayer;
  uid: string;
  fillFraction: number;
}) {
  const isCb = layer.convect === "CB";
  const isTcu = layer.convect === "TCU";
  const cover = layer.cover;
  const W = 1000;
  const H = 120;

  if (isCb) {
    const cellW = Math.max(140, fillFraction * W);
    const x0 = (W - cellW) / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${uid}-cb`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(248 250 252)" stopOpacity="0.95" />
            <stop offset="40%" stopColor="rgb(148 163 184)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgb(51 65 85)" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={`${uid}-anvil`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(226 232 240)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="rgb(100 116 139)" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <g transform={`translate(${x0} 0)`}>
          <path
            d={`M 0 36 C ${cellW * 0.12} 12 ${cellW * 0.28} 8 ${cellW * 0.5} 16 C ${cellW * 0.72} 8 ${cellW * 0.88} 12 ${cellW} 36 C ${cellW * 0.98} 44 ${cellW * 0.9} 50 ${cellW * 0.82} 48 C ${cellW * 0.65} 46 ${cellW * 0.55} 52 ${cellW * 0.5} 50 C ${cellW * 0.4} 52 ${cellW * 0.28} 44 ${cellW * 0.16} 48 C ${cellW * 0.06} 50 2 44 0 36 Z`}
            fill={`url(#${uid}-anvil)`}
            stroke="rgb(251 113 133 / 0.45)"
            strokeWidth="1.2"
          />
          <path
            d={`M ${cellW * 0.32} 48 C ${cellW * 0.28} 72 ${cellW * 0.3} 100 ${cellW * 0.34} 130 C ${cellW * 0.38} 145 ${cellW * 0.46} 150 ${cellW * 0.5} 142 C ${cellW * 0.54} 150 ${cellW * 0.62} 145 ${cellW * 0.66} 130 C ${cellW * 0.7} 100 ${cellW * 0.72} 72 ${cellW * 0.68} 48 C ${cellW * 0.58} 52 ${cellW * 0.42} 52 ${cellW * 0.32} 48 Z`}
            fill={`url(#${uid}-cb)`}
            stroke="rgb(251 113 133 / 0.5)"
            strokeWidth="1.2"
          />
        </g>
      </svg>
    );
  }

  if (isTcu) {
    // Towering cumulus: tall stacked cauliflower domes, dark gray (vs CB anvil).
    const cellW = Math.max(160, fillFraction * W * 0.75);
    const x0 = (W - cellW) / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H + 50}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${uid}-tcu`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(100 116 139)" stopOpacity="0.95" />
            <stop offset="45%" stopColor="rgb(51 65 85)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="rgb(15 23 42)" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <g transform={`translate(${x0} 0)`}>
          <ellipse cx={cellW * 0.5} cy={28} rx={cellW * 0.22} ry={22} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.38} cy={48} rx={cellW * 0.2} ry={20} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.62} cy={48} rx={cellW * 0.2} ry={20} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.5} cy={70} rx={cellW * 0.28} ry={24} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.32} cy={92} rx={cellW * 0.24} ry={20} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.68} cy={92} rx={cellW * 0.24} ry={20} fill={`url(#${uid}-tcu)`} />
          <ellipse cx={cellW * 0.5} cy={112} rx={cellW * 0.36} ry={22} fill={`url(#${uid}-tcu)`} />
          <path
            d={`M ${cellW * 0.18} 112 C ${cellW * 0.1} 130 ${cellW * 0.2} 145 ${cellW * 0.5} 148 C ${cellW * 0.8} 145 ${cellW * 0.9} 130 ${cellW * 0.82} 112`}
            fill={`url(#${uid}-tcu)`}
            opacity="0.85"
          />
        </g>
      </svg>
    );
  }

  const puffCount = cover === "FEW" ? 2 : cover === "SCT" ? 4 : cover === "BKN" ? 5 : 6;
  const totalCloudW = Math.min(W, fillFraction * W);
  const puffW = cover === "OVC" || cover === "VV" ? W / puffCount : totalCloudW / puffCount;
  const gapTotal = cover === "OVC" || cover === "VV" ? 0 : W - totalCloudW;
  const gap = puffCount > 1 ? gapTotal / (puffCount - 1) : 0;

  const positions: number[] = [];
  if (cover === "OVC" || cover === "VV") {
    for (let i = 0; i < puffCount; i++) positions.push(i * puffW - puffW * 0.15);
  } else {
    for (let i = 0; i < puffCount; i++) positions.push(i * (puffW + gap));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(248 250 252)" stopOpacity={cover === "OVC" ? 0.98 : 0.9} />
          <stop offset="100%" stopColor="rgb(71 85 105)" stopOpacity={cover === "FEW" ? 0.5 : 0.8} />
        </linearGradient>
      </defs>

      {positions.map((x, i) => {
        const w = cover === "OVC" || cover === "VV" ? puffW * 1.35 : puffW;
        const y = 48 + (i % 2) * 6;
        if (cover === "OVC" || cover === "VV" || cover === "BKN") {
          return (
            <g key={i}>
              <ellipse
                cx={x + w * 0.45}
                cy={y}
                rx={w * 0.48}
                ry={cover === "OVC" || cover === "VV" ? 28 : 22}
                fill={`url(#${uid}-fill)`}
              />
              <ellipse
                cx={x + w * 0.22}
                cy={y + 4}
                rx={w * 0.32}
                ry={cover === "OVC" || cover === "VV" ? 22 : 16}
                fill={`url(#${uid}-fill)`}
                opacity="0.92"
              />
              <ellipse
                cx={x + w * 0.72}
                cy={y - 6}
                rx={w * 0.34}
                ry={cover === "OVC" || cover === "VV" ? 24 : 18}
                fill={`url(#${uid}-fill)`}
                opacity="0.9"
              />
              <ellipse
                cx={x + w * 0.5}
                cy={y - 14}
                rx={w * 0.28}
                ry={cover === "OVC" || cover === "VV" ? 20 : 14}
                fill={`url(#${uid}-fill)`}
                opacity="0.95"
              />
            </g>
          );
        }
        return (
          <g key={i}>
            <ellipse
              cx={x + w * 0.45}
              cy={y}
              rx={w * 0.42}
              ry={18 + (cover === "SCT" ? 4 : 0)}
              fill={`url(#${uid}-fill)`}
            />
            <ellipse
              cx={x + w * 0.68}
              cy={y - 8}
              rx={w * 0.28}
              ry={14}
              fill={`url(#${uid}-fill)`}
              opacity="0.9"
            />
          </g>
        );
      })}
    </svg>
  );
}

function intensityDropCount(intensity: AiswebWeatherIntensity, base: number): number {
  if (intensity === "light") return Math.max(4, Math.round(base * 0.45));
  if (intensity === "heavy") return Math.round(base * 1.55);
  return base;
}

function intensityDurationSec(intensity: AiswebWeatherIntensity, base: number): number {
  if (intensity === "light") return base * 1.35;
  if (intensity === "heavy") return base * 0.7;
  return base;
}

function WeatherTooltipCard({
  state,
}: {
  state: { detail: AiswebWeatherDetail; x: number; y: number } | null;
}) {
  if (!state) return null;
  const left =
    typeof window === "undefined" ? state.x + 14 : Math.min(state.x + 14, window.innerWidth - 300);
  const top =
    typeof window === "undefined" ? state.y + 14 : Math.min(state.y + 14, window.innerHeight - 240);

  return (
    <div
      className="pointer-events-none fixed z-50 w-72 rounded-lg border border-slate-500/55 bg-slate-950/70 p-3 text-left text-xs text-slate-200 shadow-2xl shadow-slate-950/70 ring-1 ring-white/10 backdrop-blur-xl"
      style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{state.detail.title}</p>
        <span className="rounded border border-cyan-500/40 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
          {state.detail.raw}
        </span>
      </div>
      <ul className="space-y-1 text-[11px] leading-snug text-slate-300">
        {state.detail.lines.map((line) => (
          <li key={line} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrecipDrops({
  kind,
  intensity,
  vicinity,
  recent,
}: {
  kind: "rain" | "drizzle" | "showers" | "hail" | "smallHail";
  intensity: AiswebWeatherIntensity;
  vicinity: boolean;
  recent: boolean;
}) {
  const base =
    kind === "drizzle" ? 16 : kind === "showers" ? 18 : kind === "hail" || kind === "smallHail" ? 14 : 26;
  const count = intensityDropCount(intensity, base);
  const duration = intensityDurationSec(
    intensity,
    kind === "drizzle" ? 1.8 : kind === "hail" || kind === "smallHail" ? 1.1 : 1.25,
  );
  const className =
    kind === "drizzle"
      ? "aisweb-drizzle-drop"
      : kind === "hail" || kind === "smallHail"
        ? "aisweb-hail-drop"
        : "aisweb-rain-drop";

  return (
    <div
      className={`pointer-events-none absolute overflow-hidden ${
        vicinity ? "bottom-0 left-[8%] right-[8%] top-[4%]" : "inset-x-0 bottom-0 top-[4%]"
      } ${recent ? "opacity-45" : ""}`}
    >
      {Array.from({ length: count }, (_, i) => {
        const left = vicinity
          ? i % 2 === 0
            ? 4 + (i % 5) * 3
            : 78 + (i % 5) * 3
          : kind === "showers"
            ? 12 + ((i * 37) % 76)
            : 6 + ((i * 41) % 88);
        const delay = (i * 0.13) % duration;
        const h =
          kind === "drizzle"
            ? 7 + (i % 3)
            : kind === "hail"
              ? 5
              : kind === "smallHail"
                ? 4
                : 11 + (i % 5);
        const w = kind === "hail" ? 4.5 : kind === "smallHail" ? 3.2 : kind === "drizzle" ? 1.4 : 2.2;
        return (
          <span
            key={i}
            className={`absolute rounded-full ${className} ${
              kind === "hail" || kind === "smallHail"
                ? "bg-slate-100/90"
                : kind === "drizzle"
                  ? "bg-sky-200/50"
                  : "bg-sky-300/70"
            }`}
            style={{
              left: `${left}%`,
              top: "-8%",
              width: `${w}px`,
              height: `${h}px`,
              animationDuration: `${duration + (i % 4) * 0.12}s`,
              animationDelay: `${delay}s`,
              opacity: intensity === "heavy" ? 0.95 : intensity === "light" ? 0.55 : 0.75,
            }}
          />
        );
      })}
    </div>
  );
}

function WeatherFxOverlay({
  details,
  onHover,
  onLeave,
}: {
  details: AiswebWeatherDetail[];
  onHover: (detail: AiswebWeatherDetail, event: MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
}) {
  if (!details.length) return null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {details.map((d) => {
        const key = d.raw;
        const veilOpacity =
          (d.intensity === "heavy" ? 0.55 : d.intensity === "light" ? 0.22 : 0.36) *
          (d.vicinity ? 0.55 : 1) *
          (d.recent ? 0.55 : 1);

        const hitHandlers = {
          onMouseEnter: (e: MouseEvent<HTMLElement>) => onHover(d, e),
          onMouseMove: (e: MouseEvent<HTMLElement>) => onHover(d, e),
          onMouseLeave: onLeave,
        };

        let visual: ReactNode = null;
        let hitClass = "absolute inset-0 cursor-help";

        if (d.visual === "rain" || d.visual === "showers" || d.visual === "drizzle") {
          visual = (
            <PrecipDrops
              kind={d.visual}
              intensity={d.intensity}
              vicinity={d.vicinity}
              recent={d.recent}
            />
          );
          hitClass = d.vicinity
            ? "absolute bottom-0 left-[8%] right-[8%] top-[4%] cursor-help"
            : "absolute inset-x-0 bottom-0 top-[4%] cursor-help";
        } else if (d.visual === "hail" || d.visual === "smallHail") {
          visual = (
            <PrecipDrops
              kind={d.visual}
              intensity={d.intensity}
              vicinity={d.vicinity}
              recent={d.recent}
            />
          );
          hitClass = d.vicinity
            ? "absolute bottom-0 left-[8%] right-[8%] top-[4%] cursor-help"
            : "absolute inset-x-0 bottom-0 top-[4%] cursor-help";
        } else if (d.visual === "thunder") {
          visual = (
            <div className="absolute inset-0">
              <div
                className="aisweb-lightning-flash absolute inset-0 bg-yellow-100/20"
                style={{ animationDelay: d.recent ? "1.2s" : "0s" }}
              />
              <svg
                viewBox="0 0 100 120"
                className={`aisweb-lightning-bolt absolute ${
                  d.vicinity ? "left-[8%] top-[10%] h-[55%] w-10" : "left-1/2 top-[8%] h-[62%] w-12 -translate-x-1/2"
                }`}
                style={{ animationDelay: d.recent ? "1.2s" : "0s", opacity: d.recent ? 0.55 : 1 }}
              >
                <path
                  d="M52 8 L28 58 H46 L38 112 L78 48 H56 Z"
                  fill="rgb(254 240 138)"
                  stroke="rgb(250 204 21)"
                  strokeWidth="1.5"
                />
              </svg>
              {(d.phenomena.includes("RA") || d.descriptors.includes("SH")) && (
                <PrecipDrops
                  kind={d.phenomena.includes("RA") && d.descriptors.includes("SH") ? "showers" : "rain"}
                  intensity={d.intensity}
                  vicinity={d.vicinity}
                  recent={d.recent}
                />
              )}
              {d.phenomena.includes("GR") ? (
                <PrecipDrops kind="hail" intensity={d.intensity} vicinity={d.vicinity} recent={d.recent} />
              ) : null}
            </div>
          );
          hitClass = "absolute inset-0 cursor-help";
        } else if (d.visual === "fog" || d.visual === "mist" || d.visual === "haze" || d.visual === "smoke") {
          const color =
            d.visual === "smoke"
              ? "rgba(120, 113, 108, 0.55)"
              : d.visual === "haze"
                ? "rgba(148, 163, 184, 0.4)"
                : d.visual === "mist"
                  ? "rgba(186, 230, 253, 0.35)"
                  : "rgba(226, 232, 240, 0.5)";
          visual = (
            <div
              className={`aisweb-haze-veil absolute inset-x-0 ${
                d.vicinity ? "bottom-[10%] top-[45%]" : "bottom-0 top-[38%]"
              }`}
              style={{
                background: `linear-gradient(to top, ${color}, transparent)`,
                opacity: veilOpacity + 0.15,
              }}
            />
          );
          hitClass = d.vicinity
            ? "absolute inset-x-0 bottom-[10%] top-[45%] cursor-help"
            : "absolute inset-x-0 bottom-0 top-[38%] cursor-help";
        } else if (d.visual === "dust" || d.visual === "dustStorm" || d.visual === "sandStorm") {
          const color =
            d.visual === "sandStorm" ? "rgba(217, 119, 6, 0.45)" : "rgba(180, 83, 9, 0.4)";
          visual = (
            <div
              className="aisweb-haze-veil absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 50% 80%, ${color}, transparent 70%)`,
                opacity: veilOpacity + 0.2,
              }}
            />
          );
          hitClass = "absolute inset-x-[10%] bottom-0 top-[35%] cursor-help";
        } else if (d.visual === "dustWhirl") {
          visual = (
            <div
              className={`aisweb-dust-whirl absolute bottom-[12%] h-20 w-20 rounded-full border border-amber-500/40 ${
                d.vicinity ? "left-[10%]" : "left-1/2 -translate-x-1/2"
              }`}
              style={{
                background:
                  "conic-gradient(from 90deg, transparent, rgba(245, 158, 11, 0.35), transparent 60%)",
                opacity: d.recent ? 0.45 : 0.8,
              }}
            />
          );
          hitClass = d.vicinity
            ? "absolute bottom-[8%] left-[6%] h-28 w-28 cursor-help"
            : "absolute bottom-[8%] left-1/2 h-28 w-28 -translate-x-1/2 cursor-help";
        } else if (d.visual === "squall") {
          visual = (
            <div className="absolute inset-x-0 top-[30%] h-16 overflow-hidden">
              <div
                className="aisweb-squall-band absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-slate-200/40 to-transparent"
                style={{ opacity: d.recent ? 0.4 : 0.8 }}
              />
            </div>
          );
          hitClass = "absolute inset-x-0 top-[28%] h-20 cursor-help";
        } else {
          return null;
        }

        return (
          <div key={key} className="absolute inset-0">
            <div className="pointer-events-none absolute inset-0">{visual}</div>
            <div
              className={hitClass}
              title={d.title}
              aria-label={d.title}
              {...hitHandlers}
            />
          </div>
        );
      })}
    </div>
  );
}

function WeatherBadges({
  details,
  onHover,
  onLeave,
}: {
  details: AiswebWeatherDetail[];
  onHover: (detail: AiswebWeatherDetail, event: MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
}) {
  if (!details.length) return null;
  return (
    <div className="absolute bottom-3 left-2 right-10 z-20 flex flex-wrap gap-1">
      {details.map((d) => (
        <button
          key={d.raw}
          type="button"
          className="cursor-help rounded border border-slate-500/50 bg-slate-950/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-100 shadow-sm backdrop-blur-sm ring-1 ring-white/5 transition hover:border-cyan-500/50 hover:text-cyan-200"
          onMouseEnter={(e) => onHover(d, e)}
          onMouseMove={(e) => onHover(d, e)}
          onMouseLeave={onLeave}
        >
          {d.raw}
        </button>
      ))}
    </div>
  );
}

export function AiswebCloudStack({ parsed }: { parsed: AiswebParsedMetar | null }) {
  const maxFt = Math.max(
    8000,
    ...(parsed?.clouds || [])
      .map((c) => c.heightFt || 0)
      .concat(parsed?.ceilingFt && parsed.ceilingFt < 10000 ? [parsed.ceilingFt] : []),
  );
  const scaleMax = Math.ceil(maxFt / 1000) * 1000 || 8000;
  const marks = Array.from({ length: Math.floor(scaleMax / 2000) + 1 }, (_, i) => i * 2000);
  const layers = (parsed?.clouds || []).filter((c) => c.heightFt != null && c.heightFt > 0);
  const cavok = parsed?.cavok === true;
  const weatherDetails = useMemo(
    () => describeWeatherTokens(parsed?.weather),
    [parsed?.weather],
  );
  const [wxTooltip, setWxTooltip] = useState<{
    detail: AiswebWeatherDetail;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-gradient-to-b from-slate-950 via-slate-900/80 to-amber-950/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ceiling / clouds</p>
        <p className="font-mono text-xs text-slate-300">
          {cavok
            ? "CAVOK"
            : parsed?.ceilingFt != null && parsed.ceilingFt < 10000
              ? `Ceiling ${parsed.ceilingFt.toLocaleString("pt-BR")} ft`
              : parsed
                ? "Ilimitado"
                : "—"}
        </p>
      </div>

      <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-[radial-gradient(ellipse_at_top,_rgba(30,41,59,0.9),_rgba(2,6,23,0.95))]">
        {marks.map((ft) => {
          const top = `${(1 - ft / scaleMax) * 100}%`;
          return (
            <div key={ft} className="pointer-events-none absolute inset-x-0" style={{ top }}>
              <div className="border-t border-dotted border-slate-700/50" />
              <span className="absolute right-1.5 -translate-y-1/2 text-[9px] tabular-nums text-slate-500">
                {(ft / 1000).toFixed(ft % 1000 === 0 ? 0 : 1)}k
              </span>
            </div>
          );
        })}

        <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-amber-800/80 via-amber-700/90 to-amber-800/80 shadow-[0_-8px_24px_rgba(180,83,9,0.25)]" />
        {!weatherDetails.length ? (
          <div className="absolute bottom-2 left-2 text-[9px] font-semibold uppercase tracking-wider text-amber-200/70">
            Ground
          </div>
        ) : null}

        {cavok ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-2 h-16 w-16 rounded-full bg-sky-400/10 ring-1 ring-sky-400/30" />
              <p className="text-sm font-semibold text-sky-300">Clear sky</p>
              <p className="text-[11px] text-slate-500">CAVOK · no significant clouds</p>
            </div>
          </div>
        ) : null}

        {!cavok && !layers.length ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
            No FEW/SCT/BKN/OVC layers in METAR
          </div>
        ) : null}

        {!cavok
          ? layers.map((layer, index) => {
              const heightFt = layer.heightFt as number;
              const yPct = (1 - heightFt / scaleMax) * 100;
              const fillFraction = coverFillFraction(layer.cover);
              const isCb = layer.convect === "CB";
              const isTcu = layer.convect === "TCU";
              const bandH = isCb
                ? 28
                : isTcu
                  ? 30
                  : layer.cover === "OVC" || layer.cover === "VV"
                    ? 16
                    : 14;

              return (
                <div
                  key={`${layer.raw}-${index}`}
                  className="aisweb-cloud-drift pointer-events-none absolute inset-x-0"
                  style={{
                    top: `calc(${yPct}% - ${bandH / 2}%)`,
                    height: `${bandH}%`,
                    animationDelay: `${index * 0.7}s`,
                  }}
                >
                  <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-slate-500/25" />
                  <CloudArt layer={layer} uid={`c${index}-${heightFt}`} fillFraction={fillFraction} />
                  <div
                    className={`absolute -top-4 left-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-medium ring-1 ${
                      isCb
                        ? "bg-rose-950/80 text-rose-200 ring-rose-500/40"
                        : isTcu
                          ? "bg-slate-900/85 text-slate-200 ring-slate-500/50"
                          : "bg-slate-950/70 text-slate-300 ring-slate-700/60"
                    }`}
                  >
                    {coverLabel(layer.cover, layer.convect)}
                    {heightFt != null ? ` · ${heightFt.toLocaleString("en-US")} ft` : ""}
                  </div>
                </div>
              );
            })
          : null}

        <WeatherFxOverlay
          details={weatherDetails}
          onHover={(detail, event) =>
            setWxTooltip({ detail, x: event.clientX, y: event.clientY })
          }
          onLeave={() => setWxTooltip(null)}
        />

        {parsed?.ceilingFt != null && parsed.ceilingFt < 10000 && !cavok ? (
          <div
            className="pointer-events-none absolute inset-x-8 border-t border-dashed border-rose-400/50"
            style={{ top: `${(1 - parsed.ceilingFt / scaleMax) * 100}%` }}
          >
            <span className="absolute -top-4 right-1 rounded-md bg-rose-700 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm ring-1 ring-rose-400/60">
              Ceiling {parsed.ceilingFt.toLocaleString("pt-BR")} ft
            </span>
          </div>
        ) : null}

        <WeatherBadges
          details={weatherDetails}
          onHover={(detail, event) =>
            setWxTooltip({ detail, x: event.clientX, y: event.clientY })
          }
          onLeave={() => setWxTooltip(null)}
        />
      </div>

      <WeatherTooltipCard state={wxTooltip} />
    </div>
  );
}

export function AiswebConditionVisuals({
  parsed,
  rotaer,
  previewLabel,
}: {
  parsed: AiswebParsedMetar | null;
  rotaer: AiswebRotaer | null;
  previewLabel?: string | null;
}) {
  return (
    <div className="space-y-2">
      {previewLabel ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          Visualização TAF: <span className="font-semibold">{previewLabel}</span>
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <AiswebWindRose parsed={parsed} rotaer={rotaer} />
        <AiswebCloudStack parsed={parsed} />
      </div>
    </div>
  );
}
