/**
 * Catapult queues on the deck drawing, and how a destination is named in the deck card's text.
 *
 * A catapult is occupied while an aircraft stands on it (deck.ts onCat: whatever is there, sent there
 * or not). Its queue is the other aircraft whose taxi instruction ends at it, in the order the
 * instructions are worked (planTaxi: the order given, then the flights queued from the launch tab in
 * queue order). Each queued aircraft has a ghost; the occupant has none (it is drawn where it is). The
 * first ghost stands on the shuttle when the catapult is free, else behind the jet blast deflector,
 * where the next jet waits while the one ahead launches. The rest line up behind it, back down the
 * catapult's own line; where that runs off the deck or into the island, back down the taxi route onto
 * that catapult from the main artery. An aircraft that launches is no longer on deck, so the catapult
 * is free or the next one is on it, and the ghosts move up.
 */
import { CATS, NIMITZ as G, inPoly, type V } from './deck.ts';
import { DECK_SPOTS } from './deckSpots.gen.ts';
import { ROADS, destCat, taxiDest, taxiRoute, type TaxiPlan } from './taxiNet.ts';

const CAT_KEYS = ['1', '2', '3', '4'];
const D = Math.PI / 180;
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A destination's name for the deck card's text: a spot's number after a hyphen ("El 2 - 2",
 * "Bow stbd - 1"); a catapult's as it is ("CAT 2").
 */
export function destName(id: string | null | undefined): string {
  const s = DECK_SPOTS.find((q) => q.id === id);
  if (!s) return taxiDest(id)?.label ?? '';
  return s.label.startsWith(`${s.area} `) ? `${s.area} - ${s.label.slice(s.area.length + 1)}` : s.label;
}

export interface CatQueue {
  /** the aircraft standing on the catapult, if any */
  occupant: string | null;
  /** the aircraft sent to it and not yet on it, first to launch first */
  queue: string[];
}

/** each catapult's occupant (`occupants`: the aircraft on each catapult, deck.ts onCat) and queue */
export function catQueues(plans: Map<string, TaxiPlan>, occupants: Record<string, string | null | undefined> = {}): Record<string, CatQueue> {
  const out: Record<string, CatQueue> = Object.fromEntries(CAT_KEYS.map((k) => [k, { occupant: occupants[k] ?? null, queue: [] as string[] }]));
  const bySeq = [...plans.values()].sort((a, b) => a.seq - b.seq);
  for (const p of bySeq) {
    const k = destCat(p.to);
    if (k && !p.arrived && p.id !== out[k].occupant) out[k].queue.push(p.id);
  }
  return out;
}

/** ghosts stand this far apart, centre to centre: a Hornet's length (17.07 m) and a gap */
export const QUEUE_GAP = 19;
/** a Hornet's nose and tail from its position, metres */
const HALF = 8.5;
/** the next jet's nose waits this far aft of the jet blast deflector */
const JBD_CLEAR = 2;

const STRUCT = [G.struct['Island'], G.struct['Radar Mast']];
const clear = (p: V) => inPoly(p[0], p[1], G.outline) && !STRUCT.some((q) => inPoly(p[0], p[1], q));
/** can an aircraft stand at p pointing along u: nose, middle and tail on the deck and off the island */
const fits = (p: V, u: V) => [-HALF, 0, HALF].every((s) => clear([p[0] + u[0] * s, p[1] + u[1] * s]));

const catDir = (k: string): V => {
  const [a, b] = CATS[k];
  const L = dist(a, b);
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
};

const lanes = new Map<string, V[]>();
/**
 * Where a queue too long for the catapult's own line carries on, from the shuttle back: the taxi route
 * onto that catapult from the aft end of the main artery, reversed, a point every quarter metre.
 */
export function queueLane(k: string): V[] {
  let lane = lanes.get(k);
  if (!lane) {
    const r = taxiRoute(ROADS.find((x) => x.id === 'main')!.pts[0], `C${k}`);
    const pts = r && r.length > 1 ? r.slice().reverse() : [CATS[k][0]];
    lane = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / 0.25));
      for (let j = 1; j <= n; j++) lane.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * j) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * j) / n]);
    }
    lanes.set(k, lane);
  }
  return lane;
}

export interface QueueSpot {
  x: number;
  y: number;
  /** heading, deg CCW from the bow: along the catapult on its line, toward the catapult along the lane behind that */
  a: number;
}
export interface QueueGhost extends QueueSpot {
  /** the aircraft this ghost stands for */
  id: string;
  cat: string;
  /** place in the queue, from 0 */
  pos: number;
}

/** metres along catapult k from its shuttle (forward +) where the next jet waits behind the jet blast deflector: its nose JBD_CLEAR aft of it */
export const behindJbd = (k: string): number => {
  const u = catDir(k);
  const c0 = CATS[k][0];
  return Math.min(...G.jbd[k].map((q) => (q[0] - c0[0]) * u[0] + (q[1] - c0[1]) * u[1])) - JBD_CLEAR - HALF;
};

/**
 * Where the first n of a catapult's queue stand. The first: on the shuttle, or behind the jet blast
 * deflector when the catapult is occupied. Then straight behind it down the catapult's line, QUEUE_GAP
 * apart, for as long as an aircraft fits there (on the deck, off the island). Then back down the lane,
 * each at the first place QUEUE_GAP or more from every one before it (and from the occupant). The lane
 * ends at the aft end of the main artery: a queue longer than the deck has room for gets fewer than n.
 */
export function queueSpots(k: string, n: number, occupied = false): QueueSpot[] {
  const u = catDir(k);
  const a = Math.atan2(u[1], u[0]) / D;
  const c0 = CATS[k][0];
  const s0 = occupied ? behindJbd(k) : 0;
  const out: QueueSpot[] = [];
  for (let i = 0; out.length < n; i++) {
    const p: V = [c0[0] + u[0] * (s0 - QUEUE_GAP * i), c0[1] + u[1] * (s0 - QUEUE_GAP * i)];
    if (i > 0 && !fits(p, u)) break;
    out.push({ x: p[0], y: p[1], a });
  }
  if (out.length >= n) return out;
  const lane = queueLane(k);
  const taken: V[] = occupied ? [c0] : [];
  const far = (p: V) => out.every((s) => dist(p, [s.x, s.y]) >= QUEUE_GAP) && taken.every((q) => dist(p, q) >= QUEUE_GAP);
  let i = 1;
  for (; i < lane.length && out.length < n; i++) {
    if (!far(lane[i])) continue;
    out.push({ x: lane[i][0], y: lane[i][1], a: Math.atan2(lane[i - 1][1] - lane[i][1], lane[i - 1][0] - lane[i][0]) / D });
  }
  return out;
}

/** a ghost for every queued aircraft the deck has room for (none for an occupant) */
export function queueGhosts(queues: Record<string, CatQueue>): QueueGhost[] {
  return CAT_KEYS.flatMap((k) => {
    const q = queues[k];
    if (!q) return [];
    const spots = queueSpots(k, q.queue.length, !!q.occupant);
    return spots.map((s, pos) => ({ id: q.queue[pos], cat: k, pos, ...s }));
  });
}
