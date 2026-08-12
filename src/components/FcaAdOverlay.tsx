import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { Aerodrome } from "../lib/aerodromesDb";
import { lookupAiswebIcao } from "../lib/aiswebDb";
import {
  AIRSPACE_LAYER_DEFS,
  FCA_AD_DEFAULT_FREQ_MHZ,
  FCA_AD_RADIUS_NM,
  type AirspaceInfo,
} from "../lib/airspaceLayersDb";
import { AIRSPACE_STYLE } from "./AirspaceLayersOverlay";

const FILL_PANE_Z = "700";
const SELECTED_PANE_Z = "710";
const NM_TO_M = 1852;
const FCA_RADIUS_M = FCA_AD_RADIUS_NM * NM_TO_M;
/** Distância relativa ao raio para considerar clique na borda (px + fração). */
const EDGE_HIT_FRAC = 0.08;

const FCA_DEF = AIRSPACE_LAYER_DEFS.find((d) => d.id === "fca_ad")!;

type Props = {
  enabled: boolean;
  aerodromes: Aerodrome[];
  selectedKey: string | null;
  onSelect: (info: AirspaceInfo | null, key: string | null) => void;
};

function ensurePane(map: L.Map, paneName: string, zIndex: string) {
  let pane = map.getPane(paneName);
  if (!pane) {
    pane = map.createPane(paneName);
    pane.style.zIndex = zIndex;
  } else {
    pane.style.zIndex = zIndex;
  }
  return pane;
}

function fcaKey(icao: string): string {
  return `FCA_AD:${icao}`;
}

function isClickNearCircleEdge(map: L.Map, latlng: L.LatLng, center: L.LatLng, radiusM: number): boolean {
  const distM = map.distance(center, latlng);
  const tolM = Math.max(map.distance(center, map.layerPointToLatLng(map.latLngToLayerPoint(center).add([AIRSPACE_STYLE.edgeHitPx, 0]))), radiusM * EDGE_HIT_FRAC);
  return Math.abs(distM - radiusM) <= tolM;
}

function pickFcaMhz(frequencies: Array<{ service: string; callsign: string | null; frequenciesMhz: string[] }> | undefined): string {
  const list = frequencies || [];
  const fca = list.find(
    (f) => /FCA/i.test(f.service) || /FCA/i.test(f.callsign || "") || /UNICOM|A\/A|AIR.?AIR/i.test(f.service),
  );
  if (fca?.frequenciesMhz?.length) return `${fca.frequenciesMhz.join(" · ")} MHz`;
  const anyRadio = list.find((f) => f.frequenciesMhz?.length);
  if (anyRadio) return `${anyRadio.service} ${anyRadio.frequenciesMhz.join(" · ")} MHz`;
  return `${FCA_AD_DEFAULT_FREQ_MHZ} MHz`;
}

function baseInfo(ad: Aerodrome, frequency: string | null = null): AirspaceInfo {
  return {
    type: "FCA_AD",
    ident: ad.icao,
    name: ad.name || ad.icao,
    fir: null,
    upper: null,
    lower: "Superfície",
    workHours: null,
    airspaceClass: null,
    remarks: `Raio de ${FCA_AD_RADIUS_NM} NM — Frequência para Coordenação entre Aeronaves (FCA) nas proximidades do aeródromo.`,
    locality: [ad.municipality, ad.uf].filter(Boolean).join(" / ") || null,
    frequency: frequency ?? `${FCA_AD_DEFAULT_FREQ_MHZ} MHz`,
    color: FCA_DEF.color,
  };
}

/**
 * Círculos de 10 NM em torno dos aeródromos (FCA AD), no estilo SNPA/NexAtlas.
 * Clique na borda abre o painel com frequência (ROTAER quando disponível).
 */
