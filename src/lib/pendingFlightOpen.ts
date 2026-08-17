import type { FlightDetailSubTab } from "../components/FlightDetailView";
import type { UserRole } from "./rbac";
import { navigateToTab } from "./routedTabs";

const STORAGE_KEY = "pendingFlightOpen.v1";

export type PendingFlightOpen = {
  flightId: string;
  initialSubTab?: FlightDetailSubTab;
};

export const PENDING_FLIGHT_OPEN_EVENT = "gfv:pending-flight-open";

export function setPendingFlightOpen(payload: PendingFlightOpen): void {
  if (typeof window === "undefined") return;
  const flightId = payload.flightId.trim();
  if (!flightId) return;
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      flightId,
      initialSubTab: payload.initialSubTab,
    } satisfies PendingFlightOpen),
  );
  window.dispatchEvent(new Event(PENDING_FLIGHT_OPEN_EVENT));
}

export function consumePendingFlightOpen(): PendingFlightOpen | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as PendingFlightOpen;
    if (!parsed?.flightId || typeof parsed.flightId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function flightListPathForRole(role: UserRole | string | undefined): string {
  if (role === "aluno") return "/aluno/meus-voos";
  if (role === "instrutor") return "/instrutor/meus-voos";
  return "/admin/todos-os-voos";
}

export function openFlightFromAlbum(params: {
  flightId: string;
  role: UserRole | string | undefined;
  mediaKind: "photo" | "video";
}): void {
  openSavedFlight({
    flightId: params.flightId,
    role: params.role,
    initialSubTab: params.mediaKind === "video" ? "videos" : "fotos",
  });
}

export function openSavedFlight(params: {
  flightId: string;
  role: UserRole | string | undefined;
  initialSubTab?: FlightDetailSubTab;
}): void {
  setPendingFlightOpen({
    flightId: params.flightId,
    initialSubTab: params.initialSubTab,
  });
  navigateToTab(flightListPathForRole(params.role));
}
