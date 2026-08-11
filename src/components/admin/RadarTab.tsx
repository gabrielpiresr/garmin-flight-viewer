import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../../contexts/AuthContext";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listAircrafts } from "../../lib/aircraftDb";
import {
  getFlightRadarFlightTrack,
  getFlightRadarLivePositions,
  getFlightRadarSettings,
  normalizeAircraftRegistration,
  saveFlightRadarSettings,
  searchFlightRadar,
} from "../../lib/flightRadarDb";
import { getPublicScheduleCached } from "../../lib/scheduleCache";
import type { Aircraft } from "../../types/admin";
import type {
  FlightRadarLivePosition,
  FlightRadarSettings,
  FlightRadarTrackPoint,
} from "../../types/flightRadar";
import type { PublicScheduleFlight } from "../../lib/scheduleBookingDb";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { RadarMap, type RadarMapAircraft } from "./RadarMap";

const FLEET_COLORS = [
  "#34d399",
  "#38bdf8",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
  "#f97316",
];

function colorForReg(reg: string): string {
  let hash = 0;
  for (let i = 0; i < reg.length; i++) hash = (hash * 31 + reg.charCodeAt(i)) | 0;
  return FLEET_COLORS[Math.abs(hash) % FLEET_COLORS.length]!;
}

function formatAlt(ft: number | null | undefined): string {
  if (ft == null || !Number.isFinite(ft)) return "—";
  return `${Math.round(ft).toLocaleString("pt-BR")} ft`;
}

function formatSpeed(kt: number | null | undefined): string {
  if (kt == null || !Number.isFinite(kt)) return "—";
  return `${Math.round(kt)} kt`;
}

