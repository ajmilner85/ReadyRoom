/**
 * Nimitz flight deck for PriFly: the geometry (nimitzDeck.gen.ts, generated from the hand trace over the
 * DCS model and the Supercarrier taxi recordings: scripts/catcc/nimitz-deck.py), drawing helpers, the
 * F/A-18C planform, live aircraft placed on the deck, and the DCS deck-crew taxi routes.
 * Deck coordinates: metres, x forward, y to port, origin = the DCS unit reference point (where the hook
 * reports the ship). The drawing puts the bow right and port up: SVG (x, -y).
 */
import type { ScopeTrack, Carrier, Picture } from '../scopeModel.ts';
import { NIMITZ_DECK as G, NIMITZ_TAXI } from './nimitzDeck.gen.ts';

export type V = [number, number];
export { G as NIMITZ };

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const P = (p: V) => `${f(p[0])},${f(-p[1])}`;
/** open polyline as SVG path data */
export const line = (q: V[]) => `M${q.map(P).join('L')}`;
/** closed polygon as SVG path data */
export const ring = (q: V[]) => `M${q.map(P).join('L')}Z`;
export const centroid = (q: V[]): V => {
  const n = q.length;
  return [q.reduce((s, p) => s + p[0], 0) / n, q.reduce((s, p) => s + p[1], 0) / n];
};

// ---------------------------------------------------------------- drawing layers

export type DeckLayer = 'areas' | 'helo' | 'wires' | 'spots' | 'routes' | 'gear';
export const DECK_LAYERS: { k: DeckLayer; label: string; title: string }[] = [
  { k: 'areas', label: 'Areas', title: 'Deck parking areas: Crotch, Point, Corral, Junk Yard, Patio, Finger, Box, Street, Six-pack' },
  { k: 'spots', label: 'DCS spots', title: 'The 16 parking spots DCS taxis recovered aircraft to' },
  { k: 'routes', label: 'DCS routes', title: 'Every Supercarrier deck-crew taxi route: launch (to the catapults) and recovery (to the parking spots)' },
  { k: 'wires', label: 'Wires', title: 'Arresting wire numbers' },
  { k: 'helo', label: 'Helo spots', title: 'Helicopter landing spots' },
  { k: 'gear', label: 'Equipment', title: 'LSO platform, IFLOLS, shooter bubble, weapons elevators, barricade stanchions' },
];

/** the drawing's frame: stern to bow plus label room; port edge to starboard edge plus the scale bar */
export const DECK_VIEWBOX = '-172 -47 348 96';

/** a polygon's area centroid (the vertex average leans toward wherever the trace has more points) */
export const areaCentroid = (q: V[]): V => {
  const r = q.length > 2 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1] ? q.slice(0, -1) : q;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return Math.abs(a) < 1e-9 ? centroid(r) : [cx / (3 * a), cy / (3 * a)];
};

