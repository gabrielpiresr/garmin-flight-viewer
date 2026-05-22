import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { reopenAdminFlightForEdit } from "../../lib/adminUsersDb";
import {
  getFlightDateTimeMs,
  isFutureFlight,
  type FlightDisplayInfo,
} from "../../lib/flightDisplay";
import {
  listSavedFlights,
  type FlightStatus,
  type SavedFlightListItem,
} from "../../lib/flightsDb";
import {
  listSignaturesForFlights,
  type FlightSignaturesForFlight,
} from "../../lib/flightSignaturesDb";
import {
  buildBasicFlightListDisplayInfo,
  invalidateFlightListDisplayCache,
  loadFullFlightListDisplayInfos,
  loadLightFlightListDisplayInfos,
} from "../../lib/flightListDisplayCache";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";

type View = "list" | "detail";
type DisplayMode = "table" | "cards";
type SignatureFilter = "all" | "signed" | "pending";

const PAGE_SIZE = 50;
const FULL_INFO_PRELOAD_LIMIT = 24;

function isScheduledFlight(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  return item.flight_status === "Previsto" && isFutureFlight(item, info);
}

function formatDate(item: SavedFlightListItem, info?: FlightDisplayInfo): string {
  const iso = info?.flightDateIso ?? item.flight_date ?? item.created_at.slice(0, 10);
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

function formatHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-";
  return `${(minutes / 60).toFixed(1)}h`;
}

function statusBadge(status: FlightStatus): string {
  if (status === "Realizado") return "border-emerald-500/40 bg-emerald-900/30 text-emerald-300";
  if (status === "Cancelado") return "border-red-500/40 bg-red-950/30 text-red-300";
  return "border-sky-500/40 bg-sky-900/30 text-sky-300";
}

function signatureCount(sigs?: FlightSignaturesForFlight): number {
  return Number(Boolean(sigs?.student)) + Number(Boolean(sigs?.instructor)) + Number(Boolean(sigs?.admin_operator));
}

