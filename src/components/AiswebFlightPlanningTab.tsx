import { useEffect, useMemo, useRef, useState } from "react";
import { lookupAiswebIcao, searchAiswebAerodromes } from "../lib/aiswebDb";
import { listAerodromesByCodes } from "../lib/aerodromesDb";
import { detectAirspacesAlongRoute, sampleRoutePoints } from "../lib/airspaceIntersect";
import { suggestAlternateAerodromes, type AlternateSuggestion } from "../lib/flightPlanAlternates";
import { openFlightPlanPdf } from "../lib/flightPlanPdf";
import { buildFlightPlanMapDataUrl } from "../lib/flightPlanMapImage";
import {
  airportSummaryFromBundle,
  formatAirspaceFreqCell,
  formatRotaerFuel,
} from "../lib/flightPlanFormat";
import {
  buildFullRouteWaypoints,
  formatDistanceNm,
  formatEteHours,
  formatFuel,
  summarizeFlightPlanRoute,
} from "../lib/flightPlanningRoute";
import { normalizeIcao } from "../lib/aiswebMetar";
import {
  offlineBriefingPath,
  saveOfflineFlightBriefing,
} from "../lib/offlineFlightBriefing";
import { getPdfBrand } from "../lib/pdfBrand";
import type { AiswebAerodromeMatch, AiswebAirportBundle } from "../types/aisweb";
import {
  FLIGHT_PLAN_INFO_OPTIONS,
  type FlightPlanAirspaceHit,
  type FlightPlanInfoSection,
} from "../types/flightPlanning";
import { FlightPlanMap } from "./FlightPlanMap";
import { RunwayRose } from "./RunwayRose";
import { useToast } from "./ui/ToastProvider";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

const DEFAULT_SECTIONS: FlightPlanInfoSection[] = [
  "detalhes",
  "frequencias",
  "rmk",
  "compl",
  "notams",
  "suplementos",
  "meteorologia",
];

type EndpointCoords = { lat: number; lng: number; label: string };

function formatMatchLabel(match: AiswebAerodromeMatch): string {
  const bits = [match.icao, match.name, [match.city, match.uf].filter(Boolean).join("/")].filter(Boolean);
  return bits.join(" · ");
}

function FuelIcon({ available }: { available: boolean }) {
  if (!available) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200"
      title="Combustível disponível no ROTAER"
    >
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4 3.5A1.5 1.5 0 015.5 2h6A1.5 1.5 0 0113 3.5V14h1.5a.5.5 0 01.5.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1v-2.5a.5.5 0 01.5-.5H6V3.5zM15 7h.5A1.5 1.5 0 0117 8.5V13a2 2 0 11-2 0V7z" />
      </svg>
      Combustível
    </span>
  );
}

function IcaoField({
  label,
  value,
  onChange,
  placeholder = "SBSP",
}: {
  label: string;
  value: string;
  onChange: (icao: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [matches, setMatches] = useState<AiswebAerodromeMatch[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      void searchAiswebAerodromes(q, 6)
        .then((res) => setMatches(res.matches))
        .catch(() => setMatches([]));
    }, 280);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <label className="relative block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onChange={(e) => {
          const next = e.target.value.toUpperCase();
          setQuery(next);
          if (next.trim().length === 4) onChange(normalizeIcao(next));
          else if (!next.trim()) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const icao = normalizeIcao(query);
            if (icao.length === 4) {
              onChange(icao);
              setOpen(false);
            }
          }
        }}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl">
          {matches.map((m) => (
            <li key={m.icao}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m.icao);
                  setQuery(m.icao);
                  setOpen(false);
                }}
              >
                {formatMatchLabel(m)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}

