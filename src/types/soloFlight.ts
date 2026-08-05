export type SoloFlightRequestType = "primeiro_circuito_solo" | "voo_solo";

export type SoloFlightStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "auto_approved"
  | "rejected";

export type SoloFlightCriterionKind = "automatic" | "manual" | "metar";

export type SoloFlightCheckResult = {
  id: string;
  label: string;
  kind: SoloFlightCriterionKind;
  enabled: boolean;
  applicable: boolean;
  ok: boolean | null;
  flag: boolean;
  details: string;
  value?: unknown;
};

export type SoloFlightFlag = {
  id: string;
  label: string;
  details: string;
  severity: "warning" | "critical";
};

export type SoloFlightEndorsement = {
  id: string;
  studentUserId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  version: number;
  active: boolean;
  notes: string;
  uploadedBy: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  fileUrl: string;
};

export type SoloFlightManualCheck = {
  id: string;
  label: string;
  checked: boolean;
  notApplicable?: boolean;
};

export type SoloFlightEvaluationInput = {
  studentUserId: string;
  requestType: SoloFlightRequestType;
  sourceFlightId?: string | null;
  flightDate?: string;
  startTime?: string;
  cutoffTime?: string;
  originIcao?: string;
  destinationIcaos: string[];
  alternateIcaos: string[];
  manualChecks: SoloFlightManualCheck[];
};

export type SoloFlightEvaluation = {
  student: {
    userId: string;
    fullName: string;
    nickname: string;
    birthDate: string;
    phone: string;
  } | null;
  instructor: {
    userId: string;
    fullName: string;
    nickname: string;
    phone: string;
  } | null;
  endorsement: SoloFlightEndorsement | null;
  requestSnapshot: {
    studentUserId: string;
    instructorUserId: string;
    requestType: SoloFlightRequestType;
    sourceFlightId: string | null;
    flightDate: string;
    startTime: string;
    cutoffTime: string;
    originIcao: string;
    destinationIcaos: string[];
    alternateIcaos: string[];
    route: string;
  };
  automaticChecks: SoloFlightCheckResult[];
  manualChecks: SoloFlightCheckResult[];
  metarChecks: SoloFlightCheckResult[];
  flags: SoloFlightFlag[];
  status: "pending_approval" | "auto_approved";
};

export type SoloFlightRequest = {
  id: string;
  studentUserId: string;
  instructorUserId: string;
  sourceFlightId: string | null;
  requestType: SoloFlightRequestType;
  flightDate: string;
  startTime: string;
  cutoffTime: string;
  originIcao: string;
  destinationIcaos: string[];
  alternateIcaos: string[];
  manualChecks: SoloFlightCheckResult[];
  automaticChecks: SoloFlightCheckResult[];
  metarChecks: SoloFlightCheckResult[];
  flags: SoloFlightFlag[];
  status: SoloFlightStatus;
  finalDecision: "approved" | "rejected" | "";
  decidedByRole: string;
  decidedByPhone: string;
  decidedByUserId: string;
  decidedAt: string;
  decisionReason: string;
  studentName: string;
  instructorName: string;
  route: string;
  wppMessages: Array<{ to: string; kind: string; messageId: string | null; sentAt: string; error?: string }>;
  createdAt: string;
  updatedAt: string;
};

export type SoloFlightDecision = {
  id: string;
  requestId: string;
  decision: "approved" | "rejected" | "ignored";
  source: "panel" | "whatsapp";
  actorUserId: string;
  actorRole: string;
  actorPhone: string;
  reason: string;
  createdAt: string;
};

export const SOLO_FLIGHT_DEFAULT_MANUAL_CHECKS: SoloFlightManualCheck[] = [
  {
    id: "endorsement_printed",
    label: "Aluno está com o endosso impresso",
    checked: false,
  },
  {
    id: "two_positive_evaluations",
    label: "Aluno avaliado positivamente por dois instrutores ou pelo coordenador",
    checked: false,
  },
  {
    id: "anac_board_private_pilot",
    label: "Piloto privado: aluno aprovado na Banca da ANAC",
    checked: false,
  },
  {
    id: "critical_positions_briefing",
    label: "Briefing mencionou posições críticas da CTR Jundiaí",
    checked: false,
  },
];
