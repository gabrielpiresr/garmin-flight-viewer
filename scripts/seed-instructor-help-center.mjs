import { Client, Databases, ID, Query } from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INSTRUCTOR_HELP_SECTIONS } from "./instructor-help-center-seed-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

const fileEnv = parseEnvFile(envPath);
const env = (key, fallbackKey) => process.env[key] || fileEnv[key] || (fallbackKey ? fileEnv[fallbackKey] : undefined);

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");
const SCHOOL_ID = process.env.SCHOOL_ID || fileEnv.SCHOOL_ID || fileEnv.VITE_SCHOOL_ID || "escola_principal";
const SECTIONS_COL_ID =
  process.env.APPWRITE_INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID ||
  fileEnv.APPWRITE_INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID ||
  env("VITE_APPWRITE_INSTRUCTOR_HELP_SECTIONS_COL_ID");
const ARTICLES_COL_ID =
  process.env.APPWRITE_INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID ||
  fileEnv.APPWRITE_INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID ||
  env("VITE_APPWRITE_INSTRUCTOR_HELP_ARTICLES_COL_ID");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !SECTIONS_COL_ID || !ARTICLES_COL_ID) {
  console.error(
    "Missing env vars. Run npm run appwrite:setup-instructor-help-center first, then set collection IDs.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

function node(block) {
  const [type, value] = block;
  if (type === "heading") return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: value }] };
  if (type === "paragraph") return { type: "paragraph", content: [{ type: "text", text: value }] };
  if (type === "bullet") {
    return {
      type: "bulletList",
      content: value.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] })),
    };
  }
  if (type === "ordered") {
    return {
      type: "orderedList",
      content: value.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] })),
    };
  }
  return { type: "paragraph" };
}

function contentJson(blocks) {
  return { type: "doc", content: blocks.map(node) };
}

function plainText(blocks) {
  return blocks
    .map((block) => {
      const value = block[1];
      return Array.isArray(value) ? value.join(" ") : value;
    })
    .join("\n\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contentHtml(blocks) {
  return blocks
    .map(([type, value]) => {
      if (type === "heading") return `<h2>${escapeHtml(value)}</h2>`;
      if (type === "paragraph") return `<p>${escapeHtml(value)}</p>`;
      if (type === "bullet") return `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      if (type === "ordered") return `<ol>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
      return "";
    })
    .join("\n");
}

async function findByTitle(collectionId, title) {
  const res = await db.listDocuments(DATABASE_ID, collectionId, [Query.equal("school_id", [SCHOOL_ID]), Query.limit(300)]);
  return res.documents.find((doc) => doc.title === title) ?? null;
}

async function upsertSection(section) {
  const existing = await findByTitle(SECTIONS_COL_ID, section.title);
  const data = {
    school_id: SCHOOL_ID,
    title: section.title,
    description: section.description,
    order: section.order,
    is_published: true,
  };
  if (existing) {
    await db.updateDocument(DATABASE_ID, SECTIONS_COL_ID, existing.$id, data);
    console.log(`  • section ${section.order}: updated (${section.title})`);
    return existing.$id;
  }
  const created = await db.createDocument(DATABASE_ID, SECTIONS_COL_ID, ID.unique(), data);
  console.log(`  ✓ section ${section.order}: created (${section.title})`);
  return created.$id;
}

async function upsertArticle(sectionId, article) {
  const existing = await findByTitle(ARTICLES_COL_ID, article.title);
  const json = contentJson(article.blocks);
  const data = {
    school_id: SCHOOL_ID,
    section_id: sectionId,
    subsection_id: null,
    title: article.title,
    summary: article.summary,
    content_json: JSON.stringify(json),
    content_html: contentHtml(article.blocks),
    plain_text: plainText(article.blocks),
    tags_json: JSON.stringify(article.tags),
    order: article.order,
    is_published: true,
    created_by: "seed-instructor-help",
  };
  if (existing) {
    await db.updateDocument(DATABASE_ID, ARTICLES_COL_ID, existing.$id, data);
    console.log(`    • article ${article.order}: updated (${article.title})`);
    return;
  }
  await db.createDocument(DATABASE_ID, ARTICLES_COL_ID, ID.unique(), data);
  console.log(`    ✓ article ${article.order}: created (${article.title})`);
}

async function listAllDocuments(collectionId) {
  const documents = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DATABASE_ID, collectionId, [
      Query.equal("school_id", [SCHOOL_ID]),
      Query.limit(100),
      Query.offset(offset),
    ]);
    documents.push(...res.documents);
    if (documents.length >= res.total) break;
    offset += res.documents.length;
  }
  return documents;
}

async function cleanupObsoleteContent() {
  const validSectionTitles = new Set(INSTRUCTOR_HELP_SECTIONS.map((section) => section.title));
  const validArticleTitles = new Set(
    INSTRUCTOR_HELP_SECTIONS.flatMap((section) => section.articles.map((article) => article.title)),
  );

  const sections = await listAllDocuments(SECTIONS_COL_ID);
  for (const section of sections) {
    if (!validSectionTitles.has(section.title)) {
      await db.deleteDocument(DATABASE_ID, SECTIONS_COL_ID, section.$id);
      console.log(`  ✗ removed obsolete section: ${section.title}`);
    }
  }

  const articles = await listAllDocuments(ARTICLES_COL_ID);
  for (const article of articles) {
    if (!validArticleTitles.has(article.title)) {
      await db.deleteDocument(DATABASE_ID, ARTICLES_COL_ID, article.$id);
      console.log(`  ✗ removed obsolete article: ${article.title}`);
    }
  }
}

async function main() {
  console.log("=== Seed Instructor Help Center ===");
  const cleanup = process.argv.includes("--cleanup") || process.env.SEED_INSTRUCTOR_HELP_CLEANUP === "1";
  if (cleanup) {
    console.log("Cleaning obsolete sections and articles...\n");
    await cleanupObsoleteContent();
  } else {
    console.log("Skipping cleanup to preserve custom articles. Use --cleanup to remove items not in seed data.\n");
  }
  console.log(`\nImporting ${INSTRUCTOR_HELP_SECTIONS.length} sections...\n`);
  for (const section of INSTRUCTOR_HELP_SECTIONS) {
    const sectionId = await upsertSection(section);
    for (const article of section.articles) {
      await upsertArticle(sectionId, article);
    }
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Seed failed:", error?.message ?? error);
  process.exit(1);
});
