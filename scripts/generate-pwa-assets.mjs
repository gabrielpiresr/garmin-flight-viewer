import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const screenshotsDir = path.join(publicDir, "screenshots");
const iconSrc = path.join(publicDir, "icon-512.png");

const theme = { bg: "#020617", accent: "#34d399", text: "#e2e8f0" };

async function renderScreenshot(width, height, title) {
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg}"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="24" y="24" width="${width - 48}" height="56" rx="12" fill="#0f172a" stroke="${theme.accent}" stroke-width="2"/>
  <text x="48" y="62" fill="${theme.text}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600">Portal EDB</text>
  <rect x="24" y="96" width="${width - 48}" height="${height - 120}" rx="16" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
  <text x="48" y="150" fill="${theme.accent}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${title}</text>
  <text x="48" y="190" fill="${theme.text}" font-family="Segoe UI, Arial, sans-serif" font-size="18" opacity="0.9">Gestao de voo e diario de bordo</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

await mkdir(screenshotsDir, { recursive: true });

const [wide, narrow, favicon48] = await Promise.all([
  renderScreenshot(1280, 720, "Painel web"),
  renderScreenshot(390, 844, "App mobile"),
  sharp(iconSrc).resize(48, 48, { fit: "cover" }).png().toBuffer(),
]);

await Promise.all([
  writeFile(path.join(screenshotsDir, "desktop-wide.png"), wide),
  writeFile(path.join(screenshotsDir, "mobile-narrow.png"), narrow),
  writeFile(path.join(publicDir, "favicon-48.png"), favicon48),
]);

console.log("PWA assets generated in public/ and public/screenshots/");
