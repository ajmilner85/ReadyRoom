/**
 * PriFly deck taxi network: the flight deck as a road system. Main arteries (the run from in front of
 * EL 3 up to the bow catapults, the short crossing to the waist catapults, the landing-area roll-out)
 * are single straight roads; feeders join them from the elevators and parking spots and branch off
 * again to each catapult. The routes are modelled on the Supercarrier deck crew's (nimitzDeck.gen.ts)
 * but straightened and shared, so every aircraft bound the same way follows the same line.
 *
 * A taxi route is the cheapest way through the network (distance plus a cost per degree turned, no turn
 * sharper than MAX_TURN), drawn with its corners filleted. An aircraft that isn't on a spot joins the
 * network at the best entry point near it. Routes are checked against the other aircraft on deck: the
 * route is clear up to the first aircraft in its way.
 *
 * The parking spots are the 40 F/A-18C spots of the spotting plan (deckSpots.gen.ts, from
 * carrier-ops-handoff-2/deck-spots.csv): each is joined to the roads straight ahead of the parked jet.
 *
 * Deck coordinates as in deck.ts: metres, x forward, y to port, headings in degrees CCW from the bow.
 * To retune the network, edit ROADS and FEED below; the graph, the solver and the drawing follow.
 */
import { CATS, NIMITZ as G, inPoly, onCat, type V } from './deck.ts';
import { DECK_SPOTS, type DeckSpot } from './deckSpots.gen.ts';

const D = Math.PI / 180;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
const norm = (a: V) => Math.hypot(a[0], a[1]);
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: V): V => {
  const l = norm(a) || 1;
  return [a[0] / l, a[1] / l];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const cross = (a: V, b: V) => a[0] * b[1] - a[1] * b[0];
/** angle turned going from direction u to direction v (unit vectors), degrees 0..180 */
const turnDeg = (u: V, v: V) => Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / D;
const heading = (deg: number): V => [Math.cos(deg * D), Math.sin(deg * D)];
/** the point at x on the line through a and b */
const onLine = (a: V, b: V) => (x: number): V => [x, a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0])];
/** where the line through p along d meets the line through q along e */
const meet = (p: V, d: V, q: V, e: V): V => {
  const t = cross(sub(q, p), e) / cross(d, e);
  return add(p, d, t);
};

// ---------------------------------------------------------------- the road layout

/** catapult k's track line, extended aft */
const cat = (k: string) => onLine(CATS[k][0], CATS[k][1]);
const catDir = (k: string): V => unit(sub(CATS[k][1], CATS[k][0]));
/** the landing area centreline */
const la = onLine(G.la.c[0], G.la.c[1]);
/**
 * The main artery: one straight line up the deck, from in front of EL 3 to the bow. Aft of the bow
 * catapults it is the deck crew's routes 9, 10 and 14, straightened; forward of them it runs on between
 * the two bow catapult tracks (the bow lane), where aircraft spotted on the bow pull out to.
 */
const art = onLine([-100, -15.5], [20, -8.5]);

const spot = (id: string): DeckSpot => {
  const s = DECK_SPOTS.find((q) => q.id === id);
  if (!s) throw new Error(`taxiNet: no deck spot ${id}`);
  return s;
};

/** the turn-round road runs across the deck at EL 1's aft spot: straight ahead of the jet parked there */
const TURN_X = spot('E12').p[0];
/** where the artery fans out to the bow catapults (also where the turn-round road crosses it) */
const FAN = art(TURN_X);
/** the bow lane's forward end */
const BOW_END = art(150);
/**
 * The patio road: the artery's aft end, bent to run parallel to the patio's row of spots, clear of their noses.
 * It bends where the patio's forward spot comes onto the artery, straight ahead of the jet parked there (the
 * spot as respotted in DCS met the artery 2 m short of a bend at x = -108, and every route past it kinked).
 */
