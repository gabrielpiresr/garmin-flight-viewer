import { useEffect, useMemo, useRef, useState } from "react";
import { lookupAiswebIcao, searchAiswebAerodromes } from "../../lib/aiswebDb";
import { listAerodromes, type Aerodrome, type AerodromeMapFilter, EMPTY_AERODROME_MAP_FILTER } from "../../lib/aerodromesDb";
import { parseFieldElevationFt } from "../../lib/fieldElevation";
import {
  buildRoutePerformanceProfile,
  DEFAULT_FLIGHT_PERFORMANCE,
  type FlightPerformanceSettings,
} from "../../lib/routePerformanceProfile";
import { detectAirspacesAlongRoute, sampleRoutePoints } from "../../lib/airspaceIntersect";
import { suggestAlternateAerodromes, type AlternateSuggestion } from "../../lib/flightPlanAlternates";
import { formatAirspaceFreqCell } from "../../lib/flightPlanFormat";
import { buildFlightPlanMapDataUrl } from "../../lib/flightPlanMapImage";
import { openFlightPlanPdf } from "../../lib/flightPlanPdf";
import { buildRouteVerticalProfileSvg } from "../../lib/flightPlanProfileSvg";
import { getRouteElevation } from "../../lib/routeElevationDb";
import {
  buildFlightPlanLegs,
  findRouteInsertHint,
  formatBearingDeg,
  formatCompactAviationCoord,
  formatDistanceNm,
  formatEteClock,
  formatEteHours,
  formatFuel,
  haversineM,
  parseFplRouteText,
  snapWaypointsToAerodromes,
  snapWaypointsToFixes,
  summarizeFlightPlanRoute,
  waypointsToNexAtlasText,
} from "../../lib/flightPlanningRoute";
import { offlineBriefingPath, saveOfflineFlightBriefing } from "../../lib/offlineFlightBriefing";
import { getPdfBrand } from "../../lib/pdfBrand";
import { collectReaFixPoints, getCachedReaRoutes, loadReaRoutes, type ReaFixPoint } from "../../lib/reaRoutesDb";
import { resolveAirportCoords } from "../../lib/resolveAirportCoords";
import {
  deleteSavedFlightRoute,
  listSavedFlightRoutes,
  migrateLocalSavedFlightRoutesIfNeeded,
  saveFlightRoute,
  suggestRouteName,
  type SavedFlightRoute,
} from "../../lib/savedFlightRoutes";
import { normalizeIcao } from "../../lib/aiswebMetar";
import type { AiswebAerodromeMatch, AiswebAirportBundle } from "../../types/aisweb";
import {
  FLIGHT_PLAN_INFO_OPTIONS,
  type FlightPlanAirspaceHit,
  type FlightPlanInfoSection,
  type FlightPlanRouteTableRow,
  type FlightPlanWaypoint,
} from "../../types/flightPlanning";
import {
  AirportDocPreview,
  AirportSummaryStrip,
  IcaoField,
} from "../AiswebFlightPlanningTab";
import { AerodromeDetailsSidePanel } from "../AerodromePlanningModals";
import { FlightPlanMap, type MapPickCandidate } from "../FlightPlanMap";
import { RouteVerticalProfileChart } from "../RouteVerticalProfileChart";
import { useToast } from "../ui/ToastProvider";
import { matchReaCorridorForLeg, type LegCorridorInfo } from "../../lib/legCorridor";

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";
const btnIcon =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

const DEFAULT_SECTIONS: FlightPlanInfoSection[] = [
  "tabela_rota",
  "detalhes",
  "frequencias",
  "rmk",
  "compl",
  "notams",
  "suplementos",
  "meteorologia",
];

type AccumMode = "etapa" | "acumulado";

function waypointDisplayName(wp: FlightPlanWaypoint): string {
  if (wp.reaName) return wp.reaName;
  return wp.label;
}

function isAirportLike(wp: FlightPlanWaypoint): boolean {
  return wp.kind === "airport" || wp.kind === "origin" || wp.kind === "destination";
}

function fieldElevFtFromAerodrome(ad: Aerodrome | undefined | null): number | null {
  if (!ad) return null;
  return parseFieldElevationFt(ad.altitudeText);
}

function withDefaultFieldElevation(
  wp: FlightPlanWaypoint,
  elevFt: number | null | undefined,
): FlightPlanWaypoint {
  if (elevFt == null || !Number.isFinite(elevFt)) return wp;
  const rounded = Math.round(elevFt);
  const next: FlightPlanWaypoint = {
    ...wp,
    fieldElevFt: wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt) ? wp.fieldElevFt : rounded,
  };
  if (next.altitudeFt != null && Number.isFinite(next.altitudeFt)) return next;
  return { ...next, altitudeFt: rounded };
}

function normalizeRouteWaypoints(waypoints: FlightPlanWaypoint[]): FlightPlanWaypoint[] {
  if (!waypoints.length) return [];
  return waypoints.map((wp, idx) => {
    if (wp.kind === "fix" || wp.kind === "rea") return wp;
    if (waypoints.length === 1 || idx === 0) return { ...wp, kind: "origin" };
    if (idx === waypoints.length - 1) return { ...wp, kind: "destination" };
    if (wp.kind === "origin" || wp.kind === "destination") return { ...wp, kind: "airport" };
    return wp;
  });
}

function IconNewRoute() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.414a1.5 1.5 0 00-.44-1.06L12.646 2.44A1.5 1.5 0 0011.586 2H4.5zM11 3.5V7h3.5L11 3.5zM10 10a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 0110 10z" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h7.086a1.5 1.5 0 011.06.44l3.914 3.914a1.5 1.5 0 01.44 1.06V16.5A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 4v4.75c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25V4H5zm0 8.5v3h10v-3H5z" />
    </svg>
  );
}

function IconSaveAs() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h7.086a1.5 1.5 0 011.06.44l3.914 3.914a1.5 1.5 0 01.44 1.06V16.5A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 4v4.75c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25V4H5z" />
      <path d="M14.75 11.25a.75.75 0 00-1.5 0v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5z" />
    </svg>
  );
}

function IconReverse() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M7.22 3.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 01-1.06 1.06L8.5 5.56V12a.75.75 0 01-1.5 0V5.56L5.78 6.53a.75.75 0 01-1.06-1.06l2.25-2.25zM12.78 16.78a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 011.06-1.06l1.22 1.22V8a.75.75 0 011.5 0v6.69l1.22-1.22a.75.75 0 111.06 1.06l-2.25 2.25z" />
    </svg>
  );
}

/** Input de obs com estado local — evita re-render do mapa a cada tecla. */
function WaypointNoteInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (note: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      className="min-w-[8rem] rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-200"
      value={draft}
      placeholder="Obs…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function IconPlus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-5.586a.25.25 0 01-.177-.073l-1.414-1.414A1.75 1.75 0 007.836 3H3.75z" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function IconGrip() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-500" aria-hidden>
      <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
  );
}

