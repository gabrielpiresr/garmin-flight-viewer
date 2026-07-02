import { useEffect, useMemo, useState } from "react";
import {
  getAutomationRunDetail,
  invalidateStudentAutomationCache,
  listAutomationRuns,
  listStudentAutomations,
} from "../../lib/studentAutomationsDb";
import type {
  AutomationRun,
  AutomationRunDetail,
  StudentAutomation,
} from "../../types/studentAutomation";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";

const STATUS_LABEL: Record<string, string> = {
  running: "Executando",
  waiting: "Aguardando",
  succeeded: "Concluída",
  partial_failed: "Falha parcial",
  failed: "Falhou",
  cancelled: "Cancelada",
  skipped: "Ignorada",
};
const STATUS_CLASS: Record<string, string> = {
  running: "text-sky-300 border-sky-500/30",
  waiting: "text-amber-300 border-amber-500/30",
  succeeded: "text-emerald-300 border-emerald-500/30",
  partial_failed: "text-orange-300 border-orange-500/30",
  failed: "text-rose-300 border-rose-500/30",
  cancelled: "text-slate-400 border-slate-600",
  skipped: "text-slate-400 border-slate-600",
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<AutomationRunDetail | null>(null);
  useEffect(() => {
    void getAutomationRunDetail(id)
      .then(setDetail)
      .catch((error) =>
        showToast({
          variant: "error",
          message:
            error instanceof Error
              ? error.message
              : "Falha ao carregar execução.",
        }),
      );
  }, [id, showToast]);
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400">
              Execução detalhada
            </p>
            <h3 className="text-lg font-semibold text-white">
              {detail?.run.automationName || "Carregando..."}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300"
          >
            Fechar
          </button>
        </div>
        {!detail ? (
          <div className="p-5">
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Aluno" value={detail.run.studentName} />
              <Info
                label="Status"
                value={STATUS_LABEL[detail.run.status] || detail.run.status}
              />
              <Info label="Início" value={date(detail.run.startedAt)} />
              <Info label="Fim" value={date(detail.run.completedAt)} />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-white">Etapas</h4>
              <div className="space-y-2">
                {detail.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {index + 1}. {step.stepType}{" "}
                          {step.recipientLabel
                            ? `→ ${step.recipientLabel}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {step.channel} · {date(step.createdAt)}
                          {step.durationMs != null
                            ? ` · ${step.durationMs}ms`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${step.status === "sent" || step.status === "succeeded" ? "border-emerald-500/30 text-emerald-300" : step.status === "failed" ? "border-rose-500/30 text-rose-300" : "border-slate-700 text-slate-400"}`}
                      >
                        {step.status}
                      </span>
                    </div>
                    {step.error ? (
                      <p className="mt-2 rounded bg-rose-500/10 p-2 text-xs text-rose-300">
                        {step.error}
                      </p>
                    ) : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-500">
                        Conteúdo resolvido
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950 p-3 text-[11px] text-slate-300">
                        {JSON.stringify(step.resolvedContent, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-slate-400">
                Contexto do gatilho
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-300">
                {JSON.stringify(detail.run.context, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm text-slate-200">{value || "—"}</p>
    </div>
  );
}

export function AutomationHistoryTab() {
  const { showToast } = useToast();
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [automations, setAutomations] = useState<StudentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [automationId, setAutomationId] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  async function load(force = false) {
    setLoading(true);
    try {
      if (force) invalidateStudentAutomationCache("runs", "run-detail");
      const [result, defs] = await Promise.all([
        listAutomationRuns({
          automationId: automationId || undefined,
          status: status || undefined,
          channel: channel || undefined,
          limit: 100,
        }),
        listStudentAutomations(),
      ]);
      setRuns(result.runs);
      setAutomations(defs);
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao carregar histórico.",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [automationId, status, channel]);
  const visible = useMemo(
    () =>
      runs.filter((run) =>
        `${run.studentName} ${run.automationName} ${run.triggerType}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, runs],
  );
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Auditoria ponta a ponta
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Histórico de automações
            </h2>
            <p className="text-sm text-slate-400">
              Cada canal, destinatário, conteúdo resolvido, espera e falha em um
              só lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar aluno ou fluxo"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <select
              value={automationId}
              onChange={(e) => setAutomationId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Todas as automações</option>
              {automations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Todos os canais</option>
              <option value="email">Email</option>
              <option value="wpp">WPP</option>
              <option value="push">Push</option>
              <option value="crm_status">Status CRM</option>
              <option value="wait">Espera</option>
            </select>
            <button
              onClick={() => void load(true)}
              className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300"
            >
              Atualizar
            </button>
          </div>
        </div>
      </section>
      {loading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900">
              <tr>
                {[
                  "Início",
                  "Automação",
                  "Aluno",
                  "Gatilho",
                  "Versão",
                  "Status",
                  "",
                ].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {visible.map((run) => (
                <tr key={run.id} className="hover:bg-slate-800/30">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {date(run.startedAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {run.automationName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {run.studentName}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {run.triggerType}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    v{run.automationVersion}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_CLASS[run.status] || "border-slate-700 text-slate-400"}`}
                    >
                      {STATUS_LABEL[run.status] || run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDetailId(run.id)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Nenhuma execução encontrada.
            </p>
          ) : null}
        </div>
      )}
      {detailId ? (
        <DetailModal id={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </div>
  );
}
