"use strict";

const MEMBERKIT_API_BASE = "https://memberkit.com.br/api/v1";
const NAME_HINTS = [
  "naproa360",
  "naproa 360",
  "clube 360",
  "clube na proa",
  "na proa 360",
  "ta na proa",
];

let cachedAccessTarget = null;

function clean(value) {
  return String(value ?? "").trim();
}

function memberkitConfigured(env = process.env) {
  return Boolean(clean(env.MEMBERKIT_API_KEY));
}

function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameMatchesNaproa360(name) {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  const compact = normalized.replace(/\s+/g, "");
  return NAME_HINTS.some((hint) => {
    const hintNorm = normalizeName(hint);
    return normalized.includes(hintNorm) || compact === hintNorm.replace(/\s+/g, "");
  });
}

function parsePositiveInt(value) {
  const n = Number(clean(value));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function accessUntilMs(value) {
  const raw = clean(value);
  if (!raw) return 0;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function frcMembershipStillHasAccess(status, accessUntil, nowMs = Date.now()) {
  const normalized = clean(status).toLowerCase();
  if (normalized === "active" || normalized === "trial") return true;
  if (normalized === "canceled" && accessUntilMs(accessUntil) >= nowMs) return true;
  return false;
}

function desiredMemberkitStatus({ hasAccess, canceled = false, accessUntil = "" } = {}) {
  if (!hasAccess) return { status: "expired", expiresAt: "" };
  if (canceled) return { status: "active", expiresAt: clean(accessUntil) };
  return { status: "active", expiresAt: "" };
}

function parseJsonObject(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function memberkitSnapshot(metadata) {
  const parsed = parseJsonObject(metadata);
  return parsed.memberkit && typeof parsed.memberkit === "object" ? parsed.memberkit : {};
}

function classroomIdsKey(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b).join(",");
}

function alreadySynced(metadata, desired = {}, target = null) {
  const current = memberkitSnapshot(metadata);
  if (!current || clean(current.error)) return false;
  if (clean(current.status) !== clean(desired.status)) return false;
  if (clean(desired.status) === "active" && clean(current.expiresAt) !== clean(desired.expiresAt)) return false;
  if (target?.mode === "classroom" && classroomIdsKey(current.classroomIds) !== classroomIdsKey(target.classroomIds)) {
    return false;
  }
  if (target?.mode === "membership" && Number(current.membershipLevelId || 0) !== Number(target.membershipLevelId || 0)) {
    return false;
  }
  return true;
}

function mergeMemberkitMetadata(raw, patch = {}) {
  const parsed = parseJsonObject(raw);
  const previous = memberkitSnapshot(parsed);
  parsed.memberkit = {
    ...previous,
    status: clean(patch.status) || previous.status || "",
    userId: patch.userId ?? previous.userId ?? null,
    membershipLevelId: patch.membershipLevelId ?? previous.membershipLevelId ?? null,
    classroomIds: Array.isArray(patch.classroomIds) ? patch.classroomIds : previous.classroomIds || [],
    expiresAt: patch.expiresAt === undefined ? previous.expiresAt || "" : clean(patch.expiresAt),
    syncedAt: clean(patch.syncedAt) || new Date().toISOString(),
    error: patch.error === undefined ? "" : clean(patch.error).slice(0, 500),
    skipped: patch.skipped === true,
    reason: clean(patch.reason),
  };
  return JSON.stringify(parsed).slice(0, 8192);
}

function accessTargetFromEnv(env = process.env) {
  const membershipLevelId = parsePositiveInt(env.MEMBERKIT_NAPROA360_MEMBERSHIP_LEVEL_ID);
  if (membershipLevelId) return { mode: "membership", membershipLevelId, classroomIds: [] };
  const classroomId = parsePositiveInt(env.MEMBERKIT_NAPROA360_CLASSROOM_ID);
  if (classroomId) return { mode: "classroom", membershipLevelId: 0, classroomIds: [classroomId] };
  return null;
}

async function memberkitRequest(pathname, { method = "GET", body } = {}, env = process.env) {
  const apiKey = clean(env.MEMBERKIT_API_KEY);
  if (!apiKey) throw new Error("MEMBERKIT_API_KEY nao configurada.");
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${MEMBERKIT_API_BASE}${pathname}${separator}api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = clean(payload?.error || payload?.message || payload?.raw) || `HTTP ${response.status}`;
    throw new Error(`Memberkit ${method} ${pathname}: ${message}`);
  }
  return payload;
}

function pickMembershipLevel(levels) {
  return (Array.isArray(levels) ? levels : []).find((level) => nameMatchesNaproa360(level?.name)) || null;
}

function nameLooksLikeEpeac(name) {
  const normalized = normalizeName(name);
  return normalized === "epeac" || normalized.includes("epeac");
}

function pickClassroom(classrooms) {
  const matches = (Array.isArray(classrooms) ? classrooms : []).filter(
    (row) => nameMatchesNaproa360(row?.course_name) || nameMatchesNaproa360(row?.name) || nameLooksLikeEpeac(row?.name),
  );
  return matches.find((row) => nameLooksLikeEpeac(row?.name))
    || matches.find((row) => row?.master === true)
    || matches[0]
    || null;
}

async function resolveAccessTarget(env = process.env) {
  const fromEnv = accessTargetFromEnv(env);
  if (fromEnv) return fromEnv;
  if (cachedAccessTarget) return cachedAccessTarget;
  const levels = await memberkitRequest("/membership_levels", {}, env);
  const level = pickMembershipLevel(levels);
  if (level?.id) {
    cachedAccessTarget = { mode: "membership", membershipLevelId: Number(level.id), classroomIds: [] };
    return cachedAccessTarget;
  }
  const classrooms = await memberkitRequest("/classrooms", {}, env);
  const classroom = pickClassroom(classrooms);
  if (classroom?.id) {
    cachedAccessTarget = { mode: "classroom", membershipLevelId: 0, classroomIds: [Number(classroom.id)] };
    return cachedAccessTarget;
  }
  throw new Error("NAPROA360 nao encontrado na Memberkit (nem assinatura, nem turma).");
}

function buildUserPayload({ fullName, email, status, expiresAt, target }) {
  const payload = {
    full_name: clean(fullName) || clean(email),
    email: clean(email).toLowerCase(),
    status: clean(status) || "expired",
  };
  if (target?.mode === "membership" && target.membershipLevelId) {
    payload.membership_level_id = target.membershipLevelId;
  } else {
    payload.classroom_ids = Array.isArray(target?.classroomIds) ? target.classroomIds : [];
  }
  if (payload.status === "active" && clean(expiresAt)) payload.expires_at = clean(expiresAt);
  return payload;
}

async function expireStaleClassrooms({ fullName, email, previousClassroomIds, targetClassroomIds }, env = process.env) {
  const next = new Set((Array.isArray(targetClassroomIds) ? targetClassroomIds : []).map(Number));
  const stale = (Array.isArray(previousClassroomIds) ? previousClassroomIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0 && !next.has(id));
  for (const classroomId of stale) {
    try {
      await memberkitRequest("/users", {
        method: "POST",
        body: buildUserPayload({
          fullName,
          email,
          status: "expired",
          target: { mode: "classroom", classroomIds: [classroomId] },
        }),
      }, env);
    } catch {
      // Best-effort: still try to grant the new classroom.
    }
  }
}

async function upsertMemberkitUser({ fullName, email, status, expiresAt, previousClassroomIds }, env = process.env) {
  const target = await resolveAccessTarget(env);
  if (target.mode === "classroom") {
    await expireStaleClassrooms({
      fullName,
      email,
      previousClassroomIds,
      targetClassroomIds: target.classroomIds,
    }, env);
  }
  const user = await memberkitRequest("/users", {
    method: "POST",
    body: buildUserPayload({ fullName, email, status, expiresAt, target }),
  }, env);
  return { user, target };
}

async function syncMemberkitAccess(input = {}, env = process.env) {
  const email = clean(input.email).toLowerCase();
  const fullName = clean(input.fullName) || email;
  const desired = desiredMemberkitStatus(input);
  const now = new Date().toISOString();
  if (!memberkitConfigured(env)) {
    return { skipped: true, reason: "not_configured", memberkit: { ...desired, skipped: true, reason: "not_configured", syncedAt: now } };
  }
  if (!email || !email.includes("@")) {
    return {
      skipped: true,
      reason: "missing_email",
      memberkit: { ...desired, skipped: true, reason: "missing_email", error: "Aluno sem e-mail para a Memberkit.", syncedAt: now },
    };
  }
  let target = null;
  try {
    target = await resolveAccessTarget(env);
  } catch (err) {
    return {
      skipped: true,
      reason: "error",
      memberkit: { ...desired, skipped: true, reason: "error", error: clean(err?.message || err).slice(0, 500), syncedAt: now },
    };
  }
  if (alreadySynced(input.previousMetadata, desired, target)) {
    return { skipped: true, reason: "already_synced", memberkit: { ...desired, skipped: true, reason: "already_synced", syncedAt: now } };
  }
  try {
    const previous = memberkitSnapshot(input.previousMetadata);
    const previousClassroomIds = Array.isArray(previous.classroomIds) && previous.classroomIds.length
      ? previous.classroomIds
      : (clean(previous.status) === "active" ? [375638] : []);
    const { user, target: syncedTarget } = await upsertMemberkitUser({
      fullName,
      email,
      status: desired.status,
      expiresAt: desired.expiresAt,
      previousClassroomIds,
    }, env);
    target = syncedTarget;
    return {
      skipped: false,
      reason: "",
      memberkit: {
        status: desired.status,
        expiresAt: desired.expiresAt,
        userId: user?.id ?? null,
        membershipLevelId: target.membershipLevelId || null,
        classroomIds: target.classroomIds || [],
        skipped: false,
        reason: "",
        error: "",
        syncedAt: now,
      },
    };
  } catch (err) {
    return {
      skipped: true,
      reason: "error",
      memberkit: {
        ...desired,
        skipped: true,
        reason: "error",
        error: clean(err?.message || err).slice(0, 500),
        syncedAt: now,
      },
    };
  }
}

module.exports = {
  NAME_HINTS,
  alreadySynced,
  desiredMemberkitStatus,
  frcMembershipStillHasAccess,
  memberkitConfigured,
  mergeMemberkitMetadata,
  nameMatchesNaproa360,
  parseJsonObject,
  pickClassroom,
  pickMembershipLevel,
  resolveAccessTarget,
  syncMemberkitAccess,
  upsertMemberkitUser,
};
