import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  getAiswebBootstrap,
  lookupAiswebIcao,
  saveAiswebWatchlist,
  searchAiswebAerodromes,
} from "../lib/aiswebDb";
import {
  analyzeWindVsRunways,
  evaluateMinimums,
  formatCeiling,
  formatObs,
  formatVisibility,
  formatWind,
  minimumCheckDetail,
  normalizeIcao,
  parseMetar,
} from "../lib/aiswebMetar";
import type {
  AiswebAerodromeMatch,
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
  if (!airport.met?.metar && !airport.met?.parsed) return null;
  return parseMetar(airport.met.metar) || airport.met.parsed;
}

function placeholderAirport(icao: string): AiswebAirportBundle {
  return {
    icao,
    met: { icao, metar: "", taf: "", parsed: null },
    rotaer: null,
    notams: [],
    supplements: [],
    adWarnings: [],
    sun: null,
    charts: [],
    airspace: null,
  };
}

function sortNotamsClient(items: AiswebNotam[]): AiswebNotam[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.issuedAt || a.validFrom || "") || 0;
    const tb = Date.parse(b.issuedAt || b.validFrom || "") || 0;
    return tb - ta;
  });
}

const BOOTSTRAP_CACHE_KEY = "aisweb-bootstrap-v1";

function readBootstrapCache(): {
  settings: AiswebDashboard["settings"];
  watchlist: AiswebDashboard["watchlist"];
} | null {
  try {
    const raw = sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      settings?: AiswebDashboard["settings"];
      watchlist?: AiswebDashboard["watchlist"];
    };
    if (!parsed?.settings || !parsed?.watchlist) return null;
    return {
      settings: parsed.settings,
      watchlist: {
        icaoCodes: parsed.watchlist.icaoCodes || [],
        notamAlerts: parsed.watchlist.notamAlerts || {},
        supplementAlerts: parsed.watchlist.supplementAlerts || {},
        adWarningAlerts: parsed.watchlist.adWarningAlerts || {},
        updatedAt: parsed.watchlist.updatedAt || null,
      },
    };
  } catch {
    return null;
  }
}

function writeBootstrapCache(settings: AiswebDashboard["settings"], watchlist: AiswebDashboard["watchlist"]) {
  try {
    sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ settings, watchlist }));
  } catch {
    // ignore quota / private mode
  }
}
import { AiswebMeteorologyPanel } from "./AiswebMeteorologyPanel";
import { AiswebAirportDetailTabs } from "./AiswebAirportDetails";
import { Skeleton } from "./ui/Skeleton";
import { Tabs } from "./ui/Tabs";
import { useToast } from "./ui/ToastProvider";

const searchInputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-500";

function looksLikeIcaoCode(value: string): boolean {
  return /^[A-Za-z0-9]{4}$/.test(String(value || "").trim());
}

