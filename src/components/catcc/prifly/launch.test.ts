import { describe, expect, it } from 'vitest';
import { applyOpsPatch, cleanOpsPatch, type CatStatus, type OpsState } from '../../../catcc/core/room/ops.ts';
import { CAT_PARTNERS, SIMULTANEOUS, SIMULTANEOUS_CLEAR_M, catEntry, deckIdOf, elementNo, flightCats, pathsCross, queueMembers, simultaneous, taxiOrders, unassignedFlights, withLaunch, withNoTaxi, withTaxi, type DeckId } from './launch.ts';

// the wingman is listed before its lead: the lead goes first by its element number, not the deck order
const deck: DeckId[] = [
  { id: 'a', key: 'ga', n: 1 },
  { id: 'b2', key: 'gb', n: 2 },
  { id: 'b1', key: 'gb', n: 1 },
];
/** a later flightmate: the third of flight gb lands */
const deck3: DeckId[] = [...deck, { id: 'b3', key: 'gb', n: 3 }];
const five: DeckId[] = [...deck, ...[1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, key: 'gc', n }))];

type Tab = Record<string, { status: CatStatus; queue: string[] }>;
/** what the launch tab sends: every catapult, with `k`'s queue (and status) replaced (its save drops anything but status and queue) */
const tab = (ops: OpsState | undefined, k: string, queue: string[], status?: CatStatus): Tab => {
  const all: Tab = {};
  for (const c of ['1', '2', '3', '4']) all[c] = c === k ? { status: status ?? catEntry(ops, c).status, queue } : { ...catEntry(ops, c) };
  return all;
};
/** the ops state after a patch, as the room stores it (validated, then applied) */
const store = (ops: OpsState | undefined, patch: object): OpsState => {
  const clean = cleanOpsPatch(patch);
  expect(clean).not.toBeNull();
  return applyOpsPatch(ops ?? {}, clean!);
};
const dests = (ops: OpsState, d: DeckId[] = deck) => Object.fromEntries(Object.entries(taxiOrders(ops, d)).map(([id, o]) => [id, o.to]));
/** the launch tab queues flight f on catapult k */
const queue = (ops: OpsState | undefined, d: DeckId[], k: string, f: string) => store(ops, withLaunch(ops, d, tab(ops, k, [...catEntry(ops, k).queue, f])));
/** the launch tab sets catapult k's status */
const setStatus = (ops: OpsState | undefined, d: DeckId[], k: string, s: CatStatus) => store(ops, withLaunch(ops, d, tab(ops, k, catEntry(ops, k).queue, s)));

describe('deck orders are per aircraft', () => {
  it('an aircraft sent to a catapult from the deck brings only itself', () => {
    const ops = store(undefined, withTaxi(undefined, deck, 'b1', 'C1', 1));
    expect(ops.launch!['1']).toEqual({ status: 'ready', queue: ['gb'], jets: { gb: [] } });
    expect(dests(ops)).toEqual({ b1: 'C1' });
    // a flightmate that lands later gets nothing either
    expect(dests(ops, deck3)).toEqual({ b1: 'C1' });
    // its flightmate sent there too: both go, the flight keeps its place
    const both = store(ops, withTaxi(ops, deck, 'b2', 'C1', 2));
    expect(dests(both)).toEqual({ b1: 'C1', b2: 'C1' });
    expect(both.launch!['1'].queue).toEqual(['gb']);
    // sent to different catapults from the deck: the flight is on both queues
    const split = store(ops, withTaxi(ops, deck, 'b2', 'C2', 2));
    expect(split.launch!['1'].queue).toEqual(['gb']);
    expect(split.launch!['2'].queue).toEqual(['gb']);
  });

  it('cancelling the deck order takes the flight off the queue once none of it is bound there', () => {
    const one = store(undefined, withTaxi(undefined, deck, 'b1', 'C1', 1));
    const off = store(one, withTaxi(one, deck, 'b1', null, 2));
    expect(dests(off)).toEqual({});
    expect(off.launch!['1']).toEqual({ status: 'ready', queue: [], jets: {} });
    const two = store(one, withTaxi(one, deck, 'b2', 'C1', 2));
    const left = store(two, withTaxi(two, deck, 'b1', null, 3));
    expect(dests(left)).toEqual({ b2: 'C1' });
    expect(left.launch!['1'].queue).toEqual(['gb']);
  });
});

