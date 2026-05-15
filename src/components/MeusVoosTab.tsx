import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { SCHOOL_ID } from "../lib/appwrite";
import { listAircrafts } from "../lib/aircraftDb";
import {
  formatMinutes,
  getDateBase,
  getFlightDateTimeMs,
  isFutureFlight,
  type FlightDisplayInfo,
} from "../lib/flightDisplay";
import {
  deleteSavedFlight,
  getSavedFlight,
  listSavedFlights,
  updateStudentFlightSuggestion,
  type SavedFlightListItem,
} from "../lib/flightsDb";
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

function yesNoTag(ok: boolean, yes: string, no: string): string {
  return ok ? yes : no;
}

const AIRCRAFT_COLORS = [
  "bg-sky-900/60 text-sky-200 border-sky-600/50",
  "bg-violet-900/60 text-violet-200 border-violet-600/50",
  "bg-emerald-900/60 text-emerald-200 border-emerald-600/50",
  "bg-amber-900/60 text-amber-200 border-amber-600/50",
  "bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-600/50",
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
      {ok ? <span className="rounded bg-emerald-900/40 px-2 py-1 text-[11px] font-semibold text-emerald-200">OK</span> : null}
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
    return <span className="rounded bg-amber-900/40 px-2 py-1 text-[11px] font-semibold text-amber-200">Pendente</span>;
  }
  return <span className="text-xs text-emerald-200">OK - {text}</span>;
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
      const aFuture = isFutureFlight(a, infoById[a.id]);
      const bFuture = isFutureFlight(b, infoById[b.id]);
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 ${iconOnly ? "p-2" : "px-3 py-2"} text-xs font-semibold text-pink-100 transition hover:border-pink-400/60 hover:bg-pink-500/20 ${className}`}
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
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>(undefined);
  const [detailOpenOptions, setDetailOpenOptions] = useState<DetailOpenOptions>({});
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
  const [studentSuggestionDraft, setStudentSuggestionDraft] = useState("");
  const [studentSuggestionSaving, setStudentSuggestionSaving] = useState(false);
  const [studentSuggestionError, setStudentSuggestionError] = useState<string | null>(null);
  const canManageFlights = user?.role === "instrutor" || user?.role === "admin";
  const isStudentView = user?.role === "aluno";

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error } = await listSavedFlights({ userId: user.id, role: user.role });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(data ?? []);
  }, [user, configured]);

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

  const groups = useMemo(() => groupFlights(filteredItems, infoById), [filteredItems, infoById]);
  const futureGroups = useMemo(() => {
    const future = filteredItems.filter((item) => isFutureFlight(item, infoById[item.id]));
    return groupFlights(future, infoById, "desc");
  }, [filteredItems, infoById]);
  const pastGroups = useMemo(() => {
    const past = filteredItems.filter((item) => !isFutureFlight(item, infoById[item.id]));
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
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="text-lg font-semibold text-slate-100">
          {canManageFlights ? "Voos dos alunos" : "Meus voos"}
        </h2>
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
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
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
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-slate-500 underline-offset-4 hover:underline"
          >
            Atualizar lista
          </button>
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
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-slate-500 underline-offset-4 hover:underline"
          >
            Atualizar lista
          </button>
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
                  const dateLabel = info?.flightDateIso
                    ? new Date(`${info.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR")
                    : d.toLocaleDateString("pt-BR");
                  const isPastFlight = !isFutureFlight(f, info);
                  if (isStudentView) {
                    return (
                      <li
                        key={f.id}
                        className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div className="flex w-10 shrink-0 flex-col items-center text-center">
                            <span className="text-xl font-bold leading-none text-sky-400">{day}</span>
                            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{mon}</span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-3">
                            {!info ? (
                              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {Array.from({ length: 5 }).map((_, j) => (
                                  <Skeleton key={j} className="h-3 w-full" />
                                ))}
                              </div>
                            ) : (
                            <div className="grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
                              <p>Data: <span className="text-slate-300">{dateLabel}</span></p>
                              <p>Matrícula: <span className="text-slate-300">{info.aircraft ?? f.aircraft_ident ?? "—"}</span></p>
                              <p>Início: <span className="text-slate-300">{info.startTime || "—"}</span></p>
                              <p>Fim: <span className="text-slate-300">{info.endTime || "—"}</span></p>
                              <p className="sm:col-span-2">Instrutor: <span className="text-slate-300">{info.instructorName || "—"}</span></p>
                            </div>
                            )}
                            <div className="grid gap-3 text-xs md:grid-cols-2">
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-3">
                                <p className="mb-1 font-semibold uppercase tracking-wider text-slate-500">Sugestão do INVA</p>
                                <p className="whitespace-pre-wrap break-words text-slate-300 [overflow-wrap:anywhere]">{info?.instructorSuggestionMd || "Sem sugestão registrada."}</p>
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-3">
                                <p className="mb-1 font-semibold uppercase tracking-wider text-slate-500">Peso e Balanceamento</p>
                                <FutureWeightBalanceCta
                                  ok={Boolean(info?.weightBalanceFilled)}
                                  onClick={() => openFutureWeightBalance(f.id)}
                                />
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-3">
                                <p className="mb-1 font-semibold uppercase tracking-wider text-slate-500">Sugestão do aluno</p>
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
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="flex w-10 shrink-0 flex-col items-center text-center">
                          <span className="text-xl font-bold leading-none text-sky-400">{day}</span>
                          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{mon}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${aircraftColor(info?.aircraft ?? f.aircraft_ident ?? "")}`}>
                              {info?.aircraft ?? f.aircraft_ident ?? "—"}
                            </span>
                          </div>

                          {!info ? (
                            <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
                              {Array.from({ length: 8 }).map((_, j) => (
                                <Skeleton key={j} className="h-3 w-full" />
                              ))}
                            </div>
                          ) : (
                          <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
                            <p>Data: <span className="text-slate-300">{dateLabel}</span></p>
                            <p>Início: <span className="text-slate-300">{info.startTime || "—"}</span></p>
                            <p>Aluno: <span className="text-slate-300">{info.studentName ?? "—"}</span></p>
                            <p>ANAC aluno: <span className="text-slate-300">{info.studentAnac ?? "—"}</span></p>
                            <p>Matrícula: <span className="text-slate-300">{info.aircraft ?? "—"}</span></p>
                            <p>From-To: <span className="text-slate-300">{info.fromTo ?? "—"}</span></p>
                            <p>Pousos: <span className="text-slate-300">{info.landings ?? 0}</span></p>
                            <p>Total voo: <span className="text-slate-300">{info.totalFlight ?? "00:00"}</span></p>
                            <p>Total milhas: <span className="text-slate-300">{info.totalMiles ?? "0.0"}</span></p>
                            <p>Instrutor: <span className="text-slate-300">{info.instructorName ?? ""}</span></p>
                            <p>ANAC instrutor: <span className="text-slate-300">{info.instructorAnac ?? ""}</span></p>
                            <p className="sm:col-span-2 lg:col-span-2">
                              Status:{" "}
                              {isPastFlight ? (
                                <>
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${info.telemetryOk ? "bg-emerald-900/40 text-emerald-200" : "bg-red-900/40 text-red-200"}`}>
                                    {yesNoTag(Boolean(info.telemetryOk), "telemetria ok", "telemetria ausente")}
                                  </span>
                                  {" "}
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${info.videoOk ? "bg-emerald-900/40 text-emerald-200" : "bg-red-900/40 text-red-200"}`}>
                                    {yesNoTag(Boolean(info.videoOk), "video ok", "video ausente")}
                                  </span>
                                </>
                              ) : (
                                <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">agendado</span>
                              )}
                            </p>
                          </div>
                          )}
                        </div>

                        {(isPastFlight || canManageFlights) && (
                          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                            {isPastFlight ? (
                              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
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
                                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                >
                                  Detalhes
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportFicha(f.id);
                                  }}
                                  disabled={exportingFichaId === f.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-600/20"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                    <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                  </svg>
                                  {exportingFichaId === f.id ? "Gerando..." : "Ficha"}
                                </button>
                              </div>
                            ) : null}
                            {canManageFlights && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDelete(f.id);
                                }}
                                className="w-full text-left text-sm text-red-400/80 underline-offset-4 hover:underline sm:w-auto sm:text-right"
                              >
                                Apagar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
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
                        const dateLabel = info?.flightDateIso
                          ? new Date(`${info.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR")
                          : d.toLocaleDateString("pt-BR");
                        return (
                          <li
                            key={f.id}
                            className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                              <div className="flex w-10 shrink-0 flex-col items-center text-center">
                                <span className="text-xl font-bold leading-none text-sky-400">{day}</span>
                                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{mon}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${aircraftColor(info?.aircraft ?? f.aircraft_ident ?? "")}`}>
                                    {info?.aircraft ?? f.aircraft_ident ?? "—"}
                                  </span>
                                </div>
                                <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
                                  <p>Data: <span className="text-slate-300">{dateLabel}</span></p>
                                  <p>Início: <span className="text-slate-300">{info?.startTime || "—"}</span></p>
                                  <p>Aluno: <span className="text-slate-300">{info?.studentName ?? "—"}</span></p>
                                  <p>ANAC aluno: <span className="text-slate-300">{info?.studentAnac ?? "—"}</span></p>
                                  <p>Matrícula: <span className="text-slate-300">{info?.aircraft ?? "—"}</span></p>
                                  <p>From-To: <span className="text-slate-300">{info?.fromTo ?? "—"}</span></p>
                                  <p>Pousos: <span className="text-slate-300">{info?.landings ?? 0}</span></p>
                                  <p>Total voo: <span className="text-slate-300">{info?.totalFlight ?? "00:00"}</span></p>
                                  <p>Total milhas: <span className="text-slate-300">{info?.totalMiles ?? "0.0"}</span></p>
                                  <p>Instrutor: <span className="text-slate-300">{info?.instructorName ?? ""}</span></p>
                                  <p>ANAC instrutor: <span className="text-slate-300">{info?.instructorAnac ?? ""}</span></p>
                                </div>
                              </div>
                              <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
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
                                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                >
                                  Detalhes
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportFicha(f.id);
                                  }}
                                  disabled={exportingFichaId === f.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-600/20"
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
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-slate-500 underline-offset-4 hover:underline"
          >
            Atualizar lista
          </button>
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
              <p className="sm:col-span-2">Instrutor: <span className="text-slate-300">{studentSuggestionInfo?.instructorName || "—"}</span></p>
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
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
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
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Fim</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Rota</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Horas</th> : null}
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
                    const isFuture = isFutureFlight(item, info);
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
                        <td className="px-3 py-2">{info?.studentName ?? "—"}</td>
                        <td className="px-3 py-2">{info?.instructorName || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-0.5 ${aircraftColor(info?.aircraft ?? item.aircraft_ident ?? "")}`}>
                            {info?.aircraft ?? item.aircraft_ident ?? "—"}
                          </span>
                        </td>
                        {showStudentPending ? <td className="px-3 py-2">{info?.endTime || "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.fromTo ?? "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.totalFlight ?? "00:00"}</td> : null}
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
                          {isFuture ? (
                            <span className="text-sky-300">Agendado</span>
                          ) : (
                            <span className={info?.telemetryOk ? "text-emerald-300" : "text-amber-300"}>
                              {info?.telemetryOk ? "Telemetria ok" : "Sem telemetria"}
                            </span>
                          )}
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
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onExportFicha?.(item.id);
                                    }}
                                    disabled={exportingFichaId === item.id}
                                    className="inline-flex items-center gap-1.5 rounded border border-sky-600/40 bg-sky-600/10 px-2 py-1 text-xs text-sky-200 hover:bg-sky-600/20"
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
