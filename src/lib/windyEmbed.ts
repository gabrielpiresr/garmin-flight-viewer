/** Windy.com public embed helpers (no API key required for iframe embed). */

export type WindyOverlayId =
  | "clouds"
  | "satellite"
  | "rain"
  | "rainAccu"
  | "radar"
  | "thunder"
  | "wind"
  | "gust"
  | "temp"
  | "dewpoint"
  | "rh"
  | "visibility"
  | "fog"
  | "cape"
  | "pressure";

export type WindyOverlay = {
  id: WindyOverlayId;
  label: string;
  description: string;
};

/** Default map center: roughly geographic center of Brazil. */
export const WINDY_DEFAULT_CENTER = {
  lat: -14.235,
  lon: -51.9253,
  zoom: 5,
} as const;

/** Zoom when centering on a selected aerodrome. */
export const WINDY_AIRPORT_ZOOM = 10;

export const WINDY_OVERLAYS: readonly WindyOverlay[] = [
  { id: "clouds", label: "Nuvens", description: "Cobertura de nuvens (modelo)" },
  { id: "satellite", label: "Satélite", description: "Imagem satélite (nuvens reais)" },
  { id: "rain", label: "Chuva", description: "Precipitação prevista" },
  { id: "rainAccu", label: "Acum. chuva", description: "Chuva acumulada" },
  { id: "radar", label: "Radar", description: "Radar de precipitação" },
  { id: "thunder", label: "Raios", description: "Atividade de trovoadas" },
  { id: "wind", label: "Vento", description: "Vento em superfície" },
  { id: "gust", label: "Rajadas", description: "Rajadas de vento" },
  { id: "temp", label: "Temp.", description: "Temperatura do ar" },
  { id: "dewpoint", label: "Ponto orvalho", description: "Temperatura do ponto de orvalho" },
  { id: "rh", label: "Umidade", description: "Umidade relativa" },
  { id: "visibility", label: "Visibilidade", description: "Visibilidade prevista" },
  { id: "fog", label: "Névoa", description: "Névoa / nevoeiro" },
  { id: "cape", label: "CAPE", description: "Instabilidade convectiva (CAPE)" },
  { id: "pressure", label: "Pressão", description: "Pressão atmosférica" },
] as const;

export type WindyEmbedParams = {
  overlay?: WindyOverlayId;
  lat?: number;
  lon?: number;
  zoom?: number;
  /** Show pressure isolines */
  pressure?: boolean;
  /** Drop a marker on the map center */
  marker?: boolean;
  /** Show Windy promotional/message strip (default true). */
  message?: boolean;
};

export function buildWindyEmbedUrl(params: WindyEmbedParams = {}): string {
  const lat = params.lat ?? WINDY_DEFAULT_CENTER.lat;
  const lon = params.lon ?? WINDY_DEFAULT_CENTER.lon;
  const zoom = params.zoom ?? WINDY_DEFAULT_CENTER.zoom;
  const overlay = params.overlay ?? "clouds";

  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    detailLat: String(lat),
    detailLon: String(lon),
    zoom: String(zoom),
    level: "surface",
    overlay,
    product: "ecmwf",
    menu: "",
    message: params.message === false ? "" : "true",
    marker: params.marker ? "true" : "",
    calendar: "now",
    pressure: params.pressure ? "true" : "",
    type: "map",
    location: "coordinates",
    detail: "",
    metricWind: "kt",
    metricTemp: "°C",
    radarRange: "-1",
  });

  return `https://embed.windy.com/embed2.html?${query.toString()}`;
}

export function buildWindySiteUrl(params: WindyEmbedParams = {}): string {
  const lat = params.lat ?? WINDY_DEFAULT_CENTER.lat;
  const lon = params.lon ?? WINDY_DEFAULT_CENTER.lon;
  const zoom = params.zoom ?? WINDY_DEFAULT_CENTER.zoom;
  const overlay = params.overlay ?? "clouds";
  return `https://www.windy.com/${overlay}?${lat},${lon},${zoom}`;
}
