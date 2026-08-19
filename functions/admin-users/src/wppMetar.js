"use strict";

const CROSSWIND_THRESHOLD_KT = 2;

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeIcao(value) {
  return cleanString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function normalizeSearchText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detecta Metar/Notam/Detalhes + ICAO ou busca por nome/cidade (texto ou id de botão). */
function parseWppAiswebCommand(text, responseId = "") {
  const idRaw = cleanString(responseId);
  const idMatch = idRaw.match(/^(metar|notams?|detalhes?|aerodromo)_([A-Za-z0-9]{4})$/i);
  if (idMatch) {
    const kind = normalizeAiswebCommandKind(idMatch[1]);
    const icao = normalizeIcao(idMatch[2]);
    if (kind && icao.length === 4) return { kind, icao };
  }

  const raw = cleanString(text);
  const match = raw.match(/^(metar|notams?|detalhes?|aerodromo)\s*[:\-]?\s+(.+)$/i);
  if (!match) return null;
  const kind = normalizeAiswebCommandKind(match[1]);
  const rest = cleanString(match[2]);
  if (!kind || !rest) return null;

  const compact = rest.replace(/\s+/g, "");
  const icao = normalizeIcao(compact);
  if (/^[A-Za-z0-9]{4}$/.test(compact) && icao.length === 4) {
    return { kind, icao };
  }

  const query = rest.slice(0, 80);
  if (!normalizeSearchText(query)) return null;
  return { kind, query };
}

const METAR_WATCH_HOURS = [2, 4, 8];

/** Acompanhar / Parar acompanhamento de METAR (botão ou texto). */
function parseWppMetarWatchCommand(text, responseId = "") {
  const candidates = [cleanString(responseId), cleanString(text)].filter(Boolean);
  for (const raw of candidates) {
    const id = raw.trim();
    const stopMatch = id.match(/^watch_stop(?:_([A-Za-z0-9]{4}))?$/i);
    if (stopMatch) {
      const icao = stopMatch[1] ? normalizeIcao(stopMatch[1]) : null;
      return { action: "stop", icao: icao && icao.length === 4 ? icao : null };
    }
    const simpleMatch = id.match(/^watch_simple(?:_([A-Za-z0-9]{4}))?$/i);
    if (simpleMatch) {
      const icao = simpleMatch[1] ? normalizeIcao(simpleMatch[1]) : null;
      return { action: "simplify", icao: icao && icao.length === 4 ? icao : null };
    }
    const hoursMatch = id.match(/^watch_([A-Za-z0-9]{4})_([248])$/i);
    if (hoursMatch) {
      const icao = normalizeIcao(hoursMatch[1]);
      const hours = Number(hoursMatch[2]);
      if (icao.length === 4 && METAR_WATCH_HOURS.includes(hours)) {
        return { action: "start", icao, hours };
      }
    }
    const chooseMatch = id.match(/^watch_([A-Za-z0-9]{4})$/i);
    if (chooseMatch) {
      const icao = normalizeIcao(chooseMatch[1]);
      if (icao.length === 4) return { action: "choose_hours", icao };
    }
  }

  for (const raw of candidates) {
    const normalized = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (
      normalized === "parar acompanhamento" ||
      normalized === "parar metar" ||
      normalized === "parar notificacoes" ||
      normalized === "stop metar" ||
      normalized === "watch stop"
    ) {
      return { action: "stop", icao: null };
    }

    if (
      normalized === "receber simplificado" ||
      normalized === "metar simplificado" ||
      normalized === "simplificado"
    ) {
      return { action: "simplify", icao: null };
    }

    const simpleIcaoMatch = normalized.match(
      /^(?:receber\s+)?(?:metar\s+)?simplificado\s+([a-z0-9]{4})$/i,
    );
    if (simpleIcaoMatch) {
      const icao = normalizeIcao(simpleIcaoMatch[1]);
      if (icao.length === 4) return { action: "simplify", icao };
    }

    const startMatch = normalized.match(
      /^(?:acompanhar|monitorar|ouvir|watch)\s+(?:metar\s+)?([a-z0-9]{4})(?:\s+(\d+)\s*h(?:oras?)?)?$/i,
    );
    if (startMatch) {
      const icao = normalizeIcao(startMatch[1]);
      if (icao.length !== 4) continue;
      if (startMatch[2]) {
        const hours = Number(startMatch[2]);
        if (METAR_WATCH_HOURS.includes(hours)) return { action: "start", icao, hours };
        return null;
      }
      return { action: "choose_hours", icao };
    }

    const stopIcaoMatch = normalized.match(
      /^(?:parar|stop)\s+(?:acompanhamento\s+)?(?:metar\s+)?([a-z0-9]{4})$/i,
    );
    if (stopIcaoMatch) {
      const icao = normalizeIcao(stopIcaoMatch[1]);
      if (icao.length === 4) return { action: "stop", icao };
    }
  }
  return null;
}

function formatWppMetarWatchHoursMessage({ icao, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}por quanto tempo quer receber cada METAR/TAF novo de *${icao}*?`,
    "",
    "Durante a janela eu te aviso na hora quando sair boletim novo.",
    "",
    "Escolha 2, 4 ou 8 horas:",
  ].join("\n");
}

function formatWppMetarWatchStartedMessage({ icao, hours, expiresAt, nickname, activeIcaos }) {
  const greet = nickname ? `${nickname}, ` : "";
  const until = formatWppDateTime(expiresAt);
  const others = (Array.isArray(activeIcaos) ? activeIcaos : [])
    .map((code) => cleanString(code).toUpperCase())
    .filter((code) => code && code !== cleanString(icao).toUpperCase());
  const lines = [
    `${greet}acompanhamento de *${icao}* ativado por *${hours}h*.`,
    "",
    `Vou te mandar cada METAR ou TAF novo até *${until}*.`,
  ];
  if (others.length) {
    lines.push("", `Também ativos: ${others.map((code) => `*${code}*`).join(", ")}`);
  } else {
    lines.push("", "Pode ativar outros aeródromos ao mesmo tempo (ex.: *Acompanhar SBSP*).");
  }
  lines.push("", "Para encerrar este, toque em *Parar* ou envie *Parar acompanhamento*.");
  return lines.join("\n");
}

function formatWppMetarWatchStoppedMessage({ icao, icaos, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  const list = Array.isArray(icaos) ? icaos.map((code) => cleanString(code).toUpperCase()).filter(Boolean) : [];
  if (icao) {
    return `${greet}parei o acompanhamento de METAR/TAF de *${icao}*.`;
  }
  if (list.length === 1) {
    return `${greet}parei o acompanhamento de METAR/TAF de *${list[0]}*.`;
  }
  if (list.length > 1) {
    return `${greet}parei o acompanhamento de METAR/TAF de ${list.map((code) => `*${code}*`).join(", ")}.`;
  }
  return `${greet}parei o acompanhamento de METAR/TAF.`;
}

function formatWppMetarWatchExpiredMessage({ icao, hours, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}o acompanhamento de *${icao}* (${hours}h) encerrou.`,
    "",
    `Se quiser continuar, envie *Metar ${icao}* e toque em *Acompanhar*.`,
  ].join("\n");
}

function formatWppMetarWatchUpdatePrefix({ icao, changedMetar, changedTaf }) {
  const parts = [];
  if (changedMetar) parts.push("METAR");
  if (changedTaf) parts.push("TAF");
  const what = parts.length ? parts.join(" + ") : "METAR/TAF";
  return `🔔 *Novo ${what}* · *${icao}*`;
}

