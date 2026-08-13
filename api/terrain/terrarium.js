const TILE_HOST = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

function readParam(query, name) {
  const direct = query[name];
  if (direct != null) return Array.isArray(direct) ? direct[0] : direct;
  const found = Object.keys(query).find((key) => key.toLowerCase() === name.toLowerCase());
  if (!found) return undefined;
  const value = query[found];
  return Array.isArray(value) ? value[0] : value;
}

function parseTileIndex(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) && n !== Math.trunc(n)) throw new Error(`${label} invalido`);
  const i = Math.trunc(n);
  if (!Number.isFinite(i) || i < 0) throw new Error(`${label} invalido`);
  return i;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  try {
    const z = parseTileIndex(readParam(req.query, "z"), "z");
    const x = parseTileIndex(readParam(req.query, "x"), "x");
    const y = parseTileIndex(readParam(req.query, "y"), "y");
    if (z > 15) throw new Error("z invalido");
    const n = 2 ** z;
    if (x >= n || y >= n) throw new Error("tile fora do zoom");

    const response = await fetch(`${TILE_HOST}/${z}/${x}/${y}.png`);
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({ error: "Falha ao obter tile de terreno." });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.status(200).send(buffer);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Pedido invalido" });
  }
}
