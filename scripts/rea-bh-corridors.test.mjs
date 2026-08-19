import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const rea = require("../functions/admin-users/src/reaCorridorRoute.js");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bh = JSON.parse(readFileSync(path.join(root, "public/geo/cv-rea-wh-bh.json"), "utf8"));

const SNPA = { lat: -19.8558, lng: -44.6011, label: "SNPA", raw: "SNPA", kind: "origin", fieldElevFt: 2713, altitudeFt: 2713 };
const SBBH = { lat: -19.8512, lng: -43.9506, label: "SBBH", raw: "SBBH", kind: "destination", fieldElevFt: 2589, altitudeFt: 2589 };
const SBCF = { lat: -19.6244, lng: -43.9719, label: "SBCF", raw: "SBCF", kind: "destination", fieldElevFt: 2717, altitudeFt: 2717 };

function names(waypoints) {
  return waypoints.map((wp) => wp.label || wp.raw);
}

test("REA WH-BH snapshot has AIC corridors", () => {
  assert.equal(bh.features.length, 41);
  const nomes = new Set(bh.features.map((f) => f.properties.nome));
  for (const name of ["Kilo", "Lima", "Oscar", "Tango", "Uniform", "Victor"]) {
    assert.ok(nomes.has(name), `missing ${name}`);
  }
  assert.ok(bh.features.every((f) => f.properties.carta_nome === "WH-BELO HORIZONTE"));
});

test("rota automática SNPA → SBBH segue Juatuba / Kilo até Ceasa", () => {
  const result = rea.snapRouteToVisualCorridors([SNPA, SBBH], bh.features);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  assert.ok(result.corridorNames.includes("KILO"), labels);
  assert.ok(labels.includes("JUATUBA") && labels.includes("FLORES") && labels.includes("CEASA"), labels);
  assert.ok(result.inserted >= 3, labels);
});

test("export FPL da rota SNPA → SBBH marca REA e RMK dos corredores", () => {
  const snapped = rea.snapRouteToVisualCorridors([SNPA, SBBH], bh.features);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, bh.features);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { originInsideTma: false });
  const rmk = rea.buildFplRmkText(withAlt, corridors);
  assert.match(route, /\bREA\b/);
  assert.match(rmk, /\bREA\b/);
  assert.match(rmk, /\bKILO\b/);
  assert.match(rmk, /\bLIMA\b/);
  const kiloLeg = corridors.find((c) => c?.name === "KILO");
  assert.ok(kiloLeg, "pernas casadas com Kilo");
  assert.ok(kiloLeg.altMax === 5000 || kiloLeg.altMax === 5500);
});

test("rota automática SBBH → SBCF encaixa nos corredores da TMA BH", () => {
  const origin = { ...SBBH, kind: "origin" };
  const result = rea.snapRouteToVisualCorridors([origin, SBCF], bh.features);
  assert.equal(result.ok, true, result.error);
  assert.ok(result.corridorNames.length > 0, result.corridorNames.join(","));
  const corridors = rea.matchLegCorridors(result.waypoints, bh.features);
  const route = rea.buildFplRouteText(result.waypoints, corridors, 90, { originInsideTma: true });
  assert.match(route, /^DCT\b/);
  assert.match(route, /\bREA\b/);
  const rmk = rea.buildFplRmkText(result.waypoints, corridors);
  assert.match(rmk, /\bREA\b/);
});

test("SBJD → SBBH entra na REA local de BH depois da rede nacional", () => {
  const nationalPath = path.join(root, "public/geo/cv-rea-br.json");
  let national = { features: [] };
  try {
    national = JSON.parse(readFileSync(nationalPath, "utf8"));
  } catch {
    return;
  }
  const SBJD = {
    lat: -23.1806,
    lng: -46.9444,
    label: "SBJD",
    raw: "SBJD",
    kind: "origin",
    fieldElevFt: 2080,
    altitudeFt: 2080,
  };
  const features = [...(national.features || []), ...bh.features];
  const result = rea.snapRouteToVisualCorridors([SBJD, SBBH], features);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  const bhFixes = ["ITAGUARA", "MANSO", "IGARAPÉ", "IBIRITÉ", "MANNESMANN", "JUATUBA", "FLORES", "CEASA"];
  assert.ok(
    bhFixes.some((fix) => labels.includes(fix)),
    labels,
  );
  const afterCambui = labels.includes("CAMBUÍ") ? labels.split("CAMBUÍ").pop() || "" : labels;
  assert.ok(!/^[\s>]*SBBH$/.test(afterCambui.trim()), `DCT after Cambuí: ${labels}`);
});

test("SDRK → SBJD usa REA e ignora REH (Anhanguera)", () => {
  const nationalPath = path.join(root, "public/geo/cv-rea-br.json");
  const rehPath = path.join(root, "public/geo/cv-reh-br.json");
  let national = { features: [] };
  let reh = { features: [] };
  try {
    national = JSON.parse(readFileSync(nationalPath, "utf8"));
    reh = JSON.parse(readFileSync(rehPath, "utf8"));
  } catch {
    return;
  }
  const SDRK = {
    lat: -22.3964,
    lng: -47.5603,
    label: "SDRK",
    raw: "SDRK",
    kind: "origin",
    fieldElevFt: 1991,
    altitudeFt: 1991,
  };
  const dest = {
    lat: -23.1806,
    lng: -46.9444,
    label: "SBJD",
    raw: "SBJD",
    kind: "destination",
    fieldElevFt: 2080,
    altitudeFt: 2080,
  };
  const mixed = [...(national.features || []), ...(reh.features || [])];
  const result = rea.snapRouteToVisualCorridors([SDRK, dest], mixed);
  assert.equal(result.ok, true, result.error);
  const labels = names(result.waypoints).join(" > ");
  const corridors = (result.corridorNames || []).join(" | ");
  assert.ok(!/ANHANGUERA/i.test(corridors), corridors);
  assert.ok(!/PED[AÁ]GIO AMERICANA|HONDA|SANTOS DUMONT/i.test(labels), labels);
  assert.ok(labels.includes("PEDRAS"), labels);
  assert.ok(labels.includes("CAPIVARI"), labels);
  assert.ok(/\bITU\b/.test(labels), labels);
  assert.ok(/CABRE[UÚ]VA/i.test(labels), labels);
});

test("export FPL SDRK → SBJD começa em DCT até a entrada da REA", () => {
  const nationalPath = path.join(root, "public/geo/cv-rea-br.json");
  let national = { features: [] };
  try {
    national = JSON.parse(readFileSync(nationalPath, "utf8"));
  } catch {
    return;
  }
  const SDRK = {
    lat: -22.3964,
    lng: -47.5603,
    label: "SDRK",
    raw: "SDRK",
    kind: "origin",
    fieldElevFt: 1991,
    altitudeFt: 1991,
  };
  const dest = {
    lat: -23.1806,
    lng: -46.9444,
    label: "SBJD",
    raw: "SBJD",
    kind: "destination",
    fieldElevFt: 2080,
    altitudeFt: 2080,
  };
  const snapped = rea.snapRouteToVisualCorridors([SDRK, dest], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { originInsideTma: true });
  assert.match(route, /^DCT\b/, route);
  assert.match(route, /2249S04734W\/N0090A045 REA/, route);
  assert.equal(route.endsWith("REA"), true, route);
  assert.doesNotMatch(route, /^REA\b/);
});
