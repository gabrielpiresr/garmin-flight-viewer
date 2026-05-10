/** Ponto único da trilha, já normalizado para SI onde faz sentido. */
export type FlightPoint = {
  /** Epoch ms quando disponível */
  t: number | null;
  lat: number;
  lon: number;
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
