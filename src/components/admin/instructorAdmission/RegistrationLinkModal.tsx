import { useState } from "react";
import type { InstructorAdmissionCandidate } from "../../../types/instructorAdmission";
import { generateInstructorRegistrationToken } from "../../../lib/instructorAdmissionDb";

export function RegistrationLinkModal({
  candidate,
  onClose,
  onGenerated,
}: {
  candidate: InstructorAdmissionCandidate;
  onClose: () => void;
  onGenerated: (token: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(candidate.registrationToken ?? null);
  const [copied, setCopied] = useState(false);
  /** Mesmo formato do CRM: /cadastro?token=... */
  const cadastroUrl = token ? `${window.location.origin}/cadastro?token=${token}` : null;

  async function handleGenerate() {
    setGenerating(true);
    const { token: nextToken, error } = await generateInstructorRegistrationToken(candidate.id);
    setGenerating(false);
    if (!error && nextToken) {
      setToken(nextToken);
      onGenerated(nextToken);
    }
  }

  function copyLink() {
    if (!cadastroUrl) return;
    void navigator.clipboard.writeText(cadastroUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const inputCls =
    "flex-1 rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-xs text-slate-300 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Link de cadastro</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-slate-400">
            Link personalizado para{" "}
            <span className="font-medium text-slate-200">{candidate.name}</span> criar conta na plataforma.
          </p>
          {candidate.userId && candidate.formFilledAt && (
            <div className="rounded-lg bg-emerald-900/20 px-3 py-2 text-xs text-emerald-400">
              ✓ Cadastro já realizado em{" "}
              {new Date(candidate.formFilledAt).toLocaleDateString("pt-BR")}
            </div>
          )}
          {cadastroUrl ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input readOnly value={cadastroUrl} className={inputCls} />
                <button
                  type="button"
                  onClick={copyLink}
                  className={`rounded-lg border px-3 py-2 text-xs transition ${
                    copied
                      ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                      : "border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-400"
              >
                Gerar novo link
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {generating ? "Gerando..." : "Gerar link de cadastro"}
            </button>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
