// Loader do "Resumo do aluno" exibido na coluna/subaba do modal de detalhes da escala.
// Todas as consultas são somente leitura e rodam de forma independente do carregamento
// rápido do modal (o painel tem skeleton próprio). Nada aqui pode atrasar/derrubar a escala.
import { getProfile, listProfileNicknamesByUserIds, type PilotMedical, type UserRole } from "./rbac";
import { listStudentTrainingTracks } from "./trainingTracksDb";
import {
  getFlightRecordMetaBatch,
  listStudentFlightHistory,
  listStudentTrainingFlights,
  type SavedFlightListItem,
} from "./flightsDb";
import { loadFullFlightListDisplayInfos } from "./flightListDisplayCache";
import {
  buildFlightDisplayInfo,
  formatMinutes,
  getDateBase,
  getFlightDateTimeMs,
  isCompletedFlight,
  type FlightDisplayInfo,
} from "./flightDisplay";
import type { StudentTrainingTrack, TrainingMission, TrainingStage } from "../types/trainingTrack";

type FlightOutcome = "approved" | "failed" | "";

export type ScheduleStudentSummaryFlight = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  aircraft: string;
  instructor: string;
  mission: string;
  landings: number;
};

export type ScheduleStudentNextMission = {
  trackName: string;
  stageName: string;
  missionName: string;
  missionType: string;
  durationMinutes: number;
  /** Manobras/descrição da missão (mesma lista do card da jornada). */
  maneuvers: string[];
};

export type ScheduleStudentSummary = {
  profile: {
    fullName: string;
    email: string;
    anacCode: string;
    phone: string;
    medical: PilotMedical;
  } | null;
  /** Trilha ativa (primária) que o aluno está cursando. */
  trackName: string | null;
  metrics: {
    executedCount: number;
    totalHours: number;
    totalLandings: number;
    soloCount: number;
    lastFlightIso: string | null;
  };
  lastFlights: ScheduleStudentSummaryFlight[];
  nextMissions: ScheduleStudentNextMission[];
  /** true quando concluído sem erro fatal (mesmo que parcial). */
  ok: boolean;
};

const EMPTY_SUMMARY: ScheduleStudentSummary = {
  profile: null,
  trackName: null,
  metrics: { executedCount: 0, totalHours: 0, totalLandings: 0, soloCount: 0, lastFlightIso: null },
  lastFlights: [],
  nextMissions: [],
  ok: false,
};

function flightMissionIds(flight: SavedFlightListItem): string[] {
  const fromMaterialized = (() => {
    if (!flight.training_mission_ids_json) return [];
    try {
      const parsed = JSON.parse(flight.training_mission_ids_json);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
    } catch {
      return [];
    }
  })();
  return Array.from(new Set([...fromMaterialized, flight.training_mission_id ?? ""].filter(Boolean)));
}

// Solo = missão do tipo "SL". O tipo já vem materializado no snapshot json do voo.
function flightHasSoloMission(snapshotJsonRaw: string | null | undefined): boolean {
  if (!snapshotJsonRaw) return false;
  try {
    const parsed = JSON.parse(snapshotJsonRaw) as {
      missionType?: string;
      snapshots?: Array<{ missionType?: string }>;
    };
    if (parsed?.missionType === "SL") return true;
    return Array.isArray(parsed?.snapshots) && parsed.snapshots.some((snapshot) => snapshot?.missionType === "SL");
  } catch {
    return false;
  }
}

// Detecção de aprovação idêntica à jornada do aluno (JornadaTab/useFormationProgress).
function resolveOutcome(risk: {
  instructorOutcome?: FlightOutcome;
  instructorOpinionMd?: string;
} | undefined): FlightOutcome {
  if (!risk) return "";
  const explicitOutcome = risk.instructorOutcome;
  if (explicitOutcome) return explicitOutcome;
  if (risk.instructorOpinionMd) {
    const normalized = risk.instructorOpinionMd
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (/\b(aprovado|aprovada|satisfatorio|apto|apta)\b/.test(normalized)) return "approved";
    if (/\b(reprovado|reprovada|insatisfatorio|inapto|nao aprovado|nao aprovada)\b/.test(normalized)) return "failed";
  }
  return "";
}

// Próxima missão por trilha ativa — mesma lógica de timeline da jornada do aluno.
async function loadNextMissions(
  studentUserId: string,
): Promise<{ nextMissions: ScheduleStudentNextMission[]; primaryTrackName: string | null }> {
  const tracksRes = await listStudentTrainingTracks(studentUserId);
  const activeTracks = (tracksRes.data ?? [])
    .filter((row): row is StudentTrainingTrack & { track: NonNullable<StudentTrainingTrack["track"]> } =>
      row.status === "active" && !!row.track,
    )
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const primaryTrackName = activeTracks[0]?.track.name ?? null;
  if (activeTracks.length === 0) return { nextMissions: [], primaryTrackName: null };

  const trackIds = activeTracks.map((row) => row.trackId).filter(Boolean);
  const flightsRes = await listStudentTrainingFlights({ userId: studentUserId, role: "aluno" }, trackIds);
  const flights = flightsRes.data ?? [];

  const metaMap = await getFlightRecordMetaBatch(flights.map((flight) => flight.id));

  const approvedMissionIds = new Set<string>();
  for (const flight of flights) {
    const meta = metaMap.get(flight.id) ?? null;
    const outcome = resolveOutcome(meta?.risk);
    if (outcome !== "approved") continue;
    const missionIds = Array.from(
      new Set([
        ...flightMissionIds(flight),
        ...(meta?.training?.missionIds ?? []),
        meta?.training?.missionId ?? "",
      ].filter(Boolean)),
    );
    missionIds.forEach((id) => approvedMissionIds.add(id));
  }

  const result: ScheduleStudentNextMission[] = [];
  for (const assignment of activeTracks) {
    const track = assignment.track;
    const missionRows: Array<{ stage: TrainingStage; mission: TrainingMission }> = track.stages.flatMap((stage) =>
      stage.missions.map((mission) => ({ stage, mission })),
    );
    if (missionRows.length === 0) continue;
    const lastApprovedIndex = missionRows.reduce(
      (lastIdx, row, idx) => (approvedMissionIds.has(row.mission.id) ? idx : lastIdx),
      -1,
    );
    const firstOpenIndex =
      lastApprovedIndex >= 0
        ? missionRows.findIndex((row, i) => i > lastApprovedIndex && !approvedMissionIds.has(row.mission.id))
        : missionRows.findIndex((row) => !approvedMissionIds.has(row.mission.id));
    if (firstOpenIndex < 0) continue; // trilha completa
    const next = missionRows[firstOpenIndex]!;
    result.push({
      trackName: track.name,
      stageName: next.stage.name,
      missionName: next.mission.name,
      missionType: next.mission.type,
      durationMinutes: next.mission.durationMinutes,
      maneuvers: next.mission.maneuvers ?? [],
    });
  }
  return { nextMissions: result, primaryTrackName };
}

