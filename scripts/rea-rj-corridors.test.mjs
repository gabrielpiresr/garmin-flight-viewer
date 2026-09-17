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

const SIVU = {
  lat: -20.422777778,
  lng: -40.333333333,
  label: "SIVU",
  raw: "SIVU",
  kind: "origin",
  fieldElevFt: 13,
  altitudeFt: 13,
};

const SDTK = {
  lat: -(23 + 13 / 60 + 26 / 3600),
  lng: -(44 + 43 / 60 + 23 / 3600),
  label: "SDTK",
  raw: "SDTK",
  kind: "destination",
  fieldElevFt: 10,
  altitudeFt: 10,
};

const SBJF = {
  lat: -(21 + 47 / 60 + 30 / 3600),
  lng: -(43 + 23 / 60 + 10 / 3600),
  label: "SBJF",
  raw: "SBJF",
  kind: "destination",
  fieldElevFt: 2989,
  altitudeFt: 2989,
};

function labelsOf(result) {
  return result.waypoints.map((wp) => wp.label || wp.raw);
}

test("SIVU -> SDTK mantém saída de Vitória e entra na WJ pelo Delta em PARA", () => {
  const result = rea.snapRouteToVisualCorridors([SIVU, SDTK], national.features || [], {
    tmaAirspaceKnown: true,
    originReaTmaId: "XR",
    destReaTmaId: "WJ",
  });
  assert.equal(result.ok, true, result.error);

  const labels = labelsOf(result);
  const route = labels.join(" > ");
  assert.ok(route.includes("PONTA DA FRUTA"), route);

  const expectedOrder = ["PARA", "VASSO", "PIRAÍ", "ARARA", "MANGA", "BAIA", "SDTK"];
  let cursor = -1;
  for (const label of expectedOrder) {
    const next = labels.findIndex((item, idx) => idx > cursor && item === label);
    assert.ok(next > cursor, `missing ${label} after ${cursor}: ${route}`);
    cursor = next;
  }

  assert.ok(result.corridorNames.includes("DELTA"), result.corridorNames.join(" | "));
  assert.ok(!route.includes("LARANJEIRAS"), route);
});

test("SIVU -> SBJF não usa a TMA Rio como terminal intermediária", () => {
  const result = rea.snapRouteToVisualCorridors([SIVU, SBJF], national.features || [], {
    tmaAirspaceKnown: true,
    originReaTmaId: "XR",
    destReaTmaId: null,
  });
  assert.equal(result.ok, true, result.error);

  const route = labelsOf(result).join(" > ");
  assert.ok(route.includes("VIANA"), route);
  assert.ok(!route.includes("PARA"), route);
  assert.ok(!route.includes("VASSO"), route);
  assert.ok(!route.includes("PRETO"), route);
  assert.ok(route.endsWith("SBJF"), route);
});
