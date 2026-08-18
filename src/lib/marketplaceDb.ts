import { Query } from "appwrite";
import {
  ADMIN_USERS_FUNCTION_ID,
  BUCKET_ID,
  databases,
  DEFAULT_SCHOOL_ID,
  functions,
  ID,
  isAppwriteConfigured,
  MARKETPLACE_CATEGORIES_COL_ID,
  MARKETPLACE_ORDERS_COL_ID,
  MARKETPLACE_PRODUCTS_COL_ID,
  Permission,
  PLATFORM_SETTINGS_COL_ID,
  Role,
  storage,
} from "./appwrite";
import type {
  MarketplaceCategory,
  MarketplaceCategoryInput,
  MarketplaceCheckoutResult,
  MarketplaceOrder,
  MarketplaceOrderStatus,
  MarketplaceProduct,
  MarketplaceProductInput,
  MarketplaceSettings,
  MarketplaceVariant,
  MarketplaceAttribute,
} from "../types/marketplace";
import {
  defaultMarketplaceSettings,
  extractCaktoOfferId,
  slugifyMarketplace,
} from "../types/marketplace";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const SETTINGS_COL_ID = PLATFORM_SETTINGS_COL_ID;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID);
}

function adminPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject<T extends Record<string, unknown>>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as T;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

function toCategory(doc: Record<string, unknown>): MarketplaceCategory {
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    name: (doc.name as string) ?? "",
    slug: (doc.slug as string) ?? "",
    sortOrder: Number(doc.sort_order ?? 0),
    active: Boolean(doc.active ?? true),
    createdAt: (doc.$createdAt as string) ?? "",
    deletedAt: (doc.deleted_at as string | null | undefined) ?? null,
  };
}

function toProduct(doc: Record<string, unknown>): MarketplaceProduct {
  const details = parseJsonObject<Record<string, unknown>>(doc.details_json, {});
  const variants = parseJsonArray<MarketplaceVariant>(details.variants ?? doc.variants_json, []).map((v) => ({
    id: String(v.id || ID.unique()),
    label: String(v.label || "").trim(),
    stock: v.stock == null || v.stock === ("" as unknown) ? null : Number(v.stock),
  })).filter((v) => v.label);
  const attributes = parseJsonArray<MarketplaceAttribute>(details.attributes ?? doc.attributes_json, [])
    .map((a) => ({ key: String(a.key || "").trim(), value: String(a.value || "").trim() }))
    .filter((a) => a.key);
  const images = parseJsonArray<string>(details.images ?? doc.images_json, []).map((u) => String(u).trim()).filter(Boolean);
  const paymentUrl = String(doc.payment_url || "").trim();
  const frcPaymentUrl = String(details.frcPaymentUrl ?? doc.frc_payment_url ?? "").trim();
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    categoryId: (doc.category_id as string) ?? "",
    name: (doc.name as string) ?? "",
    slug: (doc.slug as string) ?? "",
    shortDescription: String(details.shortDescription ?? doc.short_description ?? ""),
    description: String(details.description ?? doc.description ?? ""),
    kind: (String(details.kind ?? doc.kind ?? "physical") || "physical") as MarketplaceProduct["kind"],
    paymentMode: ((doc.payment_mode as string) || "external") as MarketplaceProduct["paymentMode"],
    price: Number(doc.price ?? 0),
    paymentUrl,
    frcDiscountPercent: Math.max(0, Math.min(100, Number(details.frcDiscountPercent ?? doc.frc_discount_percent ?? 0))),
    frcPaymentUrl,
    caktoOfferId: extractCaktoOfferId(paymentUrl),
    frcCaktoOfferId: extractCaktoOfferId(frcPaymentUrl),
    trackStock: Boolean(doc.track_stock),
    stock: doc.stock == null ? null : Number(doc.stock),
    variants,
    attributes,
    images,
    featured: Boolean(doc.featured),
    active: Boolean(doc.active ?? true),
    sortOrder: Number(doc.sort_order ?? 0),
    createdAt: (doc.$createdAt as string) ?? "",
    updatedAt: (doc.$updatedAt as string) ?? "",
    deletedAt: (doc.deleted_at as string | null | undefined) ?? null,
  };
}

