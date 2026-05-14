import { buildFlightDisplayInfo, type FlightDisplayInfo } from "./flightDisplay";
import { getSavedFlight, type SavedFlightListItem } from "./flightsDb";
import { listFlightVideos } from "./flightVideosDb";
import { getProfile, type PilotProfile } from "./rbac";

export type FlightListDisplayInfo = FlightDisplayInfo & { videoOk: boolean };

type ProfileSummary = Pick<PilotProfile, "fullName" | "anacCode">;
type ProfileFallback = {
  studentName?: string;
  studentAnac?: string;
  instructorName?: string;
  instructorAnac?: string;
};

const profileCache = new Map<string, Promise<ProfileSummary | null>>();
const fullInfoCache = new Map<string, Promise<FlightDisplayInfo>>();
const videoOkCache = new Map<string, Promise<boolean>>();

async function getCachedProfile(userId: string | null | undefined): Promise<ProfileSummary | null> {
  if (!userId) return null;
  const existing = profileCache.get(userId);
  if (existing) return existing;

  const promise = getProfile(userId)
    .then((res) => {
      if (!res.data) return null;
      return {
        fullName: res.data.fullName,
        anacCode: res.data.anacCode,
      };
    })
    .catch(() => null);

  profileCache.set(userId, promise);
  return promise;
}

async function getProfileFallback(item: SavedFlightListItem): Promise<ProfileFallback> {
  const [studentProfile, instructorProfile] = await Promise.all([
    getCachedProfile(item.student_user_id),
    getCachedProfile(item.instructor_user_id),
  ]);

  return {
    studentName: studentProfile?.fullName,
    studentAnac: studentProfile?.anacCode,
    instructorName: instructorProfile?.fullName,
    instructorAnac: instructorProfile?.anacCode,
  };
}

export function buildBasicFlightListDisplayInfo(item: SavedFlightListItem): FlightDisplayInfo {
  return buildFlightDisplayInfo(item, null);
}

export async function loadLightFlightListDisplayInfos(
  items: SavedFlightListItem[],
): Promise<Record<string, FlightDisplayInfo>> {
  const pairs = await Promise.all(
    items.map(async (item) => {
      const fallback = await getProfileFallback(item);
      return [item.id, buildFlightDisplayInfo(item, null, fallback)] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

async function getCachedFullFlightInfo(item: SavedFlightListItem): Promise<FlightDisplayInfo> {
  const existing = fullInfoCache.get(item.id);
  if (existing) return existing;

  const promise = (async () => {
    const [saved, fallback] = await Promise.all([getSavedFlight(item.id), getProfileFallback(item)]);
    return buildFlightDisplayInfo(item, saved.data?.csv_text ?? null, fallback);
  })();

  fullInfoCache.set(item.id, promise);
  return promise;
}

export async function loadFullFlightListDisplayInfos(
  items: SavedFlightListItem[],
): Promise<Record<string, FlightDisplayInfo>> {
  const pairs = await Promise.all(
    items.map(async (item) => {
      try {
        return [item.id, await getCachedFullFlightInfo(item)] as const;
      } catch {
        const fallback = await getProfileFallback(item);
        return [item.id, buildFlightDisplayInfo(item, null, fallback)] as const;
      }
    }),
  );
  return Object.fromEntries(pairs);
}

async function getCachedVideoOk(flightId: string): Promise<boolean> {
  const existing = videoOkCache.get(flightId);
  if (existing) return existing;

  const promise = listFlightVideos(flightId)
    .then((res) => (res.data ?? []).length > 0)
    .catch(() => false);

  videoOkCache.set(flightId, promise);
  return promise;
}

export async function loadFlightVideoFlags(items: SavedFlightListItem[]): Promise<Record<string, boolean>> {
  const pairs = await Promise.all(
    items.map(async (item) => [item.id, await getCachedVideoOk(item.id)] as const),
  );
  return Object.fromEntries(pairs);
}

export function invalidateFlightListDisplayCache(flightIds?: string[]): void {
  if (!flightIds) {
    fullInfoCache.clear();
    videoOkCache.clear();
    return;
  }
  for (const id of flightIds) {
    fullInfoCache.delete(id);
    videoOkCache.delete(id);
  }
}
