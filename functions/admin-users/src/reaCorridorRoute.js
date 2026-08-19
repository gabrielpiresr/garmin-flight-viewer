"use strict";

const NM_IN_M = 1852;
const EARTH_RADIUS_M = 6_371_008.8;
const MERGE_M = 400;
const NEAR_WP_M = 1852 * 0.4;
const PROGRESS_M = 1852 * 0.8;
const MAX_RIDES = 12;
const ENTRY_SNAPS_PER_COMP = 10;
const GATE_ENTRY_NM = 15;
const GATE_HEADING_DEG = 25;
const LOCAL_TMA_NEAR_NM = 40;

function isRehFeature(feature) {
  if (!feature) return false;
  if (feature._kind === "reh") return true;
  if (feature._kind === "rea") return false;
  return /CV_REH/i.test(String(feature.id || ""));
}

function airplaneVisualFeatures(features) {
  const list = Array.isArray(features) ? features : [];
  const rea = list.filter((feature) => !isRehFeature(feature));
  return rea.length ? rea : list;
}

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function endpointA(props) {
  return {
    lat: numOrNull(props.fixo_a_lat ?? props.ponto_a_lat),
    lon: numOrNull(props.fixo_a_lon ?? props.ponto_a_lon),
    name: String(props.fixo_a_nome ?? props.ponto_a_nome ?? "").trim(),
  };
}

function endpointB(props) {
  return {
    lat: numOrNull(props.fixo_b_lat ?? props.ponto_b_lat),
    lon: numOrNull(props.fixo_b_lon ?? props.ponto_b_lon),
    name: String(props.fixo_b_nome ?? props.ponto_b_nome ?? "").trim(),
  };
}

function resolveReaAltitudes(props) {
  const max =
    numOrNull(props.altmax) ??
    numOrNull(props.altmaxa_to_b) ??
    numOrNull(props.altmaxb_to_a) ??
    numOrNull(props.altcompa_to_b) ??
    numOrNull(props.altcomp);
  const min =
    numOrNull(props.altmin) ??
    numOrNull(props.altmina_to_b) ??
    numOrNull(props.altminb_to_a) ??
    numOrNull(props.altcompb_to_a) ??
    (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
  return { max, min };
}

function resolveReaAltitudesDirected(props, dir) {
  if (dir === "ab") {
    const max =
      numOrNull(props.altmaxa_to_b) ??
      numOrNull(props.altcompa_to_b) ??
      numOrNull(props.altmax) ??
      numOrNull(props.altcomp);
    const min =
      numOrNull(props.altmina_to_b) ??
      numOrNull(props.altmin) ??
      (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
    return { max, min };
  }
  const max =
    numOrNull(props.altmaxb_to_a) ??
    numOrNull(props.altcompb_to_a) ??
    numOrNull(props.altmax) ??
    numOrNull(props.altcomp);
  const min =
    numOrNull(props.altminb_to_a) ??
    numOrNull(props.altmin) ??
    (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
  return { max, min };
}

function reaCorridorDirections(props) {
  const ab = numOrNull(props.rumoa_to_b);
  const ba = numOrNull(props.rumob_to_a);
  if (ab == null && ba == null) return { ab: true, ba: true };
  return { ab: ab != null, ba: ba != null };
}

function corridorDisplayName(nome) {
  return String(nome || "")
    .trim()
    .toUpperCase();
}

function pointKey(lat, lon, name) {
  return `${String(name || "").trim().toUpperCase()}|${Number(lat).toFixed(4)}|${Number(lon).toFixed(4)}`;
}

function haversineM(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatCompactAviationCoord(lat, lng) {
  const latH = lat >= 0 ? "N" : "S";
  const lngH = lng >= 0 ? "E" : "W";
  const absLat = Math.abs(lat);
  const absLng = Math.abs(lng);
  const latDeg = Math.floor(absLat);
  const latMin = Math.round((absLat - latDeg) * 60);
  const lngDeg = Math.floor(absLng);
  const lngMin = Math.round((absLng - lngDeg) * 60);
  return `${String(latDeg).padStart(2, "0")}${String(latMin).padStart(2, "0")}${latH}${String(lngDeg).padStart(3, "0")}${String(lngMin).padStart(2, "0")}${lngH}`;
}

function calcTrueBearing(a, b) {
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const dlambda = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatBearingDeg(deg) {
  if (!Number.isFinite(deg)) return "—";
  return `${String(Math.round(deg) % 360).padStart(3, "0")}°`;
}

function formatEteClock(hours) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildFlightPlanLegs(waypoints, options = {}) {
  const cruise = options.cruiseSpeedKt;
  const burn = options.fuelBurnPerHour;
  const hasCruise = cruise != null && Number.isFinite(cruise) && cruise > 0;
  const hasBurn = burn != null && Number.isFinite(burn) && burn > 0;
  const legs = [];
  let cumNm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const distanceNm = haversineM(from, to) / NM_IN_M;
    cumNm += distanceNm;
    const eteHours = hasCruise ? distanceNm / cruise : null;
    const fuelEstimate = eteHours != null && hasBurn ? eteHours * burn : null;
    const cumulativeEteHours = hasCruise ? cumNm / cruise : null;
    const cumulativeFuel = cumulativeEteHours != null && hasBurn ? cumulativeEteHours * burn : null;
    legs.push({
      from,
      to,
      toIndex: i,
      distanceNm,
      bearingDeg: calcTrueBearing(from, to),
      eteHours,
      fuelEstimate,
      cumulativeDistanceNm: cumNm,
      cumulativeEteHours,
      cumulativeFuel,
    });
  }
  return legs;
}

function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContains(feature, lat, lng) {
  const g = feature?.geometry;
  if (!g?.coordinates) return false;
  if (g.type === "Polygon") {
    const ring = g.coordinates[0];
    return ring ? pointInRing(lat, lng, ring) : false;
  }
  if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) {
      const ring = poly[0];
      if (ring && pointInRing(lat, lng, ring)) return true;
    }
  }
  return false;
}

function geometryContainsLatLng(geometry, lat, lng) {
  if (!geometry?.coordinates) return false;
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    return ring ? pointInRing(lat, lng, ring) : false;
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const ring = poly[0];
      if (ring && pointInRing(lat, lng, ring)) return true;
    }
  }
  return false;
}

