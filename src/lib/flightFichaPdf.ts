import { chartDurationSec, formatAltFt, formatDistM, formatDuration, formatSpeedKt, summarizeFlight } from "./flightStats";
import { parseGarminCsv } from "./parseGarminCsv";
import type { FlightRecordMeta } from "./flightRecordCodec";
import type { ChartRow } from "./telemetryCharts";
import { colorForKey, labelForKey } from "./telemetryCharts";

type ExportFlightFichaPdfInput = {
  meta: FlightRecordMeta;
  telemetryCsv: string;
  telemetryFileName?: string | null;
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(markdown: string): string {
  const lines = (markdown || "Sem conteúdo.").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push(formatInline((lines[i] ?? "").trim().replace(/^\d+\.\s+/, "")));
        i++;
      }
      html.push(`<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push(formatInline((lines[i] ?? "").trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      html.push(`<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      continue;
    }

    html.push(`<p>${formatInline(trimmed)}</p>`);
    i++;
  }

  return html.join("") || "<p>Sem conteúdo.</p>";
}

function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function durationToMinutes(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const decimal = Number(raw.replace(",", "."));
  return Number.isFinite(decimal) && decimal > 0 ? Math.round(decimal * 60) : 0;
}

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fieldTable(items: Array<[string, string | number | null | undefined]>, columns = 2): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const cells = items.slice(i, i + columns);
    rows.push(`
      <tr>
        ${cells.map(([label, value]) => `
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(value === null || value === undefined || value === "" ? "-" : value)}</td>
        `).join("")}
        ${Array.from({ length: Math.max(0, columns - cells.length) }).map(() => "<th></th><td></td>").join("")}
      </tr>
    `);
  }
  return `<table class="field-table cols-${columns}">${rows.join("")}</table>`;
}

function section(title: string, content: string): string {
  return `
    <section class="ficha-section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="section-body">${content}</div>
    </section>
  `;
}

function narrativeBox(title: string, markdown: string): string {
  return `
    <div class="narrative">
      <div class="narrative-title">${escapeHtml(title)}</div>
      <div class="narrative-body">${markdownToHtml(markdown)}</div>
    </div>
  `;
}

function totalsTable(items: Array<[string, string | number]>): string {
  return `
    <table class="totals-table">
      <thead>
        <tr>${items.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        <tr>${items.map(([, value]) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>
      </tbody>
    </table>
  `;
}

