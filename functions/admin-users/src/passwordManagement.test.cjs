const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the production functions without loading the live Appwrite client.
const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing function: ${start}`);
  return source.slice(from, to);
}
const importSource = extract("async function importSagaUser(", "\nfunction sagaRoundMoney");
const passwordSource = extract("async function updateAdminUserPassword(", "\nasync function updateRole(");
const permissionSource = extract("async function tenantRoleAllowsAction(", "\nasync function resolvePortalTypeForSlug(");
const adminSource = extract("async function requireAdmin(", "\nasync function requireInstructorOrAdmin(");
const cleanString = (value) => String(value || "").trim();

function importHarness({ exists = true } = {}) {
  const credentials = new Map(exists ? [["account", "Chosen-after-recovery!"]] : []);
  const current = { $id: "account", name: "Test Student", labels: ["aluno"] };
  const calls = [];
  const sandbox = {
    cleanString,
    sagaEmailLooksValid: (email) => email.includes("@"),
    sagaDocId: (prefix, id) => `${prefix}_${id}`,
    sagaTestEmailAlias: (email) => email,
    findAuthUserByEmail: async () => exists ? current : null,
    crypto: { randomBytes: () => ({ toString: () => "random-initial-password" }) },
    VALID_ROLES: new Set(["admin", "aluno", "instrutor"]),
    updateSagaProfileFields: async () => calls.push("profile"),
    users: {
      get: async () => { if (exists) return current; throw new Error("not found"); },
      create: async (input) => { credentials.set(input.userId, input.password); calls.push("create"); return { ...current, $id: input.userId }; },
      updateStatus: async (input) => ({ ...current, $id: input.userId }),
      updateName: async () => current,
      updatePassword: async (input) => { calls.push("password"); credentials.set(input.userId, input.password); },
      updateLabels: async () => calls.push("labels"),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${importSource}\nthis.importUser = importSagaUser;`, sandbox);
  const student = { id: "158", email: "student@example.test", nome: "Test Student", cpf: "123.456.789-01" };
  return { sandbox, student, credentials, calls };
}

test("repeated regular imports preserve a password chosen after recovery", async () => {
  const h = importHarness();
  for (let i = 0; i < 3; i++) await h.sandbox.importUser(h.student, "aluno");
  assert.equal(h.credentials.get("account"), "Chosen-after-recovery!");
  assert.equal(h.calls.includes("password"), false);
  assert.equal(h.calls.filter((call) => call === "profile").length, 3);
});

test("import preserves an admin-defined password on an explicitly linked account", async () => {
  const h = importHarness();
  h.credentials.set("account", "Defined-by-admin!");
  await h.sandbox.importUser(h.student, "aluno", { forceUserId: "account" });
  assert.equal(h.credentials.get("account"), "Defined-by-admin!");
  assert.equal(h.calls.includes("password"), false);
});

test("immutable sync still skips existing accounts", async () => {
  const h = importHarness();
  const result = await h.sandbox.importUser(h.student, "aluno", { createOnly: true });
  assert.equal(result.reason, "already_exists");
  assert.deepEqual(h.calls, []);
});

test("a newly imported account still receives its initial CPF password", async () => {
  const h = importHarness({ exists: false });
  const result = await h.sandbox.importUser(h.student, "aluno");
  assert.equal(result.created, true);
  assert.equal(h.credentials.get("saga_158"), "12345678901");
});

test("a newly imported account without a valid CPF receives a generated password", async () => {
  const h = importHarness({ exists: false });
  await h.sandbox.importUser({ ...h.student, cpf: "" }, "aluno");
  assert.equal(h.credentials.get("saga_158"), "random-initial-password");
});

