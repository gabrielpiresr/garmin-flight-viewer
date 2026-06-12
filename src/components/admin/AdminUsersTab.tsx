import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  assignAdminUserTrainingTrack,
  createAdminUser,
  deleteAdminUserCascade,
  getAdminUserDetail,
  listAdminUserSummaries,
  removeAdminUserTrainingTrack,
  setAdminUserFlightReviewClubMembership,
  setAdminUserPrimaryTrainingTrack,
  updateAdminUserInstructorPreferences,
  updateAdminUserProfile,
  updateAdminUserRole,
  type AdminUserProfileUpdateInput,
} from "../../lib/adminUsersDb";
import { AdminUserProfileEditSection } from "./AdminUserProfileEditSection";
import { BUCKET_ID, storage } from "../../lib/appwrite";
import { listTrainingTracks, setFlightReviewClubMembership } from "../../lib/trainingTracksDb";
import { listTenantRoles } from "../../lib/tenantRolesDb";
import { approveStudentAccess, getApprovalStatus, getProfileDocumentUrl, type ApprovalStatus, type ProfileDocumentType, type UserRole } from "../../lib/rbac";
import type { AvailabilityType } from "../../types/planning";
import type { InstructorPreferenceLevel, SchedulePeriod } from "../../types/schedule";
import type { AdminUserDetail, AdminUserFlight, AdminUserSummary, AdminUserPlannedFlight } from "../../types/adminUsers";
import type { TenantRole } from "../../types/rolePermissions";
import type { TrainingTrack } from "../../types/trainingTrack";
import { AdminUserCreditsSection } from "./AdminUserCreditsSection";
import { StudentObservationsSection } from "./StudentObservationsSection";
import { InstructorCostsSection } from "./InstructorCostsSection";
import { UserSalesSection } from "./UserSalesSection";
import { PaymentLinkModal } from "./CaktoReceiptsTab";
import { FlightDetailView } from "../FlightDetailView";
import { FlightReviewClubBadge, hasActiveFlightReviewClubTrack } from "../FlightReviewClubBadge";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import {
  fetchSagaImportProgress,
  fetchSagaUsers,
  getSagaImportSettings,
  importSagaData,
  saveSagaImportMapping,
  type SagaImportCatalogs,
  type SagaImportMapping,
  type SagaImportProgress,
} from "../../lib/sagaImportDb";
import { SagaImportProgressOverlay } from "./SagaImportProgressOverlay";
import { useSagaImportMissionPrompt } from "../../hooks/useSagaImportMissionPrompt";