function formatAerodromeMatchLabel(match: AiswebAerodromeMatch): string {
  const city = String(match.city || "").trim();
  const name = String(match.name || "").trim();
  const uf = String(match.uf || "").trim().toUpperCase();
  const place = [city, uf].filter(Boolean).join("/");
  const showName =
    Boolean(name) &&
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() !==
      city
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
  return [match.icao, showName ? name : null, place ? `(${place})` : null].filter(Boolean).join(" ");
}

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
    <div className="inline-flex max-w-full flex-wrap items-center gap-1.5">
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
  onRemoveFromWatchlist,
  addingTemporary,
  removingIcao,
  notamAlerts,
  onToggleNotamAlert,
  togglingNotamIcao,
  supplementAlerts,
  onToggleSupplementAlert,
  togglingSupplementIcao,
  adWarningAlerts,
  onToggleAdWarningAlert,
  togglingAdWarningIcao,
  loadingIcaos,
}: {
  airports: AiswebAirportBundle[];
  minimums: AiswebOperationalMinimum[];
  selectedIcao: string | null;
  onSelect: (icao: string) => void;
  setTooltip: Dispatch<SetStateAction<StatusTooltipState>>;
  temporaryIcao: string | null;
  onDismissTemporary: () => void;
  onAddTemporary: () => void;
  onRemoveFromWatchlist: (icao: string) => void;
  addingTemporary: boolean;
  removingIcao: string | null;
  notamAlerts: Record<string, boolean>;
  onToggleNotamAlert: (icao: string, enabled: boolean) => void;
  togglingNotamIcao: string | null;
  supplementAlerts: Record<string, boolean>;
  onToggleSupplementAlert: (icao: string, enabled: boolean) => void;
  togglingSupplementIcao: string | null;
  adWarningAlerts: Record<string, boolean>;
  onToggleAdWarningAlert: (icao: string, enabled: boolean) => void;
  togglingAdWarningIcao: string | null;
  loadingIcaos: Set<string>;
}) {
  const selected = airports.find((a) => a.icao === selectedIcao) ?? airports[0] ?? null;
  const selectedParsed = resolvedParsed(selected);
  const selectedIsTemporary = Boolean(selected && temporaryIcao && selected.icao === temporaryIcao);
  const analysis = selectedParsed
    ? analyzeWindVsRunways(selectedParsed, selected?.rotaer?.runways)
    : null;

  if (!airports.length) {
    return (
      <EmptyPanel>Consulte um aeródromo acima para ver as condições ou adicioná-lo à lista.</EmptyPanel>
    );
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
              <th className="px-2 py-2 font-semibold" title="Avisos de NOTAM por e-mail">
                NOTAM
              </th>
              <th className="px-2 py-2 font-semibold" title="Avisos de suplemento AIP por e-mail">
                SUP
              </th>
              <th className="px-2 py-2 font-semibold" title="Avisos de aeródromo (REDEMET) por e-mail">
                AD WRNG
              </th>
              <th className="px-2 py-2 text-right font-semibold">Lista</th>
            </tr>
          </thead>
          <tbody>
            {airports.map((airport) => {
              const isLoadingMet = loadingIcaos.has(airport.icao);
              const parsed = isLoadingMet ? null : resolvedParsed(airport);
              const checks = evaluateMinimums(parsed, minimums, { rotaer: airport.rotaer });
              const active = selected?.icao === airport.icao;
              const isTemporary = temporaryIcao === airport.icao;
              const removing = removingIcao === airport.icao;
              return (
                <tr
                  key={isTemporary ? `temp-${airport.icao}` : airport.icao}
                  className={`cursor-pointer border-t border-slate-800/80 text-slate-200 transition ${
                    isLoadingMet ? "animate-pulse" : ""
                  } ${
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
                        {isLoadingMet ? "carregando" : "consulta"}
                      </span>
                    ) : null}
                  </td>
                  {isLoadingMet ? (
                    <>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-12" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-10" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-12" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-20" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="px-2 py-2.5"><Skeleton className="h-4 w-16" /></td>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {isTemporary ? (
                      <span className="text-[10px] text-slate-600">—</span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notamAlerts[airport.icao] === true}
                        aria-label={
                          notamAlerts[airport.icao]
                            ? `Desligar avisos de NOTAM para ${airport.icao}`
                            : `Ligar avisos de NOTAM para ${airport.icao}`
                        }
                        disabled={togglingNotamIcao === airport.icao}
                        onClick={() =>
                          onToggleNotamAlert(airport.icao, !(notamAlerts[airport.icao] === true))
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
                          notamAlerts[airport.icao]
                            ? "border-cyan-400/60 bg-cyan-500/80"
                            : "border-slate-600 bg-slate-800"
                        } ${togglingNotamIcao === airport.icao ? "opacity-60" : "hover:brightness-110"}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition ${
                            notamAlerts[airport.icao] ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {isTemporary ? (
                      <span className="text-[10px] text-slate-600">—</span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={supplementAlerts[airport.icao] === true}
                        aria-label={
                          supplementAlerts[airport.icao]
                            ? `Desligar avisos de suplemento para ${airport.icao}`
                            : `Ligar avisos de suplemento para ${airport.icao}`
                        }
                        disabled={togglingSupplementIcao === airport.icao}
                        onClick={() =>
                          onToggleSupplementAlert(
                            airport.icao,
                            !(supplementAlerts[airport.icao] === true),
                          )
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
                          supplementAlerts[airport.icao]
                            ? "border-violet-400/60 bg-violet-500/80"
                            : "border-slate-600 bg-slate-800"
                        } ${togglingSupplementIcao === airport.icao ? "opacity-60" : "hover:brightness-110"}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition ${
                            supplementAlerts[airport.icao] ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {isTemporary ? (
                      <span className="text-[10px] text-slate-600">—</span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={adWarningAlerts[airport.icao] === true}
                        aria-label={
                          adWarningAlerts[airport.icao]
                            ? `Desligar avisos de aeródromo para ${airport.icao}`
                            : `Ligar avisos de aeródromo para ${airport.icao}`
                        }
                        disabled={togglingAdWarningIcao === airport.icao}
                        onClick={() =>
                          onToggleAdWarningAlert(
                            airport.icao,
                            !(adWarningAlerts[airport.icao] === true),
                          )
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
                          adWarningAlerts[airport.icao]
                            ? "border-amber-400/60 bg-amber-500/80"
                            : "border-slate-600 bg-slate-800"
                        } ${togglingAdWarningIcao === airport.icao ? "opacity-60" : "hover:brightness-110"}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition ${
                            adWarningAlerts[airport.icao] ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {isTemporary ? (
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                          onClick={onAddTemporary}
                          disabled={addingTemporary || isLoadingMet}
                          aria-label={`Adicionar ${airport.icao} à lista`}
                          title="Adicionar à lista"
                        >
                          {addingTemporary ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-200" />
                          ) : (
                            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                              <path d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:opacity-50"
                          onClick={onDismissTemporary}
                          disabled={addingTemporary}
                          aria-label={`Fechar consulta de ${airport.icao}`}
                          title="Fechar consulta"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                        onClick={() => onRemoveFromWatchlist(airport.icao)}
                        disabled={removing}
                        aria-label={`Remover ${airport.icao} da lista`}
                        title="Remover da lista"
                      >
                        {removing ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400/30 border-t-slate-200" />
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <path
                              fillRule="evenodd"
                              d="M8.75 1A2.75 2.75 0 006 3.75V4h-.167A2.25 2.25 0 003.592 6.02l-.748 8.23A2.75 2.75 0 005.58 17.25h8.84a2.75 2.75 0 002.736-2.999l-.748-8.23A2.25 2.25 0 0014.167 4H14v-.25A2.75 2.75 0 0011.25 1h-2.5zM9.5 4v-.25c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V4h-5zM7.5 7.75a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V8.5a.75.75 0 01.75-.75zm5.75.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0V8.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-3.5">
          {loadingIcaos.has(selected.icao) ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-widest text-cyan-300">{selected.icao}</h3>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
                  Carregando METAR…
                </span>
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : (
            <>
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
            <StatusCluster
              checks={evaluateMinimums(selectedParsed, minimums, { rotaer: selected.rotaer })}
              setTooltip={setTooltip}
            />
          </div>

          <AiswebAirportDetailTabs
            airport={selected}
            meteorology={<AiswebMeteorologyPanel airport={selected} />}
          />
            </>
          )}
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
      <div className="mb-2 grid gap-1 text-[11px] text-slate-400 @md:grid-cols-2">
        <p className="min-w-0 break-words">
          <span className="text-slate-500">Emitido:</span> {formatDateTime(notam.issuedAt)}
        </p>
        <p className="min-w-0 break-words">
          <span className="text-slate-500">Válido:</span> {formatDateTime(notam.validFrom)} →{" "}
          {formatDateTime(notam.validTo)}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{notam.text || "Sem texto."}</p>
    </article>
  );
}

export function AiswebTab({ boardRefreshToken }: { boardRefreshToken?: number } = {}) {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<AiswebDashboard | null>(() => {
    const cached = readBootstrapCache();
    if (!cached) return null;
    return {
      settings: cached.settings,
      watchlist: cached.watchlist,
      airports: cached.watchlist.icaoCodes.map(placeholderAirport),
      notams: [],
    };
  });
  const [loading, setLoading] = useState(() => !readBootstrapCache());
  const [refreshing, setRefreshing] = useState(false);
  const [loadingIcaos, setLoadingIcaos] = useState<Set<string>>(() => {
    const cached = readBootstrapCache();
    return new Set(cached?.watchlist.icaoCodes || []);
  });
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [togglingNotamIcao, setTogglingNotamIcao] = useState<string | null>(null);
  const [togglingSupplementIcao, setTogglingSupplementIcao] = useState<string | null>(null);
  const [togglingAdWarningIcao, setTogglingAdWarningIcao] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupSearching, setLookupSearching] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupHighlight, setLookupHighlight] = useState(0);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupMatches, setLookupMatches] = useState<AiswebAerodromeMatch[]>([]);
  const [lookupResult, setLookupResult] = useState<AiswebAirportBundle | null>(null);
  const [lookupLoadingIcao, setLookupLoadingIcao] = useState<string | null>(null);
  const [addingLookup, setAddingLookup] = useState(false);
  const [removingIcao, setRemovingIcao] = useState<string | null>(null);
  const lookupSearchSeqRef = useRef(0);
  const lookupSkipPreviewRef = useRef(false);
  const lookupContainerRef = useRef<HTMLDivElement | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<AiswebSubTab>("condicoes");
  const [notamFilter, setNotamFilter] = useState<string>("all");
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<StatusTooltipState>(null);

  const mergeAirport = useCallback((airport: AiswebAirportBundle) => {
    setDashboard((prev) => {
      if (!prev) return prev;
      const exists = prev.airports.some((item) => item.icao === airport.icao);
      const airports = exists
        ? prev.airports.map((item) => (item.icao === airport.icao ? airport : item))
        : [...prev.airports, airport];
      const ordered = prev.watchlist.icaoCodes
        .map((icao) => airports.find((item) => item.icao === icao))
        .filter((item): item is AiswebAirportBundle => Boolean(item));
      const extras = airports.filter((item) => !prev.watchlist.icaoCodes.includes(item.icao));
      const nextAirports = [...ordered, ...extras];
      const notams = sortNotamsClient(nextAirports.flatMap((item) => item.notams || []));
      return { ...prev, airports: nextAirports, notams };
    });
    setLoadingIcaos((prev) => {
      if (!prev.has(airport.icao)) return prev;
      const next = new Set(prev);
      next.delete(airport.icao);
      return next;
    });
  }, []);

  const loadAirportsProgressive = useCallback(
    async (icaoCodes: string[], opts?: { replacePlaceholders?: boolean }) => {
      const unique = [...new Set(icaoCodes.map(normalizeIcao).filter((c) => c.length === 4))];
      if (!unique.length) {
        setLoadingIcaos(new Set());
        return;
      }
      if (opts?.replacePlaceholders) {
        setDashboard((prev) =>
          prev
            ? {
                ...prev,
                airports: unique.map(
                  (icao) => prev.airports.find((a) => a.icao === icao && a.met.metar) || placeholderAirport(icao),
                ),
                notams: prev.notams.filter((n) => unique.includes(n.icao)),
              }
            : prev,
        );
      }
      setLoadingIcaos(new Set(unique));
      await Promise.all(
        unique.map(async (icao) => {
          try {
            const airport = await lookupAiswebIcao(icao);
            mergeAirport(airport);
          } catch (error) {
            mergeAirport({
              ...placeholderAirport(icao),
              error: error instanceof Error ? error.message : "Falha ao carregar.",
              met: {
                icao,
                metar: "",
                taf: "",
                parsed: null,
                error: error instanceof Error ? error.message : "Falha ao carregar.",
              },
            });
          }
        }),
      );
    },
    [mergeAirport],
  );

  const loadDashboard = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (opts?.soft) setRefreshing(true);
      setLoadError(null);
      try {
        const bootstrap = await getAiswebBootstrap();
        writeBootstrapCache(bootstrap.settings, bootstrap.watchlist);
        setDashboard((prev) => {
          const keepLoaded =
            opts?.soft
              ? new Map<string, AiswebAirportBundle>()
              : new Map(
                  (prev?.airports || [])
                    .filter((a) => a.met.metar || a.met.parsed)
                    .map((a) => [a.icao, a] as const),
                );
          const airports = bootstrap.watchlist.icaoCodes.map(
            (icao) => keepLoaded.get(icao) || placeholderAirport(icao),
          );
          return {
            settings: bootstrap.settings,
            watchlist: bootstrap.watchlist,
            airports,
            notams: sortNotamsClient(airports.flatMap((a) => a.notams || [])),
          };
        });
        setSelectedIcao((prev) => {
          if (prev && bootstrap.watchlist.icaoCodes.includes(prev)) return prev;
          return bootstrap.watchlist.icaoCodes[0] ?? prev;
        });
        setLoading(false);
        await loadAirportsProgressive(bootstrap.watchlist.icaoCodes);
        setLastFetchedAt(new Date().toISOString());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao carregar AISWEB.";
        setLoadError(message);
        setDashboard((prev) => {
          if (!prev) showToast({ variant: "error", message });
          return prev;
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadAirportsProgressive, showToast],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (boardRefreshToken == null || boardRefreshToken < 1) return;
    void loadDashboard({ soft: true });
  }, [boardRefreshToken, loadDashboard]);

  const watchlist = dashboard?.watchlist.icaoCodes ?? [];
  const notamAlerts = dashboard?.watchlist.notamAlerts ?? {};
  const supplementAlerts = dashboard?.watchlist.supplementAlerts ?? {};
  const adWarningAlerts = dashboard?.watchlist.adWarningAlerts ?? {};
  const minimums = dashboard?.settings.minimums ?? [];

  const conditionAirports = useMemo(() => {
    const list = dashboard?.airports ?? [];
    if (!lookupResult) return list;
    if (list.some((a) => a.icao === lookupResult.icao)) return list;
    return [lookupResult, ...list];
  }, [dashboard?.airports, lookupResult]);

  const temporaryIcao =
    lookupResult && !watchlist.includes(lookupResult.icao) ? lookupResult.icao : null;

  const tableLoadingIcaos = useMemo(() => {
    const next = new Set(loadingIcaos);
    if (lookupLoadingIcao) next.add(lookupLoadingIcao);
    return next;
  }, [loadingIcaos, lookupLoadingIcao]);

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
    const nextNotamAlerts = Object.fromEntries(
      unique.map((icao) => [icao, dashboard?.watchlist.notamAlerts?.[icao] === true]),
    );
    const nextSupplementAlerts = Object.fromEntries(
      unique.map((icao) => [icao, dashboard?.watchlist.supplementAlerts?.[icao] === true]),
    );
    const nextAdWarningAlerts = Object.fromEntries(
      unique.map((icao) => [icao, dashboard?.watchlist.adWarningAlerts?.[icao] === true]),
    );
    setSavingWatchlist(true);
    try {
      const saved = await saveAiswebWatchlist(unique, {
        notamAlerts: nextNotamAlerts,
        supplementAlerts: nextSupplementAlerts,
        adWarningAlerts: nextAdWarningAlerts,
      });
      if (dashboard?.settings) writeBootstrapCache(dashboard.settings, saved);
      const previousCodes = dashboard?.watchlist.icaoCodes || [];
      const added = unique.filter((icao) => !previousCodes.includes(icao));
      setDashboard((prev) => {
        if (!prev) {
          return {
            settings: { defaultIcao: "SBGR", minimums: [], updatedAt: null },
            watchlist: saved,
            airports: unique.map(placeholderAirport),
            notams: [],
          };
        }
        const byIcao = new Map(prev.airports.map((a) => [a.icao, a] as const));
        const airports = unique.map((icao) => byIcao.get(icao) || placeholderAirport(icao));
        return {
          ...prev,
          watchlist: saved,
          airports,
          notams: sortNotamsClient(airports.flatMap((a) => a.notams || [])),
        };
      });
      if (added.length) {
        setLoadingIcaos((prev) => {
          const next = new Set(prev);
          for (const icao of added) next.add(icao);
          return next;
        });
        void loadAirportsProgressive(added);
      } else {
        setLoadingIcaos((prev) => {
          const next = new Set([...prev].filter((icao) => unique.includes(icao)));
          return next;
        });
      }
      showToast({ variant: "success", message: successMessage });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar lista.",
      });
    } finally {
      setSavingWatchlist(false);
    }
  }

  async function handleToggleNotamAlert(icao: string, enabled: boolean) {
    const code = normalizeIcao(icao);
    if (!code || !watchlist.includes(code)) return;
    const nextAlerts = { ...notamAlerts, [code]: enabled };
    setTogglingNotamIcao(code);
    try {
      const saved = await saveAiswebWatchlist(watchlist, {
        notamAlerts: nextAlerts,
        supplementAlerts,
        adWarningAlerts,
      });
      if (dashboard?.settings) writeBootstrapCache(dashboard.settings, saved);
      setDashboard((prev) => (prev ? { ...prev, watchlist: saved } : prev));
      showToast({
        variant: "success",
        message: enabled
          ? `Avisos de NOTAM ligados para ${code}.`
          : `Avisos de NOTAM desligados para ${code}.`,
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao atualizar avisos.",
      });
    } finally {
      setTogglingNotamIcao(null);
    }
  }

  async function handleToggleSupplementAlert(icao: string, enabled: boolean) {
    const code = normalizeIcao(icao);
    if (!code || !watchlist.includes(code)) return;
    const nextAlerts = { ...supplementAlerts, [code]: enabled };
    setTogglingSupplementIcao(code);
    try {
      const saved = await saveAiswebWatchlist(watchlist, {
        notamAlerts,
        supplementAlerts: nextAlerts,
        adWarningAlerts,
      });
      if (dashboard?.settings) writeBootstrapCache(dashboard.settings, saved);
      setDashboard((prev) => (prev ? { ...prev, watchlist: saved } : prev));
      showToast({
        variant: "success",
        message: enabled
          ? `Avisos de suplemento ligados para ${code}.`
          : `Avisos de suplemento desligados para ${code}.`,
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao atualizar avisos.",
      });
    } finally {
      setTogglingSupplementIcao(null);
    }
  }

  async function handleToggleAdWarningAlert(icao: string, enabled: boolean) {
    const code = normalizeIcao(icao);
    if (!code || !watchlist.includes(code)) return;
    const nextAlerts = { ...adWarningAlerts, [code]: enabled };
    setTogglingAdWarningIcao(code);
    try {
      const saved = await saveAiswebWatchlist(watchlist, {
        notamAlerts,
        supplementAlerts,
        adWarningAlerts: nextAlerts,
      });
      if (dashboard?.settings) writeBootstrapCache(dashboard.settings, saved);
      setDashboard((prev) => (prev ? { ...prev, watchlist: saved } : prev));
      showToast({
        variant: "success",
        message: enabled
          ? `Avisos de aeródromo ligados para ${code}.`
          : `Avisos de aeródromo desligados para ${code}.`,
      });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao atualizar avisos.",
      });
    } finally {
      setTogglingAdWarningIcao(null);
    }
  }

  async function handleRemove(icao: string) {
    const code = normalizeIcao(icao);
    if (!code) return;
    setRemovingIcao(code);
    try {
      await persistWatchlist(
        watchlist.filter((item) => item !== code),
        `${code} removido da lista.`,
      );
    } finally {
      setRemovingIcao(null);
    }
  }

  async function applyLookupIcao(icaoCode: string) {
    const icao = normalizeIcao(icaoCode);
    if (icao.length !== 4) {
      showToast({ variant: "warning", message: "Informe um ICAO válido com 4 caracteres." });
      return;
    }
    lookupSearchSeqRef.current += 1;
    lookupSkipPreviewRef.current = true;
    setLookingUp(true);
    setLookupOpen(false);
    setLookupMatches([]);
    setLookupInput(icao);
    setSubTab("condicoes");
    setSelectedIcao(icao);
    setLookupLoadingIcao(icao);

    const alreadyListed =
      watchlist.includes(icao) || (dashboard?.airports ?? []).some((a) => a.icao === icao);
    if (!alreadyListed) {
      setLookupResult(placeholderAirport(icao));
    } else {
      setLookupResult(null);
    }

    try {
      const result = await lookupAiswebIcao(icao);
      if (watchlist.includes(icao) || (dashboard?.airports ?? []).some((a) => a.icao === icao)) {
        mergeAirport(result);
        setLookupResult(null);
      } else {
        setLookupResult(result);
      }
      setSelectedIcao(result.icao);
    } catch (error) {
      setLookupResult((prev) => (prev?.icao === icao && !prev.met.metar ? null : prev));
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha na consulta AISWEB.",
      });
    } finally {
      setLookupLoadingIcao(null);
      setLookingUp(false);
    }
  }

  useEffect(() => {
    const query = lookupInput.trim().slice(0, 80);
    if (query.length < 4 || lookingUp) {
      lookupSearchSeqRef.current += 1;
      setLookupMatches([]);
      setLookupSearching(false);
      if (query.length < 4) setLookupOpen(false);
      return;
    }

    if (lookupSkipPreviewRef.current) {
      lookupSkipPreviewRef.current = false;
      setLookupSearching(false);
      return;
    }

    setLookupSearching(true);
    const seq = ++lookupSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void searchAiswebAerodromes(query, 5)
        .then(({ matches }) => {
          if (seq !== lookupSearchSeqRef.current) return;
          setLookupMatches(matches);
          setLookupHighlight(0);
          setLookupOpen(true);
          setLookupSearching(false);
        })
        .catch(() => {
          if (seq !== lookupSearchSeqRef.current) return;
          setLookupMatches([]);
          setLookupSearching(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [lookupInput, lookingUp]);

  useEffect(() => {
    if (!lookupOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!lookupContainerRef.current?.contains(event.target as Node)) {
        setLookupOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [lookupOpen]);

  async function handleLookup() {
    const query = lookupInput.trim().slice(0, 80);
    if (!query) {
      showToast({ variant: "warning", message: "Informe um ICAO, cidade ou nome do aeródromo." });
      return;
    }

    if (lookupOpen && lookupMatches.length > 0) {
      const pick = lookupMatches[Math.min(lookupHighlight, lookupMatches.length - 1)] || lookupMatches[0];
      if (pick) {
        await handleSelectLookupMatch(pick);
        return;
      }
    }

    if (looksLikeIcaoCode(query)) {
      await applyLookupIcao(query);
      return;
    }

    if (query.length < 4) {
      showToast({ variant: "warning", message: "Digite ao menos 4 letras para buscar por cidade/nome." });
      return;
    }

    setLookingUp(true);
    setLookupOpen(false);
    let singleIcao: string | null = null;
    try {
      const { matches } = await searchAiswebAerodromes(query, 5);
      if (!matches.length) {
        showToast({
          variant: "warning",
          message: `Nenhum aeródromo encontrado para "${query}". Tente o ICAO ou outro nome/cidade.`,
        });
        return;
      }
      if (matches.length === 1) {
        singleIcao = matches[0].icao;
        setLookupInput(singleIcao);
        return;
      }
      setLookupMatches(matches);
      setLookupHighlight(0);
      setLookupOpen(true);
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha na busca AISWEB.",
      });
    } finally {
      setLookingUp(false);
    }

    if (singleIcao) {
      await applyLookupIcao(singleIcao);
    }
  }

  async function handleSelectLookupMatch(match: AiswebAerodromeMatch) {
    setLookupInput(match.icao);
    setLookupOpen(false);
    setLookupMatches([]);
    await applyLookupIcao(match.icao);
  }

  function handleLookupKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setLookupOpen(false);
      return;
    }

    if (lookupOpen && lookupMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setLookupHighlight((prev) => (prev + 1) % lookupMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setLookupHighlight((prev) => (prev - 1 + lookupMatches.length) % lookupMatches.length);
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void handleLookup();
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
    <div className="@container space-y-4">
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
        <div className="flex flex-wrap gap-2" ref={lookupContainerRef}>
          <div className="relative min-w-0 flex-1 basis-48">
            <input
              className={`${searchInputClass} ${lookingUp ? "pr-10" : ""}`}
              value={lookupInput}
              maxLength={80}
              placeholder="Consultar ICAO, cidade ou nome"
              autoComplete="off"
              role="combobox"
              aria-expanded={lookupOpen}
              aria-controls="aisweb-lookup-results"
              aria-autocomplete="list"
              onChange={(e) => {
                lookupSkipPreviewRef.current = false;
                setLookupInput(e.target.value.slice(0, 80));
                setLookupOpen(true);
              }}
              onFocus={() => {
                if (lookupMatches.length > 0 || lookupInput.trim().length >= 4) {
                  setLookupOpen(true);
                }
              }}
              onKeyDown={handleLookupKeyDown}
              disabled={lookingUp}
            />
            {lookingUp ? (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
              </span>
            ) : null}
            {lookupOpen && lookupInput.trim().length >= 4 ? (
              <div
                id="aisweb-lookup-results"
                role="listbox"
                className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 text-sm text-slate-100 shadow-xl shadow-slate-950/50"
              >
                {lookupSearching && lookupMatches.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-500">Buscando…</div>
                ) : null}
                {!lookupSearching && lookupMatches.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-500">
                    Nenhum aeródromo encontrado
                  </div>
                ) : null}
                {lookupMatches.map((match, index) => {
                  const active = index === lookupHighlight;
                  return (
                    <button
                      key={match.icao}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setLookupHighlight(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        void handleSelectLookupMatch(match);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                        active ? "bg-cyan-500/15 text-cyan-50" : "hover:bg-slate-800"
                      }`}
                    >
                      <span className="min-w-0 truncate">{formatAerodromeMatchLabel(match)}</span>
                      <span className="shrink-0 font-mono text-xs font-bold tracking-widest text-cyan-300">
                        {match.icao}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`${btnSecondary} grow @sm:grow-0`}
            onClick={() => void handleLookup()}
            disabled={lookingUp || !lookupInput.trim()}
          >
            {lookingUp ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400/30 border-t-slate-200" />
                Consultando
              </span>
            ) : (
              "Consultar"
            )}
          </button>
        </div>
      </section>

      <Tabs
        items={tabItems}
        value={subTab}
        onChange={setSubTab}
        ariaLabel="Subabas AISWEB"
        accent="cyan"
      />

      {loading && !dashboard ? (
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

      {dashboard && subTab === "condicoes" ? (
        <ConditionsBoard
          airports={conditionAirports}
          minimums={minimums}
          selectedIcao={selectedIcao}
          onSelect={setSelectedIcao}
          setTooltip={setTooltip}
          temporaryIcao={temporaryIcao}
          onDismissTemporary={handleDismissTemporary}
          onAddTemporary={() => void handleAddLookupToWatchlist()}
          onRemoveFromWatchlist={(icao) => void handleRemove(icao)}
          addingTemporary={addingLookup || savingWatchlist}
          removingIcao={removingIcao}
          notamAlerts={notamAlerts}
          onToggleNotamAlert={(icao, enabled) => void handleToggleNotamAlert(icao, enabled)}
          togglingNotamIcao={togglingNotamIcao}
          supplementAlerts={supplementAlerts}
          onToggleSupplementAlert={(icao, enabled) => void handleToggleSupplementAlert(icao, enabled)}
          togglingSupplementIcao={togglingSupplementIcao}
          adWarningAlerts={adWarningAlerts}
          onToggleAdWarningAlert={(icao, enabled) => void handleToggleAdWarningAlert(icao, enabled)}
          togglingAdWarningIcao={togglingAdWarningIcao}
          loadingIcaos={tableLoadingIcaos}
        />
      ) : null}

      {dashboard && subTab === "notams" ? (
        <section className="space-y-3">
          {loadingIcaos.size > 0 ? (
            <p className="text-[11px] text-slate-500">
              Carregando NOTAMs… ({watchlist.length - loadingIcaos.size}/{watchlist.length})
            </p>
          ) : null}
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
            <div className="grid gap-3 @2xl:grid-cols-2">
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