const PATIO_JOIN = meet(spot('PA1').p, heading(spot('PA1').hdg), art(-100), unit(sub(art(20), art(-100))));
const PATIO_DIR = heading(-9.3);
const PATIO_END = add(PATIO_JOIN, PATIO_DIR, -24);
/** the artery as one line, stern to bow */
const MAIN: V[] = [PATIO_END, PATIO_JOIN, FAN, BOW_END];
/** the waist crossing: leaves the artery straight ahead of EL 3's forward spot, crosses the landing area to the waist catapult lines */
const CROSS_FROM = art(spot('E31').p[0]);
const CROSS_DIR = heading(75);
const CROSS_CAT3 = meet(CROSS_FROM, CROSS_DIR, CATS['3'][0], catDir('3'));
const CROSS_CAT4 = meet(CROSS_FROM, CROSS_DIR, CATS['4'][0], catDir('4'));
/** landing-area turn-round: off the centreline, round to starboard and down onto the artery */
const LA_OFF = la(4);
const LA_END = la(44);
const LA_AFT = la(-130);
const CROTCH_JOIN: V = [72, 14.5];
/** the catapult approaches' aft ends: the bow catapults' at the turn-round road, the waist catapults' where the aftmost spots join */
const CAT_FROM: Record<string, V> = { '1': cat('1')(TURN_X), '2': cat('2')(TURN_X), '3': cat('3')(-125), '4': cat('4')(-84) };

/** where the ray from p along heading hdg first meets the line a-b (the segments of `road`, each taken as a line between its ends); null if it does not, ahead of p */
const ahead = (p: V, hdg: number, road: V[]): V | null => {
  const h = heading(hdg);
  let best: V | null = null;
  for (let i = 1; i < road.length; i++) {
    const [a, b] = [road[i - 1], road[i]];
    const e = sub(b, a);
    const den = cross(h, e);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(sub(a, p), e) / den;
    const u = cross(sub(a, p), h) / den;
    if (t <= 0.5 || u < -1e-6 || u > 1 + 1e-6) continue;
    const q = add(p, h, t);
    if (!best || dist(p, q) < dist(p, best)) best = q;
  }
  return best;
};

export type DestKind = 'cat' | 'elev' | 'park';
export interface TaxiDest {
  id: string;
  kind: DestKind;
  /** full name, e.g. "El 2 1" */
  label: string;
  /** what fits in a marker or after a board number, e.g. "E21" */
  short: string;
  p: V;
}

export type RoadKind = 'artery' | 'cat' | 'feeder';
export interface Road {
  id: string;
  kind: RoadKind;
  pts: V[];
}

/**
 * Each deck spot's way onto the roads: straight ahead, the way the jet is parked, until it meets the road
 * named here (crossing, and so joining, any road on the way). The spots are deckSpots.gen.ts: the 40
 * F/A-18C spots of the spotting plan, where players spawn.
 *   main      the artery: the bow lane for the bow, crotch and point rows; the street for the six-pack and
 *             the starboard rows; the patio road for the patio and the starboard quarter. The port side
 *             spots cross the waist catapult lines and the landing area to it.
 *   bow1      the six-pack's forward spot runs on across the artery to the cat 1 feeder (respotted in DCS on
 *             2026-11-16 it meets the artery forward of the fan, where the feeder has already left it)
 *   bow2      EL 1's forward spot and Point 1 run on across the bow lane to the cat 2 feeder
 *   cat3      Fantail 1, whose nose points along the cat 3 line
 *   waist     Port quarter 1, which stands at the cat 4 approach's aft end with its nose across the deck: straight ahead it
 *             crosses the cat 3 line and runs into the waist crossing at a slant, 8 m short of the landing area's
 *             centreline (run on to the artery by itself it would be a second waist crossing)
 * The spots are as the user respotted them in DCS (deck-spots-dcs.csv): the starboard bow row has six, the
 * port bow row two and the crotch two, the patio three. (Listed in spot-number order: the graph is built in this order.)
 */
