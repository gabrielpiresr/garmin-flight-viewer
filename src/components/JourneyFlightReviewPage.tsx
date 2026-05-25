import { useEffect, useMemo, useState, type ReactNode } from "react";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { getSavedFlight, type SavedFlightFull } from "../lib/flightsDb";
import { FlightReviewTab } from "./FlightReviewTab";
import { TelemetriaTab } from "./TelemetriaTab";
import { VideosTab } from "./VideosTab";
import { Tabs } from "./ui/Tabs";

type JourneyFlightReviewTab = "resumo" | "telemetria" | "flight-review" | "videos";

type Props = {
  flightId: string;
  missionName: string;
  onBack: () => void;
};

const REVIEW_TABS: Array<{ id: JourneyFlightReviewTab; label: string; icon?: ReactNode }> = [
  { id: "resumo", label: "Inicial" },
  { id: "telemetria", label: "Telemetria" },
  { id: "flight-review", label: "Flight Review" },
  { id: "videos", label: "Videos" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  if (!total) return "-";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function InfoTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function FlightSummaryPanel({ flight, missionName }: { flight: SavedFlightFull; missionName: string }) {
  const decoded = useMemo(() => decodeFlightRecord(flight.csv_text), [flight.csv_text]);
  const meta = decoded.meta;
  const route = flight.from_to || meta?.legs.map((leg) => `${leg.dep}-${leg.arr}`).join(" / ") || "-";
  const student = meta?.header.studentName || meta?.header.studentLabel || flight.student_user_id || "-";
  const instructor = meta?.header.instructorName || flight.instructor_user_id || "-";
  const objective = meta?.preFlight.objectiveMd?.trim();

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Resumo do voo</p>
        <h2 className="mt-1 text-2xl font-black text-slate-100">{missionName}</h2>
        <p className="mt-2 text-sm text-slate-500">
          Informacoes principais da ficha vinculada a esta missao da trilha.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Data" value={formatDate(flight.flight_date ?? meta?.header.date)} />
          <InfoTile label="Horario" value={flight.start_time || meta?.header.startTime || "-"} />
          <InfoTile label="Aeronave" value={flight.aircraft_ident || meta?.header.aircraft || "-"} />
          <InfoTile label="Duracao" value={formatDuration(flight.duration_sec)} />
          <InfoTile label="Rota" value={route} />
          <InfoTile label="Pousos" value={flight.landings ?? meta?.legs.reduce((sum, leg) => sum + (leg.landings || 0), 0) ?? "-"} />
          <InfoTile label="Aluno" value={student} />
          <InfoTile label="Instrutor" value={instructor} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile label="Telemetria" value={flight.telemetry_present ? "Disponivel" : "Nao disponivel"} />
          <InfoTile label="Status do voo" value={flight.flight_status} />
          <InfoTile label="Assinatura INVA" value={flight.instructor_signed ? "Assinada" : "Pendente"} />
        </div>
        {objective ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Objetivo</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{objective}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function JourneyFlightReviewPage({ flightId, missionName, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<JourneyFlightReviewTab>("resumo");
  const [flight, setFlight] = useState<SavedFlightFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSavedFlight(flightId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(result.error?.message ?? "Voo nao encontrado.");
        setFlight(null);
      } else {
        setFlight(result.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [flightId]);

  return (
    <div className="min-w-0 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-sky-400 underline-offset-4 hover:text-sky-300 hover:underline"
      >
        &larr; Jornada
      </button>

      <Tabs items={REVIEW_TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Flight Review da jornada" accent="sky" />

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-2xl bg-slate-800/40" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-800/30" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{error}</div>
      ) : flight ? (
        <>
          <div hidden={activeTab !== "resumo"}>
            <FlightSummaryPanel flight={flight} missionName={missionName} />
          </div>
          <div hidden={activeTab !== "telemetria"}>
            <TelemetriaTab flightId={flightId} />
          </div>
          <div hidden={activeTab !== "flight-review"}>
            <FlightReviewTab flightId={flightId} />
          </div>
          <div hidden={activeTab !== "videos"}>
            <VideosTab flightId={flightId} />
          </div>
        </>
      ) : null}
    </div>
  );
}
