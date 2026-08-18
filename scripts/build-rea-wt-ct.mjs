/**
 * Digitize TMA Curitiba REA from AIC N 74/24 Anexo A (republica AIC N 34/23).
 * GeoAISWEB has the WT raster (ICA:REA_CURITIBA) but no CV_REA vector layer.
 */
import fs from "fs";
import path from "path";

const EARTH_RADIUS_M = 6_371_008.8;
const SEMI_LARGURA_M = 2778;
const CARTA = "WT-CURITIBA";
const AIC = "AIC N74/24";
const EFETIVACAO = "2024-11-28T00:00:00Z";

function dms(d, m, s, hemi) {
  const v = Number(d) + Number(m) / 60 + Number(s) / 3600;
  return hemi === "S" || hemi === "W" ? -v : v;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function bearingDeg(from, to) {
  const toR = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toR(to.lon - from.lon)) * Math.cos(toR(to.lat));
  const x =
    Math.cos(toR(from.lat)) * Math.sin(toR(to.lat)) -
    Math.sin(toR(from.lat)) * Math.cos(toR(to.lat)) * Math.cos(toR(to.lon - from.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destinationPoint(lat, lng, bearing, distanceM) {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

function corridorPolygon(a, b, halfWidthM) {
  const brg = bearingDeg(a, b);
  const aL = destinationPoint(a.lat, a.lon, brg - 90, halfWidthM);
  const aR = destinationPoint(a.lat, a.lon, brg + 90, halfWidthM);
  const bL = destinationPoint(b.lat, b.lon, brg - 90, halfWidthM);
  const bR = destinationPoint(b.lat, b.lon, brg + 90, halfWidthM);
  const ring = [
    [round6(aL.lng), round6(aL.lat)],
    [round6(bL.lng), round6(bL.lat)],
    [round6(bR.lng), round6(bR.lat)],
    [round6(aR.lng), round6(aR.lat)],
    [round6(aL.lng), round6(aL.lat)],
  ];
  return {
    type: "MultiPolygon",
    coordinates: [[ring]],
  };
}

function bboxOf(geom) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of geom.coordinates[0][0]) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** AIC N 74/24 Anexo A visual references (DMS). */
const P = {
  "PORTO AMAZONAS": { lat: dms(25, 32, 47, "S"), lon: dms(49, 53, 45, "W") },
  CONTENDA: { lat: dms(25, 40, 50, "S"), lon: dms(49, 31, 51, "W") },
  "VOÇOROCA": { lat: dms(25, 50, 50, "S"), lon: dms(49, 2, 51, "W") },
  SANEPAR: { lat: dms(25, 33, 48, "S"), lon: dms(49, 14, 44, "W") },
  "CAMPO MAGRO": { lat: dms(25, 21, 56, "S"), lon: dms(49, 26, 51, "W") },
  "RIO BRANCO": { lat: dms(25, 13, 2, "S"), lon: dms(49, 20, 51, "W") },
  TUNAS: { lat: dms(24, 58, 20, "S"), lon: dms(49, 4, 51, "W") },
  COLOMBO: { lat: dms(25, 17, 32, "S"), lon: dms(49, 13, 22, "W") },
  "TAMANDARÉ": { lat: dms(25, 19, 14, "S"), lon: dms(49, 17, 58, "W") },
  BARIGUI: { lat: dms(25, 25, 42, "S"), lon: dms(49, 18, 46, "W") },
  JAZIDA: { lat: dms(25, 4, 23, "S"), lon: dms(49, 42, 24, "W") },
  ITARETAMA: { lat: dms(25, 5, 50, "S"), lon: dms(49, 24, 21, "W") },
  CAMPINA: { lat: dms(25, 18, 5, "S"), lon: dms(49, 3, 10, "W") },
  "IGREJA DA ROSEIRA": { lat: dms(25, 18, 10, "S"), lon: dms(49, 7, 58, "W") },
  ATUBA: { lat: dms(25, 23, 19, "S"), lon: dms(49, 12, 20, "W") },
  "IRAÍ": { lat: dms(25, 25, 20, "S"), lon: dms(49, 5, 51, "W") },
  PEDREIRA: { lat: dms(25, 25, 16, "S"), lon: dms(49, 1, 55, "W") },
  MARUMBI: { lat: dms(25, 25, 11, "S"), lon: dms(48, 55, 9, "W") },
  "TREVO 277": { lat: dms(25, 33, 56, "S"), lon: dms(48, 36, 51, "W") },
  GUARATUBA: { lat: dms(25, 53, 28, "S"), lon: dms(48, 33, 53, "W") },
  "SÃO FRANCISCO DO SUL": { lat: dms(26, 12, 36, "S"), lon: dms(48, 31, 6, "W") },
  "BARRA DO SUL": { lat: dms(26, 27, 31, "S"), lon: dms(48, 36, 1, "W") },
  "BARRA VELHA": { lat: dms(26, 37, 45, "S"), lon: dms(48, 40, 58, "W") },
};

const D = { classe: "D", fca: null, ats: "APP-CT 119.95 / 119.70 / 129.55 / 120.65MHZ" };
const D_LITORAL = { classe: "D", fca: null, ats: "APP-CT 120.95 / 133.15MHZ" };
const G_BI = { classe: "G", fca: "118.90", ats: "TWR-BI 118.90MHZ" };

/** [nome, a, b, altAb, altBa, radio, rumoAb, rumoBa|null] */
const SEGS = [
  ["Porto Amazonas", "PORTO AMAZONAS", "CONTENDA", 5500, 4500, D, 131, 311],
  ["Voçoroca", "CONTENDA", "VOÇOROCA", 5500, 4500, D, 130, 310],
  ["Sanepar", "CONTENDA", "SANEPAR", 4500, 4000, D, 86, 266],
  ["Rio Verde", "CONTENDA", "CAMPO MAGRO", 5500, 4500, D, 33, 213],
  ["Rio Branco", "CAMPO MAGRO", "RIO BRANCO", 5500, 5000, D, 51, 231],
  ["Tunas", "RIO BRANCO", "TUNAS", 5500, 6000, D, 64, 244],
  ["Colombo", "RIO BRANCO", "COLOMBO", 5500, 5000, D, 144, 324],
  ["Tamandaré", "RIO BRANCO", "TAMANDARÉ", 5000, 4800, D, 177, 357],
  ["Barigui", "TAMANDARÉ", "BARIGUI", 4600, 4100, D, 207, 27],
  ["Campo Magro", "CAMPO MAGRO", "BARIGUI", 4600, 4100, D, 137, 317],
  ["Jazida", "JAZIDA", "ITARETAMA", 6000, 5000, D, 115, 295],
  ["Itaretama", "ITARETAMA", "RIO BRANCO", 5500, 5000, D, 175, 355],
  ["Norte", "CAMPINA", "IGREJA DA ROSEIRA", 4000, null, G_BI, 289, null],
  ["Norte", "IGREJA DA ROSEIRA", "ATUBA", 4000, null, G_BI, 238, null],
  ["Sul", "ATUBA", "CAMPINA", 4000, null, G_BI, 79, null],
  ["Represa", "IRAÍ", "PEDREIRA", 4000, 4500, D, 109, 289],
  ["Represa", "PEDREIRA", "MARUMBI", 4800, 5500, D, 109, 289],
  ["Marumbi", "MARUMBI", "TREVO 277", 5500, 6500, D, 138, 318],
  ["São Francisco do Sul", "GUARATUBA", "SÃO FRANCISCO DO SUL", 3000, 2000, D_LITORAL, 193, 13],
  ["São Francisco do Sul", "SÃO FRANCISCO DO SUL", "BARRA DO SUL", 3000, 2000, D_LITORAL, 217, 37],
  ["Barra do Sul", "BARRA DO SUL", "BARRA VELHA", 2000, 3000, D_LITORAL, 224, 44],
];

const trechoByName = new Map();
const features = [];

for (const [nome, aName, bName, altAb, altBa, radio, rumoAb, rumoBa] of SEGS) {
  const a = P[aName];
  const b = P[bName];
  if (!a || !b) throw new Error(`Ponto ausente: ${aName} / ${bName}`);
  const trecho = (trechoByName.get(nome) || 0) + 1;
  trechoByName.set(nome, trecho);
  const oneWay = rumoBa == null || altBa == null;
  const geom = corridorPolygon(a, b, SEMI_LARGURA_M);
  const id = 74000 + features.length + 1;
  const fid = `CV_REA_WT_CT.${nome}.${trecho}`;
  const alts = [altAb, oneWay ? null : altBa].filter((n) => n != null);
  const altmax = Math.max(...alts);
  const altmin = Math.min(...alts);
  features.push({
    type: "Feature",
    id: fid,
    geometry: geom,
    geometry_name: "geom",
    properties: {
      id,
      tipo: "Obrig",
      nome,
      trecho,
      classe: radio.classe,
      fca: radio.fca,
      ats: radio.ats,
      semi_largura: SEMI_LARGURA_M,
      rumoa_to_b: rumoAb,
      rumob_to_a: oneWay ? null : rumoBa,
      altmax,
      altmin,
      altcomp: null,
      altmaxa_to_b: altAb,
      altmina_to_b: altAb,
      altmaxb_to_a: oneWay ? null : altBa,
      altminb_to_a: oneWay ? null : altBa,
      altcompa_to_b: altAb,
      altcompb_to_a: oneWay ? null : altBa,
      fixo_a_lat: a.lat,
      fixo_a_lon: a.lon,
      fixo_b_lat: b.lat,
      fixo_b_lon: b.lon,
      eixokey: `wt-ct-${nome.toLowerCase()}-${trecho}`,
      fixo_a_nome: aName,
      fixo_b_nome: bName,
      carta_nome: CARTA,
      efetivacao: EFETIVACAO,
      identificador: AIC,
    },
    bbox: bboxOf(geom),
  });
}

const out = { type: "FeatureCollection", features };
const dest = path.join("public", "geo", "cv-rea-wt-ct.json");
fs.writeFileSync(dest, `${JSON.stringify(out)}\n`);
console.log(`wrote ${dest} (${features.length} trechos, ${Object.keys(P).length} pontos)`);
