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
  const route = rea.buildFplRouteText(result.waypoints, corridors, 90, {
    originInsideTma: true,
    destInsideTma: true,
    originReaTmaId: "WH",
    destReaTmaId: "WH",
  });
  assert.match(route, /\bREA\b/, route);
  assert.notEqual(route, "REA", route);
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
  const corridors = (result.corridorNames || []).join(" | ");
  const spFixes = ["LAGOA", "JARINU", "ATIBAIA", "JOANÓPOLIS", "CAMANDUCAIA", "CAMBUÍ"];
  assert.ok(
    spFixes.some((fix) => labels.includes(fix)),
    `ignorou a REA de SP: ${labels}`,
  );
  assert.ok(/KILO|LIMA|PORT[AÃ]O LAGOA/i.test(corridors), `corredores SP ausentes: ${corridors}`);
  const bhFixes = ["ITAGUARA", "MANSO", "IGARAPÉ", "IBIRITÉ", "MANNESMANN", "JUATUBA", "FLORES", "CEASA"];
  assert.ok(
    bhFixes.some((fix) => labels.includes(fix)),
    labels,
  );
  assert.ok(/JULIET|NOVEMBER|SIERRA|ROMEU/i.test(corridors), `corredores BH ausentes: ${corridors}`);
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
  const route = rea.buildFplRouteText(withAlt, corridors, 90, {
    originInsideTma: true,
    destInsideTma: true,
    originReaTmaId: "XP",
    destReaTmaId: "XP",
  });
  assert.match(route, /^DCT\b/, route);
  assert.match(route, /2249S04734W\/N0090VFR REA/, route);
  assert.equal(route.endsWith("REA"), true, route);
  assert.doesNotMatch(route, /^REA\b/);
  assert.notEqual(route, "REA", route);
});

test("export FPL SDRK → SBJD usa DCT de entrada quando a origem não está na TMA com REA", () => {
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
  const campinas = { type: "TMA", ident: "SBKP", name: "CAMPINAS", entryDistanceNm: 0, exitDistanceNm: 25 };
  const tmaSp = { type: "TMA", ident: "SBXP", name: "SAO PAULO", entryDistanceNm: 25, occupancyNm: [{ fromNm: 25, toNm: 80 }] };
  assert.equal(rea.originIsInsideTma(SDRK, [campinas, tmaSp]), false);
  assert.equal(rea.destReaTmaId(dest, [campinas, tmaSp], 80), "XP");
  const snapped = rea.snapRouteToVisualCorridors([SDRK, dest], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const originInside = rea.originIsInsideTma(SDRK, [campinas, tmaSp]);
  const destInside = rea.destIsInsideTma(dest, [campinas, tmaSp], 80);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, {
    originInsideTma: originInside,
    destInsideTma: destInside,
    originReaTmaId: rea.originReaTmaId(SDRK, [campinas, tmaSp]),
    destReaTmaId: rea.destReaTmaId(dest, [campinas, tmaSp], 80),
  });
  assert.notEqual(route, "REA", route);
  assert.match(route, /^DCT\b/, route);
  assert.match(route, /2249S04734W\/N0090VFR REA/, route);
  assert.doesNotMatch(route, /^REA\b/);
});

test("export FPL SBJD → SBGW é só REA (começa e termina no corredor)", () => {
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
  const SBGW = {
    lat: -22.7917,
    lng: -45.2044,
    label: "SBGW",
    raw: "SBGW",
    kind: "destination",
    fieldElevFt: 1765,
    altitudeFt: 1765,
  };
  const snapped = rea.snapRouteToVisualCorridors([SBJD, SBGW], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90);
  assert.equal(route, "REA", route);
});

test("export FPL SBJD → SDPW sai da TMA com ponto de saída + DCT", () => {
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
  const SDPW = {
    lat: -22.71056,
    lng: -47.61944,
    label: "SDPW",
    raw: "SDPW",
    kind: "destination",
    fieldElevFt: 1917,
    altitudeFt: 1917,
  };
  const snapped = rea.snapRouteToVisualCorridors([SBJD, SDPW], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { destInsideTma: false });
  assert.match(route, /^REA\b/, route);
  assert.match(route, /\bDCT$/, route);
  assert.notEqual(route, "REA", route);
  assert.match(route, /2249S04734W\/N0090A0\d{2} DCT/, route);
  const collapsed = rea.buildFplRouteText(withAlt, corridors, 90, {
    originInsideTma: true,
    destInsideTma: true,
    originReaTmaId: "XP",
    destReaTmaId: "XP",
  });
  assert.notEqual(collapsed, "REA", collapsed);
  assert.match(collapsed, /2249S04734W\/N0090A0\d{2} DCT/, collapsed);
});

