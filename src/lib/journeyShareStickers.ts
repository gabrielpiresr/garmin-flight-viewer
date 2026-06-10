import {
  listJourneyLandings,
  listJourneyTakeoffs,
  listJourneyTelemetrySummaries,
} from "./flightTelemetryMetricsDb";
import {
  aggregateJourneyMetrics,
  type JourneyEvolutionPeriod,
  type JourneyMetrics,
} from "./journeyMetrics";
import {
  loadFlightShareBrand,
  type FlightShareBrand,
  type FlightShareSticker,
} from "./flightShareStickers";
import type { UserRole } from "./rbac";

export type JourneyShareStickerId = "summary" | "evolution" | "landings" | "records" | "level" | "custom";
export type JourneyShareMetricKey = "hours" | "distanceNm" | "landings";

export type JourneyCustomStickerOptions = {
  title: string;
  showBackground: boolean;
  period: JourneyEvolutionPeriod;
  metric: JourneyShareMetricKey;
  showTotals: boolean;
  showEvolution: boolean;
  showLandings: boolean;
  showTakeoffs: boolean;
  showWind: boolean;
  showAirports: boolean;
  showLevel: boolean;
};

export type JourneyShareData = {
  metrics: JourneyMetrics;
  brand: FlightShareBrand;
  viewerRole: UserRole;
};

type Box = { x: number; y: number; w: number; h: number };
type Sample = { x: number; y: number };
type StickerBuildOptions = { showBackground?: boolean };

const STICKER_WIDTH = 1080;
const STICKER_HEIGHT = 1920;

export const DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS: JourneyCustomStickerOptions = {
  title: "",
  showBackground: true,
  period: "month",
  metric: "hours",
  showTotals: true,
  showEvolution: true,
  showLandings: true,
  showTakeoffs: true,
  showWind: false,
  showAirports: true,
  showLevel: true,
};

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const METRIC_LABEL: Record<JourneyShareMetricKey, string> = {
  hours: "Horas",
  distanceNm: "Milhas",
  landings: "Pousos",
};

const PERIOD_LABEL: Record<JourneyEvolutionPeriod, string> = {
  day: "por dia",
  week: "por semana",
  month: "por mes",
};

