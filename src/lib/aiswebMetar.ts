import type {
  AiswebFlightCondition,
  AiswebMinimumCheck,
  AiswebOperationalMinimum,
  AiswebParsedMetar,
  AiswebRotaer,
  AiswebRunway,
  AiswebWindRunwayAnalysis,
} from "../types/aisweb";

const CROSSWIND_THRESHOLD_KT = 2;

/** Parse fields commonly needed for operational minimum checks. */
export function parseMetar(raw: string): AiswebParsedMetar | null {
  const metar = String(raw || "").trim();
  if (!metar) return null;

  const cavok = /\bCAVOK\b/.test(metar);

  let observedAt: string | null = null;
  const timeMatch = metar.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  if (timeMatch) {
    const now = new Date();
    const day = Number(timeMatch[1]);
    const hour = Number(timeMatch[2]);
    const minute = Number(timeMatch[3]);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const candidate = new Date(Date.UTC(year, month, day, hour, minute, 0));
    if (candidate.getTime() - now.getTime() > 12 * 60 * 60 * 1000) {
      candidate.setUTCMonth(candidate.getUTCMonth() - 1);
    }
    observedAt = candidate.toISOString();
  }

  let windDirDeg: number | null = null;
  let windSpeedKt: number | null = null;
  let windGustKt: number | null = null;
  const windMatch = metar.match(/\b(?:VRB|(\d{3}))(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (windMatch) {
    windDirDeg = windMatch[1] ? Number(windMatch[1]) : null;
    windSpeedKt = Number(windMatch[2]);
    windGustKt = windMatch[3] ? Number(windMatch[3]) : null;
  }

  let windVarFromDeg: number | null = null;
  let windVarToDeg: number | null = null;
  const varMatch = metar.match(/\b(\d{3})V(\d{3})\b/);
  if (varMatch) {
    windVarFromDeg = Number(varMatch[1]);
    windVarToDeg = Number(varMatch[2]);
  }

  let visibilityM: number | null = null;
  if (cavok) {
    visibilityM = 10000;
  } else {
    const afterWind = metar.replace(
      /^\S+\s+\S+\s+\S+\s+(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT(?:\s+\d{3}V\d{3})?\s+/i,
      "",
    );
    const visMatch = afterWind.match(/^(?:(\d{4})|(\d{1,2})SM)\b/);
    if (visMatch?.[1]) {
      visibilityM = Number(visMatch[1]);
      // METAR 9999 = 10 km or more — normalize so 10 km minimums pass (>=).
      if (visibilityM >= 9999) visibilityM = 10000;
    } else if (visMatch?.[2]) visibilityM = Math.round(Number(visMatch[2]) * 1609.34);
  }

  let remarks: string | null = null;
  const rmkMatch = metar.match(/\bRMK\b\s+(.+?)(?:\s*=\s*)?$/i);
  if (rmkMatch) remarks = rmkMatch[1].trim();

  const weather = extractWeatherTokens(metar, remarks);

  const clouds = [...metar.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})?(CB|TCU)?\b/g)].map((m) => ({
    cover: m[1],
    heightFt: m[2] ? Number(m[2]) * 100 : null,
    convect: (m[3] as "CB" | "TCU" | undefined) || null,
    raw: m[0],
  }));

  let ceilingFt: number | null = null;
  if (cavok) {
    ceilingFt = 10000;
  } else {
    const ceilingLayers = clouds.filter(
      (c) => (c.cover === "BKN" || c.cover === "OVC" || c.cover === "VV") && c.heightFt != null,
    );
    if (ceilingLayers.length) {
      ceilingFt = Math.min(...ceilingLayers.map((c) => c.heightFt as number));
    }
  }

  const cloudsText = cavok
    ? "CAVOK"
    : clouds.length
      ? clouds.map((c) => c.raw).join(" ")
      : "N/D";

  return {
    observedAt,
    windDirDeg,
    windSpeedKt,
    windGustKt,
    windVarFromDeg,
    windVarToDeg,
    visibilityM,
    visibilityKm: visibilityM == null ? null : visibilityM / 1000,
    ceilingFt,
    clouds,
    cloudsText,
    weather,
    remarks,
    cavok,
  };
}

export function runwayHeadingFromIdent(ident: string): number | null {
  const match = String(ident || "")
    .trim()
    .toUpperCase()
    .match(/^(\d{2})/);
  if (!match) return null;
  let heading = Number(match[1]) * 10;
  if (heading === 360) heading = 0;
  if (!Number.isFinite(heading) || heading < 0 || heading > 360) return null;
  return heading;
}

