import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BUCKET_ID, ID, NOTICES_BUCKET_ID, Permission, Role, storage } from "../../lib/appwrite";
import {
  ensureFlightReviewClubMemberTasks,
  forceFlightReviewClubAccess,
  getAdminFlightReviewClubOverview,
  listAdminFlightReviewClubMembers,
  updateFlightReviewClubTask,
} from "../../lib/caktoDb";
import { getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import type {
  FlightReviewClubAdminOverview,
  FlightReviewClubMemberRow,
  FlightReviewClubTask,
  FlightReviewClubTaskStatus,
} from "../../types/cakto";
import {
  DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  STUDENT_PORTAL_TAB_OPTIONS,
  type FlightReviewClubChecklistTemplateItem,
  type FlightReviewClubRules,
  type FlightReviewClubScreenshotItem,
  type FlightReviewClubSubscriptionPlan,
  type SchoolRules,
  type SchoolRulesInput,
} from "../../types/schoolRules";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/ToastProvider";

type FrcSubTab = "overview" | "landing" | "subscription" | "members" | "checklist";

const FRC_TABS: Array<{ id: FrcSubTab; label: string }> = [
  { id: "overview", label: "Visao geral" },
  { id: "landing", label: "Landing Page" },
  { id: "subscription", label: "Assinatura" },
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
  };
}

async function uploadPublicAsset(file: File, label: string): Promise<string> {
  const bucketId = NOTICES_BUCKET_ID ?? BUCKET_ID;
  if (!storage || !bucketId) throw new Error(`${label} não configurado.`);
  const uploaded = await storage.createFile(bucketId, ID.unique(), file, [Permission.read(Role.any())]);
  return storage.getFileView(bucketId, uploaded.$id).toString();
}

function createId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`.slice(0, 64);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount || 0));
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
  const [error, setError] = useState<string | null>(null);

  const activePlans = useMemo(() => club.subscriptionPlans.filter((plan) => plan.enabled), [club.subscriptionPlans]);
  const cheapestPlan = useMemo(
    () => activePlans.filter((plan) => plan.amount > 0).sort((a, b) => a.amount - b.amount)[0] ?? null,
    [activePlans],
  );
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
      setClubState(saved.flightReviewClub);
      showToast({ variant: "success", message: "FRC salvo com sucesso." });
    } catch (err) {
      setError((err as Error).message || "Não foi possível salvar o FRC.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File | null, apply: (url: string) => void) {
    if (!file) return;
    setError(null);
    try {
      apply(await uploadPublicAsset(file, "Assets publicos do FRC"));
    } catch (err) {
      setError((err as Error).message || "Não foi possível enviar o arquivo.");
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
      setError("Informe o ID ou e-mail do aluno.");
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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <label className="text-xs text-slate-400">
                  Titulo do hero
                  <input value={club.lpHeroTitle} onChange={(e) => setClub({ lpHeroTitle: e.target.value })} className={TEXT_INPUT} />
                </label>
                <label className="text-xs text-slate-400">
                  Subtitulo
                  <textarea value={club.lpHeroSubtitle} onChange={(e) => setClub({ lpHeroSubtitle: e.target.value })} rows={3} className={TEXT_INPUT} />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    CTA
                    <input value={club.lpCtaLabel} onChange={(e) => setClub({ lpCtaLabel: e.target.value })} className={TEXT_INPUT} />
                  </label>
                  <label className="text-xs text-slate-400">
                    Link fallback do CTA
                    <input value={club.ctaSubscriptionUrl} onChange={(e) => setClub({ ctaSubscriptionUrl: e.target.value })} placeholder="https://..." className={TEXT_INPUT} />
                  </label>
                </div>
                <label className="text-xs text-slate-400">
                  Imagem principal por URL
                  <input value={club.lpCoverImageUrl} onChange={(e) => setClub({ lpCoverImageUrl: e.target.value })} placeholder="https://..." className={TEXT_INPUT} />
                </label>
                <label className="text-xs text-slate-400">
                  Upload da imagem principal
                  <input type="file" accept="image/*" onChange={(e) => void uploadImage(e.target.files?.[0] ?? null, (url) => setClub({ lpCoverImageUrl: url }))} className="mt-1 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-950" />
                </label>
              </div>
              <LandingPreview club={club} cheapestPlan={cheapestPlan} />
            </div>
            <SaveBar saving={saving} onSave={() => void saveClub()} />
          </div>

          <EditableStringList
            title="Propostas de valor"
            items={club.lpValueProps}
            onChange={(items) => setClub({ lpValueProps: items })}
          />

          <EditableBenefits
            club={club}
            onChange={(items) => setClub({ lpBenefitItems: items, benefits: items.map((item) => item.text).filter(Boolean) })}
            onUpload={(index, file) => void uploadImage(file, (url) => {
              const items = club.lpBenefitItems.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: url } : item);
              setClub({ lpBenefitItems: items });
            })}
          />

          <EditableScreenshots
            items={club.lpScreenshotItems}
            onChange={(items) => setClub({ lpScreenshotItems: items })}
            onUpload={(index, file) => void uploadImage(file, (url) => {
              setClub({ lpScreenshotItems: club.lpScreenshotItems.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: url } : item) });
            })}
          />
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
          <div className={PANEL}>
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
              <label className="text-xs text-slate-400">
                Liberar acesso manual para aluno
                <input value={manualAccessTarget} onChange={(e) => setManualAccessTarget(e.target.value)} placeholder="ID ou e-mail do aluno" className={TEXT_INPUT} />
              </label>
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

function LandingPreview({ club, cheapestPlan }: { club: FlightReviewClubRules; cheapestPlan: FlightReviewClubSubscriptionPlan | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
      <div
        className="min-h-56 p-5"
        style={club.lpCoverImageUrl ? {
          backgroundImage: `linear-gradient(90deg, rgba(2,6,23,0.92), rgba(2,6,23,0.45)), url(${club.lpCoverImageUrl})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        } : undefined}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Preview</p>
        <h3 className="mt-3 text-2xl font-black text-white">{club.lpHeroTitle || "Flight Review Club"}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{club.lpHeroSubtitle}</p>
        {cheapestPlan ? <p className="mt-4 text-lg font-black text-sky-200">A partir de {formatCurrency(cheapestPlan.amount)}</p> : null}
        <span className="mt-4 inline-flex rounded-lg bg-sky-400 px-4 py-2 text-sm font-black text-slate-950">{club.lpCtaLabel || "Assinar"}</span>
      </div>
    </div>
  );
}

