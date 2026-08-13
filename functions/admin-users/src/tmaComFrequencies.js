"use strict";

const catalog = require("./data/tmaComFrequencies.json");

function tmaDesignatorFromIdent(ident) {
  const raw = String(ident || "")
    .trim()
    .toUpperCase();
  const m = raw.match(/^(SB[WX][A-Z])(?:_|$)/);
  if (m) return m[1];
  if (/^SB[WX][A-Z]$/.test(raw)) return raw;
  return null;
}

function lookupTmaComFrequencies(ident) {
  const designator = tmaDesignatorFromIdent(ident);
  if (!designator) return [];
  const entry = catalog?.byIdent?.[designator];
  if (!entry) return [];
  const out = [];
  for (const mhz of entry.primary || []) {
    out.push({ service: entry.label || "CONTROLE", mhz });
  }
  for (const mhz of entry.alternate || []) {
    out.push({ service: `${entry.label || "CONTROLE"} ALTN`, mhz });
  }
  for (const mhz of entry.emergency || []) {
    out.push({ service: "EMERG", mhz });
  }
  return out;
}

module.exports = {
  lookupTmaComFrequencies,
  tmaDesignatorFromIdent,
};
