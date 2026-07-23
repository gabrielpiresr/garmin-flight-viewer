import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ParseResult } from "../lib/parseGarminCsv";
import { useAuth } from "../contexts/AuthContext";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";
import { FlightReviewClubGate } from "./FlightReviewClubGate";
import { getSavedFlight } from "../lib/flightsDb";
import { getFlightLockStatus, signFlight } from "../lib/flightSignaturesDb";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { validateFlightForInstructorSign } from "../lib/flightSignValidation";
import { createFlightPublicShare } from "../lib/publicFlightReviewShare";
import { StudentFlightContextPanel } from "./instructor/StudentFlightContextPanel";
import { FlightAuditLogPanel } from "./admin/FlightAuditLogPanel";
import { FlightShareStickersModal } from "./FlightShareStickersModal";
import { FlightReviewTab } from "./FlightReviewTab";
import { NovoVooFlow, type NovoVooStepId } from "./NovoVooFlow";
import { TelemetriaTab } from "./TelemetriaTab";
import { VideosTab } from "./VideosTab";
import { PhotosTab } from "./PhotosTab";
import { Tabs } from "./ui/Tabs";

export type FlightDetailSubTab = "telemetria" | "videos" | "fotos" | "ficha" | "aluno" | "auditoria" | "flight-review";
type SubTab = FlightDetailSubTab;

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
  fotos: {
    label: "Fotos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 3.5A1.75 1.75 0 003 5.25v9.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0017 14.75v-9.5a1.75 1.75 0 00-1.75-1.75H4.75zm0 1.5h10.5c.138 0 .25.112.25.25v5.44l-2.02-2.02a1.75 1.75 0 00-2.475 0L8.5 10.174l-.52-.52a1.75 1.75 0 00-2.475 0L4.5 10.659V5.25c0-.138.112-.25.25-.25zM15.5 14.75a.25.25 0 01-.25.25H4.75a.25.25 0 01-.25-.25v-1.97l1.066-1.066a.25.25 0 01.354 0l.874.873a1 1 0 001.414 0l1.858-1.858a.25.25 0 01.354 0l3.08 3.08v.94zM13 6.75a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0z" />
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
  auditoria: {
    label: "Auditoria",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2.25l6 2.25v4.74c0 3.67-2.3 6.95-5.75 8.18a.75.75 0 01-.5 0C6.3 16.19 4 12.91 4 9.24V4.5l6-2.25zm0 1.6L5.5 5.54v3.7c0 2.9 1.74 5.52 4.5 6.67 2.76-1.15 4.5-3.77 4.5-6.67v-3.7L10 3.85z" />
        <path d="M7.75 8.25h4.5v1.5h-4.5v-1.5zm0 3h4.5v1.5h-4.5v-1.5z" />
      </svg>
    ),
  },
  "flight-review": {
    label: "Flight Review",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M2.25 2.25a.75.75 0 000 1.5H3v10.5a3 3 0 003 3h1.21l-1.172 3.513a.75.75 0 001.424.474l.329-.987h8.418l.33.987a.75.75 0 001.422-.474l-1.17-3.513H18a3 3 0 003-3V3.75h.75a.75.75 0 000-1.5H2.25zm6.04 16.5l.5-1.5h6.42l.5 1.5H8.29zm7.46-12a.75.75 0 00-1.5 0v6a.75.75 0 001.5 0v-6zm-3 2.25a.75.75 0 00-1.5 0v3.75a.75.75 0 001.5 0V9zm-3 3a.75.75 0 00-1.5 0v.75a.75.75 0 001.5 0V12z" clipRule="evenodd" />
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
  initialSubTab?: SubTab;
  allowedSubTabs?: SubTab[];
  allowPublicLink?: boolean;
  /**
   * Posição cronológica (0-based) deste voo entre os voos do aluno. Usada para o
   * "Voos de trial": os primeiros N voos ficam liberados sem membership do Club.
   */
  trialFlightIndex?: number;
};

