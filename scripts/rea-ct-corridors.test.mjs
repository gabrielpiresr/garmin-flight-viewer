import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const rea = require("../functions/admin-users/src/reaCorridorRoute.js");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ct = JSON.parse(readFileSync(path.join(root, "public/geo/cv-rea-wt-ct.json"), "utf8"));

const WCONT = {
  lat: -25.68,
  lng: -49.7,
  label: "WCONT",
  raw: "WCONT",
  kind: "origin",
  fieldElevFt: 3000,
  altitudeFt: 3000,
};
const SBCT = {
  lat: -25.5317,
  lng: -49.1758,
  label: "SBCT",
  raw: "SBCT",
  kind: "destination",
  fieldElevFt: 2988,
  altitudeFt: 2988,
};
const GUA = {
  lat: -25.88,
  lng: -48.57,
  label: "GUA",
  raw: "SSGZ",
  kind: "origin",
  fieldElevFt: 20,
  altitudeFt: 20,
};
const SSFF = {
  lat: -26.2544,
  lng: -48.6378,
  label: "SSFF",
  raw: "SSFF",
  kind: "destination",
  fieldElevFt: 16,
  altitudeFt: 16,
};

function names(waypoints) {
  return waypoints.map((wp) => wp.label || wp.raw);
}

test("REA WT-CT snapshot has AIC N74/24 corridors", () => {
  assert.equal(ct.features.length, 21);
  const nomes = new Set(ct.features.map((f) => f.properties.nome));
  for (const name of ["Sanepar", "Jazida", "Barigui", "Norte", "Sul", "São Francisco do Sul"]) {
    assert.ok(nomes.has(name), `missing ${name}`);
  }
  assert.ok(ct.features.every((f) => f.properties.carta_nome === "WT-CURITIBA"));
  assert.ok(ct.features.every((f) => f.properties.identificador === "AIC N74/24"));
});

test("rota automática a oeste de Contenda → SBCT segue Sanepar", () => {
  const result = rea.snapRouteToVisualCorridors([WCONT, SBCT], ct.features);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  assert.ok(result.corridorNames.includes("SANEPAR"), labels);
  assert.ok(labels.includes("CONTENDA") && labels.includes("SANEPAR"), labels);
});

test("export FPL da rota Contenda → SBCT marca REA SANEPAR", () => {
  const snapped = rea.snapRouteToVisualCorridors([WCONT, SBCT], ct.features);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, ct.features);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { originInsideTma: false });
  const rmk = rea.buildFplRmkText(withAlt, corridors);
  assert.match(route, /\bREA\b/);
  assert.match(rmk, /\bREA\b/);
  assert.match(rmk, /\bSANEPAR\b/);
  const sanepar = corridors.find((c) => c?.name === "SANEPAR");
  assert.ok(sanepar, "perna casada com Sanepar");
  assert.equal(sanepar.altMax, 4500);
});

test("rota automática no litoral usa o corredor São Francisco do Sul", () => {
  const result = rea.snapRouteToVisualCorridors([GUA, SSFF], ct.features);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  assert.ok(result.corridorNames.includes("SÃO FRANCISCO DO SUL"), labels);
  assert.ok(labels.includes("GUARATUBA"), labels);
});
