function cleanString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function validateRootAccessPayload(payload = {}) {
  const adminEmail = normalizeEmail(payload.adminEmail);
  const studentEmail = normalizeEmail(payload.studentEmail);
  const password = String(payload.password || "");

  if (!adminEmail || !studentEmail || !password) {
    throw Object.assign(new Error("Informe adminEmail, studentEmail e password."), { status: 400 });
  }
  if (adminEmail === studentEmail) {
    throw Object.assign(new Error("O e-mail do admin e do aluno devem ser diferentes."), { status: 400 });
  }

  return { adminEmail, studentEmail, password };
}

function canImpersonateTargetRole(role) {
  return role === "aluno" || role === "instrutor";
}

function assertCanImpersonateTargetRole(role) {
  if (!canImpersonateTargetRole(role)) {
    throw Object.assign(new Error("Login root permitido apenas para acessar contas de alunos ou instrutores."), {
      status: 403,
    });
  }
}

module.exports = {
  assertCanImpersonateTargetRole,
  canImpersonateTargetRole,
  validateRootAccessPayload,
};