export function FlightDetailView({
  flightId,
  parsedResult,
  onBack,
  showStudentTab = true,
  backLabel = "Meus voos",
  fichaInitialStepId,
  hideFichaStepMenu = false,
  initialSubTab,
  allowedSubTabs,
  allowPublicLink = false,
  trialFlightIndex,
}: Props) {
  const { user } = useAuth();
  const { enabled: clubEnabled, isClubMember, trialFlightCount } = useFlightReviewClub();
  const isTrial = trialFlightIndex !== undefined && trialFlightCount > 0 && trialFlightIndex < trialFlightCount;
  const gatedByClub = clubEnabled && user?.role === "aluno" && !isClubMember && !isTrial;
  const defaultSubTab = initialSubTab ?? "ficha";
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(defaultSubTab);
  const [visitedSubTabs, setVisitedSubTabs] = useState<Set<SubTab>>(() => new Set([defaultSubTab]));
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [publicShareBusy, setPublicShareBusy] = useState(false);
  const [publicShareStatus, setPublicShareStatus] = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);

  // Instructor signature state
  const isInstructorUser = user?.role === "instrutor" || user?.role === "admin";
  const [instructorSignedAlready, setInstructorSignedAlready] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [signingPassword, setSigningPassword] = useState("");
  const [signModalValidationErrors, setSignModalValidationErrors] = useState<string[]>([]);
  const [signModalMetaLoading, setSignModalMetaLoading] = useState(false);

  const canSeeStudentContext = showStudentTab && (user?.role === "instrutor" || user?.role === "admin");
  const canSeeAuditLog = Boolean(flightId && user?.role === "admin");
  const canCreatePublicLink = Boolean(flightId && (isClubMember || isTrial || allowPublicLink));

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
    ];
    if (flightId) tabs.push(buildTab("flight-review"));
    tabs.push(buildTab("videos"));
    tabs.push(buildTab("fotos"));
    if (canSeeStudentContext && studentUserId) tabs.push(buildTab("aluno"));
    if (canSeeAuditLog) tabs.push(buildTab("auditoria"));
    if (!allowedSubTabs?.length) return tabs;
    const allowed = new Set(allowedSubTabs);
    return tabs.filter((tab) => allowed.has(tab.id));
  }, [allowedSubTabs, canSeeAuditLog, canSeeStudentContext, flightId, studentUserId]);

  const handleSignFromFicha = async () => {
    if (!user || !flightId) return;
    if (!signingPassword) {
      setSigningError("Informe sua senha para assinar.");
      return;
    }
    setSigningInProgress(true);
    setSigningError(null);
    const passwordForSigning = signingPassword;
    setSigningPassword("");
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
      password: passwordForSigning,
    });
    setSigningInProgress(false);
    if (error) {
      setSigningError(error.message);
      return;
    }
    setInstructorSignedAlready(true);
    setShowSignModal(false);
  };

  async function handleCopyPublicFlightReviewLink() {
    if (!flightId) return;
    setPublicShareBusy(true);
    setPublicShareStatus(null);
    try {
      const url = await createFlightPublicShare(flightId);
      await navigator.clipboard?.writeText(url);
      setPublicShareStatus("Link público copiado.");
    } catch (err) {
      setPublicShareStatus((err as Error).message || "Não foi possível gerar o link público.");
    } finally {
      setPublicShareBusy(false);
    }
  }

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
        {flightId && (isClubMember || isTrial) && (
          <>
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
          </>
        )}
        {canCreatePublicLink && (
          <>
            <button
              type="button"
              onClick={() => void handleCopyPublicFlightReviewLink()}
              disabled={publicShareBusy}
              className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 transition hover:border-sky-400/60 hover:bg-sky-500/20 disabled:cursor-wait disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M7.05 9.293a.75.75 0 011.06 1.061l-.76.76a2.25 2.25 0 003.182 3.182l2.121-2.121a2.25 2.25 0 00-3.182-3.182.75.75 0 11-1.06-1.061 3.75 3.75 0 015.303 5.303l-2.121 2.121a3.75 3.75 0 01-5.303-5.303l.76-.76z" />
                <path d="M12.95 10.707a.75.75 0 01-1.06-1.061l.76-.76a2.25 2.25 0 10-3.182-3.182L7.347 7.825a2.25 2.25 0 003.182 3.182.75.75 0 111.06 1.061 3.75 3.75 0 01-5.303-5.303l2.121-2.121a3.75 3.75 0 015.303 5.303l-.76.76z" />
              </svg>
              {publicShareBusy ? "Gerando..." : "Link público"}
            </button>
            {publicShareStatus ? <span className="text-xs text-slate-400">{publicShareStatus}</span> : null}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:hidden" role="tablist" aria-label="Detalhes do voo">
        {subTabs.map((tab) => {
          const isActive = tab.id === activeSubTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex min-h-[54px] min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                isActive
                  ? "border-sky-400/70 bg-sky-500/15 text-sky-100 shadow-sm shadow-sky-950/30"
                  : "border-slate-700/70 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  isActive ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-slate-700 bg-slate-950/40 text-slate-500"
                }`}
              >
                {tab.icon}
              </span>
              <span className="min-w-0 truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <Tabs
        items={subTabs}
        value={activeSubTab}
        onChange={setActiveSubTab}
        ariaLabel="Detalhes do voo"
        className="hidden md:block"
      />

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
                onSaveAndSign={isInstructorUser && !instructorSignedAlready ? async () => {
                  setSignModalValidationErrors([]);
                  setSigningPassword("");
                  setSignModalMetaLoading(true);
                  const { data } = await getSavedFlight(flightId!);
                  setSignModalMetaLoading(false);
                  if (data) {
                    const meta = decodeFlightRecord(data.csv_text).meta;
                    if (meta) setSignModalValidationErrors(validateFlightForInstructorSign(meta));
                  }
                  setShowSignModal(true);
                } : undefined}
              />
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">Salve o voo para editar a ficha.</p>
            )}
          </div>
        ) : null}

        {visitedSubTabs.has("telemetria") ? (
          <div hidden={activeSubTab !== "telemetria"} className="min-h-0 min-w-0">
            {gatedByClub ? <FlightReviewClubGate /> : <TelemetriaTab flightId={flightId} parsedResult={parsedResult} />}
          </div>
        ) : null}

        {visitedSubTabs.has("videos") ? (
          <div hidden={activeSubTab !== "videos"} className="min-h-0 min-w-0">
            {gatedByClub ? <FlightReviewClubGate /> : <VideosTab flightId={flightId} />}
          </div>
        ) : null}

        {visitedSubTabs.has("fotos") ? (
          <div hidden={activeSubTab !== "fotos"} className="min-h-0 min-w-0">
            {gatedByClub ? <FlightReviewClubGate /> : <PhotosTab flightId={flightId} />}
          </div>
        ) : null}

        {visitedSubTabs.has("aluno") && studentUserId ? (
          <div hidden={activeSubTab !== "aluno"} className="min-h-0 min-w-0">
            <StudentFlightContextPanel studentUserId={studentUserId} currentFlightId={flightId} />
          </div>
        ) : null}

        {visitedSubTabs.has("auditoria") && flightId && canSeeAuditLog ? (
          <div hidden={activeSubTab !== "auditoria"} className="min-h-0 min-w-0">
            <FlightAuditLogPanel flightId={flightId} />
          </div>
        ) : null}

        {visitedSubTabs.has("flight-review") && flightId ? (
          <div hidden={activeSubTab !== "flight-review"} className="min-h-0 min-w-0">
            {gatedByClub ? <FlightReviewClubGate /> : <FlightReviewTab flightId={flightId} />}
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
                onClick={() => { setShowSignModal(false); setSigningError(null); setSignModalValidationErrors([]); setSigningPassword(""); }}
                disabled={signingInProgress}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Fechar
              </button>
            </div>

            {signModalMetaLoading && (
              <div className="mb-4 h-10 animate-pulse rounded-lg bg-slate-800/40" />
            )}

            {signModalValidationErrors.length > 0 && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3">
                <p className="mb-1.5 text-xs font-semibold text-red-300">Corrija os itens abaixo antes de assinar:</p>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-red-200">
                  {signModalValidationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
              As alterações foram salvas. Ao confirmar, a ficha ficará <strong>bloqueada para edição</strong>.
            </p>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={signingPassword}
                onChange={(event) => setSigningPassword(event.target.value)}
                disabled={signingInProgress}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 disabled:opacity-60"
                placeholder="Confirme sua senha"
              />
            </label>

            {signingError && (
              <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                {signingError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowSignModal(false); setSigningError(null); setSignModalValidationErrors([]); setSigningPassword(""); }}
                disabled={signingInProgress}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSignFromFicha()}
                disabled={signingInProgress || signModalValidationErrors.length > 0 || !signingPassword}
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
