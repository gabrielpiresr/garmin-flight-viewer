import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { decodeFlightRecord, encodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { deleteSavedFlight, getSavedFlight, insertFlight, updateFlight } from "../../lib/flightsDb";
import { detectFlightConflicts, type ConflictFlightDraft, type DetectedFlightConflict } from "../../lib/scheduleConflicts";
import {
  AUTO_SOURCE_PREFIX,
  getScheduleWeekData,
  getScheduleWeekOptions,
  MANUAL_SOURCE_PREFIX,
} from "../../lib/scheduleGenerationDb";
import { SLOT_HOURS, type SlotState } from "../../types/admin";
import type { ExistingScheduledFlight, InstructorIdentity, ScheduleWeekData, ScheduleWeekOption } from "../../types/schedule";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { StudentSearchSelect } from "./StudentSearchSelect";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const AIRCRAFT_COLOR_CLASSES = [
  "bg-sky-600/90 border-sky-400/70",
  "bg-emerald-600/90 border-emerald-400/70",
  "bg-violet-600/90 border-violet-400/70",
  "bg-amber-600/90 border-amber-400/70",
  "bg-cyan-600/90 border-cyan-400/70",
  "bg-fuchsia-600/90 border-fuchsia-400/70",
  "bg-rose-600/90 border-rose-400/70",
];
const INSTRUCTOR_BORDER_CLASSES = [
  "border-lime-300",
  "border-orange-300",
  "border-pink-300",
  "border-teal-300",
  "border-indigo-300",
  "border-red-300",
  "border-yellow-300",
];

function aircraftCardColor(className: string): string {
  return className
    .split(" ")
    .filter((part) => !part.startsWith("border-"))
    .join(" ");
}

const SLOT_BG_TINT: Record<SlotState, string> = {
  preferred: "bg-emerald-500/20",
  normal: "bg-sky-500/20",
  avoid: "bg-amber-400/20",
  blocked: "bg-red-500/22",
};

type FlightFormDraft = {
  id?: string;
  demandId: string;
  sourceFilename?: string;
  studentId: string;
  studentLabel: string;
  instructorId: string | null;
  instructorLabel: string | null;
  instructorAnac: string | null;
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
};

type CalendarFlightItem = {
  id: string;
  studentLabel: string;
  instructorId: string | null;
  instructorLabel: string | null;
  totalWeightLabel: string;
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  durationHours: number;
  startTime: string;
  endTime: string;
};

function weekDateFromStart(weekStart: string, dayOfWeek: number): string {
  const base = new Date(`${weekStart}T12:00:00`);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function hoursToHHMM(hours: number): string {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseStartHour(startTime: string): number {
  const [hh, mm] = startTime.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
}

function buildAutoMeta(draft: FlightFormDraft, weekStart: string, instructor?: InstructorIdentity | null): FlightRecordMeta {
  const weekDate = weekDateFromStart(weekStart, draft.dayOfWeek);
  return {
    status: "draft",
    schedule: {
      version: "AUTO_SCHEDULE_V1",
      weekStart,
      demandId: draft.demandId,
    },
    header: {
      studentUserId: draft.studentId,
      studentLabel: draft.studentLabel,
      studentName: draft.studentLabel,
      instructorUserId: draft.instructorId ?? undefined,
      instructorName: instructor?.label ?? draft.instructorLabel ?? "",
      instructorAnac: instructor?.anacCode ?? draft.instructorAnac ?? "",
      date: weekDate,
      startTime: hoursToHHMM(draft.startHour),
      aircraft: draft.aircraftRegistration,
    },
    preFlight: {
      objectiveMd: "",
      briefingMd: "",
    },
    legs: [
      {
        id: crypto.randomUUID(),
        date: weekDate,
        role: "DUPLO COMANDO",
        dep: "---",
        arr: "---",
        landings: 0,
        flightTime: hoursToHHMM(draft.durationHours),
        navTime: "00:00",
        ifrTime: "00:00",
        nightTime: "00:00",
        serviceTime: "00:00",
        distance: "0",
      },
    ],
    risk: { commentsMd: "", dangerMd: "", riskMd: "", managementMd: "", instructorOpinionMd: "" },
  };
}

function toConflictDraft(row: ExistingScheduledFlight, studentLabel: string): ConflictFlightDraft {
  return {
    id: row.id,
    studentId: row.studentId,
    studentLabel,
    instructorId: row.instructorId,
    aircraftRegistration: row.aircraftRegistration ?? "Aeronave",
    dayOfWeek: new Date(`${row.date}T12:00:00`).getDay(),
    startHour: parseStartHour(row.startTime),
    durationHours: row.durationHours,
  };
}

function conflictTypeLabel(type: DetectedFlightConflict["type"]): string {
  if (type === "aircraft_blocked") return "Aeronave bloqueada";
  if (type === "min_gap") return "Menos de 30 min entre voos";
  if (type === "overlap") return "Voos sobrepostos";
  return "Outro";
}

function resolveInstructorDraft(
  instructors: InstructorIdentity[],
  instructorId: string | null,
): Pick<FlightFormDraft, "instructorId" | "instructorLabel" | "instructorAnac"> {
  if (!instructorId) return { instructorId: null, instructorLabel: null, instructorAnac: null };
  const instructor = instructors.find((row) => row.userId === instructorId);
  return {
    instructorId,
    instructorLabel: instructor?.label ?? instructorId,
    instructorAnac: instructor?.anacCode ?? null,
  };
}

function CalendarGrid({
  items,
  colorByAircraft,
  borderByInstructor,
  backgroundSupply,
  onItemClick,
}: {
  items: CalendarFlightItem[];
  colorByAircraft: Map<string, string>;
  borderByInstructor: Map<string, string>;
  backgroundSupply?: ScheduleWeekData["supplies"][number] | null;
  onItemClick: (item: CalendarFlightItem) => void;
}) {
  const rowHeight = 38;
  const boardHeight = SLOT_HOURS.length * rowHeight;
  const hourIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    SLOT_HOURS.forEach((hour, idx) => map.set(hour, idx));
    return map;
  }, []);
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarFlightItem[]>();
    for (const day of DAY_ORDER) map.set(day, []);
    for (const item of items) {
      const rows = map.get(item.dayOfWeek) ?? [];
      rows.push(item);
      map.set(item.dayOfWeek, rows);
    }
    for (const day of DAY_ORDER) {
      map.set(
        day,
        (map.get(day) ?? []).sort((a, b) => a.startHour - b.startHour),
      );
    }
    return map;
  }, [items]);

  const layoutByDay = useMemo(() => {
    const out = new Map<
      number,
      Array<{
        item: CalendarFlightItem;
        columnIndex: number;
        columnCount: number;
      }>
    >();

    for (const day of DAY_ORDER) {
      const sorted = [...(byDay.get(day) ?? [])].sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.durationHours - b.durationHours;
      });
      const groups: CalendarFlightItem[][] = [];
      let currentGroup: CalendarFlightItem[] = [];
      let currentGroupEnd = -1;

      for (const item of sorted) {
        const start = item.startHour * 60;
        const end = start + item.durationHours * 60;
        if (currentGroup.length === 0 || start < currentGroupEnd) {
          currentGroup.push(item);
          currentGroupEnd = Math.max(currentGroupEnd, end);
        } else {
          groups.push(currentGroup);
          currentGroup = [item];
          currentGroupEnd = end;
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);

      const entries: Array<{ item: CalendarFlightItem; columnIndex: number; columnCount: number }> = [];
      for (const group of groups) {
        const active: Array<{ end: number; column: number }> = [];
        const assigned = new Map<string, number>();
        let maxColumn = 0;
        for (const item of group) {
          const start = item.startHour * 60;
          const end = start + item.durationHours * 60;
          for (let i = active.length - 1; i >= 0; i -= 1) {
            if (active[i]!.end <= start) active.splice(i, 1);
          }
          let nextColumn = 0;
          while (active.some((node) => node.column === nextColumn)) nextColumn += 1;
          active.push({ end, column: nextColumn });
          assigned.set(item.id, nextColumn);
          maxColumn = Math.max(maxColumn, nextColumn + 1);
        }
        for (const item of group) {
          entries.push({
            item,
            columnIndex: assigned.get(item.id) ?? 0,
            columnCount: maxColumn,
          });
        }
      }
      out.set(day, entries);
    }

    return out;
  }, [byDay]);

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Agenda semanal</p>
      <div className="overflow-x-auto">
        <table className="min-w-[680px] table-fixed border-separate border-spacing-1 md:w-full">
          <thead>
            <tr>
              <th className="w-12 pb-1 text-right text-[10px] font-medium text-slate-600" />
              {DAY_ORDER.map((day) => (
                <th key={day} className="w-[14.2%] pb-1 text-center text-xs font-semibold text-slate-400">
                  {DAY_LABEL[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="align-top pr-2">
                <div className="relative" style={{ height: `${boardHeight}px` }}>
                  {SLOT_HOURS.map((hour, idx) => (
                    <div key={hour} className="absolute right-0 text-right text-[11px] font-mono text-slate-600" style={{ top: `${idx * rowHeight}px`, width: "2.8rem" }}>
                      {hour}h
                    </div>
                  ))}
                </div>
              </td>
              {DAY_ORDER.map((day) => (
                <td key={day} className="align-top p-0">
                  <div className="relative rounded-md border border-slate-700/60 bg-slate-800/30" style={{ height: `${boardHeight}px` }}>
                    {backgroundSupply
                      ? SLOT_HOURS.map((hour, idx) => {
                          const state = backgroundSupply.slotStates[`${day}-${hour}`];
                          if (!state) return null;
                          return (
                            <div
                              key={`bg-${day}-${hour}`}
                              className={`absolute left-0 right-0 ${SLOT_BG_TINT[state]}`}
                              style={{ top: `${idx * rowHeight}px`, height: `${rowHeight}px` }}
                            />
                          );
                        })
                      : null}
                    {SLOT_HOURS.map((hour, idx) => (
                      <div key={`${day}-${hour}`} className="absolute left-0 right-0 border-b border-slate-700/40" style={{ top: `${idx * rowHeight}px` }} />
                    ))}
                    {(layoutByDay.get(day) ?? []).map((entry) => {
                      const item = entry.item;
                      const hourIdx = hourIndexMap.get(item.startHour) ?? 0;
                      const top = hourIdx * rowHeight;
                      const height = Math.max(rowHeight, item.durationHours * rowHeight);
                      const color = aircraftCardColor(colorByAircraft.get(item.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!);
                      const instructorBorder = item.instructorId
                        ? borderByInstructor.get(item.instructorId) ?? "border-white/80"
                        : "border-red-300";
                      const widthPercent = 100 / Math.max(1, entry.columnCount);
                      const leftPercent = entry.columnIndex * widthPercent;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onItemClick(item)}
                          className={`absolute overflow-hidden rounded border-2 px-1.5 py-1 text-left text-[10px] text-white hover:ring-1 hover:ring-white/60 ${color} ${instructorBorder}`}
                          style={{
                            top: `${top}px`,
                            height: `${height - 4}px`,
                            left: `calc(${leftPercent}% + 4px)`,
                            width: `calc(${widthPercent}% - 8px)`,
                          }}
                        >
                          <p className="truncate font-semibold">{item.studentLabel}</p>
                          <p className="truncate opacity-90">{item.startTime}-{item.endTime}</p>
                          <p className="truncate opacity-80">{item.aircraftRegistration} · {item.instructorLabel ?? "Sem instrutor"}</p>
                          <p className="truncate opacity-80">Peso: {item.totalWeightLabel}</p>
                          {!item.instructorId ? <p className="truncate font-semibold text-amber-100">Sem instrutor</p> : null}
                        </button>
                      );
                    })}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ScheduleFlightsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [weekOptions, setWeekOptions] = useState<ScheduleWeekOption[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [weekData, setWeekData] = useState<ScheduleWeekData | null>(null);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingWeekData, setLoadingWeekData] = useState(false);
  const [flights, setFlights] = useState<ExistingScheduledFlight[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<string[]>([]);
  const [visibleInstructors, setVisibleInstructors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<FlightFormDraft | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formSaving, setFormSaving] = useState(false);
  const [formConflicts, setFormConflicts] = useState<DetectedFlightConflict[]>([]);
  const [forceSaveWithConflict, setForceSaveWithConflict] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const minGapMinutes = 30;

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const loadWeek = useCallback(
    async (weekStart: string) => {
      if (!user || !weekStart) return;
      setLoadingWeekData(true);
      setError(null);
      try {
        const data = await getScheduleWeekData({
          weekStart,
          actorUserId: user.id,
          actorRole: user.role,
        });
        setWeekData(data);
        const rows = [...data.existingGeneratedFlights].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.startTime.localeCompare(b.startTime);
        });
        setFlights(rows);
        setVisibleAircraft(data.supplies.map((s) => s.aircraftRegistration));
        setVisibleInstructors(["__none__", ...data.instructors.map((s) => s.userId)]);
      } catch (e) {
        setError((e as Error).message);
        setWeekData(null);
        setFlights([]);
      } finally {
        setLoadingWeekData(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    setLoadingWeeks(true);
    void getScheduleWeekOptions()
      .then((weeks) => {
        setWeekOptions(weeks);
        const todayIso = new Date().toISOString().slice(0, 10);
        const defaultWeek = weeks.find((row) => row.weekStart >= todayIso) ?? weeks[weeks.length - 1] ?? null;
        setSelectedWeekStart(defaultWeek?.weekStart ?? "");
        if (defaultWeek) void loadWeek(defaultWeek.weekStart);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingWeeks(false));
  }, [loadWeek, user]);

  const studentLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of weekData?.students ?? []) map.set(student.userId, student.label);
    return map;
  }, [weekData]);

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorIdentity>();
    for (const instructor of weekData?.instructors ?? []) map.set(instructor.userId, instructor);
    return map;
  }, [weekData]);

  const conflictsByFlightId = useMemo(() => {
    const out = new Map<string, DetectedFlightConflict[]>();
    if (!weekData) return out;
    for (const row of flights) {
      const draft = toConflictDraft(row, studentLabelMap.get(row.studentId) ?? row.studentId);
      const conflicts = detectFlightConflicts({ draft, supplies: weekData.supplies, flights, minGapMinutes });
      if (conflicts.length > 0) out.set(row.id, conflicts);
    }
    return out;
  }, [flights, minGapMinutes, studentLabelMap, weekData]);

  const colorByAircraft = useMemo(() => {
    const regs = [...new Set((weekData?.supplies ?? []).map((s) => s.aircraftRegistration))];
    const map = new Map<string, string>();
    regs.forEach((reg, index) => map.set(reg, AIRCRAFT_COLOR_CLASSES[index % AIRCRAFT_COLOR_CLASSES.length]!));
    return map;
  }, [weekData]);

  const borderByInstructor = useMemo(() => {
    const map = new Map<string, string>();
    (weekData?.instructors ?? []).forEach((instructor, index) =>
      map.set(instructor.userId, INSTRUCTOR_BORDER_CLASSES[index % INSTRUCTOR_BORDER_CLASSES.length]!),
    );
    return map;
  }, [weekData]);

  const totalWeightByFlightId = useMemo(() => {
    const map = new Map<string, string>();
    if (!weekData) return map;
    for (const row of flights) {
      const student = weekData.students.find((s) => s.userId === row.studentId);
      const instructor = row.instructorId ? instructorById.get(row.instructorId) : null;
      const total = (student?.weightKg ?? 0) + (instructor?.weightKg ?? 0);
      map.set(row.id, total > 0 ? `${total}kg` : "—");
    }
    return map;
  }, [flights, instructorById, weekData]);

  const calendarItems = useMemo<CalendarFlightItem[]>(
    () =>
      flights
        .filter(
          (row) =>
            visibleAircraft.includes(row.aircraftRegistration ?? "") &&
            (row.instructorId ? visibleInstructors.includes(row.instructorId) : visibleInstructors.includes("__none__")),
        )
        .map((row) => {
          const dayOfWeek = new Date(`${row.date}T12:00:00`).getDay();
          const startHour = parseStartHour(row.startTime);
          return {
            id: row.id,
            studentLabel: studentLabelMap.get(row.studentId) ?? row.studentId,
            instructorId: row.instructorId,
            instructorLabel:
              row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null),
            totalWeightLabel: totalWeightByFlightId.get(row.id) ?? "—",
            aircraftRegistration: row.aircraftRegistration ?? "Aeronave",
            dayOfWeek,
            startHour,
            durationHours: row.durationHours,
            startTime: row.startTime,
            endTime: hoursToHHMM(startHour + row.durationHours),
          };
        }),
    [flights, instructorById, studentLabelMap, totalWeightByFlightId, visibleAircraft, visibleInstructors],
  );

  const selectedSupplyForBackground = useMemo(() => {
    if (!weekData || visibleAircraft.length !== 1) return null;
    const reg = visibleAircraft[0];
    return weekData.supplies.find((supply) => supply.aircraftRegistration === reg) ?? null;
  }, [visibleAircraft, weekData]);

  const aircraftSummary = useMemo(() => {
    if (!weekData) return [];
    return weekData.supplies.map((supply) => {
      const rows = flights.filter((row) => row.aircraftRegistration === supply.aircraftRegistration);
      const hours = rows.reduce((acc, row) => acc + row.durationHours, 0);
      const students = new Set(rows.map((row) => row.studentId)).size;
      return {
        registration: supply.aircraftRegistration,
        imageUrl: supply.aircraftImageUrl ?? null,
        flights: rows.length,
        hours: Number(hours.toFixed(1)),
        students,
      };
    });
  }, [flights, weekData]);

  const totalSummary = useMemo(() => {
    const hours = flights.reduce((acc, row) => acc + row.durationHours, 0);
    return {
      flights: flights.length,
      hours: Number(hours.toFixed(1)),
      students: new Set(flights.map((row) => row.studentId)).size,
    };
  }, [flights]);

  const instructorSummary = useMemo(() => {
    if (!weekData) return [];
    return weekData.instructors.map((instructor) => {
      const rows = flights.filter((row) => row.instructorId === instructor.userId);
      const hours = rows.reduce((acc, row) => acc + row.durationHours, 0);
      return { instructor, flights: rows.length, hours: Number(hours.toFixed(1)) };
    });
  }, [flights, weekData]);

  const unassignedInstructorCount = useMemo(() => flights.filter((row) => !row.instructorId).length, [flights]);

  const servedStudents = useMemo(() => {
    if (!weekData) return [];
    const map = new Map<string, { id: string; label: string; flights: number; hours: number }>();
    for (const student of weekData.students) {
      map.set(student.userId, { id: student.userId, label: student.label, flights: 0, hours: 0 });
    }
    for (const flight of flights) {
      const current = map.get(flight.studentId) ?? {
        id: flight.studentId,
        label: studentLabelMap.get(flight.studentId) ?? flight.studentId,
        flights: 0,
        hours: 0,
      };
      current.flights += 1;
      current.hours += flight.durationHours;
      map.set(flight.studentId, current);
    }
    return [...map.values()].filter((row) => row.flights > 0).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [flights, studentLabelMap, weekData]);

  const notServedStudents = useMemo(() => {
    if (!weekData) return [];
    const served = new Set(servedStudents.map((row) => row.id));
    return weekData.students.filter((row) => !served.has(row.userId)).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [servedStudents, weekData]);

  const selectedStudentSchedule = useMemo(() => {
    if (!selectedStudentId) return null;
    const student = weekData?.students.find((row) => row.userId === selectedStudentId) ?? null;
    const studentFlights = flights
      .filter((row) => row.studentId === selectedStudentId)
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));
    if (!student && studentFlights.length === 0) return null;
    return {
      student: {
        userId: selectedStudentId,
        label: student?.label ?? studentLabelMap.get(selectedStudentId) ?? selectedStudentId,
        email: student?.email ?? null,
        anacCode: student?.anacCode ?? null,
        weightKg: student?.weightKg ?? null,
        heightCm: student?.heightCm ?? null,
      },
      flights: studentFlights,
    };
  }, [flights, selectedStudentId, studentLabelMap, weekData]);

  function openCreateModal() {
    if (!weekData) return;
    const firstSupply = weekData.supplies[0];
    if (!firstSupply) {
      setError("Cadastre disponibilidade operacional da semana para criar voos.");
      return;
    }
    const firstStudent = weekData.students[0];
    const firstInstructor = weekData.instructors[0] ?? null;
    setFormMode("create");
    setFormDraft({
      demandId: `manual-${crypto.randomUUID()}`,
      studentId: firstStudent?.userId ?? "",
      studentLabel: firstStudent?.label ?? "",
      ...resolveInstructorDraft(weekData.instructors, firstInstructor?.userId ?? null),
      aircraftRegistration: firstSupply.aircraftRegistration,
      dayOfWeek: 1,
      startHour: SLOT_HOURS[0] ?? 6,
      durationHours: 1,
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function openEditModal(row: ExistingScheduledFlight) {
    const full = await getSavedFlight(row.id);
    const decoded = full.data ? decodeFlightRecord(full.data.csv_text).meta : null;
    setFormMode("edit");
    setFormDraft({
      id: row.id,
      demandId: row.demandId,
      sourceFilename: row.sourceFilename,
      studentId: row.studentId,
      studentLabel: decoded?.header.studentLabel || studentLabelMap.get(row.studentId) || row.studentId,
      instructorId: row.instructorId,
      instructorLabel:
        decoded?.header.instructorName ||
        row.instructorLabel ||
        (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : null),
      instructorAnac:
        decoded?.header.instructorAnac ||
        row.instructorAnac ||
        (row.instructorId ? instructorById.get(row.instructorId)?.anacCode ?? null : null),
      aircraftRegistration: row.aircraftRegistration ?? "",
      dayOfWeek: new Date(`${row.date}T12:00:00`).getDay(),
      startHour: parseStartHour(row.startTime),
      durationHours: row.durationHours,
    });
    setFormConflicts([]);
    setForceSaveWithConflict(false);
  }

  async function handleSaveForm() {
    if (!user || !weekData || !formDraft) return;
    setError(null);
    const conflicts = detectFlightConflicts({
      draft: { ...formDraft, studentLabel: formDraft.studentLabel || formDraft.studentId },
      supplies: weekData.supplies,
      flights,
      minGapMinutes,
    });
    if (conflicts.length > 0 && !forceSaveWithConflict) {
      setFormConflicts(conflicts);
      return;
    }

    setFormSaving(true);
    try {
      const sourcePrefix =
        formDraft.sourceFilename?.startsWith(MANUAL_SOURCE_PREFIX) || formDraft.demandId.startsWith("manual-")
          ? MANUAL_SOURCE_PREFIX
          : AUTO_SOURCE_PREFIX;
      const sourceFilename = `${sourcePrefix}${weekData.week.weekStart}.csv`;
      const normalizedLabel = formDraft.studentLabel.trim() || formDraft.studentId;
      const instructor = formDraft.instructorId ? instructorById.get(formDraft.instructorId) ?? null : null;
      const meta = buildAutoMeta({ ...formDraft, studentLabel: normalizedLabel }, weekData.week.weekStart, instructor);
      const csvText = encodeFlightRecord({ meta, telemetryCsv: "" });
      const payload = {
        actorUserId: user.id,
        actorRole: user.role,
        studentUserId: formDraft.studentId,
        instructorUserId: formDraft.instructorId,
        name: "Voo agendado",
        source_filename: sourceFilename,
        csv_text: csvText,
        aircraft_ident: formDraft.aircraftRegistration,
        duration_sec: Math.round(formDraft.durationHours * 3600),
      } as const;

      if (formMode === "edit" && formDraft.id) {
        const result = await updateFlight(formDraft.id, payload);
        if (result.error) throw result.error;
        showToast({ variant: "success", message: "Voo atualizado com sucesso." });
      } else {
        const result = await insertFlight(payload);
        if (result.error) throw result.error;
        showToast({ variant: "success", message: "Voo criado com sucesso." });
      }
      setFormDraft(null);
      setFormConflicts([]);
      setForceSaveWithConflict(false);
      await loadWeek(weekData.week.weekStart);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteFlight(row: ExistingScheduledFlight) {
    if (!window.confirm(`Excluir o voo "${row.name}"?`)) return;
    setError(null);
    try {
      const result = await deleteSavedFlight(row.id);
      if (result.error) throw result.error;
      showToast({ variant: "success", message: "Voo excluído com sucesso." });
      if (selectedWeekStart) await loadWeek(selectedWeekStart);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Escala</h2>
        <p className="text-xs text-slate-500">Mesma dinâmica da Escala Automática, focada apenas em voos já marcados.</p>
      </div>

      <section className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Semana</p>
          <select
            value={selectedWeekStart}
            disabled={loadingWeeks}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedWeekStart(value);
              void loadWeek(value);
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
          >
            {weekOptions.map((week) => (
              <option key={week.weekStart} value={week.weekStart}>
                {week.label}
                {week.isClosed ? " (Fechada)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end md:col-span-2">
          <button
            type="button"
            onClick={() => openCreateModal()}
            disabled={!weekData}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            Novo voo
          </button>
        </div>
      </section>

      {loadingWeekData ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
            <div className="grid grid-cols-8 gap-px bg-slate-800/40 p-2">
              {Array.from({ length: 8 }).map((_, d) => (
                <div key={d} className="space-y-1">
                  <Skeleton className="h-3 w-8 mx-auto" />
                  {Array.from({ length: 6 }).map((_, h) => (
                    <Skeleton key={h} className="h-9 w-full rounded" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {weekData ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {aircraftSummary.map((row) => (
            <article key={row.registration} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
              <div className="mb-2 h-20 w-full overflow-hidden rounded-md bg-slate-800">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.registration} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">Sem foto</div>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-100">{row.registration}</p>
              <p className="mt-1 text-xs text-slate-400">{row.hours.toFixed(1)}h na semana</p>
              <p className="text-xs text-slate-500">{row.flights} voos</p>
              <p className="text-xs text-slate-500">{row.students} alunos</p>
            </article>
          ))}
          <article className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <div className="mb-2 h-20 w-full rounded-md bg-violet-500/20" />
            <p className="text-sm font-semibold text-violet-100">Total</p>
            <p className="mt-1 text-xs text-violet-200">{totalSummary.hours.toFixed(1)}h na semana</p>
            <p className="text-xs text-violet-200">{totalSummary.flights} voos</p>
            <p className="text-xs text-violet-200">{totalSummary.students} alunos</p>
          </article>
        </section>
      ) : null}

      {weekData ? (
        <>
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Resumo por instrutor</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {instructorSummary.map((row) => (
                <article key={row.instructor.userId} className={`rounded-xl border bg-slate-800/30 p-3 ${borderByInstructor.get(row.instructor.userId) ?? "border-slate-700"}`}>
                  <p className="truncate text-sm font-semibold text-slate-100">{row.instructor.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{row.hours.toFixed(1)}h previstas</p>
                  <p className="text-xs text-slate-500">{row.flights} voos</p>
                </article>
              ))}
              <article className="rounded-xl border border-red-300 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-100">Sem instrutor</p>
                <p className="mt-1 text-xs text-amber-200">{unassignedInstructorCount} voos</p>
              </article>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Filtros</p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Aeronaves</p>
                <div className="flex flex-wrap gap-2">
                  {weekData.supplies.map((supply) => {
                    const checked = visibleAircraft.includes(supply.aircraftRegistration);
                    const color = colorByAircraft.get(supply.aircraftRegistration) ?? AIRCRAFT_COLOR_CLASSES[0]!;
                    return (
                      <label key={supply.aircraftId} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setVisibleAircraft((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, supply.aircraftRegistration])]
                                : prev.filter((reg) => reg !== supply.aircraftRegistration),
                            );
                          }}
                        />
                        <span className={`h-3 w-3 rounded border ${color}`} />
                        {supply.aircraftRegistration}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Instrutores</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={visibleInstructors.includes("__none__")}
                      onChange={(e) =>
                        setVisibleInstructors((prev) =>
                          e.target.checked ? [...new Set([...prev, "__none__"])] : prev.filter((id) => id !== "__none__"),
                        )
                      }
                    />
                    <span className="h-3 w-3 rounded border-2 border-red-300 bg-slate-800" />
                    Sem instrutor
                  </label>
                  {weekData.instructors.map((instructor) => {
                    const checked = visibleInstructors.includes(instructor.userId);
                    const border = borderByInstructor.get(instructor.userId) ?? "border-white/80";
                    return (
                      <label key={instructor.userId} className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setVisibleInstructors((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, instructor.userId])]
                                : prev.filter((id) => id !== instructor.userId),
                            )
                          }
                        />
                        <span className={`h-3 w-3 rounded border-2 ${border} bg-slate-800`} />
                        {instructor.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {unassignedInstructorCount > 0 ? (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {unassignedInstructorCount} voo(s) nesta escala estão sem instrutor.
            </section>
          ) : null}

          <CalendarGrid
            items={calendarItems}
            colorByAircraft={colorByAircraft}
            borderByInstructor={borderByInstructor}
            backgroundSupply={selectedSupplyForBackground}
            onItemClick={(item) => {
              const selected = flights.find((row) => row.id === item.id);
              if (selected) void openEditModal(selected);
            }}
          />

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preview + edição manual</p>
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="rounded-lg border border-violet-500/60 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-600/20"
              >
                Adicionar voo
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="border-b border-slate-700 px-2 py-2">Aluno</th>
                    <th className="border-b border-slate-700 px-2 py-2">Instrutor</th>
                    <th className="border-b border-slate-700 px-2 py-2">Peso total</th>
                    <th className="border-b border-slate-700 px-2 py-2">Aeronave</th>
                    <th className="border-b border-slate-700 px-2 py-2">Dia</th>
                    <th className="border-b border-slate-700 px-2 py-2">Hora</th>
                    <th className="border-b border-slate-700 px-2 py-2">Duração</th>
                    <th className="border-b border-slate-700 px-2 py-2">Status</th>
                    <th className="border-b border-slate-700 px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map((row) => {
                    const conflicts = conflictsByFlightId.get(row.id) ?? [];
                    return (
                      <tr key={row.id} className="border-b border-slate-800/60">
                        <td className="px-2 py-2 text-slate-200">{studentLabelMap.get(row.studentId) ?? row.studentId}</td>
                        <td className="px-2 py-2 text-slate-300">
                          {row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : "—")}
                        </td>
                        <td className="px-2 py-2 text-slate-300">{totalWeightByFlightId.get(row.id) ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-300">{row.aircraftRegistration ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-300">{DAY_LABEL[new Date(`${row.date}T12:00:00`).getDay()]}</td>
                        <td className="px-2 py-2 text-slate-300">{row.startTime}</td>
                        <td className="px-2 py-2 text-slate-300">{row.durationHours.toFixed(1)}h</td>
                        <td className="px-2 py-2 text-xs">
                          {conflicts.length === 0 ? (
                            row.instructorId ? <span className="text-emerald-300">OK</span> : <span className="text-amber-300">Sem instrutor</span>
                          ) : (
                            <span className="text-amber-300">{conflictTypeLabel(conflicts[0]!.type)}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openEditModal(row)}
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFlight(row)}
                              className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos atendidos</p>
              <div className="space-y-2">
                {servedStudents.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedStudentId(row.id)}
                    className="w-full rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-left text-sm hover:bg-slate-800/60"
                  >
                    <p className="font-medium text-slate-200">{row.label}</p>
                    <p className="text-xs text-slate-500">{row.flights} voos · {row.hours.toFixed(1)}h</p>
                    <p className="text-xs text-emerald-300">Atendido</p>
                  </button>
                ))}
                {servedStudents.length === 0 ? <p className="text-sm text-slate-400">Nenhum aluno atendido.</p> : null}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos não atendidos</p>
              {notServedStudents.length === 0 ? (
                <p className="text-sm text-emerald-300">Todos os alunos estão atendidos.</p>
              ) : (
                <div className="space-y-2">
                  {notServedStudents.map((row) => (
                    <button
                      key={row.userId}
                      type="button"
                      onClick={() => setSelectedStudentId(row.userId)}
                      className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left text-sm hover:bg-red-500/10"
                    >
                      <p className="font-medium text-slate-200">{row.label}</p>
                      <p className="text-xs text-red-300">Sem voo marcado nesta semana</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {selectedStudentSchedule ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{selectedStudentSchedule.student.label}</p>
                <p className="text-xs text-slate-500">
                  {selectedStudentSchedule.student.email || "Sem email"} · ANAC {selectedStudentSchedule.student.anacCode || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[78vh] space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.flights.length}</p>
                  <p className="text-[11px] text-slate-500">Voos</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">
                    {selectedStudentSchedule.flights.reduce((acc, row) => acc + row.durationHours, 0).toFixed(1)}h
                  </p>
                  <p className="text-[11px] text-slate-500">Horas</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.student.weightKg ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Peso kg</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-2 py-2">
                  <p className="text-lg font-semibold text-slate-100">{selectedStudentSchedule.student.heightCm ?? "—"}</p>
                  <p className="text-[11px] text-slate-500">Altura cm</p>
                </div>
              </div>

              {selectedStudentSchedule.flights.length === 0 ? (
                <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-200">
                  Este aluno ainda não tem voo marcado nesta semana.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] border-collapse text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-wider text-slate-500">
                        <th className="border-b border-slate-700 px-2 py-1.5">Dia</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Hora</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Duração</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Aeronave</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Instrutor</th>
                        <th className="border-b border-slate-700 px-2 py-1.5">Peso total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudentSchedule.flights.map((row) => (
                        <tr key={row.id} className="border-b border-slate-800/60">
                          <td className="px-2 py-1.5 text-slate-200">{DAY_LABEL[new Date(`${row.date}T12:00:00`).getDay()]}</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.startTime}</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.durationHours.toFixed(1)}h</td>
                          <td className="px-2 py-1.5 text-slate-300">{row.aircraftRegistration ?? "—"}</td>
                          <td className="px-2 py-1.5 text-slate-300">
                            {row.instructorLabel ?? (row.instructorId ? instructorById.get(row.instructorId)?.label ?? row.instructorId : "—")}
                          </td>
                          <td className="px-2 py-1.5 text-slate-300">{totalWeightByFlightId.get(row.id) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {formDraft && weekData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">{formMode === "create" ? "Novo voo" : "Editar voo"}</p>
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              <StudentSearchSelect
                label="Aluno"
                students={weekData.students}
                value={formDraft.studentId}
                onChange={(student) =>
                  setFormDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          studentId: student.userId,
                          studentLabel: student.label,
                        }
                      : prev,
                  )
                }
                className="md:col-span-2"
              />
              <label className="text-xs text-slate-400">
                Instrutor
                <select
                  value={formDraft.instructorId ?? ""}
                  onChange={(e) =>
                    setFormDraft((prev) =>
                      prev ? { ...prev, ...resolveInstructorDraft(weekData.instructors, e.target.value || null) } : prev,
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  <option value="">Sem instrutor</option>
                  {weekData.instructors.map((instructor) => (
                    <option key={instructor.userId} value={instructor.userId}>
                      {instructor.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Aeronave
                <select
                  value={formDraft.aircraftRegistration}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, aircraftRegistration: e.target.value } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {weekData.supplies.map((supply) => (
                    <option key={supply.aircraftId} value={supply.aircraftRegistration}>
                      {supply.aircraftRegistration}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Dia
                <select
                  value={formDraft.dayOfWeek}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, dayOfWeek: Number(e.target.value) } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {DAY_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {DAY_LABEL[day]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Hora
                <select
                  value={formDraft.startHour}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, startHour: Number(e.target.value) } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                >
                  {SLOT_HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}h
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Duração (h)
                <input
                  type="number"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={formDraft.durationHours}
                  onChange={(e) => setFormDraft((prev) => (prev ? { ...prev, durationHours: Number(e.target.value) } : prev))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>
            </div>

            {formConflicts.length > 0 ? (
              <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <p className="font-semibold">Conflitos detectados:</p>
                <ul className="mt-1 space-y-1">
                  {formConflicts.map((conflict, index) => (
                    <li key={`${conflict.type}-${index}`}>
                      {conflictTypeLabel(conflict.type)}: {conflict.message}
                    </li>
                  ))}
                </ul>
                {!forceSaveWithConflict ? (
                  <button
                    type="button"
                    onClick={() => setForceSaveWithConflict(true)}
                    className="mt-2 rounded border border-amber-300/40 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-500/20"
                  >
                    Entendi os conflitos, quero salvar mesmo assim
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-amber-100">Conflitos aceitos. O salvamento será permitido.</p>
                )}
              </div>
            ) : null}

            <div className="flex flex-col justify-end gap-2 border-t border-slate-700 px-4 py-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="w-full rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveForm()}
                disabled={formSaving}
                className="w-full rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 sm:w-auto"
              >
                {formSaving ? "Salvando..." : "Salvar voo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
