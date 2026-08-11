import type { AiswebAirportBundle, AiswebNotam, AiswebSupplement } from "../types/aisweb";
import type {
  FlightPlanAirspaceHit,
  FlightPlanInfoSection,
  FlightPlanRouteSummary,
  FlightPlanRouteTableRow,
  FlightPlanWaypoint,
} from "../types/flightPlanning";
import {
  airportSummaryFromBundle,
  formatAirspaceFreqCell,
  formatRotaerFuel,
} from "./flightPlanFormat";
import { formatDistanceNm, formatEteHours, formatFuel } from "./flightPlanningRoute";
import type { PdfBrand } from "./pdfBrand";
import { getPdfBrandLogoSrc } from "./pdfBrand";
import { buildRunwayRoseSvg } from "../components/RunwayRose";

type AirportDoc = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  note?: string;
};

export type FlightPlanDocumentInput = {
  origin: string;
  destination: string;
  alternates: string[];
  sections: FlightPlanInfoSection[];
  airports: AirportDoc[];
  routeSummary: FlightPlanRouteSummary | null;
  airspaces: FlightPlanAirspaceHit[];
  cruiseSpeedKt: number | null;
  fuelBurnPerHour: number | null;
  fuelUnit: string;
  routeText: string;
  /** @deprecated prefer mapImageDataUrl */
  mapSvg?: string | null;
  mapImageDataUrl?: string | null;
  /** SVG markup for vertical profile (injected as-is). */
  verticalProfileSvg?: string | null;
  /** Optional route table rows (same columns as planning UI). */
  routeTableRows?: FlightPlanRouteTableRow[] | null;
  /** paged = print pages; continuous = single dark offline scroll for tablet */
  mode?: "paged" | "continuous";
  brand?: PdfBrand;
};

type OpenFlightPlanPdfInput = FlightPlanDocumentInput;

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " Z";
}

function roleLabel(role: AirportDoc["role"]): string {
  if (role === "origem") return "Origem";
  if (role === "destino") return "Destino";
  return "Alternativo";
}

