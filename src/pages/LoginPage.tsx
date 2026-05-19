import { useEffect, useMemo, useState } from "react";
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
  const { signIn, signUp, requestPasswordReset, completePasswordReset } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const brand = getCachedBrandSettings();
  const schoolName = brand?.schoolName || "";
  const logoUrl = brand?.logoUrl || "";
  const [signup, setSignup] = useState<SignupForm>(EMPTY_SIGNUP_FORM);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const recoveryParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      userId: params.get("userId") || "",
      secret: params.get("secret") || "",
      expires: params.get("expire") || params.get("expires") || "",
    };
  }, []);
  const isRecoveryLink = Boolean(recoveryParams.userId && recoveryParams.secret);

  useEffect(() => {
    if (isRecoveryLink) setMode("reset");
  }, [isRecoveryLink]);

  const clearRecoveryQuery = () => {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  };

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
      } else if (mode === "forgot") {
        if (!trimmedEmail) {
          showToast({ variant: "warning", message: "Informe seu e-mail para receber o link de redefinicao." });
          return;
        }
        const resetUrl = `${window.location.origin}${window.location.pathname}`;
        const { error } = await requestPasswordReset(trimmedEmail, resetUrl);
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
        showToast({ variant: "success", message: "Enviamos um link de redefinicao para o seu e-mail." });
        setMode("signin");
      } else if (mode === "reset") {
        if (!isRecoveryLink) {
          showToast({ variant: "error", message: "Link de redefinicao invalido ou incompleto." });
          return;
        }
        if (newPassword.length < 8) {
          showToast({ variant: "warning", message: "A nova senha deve ter pelo menos 8 caracteres." });
          return;
        }
        if (newPassword !== confirmPassword) {
          showToast({ variant: "warning", message: "As senhas informadas nao conferem." });
          return;
        }
        const { error } = await completePasswordReset(recoveryParams.userId, recoveryParams.secret, newPassword);
        if (error) {
          showToast({ variant: "error", message: error.message });
          return;
        }
        setNewPassword("");
        setConfirmPassword("");
        setPassword("");
        clearRecoveryQuery();
        showToast({ variant: "success", message: "Senha redefinida. Entre usando a nova senha." });
        setMode("signin");
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

  const primaryDisabled =
    busy ||
    (mode === "signin" && (!email || password.length < 6)) ||
    (mode === "signup" && (!email || password.length < 6)) ||
    (mode === "forgot" && !email.trim()) ||
    (mode === "reset" && (newPassword.length < 8 || confirmPassword.length < 8));

  const primaryLabel = busy
    ? "Aguarde..."
    : mode === "signin"
      ? "Entrar"
      : mode === "signup"
        ? "Registrar"
        : mode === "forgot"
          ? "Enviar link de redefinicao"
          : "Redefinir senha";

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
          {mode !== "reset" ? (
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
          ) : (
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Redefinir senha</h2>
              <p className="mt-1 text-sm text-slate-400">Informe uma nova senha para concluir a recuperacao da conta.</p>
            </div>
          )}

          <div className="space-y-3">
            {mode !== "reset" ? (
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
            ) : null}
            {mode === "reset" ? (
              <>
                <label className="block text-xs text-slate-500">
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="Minimo 8 caracteres"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Confirmar nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                    placeholder="Digite novamente"
                  />
                </label>
              </>
            ) : mode !== "forgot" ? (
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
                  placeholder="Minimo 8 caracteres"
                />
              </label>
            ) : (
              <p className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs leading-relaxed text-slate-400">
                Voce recebera um link valido por 1 hora. Abra o link no mesmo navegador para cadastrar uma nova senha.
              </p>
            )}

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
            disabled={primaryDisabled}
            onClick={() => void submit()}
            className="mt-5 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 school-primary-button"
          >
            {primaryLabel}
          </button>
          {mode === "signin" ? (
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="mt-3 w-full text-center text-xs font-medium text-slate-400 underline-offset-4 hover:text-white hover:underline"
            >
              Esqueci minha senha
            </button>
          ) : mode === "forgot" ? (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="mt-3 w-full text-center text-xs font-medium text-slate-400 underline-offset-4 hover:text-white hover:underline"
            >
              Voltar para o login
            </button>
          ) : null}
        </div>

        <p className="text-center text-xs text-slate-600">
          Uso educacional. Valide sempre com as fontes oficiais.
        </p>
      </div>
    </div>
  );
}