function buildLegsTable(meta: FlightRecordMeta): string {
  const totals = meta.legs.reduce(
    (acc, leg) => ({
      landings: acc.landings + (Number.isFinite(leg.landings) ? leg.landings : 0),
      flight: acc.flight + durationToMinutes(leg.flightTime),
      nav: acc.nav + durationToMinutes(leg.navTime),
      ifr: acc.ifr + durationToMinutes(leg.ifrTime),
      night: acc.night + durationToMinutes(leg.nightTime),
      service: acc.service + durationToMinutes(leg.serviceTime),
    }),
    { landings: 0, flight: 0, nav: 0, ifr: 0, night: 0, service: 0 },
  );

  return `
    <table class="ficha-table compact">
      <thead>
        <tr>
          <th>Data</th>
          <th>Função</th>
          <th>DEP</th>
          <th>ARR</th>
          <th>Pousos</th>
          <th>Voo</th>
          <th>Nav</th>
          <th>IFR</th>
          <th>Noturno</th>
          <th>Serviço</th>
          <th>Distância</th>
        </tr>
      </thead>
      <tbody>
        ${meta.legs.map((leg) => `
          <tr>
            <td>${escapeHtml(leg.date)}</td>
            <td>${escapeHtml(leg.role)}</td>
            <td>${escapeHtml(leg.dep)}</td>
            <td>${escapeHtml(leg.arr)}</td>
            <td>${escapeHtml(leg.landings)}</td>
            <td>${escapeHtml(leg.flightTime)}</td>
            <td>${escapeHtml(leg.navTime)}</td>
            <td>${escapeHtml(leg.ifrTime)}</td>
            <td>${escapeHtml(leg.nightTime)}</td>
            <td>${escapeHtml(leg.serviceTime)}</td>
            <td>${escapeHtml(leg.distance)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${totalsTable([
      ["Pousos", totals.landings],
      ["Tempo de voo", formatMinutes(totals.flight)],
      ["Navegação", formatMinutes(totals.nav)],
      ["IFR", formatMinutes(totals.ifr)],
      ["Noturno", formatMinutes(totals.night)],
      ["Serviço", formatMinutes(totals.service)],
    ])}
  `;
}

function formatExerciseGrade(value: string | null | undefined): string {
  return value === "NO" || value === "1" || value === "2" || value === "3" || value === "4" ? value : "-";
}

function buildExercisesTable(meta: FlightRecordMeta): string {
  const exercises = (meta.exercises ?? []).slice().sort((a, b) => a.order - b.order);
  if (exercises.length === 0) return "<p>Nenhum exercicio registrado.</p>";
  return `
    <table class="ficha-table exercises-table">
      <thead>
        <tr>
          <th>Exercicio</th>
          <th>Grau</th>
          <th>Proficiencia aceitavel</th>
        </tr>
      </thead>
      <tbody>
        ${exercises.map((exercise) => `
          <tr>
            <td>${escapeHtml(exercise.title)}</td>
            <td class="grade-cell">${escapeHtml(formatExerciseGrade(exercise.grade))}</td>
            <td>${escapeHtml(exercise.acceptableProficiency)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function telemetryKeyHasData(data: ChartRow[], key: string): boolean {
  return data.some((row) => typeof row[key] === "number" && Number.isFinite(row[key]));
}

function buildOsmRouteMap(points: Array<{ lat: number; lon: number }>): string {
  if (points.length < 2) {
    return `<div class="empty-visual">Trajeto no mapa indisponível.</div>`;
  }

  const width = 720;
  const height = 330;
  const padding = 28;
  const sampled = sample(points, 900);
  const zoom = chooseOsmZoom(sampled, width - padding * 2, height - padding * 2);
  const projected = sampled.map((point) => projectOsm(point.lat, point.lon, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const maxTile = 2 ** zoom;
  const tileMinX = Math.floor(left / 256);
  const tileMaxX = Math.floor((left + width) / 256);
  const tileMinY = Math.max(0, Math.floor(top / 256));
  const tileMaxY = Math.min(maxTile - 1, Math.floor((top + height) / 256));
  const tileImgs: string[] = [];

  for (let tileX = tileMinX; tileX <= tileMaxX; tileX++) {
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY++) {
      const wrappedX = ((tileX % maxTile) + maxTile) % maxTile;
      const subdomain = ["a", "b", "c"][Math.abs(tileX + tileY) % 3];
      tileImgs.push(`
        <img
          class="osm-tile"
          src="https://${subdomain}.tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png"
          style="left:${(tileX * 256 - left).toFixed(2)}px;top:${(tileY * 256 - top).toFixed(2)}px;"
          alt=""
          loading="eager"
        />
      `);
    }
  }

  const routeCoords = projected
    .map((point) => `${(point.x - left).toFixed(1)},${(point.y - top).toFixed(1)}`)
    .join(" ");
  const start = projected[0] ?? { x: left, y: top };
  const end = projected[projected.length - 1] ?? start;
  const startX = (start.x - left).toFixed(1);
  const startY = (start.y - top).toFixed(1);
  const endX = (end.x - left).toFixed(1);
  const endY = (end.y - top).toFixed(1);

  return `
    <div class="chart-title">Recorte do mapa <small>trajeto</small></div>
    <div class="osm-print-map">
      ${tileImgs.join("")}
      <svg class="osm-route-overlay" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trajeto do avião">
        <polyline points="${routeCoords}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
        <polyline points="${routeCoords}" fill="none" stroke="#0f766e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.98" />
        <circle cx="${startX}" cy="${startY}" r="5" fill="#16a34a" stroke="#ffffff" stroke-width="1.5" />
        <circle cx="${endX}" cy="${endY}" r="5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5" />
      </svg>
    </div>
  `;
}

function projectOsm(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function chooseOsmZoom(points: Array<{ lat: number; lon: number }>, targetWidth: number, targetHeight: number): number {
  for (let zoom = 16; zoom >= 3; zoom--) {
    const projected = points.map((point) => projectOsm(point.lat, point.lon, zoom));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    if (width <= targetWidth && height <= targetHeight) return zoom;
  }
  return 3;
}

function buildLineChartSvg(data: ChartRow[], keys: string[], title: string, unit: string): string {
  const activeKeys = keys.filter((key) => telemetryKeyHasData(data, key));
  if (activeKeys.length === 0) {
    return `<div class="empty-visual">${escapeHtml(title)} indisponível.</div>`;
  }

  const sampled = sample(data, 260);
  const values = sampled.flatMap((row) =>
    activeKeys
      .map((key) => row[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 720;
  const height = 210;
  const left = 46;
  const right = 14;
  const top = 24;
  const bottom = 30;
  const xValues = sampled.map((row, index) => (typeof row.x === "number" && Number.isFinite(row.x) ? row.x : index));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xSpan = xMax - xMin || 1;
  const y = (value: number) => top + ((max - value) / span) * (height - top - bottom);
  const x = (value: number) => left + ((value - xMin) / xSpan) * (width - left - right);

  const polylines = activeKeys.map((key) => {
    const points = sampled
      .map((row, index) => {
        const value = row[key];
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        return `${x(xValues[index] ?? index).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${colorForKey(key)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const legend = activeKeys.map((key) => `
    <span><i style="background:${colorForKey(key)}"></i>${escapeHtml(labelForKey(key))}</span>
  `).join("");

  return `
    <div class="chart-title">${escapeHtml(title)} <small>${escapeHtml(unit)}</small></div>
    <svg class="telemetry-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      <path d="M${left} ${top}V${height - bottom}H${width - right}" stroke="#334155" stroke-width="1.2" fill="none" />
      <path d="M${left} ${top + 40}H${width - right}M${left} ${top + 80}H${width - right}M${left} ${top + 120}H${width - right}" stroke="#cbd5e1" stroke-width="1" />
      <text x="6" y="${top + 4}" font-size="10" fill="#475569">${escapeHtml(max.toFixed(0))}</text>
      <text x="6" y="${height - bottom}" font-size="10" fill="#475569">${escapeHtml(min.toFixed(0))}</text>
      ${polylines}
    </svg>
    <div class="chart-legend">${legend}</div>
  `;
}

function sample<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  const step = Math.ceil(items.length / maxItems);
  return items.filter((_, index) => index % step === 0);
}

function buildTelemetrySection(telemetryCsv: string, telemetryFileName?: string | null): string {
  if (!telemetryCsv.trim()) {
    return "<p>CSV de telemetria não disponível.</p>";
  }

  const parsed = parseGarminCsv(telemetryCsv);
  const summary = summarizeFlight(parsed.points);
  const durationSec = chartDurationSec(parsed.chartData, parsed.hasChartTime) ?? summary.durationSec;
  const altitudeKeys = ["gpsAltFt", "pressAltFt", "baroAltFt", "selectedAltFt", "vnavAltFt", "densityAltFt", "heightAglFt"];
  const speedKeys = ["gsKt", "iasKt", "tasKt", "selectedAsKt"];

  return `
    ${fieldTable([
      ["Arquivo", telemetryFileName || "CSV de telemetria"],
      ["Pontos GPS", summary.pointCount.toLocaleString("pt-BR")],
      ["Distância", summary.pointCount >= 2 ? formatDistM(summary.distanceM) : "-"],
      ["Duração", formatDuration(durationSec)],
      ["Alt máx/mín", summary.pointCount > 0 ? `${formatAltFt(summary.altMaxM)} / ${formatAltFt(summary.altMinM)}` : "-"],
      ["Vel média/máx", summary.pointCount > 0 ? `${formatSpeedKt(summary.speedAvgMs)} / ${formatSpeedKt(summary.speedMaxMs)}` : "-"],
    ], 2)}
    <div class="visual-block">
      <div>${buildOsmRouteMap(parsed.points)}</div>
      <div>${buildLineChartSvg(parsed.chartData, speedKeys, "Gráfico de velocidade", "kt")}</div>
      <div>${buildLineChartSvg(parsed.chartData, altitudeKeys, "Gráfico de altitude", "ft")}</div>
    </div>
    ${parsed.warnings.length > 0 ? `
      <div class="warnings">
        <strong>Avisos da telemetria</strong>
        <ul>${parsed.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
      </div>
    ` : ""}
  `;
}

function buildPdfHtml({ meta, telemetryCsv, telemetryFileName }: ExportFlightFichaPdfInput): string {
  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Ficha do voo</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4; margin: 12mm; }
        body { margin: 0; background: #fff; color: #111827; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.35; }
        main { padding: 0; }
        h1 { margin: 0; font-size: 18px; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
        p { margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
        th, td { border: 1px solid #111827; padding: 5px 6px; text-align: left; vertical-align: top; }
        th { background: #e5e7eb; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #111827; }
        td { min-height: 22px; }
        ol, ul { margin: 6px 0 8px 18px; padding: 0; }
        .top-box { border: 2px solid #111827; margin-bottom: 8px; }
        .top-row { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; border-bottom: 1px solid #111827; min-height: 48px; }
        .brand, .meta-box { padding: 8px; font-size: 10px; text-align: center; text-transform: uppercase; }
        .brand { border-right: 1px solid #111827; font-weight: 700; }
        .meta-box { border-left: 1px solid #111827; color: #374151; }
        .subtitle { padding: 5px 8px; text-align: center; color: #374151; font-size: 10px; }
        .ficha-section { margin-top: 8px; page-break-inside: avoid; }
        .section-title { border: 1px solid #111827; background: #d1d5db; padding: 5px 7px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        .section-body { border: 1px solid #111827; border-top: 0; padding: 7px; }
        .field-table.cols-2 th { width: 18%; }
        .field-table.cols-2 td { width: 32%; overflow-wrap: anywhere; }
        .totals-table { table-layout: fixed; margin-top: 4px; }
        .totals-table th, .totals-table td { width: 16.666%; text-align: center; }
        .totals-table td { font-weight: 700; }
        .ficha-table { margin-bottom: 8px; }
        .ficha-table.compact th, .ficha-table.compact td { padding: 4px 5px; font-size: 9.5px; }
        .exercises-table th:nth-child(1) { width: 30%; }
        .exercises-table th:nth-child(2) { width: 9%; text-align: center; }
        .exercises-table th:nth-child(3) { width: 61%; }
        .grade-cell { text-align: center; font-weight: 700; }
        .narrative { margin-bottom: 7px; border: 1px solid #111827; page-break-inside: avoid; }
        .narrative-title { background: #f3f4f6; border-bottom: 1px solid #111827; padding: 4px 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
        .narrative-body { min-height: 44px; padding: 6px; overflow-wrap: anywhere; }
        .narrative-body p:last-child { margin-bottom: 0; }
        .visual-block { display: grid; gap: 8px; margin: 8px 0; }
        .telemetry-svg { display: block; width: 100%; height: auto; border: 1px solid #111827; background: #fff; }
        .osm-print-map { position: relative; width: 100%; height: 330px; border: 1px solid #111827; overflow: hidden; background: #e5e7eb; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .osm-tile { position: absolute; width: 256px; height: 256px; max-width: none; user-select: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .osm-route-overlay { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; pointer-events: none; overflow: visible; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .chart-title { margin: 4px 0 2px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .chart-title small { font-weight: 400; color: #4b5563; text-transform: none; }
        .chart-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; font-size: 9px; color: #374151; }
        .chart-legend span { display: inline-flex; align-items: center; gap: 3px; }
        .chart-legend i { display: inline-block; width: 10px; height: 3px; }
        .empty-visual { border: 1px dashed #6b7280; padding: 18px; color: #6b7280; text-align: center; }
        .warnings { border: 1px solid #92400e; background: #fffbeb; padding: 8px; }
        @media print {
          main { padding: 0; }
          .ficha-section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <main>
        <div class="top-box">
          <div class="top-row">
            <div class="brand">Garmin<br/>Flight Viewer</div>
            <h1>Ficha do voo</h1>
            <div class="meta-box">Data de emissão<br/>${escapeHtml(new Date().toLocaleDateString("pt-BR"))}</div>
          </div>
          <div class="subtitle">Documento gerado automaticamente a partir da ficha preenchida no sistema.</div>
        </div>

        ${section("Identificação do voo", fieldTable([
          ["Aluno", meta.header.studentName || meta.header.studentLabel],
          ["Código ANAC", meta.header.studentAnac],
          ["Instrutor", meta.header.instructorName],
          ["CANAC instrutor", meta.header.instructorAnac],
          ["Data", meta.header.date],
          ["Horário de início", meta.header.startTime],
          ["Aeronave / matrícula", meta.header.aircraft],
        ], 2))}

        ${section("Pré voo", [
          narrativeBox("Objetivo da lição", meta.preFlight.objectiveMd),
          narrativeBox("Sugestão do INVA", meta.preFlight.instructorSuggestionMd || ""),
          narrativeBox("Sugestão do aluno", meta.preFlight.studentSuggestionMd || ""),
          narrativeBox("Nota do briefing", meta.preFlight.briefingMd),
        ].join(""))}

        ${section("Registro de pernas", buildLegsTable(meta))}

        ${section("Exercicios", buildExercisesTable(meta))}

        ${section("Risco e parecer", [
          narrativeBox("Comentários", meta.risk.commentsMd),
          narrativeBox("Descrição do perigo", meta.risk.dangerMd),
          narrativeBox("Descrição do risco", meta.risk.riskMd),
          narrativeBox("Gerenciamento do risco", meta.risk.managementMd),
          narrativeBox("Parecer do instrutor", meta.risk.instructorOpinionMd),
        ].join(""))}

        ${section("Telemetria", buildTelemetrySection(telemetryCsv, telemetryFileName))}
      </main>
      <script>
        window.addEventListener("load", () => {
          window.setTimeout(() => {
            window.focus();
            window.print();
          }, 600);
        });
      </script>
    </body>
  </html>`;
}

export function exportFlightFichaPdf(input: ExportFlightFichaPdfInput): { ok: boolean; error?: string } {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return { ok: false, error: "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups." };
  }

  printWindow.document.open();
  printWindow.document.write(buildPdfHtml(input));
  printWindow.document.close();
  return { ok: true };
}
