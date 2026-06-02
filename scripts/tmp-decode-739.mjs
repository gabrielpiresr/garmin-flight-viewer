import fs from "node:fs";
import * as sdk from "node-appwrite";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i)] = t.slice(i + 1);
}

const META_PREFIX = "#GFV_META_V1:";
function decodeFlightMeta(csvText) {
  if (!csvText || !String(csvText).startsWith(META_PREFIX)) return null;
  const line = String(csvText).split("\n")[0];
  const payload = line.slice(META_PREFIX.length);
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

const db = new sdk.Databases(
  new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY),
);
const d = await db.getDocument({
  databaseId: env.VITE_APPWRITE_DATABASE_ID,
  collectionId: env.VITE_APPWRITE_COLLECTION_ID,
  documentId: "saga_flight_739",
});
const meta = decodeFlightMeta(d.csv_text);
const legLandings = (meta?.legs || []).map((leg, i) => ({
  i,
  landings: leg.landings,
  dep: leg.dep,
  arr: leg.arr,
}));
const sagaLegs = (meta?.saga?.legs || []).map((leg, i) => ({
  i,
  numeroPousos: leg.numeroPousos,
}));
console.log(
  JSON.stringify(
    {
      docLandings: d.landings,
      metaLegLandingsSum: (meta?.legs || []).reduce((a, leg) => a + (Number(leg.landings) || 0), 0),
      legLandings,
      sagaLegs,
    },
    null,
    2,
  ),
);
