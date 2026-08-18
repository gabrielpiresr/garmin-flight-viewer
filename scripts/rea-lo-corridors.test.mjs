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
