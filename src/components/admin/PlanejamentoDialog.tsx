import type { ReactNode } from "react";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/25";

type Props = {
  title: string;
  children?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
};

/** Overlay no mesmo visual dos modais de config / FPL / colar rota. */
export function PlanejamentoDialog({ title, children, onClose, footer }: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button type="button" className="text-slate-500 hover:text-slate-200" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export const planejamentoDialogButtons = {
  primary: btnPrimary,
  secondary: btnSecondary,
  danger: btnDanger,
};