function passwordHarness({ actorRole = "admin", activeSlug = "admin", canManage = true, actorSchool = "school", targetSchool = "school", targetExists = true, auditFails = false, updateError = null } = {}) {
  const calls = [];
  const audits = [];
  const actorProfile = { school_id: actorSchool, role: actorRole, active_role_slug: activeSlug };
  const sandbox = {
    cleanString, SCHOOL_ID: "school",
    getProfileByUserId: async (id) => id === "actor" ? actorProfile : targetExists ? { school_id: targetSchool } : null,
    resolveProfilePortal: async (profile) => profile?.role || "",
    deriveRoleFromLabels: () => "aluno",
    parseAssignedRoleSlugs: (profile) => [profile?.active_role_slug],
    parseActiveRoleSlug: (profile) => profile?.active_role_slug,
    getTenantRoleDocBySlug: async () => ({ permissions_json: JSON.stringify({ actions: { "users.manage": canManage } }) }),
    parseRolePermissionsJson: JSON.parse,
    users: {
      get: async (input) => { calls.push({ operation: "get", userId: input.userId }); return { labels: [], passwordUpdate: "old-date", password: "never-return-this-hash" }; },
      updatePassword: async (input) => { calls.push({ operation: "password", ...input }); if (updateError) throw updateError; return { passwordUpdate: "new-date", password: "never-return-this-hash" }; },
    },
    createAuditEvent: async (actor, event) => { audits.push({ actor, event }); if (auditFails) throw new Error("audit unavailable"); return { $id: "audit" }; },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${adminSource}\n${permissionSource}\n${passwordSource}\nthis.setPassword = updateAdminUserPassword;`, sandbox);
  return { sandbox, calls, audits };
}

test("guests and students cannot change passwords", async () => {
  for (const actor of ["", "actor"]) {
    const h = passwordHarness({ actorRole: "aluno", activeSlug: "aluno" });
    await assert.rejects(h.sandbox.setPassword(actor, "target", "New-secret!"), (err) => err.status === (actor ? 403 : 401));
    assert.equal(h.calls.some((call) => call.operation === "password"), false);
  }
});

test("an admin portal role needs explicit users.manage permission", async () => {
  const h = passwordHarness({ activeSlug: "custom-admin", canManage: false });
  await assert.rejects(h.sandbox.setPassword("actor", "target", "New-secret!"), (err) => err.status === 403);
  assert.equal(h.calls.some((call) => call.operation === "password"), false);
});

test("password changes cannot cross school boundaries", async () => {
  for (const options of [{ actorSchool: "other" }, { targetSchool: "other" }, { targetExists: false }]) {
    const h = passwordHarness(options);
    await assert.rejects(h.sandbox.setPassword("actor", "target", "New-secret!"), (err) => [403, 404].includes(err.status));
    assert.equal(h.calls.some((call) => call.operation === "password"), false);
  }
});

test("invalid password payloads and missing target are rejected before mutation", async () => {
  for (const password of [undefined, 12345678, "short", "        "]) {
    const h = passwordHarness();
    await assert.rejects(h.sandbox.setPassword("actor", "target", password), (err) => err.status === 400);
    assert.equal(h.calls.some((call) => call.operation === "password"), false);
  }
  const h = passwordHarness();
  await assert.rejects(h.sandbox.setPassword("actor", "", "New-secret!"), (err) => err.status === 400);
});

test("authorized change preserves the exact password and audits only metadata", async () => {
  const h = passwordHarness({ activeSlug: "custom-admin" });
  const secret = " New-secret! ";
  const result = await h.sandbox.setPassword("actor", "target", secret, { headers: { "x-real-ip": "127.0.0.1", "user-agent": "test-client" } });
  assert.equal(result.ok, true);
  assert.equal(result.auditRecorded, true);
  assert.equal(h.calls.find((call) => call.operation === "password").password, secret);
  assert.equal(h.audits[0].actor, "actor");
  assert.equal(h.audits[0].event.entityId, "target");
  assert.equal(h.audits[0].event.eventType, "admin_user_password_updated");
  assert.equal(h.audits[0].event.afterSnapshot.passwordUpdatedAt, "new-date");
  assert.equal(JSON.stringify({ result, audits: h.audits }).includes(secret), false);
  assert.equal(JSON.stringify({ result, audits: h.audits }).includes("never-return-this-hash"), false);
});

test("password policy errors keep their HTTP status and do not disclose credentials", async () => {
  const h = passwordHarness({ updateError: { code: 400, type: "password_pwned", message: "secret-in-upstream-error" } });
  await assert.rejects(h.sandbox.setPassword("actor", "target", "New-secret!"), (err) => err.status === 400 && !err.message.includes("secret-in-upstream-error"));
  assert.equal(h.audits.length, 0);
});

test("an audit failure reports a successful password change with a warning flag", async () => {
  const h = passwordHarness({ auditFails: true });
  const result = await h.sandbox.setPassword("actor", "target", "New-secret!");
  assert.equal(result.ok, true);
  assert.equal(result.auditRecorded, false);
  assert.equal(h.calls.filter((call) => call.operation === "password").length, 1);
});
