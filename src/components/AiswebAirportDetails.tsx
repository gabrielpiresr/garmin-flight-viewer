import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, WMSTileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { prefetchAiswebChartBlobs, previewAiswebChartBlob, searchWindyWebcamsForAirport } from "../lib/aiswebDb";
import type {
  AiswebAirportBundle,
  AiswebAirspace,
  AiswebChart,
  AiswebComplement,
  AiswebDeclaredDistance,
  AiswebFrequency,
  AiswebNavaid,
  AiswebNotam,
  AiswebRemark,
  AiswebRotaer,
  AiswebSunTimes,
  AiswebSupplement,
  AiswebWebcam,
  AiswebWebcamsResult,
} from "../types/aisweb";
import { Tabs } from "./ui/Tabs";
import { AiswebSatelliteTab } from "./AiswebSatelliteTab";

type AirportMapStyle = "satellite" | "roads" | "terrain";
type AirspaceLayerId = "tma" | "ctr" | "atz" | "fir";

const AIRPORT_MAP_TILES: Record<
  AirportMapStyle,
  { url: string; attribution: string; maxZoom: number; subdomains?: string }
> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  roads: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: "abc",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
  },
};

const NAV_ICON = L.divIcon({
  className: "",
  html: `<span style="display:block;width:10px;height:10px;border-radius:2px;background:#fbbf24;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function AirportMapViewSync({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: false });
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [lat, lng, map]);
  return null;
}

type DetailSubTab = "meteorologia" | "satelite" | "detalhes" | "webcams" | "notams" | "cartas" | "suplementos";

function formatNotamDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUtcOffset(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const sign = hours >= 0 ? "+" : "−";
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return m ? `UTC${sign}${h}:${String(m).padStart(2, "0")}` : `UTC${sign}${h}`;
}

function formatWorkingSchedule(rotaer: AiswebRotaer | null): string {
  const schedules = rotaer?.workingHours?.schedules || [];
  if (schedules.length) {
    return schedules
      .map((s) => {
        const days = s.days.join("/") || "—";
        const hours = s.begin && s.end ? `${s.begin}–${s.end}` : "—";
        return `${days} ${hours} UTC${s.holidays ? " (feriados)" : ""}`;
      })
      .join(" · ");
  }
  return rotaer?.workingHours?.text || "—";
}

function formatFuel(rotaer: AiswebRotaer | null): string {
  const fuel = rotaer?.fuel;
  if (!fuel) return "—";
  const types = fuel.types?.length ? fuel.types.join(" · ") : fuel.text || "—";
  return fuel.hours ? `${types} · ${fuel.hours}` : types;
}

function utcHmToMinutes(hm: string | null | undefined): number | null {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function IconCloud() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.5 15.5h8a3.5 3.5 0 00.4-6.98A4.5 4.5 0 008.2 6.1 3.5 3.5 0 006.5 15.5z" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0 .75.75 0 001.5 0zM9.25 9h1.5v5h-1.5V9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconMap() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 4.75L8 3l4 2 5-1.25V15.5L12 17l-4-2-5 1.25V4.75z" />
    </svg>
  );
}

function IconNotam() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4 3.75A.75.75 0 014.75 3h10.5a.75.75 0 01.75.75v12.5a.75.75 0 01-1.14.64L10 14.06l-4.86 2.83A.75.75 0 014 16.25V3.75zm2 1.5v9.12l3.36-1.96a.75.75 0 01.78 0L13.5 14.37V5.25H6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function OperationCard({
  rotaer,
  airspace,
  lastNotamAt,
}: {
  rotaer: AiswebRotaer | null;
  airspace?: AiswebAirspace | null;
  lastNotamAt: string | null;
}) {
  const firLabel = airspace?.fir?.name
    ? `${airspace.fir.code || rotaer?.fir || "—"} · ${airspace.fir.name}`
    : rotaer?.fir || "—";
  const tmaLabel = airspace?.tma
    ? [airspace.tma.code, airspace.tma.name].filter(Boolean).join(" · ")
    : "—";

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-2.5 py-1.5">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Operação</p>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] leading-tight">
        <div>
          <dt className="text-slate-500">Tipo</dt>
          <dd className="font-medium text-slate-200">{rotaer?.typeOpr || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Utilização</dt>
          <dd className="font-medium text-slate-200">{rotaer?.typeUtil || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">FIR</dt>
          <dd className="font-medium text-slate-200">{firLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">TMA</dt>
          <dd className="font-medium text-slate-200">{tmaLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Elevação</dt>
          <dd className="font-medium text-slate-200">
            {rotaer?.altFt != null ? `${rotaer.altFt.toLocaleString("pt-BR")} ft` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Fuso</dt>
          <dd className="font-medium text-slate-200">{formatUtcOffset(rotaer?.utcOffsetHours)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Horário AD</dt>
          <dd className="font-medium text-slate-200">{formatWorkingSchedule(rotaer)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Combustível</dt>
          <dd className="font-medium text-slate-200">{formatFuel(rotaer)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Último NOTAM</dt>
          <dd className="font-medium text-slate-200">{formatNotamDate(lastNotamAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function SunCard({ sun }: { sun: AiswebSunTimes | null }) {
  const nowPct = useMemo(() => {
    const rise = utcHmToMinutes(sun?.sunriseUtc);
    const set = utcHmToMinutes(sun?.sunsetUtc);
    if (rise == null || set == null) return null;
    const now = new Date();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    // Handle overnight cases where sunset < sunrise (rare for Brazil civil day).
    if (set > rise) {
      if (nowMin < rise || nowMin > set) return null;
      return ((nowMin - rise) / (set - rise)) * 100;
    }
    // Overnight span
    if (nowMin > set && nowMin < rise) return null;
    const span = 1440 - rise + set;
    const elapsed = nowMin >= rise ? nowMin - rise : 1440 - rise + nowMin;
    return (elapsed / span) * 100;
  }, [sun?.sunriseUtc, sun?.sunsetUtc]);

  if (!sun?.sunriseUtc && !sun?.sunsetUtc) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
        Nascer/pôr do sol indisponível.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-sky-950/80 via-slate-950 to-indigo-950/80 px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
        Sol · UTC{sun.date ? ` · ${sun.date}` : ""}
      </p>
      <div className="relative mb-2 h-5">
        <div className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-amber-300 via-sky-300/70 to-indigo-300" />
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <span className="block h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <span className="block h-2.5 w-2.5 rounded-full border border-indigo-200/80 bg-indigo-950/40" />
        </div>
        {nowPct != null ? (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.85)]"
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${Math.min(100, Math.max(0, nowPct)) / 100})` }}
            title="Horário atual (UTC)"
          />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-amber-500/10 px-2 py-1 ring-1 ring-amber-400/20">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/80">Nascer</p>
          <p className="font-mono text-sm font-bold tabular-nums text-amber-100">
            {sun.sunriseUtc || "—"}
            <span className="ml-1 text-[9px] font-medium text-amber-200/60">UTC</span>
          </p>
        </div>
        <div className="rounded-md bg-indigo-500/10 px-2 py-1 ring-1 ring-indigo-400/20">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-indigo-200/80">Pôr</p>
          <p className="font-mono text-sm font-bold tabular-nums text-indigo-100">
            {sun.sunsetUtc || "—"}
            <span className="ml-1 text-[9px] font-medium text-indigo-200/60">UTC</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function FrequencyList({ frequencies }: { frequencies: AiswebFrequency[] }) {
  if (!frequencies.length) {
    return <p className="text-xs text-slate-500">Sem frequências COM no ROTAER.</p>;
  }
  return (
    <div className="grid gap-1.5 @md:grid-cols-2">
      {frequencies.map((f, i) => (
        <div
          key={`${f.service}-${i}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-950/50 px-2.5 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-cyan-300">{f.service}</p>
            {f.callsign ? <p className="truncate text-[10px] text-slate-500">{f.callsign}</p> : null}
          </div>
          <p className="shrink-0 font-mono text-xs font-semibold text-slate-100">
            {f.frequenciesMhz.join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

function RunwayDetails({ rotaer }: { rotaer: AiswebRotaer | null }) {
  const runways = rotaer?.runways || [];
  const declared = rotaer?.declaredDistances || [];
  if (!runways.length && !declared.length) {
    return <p className="text-xs text-slate-500">Sem dados de pista no ROTAER.</p>;
  }
  const declaredByRwy = new Map(declared.map((d) => [d.rwy.toUpperCase(), d]));

  return (
    <div className="space-y-2">
      {runways.map((rwy) => {
        const thrDeclared = (rwy.thresholds || [])
          .map((t) => declaredByRwy.get(t.ident.toUpperCase()))
          .filter(Boolean) as AiswebDeclaredDistance[];
        return (
          <div key={rwy.ident} className="rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2.5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold tracking-wide text-slate-100">{rwy.ident}</p>
              <p className="font-mono text-[11px] text-slate-400">
                {rwy.lengthM != null ? `${rwy.lengthM.toLocaleString("pt-BR")} × ` : ""}
                {rwy.widthM != null ? `${rwy.widthM} m` : ""}
              </p>
            </div>
            <p className="text-[11px] text-slate-400">
              {[rwy.surfaceLabel || rwy.surface, rwy.pcn ? `PCN ${rwy.pcn}` : null].filter(Boolean).join(" · ") || "—"}
            </p>
            {thrDeclared.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-[10px] text-slate-400">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pr-2 font-semibold">THR</th>
                      <th className="pr-2 font-semibold">TORA</th>
                      <th className="pr-2 font-semibold">TODA</th>
                      <th className="pr-2 font-semibold">ASDA</th>
                      <th className="font-semibold">LDA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thrDeclared.map((d) => (
                      <tr key={d.rwy} className="font-mono text-slate-300">
                        <td className="pr-2 py-0.5 font-sans font-semibold text-cyan-300/90">{d.rwy}</td>
                        <td className="pr-2 py-0.5">{d.toraM ?? "—"}</td>
                        <td className="pr-2 py-0.5">{d.todaM ?? "—"}</td>
                        <td className="pr-2 py-0.5">{d.asdaM ?? "—"}</td>
                        <td className="py-0.5">{d.ldaM ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {rwy.thresholds?.length ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Cabeceiras:{" "}
                {rwy.thresholds
                  .map((t) => {
                    const lights = (t.lights || [])
                      .map((l) => l.description || l.code)
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(", ");
                    return lights ? `${t.ident} (${lights})` : t.ident;
                  })
                  .join(" · ")}
              </p>
            ) : null}
            {(rwy.lights || []).length ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Pista: {(rwy.lights || []).map((l) => l.description || l.code).join(" · ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function NavaidsPanel({ navaids }: { navaids: AiswebNavaid[] }) {
  if (!navaids.length) {
    return <p className="text-xs text-slate-500">Sem auxílios NAV no ROTAER.</p>;
  }
  return (
    <div className="grid gap-1.5 @md:grid-cols-2">
      {navaids.map((nav, i) => (
        <div
          key={`${nav.type}-${nav.ident || i}`}
          className="rounded-lg border border-amber-500/20 bg-slate-950/50 px-2.5 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-300">{nav.type}</p>
              <p className="truncate text-[11px] text-slate-400">
                {[nav.ident, nav.threshold ? `THR ${nav.threshold}` : null].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <p className="shrink-0 font-mono text-xs font-semibold text-slate-100">
              {nav.frequencyMhz ? `${nav.frequencyMhz}` : "—"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AirportMap({
  rotaer,
  airspace,
}: {
  rotaer: AiswebRotaer | null;
  airspace?: AiswebAirspace | null;
}) {
  const [mapStyle, setMapStyle] = useState<AirportMapStyle>("satellite");
  const [layersOn, setLayersOn] = useState<Record<AirspaceLayerId, boolean>>({
    tma: true,
    ctr: true,
    atz: false,
    fir: false,
  });
  const lat = rotaer?.lat;
  const lng = rotaer?.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 px-3 py-8 text-center text-xs text-slate-500">
        Coordenadas indisponíveis para o mapa.
      </div>
    );
  }
  const center: [number, number] = [lat, lng];
  const tiles = AIRPORT_MAP_TILES[mapStyle];
  const wmsBase = airspace?.wms?.baseUrl || "https://geoaisweb.decea.mil.br/geoserver/ows";
  const wmsLayers = airspace?.wms?.layers || [
    { id: "tma", label: "TMA", layer: "ICA:TMA" },
    { id: "ctr", label: "CTR", layer: "ICA:CTR" },
    { id: "atz", label: "ATZ", layer: "ICA:ATZ" },
    { id: "fir", label: "FIR", layer: "ICA:SETOR_FIR" },
  ];
  const navaids = (rotaer?.navaids || []).filter(
    (n) => n.lat != null && n.lng != null && Number.isFinite(n.lat) && Number.isFinite(n.lng),
  );

  const mapOptions = [
    {
      id: "satellite" as const,
      label: "Satélite",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm3.2 4.4l-1.1 3.3-3.3 1.1 3.3 1.1 1.1 3.3 1.1-3.3 3.3-1.1-3.3-1.1-1.1-3.3z" />
        </svg>
      ),
    },
    {
      id: "roads" as const,
      label: "Rodovia",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M3 4.75L8 3l4 2 5-1.25V15.5L12 17l-4-2-5 1.25V4.75zm5 0v9.5l4 2V6.75l-4-2z" />
        </svg>
      ),
    },
    {
      id: "terrain" as const,
      label: "Relevo",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2.5 15.5l5.2-7.2 3.1 4.2 2.2-3 4.5 6H2.5zm9.2-9.5a1.6 1.6 0 110-3.2 1.6 1.6 0 010 3.2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mapa</p>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
          {mapOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMapStyle(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                mapStyle === opt.id
                  ? "bg-cyan-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950/40 px-2.5 py-1.5">
        <span className="mr-1 self-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Espaço aéreo
        </span>
        {wmsLayers.map((layer) => {
          const id = layer.id as AirspaceLayerId;
          const on = layersOn[id] === true;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => setLayersOn((prev) => ({ ...prev, [id]: !prev[id] }))}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                on
                  ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-700 hover:text-slate-300"
              }`}
            >
              {layer.label}
            </button>
          );
        })}
      </div>
      <div className="h-96 w-full bg-slate-950 [&_.leaflet-control-attribution]:text-[9px]">
        <MapContainer
          center={center}
          zoom={11}
          className="h-full w-full"
          scrollWheelZoom
          zoomControl
        >
          <AirportMapViewSync lat={lat} lng={lng} />
          <TileLayer
            key={mapStyle}
            attribution={tiles.attribution}
            url={tiles.url}
            maxZoom={tiles.maxZoom}
            {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})}
          />
          {wmsLayers.map((layer) => {
            const id = layer.id as AirspaceLayerId;
            if (!layersOn[id]) return null;
            return (
              <WMSTileLayer
                key={`${layer.layer}-${mapStyle}`}
                url={wmsBase}
                layers={layer.layer}
                format="image/png"
                transparent
                version="1.1.1"
                opacity={id === "fir" ? 0.35 : 0.55}
                attribution="DECEA GeoAISWEB"
              />
            );
          })}
          <CircleMarker
            center={center}
            radius={8}
            pathOptions={{
              color: "#22d3ee",
              fillColor: "#0891b2",
              fillOpacity: 0.95,
              weight: 2,
            }}
          />
          {navaids.map((nav, i) => (
            <Marker
              key={`nav-${nav.ident || i}`}
              position={[nav.lat as number, nav.lng as number]}
              icon={NAV_ICON}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="text-[11px]">
                  {nav.type}
                  {nav.ident ? ` ${nav.ident}` : ""}
                  {nav.frequencyMhz ? ` · ${nav.frequencyMhz}` : ""}
                </span>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function ChartsPanel({ charts }: { charts: AiswebChart[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(charts[0]?.id ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!charts.some((c) => c.id === selectedId)) {
      setSelectedId(charts[0]?.id ?? null);
    }
  }, [charts, selectedId]);

  const selected = charts.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function loadPreview() {
      if (!selected?.link) {
        setPreviewUrl(null);
        setPreviewError(null);
        setPreviewLoading(false);
        return;
      }
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const chart = await previewAiswebChartBlob(selected.link);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(chart.blob);
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          createdUrl = null;
          return;
        }
        setPreviewUrl(createdUrl);
        const rest = charts.map((c) => c.link).filter((link) => link && link !== selected.link);
        prefetchAiswebChartBlobs(rest, 3);
      } catch (error) {
        if (cancelled) return;
        setPreviewError(error instanceof Error ? error.message : "Falha ao carregar preview.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [charts, selected?.id, selected?.link]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!charts.length) {
    return <p className="text-xs text-slate-500">Nenhuma carta disponível.</p>;
  }

  const previewHeightClass = "h-[min(80vh,56rem)]";

  return (
    <div className="grid gap-3 @4xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className={`flex ${previewHeightClass} flex-col gap-1.5 overflow-y-auto pr-1`}>
        {charts.map((chart) => {
          const active = chart.id === selectedId;
          return (
            <button
              key={chart.id}
              type="button"
              onClick={() => setSelectedId(chart.id)}
              className={`rounded-lg border px-2.5 py-2 text-left transition ${
                active
                  ? "border-cyan-500/50 bg-cyan-500/10"
                  : "border-slate-700/60 bg-slate-950/50 hover:border-slate-600"
              }`}
            >
              <p className="truncate text-xs font-semibold text-slate-100">
                <span className="mr-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
                  {chart.tipo}
                </span>
                {chart.name}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {chart.tipoDescr || "Carta AISWEB"}
                {chart.date ? ` · ${chart.date}` : ""}
              </p>
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-2.5 py-1.5">
          <p className="truncate text-[11px] text-slate-300">
            {selected ? `${selected.tipo} · ${selected.name}` : "Preview"}
            {previewLoading ? <span className="ml-2 text-slate-500">carregando…</span> : null}
          </p>
          {selected ? (
            <a
              href={selected.link}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
            >
              Abrir PDF ↗
            </a>
          ) : null}
        </div>
        {previewError && !previewUrl ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-rose-300">{previewError}</p>
            {selected ? (
              <a
                href={selected.link}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Abrir PDF em nova aba
              </a>
            ) : null}
          </div>
        ) : previewUrl ? (
          <div className={`relative ${previewHeightClass}`}>
            <object data={previewUrl} type="application/pdf" className="h-full w-full bg-slate-900">
              <iframe title="Preview da carta" src={previewUrl} className="h-full w-full bg-slate-900" />
            </object>
            {previewLoading ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-slate-800">
                <div className="h-full w-1/3 animate-pulse bg-cyan-400/80" />
              </div>
            ) : null}
          </div>
        ) : previewLoading ? (
          <div className={`flex ${previewHeightClass} items-center justify-center text-xs text-slate-400`}>
            Carregando preview…
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-slate-500">Sem preview</div>
        )}
      </div>
    </div>
  );
}

function ExpandableRemarks({
  title,
  remarks,
  metarRemark,
}: {
  title: string;
  remarks: AiswebRemark[];
  metarRemark?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const count = remarks.length + (metarRemark ? 1 : 0);
  if (!count) return null;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/30">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title} ({count})
        </span>
        <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2.5">
          {metarRemark ? (
            <div className="rounded-md bg-slate-900/70 px-2.5 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">METAR RMK</p>
              <p className="font-mono text-[12px] leading-relaxed text-slate-300">{metarRemark}</p>
            </div>
          ) : null}
          {remarks.map((rmk, i) => (
            <div key={`${rmk.code || "rmk"}-${i}`} className="rounded-md bg-slate-900/70 px-2.5 py-2">
              {rmk.code ? (
                <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">cod {rmk.code}</p>
              ) : null}
              <p className="text-[12px] leading-relaxed text-slate-300">{rmk.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExpandableComplements({ complements }: { complements: AiswebComplement[] }) {
  const [open, setOpen] = useState(false);
  if (!complements.length) return null;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/30">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          COMPL ({complements.length})
        </span>
        <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2.5">
          {complements.map((item, i) => (
            <div key={`${item.code || "compl"}-${item.index ?? i}`} className="rounded-md bg-slate-900/70 px-2.5 py-2">
              {item.code || item.index != null ? (
                <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">
                  {[item.code ? `cod ${item.code}` : null, item.index != null ? `n ${item.index}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <p className="text-[12px] leading-relaxed text-slate-300">{item.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AiswebAirportTopCards({ airport }: { airport: AiswebAirportBundle }) {
  const lastNotamAt = useMemo(() => {
    let best: string | null = null;
    let bestTs = 0;
    for (const n of airport.notams || []) {
      const iso = n.issuedAt || n.validFrom;
      const ts = Date.parse(iso || "") || 0;
      if (ts > bestTs) {
        bestTs = ts;
        best = iso;
      }
    }
    return best;
  }, [airport.notams]);

  return (
    <div className="grid gap-2 @2xl:grid-cols-2">
      <OperationCard rotaer={airport.rotaer} airspace={airport.airspace} lastNotamAt={lastNotamAt} />
      <SunCard sun={airport.sun || null} />
    </div>
  );
}

function SupplementsPanel({ supplements }: { supplements: AiswebSupplement[] }) {
  if (!supplements.length) {
    return <p className="text-xs text-slate-500">Nenhum suplemento AIP em vigor para este aeródromo.</p>;
  }
  return (
    <div className="space-y-2">
      {supplements.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-violet-500/20 bg-slate-950/50 px-3 py-2.5"
        >
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-bold tracking-wide text-violet-200">
              SUP {item.number}
              {item.tipo ? ` · ${item.tipo}` : ""}
            </p>
            <p className="text-[10px] text-slate-500">{item.status || "em vigor"}</p>
          </div>
          {item.title ? <p className="mb-1 text-[12px] font-semibold text-slate-100">{item.title}</p> : null}
          {item.text ? (
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{item.text}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {item.duration ? <span>{item.duration}</span> : null}
            {item.ref ? <span>Ref: {item.ref}</span> : null}
            {item.validFrom || item.validTo ? (
              <span>
                {formatNotamDate(item.validFrom)} → {formatNotamDate(item.validTo)}
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function NotamsPanel({ notams }: { notams: AiswebNotam[] }) {
  if (!notams.length) {
    return <p className="text-xs text-slate-500">Nenhum NOTAM ativo para este aeródromo.</p>;
  }
  return (
    <div className="space-y-2">
      {notams.map((item) => (
        <article
          key={item.id || `${item.icao}-${item.number}-${item.issuedAt}`}
          className="rounded-xl border border-sky-500/20 bg-slate-950/50 px-3 py-2.5"
        >
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-bold tracking-wide text-sky-200">
              {item.number || item.id || "NOTAM"}
              {item.type ? ` · ${item.type}` : ""}
            </p>
            {item.status ? <p className="text-[10px] uppercase text-slate-500">{item.status}</p> : null}
          </div>
          {item.text ? (
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{item.text}</p>
          ) : (
            <p className="text-[12px] text-slate-500">Sem texto.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {item.category ? <span>{item.category}</span> : null}
            {item.qCode ? <span>Q: {item.qCode}</span> : null}
            {item.lowerLimit || item.upperLimit ? (
              <span>
                {[item.lowerLimit, item.upperLimit].filter(Boolean).join(" → ")}
              </span>
            ) : null}
            {item.issuedAt ? <span>Emitido: {formatNotamDate(item.issuedAt)}</span> : null}
            {item.validFrom || item.validTo ? (
              <span>
                Válido: {formatNotamDate(item.validFrom)} → {formatNotamDate(item.validTo)}
              </span>
            ) : null}
            {item.schedule ? <span>{item.schedule}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatWebcamDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDistanceKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function webcamPlayerUrl(webcam: AiswebWebcam | null): string {
  if (!webcam) return "";
  return webcam.player.live || webcam.player.day || webcam.player.month || "";
}

function webcamPreviewUrl(webcam: AiswebWebcam | null): string {
  if (!webcam) return "";
  return webcam.image.preview || webcam.image.thumbnail || webcam.image.icon || "";
}

function WebcamCard({
  webcam,
  active,
  onSelect,
}: {
  webcam: AiswebWebcam;
  active: boolean;
  onSelect: () => void;
}) {
  const categories = webcam.categories.map((c) => c.name || c.id).filter(Boolean).slice(0, 2);
  const preview = webcamPreviewUrl(webcam);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[5rem_minmax(0,1fr)] gap-2 rounded-lg border p-2 text-left transition ${
        active
          ? "border-cyan-500/60 bg-cyan-500/10"
          : "border-slate-700/70 bg-slate-950/45 hover:border-slate-600 hover:bg-slate-900/70"
      }`}
    >
      <div className="h-16 overflow-hidden rounded-md bg-slate-900">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-slate-600">Sem imagem</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-100">{webcam.title || "Webcam"}</p>
        <p className="mt-1 truncate text-[10px] text-slate-500">
          {[webcam.location.city, webcam.location.region].filter(Boolean).join(" · ") || "Local N/D"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
            {formatDistanceKm(webcam.distanceKm)}
          </span>
          {categories.map((category) => (
            <span key={category} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              {category}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function WindyWebcamsPanel({ airport }: { airport: AiswebAirportBundle }) {
  const [result, setResult] = useState<AiswebWebcamsResult | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCoords =
    airport.rotaer?.lat != null &&
    airport.rotaer?.lng != null &&
    Number.isFinite(airport.rotaer.lat) &&
    Number.isFinite(airport.rotaer.lng);

  useEffect(() => {
    setResult(null);
    setSelectedId(null);
    setError(null);
  }, [airport.icao]);

  async function loadWebcams() {
    if (!hasCoords) {
      setError("Coordenadas indisponíveis no ROTAER para buscar webcams próximas.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await searchWindyWebcamsForAirport(airport, { radiusKm: 60, limit: 8 });
      setResult(next);
      setSelectedId((current) => {
        if (current && next.webcams.some((webcam) => webcam.webcamId === current)) return current;
        return next.webcams[0]?.webcamId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao buscar webcams do Windy.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWebcams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airport.icao, hasCoords]);

  const webcams = result?.webcams || [];
  const selected = webcams.find((webcam) => webcam.webcamId === selectedId) || webcams[0] || null;
  const playerUrl = webcamPlayerUrl(selected);
  const previewUrl = webcamPreviewUrl(selected);

  if (!hasCoords) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 px-3 py-8 text-center text-xs text-slate-500">
        Coordenadas indisponíveis para buscar webcams próximas.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Webcams próximas</p>
          <p className="text-[11px] text-slate-500">
            {result
              ? `${webcams.length}/${result.total} em até ${formatDistanceKm(result.radiusKm)} · Windy`
              : `Raio ${formatDistanceKm(60)} · Windy`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWebcams()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466.75.75 0 10-1.061 1.06 7 7 0 0011.697-3.138.75.75 0 00-1.435-.388zM4.688 8.576a5.5 5.5 0 019.201-2.466.75.75 0 101.061-1.06A7 7 0 003.253 8.188a.75.75 0 101.435.388z"
              clipRule="evenodd"
            />
          </svg>
          Atualizar
        </button>
      </div>

      {loading && !result ? (
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="h-80 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />
          <div className="space-y-2">
            <div className="h-20 animate-pulse rounded-lg border border-slate-800 bg-slate-950/50" />
            <div className="h-20 animate-pulse rounded-lg border border-slate-800 bg-slate-950/50" />
            <div className="h-20 animate-pulse rounded-lg border border-slate-800 bg-slate-950/50" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-5 text-center">
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      ) : null}

      {!loading && !error && result && webcams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 px-3 py-8 text-center text-xs text-slate-500">
          Nenhuma webcam ativa encontrada próxima a {airport.icao}.
        </div>
      ) : null}

      {selected ? (
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{selected.title || "Webcam"}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {[selected.location.city, selected.location.region].filter(Boolean).join(" · ") || "Local N/D"} ·{" "}
                  {formatDistanceKm(selected.distanceKm)} · {formatWebcamDate(selected.lastUpdatedOn)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selected.urls.detail ? (
                  <a
                    href={selected.urls.detail}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Windy ↗
                  </a>
                ) : null}
                {selected.urls.provider ? (
                  <a
                    href={selected.urls.provider}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-200"
                  >
                    Fonte ↗
                  </a>
                ) : null}
              </div>
            </div>
            <div className="aspect-video bg-slate-950">
              {playerUrl ? (
                <iframe
                  key={`${selected.webcamId}-${playerUrl}`}
                  title={selected.title || "Webcam Windy"}
                  src={playerUrl}
                  className="h-full w-full"
                  loading="lazy"
                  allowFullScreen
                />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={selected.title || "Webcam Windy"}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Preview indisponível.
                </div>
              )}
            </div>
            <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">
              Imagens fornecidas por{" "}
              <a
                href={result?.attributionUrl || "https://www.windy.com/webcams"}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Windy
              </a>
              .
            </div>
          </div>

          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {webcams.map((webcam) => (
              <WebcamCard
                key={webcam.webcamId}
                webcam={webcam}
                active={selected.webcamId === webcam.webcamId}
                onSelect={() => setSelectedId(webcam.webcamId)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AiswebAirportDetailTabs({
  airport,
  meteorology,
  initialSubTab = "meteorologia",
  focusKey = "",
}: {
  airport: AiswebAirportBundle;
  meteorology: ReactNode;
  initialSubTab?: DetailSubTab;
  focusKey?: string;
}) {
  const [subTab, setSubTab] = useState<DetailSubTab>(initialSubTab);
  const rotaer = airport.rotaer;
  const frequencies = rotaer?.frequencies || [];
  const navaids = rotaer?.navaids || [];
  const remarks = rotaer?.remarks || [];
  const complements = rotaer?.complements || [];
  const charts = airport.charts || [];
  const supplements = airport.supplements || [];
  const notams = airport.notams || [];

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [airport.icao, initialSubTab, focusKey]);

  const items = [
    { id: "meteorologia" as const, label: "Meteorologia", icon: <IconCloud /> },
    { id: "detalhes" as const, label: "Detalhes", icon: <IconInfo /> },
    { id: "satelite" as const, label: "Satélite", icon: <IconMap /> },
    { id: "webcams" as const, label: "Webcams", icon: <IconMap /> },
    {
      id: "notams" as const,
      label: `NOTAMs (${notams.length})`,
      icon: <IconNotam />,
    },
    {
      id: "suplementos" as const,
      label: `Suplementos (${supplements.length})`,
      icon: <IconInfo />,
    },
    { id: "cartas" as const, label: `Cartas (${charts.length})`, icon: <IconMap /> },
  ];

  return (
    <div className="space-y-3">
      <Tabs items={items} value={subTab} onChange={setSubTab} ariaLabel="Subabas AISWEB" accent="cyan" />
      {subTab === "meteorologia" ? meteorology : null}
      {subTab === "satelite" ? (
        <AiswebSatelliteTab
          icao={airport.icao}
          lat={rotaer?.lat}
          lon={rotaer?.lng}
        />
      ) : null}
      {subTab === "webcams" ? <WindyWebcamsPanel airport={airport} /> : null}
      {subTab === "detalhes" ? (
        <div className="space-y-3">
          <AiswebAirportTopCards airport={airport} />
          <div className="grid gap-3 @2xl:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Frequências</p>
              <FrequencyList frequencies={frequencies} />
            </div>
            <div className="min-w-0 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Auxílios NAV</p>
              <NavaidsPanel navaids={navaids} />
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Pistas · distâncias declaradas
            </p>
            <RunwayDetails rotaer={rotaer} />
          </div>
          <AirportMap rotaer={rotaer} airspace={airport.airspace} />
          <ExpandableRemarks
            title="RMKs"
            remarks={remarks}
            metarRemark={airport.met.parsed?.remarks || null}
          />
          <ExpandableComplements complements={complements} />
        </div>
      ) : null}
      {subTab === "notams" ? <NotamsPanel notams={notams} /> : null}
      {subTab === "suplementos" ? <SupplementsPanel supplements={supplements} /> : null}
      {subTab === "cartas" ? <ChartsPanel charts={charts} /> : null}
    </div>
  );
}

/** @deprecated kept for external fallbacks */
export function AiswebAirportDetails({ airport }: { airport: AiswebAirportBundle }) {
  return (
    <AiswebAirportDetailTabs
      airport={airport}
      meteorology={<p className="text-xs text-slate-500">Ver aba Condições para meteorologia.</p>}
    />
  );
}