const FEED: Record<string, 'main' | 'bow1' | 'bow2' | 'cat3' | 'waist'> = {
  SB6: 'main', SB5: 'main', SB4: 'main', SB3: 'main', SB2: 'main', SB1: 'main',
  PB2: 'main', PB1: 'main', CR2: 'main', CR1: 'main',
  PT4: 'main', PT3: 'main', PT2: 'main', PT1: 'bow2', E11: 'bow2',
  SP1: 'bow1', SP2: 'main', SP3: 'main', SP4: 'main', SP5: 'main', SP6: 'main',
  CO1: 'main', CO2: 'main', E21: 'main', E22: 'main', E31: 'main', E32: 'main',
  PA1: 'main', PA2: 'main', PA3: 'main', FT4: 'main',
  PQ1: 'main', PQ2: 'main', PQ3: 'main', FT1: 'cat3', E41: 'main', E42: 'main',
};
const BOW1: V[] = [FAN, cat('1')(52)];
const BOW2: V[] = [FAN, cat('2')(50)];
const LANDING: V[] = [LA_AFT, LA_END];
const CAT3: V[] = [CAT_FROM['3'], CATS['3'][0]];
const FEED_ROAD = { main: MAIN, bow1: BOW1, bow2: BOW2, cat3: CAT3, waist: [CROSS_FROM, CROSS_CAT3] as V[] };

const feeders = (): Road[] => {
  const out: Road[] = [];
  for (const [id, to] of Object.entries(FEED)) {
    const s = spot(id);
    const q = ahead(s.p, s.hdg, FEED_ROAD[to]);
    if (!q) throw new Error(`taxiNet: spot ${id} does not meet the ${to} road straight ahead`);
    out.push({ id: `spot-${id}`, kind: 'feeder', pts: [s.p, q] });
  }
  return out;
};

/**
 * EL 4's spots sit beside the cat 4 line pointing across the deck: besides running straight ahead they
 * can pull out 6 m and swing left onto the cat 4 approach.
 */
const pivot = (id: string, to: V): Road => {
  const s = spot(id);
  return { id: `pivot-${id}`, kind: 'feeder', pts: [s.p, add(s.p, heading(s.hdg), 6), to] };
};

/**
 * The roads. They are joined wherever they touch or cross (buildGraph), so a junction needs no entry of
 * its own: end a feeder on an artery's line and it is a junction.
 */
export const ROADS: Road[] = [
  // arteries
  { id: 'main', kind: 'artery', pts: MAIN },
  { id: 'waist-crossing', kind: 'artery', pts: [CROSS_FROM, CROSS_CAT3, CROSS_CAT4] },
  { id: 'landing-area', kind: 'artery', pts: LANDING },
  // catapult approaches: each track's own line, so aircraft arrive lined up
  ...['1', '2', '3', '4'].map((k): Road => ({ id: `cat${k}`, kind: 'cat', pts: [CAT_FROM[k], CATS[k][0]] })),
  // the bow fan: off the artery to cat 1 and cat 2
  { id: 'bow1', kind: 'feeder', pts: BOW1 },
  { id: 'bow2', kind: 'feeder', pts: BOW2 },
  // the turn-round road, across the deck from the landing area to EL 1's aft spot: where aircraft come
  // off the landing area, and where aircraft coming aft down the bow lane turn back up to a bow catapult
  { id: 'turn-round', kind: 'feeder', pts: [LA_OFF, [TURN_X, 11], spot('E12').p] },
  // out of the landing area ahead, to the cat 2 line
  { id: 'crotch', kind: 'feeder', pts: [LA_END, CROTCH_JOIN] },
  { id: 'crotch2', kind: 'feeder', pts: [cat('2')(55.8), CROTCH_JOIN] },
  // the stern spots that point up a road's own line pull straight out 8 m and ease onto its aft end: the landing area's, the cat 3 line's
  { id: 'spot-FT3', kind: 'feeder', pts: [spot('FT3').p, add(spot('FT3').p, heading(spot('FT3').hdg), 8), LA_AFT] },
  { id: 'spot-FT2', kind: 'feeder', pts: [spot('FT2').p, add(spot('FT2').p, heading(spot('FT2').hdg), 8), CAT_FROM['3']] },
  ...feeders(),
  pivot('E41', CAT_FROM['4']),
  pivot('E42', CAT_FROM['4']),
  // Port quarter 1 stands at the cat 4 approach's aft end, nose across the deck (as respotted): it pulls out and swings
  // left onto the approach 14 m up it
  pivot('PQ1', cat('4')(-70)),
];

