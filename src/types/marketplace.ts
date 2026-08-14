export type MarketplacePaymentMode = "cakto" | "external";

export type MarketplaceProductKind = "physical" | "service" | "digital";

export type MarketplaceCategory = {
  id: string;
  schoolId: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type MarketplaceCategoryInput = {
  name: string;
  sortOrder?: number;
  active?: boolean;
};

export type MarketplaceVariant = {
  id: string;
  label: string;
  /** Estoque da variante; ignorado se o produto não controla estoque. */
  stock: number | null;
};

export type MarketplaceAttribute = {
  key: string;
  value: string;
};

export type MarketplaceProduct = {
  id: string;
  schoolId: string;
  categoryId: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  kind: MarketplaceProductKind;
  paymentMode: MarketplacePaymentMode;
  price: number;
  /** Link de pagamento (Cakto ou externo). */
  paymentUrl: string;
  /** % de desconto exibido / aplicado para membros FRC (Cakto dinâmico futuro). */
  frcDiscountPercent: number;
  /** Link alternativo para membros FRC; se vazio, usa paymentUrl. */
  frcPaymentUrl: string;
  /** Offer id extraído do link Cakto (paymentUrl). */
  caktoOfferId: string;
  /** Offer id do link FRC, se houver. */
  frcCaktoOfferId: string;
  trackStock: boolean;
  /** Estoque do produto (sem variantes). */
  stock: number | null;
  variants: MarketplaceVariant[];
  attributes: MarketplaceAttribute[];
  images: string[];
  featured: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type MarketplaceProductInput = {
  categoryId: string;
  name: string;
  shortDescription?: string;
  description?: string;
  kind?: MarketplaceProductKind;
  paymentMode: MarketplacePaymentMode;
  price: number;
  paymentUrl: string;
  frcDiscountPercent?: number;
  frcPaymentUrl?: string;
  trackStock?: boolean;
  stock?: number | null;
  variants?: MarketplaceVariant[];
  attributes?: MarketplaceAttribute[];
  images?: string[];
  featured?: boolean;
  active?: boolean;
  sortOrder?: number;
};

export type MarketplaceOrderStatus = "pending" | "paid" | "cancelled" | "refunded";

export type MarketplaceOrder = {
  id: string;
  schoolId: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  variantId: string;
  variantLabel: string;
  buyerUserId: string;
  buyerName: string;
  buyerEmail: string;
  paymentMode: MarketplacePaymentMode;
  paymentUrl: string;
  caktoOfferId: string;
  amount: number;
  frcApplied: boolean;
  frcDiscountPercent: number;
  status: MarketplaceOrderStatus;
  adminNotes: string;
  caktoReceiptId: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceCheckoutResult = {
  orderId: string;
  paymentUrl: string;
  status: MarketplaceOrderStatus;
};

export type MarketplaceSettings = {
  enabled: boolean;
  storeTitle: string;
  storeSubtitle: string;
  updatedAt: string | null;
};

export function defaultMarketplaceSettings(): MarketplaceSettings {
  return {
    enabled: false,
    storeTitle: "Marketplace",
    storeSubtitle: "Produtos e serviços da escola",
    updatedAt: null,
  };
}

export function extractCaktoOfferId(paymentUrl: string): string {
  const raw = (paymentUrl || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!host.includes("cakto")) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const match = raw.match(/cakto\.com\.br\/([A-Za-z0-9_-]+)/i);
    return match?.[1] || "";
  }
}

export function slugifyMarketplace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function marketplaceEffectivePrice(product: Pick<MarketplaceProduct, "price" | "frcDiscountPercent">, isFrcMember: boolean): number {
  const base = Math.max(0, Number(product.price) || 0);
  const pct = Math.max(0, Math.min(100, Number(product.frcDiscountPercent) || 0));
  if (!isFrcMember || pct <= 0) return base;
  return Math.round(base * (1 - pct / 100) * 100) / 100;
}

export function marketplacePaymentUrlForBuyer(
  product: Pick<MarketplaceProduct, "paymentUrl" | "frcPaymentUrl">,
  isFrcMember: boolean,
): string {
  if (isFrcMember && product.frcPaymentUrl.trim()) return product.frcPaymentUrl.trim();
  return product.paymentUrl.trim();
}

export function marketplaceIsOutOfStock(
  product: Pick<MarketplaceProduct, "trackStock" | "stock" | "variants" | "paymentMode">,
  variantId?: string | null,
): boolean {
  if (product.paymentMode !== "cakto" || !product.trackStock) return false;
  if (product.variants.length > 0) {
    const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
    if (!variant) return true;
    return variant.stock != null && variant.stock <= 0;
  }
  return product.stock != null && product.stock <= 0;
}
