import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { buildAerodromeOptions, listAerodromes, type AerodromeOption } from "../lib/aerodromesDb";
import { SCHOOL_ID } from "../lib/appwrite";
import { listAircrafts } from "../lib/aircraftDb";
import { getModelById } from "../lib/aircraftModelsDb";
import { exportFlightFichaPdf } from "../lib/flightFichaPdf";
import { invalidateFlightListDisplayCache } from "../lib/flightListDisplayCache";
import {
  decodeFlightRecord,
  encodeFlightRecord,
  type FlightRecordMeta,
  type FlightRecordTelemetryFile,
} from "../lib/flightRecordCodec";
import { buildFlightTelemetryMetrics, deriveIdentity } from "../lib/flightTelemetryMetrics";
import {
  FLIGHT_STATUS_OPTIONS,
  getSavedFlight,
  insertFlight,
  normalizeFlightStatus,
  updateFlight,
  updateFlightWeightBalance,
  type FlightStatus,
} from "../lib/flightsDb";
import { renderMarkdownBlocks } from "../lib/markdown";
import { dispatchNotificationEvent } from "../lib/notificationsDb";
import { parseGarminCsv } from "../lib/parseGarminCsv";
import { getProfile, listAssignableStudents, type PilotProfile, type StudentOption } from "../lib/rbac";
import { listTrainingExercises } from "../lib/trainingExercisesDb";
import { buildTrainingSnapshot, listStudentTrainingTracks } from "../lib/trainingTracksDb";
import { computeFlightEventTimes, computeScheduledBlockTimes } from "../lib/flightLogbookTimes";
import {
  aircraftToWeightBalanceSnapshot,
  buildWeightBalanceMeta,
  formatNumber,
  parseNullableNumber,
  toInputValue,
  type FlightWeightBalanceMeta,
  type FuelQuantityUnit,
  type WeightBalanceAircraftSnapshot,
  type WeightBalanceFuelInput,
} from "../lib/weightBalance";
import type { Aircraft } from "../types/admin";
import type { ExerciseGrade, FlightExerciseGrade, TrainingExercise } from "../types/trainingExercise";
import type { StudentTrainingTrack, TrainingSelectionSnapshot } from "../types/trainingTrack";
import { useToast } from "./ui/ToastProvider";

const DEFAULT_BRIEFING =
  "Tipo de voo: DC - Aluno deverá estudar as manobras a serem realizadas, repassando verbalmente os procedimentos, antes de iniciar o voo. O voo deverá ser realizado na área de manobras ou área adequada de acordo com o INVA, que também verificará planos de contingência.";
const DEFAULT_DANGER = "Sem perigos a serem reportados.";
const DEFAULT_RISK = "Sem riscos a serem reportados.";
const DEFAULT_RISK_MANAGEMENT = "Não houveram quaisquer riscos na instrução prática.";
const DEFAULT_APPROVED_TEXT = "Aluno e Voo foram considerados dentro dos padrões na instrução prática.";

const NO_DISCREPANCY = "Sem discrepâncias";
const NO_OCCURRENCE = "Sem ocorrências";
const OCCURRENCE_TEMPLATE = `* Data e Hora (UTC): 
* Local:
* Qualificação civil das pessoas envolvidas:
* Descrição dos fatos: `;

const FLIGHT_NATURE_OPTIONS = [
  ["AE", "autorização especial"],
  ["CQ", "exame prático de proficiência"],
  ["EX", "experiência"],
  ["NR", "voo não regular"],
  ["RE", "voo regular"],
  ["PV", "caráter privado"],
  ["SA", "serviço aéreo especializado"],
  ["TN", "treinamento"],
  ["TR", "traslado da aeronave"],
] as const;

const DISCREPANCY_OPTIONS = [
  NO_DISCREPANCY,
  "00 General",
  "01 Maintenance Policy",
  "02 Operations",
  "03 Support",
  "04 Airworthiness Limitations",
  "05 Time Limits / Maintenance Checks",
  "06 Dimensions and Areas",
  "07 Lifting and Shoring",
  "08 Leveling and Weighing",
  "09 Towing and Taxiing",
  "10 Parking, Mooring, Storage and Return to Service",
  "11 Placards and Markings",
  "12 Servicing",
  "13 Hardware and General Tools",
  "14 Hardware",
  "15 Aircrew Information",
  "16 Change of Role",
  "17 Auxiliary Equipment",
  "18 Vibration and Noise Analysis",
  "19 Reserved / Miscellaneous",
  "20 Standard Practices - Airframe",
  "21 Air Conditioning / Pressurization",
  "22 Auto Flight",
  "23 Communications",
  "24 Electrical Power",
  "25 Equipment / Furnishings",
  "26 Fire Protection",
  "27 Flight Controls",
  "28 Fuel",
  "29 Hydraulic Power",
  "30 Ice and Rain Protection",
  "31 Indicating / Recording Systems",
  "32 Landing Gear",
  "33 Lights",
  "34 Navigation",
  "35 Oxygen",
  "36 Pneumatic",
  "37 Vacuum",
  "38 Water / Waste",
  "39 Electrical / Electronic Panels and Multipurpose Components",
  "40 Multisystem",
  "41 Water Ballast",
  "42 Integrated Modular Avionics",
  "43 Unassigned / not commonly used",
  "44 Cabin Systems",
  "45 Central Maintenance System",
  "46 Information Systems",
  "47 Nitrogen Generation System",
  "48 In-Flight Fuel Dispensing",
  "49 Airborne Auxiliary Power",
  "50 Cargo and Accessory Compartments",
  "51 Standard Practices and Structures - General",
  "52 Doors",
  "53 Fuselage",
  "54 Nacelles / Pylons",
  "55 Stabilizers",
  "56 Windows",
  "57 Wings",
  "58 Unassigned",
  "59 Reserved for Airline Use",
  "60 Standard Practices - Propeller / Rotor",
  "61 Propellers / Propulsion",
  "62 Main Rotor",
  "63 Main Rotor Drive",
  "64 Tail Rotor",
  "65 Tail Rotor Drive",
  "66 Folding Blades / Pylon",
  "67 Rotors Flight Control",
  "68 Reserved / not commonly used",
  "69 Reserved / not commonly used",
  "70 Standard Practices - Engine",
  "71 Power Plant",
  "72 Engine",
  "73 Engine Fuel and Control",
  "74 Ignition",
  "75 Air",
  "76 Engine Controls",
  "77 Engine Indicating",
  "78 Exhaust",
  "79 Oil",
  "80 Starting",
  "81 Turbines",
  "82 Engine Water Injection",
  "83 Accessory Gearboxes",
  "84 Propulsion Augmentation",
  "85 Fuel Cell Systems",
  "91 Charts",
  "92 Electrical System Installation",
  "95 Crew Escape and Safety",
  "97 Wiring Reporting",
  "115 Flight Simulator Systems",
] as const;

const OCCURRENCE_OPTIONS = [NO_OCCURRENCE, "HTSAN", "AVSEC", "PBSEC", "OTR"] as const;

function normalizeFlightNature(value?: string | null): string {
  const raw = (value ?? "").trim();
  const code = raw.slice(0, 2).toUpperCase();
  if (FLIGHT_NATURE_OPTIONS.some(([optionCode]) => optionCode === code)) return code;
  const lower = raw.toLowerCase();
  if (lower.includes("instru") || lower.includes("trein")) return "TN";
  if (lower.includes("priv")) return "PV";
  return "TN";
}

function normalizeDiscrepancyCode(value?: string | null, detail?: string | null): string {
  const raw = (value ?? "").trim();
  if (raw && DISCREPANCY_OPTIONS.includes(raw as (typeof DISCREPANCY_OPTIONS)[number])) return raw;
  const text = (detail ?? "").trim();
  const lower = text.toLowerCase();
  const isLegacyEmpty = lower.includes("constatado") && lower.includes("discrep");
  return text && text !== NO_DISCREPANCY && !isLegacyEmpty ? "00 General" : NO_DISCREPANCY;
}

function normalizeOccurrenceCode(value?: string | null, detail?: string | null): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (OCCURRENCE_OPTIONS.includes(raw as (typeof OCCURRENCE_OPTIONS)[number])) return raw;
  return (detail ?? "").trim() ? "OTR" : NO_OCCURRENCE;
}

function normalizeTrainingMissionIds(input: { missionIds?: string[]; legacyMissionId?: string | null }): string[] {
  return Array.from(new Set([...(input.missionIds ?? []), input.legacyMissionId ?? ""].map((id) => id.trim()).filter(Boolean)));
}

const BOARD_ROLE_OPTIONS = [
  "Instrutor de voo",
  "Piloto em Comando",
  "Piloto em Instrução",
  "Instrutor de voo em solo",
  "Co-piloto Single Pilot",
  "Co-piloto Single Pilot com co-piloto, por questão regulamentar",
  "Co-piloto Dual Pilot",
] as const;

type LegDraft = {
  id: string;
  date: string;
  role: string;
  studentRole: string;
  instructorRole: string;
  dep: string;
  arr: string;
  landings: number;
  flightTime: string;
  navTime: string;
  ifrTime: string;
  nightTime: string;
  serviceTime: string;
  distance: string;
};

type Props = {
  initialFlightId?: string;
  embedded?: boolean;
  initialStepId?: NovoVooStepId;
  hideStepMenu?: boolean;
  onCancel?: () => void;
  onPublished?: (id: string) => void;
  instructorAlreadySigned?: boolean;
  onSaveAndSign?: () => void;
};

const STEPS = [
  { id: "dados", label: "Dados do voo" },
  { id: "pre-voo", label: "Pré voo" },
  { id: "peso-balanceamento", label: "Peso e balanceamento" },
  { id: "pernas", label: "Pernas" },
  { id: "exercicios", label: "Exercícios" },
  { id: "risco", label: "Risco e parecer" },
] as const;
export type NovoVooStepId = (typeof STEPS)[number]["id"];

