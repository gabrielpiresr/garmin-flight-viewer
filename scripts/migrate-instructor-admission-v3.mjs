import { Client, Databases } from "node-appwrite";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split(/\r?\n/)
    .flatMap((l) => {
      const i = l.indexOf("=");
      return i <= 0 || l.startsWith("#") ? [] : [[l.slice(0, i).trim(), l.slice(i + 1).trim()]];
    })
);

const db = new Databases(
  new Client()
    .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
    .setProject(env.VITE_APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY)
);
const DB = env.VITE_APPWRITE_DATABASE_ID;
const CANDIDATES = "instructor_admission_candidates";

for (const [name, size] of [
  ["registration_token", 64],
  ["form_filled_at", 64],
]) {
  try {
    await db.createStringAttribute(DB, CANDIDATES, name, size, false, "");
    console.log("created", name);
  } catch (e) {
    console.log(name, e.message);
  }
}

console.log("done");