export async function loadJourneyShareData(viewer: { userId: string; role: UserRole }): Promise<JourneyShareData> {
  const [summaries, landings, takeoffs, brand] = await Promise.all([
    listJourneyTelemetrySummaries(viewer),
    listJourneyLandings(viewer),
    listJourneyTakeoffs(viewer),
    loadFlightShareBrand(),
  ]);
  const error = summaries.error ?? landings.error ?? takeoffs.error;
  if (error) throw error;

  const metrics = aggregateJourneyMetrics({
    summaries: summaries.data ?? [],
    landings: landings.data ?? [],
    takeoffs: takeoffs.data ?? [],
  });

  if (!metrics.hasData) throw new Error("Ainda nao ha dados de evolucao para compartilhar.");
  return { metrics, brand, viewerRole: viewer.role };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fitText(value: string, x: number, y: number, options: {
  color?: string;
  fontSize: number;
  fontWeight?: number | string;
  maxWidth: number;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number | string;
  opacity?: number;
}): string {
  // Reduz o font-size para caber em maxWidth em vez de usar textLength/lengthAdjust,
  // que deforma os glifos (estica texto curto quando a estimativa de largura erra).
  const estimatedWidth = value.length * options.fontSize * 0.56;
  const fontSize = estimatedWidth > options.maxWidth
    ? Math.max(10, Math.floor(options.fontSize * (options.maxWidth / estimatedWidth)))
    : options.fontSize;
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const weight = options.fontWeight ? ` font-weight="${options.fontWeight}"` : "";
  const letterSpacing = options.letterSpacing !== undefined ? ` letter-spacing="${options.letterSpacing}"` : "";
  const opacity = options.opacity !== undefined ? ` opacity="${options.opacity}"` : "";
  return `<text x="${x}" y="${y}" fill="${options.color ?? "#f8fafc"}" font-size="${fontSize}"${weight}${anchor}${letterSpacing}${opacity}>${escapeXml(value)}</text>`;
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "jornada";
}

function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

function formatHours(value: number): string {
  return `${value >= 10 ? formatInteger(value) : formatDecimal(value)} h`;
}

function formatNm(value: number): string {
  return `${formatInteger(value)} NM`;
}

function formatMetersFromFt(value: number | null): string {
  return value === null ? "-" : `${formatInteger(value * 0.3048)} m`;
}

function formatSeconds(value: number | null): string {
  return value === null ? "-" : `${formatDecimal(value)} s`;
}

function formatKt(value: number | null): string {
  return value === null ? "-" : `${formatDecimal(value)} kt`;
}

function formatFpm(value: number | null): string {
  return value === null ? "-" : `${formatInteger(value)} fpm`;
}

function formatG(value: number | null): string {
  return value === null ? "-" : `${formatDecimal(value)} g`;
}

function formatPercent(value: number): string {
  return `${formatInteger(value)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function metricValue(point: { hours: number; distanceNm: number; landings: number }, metric: JourneyShareMetricKey): number {
  return metric === "hours" ? point.hours : metric === "distanceNm" ? point.distanceNm : point.landings;
}

function formatMetricValue(value: number, metric: JourneyShareMetricKey): string {
  if (metric === "hours") return formatHours(value);
  if (metric === "distanceNm") return formatNm(value);
  return formatInteger(value);
}

function latestEvolution(data: JourneyShareData, period: JourneyEvolutionPeriod) {
  const limit = period === "day" ? 14 : period === "week" ? 12 : 8;
  return data.metrics.evolution[period].slice(-limit).map((item) => ({
    ...item,
    hours: Number(item.hours.toFixed(1)),
    distanceNm: Math.round(item.distanceNm),
  }));
}

function samplesForEvolution(data: JourneyShareData, period: JourneyEvolutionPeriod, metric: JourneyShareMetricKey): Sample[] {
  return latestEvolution(data, period).map((point, index) => ({
    x: index,
    y: metricValue(point, metric),
  }));
}

function chartPath(samples: Sample[], box: Box): string {
  if (samples.length < 2) return "";
  const xs = samples.map((sample) => sample.x);
  const ys = samples.map((sample) => sample.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;

  return samples
    .map((sample, index) => {
      const x = box.x + ((sample.x - minX) / xSpan) * box.w;
      const y = box.y + box.h - ((sample.y - minY) / ySpan) * box.h;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartAreaPath(samples: Sample[], box: Box): string {
  const line = chartPath(samples, box);
  if (!line) return "";
  return `${line} L ${box.x + box.w} ${box.y + box.h} L ${box.x} ${box.y + box.h} Z`;
}

function baseDefs(data: JourneyShareData): string {
  const primary = escapeXml(safeColor(data.brand.primaryColor, "#38bdf8"));
  const accent = escapeXml(safeColor(data.brand.accentColor, "#a78bfa"));
  return `
    <defs>
      <linearGradient id="gfvAccent" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" />
        <stop offset="100%" stop-color="${accent}" />
      </linearGradient>
      <linearGradient id="gfvSoft" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" stop-opacity="0.32" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.18" />
      </linearGradient>
      <filter id="gfvShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#020617" flood-opacity="0.48" />
      </filter>
      <filter id="gfvGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="${primary}" flood-opacity="0.65" />
      </filter>
      <clipPath id="gfvStickerSafe">
        <rect x="86" y="120" width="908" height="1680" rx="41.6" />
      </clipPath>
      <style>
        text { font-family: "Segoe UI", Arial, sans-serif; }
      </style>
    </defs>
  `;
}

function svgShell(data: JourneyShareData, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STICKER_WIDTH}" height="${STICKER_HEIGHT}" viewBox="0 0 ${STICKER_WIDTH} ${STICKER_HEIGHT}">
    ${baseDefs(data)}
    ${body}
  </svg>`;
}

function logoHref(data: JourneyShareData): string | null {
  return data.brand.logoDataUrl || null;
}

function brandMark(data: JourneyShareData, x: number, y: number, width = 360): string {
  const href = logoHref(data);
  if (!href) return "";
  return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="${width}" height="116" preserveAspectRatio="xMinYMid meet" />`;
}

function smallBrand(data: JourneyShareData, x: number, y: number): string {
  const href = logoHref(data);
  if (!href) return "";
  return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="260" height="82" preserveAspectRatio="xMinYMid meet" />`;
}

function outerCard(showBackground: boolean, x: number, y: number, width: number, height: number, opacity = 0.43): string {
  if (!showBackground) return "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="41.6" fill="#020617" fill-opacity="${opacity}" stroke="#ffffff" stroke-opacity="0.14" />`;
}

function innerCard(showBackground: boolean, x: number, y: number, width: number, height: number, radius = 31.2, opacity = 0.74): string {
  if (!showBackground) return "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#0f172a" fill-opacity="${opacity}" stroke="#ffffff" stroke-opacity="0.12" />`;
}

function metricBlock(label: string, value: string, x: number, y: number, width = 395): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="160" rx="22.1" fill="#0f172a" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 34, y + 58, { color: "#94a3b8", fontSize: 28, fontWeight: 700, maxWidth: width - 68, letterSpacing: 1.2 })}
      ${fitText(value, x + 34, y + 116, { fontSize: 44, fontWeight: 900, maxWidth: width - 68 })}
    </g>
  `;
}

function compactMetric(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="246" height="132" rx="19.5" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 26, y + 48, { color: "#94a3b8", fontSize: 24, fontWeight: 800, maxWidth: 194, letterSpacing: 0.8 })}
      ${fitText(value, x + 26, y + 98, { fontSize: 38, fontWeight: 900, maxWidth: 194 })}
    </g>
  `;
}

function metricMini(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      ${fitText(label, x, y, { color: "#94a3b8", fontSize: 25, fontWeight: 800, maxWidth: 206, letterSpacing: 1 })}
      ${fitText(value, x, y + 62, { fontSize: 43, fontWeight: 900, maxWidth: 206 })}
    </g>
  `;
}

