"use strict";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const HOUR_OPTIONS = [1, 2, 3];

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeIdent(value) {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatIdentDisplay(value) {
  const raw = clean(value).toUpperCase();
  if (/^[A-Z]{2}-[A-Z0-9]+$/.test(raw)) return raw;
  const ident = normalizeIdent(value);
  if (ident.length >= 5) return `${ident.slice(0, 2)}-${ident.slice(2)}`;
  return raw || ident;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function clock(minutes) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function parseClock(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 1440) return null;
  return minutes;
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weekStart(date) {
  const day = dayOfWeek(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function todayLocalIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatBrDate(iso) {
  const match = clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean(iso);
  return `${match[3]}/${match[2]}`;
}

function formatBrDateLong(iso) {
  const day = DAY_LABEL[dayOfWeek(iso)] || "";
  return `${day} ${formatBrDate(iso)}`.trim();
}

function escapeXml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sessionKey(userId) {
  return `wppBooking:${clean(userId)}`;
}

function isCancelCommand(text, responseId) {
  const candidates = [text, responseId].map(normalizeText).filter(Boolean);
  return candidates.some((value) =>
    ["cancelar", "sair", "book_cancel", "agendar_cancelar", "cancel"].includes(value),
  );
}

function parseBookingStart(text, responseId) {
  const candidates = [clean(responseId), clean(text)].filter(Boolean);
  for (const raw of candidates) {
    const normalized = normalizeText(raw);
    if (
      normalized === "agendar" ||
      normalized === "agendar voo" ||
      normalized === "agendar_voo" ||
      normalized === "book_start" ||
      normalized === "start_flight_booking"
    ) {
      return true;
    }
  }
  return false;
}

function isBookingButton(responseId) {
  const id = clean(responseId);
  return id.startsWith("book_") || id === "agendar_voo" || id === "start_flight_booking";
}

function parseHoursChoice(text, responseId) {
  const id = clean(responseId);
  const idMatch = id.match(/^book_h_([123])$/i);
  if (idMatch) return Number(idMatch[1]);
  const normalized = normalizeText(text);
  const textMatch = normalized.match(/^([123])\s*h(?:oras?)?$/);
  if (textMatch) return Number(textMatch[1]);
  if (normalized === "1" || normalized === "2" || normalized === "3") return Number(normalized);
  return null;
}

function parseWeekChoice(text, responseId) {
  const id = clean(responseId);
  const idMatch = id.match(/^book_w_(\d{4}-\d{2}-\d{2})$/i);
  if (idMatch) return idMatch[1];
  const textMatch = clean(text).match(/(\d{4}-\d{2}-\d{2})/);
  return textMatch ? textMatch[1] : null;
}

function parseDayChoice(text, responseId) {
  const id = clean(responseId);
  const idMatch = id.match(/^book_d_(\d{4}-\d{2}-\d{2})$/i);
  if (idMatch) return idMatch[1];
  const textMatch = clean(text).match(/(\d{4}-\d{2}-\d{2})/);
  return textMatch ? textMatch[1] : null;
}

function parseAircraftChoice(text, responseId) {
  const id = clean(responseId);
  const idMatch = id.match(/^book_ac_([A-Z0-9]+)$/i);
  if (idMatch) return normalizeIdent(idMatch[1]);
  const fromText = normalizeIdent(text);
  return fromText || null;
}

function parseTimeChoice(text, responseId) {
  const id = clean(responseId);
  const idMatch = id.match(/^book_t_(\d{2})-(\d{2})$/i);
  if (idMatch) return `${idMatch[1]}:${idMatch[2]}`;
  const textMatch = clean(text).match(/^(\d{1,2}):(\d{2})$/);
  if (!textMatch) return null;
  return clock(Number(textMatch[1]) * 60 + Number(textMatch[2]));
}

function newSession(partial = {}) {
  return {
    step: "hours",
    durationMinutes: null,
    weekStart: null,
    flightDate: null,
    aircraftIdent: null,
    startTime: null,
    presentationTime: null,
    notes: null,
    freeHoursMax: null,
    zeroCreditException: false,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    ...partial,
  };
}

function fleetAircrafts(calendar) {
  const rules = calendar?.rules || {};
  return (calendar?.aircrafts || []).filter((aircraft) => {
    if (aircraft?.isWaitlist) return false;
    if (isWaitlistIdent(rules, aircraft.registration)) return false;
    return true;
  });
}

/** Frota + lista de espera — só para desenhar a escala. */
function visibleAircrafts(calendar) {
  return Array.isArray(calendar?.aircrafts) ? calendar.aircrafts : [];
}

function isWaitlistAircraft(rules, aircraft) {
  if (aircraft?.isWaitlist) return true;
  return isWaitlistIdent(rules, aircraft?.registration);
}

function isWaitlistIdent(rules, registration) {
  const target = normalizeIdent(registration);
  if (!target) return false;
  const idents = Array.isArray(rules?.studentWaitlistAircraftIdents) ? rules.studentWaitlistAircraftIdents : [];
  return idents.some((ident) => normalizeIdent(ident) === target);
}

function occupiedIntervalsForDay(calendar, aircraftIdent, flightDate) {
  const target = normalizeIdent(aircraftIdent);
  const intervals = [];
  for (const flight of calendar?.flights || []) {
    if (clean(flight.status) === "Cancelado") continue;
    if (clean(flight.flightDate) !== flightDate) continue;
    if (normalizeIdent(flight.aircraftIdent) !== target) continue;
    const start = parseClock(flight.presentationTime || flight.startTime);
    const end = parseClock(flight.endTime || flight.cutoffTime || flight.startTime);
    if (start == null || end == null) continue;
    intervals.push({ start, end: Math.max(start + 1, end) });
  }
  const dow = dayOfWeek(flightDate);
  for (const slot of calendar?.blockedSlots || []) {
    if (normalizeIdent(slot.aircraftRegistration) !== target) continue;
    if (Number(slot.dayOfWeek) !== dow) continue;
    const start = Math.round(Number(slot.startHour) * 60);
    const end = Math.round(Number(slot.endHour) * 60);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    intervals.push({ start, end });
  }
  return intervals;
}

function buildStartSlotOptions(rules, flightDate) {
  const startTotalMin = parseClock(rules.scheduleStartTime || "06:00") ?? 6 * 60;
  const nightTotalMin = Math.round(Number(rules.nightFlightStartHour || 18) * 60);
  const slotMinutes = Math.max(5, Number(rules.slotMinutes) || 30);
  const opts = [];
  for (let totalMin = startTotalMin; totalMin < Math.min(nightTotalMin, 24 * 60); totalMin += slotMinutes) {
    opts.push({ value: clock(totalMin), isNight: false });
  }
  if (rules.allowNightFlights && nightTotalMin < 24 * 60) {
    const day = dayOfWeek(flightDate);
    const nights = Array.isArray(rules.nightBookingWeekdays) ? rules.nightBookingWeekdays : [];
    if (nights.includes(day)) opts.push({ value: clock(nightTotalMin), isNight: true });
  }
  return opts;
}

function slotFits(intervals, rules, flightDate, startMin, duration) {
  const nightStartMin = Math.round(Number(rules.nightFlightStartHour || 18) * 60);
  const bufferBefore = Number(rules.bufferBeforeMinutes) || 0;
  const bufferAfter = Number(rules.bufferAfterMinutes) || 0;
  const blockStart = startMin - bufferBefore;
  const blockEnd = startMin + duration + bufferAfter;
  if (blockStart < 0 || blockEnd >= 24 * 60) return false;
  const now = new Date();
  const today = todayLocalIso();
  if (flightDate === today && startMin <= now.getHours() * 60 + now.getMinutes()) return false;
  if (startMin < nightStartMin && startMin + duration > nightStartMin) return false;
  return !intervals.some((interval) => interval.start < blockEnd && interval.end > blockStart);
}

function durationAllowedForDate(rules, flightDate, durationMinutes) {
  const weekend = [0, 6].includes(dayOfWeek(flightDate));
  const minH = Number(weekend ? rules.weekendMinHours : rules.weekdayMinHours) || 1;
  const maxH = Number(weekend ? rules.weekendMaxHours : rules.weekdayMaxHours) || 3;
  const slot = Math.max(5, Number(rules.slotMinutes) || 30);
  if (durationMinutes % slot !== 0) return false;
  return durationMinutes >= minH * 60 && durationMinutes <= maxH * 60;
}

function freeStartsForAircraft(calendar, rules, aircraftIdent, flightDate, durationMinutes) {
  if (!durationAllowedForDate(rules, flightDate, durationMinutes)) return [];
  const leadDays = Math.max(0, Math.ceil(Number(rules.minBookingLeadDays) || 0));
  const minDate = addDays(todayLocalIso(), leadDays);
  if (flightDate < minDate) return [];
  const intervals = occupiedIntervalsForDay(calendar, aircraftIdent, flightDate);
  return buildStartSlotOptions(rules, flightDate)
    .filter((opt) => slotFits(intervals, rules, flightDate, parseClock(opt.value), durationMinutes))
    .map((opt) => opt.value);
}

function dayHasAnySlot(calendar, rules, flightDate, durationMinutes) {
  // Dia agendável se frota OU lista de espera tiver slot (espera conta como avião aqui).
  return visibleAircrafts(calendar).some(
    (aircraft) => freeStartsForAircraft(calendar, rules, aircraft.registration, flightDate, durationMinutes).length > 0,
  );
}

function aircraftsWithSlots(calendar, rules, flightDate, durationMinutes) {
  // Inclui lista de espera — ela é escolhível como um avião.
  return visibleAircrafts(calendar)
    .map((aircraft) => {
      const starts = freeStartsForAircraft(calendar, rules, aircraft.registration, flightDate, durationMinutes);
      return { ...aircraft, starts };
    })
    .filter((row) => row.starts.length > 0);
}

function nextWeekStarts(count = 3) {
  const current = weekStart(todayLocalIso());
  return Array.from({ length: count }, (_, index) => addDays(current, index * 7));
}

function weekDates(ws) {
  return Array.from({ length: 7 }, (_, index) => addDays(ws, index));
}

const AIRCRAFT_PALETTE = [
  { fill: "#0284c7", border: "#38bdf8" },
  { fill: "#059669", border: "#34d399" },
  { fill: "#7c3aed", border: "#a78bfa" },
  { fill: "#d97706", border: "#fbbf24" },
  { fill: "#0891b2", border: "#22d3ee" },
  { fill: "#c026d3", border: "#e879f9" },
  { fill: "#e11d48", border: "#fb7185" },
];

function aircraftColor(registration, index = 0) {
  const ident = normalizeIdent(registration);
  if (ident === "PSDZA") return { fill: "#7c3aed", border: "#a78bfa" };
  if (ident === "PSDZB") return { fill: "#7C8800", border: "#a3b31a" };
  return AIRCRAFT_PALETTE[index % AIRCRAFT_PALETTE.length];
}

function waitlistColor() {
  return { fill: "#475569", border: "#94a3b8" };
}

function colorForAircraft(rules, aircraft, index = 0) {
  if (isWaitlistAircraft(rules, aircraft)) return waitlistColor();
  return aircraftColor(aircraft?.registration, index);
}

/**
 * Recorta o bloco ao board do dia. Eventos multi-dia chegam com início 00:00 / fim 23:59
 * e sem clamp ultrapassavam o topo e o rodapé da imagem.
 */
function clampBlockOnBoard(presentationMin, endMin, startHour, boardH, rowH) {
  let p = Number(presentationMin);
  let e = Number(endMin);
  if (!Number.isFinite(p) || !Number.isFinite(e)) return null;
  p = Math.max(0, Math.min(1440, p));
  e = Math.max(0, Math.min(1440, e));
  if (e <= p) e = Math.min(1440, p + 30);
  const topPx = (p / 60 - startHour) * rowH;
  const endPx = (e / 60 - startHour) * rowH;
  const top = Math.max(0, topPx);
  const bottom = Math.min(boardH, endPx);
  if (bottom - top < 4) return null;
  return { top, height: bottom - top };
}

function scheduleHourRange(rules) {
  const startHour = Math.floor((parseClock(rules.scheduleStartTime || "06:00") ?? 360) / 60);
  const nightHour = Number(rules.nightFlightStartHour);
  const endHour = Math.min(23, Math.max(startHour + 1, Math.ceil((Number.isFinite(nightHour) ? nightHour : 18) + 2)));
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  return { startHour, endHour, hours, nightHour: Number.isFinite(nightHour) ? nightHour : 18 };
}

/** Igual à visão do aluno (privacyMode): próprio status / "Solicitado", demais "Ocupado". */
function flightCardLabel(flight) {
  if (flight?.isOwn) {
    return clean(flight.status) === "Pendente" ? "Solicitado" : clean(flight.status) || "Você";
  }
  return "Ocupado";
}

function presentationOfStart(startTime, rules) {
  const startMin = parseClock(startTime);
  if (startMin == null) return null;
  const bufferBefore = Number(rules.bufferBeforeMinutes) || 0;
  return clock(startMin - bufferBefore);
}

function startOfPresentation(presentationTime, rules) {
  const presentationMin = parseClock(presentationTime);
  if (presentationMin == null) return null;
  const bufferBefore = Number(rules.bufferBeforeMinutes) || 0;
  return clock(presentationMin + bufferBefore);
}

function freePresentationStarts(calendar, rules, aircraftIdent, flightDate, durationMinutes) {
  return freeStartsForAircraft(calendar, rules, aircraftIdent, flightDate, durationMinutes)
    .map((start) => presentationOfStart(start, rules))
    .filter(Boolean);
}

function countDaySlots(calendar, rules, flightDate, durationMinutes) {
  // Somente frota real — nunca lista de espera.
  return fleetAircrafts(calendar).reduce(
    (sum, aircraft) => sum + freeStartsForAircraft(calendar, rules, aircraft.registration, flightDate, durationMinutes).length,
    0,
  );
}

/** Escala semanal estilo print do sistema: dia × coluna por avião (inclui lista de espera). */
function buildWeekScaleSvg(calendar, rules, weekStartIso, durationMinutes) {
  const dates = weekDates(weekStartIso);
  const aircrafts = visibleAircrafts(calendar);
  const { startHour, hours, nightHour } = scheduleHourRange(rules);
  const colW = aircrafts.length ? 92 : 110;
  const rowH = 52;
  const leftGutter = 64;
  const dayHeaderH = 52;
  const acHeaderH = 44;
  const headerH = dayHeaderH + acHeaderH;
  const pad = 20;
  const titleH = 64;
  const legendH = 34;
  const colsPerDay = Math.max(1, aircrafts.length);
  const boardW = dates.length * colsPerDay * colW;
  const boardH = hours.length * rowH;
  const width = leftGutter + boardW + pad * 2;
  const height = titleH + legendH + headerH + boardH + pad;

  const dayHeaders = dates
    .map((date, dayIdx) => {
      const x = leftGutter + pad + dayIdx * colsPerDay * colW;
      const w = colsPerDay * colW;
      const dow = dayOfWeek(date);
      const today = date === todayLocalIso();
      return `
        <rect x="${x}" y="${titleH + legendH}" width="${w - 2}" height="${dayHeaderH - 4}" rx="8" fill="#1e293b" stroke="#38bdf84d"/>
        <text x="${x + w / 2}" y="${titleH + legendH + 18}" text-anchor="middle" fill="#94a3b8" font-size="13" font-weight="700" font-family="Segoe UI, Arial">${escapeXml((DAY_LABEL[dow] || "").toUpperCase())}</text>
        <circle cx="${x + w / 2}" cy="${titleH + legendH + 36}" r="11" fill="${today ? "#7dd3fc" : "transparent"}"/>
        <text x="${x + w / 2}" y="${titleH + legendH + 40}" text-anchor="middle" fill="${today ? "#0f172a" : "#e2e8f0"}" font-size="14" font-weight="700" font-family="Segoe UI, Arial">${Number(date.slice(8, 10))}</text>
      `;
    })
    .join("");

  const aircraftHeaders = dates
    .map((date, dayIdx) =>
      (aircrafts.length ? aircrafts : [{ registration: "—" }])
        .map((aircraft, acIdx) => {
          const x = leftGutter + pad + (dayIdx * colsPerDay + acIdx) * colW;
          const color = colorForAircraft(rules, aircraft, acIdx);
          const waitlist = isWaitlistAircraft(rules, aircraft);
          const ident = waitlist ? "Espera" : formatIdentDisplay(aircraft.registration);
          const flights = (calendar.flights || []).filter(
            (f) => f.flightDate === date && normalizeIdent(f.aircraftIdent) === normalizeIdent(aircraft.registration) && clean(f.status) !== "Cancelado",
          );
          const hoursSum = flights.reduce((sum, f) => sum + (Number(f.durationMinutes) || 0) / 60, 0);
          return `
            <rect x="${x + 1}" y="${titleH + legendH + dayHeaderH}" width="${colW - 4}" height="${acHeaderH - 4}" rx="6" fill="#0f172a"/>
            <rect x="${x + 8}" y="${titleH + legendH + dayHeaderH + 10}" width="10" height="10" rx="2" fill="${color.fill}" stroke="${color.border}"/>
            <text x="${x + colW / 2 + 4}" y="${titleH + legendH + dayHeaderH + 20}" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="700" font-family="Segoe UI, Arial">${escapeXml(ident)}</text>
            <text x="${x + colW / 2}" y="${titleH + legendH + dayHeaderH + 36}" text-anchor="middle" fill="#94a3b8" font-size="11" font-family="Segoe UI, Arial">${flights.length} voo${flights.length === 1 ? "" : "s"} · ${hoursSum.toFixed(1)}h</text>
          `;
        })
        .join(""),
    )
    .join("");

  const hourLabels = hours
    .map((hour, idx) => {
      const y = titleH + legendH + headerH + idx * rowH;
      return `
        <text x="${leftGutter + pad - 10}" y="${y + 18}" text-anchor="end" fill="#94a3b8" font-size="13" font-family="ui-monospace, Consolas, monospace">${hour}h</text>
      `;
    })
    .join("");

  const boards = dates
    .map((date, dayIdx) =>
      (aircrafts.length ? aircrafts : [{ registration: "—" }])
        .map((aircraft, acIdx) => {
          const x = leftGutter + pad + (dayIdx * colsPerDay + acIdx) * colW;
          const y0 = titleH + legendH + headerH;
          const isFirst = acIdx === 0;
          const past = date < todayLocalIso();
          const nightTop = Math.max(0, (nightHour - startHour) * rowH);
          const color = colorForAircraft(rules, aircraft, acIdx);
          const flights = (calendar.flights || []).filter(
            (f) => f.flightDate === date && normalizeIdent(f.aircraftIdent) === normalizeIdent(aircraft.registration) && clean(f.status) !== "Cancelado",
          );
          const blocked = (calendar.blockedSlots || []).filter(
            (s) => Number(s.dayOfWeek) === dayOfWeek(date) && normalizeIdent(s.aircraftRegistration) === normalizeIdent(aircraft.registration),
          );
          const flightBlocks = flights
            .map((flight) => {
              const p = parseClock(flight.presentationTime || flight.startTime);
              const e = parseClock(flight.endTime || flight.cutoffTime || flight.startTime);
              if (p == null || e == null) return "";
              const box = clampBlockOnBoard(p, e, startHour, boardH, rowH);
              if (!box) return "";
              const top = y0 + box.top;
              const h = box.height;
              const label = flightCardLabel(flight);
              const timeLabel = flight.presentationTime || flight.startTime || "";
              const showTime = h >= 28;
              return `
                <rect x="${x + 5}" y="${top}" width="${colW - 12}" height="${h}" rx="6" fill="${color.fill}" stroke="${color.border}" stroke-width="1.5"/>
                <text x="${x + 10}" y="${top + Math.min(16, h - 4)}" fill="#f8fafc" font-size="12" font-weight="700" font-family="Segoe UI, Arial">${escapeXml(label)}</text>
                ${showTime ? `<text x="${x + 10}" y="${top + 30}" fill="#e2e8f0" font-size="11" font-family="ui-monospace, Consolas, monospace">${escapeXml(timeLabel)}</text>` : ""}
              `;
            })
            .join("");
          const blockedBlocks = blocked
            .map((slot) => {
              const box = clampBlockOnBoard(
                Math.round(Number(slot.startHour) * 60),
                Math.round(Number(slot.endHour) * 60),
                startHour,
                boardH,
                rowH,
              );
              if (!box) return "";
              return `<rect x="${x + 3}" y="${y0 + box.top}" width="${colW - 8}" height="${box.height}" fill="#7f1d1d66"/>
                <text x="${x + colW / 2}" y="${y0 + box.top + 16}" text-anchor="middle" fill="#fecaca" font-size="11" font-family="Segoe UI, Arial">Bloqueado</text>`;
            })
            .join("");
          const hourLines = hours
            .map((_, idx) => `<line x1="${x}" y1="${y0 + idx * rowH}" x2="${x + colW - 2}" y2="${y0 + idx * rowH}" stroke="#33415566"/>`)
            .join("");
          return `
            <rect x="${x}" y="${y0}" width="${colW - 2}" height="${boardH}" rx="8" fill="#020617" stroke="#33415599"/>
            ${isFirst ? `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + boardH}" stroke="#38bdf855" stroke-width="2"/>` : ""}
            <rect x="${x}" y="${y0 + nightTop}" width="${colW - 2}" height="${Math.max(0, boardH - nightTop)}" fill="#1e1b4b40"/>
            ${hourLines}
            ${blockedBlocks}
            ${flightBlocks}
            ${past ? `<rect x="${x}" y="${y0}" width="${colW - 2}" height="${boardH}" fill="#02061788"/>` : ""}
          `;
        })
        .join(""),
    )
    .join("");

  const legendAircrafts = aircrafts.slice(0, 7)
    .map((aircraft, idx) => {
      const color = colorForAircraft(rules, aircraft, idx);
      const label = isWaitlistAircraft(rules, aircraft) ? "Espera" : formatIdentDisplay(aircraft.registration);
      const x = pad + idx * 110;
      return `
        <rect x="${x}" y="${titleH + 6}" width="12" height="12" rx="2" fill="${color.fill}" stroke="${color.border}"/>
        <text x="${x + 18}" y="${titleH + 16}" fill="#94a3b8" font-size="12" font-family="Segoe UI, Arial">${escapeXml(label)}</text>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="12" fill="#111827" stroke="#334155"/>
  <text x="${pad + 4}" y="30" fill="#e2e8f0" font-size="18" font-weight="700" font-family="Segoe UI, Arial">Escala da semana</text>
  <text x="${pad + 4}" y="52" fill="#94a3b8" font-size="14" font-family="Segoe UI, Arial">${escapeXml(formatBrDate(weekStartIso))} – ${escapeXml(formatBrDate(addDays(weekStartIso, 6)))} · voo de ${durationMinutes / 60}h</text>
  ${legendAircrafts}
  ${dayHeaders}
  ${aircraftHeaders}
  ${hourLabels}
  ${boards}
</svg>`;
}

/** Escala do dia estilo print: uma coluna por avião (inclui lista de espera). */
function buildDayScaleSvg(calendar, rules, flightDate, durationMinutes) {
  const rows = visibleAircrafts(calendar);
  const { startHour, hours, nightHour } = scheduleHourRange(rules);
  const colW = 110;
  const rowH = 48;
  const leftGutter = 64;
  const headerH = 66;
  const pad = 20;
  const titleH = 58;
  const legendH = 32;
  const boardH = hours.length * rowH;
  const width = leftGutter + Math.max(1, rows.length) * colW + pad * 2;
  const height = titleH + legendH + headerH + boardH + pad;

  const headers = rows
    .map((aircraft, idx) => {
      const x = leftGutter + pad + idx * colW;
      const color = colorForAircraft(rules, aircraft, idx);
      const waitlist = isWaitlistAircraft(rules, aircraft);
      const ident = waitlist ? "Espera" : formatIdentDisplay(aircraft.registration);
      const starts = freeStartsForAircraft(calendar, rules, aircraft.registration, flightDate, durationMinutes);
      const flights = (calendar.flights || []).filter(
        (f) => f.flightDate === flightDate && normalizeIdent(f.aircraftIdent) === normalizeIdent(aircraft.registration) && clean(f.status) !== "Cancelado",
      );
      const hoursSum = flights.reduce((sum, f) => sum + (Number(f.durationMinutes) || 0) / 60, 0);
      const slotLabel = starts.length
        ? `${starts.length} slot${starts.length === 1 ? "" : "s"}`
        : "sem vaga";
      return `
        <rect x="${x + 1}" y="${titleH + legendH}" width="${colW - 4}" height="${headerH - 6}" rx="8" fill="#1e293b" stroke="${starts.length ? "#34d39966" : "#334155"}"/>
        <rect x="${x + 12}" y="${titleH + legendH + 14}" width="12" height="12" rx="2" fill="${color.fill}" stroke="${color.border}"/>
        <text x="${x + colW / 2 + 4}" y="${titleH + legendH + 26}" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700" font-family="Segoe UI, Arial">${escapeXml(ident)}</text>
        <text x="${x + colW / 2}" y="${titleH + legendH + 44}" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="Segoe UI, Arial">${flights.length} voo${flights.length === 1 ? "" : "s"} · ${hoursSum.toFixed(1)}h</text>
        <text x="${x + colW / 2}" y="${titleH + legendH + 58}" text-anchor="middle" fill="${starts.length ? "#6ee7b7" : "#64748b"}" font-size="11" font-family="Segoe UI, Arial">${escapeXml(slotLabel)}</text>
      `;
    })
    .join("");

  const hourLabels = hours
    .map((hour, idx) => {
      const y = titleH + legendH + headerH + idx * rowH;
      return `<text x="${leftGutter + pad - 10}" y="${y + 18}" text-anchor="end" fill="#94a3b8" font-size="13" font-family="ui-monospace, Consolas, monospace">${hour}h</text>`;
    })
    .join("");

  const boards = rows
    .map((aircraft, idx) => {
      const x = leftGutter + pad + idx * colW;
      const y0 = titleH + legendH + headerH;
      const nightTop = Math.max(0, (nightHour - startHour) * rowH);
      const color = colorForAircraft(rules, aircraft, idx);
      const flights = (calendar.flights || []).filter(
        (f) => f.flightDate === flightDate && normalizeIdent(f.aircraftIdent) === normalizeIdent(aircraft.registration) && clean(f.status) !== "Cancelado",
      );
      const blocked = (calendar.blockedSlots || []).filter(
        (s) => Number(s.dayOfWeek) === dayOfWeek(flightDate) && normalizeIdent(s.aircraftRegistration) === normalizeIdent(aircraft.registration),
      );
      const flightBlocks = flights
        .map((flight) => {
          const p = parseClock(flight.presentationTime || flight.startTime);
          const e = parseClock(flight.endTime || flight.cutoffTime || flight.startTime);
          if (p == null || e == null) return "";
          const box = clampBlockOnBoard(p, e, startHour, boardH, rowH);
          if (!box) return "";
          const top = y0 + box.top;
          const h = box.height;
          const showTime = h >= 28;
          return `
            <rect x="${x + 6}" y="${top}" width="${colW - 14}" height="${h}" rx="6" fill="${color.fill}" stroke="${color.border}" stroke-width="1.5"/>
            <text x="${x + 12}" y="${top + Math.min(16, h - 4)}" fill="#fff" font-size="13" font-weight="700" font-family="Segoe UI, Arial">${escapeXml(flightCardLabel(flight))}</text>
            ${showTime ? `<text x="${x + 12}" y="${top + 32}" fill="#e2e8f0" font-size="12" font-family="ui-monospace, Consolas, monospace">${escapeXml(flight.presentationTime || flight.startTime || "")}</text>` : ""}
          `;
        })
        .join("");
      const blockedBlocks = blocked
        .map((slot) => {
          const box = clampBlockOnBoard(
            Math.round(Number(slot.startHour) * 60),
            Math.round(Number(slot.endHour) * 60),
            startHour,
            boardH,
            rowH,
          );
          if (!box) return "";
          return `<rect x="${x + 4}" y="${y0 + box.top}" width="${colW - 10}" height="${box.height}" fill="#7f1d1d66"/>
            <text x="${x + colW / 2}" y="${y0 + box.top + 16}" text-anchor="middle" fill="#fecaca" font-size="11" font-family="Segoe UI, Arial">Bloqueado</text>`;
        })
        .join("");
      const hourLines = hours
        .map((_, i) => `<line x1="${x}" y1="${y0 + i * rowH}" x2="${x + colW - 2}" y2="${y0 + i * rowH}" stroke="#33415566"/>`)
        .join("");
      return `
        <rect x="${x}" y="${y0}" width="${colW - 2}" height="${boardH}" rx="8" fill="#020617" stroke="#47556988"/>
        <rect x="${x}" y="${y0 + nightTop}" width="${colW - 2}" height="${Math.max(0, boardH - nightTop)}" fill="#1e1b4b40"/>
        ${hourLines}
        ${blockedBlocks}
        ${flightBlocks}
      `;
    })
    .join("");

  const legendAircrafts = rows.slice(0, 7)
    .map((aircraft, idx) => {
      const color = colorForAircraft(rules, aircraft, idx);
      const label = isWaitlistAircraft(rules, aircraft) ? "Espera" : formatIdentDisplay(aircraft.registration);
      const x = pad + idx * 110;
      return `
        <rect x="${x}" y="${titleH + 4}" width="12" height="12" rx="2" fill="${color.fill}" stroke="${color.border}"/>
        <text x="${x + 18}" y="${titleH + 14}" fill="#94a3b8" font-size="12" font-family="Segoe UI, Arial">${escapeXml(label)}</text>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="12" fill="#111827" stroke="#334155"/>
  <text x="${pad + 4}" y="30" fill="#e2e8f0" font-size="18" font-weight="700" font-family="Segoe UI, Arial">Escala do dia</text>
  <text x="${pad + 4}" y="52" fill="#94a3b8" font-size="14" font-family="Segoe UI, Arial">${escapeXml(formatBrDateLong(flightDate))} · voo de ${durationMinutes / 60}h</text>
  ${legendAircrafts}
  ${headers}
  ${hourLabels}
  ${boards}
</svg>`;
}

function summarizeWeekDays(calendar, rules, weekStartIso, durationMinutes) {
  return weekDates(weekStartIso).map((date) => {
    const freeStarts = countDaySlots(calendar, rules, date, durationMinutes);
    return {
      date,
      label: formatBrDateLong(date),
      freeStarts,
      // Dia disponível se frota OU espera tiver slot; a contagem exibida ignora a espera.
      hasSlot: dayHasAnySlot(calendar, rules, date, durationMinutes),
    };
  });
}

function hoursButtons() {
  return HOUR_OPTIONS.map((hours) => ({ id: `book_h_${hours}`, title: `${hours}h` }));
}

function weekButtons(weekStarts) {
  return weekStarts.map((ws) => ({
    id: `book_w_${ws}`,
    title: `${formatBrDate(ws)}–${formatBrDate(addDays(ws, 6))}`.slice(0, 20),
  }));
}

function dayButtons(daySummaries) {
  return daySummaries
    .filter((day) => day.hasSlot)
    .map((day) => ({
      id: `book_d_${day.date}`,
      title: `${DAY_LABEL[dayOfWeek(day.date)]} ${formatBrDate(day.date)}`.slice(0, 20),
    }));
}

function aircraftButtons(rows) {
  return rows.map((row) => ({
    id: `book_ac_${normalizeIdent(row.registration)}`,
    title: (row.isWaitlist ? "Espera" : formatIdentDisplay(row.registration)).slice(0, 20),
  }));
}

function timeButtons(presentationStarts) {
  return presentationStarts.map((start) => ({
    id: `book_t_${start.replace(":", "-")}`,
    title: start,
  }));
}

function chunkButtons(buttons, size = 10) {
  const out = [];
  for (let i = 0; i < buttons.length; i += size) out.push(buttons.slice(i, i + size));
  return out;
}

async function sendImageFromSvg(deps, to, svg, fileName, caption, options = {}) {
  const scale = Math.max(1, Number(options.scale) || 2);
  const png = await deps.renderSvgToPng(svg, { scale });
  const link = await deps.uploadPngBuffer(png, fileName);
  await deps.sendImage(deps.settings, { to, link, caption: caption || "" });
}

async function promptHours(deps, nickname) {
  const greeting = nickname ? `${nickname}, vamos agendar seu voo.` : "Vamos agendar seu voo.";
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: `${greeting}\n\nQuantas horas de voo você quer marcar?`,
    buttons: hoursButtons(),
  });
}

async function promptWeeks(deps, session) {
  const weeks = nextWeekStarts(3);
  const detail = weeks
    .map((ws, index) => `• Semana ${index + 1}: ${formatBrDate(ws)} a ${formatBrDate(addDays(ws, 6))}`)
    .join("\n");
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: `Perfeito: ${session.durationMinutes / 60}h.\nEscolha a semana (seg–dom):\n${detail}`,
    buttons: weekButtons(weeks),
    listButtonText: "Semanas",
    listSectionTitle: "Próximas semanas",
  });
}

async function sendCreditBlocked(deps, freeHoursMax, durationMinutes) {
  const free = Math.max(0, Number(freeHoursMax) || 0).toFixed(2);
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: `Crédito insuficiente para ${durationMinutes / 60}h.\nSaldo livre aproximado: ${free}h.\nCompre horas para continuar, ou envie Cancelar.`,
    buttons: [
      { id: "book_buy_hours", title: "Comprar horas" },
      { id: "book_cancel", title: "Cancelar" },
    ],
  });
}

function rememberScheduleRules(session, rules = {}) {
  session.bufferBeforeMinutes = Number(rules.bufferBeforeMinutes) || 30;
  session.bufferAfterMinutes = Number(rules.bufferAfterMinutes) || 15;
  return session;
}

async function showWeekAndAskDay(deps, session) {
  const calendar = await deps.callScheduleBooking(deps.studentUserId, {
    action: "getCalendar",
    dateFrom: session.weekStart,
    dateTo: addDays(session.weekStart, 6),
  });
  if (calendar.mode && calendar.mode !== "booking") {
    await deps.sendText(deps.settings, {
      to: deps.incoming.from,
      body: "A escala não está aberta para agendamento no momento.",
    });
    await deps.clearSession(deps.studentUserId);
    return;
  }
  const rules = calendar.rules || {};
  rememberScheduleRules(session, rules);
  const summaries = summarizeWeekDays(calendar, rules, session.weekStart, session.durationMinutes);
  const availableDays = summaries.filter((day) => day.hasSlot);
  const summaryText = summaries
    .map((day) => {
      if (!day.hasSlot) return `• ${day.label}: sem vaga para ${session.durationMinutes / 60}h`;
      if (day.freeStarts > 0) {
        return `• ${day.label}: ${day.freeStarts} slot${day.freeStarts === 1 ? "" : "s"} disponíveis`;
      }
      return `• ${day.label}: somente lista de espera`;
    })
    .join("\n");

  // Texto/botões primeiro (resposta rápida); imagem em paralelo.
  const imagePromise = (async () => {
    try {
      const svg = buildWeekScaleSvg(calendar, rules, session.weekStart, session.durationMinutes);
      await sendImageFromSvg(
        deps,
        deps.incoming.from,
        svg,
        `wpp-book-week-${session.weekStart}.png`,
        `Semana ${formatBrDate(session.weekStart)}–${formatBrDate(addDays(session.weekStart, 6))}`,
        { scale: 2 },
      );
    } catch {
      // imagem opcional
    }
  })();

  if (!availableDays.length) {
    session.step = "week";
    await deps.saveSession(deps.studentUserId, session);
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: `Nenhum dia com horário livre para ${session.durationMinutes / 60}h nesta semana.\n\n${summaryText}\n\nEscolha outra semana ou cancele.`,
      buttons: [...weekButtons(nextWeekStarts(3)), { id: "book_cancel", title: "Cancelar" }].slice(0, 10),
      listButtonText: "Opções",
      listSectionTitle: "Semanas",
    });
    await imagePromise;
    return;
  }

  session.step = "day";
  await deps.saveSession(deps.studentUserId, session);
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: `Resumo da semana:\n${summaryText}\n\nEscolha o dia:`,
    buttons: dayButtons(availableDays),
    listButtonText: "Dias",
    listSectionTitle: "Dias com vaga",
  });
  await imagePromise;
}

async function showDayAndAskAircraft(deps, session) {
  const calendar = await deps.callScheduleBooking(deps.studentUserId, {
    action: "getCalendar",
    dateFrom: session.flightDate,
    dateTo: session.flightDate,
  });
  const rules = calendar.rules || {};
  rememberScheduleRules(session, rules);
  const rows = aircraftsWithSlots(calendar, rules, session.flightDate, session.durationMinutes);

  const imagePromise = (async () => {
    try {
      const svg = buildDayScaleSvg(calendar, rules, session.flightDate, session.durationMinutes);
      await sendImageFromSvg(
        deps,
        deps.incoming.from,
        svg,
        `wpp-book-day-${session.flightDate}.png`,
        formatBrDateLong(session.flightDate),
        { scale: 2 },
      );
    } catch {
      // segue sem imagem
    }
  })();

  if (!rows.length) {
    session.step = "day";
    await deps.saveSession(deps.studentUserId, session);
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: `Não encontrei aviões com horário livre em ${formatBrDateLong(session.flightDate)} para ${session.durationMinutes / 60}h.\nEscolha outro dia ou cancele.`,
      buttons: [{ id: "book_cancel", title: "Cancelar" }],
    });
    await imagePromise;
    return;
  }

  const lines = rows
    .map((row) => {
      const presentations = row.starts
        .map((start) => presentationOfStart(start, rules))
        .filter(Boolean);
      const label = row.isWaitlist || isWaitlistIdent(rules, row.registration)
        ? `Espera (${formatIdentDisplay(row.registration)})`
        : formatIdentDisplay(row.registration);
      return `• ${label}: ${presentations.join(", ")}`;
    })
    .join("\n");
  const header = `Aviões com vaga em ${formatBrDateLong(session.flightDate)}:\n(horários de apresentação; Espera = lista de espera)`;
  const choose = "Escolha o avião:";
  const fullBody = `${header}\n${lines}\n\n${choose}`;

  session.step = "aircraft";
  await deps.saveSession(deps.studentUserId, session);

  if (fullBody.length > 1000) {
    await deps.sendText(deps.settings, { to: deps.incoming.from, body: `${header}\n${lines}`.slice(0, 4000) });
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: choose,
      buttons: aircraftButtons(rows),
      listButtonText: "Aviões",
      listSectionTitle: "Frota",
    });
  } else {
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: fullBody,
      buttons: aircraftButtons(rows),
      listButtonText: "Aviões",
      listSectionTitle: "Frota",
    });
  }
  await imagePromise;
}

async function askTimes(deps, session) {
  const calendar = await deps.callScheduleBooking(deps.studentUserId, {
    action: "getCalendar",
    dateFrom: session.flightDate,
    dateTo: session.flightDate,
  });
  const rules = calendar.rules || {};
  rememberScheduleRules(session, rules);
  const presentations = freePresentationStarts(
    calendar,
    rules,
    session.aircraftIdent,
    session.flightDate,
    session.durationMinutes,
  );
  if (!presentations.length) {
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: `Sem horários de apresentação livres para ${formatIdentDisplay(session.aircraftIdent)} neste dia. Escolha outro avião ou cancele.`,
      buttons: [{ id: "book_cancel", title: "Cancelar" }],
    });
    session.step = "aircraft";
    await deps.saveSession(deps.studentUserId, session);
    return;
  }

  const chunks = chunkButtons(timeButtons(presentations), 10);
  for (let i = 0; i < chunks.length; i += 1) {
    const body =
      i === 0
        ? `Horários de apresentação livres · ${formatIdentDisplay(session.aircraftIdent)} · ${formatBrDateLong(session.flightDate)}:\nEscolha o horário de apresentação:`
        : `Mais horários de apresentação (${i + 1}/${chunks.length}):`;
    // eslint-disable-next-line no-await-in-loop
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body,
      buttons: chunks[i],
      listButtonText: "Apresentação",
      listSectionTitle: "Horários",
    });
    if (i < chunks.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await deps.sleep(250);
    }
  }
  session.step = "time";
  await deps.saveSession(deps.studentUserId, session);
}

async function askNotes(deps, session) {
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: "Digite a observação do voo (ex.: missão, preferência) ou toque em Sem observação.",
    buttons: [{ id: "book_notes_none", title: "Sem observação" }],
  });
  session.step = "notes";
  await deps.saveSession(deps.studentUserId, session);
}

async function askConfirm(deps, session) {
  const bufferBefore = Number(session.bufferBeforeMinutes) || 30;
  const bufferAfter = Number(session.bufferAfterMinutes) || 15;
  const startMin = parseClock(session.startTime) || 0;
  const presentation = session.presentationTime || clock(startMin - bufferBefore);
  const cutoff = clock(startMin + session.durationMinutes);
  const end = clock(startMin + session.durationMinutes + bufferAfter);
  const notesLabel = clean(session.notes) ? clean(session.notes) : "Sem observação";
  const lines = [
    "Confira o seu agendamento",
    `• Data: ${formatBrDateLong(session.flightDate)}`,
    `• Avião: ${formatIdentDisplay(session.aircraftIdent)}`,
    `• Apresentação: ${presentation}`,
    `• Acionamento: ${session.startTime}`,
    `• Duração: ${session.durationMinutes / 60}h`,
    `• Corte: ${cutoff}`,
    `• Encerramento: ${end}`,
    `• Observação: ${notesLabel}`,
    "",
    "Instrutor: a definir pela escola.",
    "",
    "Confirmar solicitação?",
  ];
  await deps.sendBotReply(deps.settings, {
    to: deps.incoming.from,
    body: lines.join("\n"),
    buttons: [
      { id: "book_confirm", title: "Confirmar" },
      { id: "book_cancel", title: "Cancelar" },
    ],
  });
  session.step = "confirm";
  await deps.saveSession(deps.studentUserId, session);
}

async function confirmBooking(deps, session) {
  try {
    const note = clean(session.notes);
    const result = await deps.callScheduleBooking(deps.studentUserId, {
      action: "requestFlight",
      flightDate: session.flightDate,
      aircraftIdent: session.aircraftIdent,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      flexibilityMinutes: 0,
      notes: note || "Solicitação via WhatsApp",
      requestOrigin: "wpp",
      instructorUserId: null,
    });
    await deps.clearSession(deps.studentUserId);
    const flight = result.flight || {};
    const presentation = session.presentationTime || session.startTime;
    await deps.sendText(deps.settings, {
      to: deps.incoming.from,
      body: [
        "Solicitação enviada!",
        `• ${formatBrDateLong(session.flightDate)} · apresentação ${presentation} · ${session.durationMinutes / 60}h`,
        `• ${formatIdentDisplay(session.aircraftIdent)}`,
        `• Status: ${clean(flight.status) || "Pendente"}`,
        "",
        "A escola vai confirmar o voo. Você pode acompanhar na plataforma.",
      ].join("\n"),
    });
    return "booked";
  } catch (err) {
    await deps.sendBotReply(deps.settings, {
      to: deps.incoming.from,
      body: `Não consegui concluir o agendamento: ${clean(err?.message).slice(0, 220)}\n\nTente outro horário ou cancele.`,
      buttons: [
        { id: "book_cancel", title: "Cancelar" },
        { id: "book_start", title: "Recomeçar" },
      ],
    });
    return "book_failed";
  }
}

async function handleHoursStep(deps, session) {
  const buy = normalizeText(deps.incoming.responseId) === "book_buy_hours" || normalizeText(deps.incoming.text) === "comprar horas";
  if (buy) {
    await deps.sendCreditPurchaseOptions(deps.settings, deps.incoming);
    return "credit_cta";
  }

  const hours = parseHoursChoice(deps.incoming.text, deps.incoming.responseId);
  if (!hours) {
    await promptHours(deps, deps.nickname);
    return "hours_prompt";
  }
  const durationMinutes = hours * 60;
  const preview = await deps.callScheduleBooking(deps.studentUserId, {
    action: "creditPreview",
    durationMinutes,
  });
  if (preview.mode && preview.mode !== "booking") {
    await deps.sendText(deps.settings, {
      to: deps.incoming.from,
      body: "A escala não está aberta para agendamento no momento.",
    });
    await deps.clearSession(deps.studentUserId);
    return "closed";
  }
  if (preview.requireCreditsForBooking && !preview.sufficient) {
    session.step = "hours";
    session.durationMinutes = durationMinutes;
    session.freeHoursMax = preview.freeHoursMax;
    await deps.saveSession(deps.studentUserId, session);
    await sendCreditBlocked(deps, preview.freeHoursMax, durationMinutes);
    return "credit_blocked";
  }

  session.step = "week";
  session.durationMinutes = durationMinutes;
  session.freeHoursMax = preview.freeHoursMax;
  session.zeroCreditException = preview.zeroCreditExceptionAvailable === true;
  await deps.saveSession(deps.studentUserId, session);

  if (session.zeroCreditException) {
    await deps.sendText(deps.settings, {
      to: deps.incoming.from,
      body: "Você está sem saldo livre, mas a escola permite marcar 1h. Lembre de repor o crédito antes do voo.",
    });
  }
  await promptWeeks(deps, session);
  return "week_prompt";
}

async function handleWeekStep(deps, session) {
  const ws = parseWeekChoice(deps.incoming.text, deps.incoming.responseId);
  const allowed = nextWeekStarts(3);
  if (!ws || !allowed.includes(ws)) {
    await promptWeeks(deps, session);
    return "week_reprompt";
  }
  session.weekStart = ws;
  session.flightDate = null;
  session.aircraftIdent = null;
  session.startTime = null;
  session.presentationTime = null;
  session.notes = null;
  await deps.saveSession(deps.studentUserId, session);
  await showWeekAndAskDay(deps, session);
  return "day_prompt";
}

async function handleDayStep(deps, session) {
  const date = parseDayChoice(deps.incoming.text, deps.incoming.responseId);
  const allowed = weekDates(session.weekStart);
  if (!date || !allowed.includes(date)) {
    await showWeekAndAskDay(deps, session);
    return "day_reprompt";
  }
  session.flightDate = date;
  session.aircraftIdent = null;
  session.startTime = null;
  await deps.saveSession(deps.studentUserId, session);
  await showDayAndAskAircraft(deps, session);
  return "aircraft_prompt";
}

async function handleAircraftStep(deps, session) {
  const ident = parseAircraftChoice(deps.incoming.text, deps.incoming.responseId);
  if (!ident) {
    await showDayAndAskAircraft(deps, session);
    return "aircraft_reprompt";
  }
  const calendar = await deps.callScheduleBooking(deps.studentUserId, {
    action: "getCalendar",
    dateFrom: session.flightDate,
    dateTo: session.flightDate,
  });
  const match = visibleAircrafts(calendar).find((aircraft) => normalizeIdent(aircraft.registration) === ident);
  if (!match) {
    await deps.sendText(deps.settings, { to: deps.incoming.from, body: "Avião não encontrado. Escolha uma das opções." });
    await showDayAndAskAircraft(deps, session);
    return "aircraft_invalid";
  }
  session.aircraftIdent = match.registration;
  session.startTime = null;
  await deps.saveSession(deps.studentUserId, session);
  await askTimes(deps, session);
  return "time_prompt";
}

async function handleTimeStep(deps, session) {
  const presentationTime = parseTimeChoice(deps.incoming.text, deps.incoming.responseId);
  if (!presentationTime) {
    await askTimes(deps, session);
    return "time_reprompt";
  }
  const calendar = await deps.callScheduleBooking(deps.studentUserId, {
    action: "getCalendar",
    dateFrom: session.flightDate,
    dateTo: session.flightDate,
  });
  const rules = calendar.rules || {};
  rememberScheduleRules(session, rules);
  const presentations = freePresentationStarts(
    calendar,
    rules,
    session.aircraftIdent,
    session.flightDate,
    session.durationMinutes,
  );
  if (!presentations.includes(presentationTime)) {
    await deps.sendText(deps.settings, { to: deps.incoming.from, body: "Esse horário de apresentação não está mais disponível. Escolha outro." });
    await askTimes(deps, session);
    return "time_invalid";
  }
  const startTime = startOfPresentation(presentationTime, rules);
  if (!startTime) {
    await askTimes(deps, session);
    return "time_invalid";
  }
  session.presentationTime = presentationTime;
  session.startTime = startTime;
  session.notes = null;
  await deps.saveSession(deps.studentUserId, session);
  await askNotes(deps, session);
  return "notes_prompt";
}

async function handleNotesStep(deps, session) {
  const id = normalizeText(deps.incoming.responseId);
  const text = clean(deps.incoming.text);
  if (id === "book_notes_none" || normalizeText(text) === "sem observacao" || normalizeText(text) === "sem observação") {
    session.notes = "";
  } else if (text) {
    session.notes = text.slice(0, 180);
  } else {
    await askNotes(deps, session);
    return "notes_reprompt";
  }
  await deps.saveSession(deps.studentUserId, session);
  await askConfirm(deps, session);
  return "confirm_prompt";
}

async function handleConfirmStep(deps, session) {
  const id = normalizeText(deps.incoming.responseId);
  const text = normalizeText(deps.incoming.text);
  if (id === "book_confirm" || text === "confirmar" || text === "sim") {
    return confirmBooking(deps, session);
  }
  if (id === "book_cancel" || text === "cancelar" || text === "nao" || text === "não") {
    await deps.clearSession(deps.studentUserId);
    await deps.sendText(deps.settings, { to: deps.incoming.from, body: "Agendamento cancelado. Quando quiser, envie Agendar voo." });
    return "cancelled";
  }
  await askConfirm(deps, session);
  return "confirm_reprompt";
}

/**
 * Orquestra um turno do fluxo Agendar voo.
 * deps: settings, incoming, studentUserId, nickname, profile,
 *   loadSession, saveSession, clearSession, callScheduleBooking,
 *   sendBotReply, sendText, sendImage, uploadPngBuffer, renderSvgToPng,
 *   sendCreditPurchaseOptions, sleep
 */
async function handleTurn(deps) {
  const start = parseBookingStart(deps.incoming.text, deps.incoming.responseId);
  let session = await deps.loadSession(deps.studentUserId);

  if (isCancelCommand(deps.incoming.text, deps.incoming.responseId) && (session || start)) {
    await deps.clearSession(deps.studentUserId);
    await deps.sendText(deps.settings, {
      to: deps.incoming.from,
      body: "Tudo bem — encerrei o agendamento. Quando quiser, envie Agendar voo.",
    });
    return { handled: true, status: "cancelled" };
  }

  if (start || normalizeText(deps.incoming.responseId) === "book_start") {
    session = newSession();
    await deps.saveSession(deps.studentUserId, session);
    await promptHours(deps, deps.nickname);
    return { handled: true, status: "started" };
  }

  if (!session) return { handled: false, status: "no_session" };

  const step = clean(session.step) || "hours";
  let status = "ok";
  if (step === "hours") status = await handleHoursStep(deps, session);
  else if (step === "week") status = await handleWeekStep(deps, session);
  else if (step === "day") status = await handleDayStep(deps, session);
  else if (step === "aircraft") status = await handleAircraftStep(deps, session);
  else if (step === "time") status = await handleTimeStep(deps, session);
  else if (step === "notes") status = await handleNotesStep(deps, session);
  else if (step === "confirm") status = await handleConfirmStep(deps, session);
  else {
    session.step = "hours";
    await deps.saveSession(deps.studentUserId, session);
    await promptHours(deps, deps.nickname);
    status = "reset";
  }
  return { handled: true, status };
}

module.exports = {
  SESSION_TTL_MS,
  sessionKey,
  newSession,
  parseBookingStart,
  isBookingButton,
  isCancelCommand,
  handleTurn,
  buildWeekScaleSvg,
  buildDayScaleSvg,
  freeStartsForAircraft,
  nextWeekStarts,
  weekStart,
  addDays,
  DAY_ORDER,
  DAY_LABEL,
};
