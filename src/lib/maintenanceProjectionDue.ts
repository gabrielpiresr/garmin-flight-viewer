export type ProjectionMaintenanceItem = {
  intervalHours: number;
  manualDueAtHours?: number;
};

/** During a simulation, perform the explicit next inspection before resuming the program. */
export function maintenanceProjectionCandidates<T extends ProjectionMaintenanceItem>(
  items: T[],
  currentHours: number,
  manualPerformed: boolean,
): Array<{ item: T; due: number }> {
  const manual = !manualPerformed ? items.find((item) => item.manualDueAtHours != null) : null;
  if (manual) return [{ item: manual, due: manual.manualDueAtHours! }];
  return items.filter((item) => item.intervalHours > 0).map((item) => ({
    item,
    due: (Math.floor(currentHours / item.intervalHours) + 1) * item.intervalHours,
  }));
}

export function crossedMaintenanceCandidates<T extends ProjectionMaintenanceItem>(
  items: T[],
  hoursBefore: number,
  hoursAfter: number,
  manualPerformed: boolean,
): Array<{ item: T; due: number }> {
  return maintenanceProjectionCandidates(items, hoursBefore, manualPerformed)
    .filter(({ item, due }) => {
      const pendingManual = item.manualDueAtHours != null && !manualPerformed;
      return (pendingManual || hoursBefore < due - 1e-9) && hoursAfter + 1e-9 >= due;
    });
}
