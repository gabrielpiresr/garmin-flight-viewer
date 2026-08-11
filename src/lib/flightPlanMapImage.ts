import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { routeBoundingBox } from "./flightPlanningRoute";

const ESRI_EXPORT =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export";
const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_ESRI_PROXY = "/esri-proxy/ArcGIS/rest/services/World_Topo_Map/MapServer/export";
const DEV_WMS_PROXY = "/geoaisweb-proxy/geoserver/ows";

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Expand bbox so geographic aspect matches canvas aspect (no stretch). */
function fitBboxToAspect(bbox: Bbox, width: number, height: number): Bbox {
  const pad = 0.08;
  let minLng = bbox.minLng;
  let maxLng = bbox.maxLng;
  let minLat = bbox.minLat;
  let maxLat = bbox.maxLat;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  let spanLng = Math.max(0.15, maxLng - minLng);
  let spanLat = Math.max(0.12, maxLat - minLat);
  minLng -= spanLng * pad;
  maxLng += spanLng * pad;
  minLat -= spanLat * pad;
  maxLat += spanLat * pad;
  spanLng = maxLng - minLng;
  spanLat = maxLat - minLat;

  const targetAspect = width / Math.max(1, height);
  // Approximate degrees aspect using cos(lat) so 1° lng ≈ cos(lat) of 1° lat in distance.
  const geoAspect = (spanLng * cosLat) / Math.max(1e-9, spanLat);
  if (geoAspect < targetAspect) {
    const needLng = (spanLat * targetAspect) / cosLat;
    const grow = (needLng - spanLng) / 2;
    minLng -= grow;
    maxLng += grow;
  } else if (geoAspect > targetAspect) {
    const needLat = (spanLng * cosLat) / targetAspect;
    const grow = (needLat - spanLat) / 2;
    minLat -= grow;
    maxLat += grow;
  }
  return { minLng, minLat, maxLng, maxLat };
}

function project(
  lat: number,
  lng: number,
  bbox: Bbox,
  width: number,
  height: number,
): [number, number] {
  const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng || 1)) * width;
  const y = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat || 1)) * height;
  return [x, y];
}

async function fetchImage(urls: string[]): Promise<Blob | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (
        blob.size > 0 &&
        (blob.type.includes("png") ||
          blob.type.includes("jpeg") ||
          blob.type.includes("octet") ||
          !blob.type)
      ) {
        return blob;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchImageViaProxy(absoluteUrl: string): Promise<Blob | null> {
  try {
    const { proxyMapImageDataUrl } = await import("./aiswebDb");
    const dataUrl = await proxyMapImageDataUrl(absoluteUrl);
    if (!dataUrl) return null;
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/** Build a PNG data-URL map with topo base + CTA/TMA/CTR/ATZ WMS overlay + route. */
export async function buildFlightPlanMapDataUrl(
  waypoints: FlightPlanWaypoint[],
  options?: { width?: number; height?: number },
): Promise<string | null> {
  if (waypoints.length < 1) return null;
  // A4 landscape ≈ 297×210 → ~1.414
  const width = options?.width ?? 1400;
  const height = options?.height ?? 900;
  const rawBbox = routeBoundingBox(waypoints, 0.2);
  if (!rawBbox) return null;
  const bbox = fitBboxToAspect(rawBbox, width, height);

  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  const esriQs = new URLSearchParams({
    bbox: bboxStr,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    format: "png",
    f: "image",
  });
  const wmsQs = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: "ICA:CTA,ICA:TMA,ICA:CTR,ICA:ATZ",
    styles: "",
    bbox: bboxStr,
    width: String(width),
    height: String(height),
    srs: "EPSG:4326",
    format: "image/png",
    transparent: "true",
  });

  const esriAbs = `${ESRI_EXPORT}?${esriQs}`;
  const wmsAbs = `${WMS_BASE}?${wmsQs}`;

  let baseBlob = await fetchImage([`${DEV_ESRI_PROXY}?${esriQs}`, esriAbs]);
  if (!baseBlob) baseBlob = await fetchImageViaProxy(esriAbs);

  let overlayBlob = await fetchImage([`${DEV_WMS_PROXY}?${wmsQs}`, wmsAbs]);
  if (!overlayBlob) overlayBlob = await fetchImageViaProxy(wmsAbs);

  if (!baseBlob && !overlayBlob) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  const drawBlob = async (blob: Blob | null, alpha = 1) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("img"));
        image.src = url;
      });
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, 0, width, height);
      ctx.globalAlpha = 1;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  try {
    await drawBlob(baseBlob, 1);
    await drawBlob(overlayBlob, 0.65);
  } catch {
    return null;
  }

  const pts = waypoints.map((w) => project(w.lat, w.lng, bbox, width, height));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(15,23,42,0.55)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  pts.forEach(([x, y], i) => {
    const isFirst = i === 0;
    const isLast = i === pts.length - 1;
    ctx.beginPath();
    ctx.fillStyle = isFirst ? "#34d399" : isLast ? "#f472b6" : "#38bdf8";
    ctx.arc(x, y, isFirst || isLast ? 7 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });

  ctx.textAlign = "center";
  ctx.font = "bold 13px Segoe UI, sans-serif";
  waypoints.forEach((w, i) => {
    const pt = pts[i];
    if (!pt) return;
    const label = (w.label || `P${i + 1}`).slice(0, 12);
    const isFirst = i === 0;
    const isLast = i === waypoints.length - 1;
    ctx.fillStyle = isFirst ? "#bbf7d0" : isLast ? "#fbcfe8" : "#e0f2fe";
    ctx.strokeStyle = "rgba(15,23,42,0.65)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, pt[0], pt[1] - 12);
    ctx.fillText(label, pt[0], pt[1] - 12);
  });

  // Scale bar (~50 NM or proportion of span)
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const mPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
  const spanM = (bbox.maxLng - bbox.minLng) * mPerDegLng;
  const targetNm = spanM / 1852 > 120 ? 50 : spanM / 1852 > 40 ? 20 : 10;
  const barPx = Math.min(width * 0.22, ((targetNm * 1852) / spanM) * width);
  const barX = 28;
  const barY = height - 28;
  ctx.fillStyle = "rgba(15,23,42,0.7)";
  ctx.fillRect(barX - 8, barY - 22, barPx + 16, 30);
  ctx.strokeStyle = "#f8fafc";
  ctx.fillStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barPx, barY);
  ctx.moveTo(barX, barY - 5);
  ctx.lineTo(barX, barY + 5);
  ctx.moveTo(barX + barPx, barY - 5);
  ctx.lineTo(barX + barPx, barY + 5);
  ctx.stroke();
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${targetNm} NM`, barX + 4, barY - 8);

  return canvas.toDataURL("image/png");
}
