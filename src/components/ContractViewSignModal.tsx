import { useState } from "react";
import { useToast } from "./ui/ToastProvider";
import { createContractSignature } from "../lib/contractSignaturesDb";
import { updateContractStatus } from "../lib/contractsDb";
import type { Contract } from "../types/contracts";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS, resolveCustomVars } from "../types/contracts";
import { renderRichContent } from "../lib/maneuverContent";
import type { ManeuverRichContent } from "../types/maneuver";

type Props = {
  contract: Contract;
  signerUserId: string;
  signerRole: "aluno" | "instrutor" | "admin";
  onSigned: (updated: Contract) => void;
  onClose: () => void;
};

function SignStatusBadge({ label, signedAt }: { label: string; signedAt: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
          signedAt ? "bg-emerald-700/60 text-emerald-300" : "bg-slate-800 text-slate-500"
        }`}
      >
        {signedAt ? "✓" : "–"}
      </span>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        {signedAt && (
          <p className="text-[10px] text-slate-600">
            {new Date(signedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
    </div>
  );
}

export function ContractViewSignModal({ contract, signerUserId, signerRole, onSigned, onClose }: Props) {
  const { showToast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [signing, setSigning] = useState(false);

  const isRecipient = signerRole === "aluno" || signerRole === "instrutor";
  const isAdmin = signerRole === "admin";

  const alreadySigned =
    (isRecipient && contract.signedByRecipientAt !== null) ||
    (isAdmin && contract.signedByAdminAt !== null);

  const canSign = !alreadySigned && contract.status !== "cancelled";

  const resolvedContentJson = resolveCustomVars(
    contract.contentResolvedJson,
    contract.customVarValues,
  );

  let richContent: ManeuverRichContent | null = null;
  try {
    richContent = JSON.parse(resolvedContentJson) as ManeuverRichContent;
  } catch {
    richContent = null;
  }

  async function handleSign() {
    if (!confirmed) return;
    setSigning(true);
    try {
      await createContractSignature({
        contractId: contract.id,
        signerUserId,
        signerRole,
        schoolId: contract.schoolId,
      });
      const updated = await updateContractStatus(contract.id, signerRole);
      showToast({ variant: "success", message: "Contrato assinado com sucesso." });
      onSigned(updated);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message || "Erro ao assinar contrato." });
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-4 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{contract.templateName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{contract.recipientName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded border px-2 py-0.5 text-xs ${CONTRACT_STATUS_COLORS[contract.status]}`}>
              {CONTRACT_STATUS_LABELS[contract.status]}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Signing status */}
        <div className="flex flex-wrap items-center gap-6 border-b border-slate-800 px-6 py-3">
          <SignStatusBadge label="Aluno/Instrutor" signedAt={contract.signedByRecipientAt} />
          <SignStatusBadge label="Escola" signedAt={contract.signedByAdminAt} />
          <span className="ml-auto text-xs text-slate-500">
            Emitido em {new Date(contract.createdAt).toLocaleDateString("pt-BR")}
          </span>
        </div>

        {/* Contract content */}
        <div className="px-6 py-5">
          {richContent ? (
            <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-200">
              {renderRichContent(richContent)}
            </div>
          ) : (
            <p className="text-sm italic text-slate-500">Conteúdo do contrato não disponível.</p>
          )}
        </div>

        {/* Sign footer */}
        {canSign && (
          <div className="space-y-3 border-t border-slate-800 px-6 py-4">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-sky-600"
              />
              <span className="text-sm text-slate-400">
                Li e concordo com os termos deste contrato e confirmo minha assinatura digital.
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handleSign()}
              disabled={!confirmed || signing}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {signing ? "Assinando..." : "Assinar este Contrato"}
            </button>
          </div>
        )}

        {alreadySigned && (
          <div className="border-t border-slate-800 px-6 py-4">
            <p className="text-center text-sm text-emerald-400">✓ Você já assinou este contrato</p>
          </div>
        )}

        {contract.status === "cancelled" && !alreadySigned && (
          <div className="border-t border-slate-800 px-6 py-4">
            <p className="text-center text-sm text-slate-500">Este contrato foi cancelado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
