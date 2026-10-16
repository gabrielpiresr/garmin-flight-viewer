const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, extra = "", overrides = {}) {
  const filename = path.resolve(__dirname, "..", file);
  const source = fs.readFileSync(filename, "utf8").replaceAll("import.meta.env", "__testEnv") + extra;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console, Date, Map, Set, __testEnv: { VITE_APPWRITE_DATABASE_ID: "db" },
    require(id) {
      if (overrides[id]) return overrides[id];
      if (id === "appwrite" || id === "react/jsx-runtime") return require(id);
      if (/\/(manualNextMaintenance|maintenanceProjectionDue|maintenanceRiskProjection)(\.ts)?$/.test(id)) {
        return load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), id.replace(/\.ts$/, "") + ".ts")));
      }
      return { flightAircraftHours: () => 0 };
    },
  }, { filename });
  return exports;
}

const { resolveManualNextMaintenance } = load("src/lib/manualNextMaintenance.ts");
const { maintenanceProjectionCandidates } = load("src/lib/maintenanceProjectionDue.ts");
const { projectMaintenanceRisk } = load("src/lib/maintenanceRiskProjection.ts");
const { buildMaintenanceAsOfFlight } = load("src/lib/maintenanceAtDate.ts");
const { buildNextMaintenance } = load("src/components/admin/AdminHome.tsx", "\nexport { buildNextMaintenance };");
const { buildUpcomingMaintenance } = load("src/components/admin/FleetTab.tsx", "\nexport { buildUpcomingMaintenance };");
const { maintenanceDueList } = load("src/lib/aircraftHoursProjection.ts", "\nexport { maintenanceDueList };");
const items = [
  { id: "50h", aircraft_model_id: "model", code: "50H", title: "Inspeção 50h", recurrence_rules: '[{"type":"hours","value":50}]', estimated_downtime_days: 1 },
  { id: "100h", aircraft_model_id: "model", code: "100H", title: "Inspeção 100h", recurrence_rules: '[{"type":"hours","value":100}]', estimated_downtime_days: 2 },
];
const order = (overrides = {}) => ({
  id: "order", aircraft_id: "aircraft", maintenance_program_item_id: "50h", work_order_type: "inspection",
  status: "released", aircraft_ttaf: 1000, opened_at: "2026-10-01T12:00:00Z", completed_at: "2026-10-01T12:00:00Z",
  manual_next_program_item_id: "100h", manual_next_due_hours: 1075,
  ...overrides,
});
const aircraft = { id: "aircraft", model_id: "model", registration: "PS-TEST", logbook_ttaf: 1020, logbook_opening_date: "2026-10-01" };
const params = (orders) => ({ aircraft, aircraftOrders: orders, modelItems: items, currentHours: 1020, scheduledFlights: [] });

const serverModule = { exports: {} };
const serverSource = fs.readFileSync(path.resolve(__dirname, "../functions/schedule-booking/src/main.js"), "utf8");
vm.runInNewContext(serverSource + "\nmodule.exports.testHelpers = { parseProgramTheoryItems, theoryItemsWithManualNextMaintenance, projectMaintenanceRiskServer };", {
  module: serverModule, require, console, Date, Map, Set, Buffer,
  process: { env: { APPWRITE_FUNCTION_API_ENDPOINT: "https://example.test/v1" } },
});
const server = serverModule.exports.testHelpers;

const psDzaItems = [50, 100, 200, 600].map((hours) => ({
  id: `${hours}h`, aircraft_model_id: "model", code: `${hours}H`, title: `${hours} horas`,
  recurrence_rules: JSON.stringify([{ type: "hours", value: hours }]),
}));
const psDzaAircraft = { ...aircraft, registration: "PS-DZA", logbook_ttaf: 1200, logbook_opening_date: "2026-10-15" };
const psDzaPlan = order({
  id: "plan", aircraft_ttaf: 1150, opened_at: "2026-10-02T12:00:00Z", completed_at: "2026-10-02T12:00:00Z",
  manual_next_program_item_id: "200h", manual_next_due_hours: 1200,
});
const psDzaExecution = order({
  id: "execution", maintenance_program_item_id: "200h", aircraft_ttaf: 1200,
  opened_at: "2026-10-15T12:00:00Z", completed_at: "2026-10-15T12:00:00Z",
  manual_next_program_item_id: null, manual_next_due_hours: null,
});

