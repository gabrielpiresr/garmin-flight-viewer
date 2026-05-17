import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/ui/ToastProvider";
import { getCachedBrandSettings } from "../lib/notificationsDb";

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type SignupForm = {
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  weightKg: string;
  heightCm: string;
  anacCode: string;
};

const EMPTY_SIGNUP_FORM: SignupForm = {
  fullName: "",
  cpf: "",
  phone: "",
  birthDate: "",
  weightKg: "",
  heightCm: "",
  anacCode: "",
};

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const brand = getCachedBrandSettings();
  const schoolName = brand?.schoolName || "";
  const logoUrl = brand?.logoUrl || "";
  const [signup, setSignup] = useState<SignupForm>(EMPTY_SIGNUP_FORM);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const trimmedEmail = email.trim();
      if (mode === "signin") {
        const { error } = await signIn(trimmedEmail, password);
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
      } else {
        const cpfDigits = onlyDigits(signup.cpf);
        const phoneDigits = onlyDigits(signup.phone);
        const weightKg = Number(signup.weightKg.replace(",", "."));
        const heightCm = Number(signup.heightCm.replace(",", "."));
        const anacCode = onlyDigits(signup.anacCode);

        if (
          !signup.fullName.trim() ||
          cpfDigits.length !== 11 ||
          phoneDigits.length < 10 ||
          !signup.birthDate ||
          !Number.isFinite(weightKg) ||
          weightKg <= 0 ||
          !Number.isFinite(heightCm) ||
          heightCm <= 0 ||
          !anacCode
        ) {
          showToast({ variant: "warning", message: "Preencha todos os dados do cadastro corretamente antes de continuar." });
          return;
        }

        const { error, anacSyncPending } = await signUp(trimmedEmail, password, {
          fullName: signup.fullName.trim(),
          cpf: cpfDigits,
          phone: phoneDigits,
          birthDate: signup.birthDate,
          weightKg,
          heightCm,
          anacCode,
        });
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
        setSignup(EMPTY_SIGNUP_FORM);
        if (anacSyncPending) {
          showToast({ variant: "warning", message: "Conta criada. Consulta ANAC pendente, tentaremos sincronizar novamente em breve." });
        } else {
          showToast({
            variant: "success",
            message: "Conta criada. Se o projeto exigir confirmação por e-mail, abra o link recebido antes de entrar.",
          });
        }
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        <div className="text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || "Logo"} className="mx-auto mb-3 max-h-16 max-w-[180px] object-contain" />
          ) : null}
          {schoolName ? (
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--school-primary, #10b981)" }}>
              {schoolName}
            </h1>
          ) : (
            <div className="mx-auto h-8 w-32 rounded-lg bg-slate-800/60" />
          )}
          <p className="mt-2 text-sm text-slate-400">Acesse sua conta para continuar</p>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm sm:p-6">
          <div className="mb-5 flex gap-2">
            <button
              type="button"
              onClick={() => { setMode("signin"); }}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors text-slate-400 hover:text-white"
              style={mode === "signin" ? { background: "var(--school-primary, #0ea5e9)", color: "#fff" } : undefined}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); }}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors text-slate-400 hover:text-white"
              style={mode === "signup" ? { background: "var(--school-primary, #0ea5e9)", color: "#fff" } : undefined}
            >
              Criar conta
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              E-mail
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                placeholder="piloto@email.com"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Senha
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            {mode === "signup" ? (
              <>
                <label className="block text-xs text-slate-500">
                  Nome completo
                  <input
                    type="text"
                    autoComplete="name"
                    value={signup.fullName}
                    onChange={(e) => setSignup((prev) => ({ ...prev, fullName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="Nome e sobrenome"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  CPF
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={signup.cpf}
                    onChange={(e) =>
                      setSignup((prev) => ({
                        ...prev,
                        cpf: formatCpf(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="000.000.000-00"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Telefone / WhatsApp
                  <input
                    type="text"
                    inputMode="tel"
                    autoComplete="tel"
                    value={signup.phone}
                    onChange={(e) =>
                      setSignup((prev) => ({
                        ...prev,
                        phone: formatPhone(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="(11) 99999-9999"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Data de nascimento
                  <input
                    type="date"
                    autoComplete="bday"
                    value={signup.birthDate}
                    onChange={(e) => setSignup((prev) => ({ ...prev, birthDate: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Peso (kg)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.1"
                    value={signup.weightKg}
                    onChange={(e) => setSignup((prev) => ({ ...prev, weightKg: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="75.5"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Altura (cm)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.1"
                    value={signup.heightCm}
                    onChange={(e) => setSignup((prev) => ({ ...prev, heightCm: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="178"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Código ANAC
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={signup.anacCode}
                    onChange={(e) =>
                      setSignup((prev) => ({
                        ...prev,
                        anacCode: onlyDigits(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="Ex.: 264933"
                  />
                </label>
              </>
            ) : null}
          </div>

          <button
            type="button"
            disabled={busy || !email || password.length < 6}
            onClick={() => void submit()}
            className="mt-5 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 school-primary-button"
          >
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Registrar"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600">
          Uso educacional. Valide sempre com as fontes oficiais.
        </p>
      </div>
    </div>
  );
}
