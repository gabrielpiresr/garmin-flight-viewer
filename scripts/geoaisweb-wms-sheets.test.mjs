/**
 * Unit tests for WMS sheet selection (bbox ∩ LatLon extents).
 * Run: node --test scripts/geoaisweb-wms-sheets.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const mod = await import("../api/geoaisweb/wms.js");

test("intersects detects overlap and separation", () => {
  assert.equal(
    mod.intersects(
      { minLon: -48, minLat: -24, maxLon: -44, maxLat: -21 },
      { minLon: -47, minLat: -23, maxLon: -45, maxLat: -22 },
    ),
    true,
  );
  assert.equal(
    mod.intersects(
      { minLon: -48, minLat: -24, maxLon: -44, maxLat: -21 },
      { minLon: -40, minLat: -10, maxLon: -38, maxLat: -8 },
    ),
    false,
  );
});

test("selectIntersectingLayers keeps Sao Paulo WAC for SP bbox", () => {
  const layers = [
    "ICA:WAC_3262_SAO_PAULO",
    "ICA:WAC_2948_MANAUS",
    "ICA:WAC_3384_PORTO_ALEGRE",
  ];
  const lon = -47.5;
  const lat = -23.5;
  const x = (lon / 180) * 20037508.342789244;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.342789244 / Math.PI);
  const pad = 50_000;
  const bbox = [x - pad, y - pad, x + pad, y + pad];
  const selected = mod.selectIntersectingLayers("wac", layers, bbox, "EPSG:3857");
  assert.ok(selected.includes("ICA:WAC_3262_SAO_PAULO"), `got ${selected.join(",")}`);
  assert.ok(!selected.includes("ICA:WAC_2948_MANAUS"), `unexpected Manaus in ${selected.join(",")}`);
});

test("bboxToLonLat mercator near origin", () => {
  const box = mod.bboxToLonLat([0, 0, 1000, 1000], "EPSG:3857");
  assert.ok(Math.abs(box.minLon) < 0.02);
  assert.ok(Math.abs(box.minLat) < 0.02);
});
