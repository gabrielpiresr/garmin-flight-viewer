import { Query } from "appwrite";
import { filterClientSidePermissions } from "./appwriteClientPermissions";
import {
  databases,
  FLIGHT_PHOTOS_COL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
} from "./appwrite";
import {
  createResizedJpegBlob,
  deriveThumbUrl,
  GALLERY_THUMB_MAX_EDGE,
  thumbR2KeyFromOriginal,
} from "./photoThumbnails";
import type { UserRole } from "./rbac";
import { getWorkerConfig } from "./videoStorage";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;

export type FlightPhoto = {
  id: string;
  flight_id: string;
  uploaded_by: string;
  r2_key: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  file_url: string;
  /** Lightweight gallery preview URL when available (derived or stored). */
  thumb_url?: string;
  download_url: string;
  created_at: string;
};

function buildFlightPhotoDocumentPermissions(actorUserId: string, actorRole: UserRole): string[] {
  const permissions = [
    Permission.read(Role.users()),
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
    Permission.read(Role.label("instrutor")),
  ];

  if (actorRole === "admin") {
    permissions.push(
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    );
  } else if (actorRole === "instrutor") {
    permissions.push(
      Permission.update(Role.label("instrutor")),
      Permission.delete(Role.label("instrutor")),
    );
  }

  return filterClientSidePermissions(permissions, actorUserId, actorRole);
}

function mapFlightPhoto(doc: Record<string, unknown> & { $id: string; $createdAt?: string }): FlightPhoto {
  const fileUrl = (doc.file_url as string | null | undefined) || "";
  const r2Key = (doc.r2_key as string | null | undefined) || "";
  const fileDownloadUrl = (doc.download_url as string | null | undefined) || fileUrl;
  const storedThumb = (doc.thumb_url as string | null | undefined) || "";
  const thumbUrl = storedThumb || deriveThumbUrl(fileUrl, r2Key);

  return {
    id: doc.$id,
    flight_id: (doc.flight_id as string | null | undefined) || "",
    uploaded_by: (doc.uploaded_by as string | null | undefined) || "",
    r2_key: r2Key,
    file_name: (doc.file_name as string | null | undefined) || "foto-do-voo.jpg",
    mime_type: (doc.mime_type as string | null | undefined) || "image/jpeg",
    file_size: (doc.file_size as number | null | undefined) ?? null,
    file_url: fileUrl,
    thumb_url: thumbUrl,
    download_url: fileDownloadUrl,
    created_at: doc.$createdAt || (doc.created_at as string | null | undefined) || "",
  };
}

async function uploadR2Object(params: {
  flightId: string;
  rawKey: string;
  r2Key: string;
  body: Blob;
  contentType: string;
}): Promise<{ fileUrl: string; cfg: { url: string; token: string } }> {
  const cfg = await getWorkerConfig({ mode: "photoUpload", flightId: params.flightId, key: params.rawKey });
  if (!cfg) throw new Error("Worker de mídia não configurado.");
  const uploadResponse = await fetch(`${cfg.url.replace(/\/+$/, "")}/upload/file`, {
    method: "PUT",
    headers: {
      "Content-Type": params.contentType || "application/octet-stream",
      "x-upload-key": params.r2Key,
      "x-token": cfg.token,
    },
    body: params.body,
  });
  const uploadBody = await uploadResponse.json().catch(() => ({})) as { fileUrl?: string; error?: string };
  if (!uploadResponse.ok || !uploadBody.fileUrl) {
    throw new Error(uploadBody.error || "Falha ao enviar foto para o R2.");
  }
  return { fileUrl: uploadBody.fileUrl, cfg };
}

async function deleteR2Object(params: {
  flightId: string;
  r2Key: string;
  fallbackCfg?: { url: string; token: string } | null;
}): Promise<void> {
  if (!params.r2Key) return;
  const rawKey = params.r2Key.replace(/^flights\//, "");
  const deleteCfg = await getWorkerConfig({ mode: "photoDelete", flightId: params.flightId, key: rawKey }).catch(() => null);
  const cfg = deleteCfg || params.fallbackCfg;
  if (!cfg) return;
  await fetch(`${cfg.url.replace(/\/+$/, "")}/storage/object`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: params.r2Key, token: deleteCfg?.token || cfg.token }),
  }).catch(() => undefined);
}

