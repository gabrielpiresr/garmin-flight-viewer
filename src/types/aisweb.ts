export type AiswebFlightCondition = "vfr_diurno" | "vfr_noturno" | "aluno_solo";

export type AiswebOperationalMinimum = {
  condition: AiswebFlightCondition;
  label: string;
  ceilingFt: number;
  visibilityKm: number;
  maxWindKt: number;
};

export type AiswebPlatformSettings = {
  defaultIcao: string;
  minimums: AiswebOperationalMinimum[];
  updatedAt: string | null;
};

export type AiswebPlatformSettingsInput = {
  defaultIcao: string;
  minimums: AiswebOperationalMinimum[];
};

export type AiswebWatchlist = {
  icaoCodes: string[];
  /** Por ICAO: se true, envia e-mail quando sair NOTAM novo. */
  notamAlerts: Record<string, boolean>;
  /** Por ICAO: se true, envia e-mail quando sair suplemento AIP novo. */
  supplementAlerts: Record<string, boolean>;
  /** Por ICAO: se true, envia e-mail quando sair aviso de aeródromo (REDEMET) novo. */
  adWarningAlerts: Record<string, boolean>;
  updatedAt: string | null;
};

export type AiswebWeatherAlertCondition =
  | "wind_total"
  | "crosswind"
  | "gust"
  | "visibility"
  | "ceiling"
  | "phenomenon";

export type AiswebWeatherAlertComparator = "gt" | "lt" | "between" | "contains";

export type AiswebWeatherAlertSource = "metar" | "taf";

export type AiswebWeatherAlertMatchMode = "any" | "all";

export type AiswebWeatherAlertRepeatMode = "continuous" | "once_until_normal";

export type AiswebWeatherAlertCriterion = {
  id: string;
  source: AiswebWeatherAlertSource;
  condition: AiswebWeatherAlertCondition;
  comparator: AiswebWeatherAlertComparator;
  value: number | string;
  valueMax?: number | null;
};

export type AiswebWeatherAlert = {
  id: string;
  name: string;
  icaoCodes: string[];
  matchMode: AiswebWeatherAlertMatchMode;
  repeatMode: AiswebWeatherAlertRepeatMode;
  criteria: AiswebWeatherAlertCriterion[];
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastTriggeredAt?: string | null;
  active?: boolean;
};

export type AiswebWeatherAlertHistoryItem = {
  id: string;
  alertId: string;
  alertName: string;
  icao: string;
  source: AiswebWeatherAlertSource | "metar/taf";
  summary: string;
  details: string[];
  triggeredAt: string;
  emailStatus?: string | null;
  wppStatus?: string | null;
};

export type AiswebCloudLayer = {
  cover: string;
  heightFt: number | null;
  /** Cumulonimbus / towering cumulus indicator from METAR (CB / TCU). */
  convect?: "CB" | "TCU" | null;
  raw: string;
};

export type AiswebParsedMetar = {
  observedAt: string | null;
  windDirDeg: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  windVarFromDeg: number | null;
  windVarToDeg: number | null;
  visibilityM: number | null;
  visibilityKm: number | null;
  ceilingFt: number | null;
  clouds: AiswebCloudLayer[];
  cloudsText: string;
  weather?: string[];
  remarks?: string | null;
  cavok: boolean;
};

export type AiswebMetarTaf = {
  icao: string;
  metar: string;
  taf: string;
  parsed: AiswebParsedMetar | null;
  error?: string | null;
};

export type AiswebNotam = {
  id: string;
  number: string;
  icao: string;
  status: string;
  type: string;
  issuedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  schedule: string | null;
  text: string;
  lowerLimit: string | null;
  upperLimit: string | null;
  category: string | null;
  qCode: string | null;
  airportName: string | null;
  city: string | null;
  uf: string | null;
};

export type AiswebSupplement = {
  id: string;
  number: string;
  serie: string | null;
  n: string | null;
  icao: string;
  status: string | null;
  tipo: string | null;
  title: string | null;
  text: string;
  duration: string | null;
  validFrom: string | null;
  validTo: string | null;
  publishedAt: string | null;
  ref: string | null;
  anexo: string | null;
};

/** Aviso de Aeródromo (AD WRNG) via API REDEMET. */
export type AiswebAdWarning = {
  id: string;
  icao: string;
  fir: string | null;
  number: string | null;
  text: string;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  source: "REDEMET";
};

export type AiswebRunwayLight = {
  code: string;
  description: string | null;
};

export type AiswebRunwayThreshold = {
  ident: string;
  headingDeg: number | null;
  lights: AiswebRunwayLight[];
};

export type AiswebRunway = {
  ident: string;
  surface: string | null;
  surfaceLabel: string | null;
  lengthM: number | null;
  widthM: number | null;
  pcn: string | null;
  lights: AiswebRunwayLight[];
  thresholds: AiswebRunwayThreshold[];
};

export type AiswebFrequency = {
  service: string;
  callsign: string | null;
  frequenciesMhz: string[];
};

export type AiswebFuel = {
  text: string | null;
  hours: string | null;
  types: string[];
  category: string | null;
};

export type AiswebWorkingSchedule = {
  days: string[];
  begin: string | null;
  end: string | null;
  holidays: boolean;
};