/** Compact SVG route map for print (no external tiles). */
export function buildFlightPlanMapSvg(waypoints: FlightPlanWaypoint[]): string {
  if (waypoints.length < 1) return "";
  const pad = 28;
  const width = 860;
  const height = 360;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const w of waypoints) {
    minLat = Math.min(minLat, w.lat);
    maxLat = Math.max(maxLat, w.lat);
    minLng = Math.min(minLng, w.lng);
    maxLng = Math.max(maxLng, w.lng);
  }
  const latPad = Math.max(0.08, (maxLat - minLat) * 0.12 || 0.15);
  const lngPad = Math.max(0.08, (maxLng - minLng) * 0.12 || 0.15);
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const project = (lat: number, lng: number): [number, number] => {
    const x = pad + ((lng - minLng) / spanLng) * (width - pad * 2);
    const y = pad + ((maxLat - lat) / spanLat) * (height - pad * 2);
    return [x, y];
  };
  const pts = waypoints.map((w) => project(w.lat, w.lng));
  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const midDots = pts
    .slice(1, -1)
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#38bdf8" />`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="display:block;background:#0f172a;border-radius:12px">
    <defs>
      <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#sea)"/>
    <g stroke="#334155" stroke-width="1" opacity="0.55">
      ${[0.25, 0.5, 0.75]
        .map(
          (t) =>
            `<line x1="${pad}" y1="${pad + t * (height - pad * 2)}" x2="${width - pad}" y2="${pad + t * (height - pad * 2)}"/>
             <line x1="${pad + t * (width - pad * 2)}" y1="${pad}" x2="${pad + t * (width - pad * 2)}" y2="${height - pad}"/>`,
        )
        .join("")}
    </g>
    <polyline points="${poly}" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${midDots}
    <circle cx="${first[0].toFixed(1)}" cy="${first[1].toFixed(1)}" r="6" fill="#34d399" stroke="#fff" stroke-width="1.5"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="6" fill="#f472b6" stroke="#fff" stroke-width="1.5"/>
    <text x="${first[0].toFixed(1)}" y="${(first[1] - 10).toFixed(1)}" text-anchor="middle" fill="#bbf7d0" font-size="11" font-family="Segoe UI,sans-serif" font-weight="700">${esc(waypoints[0]?.label || "DEP")}</text>
    <text x="${last[0].toFixed(1)}" y="${(last[1] - 10).toFixed(1)}" text-anchor="middle" fill="#fbcfe8" font-size="11" font-family="Segoe UI,sans-serif" font-weight="700">${esc(waypoints[waypoints.length - 1]?.label || "ARR")}</text>
  </svg>`;
}

function notamBlock(notams: AiswebNotam[]): string {
  if (!notams.length) return `<p class="muted">Nenhum NOTAM ativo.</p>`;
  return notams
    .map(
      (n) => `
      <article class="card notam">
        <header><strong>${esc(n.number || n.id)}</strong> <span class="pill">${esc(n.status || "ACTIVE")}</span></header>
        <p class="meta">${esc(formatDate(n.validFrom))} → ${esc(formatDate(n.validTo))}</p>
        <pre>${esc(n.text)}</pre>
      </article>`,
    )
    .join("");
}

function supplementBlock(items: AiswebSupplement[]): string {
  if (!items.length) return `<p class="muted">Nenhum suplemento em vigor.</p>`;
  return items
    .map(
      (s) => `
      <article class="card supp">
        <header><strong>SUP ${esc(s.number)}</strong> ${s.tipo ? `<span class="pill">${esc(s.tipo)}</span>` : ""}</header>
        ${s.title ? `<p class="title">${esc(s.title)}</p>` : ""}
        <pre>${esc(s.text)}</pre>
      </article>`,
    )
    .join("");
}

function airportSummaryHtml(airports: AirportDoc[], dark = false): string {
  if (!airports.length) return "";
  const cardHtml = (doc: AirportDoc) => {
    const s = airportSummaryFromBundle(roleLabel(doc.role), doc.icao, doc.bundle);
    const fuelIcon = s.fuelAvailable
      ? `<span class="fuel-badge" title="${esc(s.fuelLabel)}">Combustível</span>`
      : `<span class="fuel-none">Sem combustível</span>`;
    const metar = doc.bundle.met?.metar?.trim() || "";
    const note = String(doc.note || "").trim();
    return `
      <article class="summary-card ad-summary-tile">
        <header>
          <div>
            <p class="role">${esc(s.role)}</p>
            <h3>${esc(s.icao)}${s.name ? ` <span class="muted">— ${esc(s.name)}</span>` : ""}</h3>
          </div>
          ${fuelIcon}
        </header>
        <div class="summary-grid">
          <div><span>Elevação</span><strong>${s.elevFt != null ? `${esc(s.elevFt)} ft` : "—"}</strong></div>
          <div><span>Pista maior</span><strong>${s.longestRunwayM != null ? `${esc(s.longestRunwayM)} m` : "—"}</strong></div>
        </div>
        ${buildRunwayRoseSvg(doc.bundle.rotaer, { size: 160, dark })}
        <p class="line"><span>Frequências</span> ${esc(s.frequencies)}</p>
        <p class="line"><span>Combustível</span> ${esc(s.fuelLabel)}</p>
        <div class="metar-box">
          <span>METAR</span>
          <p class="mono">${esc(metar || "METAR indisponível")}</p>
        </div>
        ${
          note
            ? `<div class="note-box"><span>Observação</span><p>${esc(note)}</p></div>`
            : ""
        }
      </article>`;
  };

  const pages: string[] = [];
  for (let i = 0; i < airports.length; i += 2) {
    const pair = airports.slice(i, i + 2);
    pages.push(`
      <section class="page ad-summary-page">
        ${i === 0 ? `<h2>Resumo dos aeródromos</h2>` : `<h2 class="muted">Resumo dos aeródromos (cont.)</h2>`}
        <div class="summary-cards-2col">
          ${pair.map(cardHtml).join("")}
          ${pair.length === 1 ? `<div class="summary-card ad-summary-tile summary-card-empty" aria-hidden="true"></div>` : ""}
        </div>
      </section>`);
  }
  return `<div id="resumo-ads">${pages.join("")}</div>`;
}

function airportSectionHtml(
  doc: AirportDoc,
  sections: FlightPlanInfoSection[],
  dark = false,
): string {
  const { bundle, role, icao } = doc;
  const r = bundle.rotaer;
  const fuel = formatRotaerFuel(r?.fuel);
  const parts: string[] = [];

  parts.push(`
    <header class="ad-header">
      <div>
        <p class="role">${esc(roleLabel(role))}</p>
        <h2>${esc(icao)}${r?.name ? ` — ${esc(r.name)}` : ""}</h2>
        <p class="meta">${[r?.city, r?.uf].filter(Boolean).map(esc).join(" / ") || "—"}</p>
      </div>
      <div class="ad-stats">
        <div><span>Elev</span><strong>${r?.altFt != null ? `${esc(r.altFt)} ft` : "—"}</strong></div>
        <div><span>FIR</span><strong>${esc(r?.fir || bundle.airspace?.fir?.code || "—")}</strong></div>
        <div><span>Combustível</span><strong>${esc(fuel.available ? fuel.shortLabel : "—")}</strong></div>
      </div>
    </header>`);

  if (sections.includes("meteorologia")) {
    parts.push(`
      <section class="block">
        <h3>Meteorologia</h3>
        <p class="mono">${esc(bundle.met?.metar || "METAR indisponível")}</p>
        <p class="mono taf">${esc(bundle.met?.taf || "TAF indisponível")}</p>
      </section>`);
  }

  if (sections.includes("sol") && bundle.sun) {
    parts.push(`
      <section class="block">
        <h3>Sol</h3>
        <p>Nascer: <strong>${esc(bundle.sun.sunriseUtc || "—")}</strong> Z · Pôr: <strong>${esc(bundle.sun.sunsetUtc || "—")}</strong> Z</p>
      </section>`);
  }

  if (sections.includes("detalhes") && r) {
    parts.push(`
      <section class="block keep-together">
        <h3>Detalhes ROTAER · Pistas</h3>
        <p>Tipo: ${esc(r.typeOpr || "—")} · Utilização: ${esc(r.typeUtil || "—")}</p>
        <p>Combustível: ${esc(fuel.detailLabel)}</p>
        ${r.workingHours?.text ? `<p>Horário: ${esc(r.workingHours.text)}</p>` : ""}
        ${buildRunwayRoseSvg(r, { size: 220, dark })}
      </section>`);
  }

  if (sections.includes("frequencias")) {
    const freqs = (r?.frequencies || [])
      .map(
        (f) =>
          `<li><strong>${esc(f.service)}</strong>${f.callsign ? ` <span class="muted">(${esc(f.callsign)})</span>` : ""} — <span class="mono">${esc(f.frequenciesMhz.join(" · "))}</span></li>`,
      )
      .join("");
    parts.push(`
      <section class="block">
        <h3>Frequências</h3>
        ${freqs ? `<ul class="list">${freqs}</ul>` : "<p class='muted'>Sem frequências.</p>"}
      </section>`);
  }

  if (sections.includes("rmk")) {
    const remarks = r?.remarks || [];
    parts.push(`
      <section class="block">
        <h3>RMK (${remarks.length})</h3>
        ${
          remarks.length
            ? remarks
                .map(
                  (rmk) =>
                    `<article class="card keep-together">${rmk.code ? `<header><strong>${esc(rmk.code)}</strong></header>` : ""}<pre>${esc(rmk.text)}</pre></article>`,
                )
                .join("")
            : "<p class='muted'>Nenhum RMK no ROTAER.</p>"
        }
      </section>`);
  }

  if (sections.includes("compl")) {
    const complements = r?.complements || [];
    parts.push(`
      <section class="block">
        <h3>COMPL (${complements.length})</h3>
        ${
          complements.length
            ? complements
                .map(
                  (item) =>
                    `<article class="card keep-together">${
                      item.code || item.index != null
                        ? `<header><strong>${esc(
                            [item.code ? `cod ${item.code}` : null, item.index != null ? `n ${item.index}` : null]
                              .filter(Boolean)
                              .join(" · "),
                          )}</strong></header>`
                        : ""
                    }<pre>${esc(item.text)}</pre></article>`,
                )
                .join("")
            : "<p class='muted'>Nenhum complemento no ROTAER.</p>"
        }
      </section>`);
  }

  if (sections.includes("notams")) {
    parts.push(`<section class="block"><h3>NOTAMs (${bundle.notams.length})</h3>${notamBlock(bundle.notams)}</section>`);
  }

  if (sections.includes("suplementos")) {
    const supps = bundle.supplements || [];
    parts.push(`<section class="block"><h3>Suplementos (${supps.length})</h3>${supplementBlock(supps)}</section>`);
  }

  if (sections.includes("cartas")) {
    const charts = (bundle.charts || [])
      .map(
        (c) =>
          `<li><strong>${esc(c.tipo || "—")}</strong> — ${esc(c.name)}${c.date ? ` <span class="muted">(${esc(c.date)})</span>` : ""}</li>`,
      )
      .join("");
    parts.push(`
      <section class="block">
        <h3>Cartas</h3>
        ${charts ? `<ul class="list">${charts}</ul>` : "<p class='muted'>Nenhuma carta listada.</p>"}
      </section>`);
  }

  return `<section id="ad-${esc(doc.icao)}" class="page ad-page keep-together">${parts.join("")}</section>`;
}

export function buildFlightPlanDocumentHtml(input: FlightPlanDocumentInput): string {
  const continuous = input.mode === "continuous";
  const logoSrc = getPdfBrandLogoSrc(input.brand);
  const schoolName = input.brand?.schoolName || "Escola de Aviacao";
  const primary = continuous ? "#22d3ee" : input.brand?.primaryColor || "#0e7490";
  const accent = continuous ? "#38bdf8" : input.brand?.accentColor || "#0369a1";
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const altText = input.alternates.length ? input.alternates.join(", ") : "—";
  const summary = input.routeSummary;
  const includeRouteTable = input.sections.includes("tabela_rota") && (input.routeTableRows?.length ?? 0) > 0;
  const mapHtml = input.mapImageDataUrl
    ? `<div id="mapa" class="map-wrap keep-together"><img class="map-img" src="${esc(input.mapImageDataUrl)}" alt="Mapa da rota" /></div>`
    : input.mapSvg || (summary?.waypoints?.length ? buildFlightPlanMapSvg(summary.waypoints) : "")
      ? `<div id="mapa" class="map-wrap keep-together">${input.mapSvg || buildFlightPlanMapSvg(summary?.waypoints || [])}</div>`
      : "";

  const profileHtml = input.verticalProfileSvg
    ? `<section id="perfil" class="keep-together" style="margin-top:14px"><h3>Perfil vertical</h3><div class="profile-wrap">${input.verticalProfileSvg}</div></section>`
    : "";

  const routeTableHtml = includeRouteTable
    ? `<section id="tabela-rota" class="keep-together" style="margin-top:14px">
        <h3>Tabela da rota</h3>
        <table>
          <thead><tr>
            <th>#</th><th>Ponto</th><th>Proa</th><th>Alt</th><th>Corredor</th>
            <th>Dist.</th><th>Dist. acum.</th>
            <th>Tempo</th><th>Tempo acum.</th>
            <th>Consumo</th><th>Consumo acum.</th>
            <th>Obs</th>
          </tr></thead>
          <tbody>
            ${input.routeTableRows!
              .map(
                (r) => `<tr>
                  <td>${esc(r.index)}</td>
                  <td>${esc(r.point)}</td>
                  <td class="mono">${esc(r.bearing)}</td>
                  <td class="mono">${esc(r.altitude)}</td>
                  <td>${esc(r.corridor)}</td>
                  <td class="mono">${esc(r.distance)}</td>
                  <td class="mono">${esc(r.distanceAccum)}</td>
                  <td class="mono">${esc(r.ete)}</td>
                  <td class="mono">${esc(r.eteAccum)}</td>
                  <td class="mono">${esc(r.fuel)}</td>
                  <td class="mono">${esc(r.fuelAccum)}</td>
                  <td>${esc(r.note)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>`
    : "";

  const airspaceRows = input.airspaces.length
    ? input.airspaces
        .map(
          (a, idx) =>
            `<tr>
              <td>${esc(idx + 1)}</td>
              <td><span class="pill ${esc(a.type.toLowerCase())}">${esc(a.type)}</span></td>
              <td>${esc(a.name)}</td>
              <td class="mono">${esc(a.ident)}</td>
              <td>${esc(a.lower || "—")} / ${esc(a.upper || "—")}</td>
              <td>${esc(formatAirspaceFreqCell(a))}</td>
              <td>${a.entryDistanceNm != null ? `${esc(a.entryDistanceNm.toFixed(1))} NM` : "—"}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="muted">Nenhum CTA/TMA/CTR/ATZ na altitude planejada ao longo da rota.</td></tr>`;

  const airportPages = input.airports
    .map((doc) => airportSectionHtml(doc, input.sections, continuous))
    .join("");

  const tocLinks = [
    {
      href: "#capa",
      label: "Capa",
      icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm1 7V3.5L18.5 9H15zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h5v2H8V9z"/></svg>`,
    },
    ...(mapHtml
      ? [
          {
            href: "#mapa",
            label: "Mapa",
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>`,
          },
        ]
      : []),
    ...(profileHtml
      ? [
          {
            href: "#perfil",
            label: "Perfil",
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99l1.5 1.5z"/></svg>`,
          },
        ]
      : []),
    ...(routeTableHtml
      ? [
          {
            href: "#tabela-rota",
            label: "Tabela",
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 5v14h18V5H3zm8 12H5v-2h6v2zm0-4H5v-2h6v2zm0-4H5V7h6v2zm8 8h-6v-2h6v2zm0-4h-6v-2h6v2zm0-4h-6V7h6v2z"/></svg>`,
          },
        ]
      : []),
    {
      href: "#espacos",
      label: "Espaços",
      icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`,
    },
    {
      href: "#resumo-ads",
      label: "Aeródromos",
      icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`,
    },
    ...input.airports.map((a) => ({
      href: `#ad-${a.icao}`,
      label: a.icao,
      icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/></svg>`,
    })),
  ];

  const tocHtml = `<nav id="sumario" class="toc-panel" aria-label="Sumário">
    <p class="toc-title">Sumário</p>
    <div class="toc-buttons">
      ${tocLinks
        .map(
          (l) =>
            `<a class="toc-btn" href="${esc(l.href)}"><span class="toc-ico">${l.icon}</span><span>${esc(l.label)}</span></a>`,
        )
        .join("")}
    </div>
  </nav>`;

  const menuFabHtml = `<a class="menu-fab" href="#sumario" title="Ir ao sumário" aria-label="Ir ao sumário"><span class="menu-fab-ico" aria-hidden="true">☰</span></a>`;

  const themeCss = continuous
    ? `
    body { color: #e2e8f0; background: #020617; font-size: 13px; line-height: 1.5; }
    .container { max-width: 1100px; margin: 0 auto; padding: 16px; }
    .cover, .page { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; margin-bottom: 12px; page-break: auto; page-break-after: auto; page-break-inside: avoid; break-inside: avoid; }
    .brand-name, .meta, .muted, .line span, .summary-grid span, .ad-stats span, th { color: #94a3b8; }
    .eyebrow { color: ${esc(primary)}; }
    h1, h2, h3, .summary-card h3, .stat strong, .ad-stats strong { color: #f8fafc; }
    h3 { border-bottom-color: #1e293b; color: ${esc(primary)}; }
    .route-line { color: ${esc(accent)}; }
    .stat, .summary-card, .card { background: #020617; border-color: #1e293b; }
    .list li, th, td { border-bottom-color: #1e293b; color: #cbd5e1; }
    .mono, pre { color: #cbd5e1; }
    .fuel-badge { background: #064e3b; color: #6ee7b7; border-color: #065f46; }
    .fuel-none { color: #64748b; }
    .map-wrap, .profile-wrap { border-color: #1e293b; }
    .footer { color: #64748b; }
    .toc-panel { border-color: #334155; background: #0f172a; }
    .toc-btn { background: #020617; border-color: #334155; color: #e2e8f0; }
    .menu-fab { background: #0e7490; color: #fff; }
    .ad-summary-tile { border-color: #334155 !important; background: #020617 !important; }
    @media print {
      body { background: #020617; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cover, .page { background: #0f172a !important; }
      .menu-fab {
        position: fixed; right: 8mm; bottom: 8mm; z-index: 100;
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; border-radius: 999px;
        background: #0e7490 !important; color: #fff !important;
      }
      .menu-fab-ico { color: #fff !important; font-size: 18px !important; }
    }
    `
    : `
    body { color: #0f172a; background: #f1f5f9; font-size: 12.5px; line-height: 1.45; }
    .container { max-width: 1200px; margin: 0 auto; padding: 18px; }
    .cover { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-bottom: 14px; page-break-after: always; break-after: page; }
    .page { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; margin-bottom: 12px; }
    .brand-name, .meta, .muted { color: #64748b; }
    .eyebrow { color: ${esc(primary)}; }
    h3 { color: ${esc(primary)}; border-bottom: 1px solid #e2e8f0; }
    .route-line { color: ${esc(accent)}; }
    .stat, .summary-card, .card { background: #f8fafc; border: 1px solid #e2e8f0; }
    .list li, th, td { border-bottom: 1px solid #e2e8f0; }
    .fuel-badge { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .fuel-none { color: #94a3b8; }
    @media print {
      @page { size: A4 landscape; margin: 10mm; }
      body { background: #fff; }
      .container { max-width: none; padding: 0; }
      .cover, .page { border: none; border-radius: 0; margin: 0; padding: 6mm 8mm; }
      .cover { page-break-after: always; break-after: page; }
      .ad-summary-page { page-break-after: always; break-after: page; }
      .menu-fab {
        position: fixed;
        right: 8mm;
        bottom: 8mm;
        z-index: 100;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: ${esc(primary)} !important;
        color: #fff !important;
        text-decoration: none;
        box-shadow: 0 2px 8px rgba(15,23,42,.25);
      }
      .menu-fab-ico { color: #fff !important; font-size: 18px !important; }
    }
    `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plano de voo ${esc(input.origin)} → ${esc(input.destination)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", system-ui, sans-serif; }
    ${themeCss}
    .keep-together, .summary-card, .ad-page, .card, .map-wrap, .profile-wrap, tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .brand-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; }
    .brand-name { font-size: ${continuous ? "13px" : "11px"}; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
    .logo { max-height: 56px; max-width: 180px; object-fit: contain; }
    .eyebrow { font-size: ${continuous ? "13px" : "11px"}; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 8px; }
    h1 { font-size: ${continuous ? "28px" : "26px"}; line-height: 1.1; margin-bottom: 8px; }
    h2 { font-size: ${continuous ? "22px" : "18px"}; margin-bottom: 12px; }
    h3 { font-size: ${continuous ? "15px" : "12px"}; text-transform: uppercase; letter-spacing: 0.08em; margin: 12px 0 8px; padding-bottom: 4px; }
    .route-line { font-size: ${continuous ? "24px" : "20px"}; font-weight: 700; margin: 10px 0 16px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
    .stat { border-radius: 12px; padding: 10px; border: 1px solid transparent; }
    .stat span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
    .stat strong { display: block; margin-top: 4px; font-size: 16px; }
    .mono { font-family: ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
    .taf { margin-top: 6px; }
    .list { list-style: none; display: grid; gap: 4px; }
    .list li { padding: 4px 0; border-bottom: 1px dashed currentColor; opacity: 0.95; }
    .card { border-radius: 10px; padding: 10px; margin-top: 8px; border: 1px solid transparent; }
    .pill { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: #e2e8f0; color: #334155; }
    .pill.cta { background: #fef3c7; color: #92400e; }
    .pill.tma { background: #ede9fe; color: #5b21b6; }
    .pill.ctr { background: #dbeafe; color: #1e40af; }
    .pill.atz { background: #dcfce7; color: #166534; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 6px 5px; vertical-align: top; font-size: 11px; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .ad-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
    .role { font-size: ${continuous ? "12px" : "10px"}; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${esc(accent)}; }
    .ad-stats { display: flex; gap: 14px; }
    .ad-stats span { display: block; font-size: 9px; text-transform: uppercase; font-weight: 700; }
    .ad-stats strong { font-size: 13px; }
    pre { white-space: pre-wrap; font-family: ui-monospace, Consolas, monospace; font-size: 11px; margin-top: 6px; }
    .map-wrap, .profile-wrap { margin-top: 12px; overflow: hidden; border-radius: 12px; border: 1px solid #e2e8f0; }
    .map-img { display: block; width: 100%; height: auto; }
    .profile-wrap { padding: 8px; background: #fff; }
    .rwy-rose { margin-top: 10px; }
    .rwy-legend { margin-top: 8px; font-size: 11px; }
    .summary-cards { display: grid; gap: 10px; }
    .summary-card { border-radius: 12px; padding: 14px; border: 1px solid transparent; }
    .summary-card header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
    .summary-card h3 { font-size: ${continuous ? "20px" : "16px"}; margin: 0; text-transform: none; letter-spacing: 0; border: 0; padding: 0; color: inherit; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
    .summary-grid span { display: block; font-size: 10px; text-transform: uppercase; font-weight: 700; }
    .summary-grid strong { font-size: 15px; }
    .line { margin-top: 4px; font-size: 12px; }
    .line span { display: inline-block; min-width: 88px; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .metar-box, .note-box { margin-top: 10px; border-radius: 10px; padding: 10px; border: 1px solid ${continuous ? "#1e293b" : "#e2e8f0"}; background: ${continuous ? "#020617" : "#f8fafc"}; }
    .metar-box span, .note-box span { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${continuous ? "#94a3b8" : "#64748b"}; margin-bottom: 4px; }
    .metar-box .mono { font-size: ${continuous ? "12px" : "11px"}; }
    .note-box p { font-size: ${continuous ? "13px" : "12px"}; white-space: pre-wrap; }
    .fuel-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; }
    .footer { margin-top: 18px; font-size: 11px; }
    .toc-panel { margin: 14px 0 4px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; }
    .toc-title { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
    .toc-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .toc-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 10px; border-radius: 999px; border: 1px solid #cbd5e1;
      background: #f8fafc; color: ${esc(accent)}; text-decoration: none;
      font-size: 11px; font-weight: 700;
    }
    .toc-btn:hover { background: #ecfeff; border-color: ${esc(accent)}; }
    .toc-ico { display: inline-flex; width: 14px; height: 14px; }
    .menu-fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 100;
      display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 999px;
      background: ${esc(primary)}; color: #fff; text-decoration: none;
      box-shadow: 0 4px 14px rgba(15,23,42,.2);
    }
    .menu-fab-ico {
      display: block; font-size: 20px; line-height: 1; font-weight: 700;
      color: #fff; transform: translateY(-1px);
    }
    .summary-cards-2col {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px;
      align-items: stretch;
    }
    .ad-summary-tile {
      border: 1px solid ${continuous ? "#334155" : "#cbd5e1"} !important;
      border-radius: 14px !important;
      padding: 14px !important;
      background: ${continuous ? "#020617" : "#fff"} !important;
      box-shadow: 0 1px 0 rgba(15,23,42,.04);
      min-height: 100%;
    }
    .summary-card-empty { visibility: hidden; border: 0 !important; box-shadow: none !important; background: transparent !important; }
    .ad-summary-page { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="container">
    <section id="capa" class="cover keep-together">
      <div class="brand-row">
        <div>
          <p class="brand-name">${esc(schoolName)}</p>
          <p class="eyebrow">Planejamento de voo · AISWEB${continuous ? " · offline" : ""}</p>
        </div>
        ${logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="" />` : ""}
      </div>
      <h1>Briefing de aeródromos</h1>
      <p class="route-line">${esc(input.origin)} → ${esc(input.destination)}</p>
      <p>Alternativos: <strong>${esc(altText)}</strong></p>
      ${tocHtml}
      <div class="stats">
        <div class="stat"><span>Distância</span><strong>${esc(summary ? formatDistanceNm(summary.distanceNm) : "—")}</strong></div>
        <div class="stat"><span>ETE</span><strong>${esc(formatEteHours(summary?.eteHours ?? null))}</strong></div>
        <div class="stat"><span>Consumo est.</span><strong>${esc(formatFuel(summary?.fuelEstimate ?? null, input.fuelUnit))}</strong></div>
        <div class="stat"><span>Pontos rota</span><strong>${esc(summary?.waypoints.length ?? 0)}</strong></div>
      </div>
      <p class="meta" style="margin-top:14px">Cruzeiro: ${input.cruiseSpeedKt != null ? `${esc(input.cruiseSpeedKt)} kt` : "—"} · Queima: ${input.fuelBurnPerHour != null ? `${esc(input.fuelBurnPerHour)} ${esc(input.fuelUnit)}/h` : "—"}</p>
      ${mapHtml}
      ${profileHtml}
      ${routeTableHtml}
      ${input.routeText.trim() ? `<section style="margin-top:16px"><h3>Rota (FPL)</h3><p class="mono">${esc(input.routeText.trim())}</p></section>` : ""}
      <section id="espacos" style="margin-top:16px" class="keep-together">
        <h3>Espaço aéreo na rota (ordem de passagem)</h3>
        <table>
          <thead><tr><th>#</th><th>Tipo</th><th>Nome</th><th>Ident</th><th>Limites</th><th>Frequências</th><th>Entrada</th></tr></thead>
          <tbody>${airspaceRows}</tbody>
        </table>
      </section>
      <p class="footer">Gerado em ${esc(generatedAt)} · Dados AISWEB / GeoAISWEB</p>
    </section>
    ${airportSummaryHtml(input.airports, continuous)}
    ${airportPages}
  </div>
  ${menuFabHtml}
</body>
</html>`;
}

export function openFlightPlanPdf(input: OpenFlightPlanPdfInput): void {
  const continuous = input.mode === "continuous";
  const html = buildFlightPlanDocumentHtml(input).replace(
    "</body>",
    `<script>
    window.addEventListener("load", function () {
      ${continuous ? "" : "setTimeout(function () { window.focus(); window.print(); }, 500);"}
    });
  </script>
</body>`,
  );

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Pop-up bloqueado. Permita janelas pop-up para exportar o PDF.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
