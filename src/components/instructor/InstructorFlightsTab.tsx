import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getDateBase,
  getFlightDateTimeMs,
  isFutureFlight,
  type FlightDisplayInfo,
} from "../../lib/flightDisplay";
import {
  deleteSavedFlight,
  getSavedFlight,
  listSavedFlights,
  updateInstructorFlightSuggestion,
  type SavedFlightListItem,
} from "../../lib/flightsDb";
import {
  listSignaturesForFlight,
  signFlight,
  type FlightSignaturesForFlight,
} from "../../lib/flightSignaturesDb";
import { decodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { validateFlightForInstructorSign } from "../../lib/flightSignValidation";
import { exportFlightFichaPdf } from "../../lib/flightFichaPdf";
import {
  buildBasicFlightListDisplayInfo,
  invalidateFlightListDisplayCache,
  loadFullFlightListDisplayInfos,
  loadLightFlightListDisplayInfos,
} from "../../lib/flightListDisplayCache";
import { listFlightVideoFlags } from "../../lib/flightVideosDb";
import { listStudentTrainingTracks } from "../../lib/trainingTracksDb";
import { ADMIN_USERS_FUNCTION_ID } from "../../lib/appwrite";
import {
  importSelfFlightsFromSaga,
  reloadSagaFlightFromSource,
  getSagaImportSettings,
  type SagaImportCatalogs,
  type SagaImportProgress,
  type SagaImportMapping,
  type SagaImportPendingMission,
} from "../../lib/sagaImportDb";
import { allMissionOptions, missionOptionsForTrack } from "../../lib/sagaMissionMappingUi";
import { FlightDetailView } from "../FlightDetailView";
import { FlightReviewClubBadge, hasActiveFlightReviewClubTrack } from "../FlightReviewClubBadge";
import { FlightsAgendaBoard } from "../FlightsAgendaBoard";
import { NovoVooFlow } from "../NovoVooFlow";
import { PreencherFichaFlow } from "./PreencherFichaFlow";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type View = "list" | "detail" | "create" | "preencher-ficha";
type DisplayMode = "cards" | "calendar" | "table";
const FLIGHT_PAGE_SIZE = 50;
const FULL_INFO_PRELOAD_LIMIT = 24;

function defaultDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "table";
  return window.matchMedia("(min-width: 768px)").matches ? "table" : "cards";
}

function displayModeStorageKey(userId?: string): string {
  return `gfv:meus-voos:inva:${userId ?? "anon"}:displayMode`;
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

function groupFlights(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightDisplayInfo>,
  direction: "asc" | "desc",
): { label: string; flights: SavedFlightListItem[] }[] {
  const ordered = [...items].sort((a, b) => {
    const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
    return direction === "asc" ? diff : -diff;
  });
  return ordered.length ? [{ label: "", flights: ordered }] : [];
}

function SectionTitle({ title, tone }: { title: string; tone: "future" | "past" }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-widest ${tone === "future" ? "text-sky-300" : "text-violet-300"}`}>
      {title}
    </p>
  );
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

function formatDate(item: SavedFlightListItem, info?: FlightDisplayInfo): string {
  const iso = info?.flightDateIso ?? item.created_at.slice(0, 10);
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function formatDecimalHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  return (minutes / 60).toFixed(1) + "h";
}

function statusClass(ok: boolean): string {
  return ok ? "text-emerald-300" : "text-amber-300";
}

function statusLabel(ok: boolean): string {
  return ok ? "Sim" : "Pendente";
}

function landingCountClass(info?: FlightDisplayInfo): string {
  return (info?.landings ?? 0) > 0 ? "text-slate-300" : "text-amber-300";
}

function missionLabel(info?: FlightDisplayInfo): string {
  const raw = info?.trainingMissionName ?? "";
  return raw.trim() || "—";
}

function SigBadge({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
        signed
          ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-300"
          : "border-slate-600/40 bg-slate-800/40 text-slate-500"
      }`}
    >
      {signed ? "✓" : "○"} {label}
    </span>
  );
}

