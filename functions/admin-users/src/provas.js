const PROVA_ACTIONS = new Set([
  "releaseProva",
  "listMyProvas",
  "startProvaAttempt",
  "saveProvaProgress",
  "submitProvaAttempt",
  "getProvaAttempt",
  "listProvaAssignments",
  "getAdminProvaAttempt",
  "expireProvaAssignments",
]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function pointInPolygon(point, ring) {
  if (!point || !Array.isArray(ring) || ring.length < 3) return false;
  const px = point.lng ?? point.x;
  const py = point.lat ?? point.y;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const xi = current.lng ?? current.x;
    const yi = current.lat ?? current.y;
    const xj = previous.lng ?? previous.x;
    const yj = previous.lat ?? previous.y;
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function sanitizePayload(type, payload) {
  if (type === "mc") {
    return {
      options: Array.isArray(payload?.options)
        ? payload.options.map((option) => ({
            id: asString(option?.id),
            text: asString(option?.text),
            imageUrl: option?.imageUrl ? asString(option.imageUrl) : undefined,
          }))
        : [],
      imageUrls: Array.isArray(payload?.imageUrls) ? payload.imageUrls.map((url) => asString(url)).filter(Boolean) : [],
    };
  }
  if (type === "map") {
    const basemap = payload?.basemap === "sat" || payload?.basemap === "wac" ? payload.basemap : "map";
    return {
      center: payload?.center || { lat: -15.78, lng: -47.93 },
      zoom: asNumber(payload?.zoom, 6),
      layersOn: payload?.layersOn && typeof payload.layersOn === "object" ? payload.layersOn : {},
      basemap,
    };
  }
  return {
    imageUrl: asString(payload?.imageUrl),
  };
}

function revealPayload(type, payload) {
  if (type === "mc") return { correctOptionId: asString(payload?.correctOptionId) };
  if (type === "map") return { clickArea: payload?.clickArea || null };
  return { clickArea: payload?.clickArea || null };
}

function scoreAnswer(question, answer) {
  const payload = question.payload || {};
  if (question.type === "mc") {
    const optionId = answer?.optionId ?? null;
    return Boolean(optionId) && optionId === asString(payload.correctOptionId);
  }
  if (question.type === "map") {
    const latLng = answer?.latLng;
    const ring = Array.isArray(payload?.clickArea?.latLngs) ? payload.clickArea.latLngs : [];
    return Boolean(latLng) && pointInPolygon(latLng, ring);
  }
  const pct = answer?.pctPoint;
  const ring = Array.isArray(payload?.clickArea?.pctPoints) ? payload.clickArea.pctPoints : [];
  return Boolean(pct) && pointInPolygon(pct, ring);
}

function assignmentPermissions(sdk, studentUserId) {
  return [
    sdk.Permission.read(sdk.Role.user(studentUserId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

function attemptPermissions(sdk) {
  return [
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

function toAssignment(doc) {
  return {
    id: doc.$id,
    schoolId: asString(doc.school_id),
    provaId: asString(doc.prova_id),
    provaTitle: asString(doc.prova_title),
    provaDescription: asString(doc.prova_description),
    passingPercent: asNumber(doc.passing_percent, 70),
    timeLimitHours: asNumber(doc.time_limit_hours, 24),
    studentUserId: asString(doc.student_user_id),
    studentName: asString(doc.student_name),
    releasedAt: asString(doc.released_at),
    expiresAt: asString(doc.expires_at),
    status: asString(doc.status, "pending"),
    attemptId: doc.attempt_id ? asString(doc.attempt_id) : null,
    scorePercent: doc.score_percent == null ? null : asNumber(doc.score_percent),
    passed: typeof doc.passed === "boolean" ? doc.passed : null,
  };
}

function toAttempt(doc, { includeResults = false } = {}) {
  const status = asString(doc.status, "in_progress");
  const showResults = includeResults && (status === "submitted" || status === "expired");
  return {
    id: doc.$id,
    schoolId: asString(doc.school_id),
    assignmentId: asString(doc.assignment_id),
    provaId: asString(doc.prova_id),
    studentUserId: asString(doc.student_user_id),
    status,
    startedAt: asString(doc.started_at),
    submittedAt: doc.submitted_at ? asString(doc.submitted_at) : null,
    expiresAt: asString(doc.expires_at),
    questions: parseJson(doc.questions_json, []),
    answers: parseJson(doc.answers_json, {}),
    results: showResults ? parseJson(doc.results_json, []) : null,
    scorePercent: showResults && doc.score_percent != null ? asNumber(doc.score_percent) : null,
    passed: showResults && typeof doc.passed === "boolean" ? doc.passed : null,
  };
}

function createProvaService({
  databases,
  sdk,
  DATABASE_ID,
  PROFILES_COLLECTION_ID,
  requireAdmin,
  schoolId = "escola_principal",
}) {
  const COL = {
    provas: process.env.APPWRITE_PROVAS_COL_ID || process.env.VITE_APPWRITE_PROVAS_COL_ID || "provas",
    categories: process.env.APPWRITE_PROVA_CATEGORIES_COL_ID || "prova_categories",
    questions: process.env.APPWRITE_PROVA_QUESTIONS_COL_ID || "prova_questions",
    assignments: process.env.APPWRITE_PROVA_ASSIGNMENTS_COL_ID || "prova_assignments",
    attempts: process.env.APPWRITE_PROVA_ATTEMPTS_COL_ID || "prova_attempts",
  };

  async function listAll(collectionId, queries) {
    const out = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const res = await databases.listDocuments(DATABASE_ID, collectionId, [
        ...queries,
        sdk.Query.limit(limit),
        sdk.Query.offset(offset),
      ]);
      out.push(...res.documents);
      if (res.documents.length < limit) break;
      offset += limit;
    }
    return out;
  }

  async function profileName(userId) {
    if (!PROFILES_COLLECTION_ID || !userId) return "";
    try {
      const res = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
        sdk.Query.equal("user_id", userId),
        sdk.Query.limit(1),
      ]);
      const doc = res.documents[0];
      return asString(doc?.full_name || doc?.nickname || doc?.email);
    } catch {
      return "";
    }
  }

  function attemptDeadline(fromDate, hours) {
    const start = fromDate instanceof Date ? fromDate : new Date();
    const safeHours = Math.max(1, asNumber(hours, 24));
    return new Date(start.getTime() + safeHours * 3600 * 1000);
  }

  async function expireIfNeeded(assignment) {
    if (assignment.status === "submitted" || assignment.status === "expired") return assignment;
    // O prazo só corre depois que o aluno inicia. Liberada e ainda não começada não expira.
    if (assignment.status !== "in_progress") return assignment;

    const now = Date.now();
    const expires = Date.parse(asString(assignment.expires_at));
    if (!Number.isFinite(expires) || now <= expires) return assignment;

    if (assignment.status === "in_progress" && assignment.attempt_id) {
      try {
        await gradeAttempt(assignment.attempt_id, null, { expired: true, actorUserId: assignment.student_user_id });
        const fresh = await databases.getDocument(DATABASE_ID, COL.assignments, assignment.$id);
        return fresh;
      } catch {
        // fall through to expire flag
      }
    }

    const updated = await databases.updateDocument(DATABASE_ID, COL.assignments, assignment.$id, {
      status: "expired",
    });
    return updated;
  }

  async function gradeAttempt(attemptId, answers, { expired = false, actorUserId } = {}) {
    const attempt = await databases.getDocument(DATABASE_ID, COL.attempts, attemptId);
    if (actorUserId && attempt.student_user_id !== actorUserId) {
      throw httpError(403, "Tentativa de outro aluno.");
    }
    if (attempt.status === "submitted") {
      return { attempt: toAttempt(attempt, { includeResults: true }) };
    }

    const scoring = parseJson(attempt.scoring_json, []);
    const questions = parseJson(attempt.questions_json, []);
    const mergedAnswers = {
      ...parseJson(attempt.answers_json, {}),
      ...(answers && typeof answers === "object" ? answers : {}),
    };
    const results = questions.map((question) => {
      const bank = scoring.find((item) => item.id === question.id) || question;
      const answer = mergedAnswers[question.id] || null;
      const correct = scoreAnswer(bank, answer);
      return {
        questionId: question.id,
        correct,
        answer,
        correctReveal: revealPayload(question.type, bank.payload),
      };
    });
    const total = results.length || 1;
    const scorePercent = Math.round((results.filter((r) => r.correct).length / total) * 1000) / 10;
    const assignment = await databases.getDocument(DATABASE_ID, COL.assignments, attempt.assignment_id);
    const passingPercent = asNumber(assignment.passing_percent, 70);
    const passed = scorePercent >= passingPercent;
    const nowIso = new Date().toISOString();
    const status = expired ? "expired" : "submitted";

    const updatedAttempt = await databases.updateDocument(DATABASE_ID, COL.attempts, attemptId, {
      status,
      submitted_at: nowIso,
      answers_json: JSON.stringify(mergedAnswers),
      results_json: JSON.stringify(results),
      score_percent: scorePercent,
      passed,
    });
    await databases.updateDocument(DATABASE_ID, COL.assignments, assignment.$id, {
      status,
      score_percent: scorePercent,
      passed,
      attempt_id: attemptId,
    });
    return { attempt: toAttempt(updatedAttempt, { includeResults: true }) };
  }

  async function releaseProva(actorUserId, payload) {
    await requireAdmin(actorUserId);
    const provaId = asString(payload.provaId);
    const studentUserIds = Array.isArray(payload.studentUserIds)
      ? [...new Set(payload.studentUserIds.map((id) => asString(id)).filter(Boolean))]
      : [];
    if (!provaId) throw httpError(400, "Prova inválida.");
    if (!studentUserIds.length) throw httpError(400, "Selecione ao menos um aluno.");

    const prova = await databases.getDocument(DATABASE_ID, COL.provas, provaId);
    if (asString(prova.status) !== "published") throw httpError(400, "Publique a prova antes de liberar.");
    const hours = Math.max(1, asNumber(prova.time_limit_hours, 24));
    const releasedAt = new Date();
    const releasedIso = releasedAt.toISOString();

    let released = 0;
    for (const studentUserId of studentUserIds) {
      const studentName = await profileName(studentUserId);
      await databases.createDocument(
        DATABASE_ID,
        COL.assignments,
        sdk.ID.unique(),
        {
          school_id: asString(prova.school_id, schoolId),
          prova_id: provaId,
          prova_title: asString(prova.title),
          prova_description: asString(prova.description),
          passing_percent: asNumber(prova.passing_percent, 70),
          time_limit_hours: hours,
          student_user_id: studentUserId,
          student_name: studentName,
          released_at: releasedIso,
          expires_at: releasedIso,
          status: "pending",
          attempt_id: null,
          score_percent: null,
          passed: null,
        },
        assignmentPermissions(sdk, studentUserId),
      );
      released += 1;
    }
    return { released };
  }

  async function listMyProvas(actorUserId) {
    if (!actorUserId) throw httpError(401, "Autenticação necessária.");
    const docs = await listAll(COL.assignments, [
      sdk.Query.equal("student_user_id", actorUserId),
      sdk.Query.orderDesc("released_at"),
    ]);
    const assignments = [];
    for (const doc of docs) {
      const fresh = await expireIfNeeded(doc);
      assignments.push(toAssignment(fresh));
    }
    return { assignments };
  }

  async function startProvaAttempt(actorUserId, payload) {
    if (!actorUserId) throw httpError(401, "Autenticação necessária.");
    const assignmentId = asString(payload.assignmentId);
    if (!assignmentId) throw httpError(400, "Liberação inválida.");
    let assignment = await databases.getDocument(DATABASE_ID, COL.assignments, assignmentId);
    if (assignment.student_user_id !== actorUserId) throw httpError(403, "Essa prova não é sua.");
    assignment = await expireIfNeeded(assignment);
    if (assignment.status === "expired") throw httpError(400, "O prazo desta prova expirou.");
    if (assignment.status === "submitted") throw httpError(400, "Esta prova já foi realizada.");

    if (assignment.attempt_id) {
      const existing = await databases.getDocument(DATABASE_ID, COL.attempts, assignment.attempt_id);
      return { attempt: toAttempt(existing, { includeResults: false }) };
    }

    const categories = await listAll(COL.categories, [sdk.Query.equal("prova_id", assignment.prova_id), sdk.Query.orderAsc("order")]);
    const allQuestions = await listAll(COL.questions, [sdk.Query.equal("prova_id", assignment.prova_id)]);
    const drawn = [];
    for (const category of categories) {
      const pool = allQuestions.filter((q) => q.category_id === category.$id);
      const take = Math.min(Math.max(0, asNumber(category.draw_count, 0)), pool.length);
      drawn.push(
        ...shuffle(pool)
          .slice(0, take)
          .map((question) => ({
            id: question.$id,
            categoryId: category.$id,
            categoryName: asString(category.name),
            type: asString(question.type, "mc"),
            title: asString(question.title),
            description: asString(question.description),
            payload: parseJson(question.payload_json, {}),
          })),
      );
    }
    if (!drawn.length) throw httpError(400, "A prova não tem questões suficientes para sortear.");

    const sanitized = drawn.map((question) => ({
      id: question.id,
      categoryId: question.categoryId,
      categoryName: question.categoryName,
      type: question.type,
      title: question.title,
      description: question.description,
      payload: sanitizePayload(question.type, question.payload),
    }));
    const scoring = drawn.map((question) => ({
      id: question.id,
      type: question.type,
      payload: question.payload,
    }));

    const startedAt = new Date();
    const expiresAt = attemptDeadline(startedAt, assignment.time_limit_hours);
    const attempt = await databases.createDocument(
      DATABASE_ID,
      COL.attempts,
      sdk.ID.unique(),
      {
        school_id: asString(assignment.school_id, schoolId),
        assignment_id: assignment.$id,
        prova_id: assignment.prova_id,
        student_user_id: actorUserId,
        status: "in_progress",
        started_at: startedAt.toISOString(),
        submitted_at: null,
        expires_at: expiresAt.toISOString(),
        questions_json: JSON.stringify(sanitized),
        answers_json: "{}",
        results_json: "[]",
        scoring_json: JSON.stringify(scoring),
        score_percent: null,
        passed: null,
      },
      attemptPermissions(sdk),
    );
    await databases.updateDocument(DATABASE_ID, COL.assignments, assignment.$id, {
      status: "in_progress",
      attempt_id: attempt.$id,
      expires_at: expiresAt.toISOString(),
    });
    return { attempt: toAttempt(attempt, { includeResults: false }) };
  }

  async function saveProvaProgress(actorUserId, payload) {
    if (!actorUserId) throw httpError(401, "Autenticação necessária.");
    const attemptId = asString(payload.attemptId);
    if (!attemptId) throw httpError(400, "Tentativa inválida.");
    let attempt = await databases.getDocument(DATABASE_ID, COL.attempts, attemptId);
    if (attempt.student_user_id !== actorUserId) throw httpError(403, "Tentativa de outro aluno.");
    const assignment = await expireIfNeeded(await databases.getDocument(DATABASE_ID, COL.assignments, attempt.assignment_id));
    if (assignment.status === "expired") {
      const graded = await gradeAttempt(attemptId, payload.answers, { expired: true, actorUserId });
      return graded;
    }
    if (attempt.status !== "in_progress") {
      return { attempt: toAttempt(attempt, { includeResults: true }) };
    }
    const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
    attempt = await databases.updateDocument(DATABASE_ID, COL.attempts, attemptId, {
      answers_json: JSON.stringify(answers),
    });
    return { attempt: toAttempt(attempt, { includeResults: false }) };
  }

  async function submitProvaAttempt(actorUserId, payload) {
    if (!actorUserId) throw httpError(401, "Autenticação necessária.");
    return gradeAttempt(asString(payload.attemptId), payload.answers, { actorUserId });
  }

  async function getProvaAttempt(actorUserId, payload) {
    if (!actorUserId) throw httpError(401, "Autenticação necessária.");
    const attempt = await databases.getDocument(DATABASE_ID, COL.attempts, asString(payload.attemptId));
    if (attempt.student_user_id !== actorUserId) throw httpError(403, "Tentativa de outro aluno.");
    const includeResults = attempt.status === "submitted" || attempt.status === "expired";
    return { attempt: toAttempt(attempt, { includeResults }) };
  }

  async function listProvaAssignments(actorUserId, payload) {
    await requireAdmin(actorUserId);
    const queries = [sdk.Query.equal("school_id", schoolId), sdk.Query.orderDesc("released_at")];
    if (payload?.provaId) queries.push(sdk.Query.equal("prova_id", asString(payload.provaId)));
    const docs = await listAll(COL.assignments, queries);
    let assignments = [];
    for (const doc of docs) {
      const fresh = await expireIfNeeded(doc);
      assignments.push(toAssignment(fresh));
    }
    const search = asString(payload?.search).trim().toLowerCase();
    if (search) {
      assignments = assignments.filter(
        (row) =>
          row.studentName.toLowerCase().includes(search) ||
          row.provaTitle.toLowerCase().includes(search) ||
          row.studentUserId.toLowerCase().includes(search),
      );
    }
    return { assignments };
  }

  async function getAdminProvaAttempt(actorUserId, payload) {
    await requireAdmin(actorUserId);
    const attempt = await databases.getDocument(DATABASE_ID, COL.attempts, asString(payload.attemptId));
    return { attempt: toAttempt(attempt, { includeResults: true }) };
  }

  async function expireProvaAssignments(actorUserId) {
    if (actorUserId) await requireAdmin(actorUserId);
    const docs = await listAll(COL.assignments, [
      sdk.Query.equal("school_id", schoolId),
      sdk.Query.equal("status", ["pending", "in_progress"]),
    ]);
    let expired = 0;
    for (const doc of docs) {
      const fresh = await expireIfNeeded(doc);
      if (fresh.status === "expired") expired += 1;
    }
    return { expired };
  }

  async function handle(action, payload, actorUserId) {
    switch (action) {
      case "releaseProva":
        return releaseProva(actorUserId, payload);
      case "listMyProvas":
        return listMyProvas(actorUserId);
      case "startProvaAttempt":
        return startProvaAttempt(actorUserId, payload);
      case "saveProvaProgress":
        return saveProvaProgress(actorUserId, payload);
      case "submitProvaAttempt":
        return submitProvaAttempt(actorUserId, payload);
      case "getProvaAttempt":
        return getProvaAttempt(actorUserId, payload);
      case "listProvaAssignments":
        return listProvaAssignments(actorUserId, payload);
      case "getAdminProvaAttempt":
        return getAdminProvaAttempt(actorUserId, payload);
      case "expireProvaAssignments":
        return expireProvaAssignments(actorUserId);
      default:
        throw httpError(400, "Ação de prova inválida.");
    }
  }

  return { handle };
}

module.exports = { PROVA_ACTIONS, createProvaService };
