import { describe, expect, it } from 'vitest';
import { CATS, NIMITZ, inPoly, type V } from './deck.ts';
import { DECK_SPOTS } from './deckSpots.gen.ts';
import { QUEUE_GAP, behindJbd, catQueues, destName, onJbd, planRoute, queueGhosts } from './catQueue.ts';
import { TAXI_DESTS, planTaxi, routeLength, taxiDest, type DeckPose } from './taxiNet.ts';

const at = (id: string, spot: string): DeckPose => {
  const s = DECK_SPOTS.find((q) => q.id === spot)!;
  return { id, x: s.p[0], y: s.p[1], a: s.hdg };
};
const catDeg = (k: string) => (Math.atan2(CATS[k][1][1] - CATS[k][0][1], CATS[k][1][0] - CATS[k][0][0]) * 180) / Math.PI;
const onShuttle = (id: string, k: string): DeckPose => ({ id, x: CATS[k][0][0], y: CATS[k][0][1], a: catDeg(k) });

describe('destination names in the deck card text', () => {
  it("puts a spot's number after a hyphen only where its area's name ends in a number", () => {
    expect(destName('E22')).toBe('El 2 - 2');
    expect(destName('E22').toUpperCase()).toBe('EL 2 - 2');
    expect(destName('BS1')).toBe('Bow stbd 1');
    expect(destName('PA1')).toBe('Patio 1');
  });
  it('leaves catapults as they are, and names every destination', () => {
    expect(destName('C2')).toBe('CAT 2');
    for (const d of TAXI_DESTS) expect(destName(d.id)).toBe(d.kind === 'cat' || !/^El \d /.test(d.label) ? d.label : d.label.replace(/ (\S+)$/, ' - $1'));
    expect(destName(null)).toBe('');
    expect(destName('nowhere')).toBe('');
  });
  it('does not change the spots themselves', () => {
    expect(taxiDest('E22')!.label).toBe('El 2 2');
  });
});

describe('catapult queues', () => {
  const jets = [at('a', 'PA1'), at('b', 'E31'), at('c', 'SP1'), at('d', 'CO1'), at('e', 'BS3')];

  it('queues the aircraft sent to a catapult in the order their instructions were given', () => {
    const plans = planTaxi(jets, { c: { to: 'C2', at: 30 }, a: { to: 'C2', at: 10 }, b: { to: 'C2', at: 20 }, d: { to: 'C1', at: 5 }, e: { to: 'E22', at: 1 } });
    const q = catQueues(plans);
    expect(q['2']).toEqual({ occupant: null, queue: ['a', 'b', 'c'] });
    expect(q['1']).toEqual({ occupant: null, queue: ['d'] });
    expect(q['3'].queue).toEqual([]);
    expect(q['4'].queue).toEqual([]);
  });

  it('leaves the aircraft on the catapult out of the queue, sent there or not', () => {
    const plans = planTaxi([...jets, onShuttle('z', '2')], { a: { to: 'C2', at: 10 }, b: { to: 'C2', at: 20 }, z: { to: 'C2', at: 99 } });
    expect(plans.get('z')!.arrived).toBe(true);
    expect(catQueues(plans, { '2': 'z' })['2']).toEqual({ occupant: 'z', queue: ['a', 'b'] });
    // an AI jet DCS spotted there, with no instruction
    const ai = planTaxi([...jets, onShuttle('ai', '2')], { a: { to: 'C2', at: 10 } });
    expect(catQueues(ai, { '2': 'ai' })['2']).toEqual({ occupant: 'ai', queue: ['a'] });
    expect(queueGhosts(catQueues(ai, { '2': 'ai' }), ai).map((g) => g.id)).toEqual(['a']);
  });

  it('moves the queue up as aircraft launch', () => {
    const orders = { z: { to: 'C2', at: 5 }, a: { to: 'C2', at: 10 }, b: { to: 'C2', at: 20 } };
    const ghostsOf = (deck: DeckPose[], on: string | null) => {
      const plans = planTaxi(deck, orders);
      return queueGhosts(catQueues(plans, { '2': on }), plans);
    };
    // z on the catapult: a waits behind the jet blast deflector, b behind a
    const busy = ghostsOf([...jets, onShuttle('z', '2')], 'z');
    expect(busy.map((g) => [g.id, g.pos])).toEqual([['a', 0], ['b', 1]]);
    expect(noseAlong('2', busy[0])).toBeCloseTo(behindJbd('2') + 8.5, 3);
    // z launches: the catapult is free, a's ghost is on the shuttle, b's behind it
    const free = ghostsOf(jets, null);
    expect(free.map((g) => [g.id, g.pos])).toEqual([['a', 0], ['b', 1]]);
    expect([free[0].x, free[0].y]).toEqual(CATS['2'][0]);
    expect(free[0].a).toBeCloseTo(catDeg('2'), 6);
    // a taxis onto the catapult: it has no ghost, b waits behind the deflector where a waited
    const next = ghostsOf([...jets.filter((j) => j.id !== 'a'), onShuttle('a', '2')], 'a');
    expect(next.map((g) => [g.id, g.pos])).toEqual([['b', 0]]);
    expect(noseAlong('2', next[0])).toBeCloseTo(behindJbd('2') + 8.5, 3);
    expect(Math.hypot(next[0].x - busy[0].x, next[0].y - busy[0].y)).toBeLessThan(0.5);
  });
});

