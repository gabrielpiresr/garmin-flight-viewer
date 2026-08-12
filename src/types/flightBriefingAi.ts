import type { AiswebAirportBundle } from "./aisweb";
import type { FlightPlanAirspaceHit, FlightPlanRouteSummary } from "./flightPlanning";

export type FlightBriefingAiConfidence = "official" | "public_source" | "inference" | "needs_confirmation";

export type FlightBriefingAiTaskStatus = "open" | "done" | "inactive";

export type FlightBriefingAiTaskAction = "email" | "phone" | "url" | "manual";

export type FlightBriefingAiSource = {
  id: string;
  title: string;
  url: string;
  sourceType: "official" | "airport_operator" | "service_provider" | "public_web" | "aisweb" | "pilot_note";
  fetchedAt: string;
  snippet?: string;
};

export type FlightBriefingAiContact = {
  type: "email" | "phone" | "website";
  label: string;
  value: string;
  sourceIds: string[];
};

export type FlightBriefingAiAirportEnrichment = {
  icao: string;
  role: "origem" | "destino" | "alternativo";
  summary: string;
  fuel: {
    status: "available" | "not_found" | "unknown" | "needs_confirmation";
    detail: string;
    confidence: FlightBriefingAiConfidence;
    sourceIds: string[];
  };
  hangarage: {
    status: "available" | "not_found" | "unknown" | "needs_confirmation";
    detail: string;
    confidence: FlightBriefingAiConfidence;
    sourceIds: string[];
  };
  slotPpr: {
    required: boolean | null;
    detail: string;
    confidence: FlightBriefingAiConfidence;
    sourceIds: string[];
  };
  contacts: FlightBriefingAiContact[];
  notes: string[];
};

export type FlightBriefingAiTask = {
  id: string;
  airportIcao?: string;
  title: string;
  description: string;
  action: FlightBriefingAiTaskAction;
  status: FlightBriefingAiTaskStatus;
  priority: "high" | "medium" | "low";
  dueHint?: string;
  contact?: FlightBriefingAiContact;
  providers?: FlightBriefingAiContact[];
  url?: string;
  suggestedText?: string;
  sourceIds: string[];
  pilotNote: string;
  updatedAt: string;
};

export type FlightBriefingAiWarning = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  sourceIds: string[];
};

export type FlightBriefingAiReport = {
  id?: string;
  status: "ready" | "fallback" | "failed";
  model: string;
  generatedAt: string;
  route: {
    origin: string;
    destination: string;
    alternates: string[];
  };
  summary: string;
  warnings: FlightBriefingAiWarning[];
  airports: FlightBriefingAiAirportEnrichment[];
  tasks: FlightBriefingAiTask[];
  sources: FlightBriefingAiSource[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    webSearchCalls?: number;
  };
  error?: string;
};

export type FlightBriefingAiGenerateInput = {
  clientReportId?: string;
  origin: string;
  destination: string;
  alternates: string[];
  airports: Array<{
    role: "origem" | "destino" | "alternativo";
    icao: string;
    bundle: AiswebAirportBundle;
    note?: string;
  }>;
  routeSummary: FlightPlanRouteSummary | null;
  airspaces: FlightPlanAirspaceHit[];
  cruiseSpeedKt: number | null;
  fuelBurnPerHour: number | null;
  fuelUnit: string;
  routeText: string;
};

export type FlightBriefingAiGenerateResult = {
  reportId?: string;
  report: FlightBriefingAiReport;
};
