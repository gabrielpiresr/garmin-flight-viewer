import type { ReactNode } from "react";
import type { StudentTabKey } from "../types/rolePermissions";
import { useFlightReviewClub } from "../contexts/FlightReviewClubContext";

const DEFAULT_SUBTITLE = "Acesse análises detalhadas, vídeos e telemetria completos dos seus voos.";

const FEATURE_SUBTITLES: Record<string, string> = {
  telemetria: "Acesse gráficos, mapa e o resumo completo da telemetria deste voo.",
  "rota-3d": "Visualize a trajetória 3D do voo, com relevo, linha de rota e timeline.",
  videos: "Assista aos vídeos gravados neste voo, sincronizados com a telemetria.",
  fotos: "Veja as fotos deste voo e o registro visual da missão.",
  "flight-review": "Revise manobras, notas e o debriefing completo deste voo.",
  figurinhas: "Gere figurinhas e cards do voo para compartilhar nos stories.",
  home: "Acompanhe o painel do aluno com agenda, último voo e comunicados.",
  jornada: "Acompanhe evolução, recordes e badges na jornada de treinamento.",
  "meus-voos": "Abra o histórico completo dos seus voos, fichas e telemetria.",
  agendamento: "Reserve voos com a antecedência exclusiva do Flight Review Club.",
  schedule: "Consulte a escala e o calendário com os benefícios do Club.",
  creditos: "Acompanhe saldo, extrato e compra de horas de voo.",
  avisos: "Leia os comunicados oficiais da escola em tempo real.",
  manuais: "Acesse manuais e documentos de estudo da escola.",
  "treinamento-frc": "Abra cursos, aulas em vídeo e e-books exclusivos para integrantes do Flight Review Club.",
  manobras: "Estude o material de manobras com guias e referências da escola.",
  provas: "Faça as provas liberadas e acompanhe seus resultados.",
  "fpl-sim": "Treine o preenchimento do plano de voo (FPL) no simulador.",
  painel: "Explore os instrumentos interativos do painel da aeronave.",
  perfil: "Consulte e atualize seus dados cadastrais e ANAC.",
  ajuda: "Abra a central de ajuda com tutoriais e suporte da escola.",
  dre: "Consulte o extrato financeiro da sua conta.",
  fuelings: "Acompanhe os registros de abastecimento.",
  contratos: "Veja e assine os contratos da sua formação.",
  "indique-ganhe": "Indique amigos e acompanhe as recompensas do programa.",
  aisweb: "Consulte METAR, TAF e NOTAMs da meteorologia aeronáutica.",
  planejamento: "Planeje rotas, briefing e mapa de navegação.",
  whatsapp: "Receba avisos, METAR e comandos pelo WhatsApp da escola.",
  endossos: "Acesse os arquivos de endosso para voo solo.",
  album: "Veja o álbum de fotos e vídeos dos seus voos.",
  marketplace: "Compre na loja da escola com descontos exclusivos do Club.",
};

export type FlightReviewClubGateFeature = StudentTabKey | "telemetria" | "rota-3d" | "videos" | "fotos" | "flight-review" | "figurinhas";

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path
        fillRule="evenodd"
        d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FlightReviewClubGate({
  children,
  feature,
  subtitle,
}: {
  children?: ReactNode;
  feature?: FlightReviewClubGateFeature;
  subtitle?: string;
}) {
  const { lpUrl } = useFlightReviewClub();
  const resolvedSubtitle = subtitle ?? (feature ? FEATURE_SUBTITLES[feature] : null) ?? DEFAULT_SUBTITLE;

  function handleSubscribe() {
    window.location.href = lpUrl;
  }

  const lockBody = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
        <LockIcon />
      </div>
      <div>
        <h3 className="text-base font-black text-white">Disponível no Flight Review Club</h3>
        <p className="mt-1 text-sm text-slate-400">{resolvedSubtitle}</p>
      </div>
      <button
        type="button"
        onClick={handleSubscribe}
        className="rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-300"
      >
        Assinar agora
      </button>
    </>
  );

  if (!children) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-xl border border-slate-800/60 bg-slate-950/60 px-6 py-10 text-center">
        {lockBody}
      </div>
    );
  }

  return (
    <div className="relative min-h-[280px]">
      <div aria-hidden="true" className="pointer-events-none select-none scale-[1.01] opacity-70 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl bg-slate-950/55 px-6 py-10 text-center backdrop-blur-[1px]">
        {lockBody}
      </div>
    </div>
  );
}