function toOrder(doc: Record<string, unknown>): MarketplaceOrder {
  const snap = parseJsonObject<Record<string, unknown>>(doc.snapshot_json, {});
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    productId: (doc.product_id as string) ?? "",
    productName: String(snap.productName ?? doc.product_name ?? ""),
    categoryId: String(snap.categoryId ?? doc.category_id ?? ""),
    categoryName: String(snap.categoryName ?? doc.category_name ?? ""),
    variantId: String(snap.variantId ?? doc.variant_id ?? ""),
    variantLabel: String(snap.variantLabel ?? doc.variant_label ?? ""),
    buyerUserId: (doc.buyer_user_id as string) ?? "",
    buyerName: String(snap.buyerName ?? doc.buyer_name ?? ""),
    buyerEmail: (doc.buyer_email as string) ?? "",
    paymentMode: (String(snap.paymentMode ?? doc.payment_mode ?? "cakto") || "cakto") as MarketplaceProduct["paymentMode"],
    paymentUrl: String(snap.paymentUrl ?? doc.payment_url ?? ""),
    caktoOfferId: (doc.cakto_offer_id as string) ?? "",
    amount: Number(doc.amount ?? 0),
    frcApplied: Boolean(snap.frcApplied ?? doc.frc_applied),
    frcDiscountPercent: Number(snap.frcDiscountPercent ?? doc.frc_discount_percent ?? 0),
    status: ((doc.status as string) || "pending") as MarketplaceOrderStatus,
    adminNotes: (doc.admin_notes as string) ?? "",
    caktoReceiptId: (doc.cakto_receipt_id as string) ?? "",
    paidAt: (doc.paid_at as string | null | undefined) || null,
    createdAt: (doc.$createdAt as string) ?? "",
    updatedAt: (doc.$updatedAt as string) ?? "",
  };
}

function productPayload(input: MarketplaceProductInput) {
  const name = input.name.trim();
  const paymentUrl = input.paymentUrl.trim();
  const frcPaymentUrl = (input.frcPaymentUrl || "").trim();
  const details = {
    shortDescription: (input.shortDescription || "").trim().slice(0, 280),
    description: (input.description || "").trim().slice(0, 8000),
    kind: input.kind || "physical",
    frcDiscountPercent: Math.max(0, Math.min(100, Number(input.frcDiscountPercent) || 0)),
    frcPaymentUrl,
    variants: (input.variants || [])
      .map((v) => ({
        id: v.id || ID.unique(),
        label: v.label.trim(),
        stock: v.stock == null ? null : Math.max(0, Math.round(Number(v.stock) || 0)),
      }))
      .filter((v) => v.label),
    attributes: (input.attributes || [])
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key),
    images: (input.images || []).map((u) => u.trim()).filter(Boolean).slice(0, 8),
  };
  return {
    school_id: DEFAULT_SCHOOL_ID,
    category_id: input.categoryId,
    name,
    slug: slugifyMarketplace(name) || `produto-${Date.now()}`,
    payment_mode: input.paymentMode,
    price: Math.max(0, Number(input.price) || 0),
    payment_url: input.paymentMode === "cakto" ? (paymentUrl || "cakto-auto") : paymentUrl,
    track_stock: Boolean(input.trackStock) && input.paymentMode === "cakto",
    stock: input.stock == null ? null : Math.max(0, Math.round(Number(input.stock) || 0)),
    featured: Boolean(input.featured),
    active: input.active !== false,
    sort_order: Math.round(Number(input.sortOrder) || 0),
    deleted_at: null,
    details_json: JSON.stringify(details),
  };
}

