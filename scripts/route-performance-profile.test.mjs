import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const perf = require("../functions/admin-users/src/routePerformanceProfile.js");
const wppRoute = require("../functions/admin-users/src/wppRoute.js");

function altAt(profile, xNm) {
  const pts = profile.profile;
  if (!pts?.length) return null;
  if (xNm <= pts[0].xNm) return pts[0].altFt;
  const last = pts[pts.length - 1];
  if (xNm >= last.xNm) return last.altFt;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (xNm > b.xNm) continue;
    if (b.xNm === a.xNm) return b.altFt;
    const t = (xNm - a.xNm) / (b.xNm - a.xNm);
    return a.altFt + (b.altFt - a.altFt) * t;
  }
  return last.altFt;
}

/** 60 kt / 500 fpm → 500 ft por NM. Pernas de 20 NM. */
const SETTINGS = {
  ...perf.DEFAULT_FLIGHT_PERFORMANCE,
  cruiseSpeedKt: 90,
  climbSpeedKt: 60,
  climbRateFpm: 500,
  descentSpeedKt: 60,
  descentRateFpm: 500,
};

const ORIGIN = {
  lat: -23,
  lng: -47,
  label: "A",
  kind: "origin",
  fieldElevFt: 2000,
  altitudeFt: 2000,
};
const MID = {
  lat: -23 + 20 / 60,
  lng: -47,
  label: "B",
  kind: "fix",
  altitudeFt: 4500,
};
const DEST = {
  lat: -23 + 40 / 60,
  lng: -47,
  label: "C",
  kind: "destination",
  fieldElevFt: 2000,
  altitudeFt: 2000,
};

function profileFor(ref) {
  return perf.buildRoutePerformanceProfile([ORIGIN, { ...MID, altitudeRef: ref }, DEST], SETTINGS);
}

test("aliases de modo de altitude", () => {
  assert.equal(perf.altitudeRefMode({}), "bs");
  assert.equal(perf.altitudeRefMode({ altitudeRef: "start" }), "as");
  assert.equal(perf.altitudeRefMode({ altitudeRef: "before" }), "be");
  assert.equal(perf.altitudeRefMode({ altitudeRef: "after" }), "ae");
});

test("AS sobe no início do segmento na razão de subida", () => {
  const p = profileFor("as");
  assert.ok(p);
  const climbNm = perf.altitudeChangeDistanceNm(2500, 500, 60);
  assert.ok(Math.abs(climbNm - 5) < 0.01);
  assert.ok(altAt(p, 1) > 2400 && altAt(p, 1) < 2600, `1 NM ${altAt(p, 1)}`);
  assert.ok(Math.abs(altAt(p, 5) - 4500) < 80, `TOC ${altAt(p, 5)}`);
  assert.ok(Math.abs(altAt(p, 12) - 4500) < 80, `level ${altAt(p, 12)}`);
});

test("BE mantém altitude e sobe na razão até o ponto", () => {
  const p = profileFor("be");
  assert.ok(p);
  assert.ok(Math.abs(altAt(p, 2) - 2000) < 80, `início ${altAt(p, 2)}`);
  assert.ok(altAt(p, 16) > 2100, `já subindo ${altAt(p, 16)}`);
  const bNm = p.profile.find((pt) => pt.label === "B")?.xNm ?? 20;
  assert.ok(Math.abs(altAt(p, bNm) - 4500) < 80, `no ponto ${altAt(p, bNm)}`);
});

test("AE só sobe depois de passar o ponto, na razão de subida", () => {
  const p = profileFor("ae");
  assert.ok(p);
  const bNm = p.profile.find((pt) => pt.label === "B")?.xNm ?? 20;
  assert.ok(Math.abs(altAt(p, bNm - 0.5) - 2000) < 80, `antes ${altAt(p, bNm - 0.5)}`);
  assert.ok(altAt(p, bNm + 1) > 2400 && altAt(p, bNm + 1) < 2700, `depois ${altAt(p, bNm + 1)}`);
});

