import { Client, Databases, Query } from "node-appwrite";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1")
  .setProject(process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05")
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = "6a01afae001bc352d1b1";
const ARTICLES = "6a0461d0001a1ceefdad";

const res = await db.listDocuments(DB_ID, ARTICLES, [Query.orderDesc("$createdAt"), Query.limit(10)]);
console.log("total:", res.total);
for (const d of res.documents) {
  console.log(
    JSON.stringify({
      id: d.$id,
      title: d.title,
      school_id: d.school_id,
      section_id: d.section_id,
      is_published: d.is_published,
      order: d.order,
      created: d.$createdAt,
      contentLen: (d.content_json || "").length,
    }),
  );
}
