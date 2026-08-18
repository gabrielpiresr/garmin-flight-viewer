import type { AiswebNotam } from "../types/aisweb";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";
import { airspaceEntryEteHours } from "../lib/airspaceIntersect";
import type { ProfilePhasePoint } from "../lib/routePerformanceProfile";
import {
  airspaceHitTypeBadgeClass,
  formatAirspaceEntryDistance,
  formatAirspaceEntryEte,
  formatAirspaceFreqCell,
} from "../lib/flightPlanFormat";
import { aiswebAirspaceUrl } from "../lib/aiswebLinks";
import { airspaceNotamLocation, filterNotamsForAirspace } from "../lib/airspaceNotams";

function notamPreview(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function AirspaceNotamList({ notams }: { notams: AiswebNotam[] }) {
  if (!notams.length) {
    return <p className="text-[11px] text-slate-500">Nenhum NOTAM para este espaço aéreo.</p>;
  }
  return (
    <div className="space-y-1.5">
      {notams.map((item) => (
        <details
          key={item.id || `${item.icao}-${item.number}-${item.issuedAt}`}
          className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5"
        >
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-cyan-200 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="mr-1 text-slate-500">▸</span>
            {item.number || "NOTAM"}
            {item.text ? <span className="ml-1 font-normal text-slate-400">· {notamPreview(item.text)}</span> : null}
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
            {item.text || "Sem texto."}
          </p>
        </details>
      ))}
    </div>
  );
}

export function AirspaceRouteList({
  hits,
  loading,
  error,
  waypointsLength,
  notamsByIcao,
  notamsLoading,
  profile,
}: {
  hits: FlightPlanAirspaceHit[];
  loading: boolean;
  error: string | null;
  waypointsLength: number;
  notamsByIcao: Record<string, AiswebNotam[]>;
  notamsLoading: boolean;
  profile?: ProfilePhasePoint[] | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-950/40 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Espaço aéreo na rota</h3>
        {loading ? <span className="text-[11px] text-slate-500">Consultando…</span> : null}
      </div>
      <p className="mb-2 text-[11px] text-slate-500">
        Ordem cronológica · FIR/FIS/TMA/CTA/CTR/ATZ/FIZ + P/R/D na altitude planejada
      </p>
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</p>
      ) : null}
      {!loading && !error && waypointsLength >= 2 && hits.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum espaço aéreo detectado ao longo da rota na altitude planejada.</p>
      ) : null}
      {waypointsLength < 2 ? (
        <p className="text-xs text-slate-500">Monte a rota com pelo menos 2 pontos para detectar espaços aéreos.</p>
      ) : null}
      {hits.length > 0 ? (
        <div className="space-y-2">
          {hits.map((a, idx) => {
            const location = airspaceNotamLocation(a);
            const notams = filterNotamsForAirspace(location ? notamsByIcao[location] || [] : [], a);
            const aiswebHref = aiswebAirspaceUrl({ ident: a.ident, fir: a.fir });
            return (
              <article key={`${a.type}-${a.ident}-${a.name}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/50">
                <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-500">{idx + 1}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${airspaceHitTypeBadgeClass(a.type)}`}>
                        {a.type}
                      </span>
                      <p className="text-xs font-semibold text-slate-100">{a.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{a.ident}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {a.lower || "—"} / {a.upper || "—"}
                      <span className="mx-1.5 text-slate-600">·</span>
                      {formatAirspaceFreqCell(a)}
                      <span className="mx-1.5 text-slate-600">·</span>
                      {formatAirspaceEntryDistance(a.entryDistanceNm)}
                      {formatAirspaceEntryEte(airspaceEntryEteHours(a, profile)) ? (
                        <span className="text-slate-500">
                          {" "}
                          {formatAirspaceEntryEte(airspaceEntryEteHours(a, profile))}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <a
                    href={aiswebHref}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200 hover:bg-cyan-500/20"
                  >
                    AISWEB
                  </a>
                </div>
                <div className="border-t border-slate-800 px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
                      NOTAMs ({notamsLoading && location && !notamsByIcao[location] ? "…" : notams.length})
                    </summary>
                    <div className="mt-2">
                      {notamsLoading && location && !notamsByIcao[location] ? (
                        <p className="text-[11px] text-slate-500">Carregando NOTAMs…</p>
                      ) : (
                        <AirspaceNotamList notams={notams} />
                      )}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
