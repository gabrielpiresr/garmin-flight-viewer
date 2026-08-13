import { useEffect, useMemo, useState } from "react";
import { lookupAiswebIcao } from "../lib/aiswebDb";
import type { AiswebAirportBundle, AiswebRotaer, AiswebSunTimes } from "../types/aisweb";
import { AiswebAirportDetailTabs, AiswebAirportTopCards } from "./AiswebAirportDetails";
import { AiswebMeteorologyPanel } from "./AiswebMeteorologyPanel";

type PopupProps = {
  icao: string;
  fallbackName?: string;
  onAddToRoute?: () => void;
  onOpenDetails?: (bundle: AiswebAirportBundle) => void;
  /** Chamado quando o popup fecha (para não abrir pick no mesmo clique). */
  onPopupClose?: () => void;
};

function formatWorkingScheduleShort(rotaer: AiswebRotaer | null | undefined): string {
  const schedules = rotaer?.workingHours?.schedules || [];
  if (schedules.length) {
    return schedules
      .map((s) => {
        const days = s.days.join("/") || "—";
        const hours = s.begin && s.end ? `${s.begin}–${s.end}` : "—";
        return `${days} ${hours}`;
      })
      .join(" · ");
  }
  return rotaer?.workingHours?.text || "—";
}

function formatFuelShort(rotaer: AiswebRotaer | null | undefined): string {
  const fuel = rotaer?.fuel;
  if (!fuel) return "—";
  const types = fuel.types?.length ? fuel.types.join(" · ") : fuel.text || "—";
  return fuel.hours ? `${types} · ${fuel.hours}` : types;
}

function formatRunwaysShort(rotaer: AiswebRotaer | null | undefined): string[] {
  const runways = rotaer?.runways || [];
  return runways.map((rwy) => {
    const size =
      rwy.lengthM != null && rwy.widthM != null
        ? `${rwy.lengthM.toLocaleString("pt-BR")} × ${rwy.widthM} m`
        : rwy.lengthM != null
          ? `${rwy.lengthM.toLocaleString("pt-BR")} m`
          : "—";
    const surface = (rwy.surfaceLabel || rwy.surface || "").trim();
    return surface ? `${rwy.ident} - ${size} · ${surface}` : `${rwy.ident} - ${size}`;
  });
}

function CompactSun({ sun }: { sun: AiswebSunTimes | null }) {
  if (!sun?.sunriseUtc && !sun?.sunsetUtc) return null;
  return (
    <div className="text-[10px] leading-none text-slate-600">
      Sol · <span className="font-semibold text-slate-800">{sun.sunriseUtc || "—"}</span> Z /{" "}
      <span className="font-semibold text-slate-800">{sun.sunsetUtc || "—"}</span> Z
    </div>
  );
}

/** Popup compacto e mais horizontal; ações disponíveis antes do carregamento. */
export function AerodromeMapPopupContent({
  icao,
  fallbackName,
  onAddToRoute,
  onOpenDetails,
}: PopupProps) {
  const [bundle, setBundle] = useState<AiswebAirportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBundle(null);
    void lookupAiswebIcao(icao)
      .then((airport) => {
        if (!cancelled) setBundle(airport);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha AISWEB.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [icao]);

  const runways = useMemo(() => formatRunwaysShort(bundle?.rotaer), [bundle]);

  return (
    <div className="ad-map-popup w-[min(92vw,300px)] max-w-[300px] text-slate-900 [&_p]:m-0">
      <div className="mb-1 min-w-0 leading-none">
        <div className="font-mono text-[13px] font-bold tracking-widest text-emerald-700">{icao}</div>
        <div className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-slate-800">
          {bundle?.rotaer?.name || fallbackName || "—"}
        </div>
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-500">Carregando…</div>
      ) : error ? (
        <div className="text-[10px] text-rose-600">{error}</div>
      ) : bundle ? (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] leading-none">
            <div>
              <div className="text-[9px] text-slate-500">Tipo</div>
              <div className="mt-px font-medium text-slate-800">{bundle.rotaer?.typeOpr || "—"}</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">Utilização</div>
              <div className="mt-px font-medium text-slate-800">{bundle.rotaer?.typeUtil || "—"}</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">Elevação</div>
              <div className="mt-px font-medium text-slate-800">
                {bundle.rotaer?.altFt != null ? `${bundle.rotaer.altFt.toLocaleString("pt-BR")} ft` : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[9px] text-slate-500">Combustível</div>
              <div className="mt-px line-clamp-2 font-medium leading-tight text-slate-800">
                {formatFuelShort(bundle.rotaer)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">Horário AD</div>
              <div className="mt-px line-clamp-2 font-medium leading-tight text-slate-800">
                {formatWorkingScheduleShort(bundle.rotaer)}
              </div>
            </div>
          </div>

          {runways.length ? (
            <div className="text-[10px] leading-tight text-slate-700">
              <span className="text-slate-500">Pistas · </span>
              {runways.join(" · ")}
            </div>
          ) : null}

          <CompactSun sun={bundle.sun || null} />

          <div className="grid grid-cols-2 gap-1">
            <div className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 leading-none">
              <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">METAR</div>
              <div className="mt-px line-clamp-2 font-mono text-[8px] leading-snug text-slate-700">
                {bundle.met?.metar?.trim() || "—"}
              </div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 leading-none">
              <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">TAF</div>
              <div className="mt-px line-clamp-2 font-mono text-[8px] leading-snug text-slate-600">
                {bundle.met?.taf?.trim() || "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-1.5 flex gap-1.5">
        {onAddToRoute ? (
          <button
            type="button"
            className="min-w-0 flex-1 rounded bg-emerald-600 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-white hover:bg-emerald-500"
            onClick={onAddToRoute}
          >
            + Rota
          </button>
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-white hover:bg-slate-700 disabled:opacity-40"
          disabled={!bundle}
          onClick={() => bundle && onOpenDetails?.(bundle)}
        >
          Detalhes
        </button>
      </div>
    </div>
  );
}

type SideProps = {
  bundle: AiswebAirportBundle | null;
  open: boolean;
  onClose: () => void;
};

/** Painel lateral — full-screen no celular, ~45% no tablet/desktop. */
export function AerodromeDetailsSidePanel({ bundle, open, onClose }: SideProps) {
  if (!open || !bundle) return null;
  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-full flex-col border-l border-slate-700 bg-slate-950 shadow-2xl sm:max-w-[min(100%,28rem)] lg:max-w-[45vw] lg:min-w-[320px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
          <div>
            <p className="font-mono text-sm font-bold tracking-widest text-cyan-300">{bundle.icao}</p>
            <p className="text-[11px] text-slate-400">{bundle.rotaer?.name || "Detalhes AISWEB"}</p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="@container flex-1 overflow-y-auto p-3">
          <div className="mb-3">
            <AiswebAirportTopCards airport={bundle} />
          </div>
          <AiswebAirportDetailTabs
            airport={bundle}
            meteorology={<AiswebMeteorologyPanel airport={bundle} />}
          />
        </div>
      </aside>
    </div>
  );
}
