import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export function AuthPanel() {
  const { user, loading, signIn, signUp, signOut, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90">
        Defina <code className="text-amber-200">VITE_APPWRITE_ENDPOINT</code>,{" "}
        <code className="text-amber-200">VITE_APPWRITE_PROJECT_ID</code>,{" "}
        <code className="text-amber-200">VITE_APPWRITE_DATABASE_ID</code> e{" "}
        <code className="text-amber-200">VITE_APPWRITE_COLLECTION_ID</code> no <code>.env.local</code> para ativar
        login e nuvem.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando sessão…</p>;
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/50 px-4 py-3">
        <span className="text-sm text-slate-300">
          <span className="text-slate-500">Conectado:</span> {user.email}
        </span>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => void signOut()}
        >
          Sair
        </button>
      </div>
    );
  }

  const submit = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const fn = mode === "signin" ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) {
        setMessage(error.message);
        return;
      }
      if (mode === "signup") {
        setMessage("Conta criada. Se o projeto exigir confirmação por e-mail, abra o link recebido antes de entrar.");
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          className={`rounded-lg px-3 py-1 ${mode === "signin" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"}`}
          onClick={() => setMode("signin")}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1 ${mode === "signup" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"}`}
          onClick={() => setMode("signup")}
        >
          Criar conta
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Senha
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {message ? <p className="text-xs text-amber-200/90">{message}</p> : null}
      <button
        type="button"
        disabled={busy || !email || password.length < 6}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void submit()}
      >
        {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Registrar"}
      </button>
    </div>
  );
}
