import L from "leaflet";
import { useMemo } from "react";
import { Circle, Marker, Polygon, Tooltip } from "react-leaflet";
import { aiswebNotamUrl } from "../lib/aiswebLinks";
import type { RouteNotamHit } from "../lib/routeNotams";

const NM_IN_M = 1852;

function notamIcon(label: string, count: number) {
  const safe = label.replace(/[<>&"]/g, "");
  const badge = count > 1 ? String(count) : "N";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="width:16px;height:16px;background:#dc2626;border:2px solid #fecaca;box-shadow:0 0 0 1px rgba(0,0,0,.55);transform:rotate(45deg)"></div>
      <span style="font:700 9px/1 ui-monospace,monospace;color:#fecaca;background:rgba(127,29,29,.94);padding:2px 5px;border-radius:4px">${safe}${count > 1 ? ` · ${badge}` : ""}</span>
    </div>`,
    iconSize: [96, 34],
    iconAnchor: [48, 10],
  });
}

function clusterKey(hit: RouteNotamHit): string {
  return `${hit.lat.toFixed(3)}:${hit.lng.toFixed(3)}`;
}

function formatValidity(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function RouteNotamInfoPanel({
  hits,
  activeId,
  onActiveIdChange,
  onClose,
  className,
}: {
  hits: RouteNotamHit[];
  activeId: string;
  onActiveIdChange: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const active = hits.find((hit) => hit.id === activeId) || hits[0];
  if (!active) return null;
  const notam = active.notam;
  const aisweb = aiswebNotamUrl(notam.icao);

  return (
    <aside
      className={`pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-red-500/50 bg-slate-950 shadow-2xl shadow-black/50 ${
        className ?? "w-full"
      }`}
      style={{ borderTopColor: "#ef4444", borderTopWidth: 3 }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300">NOTAM na rota</p>
          <p className="truncate font-mono text-sm font-bold tracking-wide text-slate-100">
            {notam.number || "NOTAM"}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {notam.icao}
            {active.airspace ? ` · ${active.airspace.type} ${active.airspace.ident}` : ""}
            {` · ${active.distanceNm < 0.2 ? "na rota" : `${active.distanceNm.toFixed(1)} NM`}`}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={onClose}
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      {hits.length > 1 ? (
        <div className="flex max-h-24 shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain border-b border-slate-800 px-2 py-2">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => onActiveIdChange(hit.id)}
              className={`rounded-md px-2 py-1 text-left font-mono text-[11px] ${
                hit.id === active.id
                  ? "bg-red-500/20 text-red-100"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {hit.notam.number || "NOTAM"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2.5">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Válido de</p>
            <p className="text-slate-200">{formatValidity(notam.validFrom)}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Até</p>
            <p className="text-slate-200">{formatValidity(notam.validTo)}</p>
          </div>
        </div>
        {notam.qCode ? (
          <p className="font-mono text-[11px] text-slate-400">Q {notam.qCode}</p>
        ) : null}
        {(notam.lowerLimit || notam.upperLimit) && (
          <p className="text-[11px] text-slate-300">
            Limites: {notam.lowerLimit || "—"} / {notam.upperLimit || "—"}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-100">
          {notam.text || "Sem texto."}
        </p>
        <a
          href={aisweb}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex w-full items-center justify-center rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-100 hover:bg-red-500/20"
        >
          Abrir AISWEB
        </a>
      </div>
    </aside>
  );
}

export function RouteNotamsOverlay({
  hits,
  show,
  selectedId = null,
  onSelect,
}: {
  hits: RouteNotamHit[];
  show: boolean;
  selectedId?: string | null;
  onSelect: (hits: RouteNotamHit[], activeId: string) => void;
}) {
  const clusters = useMemo(() => {
    const map = new Map<string, RouteNotamHit[]>();
    for (const hit of hits) {
      const key = clusterKey(hit);
      const list = map.get(key) || [];
      list.push(hit);
      map.set(key, list);
    }
    return [...map.values()];
  }, [hits]);

  if (!show || !hits.length) return null;

  return (
    <>
      {hits.map((hit) => {
        if (hit.shape.kind === "circle") {
          return (
            <Circle
              key={`notam-circle-${hit.id}`}
              center={[hit.lat, hit.lng]}
              radius={hit.shape.radiusNm * NM_IN_M}
              pathOptions={{
                color: selectedId === hit.id ? "#fecaca" : "#dc2626",
                weight: selectedId === hit.id ? 3 : 2,
                fillColor: "#ef4444",
                fillOpacity: selectedId === hit.id ? 0.22 : 0,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelect([hit], hit.id);
                },
              }}
            />
          );
        }
        if (hit.shape.kind === "polygon") {
          return (
            <Polygon
              key={`notam-poly-${hit.id}`}
              positions={hit.shape.points.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: selectedId === hit.id ? "#fecaca" : "#dc2626",
                weight: selectedId === hit.id ? 3 : 2,
                fillColor: "#ef4444",
                fillOpacity: selectedId === hit.id ? 0.22 : 0,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelect([hit], hit.id);
                },
              }}
            />
          );
        }
        return null;
      })}
      {clusters.map((group) => {
        const first = group[0]!;
        const label = group.length > 1 ? `${group.length} NOTAMs` : first.notam.number || "NOTAM";
        return (
          <Marker
            key={`notam-mark-${clusterKey(first)}`}
            position={[first.lat, first.lng]}
            icon={notamIcon(label, group.length)}
            zIndexOffset={920}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelect(group, first.id);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {label}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
