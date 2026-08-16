export type ProvaStatus = "draft" | "published";
export type ProvaQuestionType = "mc" | "map" | "image";
export type ProvaAssignmentStatus = "pending" | "in_progress" | "submitted" | "expired";
export type ProvaAttemptStatus = "in_progress" | "submitted" | "expired";

export type ProvaMapLayerId =
  | "fir"
  | "fis"
  | "tma"
  | "cta"
  | "ctr"
  | "atz"
  | "fiz"
  | "afis"
  | "fca_ad"
  | "p"
  | "r"
  | "d"
  | "rea"
  | "reh"
  | "airports"
  | "rea_points"
  | "city_labels"
  | "corridor_labels";

export type ProvaMapBasemap = "map" | "sat" | "wac";

export type ProvaLatLng = { lat: number; lng: number };
export type ProvaPctPoint = { x: number; y: number };

export type ProvaMcOption = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type ProvaMcPayload = {
  options: ProvaMcOption[];
  correctOptionId: string;
  imageUrls: string[];
};

export type ProvaMapPayload = {
  center: ProvaLatLng;
  zoom: number;
  layersOn: Partial<Record<ProvaMapLayerId, boolean>>;
  clickArea: { type: "polygon"; latLngs: ProvaLatLng[] };
  basemap?: ProvaMapBasemap;
};

export type ProvaImagePayload = {
  imageUrl: string;
  clickArea: { type: "polygon"; pctPoints: ProvaPctPoint[] };
};

export type ProvaQuestionPayload = ProvaMcPayload | ProvaMapPayload | ProvaImagePayload;

export type Prova = {
  id: string;
  schoolId: string;
  title: string;
  description: string;
  passingPercent: number;
  timeLimitHours: number;
  status: ProvaStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProvaInput = {
  schoolId?: string;
  title: string;
  description: string;
  passingPercent: number;
  timeLimitHours: number;
  status: ProvaStatus;
};

export type ProvaCategory = {
  id: string;
  schoolId: string;
  provaId: string;
  name: string;
  order: number;
  drawCount: number;
};

export type ProvaCategoryInput = {
  schoolId?: string;
  provaId: string;
  name: string;
  order: number;
  drawCount: number;
};

export type ProvaQuestion = {
  id: string;
  schoolId: string;
  provaId: string;
  categoryId: string;
  type: ProvaQuestionType;
  title: string;
  description: string;
  order: number;
  payload: ProvaQuestionPayload;
};

export type ProvaQuestionInput = {
  schoolId?: string;
  provaId: string;
  categoryId: string;
  type: ProvaQuestionType;
  title: string;
  description: string;
  order: number;
  payload: ProvaQuestionPayload;
};

export type ProvaSanitizedQuestion = {
  id: string;
  categoryId: string;
  categoryName: string;
  type: ProvaQuestionType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
};

export type ProvaStudentAnswer =
  | { type: "mc"; optionId: string | null }
  | { type: "map"; latLng: ProvaLatLng | null }
  | { type: "image"; pctPoint: ProvaPctPoint | null };

export type ProvaQuestionResult = {
  questionId: string;
  correct: boolean;
  answer: ProvaStudentAnswer | null;
  correctReveal: Record<string, unknown> | null;
};

export type ProvaAssignment = {
  id: string;
  schoolId: string;
  provaId: string;
  provaTitle: string;
  provaDescription: string;
  passingPercent: number;
  timeLimitHours: number;
  studentUserId: string;
  studentName: string;
  releasedAt: string;
  expiresAt: string;
  status: ProvaAssignmentStatus;
  attemptId: string | null;
  scorePercent: number | null;
  passed: boolean | null;
};

export type ProvaAttempt = {
  id: string;
  schoolId: string;
  assignmentId: string;
  provaId: string;
  studentUserId: string;
  status: ProvaAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string;
  questions: ProvaSanitizedQuestion[];
  answers: Record<string, ProvaStudentAnswer>;
  results: ProvaQuestionResult[] | null;
  scorePercent: number | null;
  passed: boolean | null;
};

export type ProvaBankCard = Prova & {
  categoryCount: number;
  questionCount: number;
  drawTotal: number;
};

export const PROVA_MAP_LAYER_DEFS: Array<{
  id: ProvaMapLayerId;
  label: string;
  group: "airspace" | "routes" | "features";
  defaultOn: boolean;
}> = [
  { id: "fir", label: "FIR", group: "airspace", defaultOn: false },
  { id: "fis", label: "FIS", group: "airspace", defaultOn: false },
  { id: "tma", label: "TMA", group: "airspace", defaultOn: true },
  { id: "cta", label: "CTA", group: "airspace", defaultOn: false },
  { id: "ctr", label: "CTR", group: "airspace", defaultOn: true },
  { id: "atz", label: "ATZ", group: "airspace", defaultOn: true },
  { id: "fiz", label: "FIZ", group: "airspace", defaultOn: false },
  { id: "afis", label: "AFIS", group: "airspace", defaultOn: false },
  { id: "fca_ad", label: "FCA AD", group: "airspace", defaultOn: false },
  { id: "p", label: "Proibida", group: "airspace", defaultOn: false },
  { id: "r", label: "Restrita", group: "airspace", defaultOn: false },
  { id: "d", label: "Perigosa", group: "airspace", defaultOn: false },
  { id: "rea", label: "REA", group: "routes", defaultOn: true },
  { id: "reh", label: "REH", group: "routes", defaultOn: false },
  { id: "corridor_labels", label: "Nomes dos corredores", group: "routes", defaultOn: true },
  { id: "airports", label: "Aeroportos", group: "features", defaultOn: true },
  { id: "rea_points", label: "Pontos REA", group: "features", defaultOn: true },
  { id: "city_labels", label: "Cidades", group: "features", defaultOn: true },
];

export function defaultProvaMapLayersOn(): Record<ProvaMapLayerId, boolean> {
  return Object.fromEntries(PROVA_MAP_LAYER_DEFS.map((layer) => [layer.id, layer.defaultOn])) as Record<
    ProvaMapLayerId,
    boolean
  >;
}

export function newMcOptionId(): string {
  return `opt_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyMcPayload(): ProvaMcPayload {
  const a = newMcOptionId();
  const b = newMcOptionId();
  return {
    options: [
      { id: a, text: "Alternativa A" },
      { id: b, text: "Alternativa B" },
    ],
    correctOptionId: a,
    imageUrls: [],
  };
}

export function emptyMapPayload(): ProvaMapPayload {
  return {
    center: { lat: -23.55, lng: -46.63 },
    zoom: 8,
    layersOn: defaultProvaMapLayersOn(),
    clickArea: { type: "polygon", latLngs: [] },
    basemap: "map",
  };
}

export function emptyImagePayload(): ProvaImagePayload {
  return {
    imageUrl: "",
    clickArea: { type: "polygon", pctPoints: [] },
  };
}