/** where p is on catapult k's line: s metres forward of the shuttle, o to port of the line */
function along(k: string, p: { x: number; y: number }) {
  const r = (catDeg(k) * Math.PI) / 180;
  const u: V = [Math.cos(r), Math.sin(r)];
  const c = CATS[k][0];
  return { s: (p.x - c[0]) * u[0] + (p.y - c[1]) * u[1], o: -(p.x - c[0]) * u[1] + (p.y - c[1]) * u[0], u };
}

/** where the nose of an aircraft at p (8.5 m ahead of it) is along catapult k's line */
const noseAlong = (k: string, g: { x: number; y: number; a: number }) => along(k, { x: g.x + Math.cos((g.a * Math.PI) / 180) * 8.5, y: g.y + Math.sin((g.a * Math.PI) / 180) * 8.5 }).s;

/** the nearest point of a polyline to p, the heading of its segment there and how far p is from it */
function onRoute(pts: V[], p: { x: number; y: number }) {
  let best = { d: Infinity, a: 0 };
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (L2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * (b[0] - a[0]) + (p.y - a[1]) * (b[1] - a[1])) / L2));
    const d = Math.hypot(p.x - (a[0] + (b[0] - a[0]) * t), p.y - (a[1] + (b[1] - a[1]) * t));
    if (d < best.d) best = { d, a: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
  }
  return best;
}
const angDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

