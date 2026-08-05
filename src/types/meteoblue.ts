/** Resposta bruta do pacote Meteoblue `basic-1h_basic-day`. */
export type MeteoblueRawForecast = {
  metadata?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    height?: number;
    timezone_abbreviation?: string;
    utc_timeoffset?: number;
  };
  units?: Record<string, string>;
  data_day?: {
    time?: string[];
    pictocode?: number[];
    temperature_max?: number[];
    temperature_min?: number[];
    temperature_mean?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    windspeed_max?: number[];
    windspeed_mean?: number[];
    winddirection?: number[];
    relativehumidity_mean?: number[];
    felttemperature_max?: number[];
    felttemperature_min?: number[];
    uvindex?: number[];
  };
  data_1h?: {
    time?: string[];
    pictocode?: number[];
    temperature?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    windspeed?: number[];
    winddirection?: number[];
    relativehumidity?: number[];
    felttemperature?: number[];
    isdaylight?: number[];
    uvindex?: number[];
  };
};

export type DayWeatherSummary = {
  dateIso: string;
  pictocode: number;
  label: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  windMaxKt: number | null;
  windDirDeg: number | null;
  precipMm: number | null;
  precipProbPct: number | null;
  humidityPct: number | null;
  feltMaxC: number | null;
  feltMinC: number | null;
  uvIndex: number | null;
};

export type HourWeatherSlot = {
  dateIso: string;
  /** Início do bloco de 3h (0–23). */
  hour: number;
  timeLabel: string;
  pictocode: number;
  label: string;
  tempC: number | null;
  windKt: number | null;
  windDirDeg: number | null;
  precipMm: number | null;
  precipProbPct: number | null;
  humidityPct: number | null;
  feltC: number | null;
  isDaylight: boolean;
};

export type MeteoblueForecastBundle = {
  fetchedAt: string;
  lat: number;
  lon: number;
  asl: number;
  icao?: string | null;
  days: DayWeatherSummary[];
  hours: HourWeatherSlot[];
  /** Raw opcional para debug; não precisa persistir em cache antigo. */
  raw?: MeteoblueRawForecast;
};
