import { describe, expect, it } from 'vitest';
import { CATS, NIMITZ, inPoly, type V } from './deck.ts';
import { ROADS, TAXI_DESTS, TAXI_GRAPH, firstBlock, planTaxi, routeLength, smoothRoute, taxiDest, taxiRoute, taxiWaypoints, type DeckPose } from './taxiNet.ts';
import { taxiOrders, withLaunch, withTaxi } from './launch.ts';
import { cleanOpsPatch } from '../../../catcc/core/room/ops.ts';

const at = (id: string): V => taxiDest(id)!.p;
const route = (from: string, to: string) => taxiRoute(at(from), to)!;
/** the main artery's line (taxiNet.ts: art) */
const artY = (x: number) => -15.5 + ((x + 100) * 7) / 120;
const onArtery = (pts: V[], x0: number, x1: number) => pts.filter((p) => p[0] > x0 && p[0] < x1).every((p) => Math.abs(p[1] - artY(p[0])) < 0.05);
const pose = (id: string, x: number, y: number, a = 0): DeckPose => ({ id, x, y, a });
const parked = (id: string, spot: string, a = 90): DeckPose => pose(id, at(spot)[0], at(spot)[1], a);
const turn = (a: V, b: V, c: V) => {
  const u = [b[0] - a[0], b[1] - a[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))))) * 180) / Math.PI;
};

