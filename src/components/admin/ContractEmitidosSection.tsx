import { useEffect, useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { listContracts } from "../../lib/contractsDb";
import type { Contract, ContractStatus } from "../../types/contracts";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from "../../types/contracts";
import { ContractCreateModal } from "./ContractCreateModal";
import { ContractViewSignModal } from "../ContractViewSignModal";

type Props = {
  schoolId: string;
  adminUserId: string;
};

type FilterOption = ContractStatus | "all";

const FILTER_OPTIONS: { id: FilterOption; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "signed_recipient", label: "Assinou (aluno)" },
  { id: "signed_admin", label: "Assinou (escola)" },
  { id: "signed_both", label: "Ambos assinaram" },
  { id: "cancelled", label: "Cancelados" },
];

export function ContractEmitidosSection({ schoolId, adminUserId }: Props) {
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewContract, setViewContract] = useState<Contract | null>(null);

  async function load(cursor?: string | null) {
    const isInitial = !cursor;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);
    try {
      const status = filter !== "all" ? filter : undefined;
      const result = await listContracts(schoolId, { status, cursor });
      if (isInitial) {
        setContracts(result.items);
      } else {
        setContracts((prev) => [...prev, ...result.items]);
      }
      setNextCursor(result.nextCursor);
    } catch {
      showToast({ variant: "error", message: "Erro ao carregar contratos." });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(null);
  }, [schoolId, filter]);

  function handleContractCreated(contract: Contract) {
    setContracts((prev) => [contract, ...prev]);
    setCreateOpen(false);
    showToast({ variant: "success", message: "Contrato criado e e-mail enviado ao destinatário." });
  }

  function handleSigned(updated: Contract) {
    setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setViewContract(updated);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Contratos Emitidos</h2>
          <p className="text-xs text-slate-500">Todos os contratos gerados para alunos e instrutores</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Novo Contrato
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              filter === opt.id
                ? "border-sky-600 bg-sky-600/20 text-sky-300"
                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
          ))}
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 py-12 text-center">
          <p className="text-sm text-slate-500">Nenhum contrato encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-100">{contract.recipientName}</p>
                  <span className={`rounded border px-2 py-0.5 text-xs ${CONTRACT_STATUS_COLORS[contract.status]}`}>
                    {CONTRACT_STATUS_LABELS[contract.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {contract.templateName} · {new Date(contract.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="ml-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewContract(contract)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  Ver
                </button>
                {(contract.status === "pending" || contract.status === "signed_recipient") && (
                  <button
                    type="button"
                    onClick={() => setViewContract(contract)}
                    className="rounded-lg border border-emerald-800/50 px-2.5 py-1.5 text-xs text-emerald-400 transition hover:bg-emerald-950/40"
                  >
                    Assinar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void load(nextCursor)}
          disabled={loadingMore}
          className="w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      )}

      {createOpen && (
        <ContractCreateModal
          schoolId={schoolId}
          adminUserId={adminUserId}
          onCreated={handleContractCreated}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {viewContract && (
        <ContractViewSignModal
          contract={viewContract}
          signerRole="admin"
          onSigned={handleSigned}
          onClose={() => setViewContract(null)}
        />
      )}
    </div>
  );
}
