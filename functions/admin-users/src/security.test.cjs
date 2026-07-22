const test = require("node:test");
const assert = require("node:assert/strict");
const {
  authorizeGuestAction,
  getSecurityMode,
  PUBLIC_GUEST_ACTIONS,
  SECURITY_MODES,
} = require("./security");

test("security mode defaults to compat and only strict opt-in enables strict", () => {
  assert.equal(getSecurityMode({}), SECURITY_MODES.COMPAT);
  assert.equal(getSecurityMode({ ADMIN_USERS_SECURITY_MODE: "compat" }), SECURITY_MODES.COMPAT);
  assert.equal(getSecurityMode({ ADMIN_USERS_SECURITY_MODE: "STRICT" }), SECURITY_MODES.STRICT);
  assert.equal(getSecurityMode({ ADMIN_USERS_SECURITY_MODE: "unexpected" }), SECURITY_MODES.COMPAT);
});

test("guest can access required public flows in strict mode", () => {
  for (const action of [
    "getPublicFlightReviewShare",
    "getPublicProposal",
    "createPublicLiabilityWaiverContract",
    "impersonateStudent",
  ]) {
    const decision = authorizeGuestAction({
      action,
      env: { ADMIN_USERS_SECURITY_MODE: "strict" },
    });
    assert.equal(decision.allowed, true, `${action} should be public`);
    assert.equal(decision.category, "public");
    assert.equal(PUBLIC_GUEST_ACTIONS.has(action), true);
  }
});

test("strict mode blocks non-public guest actions", () => {
  for (const action of [
    "createUser",
    "saveEmailSettings",
    "updateRole",
    "createCredit",
    "getDashboardSummary",
  ]) {
    const decision = authorizeGuestAction({
      action,
      env: { ADMIN_USERS_SECURITY_MODE: "strict" },
    });
    assert.equal(decision.allowed, false, `${action} should be blocked for guests`);
    assert.equal(decision.category, "blocked-guest");
  }
});

test("compat mode preserves legacy guest behavior for rollback", () => {
  const decision = authorizeGuestAction({
    action: "createUser",
    env: { ADMIN_USERS_SECURITY_MODE: "compat" },
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.category, "compat-guest");
});

test("authenticated users pass the central gate and keep downstream role guards", () => {
  const decision = authorizeGuestAction({
    action: "updateRole",
    actorUserId: "user-123",
    env: { ADMIN_USERS_SECURITY_MODE: "strict" },
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.category, "authenticated");
});

test("schedule/cakto legacy guest actions remain outside this hardening pass", () => {
  for (const action of ["notifyStudentScheduleEvent", "sagaUpsertScheduleDirect", "notifyCaktoSaleEvent"]) {
    const decision = authorizeGuestAction({
      action,
      env: { ADMIN_USERS_SECURITY_MODE: "strict" },
    });
    assert.equal(decision.allowed, true, `${action} should remain passthrough`);
    assert.equal(decision.category, "legacy-guest-passthrough");
  }
});
