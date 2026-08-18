import { LAYER_EXTENTS } from "./layerExtents.js";

const GEOAISWEB_WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";
const UPSTREAM_TIMEOUT_MS = 18_000;

const WAC_WMS_LAYERS = [
  "ICA:WAC_2825_CABO_ORANGE",
  "ICA:WAC_2826_MONTE_RORAIMA",
  "ICA:WAC_2827_SERRA_PACARAIMA",
  "ICA:WAC_2892_PICO_DA_NEBLINA",
  "ICA:WAC_2893_BOA_VISTA",
  "ICA:WAC_2894_TUMUCUMAQUE",
  "ICA:WAC_2895_MACAPA",
  "ICA:WAC_2944_FORTALEZA",
  "ICA:WAC_2945_SAO_LUIS",
  "ICA:WAC_2946_BELEM",
  "ICA:WAC_2947_SANTAREM",
  "ICA:WAC_2948_MANAUS",
  "ICA:WAC_2949_SAO_GABRIEL_DA_CACHOEIRA",
  "ICA:WAC_3012_CRUZEIRO_DO_SUL",
  "ICA:WAC_3013_TABATINGA",
  "ICA:WAC_3014_HUMAITA",
  "ICA:WAC_3015_ITAITUBA",
  "ICA:WAC_3016_IMPERATRIZ",
  "ICA:WAC_3017_TERESINA",
  "ICA:WAC_3018_NATAL",
  "ICA:WAC_3019_FERNANDO_DE_NORONHA",
  "ICA:WAC_3066_RECIFE",
  "ICA:WAC_3067_PETROLINA",
  "ICA:WAC_3068_PORTO_NACIONAL",
  "ICA:WAC_3069_CACHIMBO",
  "ICA:WAC_3070_JI_PARANA",
  "ICA:WAC_3071_PORTO_VELHO",
  "ICA:WAC_3072_TARAUACA",
  "ICA:WAC_3137_PRINCIPE_DA_BEIRA",
  "ICA:WAC_3138_CUIABA",
  "ICA:WAC_3139_ARAGARCAS",
  "ICA:WAC_3140_BRASILIA",
  "ICA:WAC_3141_SALVADOR",
  "ICA:WAC_3189_BELO_HORIZONTE",
  "ICA:WAC_3190_GOIANIA",
  "ICA:WAC_3191_RONDONOPOLIS",
  "ICA:WAC_3192_CORUMBA",
  "ICA:WAC_3260_BELA_VISTA",
  "ICA:WAC_3261_CAMPO_GRANDE",
  "ICA:WAC_3262_SAO_PAULO",
  "ICA:WAC_3263_RIO_DE_JANEIRO",
  "ICA:WAC_3313_CURITIBA",
  "ICA:WAC_3314_FOZ_DO_IGUACU",
  "ICA:WAC_3383_URUGUAIANA",
  "ICA:WAC_3384_PORTO_ALEGRE",
  "ICA:WAC_3434_RIO_DA_PRATA",
];

const REA_CHART_WMS_LAYERS = [
  "ICA:CCV_REA_CY_CUIABA",
  "ICA:CCV_REA_PI-PARINTINS",
  "ICA:CCV_REA_WA_TABATINGA",
  "ICA:CCV_REA_WB_BELEM",
  "ICA:CCV_REA_WF_RECIFE",
  "ICA:CCV_REA_WG_CAMPO_GRANDE",
  "ICA:CCV_REA_WH_BELO_HORIZONTE",
  "ICA:CCV_REA_WJ1_RIO_DE_JANEIRO",
  "ICA:CCV_REA_WK_PORTO_SEGURO",
  "ICA:CCV_REA_WN2_MANAUS",
  "ICA:CCV_REA_WP_PORTO_ALEGRE",
  "ICA:CCV_REA_WR_BRASILIA",
  "ICA:CCV_REA_WS_SAO_LUIS",
  "ICA:CCV_REA_WX_SANTAREM",
  "ICA:CCV_REA_WZ_FORTALEZA",
  "ICA:CCV_REA_XF_FLORIANOPOLIS",
  "ICA:CCV_REA_XK_MACAPA",
  "ICA:CCV_REA_XN-ANAPOLIS",
  "ICA:CCV_REA_XP1_SAO_PAULO",
  "ICA:CCV_REA_XP2_SAO_PAULO",
  "ICA:CCV_REA_XR_VITORIA",
  "ICA:CCV_REA_XS_SALVADOR",
  "ICA:CCV_REA_XT_NATAL",
  "ICA:REA_CURITIBA",
];

const REH_CHART_WMS_LAYERS = [
  "ICA:CCV_REH_WH_BELO_HORIZONTE",
  "ICA:CCV_REH_WJ1_CABO_FRIO",
  "ICA:CCV_REH_WJ2_RIO_DE_JANEIRO",
  "ICA:CCV_REH_WJ3_RIO_DE_JANEIRO",
  "ICA:CCV_REH_XP1_SAO_JOSE_DOS_CAMPOS",
  "ICA:CCV_REH_XP1_SOROCABA",
  "ICA:CCV_REH_XP2_CAMPINAS",
  "ICA:CCV_REH_XP2_SAO_PAULO_1",
  "ICA:CCV_REH_XP2_SAO_PAULO_2",
];

const LAYERS_BY_SET = {
  wac: WAC_WMS_LAYERS,
  rea: REA_CHART_WMS_LAYERS,
  reh: REH_CHART_WMS_LAYERS,
};

const CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800, immutable";

function loadLayerExtents() {
  return LAYER_EXTENTS || {};
}