export async function loadScheduleStudentSummary(params: {
  studentUserId: string;
  viewer: { userId: string; role: UserRole };
}): Promise<ScheduleStudentSummary> {
  const { studentUserId, viewer } = params;

  const [profileRes, historyRes, nextMissionsRes] = await Promise.allSettled([
    getProfile(studentUserId),
    listStudentFlightHistory({
      actorUserId: viewer.userId,
      actorRole: viewer.role,
      studentUserId,
    }),
    loadNextMissions(studentUserId),
  ]);

  const summary: ScheduleStudentSummary = {
    ...EMPTY_SUMMARY,
    metrics: { ...EMPTY_SUMMARY.metrics },
    ok: true,
  };

  if (profileRes.status === "fulfilled" && profileRes.value.data) {
    const profile = profileRes.value.data;
    summary.profile = {
      fullName: profile.fullName || "",
      email: profile.email || "",
      anacCode: profile.anacCode || "",
      phone: profile.phone || "",
      medical: profile.anacMedical,
    };
  }

  if (nextMissionsRes.status === "fulfilled") {
    summary.nextMissions = nextMissionsRes.value.nextMissions;
    summary.trackName = nextMissionsRes.value.primaryTrackName;
  }

  const history: SavedFlightListItem[] =
    historyRes.status === "fulfilled" ? historyRes.value.data ?? [] : [];

  // Métricas a partir dos campos materializados (block_time_minutes, landings, snapshot).
  const executed = history.filter((item) => isCompletedFlight(item, buildFlightDisplayInfo(item, null)));
  let totalMinutes = 0;
  let totalLandings = 0;
  let soloCount = 0;
  let lastFlightMs = -Infinity;
  let lastFlightIso: string | null = null;
  for (const item of executed) {
    const info = buildFlightDisplayInfo(item, null);
    totalMinutes += info.totalFlightMinutes;
    totalLandings += info.landings;
    if (flightHasSoloMission(item.training_snapshot_json)) soloCount += 1;
    const ms = getFlightDateTimeMs(item, info);
    if (ms > lastFlightMs) {
      lastFlightMs = ms;
      lastFlightIso = info.flightDateIso ?? item.flight_date ?? null;
    }
  }
  summary.metrics = {
    executedCount: executed.length,
    totalHours: totalMinutes / 60,
    totalLandings,
    soloCount,
    lastFlightIso,
  };

  // Últimos 5 voos executados (data DESC). Só para esses buscamos a ficha completa
  // (instrutor/missão/duração precisos) — no máximo 5 leituras extras.
  const recent = [...executed]
    .sort((a, b) => getDateBase(b).getTime() - getDateBase(a).getTime())
    .slice(0, 5);
  let recentInfoById: Record<string, FlightDisplayInfo> = {};
  const nicknameByInstructorId = await (async () => {
    const ids = Array.from(new Set(recent.map((item) => item.instructor_user_id ?? "").filter(Boolean)));
    if (ids.length === 0) return {} as Record<string, string>;
    try {
      return await listProfileNicknamesByUserIds(ids);
    } catch {
      return {} as Record<string, string>;
    }
  })();
  try {
    recentInfoById = await loadFullFlightListDisplayInfos(recent, { concurrency: 4 });
  } catch {
    recentInfoById = {};
  }
  summary.lastFlights = recent.map((item) => {
    const info = recentInfoById[item.id] ?? buildFlightDisplayInfo(item, null);
    const date = getDateBase(item, info);
    const nickname = item.instructor_user_id ? nicknameByInstructorId[item.instructor_user_id] : "";
    // DD/MM (o ano é redundante na lista); a hora vai numa segunda linha na coluna.
    const dateShort = Number.isNaN(date.getTime())
      ? "—"
      : `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      id: item.id,
      dateLabel: dateShort,
      timeLabel: info.startTime || item.start_time || "—",
      durationLabel: info.totalFlightMinutes > 0 ? formatMinutes(info.totalFlightMinutes) : "—",
      aircraft: info.aircraft || item.aircraft_ident || "—",
      instructor: (nickname && nickname.trim()) || info.instructorName || "—",
      mission: info.trainingMissionName && info.trainingMissionName !== "—" ? info.trainingMissionName : "—",
      landings: info.landings ?? item.landings ?? 0,
    };
  });

  return summary;
}
