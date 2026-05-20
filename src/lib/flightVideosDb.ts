import { Query } from "appwrite";
import { databases, ID, isAppwriteConfigured, Permission, Role } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const VIDEOS_COL_ID = import.meta.env.VITE_APPWRITE_VIDEOS_COLLECTION_ID as string;

export type ProcessingStatus = "processing" | "uploading" | "ready" | "failed";

export type FlightVideo = {
  id: string;
  flight_id: string;
  uploaded_by: string;
  file_url: string;
  file_size: number | null;
  duration_sec: number | null;
  original_files_count: number | null;
  processing_status: ProcessingStatus;
  telemetry_present: boolean;
  telemetry_source: "gopro" | "dji_srt" | "none" | string;
  telemetry_json: string;
  available_widgets: string;
  created_at: string;
};

export async function createFlightVideoDoc(payload: {
  flightId: string;
  uploadedBy: string;
  originalFilesCount: number;
}): Promise<{ id: string | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { id: null, error: new Error("Appwrite não configurado") };
  }
  if (!VIDEOS_COL_ID) {
    return { id: null, error: new Error("VITE_APPWRITE_VIDEOS_COLLECTION_ID não configurado") };
  }
  try {
    const permissions = [
      Permission.read(Role.users()),
      Permission.update(Role.user(payload.uploadedBy)),
      Permission.delete(Role.user(payload.uploadedBy)),
    ];

    const d = await databases.createDocument(DB_ID, VIDEOS_COL_ID, ID.unique(), {
      flight_id: payload.flightId,
      uploaded_by: payload.uploadedBy,
      file_url: "",
      processing_status: "processing",
      original_files_count: payload.originalFilesCount,
      created_at: new Date().toISOString(),
    }, permissions);

    return { id: d.$id, error: null };
  } catch (e) {
    return { id: null, error: e as Error };
  }
}

export async function updateFlightVideoReady(docId: string, data: {
  fileUrl: string;
  fileSize: number | null;
  durationSec: number | null;
  telemetryPresent?: boolean;
  telemetrySource?: string;
  telemetryJson?: string;
  availableWidgets?: string[];
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const patch: Record<string, unknown> = {
      file_url: data.fileUrl,
      file_size: data.fileSize,
      duration_sec: data.durationSec,
      processing_status: "ready",
    };
    if (data.telemetryPresent !== undefined) {
      patch.telemetry_present = data.telemetryPresent;
    }
    if (data.telemetrySource !== undefined) {
      patch.telemetry_source = data.telemetrySource;
    }
    if (data.telemetryJson !== undefined) {
      patch.telemetry_json = data.telemetryJson;
    }
    if (data.availableWidgets !== undefined) {
      patch.available_widgets = JSON.stringify(data.availableWidgets);
    }
    await databases.updateDocument(DB_ID, VIDEOS_COL_ID, docId, patch);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function updateFlightVideoFailed(docId: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    await databases.updateDocument(DB_ID, VIDEOS_COL_ID, docId, {
      processing_status: "failed",
    });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function listFlightVideos(flightId: string): Promise<{ data: FlightVideo[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  if (!VIDEOS_COL_ID) {
    return { data: [], error: null };
  }
  try {
    const res = await databases.listDocuments(DB_ID, VIDEOS_COL_ID, [
      Query.equal("flight_id", [flightId]),
      Query.orderDesc("$createdAt"),
    ]);

    const data: FlightVideo[] = res.documents.map((d) => ({
      id: d.$id,
      flight_id: d.flight_id as string,
      uploaded_by: d.uploaded_by as string,
      file_url: (d.file_url as string | null) ?? "",
      file_size: (d.file_size as number | null | undefined) ?? null,
      duration_sec: (d.duration_sec as number | null | undefined) ?? null,
      original_files_count: (d.original_files_count as number | null | undefined) ?? null,
      processing_status: (d.processing_status as ProcessingStatus) ?? "processing",
      telemetry_present: Boolean(d.telemetry_present),
      telemetry_source: (d.telemetry_source as string | null | undefined) ?? "none",
      telemetry_json: (d.telemetry_json as string | null | undefined) ?? "",
      available_widgets: (d.available_widgets as string | null | undefined) ?? "[]",
      created_at: d.$createdAt,
    }));

    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function listFlightVideoFlags(flightIds: string[]): Promise<Record<string, boolean>> {
  const uniqueIds = Array.from(new Set(flightIds.filter(Boolean)));
  const flags: Record<string, boolean> = Object.fromEntries(uniqueIds.map((id) => [id, false] as const));
  if (!isAppwriteConfigured || !databases || !VIDEOS_COL_ID || uniqueIds.length === 0) return flags;

  try {
    const chunkSize = 25;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const res = await databases.listDocuments(DB_ID, VIDEOS_COL_ID, [
        Query.equal("flight_id", chunk),
        Query.limit(100),
      ]);
      for (const doc of res.documents) {
        const flightId = (doc.flight_id as string | undefined) ?? "";
        if (flightId) flags[flightId] = true;
      }
    }
    return flags;
  } catch {
    return flags;
  }
}

export async function deleteFlightVideo(docId: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    await databases.deleteDocument(DB_ID, VIDEOS_COL_ID, docId);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
