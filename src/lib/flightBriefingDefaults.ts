import type { AiswebAirportBundle, AiswebNotam } from "../types/aisweb";
import type { FlightBriefingAiReport, FlightBriefingAiTask } from "../types/flightBriefingAi";
import { decodeNotamSchedule, decodeNotamValidity } from "./notamScheduleDecode";

export const IMPORTANT_NOTAM_RE =
  /\b(?:RWY|TWY|CLSD|CLOSED|U\/S|UNSERVICEABLE|WIP|ILS|PAPI|ALS|LIGHT(?:ING)?|LUZ(?:ES)?|BIRD|AD\s*CLSD|AERODROME\s*CLOSED|FUEL|COMBUST|RESTRICT|PROHIBIT|LIMIT|INOP|FECHAD|OUT\s*OF\s*SERVICE|RVR|SNOWTAM)\b/i;

const OBSTACLE_ONLY_NOTAM_RE = /\b(?:OBST|GRUA|CRANE|MASTRO)\b/i;
const NAVAID_ONLY_NOTAM_RE = /\b(?:VOR|DVOR|DME|NDB|GPS|NAV\s*AID)\b/i;
const AIRFIELD_NOTAM_RE =
  /\b(?:RWY|TWY|AD\s*CLSD|AERODROME\s*CLOSED|CLSD|CLOSED|FUEL|COMBUST|PAPI|ALS|PORTO(?:E|Õ)S?|BIRD|WIP)\b/i;
const OPERATIONAL_NOTAM_RE =
  /\b(?:RWY|TWY|AD\s*CLSD|AERODROME\s*CLOSED|CLSD|CLOSED|FUEL|COMBUST|ILS|PAPI|U\/S|UNSERVICEABLE|INOP|FECHAD|PORTO(?:E|Õ)S?)\b/i;

export type BriefingAirportInput = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  note?: string;
};

export type BriefingNotamCard = {
  id: string;
  icao: string;
  number: string;
  title: string;
  text: string;
  validFrom: string | null;
  validTo: string | null;
  schedule: string | null;
  validityLabel: string;
  scheduleLabel: string;
};

function normalizeIcao(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function compactText(value: string, max = 520): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function nowIso(): string {
  return new Date().toISOString();
}

function taskId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return `task_${Math.abs(hash).toString(16).padStart(8, "0").slice(0, 12)}`;
}

export function standardNotamTaskTitle(icao: string): string {
  return `Verificar NOTAM - ${icao}`;
}

export function standardFuelTaskTitle(icao: string): string {
  return `Verificar abastecimento - ${icao}`;
}

export function standardHangarTaskTitle(icao: string): string {
  return `Verificar hangaragem - ${icao}`;
}

export function isImportantNotam(notam: Pick<AiswebNotam, "number" | "text">): boolean {
  const number = String(notam.number || "");
  const text = String(notam.text || "");
  if (!text.trim()) return false;
  if (OBSTACLE_ONLY_NOTAM_RE.test(text) && !OPERATIONAL_NOTAM_RE.test(text)) return false;
  if (NAVAID_ONLY_NOTAM_RE.test(text) && !AIRFIELD_NOTAM_RE.test(text)) return false;
  return IMPORTANT_NOTAM_RE.test(text) || IMPORTANT_NOTAM_RE.test(number);
}

export function notamImportanceRank(notam: Pick<AiswebNotam, "text" | "number">): number {
  const text = `${notam.number || ""} ${notam.text || ""}`.toUpperCase();
  if (/\bAD\s*CLSD\b|AERODROME\s*CLOSED/.test(text)) return 0;
  if (/\bRWY\b/.test(text) && /\bCLSD\b|\bCLOSED\b|\bFECHAD/.test(text)) return 1;
  if (/\bTWY\b/.test(text) && /\bCLSD\b|\bCLOSED\b|\bRETIRADO\b/.test(text)) return 2;
  if (/\bFUEL\b|\bCOMBUST/.test(text)) return 3;
  if (/\bILS\b|\bPAPI\b|\bALS\b/.test(text)) return 4;
  return 5;
}

export function pickImportantNotams(notams: AiswebNotam[] | undefined, limit = 3): AiswebNotam[] {
  return (notams || [])
    .filter((item) => isImportantNotam(item))
    .sort((a, b) => notamImportanceRank(a) - notamImportanceRank(b))
    .slice(0, limit);
}

export function buildNotamTaskContent(icao: string, notams: AiswebNotam[] | undefined): {
  description: string;
  highlights: string[];
} {
  const important = pickImportantNotams(notams, 3);
  const highlights = important.map((item) => {
    const number = String(item.number || "NOTAM").trim() || "NOTAM";
    const summary = compactText(item.text || "", 160);
    const validity = decodeNotamValidity(item.validFrom, item.validTo);
    const schedule = decodeNotamSchedule(item.schedule, item.validFrom);
    const when = [validity, schedule].filter(Boolean).join(" · ");
    return when ? `${number}: ${summary} — ${when}` : `${number}: ${summary} — merece atenção`;
  });
  const description = important.length
    ? `Há ${important.length} NOTAM(s) que merecem mais atenção (lista abaixo). Abra a lista completa no AISWEB e confirme validade antes do voo.`
    : `Nenhum NOTAM crítico óbvio nos dados atuais de ${icao}. Mesmo assim, abra a lista completa e confirme validade antes do voo.`;
  return { description, highlights };
}

