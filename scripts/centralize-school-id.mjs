/**
 * For each file: ensure DEFAULT_SCHOOL_ID is in the appwrite import block.
 * Run: node scripts/centralize-school-id.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FILES = [
  "src/contexts/AuthContext.tsx",
  "src/lib/creditsDb.ts",
  "src/lib/flightDiscrepanciesDb.ts",
  "src/lib/flightsDb.ts",
  "src/lib/flightSignaturesDb.ts",
  "src/lib/helpCenterDb.ts",
  "src/lib/instructorCostsDb.ts",
  "src/lib/logbookOpeningSignaturesDb.ts",
  "src/lib/maneuversDb.ts",
  "src/lib/manuaisDb.ts",
  "src/lib/noticesDb.ts",
  "src/lib/productSalesDb.ts",
  "src/lib/rbac.ts",
  "src/lib/rewardsDb.ts",
  "src/lib/schoolCostsDb.ts",
  "src/lib/schoolProductsDb.ts",
  "src/lib/trainingExercisesDb.ts",
  "src/lib/trainingTracksDb.ts",
  "src/lib/weeklyFlightPlansDb.ts",
];

let changed = 0;
let skipped = 0;

for (const rel of FILES) {
  const fullPath = join(ROOT, rel);
  let src;
  try {
    src = readFileSync(fullPath, "utf8");
  } catch {
    console.warn(`  ⚠  Cannot read ${rel}`);
    skipped++;
    continue;
  }

  // Find the appwrite import block
  const importBlockRe = /(import\s*\{[\s\S]*?\}\s*from\s*['"](?:\.\.\/lib\/appwrite|\.\/appwrite)['"])/;
  const importMatch = importBlockRe.exec(src);
  if (!importMatch) {
    console.warn(`  ⚠  ${rel} — no appwrite import block found`);
    skipped++;
    continue;
  }

  const originalBlock = importMatch[1];

  // If DEFAULT_SCHOOL_ID is already in this import block, skip
  if (/\bDEFAULT_SCHOOL_ID\b/.test(originalBlock)) {
    console.log(`  • ${rel} — import already correct`);
    skipped++;
    continue;
  }

  // Insert DEFAULT_SCHOOL_ID right after SCHOOL_ID in the import block
  if (!/\bSCHOOL_ID\b/.test(originalBlock)) {
    console.warn(`  ⚠  ${rel} — SCHOOL_ID not in import block, skipping`);
    skipped++;
    continue;
  }

  const patchedBlock = originalBlock.replace(/\bSCHOOL_ID\b/, "SCHOOL_ID, DEFAULT_SCHOOL_ID");
  const next = src.replace(originalBlock, patchedBlock);

  writeFileSync(fullPath, next, "utf8");
  console.log(`  ✓ ${rel}`);
  changed++;
}

console.log(`\nDone: ${changed} files updated, ${skipped} skipped.`);
