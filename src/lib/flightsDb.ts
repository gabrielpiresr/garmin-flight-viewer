import { supabase, isSupabaseConfigured } from "./supabase";

export type SavedFlightListItem = {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
};

export type SavedFlightFull = SavedFlightListItem & { csv_text: string };

export async function listSavedFlights(): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("Supabase não configurado") };
  }
  const { data, error } = await supabase
    .from("flights")
    .select("id,name,source_filename,created_at")
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as SavedFlightListItem[], error: null };
}

export async function getSavedFlight(id: string): Promise<{ data: SavedFlightFull | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("Supabase não configurado") };
  }
  const { data, error } = await supabase.from("flights").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as SavedFlightFull | null, error: null };
}

export async function insertFlight(payload: {
  userId: string;
  name: string;
  source_filename: string;
  csv_text: string;
}): Promise<{ id: string | null; error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { id: null, error: new Error("Supabase não configurado") };
  }
  const { data, error } = await supabase
    .from("flights")
    .insert({
      user_id: payload.userId,
      name: payload.name,
      source_filename: payload.source_filename,
      csv_text: payload.csv_text,
    })
    .select("id")
    .single();
  if (error) return { id: null, error: new Error(error.message) };
  return { id: data?.id ?? null, error: null };
}

export async function deleteSavedFlight(id: string): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("Supabase não configurado") };
  }
  const { error } = await supabase.from("flights").delete().eq("id", id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