function journeyTitle(data: JourneyShareData): string {
  return data.brand.schoolName ? `Minha jornada - ${data.brand.schoolName}` : "Minha jornada";
}

function evolutionChart(data: JourneyShareData, period: JourneyEvolutionPeriod, metric: JourneyShareMetricKey, box: Box): string {
  const samples = samplesForEvolution(data, period, metric);
  const linePath = chartPath(samples, box);
  const areaPath = chartAreaPath(samples, box);
  const latest = samples.at(-1)?.y ?? 0;
  return `
    <g>
      <rect x="${box.x - 18}" y="${box.y - 82}" width="${box.w + 36}" height="${box.h + 132}" rx="27.3" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(`${METRIC_LABEL[metric]} ${PERIOD_LABEL[period]}`, box.x, box.y - 32, { color: "#cbd5e1", fontSize: 29, fontWeight: 900, maxWidth: box.w })}
      ${fitText(formatMetricValue(latest, metric), box.x + box.w, box.y - 32, { color: "#f8fafc", fontSize: 34, fontWeight: 900, maxWidth: 240, anchor: "end" })}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#94a3b8" font-size="28" font-weight="700" text-anchor="middle">Sem serie suficiente</text>`}
      <line x1="${box.x}" y1="${box.y + box.h}" x2="${box.x + box.w}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3" />
    </g>
  `;
}

function summarySticker(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const metrics = data.metrics;
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 330, 908, 1080, 0.48)}
      ${innerCard(showBackground, 128, 372, 824, 996, 33.8, 0.72)}
      ${brandMark(data, 176, 438, 380)}
      ${fitText("Resumo da jornada", 176, 620, { fontSize: 58, fontWeight: 900, maxWidth: 728 })}
      ${fitText(journeyTitle(data), 176, 676, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 728 })}
      <rect x="176" y="744" width="728" height="4" rx="1.3" fill="url(#gfvAccent)" />
      ${metricBlock("Voos", formatInteger(metrics.totals.flights), 176, 826)}
      ${metricBlock("Horas", formatHours(metrics.totals.hours), 508, 826)}
      ${metricBlock("Milhas", formatNm(metrics.totals.distanceNm), 176, 1034)}
      ${metricBlock("Pousos", formatInteger(metrics.totals.landings), 508, 1034)}
      ${metricBlock("Aerodromos", formatInteger(metrics.totals.airports), 176, 1242, 728)}
    </g>
  `;

  return createSticker("summary", "Resumo da jornada", "Voos, horas, milhas, pousos e aerodromos.", data, body);
}