const KIND = (s: DeckSpot): DestKind => (s.area.startsWith('El ') ? 'elev' : 'park');

/** how the network and its routes are drawn: a clear route green, the part beyond an aircraft in the way amber */
export const TAXI_COL = { clear: '#5FD068', blocked: '#E7B04F', road: '#D6E2EE' } as const;

/** Everywhere an aircraft can be sent: the four catapults (their shuttles) and the deck spots. */
export const TAXI_DESTS: TaxiDest[] = [
  ...['1', '2', '3', '4'].map((k): TaxiDest => ({ id: `C${k}`, kind: 'cat', label: `CAT ${k}`, short: `C${k}`, p: CATS[k][0] })),
  ...DECK_SPOTS.map((s): TaxiDest => ({ id: s.id, kind: KIND(s), label: s.label, short: s.id, p: s.p })),
];
const DEST = new Map(TAXI_DESTS.map((d) => [d.id, d]));
export const taxiDest = (id: string | null | undefined): TaxiDest | undefined => (id ? DEST.get(id) : undefined);
/** the catapult a destination id names, if it is one ("C3" -> "3") */
export const destCat = (id: string | null | undefined): string | null => (id && /^C[1-4]$/.test(id) ? id[1] : null);

// ---------------------------------------------------------------- the graph

const MERGE = 0.25; // points this close are one junction

export interface TaxiGraph {
  nodes: V[];
  adj: number[][];
}

/** Join the roads into a graph: a node at every road vertex, crossing and place one road ends on another. */
export function buildGraph(roads: Road[]): TaxiGraph {
  const nodes: V[] = [];
  const adj: number[][] = [];
  const nodeAt = (p: V): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) < MERGE) return i;
    nodes.push(p);
    adj.push([]);
    return nodes.length - 1;
  };
  const segs = roads.flatMap((r, ri) => r.pts.slice(1).map((b, i) => ({ ri, a: r.pts[i], b })));
  for (const s of segs) {
    const d = sub(s.b, s.a);
    const L2 = dot(d, d);
    const cuts = [0, 1];
    for (const o of segs) {
      if (o === s) continue;
      // the other segment's ends lying on this one
      for (const q of [o.a, o.b]) {
        const t = dot(sub(q, s.a), d) / L2;
        if (t > 0 && t < 1 && dist(add(s.a, d, t), q) < MERGE) cuts.push(t);
      }
      // a proper crossing
      const e = sub(o.b, o.a);
      const den = cross(d, e);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(sub(o.a, s.a), e) / den;
      const u = cross(sub(o.a, s.a), d) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    let prev = -1;
    for (const t of cuts) {
      const n = nodeAt(add(s.a, d, t));
      if (prev >= 0 && prev !== n && !adj[prev].includes(n)) {
        adj[prev].push(n);
        adj[n].push(prev);
      }
      prev = n;
    }
  }
  return { nodes, adj };
}

export const TAXI_GRAPH = buildGraph(ROADS);
const NODE_OF = new Map(TAXI_DESTS.map((d) => [d.id, TAXI_GRAPH.nodes.findIndex((n) => dist(n, d.p) < MERGE)]));

// ---------------------------------------------------------------- the solver

/** no turn sharper than this at a junction (a Hornet turns tight, but it doesn't reverse) */
const MAX_TURN = 125;
/** metres of taxiing one degree of turn is worth: prefers the flowing route over the kinked short cut */
const TURN_COST = 0.12;
/** off the network, distance counts this much more (get onto a road soon) */
const OFF_ROAD = 1.5;
/** an aircraft this close to a spot or junction starts from it */
const AT_NODE = 5;
/** how far off the network an entry point is looked for */
const SNAP_MAX = 60;
/** fillet radius for the corners of a route, metres */
const RADIUS = 8;
/**
 * An aircraft bound for a catapult makes no turn sharper than LINEUP_TURN within MIN_LINEUP metres of
 * the shuttle: it comes onto the track's line behind the jet blast deflector and rolls up it straight.
 * (A spot's feeder that happens to cross a catapult line a couple of metres short of the shuttle is no
 * way onto that catapult.)
 */
