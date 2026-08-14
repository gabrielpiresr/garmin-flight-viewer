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
const PRODUCT_SALES_COLLECTION_ID = process.env.APPWRITE_PRODUCT_SALES_COLLECTION_ID || process.env.APPWRITE_PRODUCT_SALES_COL_ID || "product_sales";
const MARKETPLACE_PRODUCTS_COLLECTION_ID = process.env.APPWRITE_MARKETPLACE_PRODUCTS_COLLECTION_ID || process.env.APPWRITE_MARKETPLACE_PRODUCTS_COL_ID || "marketplace_products";
const MARKETPLACE_ORDERS_COLLECTION_ID = process.env.APPWRITE_MARKETPLACE_ORDERS_COLLECTION_ID || process.env.APPWRITE_MARKETPLACE_ORDERS_COL_ID || "marketplace_orders";
const SCHOOL_COSTS_COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || "school_costs";
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || "";
const STUDENT_TRACKS_COLLECTION_ID = process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || process.env.APPWRITE_STUDENT_TRACKS_COL_ID || "";
const FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COL_ID ||
  "flight_review_club_memberships";
const FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_TASKS_COL_ID ||
  "flight_review_club_tasks";
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
  "subscription_renewed",
  "subscription_canceled",
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

async function findProposalById(proposalId) {
  const safeId = clean(proposalId);
  if (!safeId) return null;
  return databases.getDocument(DATABASE_ID, PROPOSALS_COLLECTION_ID, safeId).catch(() => null);
}