/** "Metar" / "Outro Metar" sem ICAO → ajuda de uso. */
function parseWppMetarHelpCommand(text, responseId = "") {
  const candidates = [cleanString(text), cleanString(responseId)].filter(Boolean);
  for (const raw of candidates) {
    const normalized = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (
      normalized === "metar" ||
      normalized === "outro metar" ||
      normalized === "outro_metar" ||
      normalized === "help_metar" ||
      normalized === "como metar"
    ) {
      return { kind: "metar_help" };
    }
  }
  return null;
}

function formatWppMetarHelpMessage(nickname) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}para consultar o METAR de um aeródromo, envie:`,
    "",
    "*Metar {ICAO}* ou *Metar {cidade/nome}*",
    "",
    "Exemplos:",
    "• Metar SBSP",
    "• Metar Paraty",
    "• Metar Congonhas",
    "",
    "Se você mandar o nome da cidade, eu mostro até 3 aeródromos parecidos pra você escolher.",
    "",
    "Depois você também pode pedir:",
    "• *Notam SBSP* — últimos NOTAMs",
    "• *Detalhes SBSP* — operação, frequências e pistas",
    "• *Rota SBJD SBLO* — traçar rota via REAs (mapa, tabela, perfil e campos FPL)",
    "• *Rota SBJD SDCO SDPW* — mesma coisa com pontos em sequência",
    "• *Acompanhar SBSP* — avisar cada METAR/TAF novo por 2, 4 ou 8 horas (pode ativar vários aeródromos)",
    "• *Parar acompanhamento* — encerrar o(s) listener(s)",
  ].join("\n");
}

function scoreAerodromeMatch(item, queryNorm) {
  if (!queryNorm) return 0;
  const icao = normalizeSearchText(item?.icao);
  const city = normalizeSearchText(item?.city);
  const name = normalizeSearchText(item?.name);
  const uf = normalizeSearchText(item?.uf);
  const haystack = `${icao} ${city} ${name} ${uf}`.trim();
  let score = 0;

  if (icao === queryNorm) score += 120;
  if (city === queryNorm) score += 90;
  if (name === queryNorm) score += 80;
  if (city.startsWith(queryNorm)) score += 55;
  if (name.startsWith(queryNorm)) score += 45;
  if (city.includes(queryNorm)) score += 35;
  if (name.includes(queryNorm)) score += 28;
  if (icao.startsWith(queryNorm)) score += 22;
  if (haystack.includes(queryNorm)) score += 8;

  const tokens = queryNorm.split(/\s+/).filter((token) => token.length >= 2);
  for (const token of tokens) {
    if (icao === token) score += 50;
    if (city === token) score += 40;
    else if (city.startsWith(token)) score += 22;
    else if (city.includes(token)) score += 14;
    if (name === token) score += 30;
    else if (name.startsWith(token)) score += 16;
    else if (name.includes(token)) score += 10;
    if (uf === token) score += 12;
  }

  if (normalizeSearchText(item?.status) === "ativo") score += 3;
  if (icao.startsWith("sb")) score += 1;
  return score;
}

/** Ranqueia aeródromos pelo nome/cidade/ICAO e devolve os melhores. */
function rankAerodromeMatches(aerodromes, query, limit = 3) {
  const queryNorm = normalizeSearchText(query);
  if (!queryNorm) return [];
  const minScore = queryNorm.length <= 2 ? 40 : 18;
  const scored = [];
  for (const item of Array.isArray(aerodromes) ? aerodromes : []) {
    const icao = normalizeIcao(item?.icao);
    if (!icao || icao.length !== 4) continue;
    const score = scoreAerodromeMatch({ ...item, icao }, queryNorm);
    if (score < minScore) continue;
    scored.push({
      icao,
      name: cleanString(item?.name) || null,
      city: cleanString(item?.city) || null,
      uf: cleanString(item?.uf).toUpperCase() || null,
      status: cleanString(item?.status) || null,
      score,
    });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.icao.startsWith("SB") !== b.icao.startsWith("SB")) return a.icao.startsWith("SB") ? -1 : 1;
    return a.icao.localeCompare(b.icao);
  });
  const seen = new Set();
  const unique = [];
  for (const item of scored) {
    if (seen.has(item.icao)) continue;
    seen.add(item.icao);
    unique.push(item);
    if (unique.length >= Math.max(1, Number(limit) || 3)) break;
  }
  return unique;
}

function formatAerodromeChoiceLabel(match) {
  const place = [cleanString(match?.city), cleanString(match?.uf).toUpperCase()].filter(Boolean).join("/");
  const name = cleanString(match?.name);
  const city = cleanString(match?.city);
  const showName = Boolean(name && normalizeSearchText(name) !== normalizeSearchText(city));
  return [cleanString(match?.icao), showName ? name : null, place ? `(${place})` : null].filter(Boolean).join(" ");
}

function formatAerodromeButtonTitle(match) {
  const icao = cleanString(match?.icao).toUpperCase();
  const place = cleanString(match?.city || match?.name);
  const title = place ? `${icao} ${place}` : icao;
  return title.slice(0, 20);
}

function aiswebCommandVerb(kind) {
  if (kind === "notam") return "Notam";
  if (kind === "details") return "Detalhes";
  return "Metar";
}

function formatWppAerodromeChoiceMessage({ kind, query, matches, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  const verb = aiswebCommandVerb(kind);
  const lines = [
    `${greet}encontrei estes aeródromos para *${cleanString(query)}*:`,
    "",
  ];
  (Array.isArray(matches) ? matches : []).forEach((match, index) => {
    lines.push(`${index + 1}. *${formatAerodromeChoiceLabel(match)}*`);
  });
  lines.push("", `Toque em uma opção para eu gerar o ${verb}:`);
  return lines.join("\n");
}

function normalizeAiswebCommandKind(value) {
  const key = cleanString(value).toLowerCase();
  if (key === "metar") return "metar";
  if (key === "notam" || key === "notams") return "notam";
  if (key === "detalhe" || key === "detalhes" || key === "aerodromo") return "details";
  return null;
}

/** @deprecated use parseWppAiswebCommand */
function parseWppMetarCommand(text) {
  const parsed = parseWppAiswebCommand(text);
  return parsed?.kind === "metar" ? { icao: parsed.icao } : null;
}

function windComponents(windFromDeg, runwayHeadingDeg, speedKt) {
  const rad = ((windFromDeg - runwayHeadingDeg) * Math.PI) / 180;
  return {
    crosswindKt: Math.round(Math.abs(Math.sin(rad) * speedKt)),
    headwindKt: Math.round(Math.cos(rad) * speedKt),
  };
}

function analyzeWindVsRunways(parsed, runways) {
  const empty = {
    bestIdent: null,
    bestHeadingDeg: null,
    crosswindKt: null,
    headwindKt: null,
    isCrosswind: false,
    options: [],
  };
  if (!parsed || parsed.windSpeedKt == null) return empty;
  const speed = parsed.windGustKt ?? parsed.windSpeedKt;
  const windDir = parsed.windDirDeg;
  if (windDir == null) {
    return { ...empty, isCrosswind: speed >= CROSSWIND_THRESHOLD_KT };
  }

  const options = [];
  for (const runway of Array.isArray(runways) ? runways : []) {
    for (const threshold of Array.isArray(runway?.thresholds) ? runway.thresholds : []) {
      const heading = Number(threshold?.headingDeg);
      const ident = cleanString(threshold?.ident || runway?.ident);
      if (!Number.isFinite(heading) || !ident) continue;
      const comps = windComponents(windDir, heading, speed);
      options.push({
        ident,
        headingDeg: heading,
        crosswindKt: comps.crosswindKt,
        headwindKt: comps.headwindKt,
      });
    }
  }

  if (!options.length) {
    return { ...empty, isCrosswind: false };
  }

  options.sort((a, b) => {
    const aHead = a.headwindKt >= 0 ? 1 : 0;
    const bHead = b.headwindKt >= 0 ? 1 : 0;
    if (aHead !== bHead) return bHead - aHead;
    if (a.crosswindKt !== b.crosswindKt) return a.crosswindKt - b.crosswindKt;
    return b.headwindKt - a.headwindKt;
  });
  const best = options[0];
  return {
    bestIdent: best.ident,
    bestHeadingDeg: best.headingDeg,
    crosswindKt: best.crosswindKt,
    headwindKt: best.headwindKt,
    isCrosswind: best.crosswindKt >= CROSSWIND_THRESHOLD_KT,
    options,
  };
}

function evaluateMinimums(parsed, minimums, options = {}) {
  const analysis = analyzeWindVsRunways(parsed, options?.rotaer?.runways);
  const windSpeed = parsed?.windGustKt ?? parsed?.windSpeedKt ?? null;
  const hasCrosswind = analysis.crosswindKt != null && analysis.bestIdent != null;

  return (Array.isArray(minimums) ? minimums : []).map((min) => {
    const crosswindLimit = min.maxWindKt / 2;
    const reasons = [];

    let ceilingOk = null;
    if (!parsed) {
      ceilingOk = null;
    } else if (parsed.ceilingFt == null) {
      // Sem BKN/OVC/VV = teto ilimitado → dentro do mínimo.
      ceilingOk = true;
    } else if (parsed.ceilingFt >= min.ceilingFt) {
      ceilingOk = true;
    } else {
      ceilingOk = false;
      reasons.push(`Teto ${parsed.ceilingFt.toLocaleString("pt-BR")} ft < mínimo ${min.ceilingFt.toLocaleString("pt-BR")} ft`);
    }

    let visibilityOk = null;
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

    let windOk = null;
    if (windSpeed == null) {
      windOk = null;
      reasons.push("Vento N/D no METAR");
    } else {
      const totalOk = windSpeed <= min.maxWindKt;
      if (!totalOk) reasons.push(`Vento ${windSpeed}kt > ${min.maxWindKt} kt`);
      let crossOk = null;
      if (hasCrosswind) {
        crossOk = analysis.crosswindKt <= crosswindLimit;
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
      condition: min.condition,
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

function formatWind(parsed) {
  if (!parsed || parsed.windSpeedKt == null) return "—";
  const dir = parsed.windDirDeg == null ? "VRB" : String(parsed.windDirDeg).padStart(3, "0");
  const base = `${dir}/${parsed.windSpeedKt}${parsed.windGustKt != null ? `G${parsed.windGustKt}` : ""}kt`;
  if (parsed.windVarFromDeg != null && parsed.windVarToDeg != null) {
    return `${base} ${String(parsed.windVarFromDeg).padStart(3, "0")}V${String(parsed.windVarToDeg).padStart(3, "0")}`;
  }
  return base;
}

function formatCeiling(parsed) {
  if (!parsed) return "—";
  if (parsed.cavok) return "CAVOK";
  if (parsed.ceilingFt == null) return "Ilimitado";
  return `${parsed.ceilingFt.toLocaleString("pt-BR")} ft`;
}

/** Quebra TAF em linhas em BECMG / TEMPO / FM / PROB. */
function formatTafForWhatsApp(rawTaf) {
  const taf = cleanString(rawTaf).replace(/\s+/g, " ");
  if (!taf) return "Indisponível";
  const broken = taf
    .replace(/\s+(BECMG|TEMPO|FM\d{6}|PROB\d{2})\b/gi, "\n$1")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return broken.join("\n");
}

function formatWppDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return cleanString(iso) || "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function utcHmToMinutes(hm) {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function sunNowPct(sun) {
  const rise = utcHmToMinutes(sun?.sunriseUtc);
  const set = utcHmToMinutes(sun?.sunsetUtc);
  if (rise == null || set == null) return null;
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (set > rise) {
    if (nowMin < rise || nowMin > set) return null;
    return ((nowMin - rise) / (set - rise)) * 100;
  }
  if (nowMin > set && nowMin < rise) return null;
  const span = 1440 - rise + set;
  const elapsed = nowMin >= rise ? nowMin - rise : 1440 - rise + nowMin;
  return (elapsed / span) * 100;
}

function statusEmoji(ok) {
  if (ok === true) return "✅";
  if (ok === false) return "❌";
  return "⚠️";
}

function limitLine(check) {
  const emoji = statusEmoji(check.overallOk);
  if (check.overallOk === true) return `${emoji} *${check.label}*`;
  if (check.overallOk === false) {
    const reason = check.reasons[0] ? ` — ${check.reasons[0]}` : "";
    return `${emoji} *${check.label}* — fora do min.${reason}`;
  }
  return `${emoji} *${check.label}* — dados insuficientes`;
}

function formatWppMetarMessage({ icao, airportName, met, checks, analysis, nickname }) {
  const greet = nickname ? `${nickname}, aqui` : "Aqui";
  const name = cleanString(airportName);
  const header = name ? `✈️ *${icao}* · ${name}` : `✈️ *${icao}*`;
  const parsed = met?.parsed || null;
  const vis =
    parsed?.visibilityKm != null
      ? `${parsed.visibilityKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`
      : "N/D";
  const ceiling = formatCeiling(parsed);
  const cloudsHint =
    parsed?.cloudsText && parsed.cloudsText !== "CAVOK" && parsed.cloudsText !== "N/D"
      ? ` (${parsed.cloudsText})`
      : "";
  const windLine = formatWind(parsed);
  const runwayHint = analysis?.bestIdent
    ? `Pista preferencial: *${analysis.bestIdent}*` +
      (analysis.crosswindKt != null ? ` · través ${analysis.crosswindKt} kt` : "") +
      (analysis.headwindKt != null
        ? ` · ${analysis.headwindKt >= 0 ? "proa" : "cauda"} ${Math.abs(analysis.headwindKt)} kt`
        : "")
    : null;

  const limitsBlock = (Array.isArray(checks) ? checks : []).map(limitLine).join("\n");
  const tafBlock = formatTafForWhatsApp(met?.taf)
    .split("\n")
    .map((line) => `\`${line}\``)
    .join("\n");

  return [
    `${greet} estão as condições de ${icao}:`,
    "",
    header,
    `💨 Vento: \`${windLine}\``,
    `👁️ Vis: ${vis}`,
    `☁️ Teto: *${ceiling}*${cloudsHint}`,
    runwayHint,
    "",
    "📋 *Limites operacionais*",
    limitsBlock || "Sem mínimos configurados.",
    "",
    "📡 *METAR*",
    `\`${cleanString(met?.metar) || "Indisponível"}\``,
    "",
    "🗓️ *TAF*",
    tafBlock,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function formatWppNotamsMessage({ icao, airportName, notams, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  const name = cleanString(airportName);
  const header = name ? `📢 *NOTAMs ${icao}* · ${name}` : `📢 *NOTAMs ${icao}*`;
  const list = Array.isArray(notams) ? notams.slice(0, 8) : [];
  if (!list.length) {
    return [
      `${greet}${header}`,
      "",
      "Nenhum NOTAM ativo encontrado agora.",
      "",
      `➡️ Envie *Detalhes ${icao}* ou *Metar ${icao}*`,
    ].join("\n");
  }

  const blocks = list.map((notam, index) => {
    const number = cleanString(notam.number || notam.id) || `#${index + 1}`;
    const validity = `${formatWppDateTime(notam.validFrom)} → ${formatWppDateTime(notam.validTo)}`;
    const text = cleanString(notam.text).slice(0, 420) || "Sem texto.";
    return [
      `*${index + 1}. ${number}*${notam.status ? ` · ${cleanString(notam.status)}` : ""}`,
      `Válido: ${validity}`,
      text,
    ].join("\n");
  });

  return [
    `${greet}${header}`,
    `Exibindo ${list.length} NOTAM${list.length === 1 ? "" : "s"} mais recente${list.length === 1 ? "" : "s"}.`,
    "",
    ...blocks.flatMap((block, i) => (i === 0 ? [block] : ["", block])),
    "",
    `➡️ Envie *Detalhes ${icao}* ou *Metar ${icao}*`,
  ].join("\n");
}

function formatWppAirportDetailsMessages({ icao, airport, nickname }) {
  const greet = nickname ? `${nickname}, ` : "";
  const rotaer = airport?.rotaer || null;
  const sun = airport?.sun || null;
  const name = [rotaer?.name, rotaer?.city, rotaer?.uf].map(cleanString).filter(Boolean).join(" · ");
  const header = name ? `ℹ️ *${icao}* · ${name}` : `ℹ️ *Detalhes ${icao}*`;

  const notams = Array.isArray(airport?.notams) ? airport.notams : [];
  let lastNotamAt = null;
  let bestTs = 0;
  for (const n of notams) {
    const iso = n.issuedAt || n.validFrom;
    const ts = Date.parse(iso || "") || 0;
    if (ts > bestTs) {
      bestTs = ts;
      lastNotamAt = iso;
    }
  }

  const runways = (rotaer?.runways || []).slice(0, 6).map((rwy) => {
    const dims =
      rwy.lengthM != null || rwy.widthM != null
        ? `${rwy.lengthM != null ? rwy.lengthM.toLocaleString("pt-BR") : "?"} × ${rwy.widthM != null ? rwy.widthM : "?"} m`
        : "";
    const surface = [rwy.surfaceLabel || rwy.surface, rwy.pcn ? `PCN ${rwy.pcn}` : null].filter(Boolean).join(" · ");
    return `• *${cleanString(rwy.ident)}*${dims ? ` — ${dims}` : ""}${surface ? `\n  ${surface}` : ""}`;
  });

  const frequencies = (rotaer?.frequencies || []).slice(0, 10).map((f) => {
    const freqs = (f.frequenciesMhz || []).join(" · ");
    return `• *${cleanString(f.service)}*${f.callsign ? ` (${cleanString(f.callsign)})` : ""}: ${freqs || "—"}`;
  });

  const remarks = (rotaer?.remarks || [])
    .slice(0, 6)
    .map((r) => `• ${cleanString(r.text).slice(0, 220)}`)
    .filter((line) => line.length > 2);

  const complements = (rotaer?.complements || [])
    .slice(0, 6)
    .map((c) => `• ${cleanString(c.text).slice(0, 220)}`)
    .filter((line) => line.length > 2);

  const coords =
    rotaer?.lat != null && rotaer?.lng != null
      ? `${Number(rotaer.lat).toFixed(5)}, ${Number(rotaer.lng).toFixed(5)}`
      : null;

  const messages = [
    [
      `${greet}${header}`,
      "",
      "🛫 *Operação*",
      `Tipo: ${cleanString(rotaer?.typeOpr) || "—"}`,
      `Utilização: ${cleanString(rotaer?.typeUtil) || "—"}`,
      `FIR: ${cleanString(rotaer?.fir) || "—"}`,
      `Elevação: ${rotaer?.altFt != null ? `${rotaer.altFt.toLocaleString("pt-BR")} ft` : "—"}`,
      `Último NOTAM: ${formatWppDateTime(lastNotamAt)}`,
      coords ? `Coords: \`${coords}\`` : null,
      "",
      "☀️ *Sol (UTC)*",
      sun?.sunriseUtc || sun?.sunsetUtc
        ? `Nascer ${sun?.sunriseUtc || "—"} · Pôr ${sun?.sunsetUtc || "—"}${sun?.date ? ` · ${sun.date}` : ""}`
        : "Indisponível",
    ]
      .filter((line) => line !== null)
      .join("\n"),
    [
      "📻 *Frequências*",
      frequencies.length ? frequencies.join("\n") : "Sem frequências COM no ROTAER.",
    ].join("\n"),
    [
      "🛬 *Pistas*",
      runways.length ? runways.join("\n") : "Sem dados de pista no ROTAER.",
    ].join("\n"),
  ];

  if (remarks.length || complements.length) {
    messages.push(
      [
        remarks.length ? ["📝 *RMKs*", ...remarks].join("\n") : null,
        complements.length ? ["📎 *Complementos*", ...complements].join("\n") : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  return messages;
}

/** @deprecated use formatWppAirportDetailsMessages */
function formatWppAirportDetailsMessage(params) {
  return formatWppAirportDetailsMessages(params).join("\n\n");
}

function latLngToTile(lat, lng, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, n };
}

function tilePixelOffset(lat, lng, zoom, tileSize = 256) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    x: (x - Math.floor(x)) * tileSize,
    y: (y - Math.floor(y)) * tileSize,
  };
}

async function fetchMapTileBuffer(z, x, y) {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "image/jpeg,image/png,*/*" },
  });
  if (!response.ok) throw new Error(`Falha ao baixar tile do mapa (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function goesSnapshotCandidateTimes(now = new Date()) {
  const times = [];
  const base = new Date(now.getTime());
  base.setUTCSeconds(0, 0);
  base.setUTCMinutes(Math.floor(base.getUTCMinutes() / 10) * 10);
  for (let i = 1; i <= 8; i += 1) {
    const at = new Date(base.getTime() - i * 10 * 60_000);
    times.push(at.toISOString().replace(/\.\d{3}Z$/, "Z"));
  }
  times.push(base.toISOString().slice(0, 10));
  const yesterday = new Date(base.getTime() - 86_400_000);
  times.push(yesterday.toISOString().slice(0, 10));
  return times;
}

async function fetchNasaWorldviewSnapshot({
  layer,
  lat,
  lng,
  width = 800,
  height = 600,
  degSpan = 2.4,
}) {
  const d = Number(degSpan);
  const bbox = `${Number(lng) - d},${Number(lat) - d},${Number(lng) + d},${Number(lat) + d}`;
  for (const time of goesSnapshotCandidateTimes()) {
    const url =
      `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot` +
      `&LAYERS=${encodeURIComponent(layer)}` +
      `&CRS=EPSG:4326` +
      `&TIME=${encodeURIComponent(time)}` +
      `&BBOX=${bbox}` +
      `&FORMAT=image/jpeg` +
      `&WIDTH=${width}` +
      `&HEIGHT=${height}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "image/jpeg,image/*" },
      });
      if (!response.ok) continue;
      const type = String(response.headers.get("content-type") || "");
      if (!type.includes("image/")) continue;
      // eslint-disable-next-line no-await-in-loop
      const buf = Buffer.from(await response.arrayBuffer());
      // Snapshots vazios/erro costumam ser bem pequenos.
      if (buf.length < 8_000) continue;
      return { buffer: buf, time, layer };
    } catch {
      // tenta próximo timestamp
    }
  }
  return null;
}

