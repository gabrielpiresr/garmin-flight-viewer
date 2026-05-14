import { useEffect, useMemo, useState } from "react";
import { getAdminStudentsProgress, getAdminUserDetail } from "../../lib/adminUsersDb";
import type { AdminStudentAgendaBucketKey, AdminStudentProgressRow, AdminStudentProgressStatus, AdminStudentsProgressData } from "../../types/adminStudents";
import type { AdminUserDetail, AdminUserFlight, AdminUserPlannedFlight } from "../../types/adminUsers";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { AdminUserCreditsSection } from "./AdminUserCreditsSection";

const DEFAULT_INACTIVE_DAYS = 14;
const INACTIVE_OPTIONS = [7, 14, 21, 30] as const;

const BUCKET_LABEL: Record<AdminStudentAgendaBucketKey, string> = {
  yesterday: "Voaram ontem",
  today: "Voam hoje",
  tomorrow: "Voam amanha",
  week: "Voam nessa semana",
};

const STATUS_LABEL: Record<AdminStudentProgressStatus, string> = {
  active: "Em ritmo",
  watch: "Observar",
  inactive: "Sem voar",
  noFlights: "Sem voos",
};

const STATUS_CLASS: Record<AdminStudentProgressStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  inactive: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  noFlights: "border-slate-600 bg-slate-800/60 text-slate-300",
};

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(flight: AdminUserFlight): string {
  return `${formatDate(flight.flightDate ?? flight.createdAt)}${flight.startTime ? ` ${flight.startTime}` : ""}`;
}