function evolutionSticker(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 220, 908, 1220, 0.42)}
      ${fitText("EVOLUCAO", 136, 346, { color: "#94a3b8", fontSize: 30, fontWeight: 900, maxWidth: 760, letterSpacing: 4 })}
      ${fitText(formatHours(data.metrics.totals.hours), 136, 450, { fontSize: 86, fontWeight: 900, maxWidth: 760 })}
      ${fitText("horas totais registradas", 142, 512, { color: "#cbd5e1", fontSize: 34, fontWeight: 700, maxWidth: 760 })}
      ${evolutionChart(data, "month", "hours", { x: 150, y: 690, w: 780, h: 330 })}
      <rect x="132" y="1138" width="816" height="184" rx="27.3" fill="#0f172a" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.13" />
      ${metricMini("Voos", formatInteger(data.metrics.totals.flights), 176, 1206)}
      ${metricMini("Milhas", formatNm(data.metrics.totals.distanceNm), 420, 1206)}
      ${metricMini("Ultimo voo", formatDate(data.metrics.latestFlightDate), 664, 1206)}
      ${smallBrand(data, 136, 1356)}
    </g>
  `;

  return createSticker("evolution", "Evolução", "Grafico compacto da evolucao mensal.", data, body);
}

function landingsSticker(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const metrics = data.metrics;
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 250, 908, 1260, 0.42)}
      <circle cx="540" cy="442" r="210" fill="url(#gfvSoft)" />
      ${fitText("POUSOS", 540, 370, { color: "#94a3b8", fontSize: 30, fontWeight: 900, maxWidth: 700, anchor: "middle", letterSpacing: 4 })}
      ${fitText(formatPercent(metrics.totals.smoothLandingRate), 540, 490, { fontSize: 104, fontWeight: 900, maxWidth: 700, anchor: "middle" })}
      ${fitText("de pousos suaves", 540, 552, { color: "#cbd5e1", fontSize: 34, fontWeight: 700, maxWidth: 700, anchor: "middle" })}
      ${metricBlock("Suaves", formatInteger(metrics.totals.smoothLandings), 136, 720, 380)}
      ${metricBlock("Medios", formatInteger(metrics.totals.mediumLandings), 564, 720, 380)}
      ${metricBlock("Duros", formatInteger(metrics.totals.hardLandings), 136, 928, 380)}
      ${metricBlock("Sequencia", formatInteger(metrics.records.longestSoftLandingStreak), 564, 928, 380)}
      <rect x="136" y="1160" width="808" height="160" rx="22.1" fill="#0f172a" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText("Melhor toque", 176, 1218, { color: "#94a3b8", fontSize: 28, fontWeight: 700, maxWidth: 728, letterSpacing: 1.2 })}
      ${fitText(`${formatFpm(metrics.records.softestLandingFpm)} / ${formatG(metrics.records.softestLandingG)}`, 176, 1276, { fontSize: 44, fontWeight: 900, maxWidth: 728 })}
      ${smallBrand(data, 136, 1402)}
    </g>
  `;

  return createSticker("landings", "Pousos", "Qualidade dos pousos ao longo da jornada.", data, body);
}

