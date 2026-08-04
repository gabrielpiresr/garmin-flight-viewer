import { useEffect, useMemo, useRef, useState } from "react";
import {
  WINDY_AIRPORT_ZOOM,
  WINDY_DEFAULT_CENTER,
  WINDY_OVERLAYS,
  buildWindyEmbedUrl,
  buildWindySiteUrl,
  type WindyOverlayId,
} from "../lib/windyEmbed";
import { WindyIsobarsIcon, WindyOverlayIcon } from "../lib/windyOverlayIcons";

type AiswebSatelliteTabProps = {
  lat?: number | null;
  lon?: number | null;
  icao?: string | null;
};

/** Impede o scroll do layout pai de “roubar” o gesto de arrastar o mapa no mobile. */
function useMapTouchScrollLock(active: boolean) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const el = wrapRef.current;
    if (!el) return;

    const scrollParents: HTMLElement[] = [];
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "overlay") {
        scrollParents.push(node);
      }
      node = node.parentElement;
    }

    const lock = () => {
      for (const parent of scrollParents) {
        parent.dataset.windyScrollLock = parent.style.overflowY || "";
        parent.style.overflowY = "hidden";
      }
    };
    const unlock = () => {
      for (const parent of scrollParents) {
        parent.style.overflowY = parent.dataset.windyScrollLock || "";
        delete parent.dataset.windyScrollLock;
      }
    };

    const onStart = () => lock();
    const onEnd = () => unlock();

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("pointerdown", onStart);
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);

    return () => {
      unlock();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("pointerdown", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [active]);

  return wrapRef;
}

export function AiswebSatelliteTab({ lat, lon, icao }: AiswebSatelliteTabProps = {}) {
  const [overlay, setOverlay] = useState<WindyOverlayId>("clouds");
  const [pressure, setPressure] = useState(false);
  const mapWrapRef = useMapTouchScrollLock(true);

  const hasAirport =
    lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);

  const center = useMemo(
    () =>
      hasAirport
        ? { lat: lat as number, lon: lon as number, zoom: WINDY_AIRPORT_ZOOM }
        : { ...WINDY_DEFAULT_CENTER },
    [hasAirport, lat, lon],
  );

  const embedUrl = useMemo(
    () =>
      buildWindyEmbedUrl({
        overlay,
        pressure,
        lat: center.lat,
        lon: center.lon,
        zoom: center.zoom,
        marker: hasAirport,
      }),
    [overlay, pressure, center.lat, center.lon, center.zoom, hasAirport],
  );
  const siteUrl = useMemo(
    () => buildWindySiteUrl({ overlay, lat: center.lat, lon: center.lon, zoom: center.zoom }),
    [overlay, center.lat, center.lon, center.zoom],
  );
  const active = WINDY_OVERLAYS.find((o) => o.id === overlay);
  const placeLabel = icao ? icao.toUpperCase() : "Brasil";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Mapa met · {placeLabel}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
            Windy com pan, zoom e timeline
            {active ? ` · ${active.description}` : ""}
            {hasAirport ? ` · centrado em ${placeLabel}` : ""}.
          </p>
        </div>
        <a
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-medium text-cyan-400 hover:text-cyan-300"
        >
          Abrir no Windy ↗
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {WINDY_OVERLAYS.map((item) => {
          const selected = item.id === overlay;
          return (
            <button
              key={item.id}
              type="button"
              title={item.description}
              onClick={() => setOverlay(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                selected
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              <WindyOverlayIcon id={item.id} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPressure((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            pressure
              ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
              : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
          title="Isóbaras de pressão"
        >
          <WindyIsobarsIcon />
          <span>Isóbaras</span>
        </button>
      </div>

      <div
        ref={mapWrapRef}
        className="relative isolate overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-lg shadow-slate-950/40 touch-none overscroll-none"
      >
        <iframe
          key={embedUrl}
          title={`Windy — ${active?.label ?? overlay} · ${placeLabel}`}
          src={embedUrl}
          className="block h-[min(70vh,720px)] w-full border-0 bg-slate-950"
          style={{ touchAction: "none" }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; geolocation"
        />
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Mapa por{" "}
        <a
          href="https://www.windy.com/"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 underline-offset-2 hover:text-cyan-400 hover:underline"
        >
          Windy.com
        </a>
        . Uso informativo — não substitui METAR, TAF nem briefing operacional oficial.
      </p>
    </section>
  );
}
