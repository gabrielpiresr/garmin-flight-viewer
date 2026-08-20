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
  saga_flight_id_adopted: "ID SAGA adotado",
  saga_flight_missing_purged: "Voo removido (ausente no SAGA)",
  ghost_flight_merged: "Voo temporário apontado",
};

const FIELD_LABELS: Record<string, string> = {
  sagaFlightId: "ID SAGA",
  localId: "Documento local",
  name: "Nome",
  sourceFilename: "Arquivo / origem",
  durationSec: "Duração (s)",
  blockTimeMinutes: "Bloco (min)",
  telemetryPresent: "Telemetria",
  csvFileId: "Arquivo CSV",
};

const TRANSFER_LABELS: Record<string, string> = {
  videos: "vídeos",
  photos: "fotos",
  telemetrySummaries: "resumos de telemetria",
  landings: "pousos",
  takeoffs: "decolagens",
  alerts: "alertas",
  maneuvers: "manobras",
  reviews: "revisões",
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

function parseSnapshot(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "sim" : "não";
  return String(value);
}

function snapshotSagaIds(event: AdminAuditEvent) {
  const before = parseSnapshot(event.beforeSnapshotJson);
  const after = parseSnapshot(event.afterSnapshotJson);
  const sagaIdFrom = asString(after?.sagaIdFrom ?? before?.sagaIdFrom);
  const sagaIdTo = after?.sagaIdTo == null && before?.sagaIdTo == null
    ? ""
    : asString(after?.sagaIdTo ?? before?.sagaIdTo);
  const deletedLocalId = asString(after?.deletedLocalId ?? before?.deletedLocalId);
  const keptLocalId = asString(after?.keptLocalId ?? before?.keptLocalId);
  const candidates = Array.isArray(after?.successorCandidates)
    ? after.successorCandidates.map((item) => String(item))
    : Array.isArray(before?.successorCandidates)
      ? before.successorCandidates.map((item) => String(item))
      : [];
  const changes = Array.isArray(after?.changes) ? after.changes : [];
  const transferred = after?.transferred && typeof after.transferred === "object"
    ? after.transferred as Record<string, unknown>
    : {};
  return { sagaIdFrom, sagaIdTo, deletedLocalId, keptLocalId, candidates, changes, transferred };
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
            const saga = snapshotSagaIds(event);
            const hasSagaIds = saga.sagaIdFrom !== "-" || Boolean(saga.sagaIdTo && saga.sagaIdTo !== "-");
            const transferParts = Object.entries(saga.transferred)
              .filter(([, count]) => Number(count) > 0)
              .map(([key, count]) => `${count} ${TRANSFER_LABELS[key] || key}`);
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

                {hasSagaIds ? (
                  <div className="mt-3 rounded border border-sky-500/20 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">
                    <p>
                      ID SAGA{" "}
                      <span className="font-semibold">{saga.sagaIdFrom}</span>
                      {saga.sagaIdTo && saga.sagaIdTo !== "-" ? (
                        <>
                          {" → "}
                          <span className="font-semibold">{saga.sagaIdTo}</span>
                        </>
                      ) : (
                        " (sem sucessor)"
                      )}
                    </p>
                    {saga.keptLocalId !== "-" || saga.deletedLocalId !== "-" ? (
                      <p className="mt-1 text-xs text-sky-200/80">
                        {saga.keptLocalId !== "-" ? `Manteve ${saga.keptLocalId}` : null}
                        {saga.keptLocalId !== "-" && saga.deletedLocalId !== "-" ? " · " : null}
                        {saga.deletedLocalId !== "-" ? `Excluiu ${saga.deletedLocalId}` : null}
                      </p>
                    ) : null}
                    {saga.candidates.length > 1 ? (
                      <p className="mt-1 text-xs text-sky-200/80">
                        Sucessores no SAGA: {saga.candidates.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {event.reason ? (
                  <p className="mt-3 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                    {event.reason}
                  </p>
                ) : null}

                {saga.changes.length > 0 ? (
                  <div className="mt-3 overflow-x-auto rounded border border-slate-800">
                    <table className="min-w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/80 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Campo</th>
                          <th className="px-3 py-2 font-semibold">Antes</th>
                          <th className="px-3 py-2 font-semibold">Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saga.changes.map((change, index) => {
                          const row = change && typeof change === "object"
                            ? change as { field?: string; from?: unknown; to?: unknown }
                            : {};
                          return (
                            <tr key={`${event.id}-change-${index}`} className="border-t border-slate-800">
                              <td className="px-3 py-2 text-slate-200">
                                {FIELD_LABELS[String(row.field || "")] || row.field || "-"}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px]">{asString(row.from)}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{asString(row.to)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {transferParts.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Enriquecimento transferido: {transferParts.join(", ")}.
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
