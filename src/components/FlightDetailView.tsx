import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ParseResult } from "../lib/parseGarminCsv";
import { useAuth } from "../contexts/AuthContext";
import { getSavedFlight } from "../lib/flightsDb";
import { getFlightLockStatus, signFlight } from "../lib/flightSignaturesDb";
import { StudentFlightContextPanel } from "./instructor/StudentFlightContextPanel";
import { FlightShareStickersModal } from "./FlightShareStickersModal";
import { NovoVooFlow, type NovoVooStepId } from "./NovoVooFlow";
import { TelemetriaTab } from "./TelemetriaTab";
import { VideosTab } from "./VideosTab";
import { Tabs } from "./ui/Tabs";

type SubTab = "telemetria" | "videos" | "ficha" | "aluno";

type SubTabConfig = { id: SubTab; label: string; icon: ReactNode };

const SUB_TAB_CONFIG: Record<SubTab, Omit<SubTabConfig, "id">> = {
  ficha: {
    label: "Ficha",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.75 2A1.75 1.75 0 004 3.75v12.5C4 17.216 4.784 18 5.75 18h8.5A1.75 1.75 0 0016 16.25V6.5L11.5 2H5.75zm5 1.75L14.25 7h-2.5a1 1 0 01-1-1V3.75zM7 10h6v1.5H7V10zm0 3h6v1.5H7V13z" />
      </svg>
    ),
  },
  telemetria: {
    label: "Telemetria",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.5 3.75A.75.75 0 014.25 3h11.5a.75.75 0 010 1.5H5v10.75a.75.75 0 01-1.5 0V3.75z" />
        <path d="M7 13.5a1 1 0 100 2 1 1 0 000-2zm4-4a1 1 0 100 2 1 1 0 000-2zm4-3.5a1 1 0 100 2 1 1 0 000-2zM7.53 13.03l3-3 1.06 1.06-3 3-1.06-1.06zm4.04-2.6l2.9-3.38 1.14.98-2.9 3.38-1.14-.98z" />
      </svg>
    ),
  },
  videos: {
    label: "Vídeos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 4A1.75 1.75 0 003 5.75v8.5C3 15.216 3.784 16 4.75 16h7.5A1.75 1.75 0 0014 14.25v-8.5A1.75 1.75 0 0012.25 4h-7.5zM15 7.25l2.47-1.65A1 1 0 0119 6.43v7.14a1 1 0 01-1.53.83L15 12.75v-5.5z" />
      </svg>
    ),
  },
  aluno: {
    label: "Aluno",
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
  fichaInitialStepId?: NovoVooStepId;
  hideFichaStepMenu?: boolean;
};

export function FlightDetailView({
  flightId,
  parsedResult,
  onBack,
  showStudentTab = true,
  backLabel = "Meus voos",
  fichaInitialStepId,
  hideFichaStepMenu = false,
}: Props) {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("ficha");
  const [visitedSubTabs, setVisitedSubTabs] = useState<Set<SubTab>>(() => new Set(["ficha"]));
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);

  // Instructor signature state
  const isInstructorUser = user?.role === "instrutor" || user?.role === "admin";
  const [instructorSignedAlready, setInstructorSignedAlready] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);

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

  useEffect(() => {
    setVisitedSubTabs((current) => {
      if (current.has(activeSubTab)) return current;
      const next = new Set(current);
      next.add(activeSubTab);
      return next;
    });
  }, [activeSubTab]);

  useEffect(() => {
    if (!flightId || !isInstructorUser) return;
    void getFlightLockStatus(flightId).then(({ instructor_signed }) => {
      setInstructorSignedAlready(instructor_signed);
    });
  }, [flightId, isInstructorUser]);

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

  const handleSignFromFicha = async () => {
    if (!user || !flightId) return;
    setSigningInProgress(true);
    setSigningError(null);
    const { data: flightData, error: fetchErr } = await getSavedFlight(flightId);
    if (fetchErr || !flightData) {
      setSigningError(fetchErr?.message ?? "Voo não encontrado.");
      setSigningInProgress(false);
      return;
    }
    const { error } = await signFlight({
      flightId,
      actorUserId: user.id,
      actorRole: user.role,
      signerRole: "instructor",
      csvText: flightData.csv_text,
    });
    setSigningInProgress(false);
    if (error) {
      setSigningError(error.message);
      return;
    }
    setInstructorSignedAlready(true);
    setShowSignModal(false);
  };

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
              <rect x="3" y="3" width="18" height="18" rx="3.25" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
            </svg>
            Compartilhar
          </button>
        )}
      </div>

      <Tabs items={subTabs} value={activeSubTab} onChange={setActiveSubTab} ariaLabel="Detalhes do voo" />

      <div className="min-h-0 min-w-0 flex-1">
        {visitedSubTabs.has("ficha") ? (
          <div hidden={activeSubTab !== "ficha"} className="min-h-0 min-w-0">
            {flightId ? (
              <NovoVooFlow
                initialFlightId={flightId}
                embedded
                initialStepId={fichaInitialStepId}
                hideStepMenu={hideFichaStepMenu}
                instructorAlreadySigned={instructorSignedAlready}
                onSaveAndSign={isInstructorUser && !instructorSignedAlready ? () => setShowSignModal(true) : undefined}
              />
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">Salve o voo para editar a ficha.</p>
            )}
          </div>
        ) : null}

        {visitedSubTabs.has("telemetria") ? (
          <div hidden={activeSubTab !== "telemetria"} className="min-h-0 min-w-0">
            <TelemetriaTab flightId={flightId} parsedResult={parsedResult} />
          </div>
        ) : null}

        {visitedSubTabs.has("videos") ? (
          <div hidden={activeSubTab !== "videos"} className="min-h-0 min-w-0">
            <VideosTab flightId={flightId} />
          </div>
        ) : null}

        {visitedSubTabs.has("aluno") && studentUserId ? (
          <div hidden={activeSubTab !== "aluno"} className="min-h-0 min-w-0">
            <StudentFlightContextPanel studentUserId={studentUserId} currentFlightId={flightId} />
          </div>
        ) : null}
      </div>
      {flightId && shareModalOpen ? (
        <FlightShareStickersModal flightId={flightId} onClose={() => setShareModalOpen(false)} />
      ) : null}

      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assinatura eletrônica</p>
                <h3 className="text-base font-semibold text-slate-100">Assinar como INVA</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowSignModal(false); setSigningError(null); }}
                disabled={signingInProgress}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Fechar
              </button>
            </div>

            <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
              As alterações foram salvas. Ao confirmar, a ficha ficará <strong>bloqueada para edição</strong>.
            </p>

            {signingError && (
              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                {signingError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowSignModal(false); setSigningError(null); }}
                disabled={signingInProgress}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSignFromFicha()}
                disabled={signingInProgress}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {signingInProgress ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