export function FcaAdOverlay({ enabled, aerodromes, selectedKey, onSelect }: Props) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selectedKeyRef = useRef(selectedKey);
  const onSelectRef = useRef(onSelect);
  const aerodromesRef = useRef(aerodromes);
  const enabledRef = useRef(enabled);
  const redrawTimer = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const freqCacheRef = useRef<Map<string, string>>(new Map());
  const lookupInflight = useRef<Set<string>>(new Set());

  selectedKeyRef.current = selectedKey;
  onSelectRef.current = onSelect;
  aerodromesRef.current = aerodromes;
  enabledRef.current = enabled;

  const enrichFrequency = (ad: Aerodrome, key: string) => {
    const icao = ad.icao?.toUpperCase();
    if (!icao || lookupInflight.current.has(icao)) return;
    const cached = freqCacheRef.current.get(icao);
    if (cached) {
      onSelectRef.current(baseInfo(ad, cached), key);
      return;
    }
    lookupInflight.current.add(icao);
    void lookupAiswebIcao(icao)
      .then((bundle) => {
        const mhz = pickFcaMhz(bundle.rotaer?.frequencies);
        freqCacheRef.current.set(icao, mhz);
        if (selectedKeyRef.current === key) {
          onSelectRef.current(baseInfo(ad, mhz), key);
        }
      })
      .catch(() => {
        /* mantém 123.45 padrão */
      })
      .finally(() => {
        lookupInflight.current.delete(icao);
      });
  };

  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
    try {
      if (interactingRef.current) return;
      if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
      const group = groupRef.current;
      group.clearLayers();

      if (!enabledRef.current) return;

      ensurePane(map, "airspace-fill", FILL_PANE_Z);
      ensurePane(map, "airspace-selected", SELECTED_PANE_Z);
      if (!canvasRendererRef.current) {
        canvasRendererRef.current = L.canvas({ padding: 0.5 });
      }

      const bounds = map.getBounds().pad(0.15);
      const zoom = map.getZoom();
      // Em zoom baixo, limitar densidade para não saturar o mapa.
      const maxAds = zoom >= 9 ? 120 : zoom >= 7 ? 60 : 25;
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
      const color = FCA_DEF.color;

      for (const ad of candidates) {
        const lat = ad.latitudeGeoPoint!;
        const lng = ad.longitudeGeoPoint!;
        const center = L.latLng(lat, lng);
        const key = fcaKey(ad.icao);
        const isSelected = selected === key;
        const circle = L.circle(center, {
          radius: FCA_RADIUS_M,
          pane: isSelected ? "airspace-selected" : "airspace-fill",
          renderer,
          color,
          weight: isSelected ? AIRSPACE_STYLE.weightSelected : AIRSPACE_STYLE.weight,
          opacity: AIRSPACE_STYLE.strokeOpacity,
          fillColor: color,
          fillOpacity: isSelected ? AIRSPACE_STYLE.fillOpacitySelected : AIRSPACE_STYLE.fillOpacity,
          interactive: true,
        });
        circle.on("click", (e) => {
          if (!isClickNearCircleEdge(map, e.latlng, center, FCA_RADIUS_M)) return;
          L.DomEvent.stopPropagation(e);
          if (selectedKeyRef.current === key) {
            onSelectRef.current(null, null);
            return;
          }
          const info = baseInfo(ad, freqCacheRef.current.get(ad.icao.toUpperCase()) ?? null);
          onSelectRef.current(info, key);
          enrichFrequency(ad, key);
        });
        circle.addTo(group);
      }
    } catch (err) {
      console.warn("[FcaAdOverlay] falha ao desenhar", err);
    }
  };

  const scheduleRedraw = (delay = 80) => {
    if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => {
      redrawTimer.current = null;
      redrawRef.current();
    }, delay);
  };

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    scheduleRedraw(0);
    return () => {
      if (redrawTimer.current != null) window.clearTimeout(redrawTimer.current);
      groupRef.current?.removeFrom(map);
      groupRef.current = null;
      canvasRendererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
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
      scheduleRedraw(120);
    },
    zoomend() {
      interactingRef.current = false;
      scheduleRedraw(120);
    },
  });

  return null;
}
