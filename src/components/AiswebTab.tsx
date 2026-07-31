import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  getAiswebDashboard,
  lookupAiswebIcao,
  saveAiswebWatchlist,
} from "../lib/aiswebDb";
import {
  analyzeWindVsRunways,
  decodeMetar,
  evaluateMinimums,
  formatCeiling,
  formatObs,
  formatVisibility,
  formatWind,
  mergeParsedForVisual,
  minimumCheckDetail,
  normalizeIcao,
  parseMetar,
  splitTafSegments,
  type AiswebTafSegment,
} from "../lib/aiswebMetar";
import type {
  AiswebAirportBundle,
  AiswebDashboard,
  AiswebMinimumCheck,
  AiswebNotam,
  AiswebOperationalMinimum,
  AiswebParsedMetar,
  AiswebRotaer,
} from "../types/aisweb";

/** Prefer client parse so Obs/variação work even if the function payload is older. */
function resolvedParsed(airport: AiswebAirportBundle | null | undefined): AiswebParsedMetar | null {
  if (!airport) return null;
  return parseMetar(airport.met.metar) || airport.met.parsed;
}
import { AiswebConditionVisuals } from "./AiswebMetVisuals";
import { AiswebAirportDetailTabs } from "./AiswebAirportDetails";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";
import { useToast } from "./ui/ToastProvider";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase tracking-wide text-slate-100 outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-500";

type AiswebSubTab = "condicoes" | "notams";

type StatusTooltipState = {
  check: AiswebMinimumCheck;
  x: number;
  y: number;
} | null;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatMetarTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }) + "Z"
  );
}

function statusDotClass(ok: boolean | null): string {
  if (ok === true) return "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]";
  if (ok === false) return "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.55)]";
  return "bg-amber-400/80";
}

function shortLabel(condition: AiswebMinimumCheck["condition"]): string {
  if (condition === "vfr_diurno") return "VFR";
  if (condition === "vfr_noturno") return "NOT";
  return "SOLO";
}

