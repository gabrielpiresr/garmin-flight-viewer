import type { AircraftWeekSupply, ExistingScheduledFlight } from "../types/schedule";

export type FlightConflictType = "aircraft_blocked" | "min_gap" | "overlap" | "other";

export type ConflictFlightDraft = {
  id?: string;
  studentId: string;
  studentLabel: string;
  instructorId?: string | null;
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
};

export type DetectedFlightConflict = {
  type: FlightConflictType;
  message: string;
  relatedFlightId?: string;
};

function formatHHMM(hourDecimal: number): string {
  const totalMinutes = Math.round(hourDecimal * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toMinutes(startHour: number, durationHours: number): { start: number; end: number } {
  const start = Math.round(startHour * 60);
  const end = start + Math.round(durationHours * 60);
  return { start, end };
}

const DAY_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

export function detectFlightConflicts(params: {
  draft: ConflictFlightDraft;
  supplies: AircraftWeekSupply[];
  flights: ExistingScheduledFlight[];
  minGapMinutes: number;
}): DetectedFlightConflict[] {
  const conflicts: DetectedFlightConflict[] = [];
  const draft = params.draft;

  if (!Number.isFinite(draft.startHour) || !Number.isFinite(draft.durationHours) || draft.durationHours <= 0) {
    conflicts.push({
      type: "other",
      message: "Horário ou duração inválidos.",
    });
    return conflicts;
  }

  const supply = params.supplies.find((row) => row.aircraftRegistration === draft.aircraftRegistration);
  const slotKey = `${draft.dayOfWeek}-${draft.startHour}`;
  if (!supply || !supply.slotStates[slotKey] || supply.slotStates[slotKey] === "blocked") {
    conflicts.push({
      type: "aircraft_blocked",
      message: `Aeronave ${draft.aircraftRegistration} bloqueada em ${DAY_LABEL[draft.dayOfWeek]} ${formatHHMM(draft.startHour)}.`,
    });
  }

  const draftWindow = toMinutes(draft.startHour, draft.durationHours);
  const minGap = Math.max(0, params.minGapMinutes);
  for (const row of params.flights) {
    if (draft.id && row.id === draft.id) continue;
    if (!row.aircraftRegistration) continue;
    if (row.aircraftRegistration !== draft.aircraftRegistration) continue;

    const date = new Date(`${row.date}T12:00:00`);
    if (date.getDay() !== draft.dayOfWeek) continue;
    const [hh, mm] = row.startTime.split(":").map(Number);
    const startHour = (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
    const rowWindow = toMinutes(startHour, row.durationHours);
    const overlap = draftWindow.start < rowWindow.end && draftWindow.end > rowWindow.start;
    if (overlap) {
      conflicts.push({
        type: "overlap",
        relatedFlightId: row.id,
        message:
          `Sobreposição com voo em ${formatHHMM(startHour)}-${formatHHMM(startHour + row.durationHours)}.`,
      });
      continue;
    }

    const gapIsTooShort =
      draftWindow.start < rowWindow.end + minGap && rowWindow.start < draftWindow.end + minGap;
    if (gapIsTooShort) {
      conflicts.push({
        type: "min_gap",
        relatedFlightId: row.id,
        message:
          `Intervalo menor que ${minGap} min em relação ao voo em ${formatHHMM(startHour)}-${formatHHMM(startHour + row.durationHours)}.`,
      });
    }
  }

  for (const row of params.flights) {
    if (draft.id && row.id === draft.id) continue;
    if (row.studentId !== draft.studentId) continue;
    const date = new Date(`${row.date}T12:00:00`);
    if (date.getDay() !== draft.dayOfWeek) continue;
    const [hh, mm] = row.startTime.split(":").map(Number);
    const startHour = (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
    const rowWindow = toMinutes(startHour, row.durationHours);
    const overlap = draftWindow.start < rowWindow.end && draftWindow.end > rowWindow.start;
    if (overlap) {
      conflicts.push({
        type: "other",
        relatedFlightId: row.id,
        message: "Aluno já possui voo sobreposto no mesmo dia.",
      });
      break;
    }
  }

  if (draft.instructorId) {
    for (const row of params.flights) {
      if (draft.id && row.id === draft.id) continue;
      if (row.instructorId !== draft.instructorId) continue;
      const date = new Date(`${row.date}T12:00:00`);
      if (date.getDay() !== draft.dayOfWeek) continue;
      const [hh, mm] = row.startTime.split(":").map(Number);
      const startHour = (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
      const rowWindow = toMinutes(startHour, row.durationHours);
      const overlap = draftWindow.start < rowWindow.end && draftWindow.end > rowWindow.start;
      if (overlap) {
        conflicts.push({
          type: "other",
          relatedFlightId: row.id,
          message: "Instrutor já possui voo sobreposto no mesmo dia.",
        });
        break;
      }
    }
  }

  const unique = new Map<string, DetectedFlightConflict>();
  for (const conflict of conflicts) {
    const key = `${conflict.type}:${conflict.relatedFlightId ?? "-"}:${conflict.message}`;
    if (!unique.has(key)) unique.set(key, conflict);
  }
  return [...unique.values()];
}
