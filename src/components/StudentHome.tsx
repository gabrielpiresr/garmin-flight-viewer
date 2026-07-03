import { usePermissions } from "../contexts/PermissionsContext";
import { navigateToTab } from "../lib/routedTabs";
import { NoticeFeed } from "./NoticeFeed";
import { UpcomingFlightsCard } from "./UpcomingFlightsCard";

type StudentHomeProps = {
  onOpenFlights: () => void;
  onOpenNotices: () => void;
};

export function StudentHome({ onOpenFlights, onOpenNotices }: StudentHomeProps) {
  const { canTab } = usePermissions();
  return (
    <div className="space-y-4">
      {canTab("schedule") && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigateToTab("/aluno/escala")}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            + Agendar novo voo
          </button>
        </div>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <NoticeFeed
          className="min-w-0 w-full"
          limit={3}
          eyebrow="Comunicados"
          title="Últimos avisos"
          showRefresh={false}
          actionLabel="Ver todos"
          onAction={onOpenNotices}
        />
        <UpcomingFlightsCard
          className="min-w-0 w-full"
          onOpenFlights={onOpenFlights}
          subtitle="Os 3 próximos voos futuros atribuídos a você."
        />
      </div>
    </div>
  );
}
