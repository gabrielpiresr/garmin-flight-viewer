const GEOAISWEB_WFS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";

const LAYER_BY_KIND = {
  rea: "ICA:CV_REA_BR_COMPLETO",
  reh: "ICA:CV_REH_BR_COMPLETO",
  fir: "ICA:fir",
  fis: "ICA:fis",
  cta: "ICA:CTA",
  tma: "ICA:TMA",
  ctr: "ICA:CTR",
  atz: "ICA:ATZ",
  fiz: "ICA:fiz",
  /** Legacy: AFIS no mapa é gerada no cliente (Rádio ROTAER, 27 NM). Mantido por compat. */
  afis: "ICA:fiz",
  eac_p: "ICA:eac_p",
  eac_r: "ICA:eac_r",
  eac_d: "ICA:eac_d",
};

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function readParam(query, name) {
  const direct = query[name];
  if (direct != null) return Array.isArray(direct) ? direct[0] : direct;
  const found = Object.keys(query).find((key) => key.toLowerCase() === name.toLowerCase());
  if (!found) return undefined;
  const value = query[found];
  return Array.isArray(value) ? value[0] : value;
}

function parseNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} invalido`);
  return n;
}

function parseBbox(query) {
  const raw = readParam(query, "bbox");
  if (raw) {
    const parts = String(raw).split(",").map((v) => parseNumber(v, "bbox"));
    if (parts.length !== 4) throw new Error("bbox invalido");
    return parts.map((n) => Number(n.toFixed(6))).join(",");
  }

  const minLng = parseNumber(readParam(query, "minLng"), "minLng");
  const minLat = parseNumber(readParam(query, "minLat"), "minLat");
  const maxLng = parseNumber(readParam(query, "maxLng"), "maxLng");
  const maxLat = parseNumber(readParam(query, "maxLat"), "maxLat");
  if (minLng >= maxLng || minLat >= maxLat) throw new Error("bbox vazio");
  return [minLng, minLat, maxLng, maxLat].map((n) => Number(n.toFixed(6))).join(",");
}

function parseMaxFeatures(value) {
  const n = Math.round(Number(value ?? 500));
  if (!Number.isFinite(n)) return 500;
  return String(Math.max(1, Math.min(1000, n)));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  try {
    const kind = String(readParam(req.query, "kind") || "").toLowerCase();
    const typeName = LAYER_BY_KIND[kind];
    if (!typeName) {
      res.status(400).json({
        error:
          "kind deve ser rea, reh, fir, fis, cta, tma, ctr, atz, fiz, afis, eac_p, eac_r ou eac_d",
      });
      return;
    }

    const bbox = parseBbox(req.query);
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName,
      outputFormat: "application/json",
      bbox,
      maxFeatures: parseMaxFeatures(readParam(req.query, "maxFeatures")),
    });

    const response = await fetch(`${GEOAISWEB_WFS_BASE}?${params.toString()}`, {
      headers: { "User-Agent": "garmin-flight-viewer/geoaisweb-cache" },
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    if (response.ok) {
      res.setHeader("Cache-Control", CACHE_CONTROL);
      res.setHeader("X-GeoAISWEB-Proxy", kind);
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    res.send(text);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Parametro invalido" });
  }
}
