import type { MaintenanceProgramItem, MaintenanceWorkOrder } from "../types/admin";

export function maintenanceOrderTimestamp(order: MaintenanceWorkOrder): number {
  const value = new Date(order.completed_at ?? order.released_at ?? order.opened_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

function completedMaintenanceOrders(
  orders: MaintenanceWorkOrder[],
  asOfMs: number,
): MaintenanceWorkOrder[] {
  return orders
    .filter((order) => !order.deleted_at && order.work_order_type !== "migration_baseline"
      && order.status !== "canceled"
      && (order.status === "completed" || order.status === "released" || order.aircraft_released)
      && maintenanceOrderTimestamp(order) <= asOfMs)
    .sort((a, b) => maintenanceOrderTimestamp(b) - maintenanceOrderTimestamp(a)
      || b.aircraft_ttaf - a.aircraft_ttaf
      || (b.created_at ?? "").localeCompare(a.created_at ?? "")
      || b.id.localeCompare(a.id));
}

/** A new completed entry without an override restores the normal program. */
export function resolveManualNextMaintenance(
  orders: MaintenanceWorkOrder[],
  modelItems: MaintenanceProgramItem[],
  asOfMs = Date.now(),
): { item: MaintenanceProgramItem; dueAtHours: number } | null {
  const latest = completedMaintenanceOrders(orders, asOfMs)[0];
  const dueAtHours = latest?.manual_next_due_hours;
  if (dueAtHours == null || !Number.isFinite(dueAtHours) || dueAtHours <= latest.aircraft_ttaf) return null;
  const item = modelItems.find((row) => row.id === latest.manual_next_program_item_id);
  return item ? { item, dueAtHours } : null;
}

/** An explicitly planned and completed inspection anchors otherwise unknown program cycles. */
export function resolveManualMaintenanceCompletion(
  orders: MaintenanceWorkOrder[],
  modelItems: MaintenanceProgramItem[],
  asOfMs = Date.now(),
): MaintenanceWorkOrder | null {
  const completed = completedMaintenanceOrders(orders, asOfMs);
  for (let index = 0; index < completed.length - 1; index += 1) {
    const performed = completed[index];
    const planned = completed[index + 1];
    const manual = resolveManualNextMaintenance([planned], modelItems, asOfMs);
    if (manual && performed.maintenance_program_item_id === manual.item.id
      && performed.aircraft_ttaf > planned.aircraft_ttaf) return performed;
  }
  return null;
}

/** The fulfilled manual plan supersedes program slots up to that execution, without changing service history. */
export function programDueAfterManualCompletion(dueAtHours: number, intervalHours: number, completedManualHours: number | null): number {
  if (completedManualHours == null || dueAtHours > completedManualHours + 0.0001) return dueAtHours;
  return dueAtHours + (Math.floor((completedManualHours - dueAtHours + 0.0001) / intervalHours) + 1) * intervalHours;
}
