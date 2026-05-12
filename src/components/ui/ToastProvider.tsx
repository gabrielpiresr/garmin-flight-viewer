import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type Toast = Required<Omit<ToastInput, "durationMs" | "title">> & {
  id: string;
  title?: string;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "border-emerald-500/40 bg-emerald-950/95 text-emerald-100",
  error: "border-red-500/40 bg-red-950/95 text-red-100",
  info: "border-sky-500/40 bg-sky-950/95 text-sky-100",
  warning: "border-amber-500/40 bg-amber-950/95 text-amber-100",
};

const DOT_CLASS: Record<ToastVariant, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  info: "bg-sky-400",
  warning: "bg-amber-400",
};

function createToastId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.durationMs, toast.id]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${VARIANT_CLASS[toast.variant]}`}
    >
      <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${DOT_CLASS[toast.variant]}`} />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="text-sm font-semibold">{toast.title}</p> : null}
        <p className="break-words text-sm leading-5 opacity-95">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar notificação"
        className="rounded px-1 text-lg leading-none opacity-70 transition hover:bg-white/10 hover:opacity-100"
      >
        x
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const trimmedMessage = toast.message.trim();
    if (!trimmedMessage) return;

    setToasts((current) => [
      ...current.slice(-3),
      {
        id: createToastId(),
        title: toast.title?.trim() || undefined,
        message: trimmedMessage,
        variant: toast.variant ?? "info",
        durationMs: toast.durationMs ?? 4500,
      },
    ]);
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed left-3 right-3 top-3 z-[100] flex max-h-[calc(100vh-1.5rem)] flex-col gap-2 overflow-y-auto sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-sm"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
