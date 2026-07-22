const SECURITY_MODES = Object.freeze({
  COMPAT: "compat",
  STRICT: "strict",
});

const PUBLIC_GUEST_ACTIONS = new Set([
  "createPublicLiabilityWaiverContract",
  "getEmailBrandSettings",
  "getOnboardingPublic",
  "getPublicFlightReviewShare",
  "getPublicProposal",
  "getReferralWelcome",
  "getReferAndEarnPublic",
  "getSchoolRules",
  "impersonateStudent",
  "lookupSagaAnacPerson",
]);

// Kept intentionally outside the first hardening pass to preserve current operations.
const LEGACY_GUEST_PASSTHROUGH_ACTIONS = new Set([
  "listSummaries",
  "notifyCaktoSaleEvent",
  "notifyStudentScheduleEvent",
  "registerSagaCancellationPenalty",
  "runFlightReminderScan",
  "sagaCancelScheduleDirect",
  "sagaListSchedulesDirect",
  "sagaUpsertScheduleDirect",
  "syncSagaScheduleEvent",
]);

function getSecurityMode(env = process.env) {
  return String(env.ADMIN_USERS_SECURITY_MODE || SECURITY_MODES.COMPAT).trim().toLowerCase() === SECURITY_MODES.STRICT
    ? SECURITY_MODES.STRICT
    : SECURITY_MODES.COMPAT;
}

function normalizeAction(action) {
  return String(action || "listSummaries").trim() || "listSummaries";
}

function authorizeGuestAction({ action, actorUserId, env = process.env } = {}) {
  const safeAction = normalizeAction(action);
  const mode = getSecurityMode(env);

  if (actorUserId) {
    return { allowed: true, mode, action: safeAction, category: "authenticated" };
  }

  if (PUBLIC_GUEST_ACTIONS.has(safeAction)) {
    return { allowed: true, mode, action: safeAction, category: "public" };
  }

  if (LEGACY_GUEST_PASSTHROUGH_ACTIONS.has(safeAction)) {
    return { allowed: true, mode, action: safeAction, category: "legacy-guest-passthrough" };
  }

  if (mode === SECURITY_MODES.COMPAT) {
    return { allowed: true, mode, action: safeAction, category: "compat-guest" };
  }

  return { allowed: false, mode, action: safeAction, category: "blocked-guest" };
}

function shouldLogGuestAction(decision) {
  if (!decision || decision.category === "authenticated") return false;
  return decision.category !== "public";
}

module.exports = {
  LEGACY_GUEST_PASSTHROUGH_ACTIONS,
  PUBLIC_GUEST_ACTIONS,
  SECURITY_MODES,
  authorizeGuestAction,
  getSecurityMode,
  normalizeAction,
  shouldLogGuestAction,
};
