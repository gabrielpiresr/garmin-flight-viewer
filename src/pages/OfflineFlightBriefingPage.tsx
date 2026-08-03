import { useEffect, useMemo, useState } from "react";
import { InstallPwaButton } from "../components/InstallPwaButton";
import { fetchAiswebMetBatch } from "../lib/aiswebDb";
import { buildFlightPlanDocumentHtml } from "../lib/flightPlanPdf";
import {
  getOfflineFlightBriefing,
  updateOfflineBriefingMets,
  type OfflineFlightBriefing,
} from "../lib/offlineFlightBriefing";
import { getPdfBrand } from "../lib/pdfBrand";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function briefingToHtml(briefing: OfflineFlightBriefing): string {
  return buildFlightPlanDocumentHtml({
    origin: briefing.origin,
    destination: briefing.destination,
    alternates: briefing.alternates,
    sections: briefing.sections,
    airports: briefing.airports,
    routeSummary: briefing.routeSummary,
    airspaces: briefing.airspaces,
    cruiseSpeedKt: briefing.cruiseSpeedKt,
    fuelBurnPerHour: briefing.fuelBurnPerHour,
    fuelUnit: briefing.fuelUnit,
    routeText: briefing.routeText,
    mapImageDataUrl: briefing.mapImageDataUrl,
    mode: "continuous",
    brand: getPdfBrand(),
  });
}

export function OfflineFlightBriefingPage() {
  const briefingId = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "briefing");
    return idx >= 0 ? decodeURIComponent(parts[idx + 1] || "") : "";
  }, []);

  const [briefing, setBriefing] = useState<OfflineFlightBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getOfflineFlightBriefing(briefingId)
      .then((doc) => {
        if (cancelled) return;
        if (!doc) {
          setError("Briefing não encontrado neste dispositivo. Gere novamente no Planejamento.");
          setBriefing(null);
          return;
        }
        setBriefing(doc);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar briefing offline.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefingId]);

  const html = useMemo(() => (briefing ? briefingToHtml(briefing) : ""), [briefing]);

  async function handleRefreshMets() {
    if (!briefing) return;
    if (!navigator.onLine) {
      setError("Sem conexão — METARs só atualizam online.");
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const icaos = [...new Set(briefing.airports.map((a) => a.icao))];
      const mets = await fetchAiswebMetBatch(icaos);
      const byIcao: Record<string, (typeof mets)[number]> = {};
      for (const met of mets) {
        if (met?.icao) byIcao[met.icao] = met;
      }
      const next = await updateOfflineBriefingMets(briefing.id, byIcao);
      if (next) setBriefing(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar METARs.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-200">
        <p className="text-sm text-slate-400">Carregando briefing offline…</p>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-200">
        <h1 className="text-xl font-semibold text-slate-100">Briefing offline</h1>
        <p className="mt-2 text-sm text-slate-400">{error || "Documento não encontrado."}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-950">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">
            {briefing.origin} → {briefing.destination}
          </p>
          <p className="text-[11px] text-slate-500">
            METAR {formatWhen(briefing.metUpdatedAt)}
            {!online ? " · offline" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InstallPwaButton />
          <button
            type="button"
            className="rounded-lg border border-cyan-700/60 bg-cyan-950/50 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50"
            disabled={refreshing || !online}
            onClick={() => void handleRefreshMets()}
          >
            {refreshing ? "Atualizando…" : "Atualizar METARs"}
          </button>
        </div>
      </header>
      {error ? <p className="border-b border-rose-900/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
      <iframe title="Briefing offline" className="w-full flex-1 border-0 bg-slate-950" srcDoc={html} />
    </div>
  );
}
