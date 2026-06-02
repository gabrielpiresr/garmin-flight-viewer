import { useAuth } from "../contexts/AuthContext";

export function PendingApprovalScreen() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-xl">
        {/* Ícone */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
            <path
              fillRule="evenodd"
              d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <h1 className="mb-3 text-xl font-semibold text-slate-100">Conta aguardando aprovação</h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Sua conta foi criada com sucesso! Em breve nossa equipe analisará seu cadastro e você receberá um contato para
          prosseguir com a matrícula.
        </p>

        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left">
          <p className="text-xs text-amber-300/80">
            <span className="font-medium text-amber-300">Próximos passos:</span> Você pode receber um link de
            qualificação por e-mail ou WhatsApp para preencher informações adicionais antes da liberação do acesso.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 py-2.5 text-sm text-slate-300 transition hover:bg-slate-700"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
