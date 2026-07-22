import { useEffect, useState, type ReactNode } from "react";
import { FlightReviewTab } from "../components/FlightReviewTab";
import { FlightSummaryPanel } from "../components/JourneyFlightReviewPage";
import { PhotosTab } from "../components/PhotosTab";
import { TelemetriaTab } from "../components/TelemetriaTab";
import { Tabs } from "../components/ui/Tabs";
import { VideosTab } from "../components/VideosTab";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { detectFlightSegments } from "../lib/flightSegments";
import {
  getPublicFlightReviewIntro,
  getPublicFlightReviewShare,
  type PublicFlightReviewIntro,
  type PublicFlightReviewShare,
} from "../lib/publicFlightReviewShare";
import { parseGarminCsv, type ParseResult } from "../lib/parseGarminCsv";

type PublicTab = "resumo" | "telemetria" | "flight-review" | "videos" | "fotos";

type PublicTabItem = { id: PublicTab; label: string; icon: ReactNode };

const PUBLIC_TABS: PublicTabItem[] = [
  {
    id: "resumo",
    label: "Inicial",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2.25a.75.75 0 01.53.22l6.75 6.75a.75.75 0 11-1.06 1.06L15.5 9.56v6.19A1.75 1.75 0 0113.75 17.5h-2.25a.75.75 0 01-.75-.75v-3.25h-1.5v3.25a.75.75 0 01-.75.75H6.25a1.75 1.75 0 01-1.75-1.75V9.56l-.72.72a.75.75 0 01-1.06-1.06l6.75-6.75a.75.75 0 01.53-.22z" />
      </svg>
    ),
  },
  {
    id: "telemetria",
    label: "Telemetria",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.5 3.75A.75.75 0 014.25 3h11.5a.75.75 0 010 1.5H5v10.75a.75.75 0 01-1.5 0V3.75z" />
        <path d="M7 13.5a1 1 0 100 2 1 1 0 000-2zm4-4a1 1 0 100 2 1 1 0 000-2zm4-3.5a1 1 0 100 2 1 1 0 000-2zM7.53 13.03l3-3 1.06 1.06-3 3-1.06-1.06zm4.04-2.6l2.9-3.38 1.14.98-2.9 3.38-1.14-.98z" />
      </svg>
    ),
  },
  {
    id: "flight-review",
    label: "Review",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.25 3A1.75 1.75 0 001.5 4.75v8.5C1.5 14.216 2.284 15 3.25 15h4.19l-1.22 1.22a.75.75 0 101.06 1.06L10 14.56l2.72 2.72a.75.75 0 101.06-1.06L12.56 15h4.19a1.75 1.75 0 001.75-1.75v-8.5A1.75 1.75 0 0016.75 3H3.25zm11.5 4.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5zm-4 1.25a.75.75 0 00-1.5 0v2.25a.75.75 0 001.5 0V8.5zm-4 1.25a.75.75 0 00-1.5 0v1a.75.75 0 001.5 0v-1z" />
      </svg>
    ),
  },
  {
    id: "videos",
    label: "Vídeos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 4A1.75 1.75 0 003 5.75v8.5C3 15.216 3.784 16 4.75 16h7.5A1.75 1.75 0 0014 14.25v-8.5A1.75 1.75 0 0012.25 4h-7.5zM15 7.25l2.47-1.65A1 1 0 0119 6.43v7.14a1 1 0 01-1.53.83L15 12.75v-5.5z" />
      </svg>
    ),
  },
  {
    id: "fotos",
    label: "Fotos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 3.5A1.75 1.75 0 003 5.25v9.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0017 14.75v-9.5a1.75 1.75 0 00-1.75-1.75H4.75zm0 1.5h10.5c.138 0 .25.112.25.25v5.44l-2.02-2.02a1.75 1.75 0 00-2.475 0L8.5 10.174l-.52-.52a1.75 1.75 0 00-2.475 0L4.5 10.659V5.25c0-.138.112-.25.25-.25zM15.5 14.75a.25.25 0 01-.25.25H4.75a.25.25 0 01-.25-.25v-1.97l1.066-1.066a.25.25 0 01.354 0l.874.873a1 1 0 001.414 0l1.858-1.858a.25.25 0 01.354 0l3.08 3.08v.94zM13 6.75a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0z" />
      </svg>
    ),
  },
];

