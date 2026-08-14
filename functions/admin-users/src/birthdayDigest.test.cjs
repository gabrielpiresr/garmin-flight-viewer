const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBirthdayDigestMessage,
  collectTodaysBirthdays,
  matchesBirthdayToday,
  schoolTodayIso,
  turningAge,
} = require("./birthdayDigest");

test("matchesBirthdayToday compares month-day and ignores year", () => {
  assert.equal(matchesBirthdayToday("1998-08-14", "2026-08-14"), true);
  assert.equal(matchesBirthdayToday("14/08/1998", "2026-08-14"), true);
  assert.equal(matchesBirthdayToday("1998-08-15", "2026-08-14"), false);
  assert.equal(matchesBirthdayToday("", "2026-08-14"), false);
});

test("Feb 29 is observed on Feb 28 in non-leap years", () => {
  assert.equal(matchesBirthdayToday("2000-02-29", "2026-02-28"), true);
  assert.equal(matchesBirthdayToday("2000-02-29", "2024-02-29"), true);
  assert.equal(matchesBirthdayToday("2000-02-29", "2024-02-28"), false);
});

test("collectTodaysBirthdays skips inactive, duplicates and empty dates", () => {
  const people = collectTodaysBirthdays(
    [
      { user_id: "a", full_name: "Ana", role: "aluno", birth_date: "2001-08-14", is_active: true },
      { user_id: "a", full_name: "Ana duplicada", role: "aluno", birth_date: "2001-08-14" },
      { user_id: "b", full_name: "Bruno", role: "instrutor", birth_date: "1990-08-14", is_active: false },
      { user_id: "c", full_name: "Carla", role: "admin", birth_date: "1988-01-01" },
      { user_id: "d", full_name: "Diego", role: "aluno" },
    ],
    "2026-08-14",
  );
  assert.deepEqual(
    people.map((person) => person.name),
    ["Ana"],
  );
  assert.equal(people[0].age, 25);
  assert.equal(people[0].role, "Aluno");
});

test("buildBirthdayDigestMessage stays silent-ready when empty and lists people otherwise", () => {
  const empty = buildBirthdayDigestMessage([], "2026-08-14", "https://app.example");
  assert.equal(empty.body, "");
  const message = buildBirthdayDigestMessage(
    [{ name: "Ana", role: "Aluno", age: 25 }],
    "2026-08-14",
    "https://app.example",
  );
  assert.equal(message.title, "Aniversariante de hoje");
  assert.match(message.intro, /14\/08\/2026/);
  assert.match(message.body, /Ana \(Aluno, 25 anos\)/);
});

test("schoolTodayIso uses America/Sao_Paulo", () => {
  const iso = schoolTodayIso(new Date("2026-08-14T11:00:00.000Z"), "America/Sao_Paulo");
  assert.equal(iso, "2026-08-14");
});

test("turningAge uses the year they complete today", () => {
  assert.equal(turningAge("2001-08-14", "2026-08-14"), 25);
  assert.equal(turningAge("bad", "2026-08-14"), null);
});
