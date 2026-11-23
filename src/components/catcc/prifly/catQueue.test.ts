import { describe, expect, it } from 'vitest';
import { CATS, NIMITZ, inPoly, type V } from './deck.ts';
import { DECK_SPOTS } from './deckSpots.gen.ts';
import { QUEUE_GAP, behindJbd, catQueues, destName, queueGhosts, queueLane, queueSpots } from './catQueue.ts';
import { TAXI_DESTS, planTaxi, taxiDest, type DeckPose } from './taxiNet.ts';

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
    expect(queueGhosts(catQueues(ai, { '2': 'ai' })).map((g) => g.id)).toEqual(['a']);
  });

  it('moves the queue up as aircraft launch', () => {
    const orders = { z: { to: 'C2', at: 5 }, a: { to: 'C2', at: 10 }, b: { to: 'C2', at: 20 } };
    const ghostsOf = (deck: DeckPose[], on: string | null) => queueGhosts(catQueues(planTaxi(deck, orders), { '2': on }));
    // z on the catapult: a waits behind the jet blast deflector, b behind a
    const busy = ghostsOf([...jets, onShuttle('z', '2')], 'z');
    expect(busy.map((g) => [g.id, g.pos])).toEqual([['a', 0], ['b', 1]]);
    expect([busy[0].x, busy[0].y]).toEqual(queueSpots('2', 1, true).map((s) => [s.x, s.y])[0]);
    // z launches: the catapult is free, a's ghost is on the shuttle, b's behind it
    const free = ghostsOf(jets, null);
    expect(free.map((g) => [g.id, g.pos])).toEqual([['a', 0], ['b', 1]]);
    expect([free[0].x, free[0].y]).toEqual(CATS['2'][0]);
    // a taxis onto the catapult: it has no ghost, b waits behind the deflector where a waited
    const next = ghostsOf([...jets.filter((j) => j.id !== 'a'), onShuttle('a', '2')], 'a');
    expect(next.map((g) => [g.id, g.pos])).toEqual([['b', 0]]);
    expect([next[0].x, next[0].y, next[0].a]).toEqual([busy[0].x, busy[0].y, busy[0].a]);
  });
});

