import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ADMIN_USERS_FUNCTION_ID, SCHOOL_ID } from "../lib/appwrite";
import {
  importSelfCreditsFromSaga,
  importSelfFlightsFromSaga,
  reloadSagaFlightFromSource,
  type SagaImportProgress,
} from "../lib/sagaImportDb";
import { useToast } from "./ui/ToastProvider";
import { listAircrafts } from "../lib/aircraftDb";
import {
  formatMinutes,
  getDateBase,
  getFlightDateTimeMs,
  isFutureFlight,
  shortName,
  type FlightDisplayInfo,
} from "../lib/flightDisplay";
import {
  deleteSavedFlight,
  getSavedFlight,
  listSavedFlights,
  updateStudentFlightSuggestion,
  type SavedFlightListItem,
} from "../lib/flightsDb";
import {
  listSignaturesForFlight,
  signFlight,
  type FlightSignaturesForFlight,
  type SignerRole,
} from "../lib/flightSignaturesDb";
import { exportFlightFichaPdf } from "../lib/flightFichaPdf";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import {
  buildBasicFlightListDisplayInfo,
  invalidateFlightListDisplayCache,
  loadFlightVideoFlags,
  loadFullFlightListDisplayInfos,
  loadLightFlightListDisplayInfos,
  type FlightListDisplayInfo,
} from "../lib/flightListDisplayCache";
import { FlightsAgendaBoard } from "./FlightsAgendaBoard";
import { FlightDetailView } from "./FlightDetailView";
import { FlightShareStickersModal } from "./FlightShareStickersModal";
import { NovoVooFlow } from "./NovoVooFlow";
import type { NovoVooStepId } from "./NovoVooFlow";
import { Skeleton } from "./ui/Skeleton";

type View = "list" | "detail" | "create";

type FlightCardInfo = FlightListDisplayInfo;
type DetailOpenOptions = { initialStepId?: NovoVooStepId; hideStepMenu?: boolean };

function groupFlights(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightCardInfo>,
  direction: "asc" | "desc" = "desc",
): { label: string; flights: SavedFlightListItem[] }[] {
  const ordered = [...items].sort((a, b) => {
    const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
    return direction === "asc" ? diff : -diff;
  });
  return ordered.length ? [{ label: "", flights: ordered }] : [];
}


function formatDecimalHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  return (minutes / 60).toFixed(1) + "h";
}

function isScheduledFlightStatus(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  return ["Pendente", "Confirmado", "Previsto"].includes(item.flight_status) && isFutureFlight(item, info);
}

function FlightStatusBadge({ status }: { status: SavedFlightListItem["flight_status"] }) {
  const cls =
    status === "Realizado"
      ? "bg-emerald-900/40 text-emerald-300"
      : status === "Cancelado"
        ? "bg-red-950/40 text-red-300"
        : "bg-sky-900/40 text-sky-300";
  return <span className={`rounded px-2 py-1 text-[11px] font-semibold ${cls}`}>{status}</span>;
}

const AIRCRAFT_COLORS = [
  "bg-sky-900/60 text-sky-300 border-sky-600/50",
  "bg-violet-900/60 text-violet-300 border-violet-600/50",
  "bg-emerald-900/60 text-emerald-400 border-emerald-600/50",
  "bg-amber-900/60 text-amber-400 border-amber-600/50",
  "bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-600/50",
];

function aircraftColor(registration: string): string {
  const key = registration || "unknown";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % 997;
  return AIRCRAFT_COLORS[hash % AIRCRAFT_COLORS.length] ?? AIRCRAFT_COLORS[0]!;
}