function normalizeAngleDiff(deg: number): number {
  let value = deg % 360;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

export function windComponents(
  windDirDeg: number,
  windSpeedKt: number,
  runwayHeadingDeg: number,
): { crosswindKt: number; headwindKt: number } {
  const diffRad = (normalizeAngleDiff(windDirDeg - runwayHeadingDeg) * Math.PI) / 180;
  return {
    crosswindKt: Math.round(Math.abs(windSpeedKt * Math.sin(diffRad)) * 10) / 10,
    headwindKt: Math.round(windSpeedKt * Math.cos(diffRad) * 10) / 10,
  };
}

export function analyzeWindVsRunways(
  parsed: AiswebParsedMetar | null,
  runways: AiswebRunway[] | null | undefined,
): AiswebWindRunwayAnalysis {
  const empty: AiswebWindRunwayAnalysis = {
    bestIdent: null,
    bestHeadingDeg: null,
    crosswindKt: null,
    headwindKt: null,
    isCrosswind: false,
    options: [],
  };
  if (!parsed || parsed.windSpeedKt == null) return empty;
  const speed = parsed.windGustKt ?? parsed.windSpeedKt;
  if (parsed.windDirDeg == null) {
    return {
      ...empty,
      crosswindKt: speed,
      headwindKt: 0,
      isCrosswind: speed >= CROSSWIND_THRESHOLD_KT,
    };
  }

  const options: AiswebWindRunwayAnalysis["options"] = [];
  for (const runway of runways || []) {
    for (const thr of runway.thresholds || []) {
      const heading = thr.headingDeg ?? runwayHeadingFromIdent(thr.ident);
      if (heading == null) continue;
      const comps = windComponents(parsed.windDirDeg, speed, heading);
      options.push({
        ident: thr.ident || runway.ident,
        headingDeg: heading,
        crosswindKt: comps.crosswindKt,
        headwindKt: comps.headwindKt,
      });
    }
  }

  if (!options.length) {
    return {
      ...empty,
      isCrosswind: false,
    };
  }

  options.sort((a, b) => {
    // Prefer cabeceira com proa (pouso a favor do vento de frente).
    const aHead = a.headwindKt >= 0 ? 1 : 0;
    const bHead = b.headwindKt >= 0 ? 1 : 0;
    if (aHead !== bHead) return bHead - aHead;
    if (a.crosswindKt !== b.crosswindKt) return a.crosswindKt - b.crosswindKt;
    return b.headwindKt - a.headwindKt;
  });
  const best = options[0]!;
  return {
    bestIdent: best.ident,
    bestHeadingDeg: best.headingDeg,
    crosswindKt: best.crosswindKt,
    headwindKt: best.headwindKt,
    isCrosswind: best.crosswindKt >= CROSSWIND_THRESHOLD_KT,
    options,
  };
}

export function evaluateMinimums(
  parsed: AiswebParsedMetar | null,
  minimums: AiswebOperationalMinimum[],
  options?: { rotaer?: AiswebRotaer | null },
): AiswebMinimumCheck[] {
  const analysis = analyzeWindVsRunways(parsed, options?.rotaer?.runways);
  const windSpeed = parsed?.windGustKt ?? parsed?.windSpeedKt ?? null;
  const hasCrosswind = analysis.crosswindKt != null && analysis.bestIdent != null;

  return minimums.map((min) => {
    const crosswindLimit = min.maxWindKt / 2;
    const reasons: string[] = [];

    let ceilingOk: boolean | null = null;
    if (!parsed) {
      ceilingOk = null;
    } else if (parsed.ceilingFt == null) {
      // Sem BKN/OVC/VV (ex.: só FEW/SCT) = teto ilimitado → dentro do mínimo.
      ceilingOk = true;
    } else if (parsed.ceilingFt >= min.ceilingFt) {
      ceilingOk = true;
    } else {
      ceilingOk = false;
      reasons.push(
        `Teto ${parsed.ceilingFt.toLocaleString("pt-BR")} ft < mínimo ${min.ceilingFt.toLocaleString("pt-BR")} ft`,
      );
    }

    let visibilityOk: boolean | null = null;
    if (!parsed) {
      visibilityOk = null;
    } else if (parsed.visibilityKm == null) {
      visibilityOk = null;
      reasons.push("Visibilidade N/D no METAR");
    } else if (parsed.visibilityKm >= min.visibilityKm) {
      visibilityOk = true;
    } else {
      visibilityOk = false;
      reasons.push(
        `Vis ${parsed.visibilityKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km < mínimo ${min.visibilityKm} km`,
      );
    }

    let windOk: boolean | null = null;
    if (windSpeed == null) {
      windOk = null;
      reasons.push("Vento N/D no METAR");
    } else {
      const totalOk = windSpeed <= min.maxWindKt;
      if (!totalOk) {
        reasons.push(`Vento ${windSpeed}kt > ${min.maxWindKt} kt`);
      }

      let crossOk: boolean | null = null;
      if (hasCrosswind) {
        crossOk = (analysis.crosswindKt as number) <= crosswindLimit;
        if (!crossOk) {
          reasons.push(`Comp. de Través ${analysis.crosswindKt}kt > ${crosswindLimit} kt`);
        }
      }

      windOk = crossOk == null ? totalOk : totalOk && crossOk;
    }

    const known = [ceilingOk, visibilityOk, windOk].filter((v) => v !== null);
    const overallOk = known.length === 0 ? null : known.every((v) => v === true);
    if (overallOk === true) reasons.length = 0;

    return {
      condition: min.condition as AiswebFlightCondition,
      label: min.label,
      ceilingOk,
      visibilityOk,
      windOk,
      overallOk,
      windLimitKt: min.maxWindKt,
      crosswindLimitKt: crosswindLimit,
      reasons,
    };
  });
}

export function minimumCheckTooltip(check: AiswebMinimumCheck): string {
  if (check.overallOk === true) {
    return check.label;
  }
  if (check.reasons.length) {
    return `${check.label} — fora do min. — ${check.reasons.join(" · ")}`;
  }
  return `${check.label} — dados insuficientes`;
}

export function formatMinimumStatusLine(check: AiswebMinimumCheck): string {
  if (check.overallOk === true) return `✅ ${check.label}`;
  if (check.overallOk === false) {
    const reason = check.reasons[0] ? ` — ${check.reasons[0]}` : "";
    return `❌ ${check.label} — fora do min.${reason}`;
  }
  return `⚠️ ${check.label} — dados insuficientes`;
}

export function minimumCheckDetail(check: AiswebMinimumCheck): {
  title: string;
  status: "ok" | "fail" | "unknown";
  lines: string[];
} {
  const status = check.overallOk === true ? "ok" : check.overallOk === false ? "fail" : "unknown";
  const lines: string[] = [];
  if (check.overallOk === true) {
    // Sem texto extra — o status OK já basta no título/badge.
  } else if (check.reasons.length) {
    lines.push(`fora do min. — ${check.reasons.join(" · ")}`);
  } else {
    lines.push("Dados insuficientes para avaliar.");
  }
  if (check.windLimitKt != null) {
    lines.push(`Vento máx.: ${check.windLimitKt} kt · Través máx.: ${check.crosswindLimitKt ?? check.windLimitKt / 2} kt`);
  }
  return { title: check.label, status, lines };
}

export function normalizeIcao(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

export function formatWind(parsed: AiswebParsedMetar | null): string {
  if (!parsed || parsed.windSpeedKt == null) return "—";
  const dir = parsed.windDirDeg == null ? "VRB" : String(parsed.windDirDeg).padStart(3, "0");
  const base = `${dir}/${parsed.windSpeedKt}${parsed.windGustKt != null ? `G${parsed.windGustKt}` : ""}kt`;
  if (parsed.windVarFromDeg != null && parsed.windVarToDeg != null) {
    return `${base} ${String(parsed.windVarFromDeg).padStart(3, "0")}V${String(parsed.windVarToDeg).padStart(3, "0")}`;
  }
  return base;
}

export function formatObs(parsed: AiswebParsedMetar | null): string {
  if (!parsed) return "—";
  const parts: string[] = [];
  const weather = parsed.weather || [];
  if (weather.length) parts.push(weather.join(" "));
  if (parsed.cavok && !parts.length) parts.push("CAVOK");
  return parts.length ? parts.join(" · ") : "—";
}

const PHENOMENON_LABELS: Record<string, string> = {
  RA: "Chuva",
  DZ: "Chuvisco",
  SN: "Neve",
  SG: "Grãos de neve",
  IC: "Cristais de gelo",
  PL: "Granizo miúdo / pellets",
  GR: "Granizo grande",
  GS: "Granizo pequeno / neve granulada",
  UP: "Precipitação desconhecida",
  BR: "Névoa úmida",
  FG: "Nevoeiro",
  FU: "Fumaça",
  VA: "Cinza vulcânica",
  DU: "Poeira em suspensão",
  SA: "Areia",
  HZ: "Névoa seca",
  PY: "Spray",
  PO: "Redemoinhos de poeira ou areia",
  SQ: "Rajada forte súbita",
  FC: "Funil / tornado",
  SS: "Tempestade de areia",
  DS: "Tempestade de poeira",
  TS: "Trovoada",
  SH: "Pancadas",
};

const DESCRIPTOR_LABELS: Record<string, string> = {
  MI: "Camada fina",
  PR: "Parcial",
  BC: "Bancos",
  DR: "Deriva baixa",
  BL: "Sopro alto",
  SH: "Pancadas",
  TS: "Trovoada",
  FZ: "Congelante",
};

const WX_WITH_PHENOM_RE =
  /(?<![\w/])(RE)?(VC)?([-+])?((?:MI|PR|BC|DR|BL|SH|TS|FZ){0,2})(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)\b/gi;
const WX_DESC_ONLY_RE = /(?<![\w/])(RE)?(VC)?([-+])?(TS|SH|PO|SQ|SS|DS|FC)\b/gi;

function extractWeatherTokens(metar: string, remarks: string | null): string[] {
  const body = String(metar || "").replace(/\bRMK\b[\s\S]*$/i, " ");
  const sources = [body, remarks || ""];
  const out: string[] = [];

  function pushRaw(raw: string) {
    const normalized = raw.toUpperCase();
    if (!normalized || out.includes(normalized)) return;
    out.push(normalized);
  }

  for (const src of sources) {
    const withPhenom = new RegExp(WX_WITH_PHENOM_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = withPhenom.exec(src)) !== null) pushRaw(m[0]);

    const descOnly = new RegExp(WX_DESC_ONLY_RE.source, "gi");
    while ((m = descOnly.exec(src)) !== null) pushRaw(m[0]);
  }
  return out;
}

export type AiswebWeatherIntensity = "light" | "moderate" | "heavy";

export type AiswebWeatherDetail = {
  raw: string;
  intensity: AiswebWeatherIntensity;
  vicinity: boolean;
  recent: boolean;
  descriptors: string[];
  phenomena: string[];
  title: string;
  lines: string[];
  /** Primary visual kind for animations. */
  visual:
    | "rain"
    | "drizzle"
    | "showers"
    | "thunder"
    | "mist"
    | "fog"
    | "haze"
    | "smoke"
    | "hail"
    | "smallHail"
    | "squall"
    | "dustStorm"
    | "sandStorm"
    | "dust"
    | "dustWhirl"
    | "other";
};

function splitDescriptors(raw: string): string[] {
  const out: string[] = [];
  const re = /MI|PR|BC|DR|BL|SH|TS|FZ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[0]);
  return out;
}

