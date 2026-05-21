import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role, PRODUCT_SALES_COL_ID, DEFAULT_SCHOOL_ID } from "./appwrite";
import type { ProductSale, ProductSaleInput } from "../types/costs";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && PRODUCT_SALES_COL_ID);
}

function toSale(doc: Record<string, unknown>): ProductSale {
  return {
    id: doc.$id as string,
    schoolId: (doc.school_id as string) ?? "",
    userId: (doc.user_id as string) ?? "",
    productId: (doc.product_id as string) ?? "",
    productName: (doc.product_name as string) ?? "",
    idealPrice: Number(doc.ideal_price ?? 0),
    saleDate: (doc.sale_date as string) ?? "",
    amountPaid: Number(doc.amount_paid ?? 0),
    paymentMethod: (doc.payment_method as string) ?? "",
    notes: (doc.notes as string) ?? "",
    createdBy: (doc.created_by as string | null) ?? null,
    createdAt: (doc.$createdAt as string) ?? "",
    deletedAt: (doc.deleted_at as string | null | undefined) ?? null,
  };
}

export async function listProductSalesForUser(userId: string): Promise<ProductSale[]> {
  if (!isReady() || !databases) return [];
  try {
    const res = await databases.listDocuments(DB_ID, PRODUCT_SALES_COL_ID!, [
      Query.equal("user_id", [userId]),
      Query.isNull("deleted_at"),
      Query.orderDesc("sale_date"),
      Query.limit(200),
    ]);
    return res.documents.map((d) => toSale(d as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function createProductSale(input: ProductSaleInput, actorUserId: string): Promise<ProductSale> {
  if (!isReady() || !databases || !PRODUCT_SALES_COL_ID) throw new Error("Appwrite não configurado");
  const permissions = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  const doc = await databases.createDocument(
    DB_ID,
    PRODUCT_SALES_COL_ID,
    ID.unique(),
    {
      school_id: DEFAULT_SCHOOL_ID,
      user_id: input.userId,
      product_id: input.productId,
      product_name: input.productName,
      ideal_price: input.idealPrice,
      sale_date: input.saleDate,
      amount_paid: input.amountPaid,
      payment_method: input.paymentMethod,
      notes: input.notes.trim() || null,
      created_by: actorUserId,
      deleted_at: null,
    },
    permissions,
  );
  return toSale(doc as unknown as Record<string, unknown>);
}

export async function deleteProductSale(id: string): Promise<void> {
  if (!isReady() || !databases || !PRODUCT_SALES_COL_ID) throw new Error("Appwrite não configurado");
  await databases.updateDocument(DB_ID, PRODUCT_SALES_COL_ID, id, { deleted_at: new Date().toISOString() });
}