async function labelWeatherSnapshotJpeg(jpegBuffer, { icao, title, subtitle, credit }, sharpFactory) {
  if (!sharpFactory || !jpegBuffer) return null;
  const meta = await sharpFactory(jpegBuffer).metadata();
  const width = meta.width || 800;
  const height = meta.height || 600;
  const creditText = credit || `source: windy.com · ${icao}`;
  const labelSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="12" y="12" width="300" height="58" rx="10" fill="rgb(2 6 23)" fill-opacity="0.78"/>
  <text x="26" y="36" fill="white" font-size="16" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="26" y="56" fill="rgb(148 163 184)" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(subtitle || icao)}</text>
  <text x="${width - 14}" y="${height - 14}" text-anchor="end" fill="white" fill-opacity="0.8" font-size="11" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(creditText)}</text>
</svg>`);
  return sharpFactory(jpegBuffer)
    .composite([{ input: labelSvg, left: 0, top: 0 }])
    .jpeg({ quality: 84 })
    .toBuffer();
}

function buildWindyEmbedScreenshotUrl({ lat, lng, zoom = 8, overlay = "clouds", marker = true }) {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    detailLat: String(lat),
    detailLon: String(lng),
    zoom: String(zoom),
    level: "surface",
    overlay: String(overlay),
    product: "ecmwf",
    menu: "",
    message: "",
    marker: marker ? "true" : "",
    calendar: "now",
    pressure: "",
    type: "map",
    location: "coordinates",
    detail: "",
    metricWind: "kt",
    metricTemp: "°C",
    radarRange: "-1",
  });
  return `https://embed.windy.com/embed2.html?${query.toString()}`;
}

