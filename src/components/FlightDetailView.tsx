import { useEffect, useMemo, useState } from "react";
import type { ParseResult } from "../lib/parseGarminCsv";
import { useAuth } from "../contexts/AuthContext";
import { getSavedFlight } from "../lib/flightsDb";
import { StudentFlightContextPanel } from "./instructor/StudentFlightContextPanel";
import { NovoVooFlow } from "./NovoVooFlow";
import { TelemetriaTab } from "./TelemetriaTab";
import { VideosTab } from "./VideosTab";

type SubTab = "telemetria" | "videos" | "ficha" | "aluno";

type Props = {
  flightId?: string;
  parsedResult?: ParseResult;
  onBack: () => void;
  showStudentTab?: boolean;
  backLabel?: string;
};

export function FlightDetailView({ flightId, parsedResult, onBack, showStudentTab = true, backLabel = "Meus voos" }: Props) {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("ficha");
  const [studentUserId, setStudentUserId] = useState<string | null>(null);

  const canSeeStudentContext = showStudentTab && (user?.role === "instrutor" || user?.role === "admin");

  useEffect(() => {
    if (!flightId || !canSeeStudentContext) {
      setStudentUserId(null);
      return;
    }
    let cancelled = false;
    void getSavedFlight(flightId).then(({ data }) => {
      if (!cancelled) setStudentUserId(data?.student_user_id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [canSeeStudentContext, flightId]);

  const subTabs: { id: SubTab; label: string }[] = useMemo(() => {
    const tabs: { id: SubTab; label: string }[] = [
      { id: "ficha", label: "Ficha" },
      { id: "telemetria", label: "Telemetria" },
      { id: "videos", label: "Vídeos" },
    ];
    if (canSeeStudentContext && studentUserId) tabs.push({ id: "aluno", label: "Aluno" });
    return tabs;
  }, [canSeeStudentContext, studentUserId]);

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-sky-400 underline-offset-4 hover:underline hover:text-sky-300"
        >
          ← {backLabel}
        </button>
        <span className="text-slate-600">|</span>
        <p className="text-sm text-slate-400">
          {flightId ? "Detalhes do voo" : "Novo voo"}
        </p>
      </div>

      <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/40 p-1">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`min-w-24 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeSubTab === tab.id
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        {activeSubTab === "telemetria" ? (
          <TelemetriaTab flightId={flightId} parsedResult={parsedResult} />
        ) : activeSubTab === "videos" ? (
          <VideosTab flightId={flightId} />
        ) : activeSubTab === "aluno" && studentUserId ? (
          <StudentFlightContextPanel studentUserId={studentUserId} currentFlightId={flightId} />
        ) : flightId ? (
          <NovoVooFlow
            initialFlightId={flightId}
            embedded
          />
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">Salve o voo para editar a ficha.</p>
        )}
      </div>
    </div>
  );
}
