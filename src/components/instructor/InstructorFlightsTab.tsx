import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  buildFlightDisplayInfo,
  formatMinutes,
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
import { getProfile } from "../../lib/rbac";
import { FlightDetailView } from "../FlightDetailView";
import { FlightsAgendaBoard } from "../FlightsAgendaBoard";
import { NovoVooFlow } from "../NovoVooFlow";

type View = "list" | "detail" | "create";
type DisplayMode = "cards" | "calendar" | "table";

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

function groupByMonth(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightDisplayInfo>,
  direction: "asc" | "desc",
): { label: string; flights: SavedFlightListItem[] }[] {
  const map = new Map<string, SavedFlightListItem[]>();
  const ordered = [...items].sort((a, b) => {
    const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
    return direction === "asc" ? diff : -diff;
  });
  for (const item of ordered) {
    const d = getDateBase(item, infoById[item.id]);
    const key = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    if (!map.has(capitalized)) map.set(capitalized, []);
    map.get(capitalized)!.push(item);
  }
  return Array.from(map.entries()).map(([label, flights]) => ({ label, flights }));
}

function formatDate(item: SavedFlightListItem, info?: FlightDisplayInfo): string {
  const iso = info?.flightDateIso ?? item.created_at.slice(0, 10);
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function FlightCard({
  item,
  info,
  future,
  onOpen,
  onDelete,
  onEditSuggestion,
}: {
  item: SavedFlightListItem;
  info?: FlightDisplayInfo;
  future: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onEditSuggestion: () => void;
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
            {future ? (
              <span className="shrink-0 rounded border border-violet-600/40 bg-violet-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                Futuro
              </span>
            ) : null}
          </div>

          <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
            <p>Data: <span className="text-slate-300">{formatDate(item, info)}</span></p>
            <p>Início: <span className="text-slate-300">{info?.startTime || "—"}</span></p>
            <p>Aluno: <span className="text-slate-300">{info?.studentName ?? "—"}</span></p>
            <p>ANAC aluno: <span className="text-slate-300">{info?.studentAnac ?? "—"}</span></p>
            <p>Matrícula: <span className="text-slate-300">{info?.aircraft ?? "—"}</span></p>
            <p>From-To: <span className="text-slate-300">{info?.fromTo ?? "—"}</span></p>
            <p>Pousos: <span className="text-slate-300">{info?.landings ?? 0}</span></p>
            <p>Total voo: <span className="text-slate-300">{info?.totalFlight ?? "00:00"}</span></p>
            <p className="sm:col-span-2 lg:col-span-4">
              Sugestão INVA:{" "}
              <span className={info?.instructorSuggestionMd ? "text-emerald-300" : "text-amber-300"}>
                {info?.instructorSuggestionMd ? "preenchida" : "pendente"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-left text-xs text-red-400/80 underline-offset-4 hover:underline sm:text-right"
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
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>();
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [infoById, setInfoById] = useState<Record<string, FlightDisplayInfo>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cards");
  const [suggestionFlightId, setSuggestionFlightId] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

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
  }, [configured, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setInfoById({});
    if (items.length === 0) return;
    void (async () => {
      const pairs = await Promise.all(
        items.map(async (item) => {
          const [saved, studentRes, instructorRes] = await Promise.all([
            getSavedFlight(item.id),
            item.student_user_id ? getProfile(item.student_user_id) : Promise.resolve({ data: null, error: null }),
            item.instructor_user_id ? getProfile(item.instructor_user_id) : Promise.resolve({ data: null, error: null }),
          ]);
          const info = buildFlightDisplayInfo(item, saved.data?.csv_text ?? null, {
            studentName: studentRes.data?.fullName,
            studentAnac: studentRes.data?.anacCode,
            instructorName: instructorRes.data?.fullName,
            instructorAnac: instructorRes.data?.anacCode,
          });
          return [item.id, info] as const;
        }),
      );
      if (!cancelled) setInfoById(Object.fromEntries(pairs));
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const info = infoById[item.id];
      return (
        (info?.studentName ?? "").toLowerCase().includes(q) ||
        (info?.studentAnac ?? "").toLowerCase().includes(q) ||
        (info?.aircraft ?? "").toLowerCase().includes(q)
      );
    });
  }, [infoById, items, search]);

  const futureItems = useMemo(
    () => filteredItems.filter((item) => isFutureFlight(item, infoById[item.id])),
    [filteredItems, infoById],
  );
  const pastItems = useMemo(
    () => filteredItems.filter((item) => !isFutureFlight(item, infoById[item.id])),
    [filteredItems, infoById],
  );
  const futureGroups = useMemo(() => groupByMonth(futureItems, infoById, "asc"), [futureItems, infoById]);
  const pastGroups = useMemo(() => groupByMonth(pastItems, infoById, "desc"), [pastItems, infoById]);
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

  const openFlight = (id: string) => {
    setSelectedFlightId(id);
    setView("detail");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Apagar este voo da nuvem?")) return;
    const { error } = await deleteSavedFlight(id);
    if (error) {
      setErr(error.message);
      return;
    }
    setRefreshKey((k) => k + 1);
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

  const handleCreated = (id: string) => {
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

  if (view === "detail") {
    return <FlightDetailView flightId={selectedFlightId} onBack={() => setView("list")} />;
  }

  const suggestionFlight = suggestionFlightId ? items.find((item) => item.id === suggestionFlightId) : null;
  const suggestionInfo = suggestionFlightId ? infoById[suggestionFlightId] : undefined;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-100">Meus voos</h2>
          <p className="text-xs text-slate-500">Voos atribuídos ao seu usuário de instrutor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={() => setView("create")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 sm:w-auto"
          >
            + Novo voo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Voos" value={String(consolidatedSummary.flights)} />
        <SummaryCard label="Horas" value={formatMinutes(consolidatedSummary.minutes)} />
        <SummaryCard label="Pousos" value={String(consolidatedSummary.landings)} />
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por aluno, ANAC, aeronave ou nome do voo"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {err ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          {err}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Carregando...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-10 text-center">
          <p className="text-sm font-medium text-slate-400">Nenhum voo encontrado.</p>
        </div>
      ) : displayMode === "calendar" ? (
        <div className="space-y-4">
          <FlightsAgendaBoard items={filteredItems} infoById={infoById} onOpen={openFlight} />
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
            onOpen={openFlight}
            onDelete={(id) => void handleDelete(id)}
            onEditSuggestion={openSuggestion}
          />
          <FlightTableSection
            title="Voos antigos"
            groups={pastGroups}
            infoById={infoById}
            emptyLabel="Nenhum voo antigo."
            onOpen={openFlight}
            onDelete={(id) => void handleDelete(id)}
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
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Voos futuros</p>
            {futureGroups.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum voo futuro.</p>
            ) : (
              futureGroups.map((group) => (
                <div key={`future-${group.label}`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
                  <ul className="space-y-2">
                    {group.flights.map((item) => (
                      <FlightCard
                        key={item.id}
                        item={item}
                        info={infoById[item.id]}
                        future
                        onOpen={() => openFlight(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                        onEditSuggestion={() => openSuggestion(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <p className="border-t border-slate-700/60 pt-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Voos antigos
            </p>
            {pastGroups.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum voo antigo.</p>
            ) : (
              pastGroups.map((group) => (
                <div key={`past-${group.label}`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
                  <ul className="space-y-2">
                    {group.flights.map((item) => (
                      <FlightCard
                        key={item.id}
                        item={item}
                        info={infoById[item.id]}
                        future={false}
                        onOpen={() => openFlight(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                        onEditSuggestion={() => openSuggestion(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-slate-500 underline-offset-4 hover:underline"
          >
            Atualizar lista
          </button>
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

function FlightTableSection({
  title,
  groups,
  infoById,
  emptyLabel,
  onOpen,
  onDelete,
  onEditSuggestion,
}: {
  title: string;
  groups: { label: string; flights: SavedFlightListItem[] }[];
  infoById: Record<string, FlightDisplayInfo>;
  emptyLabel: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onEditSuggestion?: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        groups.map((group) => (
          <div key={`${title}-${group.label}`} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
            <div className="border-b border-slate-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Início</th>
                    <th className="px-3 py-2 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">ANAC</th>
                    <th className="px-3 py-2 font-semibold">Matrícula</th>
                    <th className="px-3 py-2 font-semibold">Rota</th>
                    <th className="px-3 py-2 font-semibold">Horas</th>
                    <th className="px-3 py-2 font-semibold">Pousos</th>
                    <th className="px-3 py-2 font-semibold">Sugestão</th>
                    <th className="px-3 py-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {group.flights.map((item) => {
                    const info = infoById[item.id];
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
                        <td className="px-3 py-2">{info?.studentName ?? "—"}</td>
                        <td className="px-3 py-2">{info?.studentAnac ?? "—"}</td>
                        <td className="px-3 py-2">{info?.aircraft ?? item.aircraft_ident ?? "—"}</td>
                        <td className="px-3 py-2">{info?.fromTo ?? "—"}</td>
                        <td className="px-3 py-2">{info?.totalFlight ?? "00:00"}</td>
                        <td className="px-3 py-2">{info?.landings ?? 0}</td>
                        <td className="px-3 py-2">
                          <span className={info?.instructorSuggestionMd ? "text-emerald-300" : "text-amber-300"}>
                            {info?.instructorSuggestionMd ? "Preenchida" : "Pendente"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {onEditSuggestion ? (
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
