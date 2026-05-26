import { useEffect, useMemo, useState } from "react";
import { FlightReviewTab } from "../components/FlightReviewTab";
import { FlightSummaryPanel } from "../components/JourneyFlightReviewPage";
import { TelemetriaTab } from "../components/TelemetriaTab";
import { Tabs } from "../components/ui/Tabs";
import { VideosTab } from "../components/VideosTab";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { getPublicFlightReviewShare, type PublicFlightReviewShare } from "../lib/publicFlightReviewShare";
import { parseGarminCsv, type ParseResult } from "../lib/parseGarminCsv";

type PublicTab = "resumo" | "telemetria" | "flight-review" | "videos";

const PUBLIC_TABS: Array<{ id: PublicTab; label: string }> = [
  { id: "resumo", label: "Inicial" },
  { id: "telemetria", label: "Telemetria" },
  { id: "flight-review", label: "Flight Review" },
  { id: "videos", label: "Videos" },
];

function tokenFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "share" && parts[1] === "flight-review" ? parts[2] ?? "" : "";
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
    </div>
  );
}

export function PublicFlightReviewPage() {
  const [share, setShare] = useState<PublicFlightReviewShare | null>(null);
  const [activeTab, setActiveTab] = useState<PublicTab>("resumo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = tokenFromPath();
    setLoading(true);
    setError(null);
    void getPublicFlightReviewShare(token)
      .then((data) => {
        if (!cancelled) setShare(data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Link publico nao encontrado.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedTelemetry = useMemo<ParseResult | null>(() => {
    if (!share?.flight.csv_text) return null;
    const decoded = decodeFlightRecord(share.flight.csv_text);
    const telemetryText = decoded.meta ? decoded.telemetryCsv : share.flight.csv_text;
    if (!telemetryText.trim()) return null;
    try {
      return parseGarminCsv(telemetryText);
    } catch {
      return null;
    }
  }, [share]);

  if (loading) return <LoadingState />;

  if (error || !share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Flight Review</p>
          <h1 className="mt-2 text-2xl font-black">Link indisponivel</h1>
          <p className="mt-2 text-sm text-slate-400">{error || "Este link publico nao esta mais ativo."}</p>
        </div>
      </div>
    );
  }

  const brand = share.brandSettings;
  const title = share.missionName || "Flight Review";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">
              {brand?.schoolName?.trim() || "Flight Review"}
            </p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
          </div>
          {brand?.logoDataUrl || brand?.logoUrl ? (
            <img
              src={brand.logoDataUrl || brand.logoUrl}
              alt={brand.schoolName || "Escola"}
              className="h-12 w-auto max-w-40 object-contain"
            />
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4">
          <Tabs items={PUBLIC_TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Flight Review publico" accent="sky" />
        </div>

        {activeTab === "resumo" ? <FlightSummaryPanel flight={share.flight} missionName={title} /> : null}
        {activeTab === "telemetria" ? <TelemetriaTab parsedResult={parsedTelemetry ?? undefined} publicMode /> : null}
        {activeTab === "flight-review" ? (
          <FlightReviewTab
            flightId={share.flight.id}
            publicMode
            publicData={{
              flight: share.flight,
              maneuvers: share.maneuvers,
              maneuverReviews: share.maneuverReviews,
              maneuverTemplates: share.maneuverTemplates,
            }}
          />
        ) : null}
        {activeTab === "videos" ? <VideosTab flightId={share.flight.id} publicMode publicVideos={share.videos} /> : null}
      </main>
    </div>
  );
}
