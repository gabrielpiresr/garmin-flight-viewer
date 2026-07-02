/**
 * Testes unitários dos helpers de multi-role (espelham src/lib/rbac.ts).
 * Uso: npm run test:multi-role
 */

import test from "node:test";
import assert from "node:assert/strict";

const ROLE_PRIORITY = ["admin", "instrutor", "aluno"];
const VALID_ROLES = new Set(ROLE_PRIORITY);

function normalizeUserRole(value) {
  const role = String(value || "").toLowerCase();
  return VALID_ROLES.has(role) ? role : "aluno";
}

function normalizeUserRoles(value, fallback = "aluno") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeUserRole(item))
      .filter((role, index, arr) => arr.indexOf(role) === index);
    if (roles.length > 0) return roles;
  }
  if (typeof value === "string" && value.trim()) {
    return [normalizeUserRole(value)];
  }
  return [fallback];
}

function pickDefaultActiveRole(roles) {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? "aluno";
}

function getEffectiveRole(profile) {
  return normalizeUserRole(profile?.active_role || profile?.role);
}

function resolveProfileRoles(profile) {
  const legacyRole = normalizeUserRole(profile?.role);
  const roles = profile?.roles?.length ? normalizeUserRoles(profile.roles, legacyRole) : [legacyRole];
  const activeCandidate = getEffectiveRole(profile);
  const activeRole = roles.includes(activeCandidate) ? activeCandidate : pickDefaultActiveRole(roles);
  return { roles, activeRole };
}

test("getEffectiveRole prefere active_role sobre role legado", () => {
  assert.equal(getEffectiveRole({ role: "admin", active_role: "instrutor" }), "instrutor");
  assert.equal(getEffectiveRole({ role: "admin" }), "admin");
});

test("resolveProfileRoles usa role legado quando roles[] ausente", () => {
  assert.deepEqual(resolveProfileRoles({ role: "instrutor" }), {
    roles: ["instrutor"],
    activeRole: "instrutor",
  });
});

test("resolveProfileRoles respeita roles[] e active_role valido", () => {
  assert.deepEqual(
    resolveProfileRoles({ role: "admin", roles: ["admin", "instrutor"], active_role: "instrutor" }),
    { roles: ["admin", "instrutor"], activeRole: "instrutor" },
  );
});

test("resolveProfileRoles redefine active invalido para prioridade admin > instrutor > aluno", () => {
  assert.deepEqual(
    resolveProfileRoles({ role: "aluno", roles: ["admin", "aluno"], active_role: "instrutor" }),
    { roles: ["admin", "aluno"], activeRole: "admin" },
  );
});

test("normalizeUserRoles deduplica e fallback para aluno", () => {
  assert.deepEqual(normalizeUserRoles(["admin", "admin", "instrutor"]), ["admin", "instrutor"]);
  assert.deepEqual(normalizeUserRoles([]), ["aluno"]);
});