describe('queue ghost positions', () => {
  const along = (k: string, p: { x: number; y: number }) => {
    const r = (catDeg(k) * Math.PI) / 180;
    const u: V = [Math.cos(r), Math.sin(r)];
    const c = CATS[k][0];
    return { s: (p.x - c[0]) * u[0] + (p.y - c[1]) * u[1], o: -(p.x - c[0]) * u[1] + (p.y - c[1]) * u[0], u };
  };

  it('stands the first on the shuttle, heading along the catapult, when the catapult is free', () => {
    for (const k of ['1', '2', '3', '4']) {
      const [g] = queueSpots(k, 1);
      expect([g.x, g.y]).toEqual(CATS[k][0]);
      expect(g.a).toBeCloseTo(catDeg(k), 6);
    }
  });

  it('stands the first behind the jet blast deflector, clear of it, when the catapult is occupied', () => {
    for (const k of ['1', '2', '3', '4']) {
      const [g] = queueSpots(k, 1, true);
      const { s, o, u } = along(k, g);
      const jbdAft = Math.min(...NIMITZ.jbd[k].map(([x, y]) => along(k, { x, y }).s));
      expect(o).toBeCloseTo(0, 6);
      expect(g.a).toBeCloseTo(catDeg(k), 6);
      // its nose (8.5 m ahead) is 2 m aft of the deflector
      expect(jbdAft - (s + 8.5)).toBeCloseTo(2, 6);
      expect(s).toBeCloseTo(behindJbd(k), 6);
      for (const d of [-8.5, 0, 8.5]) expect(inPoly(g.x + u[0] * d, g.y + u[1] * d, NIMITZ.outline)).toBe(true);
    }
  });

  it('lines the rest up straight behind the first on the catapult line, an aircraft length apart, facing up the catapult', () => {
    // how many stand on each catapult's own line before it leaves the deck or meets the island
    // (cat 2's runs to the stern: its whole queue stands on it)
    const straight: Record<string, [number, number]> = { '1': [5, 4], '2': [12, 10], '3': [7, 5], '4': [3, 2] };
    for (const k of ['1', '2', '3', '4']) {
      for (const occupied of [false, true]) {
        const n = straight[k][occupied ? 1 : 0];
        const g = queueSpots(k, n, occupied);
        const s0 = occupied ? behindJbd(k) : 0;
        g.forEach((p, i) => {
          const { s, o, u } = along(k, p);
          expect(s).toBeCloseTo(s0 - QUEUE_GAP * i, 6);
          expect(o).toBeCloseTo(0, 6);
          expect(p.a).toBeCloseTo(catDeg(k), 6);
          // nose and tail on the deck too
          for (const d of [-8.5, 0, 8.5]) expect(inPoly(p.x + u[0] * d, p.y + u[1] * d, NIMITZ.outline)).toBe(true);
        });
        // the next one, if the deck has room for it, leaves the line
        const more = queueSpots(k, n + 1, occupied)[n];
        if (more) expect(Math.abs(along(k, more).o) > 0.5 || Math.abs(along(k, more).s - (s0 - QUEUE_GAP * n)) > 0.5).toBe(true);
      }
    }
  });

  it('carries a longer queue on down the taxi route onto the catapult, on the deck, none overlapping one another or the occupant', () => {
    for (const k of ['1', '2', '3', '4']) {
      for (const occupied of [false, true]) {
        const g = queueSpots(k, 6, occupied);
        expect(g).toHaveLength(6);
        const taken = occupied ? [{ x: CATS[k][0][0], y: CATS[k][0][1] }, ...g] : g;
        for (let i = 0; i < taken.length; i++) {
          expect(inPoly(taken[i].x, taken[i].y, NIMITZ.outline)).toBe(true);
          for (let j = 0; j < i; j++) expect(Math.hypot(taken[i].x - taken[j].x, taken[i].y - taken[j].y)).toBeGreaterThanOrEqual(QUEUE_GAP - 1e-6);
        }
      }
      // the lane starts on the shuttle
      expect(Math.hypot(queueLane(k)[0][0] - CATS[k][0][0], queueLane(k)[0][1] - CATS[k][0][1])).toBeLessThan(0.01);
    }
    // a prefix of a longer queue is the shorter queue: ghosts do not move when one joins the back
    expect(queueSpots('4', 7).slice(0, 5)).toEqual(queueSpots('4', 5));
    expect(queueSpots('4', 7, true).slice(0, 5)).toEqual(queueSpots('4', 5, true));
  });

  it('draws no ghost off the deck: a queue longer than the deck has room for stops at the aft end of the artery', () => {
    for (const k of ['1', '2', '3', '4']) {
      for (const occupied of [false, true]) {
        const g = queueSpots(k, 40, occupied);
        expect(g.length).toBeGreaterThanOrEqual(6);
        expect(g.length).toBeLessThan(40);
        for (const s of g) expect(inPoly(s.x, s.y, NIMITZ.outline)).toBe(true);
        expect(queueGhosts({ [k]: { occupant: occupied ? 'on' : null, queue: Array.from({ length: 40 }, (_, i) => `j${i}`) } })).toHaveLength(g.length);
      }
    }
    expect(queueSpots('2', 0)).toEqual([]);
    expect(queueSpots('2', 0, true)).toEqual([]);
  });

  it('gives every queued aircraft its own ghost on its catapult', () => {
    const e = { occupant: null, queue: [] };
    const ghosts = queueGhosts({ '1': { occupant: null, queue: ['d'] }, '2': { occupant: 'x', queue: ['a', 'b'] }, '3': e, '4': e });
    expect(ghosts.map((g) => `${g.id}:${g.cat}:${g.pos}`)).toEqual(['d:1:0', 'a:2:0', 'b:2:1']);
  });
});
