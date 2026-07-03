import { legacyPlainTextToRichDoc } from "./richContentFields";
import type { ScheduleOnboardingStep, ScheduleStudentHelpConfig } from "../types/scheduleStudentHelp";
import { SCHEDULE_SYSTEM_FAQ_IDS } from "./scheduleSystemFaqs";

type ScheduleMode = "booking" | "view" | "closed" | "intentions";

function step(id: string, title: string, body: string, sortOrder: number): ScheduleOnboardingStep {
  return {
    id,
    title,
    descriptionJson: legacyPlainTextToRichDoc(body),
    sortOrder,
  };
}

export function defaultOnboardingStepsForMode(mode: ScheduleMode): ScheduleOnboardingStep[] {
  if (mode === "intentions") {
    return [
      step(
        "welcome",
        "Bem-vindo ao planejamento semanal",
        "Aqui você informa quando pode voar e quantas horas deseja na semana. A escola usa essas informações para montar a escala.",
        0,
      ),
      step(
        "how-intentions",
        "Como informar suas intenções",
        "1. Escolha a semana aberta.\n2. Para cada voo desejado, defina duração, prioridade e dias/turnos em que você está disponível.\n3. Toque nas células da grade para marcar disponível ou preferencial.\n4. Envie o planejamento antes do prazo da escola.",
        1,
      ),
      step(
        "after-submit",
        "Depois de enviar",
        "Sua intenção não é um voo confirmado. A coordenação monta a escala e você acompanha o resultado na aba Meus voos ou na escala, quando for publicada.",
        2,
      ),
    ];
  }

  return [
    step(
      "welcome",
      "Bem-vindo à sua escala",
      "Esta é a agenda de voos da escola. Você vê os horários da semana, os voos dos colegas (em cinza) e os seus (coloridos).",
      0,
    ),
    step(
      "how-book",
      "Como marcar um voo",
      "1. Toque em + Marcar voo ou em um horário livre na agenda.\n2. Escolha a aeronave, a data e o horário de acionamento.\n3. Defina a duração do voo e confirme.\n4. Seu pedido fica pendente até a escola confirmar.",
      1,
    ),
    step(
      "colors",
      "Entenda as cores",
      "Laranja = pendente (aguardando confirmação).\nAzul = previsto.\nVerde = confirmado.\nVermelho = cancelado.\nCinza = horário ocupado por outra pessoa.",
      2,
    ),
    step(
      "confirm-cancel",
      "Confirmação e cancelamento",
      "A escola costuma confirmar voos entre 48h e 12h antes do horário. Se precisar cancelar, faça o quanto antes — cancelamentos em cima da hora podem gerar multa nos seus créditos.",
      3,
    ),
  ];
}

export function defaultScheduleStudentHelp(mode: ScheduleMode = "booking"): ScheduleStudentHelpConfig {
  return {
    onboardingEnabled: true,
    onboardingSteps: defaultOnboardingStepsForMode(mode),
    customFaqs: [],
    systemFaqEnabled: Object.fromEntries(SCHEDULE_SYSTEM_FAQ_IDS.map((id) => [id, true])),
    systemFaqTitles: {},
  };
}
