import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ReactNode } from "react";
import { ProposalGeneratorModal } from "./ProposalGeneratorModal";
import { useAuth } from "../../contexts/AuthContext";
import { deleteSagaUser, getAdminUserDetail, lookupSagaAnacPersonAdmin, runEnrollmentAutomation } from "../../lib/adminUsersDb";
import { buildSagaAnacPostFields, hasSagaAnacPerson, parseSagaAnacPerson, sagaAnacMissingEnrollmentFields } from "../../lib/sagaAnacSync";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listStandardContractTemplates } from "../../lib/contractTemplatesDb";
import { listTrainingTracks } from "../../lib/trainingTracksDb";
import { createLead, deleteLead, generateCadastroToken, listCrmStatusSettings, listLeads, saveCrmStatusSetting, updateLead } from "../../lib/crmDb";
import { notifyCrmLeadEvent } from "../../lib/notificationsDb";
import { hasStudentScheduledFlights, hasStudentRealizedFlights } from "../../lib/flightsDb";
import { getProposalsByLead } from "../../lib/crmProposalsDb";
import { createLeadComment, deleteLeadComment, listLeadComments, type CrmLeadComment } from "../../lib/crmCommentsDb";
import type { CrmProposal } from "../../types/proposal";
import { getStudentCreditStatement } from "../../lib/creditsDb";
import { listProductSalesForUser } from "../../lib/productSalesDb";
import { AdminUserCreditsSection } from "./AdminUserCreditsSection";
import {
  approveStudentAccess,
  getProfile,
  getProfileDocumentUrl,
  updateProfileFields,
  uploadProfileDocumentAttachment,
  type PilotProfile,
  type ProfileDocumentType,
} from "../../lib/rbac";
import type { ContractTemplate, CustomVariable } from "../../types/contracts";
import {
  CRM_STATUSES,
  CRM_STATUS_COLUMN_BG,
  CRM_STATUS_LABELS,
  CRM_STATUS_PILL,
  AVAILABLE_DAY_LABELS,
} from "../../types/crm";
import type { CrmLead, CrmLeadFollowup, CrmStatus, CrmStatusFollowupTemplate, CrmStatusSetting } from "../../types/crm";
import type { AvailableDay, AvailablePeriod } from "../../types/crm";

// ─── Card field settings ──────────────────────────────────────────────────────

type CardFieldKey =
  | "email"
  | "phone"
  | "qualBadge"
  | "accountBadge"
  | "course"
  | "anacCode"
  | "openFollowups"
  | "expired"
  | "expirationDays"
  | "funnelEnteredAt"
  | "statusEnteredAt";

const CARD_FIELD_DEFS: { key: CardFieldKey; label: string }[] = [
  { key: "email",        label: "E-mail" },
  { key: "phone",        label: "Telefone" },
  { key: "qualBadge",    label: "Badge qualificação" },
  { key: "accountBadge", label: "Badge conta criada" },
  { key: "course",       label: "Curso desejado" },
  { key: "anacCode",     label: "Código ANAC" },
];

CARD_FIELD_DEFS.push(
  { key: "openFollowups", label: "FUPs em aberto" },
  { key: "expired", label: "Aviso expirado" },
  { key: "expirationDays", label: "Dias ate expiracao" },
  { key: "funnelEnteredAt", label: "Entrada no funil" },
  { key: "statusEnteredAt", label: "Entrada no status" },
);

const DEFAULT_CARD_FIELDS = new Set<CardFieldKey>(["email", "qualBadge", "accountBadge", "course"]);
const LS_KEY = "crm_card_visible_fields";

function useCardFieldSettings() {
  const [visibleFields, setVisibleFields] = useState<Set<CardFieldKey>>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const arr = JSON.parse(stored) as string[];
        const valid = new Set(arr.filter((k): k is CardFieldKey => CARD_FIELD_DEFS.some((d) => d.key === k)));
        return valid.size > 0 ? valid : new Set(DEFAULT_CARD_FIELDS);
      }
    } catch { /* ignore */ }
    return new Set(DEFAULT_CARD_FIELDS);
  });

  function toggle(key: CardFieldKey) {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  return { visibleFields, toggle };
}

function CardSettingsModal({
  visibleFields,
  onToggle,
  onClose,
}: {
  visibleFields: Set<CardFieldKey>;
  onToggle: (key: CardFieldKey) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Campos do card</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-1">
          {CARD_FIELD_DEFS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/60 transition">
              <input
                type="checkbox"
                checked={visibleFields.has(key)}
                onChange={() => onToggle(key)}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <span className="text-sm text-slate-200">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "warning" } | null>(null);
  function show(message: string, variant: "success" | "error" | "warning" = "success") {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 5000);
  }
  return { toast, show };
}

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString();
}

