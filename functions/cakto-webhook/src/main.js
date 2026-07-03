const crypto = require("node:crypto");
const sdk = require("node-appwrite");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const functionsApi = new sdk.Functions(client);
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "";
const ADMIN_USERS_FUNCTION_ID = process.env.ADMIN_USERS_FUNCTION_ID || "admin-users";
const RECEIPTS_COLLECTION_ID = process.env.APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID || "cakto_receipts";
const PROPOSALS_COLLECTION_ID = process.env.APPWRITE_CRM_PROPOSALS_COLLECTION_ID || "crm_proposals";
const STUDENT_CREDITS_COLLECTION_ID = process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID || "student_credits";
const SCHOOL_COSTS_COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || "school_costs";
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || "";
const PLATFORM_SETTINGS_COLLECTION_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID || "";
const WEBHOOK_TOKEN = process.env.CAKTO_WEBHOOK_TOKEN || "";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";
const SAGA_BASE_URL = process.env.SAGA_BASE_URL || "https://epeac.saga.aero";
const SAGA_CREDIT_BANK_ID = process.env.SAGA_CREDIT_BANK_ID || "6";
const SAGA_CREDIT_TYPE = process.env.SAGA_CREDIT_TYPE || "GENERIC";
const SAGA_CREDIT_AIRCRAFT_ICAO = process.env.SAGA_CREDIT_AIRCRAFT_ICAO || "MC01";
const SAGA_AUTH_SESSION_KEY = "sagaAuthSession";
const SAGA_IMPORT_CREDENTIALS_KEY = "sagaImportCredentials";
const SAGA_IMPORT_MAPPING_KEY = "sagaImportMapping";

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
  ]);
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

function sagaSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=\s]+=[^;,]*;)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

function sagaMergeCookies(cookieJar, headers) {
  for (const cookie of sagaSetCookieHeaders(headers)) {
    const pair = String(cookie).split(";", 1)[0] || "";
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) cookieJar.set(pair.slice(0, eqIndex), pair.slice(eqIndex + 1));
  }
}

function sagaCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

function sagaPersistableCookieKey(key) {
  return key === "XSRF-TOKEN" || /session/i.test(key);
}

function sagaCookieJarFromObject(cookies) {
  const cookieJar = new Map();
  if (!cookies || typeof cookies !== "object") return cookieJar;
  for (const [key, value] of Object.entries(cookies)) {
    if (clean(key) && clean(value) && sagaPersistableCookieKey(clean(key))) {
      cookieJar.set(clean(key), clean(value));
    }
  }
  return cookieJar;
}

function sagaCookieJarToObject(cookieJar) {
  return Object.fromEntries(Array.from(cookieJar.entries()).filter(([key]) => sagaPersistableCookieKey(key)));
}

