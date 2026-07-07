import { useEffect, useState, type ReactNode } from "react";
import type { UserRole } from "../../lib/rbac";
import {
  loadNextMissions,
  loadStudentFlightSummary,
  loadStudentProfileCard,
  type ScheduleStudentFlightSummary,
  type ScheduleStudentNextMission,
  type ScheduleStudentSummary,
} from "../../lib/scheduleStudentSummary";

function parseBrDate(value: string): Date | null {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpiredDate(value: string): boolean {
  const date = parseBrDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole}h`;
  return `${whole}h${String(minutes).padStart(2, "0")}`;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</p>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-2 py-2 text-center">
      <p className="text-lg font-semibold text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <Card>
        <div className="h-4 w-1/2 rounded bg-slate-700/60" />
        <div className="mt-2 h-3 w-2/3 rounded bg-slate-700/40" />
        <div className="mt-1 h-3 w-1/3 rounded bg-slate-700/40" />
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-14 rounded-lg border border-slate-700/60 bg-slate-900/40" />
        ))}
      </div>
      <Card>
        <div className="h-3 w-1/3 rounded bg-slate-700/60" />
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-8 rounded bg-slate-700/30" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ScheduleStudentSummaryPanel({
  studentUserId,
  studentLabel,
  viewer,
  creditsSlot,
}: {
  /** id do usuário local do aluno; null quando é evento SAGA sem cadastro local. */
  studentUserId: string | null;
  studentLabel?: string;
  viewer: { userId: string; role: UserRole };
  creditsSlot?: ReactNode;
}) {
  // Três blocos independentes: cada um carrega e é exibido assim que fica pronto
  // (o perfil é uma leitura só e aparece quase instantâneo; voos e próxima missão
  // não bloqueiam mais um ao outro nem à identificação).
  const [profile, setProfile] = useState<ScheduleStudentSummary["profile"]>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [flightSummary, setFlightSummary] = useState<ScheduleStudentFlightSummary | null>(null);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [missions, setMissions] = useState<ScheduleStudentNextMission[] | null>(null);
  const [trackName, setTrackName] = useState<string | null>(null);
  const [missionsLoading, setMissionsLoading] = useState(false);

  useEffect(() => {
    if (!studentUserId) {
      setProfile(null);
      setFlightSummary(null);
      setMissions(null);
      setTrackName(null);
      setProfileLoading(false);
      setFlightsLoading(false);
      setMissionsLoading(false);
      return;
    }
    let cancelled = false;
    setProfile(null);
    setFlightSummary(null);
    setMissions(null);
    setTrackName(null);
    setProfileLoading(true);
    setFlightsLoading(true);
    setMissionsLoading(true);

    void loadStudentProfileCard(studentUserId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    void loadStudentFlightSummary({ studentUserId, viewer })
      .then((data) => {
        if (!cancelled) setFlightSummary(data);
      })
      .catch(() => {
        if (!cancelled) setFlightSummary(null);
      })
      .finally(() => {
        if (!cancelled) setFlightsLoading(false);
      });

    void loadNextMissions(studentUserId)
      .then((data) => {
        if (cancelled) return;
        setMissions(data.nextMissions);
        setTrackName(data.primaryTrackName);
      })
      .catch(() => {
        if (!cancelled) setMissions([]);
      })
      .finally(() => {
        if (!cancelled) setMissionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // viewer é estável (id/role do usuário logado); recarrega ao trocar o aluno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId]);

  if (!studentUserId) {
    return (
      <div className="space-y-3">
        <Card>
          <SectionTitle>Resumo do aluno</SectionTitle>
          <p className="text-xs text-slate-400">
            {studentLabel
              ? "Aluno da agenda SAGA sem cadastro local — sem dados de resumo disponíveis."
              : "Selecione um aluno para ver o resumo."}
          </p>
        </Card>
        {creditsSlot}
      </div>
    );
  }

  const metrics = flightSummary?.metrics ?? null;

  return (
    <div className="space-y-3">
      {/* 1. Identificação + certificado médico */}
      <Card>
        <SectionTitle>Aluno</SectionTitle>
        {profileLoading && !profile ? (
          <div className="space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-700/60" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/40" />
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-100">{profile?.fullName || studentLabel || "—"}</p>
            <div className="mt-1 space-y-0.5 text-xs text-slate-400">
              <p>{profile?.email || "Sem email"}</p>
              <p>ANAC {profile?.anacCode || "—"}</p>
              <p>
                <span className="text-slate-500">Telefone:</span> {profile?.phone || "—"}
              </p>
              <p>
                <span className="text-slate-500">Trilha:</span>{" "}
                {missionsLoading && !missions ? "…" : trackName || "—"}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-700/60 pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Certificado médico
              </p>
              <div className="grid gap-1 text-xs text-slate-300">
                <p>
                  <span className="text-slate-500">Classe:</span> {profile?.medical.classe || "—"}
                </p>
                <p>
                  <span className="text-slate-500">Validade:</span>{" "}
                  <span className={profile && isExpiredDate(profile.medical.validade) ? "text-red-400" : ""}>
                    {profile?.medical.validade || "—"}
                    {profile && isExpiredDate(profile.medical.validade) ? " · vencida" : ""}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Órgão:</span> {profile?.medical.orgao_expedidor || "—"}
                </p>
                {profile?.medical.observacoes ? (
                  <p>
                    <span className="text-slate-500">Obs:</span> {profile.medical.observacoes}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* 3. Créditos — logo abaixo dos dados do aluno (carrega independente do resumo). */}
      {creditsSlot}

      {flightsLoading && !flightSummary ? (
        <SummarySkeleton />
      ) : (
        <>
          {/* 2. Resumo de voos executados */}
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Voos executados" value={metrics?.executedCount ?? 0} />
            <Metric label="Total de horas" value={formatHours(metrics?.totalHours ?? 0)} />
            <Metric label="Total de pousos" value={metrics?.totalLandings ?? 0} />
            <Metric label="Voos solos" value={metrics?.soloCount ?? 0} />
          </div>

          {/* 4. Últimos 5 voos executados (data DESC) */}
          <Card>
            <SectionTitle>Últimos voos executados</SectionTitle>
            {flightSummary && flightSummary.lastFlights.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[380px] border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="border-b border-slate-700 px-1.5 py-1">Data</th>
                      <th className="border-b border-slate-700 px-1.5 py-1">Duração</th>
                      <th className="border-b border-slate-700 px-1.5 py-1">Avião</th>
                      <th className="border-b border-slate-700 px-1.5 py-1">Instrutor</th>
                      <th className="border-b border-slate-700 px-1.5 py-1">Missão</th>
                      <th className="border-b border-slate-700 px-1.5 py-1">Pousos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flightSummary.lastFlights.map((flight) => (
                      <tr key={flight.id} className="border-b border-slate-800/60">
                        <td className="whitespace-nowrap px-1.5 py-1 align-top">
                          <span className="block text-slate-200">{flight.dateLabel}</span>
                          <span className="block text-[11px] text-slate-400">{flight.timeLabel}</span>
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-1 align-top text-slate-300">{flight.durationLabel}</td>
                        <td className="whitespace-nowrap px-1.5 py-1 align-top text-slate-300">{flight.aircraft}</td>
                        <td className="px-1.5 py-1 align-top text-slate-300">{flight.instructor}</td>
                        <td className="px-1.5 py-1 align-top text-slate-300">{flight.mission}</td>
                        <td className="px-1.5 py-1 align-top text-slate-300">{flight.landings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhum voo executado encontrado.</p>
            )}
          </Card>
        </>
      )}

      {/* 5. Próxima missão (mesma lógica da jornada do aluno) — carrega independente. */}
      {missionsLoading && !missions ? (
        <Card>
          <SectionTitle>Próxima missão</SectionTitle>
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-slate-700/30" />
          </div>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Próxima missão</SectionTitle>
          {missions && missions.length > 0 ? (
            <div className="space-y-2">
              {missions.map((mission, index) => (
                  <div
                    key={`${mission.trackName}-${index}`}
                    className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-sky-100">{mission.missionName}</p>
                    <p className="mt-0.5 text-[11px] text-sky-300/90">
                      {mission.trackName} · {mission.stageName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {mission.durationMinutes} min · {mission.missionType}
                    </p>
                    {mission.maneuvers.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-slate-300">
                        {mission.maneuvers.map((maneuver, idx) => (
                          <li key={`${mission.trackName}-${index}-${idx}`} className="line-clamp-2">
                            {maneuver}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
          ) : (
            <p className="text-xs text-slate-500">
              Sem próxima missão (trilha completa ou sem trilha ativa).
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
