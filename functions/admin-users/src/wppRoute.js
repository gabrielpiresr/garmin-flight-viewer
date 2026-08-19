"use strict";

const rea = require("./reaCorridorRoute");
const routePerf = require("./routePerformanceProfile");

const GEOAISWEB = "https://geoaisweb.decea.mil.br/geoserver/ows";
const ESRI_EXPORT = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export";
const CRUISE_KT = routePerf.DEFAULT_FLIGHT_PERFORMANCE.cruiseSpeedKt;
const BURN_LPH = routePerf.DEFAULT_FLIGHT_PERFORMANCE.cruiseBurnPerHour;
const ICAO_RE = /^[A-Z0-9]{4}$/;
const MAP_WIDTH = 1920;
const MAP_HEIGHT = 1248;
const MAP_SCALE = MAP_WIDTH / 1200;

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeIcao(value) {
  return cleanString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseWppRouteCommand(text, responseId = "") {
  const candidates = [cleanString(text), cleanString(responseId)].filter(Boolean);
  for (const raw of candidates) {
    const normalized = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const help = normalized.toLowerCase();
    if (help === "rota" || help === "help_rota" || help === "como rota") {
      return { kind: "help" };
    }
    if (help === "wpp_open_route" || help === "ver na plataforma" || help === "abrir rota") {
      return { kind: "open" };
    }
    const match = normalized.match(
      /^rota\s+([A-Za-z0-9]{4})\s*(?:para|to|-|\/|->|→)?\s*([A-Za-z0-9]{4})\s*$/i,
    );
    if (!match) continue;
    const origin = normalizeIcao(match[1]);
    const destination = normalizeIcao(match[2]);
    if (!ICAO_RE.test(origin) || !ICAO_RE.test(destination)) continue;
    return { kind: "route", origin, destination };
  }
  return null;
}

function pendingRouteKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `wpp_pending_route_${digits}` : "";
}

function compactWaypoint(wp) {
  if (!wp || !Number.isFinite(wp.lat) || !Number.isFinite(wp.lng)) return null;
  return {
    raw: wp.raw || wp.label || "",
    lat: wp.lat,
    lng: wp.lng,
    label: wp.label || wp.raw || "",
    kind: wp.kind || "fix",
    ...(wp.reaName ? { reaName: wp.reaName } : {}),
    ...(wp.altitudeFt != null && Number.isFinite(wp.altitudeFt) ? { altitudeFt: Math.round(wp.altitudeFt) } : {}),
    ...(wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt) ? { fieldElevFt: Math.round(wp.fieldElevFt) } : {}),
    altitudeRef: wp.altitudeRef || "bs",
    ...(wp.note ? { note: String(wp.note).slice(0, 80) } : {}),
  };
}

function parseSettingJson(doc) {
  if (!doc) return {};
  try {
    const raw = typeof doc.settings_json === "string" ? JSON.parse(doc.settings_json) : doc.settings_json;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

async function storePendingRoute(deps, phone, payload) {
  const key = pendingRouteKey(phone);
  if (!key || typeof deps.upsertPlatformSettingDoc !== "function") return;
  await deps.upsertPlatformSettingDoc(key, payload);
}

async function loadPendingRoute(deps, phone) {
  const key = pendingRouteKey(phone);
  if (!key || typeof deps.getSettingDoc !== "function") return null;
  const doc = await deps.getSettingDoc(key).catch(() => null);
  const raw = parseSettingJson(doc);
  if (!Array.isArray(raw.waypoints) || raw.waypoints.length < 2) return null;
  return raw;
}

function formatWppRouteHelpMessage(nickname) {
  const greet = nickname ? `${nickname}, ` : "";
  return [
    `${greet}para traçar uma rota via REAs, envie:`,
    "",
    "*Rota {ICAO} {ICAO}*",
    "",
    "Exemplo:",
    "• Rota SBJD SBLO",
    "",
    "Eu confirmo o pedido, monto a rota automaticamente e te mando mapa, tabela, perfil, espaços aéreos, resumo e os campos Rota e RMK para copiar.",
  ].join("\n");
}

function routeBbox(points, padDeg = 0.6) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) continue;
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat)) return null;
  const spanLng = Math.max(0.2, maxLng - minLng);
  const spanLat = Math.max(0.15, maxLat - minLat);
  return {
    minLng: minLng - spanLng * padDeg,
    minLat: minLat - spanLat * padDeg,
    maxLng: maxLng + spanLng * padDeg,
    maxLat: maxLat + spanLat * padDeg,
  };
}

function fitBboxToAspect(bbox, width, height) {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  let minLng = bbox.minLng;
  let maxLng = bbox.maxLng;
  let minLat = bbox.minLat;
  let maxLat = bbox.maxLat;
  const spanLng = Math.max(0.15, maxLng - minLng);
  const spanLat = Math.max(0.12, maxLat - minLat);
  const targetAspect = width / Math.max(1, height);
  const geoAspect = (spanLng * cosLat) / Math.max(1e-9, spanLat);
  if (geoAspect < targetAspect) {
    const needLng = (spanLat * targetAspect) / cosLat;
    const grow = (needLng - spanLng) / 2;
    minLng -= grow;
    maxLng += grow;
  } else if (geoAspect > targetAspect) {
    const needLat = (spanLng * cosLat) / targetAspect;
    const grow = (needLat - spanLat) / 2;
    minLat -= grow;
    maxLat += grow;
  }
  return { minLng, minLat, maxLng, maxLat };
}

