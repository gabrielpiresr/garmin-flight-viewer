import type { AiswebAirportBundle } from "./aisweb";

export type FlightPlanInfoSection =
  | "detalhes"
  | "frequencias"
  | "notams"
  | "suplementos"
  | "meteorologia"
  | "sol"
  | "cartas"
  | "rmk"
  | "compl";

export const FLIGHT_PLAN_INFO_OPTIONS: Array<{
  id: FlightPlanInfoSection;
  label: string;
  description: string;
}> = [
  { id: "detalhes", label: "Detalhes ROTAER", description: "Nome, elevação, pistas, combustível, horários" },
  { id: "frequencias", label: "Frequências", description: "COM / ATS do ROTAER" },
  { id: "rmk", label: "RMK", description: "Observações (remarks) do ROTAER" },
  { id: "compl", label: "COMPL", description: "Complementos do ROTAER" },
  { id: "notams", label: "NOTAMs", description: "NOTAMs ativos do aeródromo" },
  { id: "suplementos", label: "Suplementos AIP", description: "Suplementos em vigor" },
  { id: "meteorologia", label: "Meteorologia", description: "METAR / TAF" },
  { id: "sol", label: "Nascer / Pôr do sol", description: "Horários solares UTC" },
  { id: "cartas", label: "Cartas", description: "Lista de cartas AIP disponíveis" },
];

export type FlightPlanWaypoint = {
  raw: string;
  lat: number;
  lng: number;
  label: string;
  kind?: "origin" | "destination" | "fix" | "airport";
};

export type FlightPlanRouteSummary = {
  waypoints: FlightPlanWaypoint[];
  distanceM: number;
  distanceNm: number;
  eteHours: number | null;
  fuelEstimate: number | null;
};

export type FlightPlanAirspaceFrequency = {
  service: string;
  mhz: string;
};

export type FlightPlanAirspaceHit = {
  type: "CTA" | "TMA" | "CTR" | "ATZ";
  ident: string;
  name: string;
  lower: string | null;
  upper: string | null;
  fir: string | null;
  /** Distance along route (NM) where the route first enters this airspace. */
  entryDistanceNm?: number | null;
  frequencies?: FlightPlanAirspaceFrequency[];
};

export type FlightPlanAirportRole = "origem" | "destino" | "alternativo";

export type FlightPlanAirportSlot = {
  role: FlightPlanAirportRole;
  icao: string;
  bundle: AiswebAirportBundle | null;
  loading?: boolean;
  error?: string | null;
};
