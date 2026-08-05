import { useCallback, useEffect, useState } from "react";
import { decideSoloFlightRequest, listSoloFlightRequests } from "../../lib/soloFlightDb";
import type { SoloFlightRequest } from "../../types/soloFlight";
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

export function AdminSoloFlightTab() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<SoloFlightRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await listSoloFlightRequests({ limit: 100 }));
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar voo solo." });
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
      setRequests((current) => current.map((item) => item.id === request.id ? request : item));
      showToast({ variant: "success", message: decision === "approved" ? "Solicitação aprovada." : "Solicitação rejeitada." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao decidir a solicitação." });
    } finally {
      setDecidingId("");
    }
  }

  if (loading) return <Skeleton className="h-80 rounded-2xl" />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Voo solo</h1>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Atualizar</button>
      </div>
      {requests.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-500">Nenhuma solicitação encontrada.</p> : null}
      {requests.map((request) => (
        <article key={request.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-100">{request.studentName || request.studentUserId}</h2>
              <p className="mt-1 text-sm text-slate-400">{request.flightDate} · {request.route || "-"} · Instrutor: {request.instructorName || request.instructorUserId}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{statusLabel(request.status)}</p>
            </div>
            {request.status === "pending_approval" ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => void decide(request.id, "approved")} disabled={decidingId === request.id} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">Aprovar</button>
                <button type="button" onClick={() => void decide(request.id, "rejected")} disabled={decidingId === request.id} className="rounded-lg border border-red-900/50 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-50">Rejeitar</button>
              </div>
            ) : null}
          </div>
          {request.flags.length ? (
            <div className="mt-4 grid gap-2">
              {request.flags.map((flag) => (
                <div key={flag.id} className="rounded-lg border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                  <strong>{flag.label}</strong>
                  {flag.details ? <p className="mt-1 text-xs opacity-80">{flag.details}</p> : null}
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-emerald-300">Sem flags; aprovado automaticamente.</p>}
        </article>
      ))}
    </div>
  );
}
