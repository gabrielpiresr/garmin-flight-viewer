import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFlightDateTimeMs, isFutureFlight, type FlightDisplayInfo } from "../lib/flightDisplay";
import { listSavedFlights, type SavedFlightListItem } from "../lib/flightsDb";
import {
  buildBasicFlightListDisplayInfo,
  loadFullFlightListDisplayInfos,
} from "../lib/flightListDisplayCache";
import { getPublicSchedule, type PublicScheduleFlight } from "../lib/scheduleBookingDb";

type SavedUpcomingFlight = {
  kind: "saved";
  id: string;
  at: number;
  item: SavedFlightListItem;
  info: FlightDisplayInfo;
};

type ScheduleUpcomingFlight = {
  kind: "schedule";
  id: string;
  at: number;
  flight: PublicScheduleFlight;
};

type UpcomingFlight = SavedUpcomingFlight | ScheduleUpcomingFlight;

type UpcomingFlightsCardProps = {
  className?: string;
  limit?: number;
  onLoadingChange?: (loading: boolean) => void;
  onOpenFlights: () => void;
  title?: string;
  subtitle?: string;
};

function upcomingRange(): { from: string; to: string } {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0, 12);
  return { from, to: end.toISOString().slice(0, 10) };
}

function scheduleDateTimeMs(flight: PublicScheduleFlight): number {
  const time = flight.startTime || flight.presentationTime || "00:00";
  const date = new Date(`${flight.flightDate}T${time}`);
  const value = date.getTime();
  return Number.isNaN(value) ? 0 : value;
}

function isFutureScheduleFlight(flight: PublicScheduleFlight): boolean {
  const startsAt = scheduleDateTimeMs(flight);
  const endsAt = startsAt + Math.max(flight.durationMinutes || 0, 30) * 60_000;
  return endsAt >= Date.now();
}

