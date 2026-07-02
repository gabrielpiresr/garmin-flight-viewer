import type { ReactNode } from "react";
import { useState } from "react";

const HELPER_RELEASE_URL = "https://github.com/gabrielpiresr/garmin-flight-viewer/releases/tag/helper";
const HELPER_DOWNLOAD_URL =
  "https://sfo.cloud.appwrite.io/v1/storage/buckets/video-helper-releases/files/6a468b4700085150e797/download?project=6a01ac8a0009fbf94f05";
const HELPER_HEALTH_URL = "http://127.0.0.1:7842/health";
const HELPER_MIN_VERSION = "1.3.3";
const HELPER_RECOMMENDED_VERSION = "1.3.4";

type HelperTestStatus = "idle" | "checking" | "online" | "outdated" | "offline";

type HelperHealth = {
  ok?: boolean;
  version?: string;
};

function parseVersionParts(value: string): number[] {
  return String(value || "0")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isVersionAtLeast(current: string, minimum: string): boolean {
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

export function VideoHelperSetupPage() {
  const [testStatus, setTestStatus] = useState<HelperTestStatus>("idle");
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);

  async function testHelper() {
    setTestStatus("checking");
    setDetectedVersion(null);
    try {
      const res = await fetch(HELPER_HEALTH_URL, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) {
        setTestStatus("offline");
        return;
      }
      const body = await res.json() as HelperHealth;
      const version = body.version?.trim() || null;
      setDetectedVersion(version);
      if (!version || !isVersionAtLeast(version, HELPER_MIN_VERSION)) {
        setTestStatus("outdated");
        return;
      }
      setTestStatus("online");
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
            O sistema usa um aplicativo local para enviar vídeos, concatenar gravações e gerar downloads com corte e instrumentos. A versão mínima necessária é a <strong>{HELPER_MIN_VERSION}</strong>.
          </p>
          <p className="mt-2 text-xs text-slate-500">Versão recomendada: {HELPER_RECOMMENDED_VERSION}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={HELPER_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Baixar instalador {HELPER_RECOMMENDED_VERSION} para Windows
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
            <HelperTestResult status={testStatus} detectedVersion={detectedVersion} />
          )}
        </section>

        <section className="mt-6 rounded-lg border border-sky-500/25 bg-sky-950/20 p-4 text-sm text-sky-100">
          <p className="font-semibold">Novidades da versão {HELPER_RECOMMENDED_VERSION}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-100/90">
            <li>Download com corte agora mostra o progresso enquanto baixa o vídeo original (antes ficava parado em 2%).</li>
            <li>Suporte a vídeos grandes (vários GB) no download com corte, sem estourar a memória.</li>
            <li>Upload de vários vídeos sem concatenar localmente (modo “concatenar só no player”).</li>
          </ul>
        </section>

        <section className="mt-6 space-y-4">
          <Step number="1" title="Baixe o instalador mais recente">
            <p>
              Baixe o <strong>Flight Video Helper {HELPER_RECOMMENDED_VERSION}</strong>. Se você já tinha uma versão antiga instalada, reinstale por cima ou desinstale antes para garantir a atualização.
            </p>
            <a
              href={HELPER_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Baixar instalador {HELPER_RECOMMENDED_VERSION} para Windows
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
              Depois da instalação, abra o <strong>Flight Video Helper</strong> pelo atalho da área de trabalho ou pelo menu iniciar. A janela deve indicar que a ferramenta está rodando na porta <strong>7842</strong>.
            </p>
          </Step>

          <Step number="4" title="Confirme a versão">
            <p>
              Clique em <strong>Testar se está rodando</strong> nesta página. O sistema precisa detectar a versão <strong>{HELPER_MIN_VERSION}</strong> ou superior. Se aparecer versão antiga (por exemplo 1.3.2), feche o helper, reinstale e teste novamente.
            </p>
          </Step>

          <Step number="5" title="Volte ao sistema">
            <p>
              No voo, use a aba <strong>Vídeos</strong>. Para enviar várias partes sem juntar no computador, escolha <strong>Concatenar só no player</strong>. Para baixar com corte e instrumentos, clique em <strong>Baixar</strong> e escolha a opção com overlay.
            </p>
          </Step>

          <Step number="6" title="Libere o helper no navegador">
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
            Essa ferramenta funciona apenas em computador. Celular e tablet podem assistir e baixar os arquivos, mas não conseguem gerar o vídeo com corte e instrumentos.
          </p>
          <p className="mt-2 text-amber-200/85">
            Se o upload em “concatenar só no player” retornar erro de rota ou job não encontrado, quase sempre é helper desatualizado. Reinstale a versão {HELPER_RECOMMENDED_VERSION}.
          </p>
        </section>
      </div>
    </main>
  );
}

function HelperTestResult({
  status,
  detectedVersion,
}: {
  status: HelperTestStatus;
  detectedVersion: string | null;
}) {
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
        Tudo certo. O Flight Video Helper {detectedVersion} está rodando e pronto para upload e edição de vídeos.
      </div>
    );
  }

  if (status === "outdated") {
    return (
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        <p>
          O helper está rodando, mas a versão detectada{detectedVersion ? ` (${detectedVersion})` : ""} é antiga. Instale a versão {HELPER_RECOMMENDED_VERSION} para usar upload sem concatenação local.
        </p>
        <a
          href={HELPER_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/30"
        >
          Baixar instalador {HELPER_RECOMMENDED_VERSION}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
      Não consegui encontrar o helper rodando neste computador. Baixe e abra o Flight Video Helper {HELPER_RECOMMENDED_VERSION}, depois teste novamente.
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
