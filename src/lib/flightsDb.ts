import { Query } from "appwrite";
import { databases, isAppwriteConfigured, ID, Permission, Role } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;

export type SavedFlightListItem = {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
};

export type SavedFlightFull = SavedFlightListItem & { csv_text: string };

export async function listSavedFlights(): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, COL_ID, [Query.orderDesc("$createdAt")]);
    const data = res.documents.map((d) => ({
      id: d.$id,
      name: d.name as string,
      source_filename: d.source_filename as string,
      created_at: d.$createdAt,
    }));
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function getSavedFlight(id: string): Promise<{ data: SavedFlightFull | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const d = await databases.getDocument(DB_ID, COL_ID, id);
    return {
      data: {
        id: d.$id,
        name: d.name as string,
        source_filename: d.source_filename as string,
        created_at: d.$createdAt,
        csv_text: d.csv_text as string,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function insertFlight(payload: {
  userId: string;
  name: string;
  source_filename: string;
  csv_text: string;
}): Promise<{ id: string | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { id: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const d = await databases.createDocument(
      DB_ID,
      COL_ID,
      ID.unique(),
      {
        user_id: payload.userId,
        name: payload.name,
        source_filename: payload.source_filename,
        csv_text: payload.csv_text,
      },
      [
        Permission.read(Role.user(payload.userId)),
        Permission.update(Role.user(payload.userId)),
        Permission.delete(Role.user(payload.userId)),
      ],
    );
    return { id: d.$id, error: null };
  } catch (e) {
    return { id: null, error: e as Error };
  }
}

export async function deleteSavedFlight(id: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    await databases.deleteDocument(DB_ID, COL_ID, id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
