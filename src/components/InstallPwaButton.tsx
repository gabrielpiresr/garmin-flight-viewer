import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallPwaButton({ className = "" }: { className?: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (installed) return;
    if (!installPrompt) {
      setShowInstructions((current) => !current);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={installed}
        onClick={() => void handleInstall()}
        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
      >
        {installed ? "Aplicativo instalado" : "Instalar aplicativo"}
      </button>
      {showInstructions && !installed ? (
        <div className="mt-2 max-w-sm rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
          Se o navegador nao abrir o instalador automatico, use o menu do navegador e escolha Adicionar a tela inicial ou Instalar app.
        </div>
      ) : null}
    </div>
  );
}