function readParam(query, name) {
  const direct = query[name];
  if (direct != null) return Array.isArray(direct) ? direct[0] : direct;
  const found = Object.keys(query).find((key) => key.toLowerCase() === name.toLowerCase());
  if (!found) return undefined;
  const value = query[found];
  return Array.isArray(value) ? value[0] : value;
}

function badRequest(res, message) {
  res.status(400).json({ error: message });
}

function parseNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} invalido`);
  return n;
}

function parsePositiveInt(value, label, max) {
  const n = Math.round(parseNumber(value, label));
  if (n < 1 || n > max) throw new Error(`${label} fora do limite`);
  return n;
}

function parseBboxParts(value) {
  const parts = String(value || "").split(",").map((v) => parseNumber(v, "bbox"));
  if (parts.length !== 4) throw new Error("bbox invalido");
  const [minX, minY, maxX, maxY] = parts;
  if (minX === maxX || minY === maxY) throw new Error("bbox vazio");
  return parts;
}

function formatBbox(parts) {
  return parts.map((n) => Number(n.toFixed(6))).join(",");
}

function normalizeCrs(value) {
  const crs = String(value || "EPSG:3857").toUpperCase();
  if (crs !== "EPSG:3857" && crs !== "EPSG:4326") throw new Error("srs/crs nao permitido");
  return crs;
}

function normalizeFormat(value) {
  const format = String(value || "image/png").toLowerCase();
  if (format !== "image/png") throw new Error("format nao permitido");
  return format;
}

/** Web Mercator meters → WGS84 degrees (approx for extent tests). */
function mercatorToLonLat(x, y) {
  const lon = (x / 20037508.342789244) * 180;
  const latRad = Math.atan(Math.sinh(y / 20037508.342789244 * Math.PI));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

function bboxToLonLat(parts, srs) {
  const [minX, minY, maxX, maxY] = parts;
  if (srs === "EPSG:4326") {
    // WMS 1.1.1 lon/lat order for EPSG:4326 in most GeoServer configs uses lon,lat in bbox
    return { minLon: minX, minLat: minY, maxLon: maxX, maxLat: maxY };
  }
  const sw = mercatorToLonLat(minX, minY);
  const ne = mercatorToLonLat(maxX, maxY);
  return {
    minLon: Math.min(sw.lon, ne.lon),
    minLat: Math.min(sw.lat, ne.lat),
    maxLon: Math.max(sw.lon, ne.lon),
    maxLat: Math.max(sw.lat, ne.lat),
  };
}

function intersects(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

/**
 * Keep only sheets whose LatLon extent intersects the request bbox.
 * Falls back to the full set if extents are missing.
 */
export function selectIntersectingLayers(layerSet, allLayers, bboxParts, srs) {
  const extents = loadLayerExtents();
  const request = bboxToLonLat(bboxParts, srs);
  // Pad ~0.15° so edge tiles still pull neighboring sheets.
  const pad = 0.15;
  const padded = {
    minLon: request.minLon - pad,
    minLat: request.minLat - pad,
    maxLon: request.maxLon + pad,
    maxLat: request.maxLat + pad,
  };
  const selected = allLayers.filter((name) => {
    const ext = extents[name];
    if (!ext) return true;
    return intersects(padded, ext);
  });
  if (selected.length === 0) {
    // Empty ocean / gap — still ask one nearby sheet set fallback to avoid blank tile errors.
    return allLayers.slice(0, Math.min(3, allLayers.length));
  }
  return selected;
}

export { bboxToLonLat, intersects, loadLayerExtents };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  try {
    const layerSet = String(readParam(req.query, "layerSet") || "").toLowerCase();
    const allLayers = LAYERS_BY_SET[layerSet];
    if (!allLayers) {
      badRequest(res, "layerSet deve ser wac, rea ou reh");
      return;
    }

    const width = parsePositiveInt(readParam(req.query, "width"), "width", 2048);
    const height = parsePositiveInt(readParam(req.query, "height"), "height", 2048);
    const bboxParts = parseBboxParts(readParam(req.query, "bbox"));
    const bbox = formatBbox(bboxParts);
    const srs = normalizeCrs(readParam(req.query, "srs") || readParam(req.query, "crs"));
    const format = normalizeFormat(readParam(req.query, "format"));
    const transparent = String(readParam(req.query, "transparent") ?? "true").toLowerCase() !== "false";

    const layers = selectIntersectingLayers(layerSet, allLayers, bboxParts, srs);

    const params = new URLSearchParams({
      service: "WMS",
      version: "1.1.1",
      request: "GetMap",
      layers: layers.join(","),
      styles: "",
      format,
      transparent: transparent ? "true" : "false",
      width: String(width),
      height: String(height),
      bbox,
      srs,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${GEOAISWEB_WMS_BASE}?${params.toString()}`, {
        headers: { "User-Agent": "garmin-flight-viewer/geoaisweb-cache" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.setHeader("X-GeoAISWEB-Proxy", layerSet);
    res.setHeader("X-GeoAISWEB-Sheets", String(layers.length));
    if (response.ok) {
      res.setHeader("Cache-Control", CACHE_CONTROL);
    } else {
      // Do not poison long-lived caches with upstream failures.
      res.setHeader("Cache-Control", "public, max-age=30");
    }
    res.send(body);
  } catch (err) {
    if (err?.name === "AbortError") {
      res.status(504);
      res.setHeader("Cache-Control", "no-store");
      res.json({ error: "GeoAISWEB timeout" });
      return;
    }
    badRequest(res, err instanceof Error ? err.message : "Parametro invalido");
  }
}