function daysUntil(value: string): number {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function getStatusSetting(settings: CrmStatusSetting[], status: CrmStatus): CrmStatusSetting {
  return settings.find((item) => item.status === status) ?? { id: "", status, followups: [], expirationDays: null };
}

function getExpirationAt(lead: CrmLead, settings: CrmStatusSetting[]): string | null {
  const setting = getStatusSetting(settings, lead.crmStatus);
  if (!lead.statusEnteredAt || !setting.expirationDays) return null;
  return addDaysIso(lead.statusEnteredAt, setting.expirationDays);
}

function buildFollowupsForStatus(status: CrmStatus, enteredAt: string, templates: CrmStatusFollowupTemplate[]): CrmLeadFollowup[] {
  return templates.map((template) => ({
    id: crypto.randomUUID(),
    status,
    title: template.title,
    triggeredAt: addDaysIso(enteredAt, template.days),
    completedAt: null,
  }));
}

// ─── Lead Card (Notion-style) ─────────────────────────────────────────────────

function LeadCard({
  lead,
  visibleFields,
  statusSettings,
  onDragStart,
  onClick,
  onEdit,
  onDelete,
  onCopyQualLink,
  onSendCadastro,
  onApprove,
}: {
  lead: CrmLead;
  visibleFields: Set<CardFieldKey>;
  statusSettings: CrmStatusSetting[];
  onDragStart: (lead: CrmLead) => void;
  onClick: (lead: CrmLead) => void;
  onEdit: (lead: CrmLead) => void;
  onDelete: (lead: CrmLead) => void;
  onCopyQualLink: (lead: CrmLead) => void;
  onSendCadastro: (lead: CrmLead) => void;
  onApprove: (lead: CrmLead) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const openFollowups = lead.followups.filter((item) => !item.completedAt && new Date(item.triggeredAt).getTime() <= Date.now()).length;
  const expirationAt = getExpirationAt(lead, statusSettings);
  const expirationDaysLeft = expirationAt ? daysUntil(expirationAt) : null;
  const expired = expirationDaysLeft != null && expirationDaysLeft < 0;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead)}
      className="group relative rounded-lg bg-[var(--panel)] px-3 py-2.5 cursor-grab active:cursor-grabbing hover:bg-slate-800/50 transition-colors"
    >
      <div className="flex items-start gap-1.5">
        {/* Ícone documento */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>

        {/* Conteúdo */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left cursor-pointer"
          onClick={() => onClick(lead)}
        >
          <p className="text-sm text-slate-100 leading-snug truncate">{lead.name}</p>
          {visibleFields.has("email") && lead.email && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{lead.email}</p>
          )}
          {visibleFields.has("phone") && lead.phone && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{lead.phone}</p>
          )}
          {/* Badges */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visibleFields.has("qualBadge") && lead.qualFilledAt && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-emerald-900/50 text-emerald-400">
                ✓ Qual.
              </span>
            )}
            {visibleFields.has("accountBadge") && lead.userId && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-sky-900/50 text-sky-400">
                Conta criada
              </span>
            )}
            {visibleFields.has("course") && lead.desiredCourse && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400 truncate max-w-[100px]">
                {lead.desiredCourse}
              </span>
            )}
            {visibleFields.has("anacCode") && lead.anacCode && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400 truncate max-w-[80px]">
                ANAC {lead.anacCode}
              </span>
            )}
            {lead.acceptedProposalId && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-emerald-900/50 text-emerald-400">
                ✓ Proposta aceita
              </span>
            )}
            {visibleFields.has("openFollowups") && openFollowups > 0 && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-amber-900/60 text-amber-300">
                {openFollowups} FUP aberto{openFollowups > 1 ? "s" : ""}
              </span>
            )}
            {lead.payInPerson && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-cyan-900/60 text-cyan-300">
                Pagara presencialmente
              </span>
            )}
            {visibleFields.has("expired") && expired && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-red-900/70 text-red-300">
                Expirado
              </span>
            )}
            {visibleFields.has("expirationDays") && expirationDaysLeft != null && !expired && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400">
                Expira em {expirationDaysLeft}d
              </span>
            )}
            {visibleFields.has("funnelEnteredAt") && lead.funnelEnteredAt && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400">
                Funil {formatDateShort(lead.funnelEnteredAt)}
              </span>
            )}
            {visibleFields.has("statusEnteredAt") && lead.statusEnteredAt && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400">
                Status {formatDateShort(lead.statusEnteredAt)}
              </span>
            )}
          </div>
        </button>

        {/* Menu ⋯ */}
        <div ref={menuRef} className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="rounded p-0.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm4.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm4.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-5 z-50 min-w-[160px] overflow-hidden rounded-lg border border-slate-700 bg-[var(--panel)] shadow-2xl py-0.5">
              {[
                { label: "Abrir detalhes", action: () => onClick(lead), cls: "text-slate-200" },
                { label: "Editar", action: () => onEdit(lead), cls: "text-slate-200" },
                { label: "Copiar link qualificação", action: () => onCopyQualLink(lead), cls: "text-slate-200" },
                { label: "Enviar link de cadastro", action: () => onSendCadastro(lead), cls: "text-sky-400" },
                ...(lead.userId ? [{ label: "Liberar acesso", action: () => onApprove(lead), cls: "text-emerald-400" }] : []),
                { label: "Excluir", action: () => onDelete(lead), cls: "text-red-400" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setMenuOpen(false); item.action(); }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 transition ${item.cls}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column (Notion-style) ─────────────────────────────────────────────

function KanbanColumn({
  status, leads, visibleFields, statusSettings, onDrop, onDragStart, onClick, onEdit, onDelete,
  onCopyQualLink, onSendCadastro, onApprove, onQuickAdd, onConfigureStatus,
}: {
  status: CrmStatus;
  leads: CrmLead[];
  visibleFields: Set<CardFieldKey>;
  statusSettings: CrmStatusSetting[];
  onDrop: (status: CrmStatus) => void;
  onDragStart: (lead: CrmLead) => void;
  onClick: (lead: CrmLead) => void;
  onEdit: (lead: CrmLead) => void;
  onDelete: (lead: CrmLead) => void;
  onCopyQualLink: (lead: CrmLead) => void;
  onSendCadastro: (lead: CrmLead) => void;
  onApprove: (lead: CrmLead) => void;
  onQuickAdd: (status: CrmStatus) => void;
  onConfigureStatus: (status: CrmStatus) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const pill = CRM_STATUS_PILL[status];
  const colBg = CRM_STATUS_COLUMN_BG[status];

  return (
    <div
      className={`flex w-[260px] shrink-0 flex-col rounded-lg transition ${dragOver ? "ring-1 ring-sky-500/50" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(status); }}
    >
      {/* Column header */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${pill.bg} ${pill.text}`}>
          {CRM_STATUS_LABELS[status]}
        </span>
        <button
          type="button"
          onClick={() => onConfigureStatus(status)}
          title="Configurar follow-ups e expiracao"
          className="rounded p-0.5 text-slate-600 hover:bg-slate-800 hover:text-slate-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-xs text-slate-600 font-medium">{leads.length}</span>
      </div>

      {/* Cards */}
      <div
        className={`flex flex-col gap-1 overflow-y-auto rounded-lg p-1.5 ${colBg}`}
        style={{ minHeight: 60, maxHeight: "calc(100vh - 200px)" }}
      >
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            visibleFields={visibleFields}
            statusSettings={statusSettings}
            onDragStart={onDragStart}
            onClick={onClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onCopyQualLink={onCopyQualLink}
            onSendCadastro={onSendCadastro}
            onApprove={onApprove}
          />
        ))}

        {/* Add button at bottom of column */}
        <button
          type="button"
          onClick={() => onQuickAdd(status)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-[var(--panel)] hover:text-slate-400 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
          </svg>
          Novo lead
        </button>
      </div>
    </div>
  );
}

// ─── Modal Criar/Editar ───────────────────────────────────────────────────────

function StatusSettingsModal({
  status,
  setting,
  saving,
  onClose,
  onSave,
}: {
  status: CrmStatus;
  setting: CrmStatusSetting;
  saving: boolean;
  onClose: () => void;
  onSave: (setting: Pick<CrmStatusSetting, "status" | "followups" | "expirationDays">) => void;
}) {
  const [expirationDays, setExpirationDays] = useState(setting.expirationDays?.toString() ?? "");
  const [followups, setFollowups] = useState<CrmStatusFollowupTemplate[]>(setting.followups);
  const inputCls = "w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

  function updateFollowup(id: string, patch: Partial<CrmStatusFollowupTemplate>) {
    setFollowups((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addFollowup() {
    setFollowups((prev) => [...prev, { id: crypto.randomUUID(), title: "", days: 1 }]);
  }

  function submit() {
    const cleaned = followups
      .map((item) => ({ ...item, title: item.title.trim(), days: Math.max(0, Math.round(Number(item.days) || 0)) }))
      .filter((item) => item.title);
    const exp = expirationDays.trim() ? Math.max(0, Math.round(Number(expirationDays) || 0)) : null;
    onSave({ status, followups: cleaned, expirationDays: exp && exp > 0 ? exp : null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Configurar status</h2>
            <p className="mt-1 text-xs text-slate-500">{CRM_STATUS_LABELS[status]}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="space-y-5 p-5">
          <label className="block text-xs text-slate-500">
            Expiracao em dias
            <input inputMode="numeric" value={expirationDays} onChange={(e) => setExpirationDays(e.target.value)} placeholder="Sem expiracao" className={`${inputCls} mt-1`} />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Follow-ups</p>
              <button type="button" onClick={addFollowup} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">Adicionar FUP</button>
            </div>
            {followups.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Nenhum follow-up configurado.</p>
            ) : (
              <div className="space-y-2">
                {followups.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_90px_auto] gap-2 rounded-lg border border-slate-800 bg-[var(--bg)] p-2">
                    <input value={item.title} onChange={(e) => updateFollowup(item.id, { title: e.target.value })} placeholder="Titulo do FUP" className={inputCls} />
                    <input inputMode="numeric" value={String(item.days)} onChange={(e) => updateFollowup(item.id, { days: Number(e.target.value) })} className={inputCls} />
                    <button type="button" onClick={() => setFollowups((prev) => prev.filter((fup) => fup.id !== item.id))} className="rounded-lg border border-red-900/50 px-2 text-xs text-red-300 hover:bg-red-950/30">Remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancelar</button>
          <button type="button" disabled={saving} onClick={submit} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

function LeadModal({
  lead, initialStatus, onClose, onSaved,
}: {
  lead: CrmLead | null;
  initialStatus: CrmStatus;
  onClose: () => void;
  onSaved: (lead: CrmLead) => void;
}) {
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [status, setStatus] = useState<CrmStatus>(lead?.crmStatus ?? initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

  async function handleSave() {
    if (!name.trim() || !email.trim()) { setError("Nome e e-mail são obrigatórios."); return; }
    setSaving(true);
    setError(null);
    if (lead) {
      const { error: err } = await updateLead(lead.id, { name, email, phone, crmStatus: status });
      if (err) { setError(err.message); setSaving(false); return; }
      onSaved({ ...lead, name, email, phone, crmStatus: status });
    } else {
      const { data, error: err } = await createLead({ name, email, phone, crmStatus: status });
      if (err || !data) { setError(err?.message ?? "Erro ao criar."); setSaving(false); return; }
      void notifyCrmLeadEvent("crm.lead_registered", { leadId: data.id, name: data.name, email: data.email });
      onSaved(data);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">{lead ? "Editar lead" : "Novo lead"}</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Nome *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Nome completo" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">E-mail *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Telefone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estágio</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as CrmStatus)} className={inputCls}>
              {CRM_STATUSES.map((s) => (
                <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          {error && <p className="rounded-lg bg-red-900/20 px-3 py-2 text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Link de Cadastro ───────────────────────────────────────────────────

function CadastroLinkModal({
  lead, onClose, onGenerated,
}: {
  lead: CrmLead;
  onClose: () => void;
  onGenerated: (token: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(lead.qualToken ?? null);
  const [copied, setCopied] = useState(false);
  const cadastroUrl = token ? `${window.location.origin}/cadastro?token=${token}` : null;

  async function handleGenerate() {
    setGenerating(true);
    const { token: t, error } = await generateCadastroToken(lead.id);
    setGenerating(false);
    if (!error && t) { setToken(t); onGenerated(t); }
  }

  function copyLink() {
    if (!cadastroUrl) return;
    void navigator.clipboard.writeText(cadastroUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  const inputCls = "flex-1 rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-xs text-slate-300 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Link de cadastro</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400">
            Link personalizado para <span className="text-slate-200 font-medium">{lead.name}</span> criar conta na plataforma.
          </p>
          {lead.userId && lead.qualFilledAt && (
            <div className="rounded-lg bg-emerald-900/20 px-3 py-2 text-xs text-emerald-400">
              ✓ Cadastro já realizado em {new Date(lead.qualFilledAt).toLocaleDateString("pt-BR")}
            </div>
          )}
          {cadastroUrl ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input readOnly value={cadastroUrl} className={inputCls} />
                <button type="button" onClick={copyLink}
                  className={`rounded-lg border px-3 py-2 text-xs transition ${copied ? "border-emerald-600 bg-emerald-600/20 text-emerald-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <button type="button" onClick={() => void handleGenerate()} disabled={generating}
                className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2">
                Gerar novo link
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void handleGenerate()} disabled={generating}
              className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition">
              {generating ? "Gerando..." : "Gerar link de cadastro"}
            </button>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Detalhes do Lead ───────────────────────────────────────────────────

function LeadDetailModal({
  lead, onClose, onEdit, onSendCadastro, onCopyQualLink, onApprove,
}: {
  lead: CrmLead;
  onClose: () => void;
  onEdit: (lead: CrmLead) => void;
  onSendCadastro: (lead: CrmLead) => void;
  onCopyQualLink: (lead: CrmLead) => void;
  onApprove: (lead: CrmLead) => void;
}) {
  const [showProposalModal, setShowProposalModal] = useState(false);
  const pill = CRM_STATUS_PILL[lead.crmStatus];

  function row(label: string, value: string | null | undefined) {
    if (!value) return null;
    return (
      <div className="flex gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
        <span className="w-36 shrink-0 text-xs text-slate-500">{label}</span>
        <span className="text-xs text-slate-200 break-all">{value}</span>
      </div>
    );
  }

  const availDays = lead.availableDays?.length
    ? lead.availableDays.map((d) => AVAILABLE_DAY_LABELS[d]).join(", ")
    : null;
  const periodLabel = lead.availablePeriod === "manha" ? "Manhã" : lead.availablePeriod === "tarde" ? "Tarde" : lead.availablePeriod === "ambos" ? "Manhã e tarde" : null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl max-h-[88vh]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{lead.name}</h2>
            <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${pill.bg} ${pill.text}`}>
              {CRM_STATUS_LABELS[lead.crmStatus]}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Contato</p>
            {row("E-mail", lead.email)}
            {row("Telefone", lead.phone)}
          </div>

          {(lead.desiredCourse || lead.desiredHours || lead.weeklyHours || lead.startDate || availDays || lead.transferSchool) && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Qualificação</p>
              {row("Curso desejado", lead.desiredCourse)}
              {row("Horas desejadas", lead.desiredHours != null ? `${lead.desiredHours} h` : null)}
              {row("Horas por semana", lead.weeklyHours != null ? `${lead.weeklyHours} h/sem` : null)}
              {row("Início desejado", lead.startDate)}
              {row("Dias disponíveis", availDays)}
              {row("Período", periodLabel)}
              {lead.transferSchool && row("Transferência", `Sim — ${lead.transferSchool}`)}
            </div>
          )}

          {(lead.weightKg || lead.heightCm) && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Dados físicos</p>
              {row("Peso", lead.weightKg != null ? `${lead.weightKg} kg` : null)}
              {row("Altura", lead.heightCm != null ? `${lead.heightCm} cm` : null)}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p>
            <div className="flex gap-3 py-1.5 border-b border-slate-800/60">
              <span className="w-36 shrink-0 text-xs text-slate-500">Form qualificação</span>
              <span className={`text-xs font-medium ${lead.qualFilledAt ? "text-emerald-400" : "text-slate-600"}`}>
                {lead.qualFilledAt ? `Preenchido ${new Date(lead.qualFilledAt).toLocaleDateString("pt-BR")}` : "Pendente"}
              </span>
            </div>
            <div className="flex gap-3 py-1.5">
              <span className="w-36 shrink-0 text-xs text-slate-500">Conta na plataforma</span>
              <span className={`text-xs font-medium ${lead.userId ? "text-emerald-400" : "text-slate-600"}`}>
                {lead.userId ? "Criada" : "Não criada"}
              </span>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={() => { onEdit(lead); onClose(); }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition">
            Editar
          </button>
          <button type="button" onClick={() => { onCopyQualLink(lead); onClose(); }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition">
            Link qual.
          </button>
          <button type="button" onClick={() => { onSendCadastro(lead); onClose(); }}
            className="rounded-lg border border-sky-700/50 bg-sky-600/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-600/20 transition">
            Link cadastro
          </button>
          <button type="button" onClick={() => setShowProposalModal(true)}
            className="rounded-lg border border-violet-700/50 bg-violet-600/10 px-3 py-1.5 text-xs text-violet-400 hover:bg-violet-600/20 transition">
            Gerar proposta
          </button>
          {lead.userId && (
            <button type="button" onClick={() => { onApprove(lead); onClose(); }}
              className="rounded-lg border border-emerald-700/50 bg-emerald-600/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-600/20 transition">
              Liberar acesso
            </button>
          )}
        </div>
      </div>
    </div>

    {showProposalModal && (
      <ProposalGeneratorModal
        lead={lead}
        onClose={() => setShowProposalModal(false)}
      />
    )}
    </>
  );
}

// ─── CrmTab ───────────────────────────────────────────────────────────────────

void LeadDetailModal;

const CRM_DOCUMENT_TYPES: Array<{ type: ProfileDocumentType; label: string; required?: boolean }> = [
  { type: "identification", label: "Identificação" },
  { type: "voterTitle", label: "Título de eleitor" },
  { type: "proofOfResidence", label: "Comprovante de residência" },
  { type: "militaryCertificate", label: "Certificado militar" },
  { type: "schoolCertificate", label: "Comprovante de escolaridade", required: true },
  { type: "enrollmentForm", label: "Ficha de matrícula" },
];

const CRM_TRANSFER_DOCUMENT_TYPES: Array<{ type: ProfileDocumentType; label: string }> = [
  { type: "transferDocument", label: "Documentos de transferência" },
];

const drawerFieldCls = "mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

const QUAL_COURSES = [
  { value: "Piloto Privado",   label: "Piloto Privado" },
  { value: "Piloto Comercial", label: "Piloto Comercial" },
  { value: "INVA",             label: "INVA" },
  { value: "Recheque",         label: "Recheque" },
  { value: "Aperfeiçoamento",  label: "Aperfeiçoamento" },
];

const QUAL_START_OPTIONS = [
  { value: "imediato", label: "Imediatamente" },
  { value: "30_dias",  label: "Nos próximos 30 dias" },
  { value: "60_dias",  label: "Em até 60 dias" },
  { value: "mais_60",  label: "Mais de 60 dias" },
];

const QUAL_WEEKLY_HOURS = [1, 2, 4, 6, 8];

const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const ESCOLARIDADE_OPTIONS = [
  "Ensino Fundamental",
  "Ensino Médio",
  "Ensino Superior",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
];

type ProfileEnrollmentForm = {
  fullName: string;
  email: string;
  phone: string;
  cpf: string;
  rg: string;
  rgOrgaoExpedidor: string;
  rgDataEmissao: string;
  birthDate: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
  nacionalidade: string;
  estadoCivil: string;
  sexo: string;
  naturalidade: string;
  filiacaoPai: string;
  filiacaoMae: string;
  escolaridade: string;
  escolaridadePeriodo: string;
  escolaridadeCurso: string;
  alergiasMedicamentos: string;
  emergenciaNome: string;
  emergenciaParentesco: string;
  emergenciaEndereco: string;
  emergenciaTelefone: string;
  anacCode: string;
  weightKg: string;
  heightCm: string;
};

function emptyProfileEnrollmentForm(): ProfileEnrollmentForm {
  return {
    fullName: "",
    email: "",
    phone: "",
    cpf: "",
    rg: "",
    rgOrgaoExpedidor: "",
    rgDataEmissao: "",
    birthDate: "",
    endereco: "",
    cep: "",
    cidade: "",
    uf: "",
    nacionalidade: "",
    estadoCivil: "",
    sexo: "",
    naturalidade: "",
    filiacaoPai: "",
    filiacaoMae: "",
    escolaridade: "",
    escolaridadePeriodo: "",
    escolaridadeCurso: "",
    alergiasMedicamentos: "",
    emergenciaNome: "",
    emergenciaParentesco: "",
    emergenciaEndereco: "",
    emergenciaTelefone: "",
    anacCode: "",
    weightKg: "",
    heightCm: "",
  };
}

function profileToEnrollmentForm(data: PilotProfile): ProfileEnrollmentForm {
  return {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    cpf: data.cpf,
    rg: data.rg,
    rgOrgaoExpedidor: data.rgOrgaoExpedidor,
    rgDataEmissao: data.rgDataEmissao,
    birthDate: data.birthDate,
    endereco: data.endereco,
    cep: data.cep,
    cidade: data.cidade,
    uf: data.uf,
    nacionalidade: data.nacionalidade,
    estadoCivil: data.estadoCivil,
    sexo: data.sexo,
    naturalidade: data.naturalidade,
    filiacaoPai: data.filiacaoPai,
    filiacaoMae: data.filiacaoMae,
    escolaridade: data.escolaridade,
    escolaridadePeriodo: data.escolaridadePeriodo,
    escolaridadeCurso: data.escolaridadeCurso,
    alergiasMedicamentos: data.alergiasMedicamentos,
    emergenciaNome: data.emergenciaNome,
    emergenciaParentesco: data.emergenciaParentesco,
    emergenciaEndereco: data.emergenciaEndereco,
    emergenciaTelefone: data.emergenciaTelefone,
    anacCode: data.anacCode,
    weightKg: data.weightKg?.toString() ?? "",
    heightCm: data.heightCm?.toString() ?? "",
  };
}

function enrollmentFormToProfileUpdates(form: ProfileEnrollmentForm) {
  return {
    full_name: form.fullName,
    email: form.email,
    phone: form.phone,
    cpf: form.cpf,
    rg: form.rg,
    rg_orgao_expedidor: form.rgOrgaoExpedidor,
    rg_data_emissao: form.rgDataEmissao,
    birth_date: form.birthDate,
    endereco: form.endereco,
    cep: form.cep,
    cidade: form.cidade,
    uf: form.uf,
    nacionalidade: form.nacionalidade,
    estado_civil: form.estadoCivil,
    sexo: form.sexo,
    naturalidade: form.naturalidade,
    filiacao_pai: form.filiacaoPai,
    filiacao_mae: form.filiacaoMae,
    escolaridade: form.escolaridade,
    escolaridade_periodo: form.escolaridadePeriodo,
    escolaridade_curso: form.escolaridadeCurso,
    alergias_medicamentos: form.alergiasMedicamentos,
    emergencia_nome: form.emergenciaNome,
    emergencia_parentesco: form.emergenciaParentesco,
    emergencia_endereco: form.emergenciaEndereco,
    emergencia_telefone: form.emergenciaTelefone,
    anac_code: form.anacCode,
    weight_kg: numOrNull(form.weightKg) ?? undefined,
    height_cm: numOrNull(form.heightCm) ?? undefined,
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}

function LeadDetailDrawer({
  lead,
  currentUserName,
  onClose,
  onLeadPatched,
  onSendCadastro,
  onCopyQualLink,
  onApprove,
  onStatusChangeRequest,
  showToast,
}: {
  lead: CrmLead;
  currentUserName: string;
  onClose: () => void;
  onLeadPatched: (lead: CrmLead) => void;
  onSendCadastro: (lead: CrmLead) => void;
  onCopyQualLink: (lead: CrmLead) => void;
  onApprove: (lead: CrmLead) => void;
  onStatusChangeRequest: (lead: CrmLead, status: CrmStatus) => Promise<CrmLead | null>;
  showToast: (message: string, variant?: "success" | "error") => void;
}) {
  const fileInputs = useRef<Partial<Record<ProfileDocumentType, HTMLInputElement | null>>>({});
  const leadReady = useRef(false);
  const profileReady = useRef(false);
  const [leadForm, setLeadForm] = useState(() => ({
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    crmStatus: lead.crmStatus,
    desiredCourse: lead.desiredCourse ?? "",
    desiredHours: lead.desiredHours?.toString() ?? "",
    weeklyHours: lead.weeklyHours?.toString() ?? "",
    startDate: lead.startDate ?? "",
    availableDays: lead.availableDays,
    availablePeriod: lead.availablePeriod ?? "",
    weightKg: lead.weightKg?.toString() ?? "",
    heightCm: lead.heightCm?.toString() ?? "",
    anacCode: lead.anacCode ?? "",
    birthDate: lead.birthDate ?? "",
    cpf: lead.cpf ?? "",
    theoreticalExamDone: lead.theoreticalExamDone == null ? "" : lead.theoreticalExamDone ? "true" : "false",
    transferSchool: lead.transferSchool ?? "",
    notes: lead.notes ?? "",
  }));
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileEnrollmentForm>(emptyProfileEnrollmentForm);
  const [profileLoading, setProfileLoading] = useState(false);
  const [leadSaveState, setLeadSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileSaveState, setProfileSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busyDocument, setBusyDocument] = useState<ProfileDocumentType | null>(null);
  const [open, setOpen] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [sagaUserId, setSagaUserId] = useState("");
  const [sagaAnacJson, setSagaAnacJson] = useState(lead.sagaAnacJson);
  const [sagaAnacLoading, setSagaAnacLoading] = useState(false);
  const [sagaDeleteOpen, setSagaDeleteOpen] = useState(false);
  const [sagaDeleteLoading, setSagaDeleteLoading] = useState(false);

  // Propostas
  const [proposals, setProposals] = useState<CrmProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);

  // Comentários
  const [comments, setComments] = useState<CrmLeadComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function close() {
    setOpen(false);
    setTimeout(onClose, 280);
  }

  useEffect(() => {
    leadReady.current = false;
    setLeadForm({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      crmStatus: lead.crmStatus,
      desiredCourse: lead.desiredCourse ?? "",
      desiredHours: lead.desiredHours?.toString() ?? "",
      weeklyHours: lead.weeklyHours?.toString() ?? "",
      startDate: lead.startDate ?? "",
      availableDays: lead.availableDays,
      availablePeriod: lead.availablePeriod ?? "",
      weightKg: lead.weightKg?.toString() ?? "",
      heightCm: lead.heightCm?.toString() ?? "",
      anacCode: lead.anacCode ?? "",
      birthDate: lead.birthDate ?? "",
      cpf: lead.cpf ?? "",
      theoreticalExamDone: lead.theoreticalExamDone == null ? "" : lead.theoreticalExamDone ? "true" : "false",
      transferSchool: lead.transferSchool ?? "",
      notes: lead.notes ?? "",
    });
    window.setTimeout(() => { leadReady.current = true; }, 0);
  }, [lead.id]);

  useEffect(() => {
    profileReady.current = false;
    setProfile(null);
    if (!lead.userId) return;
    setProfileLoading(true);
    void getProfile(lead.userId).then(({ data, error }) => {
      if (error) showToast(error.message || "Erro ao carregar perfil.", "error");
      if (data) {
        setProfile(data);
        setProfileForm(profileToEnrollmentForm(data));
      }
      setProfileLoading(false);
      window.setTimeout(() => { profileReady.current = true; }, 0);
    });
  }, [lead.userId]);

  useEffect(() => {
    setSagaAnacJson(lead.sagaAnacJson);
  }, [lead.id, lead.sagaAnacJson]);

  useEffect(() => {
    setProposalsLoading(true);
    void getProposalsByLead(lead.id).then((data) => {
      setProposals(data);
      setProposalsLoading(false);
    });
  }, [lead.id]);

  useEffect(() => {
    setCommentsLoading(true);
    void listLeadComments(lead.id).then(({ data }) => {
      setComments(data);
      setCommentsLoading(false);
    });
  }, [lead.id]);

  useEffect(() => {
    if (!lead.userId) {
      setSagaUserId("");
      return;
    }
    void getAdminUserDetail(lead.userId)
      .then((detail) => setSagaUserId(detail.profile.sagaUserId || ""))
      .catch(() => setSagaUserId(""));
  }, [lead.userId]);

  async function handleLookupSagaAnac() {
    setSagaAnacLoading(true);
    const result = await lookupSagaAnacPersonAdmin({
      leadId: lead.id,
      userId: lead.userId,
      anacCode: leadForm.anacCode || profileForm.anacCode,
      birthDate: leadForm.birthDate || profileForm.birthDate,
      cpf: leadForm.cpf || profileForm.cpf,
    });
    setSagaAnacLoading(false);
    if (!result.ok || !result.data) {
      showToast(result.message, "error");
      return;
    }
    const json = JSON.stringify(result.data);
    setSagaAnacJson(json);
    onLeadPatched({ ...lead, sagaAnacJson: json });
    showToast("Dados ANAC obtidos no SAGA.", "success");
  }

  async function handleDeleteSagaUser() {
    if (!sagaUserId) return;
    setSagaDeleteLoading(true);
    const result = await deleteSagaUser({ sagaUserId, userId: lead.userId });
    setSagaDeleteLoading(false);
    setSagaDeleteOpen(false);
    if (!result.ok) {
      showToast(result.message, "error");
      return;
    }
    setSagaUserId("");
    showToast(result.message, "success");
  }

  const sagaAnac = parseSagaAnacPerson(sagaAnacJson);

  useEffect(() => {
    if (!leadReady.current) return;
    const timer = window.setTimeout(() => {
      const nextLead: CrmLead = {
        ...lead,
        name: leadForm.name,
        email: leadForm.email,
        phone: leadForm.phone,
        crmStatus: leadForm.crmStatus as CrmStatus,
        desiredCourse: textOrNull(leadForm.desiredCourse),
        desiredHours: numOrNull(leadForm.desiredHours),
        weeklyHours: numOrNull(leadForm.weeklyHours),
        startDate: textOrNull(leadForm.startDate),
        availableDays: leadForm.availableDays,
        availablePeriod: textOrNull(leadForm.availablePeriod) as AvailablePeriod | null,
        weightKg: numOrNull(leadForm.weightKg),
        heightCm: numOrNull(leadForm.heightCm),
        anacCode: textOrNull(leadForm.anacCode),
        birthDate: textOrNull(leadForm.birthDate),
        cpf: textOrNull(leadForm.cpf),
        theoreticalExamDone: leadForm.theoreticalExamDone === "" ? null : leadForm.theoreticalExamDone === "true",
        transferSchool: textOrNull(leadForm.transferSchool),
        notes: textOrNull(leadForm.notes),
      };
      setLeadSaveState("saving");
      onLeadPatched(nextLead);
      void updateLead(lead.id, {
        name: nextLead.name,
        email: nextLead.email,
        phone: nextLead.phone,
        crmStatus: nextLead.crmStatus,
        desiredCourse: nextLead.desiredCourse,
        desiredHours: nextLead.desiredHours,
        weeklyHours: nextLead.weeklyHours,
        startDate: nextLead.startDate,
        availableDays: nextLead.availableDays,
        availablePeriod: nextLead.availablePeriod,
        weightKg: nextLead.weightKg,
        heightCm: nextLead.heightCm,
        anacCode: nextLead.anacCode,
        birthDate: nextLead.birthDate,
        cpf: nextLead.cpf,
        theoreticalExamDone: nextLead.theoreticalExamDone,
        transferSchool: nextLead.transferSchool,
        notes: nextLead.notes,
      }).then(({ error }) => setLeadSaveState(error ? "error" : "saved"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [lead.id, leadForm]);

  useEffect(() => {
    if (!profileReady.current || !lead.userId || !profile) return;
    const timer = window.setTimeout(() => {
      setProfileSaveState("saving");
      void updateProfileFields(lead.userId!, enrollmentFormToProfileUpdates(profileForm)).then(({ data, error }) => {
        if (data) setProfile(data);
        setProfileSaveState(error ? "error" : "saved");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [lead.userId, profileForm]);

  function setLeadField<K extends keyof typeof leadForm>(key: K, value: (typeof leadForm)[K]) {
    if (key === "crmStatus") {
      const nextStatus = value as CrmStatus;
      if (nextStatus === lead.crmStatus) return;
      void onStatusChangeRequest(lead, nextStatus).then((nextLead) => {
        if (nextLead) {
          setLeadForm((prev) => ({ ...prev, crmStatus: nextLead.crmStatus }));
        } else {
          setLeadForm((prev) => ({ ...prev, crmStatus: lead.crmStatus }));
        }
      });
      return;
    }
    setLeadForm((prev) => ({ ...prev, [key]: value }));
  }

  function setProfileField<K extends keyof typeof profileForm>(key: K, value: (typeof profileForm)[K]) {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUpload(type: ProfileDocumentType, file: File | undefined) {
    if (!file || !profile) return;
    setBusyDocument(type);
    const result = await uploadProfileDocumentAttachment(profile, type, file);
    setBusyDocument(null);
    if (result.error || !result.data) {
      showToast(result.error?.message ?? "Erro ao subir documento.", "error");
      return;
    }
    setProfile({ ...profile, documents: result.data });
    showToast("Documento atualizado.");
    const input = fileInputs.current[type];
    if (input) input.value = "";
  }

  async function handlePostComment() {
    if (!commentText.trim()) return;
    setCommentSaving(true);
    const { data, error } = await createLeadComment({
      leadId: lead.id,
      authorName: currentUserName,
      text: commentText.trim(),
    });
    setCommentSaving(false);
    if (error || !data) {
      showToast("Erro ao salvar comentário.", "error");
      return;
    }
    setComments((prev) => [...prev, data]);
    setCommentText("");
  }

  async function handleDeleteComment(commentId: string) {
    const { error } = await deleteLeadComment(commentId);
    if (error) { showToast("Erro ao excluir comentário.", "error"); return; }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  async function handleToggleFollowup(followupId: string) {
    const nextFollowups = lead.followups.map((item) =>
      item.id === followupId ? { ...item, completedAt: item.completedAt ? null : new Date().toISOString() } : item,
    );
    const nextLead = { ...lead, followups: nextFollowups };
    onLeadPatched(nextLead);
    const { error } = await updateLead(lead.id, { followups: nextFollowups });
    if (error) showToast("Erro ao atualizar follow-up.", "error");
  }

  async function handleTogglePayInPerson(checked: boolean) {
    const nextLead = { ...lead, payInPerson: checked };
    onLeadPatched(nextLead);
    const { error } = await updateLead(lead.id, { payInPerson: checked });
    if (error) showToast("Erro ao atualizar pagamento presencial.", "error");
  }

  const pill = CRM_STATUS_PILL[leadForm.crmStatus as CrmStatus];
  const saving = leadSaveState === "saving" || profileSaveState === "saving";
  const errored = leadSaveState === "error" || profileSaveState === "error";
  const saved = leadSaveState === "saved" || profileSaveState === "saved";
  const saveText = saving ? "Salvando..." : errored ? "Erro ao salvar" : saved ? "Salvo" : "Autosave";

  return (
    <>
    <div
      className={`fixed inset-0 z-50 flex justify-end backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"} bg-black/60`}
      onMouseDown={close}
    >
      <aside
        className={`flex h-full w-1/2 max-w-[50vw] flex-col border-l border-slate-700 bg-[var(--panel)] shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-100">{leadForm.name || "Lead sem nome"}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pill.bg} ${pill.text}`}>{CRM_STATUS_LABELS[leadForm.crmStatus as CrmStatus]}</span>
              <span className={`text-[11px] ${errored ? "text-red-400" : "text-slate-500"}`}>{saveText}</span>
            </div>
          </div>
          <button type="button" onClick={close} className="mt-0.5 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <DrawerField label="Nome"><input value={leadForm.name} onChange={(e) => setLeadField("name", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="E-mail"><input type="email" value={leadForm.email} onChange={(e) => setLeadField("email", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Telefone"><input value={leadForm.phone} onChange={(e) => setLeadField("phone", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Etapa"><select value={leadForm.crmStatus} onChange={(e) => setLeadField("crmStatus", e.target.value as CrmStatus)} className={drawerFieldCls}>{CRM_STATUSES.map((status) => <option key={status} value={status}>{CRM_STATUS_LABELS[status]}</option>)}</select></DrawerField>
              <DrawerField label="Curso desejado">
                <select value={leadForm.desiredCourse} onChange={(e) => setLeadField("desiredCourse", e.target.value)} className={drawerFieldCls}>
                  <option value="">— Selecione —</option>
                  {QUAL_COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </DrawerField>
              <DrawerField label="Início desejado">
                <select value={leadForm.startDate} onChange={(e) => setLeadField("startDate", e.target.value)} className={drawerFieldCls}>
                  <option value="">— Selecione —</option>
                  {QUAL_START_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DrawerField>
              <DrawerField label="Horas desejadas"><input inputMode="numeric" value={leadForm.desiredHours} onChange={(e) => setLeadField("desiredHours", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Horas por semana">
                <select value={leadForm.weeklyHours} onChange={(e) => setLeadField("weeklyHours", e.target.value)} className={drawerFieldCls}>
                  <option value="">— Selecione —</option>
                  {QUAL_WEEKLY_HOURS.map((h) => <option key={h} value={String(h)}>{h === 8 ? "8+ h/sem" : `${h} h/sem`}</option>)}
                </select>
              </DrawerField>
              <DrawerField label="Período">
                <select value={leadForm.availablePeriod} onChange={(e) => setLeadField("availablePeriod", e.target.value)} className={drawerFieldCls}>
                  <option value="">Não informado</option>
                  <option value="manha">☀️ Manhã</option>
                  <option value="tarde">🌆 Tarde</option>
                  <option value="ambos">✨ Manhã e tarde</option>
                </select>
              </DrawerField>
              <DrawerField label="Banca teórica">
                <select value={leadForm.theoreticalExamDone} onChange={(e) => setLeadField("theoreticalExamDone", e.target.value)} className={drawerFieldCls}>
                  <option value="">Não informado</option>
                  <option value="true">Sim, já fiz</option>
                  <option value="false">Não, ainda não</option>
                </select>
              </DrawerField>
              <DrawerField label="Peso (kg)"><input inputMode="decimal" value={leadForm.weightKg} onChange={(e) => setLeadField("weightKg", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Altura (cm)"><input inputMode="decimal" value={leadForm.heightCm} onChange={(e) => setLeadField("heightCm", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Codigo ANAC"><input value={leadForm.anacCode} onChange={(e) => setLeadField("anacCode", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="CPF"><input value={leadForm.cpf} onChange={(e) => setLeadField("cpf", e.target.value)} className={drawerFieldCls} placeholder="000.000.000-00" /></DrawerField>
              <DrawerField label="Nascimento"><input type="date" value={leadForm.birthDate} onChange={(e) => setLeadField("birthDate", e.target.value)} className={drawerFieldCls} /></DrawerField>
              <DrawerField label="Escola de transferência"><input value={leadForm.transferSchool} onChange={(e) => setLeadField("transferSchool", e.target.value)} className={drawerFieldCls} placeholder="Escola de origem (deixe vazio se não for transferência)" /></DrawerField>
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-500">Dias disponiveis</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(AVAILABLE_DAY_LABELS) as AvailableDay[]).map((day) => (
                  <label key={day} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">
                    <input type="checkbox" checked={leadForm.availableDays.includes(day)} onChange={(e) => setLeadField("availableDays", e.target.checked ? [...leadForm.availableDays, day] : leadForm.availableDays.filter((item) => item !== day))} />
                    {AVAILABLE_DAY_LABELS[day]}
                  </label>
                ))}
              </div>
            </div>
            <DrawerField label="Observacoes"><textarea value={leadForm.notes} onChange={(e) => setLeadField("notes", e.target.value)} className={`${drawerFieldCls} min-h-24 resize-y`} /></DrawerField>
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Perfil</p>
              <span className={`text-[11px] ${lead.userId ? "text-emerald-400" : "text-slate-600"}`}>{lead.userId ? "Conta vinculada" : "Sem conta vinculada"}</span>
            </div>
            {!lead.userId ? (
              <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">O lead ainda nao tem conta criada. Envie o link de cadastro para liberar perfil e documentos.</p>
            ) : profileLoading ? (
              <p className="text-xs text-slate-500">Carregando perfil...</p>
            ) : profile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <DrawerField label="Nome completo"><input value={profileForm.fullName} onChange={(e) => setProfileField("fullName", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="E-mail"><input type="email" value={profileForm.email} onChange={(e) => setProfileField("email", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Telefone"><input value={profileForm.phone} onChange={(e) => setProfileField("phone", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="CPF"><input value={profileForm.cpf} onChange={(e) => setProfileField("cpf", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="RG"><input value={profileForm.rg} onChange={(e) => setProfileField("rg", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Orgao expedidor"><input value={profileForm.rgOrgaoExpedidor} onChange={(e) => setProfileField("rgOrgaoExpedidor", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Data emissao RG"><input type="date" value={profileForm.rgDataEmissao} onChange={(e) => setProfileField("rgDataEmissao", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Nascimento"><input type="date" value={profileForm.birthDate} onChange={(e) => setProfileField("birthDate", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Sexo"><select value={profileForm.sexo} onChange={(e) => setProfileField("sexo", e.target.value)} className={drawerFieldCls}><option value="">—</option><option value="M">M</option><option value="F">F</option></select></DrawerField>
                  <DrawerField label="Naturalidade"><input value={profileForm.naturalidade} onChange={(e) => setProfileField("naturalidade", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Nacionalidade"><input value={profileForm.nacionalidade} onChange={(e) => setProfileField("nacionalidade", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Estado civil"><input value={profileForm.estadoCivil} onChange={(e) => setProfileField("estadoCivil", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  {/* Código ANAC, Peso e Altura são editados na seção Lead acima */}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Endereco</p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="lg:col-span-2"><DrawerField label="Logradouro"><input value={profileForm.endereco} onChange={(e) => setProfileField("endereco", e.target.value)} className={drawerFieldCls} /></DrawerField></div>
                  <DrawerField label="CEP"><input value={profileForm.cep} onChange={(e) => setProfileField("cep", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="UF"><select value={profileForm.uf} onChange={(e) => setProfileField("uf", e.target.value)} className={drawerFieldCls}><option value="">—</option>{BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></DrawerField>
                  <div className="lg:col-span-2"><DrawerField label="Cidade"><input value={profileForm.cidade} onChange={(e) => setProfileField("cidade", e.target.value)} className={drawerFieldCls} /></DrawerField></div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ficha de matricula</p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <DrawerField label="Filiacao (pai)"><input value={profileForm.filiacaoPai} onChange={(e) => setProfileField("filiacaoPai", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Filiacao (mae)"><input value={profileForm.filiacaoMae} onChange={(e) => setProfileField("filiacaoMae", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Escolaridade"><select value={profileForm.escolaridade} onChange={(e) => setProfileField("escolaridade", e.target.value)} className={drawerFieldCls}><option value="">—</option>{ESCOLARIDADE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></DrawerField>
                  <DrawerField label="Serie/periodo"><input value={profileForm.escolaridadePeriodo} onChange={(e) => setProfileField("escolaridadePeriodo", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <div className="lg:col-span-2"><DrawerField label="Curso (formacao)"><input value={profileForm.escolaridadeCurso} onChange={(e) => setProfileField("escolaridadeCurso", e.target.value)} className={drawerFieldCls} /></DrawerField></div>
                  <div className="lg:col-span-2"><DrawerField label="Alergias a medicamentos"><textarea value={profileForm.alergiasMedicamentos} onChange={(e) => setProfileField("alergiasMedicamentos", e.target.value)} className={`${drawerFieldCls} min-h-16 resize-y`} /></DrawerField></div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Emergencia</p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <DrawerField label="Nome"><input value={profileForm.emergenciaNome} onChange={(e) => setProfileField("emergenciaNome", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <DrawerField label="Parentesco"><input value={profileForm.emergenciaParentesco} onChange={(e) => setProfileField("emergenciaParentesco", e.target.value)} className={drawerFieldCls} /></DrawerField>
                  <div className="lg:col-span-2"><DrawerField label="Endereco"><input value={profileForm.emergenciaEndereco} onChange={(e) => setProfileField("emergenciaEndereco", e.target.value)} className={drawerFieldCls} /></DrawerField></div>
                  <DrawerField label="Telefone"><input value={profileForm.emergenciaTelefone} onChange={(e) => setProfileField("emergenciaTelefone", e.target.value)} className={drawerFieldCls} /></DrawerField>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300">Perfil nao encontrado para esta conta.</p>
            )}
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">SAGA / ANAC</p>
              <button
                type="button"
                disabled={sagaAnacLoading}
                onClick={() => void handleLookupSagaAnac()}
                className="rounded-lg border border-sky-700/50 bg-sky-600/10 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-600/20 disabled:opacity-50"
              >
                {sagaAnacLoading ? "Consultando..." : "Consultar ANAC no SAGA"}
              </button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs">
              {sagaAnac ? (
                <div className="space-y-3 text-slate-300">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payload enviado ao SAGA na matrícula</p>
                  <dl className="space-y-1.5">
                    {buildSagaAnacPostFields(sagaAnac).map((field) => (
                      <div key={field.key}>
                        <dt className="font-mono text-[10px] text-sky-400/90">{field.key}</dt>
                        <dd className="mt-0.5 break-words text-[11px] text-slate-200">{field.value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {hasSagaAnacPerson(sagaAnacJson) ? (
                    <p className="text-emerald-400">Todos os campos ANAC obrigatórios estão presentes.</p>
                  ) : (
                    <p className="text-amber-300">
                      Campos faltando: {sagaAnacMissingEnrollmentFields(sagaAnac).join(", ")}. Consulte ANAC novamente.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-amber-300/90">Dados ANAC do SAGA ainda não consultados. Informe ANAC, CPF e nascimento e clique em Consultar.</p>
              )}
            </div>
            {sagaUserId ? (
              <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-2">
                <p className="text-xs text-slate-300">
                  ID SAGA: <span className="font-mono text-slate-100">{sagaUserId}</span>
                </p>
                {!sagaDeleteOpen ? (
                  <button
                    type="button"
                    onClick={() => setSagaDeleteOpen(true)}
                    className="mt-2 rounded-lg border border-rose-700/50 bg-rose-600/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-600/20"
                  >
                    Excluir usuário no SAGA
                  </button>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-rose-200">
                      Confirma exclusão do usuário <span className="font-mono">{sagaUserId}</span> no SAGA? Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={sagaDeleteLoading}
                        onClick={() => void handleDeleteSagaUser()}
                        className="rounded-lg border border-rose-600 bg-rose-600/20 px-2.5 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-600/30 disabled:opacity-50"
                      >
                        {sagaDeleteLoading ? "Excluindo..." : "Confirmar exclusão"}
                      </button>
                      <button
                        type="button"
                        disabled={sagaDeleteLoading}
                        onClick={() => setSagaDeleteOpen(false)}
                        className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-600">Nenhum ID SAGA vinculado ao perfil.</p>
            )}
          </section>

          <section className="mt-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentos</p>
            {profile ? (
              <div className="space-y-2">
                {CRM_DOCUMENT_TYPES.map(({ type, label, required }) => {
                  const attachment = profile.documents[type];
                  const url = attachment ? getProfileDocumentUrl(attachment.fileId, "view") : "";
                  return (
                    <div key={type} className={`flex items-center justify-between gap-3 rounded-lg border bg-[var(--bg)] px-3 py-2 ${required && !attachment ? "border-amber-700/50" : "border-slate-800"}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200">
                          {label}
                          {required && <span className="ml-1 text-amber-400">*</span>}
                        </p>
                        <p className={`truncate text-[11px] ${attachment ? "text-slate-500" : required ? "text-amber-600" : "text-slate-700"}`}>{attachment ? attachment.fileName : required ? "Obrigatório — não anexado" : "Não anexado"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Ver</a>}
                        <input ref={(node) => { fileInputs.current[type] = node; }} type="file" className="hidden" onChange={(e) => void handleUpload(type, e.target.files?.[0])} />
                        <button type="button" disabled={busyDocument === type} onClick={() => fileInputs.current[type]?.click()} className="rounded-lg border border-sky-700/60 bg-sky-600/10 px-2 py-1 text-xs text-sky-300 hover:bg-sky-600/20 disabled:opacity-50">{busyDocument === type ? "Subindo..." : attachment ? "Trocar" : "Anexar"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Os documentos aparecem quando o lead tem perfil vinculado.</p>
            )}
          </section>

          {(leadForm.crmStatus === "aguardando_transferencia" || leadForm.crmStatus === "matricula_enviada" || leadForm.crmStatus === "aguardando_assinatura_pagamento" || leadForm.crmStatus === "ground_agendado" || leadForm.crmStatus === "cadastro_anac" || leadForm.crmStatus === "aluno_pronto") && (
            <section className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentos de Transferência</p>
              {profile ? (
                <div className="space-y-2">
                  {CRM_TRANSFER_DOCUMENT_TYPES.map(({ type, label }) => {
                    const attachment = profile.documents[type];
                    const url = attachment ? getProfileDocumentUrl(attachment.fileId, "view") : "";
                    return (
                      <div key={type} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200">{label}</p>
                          <p className={`truncate text-[11px] ${attachment ? "text-slate-500" : "text-slate-700"}`}>{attachment ? attachment.fileName : "Não anexado"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Ver</a>}
                          <input ref={(node) => { fileInputs.current[type] = node; }} type="file" className="hidden" onChange={(e) => void handleUpload(type, e.target.files?.[0])} />
                          <button type="button" disabled={busyDocument === type} onClick={() => fileInputs.current[type]?.click()} className="rounded-lg border border-sky-700/60 bg-sky-600/10 px-2 py-1 text-xs text-sky-300 hover:bg-sky-600/20 disabled:opacity-50">{busyDocument === type ? "Subindo..." : attachment ? "Trocar" : "Anexar"}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Os documentos aparecem quando o lead tem perfil vinculado.</p>
              )}
            </section>
          )}

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Follow-ups</p>
              <label className="flex items-center gap-2 text-xs text-cyan-300">
                <input
                  type="checkbox"
                  checked={lead.payInPerson}
                  onChange={(e) => void handleTogglePayInPerson(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                Aluno pagara presencialmente
              </label>
            </div>
            {lead.followups.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Nenhum follow-up engatilhado para este status.</p>
            ) : (
              <div className="space-y-2">
                {lead.followups.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">{item.title}</p>
                      <p className="text-[11px] text-slate-500">Engatilhado em {formatDateShort(item.triggeredAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleFollowup(item.id)}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs ${item.completedAt ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
                    >
                      {item.completedAt ? "Realizado" : "Marcar realizado"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 space-y-2 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Controle</p>
            <div className="grid grid-cols-1 gap-2 text-xs text-slate-500 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">Qualificacao: {lead.qualFilledAt ? new Date(lead.qualFilledAt).toLocaleString("pt-BR") : "Pendente"}</div>
              <div className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">Criado: {lead.createdAt ? new Date(lead.createdAt).toLocaleString("pt-BR") : "-"}</div>
              <div className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">Atualizado: {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString("pt-BR") : "-"}</div>
              <div className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">User ID: {lead.userId || "-"}</div>
            </div>
          </section>

          {/* Propostas */}
          <section className="mt-6 space-y-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Propostas</p>
            {proposalsLoading ? (
              <p className="text-xs text-slate-500">Carregando propostas...</p>
            ) : proposals.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Nenhuma proposta gerada para este lead.</p>
            ) : (
              <div className="space-y-2">
                {proposals.map((p) => {
                  const isAccepted = lead.acceptedProposalId === p.id;
                  return (
                    <div key={p.id} className={`rounded-lg border px-3 py-2 ${isAccepted ? "border-emerald-700/60 bg-emerald-900/10" : "border-slate-800 bg-[var(--bg)]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-slate-200">
                              {p.hours}h · {p.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </p>
                            {isAccepted && (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-700/60 text-emerald-300">Aceita</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{new Date(p.createdAt).toLocaleDateString("pt-BR")} · {p.status === "sent" ? "Enviada" : "Rascunho"}</p>
                        </div>
                        <a
                          href={`/proposta/${p.publicToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Ver
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Comentários */}
          <section className="mt-6 space-y-3 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Comentários</p>
            {commentsLoading ? (
              <p className="text-xs text-slate-500">Carregando comentários...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-600">Nenhum comentário ainda.</p>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="group rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-300">{c.authorName}</span>
                          <span className="text-[10px] text-slate-600">{new Date(c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-400">{c.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(c.id)}
                        className="shrink-0 rounded p-0.5 text-slate-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                        title="Excluir comentário"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Novo comentário */}
            <div className="rounded-lg border border-slate-800 bg-[var(--bg)] p-3 space-y-2">
              <p className="text-[11px] text-slate-600">Como <span className="text-slate-400 font-medium">{currentUserName}</span></p>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className={`${drawerFieldCls} min-h-16 resize-y`}
                placeholder="Escreva um comentário sobre este lead..."
              />
              <button
                type="button"
                disabled={commentSaving || !commentText.trim()}
                onClick={() => void handlePostComment()}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition"
              >
                {commentSaving ? "Salvando..." : "Adicionar comentário"}
              </button>
            </div>
          </section>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={() => { onCopyQualLink(lead); close(); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition">Link qual.</button>
          <button type="button" onClick={() => { onSendCadastro(lead); close(); }} className="rounded-lg border border-sky-700/50 bg-sky-600/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-600/20 transition">Link cadastro</button>
          <button type="button" onClick={() => setShowProposalModal(true)} className="rounded-lg border border-violet-700/50 bg-violet-600/10 px-3 py-1.5 text-xs text-violet-400 hover:bg-violet-600/20 transition">Gerar proposta</button>
          {lead.userId && <button type="button" onClick={() => { onApprove(lead); close(); }} className="rounded-lg border border-emerald-700/50 bg-emerald-600/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-600/20 transition">Liberar acesso</button>}
        </div>
      </aside>
    </div>

    {showProposalModal && (
      <ProposalGeneratorModal
        lead={lead}
        onClose={() => setShowProposalModal(false)}
      />
    )}
    </>
  );
}

function EnrollmentAutomationModal({
  lead,
  templates,
  loading,
  onClose,
  onSubmit,
}: {
  lead: CrmLead;
  templates: ContractTemplate[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: {
    customVarValues: Record<string, string>;
    trainingTrackId: string;
    templateIds: string[];
    createInSaga: boolean;
    ignoreSagaDuplicates: boolean;
    useStudentEmail: boolean;
  }) => void;
}) {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
    () => new Set(templates.map((template) => template.id)),
  );
  const [createInSaga, setCreateInSaga] = useState(true);
  const [ignoreSagaDuplicates, setIgnoreSagaDuplicates] = useState(false);
  const [useStudentEmail, setUseStudentEmail] = useState(true);
  const selectedTemplates = templates.filter((template) => selectedTemplateIds.has(template.id));
  const variables = uniqueCustomVariables(selectedTemplates);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(uniqueCustomVariables(templates).map((v) => [v.name, ""])),
  );
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [trainingTrackId, setTrainingTrackId] = useState("");
  const sagaAnacReady = hasSagaAnacPerson(lead.sagaAnacJson);

  function toggleTemplate(templateId: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  useEffect(() => {
    void (async () => {
      setTracksLoading(true);
      const { data, error } = await listTrainingTracks();
      if (!error && data.length > 0) {
        const mapped = data.map((track) => ({ id: track.id, name: track.name }));
        setTracks(mapped);
        const preferred = data.find((track) => track.isDefault) ?? data[0];
        setTrainingTrackId(preferred.id);
        setValues((prev) => ({ ...prev, curso: preferred.name }));
      } else {
        setTracks([]);
      }
      setTracksLoading(false);
    })();
  }, []);

  function handleTrackChange(trackId: string) {
    setTrainingTrackId(trackId);
    const track = tracks.find((t) => t.id === trackId);
    if (track) setValues((prev) => ({ ...prev, curso: track.name }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Automação de matrícula</h2>
            <p className="mt-1 text-xs text-slate-500">{lead.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="max-h-[min(70vh,520px)] space-y-4 overflow-y-auto p-5">
          <div>
            <p className="text-xs font-medium text-slate-300">Documentos a gerar</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Desmarque os contratos padrão que não devem ser enviados nesta matrícula.
            </p>
            <ul className="mt-2 space-y-1.5 rounded-lg border border-slate-800 bg-[var(--bg)] p-2">
              {templates.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-slate-500">Nenhum layout padrão de matrícula cadastrado.</li>
              ) : (
                templates.map((template) => (
                  <li key={template.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={selectedTemplateIds.has(template.id)}
                        onChange={() => toggleTemplate(template.id)}
                        className="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-sm text-slate-200">{template.name}</span>
                    </label>
                  </li>
                ))
              )}
              <li className="border-t border-slate-800 pt-1.5">
                <label className="flex items-start gap-2 rounded-md px-2 py-1.5 opacity-90">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-500"
                  />
                  <span className="text-sm text-slate-300">
                    Ficha de matrícula
                    <span className="ml-1 text-[11px] text-slate-500">(sempre gerada)</span>
                  </span>
                </label>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-sky-200/80">
              {selectedTemplates.length} contrato(s) padrão + ficha de matrícula.
            </p>
          </div>
          <label className="block text-xs text-slate-500">
            Trilha de treinamento (CURSO DE na ficha)
            <select
              value={trainingTrackId}
              onChange={(e) => handleTrackChange(e.target.value)}
              disabled={tracksLoading || tracks.length === 0}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-60"
            >
              {tracksLoading ? (
                <option value="">Carregando trilhas...</option>
              ) : tracks.length === 0 ? (
                <option value="">Nenhuma trilha cadastrada</option>
              ) : (
                tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={createInSaga}
              onChange={(e) => setCreateInSaga(e.target.checked)}
              className="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-sm text-slate-200">
              Criar aluno no SAGA
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                Usa a sessão SAGA configurada em Admin &gt; Import.{useStudentEmail ? " E-mail real do aluno." : " E-mail: aluno+{ANAC}@epeac.com.br"}
              </span>
            </span>
          </label>
          {createInSaga && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={ignoreSagaDuplicates}
                onChange={(e) => setIgnoreSagaDuplicates(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-200">
                Ignorar duplicidades no SAGA
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                  Se marcado, não verifica se o ANAC já existe na lista de usuários do SAGA e tenta criar mesmo assim.
                </span>
              </span>
            </label>
          )}
          {createInSaga && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={useStudentEmail}
                onChange={(e) => setUseStudentEmail(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-200">
                Usar e-mail real do aluno no SAGA
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                  Por padrão usa aluno+{"{ANAC}"}@epeac.com.br. Marque para usar o e-mail cadastrado do aluno.
                </span>
              </span>
            </label>
          )}          {!sagaAnacReady && (
            <p className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              Consulte os dados ANAC no detalhe do lead (SAGA / ANAC) antes de enviar a matrícula.
            </p>
          )}
          {variables.length > 0 ? (
            <div className="space-y-3">
              {variables.map((v) => (
                <label key={v.name} className="block text-xs text-slate-500">
                  {v.label}
                  <input
                    type="text"
                    value={values[v.name] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                    placeholder={`Valor para {{${v.name}}}`}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Os layouts selecionados não possuem variáveis personalizadas.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!trainingTrackId || tracksLoading || loading || !sagaAnacReady}
            onClick={() =>
              onSubmit({
                customVarValues: values,
                trainingTrackId,
                templateIds: Array.from(selectedTemplateIds),
                createInSaga,
                ignoreSagaDuplicates,
                useStudentEmail,
              })
            }
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && (
              <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Gerando..." : "Gerar e enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProposalAcceptModal({
  lead,
  proposals,
  onClose,
  onConfirm,
}: {
  lead: CrmLead;
  proposals: CrmProposal[];
  onClose: () => void;
  onConfirm: (proposalId: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Proposta aceita</h2>
            <p className="mt-0.5 text-xs text-slate-500">{lead.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-400">Selecione a proposta que foi aceita por este lead. <span className="text-slate-600">(opcional)</span></p>
          {proposals.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">Nenhuma proposta gerada para este lead.</p>
          ) : (
            <div className="space-y-1.5">
              {proposals.map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${selectedId === p.id ? "border-sky-600 bg-sky-600/10" : "border-slate-800 bg-[var(--bg)] hover:border-slate-700"}`}>
                  <input
                    type="radio"
                    name="proposal"
                    checked={selectedId === p.id}
                    onChange={() => setSelectedId(p.id)}
                    className="mt-0.5 accent-sky-500"
                  />
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      {p.hours}h · {p.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    <p className="text-[11px] text-slate-500">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={() => onConfirm(null)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Pular
          </button>
          <button type="button" onClick={() => onConfirm(selectedId)}
            disabled={!selectedId}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition">
            Confirmar proposta aceita
          </button>
        </div>
      </div>
    </div>
  );
}

function LostReasonModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: CrmLead;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Motivo de perda</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-400">
            Informe o motivo pelo qual <span className="font-medium text-slate-200">{lead.name}</span> está sendo marcado como perdido.
          </p>
          <label className="block text-xs text-slate-500">
            Motivo *
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Não retornou contato, optou por outra escola..."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none min-h-20 resize-y"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-lg bg-zinc-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-500 disabled:opacity-50 transition"
          >
            Confirmar como perdido
          </button>
        </div>
      </div>
    </div>
  );
}

function uniqueCustomVariables(templates: ContractTemplate[]): CustomVariable[] {
  const map = new Map<string, CustomVariable>();
  for (const template of templates) {
    for (const variable of template.customVariables) {
      if (!map.has(variable.name)) map.set(variable.name, variable);
    }
  }
  return Array.from(map.values());
}

export function CrmTab() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<CrmLead | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll horizontal do board enquanto arrasta um card perto das bordas,
  // para soltar em colunas fora da área visível (drag nativo não rola o container).
  const handleBoardDragOver = (e: DragEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el || !draggedLead) return;
    const rect = el.getBoundingClientRect();
    const edge = 96;
    if (e.clientX < rect.left + edge) {
      el.scrollLeft -= Math.ceil((rect.left + edge - e.clientX) / 3);
    } else if (e.clientX > rect.right - edge) {
      el.scrollLeft += Math.ceil((e.clientX - (rect.right - edge)) / 3);
    }
  };
  const [automationRunning, setAutomationRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [detailModal, setDetailModal] = useState<CrmLead | null>(null);
  const [editModal, setEditModal] = useState<{ lead: CrmLead | null; initialStatus: CrmStatus } | null>(null);
  const [cadastroModal, setCadastroModal] = useState<CrmLead | null>(null);
  const [enrollmentModal, setEnrollmentModal] = useState<{ lead: CrmLead; templates: ContractTemplate[] } | null>(null);
  const [creditModal, setCreditModal] = useState<{ lead: CrmLead; targetStatus: "aluno_pronto" | "ground_agendado" } | null>(null);
  const [lostReasonModal, setLostReasonModal] = useState<{ lead: CrmLead } | null>(null);
  const [proposalAcceptModal, setProposalAcceptModal] = useState<{ lead: CrmLead; proposals: CrmProposal[] } | null>(null);
  const [cardSettingsOpen, setCardSettingsOpen] = useState(false);
  const [statusSettings, setStatusSettings] = useState<CrmStatusSetting[]>([]);
  const [statusSettingsModal, setStatusSettingsModal] = useState<CrmStatus | null>(null);
  const [statusSettingsSaving, setStatusSettingsSaving] = useState(false);
  const [groundPaymentModal, setGroundPaymentModal] = useState<{ lead: CrmLead } | null>(null);
  const { visibleFields, toggle: toggleField } = useCardFieldSettings();

  const { toast, show: showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  async function autoPromoteToAnac(currentLeads: CrmLead[], settingsForMove = statusSettings): Promise<CrmLead[]> {
    const candidates = currentLeads.filter((l) => l.crmStatus === "ground_agendado" && l.userId);
    if (candidates.length === 0) return currentLeads;
    const results = await Promise.all(
      candidates.map(async (l) => ({ lead: l, realized: await hasStudentRealizedFlights(l.userId!) }))
    );
    const toPromote = results.filter((r) => r.realized).map((r) => r.lead);
    if (toPromote.length === 0) return currentLeads;
    const moved = toPromote.map((lead) => buildStatusMove(lead, "cadastro_anac", settingsForMove));
    await Promise.all(moved.map((lead) => updateLead(lead.id, {
      crmStatus: "cadastro_anac",
      statusEnteredAt: lead.statusEnteredAt,
      funnelEnteredAt: lead.funnelEnteredAt,
      followups: lead.followups,
    })));
    const promoted = new Map(moved.map((l) => [l.id, l]));
    return currentLeads.map((l) => promoted.get(l.id) ?? l);
  }

  async function reloadLeads() {
    setRefreshing(true);
    const { data, error } = await listLeads();
    if (!error && data) {
      const promoted = await autoPromoteToAnac(data);
      setLeads(promoted);
    }
    setRefreshing(false);
  }

  useEffect(() => {
    void (async () => {
      const [leadsResult, settingsResult] = await Promise.all([listLeads(), listCrmStatusSettings()]);
      const { data, error } = leadsResult;
      if (!settingsResult.error) setStatusSettings(settingsResult.data);
      if (!error && data) {
        const promoted = await autoPromoteToAnac(data, settingsResult.data);
        setLeads(promoted);
      }
      setLoading(false);
    })();
  }, []);

  function leadsByStatus(status: CrmStatus) {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (l.crmStatus !== status) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone && l.phone.toLowerCase().includes(q))
      );
    });
  }

  function buildStatusMove(lead: CrmLead, targetStatus: CrmStatus, settingsForMove = statusSettings): CrmLead {
    const enteredAt = new Date().toISOString();
    const setting = getStatusSetting(settingsForMove, targetStatus);
    return {
      ...lead,
      crmStatus: targetStatus,
      statusEnteredAt: enteredAt,
      funnelEnteredAt: lead.funnelEnteredAt || enteredAt,
      followups: buildFollowupsForStatus(targetStatus, enteredAt, setting.followups),
    };
  }

  async function persistStatusMove(lead: CrmLead, targetStatus: CrmStatus): Promise<boolean> {
    const nextLead = buildStatusMove(lead, targetStatus);
    setLeads((ls) => ls.map((item) => item.id === lead.id ? nextLead : item));
    if (detailModal?.id === lead.id) setDetailModal(nextLead);
    const { error } = await updateLead(lead.id, {
      crmStatus: targetStatus,
      statusEnteredAt: nextLead.statusEnteredAt,
      funnelEnteredAt: nextLead.funnelEnteredAt,
      followups: nextLead.followups,
    });
    if (error) {
      setLeads((ls) => ls.map((item) => item.id === lead.id ? lead : item));
      if (detailModal?.id === lead.id) setDetailModal(lead);
      showToast("Erro ao mover lead.", "error");
      return false;
    }
    return true;
  }

  async function requestStatusChangeFromDrawer(lead: CrmLead, targetStatus: CrmStatus): Promise<CrmLead | null> {
    if (lead.crmStatus === targetStatus) return lead;
    if (targetStatus === "lead_perdido") {
      setLostReasonModal({ lead });
      return null;
    }
    if (targetStatus === "matricula_enviada") {
      try {
        const templates = await listStandardContractTemplates(user?.schoolId ?? DEFAULT_SCHOOL_ID, "matricula");
        setEnrollmentModal({ lead, templates });
      } catch (e) {
        showToast((e as Error).message || "Erro ao preparar automacao de matricula.", "error");
      }
      return null;
    }
    if (targetStatus === "ground_agendado") {
      if (!lead.userId) {
        showToast("Este lead nao tem conta vinculada. Nao e possivel verificar a escala.", "error");
        return null;
      }
      const hasFlights = await hasStudentScheduledFlights(lead.userId);
      if (!hasFlights) {
        showToast("Nao e possivel mover para Ground Agendado: o aluno nao possui nenhum voo agendado na escala.", "error");
        return null;
      }
      if (!lead.payInPerson && !(await hasPaymentSignal(lead))) {
        showToast("Nao ha credito inserido para aquele aluno.", "error");
        setGroundPaymentModal({ lead });
        return null;
      }
    }
    const nextLead = buildStatusMove(lead, targetStatus);
    const ok = await persistStatusMove(lead, targetStatus);
    return ok ? nextLead : null;
  }

  async function hasPaymentSignal(lead: CrmLead): Promise<boolean> {
    if (!lead.userId) return false;
    const [statement, sales] = await Promise.all([
      getStudentCreditStatement({
        viewer: { userId: user?.id ?? "", role: (user?.role ?? "admin") as "admin" },
        studentUserId: lead.userId,
      }).catch(() => null),
      listProductSalesForUser(lead.userId).catch(() => []),
    ]);
    return Boolean((statement && statement.purchases.length > 0) || sales.length > 0);
  }

  async function handleDrop(targetStatus: CrmStatus) {
    if (!draggedLead || draggedLead.crmStatus === targetStatus) return;
    const lead = draggedLead;
    setDraggedLead(null);

    if (targetStatus === "lead_perdido") {
      setLostReasonModal({ lead });
      return;
    }

    if (targetStatus === "ground_agendado") {
      if (!lead.userId) {
        showToast("Este lead não tem conta vinculada. Não é possível verificar a escala.", "error");
        return;
      }
      const hasFlights = await hasStudentScheduledFlights(lead.userId);
      if (!hasFlights) {
        showToast("Não é possível mover para Ground Agendado: o aluno não possui nenhum voo agendado na escala.", "error");
        return;
      }
      if (!lead.payInPerson) {
        const hasPayment = await hasPaymentSignal(lead);
        if (!hasPayment) {
          showToast("Nao ha credito inserido para aquele aluno.", "error");
          setGroundPaymentModal({ lead });
          return;
        }
      }
      await persistStatusMove(lead, targetStatus);
      return;
    }

    if (targetStatus === "matricula_enviada") {
      try {
        const templates = await listStandardContractTemplates(user?.schoolId ?? DEFAULT_SCHOOL_ID, "matricula");
        setEnrollmentModal({ lead, templates });
      } catch (e) {
        showToast((e as Error).message || "Erro ao preparar automação de matrícula.", "error");
      }
      return;
    }
    if (targetStatus === "registro_enviado") {
      const ok = await persistStatusMove(lead, targetStatus);
      if (!ok) return;
      // Buscar propostas para perguntar qual foi aceita
      const leadWithStatus = buildStatusMove(lead, targetStatus);
      const props = await getProposalsByLead(lead.id).catch(() => [] as CrmProposal[]);
      setProposalAcceptModal({ lead: leadWithStatus, proposals: props });
      return;
    }
    if (targetStatus === "aluno_pronto" && lead.userId) {
      try {
        const statement = await getStudentCreditStatement({
          viewer: { userId: user?.id ?? "", role: (user?.role ?? "admin") as "admin" },
          studentUserId: lead.userId!,
        });
        if (statement.purchases.length === 0) {
          setCreditModal({ lead, targetStatus: "aluno_pronto" });
          return;
        }
      } catch { /* se falhar a consulta, prossegue normalmente */ }
      await persistStatusMove(lead, targetStatus);
      return;
    }
    await persistStatusMove(lead, targetStatus);
  }

  async function confirmProposalAccepted(lead: CrmLead, proposalId: string | null) {
    setProposalAcceptModal(null);
    if (proposalId) {
      await updateLead(lead.id, { acceptedProposalId: proposalId });
      setLeads((ls) => ls.map((l) => l.id === lead.id ? { ...l, acceptedProposalId: proposalId } : l));
    }
    setCadastroModal(lead);
  }

  async function confirmMoveLost(lead: CrmLead, reason: string) {
    setLostReasonModal(null);
    const existingNotes = lead.notes ? lead.notes.trim() : "";
    const notes = `Motivo de perda: ${reason}${existingNotes ? `\n\n---\n${existingNotes}` : ""}`;
    const nextLead = { ...buildStatusMove(lead, "lead_perdido"), notes };
    setLeads((ls) => ls.map((l) => l.id === lead.id ? nextLead : l));
    const { error } = await updateLead(lead.id, {
      crmStatus: "lead_perdido",
      notes,
      statusEnteredAt: nextLead.statusEnteredAt,
      funnelEnteredAt: nextLead.funnelEnteredAt,
      followups: nextLead.followups,
    });
    if (error) {
      setLeads((ls) => ls.map((l) => l.id === lead.id ? lead : l));
      showToast("Erro ao mover lead.", "error");
    }
  }

  async function confirmMoveAfterCredit(lead: CrmLead, targetStatus: "aluno_pronto" | "ground_agendado") {
    setCreditModal(null);
    await persistStatusMove(lead, targetStatus);
  }

  async function confirmGroundPayInPerson(lead: CrmLead) {
    const nextLead = { ...lead, payInPerson: true };
    setGroundPaymentModal(null);
    setLeads((ls) => ls.map((l) => l.id === lead.id ? nextLead : l));
    const { error } = await updateLead(lead.id, { payInPerson: true });
    if (error) {
      showToast("Erro ao marcar pagamento presencial.", "error");
      return;
    }
    await persistStatusMove(nextLead, "ground_agendado");
  }

  function addGroundCredit(lead: CrmLead) {
    setGroundPaymentModal(null);
    setCreditModal({ lead, targetStatus: "ground_agendado" });
  }

  async function handleSaveStatusSetting(setting: Pick<CrmStatusSetting, "status" | "followups" | "expirationDays">) {
    setStatusSettingsSaving(true);
    const { data, error } = await saveCrmStatusSetting(setting);
    setStatusSettingsSaving(false);
    if (error || !data) {
      showToast(error?.message || "Erro ao salvar configuracao do status.", "error");
      return;
    }
    setStatusSettings((prev) => {
      const exists = prev.some((item) => item.status === data.status);
      return exists ? prev.map((item) => item.status === data.status ? data : item) : [...prev, data];
    });
    setStatusSettingsModal(null);
    showToast("Configuracao do status salva.");
  }

  async function executeEnrollmentAutomation(
    lead: CrmLead,
    input: {
      customVarValues: Record<string, string>;
      trainingTrackId: string;
      templateIds: string[];
      createInSaga: boolean;
      ignoreSagaDuplicates: boolean;
      useStudentEmail: boolean;
    },
  ) {
    if (automationRunning) return;
    setAutomationRunning(true);
    try {
      const result = await runEnrollmentAutomation({
        leadId: lead.id,
        customVarValues: input.customVarValues,
        trainingTrackId: input.trainingTrackId,
        templateIds: input.templateIds,
        createInSaga: input.createInSaga,
        ignoreSagaDuplicates: input.ignoreSagaDuplicates,
        useStudentEmail: input.useStudentEmail,
      });
      const nextStatus = result.nextStatus as CrmStatus;
      setLeads((ls) => ls.map((l) => l.id === lead.id ? { ...l, crmStatus: nextStatus } : l));
      let message = `Matrícula automatizada. ${result.createdContracts} contrato(s) gerado(s).`;
      if (result.saga?.ok && !result.saga.skipped) message += " Aluno criado no SAGA.";
      else if (result.saga?.ok && result.saga.skipped) message += " Aluno já vinculado no SAGA.";
      if (lead.userId) {
        const { error: accessErr } = await approveStudentAccess(lead.userId);
        if (!accessErr) message += " Acesso liberado.";
        else message += ` (Acesso: ${accessErr.message})`;
      }
      showToast(message);
      if (result.saga && !result.saga.ok) {
        showToast(result.saga.message || "Não foi possível criar o aluno no SAGA.", "warning");
      }
      setEnrollmentModal(null);
    } catch (e) {
      showToast((e as Error).message || "Erro ao executar automação de matrícula.", "error");
    } finally {
      setAutomationRunning(false);
    }
  }

  function handleSaved(updated: CrmLead) {
    setLeads((ls) => {
      const exists = ls.find((l) => l.id === updated.id);
      return exists ? ls.map((l) => l.id === updated.id ? updated : l) : [updated, ...ls];
    });
    setEditModal(null);
    showToast(editModal?.lead ? "Lead atualizado." : "Lead criado.");
  }

  async function handleDelete(lead: CrmLead) {
    if (!window.confirm(`Excluir "${lead.name}"?`)) return;
    const { error } = await deleteLead(lead.id);
    if (error) { showToast("Erro ao excluir.", "error"); return; }
    setLeads((ls) => ls.filter((l) => l.id !== lead.id));
    showToast("Lead excluído.");
  }

  async function handleApprove(lead: CrmLead) {
    if (!lead.userId) { showToast("Lead sem conta vinculada.", "error"); return; }
    if (!window.confirm(`Liberar acesso para "${lead.name}"?`)) return;
    const { error } = await approveStudentAccess(lead.userId);
    if (error) { showToast("Erro ao liberar acesso.", "error"); return; }
    showToast(`Acesso liberado para ${lead.name}.`);
  }

  function handleCopyQualLink(lead: CrmLead) {
    const url = `${window.location.origin}/qualificacao?email=${encodeURIComponent(lead.email)}`;
    void navigator.clipboard.writeText(url).then(() => showToast("Link de qualificação copiado!"));
  }

  function handleCadastroTokenGenerated(leadId: string, token: string) {
    setLeads((ls) => ls.map((l) => l.id === leadId ? { ...l, qualToken: token } : l));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-[60] max-w-xs rounded-lg border px-4 py-2.5 text-sm shadow-xl ${
          toast.variant === "error"
            ? "border-red-800 bg-[#2a0f0f] text-red-300"
            : toast.variant === "warning"
              ? "border-amber-800 bg-[#2a220f] text-amber-200"
              : "border-emerald-800 bg-[#0f2a1a] text-emerald-300"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-600 shrink-0">{leads.length} lead{leads.length !== 1 ? "s" : ""}</p>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lead ou aluno..."
              className="w-52 rounded-lg border border-slate-700 bg-[var(--bg)] py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCardSettingsOpen(true)}
            title="Configurar campos do card"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            title="Copiar link de qualificação"
            onClick={() => {
              const url = `${window.location.origin}/qualificacao`;
              void navigator.clipboard.writeText(url).then(() => showToast("Link de qualificação copiado!"));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M7.752 2.5a.75.75 0 000 1.5h3.69l-8.97 8.97a.75.75 0 001.06 1.06l8.97-8.97v3.69a.75.75 0 001.5 0v-5.5a.75.75 0 00-.75-.75h-5.5z" />
            </svg>
            Link qualificação
          </button>
          <button
            type="button"
            onClick={() => void reloadLeads()}
            disabled={refreshing}
            title="Atualizar leads"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}>
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.389zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setEditModal({ lead: null, initialStatus: "novo_lead" })}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
            </svg>
            Novo lead
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div ref={boardRef} onDragOver={handleBoardDragOver} className="flex gap-3 overflow-x-auto pb-4">
        {CRM_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            leads={leadsByStatus(status)}
            visibleFields={visibleFields}
            statusSettings={statusSettings}
            onDrop={handleDrop}
            onDragStart={setDraggedLead}
            onClick={(lead) => setDetailModal(lead)}
            onEdit={(lead) => setDetailModal(lead)}
            onDelete={handleDelete}
            onCopyQualLink={handleCopyQualLink}
            onSendCadastro={(lead) => setCadastroModal(lead)}
            onApprove={handleApprove}
            onQuickAdd={(s) => setEditModal({ lead: null, initialStatus: s })}
            onConfigureStatus={setStatusSettingsModal}
          />
        ))}
      </div>

      {/* Modais */}
      {detailModal && (
        <LeadDetailDrawer
          lead={detailModal}
          currentUserName={user?.name ?? user?.email ?? "Admin"}
          onClose={() => setDetailModal(null)}
          onLeadPatched={(lead) => {
            setLeads((ls) => ls.map((item) => item.id === lead.id ? lead : item));
            setDetailModal(lead);
          }}
          onSendCadastro={(lead) => { setDetailModal(null); setCadastroModal(lead); }}
          onCopyQualLink={(lead) => { setDetailModal(null); handleCopyQualLink(lead); }}
          onApprove={(lead) => { setDetailModal(null); void handleApprove(lead); }}
          onStatusChangeRequest={requestStatusChangeFromDrawer}
          showToast={showToast}
        />
      )}
      {editModal !== null && (
        <LeadModal
          lead={editModal.lead}
          initialStatus={editModal.initialStatus}
          onClose={() => setEditModal(null)}
          onSaved={handleSaved}
        />
      )}
      {cadastroModal && (
        <CadastroLinkModal
          lead={cadastroModal}
          onClose={() => setCadastroModal(null)}
          onGenerated={(token) => handleCadastroTokenGenerated(cadastroModal.id, token)}
        />
      )}
      {enrollmentModal && (
        <EnrollmentAutomationModal
          lead={enrollmentModal.lead}
          templates={enrollmentModal.templates}
          loading={automationRunning}
          onClose={() => {
            if (!automationRunning) setEnrollmentModal(null);
          }}
          onSubmit={(input) => void executeEnrollmentAutomation(enrollmentModal.lead, input)}
        />
      )}
      {cardSettingsOpen && (
        <CardSettingsModal
          visibleFields={visibleFields}
          onToggle={toggleField}
          onClose={() => setCardSettingsOpen(false)}
        />
      )}

      {statusSettingsModal && (
        <StatusSettingsModal
          status={statusSettingsModal}
          setting={getStatusSetting(statusSettings, statusSettingsModal)}
          saving={statusSettingsSaving}
          onClose={() => setStatusSettingsModal(null)}
          onSave={(setting) => void handleSaveStatusSetting(setting)}
        />
      )}

      {lostReasonModal && (
        <LostReasonModal
          lead={lostReasonModal.lead}
          onClose={() => setLostReasonModal(null)}
          onConfirm={(reason) => void confirmMoveLost(lostReasonModal.lead, reason)}
        />
      )}

      {proposalAcceptModal && (
        <ProposalAcceptModal
          lead={proposalAcceptModal.lead}
          proposals={proposalAcceptModal.proposals}
          onClose={() => { setProposalAcceptModal(null); setCadastroModal(proposalAcceptModal.lead); }}
          onConfirm={(pid) => void confirmProposalAccepted(proposalAcceptModal.lead, pid)}
        />
      )}

      {groundPaymentModal && groundPaymentModal.lead.userId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-700/40 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-sm font-semibold text-slate-100">Credito necessario</p>
              <p className="mt-1 text-xs text-slate-500">
                Nao ha credito inserido para aquele aluno. Insira credito ou marque que o aluno pagara presencialmente.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
              <button type="button" onClick={() => setGroundPaymentModal(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={() => addGroundCredit(groundPaymentModal.lead)} className="rounded-lg border border-emerald-700/60 bg-emerald-600/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-600/20">
                Inserir credito
              </button>
              <button type="button" onClick={() => void confirmGroundPayInPerson(groundPaymentModal.lead)} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">
                Pagara presencialmente
              </button>
            </div>
          </div>
        </div>
      )}

      {creditModal && creditModal.lead.userId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-emerald-700/40 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Adicionar créditos — {creditModal.lead.name}</p>
                <p className="text-xs text-slate-500">Este aluno ainda não tem créditos. Adicione antes de mover para Em Curso.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreditModal(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
            <div className="p-4">
              <AdminUserCreditsSection
                studentUserId={creditModal.lead.userId}
                studentName={creditModal.lead.name}
                anacCode={creditModal.lead.anacCode ?? undefined}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setCreditModal(null)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmMoveAfterCredit(creditModal.lead, creditModal.targetStatus)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Confirmar e mover para {creditModal.targetStatus === "ground_agendado" ? "Ground Agendado" : "Em Curso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
