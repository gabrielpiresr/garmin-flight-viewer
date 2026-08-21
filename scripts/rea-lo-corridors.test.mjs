import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const rea = require("../functions/admin-users/src/reaCorridorRoute.js");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const national = JSON.parse(readFileSync(path.join(root, "public/geo/cv-rea-br.json"), "utf8"));

const SBJD = {
  lat: -23.1806,
  lng: -46.9444,
  label: "SBJD",
  raw: "SBJD",
  kind: "origin",
  fieldElevFt: 2080,
  altitudeFt: 2080,
};
const SBLO = {
  lat: -23.3336,
  lng: -51.1301,
  label: "SBLO",
  raw: "SBLO",
  kind: "destination",
  fieldElevFt: 1867,
  altitudeFt: 1867,
};

function names(waypoints) {
  return waypoints.map((wp) => wp.label || wp.raw);
}

test("REA nacional inclui a carta XO-LONDRINA", () => {
  const lo = (national.features || []).filter((f) => String(f.properties?.carta_nome || "").toUpperCase() === "XO-LONDRINA");
  assert.ok(lo.length >= 8, `XO-LONDRINA features: ${lo.length}`);
  const nomes = new Set(lo.map((f) => String(f.properties?.nome || "")));
  for (const name of ["November", "Foxtrot", "Echo", "Charlie", "Alfa"]) {
    assert.ok(nomes.has(name), `missing ${name}`);
  }
});

test("export FPL SBJD → SBLO termina em REA porque o destino está na TMA", () => {
  const snapped = rea.snapRouteToVisualCorridors([SBJD, SBLO], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { destInsideTma: true });
  assert.match(route, /^REA\b/, route);
  assert.match(route, /\bREA$/, route);
  assert.doesNotMatch(route, /2312S05048W/, route);
  assert.doesNotMatch(route, /REA .+\bDCT$/, route);
});

test("mantém pontos intermediários e traça REA entre cada trecho", () => {
  const via = {
    lat: -23.005,
    lng: -47.135,
    label: "ITU",
    raw: "ITU",
    kind: "airport",
    fieldElevFt: 2000,
    altitudeFt: 2000,
  };
  const result = rea.snapRouteToVisualCorridors([SBJD, via, SBLO], national.features || []);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints);
  assert.equal(labels[0], "SBJD");
  assert.equal(labels[labels.length - 1], "SBLO");
  const ituIdx = labels.findIndex((label) => label === "ITU" || /ITU/i.test(label));
  assert.ok(ituIdx > 0 && ituIdx < labels.length - 1, labels.join(" > "));
});

test("SBJD → SBLO entra na REA de Londrina depois dos corredores de SP", () => {
  const result = rea.snapRouteToVisualCorridors([SBJD, SBLO], national.features || []);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  const loFixes = [
    "TAMARANA",
    "APUCARANA",
    "GUARAVERA",
    "SILOS",
    "IEPÊ",
    "IEPE",
    "SAPOPEMA",
    "URAÍ",
    "URAI",
    "ARAPONGA",
    "PRADO FERREIRA",
  ];
  assert.ok(
    loFixes.some((fix) => labels.toUpperCase().includes(fix)),
    labels,
  );
  const lastSp = labels.includes("CERQUILHO")
    ? labels.split("CERQUILHO").pop() || ""
    : labels.includes("PORTO FELIZ")
      ? labels.split("PORTO FELIZ").pop() || ""
      : labels;
  assert.ok(!/^[\s>]*SBLO$/.test(lastSp.trim()), `DCT into SBLO without Londrina REA: ${labels}`);
});

test("FPL SBJD–SBBU–SBJD: AD com nível do regresso e VFR na reentrada; RMK com TGL", () => {
  const waypoints = [
    { lat: -23.1806, lng: -46.9444, label: "SBJD", raw: "SBJD", kind: "origin", altitudeFt: 2080, fieldElevFt: 2080 },
    { lat: -23.15, lng: -47.75, label: "SAIDA", raw: "SAIDA", kind: "rea", altitudeFt: 5500 },
    { lat: -22.35, lng: -49.05, label: "SBBU", raw: "SBBU", kind: "airport", altitudeFt: 1942, fieldElevFt: 1942 },
    { lat: -23.15, lng: -47.75, label: "RETORNO", raw: "RETORNO", kind: "rea", altitudeFt: 6500 },
    { lat: -23.1806, lng: -46.9444, label: "SBJD", raw: "SBJD", kind: "destination", altitudeFt: 2080, fieldElevFt: 2080 },
  ];
  const corridors = [
    null,
    { name: "CHARLIE", altMax: 5500 },
    null,
    null,
    { name: "CHARLIE", altMax: 6500 },
  ];
  const route = rea.buildFplRouteText(waypoints, corridors, 90, { destInsideTma: true });
  assert.equal(
    route,
    "REA 2309S04745W/N0090A065 DCT 2221S04903W/N0090A055 DCT 2309S04745W/N0090VFR REA",
    route,
  );
  const rmk = rea.buildFplRmkText(waypoints, corridors);
  assert.match(rmk, /\bTGL SBBU\b/, rmk);
});
