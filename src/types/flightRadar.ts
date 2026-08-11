export type FlightRadarMapCenter = {
  lat: number;
  lon: number;
  zoom: number;
};

export type FlightRadarSettings = {
  trackedRegistrations: string[];
  pollIntervalSec: number;
  mapCenter: FlightRadarMapCenter;
  hasApiToken: boolean;
  updatedAt: string | null;
};

export type FlightRadarSettingsInput = {
  trackedRegistrations?: string[];
  pollIntervalSec?: number;
  mapCenter?: FlightRadarMapCenter;
  /** Only sent when updating; never returned by the API. */
  apiToken?: string;
};

export type FlightRadarLivePosition = {
  fr24Id: string;
  flight: string | null;
  callsign: string | null;
  lat: number;
  lon: number;
  track: number | null;
  alt: number | null;
  gspeed: number | null;
  vspeed: number | null;
  squawk: string | null;
  timestamp: string | null;
  source: string | null;
  hex: string | null;
  type: string | null;
  reg: string | null;
  paintedAs: string | null;
  operatingAs: string | null;
  origIata: string | null;
  origIcao: string | null;
  destIata: string | null;
  destIcao: string | null;
  eta: string | null;
};

export type FlightRadarTrackPoint = {
  timestamp: string | null;
  lat: number;
  lon: number;
  alt: number | null;
  gspeed: number | null;
  vspeed: number | null;
  track: number | null;
  squawk: string | null;
  callsign: string | null;
  source: string | null;
};

export type FlightRadarTrack = {
  fr24Id: string;
  tracks: FlightRadarTrackPoint[];
  fetchedAt: string;
};

export type FlightRadarSummary = {
  fr24Id: string;
  flight: string | null;
  callsign: string | null;
  reg: string | null;
  type: string | null;
  origIcao: string | null;
  destIcao: string | null;
  takeoff: string | null;
  landed: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  flightTime: number | null;
  flightEnded?: boolean;
};

export type FlightRadarLiveResponse = {
  positions: FlightRadarLivePosition[];
  trackedRegistrations: string[];
  fetchedAt: string;
  message?: string;
};
