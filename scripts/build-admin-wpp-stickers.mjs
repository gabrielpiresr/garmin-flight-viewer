import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDir = join(root, ".tmp");
const entryPath = join(tmpDir, "admin-wpp-stickers-entry.ts");
const visualSourcePath = join(tmpDir, "flightShareStickers.visual-only.ts");
const outFile = join(root, "functions", "admin-users", "src", "flightShareStickers.generated.cjs");

mkdirSync(tmpDir, { recursive: true });
const originalSource = readFileSync(join(root, "src", "lib", "flightShareStickers.ts"), "utf8");
const firstExport = originalSource.indexOf("export type FlightShareStickerId");
if (firstExport < 0) throw new Error("Could not locate flightShareStickers exports.");
const visualOnlySource = originalSource
  .slice(firstExport)
  .replace("async function buildRouteMap", "export async function buildRouteMap");
writeFileSync(
  visualSourcePath,
  [
    'import { formatAltFt, formatSpeedKt } from "../src/lib/flightStats";',
    visualOnlySource,
    "",
  ].join("\n"),
);
writeFileSync(
  entryPath,
  [
    'export { buildFlightShareStickers } from "./flightShareStickers.visual-only";',
    'export { buildRouteMap } from "./flightShareStickers.visual-only";',
    'export { buildFlightDisplayInfo } from "../src/lib/flightDisplay";',
    'export { decodeFlightRecord } from "../src/lib/flightRecordCodec";',
    'export { parseGarminCsv } from "../src/lib/parseGarminCsv";',
    'export { chartDurationSec, formatDuration, summarizeFlight } from "../src/lib/flightStats";',
    "",
  ].join("\n"),
);

await esbuild.build({
  entryPoints: [entryPath],
  outfile: outFile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  treeShaking: true,
  legalComments: "none",
  logLevel: "silent",
});

console.log(`Built ${outFile}`);