export type AiswebWorkingHours = {
  text: string | null;
  schedules: AiswebWorkingSchedule[];
};

export type AiswebNavaid = {
  type: string;
  ident: string | null;
  frequencyMhz: string | null;
  threshold: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
};

export type AiswebDeclaredDistance = {
  rwy: string;
  toraM: number | null;
  todaM: number | null;
  asdaM: number | null;
  ldaM: number | null;
  latText: string | null;
  lngText: string | null;
};

export type AiswebRemark = {
  code: string | null;
  text: string;
};

export type AiswebComplement = {
  code: string | null;
  index: number | null;
  text: string;
};

export type AiswebSunTimes = {
  date: string | null;
  sunriseUtc: string | null;
  sunsetUtc: string | null;
  weekDay: number | null;
};

export type AiswebChart = {
  id: string;
  name: string;
  tipo: string;
  tipoDescr: string | null;
  date: string | null;
  link: string;
};

export type AiswebAirspaceRef = {
  code: string | null;
  name: string | null;
};

export type AiswebAirspace = {
  fir: AiswebAirspaceRef | null;
  tma: AiswebAirspaceRef | null;
  wms: {
    baseUrl: string;
    layers: Array<{ id: string; label: string; layer: string }>;
  };
};

export type AiswebWebcam = {
  webcamId: number;
  title: string;
  status: string;
  viewCount: number | null;
  lastUpdatedOn: string | null;
  distanceKm: number | null;
  categories: Array<{ id: string; name: string }>;
  image: {
    preview: string;
    thumbnail: string;
    icon: string;
  };
  location: {
    lat: number | null;
    lng: number | null;
    city: string | null;
    region: string | null;
    regionCode: string | null;
    country: string | null;
    countryCode: string | null;
  };
  player: {
    live: string | null;
    day: string | null;
    month: string | null;
    year: string | null;
    lifetime: string | null;
  };
  urls: {
    detail: string | null;
    provider: string | null;
  };
};

export type AiswebWebcamsResult = {
  provider: "Windy";
  attributionUrl: string;
  icao: string | null;
  airportName: string | null;
  city: string | null;
  uf: string | null;
  radiusKm: number;
  center: { lat: number; lng: number };
  total: number;
  webcams: AiswebWebcam[];
  fetchedAt: string;
  cached?: boolean;
};

export type AiswebRotaer = {
  icao: string;
  name: string | null;
  city: string | null;
  uf: string | null;
  typeOpr: string | null;
  typeUtil: string | null;
  altFt: number | null;
  fir: string | null;
  lat: number | null;
  lng: number | null;
  utcOffsetHours?: number | null;
  cityDistance?: string | null;
  fuel?: AiswebFuel | null;
  workingHours?: AiswebWorkingHours | null;
  navaids?: AiswebNavaid[];
  declaredDistances?: AiswebDeclaredDistance[];
  runways: AiswebRunway[];
  frequencies: AiswebFrequency[];
  remarks: AiswebRemark[];
  complements?: AiswebComplement[];
  error?: string | null;
};

export type AiswebAerodromeMatch = {
  icao: string;
  name: string | null;
  city: string | null;
  uf: string | null;
  status: string | null;
  score?: number;
};

export type AiswebAirportBundle = {
  icao: string;
  met: AiswebMetarTaf;
  rotaer: AiswebRotaer | null;
  notams: AiswebNotam[];
  supplements?: AiswebSupplement[];
  adWarnings?: AiswebAdWarning[];
  sun: AiswebSunTimes | null;
  charts: AiswebChart[];
  airspace?: AiswebAirspace | null;
  error?: string | null;
};

export type AiswebDashboard = {
  settings: AiswebPlatformSettings;
  watchlist: AiswebWatchlist;
  airports: AiswebAirportBundle[];
  notams: AiswebNotam[];
};

export type AiswebMinimumCheck = {
  condition: AiswebFlightCondition;
  label: string;
  ceilingOk: boolean | null;
  visibilityOk: boolean | null;
  windOk: boolean | null;
  overallOk: boolean | null;
  windLimitKt: number | null;
  crosswindLimitKt: number | null;
  reasons: string[];
};

export type AiswebWindRunwayAnalysis = {
  bestIdent: string | null;
  bestHeadingDeg: number | null;
  crosswindKt: number | null;
  headwindKt: number | null;
  isCrosswind: boolean;
  options: Array<{
    ident: string;
    headingDeg: number;
    crosswindKt: number;
    headwindKt: number;
  }>;
};

export const AISWEB_DEFAULT_MINIMUMS: AiswebOperationalMinimum[] = [
  {
    condition: "vfr_diurno",
    label: "VFR DIURNO",
    ceilingFt: 2000,
    visibilityKm: 5,
    maxWindKt: 14,
  },
  {
    condition: "vfr_noturno",
    label: "VFR NOTURNO",
    ceilingFt: 5000,
    visibilityKm: 10,
    maxWindKt: 8,
  },
  {
    condition: "aluno_solo",
    label: "ALUNO SOLO",
    ceilingFt: 5000,
    visibilityKm: 10,
    maxWindKt: 8,
  },
];

export const AISWEB_CROSSWIND_NOTE =
  "A componente de través deve ser menor ou igual à metade do vento máximo permitido.";
