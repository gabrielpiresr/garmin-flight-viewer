const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvaService } = require("./provas");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture() {
  const docs = {
    provas: [
      { $id: "published", school_id: "school", title: "Navegação", status: "published", payload_json: "private" },
      { $id: "draft", school_id: "school", status: "draft" },
      { $id: "other", school_id: "other-school", status: "published" },
    ],
    profiles: [
      { user_id: "student", school_id: "school", full_name: "Aluno" },
      { user_id: "other-student", school_id: "other-school", full_name: "Outro aluno" },
    ],
    prova_assignments: [],
    prova_attempts: [
      { $id: "attempt", school_id: "school", status: "submitted", results_json: "[]", questions_json: "[]" },
      { $id: "other-attempt", school_id: "other-school", status: "submitted" },
    ],
  };
  const writes = [];
  const reads = [];
  const query = (kind) => (...args) => ({ kind, args });
  const sdk = {
    Query: Object.fromEntries(["equal", "limit", "offset", "orderDesc"].map((key) => [key, query(key)])),
    ID: { unique: () => `assignment-${writes.length}` },
    Role: { user: (id) => `user:${id}`, label: (label) => `label:${label}` },
    Permission: Object.fromEntries(["read", "update", "delete"].map((key) => [key, (role) => `${key}:${role}`])),
  };
  const databases = {
    async listDocuments(_db, collection, queries) {
      reads.push(collection);
      let rows = docs[collection] || [];
      for (const { kind, args } of queries) {
        if (kind === "equal") rows = rows.filter((row) => [args[1]].flat().includes(row[args[0]]));
        if (kind === "offset") rows = rows.slice(args[0]);
        if (kind === "limit") rows = rows.slice(0, args[0]);
      }
      return { documents: rows };
    },
    async getDocument(_db, collection, id) {
      reads.push(collection);
      const doc = (docs[collection] || []).find((row) => row.$id === id);
      if (!doc) throw new Error("Document not found");
      return doc;
    },
    async createDocument(_db, collection, id, data, permissions) {
      const doc = { $id: id, ...data };
      docs[collection].push(doc);
      writes.push({ collection, data, permissions });
      return doc;
    },
  };
  const authorize = (allowed) => async (actor) => {
    if (!allowed.includes(actor)) throw Object.assign(new Error("Forbidden"), { status: actor ? 403 : 401 });
  };
  const searchCalls = [];
  const service = createProvaService({
    databases, sdk, DATABASE_ID: "db", PROFILES_COLLECTION_ID: "profiles", schoolId: "school",
    requireAdmin: authorize(["admin"]),
    requireInstructorOrAdmin: authorize(["admin", "instructor"]),
    searchStudents: async (actor, payload) => {
      searchCalls.push({ actor, payload });
      return [{ userId: "student", label: "Aluno" }];
    },
  });
  return { service, writes, reads, searchCalls };
}

for (const actor of ["admin", "instructor"]) {
  test(`${actor} can list published exams without reading questions or answers`, async () => {
    const { service, reads } = fixture();
    const { provas } = await service.handle("listProvasForRelease", {}, actor);
    assert.deepEqual(provas.map((row) => row.id), ["published"]);
    assert.equal(provas[0].payload_json, undefined);
    assert.deepEqual(reads, ["provas"]);
  });

  test(`${actor} can release and list a student's exam`, async () => {
    const { service, writes } = fixture();
    assert.deepEqual(await service.handle("releaseProva", {
      provaId: "published", studentUserIds: ["student", "student"],
    }, actor), { released: 1 });
    assert.equal(writes[0].data.student_name, "Aluno");
    assert.ok(writes[0].permissions.includes("read:user:student"));
    const { assignments } = await service.handle("listProvaAssignments", {}, actor);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].status, "pending");
  });
}

test("instructor can search students and view a completed correction", async () => {
  const { service, searchCalls } = fixture();
  const { students } = await service.handle("searchProvaStudents", { search: "Aluno" }, "instructor");
  assert.equal(students[0].userId, "student");
  assert.equal(searchCalls[0].actor, "instructor");
  const { attempt } = await service.handle("getAdminProvaAttempt", { attemptId: "attempt" }, "instructor");
  assert.equal(attempt.status, "submitted");
});

test("students and guests cannot use exam management actions", async () => {
  for (const actor of ["student", ""]) {
    for (const action of ["listProvasForRelease", "searchProvaStudents", "releaseProva", "listProvaAssignments", "getAdminProvaAttempt"]) {
      const { service, reads, writes } = fixture();
      await assert.rejects(service.handle(action, {}, actor), { status: actor ? 403 : 401 });
      assert.equal(reads.length, 0);
      assert.equal(writes.length, 0);
    }
  }
});

test("instructor cannot release drafts or exams from another school", async () => {
  for (const provaId of ["draft", "other"]) {
    const { service, writes } = fixture();
    await assert.rejects(service.handle("releaseProva", { provaId, studentUserIds: ["student"] }, "instructor"));
    assert.equal(writes.length, 0);
  }
});

test("release validates every target's school before creating assignments", async () => {
  const { service, writes } = fixture();
  await assert.rejects(service.handle("releaseProva", {
    provaId: "published", studentUserIds: ["student", "other-student"],
  }, "instructor"), { status: 400 });
  assert.equal(writes.length, 0);
});

test("instructor cannot view another school's attempt or run admin expiration", async () => {
  const { service } = fixture();
  await assert.rejects(service.handle("getAdminProvaAttempt", { attemptId: "other-attempt" }, "instructor"), { status: 403 });
  await assert.rejects(service.handle("expireProvaAssignments", {}, "instructor"), { status: 403 });
});

test("the production access guard honors the role's explicit Provas permission", async () => {
  const main = fs.readFileSync(require.resolve("./main.js"), "utf8");
  const guardSource = main.match(/async function requireProvaAccess\(actorUserId\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(guardSource, "Production Provas guard must exist");
  for (const enabled of [true, undefined, false]) {
    const context = vm.createContext({
      requireInstructorOrAdmin: async (id) => {
        if (id !== "instructor") throw Object.assign(new Error("Forbidden"), { status: 403 });
        return { id };
      },
      getProfileByUserId: async () => ({}),
      parseAssignedRoleSlugs: () => ["instrutor"],
      parseActiveRoleSlug: () => "instrutor",
      getTenantRoleDocBySlug: async () => ({ permissions_json: JSON.stringify({ tabs: { provas: enabled } }) }),
      parseRolePermissionsJson: JSON.parse,
    });
    const guard = vm.runInContext(`(${guardSource})`, context);
    if (enabled === false) await assert.rejects(guard("instructor"), { status: 403 });
    else assert.equal((await guard("instructor")).id, "instructor");
    await assert.rejects(guard("student"), { status: 403 });
  }
});