test("PS-DZA: fulfilling the manual 200H at 1200h resumes at 50H/1250h, without a phantom 600H/1200h", () => {
  const input = { aircraft: psDzaAircraft, aircraftOrders: [psDzaPlan, psDzaExecution], modelItems: psDzaItems, currentHours: 1200, scheduledFlights: [] };
  const home = buildNextMaintenance(input);
  const fleet = buildUpcomingMaintenance(input);
  assert.equal(home.id, "50h");
  assert.equal(home.dueAtHours, 1250);
  assert.equal(home.remainingHours, 50);
  assert.equal(fleet[0].id, "50h");
  assert.equal(fleet[0].remainingHours, 50);
  assert.equal(fleet.find((row) => row.id === "600h").remainingHours, 600);
  assert.ok(fleet.every((row) => row.remainingHours > 0));
});

test("a fulfilled manual plan supersedes the old slot even with older 600H history, preserving that history", () => {
  const old600 = order({ id: "old-600", maintenance_program_item_id: "600h", aircraft_ttaf: 600,
    opened_at: "2025-10-02T12:00:00Z", completed_at: "2025-10-02T12:00:00Z",
    manual_next_program_item_id: null, manual_next_due_hours: null });
  const orders = [old600, psDzaPlan, psDzaExecution];
  const input = { aircraft: psDzaAircraft, aircraftOrders: orders, modelItems: psDzaItems, currentHours: 1200, scheduledFlights: [] };
  assert.equal(buildNextMaintenance(input).id, "50h");
  assert.equal(buildUpcomingMaintenance(input).find((row) => row.id === "600h").remainingHours, 600);
  assert.equal(orders.filter((row) => row.maintenance_program_item_id === "600h").length, 1);
  assert.equal(old600.aircraft_ttaf, 600);
});

test("ordinary maintenance without a manual plan keeps the existing program behavior", () => {
  const noManualPlan = { ...psDzaPlan, manual_next_program_item_id: null, manual_next_due_hours: null };
  const input = { aircraft: psDzaAircraft, aircraftOrders: [noManualPlan, psDzaExecution], modelItems: psDzaItems, currentHours: 1200, scheduledFlights: [] };
  assert.equal(buildNextMaintenance(input).id, "600h");
  assert.equal(buildUpcomingMaintenance(input).find((row) => row.id === "600h").remainingHours, 0);
});

test("the resumed program stays anchored and can still become overdue after the manual execution", () => {
  const input = { aircraft: psDzaAircraft, aircraftOrders: [psDzaPlan, psDzaExecution], modelItems: psDzaItems, currentHours: 1251, scheduledFlights: [] };
  const home = buildNextMaintenance(input);
  assert.equal(home.id, "50h");
  assert.equal(home.dueAtHours, 1250);
  assert.equal(home.remainingHours, -1);
  assert.equal(buildUpcomingMaintenance(input).find((row) => row.id === "600h").remainingHours, 549);
});

test("the logbook transitions from the manual 200H plan to the next program slot only after its execution", () => {
  const input = { aircraft: psDzaAircraft, programItems: psDzaItems, workOrders: [psDzaPlan, psDzaExecution], flights: [] };
  const before = buildMaintenanceAsOfFlight({ ...input, asOfMs: Date.parse("2026-10-10T12:00:00Z") });
  assert.match(before.nextInterventionType, /200H/);
  const after = buildMaintenanceAsOfFlight({ ...input, asOfMs: Date.parse("2026-10-16T12:00:00Z") });
  assert.match(after.nextInterventionType, /50H/);
  assert.equal(after.nextInterventionDueHours, 50);
});

