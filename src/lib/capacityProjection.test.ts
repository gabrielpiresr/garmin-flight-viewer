import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCapacityProjection,
  classifyCalendar,
  classifyHalf,
  classifyIntensity,
  classifyStudents,
  formatHours,
  hoursPerMonthFromWindow,
  isCoveredByLargerInspection,
  isWeekendIso,
  resolveCourseFlownHours,
  projectAircraftSupply,
  studentTrace,
} from "./capacityProjection.ts";
import {
  DEFAULT_CAPACITY_PROJECTION_SETTINGS,
  lookupMonthlyHours,
  type CapacityAircraftInput,
  type CapacityStudentInput,
} from "../types/capacityProjection.ts";

const settings = DEFAULT_CAPACITY_PROJECTION_SETTINGS;

test("classifica calendário por share de FDS", () => {
  assert.equal(classifyCalendar(0.8, settings), "weekend");
  assert.equal(classifyCalendar(0.2, settings), "weekday");
  assert.equal(classifyCalendar(0.5, settings), "mixed");
});

test("classifica intensidade e metade do curso", () => {
  assert.equal(classifyIntensity(3, settings), "low");
  assert.equal(classifyIntensity(7, settings), "medium");
  assert.equal(classifyIntensity(12, settings), "high");
  assert.equal(classifyHalf(10, 42), "first");
  assert.equal(classifyHalf(21, 42), "second");
});

test("horas/mês da janela de 90 dias", () => {
  assert.equal(Number(hoursPerMonthFromWindow(18, 90).toFixed(1)), 6);
});

test("sábado e domingo são FDS", () => {
  assert.equal(isWeekendIso("2026-08-22"), true);
  assert.equal(isWeekendIso("2026-08-23"), true);
  assert.equal(isWeekendIso("2026-08-20"), false);
});

function student(partial: Partial<CapacityStudentInput> & Pick<CapacityStudentInput, "userId" | "name">): CapacityStudentInput {
  return {
    email: `${partial.userId}@x.test`,
    isActive: true,
    daysSinceLastFlight: 3,
    lastFlightAt: "2026-08-17",
    flownHours: 10,
    windowWeekdayHours: 2,
    windowWeekendHours: 10,
    windowHours: 12,
    trackName: "Piloto Privado",
    trackStatus: "active",
    courseCode: "PP",
    crmStatusName: "Ativo",
    ...partial,
  };
}

test("abandono e CRM tiram o aluno da projeção", () => {
  const rows = classifyStudents(
    [
      student({ userId: "a", name: "Ana", daysSinceLastFlight: 40 }),
      student({ userId: "b", name: "Bia", crmStatusName: "Desistente", daysSinceLastFlight: 2 }),
      student({ userId: "c", name: "Caio", windowWeekdayHours: 1, windowWeekendHours: 11, windowHours: 12 }),
    ],
    settings,
    [],
    "2026-08-20",
  );
  assert.equal(rows[0].included, false);
  assert.equal(rows[0].exclusionReason, "abandoned");
  assert.match(rows[0].exclusionLabel || "", /40 dias sem voar/);
  assert.equal(rows[1].included, false);
  assert.equal(rows[1].exclusionReason, "crm");
  assert.equal(rows[2].included, true);
  assert.equal(rows[2].calendar, "weekend");
  const trace = studentTrace(rows[0], settings);
  assert.match(trace.summary, /Fora|dias sem voar/i);
});

test("oferta do avião separa semana e FDS e conta parada de manutenção", () => {
  const aircraft: CapacityAircraftInput = {
    id: "ac1",
    registration: "PT-ABC",
    type: "aviao",
    active: true,
    currentHours: 95,
    maintenanceItems: [{ code: "100H", title: "Inspeção 100h", intervalHours: 100, downtimeDays: 2 }],
    groundedNow: false,
    groundedReason: null,
    groundedDaysFromToday: 0,
  };
  const projection = projectAircraftSupply(aircraft, { ...settings, weekdayAvgHoursPerDay: 5, weekendAvgHoursPerDay: 5 }, "2026-08-20", 20);
  assert.ok(projection.days.some((day) => day.grounded && day.maintenanceCode === "100H"));
  const firstMonth = projection.months[0];
  assert.ok(firstMonth);
  assert.ok(firstMonth.weekdayHours + firstMonth.weekendHours < 5 * firstMonth.weekdayDays + 5 * firstMonth.weekendDays);
  assert.ok(firstMonth.groundedWeekdayDays + firstMonth.groundedWeekendDays >= 2);
});

