import { useMemo, useState } from "react";
import { formatDistanceNm, summarizeFlightPlanRoute } from "../../lib/flightPlanningRoute";
import type { SavedFlightRoute } from "../../lib/savedFlightRoutes";
import type { FlightPlanWaypoint } from "../../types/flightPlanning";
import { IconPlusSmall, PlanejamentoHoverButton } from "./PlanejamentoSectionShell";

const searchClass =
  "h-8 w-40 min-w-[9rem] flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 sm:max-w-[14rem] sm:flex-none";

type Props = {
  routes: SavedFlightRoute[];
  loading: boolean;
  activeSavedId: string | null;
  onNewRoute: () => void;
  onOpenRoute: (route: SavedFlightRoute) => void;
  onDelete: (route: SavedFlightRoute) => void;
};

function routeEndpoints(route: SavedFlightRoute): { origin: string; dest: string } {
  const wps = route.waypoints;
  if (!wps.length) return { origin: "—", dest: "—" };
  return {
    origin: wps[0]?.label?.trim() || "DEP",
    dest: wps[wps.length - 1]?.label?.trim() || "ARR",
  };
}

function routeMatchesQuery(route: SavedFlightRoute, query: string): boolean {
  if (!query) return true;
  const { origin, dest } = routeEndpoints(route);
  const labels = route.waypoints.map((wp) => wp.label || "").join(" ");
  const haystack = `${route.name} ${origin} ${dest} ${labels}`.toLowerCase();
  return haystack.includes(query);
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.023.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** SVG local da rota — sem fetch de mapa, para não pesar a listagem. */
function RouteCardBanner({ waypoints }: { waypoints: FlightPlanWaypoint[] }) {
  const w = 400;
  const h = 128;
  const drawing = useMemo(() => {
    if (!waypoints.length) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of waypoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const pad = 0.18;
    let spanLng = Math.max((maxLng - minLng) * (1 + pad * 2), 0.06);
    let spanLat = Math.max((maxLat - minLat) * (1 + pad * 2), 0.045);
    const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
    const targetAspect = w / h;
    const geoAspect = (spanLng * cosLat) / spanLat;
    if (geoAspect < targetAspect) spanLng = (spanLat * targetAspect) / cosLat;
    else spanLat = (spanLng * cosLat) / targetAspect;
    minLng = midLng - spanLng / 2;
    maxLng = midLng + spanLng / 2;
    minLat = midLat - spanLat / 2;
    maxLat = midLat + spanLat / 2;

    const step = waypoints.length > 48 ? Math.ceil(waypoints.length / 48) : 1;
    const sampled: FlightPlanWaypoint[] = [];
    for (let i = 0; i < waypoints.length; i += step) sampled.push(waypoints[i]!);
    if (sampled[sampled.length - 1] !== waypoints[waypoints.length - 1]) {
      sampled.push(waypoints[waypoints.length - 1]!);
    }

    const pts = sampled.map((p) => ({
      x: ((p.lng - minLng) / (maxLng - minLng || 1)) * w,
      y: ((maxLat - p.lat) / (maxLat - minLat || 1)) * h,
    }));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return { pts, d };
  }, [waypoints]);

  if (!drawing) {
    return <div className="h-32 bg-slate-800" />;
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-32 w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width={w} height={h} fill="#334155" />
      <path d={drawing.d} fill="none" stroke="rgba(15,23,42,0.55)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={drawing.d} fill="none" stroke="#22d3ee" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {drawing.pts.map((p, i) => {
        const first = i === 0;
        const last = i === drawing.pts.length - 1;
        if (!first && !last) return null;
        return (
          <circle
            key={`${p.x}-${p.y}-${i}`}
            cx={p.x}
            cy={p.y}
            r={5}
            fill={first ? "#34d399" : "#f472b6"}
            stroke="#fff"
            strokeWidth="1.2"
          />
        );
      })}
    </svg>
  );
}

export function PlanejamentoLibrary({
  routes,
  loading,
  activeSavedId,
  onNewRoute,
  onOpenRoute,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => routes.filter((route) => routeMatchesQuery(route, normalizedQuery)),
    [routes, normalizedQuery],
  );

  return (
    <div className="space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {routes.length > 0 ? (
          <input
            className={searchClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            autoComplete="off"
            aria-label="Buscar rotas por nome ou ICAO"
          />
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <PlanejamentoHoverButton
          variant="primary"
          icon={<IconPlusSmall />}
          label="Nova rota"
          onClick={onNewRoute}
        />
      </div>

      {loading && routes.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-500">
          Carregando rotas da conta…
        </p>
      ) : routes.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/40 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-100">Nenhuma rota salva</p>
          <p className="mt-1 text-xs text-slate-500">
            Crie a primeira para montar no mapa e gerar briefing.
          </p>
          <div className="mt-4 flex justify-center">
            <PlanejamentoHoverButton
              variant="primary"
              icon={<IconPlusSmall />}
              label="Nova rota"
              onClick={onNewRoute}
            />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Nenhuma rota encontrada para “{query.trim()}”.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((route) => {
            const { origin, dest } = routeEndpoints(route);
            const summary = summarizeFlightPlanRoute(route.waypoints, {
              cruiseSpeedKt: route.cruiseSpeedKt,
            });
            const isActive = activeSavedId === route.id;
            return (
              <li
                key={route.id}
                className={`group/card relative cursor-pointer overflow-hidden rounded-lg border transition duration-200 ${
                  isActive
                    ? "border-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-950/40"
                    : "border-slate-700 bg-slate-900 hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-slate-800 hover:shadow-xl hover:shadow-cyan-950/40"
                }`}
              >
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  onClick={() => onOpenRoute(route)}
                >
                  <RouteCardBanner waypoints={route.waypoints} />
                  <div className="px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-100 group-hover/card:text-white">
                      {route.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 group-hover/card:text-slate-300">
                      {origin} → {dest} · {route.waypoints.length} pts
                      {route.waypoints.length > 1 ? ` · ${formatDistanceNm(summary.distanceNm)}` : ""}
                      {" · "}
                      {new Date(route.updatedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  className="absolute right-2 top-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-600 bg-slate-900/90 text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300"
                  title="Excluir"
                  aria-label={`Excluir ${route.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(route);
                  }}
                >
                  <IconTrash />
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={onNewRoute}
              className="flex min-h-[13.5rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-600 bg-slate-900/40 px-3 py-6 text-slate-400 transition hover:border-emerald-400/70 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current">
                <IconPlusSmall />
              </span>
              <span className="text-sm font-semibold">Nova rota</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