function photoExtension(file: File): string {
  const fromName = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

function photoR2Key(flightId: string, file: File): string {
  const ext = photoExtension(file);
  const unique = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `flight-${flightId}-photo-${unique}.${ext}`;
}

function workerDownloadUrl(workerUrl: string, key: string): string {
  return `${workerUrl.replace(/\/+$/, "")}/download?key=${encodeURIComponent(key)}`;
}

export async function uploadFlightPhoto(payload: {
  flightId: string;
  file: File;
  actorUserId: string;
  actorRole: UserRole;
}): Promise<{ data: FlightPhoto | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_PHOTOS_COL_ID) {
    return { data: null, error: new Error("Banco de fotos não configurado.") };
  }
  if (payload.actorRole !== "admin" && payload.actorRole !== "instrutor") {
    return { data: null, error: new Error("Apenas admin ou instrutor pode enviar fotos.") };
  }

  const rawKey = photoR2Key(payload.flightId, payload.file);
  const r2Key = `flights/${rawKey}`;
  const thumbRawKey = rawKey.replace(/(\.[^.]+)$/i, "-thumb.jpg");
  const thumbR2Key = `flights/${thumbRawKey}`;
  let uploadedOriginalCfg: { url: string; token: string } | null = null;
  let uploadedThumbCfg: { url: string; token: string } | null = null;
  let uploadedOriginal = false;
  let uploadedThumb = false;
  try {
    const original = await uploadR2Object({
      flightId: payload.flightId,
      rawKey,
      r2Key,
      body: payload.file,
      contentType: payload.file.type || "application/octet-stream",
    });
    uploadedOriginalCfg = original.cfg;
    uploadedOriginal = true;

    let thumbUrl = "";
    try {
      const thumbBlob = await createResizedJpegBlob(payload.file, GALLERY_THUMB_MAX_EDGE, 0.72);
      const thumb = await uploadR2Object({
        flightId: payload.flightId,
        rawKey: thumbRawKey,
        r2Key: thumbR2Key,
        body: thumbBlob,
        contentType: "image/jpeg",
      });
      uploadedThumbCfg = thumb.cfg;
      uploadedThumb = true;
      thumbUrl = thumb.fileUrl;
    } catch {
      // Gallery can still downscale the original client-side if thumb generation fails (e.g. HEIC).
      thumbUrl = deriveThumbUrl(original.fileUrl, r2Key);
    }

    const download = workerDownloadUrl(original.cfg.url, r2Key);
    const docPermissions = buildFlightPhotoDocumentPermissions(payload.actorUserId, payload.actorRole);
    const baseFields = {
      flight_id: payload.flightId,
      uploaded_by: payload.actorUserId,
      r2_key: r2Key,
      file_name: payload.file.name || "foto-do-voo.jpg",
      mime_type: payload.file.type || "image/jpeg",
      file_size: payload.file.size,
      file_url: original.fileUrl,
      download_url: download,
      created_at: new Date().toISOString(),
    };

    let doc;
    try {
      doc = await databases.createDocument(
        DB_ID,
        FLIGHT_PHOTOS_COL_ID,
        ID.unique(),
        thumbUrl ? { ...baseFields, thumb_url: thumbUrl } : baseFields,
        docPermissions,
      );
    } catch {
      // Collection may not have thumb_url yet — gallery still derives it from r2_key.
      doc = await databases.createDocument(DB_ID, FLIGHT_PHOTOS_COL_ID, ID.unique(), baseFields, docPermissions);
    }

    return { data: mapFlightPhoto(doc), error: null };
  } catch (e) {
    if (uploadedOriginal) {
      await deleteR2Object({ flightId: payload.flightId, r2Key, fallbackCfg: uploadedOriginalCfg });
    }
    if (uploadedThumb) {
      await deleteR2Object({ flightId: payload.flightId, r2Key: thumbR2Key, fallbackCfg: uploadedThumbCfg });
    }
    return { data: null, error: e as Error };
  }
}

export async function listFlightPhotos(flightId: string): Promise<{ data: FlightPhoto[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_PHOTOS_COL_ID) {
    return { data: null, error: new Error("Appwrite não configurado.") };
  }

  try {
    const res = await databases.listDocuments(DB_ID, FLIGHT_PHOTOS_COL_ID, [
      Query.equal("flight_id", [flightId]),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ]);
    return { data: res.documents.map(mapFlightPhoto), error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function deleteFlightPhoto(photo: Pick<FlightPhoto, "id" | "flight_id" | "r2_key">): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_PHOTOS_COL_ID) {
    return { error: new Error("Appwrite não configurado.") };
  }

  try {
    if (photo.r2_key) {
      await deleteR2Object({ flightId: photo.flight_id, r2Key: photo.r2_key });
      const thumbKey = thumbR2KeyFromOriginal(photo.r2_key);
      if (thumbKey && thumbKey !== photo.r2_key) {
        await deleteR2Object({ flightId: photo.flight_id, r2Key: thumbKey });
      }
    }
    await databases.deleteDocument(DB_ID, FLIGHT_PHOTOS_COL_ID, photo.id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
