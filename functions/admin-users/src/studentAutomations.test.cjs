const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareValue,
  evaluateConditionTree,
  renderVariables,
  validateAutomation,
  missionIsSolo,
  decideStateRun,
} = require("./studentAutomations");

test("operadores numéricos e listas", () => {
  assert.equal(compareValue(14, "gte", 14), true);
  assert.equal(compareValue(13, "gt", 14), false);
  assert.equal(compareValue("risk", "in", ["active", "risk"]), true);
  assert.equal(compareValue("active", "not_in", ["risk", "paused"]), true);
  assert.equal(compareValue("track-2", "in", ["track-1", "track-2"]), true);
});

test("grupos E/OU são avaliados sem ramificações", () => {
  const context = {
    activity: { days_without_flight: 20 },
    contact: { has_email: true, has_phone: false },
  };
  const tree = {
    mode: "all",
    groups: [
      {
        mode: "all",
        conditions: [
          { field: "activity.days_without_flight", operator: "gte", value: 14 },
        ],
      },
      {
        mode: "any",
        conditions: [
          { field: "contact.has_email", operator: "eq", value: true },
          { field: "contact.has_phone", operator: "eq", value: true },
        ],
      },
    ],
  };
  assert.equal(evaluateConditionTree(tree, context), true);
});

test("templates resolvem variáveis e removem ausentes", () => {
  assert.equal(
    renderVariables(
      "Olá {{student.first_name}}, saldo {{credits.balance_hours}}h.",
      { student: { first_name: "Ana" }, credits: { balance_hours: 8.5 } },
    ),
    "Olá Ana, saldo 8.5h.",
  );
  assert.equal(renderVariables("{{flight.aircraft}}", {}), "");
});

test("solo usa snapshot da missão SL", () => {
  assert.equal(
    missionIsSolo({
      training_snapshot_json: JSON.stringify({ missionType: "SL" }),
    }),
    true,
  );
  assert.equal(missionIsSolo({ mission_type: "DC" }), false);
});

test("linha de base bloqueia disparo até sair e entrar na condição", () => {
  const now = Date.now();
  const baseline = {
    armed: false,
    last_match: true,
    last_triggered_at: null,
    cooldown_until: null,
  };
  assert.deepEqual(
    decideStateRun({
      eventTrigger: false,
      matched: true,
      state: baseline,
      now,
      uniqueKey: "",
    }),
    { run: false, armed: false },
  );
  assert.deepEqual(
    decideStateRun({
      eventTrigger: false,
      matched: false,
      state: baseline,
      now,
      uniqueKey: "",
    }),
    { run: false, armed: true },
  );
  assert.equal(
    decideStateRun({
      eventTrigger: false,
      matched: true,
      state: { ...baseline, armed: true },
      now,
      uniqueKey: "",
    }).run,
    true,
  );
});

test("cooldown permite recorrência contínua somente após vencer", () => {
  const now = Date.now();
  const state = {
    armed: false,
    last_match: true,
    last_triggered_at: new Date(now - 1000).toISOString(),
    cooldown_until: new Date(now + 60000).toISOString(),
  };
  assert.equal(
    decideStateRun({
      eventTrigger: false,
      matched: true,
      state,
      now,
      uniqueKey: "",
    }).run,
    false,
  );
  assert.equal(
    decideStateRun({
      eventTrigger: false,
      matched: true,
      state: { ...state, cooldown_until: new Date(now - 1).toISOString() },
      now,
      uniqueKey: "",
    }).run,
    true,
  );
});

test("eventos são deduplicados pela chave da entidade", () => {
  const now = Date.now();
  const state = {
    armed: false,
    last_match: true,
    last_triggered_at: null,
    cooldown_until: null,
    last_value_json: JSON.stringify({ uniqueKey: "flight-1:Realizado" }),
  };
  assert.equal(
    decideStateRun({
      eventTrigger: true,
      matched: true,
      state,
      now,
      uniqueKey: "flight-1:Realizado",
    }).run,
    false,
  );
  assert.equal(
    decideStateRun({
      eventTrigger: true,
      matched: true,
      state,
      now,
      uniqueKey: "flight-2:Realizado",
    }).run,
    true,
  );
});

test("fluxo inválido não ativa sem ação terminal", () => {
  const errors = validateAutomation({
    name: "Teste",
    triggerType: "flight.created",
    steps: [{ id: "wait", type: "wait", amount: 1, unit: "days" }],
  });
  assert.ok(errors.some((error) => error.includes("ação")));
});

test("WPP exige correlação de todas as variáveis posicionais", () => {
  const errors = validateAutomation({
    name: "Teste WPP",
    triggerType: "student.created",
    steps: [
      {
        id: "wpp",
        type: "wpp",
        templateName: "boas_vindas",
        language: "pt_BR",
        headerVariables: [],
        bodyVariables: ["{{student.first_name}}", ""],
        recipients: ["student"],
      },
    ],
  });
  assert.ok(errors.some((error) => error.includes("Mapeie todas")));
});
