import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tabsDir = path.resolve(".tmp/combustivel-2026-tabs");

if (!fs.existsSync(tabsDir)) {
  console.error(`Diretório não encontrado: ${tabsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(tabsDir)
  .filter((name) => name.toLowerCase().endsWith(".csv"))
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

if (files.length === 0) {
  console.error(`Nenhum CSV encontrado em: ${tabsDir}`);
  process.exit(1);
}

const runMode = process.argv.includes("--run");
const baseArgs = ["scripts/import-fuelings-from-csv.mjs"];
if (runMode) baseArgs.push("--run");

let failed = false;
for (const file of files) {
  const csvPath = path.join(tabsDir, file);
  const args = [...baseArgs, `--csv=${csvPath}`];
  console.log(`\n=== ${file} ===`);
  const result = spawnSync("node", args, { encoding: "utf8", stdio: "pipe" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failed = true;
    console.error(`Falhou em ${file} (exit ${result.status})`);
    break;
  }
}

if (failed) process.exit(1);
console.log(`\nProcesso concluído (${runMode ? "modo run" : "modo dry-run"}).`);
