import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ensureFlightReviewClubMemberTasks,
  forceFlightReviewClubAccess,
  getAdminFlightReviewClubOverview,
  listAdminFlightReviewClubMembers,
  updateFlightReviewClubTask,
} from "../../lib/caktoDb";
import { searchFlightPickerUsers } from "../../lib/adminUsersDb";
import { getSchoolRules, saveSchoolRules, uploadFrcTrainingCoverImage, uploadFrcTrainingPdf } from "../../lib/schoolRulesDb";
import type {
  FlightReviewClubAdminOverview,
  FlightReviewClubMemberRow,
  FlightReviewClubTask,
  FlightReviewClubTaskStatus,
} from "../../types/cakto";
import type { AdminUserSummary } from "../../types/adminUsers";
import type { StudentIdentity } from "../../types/schedule";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  STUDENT_PORTAL_TAB_OPTIONS,
  type FlightReviewClubChecklistTemplateItem,
  type FlightReviewClubRules,
  type FlightReviewClubSubscriptionPlan,
  type FlightReviewClubTrainingCourse,
  type FlightReviewClubTrainingLesson,
  type SchoolRules,
  type SchoolRulesInput,
} from "../../types/schoolRules";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";
import { StudentSearchSelect } from "./StudentSearchSelect";

function toStudentIdentity(user: AdminUserSummary): StudentIdentity {
  return {
    userId: user.userId,
    label: user.name || user.email || user.userId,
    nickname: user.profile?.nickname || null,
    email: user.email || null,
    anacCode: user.profile?.anacCode || null,
    weightKg: null,
    heightCm: null,
  };
}

type FrcSubTab = "overview" | "landing" | "subscription" | "training" | "members" | "checklist";

const FRC_TABS: Array<{ id: FrcSubTab; label: string }> = [
  { id: "overview", label: "Visao geral" },
  { id: "landing", label: "Landing Page" },
  { id: "subscription", label: "Assinatura" },
  { id: "training", label: "Treinamento" },
  { id: "members", label: "Integrantes" },
  { id: "checklist", label: "Checklist Base" },
];

const TASK_STATUS_OPTIONS: Array<{ id: FlightReviewClubTaskStatus; label: string }> = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "concluido", label: "Concluído" },
  { id: "bloqueado", label: "Bloqueado" },
  { id: "revogar", label: "Revogar" },
  { id: "revogado", label: "Revogado" },
];

const TEXT_INPUT =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500";
const PANEL = "rounded-xl border border-slate-700/60 bg-slate-900/45 p-4";

function rulesInputFrom(settings: SchoolRules): SchoolRulesInput {
  return {
    studentTabs: settings.studentTabs,
    theme: settings.theme,
    schedule: settings.schedule,
    scheduleStudentHelp: settings.scheduleStudentHelp,
    emailNotifications: settings.emailNotifications,
    flightReviewClub: settings.flightReviewClub,
    flightEvaluation: settings.flightEvaluation,
    soloFlight: settings.soloFlight,
    capacityProjection: settings.capacityProjection,
  };
}