function project(lat, lng, bbox, width, height) {
  const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng || 1)) * width;
  const y = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat || 1)) * height;
  return [x, y];
}

function featureInBbox(feature, bbox) {
  const props = feature?.properties || {};
  const a = rea.endpointA(props);
  const b = rea.endpointB(props);
  const pts = [
    a.lat != null && a.lon != null ? { lat: a.lat, lng: a.lon } : null,
    b.lat != null && b.lon != null ? { lat: b.lat, lng: b.lon } : null,
  ].filter(Boolean);
  if (!pts.length) return false;
  return pts.some(
    (p) => p.lat >= bbox.minLat && p.lat <= bbox.maxLat && p.lng >= bbox.minLng && p.lng <= bbox.maxLng,
  );
}

async function fetchWfsJson(typeName, bbox, maxFeatures = 2000) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
  });
  if (bbox) params.set("bbox", `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
  const response = await fetch(`${GEOAISWEB}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`WFS ${typeName} falhou (${response.status})`);
  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function fetchJsonCollection(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Falha ao baixar ${url} (${response.status})`);
  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function fetchReaFeatures(appUrl) {
  const origin = cleanString(appUrl).replace(/\/+$/, "") || "https://app.epeac.com.br";
  const collected = [];
  const sources = [
    { url: `${origin}/geo/cv-rea-br.json`, kind: "rea" },
    { url: `${origin}/geo/cv-rea-wh-bh.json`, kind: "rea" },
    { url: `${origin}/geo/cv-rea-wt-ct.json`, kind: "rea" },
    { url: `${origin}/geo/cv-reh-br.json`, kind: "reh" },
  ];
  for (const source of sources) {
    try {
      const features = await fetchJsonCollection(source.url);
      collected.push(...features.map((feature) => ({ ...feature, _kind: source.kind })));
    } catch {
      /* WFS below */
    }
  }
  if (collected.length < 8) {
    const layers = [
      { layer: "ICA:CV_REA_BR_COMPLETO", kind: "rea" },
      { layer: "ICA:CV_REH_BR_COMPLETO", kind: "reh" },
    ];
    await Promise.all(
      layers.map(async ({ layer, kind }) => {
        try {
          const features = await fetchWfsJson(layer, null, 5000);
          collected.push(...features.map((feature) => ({ ...feature, _kind: kind })));
        } catch {
          /* ignore */
        }
      }),
    );
  }
  const seen = new Set();
  return collected.filter((feature) => {
    const id = `${feature._kind || ""}:${String(feature?.id ?? JSON.stringify(feature?.properties || {}))}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchImageBuffer(url) {
  const response = await fetch(url, { headers: { Accept: "image/png,image/jpeg,*/*" } });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length ? buffer : null;
}

function airportWaypoint(icao, rotaer) {
  const lat = Number(rotaer?.lat);
  const lng = Number(rotaer?.lng);
  const elev = Number(rotaer?.altFt);
  return {
    raw: icao,
    lat,
    lng,
    label: icao,
    kind: "airport",
    fieldElevFt: Number.isFinite(elev) ? Math.round(elev) : null,
    altitudeFt: Number.isFinite(elev) ? Math.round(elev) : null,
  };
}

function originInsideTma(origin, airspaces) {
  if (!origin) return false;
  return (airspaces || []).some(
    (hit) =>
      String(hit?.type || "").toUpperCase() === "TMA" &&
      hit.entryDistanceNm != null &&
      Number.isFinite(hit.entryDistanceNm) &&
      hit.entryDistanceNm < 3,
  );
}

function formatFreq(hit) {
  const freqs = Array.isArray(hit?.frequencies) ? hit.frequencies : [];
  if (!freqs.length) return "—";
  return freqs.map((f) => `${f.service || ""} ${f.mhz || ""}`.trim()).filter(Boolean).join(" · ") || "—";
}

function formatLimit(value) {
  return value ? String(value) : "—";
}

function svgCard(width, height, title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="28" fill="#020617"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="22" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
  <text x="40" y="58" fill="#67e8f9" font-size="22" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(title)}</text>
  ${body}
</svg>`;
}

function waypointCumNm(waypoints, index) {
  let cum = 0;
  for (let i = 1; i <= index && i < waypoints.length; i++) {
    cum += rea.haversineM(waypoints[i - 1], waypoints[i]) / 1852;
  }
  return cum;
}

function buildRouteTableDisplayRows(origin, dest, waypoints, legs, corridors, performance) {
  const rows = [];
  const markers = [...(performance?.phaseMarkers || [])]
    .filter((m) => m.label === "TOC" || m.label === "TOD")
    .sort((a, b) => a.xNm - b.xNm);
  let markerIdx = 0;
  const flush = (limitNm, afterWpIndex) => {
    while (markerIdx < markers.length) {
      const m = markers[markerIdx];
      if (m.xNm >= limitNm - 1e-4) break;
      const prevCum = waypointCumNm(waypoints, afterWpIndex);
      if (m.xNm <= prevCum + 0.05) {
        markerIdx += 1;
        continue;
      }
      const prevWp = waypoints[afterWpIndex];
      const nextWp = waypoints[afterWpIndex + 1];
      const bearing =
        prevWp && nextWp ? rea.formatBearingDeg(legs[afterWpIndex]?.bearingDeg ?? 0) : "—";
      rows.push({
        kind: m.label === "TOC" ? "toc" : "tod",
        label: m.label,
        name: m.label === "TOC" ? "Topo de subida" : "Topo de descida",
        coord: rea.formatCompactAviationCoord(m.lat, m.lng),
        proa: bearing,
        alt: `${Math.round(m.altFt)} ft`,
        corr: "—",
        dist: `${Math.max(0, m.xNm - prevCum).toFixed(1)} NM`,
        ete: rea.formatEteClock(m.eteHours ?? null),
        fuel: "—",
        highlight: m.label === "TOC" ? "#c4b5fd" : "#f0abfc",
      });
      markerIdx += 1;
    }
  };
  for (let idx = 0; idx < waypoints.length; idx++) {
    const wp = waypoints[idx];
    const cum = waypointCumNm(waypoints, idx);
    if (idx > 0) flush(cum, idx - 1);
    const leg = idx > 0 ? legs[idx - 1] : null;
    const corridor = idx > 0 ? corridors[idx] : null;
    rows.push({
      kind: "waypoint",
      label: String(idx + 1),
      name: wp.reaName || wp.label || "—",
      coord: rea.formatCompactAviationCoord(wp.lat, wp.lng),
      proa: leg ? rea.formatBearingDeg(leg.bearingDeg) : "—",
      alt: wp.altitudeFt != null ? `${Math.round(wp.altitudeFt)} ft` : "—",
      corr: corridor ? corridor.name : idx > 0 ? "DCT" : "—",
      dist: leg ? `${leg.distanceNm.toFixed(1)} NM` : "—",
      ete: leg ? rea.formatEteClock(leg.eteHours) : "—",
      fuel: leg?.fuelEstimate != null ? `${leg.fuelEstimate.toFixed(1)} L` : "—",
      highlight: null,
      corridor: Boolean(corridor),
    });
  }
  if (waypoints.length >= 2) flush(waypointCumNm(waypoints, waypoints.length - 1) + 1e-3, waypoints.length - 2);
  return rows;
}

function buildRouteTableSvg(origin, dest, waypoints, legs, corridors, performance) {
  const displayRows = buildRouteTableDisplayRows(origin, dest, waypoints, legs, corridors, performance);
  const rowH = 34;
  const headerH = 86;
  const width = 1180;
  const height = Math.max(220, headerH + 28 + (displayRows.length + 1) * rowH + 24);
  const cols = [
    { x: 40, label: "#" },
    { x: 80, label: "Ponto" },
    { x: 280, label: "Coord" },
    { x: 470, label: "Proa" },
    { x: 545, label: "Alt" },
    { x: 640, label: "Corredor" },
    { x: 860, label: "Dist" },
    { x: 960, label: "Tempo" },
    { x: 1070, label: "Cons." },
  ];
  const header = cols
    .map((c) => `<text x="${c.x}" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${c.label}</text>`)
    .join("");
  const rows = displayRows
    .map((row, idx) => {
      const y = headerH + 28 + idx * rowH;
      const fill = row.highlight ? `${row.highlight}22` : idx % 2 === 0 ? "#0b1220" : "transparent";
      const nameFill = row.highlight || "#e2e8f0";
      const corrFill = row.corridor ? "#34d399" : "#64748b";
      return `<rect x="28" y="${y - 22}" width="${width - 56}" height="${rowH}" fill="${fill}" rx="8"/>
        <text x="40" y="${y}" fill="${row.highlight || "#94a3b8"}" font-size="13" font-family="ui-monospace,monospace" font-weight="${row.kind === "waypoint" ? "400" : "700"}">${escapeXml(row.label)}</text>
        <text x="80" y="${y}" fill="${nameFill}" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(row.name)}</text>
        <text x="280" y="${y}" fill="#67e8f9" font-size="13" font-family="ui-monospace,monospace">${escapeXml(row.coord)}</text>
        <text x="470" y="${y}" fill="#cbd5e1" font-size="13" font-family="ui-monospace,monospace">${escapeXml(row.proa)}</text>
        <text x="545" y="${y}" fill="#fbbf24" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(row.alt)}</text>
        <text x="640" y="${y}" fill="${corrFill}" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(row.corr)}</text>
        <text x="860" y="${y}" fill="#cbd5e1" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(row.dist)}</text>
        <text x="960" y="${y}" fill="#cbd5e1" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(row.ete)}</text>
        <text x="1070" y="${y}" fill="#cbd5e1" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(row.fuel)}</text>`;
    })
    .join("");
  return svgCard(width, height, `Tabela da rota · ${origin} → ${dest}`, `${header}${rows}`);
}

function altitudeAtNm(profile, xNm) {
  if (!profile?.length) return null;
  if (xNm <= profile[0].xNm) return profile[0].altFt;
  const last = profile[profile.length - 1];
  if (xNm >= last.xNm) return last.altFt;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (xNm > b.xNm) continue;
    if (b.xNm === a.xNm) return b.altFt;
    const t = (xNm - a.xNm) / (b.xNm - a.xNm);
    return Math.round(a.altFt + (b.altFt - a.altFt) * t);
  }
  return last.altFt;
}

function buildVerticalProfileSvg(origin, dest, waypoints, legs, corridors, terrain, performance) {
  const width = 1180;
  const height = 520;
  const padL = 70;
  const padR = 30;
  const padT = 90;
  const padB = 50;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const totalNm = performance?.totalDistanceNm || legs[legs.length - 1]?.cumulativeDistanceNm || 1;
  const minFt = 0;
  let maxFt = 1500;
  const profile = Array.isArray(performance?.profile) ? performance.profile : [];
  const marks = [{ xNm: 0, label: waypoints[0]?.label || origin, alt: waypoints[0]?.altitudeFt ?? 0 }];
  for (const leg of legs) {
    marks.push({
      xNm: leg.cumulativeDistanceNm,
      label: leg.to?.reaName || leg.to?.label || "",
      alt: leg.to?.altitudeFt ?? null,
    });
  }
  for (const m of marks) {
    if (m.alt != null) maxFt = Math.max(maxFt, m.alt);
  }
  for (const p of profile) {
    if (p?.altFt != null) maxFt = Math.max(maxFt, p.altFt);
  }
  for (const c of corridors) {
    if (c?.altMax != null) maxFt = Math.max(maxFt, c.altMax);
  }
  for (const p of terrain || []) {
    if (p?.elevFt != null) maxFt = Math.max(maxFt, p.elevFt);
  }
  maxFt += 400;
  const xScale = (nm) => padL + (nm / totalNm) * plotW;
  const yScale = (ft) => padT + plotH - ((ft - minFt) / (maxFt - minFt || 1)) * plotH;

  const corridorRects = [];
  let cum = 0;
  for (let i = 0; i < legs.length; i++) {
    const corridor = corridors[i + 1];
    const x0 = xScale(cum);
    cum = legs[i].cumulativeDistanceNm;
    if (!corridor) continue;
    const x1 = xScale(cum);
    const yTop = yScale(corridor.altMax || maxFt);
    const yBot = yScale(corridor.altMin || 0);
    corridorRects.push(
      `<rect x="${x0.toFixed(1)}" y="${Math.min(yTop, yBot).toFixed(1)}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${Math.max(1, Math.abs(yBot - yTop)).toFixed(1)}" fill="#f87171" fill-opacity="0.12" stroke="#ef4444" stroke-opacity="0.7" stroke-dasharray="4 3"/>
       <text x="${((x0 + x1) / 2).toFixed(1)}" y="${(Math.min(yTop, yBot) + 16).toFixed(1)}" text-anchor="middle" fill="#fca5a5" font-size="11" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(corridor.name)}</text>`,
    );
  }

  const plannedPts = profile.length
    ? profile.map((p) => `${xScale(p.xNm).toFixed(1)},${yScale(p.altFt).toFixed(1)}`)
    : marks.filter((m) => m.alt != null).map((m) => `${xScale(m.xNm).toFixed(1)},${yScale(m.alt).toFixed(1)}`);
  const planned = plannedPts.join(" ");
  const terrainPts = (terrain || [])
    .map((p, i, arr) => {
      const xNm = arr.length > 1 ? (i / (arr.length - 1)) * totalNm : 0;
      if (p?.elevFt == null) return null;
      return `${xScale(xNm).toFixed(1)},${yScale(p.elevFt).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const wpLabels = marks
    .map((m) => {
      const x = xScale(m.xNm);
      const alt = profile.length ? altitudeAtNm(profile, m.xNm) : m.alt;
      const y = alt != null ? yScale(alt) : padT + plotH;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#22d3ee" stroke="#fff" stroke-width="1.4"/>
        <text x="${x.toFixed(1)}" y="${padT - 10}" text-anchor="middle" fill="#94a3b8" font-size="11" font-family="ui-monospace,monospace">${escapeXml(String(m.label || "").slice(0, 10))}</text>`;
    })
    .join("");

  const phaseMarks = (performance?.phaseMarkers || [])
    .map((m) => {
      const x = xScale(m.xNm);
      const y = yScale(m.altFt);
      const isToc = m.label === "TOC";
      const fill = isToc ? "#c4b5fd" : "#f0abfc";
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
        <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" fill="${fill}" font-size="11" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(m.label)}</text>`;
    })
    .join("");

  const yTicks = [];
  const step = maxFt > 8000 ? 2000 : maxFt > 3000 ? 1000 : 500;
  for (let y = 0; y <= maxFt; y += step) yTicks.push(y);
  const yGrid = yTicks
    .map(
      (y) =>
        `<line x1="${padL}" y1="${yScale(y).toFixed(1)}" x2="${padL + plotW}" y2="${yScale(y).toFixed(1)}" stroke="#1e293b"/>
         <text x="${padL - 8}" y="${(yScale(y) + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="11" font-family="ui-sans-serif,system-ui,sans-serif">${y}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="28" fill="#020617"/>
  <text x="40" y="58" fill="#67e8f9" font-size="22" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">Perfil vertical · ${escapeXml(origin)} → ${escapeXml(dest)}</text>
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#020617" stroke="#1e293b"/>
  ${yGrid}
  ${corridorRects.join("")}
  ${terrainPts ? `<polyline fill="none" stroke="#b45309" stroke-width="1.6" points="${terrainPts}"/>` : ""}
  ${planned ? `<polyline fill="none" stroke="#22d3ee" stroke-width="3" points="${planned}"/>` : ""}
  ${wpLabels}
  ${phaseMarks}
  <text x="${padL}" y="${height - 18}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif">0 NM</text>
  <text x="${padL + plotW}" y="${height - 18}" text-anchor="end" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif">${totalNm.toFixed(0)} NM</text>
</svg>`;
}

function buildAirspacesSvg(origin, dest, hits) {
  const rowH = 42;
  const headerH = 90;
  const width = 1180;
  const list = Array.isArray(hits) ? hits : [];
  const height = Math.max(240, headerH + 20 + Math.max(1, list.length) * rowH + 28);
  const rows =
    list.length === 0
      ? `<text x="40" y="${headerH + 30}" fill="#94a3b8" font-size="16" font-family="ui-sans-serif,system-ui,sans-serif">Nenhum espaço aéreo detectado na altitude planejada.</text>`
      : list
          .map((hit, idx) => {
            const y = headerH + 28 + idx * rowH;
            const fill = idx % 2 === 0 ? "#0b1220" : "transparent";
            return `<rect x="28" y="${y - 26}" width="${width - 56}" height="${rowH}" fill="${fill}" rx="8"/>
              <text x="40" y="${y}" fill="#64748b" font-size="13" font-family="ui-monospace,monospace">${idx + 1}</text>
              <text x="80" y="${y}" fill="#a78bfa" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(hit.type || "—")}</text>
              <text x="160" y="${y}" fill="#e2e8f0" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(hit.name || hit.ident || "—")}</text>
              <text x="560" y="${y}" fill="#94a3b8" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(formatLimit(hit.lower))} / ${escapeXml(formatLimit(hit.upper))}</text>
              <text x="780" y="${y}" fill="#67e8f9" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(formatFreq(hit))}</text>
              <text x="1040" y="${y}" fill="#cbd5e1" font-size="13" font-family="ui-sans-serif,system-ui,sans-serif">${hit.entryDistanceNm != null ? `${Number(hit.entryDistanceNm).toFixed(1)} NM` : "—"}</text>`;
          })
          .join("");
  const header = `<text x="80" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">TIPO</text>
    <text x="160" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">NOME</text>
    <text x="560" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">LIMITES</text>
    <text x="780" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">FREQ</text>
    <text x="1040" y="${headerH}" fill="#64748b" font-size="12" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">ENTRADA</text>`;
  return svgCard(width, height, `Espaços aéreos · ${origin} → ${dest}`, `${header}${rows}`);
}

function airportsInMapBbox(airports, bbox, waypoints, limit = 70) {
  const listed = [];
  for (const ad of Array.isArray(airports) ? airports : []) {
    const lat = Number(ad?.lat);
    const lng = Number(ad?.lon ?? ad?.lng);
    const icao = cleanString(ad?.icao).toUpperCase();
    if (!ICAO_RE.test(icao) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) continue;
    listed.push({ icao, lat, lng });
  }
  if (listed.length <= limit) return listed;
  return listed
    .map((ad) => ({
      ad,
      d: Math.min(...waypoints.map((wp) => rea.haversineM(wp, { lat: ad.lat, lng: ad.lng }))),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((row) => row.ad);
}

function buildReaLinesSvg(features, bbox, width, height, scale = 1) {
  const parts = [];
  const stroke = (2.4 * scale).toFixed(1);
  for (const feature of Array.isArray(features) ? features : []) {
    if (!featureInBbox(feature, bbox)) continue;
    if (feature._kind === "reh") continue;
    const props = feature.properties || {};
    const a = rea.endpointA(props);
    const b = rea.endpointB(props);
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
    const [x1, y1] = project(a.lat, a.lon, bbox, width, height);
    const [x2, y2] = project(b.lat, b.lon, bbox, width, height);
    parts.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#a16207" stroke-width="${stroke}" stroke-opacity="0.9" stroke-linecap="round"/>`,
    );
  }
  return parts.join("");
}

function buildAirportsSvg(airports, bbox, width, height, hideIcaos, scale = 1) {
  const skip = new Set((hideIcaos || []).map((code) => String(code || "").toUpperCase()));
  const r = (3.2 * scale).toFixed(1);
  const font = Math.round(10 * scale);
  const dx = (5 * scale).toFixed(1);
  const dy = (5 * scale).toFixed(1);
  const halo = (3 * scale).toFixed(1);
  return airports
    .filter((ad) => !skip.has(ad.icao))
    .map((ad) => {
      const [x, y] = project(ad.lat, ad.lng, bbox, width, height);
      return `<g>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#0f172a" stroke="#f8fafc" stroke-width="${(1.2 * scale).toFixed(1)}"/>
        <text x="${(x + Number(dx)).toFixed(1)}" y="${(y - Number(dy)).toFixed(1)}" fill="#0f172a" stroke="#fff" stroke-width="${halo}" paint-order="stroke" font-size="${font}" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${escapeXml(ad.icao)}</text>
      </g>`;
    })
    .join("");
}

function buildRouteOverlaySvg(waypoints, bbox, width, height, extras = {}) {
  const scale = extras.scale || 1;
  const pts = waypoints.map((wp) => project(wp.lat, wp.lng, bbox, width, height));
  if (pts.length < 2) return null;
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const reaLines = buildReaLinesSvg(extras.reaFeatures, bbox, width, height, scale);
  const airportMarks = buildAirportsSvg(
    extras.airports || [],
    bbox,
    width,
    height,
    [waypoints[0]?.label, waypoints[waypoints.length - 1]?.label],
    scale,
  );
  const font = Math.round(11 * scale);
  const labels = waypoints
    .map((wp, idx) => {
      const [x, y] = pts[idx];
      const label = escapeXml(wp.label || "");
      const isEnd = idx === 0 || idx === waypoints.length - 1;
      if (!isEnd && wp.kind !== "airport") {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(4 * scale).toFixed(1)}" fill="#22d3ee" stroke="#fff" stroke-width="${(1.5 * scale).toFixed(1)}"/>`;
      }
      const boxW = 56 * scale;
      const boxH = 18 * scale;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(7 * scale).toFixed(1)}" fill="${idx === 0 ? "#22c55e" : "#f97316"}" stroke="#fff" stroke-width="${(2 * scale).toFixed(1)}"/>
        <rect x="${(x - boxW / 2).toFixed(1)}" y="${(y - 28 * scale).toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="${(6 * scale).toFixed(1)}" fill="rgb(2 6 23)" fill-opacity="0.82"/>
        <text x="${x.toFixed(1)}" y="${(y - 15 * scale).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="${font}" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700">${label}</text>`;
    })
    .join("");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${reaLines}
  ${airportMarks}
  <polyline fill="none" stroke="rgb(15 23 42)" stroke-width="${(8 * scale).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>
  <polyline fill="none" stroke="rgb(34 211 238)" stroke-width="${(4 * scale).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>
  ${labels}
</svg>`);
}

function wmsQuery(layers, bboxStr, width, height) {
  return new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers,
    styles: "",
    bbox: bboxStr,
    width: String(width),
    height: String(height),
    srs: "EPSG:4326",
    format: "image/png",
    transparent: "true",
  });
}

