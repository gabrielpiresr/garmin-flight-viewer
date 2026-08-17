const test = require("node:test");
const assert = require("node:assert/strict");
const {
  alreadySynced,
  desiredMemberkitStatus,
  frcMembershipStillHasAccess,
  mergeMemberkitMetadata,
  nameMatchesNaproa360,
  pickClassroom,
  pickMembershipLevel,
} = require("./memberkit");

test("matches Clube Na Proa 360 and compact NAPROA360 names", () => {
  assert.equal(nameMatchesNaproa360("Clube Na Proa 360"), true);
  assert.equal(nameMatchesNaproa360("NAPROA360"), true);
  assert.equal(nameMatchesNaproa360("Ta Na Proa 360"), true);
  assert.equal(nameMatchesNaproa360("Piloto Privado"), false);
});

test("picks NAPROA membership level by name when present", () => {
  const level = pickMembershipLevel([
    { id: 1, name: "Plano basico" },
    { id: 9, name: "Clube Na Proa 360" },
  ]);
  assert.equal(level.id, 9);
});

test("prefers the EPEAC classroom over master Turma A", () => {
  const classroom = pickClassroom([
    { id: 375638, name: "Turma A", course_name: "Clube Na Proa 360", master: true },
    { id: 386722, name: "EPEAC", course_name: "Clube Na Proa 360", master: false },
  ]);
  assert.equal(classroom.id, 386722);
});

test("keeps access after cancel until access_until, then expires", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(frcMembershipStillHasAccess("active", future), true);
  assert.equal(frcMembershipStillHasAccess("canceled", future), true);
  assert.equal(frcMembershipStillHasAccess("canceled", past), false);
  assert.equal(frcMembershipStillHasAccess("expired", future), false);
});

test("canceled FRC still in period sends active with expires_at", () => {
  const until = "2026-09-01T00:00:00.000Z";
  assert.deepEqual(desiredMemberkitStatus({ hasAccess: true, canceled: false, accessUntil: until }), {
    status: "active",
    expiresAt: "",
  });
  assert.deepEqual(desiredMemberkitStatus({ hasAccess: true, canceled: true, accessUntil: until }), {
    status: "active",
    expiresAt: until,
  });
  assert.deepEqual(desiredMemberkitStatus({ hasAccess: false, canceled: true, accessUntil: until }), {
    status: "expired",
    expiresAt: "",
  });
});

test("alreadySynced skips identical successful snapshots", () => {
  const metadata = mergeMemberkitMetadata("{}", {
    status: "active",
    expiresAt: "",
    error: "",
    userId: 1,
    classroomIds: [386722],
  });
  assert.equal(alreadySynced(metadata, { status: "active", expiresAt: "" }), true);
  assert.equal(alreadySynced(metadata, { status: "expired", expiresAt: "" }), false);
  assert.equal(alreadySynced(metadata, { status: "active", expiresAt: "2026-09-01T00:00:00.000Z" }), false);
  assert.equal(
    alreadySynced(metadata, { status: "active", expiresAt: "" }, { mode: "classroom", classroomIds: [386722] }),
    true,
  );
  assert.equal(
    alreadySynced(metadata, { status: "active", expiresAt: "" }, { mode: "classroom", classroomIds: [375638] }),
    false,
  );
});