describe('which catapults can be fired together', () => {
  it('the partner table is what the deck geometry gives (paths crossing within 1 NM: staggered)', () => {
    const keys = ['1', '2', '3', '4'];
    for (const a of keys) {
      const others = keys.filter((b) => b !== a);
      // best first: the paths cross furthest ahead (diverging paths never do)
      const ranked = [...others].sort((x, y) => pathsCross(a, y) - pathsCross(a, x));
      expect(CAT_PARTNERS[a]).toEqual(ranked);
      expect(SIMULTANEOUS[a]).toEqual(ranked.filter((b) => pathsCross(a, b) > SIMULTANEOUS_CLEAR_M));
      for (const b of others) expect(pathsCross(a, b)).toBeCloseTo(pathsCross(b, a), 6);
    }
  });

  it('agrees with the user rules: 1+3 and 2+3 together, never 1+2 or 3+4', () => {
    expect(simultaneous('1', '3') && simultaneous('3', '1')).toBe(true);
    expect(simultaneous('2', '3') && simultaneous('3', '2')).toBe(true);
    expect(simultaneous('1', '2') || simultaneous('2', '1')).toBe(false);
    expect(simultaneous('3', '4') || simultaneous('4', '3')).toBe(false);
    // cat 4 converges on every other catapult within a mile
    expect(SIMULTANEOUS['4']).toEqual([]);
    expect(pathsCross('2', '3')).toBe(Infinity);
    expect(pathsCross('1', '3')).toBeGreaterThan(3500);
    expect(pathsCross('2', '4')).toBeLessThan(800);
  });
});

