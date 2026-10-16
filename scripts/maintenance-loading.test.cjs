const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

const filename = path.resolve(__dirname, "../src/components/admin/MaintenanceTab.tsx");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Run the actual screen with controlled requests and a minimal hook scheduler.
// No credentials, backend writes, or browser session are needed.
function screen(overrides = {}) {
  const state = [];
  const effects = [];
  let cursor = 0;
  const aircraft = { id: "aircraft-1", type: "aviao", model_id: "model-1", registration: "PS-TEST" };
  const order = {
    id: "order-1", aircraft_id: aircraft.id, maintenance_program_item_id: "item-1",
    opened_at: "2026-10-14T12:00:00Z", aircraft_ttaf: 1234.5, description_performed: "Inspeção registrada",
  };
  const api = {
    listAttachments: async () => [],
    invalidateFleetMaintenanceContext: () => {},
    linkDiscrepancyToWorkOrder: async () => {},
    listWorkOrders: async () => [order],
    listAircrafts: async () => [aircraft],
    listModels: async () => [{ id: aircraft.model_id, name: "Modelo teste" }],
    listProgramItemsByModel: async () => [{ id: "item-1", aircraft_model_id: aircraft.model_id, code: "50H", title: "Inspeção de 50 horas" }],
    ...overrides,
  };
  const toasts = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useEffect(callback) { effects.push(callback); },
    useCallback(callback) { return callback; },
    useMemo(callback) { return callback(); },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console, Date, Map, Set,
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return require(id);
      if (id.endsWith("/AuthContext")) return { useAuth: () => ({ user: { id: "admin-1" } }) };
      if (id.endsWith("/PermissionsContext")) return { usePermissions: () => ({ canAction: () => true }) };
      if (id.endsWith("/ToastProvider")) return { useToast: () => ({ showToast: (toast) => toasts.push(toast) }) };
      if (id.endsWith("/Skeleton")) return { Skeleton: () => null };
      if (id.endsWith("/appwrite")) return { SCHOOL_ID: "school-1" };
      return api;
    },
  }, { filename });
  let tree;
  function render() {
    cursor = 0;
    effects.length = 0;
    tree = exports.MaintenanceTab();
    return renderToStaticMarkup(tree);
  }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  return {
    api,
    toasts,
    async click(label) {
      const button = find(tree, (node) => node.type === "button" && node.props.children === label);
      assert.ok(button, `Button ${label} must be visible`);
      button.props.onClick();
      await new Promise(setImmediate);
      return render();
    },
    setField(label, value) {
      const field = find(tree, (node) => node.props.label === label);
      assert.ok(field, `Field ${label} must be visible`);
      field.props.onChange(value);
      return render();
    },
    async mount() {
      render();
      effects[0]();
      await new Promise(setImmediate);
      return render();
    },
    async retry() {
      const button = find(tree, (node) => node.type === "button" && node.props.children === "Tentar novamente");
      assert.ok(button, "A persistent retry button must be visible");
      button.props.onClick();
      await new Promise(setImmediate);
      return render();
    },
  };
}

const fail = (message) => async () => { throw new Error(message); };

test("shows saved maintenance when aircraft model lookup fails", async () => {
  const html = await screen({ listModels: fail("Models unavailable") }).mount();
  assert.match(html, /PS-TEST/);
  assert.match(html, /Inspeção registrada/);
  assert.match(html, /Inspeção de 50 horas/);
  assert.match(html, /Models unavailable/);
  assert.doesNotMatch(html, /Nenhuma manutenção lançada/);
});

test("shows saved maintenance even when aircraft lookup fails", async () => {
  const html = await screen({ listAircrafts: fail("Aircraft unavailable") }).mount();
  assert.match(html, /Inspeção registrada/);
  assert.match(html, /1234.5 h/);
  assert.match(html, /Aircraft unavailable/);
  assert.doesNotMatch(html, /Nenhuma manutenção lançada/);
});

test("keeps maintenance and exposes a failed program lookup", async () => {
  const html = await screen({ listProgramItemsByModel: fail("Program unavailable") }).mount();
  assert.match(html, /Inspeção registrada/);
  assert.match(html, /Program unavailable/);
});