function formatHours(value: number | null | undefined): string {
  return `${(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

function formatDuration(seconds: number | null | undefined): string {
  return seconds ? formatHours(seconds / 3600) : "-";
}

function displayName(student: Pick<AdminStudentProgressRow, "profile" | "name" | "email" | "userId">): string {
  return student.profile.fullName || student.name || student.email || student.userId;
}

function searchText(student: AdminStudentProgressRow): string {
  return [displayName(student), student.email, student.profile.anacCode, student.userId]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lastFlightLabel(student: AdminStudentProgressRow): string {
  if (student.daysSinceLastFlight === null) return "Sem voos executados";
  if (student.daysSinceLastFlight === 0) return "Voou hoje";
  if (student.daysSinceLastFlight === 1) return "1 dia sem voar";
  return `${student.daysSinceLastFlight} dias sem voar`;
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function StudentMiniList({
  title,
  students,
  empty,
  onOpen,
}: {
  title: string;
  students: AdminStudentProgressRow[];
  empty: string;
  onOpen: (student: AdminStudentProgressRow) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{students.length}</span>
      </div>
      {students.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {students.slice(0, 6).map((student) => (
            <button
              key={student.userId}
              type="button"
              onClick={() => onOpen(student)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-left transition hover:border-emerald-500/40 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-slate-100">{displayName(student)}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[student.status]}`}>
                  {STATUS_LABEL[student.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {formatHours(student.executed.hours)} | ultimo {formatDate(student.executed.lastFlightAt)} | prox. {formatDate(student.planned.nextFlightAt)}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FlightCard({ flight, onOpen }: { flight: AdminUserFlight; onOpen: (flightId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(flight.id)}
      className="w-full rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-left transition hover:border-cyan-500/40 hover:bg-slate-900"
    >
      <p className="text-xs text-slate-500">{formatDateTime(flight)} | {flight.aircraftIdent || "Aeronave não informada"}</p>
      <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
        <span>Duração: {formatDuration(flight.durationSec)}</span>
        <span>Pousos: {flight.landings || 0}</span>
        <span>Rota: {flight.route || "-"}</span>
        <span>Instrutor: {flight.instructorName || "-"}</span>
      </div>
    </button>
  );
}

function IntentionCard({ plan }: { plan: AdminUserPlannedFlight }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">Semana {formatDate(plan.weekStart)}</p>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">{plan.status}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {plan.requestedFlightsCount} voos | {formatHours(plan.totalHours)} | atualizado {formatDate(plan.updatedAt)}
      </p>
    </div>
  );
}

function StudentDetailModal({
  student,
  detail,
  loading,
  onClose,
  onOpenFlight,
}: {
  student: AdminStudentProgressRow;
  detail: AdminUserDetail | null;
  loading: boolean;
  onClose: () => void;
  onOpenFlight: (flightId: string) => void;
}) {
  const source = detail ?? student;
  const executedFlights = detail?.executedFlights ?? student.recentExecutedFlights;
  const plannedFlights = detail?.plannedFlights ?? student.upcomingFlights;
  const intentions = detail?.futureIntentions ?? student.futureIntentions;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Aluno</p>
            <h2 className="mt-1 break-words text-xl font-semibold text-slate-100">{displayName(student)}</h2>
            <p className="break-words text-sm text-slate-500">{student.email} | ANAC {student.profile.anacCode || "-"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-5">
          <SummaryCard label="Horas executadas" value={formatHours(source.executed.hours)} hint={`${source.executed.count} voos`} />
          <SummaryCard label="Pousos" value={source.executed.landings} hint={`Último ${formatDate(source.executed.lastFlightAt)}`} />
          <SummaryCard label="Próximos voos" value={source.planned.count} hint={`Próximo ${formatDate(source.planned.nextFlightAt)}`} />
          <SummaryCard label="Intenções" value={source.intentions.requestedFlights} hint={formatHours(source.intentions.requestedHours)} />
          <SummaryCard label="Ritmo" value={STATUS_LABEL[student.status]} hint={lastFlightLabel(student)} />
        </div>

        {detail?.role === "aluno" ? (
          <AdminUserCreditsSection studentUserId={detail.userId} studentName={displayName(student)} />
        ) : null}

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Historico executado</p>
            <div className="space-y-2">
              {executedFlights.slice(0, 30).map((flight) => <FlightCard key={flight.id} flight={flight} onOpen={onOpenFlight} />)}
              {executedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo executado encontrado.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Proximos voos</p>
            <div className="space-y-2">
              {plannedFlights.slice(0, 30).map((flight) => <FlightCard key={flight.id} flight={flight} onOpen={onOpenFlight} />)}
              {plannedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo planejado encontrado.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Intenções futuras</p>
            <div className="space-y-2">
              {intentions.slice(0, 30).map((plan) => <IntentionCard key={plan.id} plan={plan} />)}
              {intentions.length === 0 ? <p className="text-sm text-slate-500">Nenhuma intenção futura encontrada.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FlightModal({ flightId, onClose }: { flightId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            Fechar ficha
          </button>
        </div>
        <FlightDetailView flightId={flightId} onBack={onClose} backLabel="Voltar ao aluno" />
      </div>
    </div>
  );
}

export function AdminStudentsTab() {
  const { showToast } = useToast();
  const [inactiveDays, setInactiveDays] = useState(DEFAULT_INACTIVE_DAYS);
  const [customInactiveDays, setCustomInactiveDays] = useState(String(DEFAULT_INACTIVE_DAYS));
  const [data, setData] = useState<AdminStudentsProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<AdminStudentProgressRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);

  async function load(nextInactiveDays = inactiveDays) {
    setLoading(true);
    try {
      const next = await getAdminStudentsProgress({ today: isoDate(new Date()), inactiveDays: nextInactiveDays });
      setData(next);
    } catch (e) {
      showToast({ variant: "error", message: e instanceof Error ? e.message : "Falha ao carregar alunos." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(DEFAULT_INACTIVE_DAYS);
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setSelectedDetail(null);
    void getAdminUserDetail(selectedStudent.userId)
      .then((detail) => {
        if (!cancelled) setSelectedDetail(detail);
      })
      .catch((e) => {
        if (!cancelled) showToast({ variant: "error", message: e instanceof Error ? e.message : "Falha ao carregar detalhe do aluno." });
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, showToast]);

  const filteredStudents = useMemo(() => {
    const normalized = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const students = data?.students ?? [];
    if (!normalized) return students;
    return students.filter((student) => searchText(student).includes(normalized));
  }, [data?.students, query]);

  const inactiveStudents = useMemo(
    () => filteredStudents.filter((student) => student.status === "inactive" || student.status === "noFlights"),
    [filteredStudents],
  );

  const bucketStudents = useMemo(() => {
    const map = {} as Record<AdminStudentAgendaBucketKey, AdminStudentProgressRow[]>;
    (["yesterday", "today", "tomorrow", "week"] as AdminStudentAgendaBucketKey[]).forEach((key) => {
      map[key] = filteredStudents.filter((student) => student.agenda[key].flights > 0);
    });
    return map;
  }, [filteredStudents]);

  function changeInactiveDays(next: number) {
    setInactiveDays(next);
    setCustomInactiveDays(String(next));
    void load(next);
  }

  function applyCustomDays() {
    const parsed = Number(customInactiveDays);
    const next = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_INACTIVE_DAYS;
    changeInactiveDays(next);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Acompanhamento pedagogico</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Alunos</h2>
            <p className="mt-1 text-sm text-slate-400">Ritmo de voo, horas acumuladas, proximas aulas e alunos que precisam de atencao.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 text-xs font-medium text-slate-400">
              Buscar aluno
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, email ou ANAC"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Sem voar ha</p>
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1">
                {INACTIVE_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => changeInactiveDays(days)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${inactiveDays === days ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            <label className="w-28 text-xs font-medium text-slate-400">
              Custom
              <input
                type="number"
                min={1}
                max={180}
                value={customInactiveDays}
                onChange={(event) => setCustomInactiveDays(event.target.value)}
                onBlur={applyCustomDays}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyCustomDays();
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Alunos" value={data.summary.totalStudents} hint={`${data.summary.activeStudents} em ritmo`} />
            <SummaryCard label="Sem voar" value={data.summary.inactiveStudents + data.summary.studentsWithoutFlights} hint={`corte ${data.inactiveDays} dias`} />
            <SummaryCard label="Horas totais" value={formatHours(data.summary.totalHours)} hint={`${data.summary.totalExecutedFlights} voos`} />
            <SummaryCard label="Ontem" value={data.buckets.yesterday.flights} hint={`${data.buckets.yesterday.students} alunos`} />
            <SummaryCard label="Hoje" value={data.buckets.today.flights} hint={`${data.buckets.today.students} alunos`} />
            <SummaryCard label="Amanha" value={data.buckets.tomorrow.flights} hint={`${data.buckets.tomorrow.students} alunos`} />
            <SummaryCard label="Semana" value={data.buckets.week.flights} hint={`${data.buckets.week.students} alunos`} />
          </section>

          <section className="grid gap-4 xl:grid-cols-5">
            <StudentMiniList title="Sem voar ha muito tempo" students={inactiveStudents} empty="Nenhum aluno parado nesse corte." onOpen={setSelectedStudent} />
            {(["yesterday", "today", "tomorrow", "week"] as AdminStudentAgendaBucketKey[]).map((key) => (
              <StudentMiniList key={key} title={BUCKET_LABEL[key]} students={bucketStudents[key]} empty="Nenhum aluno nesse grupo." onOpen={setSelectedStudent} />
            ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/45">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">Todos os alunos</h3>
              <p className="text-xs text-slate-500">{filteredStudents.length} encontrados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-500">
                  <tr>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Aluno</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Status</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Horas</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Voos</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Pousos</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Ultimo voo</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Proximo voo</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider">Agenda</th>
                    <th className="border-b border-slate-800 px-3 py-2 font-semibold uppercase tracking-wider" />
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.userId} className="odd:bg-slate-950/20 hover:bg-slate-800/35">
                      <td className="border-b border-slate-800/70 px-3 py-2">
                        <p className="max-w-64 truncate font-semibold text-slate-100">{displayName(student)}</p>
                        <p className="max-w-64 truncate text-slate-500">{student.email} | ANAC {student.profile.anacCode || "-"}</p>
                      </td>
                      <td className="border-b border-slate-800/70 px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[student.status]}`}>{STATUS_LABEL[student.status]}</span>
                        <p className="mt-1 text-slate-500">{lastFlightLabel(student)}</p>
                      </td>
                      <td className="border-b border-slate-800/70 px-3 py-2 font-semibold tabular-nums text-slate-200">{formatHours(student.executed.hours)}</td>
                      <td className="border-b border-slate-800/70 px-3 py-2 tabular-nums text-slate-300">{student.executed.count}</td>
                      <td className="border-b border-slate-800/70 px-3 py-2 tabular-nums text-slate-300">{student.executed.landings}</td>
                      <td className="border-b border-slate-800/70 px-3 py-2 text-slate-300">{formatDate(student.executed.lastFlightAt)}</td>
                      <td className="border-b border-slate-800/70 px-3 py-2 text-slate-300">{formatDate(student.planned.nextFlightAt)}</td>
                      <td className="border-b border-slate-800/70 px-3 py-2 text-slate-400">
                        Hoje {student.agenda.today.flights} | Amanha {student.agenda.tomorrow.flights} | Semana {student.agenda.week.flights}
                      </td>
                      <td className="border-b border-slate-800/70 px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(student)}
                          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum aluno encontrado.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          detail={selectedDetail}
          loading={loadingDetail}
          onClose={() => setSelectedStudent(null)}
          onOpenFlight={setActiveFlightId}
        />
      ) : null}

      {activeFlightId ? <FlightModal flightId={activeFlightId} onClose={() => setActiveFlightId(null)} /> : null}
    </div>
  );
}
