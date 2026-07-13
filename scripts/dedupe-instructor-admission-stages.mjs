import { Client, Databases, Query } from "node-appwrite";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split(/\r?\n/)
    .flatMap((l) => {
      const i = l.indexOf("=");
      return i <= 0 || l.startsWith("#") ? [] : [[l.slice(0, i).trim(), l.slice(i + 1).trim()]];
    })
);

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB = env.VITE_APPWRITE_DATABASE_ID;
const STAGES = "instructor_admission_stages";
const CANDIDATES = "instructor_admission_candidates";

const docs = (await db.listDocuments(DB, STAGES, [Query.limit(100)])).documents;
const groups = new Map();
for (const d of docs) {
  const n = d.name;
  if (!groups.has(n)) groups.set(n, []);
  groups.get(n).push(d);
}

let archived = 0;
for (const [name, group] of groups) {
  if (group.length <= 1) continue;
  const sorted = group.sort(
    (a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || (a.order || 0) - (b.order || 0)
  );
  for (const d of sorted.slice(1)) {
    await db.updateDocument(DB, STAGES, d.$id, { archived: true });
    archived++;
    console.log("archived duplicate", name, d.$id);
  }
}

try {
  await db.createStringAttribute(DB, CANDIDATES, "nickname", 120, false, "");
  console.log("nickname attribute created");
} catch (e) {
  console.log("nickname attribute:", e.message);
}

console.log("done, archived", archived, "duplicate stages");