async function buildRouteMapJpeg(waypoints, sharpFactory, extras = {}) {
  if (!sharpFactory || waypoints.length < 2) return null;
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const scale = MAP_SCALE;
  const raw = routeBbox(waypoints, 0.18);
  if (!raw) return null;
  const bbox = fitBboxToAspect(raw, width, height);
  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  const esriQs = new URLSearchParams({
    bbox: bboxStr,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    format: "png32",
    f: "image",
    dpi: "144",
  });
  const airspaceQs = wmsQuery("ICA:TMA,ICA:CTR,ICA:ATZ", bboxStr, width, height);
  const reaQs = wmsQuery("ICA:CV_REA_BR_COMPLETO", bboxStr, width, height);
  const airports = airportsInMapBbox(extras.airports, bbox, waypoints);
  const [base, airspace, reaOverlay] = await Promise.all([
    fetchImageBuffer(`${ESRI_EXPORT}?${esriQs}`),
    fetchImageBuffer(`${GEOAISWEB}?${airspaceQs}`),
    fetchImageBuffer(`${GEOAISWEB}?${reaQs}`),
  ]);
  const overlaySvg = buildRouteOverlaySvg(waypoints, bbox, width, height, {
    reaFeatures: extras.reaFeatures,
    airports,
    scale,
  });
  const layers = [];
  if (base) layers.push({ input: base, left: 0, top: 0 });
  if (airspace) layers.push({ input: airspace, left: 0, top: 0 });
  if (reaOverlay) layers.push({ input: reaOverlay, left: 0, top: 0 });
  if (overlaySvg) layers.push({ input: overlaySvg, left: 0, top: 0 });
  if (!layers.length) return null;
  return sharpFactory({
    create: { width, height, channels: 3, background: { r: 15, g: 23, b: 42 } },
  })
    .composite(layers)
    .jpeg({
      quality: 92,
      chromaSubsampling: "4:4:4",
      trellisQuantisation: true,
      overshootDeringing: true,
      optimiseScans: true,
    })
    .toBuffer();
}