const GRADE_OPTIONS: ExerciseGrade[] = ["NO", "1", "2", "3", "4"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyLeg(date = todayIso()): LegDraft {
  return {
    id: crypto.randomUUID(),
    date,
    role: "Instrutor de voo",
    studentRole: "Piloto em Instrução",
    instructorRole: "Instrutor de voo",
    dep: "",
    arr: "",
    landings: 0,
    flightTime: "",
    navTime: "",
    ifrTime: "",
    nightTime: "",
    serviceTime: "",
    distance: "",
  };
}

function parseDurationToMinutes(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) {
    const h = Number(hhmm[1] ?? "0");
    const m = Number(hhmm[2] ?? "0");
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
    return 0;
  }
  const decimal = Number(raw.replace(",", "."));
  if (Number.isFinite(decimal) && decimal > 0) return Math.round(decimal * 60);
  return 0;
}

function formatMinutes(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || minutes <= 0) return "";
  const h = Number(match[1] ?? "0");
  const m = Number(match[2] ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + Math.round(minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function scheduleSignature(date: string, startTime: string, durationMinutes: number): string {
  return `${date}|${startTime}|${addMinutesToTime(startTime, durationMinutes)}`;
}

/** Horário do dia (partida/corte) — HH:MM local, 00:00–23:59. */
function normalizeClockTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  const hh = Math.min(23, Math.max(0, Number(digits.slice(0, 2)) || 0));
  if (digits.length === 3) {
    return `${String(hh).padStart(2, "0")}:${digits[2]}`;
  }
  const mm = Math.min(59, Math.max(0, Number(digits.slice(2, 4)) || 0));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Duração em pernas — HH:MM (ex.: 01:00 = 1 h de voo); horas podem passar de 23. */
function normalizeDurationInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  const hh = Math.max(0, Number(digits.slice(0, 2)) || 0);
  if (digits.length === 3) {
    return `${String(hh).padStart(2, "0")}:${digits[2]}`;
  }
  const mm = Math.min(59, Math.max(0, Number(digits.slice(2, 4)) || 0));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function isExerciseGrade(value: unknown): value is ExerciseGrade {
  return value === "NO" || value === "1" || value === "2" || value === "3" || value === "4";
}

function normalizeSavedExercises(value: unknown): FlightExerciseGrade[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => {
      const item = row as Partial<FlightExerciseGrade>;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!title) return null;
      return {
        exerciseId: typeof item.exerciseId === "string" && item.exerciseId ? item.exerciseId : `legacy-${index + 1}`,
        title,
        acceptableProficiency:
          typeof item.acceptableProficiency === "string" ? item.acceptableProficiency.trim() : "",
        grade: isExerciseGrade(item.grade) ? item.grade : null,
        order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : index + 1,
      } satisfies FlightExerciseGrade;
    })
    .filter((item): item is FlightExerciseGrade => Boolean(item))
    .sort((a, b) => a.order - b.order);
}

function mergeExerciseGrades(
  catalog: TrainingExercise[],
  saved: FlightExerciseGrade[],
): FlightExerciseGrade[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const usedIds = new Set<string>();
  const mergedSaved = saved.map((exercise) => {
    const catalogExercise = byId.get(exercise.exerciseId);
    if (catalogExercise) usedIds.add(catalogExercise.id);
    return {
      exerciseId: exercise.exerciseId,
      title: catalogExercise?.title ?? exercise.title,
      acceptableProficiency: catalogExercise?.acceptableProficiency ?? exercise.acceptableProficiency,
      grade: isExerciseGrade(exercise.grade) ? exercise.grade : null,
      order: catalogExercise?.order ?? exercise.order,
    } satisfies FlightExerciseGrade;
  });
  const newCatalogRows = catalog
    .filter((exercise) => exercise.isActive && !usedIds.has(exercise.id))
    .map((exercise) => ({
      exerciseId: exercise.id,
      title: exercise.title,
      acceptableProficiency: exercise.acceptableProficiency,
      grade: "4" as ExerciseGrade,
      order: exercise.order,
    }) satisfies FlightExerciseGrade);
  return [...mergedSaved, ...newCatalogRows].sort((a, b) => a.order - b.order);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToEditableHtml(markdown: string): string {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      html.push(`<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`);
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      html.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (!line.trim()) {
      html.push("<div><br></div>");
      i++;
      continue;
    }
    html.push(`<div>${escapeHtml(line)}</div>`);
    i++;
  }

  let joined = html.join("");
  joined = joined
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return joined || "<div><br></div>";
}

function htmlToMarkdownFromEditor(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";

  function parseInline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") return `**${Array.from(node.childNodes).map(parseInline).join("")}**`;
    if (tag === "em" || tag === "i") return `*${Array.from(node.childNodes).map(parseInline).join("")}*`;
    if (tag === "br") return "\n";
    return Array.from(node.childNodes).map(parseInline).join("");
  }

  const out: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (!(child instanceof HTMLElement)) {
      const text = parseInline(child).trim();
      if (text) out.push(text);
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const lis = Array.from(child.querySelectorAll(":scope > li"));
      lis.forEach((li, idx) => {
        const text = Array.from(li.childNodes).map(parseInline).join("").trim();
        out.push(tag === "ul" ? `- ${text}` : `${idx + 1}. ${text}`);
      });
      continue;
    }
    const text = Array.from(child.childNodes).map(parseInline).join("").trim();
    out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function MarkdownField({
  label,
  value,
  onChange,
  required = false,
  minRows = 4,
  disabled = false,
  quickActionLabel,
  quickActionValue,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  minRows?: number;
  disabled?: boolean;
  quickActionLabel?: string;
  quickActionValue?: string;
}) {
  if (disabled) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
          {required ? " *" : ""}
        </p>
        <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-2 text-sm">
          {renderMarkdownBlocks(value || "Sem conteúdo.")}
        </div>
      </div>
    );
  }

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const current = ref.current;
    if (!current) return;
    const nextHtml = markdownToEditableHtml(value);
    if (current.innerHTML !== nextHtml) current.innerHTML = nextHtml;
  }, [value]);

  const runCommand = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
    const html = ref.current?.innerHTML ?? "";
    onChange(htmlToMarkdownFromEditor(html));
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
          {required ? " *" : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => runCommand("bold")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Negrito
        </button>
        <button
          type="button"
          onClick={() => runCommand("italic")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Itálico
        </button>
        <button
          type="button"
          onClick={() => runCommand("insertUnorderedList")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Bullet
        </button>
        <button
          type="button"
          onClick={() => runCommand("insertOrderedList")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Number
        </button>
        {quickActionLabel && quickActionValue ? (
          <button
            type="button"
            onClick={() => onChange(quickActionValue)}
            className="rounded border border-emerald-600/40 bg-emerald-600/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-600/30"
          >
            {quickActionLabel}
          </button>
        ) : null}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(htmlToMarkdownFromEditor(ref.current?.innerHTML ?? ""))}
        onKeyDown={(e) => {
          if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
            e.preventDefault();
            runCommand("bold");
          }
          if (e.ctrlKey && (e.key === "i" || e.key === "I")) {
            e.preventDefault();
            runCommand("italic");
          }
        }}
        className="min-h-[7rem] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
        style={{ whiteSpace: "pre-wrap", minHeight: `${Math.max(4, minRows) * 1.6}rem` }}
      />
    </div>
  );
}

