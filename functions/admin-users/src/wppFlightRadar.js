"use strict";

const FLIGHT_RADAR_WATCH_HOURS = 24;

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatWppDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return cleanString(iso) || "—";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWppClock(iso = new Date().toISOString()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Parse text / button id for fleet radar watch commands.
 * Buttons: radar_start_24 | radar_reopen | radar_stop
 */
function parseWppFlightRadarWatchCommand(text, responseId = "") {
  const id = cleanString(responseId);
  if (id) {
    if (/^radar_(?:start_24|reopen)$/i.test(id)) return { action: "start", hours: FLIGHT_RADAR_WATCH_HOURS };
    if (/^radar_stop$/i.test(id)) return { action: "stop" };
    if (/^radar_help$/i.test(id)) return { action: "help" };
  }

  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (
    /^(?:parar|encerrar|cancelar)\s+(?:(?:os\s+)?avisos?(?:\s+da)?\s+)?(?:frota|radar)$/.test(normalized) ||
    normalized === "radar stop" ||
    normalized === "parar frota" ||
    normalized === "parar radar"
  ) {
    return { action: "stop" };
  }

  if (
    /^(?:acompanhar|monitorar|ouvir|avisos?(?:\s+de)?)\s+(?:frota|radar|decolagem|pouso)(?:\s+24\s*h(?:oras?)?)?$/.test(
      normalized,
    ) ||
    /^(?:radar|frota)(?:\s+24\s*h(?:oras?)?)?$/.test(normalized) ||
    normalized === "acompanhar frota" ||
    normalized === "avisos frota" ||
    normalized === "avisos de decolagem" ||
    normalized === "reabrir frota" ||
    normalized === "reabrir radar"
  ) {
    return { action: "start", hours: FLIGHT_RADAR_WATCH_HOURS };
  }

  if (normalized === "ajuda radar" || normalized === "radar ajuda" || normalized === "como radar") {
    return { action: "help" };
  }

  return null;
}

function formatWppFlightRadarWatchHelpMessage(nickname) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}posso avisar por WhatsApp quando a frota do Radar decolar ou pousar.`,
    "",
    "Envie *Acompanhar frota* para ativar por *24 horas*.",
    "Envie *Parar frota* para encerrar.",
    "",
    "Entre 22h e 06h (horário de Brasília) não consultamos o Flightradar24.",
  ].join("\n");
}

function formatWppFlightRadarWatchStartedMessage({ hours, expiresAt, nickname, trackedCount }) {
  const greet = nickname ? `${nickname}, ` : "";
  const until = formatWppDateTime(expiresAt);
  const fleet =
    Number.isFinite(Number(trackedCount)) && Number(trackedCount) > 0
      ? `${Number(trackedCount)} aeronave(s) da frota`
      : "a frota configurada no Radar";
  return [
    `${greet}acompanhamento da frota ativado por *${hours || FLIGHT_RADAR_WATCH_HOURS}h*.`,
    "",
    `Vou te avisar de decolagens e pousos de ${fleet} até *${until}*.`,
    "Quando a janela fechar, mando um aviso com botão para reabrir.",
    "",
    "Envie *Parar frota* se quiser encerrar antes.",
  ].join("\n");
}

function formatWppFlightRadarWatchStoppedMessage({ nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  return `${greet}parei o acompanhamento de decolagem/pouso da frota.`;
}

function formatWppFlightRadarWatchNotActiveMessage({ nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  return `${greet}você não tem acompanhamento da frota ativo agora. Envie *Acompanhar frota* para ativar por 24h.`;
}

function formatWppFlightRadarWatchExpiredMessage({ hours, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}a janela de avisos da frota (${hours || FLIGHT_RADAR_WATCH_HOURS}h) encerrou.`,
    "",
    "Toque em *Reabrir 24h* se quiser continuar recebendo decolagens e pousos.",
  ].join("\n");
}

function dash(value) {
  return cleanString(value) || "—";
}

function formatWppFlightRadarEventMessage(event) {
  const type = event?.type === "landing" ? "landing" : "takeoff";
  const title = type === "landing" ? "🛬 *Pouso*" : "🛫 *Decolagem*";
  const reg = cleanString(event?.reg) || "—";
  const callsign = cleanString(event?.callsign);
  const lines = [title, "", `*${reg}*${callsign && callsign !== reg ? ` · ${callsign}` : ""}`, ""];

  lines.push(`Aluno: ${dash(event?.studentName)}`);
  lines.push(`Instrutor: ${dash(event?.instructorName)}`);
  lines.push(`AD decolagem: ${dash(event?.takeoffAd)}`);

  if (type === "takeoff") {
    lines.push(`Obs.: ${dash(event?.notes)}`);
    lines.push(`Missão: ${dash(event?.mission)}`);
    lines.push(`Previsto: ${dash(event?.scheduledTakeoff)}`);
  } else {
    lines.push(`AD pouso: ${dash(event?.landingAd)}`);
    lines.push(`Duração: ${dash(event?.duration)}`);
    lines.push(`Previsto: ${dash(event?.scheduledLanding)}`);
  }

  lines.push(`Horário: ${formatWppClock(event?.at || new Date().toISOString())}`);
  return lines.join("\n");
}

module.exports = {
  FLIGHT_RADAR_WATCH_HOURS,
  parseWppFlightRadarWatchCommand,
  formatWppFlightRadarWatchHelpMessage,
  formatWppFlightRadarWatchStartedMessage,
  formatWppFlightRadarWatchStoppedMessage,
  formatWppFlightRadarWatchNotActiveMessage,
  formatWppFlightRadarWatchExpiredMessage,
  formatWppFlightRadarEventMessage,
  formatWppDateTime,
};
