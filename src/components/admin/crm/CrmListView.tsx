import { useMemo, useState } from "react";
import type { CrmLead, CrmLeadScoreRule, CrmStatus, CrmStatusSetting } from "../../../types/crm";
import { CRM_START_DATE_OPTIONS, CRM_STATUS_LABELS } from "../../../types/crm";
import { computeLeadScore, leadScoreColor } from "../../../lib/crmLeadScore";
import { countOverdueFollowups, countPendingFollowups, isLeadStatusExpired } from "../../../lib/crmStatusMove";

type SortKey = "name" | "status" | "course" | "startDate" | "score" | "createdAt" | "overdueFups";

type Props = {
  leads: CrmLead[];
  statusSettings: CrmStatusSetting[];
  scoreRules: CrmLeadScoreRule[];
  onClick: (lead: CrmLead) => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function startDateLabel(value: string | null): string {
  if (!value) return "-";
  return CRM_START_DATE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function CrmListView({ leads, statusSettings, scoreRules, onClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "status":
          cmp = a.crmStatus.localeCompare(b.crmStatus);
          break;
        case "course":
          cmp = (a.desiredCourse ?? "").localeCompare(b.desiredCourse ?? "", "pt-BR");
          break;
        case "startDate":
          cmp = (a.startDate ?? "").localeCompare(b.startDate ?? "");
          break;
        case "score":
          cmp = computeLeadScore(a, scoreRules).total - computeLeadScore(b, scoreRules).total;
          break;
        case "overdueFups":
          cmp = countOverdueFollowups(a.followups) - countOverdueFollowups(b.followups);
          break;
        case "createdAt":
        default:
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [leads, sortKey, sortAsc, scoreRules]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name" || key === "course");
    }
  }

  function SortBtn({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wider ${active ? "text-sky-400" : "text-slate-500 hover:text-slate-300"}`}
      >
        {label}
        {active && <span className="text-[10px]">{sortAsc ? "↑" : "↓"}</span>}
      </button>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 py-16 text-sm text-slate-500">
        Nenhum lead encontrado com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto rounded-xl border border-slate-800/80">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--panel)]">
          <tr className="border-b border-slate-800">
            <th className="px-3 py-2.5"><SortBtn label="Lead" col="name" /></th>
            <th className="px-3 py-2.5"><SortBtn label="Status" col="status" /></th>
            <th className="px-3 py-2.5"><SortBtn label="Curso" col="course" /></th>
            <th className="px-3 py-2.5"><SortBtn label="Início" col="startDate" /></th>
            <th className="px-3 py-2.5"><SortBtn label="Score" col="score" /></th>
            <th className="px-3 py-2.5"><SortBtn label="FUPs" col="overdueFups" /></th>
            <th className="px-3 py-2.5"><SortBtn label="Criado" col="createdAt" /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lead) => {
            const score = computeLeadScore(lead, scoreRules).total;
            const overdue = countOverdueFollowups(lead.followups);
            const pending = countPendingFollowups(lead.followups);
            const expired = isLeadStatusExpired(lead, statusSettings);
            return (
              <tr
                key={lead.id}
                onClick={() => onClick(lead)}
                className={`cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/40 ${
                  expired ? "bg-red-950/10" : overdue > 0 ? "bg-amber-950/5" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium text-slate-100">{lead.name}</p>
                  <p className="text-xs text-slate-500">{lead.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {CRM_STATUS_LABELS[lead.crmStatus as CrmStatus]}
                  </span>
                  {expired && (
                    <span className="ml-1 rounded-md bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-200">Expirado</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{lead.desiredCourse || "-"}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{startDateLabel(lead.startDate)}</td>
                <td className={`px-3 py-2.5 text-sm font-semibold ${leadScoreColor(score)}`}>{score}</td>
                <td className="px-3 py-2.5 text-xs">
                  {overdue > 0 && <span className="text-amber-400">{overdue} venc.</span>}
                  {overdue > 0 && pending > 0 && <span className="text-slate-600"> · </span>}
                  {pending > 0 && <span className="text-sky-400">{pending} pend.</span>}
                  {overdue === 0 && pending === 0 && <span className="text-slate-600">-</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(lead.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
