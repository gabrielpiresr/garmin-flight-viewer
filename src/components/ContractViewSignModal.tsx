import { useEffect, useState } from "react";
import { useToast } from "./ui/ToastProvider";
import { ensureEnrollmentFormPreviewViaAdminFunction, getContractPdfUrl, signContractViaAdminFunction } from "../lib/contractsDb";
import { listSignaturesForContract } from "../lib/contractSignaturesDb";
import { openContractPdf } from "../lib/contractPdf";
import { getCachedBrandSettings } from "../lib/notificationsDb";
import type { Contract } from "../types/contracts";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS, resolveCustomVars } from "../types/contracts";
import { renderRichContent } from "../lib/maneuverContent";
import type { ManeuverRichContent } from "../types/maneuver";

type Props = {
  contract: Contract;
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

export function ContractViewSignModal({ contract, signerRole, onSigned, onClose }: Props) {
  const { showToast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [previewFileId, setPreviewFileId] = useState(contract.enrollmentPdfFileId || contract.signedPdfFileId || "");
  const [previewLoading, setPreviewLoading] = useState(false);
  // Assinaturas carregadas no mount para que o PDF possa ser gerado de forma síncrona no clique
  const [signatures, setSignatures] = useState<import("../types/contracts").ContractSignature[]>([]);

  const isRecipient = signerRole === "aluno" || signerRole === "instrutor";
  const isAdmin = signerRole === "admin";

  const alreadySigned =
    (isRecipient && contract.signedByRecipientAt !== null) ||
    (isAdmin && contract.signedByAdminAt !== null);

  const canSign = !alreadySigned && contract.status !== "cancelled";
  const isEnrollmentForm = contract.contractKind === "enrollment_form";

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

  // Carregar assinaturas antecipadamente para que o PDF seja gerado de forma síncrona no clique
  useEffect(() => {
    if (contract.contractKind === "enrollment_form") return;
    void listSignaturesForContract(contract.id).then(setSignatures);
  }, [contract.id, contract.contractKind]);

  useEffect(() => {
    if (contract.contractKind !== "enrollment_form") {
      setPreviewFileId(contract.enrollmentPdfFileId || contract.signedPdfFileId || "");
      return;
    }
    if (contract.signedPdfFileId) {
      setPreviewFileId(contract.signedPdfFileId);
      return;
    }
    setPreviewLoading(true);
    void ensureEnrollmentFormPreviewViaAdminFunction(contract.id)
      .then((fileId) => setPreviewFileId(fileId))
      .catch((e) => showToast({ variant: "error", message: (e as Error).message || "Erro ao carregar ficha." }))
      .finally(() => setPreviewLoading(false));
  }, [contract.id, contract.contractKind, contract.signedPdfFileId]);

  // Síncrono — window.open precisa ocorrer diretamente no handler de clique
  function handleExportPdf() {
    const brand = getCachedBrandSettings();
    openContractPdf({
      contract,
      signatures,
      schoolName: brand?.schoolName || "Escola de Aviação",
      logoUrl: brand?.logoUrl || undefined,
    });
  }

  async function handleSign() {
    if (!confirmed) return;
    setSigning(true);
    try {
      const updated = await signContractViaAdminFunction({
        contractId: contract.id,
        signerRole,
      });
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
          <div className="flex items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs ${CONTRACT_STATUS_COLORS[contract.status]}`}>
              {CONTRACT_STATUS_LABELS[contract.status]}
            </span>
            {/* Exportar PDF — disponível para todos (aluno, instrutor, admin) */}
            {contract.contractKind !== "enrollment_form" && (
              <button
                type="button"
                onClick={handleExportPdf}
                title="Exportar como PDF"
                className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 9.75a.75.75 0 011.5 0v2.546l.943-1.048a.75.75 0 111.114 1.004l-2.25 2.5a.75.75 0 01-1.114 0l-2.25-2.5a.75.75 0 111.114-1.004l.943 1.048V11.75z" clipRule="evenodd" />
                </svg>
                Exportar PDF
              </button>
            )}
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
          {isEnrollmentForm ? (
            <div className="space-y-3">
              {previewLoading ? (
                <div className="flex h-[70vh] items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-500">
                  Carregando ficha de matricula...
                </div>
              ) : previewFileId ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-slate-700 bg-white">
                    <iframe
                      title="Ficha de matricula"
                      src={getContractPdfUrl(previewFileId, "view")}
                      className="h-[70vh] w-full"
                    />
                  </div>
                  <a
                    href={getContractPdfUrl(previewFileId, "download")}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                  >
                    Abrir PDF
                  </a>
                </>
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-8 text-center text-sm italic text-slate-500">
                  PDF da ficha nao disponivel.
                </p>
              )}
            </div>
          ) : richContent ? (
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
