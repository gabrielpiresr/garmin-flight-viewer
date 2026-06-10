import { useEffect, useMemo, useRef, useState } from "react";
import { FilterMultiSelect } from "./AdminReportFilterBar";
import { fetchSagaSchedules, type SagaScheduleItem } from "../../lib/sagaImportDb";

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

function parseDtMs(raw: string): number {
  if (!raw) return 0;
  const ms = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : 0;
}

function durationMin(item: SagaScheduleItem): number {
  const s = parseDtMs(item.startAtRaw);
  const e = parseDtMs(item.endAtRaw);
  return s && e && e > s ? Math.round((e - s) / 60000) : 0;
}

function flightTimeMin(item: SagaScheduleItem): number {
  const d = durationMin(item);
  return d > 45 ? d - 45 : 0;
}

function fmtMin(m: number): string {
  if (!m) return "-";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, "0")}`;
}

function flightDate(item: SagaScheduleItem): string {
  return item.startAtRaw?.slice(0, 10) ?? "";
}

function startTime(item: SagaScheduleItem): string {
  return item.startAtRaw?.slice(11, 16) ?? "";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateBr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function fmtDateTimeBr(raw: string): string {
  if (!raw) return "-";
  const date = raw.slice(0, 10);
  const time = raw.slice(11, 16);
  return time ? `${fmtDateBr(date)} ${time}` : fmtDateBr(date);
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function weekMonday(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type QuickFilter = "none" | "today" | "last3days" | "thisWeek";
type SortKey = "createdAt" | "flightDate" | "studentName" | "aircraft" | "duration";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "student" | "aircraft" | "day" | "week";

type GroupSortKey = "label" | "count" | "duration" | "flightTime";

type Group = {
  key: string;
  label: string;
  items: SagaScheduleItem[];
  count: number;
  totalDuration: number;
  totalFlightTime: number;
};

// ─── Cabeçalhos adaptados ao agrupamento ─────────────────────────────────────

const GROUP_COL_LABEL: Record<GroupBy, string> = {
  none: "",
  student: "Aluno",
  aircraft: "Aeronave",
  day: "Dia",
  week: "Semana",
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function AgendamentosAdminTab() {
  const [items, setItems] = useState<SagaScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtros
  const [studentFilter, setStudentFilter] = useState("");
  const [aircraftFilter, setAircraftFilter] = useState<string[]>([]);
  const [aircraftOpen, setAircraftOpen] = useState(false);
  const [createdAtFrom, setCreatedAtFrom] = useState("");
  const [createdAtTo, setCreatedAtTo] = useState("");
  const [flightDateFrom, setFlightDateFrom] = useState("");
  const [flightDateTo, setFlightDateTo] = useState("");
  const [onlyFuture, setOnlyFuture] = useState(true);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");

  // Ordenação (view detalhada)
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Ordenação (view agrupada)
  const [groupSortKey, setGroupSortKey] = useState<GroupSortKey>("label");
  const [groupSortDir, setGroupSortDir] = useState<SortDir>("asc");

  // Agrupamento
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  // Fecha dropdown de aeronave ao clicar fora
  const aircraftRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aircraftOpen) return;
    function handler(e: MouseEvent) {
      if (aircraftRef.current && !aircraftRef.current.contains(e.target as Node)) {
        setAircraftOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aircraftOpen]);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSagaSchedules()
      .then((r) => { if (!cancelled) setItems(r.schedules); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Opções únicas de aeronave
  const aircraftOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) { if (item.aircraft) set.add(item.aircraft); }
    return [...set].sort();
  }, [items]);

  // Resolve range do quick filter
  const resolvedCreatedFrom = useMemo(() => {
    const today = todayIso();
    if (quickFilter === "today") return today;
    if (quickFilter === "last3days") {
      const d = new Date(); d.setDate(d.getDate() - 2);
      return d.toISOString().slice(0, 10);
    }
    if (quickFilter === "thisWeek") return weekMonday(today);
    return createdAtFrom;
  }, [quickFilter, createdAtFrom]);

  const resolvedCreatedTo = useMemo(() => {
    if (quickFilter !== "none") return todayIso();
    return createdAtTo;
  }, [quickFilter, createdAtTo]);

  // Filtro + ordenação (lista detalhada)
  const filteredSorted = useMemo(() => {
    const today = todayIso();
    let result = items;

    const sq = studentFilter.trim().toLowerCase();
    if (sq) result = result.filter((i) => i.studentName.toLowerCase().includes(sq));
    if (aircraftFilter.length > 0) result = result.filter((i) => aircraftFilter.includes(i.aircraft));
    if (resolvedCreatedFrom) result = result.filter((i) => (i.createdAt || "").slice(0, 10) >= resolvedCreatedFrom);
    if (resolvedCreatedTo)   result = result.filter((i) => (i.createdAt || "").slice(0, 10) <= resolvedCreatedTo);
    if (flightDateFrom) result = result.filter((i) => flightDate(i) >= flightDateFrom);
    if (flightDateTo)   result = result.filter((i) => flightDate(i) <= flightDateTo);
    if (onlyFuture)     result = result.filter((i) => flightDate(i) >= today);

    return [...result].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "createdAt":   diff = (a.createdAt || "").localeCompare(b.createdAt || ""); break;
        case "flightDate":  diff = flightDate(a).localeCompare(flightDate(b)); break;
        case "studentName": diff = a.studentName.localeCompare(b.studentName, "pt-BR"); break;
        case "aircraft":    diff = a.aircraft.localeCompare(b.aircraft); break;
        case "duration":    diff = durationMin(a) - durationMin(b); break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [items, studentFilter, aircraftFilter, resolvedCreatedFrom, resolvedCreatedTo, flightDateFrom, flightDateTo, onlyFuture, sortKey, sortDir]);

  // Agrupamento — produz somente o resumo de cada grupo
  const groupedData = useMemo((): Group[] => {
    if (groupBy === "none") return [];

    const buckets = new Map<string, { label: string; items: SagaScheduleItem[] }>();

    for (const item of filteredSorted) {
      let key: string;
      let label: string;

      if (groupBy === "student") {
        key = item.studentName || "(sem aluno)";
        label = key;
      } else if (groupBy === "aircraft") {
        key = item.aircraft || "(sem aeronave)";
        label = key;
      } else if (groupBy === "day") {
        key = flightDate(item);
        if (!key) { key = "(sem data)"; label = key; }
        else {
          const d = new Date(`${key}T12:00:00`);
          label = `${DAY_NAMES[d.getDay()] ?? ""}, ${fmtDateBr(key)}`;
        }
      } else {
        const iso = flightDate(item);
        const monday = iso ? weekMonday(iso) : "";
        key = monday || "(sem data)";
        if (!monday) { label = key; }
        else {
          const sun = new Date(`${monday}T12:00:00`);
          sun.setDate(sun.getDate() + 6);
          const mondayD = new Date(`${monday}T12:00:00`);
          label = `Semana ${mondayD.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${sun.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
        }
      }

      if (!buckets.has(key)) buckets.set(key, { label, items: [] });
      buckets.get(key)!.items.push(item);
    }

    const groups = [...buckets.entries()].map(([key, { label, items: gi }]) => ({
      key,
      label,
      items: gi,
      count: gi.length,
      totalDuration: gi.reduce((s, i) => s + durationMin(i), 0),
      totalFlightTime: gi.reduce((s, i) => s + flightTimeMin(i), 0),
    }));

    return [...groups].sort((a, b) => {
      let diff = 0;
      switch (groupSortKey) {
        case "label":      diff = a.key.localeCompare(b.key, "pt-BR"); break;
        case "count":      diff = a.count - b.count; break;
        case "duration":   diff = a.totalDuration - b.totalDuration; break;
        case "flightTime": diff = a.totalFlightTime - b.totalFlightTime; break;
      }
      return groupSortDir === "asc" ? diff : -diff;
    });
  }, [filteredSorted, groupBy, groupSortKey, groupSortDir]);

  // Handlers de ordenação
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function handleGroupSort(key: GroupSortKey) {
    if (groupSortKey === key) setGroupSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setGroupSortKey(key); setGroupSortDir("asc"); }
  }

  function sortInd(active: boolean, dir: SortDir) {
    if (!active) return null;
    return <span className="ml-1 text-emerald-400">{dir === "asc" ? "↑" : "↓"}</span>;
  }

  const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
    { id: "today", label: "Marcado hoje" },
    { id: "last3days", label: "Últimos 3 dias" },
    { id: "thisWeek", label: "Esta semana" },
  ];

  const GROUP_OPTIONS: Array<{ id: GroupBy; label: string }> = [
    { id: "none", label: "Nenhum" },
    { id: "student", label: "Aluno" },
    { id: "aircraft", label: "Aeronave" },
    { id: "day", label: "Dia" },
    { id: "week", label: "Semana" },
  ];

  const hasActiveFilter = studentFilter || aircraftFilter.length > 0 || createdAtFrom || createdAtTo || flightDateFrom || flightDateTo || quickFilter !== "none";
  const isGrouped = groupBy !== "none";
  const totalCount = isGrouped ? groupedData.reduce((s, g) => s + g.count, 0) : filteredSorted.length;

  // Colunas do cabeçalho da view detalhada
  const DETAIL_COLS: Array<{ label: string; key: SortKey | null }> = [
    { label: "Aluno", key: "studentName" },
    { label: "Aeronave", key: "aircraft" },
    { label: "Data do voo", key: "flightDate" },
    { label: "Hora início", key: null },
    { label: "Duração", key: "duration" },
    { label: "Tempo de voo", key: null },
    { label: "Marcado em", key: "createdAt" },
  { label: "Marcado por", key: null },
  ];

  // Colunas do cabeçalho da view agrupada
  const GROUP_COLS: Array<{ label: string; key: GroupSortKey }> = [
    { label: GROUP_COL_LABEL[groupBy], key: "label" },
    { label: "Qtd. Voos", key: "count" },
    { label: "Duração Total", key: "duration" },
    { label: "Tempo de Voo Total", key: "flightTime" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {loading ? "Carregando..." : `${totalCount} agendamento${totalCount !== 1 ? "s" : ""}${isGrouped ? ` · ${groupedData.length} grupo${groupedData.length !== 1 ? "s" : ""}` : ""}`}
        </p>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}>
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* Aluno */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Aluno</label>
            <input
              type="text"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              placeholder="Nome do aluno"
              className="h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
          </div>

          {/* Aeronave — multi-select */}
          <div ref={aircraftRef}>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Aeronave</label>
            <FilterMultiSelect
              label="Aeronave"
              options={aircraftOptions}
              value={aircraftFilter}
              open={aircraftOpen}
              onOpen={() => setAircraftOpen((o) => !o)}
              onChange={setAircraftFilter}
            />
          </div>

          {/* Data do voo */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Data do voo (de – até)</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={flightDateFrom}
                onChange={(e) => setFlightDateFrom(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
              />
              <input
                type="date"
                value={flightDateTo}
                onChange={(e) => setFlightDateTo(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Marcado em */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Marcado em (de – até)</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={createdAtFrom}
                onChange={(e) => { setCreatedAtFrom(e.target.value); setQuickFilter("none"); }}
                disabled={quickFilter !== "none"}
                className="h-9 flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-40"
              />
              <input
                type="date"
                value={createdAtTo}
                onChange={(e) => { setCreatedAtTo(e.target.value); setQuickFilter("none"); }}
                disabled={quickFilter !== "none"}
                className="h-9 flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.id}
              type="button"
              onClick={() => setQuickFilter((prev) => (prev === qf.id ? "none" : qf.id))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                quickFilter === qf.id
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {qf.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOnlyFuture((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              onlyFuture
                ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            Só voos futuros
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setStudentFilter("");
                setAircraftFilter([]);
                setCreatedAtFrom("");
                setCreatedAtTo("");
                setFlightDateFrom("");
                setFlightDateTo("");
                setQuickFilter("none");
              }}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Agrupamento */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Agrupar por</span>
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setGroupBy(opt.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                groupBy === opt.id
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
          <p className="font-semibold">Erro ao carregar agendamentos</p>
          <p className="mt-1 text-amber-300/80">{error}</p>
          {(error.includes("Import") || error.includes("login") || error.includes("sessao") || error.includes("sessão")) && (
            <p className="mt-2 text-xs text-amber-400/70">
              Configure a sessão SAGA em Admin › Import antes de usar esta aba.
            </p>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30">
          <div className="border-b border-slate-800 bg-slate-950/50 px-4 py-2.5">
            <div className="h-3 w-48 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="divide-y divide-slate-800">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-12 animate-pulse rounded bg-slate-800" />
                <div className="ml-auto h-4 w-24 animate-pulse rounded bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sem resultados */}
      {!loading && !error && filteredSorted.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-12 text-center">
          <p className="text-sm text-slate-500">
            {items.length === 0
              ? "Nenhum agendamento encontrado no SAGA para os próximos 4 meses."
              : "Nenhum agendamento corresponde aos filtros selecionados."}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIEW AGRUPADA — somente resumo, sem itens individuais
      ══════════════════════════════════════════════════════════════ */}
      {!loading && !error && isGrouped && groupedData.length > 0 && (
        <>
          {/* Desktop: tabela de resumo */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-slate-950/50">
                    {GROUP_COLS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleGroupSort(col.key)}
                        className="cursor-pointer select-none border-b border-slate-800 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap hover:text-slate-300"
                      >
                        {col.label}
                        {sortInd(groupSortKey === col.key, groupSortDir)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {groupedData.map((group) => (
                    <tr key={group.key} className="transition hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap">{group.label}</td>
                      <td className="px-4 py-2.5 text-slate-300 tabular-nums">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium">{group.count}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 tabular-nums">{fmtMin(group.totalDuration)}</td>
                      <td className="px-4 py-2.5 font-medium text-emerald-400 tabular-nums">{fmtMin(group.totalFlightTime)}</td>
                    </tr>
                  ))}
                </tbody>
                {/* Totalizador */}
                <tfoot>
                  <tr className="border-t border-slate-700 bg-slate-950/60">
                    <td className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Total — {groupedData.length} grupo{groupedData.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-300 tabular-nums">
                      {groupedData.reduce((s, g) => s + g.count, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-300 tabular-nums">
                      {fmtMin(groupedData.reduce((s, g) => s + g.totalDuration, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-emerald-400 tabular-nums">
                      {fmtMin(groupedData.reduce((s, g) => s + g.totalFlightTime, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile: cards de resumo */}
          <div className="space-y-2 md:hidden">
            {groupedData.map((group) => (
              <div key={group.key} className="rounded-xl border border-slate-800 bg-slate-900/35 px-4 py-3">
                <p className="font-semibold text-slate-100 text-sm">{group.label}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Voos</p>
                    <p className="font-medium text-slate-300">{group.count}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Duração</p>
                    <p className="text-slate-300">{fmtMin(group.totalDuration)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Tempo voo</p>
                    <p className="font-medium text-emerald-400">{fmtMin(group.totalFlightTime)}</p>
                  </div>
                </div>
              </div>
            ))}
            {/* Totalizador mobile */}
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Total — {groupedData.length} grupo{groupedData.length !== 1 ? "s" : ""}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-500">Voos</p>
                  <p className="font-semibold text-slate-300">{groupedData.reduce((s, g) => s + g.count, 0)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Duração</p>
                  <p className="font-semibold text-slate-300">{fmtMin(groupedData.reduce((s, g) => s + g.totalDuration, 0))}</p>
                </div>
                <div>
                  <p className="text-slate-500">Tempo voo</p>
                  <p className="font-semibold text-emerald-400">{fmtMin(groupedData.reduce((s, g) => s + g.totalFlightTime, 0))}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIEW DETALHADA — lista completa de itens
      ══════════════════════════════════════════════════════════════ */}
      {!loading && !error && !isGrouped && filteredSorted.length > 0 && (
        <>
          {/* Desktop: tabela detalhada */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-slate-950/50">
                    {DETAIL_COLS.map((col) => (
                      <th
                        key={col.label}
                        onClick={col.key ? () => handleSort(col.key as SortKey) : undefined}
                        className={`border-b border-slate-800 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap select-none ${col.key ? "cursor-pointer hover:text-slate-300" : ""}`}
                      >
                        {col.label}
                        {col.key ? sortInd(sortKey === col.key, sortDir) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredSorted.map((item) => (
                    <tr key={item.id} className="transition hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap">{item.studentName || "-"}</td>
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">
                        <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-xs font-medium text-sky-300">
                          {item.aircraft || "-"}
                        </span>
                        {item.aircraftModel && (
                          <span className="ml-1.5 text-xs text-slate-500">{item.aircraftModel}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{fmtDateBr(flightDate(item)) || "-"}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{startTime(item) || "-"}</td>
                      <td className="px-4 py-2.5 text-slate-300 tabular-nums whitespace-nowrap">{fmtMin(durationMin(item))}</td>
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        <span className="text-emerald-400">{fmtMin(flightTimeMin(item))}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                        {item.createdAt ? fmtDateTimeBr(item.createdAt) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                        {item.scheduledByName || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards detalhados */}
          <div className="space-y-3 md:hidden">
            {filteredSorted.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-100 text-sm leading-tight">{item.studentName || "-"}</p>
                  <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-xs font-medium text-sky-300 whitespace-nowrap">
                    {item.aircraft || "-"}
                  </span>
                </div>
                {item.aircraftModel && (
                  <p className="mt-0.5 text-xs text-slate-500">{item.aircraftModel}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <p className="text-slate-500">Data do voo</p>
                    <p className="text-slate-300">{fmtDateBr(flightDate(item)) || "-"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Hora início</p>
                    <p className="text-slate-300">{startTime(item) || "-"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Duração</p>
                    <p className="text-slate-300">{fmtMin(durationMin(item))}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Tempo de voo</p>
                    <p className="font-medium text-emerald-400">{fmtMin(flightTimeMin(item))}</p>
                  </div>
                </div>
                {item.createdAt && (
                  <p className="mt-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
                    Marcado em {fmtDateTimeBr(item.createdAt)}
                  </p>
                )}
                {item.scheduledByName && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Marcado por {item.scheduledByName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