const PUBLIC_VISIBLE_TABS: PublicTabItem[] = ["resumo", "fotos", "telemetria", "flight-review"]
  .map((id) => PUBLIC_TABS.find((tab) => tab.id === id))
  .filter((tab): tab is PublicTabItem => Boolean(tab));

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

function TabLoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[22rem] items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-sm text-slate-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        {label}
      </div>
    </div>
  );
}

function formatFlightDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "este voo";
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function PublicFlightReviewPage() {
  const [intro, setIntro] = useState<PublicFlightReviewIntro | null>(null);
  const [share, setShare] = useState<PublicFlightReviewShare | null>(null);
  const [activeTab, setActiveTab] = useState<PublicTab>("resumo");
  const [visitedTabs, setVisitedTabs] = useState<Set<PublicTab>>(() => new Set(["resumo"]));
  const [entered, setEntered] = useState(false);
  const [loadingIntro, setLoadingIntro] = useState(true);
  const [loadingShare, setLoadingShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedTelemetry, setParsedTelemetry] = useState<ParseResult | null>(null);
  const [telemetryReady, setTelemetryReady] = useState(false);
  const [telemetryParsing, setTelemetryParsing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = tokenFromPath();
    setLoadingIntro(true);
    setLoadingShare(false);
    setError(null);
    void getPublicFlightReviewIntro(token)
      .then((data) => {
        if (cancelled) return;
        setIntro(data);
        setLoadingIntro(false);
        setLoadingShare(true);
        void getPublicFlightReviewShare(token)
          .then((shareData) => {
            if (!cancelled) setShare(shareData);
          })
          .catch((err) => {
            if (!cancelled) setError((err as Error).message || "Link público não encontrado.");
          })
          .finally(() => {
            if (!cancelled) setLoadingShare(false);
          });
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Link público não encontrado.");
      })
      .finally(() => {
        if (!cancelled) setLoadingIntro(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (!share || telemetryReady || telemetryParsing) return;
    if (!share.flight.csv_text) {
      setParsedTelemetry(null);
      setTelemetryReady(true);
      return;
    }
    let cancelled = false;
    setTelemetryParsing(true);
    const timeoutId = window.setTimeout(() => {
      try {
        const decoded = decodeFlightRecord(share.flight.csv_text);
        const telemetryText = decoded.meta ? decoded.telemetryCsv : share.flight.csv_text;
        const parsed = telemetryText.trim() ? parseGarminCsv(telemetryText) : null;
        if (!cancelled) setParsedTelemetry(parsed);
      } catch {
        if (!cancelled) setParsedTelemetry(null);
      } finally {
        if (!cancelled) {
          setTelemetryReady(true);
          setTelemetryParsing(false);
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [share, telemetryParsing, telemetryReady]);

  if (loadingIntro) return <LoadingState />;

  if (error && !intro && !share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Flight Review</p>
          <h1 className="mt-2 text-2xl font-black">Link indisponível</h1>
          <p className="mt-2 text-sm text-slate-400">{error || "Este link público não está mais ativo."}</p>
        </div>
      </div>
    );
  }

  const brand = share?.brandSettings || intro?.brandSettings || null;
  const title = share?.missionName || intro?.missionName || "Flight Review";
  const studentName = intro?.studentNickname || intro?.studentName || "O aluno";
  const flightDateLabel = formatFlightDate(intro?.flightDate || share?.flight.flight_date);

  if (!entered) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-10">
          <div className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(15,23,42,0.96)_42%,rgba(16,185,129,0.18))] p-6 shadow-2xl shadow-slate-950/60 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
                {brand?.schoolName?.trim() || "Flight Review"}
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
                {studentName} compartilhou um voo com vocês
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Voo do dia {flightDateLabel}. Veja o vídeo, a telemetria e o Flight Review completo.
              </p>
              <button
                type="button"
                onClick={() => setEntered(true)}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300"
              >
                Acessar
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {brand?.logoDataUrl || brand?.logoUrl ? (
              <img
                src={brand.logoDataUrl || brand.logoUrl}
                alt={brand.schoolName || "Escola"}
                className="mt-8 h-14 w-auto max-w-48 object-contain opacity-90"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-slate-100 md:pb-0">
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
        <div className="mb-4 hidden md:block">
          <Tabs items={PUBLIC_VISIBLE_TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Flight Review público" accent="sky" />
        </div>

        {error && !share && !loadingShare ? (
          <div className="flex min-h-[22rem] items-center justify-center">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Flight Review</p>
              <h1 className="mt-2 text-2xl font-black">Link indisponível</h1>
              <p className="mt-2 text-sm text-slate-400">{error || "Este link público não está mais ativo."}</p>
            </div>
          </div>
        ) : null}

        {visitedTabs.has("resumo") || activeTab === "resumo" ? (
          <section hidden={activeTab !== "resumo"}>
            {share ? (
              <>
                <div className="mb-5">
                  <VideosTab flightId={share.flight.id} publicMode publicVideos={share.videos} />
                </div>
                {telemetryReady && parsedTelemetry && (
                  <FlightLegsPanel parsedTelemetry={parsedTelemetry} />
                )}
                <FlightSummaryPanel flight={share.flight} missionName={title} />
              </>
            ) : (
              <TabLoadingState label="Carregando..." />
            )}
          </section>
        ) : null}

        {visitedTabs.has("telemetria") || activeTab === "telemetria" ? (
          <section hidden={activeTab !== "telemetria"}>
            {!share || telemetryParsing || !telemetryReady ? (
              <TabLoadingState label="Carregando telemetria..." />
            ) : (
              <TelemetriaTab parsedResult={parsedTelemetry ?? undefined} publicMode />
            )}
          </section>
        ) : null}

        {visitedTabs.has("flight-review") || activeTab === "flight-review" ? (
          <section hidden={activeTab !== "flight-review"}>
            {share ? (
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
            ) : (
              <TabLoadingState label="Carregando Flight Review..." />
            )}
          </section>
        ) : null}

        {visitedTabs.has("videos") || activeTab === "videos" ? (
          <section hidden={activeTab !== "videos"}>
            {share ? (
              <VideosTab flightId={share.flight.id} publicMode publicVideos={share.videos} />
            ) : (
              <TabLoadingState label="Carregando vídeos..." />
            )}
          </section>
        ) : null}

        {visitedTabs.has("fotos") || activeTab === "fotos" ? (
          <section hidden={activeTab !== "fotos"}>
            {share ? (
              <PhotosTab flightId={share.flight.id} publicMode publicPhotos={share.photos ?? []} />
            ) : (
              <TabLoadingState label="Carregando fotos..." />
            )}
          </section>
        ) : null}

      </main>

      <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação do Flight Review público">
        <div className="flex rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
          {PUBLIC_VISIBLE_TABS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-semibold transition ${
                  isActive
                    ? "bg-sky-400 text-slate-950 shadow-lg shadow-sky-950/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="h-4 w-4">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function FlightLegsPanel({ parsedTelemetry }: { parsedTelemetry: ParseResult }) {
  const segments =
    parsedTelemetry.chartData.length > 0 && parsedTelemetry.hasChartTime
      ? detectFlightSegments(parsedTelemetry.chartData, parsedTelemetry.chartTimeBaseMs, parsedTelemetry.points, {
          aircraftIdent: parsedTelemetry.aircraftIdent,
        })
      : [];

  if (segments.length === 0) return null;

  const takeoffs = segments.filter((s) => s.type === "takeoff").length;
  const landings = segments.filter((s) => s.type === "landing").length;
  const tgls = segments.filter((s) => s.type === "tgl").length;

  return (
    <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Pernas do voo</h2>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {takeoffs > 0 && <span>{takeoffs} decolagem{takeoffs > 1 ? "s" : ""}</span>}
          {landings > 0 && <span>{landings} pouso{landings > 1 ? "s" : ""}</span>}
          {tgls > 0 && <span>{tgls} TGL{tgls > 1 ? "s" : ""}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {segments.map((seg) => (
          <span
            key={seg.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              seg.type === "takeoff"
                ? "border-emerald-700/30 bg-emerald-950/50 text-emerald-300"
                : seg.type === "landing"
                  ? "border-sky-700/30 bg-sky-950/50 text-sky-300"
                  : "border-violet-700/30 bg-violet-950/50 text-violet-300"
            }`}
          >
            <span aria-hidden="true">
              {seg.type === "takeoff" ? "↑" : seg.type === "landing" ? "↓" : "↕"}
            </span>
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
