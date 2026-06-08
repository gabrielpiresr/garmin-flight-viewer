import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  storage,
  BUCKET_ID,
  NOTICES_BUCKET_ID,
  PROPOSAL_CONFIG_COL_ID,
  DEFAULT_SCHOOL_ID,
} from "./appwrite";
import type { ProposalConfig, ProposalConfigInput, ProposalDifferential, ProposalSection } from "../types/proposal";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && PROPOSAL_CONFIG_COL_ID);
}

type ConfigDoc = {
  $id: string;
  school_id?: string;
  differentials_json?: string | null;
  sections_json?: string | null;
  payment_methods_rich_json?: string | null;
  additional_info_rich_json?: string | null;
  school_name?: string | null;
  logo_url?: string | null;
  cover_video_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
};

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

function toConfig(doc: ConfigDoc): ProposalConfig {
  return {
    id: doc.$id,
    schoolId: doc.school_id ?? DEFAULT_SCHOOL_ID,
    differentials: safeParse<ProposalDifferential[]>(doc.differentials_json, []),
    sections: safeParse<ProposalSection[]>(doc.sections_json, []),
    paymentMethodsRichJson: safeParse<Record<string, unknown> | null>(doc.payment_methods_rich_json, null),
    additionalInfoRichJson: safeParse<Record<string, unknown> | null>(doc.additional_info_rich_json, null),
    schoolName: doc.school_name ?? "",
    logoUrl: doc.logo_url ?? "",
    coverVideoUrl: doc.cover_video_url ?? "",
    primaryColor: doc.primary_color ?? "#10b981",
    accentColor: doc.accent_color ?? "#38bdf8",
    fontFamily: doc.font_family ?? "",
  };
}

export async function getProposalConfig(): Promise<ProposalConfig | null> {
  if (!configured() || !databases) return null;
  try {
    const res = await databases.listDocuments(DB_ID, PROPOSAL_CONFIG_COL_ID!, [
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.limit(1),
    ]);
    if (res.total === 0) return null;
    return toConfig(res.documents[0] as unknown as ConfigDoc);
  } catch {
    return null;
  }
}

export async function saveProposalConfig(input: ProposalConfigInput): Promise<{ error: Error | null }> {
  if (!configured() || !databases) return { error: new Error("Appwrite não configurado") };
  try {
    const payload = {
      school_id: DEFAULT_SCHOOL_ID,
      differentials_json: JSON.stringify(input.differentials),
      sections_json: JSON.stringify(input.sections),
      payment_methods_rich_json: input.paymentMethodsRichJson ? JSON.stringify(input.paymentMethodsRichJson) : null,
      additional_info_rich_json: input.additionalInfoRichJson ? JSON.stringify(input.additionalInfoRichJson) : null,
      school_name: input.schoolName,
      logo_url: input.logoUrl,
      cover_video_url: input.coverVideoUrl || null,
      primary_color: input.primaryColor,
      accent_color: input.accentColor,
      font_family: input.fontFamily,
    };

    const existing = await getProposalConfig();

    if (existing) {
      await databases.updateDocument(DB_ID, PROPOSAL_CONFIG_COL_ID!, existing.id, payload);
    } else {
      const perms = [
        Permission.read(Role.any()),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ];
      await databases.createDocument(DB_ID, PROPOSAL_CONFIG_COL_ID!, ID.unique(), payload, perms);
    }
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function uploadProposalImage(file: File): Promise<{ fileId: string; url: string } | null> {
  const explicitProposalBucketId = import.meta.env.VITE_APPWRITE_PROPOSALS_BUCKET_ID as string | undefined;
  const bucketId = explicitProposalBucketId ?? BUCKET_ID ?? NOTICES_BUCKET_ID;
  if (!storage || !bucketId) {
    throw new Error("Bucket de propostas nao configurado. Defina VITE_APPWRITE_PROPOSALS_BUCKET_ID.");
  }
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  const url = storage.getFileView(bucketId, uploaded.$id).toString();
  // Persistimos "bucketId:fileId" para evitar mismatch entre ambientes com buckets diferentes.
  return { fileId: `${bucketId}:${uploaded.$id}`, url };
}

export function getProposalImageUrl(fileIdOrUrl: string): string {
  if (!fileIdOrUrl) return "";
  if (fileIdOrUrl.startsWith("http")) return fileIdOrUrl;
  if (!storage) return "";

  const explicitProposalBucketId = import.meta.env.VITE_APPWRITE_PROPOSALS_BUCKET_ID as string | undefined;
  const [prefixBucket, rawFileId] = fileIdOrUrl.includes(":")
    ? (fileIdOrUrl.split(":", 2) as [string, string])
    : ["", fileIdOrUrl];
  if (prefixBucket && rawFileId) {
    return storage.getFileView(prefixBucket, rawFileId).toString();
  }

  // Compatibilidade com registros antigos (sem prefixo de bucket).
  const fallbackBucketId = explicitProposalBucketId ?? BUCKET_ID ?? NOTICES_BUCKET_ID;
  if (!fallbackBucketId) return "";
  return storage.getFileView(fallbackBucketId, fileIdOrUrl).toString();
}
