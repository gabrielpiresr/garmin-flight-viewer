import type { AiswebRotaer, AiswebRunway } from "../types/aisweb";
import { runwayHeadingFromIdent } from "../lib/aiswebMetar";

export type RunwaySurfaceKind =
  | "asphalt"
  | "concrete"
  | "grass"
  | "dirt"
  | "gravel"
  | "water"
  | "unknown";

export function classifyRunwaySurface(runway: Pick<AiswebRunway, "surface" | "surfaceLabel">): RunwaySurfaceKind {
  const raw = `${runway.surface || ""} ${runway.surfaceLabel || ""}`.toUpperCase().trim();
  // ROTAER short codes first (TER alone must not fall through as "pavimento"/asphalt lookalike).
  if (/\b(GRS|GRASS|GRAMA|TURF|SOD)\b/.test(raw)) return "grass";
  if (/\b(TER|DIRT|TERRA|EARTH|SOIL|CLAY|BARRO)\b/.test(raw)) return "dirt";
  if (/\b(GRE|GVL|GRAVEL|CASCALHO|LATRITE|SAIBRO)\b/.test(raw)) return "gravel";
  if (/\b(WAT|WATER|ÁGUA|AGUA)\b/.test(raw)) return "water";
  if (/\b(CON|CONC|CONCRETO|CIMENTO)\b/.test(raw)) return "concrete";
  if (/\b(ASP|ASPH|ASFALTO|BITU|MACA|PAVED|PAVIMENT)\b/.test(raw)) return "asphalt";
  // Loose labels without word boundaries for longer free-text fields
  if (/GRASS|GRAMA|TURF|SOD/.test(raw)) return "grass";
  if (/DIRT|TERRA|EARTH|SOIL|CLAY|BARRO/.test(raw)) return "dirt";
  if (/GRAVEL|CASCALHO|LATRITE|SAIBRO/.test(raw)) return "gravel";
  if (/WATER|ÁGUA|AGUA/.test(raw)) return "water";
  if (/CONCRETO|CIMENTO|CONCRETE/.test(raw)) return "concrete";
  if (/ASFALTO|ASPHALT|BITU|PAVED|PAVIMENT/.test(raw)) return "asphalt";
  return "unknown";
}

export const RUNWAY_SURFACE_COLORS: Record<
  RunwaySurfaceKind,
  { fill: string; stroke: string; label: string }
> = {
  asphalt: { fill: "#3f3f46", stroke: "#a1a1aa", label: "Asfalto" },
  concrete: { fill: "#94a3b8", stroke: "#e2e8f0", label: "Concreto" },
  grass: { fill: "#4d7c0f", stroke: "#a3e635", label: "Grama" },
  dirt: { fill: "#92400e", stroke: "#fbbf24", label: "Terra" },
  gravel: { fill: "#a8a29e", stroke: "#d6d3d1", label: "Cascalho" },
  water: { fill: "#0369a1", stroke: "#7dd3fc", label: "Água" },
  unknown: { fill: "#475569", stroke: "#94a3b8", label: "Superfície" },
};

function surfaceDisplayName(runway: AiswebRunway): string {
  const kind = classifyRunwaySurface(runway);
  if (kind !== "unknown") return RUNWAY_SURFACE_COLORS[kind].label;
  return runway.surfaceLabel || runway.surface || "—";
}

type RunwayRoseProps = {
  rotaer: AiswebRotaer | null | undefined;
  size?: number;
  compact?: boolean;
  className?: string;
};