function intensityLabel(intensity: AiswebWeatherIntensity): string {
  if (intensity === "light") return "Fraco (−)";
  if (intensity === "heavy") return "Forte (+)";
  return "Moderado";
}

function pickVisual(descriptors: string[], phenomena: string[]): AiswebWeatherDetail["visual"] {
  if (descriptors.includes("TS") || phenomena.includes("TS")) return "thunder";
  if (phenomena.includes("GR")) return "hail";
  if (phenomena.includes("GS")) return "smallHail";
  if (descriptors.includes("SH") || phenomena.includes("SH")) {
    if (phenomena.includes("RA") || !phenomena.length) return "showers";
  }
  if (phenomena.includes("DZ")) return "drizzle";
  if (phenomena.includes("RA")) return "rain";
  if (phenomena.includes("FG")) return "fog";
  if (phenomena.includes("BR")) return "mist";
  if (phenomena.includes("HZ")) return "haze";
  if (phenomena.includes("FU")) return "smoke";
  if (phenomena.includes("SQ")) return "squall";
  if (phenomena.includes("DS")) return "dustStorm";
  if (phenomena.includes("SS")) return "sandStorm";
  if (phenomena.includes("DU")) return "dust";
  if (phenomena.includes("PO")) return "dustWhirl";
  return "other";
}

