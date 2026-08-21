/** Encaixe flexível: desloca vizinhos na mesma aeronave em até ±N minutos para abrir espaço. */

export const FLEXIBLE_ADJUST_MAX_MINUTES = 30;

export type FlexibleFitPeer = {
  id: string;
  label: string;
  startMinute: number;
  durationMinutes: number;
  /** Bloqueios e similares não se movem. */
  immovable?: boolean;
};

export type FlexibleFitShift = {
  id: string;
  label: string;
  fromStartMinute: number;
  toStartMinute: number;
  durationMinutes: number;
};

export type FlexibleFitResult =
  | { ok: true; status: "free" | "adjust"; shifts: FlexibleFitShift[] }
  | { ok: false; status: "blocked"; reason: string; shifts: [] };

type MutablePeer = FlexibleFitPeer & { originalStart: number; start: number };

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function validatePacked(
  newStart: number,
  newEnd: number,
  peers: MutablePeer[],
  dayStart: number,
  dayEnd: number,
  maxFlex: number,
): string | null {
  if (newStart < dayStart || newEnd > dayEnd) return "Fora do horário da escala.";

  const blocks = [
    { id: "__new__", start: newStart, end: newEnd },
    ...peers.map((peer) => ({
      id: peer.id,
      start: peer.start,
      end: peer.start + peer.durationMinutes,
    })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  // Só exige horário da escala em peers que realmente movemos.
  // Eventos já existentes fora do dia (ex.: após 18:00) não podem bloquear
  // um encaixe livre no meio do dia.
  const movedIds = new Set(
    peers.filter((peer) => peer.start !== peer.originalStart).map((peer) => peer.id),
  );
  for (const block of blocks) {
    if (block.id === "__new__") continue;
    if (!movedIds.has(block.id)) continue;
    if (block.start < dayStart || block.end > dayEnd) {
      return "Um evento vizinho sairia do horário da escala.";
    }
  }

  for (let i = 1; i < blocks.length; i += 1) {
    const prev = blocks[i - 1]!;
    const curr = blocks[i]!;
    if (curr.start < prev.end) return "Ainda há sobreposição após o ajuste.";
  }

  for (const peer of peers) {
    if (peer.immovable) continue;
    if (Math.abs(peer.start - peer.originalStart) > maxFlex) {
      return `Ajuste acima de ${maxFlex} min em "${peer.label}".`;
    }
  }

  return null;
}

/**
 * Tenta inserir [preferredStart, preferredStart+duration) na coluna,
 * empurrando eventos à esquerda (para trás) e à direita (para frente)
 * no máximo `maxFlexMinutes` cada um.
 *
 * Eventos que cruzam o bloco novo são classificados pela direção de menor
 * deslocamento (não só por start < T), para conseguir empurrar “para frente”
 * mesmo quando o mouse está um pouco sobre o card vizinho.
 *
 * `abutGapMinutes`: folga mínima entre blocos colados. No SAGA, fim==início
 * conta como conflito (“Aeronave ocupada neste horário!”) — use 1 no modo SAGA.
 */
export function computeFlexibleFit(params: {
  preferredStartMinute: number;
  durationMinutes: number;
  peers: FlexibleFitPeer[];
  dayStartMinute: number;
  dayEndMinute: number;
  maxFlexMinutes?: number;
  abutGapMinutes?: number;
}): FlexibleFitResult {
  const maxFlex = params.maxFlexMinutes ?? FLEXIBLE_ADJUST_MAX_MINUTES;
  const abutGap = Math.max(0, Math.round(params.abutGapMinutes ?? 0));
  const T = params.preferredStartMinute;
  const D = Math.round(params.durationMinutes);
  const dayStart = params.dayStartMinute;
  const dayEnd = params.dayEndMinute;

  if (!Number.isFinite(T) || !Number.isFinite(D) || D <= 0) {
    return { ok: false, status: "blocked", reason: "Duração inválida.", shifts: [] };
  }
  if (T < dayStart || T + D > dayEnd) {
    return { ok: false, status: "blocked", reason: "Fora do horário da escala.", shifts: [] };
  }

  const peers: MutablePeer[] = params.peers
    .filter((peer) => peer.durationMinutes > 0)
    .map((peer) => ({
      ...peer,
      originalStart: peer.startMinute,
      start: peer.startMinute,
    }))
    .sort((a, b) => a.originalStart - b.originalStart || a.durationMinutes - b.durationMinutes);

  for (const peer of peers) {
    if (!peer.immovable) continue;
    if (intervalsOverlap(T, T + D, peer.start, peer.start + peer.durationMinutes)) {
      return {
        ok: false,
        status: "blocked",
        reason: `Conflito com bloqueio imovível (${peer.label}).`,
        shifts: [],
      };
    }
  }

  const movable = peers.filter((peer) => !peer.immovable);
  const newEnd = T + D;

  const left: MutablePeer[] = [];
  const right: MutablePeer[] = [];

  for (const peer of movable) {
    const peerEnd = peer.originalStart + peer.durationMinutes;
    const overlapsNew = intervalsOverlap(T, newEnd, peer.originalStart, peerEnd);

    if (!overlapsNew) {
      // Totalmente antes do novo bloco → cadeia esquerda; totalmente depois → direita.
      if (peerEnd <= T) left.push(peer);
      else right.push(peer);
      continue;
    }

    // Cruza o slot novo: escolhe o lado que exige menor deslocamento (e que caiba no dia).
    const leftStart = T - abutGap - peer.durationMinutes;
    const shiftLeft = peer.originalStart - leftStart; // > 0 = move para trás
    const shiftRight = newEnd + abutGap - peer.originalStart; // > 0 = move para frente
    const leftFeasible =
      leftStart >= dayStart && shiftLeft >= 0 && shiftLeft <= maxFlex;
    const rightFeasible =
      newEnd + abutGap + peer.durationMinutes <= dayEnd && shiftRight >= 0 && shiftRight <= maxFlex;

    if (leftFeasible && rightFeasible) {
      // Se o novo bloco começa antes do vizinho, preferir empurrar para frente
      // (encaixe “antes” do voo existente) — é o caso típico 06:00 vs 07:30→07:45.
      if (T <= peer.originalStart) right.push(peer);
      else if (shiftLeft <= shiftRight) left.push(peer);
      else right.push(peer);
    } else if (leftFeasible) {
      left.push(peer);
    } else if (rightFeasible) {
      right.push(peer);
    } else if (T <= peer.originalStart) {
      right.push(peer);
    } else if (shiftRight <= shiftLeft) {
      // Ainda tenta o lado “natural”; o limite de flex será validado no pass.
      right.push(peer);
    } else {
      left.push(peer);
    }
  }

  left.sort((a, b) => b.originalStart - a.originalStart);
  right.sort((a, b) => a.originalStart - b.originalStart);

  let cursor = T;
  for (const event of left) {
    const originalEnd = event.originalStart + event.durationMinutes;
    const maxAllowedEnd = cursor - abutGap;
    if (originalEnd <= maxAllowedEnd) {
      event.start = event.originalStart;
      cursor = event.originalStart;
      continue;
    }
    const nextStart = maxAllowedEnd - event.durationMinutes;
    if (nextStart < dayStart) {
      return { ok: false, status: "blocked", reason: "Sem espaço à esquerda na escala.", shifts: [] };
    }
    if (Math.abs(nextStart - event.originalStart) > maxFlex) {
      return {
        ok: false,
        status: "blocked",
        reason: `Precisaria mover "${event.label}" mais de ${maxFlex} min.`,
        shifts: [],
      };
    }
    event.start = nextStart;
    cursor = nextStart;
  }

  cursor = newEnd;
  for (const event of right) {
    const minStart = cursor + abutGap;
    if (event.originalStart >= minStart) {
      event.start = event.originalStart;
      cursor = event.originalStart + event.durationMinutes;
      continue;
    }
    const nextStart = minStart;
    if (nextStart + event.durationMinutes > dayEnd) {
      return { ok: false, status: "blocked", reason: "Sem espaço à direita na escala.", shifts: [] };
    }
    if (Math.abs(nextStart - event.originalStart) > maxFlex) {
      return {
        ok: false,
        status: "blocked",
        reason: `Precisaria mover "${event.label}" mais de ${maxFlex} min.`,
        shifts: [],
      };
    }
    event.start = nextStart;
    cursor = nextStart + event.durationMinutes;
  }

  for (const peer of peers) {
    if (peer.immovable) peer.start = peer.originalStart;
  }

  const invalid = validatePacked(T, newEnd, peers, dayStart, dayEnd, maxFlex);
  if (invalid) {
    return { ok: false, status: "blocked", reason: invalid, shifts: [] };
  }

  const shifts: FlexibleFitShift[] = movable
    .filter((peer) => peer.start !== peer.originalStart)
    .map((peer) => ({
      id: peer.id,
      label: peer.label,
      fromStartMinute: peer.originalStart,
      toStartMinute: peer.start,
      durationMinutes: peer.durationMinutes,
    }))
    .sort((a, b) => a.toStartMinute - b.toStartMinute);

  return {
    ok: true,
    status: shifts.length > 0 ? "adjust" : "free",
    shifts,
  };
}
