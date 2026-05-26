/**
 * Detecção das pernas do circuito de tráfego (downwind / base / final / crosswind).
 *
 * Algoritmo puro e síncrono — não acessa a rede.  O enriquecimento com dados de
 * pista do Appwrite ("runwayHint") é feito pelo chamador de forma assíncrona.
 */

import type { ChartRow } from "./telemetryCharts";
import type { PatternLeg, PatternLegType, TrafficPatternAnalysis } from "../types/flight";

// ─── helpers ─────────────────────────────────────────────────────────────────

function get(row: ChartRow, key: string): number | null {
  const v = row[key];
  if (v === null || v === undefined || !Number.isFinite(v as number)) return null;
  return v as number;
}

/** Normalise para [-180, 180]: ângulo assinado de `runway` a `track`. */
function signedAngleDiff(trackDeg: number, runwayHeading: number): number {
  let d = ((trackDeg - runwayHeading) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

// ─── classificação ───────────────────────────────────────────────────────────

type RawClass = 'final' | 'downwind' | 'perp_pos' | 'perp_neg' | 'turning';

function classifyAngle(angle: number): RawClass {
  const abs = Math.abs(angle);
  if (abs <= 30) return 'final';
  if (abs >= 150) return 'downwind';
  if (angle >= 60 && angle <= 120) return 'perp_pos';   // base em circuito esquerdo
  if (angle <= -60 && angle >= -120) return 'perp_neg';  // base em circuito direito
  return 'turning';                                        // transição — ignorar
}

/** Tamanho mínimo (samples a 1 Hz) para considerar uma perna válida. */
const MIN_LEG_SAMPLES = 10;

interface Run {
  cls: RawClass;
  startIdx: number;  // índice em data[]
  endIdx: number;    // índice em data[] (inclusive)
}

function groupRuns(
  data: ChartRow[],
  fromIdx: number,
  toIdx: number,
  runwayHeading: number,
): Run[] {
  const runs: Run[] = [];
  let currentCls: RawClass | null = null;
  let runStart = fromIdx;

  const emitRun = (endIdx: number) => {
    if (
      currentCls !== null &&
      currentCls !== 'turning' &&
      endIdx - runStart + 1 >= MIN_LEG_SAMPLES
    ) {
      runs.push({ cls: currentCls, startIdx: runStart, endIdx });
    }
  };

  for (let i = fromIdx; i <= toIdx; i++) {
    const track = get(data[i]!, "trackDeg");
    if (track === null) continue;

    const angle = signedAngleDiff(track, runwayHeading);
    const cls = classifyAngle(angle);

    if (cls !== currentCls) {
      if (currentCls !== null) emitRun(i - 1);
      currentCls = cls;
      runStart = i;
    }
  }

  emitRun(toIdx);
  return runs;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Detecta as pernas do circuito entre `segmentStartIdx` e `touchdownIdx`.
 *
 * @param runwayHint  Quando disponível, o rumo e ident vêm do banco de pistas
 *                    (mais preciso que derivar do track da telemetria).
 */
export function detectTrafficPattern(
  data: ChartRow[],
  segmentStartIdx: number,
  touchdownIdx: number,
  runwayHint?: { headingTrue: number; ident: string } | null,
): TrafficPatternAnalysis | null {

  if (
    data.length === 0 ||
    touchdownIdx <= segmentStartIdx ||
    touchdownIdx >= data.length
  ) return null;

  // ── 1. Rumo da pista ───────────────────────────────────────────────────────
  let runwayHeading: number;
  let sourceIsDb = false;
  let runwayIdent: string | null = null;

  if (runwayHint != null) {
    runwayHeading = ((runwayHint.headingTrue % 360) + 360) % 360;
    runwayIdent = runwayHint.ident;
    sourceIsDb = true;
  } else {
    // Mediana do trackDeg nos ~20 s antes do pouso (exclui últimos 3 s pelo flare)
    const sampleStart = Math.max(segmentStartIdx, touchdownIdx - 25);
    const sampleEnd   = Math.max(sampleStart, touchdownIdx - 3);
    const tracks: number[] = [];
    for (let i = sampleStart; i <= sampleEnd; i++) {
      const t = get(data[i]!, "trackDeg");
      if (t !== null) tracks.push(t);
    }
    const med = median(tracks);
    if (med === null) return null;
    runwayHeading = ((med % 360) + 360) % 360;
  }

  // ── 2. Agrupar runs ────────────────────────────────────────────────────────
  const runs = groupRuns(data, segmentStartIdx, touchdownIdx, runwayHeading);
  if (runs.length === 0) return null;

  // ── 3. Direção do circuito ─────────────────────────────────────────────────
  // Encontrar o ÚLTIMO bloco FINAL e o ÚLTIMO bloco DOWNWIND antes dele.
  const finalRunIdxes = runs
    .map((r, i) => (r.cls === 'final' ? i : -1))
    .filter(x => x >= 0);
  const lastFinalRunIdx = finalRunIdxes[finalRunIdxes.length - 1] ?? -1;

  const downwindRunIdxes = runs
    .map((r, i) => (r.cls === 'downwind' ? i : -1))
    .filter(x => x >= 0);
  const lastDownwindRunIdx = downwindRunIdxes[downwindRunIdxes.length - 1] ?? -1;

  let patternDirection: 'left' | 'right' | 'unknown' = 'unknown';
  let baseClass: 'perp_pos' | 'perp_neg' | null = null;

  if (lastFinalRunIdx >= 0 && lastDownwindRunIdx >= 0 && lastDownwindRunIdx < lastFinalRunIdx) {
    // BASE = qualquer bloco PERP entre DOWNWIND e FINAL
    const between = runs.slice(lastDownwindRunIdx + 1, lastFinalRunIdx);
    const perpBetween = between.find(r => r.cls === 'perp_pos' || r.cls === 'perp_neg');
    if (perpBetween) {
      baseClass = perpBetween.cls as 'perp_pos' | 'perp_neg';
      patternDirection = baseClass === 'perp_pos' ? 'left' : 'right';
    }
  }

  // ── 4. Construir lista de pernas ───────────────────────────────────────────
  const legs: PatternLeg[] = [];

  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri]!;
    const startX    = data[run.startIdx]!.x;
    const endX      = data[run.endIdx]!.x;
    const startAglFt = get(data[run.startIdx]!, "heightAglFt");
    const endAglFt   = get(data[run.endIdx]!,   "heightAglFt");

    let legType: PatternLegType | null = null;

    switch (run.cls) {
      case 'final':
        legType = 'final';
        break;
      case 'downwind':
        legType = 'downwind';
        break;
      case 'perp_pos':
      case 'perp_neg': {
        // É BASE se: combina com baseClass E vem depois do último downwind
        const isBase =
          baseClass !== null &&
          run.cls === baseClass &&
          ri > lastDownwindRunIdx;

        if (isBase) {
          legType = 'base';
        } else if (baseClass === null && ri > lastDownwindRunIdx) {
          // Direção desconhecida mas vem após o downwind → provavelmente base
          legType = 'base';
        } else {
          // Antes ou no lado errado → crosswind (após decolagem)
          legType = 'crosswind';
        }
        break;
      }
      default:
        break;
    }

    if (legType !== null) {
      legs.push({ type: legType, startX, endX, startAglFt, endAglFt });
    }
  }

  if (legs.length === 0) return null;

  return {
    runwayHeadingTrue: runwayHeading,
    runwayIdent,
    patternDirection,
    legs,
    sourceIsDb,
    touchdownX: data[touchdownIdx]?.x ?? null,
  };
}

/**
 * Enriquece um padrão já detectado com dados precisos de pista vindos do Appwrite.
 * Chamado de forma assíncrona pelo componente React após consulta ao banco.
 */
export function enrichTrafficPattern(
  pattern: TrafficPatternAnalysis,
  hint: { headingTrue: number; ident: string },
): TrafficPatternAnalysis {
  return {
    ...pattern,
    runwayHeadingTrue: ((hint.headingTrue % 360) + 360) % 360,
    runwayIdent: hint.ident,
    sourceIsDb: true,
  };
}

/** Pernas visíveis na UI (crosswind é omitido). */
export const VISIBLE_LEG_TYPES: PatternLegType[] = ['downwind', 'base', 'final'];

/**
 * Filtra para as 3 pernas visíveis, ordena por tempo e elimina gaps:
 * - O ponto de corte entre pernas adjacentes é o meio do gap detectado.
 * - A primeira perna é estendida até `xMin`; a última até `xMax`.
 */
export function makeConsecutiveLegs(
  legs: PatternLeg[],
  _xMin: number,
  xMax: number,
  touchdownX?: number | null,
): PatternLeg[] {
  const filtered = legs
    .filter(l => VISIBLE_LEG_TYPES.includes(l.type))
    .sort((a, b) => a.startX - b.startX);

  if (filtered.length === 0) return [];

  const result: PatternLeg[] = filtered.map(l => ({ ...l }));

  // Preenche gaps com o ponto médio entre o fim de uma perna e o início da próxima
  for (let i = 0; i < result.length - 1; i++) {
    const curr = result[i]!;
    const next = result[i + 1]!;
    if (curr.endX < next.startX) {
      const mid = (curr.endX + next.startX) / 2;
      curr.endX = mid;
      next.startX = mid;
    }
  }

  // Estende apenas a última perna até o fim do domínio (ex: rollout após pouso).
  // O início da primeira perna NÃO é estendido — é normal haver um trecho inicial sem pernas.
  result[result.length - 1]!.endX = xMax;

  // Limita a perna "final" a 1 segundo após o toque (quando disponível)
  if (touchdownX != null) {
    let finalIdx = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i]!.type === 'final') { finalIdx = i; break; }
    }
    if (finalIdx >= 0) {
      const cap = touchdownX + 1000;
      if (cap < result[finalIdx]!.endX) {
        result[finalIdx]!.endX = cap;
        // Remove a perna se ficou sem largura
        if (result[finalIdx]!.endX <= result[finalIdx]!.startX) {
          result.splice(finalIdx, 1);
        }
      }
    }
  }

  return result;
}

/**
 * Seleciona a cabeceira mais compatível com o rumo de aproximação.
 * Retorna null se nenhuma pista estiver dentro da tolerância.
 */
export function selectBestRunwayHint(
  runways: Array<{
    le: { ident: string; headingTrue: number | null };
    he: { ident: string; headingTrue: number | null };
  }>,
  approachHeadingTrue: number,
  toleranceDeg = 30,
): { headingTrue: number; ident: string } | null {
  let best: { headingTrue: number; ident: string } | null = null;
  let bestDiff = Infinity;

  for (const rwy of runways) {
    for (const end of [rwy.le, rwy.he]) {
      if (end.headingTrue === null) continue;
      const diff = Math.abs(signedAngleDiff(approachHeadingTrue, end.headingTrue));
      if (diff < bestDiff && diff <= toleranceDeg) {
        bestDiff = diff;
        best = { headingTrue: end.headingTrue, ident: end.ident };
      }
    }
  }
  return best;
}
