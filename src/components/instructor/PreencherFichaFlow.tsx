import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getSavedFlight, type SavedFlightListItem } from "../../lib/flightsDb";
import { instructorPatchFlight } from "../../lib/instructorPatchFlightDb";
import {
  decodeFlightRecord,
  encodeFlightRecord,
  type FlightRecordMeta,
} from "../../lib/flightRecordCodec";
import { lookupSagaFlight, type SagaLookupFlightResult } from "../../lib/sagaImportDb";
import { buildTrainingSnapshot, listStudentTrainingTracks } from "../../lib/trainingTracksDb";
import { getAircraftByRegistration } from "../../lib/aircraftDb";
import { aircraftToWeightBalanceSnapshot, buildWeightBalanceMeta } from "../../lib/weightBalance";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import type {
  StudentTrainingTrack,
  TrainingMission,
  TrainingSelectionSnapshot,
  TrainingStage,
} from "../../types/trainingTrack";
import type { ExerciseGrade, FlightExerciseGrade, TrainingExercise } from "../../types/trainingExercise";
import { listTrainingExercises } from "../../lib/trainingExercisesDb";
import { parseGarminCsv } from "../../lib/parseGarminCsv";
import { invalidateFlightListDisplayCache } from "../../lib/flightListDisplayCache";
import { signFlight } from "../../lib/flightSignaturesDb";
import { validateFlightForInstructorSign as validateSign } from "../../lib/flightSignValidation";
import CsvWorker from "../../workers/csvWorker?worker";

// ─── Helpers (mirror of NovoVooFlow internal functions) ──────────────────────

function sanitizeAerodromeCode(v: string | null | undefined): string {
  const c = String(v ?? "").trim().toUpperCase();
  return c === "---" ? "" : c;
}

function normalizeDurationInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  const hh = Math.max(0, Number(digits.slice(0, 2)) || 0);
  if (digits.length === 3) return `${String(hh).padStart(2, "0")}:${digits[2]}`;
  const mm = Math.min(59, Math.max(0, Number(digits.slice(2, 4)) || 0));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function sagaZuluToLocalClock(raw: string): string {
  const m = raw.trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return raw.trim();
  const total = (Number(m[1]) * 60 + Number(m[2]) - 180 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function inferInstructorOutcome(text: string): "" | "approved" | "failed" {
  const n = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\b(reprovado|reprovada|insatisfatorio|inapto|nao aprovado)\b/.test(n)) return "failed";
  if (/\b(aprovado|aprovada|satisfatorio|apto|apta)\b/.test(n)) return "approved";
  return "";
}

function exerciseTitleScore(a: string, b: string): number {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const aW = new Set(na.split(" ").filter(Boolean));
  const bW = new Set(nb.split(" ").filter(Boolean));
  const common = Array.from(aW).filter((w) => bW.has(w)).length;
  return common / Math.max(aW.size, bW.size);
}

function isExerciseGrade(v: unknown): v is ExerciseGrade {
  return v === "NO" || v === "1" || v === "2" || v === "3" || v === "4";
}

function exerciseTitleKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeExerciseGrades(exercises: FlightExerciseGrade[]): FlightExerciseGrade[] {
  const byTitle = new Map<string, FlightExerciseGrade>();
  for (const exercise of exercises) {
    const key = exerciseTitleKey(exercise.title);
    if (!key) continue;
    const current = byTitle.get(key);
    if (!current) {
      byTitle.set(key, exercise);
      continue;
    }
    byTitle.set(key, {
      ...current,
      exerciseId: current.exerciseId.startsWith("legacy-") ? exercise.exerciseId : current.exerciseId,
      acceptableProficiency: current.acceptableProficiency || exercise.acceptableProficiency,
      grade: current.grade ?? exercise.grade,
      order: Math.min(current.order, exercise.order),
    });
  }
  return Array.from(byTitle.values()).sort((a, b) => a.order - b.order);
}

function mergeExerciseGrades(catalog: TrainingExercise[], saved: FlightExerciseGrade[]): FlightExerciseGrade[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const byTitle = new Map(catalog.map((e) => [exerciseTitleKey(e.title), e]));
  const usedIds = new Set<string>();
  const merged = dedupeExerciseGrades(saved).map((exercise) => {
    const cat = byId.get(exercise.exerciseId) ?? byTitle.get(exerciseTitleKey(exercise.title));
    if (cat) usedIds.add(cat.id);
    return {
      exerciseId: cat?.id ?? exercise.exerciseId,
      title: cat?.title ?? exercise.title,
      acceptableProficiency: cat?.acceptableProficiency ?? exercise.acceptableProficiency,
      grade: isExerciseGrade(exercise.grade) ? exercise.grade : null,
      order: cat?.order ?? exercise.order,
    } satisfies FlightExerciseGrade;
  });
  const newRows = catalog
    .filter((e) => e.isActive && !usedIds.has(e.id))
    .map((e) => ({ exerciseId: e.id, title: e.title, acceptableProficiency: e.acceptableProficiency, grade: "4" as ExerciseGrade, order: e.order }) satisfies FlightExerciseGrade);
  return dedupeExerciseGrades([...merged, ...newRows]);
}

function applySagaExerciseGrades(
  current: FlightExerciseGrade[],
  sagaExercises: Array<{ title: string; grade: ExerciseGrade }>,
): FlightExerciseGrade[] {
  const used = new Set<number>();
  return current.map((exercise) => {
    let bestIndex = -1;
    let bestScore = 0;
    sagaExercises.forEach((se, i) => {
      if (used.has(i)) return;
      const score = exerciseTitleScore(se.title, exercise.title);
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    });
    if (bestIndex < 0 || bestScore < 0.55) return exercise;
    used.add(bestIndex);
    return { ...exercise, grade: sagaExercises[bestIndex].grade };
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "source" | "saga" | "mission" | "telemetry" | "video" | "done";
type VisibleStep = Exclude<Step, "source">;

// ─── Fuzzy mission matching ───────────────────────────────────────────────────

function normalizeMissionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function missionMatchScore(sagaMission: string, systemMission: string): number {
  const a = normalizeMissionText(sagaMission);
  const b = normalizeMissionText(systemMission);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Check prefix/code match: e.g. "ps20" in "ps20 navegacao"
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  // Code match (first token)
  if (aParts[0] && bParts[0] && aParts[0] === bParts[0]) return 0.9;
  // Substring
  if (a.includes(b) || b.includes(a)) return 0.8;
  // Token overlap
  const aSet = new Set(aParts.filter((p) => p.length > 1));
  const bSet = new Set(bParts.filter((p) => p.length > 1));
  let overlap = 0;
  for (const token of aSet) { if (bSet.has(token)) overlap++; }
  if (overlap > 0) return overlap / Math.max(aSet.size, bSet.size);
  return 0;
}

function findBestMissionMatch(
  sagaMissionText: string,
  tracks: StudentTrainingTrack[],
): { missionId: string; trackId: string; score: number } | null {
  if (!sagaMissionText.trim()) return null;
  let best: { missionId: string; trackId: string; score: number } | null = null;
  for (const track of tracks) {
    if (!track.track) continue;
    for (const stage of track.track.stages) {
      for (const mission of stage.missions) {
        const score = missionMatchScore(sagaMissionText, mission.name);
        if (score > 0.5 && (!best || score > best.score)) {
          best = { missionId: mission.id, trackId: track.trackId, score };
        }
      }
    }
  }
  return best;
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

function flowSteps(useSaga: boolean): VisibleStep[] {
  return useSaga
    ? ["saga", "mission", "telemetry", "video", "done"]
    : ["mission", "telemetry", "video", "done"];
}

function StepBar({ current, useSaga }: { current: Step; useSaga: boolean }) {
  const steps = flowSteps(useSaga);
  const currentIdx = steps.indexOf(current as VisibleStep);
  const labels: Record<VisibleStep, string> = {
    saga: "SAGA",
    mission: "Missão",
    telemetry: "Telemetria",
    video: "Vídeos",
    done: "Concluído",
  };
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-sky-600 text-white ring-2 ring-sky-400/40"
                    : "bg-slate-800 text-slate-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 rounded transition ${done ? "bg-emerald-600" : "bg-slate-700"}`} />
            )}
            <span className={`hidden text-[10px] sm:block ${active ? "text-sky-300 font-semibold" : "text-slate-500"}`}>
              {labels[step]}
            </span>
            {i < steps.length - 1 && <div className="w-2" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreencherFichaFlow({
  flightId,
  onBack,
  onOpenManual,
  onDone,
}: {
  flightId: string;
  onBack: () => void;
  onOpenManual: (id: string) => void;
  onDone: (id: string) => void;
}) {
  const { user } = useAuth();

  // ── Flight ────────────────────────────────────────────────────────────────
  const [flight, setFlight] = useState<(SavedFlightListItem & { csv_text: string }) | null>(null);
  const [flightLoading, setFlightLoading] = useState(true);

  // ── Pre-loaded data ───────────────────────────────────────────────────────
  const [studentTracks, setStudentTracks] = useState<StudentTrainingTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [exerciseCatalog, setExerciseCatalog] = useState<TrainingExercise[]>([]);
  const [weightBalanceAircraftSnapshot, setWeightBalanceAircraftSnapshot] = useState(() => aircraftToWeightBalanceSnapshot(null));

  // ── Flow ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("source");
  const [useSaga, setUseSaga] = useState(false);

  // ── SAGA ──────────────────────────────────────────────────────────────────
  const [sagaSearchId, setSagaSearchId] = useState("");
  const [sagaSearching, setSagaSearching] = useState(false);
  const [sagaResult, setSagaResult] = useState<SagaLookupFlightResult | null>(null);
  const [sagaError, setSagaError] = useState<string | null>(null);

  // ── Mission (multi-select) ────────────────────────────────────────────────
  const [selectedMissionIds, setSelectedMissionIds] = useState<string[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  // ── Telemetry ─────────────────────────────────────────────────────────────
  const [telemetryCsv, setTelemetryCsv] = useState<string | null>(null);
  const [telemetryFileName, setTelemetryFileName] = useState<string | null>(null);
  const [telemetryProcessing, setTelemetryProcessing] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetrySummary, setTelemetrySummary] = useState<{ duration: string; landings: number } | null>(null);
  const [telemetryDragOver, setTelemetryDragOver] = useState(false);

  // ── Video ─────────────────────────────────────────────────────────────────
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoDragOver, setVideoDragOver] = useState(false);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlightId, setSavedFlightId] = useState<string | null>(null);

  // ── Sign ──────────────────────────────────────────────────────────────────
  const [showSignModal, setShowSignModal] = useState(false);
  const [signingPassword, setSigningPassword] = useState("");
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [signingValidationErrors, setSigningValidationErrors] = useState<string[]>([]);
  const [signed, setSigned] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  // ── Load flight + parallel pre-fetches ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    workerRef.current = new CsvWorker();

    const run = async () => {
      const { data, error } = await getSavedFlight(flightId);
      if (cancelled || error || !data) {
        if (!cancelled) setFlightLoading(false);
        return;
      }
      const full = data as SavedFlightListItem & { csv_text: string };
      if (!cancelled) setFlight(full);
      setFlightLoading(false);

      const studentId = data.student_user_id;
      if (!studentId || !user) return;

      const aircraftIdent = data.aircraft_ident ?? full.aircraft_ident ?? "";
      const [tracksResult, exercisesResult, aircraft] = await Promise.all([
        listStudentTrainingTracks(studentId),
        listTrainingExercises({}),
        aircraftIdent ? getAircraftByRegistration(aircraftIdent, DEFAULT_SCHOOL_ID) : Promise.resolve(null),
      ]);

      if (cancelled) return;

      const tracks = tracksResult.data ?? [];
      setStudentTracks(tracks);
      setTracksLoading(false);
      if (!exercisesResult.error) setExerciseCatalog(exercisesResult.data ?? []);
      setWeightBalanceAircraftSnapshot(aircraftToWeightBalanceSnapshot(aircraft));

      // Auto-expand first stage + auto-select suggestion
      const primaryTrack = tracks.find((t) => t.isPrimary && t.track) ?? tracks.find((t) => t.track);
      if (primaryTrack?.track?.stages?.[0]) {
        setExpandedStageId(data.training_stage_id ?? primaryTrack.track.stages[0].id);
        setSelectedTrackId(primaryTrack.trackId);
      }
      // Auto-suggest first unfinished mission
      if (primaryTrack?.track) {
        for (const stage of primaryTrack.track.stages) {
          if (stage.missions[0]) {
            setSelectedMissionIds([stage.missions[0].id]);
            break;
          }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
    };
  }, [flightId, user]);

  // ── Auto-match SAGA mission ───────────────────────────────────────────────
  useEffect(() => {
    if (!sagaResult?.flight?.summary?.mission || tracksLoading) return;
    const match = findBestMissionMatch(sagaResult.flight.summary.mission, studentTracks);
    if (match) {
      setSelectedMissionIds([match.missionId]);
      setSelectedTrackId(match.trackId);
      // Expand the stage that contains the matched mission
      const track = studentTracks.find((t) => t.trackId === match.trackId)?.track;
      if (track) {
        for (const stage of track.stages) {
          if (stage.missions.some((m) => m.id === match.missionId)) {
            setExpandedStageId(stage.id);
            break;
          }
        }
      }
    }
  }, [sagaResult, studentTracks, tracksLoading]);

  // ── SAGA search ───────────────────────────────────────────────────────────
  const handleSagaSearch = async () => {
    const id = sagaSearchId.trim();
    if (!id) return;
    setSagaSearching(true);
    setSagaError(null);
    setSagaResult(null);
    const result = await lookupSagaFlight(id);
    setSagaSearching(false);
    if (!result.ok || !result.flight) {
      setSagaError(result.message ?? "Voo não encontrado no SAGA.");
      return;
    }
    setSagaResult(result);
  };

  // ── CSV file handling ─────────────────────────────────────────────────────
  const processCsvFile = useCallback((file: File) => {
    setTelemetryError(null);
    setTelemetryProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setTelemetryCsv(text);
      setTelemetryFileName(file.name);
      try {
        const parsed = parseGarminCsv(text);
        if (parsed.points.length > 0) {
          const first = parsed.points[0];
          const last = parsed.points[parsed.points.length - 1];
          const durationSec = first && last ? Math.abs((last.t ?? 0) - (first.t ?? 0)) / 1000 : 0;
          const h = Math.floor(durationSec / 3600);
          const m = Math.floor((durationSec % 3600) / 60);
          setTelemetrySummary({ duration: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, landings: 0 });
        }
      } catch {
        // summary optional
      }
      setTelemetryProcessing(false);
    };
    reader.onerror = () => { setTelemetryError("Erro ao ler arquivo."); setTelemetryProcessing(false); };
    reader.readAsText(file);
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !flight) return;
    setSaving(true);
    setSaveError(null);

    const primaryTrack = studentTracks.find((t) => t.trackId === selectedTrackId && t.track)
      ?? studentTracks.find((t) => t.isPrimary && t.track)
      ?? studentTracks.find((t) => t.track);

    // Build snapshot for first selected mission (primary)
    const primaryMissionId = selectedMissionIds[0] ?? null;
    const snapshot: TrainingSelectionSnapshot | null =
      primaryMissionId && primaryTrack?.track
        ? buildTrainingSnapshot(primaryTrack.track, primaryMissionId)
        : null;

    const currentDecoded = decodeFlightRecord(flight.csv_text);
    const baseMeta: FlightRecordMeta = currentDecoded.meta ?? {
      header: {
        studentUserId: flight.student_user_id ?? "",
        studentLabel: "",
        aircraft: flight.aircraft_ident ?? "",
        date: flight.flight_date ?? "",
      },
      legs: [],
      preFlight: { objectiveMd: "", briefingMd: "" },
      risk: { commentsMd: "", dangerMd: "", riskMd: "", managementMd: "", instructorOpinionMd: "" },
    };

    // Apply SAGA data — exact same logic as NovoVooFlow's applySagaLookupToLegs
    let finalMeta = baseMeta;
    if (useSaga && sagaResult?.flight) {
      const { metaLegs, pdfRecord, summary } = sagaResult.flight;

      // Legs — using same helpers as NovoVooFlow
      const legs = metaLegs.map((leg) => ({
        id: crypto.randomUUID(),
        date: leg.date || summary.date || baseMeta.header.date,
        role: leg.role || "Instrutor de voo",
        studentRole: "",
        instructorRole: leg.role || "Instrutor de voo",
        dep: sanitizeAerodromeCode(leg.dep),
        arr: sanitizeAerodromeCode(leg.arr),
        landings: Number.isFinite(leg.landings) ? leg.landings : 0,
        flightTime: normalizeDurationInput(leg.flightTime || "") || "00:00",
        navTime: normalizeDurationInput(leg.navTime || "") || "00:00",
        ifrTime: normalizeDurationInput(leg.ifrTime || "") || "00:00",
        nightTime: normalizeDurationInput(leg.nightTime || "") || "00:00",
        serviceTime: normalizeDurationInput(leg.serviceTime || "") || "00:00",
        engineStart: sagaZuluToLocalClock(leg.engineStart || ""),
        takeoff: sagaZuluToLocalClock(leg.takeoff || ""),
        landing: sagaZuluToLocalClock(leg.landing || ""),
        engineCut: sagaZuluToLocalClock(leg.engineCut || ""),
        distance: leg.distance || "",
      }));

      // Header times
      const firstEngineStart = legs.find((leg) => leg.engineStart.trim())?.engineStart.trim() || "";
      const lastEngineCut = [...legs].reverse().find((leg) => leg.engineCut.trim())?.engineCut.trim() || "";
      const firstTakeoff = legs.find((leg) => leg.takeoff.trim())?.takeoff.trim() || "";
      const lastLanding = [...legs].reverse().find((leg) => leg.landing.trim())?.landing.trim() || "";
      const header = {
        ...baseMeta.header,
        date: summary.date || baseMeta.header.date,
        ...(firstEngineStart ? { startTime: firstEngineStart, departureTimeUtc: firstEngineStart } : {}),
        ...(lastEngineCut ? { engineCutoffTimeUtc: lastEngineCut } : {}),
        ...(firstTakeoff ? { takeoffTimeUtc: firstTakeoff } : {}),
        ...(lastLanding ? { landingTimeUtc: lastLanding } : {}),
      };

      // preFlight — only fill empty fields
      const preFlight = { ...baseMeta.preFlight };
      if (!preFlight.objectiveMd?.trim() && pdfRecord?.objectiveMd?.trim()) preFlight.objectiveMd = pdfRecord.objectiveMd.trim();
      if (!preFlight.briefingMd?.trim() && pdfRecord?.briefingMd?.trim()) preFlight.briefingMd = pdfRecord.briefingMd.trim();

      // risk — only fill empty/default fields
      const risk = { ...baseMeta.risk };
      if (!risk.commentsMd?.trim() && pdfRecord?.commentsMd?.trim()) risk.commentsMd = pdfRecord.commentsMd.trim();
      if (!risk.dangerMd?.trim() && pdfRecord?.dangerMd?.trim()) risk.dangerMd = pdfRecord.dangerMd.trim();
      if (!risk.riskMd?.trim() && pdfRecord?.riskMd?.trim()) risk.riskMd = pdfRecord.riskMd.trim();
      if (!risk.managementMd?.trim() && pdfRecord?.managementMd?.trim()) risk.managementMd = pdfRecord.managementMd.trim();
      if (!risk.instructorOpinionMd?.trim() && pdfRecord?.result?.trim()) {
        risk.instructorOpinionMd = pdfRecord.result.trim();
        risk.instructorOutcome = inferInstructorOutcome(pdfRecord.result.trim());
      }

      // exercises — merge catalog first (so there are base exercises), then apply SAGA grades
      const baseExercises = exerciseCatalog.length
        ? mergeExerciseGrades(exerciseCatalog, baseMeta.exercises ?? [])
        : (baseMeta.exercises ?? []);
      const exercises = pdfRecord?.exercises?.length
        ? applySagaExerciseGrades(
            baseExercises,
            pdfRecord.exercises.map((e) => ({ title: e.title, grade: isExerciseGrade(e.grade) ? e.grade : "NO" as ExerciseGrade })),
          )
        : baseExercises;

      // weight & balance — same as NovoVooFlow: use buildWeightBalanceMeta with aircraft snapshot
      let weightBalance = baseMeta.weightBalance;
      const wb = pdfRecord?.weightBalance;
      if (wb) {
        // Use saved aircraft snapshot if available, otherwise use the one we loaded
        const aircraft = baseMeta.weightBalance?.aircraft ?? weightBalanceAircraftSnapshot;
        const existingInputs = baseMeta.weightBalance?.inputs;
        weightBalance = buildWeightBalanceMeta({
          aircraft,
          inputs: {
            personsOnBoard: wb.personsOnBoard ?? existingInputs?.personsOnBoard ?? null,
            occupantsWeightKg: wb.occupantsWeightKg ?? existingInputs?.occupantsWeightKg ?? null,
            baggageWeightKg: wb.baggageWeightKg ?? existingInputs?.baggageWeightKg ?? null,
            rampFuel: wb.rampFuel
              ? { value: wb.rampFuel.value, unit: wb.rampFuel.unit as "kg" | "l" }
              : existingInputs?.rampFuel
                ? { value: existingInputs.rampFuel.value, unit: existingInputs.rampFuel.unit }
                : { value: null, unit: "l" as const },
            taxiFuel: wb.taxiFuel
              ? { value: wb.taxiFuel.value, unit: wb.taxiFuel.unit as "kg" | "l" }
              : existingInputs?.taxiFuel
                ? { value: existingInputs.taxiFuel.value, unit: existingInputs.taxiFuel.unit }
                : { value: null, unit: "l" as const },
            tripFuel: wb.tripFuel
              ? { value: wb.tripFuel.value, unit: wb.tripFuel.unit as "kg" | "l" }
              : existingInputs?.tripFuel
                ? { value: existingInputs.tripFuel.value, unit: existingInputs.tripFuel.unit }
                : { value: null, unit: "l" as const },
          },
          updatedAt: new Date().toISOString(),
        });
      }

      finalMeta = {
        ...baseMeta,
        header,
        legs,
        preFlight,
        risk,
        exercises,
        ...(weightBalance ? { weightBalance } : {}),
      };
    }

    const csvPayload = encodeFlightRecord({ meta: finalMeta, telemetryCsv: telemetryCsv ?? "", telemetryFiles: [] });


    const { error } = await instructorPatchFlight({
      flightId,
      instructorUserId: user.id,
      csvText: csvPayload,
      flightStatus: "Realizado",
      trainingTrackId: snapshot?.trackId ?? flight.training_track_id ?? null,
      trainingStageId: snapshot?.stageId ?? null,
      trainingMissionId: snapshot?.missionId ?? null,
      trainingSnapshot: snapshot,
    });

    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }

    invalidateFlightListDisplayCache([flightId]);
    setSavedFlightId(flightId);

    // Load updated meta for signing validation
    const { data: refreshed } = await getSavedFlight(flightId);
    if (refreshed) {
      const decoded = decodeFlightRecord((refreshed as SavedFlightListItem & { csv_text: string }).csv_text);
      if (decoded.meta) setSigningValidationErrors(validateSign(decoded.meta));
    }

    setStep("done");
  };

  // ── Sign ──────────────────────────────────────────────────────────────────
  const handleSign = async () => {
    if (!user || !savedFlightId) return;
    if (!signingPassword) { setSigningError("Informe sua senha para assinar."); return; }
    setSigningInProgress(true);
    setSigningError(null);
    const pw = signingPassword;
    setSigningPassword("");

    const { data: flightData } = await getSavedFlight(savedFlightId);
    if (!flightData) { setSigningError("Voo não encontrado."); setSigningInProgress(false); return; }

    const { error } = await signFlight({
      flightId: savedFlightId,
      actorUserId: user.id,
      actorRole: user.role,
      signerRole: "instructor",
      csvText: (flightData as SavedFlightListItem & { csv_text: string }).csv_text,
      password: pw,
    });

    setSigningInProgress(false);
    if (error) { setSigningError(error.message); return; }
    setSigned(true);
    setShowSignModal(false);
  };

  // ── Toggle mission ────────────────────────────────────────────────────────
  const toggleMission = (id: string, trackId: string) => {
    setSelectedTrackId(trackId);
    setSelectedMissionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const primaryTrack = studentTracks.find((t) => t.isPrimary && t.track) ?? studentTracks.find((t) => t.track);

  const selectedMissions = selectedMissionIds.flatMap((id) => {
    if (!primaryTrack?.track) return [];
    for (const stage of primaryTrack.track.stages) {
      const m = stage.missions.find((x) => x.id === id);
      if (m) return [m];
    }
    return [];
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  if (flightLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="p-8 text-center text-sm text-red-300">
        Voo não encontrado.{" "}
        <button type="button" onClick={onBack} className="text-sky-400 underline">Voltar</button>
      </div>
    );
  }

  const renderStep = () => {
    // ── Passo 1: Origem ──────────────────────────────────────────────────────
    if (step === "source") {
      return (
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Como preencher</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-100">Preencher Ficha</h2>
            <p className="mt-2 text-sm text-slate-400">
              Aeronave <strong className="text-slate-200">{flight.aircraft_ident ?? "—"}</strong>
              {flight.flight_date ? ` · ${new Date(flight.flight_date + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setUseSaga(true); setStep("saga"); }}
              className="group flex cursor-pointer flex-col items-start gap-4 rounded-2xl border border-sky-600/40 bg-sky-900/20 p-6 text-left transition hover:border-sky-500/60 hover:bg-sky-900/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600/20 text-sky-400">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-sky-200">Usar voo do SAGA</p>
                <p className="mt-1 text-sm text-slate-400">
                  Importa pernas, horários e exercícios automaticamente a partir do sistema SAGA.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenManual(flightId)}
              className="group flex cursor-pointer flex-col items-start gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6 text-left transition hover:border-slate-600 hover:bg-slate-800/60"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-200">Preencher manualmente</p>
                <p className="mt-1 text-sm text-slate-400">
                  Abre o editor completo da ficha para inserir todos os dados manualmente.
                </p>
              </div>
            </button>
          </div>
        </div>
      );
    }

    // ── Passo 2: SAGA ────────────────────────────────────────────────────────
    if (step === "saga") {
      const summary = sagaResult?.flight?.summary;
      return (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Passo 1 · SAGA</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">Buscar voo no SAGA</h2>
          </div>

          <div className="flex max-w-sm gap-2">
            <input
              type="text"
              value={sagaSearchId}
              onChange={(e) => setSagaSearchId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSagaSearch(); }}
              placeholder="ID do voo (ex: 12345)"
              className="w-40 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => void handleSagaSearch()}
              disabled={sagaSearching || !sagaSearchId.trim()}
              className="cursor-pointer rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sagaSearching ? "..." : "Buscar"}
            </button>
          </div>

          {sagaError && (
            <p className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {sagaError}
            </p>
          )}

          {/* Preview resultado */}
          {summary && (
            <div className="rounded-2xl border border-sky-600/30 bg-sky-900/15 p-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Dados encontrados no SAGA</p>
              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["ID", summary.id],
                  ["Data", summary.date],
                  ["Aeronave", summary.aircraft],
                  ["Aluno", summary.student],
                  ["ANAC aluno", summary.studentCanac],
                  ["Instrutor", summary.instructor],
                  ["Rota", summary.route],
                  ["Tempo de voo", summary.flightTime],
                  ["Pousos", String(summary.landings)],
                  ["Missão", summary.mission || "—"],
                  ["Curso", summary.course || "—"],
                ].map(([label, val]) => (
                  <p key={label} className="text-slate-400">
                    {label}: <span className="text-slate-200">{val}</span>
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep("mission")}
                className="mt-2 w-full cursor-pointer rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Confirmar dados do SAGA →
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStep("source")} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800">
              ← Voltar
            </button>
          </div>
        </div>
      );
    }

    // ── Passo 3: Missão ───────────────────────────────────────────────────────
    if (step === "mission") {
      const sagaMission = sagaResult?.flight?.summary?.mission;
      return (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Passo {useSaga ? "2" : "1"} · Missão
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">Missões realizadas</h2>
            <p className="mt-1 text-sm text-slate-400">
              Selecione uma ou mais missões realizadas neste voo.{" "}
              {selectedMissionIds.length > 0 && (
                <span className="font-semibold text-sky-300">{selectedMissionIds.length} selecionada{selectedMissionIds.length > 1 ? "s" : ""}</span>
              )}
            </p>
            {sagaMission && (
              <p className="mt-1 text-xs text-slate-500">
                Missão do SAGA: <span className="font-semibold text-amber-300">"{sagaMission}"</span>{" "}
                — missão mais próxima foi pré-selecionada abaixo.
              </p>
            )}
          </div>

          {/* Indicadores de contexto */}
          {!tracksLoading && primaryTrack?.track && (() => {
            // Missão sugerida pelo sistema (próxima missão do aluno)
            const suggestion = (() => {
              for (const stage of (primaryTrack.track?.stages ?? [])) {
                for (const mission of stage.missions) {
                  return { stage, mission };
                }
              }
              return null;
            })();

            return (
              <div className="grid gap-3 sm:grid-cols-2">
                {sagaMission && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">Do SAGA</p>
                    <p className="mt-1 text-sm text-amber-200">"{sagaMission}"</p>
                  </div>
                )}
                {suggestion && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Sugestão do sistema</p>
                    <p className="mt-1 text-sm text-emerald-200">{suggestion.mission.name}</p>
                    <p className="text-xs text-slate-500">{suggestion.stage.name} · {suggestion.mission.type}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {tracksLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-800/60" />)}
            </div>
          ) : !primaryTrack?.track ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
              Nenhuma trilha de treinamento encontrada para este aluno. Você pode continuar sem selecionar missão.
            </div>
          ) : (
            <div className="space-y-2">
              {(primaryTrack.track?.stages ?? []).map((stage: TrainingStage) => (
                <div key={stage.id} className="overflow-hidden rounded-xl border border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setExpandedStageId(expandedStageId === stage.id ? null : stage.id)}
                    className="flex w-full cursor-pointer items-center justify-between bg-slate-900/60 px-4 py-3 text-left hover:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-slate-300">{stage.name}</p>
                      {stage.missions.some((m) => selectedMissionIds.includes(m.id)) && (
                        <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                          {stage.missions.filter((m) => selectedMissionIds.includes(m.id)).length} ✓
                        </span>
                      )}
                    </div>
                    <svg
                      className={`h-4 w-4 text-slate-400 transition ${expandedStageId === stage.id ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {expandedStageId === stage.id && (
                    <div className="divide-y divide-slate-800/60 bg-slate-950/30">
                      {stage.missions.map((mission: TrainingMission) => {
                        const selected = selectedMissionIds.includes(mission.id);
                        return (
                          <button
                            key={mission.id}
                            type="button"
                            onClick={() => toggleMission(mission.id, primaryTrack.trackId)}
                            className={`flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition hover:bg-slate-800/40 ${selected ? "bg-sky-900/25" : ""}`}
                          >
                            <div>
                              <p className={`text-sm ${selected ? "font-semibold text-sky-200" : "text-slate-200"}`}>{mission.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{mission.type} · {mission.durationMinutes} min</p>
                            </div>
                            <div className={`flex h-5 w-5 items-center justify-center rounded border transition ${selected ? "border-sky-500 bg-sky-600 text-white" : "border-slate-600 bg-slate-800"}`}>
                              {selected && (
                                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => setStep(useSaga ? "saga" : "source")} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800">
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("telemetry")}
              className="cursor-pointer rounded-xl bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              {selectedMissionIds.length === 0 ? "Continuar sem missão →" : "Confirmar missão →"}
            </button>
          </div>
        </div>
      );
    }

    // ── Passo 4: Telemetria ──────────────────────────────────────────────────
    if (step === "telemetry") {
      return (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Passo {useSaga ? "3" : "2"} · Telemetria
                </p>
                <span className="rounded-full border border-amber-500/40 bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                  Opcional
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-100">Telemetria do voo</h2>
            </div>
          </div>

          {!telemetryCsv ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setTelemetryDragOver(true); }}
              onDragLeave={() => setTelemetryDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setTelemetryDragOver(false); const f = e.dataTransfer.files[0]; if (f) processCsvFile(f); }}
              className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed py-16 transition ${telemetryDragOver ? "border-sky-500 bg-sky-900/20" : "border-slate-700 bg-slate-900/30 hover:border-slate-600"}`}
            >
              <svg className="h-10 w-10 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-slate-300">Arraste o CSV do Garmin aqui</p>
              <label className="cursor-pointer rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700">
                Selecionar arquivo CSV
                <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processCsvFile(f); }} />
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-600/30 bg-emerald-900/15 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-300">CSV carregado</p>
                  <p className="text-xs text-slate-400">{telemetryFileName}</p>
                </div>
              </div>
              {telemetrySummary && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                    <p className="text-xs text-slate-500">Duração detectada</p>
                    <p className="font-semibold text-slate-200">{telemetrySummary.duration}</p>
                  </div>
                </div>
              )}
              <button type="button" onClick={() => { setTelemetryCsv(null); setTelemetryFileName(null); setTelemetrySummary(null); }} className="cursor-pointer text-xs text-red-400/80 underline-offset-4 hover:underline">
                Remover arquivo
              </button>
            </div>
          )}

          {telemetryError && <p className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{telemetryError}</p>}
          {telemetryProcessing && <p className="animate-pulse text-sm text-slate-400">Processando CSV...</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => setStep("mission")} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800">← Voltar</button>
            <button type="button" onClick={() => setStep("video")} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Pular</button>
            {telemetryCsv && (
              <button type="button" onClick={() => setStep("video")} className="cursor-pointer rounded-xl bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-500">Continuar →</button>
            )}
          </div>
        </div>
      );
    }

    // ── Passo 5: Vídeos ──────────────────────────────────────────────────────
    if (step === "video") {
      return (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Passo {useSaga ? "4" : "3"} · Vídeos
              </p>
              <span className="rounded-full border border-amber-500/40 bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">Opcional</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">Vídeos do voo</h2>
            <p className="mt-1 text-sm text-slate-400">Adicione vídeos. Você pode pular e adicionar depois na ficha.</p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setVideoDragOver(true); }}
            onDragLeave={() => setVideoDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setVideoDragOver(false); const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/")); if (files.length) setVideoFiles((p) => [...p, ...files]); }}
            className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed py-16 transition ${videoDragOver ? "border-violet-500 bg-violet-900/20" : "border-slate-700 bg-slate-900/30 hover:border-slate-600"}`}
          >
            <svg className="h-10 w-10 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
            </svg>
            <p className="text-sm text-slate-300">Arraste vídeos aqui</p>
            <label className="cursor-pointer rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700">
              Selecionar vídeos
              <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) setVideoFiles((p) => [...p, ...files]); }} />
            </label>
          </div>

          {videoFiles.length > 0 && (
            <ul className="space-y-2">
              {videoFiles.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
                  <p className="text-sm text-slate-200">{f.name} <span className="text-slate-500">({(f.size / 1024 / 1024).toFixed(1)} MB)</span></p>
                  <button type="button" onClick={() => setVideoFiles((p) => p.filter((_, j) => j !== i))} className="cursor-pointer text-xs text-red-400/80 hover:text-red-400">Remover</button>
                </li>
              ))}
            </ul>
          )}

          {saveError && <p className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{saveError}</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => setStep("telemetry")} disabled={saving} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50">← Voltar</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Salvando..." : "Pular e salvar"}
            </button>
            {videoFiles.length > 0 && (
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="cursor-pointer rounded-xl bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
                {saving ? "Salvando..." : "Concluir ficha →"}
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── Concluído ─────────────────────────────────────────────────────────────
    if (step === "done") {
      return (
        <div className="flex flex-col items-center space-y-6 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-100">Ficha concluída!</h2>
            <p className="mt-2 text-sm text-slate-400">
              O voo foi salvo com status <strong className="text-emerald-300">Realizado</strong>.
            </p>
            {selectedMissions.length > 0 && (
              <p className="mt-1 text-sm text-slate-400">
                {selectedMissions.length === 1 ? "Missão:" : "Missões:"}{" "}
                <strong className="text-slate-200">{selectedMissions.map((m) => m.name).join(", ")}</strong>
              </p>
            )}
          </div>

          {signed && (
            <div className="rounded-xl border border-emerald-600/30 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
              ✓ Ficha assinada como INVA.
            </div>
          )}

          {!signed && signingValidationErrors.length > 0 && (
            <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-left">
              <p className="mb-1 text-xs font-semibold text-amber-300">Complete a ficha antes de assinar:</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-200">
                {signingValidationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {!signed && signingValidationErrors.length === 0 && (
              <button
                type="button"
                onClick={() => setShowSignModal(true)}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-violet-600/40 bg-violet-900/30 px-6 py-3 text-sm font-semibold text-violet-300 hover:bg-violet-900/50"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                Assinar como INVA
              </button>
            )}
            <button
              type="button"
              onClick={() => onDone(savedFlightId ?? flightId)}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Ver ficha completa →
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  // ─── Sign modal ───────────────────────────────────────────────────────────
  const signModal = showSignModal ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assinatura eletrônica</p>
            <h3 className="text-lg font-semibold text-slate-100">Assinar como INVA</h3>
          </div>
          <button type="button" onClick={() => setShowSignModal(false)} disabled={signingInProgress} className="cursor-pointer rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">Fechar</button>
        </div>
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          Ao assinar, a ficha ficará <strong>bloqueada para edição</strong>. Ação irreversível.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            value={signingPassword}
            onChange={(e) => setSigningPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSign(); }}
            disabled={signingInProgress}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 disabled:opacity-60"
            placeholder="Confirme sua senha"
          />
        </label>
        {signingError && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">{signingError}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setShowSignModal(false)} disabled={signingInProgress} className="flex-1 cursor-pointer rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={() => void handleSign()} disabled={signingInProgress || !signingPassword} className="flex-1 cursor-pointer rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
            {signingInProgress ? "Assinando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ─── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Preencher Ficha</p>
              <p className="text-sm font-semibold text-slate-200">{flight.aircraft_ident ?? "—"}</p>
            </div>
          </div>
          {step !== "source" && step !== "done" && <StepBar current={step} useSaga={useSaga} />}
        </div>
      </header>

      <main className="flex-1">
        <div className="w-full px-4 py-8 md:px-6">
          {renderStep()}
        </div>
      </main>

      {signModal}
    </div>
  );
}
