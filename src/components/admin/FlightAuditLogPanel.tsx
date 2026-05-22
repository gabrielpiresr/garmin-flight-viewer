import { useEffect, useMemo, useState } from "react";
import { listFlightAuditEvents, type AdminAuditEvent } from "../../lib/adminUsersDb";

type Props = {
  flightId: string;
};

const EVENT_LABELS: Record<string, string> = {
  flight_reopened_for_edit: "Reabertura para edição",
  flight_admin_edited: "Edição administrativa",
  flight_signed: "Assinatura eletrônica",
  logbook_exported: "Exportação ANAC",
};

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function prettyJson(value: string | null): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function shortHash(value: string | null): string {
  return value ? value.slice(0, 12) : "-";
}

export function FlightAuditLogPanel({ flightId }: Props) {
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listFlightAuditEvents(flightId)
      .then((items) => {
        if (!cancelled) setEvents(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar auditoria.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flightId]);

  const expandedEvent = useMemo(
    () => events.find((event) => event.id === expandedId) ?? null,
    [events, expandedId],
  );

  if (loading) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-800" />
        <div className="h-20 animate-pulse rounded bg-slate-800/70" />
        <div className="h-20 animate-pulse rounded bg-slate-800/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Auditoria do voo</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-100">Histórico completo</h3>
        <p className="mt-1 text-sm text-slate-400">
          Eventos append-only com motivo, snapshots e hashes para rastreabilidade do EDB.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
          Nenhum evento de auditoria registrado para este voo.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const isExpanded = event.id === expandedId;
            return (
              <article key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(event.occurredAt)} · Ator {event.actorUserId || "-"} · {event.actorRole || "-"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    {isExpanded ? "Ocultar" : "Ver detalhes"}
                  </button>
                </div>

                {event.reason ? (
                  <p className="mt-3 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                    {event.reason}
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                  <span>Hash antes: {shortHash(event.beforeHash)}</span>
                  <span>Hash depois: {shortHash(event.afterHash)}</span>
                  <span>Hash evento: {shortHash(event.eventHash)}</span>
                </div>

                {isExpanded ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Antes</p>
                      <pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                        {prettyJson(event.beforeSnapshotJson) || "-"}
                      </pre>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Depois</p>
                      <pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                        {prettyJson(event.afterSnapshotJson) || "-"}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {expandedEvent ? (
        <p className="text-xs text-slate-500">
          Evento {expandedEvent.id}; IP {expandedEvent.ip || "-"}; agente {expandedEvent.userAgent || "-"}.
        </p>
      ) : null}
    </div>
  );
}
