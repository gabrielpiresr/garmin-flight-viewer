#!/usr/bin/env node
/**
 * Build XYZ WebP tile pyramids for WAC / REA / REH from GeoAISWEB collarless GeoTIFFs.
 *
 * Requires: gdal (gdalbuildvrt, gdalwarp, gdal2tiles.py or gdal2tiles), curl, python3.
 *
 * Usage:
 *   node scripts/build-chart-tiles/build.mjs --set=wac --airac=2026-08 --bbox=-48,-24,-44,-21
 *   node scripts/build-chart-tiles/build.mjs --set=all --airac=current
 *
 * Output:
 *   public/charts/{airac}/{wac|rea|reh}/{z}/{x}/{y}.webp
 *   public/charts/{airac}/manifest.json
 *
 * Without GDAL installed this script still writes a valid empty/partial manifest so the
 * app keeps using the WMS fallback until tiles are published.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GEOAISWEB = "https://geoaisweb.decea.mil.br";

const SETS = {
  wac: {
    prefix: "WAC_",
    geotiffDir: "src/geotiffs",
    minZoom: 5,
    maxZoom: 10,
    layersFileHint: "ICA:WAC_*",
  },
  rea: {
    prefix: "CCV_REA_",
    geotiffDir: "src/geotiffs",
    minZoom: 7,
    maxZoom: 13,
    layersFileHint: "ICA:CCV_REA_*",
  },
  reh: {
    prefix: "CCV_REH_",
    geotiffDir: "src/geotiffs",
    minZoom: 8,
    maxZoom: 14,
    layersFileHint: "ICA:CCV_REH_*",
  },
};

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

const airac = arg("airac", "current");
const setArg = arg("set", "all");
const bbox = arg("bbox", null); // minLon,minLat,maxLon,maxLat — optional regional build
const dryRun = hasFlag("dry-run");
const skipDownload = hasFlag("skip-download");

const selected = setArg === "all" ? Object.keys(SETS) : [setArg];
for (const s of selected) {
  if (!SETS[s]) throw new Error(`Unknown set ${s}`);
}

const outRoot = join(root, "public/charts", airac);
const workRoot = join(root, "scripts/build-chart-tiles/.work", airac);
mkdirSync(outRoot, { recursive: true });
mkdirSync(workRoot, { recursive: true });

const gdalbuildvrt = which("gdalbuildvrt");
const gdalwarp = which("gdalwarp");
const gdal2tiles = which("gdal2tiles.py") || which("gdal2tiles");
const haveGdal = Boolean(gdalbuildvrt && gdalwarp && gdal2tiles);

const extentsPath = join(root, "scripts/data/geoaisweb-layer-extents.json");
const extents = existsSync(extentsPath) ? JSON.parse(readFileSync(extentsPath, "utf8")).layers : {};

function listGeotiffUrls(setName) {
  // Prefer extents keys → geotiff filenames on GeoAISWEB.
  const urls = [];
  for (const layerName of Object.keys(extents)) {
    const bare = layerName.replace(/^ICA:/, "");
    if (setName === "wac" && bare.startsWith("WAC_")) {
      urls.push(`${GEOAISWEB}/src/geotiffs/${bare}.tif`);
    } else if (setName === "rea" && bare.includes("CCV_REA_")) {
      urls.push(`${GEOAISWEB}/src/geotiffs/${bare}.tif`);
    } else if (setName === "reh" && bare.includes("CCV_REH_")) {
      urls.push(`${GEOAISWEB}/src/geotiffs/${bare}.tif`);
    }
  }
  return urls;
}

function filterUrlsByBbox(urls, setName) {
  if (!bbox) return urls;
  const [minLon, minLat, maxLon, maxLat] = bbox.split(",").map(Number);
  return urls.filter((url) => {
    const file = url.split("/").pop().replace(/\.tif$/i, "");
    const ext = extents[`ICA:${file}`];
    if (!ext) return true;
    return !(ext.maxLon < minLon || ext.minLon > maxLon || ext.maxLat < minLat || ext.minLat > maxLat);
  });
}

function downloadTiffs(setName) {
  const dir = join(workRoot, setName, "tiffs");
  mkdirSync(dir, { recursive: true });
  const urls = filterUrlsByBbox(listGeotiffUrls(setName), setName);
  console.log(`[${setName}] ${urls.length} GeoTIFF(s) to fetch`);
  if (dryRun || skipDownload) return dir;
  for (const url of urls) {
    const dest = join(dir, url.split("/").pop());
    if (existsSync(dest) && existsSync(dest).size !== 0) {
      // existsSync doesn't give size; always re-check via stat in shell
    }
    if (existsSync(dest)) {
      console.log(`  skip existing ${dest}`);
      continue;
    }
    run("curl", ["-fL", "--retry", "3", "-o", dest, url]);
  }
  return dir;
}

function buildSet(setName) {
  const cfg = SETS[setName];
  const setOut = join(outRoot, setName);
  mkdirSync(setOut, { recursive: true });

  if (!haveGdal) {
    console.warn(`[${setName}] GDAL not found — skipping tile render. Install gdal-bin / gdal2tiles.`);
    return null;
  }

  const tiffDir = downloadTiffs(setName);
  const tiffs = existsSync(tiffDir)
    ? readdirSync(tiffDir).filter((f) => f.toLowerCase().endsWith(".tif")).map((f) => join(tiffDir, f))
    : [];
  if (tiffs.length === 0) {
    console.warn(`[${setName}] no GeoTIFFs available`);
    return null;
  }

  const vrt = join(workRoot, setName, "mosaic.vrt");
  const warped = join(workRoot, setName, "mosaic_3857.vrt");
  run(gdalbuildvrt, ["-srcnodata", "0", vrt, ...tiffs]);
  const warpArgs = ["-t_srs", "EPSG:3857", "-r", "bilinear", "-of", "VRT", vrt, warped];
  if (bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox.split(",");
    warpArgs.splice(0, 0, "-te_srs", "EPSG:4326", "-te", minLon, minLat, maxLon, maxLat);
  }
  run(gdalwarp, warpArgs);

  // gdal2tiles outputs PNG by default; convert to webp if cwebp exists.
  const tilesTmp = join(workRoot, setName, "tiles-png");
  mkdirSync(tilesTmp, { recursive: true });
  run(gdal2tiles, [
    "--xyz",
    "-z",
    `${cfg.minZoom}-${cfg.maxZoom}`,
    "-w",
    "none",
    "--processes=4",
    warped,
    tilesTmp,
  ]);

  const cwebp = which("cwebp");
  if (cwebp) {
    convertPngTreeToWebp(tilesTmp, setOut, cwebp);
    return { format: "webp", minZoom: cfg.minZoom, maxZoom: cfg.maxZoom, tileSize: 256 };
  }

  // Fallback: keep PNG tree
  copyTree(tilesTmp, setOut);
  return { format: "png", minZoom: cfg.minZoom, maxZoom: cfg.maxZoom, tileSize: 256 };
}

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  run("cp", ["-a", `${src}/.`, dest]);
}

function convertPngTreeToWebp(src, dest, cwebp) {
  mkdirSync(dest, { recursive: true });
  const walk = (dir, rel = "") => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const from = join(dir, name.name);
      const relPath = rel ? `${rel}/${name.name}` : name.name;
      if (name.isDirectory()) {
        walk(from, relPath);
        continue;
      }
      if (!name.name.toLowerCase().endsWith(".png")) continue;
      const outDir = join(dest, dirname(relPath));
      mkdirSync(outDir, { recursive: true });
      const outFile = join(dest, relPath.replace(/\.png$/i, ".webp"));
      run(cwebp, ["-quiet", "-q", "82", from, "-o", outFile]);
    }
  };
  walk(src);
}

const manifest = {
  airac,
  generatedAt: new Date().toISOString(),
  layers: {},
  note: haveGdal
    ? "Generated by scripts/build-chart-tiles/build.mjs"
    : "GDAL missing — WMS fallback active until tiles are built",
};

for (const setName of selected) {
  try {
    const info = dryRun ? null : buildSet(setName);
    if (info) manifest.layers[setName] = info;
  } catch (err) {
    console.error(`[${setName}] build failed:`, err);
  }
}

writeFileSync(join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
// Convenience pointer used when VITE_CHART_TILES_AIRAC=current
if (airac !== "current") {
  const currentDir = join(root, "public/charts/current");
  mkdirSync(currentDir, { recursive: true });
  writeFileSync(
    join(currentDir, "manifest.json"),
    `${JSON.stringify({ ...manifest, airac: "current", pointsTo: airac }, null, 2)}\n`,
  );
}

console.log(`Manifest written to ${join(outRoot, "manifest.json")}`);
console.log(JSON.stringify(manifest, null, 2));