function parseWeatherParts(rawToken: string): {
  recent: boolean;
  vicinity: boolean;
  intensity: AiswebWeatherIntensity;
  descriptors: string[];
  phenomena: string[];
} | null {
  const raw = String(rawToken || "").trim().toUpperCase();
  if (!raw) return null;

  let rest = raw;
  const recent = rest.startsWith("RE");
  if (recent) rest = rest.slice(2);
  const vicinity = rest.startsWith("VC");
  if (vicinity) rest = rest.slice(2);

  let intensity: AiswebWeatherIntensity = "moderate";
  if (rest.startsWith("-")) {
    intensity = "light";
    rest = rest.slice(1);
  } else if (rest.startsWith("+")) {
    intensity = "heavy";
    rest = rest.slice(1);
  }

  const phenomMatch = rest.match(
    /^(.*?)(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)?$/,
  );
  if (!phenomMatch) return null;
  const descriptors = splitDescriptors(phenomMatch[1] || "");
  const phenom = phenomMatch[2] || "";
  const phenomena = phenom ? [phenom] : [];
  if (!descriptors.length && !phenomena.length) return null;
  if (!phenomena.length && !descriptors.some((d) => ["TS", "SH", "PO", "SQ", "SS", "DS", "FC"].includes(d))) {
    return null;
  }
  return { recent, vicinity, intensity, descriptors, phenomena };
}