function formatFlightDate(info: FlightDisplayInfo, item: SavedFlightListItem): string {
  const iso = info.flightDateIso ?? item.created_at.slice(0, 10);
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function formatScheduleFlightDate(flight: PublicScheduleFlight): string {
  const date = new Date(`${flight.flightDate}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function futureStudentPendingItems(info: FlightDisplayInfo): string[] {
  const pending: string[] = [];
  if (!info.studentSuggestionMd.trim()) pending.push("sugestao do aluno");
  if (!info.weightBalanceFilled) pending.push("peso e balanceamento");
  return pending;
}

function scheduleStatusLabel(status: PublicScheduleFlight["status"]): string {
  return status;
}

function savedRow(item: SavedFlightListItem): SavedUpcomingFlight {
  const info = buildBasicFlightListDisplayInfo(item);
  return { kind: "saved", id: item.id, at: getFlightDateTimeMs(item, info), item, info };
}

function scheduleRow(flight: PublicScheduleFlight): ScheduleUpcomingFlight {
  return { kind: "schedule", id: `schedule:${flight.id}`, at: scheduleDateTimeMs(flight), flight };
}

export function UpcomingFlightsCard({
  className = "w-full",
  limit = 3,
  onLoadingChange,
  onOpenFlights,
  title = "Proximos voos",
  subtitle = "Somente os proximos voos futuros atribuidos a voce.",
}: UpcomingFlightsCardProps) {
  const { user, configured } = useAuth();
  const [flights, setFlights] = useState<UpcomingFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const load = useCallback(async () => {
    if (!user || !configured) {
      setFlights([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const range = upcomingRange();
    const [savedResult, scheduleResult] = await Promise.allSettled([
      listSavedFlights({ userId: user.id, role: user.role }, { limit: Math.max(50, limit * 4) }),
      getPublicSchedule(range.from, range.to),
    ]);

    const errors: string[] = [];
    let savedRows: SavedUpcomingFlight[] = [];
    let scheduleRows: ScheduleUpcomingFlight[] = [];

    if (savedResult.status === "fulfilled") {
      if (savedResult.value.error) {
        errors.push(savedResult.value.error.message);
      } else {
        savedRows = (savedResult.value.data ?? [])
          .map(savedRow)
          .filter(({ item, info }) => isFutureFlight(item, info))
          .sort((a, b) => a.at - b.at);
      }
    } else {
      errors.push(savedResult.reason instanceof Error ? savedResult.reason.message : "Falha ao carregar voos salvos.");
    }

    if (scheduleResult.status === "fulfilled") {
      scheduleRows = scheduleResult.value.flights
        .filter((flight) => flight.isOwn || flight.studentUserId === user.id)
        .filter(isFutureScheduleFlight)
        .map(scheduleRow)
        .sort((a, b) => a.at - b.at);
    } else {
      errors.push(scheduleResult.reason instanceof Error ? scheduleResult.reason.message : "Falha ao carregar a escala.");
    }

    const savedSagaIds = new Set(savedRows.map((row) => row.item.saga_flight_id).filter(Boolean));
    const mergedRows = [
      ...savedRows,
      ...scheduleRows.filter((row) => !savedSagaIds.has(row.flight.id)),
    ]
      .sort((a, b) => a.at - b.at)
      .slice(0, limit);

    setFlights(mergedRows);
    setLoading(false);
    if (mergedRows.length === 0 && errors.length > 0) {
      setError(errors[0]);
      return;
    }

    const savedItems = mergedRows.flatMap((row) => (row.kind === "saved" ? [row.item] : []));
    if (savedItems.length === 0) return;

    const infoById = await loadFullFlightListDisplayInfos(savedItems, { concurrency: 3 });
    setFlights((current) =>
      current
        .map((row) =>
          row.kind === "saved"
            ? {
                ...row,
                info: infoById[row.item.id] ?? buildBasicFlightListDisplayInfo(row.item),
                at: getFlightDateTimeMs(row.item, infoById[row.item.id] ?? row.info),
              }
            : row,
        )
        .sort((a, b) => a.at - b.at)
        .slice(0, limit),
    );
  }, [configured, limit, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextFlights = useMemo(() => [...flights].sort((a, b) => a.at - b.at).slice(0, limit), [flights, limit]);

  return (
    <section className={`${className} min-w-0`}>
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
        <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Agenda</p>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="break-words text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onOpenFlights}
            className="w-full shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 sm:w-auto"
          >
            Ver todos
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            Carregando voos...
          </div>
        ) : error ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
            {error}
          </p>
        ) : nextFlights.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">Nenhum voo futuro atribuido.</p>
        ) : (
          <div className="space-y-3">
            {nextFlights.map((row) =>
              row.kind === "saved" ? (
                <SavedUpcomingFlightArticle key={row.id} item={row.item} info={row.info} isStudent={user?.role === "aluno"} />
              ) : (
                <ScheduleUpcomingFlightArticle key={row.id} flight={row.flight} />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SavedUpcomingFlightArticle({
  item,
  info,
  isStudent,
}: {
  item: SavedFlightListItem;
  info: FlightDisplayInfo;
  isStudent: boolean;
}) {
  const pending = isStudent ? futureStudentPendingItems(info) : [];
  return (
    <article className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            {formatFlightDate(info, item)} - {info.startTime || "horario a definir"}
          </p>
        </div>
        <span className="max-w-full shrink-0 break-words rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 [overflow-wrap:anywhere]">
          {info.aircraft}
        </span>
      </div>
      <div className="mt-3 grid gap-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
        <p>
          Instrutor: <span className="text-slate-300">{info.instructorName || "a definir"}</span>
        </p>
        <p>
          Rota: <span className="text-slate-300">{info.fromTo}</span>
        </p>
        <p>
          Sugestao INVA: <span className="text-slate-300">{info.instructorSuggestionMd ? "preenchida" : "pendente"}</span>
        </p>
        {pending.length > 0 ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
            <span className="font-semibold">Pendente antes do voo: </span>
            {pending.join(" e ")}.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ScheduleUpcomingFlightArticle({ flight }: { flight: PublicScheduleFlight }) {
  return (
    <article className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            {formatScheduleFlightDate(flight)} - {flight.startTime || flight.presentationTime || "horario a definir"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{scheduleStatusLabel(flight.status)}</p>
        </div>
        <span className="max-w-full shrink-0 break-words rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 [overflow-wrap:anywhere]">
          {flight.aircraftIdent}
        </span>
      </div>
      <div className="mt-3 grid gap-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
        <p>
          Apresentacao: <span className="text-slate-300">{flight.presentationTime || "-"}</span>
        </p>
        <p>
          Instrutor: <span className="text-slate-300">{flight.instructorName || "a definir"}</span>
        </p>
        {flight.notes ? (
          <p>
            Observacoes: <span className="text-slate-300">{flight.notes}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