const MIN_LINEUP = 8;
const LINEUP_TURN = 30;
/**
 * Nor does an aircraft turn that sharply in its first MIN_PULL_OUT metres: it pulls straight out of its
 * spot before it swings. (Spots stand close to roads and to each other's feeders: a junction a metre
 * ahead of the nose is not a place to turn.) If that leaves no way at all, the rule is dropped.
 */
const MIN_PULL_OUT = 5;

const STRUCT = [G.struct['Island'], G.struct['Radar Mast']];
/** can an aircraft taxi straight from a to b: on the deck all the way and not through the island */
const legOk = (a: V, b: V): boolean => {
  const n = Math.max(1, Math.ceil(dist(a, b) / 2));
  for (let i = 1; i <= n; i++) {
    const p = add(a, sub(b, a), i / n);
    if (!inPoly(p[0], p[1], G.outline) || STRUCT.some((q) => inPoly(p[0], p[1], q))) return false;
  }
  return true;
};

interface State {
  node: number;
  /** the node come from (-1 for a start state) and the direction of arrival (null: free to leave any way) */
  prev: number;
  dir: V | null;
  cost: number;
  parent: State | null;
  /** points this step adds to the route */
  pts: V[];
}

/**
 * Off the network an aircraft joins the nearest road: entries on roads up to this much further off than
 * the nearest are candidates (a road 40 m away is no way to start, however short the rest of the route
 * from there: a straight 40 m leg crosses whatever is in between, the landing area included).
 */
const NEAR_SLACK = 6;

/**
 * start states for an aircraft at `from`: its spot or junction when it is on one, else the entry points on
 * the roads near it. `wide`: any road within SNAP_MAX (then anywhere), for when the nearest roads lead nowhere.
 */
function seeds(g: TaxiGraph, from: V, hdg?: number, wide = false): State[] {
  let near = -1;
  for (let i = 0; i < g.nodes.length; i++) if (dist(g.nodes[i], from) < AT_NODE && (near < 0 || dist(g.nodes[i], from) < dist(g.nodes[near], from))) near = i;
  if (near >= 0) return [{ node: near, prev: -1, dir: null, cost: 0, parent: null, pts: [from] }];
  const h = hdg === undefined ? null : heading(hdg);
  const make = (maxD: number, checked: boolean): State[] => {
    const out: State[] = [];
    for (let u = 0; u < g.nodes.length; u++) {
      for (const v of g.adj[u]) {
        if (v < u) continue;
        const [a, b] = [g.nodes[u], g.nodes[v]];
        const d = sub(b, a);
        const L = norm(d);
        const t = Math.max(0, Math.min(1, dot(sub(from, a), d) / (L * L)));
        const foot = add(a, d, t);
        const off = dist(from, foot);
        if (off > maxD) continue;
        // join ahead of abeam, the further off the further ahead, so the aircraft swings onto the road instead of squaring up to it
        const lead = Math.max(4, Math.min(14, off));
        for (const [end, sgn] of [[v, 1], [u, -1]] as const) {
          const along = sgn > 0 ? (1 - t) * L : t * L; // road left toward that end
          const dir: V = [(d[0] / L) * sgn, (d[1] / L) * sgn];
          const entry = along <= lead ? g.nodes[end] : add(foot, dir, lead);
          if (checked && !legOk(from, entry)) continue;
          const leg = dist(from, entry);
          const legDir = leg > 0.5 ? unit(sub(entry, from)) : dir;
          const join = turnDeg(legDir, dir);
          if (join > MAX_TURN) continue;
          const swing = h && leg > 1 ? turnDeg(h, legDir) : 0;
          out.push({ node: end, prev: -1, dir, cost: leg * OFF_ROAD + dist(entry, g.nodes[end]) + (join + swing * 0.5) * TURN_COST, parent: null, pts: leg > 0.5 && dist(entry, g.nodes[end]) > 0.05 ? [from, entry] : [from] });
        }
      }
    }
    return out;
  };
  if (!wide) {
    let nearest = Infinity;
    for (let u = 0; u < g.nodes.length; u++)
      for (const v of g.adj[u]) {
        if (v < u) continue;
        const [a, b] = [g.nodes[u], g.nodes[v]];
        const d = sub(b, a);
        const t = Math.max(0, Math.min(1, dot(sub(from, a), d) / dot(d, d)));
        nearest = Math.min(nearest, dist(from, add(a, d, t)));
      }
    return nearest <= SNAP_MAX ? make(nearest + NEAR_SLACK, true) : [];
  }
  let s = make(SNAP_MAX, true);
  if (!s.length) s = make(Infinity, false);
  return s;
}