export function describeWeatherToken(rawToken: string): AiswebWeatherDetail | null {
  const raw = String(rawToken || "").trim().toUpperCase();
  const parsed = parseWeatherParts(raw);
  if (!parsed) return null;
  const { recent, vicinity, intensity, descriptors, phenomena } = parsed;

  const parts: string[] = [];
  for (const d of descriptors) {
    parts.push(DESCRIPTOR_LABELS[d] || PHENOMENON_LABELS[d] || d);
  }
  for (const p of phenomena) {
    parts.push(PHENOMENON_LABELS[p] || p);
  }
  const title = `${raw} · ${parts.join(" + ") || "Fenômeno"}`;

  const lines: string[] = [];
  lines.push(`Intensidade: ${intensityLabel(intensity)}`);
  if (vicinity) lines.push("Localização: nas proximidades (VC)");
  else lines.push("Localização: no aeródromo");
  if (recent) lines.push("Fenômeno recente (RE) — observado há pouco, pode não estar ativo agora");
  for (const d of descriptors) {
    lines.push(`${d}: ${DESCRIPTOR_LABELS[d] || d}`);
  }
  for (const p of phenomena) {
    lines.push(`${p}: ${PHENOMENON_LABELS[p] || p}`);
  }
  if (raw.includes("SH") && raw.includes("RA")) lines.push("Ex.: SHRA = pancadas de chuva");
  if (raw.includes("TS") && raw.includes("RA")) lines.push("Ex.: TSRA = trovoada com chuva");

  return {
    raw,
    intensity,
    vicinity,
    recent,
    descriptors,
    phenomena,
    title,
    lines,
    visual: pickVisual(descriptors, phenomena),
  };
}

export function describeWeatherTokens(tokens: string[] | null | undefined): AiswebWeatherDetail[] {
  const out: AiswebWeatherDetail[] = [];
  for (const token of tokens || []) {
    const detail = describeWeatherToken(token);
    if (detail) out.push(detail);
  }
  return out;
}

/** Split TAF into base + change groups (BECMG / TEMPO / FM). */
export type AiswebTafSegment = {
  id: string;
  kind: "base" | "becmg" | "tempo" | "fm" | "prob";
  label: string;
  text: string;
};

export function splitTafSegments(raw: string): AiswebTafSegment[] {
  const taf = String(raw || "").replace(/\s+/g, " ").trim();
  if (!taf) return [];
  const re = /\b(BECMG|TEMPO|FM\d{6}|PROB\d{2}(?:\s+TEMPO)?)\b/gi;
  const matches = [...taf.matchAll(re)];
  if (!matches.length) {
    return [{ id: "base", kind: "base", label: "Base", text: taf }];
  }
  const segments: AiswebTafSegment[] = [];
  const firstIdx = matches[0]!.index ?? 0;
  const baseText = taf.slice(0, firstIdx).trim();
  if (baseText) {
    segments.push({ id: "base", kind: "base", label: "Base", text: baseText });
  }
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? taf.length) : taf.length;
    const fullText = taf.slice(start, end).trim();
    const token = String(m[1] || "").toUpperCase();
    let kind: AiswebTafSegment["kind"] = "becmg";
    let label = token;
    if (token.startsWith("BECMG")) {
      kind = "becmg";
      label = "BECMG";
    } else if (token.startsWith("TEMPO")) {
      kind = "tempo";
      label = "TEMPO";
    } else if (token.startsWith("FM")) {
      kind = "fm";
      label = token;
    } else if (token.startsWith("PROB")) {
      kind = "prob";
      label = token.replace(/\s+/g, " ");
    }
    const timeMatch = fullText.match(/\b(\d{4}\/\d{4}|\d{6})\b/);
    if (timeMatch) label = `${label} ${timeMatch[1]}`;
    // Keep only the changing fields — drop repeated kind token + validity period.
    const changeText = fullText
      .replace(/^\s*(BECMG|TEMPO|PROB\d{2}(?:\s+TEMPO)?|FM\d{6})\b/i, "")
      .replace(/^\s*\d{4}\/\d{4}\b/, "")
      .replace(/^\s*\d{6}\b/, "")
      .trim();
    segments.push({ id: `${kind}-${i}`, kind, label, text: changeText || fullText });
  });
  return segments;
}

