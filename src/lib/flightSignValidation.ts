import type { FlightRecordMeta } from "./flightRecordCodec";

function parseDurationToMinutes(value: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] ?? "0") * 60 + Number(hhmm[2] ?? "0");
  const decimal = Number(raw.replace(",", "."));
  return Number.isFinite(decimal) && decimal > 0 ? Math.round(decimal * 60) : 0;
}

export function validateFlightForInstructorSign(meta: FlightRecordMeta): string[] {
  const errors: string[] = [];

  const hasLegBlockTimes = meta.legs.some((leg) => leg.engineStart?.trim() && leg.engineCut?.trim());
  if (!hasLegBlockTimes && !meta.header.departureTimeUtc?.trim()) {
    errors.push("Horário de partida/acionamento não preenchido.");
  }
  if (!hasLegBlockTimes && !meta.header.engineCutoffTimeUtc?.trim()) {
    errors.push("Horário de corte dos motores não preenchido.");
  }

  const hasEmptyAerodrome = meta.legs.some((leg) => !leg.dep?.trim() || !leg.arr?.trim());
  if (hasEmptyAerodrome) {
    errors.push("Há perna(s) sem aeródromo de partida ou chegada.");
  }

  const totalLandings = meta.legs.reduce((sum, leg) => sum + (leg.landings || 0), 0);
  if (totalLandings === 0) {
    errors.push("Nenhum pouso registrado nas pernas do voo.");
  }

  const totalFlightMinutes = meta.legs.reduce((sum, leg) => sum + parseDurationToMinutes(leg.flightTime), 0);
  if (totalFlightMinutes <= 0) {
    errors.push("Soma dos tempos de voo das pernas é zero.");
  }

  const wb = meta.weightBalance;
  if (!wb || wb.inputs.baggageWeightKg === null || wb.inputs.baggageWeightKg === undefined) {
    errors.push("Peso de bagagem não preenchido (Peso e Balanceamento).");
  }
  if (!wb || wb.inputs.rampFuel.value === null || wb.inputs.rampFuel.value === undefined) {
    errors.push("Combustível inicial não preenchido (Peso e Balanceamento).");
  }
  if (!wb || wb.inputs.taxiFuel.value === null || wb.inputs.taxiFuel.value === undefined) {
    errors.push("Combustível gasto no táxi não preenchido (Peso e Balanceamento).");
  }
  if (!wb || wb.inputs.tripFuel.value === null || wb.inputs.tripFuel.value === undefined) {
    errors.push("Combustível gasto até o pouso não preenchido (Peso e Balanceamento).");
  }

  if (!meta.risk.instructorOpinionMd?.trim()) {
    errors.push("Parecer do instrutor não preenchido (Risco e Parecer).");
  }

  return errors;
}