function extractSagaCsrfToken(html) {
  const text = String(html || "");
  const patterns = [
    /<input\b[^>]*name=["']_token["'][^>]*value=["']([^"']+)["']/i,
    /<input\b[^>]*value=["']([^"']+)["'][^>]*name=["']_token["']/i,
    /<meta\b[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function isSagaLoginResponse(result) {
  const location = clean(result?.response?.headers?.get("location"));
  return location.includes("/login") ||
    (Number(result?.response?.status) === 200 &&
      /name=["']email["'][\s\S]{0,1000}name=["']password["']/i.test(String(result?.html || "")));
}

async function sagaFetch(path, options, cookieJar) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148 Safari/537.36",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    ...(options.headers || {}),
  };
  const cookie = sagaCookieHeader(cookieJar);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${SAGA_BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
  sagaMergeCookies(cookieJar, response.headers);
  return { response, html: await response.text() };
}

async function getPlatformSetting(key) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const result = await databases.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, [
    sdk.Query.equal("key", [key]),
    sdk.Query.limit(1),
  ]);
  return result.documents?.[0] || null;
}

async function saveSagaAuthSession(cookieJar, email) {
  const current = await getPlatformSetting(SAGA_AUTH_SESSION_KEY);
  const data = {
    key: SAGA_AUTH_SESSION_KEY,
    settings_json: JSON.stringify({
      cookies: sagaCookieJarToObject(cookieJar),
      loginEmail: clean(email),
      savedAt: new Date().toISOString(),
    }),
  };
  if (current) {
    await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.$id, data);
  } else {
    await databases.createDocument(
      DATABASE_ID,
      PLATFORM_SETTINGS_COLLECTION_ID,
      sdk.ID.unique(),
      data,
      ADMIN_PERMS,
    );
  }
}

async function loadSagaSession() {
  const sessionDoc = await getPlatformSetting(SAGA_AUTH_SESSION_KEY);
  const session = safeParse(sessionDoc?.settings_json, {});
  const cookieJar = sagaCookieJarFromObject(session.cookies);
  if (cookieJar.size > 0) return { cookieJar, email: clean(session.loginEmail) };

  const credentialsDoc = await getPlatformSetting(SAGA_IMPORT_CREDENTIALS_KEY);
  const credentials = safeParse(credentialsDoc?.settings_json, {});
  return loginSaga(clean(credentials.email), String(credentials.password || ""));
}

async function loginSaga(email, password) {
  if (!email || !password) throw new Error("Credenciais do SAGA nao configuradas no Appwrite.");
  const cookieJar = new Map();
  const loginPage = await sagaFetch("/login", {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  }, cookieJar);
  const token = extractSagaCsrfToken(loginPage.html);
  if (!token) throw new Error("Token CSRF do login do SAGA nao encontrado.");
  const form = new URLSearchParams({ _token: token, email, password });
  const result = await sagaFetch("/login", {
    method: "POST",
    body: form.toString(),
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: SAGA_BASE_URL,
      referer: `${SAGA_BASE_URL}/login`,
    },
  }, cookieJar);
  const location = clean(result.response.headers.get("location"));
  if (isSagaLoginResponse(result) || (result.response.status !== 302 && !/dashboard|logout/i.test(result.html))) {
    throw new Error(`Login no SAGA nao confirmado (HTTP ${result.response.status}, redirect ${location || "ausente"}).`);
  }
  await saveSagaAuthSession(cookieJar, email);
  return { cookieJar, email };
}

async function sagaCreditPage(session, sagaStudentId) {
  let result = await sagaFetch(`/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: `${SAGA_BASE_URL}/credits/create`,
    },
  }, session.cookieJar);
  if (!isSagaLoginResponse(result)) return result;

  const credentialsDoc = await getPlatformSetting(SAGA_IMPORT_CREDENTIALS_KEY);
  const credentials = safeParse(credentialsDoc?.settings_json, {});
  const refreshed = await loginSaga(clean(credentials.email), String(credentials.password || ""));
  session.cookieJar = refreshed.cookieJar;
  session.email = refreshed.email;
  result = await sagaFetch(`/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: `${SAGA_BASE_URL}/credits/create`,
    },
  }, session.cookieJar);
  if (isSagaLoginResponse(result)) throw new Error("Sessao do SAGA expirou ao abrir a tela de creditos.");
  return result;
}

async function sagaStudentIdForUser(userId) {
  if (!PROFILES_COLLECTION_ID) throw new Error("Colecao de perfis nao configurada na Function.");
  const result = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  const sagaStudentId = clean(result.documents?.[0]?.saga_user_id);
  if (sagaStudentId) return sagaStudentId;

  const deterministicSagaId = clean(userId).match(/^saga_(\d+)$/)?.[1] || "";
  if (deterministicSagaId) return deterministicSagaId;
  throw new Error("Aluno sem saga_user_id vinculado no perfil.");
}

async function sagaAircraftIcaoForModel(modelId) {
  const mappingDoc = await getPlatformSetting(SAGA_IMPORT_MAPPING_KEY);
  const mapping = safeParse(mappingDoc?.settings_json, {});
  const candidates = Object.entries(asObject(mapping.creditAircraftBySaga))
    .filter(([, localModelId]) => clean(localModelId) === clean(modelId))
    .map(([sagaModel]) => clean(sagaModel))
    .filter(Boolean);
  return candidates.find((sagaModel) => sagaModel === SAGA_CREDIT_AIRCRAFT_ICAO) ||
    candidates.find((sagaModel) => !/^\d+$/.test(sagaModel)) ||
    SAGA_CREDIT_AIRCRAFT_ICAO;
}

async function createSagaCredit({ studentUserId, creditId, purchaseDate, expiresAt, aircraftModelId, hours, amountPaid }) {
  const sagaStudentId = await sagaStudentIdForUser(studentUserId);
  const session = await loadSagaSession();
  const marker = `GFV-CAKTO:${creditId}`;
  let page = await sagaCreditPage(session, sagaStudentId);
  if (page.html.includes(marker)) return { status: "already_exists", marker, sagaStudentId };

  const csrfToken = extractSagaCsrfToken(page.html);
  if (!csrfToken) throw new Error("Token CSRF do formulario de creditos do SAGA nao encontrado.");
  const totalValue = Math.round(amountPaid * 100) / 100;
  const aircraftIcao = await sagaAircraftIcaoForModel(aircraftModelId);
  const form = new URLSearchParams({
    _token: csrfToken,
    student_id: sagaStudentId,
    created_at: purchaseDate,
    aircraft_icao: aircraftIcao,
    type: SAGA_CREDIT_TYPE,
    hours: String(hours),
    value: String(totalValue),
    bank_id: SAGA_CREDIT_BANK_ID,
    expiration_at: expiresAt,
    notes: `Compra online Cakto. ${marker}`,
  });
  const post = await sagaFetch("/credits", {
    method: "POST",
    body: form.toString(),
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: SAGA_BASE_URL,
      referer: `${SAGA_BASE_URL}/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`,
    },
  }, session.cookieJar);
  if (isSagaLoginResponse(post)) throw new Error("Sessao do SAGA expirou ao lancar o credito.");

  page = await sagaCreditPage(session, sagaStudentId);
  if (!page.html.includes(marker)) {
    const location = clean(post.response.headers.get("location"));
    throw new Error(`SAGA nao confirmou o credito (HTTP ${post.response.status}, redirect ${location || "ausente"}).`);
  }
  await saveSagaAuthSession(session.cookieJar, session.email).catch(() => undefined);
  return { status: "completed", marker, sagaStudentId };
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
  const receiptPatch = {
    fulfillment_status: patch.status,
    fulfillment_error: clean(patch.error).slice(0, 2048),
    fulfillment_updated_at: updatedAt,
    credit_id: clean(patch.creditId),
  };
  if (patch.sagaStatus !== undefined) receiptPatch.saga_status = clean(patch.sagaStatus);
  if (patch.sagaError !== undefined) receiptPatch.saga_error = clean(patch.sagaError).slice(0, 2048);
  if (patch.sagaMarker !== undefined) receiptPatch.saga_credit_marker = clean(patch.sagaMarker);
  if (patch.sagaStatus !== undefined) receiptPatch.saga_updated_at = updatedAt;
  await Promise.all([
    receiptId
      ? databases.updateDocument(DATABASE_ID, RECEIPTS_COLLECTION_ID, receiptId, receiptPatch)
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
        notes: [
          `Compra online Cakto. Proposta ${proposal.$id}${normalized.orderId ? `, pedido ${normalized.orderId}` : ""}.`,
          snapshot.weekdayOnly === true ? "Modalidade: somente dias de semana." : "",
        ].filter(Boolean).join(" "),
        is_night: false,
        weekday_only: snapshot.weekdayOnly === true,
        created_by: "cakto-webhook",
        updated_by: "cakto-webhook",
        ...(costSnapshotJson ? { cost_snapshot_json: costSnapshotJson } : {}),
      },
      creditPermissions(studentUserId),
    );
  } catch (err) {
    if (Number(err?.code) !== 409) throw err;
  }

  await updateFulfillment(receiptId, proposal.$id, {
    status: "pending",
    error: "",
    creditId,
    sagaStatus: "pending",
    sagaError: "",
    sagaMarker: `GFV-CAKTO:${creditId}`,
  });
  try {
    const saga = await createSagaCredit({
      studentUserId,
      creditId,
      purchaseDate,
      expiresAt: addDaysIso(purchaseDate, validityDays),
      aircraftModelId: clean(snapshot.aircraftModelId),
      hours,
      amountPaid,
    });
    await updateFulfillment(receiptId, proposal.$id, {
      status: "completed",
      error: "",
      creditId,
      sagaStatus: saga.status,
      sagaError: "",
      sagaMarker: saga.marker,
    });
    return { applicable: true, creditId, sagaStatus: saga.status };
  } catch (err) {
    await updateFulfillment(receiptId, proposal.$id, {
      status: "failed",
      error: err?.message || String(err),
      creditId,
      sagaStatus: "failed",
      sagaError: err?.message || String(err),
      sagaMarker: `GFV-CAKTO:${creditId}`,
    }).catch(() => undefined);
    throw err;
  }
}

