import { useEffect, useMemo, useState } from "react";
import {
  getAdminUserDetail,
  listAdminUserSummaries,
  updateAdminUserInstructorPreferences,
  updateAdminUserRole,
} from "../../lib/adminUsersDb";
import { BUCKET_ID, storage } from "../../lib/appwrite";
import {
  assignStudentTrainingTrack,
  listStudentTrainingTracks,
  listTrainingTracks,
  removeStudentTrainingTrack,
  setPrimaryStudentTrainingTrack,
} from "../../lib/trainingTracksDb";
import type { UserRole } from "../../lib/rbac";
import type { AvailabilityType } from "../../types/planning";
import type { InstructorPreferenceLevel, SchedulePeriod } from "../../types/schedule";
import type { AdminUserDetail, AdminUserFlight, AdminUserSummary, AdminUserPlannedFlight } from "../../types/adminUsers";
import type { TrainingTrack } from "../../types/trainingTrack";
import { AdminUserCreditsSection } from "./AdminUserCreditsSection";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const PAGE_SIZE = 25;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  instrutor: "Instrutor",
  aluno: "Aluno",
};

const ROLE_OPTIONS: UserRole[] = ["aluno", "instrutor", "admin"];
const INSTRUCTOR_DAYS = [1, 2, 3, 4, 5, 6] as const;
const DAY_LABEL: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sab" };
const PERIOD_LABEL: Record<SchedulePeriod, string> = { morning: "Manha", afternoon: "Tarde", night: "Noite" };
const INSTRUCTOR_PREFERENCE_LABEL: Record<InstructorPreferenceLevel, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
};
const AVAIL_CYCLE: Array<AvailabilityType | undefined> = [undefined, "available", "preferred"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const iso = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", value.length === 10 ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatFlightDate(flight: AdminUserFlight): string {
  const date = formatDate(flight.flightDate ?? flight.createdAt);
  return flight.startTime ? `${date} ${flight.startTime}` : date;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  return formatHours(seconds / 3600);
}

function displayName(user: AdminUserSummary | AdminUserDetail): string {
  return user.profile.fullName || user.name || user.email || user.userId;
}

function availKey(dayOfWeek: number, period: SchedulePeriod): string {
  return `${dayOfWeek}-${period}`;
}

function cycleAvailability(current: AvailabilityType | undefined): AvailabilityType | undefined {
  const idx = AVAIL_CYCLE.indexOf(current);
  return AVAIL_CYCLE[(idx + 1) % AVAIL_CYCLE.length];
}

function availabilityCellClass(value: AvailabilityType | undefined): string {
  if (value === "preferred") return "bg-emerald-600 border-emerald-500 text-white";
  if (value === "available") return "bg-sky-600 border-sky-500 text-white";
  return "bg-slate-800/40 border-slate-700/60 text-slate-600 hover:border-slate-600 hover:bg-slate-700/40";
}

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

