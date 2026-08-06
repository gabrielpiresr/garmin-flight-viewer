import { useCallback, useEffect, useState } from "react";
import { decideSoloFlightRequest, listSoloFlightRequests } from "../../lib/soloFlightDb";
import type { SoloFlightCheckResult, SoloFlightRequest, SoloFlightRequestType } from "../../types/soloFlight";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

function statusLabel(status: SoloFlightRequest["status"]): string {
  const labels: Record<SoloFlightRequest["status"], string> = {
    draft: "Rascunho",
    pending_approval: "Pendente de aprovação",
    approved: "Aprovado",
    auto_approved: "Aprovado automaticamente",
    rejected: "Rejeitado",
  };
  return labels[status] || status;
}

function statusBadgeClass(status: SoloFlightRequest["status"]): string {
  if (status === "pending_approval" || status === "draft") return "border-amber-700 bg-amber-500/15 text-amber-200";
  if (status === "rejected") return "border-red-800 bg-red-500/15 text-red-300";
  if (status === "approved" || status === "auto_approved") return "border-emerald-700 bg-emerald-500/15 text-emerald-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function requestTypeLabel(type: SoloFlightRequestType): string {
  return type === "primeiro_circuito_solo" ? "Primeiro circuito solo" : "Voo solo";
}

function sortRequestsNewestFirst(items: SoloFlightRequest[]): SoloFlightRequest[] {
  return [...items].sort((a, b) => {
    const left = new Date(b.createdAt || b.updatedAt || 0).getTime();
    const right = new Date(a.createdAt || a.updatedAt || 0).getTime();
    return left - right;
  });
}

function CheckRow({ check }: { check: SoloFlightCheckResult }) {
  const ok = check.applicable ? check.ok === true : true;
  return (
    <li className={`rounded border px-2.5 py-1.5 text-xs ${ok ? "border-emerald-900/60 bg-emerald-950/15 text-emerald-100" : "border-amber-900/60 bg-amber-950/20 text-amber-100"}`}>
      <strong>{check.label}</strong>
      {check.details ? <p className="mt-0.5 opacity-80">{check.details}</p> : null}
    </li>
  );
}

function AdminRequestCard({
  request,
  decidingId,
  onDecide,
}: {
  request: SoloFlightRequest;
  decidingId: string;
  onDecide: (requestId: string, decision: "approved" | "rejected") => void;
}) {
  const [open, setOpen] = useState(false);
  const checks = [...(request.automaticChecks || []), ...(request.manualChecks || []), ...(request.metarChecks || [])];

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/70">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-slate-100">{request.studentName || request.studentUserId}</h2>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(request.status)}`}>
              {statusLabel(request.status)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {request.flightDate} · {request.route || "-"} · {requestTypeLabel(request.requestType)} · Instrutor: {request.instructorName || request.instructorUserId}
          </p>
          {!open && request.flags.length > 0 ? (
            <p className="mt-1 text-[11px] text-amber-300">{request.flags.length} flag(s)</p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {request.status === "pending_approval" ? (
            <>
              <button
                type="button"
                onClick={() => onDecide(request.id, "approved")}
                disabled={decidingId === request.id}
                className="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => onDecide(request.id, "rejected")}
                disabled={decidingId === request.id}
                className="rounded border border-red-900/50 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-50"
              >
                Rejeitar
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            aria-label={open ? "Recolher detalhes" : "Expandir detalhes"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-slate-800 px-3 py-3">
          <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
            <p><span className="font-semibold text-slate-500">Início:</span> {request.startTime || "--:--"}Z</p>
            <p><span className="font-semibold text-slate-500">Corte:</span> {request.cutoffTime || "--:--"}Z</p>
            <p><span className="font-semibold text-slate-500">Criado:</span> {request.createdAt ? new Date(request.createdAt).toLocaleString("pt-BR") : "-"}</p>
            <p><span className="font-semibold text-slate-500">Decisão:</span> {request.finalDecision || "-"}{request.decisionReason ? ` · ${request.decisionReason}` : ""}</p>
          </div>

          {request.flags.length ? (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Flags</p>
              {request.flags.map((flag) => (
                <div key={flag.id} className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-100">
                  <strong>{flag.label}</strong>
                  {flag.details ? <p className="mt-0.5 opacity-80">{flag.details}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-300">Sem flags; aprovado automaticamente.</p>
          )}

          {checks.length ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Checklist</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {checks.map((check) => <CheckRow key={check.id} check={check} />)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function AdminSoloFlightTab() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<SoloFlightRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(sortRequestsNewestFirst(await listSoloFlightRequests({ limit: 100 })));
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar checklists solo." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(requestId: string, decision: "approved" | "rejected") {
    setDecidingId(requestId);
    try {
      const request = await decideSoloFlightRequest({ requestId, decision });
      setRequests((current) => sortRequestsNewestFirst(current.map((item) => (item.id === request.id ? request : item))));
      showToast({ variant: "success", message: decision === "approved" ? "Checklist aprovado." : "Checklist rejeitado." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao decidir o checklist." });
    } finally {
      setDecidingId("");
    }
  }

  if (loading) return <Skeleton className="h-80 rounded-2xl" />;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Voo solo</h1>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Atualizar</button>
      </div>
      {requests.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-500">Nenhum checklist encontrado.</p> : null}
      {sortRequestsNewestFirst(requests).map((request) => (
        <AdminRequestCard key={request.id} request={request} decidingId={decidingId} onDecide={(id, decision) => void decide(id, decision)} />
      ))}
    </div>
  );
}