function newSagaUserImportRunId(userId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `admin-user-${userId}-${crypto.randomUUID()}`;
  }
  return `admin-user-${userId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const PAGE_SIZE = 25;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  instrutor: "Instrutor",
  aluno: "Aluno",
};

const ROLE_OPTIONS: UserRole[] = ["aluno", "instrutor", "admin"];
type UserSubTab = "profile" | "flights" | "finance" | "observations" | "import";
const USER_SUB_TABS: Array<{ id: UserSubTab; label: string }> = [
  { id: "profile", label: "Perfil" },
  { id: "flights", label: "Voos" },
  { id: "finance", label: "Financeiro" },
  { id: "observations", label: "Observacoes" },
  { id: "import", label: "Import" },
];
const INSTRUCTOR_DAYS = [1, 2, 3, 4, 5, 6] as const;
const DAY_LABEL: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sab" };
const PERIOD_LABEL: Record<SchedulePeriod, string> = { morning: "Manha", afternoon: "Tarde", night: "Noite" };
const INSTRUCTOR_PREFERENCE_LABEL: Record<InstructorPreferenceLevel, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
};
const AVAIL_CYCLE: Array<AvailabilityType | undefined> = [undefined, "available", "preferred"];
const PROFILE_DOCUMENT_LABELS: Array<{ type: ProfileDocumentType; label: string }> = [
  { type: "identification", label: "Documento de Identificacao" },
  { type: "voterTitle", label: "Titulo de Eleitor" },
  { type: "proofOfResidence", label: "Comp. de Residencia" },
  { type: "militaryCertificate", label: "Cert. Militar" },
  { type: "enrollmentForm", label: "Ficha de Matricula" },
];

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

function userHasFlightReviewClub(user: AdminUserSummary | AdminUserDetail): boolean {
  return user.role === "aluno" && hasActiveFlightReviewClubTrack(user.trainingTracks);
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
      isActive: detail.profile.isActive,
      fullName: detail.profile.fullName,
      nickname: detail.profile.nickname,
      cpf: detail.profile.cpf,
      phone: detail.profile.phone,
      anacCode: detail.profile.anacCode,
      sagaUserId: detail.profile.sagaUserId,
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

function displayField(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function EnrollmentProfileDetailsCollapsible({ profile }: { profile: AdminUserDetail["profile"] }) {
  const [open, setOpen] = useState(false);
  const rows: Array<{ label: string; value: string }> = [
    { label: "RG", value: displayField(profile.rg) },
    { label: "Órgão expedidor", value: displayField(profile.rgOrgaoExpedidor) },
    { label: "Data emissão RG", value: displayField(profile.rgDataEmissao) },
    { label: "Endereço", value: displayField(profile.endereco) },
    { label: "CEP", value: displayField(profile.cep) },
    { label: "Cidade", value: displayField(profile.cidade) },
    { label: "UF", value: displayField(profile.uf) },
    { label: "Nacionalidade", value: displayField(profile.nacionalidade) },
    { label: "Estado civil", value: displayField(profile.estadoCivil) },
    { label: "Sexo", value: displayField(profile.sexo) },
    { label: "Naturalidade", value: displayField(profile.naturalidade) },
    { label: "Filiação (pai)", value: displayField(profile.filiacaoPai) },
    { label: "Filiação (mãe)", value: displayField(profile.filiacaoMae) },
    { label: "Escolaridade", value: displayField(profile.escolaridade) },
    { label: "Série/período", value: displayField(profile.escolaridadePeriodo) },
    { label: "Curso (escolaridade)", value: displayField(profile.escolaridadeCurso) },
    { label: "Alergias a medicamentos", value: displayField(profile.alergiasMedicamentos) },
    { label: "Emergência — nome", value: displayField(profile.emergenciaNome) },
    { label: "Emergência — parentesco", value: displayField(profile.emergenciaParentesco) },
    { label: "Emergência — endereço", value: displayField(profile.emergenciaEndereco) },
    { label: "Emergência — telefone", value: displayField(profile.emergenciaTelefone) },
  ];
  const filledCount = rows.filter((row) => row.value !== "-").length;

  return (
    <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-950/30">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-800/40"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ficha de matrícula</p>
          <p className="text-sm text-slate-300">Dados complementares do cadastro</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-slate-500">{filledCount} preenchido(s)</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>
      {open ? (
        <dl className="grid grid-cols-1 gap-3 border-t border-slate-800 px-3 py-3 text-sm md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="break-words text-slate-200 [overflow-wrap:anywhere]">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function ProfileDocumentsCard({ documents }: { documents: AdminUserDetail["profile"]["documents"] }) {
  const docs = documents ?? {};

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documentos</p>
        <h3 className="text-sm font-semibold text-slate-200">Anexos do perfil</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {PROFILE_DOCUMENT_LABELS.map((item) => {
          const attachment = docs[item.type];
          const url = attachment ? getProfileDocumentUrl(attachment.fileId, "view") : "";
          return (
            <div key={item.type} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
              <p className="text-sm font-medium text-slate-200">{item.label}</p>
              <p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                {attachment ? attachment.fileName : "Nenhum arquivo anexado"}
              </p>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:text-cyan-200"
                >
                  Abrir documento
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
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
  const { user: authUser } = useAuth();
  const { canAction } = usePermissions();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetail | null>(null);
  const [showUserList, setShowUserList] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<UserSubTab>("profile");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingActiveState, setSavingActiveState] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [approvingAccess, setApprovingAccess] = useState(false);
  const [savingInstructorPrefs, setSavingInstructorPrefs] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [roleDraft, setRoleDraft] = useState<UserRole>("aluno");
  const [customRoleSlugDraft, setCustomRoleSlugDraft] = useState<string | null>(null);
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>([]);
  const [trackDraft, setTrackDraft] = useState("");
  const [tracksCatalog, setTracksCatalog] = useState<TrainingTrack[]>([]);
  const [instructorPreferenceDraft, setInstructorPreferenceDraft] = useState<InstructorPreferenceLevel>("medium");
  const [instructorAvailabilityDraft, setInstructorAvailabilityDraft] = useState<Record<string, AvailabilityType>>({});
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sagaUserImporting, setSagaUserImporting] = useState(false);
  const [sagaUserImportProgress, setSagaUserImportProgress] = useState<SagaImportProgress | null>(null);
  const [sagaUserImportStartedAt, setSagaUserImportStartedAt] = useState<number | null>(null);
  const [sagaUserImportProgressTick, setSagaUserImportProgressTick] = useState(0);
  const [sagaUserImportScope, setSagaUserImportScope] = useState({
    pastFlights: true,
    schedule: true,
    credits: true,
  });
  const [sagaUserImportSummary, setSagaUserImportSummary] = useState<string | null>(null);
  const [sagaImportCatalogs, setSagaImportCatalogs] = useState<SagaImportCatalogs>({
    aircrafts: [],
    aircraftModels: [],
    trainingTracks: [],
  });
  const [sagaImportMapping, setSagaImportMapping] = useState<SagaImportMapping | null>(null);
  const {
    pendingMission,
    awaitingMission,
    onAwaitingMissionMapping,
    confirmMissionMapping,
    clearMissionPrompt,
    armMissionPromptFromProgress,
  } = useSagaImportMissionPrompt();

  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "aluno" as UserRole,
    phone: "",
    cpf: "",
    birthDate: "",
    anacCode: "",
  });

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    setCreatingUser(true);
    try {
      const created = await createAdminUser(newUser);
      setShowCreateUser(false);
      setNewUser({ fullName: "", email: "", password: "", role: "aluno", phone: "", cpf: "", birthDate: "", anacCode: "" });
      setSuccess(`Usuario ${displayName(created)} criado.`);
      await loadPage(0, search, roleFilter);
      setSelectedId(created.userId);
      setShowUserList(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingUser(false);
    }
  }

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (success) showToast({ variant: "success", message: success });
  }, [showToast, success]);

  useEffect(() => {
    if (!sagaUserImporting) return;
    const timer = window.setInterval(() => setSagaUserImportProgressTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sagaUserImporting]);

  const displayPendingMission = pendingMission ?? sagaUserImportProgress?.pendingMission ?? null;

  function handleSagaMissionBySagaChange(lookupKey: string, missionId: string) {
    if (!lookupKey || !missionId) return;
    setSagaImportMapping((current) =>
      current
        ? { ...current, missionBySaga: { ...(current.missionBySaga ?? {}), [lookupKey]: missionId } }
        : current,
    );
  }

  function handleConfirmSagaMission(missionId: string) {
    const lookupKey = displayPendingMission?.lookupKey;
    if (lookupKey && missionId) {
      setSagaImportMapping((current) =>
        current
          ? { ...current, missionBySaga: { ...(current.missionBySaga ?? {}), [lookupKey]: missionId } }
          : current,
      );
    }
    confirmMissionMapping(missionId);
  }

  const selectedSummary = useMemo(
    () => users.find((row) => row.userId === selectedId) ?? users[0] ?? null,
    [selectedId, users],
  );

  const photoUrl = useMemo(() => {
    if (!selectedDetail?.profile.anacPhotoFileId || !storage || !BUCKET_ID) return "";
    return storage.getFileView(BUCKET_ID, selectedDetail.profile.anacPhotoFileId).toString();
  }, [selectedDetail?.profile.anacPhotoFileId]);

  async function loadPage(nextOffset = offset, nextSearch = search, nextRoleFilter = roleFilter) {
    const [role, customRoleSlug] = nextRoleFilter.includes(":")
      ? nextRoleFilter.split(":", 2)
      : [nextRoleFilter, null];
    setLoadingList(true);
    setError(null);
    try {
      const page = await listAdminUserSummaries({
        search: nextSearch.trim(),
        limit: PAGE_SIZE,
        offset: nextOffset,
        role: (role || "") as UserRole | "",
        customRoleSlug,
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
    void loadPage(0, "", "");
  }, []);

  useEffect(() => {
    void listTrainingTracks({ includeInactive: true }).then((result) => {
      if (!result.error) setTracksCatalog(result.data);
    });
  }, []);

  useEffect(() => {
    if (!authUser?.schoolId) return;
    void listTenantRoles(authUser.schoolId).then((roles) => {
      setTenantRoles(roles);
    }).catch(() => {
      // Tenant roles are optional — don't break the page if the collection doesn't exist yet
    });
  }, [authUser?.schoolId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setApprovalStatus(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void getAdminUserDetail(selectedId)
      .then((detail) => {
        if (cancelled) return;
        const tracks = detail.role === "aluno" ? detail.trainingTracks ?? [] : [];
        const detailWithTracks = { ...detail, trainingTracks: tracks };
        setSelectedDetail(detailWithTracks);
        setApprovalStatus(null); // reset enquanto busca
        setRoleDraft(detail.role);
        setCustomRoleSlugDraft(detail.customRoleSlug ?? null);
        if (detail.role === "aluno") {
          void getApprovalStatus(detail.userId).then((status) => {
            if (!cancelled) setApprovalStatus(status);
          });
        }
        setInstructorPreferenceDraft(detail.profile.instructorPreferenceLevel ?? "medium");
        const next: Record<string, AvailabilityType> = {};
        for (const row of detail.profile.instructorAvailability ?? []) {
          next[availKey(row.dayOfWeek, row.period)] = row.availabilityType;
        }
        setInstructorAvailabilityDraft(next);
        setTrackDraft(tracks.find((row) => row.status === "active")?.trackId ?? "");
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

  const roleDraftChanged =
    !!selectedDetail &&
    (roleDraft !== selectedDetail.role ||
      (customRoleSlugDraft ?? null) !== (selectedDetail.customRoleSlug ?? null));

  async function handleSaveProfile(payload: AdminUserProfileUpdateInput) {
    if (!selectedDetail) return;
    setSavingProfile(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUserProfile(selectedDetail.userId, payload);
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess(`Dados de ${displayName(updated)} atualizados.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleToggleActiveState() {
    if (!selectedDetail) return;
    if (authUser?.id === selectedDetail.userId && selectedDetail.profile.isActive) {
      setError("Nao e permitido desabilitar o proprio usuario logado.");
      return;
    }
    setSavingActiveState(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUserProfile(selectedDetail.userId, {
        isActive: !selectedDetail.profile.isActive,
      });
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess(`${displayName(updated)} ${updated.profile.isActive ? "habilitado" : "desabilitado"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingActiveState(false);
    }
  }

  async function handleUpdateRole() {
    if (!selectedDetail || !roleDraftChanged) return;
    setSavingRole(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUserRole(selectedDetail.userId, roleDraft, customRoleSlugDraft);
      setSelectedDetail(updated);
      replaceSummary(updated);
      const roleLabel = customRoleSlugDraft
        ? (tenantRoles.find((r) => r.slug === customRoleSlugDraft)?.name ?? customRoleSlugDraft)
        : ROLE_LABEL[updated.role];
      setSuccess(`Permissao de ${displayName(updated)} atualizada para ${roleLabel}.`);
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
      const updated = await assignAdminUserTrainingTrack(
        selectedDetail.userId,
        trackDraft,
        (selectedDetail.trainingTracks ?? []).length === 0,
      );
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
      const updated = await setAdminUserPrimaryTrainingTrack(selectedDetail.userId, trackId);
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
      const updated = await removeAdminUserTrainingTrack(selectedDetail.userId, assignmentId);
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess("Trilha removida do aluno.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  }

  async function handleToggleClubMembership(assignmentId: string, isMember: boolean) {
    if (!selectedDetail) return;
    setSavingTrack(true);
    setError(null);
    setSuccess(null);
    try {
      let updated = await setAdminUserFlightReviewClubMembership(selectedDetail.userId, assignmentId, isMember);
      const reflected = (updated.trainingTracks ?? []).some((row) => row.id === assignmentId && row.isFlightReviewClubMember === isMember);
      if (!reflected) {
        const fallback = await setFlightReviewClubMembership(assignmentId, isMember);
        if (fallback.error) throw fallback.error;
        updated = {
          ...updated,
          trainingTracks: (updated.trainingTracks ?? selectedDetail.trainingTracks ?? []).map((row) =>
            row.id === assignmentId ? { ...row, isFlightReviewClubMember: isMember } : row,
          ),
        };
      }
      setSelectedDetail(updated);
      replaceSummary(updated);
      setSuccess(isMember ? "Aluno adicionado ao Flight Review Club." : "Aluno removido do Flight Review Club.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  }

  async function handleApproveAccess() {
    if (!selectedDetail) return;
    setApprovingAccess(true);
    setError(null);
    try {
      const { error } = await approveStudentAccess(selectedDetail.userId);
      if (error) throw error;
      setApprovalStatus("approved");
      showToast({ variant: "success", message: `Acesso liberado para ${displayName(selectedDetail)}.` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApprovingAccess(false);
    }
  }

  async function handleDeleteSelectedUser() {
    if (!selectedDetail) return;
    if (authUser?.id === selectedDetail.userId) {
      setError("Nao e permitido excluir o proprio usuario logado.");
      return;
    }
    const name = displayName(selectedDetail);
    const confirmation = window.prompt(
      `Esta acao vai excluir ${name} e os dados correlacionados a este usuario.\n\nDigite EXCLUIR para confirmar.`,
    );
    if (confirmation !== "EXCLUIR") return;

    setDeletingUser(true);
    setError(null);
    setSuccess(null);
    try {
      const deletion = await deleteAdminUserCascade(
        selectedDetail.userId,
        `Exclusao manual via Admin Usuarios: ${name}`,
      );
      setSelectedDetail(null);
      setSelectedId(null);
      setActiveFlightId(null);
      await loadPage(
        Math.max(0, offset - (users.length === 1 && offset > 0 ? PAGE_SIZE : 0)),
        search,
        roleFilter,
      );
      const issueCount = deletion.errors.length + deletion.fileErrors.length;
      setSuccess(
        `Usuario excluido. ${deletion.deletedDocuments} documento(s) e ${deletion.deletedFiles} arquivo(s) removidos${
          issueCount ? `; ${issueCount} item(ns) tiveram erro e foram registrados no resumo.` : "."
        }`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleImportSelectedUserFromSaga() {
    if (!selectedDetail) return;
    const sagaUserId = String(selectedDetail.profile.sagaUserId || "").trim();
    if (!sagaUserId) {
      setError("Este usuário não possui ID SAGA vinculado no perfil.");
      return;
    }
    if (!sagaUserImportScope.pastFlights && !sagaUserImportScope.schedule && !sagaUserImportScope.credits) {
      setError("Selecione ao menos um escopo para importar (Voos, Escala ou Créditos).");
      return;
    }
    const importRunId = newSagaUserImportRunId(selectedDetail.userId);
    setSagaUserImporting(true);
    setError(null);
    setSuccess(null);
    setSagaUserImportSummary(null);
    setSagaUserImportStartedAt(Date.now());
    setSagaUserImportProgress({
      runId: importRunId,
      status: "running",
      stage: "Enfileirando import",
      message: "Criando execucao no Appwrite.",
      current: 0,
      total: 1,
      logs: [],
    });
    try {
      const settings = await getSagaImportSettings();
      setSagaImportCatalogs(settings.catalogs);
      setSagaImportMapping(settings.mapping);
      const cleanEmail = String(settings.credentials.email || "").trim();
      const cleanPassword = String(settings.credentials.password || "");
      if (!cleanEmail || !cleanPassword) {
        throw new Error("Credenciais do SAGA ausentes em Admin > Import.");
      }
      const sagaData = await fetchSagaUsers({
        email: cleanEmail,
        password: cleanPassword,
        sendFlightsToSaga: settings.mapping.sendFlightsToSaga === true,
      });
      const summary = await importSagaData({
        users: sagaData.users,
        flights: sagaData.flights,
        financialEntries: sagaData.financialEntries,
        mapping: sagaImportMapping ?? settings.mapping,
        scope: {
          users: true,
          pastFlights: sagaUserImportScope.pastFlights,
          schedule: sagaUserImportScope.schedule,
          credits: sagaUserImportScope.credits,
        },
        testMode: false,
        email: cleanEmail,
        password: cleanPassword,
        selectedSagaUserIds: [sagaUserId],
        useEmailAlias: false,
        importRunId,
        onProgress: setSagaUserImportProgress,
        onAwaitingMissionMapping,
      });
      setSagaUserImportSummary(
        `${summary.flightsCreated + summary.flightsUpdated} voo(s), ${(summary.flightsDeleted ?? 0)} removido(s), ${summary.scheduledFlightsCreated + summary.scheduledFlightsUpdated} agendamento(s) e ${summary.creditsCreated + summary.creditsUpdated + (summary.financialCreditsCreated ?? 0) + (summary.financialCreditsUpdated ?? 0)} crédito(s) processados.`,
      );
      if (summary.staleCleanup) {
        console.log("[SAGA sync][AdminUsers] cleanup", summary.staleCleanup);
      }
      if (sagaImportMapping) {
        const savedMapping = await saveSagaImportMapping(sagaImportMapping).catch(() => sagaImportMapping);
        setSagaImportMapping(savedMapping);
      }
      const refreshed = await getAdminUserDetail(selectedDetail.userId);
      setSelectedDetail(refreshed);
      replaceSummary(refreshed);
      if (refreshed.role === "aluno") {
        const status = await getApprovalStatus(refreshed.userId);
        if (status !== "approved") {
          const { error: approveError } = await approveStudentAccess(refreshed.userId);
          if (approveError) {
            setError(`Import concluido, mas nao foi possivel liberar o acesso: ${approveError.message}`);
          } else {
            setApprovalStatus("approved");
            setSuccess(`Import SAGA concluido e acesso liberado para ${displayName(refreshed)}.`);
          }
        } else {
          setSuccess(`Import SAGA concluído para ${displayName(refreshed)}.`);
        }
      } else {
        setSuccess(`Import SAGA concluído para ${displayName(refreshed)}.`);
      }
    } catch (e) {
      const remoteProgress = await fetchSagaImportProgress(importRunId).catch(() => null);
      if (remoteProgress) setSagaUserImportProgress(remoteProgress);
      const progressPending = remoteProgress?.pendingMission ?? sagaUserImportProgress?.pendingMission;
      if (armMissionPromptFromProgress(progressPending)) {
        setError("Selecione a missao local no modal para continuar o import.");
      } else {
        const progressMsg = remoteProgress?.status === "failed" ? remoteProgress.message : null;
        setError(progressMsg || (e as Error).message);
      }
    } finally {
      setSagaUserImporting(false);
      setSagaUserImportStartedAt(null);
      clearMissionPrompt();
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + users.length, total);
  const canGoBack = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;

  return (
    <div className="w-full space-y-5">
      <SagaImportProgressOverlay
        active={sagaUserImporting || awaitingMission || sagaUserImportProgress?.status === "failed"}
        awaitingMission={awaitingMission}
        modeLabel="Usuario"
        importProgress={sagaUserImportProgress}
        importStartedAt={sagaUserImportStartedAt}
        progressTick={sagaUserImportProgressTick}
        catalogs={sagaImportCatalogs}
        missionBySaga={sagaImportMapping?.missionBySaga ?? {}}
        onMissionBySagaChange={handleSagaMissionBySagaChange}
        pendingMission={displayPendingMission}
        onConfirmMission={handleConfirmSagaMission}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Usuários</h2>
          <p className="text-xs text-slate-500">Busca rapida, permissoes e historico detalhado sob demanda.</p>
        </div>
        <form
          className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setShowUserList(true);
            void loadPage(0, search, roleFilter);
          }}
        >
          <select
            value={roleFilter}
            onChange={(e) => {
              const nextRole = e.target.value;
              setRoleFilter(nextRole);
              setShowUserList(true);
              void loadPage(0, search, nextRole);
            }}
            className="min-w-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 sm:w-48"
          >
            <option value="">Todos os roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{ROLE_LABEL[role]}</option>
            ))}
            {tenantRoles.filter((role) => !role.isSystem).length ? (
              <optgroup label="Roles personalizados">
                {tenantRoles
                  .filter((role) => !role.isSystem)
                  .map((role) => (
                    <option key={role.$id} value={`${role.portalType}:${role.slug}`}>{role.name}</option>
                  ))}
              </optgroup>
            ) : null}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar nome, nickname, email, CPF ou ANAC"
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
        {canAction("users.manage") ? (
          <button
            type="button"
            onClick={() => setShowCreateUser(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Novo usuario
          </button>
        ) : null}
      </div>

      <section className={`grid min-w-0 grid-cols-1 gap-4 transition-[grid-template-columns] duration-300 ease-out ${showUserList ? "lg:grid-cols-[360px_minmax(0,1fr)]" : "lg:grid-cols-1"}`}>
        <div className={`overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 transition-all duration-300 ease-out ${
          showUserList ? "max-h-[820px] opacity-100" : "pointer-events-none max-h-0 border-transparent p-0 opacity-0 lg:hidden"
        }`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {pageStart}-{pageEnd} de {total} usuários
            </p>
            <button
              type="button"
              onClick={() => void loadPage(offset, search, roleFilter)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
            >
              Recarregar
            </button>
          </div>
          {loadingList && users.length === 0 ? (
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
              <div className={`max-h-[650px] space-y-2 overflow-y-auto pr-1 transition-opacity duration-200 ${loadingList ? "pointer-events-none opacity-40" : "opacity-100"}`}>
                {users.map((user) => {
                  const active = user.userId === selectedSummary?.userId;
                  return (
                    <button
                      key={user.userId}
                      type="button"
                      onClick={() => {
                        setSelectedId(user.userId);
                        setShowUserList(false);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-100">
                            <span className="truncate">{displayName(user)}</span>
                            {userHasFlightReviewClub(user) ? <FlightReviewClubBadge /> : null}
                          </p>
                          {user.profile.nickname ? (
                            <p className="truncate text-xs text-cyan-400/90">@{user.profile.nickname}</p>
                          ) : null}
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </div>
                      {user.profile.isActive === false ? (
                        <p className="mt-2 inline-flex rounded-full border border-amber-700/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          Desabilitado
                        </p>
                      ) : null}
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
                  onClick={() => void loadPage(Math.max(0, offset - PAGE_SIZE), search, roleFilter)}
                  disabled={!canGoBack || loadingList}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-xs text-slate-500">Pagina {Math.floor(offset / PAGE_SIZE) + 1}</span>
                <button
                  type="button"
                  onClick={() => void loadPage(offset + PAGE_SIZE, search, roleFilter)}
                  disabled={!canGoNext || loadingList}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Proxima
                </button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 transition-all duration-300 ease-out">
          {!showUserList ? (
            <button
              type="button"
              onClick={() => setShowUserList(true)}
              className="inline-flex rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Voltar para usuarios
            </button>
          ) : null}
          {selectedSummary ? (
            !selectedDetail ? (
              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
                Carregando detalhe de {displayName(selectedSummary)}...
              </section>
            ) : (
              <div className={`space-y-4 transition-opacity duration-200 ${loadingDetail ? "opacity-80" : "opacity-100"}`}>
                {loadingDetail ? (
                  <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-200">
                    Atualizando detalhes de {displayName(selectedSummary)}...
                  </section>
                ) : null}
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
                        <h3 className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-lg font-semibold text-slate-100">
                          <span className="break-words [overflow-wrap:anywhere]">{displayName(selectedDetail)}</span>
                          {userHasFlightReviewClub(selectedDetail) ? <FlightReviewClubBadge /> : null}
                        </h3>
                        <p className="break-words text-sm text-slate-400 [overflow-wrap:anywhere]">{selectedDetail.email}</p>
                        <p className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          selectedDetail.profile.isActive
                            ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
                            : "border-amber-700/60 bg-amber-950/30 text-amber-300"
                        }`}>
                          {selectedDetail.profile.isActive ? "Habilitado" : "Desabilitado"}
                        </p>
                        <p className="mt-1 break-words text-xs text-slate-600 [overflow-wrap:anywhere]">ID Appwrite: {selectedDetail.userId}</p>
                        {selectedDetail.profile.sagaUserId ? (
                          <p className="break-words text-xs text-slate-600 [overflow-wrap:anywhere]">
                            ID SAGA: <span className="font-mono text-slate-400">{selectedDetail.profile.sagaUserId}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-600">ID SAGA: <span className="text-slate-500">não vinculado</span></p>
                        )}
                        <p className="mt-1 text-xs text-slate-600">
                          Referral: <span className="text-slate-400">{selectedDetail.referralSource || "nao informado"}</span>
                        </p>
                      </div>
                    </div>
                    {canAction("users.manage") ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs font-medium text-slate-400">
                        Permissao
                        <select
                          value={customRoleSlugDraft ? `${roleDraft}:${customRoleSlugDraft}` : roleDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            const colonIdx = val.indexOf(":");
                            if (colonIdx > -1) {
                              setRoleDraft(val.slice(0, colonIdx) as UserRole);
                              setCustomRoleSlugDraft(val.slice(colonIdx + 1));
                            } else {
                              setRoleDraft(val as UserRole);
                              setCustomRoleSlugDraft(null);
                            }
                          }}
                          className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                        >
                          <optgroup label="Roles do sistema">
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </optgroup>
                          {tenantRoles.filter((r) => !r.isSystem).length > 0 ? (
                            <optgroup label="Roles customizados">
                              {tenantRoles
                                .filter((r) => !r.isSystem)
                                .map((r) => (
                                  <option key={r.$id} value={`${r.portalType}:${r.slug}`}>
                                    {r.name} ({ROLE_LABEL[r.portalType]})
                                  </option>
                                ))}
                            </optgroup>
                          ) : null}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleUpdateRole()}
                        disabled={savingRole || !roleDraftChanged || deletingUser}
                        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {savingRole ? "Salvando..." : "Alterar permissao"}
                      </button>
                      {selectedDetail.role === "aluno" && approvalStatus === "pending" && (
                        <button
                          type="button"
                          onClick={() => void handleApproveAccess()}
                          disabled={approvingAccess}
                          className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/60 disabled:opacity-50"
                        >
                          {approvingAccess ? "Liberando..." : "Liberar acesso"}
                        </button>
                      )}
                      {selectedDetail.role === "aluno" && approvalStatus === "approved" && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-xs font-medium text-emerald-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                          </svg>
                          Acesso liberado
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleToggleActiveState()}
                        disabled={savingActiveState || deletingUser || (authUser?.id === selectedDetail.userId && selectedDetail.profile.isActive)}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedDetail.profile.isActive
                            ? "border-amber-700/60 bg-amber-950/30 text-amber-200 hover:bg-amber-950/60"
                            : "border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/60"
                        }`}
                      >
                        {savingActiveState
                          ? "Salvando..."
                          : selectedDetail.profile.isActive
                            ? "Desabilitar usuario"
                            : "Habilitar usuario"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSelectedUser()}
                        disabled={deletingUser || authUser?.id === selectedDetail.userId}
                        className="rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingUser ? "Excluindo..." : "Excluir usuario"}
                      </button>
                      {selectedDetail.role === "aluno" ? (
                        <button
                          type="button"
                          onClick={() => setShowPaymentLink(true)}
                          className="rounded-lg border border-sky-700/60 bg-sky-950/30 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-950/60"
                        >
                          Gerar link de pagamento
                        </button>
                      ) : null}
                    </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-slate-800 pt-2">
                    <Tabs items={USER_SUB_TABS} value={activeSubTab} onChange={setActiveSubTab} ariaLabel="Detalhes do usuario" accent="cyan" />
                  </div>

                  <div className={`transition-opacity duration-200 ${activeSubTab === "profile" ? "opacity-100" : "hidden opacity-0"}`}>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                    <MetricCard label="Voos executados" value={selectedDetail.executed.count} hint={`Ultimo ${formatDate(selectedDetail.executed.lastFlightAt)}`} />
                    <MetricCard label="Total de horas" value={formatHours(selectedDetail.executed.hours)} hint="Horas executadas" />
                    <MetricCard label="Total de pousos" value={selectedDetail.executed.landings} hint="Pousos registrados" />
                    <MetricCard label="Voos planejados" value={selectedDetail.planned.count} hint={`Proximo ${formatDate(selectedDetail.planned.nextFlightAt)}`} />
                    <MetricCard label="Intenções futuras" value={selectedDetail.intentions.requestedFlights} hint={`${formatHours(selectedDetail.intentions.requestedHours)} solicitadas`} />
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div><dt className="text-xs text-slate-500">Código ANAC</dt><dd className="text-slate-200">{selectedDetail.profile.anacCode || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Nickname</dt><dd className="text-slate-200">{selectedDetail.profile.nickname || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">ID SAGA</dt><dd className="font-mono text-slate-200">{selectedDetail.profile.sagaUserId || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">CPF</dt><dd className="text-slate-200">{selectedDetail.profile.cpf || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Telefone</dt><dd className="text-slate-200">{selectedDetail.profile.phone || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Nascimento</dt><dd className="text-slate-200">{selectedDetail.profile.birthDate || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Peso / altura</dt><dd className="text-slate-200">{selectedDetail.profile.weightKg ?? "-"}kg / {selectedDetail.profile.heightCm ?? "-"}cm</dd></div>
                    <div><dt className="text-xs text-slate-500">Email verificado</dt><dd className="text-slate-200">{selectedDetail.emailVerification ? "Sim" : "Não"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Criado em</dt><dd className="text-slate-200">{formatDate(selectedDetail.createdAt)}</dd></div>
                  </dl>
                  {canAction("users.manage") ? (
                    <AdminUserProfileEditSection
                      detail={selectedDetail}
                      saving={savingProfile}
                      onSave={(payload) => void handleSaveProfile(payload)}
                    />
                  ) : null}
                  <EnrollmentProfileDetailsCollapsible profile={selectedDetail.profile} />
                  </div>
                </section>

                <div className={`transition-opacity duration-200 ${activeSubTab === "profile" ? "opacity-100" : "hidden opacity-0"}`}>
                  <ProfileDocumentsCard documents={selectedDetail.profile.documents} />
                </div>

                <section className={`grid grid-cols-1 gap-4 transition-opacity duration-200 lg:grid-cols-3 ${activeSubTab === "profile" ? "opacity-100" : "hidden opacity-0"}`}>
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
                    <section className={`rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 transition-opacity duration-200 ${activeSubTab === "profile" ? "opacity-100" : "hidden opacity-0"}`}>
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
                                onClick={() => void handleToggleClubMembership(row.id, !row.isFlightReviewClubMember)}
                                disabled={savingTrack}
                                className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
                                  row.isFlightReviewClubMember
                                    ? "border-sky-700/60 bg-sky-950/30 text-sky-300 hover:bg-sky-950/60"
                                    : "border-slate-700 text-slate-400 hover:bg-slate-800"
                                }`}
                              >
                                {row.isFlightReviewClubMember ? "Club ✓" : "Club"}
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

                    <div className={`transition-opacity duration-200 ${activeSubTab === "finance" ? "opacity-100" : "hidden opacity-0"}`}>
                      <AdminUserCreditsSection
                        studentUserId={selectedDetail.userId}
                        studentName={displayName(selectedDetail)}
                        anacCode={selectedDetail.profile.anacCode || "-"}
                      />
                    </div>

                    {authUser && activeSubTab === "observations" ? (
                      <StudentObservationsSection
                        studentUserId={selectedDetail.userId}
                        currentUser={{ id: authUser.id, name: authUser.name || authUser.email, role: "admin" }}
                      />
                    ) : null}
                  </>
                ) : null}

                {(roleDraft === "instrutor" || selectedDetail.role === "instrutor") ? (
                  <>
                    <div className={`transition-opacity duration-200 ${activeSubTab === "finance" ? "opacity-100" : "hidden opacity-0"}`}>
                      <InstructorCostsSection instructorUserId={selectedDetail.userId} />
                    </div>
                  <section className={`rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 transition-opacity duration-200 ${activeSubTab === "profile" ? "opacity-100" : "hidden opacity-0"}`}>
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
                  </>
                ) : null}

                <div className={`transition-opacity duration-200 ${activeSubTab === "finance" ? "opacity-100" : "hidden opacity-0"}`}>
                  <UserSalesSection userId={selectedDetail.userId} />
                </div>

                <section className={`rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 transition-opacity duration-200 ${activeSubTab === "import" ? "opacity-100" : "hidden opacity-0"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Import do SAGA (usuário)</p>
                      <p className="text-xs text-slate-600">
                        Executa o mesmo fluxo do import por seleção para este usuário (ID SAGA: {selectedDetail.profile.sagaUserId || "não vinculado"}).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleImportSelectedUserFromSaga()}
                      disabled={sagaUserImporting || !selectedDetail.profile.sagaUserId}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                    >
                      {sagaUserImporting ? "Importando..." : "Importar agora"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sagaUserImportScope.pastFlights}
                        onChange={(event) => setSagaUserImportScope((current) => ({ ...current, pastFlights: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                      />
                      Voos passados
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sagaUserImportScope.schedule}
                        onChange={(event) => setSagaUserImportScope((current) => ({ ...current, schedule: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                      />
                      Escala
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sagaUserImportScope.credits}
                        onChange={(event) => setSagaUserImportScope((current) => ({ ...current, credits: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
                      />
                      Créditos
                    </label>
                  </div>

                  {sagaUserImportSummary ? (
                    <p className="mt-3 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
                      {sagaUserImportSummary}
                    </p>
                  ) : null}
                </section>

                <section className={`grid grid-cols-1 gap-4 transition-opacity duration-200 xl:grid-cols-3 ${activeSubTab === "flights" ? "opacity-100" : "hidden opacity-0"}`}>
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
              </div>
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
      {showCreateUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowCreateUser(false)}>
          <form onSubmit={(event) => void handleCreateUser(event)} onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Criar usuario</h2>
              <button type="button" onClick={() => setShowCreateUser(false)} className="text-xs text-slate-400">Fechar</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400 sm:col-span-2">Nome completo
                <input required value={newUser.fullName} onChange={(e) => setNewUser((value) => ({ ...value, fullName: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">E-mail
                <input required type="email" value={newUser.email} onChange={(e) => setNewUser((value) => ({ ...value, email: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">Senha inicial
                <input required minLength={8} type="password" value={newUser.password} onChange={(e) => setNewUser((value) => ({ ...value, password: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">Permissao
                <select value={newUser.role} onChange={(e) => setNewUser((value) => ({ ...value, role: e.target.value as UserRole }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-400">Telefone
                <input value={newUser.phone} onChange={(e) => setNewUser((value) => ({ ...value, phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">CPF
                <input value={newUser.cpf} onChange={(e) => setNewUser((value) => ({ ...value, cpf: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">Nascimento
                <input type="date" value={newUser.birthDate} onChange={(e) => setNewUser((value) => ({ ...value, birthDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-400">Codigo ANAC
                <input value={newUser.anacCode} onChange={(e) => setNewUser((value) => ({ ...value, anacCode: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
            </div>
            <button type="submit" disabled={creatingUser} className="mt-5 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {creatingUser ? "Criando..." : "Criar usuario"}
            </button>
          </form>
        </div>
      ) : null}
      {showPaymentLink && selectedDetail ? (
        <PaymentLinkModal onClose={() => setShowPaymentLink(false)} initialUser={detailToSummary(selectedDetail)} />
      ) : null}
    </div>
  );
}