function FlightCard({
  item,
  info,
  future,
  videoAttached,
  onOpen,
  onDelete,
  onReloadSaga,
  reloadingSaga = false,
  onEditSuggestion,
  onPreencherFicha,
  onExportFicha,
  exportingFicha,
  sigs,
  onSign,
  canSignAsInstructor,
  studentClubMember,
}: {
  item: SavedFlightListItem;
  info?: FlightDisplayInfo;
  future: boolean;
  videoAttached: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onReloadSaga?: () => void;
  reloadingSaga?: boolean;
  onEditSuggestion: () => void;
  onPreencherFicha?: () => void;
  onExportFicha?: () => void;
  exportingFicha?: boolean;
  sigs?: FlightSignaturesForFlight | null;
  onSign?: () => void;
  canSignAsInstructor?: boolean;
  studentClubMember?: boolean;
}) {
  const d = getDateBase(item, info);
  const day = d.getDate();
  const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");

  return (
    <li
      className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 transition hover:border-sky-700/60 hover:bg-slate-900/70"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex w-10 shrink-0 flex-col items-center text-center">
          <span className="text-xl font-bold leading-none text-sky-400">{day}</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{mon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded border border-sky-600/50 bg-sky-900/60 px-1.5 py-0.5 text-xs font-medium text-sky-200">
              {info?.aircraft ?? item.aircraft_ident ?? "—"}
            </span>
            <FlightStatusBadge status={item.flight_status} />
          </div>

          <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
            <p>Data: <span className="text-slate-300">{formatDate(item, info)}</span></p>
            <p>Início: <span className="text-slate-300">{info?.startTime || "—"}</span></p>
            <p>
              Aluno:{" "}
              <span className="inline-flex min-w-0 items-center gap-1 text-slate-300">
                <span className="truncate">{info?.studentName ?? "—"}</span>
                {studentClubMember ? <FlightReviewClubBadge /> : null}
              </span>
            </p>
            <p>ANAC aluno: <span className="text-slate-300">{info?.studentAnac ?? "—"}</span></p>
            <p>Matrícula: <span className="text-slate-300">{info?.aircraft ?? "—"}</span></p>
            <p>Total voo: <span className="text-slate-300">{info?.totalFlight ?? "00:00"}</span></p>
            {future ? (
              <>
                <p>
                  Sugestão INVA:{" "}
                  <span className={statusClass(Boolean(info?.instructorSuggestionMd))}>
                    {info?.instructorSuggestionMd ? "preenchida" : "pendente"}
                  </span>
                </p>
                <p>
                  Sugestao aluno:{" "}
                  <span className={statusClass(Boolean(info?.studentSuggestionMd))}>
                    {info?.studentSuggestionMd ? "preenchida" : "pendente"}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p>Rota: <span className="text-slate-300">{info?.fromTo ?? "—"}</span></p>
                <p>Pousos: <span className={landingCountClass(info)}>{info?.landings ?? 0}</span></p>
                <p>Telemetria: <span className={statusClass(Boolean(info?.telemetryOk))}>{statusLabel(Boolean(info?.telemetryOk))}</span></p>
                <p>Vídeo: <span className={statusClass(videoAttached)}>{statusLabel(videoAttached)}</span></p>
              </>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          {onPreencherFicha ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPreencherFicha();
              }}
              className="w-full cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Preencher Ficha
            </button>
          ) : null}
          {future ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditSuggestion();
              }}
              className="w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500"
            >
              Sugestão INVA
            </button>
          ) : null}
          {!future && onExportFicha ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExportFicha();
              }}
              disabled={exportingFicha}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-xs font-semibold text-sky-400 hover:bg-sky-600/20 disabled:cursor-wait disabled:opacity-70"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
              </svg>
              {exportingFicha ? "Gerando..." : "Ficha"}
            </button>
          ) : null}
          {onReloadSaga ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReloadSaga();
              }}
              disabled={reloadingSaga}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-900/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
            >
              {reloadingSaga ? "Recarregando..." : "Recarregar SAGA"}
            </button>
          ) : null}
          {!future && canSignAsInstructor && !sigs?.instructor ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSign?.();
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-600/40 bg-violet-900/30 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-900/50"
            >
              Assinar como INVA
            </button>
          ) : null}
          {!future && sigs !== undefined ? (
            <div className="flex flex-wrap gap-1">
              <SigBadge signed={Boolean(sigs?.student)} label="Aluno" />
              <SigBadge signed={Boolean(sigs?.instructor)} label="INVA" />
              <SigBadge signed={Boolean(sigs?.admin_operator)} label="Oper." />
            </div>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={Boolean(item.instructor_signed && !item.saga_flight_id)}
            className="text-left text-xs text-red-400/80 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40 sm:text-right"
          >
            Apagar
          </button>
        </div>
      </div>
    </li>
  );
}

