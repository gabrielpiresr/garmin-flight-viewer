import { useEffect, useState } from "react";
import { useToast } from "./ui/ToastProvider";
import { listContractsForUser } from "../lib/contractsDb";
import type { Contract } from "../types/contracts";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from "../types/contracts";
import { ContractViewSignModal } from "./ContractViewSignModal";

type Props = {
  userId: string;
  schoolId: string;
  userRole: "aluno" | "instrutor";
};

export function ContractsUserTab({ userId, schoolId, userRole }: Props) {
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewContract, setViewContract] = useState<Contract | null>(null);

  useEffect(() => {
    setLoading(true);
    void listContractsForUser(schoolId, userId)
      .then((items) => {
        setContracts(items);
      })
      .catch(() => {
        showToast({ variant: "error", message: "Erro ao carregar contratos." });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [schoolId, userId]);

  function handleSigned(updated: Contract) {
    setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setViewContract(updated);
  }

  const pendingCount = contracts.filter(
    (c) => c.status === "pending" || (c.status === "signed_admin"),
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Meus Contratos</h2>
        <p className="text-xs text-slate-500">Contratos emitidos pela escola para você</p>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0 text-amber-400">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-amber-300">
            {pendingCount === 1 ? "Você tem 1 contrato aguardando sua assinatura." : `Você tem ${pendingCount} contratos aguardando sua assinatura.`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40" />
          ))}
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 py-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-8 w-8 text-slate-600">
            <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm4.5 2.625a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75zm-2.25 3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75v-.008zm2.25 0a.75.75 0 01.75-.75h3.75a.75.75 0 010 1.5H10.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-slate-500">Nenhum contrato encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract) => {
            const needsSignature =
              contract.status === "pending" || contract.status === "signed_admin";
            return (
              <div
                key={contract.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-100">{contract.templateName}</p>
                    <span className={`rounded border px-2 py-0.5 text-xs ${CONTRACT_STATUS_COLORS[contract.status]}`}>
                      {CONTRACT_STATUS_LABELS[contract.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Emitido em {new Date(contract.createdAt).toLocaleDateString("pt-BR")}
                    {contract.signedByRecipientAt && (
                      <> · Assinado por você em {new Date(contract.signedByRecipientAt).toLocaleDateString("pt-BR")}</>
                    )}
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
                  {needsSignature && (
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
            );
          })}
        </div>
      )}

      {viewContract && (
        <ContractViewSignModal
          contract={viewContract}
          signerUserId={userId}
          signerRole={userRole}
          onSigned={handleSigned}
          onClose={() => setViewContract(null)}
        />
      )}
    </div>
  );
}
