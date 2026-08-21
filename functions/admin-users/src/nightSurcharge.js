const META_PREFIX = "#GFV_META_V1:";

function parseDurationToMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,3}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || "0") * 60 + Number(hhmm[2] || "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

function decodeFlightRecordMeta(recordText) {
  const normalized = String(recordText || "").replace(/^\uFEFF/, "");
  const first = String(normalized.split(/\r?\n/, 1)[0] || "").trim();
  if (!first.startsWith(META_PREFIX)) return null;
  try {
    return JSON.parse(Buffer.from(first.slice(META_PREFIX.length).trim(), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function nightMinutesFromFlightMeta(meta) {
  const legs = Array.isArray(meta?.legs) ? meta.legs : [];
  return legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg?.nightTime || ""), 0);
}

function nightMinutesFromFlightRecordText(recordText) {
  return nightMinutesFromFlightMeta(decodeFlightRecordMeta(recordText));
}

function nightSurchargeDebitHours(nightMinutes, percentage) {
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0 || nightMinutes <= 0) return 0;
  const debitMinutes = Math.round(nightMinutes * pct / 100);
  return debitMinutes > 0 ? Number((debitMinutes / 60).toFixed(2)) : 0;
}

module.exports = {
  decodeFlightRecordMeta,
  nightMinutesFromFlightMeta,
  nightMinutesFromFlightRecordText,
  nightSurchargeDebitHours,
  parseDurationToMinutes,
};