test("manual choice overrides an earlier automatic inspection on Home and Fleet", () => {
  const home = buildNextMaintenance(params([order()]));
  const fleet = buildUpcomingMaintenance(params([order()]));
  assert.equal(home.id, "100h");
  assert.equal(home.dueAtHours, 1075);
  assert.equal(home.remainingHours, 55);
  assert.equal(fleet.length, 1);
  assert.equal(fleet[0].id, "100h");
  assert.equal(fleet[0].remainingHours, 55);
});

test("blank or cleared manual fields preserve the existing program", () => {
  for (const overrides of [
    { manual_next_program_item_id: undefined, manual_next_due_hours: undefined },
    { manual_next_program_item_id: null, manual_next_due_hours: null },
  ]) {
    const orders = [order(overrides)];
    assert.equal(resolveManualNextMaintenance(orders, items), null);
    assert.equal(buildNextMaintenance(params(orders)).id, "50h");
    assert.equal(buildNextMaintenance(params(orders)).remainingHours, 30);
    assert.ok(buildUpcomingMaintenance(params(orders)).some((row) => row.id === "50h"));
  }
});

test("the latest completed maintenance decides whether to use the manual branch", () => {
  const next = order({ id: "later", completed_at: "2026-10-02T12:00:00Z", manual_next_program_item_id: null, manual_next_due_hours: null });
  assert.equal(resolveManualNextMaintenance([order(), next], items), null);
  for (const overrides of [{ status: "canceled" }, { deleted_at: "2026-10-03" }, { status: "open" }, { work_order_type: "migration_baseline" }]) {
    assert.equal(resolveManualNextMaintenance([order(), { ...next, ...overrides }], items).dueAtHours, 1075);
  }
});

test("invalid or unavailable manual definitions fall back to the program", () => {
  for (const overrides of [
    { manual_next_program_item_id: "other-model" }, { manual_next_due_hours: NaN },
    { manual_next_due_hours: 1000 }, { manual_next_due_hours: null },
  ]) assert.equal(resolveManualNextMaintenance([order(overrides)], items), null);
});

test("an overdue manual inspection stays overdue instead of moving to a new multiple", () => {
  const home = buildNextMaintenance({ ...params([order()]), currentHours: 1080 });
  assert.equal(home.dueAtHours, 1075);
  assert.equal(home.remainingHours, -5);
});

test("logbook uses the manual definition as of the flight, ignoring later entries", () => {
  const later = order({ completed_at: "2026-10-10T12:00:00Z", manual_next_due_hours: null, manual_next_program_item_id: null });
  const result = buildMaintenanceAsOfFlight({
    aircraft, programItems: items, workOrders: [order(), later, order({ aircraft_id: "different" })], flights: [], asOfMs: Date.parse("2026-10-05T12:00:00Z"),
  });
  assert.match(result.nextInterventionType, /100H/);
  assert.equal(result.nextInterventionDueHours, 55);
});

test("fleet projection carries the manual target and resumes the program after its simulated completion", () => {
  const due = maintenanceDueList(items, [order()]);
  const pending = maintenanceProjectionCandidates(due, 1049, false);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].due, 1075);
  const resumed = maintenanceProjectionCandidates(due, 1075, true);
  assert.equal(resumed.length, 2);
  assert.ok(resumed.every((row) => row.due === 1100));
});

test("scale risk waits for the manual target and detects overdue manual maintenance", () => {
  const due = maintenanceDueList(items, [order()]);
  const series = projectMaintenanceRisk({ items: due, currentHours: 1040, avgHoursPerDay: 10, fromDate: "2026-10-05", dayCount: 7 });
  assert.equal(series["2026-10-05"].risk, "low");
  assert.equal(series["2026-10-08"].risk, "medium");
  assert.equal(series["2026-10-08"].maintenanceCode, "100H");
  assert.equal(series["2026-10-09"].risk, "high");
  const overdue = projectMaintenanceRisk({ items: due, currentHours: 1080, avgHoursPerDay: 1, fromDate: "2026-10-05", dayCount: 1 });
  assert.equal(overdue["2026-10-05"].risk, "medium");
});

