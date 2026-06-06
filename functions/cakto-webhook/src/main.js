const crypto = require("node:crypto");
const sdk = require("node-appwrite");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "";
const RECEIPTS_COLLECTION_ID = process.env.APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID || "cakto_receipts";
const PROPOSALS_COLLECTION_ID = process.env.APPWRITE_CRM_PROPOSALS_COLLECTION_ID || "crm_proposals";
const STUDENT_CREDITS_COLLECTION_ID = process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID || "student_credits";
const SCHOOL_COSTS_COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || "school_costs";
const WEBHOOK_TOKEN = process.env.CAKTO_WEBHOOK_TOKEN || "";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";

const ALLOWED_EVENTS = new Set([
  "purchase_approved",
  "purchase_refused",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "openfinance_nubank_gerado",
  "refund",
  "chargeback",
]);

const ADMIN_PERMS = [
  sdk.Permission.read(sdk.Role.label("admin")),
  sdk.Permission.update(sdk.Role.label("admin")),
  sdk.Permission.delete(sdk.Role.label("admin")),
];

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function first(...values) {
  for (const value of values) {
    const result = clean(value);
    if (result) return result;
  }
  return "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function payloadData(payload) {
  if (Array.isArray(payload.data)) return asObject(payload.data[0]);
  return asObject(payload.data);
}

