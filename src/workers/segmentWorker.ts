import { detectFlightSegments } from "../lib/flightSegments";
import type { ChartRow } from "../lib/telemetryCharts";
import type { FlightPoint, FlightSegment } from "../types/flight";

type SegmentRequest = {
  requestId: number;
  chartData: ChartRow[];
  chartTimeBaseMs: number | null;
  points: FlightPoint[];
  aircraftIdent?: string | null;
};

type SegmentResponse =
  | { ok: true; requestId: number; segments: FlightSegment[] }
  | { ok: false; requestId: number; error: string };

self.onmessage = (event: MessageEvent<SegmentRequest>) => {
  const { requestId, chartData, chartTimeBaseMs, points, aircraftIdent } = event.data;
  try {
    const segments = detectFlightSegments(chartData, chartTimeBaseMs, points, { aircraftIdent });
    self.postMessage({ ok: true, requestId, segments } satisfies SegmentResponse);
  } catch (err) {
    self.postMessage({
      ok: false,
      requestId,
      error: (err as Error).message || String(err),
    } satisfies SegmentResponse);
  }
};