function formatHeading(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return "—";
  return `${Math.round(((deg % 360) + 360) % 360).toString().padStart(3, "0")}°`;
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatEta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusOf(pos: FlightRadarLivePosition | null | undefined): "airborne" | "ground" | "offline" {
  if (!pos) return "offline";
  const alt = pos.alt ?? 0;
  const spd = pos.gspeed ?? 0;
  if (alt > 50 || spd > 30) return "airborne";
  return "ground";
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isActiveScheduleFlight(flight: PublicScheduleFlight, now = Date.now()): boolean {
  const start = Date.parse(flight.presentationTime || flight.startTime);
  const end = Date.parse(flight.endTime || flight.cutoffTime || "");
  if (!Number.isFinite(start)) return false;
  const endMs = Number.isFinite(end) ? end : start + Math.max(flight.durationMinutes || 60, 30) * 60_000;
  return now >= start - 30 * 60_000 && now <= endMs + 15 * 60_000;
}

type FleetRow = {
  registration: string;
  aircraft: Aircraft | null;
  tracked: boolean;
  position: FlightRadarLivePosition | null;
  schedule: PublicScheduleFlight | null;
};

export function RadarTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const schoolId = user?.schoolId || DEFAULT_SCHOOL_ID;

  const [settings, setSettings] = useState<FlightRadarSettings | null>(null);
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [scheduleFlights, setScheduleFlights] = useState<PublicScheduleFlight[]>([]);
  const [positions, setPositions] = useState<FlightRadarLivePosition[]>([]);
  const [trail, setTrail] = useState<FlightRadarTrackPoint[]>([]);
  const [selectedReg, setSelectedReg] = useState<string | null>(null);
  const [, setSelectedFr24Id] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FlightRadarLivePosition[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number; zoom?: number; nonce: number } | null>(
    null,
  );
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const mapFocusNonceRef = useRef(0);
  /** Cache of FR24 /flight-tracks responses by fr24Id — source of truth for the route. */
  const trackCacheRef = useRef(new Map<string, FlightRadarTrackPoint[]>());

  function centerMapOn(lat: number, lon: number, zoom = 11) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    mapFocusNonceRef.current += 1;
    setMapFocus({ lat, lon, zoom, nonce: mapFocusNonceRef.current });
  }

  const trackedSet = useMemo(
    () => new Set((settings?.trackedRegistrations ?? []).map(normalizeAircraftRegistration)),
    [settings],
  );

  const positionByReg = useMemo(() => {
    const map = new Map<string, FlightRadarLivePosition>();
    for (const pos of positions) {
      const reg = normalizeAircraftRegistration(pos.reg || "");
      if (!reg) continue;
      map.set(reg, pos);
    }
    return map;
  }, [positions]);

  const scheduleByReg = useMemo(() => {
    const map = new Map<string, PublicScheduleFlight>();
    const now = Date.now();
    const today = todayIsoDate();
    for (const flight of scheduleFlights) {
      if (flight.flightDate !== today) continue;
      if (!isActiveScheduleFlight(flight, now)) continue;
      const reg = normalizeAircraftRegistration(flight.aircraftIdent);
      if (!reg) continue;
      const prev = map.get(reg);
      if (!prev) {
        map.set(reg, flight);
        continue;
      }
      // Prefer the one closest to now.
      const prevStart = Date.parse(prev.startTime);
      const nextStart = Date.parse(flight.startTime);
      if (Math.abs(nextStart - now) < Math.abs(prevStart - now)) map.set(reg, flight);
    }
    return map;
  }, [scheduleFlights]);

  const fleetRows: FleetRow[] = useMemo(() => {
    const planes: FleetRow[] = fleet
      .filter((ac) => ac.type === "aviao" && ac.active && !ac.deleted_at)
      .map((ac) => {
        const registration = normalizeAircraftRegistration(ac.registration);
        return {
          registration,
          aircraft: ac,
          tracked: trackedSet.has(registration),
          position: positionByReg.get(registration) ?? null,
          schedule: scheduleByReg.get(registration) ?? null,
        };
      })
      .sort((a, b) => {
        const rank = (row: FleetRow) => {
          if (statusOf(row.position) === "airborne") return 0;
          if (row.tracked) return 1;
          return 2;
        };
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return a.registration.localeCompare(b.registration);
      });

    // Include tracked regs that aren't in fleet (manual entries).
    for (const reg of trackedSet) {
      if (planes.some((p) => p.registration === reg)) continue;
      planes.push({
        registration: reg,
        aircraft: null,
        tracked: true,
        position: positionByReg.get(reg) ?? null,
        schedule: scheduleByReg.get(reg) ?? null,
      });
    }
    return planes;
  }, [fleet, trackedSet, positionByReg, scheduleByReg]);

  const trackedRows = useMemo(() => fleetRows.filter((r) => r.tracked), [fleetRows]);

  const visibleRows = useMemo(() => {
    const q = listFilter.trim().toUpperCase();
    if (!q) return fleetRows;
    return fleetRows.filter((row) => {
      const nick = row.aircraft?.nickname?.toUpperCase() || "";
      const callsign = row.position?.callsign?.toUpperCase() || "";
      return row.registration.includes(q) || nick.includes(q) || callsign.includes(q);
    });
  }, [fleetRows, listFilter]);

  const selectedRow = useMemo(() => {
    if (selectedReg) return fleetRows.find((r) => r.registration === selectedReg) ?? null;
    return trackedRows.find((r) => statusOf(r.position) === "airborne") ?? trackedRows[0] ?? null;
  }, [selectedReg, fleetRows, trackedRows]);

  const selectedPosition = selectedRow?.position ?? null;

  const mapAircraft: RadarMapAircraft[] = useMemo(
    () =>
      trackedRows
        .filter((row) => row.position)
        .map((row) => ({
          ...row.position!,
          label: row.registration,
          color: colorForReg(row.registration),
          selected: selectedRow?.registration === row.registration,
        })),
    [trackedRows, selectedRow],
  );

  const displayTrail = useMemo(() => {
    if (!trail.length) return [] as FlightRadarTrackPoint[];
    // Append live position tip so the line meets the aircraft icon.
    if (!selectedPosition) return trail;
    const last = trail[trail.length - 1];
    if (
      last &&
      Math.abs(last.lat - selectedPosition.lat) < 0.00005 &&
      Math.abs(last.lon - selectedPosition.lon) < 0.00005
    ) {
      return trail;
    }
    return [
      ...trail,
      {
        timestamp: selectedPosition.timestamp || new Date().toISOString(),
        lat: selectedPosition.lat,
        lon: selectedPosition.lon,
        alt: selectedPosition.alt,
        gspeed: selectedPosition.gspeed,
        vspeed: selectedPosition.vspeed,
        track: selectedPosition.track,
        squawk: selectedPosition.squawk,
        callsign: selectedPosition.callsign,
        source: selectedPosition.source,
      },
    ];
  }, [trail, selectedPosition]);

  const chartData = useMemo(() => {
    const points = displayTrail.filter((p) => p.timestamp && (p.alt != null || p.gspeed != null));
    if (points.length <= 100) {
      return points.map((p) => ({
        t: formatClock(p.timestamp),
        alt: p.alt,
        gspeed: p.gspeed,
        vspeed: p.vspeed,
      }));
    }
    const step = Math.ceil(points.length / 100);
    const sampled = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]!);
    const last = points[points.length - 1]!;
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled.map((p) => ({
      t: formatClock(p.timestamp),
      alt: p.alt,
      gspeed: p.gspeed,
      vspeed: p.vspeed,
    }));
  }, [displayTrail]);

  // Stage 1 — settings (unblocks the shell UI).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingSettings(true);
      try {
        const next = await getFlightRadarSettings();
        if (cancelled) return;
        setSettings(next);
        if (!next.hasApiToken) setShowSettings(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Falha ao carregar o Radar.";
        setError(message);
        showToast({ variant: "error", message });
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Stage 2 — fleet (local Appwrite, independent).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingFleet(true);
      try {
        const aircrafts = await listAircrafts(schoolId);
        if (!cancelled) setFleet(aircrafts);
      } catch {
        if (!cancelled) setFleet([]);
      } finally {
        if (!cancelled) setLoadingFleet(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Stage 3 — today's schedule (deferred enrichment).
  useEffect(() => {
    let cancelled = false;
    const today = todayIsoDate();
    const timer = window.setTimeout(() => {
      void getPublicScheduleCached(today, today)
        .then((schedule) => {
          if (!cancelled) setScheduleFlights(schedule.flights ?? []);
        })
        .catch(() => {
          if (!cancelled) setScheduleFlights([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const refreshLive = useCallback(async () => {
    if (!settings) return;
    if (!settings.trackedRegistrations.length) {
      setPositions([]);
      setLastFetchedAt(new Date().toISOString());
      setLiveStatus("ready");
      return;
    }
    setRefreshing(true);
    setLiveStatus("loading");
    setError(null);
    try {
      const live = await getFlightRadarLivePositions(settings.trackedRegistrations);
      const tracked = new Set(settings.trackedRegistrations.map(normalizeAircraftRegistration));
      setPositions((prev) => {
        const byReg = new Map<string, FlightRadarLivePosition>();
        for (const pos of live.positions) {
          const reg = normalizeAircraftRegistration(pos.reg || "");
          if (!reg) continue;
          byReg.set(reg, { ...pos, reg });
        }
        // Keep last-known position when a tracked aircraft is missing from this poll.
        for (const pos of prev) {
          const reg = normalizeAircraftRegistration(pos.reg || "");
          if (!reg || !tracked.has(reg) || byReg.has(reg)) continue;
          byReg.set(reg, pos);
        }
        return Array.from(byReg.values());
      });
      setLastFetchedAt(live.fetchedAt);
      setLiveStatus("ready");
      if (live.message) setError(live.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao atualizar posições.";
      setError(message);
      setLiveStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, [settings]);

  // Stage 4 — live FR24 positions after settings are ready.
  useEffect(() => {
    if (!settings) return;
    void refreshLive();
  }, [settings, refreshLive]);

  // Flight summary is optional and costs credits — only on manual refresh for now (disabled auto).

  useEffect(() => {
    if (!settings?.trackedRegistrations.length) return;
    const ms = Math.max(30, settings.pollIntervalSec || 60) * 1000;
    const timer = window.setInterval(() => {
      void refreshLive();
    }, ms);
    return () => window.clearInterval(timer);
  }, [settings?.trackedRegistrations, settings?.pollIntervalSec, refreshLive]);

  // Pull official FR24 track (GET /api/flight-tracks) — full path of the current flight.
  useEffect(() => {
    const fr24Id = selectedPosition?.fr24Id ?? null;
    setSelectedFr24Id(fr24Id);
    let cancelled = false;

    if (!fr24Id) {
      setTrail([]);
      setTrackLoading(false);
      setTrackError(null);
      return;
    }

    if (trackCacheRef.current.has(fr24Id)) {
      setTrail(trackCacheRef.current.get(fr24Id) ?? []);
      setTrackLoading(false);
      setTrackError(null);
      return;
    }

    setTrail([]);
    setTrackLoading(true);
    setTrackError(null);

    void getFlightRadarFlightTrack(fr24Id)
      .then((track) => {
        const points = track.tracks ?? [];
        trackCacheRef.current.set(fr24Id, points);
        if (cancelled) return;
        setTrail(points);
        if (!points.length) {
          setTrackError("Flightradar24 não retornou pontos de trajetória para este voo.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTrackError(err instanceof Error ? err.message : "Falha ao carregar trilha do Flightradar24.");
      })
      .finally(() => {
        if (!cancelled) setTrackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPosition?.fr24Id]);

  async function persistTracked(nextRegs: string[], toastMsg?: string) {
    if (!settings) return;
    setSavingTrack(true);
    try {
      const saved = await saveFlightRadarSettings({
        trackedRegistrations: nextRegs,
        pollIntervalSec: settings.pollIntervalSec,
        mapCenter: settings.mapCenter,
      });
      setSettings(saved);
      if (toastMsg) showToast({ variant: "success", message: toastMsg });
    } catch (err) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Falha ao salvar acompanhamento.",
      });
    } finally {
      setSavingTrack(false);
    }
  }

  async function toggleTracked(registration: string) {
    if (!settings) return;
    const reg = normalizeAircraftRegistration(registration);
    const next = new Set(settings.trackedRegistrations.map(normalizeAircraftRegistration));
    if (next.has(reg)) next.delete(reg);
    else next.add(reg);
    await persistTracked(
      Array.from(next),
      next.has(reg) ? `${reg} em acompanhamento.` : `${reg} removido do radar.`,
    );
  }

  async function trackRegistration(
    registration: string,
    seedPosition?: FlightRadarLivePosition | null,
    opts?: { center?: boolean },
  ) {
    if (!settings) return;
    const reg = normalizeAircraftRegistration(registration);
    if (!reg) {
      showToast({ variant: "warning", message: "Matrícula inválida para acompanhar." });
      return;
    }
    const next = new Set(settings.trackedRegistrations.map(normalizeAircraftRegistration));
    next.add(reg);
    if (seedPosition) {
      setPositions((prev) => {
        const without = prev.filter(
          (p) => normalizeAircraftRegistration(p.reg || "") !== reg && p.fr24Id !== seedPosition.fr24Id,
        );
        return [...without, { ...seedPosition, reg }];
      });
      if (opts?.center !== false) centerMapOn(seedPosition.lat, seedPosition.lon, 11);
    }
    setSelectedReg(reg);
    if (seedPosition?.fr24Id) setSelectedFr24Id(seedPosition.fr24Id);
    await persistTracked(Array.from(next), `${reg} adicionado ao radar.`);
  }

  async function trackAllFleet() {
    if (!settings) return;
    const regs = fleet
      .filter((ac) => ac.type === "aviao" && ac.active && !ac.deleted_at)
      .map((ac) => normalizeAircraftRegistration(ac.registration))
      .filter(Boolean);
    await persistTracked(regs, `${regs.length} aeronave(s) em acompanhamento.`);
  }

  async function clearTracked() {
    if (!settings) return;
    setPositions([]);
    await persistTracked([], "Acompanhamento limpo.");
  }

  async function runSearch(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
    const q = searchQuery.trim();
    if (q.length < 2) {
      showToast({ variant: "warning", message: "Digite matrícula, callsign ou número de voo." });
      return;
    }
    setSearching(true);
    setSearchMessage(null);
    try {
      const result = await searchFlightRadar(q);
      setSearchResults(result.positions);
      setSearchMessage(result.message || null);
      if (!result.positions.length) {
        showToast({
          variant: "warning",
          message: result.message || "Nenhuma aeronave encontrada agora.",
        });
      }
    } catch (err) {
      setSearchResults([]);
      const message = err instanceof Error ? err.message : "Falha na busca.";
      setSearchMessage(message);
      showToast({ variant: "error", message });
    } finally {
      setSearching(false);
    }
  }

  async function saveTokenAndPoll() {
    if (!settings) return;
    setSavingTrack(true);
    try {
      const saved = await saveFlightRadarSettings({
        trackedRegistrations: settings.trackedRegistrations,
        pollIntervalSec: settings.pollIntervalSec,
        mapCenter: settings.mapCenter,
        ...(tokenDraft.trim() ? { apiToken: tokenDraft.trim() } : {}),
      });
      setSettings(saved);
      setTokenDraft("");
      setShowSettings(false);
      showToast({ variant: "success", message: "Configurações do Radar salvas." });
    } catch (err) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Falha ao salvar configurações.",
      });
    } finally {
      setSavingTrack(false);
    }
  }

  const airborneCount = trackedRows.filter((r) => statusOf(r.position) === "airborne").length;
  const groundCount = trackedRows.filter((r) => statusOf(r.position) === "ground").length;
  const offlineCount = trackedRows.filter((r) => statusOf(r.position) === "offline").length;

  if (loadingSettings && !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <h1 className="text-lg font-semibold text-slate-100">Radar da frota</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe as aeronaves da escola em tempo real (Flightradar24), com corredores visuais e Windy.
            {liveStatus === "loading" || refreshing ? (
              <span className="ml-2 text-cyan-400">Atualizando posições…</span>
            ) : loadingFleet ? (
              <span className="ml-2 text-slate-400">Carregando frota…</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-400">
            <span className="text-emerald-400 font-semibold">{airborneCount}</span> no ar ·{" "}
            <span className="text-amber-300 font-semibold">{groundCount}</span> solo ·{" "}
            <span className="text-slate-400 font-semibold">{offlineCount}</span> offline
          </div>
          <button
            type="button"
            onClick={() => void refreshLive()}
            disabled={refreshing}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {refreshing ? "Atualizando…" : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            Configurações
          </button>
        </div>
      </header>

      {showSettings ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Configuração do Radar</h2>
          <p className="mt-1 text-xs text-slate-500">
            O token da API fica só no servidor. Status atual:{" "}
            <span className={settings?.hasApiToken ? "text-emerald-400" : "text-amber-300"}>
              {settings?.hasApiToken ? "token configurado" : "token ausente"}
            </span>
            .
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Token Flightradar24 (opcional se já estiver no ambiente)
              <input
                type="password"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="Cole o token para salvar no servidor"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Intervalo de atualização (segundos, mín. 30)
              <input
                type="number"
                min={30}
                max={300}
                value={settings?.pollIntervalSec ?? 60}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          pollIntervalSec: Math.min(300, Math.max(30, Number(e.target.value) || 60)),
                        }
                      : prev,
                  )
                }
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingTrack}
              onClick={() => void saveTokenAndPoll()}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              disabled={savingTrack}
              onClick={() => void trackAllFleet()}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Acompanhar toda a frota
            </button>
            <button
              type="button"
              disabled={savingTrack}
              onClick={() => void clearTracked()}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Limpar seleção
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* Left: aircraft list */}
        <aside className="rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="space-y-2 border-b border-slate-800 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Aeronaves · {trackedRows.length} acompanhando
            </p>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchQuery.trim();
                if (!q) return;
                // If it looks like a registration and user holds intent to track directly,
                // search first; they can also add offline via the result empty state.
                void runSearch(e);
              }}
            >
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar matrícula / callsign…"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={searching}
                className="shrink-0 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {searching ? "…" : "Buscar"}
              </button>
            </form>
            <button
              type="button"
              disabled={savingTrack || searchQuery.trim().length < 2}
              onClick={() => {
                const reg = normalizeAircraftRegistration(searchQuery);
                if (!reg) return;
                void trackRegistration(reg, null);
                setSearchQuery("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Acompanhar matrícula mesmo sem sinal
            </button>
            <input
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="Filtrar lista…"
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-slate-600"
            />
            <p className="text-[11px] text-slate-500">
              Busque qualquer avião do FR24 e acompanhe além da frota. Atualizado {formatClock(lastFetchedAt)}.
            </p>
          </div>

          {searchResults.length > 0 || searchMessage ? (
            <div className="border-b border-slate-800 bg-slate-950/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                Resultado da busca
              </p>
              {searchMessage && !searchResults.length ? (
                <p className="mt-1 text-[11px] text-slate-500">{searchMessage}</p>
              ) : null}
              <div className="mt-1.5 space-y-1.5">
                {searchResults.map((pos) => {
                  const reg =
                    normalizeAircraftRegistration(pos.reg || "") ||
                    normalizeAircraftRegistration(pos.callsign || pos.flight || pos.fr24Id);
                  const already = trackedSet.has(reg);
                  return (
                    <div
                      key={pos.fr24Id}
                      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => void trackRegistration(reg, pos)}
                      >
                        <p className="font-mono text-xs font-semibold text-slate-100">{reg}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {pos.callsign || pos.flight || "—"} · {formatAlt(pos.alt)} · {formatSpeed(pos.gspeed)}
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={savingTrack || already}
                        onClick={() => void trackRegistration(reg, pos)}
                        className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {already ? "OK" : "Seguir"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {searchResults.length > 0 ? (
                <button
                  type="button"
                  className="mt-2 text-[10px] text-slate-500 hover:text-slate-300"
                  onClick={() => {
                    setSearchResults([]);
                    setSearchMessage(null);
                  }}
                >
                  Limpar busca
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="max-h-[min(70vh,720px)] overflow-y-auto divide-y divide-slate-800/80">
            {loadingFleet && visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">Carregando frota…</p>
            ) : visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                Nenhuma aeronave na lista. Busque uma matrícula acima ou cadastre a frota.
              </p>
            ) : (
              visibleRows.map((row) => {
                const status = statusOf(row.position);
                const selected = selectedRow?.registration === row.registration;
                const external = !row.aircraft;
                return (
                  <div
                    key={row.registration}
                    className={`flex gap-2 px-3 py-2.5 transition ${
                      selected ? "bg-emerald-500/10" : "hover:bg-slate-800/40"
                    }`}
                  >
                    <label className="mt-1 flex shrink-0 items-start">
                      <input
                        type="checkbox"
                        checked={row.tracked}
                        disabled={savingTrack}
                        onChange={() => void toggleTracked(row.registration)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                      />
                    </label>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSelectedReg(row.registration);
                        if (row.position) {
                          setSelectedFr24Id(row.position.fr24Id);
                          centerMapOn(row.position.lat, row.position.lon, 11);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              status === "airborne"
                                ? "#34d399"
                                : status === "ground"
                                  ? "#fbbf24"
                                  : "#64748b",
                          }}
                        />
                        <span className="font-mono text-sm font-semibold text-slate-100">
                          {row.registration}
                        </span>
                        {external ? (
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">
                            Externo
                          </span>
                        ) : null}
                        {row.aircraft?.nickname ? (
                          <span className="truncate text-[11px] text-slate-500">{row.aircraft.nickname}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span>
                          {status === "airborne"
                            ? "No ar"
                            : status === "ground"
                              ? "No solo"
                              : "Sem sinal"}
                        </span>
                        <span>{formatAlt(row.position?.alt)}</span>
                        <span>{formatSpeed(row.position?.gspeed)}</span>
                      </div>
                      {row.schedule ? (
                        <p className="mt-1 truncate text-[11px] text-cyan-300/90">
                          Escala: {row.schedule.studentName || "Aluno"} ·{" "}
                          {row.schedule.instructorName || "Instrutor"}
                        </p>
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Center: map */}
        <div className="min-w-0 space-y-2">
          <RadarMap
            aircraft={mapAircraft}
            trail={displayTrail}
            center={settings?.mapCenter ?? { lat: -22.9754, lon: -44.3074, zoom: 10 }}
            focusTarget={mapFocus}
            onSelect={(fr24Id) => {
              const pos = positions.find((p) => p.fr24Id === fr24Id);
              if (pos?.reg) setSelectedReg(normalizeAircraftRegistration(pos.reg));
              setSelectedFr24Id(fr24Id);
              if (pos) centerMapOn(pos.lat, pos.lon, 11);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>
              Recentra só ao selecionar · Poll {settings?.pollIntervalSec ?? 60}s · Trajeto FR24
            </span>
          </div>
        </div>

        {/* Right: detail panel */}
        <aside className="rounded-xl border border-slate-800 bg-slate-900/50">
          {!selectedRow ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Selecione uma aeronave para ver detalhes, gráficos e contexto da escola.
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-800 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xl font-bold tracking-wide text-slate-50">
                      {selectedRow.registration}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedPosition?.type || selectedRow.aircraft?.nickname || "Tipo desconhecido"}
                      {selectedRow.aircraft?.nickname && selectedPosition?.type
                        ? ` · ${selectedRow.aircraft.nickname}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      statusOf(selectedPosition) === "airborne"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : statusOf(selectedPosition) === "ground"
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-slate-700/60 text-slate-300"
                    }`}
                  >
                    {statusOf(selectedPosition) === "airborne"
                      ? "No ar"
                      : statusOf(selectedPosition) === "ground"
                        ? "Solo"
                        : "Offline"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-sm text-slate-300">
                  {selectedPosition?.callsign || selectedPosition?.flight || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {(selectedPosition?.origIcao || selectedPosition?.origIata || "????") +
                    " → " +
                    (selectedPosition?.destIcao || selectedPosition?.destIata || "????")}
                  {selectedPosition?.eta ? ` · ETA ${formatEta(selectedPosition.eta)}` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800">
                {[
                  ["Altitude", formatAlt(selectedPosition?.alt)],
                  ["GS", formatSpeed(selectedPosition?.gspeed)],
                  ["VS", selectedPosition?.vspeed != null ? `${Math.round(selectedPosition.vspeed)} fpm` : "—"],
                  ["Proa", formatHeading(selectedPosition?.track)],
                  ["Squawk", selectedPosition?.squawk || "—"],
                  ["Fonte", selectedPosition?.source || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-900/80 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {label}
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-100">{value}</p>
                  </div>
                ))}
              </div>

              {selectedRow.schedule ? (
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                    Missão na escala
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    {selectedRow.schedule.studentName || "Aluno não informado"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Instrutor: {selectedRow.schedule.instructorName || "—"} ·{" "}
                    {formatClock(selectedRow.schedule.startTime)}–
                    {formatClock(selectedRow.schedule.endTime)}
                  </p>
                  {selectedRow.schedule.notes ? (
                    <p className="mt-1 text-xs text-slate-400">{selectedRow.schedule.notes}</p>
                  ) : null}
                </div>
              ) : (
                <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-500">
                  Sem missão ativa na escala para esta aeronave agora.
                </div>
              )}

              <div className="space-y-3 px-3 py-3">
                {trackLoading ? (
                  <p className="text-[11px] text-cyan-300/90">Carregando trilha do voo…</p>
                ) : null}
                {trackError ? (
                  <p className="text-[11px] text-amber-300/90">{trackError}</p>
                ) : null}
                {!trackLoading && !trackError && displayTrail.length > 1 ? (
                  <p className="text-[11px] text-slate-500">
                    Trajeto: {displayTrail.length.toLocaleString("pt-BR")} pontos
                  </p>
                ) : null}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Perfil de altitude
                  </p>
                  <div className="h-28 rounded-lg border border-slate-800 bg-slate-950/60 px-1 pt-2">
                    {chartData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="radarAlt" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                          <XAxis dataKey="t" hide />
                          <YAxis
                            width={36}
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: 8,
                              fontSize: 11,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="alt"
                            stroke="#34d399"
                            fill="url(#radarAlt)"
                            strokeWidth={2}
                            name="Altitude (ft)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="grid h-full place-items-center text-[11px] text-slate-600">
                        {trackLoading ? "Carregando…" : "Sem trilha ainda"}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Velocidade no solo
                  </p>
                  <div className="h-28 rounded-lg border border-slate-800 bg-slate-950/60 px-1 pt-2">
                    {chartData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="radarGs" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                          <XAxis dataKey="t" hide />
                          <YAxis width={32} tick={{ fill: "#64748b", fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: 8,
                              fontSize: 11,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="gspeed"
                            stroke="#38bdf8"
                            fill="url(#radarGs)"
                            strokeWidth={2}
                            name="GS (kt)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="grid h-full place-items-center text-[11px] text-slate-600">
                        {trackLoading ? "Carregando…" : "Sem trilha ainda"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
