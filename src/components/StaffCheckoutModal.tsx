import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "./ui/ToastProvider";

type CheckoutView = "tablet" | "phone";

type Props = {
  paymentUrl: string;
  studentLabel?: string;
  onClose: () => void;
};

export function StaffCheckoutModal({ paymentUrl, studentLabel, onClose }: Props) {
  const { showToast } = useToast();
  const [view, setView] = useState<CheckoutView>("tablet");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setQrLoading(true);
    void QRCode.toDataURL(paymentUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#020617", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      })
      .finally(() => {
        if (!cancelled) setQrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      showToast({ variant: "success", message: "Link copiado!" });
    } catch {
      showToast({ variant: "error", message: "Não foi possível copiar o link." });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/90 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[min(96vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 sm:text-base">Checkout de pagamento</h2>
            {studentLabel ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">{studentLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
          >
            Fechar
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-slate-800 bg-slate-950/60 p-1">
          {([
            ["tablet", "Checkout no tablet"],
            ["phone", "Pagar no celular"],
          ] as const).map(([tabId, label]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setView(tabId)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
                view === tabId
                  ? "bg-emerald-600/20 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "tablet" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-4 py-2">
              <p className="text-xs text-slate-500">
                Conclua o pagamento abaixo ou envie o link para o celular do aluno.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900"
                >
                  Copiar link
                </button>
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900"
                >
                  Abrir em nova aba
                </a>
              </div>
            </div>
            <iframe
              title="Checkout de pagamento"
              src={paymentUrl}
              className="min-h-0 w-full flex-1 border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-8 text-center">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-100">Escaneie no celular</h3>
              <p className="max-w-sm text-sm text-slate-400">
                O aluno pode abrir o checkout no próprio celular para pagar com PIX ou outro método.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-white p-4 shadow-lg shadow-slate-950/40">
              {qrLoading ? (
                <div className="flex h-64 w-64 items-center justify-center text-sm text-slate-500">
                  Gerando QR code…
                </div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code do checkout" className="h-64 w-64" />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center px-4 text-sm text-slate-500">
                  Não foi possível gerar o QR code.
                </div>
              )}
            </div>

            <div className="w-full max-w-md space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Link do checkout</p>
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-xs text-sky-400 underline"
                >
                  {paymentUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Copiar link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