function recordsSticker(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const records = data.metrics.records;
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 220, 908, 1248, 0.44)}
      ${brandMark(data, 132, 298, 360)}
      ${fitText("Recordes da jornada", 132, 508, { fontSize: 58, fontWeight: 900, maxWidth: 816 })}
      ${fitText(journeyTitle(data), 132, 566, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 816 })}
      ${metricBlock("Melhor mes", records.bestMonth?.label ?? "-", 136, 684, 380)}
      ${metricBlock("Horas no melhor mes", records.bestMonth ? formatHours(records.bestMonth.hours) : "-", 564, 684, 380)}
      ${metricBlock("Decolagem curta", formatMetersFromFt(records.shortestTakeoffRollFt), 136, 892, 380)}
      ${metricBlock("Decolagem longa", formatMetersFromFt(records.longestTakeoffRollFt), 564, 892, 380)}
      ${metricBlock("Tempo de rolagem", formatSeconds(records.fastestTakeoffTimeSec), 136, 1100, 380)}
      ${metricBlock("Vento de traves", formatKt(records.maxCrosswindKt), 564, 1100, 380)}
      ${smallBrand(data, 136, 1348)}
    </g>
  `;

  return createSticker("records", "Recordes", "Melhor mes, decolagens, vento e sequencias.", data, body);
}

function levelSticker(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const achievedBadges = data.metrics.badges.filter((badge) => badge.achieved);
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 250, 908, 1210, 0.42)}
      ${fitText("NIVEL", 540, 390, { color: "#94a3b8", fontSize: 30, fontWeight: 900, maxWidth: 700, anchor: "middle", letterSpacing: 4 })}
      ${fitText(data.metrics.level.name, 540, 498, { fontSize: 66, fontWeight: 900, maxWidth: 760, anchor: "middle" })}
      ${fitText(`${formatInteger(data.metrics.level.points)} pontos`, 540, 570, { color: "#cbd5e1", fontSize: 36, fontWeight: 800, maxWidth: 700, anchor: "middle" })}
      <rect x="166" y="664" width="748" height="34" rx="17" fill="#0f172a" fill-opacity="0.9" />
      <rect x="166" y="664" width="${Math.max(12, (748 * data.metrics.level.progressPct) / 100).toFixed(1)}" height="34" rx="17" fill="url(#gfvAccent)" />
      ${fitText(`${formatPercent(data.metrics.level.progressPct)} para o proximo nivel`, 540, 752, { color: "#cbd5e1", fontSize: 32, fontWeight: 700, maxWidth: 760, anchor: "middle" })}
      ${metricBlock("Badges", formatInteger(achievedBadges.length), 136, 882, 380)}
      ${metricBlock("Streak", `${formatInteger(data.metrics.streakWeeks)} sem.`, 564, 882, 380)}
      ${achievedBadges.slice(0, 4).map((badge, index) => {
        const y = 1120 + index * 74;
        return `
          <g>
            <circle cx="170" cy="${y - 10}" r="18" fill="url(#gfvAccent)" />
            ${fitText(badge.title, 210, y, { fontSize: 30, fontWeight: 800, maxWidth: 680 })}
          </g>
        `;
      }).join("") || fitText("Conquistas aparecem conforme os voos entram na jornada.", 136, 1130, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 808 })}
      ${smallBrand(data, 136, 1376)}
    </g>
  `;

  return createSticker("level", "Badges e nível", "Nivel atual, progresso e badges conquistados.", data, body);
}