describe('a flight queued from the launch tab goes by sections onto catapults fired together', () => {
  const ALL = ['1', '2', '3', '4'];
  it('all catapults open', () => {
    expect(flightCats('1', 1, ALL)).toEqual(['1']);
    expect(flightCats('1', 2, ALL)).toEqual(['1', '3']);
    expect(flightCats('2', 2, ALL)).toEqual(['2', '3']);
    expect(flightCats('3', 2, ALL)).toEqual(['3', '2']);
    // cat 4 has no partner it can be fired with: its wingman goes to the best staggered one
    expect(flightCats('4', 2, ALL)).toEqual(['4', '2']);
    // the odd one out goes where the queue is shortest
    expect(flightCats('1', 3, ALL)).toEqual(['1', '3', '2']);
    // section 2 on the fresh catapult paired with cat 3
    expect(flightCats('1', 4, ALL)).toEqual(['1', '3', '2', '3']);
    expect(flightCats('1', 5, ALL)).toEqual(['1', '3', '2', '3', '4']);
    // six and eight: the sections' pairs again, in turn
    expect(flightCats('1', 6, ALL)).toEqual(['1', '3', '2', '3', '1', '3']);
    expect(flightCats('1', 8, ALL)).toEqual(['1', '3', '2', '3', '1', '3', '2', '3']);
    // queues already there count: the odd one goes to the emptier catapult
    expect(flightCats('1', 3, ALL, { '2': 3 })).toEqual(['1', '3', '4']);
  });

  it('only the bow catapults open: the bow pair, staggered', () => {
    const BOW = ['1', '2'];
    expect(flightCats('1', 2, BOW)).toEqual(['1', '2']);
    expect(flightCats('2', 2, BOW)).toEqual(['2', '1']);
    expect(flightCats('1', 3, BOW)).toEqual(['1', '2', '1']);
    expect(flightCats('1', 4, BOW)).toEqual(['1', '2', '1', '2']);
    expect(flightCats('1', 5, BOW)).toEqual(['1', '2', '1', '2', '1']);
  });

  it('only the waist catapults open', () => {
    const WAIST = ['3', '4'];
    expect(flightCats('3', 2, WAIST)).toEqual(['3', '4']);
    expect(flightCats('4', 2, WAIST)).toEqual(['4', '3']);
    expect(flightCats('3', 4, WAIST)).toEqual(['3', '4', '3', '4']);
    expect(flightCats('3', 5, WAIST)).toEqual(['3', '4', '3', '4', '3']);
  });

  it('cat 3 closed: no pair can be fired together; staggered on the best partners', () => {
    const NO3 = ['1', '2', '4'];
    expect(flightCats('1', 2, NO3)).toEqual(['1', '4']);
    expect(flightCats('2', 2, NO3)).toEqual(['2', '4']);
    expect(flightCats('1', 3, NO3)).toEqual(['1', '4', '2']);
    expect(flightCats('1', 4, NO3)).toEqual(['1', '4', '2', '4']);
    expect(flightCats('1', 5, NO3)).toEqual(['1', '4', '2', '4', '1']);
  });

  it('a single catapult open: all of the flight behind the lead', () => {
    expect(flightCats('2', 2, ['2'])).toEqual(['2', '2']);
    expect(flightCats('2', 3, ['2'])).toEqual(['2', '2', '2']);
    expect(flightCats('2', 5, ['2'])).toEqual(['2', '2', '2', '2', '2']);
    // nothing open: the catapult picked
    expect(flightCats('1', 2, [])).toEqual(['1', '1']);
  });

  it('through the launch tab: the flight on each catapult its aircraft are on', () => {
    // the waist catapults start down: the bow pair
    const ops = queue(undefined, deck, '1', 'gb');
    expect(dests(ops)).toEqual({ b1: 'C1', b2: 'C2' });
    expect(ops.launch!['1']).toEqual({ status: 'ready', queue: ['gb'], jets: { gb: ['b1'] } });
    expect(ops.launch!['2']).toEqual({ status: 'ready', queue: ['gb'], jets: { gb: ['b2'] } });
    expect(queueMembers(ops, deck, '1')).toEqual([{ key: 'gb', ids: ['b1'] }]);
    expect(queueMembers(ops, deck, '2')).toEqual([{ key: 'gb', ids: ['b2'] }]);
    // cat 3 open: the lead's wingman on cat 3
    const open3 = setStatus(undefined, deck, '3', 'ready');
    expect(dests(queue(open3, deck, '1', 'gb'))).toEqual({ b1: 'C1', b2: 'C3' });
    // all open, a five-ship (lead order from the element numbers)
    let all = setStatus(undefined, five, '3', 'ready');
    all = setStatus(all, five, '4', 'ready');
    expect(dests(queue(all, five, '2', 'gc'), five)).toEqual({ c1: 'C2', c2: 'C3', c3: 'C1', c4: 'C3', c5: 'C4' });
    // suspended and hold
    const sus = setStatus(open3, deck, '3', 'suspended');
    expect(dests(queue(sus, deck, '1', 'gb'))).toEqual({ b1: 'C1', b2: 'C2' });
    const hold = setStatus(open3, deck, '3', 'hold');
    expect(dests(queue(hold, deck, '1', 'gb'))).toEqual({ b1: 'C1', b2: 'C3' });
  });

  it('cancel on an assigned aircraft: it alone is left with no instruction; the others keep theirs', () => {
    const ops = queue(undefined, deck, '1', 'gb');
    const one = store(ops, withTaxi(ops, deck, 'b2', null, 5));
    expect(dests(one)).toEqual({ b1: 'C1' });
    expect(one.launch!['2'].queue).toEqual([]);
    expect(one.launch!['1'].queue).toEqual(['gb']);
    // queued again from the tab, only the unassigned aircraft is spread
    expect(unassignedFlights(one, deck)).toEqual(['ga', 'gb']);
    expect(dests(queue(one, deck, '2', 'gb'))).toEqual({ b1: 'C1', b2: 'C2' });
    const none = store(one, withTaxi(one, deck, 'b1', null, 6));
    expect(dests(none)).toEqual({});
    expect(none.launch!['1'].queue).toEqual([]);
  });

  it('an assigned aircraft sent elsewhere from the deck goes alone; cancelled after, it has no instruction', () => {
    const ops = queue(undefined, deck, '1', 'gb');
    const moved = store(ops, withTaxi(ops, deck, 'b2', 'C1', 5));
    expect(dests(moved)).toEqual({ b1: 'C1', b2: 'C1' });
    expect(moved.launch!['2'].queue).toEqual([]);
    const off = store(moved, withTaxi(moved, deck, 'b2', null, 6));
    expect(dests(off)).toEqual({ b1: 'C1' });
    const park = store(ops, withTaxi(ops, deck, 'b2', 'E22', 5));
    expect(dests(park)).toEqual({ b1: 'C1', b2: 'E22' });
  });

  it('taking the flight off one catapult in the launch tab leaves that member unassigned and the rest where they are', () => {
    const ops = queue(undefined, deck, '1', 'gb');
    const off = store(ops, withLaunch(ops, deck, tab(ops, '2', [])));
    expect(dests(off)).toEqual({ b1: 'C1' });
    expect(off.launch!['1'].queue).toEqual(['gb']);
    // an aircraft sent there from the deck loses that instruction too
    const sent = store(undefined, withTaxi(undefined, deck, 'b1', 'C1', 1));
    const out = store(sent, withLaunch(sent, deck, tab(sent, '1', [])));
    expect(dests(out)).toEqual({});
    expect(out.taxi).toEqual({});
  });

  it('a flightmate that lands later is unassigned until the flight is queued again', () => {
    const ops = queue(undefined, deck, '1', 'gb');
    expect(dests(ops, deck3)).toEqual({ b1: 'C1', b2: 'C2' });
    expect(unassignedFlights(ops, deck3)).toEqual(['ga', 'gb']);
    expect(dests(queue(ops, deck3, '1', 'gb'), deck3)).toEqual({ b1: 'C1', b2: 'C2', b3: 'C1' });
  });

  it('launch tab edits elsewhere keep every assignment', () => {
    const ops = queue(store(undefined, withTaxi(undefined, deck, 'a', 'C2', 1)), deck, '1', 'gb');
    expect(dests(ops)).toEqual({ a: 'C2', b1: 'C1', b2: 'C2' });
    const held = setStatus(ops, deck, '1', 'hold');
    expect(dests(held)).toEqual(dests(ops));
    expect(held.launch!['1']).toEqual({ status: 'hold', queue: ['gb'], jets: { gb: ['b1'] } });
    // ga's instruction is its own: taking gb off cat 2 leaves it
    const off = store(held, withLaunch(held, deck, tab(held, '2', ['ga'])));
    expect(dests(off)).toEqual({ a: 'C2', b1: 'C1' });
  });

  it('member order: the element number from the callsign, else deck order', () => {
    expect(elementNo('Volt 3-2')).toBe(2);
    expect(elementNo('Volt')).toBe(99);
    expect(deckIdOf({ id: 't', g: 'G', cs: 'Volt 3-1' })).toEqual({ id: 't', key: 'G', n: 1 });
    expect(deckIdOf({ id: 't' })).toEqual({ id: 't', key: 't', n: 99 });
  });
});

