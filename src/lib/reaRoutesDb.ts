/** GeoAISWEB CV_REA / CV_REH — rotas especiais VFR (AIC). */

export type ReaRouteKind = "rea" | "reh";

/**
 * Campos do WFS. O GeoAISWEB nomeia os extremos do eixo como `fixo_*`
 * (não `ponto_*`).
 */
export type ReaRouteProps = {
  id?: number;
  tipo?: string | null;
  nome?: string | null;
  trecho?: number | null;
  classe?: string | null;
  fca?: string | null;
  ats?: string | null;
  semi_largura?: number | null;
  rumoa_to_b?: number | null;
  rumob_to_a?: number | null;
  altmax?: number | null;
  altmin?: number | null;
  altcomp?: number | null;
  altmaxa_to_b?: number | null;
  altmina_to_b?: number | null;
  altmaxb_to_a?: number | null;
  altminb_to_a?: number | null;
  altcompa_to_b?: number | null;
  altcompb_to_a?: number | null;
  fixo_a_lat?: number | null;
  fixo_a_lon?: number | null;
  fixo_b_lat?: number | null;
  fixo_b_lon?: number | null;
  fixo_a_nome?: string | null;
  fixo_b_nome?: string | null;
  /** Aliases caso algum layer use ponto_*. */
  ponto_a_lat?: number | null;
  ponto_a_lon?: number | null;
  ponto_b_lat?: number | null;
  ponto_b_lon?: number | null;
  ponto_a_nome?: string | null;
  ponto_b_nome?: string | null;
  carta_nome?: string | null;
  identificador?: string | null;
  eixokey?: string | null;
};

export type ReaRouteFeature = {
  type: "Feature";
  id?: string | number;
  properties: ReaRouteProps;
  geometry: {
    type: string;
    coordinates?: unknown;
  } | null;
};

export type ReaRouteCollection = {
  type: "FeatureCollection";
  features: ReaRouteFeature[];
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";

const LAYER_BY_KIND: Record<ReaRouteKind, { wfs: string; fallback: string }> = {
  rea: { wfs: "ICA:CV_REA_BR_COMPLETO", fallback: "/geo/cv-rea-br.json" },
  reh: { wfs: "ICA:CV_REH_BR_COMPLETO", fallback: "/geo/cv-reh-br.json" },
};

const cache: Partial<Record<ReaRouteKind, ReaRouteCollection>> = {};
const inflight: Partial<Record<ReaRouteKind, Promise<ReaRouteCollection>>> = {};

function asCollection(data: unknown): ReaRouteCollection {
  const raw = data as ReaRouteCollection;
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return { type: "FeatureCollection", features };
}

async function fetchFallback(path: string): Promise<ReaRouteCollection> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Fallback REA falhou (${response.status})`);
  return asCollection(await response.json());
}

async function fetchWfs(baseUrl: string, typeName: string): Promise<ReaRouteCollection> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName,
      outputFormat: "application/json",
    });
    const response = await fetch(`${baseUrl}?${params.toString()}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`WFS ${typeName} falhou (${response.status})`);
    return asCollection(await response.json());
  } finally {
    window.clearTimeout(timer);
  }
}

/** Carrega REA/REH. Prefere snapshot local (rápido/confiável); no dev tenta WFS em background. */
export async function loadReaRoutes(kind: ReaRouteKind): Promise<ReaRouteCollection> {
  const hit = cache[kind];
  if (hit) return hit;
  const pending = inflight[kind];
  if (pending) return pending;

  const spec = LAYER_BY_KIND[kind];
  const promise = (async () => {
    // Snapshot local primeiro — evita tela preta/travamento por CORS/timeout no GeoAISWEB.
    try {
      const fallback = await fetchFallback(spec.fallback);
      if (fallback.features.length > 0) {
        cache[kind] = fallback;
        if (import.meta.env.DEV) {
          void fetchWfs(DEV_PROXY_BASE, spec.wfs)
            .then((live) => {
              if (live.features.length > 0) cache[kind] = live;
            })
            .catch(() => {});
        }
        return fallback;
      }
    } catch {
      // continue to live
    }

    const bases = import.meta.env.DEV ? [DEV_PROXY_BASE, GEOAISWEB_WFS] : [GEOAISWEB_WFS];
    for (const base of bases) {
      try {
        const collection = await fetchWfs(base, spec.wfs);
        if (collection.features.length > 0) {
          cache[kind] = collection;
          return collection;
        }
      } catch {
        // try next
      }
    }
    throw new Error(`Não foi possível carregar ${kind.toUpperCase()}.`);
  })();

  inflight[kind] = promise;
  try {
    return await promise;
  } finally {
    delete inflight[kind];
  }
}

export function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function endpointA(props: ReaRouteProps): {
  lat: number | null;
  lon: number | null;
  name: string;
} {
  return {
    lat: numOrNull(props.fixo_a_lat ?? props.ponto_a_lat),
    lon: numOrNull(props.fixo_a_lon ?? props.ponto_a_lon),
    name: String(props.fixo_a_nome ?? props.ponto_a_nome ?? "").trim(),
  };
}

export function endpointB(props: ReaRouteProps): {
  lat: number | null;
  lon: number | null;
  name: string;
} {
  return {
    lat: numOrNull(props.fixo_b_lat ?? props.ponto_b_lat),
    lon: numOrNull(props.fixo_b_lon ?? props.ponto_b_lon),
    name: String(props.fixo_b_nome ?? props.ponto_b_nome ?? "").trim(),
  };
}

/** Altitudes do trecho no formato da carta (máx / mín). */
export function resolveReaAltitudes(props: ReaRouteProps): { max: number | null; min: number | null } {
  const max =
    numOrNull(props.altmax) ??
    numOrNull(props.altmaxa_to_b) ??
    numOrNull(props.altmaxb_to_a) ??
    numOrNull(props.altcompa_to_b) ??
    numOrNull(props.altcomp);
  const min =
    numOrNull(props.altmin) ??
    numOrNull(props.altmina_to_b) ??
    numOrNull(props.altminb_to_a) ??
    numOrNull(props.altcompb_to_a) ??
    (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
  return { max, min };
}

export function formatReaHeading(deg: number | null | undefined): string | null {
  const n = numOrNull(deg);
  if (n == null) return null;
  return `${String(Math.round(((n % 360) + 360) % 360)).padStart(3, "0")}°`;
}

export function corridorDisplayName(nome: string | null | undefined): string {
  return String(nome || "").trim().toUpperCase();
}

export function pointKey(lat: number, lon: number, name: string): string {
  return `${name.trim().toUpperCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

export type ReaFixPoint = { lat: number; lon: number; name: string };

/** Pontos nomeados únicos dos eixos REA/REH (para alinhar rota FPL truncada). */
export function collectReaFixPoints(features: ReaRouteFeature[]): ReaFixPoint[] {
  const seen = new Set<string>();
  const out: ReaFixPoint[] = [];
  for (const feature of features) {
    const props = feature.properties || {};
    for (const end of [endpointA(props), endpointB(props)]) {
      if (end.lat == null || end.lon == null || !end.name) continue;
      const key = pointKey(end.lat, end.lon, end.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lat: end.lat, lon: end.lon, name: end.name });
    }
  }
  return out;
}