function customSection(data: JourneyShareData, key: string, y: number): string {
  const metrics = data.metrics;
  if (key === "totals") {
    return [
      compactMetric("Voos", formatInteger(metrics.totals.flights), 132, y),
      compactMetric("Horas", formatHours(metrics.totals.hours), 404, y),
      compactMetric("Milhas", formatNm(metrics.totals.distanceNm), 676, y),
    ].join("");
  }
  if (key === "landings") {
    return [
      compactMetric("Pousos", formatInteger(metrics.totals.landings), 132, y),
      compactMetric("Suaves", formatPercent(metrics.totals.smoothLandingRate), 404, y),
      compactMetric("Sequencia", formatInteger(metrics.records.longestSoftLandingStreak), 676, y),
    ].join("");
  }
  if (key === "takeoffs") {
    return [
      compactMetric("Decolagens", formatInteger(metrics.totals.takeoffs), 132, y),
      compactMetric("Mais curta", formatMetersFromFt(metrics.records.shortestTakeoffRollFt), 404, y),
      compactMetric("Mais rapida", formatSeconds(metrics.records.fastestTakeoffTimeSec), 676, y),
    ].join("");
  }
  if (key === "wind") {
    return [
      compactMetric("Traves", formatKt(metrics.records.maxCrosswindKt), 132, y),
      compactMetric("Proa", formatKt(metrics.records.maxHeadwindKt), 404, y),
      compactMetric("Cauda", formatKt(metrics.records.maxTailwindKt), 676, y),
    ].join("");
  }
  if (key === "airports") {
    return [
      compactMetric("Aerodromos", formatInteger(metrics.totals.airports), 132, y),
      compactMetric("Aeronaves", formatInteger(metrics.totals.aircraft), 404, y),
      compactMetric("Ultimo voo", formatDate(metrics.latestFlightDate), 676, y),
    ].join("");
  }
  return [
    compactMetric("Nivel", metrics.level.name, 132, y),
    compactMetric("Pontos", formatInteger(metrics.level.points), 404, y),
    compactMetric("Badges", formatInteger(metrics.badges.filter((badge) => badge.achieved).length), 676, y),
  ].join("");
}

export function buildCustomJourneyShareSticker(data: JourneyShareData, options: JourneyCustomStickerOptions): FlightShareSticker {
  const merged = { ...DEFAULT_JOURNEY_CUSTOM_STICKER_OPTIONS, ...options };
  const showBackground = merged.showBackground;
  const title = merged.title.trim();
  const titleLine = title
    ? fitText(title, 132, 366, { fontSize: 56, fontWeight: 900, maxWidth: 816 })
    : "";
  const subtitleY = title ? 426 : 366;
  const headerBottom = title ? 470 : 410;
  let cursorY = headerBottom + 70;
  const parts: string[] = [];

  if (merged.showEvolution) {
    parts.push(evolutionChart(data, merged.period, merged.metric, { x: 150, y: cursorY + 100, w: 780, h: 250 }));
    cursorY += 440;
  }

  const sections: Array<[boolean, string]> = [
    [merged.showTotals, "totals"],
    [merged.showLandings, "landings"],
    [merged.showTakeoffs, "takeoffs"],
    [merged.showWind, "wind"],
    [merged.showAirports, "airports"],
    [merged.showLevel, "level"],
  ];

  for (const [enabled, key] of sections) {
    if (!enabled || cursorY > 1540) continue;
    parts.push(customSection(data, key, cursorY));
    cursorY += 158;
  }

  if (parts.length === 0) {
    parts.push(fitText("Escolha uma metrica, grafico ou bloco para aparecer aqui.", 132, cursorY + 64, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 816 }));
    cursorY += 160;
  }

  const contentBottom = Math.min(1760, Math.max(headerBottom + 260, cursorY + 86));
  const body = `
    <g filter="url(#gfvShadow)" clip-path="url(#gfvStickerSafe)">
      ${outerCard(showBackground, 86, 142, 908, Math.max(520, contentBottom - 142), 0.43)}
      ${brandMark(data, 132, 212, 360)}
      ${titleLine}
      ${fitText(journeyTitle(data), 132, subtitleY, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 816 })}
      ${parts.join("")}
    </g>
  `;

  return createSticker("custom", "Personalizada", "Figurinha montada com os dados da jornada.", data, body);
}

function createSticker(
  id: JourneyShareStickerId,
  title: string,
  description: string,
  data: JourneyShareData,
  body: string,
): FlightShareSticker {
  const fileBase = slugify(`jornada-${id}-${data.metrics.latestFlightDate ?? "evolucao"}`);
  return {
    id,
    title,
    description,
    fileName: `${fileBase}.png`,
    width: STICKER_WIDTH,
    height: STICKER_HEIGHT,
    svg: svgShell(data, body),
  };
}

export function buildJourneyShareStickers(data: JourneyShareData, options: StickerBuildOptions = {}): FlightShareSticker[] {
  return [
    summarySticker(data, options),
    evolutionSticker(data, options),
    landingsSticker(data, options),
    recordsSticker(data, options),
    levelSticker(data, options),
  ];
}
