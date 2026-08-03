import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { routeBoundingBox } from "./flightPlanningRoute";

const ESRI_EXPORT =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export";
const WMS_BASE = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_ESRI_PROXY = "/esri-proxy/ArcGIS/rest/services/World_Topo_Map/MapServer/export";
const DEV_WMS_PROXY = "/geoaisweb-proxy/geoserver/ows";

function project(
  lat: number,
  lng: number,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
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

/** Build a PNG data-URL map with topo base + CTA/TMA/CTR WMS overlay + route. */
export async function buildFlightPlanMapDataUrl(
  waypoints: FlightPlanWaypoint[],
  options?: { width?: number; height?: number },
): Promise<string | null> {
  if (waypoints.length < 1) return null;
  const width = options?.width ?? 1000;
  const height = options?.height ?? 480;
  const bbox = routeBoundingBox(waypoints, 0.25);
  if (!bbox) return null;

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
    layers: "ICA:CTA,ICA:TMA,ICA:CTR",
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
    await drawBlob(overlayBlob, 0.72);
  } catch {
    return null;
  }

  const pts = waypoints.map((w) => project(w.lat, w.lng, bbox, width, height));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  pts.forEach(([x, y], i) => {
    const isFirst = i === 0;
    const isLast = i === pts.length - 1;
    ctx.beginPath();
    ctx.fillStyle = isFirst ? "#34d399" : isLast ? "#f472b6" : "#38bdf8";
    ctx.arc(x, y, isFirst || isLast ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (first && pts[0]) {
    ctx.fillStyle = "#bbf7d0";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(first.label || "DEP", pts[0][0], pts[0][1] - 10);
  }
  if (last && pts[pts.length - 1]) {
    ctx.fillStyle = "#fbcfe8";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(last.label || "ARR", pts[pts.length - 1]![0], pts[pts.length - 1]![1] - 10);
  }

  return canvas.toDataURL("image/png");
}