function normName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function samplesInsideCount(feature, from, to) {
  const ts = [0.2, 0.35, 0.5, 0.65, 0.8];
  let inside = 0;
  for (const t of ts) {
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    if (geometryContains(feature, lat, lng)) inside += 1;
  }
  return inside;
}

function matchReaCorridorForLeg(from, to, features) {
  if (!features.length) return null;
  const fromNames = new Set([normName(from.reaName), normName(from.label)].filter(Boolean));
  const toNames = new Set([normName(to.reaName), normName(to.label)].filter(Boolean));
  let best = null;

  for (const feature of features) {
    const props = feature.properties || {};
    const name = corridorDisplayName(props.nome);
    if (!name) continue;
    const a = endpointA(props);
    const b = endpointB(props);
    const aName = normName(a.name);
    const bName = normName(b.name);
    const bothEnds =
      Boolean(aName && bName) &&
      ((fromNames.has(aName) && toNames.has(bName)) || (fromNames.has(bName) && toNames.has(aName)));
    const insideCount = samplesInsideCount(feature, from, to);
    const mostlyInside = insideCount >= 3;
    if (!bothEnds && !mostlyInside) continue;

    let score = 0;
    if (bothEnds) score += 100;
    score += insideCount * 10;
    if (fromNames.has(normName(name)) || toNames.has(normName(name))) score += 5;
    const aToB = Boolean(aName && fromNames.has(aName) && toNames.has(bName));
    const { max, min } = bothEnds ? resolveReaAltitudesDirected(props, aToB ? "ab" : "ba") : resolveReaAltitudes(props);
    const aPt = a.lat != null && a.lon != null ? { lat: a.lat, lng: a.lon } : null;
    const bPt = b.lat != null && b.lon != null ? { lat: b.lat, lng: b.lon } : null;
    const info = {
      name,
      altMax: max,
      altMin: min,
      geometry: feature.geometry,
      endpointA: aPt,
      endpointB: bPt,
      halfWidthM: Math.max(600, numOrNull(props.semi_largura) ?? 1400),
    };
    if (!best || score > best.score) best = { score, info };
  }
  return best?.info ?? null;
}

function nodeId(name, lat, lng) {
  return pointKey(lat, lng, name);
}

function isPortaoName(name) {
  return /^PORT[AÃ]O\b/i.test(String(name || "").trim());
}

function isObrigFeature(tipo) {
  return !/^recom/i.test(String(tipo || "").trim());
}

function fallbackName(name, lat, lng) {
  const trimmed = String(name || "").trim();
  if (trimmed) return trimmed;
  return `REA ${lat.toFixed(3)}/${lng.toFixed(3)}`;
}

function findMergeNode(nodes, lat, lng) {
  let best = null;
  let bestDist = MERGE_M;
  for (const node of nodes) {
    const d = haversineM({ lat, lng }, node);
    if (d < bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}

function edgeBeats(next, current) {
  if (next.obrig !== current.obrig) return next.obrig;
  return next.meters < current.meters;
}

function pushEdge(adj, fromId, edge) {
  const list = adj.get(fromId) || [];
  const idx = list.findIndex((item) => item.to === edge.to && item.name === edge.name);
  if (idx >= 0) {
    if (edgeBeats(edge, list[idx])) list[idx] = edge;
  } else {
    list.push(edge);
  }
  adj.set(fromId, list);
}

function projectOnSegment(p, a, b) {
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const mx = Math.cos(lat0) * 111_320;
  const my = 110_540;
  const bx = (b.lng - a.lng) * mx;
  const by = (b.lat - a.lat) * my;
  const px = (p.lng - a.lng) * mx;
  const py = (p.lat - a.lat) * my;
  const ab2 = bx * bx + by * by;
  const t = ab2 < 1 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / ab2));
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  return { lat, lng, t, distM: haversineM(p, { lat, lng }) };
}