function SigBadge({ label, signed }: { label: string; signed: boolean }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
      signed ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-300" : "border-slate-700 bg-slate-800/50 text-slate-500"
    }`}>
      {signed ? "OK" : "--"} {label}
    </span>
  );
}

function FlightSignatures({ sigs }: { sigs?: FlightSignaturesForFlight }) {
  return (
    <div className="flex flex-wrap gap-1">
      <SigBadge label="Aluno" signed={Boolean(sigs?.student)} />
      <SigBadge label="INVA" signed={Boolean(sigs?.instructor)} />
      <SigBadge label="Oper." signed={Boolean(sigs?.admin_operator)} />
    </div>
  );
}

function selectPreloadItems(items: SavedFlightListItem[], infoById: Record<string, FlightDisplayInfo>): SavedFlightListItem[] {
  return [...items]
    .sort((a, b) => {
      const aFuture = isScheduledFlight(a, infoById[a.id]);
      const bFuture = isScheduledFlight(b, infoById[b.id]);
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
      return aFuture ? diff : -diff;
    })
    .slice(0, FULL_INFO_PRELOAD_LIMIT);
}

export function AdminAllFlightsTab() {
  const { user, configured } = useAuth();
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>();
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [infoById, setInfoById] = useState<Record<string, FlightDisplayInfo>>({});
  const [signaturesByFlightId, setSignaturesByFlightId] = useState<Record<string, FlightSignaturesForFlight>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalFlights, setTotalFlights] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlightStatus | "all">("all");
  const [signatureFilter, setSignatureFilter] = useState<SignatureFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reopenFlightId, setReopenFlightId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      setNextCursor(null);
      setTotalFlights(0);
      return;
    }
    setLoading(true);
    setErr(null);
    const page = await listSavedFlights({ userId: user.id, role: "admin" }, { limit: PAGE_SIZE });
    setLoading(false);
    if (page.error) {
      setErr(page.error.message);
      return;
    }
    setItems(page.data ?? []);
    setNextCursor(page.nextCursor);
    setTotalFlights(page.total);
  }, [configured, user]);

  const loadMore = useCallback(async () => {
    if (!user || !configured || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const page = await listSavedFlights({ userId: user.id, role: "admin" }, { limit: PAGE_SIZE, cursor: nextCursor });
    setLoadingMore(false);
    if (page.error) {
      setErr(page.error.message);
      return;
    }
    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const item of page.data ?? []) byId.set(item.id, item);
      return [...byId.values()];
    });
    setNextCursor(page.nextCursor);
    setTotalFlights(page.total);
  }, [configured, loadingMore, nextCursor, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) {
      setInfoById({});
      setSignaturesByFlightId({});
      return;
    }

    setInfoById((prev) => {
      const next: Record<string, FlightDisplayInfo> = {};
      for (const item of items) next[item.id] = prev[item.id] ?? buildBasicFlightListDisplayInfo(item);
      return next;
    });

    void (async () => {
      const lightInfos = await loadLightFlightListDisplayInfos(items);
      if (cancelled) return;
      setInfoById((prev) => ({ ...prev, ...lightInfos }));
      const [fullInfos, signatureMap] = await Promise.all([
        loadFullFlightListDisplayInfos(selectPreloadItems(items, lightInfos)),
        listSignaturesForFlights(items.map((item) => item.id)),
      ]);
      if (cancelled) return;
      setInfoById((prev) => ({ ...prev, ...fullInfos }));
      const sigs: Record<string, FlightSignaturesForFlight> = {};
      signatureMap.forEach((value, key) => {
        sigs[key] = value;
      });
      setSignaturesByFlightId(sigs);
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const info = infoById[item.id];
      const sigs = signaturesByFlightId[item.id];
      const iso = info?.flightDateIso ?? item.flight_date ?? "";
      if (q) {
        const text = [
          info?.studentName,
          info?.instructorName,
          info?.studentAnac,
          info?.instructorAnac,
          info?.aircraft,
          item.aircraft_ident,
          info?.fromTo,
        ].join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (statusFilter !== "all" && item.flight_status !== statusFilter) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      const count = signatureCount(sigs);
      if (signatureFilter === "signed" && count === 0) return false;
      if (signatureFilter === "pending" && count === 3) return false;
      return true;
    }).sort((a, b) => getFlightDateTimeMs(b, infoById[b.id]) - getFlightDateTimeMs(a, infoById[a.id]));
  }, [dateFrom, dateTo, infoById, items, search, signatureFilter, signaturesByFlightId, statusFilter]);

  const reopenFlight = items.find((item) => item.id === reopenFlightId) ?? null;
  const reopenInfo = reopenFlight ? infoById[reopenFlight.id] : undefined;
  const reopenSignatures = reopenFlight ? signaturesByFlightId[reopenFlight.id] : undefined;

  async function handleReopen() {
    if (!reopenFlightId) return;
    if (!reopenReason.trim()) {
      setReopenError("Informe o motivo da reabertura.");
      return;
    }
    setReopening(true);
    setReopenError(null);
    try {
      await reopenAdminFlightForEdit({ flightId: reopenFlightId, reason: reopenReason.trim() });
      invalidateFlightListDisplayCache([reopenFlightId]);
      setReopenFlightId(null);
      setReopenReason("");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setReopenError(error instanceof Error ? error.message : "Erro ao reabrir voo.");
    } finally {
      setReopening(false);
    }
  }

  if (view === "detail" && selectedFlightId) {
    return (
      <FlightDetailView
        flightId={selectedFlightId}
        onBack={() => {
          setView("list");
          setSelectedFlightId(undefined);
          setRefreshKey((key) => key + 1);
        }}
        backLabel="Todos os voos"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/35 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Admin</p>
            <h2 className="text-lg font-semibold text-slate-100">Todos os voos</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${displayMode === "table" ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Tabela
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("cards")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${displayMode === "cards" ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            >
              Cards
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-xs text-slate-500">Busca</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" placeholder="Aluno, INVA, CANAC, aeronave..." />
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-500">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FlightStatus | "all")} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
              <option value="all">Todos</option>
              <option value="Previsto">Previsto</option>
              <option value="Realizado">Realizado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-500">Assinaturas</span>
            <select value={signatureFilter} onChange={(e) => setSignatureFilter(e.target.value as SignatureFilter)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
              <option value="all">Todas</option>
              <option value="signed">Com alguma assinatura</option>
              <option value="pending">Pendentes</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-500">De</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-500">Até</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
          </label>
        </div>
      </div>

      {err ? <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredItems.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum voo encontrado.
        </p>
      ) : displayMode === "cards" ? (
        <ul className="grid gap-3 xl:grid-cols-2">
          {filteredItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/35 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">{infoById[item.id]?.aircraft ?? item.aircraft_ident ?? "-"}</span>
                    <span className={`rounded border px-2 py-1 text-[11px] font-semibold ${statusBadge(item.flight_status)}`}>{item.flight_status}</span>
                  </div>
                  <p className="text-sm text-slate-200">{formatDate(item, infoById[item.id])} · {infoById[item.id]?.startTime || "-"}</p>
                  <p className="text-xs text-slate-400">Aluno: <span className="text-slate-300">{infoById[item.id]?.studentName ?? "-"}</span></p>
                  <p className="text-xs text-slate-400">INVA: <span className="text-slate-300">{infoById[item.id]?.instructorName ?? "-"}</span></p>
                  <p className="text-xs text-slate-400">Rota: <span className="text-slate-300">{infoById[item.id]?.fromTo ?? "-"}</span></p>
                  <FlightSignatures sigs={signaturesByFlightId[item.id]} />
                </div>
                <RowActions
                  item={item}
                  sigs={signaturesByFlightId[item.id]}
                  onOpen={() => { setSelectedFlightId(item.id); setView("detail"); }}
                  onReopen={() => { setReopenFlightId(item.id); setReopenError(null); }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30">
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-left text-xs">
              <thead className="bg-slate-950/50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Aluno</th>
                  <th className="px-3 py-2">INVA</th>
                  <th className="px-3 py-2">Aeronave</th>
                  <th className="px-3 py-2">Rota</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Assinaturas</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredItems.map((item) => {
                  const info = infoById[item.id];
                  return (
                    <tr key={item.id} className="text-slate-300 hover:bg-slate-800/40">
                      <td className="px-3 py-2">{formatDate(item, info)}</td>
                      <td className="px-3 py-2">{info?.startTime || "-"}</td>
                      <td className="px-3 py-2">{info?.studentName ?? "-"}</td>
                      <td className="px-3 py-2">{info?.instructorName ?? "-"}</td>
                      <td className="px-3 py-2">{info?.aircraft ?? item.aircraft_ident ?? "-"}</td>
                      <td className="px-3 py-2">{info?.fromTo ?? "-"}</td>
                      <td className="px-3 py-2">{formatHours(info?.totalFlightMinutes)}</td>
                      <td className="px-3 py-2"><span className={`rounded border px-2 py-1 text-[11px] font-semibold ${statusBadge(item.flight_status)}`}>{item.flight_status}</span></td>
                      <td className="px-3 py-2"><FlightSignatures sigs={signaturesByFlightId[item.id]} /></td>
                      <td className="px-3 py-2">
                        <RowActions
                          item={item}
                          sigs={signaturesByFlightId[item.id]}
                          onOpen={() => { setSelectedFlightId(item.id); setView("detail"); }}
                          onReopen={() => { setReopenFlightId(item.id); setReopenError(null); }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">{Math.min(items.length, totalFlights)} de {totalFlights} voos carregados</span>
        {nextCursor ? (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-60">
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        ) : null}
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="text-xs text-slate-500 underline-offset-4 hover:underline">Atualizar lista</button>
      </div>

      {reopenFlight ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Reabertura administrativa</p>
                <h3 className="text-lg font-semibold text-slate-100">Reabrir edição do voo</h3>
              </div>
              <button type="button" onClick={() => setReopenFlightId(null)} disabled={reopening} className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">Fechar</button>
            </div>
            <div className="mb-4 grid gap-2 rounded-xl border border-slate-700/60 bg-slate-950/30 p-3 text-xs text-slate-400 sm:grid-cols-2">
              <p>Data: <span className="text-slate-300">{formatDate(reopenFlight, reopenInfo)}</span></p>
              <p>Aeronave: <span className="text-slate-300">{reopenInfo?.aircraft ?? reopenFlight.aircraft_ident ?? "-"}</span></p>
              <p>Aluno: <span className="text-slate-300">{reopenInfo?.studentName ?? "-"}</span></p>
              <p>INVA: <span className="text-slate-300">{reopenInfo?.instructorName ?? "-"}</span></p>
              <div className="sm:col-span-2"><FlightSignatures sigs={reopenSignatures} /></div>
            </div>
            <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
              As assinaturas ativas serão invalidadas e aluno, INVA e operador precisarão assinar novamente após a edição.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Motivo obrigatório</span>
              <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={4} disabled={reopening} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500 disabled:opacity-60" placeholder="Descreva por que este voo precisa ser reaberto..." />
            </label>
            {reopenError ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">{reopenError}</p> : null}
            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button type="button" onClick={() => setReopenFlightId(null)} disabled={reopening} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
              <button type="button" onClick={() => void handleReopen()} disabled={reopening || !reopenReason.trim()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">{reopening ? "Reabrindo..." : "Reabrir edição"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowActions({
  item,
  sigs,
  onOpen,
  onReopen,
}: {
  item: SavedFlightListItem;
  sigs?: FlightSignaturesForFlight;
  onOpen: () => void;
  onReopen: () => void;
}) {
  const hasSignature = signatureCount(sigs) > 0 || Boolean(item.instructor_signed || item.student_signed || item.admin_operator_signed);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onOpen} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">
        Detalhes
      </button>
      {hasSignature ? (
        <button type="button" onClick={onReopen} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
          Reabrir edição
        </button>
      ) : null}
    </div>
  );
}
