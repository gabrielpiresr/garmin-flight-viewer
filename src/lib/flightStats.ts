import type { ChartRow } from "./telemetryCharts";
import type { FlightPoint, FlightSummary } from "../types/flight";

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function summarizeFlight(points: FlightPoint[]): FlightSummary {
  if (points.length === 0) {
    return {
      durationSec: null,
      distanceM: 0,
      altMinM: null,
      altMaxM: null,
      speedAvgMs: null,
      speedMaxMs: null,
      pointCount: 0,
    };
  }

  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineM(points[i - 1]!, points[i]!);
  }

  const withAlt = points.filter((p) => p.altM !== null).map((p) => p.altM!);
  const altMinM = withAlt.length ? Math.min(...withAlt) : null;
  const altMaxM = withAlt.length ? Math.max(...withAlt) : null;

  const withSpd = points.filter((p) => p.speedMs !== null).map((p) => p.speedMs!);
  const speedAvgMs =
    withSpd.length > 0 ? withSpd.reduce((a, b) => a + b, 0) / withSpd.length : null;
  const speedMaxMs = withSpd.length > 0 ? Math.max(...withSpd) : null;

  let durationSec: number | null = null;
  const t0 = points[0]?.t;
  const t1 = points[points.length - 1]?.t;
  if (t0 !== null && t1 !== null && t0 !== undefined && t1 !== undefined && t1 > t0) {
    durationSec = (t1 - t0) / 1000;
  }

  return {
    durationSec,
    distanceM,
    altMinM,
    altMaxM,
    speedAvgMs,
    speedMaxMs,
    pointCount: points.length,
  };
}

export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${rs}s`;
  return `${rs}s`;
}

export function formatDistM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function formatSpeedKt(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const kt = ms / 0.514444;
  return `${kt.toFixed(0)} kt`;
}

export function formatAltFt(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return "—";
  const ft = m / 0.3048;
  return `${Math.round(ft).toLocaleString("pt-BR")} ft`;
}

/** Duração a partir do eixo X dos gráficos (ms relativos ao início do voo). */
export function chartDurationSec(chartData: ChartRow[], hasTime: boolean): number | null {
  if (!hasTime || chartData.length < 2) return null;
  const xs = chartData.map((r) => r.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (span < 500) return null;
  return span / 1000;
}