function AirportSummaryStrip({
  airports,
  onNoteChange,
}: {
  airports: Array<{
    role: "origem" | "destino" | "alternativo";
    icao: string;
    bundle: AiswebAirportBundle;
    note?: string;
  }>;
  onNoteChange: (role: "origem" | "destino" | "alternativo", icao: string, note: string) => void;
}) {
  if (!airports.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-100">Resumo dos aeródromos</h2>
      <div className="grid gap-3 @2xl:grid-cols-2">
        {airports.map((item) => {
          const role =
            item.role === "origem" ? "Origem" : item.role === "destino" ? "Destino" : "Alternativo";
          const s = airportSummaryFromBundle(role, item.icao, item.bundle);
          const metar = item.bundle.met?.metar?.trim() || "";
          return (
            <article
              key={`${item.role}-${item.icao}`}
              className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-3.5"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">{s.role}</p>
                  <h3 className="text-base font-semibold text-slate-100">
                    {s.icao}
                    {s.name ? <span className="text-slate-400"> — {s.name}</span> : null}
                  </h3>
                </div>
                <FuelIcon available={s.fuelAvailable} />
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Elevação</p>
                  <p className="text-sm font-semibold text-slate-100">
                    {s.elevFt != null ? `${s.elevFt} ft` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Pista maior
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {s.longestRunwayM != null ? `${s.longestRunwayM} m` : "—"}
                  </p>
                </div>
              </div>
              <RunwayRose rotaer={item.bundle.rotaer} size={180} compact className="mb-2" />
              <p className="mt-1 text-[11px] text-slate-400">
                <span className="font-semibold uppercase tracking-wide text-slate-500">Frequências · </span>
                {s.frequencies}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                <span className="font-semibold uppercase tracking-wide text-slate-500">Combustível · </span>
                {s.fuelLabel}
              </p>
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">METAR</p>
                <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                  {metar || "METAR indisponível"}
                </p>
              </div>
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Observação
                </span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600"
                  rows={2}
                  value={item.note || ""}
                  placeholder="Anotação manual (vai para o PDF e o tablet)…"
                  onChange={(e) => onNoteChange(item.role, item.icao, e.target.value)}
                />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AirportDocPreview({
  role,
  icao,
  bundle,
  sections,
}: {
  role: string;
  icao: string;
  bundle: AiswebAirportBundle;
  sections: FlightPlanInfoSection[];
}) {
  const r = bundle.rotaer;
  const fuel = formatRotaerFuel(r?.fuel);
  return (
    <article className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">{role}</p>
          <h3 className="text-lg font-semibold text-slate-100">
            {icao}
            {r?.name ? <span className="text-slate-400"> — {r.name}</span> : null}
          </h3>
          <p className="text-xs text-slate-500">{[r?.city, r?.uf].filter(Boolean).join(" / ") || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-right text-[11px] text-slate-400">
          <FuelIcon available={fuel.available} />
          <div>
            <p className="uppercase tracking-wider text-slate-600">Elev</p>
            <p className="font-semibold text-slate-200">{r?.altFt != null ? `${r.altFt} ft` : "—"}</p>
          </div>
          <div>
            <p className="uppercase tracking-wider text-slate-600">FIR</p>
            <p className="font-semibold text-slate-200">{r?.fir || bundle.airspace?.fir?.code || "—"}</p>
          </div>
        </div>
      </div>

      {sections.includes("detalhes") ? (
        <p className="mb-3 text-xs text-slate-300">
          <span className="font-semibold text-slate-500">Combustível · </span>
          {fuel.detailLabel}
        </p>
      ) : null}

      {sections.includes("meteorologia") ? (
        <div className="mb-3 space-y-1 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">METAR / TAF</p>
          <p className="font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">
            {bundle.met?.metar || "METAR indisponível"}
          </p>
          <p className="font-mono text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap">
            {bundle.met?.taf || "TAF indisponível"}
          </p>
        </div>
      ) : null}

      {sections.includes("detalhes") && r ? (
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pistas</p>
          <RunwayRose rotaer={r} size={210} />
        </div>
      ) : null}

      {sections.includes("rmk") ? (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            RMK ({(r?.remarks || []).length})
          </p>
          {(r?.remarks || []).length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum RMK no ROTAER.</p>
          ) : (
            (r?.remarks || []).map((rmk, i) => (
              <div key={`${rmk.code || "rmk"}-${i}`} className="rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-2">
                {rmk.code ? (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">{rmk.code}</p>
                ) : null}
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{rmk.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {sections.includes("compl") ? (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            COMPL ({(r?.complements || []).length})
          </p>
          {(r?.complements || []).length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum complemento no ROTAER.</p>
          ) : (
            (r?.complements || []).map((item, i) => (
              <div
                key={`${item.code || "compl"}-${item.index ?? i}`}
                className="rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-2"
              >
                {item.code || item.index != null ? (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">
                    {[item.code ? `cod ${item.code}` : null, item.index != null ? `n ${item.index}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{item.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {sections.includes("frequencias") ? (
        <div className="mb-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Frequências</p>
          {(r?.frequencies || []).length ? (
            <ul className="grid gap-1 @md:grid-cols-2">
              {(r?.frequencies || []).map((f, i) => (
                <li
                  key={`${f.service}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-xs"
                >
                  <span className="truncate text-cyan-300">{f.service}</span>
                  <span className="shrink-0 font-mono text-slate-200">{f.frequenciesMhz.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Sem frequências.</p>
          )}
        </div>
      ) : null}

      {sections.includes("notams") ? (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            NOTAMs ({bundle.notams.length})
          </p>
          {bundle.notams.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum NOTAM ativo.</p>
          ) : (
            bundle.notams.slice(0, 8).map((n) => (
              <div key={n.id || n.number} className="rounded-lg border border-sky-500/20 bg-slate-900/40 px-2.5 py-2">
                <p className="text-xs font-bold text-sky-200">{n.number}</p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{n.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {sections.includes("suplementos") ? (
        <div className="mb-1 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Suplementos ({(bundle.supplements || []).length})
          </p>
          {(bundle.supplements || []).length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum suplemento em vigor.</p>
          ) : (
            (bundle.supplements || []).slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-lg border border-violet-500/20 bg-slate-900/40 px-2.5 py-2">
                <p className="text-xs font-bold text-violet-200">SUP {s.number}</p>
                {s.title ? <p className="text-[11px] font-semibold text-slate-200">{s.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{s.text}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {sections.includes("sol") && bundle.sun ? (
        <p className="mt-2 text-xs text-slate-400">
          Sol: nascer <span className="text-slate-200">{bundle.sun.sunriseUtc || "—"}</span> Z · pôr{" "}
          <span className="text-slate-200">{bundle.sun.sunsetUtc || "—"}</span> Z
        </p>
      ) : null}
    </article>
  );
}

async function resolveEndpointCoords(icao: string): Promise<EndpointCoords | null> {
  const code = normalizeIcao(icao);
  if (code.length !== 4) return null;
  // Prefer AISWEB ROTAER ARP (closer to AIP / NexAtlas) over local catalog.
  try {
    const bundle = await lookupAiswebIcao(code);
    const lat = bundle.rotaer?.lat;
    const lng = bundle.rotaer?.lng;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: code };
    }
  } catch {
    // fall through
  }
  try {
    const fromDb = await listAerodromesByCodes([code]);
    const hit = fromDb.find(
      (a) =>
        a.icao === code &&
        a.latitudeGeoPoint != null &&
        a.longitudeGeoPoint != null &&
        Number.isFinite(a.latitudeGeoPoint) &&
        Number.isFinite(a.longitudeGeoPoint),
    );
    if (hit) {
      return { lat: hit.latitudeGeoPoint!, lng: hit.longitudeGeoPoint!, label: code };
    }
  } catch {
    return null;
  }
  return null;
}

export function AiswebFlightPlanningTab() {
  const { showToast } = useToast();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [alternates, setAlternates] = useState<string[]>([]);
  const [altDraft, setAltDraft] = useState("");
  const [altSuggestions, setAltSuggestions] = useState<AlternateSuggestion[]>([]);
  const [sections, setSections] = useState<FlightPlanInfoSection[]>(DEFAULT_SECTIONS);
  const [routeText, setRouteText] = useState("");
  const [cruiseSpeedKt, setCruiseSpeedKt] = useState<string>("90");
  const [fuelBurn, setFuelBurn] = useState<string>("20");
  const [fuelUnit, setFuelUnit] = useState("L");
  const [originCoords, setOriginCoords] = useState<EndpointCoords | null>(null);
  const [destCoords, setDestCoords] = useState<EndpointCoords | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [loading, setLoading] = useState(false);
  const [airports, setAirports] = useState<
    Array<{
      role: "origem" | "destino" | "alternativo";
      icao: string;
      bundle: AiswebAirportBundle;
      note?: string;
    }>
  >([]);
  const [airspaces, setAirspaces] = useState<FlightPlanAirspaceHit[]>([]);
  const [airspaceLoading, setAirspaceLoading] = useState(false);
  const [airspaceError, setAirspaceError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const icao = normalizeIcao(origin);
    if (icao.length !== 4) {
      setOriginCoords(null);
      return;
    }
    void resolveEndpointCoords(icao).then((coords) => {
      if (!cancelled) setOriginCoords(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  useEffect(() => {
    let cancelled = false;
    const icao = normalizeIcao(destination);
    if (icao.length !== 4) {
      setDestCoords(null);
      return;
    }
    void resolveEndpointCoords(icao).then((coords) => {
      if (!cancelled) setDestCoords(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [destination]);

  // Prefer coords from generated AISWEB bundles when available
  const effectiveOrigin = useMemo(() => {
    const fromBundle = airports.find((a) => a.role === "origem")?.bundle.rotaer;
    if (fromBundle?.lat != null && fromBundle?.lng != null) {
      return { lat: fromBundle.lat, lng: fromBundle.lng, label: normalizeIcao(origin) || "DEP" };
    }
    return originCoords;
  }, [airports, origin, originCoords]);

  const effectiveDest = useMemo(() => {
    const fromBundle = airports.find((a) => a.role === "destino")?.bundle.rotaer;
    if (fromBundle?.lat != null && fromBundle?.lng != null) {
      return { lat: fromBundle.lat, lng: fromBundle.lng, label: normalizeIcao(destination) || "ARR" };
    }
    return destCoords;
  }, [airports, destination, destCoords]);

  const waypoints = useMemo(
    () => buildFullRouteWaypoints(routeText, effectiveOrigin, effectiveDest),
    [routeText, effectiveOrigin, effectiveDest],
  );
  const cruise = Number(String(cruiseSpeedKt).replace(",", "."));
  const burn = Number(String(fuelBurn).replace(",", "."));
  const routeSummary = useMemo(
    () =>
      summarizeFlightPlanRoute(waypoints, {
        cruiseSpeedKt: Number.isFinite(cruise) && cruise > 0 ? cruise : null,
        fuelBurnPerHour: Number.isFinite(burn) && burn > 0 ? burn : null,
      }),
    [waypoints, cruise, burn],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void suggestAlternateAerodromes({
        origin: effectiveOrigin
          ? { ...effectiveOrigin, icao: normalizeIcao(origin) }
          : null,
        destination: effectiveDest
          ? { ...effectiveDest, icao: normalizeIcao(destination) }
          : null,
        excludeIcaos: [origin, destination, ...alternates],
        limit: 6,
        maxNm: 70,
      }).then((items) => {
        if (!cancelled) setAltSuggestions(items);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveOrigin, effectiveDest, origin, destination, alternates]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setAirspaces([]);
      setAirspaceError(null);
      return;
    }
    let cancelled = false;
    setAirspaceLoading(true);
    setAirspaceError(null);
    const samples = sampleRoutePoints(
      waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      100,
    );
    const timer = window.setTimeout(() => {
      void detectAirspacesAlongRoute(samples)
        .then((hits) => {
          if (cancelled) return;
          setAirspaces(hits);
        })
        .catch((err) => {
          if (cancelled) return;
          setAirspaces([]);
          setAirspaceError(err instanceof Error ? err.message : "Falha ao detectar espaço aéreo.");
        })
        .finally(() => {
          if (!cancelled) setAirspaceLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [waypoints]);

  function toggleSection(id: FlightPlanInfoSection) {
    setSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function addAlternate(icaoRaw: string) {
    const icao = normalizeIcao(icaoRaw);
    if (icao.length !== 4) {
      showToast({ variant: "error", title: "ICAO inválido", message: "Informe 4 caracteres." });
      return;
    }
    if (alternates.includes(icao) || icao === origin || icao === destination) {
      showToast({ variant: "warning", title: "Já incluído", message: `${icao} já está no plano.` });
      return;
    }
    setAlternates((prev) => [...prev, icao]);
    setAltDraft("");
  }

  async function handleGenerate() {
    const dep = normalizeIcao(origin);
    const arr = normalizeIcao(destination);
    if (dep.length !== 4 || arr.length !== 4) {
      showToast({
        variant: "error",
        title: "Origem e destino obrigatórios",
        message: "Informe ICAOs válidos de origem e destino.",
      });
      return;
    }
    if (sections.length === 0) {
      showToast({ variant: "error", title: "Selecione informações", message: "Marque ao menos uma seção." });
      return;
    }

    const codes: Array<{ role: "origem" | "destino" | "alternativo"; icao: string }> = [
      { role: "origem", icao: dep },
      { role: "destino", icao: arr },
      ...alternates.map((icao) => ({ role: "alternativo" as const, icao })),
    ];

    setLoading(true);
    try {
      const prevNotes = new Map(
        airports.map((a) => [`${a.role}:${a.icao}`, a.note || ""] as const),
      );
      const results = await Promise.all(
        codes.map(async (item) => {
          const bundle = await lookupAiswebIcao(item.icao);
          return {
            ...item,
            bundle,
            note: prevNotes.get(`${item.role}:${item.icao}`) || "",
          };
        }),
      );
      setAirports(results);
      setGenerated(true);
      showToast({
        variant: "success",
        title: "Documento gerado",
        message: `${results.length} aeródromo(s) carregado(s) do AISWEB.`,
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: "Falha ao gerar",
        message: err instanceof Error ? err.message : "Não foi possível consultar o AISWEB.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPdf() {
    if (!generated || airports.length === 0) {
      showToast({ variant: "warning", title: "Gere o documento antes", message: "Clique em Gerar briefing." });
      return;
    }
    setExportingPdf(true);
    try {
      const mapImageDataUrl = waypoints.length
        ? await buildFlightPlanMapDataUrl(waypoints).catch(() => null)
        : null;
      openFlightPlanPdf({
        origin: normalizeIcao(origin),
        destination: normalizeIcao(destination),
        alternates,
        sections,
        airports,
        routeSummary: waypoints.length ? routeSummary : null,
        airspaces,
        cruiseSpeedKt: Number.isFinite(cruise) && cruise > 0 ? cruise : null,
        fuelBurnPerHour: Number.isFinite(burn) && burn > 0 ? burn : null,
        fuelUnit,
        routeText,
        mapImageDataUrl,
        mode: "paged",
        brand: getPdfBrand(),
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: "Exportação bloqueada",
        message: err instanceof Error ? err.message : "Não foi possível abrir o PDF.",
      });
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleOpenTabletBriefing() {
    if (!generated || airports.length === 0) {
      showToast({ variant: "warning", title: "Gere o documento antes", message: "Clique em Gerar briefing." });
      return;
    }
    setExportingPdf(true);
    try {
      const mapImageDataUrl = waypoints.length
        ? await buildFlightPlanMapDataUrl(waypoints).catch(() => null)
        : null;
      const saved = await saveOfflineFlightBriefing({
        origin: normalizeIcao(origin),
        destination: normalizeIcao(destination),
        alternates,
        sections,
        airports: airports.map((a) => ({
          role: a.role,
          icao: a.icao,
          bundle: a.bundle!,
          note: a.note || "",
        })),
        routeSummary: waypoints.length ? routeSummary : null,
        airspaces,
        cruiseSpeedKt: Number.isFinite(cruise) && cruise > 0 ? cruise : null,
        fuelBurnPerHour: Number.isFinite(burn) && burn > 0 ? burn : null,
        fuelUnit,
        routeText,
        mapImageDataUrl,
      });
      const path = offlineBriefingPath(saved.id);
      window.open(path, "_blank", "noopener,noreferrer");
      showToast({
        variant: "success",
        title: "Briefing no tablet",
        message: "Página offline aberta. No tablet, use “Atualizar METARs” quando estiver online.",
      });
    } catch (err) {
      showToast({
        variant: "error",
        title: "Falha ao salvar offline",
        message: err instanceof Error ? err.message : "Não foi possível abrir o briefing.",
      });
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="@container space-y-5">
      <section className="rounded-xl border border-slate-700/70 bg-slate-950/30 p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-100">Planejamento de voo</h2>
          <p className="mt-1 text-xs text-slate-500">
            Monte um briefing com origem, destino e alternativos, escolha as seções AISWEB e anexe a rota
            exportada do NexAtlas. Origem/destino são acrescentados automaticamente às coordenadas.
          </p>
        </div>

        <div className="grid gap-3 @lg:grid-cols-2">
          <IcaoField label="Origem" value={origin} onChange={setOrigin} />
          <IcaoField label="Destino" value={destination} onChange={setDestination} />
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Alternativos</p>
          <div className="flex flex-wrap gap-2">
            {alternates.map((icao) => (
              <span
                key={icao}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200"
              >
                {icao}
                <button
                  type="button"
                  className="text-slate-500 hover:text-rose-300"
                  aria-label={`Remover ${icao}`}
                  onClick={() => setAlternates((prev) => prev.filter((c) => c !== icao))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="grid gap-2 @lg:grid-cols-[1fr_auto] @lg:items-end">
            <IcaoField
              label="Buscar alternativo"
              value={altDraft}
              onChange={(icao) => {
                setAltDraft(icao);
                if (icao.length === 4) addAlternate(icao);
              }}
              placeholder="SDAG / Angra"
            />
            <button
              type="button"
              className={`${btnSecondary} mb-0.5`}
              onClick={() => addAlternate(altDraft)}
            >
              Adicionar
            </button>
          </div>
          {altSuggestions.length > 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Sugestões perto do destino/origem
              </p>
              <div className="flex flex-wrap gap-1.5">
                {altSuggestions.map((s) => (
                  <button
                    key={s.icao}
                    type="button"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-left text-[11px] text-slate-200 transition hover:border-cyan-500/40 hover:bg-slate-800"
                    onClick={() => addAlternate(s.icao)}
                    title={`${s.name} · ${s.municipality}/${s.uf}`}
                  >
                    <span className="font-semibold text-cyan-300">{s.icao}</span>
                    <span className="text-slate-500">
                      {" "}
                      · {s.distanceNm.toFixed(0)} NM · {s.near}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Informações no documento
          </p>
          <div className="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
            {FLIGHT_PLAN_INFO_OPTIONS.map((opt) => {
              const on = sections.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                    on
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-slate-700/70 bg-slate-950/40 hover:border-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={on}
                    onChange={() => toggleSection(opt.id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-100">{opt.label}</span>
                    <span className="block text-[11px] text-slate-500">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={loading} onClick={() => void handleGenerate()}>
            {loading ? "Gerando…" : "Gerar briefing"}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={!generated || exportingPdf}
            onClick={() => void handleExportPdf()}
          >
            {exportingPdf ? "Preparando mapa…" : "Exportar PDF"}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={!generated || exportingPdf}
            onClick={() => void handleOpenTabletBriefing()}
          >
            Abrir no tablet (offline)
          </button>
        </div>
      </section>

      {generated ? (
        <AirportSummaryStrip
          airports={airports}
          onNoteChange={(role, icao, note) => {
            setAirports((prev) =>
              prev.map((a) => (a.role === role && a.icao === icao ? { ...a, note } : a)),
            );
          }}
        />
      ) : null}

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/30 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">Rota NexAtlas / FPL</h2>
          <p className="mt-1 text-xs text-slate-500">
            Cole o texto exportado. As coordenadas de origem e destino entram automaticamente na rota.
          </p>
        </div>
        <textarea
          className={`${inputClass} min-h-[96px] font-mono text-xs`}
          value={routeText}
          onChange={(e) => setRouteText(e.target.value)}
          placeholder="DCT 2306S04634W 2312S04609W … DCT"
        />

        <div className="mt-3 grid gap-3 @md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vel. cruzeiro (kt)
            </span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={cruiseSpeedKt}
              onChange={(e) => setCruiseSpeedKt(e.target.value)}
              placeholder="90"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Consumo / hora
            </span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={fuelBurn}
              onChange={(e) => setFuelBurn(e.target.value)}
              placeholder="20"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unidade</span>
            <select className={inputClass} value={fuelUnit} onChange={(e) => setFuelUnit(e.target.value)}>
              <option value="L">Litros (L)</option>
              <option value="gal">Galões (gal)</option>
              <option value="kg">kg</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-2 @sm:grid-cols-2 @xl:grid-cols-4">
          {[
            { label: "Pontos", value: String(waypoints.length) },
            { label: "Distância", value: waypoints.length > 1 ? formatDistanceNm(routeSummary.distanceNm) : "—" },
            { label: "ETE", value: formatEteHours(routeSummary.eteHours) },
            {
              label: "Consumo estimado",
              value: formatFuel(routeSummary.fuelEstimate, fuelUnit),
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Distância = ARP origem + pontos NexAtlas + ARP destino (great-circle). Diferenças de ~1–2 NM vs
          NexAtlas costumam vir das coordenadas ARP usadas em cada base.
        </p>

        <div className="mt-4">
          <FlightPlanMap
            waypoints={waypoints}
            originLabel={origin || "DEP"}
            destLabel={destination || "ARR"}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Espaço aéreo na rota</h3>
            {airspaceLoading ? <span className="text-[11px] text-slate-500">Consultando…</span> : null}
          </div>
          <p className="mb-2 text-[11px] text-slate-500">Ordem cronológica de passagem · frequências APP/TWR/GND/ATIS do ROTAER</p>
          {airspaceError ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {airspaceError}
            </p>
          ) : null}
          {!airspaceLoading && !airspaceError && waypoints.length >= 2 && airspaces.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum CTA/TMA/CTR/ATZ detectado ao longo da rota.</p>
          ) : null}
          {airspaces.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold">Nome</th>
                    <th className="px-3 py-2 font-semibold">Ident</th>
                    <th className="px-3 py-2 font-semibold">Limites</th>
                    <th className="px-3 py-2 font-semibold">Frequências</th>
                    <th className="px-3 py-2 font-semibold">Entrada</th>
                  </tr>
                </thead>
                <tbody>
                  {airspaces.map((a, idx) => (
                    <tr key={`${a.type}-${a.ident}-${a.name}`} className="border-t border-slate-800/80">
                      <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            a.type === "CTA"
                              ? "bg-amber-500/20 text-amber-200"
                              : a.type === "TMA"
                                ? "bg-violet-500/20 text-violet-200"
                                : a.type === "CTR"
                                  ? "bg-sky-500/20 text-sky-200"
                                  : "bg-emerald-500/20 text-emerald-200"
                          }`}
                        >
                          {a.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-200">{a.name}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{a.ident}</td>
                      <td className="px-3 py-2 text-slate-400">
                        {a.lower || "—"} / {a.upper || "—"}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-slate-300">{formatAirspaceFreqCell(a)}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">
                        {a.entryDistanceNm != null ? `${a.entryDistanceNm.toFixed(1)} NM` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {generated ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Detalhes do briefing</h2>
            <button type="button" className={btnSecondary} onClick={() => void handleExportPdf()}>
              Exportar PDF
            </button>
            <button type="button" className={btnSecondary} onClick={() => void handleOpenTabletBriefing()}>
              Abrir no tablet
            </button>
          </div>
          <div className="grid gap-3">
            {airports.map((item) => (
              <AirportDocPreview
                key={`${item.role}-${item.icao}`}
                role={item.role === "origem" ? "Origem" : item.role === "destino" ? "Destino" : "Alternativo"}
                icao={item.icao}
                bundle={item.bundle}
                sections={sections}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
