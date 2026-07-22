const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertCanImpersonateTargetRole,
  canImpersonateTargetRole,
  validateRootAccessPayload,
} = require("./rootAccessPolicy");

test("root access payload requires admin, target and password", () => {
  assert.throws(
    () => validateRootAccessPayload({ adminEmail: "admin@example.com", studentEmail: "aluno@example.com" }),
    /adminEmail, studentEmail e password/,
  );
});

test("root access normalizes emails and keeps password unchanged", () => {
  assert.deepEqual(
    validateRootAccessPayload({
      adminEmail: " ADMIN@Example.COM ",
      studentEmail: " Aluno@Example.COM ",
      password: "secret password",
    }),
    {
      adminEmail: "admin@example.com",
      studentEmail: "aluno@example.com",
      password: "secret password",
    },
  );
});

test("root access rejects same admin and target email", () => {
  assert.throws(
    () => validateRootAccessPayload({
      adminEmail: "same@example.com",
      studentEmail: " SAME@example.com ",
      password: "secret",
    }),
    /devem ser diferentes/,
  );
});

test("root impersonation allows only aluno and instrutor targets", () => {
  assert.equal(canImpersonateTargetRole("aluno"), true);
  assert.equal(canImpersonateTargetRole("instrutor"), true);
  assert.equal(canImpersonateTargetRole("admin"), false);
  assert.equal(canImpersonateTargetRole(""), false);
  assert.doesNotThrow(() => assertCanImpersonateTargetRole("aluno"));
  assert.throws(() => assertCanImpersonateTargetRole("admin"), /alunos ou instrutores/);
});
