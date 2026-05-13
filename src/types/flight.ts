// ─── Segment detection ───────────────────────────────────────────────────────

export type FlightEventType = 'rotation' | 'liftoff' | '50ft' | 'touchdown';

export type FlightEvent = {
  type: FlightEventType;
  /** Chart x-axis value (ms offset from chartTimeBaseMs). */
  xMs: number;
  label: string;
  color: string;
  /** Index into chartData array. */
  rowIdx: number;
};

export type SegmentType = 'takeoff' | 'landing' | 'tgl';

export type TakeoffMetrics = {
  groundRollFt: number | null;
  groundRollDurationSec: number | null;
  timeToAgl100Sec: number | null;
  timeToAgl500Sec: number | null;
  rotationIasKt: number | null;
  rotationPitchRateDs: number | null;
  liftoffIasKt: number | null;
  rpmAtLiftoff: number | null;
  mapAtLiftoff: number | null;
  fuelFlowAtLiftoff: number | null;
  at50DistFromRotFt: number | null;
  at50IasKt: number | null;
  at50PitchDeg: number | null;
  at50VspdFpm: number | null;
};

export type LandingMetrics = {
  descentPathDeg: number | null;
  descentPathAltFt: number | null;
  iasMinKt: number | null;
  iasMaxKt: number | null;
  maxDescentRateFpm: number | null;
  rpmMin: number | null;
  rpmMax: number | null;
  at50IasKt: number | null;
  at50PitchDeg: number | null;
  flareDurationSec: number | null;
  flareDistFt: number | null;
  pitchOscillations: number | null;
  tdIasKt: number | null;
  tdGsKt: number | null;
  tdVertSpeedFpm: number | null;
  tdPitchDeg: number | null;
  tdImpactG: number | null;
  tdImpactLabel: 'Low' | 'Medium' | 'High' | null;
  tdCrabAngleDeg: number | null;
  ldaFt: number | null;
  maxBrakingG: number | null;
};

export type FlightSegment = {
  id: string;
  type: SegmentType;
  label: string;
  /** Chart x value for the segment window start (ms offset). */
  startX: number;
  /** Chart x value for the segment window end (ms offset). */
  endX: number;
  events: FlightEvent[];
  takeoffMetrics?: TakeoffMetrics;
  landingMetrics?: LandingMetrics;
};

// ─── GPS track ───────────────────────────────────────────────────────────────

/** Ponto único da trilha, já normalizado para SI onde faz sentido. */
export type FlightPoint = {
  /** Epoch ms quando disponível */
  t: number | null;
  lat: number;
  lon: number;
  /** Heading/track em graus (0-360), quando disponível */
  headingDeg?: number | null;
  /** Altitude em metros (ou null se não existir no CSV) */
  altM: number | null;
  /** Velocidade solo em m/s (ou null) */
  speedMs: number | null;
};

export type FlightSample = {
  id: string;
  label: string;
  points: FlightPoint[];
  warnings: string[];
  /** texto livre sobre colunas detectadas */
  meta: string;
};

export type FlightSummary = {
  durationSec: number | null;
  distanceM: number;
  altMinM: number | null;
  altMaxM: number | null;
  speedAvgMs: number | null;
  speedMaxMs: number | null;
  pointCount: number;
};