describe('taxi network', () => {
  it('has every destination on a road, on the deck, and reachable from every other', () => {
    expect(TAXI_DESTS.map((d) => d.id)).toEqual(expect.arrayContaining(['C1', 'C2', 'C3', 'C4', 'E1F', 'E2A', 'E3F', 'E4A', 'COR', 'PA1', 'JY1', 'PT1', 'BOX', 'CR1', 'FGR']));
    for (const d of TAXI_DESTS) {
      expect(TAXI_GRAPH.nodes.some((n) => Math.hypot(n[0] - d.p[0], n[1] - d.p[1]) < 0.25), d.id).toBe(true);
      expect(inPoly(d.p[0], d.p[1], NIMITZ.outline), d.id).toBe(true);
    }
    for (const a of TAXI_DESTS) for (const b of TAXI_DESTS) if (a !== b) expect(taxiWaypoints(a.p, b.id), `${a.id} -> ${b.id}`).not.toBeNull();
  });

  it('keeps every road on the deck and clear of the island', () => {
    for (const r of ROADS) {
      const pts = smoothRoute(r.pts, 0);
      for (const p of pts) {
        expect(inPoly(p[0], p[1], NIMITZ.outline), `${r.id} at ${p}`).toBe(true);
        expect(inPoly(p[0], p[1], NIMITZ.struct['Island']), `${r.id} at ${p}`).toBe(false);
      }
    }
  });

  it('sends everything from the stern to the bow catapults up the one artery', () => {
    for (const [from, to] of [['E3F', 'C1'], ['E3A', 'C2'], ['PA1', 'C1'], ['PA3', 'C2'], ['JY1', 'C1'], ['E2A', 'C2']]) {
      const r = route(from, to);
      // from clear of its own feeder's fillet to short of the bow fan
      const x0 = Math.max(-60, at(from)[0] + 12);
      expect(onArtery(r, x0, 10), `${from} -> ${to}`).toBe(true);
      expect(r.some((p) => p[0] > x0 && p[0] < 10)).toBe(true);
      expect(r[r.length - 1]).toEqual(CATS[to[1]][0]);
    }
  });

  it('arrives at a catapult lined up with its track', () => {
    for (const [from, k] of [['E3F', '1'], ['E3F', '2'], ['PA2', '3'], ['E3A', '4'], ['E4A', '3'], ['E1F', '1']]) {
      const r = route(from, `C${k}`);
      const [a, b] = CATS[k];
      const last = r[r.length - 1];
      const prev = r[r.length - 4];
      const d = Math.abs(Math.atan2(last[1] - prev[1], last[0] - prev[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * (180 / Math.PI);
      expect(d, `${from} -> CAT ${k}`).toBeLessThan(1);
    }
  });

  it('shares the waist crossing between the patio and EL 3; EL 4 reaches the waist catapults without it', () => {
    const crossing = (r: V[]) => r.filter((p) => p[1] > -8 && p[1] < 10);
    const a = crossing(route('PA2', 'C3'));
    const b = crossing(route('E3A', 'C4'));
    const c = crossing(route('E3F', 'C3'));
    expect(a.length).toBeGreaterThan(10);
    // the same line across the landing area: every point of one is on the others' path
    const near = (p: V, r: V[]) => r.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.75);
    expect(a.every((p) => near(p, b))).toBe(true);
    expect(c.every((p) => near(p, a))).toBe(true);
    // EL 4: stays on the port side of the landing area
    for (const [from, to] of [['E4F', 'C3'], ['E4A', 'C3'], ['E4F', 'C4'], ['E4A', 'C4'], ['FGR', 'C3']]) expect(route(from, to).every((p) => p[1] > 10), `${from} -> ${to}`).toBe(true);
  });

  it('fillets the corners: no route between spots turns sharper than a 2.5 m radius, most far gentler', () => {
    let sharp = 0;
    for (const a of TAXI_DESTS)
      for (const b of TAXI_DESTS) {
        if (a === b) continue;
        const r = taxiRoute(a.p, b.id)!;
        let worst = 0;
        for (let i = 1; i < r.length - 1; i++) worst = Math.max(worst, turn(r[i - 1], r[i], r[i + 1]));
        expect(worst, `${a.id} -> ${b.id}`).toBeLessThan(24); // degrees per ~1 m step
        if (worst > 12) sharp++;
      }
    expect(sharp).toBeLessThan(120);
  });

  it('smooths a right-angle corner into an arc of the asked radius', () => {
    const r = smoothRoute([[0, 0], [20, 0], [20, 20]], 8);
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([20, 20]);
    // the arc's middle is r(√2 - 1) inside the corner
    const d = Math.min(...r.map((p) => Math.hypot(p[0] - 20, p[1])));
    expect(d).toBeCloseTo(8 * (Math.SQRT2 - 1), 1);
    expect(routeLength(r)).toBeCloseTo(40 - 16 + 4 * Math.PI, 0);
  });

  it('brings an aircraft that is on no spot to the nearest sensible entry, starting from where it is', () => {
    // loose near the foul line abeam the island: joins the artery heading forward, not back through a spot
    const from: V = [-60, -2];
    const r = taxiRoute(from, 'C1', 190)!;
    expect(r[0]).toEqual(from);
    expect(r[r.length - 1]).toEqual(CATS['1'][0]);
    expect(routeLength(r)).toBeLessThan(150);
    expect(onArtery(r, -30, 10)).toBe(true);
    // rolled out in the landing area, sent to the patio: out to starboard and aft down the artery
    const la = taxiRoute([-40, 10.1], 'PA2', 9.78)!;
    expect(la[la.length - 1]).toEqual(at('PA2'));
    expect(routeLength(la)).toBeLessThan(140);
    // an AI-parked jet a few metres inboard of an elevator spot starts from that spot's feeder
    const ai = taxiRoute([-101.62, -29.84], 'C3', -90)!;
    expect(ai[0]).toEqual([-101.62, -29.84]);
    expect(Math.abs(ai[5][0] + 102.4)).toBeLessThan(1);
  });
});

describe('taxi conflicts', () => {
  it('finds the first aircraft in the way, not one the route merely starts beside', () => {
    const r = route('E3F', 'C1');
    expect(firstBlock(r, [])).toBeNull();
    // parked across the artery ahead
    const b = firstBlock(r, [pose('x', 0, -9.7, 90)])!;
    expect(b.by).toBe('x');
    expect(r[b.i][0]).toBeGreaterThan(-20);
    expect(r[b.i][0]).toBeLessThan(0);
    // wing to wing on the next elevator spot, and well clear of the artery: not in the way
    expect(firstBlock(r, [parked('n', 'E3A'), parked('m', 'E2A')])).toBeNull();
  });

  it('works instructions in order: the second jet to a catapult is clear to behind the first', () => {
    const jets = [parked('a', 'E3F'), parked('b', 'E3A'), parked('c', 'E2A')];
    const plans = planTaxi(jets, { a: { to: 'C1', at: 1 }, b: { to: 'C1', at: 2 }, c: { to: 'C2', at: 3 } });
    const [a, b, c] = ['a', 'b', 'c'].map((k) => plans.get(k)!);
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(a.blockedBy).toBeNull();
    expect(a.blocked).toEqual([]);
    expect(a.clearLen).toBeCloseTo(a.len, 5);
    expect([a.stop.x, a.stop.y]).toEqual(CATS['1'][0]);
    // b is not blocked by a parked beside it (a goes first), only by a on the catapult
    expect(b.blockedBy).toBe('a');
    expect(b.len - b.clearLen).toBeGreaterThan(8);
    expect(b.len - b.clearLen).toBeLessThan(20);
    expect(b.blockedAt).toEqual(CATS['1'][0]);
    expect(b.clear[b.clear.length - 1]).toEqual(b.blocked[0]);
    // it holds a fuselage length behind the first, nose clear of its tail
    expect(Math.hypot(b.stop.x - a.stop.x, b.stop.y - a.stop.y)).toBeGreaterThan(17);
    // c, to the other catapult, is clear past both
    expect(c.blockedBy).toBeNull();
  });

  it('is blocked by an aircraft parked on the route until that one is given an earlier instruction', () => {
    const jets = [parked('a', 'E3F'), pose('p', 7.56, -10.5, 132)]; // DCS spawn spot 2 sits on the artery
    const alone = planTaxi(jets, { a: { to: 'C1', at: 5 } }).get('a')!;
    expect(alone.blockedBy).toBe('p');
    expect(alone.clearLen).toBeGreaterThan(60);
    expect(alone.clearLen).toBeLessThan(alone.len - 30);
    const after = planTaxi(jets, { p: { to: 'C2', at: 1 }, a: { to: 'C1', at: 5 } }).get('a')!;
    expect(after.blockedBy).toBeNull();
    // given the other way round, the parked jet still counts where it is
    expect(planTaxi(jets, { a: { to: 'C1', at: 1 }, p: { to: 'C2', at: 5 } }).get('a')!.blockedBy).toBe('p');
  });

  it('marks an aircraft at its destination as arrived and ignores orders for aircraft that have left', () => {
    const plans = planTaxi([parked('a', 'COR'), pose('k', CATS['2'][0][0] + 4, CATS['2'][0][1], 2.4)], { a: { to: 'COR', at: 1 }, k: { to: 'C2', at: 2 }, gone: { to: 'C1', at: 3 } });
    expect(plans.get('a')!.arrived).toBe(true);
    expect(plans.get('k')!.arrived).toBe(true);
    expect(plans.has('gone')).toBe(false);
  });
});

describe('taxi instructions in the shared ops state', () => {
  const deck = [
    { id: 'a', key: 'ga' },
    { id: 'b1', key: 'gb' },
    { id: 'b2', key: 'gb' },
  ];

  it('queues the flight on the catapult it is sent to, and takes it off when sent to park or cancelled', () => {
    const p1 = withTaxi(undefined, deck, 'a', 'C2', 100);
    expect(p1.taxi).toEqual({ a: { to: 'C2', at: 100 } });
    expect(p1.launch['2'].queue).toEqual(['ga']);
    expect(cleanOpsPatch(p1)).not.toBeNull();
    const p2 = withTaxi(p1, deck, 'a', 'E2A', 200);
    expect(p2.taxi.a.to).toBe('E2A');
    expect(p2.launch['2'].queue).toEqual([]);
    const p3 = withTaxi(p1, deck, 'a', null, 300);
    expect(p3.taxi).toEqual({});
    expect(p3.launch['2'].queue).toEqual([]);
    // one of a two-ship sent to park: the flight stays queued for its wingman
    const q = withTaxi(withTaxi(withTaxi(undefined, deck, 'b1', 'C1', 1), deck, 'b2', 'C1', 2), deck, 'b1', 'COR', 3);
    expect(q.launch['1'].queue).toEqual(['gb']);
    expect(q.taxi.b2.to).toBe('C1');
  });

  it('follows the launch tab: a queued flight taxis to its catapult; dequeued, its instruction goes', () => {
    const queued = { launch: { '1': { status: 'ready' as const, queue: ['gb'] } } };
    const o = taxiOrders(queued, deck);
    expect(Object.keys(o).sort()).toEqual(['b1', 'b2']);
    expect(o.b1.to).toBe('C1');
    // explicit instructions come first in the sequence
    expect(taxiOrders({ ...queued, taxi: { a: { to: 'C2', at: Date.now() } } }, deck).a.at).toBeLessThan(o.b1.at);
    const p = withTaxi(undefined, deck, 'a', 'C3', 1);
    const off = withLaunch(p, deck, { ...p.launch, '3': { status: 'down', queue: [] } });
    expect(off.taxi).toEqual({});
    // aircraft no longer on deck drop out
    expect(taxiOrders({ taxi: { gone: { to: 'C1', at: 1 } } }, deck)).toEqual({});
  });

  it('validates taxi patches', () => {
    expect(cleanOpsPatch({ taxi: { t1: { to: 'E2A', at: 5 } } })).toEqual({ taxi: { t1: { to: 'E2A', at: 5 } } });
    expect(cleanOpsPatch({ taxi: null })).toEqual({ taxi: null });
    expect(cleanOpsPatch({ taxi: { t1: { to: 'not a spot!', at: 5 } } })).toBeNull();
    expect(cleanOpsPatch({ taxi: { t1: { to: 'C1' } } })).toBeNull();
    expect(cleanOpsPatch({ taxi: [] })).toBeNull();
  });
});
