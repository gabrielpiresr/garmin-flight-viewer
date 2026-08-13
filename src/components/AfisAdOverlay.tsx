import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { Aerodrome } from "../lib/aerodromesDb";
import { enrichAfisAdBatch, getCachedAfisAd } from "../lib/afisAdEnrichment";
import {
  getCachedAfisCoverage,
  loadAfisSuppressingAirspaces,
  markAfisCoverageFromFeatures,
} from "../lib/afisCoverage";
import {
  AFIS_AD_RADIUS_NM,
  AFIS_AD_UPPER_FL,
  AIRSPACE_LAYER_DEFS,
  type AirspaceInfo,
} from "../lib/airspaceLayersDb";
import { AIRSPACE_STYLE } from "./AirspaceLayersOverlay";

const FILL_PANE_Z = "450";
const SELECTED_PANE_Z = "460";
const NM_TO_M = 1852;
const AFIS_RADIUS_M = AFIS_AD_RADIUS_NM * NM_TO_M;
const EDGE_HIT_FRAC = 0.08;

const AFIS_DEF = AIRSPACE_LAYER_DEFS.find((d) => d.id === "afis")!;

type Props = {
  enabled: boolean;
  aerodromes: Aerodrome[];
  selectedKey: string | null;
  onSelect: (info: AirspaceInfo | null, key: string | null) => void;
};

type AfisTarget = {
  ad: Aerodrome;
  key: string;
  center: L.LatLng;
  frequency: string | null;
  callsign: string | null;
};

function ensurePane(map: L.Map, paneName: string, zIndex: string) {
  let pane = map.getPane(paneName);
  if (!pane) {
    pane = map.createPane(paneName);
    pane.style.zIndex = zIndex;
  } else {
    pane.style.zIndex = zIndex;
  }
  pane.style.pointerEvents = "none";
  return pane;
}

function afisKey(icao: string): string {
  return `AFIS:${icao}`;
}

function isClickNearCircleEdge(map: L.Map, latlng: L.LatLng, center: L.LatLng, radiusM: number): boolean {
  const distM = map.distance(center, latlng);
  const tolM = Math.max(
    map.distance(center, map.layerPointToLatLng(map.latLngToLayerPoint(center).add([AIRSPACE_STYLE.edgeHitPx, 0]))),
    radiusM * EDGE_HIT_FRAC,
  );
  return Math.abs(distM - radiusM) <= tolM;
}

function edgeDistM(map: L.Map, latlng: L.LatLng, center: L.LatLng, radiusM: number): number {
  return Math.abs(map.distance(center, latlng) - radiusM);
}

function baseInfo(
  ad: Aerodrome,
  frequency: string | null = null,
  callsign: string | null = null,
): AirspaceInfo {
  const radioName = callsign ? `AFIS ${callsign}` : `AFIS ${ad.icao}`;
  return {
    type: "AFIS",
    ident: ad.icao,
    name: radioName,
    fir: null,
    upper: `FL${String(AFIS_AD_UPPER_FL).padStart(3, "0")}`,
    lower: "Superfície",
    workHours: null,
    airspaceClass: null,
    remarks: `AFIS / Rádio — raio ${AFIS_AD_RADIUS_NM} NM · SFC–FL${AFIS_AD_UPPER_FL}. Gerado a partir da frequência publicada no ROTAER (sem FIZ no GeoAISWEB).`,
    locality: [ad.municipality, ad.uf].filter(Boolean).join(" / ") || null,
    frequency: frequency
      ? `RÁDIO${callsign ? ` ${callsign}` : ""}: ${frequency} · EMERG 121.500 MHz`
      : "EMERG 121.500 MHz",
    color: AFIS_DEF.color,
  };
}

/**
 * Círculos AFIS (27 NM, SFC–FL145) em aeródromos com Rádio/AFIS no ROTAER
 * que NÃO estão dentro de FIZ / CTR / TMA (ex.: SBDO sim; SBCA não — já na FIZ Cascavel).
 */
