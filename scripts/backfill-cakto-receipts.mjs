import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const localEnv = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
      const index = line.indexOf("=");
      if (index <= 0 || line.trim().startsWith("#")) return [];
      return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
    }))
  : {};

const endpoint = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}

const databases = new Databases(new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey));
const receiptsCollectionId = process.env.APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID || "cakto_receipts";
const proposalsCollectionId = process.env.APPWRITE_CRM_PROPOSALS_COLLECTION_ID || "crm_proposals";

const clean = (value) => value === null || value === undefined ? "" : String(value).trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function normalize(payload) {
  const data = object(Array.isArray(payload.data) ? payload.data[0] : payload.data);
  const customer = object(data.customer);
  const offer = object(data.offer);
  const product = object(data.product);
  const eventType = clean(payload.event || payload.event_type || payload.eventType);
  return {
    event_id: clean(data.id || payload.id || payload.event_id),
    event_type: eventType,
    order_id: clean(data.refId || data.ref_id || data.order_id),
    offer_id: clean(offer.id || data.offer_id),
    product_id: clean(product.id || data.product_id),
    customer_name: clean(customer.name || customer.full_name),
    customer_email: clean(customer.email),
    amount: Number(data.amount ?? data.total ?? data.price ?? 0) || 0,
    currency: clean(offer.currency || data.currency || "BRL").toUpperCase(),
    payment_method: clean(data.paymentMethodName || data.paymentMethod || data.payment_method),
    status: clean(data.status || eventType),
    event_at:
      (eventType === "purchase_approved" ? clean(data.paidAt) : "") ||
      (eventType === "refund" ? clean(data.refundedAt) : "") ||
      (eventType === "chargeback" ? clean(data.chargedbackAt) : "") ||
      clean(data.createdAt || payload.createdAt || payload.created_at) ||
      null,
  };
}

async function proposalIdForOffer(offerId) {
  if (!offerId) return "";
  const result = await databases.listDocuments(databaseId, proposalsCollectionId, [
    Query.equal("cakto_offer_id", [offerId]),
    Query.limit(1),
    Query.select(["$id"]),
  ]);
  return result.documents[0]?.$id || "";
}

let offset = 0;
let updated = 0;
while (true) {
  const page = await databases.listDocuments(databaseId, receiptsCollectionId, [
    Query.limit(100),
    Query.offset(offset),
    Query.orderAsc("$createdAt"),
  ]);
  for (const document of page.documents) {
    let payload;
    try {
      payload = JSON.parse(document.payload_json || "{}");
    } catch {
      console.warn(`Ignorado ${document.$id}: payload inválido.`);
      continue;
    }
    const normalized = normalize(payload);
    const dedupeSource = normalized.event_id ||
      `${normalized.event_type}:${normalized.order_id}:${normalized.offer_id}:${document.payload_json || "{}"}`;
    const dedupeKey = crypto.createHash("sha256").update(dedupeSource).digest("hex");
    const proposalId = normalized.offer_id
      ? await proposalIdForOffer(normalized.offer_id).catch(() => "")
      : "";
    await databases.updateDocument(databaseId, receiptsCollectionId, document.$id, {
      ...normalized,
      dedupe_key: dedupeKey,
      proposal_id: proposalId || document.proposal_id || "",
    });
    updated += 1;
    console.log(`Atualizado ${document.$id}: ${normalized.order_id || "sem pedido"}`);
  }
  offset += page.documents.length;
  if (offset >= page.total || page.documents.length === 0) break;
}

console.log(`Backfill concluído: ${updated} recebimento(s) atualizado(s).`);