function parseBody(req) {
  try {
    if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  } catch {
    // Fall back to the raw request body when the runtime JSON getter rejects it.
  }
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function queryToken(req) {
  if (req.query && typeof req.query === "object") return clean(req.query.token);
  try {
    const url = new URL(req.url || "/", "https://function.local");
    return clean(url.searchParams.get("token"));
  } catch {
    return "";
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(clean(left));
  const b = Buffer.from(clean(right));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function amountFrom(value) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function eventTypeFrom(payload) {
  const event = asObject(payload.event);
  return first(
    payload.event_type,
    payload.eventType,
    payload.type,
    typeof payload.event === "string" ? payload.event : "",
    event.custom_id,
    event.type,
  );
}

async function findProposal(offerId) {
  if (!offerId) return null;
  const result = await databases.listDocuments(DATABASE_ID, PROPOSALS_COLLECTION_ID, [
    sdk.Query.equal("cakto_offer_id", [offerId]),
    sdk.Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return result.documents?.[0] || null;
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asIsoDate(value) {
  const raw = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const date = new Date(`${asIsoDate(value)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(Number(days) || 0)));
  return date.toISOString().slice(0, 10);
}

function creditPermissions(userId) {
  return [
    sdk.Permission.read(sdk.Role.user(userId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

async function buildCostSnapshot(amount, paymentMethod, appliedAt) {
  if (!SCHOOL_COSTS_COLLECTION_ID) return null;
  try {
    const result = await databases.listDocuments(DATABASE_ID, SCHOOL_COSTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.limit(1),
    ]);
    const doc = result.documents?.[0];
    if (!doc) return null;
    const costs = safeParse(doc.payment_method_costs_json, {});
    const methodCost = costs?.[paymentMethod] || { fixedCost: 0, percentCost: 0 };
    const fixedCost = Number(methodCost.fixedCost) || 0;
    const percentCost = Number(methodCost.percentCost) || 0;
    return JSON.stringify({
      enrollmentCost: Number(doc.enrollment_cost) || 0,
      paymentMethodFixedCost: fixedCost,
      paymentMethodPercentCost: percentCost,
      totalCostCalculated: fixedCost + (amount * percentCost) / 100,
      appliedAt,
    });
  } catch {
    return null;
  }
}

async function updateFulfillment(receiptId, proposalId, patch) {
  const updatedAt = new Date().toISOString();
  await Promise.all([
    receiptId
      ? databases.updateDocument(DATABASE_ID, RECEIPTS_COLLECTION_ID, receiptId, {
          fulfillment_status: patch.status,
          fulfillment_error: clean(patch.error).slice(0, 2048),
          fulfillment_updated_at: updatedAt,
          credit_id: clean(patch.creditId),
        })
      : Promise.resolve(),
    proposalId
      ? databases.updateDocument(DATABASE_ID, PROPOSALS_COLLECTION_ID, proposalId, {
          payment_status: patch.status === "completed" ? "paid" : patch.status === "failed" ? "failed" : "created",
          payment_error: clean(patch.error).slice(0, 2048),
          payment_updated_at: updatedAt,
        })
      : Promise.resolve(),
  ]);
}

async function fulfillStudentCreditPurchase(receiptId, proposal, normalized) {
  const metadata = safeParse(proposal?.products_json, null);
  if (!proposal || !metadata || Array.isArray(metadata) || metadata.kind !== "student_credit_package") {
    return { applicable: false, creditId: "" };
  }
  const snapshot = metadata.snapshot;
  const studentUserId = clean(metadata.studentUserId);
  if (!snapshot || !studentUserId) throw new Error("Proposta de pacote sem snapshot ou aluno vinculado.");

  const creditId = clean(metadata.creditId) || `fc_${crypto.createHash("sha256").update(proposal.$id).digest("hex").slice(0, 29)}`;

  const purchaseDate = asIsoDate(normalized.eventAt || normalized.receivedAt);
  const validityDays = Math.max(1, Math.round(Number(snapshot.validityDays) || 0));
  const amountPaid = Number(snapshot.totalValue);
  const hours = Number(snapshot.hours);
  if (!clean(snapshot.aircraftModelId) || !clean(snapshot.aircraftModelName) || !Number.isFinite(amountPaid) || amountPaid <= 0 || !Number.isFinite(hours) || hours <= 0) {
    throw new Error("Snapshot do pacote invalido.");
  }

  const costSnapshotJson = await buildCostSnapshot(amountPaid, normalized.paymentMethod, normalized.eventAt || normalized.receivedAt);
  try {
    await databases.createDocument(
      DATABASE_ID,
      STUDENT_CREDITS_COLLECTION_ID,
      creditId,
      {
        school_id: proposal.school_id || SCHOOL_ID,
        user_id: studentUserId,
        purchase_date: purchaseDate,
        aircraft_model_id: clean(snapshot.aircraftModelId),
        aircraft_model_name: clean(snapshot.aircraftModelName),
        amount_paid: amountPaid,
        payment_method: normalized.paymentMethod || "Cakto",
        payment_installments: normalized.paymentInstallments || null,
        validity_days: validityDays,
        hours,
        expires_at: addDaysIso(purchaseDate, validityDays),
        notes: `Compra online Cakto. Proposta ${proposal.$id}${normalized.orderId ? `, pedido ${normalized.orderId}` : ""}.`,
        is_night: false,
        created_by: "cakto-webhook",
        updated_by: "cakto-webhook",
        ...(costSnapshotJson ? { cost_snapshot_json: costSnapshotJson } : {}),
      },
      creditPermissions(studentUserId),
    );
  } catch (err) {
    if (Number(err?.code) !== 409) throw err;
  }

  await updateFulfillment(receiptId, proposal.$id, { status: "completed", error: "", creditId });
  return { applicable: true, creditId };
}

function normalize(payload, receivedAt) {
  const data = payloadData(payload);
  const order = asObject(payload.order || data.order || data);
  const customer = asObject(payload.customer || data.customer || order.customer);
  const offer = asObject(payload.offer || data.offer || order.offer);
  const product = asObject(payload.product || data.product || offer.product || order.product);
  const payment = asObject(payload.payment || data.payment || order.payment);
  const event = asObject(payload.event);
  const eventType = eventTypeFrom(payload);
  const eventAt = first(
    payload.event_at,
    payload.created_at,
    payload.createdAt,
    data.created_at,
    data.createdAt,
    data.paidAt,
    data.refundedAt,
    data.chargedbackAt,
    data.canceledAt,
    order.updated_at,
    order.created_at,
  );
  return {
    eventType,
    eventId: first(payload.event_id, payload.id, event.id, data.event_id, data.id),
    orderId: first(order.refId, order.ref_id, order.order_id, data.refId, data.ref_id, data.order_id, payload.order_id, order.id),
    offerId: first(offer.id, order.offer_id, data.offer_id, payload.offer_id),
    productId: first(product.id, offer.product_id, order.product_id, data.product_id, payload.product_id),
    customerName: first(customer.name, customer.full_name, order.customer_name, data.customer_name),
    customerEmail: first(customer.email, order.customer_email, data.customer_email),
    amount: amountFrom(first(order.amount, order.price, order.total, payment.amount, data.amount, payload.amount)),
    currency: first(order.currency, offer.currency, payment.currency, data.currency, payload.currency, "BRL").toUpperCase(),
    paymentMethod: first(
      order.paymentMethodName,
      order.paymentMethod,
      payment.method,
      payment.payment_method,
      order.payment_method,
      data.paymentMethodName,
      data.paymentMethod,
      data.payment_method,
      payload.payment_method,
    ),
    paymentInstallments: Math.max(0, Math.round(amountFrom(first(
      order.installments,
      payment.installments,
      data.installments,
      payload.installments,
    )))) || null,
    status: first(order.status, payment.status, data.status, payload.status, eventType),
    eventAt: first(
      eventType === "purchase_approved" ? data.paidAt : "",
      eventType === "refund" ? data.refundedAt : "",
      eventType === "chargeback" ? data.chargedbackAt : "",
      eventAt,
    ) || null,
    receivedAt,
  };
}

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!DATABASE_ID || !WEBHOOK_TOKEN) {
      return res.json({ message: "Webhook não configurado." }, 500);
    }
    if (!safeEqual(queryToken(req), WEBHOOK_TOKEN)) {
      return res.json({ message: "Token inválido." }, 401);
    }
    const payload = parseBody(req);
    const receivedAt = new Date().toISOString();
    const normalized = normalize(payload, receivedAt);
    if (!ALLOWED_EVENTS.has(normalized.eventType)) {
      return res.json({ ok: true, ignored: true }, 200);
    }
    const raw = JSON.stringify(payload);
    const dedupeSource = normalized.eventId || `${normalized.eventType}:${normalized.orderId}:${normalized.offerId}:${raw}`;
    const dedupeKey = crypto.createHash("sha256").update(dedupeSource).digest("hex");
    const documentId = `cw_${dedupeKey.slice(0, 32)}`;
    const proposal = await findProposal(normalized.offerId);
    const proposalId = proposal?.$id || "";
    let receiptCreated = false;
    try {
      await databases.createDocument(
        DATABASE_ID,
        RECEIPTS_COLLECTION_ID,
        documentId,
        {
          school_id: SCHOOL_ID,
          dedupe_key: dedupeKey,
          event_id: normalized.eventId,
          event_type: normalized.eventType,
          order_id: normalized.orderId,
          offer_id: normalized.offerId,
          product_id: normalized.productId,
          proposal_id: proposalId,
          customer_name: normalized.customerName,
          customer_email: normalized.customerEmail,
          amount: normalized.amount,
          currency: normalized.currency,
          payment_method: normalized.paymentMethod,
          status: normalized.status,
          event_at: normalized.eventAt,
          received_at: normalized.receivedAt,
          payload_json: raw.slice(0, 65535),
          fulfillment_status: normalized.eventType === "purchase_approved" ? "pending" : "not_applicable",
          fulfillment_error: "",
          credit_id: "",
        },
        ADMIN_PERMS,
      );
      receiptCreated = true;
    } catch (err) {
      if (Number(err?.code) !== 409) throw err;
    }
    const proposalMetadata = safeParse(proposal?.products_json, null);
    if (normalized.eventType === "purchase_approved" && proposalMetadata?.kind === "student_credit_package") {
      try {
        const fulfillment = await fulfillStudentCreditPurchase(documentId, proposal, normalized);
        log(`Cakto credit fulfilled: proposal=${proposalId} credit=${fulfillment.creditId}`);
      } catch (fulfillmentError) {
        await updateFulfillment(documentId, proposalId, {
          status: "failed",
          error: fulfillmentError?.message || String(fulfillmentError),
          creditId: clean(proposalMetadata?.creditId),
        }).catch(() => undefined);
        throw fulfillmentError;
      }
    } else if (normalized.eventType === "purchase_approved" && proposalId) {
      await updateFulfillment(documentId, proposalId, {
        status: "not_applicable",
        error: "",
        creditId: "",
      }).catch(() => undefined);
    } else if (normalized.eventType === "purchase_approved") {
      await updateFulfillment(documentId, "", {
        status: "proposal_not_found",
        error: "Nenhuma proposta vinculada a oferta recebida.",
        creditId: "",
      }).catch(() => undefined);
    }
    if (!receiptCreated) {
      log(`Cakto webhook retried: ${normalized.eventType} ${normalized.orderId}`);
      return res.json({ ok: true, duplicate: true }, 200);
    }
    log(`Cakto webhook stored: ${normalized.eventType} ${normalized.orderId}`);
    return res.json({ ok: true }, 200);
  } catch (err) {
    error(err?.stack || String(err));
    return res.json({ message: "Falha ao processar webhook." }, 500);
  }
};