test("veredito NÃO quando FDS fica negativo e memória mostra a conta", () => {
  const result = buildCapacityProjection({
    today: "2026-08-20",
    settings: {
      ...settings,
      decisionHorizonMonths: 3,
      horizonMonths: 6,
      slackPercent: 10,
      conversionPpToPc: 0,
      conversionPcToInva: 0,
      weekdayAvgHoursPerDay: 1,
      weekendAvgHoursPerDay: 1,
    },
    aircraft: [
      {
        id: "ac1",
        registration: "PT-ABC",
        type: "aviao",
        active: true,
        currentHours: 10,
        maintenanceItems: [],
        groundedNow: false,
        groundedReason: null,
        groundedDaysFromToday: 0,
      },
    ],
    students: [
      student({
        userId: "fds",
        name: "FDS Alto",
        flownHours: 5,
        windowWeekdayHours: 0,
        windowWeekendHours: 20,
        windowHours: 20,
      }),
      student({
        userId: "fds2",
        name: "FDS Alto 2",
        flownHours: 5,
        windowWeekdayHours: 0,
        windowWeekendHours: 20,
        windowHours: 20,
      }),
      student({
        userId: "fds3",
        name: "FDS Alto 3",
        flownHours: 5,
        windowWeekdayHours: 0,
        windowWeekendHours: 20,
        windowHours: 20,
      }),
    ],
  });
  assert.equal(result.verdict.kind, "no");
  assert.match(result.verdict.trace.summary, /Não/i);
  const account = result.verdict.trace.lines.find((line) => line.label === "Conta do não");
  assert.ok(account, "veredito deve trazer a conta do não");
  assert.match(account.value, /FDS|h/);
  const august = result.months[0];
  assert.ok(august.demand.weekend > august.supply.weekend);
});

test("conversão PP→PC gera demanda virtual no mês seguinte", () => {
  const result = buildCapacityProjection({
    today: "2026-08-01",
    settings: {
      ...settings,
      horizonMonths: 4,
      decisionHorizonMonths: 4,
      conversionPpToPc: 1,
      conversionPcToInva: 0,
      hoursLookup: {
        ...settings.hoursLookup,
        weekday: {
          low: { first: 20, second: 20 },
          medium: { first: 20, second: 20 },
          high: { first: 20, second: 20 },
        },
      },
    },
    aircraft: [
      {
        id: "ac1",
        registration: "PT-ABC",
        type: "aviao",
        active: true,
        currentHours: 10,
        maintenanceItems: [],
        groundedNow: false,
        groundedReason: null,
        groundedDaysFromToday: 0,
      },
    ],
    students: [
      student({
        userId: "pp",
        name: "Quase PP",
        flownHours: 40,
        windowWeekdayHours: 20,
        windowWeekendHours: 0,
        windowHours: 20,
        courseCode: "PP",
      }),
    ],
  });
  const conversions = result.months.flatMap((month) => month.conversions);
  assert.ok(conversions.some((line) => /Piloto Comercial/.test(line)));
  const later = result.months.slice(1).some((month) => month.demandLines.weekday.some((line) => line.virtual));
  assert.equal(later, true);
});

test("quantos cabem usa o saldo mais apertado do FDS", () => {
  const result = buildCapacityProjection({
    today: "2026-08-20",
    settings: {
      ...settings,
      decisionHorizonMonths: 3,
      conversionPpToPc: 0,
      weekdayAvgHoursPerDay: 8,
      weekendAvgHoursPerDay: 8,
      intakeTemplate: { course: "PP", calendar: "weekend", intensity: "medium" },
    },
    aircraft: [
      {
        id: "ac1",
        registration: "PT-ABC",
        type: "aviao",
        active: true,
        currentHours: 10,
        maintenanceItems: [],
        groundedNow: false,
        groundedReason: null,
        groundedDaysFromToday: 0,
      },
    ],
    students: [],
  });
  assert.ok(result.verdict.weekendFit >= 1);
  const weekendRate = lookupMonthlyHours(settings.hoursLookup, "weekend", "medium", "first");
  assert.equal(formatHours(weekendRate), "6h");
});

