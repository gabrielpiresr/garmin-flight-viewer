/**
 * Digitize TMA BH REA from AIC N 81/24 Anexo A (republica AIC N 20/24).
 * GeoAISWEB has the WH raster chart but no CV_REA vector layer.
 */
import fs from "fs";
import path from "path";

const EARTH_RADIUS_M = 6_371_008.8;
const SEMI_LARGURA_M = 2778;
const CARTA = "WH-BELO HORIZONTE";
const AIC = "AIC N81/24";
const EFETIVACAO = "2024-09-05T00:00:00Z";
const MAG_VAR_W = 23;

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

function magRumo(from, to) {
  return Math.round((bearingDeg(from, to) + MAG_VAR_W) % 360);
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

/** AIC Anexo A visual references (DMS). */
const P = {
  "ARAÇAÍ": { lat: dms(19, 12, 4, "S"), lon: dms(44, 14, 55, "W") },
  PIRAPAMA: { lat: dms(19, 0, 10, "S"), lon: dms(44, 2, 21, "W") },
  ONÇA: { lat: dms(19, 8, 46, "S"), lon: dms(43, 58, 33, "W") },
  PARAOPEBA: { lat: dms(19, 16, 40, "S"), lon: dms(44, 24, 10, "W") },
  LAPINHA: { lat: dms(19, 6, 32, "S"), lon: dms(43, 45, 41, "W") },
  CONCEIÇÃO: { lat: dms(19, 2, 56, "S"), lon: dms(43, 24, 55, "W") },
  "SANTA BÁRBARA": { lat: dms(19, 57, 30, "S"), lon: dms(43, 24, 45, "W") },
  AMPARO: { lat: dms(19, 39, 42, "S"), lon: dms(43, 23, 10, "W") },
  ITABIRA: { lat: dms(19, 36, 7, "S"), lon: dms(43, 12, 40, "W") },
  MONLEVADE: { lat: dms(19, 50, 17, "S"), lon: dms(43, 9, 7, "W") },
  ARANHA: { lat: dms(20, 19, 59, "S"), lon: dms(44, 3, 13, "W") },
  ITABIRITO: { lat: dms(20, 13, 50, "S"), lon: dms(43, 46, 42, "W") },
  BRANCA: { lat: dms(20, 5, 40, "S"), lon: dms(44, 4, 54, "W") },
  CHAPÉU: { lat: dms(20, 7, 10, "S"), lon: dms(43, 55, 15, "W") },
  "OURO PRETO": { lat: dms(20, 23, 39, "S"), lon: dms(43, 29, 26, "W") },
  JECEABA: { lat: dms(20, 32, 8, "S"), lon: dms(43, 59, 6, "W") },
  IBIRITÉ: { lat: dms(20, 1, 45, "S"), lon: dms(44, 5, 54, "W") },
  FLORES: { lat: dms(19, 55, 5, "S"), lon: dms(44, 10, 6, "W") },
  ITAÚNA: { lat: dms(20, 4, 34, "S"), lon: dms(44, 34, 39, "W") },
  JUATUBA: { lat: dms(19, 57, 34, "S"), lon: dms(44, 20, 14, "W") },
  ITAGUARA: { lat: dms(20, 23, 31, "S"), lon: dms(44, 29, 12, "W") },
  MANSO: { lat: dms(20, 13, 21, "S"), lon: dms(44, 16, 52, "W") },
  CEASA: { lat: dms(19, 53, 24, "S"), lon: dms(44, 2, 50, "W") },
  "PARÁ DE MINAS": { lat: dms(19, 50, 30, "S"), lon: dms(44, 36, 2, "W") },
  MARAVILHAS: { lat: dms(19, 30, 47, "S"), lon: dms(44, 40, 42, "W") },
  PRATA: { lat: dms(19, 31, 27, "S"), lon: dms(44, 27, 17, "W") },
  ANGUERETÁ: { lat: dms(19, 8, 36, "S"), lon: dms(44, 38, 29, "W") },
  BENTO: { lat: dms(19, 41, 55.5, "S"), lon: dms(44, 24, 36, "W") },
  IGARAPÉ: { lat: dms(20, 4, 39, "S"), lon: dms(44, 18, 26, "W") },
  "SETE LAGOAS": { lat: dms(19, 27, 21, "S"), lon: dms(44, 17, 43, "W") },
  MASCARENHAS: { lat: dms(18, 58, 42, "S"), lon: dms(44, 21, 20, "W") },
  MANNESMANN: { lat: dms(19, 58, 41, "S"), lon: dms(44, 0, 29, "W") },
  CIRRUS: { lat: dms(19, 25, 43, "S"), lon: dms(43, 53, 57, "W") },
  ANDIROBA: { lat: dms(19, 39, 0, "S"), lon: dms(44, 13, 49, "W") },
  TAQUARAÇU: { lat: dms(19, 45, 47, "S"), lon: dms(43, 41, 5, "W") },
};

const G = { classe: "G", fca: "122.55", ats: "FCA TMA-BH 122.55MHZ" };
const D = { classe: "D", fca: null, ats: "APP-BH 120.20 / 128.55MHZ" };

/** [nome, a, b, altMax, altMin, radio, oneWay?] */
const SEGS = [
  ["Alfa", "ARAÇAÍ", "PIRAPAMA", 6000, 3400, G],
  ["Bravo", "PIRAPAMA", "ONÇA", 6000, 3000, G],
  ["Charlie", "PARAOPEBA", "ARAÇAÍ", 6000, 4000, G],
  ["Charlie", "ARAÇAÍ", "ONÇA", 6000, 3400, G],
  ["Charlie", "ONÇA", "LAPINHA", 7000, 4500, G],
  ["Charlie", "LAPINHA", "CONCEIÇÃO", 7000, 6300, G],
  ["Delta", "SANTA BÁRBARA", "AMPARO", 7000, 4200, G],
  ["Delta", "AMPARO", "ITABIRA", 7000, 4900, G],
  ["Echo", "AMPARO", "MONLEVADE", 7000, 4500, G],
  ["Foxtrot", "ARANHA", "ITABIRITO", 7000, 5100, G],
  ["Foxtrot", "ITABIRITO", "SANTA BÁRBARA", 7000, 5700, G],
  ["Foxtrot", "SANTA BÁRBARA", "MONLEVADE", 6500, 6000, G],
  ["Golf", "BRANCA", "CHAPÉU", 6200, 5700, G],
  ["Golf", "CHAPÉU", "ITABIRITO", 6500, 5700, G],
  ["Golf", "ITABIRITO", "OURO PRETO", 7000, 6000, G],
  ["Hotel", "JECEABA", "ARANHA", 6500, 5000, G],
  ["Hotel", "ARANHA", "BRANCA", 6500, 5700, G],
  ["Hotel", "BRANCA", "IBIRITÉ", 6200, 5200, G],
  ["Hotel", "IBIRITÉ", "FLORES", 6000, 4500, D],
  ["India", "ITAÚNA", "JUATUBA", 6000, 4900, G],
  ["Juliet", "ITAGUARA", "MANSO", 6500, 5000, G],
  ["Kilo", "JUATUBA", "FLORES", 5500, 4500, D],
  ["Kilo", "FLORES", "CEASA", 5000, 4200, D],
  ["Lima", "PARÁ DE MINAS", "JUATUBA", 6000, 4800, G],
  ["Mike", "MARAVILHAS", "PRATA", 6000, 4000, G],
  ["November", "ANGUERETÁ", "PRATA", 6000, 4000, G],
  ["November", "PRATA", "BENTO", 6000, 4200, G],
  ["November", "BENTO", "JUATUBA", 6000, 4200, G],
  ["November", "JUATUBA", "IGARAPÉ", 6000, 4000, G],
  ["November", "IGARAPÉ", "MANSO", 6000, 5500, G],
  ["November", "MANSO", "ARANHA", 6500, 4500, G],
  ["Oscar", "PARAOPEBA", "SETE LAGOAS", 5500, 4800, D, true],
  ["Papa", "PRATA", "PARAOPEBA", 6000, 3600, G],
  ["Papa", "PARAOPEBA", "MASCARENHAS", 6000, 4000, G],
  ["Quebec", "PARÁ DE MINAS", "BENTO", 6000, 3700, G],
  ["Romeu", "IBIRITÉ", "MANNESMANN", 5500, 4500, G],
  ["Sierra", "ITAÚNA", "IGARAPÉ", 6000, 4800, G],
  ["Sierra", "IGARAPÉ", "IBIRITÉ", 6000, 4800, G],
  ["Tango", "CIRRUS", "ONÇA", 5500, 4500, D],
  ["Uniform", "BENTO", "ANDIROBA", 5500, 4500, D],
  ["Victor", "TAQUARAÇU", "AMPARO", 5500, 4700, D],
];

const trechoByName = new Map();
const features = [];

for (const [nome, aName, bName, altmax, altmin, radio, oneWay] of SEGS) {
  const a = P[aName];
  const b = P[bName];
  if (!a || !b) throw new Error(`Ponto ausente: ${aName} / ${bName}`);
  const trecho = (trechoByName.get(nome) || 0) + 1;
  trechoByName.set(nome, trecho);
  const rumoa = magRumo(a, b);
  const rumob = magRumo(b, a);
  const geom = corridorPolygon(a, b, SEMI_LARGURA_M);
  const id = 81000 + features.length + 1;
  const fid = `CV_REA_WH_BH.${nome}.${trecho}`;
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
      rumoa_to_b: rumoa,
      rumob_to_a: oneWay ? null : rumob,
      altmax,
      altmin,
      altcomp: null,
      altmaxa_to_b: altmax,
      altmina_to_b: altmin,
      altmaxb_to_a: oneWay ? null : altmax,
      altminb_to_a: oneWay ? null : altmin,
      altcompa_to_b: altmax,
      altcompb_to_a: oneWay ? null : altmax,
      fixo_a_lat: a.lat,
      fixo_a_lon: a.lon,
      fixo_b_lat: b.lat,
      fixo_b_lon: b.lon,
      eixokey: `wh-bh-${nome.toLowerCase()}-${trecho}`,
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
const dest = path.join("public", "geo", "cv-rea-wh-bh.json");
fs.writeFileSync(dest, `${JSON.stringify(out)}\n`);
console.log(`wrote ${dest} (${features.length} trechos, ${Object.keys(P).length} pontos)`);