describe('queue ghost positions', () => {
  /** aircraft parked aft, every one sent to catapult k in turn */
  const aft = ['E31', 'E32', 'PA1', 'PA2', 'ST1', 'PO2', 'SP5', 'SP6'];
  const sendAll = (k: string, occupied: boolean, spots = aft) => {
    const deck = [...spots.map((s, i) => at(`j${i}`, s)), ...(occupied ? [onShuttle('on', k)] : [])];
    const plans = planTaxi(deck, Object.fromEntries(spots.map((_, i) => [`j${i}`, { to: `C${k}`, at: i + 1 }])));
    return { plans, ghosts: queueGhosts(catQueues(plans, { [k]: occupied ? 'on' : null }), plans) };
  };

  it('stands the first on the shuttle, heading along the catapult, when the catapult is free', () => {
    for (const k of ['1', '2', '3', '4']) {
      const [g] = sendAll(k, false).ghosts;
      expect([g.x, g.y]).toEqual(CATS[k][0]);
      expect(g.a).toBeCloseTo(catDeg(k), 6);
    }
  });

  it('stands the first behind the jet blast deflector, clear of it, when the catapult is occupied', () => {
    for (const k of ['1', '2', '3', '4']) {
      const { plans, ghosts } = sendAll(k, true);
      const g = ghosts[0];
      const jbdAft = Math.min(...NIMITZ.jbd[k].map(([x, y]) => along(k, { x, y }).s));
      // its nose (8.5 m ahead of it, the way it is going) 2 m aft of the deflector, measured along the catapult
      // (the heading steps from one route point to the next, so on a bend it lands a little further back)
      expect(jbdAft - noseAlong(k, g)).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(jbdAft - noseAlong(k, g)).toBeLessThan(2.5);
      expect(along(k, g).s).toBeLessThan(jbdAft);
      // on its route, facing along it: the routes join the catapult line at a slant, so not always on the line
      const r = onRoute(planRoute(plans.get(g.id)!), g);
      expect(r.d).toBeLessThan(1e-6);
      expect(angDiff(g.a, r.a)).toBeLessThan(1e-6);
      expect(inPoly(g.x, g.y, NIMITZ.outline)).toBe(true);
    }
  });

  it("stands each on its own taxi route, facing along it, an aircraft length and more apart, further back the later it is in the queue", () => {
    for (const k of ['1', '2', '3', '4']) {
      for (const occupied of [false, true]) {
        const { plans, ghosts } = sendAll(k, occupied);
        expect(ghosts.map((g) => g.pos)).toEqual(ghosts.map((_, i) => i));
        const taken: { x: number; y: number }[] = occupied ? [{ x: CATS[k][0][0], y: CATS[k][0][1] }] : [];
        ghosts.forEach((g, i) => {
          const route = planRoute(plans.get(g.id)!);
          const r = onRoute(route, g);
          expect(r.d).toBeLessThan(1e-6);
          if (g.s > 0) expect(angDiff(g.a, r.a)).toBeLessThan(1e-6);
          // an aircraft nearer the catapult than its place waits where it is (its route's start)
          const home = g.s >= routeLength(route) - 1e-6;
          if (home) expect(Math.hypot(g.x - route[0][0], g.y - route[0][1])).toBeLessThan(1e-6);
          if (i > 0 && !home) {
            expect(g.s).toBeGreaterThanOrEqual(ghosts[i - 1].s + QUEUE_GAP - 1e-6);
            for (const o of taken) expect(Math.hypot(g.x - o.x, g.y - o.y)).toBeGreaterThanOrEqual(QUEUE_GAP - 1e-6);
          }
          taken.push(g);
        });
      }
    }
  });

  it('follows the route, not the catapult line: ghosts of aircraft coming from the side stand where their routes turn', () => {
    // the complaint: a straight line back from cat 2. Aircraft from the elevators come round onto it.
    const { ghosts } = sendAll('2', true, ['E31', 'E32', 'PA1', 'E21', 'E22']);
    expect(ghosts.length).toBe(5);
    expect(ghosts.some((g) => Math.abs(along('2', g).o) > 2)).toBe(true);
  });

  it('leaves an aircraft already closer to the catapult than its place in the queue where it is', () => {
    // 'near' stands on cat 1's line 12 m short of the shuttle, sent after two from the stern
    const u = along('1', { x: 0, y: 0 }).u;
    const near: DeckPose = { id: 'near', x: CATS['1'][0][0] - u[0] * 12, y: CATS['1'][0][1] - u[1] * 12, a: catDeg('1') };
    const plans = planTaxi([at('far1', 'E31'), at('far2', 'PA1'), near], { far1: { to: 'C1', at: 1 }, far2: { to: 'C1', at: 2 }, near: { to: 'C1', at: 3 } });
    const g = queueGhosts(catQueues(plans), plans).find((x) => x.id === 'near')!;
    expect(g.pos).toBe(2);
    expect(Math.hypot(g.x - near.x, g.y - near.y)).toBeLessThan(1e-6);
  });

  it('gives a ghost only to queued aircraft with a plan, each on its own catapult', () => {
    const plans = planTaxi([at('a', 'PA1'), at('b', 'E31'), at('d', 'CO1')], { a: { to: 'C2', at: 1 }, b: { to: 'C2', at: 2 }, d: { to: 'C1', at: 3 } });
    const e = { occupant: null, queue: [] };
    const ghosts = queueGhosts({ '1': { occupant: null, queue: ['d'] }, '2': { occupant: 'x', queue: ['a', 'nope', 'b'] }, '3': e, '4': e }, plans);
    expect(ghosts.map((g) => `${g.id}:${g.cat}:${g.pos}`)).toEqual(['d:1:0', 'a:2:0', 'b:2:1']);
  });
});

describe('queue ghosts stand clear of the jet blast deflectors', () => {
  it('never puts a waiting aircraft on any JBD, whichever spots the queue comes from (free or occupied catapult)', () => {
    const spots = DECK_SPOTS.map((s) => s.id);
    for (const k of ['1', '2', '3', '4'])
      for (let i = 0; i + 3 <= spots.length; i += 3) {
        const jets = [0, 1, 2].map((n) => at(`j${n}`, spots[i + n]));
        const orders = Object.fromEntries(jets.map((j, n) => [j.id, { to: `C${k}`, at: n }]));
        for (const occ of [false, true]) {
          const all = occ ? [...jets, onShuttle('occ', k)] : jets;
          const plans = planTaxi(all, orders);
          const ghosts = queueGhosts(catQueues(plans, occ ? { [k]: 'occ' } : {}), plans);
          for (const g of ghosts) if (g.s > 0) expect(onJbd([g.x, g.y], g.a), `cat ${k} ${occ ? 'occupied' : 'free'} ${g.id} from ${spots[i + Number(g.id.slice(1))]}`).toBe(false);
        }
      }
  });
});
