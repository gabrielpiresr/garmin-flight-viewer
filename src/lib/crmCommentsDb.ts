import { Query } from "appwrite";
import { CRM_LEAD_COMMENTS_COL_ID, databases, ID, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CRM_LEAD_COMMENTS_COL_ID);
}

export type CrmLeadComment = {
  id: string;
  leadId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

type CrmLeadCommentDoc = {
  $id: string;
  $createdAt: string;
  lead_id?: string;
  author_name?: string;
  text?: string;
};

function toComment(doc: CrmLeadCommentDoc): CrmLeadComment {
  return {
    id: doc.$id,
    leadId: doc.lead_id ?? "",
    authorName: doc.author_name ?? "Desconhecido",
    text: doc.text ?? "",
    createdAt: doc.$createdAt ?? "",
  };
}

export async function listLeadComments(leadId: string): Promise<{ data: CrmLeadComment[]; error: Error | null }> {
  if (!configured()) return { data: [], error: new Error("Comentários não configurados.") };
  try {
    const res = await databases!.listDocuments(DB_ID!, CRM_LEAD_COMMENTS_COL_ID!, [
      Query.equal("lead_id", [leadId]),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ]);
    return { data: (res.documents as unknown as CrmLeadCommentDoc[]).map(toComment), error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}

export async function createLeadComment(input: {
  leadId: string;
  authorName: string;
  text: string;
}): Promise<{ data: CrmLeadComment | null; error: Error | null }> {
  if (!configured()) return { data: null, error: new Error("Comentários não configurados.") };
  try {
    const doc = await databases!.createDocument(
      DB_ID!,
      CRM_LEAD_COMMENTS_COL_ID!,
      ID.unique(),
      {
        lead_id: input.leadId,
        author_name: input.authorName.trim(),
        text: input.text.trim(),
      },
    );
    return { data: toComment(doc as unknown as CrmLeadCommentDoc), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function deleteLeadComment(commentId: string): Promise<{ error: Error | null }> {
  if (!configured()) return { error: new Error("Comentários não configurados.") };
  try {
    await databases!.deleteDocument(DB_ID!, CRM_LEAD_COMMENTS_COL_ID!, commentId);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