async function sendImageFromSvg(deps, to, svg, fileName, caption) {
  const png = await deps.renderSvgToPng(svg, { scale: 2 });
  const link = await deps.uploadPngBuffer(png, fileName);
  await deps.sendImage(deps.settings, { to, link, caption: caption || "" });
}

async function handleOpenPendingRoute(deps) {
  const incoming = deps.incoming;
  const nickname = deps.nickname || "";
  const greet = nickname ? `${nickname}, ` : "";
  const phone = incoming.lookupFrom || incoming.from;
  const pending = await loadPendingRoute(deps, phone);
  if (!pending) {
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}não encontrei uma rota recente. Envie *Rota ICAO ICAO* de novo.`,
    });
    return "route_open_missing";
  }
  const userId = cleanString(deps.profile?.user_id);
  if (!userId) {
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}seu WhatsApp não está vinculado a uma conta na plataforma. Peça para a escola associar este telefone ao seu usuário e tente de novo.`,
    });
    return "route_open_unlinked";
  }
  if (typeof deps.createSavedFlightRoute !== "function" || typeof deps.planejamentoUrl !== "function") {
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}não foi possível abrir a rota na plataforma agora.`,
    });
    return "route_open_unavailable";
  }
  let created;
  try {
    created = await deps.createSavedFlightRoute({
      userId,
      name: `${pending.origin} – ${pending.dest}`,
      waypoints: pending.waypoints,
      cruiseSpeedKt: pending.cruiseSpeedKt,
      fuelBurnPerHour: pending.fuelBurnPerHour,
    });
  } catch (err) {
    console.warn(`[wppRoute] create saved route failed ${String(err?.message || err).slice(0, 180)}`);
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}não consegui salvar a rota na sua conta. Tente novamente em instantes.`,
    });
    return "route_open_failed";
  }
  const url = deps.planejamentoUrl(created.id);
  if (typeof deps.sendUrlButton === "function" && url) {
    await deps.sendUrlButton(deps.settings, {
      to: incoming.from,
      body: `${greet}rota *${pending.origin} → ${pending.dest}* salva na sua conta.`,
      url,
      displayText: "Abrir rota",
    });
  } else {
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}rota salva: ${url || created.id}`,
    });
  }
  return "route_opened";
}

async function handleWppRouteCommand(deps, command) {
  const incoming = deps.incoming;
  const nickname = deps.nickname || "";
  const greet = nickname ? `${nickname}, ` : "";

  if (command?.kind === "open") {
    return handleOpenPendingRoute(deps);
  }

  if (!command || command.kind === "help") {
    await deps.sendText(deps.settings, { to: incoming.from, body: formatWppRouteHelpMessage(nickname) });
    return "route_help";
  }

  const origin = command.origin;
  const dest = command.destination;
  if (origin === dest) {
    await deps.sendText(deps.settings, {
      to: incoming.from,
      body: `${greet}informe dois ICAOs diferentes. Ex.: Rota SBJD SBLO`,
    });
    return "same_icao";
  }

  await deps.sendText(deps.settings, {
    to: incoming.from,
    body: `${greet}recebi *Rota ${origin} ${dest}*. Estou montando a rota via REAs…`,
  });

  const [originRotaer, destRotaer] = await Promise.all([
    deps.aisweb.fetchRotaer(origin),
    deps.aisweb.fetchRotaer(dest),
  ]);
  const originWp = airportWaypoint(origin, originRotaer);
  const destWp = airportWaypoint(dest, destRotaer);
  if (!Number.isFinite(originWp.lat) || !Number.isFinite(originWp.lng)) {
    await deps.sendText(deps.settings, { to: incoming.from, body: `Não encontrei coordenadas de *${origin}*.` });
    return "origin_not_found";
  }
  if (!Number.isFinite(destWp.lat) || !Number.isFinite(destWp.lng)) {
    await deps.sendText(deps.settings, { to: incoming.from, body: `Não encontrei coordenadas de *${dest}*.` });
    return "dest_not_found";
  }

  originWp.kind = "origin";
  destWp.kind = "destination";
  const [features, airports] = await Promise.all([
    fetchReaFeatures(deps.appUrl),
    typeof deps.listAerodromes === "function" ? deps.listAerodromes().catch(() => []) : Promise.resolve([]),
  ]);
  let waypoints = [originWp, destWp];
  const snap = rea.snapRouteToVisualCorridors(waypoints, features);
  if (snap.ok) waypoints = snap.waypoints;
  let corridors = rea.matchLegCorridors(waypoints, features);
  waypoints = rea.applyCorridorAltitudes(waypoints, corridors);
  corridors = rea.matchLegCorridors(waypoints, features);
  waypoints = waypoints.map((wp, idx) =>
    idx === 0 || idx === waypoints.length - 1 ? wp : { ...wp, altitudeRef: wp.altitudeRef || "bs" },
  );

  const performance = routePerf.buildRoutePerformanceProfile(waypoints, routePerf.DEFAULT_FLIGHT_PERFORMANCE);
  const legs = rea.buildFlightPlanLegs(waypoints, { cruiseSpeedKt: CRUISE_KT, fuelBurnPerHour: BURN_LPH });
  let airspaces = [];
  try {
    airspaces = await deps.aisweb.queryAirspaceAlongRoute(waypoints);
  } catch (err) {
    console.warn(`[wppRoute] airspace failed ${origin}-${dest} ${String(err?.message || err).slice(0, 180)}`);
  }
  const inTma = originInsideTma(originWp, airspaces);
  const routeText = rea.buildFplRouteText(waypoints, corridors, CRUISE_KT, { originInsideTma: inTma });
  const rmkText = rea.buildFplRmkText(waypoints, corridors);

  let terrain = [];
  try {
    if (typeof deps.fetchRouteElevation === "function") {
      const elev = await deps.fetchRouteElevation({ waypoints, samples: 40 });
      terrain = Array.isArray(elev?.points) ? elev.points : [];
    }
  } catch {
    terrain = [];
  }

  const stamp = `${origin}-${dest}`.toLowerCase();
  try {
    const mapJpeg = await buildRouteMapJpeg(waypoints, deps.getSharp?.(), {
      reaFeatures: features,
      airports,
    });
    if (mapJpeg) {
      const link = await deps.uploadPngBuffer(mapJpeg, `wpp-rota-map-${stamp}.jpg`);
      await deps.sendImage(deps.settings, { to: incoming.from, link, caption: `🗺️ Rota ${origin} → ${dest}` });
    }
  } catch (err) {
    console.warn(`[wppRoute] map image failed ${stamp} ${String(err?.message || err).slice(0, 180)}`);
  }

  try {
    await sendImageFromSvg(
      deps,
      incoming.from,
      buildRouteTableSvg(origin, dest, waypoints, legs, corridors, performance),
      `wpp-rota-table-${stamp}.png`,
      `📋 Tabela · ${origin} → ${dest}`,
    );
  } catch (err) {
    console.warn(`[wppRoute] table image failed ${stamp} ${String(err?.message || err).slice(0, 180)}`);
  }

  try {
    await sendImageFromSvg(
      deps,
      incoming.from,
      buildVerticalProfileSvg(origin, dest, waypoints, legs, corridors, terrain, performance),
      `wpp-rota-profile-${stamp}.png`,
      `📈 Perfil vertical · ${origin} → ${dest}`,
    );
  } catch (err) {
    console.warn(`[wppRoute] profile image failed ${stamp} ${String(err?.message || err).slice(0, 180)}`);
  }

  try {
    await sendImageFromSvg(
      deps,
      incoming.from,
      buildAirspacesSvg(origin, dest, airspaces),
      `wpp-rota-airspace-${stamp}.png`,
      `✈️ Espaços aéreos · ${origin} → ${dest}`,
    );
  } catch (err) {
    console.warn(`[wppRoute] airspace image failed ${stamp} ${String(err?.message || err).slice(0, 180)}`);
  }

  const last = legs[legs.length - 1];
  const names = [...new Set((corridors || []).map((c) => c?.name).filter(Boolean))];
  const toc = performance?.toc;
  const tod = performance?.tod;
  const eteHours = performance?.eteHours ?? last?.cumulativeEteHours;
  const fuelEst = performance?.fuelEstimate ?? last?.cumulativeFuel;
  const summary = [
    `*${origin} → ${dest}*`,
    last?.cumulativeDistanceNm != null ? `Distância: *${last.cumulativeDistanceNm.toFixed(0)} NM*` : null,
    eteHours != null ? `ETE: *${rea.formatEteClock(eteHours)}*` : null,
    fuelEst != null ? `Consumo est.: *${fuelEst.toFixed(0)} L*` : null,
    toc ? `TOC: *${toc.xNm.toFixed(0)} NM* · ${Math.round(toc.altFt)} ft` : null,
    tod ? `TOD: *${tod.xNm.toFixed(0)} NM* · ${Math.round(tod.altFt)} ft` : null,
    names.length
      ? `REAs: ${names.slice(0, 8).map((n) => `*${n}*`).join(", ")}`
      : snap.ok
        ? "Rota via REA."
        : "Sem REA utilizável — rota em DCT.",
    /^DCT\b/.test(routeText) ? "Partida fora da REA — campo Rota começa em DCT até a entrada." : null,
  ]
    .filter(Boolean)
    .join("\n");

  await deps.sendText(deps.settings, { to: incoming.from, body: summary });
  if (routeText) await deps.sendText(deps.settings, { to: incoming.from, body: routeText });
  if (rmkText) await deps.sendText(deps.settings, { to: incoming.from, body: rmkText });

  await storePendingRoute(deps, incoming.lookupFrom || incoming.from, {
    origin,
    dest,
    waypoints: waypoints.map(compactWaypoint).filter(Boolean),
    cruiseSpeedKt: CRUISE_KT,
    fuelBurnPerHour: BURN_LPH,
  }).catch((err) => {
    console.warn(`[wppRoute] pending route store failed ${String(err?.message || err).slice(0, 180)}`);
  });

  if (typeof deps.sendButtons === "function") {
    try {
      await deps.sendButtons(deps.settings, {
        to: incoming.from,
        body: "Próximos passos:",
        buttons: [
          { id: `metar_${origin}`, title: `Metar ${origin}` },
          { id: `metar_${dest}`, title: `Metar ${dest}` },
          { id: "wpp_open_route", title: "Ver na plataforma" },
        ],
      });
    } catch (err) {
      console.warn(`[wppRoute] CTA buttons failed ${String(err?.message || err).slice(0, 180)}`);
    }
  }

  return snap.ok ? "route_sent" : "route_sent_dct";
}

module.exports = {
  parseWppRouteCommand,
  formatWppRouteHelpMessage,
  handleWppRouteCommand,
};