function StatusTooltipCard({ state }: { state: StatusTooltipState }) {
  if (!state) return null;
  const detail = minimumCheckDetail(state.check);
  const left =
    typeof window === "undefined" ? state.x + 14 : Math.min(state.x + 14, window.innerWidth - 300);
  const top =
    typeof window === "undefined" ? state.y + 14 : Math.min(state.y + 14, window.innerHeight - 220);
  const badge =
    detail.status === "ok"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : detail.status === "fail"
        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
        : "border-amber-500/40 bg-amber-500/15 text-amber-300";
  const badgeText = detail.status === "ok" ? "OK" : detail.status === "fail" ? "FORA" : "N/D";

  return (
    <div
      className="pointer-events-none fixed z-50 w-72 rounded-lg border border-slate-500/55 bg-slate-950/70 p-3 text-left text-xs text-slate-200 shadow-2xl shadow-slate-950/70 ring-1 ring-white/10 backdrop-blur-xl"
      style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{detail.title}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{badgeText}</span>
      </div>
      <ul className="space-y-1 text-[11px] leading-snug text-slate-300">
        {detail.lines.map((line) => (
          <li key={line} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusTooltipHandlers(
  check: AiswebMinimumCheck,
  setTooltip: Dispatch<SetStateAction<StatusTooltipState>>,
) {
  return {
    onMouseEnter: (event: MouseEvent<HTMLElement>) =>
      setTooltip({ check, x: event.clientX, y: event.clientY }),
    onMouseMove: (event: MouseEvent<HTMLElement>) =>
      setTooltip({ check, x: event.clientX, y: event.clientY }),
    onMouseLeave: () => setTooltip(null),
  };
}

function StatusCluster({
  checks,
  setTooltip,
}: {
  checks: AiswebMinimumCheck[];
  setTooltip: Dispatch<SetStateAction<StatusTooltipState>>;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {checks.map((check) => (
        <button
          key={check.condition}
          type="button"
          className="inline-flex cursor-help items-center gap-1 rounded-md border border-slate-700/70 bg-slate-950/40 px-1.5 py-0.5"
          {...statusTooltipHandlers(check, setTooltip)}
        >
          <span className={`h-2 w-2 rounded-full ${statusDotClass(check.overallOk)}`} />
          <span className="text-[9px] font-semibold tracking-wide text-slate-400">
            {shortLabel(check.condition)}
          </span>
        </button>
      ))}
    </div>
  );
}

function RawMessage({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {value ? (
        <div className="rounded-md bg-slate-950/70 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-200">
          {value}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function DecodedMetar({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => decodeMetar(value), [value]);
  if (!value || !lines.length) return null;

  return (
    <div className="mt-2 rounded-md border border-slate-800/80 bg-slate-950/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Decodificar
        </span>
        <span className="text-[10px] text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-slate-800 px-2.5 py-2">
          {lines.map((line, index) => (
            <li key={`${line.code}-${index}`} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 ring-1 ring-slate-700/80">
                {line.code}
              </span>
              <span className="min-w-0 pt-0.5 text-slate-200">{line.meaning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TafMessage({
  value,
  empty,
  onPreview,
  activeSegmentId,
  onClearPreview,
}: {
  value: string;
  empty: string;
  onPreview: (segment: AiswebTafSegment) => void;
  activeSegmentId: string | null;
  onClearPreview: () => void;
}) {
  const segments = useMemo(() => splitTafSegments(value), [value]);
  if (!value) return <RawMessage label="TAF" value="" empty={empty} />;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">TAF</p>
        {activeSegmentId ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-amber-300 underline-offset-2 hover:underline"
            onClick={onClearPreview}
          >
            Voltar ao METAR
          </button>
        ) : null}
      </div>
      <div className="space-y-0.5 rounded-md bg-slate-950/70 px-2 py-1.5">
        {segments.map((seg) => {
          const isActive = activeSegmentId === seg.id;
          const canPreview = seg.kind !== "base";
          const tagClass =
            seg.kind === "base"
              ? "bg-slate-800 text-slate-400"
              : seg.kind === "becmg"
                ? "bg-cyan-500/15 text-cyan-300"
                : seg.kind === "tempo"
                  ? "bg-violet-500/15 text-violet-300"
                  : seg.kind === "fm"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-violet-500/15 text-violet-300";
          return (
            <div
              key={seg.id}
              role={canPreview ? "button" : undefined}
              tabIndex={canPreview ? 0 : undefined}
              title={
                canPreview ? (isActive ? "Voltar ao METAR" : "Ver nas imagens") : undefined
              }
              aria-pressed={canPreview ? isActive : undefined}
              onClick={canPreview ? () => onPreview(seg) : undefined}
              onKeyDown={
                canPreview
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPreview(seg);
                      }
                    }
                  : undefined
              }
              className={`flex items-start gap-1.5 rounded px-1.5 py-1 transition ${
                canPreview
                  ? "cursor-pointer hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/50"
                  : ""
              } ${isActive ? "bg-amber-500/10 ring-1 ring-amber-500/35" : ""}`}
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${tagClass}`}
              >
                {seg.label}
              </span>
              <p className="min-w-0 flex-1 font-mono text-[12px] leading-snug text-slate-200">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RotaerLine({ rotaer }: { rotaer: AiswebRotaer | null }) {
  if (!rotaer || rotaer.error) return null;
  const rwy = rotaer.runways
    .map((r) => {
      const thr = r.thresholds.map((t) => t.ident).join("/");
      return thr || r.ident;
    })
    .filter(Boolean)
    .join(" · ");
  return (
    <p className="text-[11px] text-slate-400">
      <span className="font-medium text-slate-300">{rotaer.name || rotaer.icao}</span>
      {rotaer.city || rotaer.uf ? ` · ${[rotaer.city, rotaer.uf].filter(Boolean).join("/")}` : null}
      {rotaer.altFt != null ? ` · ${rotaer.altFt.toLocaleString("pt-BR")} ft` : null}
      {rwy ? ` · ${rwy}` : null}
    </p>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-900/20 px-4 py-10 text-center">
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

function ConditionsBoard({
  airports,
  minimums,
  selectedIcao,
  onSelect,
  setTooltip,
  temporaryIcao,
  onDismissTemporary,
  onAddTemporary,
  addingTemporary,
}: {
  airports: AiswebAirportBundle[];
  minimums: AiswebOperationalMinimum[];
  selectedIcao: string | null;
  onSelect: (icao: string) => void;
  setTooltip: Dispatch<SetStateAction<StatusTooltipState>>;
  temporaryIcao: string | null;
  onDismissTemporary: () => void;
  onAddTemporary: () => void;
  addingTemporary: boolean;
}) {
  const selected = airports.find((a) => a.icao === selectedIcao) ?? airports[0] ?? null;
  const selectedParsed = resolvedParsed(selected);
  const selectedIsTemporary = Boolean(selected && temporaryIcao && selected.icao === temporaryIcao);
  const [tafPreview, setTafPreview] = useState<{
    segmentId: string;
    label: string;
    parsed: AiswebParsedMetar;
  } | null>(null);

  useEffect(() => {
    setTafPreview(null);
  }, [selected?.icao, selected?.met.taf, selected?.met.metar]);

  const visualParsed = tafPreview?.parsed ?? selectedParsed;
  const analysis = visualParsed
    ? analyzeWindVsRunways(visualParsed, selected?.rotaer?.runways)
    : null;

  if (!airports.length) {
    return <EmptyPanel>Adicione aeródromos à lista para ver as condições.</EmptyPanel>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-700/80">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-14 px-2 py-2 font-semibold">AD</th>
              <th className="px-2 py-2 font-semibold">Hora</th>
              <th className="px-2 py-2 font-semibold">Vento</th>
              <th className="px-2 py-2 font-semibold">Vis</th>
              <th className="px-2 py-2 font-semibold">Teto</th>
              <th className="px-2 py-2 font-semibold">Nuvens</th>
              <th className="px-2 py-2 font-semibold">Obs</th>
              <th className="px-2 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {airports.map((airport) => {
              const parsed = resolvedParsed(airport);
              const checks = evaluateMinimums(parsed, minimums, { rotaer: airport.rotaer });
              const active = selected?.icao === airport.icao;
              const isTemporary = temporaryIcao === airport.icao;
              return (
                <tr
                  key={isTemporary ? `temp-${airport.icao}` : airport.icao}
                  className={`cursor-pointer border-t border-slate-800/80 text-slate-200 transition ${
                    isTemporary
                      ? active
                        ? "bg-amber-500/15"
                        : "bg-amber-500/5 hover:bg-amber-500/10"
                      : active
                        ? "bg-cyan-500/10"
                        : "hover:bg-slate-900/60"
                  }`}
                  onClick={() => onSelect(airport.icao)}
                >
                  <td className="w-14 px-2 py-2.5">
                    <span
                      className={`font-bold tracking-widest ${
                        isTemporary ? "text-amber-300" : "text-cyan-300"
                      }`}
                    >
                      {airport.icao}
                    </span>
                    {isTemporary ? (
                      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-amber-500/90">
                        consulta
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-400">
                    {formatMetarTime(parsed?.observedAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">{formatWind(parsed)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{formatVisibility(parsed)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{formatCeiling(parsed)}</td>
                  <td className="max-w-[8rem] truncate px-2 py-2.5 font-mono text-[11px] text-slate-400">
                    {parsed?.cloudsText || "—"}
                  </td>
                  <td className="max-w-[9rem] truncate px-2 py-2.5 text-[11px] text-slate-400">
                    {formatObs(parsed)}
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <StatusCluster checks={checks} setTooltip={setTooltip} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3.5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold tracking-widest text-cyan-300">{selected.icao}</h3>
                {selectedIsTemporary ? (
                  <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    consulta temporária
                  </span>
                ) : null}
              </div>
              <RotaerLine rotaer={selected.rotaer} />
              {analysis?.bestIdent ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Pista em uso {analysis.bestIdent}
                  {analysis.crosswindKt != null ? ` · través ${analysis.crosswindKt} kt` : ""}
                  {analysis.headwindKt != null
                    ? ` · ${analysis.headwindKt >= 0 ? "proa" : "cauda"} ${Math.abs(analysis.headwindKt)} kt`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedIsTemporary ? (
                <>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={onDismissTemporary}
                    disabled={addingTemporary}
                  >
                    Fechar consulta
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={onAddTemporary}
                    disabled={addingTemporary}
                  >
                    {addingTemporary ? "Adicionando…" : "Adicionar à lista"}
                  </button>
                </>
              ) : null}
              <StatusCluster
                checks={evaluateMinimums(selectedParsed, minimums, { rotaer: selected.rotaer })}
                setTooltip={setTooltip}
              />
            </div>
          </div>

          <AiswebAirportDetailTabs
            airport={selected}
            meteorology={
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <RawMessage label="METAR" value={selected.met.metar} empty="METAR indisponível." />
                    <DecodedMetar value={selected.met.metar} />
                  </div>
                  <TafMessage
                    value={selected.met.taf}
                    empty="TAF indisponível."
                    activeSegmentId={tafPreview?.segmentId ?? null}
                    onClearPreview={() => setTafPreview(null)}
                    onPreview={(segment) => {
                      if (tafPreview?.segmentId === segment.id) {
                        setTafPreview(null);
                        return;
                      }
                      const merged = mergeParsedForVisual(selectedParsed, segment.text);
                      if (!merged) return;
                      setTafPreview({ segmentId: segment.id, label: segment.label, parsed: merged });
                    }}
                  />
                </div>
                <AiswebConditionVisuals
                  parsed={visualParsed}
                  rotaer={selected.rotaer}
                  previewLabel={tafPreview?.label ?? null}
                />
              </div>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function NotamCard({ notam }: { notam: AiswebNotam }) {
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold tracking-widest text-sky-300">
          {notam.icao}
        </span>
        <span className="text-sm font-semibold text-slate-100">{notam.number || notam.id}</span>
        {notam.status ? (
          <span className="rounded border border-slate-600 bg-slate-800/80 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
            {notam.status}
          </span>
        ) : null}
      </div>
      <div className="mb-2 grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2">
        <p>
          <span className="text-slate-500">Emitido:</span> {formatDateTime(notam.issuedAt)}
        </p>
        <p>
          <span className="text-slate-500">Válido:</span> {formatDateTime(notam.validFrom)} →{" "}
          {formatDateTime(notam.validTo)}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{notam.text || "Sem texto."}</p>
    </article>
  );
}

export function AiswebTab() {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<AiswebDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [lookupResult, setLookupResult] = useState<AiswebAirportBundle | null>(null);
  const [addingLookup, setAddingLookup] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<AiswebSubTab>("condicoes");
  const [notamFilter, setNotamFilter] = useState<string>("all");
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<StatusTooltipState>(null);

  const loadDashboard = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (opts?.soft) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const next = await getAiswebDashboard();
        setDashboard(next);
        setLastFetchedAt(new Date().toISOString());
        setSelectedIcao((prev) => {
          if (prev && next.airports.some((a) => a.icao === prev)) return prev;
          return next.airports[0]?.icao ?? prev;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao carregar AISWEB.";
        setLoadError(message);
        showToast({ variant: "error", message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const watchlist = dashboard?.watchlist.icaoCodes ?? [];
  const minimums = dashboard?.settings.minimums ?? [];

  const conditionAirports = useMemo(() => {
    const list = dashboard?.airports ?? [];
    if (!lookupResult) return list;
    if (list.some((a) => a.icao === lookupResult.icao)) return list;
    return [lookupResult, ...list];
  }, [dashboard?.airports, lookupResult]);

  const temporaryIcao =
    lookupResult && !watchlist.includes(lookupResult.icao) ? lookupResult.icao : null;

  useEffect(() => {
    if (notamFilter !== "all" && !watchlist.includes(notamFilter)) setNotamFilter("all");
  }, [watchlist, notamFilter]);

  const filteredNotams = useMemo(() => {
    const list = dashboard?.notams ?? [];
    if (notamFilter === "all") return list;
    return list.filter((n) => n.icao === notamFilter);
  }, [dashboard?.notams, notamFilter]);

  const tabItems = useMemo(
    () =>
      [
        { id: "condicoes" as const, label: "Condições" },
        {
          id: "notams" as const,
          label: `NOTAMs${dashboard ? ` (${dashboard.notams.length})` : ""}`,
        },
      ] as const,
    [dashboard],
  );

  async function persistWatchlist(nextCodes: string[], successMessage: string) {
    const unique = [...new Set(nextCodes.map(normalizeIcao).filter((c) => c.length === 4))];
    setSavingWatchlist(true);
    try {
      const saved = await saveAiswebWatchlist(unique);
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              watchlist: saved,
              airports: prev.airports.filter((a) => saved.icaoCodes.includes(a.icao)),
              notams: prev.notams.filter((n) => saved.icaoCodes.includes(n.icao)),
            }
          : prev,
      );
      showToast({ variant: "success", message: successMessage });
      await loadDashboard({ soft: true });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar lista.",
      });
    } finally {
      setSavingWatchlist(false);
    }
  }

  async function handleAddToWatchlist() {
    const icao = normalizeIcao(addInput);
    if (icao.length !== 4) {
      showToast({ variant: "warning", message: "Informe um ICAO válido com 4 caracteres." });
      return;
    }
    if (watchlist.includes(icao)) {
      showToast({ variant: "warning", message: `${icao} já está na lista.` });
      return;
    }
    setAddInput("");
    await persistWatchlist([...watchlist, icao], `${icao} adicionado à lista.`);
  }

  async function handleRemove(icao: string) {
    await persistWatchlist(
      watchlist.filter((code) => code !== icao),
      `${icao} removido da lista.`,
    );
  }

  async function handleLookup() {
    const icao = normalizeIcao(lookupInput);
    if (icao.length !== 4) {
      showToast({ variant: "warning", message: "Informe um ICAO válido com 4 caracteres." });
      return;
    }
    setLookingUp(true);
    try {
      const result = await lookupAiswebIcao(icao);
      setSubTab("condicoes");
      setSelectedIcao(result.icao);
      if (watchlist.includes(icao) || (dashboard?.airports ?? []).some((a) => a.icao === icao)) {
        setLookupResult(null);
      } else {
        setLookupResult(result);
      }
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha na consulta AISWEB.",
      });
    } finally {
      setLookingUp(false);
    }
  }

  function handleDismissTemporary() {
    const tempIcao = lookupResult?.icao;
    setLookupResult(null);
    setSelectedIcao((prev) => {
      if (tempIcao && prev === tempIcao) {
        return dashboard?.airports[0]?.icao ?? null;
      }
      return prev;
    });
  }

  async function handleAddLookupToWatchlist() {
    if (!lookupResult) return;
    const icao = normalizeIcao(lookupResult.icao);
    if (watchlist.includes(icao)) {
      showToast({ variant: "warning", message: `${icao} já está na lista.` });
      setLookupResult(null);
      return;
    }
    setAddingLookup(true);
    try {
      await persistWatchlist([...watchlist, icao], `${icao} adicionado à lista.`);
      setLookupResult(null);
      setLookupInput("");
      setSelectedIcao(icao);
    } finally {
      setAddingLookup(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Atualizado: {lastFetchedAt ? formatDateTime(lastFetchedAt) : "—"}
        </p>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => void loadDashboard({ soft: true })}
          disabled={loading || refreshing}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466.75.75 0 10-1.061 1.06 7 7 0 0011.697-3.138.75.75 0 00-1.435-.388zM4.688 8.576a5.5 5.5 0 019.201-2.466.75.75 0 101.061-1.06A7 7 0 003.253 8.188a.75.75 0 101.435.388z"
              clipRule="evenodd"
            />
          </svg>
          Atualizar
        </button>
      </header>

      <section className="rounded-xl border border-slate-700/80 bg-slate-900/30 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {watchlist.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum aeródromo na lista.</p>
          ) : (
            watchlist.map((icao) => (
              <span
                key={icao}
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-bold tracking-widest text-cyan-200"
              >
                {icao}
                <button
                  type="button"
                  className="rounded-full p-0.5 text-cyan-300/80 transition hover:bg-cyan-500/20 hover:text-white disabled:opacity-50"
                  onClick={() => void handleRemove(icao)}
                  disabled={savingWatchlist}
                  aria-label={`Remover ${icao}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={addInput}
              maxLength={4}
              placeholder="ICAO (ex: SBGR)"
              onChange={(e) => setAddInput(normalizeIcao(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void handleAddToWatchlist()}
              disabled={savingWatchlist}
            />
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void handleAddToWatchlist()}
              disabled={savingWatchlist || addInput.length !== 4}
            >
              Adicionar
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={lookupInput}
              maxLength={4}
              placeholder="Consultar ICAO"
              onChange={(e) => setLookupInput(normalizeIcao(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void handleLookup()}
              disabled={lookingUp}
            />
            <button
              type="button"
              className={btnSecondary}
              onClick={() => void handleLookup()}
              disabled={lookingUp || lookupInput.length !== 4}
            >
              {lookingUp ? "…" : "Consultar"}
            </button>
          </div>
        </div>
      </section>

      <Tabs
        items={tabItems}
        value={subTab}
        onChange={setSubTab}
        ariaLabel="Subabas AISWEB"
        accent="cyan"
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : null}

      {!loading && loadError && !dashboard ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center">
          <p className="text-sm text-rose-200">{loadError}</p>
          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => void loadDashboard()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && dashboard && subTab === "condicoes" ? (
        <ConditionsBoard
          airports={conditionAirports}
          minimums={minimums}
          selectedIcao={selectedIcao}
          onSelect={setSelectedIcao}
          setTooltip={setTooltip}
          temporaryIcao={temporaryIcao}
          onDismissTemporary={handleDismissTemporary}
          onAddTemporary={() => void handleAddLookupToWatchlist()}
          addingTemporary={addingLookup || savingWatchlist}
        />
      ) : null}

      {!loading && dashboard && subTab === "notams" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {filteredNotams.length} NOTAM{filteredNotams.length === 1 ? "" : "s"}
              {notamFilter !== "all" ? ` · ${notamFilter}` : " · todos da lista"}
            </p>
            <select
              className={selectClass}
              value={notamFilter}
              onChange={(e) => setNotamFilter(e.target.value)}
              aria-label="Filtrar NOTAMs por aeródromo"
            >
              <option value="all">Todos da lista</option>
              {watchlist.map((icao) => (
                <option key={icao} value={icao}>
                  {icao}
                </option>
              ))}
            </select>
          </div>
          {filteredNotams.length === 0 ? (
            <EmptyPanel>
              {watchlist.length === 0
                ? "Nenhum NOTAM — a lista está vazia."
                : notamFilter === "all"
                  ? "Nenhum NOTAM ativo para os aeródromos da lista."
                  : `Nenhum NOTAM ativo para ${notamFilter}.`}
            </EmptyPanel>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredNotams.map((notam) => (
                <NotamCard
                  key={notam.id || `${notam.icao}-${notam.number}-${notam.issuedAt}`}
                  notam={notam}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <StatusTooltipCard state={tooltip} />
    </div>
  );
}
