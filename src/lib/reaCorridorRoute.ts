import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { haversineM } from "./flightPlanningRoute";
import {
  corridorDisplayName,
  endpointA,
  endpointB,
  pointKey,
  reaCorridorDirections,
  resolveReaAltitudesDirected,
  type ReaRouteFeature,
} from "./reaRoutesDb";

const NM_IN_M = 1852;
const MERGE_M = 400;
const NEAR_WP_M = 1852 * 0.4;
const PROGRESS_M = 1852 * 0.8;
const MAX_RIDES = 12;
const ENTRY_SNAPS_PER_COMP = 10;
const GATE_ENTRY_NM = 15;
const GATE_HEADING_DEG = 25;
const LOCAL_TMA_NEAR_NM = 40;

function isRehFeature(feature: ReaRouteFeature & { _kind?: string }): boolean {
  if (feature._kind === "reh") return true;
  if (feature._kind === "rea") return false;
  return /CV_REH/i.test(String(feature.id || ""));
}

/** Rota automática de avião usa REA. REH só entra se não houver REA carregada. */
function airplaneVisualFeatures(features: ReaRouteFeature[]): ReaRouteFeature[] {
  const rea = features.filter((feature) => !isRehFeature(feature));
  return rea.length ? rea : features;
}

export type ReaCorridorSnapOk = {
  ok: true;
  waypoints: FlightPlanWaypoint[];
  inserted: number;
  distanceNm: number;
  oneWayLegs: number;
  dctLegs: number;
  corridorNames: string[];
};

export type ReaCorridorSnapErr = { ok: false; error: string };
export type ReaCorridorSnapResult = ReaCorridorSnapOk | ReaCorridorSnapErr;

type LatLng = { lat: number; lng: number };
type GraphNode = { id: string; lat: number; lng: number; name: string; gate: boolean };
type GraphEdge = {
  to: string;
  meters: number;
  name: string;
  oneWay: boolean;
  obrig: boolean;
  altMax: number | null;
};
type Seg = {
  a: GraphNode;
  b: GraphNode;
  name: string;
  dirs: { ab: boolean; ba: boolean };
  oneWay: boolean;
  obrig: boolean;
  altAb: number | null;
  altBa: number | null;
  componentId: string;
  carta: string;
};
type RidePoint = {
  lat: number;
  lng: number;
  name: string;
  kind: "rea" | "fix";
  altMax: number | null;
  oneWay: boolean;
  corridorName: string | null;
};

function nodeId(name: string, lat: number, lng: number): string {
  return pointKey(lat, lng, name);
}

function isPortaoName(name: string | null | undefined): boolean {
  return /^PORT[AÃ]O\b/i.test(String(name || "").trim());
}

function isObrigFeature(tipo: string | null | undefined): boolean {
  return !/^recom/i.test(String(tipo || "").trim());
}

function fallbackName(name: string, lat: number, lng: number): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return `REA ${lat.toFixed(3)}/${lng.toFixed(3)}`;
}

