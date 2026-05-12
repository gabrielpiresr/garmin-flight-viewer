const META_PREFIX = "#GFV_META_V1:";

export type FlightRecordMeta = {
  status: "draft" | "submitted";
  header: {
    studentUserId: string;
    studentLabel: string;
    studentName?: string;
    studentAnac?: string;
    instructorUserId?: string;
    instructorName?: string;
    instructorAnac?: string;
    date: string;
    startTime?: string;
    aircraft: string;
  };
  schedule?: {
    version: "AUTO_SCHEDULE_V1";
    weekStart: string;
    demandId: string;
    allocationLayer?: string;
    relaxationLevel?: string;
  };
  preFlight: {
    objectiveMd: string;
    briefingMd: string;
    instructorSuggestionMd?: string;
    studentSuggestionMd?: string;
  };
  legs: Array<{
    id: string;
    date: string;
    role: string;
    dep: string;
    arr: string;
    landings: number;
    flightTime: string;
    navTime: string;
    ifrTime: string;
    nightTime: string;
    serviceTime: string;
    distance: string;
  }>;
  risk: {
    commentsMd: string;
    dangerMd: string;
    riskMd: string;
    managementMd: string;
    instructorOpinionMd: string;
  };
};

function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function fromBase64(encoded: string): string {
  return decodeURIComponent(escape(atob(encoded)));
}

export function encodeFlightRecord(payload: { meta: FlightRecordMeta; telemetryCsv: string }): string {
  const metaEncoded = toBase64(JSON.stringify(payload.meta));
  const csv = payload.telemetryCsv.trim();
  if (!csv) return `${META_PREFIX}${metaEncoded}\n`;
  return `${META_PREFIX}${metaEncoded}\n${csv}`;
}

export function decodeFlightRecord(recordText: string): { meta: FlightRecordMeta | null; telemetryCsv: string } {
  const normalized = (recordText ?? "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  if (!first.startsWith(META_PREFIX)) {
    return { meta: null, telemetryCsv: normalized };
  }
  const encoded = first.slice(META_PREFIX.length).trim();
  let meta: FlightRecordMeta | null = null;
  try {
    const raw = fromBase64(encoded);
    meta = JSON.parse(raw) as FlightRecordMeta;
  } catch {
    meta = null;
  }
  return { meta, telemetryCsv: lines.slice(1).join("\n") };
}