function IconMeasure() {
  // Arrow Range: seta horizontal de duas pontas (anexo do usuário)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M4 12l4-4v3h8V8l4 4-4 4v-3H8v3l-4-4z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.287.072.57.166.846.282l1.345-.736a1 1 0 011.178.215l.962.962a1 1 0 01.215 1.178l-.736 1.345c.116.276.21.56.282.846l1.473.295a1 1 0 01.804.98v1.36a1 1 0 01-.804.98l-1.473.295a6.97 6.97 0 01-.282.846l.736 1.345a1 1 0 01-.215 1.178l-.962.962a1 1 0 01-1.178.215l-1.345-.736a6.97 6.97 0 01-.846.282l-.295 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.97 6.97 0 01-.846-.282l-1.345.736a1 1 0 01-1.178-.215l-.962-.962a1 1 0 01-.215-1.178l.736-1.345a6.97 6.97 0 01-.282-.846L1.804 11.66A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.072-.287.166-.57.282-.846L2.823 5.854a1 1 0 01.215-1.178l.962-.962a1 1 0 011.178-.215l1.345.736c.276-.116.56-.21.846-.282l.295-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function PlanejamentoTab() {
  const { showToast } = useToast();
  const [waypoints, setWaypoints] = useState<FlightPlanWaypoint[]>([]);
  const [pickMode, setPickMode] = useState(true);
  const [accumMode, setAccumMode] = useState<AccumMode>("acumulado");
  const [cruiseSpeedKt, setCruiseSpeedKt] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.cruiseSpeedKt));
  const [fuelBurn, setFuelBurn] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.cruiseBurnPerHour));
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(
    String(DEFAULT_FLIGHT_PERFORMANCE.cruiseAltitudeFt),
  );
  const [climbSpeedKt, setClimbSpeedKt] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.climbSpeedKt));
  const [climbRateFpm, setClimbRateFpm] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.climbRateFpm));
  const [climbBurn, setClimbBurn] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.climbBurnPerHour));
  const [descentSpeedKt, setDescentSpeedKt] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.descentSpeedKt));
  const [descentRateFpm, setDescentRateFpm] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.descentRateFpm));
  const [descentBurn, setDescentBurn] = useState(String(DEFAULT_FLIGHT_PERFORMANCE.descentBurnPerHour));
  const [fuelUnit, setFuelUnit] = useState("L");
  const [routeTextDraft, setRouteTextDraft] = useState("");
  const [aerodromes, setAerodromes] = useState<Aerodrome[]>([]);
  const [aerodromeFilter, setAerodromeFilter] = useState<AerodromeMapFilter>(EMPTY_AERODROME_MAP_FILTER);
  const [reaFixes, setReaFixes] = useState<ReaFixPoint[]>([]);
  const [rehFixes, setRehFixes] = useState<ReaFixPoint[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedFlightRoute[]>([]);
  const [savedRoutesLoading, setSavedRoutesLoading] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [detailBundle, setDetailBundle] = useState<AiswebAirportBundle | null>(null);
  const [bulkAltitudeFt, setBulkAltitudeFt] = useState("");
  const [editingRouteName, setEditingRouteName] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<AiswebAerodromeMatch[]>([]);
  const [searchingAdd, setSearchingAdd] = useState(false);
  const [fitKey, setFitKey] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const searchTimer = useRef<number | null>(null);

  // Briefing
  const [alternates, setAlternates] = useState<string[]>([]);
  const [altDraft, setAltDraft] = useState("");
  const [altSuggestions, setAltSuggestions] = useState<AlternateSuggestion[]>([]);
  const [sections, setSections] = useState<FlightPlanInfoSection[]>(DEFAULT_SECTIONS);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [generated, setGenerated] = useState(false);
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

  const cruise = Number(String(cruiseSpeedKt).replace(",", "."));
  const burn = Number(String(fuelBurn).replace(",", "."));
  const cruiseAlt = Number(String(cruiseAltitudeFt).replace(",", "."));
  const climbKt = Number(String(climbSpeedKt).replace(",", "."));
  const climbFpm = Number(String(climbRateFpm).replace(",", "."));
  const climbBurnN = Number(String(climbBurn).replace(",", "."));
  const descentKt = Number(String(descentSpeedKt).replace(",", "."));
  const descentFpm = Number(String(descentRateFpm).replace(",", "."));
  const descentBurnN = Number(String(descentBurn).replace(",", "."));

  const cruiseOpt = Number.isFinite(cruise) && cruise > 0 ? cruise : null;
  const burnOpt = Number.isFinite(burn) && burn > 0 ? burn : null;

  const performanceSettings = useMemo<FlightPerformanceSettings>(() => {
    const fromSettings =
      Number.isFinite(cruiseAlt) && cruiseAlt > 0
        ? Math.round(cruiseAlt)
        : DEFAULT_FLIGHT_PERFORMANCE.cruiseAltitudeFt;
    // Keep profile in sync with altitudes typed on intermediate legs in the route table.
    let fromTable = 0;
    for (let i = 1; i < waypoints.length - 1; i++) {
      const alt = waypoints[i]?.altitudeFt;
      if (alt == null || !Number.isFinite(alt)) continue;
      fromTable = Math.max(fromTable, Math.round(alt));
    }
    return {
      cruiseSpeedKt: cruiseOpt ?? DEFAULT_FLIGHT_PERFORMANCE.cruiseSpeedKt,
      cruiseBurnPerHour: burnOpt ?? DEFAULT_FLIGHT_PERFORMANCE.cruiseBurnPerHour,
      cruiseAltitudeFt: Math.max(fromSettings, fromTable),
      climbSpeedKt:
        Number.isFinite(climbKt) && climbKt > 0 ? climbKt : DEFAULT_FLIGHT_PERFORMANCE.climbSpeedKt,
      climbRateFpm:
        Number.isFinite(climbFpm) && climbFpm > 0 ? climbFpm : DEFAULT_FLIGHT_PERFORMANCE.climbRateFpm,
      climbBurnPerHour:
        Number.isFinite(climbBurnN) && climbBurnN > 0
          ? climbBurnN
          : DEFAULT_FLIGHT_PERFORMANCE.climbBurnPerHour,
      descentSpeedKt:
        Number.isFinite(descentKt) && descentKt > 0
          ? descentKt
          : DEFAULT_FLIGHT_PERFORMANCE.descentSpeedKt,
      descentRateFpm:
        Number.isFinite(descentFpm) && descentFpm > 0
          ? descentFpm
          : DEFAULT_FLIGHT_PERFORMANCE.descentRateFpm,
      descentBurnPerHour:
        Number.isFinite(descentBurnN) && descentBurnN > 0
          ? descentBurnN
          : DEFAULT_FLIGHT_PERFORMANCE.descentBurnPerHour,
    };
  }, [
    cruiseOpt,
    burnOpt,
    cruiseAlt,
    climbKt,
    climbFpm,
    climbBurnN,
    descentKt,
    descentFpm,
    descentBurnN,
    waypoints,
  ]);

  const performanceProfile = useMemo(
    () => buildRoutePerformanceProfile(waypoints, performanceSettings),
    [waypoints, performanceSettings],
  );

  const legs = useMemo(
    () => buildFlightPlanLegs(waypoints, { cruiseSpeedKt: cruiseOpt, fuelBurnPerHour: burnOpt }),
    [waypoints, cruiseOpt, burnOpt],
  );
  const summary = useMemo(() => {
    const base = summarizeFlightPlanRoute(waypoints, {
      cruiseSpeedKt: cruiseOpt,
      fuelBurnPerHour: burnOpt,
    });
    if (!performanceProfile) return base;
    return {
      ...base,
      eteHours: performanceProfile.eteHours ?? base.eteHours,
      fuelEstimate: performanceProfile.fuelEstimate ?? base.fuelEstimate,
    };
  }, [waypoints, cruiseOpt, burnOpt, performanceProfile]);

  const phaseMarkers = useMemo(() => {
    return (performanceProfile?.phaseMarkers ?? []).map((m) => ({
      lat: m.lat,
      lng: m.lng,
      label: m.label,
    }));
  }, [performanceProfile]);

  const originIcao = useMemo(() => {
    const first = waypoints.find(isAirportLike);
    return first && /^[A-Z0-9]{4}$/.test(first.label) ? first.label : "";
  }, [waypoints]);

  const destIcao = useMemo(() => {
    const airportsOnly = waypoints.filter(isAirportLike);
    if (airportsOnly.length < 2) return "";
    const last = airportsOnly[airportsOnly.length - 1];
    return last && /^[A-Z0-9]{4}$/.test(last.label) ? last.label : "";
  }, [waypoints]);

  const routeLabel = useMemo(() => {
    if (waypoints.length === 0) return "Nova rota";
    return `${waypointDisplayName(waypoints[0]!)} – ${waypointDisplayName(waypoints[waypoints.length - 1]!)}`;
  }, [waypoints]);

  const displayRouteName = saveName.trim() || (waypoints.length ? suggestRouteName(waypoints) : routeLabel);

  const nexAtlasText = useMemo(() => waypointsToNexAtlasText(waypoints), [waypoints]);

  const legCorridors = useMemo(() => {
    const features = [
      ...(getCachedReaRoutes("rea")?.features || []),
      ...(getCachedReaRoutes("reh")?.features || []),
    ];
    const out: Array<LegCorridorInfo | null> = [null];
    for (let i = 1; i < waypoints.length; i++) {
      out.push(matchReaCorridorForLeg(waypoints[i - 1]!, waypoints[i]!, features));
    }
    return out;
  }, [waypoints, reaFixes, rehFixes]);

  // Auto ALT = teto do corredor quando o trecho está em um corredor REA/REH.
  useEffect(() => {
    if (waypoints.length < 2) return;
    setWaypoints((prev) => {
      let changed = false;
      const next = prev.map((wp, idx) => {
        if (idx === 0) return wp;
        const corridor = legCorridors[idx];
        if (corridor?.altMax == null || !Number.isFinite(corridor.altMax)) return wp;
        const max = Math.round(corridor.altMax);
        const cur = wp.altitudeFt;
        const field = wp.fieldElevFt;
        // Apply when empty, still at field elev, or already tracking a corridor ceiling.
        if (
          cur == null ||
          !Number.isFinite(cur) ||
          (field != null && cur === Math.round(field)) ||
          cur === max
        ) {
          if (cur === max) return wp;
          changed = true;
          return { ...wp, altitudeFt: max };
        }
        return wp;
      });
      return changed ? next : prev;
    });
  }, [legCorridors, waypoints.length]);

  useEffect(() => {
    setRouteTextDraft(nexAtlasText);
  }, [nexAtlasText]);

  useEffect(() => {
    let cancelled = false;
    setSavedRoutesLoading(true);
    void (async () => {
      try {
        const migrated = await migrateLocalSavedFlightRoutesIfNeeded();
        if (migrated > 0 && !cancelled) {
          showToast({
            variant: "success",
            title: "Rotas migradas",
            message: `${migrated} rota(s) do navegador foram salvas na sua conta.`,
          });
        }
        const routes = await listSavedFlightRoutes();
        if (!cancelled) setSavedRoutes(routes);
      } catch (err) {
        if (!cancelled) {
          setSavedRoutes([]);
          showToast({
            variant: "warning",
            title: "Rotas salvas",
            message: err instanceof Error ? err.message : "Não foi possível carregar rotas da conta.",
          });
        }
      } finally {
        if (!cancelled) setSavedRoutesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listAerodromes()
      .then((rows) => {
        if (!cancelled) setAerodromes(rows);
      })
      .catch(() => {
        if (!cancelled) setAerodromes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default altitude of aerodrome waypoints (incl. origin/destination) to field elevation.
  useEffect(() => {
    if (!aerodromes.length || waypoints.length === 0) return;
    setWaypoints((prev) => {
      let changed = false;
      const next = prev.map((wp) => {
        if (!isAirportLike(wp)) return wp;
        if (wp.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return wp;
        const code = normalizeIcao(wp.label || wp.raw);
        const ad =
          (code.length === 4 ? aerodromes.find((a) => a.icao === code) : null) ||
          aerodromes.find(
            (a) =>
              a.latitudeGeoPoint != null &&
              a.longitudeGeoPoint != null &&
              haversineM(wp, { lat: a.latitudeGeoPoint, lng: a.longitudeGeoPoint }) < 1852 * 0.5,
          );
        const elevFt = fieldElevFtFromAerodrome(ad);
        if (elevFt == null) return wp;
        changed = true;
        return {
          ...wp,
          fieldElevFt: wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt) ? wp.fieldElevFt : elevFt,
          altitudeFt: wp.altitudeFt != null && Number.isFinite(wp.altitudeFt) ? wp.altitudeFt : elevFt,
        };
      });
      return changed ? next : prev;
    });
  }, [aerodromes, waypoints]);

  useEffect(() => {
    let cancelled = false;
    const refreshFixes = () => {
      void Promise.all([loadReaRoutes("rea"), loadReaRoutes("reh")])
        .then(([rea, reh]) => {
          if (cancelled) return;
          setReaFixes(collectReaFixPoints(rea.features));
          setRehFixes(collectReaFixPoints(reh.features));
        })
        .catch(() => {
          if (!cancelled) {
            setReaFixes([]);
            setRehFixes([]);
          }
        });
    };
    void Promise.all([
      loadReaRoutes("rea", {
        onUpdate: () => {
          if (!cancelled) refreshFixes();
        },
      }),
      loadReaRoutes("reh", {
        onUpdate: () => {
          if (!cancelled) refreshFixes();
        },
      }),
    ])
      .then(([rea, reh]) => {
        if (cancelled) return;
        setReaFixes(collectReaFixPoints(rea.features));
        setRehFixes(collectReaFixPoints(reh.features));
      })
      .catch(() => {
        if (!cancelled) {
          setReaFixes([]);
          setRehFixes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchMatches([]);
      return;
    }
    searchTimer.current = window.setTimeout(() => {
      void searchAiswebAerodromes(q, 8)
        .then((res) => setSearchMatches(res.matches))
        .catch(() => setSearchMatches([]));
    }, 280);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const originWp = waypoints.find(isAirportLike);
      const destWp = [...waypoints].reverse().find(isAirportLike);
      void suggestAlternateAerodromes({
        origin:
          originWp && originIcao
            ? { lat: originWp.lat, lng: originWp.lng, icao: originIcao }
            : null,
        destination:
          destWp && destIcao ? { lat: destWp.lat, lng: destWp.lng, icao: destIcao } : null,
        excludeIcaos: [originIcao, destIcao, ...alternates],
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
  }, [waypoints, originIcao, destIcao, alternates]);

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
    const profile = performanceProfile?.profile ?? null;
    const timer = window.setTimeout(() => {
      void detectAirspacesAlongRoute(samples, { performanceProfile: profile })
        .then((hits) => {
          if (!cancelled) setAirspaces(hits);
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
  }, [waypoints, performanceProfile]);

  function insertWaypoint(wp: FlightPlanWaypoint, insertIndex?: number) {
    setWaypoints((prev) => {
      // Evita duplicar ponto já na rota (~0.4 NM).
      const dup = prev.findIndex((p) => haversineM(p, wp) < 1852 * 0.4);
      if (dup >= 0) return prev;
      const next = [...prev];
      const idx =
        insertIndex != null && insertIndex >= 0 && insertIndex <= next.length
          ? insertIndex
          : findRouteInsertHint(next, wp).insertIndex;
      next.splice(idx, 0, wp);
      return normalizeRouteWaypoints(next);
    });
    setGenerated(false);
  }

  function appendWaypoint(wp: FlightPlanWaypoint) {
    insertWaypoint(wp);
  }

  function handlePickPoint(candidate: MapPickCandidate, opts?: { insertIndex?: number; confirmBetween?: boolean }) {
    const elevFt =
      candidate.kind === "rea"
        ? null
        : parseFieldElevationFt(candidate.altitude) ??
          fieldElevFtFromAerodrome(
            aerodromes.find((a) => a.icao && candidate.icao && a.icao === normalizeIcao(candidate.icao)),
          );
    const wp: FlightPlanWaypoint = withDefaultFieldElevation(
      {
        raw: candidate.icao || candidate.label,
        lat: candidate.lat,
        lng: candidate.lng,
        label: candidate.icao || candidate.label,
        kind: candidate.kind === "rea" ? "rea" : "airport",
        ...(candidate.kind === "rea" ? { reaName: candidate.label } : {}),
      },
      elevFt,
    );

    if (waypoints.some((p) => haversineM(p, wp) < 1852 * 0.4)) {
      showToast({
        variant: "warning",
        title: "Já na rota",
        message: candidate.icao || candidate.label,
      });
      return;
    }

    const forced = opts?.insertIndex;
    const hint =
      forced != null
        ? {
            insertIndex: forced,
            mode: "between" as const,
            fromIndex: Math.max(0, forced - 1),
            toIndex: Math.min(waypoints.length - 1, forced),
          }
        : findRouteInsertHint(waypoints, wp);

    insertWaypoint(wp, forced ?? hint.insertIndex);
    if (hint.mode === "between") {
      const from = waypoints[hint.fromIndex];
      const to = waypoints[hint.toIndex];
      showToast({
        variant: "success",
        title: "Inserido na rota",
        message: `${candidate.icao || candidate.label} entre ${from ? waypointDisplayName(from) : "?"} e ${to ? waypointDisplayName(to) : "?"}`,
      });
    } else {
      showToast({
        variant: "success",
        title: "Adicionado à rota",
        message: candidate.icao || candidate.label,
      });
    }
  }

  async function addSearchMatch(match: AiswebAerodromeMatch) {
    const code = normalizeIcao(match.icao);
    setSearchingAdd(true);
    try {
      const fromDb = aerodromes.find((a) => a.icao === code);
      let elevFt = fieldElevFtFromAerodrome(fromDb);
      if (elevFt == null) {
        try {
          const bundle = await lookupAiswebIcao(code);
          if (bundle.rotaer?.altFt != null && Number.isFinite(bundle.rotaer.altFt)) {
            elevFt = Math.round(bundle.rotaer.altFt);
          }
        } catch {
          // keep elevFt null
        }
      }
      if (fromDb?.latitudeGeoPoint != null && fromDb.longitudeGeoPoint != null) {
        appendWaypoint(
          withDefaultFieldElevation(
            {
              raw: code,
              lat: fromDb.latitudeGeoPoint,
              lng: fromDb.longitudeGeoPoint,
              label: code,
              kind: "airport",
            },
            elevFt,
          ),
        );
      } else {
        const coords = await resolveAirportCoords(code);
        if (!coords) {
          showToast({
            variant: "error",
            title: "Sem coordenadas",
            message: `Não foi possível obter a posição de ${code} (AISWEB/catálogo).`,
          });
          return;
        }
        appendWaypoint(
          withDefaultFieldElevation(
            {
              raw: code,
              lat: coords.lat,
              lng: coords.lng,
              label: code,
              kind: "airport",
            },
            elevFt,
          ),
        );
      }
      setSearchQuery("");
      setSearchMatches([]);
      showToast({ variant: "success", title: "Aeródromo adicionado", message: code });
    } finally {
      setSearchingAdd(false);
    }
  }

  function removeWaypoint(index: number) {
    setWaypoints((prev) => normalizeRouteWaypoints(prev.filter((_, i) => i !== index)));
    setGenerated(false);
  }

  function reorderWaypoint(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setWaypoints((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return normalizeRouteWaypoints(next);
    });
    setGenerated(false);
  }

  function clearRoute() {
    setWaypoints([]);
    setAlternates([]);
    setActiveSavedId(null);
    setSaveName("");
    setGenerated(false);
    setAirports([]);
  }

  function newRoute() {
    clearRoute();
    showToast({ variant: "success", title: "Nova rota", message: "Roteiro limpo para começar do zero." });
  }

  function reverseRoute() {
    setWaypoints((prev) => normalizeRouteWaypoints([...prev].reverse()));
    setGenerated(false);
  }

  function importFromText() {
    const snappedRea = snapWaypointsToFixes(parseFplRouteText(routeTextDraft), [...reaFixes, ...rehFixes]);
    const parsed = snapWaypointsToAerodromes(snappedRea, aerodromes);
    if (!parsed.length) {
      showToast({
        variant: "error",
        title: "Rota vazia",
        message: "Cole coordenadas no formato NexAtlas/FPL (ex.: 2306S04634W).",
      });
      return;
    }
    setWaypoints(normalizeRouteWaypoints(parsed));
    setActiveSavedId(null);
    setGenerated(false);
    setFitKey(`import-${Date.now()}`);
    showToast({
      variant: "success",
      title: "Rota importada",
      message: `${parsed.length} ponto(s) · REA/AD por proximidade.`,
    });
  }

  async function handleSave() {
    if (waypoints.length < 2) {
      showToast({
        variant: "warning",
        title: "Rota incompleta",
        message: "Adicione ao menos 2 pontos para salvar.",
      });
      return;
    }
    try {
      if (activeSavedId) {
        const saved = await saveFlightRoute({
          id: activeSavedId,
          name: (saveName.trim() || suggestRouteName(waypoints)).trim(),
          waypoints,
          alternates,
          cruiseSpeedKt: cruiseOpt,
          fuelBurnPerHour: burnOpt,
          fuelUnit,
        });
        setActiveSavedId(saved.id);
        setSaveName(saved.name);
        setSavedRoutes(await listSavedFlightRoutes());
        showToast({ variant: "success", title: "Rota atualizada", message: saved.name });
        return;
      }
      await handleSaveAs();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Falha ao salvar",
        message: err instanceof Error ? err.message : "Não foi possível salvar a rota.",
      });
    }
  }

  async function handleSaveAs() {
    if (waypoints.length < 2) {
      showToast({
        variant: "warning",
        title: "Rota incompleta",
        message: "Adicione ao menos 2 pontos para salvar.",
      });
      return;
    }
    const suggested = (saveName.trim() || suggestRouteName(waypoints)).trim();
    const name = window.prompt("Salvar como — nome da rota:", suggested)?.trim();
    if (!name) return;
    try {
      const saved = await saveFlightRoute({
        name,
        waypoints,
        alternates,
        cruiseSpeedKt: cruiseOpt,
        fuelBurnPerHour: burnOpt,
        fuelUnit,
      });
      setActiveSavedId(saved.id);
      setSaveName(saved.name);
      setSavedRoutes(await listSavedFlightRoutes());
      showToast({ variant: "success", title: "Rota salva como", message: saved.name });
    } catch (err) {
      showToast({
        variant: "error",
        title: "Falha ao salvar",
        message: err instanceof Error ? err.message : "Não foi possível salvar a rota.",
      });
    }
  }

  function handleLoad(route: SavedFlightRoute) {
    setWaypoints(normalizeRouteWaypoints(route.waypoints));
    setAlternates(Array.isArray(route.alternates) ? [...route.alternates] : []);
    setActiveSavedId(route.id);
    setSaveName(route.name);
    if (route.cruiseSpeedKt != null) setCruiseSpeedKt(String(route.cruiseSpeedKt));
    if (route.fuelBurnPerHour != null) setFuelBurn(String(route.fuelBurnPerHour));
    if (route.fuelUnit) setFuelUnit(route.fuelUnit);
    setShowSavedPanel(false);
    setGenerated(false);
    setFitKey(`load-${route.id}-${Date.now()}`);
    showToast({ variant: "success", title: "Rota carregada", message: route.name });
  }

  async function handleDeleteSaved(id: string) {
    try {
      await deleteSavedFlightRoute(id);
      setSavedRoutes(await listSavedFlightRoutes());
      if (activeSavedId === id) setActiveSavedId(null);
    } catch (err) {
      showToast({
        variant: "error",
        title: "Falha ao excluir",
        message: err instanceof Error ? err.message : "Não foi possível excluir a rota.",
      });
    }
  }

  function toggleSection(id: FlightPlanInfoSection) {
    setSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function addAlternate(icaoRaw: string) {
    const icao = normalizeIcao(icaoRaw);
    if (icao.length !== 4) {
      showToast({ variant: "error", title: "ICAO inválido", message: "Informe 4 caracteres." });
      return;
    }
    if (alternates.includes(icao) || icao === originIcao || icao === destIcao) {
      showToast({ variant: "warning", title: "Já incluído", message: `${icao} já está no plano.` });
      return;
    }
    setAlternates((prev) => [...prev, icao]);
    setAltDraft("");
  }

  async function handleGenerate() {
    const dep = originIcao;
    const arr = destIcao;
    if (dep.length !== 4 || arr.length !== 4) {
      showToast({
        variant: "error",
        title: "Origem e destino",
        message: "A rota precisa de aeródromos de origem e destino (ICAO) para o briefing.",
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
    setLoadingBriefing(true);
    try {
      const prevNotes = new Map(airports.map((a) => [`${a.role}:${a.icao}`, a.note || ""] as const));
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
      setWaypoints((prev) => {
        let changed = false;
        const next = prev.map((wp) => {
          if (!isAirportLike(wp)) return wp;
          if (wp.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return wp;
          const code = normalizeIcao(wp.label || wp.raw);
          const hit = results.find((r) => r.icao === code);
          const altFt = hit?.bundle?.rotaer?.altFt;
          if (altFt == null || !Number.isFinite(altFt)) return wp;
          const rounded = Math.round(altFt);
          changed = true;
          return {
            ...wp,
            fieldElevFt:
              wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt) ? wp.fieldElevFt : rounded,
            altitudeFt: wp.altitudeFt != null && Number.isFinite(wp.altitudeFt) ? wp.altitudeFt : rounded,
          };
        });
        return changed ? next : prev;
      });
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
      setLoadingBriefing(false);
    }
  }

  async function handleExportPdf() {
    if (!generated || airports.length === 0) {
      showToast({ variant: "warning", title: "Gere o documento antes", message: "Clique em Gerar briefing." });
      return;
    }
    setExportingPdf(true);
    try {
      let mapImageDataUrl: string | null = null;
      if (waypoints.length) {
        try {
          mapImageDataUrl = await buildFlightPlanMapDataUrl(waypoints);
        } catch (err) {
          showToast({
            variant: "warning",
            title: "Mapa do PDF",
            message: err instanceof Error ? err.message : "Não foi possível gerar o mapa raster.",
          });
        }
        if (!mapImageDataUrl) {
          showToast({
            variant: "warning",
            title: "Mapa do PDF",
            message: "Tiles indisponíveis — usando mapa esquemático.",
          });
        }
      }

      let terrain: Awaited<ReturnType<typeof getRouteElevation>>["points"] = [];
      try {
        if (waypoints.length >= 2) {
          const elev = await getRouteElevation(
            waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
            { samples: 80 },
          );
          terrain = elev.points;
        }
      } catch {
        terrain = [];
      }

      const verticalProfileSvg =
        waypoints.length >= 2
          ? buildRouteVerticalProfileSvg({
              waypoints,
              performanceProfile: performanceProfile?.profile ?? null,
              terrain,
              corridors: legCorridors,
              cruiseSpeedKt: cruiseOpt,
            })
          : null;

      const routeTableRows: FlightPlanRouteTableRow[] = waypoints.map((wp, idx) => {
        const leg = idx > 0 ? legs[idx - 1] : null;
        const corridor = idx > 0 ? legCorridors[idx] : null;
        return {
          index: idx + 1,
          point: waypointDisplayName(wp),
          bearing: leg ? formatBearingDeg(leg.bearingDeg) : "—",
          altitude: wp.altitudeFt != null ? `${Math.round(wp.altitudeFt)} ft` : "—",
          corridor: corridor
            ? `${corridor.name} (${corridor.altMin ?? "—"}/${corridor.altMax ?? "—"})`
            : "—",
          distance: leg ? `${leg.distanceNm.toFixed(1)} nm` : "—",
          distanceAccum: leg ? `${leg.cumulativeDistanceNm.toFixed(1)} nm` : "—",
          ete: formatEteClock(leg?.eteHours ?? null),
          eteAccum: formatEteClock(leg?.cumulativeEteHours ?? null),
          fuel: leg?.fuelEstimate != null ? `${leg.fuelEstimate.toFixed(1)} ${fuelUnit}` : "—",
          fuelAccum:
            leg?.cumulativeFuel != null ? `${leg.cumulativeFuel.toFixed(1)} ${fuelUnit}` : "—",
          note: wp.note || "—",
        };
      });

      openFlightPlanPdf({
        origin: originIcao,
        destination: destIcao,
        alternates,
        sections,
        airports,
        routeSummary: waypoints.length ? summary : null,
        airspaces,
        cruiseSpeedKt: cruiseOpt,
        fuelBurnPerHour: burnOpt,
        fuelUnit,
        routeText: nexAtlasText,
        mapImageDataUrl,
        verticalProfileSvg,
        routeTableRows,
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
      const routeTableRows: FlightPlanRouteTableRow[] = waypoints.map((wp, idx) => {
        const leg = idx > 0 ? legs[idx - 1] : null;
        const corridor = idx > 0 ? legCorridors[idx] : null;
        return {
          index: idx + 1,
          point: waypointDisplayName(wp),
          bearing: leg ? formatBearingDeg(leg.bearingDeg) : "—",
          altitude: wp.altitudeFt != null ? `${Math.round(wp.altitudeFt)} ft` : "—",
          corridor: corridor
            ? `${corridor.name} (${corridor.altMin ?? "—"}/${corridor.altMax ?? "—"})`
            : "—",
          distance: leg ? `${leg.distanceNm.toFixed(1)} nm` : "—",
          distanceAccum: leg ? `${leg.cumulativeDistanceNm.toFixed(1)} nm` : "—",
          ete: formatEteClock(leg?.eteHours ?? null),
          eteAccum: formatEteClock(leg?.cumulativeEteHours ?? null),
          fuel: leg?.fuelEstimate != null ? `${leg.fuelEstimate.toFixed(1)} ${fuelUnit}` : "—",
          fuelAccum:
            leg?.cumulativeFuel != null ? `${leg.cumulativeFuel.toFixed(1)} ${fuelUnit}` : "—",
          note: wp.note || "—",
        };
      });
      let terrainPts: Awaited<ReturnType<typeof getRouteElevation>>["points"] = [];
      try {
        if (waypoints.length >= 2) {
          terrainPts = (
            await getRouteElevation(
              waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
              { samples: 60 },
            )
          ).points;
        }
      } catch {
        terrainPts = [];
      }
      const verticalProfileSvg =
        waypoints.length >= 2
          ? buildRouteVerticalProfileSvg({
              waypoints,
              performanceProfile: performanceProfile?.profile ?? null,
              terrain: terrainPts,
              corridors: legCorridors,
              cruiseSpeedKt: cruiseOpt,
            })
          : null;
      const saved = await saveOfflineFlightBriefing({
        origin: originIcao,
        destination: destIcao,
        alternates,
        sections,
        airports: airports.map((a) => ({
          role: a.role,
          icao: a.icao,
          bundle: a.bundle,
          note: a.note || "",
        })),
        routeSummary: waypoints.length ? summary : null,
        airspaces,
        cruiseSpeedKt: cruiseOpt,
        fuelBurnPerHour: burnOpt,
        fuelUnit,
        routeText: nexAtlasText,
        mapImageDataUrl,
        verticalProfileSvg,
        routeTableRows,
      });
      window.open(offlineBriefingPath(saved.id), "_blank", "noopener,noreferrer");
      showToast({
        variant: "success",
        title: "Briefing no tablet",
        message: "Página offline aberta.",
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
    <div className="@container flex flex-col gap-3">
      <FlightPlanMap
        waypoints={waypoints}
        originLabel={waypoints[0] ? waypointDisplayName(waypoints[0]) : null}
        destLabel={
          waypoints.length > 1 ? waypointDisplayName(waypoints[waypoints.length - 1]!) : null
        }
        interactive
        pickMode={pickMode && !measureMode}
        onPickPoint={handlePickPoint}
        aerodromes={aerodromes}
        aerodromeFilter={aerodromeFilter}
        onAerodromeFilterChange={setAerodromeFilter}
        reaFixes={reaFixes}
        rehFixes={rehFixes}
        showAerodromes
        cruiseSpeedKt={cruiseOpt}
        showLegBubbles
        fitKey={fitKey}
        phaseMarkers={phaseMarkers}
        mapHeightClass="h-[620px] sm:h-[720px]"
        className="w-full shrink-0"
        measureMode={measureMode}
        onMeasureModeChange={setMeasureMode}
        onWaypointRemove={(index) => removeWaypoint(index)}
        onAerodromeDetails={(bundle) => setDetailBundle(bundle)}
        mapOverlayMaxWidthClass="w-[min(100%-1rem,24rem)]"
        mapOverlay={
          <aside className="flex max-h-[inherit] w-full flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/80 opacity-80 shadow-2xl shadow-black/40 backdrop-blur-md transition-[opacity,background-color] duration-200 ease-out hover:bg-slate-950/95 hover:opacity-100">
          <div className="space-y-3 overflow-y-auto p-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Planejamento</h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`${btnIcon} ${pickMode ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : ""}`}
                title={pickMode ? "Modo adicionar ativo" : "Ativar modo adicionar"}
                onClick={() => setPickMode((v) => !v)}
              >
                <IconPlus />
              </button>
              <button
                type="button"
                className={btnIcon}
                title="Nova rota"
                onClick={newRoute}
                disabled={!waypoints.length && !activeSavedId}
              >
                <IconNewRoute />
              </button>
              <button
                type="button"
                className={btnIcon}
                title={activeSavedId ? "Salvar (atualizar)" : "Salvar"}
                onClick={() => void handleSave()}
                disabled={waypoints.length < 2}
              >
                <IconSave />
              </button>
              <button
                type="button"
                className={btnIcon}
                title="Salvar como…"
                onClick={() => void handleSaveAs()}
                disabled={waypoints.length < 2}
              >
                <IconSaveAs />
              </button>
              <button
                type="button"
                className={btnIcon}
                title="Inverter rota"
                onClick={reverseRoute}
                disabled={waypoints.length < 2}
              >
                <IconReverse />
              </button>
              <button
                type="button"
                className={`${btnIcon} ${showSavedPanel ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : ""}`}
                title="Rotas salvas"
                onClick={() => setShowSavedPanel((v) => !v)}
              >
                <IconFolder />
              </button>
              <button
                type="button"
                className={`${btnIcon} ${measureMode ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : ""}`}
                title={measureMode ? "Medição ativa — clique no mapa" : "Medir distância"}
                onClick={() => {
                  setMeasureMode((v) => !v);
                  if (!measureMode) setPickMode(false);
                }}
              >
                <IconMeasure />
              </button>
              <button
                type="button"
                className={btnIcon}
                title="Configurações (cruzeiro e consumo)"
                onClick={() => setShowConfigModal(true)}
              >
                <IconGear />
              </button>
            </div>

            <div className="relative">
              <input
                className={inputClass}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Aeródromo, ICAO, cidade…"
                autoComplete="off"
                disabled={searchingAdd}
              />
              {searchMatches.length > 0 ? (
                <ul className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl">
                  {searchMatches.map((m) => (
                    <li key={m.icao}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                        onClick={() => void addSearchMatch(m)}
                      >
                        <span className="font-semibold text-emerald-300">{m.icao}</span>
                        {m.name ? <span className="text-slate-400"> — {m.name}</span> : null}
                        {m.city || m.uf ? (
                          <span className="block text-[11px] text-slate-500">
                            {[m.city, m.uf].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rota</p>
              {editingRouteName ? (
                <input
                  className={`${inputClass} mt-0.5`}
                  value={saveName}
                  autoFocus
                  placeholder={suggestRouteName(waypoints) || "Nome da rota"}
                  onChange={(e) => setSaveName(e.target.value)}
                  onBlur={() => setEditingRouteName(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      setEditingRouteName(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="group mt-0.5 flex w-full items-center gap-1.5 text-left"
                  onClick={() => {
                    if (!saveName.trim() && waypoints.length) {
                      setSaveName(suggestRouteName(waypoints));
                    }
                    setEditingRouteName(true);
                  }}
                  title="Editar nome da rota"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
                    {displayRouteName}
                  </span>
                  <span className="shrink-0 text-slate-500 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <IconEdit />
                  </span>
                </button>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                <span>{waypoints.length} pts</span>
                <span>{waypoints.length > 1 ? formatDistanceNm(summary.distanceNm) : "—"}</span>
                <span>{formatEteHours(summary.eteHours)}</span>
                <span>{formatFuel(summary.fuelEstimate, fuelUnit)}</span>
              </div>
            </div>

            {showSavedPanel ? (
              <div className="max-h-40 overflow-auto rounded-lg border border-slate-800 p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Rotas salvas ({savedRoutes.length})
                </p>
                {savedRoutesLoading ? (
                  <p className="text-xs text-slate-500">Carregando rotas da conta…</p>
                ) : savedRoutes.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma rota salva na sua conta.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {savedRoutes.map((r) => (
                      <li
                        key={r.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                          activeSavedId === r.id
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-900/50"
                        }`}
                      >
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleLoad(r)}>
                          <p className="truncate text-sm font-semibold text-slate-100">{r.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {r.waypoints.length} pts · {new Date(r.updatedAt).toLocaleDateString("pt-BR")}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="text-slate-500 hover:text-rose-300"
                          title="Excluir"
                          onClick={() => void handleDeleteSaved(r.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="border-t border-slate-800 pt-2">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="text-xs font-semibold text-slate-100">Tabela da rota</h3>
              <div className="inline-flex rounded-md border border-slate-700 bg-slate-950 p-0.5">
                {(
                  [
                    ["etapa", "Etapa"],
                    ["acumulado", "Acum."],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAccumMode(id)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                      accumMode === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {waypoints.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-[11px] text-slate-500">
                Adicione pontos para montar a tabela.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-950/95 text-[9px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="w-5 px-1 py-1" />
                      <th className="px-1.5 py-1 font-semibold">Ponto</th>
                      <th className="px-1.5 py-1 font-semibold">Proa</th>
                      <th className="px-1.5 py-1 font-semibold">Dist</th>
                      <th className="px-1.5 py-1 font-semibold">Tempo</th>
                      <th className="px-1.5 py-1 font-semibold">Cons.</th>
                      <th className="px-1 py-1 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {waypoints.map((wp, idx) => {
                      const leg = idx > 0 ? legs[idx - 1] : null;
                      const dist =
                        leg == null
                          ? null
                          : accumMode === "acumulado"
                            ? leg.cumulativeDistanceNm
                            : leg.distanceNm;
                      const ete =
                        leg == null
                          ? null
                          : accumMode === "acumulado"
                            ? leg.cumulativeEteHours
                            : leg.eteHours;
                      const fuel =
                        leg == null
                          ? null
                          : accumMode === "acumulado"
                            ? leg.cumulativeFuel
                            : leg.fuelEstimate;
                      return (
                        <tr
                          key={`side-${wp.lat}-${wp.lng}-${idx}`}
                          draggable
                          onDragStart={() => setDragIndex(idx)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(idx);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex != null) reorderWaypoint(dragIndex, idx);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`border-t border-slate-800/80 ${
                            dragOverIndex === idx ? "bg-emerald-500/10" : ""
                          } ${dragIndex === idx ? "opacity-50" : ""}`}
                        >
                          <td className="cursor-grab px-1 py-1 active:cursor-grabbing" title="Arrastar">
                            <IconGrip />
                          </td>
                          <td className="max-w-[5.5rem] truncate px-1.5 py-1 font-semibold text-slate-100">
                            {waypointDisplayName(wp)}
                          </td>
                          <td className="px-1.5 py-1 font-semibold text-emerald-400">
                            {leg ? formatBearingDeg(leg.bearingDeg) : "—"}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-slate-300">
                            {dist != null ? `${dist.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-slate-300">{formatEteClock(ete)}</td>
                          <td className="px-1.5 py-1 font-mono text-slate-300">
                            {fuel != null ? fuel.toFixed(1) : "—"}
                          </td>
                          <td className="px-1 py-1 text-right">
                            <button
                              type="button"
                              className="px-1 text-base leading-none text-slate-500 hover:text-rose-300"
                              onClick={() => removeWaypoint(idx)}
                              aria-label={`Remover ${waypointDisplayName(wp)}`}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {legs.length > 0 ? (
                    <tfoot>
                      <tr className="border-t border-slate-700 bg-slate-900/50">
                        <td className="px-1.5 py-1.5 text-slate-500" colSpan={3}>
                          Total
                        </td>
                        <td className="px-1.5 py-1.5 font-mono font-semibold text-slate-100">
                          {summary.distanceNm.toFixed(0)}
                        </td>
                        <td className="px-1.5 py-1.5 font-mono font-semibold text-slate-100">
                          {formatEteClock(summary.eteHours)}
                        </td>
                        <td className="px-1.5 py-1.5 font-mono font-semibold text-slate-100" colSpan={2}>
                          {formatFuel(summary.fuelEstimate, fuelUnit)}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
            </div>
          </div>
        </aside>
        }
      />

      <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <h3 className="text-sm font-semibold text-slate-100">Tabela da rota</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                  placeholder="Alt ft"
                  value={bulkAltitudeFt}
                  onChange={(e) => setBulkAltitudeFt(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                  disabled={waypoints.length < 2 || !bulkAltitudeFt.trim()}
                  title="Aplicar altitude a todos os trechos"
                  onClick={() => {
                    const n = Number(String(bulkAltitudeFt).replace(",", "."));
                    if (!Number.isFinite(n)) return;
                    const rounded = Math.round(n);
                    setCruiseAltitudeFt(String(rounded));
                    setWaypoints((prev) =>
                      prev.map((wp, i) =>
                        i === 0 || i === prev.length - 1 ? wp : { ...wp, altitudeFt: rounded },
                      ),
                    );
                  }}
                >
                  Alt. todos
                </button>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition hover:border-cyan-500/40 hover:bg-slate-800"
                onClick={() => {
                  setRouteTextDraft(nexAtlasText);
                  setShowPasteModal(true);
                }}
              >
                Colar rota
              </button>
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                {(
                  [
                    ["etapa", "Etapa"],
                    ["acumulado", "Acumulado"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAccumMode(id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                      accumMode === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {waypoints.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              Adicione pontos no mapa ou pela busca para montar a tabela.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-semibold">#</th>
                    <th className="px-2 py-2 font-semibold">Ponto</th>
                    <th className="px-2 py-2 font-semibold">Coordenada</th>
                    <th className="px-2 py-2 font-semibold">Proa</th>
                    <th className="px-2 py-2 font-semibold">Alt</th>
                    <th className="px-2 py-2 font-semibold">Corredor</th>
                    <th className="px-2 py-2 font-semibold">Distância</th>
                    <th className="px-2 py-2 font-semibold">Tempo</th>
                    <th className="px-2 py-2 font-semibold">Consumo</th>
                    <th className="px-2 py-2 font-semibold">Obs</th>
                    <th className="px-2 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {waypoints.map((wp, idx) => {
                    const leg = idx > 0 ? legs[idx - 1] : null;
                    const corridor = idx > 0 ? legCorridors[idx] : null;
                    const dist =
                      leg == null
                        ? null
                        : accumMode === "acumulado"
                          ? leg.cumulativeDistanceNm
                          : leg.distanceNm;
                    const ete =
                      leg == null
                        ? null
                        : accumMode === "acumulado"
                          ? leg.cumulativeEteHours
                          : leg.eteHours;
                    const fuel =
                      leg == null
                        ? null
                        : accumMode === "acumulado"
                          ? leg.cumulativeFuel
                          : leg.fuelEstimate;
                    return (
                      <tr
                        key={`${wp.lat}-${wp.lng}-${idx}`}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverIndex(idx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex != null) reorderWaypoint(dragIndex, idx);
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        className={`border-t border-slate-800/80 ${
                          dragOverIndex === idx ? "bg-emerald-500/10" : ""
                        } ${dragIndex === idx ? "opacity-50" : ""}`}
                      >
                        <td className="cursor-grab px-2 py-1.5 active:cursor-grabbing" title="Arrastar">
                          <IconGrip />
                        </td>
                        <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                        <td className="px-2 py-1.5 font-semibold text-slate-100">
                          {waypointDisplayName(wp)}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                          {formatCompactAviationCoord(wp.lat, wp.lng)}
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-emerald-400">
                          {leg ? formatBearingDeg(leg.bearingDeg) : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-slate-200"
                              value={wp.altitudeFt ?? ""}
                              placeholder="ft"
                              title={
                                idx === 0
                                  ? "Elevação / altitude na origem (ft)"
                                  : wp.altitudeRef === "start"
                                    ? "Início: muda a altitude no começo do trecho até o ponto"
                                    : wp.altitudeRef === "after"
                                      ? "After: inicia subida/descida logo após passar o ponto"
                                      : "Before: alcança a altitude imediatamente antes do ponto"
                              }
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                const n = Number(raw);
                                const nextAlt = raw && Number.isFinite(n) ? Math.round(n) : null;
                                setWaypoints((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          altitudeFt: nextAlt,
                                        }
                                      : item,
                                  ),
                                );
                                if (nextAlt != null && idx > 0) {
                                  const isLast = idx === waypoints.length - 1;
                                  const field = waypoints[idx]?.fieldElevFt;
                                  if (!isLast || field == null || nextAlt !== Math.round(field)) {
                                    setCruiseAltitudeFt(String(nextAlt));
                                  }
                                }
                              }}
                            />
                            {(() => {
                              if (idx <= 0 || idx >= waypoints.length - 1) return null;
                              const prevAlt = waypoints[idx - 1]?.altitudeFt;
                              const curAlt = wp.altitudeFt;
                              if (
                                prevAlt == null ||
                                curAlt == null ||
                                !Number.isFinite(prevAlt) ||
                                !Number.isFinite(curAlt) ||
                                Math.round(prevAlt) === Math.round(curAlt)
                              ) {
                                return null;
                              }
                              const mode =
                                wp.altitudeRef === "start" || wp.altitudeRef === "after"
                                  ? wp.altitudeRef
                                  : "before";
                              const setMode = (altitudeRef: "start" | "before" | "after") => {
                                setWaypoints((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, altitudeRef } : item)),
                                );
                              };
                              return (
                                <div
                                  className="inline-flex overflow-hidden rounded border border-slate-700 bg-slate-950"
                                  title="I = Início do trecho · B = Before (padrão) · A = After"
                                >
                                  <button
                                    type="button"
                                    className={`px-1.5 py-0.5 text-[9px] font-bold transition ${
                                      mode === "start"
                                        ? "bg-emerald-500/20 text-emerald-200"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}
                                    title="Início: sobe/desce logo no começo do trecho até este ponto"
                                    onClick={() => setMode("start")}
                                  >
                                    I
                                  </button>
                                  <button
                                    type="button"
                                    className={`border-l border-slate-700 px-1.5 py-0.5 text-[9px] font-bold transition ${
                                      mode === "before"
                                        ? "bg-cyan-500/20 text-cyan-200"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}
                                    title="Before: alcança a altitude logo antes do ponto"
                                    onClick={() => setMode("before")}
                                  >
                                    B
                                  </button>
                                  <button
                                    type="button"
                                    className={`border-l border-slate-700 px-1.5 py-0.5 text-[9px] font-bold transition ${
                                      mode === "after"
                                        ? "bg-amber-500/20 text-amber-200"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}
                                    title="After: inicia subida/descida logo após passar o ponto"
                                    onClick={() => setMode("after")}
                                  >
                                    A
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="align-top px-2 py-1.5 text-[10px] text-amber-200/90">
                          {corridor ? (
                            <span
                              className="block max-w-[9rem]"
                              title={`Piso ${corridor.altMin ?? "—"} / Teto ${corridor.altMax ?? "—"} · ${corridor.name}`}
                            >
                              <span className="block truncate font-semibold leading-tight">{corridor.name}</span>
                              <span className="mt-0.5 block whitespace-nowrap font-mono leading-tight text-slate-400">
                                {corridor.altMin != null || corridor.altMax != null
                                  ? `${corridor.altMin ?? "—"}/${corridor.altMax ?? "—"}`
                                  : "—"}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-300">
                          {dist != null ? `${dist.toFixed(1)} nm` : "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-300">{formatEteClock(ete)}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-300">
                          {fuel != null ? `${fuel.toFixed(1)} ${fuelUnit}` : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {idx === 0 ? (
                            <span className="text-slate-600">—</span>
                          ) : (
                            <WaypointNoteInput
                              value={wp.note || ""}
                              onCommit={(note) => {
                                setWaypoints((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, note } : item)),
                                );
                              }}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                            aria-label={`Remover ${waypointDisplayName(wp)}`}
                            onClick={() => removeWaypoint(idx)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {legs.length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-slate-900/50">
                      <td className="px-2 py-2 text-slate-500" colSpan={7}>
                        Total
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-100">
                        {summary.distanceNm.toFixed(1)} nm
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-100">
                        {formatEteClock(summary.eteHours)}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-100">
                        {formatFuel(summary.fuelEstimate, fuelUnit)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </section>

        <RouteVerticalProfileChart
          waypoints={waypoints}
          legs={legs}
          totalDistanceNm={summary.distanceNm}
          performance={performanceProfile}
          corridors={legCorridors}
        />

        <section className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-100">Briefing AISWEB</h3>
            <p className="mt-1 text-xs text-slate-500">
              Origem/destino vêm dos aeródromos da rota
              {originIcao || destIcao ? (
                <>
                  {" "}
                  (<span className="font-semibold text-slate-300">{originIcao || "—"}</span>
                  {" → "}
                  <span className="font-semibold text-slate-300">{destIcao || "—"}</span>)
                </>
              ) : null}
              .
            </p>
          </div>

          <div className="space-y-2">
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
              <button type="button" className={`${btnSecondary} mb-0.5`} onClick={() => addAlternate(altDraft)}>
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
            <button
              type="button"
              className={btnPrimary}
              disabled={loadingBriefing}
              onClick={() => void handleGenerate()}
            >
              {loadingBriefing ? "Gerando…" : "Gerar briefing"}
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

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Espaço aéreo na rota</h3>
            {airspaceLoading ? <span className="text-[11px] text-slate-500">Consultando…</span> : null}
          </div>
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

        {generated ? (
          <section className="space-y-3 pb-4">
            <h2 className="text-sm font-semibold text-slate-100">Detalhes do briefing</h2>
            <div className="grid gap-3">
              {airports.map((item) => (
                <AirportDocPreview
                  key={`${item.role}-${item.icao}`}
                  role={
                    item.role === "origem" ? "Origem" : item.role === "destino" ? "Destino" : "Alternativo"
                  }
                  icao={item.icao}
                  bundle={item.bundle}
                  sections={sections}
                />
              ))}
            </div>
          </section>
        ) : null}

      {showConfigModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setShowConfigModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Configurações de performance</h3>
              <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => setShowConfigModal(false)}>
                ×
              </button>
            </div>
            <div className="grid gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cruzeiro</p>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Altitude (ft)
                </span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={cruiseAltitudeFt}
                  onChange={(e) => setCruiseAltitudeFt(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Velocidade (kt)
                </span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={cruiseSpeedKt}
                  onChange={(e) => setCruiseSpeedKt(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Consumo ({fuelUnit}/h)
                </span>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={fuelBurn}
                    onChange={(e) => setFuelBurn(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-300"
                    value={fuelUnit}
                    onChange={(e) => setFuelUnit(e.target.value)}
                    aria-label="Unidade de combustível"
                  >
                    <option value="L">L</option>
                    <option value="gal">gal</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </label>

              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Subida (TOC)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">kt</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={climbSpeedKt}
                    onChange={(e) => setClimbSpeedKt(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">ft/min</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={climbRateFpm}
                    onChange={(e) => setClimbRateFpm(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">{fuelUnit}/h</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={climbBurn}
                    onChange={(e) => setClimbBurn(e.target.value)}
                  />
                </label>
              </div>

              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Descida (TOD)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">kt</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={descentSpeedKt}
                    onChange={(e) => setDescentSpeedKt(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">ft/min</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={descentRateFpm}
                    onChange={(e) => setDescentRateFpm(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-slate-500">{fuelUnit}/h</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={descentBurn}
                    onChange={(e) => setDescentBurn(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <button type="button" className={`${btnPrimary} mt-4 w-full`} onClick={() => setShowConfigModal(false)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {showPasteModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Colar rota NexAtlas / FPL</h3>
              <button type="button" className="text-slate-500 hover:text-slate-200" onClick={() => setShowPasteModal(false)}>
                ×
              </button>
            </div>
            <textarea
              className={`${inputClass} min-h-[120px] font-mono text-[11px]`}
              value={routeTextDraft}
              onChange={(e) => setRouteTextDraft(e.target.value)}
              placeholder="DCT 2306S04634W … DCT"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  importFromText();
                  setShowPasteModal(false);
                }}
              >
                Importar
              </button>
              <button type="button" className={btnSecondary} onClick={() => setShowPasteModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AerodromeDetailsSidePanel
        bundle={detailBundle}
        open={Boolean(detailBundle)}
        onClose={() => setDetailBundle(null)}
      />
    </div>
  );
}
