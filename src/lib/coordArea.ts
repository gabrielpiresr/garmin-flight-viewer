import { parseCompactAviationCoord } from "./flightPlanningRoute";

const COORD_TOKEN_RE = /\d{2}\d{2}(?:\d{2}|\.\d{1,4})?[NS]\/?\d{3}\d{2}(?:\d{2}|\.\d{1,4})?[EW]/gi;

export type CoordAreaPoint = { lat: number; lng: number };

export function parseCoordAreaText(raw: string): CoordAreaPoint[] {
  const text = String(raw || "")
    .toUpperCase()
    .replace(/,/g, ".");
  const points: CoordAreaPoint[] = [];
  for (const match of text.matchAll(COORD_TOKEN_RE)) {
    const parsed = parseCompactAviationCoord(match[0]!);
    if (parsed) points.push(parsed);
  }
  if (points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (Math.abs(first.lat - last.lat) < 1e-6 && Math.abs(first.lng - last.lng) < 1e-6) {
      points.pop();
    }
  }
  return points;
}

export function coordAreaError(points: CoordAreaPoint[]): string | null {
  if (points.length < 3) {
    return "Cole ao menos 3 coordenadas no formato 252823S0541627W, separadas por hífen.";
  }
  return null;
}