test("request failure stays visible and retry restores the records", async () => {
  const app = screen({ listWorkOrders: fail("User unauthorized") });
  const failed = await app.mount();
  assert.match(failed, /User unauthorized/);
  assert.match(failed, /Tentar novamente/);
  assert.doesNotMatch(failed, /Nenhuma manutenção lançada/);
  app.api.listWorkOrders = async () => [{
    id: "order-2", aircraft_id: "aircraft-1", aircraft_ttaf: 1500,
    opened_at: "2026-10-15T12:00:00Z", description_performed: "Registro recuperado",
  }];
  const recovered = await app.retry();
  assert.match(recovered, /Registro recuperado/);
  assert.doesNotMatch(recovered, /User unauthorized|Tentar novamente/);
});

test("only a successful empty response displays no maintenance", async () => {
  const html = await screen({ listWorkOrders: async () => [] }).mount();
  assert.match(html, /Nenhuma manutenção lançada/);
  assert.doesNotMatch(html, /Tentar novamente/);
});

test("missing maintenance configuration rejects instead of pretending the database is empty", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/maintenanceDb.ts"), "utf8")
    .replaceAll("import.meta.env", "__testEnv");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, __testEnv: {},
    require(id) {
      if (id === "appwrite") return require(id);
      return { isAppwriteConfigured: true, databases: {} };
    },
  });
  await assert.rejects(exports.listWorkOrders(), /serviço de manutenções não está configurado/);
  await assert.rejects(exports.listProgramItemsByModel("model-1"), /programa de manutenção não está configurado/);
  assert.equal((await exports.listProgramItemsByModel("")).length, 0);
});

test("manual next maintenance is optional, validates both fields, and saves absolute hours", async () => {
  let saved;
  const app = screen({ createWorkOrder: async (payload) => (saved = { id: "created", ...payload }) });
  await app.mount();
  await app.click("Lançar manutenção");
  app.setField("Avião *", "aircraft-1");
  app.setField("Horas da aeronave *", "1234.5");
  app.setField("Manutenção realizada *", "item-1");
  app.setField("Próxima manutenção", "item-1");
  await app.click("Salvar");
  assert.equal(saved, undefined);
  assert.match(app.toasts.at(-1).message, /horas totais da próxima manutenção/);
  app.setField("Horas totais da aeronave para a próxima manutenção", "1200");
  await app.click("Salvar");
  assert.equal(saved, undefined);
  app.setField("Horas totais da aeronave para a próxima manutenção", "1280.5");
  const html = await app.click("Salvar");
  assert.equal(saved.manual_next_program_item_id, "item-1");
  assert.equal(saved.manual_next_due_hours, 1280.5);
  assert.match(html, /1280.5 h totais/);
});

test("leaving manual fields empty saves the normal program and hours alone require a next item", async () => {
  let saved;
  const app = screen({ createWorkOrder: async (payload) => (saved = { id: "created", ...payload }) });
  await app.mount();
  await app.click("Lançar manutenção");
  app.setField("Avião *", "aircraft-1");
  app.setField("Horas da aeronave *", "1234.5");
  app.setField("Manutenção realizada *", "item-1");
  app.setField("Horas totais da aeronave para a próxima manutenção", "1280");
  await app.click("Salvar");
  assert.equal(saved, undefined);
  assert.match(app.toasts.at(-1).message, /Selecione a próxima manutenção manual/);
  app.setField("Horas totais da aeronave para a próxima manutenção", "");
  await app.click("Salvar");
  assert.equal(saved.manual_next_program_item_id, null);
  assert.equal(saved.manual_next_due_hours, null);
});

test("editing reloads the manual fields and allows clearing them", async () => {
  let saved;
  const app = screen({
    listWorkOrders: async () => [{
      id: "order-1", aircraft_id: "aircraft-1", maintenance_program_item_id: "item-1", status: "released",
      work_order_number: "OS-1",
      opened_at: "2026-10-14T12:00:00Z", aircraft_ttaf: 1234.5, description_performed: "Inspeção registrada",
      manual_next_program_item_id: "item-1", manual_next_due_hours: 1280.5, checklist_execution: [],
    }],
    updateWorkOrder: async (id, payload) => (saved = { id, ...payload }),
  });
  await app.mount();
  const html = await app.click("Editar");
  assert.match(html, /value="1280.5"/);
  app.setField("Próxima manutenção", "");
  app.setField("Horas totais da aeronave para a próxima manutenção", "");
  await app.click("Salvar");
  assert.equal(saved.manual_next_program_item_id, null);
  assert.equal(saved.manual_next_due_hours, null);
});
