const crypto = require("node:crypto");

const EVENT_TRIGGERS = new Set([
  "student.created",
  "student.crm_status_changed",
  "training.track_changed",
  "flight.created",
  "flight.status_changed",
  "flight.completed",
  "flight.solo_completed",
]);

const PERIODIC_TRIGGERS = new Set([
  "training.progress_reached",
  "student.days_without_flight_reached",
  "credits.balance_crossed",
  "credits.expiring",
  "schedule.no_future_flight",
  "schedule.next_flight_in",
  "student.birthday",
]);

const VALID_TRIGGERS = new Set([...EVENT_TRIGGERS, ...PERIODIC_TRIGGERS]);
const VALID_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "exists",
  "not_exists",
]);
const VALID_RECIPIENTS = new Set(["student", "instructors", "admins"]);
const VALID_STEP_TYPES = new Set([
  "email",
  "wpp",
  "push",
  "crm_status",
  "wait",
]);
const MAX_WAIT_MINUTES = 365 * 24 * 60;

function clean(value) {
  return String(value ?? "").trim();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareValue(actual, operator, expected) {
  if (operator === "exists")
    return actual !== null && actual !== undefined && actual !== "";
  if (operator === "not_exists")
    return actual === null || actual === undefined || actual === "";
  if (operator === "in" || operator === "not_in") {
    const values = Array.isArray(expected)
      ? expected.map(String)
      : [String(expected ?? "")];
    const included = Array.isArray(actual)
      ? actual.some((item) => values.includes(String(item)))
      : values.includes(String(actual ?? ""));
    return operator === "in" ? included : !included;
  }
  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    const left = Number(actual);
    const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (operator === "gt") return left > right;
    if (operator === "gte") return left >= right;
    if (operator === "lt") return left < right;
    return left <= right;
  }
  const equal =
    typeof expected === "boolean"
      ? Boolean(actual) === expected
      : String(actual ?? "") === String(expected ?? "");
  return operator === "neq" ? !equal : equal;
}

function contextValue(context, field) {
  return field
    .split(".")
    .reduce(
      (value, key) =>
        value && typeof value === "object" ? value[key] : undefined,
      context,
    );
}

function evaluateCondition(condition, context) {
  if (!condition || !VALID_OPERATORS.has(condition.operator)) return false;
  return compareValue(
    contextValue(context, condition.field),
    condition.operator,
    condition.value,
  );
}

