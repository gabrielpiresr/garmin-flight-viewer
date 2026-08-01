import { Query } from "appwrite";
import {
  AIRCRAFT_PANELS_COL_ID,
  BUCKET_ID,
  databases,
  DEFAULT_SCHOOL_ID,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
  storage,
} from "./appwrite";
import type { AircraftPanel, AircraftPanelInput, PanelInstrument } from "../types/panel";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AIRCRAFT_PANELS_COL_ID);
}

function adminWritePermissions(): string[] {
  return [
    Permission.read(Role.any()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function createPermissions(): string[] {
  return [
    Permission.read(Role.any()),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
}

function parseInstruments(raw: unknown): PanelInstrument[] {
  if (Array.isArray(raw)) return raw as PanelInstrument[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PanelInstrument[]) : [];
  } catch {
    return [];
  }
}

function toPanel(doc: Record<string, unknown>): AircraftPanel {
  return {
    id: doc.$id as string,
    school_id: (doc.school_id as string) ?? "",
    aircraft_id: (doc.aircraft_id as string) ?? "",
    title: (doc.title as string) ?? "",
    panel_image_url: (doc.panel_image_url as string) ?? "",
    panel_image_file_id: (doc.panel_image_file_id as string | null | undefined) ?? null,
    instruments: parseInstruments(doc.instruments_json),
    published: (doc.published as boolean) ?? false,
    updated_at: (doc.updated_at as string) ?? (doc.$updatedAt as string) ?? "",
    created_at: (doc.$createdAt as string) ?? "",
  };
}

export async function listAircraftPanels(
  schoolId: string = DEFAULT_SCHOOL_ID,
): Promise<{ data: AircraftPanel[] | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { data: null, error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, AIRCRAFT_PANELS_COL_ID, [
      Query.equal("school_id", schoolId),
      Query.limit(200),
      Query.orderDesc("$updatedAt"),
    ]);
    return { data: res.documents.map((d) => toPanel(d as unknown as Record<string, unknown>)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function listPublishedAircraftPanels(
  schoolId: string = DEFAULT_SCHOOL_ID,
): Promise<{ data: AircraftPanel[] | null; error: Error | null }> {
  const result = await listAircraftPanels(schoolId);
  if (result.error || !result.data) return result;
  return { data: result.data.filter((p) => p.published && p.panel_image_url), error: null };
}

export async function getAircraftPanelByAircraft(
  aircraftId: string,
): Promise<{ data: AircraftPanel | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { data: null, error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, AIRCRAFT_PANELS_COL_ID, [
      Query.equal("aircraft_id", aircraftId),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    return { data: doc ? toPanel(doc as unknown as Record<string, unknown>) : null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function getAircraftPanel(
  id: string,
): Promise<{ data: AircraftPanel | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { data: null, error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    const doc = await databases.getDocument(DB_ID, AIRCRAFT_PANELS_COL_ID, id);
    return { data: toPanel(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createAircraftPanel(
  input: AircraftPanelInput,
): Promise<{ data: AircraftPanel | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { data: null, error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    const now = new Date().toISOString();
    const doc = await databases.createDocument(
      DB_ID,
      AIRCRAFT_PANELS_COL_ID,
      ID.unique(),
      {
        school_id: input.school_id || DEFAULT_SCHOOL_ID,
        aircraft_id: input.aircraft_id,
        title: input.title,
        panel_image_url: input.panel_image_url,
        panel_image_file_id: input.panel_image_file_id ?? null,
        instruments_json: JSON.stringify(input.instruments ?? []),
        published: input.published ?? false,
        updated_at: now,
      },
      createPermissions(),
    );
    return { data: toPanel(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateAircraftPanel(
  id: string,
  patch: Partial<AircraftPanelInput> & { published?: boolean },
): Promise<{ data: AircraftPanel | null; error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { data: null, error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.aircraft_id !== undefined) data.aircraft_id = patch.aircraft_id;
    if (patch.panel_image_url !== undefined) data.panel_image_url = patch.panel_image_url;
    if (patch.panel_image_file_id !== undefined) data.panel_image_file_id = patch.panel_image_file_id;
    if (patch.instruments !== undefined) data.instruments_json = JSON.stringify(patch.instruments);
    if (patch.published !== undefined) data.published = patch.published;
    if (patch.school_id !== undefined) data.school_id = patch.school_id;

    const doc = await databases.updateDocument(DB_ID, AIRCRAFT_PANELS_COL_ID, id, data);
    return { data: toPanel(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteAircraftPanel(id: string): Promise<{ error: Error | null }> {
  if (!isReady() || !databases || !DB_ID || !AIRCRAFT_PANELS_COL_ID) {
    return { error: new Error("Coleção de painéis não configurada.") };
  }
  try {
    await databases.deleteDocument(DB_ID, AIRCRAFT_PANELS_COL_ID, id);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadPanelMedia(
  file: File,
): Promise<{ data: { fileId: string; url: string } | null; error: Error | null }> {
  if (!storage || !BUCKET_ID) {
    return { data: null, error: new Error("Bucket de arquivos não configurado.") };
  }
  try {
    const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, adminWritePermissions());
    return {
      data: {
        fileId: uploaded.$id,
        url: storage.getFileView(BUCKET_ID, uploaded.$id).toString(),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
