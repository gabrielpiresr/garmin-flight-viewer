import type { SavedFlightListItem } from "./flightsDb";
import type { Aircraft, MaintenanceProgramItem, MaintenanceWorkOrder } from "../types/admin";

export type MaintenanceAsOfFlight = {
  lastInterventionType: string | null;
  lastInterventionDate: string | null;
  nextInterventionType: string | null;
  nextInterventionDueHours: number | null;
  returnToServiceResponsible: string | null;
};

type RecurrenceRules = { hours: number | null; days: number | null };

function parseRecurrenceRules(value: string): RecurrenceRules {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return { hours: null, days: null };
    const hoursRule = parsed.find((rule) => rule?.type === "hours");
    const calendarRule = parsed.find((rule) => rule?.type === "calendar" && rule?.unit === "days");
    return {
      hours: typeof hoursRule?.value === "number" ? hoursRule.value : null,
      days: typeof calendarRule?.value === "number" ? calendarRule.value : null,
    };
  } catch {
    return { hours: null, days: null };
  }
}

function isExcludedMaintenanceItem(item: MaintenanceProgramItem): boolean {
  const haystack = `${item.code} ${item.title}`.toLowerCase();
  return haystack.includes("transit") || haystack.includes("trânsito") || haystack.includes("diaria") || haystack.includes("diária");
}

function orderTimestamp(order: MaintenanceWorkOrder): number {
  const raw = order.completed_at ?? order.released_at ?? order.opened_at;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function flightDurationHours(flight: SavedFlightListItem): number {
  if (typeof flight.total_flight_minutes === "number" && Number.isFinite(flight.total_flight_minutes)) {
    return flight.total_flight_minutes / 60;
  }
  if (typeof flight.duration_sec === "number" && Number.isFinite(flight.duration_sec)) {
    return flight.duration_sec / 3600;
  }
  return 0;
}

function flightDateMs(flight: SavedFlightListItem): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function aircraftFlights(aircraft: Aircraft, flights: SavedFlightListItem[], asOfMs: number): SavedFlightListItem[] {
  const reg = aircraft.registration.trim().toUpperCase();
  return flights.filter(
    (flight) =>
      (flight.aircraft_ident ?? "").trim().toUpperCase() === reg && flightDateMs(flight) <= asOfMs,
  );
}

function latestBaseline(orders: MaintenanceWorkOrder[]): MaintenanceWorkOrder | null {
  return (
    orders
      .filter((order) => order.work_order_type === "migration_baseline")
      .sort((a, b) => orderTimestamp(b) - orderTimestamp(a))[0] ?? null
  );
}

function currentAircraftHoursAt(params: {
  aircraft: Aircraft;
  orders: MaintenanceWorkOrder[];
  flights: SavedFlightListItem[];
  asOfMs: number;
}): number | null {
  let baseTtaf: number | null = null;
  let baselineMs = 0;

  if (params.aircraft.logbook_ttaf != null) {
    baseTtaf = params.aircraft.logbook_ttaf;
    baselineMs = params.aircraft.logbook_opening_date
      ? new Date(params.aircraft.logbook_opening_date).getTime()
      : 0;
  } else {
    const baseline = latestBaseline(params.orders);
    if (!baseline) return null;
    baseTtaf = baseline.aircraft_ttaf;
    baselineMs = new Date(baseline.opened_at).getTime();
  }

  const flownHours = aircraftFlights(params.aircraft, params.flights, params.asOfMs)
    .filter((flight) => !Number.isFinite(baselineMs) || baselineMs === 0 || flightDateMs(flight) >= baselineMs)
    .reduce((sum, flight) => sum + flightDurationHours(flight), 0);
  return Number((baseTtaf + flownHours).toFixed(1));
}

function lastCompletedOrderBefore(params: {
  aircraftOrders: MaintenanceWorkOrder[];
  programItems: MaintenanceProgramItem[];
  asOfMs: number;
}): MaintenanceWorkOrder | null {
  const programById = new Map(params.programItems.map((item) => [item.id, item]));
  return (
    params.aircraftOrders
      .filter((order) => order.work_order_type !== "migration_baseline")
      .filter((order) => {
        const item = order.maintenance_program_item_id
          ? programById.get(order.maintenance_program_item_id)
          : null;
        if (item && isExcludedMaintenanceItem(item)) return false;
        return orderTimestamp(order) <= params.asOfMs;
      })
      .filter((order) => order.status === "completed" || order.status === "released")
      .sort((a, b) => orderTimestamp(b) - orderTimestamp(a))[0] ?? null
  );
}

function nextDueItemAt(params: {
  aircraft: Aircraft;
  modelItems: MaintenanceProgramItem[];
  aircraftOrders: MaintenanceWorkOrder[];
  flights: SavedFlightListItem[];
  asOfMs: number;
}): { title: string; dueHours: number | null } | null {
  const currentHours = currentAircraftHoursAt({
    aircraft: params.aircraft,
    orders: params.aircraftOrders,
    flights: params.flights,
    asOfMs: params.asOfMs,
  });
  if (currentHours == null) return null;

  let best: { title: string; remainingHours: number } | null = null;
  for (const item of params.modelItems) {
    if (isExcludedMaintenanceItem(item)) continue;
    const rules = parseRecurrenceRules(item.recurrence_rules);
    if (rules.hours == null || rules.hours <= 0) continue;
    const itemOrders = params.aircraftOrders.filter(
      (order) => order.maintenance_program_item_id === item.id && order.work_order_type !== "migration_baseline",
    );
    const latestPerformed = itemOrders.sort((a, b) => b.aircraft_ttaf - a.aircraft_ttaf)[0];
    const dueAt = latestPerformed ? latestPerformed.aircraft_ttaf + rules.hours : Math.ceil((currentHours + 0.0001) / rules.hours) * rules.hours;
    const remainingHours = Number((dueAt - currentHours).toFixed(1));
    if (!best || remainingHours < best.remainingHours) {
      best = { title: `${item.code} — ${item.title}`, remainingHours };
    }
  }
  if (!best) return null;
  return { title: best.title, dueHours: best.remainingHours };
}

export function buildMaintenanceAsOfFlight(params: {
  aircraft: Aircraft;
  programItems: MaintenanceProgramItem[];
  workOrders: MaintenanceWorkOrder[];
  flights: SavedFlightListItem[];
  asOfMs: number;
}): MaintenanceAsOfFlight {
  const aircraftOrders = params.workOrders.filter((order) => order.aircraft_id === params.aircraft.id);
  const modelItems = params.programItems.filter((item) => item.aircraft_model_id === params.aircraft.model_id);
  const last = lastCompletedOrderBefore({
    aircraftOrders,
    programItems: modelItems,
    asOfMs: params.asOfMs,
  });
  const lastItem = last?.maintenance_program_item_id
    ? modelItems.find((item) => item.id === last.maintenance_program_item_id)
    : null;
  const next = nextDueItemAt({
    aircraft: params.aircraft,
    modelItems,
    aircraftOrders,
    flights: params.flights,
    asOfMs: params.asOfMs,
  });

  return {
    lastInterventionType: lastItem ? `${lastItem.code} — ${lastItem.title}` : last?.description_performed ?? null,
    lastInterventionDate: last ? new Date(orderTimestamp(last)).toISOString() : null,
    nextInterventionType: next?.title ?? null,
    nextInterventionDueHours: next?.dueHours ?? null,
    returnToServiceResponsible: last?.released_by_canac ?? last?.mechanic_canac ?? null,
  };
}