test("50H no marco da 100H não gera parada extra", () => {
  assert.equal(isCoveredByLargerInspection(1300, 50, [{ intervalHours: 100 }]), true);
  assert.equal(isCoveredByLargerInspection(1250, 50, [{ intervalHours: 100 }]), false);
  const aircraft: CapacityAircraftInput = {
    id: "dza",
    registration: "PS-DZA",
    type: "aviao",
    active: true,
    currentHours: 1245,
    maintenanceItems: [
      { code: "50H", title: "Inspeção 50h", intervalHours: 50, downtimeDays: 1 },
      { code: "100H", title: "Inspeção 100h", intervalHours: 100, downtimeDays: 2 },
    ],
    groundedNow: false,
    groundedReason: null,
    groundedDaysFromToday: 0,
  };
  const projection = projectAircraftSupply(
    aircraft,
    { ...settings, weekdayAvgHoursPerDay: 6, weekendAvgHoursPerDay: 6, horizonMonths: 3 },
    "2026-09-01",
    40,
  );
  const flyingHours = projection.days.reduce((sum, day) => sum + day.hours, 0);
  const until150 = projection.events.filter((event) => event.hitHours <= 1245 + 150);
  const fifty = until150.filter((event) => event.code === "50H");
  const hundred = until150.filter((event) => event.code === "100H");
  assert.ok(flyingHours >= 140);
  assert.ok(fifty.length <= 2, `esperava no máx 2×50H, veio ${fifty.length}`);
  assert.ok(hundred.length <= 1, `esperava no máx 1×100H, veio ${hundred.length}`);
  assert.equal(fifty.some((event) => event.hitHours % 100 === 0), false);
});

test("sem curso fica fora; Hobbie entra; ajuste muda o restante", () => {
  const rows = classifyStudents(
    [
      student({ userId: "none", name: "Sem curso", courseCode: null, trackName: "Avulso" }),
      student({ userId: "hobby", name: "Hobby", courseCode: null, trackName: "Avulso" }),
      student({ userId: "pp", name: "PP 20h", courseCode: "PP", flownHours: 22 }),
    ],
    settings,
    [
      {
        id: "h1",
        studentUserId: "hobby",
        calendarMode: null,
        intensity: null,
        courseCode: "HOBBY",
        hoursAdjustment: 0,
        excluded: false,
        pausedUntil: null,
        notes: "",
      },
      {
        id: "p1",
        studentUserId: "pp",
        calendarMode: null,
        intensity: null,
        courseCode: "PP",
        hoursAdjustment: -10,
        excluded: false,
        pausedUntil: null,
        notes: "",
      },
    ],
    "2026-08-20",
  );
  assert.equal(rows[0].included, false);
  assert.equal(rows[0].exclusionReason, "no-course");
  assert.equal(rows[1].included, true);
  assert.equal(rows[1].course, "HOBBY");
  assert.equal(rows[1].remainingHours, null);
  assert.equal(rows[2].rawRemainingHours, 20);
  assert.equal(rows[2].remainingHours, 10);
});

test("restante do PC usa só as horas do PC, não a carreira", () => {
  const rows = classifyStudents(
    [
      student({
        userId: "gabriel",
        name: "Gabriel",
        courseCode: "PC",
        trackName: "Piloto Comercial",
        flownHours: 86,
        courseFlownHours: 14,
      }),
    ],
    settings,
    [],
    "2026-08-20",
  );
  assert.equal(rows[0].flownForCourse, 14);
  assert.equal(rows[0].rawRemainingHours, 96);
  assert.equal(resolveCourseFlownHours({
    careerHours: 86,
    currentCourse: "PC",
    currentTrackId: "pc-track",
    flights: [
      { hours: 42, trackId: "pp-track", trackName: "Piloto Privado" },
      { hours: 14, trackId: "pc-track", trackName: "Piloto Comercial" },
      { hours: 30, trackId: "pp-track", trackName: "Piloto Privado" },
    ],
  }), 14);
});
