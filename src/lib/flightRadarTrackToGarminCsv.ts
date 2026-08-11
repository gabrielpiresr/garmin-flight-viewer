import type { FlightRadarTrackPoint } from "../types/flightRadar";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcParts(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`,
  };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Converte pontos do Flightradar24 em um CSV compatível com `parseGarminCsv`,
 * para reutilizar o mesmo pipeline de vínculo de telemetria (mapa/gráficos/métricas).
 * Unidades: altitude em pés, ground speed em kt, VS em fpm (como no FR24).
 */
export function flightRadarTrackToGarminCsv(
  points: FlightRadarTrackPoint[],
  opts?: { fr24Id?: string | null; registration?: string | null },
): string {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || ""));

  const lines: string[] = [
    "# Flightradar24 track export",
    `# Generated-By: garmin-flight-viewer`,
  ];
  if (opts?.fr24Id) lines.push(`# fr24_id: ${opts.fr24Id}`);
  if (opts?.registration) lines.push(`# registration: ${opts.registration}`);
  lines.push("# Note: ADS-B only (no engine / Garmin G1000 parameters).");
  lines.push(
    "UTC Date,UTC Time,Latitude,Longitude,GPS Altitude ft,GPS Ground Speed kt,GPS Ground Track,Vertical Speed",
  );

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]!;
    const parts = formatUtcParts(point.timestamp);
    if (!parts) continue;
    const alt = point.alt != null && Number.isFinite(point.alt) ? Math.round(point.alt) : "";
    const gspeed =
      point.gspeed != null && Number.isFinite(point.gspeed) ? Number(point.gspeed).toFixed(1) : "";
    const heading =
      point.track != null && Number.isFinite(point.track) ? Math.round(point.track) : "";

    let vspeed: string | number = "";
    if (point.vspeed != null && Number.isFinite(point.vspeed) && point.vspeed !== 0) {
      vspeed = Math.round(point.vspeed);
    } else if (
      typeof alt === "number" &&
      i > 0 &&
      sorted[i - 1]!.alt != null &&
      sorted[i - 1]!.timestamp &&
      point.timestamp
    ) {
      const dtSec = (Date.parse(point.timestamp) - Date.parse(sorted[i - 1]!.timestamp!)) / 1000;
      if (dtSec > 0 && dtSec < 180) {
        vspeed = Math.round(((alt - Number(sorted[i - 1]!.alt)) / dtSec) * 60);
      }
    }

    lines.push(
      [parts.date, parts.time, point.lat.toFixed(6), point.lon.toFixed(6), alt, gspeed, heading, vspeed]
        .map(csvEscape)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function fr24TelemetryFileName(fr24Id: string): string {
  const safe = fr24Id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "track";
  return `fr24-${safe}.csv`;
}