export async function listMarketplaceCategories(includeInactive = false): Promise<MarketplaceCategory[]> {
  if (!isReady() || !databases || !MARKETPLACE_CATEGORIES_COL_ID) return [];
  try {
    const queries = [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.isNull("deleted_at"),
      Query.orderAsc("sort_order"),
      Query.orderAsc("name"),
      Query.limit(200),
    ];
    if (!includeInactive) queries.push(Query.equal("active", [true]));
    const res = await databases.listDocuments(DB_ID, MARKETPLACE_CATEGORIES_COL_ID, queries);
    return res.documents.map((d) => toCategory(d as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function createMarketplaceCategory(input: MarketplaceCategoryInput): Promise<MarketplaceCategory> {
  if (!isReady() || !databases || !MARKETPLACE_CATEGORIES_COL_ID) throw new Error("Appwrite não configurado");
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome da categoria.");
  try {
    const doc = await databases.createDocument(
      DB_ID,
      MARKETPLACE_CATEGORIES_COL_ID,
      ID.unique(),
      {
        school_id: DEFAULT_SCHOOL_ID,
        name,
        slug: slugifyMarketplace(name) || `categoria-${Date.now()}`,
        sort_order: Math.round(Number(input.sortOrder) || 0),
        active: input.active !== false,
        deleted_at: null,
      },
      adminPerms(),
    );
    return toCategory(doc as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || "Erro ao criar categoria.");
  }
}

export async function updateMarketplaceCategory(id: string, input: MarketplaceCategoryInput): Promise<MarketplaceCategory> {
  if (!isReady() || !databases || !MARKETPLACE_CATEGORIES_COL_ID) throw new Error("Appwrite não configurado");
  const name = input.name.trim();
  const doc = await databases.updateDocument(DB_ID, MARKETPLACE_CATEGORIES_COL_ID, id, {
    name,
    slug: slugifyMarketplace(name) || `categoria-${Date.now()}`,
    sort_order: Math.round(Number(input.sortOrder) || 0),
    active: input.active !== false,
  });
  return toCategory(doc as unknown as Record<string, unknown>);
}

export async function deleteMarketplaceCategory(id: string): Promise<void> {
  if (!isReady() || !databases || !MARKETPLACE_CATEGORIES_COL_ID) throw new Error("Appwrite não configurado");
  await databases.updateDocument(DB_ID, MARKETPLACE_CATEGORIES_COL_ID, id, {
    deleted_at: new Date().toISOString(),
    active: false,
  });
}

export async function listMarketplaceProducts(opts?: {
  includeInactive?: boolean;
  categoryId?: string | null;
}): Promise<MarketplaceProduct[]> {
  if (!isReady() || !databases || !MARKETPLACE_PRODUCTS_COL_ID) return [];
  try {
    const queries = [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.isNull("deleted_at"),
      Query.orderAsc("sort_order"),
      Query.orderDesc("$createdAt"),
      Query.limit(500),
    ];
    if (!opts?.includeInactive) queries.push(Query.equal("active", [true]));
    if (opts?.categoryId) queries.push(Query.equal("category_id", [opts.categoryId]));
    const res = await databases.listDocuments(DB_ID, MARKETPLACE_PRODUCTS_COL_ID, queries);
    return res.documents.map((d) => toProduct(d as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function createMarketplaceProduct(input: MarketplaceProductInput): Promise<MarketplaceProduct> {
  if (!isReady() || !databases || !MARKETPLACE_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  if (!input.name.trim()) throw new Error("Informe o nome do produto.");
  if (!input.categoryId) throw new Error("Selecione uma categoria.");
  if (input.paymentMode !== "cakto" && !input.paymentUrl.trim()) throw new Error("Informe o link de pagamento.");
  const doc = await databases.createDocument(
    DB_ID,
    MARKETPLACE_PRODUCTS_COL_ID,
    ID.unique(),
    productPayload(input),
    adminPerms(),
  );
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function updateMarketplaceProduct(id: string, input: MarketplaceProductInput): Promise<MarketplaceProduct> {
  if (!isReady() || !databases || !MARKETPLACE_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, MARKETPLACE_PRODUCTS_COL_ID, id, productPayload(input));
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function toggleMarketplaceProductActive(id: string, active: boolean): Promise<MarketplaceProduct> {
  if (!isReady() || !databases || !MARKETPLACE_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, MARKETPLACE_PRODUCTS_COL_ID, id, { active });
  return toProduct(doc as unknown as Record<string, unknown>);
}

export async function deleteMarketplaceProduct(id: string): Promise<void> {
  if (!isReady() || !databases || !MARKETPLACE_PRODUCTS_COL_ID) throw new Error("Appwrite não configurado");
  await databases.updateDocument(DB_ID, MARKETPLACE_PRODUCTS_COL_ID, id, {
    deleted_at: new Date().toISOString(),
    active: false,
  });
}

export async function uploadMarketplaceImage(file: File): Promise<string> {
  if (!storage || !BUCKET_ID) throw new Error("Storage não configurado.");
  const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, [
    Permission.read(Role.users()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ]);
  return storage.getFileView(BUCKET_ID, uploaded.$id).toString();
}

export async function listMarketplaceOrders(opts?: {
  buyerUserId?: string;
  status?: MarketplaceOrderStatus | null;
  limit?: number;
}): Promise<MarketplaceOrder[]> {
  if (!isReady() || !databases || !MARKETPLACE_ORDERS_COL_ID) return [];
  try {
    const queries = [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.orderDesc("$createdAt"),
      Query.limit(opts?.limit ?? 200),
    ];
    if (opts?.buyerUserId) queries.push(Query.equal("buyer_user_id", [opts.buyerUserId]));
    if (opts?.status) queries.push(Query.equal("status", [opts.status]));
    const res = await databases.listDocuments(DB_ID, MARKETPLACE_ORDERS_COL_ID, queries);
    return res.documents.map((d) => toOrder(d as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function updateMarketplaceOrderNotes(orderId: string, adminNotes: string): Promise<MarketplaceOrder> {
  if (!isReady() || !databases || !MARKETPLACE_ORDERS_COL_ID) throw new Error("Appwrite não configurado");
  const doc = await databases.updateDocument(DB_ID, MARKETPLACE_ORDERS_COL_ID, orderId, {
    admin_notes: adminNotes.slice(0, 4000),
  });
  return toOrder(doc as unknown as Record<string, unknown>);
}

export async function updateMarketplaceOrderStatus(
  orderId: string,
  status: MarketplaceOrderStatus,
): Promise<MarketplaceOrder> {
  if (!isReady() || !databases || !MARKETPLACE_ORDERS_COL_ID) throw new Error("Appwrite não configurado");
  const patch: Record<string, unknown> = { status };
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const doc = await databases.updateDocument(DB_ID, MARKETPLACE_ORDERS_COL_ID, orderId, patch);
  return toOrder(doc as unknown as Record<string, unknown>);
}

type MarketplaceFnResponse = {
  message?: string;
  checkout?: MarketplaceCheckoutResult;
  settings?: MarketplaceSettings;
  order?: MarketplaceOrder;
};

async function executeMarketplaceAction(payload: Record<string, unknown>): Promise<MarketplaceFnResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: MarketplaceFnResponse = {};
  try {
    response = execution.responseBody ? (JSON.parse(execution.responseBody) as MarketplaceFnResponse) : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na operação do marketplace.");
  }
  return response;
}

export async function createMarketplaceCheckout(input: {
  productId: string;
  variantId?: string | null;
}): Promise<MarketplaceCheckoutResult> {
  const response = await executeMarketplaceAction({
    action: "createMarketplaceCheckout",
    productId: input.productId,
    variantId: input.variantId || "",
  });
  if (!response.checkout) throw new Error(response.message || "Checkout não retornado.");
  return response.checkout;
}

export async function getMarketplaceSettings(): Promise<MarketplaceSettings> {
  if (!isReady() || !databases || !SETTINGS_COL_ID) return defaultMarketplaceSettings();
  try {
    const res = await databases.listDocuments(DB_ID, SETTINGS_COL_ID, [
      Query.equal("key", ["marketplace"]),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as { settings_json?: string; $updatedAt?: string } | undefined;
    if (!doc) return defaultMarketplaceSettings();
    const raw = JSON.parse(String(doc.settings_json || "{}")) as Partial<MarketplaceSettings>;
    return {
      ...defaultMarketplaceSettings(),
      ...raw,
      enabled: raw.enabled === true,
      storeTitle: String(raw.storeTitle || defaultMarketplaceSettings().storeTitle),
      storeSubtitle: String(raw.storeSubtitle || defaultMarketplaceSettings().storeSubtitle),
      updatedAt: doc.$updatedAt ?? null,
    };
  } catch {
    return defaultMarketplaceSettings();
  }
}

export async function saveMarketplaceSettings(input: Omit<MarketplaceSettings, "updatedAt">): Promise<MarketplaceSettings> {
  const response = await executeMarketplaceAction({
    action: "saveMarketplaceSettings",
    settings: input,
  });
  if (!response.settings) throw new Error(response.message || "Configuração não retornada.");
  return response.settings;
}