async function captureBufferFromScreenshotFn(captureScreenshot, url) {
  if (typeof captureScreenshot !== "function") return null;
  const raw = await captureScreenshot(url);
  if (!raw) return null;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length < 8_000) return null;
  return buf;
}

/**
 * Snapshots Windy (nuvens + satélite) centrados no aeródromo.
 * Preferência: screenshot headless do embed Windy (via Appwrite Avatars).
 * Fallback: NASA Worldview/GOES se o screenshot falhar.
 */
async function buildMetarWeatherMapSnapshots(lat, lng, icao, sharpFactory, options = {}) {
  if (!sharpFactory) throw new Error("Sharp indisponível.");
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return null;
  }
  const safeIcao = normalizeIcao(icao) || "AD";
  const zoom = Number(options.zoom) || 8;
  const captureScreenshot = options.captureScreenshot;
  const latN = Number(lat);
  const lngN = Number(lng);

  const cloudsEmbed = buildWindyEmbedScreenshotUrl({
    lat: latN,
    lng: lngN,
    zoom,
    overlay: "clouds",
    marker: true,
  });
  const satEmbed = buildWindyEmbedScreenshotUrl({
    lat: latN,
    lng: lngN,
    zoom,
    overlay: "satellite",
    marker: true,
  });

  let cloudsRaw = null;
  let satRaw = null;
  let source = "windy";

  try {
    // Sequencial: o serviço de screenshot é mais estável assim, e o Windy precisa de sleep.
    const cloudsBuf = await captureBufferFromScreenshotFn(captureScreenshot, cloudsEmbed);
    const satBuf = await captureBufferFromScreenshotFn(captureScreenshot, satEmbed);
    if (cloudsBuf) cloudsRaw = { buffer: cloudsBuf, label: "Windy · Nuvens" };
    if (satBuf) satRaw = { buffer: satBuf, label: "Windy · Satélite" };
  } catch (err) {
    console.warn(
      `[wppMetar] windy screenshot failed icao=${safeIcao} error=${String(err?.message || err).slice(0, 200)}`,
    );
  }

  if (!cloudsRaw && !satRaw) {
    source = "goes_fallback";
    const [goesClouds, goesSat] = await Promise.all([
      fetchNasaWorldviewSnapshot({
        layer: "GOES-East_ABI_Band13_Clean_Infrared",
        lat: latN,
        lng: lngN,
      }),
      fetchNasaWorldviewSnapshot({
        layer: "GOES-East_ABI_GeoColor",
        lat: latN,
        lng: lngN,
      }),
    ]);
    if (goesClouds) cloudsRaw = { buffer: goesClouds.buffer, label: `GOES IR · ${goesClouds.time || ""}`.trim() };
    if (goesSat) satRaw = { buffer: goesSat.buffer, label: `GOES GeoColor · ${goesSat.time || ""}`.trim() };
  }

  const credit = source === "windy" ? `source: windy.com · ${safeIcao}` : `source: NASA/NOAA GOES · ${safeIcao}`;
  const [cloudsJpeg, satelliteJpeg] = await Promise.all([
    cloudsRaw
      ? labelWeatherSnapshotJpeg(
          cloudsRaw.buffer,
          {
            icao: safeIcao,
            title: source === "windy" ? `Nuvens · ${safeIcao}` : `Nuvens IR · ${safeIcao}`,
            subtitle: cloudsRaw.label,
            credit,
          },
          sharpFactory,
        )
      : null,
    satRaw
      ? labelWeatherSnapshotJpeg(
          satRaw.buffer,
          {
            icao: safeIcao,
            title: `Satélite · ${safeIcao}`,
            subtitle: satRaw.label,
            credit,
          },
          sharpFactory,
        )
      : null,
  ]);

  if (!cloudsJpeg && !satelliteJpeg) return null;
  return { cloudsJpeg, satelliteJpeg, source };
}

