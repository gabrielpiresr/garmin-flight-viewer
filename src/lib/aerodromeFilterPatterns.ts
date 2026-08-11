/** Padrões compartilhados entre cadastro local e enriquecimento AISWEB. */

export const PAVED_SURFACE_RE =
  /\b(asph(?:alt)?|asfalt[oa]?|conc(?:rete)?|concret[oa]?|paved|pavimentad[ao]|bitum|tarma[cs]|cimento)\b/i;

export const UNPAVED_SURFACE_RE =
  /\b(grass|grama|dirt|terra|gravel|gvl|saibro|cascalho|earth|soil|argila)\b/i;

export const NIGHT_OPS_RE =
  /\b(noturn|noite|h24|hn|night|sr[-/]?ss|zero\s*zero|luz(?:es)?\s*(?:de\s*)?(?:pista|aproxim)|rwy\s*light|papi|als|alsf)\b/i;

/** Separadores comuns em ROTAER (espaço, ·, /, vírgula, etc.). */
const FUEL_EDGE = String.raw`(?:^|[\s·•.,;:/|(\[{-])`;
const FUEL_TAIL = String.raw`(?=$|[\s·•.,;:/|)\]}-])`;

/** Avgas / 100LL / código PF (ex.: "PF · TF · 0900-0000…"). */
export const AVGAS_RE = new RegExp(
  `${FUEL_EDGE}(?:avgas|gasolina\\s*de\\s*avia[cç][aã]o|pf|100ll|100\\s*ll)${FUEL_TAIL}`,
  "i",
);

/** Jet A-1 / querosene / código TF. */
export const JET_RE = new RegExp(
  `${FUEL_EDGE}(?:jet(?:\\s*-?\\s*a\\s*-?\\s*1?)?|querosene|jeta1|jet\\s*a|tf)${FUEL_TAIL}`,
  "i",
);

export const NIGHT_NEGATIVE_RE = /^(n[aã]o|nao|no|n\/a|sem|proibid|negativ|-|\.|)$/i;
