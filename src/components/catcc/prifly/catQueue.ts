/**
 * Catapult queues on the deck drawing, and how a destination is named in the deck card's text.
 *
 * A catapult is occupied while an aircraft stands on it (deck.ts onCat: whatever is there, sent there
 * or not). Its queue is the other aircraft whose taxi instruction ends at it, in the order the
 * instructions are worked (planTaxi: the order given, then the aircraft of flights queued from the
 * launch tab in queue order). Each queued aircraft has a ghost; the occupant has none (it is drawn where
 * it is). A ghost stands on the aircraft's own taxi route into the catapult (its plan), where it waits
 * its turn, facing along the route, drawn with the wings folded. The first stands on the shuttle when
 * the catapult is free, else behind the jet blast deflector, where the next jet waits while the one
 * ahead launches; the rest stand back along their routes, an aircraft length and a gap apart. An
 * aircraft that launches is no longer on deck, so the catapult is free or the next one is on it, and
 * the ghosts move up.
 */
import { CATS, NIMITZ as G, type V } from './deck.ts';
import { DECK_SPOTS } from './deckSpots.gen.ts';
import { destCat, routeLength, taxiDest, type TaxiPlan } from './taxiNet.ts';

const CAT_KEYS = ['1', '2', '3', '4'];
const D = Math.PI / 180;
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A destination's name for the deck card's text: the spot's number after a hyphen where its area's
 * name has a number of its own ("El 2 - 2"), else as it is ("Patio 1", "Stbd bow 1"); a catapult's as
 * it is ("CAT 2").
 */
