import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";
import { getStudentCreditStatement } from "../lib/creditsDb";
import { FLIGHT_CREDIT_PURCHASE_PATH, navigateToTab } from "../lib/routedTabs";
import { loadNextMissions } from "../lib/scheduleStudentSummary";
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

function formatMissionDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

export function StudentHome({ onOpenFlights, onOpenNotices, onOpenSchedule, onOpenCredits, onOpenJourney }: StudentHomeProps) {
  const { user, configured } = useAuth();
  const { canTab } = usePermissions();
  const { enabled: clubEnabled, isClubMember } = useFlightReviewClub();
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
      // Mesma lógica da jornada: após a última missão aprovada (pula vazias anteriores).
      const { nextMissions } = await loadNextMissions(user.id);
      const next = nextMissions[0] ?? null;
      if (!next) {
        setNextMission(null);
        return;
      }
      setNextMission({
        trackName: next.trackName,
        stageName: next.stageName,
        missionName: next.missionName,
        progressLabel: `${next.missionIndex + 1} de ${next.missionTotal}`,
        durationLabel: formatMissionDuration(next.durationMinutes),
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
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <StudentPageHeader
            eyebrow="Cockpit do aluno"
            title="Painel do aluno"
            description={headerDescription}
          />
          {clubEnabled && isClubMember ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-amber-100 shadow-sm shadow-amber-950/30">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-300 text-slate-950">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0L7.681 6.37l-3.766.302c-.835.067-1.173 1.107-.536 1.651l2.868 2.454-.877 3.67c-.195.813.691 1.456 1.405 1.02L10 13.497l3.225 1.97c.714.436 1.6-.207 1.405-1.02l-.877-3.67 2.868-2.454c.637-.544.299-1.584-.536-1.65l-3.766-.303-1.451-3.486z" clipRule="evenodd" />
                </svg>
              </span>
              Assinante Flight Review Club
            </span>
          ) : null}
        </div>
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