export function AfisAdOverlay({ enabled, aerodromes, selectedKey, onSelect }: Props) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const targetsRef = useRef<AfisTarget[]>([]);
  const selectedKeyRef = useRef(selectedKey);
  const onSelectRef = useRef(onSelect);
  const aerodromesRef = useRef(aerodromes);
  const enabledRef = useRef(enabled);
  const redrawTimer = useRef<number | null>(null);
  const enrichTimer = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const enrichTickRef = useRef(0);
  const nearEdgeRef = useRef(false);

  selectedKeyRef.current = selectedKey;
  onSelectRef.current = onSelect;
  aerodromesRef.current = aerodromes;
  enabledRef.current = enabled;

  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
    try {
      if (interactingRef.current) return;
      if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
      const group = groupRef.current;
      group.clearLayers();
      targetsRef.current = [];

      if (!enabledRef.current) return;

      ensurePane(map, "airspace-fill", FILL_PANE_Z);
      ensurePane(map, "airspace-selected", SELECTED_PANE_Z);
      if (!canvasRendererRef.current) {
        canvasRendererRef.current = L.canvas({
          padding: 0.5,
          pane: "airspace-fill",
          tolerance: AIRSPACE_STYLE.edgeHitPx,
        });
      }

      const bounds = map.getBounds().pad(0.2);
      const zoom = map.getZoom();
      const maxAds = zoom >= 9 ? 100 : zoom >= 7 ? 50 : 20;
      const candidates = aerodromesRef.current
        .filter((ad) => {
          const lat = ad.latitudeGeoPoint;
          const lng = ad.longitudeGeoPoint;
          if (lat == null || lng == null || !ad.icao) return false;
          return bounds.contains(L.latLng(lat, lng));
        })
        .slice(0, maxAds);

      const selected = selectedKeyRef.current;
      const renderer = canvasRendererRef.current;
      const color = AFIS_DEF.color;
      const nextTargets: AfisTarget[] = [];

      for (const ad of candidates) {
        const cached = getCachedAfisAd(ad.icao);
        if (!cached?.hasAfisRadio) continue;
        // Só plota após confirmar que NÃO está em FIZ/CTR/TMA.
        if (getCachedAfisCoverage(ad.icao) !== false) continue;

        const lat = ad.latitudeGeoPoint!;
        const lng = ad.longitudeGeoPoint!;
        const center = L.latLng(lat, lng);
        const key = afisKey(ad.icao);
        const isSelected = selected === key;
        nextTargets.push({
          ad,
          key,
          center,
          frequency: cached.frequency,
          callsign: cached.callsign,
        });

        if (isSelected) {
          L.circle(center, {
            radius: AFIS_RADIUS_M,
            pane: "airspace-selected",
            renderer,
            color,
            weight: 0,
            opacity: 0,
            fillColor: color,
            fill: true,
            fillOpacity: AIRSPACE_STYLE.fillOpacitySelected,
            interactive: false,
          }).addTo(group);
        }

        L.circle(center, {
          radius: AFIS_RADIUS_M,
          pane: isSelected ? "airspace-selected" : "airspace-fill",
          renderer,
          color,
          weight: isSelected ? AIRSPACE_STYLE.weightSelected : AIRSPACE_STYLE.weight,
          opacity: AIRSPACE_STYLE.strokeOpacity,
          fillColor: color,
          fill: false,
          fillOpacity: 0,
          interactive: false,
        }).addTo(group);
      }
      targetsRef.current = nextTargets;
    } catch (err) {
      console.warn("[AfisAdOverlay] falha ao desenhar", err);
    }
  };

  const scheduleRedraw = (delay = 80) => {
    if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => {
      redrawTimer.current = null;
      redrawRef.current();
    }, delay);
  };

  const scheduleEnrichRef = useRef(() => {});
  scheduleEnrichRef.current = () => {
    if (enrichTimer.current != null) window.clearTimeout(enrichTimer.current);
    enrichTimer.current = window.setTimeout(() => {
      enrichTimer.current = null;
      if (!enabledRef.current) return;
      const bounds = map.getBounds().pad(0.25);
      const zoom = map.getZoom();
      const maxAds = zoom >= 9 ? 100 : zoom >= 7 ? 50 : 20;
      const visible: Array<{ icao: string; lat: number; lng: number }> = [];
      const icaosNeedRadio: string[] = [];
      for (const ad of aerodromesRef.current) {
        const lat = ad.latitudeGeoPoint;
        const lng = ad.longitudeGeoPoint;
        if (lat == null || lng == null || !ad.icao) continue;
        if (!bounds.contains(L.latLng(lat, lng))) continue;
        visible.push({ icao: ad.icao, lat, lng });
        const cached = getCachedAfisAd(ad.icao);
        if (!cached || Date.now() - cached.updatedAt >= 7 * 24 * 60 * 60 * 1000) {
          icaosNeedRadio.push(ad.icao);
        }
        if (visible.length >= maxAds) break;
      }

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const bbox = {
        minLng: sw.lng,
        minLat: sw.lat,
        maxLng: ne.lng,
        maxLat: ne.lat,
      };

      const tick = ++enrichTickRef.current;
      void (async () => {
        try {
          const [features] = await Promise.all([
            loadAfisSuppressingAirspaces(bbox),
            icaosNeedRadio.length
              ? enrichAfisAdBatch(icaosNeedRadio, {
                  concurrency: 3,
                  onProgress: () => {
                    if (tick === enrichTickRef.current) scheduleRedraw(40);
                  },
                })
              : Promise.resolve(),
          ]);
          if (tick !== enrichTickRef.current) return;
          markAfisCoverageFromFeatures(visible, features);
        } catch (err) {
          console.warn("[AfisAdOverlay] falha ao checar FIZ/CTR/TMA", err);
        }
        if (tick === enrichTickRef.current) scheduleRedraw(0);
      })();
    }, 280);
  };

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    scheduleEnrichRef.current();
    scheduleRedraw(0);
    return () => {
      if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
      if (enrichTimer.current != null) window.clearTimeout(enrichTimer.current);
      if (nearEdgeRef.current) {
        map.getContainer().style.cursor = "";
        nearEdgeRef.current = false;
      }
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
      canvasRendererRef.current = null;
      targetsRef.current = [];
    };
  }, [map]);

  useEffect(() => {
    if (enabled) scheduleEnrichRef.current();
    scheduleRedraw(0);
  }, [enabled, aerodromes, selectedKey]);

  useMapEvents({
    zoomstart() {
      interactingRef.current = true;
    },
    movestart() {
      interactingRef.current = true;
    },
    moveend() {
      interactingRef.current = false;
      if (enabledRef.current) scheduleEnrichRef.current();
      else scheduleRedraw(120);
    },
    zoomend() {
      interactingRef.current = false;
      if (enabledRef.current) scheduleEnrichRef.current();
      else scheduleRedraw(120);
    },
    mousemove(e) {
      if (!enabledRef.current || !targetsRef.current.length) {
        if (nearEdgeRef.current) {
          nearEdgeRef.current = false;
          map.getContainer().style.cursor = "";
        }
        return;
      }
      let near = false;
      for (const t of targetsRef.current) {
        if (isClickNearCircleEdge(map, e.latlng, t.center, AFIS_RADIUS_M)) {
          near = true;
          break;
        }
      }
      if (near === nearEdgeRef.current) return;
      nearEdgeRef.current = near;
      map.getContainer().style.cursor = near ? "pointer" : "";
    },
    preclick(e) {
      if (!enabledRef.current || !targetsRef.current.length) return;
      let best: AfisTarget | null = null;
      let bestDist = Infinity;
      for (const t of targetsRef.current) {
        if (!isClickNearCircleEdge(map, e.latlng, t.center, AFIS_RADIUS_M)) continue;
        const d = edgeDistM(map, e.latlng, t.center, AFIS_RADIUS_M);
        if (d < bestDist) {
          bestDist = d;
          best = t;
        }
      }
      if (!best) return;
      const oe = e.originalEvent as (MouseEvent & { _airspaceEdge?: boolean }) | undefined;
      if (oe) oe._airspaceEdge = true;
      L.DomEvent.stopPropagation(e);
      if (selectedKeyRef.current === best.key) {
        onSelectRef.current(null, null);
        return;
      }
      onSelectRef.current(baseInfo(best.ad, best.frequency, best.callsign), best.key);
    },
  });

  return null;
}
