import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FlightReviewTab } from "../components/FlightReviewTab";
import { FlightSummaryPanel } from "../components/JourneyFlightReviewPage";
import { TelemetriaTab } from "../components/TelemetriaTab";
import { Tabs } from "../components/ui/Tabs";
import { VideosTab } from "../components/VideosTab";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import {
  getPublicFlightReviewIntro,
  getPublicFlightReviewShare,
  type PublicFlightReviewIntro,
  type PublicFlightReviewShare,
} from "../lib/publicFlightReviewShare";
import { parseGarminCsv, type ParseResult } from "../lib/parseGarminCsv";

type PublicTab = "resumo" | "telemetria" | "flight-review" | "videos";

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
        <path d="M3.5 5.75A1.75 1.75 0 015.25 4h7.5a1.75 1.75 0 011.75 1.75v.84l2.38-1.43A.75.75 0 0118 5.8v8.4a.75.75 0 01-1.12.65l-2.38-1.43v.83A1.75 1.75 0 0112.75 16h-7.5a1.75 1.75 0 01-1.75-1.75v-8.5z" />
      </svg>
    ),
  },
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

function formatFlightDate(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "este voo";
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function ContentLoadingState({ intro }: { intro: PublicFlightReviewIntro }) {
  const brand = intro.brandSettings;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">
              {brand?.schoolName?.trim() || "Flight Review"}
            </p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
              {intro.missionName || "Flight Review"}
            </h1>
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
      <main className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center px-4 py-10">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-sm text-slate-300">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Carregando o Flight Review...
        </div>
      </main>
    </div>
  );
}

export function PublicFlightReviewPage() {
  const [intro, setIntro] = useState<PublicFlightReviewIntro | null>(null);
  const [share, setShare] = useState<PublicFlightReviewShare | null>(null);
  const [activeTab, setActiveTab] = useState<PublicTab>("resumo");
  const [entered, setEntered] = useState(false);
  const [loadingIntro, setLoadingIntro] = useState(true);
  const [loadingShare, setLoadingShare] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const parsedTelemetry = useMemo<ParseResult | null>(() => {
    if (activeTab !== "telemetria" || !share?.flight.csv_text) return null;
    const decoded = decodeFlightRecord(share.flight.csv_text);
    const telemetryText = decoded.meta ? decoded.telemetryCsv : share.flight.csv_text;
    if (!telemetryText.trim()) return null;
    try {
      return parseGarminCsv(telemetryText);
    } catch {
      return null;
    }
  }, [activeTab, share]);

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
  const studentName = intro?.studentName || "O aluno";
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
                Voo do dia {flightDateLabel}. Veja o resumo, a telemetria, o Flight Review e os vídeos em uma página pública.
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

  if (!share) {
    if (error && !loadingShare) {
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
    return <ContentLoadingState intro={intro ?? { flightId: "", missionName: title, studentName, flightDate: "", startTime: "", aircraftIdent: "", brandSettings: brand }} />;
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
          <Tabs items={PUBLIC_TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Flight Review público" accent="sky" />
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

      <nav className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação do Flight Review público">
        <div className="flex overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
          {PUBLIC_TABS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-[4.75rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition ${
                  isActive
                    ? "bg-sky-400 text-slate-950 shadow-lg shadow-sky-950/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="h-4 w-4">{item.icon}</span>
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
