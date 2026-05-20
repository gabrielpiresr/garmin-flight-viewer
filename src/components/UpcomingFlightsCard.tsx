import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFlightDateTimeMs, isFutureFlight, type FlightDisplayInfo } from "../lib/flightDisplay";
import { listSavedFlights, type SavedFlightListItem } from "../lib/flightsDb";
import {
  buildBasicFlightListDisplayInfo,
  loadFullFlightListDisplayInfos,
} from "../lib/flightListDisplayCache";

type UpcomingFlight = {
  item: SavedFlightListItem;
  info: FlightDisplayInfo;
};

type UpcomingFlightsCardProps = {
  className?: string;
  limit?: number;
  onOpenFlights: () => void;
  title?: string;
  subtitle?: string;
};

function formatFlightDate(info: FlightDisplayInfo, item: SavedFlightListItem): string {
  const iso = info.flightDateIso ?? item.created_at.slice(0, 10);
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function futureStudentPendingItems(info: FlightDisplayInfo): string[] {
  const pending: string[] = [];
  if (!info.studentSuggestionMd.trim()) pending.push("sugestão do aluno");
  if (!info.weightBalanceFilled) pending.push("peso e balanceamento");
  return pending;
}

export function UpcomingFlightsCard({
  className = "w-full",
  limit = 3,
  onOpenFlights,
  title = "Próximos voos",
  subtitle = "Somente os próximos voos futuros atribuídos a você.",
}: UpcomingFlightsCardProps) {
  const { user, configured } = useAuth();
  const [flights, setFlights] = useState<UpcomingFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !configured) {
      setFlights([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: Math.max(50, limit * 4) },
    );
    if (listError) {
      setError(listError.message);
      setFlights([]);
      setLoading(false);
      return;
    }

    const items = data ?? [];
    const upcomingItems = items
      .map((item) => ({ item, info: buildBasicFlightListDisplayInfo(item) }))
      .filter(({ item, info }) => isFutureFlight(item, info))
      .sort((a, b) => getFlightDateTimeMs(a.item, a.info) - getFlightDateTimeMs(b.item, b.info))
      .slice(0, limit)
      .map(({ item }) => item);
    const infoById = await loadFullFlightListDisplayInfos(upcomingItems, { concurrency: 3 });
    const rows = upcomingItems.map((item) => ({
      item,
      info: infoById[item.id] ?? buildBasicFlightListDisplayInfo(item),
    }));
    setFlights(rows);
    setLoading(false);
  }, [configured, limit, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextFlights = useMemo(
    () =>
      flights
        .filter(({ item, info }) => isFutureFlight(item, info))
        .sort((a, b) => getFlightDateTimeMs(a.item, a.info) - getFlightDateTimeMs(b.item, b.info))
        .slice(0, limit),
    [flights, limit],
  );

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
          <p className="py-4 text-sm text-slate-500">Nenhum voo futuro atribuído.</p>
        ) : (
          <div className="space-y-3">
            {nextFlights.map(({ item, info }) => {
              const pending = user?.role === "aluno" ? futureStudentPendingItems(info) : [];
              return (
                <article key={item.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">
                        {formatFlightDate(info, item)} · {info.startTime || "horário a definir"}
                      </p>
                    </div>
                    <span className="max-w-full shrink-0 break-words rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 [overflow-wrap:anywhere]">
                      {info.aircraft}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                    <p>
                      Aluno: <span className="text-slate-300">{info.studentName}</span>
                    </p>
                    {info.instructorName ? (
                      <p>
                        Instrutor: <span className="text-slate-300">{info.instructorName}</span>
                      </p>
                    ) : null}
                    <p>
                      Rota: <span className="text-slate-300">{info.fromTo}</span>
                    </p>
                    <p>
                      Sugestão INVA:{" "}
                      <span className="text-slate-300">{info.instructorSuggestionMd ? "preenchida" : "pendente"}</span>
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
            })}
          </div>
        )}
      </div>
    </section>
  );
}