function EditableStringList({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        <button type="button" onClick={() => onChange([...items, ""])} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          Adicionar
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input value={item} onChange={(e) => onChange(items.map((current, i) => i === index ? e.target.value : current))} className={TEXT_INPUT} />
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="mt-1 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10">
              Remover
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableBenefits({
  club,
  onChange,
  onUpload,
}: {
  club: FlightReviewClubRules;
  onChange: (items: FlightReviewClubRules["lpBenefitItems"]) => void;
  onUpload: (index: number, file: File | null) => void;
}) {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Benefícios do pacote real</h3>
        <button type="button" onClick={() => onChange([...club.lpBenefitItems, { text: "", imageUrl: "" }])} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          Adicionar
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {club.lpBenefitItems.map((item, index) => (
          <div key={index} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
            <label className="text-xs text-slate-400">
              Beneficio
              <input value={item.text} onChange={(e) => onChange(club.lpBenefitItems.map((current, i) => i === index ? { ...current, text: e.target.value } : current))} className={TEXT_INPUT} />
            </label>
            <label className="mt-2 block text-xs text-slate-400">
              Imagem por URL
              <input value={item.imageUrl} onChange={(e) => onChange(club.lpBenefitItems.map((current, i) => i === index ? { ...current, imageUrl: e.target.value } : current))} className={TEXT_INPUT} />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <input type="file" accept="image/*" onChange={(e) => onUpload(index, e.target.files?.[0] ?? null)} className="min-w-0 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100" />
              <button type="button" onClick={() => onChange(club.lpBenefitItems.filter((_, i) => i !== index))} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableScreenshots({
  items,
  onChange,
  onUpload,
}: {
  items: FlightReviewClubScreenshotItem[];
  onChange: (items: FlightReviewClubScreenshotItem[]) => void;
  onUpload: (index: number, file: File | null) => void;
}) {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Prints da plataforma</h3>
        <button type="button" onClick={() => onChange([...items, { title: "", description: "", imageUrl: "" }])} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
          Adicionar print
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
            <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-600">Sem imagem</span>}
            </div>
            <label className="text-xs text-slate-400">
              Titulo
              <input value={item.title} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, title: e.target.value } : current))} className={TEXT_INPUT} />
            </label>
            <label className="mt-2 block text-xs text-slate-400">
              Descrição
              <textarea value={item.description} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, description: e.target.value } : current))} rows={2} className={TEXT_INPUT} />
            </label>
            <label className="mt-2 block text-xs text-slate-400">
              Imagem por URL
              <input value={item.imageUrl} onChange={(e) => onChange(items.map((current, i) => i === index ? { ...current, imageUrl: e.target.value } : current))} className={TEXT_INPUT} />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <input type="file" accept="image/*" onChange={(e) => onUpload(index, e.target.files?.[0] ?? null)} className="min-w-0 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-slate-100" />
              <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10">
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
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

export default AdminFrcTab;