/** the waypoints (corners, not yet filleted) from an aircraft at `from` to a destination; null if it can't be reached */
export function taxiWaypoints(from: V, to: string, hdg?: number, g: TaxiGraph = TAXI_GRAPH): V[] | null {
  const near = seeds(g, from, hdg);
  const wide = () => seeds(g, from, hdg, true);
  return solve(from, to, near, g, true) ?? solve(from, to, near, g, false) ?? solve(from, to, wide(), g, true) ?? solve(from, to, wide(), g, false);
}

function solve(from: V, to: string, start: State[], g: TaxiGraph, pullOut: boolean): V[] | null {
  const goal = NODE_OF.get(to);
  if (goal === undefined || goal < 0 || !start.length) return null;
  const open = start.slice();
  const lineUp = destCat(to) ? g.nodes[goal] : null;
  const done = new Set<string>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const s = open.splice(bi, 1)[0];
    if (s.node === goal) {
      const pts: V[] = [];
      for (let x: State | null = s; x; x = x.parent) pts.unshift(...x.pts, ...(x.parent ? [] : [g.nodes[x.node]]));
      // drop repeats (a start on its own node)
      return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 0.05);
    }
    const key = `${s.prev}>${s.node}`;
    if (done.has(key)) continue;
    done.add(key);
    for (const n of g.adj[s.node]) {
      if (n === s.prev) continue;
      const d = unit(sub(g.nodes[n], g.nodes[s.node]));
      const turn = s.dir ? turnDeg(s.dir, d) : 0;
      if (turn > MAX_TURN) continue;
      if (lineUp && turn > LINEUP_TURN && dist(g.nodes[s.node], lineUp) < MIN_LINEUP) continue;
      if (pullOut && turn > LINEUP_TURN && dist(g.nodes[s.node], from) < MIN_PULL_OUT) continue;
      open.push({ node: n, prev: s.node, dir: d, cost: s.cost + dist(g.nodes[n], g.nodes[s.node]) + turn * TURN_COST, parent: s, pts: [g.nodes[n]] });
    }
  }
  return null;
}

/**
 * A corner-to-corner route as it is taxied and drawn: straight runs joined by circular arcs of radius r
 * (less where two corners are too close for it), sampled about every metre.
 */
