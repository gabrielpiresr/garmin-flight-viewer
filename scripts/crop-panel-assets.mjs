/**
 * Crops mockup composites into high-quality panel + zoom assets under public/panels/.
 * Usage: node scripts/crop-panel-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "panels");
const assetsDir = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "c-Users-User-Desktop-teste-cursor-garmin-flight-viewer",
  "assets",
);

const GLASS_SRC = path.join(
  assetsDir,
  "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images__PS-DZB__Mock_Up_Painel__1_-f6ddfb30-2f59-450c-bea0-ea506ec79c0b.png",
);
const ANALOG_SRC = path.join(
  assetsDir,
  "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images__PS-DZA__Mock_Up_Painel__2_-d84aa589-a751-4fc4-9ee7-3883a726a92a.png",
);

/** @param {{ x:number,y:number,w:number,h:number }} region @param {number} scale */
async function crop(src, outName, region, scale = 1) {
  const meta = await sharp(src).metadata();
  const left = Math.round((region.x / 100) * meta.width);
  const top = Math.round((region.y / 100) * meta.height);
  const width = Math.min(Math.round((region.w / 100) * meta.width), meta.width - left);
  const height = Math.min(Math.round((region.h / 100) * meta.height), meta.height - top);
  const out = path.join(outDir, outName);

  let pipeline = sharp(src).extract({
    left: Math.max(0, left),
    top: Math.max(0, top),
    width,
    height,
  });

  if (scale > 1) {
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
    });
  }

  // PNG avoids a second lossy JPEG pass on already-compressed sources.
  await pipeline.png({ compressionLevel: 6, adaptiveFiltering: true }).toFile(out);
  const outMeta = await sharp(out).metadata();
  console.log(`  ✓ ${outName} (${outMeta.width}x${outMeta.height})`);
}

async function copyFullPng(src, outName) {
  const out = path.join(outDir, outName);
  await sharp(src).png({ compressionLevel: 6 }).toFile(out);
  console.log(`  ✓ ${outName} (full)`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log("\n=== Crop panel assets (hi-res PNG) ===\n");

  if (!fs.existsSync(GLASS_SRC) || !fs.existsSync(ANALOG_SRC)) {
    console.error("Source mockup images not found in Cursor assets folder.");
    process.exit(1);
  }

  // Panel dashboard: upscale ~2.5x so it stays sharp on wide screens.
  const PANEL_SCALE = 2.5;
  const ZOOM_SCALE = 2;

  console.log("[glass]");
  await copyFullPng(GLASS_SRC, "montaer-glass-full.png");
  await crop(GLASS_SRC, "montaer-glass-panel.png", { x: 3, y: 1.5, w: 94, h: 29 }, PANEL_SCALE);
  await crop(GLASS_SRC, "montaer-glass-g3x.png", { x: 3, y: 62, w: 48, h: 30 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-switches.png", { x: 52, y: 68, w: 45, h: 18 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-g5.png", { x: 42, y: 10, w: 14, h: 10 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-radio.png", { x: 40, y: 20, w: 18, h: 7 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-ipad.png", { x: 62, y: 6, w: 30, h: 20 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-throttle.png", { x: 40, y: 42, w: 20, h: 22 }, ZOOM_SCALE);
  await crop(GLASS_SRC, "montaer-glass-yoke.png", { x: 8, y: 36, w: 30, h: 22 }, ZOOM_SCALE);

  console.log("\n[analog]");
  await copyFullPng(ANALOG_SRC, "montaer-analog-full.png");
  await crop(ANALOG_SRC, "montaer-analog-panel.png", { x: 2, y: 1, w: 96, h: 31 }, PANEL_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-engine.png", { x: 52, y: 34, w: 45, h: 22 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-switches.png", { x: 48, y: 56, w: 48, h: 12 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-fuel.png", { x: 4, y: 70, w: 18, h: 16 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-g5.png", { x: 24, y: 70, w: 22, h: 18 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-map.png", { x: 48, y: 70, w: 32, h: 20 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-asi.png", { x: 8, y: 8, w: 10, h: 8 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-alt.png", { x: 20, y: 8, w: 10, h: 8 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-radio.png", { x: 38, y: 22, w: 22, h: 8 }, ZOOM_SCALE);
  await crop(ANALOG_SRC, "montaer-analog-throttle.png", { x: 28, y: 38, w: 18, h: 24 }, ZOOM_SCALE);

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
