import { parseGarminCsv, type ParseResult } from "../lib/parseGarminCsv";
import type { FlightPoint } from "../types/flight";

type SlimRequest = {
  csv: string;
  slim?: boolean;
  maxPoints?: number;
  maxChartRows?: number;
};

function isValidRoutePoint(point: FlightPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180 &&
    !(point.lat === 0 && point.lon === 0)
  );
}

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i / Math.max(1, max - 1)) * last);
    const item = items[idx];
    if (item !== undefined && out[out.length - 1] !== item) out.push(item);
  }
  if (out[out.length - 1] !== items[last]) out.push(items[last]!);
  return out;
}

function slimParseResult(result: ParseResult, maxPoints: number, maxChartRows: number): ParseResult {
  return {
    ...result,
    points: downsample(result.points.filter(isValidRoutePoint), maxPoints),
    chartData: downsample(result.chartData, maxChartRows),
  };
}

self.onmessage = (e: MessageEvent<string | SlimRequest>) => {
  try {
    const payload = e.data;
    const csv = typeof payload === "string" ? payload : payload.csv;
    const result = parseGarminCsv(csv);
    if (typeof payload !== "string" && payload.slim) {
      self.postMessage({
        ok: true,
        result: slimParseResult(result, payload.maxPoints ?? 240, payload.maxChartRows ?? 360),
      });
      return;
    }
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
