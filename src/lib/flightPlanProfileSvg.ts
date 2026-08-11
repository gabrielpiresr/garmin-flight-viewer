import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { buildFlightPlanLegs } from "./flightPlanningRoute";
import {
  buildCorridorBands,
  buildVerticalProfileChartData,
  buildWaypointDistanceMarks,
} from "./routeVerticalProfile";
import type { ProfilePhasePoint } from "./routePerformanceProfile";
import type { RouteElevationPoint } from "./routeElevationDb";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Static SVG vertical profile for print/PDF. */
export function buildRouteVerticalProfileSvg(input: {
  waypoints: FlightPlanWaypoint[];
  performanceProfile?: ProfilePhasePoint[] | null;
  terrain?: RouteElevationPoint[] | null;
  corridors?: Array<{ name: string; altMax: number | null; altMin: number | null } | null | undefined> | null;
  cruiseSpeedKt?: number | null;
  width?: number;
  height?: number;
}): string {
  const waypoints = input.waypoints;
  if (waypoints.length < 2) return "";
  const legs = buildFlightPlanLegs(waypoints, {
    cruiseSpeedKt: input.cruiseSpeedKt ?? null,
  });
  const totalDistanceNm = legs[legs.length - 1]?.cumulativeDistanceNm ?? 0;
  if (!(totalDistanceNm > 0)) return "";

  const chart = buildVerticalProfileChartData({
    waypoints,
    legs,
    terrain: input.terrain ?? [],
    totalDistanceNm,
    performanceProfile: input.performanceProfile ?? null,
  });
  if (chart.length < 2) return "";

  const corridorBands = buildCorridorBands(legs, input.corridors ?? []);

  const width = input.width ?? 1100;
  const height = input.height ?? 280;
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  let minFt = 0;
  let maxFt = 1000;
  for (const p of chart) {
    if (p.terrainFt != null) {
      minFt = Math.min(minFt, p.terrainFt);
      maxFt = Math.max(maxFt, p.terrainFt);
    }
    if (p.plannedFt != null) {
      minFt = Math.min(minFt, p.plannedFt);
      maxFt = Math.max(maxFt, p.plannedFt);
    }
  }
  for (const b of corridorBands) {
    maxFt = Math.max(maxFt, b.altMax);
    minFt = Math.min(minFt, b.altMin);
  }
  maxFt = Math.max(maxFt + 500, minFt + 1500);
  minFt = Math.max(0, minFt - 200);

  const xScale = (xNm: number) => padL + (xNm / totalDistanceNm) * plotW;
  const yScale = (ft: number) => padT + plotH - ((ft - minFt) / (maxFt - minFt || 1)) * plotH;
  const yZero = yScale(0);

  const terrainSeries = chart.filter((p) => p.terrainFt != null);
  const terrainLinePts = terrainSeries
    .map((p) => `${xScale(p.xNm).toFixed(1)},${yScale(p.terrainFt!).toFixed(1)}`)
    .join(" ");
  let terrainFillPath = "";
  if (terrainSeries.length >= 2) {
    const first = terrainSeries[0]!;
    const last = terrainSeries[terrainSeries.length - 1]!;
    const top = terrainSeries
      .map((p) => `L ${xScale(p.xNm).toFixed(1)} ${yScale(p.terrainFt!).toFixed(1)}`)
      .join(" ");
    terrainFillPath = `M ${xScale(first.xNm).toFixed(1)} ${yZero.toFixed(1)} ${top} L ${xScale(last.xNm).toFixed(1)} ${yZero.toFixed(1)} Z`;
  }

  const plannedPts = chart
    .filter((p) => p.plannedFt != null)
    .map((p) => `${xScale(p.xNm).toFixed(1)},${yScale(p.plannedFt!).toFixed(1)}`)
    .join(" ");

  const marks = buildWaypointDistanceMarks(waypoints, legs);
  const tickEvery = Math.max(10, Math.round(totalDistanceNm / 6 / 10) * 10);
  const xTicks: number[] = [];
  for (let x = 0; x <= totalDistanceNm + 0.01; x += tickEvery) xTicks.push(Math.min(totalDistanceNm, x));
  if (xTicks[xTicks.length - 1] !== totalDistanceNm) xTicks.push(totalDistanceNm);

  const yTicks: number[] = [];
  const yStep = maxFt - minFt > 8000 ? 2000 : maxFt - minFt > 3000 ? 1000 : 500;
  for (let y = Math.ceil(minFt / yStep) * yStep; y <= maxFt; y += yStep) yTicks.push(y);

  const corridorSvg = corridorBands
    .map((b) => {
      const x = xScale(b.x0Nm);
      const w = Math.max(1, xScale(b.x1Nm) - x);
      const yTop = yScale(b.altMax);
      const yBot = yScale(b.altMin);
      const h = Math.max(1, yBot - yTop);
      const labelX = x + w / 2;
      const labelY = Math.min(yBot - 4, padT + plotH - 4);
      return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#f87171" fill-opacity="0.08" stroke="#ef4444" stroke-opacity="0.75" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#b91c1c" font-family="Segoe UI,sans-serif">${esc(b.name)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Perfil vertical da rota">
  <defs>
    <linearGradient id="pdfTerrainFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c4a574" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#8b5a2b" stop-opacity="0.95"/>
    </linearGradient>
    <clipPath id="pdfPlotClip">
      <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" rx="10"/>
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#fff" stroke="#e2e8f0"/>
  ${yTicks
    .map(
      (y) =>
        `<line x1="${padL}" y1="${yScale(y).toFixed(1)}" x2="${padL + plotW}" y2="${yScale(y).toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
         <text x="${padL - 6}" y="${(yScale(y) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b" font-family="Segoe UI,sans-serif">${y}</text>`,
    )
    .join("")}
  ${xTicks
    .map(
      (x) =>
        `<text x="${xScale(x).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#64748b" font-family="Segoe UI,sans-serif">${x.toFixed(0)} NM</text>`,
    )
    .join("")}
  <g clip-path="url(#pdfPlotClip)">
    ${corridorSvg}
    ${terrainFillPath ? `<path d="${terrainFillPath}" fill="url(#pdfTerrainFill)" stroke="none"/>` : ""}
    ${terrainLinePts ? `<polyline fill="none" stroke="#92400e" stroke-width="1.4" points="${terrainLinePts}"/>` : ""}
    ${plannedPts ? `<polyline fill="none" stroke="#0e7490" stroke-width="2.5" points="${plannedPts}"/>` : ""}
  </g>
  ${marks
    .map((m) => {
      const x = xScale(m.xNm);
      const y = m.altitudeFt != null ? yScale(m.altitudeFt) : padT + plotH;
      return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-dasharray="2 3"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#0e7490" stroke="#fff" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${(padT + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="#334155" font-family="ui-monospace,monospace">${esc(m.label)}</text>`;
    })
    .join("")}
  <text x="${padL}" y="12" font-size="11" font-weight="700" fill="#0f172a" font-family="Segoe UI,sans-serif">Perfil vertical (ft)</text>
</svg>`;
}
