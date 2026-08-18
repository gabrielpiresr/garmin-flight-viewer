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
  onApprove,
  onReject,
}: {
  request: SoloFlightRequest;
  decidingId: string;
  onApprove: (requestId: string) => void;
  onReject: (request: SoloFlightRequest) => void;
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
          {!open && request.status === "rejected" && request.decisionReason ? (
            <p className="mt-1 truncate text-[11px] text-red-300">Motivo: {request.decisionReason}</p>
          ) : null}
          {!open && request.flags.length > 0 ? (
            <p className="mt-1 text-[11px] text-amber-300">{request.flags.length} flag(s)</p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {request.status === "pending_approval" ? (
            <>
              <button
                type="button"
                onClick={() => onApprove(request.id)}
                disabled={decidingId === request.id}
                className="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => onReject(request)}
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
          {request.status === "rejected" && request.decisionReason ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/25 px-3 py-2 text-sm text-red-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-300">Motivo da rejeição</p>
              <p className="mt-1 whitespace-pre-wrap">{request.decisionReason}</p>
            </div>
          ) : null}
          <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
            <p><span className="font-semibold text-slate-500">Início:</span> {request.startTime || "--:--"}Z</p>
            <p><span className="font-semibold text-slate-500">Corte:</span> {request.cutoffTime || "--:--"}Z</p>
            <p><span className="font-semibold text-slate-500">Criado:</span> {request.createdAt ? new Date(request.createdAt).toLocaleString("pt-BR") : "-"}</p>
            <p><span className="font-semibold text-slate-500">Decisão:</span> {request.finalDecision || "-"}</p>
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
  const [rejectingRequest, setRejectingRequest] = useState<SoloFlightRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

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

  function closeRejectModal() {
    if (decidingId) return;
    setRejectingRequest(null);
    setRejectReason("");
    setRejectError(null);
  }

  async function decide(requestId: string, decision: "approved" | "rejected", reason?: string) {
    if (decision === "rejected" && !reason?.trim()) {
      setRejectError("Informe o motivo da rejeição.");
      return;
    }
    setDecidingId(requestId);
    setRejectError(null);
    try {
      const request = await decideSoloFlightRequest({
        requestId,
        decision,
        reason: reason?.trim() || undefined,
      });
      setRequests((current) => sortRequestsNewestFirst(current.map((item) => (item.id === request.id ? request : item))));
      setRejectingRequest(null);
      setRejectReason("");
      showToast({ variant: "success", message: decision === "approved" ? "Checklist aprovado." : "Checklist rejeitado." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao decidir o checklist.";
      if (decision === "rejected") setRejectError(message);
      showToast({ variant: "error", message });
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
        <AdminRequestCard
          key={request.id}
          request={request}
          decidingId={decidingId}
          onApprove={(id) => void decide(id, "approved")}
          onReject={(item) => {
            setRejectingRequest(item);
            setRejectReason("");
            setRejectError(null);
          }}
        />
      ))}

      {rejectingRequest ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-300">Rejeição de voo solo</p>
                <h3 className="text-lg font-semibold text-slate-100">Informe o motivo</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {rejectingRequest.studentName || rejectingRequest.studentUserId} · {rejectingRequest.flightDate} · {rejectingRequest.route || "-"}
                </p>
              </div>
              <button type="button" onClick={closeRejectModal} disabled={Boolean(decidingId)} className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">Fechar</button>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Motivo obrigatório</span>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={4}
                disabled={Boolean(decidingId)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-500 disabled:opacity-60"
                placeholder="Explique por que o checklist foi rejeitado. O instrutor verá este motivo na plataforma e no WhatsApp."
              />
            </label>
            {rejectError ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">{rejectError}</p> : null}
            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button type="button" onClick={closeRejectModal} disabled={Boolean(decidingId)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">Cancelar</button>
              <button
                type="button"
                onClick={() => void decide(rejectingRequest.id, "rejected", rejectReason)}
                disabled={Boolean(decidingId) || !rejectReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {decidingId === rejectingRequest.id ? "Rejeitando..." : "Confirmar rejeição"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
