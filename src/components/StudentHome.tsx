import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { getStudentCreditStatement } from "../lib/creditsDb";
import { listStudentTrainingFlights, type SavedFlightListItem } from "../lib/flightsDb";
import { FLIGHT_CREDIT_PURCHASE_PATH, navigateToTab } from "../lib/routedTabs";
import { listStudentTrainingTracks } from "../lib/trainingTracksDb";
import type { TrainingMission, TrainingStage, TrainingTrack } from "../types/trainingTrack";
import { NoticeFeed } from "./NoticeFeed";
import { UpcomingFlightsCard } from "./UpcomingFlightsCard";
import { StudentPageHeader, StudentStatusCard } from "./student/StudentExperience";
import { Skeleton } from "./ui/Skeleton";

type StudentHomeProps = {
  onOpenFlights: () => void;
  onOpenNotices: () => void;
  onOpenSchedule: () => void;
  onOpenCredits: () => void;
  onOpenJourney: () => void;
};

type NextMissionSummary = {
  trackName: string;
  stageName: string;
  missionName: string;
  progressLabel: string;
  durationLabel: string | null;
};

function formatHours(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `${safe.toFixed(safe >= 10 ? 0 : 1)}h`;
}

function formatDateLabel(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) return "agora";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

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

function flattenTrackMissions(track: TrainingTrack): Array<{ stage: TrainingStage; mission: TrainingMission }> {
  return track.stages.flatMap((stage) => stage.missions.map((mission) => ({ stage, mission })));
}

function formatMissionDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

export function StudentHome({ onOpenFlights, onOpenNotices, onOpenSchedule, onOpenCredits, onOpenJourney }: StudentHomeProps) {
  const { user, configured } = useAuth();
  const { canTab } = usePermissions();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditGeneratedAt, setCreditGeneratedAt] = useState("");
  const [creditLoading, setCreditLoading] = useState(true);
  const [nextMission, setNextMission] = useState<NextMissionSummary | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const canSchedule = canTab("schedule");
  const canOpenCredits = canTab("creditos");
  const canOpenJourney = canTab("jornada");

  const loadCredits = useCallback(async () => {
    if (!user || !configured || !canOpenCredits) {
      setCreditBalance(null);
      setCreditLoading(false);
      return;
    }
    setCreditLoading(true);
    try {
      const statement = await getStudentCreditStatement({
        viewer: { userId: user.id, role: user.role },
        studentUserId: user.id,
      });
      setCreditBalance(statement.totals.balanceHours);
      setCreditGeneratedAt(statement.generatedAt);
    } catch {
      setCreditBalance(null);
      setCreditGeneratedAt("");
    } finally {
      setCreditLoading(false);
    }
  }, [canOpenCredits, configured, user]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  const loadNextMission = useCallback(async () => {
    if (!user || !configured || !canOpenJourney) {
      setNextMission(null);
      setMissionLoading(false);
      return;
    }
    setMissionLoading(true);
    try {
      const tracksRes = await listStudentTrainingTracks(user.id);
      const assignments = (tracksRes.data ?? []).filter((row) => row.track);
      const assignment = assignments[0];
      const track = assignment?.track ?? null;
      if (!track) {
        setNextMission(null);
        return;
      }

      const trackIds = assignments.map((row) => row.trackId).filter(Boolean);
      const flightsRes = await listStudentTrainingFlights({ userId: user.id, role: user.role }, trackIds);
      const completedIds = new Set((flightsRes.data ?? []).flatMap((flight) => flightMissionIds(flight)));
      const rows = flattenTrackMissions(track);
      if (rows.length === 0) {
        setNextMission(null);
        return;
      }

      const nextIndex = rows.findIndex((row) => !completedIds.has(row.mission.id));
      const index = nextIndex >= 0 ? nextIndex : rows.length - 1;
      const row = rows[index];
      setNextMission({
        trackName: track.name,
        stageName: row.stage.name,
        missionName: row.mission.name,
        progressLabel: nextIndex >= 0 ? `${index + 1} de ${rows.length}` : "Trilha concluida",
        durationLabel: formatMissionDuration(row.mission.durationMinutes),
      });
    } catch {
      setNextMission(null);
    } finally {
      setMissionLoading(false);
    }
  }, [canOpenJourney, configured, user]);

  useEffect(() => {
    void loadNextMission();
  }, [loadNextMission]);

  const headerDescription = useMemo(
    () =>
      canSchedule
        ? "Proximo voo, missao da jornada e saldo ficam juntos para voce decidir o que fazer agora."
        : "Acompanhe sua jornada, seus voos e seus creditos em um resumo rapido.",
    [canSchedule],
  );

  const openCreditPurchase = useCallback(() => {
    if (canOpenCredits) {
      navigateToTab(FLIGHT_CREDIT_PURCHASE_PATH);
    } else {
      onOpenCredits();
    }
  }, [canOpenCredits, onOpenCredits]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 md:p-5">
        <StudentPageHeader
          eyebrow="Cockpit do aluno"
          title="Painel do aluno"
          description={headerDescription}
        />
        <div className="mt-4 grid items-stretch gap-3 md:grid-cols-3">
          {missionLoading ? (
            <div className="min-h-[156px] rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-5 w-44" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ) : (
            <StudentStatusCard
              eyebrow="Proxima missao"
              title={nextMission?.missionName ?? "Jornada em preparacao"}
              description={
                nextMission
                  ? `${nextMission.stageName} - ${nextMission.trackName}${nextMission.durationLabel ? ` - ${nextMission.durationLabel}` : ""}`
                  : "Quando uma trilha estiver ativa, a proxima missao aparece aqui."
              }
              action={
                <button
                  type="button"
                  onClick={onOpenJourney}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  {nextMission?.progressLabel ?? "Ver jornada"}
                </button>
              }
            />
          )}
          {canOpenCredits ? (
            creditLoading ? (
              <div className="min-h-[156px] rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-7 w-20" />
                <Skeleton className="mt-3 h-3 w-32" />
              </div>
            ) : (
              <StudentStatusCard
                eyebrow="Saldo de créditos"
                title={creditBalance == null ? "Indisponivel" : formatHours(creditBalance)}
                description={creditGeneratedAt ? `Atualizado ${formatDateLabel(creditGeneratedAt)}` : "Extrato e compra ficam em Creditos."}
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onOpenCredits}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Ver extrato
                    </button>
                    <button
                      type="button"
                      onClick={openCreditPurchase}
                      className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
                    >
                      Comprar
                    </button>
                  </div>
                }
              />
            )
          ) : null}
          <StudentStatusCard
            eyebrow="Agenda"
            title={canSchedule ? "Agendar proximo voo" : "Consultar agenda"}
            description={
              canSchedule
                ? "Escolha aeronave, data e horario em uma escala pensada para solicitar voo rapido."
                : "Veja seus proximos horarios e acompanhe pendencias antes de voar."
            }
            action={
              <button
                type="button"
                onClick={canSchedule ? onOpenSchedule : onOpenFlights}
                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
              >
                {canSchedule ? "Agendar voo" : "Ver agenda"}
              </button>
            }
          />
        </div>
      </section>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <UpcomingFlightsCard
          className="min-w-0 w-full"
          onOpenFlights={onOpenFlights}
          subtitle="Proximos voos da escala e voos salvos, com pendencias em destaque quando existirem."
        />
        <NoticeFeed
          className="min-w-0 w-full"
          limit={3}
          eyebrow="Comunicados"
          title="Ultimos avisos"
          showRefresh={false}
          actionLabel="Ver todos"
          onAction={onOpenNotices}
        />
      </div>
    </div>
  );
}
