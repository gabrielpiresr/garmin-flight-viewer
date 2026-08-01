const STORAGE_PREFIX = "media-album-favorites:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadAlbumFavorites(userId: string | null | undefined): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function saveAlbumFavorites(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore quota / private-mode failures.
  }
}