export function importantNotamCardsFromAirports(airports: BriefingAirportInput[]): BriefingNotamCard[] {
  const cards: BriefingNotamCard[] = [];
  const seen = new Set<string>();
  for (const airport of airports) {
    const icao = normalizeIcao(airport.icao);
    for (const notam of airport.bundle?.notams || []) {
      if (!isImportantNotam(notam)) continue;
      const number = String(notam.number || "").trim() || "NOTAM";
      const text = String(notam.text || "").trim();
      if (!text) continue;
      const key = `${icao}:${number}:${text.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        id: notam.id || key,
        icao,
        number,
        title: `${icao} · ${number}`,
        text,
        validFrom: notam.validFrom || null,
        validTo: notam.validTo || null,
        schedule: String(notam.schedule || "").trim() || null,
        validityLabel: decodeNotamValidity(notam.validFrom, notam.validTo),
        scheduleLabel: decodeNotamSchedule(notam.schedule, notam.validFrom),
      });
    }
  }
  return cards.sort(
    (a, b) => notamImportanceRank({ number: a.number, text: a.text }) - notamImportanceRank({ number: b.number, text: b.text }),
  );
}

function fuelDescription(bundle: AiswebAirportBundle | undefined): string {
  const fuel = bundle?.rotaer?.fuel;
  const text = compactText(
    [fuel?.text, fuel?.hours, (fuel?.types || []).join(" | ")].filter(Boolean).join(" — "),
    520,
  );
  return (
    text ||
    "Confirmar disponibilidade, tipo, horário, forma de pagamento e aviso prévio do combustível antes do voo."
  );
}

function hangarDescription(bundle: AiswebAirportBundle | undefined): string {
  const chunks = [
    ...(bundle?.rotaer?.complements || []).map((item) => item.text),
    ...(bundle?.rotaer?.remarks || []).map((item) => item.text),
  ]
    .map((item) => String(item || "").trim())
    .filter((text) => {
      if (/hangar|pernoite|estadia|fbo/i.test(text)) return true;
      if (/p[aá]tio/i.test(text) && !/autoriza|ppr|slot|concession|webapp|ccr|rede\s*voa|formul/i.test(text)) return true;
      return false;
    });
  return (
    compactText(chunks.join(" | "), 520) ||
    "Verificar hangaragem, pernoite no pátio, taxas, contato do operador e necessidade de reserva."
  );
}

function defaultTask(partial: Omit<FlightBriefingAiTask, "status" | "pilotNote" | "updatedAt" | "sourceIds"> & {
  generatedAt: string;
}): FlightBriefingAiTask {
  return {
    ...partial,
    status: "open",
    sourceIds: [],
    pilotNote: "",
    updatedAt: partial.generatedAt,
  };
}

export function isDefaultOnlyBriefingReport(report: FlightBriefingAiReport | null | undefined): boolean {
  if (!report) return true;
  return report.model === "defaults" || report.status === "failed";
}

export function buildDefaultFlightBriefingReport(input: {
  origin: string;
  destination: string;
  alternates?: string[];
  airports: BriefingAirportInput[];
}): FlightBriefingAiReport {
  const generatedAt = nowIso();
  const origin = normalizeIcao(input.origin);
  const destination = normalizeIcao(input.destination);
  const alternates = (input.alternates || []).map(normalizeIcao).filter(Boolean);
  const tasks: FlightBriefingAiTask[] = [];

  for (const airport of input.airports || []) {
    const icao = normalizeIcao(airport.icao);
    if (!icao) continue;
    const role = airport.role === "destino" || airport.role === "alternativo" ? airport.role : "origem";
    const notamContent = buildNotamTaskContent(icao, airport.bundle?.notams);

    tasks.push(
      defaultTask({
        id: taskId(`${icao}:notam`),
        airportIcao: icao,
        title: standardNotamTaskTitle(icao),
        description: notamContent.description,
        highlights: notamContent.highlights,
        action: "manual",
        priority: "high",
        dueHint: "Antes do voo",
        providers: [],
        generatedAt,
      }),
    );

    tasks.push(
      defaultTask({
        id: taskId(`${icao}:fuel`),
        airportIcao: icao,
        title: standardFuelTaskTitle(icao),
        description: fuelDescription(airport.bundle),
        action: "manual",
        priority: role === "origem" ? "medium" : "high",
        dueHint: "Antes da decolagem",
        providers: [],
        generatedAt,
      }),
    );

    if (role === "destino" || role === "alternativo") {
      tasks.push(
        defaultTask({
          id: taskId(`${icao}:hangarage`),
          airportIcao: icao,
          title: standardHangarTaskTitle(icao),
          description: hangarDescription(airport.bundle),
          action: "manual",
          priority: "medium",
          dueHint: "Se houver pernoite ou permanência",
          providers: [],
          generatedAt,
        }),
      );
    }
  }

  const rank = (task: FlightBriefingAiTask) => {
    const text = `${task.title} ${task.description}`.toLowerCase();
    if (/notam/.test(text)) return 0;
    if (/autoriza|slot|ppr|formul|agendamento\s+rede\s+voa/.test(text)) return 1;
    if (/combust|abastec/.test(text)) return 2;
    if (/hangar|pernoite/.test(text)) return 3;
    return 4;
  };
  tasks.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return String(a.airportIcao || "").localeCompare(String(b.airportIcao || ""));
  });

  return {
    status: "fallback",
    model: "defaults",
    generatedAt,
    route: { origin, destination, alternates },
    summary: "",
    warnings: [],
    airports: [],
    tasks,
    sources: [],
  };
}
