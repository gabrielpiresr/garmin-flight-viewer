import { useEffect, useRef, useState, type FormEvent } from "react";
import { updateAdminUserPassword } from "../../lib/adminUsersDb";
import { useToast } from "../ui/ToastProvider";

type Props = {
  target: { userId: string; name: string; email: string };
  onClose: () => void;
};

export function AdminUserPasswordModal({ target, onClose }: Props) {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const elements = formRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)");
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (password.length < 8 || !password.trim()) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await updateAdminUserPassword(target.userId, password);
      setPassword("");
      showToast({
        variant: result.auditRecorded ? "success" : "warning",
        message: result.auditRecorded
          ? `Nova senha definida para ${target.name}.`
          : `Nova senha definida para ${target.name}, mas não foi possível registrar a alteração na auditoria.`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível definir a nova senha.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => { if (!savingRef.current) onClose(); }}
    >
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-password-title"
        aria-describedby="user-password-description"
        onSubmit={(event) => void submit(event)}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-5"
      >
        <h2 id="user-password-title" className="text-base font-semibold text-slate-100">Definir nova senha</h2>
        <p className="mt-2 break-words text-sm text-slate-200">{target.name}</p>
        <p className="break-words text-xs text-slate-400">{target.email}</p>
        <p id="user-password-description" className="mt-3 text-xs leading-relaxed text-slate-400">
          A nova senha substitui a atual. Informe-a ao usuário para o próximo acesso.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate-400">
            Nova senha
            <input
              required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password"
              name="new-user-password" value={password} disabled={saving}
              onChange={(event) => { setPassword(event.target.value); setError(null); }}
              placeholder="Mínimo de 8 caracteres"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <button type="button" disabled={saving} onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} className="text-xs text-sky-300 hover:text-sky-200 disabled:opacity-50">
            {showPassword ? "Ocultar senha" : "Mostrar senha"}
          </button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={saving || !password} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
            {saving ? "Salvando..." : "Definir nova senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
