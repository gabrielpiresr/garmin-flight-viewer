import { listAdminFlightReports } from "./adminUsersDb";

export type InstructorHoursMap = Record<string, { totalHours: number; monthHours: number }>;

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

async function aggregateInstructorHours(fromDate?: string): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  let cursor: string | null = null;

  do {
    const page = await listAdminFlightReports({
      fromDate,
      status: "Realizado",
      ghostMode: "exclude",
      limit: 500,
      cursor,
    });

    for (const flight of page.flights) {
      const instructorId = flight.instructorUserId;
      if (!instructorId) continue;
      totals[instructorId] = (totals[instructorId] || 0) + (flight.hours || 0);
    }

    cursor = page.nextCursor;
  } while (cursor);

  return totals;
}

export async function loadInstructorHoursMap(userIds: string[]): Promise<InstructorHoursMap> {
  const [totalByUser, monthByUser] = await Promise.all([
    aggregateInstructorHours(),
    aggregateInstructorHours(monthStartIso()),
  ]);

  const ids =
    userIds.length > 0
      ? userIds
      : [...new Set([...Object.keys(totalByUser), ...Object.keys(monthByUser)])];

  const result: InstructorHoursMap = {};
  for (const userId of ids) {
    result[userId] = {
      totalHours: Number((totalByUser[userId] || 0).toFixed(1)),
      monthHours: Number((monthByUser[userId] || 0).toFixed(1)),
    };
  }
  return result;
}

export function formatHoursLabel(hours: number): string {
  return `${hours.toFixed(1)}h`;
}
