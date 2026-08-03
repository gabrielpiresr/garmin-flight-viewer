import type { AiswebAirportBundle, AiswebFrequency, AiswebFuel, AiswebRotaer } from "../types/aisweb";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";

const FUEL_TYPE_LABELS: Record<string, string> = {
  PF: "Gasolina de aviação (AVGAS)",
  TF: "Querosene de aviação (JET-A1)",
  AVGAS: "Gasolina de aviação (AVGAS)",
  JET: "Querosene de aviação (JET)",
  JETA1: "Querosene de aviação (JET-A1)",
  "JET-A1": "Querosene de aviação (JET-A1)",
  "JET A1": "Querosene de aviação (JET-A1)",
};

const AIRSPACE_FREQ_RE = /^(APP|TWR|TWR\b|GND|ATIS|AFIS|ACC|CLEARANCE|CLNC|RADIO|INFO|DELIVERY|SMC)/i;

export function formatFuelTypeLabel(code: string): string {
  const key = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (FUEL_TYPE_LABELS[key]) return FUEL_TYPE_LABELS[key];
  if (FUEL_TYPE_LABELS[code]) return FUEL_TYPE_LABELS[code];
  return code;
}

/** Human-readable ROTAER fuel line (avoids "PF TF [6] (PF, TF)"). */
export function formatRotaerFuel(fuel: AiswebFuel | null | undefined): {
  available: boolean;
  shortLabel: string;
  detailLabel: string;
} {
  if (!fuel || (!fuel.text && !fuel.types?.length)) {
    return { available: false, shortLabel: "Sem combustível informado", detailLabel: "Sem abastecimento informado no ROTAER" };
  }

  const types = (fuel.types?.length ? fuel.types : []).map((t) => formatFuelTypeLabel(t));
  const unique = [...new Set(types)];
  const typeText = unique.length
    ? unique.join(" · ")
    : fuel.text
      ? String(fuel.text)
          .replace(/\[(\d+)\]/g, "")
          .replace(/\(([^)]*)\)/g, "")
          .replace(/\b(PF|TF|AVGAS|JET[\s-]?A1?)\b/gi, (m) => formatFuelTypeLabel(m))
          .replace(/\s{2,}/g, " ")
          .trim()
      : "Combustível disponível";

  const hours = fuel.hours ? `Horário: ${fuel.hours}` : null;
  const shortLabel = unique.length ? unique.map((t) => t.replace(/\s*\([^)]*\)/g, "").trim()).join(" · ") : "Disponível";
  const detailLabel = [typeText, hours].filter(Boolean).join(" · ");

  return { available: true, shortLabel, detailLabel };
}

export function longestRunwayM(rotaer: AiswebRotaer | null | undefined): number | null {
  const lengths = (rotaer?.runways || [])
    .map((r) => r.lengthM)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (!lengths.length) return null;
  return Math.max(...lengths);
}

export function formatRunwaysShort(rotaer: AiswebRotaer | null | undefined): string {
  const runways = rotaer?.runways || [];
  if (!runways.length) return "—";
  return runways
    .map((rw) => {
      const size =
        rw.lengthM != null && rw.widthM != null
          ? `${rw.lengthM}×${rw.widthM} m`
          : rw.lengthM != null
            ? `${rw.lengthM} m`
            : "—";
      return `${rw.ident} ${size}`;
    })
    .join(" · ");
}

export function formatFrequenciesShort(frequencies: AiswebFrequency[] | null | undefined, limit = 4): string {
  const list = frequencies || [];
  if (!list.length) return "—";
  return list
    .slice(0, limit)
    .map((f) => `${f.service} ${f.frequenciesMhz.join("/")}`)
    .join(" · ");
}

export function pickAirspaceFrequencies(frequencies: AiswebFrequency[] | null | undefined): Array<{
  service: string;
  mhz: string;
}> {
  const list = frequencies || [];
  const preferred = list.filter((f) => AIRSPACE_FREQ_RE.test(f.service));
  const source = preferred.length ? preferred : list;
  return source.slice(0, 6).map((f) => ({
    service: f.service,
    mhz: f.frequenciesMhz.join(" · "),
  }));
}

export function airportSummaryFromBundle(
  role: string,
  icao: string,
  bundle: AiswebAirportBundle,
): {
  role: string;
  icao: string;
  name: string | null;
  elevFt: number | null;
  longestRunwayM: number | null;
  runways: string;
  frequencies: string;
  fuelAvailable: boolean;
  fuelLabel: string;
} {
  const r = bundle.rotaer;
  const fuel = formatRotaerFuel(r?.fuel);
  return {
    role,
    icao,
    name: r?.name || null,
    elevFt: r?.altFt ?? null,
    longestRunwayM: longestRunwayM(r),
    runways: formatRunwaysShort(r),
    frequencies: formatFrequenciesShort(r?.frequencies),
    fuelAvailable: fuel.available,
    fuelLabel: fuel.detailLabel,
  };
}

export function formatAirspaceFreqCell(hit: FlightPlanAirspaceHit): string {
  if (!hit.frequencies?.length) return "—";
  return hit.frequencies.map((f) => `${f.service} ${f.mhz}`).join(" · ");
}