function FutureWeightBalanceCta({ ok, onClick }: { ok: boolean; onClick: () => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      {ok ? <span className="rounded bg-emerald-900/40 px-2 py-1 text-[11px] font-semibold text-emerald-400">OK</span> : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
      >
        {ok ? "Editar" : "Enviar P&B"}
      </button>
    </div>
  );
}

function FutureStudentSuggestionStatus({ suggestion }: { suggestion?: string }) {
  const text = suggestion?.trim();
  if (!text) {
    return <span className="rounded bg-amber-900/40 px-2 py-1 text-[11px] font-semibold text-amber-400">Pendente</span>;
  }
  return <span className="text-xs text-emerald-400">OK - {text}</span>;
}

function missionLabel(info?: FlightCardInfo): string {
  const raw = info?.trainingMissionName ?? "";
  return raw.trim() || "—";
}

function SectionTitle({ title, tone }: { title: string; tone: "future" | "past" | "default" }) {
  const color =
    tone === "future"
      ? "text-sky-300"
      : tone === "past"
        ? "text-violet-300"
        : "text-slate-400";
  return <p className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</p>;
}

function writeFichaWindowStatus(printWindow: Window, title: string, message: string) {
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        body { margin: 0; background: #020617; color: #e2e8f0; font-family: Arial, sans-serif; }
        main { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
        h1 { margin: 0 0 8px; font-size: 20px; }
        p { margin: 0; color: #94a3b8; }
      </style>
    </head>
    <body>
      <main>
        <div>
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </main>
    </body>
  </html>`);
  printWindow.document.close();
}

type DisplayMode = "cards" | "calendar" | "table";
const FLIGHT_PAGE_SIZE = 50;
const FULL_INFO_PRELOAD_LIMIT = 24;

function defaultDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "table";
  return window.matchMedia("(min-width: 768px)").matches ? "table" : "cards";
}

function displayModeStorageKey(userId?: string): string {
  return `gfv:meus-voos:aluno:${userId ?? "anon"}:displayMode`;
}

function readStoredDisplayMode(userId?: string): DisplayMode {
  if (typeof window === "undefined") return defaultDisplayMode();
  const stored = window.localStorage.getItem(displayModeStorageKey(userId));
  return stored === "cards" || stored === "calendar" || stored === "table" ? stored : defaultDisplayMode();
}

function selectFullInfoPreloadItems(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightDisplayInfo>,
): SavedFlightListItem[] {
  return [...items]
    .sort((a, b) => {
      const aFuture = isScheduledFlightStatus(a, infoById[a.id]);
      const bFuture = isScheduledFlightStatus(b, infoById[b.id]);
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
      return aFuture ? diff : -diff;
    })
    .slice(0, FULL_INFO_PRELOAD_LIMIT);
}

function DisplayModeIcon({ mode }: { mode: DisplayMode }) {
  if (mode === "calendar") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.75 3A1.75 1.75 0 004 4.75v10.5C4 16.216 4.784 17 5.75 17h8.5A1.75 1.75 0 0016 15.25V4.75A1.75 1.75 0 0014.25 3h-8.5zM5.5 7h9v8.25a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25V7z" />
      </svg>
    );
  }
  if (mode === "table") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 5.75A1.75 1.75 0 014.75 4h10.5A1.75 1.75 0 0117 5.75v8.5A1.75 1.75 0 0115.25 16H4.75A1.75 1.75 0 013 14.25v-8.5zM4.5 8h11V5.75a.25.25 0 00-.25-.25H4.75a.25.25 0 00-.25.25V8zm0 1.5v4.75c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V9.5h-11z" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M4.75 3A1.75 1.75 0 003 4.75v2.5C3 8.216 3.784 9 4.75 9h2.5A1.75 1.75 0 009 7.25v-2.5A1.75 1.75 0 007.25 3h-2.5zm8 0A1.75 1.75 0 0011 4.75v2.5C11 8.216 11.784 9 12.75 9h2.5A1.75 1.75 0 0017 7.25v-2.5A1.75 1.75 0 0015.25 3h-2.5zm-8 8A1.75 1.75 0 003 12.75v2.5C3 16.216 3.784 17 4.75 17h2.5A1.75 1.75 0 009 15.25v-2.5A1.75 1.75 0 007.25 11h-2.5zm8 0A1.75 1.75 0 0011 12.75v2.5c0 .966.784 1.75 1.75 1.75h2.5A1.75 1.75 0 0017 15.25v-2.5A1.75 1.75 0 0015.25 11h-2.5z" />
    </svg>
  );
}

function ShareFlightButton({
  onClick,
  className = "",
  iconOnly = false,
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Compartilhar"
      aria-label="Compartilhar"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 ${iconOnly ? "p-2" : "px-3 py-2"} text-xs font-semibold text-pink-400 transition hover:border-pink-400/60 hover:bg-pink-500/20 ${className}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M13.5 5.5a2.5 2.5 0 10-2.45-3.01L7.2 4.42a2.5 2.5 0 100 3.16l3.85 1.93a2.5 2.5 0 10.67-1.34L7.87 6.24a2.57 2.57 0 000-.48l3.85-1.93c.45.99 1.45 1.67 2.78 1.67z" />
      </svg>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="3.25" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
      </svg>
      {iconOnly ? null : "Compartilhar"}
    </button>
  );
}

export function MeusVoosTab() {
  const { user, configured } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>(undefined);
  const [detailOpenOptions, setDetailOpenOptions] = useState<DetailOpenOptions>({});
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalFlights, setTotalFlights] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [infoById, setInfoById] = useState<Record<string, FlightCardInfo>>({});
  const [aircraftOptions, setAircraftOptions] = useState<string[]>([]);
  const [instructorFilter, setInstructorFilter] = useState("");
  const [aircraftFilter, setAircraftFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readStoredDisplayMode(user?.id));
  const [studentSuggestionFlightId, setStudentSuggestionFlightId] = useState<string | null>(null);
  const [shareFlightId, setShareFlightId] = useState<string | null>(null);
  const [exportingFichaId, setExportingFichaId] = useState<string | null>(null);
  const [signaturesByFlightId, setSignaturesByFlightId] = useState<Record<string, FlightSignaturesForFlight>>({});
  const [signingFlightId, setSigningFlightId] = useState<string | null>(null);
  const [signingRole, setSigningRole] = useState<SignerRole | null>(null);
  const [signingPassword, setSigningPassword] = useState("");
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [studentSuggestionDraft, setStudentSuggestionDraft] = useState("");
  const [studentSuggestionSaving, setStudentSuggestionSaving] = useState(false);
  const [studentSuggestionError, setStudentSuggestionError] = useState<string | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SagaImportProgress | null>(null);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [reloadingSagaFlightId, setReloadingSagaFlightId] = useState<string | null>(null);
  const canManageFlights = user?.role === "instrutor" || user?.role === "admin";
  const isStudentView = user?.role === "aluno";
  const showSagaSync = !!ADMIN_USERS_FUNCTION_ID && !!user;

  const handleSagaSync = async () => {
    if (sagaImporting) return;
    setSagaImporting(true);
    setSyncOverlayVisible(true);
    setSyncProgress(null);
    try {
      if (isStudentView) {
        setSyncProgress({
          runId: "self-credit-sync",
          status: "running",
          stage: "credits",
          message: "Atualizando créditos no SAGA antes dos voos...",
          current: 0,
          total: 0,
          logs: [],
        });
        await importSelfCreditsFromSaga();
      }
      const summary = await importSelfFlightsFromSaga({
        onProgress: (p) => setSyncProgress(p),
      });
      const novos = summary.flightsCreated ?? 0;
      const removidos = summary.flightsDeleted ?? 0;
      const deletedIds = (summary.deletedFlights ?? []).map((item) => item.flightId).filter(Boolean);
      if (summary.staleCleanup) {
        console.log("[SAGA sync][MeusVoos] cleanup", summary.staleCleanup);
      }
      showToast({
        message: [
          novos > 0 ? `${novos} voo(s) novo(s) importado(s) do SAGA.` : "Nenhum voo novo encontrado no SAGA.",
          removidos > 0 ? `${removidos} voo(s) removido(s) localmente por terem sido apagados no SAGA.` : "",
          summary.staleCleanup?.failed
            ? `Falha ao remover ${summary.staleCleanup.failed} voo(s). Abra o console para detalhes.`
            : "",
          deletedIds.length ? `IDs removidos: ${deletedIds.join(", ")}` : "",
        ].filter(Boolean).join(" "),
        variant: novos > 0 || removidos > 0 ? "success" : "info",
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setSagaImporting(false);
      window.setTimeout(() => {
        setSyncProgress(null);
        setSyncOverlayVisible(false);
      }, 250);
    }
  };

  const handleReloadSagaFlight = async (flight: SavedFlightListItem) => {
    if (reloadingSagaFlightId) return;
    setReloadingSagaFlightId(flight.id);
    try {
      const result = await reloadSagaFlightFromSource({
        flightId: flight.id,
        sagaFlightId: flight.saga_flight_id ?? undefined,
      });
      showToast({
        variant: result.refreshed ? "success" : "info",
        message: result.message || "Dados do voo recarregados do SAGA.",
      });
      invalidateFlightListDisplayCache([flight.id]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setReloadingSagaFlightId(null);
    }
  };

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE },
    );
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(data ?? []);
    setNextCursor(cursor);
    setTotalFlights(total);
  }, [user, configured]);

  const loadMore = useCallback(async () => {
    if (!user || !configured || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE, cursor: nextCursor },
    );
    setLoadingMore(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const item of data ?? []) byId.set(item.id, item);
      return Array.from(byId.values());
    });
    setNextCursor(cursor);
    setTotalFlights(total);
  }, [configured, loadingMore, nextCursor, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    setDisplayMode(readStoredDisplayMode(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    window.localStorage.setItem(displayModeStorageKey(user.id), displayMode);
  }, [displayMode, user?.id]);

  useEffect(() => {
    const schoolId = SCHOOL_ID ?? "escola_principal";
    void listAircrafts(schoolId)
      .then((res) => setAircraftOptions(res.filter((a) => a.active).map((a) => a.registration)))
      .catch(() => setAircraftOptions([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) {
      setInfoById({});
      return;
    }

    setInfoById((prev) => {
      const next: Record<string, FlightCardInfo> = {};
      for (const item of items) {
        next[item.id] = prev[item.id] ?? {
          ...buildBasicFlightListDisplayInfo(item),
          videoOk: false,
        };
      }
      return next;
    });

    void (async () => {
      const lightInfos = await loadLightFlightListDisplayInfos(items);
      if (cancelled) return;
      setInfoById((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = {
            ...(lightInfos[item.id] ?? buildBasicFlightListDisplayInfo(item)),
            videoOk: prev[item.id]?.videoOk ?? false,
          };
        }
        return next;
      });

      const preloadItems = selectFullInfoPreloadItems(items, lightInfos);
      const [fullInfos, videoFlags] = await Promise.all([
        loadFullFlightListDisplayInfos(preloadItems),
        loadFlightVideoFlags(items),
      ]);
      if (cancelled) return;
      setInfoById((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = {
            ...(fullInfos[item.id] ?? lightInfos[item.id] ?? buildBasicFlightListDisplayInfo(item)),
            videoOk: videoFlags[item.id] ?? prev[item.id]?.videoOk ?? false,
          };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (items.length === 0) return;
    const pastIds = items
      .filter((item) => !isScheduledFlightStatus(item, infoById[item.id]))
      .map((item) => item.id);
    if (pastIds.length === 0) return;
    void (async () => {
      const results = await Promise.all(pastIds.map((id) => listSignaturesForFlight(id)));
      setSignaturesByFlightId((prev) => {
        const next = { ...prev };
        pastIds.forEach((id, i) => {
          if (results[i]?.data) next[id] = results[i].data!;
        });
        return next;
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleSign = async () => {
    if (!user || !signingFlightId || !signingRole) return;
    if (!signingPassword) {
      setSigningError("Informe sua senha para assinar.");
      return;
    }
    setSigningInProgress(true);
    setSigningError(null);
    const passwordForSigning = signingPassword;
    setSigningPassword("");
    const flightRes = await getSavedFlight(signingFlightId);
    if (flightRes.error || !flightRes.data) {
      setSigningError(flightRes.error?.message ?? "Voo não encontrado.");
      setSigningInProgress(false);
      return;
    }
    const res = await signFlight({
      flightId: signingFlightId,
      actorUserId: user.id,
      actorRole: user.role,
      signerRole: signingRole,
      csvText: flightRes.data.csv_text,
      password: passwordForSigning,
    });
    setSigningInProgress(false);
    if (res.error) {
      setSigningError(res.error.message);
      return;
    }
    if (res.data) {
      setSignaturesByFlightId((prev) => ({
        ...prev,
        [signingFlightId]: {
          ...(prev[signingFlightId] ?? { student: null, instructor: null, admin_operator: null }),
          [signingRole === "admin_operator" ? "admin_operator" : signingRole]: res.data,
        },
      }));
    }
    setRefreshKey((k) => k + 1);
    setSigningFlightId(null);
    setSigningRole(null);
    setSigningPassword("");
  };

  const filteredItems = useMemo(() => {
    const inf = instructorFilter.trim().toLowerCase();
    const af = aircraftFilter.trim().toLowerCase();
    return items.filter((item) => {
      const info = infoById[item.id];
      if (inf && !(info?.instructorName ?? "").toLowerCase().includes(inf)) return false;
      if (af && !(info?.aircraft ?? "").toLowerCase().includes(af)) return false;
      const iso = info?.flightDateIso ?? (item.created_at ?? "").slice(0, 10);
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [items, infoById, instructorFilter, aircraftFilter, dateFrom, dateTo]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'flight-list-debug',hypothesisId:'H7',location:'MeusVoosTab.tsx:filteredItems',message:'meus voos filtered snapshot',data:{userId:user?.id||null,role:user?.role||null,rawCount:items.length,filteredCount:filteredItems.length,dateFrom,dateTo,instructorFilter,aircraftFilter,rawIds:items.map((item)=>item.id).slice(0,120),filteredIds:filteredItems.map((item)=>item.id).slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [items, filteredItems, user?.id, user?.role, dateFrom, dateTo, instructorFilter, aircraftFilter]);

  const groups = useMemo(() => groupFlights(filteredItems, infoById), [filteredItems, infoById]);
  const futureGroups = useMemo(() => {
    const future = filteredItems.filter((item) => isScheduledFlightStatus(item, infoById[item.id]));
    return groupFlights(future, infoById, "desc");
  }, [filteredItems, infoById]);
  const pastGroups = useMemo(() => {
    const past = filteredItems.filter((item) => !isScheduledFlightStatus(item, infoById[item.id]));
    return groupFlights(past, infoById, "desc");
  }, [filteredItems, infoById]);
  const consolidatedSummary = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const info = infoById[item.id];
        return {
          flights: acc.flights + 1,
          minutes: acc.minutes + (info?.totalFlightMinutes ?? (item.duration_sec ? Math.round(item.duration_sec / 60) : 0)),
          landings: acc.landings + (info?.landings ?? 0),
        };
      },
      { flights: 0, minutes: 0, landings: 0 },
    );
  }, [filteredItems, infoById]);
  const dataLoading = loading && items.length === 0;

  const openFlight = (id: string, options: DetailOpenOptions = {}) => {
    setSelectedFlightId(id);
    setDetailOpenOptions(options);
    setView("detail");
  };

  const openFutureWeightBalance = (id: string) => {
    openFlight(id, { initialStepId: "peso-balanceamento", hideStepMenu: true });
  };

  const exportFicha = async (id: string) => {
    setErr(null);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErr("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
      return;
    }
    writeFichaWindowStatus(printWindow, "Preparando ficha", "Carregando dados do voo...");
    setExportingFichaId(id);
    const { data, error } = await getSavedFlight(id);
    setExportingFichaId(null);

    if (error || !data) {
      const message = error?.message ?? "Voo não encontrado.";
      setErr(message);
      writeFichaWindowStatus(printWindow, "Falha ao gerar ficha", message);
      return;
    }

    const decoded = decodeFlightRecord(data.csv_text);
    if (!decoded.meta) {
      const message = "Ficha do voo sem metadados estruturados para exportar.";
      setErr(message);
      writeFichaWindowStatus(printWindow, "Falha ao gerar ficha", message);
      return;
    }

    const result = exportFlightFichaPdf({
      meta: decoded.meta,
      telemetryCsv: decoded.telemetryCsv,
      telemetryFileName: data.source_filename,
    }, { targetWindow: printWindow });
    if (!result.ok) setErr(result.error ?? "Não foi possível exportar o PDF.");
  };

  const openStudentSuggestionModal = (id: string) => {
    const info = infoById[id];
    setStudentSuggestionFlightId(id);
    setStudentSuggestionDraft(info?.studentSuggestionMd ?? "");
    setStudentSuggestionError(null);
  };

  const closeStudentSuggestionModal = () => {
    if (studentSuggestionSaving) return;
    setStudentSuggestionFlightId(null);
    setStudentSuggestionDraft("");
    setStudentSuggestionError(null);
  };

  const saveStudentSuggestion = async () => {
    if (!user || !studentSuggestionFlightId) return;
    setStudentSuggestionSaving(true);
    setStudentSuggestionError(null);
    const { error } = await updateStudentFlightSuggestion(studentSuggestionFlightId, {
      actorUserId: user.id,
      suggestionMd: studentSuggestionDraft,
    });
    setStudentSuggestionSaving(false);
    if (error) {
      setStudentSuggestionError(error.message);
      return;
    }
    invalidateFlightListDisplayCache([studentSuggestionFlightId]);
    setInfoById((prev) => {
      const current = prev[studentSuggestionFlightId];
      if (!current) return prev;
      return {
        ...prev,
        [studentSuggestionFlightId]: {
          ...current,
          studentSuggestionMd: studentSuggestionDraft.trim(),
        },
      };
    });
    setRefreshKey((k) => k + 1);
    closeStudentSuggestionModal();
  };

  const backToList = () => {
    setView("list");
    setSelectedFlightId(undefined);
    setDetailOpenOptions({});
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    const isSagaImported = Boolean(item?.saga_flight_id);
    if (item?.instructor_signed && !isSagaImported) {
      setErr("Não é possível apagar um voo assinado pelo instrutor.");
      return;
    }
    if (!confirm("Apagar este voo da nuvem?")) return;
    const { error } = await deleteSavedFlight(id);
    if (error) {
      setErr(error.message);
    } else {
      invalidateFlightListDisplayCache([id]);
      setRefreshKey((k) => k + 1);
    }
  };

  const handleCreated = (id: string) => {
    invalidateFlightListDisplayCache([id]);
    setRefreshKey((k) => k + 1);
    setSelectedFlightId(id);
    setDetailOpenOptions({});
    setView("detail");
  };

  const studentSuggestionFlight = studentSuggestionFlightId
    ? items.find((item) => item.id === studentSuggestionFlightId) ?? null
    : null;
  const studentSuggestionInfo = studentSuggestionFlightId ? infoById[studentSuggestionFlightId] : undefined;

  if (view === "create") {
    return (
      <NovoVooFlow
        onCancel={() => {
          setView("list");
          setRefreshKey((k) => k + 1);
        }}
        onPublished={handleCreated}
      />
    );
  }

  if (view === "detail") {
    return (
      <FlightDetailView
        flightId={selectedFlightId}
        onBack={backToList}
        fichaInitialStepId={detailOpenOptions.initialStepId}
        hideFichaStepMenu={detailOpenOptions.hideStepMenu}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div
        className={`flex flex-col items-stretch gap-4 sm:flex-row sm:items-center ${
          canManageFlights ? "justify-between" : "sm:justify-end"
        }`}
      >
        {canManageFlights ? (
          <h2 className="text-lg font-semibold text-slate-100">Voos dos alunos</h2>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="flex rounded-lg border border-slate-700 bg-slate-900/60 p-1">
            {([
              ["cards", "Card"],
              ["calendar", "Agenda"],
              ["table", "Lista"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  displayMode === mode
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <DisplayModeIcon mode={mode} />
                {label}
              </button>
            ))}
          </div>
          {showSagaSync && (
            <button
              type="button"
              onClick={() => void handleSagaSync()}
              disabled={sagaImporting}
              className="flex items-center gap-2 rounded-lg border border-sky-700/50 bg-sky-900/30 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/40 disabled:opacity-50"
            >
              {sagaImporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sincronizando…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v-2a8 8 0 018-8 8 8 0 017.32 4.74" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 12v2a8 8 0 01-8 8 8 8 0 01-7.32-4.74" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 4v4h-4M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sincronizar do SAGA
                </>
              )}
            </button>
          )}
          {canManageFlights && (
            <button
              type="button"
              onClick={() => setView("create")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 sm:w-auto"
            >
              + Novo voo
            </button>
          )}
        </div>
      </div>

      {canManageFlights ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {dataLoading ? (
            <>
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </>
          ) : (
            <>
              <SummaryCard label="Voos" value={String(consolidatedSummary.flights)} />
              <SummaryCard label="Horas" value={formatMinutes(consolidatedSummary.minutes)} />
              <SummaryCard label="Pousos" value={String(consolidatedSummary.landings)} />
            </>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Filtros avançados</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            type="text"
            value={instructorFilter}
            onChange={(e) => setInstructorFilter(e.target.value)}
            placeholder="Nome do instrutor"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <select
            value={aircraftFilter}
            onChange={(e) => setAircraftFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">Todos os aviões</option>
            {aircraftOptions.map((reg) => (
              <option key={reg} value={reg}>{reg}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
          {err}
        </p>
      )}

      {dataLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, gi) => (
            <div key={gi}>
              <Skeleton className="mb-3 h-3 w-28" />
              <ul className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
                    <div className="flex items-start gap-4">
                      <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                        <Skeleton className="h-6 w-8" />
                        <Skeleton className="h-2.5 w-6" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16 rounded" />
                          <Skeleton className="h-5 w-12 rounded" />
                        </div>
                        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <Skeleton key={j} className="h-3 w-full" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-2xl">✈</div>
          <p className="text-sm font-medium text-slate-400">Nenhum voo encontrado com os filtros atuais.</p>
        </div>
      ) : displayMode === "calendar" ? (
        <div className="space-y-4">
          <FlightsAgendaBoard
            items={filteredItems}
            infoById={infoById}
            onOpen={(id) => {
              openFlight(id);
            }}
          />
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : displayMode === "table" ? (
        <div className="space-y-6">
          <FlightTableSection
            title="Voos futuros"
            groups={futureGroups}
            infoById={infoById}
            emptyLabel="Nenhum voo futuro."
            onOpen={(id) => {
              openFlight(id);
            }}
            onDelete={canManageFlights ? (id) => void handleDelete(id) : undefined}
            onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
            reloadingSagaFlightId={reloadingSagaFlightId}
            showStudentPending={isStudentView}
            onStudentSuggestion={isStudentView ? openStudentSuggestionModal : undefined}
            onStudentWeightBalance={isStudentView ? openFutureWeightBalance : undefined}
          />
          <FlightTableSection
            title="Voos antigos"
            groups={pastGroups}
            infoById={infoById}
            emptyLabel="Nenhum voo antigo."
            onOpen={openFlight}
            onShare={(id) => setShareFlightId(id)}
            onExportFicha={(id) => void exportFicha(id)}
            exportingFichaId={exportingFichaId}
            onDelete={canManageFlights ? (id) => void handleDelete(id) : undefined}
            onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
            reloadingSagaFlightId={reloadingSagaFlightId}
          />
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {isStudentView ? <SectionTitle title="Voos futuros" tone="future" /> : null}
          {(isStudentView ? futureGroups : groups).map((group) => (
            <div key={group.label || "all"}>
              {group.label ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
              ) : null}
              <ul className="space-y-2">
                {group.flights.map((f) => {
                  const info = infoById[f.id];
                  const d = getDateBase(f, info);
                  const day = d.getDate();
                  const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
                  const isPastFlight = !isScheduledFlightStatus(f, info);
                  if (isStudentView) {
                    return (
                      <li
                        key={f.id}
                        className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex w-8 shrink-0 flex-col items-center text-center">
                            <span className="text-lg font-bold leading-none text-sky-400">{day}</span>
                            <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            {!info ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                {Array.from({ length: 4 }).map((_, j) => (
                                  <Skeleton key={j} className="h-3 w-full" />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${aircraftColor(info.aircraft ?? f.aircraft_ident ?? "")}`}>
                                  {info.aircraft ?? f.aircraft_ident ?? "—"}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {info.startTime || "—"}{info.endTime ? ` – ${info.endTime}` : ""}
                                </span>
                                <span className="text-xs text-slate-500">· {shortName(info.instructorName) || "—"}</span>
                              </div>
                            )}
                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sugestão do INVA</p>
                                <p className="line-clamp-3 whitespace-pre-wrap break-words text-slate-300 [overflow-wrap:anywhere]">{info?.instructorSuggestionMd || "Sem sugestão registrada."}</p>
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peso e Balanceamento</p>
                                <FutureWeightBalanceCta
                                  ok={Boolean(info?.weightBalanceFilled)}
                                  onClick={() => openFutureWeightBalance(f.id)}
                                />
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sugestão do aluno</p>
                                {info?.studentSuggestionMd ? (
                                  <FutureStudentSuggestionStatus suggestion={info.studentSuggestionMd} />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openStudentSuggestionModal(f.id);
                                    }}
                                    className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                                  >
                                    Enviar sugestão
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={f.id}
                      className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex w-8 shrink-0 flex-col items-center text-center">
                          <span className="text-lg font-bold leading-none text-sky-400">{day}</span>
                          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${aircraftColor(info?.aircraft ?? f.aircraft_ident ?? "")}`}>
                                {info?.aircraft ?? f.aircraft_ident ?? "—"}
                              </span>
                              <span className="text-xs text-slate-500">{info?.startTime || "—"}</span>
                              {info?.totalFlight ? <span className="text-xs text-slate-500">· {info.totalFlight}</span> : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <FlightStatusBadge status={f.flight_status} />
                              {isPastFlight ? (
                                <div className="flex items-center gap-1">
                                  <span className={`h-2 w-2 rounded-full ${info?.telemetryOk ? "bg-emerald-400" : "bg-slate-600"}`} title={info?.telemetryOk ? "Telemetria ok" : "Sem telemetria"} />
                                  <span className={`h-2 w-2 rounded-full ${info?.videoOk ? "bg-emerald-400" : "bg-slate-600"}`} title={info?.videoOk ? "Vídeo ok" : "Sem vídeo"} />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {!info ? (
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              {Array.from({ length: 4 }).map((_, j) => (
                                <Skeleton key={j} className="h-3 w-full" />
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                              <p className="truncate">Aluno: <span className="text-slate-300">{shortName(info.studentName)}</span></p>
                              <p className="truncate">Instrutor: <span className="text-slate-300">{shortName(info.instructorName)}</span></p>
                              {info.fromTo ? <p className="col-span-2 truncate">Rota: <span className="text-slate-300">{info.fromTo}</span></p> : null}
                              {info.landings != null ? <p>Pousos: <span className="text-slate-300">{info.landings}</span></p> : null}
                              {info.totalFlight ? <p>Duração: <span className="text-slate-300">{info.totalFlight}</span></p> : null}
                              {info.instructorAnac ? <p className="truncate">ANAC INVA: <span className="text-slate-300">{info.instructorAnac}</span></p> : null}
                            </div>
                          )}
                        </div>
                      </div>
                      {(isPastFlight || canManageFlights) && (
                        <div className="mt-3 border-t border-slate-800/50 pt-2.5">
                          {isPastFlight ? (
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                              <FlightSignatureBadges sigs={signaturesByFlightId[f.id]} />
                              {user?.role === "instrutor" && f.instructor_user_id === user.id && !signaturesByFlightId[f.id]?.instructor ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSigningFlightId(f.id);
                                    setSigningRole("instructor");
                                    setSigningPassword("");
                                    setSigningError(null);
                                  }}
                                  className="rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-500"
                                >
                                  Assinar como INVA
                                </button>
                              ) : null}
                              {f.instructor_signed ? (
                                <span className="text-[10px] font-semibold text-amber-400">● Ficha bloqueada</span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            {isPastFlight ? (
                              <>
                                <ShareFlightButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFlightId(f.id);
                                  }}
                                  iconOnly
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFlight(f.id);
                                  }}
                                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                >
                                  Detalhes
                                </button>
                                {f.saga_flight_id ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleReloadSagaFlight(f);
                                    }}
                                    disabled={reloadingSagaFlightId === f.id}
                                    className="rounded-lg border border-amber-600/40 bg-amber-900/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                                  >
                                    {reloadingSagaFlightId === f.id ? "Recarregando..." : "Recarregar SAGA"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportFicha(f.id);
                                  }}
                                  disabled={exportingFichaId === f.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-600/20"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                    <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                  </svg>
                                  {exportingFichaId === f.id ? "Gerando..." : "Ficha"}
                                </button>
                              </>
                            ) : null}
                            {canManageFlights ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDelete(f.id);
                                }}
                                disabled={Boolean(f.instructor_signed && !f.saga_flight_id)}
                                className="ml-auto text-xs text-red-400/80 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Apagar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isStudentView ? (
            <section className="space-y-4">
              <div className="border-t border-slate-700/60 pt-4">
                <SectionTitle title="Voos antigos" tone="past" />
              </div>
              {pastGroups.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum voo antigo.</p>
              ) : (
                pastGroups.map((group) => (
                  <div key={`past-${group.label || "all"}`}>
                    {group.label ? <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p> : null}
                    <ul className="space-y-2">
                      {group.flights.map((f) => {
                        const info = infoById[f.id];
                        const d = getDateBase(f, info);
                        const day = d.getDate();
                        const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
                        const pastAircraft = info?.aircraft ?? f.aircraft_ident ?? "";
                        const pastStartTime = info?.startTime || null;
                        const pastTotal = info?.totalFlight || null;
                        return (
                          <li
                            key={f.id}
                            className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex w-8 shrink-0 flex-col items-center text-center">
                                <span className="text-lg font-bold leading-none text-sky-400">{day}</span>
                                <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${aircraftColor(pastAircraft)}`}>
                                      {pastAircraft || "—"}
                                    </span>
                                    {pastStartTime ? <span className="text-xs text-slate-500">{pastStartTime}</span> : null}
                                    {pastTotal ? <span className="text-xs text-slate-500">· {pastTotal}</span> : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <span className={`h-2 w-2 rounded-full ${info?.telemetryOk ? "bg-emerald-400" : "bg-slate-600"}`} title="Telemetria" />
                                    <span className={`h-2 w-2 rounded-full ${info?.videoOk ? "bg-emerald-400" : "bg-slate-600"}`} title="Vídeo" />
                                  </div>
                                </div>
                                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                                  {info?.fromTo ? <p className="col-span-2 truncate">Rota: <span className="text-slate-300">{info.fromTo}</span></p> : null}
                                  {info?.landings != null ? <p>Pousos: <span className="text-slate-300">{info.landings}</span></p> : null}
                                  {pastTotal ? <p>Duração: <span className="text-slate-300">{pastTotal}</span></p> : null}
                                  {info?.totalMiles ? <p>Milhas: <span className="text-slate-300">{info.totalMiles}</span></p> : null}
                                  {info?.instructorName ? <p className="col-span-2 truncate">Instrutor: <span className="text-slate-300">{shortName(info.instructorName, info.instructorName)}</span></p> : null}
                                  {info?.instructorAnac ? <p className="col-span-2 truncate">ANAC instrutor: <span className="text-slate-300">{info.instructorAnac}</span></p> : null}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/50 pt-2.5">
                              <FlightSignatureBadges sigs={signaturesByFlightId[f.id]} />
                              {!signaturesByFlightId[f.id]?.student ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSigningFlightId(f.id);
                                    setSigningRole("student");
                                    setSigningPassword("");
                                    setSigningError(null);
                                  }}
                                  className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                                >
                                  Assinar como aluno
                                </button>
                              ) : null}
                              <div className="ml-auto flex flex-wrap items-center gap-2">
                                <ShareFlightButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFlightId(f.id);
                                  }}
                                  iconOnly
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFlight(f.id);
                                  }}
                                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                >
                                  Detalhes
                                </button>
                                {f.saga_flight_id ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleReloadSagaFlight(f);
                                    }}
                                    disabled={reloadingSagaFlightId === f.id}
                                    className="rounded-lg border border-amber-600/40 bg-amber-900/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                                  >
                                    {reloadingSagaFlightId === f.id ? "Recarregando..." : "Recarregar SAGA"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportFicha(f.id);
                                  }}
                                  disabled={exportingFichaId === f.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-600/20"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                    <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                  </svg>
                                  {exportingFichaId === f.id ? "Gerando..." : "Ficha"}
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>
          ) : null}
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      )}
      {syncOverlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <h3 className="text-base font-semibold text-slate-100">Sincronizando com SAGA</h3>
            </div>
            <p className="mb-4 text-sm text-slate-300">
              {syncProgress?.message || "Conectando ao SAGA..."}
            </p>
            {syncProgress && syncProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{syncProgress.stage === "import" ? `${syncProgress.current} de ${syncProgress.total} voos` : syncProgress.stage}</span>
                  <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-1.5 rounded-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {signingFlightId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Confirmar assinatura eletrônica</h3>
            <p className="mt-2 text-sm text-slate-400">
              {signingRole === "instructor"
                ? "Ao assinar como instrutor, a ficha do voo ficará bloqueada para edição."
                : "Ao assinar, você atesta que as informações deste voo estão corretas."}
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={signingPassword}
                onChange={(event) => setSigningPassword(event.target.value)}
                disabled={signingInProgress}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-60"
                placeholder="Confirme sua senha"
              />
            </label>
            {signingError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                {signingError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSigningFlightId(null);
                  setSigningRole(null);
                  setSigningPassword("");
                  setSigningError(null);
                }}
                disabled={signingInProgress || !signingPassword}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSign()}
                disabled={signingInProgress}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition ${signingRole === "instructor" ? "bg-violet-600 hover:bg-violet-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
              >
                {signingInProgress ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
      {shareFlightId ? (
        <FlightShareStickersModal flightId={shareFlightId} onClose={() => setShareFlightId(null)} />
      ) : null}
      {studentSuggestionFlightId && studentSuggestionFlight && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Voo futuro</p>
                <h3 className="text-lg font-semibold text-slate-100">Sugestão do aluno</h3>
              </div>
              <button
                type="button"
                onClick={closeStudentSuggestionModal}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <div className="mb-4 grid gap-x-4 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3 text-xs text-slate-400 sm:grid-cols-2 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
              <p>Data: <span className="text-slate-300">{studentSuggestionInfo?.flightDateIso ? new Date(`${studentSuggestionInfo.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</span></p>
              <p>Matrícula: <span className="text-slate-300">{studentSuggestionInfo?.aircraft ?? studentSuggestionFlight.aircraft_ident ?? "—"}</span></p>
              <p>Início: <span className="text-slate-300">{studentSuggestionInfo?.startTime || "—"}</span></p>
              <p>Fim: <span className="text-slate-300">{studentSuggestionInfo?.endTime || "—"}</span></p>
              <p className="sm:col-span-2">Instrutor: <span className="text-slate-300">{shortName(studentSuggestionInfo?.instructorName) || "—"}</span></p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Sugestão do INVA</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-300 [overflow-wrap:anywhere]">
                {studentSuggestionInfo?.instructorSuggestionMd || "Sem sugestão registrada."}
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Sugestão do Aluno
              </span>
              <textarea
                value={studentSuggestionDraft}
                onChange={(e) => setStudentSuggestionDraft(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="Escreva sua sugestão para este voo..."
              />
            </label>

            {studentSuggestionError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                {studentSuggestionError}
              </p>
            )}

            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={closeStudentSuggestionModal}
                disabled={studentSuggestionSaving}
                className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveStudentSuggestion()}
                disabled={studentSuggestionSaving}
                className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 sm:w-auto"
              >
                {studentSuggestionSaving ? "Salvando..." : "Salvar sugestão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SignatureBadgeDoc = NonNullable<FlightSignaturesForFlight[keyof FlightSignaturesForFlight]>;

function FlightSignBadge({
  label,
  signed,
  signature,
}: {
  label: string;
  signed: boolean;
  signature?: SignatureBadgeDoc | null;
}) {
  const dateStr = signature?.signed_at ? new Date(signature.signed_at).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
  const details = signature
    ? [
        `Signatário: ${signature.signer_user_id}`,
        `Papel: ${signature.signer_role}`,
        `Horário UTC: ${signature.signed_at}`,
        `Payload: ${signature.payload_version ?? "-"}`,
        `Hash: ${signature.content_hash ?? "-"}`,
      ].join("\n")
    : undefined;
  return (
    <span
      title={details}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        signed ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-800 text-slate-500"
      }`}
    >
      {signed ? "✓ " : "– "}
      {label}
      {signed && dateStr ? ` ${dateStr}` : ""}
    </span>
  );
}

function FlightSignatureBadges({ sigs }: { sigs: FlightSignaturesForFlight | undefined }) {
  if (!sigs) {
    return <span className="text-[10px] text-slate-500">Carregando...</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <FlightSignBadge label="Aluno" signed={Boolean(sigs.student)} signature={sigs.student} />
        <FlightSignBadge label="Instrutor" signed={Boolean(sigs.instructor)} signature={sigs.instructor} />
        <FlightSignBadge label="Operador" signed={Boolean(sigs.admin_operator)} signature={sigs.admin_operator} />
      </div>
      {([sigs.student, sigs.instructor, sigs.admin_operator].filter(Boolean) as SignatureBadgeDoc[]).map((sig) => (
        <p key={sig.id} className="max-w-[18rem] truncate text-[10px] text-slate-500">
          {sig.signer_role}: {sig.payload_version ?? "-"} · {sig.signed_at} UTC · {sig.content_hash ?? "-"}
        </p>
      ))}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-5 w-20" />
    </div>
  );
}

function FlightListPagingActions({
  hasMore,
  loadingMore,
  loaded,
  total,
  onLoadMore,
  onRefresh,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loaded: number;
  total: number;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {total > 0 ? (
        <span className="text-xs text-slate-600">
          {Math.min(loaded, total)} de {total} voos carregados
        </span>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        className="text-xs text-slate-500 underline-offset-4 hover:underline"
      >
        Atualizar lista
      </button>
    </div>
  );
}

function FlightTableSection({
  title,
  groups,
  infoById,
  emptyLabel,
  onOpen,
  onShare,
  onExportFicha,
  exportingFichaId,
  onDelete,
  onReloadSaga,
  reloadingSagaFlightId,
  onStudentSuggestion,
  onStudentWeightBalance,
  showStudentPending = false,
}: {
  title: string;
  groups: { label: string; flights: SavedFlightListItem[] }[];
  infoById: Record<string, FlightCardInfo>;
  emptyLabel: string;
  onOpen: (id: string) => void;
  onShare?: (id: string) => void;
  onExportFicha?: (id: string) => void;
  exportingFichaId?: string | null;
  onDelete?: (id: string) => void;
  onReloadSaga?: (flight: SavedFlightListItem) => void;
  reloadingSagaFlightId?: string | null;
  onStudentSuggestion?: (id: string) => void;
  onStudentWeightBalance?: (id: string) => void;
  showStudentPending?: boolean;
}) {
  return (
    <section className="space-y-3">
      <SectionTitle title={title} tone={title.toLowerCase().includes("futuro") ? "future" : title.toLowerCase().includes("antigo") ? "past" : "default"} />
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        groups.map((group) => (
          <div key={`${title}-${group.label}`} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
            {group.label ? <div className="border-b border-slate-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </div> : null}
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Início</th>
                    <th className="px-3 py-2 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">Instrutor</th>
                    <th className="px-3 py-2 font-semibold">Matrícula</th>
                    <th className="px-3 py-2 font-semibold">Missão</th>
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Fim</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Rota</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Duração</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Pousos</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Sugestão INVA</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Peso e Balanceamento</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Sugestão aluno</th> : null}
                    <th className="px-3 py-2 font-semibold">Status</th>
                    {onDelete || onShare || onExportFicha ? <th className="px-3 py-2 font-semibold">Ações</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {group.flights.map((item) => {
                    const info = infoById[item.id];
                    const d = getDateBase(item, info);
                    const isFuture = isScheduledFlightStatus(item, info);
                    const dateLabel = info?.flightDateIso
                      ? new Date(`${info.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR")
                      : d.toLocaleDateString("pt-BR");
                    return (
                      <tr
                        key={item.id}
                        className="text-slate-300 transition hover:bg-slate-800/30"
                      >
                        <td className="px-3 py-2 text-slate-200">{dateLabel}</td>
                        <td className="px-3 py-2">{info?.startTime || "—"}</td>
                        <td className="px-3 py-2">{shortName(info?.studentName)}</td>
                        <td className="px-3 py-2">{shortName(info?.instructorName) || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-0.5 ${aircraftColor(info?.aircraft ?? item.aircraft_ident ?? "")}`}>
                            {info?.aircraft ?? item.aircraft_ident ?? "—"}
                          </span>
                        </td>
                        <td className="max-w-56 px-3 py-2">
                          <span className="line-clamp-2 break-words text-slate-300">{missionLabel(info)}</span>
                        </td>
                        {showStudentPending ? <td className="px-3 py-2">{info?.endTime || "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.fromTo ?? "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{formatDecimalHours(info?.totalFlightMinutes)}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.landings ?? 0}</td> : null}
                        {showStudentPending ? (
                          <td className="max-w-64 px-3 py-2">
                            <span className="line-clamp-2 text-slate-300">
                              {info?.instructorSuggestionMd || "Sem sugestão registrada."}
                            </span>
                          </td>
                        ) : null}
                        {showStudentPending ? (
                          <td className="px-3 py-2">
                            <FutureWeightBalanceCta
                              ok={Boolean(info?.weightBalanceFilled)}
                              onClick={() => onStudentWeightBalance?.(item.id)}
                            />
                          </td>
                        ) : null}
                        {showStudentPending ? (
                          <td className="px-3 py-2">
                            {info?.studentSuggestionMd ? (
                              <FutureStudentSuggestionStatus suggestion={info.studentSuggestionMd} />
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStudentSuggestion?.(item.id);
                                }}
                                className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                              >
                                Enviar sugestão
                              </button>
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <FlightStatusBadge status={item.flight_status} />
                          {!isFuture && info?.telemetryOk ? (
                            <span className="text-emerald-300">Telemetria ok</span>
                          ) : null}
                          </div>
                        </td>
                        {onDelete || onShare || onExportFicha ? (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {onShare ? (
                                <>
                                  <ShareFlightButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onShare(item.id);
                                    }}
                                    iconOnly
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpen(item.id);
                                    }}
                                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                                  >
                                    Detalhes
                                  </button>
                                  {item.saga_flight_id && onReloadSaga ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onReloadSaga(item);
                                      }}
                                      disabled={reloadingSagaFlightId === item.id}
                                      className="rounded border border-amber-600/40 bg-amber-900/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                                    >
                                      {reloadingSagaFlightId === item.id ? "Recarregando..." : "Recarregar SAGA"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onExportFicha?.(item.id);
                                    }}
                                    disabled={exportingFichaId === item.id}
                                    className="inline-flex items-center gap-1.5 rounded border border-sky-600/40 bg-sky-600/10 px-2 py-1 text-xs text-sky-400 hover:bg-sky-600/20"
                                  >
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                      <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                      <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                    </svg>
                                    {exportingFichaId === item.id ? "Gerando..." : "Ficha"}
                                  </button>
                                </>
                              ) : null}
                              {onDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(item.id);
                                  }}
                                  className="text-red-400/80 underline-offset-4 hover:underline"
                                >
                                  Apagar
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
