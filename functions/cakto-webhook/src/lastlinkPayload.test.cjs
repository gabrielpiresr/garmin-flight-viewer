const test = require("node:test");
const assert = require("node:assert/strict");
const { extractGfvProposalId, isLastLinkPayload, lastlinkNormalize, mapLastLinkEvent } = require("./lastlinkPayload");

test("maps LastLink purchase confirmation to Cakto approved event", () => {
  assert.equal(mapLastLinkEvent("Purchase_Order_Confirmed"), "purchase_approved");
  assert.equal(mapLastLinkEvent("Payment_Refund"), "refund");
});

test("extracts proposal id from LastLink checkout query", () => {
  const proposalId = extractGfvProposalId({
    Data: {
      Purchase: { OriginUrl: "https://lastlink.com/p/C8BF98E19/checkout-payment/?gfv=abc123" },
      Offer: { Url: "https://lastlink.com/p/C8BF98E19" },
    },
  });
  assert.equal(proposalId, "abc123");
});

test("normalizes a LastLink confirmed purchase payload", () => {
  const normalized = lastlinkNormalize({
    Id: "evt-1",
    IsTest: false,
    Event: "Purchase_Order_Confirmed",
    CreatedAt: "2026-08-19T12:00:00",
    Data: {
      Products: [{ Id: "community-1", Name: "creditosdehoradevoo" }],
      Buyer: { Name: "Maria Silva", Email: "maria@example.com" },
      Purchase: {
        Price: { Value: 550 },
        Payment: { NumberOfInstallments: 1, PaymentMethod: "pix" },
        PaymentId: "pay-1",
        OriginUrl: "https://lastlink.com/p/ABC123/checkout-payment/?gfv=proposal-1",
      },
      Offer: { Id: "offer-uuid", Name: "10h - Maria Silva", Url: "https://lastlink.com/p/ABC123" },
    },
  }, "2026-08-19T12:00:01.000Z");
  assert.equal(isLastLinkPayload({ Event: "Purchase_Order_Confirmed", Data: {} }), true);
  assert.equal(normalized.eventType, "purchase_approved");
  assert.equal(normalized.offerId, "offer-uuid");
  assert.equal(normalized.amount, 550);
  assert.equal(normalized.customerEmail, "maria@example.com");
  assert.equal(normalized.proposalIdFromUrl, "proposal-1");
  assert.equal(normalized.checkoutCode, "ABC123");
  assert.equal(normalized.provider, "lastlink");
});

test("does not misclassify the current Cakto envelope as LastLink", () => {
  assert.equal(isLastLinkPayload({
    event: "purchase_approved",
    data: {
      id: "2CfWLW3",
      refId: "2CfWLW3",
      status: "paid",
      amount: 5982,
      customer: { name: "Maria Silva", email: "maria@example.com" },
      product: { id: "product-1", name: "Créditos de Hora de Voo" },
      offer: { id: "offer-1", price: 5982, currency: "BRL" },
    },
  }), false);
});

test("keeps accepting a camelCase legacy LastLink envelope", () => {
  assert.equal(isLastLinkPayload({
    event: "Purchase_Order_Confirmed",
    data: {
      Buyer: { Name: "Maria Silva" },
      Purchase: { Price: { Value: 550 } },
      Products: [],
    },
  }), true);
});
