/** Cores fixas por matrícula de aeronave (ident normalizado, ex.: PSDZA). */

function normalizeAircraftIdent(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRegistration(registration: string): number {
  const key = registration || "unknown";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % 997;
  return hash;
}

/** Paleta padrão para cards da agenda (admin/aluno). */
export const AIRCRAFT_COLOR_CLASSES = [
  "bg-sky-600 border-sky-400/70",
  "bg-emerald-600 border-emerald-400/70",
  "bg-violet-600 border-violet-400/70",
  "bg-amber-600 border-amber-400/70",
  "bg-cyan-600 border-cyan-400/70",
  "bg-fuchsia-600 border-fuchsia-400/70",
  "bg-rose-600 border-rose-400/70",
] as const;

/** Paleta com opacidade para o gerador de escala. */
export const AIRCRAFT_GENERATION_COLOR_CLASSES = [
  "bg-sky-600/90 border-sky-400/70",
  "bg-emerald-600/90 border-emerald-400/70",
  "bg-violet-600/90 border-violet-400/70",
  "bg-amber-600/90 border-amber-400/70",
  "bg-cyan-600/90 border-cyan-400/70",
  "bg-fuchsia-600/90 border-fuchsia-400/70",
  "bg-rose-600/90 border-rose-400/70",
] as const;

/** Paleta para badges em listagens de voos. */
export const AIRCRAFT_BADGE_COLOR_CLASSES = [
  "bg-sky-900/60 text-sky-300 border-sky-600/50",
  "bg-violet-900/60 text-violet-300 border-violet-600/50",
  "bg-emerald-900/60 text-emerald-400 border-emerald-600/50",
  "bg-amber-900/60 text-amber-400 border-amber-600/50",
  "bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-600/50",
] as const;

const AIRCRAFT_REGISTRATION_SCHEDULE_COLORS: Record<string, string> = {
  PSDZA: "bg-violet-600 border-violet-400/70",
  PSDZB: "bg-[#7C8800] border-[#7C8800]/70",
};

const AIRCRAFT_REGISTRATION_GENERATION_COLORS: Record<string, string> = {
  PSDZA: "bg-violet-600/90 border-violet-400/70",
  PSDZB: "bg-[#7C8800]/90 border-[#7C8800]/70",
};

const AIRCRAFT_REGISTRATION_BADGE_COLORS: Record<string, string> = {
  PSDZA: "bg-violet-900/60 text-violet-300 border-violet-600/50",
  PSDZB: "bg-[#7C8800]/20 text-[#7C8800] border-[#7C8800]/50",
};

export function getAircraftScheduleColorClass(registration: string, fallbackIndex = 0): string {
  const ident = normalizeAircraftIdent(registration);
  return AIRCRAFT_REGISTRATION_SCHEDULE_COLORS[ident]
    ?? AIRCRAFT_COLOR_CLASSES[fallbackIndex % AIRCRAFT_COLOR_CLASSES.length]!;
}

export function getAircraftGenerationColorClass(registration: string, fallbackIndex = 0): string {
  const ident = normalizeAircraftIdent(registration);
  return AIRCRAFT_REGISTRATION_GENERATION_COLORS[ident]
    ?? AIRCRAFT_GENERATION_COLOR_CLASSES[fallbackIndex % AIRCRAFT_GENERATION_COLOR_CLASSES.length]!;
}

export function getAircraftBadgeColorClass(registration: string, fallbackIndex?: number): string {
  const ident = normalizeAircraftIdent(registration);
  if (AIRCRAFT_REGISTRATION_BADGE_COLORS[ident]) return AIRCRAFT_REGISTRATION_BADGE_COLORS[ident]!;
  const index = fallbackIndex ?? hashRegistration(registration);
  return AIRCRAFT_BADGE_COLOR_CLASSES[index % AIRCRAFT_BADGE_COLOR_CLASSES.length]!;
}

export function buildAircraftScheduleColorMap(registrations: string[]): Map<string, string> {
  const map = new Map<string, string>();
  registrations.forEach((reg, index) => {
    map.set(reg, getAircraftScheduleColorClass(reg, index));
  });
  return map;
}

export function aircraftCardColor(className: string): string {
  return className
    .split(" ")
    .filter((part) => !part.startsWith("border-"))
    .join(" ");
}
