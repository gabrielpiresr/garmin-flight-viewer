import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ParseResult } from "../lib/parseGarminCsv";
import { useAuth } from "../contexts/AuthContext";
import { getSavedFlight } from "../lib/flightsDb";
import { StudentFlightContextPanel } from "./instructor/StudentFlightContextPanel";
import { FlightShareStickersModal } from "./FlightShareStickersModal";
import { NovoVooFlow } from "./NovoVooFlow";
import { TelemetriaTab } from "./TelemetriaTab";
import { VideosTab } from "./VideosTab";

type SubTab = "telemetria" | "videos" | "ficha" | "aluno";

type SubTabConfig = { id: SubTab; label: string; description: string; icon: ReactNode };

const SUB_TAB_CONFIG: Record<SubTab, Omit<SubTabConfig, "id">> = {
  ficha: {
    label: "Ficha",
    description: "Dados, pré voo, pernas, risco e parecer",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.75 2A1.75 1.75 0 004 3.75v12.5C4 17.216 4.784 18 5.75 18h8.5A1.75 1.75 0 0016 16.25V6.5L11.5 2H5.75zm5 1.75L14.25 7h-2.5a1 1 0 01-1-1V3.75zM7 10h6v1.5H7V10zm0 3h6v1.5H7V13z" />
      </svg>
    ),
  },
  telemetria: {
    label: "Telemetria",
    description: "Mapa, gráficos e resumo do CSV",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.5 3.75A.75.75 0 014.25 3h11.5a.75.75 0 010 1.5H5v10.75a.75.75 0 01-1.5 0V3.75z" />
        <path d="M7 13.5a1 1 0 100 2 1 1 0 000-2zm4-4a1 1 0 100 2 1 1 0 000-2zm4-3.5a1 1 0 100 2 1 1 0 000-2zM7.53 13.03l3-3 1.06 1.06-3 3-1.06-1.06zm4.04-2.6l2.9-3.38 1.14.98-2.9 3.38-1.14-.98z" />
      </svg>
    ),
  },
  videos: {
    label: "Vídeos",
    description: "Processamento e arquivos de vídeo do voo",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 4A1.75 1.75 0 003 5.75v8.5C3 15.216 3.784 16 4.75 16h7.5A1.75 1.75 0 0014 14.25v-8.5A1.75 1.75 0 0012.25 4h-7.5zM15 7.25l2.47-1.65A1 1 0 0119 6.43v7.14a1 1 0 01-1.53.83L15 12.75v-5.5z" />
      </svg>
    ),
  },
  aluno: {
    label: "Aluno",
    description: "Histórico e contexto do aluno",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 10a4 4 0 100-8 4 4 0 000 8zM3.5 17.25A5.75 5.75 0 019.25 11.5h1.5a5.75 5.75 0 015.75 5.75.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75z" />
      </svg>
    ),
  },
};

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
  const [shareModalOpen, setShareModalOpen] = useState(false);
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

  const subTabs: SubTabConfig[] = useMemo(() => {
    const buildTab = (id: SubTab): SubTabConfig => ({ id, ...SUB_TAB_CONFIG[id] });
    const tabs: SubTabConfig[] = [
      buildTab("ficha"),
      buildTab("telemetria"),
      buildTab("videos"),
    ];
    if (canSeeStudentContext && studentUserId) tabs.push(buildTab("aluno"));
    return tabs;
  }, [canSeeStudentContext, studentUserId]);
  const activeTab = subTabs.find((tab) => tab.id === activeSubTab) ?? subTabs[0];

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
        {flightId && (
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-gradient-to-r from-fuchsia-500/15 via-pink-500/15 to-orange-400/15 px-3 py-1.5 text-sm font-semibold text-pink-100 transition hover:border-pink-400/60 hover:from-fuchsia-500/25 hover:via-pink-500/25 hover:to-orange-400/25"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
            </svg>
            Compartilhar
          </button>
        )}
      </div>

      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="flex flex-wrap justify-start gap-2">
          {subTabs.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-violet-500/40 bg-violet-500/20 text-violet-100"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{activeTab.description}</p>
      </section>

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
      {flightId && shareModalOpen ? (
        <FlightShareStickersModal flightId={flightId} onClose={() => setShareModalOpen(false)} />
      ) : null}
    </div>
  );
}