/** closed polygon with its corners filleted (radius r, metres, limited to half of each edge) as SVG path data */
export const roundRing = (q: V[], r: number): string => {
  const p = q.length > 2 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1] ? q.slice(0, -1) : q;
  const n = p.length;
  const pt = (v: V) => `${f(v[0])},${f(-v[1])}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, la / 2, lc / 2);
    const s: V = [b[0] + ((a[0] - b[0]) / la) * k, b[1] + ((a[1] - b[1]) / la) * k];
    const e: V = [b[0] + ((c[0] - b[0]) / lc) * k, b[1] + ((c[1] - b[1]) / lc) * k];
    d += `${i ? 'L' : 'M'}${pt(s)}Q${pt(b)} ${pt(e)}`;
  }
  return d + 'Z';
};

/** catapult tracks, aft end (shuttle start) first */
export const CATS: Record<string, V[]> = G.cats;

// ---------------------------------------------------------------- F/A-18C planform
const mir = (p: V[]): V[] => p.concat(p.slice().reverse().map((q) => [-q[0], q[1]] as V));
const ST: V[] = [[0.5,0.001],[0.485,0.008],[0.46,0.015],[0.43,0.021],[0.40,0.025],[0.36,0.027],[0.30,0.03],[0.22,0.038],[0.12,0.046],[0,0.054],[-0.12,0.068],[-0.22,0.082],[-0.30,0.084],[-0.38,0.078],[-0.44,0.066],[-0.48,0.056]];
const W0: V[] = [[0.027,0.30],[0.036,0.277],[0.043,0.255],[0.048,0.23],[0.052,0.2],[0.057,0.165],[0.063,0.13],[0.069,0.1],[0.074,0.07],[0.079,0.04],[0.082,0.015],[0.084,-0.02]];
const WS: V[] = W0.concat([[0.352,-0.143],[0.352,-0.255],[0.086,-0.262],[0.07,-0.265]]);
const WF: V[] = W0.concat([[0.245,-0.094],[0.245,-0.258],[0.086,-0.262],[0.07,-0.265]]);
const STAB: V[] = [[0.05,-0.31],[0.198,-0.462],[0.206,-0.476],[0.207,-0.5],[0.2,-0.522],[0.19,-0.527],[0.058,-0.476]];
const area = (q: V[]) => q.reduce((a, p, i) => { const n = q[(i + 1) % q.length]; return a + p[0] * n[1] - n[0] * p[1]; }, 0);
const norm = (q: V[]) => (area(q) < 0 ? q.slice().reverse() : q);
const FUS = mir(ST.map((s) => [s[1], s[0]] as V));
export const SPREAD = [FUS, mir(WS), mir(STAB)].map(norm);
export const FOLDED = [FUS, mir(WF), mir(STAB)].map(norm);

/** Planform on the deck (metres): x forward, y port, angle a (deg, CCW from bow). */
export function jetShape(polys: V[][], x: number, y: number, a: number, L = 17.07): string {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return polys.map((q) => 'M' + q.map((p) => { const fx = p[1] * L; const py = p[0] * L; return f(x + c * fx - s * py) + ',' + f(-(y + s * fx + c * py)); }).join('L') + 'Z').join('');
}

/** Planform as an icon (px, nose up) for the LSO pattern view. */
export function hornetIcon(IL = 30): string {
  return [FUS, mir(WS), mir(STAB)].map(norm).map((q) => 'M' + q.map((p) => f(p[0] * IL) + ' ' + f(-p[1] * IL)).join('L') + 'Z').join('');
}

// ---------------------------------------------------------------- live aircraft on deck

const M_PER_NM = 1852;

export interface DeckJet {
  t: ScopeTrack;
  x: number;
  y: number;
  /** heading relative to the bow, deg CCW (deck drawing convention) */
  a: number;
  moving: boolean;
}

export function onDeck(c: Carrier, air: ScopeTrack[]): DeckJet[] {
  const D = Math.PI / 180;
  // the deck is laid out along the ship's head, not its course over the ground
  const head = c.track.hdg ?? c.ship.brc;
  const h = head * D;
  const fwd: V = [Math.sin(h), -Math.cos(h)];
  const port: V = [fwd[1], -fwd[0]]; // left of the bow (heading - 90 deg) in scope coords
  const out: DeckJet[] = [];
  for (const t of air) {
    const dx = (t.p[0] - c.track.p[0]) * M_PER_NM;
    const dy = (t.p[1] - c.track.p[1]) * M_PER_NM;
    if (Math.hypot(dx, dy) > 200) continue;
    if (t.air === true || t.alt > 200) continue;
    const x = dx * fwd[0] + dy * fwd[1];
    const y = dx * port[0] + dy * port[1];
    const rel = (((t.hdg ?? head) - head + 540) % 360) - 180;
    const relSpeed = Math.abs((t.gs ?? 0) - (c.track.gs ?? 0));
    out.push({ t, x, y, a: -rel, moving: relSpeed > 3 });
  }
  return out;
}

const inPoly = (x: number, y: number, q: V[]) => {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i];
    const [xj, yj] = q[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Inside the landing area (its painted outer borders, stern to the waist round-down)? */
export const inLandingArea = (x: number, y: number): boolean => inPoly(x, y, G.la.outer);

/** The jet spotted on a catapult: on its track, from just aft of the shuttle to 25 m up it. */
export function onCat(jets: DeckJet[], k: string): DeckJet | undefined {
  const [a, b] = G.cats[k];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: V = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return jets.find((j) => {
    const s = (j.x - a[0]) * u[0] + (j.y - a[1]) * u[1];
    const o = Math.abs((j.x - a[0]) * -u[1] + (j.y - a[1]) * u[0]);
    return s > -8 && s < 25 && o < 5;
  });
}

/** Jets on the focus carrier's deck, those in the landing area, and what's spotted on each catapult. */
export function deckStatus(pic: Picture) {
  const fc = pic.focus;
  if (!fc) return null;
  const jets = onDeck(fc, [...pic.air, ...(pic.ground ?? [])]);
  const foul = jets.filter((j) => inLandingArea(j.x, j.y));
  const cats = Object.fromEntries(['1', '2', '3', '4'].map((k) => [k, onCat(jets, k)]));
  return { jets, foul, cats };
}

// ---------------------------------------------------------------- DCS deck-crew taxi routes

export interface TaxiRoute {
  kind: 'to' | 'park';
  /** DCS parking / spawn spot index (1-16) */
  spot: number;
  /** catapult a launch route ends at */
  cat?: string;
  pts: V[];
}
export const TAXI_ROUTES: TaxiRoute[] = [
  ...NIMITZ_TAXI.to.map((r) => ({ kind: 'to' as const, spot: r.spot, cat: r.cat, pts: r.pts })),
  ...NIMITZ_TAXI.park.map((r) => ({ kind: 'park' as const, spot: r.spot, pts: r.pts })),
];

/** nearest point on a polyline: the point, its distance, the index of the segment it lies on and the segment's direction */
export function nearestOn(q: V[], p: V): { at: V; d: number; i: number; dir: V } {
  let best = { at: q[0], d: Infinity, i: 0, dir: [1, 0] as V };
  for (let i = 0; i < q.length - 1; i++) {
    const [a, b] = [q[i], q[i + 1]];
    const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2));
    const at: V = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    const L = Math.sqrt(L2);
    if (d < best.d) best = { at, d, i, dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
  }
  return best;
}

const tail = (q: V[], n: { at: V; i: number }): V[] => [n.at, ...q.slice(n.i + 1)];

/**
 * The way the deck crew would take a jet from where it is to a catapult: join the nearest DCS launch
 * route for that catapult and follow it to the hold-short behind the JBD, then onto the shuttle.
 */
export function taxiToCat(from: V, k: string): V[] {
  let best: { r: TaxiRoute; n: ReturnType<typeof nearestOn> } | null = null;
  for (const r of TAXI_ROUTES) {
    if (r.kind !== 'to' || r.cat !== k) continue;
    const n = nearestOn(r.pts, from);
    if (!best || n.d < best.n.d) best = { r, n };
  }
  const shuttle = G.cats[k][0];
  if (!best) return [from, shuttle];
  return [from, ...tail(best.r.pts, best.n), shuttle];
}

/**
 * Where a taxiing jet is likely headed: the DCS route it is on (within 6 m, running the way the jet
 * points), from the jet onward; null when it's on none.
 */
export function routeAhead(j: { x: number; y: number; a: number }): { route: TaxiRoute; pts: V[] } | null {
  const r = (j.a * Math.PI) / 180;
  const h: V = [Math.cos(r), Math.sin(r)];
  let best: { route: TaxiRoute; n: ReturnType<typeof nearestOn> } | null = null;
  for (const route of TAXI_ROUTES) {
    const n = nearestOn(route.pts, [j.x, j.y]);
    if (n.d > 6 || n.dir[0] * h[0] + n.dir[1] * h[1] < 0.5) continue;
    if (!best || n.d < best.n.d) best = { route, n };
  }
  if (!best) return null;
  const pts = tail(best.route.pts, best.n);
  if (best.route.cat) pts.push(G.cats[best.route.cat][0]);
  return { route: best.route, pts: [[j.x, j.y], ...pts] };
}