test("BS no primeiro intermediário sobe no início (sem perna anterior)", () => {
  const p = profileFor("bs");
  assert.ok(p);
  assert.ok(altAt(p, 1) > 2400 && altAt(p, 1) < 2600, `1 NM ${altAt(p, 1)}`);
  assert.ok(Math.abs(altAt(p, 5) - 4500) < 80, `TOC ${altAt(p, 5)}`);
});

test("BS no segundo ponto atinge a altitude antes do segmento dele", () => {
  const p1 = { lat: -23 + 20 / 60, lng: -47, label: "P1", kind: "fix", altitudeFt: 3500, altitudeRef: "as" };
  const p2 = { lat: -23 + 40 / 60, lng: -47, label: "P2", kind: "fix", altitudeFt: 5000, altitudeRef: "bs" };
  const dest = { ...DEST, lat: -23 + 60 / 60 };
  const p = perf.buildRoutePerformanceProfile([ORIGIN, p1, p2, dest], SETTINGS);
  assert.ok(p);
  const p1Nm = p.profile.find((pt) => pt.label === "P1")?.xNm ?? 20;
  assert.ok(Math.abs(altAt(p, p1Nm) - 5000) < 80, `P1 deve já estar em 5000 (BS de P2) ${altAt(p, p1Nm)}`);
  assert.ok(Math.abs(altAt(p, p1Nm + 2) - 5000) < 80, `início do segmento P2 ${altAt(p, p1Nm + 2)}`);
});

test("BE do ponto atual não é sobrescrito pelo BS padrão do próximo", () => {
  const p1 = { lat: -23 + 20 / 60, lng: -47, label: "P1", kind: "fix", altitudeFt: 3500, altitudeRef: "be" };
  const p2 = { lat: -23 + 40 / 60, lng: -47, label: "P2", kind: "fix", altitudeFt: 5000, altitudeRef: "as" };
  const dest = { ...DEST, lat: -23 + 60 / 60 };
  const p = perf.buildRoutePerformanceProfile([ORIGIN, p1, p2, dest], SETTINGS);
  assert.ok(p);
  const p1Nm = p.profile.find((pt) => pt.label === "P1")?.xNm ?? 20;
  assert.ok(Math.abs(altAt(p, p1Nm) - 3500) < 80, `BE em P1 ${altAt(p, p1Nm)}`);
  assert.ok(altAt(p, p1Nm + 1) > 3600, `AS de P2 sobe depois ${altAt(p, p1Nm + 1)}`);
});

test("descida final usa a razão de descida (não cai no destino)", () => {
  const p = profileFor("as");
  const lastNm = p.totalDistanceNm;
  const tod = p.tod;
  assert.ok(tod, "precisa de TOD");
  const slope = (altAt(p, tod.xNm) - altAt(p, lastNm)) / Math.max(0.1, lastNm - tod.xNm);
  assert.ok(slope > 400 && slope < 600, `slope ${slope} ft/NM`);
});

test("WhatsApp parse: Ver na plataforma / wpp_open_route", () => {
  assert.equal(wppRoute.parseWppRouteCommand("", "wpp_open_route")?.kind, "open");
  assert.equal(wppRoute.parseWppRouteCommand("Ver na plataforma")?.kind, "open");
  assert.equal(wppRoute.parseWppRouteCommand("Rota SBJD SBBH")?.kind, "route");
  assert.equal(wppRoute.parseWppRouteCommand("Rota SBJD SBBH")?.origin, "SBJD");
  const multi = wppRoute.parseWppRouteCommand("Rota SBJD SDCO SDPW SBJD");
  assert.equal(multi?.kind, "route");
  assert.deepEqual(multi?.icaos, ["SBJD", "SDCO", "SDPW", "SBJD"]);
  assert.equal(multi?.origin, "SBJD");
  assert.equal(multi?.destination, "SBJD");
  assert.equal(wppRoute.parseWppRouteCommand("Rota SBJD para SBLO")?.destination, "SBLO");
});
