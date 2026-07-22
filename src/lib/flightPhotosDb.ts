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
  const fileDownloadUrl = (doc.download_url as string | null | undefined) || fileUrl;

  return {
    id: doc.$id,
    flight_id: (doc.flight_id as string | null | undefined) || "",
    uploaded_by: (doc.uploaded_by as string | null | undefined) || "",
    r2_key: (doc.r2_key as string | null | undefined) || "",
    file_name: (doc.file_name as string | null | undefined) || "foto-do-voo.jpg",
    mime_type: (doc.mime_type as string | null | undefined) || "image/jpeg",
    file_size: (doc.file_size as number | null | undefined) ?? null,
    file_url: fileUrl,
    download_url: fileDownloadUrl,
    created_at: doc.$createdAt || (doc.created_at as string | null | undefined) || "",
  };
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
  let uploadedToR2 = false;
  let uploadedCfg: { url: string; token: string } | null = null;
  try {
    const cfg = await getWorkerConfig({ mode: "photoUpload", flightId: payload.flightId, key: rawKey });
    if (!cfg) throw new Error("Worker de mídia não configurado.");
    uploadedCfg = cfg;
    const uploadResponse = await fetch(`${cfg.url.replace(/\/+$/, "")}/upload/file`, {
      method: "PUT",
      headers: {
        "Content-Type": payload.file.type || "application/octet-stream",
        "x-upload-key": r2Key,
        "x-token": cfg.token,
      },
      body: payload.file,
    });
    const uploadBody = await uploadResponse.json().catch(() => ({})) as { fileUrl?: string; error?: string };
    if (!uploadResponse.ok || !uploadBody.fileUrl) {
      throw new Error(uploadBody.error || "Falha ao enviar foto para o R2.");
    }
    uploadedToR2 = true;

    const url = uploadBody.fileUrl;
    const download = workerDownloadUrl(cfg.url, r2Key);
    const docPermissions = buildFlightPhotoDocumentPermissions(payload.actorUserId, payload.actorRole);
    const doc = await databases.createDocument(DB_ID, FLIGHT_PHOTOS_COL_ID, ID.unique(), {
      flight_id: payload.flightId,
      uploaded_by: payload.actorUserId,
      r2_key: r2Key,
      file_name: payload.file.name || "foto-do-voo.jpg",
      mime_type: payload.file.type || "image/jpeg",
      file_size: payload.file.size,
      file_url: url,
      download_url: download,
      created_at: new Date().toISOString(),
    }, docPermissions);

    return { data: mapFlightPhoto(doc), error: null };
  } catch (e) {
    if (uploadedToR2 && uploadedCfg) {
      const deleteCfg = await getWorkerConfig({ mode: "photoDelete", flightId: payload.flightId, key: rawKey }).catch(() => null);
      await fetch(`${(deleteCfg?.url || uploadedCfg.url).replace(/\/+$/, "")}/storage/object`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: r2Key, token: deleteCfg?.token || uploadedCfg.token }),
      }).catch(() => undefined);
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
      const rawKey = photo.r2_key.replace(/^flights\//, "");
      const cfg = await getWorkerConfig({ mode: "photoDelete", flightId: photo.flight_id, key: rawKey });
      if (cfg) {
        await fetch(`${cfg.url.replace(/\/+$/, "")}/storage/object`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: photo.r2_key, token: cfg.token }),
        }).catch(() => undefined);
      }
    }
    await databases.deleteDocument(DB_ID, FLIGHT_PHOTOS_COL_ID, photo.id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
