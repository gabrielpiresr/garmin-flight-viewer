import { createEmptyRichContent, richContentToPlainText } from "./maneuverContent";
import { legacyPlainTextToRichDoc } from "./richContentFields";
import type { FlightScheduleRules } from "../types/schoolRules";
import type { ManeuverRichContent } from "../types/maneuver";
import type { ScheduleFaqItem } from "../types/scheduleStudentHelp";

export const SCHEDULE_SYSTEM_FAQ_IDS = [
  "how-it-works",
  "how-to-book",
  "how-to-view",
  "intentions-mode",
  "flight-duration",
  "booking-window",
  "weekly-limits",
  "credits",
  "night-flights",
  "cancellation",
  "status-colors",
  "views",
] as const;

export type ScheduleSystemFaqId = (typeof SCHEDULE_SYSTEM_FAQ_IDS)[number];

const DAY_LABELS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function formatHours(h: number): string {
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1).replace(".", ",")}h`;
}

function nightStartLabel(hour: number): string {
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function richFromLines(lines: string[]): ManeuverRichContent {
  return legacyPlainTextToRichDoc(lines.join("\n\n"));
}

function hasWeeklyLimits(rules: FlightScheduleRules): boolean {
  return Boolean(
    rules.weekdayMaxFlightsPerDay ||
      rules.weekendMaxFlightsPerDay ||
      rules.weeklyMaxFlights ||
      rules.weeklyMaxFlightHours ||
      rules.weekendMaxFlights ||
      rules.weekendMaxFlightHours,
  );
}

function hasCancellationPenalties(rules: FlightScheduleRules): boolean {
  return (
    rules.cancellationPenalty48hPct > 0 ||
    rules.cancellationPenalty24hPct > 0 ||
    rules.cancellationPenalty12hPct > 0 ||
    rules.cancellationPenalty1hPct > 0
  );
}

export function systemFaqAppliesToMode(id: ScheduleSystemFaqId, mode: FlightScheduleRules["mode"]): boolean {
  switch (id) {
    case "how-it-works":
      return true;
    case "how-to-book":
      return mode === "booking";
    case "how-to-view":
      return mode === "view";
    case "intentions-mode":
      return mode === "intentions";
    case "flight-duration":
    case "booking-window":
    case "weekly-limits":
    case "credits":
    case "night-flights":
    case "cancellation":
    case "status-colors":
    case "views":
      return mode === "booking" || mode === "view";
    default:
      return false;
  }
}

export function systemFaqIsRelevant(id: ScheduleSystemFaqId, rules: FlightScheduleRules): boolean {
  if (!systemFaqAppliesToMode(id, rules.mode)) return false;
  switch (id) {
    case "booking-window":
      return rules.mode === "booking";
    case "weekly-limits":
      return hasWeeklyLimits(rules);
    case "credits":
      return rules.requireCreditsForBooking || rules.allowZeroCreditOneHour;
    case "night-flights":
      return rules.allowNightFlights;
    case "cancellation":
      return hasCancellationPenalties(rules);
    default:
      return true;
  }
}

export function buildSystemFaqTitle(id: ScheduleSystemFaqId): string {
  const titles: Record<ScheduleSystemFaqId, string> = {
    "how-it-works": "Como funciona a escala?",
    "how-to-book": "Como marco um voo?",
    "how-to-view": "Posso só ver a escala?",
    "intentions-mode": "Como funciona o planejamento semanal?",
    "flight-duration": "Quanto tempo de voo posso pedir?",
    "booking-window": "Com quanta antecedência marco?",
    "weekly-limits": "Quantos voos posso ter?",
    credits: "Preciso de créditos?",
    "night-flights": "Posso voar à noite?",
    cancellation: "Como cancelo? Tem multa?",
    "status-colors": "O que significam as cores?",
    views: "Como usar Semanal, Diária e Lista?",
  };
  return titles[id];
}

export function buildSystemFaqAnswer(id: ScheduleSystemFaqId, rules: FlightScheduleRules): ManeuverRichContent {
  const mode = rules.mode;

  switch (id) {
    case "how-it-works": {
      if (mode === "booking") {
        return richFromLines([
          "A escala mostra os voos da semana. Você pode ver horários livres e solicitar um voo.",
          "Seu pedido fica pendente até a escola confirmar. Enquanto isso, aparece em laranja na agenda.",
        ]);
      }
      if (mode === "view") {
        return richFromLines([
          "A escala está aberta só para consulta. Você vê os voos agendados, mas não marca novos horários por aqui.",
          "Se precisar voar, fale com a coordenação ou use o canal que a escola indicar.",
        ]);
      }
      if (mode === "intentions") {
        return richFromLines([
          "Neste modo você envia suas intenções de voo da semana (dias e turnos disponíveis).",
          "A escola monta a escala com base nisso. Enviar intenção não garante o horário — é um pedido de disponibilidade.",
        ]);
      }
      return richFromLines(["A escala está fechada no momento. Volte mais tarde ou fale com a coordenação."]);
    }
    case "how-to-book":
      return richFromLines([
        "1. Toque em + Solicitar voo ou clique em um horário livre na agenda.",
        `2. Escolha a aeronave, a data e o horário. Os horários disponíveis seguem intervalos de ${rules.slotMinutes} minutos, a partir das ${rules.scheduleStartTime}.`,
        `3. Escolha a duração do voo (entre ${formatHours(rules.weekdayMinHours)} e ${formatHours(rules.weekdayMaxHours)} em dia de semana; fim de semana: ${formatHours(rules.weekendMinHours)} a ${formatHours(rules.weekendMaxHours)}).`,
        "4. Confirme o pedido. A escola analisa e confirma depois.",
      ]);
    case "how-to-view":
      return richFromLines([
        "Use as abas Semanal, Diária ou Lista para navegar.",
        "Voos em cinza são de outras pessoas. Os seus aparecem coloridos conforme o status.",
        "Você não consegue marcar ou alterar voos neste modo.",
      ]);
    case "intentions-mode":
      return richFromLines([
        "1. Escolha a semana aberta para planejamento.",
        "2. Adicione quantos voos deseja e informe duração e prioridade.",
        "3. Marque na grade os dias e turnos (manhã/tarde) em que você pode voar.",
        "4. Envie o planejamento. A escola usa essas informações para montar a escala final.",
      ]);
    case "flight-duration":
      return richFromLines([
        `Em dia de semana (segunda a sexta): de ${formatHours(rules.weekdayMinHours)} a ${formatHours(rules.weekdayMaxHours)} por voo.`,
        `No fim de semana (sábado e domingo): de ${formatHours(rules.weekendMinHours)} a ${formatHours(rules.weekendMaxHours)} por voo.`,
        "A duração é o tempo de voo (do acionamento ao corte), sem contar briefing e debriefing.",
      ]);
    case "booking-window": {
      const lines = [];
      if (rules.minBookingLeadDays > 0) {
        lines.push(`Você só pode marcar voos com pelo menos ${rules.minBookingLeadDays} dia(s) de antecedência.`);
      } else {
        lines.push("Você pode marcar voos para o mesmo dia, se houver horário livre.");
      }
      if (rules.maxBookingLeadDays < 365) {
        lines.push(`O agendamento é permitido até ${rules.maxBookingLeadDays} dias no futuro.`);
      }
      return richFromLines(lines.length ? lines : ["Não há restrição especial de antecedência configurada."]);
    }
    case "weekly-limits": {
      const lines: string[] = [];
      if (rules.weekdayMaxFlightsPerDay) {
        lines.push(`Máximo de ${rules.weekdayMaxFlightsPerDay} voo(s) por dia de semana.`);
      }
      if (rules.weekendMaxFlightsPerDay) {
        lines.push(`Máximo de ${rules.weekendMaxFlightsPerDay} voo(s) por dia no fim de semana.`);
      }
      if (rules.weeklyMaxFlights) {
        lines.push(`Máximo de ${rules.weeklyMaxFlights} voo(s) na mesma semana.`);
      }
      if (rules.weeklyMaxFlightHours) {
        lines.push(`Máximo de ${formatHours(rules.weeklyMaxFlightHours)} de voo na mesma semana.`);
      }
      if (rules.weekendMaxFlights) {
        lines.push(`Máximo de ${rules.weekendMaxFlights} voo(s) no sábado + domingo juntos.`);
      }
      if (rules.weekendMaxFlightHours) {
        lines.push(`Máximo de ${formatHours(rules.weekendMaxFlightHours)} de voo no fim de semana.`);
      }
      return richFromLines(lines.length ? lines : ["Não há limite de quantidade ou horas configurado para alunos."]);
    }
    case "credits": {
      const lines: string[] = [];
      if (rules.requireCreditsForBooking) {
        lines.push("Sim — você precisa ter créditos (horas) suficientes no modelo da aeronave para marcar o voo.");
        lines.push("O sistema desconta horas já agendadas e já voadas do seu saldo.");
      } else {
        lines.push("Não é obrigatório ter créditos para marcar, mas a escola pode cobrar depois conforme a política interna.");
      }
      if (rules.allowZeroCreditOneHour) {
        lines.push("Exceção: com saldo entre 0 e -0,5h você ainda pode marcar um voo de até 1 hora, desde que repõe os créditos antes do voo.");
      }
      return richFromLines(lines);
    }
    case "night-flights": {
      const start = nightStartLabel(rules.nightFlightStartHour);
      const days =
        rules.nightBookingWeekdays.length > 0
          ? rules.nightBookingWeekdays.map((d) => DAY_LABELS[d]).join(", ")
          : "todos os dias permitidos";
      return richFromLines([
        `Sim — voos noturnos são permitidos a partir das ${start}.`,
        `Dias em que você pode marcar voo noturno: ${days}.`,
        "Na agenda, horários noturnos podem aparecer com tom mais escuro.",
      ]);
    }
    case "cancellation": {
      const lines = [
        "Para cancelar, abra o seu voo na agenda e use a opção de cancelamento. Informe o motivo quando pedido.",
        "Multas conforme a antecedência do cancelamento:",
      ];
      if (rules.cancellationPenalty48hPct > 0) {
        lines.push(`Entre 24h e 48h antes: ${rules.cancellationPenalty48hPct}% do tempo de voo.`);
      }
      if (rules.cancellationPenalty24hPct > 0) {
        lines.push(`Entre 12h e 24h antes: ${rules.cancellationPenalty24hPct}% do tempo de voo.`);
      }
      if (rules.cancellationPenalty12hPct > 0) {
        lines.push(`Entre 1h e 12h antes: ${rules.cancellationPenalty12hPct}% do tempo de voo.`);
      }
      if (rules.cancellationPenalty1hPct > 0) {
        lines.push(`Menos de 1h antes: ${rules.cancellationPenalty1hPct}% do tempo de voo.`);
      }
      if (rules.autoDebitCancellationPenalty) {
        lines.push("A multa é descontada automaticamente dos seus créditos ao cancelar.");
      }
      return richFromLines(lines);
    }
    case "status-colors":
      return richFromLines([
        "Laranja — pendente: você pediu, a escola ainda não confirmou.",
        "Azul — previsto: voo na agenda, aguardando confirmação final.",
        "Verde — confirmado: pode comparecer no horário.",
        "Vermelho — cancelado.",
        "Cinza — ocupado por outra pessoa (você não pode marcar nesse horário).",
      ]);
    case "views":
      return richFromLines([
        "Semanal — visão da semana inteira em grade (no celular essa opção fica oculta; use Diária).",
        "Diária — um dia por vez, com colunas por aeronave. Ideal no celular.",
        "Lista — todos os seus voos em lista, com datas e status.",
        "Use Somente meus voos para esconder os horários dos colegas e ver só o que é seu.",
      ]);
    default:
      return createEmptyRichContent();
  }
}

export function resolveSystemFaqTitle(id: ScheduleSystemFaqId, overrides: Record<string, string> = {}): string {
  const custom = overrides[id]?.trim();
  return custom || buildSystemFaqTitle(id);
}

export function buildSystemFaqItems(
  rules: FlightScheduleRules,
  systemFaqEnabled: Record<string, boolean>,
  systemFaqTitles: Record<string, string> = {},
): ScheduleFaqItem[] {
  return SCHEDULE_SYSTEM_FAQ_IDS.filter((id) => {
    if (systemFaqEnabled[id] === false) return false;
    return systemFaqIsRelevant(id, rules);
  }).map((id) => {
    const answerJson = buildSystemFaqAnswer(id, rules);
    return {
      id,
      title: resolveSystemFaqTitle(id, systemFaqTitles),
      answerJson,
      source: "system" as const,
      plainText: richContentToPlainText(answerJson),
    };
  });
}

export function buildAllSystemFaqPreviews(
  rules: FlightScheduleRules,
  systemFaqTitles: Record<string, string> = {},
): Array<{
  id: ScheduleSystemFaqId;
  defaultTitle: string;
  title: string;
  plainText: string;
  appliesToMode: boolean;
  relevant: boolean;
}> {
  return SCHEDULE_SYSTEM_FAQ_IDS.map((id) => {
    const answerJson = buildSystemFaqAnswer(id, rules);
    const defaultTitle = buildSystemFaqTitle(id);
    return {
      id,
      defaultTitle,
      title: resolveSystemFaqTitle(id, systemFaqTitles),
      plainText: richContentToPlainText(answerJson),
      appliesToMode: systemFaqAppliesToMode(id, rules.mode),
      relevant: systemFaqIsRelevant(id, rules),
    };
  });
}