function evaluateConditionTree(tree, context) {
  const groups = Array.isArray(tree?.groups) ? tree.groups : [];
  if (groups.length === 0) return true;
  const groupResults = groups.map((group) => {
    const conditions = Array.isArray(group?.conditions) ? group.conditions : [];
    if (conditions.length === 0) return true;
    const results = conditions.map((condition) =>
      evaluateCondition(condition, context),
    );
    return group.mode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
  return tree?.mode === "any"
    ? groupResults.some(Boolean)
    : groupResults.every(Boolean);
}

function renderVariables(value, context) {
  return String(value ?? "").replace(
    /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi,
    (_match, key) => {
      const resolved = contextValue(context, key);
      if (resolved === null || resolved === undefined) return "";
      return String(resolved);
    },
  );
}

function missionIsSolo(payload) {
  const snapshot = parseJson(payload?.training_snapshot_json, {});
  return (
    clean(
      payload?.mission_type ||
        payload?.missionType ||
        snapshot.missionType ||
        snapshot.mission_type,
    ) === "SL"
  );
}

function decideStateRun({ eventTrigger, matched, state, now, uniqueKey }) {
  const cooldownUntil = state?.cooldown_until
    ? new Date(state.cooldown_until).getTime()
    : 0;
  const lastValue = parseJson(state?.last_value_json, null);
  const uniqueChanged =
    Boolean(uniqueKey) &&
    String(lastValue?.uniqueKey || "") !== String(uniqueKey);
  if (!matched) return { run: false, armed: true };
  if (now < cooldownUntil) return { run: false, armed: state?.armed !== false };
  if (eventTrigger)
    return { run: uniqueChanged || !state?.last_match, armed: false };
  const baselineBlocked = state?.armed === false && !state?.last_triggered_at;
  if (baselineBlocked) return { run: false, armed: false };
  const repeatDue = Boolean(state?.last_triggered_at) && now >= cooldownUntil;
  const run = state?.armed !== false || repeatDue;
  return { run, armed: run ? false : state?.armed !== false };
}

async function withRetries(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || 0);
      if (
        attempt === attempts ||
        (status > 0 && status < 500 && status !== 429)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

function waitMinutes(step) {
  const amount = Math.max(1, Math.round(toNumber(step?.amount, 1)));
  const multiplier =
    step?.unit === "days" ? 1440 : step?.unit === "hours" ? 60 : 1;
  return Math.min(MAX_WAIT_MINUTES, amount * multiplier);
}

function normalizeRecipients(value) {
  const recipients = Array.isArray(value)
    ? value.filter((item) => VALID_RECIPIENTS.has(item))
    : [];
  return recipients.length ? [...new Set(recipients)] : ["student"];
}

function normalizeConditions(value) {
  const tree = value && typeof value === "object" ? value : {};
  return {
    mode: tree.mode === "any" ? "any" : "all",
    groups: (Array.isArray(tree.groups) ? tree.groups : [])
      .slice(0, 10)
      .map((group) => ({
        id: clean(group?.id) || crypto.randomUUID(),
        mode: group?.mode === "any" ? "any" : "all",
        conditions: (Array.isArray(group?.conditions) ? group.conditions : [])
          .slice(0, 20)
          .map((condition) => ({
            id: clean(condition?.id) || crypto.randomUUID(),
            field: clean(condition?.field).slice(0, 64),
            operator: VALID_OPERATORS.has(condition?.operator)
              ? condition.operator
              : "eq",
            value: condition?.value ?? null,
          })),
      })),
  };
}

function normalizeSteps(value) {
  return (Array.isArray(value) ? value : []).slice(0, 50).map((raw) => {
    const type = VALID_STEP_TYPES.has(raw?.type) ? raw.type : "push";
    const id = clean(raw?.id) || crypto.randomUUID();
    if (type === "email")
      return {
        id,
        type,
        templateId: clean(raw.templateId),
        recipients: normalizeRecipients(raw.recipients),
      };
    if (type === "wpp")
      return {
        id,
        type,
        templateName: clean(raw.templateName),
        language: clean(raw.language) || "pt_BR",
        headerVariables: (Array.isArray(raw.headerVariables)
          ? raw.headerVariables
          : []
        )
          .map(clean)
          .slice(0, 20),
        bodyVariables: (Array.isArray(raw.bodyVariables)
          ? raw.bodyVariables
          : []
        )
          .map(clean)
          .slice(0, 50),
        recipients: normalizeRecipients(raw.recipients),
      };
    if (type === "push")
      return {
        id,
        type,
        title: clean(raw.title).slice(0, 120),
        body: clean(raw.body).slice(0, 1000),
        url: clean(raw.url).slice(0, 2048),
        recipients: normalizeRecipients(raw.recipients),
      };
    if (type === "crm_status")
      return { id, type, statusId: clean(raw.statusId) };
    return {
      id,
      type: "wait",
      amount: Math.max(1, Math.round(toNumber(raw.amount, 1))),
      unit: ["minutes", "hours", "days"].includes(raw.unit)
        ? raw.unit
        : "hours",
    };
  });
}

function validateAutomation(input) {
  const errors = [];
  if (!clean(input?.name)) errors.push("Informe o nome da automação.");
  if (!VALID_TRIGGERS.has(input?.triggerType))
    errors.push("Selecione um gatilho válido.");
  const steps = normalizeSteps(input?.steps);
  if (!steps.some((step) => step.type !== "wait"))
    errors.push("Adicione ao menos uma ação ao fluxo.");
  for (const step of steps) {
    if (step.type === "email" && !step.templateId)
      errors.push("Selecione um template em todas as ações de email.");
    if (step.type === "wpp" && !step.templateName)
      errors.push("Selecione um template em todas as ações de WPP.");
    if (
      step.type === "wpp" &&
      [...step.headerVariables, ...step.bodyVariables].some(
        (value) => !clean(value),
      )
    )
      errors.push("Mapeie todas as variáveis do template WPP.");
    if (step.type === "push" && (!step.title || !step.body))
      errors.push("Preencha título e mensagem em todas as ações push.");
    if (step.type === "crm_status" && !step.statusId)
      errors.push("Selecione o status CRM da ação.");
    if (step.type === "wait" && waitMinutes(step) > MAX_WAIT_MINUTES)
      errors.push("A espera máxima é de 365 dias.");
  }
  return [...new Set(errors)];
}

function createStudentAutomationService(deps) {
  const {
    sdk,
    databases,
    users,
    functions,
    databaseId,
    collections,
    schoolId,
    functionId,
    appUrl,
    timezone = "America/Sao_Paulo",
    adminPerms,
    requireAdmin,
    getStudentsProgress,
    listAdminUserIds,
    sendEmail,
    sendPush,
    sendWpp,
  } = deps;

  const nowIso = () => new Date().toISOString();
  const todayLocal = () => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      return nowIso().slice(0, 10);
    }
  };

  async function listAll(collectionId, queries = []) {
    if (!collectionId) return [];
    const docs = [];
    let cursor = null;
    do {
      const page = await databases.listDocuments(databaseId, collectionId, [
        ...queries,
        sdk.Query.limit(100),
        ...(cursor ? [sdk.Query.cursorAfter(cursor)] : []),
      ]);
      docs.push(...(page.documents || []));
      cursor =
        page.documents?.length === 100
          ? page.documents[page.documents.length - 1].$id
          : null;
    } while (cursor);
    return docs;
  }

  function ensureConfigured(...keys) {
    const missing = keys.filter((key) => !collections[key]);
    if (missing.length)
      throw Object.assign(
        new Error(
          `Coleções de automação não configuradas: ${missing.join(", ")}.`,
        ),
        { status: 500 },
      );
  }

  function mapAutomation(doc) {
    return {
      id: doc.$id,
      schoolId: doc.school_id || schoolId,
      name: doc.name || "",
      description: doc.description || "",
      status: ["draft", "active", "paused", "deleted"].includes(doc.status)
        ? doc.status
        : "draft",
      version: toNumber(doc.version, 1),
      triggerType: doc.trigger_type,
      triggerConfig: parseJson(doc.trigger_config_json, {}),
      conditions: normalizeConditions(parseJson(doc.conditions_json, {})),
      steps: normalizeSteps(parseJson(doc.steps_json, [])),
      cooldownMinutes: toNumber(doc.cooldown_minutes, 10080),
      baselineAt: doc.baseline_at || null,
      lastRunAt: doc.last_run_at || null,
      runCount: toNumber(doc.run_count),
      successCount: toNumber(doc.success_count),
      failureCount: toNumber(doc.failure_count),
      createdBy: doc.created_by || null,
      updatedBy: doc.updated_by || null,
      createdAt: doc.$createdAt || doc.created_at || "",
      updatedAt: doc.$updatedAt || doc.updated_at || "",
    };
  }

  function mapTemplate(doc) {
    return {
      id: doc.$id,
      schoolId: doc.school_id || schoolId,
      name: doc.name || "",
      subject: doc.subject || "",
      bodyHtml: doc.body_html || "",
      bodyJson: parseJson(doc.body_json, null),
      active: doc.active !== false,
      createdBy: doc.created_by || null,
      updatedBy: doc.updated_by || null,
      createdAt: doc.$createdAt || "",
      updatedAt: doc.$updatedAt || "",
    };
  }

  function mapStatus(doc) {
    return {
      id: doc.$id,
      schoolId: doc.school_id || schoolId,
      name: doc.name || "",
      color: doc.color || "#64748b",
      order: toNumber(doc.order),
      isDefault: doc.is_default === true,
      archived: doc.archived === true,
      createdAt: doc.$createdAt || "",
      updatedAt: doc.$updatedAt || "",
    };
  }

  function mapRun(doc) {
    return {
      id: doc.$id,
      automationId: doc.automation_id || "",
      automationName: doc.automation_name || "",
      automationVersion: toNumber(doc.automation_version, 1),
      studentUserId: doc.student_user_id || "",
      studentName: doc.student_name || "",
      triggerType: doc.trigger_type || "student.created",
      status: doc.status || "running",
      currentStep: toNumber(doc.current_step),
      rootRunId: doc.root_run_id || doc.$id,
      chainDepth: toNumber(doc.chain_depth),
      context: parseJson(doc.context_json, {}),
      error: doc.error || null,
      startedAt: doc.started_at || doc.$createdAt || "",
      completedAt: doc.completed_at || null,
    };
  }

  function mapStepRun(doc) {
    return {
      id: doc.$id,
      runId: doc.run_id,
      automationId: doc.automation_id,
      stepId: doc.step_id,
      stepIndex: toNumber(doc.step_index),
      stepType: doc.step_type,
      recipientUserId: doc.recipient_user_id || null,
      recipientLabel: doc.recipient_label || null,
      channel: doc.channel,
      status: doc.status,
      providerMessageId: doc.provider_message_id || null,
      resolvedContent: parseJson(doc.resolved_content_json, {}),
      error: doc.error || null,
      durationMs: doc.duration_ms == null ? null : toNumber(doc.duration_ms),
      createdAt: doc.created_at || doc.$createdAt || "",
      completedAt: doc.completed_at || null,
    };
  }

  async function listAutomations(actorUserId) {
    await requireAdmin(actorUserId);
    ensureConfigured("automations");
    const docs = await listAll(collections.automations, [
      sdk.Query.equal("school_id", [schoolId]),
      sdk.Query.orderDesc("$updatedAt"),
    ]);
    return docs.filter((doc) => doc.status !== "deleted").map(mapAutomation);
  }

  async function getAutomation(actorUserId, id) {
    await requireAdmin(actorUserId);
    ensureConfigured("automations");
    const doc = await databases.getDocument(
      databaseId,
      collections.automations,
      clean(id),
    );
    if (doc.school_id !== schoolId || doc.status === "deleted")
      throw Object.assign(new Error("Automação não encontrada."), {
        status: 404,
      });
    return mapAutomation(doc);
  }

  async function saveAutomation(actorUserId, id, input) {
    await requireAdmin(actorUserId);
    ensureConfigured("automations");
    const errors = validateAutomation(input);
    if (errors.length)
      throw Object.assign(new Error(errors.join(" ")), { status: 400 });
    const steps = normalizeSteps(input.steps);
    const conditions = normalizeConditions(input.conditions);
    const existing = id
      ? await databases.getDocument(
          databaseId,
          collections.automations,
          clean(id),
        )
      : null;
    if (existing?.status === "active") {
      const referenceErrors = await validateReferences({
        ...input,
        id: existing.$id,
        steps,
        conditions,
      });
      if (referenceErrors.length)
        throw Object.assign(new Error(referenceErrors.join(" ")), {
          status: 400,
        });
    }
    const data = {
      school_id: schoolId,
      name: clean(input.name).slice(0, 160),
      description: clean(input.description).slice(0, 1000),
      status:
        existing?.status === "active"
          ? "active"
          : existing?.status === "paused"
            ? "paused"
            : "draft",
      version: existing ? toNumber(existing.version, 1) + 1 : 1,
      trigger_type: input.triggerType,
      trigger_config_json: JSON.stringify(input.triggerConfig || {}).slice(
        0,
        4096,
      ),
      conditions_json: JSON.stringify(conditions).slice(0, 16384),
      steps_json: JSON.stringify(steps).slice(0, 32768),
      cooldown_minutes: Math.max(
        0,
        Math.min(
          MAX_WAIT_MINUTES,
          Math.round(toNumber(input.cooldownMinutes, 10080)),
        ),
      ),
      run_count: toNumber(existing?.run_count),
      success_count: toNumber(existing?.success_count),
      failure_count: toNumber(existing?.failure_count),
      created_by: existing?.created_by || actorUserId,
      updated_by: actorUserId,
    };
    const doc = existing
      ? await databases.updateDocument(
          databaseId,
          collections.automations,
          existing.$id,
          data,
        )
      : await databases.createDocument(
          databaseId,
          collections.automations,
          sdk.ID.unique(),
          data,
          adminPerms,
        );
    return mapAutomation(doc);
  }

  async function duplicateAutomation(actorUserId, id) {
    const source = await getAutomation(actorUserId, id);
    return saveAutomation(actorUserId, null, {
      ...source,
      name: `${source.name} (cópia)`,
    });
  }

  async function cancelPendingJobs(automationId) {
    if (!collections.jobs) return;
    const jobs = await listAll(collections.jobs, [
      sdk.Query.equal("automation_id", [automationId]),
      sdk.Query.equal("status", ["scheduled"]),
    ]);
    for (const job of jobs) {
      if (job.execution_id)
        await functions
          .deleteExecution({ functionId, executionId: job.execution_id })
          .catch(() => null);
      await databases
        .updateDocument(databaseId, collections.jobs, job.$id, {
          status: "cancelled",
          completed_at: nowIso(),
        })
        .catch(() => null);
      if (job.run_id && collections.runs)
        await databases
          .updateDocument(databaseId, collections.runs, job.run_id, {
            status: "cancelled",
            completed_at: nowIso(),
            error: "Automação desativada.",
          })
          .catch(() => null);
    }
  }

  async function baselineAutomation(automation) {
    if (!PERIODIC_TRIGGERS.has(automation.triggerType) || !collections.states)
      return;
    const progress = await getStudentsProgress({
      today: todayLocal(),
      inactiveDays: 365,
    });
    for (const student of progress.students || []) {
      const context = await buildStudentContext(student.userId, {}, student);
      const matched =
        evaluateTrigger(automation, context) &&
        evaluateConditionTree(automation.conditions, context);
      await upsertState(automation.id, student.userId, {
        last_match: matched,
        armed: !matched,
        last_value_json: JSON.stringify(triggerValue(automation, context)),
        updated_at: nowIso(),
      });
    }
  }

  async function setAutomationStatus(actorUserId, id, status) {
    await requireAdmin(actorUserId);
    const automation = await getAutomation(actorUserId, id);
    if (!["active", "paused"].includes(status))
      throw Object.assign(new Error("Status inválido."), { status: 400 });
    if (status === "active") {
      const errors = validateAutomation(automation);
      errors.push(...(await validateReferences(automation)));
      if (errors.length)
        throw Object.assign(new Error(errors.join(" ")), { status: 400 });
      if (!automation.baselineAt) await baselineAutomation(automation);
    } else {
      await cancelPendingJobs(automation.id);
    }
    const doc = await databases.updateDocument(
      databaseId,
      collections.automations,
      automation.id,
      {
        status,
        baseline_at:
          status === "active"
            ? automation.baselineAt || nowIso()
            : automation.baselineAt,
        updated_by: actorUserId,
      },
    );
    return mapAutomation(doc);
  }

  async function validateReferences(automation) {
    const errors = [];
    const flightTrigger = automation.triggerType.startsWith("flight.");
    for (const step of automation.steps) {
      if (step.type === "email") {
        const templateDoc = await databases
          .getDocument(databaseId, collections.templates, step.templateId)
          .catch(() => null);
        if (!templateDoc || templateDoc.active === false) {
          errors.push("Uma ação usa template de email ausente ou inativo.");
          continue;
        }
        const variables = `${templateDoc.subject || ""} ${templateDoc.body_html || ""}`;
        if (!flightTrigger && /\{\{\s*flight\./i.test(variables))
          errors.push(
            `O template “${templateDoc.name}” usa dados de voo incompatíveis com este gatilho.`,
          );
      }
      if (
        step.type === "wpp" &&
        !flightTrigger &&
        [...step.headerVariables, ...step.bodyVariables].some((value) =>
          /\{\{\s*flight\./i.test(value),
        )
      ) {
        errors.push(
          "A ação WPP usa dados de voo incompatíveis com este gatilho.",
        );
      }
      if (step.type === "crm_status") {
        const statusDoc = await databases
          .getDocument(databaseId, collections.crmStatuses, step.statusId)
          .catch(() => null);
        if (!statusDoc || statusDoc.archived === true)
          errors.push("Uma ação usa status CRM ausente ou arquivado.");
      }
    }
    return [...new Set(errors)];
  }

  async function deleteAutomation(actorUserId, id) {
    await requireAdmin(actorUserId);
    const automation = await getAutomation(actorUserId, id);
    await cancelPendingJobs(automation.id);
    await databases.updateDocument(
      databaseId,
      collections.automations,
      automation.id,
      { status: "deleted", deleted_at: nowIso(), updated_by: actorUserId },
    );
  }

  async function listTemplates(actorUserId) {
    await requireAdmin(actorUserId);
    ensureConfigured("templates");
    return (
      await listAll(collections.templates, [
        sdk.Query.equal("school_id", [schoolId]),
        sdk.Query.orderAsc("name"),
      ])
    ).map(mapTemplate);
  }

  async function saveTemplate(actorUserId, id, input) {
    await requireAdmin(actorUserId);
    ensureConfigured("templates");
    if (
      !clean(input?.name) ||
      !clean(input?.subject) ||
      !clean(input?.bodyHtml)
    )
      throw Object.assign(
        new Error("Nome, assunto e conteúdo são obrigatórios."),
        { status: 400 },
      );
    const existing = id
      ? await databases.getDocument(
          databaseId,
          collections.templates,
          clean(id),
        )
      : null;
    const data = {
      school_id: schoolId,
      name: clean(input.name).slice(0, 160),
      subject: clean(input.subject).slice(0, 255),
      body_html: String(input.bodyHtml).slice(0, 65535),
      body_json: input.bodyJson
        ? JSON.stringify(input.bodyJson).slice(0, 65535)
        : null,
      active: input.active !== false,
      created_by: existing?.created_by || actorUserId,
      updated_by: actorUserId,
    };
    const doc = existing
      ? await databases.updateDocument(
          databaseId,
          collections.templates,
          existing.$id,
          data,
        )
      : await databases.createDocument(
          databaseId,
          collections.templates,
          sdk.ID.unique(),
          data,
          adminPerms,
        );
    return mapTemplate(doc);
  }

  async function duplicateTemplate(actorUserId, id) {
    await requireAdmin(actorUserId);
    const doc = await databases.getDocument(
      databaseId,
      collections.templates,
      clean(id),
    );
    return saveTemplate(actorUserId, null, {
      ...mapTemplate(doc),
      name: `${doc.name} (cópia)`,
      active: false,
    });
  }

  async function deleteTemplate(actorUserId, id) {
    await requireAdmin(actorUserId);
    const automations = await listAll(collections.automations, [
      sdk.Query.equal("school_id", [schoolId]),
    ]);
    const inUse = automations.some(
      (doc) =>
        doc.status !== "deleted" &&
        normalizeSteps(parseJson(doc.steps_json, [])).some(
          (step) => step.type === "email" && step.templateId === id,
        ),
    );
    if (inUse)
      throw Object.assign(
        new Error("Este template está em uso por uma automação."),
        { status: 409 },
      );
    await databases.deleteDocument(
      databaseId,
      collections.templates,
      clean(id),
    );
  }

  async function sendTemplateTest(actorUserId, id, email) {
    await requireAdmin(actorUserId);
    const template = mapTemplate(
      await databases.getDocument(databaseId, collections.templates, clean(id)),
    );
    const context = sampleContext();
    return sendEmail({
      email: clean(email),
      subject: `[TESTE] ${renderVariables(template.subject, context)}`,
      html: renderVariables(template.bodyHtml, context),
    });
  }

  async function listStatuses(actorUserId) {
    await requireAdmin(actorUserId);
    ensureConfigured("crmStatuses");
    return (
      await listAll(collections.crmStatuses, [
        sdk.Query.equal("school_id", [schoolId]),
        sdk.Query.orderAsc("order"),
      ])
    ).map(mapStatus);
  }

  async function saveStatus(actorUserId, id, input) {
    await requireAdmin(actorUserId);
    ensureConfigured("crmStatuses");
    if (!clean(input?.name))
      throw Object.assign(new Error("Nome do status é obrigatório."), {
        status: 400,
      });
    const existing = id
      ? await databases.getDocument(
          databaseId,
          collections.crmStatuses,
          clean(id),
        )
      : null;
    if (input.isDefault === true) {
      const defaults = await listAll(collections.crmStatuses, [
        sdk.Query.equal("school_id", [schoolId]),
        sdk.Query.equal("is_default", [true]),
      ]);
      await Promise.all(
        defaults
          .filter((doc) => doc.$id !== id)
          .map((doc) =>
            databases.updateDocument(
              databaseId,
              collections.crmStatuses,
              doc.$id,
              { is_default: false },
            ),
          ),
      );
    }
    const data = {
      school_id: schoolId,
      name: clean(input.name).slice(0, 80),
      color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#64748b",
      order: Math.max(0, Math.round(toNumber(input.order))),
      is_default: input.isDefault === true,
      archived: input.archived === true,
    };
    const doc = existing
      ? await databases.updateDocument(
          databaseId,
          collections.crmStatuses,
          existing.$id,
          data,
        )
      : await databases.createDocument(
          databaseId,
          collections.crmStatuses,
          sdk.ID.unique(),
          data,
          adminPerms,
        );
    return mapStatus(doc);
  }

  async function archiveStatus(actorUserId, id) {
    await requireAdmin(actorUserId);
    const doc = await databases.getDocument(
      databaseId,
      collections.crmStatuses,
      clean(id),
    );
    if (doc.is_default)
      throw Object.assign(
        new Error("Defina outro status padrão antes de arquivar este."),
        { status: 409 },
      );
    await databases.updateDocument(
      databaseId,
      collections.crmStatuses,
      doc.$id,
      { archived: true },
    );
  }

  async function listCrmProfiles(actorUserId) {
    await requireAdmin(actorUserId);
    const [progress, profileDocs, statusDocs] = await Promise.all([
      getStudentsProgress({ today: todayLocal(), inactiveDays: 365 }),
      listAll(collections.crmProfiles, [
        sdk.Query.equal("school_id", [schoolId]),
      ]),
      listAll(collections.crmStatuses, [
        sdk.Query.equal("school_id", [schoolId]),
      ]),
    ]);
    const profilesByStudent = new Map(
      profileDocs.map((profile) => [clean(profile.student_user_id), profile]),
    );
    const statusesById = new Map(
      statusDocs.map((status) => [status.$id, mapStatus(status)]),
    );
    const defaultStatus = statusDocs.find(
      (status) => status.is_default === true && status.archived !== true,
    );
    return (progress.students || []).map((student) => {
      const profile = profilesByStudent.get(clean(student.userId));
      const status =
        statusesById.get(clean(profile?.status_id)) ||
        (defaultStatus ? mapStatus(defaultStatus) : null);
      return {
        studentUserId: student.userId,
        studentName:
          student.profile?.fullName ||
          student.name ||
          student.email ||
          student.userId,
        email: student.email || "",
        statusId: status?.id || "",
        statusName: status?.name || "Sem status",
        statusColor: status?.color || "#64748b",
        changedAt: profile?.changed_at || null,
      };
    });
  }

  async function setCrmProfileStatus(actorUserId, studentUserId, statusId) {
    await requireAdmin(actorUserId);
    return changeCrmStatus(clean(studentUserId), clean(statusId), {
      actorUserId,
      chainDepth: 0,
    });
  }

  async function getCrmProfile(studentUserId) {
    if (!collections.crmProfiles) return null;
    const result = await databases.listDocuments(
      databaseId,
      collections.crmProfiles,
      [sdk.Query.equal("student_user_id", [studentUserId]), sdk.Query.limit(1)],
    );
    return result.documents?.[0] || null;
  }

  async function getCrmStatus(studentUserId) {
    const profile = await getCrmProfile(studentUserId);
    let statusDoc = null;
    if (profile?.status_id)
      statusDoc = await databases
        .getDocument(databaseId, collections.crmStatuses, profile.status_id)
        .catch(() => null);
    if (!statusDoc) {
      const result = await databases.listDocuments(
        databaseId,
        collections.crmStatuses,
        [
          sdk.Query.equal("school_id", [schoolId]),
          sdk.Query.equal("is_default", [true]),
          sdk.Query.limit(1),
        ],
      );
      statusDoc = result.documents?.[0] || null;
    }
    return { profile, status: statusDoc ? mapStatus(statusDoc) : null };
  }

  async function changeCrmStatus(studentUserId, statusId, meta = {}) {
    const status = await databases.getDocument(
      databaseId,
      collections.crmStatuses,
      statusId,
    );
    if (status.school_id !== schoolId || status.archived === true)
      throw new Error("Status CRM indisponível.");
    const current = await getCrmProfile(studentUserId);
    if (current?.status_id === statusId) return current;
    const data = {
      school_id: schoolId,
      student_user_id: studentUserId,
      status_id: statusId,
      changed_by: meta.actorUserId || "automation",
      origin_run_id: meta.runId || null,
      chain_depth: Math.max(0, toNumber(meta.chainDepth)),
      changed_at: nowIso(),
    };
    return current
      ? databases.updateDocument(
          databaseId,
          collections.crmProfiles,
          current.$id,
          data,
        )
      : databases.createDocument(
          databaseId,
          collections.crmProfiles,
          sdk.ID.unique(),
          data,
          adminPerms,
        );
  }

  async function creditContext(student) {
    if (!collections.credits)
      return { balance_hours: 0, expires_in_days: null };
    const credits = await listAll(collections.credits, [
      sdk.Query.equal("user_id", [student.userId]),
    ]);
    const today = new Date(nowIso().slice(0, 10) + "T00:00:00Z");
    let purchased = 0;
    let nearest = null;
    for (const credit of credits) {
      const expires = credit.expires_at
        ? new Date(`${credit.expires_at}T23:59:59Z`)
        : null;
      if (expires && expires < today) continue;
      purchased += Math.max(0, toNumber(credit.hours));
      if (expires) {
        const days = Math.ceil(
          (expires.getTime() - today.getTime()) / 86400000,
        );
        nearest = nearest === null ? days : Math.min(nearest, days);
      }
    }
    return {
      balance_hours: Math.max(
        0,
        Number((purchased - toNumber(student.executed?.hours)).toFixed(2)),
      ),
      expires_in_days: nearest,
    };
  }

  async function hasPush(studentUserId) {
    if (!collections.pushSubscriptions) return false;
    const result = await databases
      .listDocuments(databaseId, collections.pushSubscriptions, [
        sdk.Query.equal("user_id", [studentUserId]),
        sdk.Query.equal("enabled", [true]),
        sdk.Query.limit(1),
      ])
      .catch(() => ({ documents: [] }));
    return Boolean(result.documents?.[0]);
  }

  async function linkedInstructorIds(studentUserId, eventContext = {}) {
    const ids = new Set();
    if (eventContext.instructor_user_id)
      ids.add(clean(eventContext.instructor_user_id));
    if (collections.instructorStudents) {
      const docs = await listAll(collections.instructorStudents, [
        sdk.Query.equal("student_user_id", [studentUserId]),
      ]).catch(() => []);
      docs.forEach((doc) => ids.add(clean(doc.instructor_user_id)));
    }
    ids.delete("");
    return [...ids];
  }

  async function soloFlightCount(studentUserId) {
    if (!collections.flights) return 0;
    const flights = await listAll(collections.flights, [
      sdk.Query.equal("student_user_id", [studentUserId]),
      sdk.Query.equal("flight_status", ["Realizado"]),
    ]).catch(() => []);
    return flights.filter((flight) => missionIsSolo(flight)).length;
  }

  async function buildStudentContext(
    studentUserId,
    eventContext = {},
    knownStudent = null,
  ) {
    const progressData = knownStudent
      ? null
      : await getStudentsProgress({ today: todayLocal(), inactiveDays: 365 });
    const student =
      knownStudent ||
      (progressData?.students || []).find(
        (item) => item.userId === studentUserId,
      );
    if (!student)
      throw Object.assign(new Error("Aluno não encontrado."), { status: 404 });
    const [crm, credits, push, instructors, authUser, soloCount, profileDoc] =
      await Promise.all([
        getCrmStatus(studentUserId),
        creditContext(student),
        hasPush(studentUserId),
        linkedInstructorIds(studentUserId, eventContext),
        users.get({ userId: studentUserId }).catch(() => null),
        soloFlightCount(studentUserId),
        collections.profiles
          ? databases
              .listDocuments(databaseId, collections.profiles, [
                sdk.Query.equal("user_id", [studentUserId]),
                sdk.Query.limit(1),
              ])
              .then((page) => page.documents?.[0] || null)
              .catch(() => null)
          : null,
      ]);
    const name =
      student.profile?.fullName ||
      student.name ||
      authUser?.name ||
      student.email ||
      studentUserId;
    const firstName = name.split(/\s+/)[0] || name;
    const nextFlightAt = student.planned?.nextFlightAt || null;
    const nextFlightDays = nextFlightAt
      ? Math.ceil((new Date(nextFlightAt).getTime() - Date.now()) / 86400000)
      : null;
    const createdAt = authUser?.$createdAt || null;
    const context = {
      student: {
        id: studentUserId,
        name,
        first_name: firstName,
        email: student.email || authUser?.email || "",
        phone: student.profile?.phone || profileDoc?.phone || "",
        crm_status_id: crm.status?.id || "",
        crm_status: crm.status?.name || "Sem status",
        days_since_created: createdAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(createdAt).getTime()) / 86400000,
              ),
            )
          : 0,
        birth_date: student.profile?.birthDate || profileDoc?.birth_date || "",
      },
      training: {
        track_id: student.trainingProgress?.trackId || "",
        track_name: student.trainingProgress?.trackName || "Sem trilha",
        track_status: student.trainingProgress?.status || "",
        progress_percent: toNumber(student.trainingProgress?.percentComplete),
      },
      activity: {
        days_without_flight: student.daysSinceLastFlight ?? 99999,
        flight_count: toNumber(student.executed?.count),
        solo_flight_count: soloCount,
        last_flight_date: student.executed?.lastFlightAt || "",
      },
      credits,
      schedule: {
        has_future_flight: Boolean(nextFlightAt),
        next_flight_in_days: nextFlightDays,
        next_flight_at: nextFlightAt || "",
      },
      contact: {
        has_email: Boolean(student.email || authUser?.email),
        has_phone: Boolean(student.profile?.phone || profileDoc?.phone),
        has_push: push,
        has_instructor: instructors.length > 0,
      },
      flight: {
        id: clean(eventContext.$id || eventContext.id),
        date: clean(eventContext.flight_date || eventContext.date),
        time: clean(eventContext.start_time || eventContext.time),
        status: clean(eventContext.flight_status || eventContext.status),
        previous_status: clean(eventContext.previous_status),
        aircraft: clean(eventContext.aircraft_ident || eventContext.aircraft),
      },
      instructor: { id: instructors[0] || "", name: "" },
      school: {
        name: clean(deps.schoolName) || "Escola",
        app_url: appUrl || "",
      },
      event: eventContext,
    };
    if (instructors[0]) {
      const instructor = await users
        .get({ userId: instructors[0] })
        .catch(() => null);
      context.instructor.name = instructor?.name || "Instrutor";
    }
    return context;
  }

  function triggerValue(automation, context) {
    const type = automation.triggerType;
    if (type === "training.progress_reached")
      return context.training.progress_percent;
    if (type === "student.days_without_flight_reached")
      return context.activity.days_without_flight;
    if (type === "credits.balance_crossed")
      return context.credits.balance_hours;
    if (type === "credits.expiring") return context.credits.expires_in_days;
    if (type === "schedule.next_flight_in")
      return context.schedule.next_flight_in_days;
    if (type === "schedule.no_future_flight")
      return context.schedule.has_future_flight;
    if (type === "student.birthday") return context.student.birth_date;
    if (automation.triggerType === "flight.status_changed")
      return { flightId: context.flight.id, status: context.flight.status };
    if (automation.triggerType === "student.crm_status_changed")
      return {
        studentUserId: context.student.id,
        statusId: context.student.crm_status_id,
      };
    return (
      context.event?.$id ||
      context.event?.id ||
      context.flight.id ||
      context.student.id
    );
  }

  function evaluateTrigger(automation, context, eventType = null) {
    if (eventType && automation.triggerType !== eventType) return false;
    const config = automation.triggerConfig || {};
    const threshold = toNumber(config.threshold ?? config.days, 0);
    if (automation.triggerType === "training.progress_reached")
      return compareValue(
        context.training.progress_percent,
        config.operator || "gte",
        threshold,
      );
    if (automation.triggerType === "student.days_without_flight_reached")
      return (
        context.activity.days_without_flight !== 99999 &&
        compareValue(
          context.activity.days_without_flight,
          config.operator || "gte",
          threshold,
        )
      );
    if (automation.triggerType === "credits.balance_crossed")
      return compareValue(
        context.credits.balance_hours,
        config.operator || (config.direction === "below" ? "lte" : "gte"),
        threshold,
      );
    if (automation.triggerType === "credits.expiring")
      return (
        context.credits.expires_in_days !== null &&
        compareValue(
          context.credits.expires_in_days,
          config.operator || "lte",
          threshold || 30,
        )
      );
    if (automation.triggerType === "schedule.no_future_flight")
      return !context.schedule.has_future_flight;
    if (automation.triggerType === "schedule.next_flight_in")
      return (
        context.schedule.next_flight_in_days !== null &&
        context.schedule.next_flight_in_days >= 0 &&
        compareValue(
          context.schedule.next_flight_in_days,
          config.operator || "lte",
          threshold || 1,
        )
      );
    if (automation.triggerType === "student.birthday") {
      const birth = clean(context.student.birth_date).slice(5, 10);
      return Boolean(birth) && birth === todayLocal().slice(5, 10);
    }
    if (automation.triggerType === "flight.status_changed")
      return !config.status || context.flight.status === config.status;
    if (automation.triggerType === "flight.completed")
      return context.flight.status === "Realizado";
    if (automation.triggerType === "flight.solo_completed")
      return (
        context.flight.status === "Realizado" && missionIsSolo(context.event)
      );
    if (automation.triggerType === "student.crm_status_changed")
      return !config.status || context.student.crm_status_id === config.status;
    if (automation.triggerType === "training.track_changed")
      return !config.trackId || context.training.track_id === config.trackId;
    return true;
  }

  async function resolveRecipients(context, recipientTypes) {
    const result = { student: [], instructors: [], admins: [] };
    const wanted = normalizeRecipients(recipientTypes);
    const addUsers = async (type, ids) => {
      for (const userId of [...new Set(ids.filter(Boolean))]) {
        const [user, profile] = await Promise.all([
          users.get({ userId }).catch(() => null),
          collections.profiles
            ? databases
                .listDocuments(databaseId, collections.profiles, [
                  sdk.Query.equal("user_id", [userId]),
                  sdk.Query.limit(1),
                ])
                .then((page) => page.documents?.[0] || null)
                .catch(() => null)
            : null,
        ]);
        if (user)
          result[type].push({
            userId,
            name: profile?.full_name || user.name || user.email || userId,
            email: user.email || profile?.email || "",
            phone: profile?.phone || "",
          });
      }
    };
    if (wanted.includes("student"))
      await addUsers("student", [context.student.id]);
    if (wanted.includes("instructors"))
      await addUsers(
        "instructors",
        await linkedInstructorIds(context.student.id, context.event),
      );
    if (wanted.includes("admins"))
      await addUsers("admins", await listAdminUserIds());
    return result;
  }

  async function simulation(actorUserId, automationId, studentUserId) {
    const automation = await getAutomation(actorUserId, automationId);
    const context = await buildStudentContext(clean(studentUserId));
    const recipients = await resolveRecipients(context, [
      "student",
      "instructors",
      "admins",
    ]);
    const triggerMatched = evaluateTrigger(automation, context);
    const conditionsMatched = evaluateConditionTree(
      automation.conditions,
      context,
    );
    const warnings = [];
    if (!context.contact.has_email) warnings.push("Aluno sem email.");
    if (!context.contact.has_phone) warnings.push("Aluno sem telefone.");
    if (!context.contact.has_push)
      warnings.push("Aluno sem dispositivo push inscrito.");
    if (!context.contact.has_instructor)
      warnings.push("Aluno sem instrutor vinculado.");
    return {
      studentUserId,
      studentName: context.student.name,
      matched: triggerMatched && conditionsMatched,
      triggerMatched,
      conditionsMatched,
      context,
      recipients,
      warnings,
    };
  }

  async function getState(automationId, studentUserId) {
    if (!collections.states) return null;
    const key = `${automationId}:${studentUserId}`;
    const result = await databases.listDocuments(
      databaseId,
      collections.states,
      [sdk.Query.equal("state_key", [key]), sdk.Query.limit(1)],
    );
    return result.documents?.[0] || null;
  }

  async function upsertState(automationId, studentUserId, patch) {
    if (!collections.states) return null;
    const existing = await getState(automationId, studentUserId);
    const data = {
      automation_id: automationId,
      student_user_id: studentUserId,
      state_key: `${automationId}:${studentUserId}`,
      ...patch,
    };
    return existing
      ? databases.updateDocument(
          databaseId,
          collections.states,
          existing.$id,
          data,
        )
      : databases.createDocument(
          databaseId,
          collections.states,
          sdk.ID.unique(),
          data,
          adminPerms,
        );
  }

  async function shouldRun(
    automation,
    studentUserId,
    matched,
    value,
    uniqueKey = "",
  ) {
    const state = await getState(automation.id, studentUserId);
    const now = Date.now();
    const decision = decideStateRun({
      eventTrigger: EVENT_TRIGGERS.has(automation.triggerType),
      matched,
      state,
      now,
      uniqueKey,
    });
    const run = decision.run;
    await upsertState(automation.id, studentUserId, {
      last_match: matched,
      armed: decision.armed,
      last_value_json: JSON.stringify({ value, uniqueKey }),
      updated_at: nowIso(),
      ...(run
        ? {
            last_triggered_at: nowIso(),
            cooldown_until: new Date(
              now + automation.cooldownMinutes * 60000,
            ).toISOString(),
          }
        : {}),
    });
    return run;
  }

  async function createStepLog(run, step, index, values = {}) {
    const now = nowIso();
    return databases.createDocument(
      databaseId,
      collections.stepRuns,
      sdk.ID.unique(),
      {
        run_id: run.$id,
        automation_id: run.automation_id,
        step_id: step.id,
        step_index: index,
        step_type: step.type,
        recipient_user_id: values.recipientUserId || null,
        recipient_label: values.recipientLabel || null,
        channel: step.type,
        status: values.status || "pending",
        provider_message_id: values.providerMessageId || null,
        resolved_content_json: JSON.stringify(
          values.resolvedContent || {},
        ).slice(0, 32768),
        error: values.error ? clean(values.error).slice(0, 2048) : null,
        duration_ms: values.durationMs ?? null,
        created_at: now,
        completed_at: values.completedAt || null,
      },
      adminPerms,
    );
  }

  async function scheduleResume(run, automation, step, index) {
    const minutes = waitMinutes(step);
    const dueAt = new Date(Date.now() + minutes * 60000);
    dueAt.setSeconds(0, 0);
    if (dueAt.getTime() <= Date.now() + 30000)
      dueAt.setMinutes(dueAt.getMinutes() + 1);
    const token = crypto.randomUUID();
    const job = await databases.createDocument(
      databaseId,
      collections.jobs,
      sdk.ID.unique(),
      {
        run_id: run.$id,
        automation_id: automation.id,
        status: "scheduled",
        due_at: dueAt.toISOString(),
        step_index: index + 1,
        execution_id: null,
        token_hash: crypto.createHash("sha256").update(token).digest("hex"),
        created_at: nowIso(),
        completed_at: null,
      },
      adminPerms,
    );
    const execution = await functions.createExecution({
      functionId,
      body: JSON.stringify({
        action: "resumeStudentAutomation",
        jobId: job.$id,
        token,
      }),
      async: true,
      scheduledAt: dueAt.toISOString(),
    });
    await databases.updateDocument(databaseId, collections.jobs, job.$id, {
      execution_id: execution.$id,
    });
    await createStepLog(run, step, index, {
      status: "scheduled",
      resolvedContent: {
        amount: step.amount,
        unit: step.unit,
        dueAt: dueAt.toISOString(),
      },
      completedAt: nowIso(),
    });
    await databases.updateDocument(databaseId, collections.runs, run.$id, {
      status: "waiting",
      current_step: index + 1,
    });
  }

  async function executeMessageStep(
    run,
    automation,
    step,
    index,
    context,
    testMode,
  ) {
    const recipientsByType = await resolveRecipients(context, step.recipients);
    const recipients = Object.values(recipientsByType).flat();
    let failed = 0;
    if (!recipients.length) {
      await createStepLog(run, step, index, {
        status: "skipped",
        error: "Nenhum destinatário resolvido.",
        completedAt: nowIso(),
      });
      return { failed: 0 };
    }
    let template = null;
    if (step.type === "email")
      template = mapTemplate(
        await databases.getDocument(
          databaseId,
          collections.templates,
          step.templateId,
        ),
      );
    for (const recipient of recipients) {
      const started = Date.now();
      try {
        let response;
        let resolvedContent;
        if (step.type === "email") {
          resolvedContent = {
            subject: `${testMode ? "[TESTE] " : ""}${renderVariables(template.subject, context)}`,
            html: renderVariables(template.bodyHtml, context),
            to: recipient.email,
          };
          response = recipient.email
            ? await withRetries(() =>
                sendEmail({
                  email: recipient.email,
                  subject: resolvedContent.subject,
                  html: resolvedContent.html,
                }),
              )
            : { status: "skipped", reason: "Destinatário sem email." };
        } else if (step.type === "push") {
          resolvedContent = {
            title: renderVariables(step.title, context),
            body: renderVariables(step.body, context),
            url: renderVariables(step.url || appUrl, context),
          };
          response = await withRetries(() =>
            sendPush(recipient.userId, resolvedContent),
          );
        } else {
          const headerParameters = step.headerVariables.map((value) =>
            renderVariables(value, context),
          );
          const bodyParameters = step.bodyVariables.map((value) =>
            renderVariables(value, context),
          );
          resolvedContent = {
            templateName: step.templateName,
            language: step.language,
            to: recipient.phone,
            headerParameters,
            bodyParameters,
          };
          response = recipient.phone
            ? await withRetries(() => sendWpp(resolvedContent))
            : { status: "skipped", reason: "Destinatário sem telefone." };
        }
        const status = response?.status === "skipped" ? "skipped" : "sent";
        await createStepLog(run, step, index, {
          recipientUserId: recipient.userId,
          recipientLabel: recipient.name,
          status,
          providerMessageId: response?.providerMessageId || null,
          resolvedContent,
          error: response?.reason || null,
          durationMs: Date.now() - started,
          completedAt: nowIso(),
        });
      } catch (error) {
        failed += 1;
        await createStepLog(run, step, index, {
          recipientUserId: recipient.userId,
          recipientLabel: recipient.name,
          status: "failed",
          error: error?.message || error,
          durationMs: Date.now() - started,
          completedAt: nowIso(),
        });
      }
    }
    return { failed };
  }

  async function continueRun(
    run,
    automation,
    context,
    startIndex = 0,
    testMode = false,
  ) {
    let failures = 0;
    for (let index = startIndex; index < automation.steps.length; index += 1) {
      const step = automation.steps[index];
      await databases.updateDocument(databaseId, collections.runs, run.$id, {
        current_step: index,
        status: "running",
      });
      if (step.type === "wait") {
        await scheduleResume(run, automation, step, index);
        return { waiting: true, failures };
      }
      if (step.type === "crm_status") {
        const started = Date.now();
        try {
          await changeCrmStatus(context.student.id, step.statusId, {
            runId: run.$id,
            chainDepth: toNumber(run.chain_depth) + 1,
          });
          await createStepLog(run, step, index, {
            status: "succeeded",
            resolvedContent: { statusId: step.statusId },
            durationMs: Date.now() - started,
            completedAt: nowIso(),
          });
          context.student.crm_status_id = step.statusId;
        } catch (error) {
          failures += 1;
          await createStepLog(run, step, index, {
            status: "failed",
            error: error?.message || error,
            durationMs: Date.now() - started,
            completedAt: nowIso(),
          });
        }
      } else {
        failures += (
          await executeMessageStep(
            run,
            automation,
            step,
            index,
            context,
            testMode,
          )
        ).failed;
      }
    }
    const status = failures ? "partial_failed" : "succeeded";
    await databases.updateDocument(databaseId, collections.runs, run.$id, {
      status,
      completed_at: nowIso(),
      current_step: automation.steps.length,
    });
    const definition = await databases
      .getDocument(databaseId, collections.automations, automation.id)
      .catch(() => null);
    if (definition)
      await databases
        .updateDocument(databaseId, collections.automations, automation.id, {
          last_run_at: nowIso(),
          run_count: toNumber(definition.run_count) + 1,
          success_count:
            toNumber(definition.success_count) + (failures ? 0 : 1),
          failure_count:
            toNumber(definition.failure_count) + (failures ? 1 : 0),
        })
        .catch(() => null);
    return { waiting: false, failures };
  }

  async function startRun(automation, studentUserId, context, options = {}) {
    if (toNumber(options.chainDepth) > 5) return null;
    const runId = sdk.ID.unique();
    const run = await databases.createDocument(
      databaseId,
      collections.runs,
      runId,
      {
        automation_id: automation.id,
        automation_name: automation.name,
        automation_version: automation.version,
        student_user_id: studentUserId,
        student_name: context.student.name,
        trigger_type: automation.triggerType,
        status: "running",
        current_step: 0,
        root_run_id: options.rootRunId || runId,
        chain_depth: Math.max(0, toNumber(options.chainDepth)),
        context_json: JSON.stringify(context).slice(0, 32768),
        flow_snapshot_json: JSON.stringify(automation).slice(0, 65535),
        error: null,
        started_at: nowIso(),
        completed_at: null,
        test_mode: options.testMode === true,
      },
      adminPerms,
    );
    await continueRun(run, automation, context, 0, options.testMode === true);
    return run;
  }

  async function testAutomation(actorUserId, automationId, studentUserId) {
    const automation = await getAutomation(actorUserId, automationId);
    const context = await buildStudentContext(clean(studentUserId));
    return startRun(automation, studentUserId, context, { testMode: true });
  }

  async function resume(jobId, token) {
    ensureConfigured("jobs", "runs");
    const job = await databases.getDocument(
      databaseId,
      collections.jobs,
      clean(jobId),
    );
    const tokenHash = crypto
      .createHash("sha256")
      .update(clean(token))
      .digest("hex");
    if (job.status !== "scheduled" || tokenHash !== job.token_hash)
      throw Object.assign(new Error("Retomada inválida ou já processada."), {
        status: 409,
      });
    const run = await databases.getDocument(
      databaseId,
      collections.runs,
      job.run_id,
    );
    const automation = mapAutomationFromSnapshot(run.flow_snapshot_json);
    const current = await databases
      .getDocument(databaseId, collections.automations, automation.id)
      .catch(() => null);
    if (!current || (current.status !== "active" && run.test_mode !== true)) {
      await databases.updateDocument(databaseId, collections.jobs, job.$id, {
        status: "cancelled",
        completed_at: nowIso(),
      });
      await databases.updateDocument(databaseId, collections.runs, run.$id, {
        status: "cancelled",
        completed_at: nowIso(),
        error: "Automação inativa.",
      });
      return { cancelled: true };
    }
    await databases.updateDocument(databaseId, collections.jobs, job.$id, {
      status: "completed",
      completed_at: nowIso(),
    });
    const context = parseJson(run.context_json, {});
    return continueRun(
      run,
      automation,
      context,
      toNumber(job.step_index),
      run.test_mode === true,
    );
  }

  function mapAutomationFromSnapshot(value) {
    const snapshot = parseJson(value, {});
    return {
      ...snapshot,
      conditions: normalizeConditions(snapshot.conditions),
      steps: normalizeSteps(snapshot.steps),
    };
  }

  async function evaluateOne(
    automation,
    studentUserId,
    eventType = null,
    eventContext = {},
    knownStudent = null,
    options = {},
  ) {
    const enrichedEvent = { ...eventContext };
    if (
      eventType === "flight.status_changed" &&
      !enrichedEvent.previous_status
    ) {
      const previousState = await getState(automation.id, studentUserId);
      const previousValue = parseJson(
        previousState?.last_value_json,
        {},
      )?.value;
      if (
        previousValue?.flightId === clean(enrichedEvent.$id || enrichedEvent.id)
      )
        enrichedEvent.previous_status = previousValue.status || "";
    }
    const context = await buildStudentContext(
      studentUserId,
      enrichedEvent,
      knownStudent,
    );
    const matched =
      evaluateTrigger(automation, context, eventType) &&
      evaluateConditionTree(automation.conditions, context);
    const entityId = clean(
      enrichedEvent.$id || enrichedEvent.id || studentUserId,
    );
    const eventValue =
      eventType === "flight.status_changed"
        ? clean(enrichedEvent.flight_status)
        : eventType === "student.crm_status_changed"
          ? clean(enrichedEvent.status_id)
          : "event";
    const uniqueKey = `${eventType || automation.triggerType}:${entityId}:${eventValue}`;
    if (
      !options.force &&
      !(await shouldRun(
        automation,
        studentUserId,
        matched,
        triggerValue(automation, context),
        uniqueKey,
      ))
    )
      return null;
    return startRun(automation, studentUserId, context, options);
  }

  async function processEvent(eventName, payload) {
    ensureConfigured("automations", "runs", "stepRuns");
    const event = clean(eventName).toLowerCase();
    let eventTypes = [];
    let studentUserId = clean(payload?.student_user_id || payload?.user_id);
    const isCollection = (collectionId) =>
      collectionId &&
      event.includes(`collections.${String(collectionId).toLowerCase()}.`);
    if (isCollection(collections.flights) && event.endsWith(".create"))
      eventTypes = [
        "flight.created",
        "schedule.no_future_flight",
        "schedule.next_flight_in",
      ];
    if (isCollection(collections.flights) && event.endsWith(".update")) {
      eventTypes = [
        "flight.status_changed",
        "schedule.no_future_flight",
        "schedule.next_flight_in",
      ];
      if (payload?.flight_status === "Realizado")
        eventTypes.push(
          "flight.completed",
          "flight.solo_completed",
          "training.progress_reached",
          "credits.balance_crossed",
        );
    }
    if (isCollection(collections.studentTracks))
      eventTypes = ["training.track_changed", "training.progress_reached"];
    if (isCollection(collections.credits))
      eventTypes = ["credits.balance_crossed", "credits.expiring"];
    if (isCollection(collections.crmProfiles)) {
      eventTypes = ["student.crm_status_changed"];
      studentUserId = clean(payload?.student_user_id);
    }
    if (
      isCollection(collections.profiles) &&
      event.endsWith(".create") &&
      clean(payload?.role) === "aluno"
    )
      eventTypes = ["student.created"];
    if (!studentUserId || !eventTypes.length) return { processed: 0 };
    const definitions = (
      await listAll(collections.automations, [
        sdk.Query.equal("school_id", [schoolId]),
        sdk.Query.equal("status", ["active"]),
      ])
    ).map(mapAutomation);
    let processed = 0;
    for (const type of eventTypes) {
      for (const automation of definitions.filter(
        (item) => item.triggerType === type,
      )) {
        const chainDepth = toNumber(payload?.chain_depth);
        if (chainDepth > 5) continue;
        const run = await evaluateOne(
          automation,
          studentUserId,
          type,
          payload,
          null,
          { rootRunId: payload?.origin_run_id || null, chainDepth },
        ).catch(() => null);
        if (run) processed += 1;
      }
    }
    return { processed };
  }

  async function periodicScan() {
    ensureConfigured("automations", "runs", "stepRuns");
    const definitions = (
      await listAll(collections.automations, [
        sdk.Query.equal("school_id", [schoolId]),
        sdk.Query.equal("status", ["active"]),
      ])
    )
      .map(mapAutomation)
      .filter((item) => PERIODIC_TRIGGERS.has(item.triggerType));
    if (!definitions.length) return { evaluated: 0, started: 0 };
    const progress = await getStudentsProgress({
      today: todayLocal(),
      inactiveDays: 365,
    });
    let evaluated = 0;
    let started = 0;
    for (const student of progress.students || []) {
      for (const automation of definitions) {
        evaluated += 1;
        const run = await evaluateOne(
          automation,
          student.userId,
          null,
          {},
          student,
        ).catch(() => null);
        if (run) started += 1;
      }
    }
    return { evaluated, started };
  }

  async function listRuns(actorUserId, filters = {}) {
    await requireAdmin(actorUserId);
    ensureConfigured("runs");
    const queries = [
      sdk.Query.orderDesc("started_at"),
      sdk.Query.limit(Math.max(1, Math.min(100, toNumber(filters.limit, 50)))),
    ];
    if (filters.automationId)
      queries.push(
        sdk.Query.equal("automation_id", [clean(filters.automationId)]),
      );
    if (filters.studentUserId)
      queries.push(
        sdk.Query.equal("student_user_id", [clean(filters.studentUserId)]),
      );
    if (filters.status)
      queries.push(sdk.Query.equal("status", [clean(filters.status)]));
    if (filters.channel && collections.stepRuns) {
      const stepDocs = await listAll(collections.stepRuns, [
        sdk.Query.equal("channel", [clean(filters.channel)]),
      ]);
      const runIds = [
        ...new Set(stepDocs.map((doc) => doc.run_id).filter(Boolean)),
      ].slice(0, 100);
      if (!runIds.length) return { runs: [], total: 0 };
      queries.push(sdk.Query.equal("$id", runIds));
    }
    const page = await databases.listDocuments(
      databaseId,
      collections.runs,
      queries,
    );
    return { runs: (page.documents || []).map(mapRun), total: page.total || 0 };
  }

  async function runDetail(actorUserId, id) {
    await requireAdmin(actorUserId);
    const run = await databases.getDocument(
      databaseId,
      collections.runs,
      clean(id),
    );
    const steps = await listAll(collections.stepRuns, [
      sdk.Query.equal("run_id", [run.$id]),
      sdk.Query.orderAsc("step_index"),
    ]);
    return { run: mapRun(run), steps: steps.map(mapStepRun) };
  }

  function sampleContext() {
    return {
      student: {
        id: "sample",
        name: "João Silva",
        first_name: "João",
        email: "joao@example.com",
        phone: "5511999999999",
        crm_status: "Ativo",
      },
      training: { track_name: "Piloto Privado", progress_percent: 45 },
      activity: { days_without_flight: 14, last_flight_date: "2026-06-09" },
      credits: { balance_hours: 8.5 },
      flight: {
        date: "2026-06-24",
        time: "09:00",
        status: "Confirmado",
        aircraft: "PS-ABC",
      },
      instructor: { name: "Maria Souza" },
      school: {
        name: clean(deps.schoolName) || "Escola",
        app_url: appUrl || "",
      },
    };
  }

  return {
    listAutomations,
    getAutomation,
    saveAutomation,
    duplicateAutomation,
    setAutomationStatus,
    deleteAutomation,
    simulation,
    testAutomation,
    listTemplates,
    saveTemplate,
    duplicateTemplate,
    deleteTemplate,
    sendTemplateTest,
    listStatuses,
    saveStatus,
    archiveStatus,
    listCrmProfiles,
    setCrmProfileStatus,
    listRuns,
    runDetail,
    resume,
    processEvent,
    periodicScan,
  };
}

module.exports = {
  EVENT_TRIGGERS,
  PERIODIC_TRIGGERS,
  compareValue,
  evaluateCondition,
  evaluateConditionTree,
  renderVariables,
  missionIsSolo,
  decideStateRun,
  validateAutomation,
  createStudentAutomationService,
};