function findMergeNode(nodes: GraphNode[], lat: number, lng: number): GraphNode | null {
  let best: GraphNode | null = null;
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

function edgeBeats(next: GraphEdge, current: GraphEdge): boolean {
  if (next.obrig !== current.obrig) return next.obrig;
  return next.meters < current.meters;
}

function pushEdge(adj: Map<string, GraphEdge[]>, fromId: string, edge: GraphEdge) {
  const list = adj.get(fromId) || [];
  const idx = list.findIndex((item) => item.to === edge.to && item.name === edge.name);
  if (idx >= 0) {
    if (edgeBeats(edge, list[idx]!)) list[idx] = edge;
  } else {
    list.push(edge);
  }
  adj.set(fromId, list);
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { lat: number; lng: number; t: number; distM: number } {
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

function bearingDeg(from: LatLng, to: LatLng): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toR(to.lng - from.lng)) * Math.cos(toR(to.lat));
  const x =
    Math.cos(toR(from.lat)) * Math.sin(toR(to.lat)) -
    Math.sin(toR(from.lat)) * Math.cos(toR(to.lat)) * Math.cos(toR(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function headingDiffDeg(a: number, b: number): number {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

function cloneAdj(adj: Map<string, GraphEdge[]>): Map<string, GraphEdge[]> {
  const next = new Map<string, GraphEdge[]>();
  for (const [id, edges] of adj) next.set(id, edges.slice());
  return next;
}

function buildGraph(features: ReaRouteFeature[]): {
  nodes: Map<string, GraphNode>;
  adj: Map<string, GraphEdge[]>;
  segs: Seg[];
} {
  const nodeList: GraphNode[] = [];
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, GraphEdge[]>();
  const segs: Seg[] = [];
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const up = parent.get(cur);
      if (!up) break;
      parent.set(cur, parent.get(up) ?? up);
      cur = parent.get(cur) ?? cur;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const addNode = (name: string, lat: number, lng: number): GraphNode => {
    const existing = findMergeNode(nodeList, lat, lng);
    if (existing) return existing;
    const node: GraphNode = { id: nodeId(name, lat, lng), lat, lng, name: name.trim().toUpperCase(), gate: false };
    nodeList.push(node);
    nodes.set(node.id, node);
    if (!adj.has(node.id)) adj.set(node.id, []);
    if (!parent.has(node.id)) parent.set(node.id, node.id);
    return node;
  };

  const addDirected = (
    from: GraphNode,
    to: GraphNode,
    meta: Omit<GraphEdge, "to" | "meters">,
  ) => {
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

  const undirected = new Map<string, Set<string>>();
  const touch = (from: string, to: string) => {
    const set = undirected.get(from) || new Set<string>();
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

function attachSnap(
  baseAdj: Map<string, GraphEdge[]>,
  baseNodes: Map<string, GraphNode>,
  seg: Seg,
  snap: { lat: number; lng: number; t: number },
): { adj: Map<string, GraphEdge[]>; nodes: Map<string, GraphNode>; startId: string } {
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
  const node: GraphNode = { id, lat: snap.lat, lng: snap.lng, name: (seg.name || "REA").toUpperCase(), gate: false };
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

type Ride = {
  componentId: string;
  entryDistM: number;
  exitDistToDestM: number;
  pathMeters: number;
  points: RidePoint[];
};

function rideTotalCost(ride: Ride): number {
  return ride.entryDistM + ride.pathMeters + ride.exitDistToDestM;
}

/** Prefere juntar cedo na REA e sair perto do destino; DCT pesa mais que voar o corredor. */
function rideScore(ride: Ride): number {
  return 2 * ride.entryDistM + ride.pathMeters + 3 * ride.exitDistToDestM;
}

function nearestDistToSegs(point: LatLng, segs: Seg[]): number {
  let best = Infinity;
  for (const seg of segs) {
    const d = projectOnSegment(point, seg.a, seg.b).distM;
    if (d < best) best = d;
  }
  return best;
}

/** Rede visual sentada na origem ou no destino (TMA local), não um desvio intermediário. */
function anchoredToLocalTma(point: LatLng, segs: Seg[]): boolean {
  return nearestDistToSegs(point, segs) <= LOCAL_TMA_NEAR_NM * NM_IN_M;
}

function pathMetersFromWalk(
  nodes: Map<string, GraphNode>,
  walk: Array<{ nodeId: string; edge: GraphEdge | null }>,
): number {
  let meters = 0;
  for (let i = 1; i < walk.length; i++) {
    const from = nodes.get(walk[i - 1]!.nodeId);
    const to = nodes.get(walk[i]!.nodeId);
    if (from && to) meters += haversineM(from, to);
  }
  return meters;
}

function closestSnaps(pos: LatLng, segs: Seg[], limit: number): Array<{ seg: Seg; lat: number; lng: number; t: number; distM: number }> {
  const snaps = segs
    .map((seg) => {
      const proj = projectOnSegment(pos, seg.a, seg.b);
      return { seg, ...proj };
    })
    .sort((a, b) => a.distM - b.distM || Number(b.seg.obrig) - Number(a.seg.obrig));
  const out: typeof snaps = [];
  const seen = new Set<string>();
  for (const snap of snaps) {
    const key = `${snap.seg.componentId}|${snap.lat.toFixed(4)}|${snap.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snap);
    if (out.length >= limit) break;
  }
  return out;
}

function pointsFromWalk(
  nodes: Map<string, GraphNode>,
  walk: Array<{ nodeId: string; edge: GraphEdge | null }>,
): RidePoint[] {
  const points: RidePoint[] = [];
  for (let i = 0; i < walk.length; i++) {
    const node = nodes.get(walk[i]!.nodeId);
    if (!node) continue;
    points.push(namedPoint(node, walk[i]!.edge, walk[i + 1]?.edge ?? null));
  }
  return points;
}

function dijkstra(
  adj: Map<string, GraphEdge[]>,
  start: string,
): { prev: Map<string, { from: string; edge: GraphEdge }>; dist: Map<string, number> } {
  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; edge: GraphEdge }>();
  const used = new Set<string>();
  dist.set(start, 0);

  while (true) {
    let bestId: string | null = null;
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

function reconstructNodes(
  prev: Map<string, { from: string; edge: GraphEdge }>,
  start: string,
  end: string,
): Array<{ nodeId: string; edge: GraphEdge | null }> | null {
  const path: Array<{ nodeId: string; edge: GraphEdge | null }> = [];
  let cur = end;
  const seen = new Set<string>();
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

function walkToCheapestExit(
  adj: Map<string, GraphEdge[]>,
  nodes: Map<string, GraphNode>,
  startId: string,
  dest: LatLng,
): Array<{ nodeId: string; edge: GraphEdge | null }> | null {
  const start = nodes.get(startId);
  if (!start) return null;
  const { prev, dist } = dijkstra(adj, startId);
  const startDist = haversineM(start, dest);
  let best: { id: string; total: number; destDist: number } | null = null;
  for (const [id, graphDist] of dist) {
    if (id === startId) continue;
    const node = nodes.get(id);
    if (!node || node.id.startsWith("SNAP|")) continue;
    const destDist = haversineM(node, dest);
    if (startDist - destDist < PROGRESS_M) continue;
    const total = graphDist + 2 * destDist;
    if (
      !best ||
      total < best.total - 50 ||
      (Math.abs(total - best.total) <= 50 && destDist < best.destDist)
    ) {
      best = { id, total, destDist };
    }
  }
  if (!best) return greedyWalkTowardDest(adj, nodes, startId, dest);
  return reconstructNodes(prev, startId, best.id);
}

function greedyWalkTowardDest(
  adj: Map<string, GraphEdge[]>,
  nodes: Map<string, GraphNode>,
  startId: string,
  dest: LatLng,
): Array<{ nodeId: string; edge: GraphEdge | null }> | null {
  const walk: Array<{ nodeId: string; edge: GraphEdge | null }> = [{ nodeId: startId, edge: null }];
  const seen = new Set<string>([startId]);
  let cur = startId;

  while (true) {
    const curNode = nodes.get(cur);
    if (!curNode) break;
    const curDist = haversineM(curNode, dest);
    let best: { edge: GraphEdge; dist: number } | null = null;
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

function rideFromStart(
  adj: Map<string, GraphEdge[]>,
  nodes: Map<string, GraphNode>,
  startId: string,
  dest: LatLng,
  entryDistM: number,
  componentId: string,
): Ride | null {
  const walk = walkToCheapestExit(adj, nodes, startId, dest);
  if (!walk) return null;
  const points = pointsFromWalk(nodes, walk);
  if (!points.length) return null;
  const exit = points[points.length - 1]!;
  return {
    componentId,
    entryDistM,
    exitDistToDestM: haversineM(exit, dest),
    pathMeters: pathMetersFromWalk(nodes, walk),
    points,
  };
}

function componentNodes(segs: Seg[], nodes: Map<string, GraphNode>): GraphNode[] {
  const ids = new Set<string>();
  for (const seg of segs) {
    ids.add(seg.a.id);
    ids.add(seg.b.id);
  }
  return [...ids].map((id) => nodes.get(id)).filter((node): node is GraphNode => Boolean(node));
}

function bestRideForComponent(
  pos: LatLng,
  dest: LatLng,
  componentSegs: Seg[],
  adj: Map<string, GraphEdge[]>,
  nodes: Map<string, GraphNode>,
  options?: { skipProgress?: boolean },
): Ride | null {
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

  const candidates: Array<{ adj: Map<string, GraphEdge[]>; nodes: Map<string, GraphNode>; startId: string; distM: number }> = [];
  // Longe da rede: entra no primeiro nó útil (Pedras, Limeira, …), não só em
  // “Portão …” alinhado com o destino. Perto: snap no corredor + alguns gates.
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

  let best: Ride | null = null;
  const componentId = componentSegs[0]?.componentId || "";
  const skipProgress = Boolean(options?.skipProgress);
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

function namedPoint(node: GraphNode, edge: GraphEdge | null, outgoing: GraphEdge | null): RidePoint {
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

function appendRidePoints(
  next: FlightPlanWaypoint[],
  dest: FlightPlanWaypoint,
  points: RidePoint[],
  stats: { oneWayLegs: number; corridorNames: string[] },
  lastAlt: { value: number | null },
) {
  for (const point of points) {
    if (point.oneWay) stats.oneWayLegs += 1;
    if (point.corridorName) stats.corridorNames.push(point.corridorName);
    const last = next[next.length - 1]!;
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

function snapCorridorPair(
  origin: FlightPlanWaypoint,
  dest: FlightPlanWaypoint,
  nodes: Map<string, GraphNode>,
  adj: Map<string, GraphEdge[]>,
  byComponent: Map<string, Seg[]>,
): ReaCorridorSnapResult {
  const used = new Set<string>();
  const next: FlightPlanWaypoint[] = [{ ...origin }];
  const stats = { oneWayLegs: 0, corridorNames: [] as string[] };
  const lastAlt = { value: origin.altitudeFt ?? origin.fieldElevFt ?? null };
  let pos: LatLng = origin;
  let rides = 0;
  let dctLegs = 0;

  while (rides < MAX_RIDES) {
    const destNow = haversineM(pos, dest);
    if (destNow < NEAR_WP_M * 2) break;

    const ridesFound: Ride[] = [];
    const mandatory: Ride[] = [];
    for (const [componentId, componentSegs] of byComponent) {
      if (used.has(componentId)) continue;
      const destTma = anchoredToLocalTma(dest, componentSegs);
      const originTma = anchoredToLocalTma(pos, componentSegs);
      const localTma = destTma || originTma;
      if (!localTma) continue;
      const ride = bestRideForComponent(pos, dest, componentSegs, adj, nodes, {
        skipProgress: Boolean(destTma && rides > 0),
      });
      if (!ride) continue;
      if (rides > 0 && !localTma && rideTotalCost(ride) >= destNow - PROGRESS_M) continue;
      ridesFound.push(ride);
      if (localTma) mandatory.push(ride);
    }
    const nearby = ridesFound.filter((ride) => ride.entryDistM <= GATE_ENTRY_NM * NM_IN_M);
    const pool = mandatory.length && rides > 0 ? mandatory : nearby.length ? nearby : ridesFound;
    let chosen: Ride | null = null;
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

    const first = chosen.points[0]!;
    if (haversineM(pos, first) > NEAR_WP_M * 2) dctLegs += 1;
    appendRidePoints(next, dest, chosen.points, stats, lastAlt);
    used.add(chosen.componentId);
    const exit = chosen.points[chosen.points.length - 1]!;
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
      dest.altitudeFt != null && Number.isFinite(dest.altitudeFt)
        ? dest.altitudeFt
        : dest.fieldElevFt ?? lastAlt.value,
  });

  let distanceM = 0;
  for (let i = 1; i < next.length; i++) distanceM += haversineM(next[i - 1]!, next[i]!);

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

function relabelSnappedRoute(waypoints: FlightPlanWaypoint[]): FlightPlanWaypoint[] {
  return waypoints.map((wp, idx, arr) => {
    let kind = wp.kind;
    if (idx === 0) kind = "origin";
    else if (idx === arr.length - 1) kind = "destination";
    else if (wp.kind === "origin" || wp.kind === "destination") kind = "airport";
    const isAd = kind === "airport" || kind === "destination";
    return {
      ...wp,
      kind,
      ...(idx > 0 && isAd ? { altitudeRef: "be" as const } : {}),
    };
  });
}

/**
 * Encaixa origem/destino nos corredores visuais pela rota mais curta: usa a
 * rede perto da origem (TMA de partida), segue até o ponto em que continuar
 * alonga o voo, e DCT até o destino. Depois da rede nacional, ainda entra na
 * TMA visual do destino (Londrina, BH, Curitiba, …) em vez de DCT direto.
 * Com 3+ pontos, traça REA entre cada par consecutivo, na ordem da rota.
 * Não desvia para uma TMA intermediária. Ignora REH (helicóptero) quando há REA.
 */
export function snapRouteToVisualCorridors(
  waypoints: FlightPlanWaypoint[],
  features: ReaRouteFeature[],
): ReaCorridorSnapResult {
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

  const byComponent = new Map<string, Seg[]>();
  for (const seg of segs) {
    const list = byComponent.get(seg.componentId) || [];
    list.push(seg);
    byComponent.set(seg.componentId, list);
  }

  const combined: FlightPlanWaypoint[] = [];
  const stats = { oneWayLegs: 0, corridorNames: [] as string[], dctLegs: 0 };
  let anyRide = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const piece = snapCorridorPair(from, to, nodes, adj, byComponent);
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
    const last = combined[combined.length - 1]!;
    if (haversineM(last, to) > NEAR_WP_M) {
      combined.push({ ...to });
      stats.dctLegs += 1;
    }
  }

  if (!anyRide) {
    return { ok: false, error: "Não há corredor visual utilizável entre origem e destino." };
  }

  const next = relabelSnappedRoute(combined);
  let distanceM = 0;
  for (let i = 1; i < next.length; i++) distanceM += haversineM(next[i - 1]!, next[i]!);

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
