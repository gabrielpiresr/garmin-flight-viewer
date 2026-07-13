import { useMemo, useState } from "react";
import type { CrmLead, CrmLeadScoreRule, CrmStatus } from "../../../types/crm";
import { CRM_STATUS_LABELS } from "../../../types/crm";
import type { CrmFupTask } from "../../../lib/crmFupTasks";
import { sortFupTasks } from "../../../lib/crmFupTasks";
import type { CrmLeadSortKey } from "../../../lib/crmLeadSort";
import { computeLeadScore, leadScoreColor } from "../../../lib/crmLeadScore";

type Props = {
  tasks: CrmFupTask[];
  sortKey: CrmLeadSortKey;
  sortAsc: boolean;
  scoreRules: CrmLeadScoreRule[];
  completingId: string | null;
  onComplete: (lead: CrmLead, followupId: string) => void;
  onOpenLead: (lead: CrmLead) => void;
};

type FupScope = "all" | "overdue" | "pending";

function formatDue(value: string, isOverdue: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const label = date.toLocaleDateString("pt-BR");
  return isOverdue ? `Venceu em ${label}` : `Vence em ${label}`;
}

export function CrmFupsView({
  tasks,
  sortKey,
  sortAsc,
  scoreRules,
  completingId,
  onComplete,
  onOpenLead,
}: Props) {
  const [scope, setScope] = useState<FupScope>("all");

  const filtered = useMemo(() => {
    if (scope === "overdue") return tasks.filter((t) => t.isOverdue);
    if (scope === "pending") return tasks.filter((t) => !t.isOverdue);
    return tasks;
  }, [tasks, scope]);

  const sorted = useMemo(
    () => sortFupTasks(filtered, sortKey, sortAsc, scoreRules),
    [filtered, sortKey, sortAsc, scoreRules],
  );

  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const pendingCount = tasks.filter((t) => !t.isOverdue).length;

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", `Todos (${tasks.length})`],
            ["overdue", `Vencidos (${overdueCount})`],
            ["pending", `Pendentes (${pendingCount})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                scope === id
                  ? "border-sky-600 bg-sky-600/10 text-sky-300"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 py-16 text-sm text-slate-500">
          {tasks.length === 0
            ? "Nenhum FUP em aberto com os filtros atuais."
            : "Nenhum FUP neste recorte."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap gap-2">
        {([
          ["all", `Todos (${tasks.length})`],
          ["overdue", `Vencidos (${overdueCount})`],
          ["pending", `Pendentes (${pendingCount})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScope(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              scope === id
                ? "border-sky-600 bg-sky-600/10 text-sky-300"
                : "border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800/80">
        <div className="divide-y divide-slate-800/80">
          {sorted.map(({ lead, followup, isOverdue }) => {
            const rowKey = `${lead.id}:${followup.id}`;
            const busy = completingId === rowKey;
            const score = computeLeadScore(lead, scoreRules).total;
            return (
              <div
                key={rowKey}
                className={`flex items-start gap-3 px-3 py-3 transition hover:bg-slate-800/30 ${
                  isOverdue ? "bg-amber-950/10" : ""
                }`}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onComplete(lead, followup.id)}
                  title="Marcar como feito"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                    busy
                      ? "border-slate-600 opacity-50"
                      : isOverdue
                        ? "border-amber-600 hover:bg-amber-600/20"
                        : "border-slate-600 hover:border-sky-500 hover:bg-sky-600/10"
                  }`}
                >
                  {busy && (
                    <span className="h-3 w-3 animate-spin rounded-full border border-sky-400 border-t-transparent" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onOpenLead(lead)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-100">{followup.title}</p>
                    {followup.manual && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] bg-violet-900/50 text-violet-300">Manual</span>
                    )}
                    {followup.qualAuto && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] bg-teal-900/50 text-teal-300">Qualificação</span>
                    )}
                    {isOverdue ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-900/60 text-amber-200">Vencido</span>
                    ) : (
                      <span className="rounded px-1.5 py-0.5 text-[10px] bg-sky-900/50 text-sky-300">Pendente</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    <span className="text-slate-300">{lead.name}</span>
                    {" · "}
                    {CRM_STATUS_LABELS[lead.crmStatus as CrmStatus]}
                    {" · "}
                    <span className={isOverdue ? "text-amber-400" : "text-sky-400/90"}>
                      {formatDue(followup.triggeredAt, isOverdue)}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {lead.email && <span>{lead.email}</span>}
                    {lead.desiredCourse && <span>{lead.desiredCourse}</span>}
                    <span className={`font-semibold ${leadScoreColor(score)}`}>Score {score}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
