import { buildFlightDisplayInfo, type FlightDisplayInfo } from "./flightDisplay";
import { getSavedFlight, type SavedFlightListItem } from "./flightsDb";
import { listFlightVideoFlags, listFlightVideos } from "./flightVideosDb";
import { getProfile, listProfileSummariesByUserIds, type PilotProfile } from "./rbac";

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
const DEFAULT_FULL_INFO_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function uniqueProfileIds(items: SavedFlightListItem[]): string[] {
  return Array.from(
    new Set(
      items
        .flatMap((item) => [item.student_user_id, item.instructor_user_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

function primeProfileCache(userIds: string[]): void {
  const missing = userIds.filter((id) => !profileCache.has(id));
  if (missing.length === 0) return;

  const batch = listProfileSummariesByUserIds(missing).catch(() => ({} as Record<string, ProfileSummary>));
  for (const userId of missing) {
    profileCache.set(userId, batch.then((summaries) => summaries[userId] ?? null));
  }
}

function primeVideoCache(flightIds: string[]): void {
  const missing = flightIds.filter((id) => !videoOkCache.has(id));
  if (missing.length === 0) return;

  const batch = listFlightVideoFlags(missing).catch(() => ({} as Record<string, boolean>));
  for (const flightId of missing) {
    videoOkCache.set(flightId, batch.then((flags) => Boolean(flags[flightId])));
  }
}

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

function hasMaterializedDisplayInfo(item: SavedFlightListItem): boolean {
  return (
    item.from_to !== null ||
    item.landings !== null ||
    item.total_flight_minutes !== null ||
    item.total_miles !== null ||
    item.telemetry_present !== null ||
    item.instructor_suggestion_md !== null ||
    item.student_suggestion_md !== null ||
    item.weight_balance_complete !== null
  );
}

export async function loadLightFlightListDisplayInfos(
  items: SavedFlightListItem[],
): Promise<Record<string, FlightDisplayInfo>> {
  primeProfileCache(uniqueProfileIds(items));
  const pairs = await mapWithConcurrency(items, 24, async (item) => {
    const fallback = await getProfileFallback(item);
    return [item.id, buildFlightDisplayInfo(item, null, fallback)] as const;
  });
  return Object.fromEntries(pairs);
}

async function getCachedFullFlightInfo(item: SavedFlightListItem): Promise<FlightDisplayInfo> {
  const existing = fullInfoCache.get(item.id);
  if (existing) return existing;

  const promise = (async () => {
    const fallback = await getProfileFallback(item);
    const missingInstructorIdentity =
      !item.instructor_user_id &&
      !(fallback.instructorName && fallback.instructorName.trim());
    if (hasMaterializedDisplayInfo(item) && !missingInstructorIdentity) {
      return buildFlightDisplayInfo(item, null, fallback);
    }
    const saved = await getSavedFlight(item.id);
    return buildFlightDisplayInfo(item, saved.data?.csv_text ?? null, fallback);
  })();

  fullInfoCache.set(item.id, promise);
  return promise;
}

export async function loadFullFlightListDisplayInfos(
  items: SavedFlightListItem[],
  options: { limit?: number; concurrency?: number } = {},
): Promise<Record<string, FlightDisplayInfo>> {
  const selectedItems =
    typeof options.limit === "number" && options.limit >= 0 ? items.slice(0, options.limit) : items;
  primeProfileCache(uniqueProfileIds(selectedItems));
  const pairs = await mapWithConcurrency(
    selectedItems,
    options.concurrency ?? DEFAULT_FULL_INFO_CONCURRENCY,
    async (item) => {
      try {
        return [item.id, await getCachedFullFlightInfo(item)] as const;
      } catch {
        const fallback = await getProfileFallback(item);
        return [item.id, buildFlightDisplayInfo(item, null, fallback)] as const;
      }
    },
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

export async function loadFlightVideoFlags(
  items: SavedFlightListItem[],
  options: { limit?: number; concurrency?: number } = {},
): Promise<Record<string, boolean>> {
  const selectedItems =
    typeof options.limit === "number" && options.limit >= 0 ? items.slice(0, options.limit) : items;
  primeVideoCache(selectedItems.map((item) => item.id));
  const pairs = await mapWithConcurrency(
    selectedItems,
    options.concurrency ?? 12,
    async (item) => [item.id, await getCachedVideoOk(item.id)] as const,
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