describe('older launch state', () => {
  it('a queue entry with no list sends the whole flight (later flightmates too), less its exclusions; fromDeck sends none', () => {
    const old: OpsState = { launch: { '1': { status: 'ready', queue: ['gb'] } } };
    expect(dests(old, deck3)).toEqual({ b1: 'C1', b2: 'C1', b3: 'C1' });
    expect(dests({ launch: { '1': { status: 'ready', queue: ['gb'], skip: ['b2'] } } })).toEqual({ b1: 'C1' });
    expect(dests({ launch: { '1': { status: 'ready', queue: ['gb'], fromDeck: ['gb'] } }, taxi: { b1: { to: 'C1', at: 1 } } })).toEqual({ b1: 'C1' });
    // the next change writes it out as lists: cancel on one leaves the other
    const one = store(old, withTaxi(old, deck, 'b2', null, 5));
    expect(one.launch!['1']).toEqual({ status: 'ready', queue: ['gb'], jets: { gb: ['b1'] } });
    expect(dests(one)).toEqual({ b1: 'C1' });
  });
});

describe('launch state validation', () => {
  it('keeps the lists, and older marks', () => {
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: ['gb'], jets: { gb: ['b1'] } } } })).toEqual({ launch: { '1': { status: 'ready', queue: ['gb'], jets: { gb: ['b1'] } } } });
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: ['gb'], jets: { gb: [] } } } })).toEqual({ launch: { '1': { status: 'ready', queue: ['gb'], jets: { gb: [] } } } });
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: ['gb'], fromDeck: ['gb'], skip: [] } } })).toEqual({ launch: { '1': { status: 'ready', queue: ['gb'], fromDeck: ['gb'] } } });
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: ['gb'] } } })).toEqual({ launch: { '1': { status: 'ready', queue: ['gb'] } } });
  });

  it('rejects malformed lists and marks', () => {
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], jets: [] } } })).toBeNull();
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], jets: { gb: 'b1' } } } })).toBeNull();
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], jets: { gb: [''] } } } })).toBeNull();
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], jets: { gb: Array.from({ length: 13 }, (_, i) => `t${i}`) } } } })).toBeNull();
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], fromDeck: 'gb' } } })).toBeNull();
    expect(cleanOpsPatch({ launch: { '1': { status: 'ready', queue: [], skip: [5] } } })).toBeNull();
  });
});

describe('cancel all taxi instructions', () => {
  it('drops every instruction, the deck orders and the launch tab assignments, and keeps the catapult statuses', () => {
    let ops: OpsState = {};
    const apply = (p: Partial<Record<keyof OpsState, unknown>>) => {
      const c = cleanOpsPatch(p);
      expect(c).not.toBeNull();
      ops = applyOpsPatch(ops, c!);
    };
    apply({ launch: { '1': { status: 'ready', queue: [] }, '2': { status: 'hold', queue: [] }, '3': { status: 'down', queue: [] }, '4': { status: 'down', queue: [] } } });
    apply(withLaunch(ops, deck, { ...ops.launch!, '1': { status: 'ready', queue: ['gb'] } }));
    apply(withTaxi(ops, deck, 'a', 'C2', 5));
    expect(Object.keys(taxiOrders(ops, deck)).sort()).toEqual(['a', 'b1', 'b2']);
    apply(withNoTaxi(ops));
    expect(taxiOrders(ops, deck)).toEqual({});
    expect(['1', '2', '3', '4'].map((k) => catEntry(ops, k))).toEqual([
      { status: 'ready', queue: [] },
      { status: 'hold', queue: [] },
      { status: 'down', queue: [] },
      { status: 'down', queue: [] },
    ]);
    expect(unassignedFlights(ops, deck).sort()).toEqual(['ga', 'gb']);
  });
});