function bearingDeg(from, to) {
  const toR = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toR(to.lng - from.lng)) * Math.cos(toR(to.lat));
  const x =
    Math.cos(toR(from.lat)) * Math.sin(toR(to.lat)) -
    Math.sin(toR(from.lat)) * Math.cos(toR(to.lat)) * Math.cos(toR(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function headingDiffDeg(a, b) {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

function cloneAdj(adj) {
  const next = new Map();
  for (const [id, edges] of adj) next.set(id, edges.slice());
  return next;
}

function buildGraph(features) {
  const nodeList = [];
  const nodes = new Map();
  const adj = new Map();
  const segs = [];
  const parent = new Map();

  const find = (id) => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const up = parent.get(cur);
      if (!up) break;
      parent.set(cur, parent.get(up) ?? up);
      cur = parent.get(cur) ?? cur;
    }
    return cur;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const addNode = (name, lat, lng) => {
    const existing = findMergeNode(nodeList, lat, lng);
    if (existing) return existing;
    const node = { id: nodeId(name, lat, lng), lat, lng, name: name.trim().toUpperCase(), gate: false };
    nodeList.push(node);
    nodes.set(node.id, node);
    if (!adj.has(node.id)) adj.set(node.id, []);
    if (!parent.has(node.id)) parent.set(node.id, node.id);
    return node;
  };

  const addDirected = (from, to, meta) => {
    const meters = haversineM(from, to);
    if (!(meters > 0)) return;
    pushEdge(adj, from.id, { ...meta, to: to.id, meters });
  };

  for (const feature of features) {
    const props = feature.properties || {};
    const a = endpointA(props);
    const b = endpointB(props);
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
    const aName = fallbackName(a.name, a.lat, a.lon);
    const bName = fallbackName(b.name, b.lat, b.lon);
    const from = addNode(aName, a.lat, a.lon);
    const to = addNode(bName, b.lat, b.lon);
    const dirs = reaCorridorDirections(props);
    const name = corridorDisplayName(props.nome) || `${from.name}–${to.name}`;
    const oneWay = dirs.ab !== dirs.ba;
    const obrig = isObrigFeature(props.tipo);
    const altAb = resolveReaAltitudesDirected(props, "ab").max;
    const altBa = resolveReaAltitudesDirected(props, "ba").max;
    if (dirs.ab) addDirected(from, to, { name, oneWay, obrig, altMax: altAb });
    if (dirs.ba) addDirected(to, from, { name, oneWay, obrig, altMax: altBa });
    union(from.id, to.id);
    segs.push({
      a: from,
      b: to,
      name,
      dirs,
      oneWay,
      obrig,
      altAb,
      altBa,
      componentId: "",
      carta: String(props.carta_nome || "").trim().toUpperCase(),
    });
  }

  for (const seg of segs) {
    seg.componentId = find(seg.a.id);
  }

  const undirected = new Map();
  const touch = (from, to) => {
    const set = undirected.get(from) || new Set();
    set.add(to);
    undirected.set(from, set);
  };
  for (const seg of segs) {
    touch(seg.a.id, seg.b.id);
    touch(seg.b.id, seg.a.id);
  }
  for (const node of nodes.values()) {
    const degree = undirected.get(node.id)?.size ?? 0;
    node.gate = degree <= 1 || isPortaoName(node.name);
  }

  return { nodes, adj, segs };
}

function attachSnap(baseAdj, baseNodes, seg, snap) {
  const nearA = snap.t <= 0.04 || haversineM(snap, seg.a) < NEAR_WP_M;
  const nearB = snap.t >= 0.96 || haversineM(snap, seg.b) < NEAR_WP_M;
  if (nearA && !nearB) return { adj: baseAdj, nodes: baseNodes, startId: seg.a.id };
  if (nearB && !nearA) return { adj: baseAdj, nodes: baseNodes, startId: seg.b.id };
  if (nearA && nearB) {
    return {
      adj: baseAdj,
      nodes: baseNodes,
      startId: haversineM(snap, seg.a) <= haversineM(snap, seg.b) ? seg.a.id : seg.b.id,
    };
  }

  const adj = cloneAdj(baseAdj);
  const nodes = new Map(baseNodes);
  const id = `SNAP|${snap.lat.toFixed(5)}|${snap.lng.toFixed(5)}`;
  const node = { id, lat: snap.lat, lng: snap.lng, name: (seg.name || "REA").toUpperCase(), gate: false };
  nodes.set(id, node);
  if (!adj.has(id)) adj.set(id, []);

  const metersAB = haversineM(seg.a, seg.b);
  const metersAS = Math.max(1, metersAB * snap.t);
  const metersSB = Math.max(1, metersAB * (1 - snap.t));
  if (seg.dirs.ab) {
    pushEdge(adj, seg.a.id, { to: id, meters: metersAS, name: seg.name, oneWay: seg.oneWay, obrig: seg.obrig, altMax: seg.altAb });
    pushEdge(adj, id, { to: seg.b.id, meters: metersSB, name: seg.name, oneWay: seg.oneWay, obrig: seg.obrig, altMax: seg.altAb });
  }
  if (seg.dirs.ba) {
    pushEdge(adj, seg.b.id, { to: id, meters: metersSB, name: seg.name, oneWay: seg.oneWay, obrig: seg.obrig, altMax: seg.altBa });
    pushEdge(adj, id, { to: seg.a.id, meters: metersAS, name: seg.name, oneWay: seg.oneWay, obrig: seg.obrig, altMax: seg.altBa });
  }
  return { adj, nodes, startId: id };
}

function rideTotalCost(ride) {
  return ride.entryDistM + ride.pathMeters + ride.exitDistToDestM;
}

function rideScore(ride) {
  return 2 * ride.entryDistM + ride.pathMeters + 3 * ride.exitDistToDestM;
}

function nearestDistToSegs(point, segs) {
  let best = Infinity;
  for (const seg of segs) {
    const d = projectOnSegment(point, seg.a, seg.b).distM;
    if (d < best) best = d;
  }
  return best;
}

function anchoredToLocalTma(point, segs) {
  return nearestDistToSegs(point, segs) <= LOCAL_TMA_NEAR_NM * NM_IN_M;
}

function pathMetersFromWalk(nodes, walk) {
  let meters = 0;
  for (let i = 1; i < walk.length; i++) {
    const from = nodes.get(walk[i - 1].nodeId);
    const to = nodes.get(walk[i].nodeId);
    if (from && to) meters += haversineM(from, to);
  }
  return meters;
}

function closestSnaps(pos, segs, limit) {
  const snaps = segs
    .map((seg) => {
      const proj = projectOnSegment(pos, seg.a, seg.b);
      return { seg, ...proj };
    })
    .sort((a, b) => a.distM - b.distM || Number(b.seg.obrig) - Number(a.seg.obrig));
  const out = [];
  const seen = new Set();
  for (const snap of snaps) {
    const key = `${snap.seg.componentId}|${snap.lat.toFixed(4)}|${snap.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snap);
    if (out.length >= limit) break;
  }
  return out;
}

function namedPoint(node, edge, outgoing) {
  const altMax = edge?.altMax ?? outgoing?.altMax ?? null;
  return {
    lat: node.lat,
    lng: node.lng,
    name: node.name,
    kind: node.id.startsWith("SNAP|") ? "fix" : "rea",
    altMax,
    oneWay: Boolean(edge?.oneWay),
    corridorName: edge?.name ?? outgoing?.name ?? null,
  };
}

function pointsFromWalk(nodes, walk) {
  const points = [];
  for (let i = 0; i < walk.length; i++) {
    const node = nodes.get(walk[i].nodeId);
    if (!node) continue;
    points.push(namedPoint(node, walk[i].edge, walk[i + 1]?.edge ?? null));
  }
  return points;
}

function dijkstra(adj, start) {
  const dist = new Map();
  const prev = new Map();
  const used = new Set();
  dist.set(start, 0);
  while (true) {
    let bestId = null;
    let bestDist = Infinity;
    for (const [id, d] of dist) {
      if (used.has(id) || d >= bestDist) continue;
      bestId = id;
      bestDist = d;
    }
    if (bestId == null || bestDist === Infinity) break;
    used.add(bestId);
    for (const edge of adj.get(bestId) || []) {
      const next = bestDist + edge.meters;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, { from: bestId, edge });
      }
    }
  }
  return { prev, dist };
}

function reconstructNodes(prev, start, end) {
  const path = [];
  let cur = end;
  const seen = new Set();
  while (cur && cur !== start) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const step = prev.get(cur);
    if (!step) return null;
    path.push({ nodeId: cur, edge: step.edge });
    cur = step.from;
  }
  if (cur !== start) return null;
  path.push({ nodeId: start, edge: null });
  path.reverse();
  return path;
}

function greedyWalkTowardDest(adj, nodes, startId, dest) {
  const walk = [{ nodeId: startId, edge: null }];
  const seen = new Set([startId]);
  let cur = startId;
  while (true) {
    const curNode = nodes.get(cur);
    if (!curNode) break;
    const curDist = haversineM(curNode, dest);
    let best = null;
    for (const edge of adj.get(cur) || []) {
      if (seen.has(edge.to)) continue;
      const next = nodes.get(edge.to);
      if (!next) continue;
      const dist = haversineM(next, dest);
      if (dist >= curDist - 1) continue;
      if (!best || dist < best.dist) best = { edge, dist };
    }
    if (!best) break;
    cur = best.edge.to;
    seen.add(cur);
    walk.push({ nodeId: cur, edge: best.edge });
    const arrived = nodes.get(cur);
    if (arrived && arrived.gate && !arrived.id.startsWith("SNAP|") && walk.length > 1) break;
  }
  return walk.length >= 2 ? walk : null;
}

function walkToCheapestExit(adj, nodes, startId, dest) {
  const start = nodes.get(startId);
  if (!start) return null;
  const { prev, dist } = dijkstra(adj, startId);
  const startDist = haversineM(start, dest);
  let best = null;
  for (const [id, graphDist] of dist) {
    if (id === startId) continue;
    const node = nodes.get(id);
    if (!node || node.id.startsWith("SNAP|")) continue;
    const destDist = haversineM(node, dest);
    if (startDist - destDist < PROGRESS_M) continue;
    const total = graphDist + 2 * destDist;
    if (!best || total < best.total - 50 || (Math.abs(total - best.total) <= 50 && destDist < best.destDist)) {
      best = { id, total, destDist };
    }
  }
  if (!best) return greedyWalkTowardDest(adj, nodes, startId, dest);
  return reconstructNodes(prev, startId, best.id);
}

function rideFromStart(adj, nodes, startId, dest, entryDistM, componentId) {
  const walk = walkToCheapestExit(adj, nodes, startId, dest);
  if (!walk) return null;
  const points = pointsFromWalk(nodes, walk);
  if (!points.length) return null;
  const exit = points[points.length - 1];
  return {
    componentId,
    entryDistM,
    exitDistToDestM: haversineM(exit, dest),
    pathMeters: pathMetersFromWalk(nodes, walk),
    points,
  };
}

function componentNodes(segs, nodes) {
  const ids = new Set();
  for (const seg of segs) {
    ids.add(seg.a.id);
    ids.add(seg.b.id);
  }
  return [...ids].map((id) => nodes.get(id)).filter(Boolean);
}

function bestRideForComponent(pos, dest, componentSegs, adj, nodes, options) {
  const destNow = haversineM(pos, dest);
  const destBrng = bearingDeg(pos, dest);
  const snaps = closestSnaps(pos, componentSegs, ENTRY_SNAPS_PER_COMP);
  const nearestSnap = snaps[0];
  const far = !nearestSnap || nearestSnap.distM > GATE_ENTRY_NM * NM_IN_M;
  const gates = componentNodes(componentSegs, nodes)
    .filter((node) => node.gate)
    .map((node) => ({
      node,
      distM: haversineM(pos, node),
      heading: headingDiffDeg(destBrng, bearingDeg(pos, node)),
    }))
    .sort((a, b) => a.distM - b.distM);

  const alignedGates = gates.filter(
    (gate) => gate.heading <= GATE_HEADING_DEG && haversineM(gate.node, dest) < destNow - PROGRESS_M,
  );
  const usefulGates = gates.filter((gate) => haversineM(gate.node, dest) < destNow - PROGRESS_M);

  const candidates = [];
  const gateList = far ? usefulGates.slice(0, 16) : [...alignedGates.slice(0, 4), ...usefulGates.slice(0, 4)];
  if (far) {
    for (const snap of snaps) {
      if (headingDiffDeg(destBrng, bearingDeg(pos, snap)) > 90) continue;
      const attached = attachSnap(adj, nodes, snap.seg, snap);
      candidates.push({ adj: attached.adj, nodes: attached.nodes, startId: attached.startId, distM: snap.distM });
    }
    for (const gate of gateList) {
      candidates.push({ adj, nodes, startId: gate.node.id, distM: gate.distM });
    }
  } else {
    for (const snap of snaps) {
      const attached = attachSnap(adj, nodes, snap.seg, snap);
      candidates.push({ adj: attached.adj, nodes: attached.nodes, startId: attached.startId, distM: snap.distM });
    }
    for (const gate of gateList) {
      candidates.push({ adj, nodes, startId: gate.node.id, distM: gate.distM });
    }
  }

  let best = null;
  const componentId = componentSegs[0]?.componentId || "";
  const skipProgress = Boolean(options && options.skipProgress);
  for (const candidate of candidates) {
    const ride = rideFromStart(candidate.adj, candidate.nodes, candidate.startId, dest, candidate.distM, componentId);
    if (!ride) continue;
    if (!skipProgress && destNow - ride.exitDistToDestM < PROGRESS_M) continue;
    if (
      !best ||
      rideScore(ride) < rideScore(best) - 50 ||
      (Math.abs(rideScore(ride) - rideScore(best)) <= 50 && rideTotalCost(ride) < rideTotalCost(best))
    ) {
      best = ride;
    }
  }
  return best;
}

function appendRidePoints(next, dest, points, stats, lastAlt) {
  for (const point of points) {
    if (point.oneWay) stats.oneWayLegs += 1;
    if (point.corridorName) stats.corridorNames.push(point.corridorName);
    const last = next[next.length - 1];
    if (haversineM(last, point) < NEAR_WP_M) {
      if (point.altMax != null) lastAlt.value = point.altMax;
      continue;
    }
    if (haversineM(dest, point) < NEAR_WP_M) {
      if (point.altMax != null) lastAlt.value = point.altMax;
      continue;
    }
    const altMax = point.altMax ?? lastAlt.value;
    next.push({
      raw: point.name,
      lat: point.lat,
      lng: point.lng,
      label: point.name,
      kind: point.kind,
      ...(point.kind === "rea" ? { reaName: point.name } : {}),
      altitudeFt: altMax != null && Number.isFinite(altMax) ? Math.round(altMax) : null,
      altitudeRef: "bs",
    });
    if (altMax != null) lastAlt.value = altMax;
  }
}

function snapCorridorPair(origin, dest, nodes, adj, segs, byComponent) {
  const used = new Set();
  const next = [{ ...origin }];
  const stats = { oneWayLegs: 0, corridorNames: [] };
  const lastAlt = { value: origin.altitudeFt ?? origin.fieldElevFt ?? null };
  let pos = origin;
  let rides = 0;
  let dctLegs = 0;

  while (rides < MAX_RIDES) {
    const destNow = haversineM(pos, dest);
    if (destNow < NEAR_WP_M * 2) break;
    const ridesFound = [];
    const mandatory = [];
    for (const [componentId, componentSegs] of byComponent) {
      if (used.has(componentId)) continue;
      const destTma = anchoredToLocalTma(dest, componentSegs);
      const originTma = anchoredToLocalTma(pos, componentSegs);
      const localTma = destTma || originTma;
      if (!localTma) continue;
      const ride = bestRideForComponent(pos, dest, componentSegs, adj, nodes, {
        skipProgress: destTma && rides > 0,
      });
      if (!ride) continue;
      if (rides > 0 && !localTma && rideTotalCost(ride) >= destNow - PROGRESS_M) continue;
      ridesFound.push(ride);
      if (localTma) mandatory.push(ride);
    }
    const nearby = ridesFound.filter((ride) => ride.entryDistM <= GATE_ENTRY_NM * NM_IN_M);
    const pool = mandatory.length && rides > 0 ? mandatory : nearby.length ? nearby : ridesFound;
    let chosen = null;
    for (const ride of pool) {
      if (
        !chosen ||
        rideTotalCost(ride) < rideTotalCost(chosen) - 50 ||
        (Math.abs(rideTotalCost(ride) - rideTotalCost(chosen)) <= 50 && ride.entryDistM < chosen.entryDistM)
      ) {
        chosen = ride;
      }
    }
    if (!chosen) break;
    const first = chosen.points[0];
    if (haversineM(pos, first) > NEAR_WP_M * 2) dctLegs += 1;
    appendRidePoints(next, dest, chosen.points, stats, lastAlt);
    used.add(chosen.componentId);
    const exit = chosen.points[chosen.points.length - 1];
    pos = exit;
    rides += 1;
  }

  if (rides === 0) {
    return { ok: false, error: "Não há corredor visual utilizável entre origem e destino." };
  }

  if (haversineM(pos, dest) > NEAR_WP_M) dctLegs += 1;
  next.push({
    ...dest,
    altitudeFt:
      dest.altitudeFt != null && Number.isFinite(dest.altitudeFt) ? dest.altitudeFt : dest.fieldElevFt ?? lastAlt.value,
  });

  let distanceM = 0;
  for (let i = 1; i < next.length; i++) distanceM += haversineM(next[i - 1], next[i]);

  return {
    ok: true,
    waypoints: next,
    inserted: Math.max(0, next.length - 2),
    distanceNm: distanceM / NM_IN_M,
    oneWayLegs: stats.oneWayLegs,
    dctLegs,
    corridorNames: [...new Set(stats.corridorNames)],
  };
}

function relabelSnappedRoute(waypoints) {
  return waypoints.map((wp, idx, arr) => {
    let kind = wp.kind;
    if (idx === 0) kind = "origin";
    else if (idx === arr.length - 1) kind = "destination";
    else if (wp.kind === "origin" || wp.kind === "destination") kind = "airport";
    const isAd = kind === "airport" || kind === "destination";
    return {
      ...wp,
      kind,
      ...(idx > 0 && isAd ? { altitudeRef: "be" } : {}),
    };
  });
}

function snapRouteToVisualCorridors(waypoints, features) {
  if (waypoints.length < 2) {
    return { ok: false, error: "Coloque origem e destino antes de ajustar nos corredores." };
  }
  const visual = airplaneVisualFeatures(features);
  if (!visual.length) {
    return { ok: false, error: "Corredores visuais ainda não carregaram." };
  }

  const { nodes, adj, segs } = buildGraph(visual);
  if (!segs.length) {
    return { ok: false, error: "Não há corredores visuais carregados para ajustar a rota." };
  }

  const byComponent = new Map();
  for (const seg of segs) {
    const list = byComponent.get(seg.componentId) || [];
    list.push(seg);
    byComponent.set(seg.componentId, list);
  }

  const combined = [];
  const stats = { oneWayLegs: 0, corridorNames: [], dctLegs: 0 };
  let anyRide = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const piece = snapCorridorPair(from, to, nodes, adj, segs, byComponent);
    if (piece.ok) {
      anyRide = true;
      stats.oneWayLegs += piece.oneWayLegs;
      stats.dctLegs += piece.dctLegs;
      stats.corridorNames.push(...piece.corridorNames);
      if (!combined.length) combined.push(...piece.waypoints);
      else combined.push(...piece.waypoints.slice(1));
      continue;
    }
    if (!combined.length) combined.push({ ...from });
    if (haversineM(combined[combined.length - 1], to) > NEAR_WP_M) {
      combined.push({ ...to });
      stats.dctLegs += 1;
    }
  }

  if (!anyRide) {
    return { ok: false, error: "Não há corredor visual utilizável entre origem e destino." };
  }

  const next = relabelSnappedRoute(combined);
  let distanceM = 0;
  for (let i = 1; i < next.length; i++) distanceM += haversineM(next[i - 1], next[i]);

  return {
    ok: true,
    waypoints: next,
    inserted: Math.max(0, next.length - waypoints.length),
    distanceNm: distanceM / NM_IN_M,
    oneWayLegs: stats.oneWayLegs,
    dctLegs: stats.dctLegs,
    corridorNames: [...new Set(stats.corridorNames)],
  };
}

function applyCorridorAltitudes(waypoints, legCorridors) {
  return waypoints.map((wp, idx) => {
    if (idx === 0) return wp;
    const corridor = legCorridors[idx];
    if (corridor?.altMax == null || !Number.isFinite(corridor.altMax)) return wp;
    const max = Math.round(corridor.altMax);
    const cur = wp.altitudeFt;
    const field = wp.fieldElevFt;
    if (cur == null || !Number.isFinite(cur) || (field != null && cur === Math.round(field)) || cur === max) {
      return { ...wp, altitudeFt: max };
    }
    return wp;
  });
}

function matchLegCorridors(waypoints, features) {
  const visual = airplaneVisualFeatures(features);
  const out = [null];
  for (let i = 1; i < waypoints.length; i++) {
    out.push(matchReaCorridorForLeg(waypoints[i - 1], waypoints[i], visual));
  }
  return out;
}

function isAirportLike(wp) {
  return wp.kind === "airport" || wp.kind === "origin" || wp.kind === "destination";
}

function normalizeFplText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function formatFplSpeed(speedKt) {
  const speed = speedKt != null && Number.isFinite(speedKt) && speedKt > 0 ? speedKt : 90;
  return `N${String(Math.max(1, Math.round(speed))).padStart(4, "0")}`;
}

function formatFplLevel(altitudeFt) {
  if (altitudeFt != null && Number.isFinite(altitudeFt) && altitudeFt > 0) {
    return `A${String(Math.round(altitudeFt / 100)).padStart(3, "0")}`;
  }
  return "VFR";
}

function formatFplPointSpeedLevel(wp, speedKt, levelFt) {
  const level = levelFt === undefined ? wp.altitudeFt : levelFt;
  return `${formatCompactAviationCoord(wp.lat, wp.lng)}/${formatFplSpeed(speedKt)}${formatFplLevel(level)}`;
}

function levelFlownFrom(waypoints, legIdx, nextInside) {
  if (nextInside === true) return null;
  const to = waypoints[legIdx];
  const next = waypoints[legIdx + 1];
  if (isAirportLike(to) && next && !isAirportLike(next) && next.altitudeFt != null && Number.isFinite(next.altitudeFt)) {
    return next.altitudeFt;
  }
  return to.altitudeFt;
}

function waypointIcaoCode(wp) {
  for (const value of [wp.label, wp.raw]) {
    const code = normalizeFplText(value);
    if (/^[A-Z0-9]{4}$/.test(code)) return code;
  }
  return null;
}

function pushFplToken(tokens, token) {
  const clean = String(token || "")
    .trim()
    .toUpperCase();
  if (!clean) return;
  if (tokens[tokens.length - 1] === clean) return;
  tokens.push(clean);
}

const LOCAL_REA_JOIN_M = NM_IN_M * 15;

const REA_TMA_BY_CODE = {
  PI: "PARINTINS",
  WA: "TABATINGA",
  WB: "BELEM",
  WF: "RECIFE",
  WG: "CAMPO GRANDE",
  WJ: "RIO DE JANEIRO",
  WK: "PORTO SEGURO",
  WN: "MANAUS",
  WP: "PORTO ALEGRE",
  WR: "BRASILIA",
  WS: "SAO LUIS",
  WX: "SANTAREM",
  WY: "CUIABA",
  WZ: "FORTALEZA",
  XF: "FLORIANOPOLIS",
  XK: "MACAPA",
  XN: "ANAPOLIS",
  XO: "LONDRINA",
  XP: "SAO PAULO",
  XQ: "RIBEIRAO PRETO",
  XR: "VITORIA",
  XS: "SALVADOR",
  XT: "NATAL",
  WH: "BELO HORIZONTE",
  WT: "CURITIBA",
};

function normalizeTmaText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

function reaTmaCodeFromIdentName(ident, name) {
  const identNorm = normalizeTmaText(ident).replace(/\s+/g, "");
  const identMatch = identNorm.match(/^SB([WX][A-Z])(?:_|$|[0-9])/);
  if (identMatch && REA_TMA_BY_CODE[identMatch[1]]) return identMatch[1];
  const nameNorm = normalizeTmaText(name);
  if (!nameNorm) return null;
  for (const [code, city] of Object.entries(REA_TMA_BY_CODE)) {
    if (nameNorm === city || nameNorm.includes(city)) return code;
  }
  return null;
}

function isLocalReaJoin(from, dest) {
  if (formatCompactAviationCoord(from.lat, from.lng) === formatCompactAviationCoord(dest.lat, dest.lng)) {
    return true;
  }
  return haversineM(from, dest) < LOCAL_REA_JOIN_M;
}

function originReaTmaId(origin, airspaces) {
  if (!origin) return null;
  for (const hit of airspaces || []) {
    if (String(hit?.type || "").toUpperCase() !== "TMA") continue;
    const code = reaTmaCodeFromIdentName(hit.ident, hit.name);
    if (!code) continue;
    if (hit.entryDistanceNm != null && Number.isFinite(hit.entryDistanceNm) && hit.entryDistanceNm < 3) {
      return code;
    }
  }
  return null;
}

function destReaTmaId(dest, airspaces, totalNm) {
  if (!dest) return null;
  for (const hit of airspaces || []) {
    if (String(hit?.type || "").toUpperCase() !== "TMA") continue;
    const code = reaTmaCodeFromIdentName(hit.ident, hit.name);
    if (!code) continue;
    if (totalNm != null && Number.isFinite(totalNm)) {
      if (hit.exitDistanceNm != null && Number.isFinite(hit.exitDistanceNm) && totalNm - hit.exitDistanceNm < 3) {
        return code;
      }
      const occ = Array.isArray(hit.occupancyNm) ? hit.occupancyNm : [];
      if (occ.some((seg) => seg && Number.isFinite(seg.toNm) && totalNm - seg.toNm < 3)) return code;
    }
  }
  return null;
}

function originIsInsideTma(origin, airspaces) {
  return originReaTmaId(origin, airspaces) != null;
}

function destIsInsideTma(dest, airspaces, totalNm) {
  return destReaTmaId(dest, airspaces, totalNm) != null;
}

function hasTmaAirspaceData(airspaces) {
  return (airspaces || []).some(
    (hit) =>
      String(hit?.type || "").toUpperCase() === "TMA" && Boolean(reaTmaCodeFromIdentName(hit.ident, hit.name)),
  );
}

function buildFplRouteText(waypoints, legCorridors, speedKt, options = {}) {
  if (waypoints.length < 2) return "";
  const isCorridorLeg = (idx) => Boolean(legCorridors[idx]);
  const origin = waypoints[0];
  const dest = waypoints[waypoints.length - 1];
  let firstCorr = -1;
  let lastCorr = -1;
  for (let idx = 1; idx < waypoints.length; idx++) {
    if (!isCorridorLeg(idx)) continue;
    if (firstCorr < 0) firstCorr = idx;
    lastCorr = idx;
  }

  if (firstCorr < 0) {
    const tokens = [];
    pushFplToken(tokens, "DCT");
    for (let legIdx = 1; legIdx < waypoints.length - 1; legIdx++) {
      pushFplToken(
        tokens,
        formatFplPointSpeedLevel(waypoints[legIdx], speedKt, levelFlownFrom(waypoints, legIdx, false)),
      );
      pushFplToken(tokens, "DCT");
    }
    return tokens.join(" ");
  }

  const entryWp = waypoints[firstCorr - 1];
  const originInside = options.originInsideTma;
  const destInside = options.destInsideTma;
  const originTmaId = options.originReaTmaId ?? null;
  const destTmaId = options.destReaTmaId ?? null;
  const destOnRea = lastCorr === waypoints.length - 1;
  const trailingDctNm = destOnRea ? 0 : haversineM(waypoints[lastCorr], dest) / NM_IN_M;
  const tinyTrailingSnap = !destOnRea && trailingDctNm < 3;
  const localJoin = firstCorr === 1 || isLocalReaJoin(origin, entryWp);
  const startsInside = originInside === false ? firstCorr === 1 : localJoin;
  let continuousRea = true;
  for (let idx = firstCorr; idx <= lastCorr; idx++) {
    if (!isCorridorLeg(idx)) {
      continuousRea = false;
      break;
    }
  }
  const endsInside =
    destInside === false
      ? false
      : destOnRea || tinyTrailingSnap
        ? destInside !== false
        : destInside === true && !continuousRea;
  const sameReaTma = originTmaId && destTmaId ? originTmaId === destTmaId : true;
  if (startsInside && endsInside && continuousRea && sameReaTma && (destOnRea || tinyTrailingSnap)) return "REA";

  const tokens = [];
  pushFplToken(tokens, startsInside ? "REA" : "DCT");
  const startLeg = startsInside ? firstCorr : 1;

  for (let legIdx = startLeg; legIdx < waypoints.length; legIdx++) {
    const to = waypoints[legIdx];
    const inside = isCorridorLeg(legIdx);
    const nextInside = legIdx + 1 < waypoints.length ? isCorridorLeg(legIdx + 1) : null;
    const isLastLeg = legIdx === waypoints.length - 1;
    if (inside) {
      if (nextInside === false) {
        const next = waypoints[legIdx + 1];
        if (next && next === dest && endsInside) continue;
        pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, nextInside)));
        pushFplToken(tokens, "DCT");
      } else if (isLastLeg && !endsInside) {
        const from = waypoints[legIdx - 1];
        if (from && from !== origin) {
          pushFplToken(tokens, formatFplPointSpeedLevel(from, speedKt, levelFlownFrom(waypoints, legIdx - 1, false)));
          pushFplToken(tokens, "DCT");
        }
      }
      continue;
    }
    if (nextInside === true) {
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, true)));
      pushFplToken(tokens, "REA");
      continue;
    }
    if (!isLastLeg) {
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, nextInside)));
      pushFplToken(tokens, "DCT");
    }
  }
  return tokens.join(" ");
}

function buildFplRmkText(waypoints, legCorridors) {
  const corridorNames = [];
  const seenCorridors = new Set();
  for (const corridor of legCorridors) {
    const clean = normalizeFplText(corridor?.name || "");
    if (!clean || seenCorridors.has(clean)) continue;
    seenCorridors.add(clean);
    corridorNames.push(clean);
  }
  const tglAerodromes = [];
  const seenTgl = new Set();
  for (const wp of waypoints.slice(1, Math.max(1, waypoints.length - 1))) {
    const code = waypointIcaoCode(wp);
    if (!code || seenTgl.has(code)) continue;
    const looksLikeAd = isAirportLike(wp) || (wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt));
    if (!looksLikeAd) continue;
    seenTgl.add(code);
    tglAerodromes.push(code);
  }
  const tokens = [];
  if (corridorNames.length > 0) tokens.push("REA", ...corridorNames);
  for (const icao of tglAerodromes) tokens.push("TGL", icao);
  if (corridorNames.length > 0) tokens.push("AD", "CFM", "ALT", "MAX", "REA");
  return tokens.join(" ");
}

module.exports = {
  NM_IN_M,
  haversineM,
  formatCompactAviationCoord,
  formatBearingDeg,
  formatEteClock,
  buildFlightPlanLegs,
  matchReaCorridorForLeg,
  matchLegCorridors,
  applyCorridorAltitudes,
  snapRouteToVisualCorridors,
  buildFplRouteText,
  buildFplRmkText,
  originIsInsideTma,
  destIsInsideTma,
  originReaTmaId,
  destReaTmaId,
  reaTmaCodeFromIdentName,
  hasTmaAirspaceData,
  geometryContainsLatLng,
  endpointA,
  endpointB,
};