async function notifyAdminsOfSale(receiptId, normalized, proposal) {
  const metadata = safeParse(proposal?.products_json, null);
  const snapshot = metadata && !Array.isArray(metadata) ? asObject(metadata.snapshot) : {};
  const hours = Number(snapshot.hours);
  const productLabel = Number.isFinite(hours) && hours > 0 && clean(snapshot.aircraftModelName)
    ? `${hours}h — ${clean(snapshot.aircraftModelName)}`
    : "";
  await functionsApi.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    async: true,
    body: JSON.stringify({
      action: "notifyCaktoSaleEvent",
      token: WEBHOOK_TOKEN,
      sale: {
        receiptId,
        customerName: normalized.customerName,
        customerEmail: normalized.customerEmail,
        amount: normalized.amount,
        currency: normalized.currency,
        paymentMethod: normalized.paymentMethod,
        paymentInstallments: normalized.paymentInstallments,
        orderId: normalized.orderId,
        productLabel,
        eventAt: normalized.eventAt || normalized.receivedAt,
      },
    }),
  });
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
    const dedupeSource = `${normalized.eventType}:${normalized.eventId || `${normalized.orderId}:${normalized.offerId}:${raw}`}`;
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
          saga_status: normalized.eventType === "purchase_approved" ? "pending" : "not_applicable",
          saga_error: "",
          saga_credit_marker: "",
        },
        ADMIN_PERMS,
      );
      receiptCreated = true;
    } catch (err) {
      if (Number(err?.code) !== 409) throw err;
    }
    if (receiptCreated && normalized.eventType === "purchase_approved") {
      try {
        await notifyAdminsOfSale(documentId, normalized, proposal);
      } catch (notifyError) {
        error(`Falha ao notificar admins da venda: ${notifyError?.message || notifyError}`);
      }
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