test("a manual item without an hour interval or downtime still suppresses earlier automatic risks", () => {
  const noInterval = { ...items[1], recurrence_rules: "[]", estimated_downtime_days: null };
  const due = maintenanceDueList([items[0], noInterval], [order()]);
  const series = projectMaintenanceRisk({ items: due, currentHours: 1040, avgHoursPerDay: 10, fromDate: "2026-10-05", dayCount: 4 });
  assert.ok(Object.values(series).every((day) => day.risk === "low"));
});

test("manual fields persist alongside technical data and can be cleared without schema changes", async () => {
  let stored = {};
  const db = load("src/lib/maintenanceDb.ts", "", {
    "./appwrite": {
      isAppwriteConfigured: true, MAINTENANCE_WORK_ORDERS_COL_ID: "orders",
      ID: { unique: () => "new-order" }, Permission: { read: () => "read", update: () => "update", delete: () => "delete" }, Role: { label: () => "admin" },
      databases: {
        createDocument: async (_db, _col, id, data) => (stored = { ...data, $id: id }),
        updateDocument: async (_db, _col, id, data) => (stored = { ...stored, ...data, $id: id }),
        listDocuments: async () => ({ documents: [stored] }),
      },
    },
  });
  const payload = { ...order(), reference_section: "Section 5", corrective_action: "Checked" };
  const created = await db.createWorkOrder(payload);
  assert.equal(created.manual_next_program_item_id, "100h");
  assert.equal(created.manual_next_due_hours, 1075);
  assert.equal(created.reference_section, "Section 5");
  assert.equal(JSON.parse(stored.technical_json).manual_next_due_hours, 1075);
  assert.equal((await db.listWorkOrders())[0].manual_next_due_hours, 1075);
  const cleared = await db.updateWorkOrder(created.id, { ...payload, manual_next_due_hours: null, manual_next_program_item_id: null });
  assert.equal(cleared.manual_next_due_hours, null);
  assert.equal(cleared.manual_next_program_item_id, null);
  assert.equal(cleared.corrective_action, "Checked");
});

test("student booking backend honors the same manual target and risk windows as the frontend", () => {
  const docs = items.map((item) => ({ ...item, $id: item.id }));
  const parsedItems = server.parseProgramTheoryItems(docs, true);
  const input = order();
  const doc = {
    $id: input.id, aircraft_ttaf: input.aircraft_ttaf, opened_at: input.opened_at,
    status: input.status, work_order_type: input.work_order_type,
    times_json: JSON.stringify({ completed_at: input.completed_at }),
    technical_json: JSON.stringify({ manual_next_program_item_id: input.manual_next_program_item_id, manual_next_due_hours: input.manual_next_due_hours }),
  };
  const backendItems = server.theoryItemsWithManualNextMaintenance(parsedItems, [doc]);
  const frontendItems = maintenanceDueList(items, [input]);
  for (const currentHours of [1040, 1075, 1080]) {
    const base = { currentHours, avgHoursPerDay: 10, fromDate: "2026-10-05", dayCount: 20 };
    const frontend = projectMaintenanceRisk({ ...base, items: frontendItems });
    const backend = server.projectMaintenanceRiskServer({ ...base, items: backendItems });
    for (const date of Object.keys(frontend)) {
      assert.equal(backend[date].risk, frontend[date].risk, `${date} at ${currentHours} h`);
      assert.equal(backend[date].grounded, frontend[date].grounded);
    }
  }
  const cleared = { ...doc, $id: "later", times_json: JSON.stringify({ completed_at: "2026-10-02T12:00:00Z" }), technical_json: "{}" };
  const automatic = server.theoryItemsWithManualNextMaintenance(parsedItems, [doc, cleared]);
  assert.ok(automatic.every((item) => item.manualDueAtHours == null));
});
