import { NoticeFeed } from "../NoticeFeed";
import { UpcomingFlightsCard } from "../UpcomingFlightsCard";

export function InstructorHome({ onOpenFlights }: { onOpenFlights: () => void }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <NoticeFeed className="min-w-0 w-full" />
      <UpcomingFlightsCard
        className="min-w-0 w-full"
        onOpenFlights={onOpenFlights}
        subtitle="Somente os 3 próximos voos futuros atribuídos a você."
      />
    </div>
  );
}