/** Compass rose with runways oriented by heading, colored by surface. */
export function RunwayRose({ rotaer, size = 200, compact = false, className = "" }: RunwayRoseProps) {
  const runways = rotaer?.runways || [];
  const elevFt = rotaer?.altFt ?? null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  if (!runways.length) {
    return (
      <div className={`rounded-lg border border-dashed border-slate-700/70 px-3 py-6 text-center text-[11px] text-slate-500 ${className}`}>
        Sem pistas no ROTAER.
      </div>
    );
  }

  const ticks = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const labels = [
    { deg: 0, text: "N" },
    { deg: 90, text: "E" },
    { deg: 180, text: "S" },
    { deg: 270, text: "W" },
  ];

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[240px]" role="img" aria-label="Rosa das pistas">
        <circle cx={cx} cy={cy} r={r + 8} fill="rgb(2 6 23 / 0.85)" stroke="rgb(51 65 85)" strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(51 65 85 / 0.7)" strokeWidth="1" />
        {ticks.map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const major = deg % 90 === 0;
          const inner = r - (major ? 10 : 6);
          const outer = r - 1;
          return (
            <line
              key={deg}
              x1={cx + Math.cos(rad) * inner}
              y1={cy + Math.sin(rad) * inner}
              x2={cx + Math.cos(rad) * outer}
              y2={cy + Math.sin(rad) * outer}
              stroke={major ? "rgb(148 163 184)" : "rgb(71 85 105)"}
              strokeWidth={major ? 1.5 : 1}
            />
          );
        })}
        {labels.map(({ deg, text }) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const lr = r - 18;
          return (
            <text
              key={text}
              x={cx + Math.cos(rad) * lr}
              y={cy + Math.sin(rad) * lr}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-400 text-[10px] font-bold"
            >
              {text}
            </text>
          );
        })}

        {runways.map((runway, idx) => {
          const thrA = runway.thresholds?.[0];
          const thrB = runway.thresholds?.[1];
          const heading =
            thrA?.headingDeg ??
            runwayHeadingFromIdent(thrA?.ident || runway.ident.split("/")[0] || "") ??
            null;
          if (heading == null) return null;
          const colors = RUNWAY_SURFACE_COLORS[classifyRunwaySurface(runway)];
          const len = compact ? size * 0.62 : size * (idx === 0 ? 0.72 : 0.62);
          const width = compact ? 9 : idx === 0 ? 12 : 9;
          const labelA = thrA?.ident || runway.ident.split("/")[0] || "—";
          const labelB = thrB?.ident || runway.ident.split("/")[1] || "";
          return (
            <g key={`${runway.ident}-${idx}`} transform={`rotate(${heading} ${cx} ${cy})`}>
              <rect
                x={cx - width / 2}
                y={cy - len / 2}
                width={width}
                height={len}
                rx={2}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={1.1}
                opacity={0.95}
              />
              <line
                x1={cx}
                y1={cy - len / 2 + 6}
                x2={cx}
                y2={cy + len / 2 - 6}
                stroke="rgb(15 23 42 / 0.55)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <g transform={`rotate(${-heading} ${cx} ${cy - len / 2 - 12})`}>
                <text
                  x={cx}
                  y={cy - len / 2 - 10}
                  textAnchor="middle"
                  className="fill-cyan-200 text-[10px] font-bold"
                >
                  {labelA}
                </text>
              </g>
              {labelB ? (
                <g transform={`rotate(${-heading} ${cx} ${cy + len / 2 + 12})`}>
                  <text
                    x={cx}
                    y={cy + len / 2 + 14}
                    textAnchor="middle"
                    className="fill-cyan-200 text-[10px] font-bold"
                  >
                    {labelB}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={compact ? 18 : 22} fill="rgb(15 23 42 / 0.92)" stroke="rgb(71 85 105)" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-200 text-[9px] font-bold">
          {elevFt != null ? `${elevFt} ft` : "Elev"}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-slate-500 text-[8px]">
          elev
        </text>
      </svg>

      <ul className={`mt-2 space-y-1 ${compact ? "text-[10px]" : "text-[11px]"} text-slate-300`}>
        {runways.map((rw) => {
          const kind = classifyRunwaySurface(rw);
          const colors = RUNWAY_SURFACE_COLORS[kind];
          const thr = (rw.thresholds || []).map((t) => t.ident).join("/") || rw.ident;
          const dims =
            rw.lengthM != null
              ? rw.widthM != null
                ? `${rw.lengthM} × ${rw.widthM} m`
                : `${rw.lengthM} m`
              : "—";
          return (
            <li key={rw.ident} className="flex items-start gap-2">
              <span
                className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: colors.fill, boxShadow: `0 0 0 1px ${colors.stroke}` }}
                aria-hidden
              />
              <span>
                <span className="font-semibold text-cyan-300">{thr}</span>
                {" · "}
                {dims}
                {" · "}
                {surfaceDisplayName(rw)}
                {elevFt != null ? ` · ${elevFt} ft` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** SVG markup for PDF embedding (no React). */
export function buildRunwayRoseSvg(
  rotaer: AiswebRotaer | null | undefined,
  options?: { size?: number; dark?: boolean },
): string {
  const size = options?.size ?? 220;
  const dark = options?.dark === true;
  const runways = rotaer?.runways || [];
  const elevFt = rotaer?.altFt ?? null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  if (!runways.length) {
    return `<p class="muted">Sem pistas no ROTAER.</p>`;
  }

  const bg = dark ? "#020617" : "#0f172a";
  const ring = dark ? "#334155" : "#475569";
  const tickMajor = dark ? "#94a3b8" : "#64748b";
  const labelFill = dark ? "#94a3b8" : "#64748b";

  const ticks = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    .map((deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      const major = deg % 90 === 0;
      const inner = r - (major ? 10 : 6);
      const outer = r - 1;
      return `<line x1="${cx + Math.cos(rad) * inner}" y1="${cy + Math.sin(rad) * inner}" x2="${cx + Math.cos(rad) * outer}" y2="${cy + Math.sin(rad) * outer}" stroke="${major ? tickMajor : "#334155"}" stroke-width="${major ? 1.5 : 1}" />`;
    })
    .join("");

  const cardLabels = [
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
  ]
    .map(([deg, text]) => {
      const rad = (((deg as number) - 90) * Math.PI) / 180;
      const lr = r - 18;
      return `<text x="${cx + Math.cos(rad) * lr}" y="${cy + Math.sin(rad) * lr}" text-anchor="middle" dominant-baseline="middle" fill="${labelFill}" font-size="10" font-weight="700">${text}</text>`;
    })
    .join("");

  const strips = runways
    .map((runway, idx) => {
      const thrA = runway.thresholds?.[0];
      const thrB = runway.thresholds?.[1];
      const heading =
        thrA?.headingDeg ??
        runwayHeadingFromIdent(thrA?.ident || runway.ident.split("/")[0] || "") ??
        null;
      if (heading == null) return "";
      const colors = RUNWAY_SURFACE_COLORS[classifyRunwaySurface(runway)];
      const len = size * (idx === 0 ? 0.72 : 0.62);
      const width = idx === 0 ? 12 : 9;
      const labelA = thrA?.ident || runway.ident.split("/")[0] || "—";
      const labelB = thrB?.ident || runway.ident.split("/")[1] || "";
      return `<g transform="rotate(${heading} ${cx} ${cy})">
        <rect x="${cx - width / 2}" y="${cy - len / 2}" width="${width}" height="${len}" rx="2" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.1"/>
        <line x1="${cx}" y1="${cy - len / 2 + 6}" x2="${cx}" y2="${cy + len / 2 - 6}" stroke="#0f172a" stroke-width="1" stroke-dasharray="4 3" opacity="0.55"/>
        <g transform="rotate(${-heading} ${cx} ${cy - len / 2 - 12})"><text x="${cx}" y="${cy - len / 2 - 10}" text-anchor="middle" fill="#a5f3fc" font-size="10" font-weight="700">${labelA}</text></g>
        ${labelB ? `<g transform="rotate(${-heading} ${cx} ${cy + len / 2 + 12})"><text x="${cx}" y="${cy + len / 2 + 14}" text-anchor="middle" fill="#a5f3fc" font-size="10" font-weight="700">${labelB}</text></g>` : ""}
      </g>`;
    })
    .join("");

  const legend = runways
    .map((rw) => {
      const kind = classifyRunwaySurface(rw);
      const colors = RUNWAY_SURFACE_COLORS[kind];
      const thr = (rw.thresholds || []).map((t) => t.ident).join("/") || rw.ident;
      const dims =
        rw.lengthM != null
          ? rw.widthM != null
            ? `${rw.lengthM} × ${rw.widthM} m`
            : `${rw.lengthM} m`
          : "—";
      const surf = kind !== "unknown" ? colors.label : rw.surfaceLabel || rw.surface || "—";
      return `<li><span style="display:inline-block;width:10px;height:10px;background:${colors.fill};border:1px solid ${colors.stroke};border-radius:2px;margin-right:6px;vertical-align:middle"></span><strong>${thr}</strong> · ${dims} · ${surf}${elevFt != null ? ` · ${elevFt} ft` : ""}</li>`;
    })
    .join("");

  return `<div class="rwy-rose keep-together">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="220" height="220">
      <circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="${bg}" stroke="${ring}" stroke-width="1.2"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="1"/>
      ${ticks}${cardLabels}${strips}
      <circle cx="${cx}" cy="${cy}" r="22" fill="#0f172a" stroke="${ring}"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="700">${elevFt != null ? `${elevFt} ft` : "Elev"}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#64748b" font-size="8">elev</text>
    </svg>
    <ul class="list rwy-legend">${legend}</ul>
  </div>`;
}