export function InstructorFlightsTab() {
  const { user, configured } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>();
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [infoById, setInfoById] = useState<Record<string, FlightDisplayInfo>>({});
  const [videoFlagsById, setVideoFlagsById] = useState<Record<string, boolean>>({});
  const [clubMemberByStudentId, setClubMemberByStudentId] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalFlights, setTotalFlights] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SagaImportProgress | null>(null);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [reloadingSagaFlightId, setReloadingSagaFlightId] = useState<string | null>(null);
  const [sagaMissionModalFlight, setSagaMissionModalFlight] = useState<SavedFlightListItem | null>(null);
  const [sagaPendingMission, setSagaPendingMission] = useState<SagaImportPendingMission | null>(null);
  const [sagaMissionCatalogs, setSagaMissionCatalogs] = useState<SagaImportCatalogs>({ aircrafts: [], aircraftModels: [], trainingTracks: [] });
  const [, setSagaMissionMapping] = useState<SagaImportMapping | null>(null);
  const [sagaMissionSelection, setSagaMissionSelection] = useState("");
  const [sagaMissionConfirming, setSagaMissionConfirming] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readStoredDisplayMode(user?.id));
  const [suggestionFlightId, setSuggestionFlightId] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [exportingFichaId, setExportingFichaId] = useState<string | null>(null);
  const [signaturesByFlightId, setSignaturesByFlightId] = useState<Record<string, FlightSignaturesForFlight>>({});
  const [signingFlightId, setSigningFlightId] = useState<string | null>(null);
  const [signingFlightMeta, setSigningFlightMeta] = useState<FlightRecordMeta | null>(null);
  const [signingFlightMetaLoading, setSigningFlightMetaLoading] = useState(false);
  const [signingPassword, setSigningPassword] = useState("");
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [signingValidationErrors, setSigningValidationErrors] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      setNextCursor(null);
      setTotalFlights(0);
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
  }, [configured, user]);

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
      return [...byId.values()];
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
    let cancelled = false;
    if (items.length === 0) {
      setInfoById({});
      setVideoFlagsById({});
      return;
    }

    setInfoById((prev) => {
      const next: Record<string, FlightDisplayInfo> = {};
      for (const item of items) {
        next[item.id] = prev[item.id] ?? buildBasicFlightListDisplayInfo(item);
      }
      return next;
    });

    void (async () => {
      const lightInfos = await loadLightFlightListDisplayInfos(items);
      if (cancelled) return;
      setInfoById((prev) => ({ ...prev, ...lightInfos }));

      const preloadItems = selectFullInfoPreloadItems(items, lightInfos);
      const fullInfos = await loadFullFlightListDisplayInfos(preloadItems);
      if (!cancelled) setInfoById((prev) => ({ ...prev, ...fullInfos }));
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    const ids = items.map((item) => item.id);
    if (ids.length === 0) {
      setVideoFlagsById({});
      return;
    }
    void listFlightVideoFlags(ids).then((flags) => {
      if (!cancelled) setVideoFlagsById(flags);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    const studentIds = Array.from(new Set(items.map((item) => item.student_user_id).filter((id): id is string => Boolean(id))));
    if (studentIds.length === 0) {
      setClubMemberByStudentId({});
      return;
    }
    void Promise.all(studentIds.map((studentId) => listStudentTrainingTracks(studentId))).then((results) => {
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      studentIds.forEach((studentId, index) => {
        map[studentId] = hasActiveFlightReviewClubTrack(results[index]?.data);
      });
      setClubMemberByStudentId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    const past = items.filter((item) => !isScheduledFlightStatus(item, infoById[item.id]));
    if (past.length === 0) {
      setSignaturesByFlightId({});
      return;
    }
    void Promise.all(past.map((item) => listSignaturesForFlight(item.id))).then((results) => {
      if (cancelled) return;
      const map: Record<string, FlightSignaturesForFlight> = {};
      for (let i = 0; i < past.length; i++) {
        if (results[i].data) map[past[i].id] = results[i].data!;
      }
      setSignaturesByFlightId(map);
    });
    return () => { cancelled = true; };
  }, [items, infoById]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q && !dateFrom && !dateTo) return items;
    return items.filter((item) => {
      const info = infoById[item.id];
      if (q) {
        const matches =
          (info?.studentName ?? "").toLowerCase().includes(q) ||
          (info?.studentAnac ?? "").toLowerCase().includes(q) ||
          (info?.aircraft ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      const iso = info?.flightDateIso ?? (item.created_at ?? "").slice(0, 10);
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [infoById, items, search, dateFrom, dateTo]);

  const futureItems = useMemo(
    () => filteredItems.filter((item) => isScheduledFlightStatus(item, infoById[item.id])),
    [filteredItems, infoById],
  );
  const pastItems = useMemo(
    () => filteredItems.filter((item) => !isScheduledFlightStatus(item, infoById[item.id])),
    [filteredItems, infoById],
  );
  const futureGroups = useMemo(() => groupFlights(futureItems, infoById, "desc"), [futureItems, infoById]);
  const pastGroups = useMemo(() => groupFlights(pastItems, infoById, "desc"), [pastItems, infoById]);
  const dataLoading = loading && items.length === 0;

  const openFlight = (id: string) => {
    setSelectedFlightId(id);
    setView("detail");
  };

  const exportFicha = async (id: string) => {
    setErr(null);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErr("NÃ£o foi possÃ­vel abrir a janela de impressÃ£o. Verifique o bloqueador de pop-ups.");
      return;
    }
    writeFichaWindowStatus(printWindow, "Preparando ficha", "Carregando dados do voo...");
    setExportingFichaId(id);
    const { data, error } = await getSavedFlight(id);
    setExportingFichaId(null);

    if (error || !data) {
      const message = error?.message ?? "Voo nÃ£o encontrado.";
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
    if (!result.ok) setErr(result.error ?? "NÃ£o foi possÃ­vel exportar o PDF.");
  };

  const handleDelete = async (id: string) => {
    const item = items.find((f) => f.id === id);
    const isSagaImported = Boolean(item?.saga_flight_id);
    if (item?.instructor_signed && !isSagaImported) {
      setErr("Não é possível apagar um voo assinado pelo instrutor.");
      return;
    }
    if (!window.confirm("Apagar este voo da nuvem?")) return;
    const { error } = await deleteSavedFlight(id);
    if (error) {
      setErr(error.message);
      return;
    }
    invalidateFlightListDisplayCache([id]);
    setRefreshKey((k) => k + 1);
  };

  const openSignModal = async (id: string) => {
    setSigningFlightId(id);
    setSigningFlightMeta(null);
    setSigningPassword("");
    setSigningError(null);
    setSigningValidationErrors([]);
    setSigningFlightMetaLoading(true);
    const { data } = await getSavedFlight(id);
    setSigningFlightMetaLoading(false);
    if (data) {
      const meta = decodeFlightRecord(data.csv_text).meta;
      setSigningFlightMeta(meta);
      if (meta) setSigningValidationErrors(validateFlightForInstructorSign(meta));
    }
  };

  const handleSign = async () => {
    if (!user || !signingFlightId) return;
    if (!signingPassword) {
      setSigningError("Informe sua senha para assinar.");
      return;
    }
    setSigningInProgress(true);
    setSigningError(null);
    const passwordForSigning = signingPassword;
    setSigningPassword("");
    const { data: flightData, error: fetchErr } = await getSavedFlight(signingFlightId);
    if (fetchErr || !flightData) {
      setSigningError(fetchErr?.message ?? "Voo não encontrado.");
      setSigningInProgress(false);
      return;
    }

    // Safety guard — validation already ran in openSignModal
    const { meta: decodedMeta } = decodeFlightRecord(flightData.csv_text);
    if (decodedMeta) {
      const guardErrors = validateFlightForInstructorSign(decodedMeta);
      if (guardErrors.length > 0) {
        setSigningValidationErrors(guardErrors);
        setSigningInProgress(false);
        return;
      }
    }

    const { data, error } = await signFlight({
      flightId: signingFlightId,
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
    if (data) {
      setSignaturesByFlightId((prev) => ({
        ...prev,
        [signingFlightId]: {
          ...(prev[signingFlightId] ?? { student: null, admin_operator: null }),
          instructor: data,
        },
      }));
      setItems((prev) =>
        prev.map((f) =>
          f.id === signingFlightId
            ? { ...f, instructor_signed: true, instructor_signed_at: data.signed_at }
            : f,
        ),
      );
    }
    setSigningFlightId(null);
    setSigningFlightMeta(null);
    setSigningPassword("");
    setSigningValidationErrors([]);
  };

  const openSuggestion = (id: string) => {
    setSuggestionFlightId(id);
    setSuggestionDraft(infoById[id]?.instructorSuggestionMd ?? "");
    setSuggestionError(null);
  };

  const closeSuggestion = () => {
    if (suggestionSaving) return;
    setSuggestionFlightId(null);
    setSuggestionDraft("");
    setSuggestionError(null);
  };

  const saveSuggestion = async () => {
    if (!user || !suggestionFlightId) return;
    setSuggestionSaving(true);
    setSuggestionError(null);
    const { error } = await updateInstructorFlightSuggestion(suggestionFlightId, {
      actorUserId: user.id,
      suggestionMd: suggestionDraft,
    });
    setSuggestionSaving(false);
    if (error) {
      setSuggestionError(error.message);
      return;
    }
    invalidateFlightListDisplayCache([suggestionFlightId]);
    setInfoById((prev) => {
      const current = prev[suggestionFlightId];
      if (!current) return prev;
      return {
        ...prev,
        [suggestionFlightId]: {
          ...current,
          instructorSuggestionMd: suggestionDraft.trim(),
        },
      };
    });
    setRefreshKey((k) => k + 1);
    closeSuggestion();
  };

  const handleSagaSync = async () => {
    if (sagaImporting) return;
    setSagaImporting(true);
    setSyncOverlayVisible(true);
    setSyncProgress(null);
    try {
      const summary = await importSelfFlightsFromSaga({
        onProgress: (p) => setSyncProgress(p),
      });
      const novos = (summary.flightsCreated ?? 0) + (summary.flightsUpdated ?? 0);
      const removidos = summary.flightsDeleted ?? 0;
      const deletedIds = (summary.deletedFlights ?? []).map((item) => item.flightId).filter(Boolean);
      if (summary.staleCleanup) {
        console.log("[SAGA sync][InstructorFlights] cleanup", summary.staleCleanup);
      }
      showToast({
        message: [
          novos > 0
            ? `${summary.flightsCreated} voo(s) novo(s) e ${summary.flightsUpdated} atualizado(s) importados do SAGA.`
            : "Nenhum voo novo encontrado no SAGA.",
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

  const handleReloadSagaFlight = async (
    flight: SavedFlightListItem,
    options?: { lookupKey: string; missionId: string } | { skipMissionMapping: true },
  ) => {
    if (reloadingSagaFlightId) return;
    setReloadingSagaFlightId(flight.id);
    try {
      const result = await reloadSagaFlightFromSource({
        flightId: flight.id,
        sagaFlightId: flight.saga_flight_id ?? undefined,
        missionLookupKey: options && "lookupKey" in options ? options.lookupKey : undefined,
        missionId: options && "lookupKey" in options ? options.missionId : undefined,
        skipMissionMapping: options && "skipMissionMapping" in options ? true : undefined,
      });
      if (result.paused && result.pendingMission?.lookupKey) {
        const settings = await getSagaImportSettings().catch(() => null);
        setSagaMissionCatalogs(settings?.catalogs ?? { aircrafts: [], aircraftModels: [], trainingTracks: [] });
        setSagaMissionMapping(settings?.mapping ?? null);
        setSagaPendingMission(result.pendingMission);
        setSagaMissionModalFlight(flight);
        const existing = settings?.mapping?.missionBySaga?.[result.pendingMission.lookupKey] ?? "";
        setSagaMissionSelection(existing);
        showToast({
          variant: "info",
          message: "Missão SAGA sem de-para. Selecione a missão local para continuar.",
        });
        return;
      }
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

  const missionOptions = useMemo(() => {
    if (!sagaPendingMission) return [];
    if (sagaPendingMission.missionOptions?.length) return sagaPendingMission.missionOptions;
    const trackOptions = missionOptionsForTrack(sagaMissionCatalogs, sagaPendingMission.trainingTrackId);
    if (trackOptions.length > 0) return trackOptions;
    return allMissionOptions(sagaMissionCatalogs);
  }, [sagaMissionCatalogs, sagaPendingMission]);

  const closeSagaMissionModal = () => {
    if (sagaMissionConfirming) return;
    setSagaMissionModalFlight(null);
    setSagaPendingMission(null);
    setSagaMissionSelection("");
  };

  const skipSagaMissionMapping = async () => {
    const flight = sagaMissionModalFlight;
    if (!flight) return;
    setSagaMissionConfirming(true);
    try {
      await handleReloadSagaFlight(flight, { skipMissionMapping: true });
      setSagaMissionModalFlight(null);
      setSagaPendingMission(null);
      setSagaMissionSelection("");
    } finally {
      setSagaMissionConfirming(false);
    }
  };

  const confirmSagaMissionMapping = async () => {
    if (!sagaPendingMission?.lookupKey || !sagaMissionSelection || !sagaMissionModalFlight) return;
    setSagaMissionConfirming(true);
    try {
      await handleReloadSagaFlight(sagaMissionModalFlight, {
        lookupKey: sagaPendingMission.lookupKey,
        missionId: sagaMissionSelection,
      });
      setSagaMissionMapping((current) => ({
        ...(current ?? {
          aircraftBySaga: {},
          aircraftIdByRegistration: {},
          courseBySaga: {},
          missionBySaga: {},
          creditAircraftBySaga: {},
          flightColumnMap: {},
          creditColumnMap: {},
          sendFlightsToSaga: false,
          syncScheduleFromSaga: false,
          updatedAt: null,
        }),
        missionBySaga: {
          ...(current?.missionBySaga ?? {}),
          [sagaPendingMission.lookupKey]: sagaMissionSelection,
        },
      }));
      setSagaMissionModalFlight(null);
      setSagaPendingMission(null);
      setSagaMissionSelection("");
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message || "Falha ao salvar de-para da missão." });
    } finally {
      setSagaMissionConfirming(false);
    }
  };

  const handleCreated = (id: string) => {
    invalidateFlightListDisplayCache([id]);
    setRefreshKey((k) => k + 1);
    setSelectedFlightId(id);
    setView("detail");
  };

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

  if (view === "preencher-ficha" && selectedFlightId) {
    return (
      <PreencherFichaFlow
        flightId={selectedFlightId}
        onBack={() => setView("list")}
        onOpenManual={(id) => {
          setSelectedFlightId(id);
          setView("detail");
        }}
        onDone={(id) => {
          invalidateFlightListDisplayCache([id]);
          setRefreshKey((k) => k + 1);
          setSelectedFlightId(id);
          setView("detail");
        }}
      />
    );
  }

  if (view === "detail") {
    return <FlightDetailView flightId={selectedFlightId} onBack={() => setView("list")} />;
  }

  const suggestionFlight = suggestionFlightId ? items.find((item) => item.id === suggestionFlightId) : null;
  const suggestionInfo = suggestionFlightId ? infoById[suggestionFlightId] : undefined;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
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
                  displayMode === mode ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <DisplayModeIcon mode={mode} />
                {label}
              </button>
            ))}
          </div>
          {!!ADMIN_USERS_FUNCTION_ID && (
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
          <button
            type="button"
            onClick={() => setView("create")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 sm:w-auto"
          >
            + Novo voo
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por aluno, ANAC, aeronave ou nome do voo"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Data inicial"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Data final"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {err ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          {err}
        </p>
      ) : null}

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
          <p className="text-sm font-medium text-slate-400">Nenhum voo encontrado.</p>
        </div>
      ) : displayMode === "calendar" ? (
        <div className="space-y-4">
          <FlightsAgendaBoard
            items={filteredItems}
            infoById={infoById}
            clubMemberByStudentId={clubMemberByStudentId}
            onOpen={openFlight}
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
            videoFlagsById={videoFlagsById}
            variant="future"
            emptyLabel="Nenhum voo futuro."
            onOpen={openFlight}
            onDelete={(id) => void handleDelete(id)}
            onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
            reloadingSagaFlightId={reloadingSagaFlightId}
            onEditSuggestion={openSuggestion}
            onPreencherFicha={(id) => {
              setSelectedFlightId(id);
              setView("preencher-ficha");
            }}
            clubMemberByStudentId={clubMemberByStudentId}
          />
          <FlightTableSection
            title="Voos antigos"
            groups={pastGroups}
            infoById={infoById}
            videoFlagsById={videoFlagsById}
            variant="past"
            emptyLabel="Nenhum voo antigo."
            onOpen={openFlight}
            onDelete={(id) => void handleDelete(id)}
            onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
            reloadingSagaFlightId={reloadingSagaFlightId}
            onPreencherFicha={(id) => {
              const item = items.find((f) => f.id === id);
              if (item && ["Pendente", "Confirmado", "Previsto"].includes(item.flight_status)) {
                setSelectedFlightId(id);
                setView("preencher-ficha");
              }
            }}
            onExportFicha={(id) => void exportFicha(id)}
            exportingFichaId={exportingFichaId}
            signaturesByFlightId={signaturesByFlightId}
            clubMemberByStudentId={clubMemberByStudentId}
            onSign={(id) => void openSignModal(id)}
            canSignAsInstructor={(item) =>
              user?.role === "instrutor" && item.instructor_user_id === user.id
            }
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
          <section className="space-y-4">
            <SectionTitle title="Voos futuros" tone="future" />
            {futureGroups.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum voo futuro.</p>
            ) : (
              futureGroups.map((group) => (
                <div key={`future-${group.label || "all"}`}>
                  {group.label ? <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p> : null}
                  <ul className="space-y-2">
                    {group.flights.map((item) => (
                      <FlightCard
                        key={item.id}
                        item={item}
                        info={infoById[item.id]}
                        future
                        videoAttached={videoFlagsById[item.id] ?? false}
                        onOpen={() => openFlight(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                        onReloadSaga={item.saga_flight_id ? () => void handleReloadSagaFlight(item) : undefined}
                        reloadingSaga={reloadingSagaFlightId === item.id}
                        onEditSuggestion={() => openSuggestion(item.id)}
                        onPreencherFicha={
                          user?.role === "instrutor" && item.instructor_user_id === user.id
                            ? () => { setSelectedFlightId(item.id); setView("preencher-ficha"); }
                            : undefined
                        }
                        studentClubMember={item.student_user_id ? clubMemberByStudentId[item.student_user_id] : false}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

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
                    {group.flights.map((item) => (
                      <FlightCard
                        key={item.id}
                        item={item}
                        info={infoById[item.id]}
                        future={false}
                        videoAttached={videoFlagsById[item.id] ?? false}
                        onOpen={() => openFlight(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                        onReloadSaga={item.saga_flight_id ? () => void handleReloadSagaFlight(item) : undefined}
                        reloadingSaga={reloadingSagaFlightId === item.id}
                        onEditSuggestion={() => openSuggestion(item.id)}
                        onPreencherFicha={
                          ["Pendente", "Confirmado", "Previsto"].includes(item.flight_status) &&
                          user?.role === "instrutor" &&
                          item.instructor_user_id === user.id
                            ? () => { setSelectedFlightId(item.id); setView("preencher-ficha"); }
                            : undefined
                        }
                        onExportFicha={() => void exportFicha(item.id)}
                        exportingFicha={exportingFichaId === item.id}
                        sigs={signaturesByFlightId[item.id] ?? null}
                        onSign={() => void openSignModal(item.id)}
                        canSignAsInstructor={
                          user?.role === "instrutor" && item.instructor_user_id === user.id
                        }
                        studentClubMember={item.student_user_id ? clubMemberByStudentId[item.student_user_id] : false}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

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
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700/60 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assinatura eletrônica</p>
                <h3 className="text-lg font-semibold text-slate-100">Assinar como INVA</h3>
              </div>
              <button
                type="button"
                onClick={() => { setSigningFlightId(null); setSigningFlightMeta(null); setSigningError(null); setSigningValidationErrors([]); setSigningPassword(""); }}
                disabled={signingInProgress}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {(() => {
                const f = items.find((x) => x.id === signingFlightId);
                const i = signingFlightId ? infoById[signingFlightId] : undefined;
                return f ? (
                  <div className="grid gap-x-4 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3 text-xs text-slate-400 sm:grid-cols-2">
                    <p>Data: <span className="text-slate-300">{formatDate(f, i)}</span></p>
                    <p>Aeronave: <span className="text-slate-300">{i?.aircraft ?? f.aircraft_ident ?? "—"}</span></p>
                    <p>Aluno: <span className="text-slate-300">{i?.studentName ?? "—"}</span></p>
                    <p>Total de voo: <span className="text-slate-300">{i?.totalFlight ?? "—"}</span></p>
                    <p>Pousos: <span className="text-slate-300">{i?.landings ?? "—"}</span></p>
                    <p>Rota: <span className="text-slate-300">{i?.fromTo ?? "—"}</span></p>
                  </div>
                ) : null;
              })()}

              {signingFlightMetaLoading && (
                <div className="h-24 animate-pulse rounded-lg bg-slate-800/40" />
              )}

              {signingFlightMeta && signingFlightMeta.legs.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Pernas</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-950/25">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-1.5 text-left font-semibold">Dep.</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Arr.</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Pousos</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Tempo voo</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Nav.</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Noturno</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {signingFlightMeta.legs.map((leg) => (
                          <tr key={leg.id} className="text-slate-300">
                            <td className="px-3 py-1.5">{leg.dep || "—"}</td>
                            <td className="px-3 py-1.5">{leg.arr || "—"}</td>
                            <td className="px-3 py-1.5">{leg.landings}</td>
                            <td className="px-3 py-1.5">{leg.flightTime || "—"}</td>
                            <td className="px-3 py-1.5">{leg.navTime || "—"}</td>
                            <td className="px-3 py-1.5">{leg.nightTime || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      {signingFlightMeta.legs.length > 1 && (() => {
                        const totalLandings = signingFlightMeta.legs.reduce((s, l) => s + (l.landings || 0), 0);
                        return (
                          <tfoot>
                            <tr className="border-t border-slate-700/60 font-semibold text-slate-300">
                              <td className="px-3 py-1.5 text-slate-500" colSpan={2}>Total</td>
                              <td className="px-3 py-1.5">{totalLandings}</td>
                              <td className="px-3 py-1.5">{infoById[signingFlightId!]?.totalFlight ?? "—"}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                </div>
              )}

              {signingValidationErrors.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-red-300">Corrija os itens abaixo antes de assinar:</p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-red-200">
                    {signingValidationErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                Ao assinar, a ficha deste voo ficará <strong>bloqueada para edição</strong>. Esta ação não pode ser desfeita.
              </p>
              <label className="block">
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
            </div>

            <div className="shrink-0 border-t border-slate-700/60 px-5 py-3">

            {signingError ? (
              <p className="mb-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                {signingError}
              </p>
            ) : null}

            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => { setSigningFlightId(null); setSigningFlightMeta(null); setSigningError(null); setSigningValidationErrors([]); setSigningPassword(""); }}
                disabled={signingInProgress}
                className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSign()}
                disabled={signingInProgress || signingValidationErrors.length > 0 || !signingPassword}
                className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 sm:w-auto"
              >
                {signingInProgress ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {suggestionFlight && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Voo futuro</p>
                <h3 className="text-lg font-semibold text-slate-100">Sugestão do INVA</h3>
              </div>
              <button
                type="button"
                onClick={closeSuggestion}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <div className="mb-4 grid gap-x-4 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3 text-xs text-slate-400 sm:grid-cols-2 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
              <p>Data: <span className="text-slate-300">{formatDate(suggestionFlight, suggestionInfo)}</span></p>
              <p>Matrícula: <span className="text-slate-300">{suggestionInfo?.aircraft ?? suggestionFlight.aircraft_ident ?? "—"}</span></p>
              <p>Início: <span className="text-slate-300">{suggestionInfo?.startTime || "—"}</span></p>
              <p>Aluno: <span className="text-slate-300">{suggestionInfo?.studentName || "—"}</span></p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Sugestao do aluno</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-300 [overflow-wrap:anywhere]">
                {suggestionInfo?.studentSuggestionMd || "Sem sugestão registrada."}
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Sugestão do INVA
              </span>
              <textarea
                value={suggestionDraft}
                onChange={(e) => setSuggestionDraft(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="Escreva a sugestão para este voo..."
              />
            </label>

            {suggestionError ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                {suggestionError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={closeSuggestion}
                disabled={suggestionSaving}
                className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveSuggestion()}
                disabled={suggestionSaving}
                className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 sm:w-auto"
              >
                {suggestionSaving ? "Salvando..." : "Salvar sugestão"}
              </button>
            </div>
          </div>
        </div>
      )}
      {sagaPendingMission && sagaMissionModalFlight ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">De-para de missão</p>
                <h3 className="text-lg font-semibold text-slate-100">Missão SAGA sem correspondência</h3>
              </div>
              <button
                type="button"
                onClick={closeSagaMissionModal}
                disabled={sagaMissionConfirming}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <p className="text-sm text-slate-400">
              O voo <span className="font-mono text-slate-200">{sagaPendingMission.sagaFlightId}</span> trouxe a missão{" "}
              <span className="font-semibold text-amber-100">{sagaPendingMission.rawMission || sagaPendingMission.lookupKey}</span> no curso{" "}
              <span className="text-slate-200">{sagaPendingMission.trackName}</span>.
            </p>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
              <p>Aluno: {sagaPendingMission.studentName || "—"}</p>
              <p>Data: {sagaPendingMission.flightDate || "—"}</p>
              {sagaPendingMission.missionCode ? <p>Código normalizado: {sagaPendingMission.missionCode}</p> : null}
            </div>
            <label className="mt-4 block text-sm text-slate-300">
              Missão local
              <select
                value={sagaMissionSelection}
                onChange={(event) => setSagaMissionSelection(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
              >
                <option value="">Selecione a missão</option>
                {missionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {missionOptions.length === 0 ? (
              <p className="mt-2 text-xs text-amber-300">
                Não foi possível listar as missões desta trilha aqui. Você ainda pode atualizar o voo sem alterar a missão.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeSagaMissionModal}
                disabled={sagaMissionConfirming}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void skipSagaMissionMapping()}
                disabled={sagaMissionConfirming}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                {sagaMissionConfirming ? "Atualizando..." : "Atualizar sem missão"}
              </button>
              <button
                type="button"
                onClick={() => void confirmSagaMissionMapping()}
                disabled={!sagaMissionSelection || sagaMissionConfirming}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {sagaMissionConfirming ? "Salvando..." : "Salvar de-para e continuar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
        <span className="text-xs text-slate-500">
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
  videoFlagsById,
  variant,
  emptyLabel,
  onOpen,
  onDelete,
  onReloadSaga,
  reloadingSagaFlightId,
  onEditSuggestion,
  onPreencherFicha,
  onExportFicha,
  exportingFichaId,
  signaturesByFlightId,
  clubMemberByStudentId,
  onSign,
  canSignAsInstructor,
}: {
  title: string;
  groups: { label: string; flights: SavedFlightListItem[] }[];
  infoById: Record<string, FlightDisplayInfo>;
  videoFlagsById: Record<string, boolean>;
  variant: "future" | "past";
  emptyLabel: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onReloadSaga?: (flight: SavedFlightListItem) => void;
  reloadingSagaFlightId?: string | null;
  onEditSuggestion?: (id: string) => void;
  onPreencherFicha?: (id: string) => void;
  onExportFicha?: (id: string) => void;
  exportingFichaId?: string | null;
  signaturesByFlightId?: Record<string, FlightSignaturesForFlight>;
  clubMemberByStudentId?: Record<string, boolean>;
  onSign?: (id: string) => void;
  canSignAsInstructor?: (item: SavedFlightListItem) => boolean;
}) {
  const isFutureSection = variant === "future";
  return (
    <section className="space-y-3">
      <SectionTitle title={title} tone={title.toLowerCase().includes("futuro") ? "future" : "past"} />
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        groups.map((group) => (
          <div key={`${title}-${group.label}`} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
            {group.label ? <div className="border-b border-slate-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </div> : null}
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Início</th>
                    <th className="w-36 max-w-36 px-3 py-2 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">ANAC</th>
                    <th className="px-3 py-2 font-semibold">Matrícula</th>
                    <th className="px-3 py-2 font-semibold">Missão</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Duração</th>
                    {isFutureSection ? (
                      <>
                        <th className="px-3 py-2 font-semibold">Sugestão INVA</th>
                        <th className="px-3 py-2 font-semibold">Sugestão aluno</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 font-semibold">Rota</th>
                        <th className="px-3 py-2 font-semibold">Pousos</th>
                        <th className="px-3 py-2 font-semibold">Telemetria</th>
                        <th className="px-3 py-2 font-semibold">Vídeo</th>
                      </>
                    )}
                    {!isFutureSection ? <th className="px-3 py-2 font-semibold">Assinaturas</th> : null}
                    <th className="px-3 py-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {group.flights.map((item) => {
                    const info = infoById[item.id];
                    const sigs = signaturesByFlightId?.[item.id] ?? null;
                    return (
                      <tr
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpen(item.id);
                          }
                        }}
                        className="cursor-pointer text-slate-300 transition hover:bg-slate-800/50"
                      >
                        <td className="px-3 py-2 text-slate-200">{formatDate(item, info)}</td>
                        <td className="px-3 py-2">{info?.startTime || "—"}</td>
                        <td className="w-36 max-w-36 px-3 py-2">
                          <span className="inline-flex min-w-0 items-start gap-1">
                            <span className="whitespace-normal break-words leading-4">{info?.studentName ?? "—"}</span>
                            {item.student_user_id && clubMemberByStudentId?.[item.student_user_id] ? <FlightReviewClubBadge /> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2">{info?.studentAnac ?? "—"}</td>
                        <td className="px-3 py-2">{info?.aircraft ?? item.aircraft_ident ?? "—"}</td>
                        <td className="max-w-56 px-3 py-2">
                          <span className="line-clamp-2 break-words text-slate-300">{missionLabel(info)}</span>
                        </td>
                        <td className="px-3 py-2"><FlightStatusBadge status={item.flight_status} /></td>
                        <td className="px-3 py-2">{formatDecimalHours(info?.totalFlightMinutes)}</td>
                        {isFutureSection ? (
                          <>
                            <td className={`px-3 py-2 ${statusClass(Boolean(info?.instructorSuggestionMd))}`}>
                              {info?.instructorSuggestionMd ? "Preenchida" : "Pendente"}
                            </td>
                            <td className={`px-3 py-2 ${statusClass(Boolean(info?.studentSuggestionMd))}`}>
                              {info?.studentSuggestionMd ? "Preenchida" : "Pendente"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{info?.fromTo ?? "—"}</td>
                            <td className={`px-3 py-2 ${landingCountClass(info)}`}>{info?.landings ?? 0}</td>
                            <td className={`px-3 py-2 ${statusClass(Boolean(info?.telemetryOk))}`}>{statusLabel(Boolean(info?.telemetryOk))}</td>
                            <td className={`px-3 py-2 ${statusClass(videoFlagsById[item.id] ?? false)}`}>
                              {statusLabel(videoFlagsById[item.id] ?? false)}
                            </td>
                          </>
                        )}
                        {!isFutureSection ? (
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <SigBadge signed={Boolean(sigs?.student)} label="Aluno" />
                              <SigBadge signed={Boolean(sigs?.instructor)} label="INVA" />
                              <SigBadge signed={Boolean(sigs?.admin_operator)} label="Oper." />
                            </div>
                          </td>
                        ) : null}
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {onPreencherFicha && (isFutureSection || ["Pendente", "Confirmado", "Previsto"].includes(item.flight_status)) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreencherFicha(item.id);
                                }}
                                className="inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-600/40 bg-emerald-900/20 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40"
                              >
                                Preencher Ficha
                              </button>
                            ) : null}
                            {isFutureSection && onEditSuggestion ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditSuggestion(item.id);
                                }}
                                className="text-sky-300 underline-offset-4 hover:underline"
                              >
                                Sugestão
                              </button>
                            ) : null}
                            {!isFutureSection && onExportFicha ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onExportFicha(item.id);
                                }}
                                disabled={exportingFichaId === item.id}
                                className="inline-flex items-center gap-1.5 rounded border border-sky-600/40 bg-sky-600/10 px-2 py-1 text-xs font-semibold text-sky-400 hover:bg-sky-600/20 disabled:cursor-wait disabled:opacity-70"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                  <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                  <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                </svg>
                                {exportingFichaId === item.id ? "Gerando..." : "Ficha"}
                              </button>
                            ) : null}
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
                            {!isFutureSection && onSign && canSignAsInstructor?.(item) && !sigs?.instructor ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSign(item.id);
                                }}
                                className="inline-flex items-center gap-1 rounded border border-violet-600/40 bg-violet-900/30 px-2 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-900/50"
                              >
                                Assinar INVA
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                              }}
                              disabled={Boolean(item.instructor_signed && !item.saga_flight_id)}
                              className="text-red-400/80 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Apagar
                            </button>
                          </div>
                        </td>
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