function createId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`.slice(0, 64);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function taskProgress(tasks: FlightReviewClubTask[]): string {
  if (tasks.length === 0) return "0/0";
  const done = tasks.filter((task) => task.status === "concluido" || task.status === "revogado").length;
  return `${done}/${tasks.length}`;
}

function hasIncompleteTasks(member: FlightReviewClubMemberRow): boolean {
  return member.tasks.length === 0 || member.tasks.some((task) => task.status !== "concluido" && task.status !== "revogado");
}

function memberHasAccess(member: FlightReviewClubMemberRow): boolean {
  const membership = member.membership;
  if (membership.status === "active" || membership.status === "trial") return true;
  if (membership.status !== "canceled") return false;
  const until = membership.accessUntil || membership.nextPaymentDate;
  return until ? new Date(until).getTime() >= Date.now() : false;
}

function StatusBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "sky" }) {
  const classes = {
    slate: "border-slate-700 bg-slate-950/50 text-slate-300",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    red: "border-red-500/40 bg-red-500/10 text-red-200",
    sky: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

export function AdminFrcTab() {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<FrcSubTab>("overview");
  const [settings, setSettings] = useState<SchoolRules | null>(null);
  const [club, setClubState] = useState<FlightReviewClubRules>(DEFAULT_FLIGHT_REVIEW_CLUB_RULES);
  const [overview, setOverview] = useState<FlightReviewClubAdminOverview | null>(null);
  const [members, setMembers] = useState<FlightReviewClubMemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [manualAccessTarget, setManualAccessTarget] = useState("");
  const [manualAccessUntil, setManualAccessUntil] = useState("");
  const [manualAccessBusy, setManualAccessBusy] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerStudents, setPickerStudents] = useState<StudentIdentity[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const visibleMembers = useMemo(
    () => showIncompleteOnly ? members.filter(hasIncompleteTasks) : members,
    [members, showIncompleteOnly],
  );

  const setClub = (patch: Partial<FlightReviewClubRules>) => setClubState((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rules, frcOverview, frcMembers] = await Promise.all([
        getSchoolRules(),
        getAdminFlightReviewClubOverview().catch(() => null),
        listAdminFlightReviewClubMembers("").catch(() => []),
      ]);
      setSettings(rules);
      setClubState(rules.flightReviewClub);
      setOverview(frcOverview);
      setMembers(frcMembers);
    } catch (err) {
      setError((err as Error).message || "Não foi possível carregar o FRC.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (subTab !== "members") return;
    const timer = window.setTimeout(() => {
      setMembersLoading(true);
      void listAdminFlightReviewClubMembers(search)
        .then(setMembers)
        .catch((err) => setError((err as Error).message))
        .finally(() => setMembersLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, subTab]);

  useEffect(() => {
    if (subTab !== "members") return;
    let cancelled = false;
    setPickerLoading(true);
    const handle = window.setTimeout(() => {
      void searchFlightPickerUsers({ role: "aluno", search: pickerQuery.trim(), limit: 20 })
        .then((users) => {
          if (!cancelled) setPickerStudents(users.map(toStudentIdentity));
        })
        .catch(() => {
          if (!cancelled) setPickerStudents([]);
        })
        .finally(() => {
          if (!cancelled) setPickerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [pickerQuery, subTab]);

  async function saveClub(nextClub = club) {
    if (!settings) return;
    const recurringEnabled = nextClub.billingMode !== "legacy_one_time";
    const activeSubscriptionPlans = nextClub.subscriptionPlans.filter((plan) => plan.enabled);
    if (nextClub.enabled && recurringEnabled && activeSubscriptionPlans.length > 0 && !nextClub.caktoSubscriptionProductId.trim()) {
      setError("Informe o Product ID recorrente da Cakto para usar planos por assinatura.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const current = await getSchoolRules().catch(() => settings);
      const saved = await saveSchoolRules({ ...rulesInputFrom(current), flightReviewClub: nextClub });
      setSettings(saved);
      setClubState({
        ...saved.flightReviewClub,
        exclusiveStudentTabs: nextClub.exclusiveStudentTabs,
      });
      showToast({ variant: "success", message: "FRC salvo com sucesso." });
    } catch (err) {
      setError((err as Error).message || "Não foi possível salvar o FRC.");
    } finally {
      setSaving(false);
    }
  }

  function updatePlan(planId: FlightReviewClubSubscriptionPlan["id"], patch: Partial<FlightReviewClubSubscriptionPlan>) {
    setClub({
      subscriptionPlans: club.subscriptionPlans.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan),
    });
  }

  async function reloadFrcMembers(nextSearch = search) {
    const [frcOverview, frcMembers] = await Promise.all([
      getAdminFlightReviewClubOverview().catch(() => null),
      listAdminFlightReviewClubMembers(nextSearch),
    ]);
    setOverview(frcOverview);
    setMembers(frcMembers);
  }

  async function grantManualAccess(target = manualAccessTarget, accessUntil = manualAccessUntil) {
    const safeTarget = target.trim();
    if (!safeTarget) {
      setError("Selecione um aluno.");
      return;
    }
    setManualAccessBusy(true);
    setError(null);
    try {
      await forceFlightReviewClubAccess({
        studentUserId: safeTarget,
        mode: "grant",
        accessUntil: accessUntil.trim() || null,
      });
      await reloadFrcMembers();
      setManualAccessTarget("");
      setManualAccessUntil("");
      setPickerQuery("");
      setPickerKey((key) => key + 1);
      showToast({ variant: "success", message: "Acesso manual ao FRC liberado." });
    } catch (err) {
      setError((err as Error).message || "Não foi possível liberar o acesso manual.");
    } finally {
      setManualAccessBusy(false);
    }
  }

  async function grantMemberManualAccess(member: FlightReviewClubMemberRow) {
    const currentUntil = member.membership.accessUntil || member.membership.nextPaymentDate || "";
    const accessUntil = window.prompt("Acesso manual até (YYYY-MM-DD). Deixe vazio para sem vencimento.", currentUntil.slice(0, 10));
    if (accessUntil === null) return;
    setTaskBusy(`grant-${member.membership.id}`);
    try {
      await grantManualAccess(member.membership.studentUserId, accessUntil);
    } finally {
      setTaskBusy(null);
    }
  }

  async function revokeManualAccess(member: FlightReviewClubMemberRow) {
    const label = member.studentName || member.studentEmail || member.membership.studentUserId;
    if (!window.confirm(`Remover acesso ao FRC de ${label}? Essa ação expira os acessos locais desse aluno.`)) return;
    setTaskBusy(`revoke-${member.membership.id}`);
    setError(null);
    try {
      await forceFlightReviewClubAccess({
        studentUserId: member.membership.studentUserId,
        mode: "revoke",
      });
      await reloadFrcMembers();
      showToast({ variant: "success", message: "Acesso FRC removido." });
    } catch (err) {
      setError((err as Error).message || "Não foi possível remover o acesso FRC.");
    } finally {
      setTaskBusy(null);
    }
  }

  async function refreshMemberTasks(member: FlightReviewClubMemberRow) {
    setTaskBusy(member.membership.id);
    try {
      const tasks = await ensureFlightReviewClubMemberTasks(member.membership.id);
      setMembers((current) => current.map((row) => row.membership.id === member.membership.id ? { ...row, tasks } : row));
      showToast({ variant: "success", message: "Checklist do integrante atualizado." });
    } catch (err) {
      setError((err as Error).message || "Não foi possível gerar o checklist.");
    } finally {
      setTaskBusy(null);
    }
  }

  async function patchTask(member: FlightReviewClubMemberRow, task: FlightReviewClubTask, patch: Partial<FlightReviewClubTask>) {
    setTaskBusy(task.id);
    try {
      const saved = await updateFlightReviewClubTask({
        taskId: task.id,
        status: patch.status,
        notes: patch.notes,
        assignedToUserId: patch.assignedToUserId,
        dueAt: patch.dueAt,
      });
      setMembers((current) => current.map((row) => {
        if (row.membership.id !== member.membership.id) return row;
        return { ...row, tasks: row.tasks.map((item) => item.id === saved.id ? saved : item) };
      }));
    } catch (err) {
      setError((err as Error).message || "Não foi possível atualizar a tarefa.");
    } finally {
      setTaskBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-sky-500/25 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-300/80">Flight Review Club</p>
            <h2 className="mt-1 text-2xl font-black text-white">Assinatura, benefícios e integrantes</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Controle a oferta comercial, a landing page pública, o acesso recorrente e as entregas manuais como NexAtlas, Clube 360, curso, camiseta e crachá.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={club.enabled ? "green" : "red"}>{club.enabled ? "Interno ligado" : "Desligado"}</StatusBadge>
            <StatusBadge tone={club.showInStudentMenu ? "amber" : "slate"}>{club.showInStudentMenu ? "Menu aluno ligado" : "Menu aluno desligado"}</StatusBadge>
            <StatusBadge tone="sky">{club.trialFlightCount} voos de trial</StatusBadge>
          </div>
        </div>
      </div>

      <Tabs items={FRC_TABS} value={subTab} onChange={setSubTab} ariaLabel="Abas FRC" accent="sky" />

      {subTab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <Metric label="Integrantes" value={overview?.totalMembers ?? members.length} />
            <Metric label="Com acesso" value={overview?.activeAccess ?? members.filter(memberHasAccess).length} tone="green" />
            <Metric label="Cancelados" value={overview?.canceled ?? members.filter((m) => m.membership.status === "canceled").length} tone="amber" />
            <Metric label="Pendências" value={overview?.pendingTasks ?? members.flatMap((m) => m.tasks).filter((t) => t.status !== "concluido" && t.status !== "revogado").length} tone="sky" />
            <Metric label="Revogacoes" value={overview?.revocationTasks ?? members.flatMap((m) => m.tasks).filter((t) => t.status === "revogar").length} tone="red" />
          </div>
          <div className={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Configuracao final desta etapa</h3>
                <p className="mt-1 text-xs text-slate-500">FRC fica funcional internamente, landing pública ativa, mas oculto no menu do aluno.</p>
              </div>
              <button type="button" onClick={() => void saveClub({ ...club, enabled: true, showInStudentMenu: false, trialFlightCount: 100 })} disabled={saving} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
                Aplicar enabled=true, menu=false, trial=100
              </button>
            </div>
          </div>
            <MembersList members={members.slice(0, 6)} compact />
        </div>
      ) : null}

      {subTab === "landing" ? (
        <div className="space-y-4">
          <div className={PANEL}>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Editor visual</p>
            <h3 className="mt-2 text-xl font-black text-white">Altere textos e imagens direto na landing</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Abra a página pública, clique no texto para editar e passe o mouse nas imagens para trocar o print. Depois salve na barra de baixo.
            </p>
            <a
              href="/flight-review-club?edit=1"
              className="mt-4 inline-flex rounded-lg bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-sky-300"
            >
              Abrir landing para editar
            </a>
          </div>
          <div className={PANEL}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Tipo de landing
                <select value={club.landingPageType} onChange={(e) => setClub({ landingPageType: e.target.value as FlightReviewClubRules["landingPageType"] })} className={TEXT_INPUT}>
                  <option value="internal_public_page">Página pública interna (/flight-review-club)</option>
                  <option value="external_url">URL externa</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                URL externa
                <input value={club.externalUrl} onChange={(e) => setClub({ externalUrl: e.target.value })} disabled={club.landingPageType !== "external_url"} className={`${TEXT_INPUT} disabled:opacity-50`} />
              </label>
              <label className="text-xs text-slate-400">
                Link fallback do CTA
                <input value={club.ctaSubscriptionUrl} onChange={(e) => setClub({ ctaSubscriptionUrl: e.target.value })} placeholder="https://..." className={TEXT_INPUT} />
              </label>
            </div>
            <SaveBar saving={saving} onSave={() => void saveClub()} />
          </div>
        </div>
      ) : null}

      {subTab === "subscription" ? (
        <div className="space-y-4">
          <div className={PANEL}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={club.enabled} onChange={(e) => setClub({ enabled: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                Ativar FRC internamente
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={club.showInStudentMenu} onChange={(e) => setClub({ showInStudentMenu: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                Mostrar no menu do aluno
              </label>
              <label className="text-xs text-slate-400">
                Tipo de landing
                <select value={club.landingPageType} onChange={(e) => setClub({ landingPageType: e.target.value as FlightReviewClubRules["landingPageType"] })} className={TEXT_INPUT}>
                    <option value="internal_public_page">Página pública interna (/flight-review-club)</option>
                  <option value="external_url">URL externa</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                URL externa
                <input value={club.externalUrl} onChange={(e) => setClub({ externalUrl: e.target.value })} disabled={club.landingPageType !== "external_url"} className={`${TEXT_INPUT} disabled:opacity-50`} />
              </label>
              <label className="text-xs text-slate-400">
                Voos de trial
                <input type="number" min={0} max={500} value={club.trialFlightCount} onChange={(e) => setClub({ trialFlightCount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400">
                Termo de adesão
                <input value={club.adhesionTermUrl} onChange={(e) => setClub({ adhesionTermUrl: e.target.value })} placeholder="https://..." className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400">
                Modo de cobrança
                <select value={club.billingMode} onChange={(e) => setClub({ billingMode: e.target.value as FlightReviewClubRules["billingMode"] })} className={TEXT_INPUT}>
                  <option value="both">Legado por trilha + assinatura</option>
                  <option value="student_subscription">Somente assinatura por aluno</option>
                  <option value="legacy_one_time">Somente pagamento único legado</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Product ID recorrente Cakto
                <input value={club.caktoSubscriptionProductId} onChange={(e) => setClub({ caktoSubscriptionProductId: e.target.value })} placeholder="prod_..." className={TEXT_INPUT} />
              </label>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {club.subscriptionPlans.map((plan) => (
                <div key={plan.id} className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <input type="checkbox" checked={plan.enabled} onChange={(e) => updatePlan(plan.id, { enabled: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                    {plan.label}
                  </label>
                  <label className="mt-3 block text-xs text-slate-400">
                    Valor
                    <input type="number" min={0} step={0.01} value={plan.amount} onChange={(e) => updatePlan(plan.id, { amount: Number(e.target.value) || 0 })} className={TEXT_INPUT} />
                  </label>
                  <label className="mt-3 block text-xs text-slate-400">
                    Período em dias
                    <input type="number" min={1} step={1} value={plan.recurrencePeriodDays} onChange={(e) => updatePlan(plan.id, { recurrencePeriodDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className={TEXT_INPUT} />
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-slate-700/60 bg-slate-950/25 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Abas premium liberadas por assinatura</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {STUDENT_PORTAL_TAB_OPTIONS.map((tab) => (
                  <label key={tab.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={club.exclusiveStudentTabs.includes(tab.id)}
                      onChange={(e) => {
                        const set = new Set(club.exclusiveStudentTabs);
                        if (e.target.checked) set.add(tab.id);
                        else set.delete(tab.id);
                        setClub({ exclusiveStudentTabs: STUDENT_PORTAL_TAB_OPTIONS.map((item) => item.id).filter((id) => set.has(id)) });
                      }}
                      className="h-4 w-4 accent-sky-500"
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
            </div>
            <SaveBar saving={saving} onSave={() => void saveClub()} />
          </div>
        </div>
      ) : null}

      {subTab === "members" ? (
        <div className="space-y-4">
          <div className={`${PANEL} overflow-visible`}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
              <label className="text-xs text-slate-400">
                Buscar integrante
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, e-mail, status ou plano" className={TEXT_INPUT} />
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={showIncompleteOnly} onChange={(e) => setShowIncompleteOnly(e.target.checked)} className="h-4 w-4 accent-sky-500" />
                Somente incompletos
              </label>
            </div>
            <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 lg:grid-cols-[minmax(0,1fr)_190px_auto] lg:items-end">
              <StudentSearchSelect
                key={pickerKey}
                label="Liberar acesso manual para aluno"
                students={pickerStudents}
                value={manualAccessTarget}
                onChange={(student) => setManualAccessTarget(student.userId)}
                disableLocalFilter
                loading={pickerLoading}
                onQueryChange={setPickerQuery}
                placeholder="Pesquise por nickname, nome, e-mail ou ANAC"
                className="relative z-30"
              />
              <label className="text-xs text-slate-400">
                Acesso até
                <input type="date" value={manualAccessUntil} onChange={(e) => setManualAccessUntil(e.target.value)} className={TEXT_INPUT} />
              </label>
              <button type="button" onClick={() => void grantManualAccess()} disabled={manualAccessBusy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
                {manualAccessBusy ? "Liberando..." : "Liberar acesso"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Mostrando {visibleMembers.length} de {members.length} integrantes. Abra um card para ver cobrança e checklist.
            </p>
            {membersLoading ? <p className="mt-2 text-xs text-slate-500">Atualizando lista...</p> : null}
          </div>
          <MembersList
            members={visibleMembers}
            onEnsureTasks={refreshMemberTasks}
            onUpdateTask={patchTask}
            onGrantAccess={grantMemberManualAccess}
            onRevokeAccess={revokeManualAccess}
            taskBusy={taskBusy}
          />
        </div>
      ) : null}

      {subTab === "training" ? (
        <TrainingCoursesEditor
          courses={club.trainingCourses}
          onChange={(trainingCourses) => setClub({ trainingCourses })}
          saving={saving}
          onSave={() => void saveClub()}
        />
      ) : null}

      {subTab === "checklist" ? (
        <ChecklistTemplateEditor
          items={club.checklistTemplate}
          onChange={(items) => setClub({ checklistTemplate: items })}
          saving={saving}
          onSave={() => void saveClub()}
        />
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "amber" | "red" | "sky" }) {
  const color = {
    slate: "text-white",
    green: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
    sky: "text-sky-300",
  }[tone];
  return (
    <div className={PANEL}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
      <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
        {saving ? "Salvando..." : "Salvar FRC"}
      </button>
    </div>
  );
}

function MembersList({
  members,
  compact = false,
  onEnsureTasks,
  onUpdateTask,
  onGrantAccess,
  onRevokeAccess,
  taskBusy,
}: {
  members: FlightReviewClubMemberRow[];
  compact?: boolean;
  onEnsureTasks?: (member: FlightReviewClubMemberRow) => Promise<void>;
  onUpdateTask?: (member: FlightReviewClubMemberRow, task: FlightReviewClubTask, patch: Partial<FlightReviewClubTask>) => Promise<void>;
  onGrantAccess?: (member: FlightReviewClubMemberRow) => Promise<void>;
  onRevokeAccess?: (member: FlightReviewClubMemberRow) => Promise<void>;
  taskBusy?: string | null;
}) {
  if (members.length === 0) {
    return <div className={PANEL}><p className="text-sm text-slate-500">Nenhum integrante FRC encontrado ainda.</p></div>;
  }
  return (
    <div className="space-y-3">
      {members.map((member) => {
        const membership = member.membership;
        const access = memberHasAccess(member);
        const incompleteCount = member.tasks.filter((task) => task.status !== "concluido" && task.status !== "revogado").length;
        return (
          <details key={membership.id} className={PANEL}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-white">{member.studentName || member.studentEmail || membership.studentUserId}</h3>
                <p className="mt-1 truncate text-xs text-slate-500">{member.studentEmail || membership.studentUserId}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={access ? "green" : "slate"}>{access ? "Com acesso" : "Sem acesso"}</StatusBadge>
                <StatusBadge tone={membership.cancelAtPeriodEnd ? "amber" : "sky"}>{membership.status}</StatusBadge>
                <StatusBadge>{taskProgress(member.tasks)}</StatusBadge>
                {incompleteCount > 0 ? <StatusBadge tone="amber">{incompleteCount} pendente(s)</StatusBadge> : <StatusBadge tone="green">Completo</StatusBadge>}
                <span className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400">Abrir</span>
              </div>
            </summary>
            <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400 md:grid-cols-5">
              <Info label="Plano" value={membership.planName || membership.planId || "-"} />
              <Info label="Origem" value={membership.source} />
              <Info label="Próxima cobrança" value={formatDate(membership.nextPaymentDate)} />
              <Info label="Acesso até" value={formatDate(membership.accessUntil || membership.nextPaymentDate)} />
              <Info label="Cancelamento" value={membership.cancelAtPeriodEnd ? "No fim do período" : formatDate(membership.canceledAt)} />
            </div>
            {!compact ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Checklist do integrante</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {onGrantAccess ? (
                      <button type="button" onClick={() => void onGrantAccess(member)} disabled={taskBusy === `grant-${membership.id}`} className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60">
                        {taskBusy === `grant-${membership.id}` ? "Liberando..." : "Liberar acesso"}
                      </button>
                    ) : null}
                    {onRevokeAccess ? (
                      <button type="button" onClick={() => void onRevokeAccess(member)} disabled={taskBusy === `revoke-${membership.id}`} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60">
                        {taskBusy === `revoke-${membership.id}` ? "Removendo..." : "Remover acesso"}
                      </button>
                    ) : null}
                    {onEnsureTasks ? (
                      <button type="button" onClick={() => void onEnsureTasks(member)} disabled={taskBusy === membership.id} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60">
                        {taskBusy === membership.id ? "Gerando..." : "Gerar/atualizar base"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {member.tasks.length === 0 ? <p className="text-xs text-slate-500">Checklist ainda não gerado.</p> : null}
                {member.tasks.map((task) => (
                  <div key={task.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/25 p-3 lg:grid-cols-[minmax(0,1fr)_160px_minmax(220px,0.8fr)]">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{task.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{task.description}</p>
                    </div>
                    <select
                      value={task.status}
                      onChange={(e) => onUpdateTask?.(member, task, { status: e.target.value as FlightReviewClubTaskStatus })}
                      disabled={!onUpdateTask || taskBusy === task.id}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60"
                    >
                      {TASK_STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                    <input
                      value={task.notes}
                      onChange={(e) => onUpdateTask?.(member, task, { notes: e.target.value })}
                      disabled={!onUpdateTask || taskBusy === task.id}
                      placeholder="Observações"
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 break-words text-slate-300">{value}</p>
    </div>
  );
}

function ChecklistTemplateEditor({
  items,
  onChange,
  saving,
  onSave,
}: {
  items: FlightReviewClubChecklistTemplateItem[];
  onChange: (items: FlightReviewClubChecklistTemplateItem[]) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className={PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Checklist base para novos integrantes</h3>
          <p className="mt-1 text-xs text-slate-500">Cada novo integrante recebe tarefas criadas a partir dos itens ativos abaixo.</p>
        </div>
        <button type="button" onClick={() => onChange([...items, { id: createId("frc-task"), title: "", description: "", enabled: true }])} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          Adicionar item
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <input type="checkbox" checked={item.enabled} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, enabled: e.target.checked } : current))} className="h-4 w-4 accent-sky-500" />
                Ativo para novos membros
              </label>
              <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                Remover
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Titulo
                <input value={item.title} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, title: e.target.value } : current))} className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400">
                ID do template
                <input value={item.id} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, id: e.target.value } : current))} className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400 md:col-span-2">
                Descrição operacional
                <textarea value={item.description} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, description: e.target.value } : current))} rows={2} className={TEXT_INPUT} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <SaveBar saving={saving} onSave={onSave} />
    </div>
  );
}

function newTrainingCourse(): FlightReviewClubTrainingCourse {
  return {
    id: createId("frc-course"),
    title: "Novo curso FRC",
    description: "",
    coverImageUrl: "",
    enabled: true,
    sortOrder: 0,
    lessons: [],
  };
}

function newTrainingLesson(kind: FlightReviewClubTrainingLesson["kind"]): FlightReviewClubTrainingLesson {
  return {
    id: createId(kind === "pdf" ? "frc-pdf" : "frc-video"),
    title: kind === "pdf" ? "Novo PDF" : "Nova aula Vimeo",
    description: "",
    kind,
    vimeoUrl: "",
    pdfUrl: "",
    durationLabel: "",
    enabled: true,
  };
}

function TrainingCoursesEditor({
  courses,
  onChange,
  saving,
  onSave,
}: {
  courses: FlightReviewClubTrainingCourse[];
  onChange: (courses: FlightReviewClubTrainingCourse[]) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const { showToast } = useToast();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(courses[0]?.id ?? null);
  const [uploadingLessonKey, setUploadingLessonKey] = useState<string | null>(null);
  const [uploadingCoverCourseId, setUploadingCoverCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (courses.length === 0) {
      if (selectedCourseId !== null) setSelectedCourseId(null);
      return;
    }
    if (!courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const selectedCourseIndex = courses.findIndex((course) => course.id === selectedCourseId);
  const selectedCourse = selectedCourseIndex >= 0 ? courses[selectedCourseIndex] : null;

  function patchCourse(index: number, patch: Partial<FlightReviewClubTrainingCourse>) {
    onChange(courses.map((course, i) => i === index ? { ...course, ...patch } : course));
  }

  function patchLesson(courseIndex: number, lessonIndex: number, patch: Partial<FlightReviewClubTrainingLesson>) {
    onChange(courses.map((course, i) => {
      if (i !== courseIndex) return course;
      return {
        ...course,
        lessons: course.lessons.map((lesson, j) => j === lessonIndex ? { ...lesson, ...patch } : lesson),
      };
    }));
  }

  function addLesson(courseIndex: number, kind: FlightReviewClubTrainingLesson["kind"]) {
    onChange(courses.map((course, i) => (
      i === courseIndex ? { ...course, lessons: [...course.lessons, newTrainingLesson(kind)] } : course
    )));
  }

  function removeLesson(courseIndex: number, lessonIndex: number) {
    onChange(courses.map((course, i) => (
      i === courseIndex ? { ...course, lessons: course.lessons.filter((_, j) => j !== lessonIndex) } : course
    )));
  }

  function addCourse() {
    const course = { ...newTrainingCourse(), sortOrder: courses.length };
    onChange([...courses, course]);
    setSelectedCourseId(course.id);
  }

  function removeCourse(courseIndex: number) {
    const nextCourses = courses.filter((_, i) => i !== courseIndex);
    onChange(nextCourses);
    setSelectedCourseId(nextCourses[Math.max(0, courseIndex - 1)]?.id ?? nextCourses[0]?.id ?? null);
  }

  async function handlePdfUpload(courseIndex: number, lessonIndex: number, file: File | null) {
    if (!file) return;
    const lesson = courses[courseIndex]?.lessons[lessonIndex];
    const key = `${courses[courseIndex]?.id ?? courseIndex}:${lesson?.id ?? lessonIndex}`;
    try {
      setUploadingLessonKey(key);
      const pdfUrl = await uploadFrcTrainingPdf(file);
      patchLesson(courseIndex, lessonIndex, { pdfUrl });
      showToast({ variant: "success", message: "PDF enviado. Clique em Salvar FRC para publicar." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Não foi possível enviar o PDF.",
      });
    } finally {
      setUploadingLessonKey(null);
    }
  }

  async function handleCoverUpload(courseIndex: number, file: File | null) {
    if (!file) return;
    const course = courses[courseIndex];
    const key = course?.id ?? String(courseIndex);
    try {
      setUploadingCoverCourseId(key);
      const coverImageUrl = await uploadFrcTrainingCoverImage(file);
      patchCourse(courseIndex, { coverImageUrl });
      showToast({ variant: "success", message: "Capa enviada. Clique em Salvar FRC para publicar." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Não foi possível enviar a capa.",
      });
    } finally {
      setUploadingCoverCourseId(null);
    }
  }

  return (
    <div className={PANEL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Treinamento FRC</h3>
          <p className="mt-1 text-xs text-slate-500">
            Publique cursos exclusivos com aulas Vimeo ou e-books em PDF. Alunos sem FRC veem o catálogo, mas não abrem o conteúdo.
          </p>
        </div>
        <button
          type="button"
          onClick={addCourse}
          className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
        >
          Adicionar curso
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          Nenhum curso configurado.
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/25 p-2">
          {courses.map((course, courseIndex) => (
            <button
              key={course.id || courseIndex}
              type="button"
              onClick={() => setSelectedCourseId(course.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                selectedCourse?.id === course.id
                  ? "border-sky-500/50 bg-sky-500/10"
                  : "border-transparent hover:border-slate-700 hover:bg-slate-900/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-bold text-white">{course.title || "Curso sem título"}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${course.enabled ? "border-emerald-500/40 text-emerald-200" : "border-slate-700 text-slate-500"}`}>
                  {course.enabled ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{course.lessons.length} item(ns)</p>
            </button>
          ))}
        </div>

        {selectedCourse ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Curso selecionado</p>
                <h4 className="mt-1 text-base font-black text-white">{selectedCourse.title || "Curso sem título"}</h4>
              </div>
              <button
                type="button"
                onClick={() => removeCourse(selectedCourseIndex)}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
              >
                Remover curso
              </button>
            </div>

            <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 md:grid-cols-2">
              <label className="text-xs text-slate-400">
                Título do curso
                <input value={selectedCourse.title} onChange={(e) => patchCourse(selectedCourseIndex, { title: e.target.value })} className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400">
                Ordem
                <input type="number" value={selectedCourse.sortOrder} onChange={(e) => patchCourse(selectedCourseIndex, { sortOrder: Math.round(Number(e.target.value) || 0) })} className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400 md:col-span-2">
                URL da capa
                <input value={selectedCourse.coverImageUrl} onChange={(e) => patchCourse(selectedCourseIndex, { coverImageUrl: e.target.value })} placeholder="https://..." className={TEXT_INPUT} />
              </label>
              <label className="text-xs text-slate-400 md:col-span-2">
                Enviar capa
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingCoverCourseId === selectedCourse.id}
                  onChange={(event) => {
                    void handleCoverUpload(selectedCourseIndex, event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                  className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {uploadingCoverCourseId === selectedCourse.id ? <p className="mt-1 text-xs text-sky-300">Enviando capa...</p> : null}
              </label>
              {selectedCourse.coverImageUrl ? (
                <div className="md:col-span-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                  <img src={selectedCourse.coverImageUrl} alt="" className="h-32 w-full object-cover" />
                </div>
              ) : null}
              <label className="text-xs text-slate-400 md:col-span-2">
                Descrição
                <textarea value={selectedCourse.description} onChange={(e) => patchCourse(selectedCourseIndex, { description: e.target.value })} rows={2} className={TEXT_INPUT} />
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 text-sm text-slate-200">
                <input type="checkbox" checked={selectedCourse.enabled} onChange={(e) => patchCourse(selectedCourseIndex, { enabled: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                Publicar no catálogo do aluno
              </label>
            </div>

            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aulas e PDFs</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => addLesson(selectedCourseIndex, "vimeo")} className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10">
                    Adicionar aula Vimeo
                  </button>
                  <button type="button" onClick={() => addLesson(selectedCourseIndex, "pdf")} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                    Adicionar PDF
                  </button>
                </div>
              </div>

              {selectedCourse.lessons.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">
                  Adicione uma aula Vimeo ou um PDF para publicar este curso.
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                {selectedCourse.lessons.map((lesson, lessonIndex) => {
                  const uploadKey = `${selectedCourse.id}:${lesson.id}`;
                  return (
                    <div key={lesson.id || lessonIndex} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                            <input type="checkbox" checked={lesson.enabled} onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, { enabled: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                            Ativo
                          </label>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${lesson.kind === "pdf" ? "border-red-500/35 bg-red-500/10 text-red-200" : "border-sky-500/35 bg-sky-500/10 text-sky-200"}`}>
                            {lesson.kind === "pdf" ? "PDF" : "Vídeo"}
                          </span>
                        </div>
                        <button type="button" onClick={() => removeLesson(selectedCourseIndex, lessonIndex)} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                          Remover item
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="text-xs text-slate-400">
                          Tipo
                          <select value={lesson.kind} onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, { kind: e.target.value as FlightReviewClubTrainingLesson["kind"] })} className={TEXT_INPUT}>
                            <option value="vimeo">Vídeo Vimeo</option>
                            <option value="pdf">PDF</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-400">
                          Duração/rótulo
                          <input value={lesson.durationLabel} onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, { durationLabel: e.target.value })} placeholder="12 min, 20 páginas..." className={TEXT_INPUT} />
                        </label>
                        <label className="text-xs text-slate-400 md:col-span-2">
                          Título
                          <input value={lesson.title} onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, { title: e.target.value })} className={TEXT_INPUT} />
                        </label>
                        <label className="text-xs text-slate-400 md:col-span-2">
                          {lesson.kind === "pdf" ? "URL do PDF" : "URL ou embed do Vimeo"}
                          <input
                            value={lesson.kind === "pdf" ? lesson.pdfUrl : lesson.vimeoUrl}
                            onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, lesson.kind === "pdf" ? { pdfUrl: e.target.value } : { vimeoUrl: e.target.value })}
                            placeholder={lesson.kind === "pdf" ? "https://.../arquivo.pdf" : "https://vimeo.com/123456789 ou iframe embed"}
                            className={TEXT_INPUT}
                          />
                        </label>
                        {lesson.kind === "pdf" ? (
                          <label className="text-xs text-slate-400 md:col-span-2">
                            Enviar PDF
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              disabled={uploadingLessonKey === uploadKey}
                              onChange={(event) => {
                                void handlePdfUpload(selectedCourseIndex, lessonIndex, event.currentTarget.files?.[0] ?? null);
                                event.currentTarget.value = "";
                              }}
                              className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            {uploadingLessonKey === uploadKey ? <p className="mt-1 text-xs text-sky-300">Enviando PDF...</p> : null}
                          </label>
                        ) : null}
                        <label className="text-xs text-slate-400 md:col-span-2">
                          Descrição
                          <textarea value={lesson.description} onChange={(e) => patchLesson(selectedCourseIndex, lessonIndex, { description: e.target.value })} rows={2} className={TEXT_INPUT} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedCourse.lessons.length > 0 ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
                  <button type="button" onClick={() => addLesson(selectedCourseIndex, "vimeo")} className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10">
                    Adicionar aula Vimeo
                  </button>
                  <button type="button" onClick={() => addLesson(selectedCourseIndex, "pdf")} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                    Adicionar PDF
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <SaveBar saving={saving} onSave={onSave} />
    </div>
  );
}

export default AdminFrcTab;