export function destName(id: string | null | undefined): string {
  const s = DECK_SPOTS.find((q) => q.id === id);
  if (!s) return taxiDest(id)?.label ?? '';
  // (the hyphen only where the area's name ends in a number of its own: "El 2 - 2", but "Patio 1")
  return /\d$/.test(s.area) && s.label.startsWith(`${s.area} `) ? `${s.area} - ${s.label.slice(s.area.length + 1)}` : s.label;
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

/** ghosts stand at least this far apart, centre to centre: a Hornet's length (17.07 m) and a gap */
export const QUEUE_GAP = 19;
/** a Hornet's nose from its position, metres */
const HALF = 8.5;
/** the next jet's nose waits this far aft of the jet blast deflector */
const JBD_CLEAR = 2;
/** how far a ghost is moved back along its route at a time to clear the ones ahead of it, metres */
const STEP = 0.25;

const catDir = (k: string): V => {
  const [a, b] = CATS[k];
  const L = dist(a, b);
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
};

export interface QueueGhost {
  /** the aircraft this ghost stands for */
  id: string;
  cat: string;
  /** place in the queue, from 0 */
  pos: number;
  x: number;
  y: number;
  /** heading, deg CCW from the bow: the way the aircraft is going there, toward the catapult */
  a: number;
  /** metres back along its route from the shuttle */
  s: number;
}

/** metres along catapult k from its shuttle (forward +) where the next jet waits behind the jet blast deflector: its nose JBD_CLEAR aft of it */
export const behindJbd = (k: string): number => {
  const u = catDir(k);
  const c0 = CATS[k][0];
  return Math.min(...G.jbd[k].map((q) => (q[0] - c0[0]) * u[0] + (q[1] - c0[1]) * u[1])) - JBD_CLEAR - HALF;
};

/** a taxi plan's whole route, from the aircraft to its destination (the clear part and the rest) */
export const planRoute = (p: TaxiPlan): V[] => [...p.clear, ...p.blocked.slice(1)];

/** a route walked back from its end: the point s metres back from it (clamped to the route), and the heading of travel there */
/** a folded Hornet's half-width, metres (folded span 8.4 m) */
const HALF_W = 2.1;
const JBDS = Object.values(G.jbd);
const inside = (p: V, q: V[]) => {
  let c = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) if (q[i][1] > p[1] !== q[j][1] > p[1] && p[0] < ((q[j][0] - q[i][0]) * (p[1] - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]) c = !c;
  return c;
};
/** would an aircraft standing at p, heading a (deg), cover any part of a jet blast deflector */
export function onJbd(p: V, a: number): boolean {
  const u: V = [Math.cos(a * D), Math.sin(a * D)];
  const n: V = [-u[1], u[0]];
  for (let s = -HALF; s <= HALF + 1e-9; s += 1)
    for (const w of [-HALF_W, 0, HALF_W]) {
      const q: V = [p[0] + u[0] * s + n[0] * w, p[1] + u[1] * s + n[1] * w];
      if (JBDS.some((j) => inside(q, j))) return true;
    }
  return false;
}

function backAlong(route: V[], s: number): { p: V; a: number } {
  let left = Math.max(0, s);
  for (let i = route.length - 1; i > 0; i--) {
    const b = route[i];
    const a = route[i - 1];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    const hdg = Math.atan2(b[1] - a[1], b[0] - a[0]) / D;
    if (left <= L) {
      const t = left / L;
      return { p: [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t], a: hdg };
    }
    left -= L;
  }
  const a = route.length > 1 ? Math.atan2(route[1][1] - route[0][1], route[1][0] - route[0][0]) / D : 0;
  return { p: route[0], a };
}

/**
 * How far back along a route into catapult k the next aircraft waits while the catapult is occupied:
 * the first place, back from the shuttle, where its nose (HALF ahead of it, the way it is going) is
 * JBD_CLEAR aft of the jet blast deflector, measured along the catapult. (Routes join the catapult's
 * line at a slant, often only a few metres short of the shuttle, so this is not always on the line.)
 */
function jbdWait(k: string, route: V[], len: number): number {
  const u = catDir(k);
  const c0 = CATS[k][0];
  const limit = behindJbd(k) + HALF;
  const aft = (s: number) => {
    const { p, a } = backAlong(route, s);
    const n: V = [p[0] + Math.cos(a * D) * HALF, p[1] + Math.sin(a * D) * HALF];
    return (n[0] - c0[0]) * u[0] + (n[1] - c0[1]) * u[1] <= limit;
  };
  let s = 0;
  while (s < len && !aft(s)) s += 1;
  if (s >= len) return len;
  // the place lies within the last metre: home in on it
  let lo = Math.max(0, s - 1);
  let hi = s;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (aft(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/**
 * A ghost for every aircraft in a catapult's queue: where it waits on the route it is taxiing into the
 * catapult (its taxi plan), facing the way it goes. The first stands on the shuttle when the catapult is
 * free, else behind the jet blast deflector. Each after it stands QUEUE_GAP further back along its own
 * route than the one ahead, and further still where that is closer than QUEUE_GAP to a ghost ahead of
 * it or to the occupant (routes joining from different sides). An aircraft already closer to the
 * catapult than its place in the queue waits where it is. An aircraft with no plan gets no ghost.
 */
export function queueGhosts(queues: Record<string, CatQueue>, plans: Map<string, TaxiPlan>): QueueGhost[] {
  return CAT_KEYS.flatMap((k) => {
    const q = queues[k];
    if (!q) return [];
    const u = catDir(k);
    const shuttleHdg = Math.atan2(u[1], u[0]) / D;
    const taken: V[] = q.occupant ? [CATS[k][0]] : [];
    const out: QueueGhost[] = [];
    let want = 0;
    q.queue.forEach((id) => {
      const plan = plans.get(id);
      const route = plan ? planRoute(plan) : [];
      if (route.length < 2) return;
      const len = routeLength(route);
      const pos = out.length;
      if (pos === 0 && q.occupant) want = jbdWait(k, route, len);
      let s = Math.min(want, len);
      let at = backAlong(route, s);
      if (s > 0 || pos > 0) {
        const far = (p: V) => [...taken, ...out.map((g): V => [g.x, g.y])].every((o) => dist(p, o) >= QUEUE_GAP - 1e-6);
        // nor does it wait on a jet blast deflector (any catapult's): it stands clear, further back
        while (s < len && (!far(at.p) || onJbd(at.p, at.a))) {
          s = Math.min(len, s + STEP);
          at = backAlong(route, s);
        }
      }
      // on the shuttle it stands lined up with the track, wherever the last metre of route ends
      const g: QueueGhost = s === 0 ? { id, cat: k, pos, x: CATS[k][0][0], y: CATS[k][0][1], a: shuttleHdg, s } : { id, cat: k, pos, x: at.p[0], y: at.p[1], a: at.a, s };
      out.push(g);
      want = s + QUEUE_GAP;
    });
    return out;
  });
}