/**
 * Monta imagem satélite 3x3 tiles (estilo da aba Detalhes) com marcador do aeródromo.
 * Retorna PNG buffer — o caller faz upload.
 */
async function buildAirportMapPng(lat, lng, icao, sharpFactory) {
  if (!sharpFactory) throw new Error("Sharp indisponível.");
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return null;
  }
  const zoom = 14;
  const tileSize = 256;
  const grid = 3;
  const center = latLngToTile(Number(lat), Number(lng), zoom);
  const offset = tilePixelOffset(Number(lat), Number(lng), zoom, tileSize);
  const startX = center.x - 1;
  const startY = center.y - 1;

  const tiles = [];
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const tx = startX + col;
      const ty = startY + row;
      // eslint-disable-next-line no-await-in-loop
      const buf = await fetchMapTileBuffer(zoom, tx, ty);
      tiles.push({
        input: buf,
        left: col * tileSize,
        top: row * tileSize,
      });
    }
  }

  const width = grid * tileSize;
  const height = grid * tileSize;
  const markerX = Math.round(tileSize + offset.x);
  const markerY = Math.round(tileSize + offset.y);
  const markerSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <circle cx="${markerX}" cy="${markerY}" r="16" fill="rgb(34 211 238)" fill-opacity="0.25" stroke="rgb(255 255 255)" stroke-width="2"/>
  <circle cx="${markerX}" cy="${markerY}" r="7" fill="rgb(14 165 233)" stroke="white" stroke-width="2.5"/>
  <rect x="${Math.max(12, markerX - 46)}" y="${Math.max(12, markerY - 48)}" width="92" height="26" rx="8" fill="rgb(2 6 23)" fill-opacity="0.78"/>
  <text x="${markerX}" y="${Math.max(30, markerY - 30)}" text-anchor="middle" fill="white" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(icao)}</text>
