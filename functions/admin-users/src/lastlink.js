"use strict";

const LASTLINK_ORIGIN = "https://lastlink.com";
const LASTLINK_PRODUCT_TYPE_ID = 7;
const LASTLINK_TOKEN_SKEW_MS = 5 * 60 * 1000;
const LASTLINK_MIN_AMOUNT = 5;
const LASTLINK_CREDIT_PRODUCT_SLUG = "creditosdehoradevoo";

function clean(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJwtPayload(token) {
  const raw = clean(token).replace(/^"|"$/g, "");
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseJwtExp(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) && exp > 0 ? exp : 0;
}

function tokenLooksValid(token, nowMs = Date.now(), skewMs = LASTLINK_TOKEN_SKEW_MS) {
  const exp = parseJwtExp(token);
  if (!exp) return false;
  return exp * 1000 - skewMs > nowMs;
}

function sessionExpiresAt(token) {
  const exp = parseJwtExp(token);
  return exp ? new Date(exp * 1000).toISOString() : null;
}

function unwrapJson(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")) || trimmed.startsWith("\"")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
}

function formatHoursLabel(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = Math.round(n * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  return `${label}h`;
}

function buildCreditTitles({ studentName, hours } = {}) {
  const name = clean(studentName) || "Aluno";
  const hoursLabel = formatHoursLabel(hours);
  return {
    productTitle: hoursLabel ? `Crédito de ${hoursLabel} - ${name}` : `Crédito - ${name}`,
    offerName: hoursLabel ? `${hoursLabel} - ${name}` : name,
  };
}

function absoluteCheckoutUrl(path) {
  const raw = clean(path);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${LASTLINK_ORIGIN}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function normalizeProductKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function communityMatchesProduct(community, slug) {
  const wanted = normalizeProductKey(slug || LASTLINK_CREDIT_PRODUCT_SLUG);
  if (!wanted) return false;
  const candidates = [community?.id, community?.title, community?.name, community?.friendlyUrl, community?.url, community?.slug];
  return candidates.some((item) => {
    const key = normalizeProductKey(item);
    return Boolean(key) && (key === wanted || key.includes(wanted));
  });
}

function findCreditCommunity(communities, { communityId, productSlug } = {}) {
  const list = Array.isArray(communities) ? communities : [];
  const wantedId = clean(communityId);
  if (wantedId) {
    const byId = list.find((item) => clean(item?.id) === wantedId);
    if (byId) return byId;
  }
  return list.find((item) => communityMatchesProduct(item, productSlug)) || null;
}

function appendProposalQuery(url, proposalId) {
  return appendCheckoutQuery(url, { proposalId });
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function lastlinkPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function appendCheckoutQuery(url, params = {}) {
  const safeUrl = clean(url);
  if (!safeUrl) return "";
  let parsed;
  try {
    parsed = new URL(safeUrl);
  } catch {
    parsed = new URL(safeUrl, LASTLINK_ORIGIN);
  }
  const fields = {
    name: clean(params.name || params.buyer?.name),
    email: clean(params.email || params.buyer?.email),
    document: digitsOnly(params.document || params.buyer?.document),
    phone: lastlinkPhone(params.phone || params.buyer?.phone),
    cep: digitsOnly(params.cep || params.buyer?.cep),
    number: clean(params.number || params.buyer?.number),
    gfv: clean(params.proposalId || params.gfv),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

async function ensureCreditCommunity(token, { communityId, productSlug } = {}) {
  const slug = clean(productSlug) || LASTLINK_CREDIT_PRODUCT_SLUG;
  const listed = await listCommunities(token);
  const existing = findCreditCommunity(listed, { communityId, productSlug: slug });
  if (clean(existing?.id)) return existing;
  const previous = listed.map((item) => clean(item?.id)).filter(Boolean);
  await addCommunity(token, slug);
  return waitForNewCommunity(token, previous, slug);
}

function lastlinkHeaders(token, extra = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: LASTLINK_ORIGIN,
    Referer: `${LASTLINK_ORIGIN}/app/creator/dashboard`,
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${clean(token)}`;
  return headers;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function httpError(message, status, body) {
  const error = new Error(message);
  error.status = status;
  if (body != null) error.body = body;
  return error;
}

async function lastlinkFetch(token, path, options = {}) {
  const response = await fetch(`${LASTLINK_ORIGIN}${path}`, {
    method: options.method || "GET",
    headers: lastlinkHeaders(token, options.headers),
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const body = await parseResponse(response);
  if (response.status === 401) {
    throw httpError("Sessao LastLink expirada.", 401, body);
  }
  if (!response.ok) {
    const message =
      clean(body?.message || body?.detail || body?.title) ||
      (body?.hasErrors ? "LastLink recusou a oferta. Confira o valor (minimo aproximado R$ 5)." : "") ||
      `Falha na LastLink (${response.status}).`;
    throw httpError(message, response.status >= 400 ? response.status : 502, body);
  }
  return body;
}

async function loginLastLink({ email, password }) {
  const safeEmail = clean(email);
  const safePassword = String(password || "");
  if (!safeEmail || !safePassword) {
    throw httpError("Informe e-mail e senha da LastLink.", 400);
  }
  const response = await fetch(`${LASTLINK_ORIGIN}/api/dashboard/auth/signin`, {
    method: "POST",
    headers: lastlinkHeaders("", { Referer: `${LASTLINK_ORIGIN}/app/login` }),
    body: JSON.stringify({ email: safeEmail, password: safePassword }),
  });
  const body = unwrapJson(await parseResponse(response));
  if (!response.ok) {
    throw httpError(clean(body?.message) || "Falha ao autenticar na LastLink.", response.status || 400, body);
  }
  const token = clean(typeof body === "string" ? body : body?.token || body?.accessToken);
  if (!tokenLooksValid(token)) {
    throw httpError("LastLink nao retornou um token valido.", 502, body);
  }
  return token;
}

async function listCommunities(token) {
  const body = await lastlinkFetch(token, "/api/dashboard/creator/community/list-all-communities");
  return Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
}

async function addCommunity(token, title) {
  return lastlinkFetch(token, "/api/dashboard/creator/community/add", {
    method: "POST",
    body: {
      title: clean(title),
      productTypeId: LASTLINK_PRODUCT_TYPE_ID,
      signupDate: new Date().toISOString(),
    },
  });
}

async function waitForNewCommunity(token, previousIds, title) {
  const previous = new Set((previousIds || []).map((id) => clean(id)).filter(Boolean));
  const wanted = clean(title);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) await sleep(400);
    const communities = await listCommunities(token);
    const fresh = communities.filter((item) => clean(item?.id) && !previous.has(clean(item.id)));
    const match = fresh.find((item) => clean(item?.title) === wanted) || fresh[0];
    if (clean(match?.id)) return match;
  }
  throw httpError("Produto criado na LastLink, mas o ID nao apareceu na listagem.", 502);
}

async function createOfferAndPlans(token, { communityId, name, amount }) {
  const safeAmount = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw httpError("Valor da oferta LastLink invalido.", 400);
  }
  if (safeAmount < LASTLINK_MIN_AMOUNT) {
    throw httpError(`Valor minimo na LastLink e R$ ${LASTLINK_MIN_AMOUNT.toFixed(2)}.`, 400);
  }
  const body = await lastlinkFetch(token, "/api/community/admin/offer/create-offer-and-plans", {
    method: "POST",
    body: {
      allowNewSubscriptions: true,
      billingType: 2,
      isTermAccepted: true,
      isBankslipEnabled: true,
      enableManualCouponInput: false,
      enableTermsOfUse: false,
      termsOfUse: null,
      isPixEnabled: true,
      name: clean(name),
      oneTime: {
        amount: safeAmount,
        allowSmartInstallment: false,
        passOnInstallmentInterestRate: true,
        maxInstallment: 6,
        membershipFee: 0,
        interestRatePayerId: 2,
        joinMembershipFeePlanValueEnabled: false,
      },
      oneTimeAccess: { startDate: null, expirationDate: null },
      communityId: clean(communityId),
      bundleCommunityIds: [],
      allowSmartInstallment: false,
      maxSmartInstallments: null,
    },
  });
  const offerId = clean(typeof body === "string" ? body : body?.offerId || body?.id);
  if (!offerId || body?.hasErrors) {
    throw httpError("LastLink recusou a criacao da oferta.", 400, body);
  }
  return offerId;
}

async function listActiveOffers(token, communityId) {
  const query = new URLSearchParams({
    communityId: clean(communityId),
    page: "1",
    size: "20",
    status: "active",
  });
  const body = await lastlinkFetch(token, `/api/community/admin/offer/list?${query.toString()}`);
  return Array.isArray(body?.items) ? body.items : [];
}

async function waitForOffer(token, communityId, offerId) {
  const wanted = clean(offerId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await sleep(300);
    const items = await listActiveOffers(token, communityId);
    const match = items.find((item) => clean(item?.offerId || item?.info?.offerId) === wanted);
    const checkoutUrl = absoluteCheckoutUrl(match?.checkoutUrl);
    if (checkoutUrl) {
      return {
        offerId: clean(match?.offerId || wanted),
        communityId: clean(match?.info?.communityId || communityId),
        code: clean(match?.info?.code),
        checkoutUrl,
        paymentUrl: checkoutUrl,
      };
    }
  }
  throw httpError("Oferta criada na LastLink, mas o link de pagamento nao apareceu.", 502);
}

async function createPaymentLink(token, { offerName, amount, communityId, productSlug, proposalId, buyer } = {}) {
  const community = await ensureCreditCommunity(token, { communityId, productSlug });
  const offerId = await createOfferAndPlans(token, {
    communityId: community.id,
    name: offerName,
    amount,
  });
  const created = await waitForOffer(token, community.id, offerId);
  return {
    ...created,
    paymentUrl: appendCheckoutQuery(created.paymentUrl, {
      proposalId,
      ...(buyer && typeof buyer === "object" ? buyer : {}),
    }),
    productSlug: clean(productSlug) || LASTLINK_CREDIT_PRODUCT_SLUG,
  };
}

module.exports = {
  LASTLINK_CREDIT_PRODUCT_SLUG,
  LASTLINK_MIN_AMOUNT,
  LASTLINK_ORIGIN,
  LASTLINK_PRODUCT_TYPE_ID,
  absoluteCheckoutUrl,
  appendCheckoutQuery,
  appendProposalQuery,
  buildCreditTitles,
  communityMatchesProduct,
  createPaymentLink,
  ensureCreditCommunity,
  findCreditCommunity,
  formatHoursLabel,
  lastlinkFetch,
  listCommunities,
  loginLastLink,
  normalizeProductKey,
  parseJwtExp,
  sessionExpiresAt,
  tokenLooksValid,
};
