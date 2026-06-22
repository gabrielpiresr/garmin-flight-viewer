import { listAircrafts } from "./aircraftDb";
import { listProgramItemsByModel, listWorkOrders } from "./maintenanceDb";
import { listAllSavedFlights, type SavedFlightListItem } from "./flightsDb";
import { flightAircraftHours } from "./flightHours";
import { listAircraftHorimeterCorrections, resolveEffectiveHoursBaseline, type AircraftHorimeterCorrection } from "./aircraftHorimeterCorrectionsDb";
import type { Aircraft, MaintenanceProgramItem, MaintenanceWorkOrder } from "../types/admin";

// Horas totais atuais por aeronave — mesmo cálculo da aba Frota (FleetTab):
// abertura do diário (logbook_ttaf) ou baseline de migração + horas voadas desde então.
// Também expõe os intervalos de cada manutenção por horas para a escala
// destacar todo múltiplo projetado, sem depender do histórico de OS.

export type AircraftMaintenanceDue = {
  code: string;
  title: string;
  /** Intervalo da recorrência (h). Quando várias vencem juntas, prevalece o maior intervalo (ex.: 600h engloba a 100h). */
  intervalHours: number;
};

export type AircraftBaseHours = {
  registration: string;
  type: Aircraft["type"];
  hours: number | null;
  maintenanceDue: AircraftMaintenanceDue[];
};

function flightDateMs(flight: SavedFlightListItem): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function latestBaseline(orders: MaintenanceWorkOrder[]): MaintenanceWorkOrder | null {
  return orders
    .filter((order) => order.work_order_type === "migration_baseline")
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null;
}

function resolveOpening(
  aircraft: Aircraft,
  orders: MaintenanceWorkOrder[],
  corrections: AircraftHorimeterCorrection[] = [],
): { baselineMs: number; ttaf: number | null } {
  let originalBaselineMs: number;
  let originalTtaf: number | null;
  if (aircraft.logbook_ttaf != null) {
    originalBaselineMs = aircraft.logbook_opening_date ? new Date(aircraft.logbook_opening_date).getTime() : 0;
    originalTtaf = aircraft.logbook_ttaf;
  } else {
    const baseline = latestBaseline(orders);
    if (!baseline) return resolveEffectiveHoursBaseline(0, null, corrections);
    originalBaselineMs = new Date(baseline.opened_at).getTime();
    originalTtaf = baseline.aircraft_ttaf;
  }
  return resolveEffectiveHoursBaseline(originalBaselineMs, originalTtaf, corrections);
}

function parseHoursInterval(value: string): number | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const hoursRule = parsed.find((rule) => (rule as { type?: string })?.type === "hours") as { value?: number } | undefined;
    return typeof hoursRule?.value === "number" && hoursRule.value > 0 ? hoursRule.value : null;
  } catch {
    return null;
  }
}

/** Itens de trânsito/diária venceriam todo dia — não fazem sentido como destaque na escala. */
function isExcludedMaintenanceItem(item: MaintenanceProgramItem): boolean {
  const haystack = `${item.code} ${item.title}`.toLowerCase();
  return haystack.includes("transit") || haystack.includes("trânsito") || haystack.includes("diaria") || haystack.includes("diária");
}

/** Recorrências por horas usadas na escala, independentes das OS realizadas. */
function maintenanceDueList(modelItems: MaintenanceProgramItem[]): AircraftMaintenanceDue[] {
  const due: AircraftMaintenanceDue[] = [];
  for (const item of modelItems) {
    if (isExcludedMaintenanceItem(item)) continue;
    const interval = parseHoursInterval(item.recurrence_rules);
    if (interval == null) continue;
    due.push({ code: item.code, title: item.title, intervalHours: interval });
  }
  return due.sort((a, b) => b.intervalHours - a.intervalHours);
}

export async function loadAircraftBaseHours(schoolId: string): Promise<AircraftBaseHours[]> {
  const [aircrafts, orders, flightsResult, corrections] = await Promise.all([
    listAircrafts(schoolId),
    listWorkOrders().catch(() => [] as MaintenanceWorkOrder[]),
    listAllSavedFlights({ userId: "admin", role: "admin" }, { pageSize: 100, maxItems: 5000 }),
    listAircraftHorimeterCorrections(schoolId).catch(() => [] as AircraftHorimeterCorrection[]),
  ]);
  if (flightsResult.error) throw flightsResult.error;
  const flights = flightsResult.data ?? [];

  // Itens de programa por modelo (1 consulta por modelo distinto)
  const uniqueModelIds = [...new Set(aircrafts.map((aircraft) => aircraft.model_id).filter(Boolean))];
  const programEntries = await Promise.all(
    uniqueModelIds.map(async (modelId) => [modelId, await listProgramItemsByModel(modelId).catch(() => [])] as const),
  );
  const programItemsByModel = new Map(programEntries);

  const flightsByRegistration = new Map<string, SavedFlightListItem[]>();
  for (const flight of flights) {
    const registration = (flight.aircraft_ident ?? "").trim().toUpperCase();
    if (!registration) continue;
    const rows = flightsByRegistration.get(registration) ?? [];
    rows.push(flight);
    flightsByRegistration.set(registration, rows);
  }

  const ordersByAircraftId = new Map<string, MaintenanceWorkOrder[]>();
  for (const order of orders) {
    const rows = ordersByAircraftId.get(order.aircraft_id) ?? [];
    rows.push(order);
    ordersByAircraftId.set(order.aircraft_id, rows);
  }

  const correctionsByAircraftId = new Map<string, AircraftHorimeterCorrection[]>();
  for (const correction of corrections) {
    const rows = correctionsByAircraftId.get(correction.aircraft_id) ?? [];
    rows.push(correction);
    correctionsByAircraftId.set(correction.aircraft_id, rows);
  }

  const now = Date.now();
  return aircrafts.map((aircraft) => {
    const aircraftOrders = ordersByAircraftId.get(aircraft.id) ?? [];
    const aircraftCorrections = correctionsByAircraftId.get(aircraft.id) ?? [];
    const opening = resolveOpening(aircraft, aircraftOrders, aircraftCorrections);
    if (opening.ttaf == null) {
      return { registration: aircraft.registration, type: aircraft.type, hours: null, maintenanceDue: [] };
    }
    const flown = (flightsByRegistration.get(aircraft.registration.trim().toUpperCase()) ?? [])
      .filter((flight) => opening.baselineMs === 0 || flightDateMs(flight) >= opening.baselineMs)
      .filter((flight) => flightDateMs(flight) <= now)
      .reduce((sum, flight) => sum + flightAircraftHours(flight, null), 0);
    const hours = Number((opening.ttaf + flown).toFixed(1));
    return {
      registration: aircraft.registration,
      type: aircraft.type,
      hours,
      maintenanceDue: maintenanceDueList(programItemsByModel.get(aircraft.model_id) ?? []),
    };
  });
}