export function smoothRoute(wp: V[], r = RADIUS, step = 1): V[] {
  // corners only: drop points in line with their neighbours
  const p: V[] = [];
  for (const q of wp) {
    if (p.length && dist(p[p.length - 1], q) < 0.05) continue;
    if (p.length >= 2 && turnDeg(unit(sub(p[p.length - 1], p[p.length - 2])), unit(sub(q, p[p.length - 1]))) < 0.5) p[p.length - 1] = q;
    else p.push(q);
  }
  if (p.length < 2) return p;
  const n = p.length;
  // tangent length wanted at each corner, cut back where neighbouring corners share too short a run
  const want = p.map((b, i) => (i === 0 || i === n - 1 ? 0 : r * Math.tan((turnDeg(unit(sub(b, p[i - 1])), unit(sub(p[i + 1], b))) * D) / 2)));
  const t = want.slice();
  for (let i = 0; i < n - 1; i++) {
    const L = dist(p[i], p[i + 1]);
    const need = want[i] + want[i + 1];
    if (need > L) {
      t[i] = Math.min(t[i], (want[i] * L) / need);
      t[i + 1] = Math.min(t[i + 1], (want[i + 1] * L) / need);
    }
  }
  const out: V[] = [];
  const run = (a: V, b: V) => {
    const L = dist(a, b);
    if (L < 0.01) {
      // two fillets meeting, or a fillet that starts on the route's first point: no straight between them
      if (!out.length) out.push(a);
      return;
    }
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = out.length ? 1 : 0; j <= k; j++) out.push(add(a, sub(b, a), j / k));
  };
  let cur = p[0];
  for (let i = 1; i < n - 1; i++) {
    const d1 = unit(sub(p[i], p[i - 1]));
    const d2 = unit(sub(p[i + 1], p[i]));
    const th = turnDeg(d1, d2) * D;
    if (t[i] < 0.05 || th < 1e-3) {
      run(cur, p[i]);
      cur = p[i];
      continue;
    }
    const t1 = add(p[i], d1, -t[i]);
    const rad = t[i] / Math.tan(th / 2);
    const left = cross(d1, d2) > 0 ? 1 : -1;
    const c = add(t1, [-d1[1], d1[0]], rad * left);
    run(cur, t1);
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    const k = Math.max(2, Math.ceil((rad * th) / step));
    for (let j = 1; j <= k; j++) out.push([c[0] + rad * Math.cos(a0 + (left * th * j) / k), c[1] + rad * Math.sin(a0 + (left * th * j) / k)]);
    cur = out[out.length - 1];
  }
  run(cur, p[n - 1]);
  return out;
}

const routeCache = new Map<string, V[] | null>();
/** The taxi route from where an aircraft is (and the way it points) to a destination, filleted; null if there is none. */
export function taxiRoute(from: V, to: string, hdg?: number): V[] | null {
  const key = `${from[0].toFixed(1)},${from[1].toFixed(1)},${hdg === undefined ? '' : Math.round(hdg / 10)},${to}`;
  if (routeCache.has(key)) return routeCache.get(key)!;
  const wp = taxiWaypoints(from, to, hdg);
  const r = wp ? smoothRoute(wp) : null;
  if (routeCache.size > 2000) routeCache.clear();
  routeCache.set(key, r);
  return r;
}

// ---------------------------------------------------------------- conflicts and the taxi plan

/** an aircraft's place on deck: position and heading (deg CCW from the bow) */
export interface DeckPose {
  id: string;
  x: number;
  y: number;
  a: number;
}

/** an aircraft in the way is its fuselage line, nose to tail: this far ahead of and behind its position (a Hornet is 17 m long) */
const SPINE = 8.5;
/** a route is blocked where its centreline passes this close to another aircraft's fuselage line (a folded wing, 4.2 m, and a margin) */
const CLEARANCE = 5;
/** a blocked aircraft holds this far short of where its route is blocked (its own nose is 8.5 m ahead of it) */
const HOLD_BACK = 5;
/** an aircraft this close to its spot has arrived */
const ARRIVED = 4;

const toSpine = (p: V, o: DeckPose): number => {
  const h = heading(o.a);
  const s = Math.max(-SPINE, Math.min(SPINE, dot(sub(p, [o.x, o.y]), h)));
  return dist(p, add([o.x, o.y], h, s));
};

/**
 * Where a route is first blocked: the index of the first point within CLEARANCE of another aircraft.
 * An aircraft the route starts beside counts only once the route closes on it (pulling away from a
 * neighbour is not a conflict).
 */
export function firstBlock(pts: V[], others: DeckPose[]): { i: number; by: string } | null {
  if (!pts.length) return null;
  const near = others.filter((o) => {
    // nowhere near the route: skip
    let lo = Infinity;
    for (let i = 0; i < pts.length; i += 4) lo = Math.min(lo, dist(pts[i], [o.x, o.y]));
    return lo < CLEARANCE + SPINE + 5;
  });
  const limit = near.map((o) => Math.min(CLEARANCE, toSpine(pts[0], o) - 0.5));
  for (let i = 1; i < pts.length; i++) for (let k = 0; k < near.length; k++) if (toSpine(pts[i], near[k]) < limit[k]) return { i, by: near[k].id };
  return null;
}