function detailToSummary(detail: AdminUserDetail): AdminUserSummary {
  return {
    userId: detail.userId,
    email: detail.email,
    name: detail.name,
    role: detail.role,
    labels: detail.labels,
    emailVerification: detail.emailVerification,
    createdAt: detail.createdAt,
    profile: {
      docId: detail.profile.docId,
      fullName: detail.profile.fullName,
      cpf: detail.profile.cpf,
      phone: detail.profile.phone,
      anacCode: detail.profile.anacCode,
      anacSyncStatus: detail.profile.anacSyncStatus,
      anacLastSyncAt: detail.profile.anacLastSyncAt,
      instructorPreferenceLevel: detail.profile.instructorPreferenceLevel,
      instructorAvailability: detail.profile.instructorAvailability,
    },
    trainingTracks: detail.trainingTracks ?? [],
    executed: detail.executed,
    planned: detail.planned,
    intentions: detail.intentions,
  };
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function FlightCard({ flight, onOpen }: { flight: AdminUserFlight; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(flight.id)}
      className="w-full rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-left text-sm transition hover:border-cyan-500/50 hover:bg-slate-800/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            {formatFlightDate(flight)} · {flight.aircraftIdent || "Aeronave não informada"}
          </p>
        </div>
      </div>
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
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-200">Semana {formatDate(plan.weekStart)}</p>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">
          {plan.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {plan.requestedFlightsCount} voos solicitados · {formatHours(plan.totalHours)} · atualizado {formatDate(plan.updatedAt)}
      </p>
      {plan.items.length > 0 ? (
        <div className="mt-2 space-y-1">
          {plan.items.slice(0, 3).map((item) => (
            <p key={item.position} className="text-xs text-slate-400">
              #{item.position}: {formatHours(item.durationHours)} · prioridade {item.priorityLevel} · flex {item.flexibilityLevel}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminUsersTab() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetail | null>(null);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingInstructorPrefs, setSavingInstructorPrefs] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [roleDraft, setRoleDraft] = useState<UserRole>("aluno");
  const [trackDraft, setTrackDraft] = useState("");
  const [tracksCatalog, setTracksCatalog] = useState<TrainingTrack[]>([]);
  const [instructorPreferenceDraft, setInstructorPreferenceDraft] = useState<InstructorPreferenceLevel>("medium");
  const [instructorAvailabilityDraft, setInstructorAvailabilityDraft] = useState<Record<string, AvailabilityType>>({});
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (success) showToast({ variant: "success", message: success });
  }, [showToast, success]);

  const selectedSummary = useMemo(
    () => users.find((row) => row.userId === selectedId) ?? users[0] ?? null,
    [selectedId, users],
  );

  const photoUrl = useMemo(() => {
    if (!selectedDetail?.profile.anacPhotoFileId || !storage || !BUCKET_ID) return "";
    return storage.getFileView(BUCKET_ID, selectedDetail.profile.anacPhotoFileId).toString();
  }, [selectedDetail?.profile.anacPhotoFileId]);

  async function loadPage(nextOffset = offset, nextSearch = search) {
    setLoadingList(true);
    setError(null);
    try {
      const page = await listAdminUserSummaries({
        search: nextSearch.trim(),
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setUsers(page.users);
      setTotal(page.total);
      setOffset(page.offset);
      setSelectedId((current) =>
        current && page.users.some((row) => row.userId === current) ? current : page.users[0]?.userId ?? null,
      );
    } catch (e) {
      setError((e as Error).message);
      setUsers([]);
      setTotal(0);
      setSelectedId(null);
      setSelectedDetail(null);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadPage(0, "");
  }, []);

  useEffect(() => {
    void listTrainingTracks({ includeInactive: true }).then((result) => {
      if (!result.error) setTracksCatalog(result.data);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void getAdminUserDetail(selectedId)
      .then(async (detail) => {
        if (cancelled) return;
        const tracks = detail.role === "aluno" ? await listStudentTrainingTracks(detail.userId) : { data: [], error: null };
        if (cancelled) return;
        const detailWithTracks = { ...detail, trainingTracks: tracks.data };
        if (tracks.error) setError(tracks.error.message);
        setSelectedDetail(detailWithTracks);
        setRoleDraft(detail.role);
        setInstructorPreferenceDraft(detail.profile.instructorPreferenceLevel ?? "medium");
        const next: Record<string, AvailabilityType> = {};
        for (const row of detail.profile.instructorAvailability ?? []) {
          next[availKey(row.dayOfWeek, row.period)] = row.availabilityType;
        }
        setInstructorAvailabilityDraft(next);
        setTrackDraft(tracks.data.find((row) => row.status === "active")?.trackId ?? "");
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function replaceSummary(detail: AdminUserDetail) {
    const summary = detailToSummary(detail);
    setUsers((prev) => prev.map((row) => (row.userId === summary.userId ? summary : row)));
  }

  async function handleUpdateRole() {
    if (!selectedDetail || roleDraft === selectedDetail.role) return;
    setSavingRole(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUserRole(selectedDetail.userId, roleDraft);
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess(`Permissao de ${displayName(updated)} atualizada para ${ROLE_LABEL[updated.role]}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingRole(false);
    }
  }

  async function handleSaveInstructorPreferences() {
    if (!selectedDetail) return;
    setSavingInstructorPrefs(true);
    setError(null);
    setSuccess(null);
    try {
      const availability = Object.entries(instructorAvailabilityDraft).map(([key, availabilityType]) => {
        const dashIdx = key.indexOf("-");
        return {
          dayOfWeek: Number(key.slice(0, dashIdx)),
          period: key.slice(dashIdx + 1) as SchedulePeriod,
          availabilityType,
        };
      });
      const updated = await updateAdminUserInstructorPreferences(selectedDetail, {
        preferenceLevel: instructorPreferenceDraft,
        availability,
      });
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess(`Preferencias de instrutor de ${displayName(updated)} atualizadas.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingInstructorPrefs(false);
    }
  }

  async function handleAssignTrack() {
    if (!selectedDetail || !trackDraft) return;
    setSavingTrack(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await assignStudentTrainingTrack({
        studentUserId: selectedDetail.userId,
        trackId: trackDraft,
        isPrimary: (selectedDetail.trainingTracks ?? []).length === 0,
      });
      if (result.error) throw result.error;
      const tracks = await listStudentTrainingTracks(selectedDetail.userId);
      if (tracks.error) throw tracks.error;
      const updated = { ...selectedDetail, trainingTracks: tracks.data };
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess("Trilha atribuida ao aluno.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  }

  async function handleSetPrimaryTrack(trackId: string) {
    if (!selectedDetail) return;
    setSavingTrack(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await setPrimaryStudentTrainingTrack(selectedDetail.userId, trackId);
      if (result.error) throw result.error;
      const tracks = await listStudentTrainingTracks(selectedDetail.userId);
      if (tracks.error) throw tracks.error;
      const updated = { ...selectedDetail, trainingTracks: tracks.data };
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess("Trilha principal atualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  }

  async function handleRemoveTrack(assignmentId: string) {
    if (!selectedDetail) return;
    setSavingTrack(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await removeStudentTrainingTrack(assignmentId);
      if (result.error) throw result.error;
      const tracks = await listStudentTrainingTracks(selectedDetail.userId);
      if (tracks.error) throw tracks.error;
      const updated = { ...selectedDetail, trainingTracks: tracks.data };
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess("Trilha removida do aluno.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + users.length, total);
  const canGoBack = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Usuários</h2>
          <p className="text-xs text-slate-500">Busca rapida, permissoes e historico detalhado sob demanda.</p>
        </div>
        <form
          className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void loadPage(0, search);
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar nome, email, CPF ou ANAC"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 sm:w-80"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
            disabled={loadingList}
          >
            Buscar
          </button>
        </form>
      </div>

      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {pageStart}-{pageEnd} de {total} usuários
            </p>
            <button
              type="button"
              onClick={() => void loadPage(offset, search)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
            >
              Recarregar
            </button>
          </div>
          {loadingList ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-52" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
                {users.map((user) => {
                  const active = user.userId === selectedSummary?.userId;
                  return (
                    <button
                      key={user.userId}
                      type="button"
                      onClick={() => setSelectedId(user.userId)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{displayName(user)}</p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                        {user.executed.count} executados · {formatHours(user.executed.hours)} · {user.planned.count} planejados · {user.intentions.requestedFlights} intencoes
                      </p>
                    </button>
                  );
                })}
                {users.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p> : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => void loadPage(Math.max(0, offset - PAGE_SIZE), search)}
                  disabled={!canGoBack}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-xs text-slate-500">Pagina {Math.floor(offset / PAGE_SIZE) + 1}</span>
                <button
                  type="button"
                  onClick={() => void loadPage(offset + PAGE_SIZE, search)}
                  disabled={!canGoNext}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Proxima
                </button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          {selectedSummary ? (
            loadingDetail || !selectedDetail ? (
              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
                Carregando detalhe de {displayName(selectedSummary)}...
              </section>
            ) : (
              <>
                <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="h-32 w-24 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/60">
                        {photoUrl ? (
                          <img src={photoUrl} alt="Foto ANAC do usuário" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500">
                            Foto ANAC
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dados do usuário</p>
                        <h3 className="mt-1 break-words text-lg font-semibold text-slate-100 [overflow-wrap:anywhere]">{displayName(selectedDetail)}</h3>
                        <p className="break-words text-sm text-slate-400 [overflow-wrap:anywhere]">{selectedDetail.email}</p>
                        <p className="mt-1 break-words text-xs text-slate-600 [overflow-wrap:anywhere]">ID: {selectedDetail.userId}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs font-medium text-slate-400">
                        Permissao
                        <select
                          value={roleDraft}
                          onChange={(e) => setRoleDraft(e.target.value as UserRole)}
                          className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleUpdateRole()}
                        disabled={savingRole || roleDraft === selectedDetail.role}
                        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {savingRole ? "Salvando..." : "Alterar permissao"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                    <MetricCard label="Voos executados" value={selectedDetail.executed.count} hint={`Ultimo ${formatDate(selectedDetail.executed.lastFlightAt)}`} />
                    <MetricCard label="Total de horas" value={formatHours(selectedDetail.executed.hours)} hint="Horas executadas" />
                    <MetricCard label="Total de pousos" value={selectedDetail.executed.landings} hint="Pousos registrados" />
                    <MetricCard label="Voos planejados" value={selectedDetail.planned.count} hint={`Proximo ${formatDate(selectedDetail.planned.nextFlightAt)}`} />
                    <MetricCard label="Intenções futuras" value={selectedDetail.intentions.requestedFlights} hint={`${formatHours(selectedDetail.intentions.requestedHours)} solicitadas`} />
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div><dt className="text-xs text-slate-500">CPF</dt><dd className="text-slate-200">{selectedDetail.profile.cpf || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Telefone</dt><dd className="text-slate-200">{selectedDetail.profile.phone || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Nascimento</dt><dd className="text-slate-200">{selectedDetail.profile.birthDate || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Peso / altura</dt><dd className="text-slate-200">{selectedDetail.profile.weightKg ?? "-"}kg / {selectedDetail.profile.heightCm ?? "-"}cm</dd></div>
                    <div><dt className="text-xs text-slate-500">Email verificado</dt><dd className="text-slate-200">{selectedDetail.emailVerification ? "Sim" : "Não"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Criado em</dt><dd className="text-slate-200">{formatDate(selectedDetail.createdAt)}</dd></div>
                  </dl>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <h3 className="text-sm font-semibold text-slate-200">Habilitações</h3>
                    {selectedDetail.profile.anacRatings.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">Nenhuma habilitação importada.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-slate-300">
                        {selectedDetail.profile.anacRatings.map((item, idx) => {
                          const expired = isExpiredDate(item.validade);
                          return (
                            <li key={`${item.habilitacao}-${idx}`} className="flex items-center justify-between gap-2">
                              <span>{item.habilitacao}</span>
                              <span className={`text-xs ${expired ? "text-red-400" : "text-slate-400"}`}>
                                {item.validade || "-"}{expired ? " · vencida" : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <h3 className="text-sm font-semibold text-slate-200">Licenças</h3>
                    {selectedDetail.profile.anacLicenses.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">Nenhuma licença importada.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-slate-300">
                        {selectedDetail.profile.anacLicenses.map((item, idx) => (
                          <li key={`${item.licenca}-${idx}`} className="flex items-center justify-between gap-2">
                            <span>{item.licenca}</span>
                            <span className="text-xs text-slate-400">{item.expedicao || "-"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <h3 className="text-sm font-semibold text-slate-200">Certificado médico</h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      <p><span className="text-slate-400">Classe:</span> {selectedDetail.profile.anacMedical.classe || "-"}</p>
                      <p>
                        <span className="text-slate-400">Validade:</span>{" "}
                        <span className={isExpiredDate(selectedDetail.profile.anacMedical.validade) ? "text-red-400" : ""}>
                          {selectedDetail.profile.anacMedical.validade || "-"}
                          {isExpiredDate(selectedDetail.profile.anacMedical.validade) ? " · vencida" : ""}
                        </span>
                      </p>
                      <p><span className="text-slate-400">Orgao:</span> {selectedDetail.profile.anacMedical.orgao_expedidor || "-"}</p>
                      <p><span className="text-slate-400">Obs:</span> {selectedDetail.profile.anacMedical.observacoes || "-"}</p>
                    </div>
                  </div>
                </section>

                {selectedDetail.role === "aluno" ? (
                  <>
                    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trilhas do aluno</p>
                          <p className="text-xs text-slate-600">Define os curriculos ativos usados na ficha de voo.</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs text-slate-400">
                            Adicionar trilha
                            <select
                              value={trackDraft}
                              onChange={(e) => setTrackDraft(e.target.value)}
                              className="mt-1 block min-w-56 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                            >
                              <option value="">Selecione...</option>
                              {tracksCatalog
                                .filter((track) => !(selectedDetail.trainingTracks ?? []).some((row) => row.trackId === track.id))
                                .map((track) => (
                                  <option key={track.id} value={track.id}>
                                    {track.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleAssignTrack()}
                            disabled={savingTrack || !trackDraft}
                            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                          >
                            {savingTrack ? "Salvando..." : "Adicionar"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {(selectedDetail.trainingTracks ?? []).map((row) => (
                          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium text-slate-200">{row.track?.name || row.trackId}</p>
                              <p className="text-xs text-slate-500">
                                {row.track?.missionCount ?? 0} missoes · {formatHours((row.track?.totalMinutes ?? 0) / 60)}
                                {row.isPrimary ? " · principal" : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSetPrimaryTrack(row.trackId)}
                                disabled={savingTrack || row.isPrimary}
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                              >
                                Principal
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveTrack(row.id)}
                                disabled={savingTrack}
                                className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        ))}
                        {(selectedDetail.trainingTracks ?? []).length === 0 ? (
                          <p className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-500">
                            Nenhuma trilha atribuida.
                          </p>
                        ) : null}
                      </div>
                    </section>

                    <AdminUserCreditsSection
                      studentUserId={selectedDetail.userId}
                      studentName={displayName(selectedDetail)}
                    />
                  </>
                ) : null}

                {(roleDraft === "instrutor" || selectedDetail.role === "instrutor") ? (
                  <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preferência padrão do instrutor</p>
                        <p className="text-xs text-slate-600">Usada como ponto de partida em instrutores da semana.</p>
                      </div>
                      <label className="text-xs text-slate-400">
                        Preferência
                        <select
                          value={instructorPreferenceDraft}
                          onChange={(e) => setInstructorPreferenceDraft(e.target.value as InstructorPreferenceLevel)}
                          className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                        >
                          {(["low", "medium", "high"] as const).map((level) => (
                            <option key={level} value={level}>
                              {INSTRUCTOR_PREFERENCE_LABEL[level]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-1">
                        <thead>
                          <tr>
                            <th className="w-20 pb-1" />
                            {INSTRUCTOR_DAYS.map((day) => (
                              <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                                {DAY_LABEL[day]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(["morning", "afternoon", "night"] as const).map((period) => (
                            <tr key={period}>
                              <td className="pr-2 text-right text-[11px] text-slate-500">{PERIOD_LABEL[period]}</td>
                              {INSTRUCTOR_DAYS.map((day) => {
                                const key = availKey(day, period);
                                const value = instructorAvailabilityDraft[key];
                                return (
                                  <td key={day} className="p-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInstructorAvailabilityDraft((prev) => {
                                          const next = { ...prev };
                                          const cycled = cycleAvailability(prev[key]);
                                          if (!cycled) delete next[key];
                                          else next[key] = cycled;
                                          return next;
                                        });
                                      }}
                                      aria-label={`${DAY_LABEL[day]} ${PERIOD_LABEL[period]}`}
                                      className={`h-8 w-full rounded-md border transition-all duration-75 ${availabilityCellClass(value)}`}
                                    >
                                      {value === "preferred" ? <span className="text-[10px] font-bold">*</span> : null}
                                      {value === "available" ? <span className="text-[10px]">ok</span> : null}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveInstructorPreferences()}
                        disabled={savingInstructorPrefs}
                        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {savingInstructorPrefs ? "Salvando..." : "Salvar preferencias"}
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Voos executados</p>
                    <div className="space-y-2">
                      {selectedDetail.executedFlights.slice(0, 30).map((flight) => (
                        <FlightCard key={flight.id} flight={flight} onOpen={setActiveFlightId} />
                      ))}
                      {selectedDetail.executedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo executado encontrado.</p> : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Voos planejados</p>
                    <div className="space-y-2">
                      {selectedDetail.plannedFlights.slice(0, 30).map((flight) => (
                        <FlightCard key={flight.id} flight={flight} onOpen={setActiveFlightId} />
                      ))}
                      {selectedDetail.plannedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo planejado encontrado.</p> : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Intenções futuras</p>
                    <div className="space-y-2">
                      {selectedDetail.futureIntentions.slice(0, 30).map((plan) => (
                        <IntentionCard key={plan.id} plan={plan} />
                      ))}
                      {selectedDetail.futureIntentions.length === 0 ? <p className="text-sm text-slate-500">Nenhuma intenção futura encontrada.</p> : null}
                    </div>
                  </div>
                </section>
              </>
            )
          ) : (
            <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
              Selecione um usuário para ver os dados consolidados.
            </section>
          )}
        </div>
      </section>

      {activeFlightId ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveFlightId(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar ficha
              </button>
            </div>
            <FlightDetailView flightId={activeFlightId} onBack={() => setActiveFlightId(null)} backLabel="Voltar ao usuário" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
