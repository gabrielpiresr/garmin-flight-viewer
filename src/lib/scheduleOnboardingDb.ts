import { Query } from "appwrite";
import { databases, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;

export async function getProfileScheduleOnboardingCompletedAt(userId: string): Promise<string | null> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return null;
  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    const value = doc?.schedule_onboarding_completed_at;
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export async function markScheduleOnboardingCompleted(userId: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {
    return { error: new Error("Appwrite não configurado.") };
  }
  try {
    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [
      Query.equal("user_id", [userId]),
      Query.limit(1),
    ]);
    const doc = res.documents[0];
    if (!doc) return { error: new Error("Perfil não encontrado.") };
    await databases.updateDocument(DB_ID, PROFILES_COL_ID, doc.$id, {
      schedule_onboarding_completed_at: new Date().toISOString(),
    });
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