export const routeLength = (pts: V[]): number => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

export interface TaxiOrder {
  /** destination id (TAXI_DESTS) */
  to: string;
  /** when the instruction was given (ms): instructions are worked in this order */
  at: number;
}

export interface TaxiPlan {
  id: string;
  to: string;
  /** place in the sequence of instructions, from 1 */
  seq: number;
  /** already at its destination: nothing to draw */
  arrived: boolean;
  /** the route that is clear, and the rest of it beyond the first aircraft in the way (empty when clear throughout) */
  clear: V[];
  blocked: V[];
  blockedBy: string | null;
  /** where the aircraft in the way counts as being: where it is now, or where its own earlier instruction leaves it */
  blockedAt: V | null;
  /** metres: the whole route, and the clear part */
  len: number;
  clearLen: number;
  /** where this aircraft ends up: at its destination, or holding short of what blocks it */
  stop: DeckPose;
}

const poseAt = (id: string, pts: V[], i: number, fallback: number): DeckPose => {
  const p = pts[i];
  const q = pts[Math.max(0, i - 1)];
  const a = i > 0 && dist(p, q) > 1e-6 ? Math.atan2(p[1] - q[1], p[0] - q[0]) / D : fallback;
  return { id, x: p[0], y: p[1], a };
};

/**
 * Work the taxi instructions in the order they were given. Each aircraft's route is checked against
 * every other aircraft on deck: one with an earlier instruction counts where it will end up (its
 * destination, or holding short if its own route is blocked), the rest where they are now. So the
 * second aircraft sent to a catapult is clear up to the jet blast deflector and blocked beyond it, and
 * an aircraft parked across a route blocks it until it is moved or given an earlier instruction.
 */
export function planTaxi(jets: DeckPose[], orders: Record<string, TaxiOrder>): Map<string, TaxiPlan> {
  const here = new Map(jets.map((j) => [j.id, j]));
  const seq = Object.entries(orders)
    .filter(([id, o]) => here.has(id) && DEST.has(o.to))
    .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
  const place = new Map(here); // where each aircraft counts as an obstacle
  const out = new Map<string, TaxiPlan>();
  seq.forEach(([id, o], n) => {
    const j = here.get(id)!;
    const dest = DEST.get(o.to)!;
    const k = destCat(o.to);
    const arrived = k ? !!onCat([{ x: j.x, y: j.y }], k) : dist([j.x, j.y], dest.p) < ARRIVED;
    const pts = arrived ? null : taxiRoute([j.x, j.y], o.to, j.a);
    if (!pts || pts.length < 2) {
      out.set(id, { id, to: o.to, seq: n + 1, arrived: true, clear: [], blocked: [], blockedBy: null, blockedAt: null, len: 0, clearLen: 0, stop: j });
      return;
    }
    const others = [...place.values()].filter((x) => x.id !== id);
    const b = firstBlock(pts, others);
    const clear = b ? pts.slice(0, b.i + 1) : pts;
    const blocked = b ? pts.slice(b.i) : [];
    const clearLen = routeLength(clear);
    let stop: DeckPose;
    if (!b) {
      stop = poseAt(id, pts, pts.length - 1, j.a);
      // on a catapult it stands on the shuttle lined up with the track, whatever the last metre of route did
      if (k) {
        const [s0, s1] = CATS[k];
        stop = { id, x: s0[0], y: s0[1], a: Math.atan2(s1[1] - s0[1], s1[0] - s0[0]) / D };
      }
    } else {
      // back off along the clear part
      let i = b.i;
      for (let back = 0; i > 0 && back < HOLD_BACK; i--) back += dist(pts[i], pts[i - 1]);
      stop = i === 0 ? { ...j } : poseAt(id, pts, i, j.a);
    }
    const by = b ? place.get(b.by) : undefined;
    place.set(id, stop);
    out.set(id, { id, to: o.to, seq: n + 1, arrived: false, clear, blocked, blockedBy: b?.by ?? null, blockedAt: by ? [by.x, by.y] : null, len: routeLength(pts), clearLen, stop });
  });
  return out;
}