/** Merge a TAF change group onto METAR-like base conditions for visuals. */
export function mergeParsedForVisual(
  base: AiswebParsedMetar | null,
  changeText: string,
): AiswebParsedMetar | null {
  const cleaned = String(changeText || "")
    .replace(/^\s*(BECMG|TEMPO|PROB\d{2}(?:\s+TEMPO)?|FM\d{6})\b/i, "")
    .replace(/\b\d{4}\/\d{4}\b/, "")
    .trim();
  const fake = `XXXX 010000Z ${cleaned}`.replace(/\s+/g, " ").trim();
  const override = parseMetar(fake);
  if (!base && !override) return null;
  if (!base) return override;
  if (!override) return base;

  // CAVOK / clear-sky tokens must wipe previous cloud layers.
  const clearsSky =
    override.cavok ||
    /\b(?:CAVOK|SKC|NSC|NCD|CLR)\b/i.test(cleaned);

  if (clearsSky) {
    return {
      observedAt: base.observedAt,
      windDirDeg: override.windDirDeg ?? base.windDirDeg,
      windSpeedKt: override.windSpeedKt ?? base.windSpeedKt,
      windGustKt: override.windGustKt ?? base.windGustKt,
      windVarFromDeg: override.windVarFromDeg ?? base.windVarFromDeg,
      windVarToDeg: override.windVarToDeg ?? base.windVarToDeg,
      visibilityM: override.cavok ? 10000 : (override.visibilityM ?? 10000),
      visibilityKm: override.cavok ? 10 : (override.visibilityKm ?? 10),
      ceilingFt: 10000,
      clouds: [],
      cloudsText: override.cavok ? "CAVOK" : "SKC",
      weather: override.weather?.length ? override.weather : [],
      remarks: override.remarks ?? null,
      cavok: override.cavok || /\bCAVOK\b/i.test(cleaned),
    };
  }

  return {
    observedAt: base.observedAt,
    windDirDeg: override.windDirDeg ?? base.windDirDeg,
    windSpeedKt: override.windSpeedKt ?? base.windSpeedKt,
    windGustKt: override.windGustKt ?? base.windGustKt,
    windVarFromDeg: override.windVarFromDeg ?? base.windVarFromDeg,
    windVarToDeg: override.windVarToDeg ?? base.windVarToDeg,
    visibilityM: override.visibilityM ?? base.visibilityM,
    visibilityKm: override.visibilityKm ?? base.visibilityKm,
    ceilingFt: override.clouds.length ? override.ceilingFt : base.ceilingFt,
    clouds: override.clouds.length ? override.clouds : base.clouds,
    cloudsText: override.clouds.length ? override.cloudsText : base.cloudsText,
    weather: override.weather?.length ? override.weather : base.weather,
    remarks: override.remarks ?? base.remarks ?? null,
    cavok: false,
  };
}