export function NovoVooFlow({ initialFlightId, embedded = false, initialStepId, hideStepMenu = false, onCancel, onPublished, instructorAlreadySigned = false, onSaveAndSign }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentProfilesById, setStudentProfilesById] = useState<Record<string, { name: string; anac: string; email: string }>>({});
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PilotProfile | null>(null);
  const [instructorProfile, setInstructorProfile] = useState<PilotProfile | null>(null);
  const [loadedInstructorName, setLoadedInstructorName] = useState("");
  const [loadedInstructorAnac, setLoadedInstructorAnac] = useState("");
  const [loadedInstructorWeightKg, setLoadedInstructorWeightKg] = useState<number | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [aircraftLoading, setAircraftLoading] = useState(false);
  const [aerodromesLoading, setAerodromesLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(initialFlightId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [flightId, setFlightId] = useState<string | null>(null);
  const [originalScheduleSignature, setOriginalScheduleSignature] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(() => {
    const initialIndex = STEPS.findIndex((step) => step.id === initialStepId);
    return initialIndex >= 0 ? initialIndex : 0;
  });

  const [studentId, setStudentId] = useState("");
  const [studentLabel, setStudentLabel] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [flightDate, setFlightDate] = useState(todayIso());
  const [flightStatus, setFlightStatus] = useState<FlightStatus>("Previsto");
  const [startTime, setStartTime] = useState("");
  const [aircraft, setAircraft] = useState("");
  const [aerodromeOptions, setAerodromeOptions] = useState<AerodromeOption[]>([]);

  const [objectiveMd, setObjectiveMd] = useState("");
  const [briefingMd, setBriefingMd] = useState(DEFAULT_BRIEFING);
  const [instructorSuggestionMd, setInstructorSuggestionMd] = useState("");
  const [studentSuggestionMd, setStudentSuggestionMd] = useState("");
  const [scheduleMeta, setScheduleMeta] = useState<FlightRecordMeta["schedule"]>(undefined);
  const [studentTracks, setStudentTracks] = useState<StudentTrainingTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [trainingTrackId, setTrainingTrackId] = useState("");
  const [trainingMissionIds, setTrainingMissionIds] = useState<string[]>([]);

  const [legs, setLegs] = useState<LegDraft[]>([emptyLeg(flightDate)]);
  const [exerciseCatalog, setExerciseCatalog] = useState<TrainingExercise[]>([]);
  const [exerciseGrades, setExerciseGrades] = useState<FlightExerciseGrade[]>([]);
  const [exercisesLoading, setExercisesLoading] = useState(false);
  const exerciseCatalogRef = useRef<TrainingExercise[]>([]);

  const [wbPersonsOnBoard, setWbPersonsOnBoard] = useState("2");
  const [wbOccupantsWeight, setWbOccupantsWeight] = useState("");
  const [wbBaggageWeight, setWbBaggageWeight] = useState("");
  const [wbRampFuelValue, setWbRampFuelValue] = useState("");
  const [wbRampFuelUnit, setWbRampFuelUnit] = useState<FuelQuantityUnit>("l");
  const [wbTaxiFuelValue, setWbTaxiFuelValue] = useState("");
  const [wbTaxiFuelUnit, setWbTaxiFuelUnit] = useState<FuelQuantityUnit>("l");
  const [wbTripFuelValue, setWbTripFuelValue] = useState("");
  const [wbTripFuelUnit, setWbTripFuelUnit] = useState<FuelQuantityUnit>("l");
  const [savedWeightBalanceAircraft, setSavedWeightBalanceAircraft] = useState<WeightBalanceAircraftSnapshot | null>(null);

  const [flightNature, setFlightNature] = useState("TN");
  const [cargo, setCargo] = useState("Sem transporte de carga");
  const [engineCutoffTime, setEngineCutoffTime] = useState("");
  const [discrepancyCode, setDiscrepancyCode] = useState(NO_DISCREPANCY);
  const [discrepancies, setDiscrepancies] = useState("");
  const [occurrenceCode, setOccurrenceCode] = useState(NO_OCCURRENCE);
  const [occurrences, setOccurrences] = useState("");
  const [fuelConsumptionLph, setFuelConsumptionLph] = useState<number | null>(null);

  const [commentsMd, setCommentsMd] = useState("");
  const [dangerMd, setDangerMd] = useState(DEFAULT_DANGER);
  const [riskMd, setRiskMd] = useState(DEFAULT_RISK);
  const [managementMd, setManagementMd] = useState(DEFAULT_RISK_MANAGEMENT);
  const [instructorOpinionMd, setInstructorOpinionMd] = useState("");

  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [telemetryCsv, setTelemetryCsv] = useState("");
  const [telemetryFiles, setTelemetryFiles] = useState<FlightRecordTelemetryFile[]>([]);

  const isInstructorFlow = user?.role === "instrutor" || user?.role === "admin";
  const canEdit = isInstructorFlow && !instructorAlreadySigned;
  const canEditWeightBalance = canEdit || (user?.role === "aluno" && Boolean(initialFlightId));

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (savedMessage) showToast({ variant: "success", message: savedMessage });
  }, [savedMessage, showToast]);

  useEffect(() => {
    if (!user || !isInstructorFlow) return;
    setStudentsLoading(true);
    setError(null);
    void listAssignableStudents(user.id, user.role)
      .then(async (res) => {
        setStudents(res);
        const first = res[0];
        if (!initialFlightId) {
          setStudentId(first?.userId ?? "");
          setStudentLabel(first?.email ?? "");
        }
        const profileEntries = await Promise.all(
          res.map(async (student) => {
            const { data } = await getProfile(student.userId);
            return [
              student.userId,
              {
                name: data?.fullName?.trim() || student.email,
                anac: data?.anacCode?.trim() || "",
                email: student.email,
              },
            ] as const;
          }),
        );
        const mapped = Object.fromEntries(profileEntries);
        setStudentProfilesById(mapped);
        if (!initialFlightId && first?.userId && mapped[first.userId]?.name) {
          setStudentLabel(mapped[first.userId]!.name);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setStudentsLoading(false));
  }, [initialFlightId, isInstructorFlow, user]);

  useEffect(() => {
    if (!user?.id) return;
    void getProfile(user.id).then(({ data }) => setInstructorProfile(data));
  }, [user?.id]);

  useEffect(() => {
    const schoolId = SCHOOL_ID ?? "escola_principal";
    setAircraftLoading(true);
    void listAircrafts(schoolId)
      .then((res) => setAircrafts(res))
      .catch((e) => setError((e as Error).message))
      .finally(() => setAircraftLoading(false));
  }, []);

  useEffect(() => {
    setAerodromesLoading(true);
    void listAerodromes()
      .then((res) => setAerodromeOptions(buildAerodromeOptions(res)))
      .catch((e) => setError((e as Error).message))
      .finally(() => setAerodromesLoading(false));
  }, []);

  useEffect(() => {
    const schoolId = SCHOOL_ID ?? "escola_principal";
    setExercisesLoading(true);
    void listTrainingExercises({ schoolId })
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setExerciseCatalog([]);
          return;
        }
        setExerciseCatalog(res.data);
      })
      .finally(() => setExercisesLoading(false));
  }, []);

  useEffect(() => {
    exerciseCatalogRef.current = exerciseCatalog;
    if (exerciseCatalog.length === 0) return;
    setExerciseGrades((current) => mergeExerciseGrades(exerciseCatalog, current));
  }, [exerciseCatalog]);

  useEffect(() => {
    if (!studentId) {
      setSelectedProfile(null);
      setStudentTracks([]);
      return;
    }
    void getProfile(studentId).then(({ data }) => setSelectedProfile(data));
    setTracksLoading(true);
    void listStudentTrainingTracks(studentId)
      .then((result) => {
        if (result.error) {
          setError(result.error.message);
          setStudentTracks([]);
          return;
        }
        const active = result.data.filter((row) => row.status === "active" && row.track?.isActive !== false);
        setStudentTracks(active);
        setTrainingTrackId((current) => {
          if (current && active.some((row) => row.trackId === current)) return current;
          return active.find((row) => row.isPrimary)?.trackId ?? active[0]?.trackId ?? "";
        });
      })
      .finally(() => setTracksLoading(false));
  }, [studentId]);

  useEffect(() => {
    if (!initialFlightId) return;
    setLoadingExisting(true);
    void getSavedFlight(initialFlightId)
      .then(async ({ data, error: loadError }) => {
        if (loadError || !data) {
          setError(loadError?.message ?? "Não foi possível carregar a ficha.");
          return;
        }
        const instructorFromDb = data.instructor_user_id ? await getProfile(data.instructor_user_id) : null;
        const decoded = decodeFlightRecord(data.csv_text);
        const meta = decoded.meta;
        setFlightId(data.id);
        setCsvFileName(data.source_filename ?? null);
        setTelemetryCsv(decoded.telemetryCsv ?? "");
        setTelemetryFiles(decoded.telemetryFiles ?? []);

        if (!meta) {
          const loadedDate = (data.created_at ?? "").slice(0, 10) || todayIso();
          setStudentId(data.student_user_id ?? "");
          setStudentLabel("");
          setFlightDate(loadedDate);
          setFlightStatus(data.flight_status);
          setStartTime("");
          setOriginalScheduleSignature(scheduleSignature(loadedDate, "", data.duration_sec ? Math.round(data.duration_sec / 60) : 0));
          setAircraft(data.aircraft_ident ?? "");
          setTrainingTrackId(data.training_track_id ?? "");
          setTrainingMissionIds(
            normalizeTrainingMissionIds({
              legacyMissionId: data.training_mission_id,
            }),
          );
          setScheduleMeta(undefined);
          setExerciseGrades(mergeExerciseGrades(exerciseCatalogRef.current, []));
          setLoadedInstructorName(instructorFromDb?.data?.fullName?.trim() || "");
          setLoadedInstructorAnac(instructorFromDb?.data?.anacCode?.trim() || "");
          setLoadedInstructorWeightKg(instructorFromDb?.data?.weightKg ?? null);
          setSavedWeightBalanceAircraft(null);
          setFlightNature("TN");
          setDiscrepancyCode(NO_DISCREPANCY);
          setDiscrepancies("");
          setOccurrenceCode(NO_OCCURRENCE);
          setOccurrences("");
          return;
        }

        const loadedDate = meta.header.date || (data.created_at ?? "").slice(0, 10) || todayIso();
        const loadedStartTime = meta.header.departureTimeUtc ?? meta.header.startTime ?? "";
        const loadedDurationMinutes = (meta.legs ?? []).reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime || ""), 0);
        setStudentId(meta.header.studentUserId ?? data.student_user_id ?? "");
        setStudentLabel(meta.header.studentName ?? meta.header.studentLabel ?? "");
        setFlightDate(loadedDate);
        setFlightStatus(data.flight_status);
        setStartTime(loadedStartTime);
        setEngineCutoffTime(
          meta.header.engineCutoffTimeUtc ??
            (loadedStartTime && loadedDurationMinutes > 0
              ? addMinutesToTime(loadedStartTime, loadedDurationMinutes + 30)
              : ""),
        );
        setOriginalScheduleSignature(scheduleSignature(loadedDate, loadedStartTime, loadedDurationMinutes));
        setAircraft(meta.header.aircraft ?? data.aircraft_ident ?? "");
        setTrainingTrackId(meta.training?.trackId ?? data.training_track_id ?? "");
        setTrainingMissionIds(
          normalizeTrainingMissionIds({
            missionIds: meta.training?.missionIds,
            legacyMissionId: meta.training?.missionId ?? data.training_mission_id,
          }),
        );
        setObjectiveMd(meta.preFlight.objectiveMd ?? "");
        setBriefingMd(meta.preFlight.briefingMd ?? DEFAULT_BRIEFING);
        setInstructorSuggestionMd(meta.preFlight.instructorSuggestionMd ?? "");
        setStudentSuggestionMd(meta.preFlight.studentSuggestionMd ?? "");
        setScheduleMeta(meta.schedule);
        setLegs(
          meta.legs?.length
            ? meta.legs.map((leg) => {
                const legacyRole = leg.role || "Instrutor de voo";
                return ({
                id: leg.id || crypto.randomUUID(),
                date: leg.date || todayIso(),
                role: legacyRole,
                studentRole: leg.studentRole || "Piloto em Instrução",
                instructorRole: leg.instructorRole || legacyRole,
                dep: (leg.dep || "").toUpperCase(),
                arr: (leg.arr || "").toUpperCase(),
                landings: Number.isFinite(leg.landings) ? leg.landings : 0,
                flightTime: leg.flightTime || "",
                navTime: leg.navTime || "",
                ifrTime: leg.ifrTime || "",
                nightTime: leg.nightTime || "",
                serviceTime: leg.serviceTime || "",
                distance: leg.distance || "",
                });
              })
            : [emptyLeg()],
        );
        setExerciseGrades(mergeExerciseGrades(exerciseCatalogRef.current, normalizeSavedExercises(meta.exercises)));
        if (meta.weightBalance) {
          setSavedWeightBalanceAircraft(meta.weightBalance.aircraft);
          setWbPersonsOnBoard(
            meta.weightBalance.inputs.personsOnBoard != null
              ? String(meta.weightBalance.inputs.personsOnBoard)
              : "2",
          );
          setWbOccupantsWeight(toInputValue(meta.weightBalance.inputs.occupantsWeightKg));
          setWbBaggageWeight(toInputValue(meta.weightBalance.inputs.baggageWeightKg));
          setWbRampFuelValue(toInputValue(meta.weightBalance.inputs.rampFuel.value));
          setWbRampFuelUnit(meta.weightBalance.inputs.rampFuel.unit);
          setWbTaxiFuelValue(toInputValue(meta.weightBalance.inputs.taxiFuel.value));
          setWbTaxiFuelUnit(meta.weightBalance.inputs.taxiFuel.unit);
          setWbTripFuelValue(toInputValue(meta.weightBalance.inputs.tripFuel.value));
          setWbTripFuelUnit(meta.weightBalance.inputs.tripFuel.unit);
        } else {
          setSavedWeightBalanceAircraft(null);
        }
        setFlightNature(normalizeFlightNature(meta.header.flightNature));
        setCargo(meta.header.cargo ?? "Sem transporte de carga");
        const loadedDiscrepancies = meta.technicalLog?.discrepancies ?? "";
        const loadedOccurrences = meta.technicalLog?.occurrences ?? "";
        const loadedDiscrepancyCode = normalizeDiscrepancyCode(meta.technicalLog?.discrepancyCode, loadedDiscrepancies);
        setDiscrepancyCode(loadedDiscrepancyCode);
        setDiscrepancies(loadedDiscrepancyCode === NO_DISCREPANCY ? "" : loadedDiscrepancies);
        setOccurrenceCode(normalizeOccurrenceCode(meta.technicalLog?.occurrenceCode, loadedOccurrences));
        setOccurrences(loadedOccurrences);
        setCommentsMd(meta.risk.commentsMd ?? "");
        setDangerMd(meta.risk.dangerMd ?? DEFAULT_DANGER);
        setRiskMd(meta.risk.riskMd ?? DEFAULT_RISK);
        setManagementMd(meta.risk.managementMd ?? DEFAULT_RISK_MANAGEMENT);
        setInstructorOpinionMd(meta.risk.instructorOpinionMd ?? "");
        setLoadedInstructorName(
          meta.header.instructorName ||
            instructorFromDb?.data?.fullName?.trim() ||
            "",
        );
        setLoadedInstructorAnac(
          meta.header.instructorAnac ||
            instructorFromDb?.data?.anacCode?.trim() ||
            "",
        );
        setLoadedInstructorWeightKg(instructorFromDb?.data?.weightKg ?? null);
      })
      .finally(() => setLoadingExisting(false));
  }, [initialFlightId]);

  const totals = useMemo(() => {
    const sum = (selector: (leg: LegDraft) => string) =>
      legs.reduce((acc, leg) => acc + parseDurationToMinutes(selector(leg)), 0);
    return {
      landings: legs.reduce((acc, leg) => acc + (Number.isFinite(leg.landings) ? leg.landings : 0), 0),
      flightMin: sum((leg) => leg.flightTime),
      navMin: sum((leg) => leg.navTime),
      ifrMin: sum((leg) => leg.ifrTime),
      nightMin: sum((leg) => leg.nightTime),
      serviceMin: sum((leg) => leg.serviceTime),
    };
  }, [legs]);

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) => {
      const profile = studentProfilesById[student.userId];
      const name = (profile?.name ?? "").toLowerCase();
      const anac = (profile?.anac ?? "").toLowerCase();
      return name.includes(search) || anac.includes(search);
    });
  }, [studentProfilesById, studentSearch, students]);

  const selectedAircraft = useMemo(
    () => aircrafts.find((item) => item.registration === aircraft.trim()) ?? null,
    [aircraft, aircrafts],
  );
  const selectedTrainingTrack = useMemo(
    () => studentTracks.find((row) => row.trackId === trainingTrackId)?.track ?? null,
    [studentTracks, trainingTrackId],
  );
  const trainingMissions = useMemo(
    () =>
      selectedTrainingTrack?.stages.flatMap((stage) =>
        stage.missions.map((mission) => ({
          stage,
          mission,
        })),
      ) ?? [],
    [selectedTrainingTrack],
  );
  const selectedTrainingSnapshots = useMemo(
    () =>
      trainingMissionIds
        .map((missionId) => buildTrainingSnapshot(selectedTrainingTrack, missionId))
        .filter((snapshot): snapshot is TrainingSelectionSnapshot => Boolean(snapshot)),
    [selectedTrainingTrack, trainingMissionIds],
  );
  const selectedTrainingSnapshot = selectedTrainingSnapshots[0] ?? null;
  const defaultOccupantsWeightKg = useMemo(() => {
    const studentWeight = selectedProfile?.weightKg ?? null;
    const instructorWeight = initialFlightId ? loadedInstructorWeightKg : instructorProfile?.weightKg ?? null;
    const total = (studentWeight ?? 0) + (instructorWeight ?? 0);
    return total > 0 ? total : null;
  }, [initialFlightId, instructorProfile?.weightKg, loadedInstructorWeightKg, selectedProfile?.weightKg]);
  const weightBalanceAircraft = useMemo(() => {
    if (selectedAircraft) return aircraftToWeightBalanceSnapshot(selectedAircraft);
    if (savedWeightBalanceAircraft) {
      return {
        ...savedWeightBalanceAircraft,
        registration: aircraft.trim() || savedWeightBalanceAircraft.registration,
      };
    }
    return {
      ...aircraftToWeightBalanceSnapshot(null),
      registration: aircraft.trim(),
    };
  }, [aircraft, savedWeightBalanceAircraft, selectedAircraft]);
  const currentWeightBalanceMeta = useMemo<FlightWeightBalanceMeta>(
    () =>
      buildWeightBalanceMeta({
        aircraft: weightBalanceAircraft,
        inputs: {
          personsOnBoard: parseNullableNumber(wbPersonsOnBoard),
          occupantsWeightKg: parseNullableNumber(wbOccupantsWeight),
          baggageWeightKg: parseNullableNumber(wbBaggageWeight),
          rampFuel: { value: parseNullableNumber(wbRampFuelValue), unit: wbRampFuelUnit },
          taxiFuel: { value: parseNullableNumber(wbTaxiFuelValue), unit: wbTaxiFuelUnit },
          tripFuel: { value: parseNullableNumber(wbTripFuelValue), unit: wbTripFuelUnit },
        },
      }),
    [
      wbBaggageWeight,
      wbPersonsOnBoard,
      wbOccupantsWeight,
      wbRampFuelUnit,
      wbRampFuelValue,
      wbTaxiFuelUnit,
      wbTaxiFuelValue,
      wbTripFuelUnit,
      wbTripFuelValue,
      weightBalanceAircraft,
    ],
  );

  const displayInstructorName = initialFlightId ? loadedInstructorName : (instructorProfile?.fullName?.trim() || user?.email || "");
  const displayInstructorAnac = initialFlightId ? loadedInstructorAnac : (instructorProfile?.anacCode?.trim() || "");
  const displayStudentName = selectedProfile?.fullName?.trim() || studentLabel || user?.email || "";
  const displayStudentAnac = selectedProfile?.anacCode?.trim() || "";

  useEffect(() => {
    if (!selectedAircraft?.model_id) {
      setFuelConsumptionLph(null);
      return;
    }
    void getModelById(selectedAircraft.model_id).then((model) => {
      setFuelConsumptionLph(model?.fuel_consumption_lph ?? null);
    });
  }, [selectedAircraft?.model_id]);

  useEffect(() => {
    if (wbOccupantsWeight.trim() || defaultOccupantsWeightKg === null) return;
    setWbOccupantsWeight(String(defaultOccupantsWeightKg));
  }, [defaultOccupantsWeightKg, wbOccupantsWeight]);

  useEffect(() => {
    if (trainingMissionIds.length === 0) return;
    const available = new Set(trainingMissions.map((row) => row.mission.id));
    const next = trainingMissionIds.filter((missionId) => available.has(missionId));
    if (next.length !== trainingMissionIds.length) setTrainingMissionIds(next);
  }, [trainingMissionIds, trainingMissions]);

  useEffect(() => {
    if (occurrenceCode !== NO_OCCURRENCE && !occurrences.trim()) {
      setOccurrences(OCCURRENCE_TEMPLATE);
    }
    if (occurrenceCode === NO_OCCURRENCE && occurrences === OCCURRENCE_TEMPLATE) {
      setOccurrences("");
    }
  }, [occurrenceCode, occurrences]);

  const isPrevistoStatus = normalizeFlightStatus(flightStatus) === "Previsto";

  const computedEventTimes = useMemo(() => {
    if (!startTime.trim() || !engineCutoffTime.trim()) return null;
    if (isPrevistoStatus && totals.flightMin <= 0) {
      const result = computeScheduledBlockTimes({
        departureTimeUtc: startTime.trim(),
        engineCutoffTimeUtc: engineCutoffTime.trim(),
      });
      return "error" in result ? null : result;
    }
    if (totals.flightMin <= 0) return null;
    const result = computeFlightEventTimes({
      departureTimeUtc: startTime.trim(),
      engineCutoffTimeUtc: engineCutoffTime.trim(),
      totalFlightMinutes: totals.flightMin,
    });
    return "error" in result ? null : result;
  }, [engineCutoffTime, isPrevistoStatus, startTime, totals.flightMin]);

  const buildFlightMeta = (): FlightRecordMeta => {
    const timesResult = isPrevistoStatus && totals.flightMin <= 0
      ? computeScheduledBlockTimes({
          departureTimeUtc: startTime.trim(),
          engineCutoffTimeUtc: engineCutoffTime.trim(),
        })
      : computeFlightEventTimes({
          departureTimeUtc: startTime.trim(),
          engineCutoffTimeUtc: engineCutoffTime.trim(),
          totalFlightMinutes: totals.flightMin,
        });
    const eventTimes = "error" in timesResult ? null : timesResult;

    return {
    ...(scheduleMeta ? { schedule: scheduleMeta } : {}),
    ...(trainingTrackId
      ? {
          training: {
            trackId: trainingTrackId,
            stageId: selectedTrainingSnapshot?.stageId,
            missionId: selectedTrainingSnapshot?.missionId,
            missionIds: trainingMissionIds,
            snapshot: selectedTrainingSnapshot,
            snapshots: selectedTrainingSnapshots,
          },
        }
      : {}),
    header: {
      studentUserId: studentId,
      studentLabel,
      studentName: displayStudentName,
      studentAnac: displayStudentAnac,
      instructorName: displayInstructorName,
      instructorAnac: displayInstructorAnac,
      date: flightDate,
      startTime: (eventTimes?.departureTimeUtc ?? startTime).trim(),
      departureTimeUtc: eventTimes?.departureTimeUtc ?? (startTime.trim() || undefined),
      engineCutoffTimeUtc: eventTimes?.engineCutoffTimeUtc ?? (engineCutoffTime.trim() || undefined),
      takeoffTimeUtc: eventTimes?.takeoffTimeUtc,
      landingTimeUtc: eventTimes?.landingTimeUtc,
      aircraft: aircraft.trim(),
      flightNature,
      cargo,
    },
    preFlight: {
      objectiveMd: objectiveMd.trim(),
      briefingMd: briefingMd.trim(),
      instructorSuggestionMd: instructorSuggestionMd.trim(),
      studentSuggestionMd: studentSuggestionMd.trim(),
    },
    legs: legs.map((leg) => {
      const legMinutes = parseDurationToMinutes(leg.flightTime.trim());
      const fuelLiters = fuelConsumptionLph !== null && legMinutes > 0
        ? Math.round((legMinutes / 60) * fuelConsumptionLph * 10) / 10
        : null;
      return {
      id: leg.id,
      date: leg.date,
      role: leg.instructorRole || leg.role,
      studentRole: leg.studentRole,
      instructorRole: leg.instructorRole || leg.role,
      dep: leg.dep.trim().toUpperCase(),
      arr: leg.arr.trim().toUpperCase(),
      landings: Math.max(0, Math.round(leg.landings || 0)),
      flightTime: leg.flightTime.trim(),
      navTime: leg.navTime.trim(),
      ifrTime: leg.ifrTime.trim(),
      nightTime: leg.nightTime.trim(),
      serviceTime: leg.serviceTime.trim(),
      distance: leg.distance.trim(),
      fuelLiters,
      };
    }),
    exercises: exerciseGrades.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      title: exercise.title.trim(),
      acceptableProficiency: exercise.acceptableProficiency.trim(),
      grade: isExerciseGrade(exercise.grade) ? exercise.grade : null,
      order: exercise.order,
    })),
    weightBalance: {
      ...currentWeightBalanceMeta,
      updatedAt: new Date().toISOString(),
    },
    technicalLog: {
      discrepancyCode,
      discrepancies: discrepancyCode === NO_DISCREPANCY ? NO_DISCREPANCY : discrepancies.trim(),
      correctiveActions: "Somente via OS",
      occurrenceCode,
      occurrences: occurrenceCode === NO_OCCURRENCE ? "" : occurrences.trim(),
    },
    maintenanceSnapshot: null,
    risk: {
      commentsMd: commentsMd.trim(),
      dangerMd: dangerMd.trim(),
      riskMd: riskMd.trim(),
      managementMd: managementMd.trim(),
      instructorOpinionMd: instructorOpinionMd.trim(),
    },
  };
  };

  const updateLeg = (id: string, patch: Partial<LegDraft>) => {
    setLegs((prev) =>
      prev.map((leg) => {
        if (leg.id !== id) return leg;
        const updated = { ...leg, ...patch };
        const flightMin = parseDurationToMinutes(updated.flightTime);
        if (flightMin > 0) {
          const clamp = (val: string) => {
            const m = parseDurationToMinutes(val);
            return m > flightMin ? updated.flightTime : val;
          };
          updated.navTime = clamp(updated.navTime);
          updated.ifrTime = clamp(updated.ifrTime);
          updated.nightTime = clamp(updated.nightTime);
          updated.serviceTime = clamp(updated.serviceTime);
        }
        return updated;
      }),
    );
  };

  const renderAerodromeSelect = (leg: LegDraft, field: "dep" | "arr") => {
    return (
      <AerodromeCombobox
        value={leg[field]}
        options={aerodromeOptions}
        disabled={!canEdit || aerodromesLoading}
        loading={aerodromesLoading}
        onChange={(icao) => updateLeg(leg.id, { [field]: icao.toUpperCase() })}
      />
    );
  };

  const addLeg = () => setLegs((prev) => [...prev, emptyLeg(flightDate)]);

  const removeLeg = (id: string) => {
    setLegs((prev) => (prev.length <= 1 ? prev : prev.filter((leg) => leg.id !== id)));
  };

  const updateExerciseGrade = (exerciseId: string, grade: ExerciseGrade) => {
    setExerciseGrades((prev) =>
      prev.map((exercise) =>
        exercise.exerciseId === exerciseId
          ? { ...exercise, grade: exercise.grade === grade ? null : grade }
          : exercise,
      ),
    );
  };

  const persistWeightBalance = async () => {
    if (!user || !flightId) {
      setError("Salve o voo antes de atualizar peso e balanceamento.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const { error: updateErr } = await updateFlightWeightBalance(flightId, {
      actorUserId: user.id,
      actorRole: user.role,
      weightBalance: {
        ...currentWeightBalanceMeta,
        updatedAt: new Date().toISOString(),
      },
    });
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    invalidateFlightListDisplayCache([flightId]);
    setSavedMessage("Peso e balanceamento salvo.");
  };

  const persist = async (): Promise<boolean> => {
    if (!user) return false;
    if (!canEdit) {
      if (canEditWeightBalance && flightId) {
        await persistWeightBalance();
        return false;
      }
      setError("Somente instrutor/admin pode editar esta ficha.");
      return false;
    }
    if (!studentId) {
      setError("Selecione um aluno para continuar.");
      return false;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const timesCheck =
      isPrevistoStatus && totals.flightMin <= 0
        ? computeScheduledBlockTimes({
            departureTimeUtc: startTime.trim(),
            engineCutoffTimeUtc: engineCutoffTime.trim(),
          })
        : computeFlightEventTimes({
            departureTimeUtc: startTime.trim(),
            engineCutoffTimeUtc: engineCutoffTime.trim(),
            totalFlightMinutes: totals.flightMin,
          });
    if ("error" in timesCheck) {
      setSaving(false);
      setError(timesCheck.error);
      return false;
    }

    const blockMinutes = timesCheck.blockMinutes ?? 0;
    const durationSec =
      totals.flightMin > 0
        ? totals.flightMin * 60
        : blockMinutes > 0
          ? blockMinutes * 60
          : null;

    const meta = buildFlightMeta();
    const csvPayload = encodeFlightRecord({ meta, telemetryCsv, telemetryFiles });
    const parsedTelemetry = telemetryCsv.trim() ? parseGarminCsv(telemetryCsv) : null;
    const telemetryMetrics = parsedTelemetry
      ? buildFlightTelemetryMetrics({
          parsed: parsedTelemetry,
          identity: deriveIdentity({
            meta,
            studentUserId: studentId,
            instructorUserId: user.id,
            aircraftIdent: aircraft.trim() || null,
          }),
          meta,
        })
      : null;
    const payload = {
      actorUserId: user.id,
      actorRole: user.role,
      studentUserId: studentId,
      instructorUserId: user.id,
      source_filename: csvFileName ?? "manual-entry.csv",
      csv_text: csvPayload,
      aircraft_ident: aircraft.trim() || null,
      duration_sec: durationSec,
      trainingTrackId: trainingTrackId || null,
      trainingStageId: selectedTrainingSnapshot?.stageId ?? null,
      trainingMissionId: selectedTrainingSnapshot?.missionId ?? null,
      trainingSnapshot: selectedTrainingSnapshot,
      telemetryMetrics,
      telemetryAlertParsed: parsedTelemetry,
      flightStatus: normalizeFlightStatus(flightStatus),
    };
    const nextScheduleSignature = scheduleSignature(flightDate, startTime, totals.flightMin);

    if (flightId) {
      const { error: updateErr } = await updateFlight(flightId, payload);
      setSaving(false);
      if (updateErr) {
        setError(updateErr.message);
        return false;
      }
      invalidateFlightListDisplayCache([flightId]);
      void dispatchNotificationEvent({
        eventType: "flight.updated",
        flightId,
        dedupeKey: `flight.updated:${flightId}:${Date.now()}`,
        recipientUserIds: [studentId],
        actorUserId: user.id,
        data: {
          aircraft,
          flightDate,
          startTime,
          studentUserId: studentId,
        },
      });
      setOriginalScheduleSignature(nextScheduleSignature);
      onPublished?.(flightId);
      setSavedMessage("Alterações salvas.");
      return true;
    }

    const { id, error: insertErr } = await insertFlight(payload);
    setSaving(false);
    if (insertErr || !id) {
      setError(insertErr?.message ?? "Falha ao salvar voo.");
      return false;
    }
    setFlightId(id);
    invalidateFlightListDisplayCache([id]);
    void dispatchNotificationEvent({
      eventType: "flight.scheduled",
      flightId: id,
      dedupeKey: `flight.scheduled:${id}:${Date.now()}`,
      recipientUserIds: [studentId],
      actorUserId: user.id,
      data: {
        aircraft,
        flightDate,
        startTime,
        studentUserId: studentId,
      },
    });
    onPublished?.(id);
    setOriginalScheduleSignature(nextScheduleSignature);
    setSavedMessage("Voo salvo.");
    return true;
  };

  const handleExportPdf = () => {
    const result = exportFlightFichaPdf({
      meta: buildFlightMeta(),
      telemetryCsv,
      telemetryFileName: csvFileName,
    });
    if (!result.ok) setError(result.error ?? "Não foi possível exportar o PDF.");
  };

  const goNext = () => setStepIdx((idx) => Math.min(STEPS.length - 1, idx + 1));
  const goPrev = () => setStepIdx((idx) => Math.max(0, idx - 1));

  const stepId = STEPS[stepIdx]?.id;
  const weightBalanceIssues = [
    ...currentWeightBalanceMeta.results.stationIssues,
    ...currentWeightBalanceMeta.results.points.flatMap((point) => point.issues),
  ];

  if (loadingExisting) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        Carregando ficha...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{flightId ? "Ficha do voo" : "Novo voo"}</p>
            <h2 className="text-lg font-semibold text-slate-100">Fluxo de criação da ficha</h2>
          </div>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Voltar
          </button>
        </div>
      )}

      {instructorAlreadySigned && isInstructorFlow && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Ficha bloqueada — assinada pelo instrutor. Edição desabilitada.
        </div>
      )}

      {!hideStepMenu && (
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-6 gap-2">
          {STEPS.map((step, idx) => {
            const isActive = idx === stepIdx;
            const isPast = idx < stepIdx;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepIdx(idx)}
                className={`rounded-lg border px-2 py-2 text-left transition ${
                  isActive
                    ? "border-sky-500 bg-sky-600/20 text-sky-200"
                    : isPast
                      ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-200"
                      : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide">Etapa {idx + 1}</p>
                <p className="truncate text-xs font-medium" title={step.label}>{step.label}</p>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {stepId === "dados" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dados do voo</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Aluno</span>
              {!canEdit ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  {displayStudentName || "—"}
                </div>
              ) : (
                <>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou CANAC"
                  className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
                <select
                  value={studentId}
                  disabled={studentsLoading}
                  onChange={(e) => {
                    const selected = students.find((student) => student.userId === e.target.value);
                    const profile = selected ? studentProfilesById[selected.userId] : undefined;
                    setStudentId(e.target.value);
                    setStudentLabel(profile?.name || selected?.email || "");
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  {filteredStudents.length === 0 ? (
                    <option value="">
                      {studentsLoading ? "Carregando alunos..." : "Nenhum aluno encontrado"}
                    </option>
                  ) : (
                    filteredStudents.map((student) => {
                      const profile = studentProfilesById[student.userId];
                      const label = profile?.name || student.email;
                      const anac = profile?.anac ? ` - CANAC ${profile.anac}` : "";
                      return (
                        <option key={student.userId} value={student.userId}>
                          {label}{anac}
                        </option>
                      );
                    })
                  )}
                </select>
                </>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Data</span>
              <input
                type="date"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Status do voo</span>
              <select
                value={flightStatus}
                onChange={(e) => setFlightStatus(normalizeFlightStatus(e.target.value))}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              >
                {FLIGHT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Aeronave / Matrícula</span>
              {!canEdit ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                  {aircraft.trim() || "—"}
                </div>
              ) : (
                <select
                  value={aircraft}
                  onChange={(e) => setAircraft(e.target.value)}
                  disabled={aircraftLoading}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
                >
                  <option value="">{aircraftLoading ? "Carregando aeronaves..." : "Selecione"}</option>
                  {aircrafts.map((ac) => (
                    <option key={ac.id} value={ac.registration}>
                      {ac.registration}{ac.nickname ? ` - ${ac.nickname}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Natureza do voo</span>
              <select
                value={flightNature}
                onChange={(e) => setFlightNature(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              >
                {FLIGHT_NATURE_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code}, {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Carga transportada</span>
              <input
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              />
            </label>

          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3 md:grid-cols-3">
            <InfoBlock label="Nome completo" value={displayStudentName || "—"} plain />
            <InfoBlock label="Código ANAC" value={displayStudentAnac || "—"} plain />
            <InfoBlock label="Aluno selecionado" value={studentLabel || "—"} plain />
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3 md:grid-cols-2">
            <InfoBlock label="Instrutor (exibição)" value={displayInstructorName} plain />
            <InfoBlock label="CANAC instrutor (exibição)" value={displayInstructorAnac} plain />
          </div>
        </section>
      )}

      {stepId === "pre-voo" && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pré voo</p>
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs text-slate-400">
                Trilha
                <select
                  value={trainingTrackId}
                  onChange={(e) => {
                    setTrainingTrackId(e.target.value);
                    setTrainingMissionIds([]);
                  }}
                  disabled={!canEdit || tracksLoading || studentTracks.length === 0}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60"
                >
                  <option value="">{tracksLoading ? "Carregando trilhas..." : "Sem trilha"}</option>
                  {studentTracks.map((row) => (
                    <option key={row.id} value={row.trackId}>
                      {row.track?.name || row.trackId}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-slate-400">
                <div className="flex items-center justify-between gap-2">
                  <span>Missões do voo</span>
                  {trainingMissionIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTrainingMissionIds([])}
                      disabled={!canEdit}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50"
                    >
                      Limpar
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-2">
                  {trainingMissions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-500">Selecione uma trilha para ver as missões.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {trainingMissions.map(({ stage, mission }) => {
                        const checked = trainingMissionIds.includes(mission.id);
                        return (
                          <label
                            key={mission.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 transition ${
                              checked
                                ? "border-cyan-500/50 bg-cyan-500/10 text-slate-100"
                                : "border-slate-700/70 bg-slate-900/50 text-slate-400 hover:border-slate-600"
                            } ${!canEdit ? "cursor-default opacity-70" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canEdit}
                              onChange={() =>
                                setTrainingMissionIds((current) =>
                                  current.includes(mission.id)
                                    ? current.filter((missionId) => missionId !== mission.id)
                                    : [...current, mission.id],
                                )
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{mission.name}</span>
                              <span className="block text-[11px] text-slate-500">
                                {stage.name} · {mission.durationMinutes} min · {mission.type}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {selectedTrainingSnapshots.length > 0 ? (
              <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">{selectedTrainingSnapshots.length} missao(oes) anexada(s)</span>
                  <span className="text-xs text-slate-400">
                    {selectedTrainingSnapshots.reduce((acc, snapshot) => acc + snapshot.durationMinutes, 0)} min planejados
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedTrainingSnapshots.map((snapshot) => (
                    <div key={snapshot.missionId} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-100">{snapshot.missionName}</span>
                        <span className="rounded-full border border-cyan-700/60 px-2 py-0.5 text-[10px] uppercase text-cyan-300">
                          {snapshot.stageName}
                        </span>
                        <span className="text-xs text-slate-400">
                          {snapshot.durationMinutes} min · {snapshot.missionType}
                        </span>
                      </div>
                      {snapshot.maneuvers.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                          {snapshot.maneuvers.map((maneuver, idx) => (
                            <li key={`${snapshot.missionId}-${maneuver}-${idx}`}>{maneuver}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedTrainingTrack ? (
              <p className="mt-2 text-xs text-slate-500">Missões opcionais; selecione uma ou mais para anexar os dados da etapa ao voo.</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Este aluno ainda não possui trilha ativa configurada.</p>
            )}
          </div>
          <MarkdownField label="Objetivo da lição" value={objectiveMd} onChange={setObjectiveMd} disabled={!canEdit} />
          <MarkdownField
            label="Sugestão do INVA"
            value={instructorSuggestionMd}
            onChange={setInstructorSuggestionMd}
            disabled={!canEdit}
          />
          <MarkdownField
            label="Sugestão do Aluno"
            value={studentSuggestionMd}
            onChange={setStudentSuggestionMd}
            disabled={!canEdit}
          />
          <MarkdownField label="Nota do briefing" value={briefingMd} onChange={setBriefingMd} disabled={!canEdit} />
        </section>
      )}

      {stepId === "pernas" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Horários do voo (local)</p>
            <p className="mt-1 text-[11px] text-slate-500">
              O corte deve ser depois da partida no mesmo dia (ex.: partida 06:00, 1 h de voo → corte 07:00 ou mais). Decolagem e pouso são calculados com margens iguais.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Horário de partida">
                <input
                  type="text"
                  value={startTime}
                  placeholder="HH:MM"
                  disabled={!canEdit}
                  onChange={(e) => setStartTime(normalizeClockTimeInput(e.target.value))}
                  className={inputClass}
                />
              </Input>
              <Input label="Horário de corte dos motores">
                <input
                  type="text"
                  value={engineCutoffTime}
                  placeholder="HH:MM"
                  disabled={!canEdit}
                  onChange={(e) => setEngineCutoffTime(normalizeClockTimeInput(e.target.value))}
                  className={inputClass}
                />
              </Input>
              <Input label="Decolagem (calculado)">
                <div className={`${inputClass} text-slate-400`}>{computedEventTimes?.takeoffTimeUtc ?? "—"}</div>
              </Input>
              <Input label="Pouso (calculado)">
                <div className={`${inputClass} text-slate-400`}>{computedEventTimes?.landingTimeUtc ?? "—"}</div>
              </Input>
            </div>
            {startTime.trim() && engineCutoffTime.trim() && !computedEventTimes ? (
              <p className="mt-2 text-xs text-amber-400">
                {isPrevistoStatus && totals.flightMin <= 0
                  ? "Ajuste partida/corte: o corte deve ser posterior à partida (ex.: 06:00 → 07:00)."
                  : `Ajuste partida/corte: o corte deve ser posterior à partida e cobrir pelo menos ${formatMinutes(totals.flightMin)} de voo.`}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pernas</p>
            <button
              type="button"
              onClick={addLeg}
              disabled={!canEdit}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              + Adicionar perna
            </button>
          </div>

          <div className="space-y-2">
            {legs.map((leg, idx) => (
              <div key={leg.id} className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300">Perna {idx + 1}</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const canReverse = leg.dep.trim() && leg.arr.trim() && leg.dep.trim().toUpperCase() !== leg.arr.trim().toUpperCase();
                        if (!canReverse) return;
                        setLegs((prev) => {
                          const base = prev.find((x) => x.id === leg.id);
                          if (!base) return prev;
                          const reversed: LegDraft = {
                            ...base,
                            id: crypto.randomUUID(),
                            dep: base.arr,
                            arr: base.dep,
                            landings: base.landings,
                            flightTime: "",
                            navTime: "",
                            ifrTime: "",
                            nightTime: "",
                            serviceTime: "",
                          };
                          return [...prev, reversed];
                        });
                      }}
                      className="text-xs text-emerald-300 hover:underline disabled:opacity-30"
                      disabled={!canEdit || !leg.dep.trim() || !leg.arr.trim() || leg.dep.trim().toUpperCase() === leg.arr.trim().toUpperCase()}
                    >
                      Adicionar perna contrária
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLeg(leg.id)}
                      className="text-xs text-red-300 hover:underline disabled:opacity-30"
                      disabled={legs.length <= 1 || !canEdit}
                    >
                      Remover
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  <Input label="Data">
                    <input type="date" value={leg.date} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { date: e.target.value })} className={inputClass} />
                  </Input>
                  <Input label={`Função ${displayStudentAnac || "aluno"}`}>
                    <select value={leg.studentRole} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { studentRole: e.target.value })} className={inputClass}>
                      {BOARD_ROLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </Input>
                  <Input label={`Função ${displayInstructorAnac || "INVA"}`}>
                    <select
                      value={leg.instructorRole}
                      disabled={!canEdit}
                      onChange={(e) => updateLeg(leg.id, { instructorRole: e.target.value, role: e.target.value })}
                      className={inputClass}
                    >
                      {BOARD_ROLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </Input>
                  <Input label="DEP">
                    {renderAerodromeSelect(leg, "dep")}
                  </Input>
                  <Input label="ARR">
                    {renderAerodromeSelect(leg, "arr")}
                  </Input>
                  <Input label="Pousos">
                    <input type="number" min={0} value={leg.landings} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { landings: Number(e.target.value) || 0 })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Voo">
                    <input type="text" placeholder="HH:MM" value={leg.flightTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { flightTime: normalizeDurationInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Navegação">
                    <input type="text" placeholder="HH:MM" value={leg.navTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { navTime: normalizeDurationInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de IFR">
                    <input type="text" placeholder="HH:MM" value={leg.ifrTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { ifrTime: normalizeDurationInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Noturno">
                    <input type="text" placeholder="HH:MM" value={leg.nightTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { nightTime: normalizeDurationInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Serviço">
                    <input type="text" placeholder="HH:MM" value={leg.serviceTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { serviceTime: normalizeDurationInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Distância (NM)">
                    <input type="number" min={0} step="any" value={leg.distance} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { distance: e.target.value })} className={inputClass} />
                  </Input>
                  <Input label="Combustível estimado (L)">
                    <div className={`${inputClass} text-slate-400`}>
                      {(() => {
                        const mins = parseDurationToMinutes(leg.flightTime);
                        if (fuelConsumptionLph === null || mins === 0) return "—";
                        return (Math.round((mins / 60) * fuelConsumptionLph * 10) / 10).toFixed(1);
                      })()}
                    </div>
                  </Input>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <TotalCard label="Pousos" value={String(totals.landings)} />
            <TotalCard label="Tempo de voo" value={formatMinutes(totals.flightMin)} />
            <TotalCard label="Navegação" value={formatMinutes(totals.navMin)} />
            <TotalCard label="IFR" value={formatMinutes(totals.ifrMin)} />
            <TotalCard label="Noturno" value={formatMinutes(totals.nightMin)} />
            <TotalCard label="Serviço" value={formatMinutes(totals.serviceMin)} />
          </div>
        </section>
      )}

      {stepId === "exercicios" && (
        <section className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Exercícios</p>
            <p className="mt-1 text-xs text-slate-500">
              Avalie cada exercício com NO, 1, 2, 3 ou 4. Clique novamente na nota para limpar.
            </p>
          </div>

          {exercisesLoading && exerciseGrades.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4 text-sm text-slate-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              Carregando exercícios...
            </div>
          ) : exerciseGrades.length === 0 ? (
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
              Nenhum exercício ativo cadastrado no admin.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/30">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-950/50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Exercício</th>
                      <th className="px-3 py-2">Grau</th>
                      <th className="px-3 py-2">Proficiência aceitável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {exerciseGrades.map((exercise) => (
                      <tr key={exercise.exerciseId} className="align-top">
                        <td className="min-w-56 px-3 py-3 font-medium text-slate-100">{exercise.title}</td>
                        <td className="min-w-64 px-3 py-3">
                          <div className="grid grid-cols-5 gap-1">
                            {GRADE_OPTIONS.map((grade) => {
                              const selected = exercise.grade === grade;
                              return (
                                <button
                                  key={grade}
                                  type="button"
                                  onClick={() => updateExerciseGrade(exercise.exerciseId, grade)}
                                  disabled={!canEdit}
                                  className={`h-9 rounded-md border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                    selected
                                      ? "border-sky-400 bg-sky-500 text-white"
                                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                  }`}
                                >
                                  {grade}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="min-w-96 px-3 py-3 text-xs leading-relaxed text-slate-400">
                          {exercise.acceptableProficiency || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {stepId === "peso-balanceamento" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Peso e balanceamento</p>
              <p className="mt-1 text-xs text-slate-500">
                A ficha usa os parâmetros cadastrados na aeronave e salva um snapshot junto com o voo.
              </p>
            </div>
            <span
              className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                currentWeightBalanceMeta.results.isWithinLimits
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
              }`}
            >
              {currentWeightBalanceMeta.results.isWithinLimits ? "Dentro do envelope" : "Verificar envelope"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBlock label="Aeronave" value={weightBalanceAircraft.registration || "-"} />
            <InfoBlock label="Peso vazio" value={`${formatNumber(weightBalanceAircraft.emptyWeightKg)} kg`} />
            <InfoBlock label="Braço vazio" value={`${formatNumber(weightBalanceAircraft.emptyArmMm)} mm`} />
            <InfoBlock label="Combustível" value={`${formatNumber(weightBalanceAircraft.fuelDensityKgPerL, 3)} kg/L`} />
            <InfoBlock label="Peso máximo" value={`${formatNumber(weightBalanceAircraft.maxWeightKg)} kg`} />
            <InfoBlock label="Braço mínimo" value={`${formatNumber(weightBalanceAircraft.armMinMm)} mm`} />
            <InfoBlock label="Braço máximo" value={`${formatNumber(weightBalanceAircraft.armMaxMm)} mm`} />
            <InfoBlock label="Braço combustível" value={`${formatNumber(weightBalanceAircraft.fuelArmMm)} mm`} />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700/70 bg-slate-950/30 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Input label="Pessoas a bordo">
              <input
                type="number"
                min={1}
                step={1}
                value={wbPersonsOnBoard}
                disabled={!canEditWeightBalance}
                onChange={(e) => setWbPersonsOnBoard(e.target.value)}
                className={inputClass}
              />
            </Input>
            <Input label="Peso ocupantes (kg)">
              <input
                type="number"
                min={0}
                step="any"
                value={wbOccupantsWeight}
                disabled={!canEditWeightBalance}
                onChange={(e) => setWbOccupantsWeight(e.target.value)}
                className={inputClass}
              />
            </Input>
            <Input label="Peso bagagem (kg)">
              <input
                type="number"
                min={0}
                step="any"
                value={wbBaggageWeight}
                disabled={!canEditWeightBalance}
                onChange={(e) => setWbBaggageWeight(e.target.value)}
                className={inputClass}
              />
            </Input>
            <FuelQuantityField
              label="Combustível inicial"
              value={wbRampFuelValue}
              unit={wbRampFuelUnit}
              weightKg={currentWeightBalanceMeta.inputs.rampFuel.weightKg}
              disabled={!canEditWeightBalance}
              onValueChange={setWbRampFuelValue}
              onUnitChange={setWbRampFuelUnit}
            />
            <FuelQuantityField
              label="Combustível gasto no táxi"
              value={wbTaxiFuelValue}
              unit={wbTaxiFuelUnit}
              weightKg={currentWeightBalanceMeta.inputs.taxiFuel.weightKg}
              disabled={!canEditWeightBalance}
              onValueChange={setWbTaxiFuelValue}
              onUnitChange={setWbTaxiFuelUnit}
            />
            <FuelQuantityField
              label="Combustível gasto até o pouso"
              value={wbTripFuelValue}
              unit={wbTripFuelUnit}
              weightKg={currentWeightBalanceMeta.inputs.tripFuel.weightKg}
              disabled={!canEditWeightBalance}
              onValueChange={setWbTripFuelValue}
              onUnitChange={setWbTripFuelUnit}
            />
          </div>

          {weightBalanceIssues.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">Atenção</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {Array.from(new Set(weightBalanceIssues)).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-slate-700/70">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Ponto</th>
                  <th className="px-3 py-2">Peso</th>
                  <th className="px-3 py-2">Momento</th>
                  <th className="px-3 py-2">Braço</th>
                  <th className="px-3 py-2">Envelope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {currentWeightBalanceMeta.results.points.map((point) => (
                  <tr key={point.id}>
                    <td className="px-3 py-3 font-medium text-slate-100">{point.label}</td>
                    <td
                      className={`px-3 py-3 ${
                        weightBalanceAircraft.maxWeightKg !== null &&
                        point.weightKg !== null &&
                        point.weightKg > weightBalanceAircraft.maxWeightKg
                          ? "font-semibold text-red-300"
                          : "text-slate-300"
                      }`}
                    >
                      {formatNumber(point.weightKg)} kg
                    </td>
                    <td className="px-3 py-3 text-slate-300">{formatNumber(point.momentKgMm)} kg.mm</td>
                    <td className="min-w-64 px-3 py-3 text-slate-300">
                      <ArmEnvelopeBar
                        armMm={point.armMm}
                        minArmMm={weightBalanceAircraft.armMinMm}
                        maxArmMm={weightBalanceAircraft.armMaxMm}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] ${
                          point.inEnvelope
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : point.inEnvelope === false
                              ? "border-red-500/40 bg-red-500/10 text-red-200"
                              : "border-slate-600 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {point.inEnvelope ? "OK" : point.inEnvelope === false ? "Fora" : "Incompleto"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stepId === "risco" && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Risco e parecer</p>
          <div className="space-y-3 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Diário Técnico (ANAC Res. 457)</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Discrepância encontrada</span>
                <select
                  value={discrepancyCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDiscrepancyCode(next);
                    if (next === NO_DISCREPANCY) setDiscrepancies("");
                  }}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-70"
                >
                  {DISCREPANCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Ocorrência encontrada</span>
                <select
                  value={occurrenceCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setOccurrenceCode(next);
                    if (next === NO_OCCURRENCE) {
                      setOccurrences("");
                    } else if (!occurrences.trim()) {
                      setOccurrences(OCCURRENCE_TEMPLATE);
                    }
                  }}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-70"
                >
                  {OCCURRENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            {discrepancyCode !== NO_DISCREPANCY ? (
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Descrição da discrepância</span>
                <textarea
                  value={discrepancies}
                  onChange={(e) => setDiscrepancies(e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-70"
                />
              </label>
            ) : null}
            {occurrenceCode !== NO_OCCURRENCE ? (
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Detalhe da ocorrência</span>
                <textarea
                  value={occurrences}
                  onChange={(e) => setOccurrences(e.target.value)}
                  disabled={!canEdit}
                  rows={5}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-70"
                />
              </label>
            ) : null}
          </div>
          <MarkdownField label="Comentários" value={commentsMd} onChange={setCommentsMd} minRows={3} disabled={!canEdit} />
          <MarkdownField label="DESCRIÇÃO DO PERIGO" value={dangerMd} onChange={setDangerMd} minRows={3} disabled={!canEdit} />
          <MarkdownField label="DESCRIÇÃO DO RISCO" value={riskMd} onChange={setRiskMd} minRows={3} disabled={!canEdit} />
          <MarkdownField
            label="DESCRIÇÃO DO GERENCIAMENTO DO RISCO"
            value={managementMd}
            onChange={setManagementMd}
            minRows={3}
            disabled={!canEdit}
          />
          <MarkdownField
            label="PARECER DO INSTRUTOR"
            value={instructorOpinionMd}
            onChange={setInstructorOpinionMd}
            required
            minRows={4}
            disabled={!canEdit}
            quickActionLabel="Aluno aprovado"
            quickActionValue={DEFAULT_APPROVED_TEXT}
          />
        </section>
      )}

      <div className="sticky bottom-2 flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIdx === 0}
          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 sm:w-auto"
        >
          ← Anterior
        </button>
        {stepIdx < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="w-full rounded-lg border border-sky-600/40 bg-sky-600/10 px-4 py-2 text-sm text-sky-200 hover:bg-sky-600/20 sm:w-auto"
          >
            Próximo →
          </button>
        ) : null}
        <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleExportPdf}
            className="w-full rounded-lg border border-slate-700 px-5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 sm:w-auto"
          >
            Exportar PDF
          </button>
          {(canEdit || (canEditWeightBalance && stepId === "peso-balanceamento")) && (
            <button
              type="button"
              onClick={() => void persist()}
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Salvando..." : canEdit ? "Salvar alterações" : "Salvar peso e balanceamento"}
            </button>
          )}
          {stepIdx === STEPS.length - 1 && canEdit && flightId && !instructorAlreadySigned && onSaveAndSign ? (
            <button
              type="button"
              onClick={() => void persist().then((ok) => { if (ok) onSaveAndSign(); })}
              disabled={saving}
              className="w-full rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Salvando..." : "Salvar e assinar"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500";

function Input({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function AerodromeCombobox({
  value,
  options,
  disabled,
  loading,
  onChange,
}: {
  value: string;
  options: AerodromeOption[];
  disabled: boolean;
  loading: boolean;
  onChange: (icao: string) => void;
}) {
  const normalizedValue = value.trim().toUpperCase();
  const selectedOption = useMemo(
    () => options.find((option) => option.icao === normalizedValue) ?? null,
    [normalizedValue, options],
  );
  const [query, setQuery] = useState(selectedOption?.label ?? normalizedValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) setQuery(selectedOption?.label ?? normalizedValue);
  }, [normalizedValue, open, selectedOption]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const ranked = normalizedQuery
      ? options.filter((option) =>
          normalizeSearchText(`${option.icao} ${option.ciad} ${option.name} ${option.municipality} ${option.uf} ${option.label}`).includes(
            normalizedQuery,
          ),
        )
      : options;
    return ranked.slice(0, 80);
  }, [options, query]);

  const selectOption = (option: AerodromeOption) => {
    onChange(option.icao);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={loading ? "Carregando aeródromos..." : "Digite ICAO, nome ou cidade"}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) onChange("");
        }}
        onBlur={() => {
          window.setTimeout(() => {
            const exact = options.find((option) => option.icao === query.trim().toUpperCase());
            if (exact) {
              selectOption(exact);
              return;
            }
            setOpen(false);
            setQuery(selectedOption?.label ?? normalizedValue);
          }, 120);
        }}
        className={inputClass}
      />
      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-700 bg-slate-950 text-xs text-slate-100 shadow-xl shadow-slate-950/40">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
                className="block w-full px-2.5 py-2 text-left hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
              >
                <span className="block font-medium text-slate-100">{option.label}</span>
                <span className="block text-[11px] text-slate-500">{option.ciad}</span>
              </button>
            ))
          ) : (
            <div className="px-2.5 py-2 text-slate-500">Nenhum aeródromo encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}

function FuelQuantityField({
  label,
  value,
  unit,
  weightKg,
  disabled,
  onValueChange,
  onUnitChange,
}: {
  label: string;
  value: string;
  unit: FuelQuantityUnit;
  weightKg: WeightBalanceFuelInput["weightKg"];
  disabled: boolean;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: FuelQuantityUnit) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(e.target.value)}
          className={inputClass}
        />
        <select
          value={unit}
          disabled={disabled}
          onChange={(e) => onUnitChange(e.target.value === "kg" ? "kg" : "l")}
          className="w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
        >
          <option value="l">L</option>
          <option value="kg">kg</option>
        </select>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Equivalente: {formatNumber(weightKg)} kg</p>
    </div>
  );
}

function ArmEnvelopeBar({
  armMm,
  minArmMm,
  maxArmMm,
}: {
  armMm: number | null;
  minArmMm: number | null;
  maxArmMm: number | null;
}) {
  if (armMm === null || minArmMm === null || maxArmMm === null || maxArmMm <= minArmMm) {
    return <span>{formatNumber(armMm)} mm</span>;
  }
  const pct = Math.min(100, Math.max(0, ((armMm - minArmMm) / (maxArmMm - minArmMm)) * 100));
  const outside = armMm < minArmMm || armMm > maxArmMm;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500">{formatNumber(minArmMm)} min</span>
        <span className={outside ? "font-semibold text-red-300" : "font-semibold text-slate-100"}>
          {formatNumber(armMm)} mm
        </span>
        <span className="text-slate-500">{formatNumber(maxArmMm)} max</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${outside ? "bg-red-500/50" : "bg-sky-500/50"}`} style={{ width: `${pct}%` }} />
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
            outside ? "border-red-200 bg-red-500" : "border-sky-100 bg-sky-500"
          }`}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700/70 bg-slate-900/50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function InfoBlock({ label, value, plain = false }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className={plain ? "px-1 py-1" : "rounded-md border border-slate-700/70 bg-slate-900/40 px-3 py-2"}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
