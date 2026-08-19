"use strict";

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function amountFrom(value) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

const LASTLINK_EVENT_MAP = {
  purchase_order_confirmed: "purchase_approved",
  recurrent_payment: "purchase_approved",
  payment_refund: "refund",
  refund: "refund",
  payment_chargeback: "chargeback",
  purchase_request_canceled: "purchase_refused",
  purchase_request_expired: "purchase_refused",
  purchase_request_confirmed: "pix_gerado",
};

function isLastLinkPayload(payload) {
  const body = asObject(payload);
  const eventName = clean(body.Event || body.event);
  const data = body.Data || body.data;
  return Boolean(eventName) && data && typeof data === "object";
}

function mapLastLinkEvent(eventName) {
  return LASTLINK_EVENT_MAP[clean(eventName).toLowerCase()] || "";
}

function checkoutCodeFromUrl(url) {
  const match = clean(url).match(/\/p\/([^/?#]+)/i);
  return clean(match?.[1]);
}

function extractGfvProposalId(payload) {
  const data = asObject(payload?.Data || payload?.data);
  const purchase = asObject(data.Purchase || data.purchase);
  const offer = asObject(data.Offer || data.offer);
  const utm = asObject(data.Utm || data.utm);
  const urls = [
    purchase.OriginUrl,
    purchase.originUrl,
    offer.Url,
    offer.url,
    utm.Src,
  ];
  for (const url of urls) {
    try {
      const value = new URL(String(url), "https://lastlink.com").searchParams.get("gfv");
      if (clean(value)) return clean(value);
    } catch {
      // Ignore malformed tracking URLs and keep scanning the remaining candidates.
    }
  }
  return clean(utm.gfv || utm.Gfv);
}

function lastlinkNormalize(payload, receivedAt) {
  const body = asObject(payload);
  const data = asObject(body.Data || body.data);
  const buyer = asObject(data.Buyer || data.buyer);
  const purchase = asObject(data.Purchase || data.purchase);
  const offer = asObject(data.Offer || data.offer);
  const payment = asObject(purchase.Payment || purchase.payment);
  const products = Array.isArray(data.Products) ? data.Products : Array.isArray(data.products) ? data.products : [];
  const price = asObject(purchase.Price || purchase.price);
  const originalPrice = asObject(purchase.OriginalPrice || purchase.originalPrice);
  const eventType = mapLastLinkEvent(body.Event || body.event);
  const offerUrl = clean(offer.Url || offer.url || purchase.OriginUrl || purchase.originUrl);
  return {
    eventType,
    eventId: clean(body.Id || body.id),
    orderId: clean(purchase.PaymentId || purchase.paymentId || body.Id || body.id),
    offerId: clean(offer.Id || offer.id),
    productId: clean(products[0]?.Id || products[0]?.id),
    customerName: clean(buyer.Name || buyer.name),
    customerEmail: clean(buyer.Email || buyer.email),
    amount: amountFrom(price.Value ?? price.value ?? originalPrice.Value ?? originalPrice.value),
    currency: "BRL",
    paymentMethod: clean(payment.PaymentMethod || payment.paymentMethod || payment.method || "lastlink"),
    paymentInstallments: Math.max(0, Math.round(amountFrom(payment.NumberOfInstallments || payment.numberOfInstallments))) || null,
    status: eventType,
    eventAt: clean(purchase.PaymentDate || purchase.paymentDate || body.CreatedAt || body.createdAt) || receivedAt,
    subscriptionId: "",
    subscriptionStatus: "",
    currentPeriod: 0,
    paidPaymentsQuantity: 0,
    recurrencePeriodDays: 0,
    nextPaymentDate: null,
    canceledAt: null,
    receivedAt,
    proposalIdFromUrl: extractGfvProposalId(body),
    checkoutCode: checkoutCodeFromUrl(offerUrl),
    isTest: body.IsTest === true || body.isTest === true,
    provider: "lastlink",
  };
}

module.exports = {
  checkoutCodeFromUrl,
  extractGfvProposalId,
  isLastLinkPayload,
  lastlinkNormalize,
  mapLastLinkEvent,
};
