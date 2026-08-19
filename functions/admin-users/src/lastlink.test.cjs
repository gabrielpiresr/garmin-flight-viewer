const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LASTLINK_BASE_OFFER_NAME,
  LASTLINK_CREDIT_PRODUCT_SLUG,
  LASTLINK_MIN_AMOUNT,
  absoluteCheckoutUrl,
  appendProposalQuery,
  appendCheckoutQuery,
  buildCreditTitles,
  communityMatchesProduct,
  findBaseOffer,
  formatHoursLabel,
  isBaseOfferName,
  parseJwtExp,
  sessionExpiresAt,
  tokenLooksValid,
} = require("./lastlink");

test("formats credit hours without trailing decimals", () => {
  assert.equal(formatHoursLabel(55), "55h");
  assert.equal(formatHoursLabel(10.5), "10,5h");
  assert.equal(formatHoursLabel(0), "");
});

test("builds LastLink product and offer titles", () => {
  assert.deepEqual(buildCreditTitles({ studentName: "Maria Silva", hours: 55 }), {
    productTitle: "Crédito de 55h - Maria Silva",
    offerName: "55h - Maria Silva",
  });
  assert.deepEqual(buildCreditTitles({ studentName: "Joao", hours: 0 }), {
    productTitle: "Crédito - Joao",
    offerName: "Joao",
  });
});

test("turns relative checkout paths into lastlink URLs", () => {
  assert.equal(
    absoluteCheckoutUrl("/p/CB3D812F6/checkout-payment/"),
    "https://lastlink.com/p/CB3D812F6/checkout-payment/",
  );
  assert.equal(
    absoluteCheckoutUrl("https://lastlink.com/p/ABC/checkout-payment/"),
    "https://lastlink.com/p/ABC/checkout-payment/",
  );
});

test("reads JWT exp and treats near-expiry tokens as invalid", () => {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const payload = Buffer.from(JSON.stringify({ exp, Email: "a@b.c" })).toString("base64url");
  const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
  assert.equal(parseJwtExp(token), exp);
  assert.equal(tokenLooksValid(token), true);
  assert.equal(sessionExpiresAt(token), new Date(exp * 1000).toISOString());
  assert.equal(tokenLooksValid(token, exp * 1000 - 60 * 1000), false);
});

test("matches the shared LastLink credit product by slug or accented title", () => {
  assert.equal(LASTLINK_MIN_AMOUNT, 5);
  assert.equal(communityMatchesProduct({ title: "Créditos de hora de voo" }, LASTLINK_CREDIT_PRODUCT_SLUG), true);
  assert.equal(communityMatchesProduct({ title: "creditosdehoradevoo" }, LASTLINK_CREDIT_PRODUCT_SLUG), true);
  assert.equal(communityMatchesProduct({ title: "teste de link" }, LASTLINK_CREDIT_PRODUCT_SLUG), false);
});

test("appends student checkout fields and proposal id to the LastLink URL", () => {
  assert.equal(
    appendProposalQuery("https://lastlink.com/p/ABC/checkout-payment/", "prop-1"),
    "https://lastlink.com/p/ABC/checkout-payment/?gfv=prop-1",
  );
  const url = appendCheckoutQuery("https://lastlink.com/p/ABC/checkout-payment/", {
    proposalId: "prop-1",
    name: "Maria Silva",
    email: "maria@example.com",
    document: "123.456.789-00",
    phone: "31999998888",
    cep: "30.123-000",
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("gfv"), "prop-1");
  assert.equal(parsed.searchParams.get("name"), "Maria Silva");
  assert.equal(parsed.searchParams.get("email"), "maria@example.com");
  assert.equal(parsed.searchParams.get("document"), "12345678900");
  assert.equal(parsed.searchParams.get("phone"), "5531999998888");
  assert.equal(parsed.searchParams.get("cep"), "30123000");
});

test("matches only the exact base offer name, not copies", () => {
  assert.equal(LASTLINK_BASE_OFFER_NAME, "oferta base para duplicação");
  assert.equal(isBaseOfferName("oferta base para duplicação"), true);
  assert.equal(isBaseOfferName("Oferta Base Para Duplicação"), true);
  assert.equal(isBaseOfferName("oferta base para duplicacao"), true);
  assert.equal(isBaseOfferName("oferta base para duplicação (cópia)"), false);
  assert.equal(isBaseOfferName("1h - GABRIEL PIRES RAMOS (cópia)"), false);
});

test("finds the cached base offer by id or exact name", () => {
  const offers = [
    { offerId: "copy-1", name: "oferta base para duplicação (cópia)", info: { name: "oferta base para duplicação (cópia)" } },
    { offerId: "base-1", name: "oferta base para duplicação", info: { offerId: "base-1", name: "oferta base para duplicação" } },
    { offerId: "other", name: "55h - Maria Silva" },
  ];
  assert.equal(findBaseOffer(offers)?.offerId, "base-1");
  assert.equal(findBaseOffer(offers, { baseOfferId: "copy-1" })?.offerId, "copy-1");
  assert.equal(findBaseOffer(offers, { baseOfferId: "missing" })?.offerId, "base-1");
});
