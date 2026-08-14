"use strict";

const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const WEEKDAYS = {
  MON: "segunda",
  TUE: "terça",
  WED: "quarta",
  THU: "quinta",
  FRI: "sexta",
  SAT: "sábado",
  SUN: "domingo",
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function hhmmToClock(hhmm) {
  const raw = String(hhmm || "").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function utcParts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function formatDateUtc(year, month, day) {
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

function formatDateTimeUtc(parts) {
  if (!parts) return "";
  return `${formatDateUtc(parts.year, parts.month, parts.day)} às ${pad2(parts.hour)}:${pad2(parts.minute)} UTC`;
}

function decodeNotamValidity(validFrom, validTo) {
  const from = utcParts(validFrom);
  const to = utcParts(validTo);
  if (from && to) return `De ${formatDateTimeUtc(from)} até ${formatDateTimeUtc(to)}`;
  if (from) return `A partir de ${formatDateTimeUtc(from)}`;
  if (to) return `Até ${formatDateTimeUtc(to)}`;
  return "";
}

function weekdayRangeLabel(from, to) {
  const a = WEEKDAYS[from];
  const b = WEEKDAYS[to];
  if (a && b) return `${a} a ${b}`;
  return "";
}

function joinDays(days, year, month) {
  if (!days.length) return "";
  if (days.length === 1) return `dia ${formatDateUtc(year, month, days[0])}`;
  const labels = days.map((day) => formatDateUtc(year, month, day));
  if (labels.length === 2) return `dias ${labels[0]} e ${labels[1]}`;
  return `dias ${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

function emitPeriod({ days, weekdays, daily, year, month, timeFrom, timeTo, special }) {
  const clock = timeFrom && timeTo ? `das ${hhmmToClock(timeFrom)} às ${hhmmToClock(timeTo)} UTC` : "";
  if (special) return clock ? `${special}, ${clock}` : special;
  const when = joinDays(days, year, month);
  if (when && clock) return `${when}, ${clock}`;
  if (weekdays.length && clock) return `${weekdays.join(", ")}, ${clock}`;
  if (daily && clock) return `todos os dias, ${clock}`;
  if (clock) return clock;
  if (when) return when;
  if (weekdays.length) return weekdays.join(", ");
  return "";
}

function decodeNotamSchedule(schedule, validFrom) {
  const raw = String(schedule || "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!raw) return "";

  const start = utcParts(validFrom);
  let year = start?.year || new Date().getUTCFullYear();
  let month = start?.month || 1;
  let lastDay = 0;
  let days = [];
  let weekdays = [];
  let daily = false;
  const parts = [];

  const tokens = raw.split(" ").filter(Boolean);
  const flush = (timeFrom, timeTo, special) => {
    const line = emitPeriod({ days, weekdays, daily, year, month, timeFrom, timeTo, special });
    if (line) parts.push(line);
    days = [];
    weekdays = [];
    daily = false;
  };

  for (const token of tokens) {
    if (MONTHS[token]) {
      month = MONTHS[token];
      continue;
    }
    if (token === "DLY") {
      daily = true;
      continue;
    }
    if (token === "H24") {
      flush("", "", "24 horas");
      continue;
    }
    if (token === "HJ" || token === "SR-SS" || token === "SRSS") {
      flush("", "", "do nascer ao pôr do sol");
      continue;
    }
    if (token === "HN" || token === "SS-SR" || token === "SSSR") {
      flush("", "", "do pôr do sol ao nascer");
      continue;
    }
    const wdRange = token.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN)-(MON|TUE|WED|THU|FRI|SAT|SUN)$/);
    if (wdRange) {
      const label = weekdayRangeLabel(wdRange[1], wdRange[2]);
      if (label) weekdays.push(label);
      continue;
    }
    if (WEEKDAYS[token]) {
      weekdays.push(WEEKDAYS[token]);
      continue;
    }
    const timeRange = token.match(/^(\d{4})-(\d{4})$/);
    if (timeRange) {
      flush(timeRange[1], timeRange[2], "");
      continue;
    }
    if (/^\d{1,2}$/.test(token)) {
      const day = Number(token);
      if (day >= 1 && day <= 31) {
        if (lastDay && day < lastDay) {
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
        lastDay = day;
        days.push(day);
      }
      continue;
    }
  }

  if (!parts.length && (days.length || weekdays.length || daily)) {
    flush("", "", "");
  }

  return parts.join("; ");
}

module.exports = {
  decodeNotamValidity,
  decodeNotamSchedule,
};
