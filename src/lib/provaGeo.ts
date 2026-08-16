import type { ProvaLatLng, ProvaPctPoint } from "../types/provas";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function pointInPolygon(point: ProvaLatLng | ProvaPctPoint, ring: Array<ProvaLatLng | ProvaPctPoint>): boolean {
  if (ring.length < 3) return false;
  const px = "lng" in point ? point.lng : point.x;
  const py = "lat" in point ? point.lat : point.y;
  if (!isFiniteNumber(px) || !isFiniteNumber(py)) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const xi = "lng" in current ? current.lng : current.x;
    const yi = "lat" in current ? current.lat : current.y;
    const xj = "lng" in previous ? previous.lng : previous.x;
    const yj = "lat" in previous ? previous.lat : previous.y;
    if (!isFiniteNumber(xi) || !isFiniteNumber(yi) || !isFiniteNumber(xj) || !isFiniteNumber(yj)) continue;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function closeRing<T extends ProvaLatLng | ProvaPctPoint>(points: T[]): T[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  const same =
    "lat" in first && "lat" in last
      ? first.lat === last.lat && first.lng === last.lng
      : "x" in first && "x" in last
        ? first.x === last.x && first.y === last.y
        : false;
  return same ? points : [...points, first];
}
