import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ui/ToastProvider";

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function AuthPanel() {
  const { user, loading, signIn, signUp, signOut, configured } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [anacCode, setAnacCode] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
      } else {
        const parsedWeight = Number(weightKg);
        const parsedHeight = Number(heightCm);
        const payload = {
          fullName: fullName.trim(),
          cpf: onlyDigits(cpf),
          phone: onlyDigits(phone),
          birthDate,
          weightKg: parsedWeight,
          heightCm: parsedHeight,
          anacCode: onlyDigits(anacCode),
        };

        if (
          !payload.fullName ||
          payload.cpf.length !== 11 ||
          payload.phone.length < 10 ||
          !payload.birthDate ||
          !Number.isFinite(payload.weightKg) ||
          payload.weightKg <= 0 ||
          !Number.isFinite(payload.heightCm) ||
          payload.heightCm <= 0 ||
          !payload.anacCode
        ) {
          showToast({ variant: "warning", message: "Preencha os dados do aluno para criar a conta." });
          return;
        }

        const { error, anacSyncPending } = await signUp(email.trim(), password, payload);
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
        if (anacSyncPending) {
          showToast({ variant: "warning", message: "Conta criada. Consulta ANAC pendente." });
        } else {
          showToast({ variant: "success", message: "Conta criada e dados ANAC importados." });
        }
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
      {mode === "signup" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-slate-500 sm:col-span-2">
            Nome completo
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            CPF
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Telefone / WhatsApp
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Data de nascimento
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Código ANAC
            <input
              type="text"
              value={anacCode}
              onChange={(e) => setAnacCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Peso (kg)
            <input
              type="number"
              min={1}
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Altura (cm)
            <input
              type="number"
              min={1}
              step="0.1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      ) : null}
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
