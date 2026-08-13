import type { AiswebAirportBundle, AiswebFrequency, AiswebFuel, AiswebRotaer } from "../types/aisweb";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";
import { AIRSPACE_LAYER_DEFS } from "./airspaceLayersDb";
import { formatEteClock } from "./flightPlanningRoute";

const FUEL_TYPE_LABELS: Record<string, string> = {
  PF: "Gasolina de aviação (AVGAS)",
  TF: "Querosene de aviação (JET-A1)",
  AVGAS: "Gasolina de aviação (AVGAS)",
  JET: "Querosene de aviação (JET)",
  JETA1: "Querosene de aviação (JET-A1)",
  "JET-A1": "Querosene de aviação (JET-A1)",
  "JET A1": "Querosene de aviação (JET-A1)",
};

const AIRSPACE_FREQ_RE = /^(APP|TWR|TWR\b|GND|ATIS|AFIS|ACC|CLEARANCE|CLNC|RADIO|INFO|DELIVERY|SMC|CONTROLE|EMERG)/i;

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

export function pickAirspaceFrequencies(
  frequencies: AiswebFrequency[] | null | undefined,
  options?: { preferServices?: RegExp },
): Array<{
  service: string;
  mhz: string;
}> {
  const list = frequencies || [];
  let preferred = list.filter((f) => AIRSPACE_FREQ_RE.test(f.service));
  const prefer = options?.preferServices;
  if (prefer && preferred.length) {
    const ranked = preferred.filter((f) => prefer.test(f.service));
    if (ranked.length) {
      preferred = [...ranked, ...preferred.filter((f) => !prefer.test(f.service))];
    }
  }
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

/** Tailwind classes for airspace type badges in route tables. */
export function airspaceHitTypeBadgeClass(type: FlightPlanAirspaceHit["type"]): string {
  switch (type) {
    case "FIR":
      return "bg-slate-500/20 text-slate-200";
    case "FIS":
      return "bg-fuchsia-500/20 text-fuchsia-200";
    case "TMA":
      return "bg-violet-500/20 text-violet-200";
    case "CTA":
      return "bg-amber-500/20 text-amber-200";
    case "CTR":
      return "bg-sky-500/20 text-sky-200";
    case "ATZ":
      return "bg-emerald-500/20 text-emerald-200";
    case "FIZ":
      return "bg-teal-500/20 text-teal-200";
    case "AFIS":
      return "bg-green-500/20 text-green-200";
    case "P":
      return "bg-red-500/20 text-red-200";
    case "R":
      return "bg-orange-500/20 text-orange-200";
    case "D":
      return "bg-yellow-500/20 text-yellow-200";
    default:
      return "bg-slate-500/20 text-slate-200";
  }
}

export function airspaceHitColor(type: FlightPlanAirspaceHit["type"]): string {
  return AIRSPACE_LAYER_DEFS.find((d) => d.type === type)?.color ?? "#94a3b8";
}

export function formatAirspaceEntryDistance(nm: number | null | undefined): string {
  if (nm == null || !Number.isFinite(nm)) return "—";
  return `${nm.toFixed(1)} NM`;
}

export function formatAirspaceEntryEte(eteHours: number | null | undefined): string | null {
  const clock = formatEteClock(eteHours ?? null);
  return clock === "—" ? null : clock;
}