export function formatVisibility(parsed: AiswebParsedMetar | null): string {
  if (!parsed) return "—";
  if (parsed.cavok) return "CAVOK";
  if (parsed.visibilityKm == null) return "—";
  if (parsed.visibilityM != null && parsed.visibilityM >= 9999) return "10km+";
  return `${parsed.visibilityKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function formatCeiling(parsed: AiswebParsedMetar | null): string {
  if (!parsed) return "—";
  if (parsed.cavok) return "CAVOK";
  if (parsed.ceilingFt == null) return "Ilimitado";
  return `${parsed.ceilingFt.toLocaleString("pt-BR")} ft`;
}

export type AiswebMetarDecodeLine = {
  code: string;
  meaning: string;
};

const CLOUD_COVER_PT: Record<string, string> = {
  FEW: "Poucas nuvens (1–2/8)",
  SCT: "Nuvens esparsas (3–4/8)",
  BKN: "Nuvens fragmentadas (5–7/8)",
  OVC: "Céu encoberto (8/8)",
  VV: "Visibilidade vertical",
};

function compassFromDeg(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx]!;
}

function decodeTempToken(raw: string): string | null {
  const m = raw.match(/^M?(\d{2})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return raw.toUpperCase().startsWith("M") ? `−${n}` : String(n);
}

function decodeRemarkChunk(token: string): string | null {
  const t = token.toUpperCase();
  if (t === "NOSIG") return "Sem mudanças significativas previstas";
  if (t === "WS") return "Wind shear";
  if (t === "MT") return "Montanha / terreno";
  if (t === "OBSC") return "Obscurecido";
  if (t === "CLD") return "Nuvens";
  if (t === "SFC") return "Superfície";
  if (t === "WND") return "Vento";
  if (t === "VIS") return "Visibilidade";
  if (/^QFT\d+$/.test(t)) return `Base de nuvem em pés (${t.slice(3)})`;
  const wx = describeWeatherToken(t);
  if (wx) {
    let meaning = wx.title.includes(" · ")
      ? wx.title.split(" · ").slice(1).join(" · ").replace(/ \+ /g, " com ")
      : wx.title;
    if (wx.intensity === "light") meaning += " (fraca)";
    else if (wx.intensity === "heavy") meaning += " (forte)";
    if (wx.vicinity) meaning += ", nas proximidades";
    if (wx.recent) meaning += " — recente";
    return meaning;
  }
  return null;
}

/** Decode METAR groups into plain-language Portuguese explanations. */
export function decodeMetar(raw: string): AiswebMetarDecodeLine[] {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/=\s*$/, "")
    .trim();
  if (!text) return [];

  const tokens = text.split(" ").filter(Boolean);
  const lines: AiswebMetarDecodeLine[] = [];
  let i = 0;
  let inRemarks = false;
  const remarkParts: string[] = [];

  const push = (code: string, meaning: string) => {
    lines.push({ code, meaning });
  };

  while (i < tokens.length) {
    const token = tokens[i]!;
    const upper = token.toUpperCase();

    if (inRemarks) {
      remarkParts.push(token);
      i += 1;
      continue;
    }

    if (upper === "METAR") {
      push(token, "Boletim meteorológico de aeródromo (observação)");
      i += 1;
      continue;
    }
    if (upper === "SPECI") {
      push(token, "Boletim especial (mudança significativa entre METARs)");
      i += 1;
      continue;
    }
    if (upper === "COR") {
      push(token, "Correção de boletim anterior");
      i += 1;
      continue;
    }
    if (upper === "AUTO") {
      push(token, "Observação automática (sem observador humano)");
      i += 1;
      continue;
    }
    if (upper === "NIL") {
      push(token, "Boletim não disponível");
      i += 1;
      continue;
    }
    if (/^[A-Z]{4}$/.test(upper) && i <= 3) {
      push(token, `Estação ${upper}`);
      i += 1;
      continue;
    }
    if (/^\d{6}Z$/.test(upper)) {
      const day = upper.slice(0, 2);
      const hour = upper.slice(2, 4);
      const minute = upper.slice(4, 6);
      push(token, `Observado no dia ${day} às ${hour}:${minute} UTC`);
      i += 1;
      continue;
    }
    if (/^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT$/.test(upper)) {
      const m = upper.match(/^(VRB|(\d{3}))(\d{2,3})(?:G(\d{2,3}))?KT$/);
      if (m) {
        const speed = Number(m[3]);
        const gust = m[4] ? Number(m[4]) : null;
        let meaning: string;
        if (speed === 0) {
          meaning = "Calmaria (vento calmo)";
        } else if (m[1] === "VRB") {
          meaning = `Vento variável a ${speed} kt`;
        } else {
          const deg = Number(m[2]);
          meaning = `Vento de ${String(deg).padStart(3, "0")}° (${compassFromDeg(deg)}) a ${speed} kt`;
        }
        if (gust != null) meaning += `, com rajadas de ${gust} kt`;
        push(token, meaning);
      }
      i += 1;
      continue;
    }
    if (/^\d{3}V\d{3}$/.test(upper)) {
      const from = Number(upper.slice(0, 3));
      const to = Number(upper.slice(4, 7));
      push(
        token,
        `Direção do vento variável entre ${String(from).padStart(3, "0")}° (${compassFromDeg(from)}) e ${String(to).padStart(3, "0")}° (${compassFromDeg(to)})`,
      );
      i += 1;
      continue;
    }
    if (upper === "CAVOK") {
      push(
        token,
        "Ceiling and Visibility OK — visibilidade ≥ 10 km, sem nuvens abaixo de 5.000 ft e sem fenômenos significativos",
      );
      i += 1;
      continue;
    }
    if (/^\d{4}$/.test(upper)) {
      const meters = Number(upper);
      if (meters >= 9999) {
        push(token, "Visibilidade 10 km ou mais");
      } else if (meters >= 5000) {
        push(token, `Visibilidade ${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km (${meters.toLocaleString("pt-BR")} m)`);
      } else {
        push(token, `Visibilidade ${meters.toLocaleString("pt-BR")} m`);
      }
      i += 1;
      continue;
    }
    if (/^\d{1,2}SM$/.test(upper)) {
      const sm = Number(upper.replace("SM", ""));
      push(token, `Visibilidade ${sm} milha${sm === 1 ? "" : "s"} estatutária${sm === 1 ? "" : "s"} (~${Math.round(sm * 1609).toLocaleString("pt-BR")} m)`);
      i += 1;
      continue;
    }
    if (/^R\d{2}[LCR]?\/[MP]?\d{4}[UDN]?$/.test(upper)) {
      const m = upper.match(/^R(\d{2}[LCR]?)\/([MP]?)(\d{4})([UDN]?)$/);
      if (m) {
        const rwy = m[1];
        const bound = m[2] === "P" ? "maior que " : m[2] === "M" ? "menor que " : "";
        const trend = m[4] === "U" ? ", tendência a aumentar" : m[4] === "D" ? ", tendência a diminuir" : m[4] === "N" ? ", sem tendência" : "";
        push(token, `Alcance visual na pista ${rwy}: ${bound}${Number(m[3]).toLocaleString("pt-BR")} m${trend}`);
      }
      i += 1;
      continue;
    }
    if (/^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(upper)) {
      const m = upper.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
      if (m) {
        const cover = CLOUD_COVER_PT[m[1]!] || m[1]!;
        const height = Number(m[2]) * 100;
        let meaning =
          m[1] === "VV"
            ? `${cover} ${height.toLocaleString("pt-BR")} ft`
            : `${cover} a ${height.toLocaleString("pt-BR")} ft`;
        if (m[3] === "CB") meaning += " · Cumulonimbus (CB)";
        if (m[3] === "TCU") meaning += " · Cumulus congestus / TCU";
        push(token, meaning);
      }
      i += 1;
      continue;
    }
    if (upper === "NSC") {
      push(token, "Sem nuvens significativas (None Significant Cloud)");
      i += 1;
      continue;
    }
    if (upper === "NCD") {
      push(token, "Sem nuvens detectadas (estação automática)");
      i += 1;
      continue;
    }
    if (upper === "SKC" || upper === "CLR") {
      push(token, "Céu limpo");
      i += 1;
      continue;
    }
    if (/^M?\d{2}\/M?\d{2}$/.test(upper)) {
      const [tRaw, dRaw] = upper.split("/");
      const temp = decodeTempToken(tRaw!);
      const dew = decodeTempToken(dRaw!);
      if (temp != null && dew != null) {
        push(token, `Temperatura ${temp} °C · ponto de orvalho ${dew} °C`);
      }
      i += 1;
      continue;
    }
    if (/^Q\d{3,4}$/.test(upper)) {
      push(token, `QNH ${Number(upper.slice(1))} hPa`);
      i += 1;
      continue;
    }
    if (/^A\d{4}$/.test(upper)) {
      const inHg = `${upper.slice(1, 3)}.${upper.slice(3)}`;
      push(token, `Altimeter setting ${inHg} inHg`);
      i += 1;
      continue;
    }
    if (upper === "NOSIG") {
      push(token, "Sem mudanças significativas previstas nas próximas horas");
      i += 1;
      continue;
    }
    if (upper === "RMK") {
      inRemarks = true;
      i += 1;
      continue;
    }
    {
      const detail = describeWeatherToken(upper);
      if (detail) {
        const desc = detail.title.includes(" · ")
          ? detail.title.split(" · ").slice(1).join(" · ")
          : detail.title;
        let meaning = desc.replace(/ \+ /g, " com ");
        if (detail.intensity === "light") meaning += " (fraca)";
        else if (detail.intensity === "heavy") meaning += " (forte)";
        if (detail.vicinity) meaning += ", nas proximidades do aeródromo";
        if (detail.recent) meaning += " — observada recentemente";
        push(token, meaning);
        i += 1;
        continue;
      }
    }
    // Trend groups sometimes appear after METAR body
    if (upper === "TEMPO" || upper === "BECMG") {
      push(token, upper === "TEMPO" ? "Mudança temporária prevista" : "Mudança gradual prevista");
      i += 1;
      continue;
    }
    if (/^PROB\d{2}$/.test(upper)) {
      push(token, `Probabilidade de ${upper.slice(4)}%`);
      i += 1;
      continue;
    }
    if (/^FM\d{6}$/.test(upper)) {
      push(token, `A partir de ${upper.slice(2, 4)}/${upper.slice(4, 6)}:${upper.slice(6, 8)} UTC`);
      i += 1;
      continue;
    }
    if (/^TL\d{4}$/.test(upper)) {
      push(token, `Até ${upper.slice(2, 4)}:${upper.slice(4, 6)} UTC`);
      i += 1;
      continue;
    }
    if (/^AT\d{4}$/.test(upper)) {
      push(token, `Às ${upper.slice(2, 4)}:${upper.slice(4, 6)} UTC`);
      i += 1;
      continue;
    }

    push(token, "Grupo não reconhecido neste decodificador");
    i += 1;
  }

  if (remarkParts.length) {
    const decodedBits: string[] = [];
    const leftover: string[] = [];
    for (const part of remarkParts) {
      const meaning = decodeRemarkChunk(part);
      if (meaning) decodedBits.push(`${part}: ${meaning}`);
      else leftover.push(part);
    }
    const meaningParts = [...decodedBits];
    if (leftover.length) meaningParts.push(leftover.join(" "));
    push("RMK", `Observações: ${meaningParts.join(" · ")}`);
  }

  return lines;
}
