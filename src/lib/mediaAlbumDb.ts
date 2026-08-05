import { Query } from "appwrite";
import {
  databases,
  FLIGHT_PHOTOS_COL_ID,
  isAppwriteConfigured,
} from "./appwrite";
import { buildFlightReviewClubTrialIndexMap } from "./flightReviewClubTrial";
import { listAllSavedFlights, type SavedFlightListItem } from "./flightsDb";
import { deriveThumbUrl } from "./photoThumbnails";
import type { UserRole } from "./rbac";
import type { FlightPhoto } from "./flightPhotosDb";
import type { FlightVideo, ProcessingStatus } from "./flightVideosDb";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const VIDEOS_COL_ID = import.meta.env.VITE_APPWRITE_VIDEOS_COLLECTION_ID as string;

export type AlbumMediaKind = "photo" | "video";

export type AlbumMediaItem = {
  id: string;
  kind: AlbumMediaKind;
  flightId: string;
  flightDate: string | null;
  aircraftIdent: string | null;
  trialFlightIndex: number | null;
  createdAt: string;
  sortAt: string;
  fileName: string;
  fileUrl: string;
  thumbUrl?: string;
  downloadUrl?: string;
  durationSec: number | null;
  fileSize: number | null;
  photo?: FlightPhoto;
  video?: FlightVideo;
};

function mapPhotoDoc(doc: Record<string, unknown> & { $id: string; $createdAt?: string }): FlightPhoto {
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

function mapVideoDoc(doc: Record<string, unknown> & { $id: string; $createdAt?: string }): FlightVideo {
  return {
    id: doc.$id,
    flight_id: (doc.flight_id as string | null | undefined) || "",
    uploaded_by: (doc.uploaded_by as string | null | undefined) || "",
    file_url: (doc.file_url as string | null | undefined) || "",
    file_size: (doc.file_size as number | null | undefined) ?? null,
    duration_sec: (doc.duration_sec as number | null | undefined) ?? null,
    original_files_count: (doc.original_files_count as number | null | undefined) ?? null,
    processing_status: ((doc.processing_status as ProcessingStatus | null | undefined) ?? "processing"),
    telemetry_present: Boolean(doc.telemetry_present),
    telemetry_source: (doc.telemetry_source as string | null | undefined) ?? "none",
    telemetry_json: (doc.telemetry_json as string | null | undefined) ?? "",
    available_widgets: (doc.available_widgets as string | null | undefined) ?? "[]",
    apply_logo: Boolean(doc.apply_logo),
    processing_stage: (doc.processing_stage as string | null | undefined) ?? "",
    processing_percent: Number(doc.processing_percent ?? 0),
    processing_error: (doc.processing_error as string | null | undefined) ?? "",
    video_key: (doc.video_key as string | null | undefined) ?? "",
    processing_updated_at: (doc.processing_updated_at as string | null | undefined) ?? "",
    created_at: doc.$createdAt || (doc.created_at as string | null | undefined) || "",
  };
}

async function listDocumentsByFlightIds<T>(
  collectionId: string,
  flightIds: string[],
  mapDoc: (doc: Record<string, unknown> & { $id: string; $createdAt?: string }) => T,
): Promise<T[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !collectionId || flightIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(flightIds.filter(Boolean)));
  const chunkSize = 25;
  const pageLimit = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const rows: T[] = [];
      let cursor: string | undefined;
      for (;;) {
        const queries = [
          Query.equal("flight_id", chunk),
          Query.orderDesc("$createdAt"),
          Query.limit(pageLimit),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const res = await databases!.listDocuments(DB_ID, collectionId, queries);
        for (const doc of res.documents) {
          rows.push(mapDoc(doc as Record<string, unknown> & { $id: string; $createdAt?: string }));
        }
        if (res.documents.length < pageLimit) break;
        cursor = res.documents[res.documents.length - 1]?.$id;
        if (!cursor) break;
      }
      return rows;
    }),
  );

  return results.flat();
}

function flightMetaMap(flights: SavedFlightListItem[]): Map<string, SavedFlightListItem> {
  return new Map(flights.map((flight) => [flight.id, flight]));
}

function toAlbumPhoto(photo: FlightPhoto, flight: SavedFlightListItem | undefined, trialFlightIndex: number | null): AlbumMediaItem | null {
  if (!photo.file_url) return null;
  const createdAt = photo.created_at || "";
  const flightDate = flight?.flight_date || null;
  return {
    id: `photo:${photo.id}`,
    kind: "photo",
    flightId: photo.flight_id,
    flightDate,
    aircraftIdent: flight?.aircraft_ident ?? null,
    trialFlightIndex,
    createdAt,
    sortAt: flightDate || createdAt,
    fileName: photo.file_name,
    fileUrl: photo.file_url,
    thumbUrl: photo.thumb_url,
    downloadUrl: photo.download_url,
    durationSec: null,
    fileSize: photo.file_size,
    photo,
  };
}

function toAlbumVideo(video: FlightVideo, flight: SavedFlightListItem | undefined, trialFlightIndex: number | null): AlbumMediaItem | null {
  if (video.processing_status !== "ready" || !video.file_url) return null;
  const createdAt = video.created_at || "";
  const flightDate = flight?.flight_date || null;
  return {
    id: `video:${video.id}`,
    kind: "video",
    flightId: video.flight_id,
    flightDate,
    aircraftIdent: flight?.aircraft_ident ?? null,
    trialFlightIndex,
    createdAt,
    sortAt: flightDate || createdAt,
    fileName: `Vídeo · ${flight?.aircraft_ident || "voo"}`,
    fileUrl: video.file_url,
    durationSec: video.duration_sec,
    fileSize: video.file_size,
    video,
  };
}

export async function listUserMediaAlbum(viewer: {
  userId: string;
  role: UserRole;
}): Promise<{ data: AlbumMediaItem[] | null; error: Error | null }> {
  const maxItems = viewer.role === "admin" ? 400 : 600;
  const flightsResult = await listAllSavedFlights(viewer, { pageSize: 100, maxItems });
  if (flightsResult.error) {
    return { data: null, error: flightsResult.error };
  }

  const flights = flightsResult.data ?? [];
  if (flights.length === 0) {
    return { data: [], error: null };
  }

  const flightIds = flights.map((flight) => flight.id);
  const meta = flightMetaMap(flights);
  const indexes = buildFlightReviewClubTrialIndexMap(flights);

  try {
    const [photos, videos] = await Promise.all([
      FLIGHT_PHOTOS_COL_ID
        ? listDocumentsByFlightIds(FLIGHT_PHOTOS_COL_ID, flightIds, mapPhotoDoc)
        : Promise.resolve([] as FlightPhoto[]),
      VIDEOS_COL_ID
        ? listDocumentsByFlightIds(VIDEOS_COL_ID, flightIds, mapVideoDoc)
        : Promise.resolve([] as FlightVideo[]),
    ]);

    const items: AlbumMediaItem[] = [];
    for (const photo of photos) {
      const item = toAlbumPhoto(photo, meta.get(photo.flight_id), indexes.get(photo.flight_id) ?? null);
      if (item) items.push(item);
    }
    for (const video of videos) {
      const item = toAlbumVideo(video, meta.get(video.flight_id), indexes.get(video.flight_id) ?? null);
      if (item) items.push(item);
    }

    items.sort((a, b) => {
      const bySort = b.sortAt.localeCompare(a.sortAt);
      if (bySort !== 0) return bySort;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return { data: items, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}