test("export FPL SBJD → SDRK sai da TMA com ponto de saída + DCT", () => {
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
  const SDRK = {
    lat: -22.3964,
    lng: -47.5603,
    label: "SDRK",
    raw: "SDRK",
    kind: "destination",
    fieldElevFt: 1991,
    altitudeFt: 1991,
  };
  const snapped = rea.snapRouteToVisualCorridors([SBJD, SDRK], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applyCorridorAltitudes(snapped.waypoints, corridors);
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { originInsideTma: true, destInsideTma: false });
  assert.notEqual(route, "REA", route);
  assert.match(route, /^REA\b/, route);
  assert.match(route, /\bDCT$/, route);
  assert.match(route, /2236S04719W\/N0090A0\d{2} DCT/, route);
  const collapsed = rea.buildFplRouteText(withAlt, corridors, 90, {
    originInsideTma: true,
    destInsideTma: true,
    originReaTmaId: "XP",
    destReaTmaId: "XP",
  });
  assert.notEqual(collapsed, "REA", collapsed);
  assert.match(collapsed, /2236S04719W\/N0090A0\d{2} DCT/, collapsed);
});

test("TMA sem REA não conta como origem/destino dentro da TMA", () => {
  const origin = { lat: -22.3964, lng: -47.5603 };
  const dest = { lat: -23.1806, lng: -46.9444 };
  const campinas = { type: "TMA", ident: "SBKP", name: "CAMPINAS", entryDistanceNm: 0, exitDistanceNm: 10 };
  const tmaSp = { type: "TMA", ident: "SBXP", name: "SAO PAULO", entryDistanceNm: 20, exitDistanceNm: 80 };
  assert.equal(rea.originIsInsideTma(origin, [campinas, tmaSp]), false);
  assert.equal(rea.originReaTmaId(origin, [campinas, tmaSp]), null);
  assert.equal(rea.originReaTmaId(origin, [{ ...tmaSp, entryDistanceNm: 0 }]), "XP");
  assert.equal(rea.destIsInsideTma(dest, [campinas], 10), false);
  assert.equal(rea.destReaTmaId(dest, [tmaSp], 80), "XP");
  assert.equal(rea.hasTmaAirspaceData([campinas]), false);
  assert.equal(rea.hasTmaAirspaceData([tmaSp]), true);
  assert.equal(rea.reaTmaCodeFromIdentName("SBXP_02", "TMA SAO PAULO"), "XP");
  assert.equal(rea.reaTmaCodeFromIdentName("SBWH", "BELO HORIZONTE"), "WH");
  assert.equal(rea.reaTmaCodeFromIdentName("SBKP", "CAMPINAS"), null);
});

test("export FPL SBJD → SDRK → SBJD termina em REA e usa A055/A065", () => {
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
  const SDRK = {
    lat: -22.3964,
    lng: -47.5603,
    label: "SDRK",
    raw: "SDRK",
    kind: "airport",
    fieldElevFt: 1991,
    altitudeFt: 1991,
  };
  const dest = { ...SBJD, kind: "destination" };
  const snapped = rea.snapRouteToVisualCorridors([SBJD, SDRK, dest], national.features || []);
  assert.equal(snapped.ok, true, snapped.error);
  const corridors = rea.matchLegCorridors(snapped.waypoints, national.features || []);
  const withAlt = rea.applySemicircularCruiseAltitudes(
    rea.applyCorridorAltitudes(snapped.waypoints, corridors),
    corridors,
  );
  const route = rea.buildFplRouteText(withAlt, corridors, 90, { destInsideTma: false });
  assert.match(route, /^REA\b/, route);
  assert.match(route, /2249S04734W\/N0090VFR REA$/, route);
  assert.doesNotMatch(route, /2311S04657W/);
  assert.doesNotMatch(route, /\bDCT$/);
  assert.match(route, /2236S04719W\/N0090A0\d{2} DCT/, route);
  const tgl = withAlt.find((wp, idx) => idx > 0 && idx < withAlt.length - 1 && wp.kind === "airport");
  assert.ok(tgl, "SDRK deve permanecer como AD intermediário (TGL)");
  assert.equal(tgl.altitudeFt, Math.round(tgl.fieldElevFt), "TGL usa a elevação do aeródromo no perfil");
  for (let i = 1; i < withAlt.length - 1; i++) {
    const wp = withAlt[i];
    const alt = wp.altitudeFt;
    if (wp.kind === "airport") continue;
    if (!corridors[i]) {
      assert.ok(alt === 5500 || alt === 6500, `DCT ${wp.label} deve ser A055/A065, veio ${alt}`);
    } else if (corridors[i].altMax != null) {
      assert.equal(alt, Math.round(corridors[i].altMax), `REA ${wp.label} deve respeitar o teto do corredor`);
    }
  }
  const platformLike = rea.buildFplRouteText(withAlt, corridors, 90, {
    originInsideTma: true,
    destInsideTma: true,
    originReaTmaId: "XP",
    destReaTmaId: "XP",
  });
  assert.equal(platformLike, route, platformLike);
});
