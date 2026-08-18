import type { AiswebNotam } from "../types/aisweb";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";
import { fetchAiswebNotams } from "./aiswebDb";

export function airspaceNotamLocation(hit: FlightPlanAirspaceHit): string | null {
  const ident = String(hit.ident || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{4}$/.test(ident)) return ident;
  const prefix = ident.match(/^([A-Z]{4})/);
  if (prefix) return prefix[1]!;
  const fir = String(hit.fir || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{4}$/.test(fir)) return fir;
  const firPrefix = fir.match(/^([A-Z]{4})/);
  return firPrefix ? firPrefix[1]! : null;
}

function compactKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function filterNotamsForAirspace(
  notams: AiswebNotam[],
  hit: FlightPlanAirspaceHit,
): AiswebNotam[] {
  if (hit.type !== "P" && hit.type !== "R" && hit.type !== "D") return notams;
  const ident = compactKey(hit.ident);
  if (ident.length < 3) return notams;
  const short = ident.replace(/^[A-Z]{3}(?=\d)/, "");
  const matched = notams.filter((item) => {
    const hay = compactKey(`${item.number} ${item.text} ${item.qCode || ""}`);
    return hay.includes(ident) || (short.length >= 3 && hay.includes(short));
  });
  return matched.length ? matched : notams;
}

export async function loadNotamsByLocation(
  locations: string[],
): Promise<Record<string, AiswebNotam[]>> {
  const unique = [...new Set(locations.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z0-9]{4}$/.test(code)))];
  const out: Record<string, AiswebNotam[]> = {};
  const concurrency = 3;
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const rows = await Promise.all(
      chunk.map(async (icao) => {
        try {
          return [icao, await fetchAiswebNotams(icao)] as const;
        } catch {
          return [icao, [] as AiswebNotam[]] as const;
        }
      }),
    );
    for (const [icao, notams] of rows) out[icao] = notams;
  }
  return out;
}
