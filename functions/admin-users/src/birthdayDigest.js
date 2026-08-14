"use strict";

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function clean(value) {
  return String(value ?? "").trim();
}

function schoolTodayIso(now = new Date(), timezone = process.env.SCHOOL_TIMEZONE || DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function normalizeBirthIso(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function birthMonthDay(value) {
  const iso = normalizeBirthIso(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(5, 10) : "";
}

function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function matchesBirthdayToday(birthDate, todayIso) {
  const md = birthMonthDay(birthDate);
  if (!md || !/^\d{4}-\d{2}-\d{2}$/.test(clean(todayIso))) return false;
  const todayMd = todayIso.slice(5, 10);
  if (md === todayMd) return true;
  return md === "02-29" && todayMd === "02-28" && !isLeapYear(todayIso.slice(0, 4));
}

function turningAge(birthDate, todayIso) {
  const birth = normalizeBirthIso(birthDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(clean(todayIso))) return null;
  const age = Number(todayIso.slice(0, 4)) - Number(birth.slice(0, 4));
  if (!Number.isFinite(age) || age < 1 || age > 120) return null;
  return age;
}

function roleLabel(profile) {
  const role = clean(profile?.active_role || profile?.role).toLowerCase();
  if (role === "instrutor") return "Instrutor";
  if (role === "admin") return "Admin";
  if (role === "aluno" || !role) return "Aluno";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function displayName(profile) {
  return clean(profile?.full_name || profile?.nickname || profile?.email) || "Sem nome";
}

function formatTodayBr(todayIso) {
  const iso = clean(todayIso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function collectTodaysBirthdays(profiles, todayIso) {
  const seen = new Set();
  const people = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (profile?.is_active === false) continue;
    if (!matchesBirthdayToday(profile?.birth_date, todayIso)) continue;
    const userId = clean(profile?.user_id);
    const key = userId || clean(profile?.$id) || `${displayName(profile)}:${birthMonthDay(profile?.birth_date)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const age = turningAge(profile?.birth_date, todayIso);
    people.push({
      userId,
      name: displayName(profile),
      role: roleLabel(profile),
      age,
      email: clean(profile?.email),
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return people;
}

function buildBirthdayDigestMessage(people, todayIso, appUrl) {
  const count = people.length;
  const dateLabel = formatTodayBr(todayIso);
  const singular = count === 1;
  const lines = people.map((person) => {
    const ageBit = person.age ? `, ${person.age} anos` : "";
    return `${person.name} (${person.role}${ageBit})`;
  });
  const title = singular ? "Aniversariante de hoje" : "Aniversariantes de hoje";
  const intro = singular
    ? `Hoje, ${dateLabel}, faz aniversário:`
    : `Hoje, ${dateLabel}, fazem aniversário ${count} pessoas:`;
  return {
    eyebrow: "Aniversários",
    title,
    intro,
    body: lines.join("\n"),
    details: people.map((person) => [
      person.name,
      person.age ? `${person.role} · ${person.age} anos` : person.role,
    ]),
    ctaLabel: "Abrir plataforma",
    url: appUrl || "",
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  birthMonthDay,
  buildBirthdayDigestMessage,
  collectTodaysBirthdays,
  formatTodayBr,
  matchesBirthdayToday,
  normalizeBirthIso,
  roleLabel,
  schoolTodayIso,
  turningAge,
};