async function findFlightReviewClubMembershipBySubscription(subscriptionId) {
  const safeId = clean(subscriptionId);
  if (!safeId || !FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID) return null;
  const result = await databases.listDocuments(DATABASE_ID, FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("cakto_subscription_id", [safeId]),
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

function proposalProducts(metadata) {
  const products = Array.isArray(metadata?.products) ? metadata.products : [];
  return products
    .map((item) => ({
      id: clean(item?.id),
      name: clean(item?.name),
      price: Math.max(0, amountFrom(item?.price)),
    }))
    .filter((item) => item.id && item.name && item.price > 0);
}

async function createProductSalesForProposal(proposal, metadata, normalized, purchaseDate, studentUserId) {
  const products = proposalProducts(metadata);
  if (!products.length || !PRODUCT_SALES_COLLECTION_ID) return;

  await Promise.all(products.map(async (product, index) => {
    const saleId = `ps_${crypto
      .createHash("sha256")
      .update(`${proposal.$id}:${index}:${product.id}:${product.price}`)
      .digest("hex")
      .slice(0, 29)}`;
    try {
      await databases.createDocument(
        DATABASE_ID,
        PRODUCT_SALES_COLLECTION_ID,
        saleId,
        {
          school_id: proposal.school_id || SCHOOL_ID,
          user_id: studentUserId,
          product_id: product.id,
          product_name: product.name,
          ideal_price: product.price,
          sale_date: purchaseDate,
          amount_paid: product.price,
          payment_method: normalized.paymentMethod || "Cakto",
          notes: `Compra online Cakto. Proposta ${proposal.$id}${normalized.orderId ? `, pedido ${normalized.orderId}` : ""}.`,
          created_by: "cakto-webhook",
          deleted_at: null,
        },
        ADMIN_PERMS,
      );
    } catch (err) {
      if (Number(err?.code) !== 409) throw err;
    }
  }));
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
  const products = proposalProducts(metadata);
  if (!Number.isFinite(hours) || hours <= 0) {
    if (!products.length) throw new Error("Proposta sem horas e sem produtos.");
    await createProductSalesForProposal(proposal, metadata, normalized, purchaseDate, studentUserId);
    await updateFulfillment(receiptId, proposal.$id, {
      status: "completed",
      error: "",
      creditId: "",
      sagaStatus: "skipped",
      sagaError: "",
      sagaMarker: "",
    });
    return { applicable: true, creditId: "", sagaStatus: "skipped" };
  }
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

  await createProductSalesForProposal(proposal, metadata, normalized, purchaseDate, studentUserId);

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

async function findPrimaryStudentTrack(studentUserId) {
  if (!STUDENT_TRACKS_COLLECTION_ID || !studentUserId) return null;
  const result = await databases.listDocuments(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("student_user_id", [studentUserId]),
    sdk.Query.limit(100),
  ]);
  return result.documents.find((doc) => doc.is_primary === true) || result.documents[0] || null;
}

function flightReviewClubMembershipPermissions(studentUserId) {
  return [
    sdk.Permission.read(sdk.Role.user(studentUserId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

function flightReviewClubTaskPermissions(studentUserId) {
  return [
    sdk.Permission.read(sdk.Role.user(studentUserId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

function defaultFlightReviewClubChecklistTemplate() {
  return [
    { id: "nexatlas", title: "Liberar NexAtlas", description: "Criar ou liberar o acesso gratuito do aluno ao NexAtlas.", enabled: true },
    { id: "clube-360", title: "Liberar Clube 360", description: "Criar ou liberar o acesso gratuito do aluno ao Clube 360.", enabled: true },
    { id: "curso-ead", title: "Enviar Curso EAD", description: "Enviar instruções de acesso ao Curso de Segurança de Voo EAD.", enabled: true },
    { id: "camiseta", title: "Entregar camiseta", description: "Separar e registrar a entrega da camiseta da escola.", enabled: true },
    { id: "cracha", title: "Entregar crachá", description: "Emitir e registrar a entrega do crachá exclusivo.", enabled: true },
    { id: "webinars", title: "Incluir em lista de webinars", description: "Adicionar o integrante na lista de comunicação dos webinars exclusivos.", enabled: true },
    { id: "marketplace", title: "Conferir desconto marketplace", description: "Conferir se os descontos FRC aparecem corretamente no marketplace.", enabled: true },
  ];
}

async function flightReviewClubChecklistTemplate() {
  const doc = await getPlatformSetting("schoolRules").catch(() => null);
  const rules = safeParse(doc?.settings_json, {});
  const raw = Array.isArray(rules?.flightReviewClub?.checklistTemplate)
    ? rules.flightReviewClub.checklistTemplate
    : defaultFlightReviewClubChecklistTemplate();
  return raw
    .map((item, index) => ({
      id: (clean(item?.id) || `frc-task-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64),
      title: clean(item?.title).slice(0, 140),
      description: clean(item?.description).slice(0, 500),
      enabled: item?.enabled !== false,
      sortOrder: index,
    }))
    .filter((item) => item.enabled && item.id && item.title)
    .slice(0, 30);
}

async function ensureFlightReviewClubTasks(membershipId, studentUserId) {
  if (!FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID || !membershipId || !studentUserId) return;
  const template = await flightReviewClubChecklistTemplate();
  if (!template.length) return;
  const current = await databases.listDocuments(DATABASE_ID, FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("membership_id", [membershipId]),
    sdk.Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const existing = new Set((current.documents || []).map((doc) => clean(doc.template_item_id)));
  const now = new Date().toISOString();
  await Promise.all(template.map(async (item) => {
    if (existing.has(item.id)) return;
    const taskId = `frct_${crypto.createHash("sha256").update(`${membershipId}:${item.id}`).digest("hex").slice(0, 31)}`;
    try {
      await databases.createDocument(
        DATABASE_ID,
        FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID,
        taskId,
        {
          school_id: SCHOOL_ID,
          membership_id: membershipId,
          student_user_id: studentUserId,
          template_item_id: item.id,
          title: item.title,
          description: item.description,
          status: "pendente",
          assigned_to_user_id: "",
          due_at: "",
          completed_at: "",
          notes: "",
          history_json: JSON.stringify([{ at: now, event: "created_from_template" }]).slice(0, 8192),
          sort_order: item.sortOrder,
          created_at: now,
          updated_at: now,
        },
        flightReviewClubTaskPermissions(studentUserId),
      );
    } catch (err) {
      if (Number(err?.code) !== 409) throw err;
    }
  }));
}

function frcMembershipIdFromProposal(proposal, metadata) {
  return clean(metadata?.membershipId) || `frc_${crypto.createHash("sha256").update(proposal.$id).digest("hex").slice(0, 28)}`;
}

async function findFlightReviewClubMembership(metadata, normalized) {
  if (!FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID) return null;
  const subscriptionId = clean(normalized.subscriptionId);
  if (subscriptionId) {
    const bySubscription = await databases.listDocuments(DATABASE_ID, FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("cakto_subscription_id", [subscriptionId]),
      sdk.Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    if (bySubscription.documents?.[0]) return bySubscription.documents[0];
  }
  const membershipId = clean(metadata?.membershipId);
  if (!membershipId) return null;
  return databases.getDocument(DATABASE_ID, FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID, membershipId).catch(() => null);
}

function membershipStatusForEvent(eventType, normalized) {
  if (eventType === "subscription_canceled") return "canceled";
  const status = clean(normalized.subscriptionStatus).toLowerCase();
  if (["active", "trial", "inactive", "canceled", "expired", "paused", "pending"].includes(status)) return status;
  return eventType === "purchase_approved" || eventType === "subscription_renewed" ? "active" : "unknown";
}

async function upsertFlightReviewClubMembership(proposal, normalized, statusOverride = "") {
  const metadata = safeParse(proposal?.products_json, null);
  const studentUserId = clean(metadata?.studentUserId);
  if (!proposal || !metadata || metadata.kind !== "flight_review_club_subscription" || metadata.binding !== "student") {
    return { applicable: false, membershipId: "" };
  }
  if (!studentUserId) throw new Error("Proposta FRC sem aluno vinculado.");
  if (!FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID) throw new Error("Colecao de assinaturas FRC nao configurada.");
  const plan = asObject(metadata.plan);
  const now = new Date().toISOString();
  const status = clean(statusOverride) || membershipStatusForEvent(normalized.eventType, normalized);
  const membershipId = frcMembershipIdFromProposal(proposal, metadata);
  const recurrencePeriodDays = Math.max(0, Math.round(Number(normalized.recurrencePeriodDays || plan.recurrencePeriodDays) || 0));
  const existing = await findFlightReviewClubMembership(metadata, normalized);
  const nextPaymentDate = clean(normalized.nextPaymentDate) ||
    clean(existing?.next_payment_date) ||
    (status !== "canceled" && recurrencePeriodDays > 0 ? addDaysIso(normalized.eventAt || normalized.receivedAt || now, recurrencePeriodDays) : "");
  const accessUntil = nextPaymentDate ||
    clean(existing?.access_until) ||
    (recurrencePeriodDays > 0 ? addDaysIso(normalized.eventAt || normalized.receivedAt || now, recurrencePeriodDays) : "");
  const data = {
    school_id: proposal.school_id || SCHOOL_ID,
    student_user_id: studentUserId,
    source: "cakto",
    status,
    plan_id: clean(plan.id),
    plan_name: clean(plan.label),
    recurrence_key: clean(plan.id),
    recurrence_period_days: recurrencePeriodDays,
    amount: amountFrom(plan.amount || proposal.total_value || normalized.amount),
    cakto_offer_id: clean(proposal.cakto_offer_id) || clean(normalized.offerId),
    cakto_subscription_id: clean(normalized.subscriptionId),
    proposal_id: proposal.$id,
    current_period: Math.max(0, Math.round(Number(normalized.currentPeriod) || 0)),
    paid_payments_quantity: Math.max(0, Math.round(Number(normalized.paidPaymentsQuantity) || 0)),
    next_payment_date: nextPaymentDate,
    access_until: accessUntil,
    canceled_at: status === "canceled" ? (clean(normalized.canceledAt) || now) : "",
    ended_at: "",
    last_payment_at: normalized.eventType === "purchase_approved" || normalized.eventType === "subscription_renewed"
      ? (clean(normalized.eventAt) || now)
      : "",
    last_event_at: clean(normalized.eventAt) || now,
    updated_at: now,
  };
  if (existing) {
    await databases.updateDocument(DATABASE_ID, FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID, existing.$id, data);
    if (status === "active" || status === "trial") await ensureFlightReviewClubTasks(existing.$id, studentUserId).catch(() => undefined);
    return { applicable: true, membershipId: existing.$id };
  }
  await databases.createDocument(
    DATABASE_ID,
    FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID,
    membershipId,
    { ...data, created_at: now },
    flightReviewClubMembershipPermissions(studentUserId),
  );
  if (status === "active" || status === "trial") await ensureFlightReviewClubTasks(membershipId, studentUserId).catch(() => undefined);
  return { applicable: true, membershipId };
}

async function fulfillFlightReviewClubSubscription(receiptId, proposal, normalized) {
  const metadata = safeParse(proposal?.products_json, null);
  if (!proposal || !metadata || Array.isArray(metadata) || metadata.kind !== "flight_review_club_subscription") {
    return { applicable: false, membershipId: "" };
  }
  if (metadata.binding === "student" || metadata.billingMode === "student_subscription" || metadata.plan) {
    const membership = await upsertFlightReviewClubMembership(proposal, normalized, "active");
    await updateFulfillment(receiptId, proposal.$id, {
      status: "completed",
      error: "",
      creditId: membership.membershipId,
      sagaStatus: "not_applicable",
      sagaError: "",
      sagaMarker: "",
    });
    return membership;
  }
  const studentUserId = clean(metadata.studentUserId);
  if (!studentUserId) throw new Error("Proposta FRC sem aluno vinculado.");
  if (!STUDENT_TRACKS_COLLECTION_ID) throw new Error("Colecao de trilhas do aluno nao configurada para ativar o FRC.");
  const assignmentId = clean(metadata.assignmentId);
  const assignment = assignmentId
    ? await databases.getDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, assignmentId).catch(() => null)
    : await findPrimaryStudentTrack(studentUserId);
  if (!assignment) throw new Error("Vinculo de trilha do aluno nao encontrado para ativar o FRC.");
  if (clean(assignment.student_user_id) !== studentUserId) {
    throw new Error("Vinculo de trilha nao pertence ao aluno da proposta FRC.");
  }
  await databases.updateDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, assignment.$id, {
    is_flight_review_club_member: true,
    updated_at: new Date().toISOString(),
  });
  const membershipId = clean(metadata.membershipId) || `frc_${crypto.createHash("sha256").update(proposal.$id).digest("hex").slice(0, 28)}`;
  await updateFulfillment(receiptId, proposal.$id, {
    status: "completed",
    error: "",
    creditId: membershipId,
    sagaStatus: "not_applicable",
    sagaError: "",
    sagaMarker: "",
  });
  return { applicable: true, membershipId };
}

async function notifyAdminsOfSale(receiptId, normalized, proposal) {
  const metadata = safeParse(proposal?.products_json, null);
  const snapshot = metadata && !Array.isArray(metadata) ? asObject(metadata.snapshot) : {};
  const hours = Number(snapshot.hours);
  const extraProductLabels = proposalProducts(metadata).map((product) => product.name);
  let productLabel = Number.isFinite(hours) && hours > 0 && clean(snapshot.aircraftModelName)
    ? `${hours}h — ${clean(snapshot.aircraftModelName)}`
    : "";
  let studentUserId = clean(metadata?.studentUserId);
  if (!productLabel && MARKETPLACE_ORDERS_COLLECTION_ID && clean(normalized.offerId)) {
    try {
      const page = await databases.listDocuments(DATABASE_ID, MARKETPLACE_ORDERS_COLLECTION_ID, [
        sdk.Query.equal("cakto_offer_id", [clean(normalized.offerId)]),
        sdk.Query.equal("status", ["pending"]),
        sdk.Query.orderAsc("$createdAt"),
        sdk.Query.limit(10),
      ]);
      const email = clean(normalized.customerEmail).toLowerCase();
      const docs = page.documents || [];
      const matched =
        (email && docs.find((doc) => clean(doc.buyer_email).toLowerCase() === email)) ||
        docs[0] ||
        null;
      if (matched) {
        const snap = safeParse(matched.snapshot_json, {}) || {};
        productLabel = [
          clean(snap.productName || matched.product_name),
          clean(snap.variantLabel || matched.variant_label),
        ].filter(Boolean).join(" — ");
        studentUserId = studentUserId || clean(matched.buyer_user_id);
      }
    } catch {
      // Marketplace lookup is best-effort for admin email labeling.
    }
  }
  await functionsApi.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    async: true,
    body: JSON.stringify({
      action: "notifyCaktoSaleEvent",
      token: WEBHOOK_TOKEN,
      sale: {
        receiptId,
        proposalId: proposal?.$id || "",
        studentUserId,
        customerName: normalized.customerName,
        customerEmail: normalized.customerEmail,
        amount: normalized.amount,
        currency: normalized.currency,
        paymentMethod: normalized.paymentMethod,
        paymentInstallments: normalized.paymentInstallments,
        orderId: normalized.orderId,
        productLabel: [productLabel, ...extraProductLabels].filter(Boolean).join(" + "),
        eventAt: normalized.eventAt || normalized.receivedAt,
      },
    }),
  });
}

async function notifyMarketplaceBuyer(order, receiptId, normalized) {
  const buyerUserId = clean(order?.buyer_user_id);
  if (!buyerUserId) return;
  const snap = safeParse(order.snapshot_json, {}) || {};
  await functionsApi.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    async: true,
    body: JSON.stringify({
      action: "notifyMarketplaceOrderPaid",
      token: WEBHOOK_TOKEN,
      sale: {
        orderId: order.$id,
        receiptId,
        buyerUserId,
        productName: clean(snap.productName || order.product_name),
        productLabel: clean(snap.productName || order.product_name),
        variantLabel: clean(snap.variantLabel || order.variant_label),
        amount: Number(order.amount) || normalized.amount || 0,
        currency: normalized.currency || "BRL",
        customerName: clean(snap.buyerName || order.buyer_name) || normalized.customerName,
        customerEmail: clean(order.buyer_email) || normalized.customerEmail,
        paymentMethod: normalized.paymentMethod,
        eventAt: normalized.eventAt || normalized.receivedAt,
      },
    }),
  });
}

function parseMarketplaceVariants(raw) {
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function findPendingMarketplaceOrder(normalized) {
  if (!MARKETPLACE_ORDERS_COLLECTION_ID) return null;
  const offerId = clean(normalized.offerId);
  const email = clean(normalized.customerEmail).toLowerCase();
  if (offerId) {
    const page = await databases.listDocuments(DATABASE_ID, MARKETPLACE_ORDERS_COLLECTION_ID, [
      sdk.Query.equal("cakto_offer_id", [offerId]),
      sdk.Query.equal("status", ["pending"]),
      sdk.Query.orderAsc("$createdAt"),
      sdk.Query.limit(25),
    ]).catch(() => ({ documents: [] }));
    const docs = page.documents || [];
    if (docs.length) {
      const emailMatch = email
        ? docs.find((doc) => clean(doc.buyer_email).toLowerCase() === email)
        : null;
      return emailMatch || docs[0];
    }
  }
  if (!email) return null;
  const recent = await databases.listDocuments(DATABASE_ID, MARKETPLACE_ORDERS_COLLECTION_ID, [
    sdk.Query.equal("buyer_email", [email]),
    sdk.Query.equal("status", ["pending"]),
    sdk.Query.orderDesc("$createdAt"),
    sdk.Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  const docs = recent.documents || [];
  if (!docs.length) return null;
  // Prefer recent pending orders (last 7 days) when offer id did not match.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (
    docs.find((doc) => {
      const created = new Date(doc.$createdAt || 0).getTime();
      return Number.isFinite(created) && created >= cutoff;
    }) || null
  );
}

async function decrementMarketplaceStock(order) {
  if (!MARKETPLACE_PRODUCTS_COLLECTION_ID) return;
  const productId = clean(order.product_id);
  if (!productId) return;
  const product = await databases.getDocument(DATABASE_ID, MARKETPLACE_PRODUCTS_COLLECTION_ID, productId).catch(() => null);
  if (!product || product.track_stock !== true) return;

  const snap = safeParse(order.snapshot_json, {}) || {};
  const variantId = clean(snap.variantId || order.variant_id);
  const details = safeParse(product.details_json, {}) || {};
  const variants = parseMarketplaceVariants(details.variants || product.variants_json);
  if (variantId && variants.length) {
    let changed = false;
    const nextVariants = variants.map((variant) => {
      if (clean(variant?.id) !== variantId) return variant;
      if (variant?.stock == null || variant?.stock === "") return variant;
      const stock = Math.max(0, Number(variant.stock) - 1);
      changed = true;
      return { ...variant, stock: Number.isFinite(stock) ? stock : 0 };
    });
    if (changed) {
      await databases.updateDocument(DATABASE_ID, MARKETPLACE_PRODUCTS_COLLECTION_ID, productId, {
        details_json: JSON.stringify({ ...details, variants: nextVariants }),
      });
    }
    return;
  }

  if (product.stock == null) return;
  const stock = Math.max(0, Number(product.stock) - 1);
  await databases.updateDocument(DATABASE_ID, MARKETPLACE_PRODUCTS_COLLECTION_ID, productId, {
    stock: Number.isFinite(stock) ? stock : 0,
  });
}

async function fulfillMarketplaceOrder(receiptId, normalized) {
  const order = await findPendingMarketplaceOrder(normalized);
  if (!order) return null;

  const paidAt = clean(normalized.eventAt) || new Date().toISOString();
  const updated = await databases.updateDocument(DATABASE_ID, MARKETPLACE_ORDERS_COLLECTION_ID, order.$id, {
    status: "paid",
    paid_at: paidAt,
    cakto_receipt_id: clean(receiptId),
  });

  try {
    await decrementMarketplaceStock(updated);
  } catch (stockError) {
    // Paid status is already persisted; stock is best-effort.
    console.log(`Marketplace stock decrement failed for ${updated.$id}: ${stockError?.message || stockError}`);
  }

  try {
    await notifyMarketplaceBuyer(updated, receiptId, normalized);
  } catch (notifyError) {
    console.log(`Marketplace buyer notify failed for ${updated.$id}: ${notifyError?.message || notifyError}`);
  }

  return { orderId: updated.$id, productId: clean(updated.product_id) };
}

function normalize(payload, receivedAt) {
  const data = payloadData(payload);
  const order = asObject(payload.order || data.order || data);
  const customer = asObject(payload.customer || data.customer || order.customer);
  const offer = asObject(payload.offer || data.offer || order.offer);
  const product = asObject(payload.product || data.product || offer.product || order.product);
  const payment = asObject(payload.payment || data.payment || order.payment);
  const subscription = asObject(payload.subscription || data.subscription || order.subscription);
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
    offerId: first(offer.id, subscription.offer_id, subscription.offerId, order.offer_id, data.offer_id, payload.offer_id),
    productId: first(product.id, offer.product_id, subscription.product_id, order.product_id, data.product_id, payload.product_id),
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
      eventType === "subscription_renewed" ? first(subscription.renewed_at, subscription.updated_at, data.paidAt) : "",
      eventType === "subscription_canceled" ? first(subscription.canceled_at, data.canceledAt) : "",
      eventType === "refund" ? data.refundedAt : "",
      eventType === "chargeback" ? data.chargedbackAt : "",
      eventAt,
    ) || null,
    subscriptionId: first(subscription.id, subscription.subscription_id, order.subscription_id, data.subscription_id, payload.subscription_id),
    subscriptionStatus: first(subscription.status, data.subscription_status, payload.subscription_status),
    currentPeriod: Math.max(0, Math.round(amountFrom(first(subscription.current_period, data.current_period, payload.current_period)))) || 0,
    paidPaymentsQuantity: Math.max(0, Math.round(amountFrom(first(
      subscription.paid_payments_quantity,
      subscription.paidPaymentsQuantity,
      data.paid_payments_quantity,
      payload.paid_payments_quantity,
    )))) || 0,
    recurrencePeriodDays: Math.max(0, Math.round(amountFrom(first(
      subscription.recurrence_period,
      subscription.recurrencePeriod,
      data.recurrence_period,
      payload.recurrence_period,
    )))) || 0,
    nextPaymentDate: first(
      subscription.next_payment_date,
      subscription.nextPaymentDate,
      subscription.next_charge_at,
      data.next_payment_date,
      payload.next_payment_date,
    ) || null,
    canceledAt: first(subscription.canceled_at, subscription.canceledAt, data.canceledAt, payload.canceled_at) || null,
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
    let proposal = await findProposal(normalized.offerId);
    if (!proposal && normalized.subscriptionId) {
      const membership = await findFlightReviewClubMembershipBySubscription(normalized.subscriptionId);
      proposal = await findProposalById(membership?.proposal_id);
    }
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
    } else if (normalized.eventType === "purchase_approved" && proposalMetadata?.kind === "flight_review_club_subscription") {
      try {
        const fulfillment = await fulfillFlightReviewClubSubscription(documentId, proposal, normalized);
        log(`Cakto FRC fulfilled: proposal=${proposalId} membership=${fulfillment.membershipId}`);
      } catch (fulfillmentError) {
        await updateFulfillment(documentId, proposalId, {
          status: "failed",
          error: fulfillmentError?.message || String(fulfillmentError),
          creditId: clean(proposalMetadata?.membershipId),
          sagaStatus: "not_applicable",
          sagaError: "",
          sagaMarker: "",
        }).catch(() => undefined);
        throw fulfillmentError;
      }
    } else if (["subscription_renewed", "subscription_canceled"].includes(normalized.eventType) && proposalMetadata?.kind === "flight_review_club_subscription") {
      try {
        const fulfillment = await upsertFlightReviewClubMembership(
          proposal,
          normalized,
          normalized.eventType === "subscription_canceled" ? "canceled" : "active",
        );
        await updateFulfillment(documentId, proposalId, {
          status: "completed",
          error: "",
          creditId: fulfillment.membershipId,
          sagaStatus: "not_applicable",
          sagaError: "",
          sagaMarker: "",
        }).catch(() => undefined);
        log(`Cakto FRC subscription event: proposal=${proposalId} membership=${fulfillment.membershipId} event=${normalized.eventType}`);
      } catch (fulfillmentError) {
        await updateFulfillment(documentId, proposalId, {
          status: "failed",
          error: fulfillmentError?.message || String(fulfillmentError),
          creditId: clean(proposalMetadata?.membershipId),
          sagaStatus: "not_applicable",
          sagaError: "",
          sagaMarker: "",
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
      try {
        const fulfilled = await fulfillMarketplaceOrder(documentId, normalized);
        if (fulfilled) {
          log(`Marketplace order fulfilled: ${fulfilled.orderId}`);
          await updateFulfillment(documentId, "", {
            status: "completed",
            error: "",
            creditId: fulfilled.orderId,
            sagaStatus: "not_applicable",
            sagaError: "",
            sagaMarker: "",
          }).catch(() => undefined);
        } else {
          await updateFulfillment(documentId, "", {
            status: "proposal_not_found",
            error: "Nenhuma proposta vinculada a oferta recebida.",
            creditId: "",
          }).catch(() => undefined);
        }
      } catch (fulfillmentError) {
        await updateFulfillment(documentId, "", {
          status: "failed",
          error: fulfillmentError?.message || String(fulfillmentError),
          creditId: "",
          sagaStatus: "not_applicable",
          sagaError: "",
          sagaMarker: "",
        }).catch(() => undefined);
        throw fulfillmentError;
      }
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
