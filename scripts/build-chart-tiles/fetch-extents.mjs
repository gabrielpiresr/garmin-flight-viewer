#!/usr/bin/env node
/**
 * Refresh LatLonBoundingBox extents from GeoAISWEB WMS GetCapabilities.
 * Writes api/geoaisweb/layerExtents.js + scripts/data/geoaisweb-layer-extents.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CAPS_URL =
  "https://geoaisweb.decea.mil.br/geoserver/ows?service=WMS&version=1.1.1&request=GetCapabilities";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function parseExtents(xml) {
  const layers = {};
  const layerBlocks = xml.split(/<Layer(?:\s[^>]*)?>/i).slice(1);
  for (const block of layerBlocks) {
    const nameMatch = block.match(/<Name>([^<]+)<\/Name>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!(name.startsWith("ICA:WAC_") || name.includes("CCV_REA_") || name.includes("CCV_REH_"))) {
      continue;
    }
    const bb = block.match(
      /<LatLonBoundingBox[^>]*minx="([^"]+)"[^>]*miny="([^"]+)"[^>]*maxx="([^"]+)"[^>]*maxy="([^"]+)"/i,
    );
    if (!bb) continue;
    layers[name] = {
      minLon: Number(bb[1]),
      minLat: Number(bb[2]),
      maxLon: Number(bb[3]),
      maxLat: Number(bb[4]),
    };
  }
  return layers;
}

const res = await fetch(CAPS_URL, {
  headers: { "User-Agent": "garmin-flight-viewer/chart-extents" },
});
if (!res.ok) throw new Error(`GetCapabilities failed: ${res.status}`);
const xml = await res.text();
const layers = parseExtents(xml);
if (Object.keys(layers).length < 50) {
  throw new Error(`Too few extents parsed (${Object.keys(layers).length})`);
}

const payload = {
  source: "geoaisweb WMS 1.1.1 GetCapabilities LatLonBoundingBox",
  fetchedAt: new Date().toISOString(),
  layers,
};

mkdirSync(join(root, "scripts/data"), { recursive: true });
writeFileSync(join(root, "scripts/data/geoaisweb-layer-extents.json"), `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(join(root, "api/geoaisweb/layer-extents.json"), `${JSON.stringify(payload, null, 2)}\n`);

const js = `/** Auto-generated from GeoAISWEB WMS GetCapabilities. Refresh: node scripts/build-chart-tiles/fetch-extents.mjs */\nexport const LAYER_EXTENTS_SOURCE = ${JSON.stringify(payload.source)};\nexport const LAYER_EXTENTS = ${JSON.stringify(layers, null, 2)};\n`;
writeFileSync(join(root, "api/geoaisweb/layerExtents.js"), js);

console.log(`Wrote ${Object.keys(layers).length} layer extents.`);
