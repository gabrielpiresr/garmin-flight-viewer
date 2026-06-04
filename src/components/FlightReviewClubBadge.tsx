import type { StudentTrainingTrack } from "../types/trainingTrack";

export function hasActiveFlightReviewClubTrack(tracks: StudentTrainingTrack[] | null | undefined): boolean {
  return (tracks ?? []).some((track) => track.status === "active" && track.isFlightReviewClubMember);
}

export function FlightReviewClubBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-pink-500/40 bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-200"
      title="Flight Review Club ativo"
    >
      FRC
    </span>
  );
}
