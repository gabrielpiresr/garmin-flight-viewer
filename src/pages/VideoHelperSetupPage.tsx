import type { ReactNode } from "react";
import { useState } from "react";

const HELPER_RELEASE_URL = "https://github.com/gabrielpiresr/garmin-flight-viewer/releases/tag/helper";
const HELPER_DOWNLOAD_URL =
  "https://sfo.cloud.appwrite.io/v1/storage/buckets/video-helper-releases/files/6a240bd4002ae09dab64/download?project=6a01ac8a0009fbf94f05";
const HELPER_HEALTH_URL = "http://127.0.0.1:7842/health";

type HelperTestStatus = "idle" | "checking" | "online" | "offline";

export function VideoHelperSetupPage() {
  const [testStatus, setTestStatus] = useState<HelperTestStatus>("idle");

  async function testHelper() {
    setTestStatus("checking");
    try {
      const res = await fetch(HELPER_HEALTH_URL, { signal: AbortSignal.timeout(2500) });
      setTestStatus(res.ok ? "online" : "offline");
    } catch {
      setTestStatus("offline");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm text-sky-300 underline-offset-4 hover:underline">
          Voltar para o sistema
        </a>

        <section className="mt-8 border-b border-slate-800 pb-6">
          <p className="text-sm font-medium text-sky-300">Ferramenta de edição de vídeo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">
            Configurar o Flight Video Helper
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            O download com corte e instrumentos precisa de um aplicativo rodando no computador. Ele processa o vídeo localmente e entrega o arquivo pronto ao sistema.
          </p>
          <p className="mt-2 text-xs text-slate-500">Versão atual: 1.3.0</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={HELPER_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Baixar instalador para Windows
            </a>
            <button
              type="button"
              onClick={() => void testHelper()}
              className="inline-flex rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Testar se está rodando
            </button>
          </div>
          {testStatus !== "idle" && (
            <HelperTestResult status={testStatus} />
          )}
        </section>

        <section className="mt-6 space-y-4">
          <Step number="1" title="Baixe o instalador">
            <p>
              Acesse a página de download e baixe a versão mais recente do <strong>Flight Video Helper</strong> para seu sistema.
            </p>
            <a
              href={HELPER_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Baixar instalador para Windows
            </a>
            <a
              href={HELPER_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3 mt-3 inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Ver outras opções
            </a>
          </Step>

          <Step number="2" title="Execute o instalador">
            <p>
              Abra o arquivo baixado, confirme a instalação e mantenha a opção de atalho habilitada. No Windows, se aparecer um aviso de segurança, escolha <strong>Mais informações</strong> e depois <strong>Executar assim mesmo</strong>.
            </p>
          </Step>

          <Step number="3" title="Abra o helper">
            <p>
              Depois da instalação, abra o <strong>Flight Video Helper</strong> pelo atalho da área de trabalho ou pelo menu iniciar. Uma janela ficará aberta indicando que a ferramenta está rodando.
            </p>
          </Step>

          <Step number="4" title="Volte ao sistema">
            <p>
              Retorne ao vídeo, clique em <strong>Baixar</strong> e escolha <strong>Vídeo com corte e instrumentos</strong>. Se a mensagem continuar aparecendo, clique em <strong>Verificar novamente</strong>.
            </p>
          </Step>

          <Step number="5" title="Libere o helper no navegador">
            <p>
              Se o helper estiver aberto, mas o sistema ainda não conseguir conectar, clique no ícone de controles/ferramentas no lado esquerdo da barra de endereço do navegador. Ative a permissão para <strong>permitir apps no dispositivo</strong> ou <strong>acesso à rede local</strong>, depois recarregue a página e teste novamente.
            </p>
            <p className="mt-2">
              No Chrome, também é possível abrir <strong>chrome://settings/content/localNetworkAccess</strong>, adicionar o endereço do sistema e permitir o acesso local.
            </p>
          </Step>
        </section>

        <section className="mt-6 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          <p className="font-semibold">Importante</p>
          <p className="mt-1 text-amber-200/85">
            Essa ferramenta funciona apenas em computador. Celular e tablet podem baixar o vídeo completo, mas não conseguem gerar o arquivo com corte e instrumentos.
          </p>
        </section>
      </div>
    </main>
  );
}

function HelperTestResult({ status }: { status: HelperTestStatus }) {
  if (status === "checking") {
    return (
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
        Verificando a ferramenta neste computador...
      </div>
    );
  }

  if (status === "online") {
    return (
      <div className="mt-4 rounded-lg border border-green-500/30 bg-green-950/20 px-4 py-3 text-sm text-green-200">
        Tudo certo. O Flight Video Helper está rodando e pronto para gerar vídeos com corte e instrumentos.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
      Não consegui encontrar o helper rodando neste computador. Abra o Flight Video Helper e teste novamente.
    </div>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sm font-semibold text-sky-200">
          {number}
        </div>
        <div className="min-w-0 text-sm leading-6 text-slate-300">
          <h2 className="mb-1 text-base font-semibold text-white">{title}</h2>
          {children}
        </div>
      </div>
    </article>
  );
}