</svg>`);

  return sharpFactory({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 15, g: 23, b: 42 },
    },
  })
    .composite([...tiles, { input: markerSvg, left: 0, top: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

function coverFillFraction(cover) {
  switch (cover) {
    case "FEW":
      return 1.5 / 8;
    case "SCT":
      return 0.35;
    case "BKN":
      return 6 / 8;
    case "OVC":
    case "VV":
      return 1;
    default:
      return 0.3;
  }
}

function primaryRunways(runways) {
  const list = Array.isArray(runways) ? runways : [];
  if (!list.length) return [];
  return [...list].sort((a, b) => (b.lengthM || 0) - (a.lengthM || 0)).slice(0, 2);
}

function windVariationSectorPath(cx, cy, rInner, rOuter, fromDeg, toDeg) {
  let sweep = ((toDeg - fromDeg) % 360 + 360) % 360;
  if (sweep === 0) sweep = 360;
  const large = sweep > 180 ? 1 : 0;
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const a0 = toRad(fromDeg);
  const a1 = toRad(fromDeg + sweep);
  const x0o = cx + Math.cos(a0) * rOuter;
  const y0o = cy + Math.sin(a0) * rOuter;
  const x1o = cx + Math.cos(a1) * rOuter;
  const y1o = cy + Math.sin(a1) * rOuter;
  const x1i = cx + Math.cos(a1) * rInner;
  const y1i = cy + Math.sin(a1) * rInner;
  const x0i = cx + Math.cos(a0) * rInner;
  const y0i = cy + Math.sin(a0) * rInner;
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildWindRoseSvg(parsed, rotaer, analysis) {
  const size = 560;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 170;
  const windDir = parsed?.windDirDeg;
  const windSpeed = parsed?.windSpeedKt ?? null;
  const windGust = parsed?.windGustKt ?? null;
  const windRotate = windDir == null ? 0 : windDir;
  const varFrom = parsed?.windVarFromDeg;
  const varTo = parsed?.windVarToDeg;
  const hasVar = varFrom != null && varTo != null;
  const runways = primaryRunways(rotaer?.runways);
  const windLabel = escapeXml(formatWind(parsed));
  const icao = escapeXml(cleanString(rotaer?.icao) || "");

  const ticks = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      const x1 = cx + Math.cos(rad) * (r - 8);
      const y1 = cy + Math.sin(rad) * (r - 8);
      const x2 = cx + Math.cos(rad) * (r + 6);
      const y2 = cy + Math.sin(rad) * (r + 6);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgb(100 116 139)" stroke-width="2"/>`;
    })
    .join("");

  const labels = [
    { deg: 0, text: "N" },
    { deg: 90, text: "L" },
    { deg: 180, text: "S" },
    { deg: 270, text: "O" },
  ]
    .map((item) => {
      const rad = ((item.deg - 90) * Math.PI) / 180;
      const x = cx + Math.cos(rad) * (r + 28);
      const y = cy + Math.sin(rad) * (r + 28);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="rgb(148 163 184)" font-size="18" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${item.text}</text>`;
    })
    .join("");

  const runwayShapes = runways
    .map((runway, idx) => {
      const thresholds = Array.isArray(runway.thresholds) ? runway.thresholds : [];
      const thrA = thresholds[0] || null;
      const thrB = thresholds[1] || null;
      const parsedHeading = Number(thrA?.headingDeg);
      const identMatch = cleanString(runway.ident).match(/^(\d{2})/);
      const fallbackHeading = identMatch ? Number(identMatch[1]) * 10 : null;
      const heading = Number.isFinite(parsedHeading)
        ? parsedHeading
        : Number.isFinite(fallbackHeading)
          ? (fallbackHeading === 360 ? 0 : fallbackHeading)
          : null;
      if (heading == null) return "";
      const len = idx === 0 ? r * 1.55 : r * 1.35;
      const width = idx === 0 ? 28 : 20;
      const labelA = escapeXml(cleanString(thrA?.ident));
      const labelB = escapeXml(cleanString(thrB?.ident));
      // Strip is N–S before rotate(thrA.heading). thrA belongs at the south end
      // (approach from south when heading=0 / RWY 36); thrB at the north end.
      return `
        <g transform="rotate(${heading} ${cx} ${cy})">
          <rect x="${cx - width / 2}" y="${cy - len / 2}" width="${width}" height="${len}" rx="4" fill="url(#wpp-rwy)" opacity="0.92"/>
          <line x1="${cx}" y1="${cy - len / 2 + 14}" x2="${cx}" y2="${cy + len / 2 - 14}" stroke="rgb(226 232 240)" stroke-width="2" stroke-dasharray="10 10" opacity="0.7"/>
          ${labelA ? `<g transform="rotate(${-heading} ${cx} ${cy + len / 2 + 14})">
            <text x="${cx}" y="${cy + len / 2 + 18}" text-anchor="middle" dominant-baseline="middle" fill="rgb(226 232 240)" font-size="14" font-family="ui-monospace,monospace" font-weight="700">${labelA}</text>
          </g>` : ""}
          ${labelB ? `<g transform="rotate(${-heading} ${cx} ${cy - len / 2 - 6})">
            <text x="${cx}" y="${cy - len / 2 - 10}" text-anchor="middle" dominant-baseline="middle" fill="rgb(226 232 240)" font-size="14" font-family="ui-monospace,monospace" font-weight="700">${labelB}</text>
          </g>` : ""}
        </g>`;
    })
    .join("");

  const varSector =
    hasVar
      ? `<path d="${windVariationSectorPath(cx, cy, r - 10, r + 18, varFrom, varTo)}" fill="url(#wpp-var-fill)" stroke="rgb(56 189 248 / 0.55)" stroke-width="1.5"/>`
      : "";

  const windArrow =
    windSpeed != null
      ? `
      <g transform="rotate(${windRotate} ${cx} ${cy})">
        <line x1="${cx}" y1="${cy - r + 28}" x2="${cx}" y2="${cy - 55}" stroke="rgb(56 189 248)" stroke-width="5" stroke-linecap="round" opacity="0.95"/>
        <path d="M ${cx} ${cy - 34} L ${cx - 16} ${cy - 66} L ${cx} ${cy - 54} L ${cx + 16} ${cy - 66} Z" fill="rgb(56 189 248)" stroke="rgb(186 230 253)" stroke-width="1.2"/>
        ${[0, 1, 2, 3].map((i) => {
          const y = cy - r + 34 + i * 18;
          return `<path d="M ${cx} ${y} L ${cx - 8} ${y - 14} M ${cx} ${y} L ${cx + 8} ${y - 14}" stroke="rgb(125 211 252)" stroke-width="${3 - i * 0.35}" stroke-linecap="round" fill="none" opacity="${0.95 - i * 0.12}"/>`;
        }).join("")}
      </g>`
      : "";

  const centerLabel = windSpeed == null ? "—" : String(windSpeed);
  const centerSub = windGust != null ? `G${windGust}` : "kt";
  const bestHint = analysis?.bestIdent
    ? `Em uso: ${escapeXml(analysis.bestIdent)}${
        analysis.crosswindKt != null ? ` · través ${analysis.crosswindKt} kt` : ""
      }`
    : "Sem cabeceiras ROTAER";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 70}" viewBox="0 0 ${size} ${size + 70}">
  <defs>
    <radialGradient id="wpp-wind-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgb(56 189 248)" stop-opacity="0.22"/>
      <stop offset="70%" stop-color="rgb(15 23 42)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wpp-rwy" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgb(71 85 105)"/>
      <stop offset="50%" stop-color="rgb(148 163 184)"/>
      <stop offset="100%" stop-color="rgb(71 85 105)"/>
    </linearGradient>
    <linearGradient id="wpp-var-fill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgb(56 189 248)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="rgb(14 165 233)" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#020617"/>
  <text x="28" y="36" fill="rgb(100 116 139)" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" letter-spacing="1.5">VENTO${icao ? ` · ${icao}` : ""}</text>
  <text x="${size - 28}" y="36" text-anchor="end" fill="rgb(203 213 225)" font-size="16" font-family="ui-monospace,monospace">${windLabel}</text>
  <circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="url(#wpp-wind-glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(2 6 23)" stroke="rgb(71 85 105)" stroke-width="2.5"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 26}" fill="none" stroke="rgb(51 65 85)" stroke-dasharray="4 10"/>
  ${varSector}
  ${ticks}
  ${labels}
  ${runwayShapes}
  ${windArrow}
  <circle cx="${cx}" cy="${cy}" r="46" fill="rgb(15 23 42)" stroke="rgb(56 189 248)" stroke-width="2" opacity="0.95"/>
  <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="rgb(241 245 249)" font-size="28" font-family="ui-monospace,monospace" font-weight="700">${escapeXml(centerLabel)}</text>
  <text x="${cx}" y="${cy + 22}" text-anchor="middle" fill="rgb(100 116 139)" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="600">${escapeXml(centerSub)}</text>
  <text x="${cx}" y="${size + 42}" text-anchor="middle" fill="rgb(148 163 184)" font-size="15" font-family="ui-sans-serif,system-ui,sans-serif">${bestHint}</text>
</svg>`;
}

function cloudPuffsSvg(layer, uid, y, fillFraction) {
  const W = 920;
  const H = 90;
  const cover = layer.cover;
  const isCb = layer.convect === "CB";
  const isTcu = layer.convect === "TCU";

  if (isCb) {
    const cellW = Math.max(160, fillFraction * W);
    const x0 = (W - cellW) / 2;
    return `
      <g transform="translate(40 ${y})">
        <defs>
          <linearGradient id="${uid}-cb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(248 250 252)" stop-opacity="0.95"/>
            <stop offset="40%" stop-color="rgb(148 163 184)" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="rgb(51 65 85)" stop-opacity="0.85"/>
          </linearGradient>
        </defs>
        <path d="M ${x0} 28 C ${x0 + cellW * 0.12} 8 ${x0 + cellW * 0.28} 4 ${x0 + cellW * 0.5} 12 C ${x0 + cellW * 0.72} 4 ${x0 + cellW * 0.88} 8 ${x0 + cellW} 28 C ${x0 + cellW * 0.98} 36 ${x0 + cellW * 0.9} 42 ${x0 + cellW * 0.82} 40 C ${x0 + cellW * 0.65} 38 ${x0 + cellW * 0.55} 44 ${x0 + cellW * 0.5} 42 C ${x0 + cellW * 0.4} 44 ${x0 + cellW * 0.28} 36 ${x0 + cellW * 0.16} 40 C ${x0 + cellW * 0.06} 42 ${x0 + 2} 36 ${x0} 28 Z" fill="url(#${uid}-cb)" stroke="rgb(251 113 133)" stroke-opacity="0.45"/>
        <path d="M ${x0 + cellW * 0.32} 40 C ${x0 + cellW * 0.28} 58 ${x0 + cellW * 0.3} 72 ${x0 + cellW * 0.34} 86 C ${x0 + cellW * 0.38} 92 ${x0 + cellW * 0.46} 94 ${x0 + cellW * 0.5} 88 C ${x0 + cellW * 0.54} 94 ${x0 + cellW * 0.62} 92 ${x0 + cellW * 0.66} 86 C ${x0 + cellW * 0.7} 72 ${x0 + cellW * 0.72} 58 ${x0 + cellW * 0.68} 40 C ${x0 + cellW * 0.58} 44 ${x0 + cellW * 0.42} 44 ${x0 + cellW * 0.32} 40 Z" fill="url(#${uid}-cb)" stroke="rgb(251 113 133)" stroke-opacity="0.5"/>
      </g>`;
  }

  if (isTcu) {
    const cellW = Math.max(180, fillFraction * W * 0.75);
    const x0 = (W - cellW) / 2;
    return `
      <g transform="translate(40 ${y})">
        <defs>
          <linearGradient id="${uid}-tcu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(100 116 139)" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="rgb(15 23 42)" stop-opacity="0.95"/>
          </linearGradient>
        </defs>
        <ellipse cx="${x0 + cellW * 0.5}" cy="22" rx="${cellW * 0.22}" ry="18" fill="url(#${uid}-tcu)"/>
        <ellipse cx="${x0 + cellW * 0.38}" cy="38" rx="${cellW * 0.2}" ry="16" fill="url(#${uid}-tcu)"/>
        <ellipse cx="${x0 + cellW * 0.62}" cy="38" rx="${cellW * 0.2}" ry="16" fill="url(#${uid}-tcu)"/>
        <ellipse cx="${x0 + cellW * 0.5}" cy="56" rx="${cellW * 0.28}" ry="18" fill="url(#${uid}-tcu)"/>
        <ellipse cx="${x0 + cellW * 0.5}" cy="74" rx="${cellW * 0.36}" ry="16" fill="url(#${uid}-tcu)"/>
      </g>`;
  }

  const puffCount = cover === "FEW" ? 2 : cover === "SCT" ? 4 : cover === "BKN" ? 5 : 6;
  const totalCloudW = Math.min(W, fillFraction * W);
  const puffW = cover === "OVC" || cover === "VV" ? W / puffCount : totalCloudW / puffCount;
  const gapTotal = cover === "OVC" || cover === "VV" ? 0 : W - totalCloudW;
  const gap = puffCount > 1 ? gapTotal / (puffCount - 1) : 0;
  const positions = [];
  if (cover === "OVC" || cover === "VV") {
    for (let i = 0; i < puffCount; i++) positions.push(i * puffW - puffW * 0.15);
  } else {
    for (let i = 0; i < puffCount; i++) positions.push(i * (puffW + gap));
  }

  const puffs = positions
    .map((x, i) => {
      const w = cover === "OVC" || cover === "VV" ? puffW * 1.35 : puffW;
      const cy = 42 + (i % 2) * 5;
      return `
        <ellipse cx="${x + w * 0.45}" cy="${cy}" rx="${w * 0.42}" ry="${18 + (cover === "SCT" ? 4 : 0)}" fill="url(#${uid}-fill)"/>
        <ellipse cx="${x + w * 0.68}" cy="${cy - 8}" rx="${w * 0.28}" ry="14" fill="url(#${uid}-fill)" opacity="0.9"/>
        <ellipse cx="${x + w * 0.22}" cy="${cy + 3}" rx="${w * 0.26}" ry="13" fill="url(#${uid}-fill)" opacity="0.88"/>`;
    })
    .join("");

  return `
    <g transform="translate(40 ${y})">
      <defs>
        <linearGradient id="${uid}-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(248 250 252)" stop-opacity="${cover === "OVC" ? 0.98 : 0.9}"/>
          <stop offset="100%" stop-color="rgb(71 85 105)" stop-opacity="${cover === "FEW" ? 0.5 : 0.8}"/>
        </linearGradient>
      </defs>
      ${puffs}
    </g>`;
}

function buildCloudStackSvg(parsed, icaoCode) {
  const width = 1000;
  const height = 560;
  const cavok = parsed?.cavok === true;
  const layers = (parsed?.clouds || []).filter((c) => c.heightFt != null && c.heightFt > 0);
  const maxFt = Math.max(
    8000,
    ...layers.map((c) => c.heightFt || 0),
    parsed?.ceilingFt && parsed.ceilingFt < 10000 ? parsed.ceilingFt : 0,
  );
  const scaleMax = Math.ceil(maxFt / 1000) * 1000 || 8000;
  const marks = Array.from({ length: Math.floor(scaleMax / 2000) + 1 }, (_, i) => i * 2000);
  const titleRight = cavok
    ? "CAVOK"
    : parsed?.ceilingFt != null && parsed.ceilingFt < 10000
      ? `Ceiling ${parsed.ceilingFt.toLocaleString("pt-BR")} ft`
      : parsed
        ? "Ilimitado"
        : "—";

  const markLines = marks
    .map((ft) => {
      const top = 70 + (1 - ft / scaleMax) * 400;
      return `
        <line x1="40" y1="${top}" x2="${width - 40}" y2="${top}" stroke="rgb(51 65 85)" stroke-dasharray="3 8" stroke-width="1"/>
        <text x="${width - 48}" y="${top - 4}" text-anchor="end" fill="rgb(100 116 139)" font-size="12" font-family="ui-monospace,monospace">${(ft / 1000).toFixed(0)}k</text>`;
    })
    .join("");

  const layerShapes = layers
    .map((layer, index) => {
      const top = 70 + (1 - layer.heightFt / scaleMax) * 400 - 20;
      const label = `${layer.cover}${layer.heightFt != null ? String(Math.round(layer.heightFt / 100)).padStart(3, "0") : ""}${layer.convect || ""}`;
      return `
        ${cloudPuffsSvg(layer, `c${index}`, top, coverFillFraction(layer.cover))}
        <text x="48" y="${top + 18}" fill="rgb(125 211 252)" font-size="13" font-family="ui-monospace,monospace" font-weight="700">${escapeXml(label)}</text>
        <text x="48" y="${top + 36}" fill="rgb(148 163 184)" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(String(layer.heightFt.toLocaleString("pt-BR")))} ft</text>`;
    })
    .join("");

  const emptyState =
    !layers.length
      ? `<text x="${width / 2}" y="300" text-anchor="middle" fill="rgb(100 116 139)" font-size="18" font-family="ui-sans-serif,system-ui,sans-serif">${
          cavok ? "CAVOK — sem camadas significativas" : "Sem camadas de nuvens reportadas"
        }</text>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wpp-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(15 23 42)"/>
      <stop offset="70%" stop-color="rgb(2 6 23)"/>
      <stop offset="100%" stop-color="rgb(69 26 3)" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#020617"/>
  <rect x="24" y="56" width="${width - 48}" height="440" rx="16" fill="url(#wpp-sky)" stroke="rgb(30 41 59)" stroke-width="2"/>
  <text x="28" y="36" fill="rgb(100 116 139)" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" letter-spacing="1.5">CEILING / CLOUDS${icaoCode ? ` · ${escapeXml(icaoCode)}` : ""}</text>
  <text x="${width - 28}" y="36" text-anchor="end" fill="rgb(203 213 225)" font-size="16" font-family="ui-monospace,monospace">${escapeXml(titleRight)}</text>
  ${markLines}
  ${layerShapes}
  ${emptyState}
  <rect x="24" y="496" width="${width - 48}" height="8" rx="4" fill="rgb(120 53 15)" opacity="0.45"/>
</svg>`;
}

function buildSunCardSvg(sun, icaoCode) {
  const width = 720;
  const height = 360;
  const sunrise = cleanString(sun?.sunriseUtc) || "—";
  const sunset = cleanString(sun?.sunsetUtc) || "—";
  const dateLabel = cleanString(sun?.date);
  const pct = sunNowPct(sun);
  const trackLeft = 56;
  const trackRight = width - 56;
  const trackY = 130;
  const trackW = trackRight - trackLeft;
  const nowX = pct == null ? null : trackLeft + (Math.min(100, Math.max(0, pct)) / 100) * trackW;
  const hasData = Boolean(sun?.sunriseUtc || sun?.sunsetUtc);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wpp-sun-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgb(12 74 110)"/>
      <stop offset="45%" stop-color="rgb(2 6 23)"/>
      <stop offset="100%" stop-color="rgb(49 46 129)"/>
    </linearGradient>
    <linearGradient id="wpp-sun-track" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgb(252 211 77)"/>
      <stop offset="50%" stop-color="rgb(125 211 252)" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="rgb(165 180 252)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#020617"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="24" fill="url(#wpp-sun-bg)" stroke="rgb(245 158 11)" stroke-opacity="0.25" stroke-width="2"/>
  <text x="48" y="64" fill="rgb(253 230 138)" fill-opacity="0.8" font-size="16" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" letter-spacing="1.6">SOL · UTC${icaoCode ? ` · ${escapeXml(icaoCode)}` : ""}${dateLabel ? ` · ${escapeXml(dateLabel)}` : ""}</text>
  ${
    hasData
      ? `
  <line x1="${trackLeft}" y1="${trackY}" x2="${trackRight}" y2="${trackY}" stroke="url(#wpp-sun-track)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="${trackLeft}" cy="${trackY}" r="10" fill="rgb(252 211 77)">
    <animate attributeName="opacity" values="0.85;1;0.85" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${trackRight}" cy="${trackY}" r="10" fill="rgb(30 27 75)" stroke="rgb(199 210 254)" stroke-width="2"/>
  ${
    nowX != null
      ? `<circle cx="${nowX}" cy="${trackY}" r="12" fill="rgb(34 211 238)" stroke="white" stroke-width="3"/>
         <text x="${nowX}" y="${trackY - 22}" text-anchor="middle" fill="rgb(165 243 252)" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">agora</text>`
      : `<text x="${width / 2}" y="${trackY - 22}" text-anchor="middle" fill="rgb(148 163 184)" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">noite / fora do período diurno</text>`
  }
  <g>
    <rect x="48" y="190" width="290" height="100" rx="16" fill="rgb(245 158 11)" fill-opacity="0.12" stroke="rgb(251 191 36)" stroke-opacity="0.25"/>
    <text x="72" y="224" fill="rgb(253 230 138)" fill-opacity="0.85" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" letter-spacing="1">NASCER</text>
    <text x="72" y="262" fill="rgb(255 251 235)" font-size="36" font-family="ui-monospace,monospace" font-weight="700">${escapeXml(sunrise)}<tspan font-size="14" fill="rgb(253 230 138)" fill-opacity="0.7" dx="8">UTC</tspan></text>
  </g>
  <g>
    <rect x="382" y="190" width="290" height="100" rx="16" fill="rgb(99 102 241)" fill-opacity="0.12" stroke="rgb(129 140 248)" stroke-opacity="0.25"/>
    <text x="406" y="224" fill="rgb(199 210 254)" fill-opacity="0.85" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" letter-spacing="1">PÔR</text>
    <text x="406" y="262" fill="rgb(238 242 255)" font-size="36" font-family="ui-monospace,monospace" font-weight="700">${escapeXml(sunset)}<tspan font-size="14" fill="rgb(199 210 254)" fill-opacity="0.7" dx="8">UTC</tspan></text>
  </g>`
      : `<text x="${width / 2}" y="190" text-anchor="middle" fill="rgb(148 163 184)" font-size="20" font-family="ui-sans-serif,system-ui,sans-serif">Nascer/pôr do sol indisponível</text>`
  }
</svg>`;
}

module.exports = {
  parseWppAiswebCommand,
  parseWppMetarHelpCommand,
  parseWppMetarWatchCommand,
  parseWppMetarCommand,
  normalizeSearchText,
  rankAerodromeMatches,
  formatAerodromeChoiceLabel,
  formatAerodromeButtonTitle,
  formatWppAerodromeChoiceMessage,
  analyzeWindVsRunways,
  evaluateMinimums,
  formatWind,
  formatCeiling,
  formatTafForWhatsApp,
  formatWppMetarMessage,
  formatWppMetarHelpMessage,
  formatWppMetarWatchHoursMessage,
  formatWppMetarWatchStartedMessage,
  formatWppMetarWatchStoppedMessage,
  formatWppMetarWatchExpiredMessage,
  formatWppMetarWatchUpdatePrefix,
  formatWppNotamsMessage,
  formatWppAirportDetailsMessage,
  formatWppAirportDetailsMessages,
  buildWindRoseSvg,
  buildCloudStackSvg,
  buildSunCardSvg,
  buildAirportMapPng,
  buildMetarWeatherMapSnapshots,
  buildWindyEmbedScreenshotUrl,
  statusEmoji,
  METAR_WATCH_HOURS,
};
