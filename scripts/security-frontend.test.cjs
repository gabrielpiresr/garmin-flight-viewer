const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("public proposal page loads proposals through the admin-users public function helper", () => {
  const page = read("src/pages/PublicProposalPage.tsx");
  assert.match(page, /getPublicProposalByToken/);
  assert.doesNotMatch(page, /import\s*\{\s*getProposalByToken\s*\}/);
});

test("public proposal helper calls getPublicProposal and keeps compat fallback explicit", () => {
  const lib = read("src/lib/crmProposalsDb.ts");
  assert.match(lib, /action:\s*"getPublicProposal"/);
  assert.match(lib, /VITE_ADMIN_USERS_SECURITY_MODE/);
  assert.match(lib, /getProposalByToken\(token\)/);
});

test("public proposal payload is normalized before rendering", () => {
  const lib = read("src/lib/crmProposalsDb.ts");
  assert.match(lib, /function normalizePublicProposal/);
  assert.match(lib, /products:\s*Array\.isArray\(proposal\.products\)/);
  assert.match(lib, /infoPackages:\s*Array\.isArray\(proposal\.infoPackages\)/);
  assert.match(lib, /normalizePublicProposal\(body\.proposal\)/);
});

test("admin-users public proposal response keeps info packages", () => {
  const main = read("functions/admin-users/src/main.js");
  assert.match(main, /const infoPackages = Array\.isArray\(productsData\?\.infoPackages\)/);
  assert.match(main, /infoPackages,/);
});

test("public flight review helper still calls the public share action", () => {
  const lib = read("src/lib/publicFlightReviewShare.ts");
  assert.match(lib, /action:\s*"getPublicFlightReviewShare"/);
});

test("public flight review telemetry does not spin forever without csv", () => {
  const page = read("src/pages/PublicFlightReviewPage.tsx");
  assert.match(page, /if \(!share\.flight\.csv_text\)/);
  assert.match(page, /setTelemetryReady\(true\)/);
});

test("strict public flight review keeps sanitized telemetry csv", () => {
  const main = read("functions/admin-users/src/main.js");
  assert.match(main, /function publicTelemetryCsvText/);
  assert.match(main, /meta\.header\.studentUserId = ""/);
  assert.match(main, /meta\.header\.instructorUserId = ""/);
  assert.match(main, /publicTelemetryCsvText\(csvText \|\| ""\)/);
});
