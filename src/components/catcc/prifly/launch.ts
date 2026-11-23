/**
 * Launch queues and taxi instructions (shared ops state): helpers for PriFly's launch tab and the deck's taxi assignments.
 *
 * A catapult's queue holds flights (DCS group keys) with an aircraft bound for it, and for each the
 * aircraft the launch tab assigned there (`jets`). A flight queued from the launch tab is spread over the
 * catapults by sections, so each section's leader and wingman can be fired together and rejoin quickly
 * (flightCats, CAT_PARTNERS). So a flight can be on several queues at once, one entry each.
 *
 * Deck orders are per aircraft. Sending an aircraft to a catapult from the deck sends only that
 * aircraft (its flight goes on that queue with no aircraft listed: the instruction itself sends it);
 * its flightmates get nothing from it. Cancelling an aircraft's instruction on the deck, the launch
 * tab's assignment included, leaves it with none. A flight with no aircraft bound for a catapult any
 * more comes off that catapult's queue.
 *
 * Older state (a queue entry with no `jets` list) sends every aircraft of the flight without an
 * instruction of its own to that catapult, except those in `skip`; one in `fromDeck` sends none. It is
 * read that way until the queues are next changed, when it is written out as lists.
 */
import type { CatLaunch, CatStatus, OpsState } from '../../../catcc/core/room/ops.ts';
import { CATS } from './deck.ts';
import { destCat, type TaxiOrder } from './taxiNet.ts';

type Queues = Record<string, CatLaunch>;
/** a catapult's queue with every flight's assigned aircraft listed */
type Lists = Record<string, { status: CatStatus; queue: string[]; jets: Record<string, string[]> }>;
/**
 * an aircraft on deck: its track id, its flight's key (DCS group, else the track id) and its place in
 * the flight (the element number of its callsign, "-1" the lead; queues hold flights, taxi instructions aircraft)
 */
export interface DeckId {
  id: string;
  key: string;
  n?: number;
}
const CAT_KEYS = ['1', '2', '3', '4'];

/** two catapults can be fired together when their launch paths do not meet within this far ahead of the bow, metres (1 NM) */
export const SIMULTANEOUS_CLEAR_M = 1852;

/**
 * How far ahead of the forward end of the two catapults their launch paths (each catapult's track,
 * carried on straight) cross, metres; Infinity when they diverge. From the deck geometry (CATS).
 */
export function pathsCross(a: string, b: string): number {
  const line = (k: string) => {
    const [p, q] = CATS[k];
    const m = (q[1] - p[1]) / (q[0] - p[0]);
    return { x: q[0], y: q[1], m };
  };
  const A = line(a);
  const B = line(b);
  const x0 = Math.max(A.x, B.x);
  const d = A.y + A.m * (x0 - A.x) - (B.y + B.m * (x0 - B.x));
  const rate = A.m - B.m;
  return d * rate >= 0 ? Infinity : -d / rate;
}

/**
 * Each catapult's partners for a section's wingman, best first, and which of them can be fired at the
 * same time (paths not crossing within SIMULTANEOUS_CLEAR_M). Derived from CATS by pathsCross (the
 * test checks it stays so): launch headings 1: 6.2 deg to port, 2: 2.4, 3: 5.5, 4: 0.3. Cats 2 and 3
 * diverge; 1 and 3 converge by 0.7 deg and cross 3.9 km ahead; 2 and 4 cross 0.69 km ahead, 1 and 4
 * 0.39 km, 1 and 2 0.23 km, 3 and 4 33 m. Partners are ranked by how far ahead the paths cross.
 */
export const CAT_PARTNERS: Record<string, string[]> = { '1': ['3', '4', '2'], '2': ['3', '4', '1'], '3': ['2', '1', '4'], '4': ['2', '1', '3'] };
export const SIMULTANEOUS: Record<string, string[]> = { '1': ['3'], '2': ['3'], '3': ['2', '1'], '4': [] };
/** can catapults a and b be fired together */
export const simultaneous = (a: string, b: string): boolean => SIMULTANEOUS[a]?.includes(b) ?? false;
/** a catapult takes aircraft unless it is down or suspended */
export const catUsable = (s: CatStatus): boolean => s !== 'down' && s !== 'suspended';

/** an aircraft's element number in its flight, from its callsign ("Volt 3-2": 2); 99 when it has none */
export const elementNo = (cs?: string): number => {
  const m = /-(\d+)$/.exec(cs ?? '');
  return m ? Number(m[1]) : 99;
};
/** a track on deck as the queues see it */
export const deckIdOf = (t: { id: string; g?: string; cs?: string }): DeckId => ({ id: t.id, key: t.g || t.id, n: elementNo(t.cs) });

/** a catapult's launch state (waist cats start DOWN: they sit in the landing area) */
export const catEntry = (ops: OpsState | undefined, k: string): CatLaunch => ops?.launch?.[k] ?? { status: (k === '3' || k === '4' ? 'down' : 'ready') as CatStatus, queue: [] };

/** PriFly's own taxi instructions for aircraft still on deck */
const given = (ops: OpsState | undefined, deck: DeckId[]): Record<string, TaxiOrder> => {
  const here = new Set(deck.map((d) => d.id));
  return Object.fromEntries(Object.entries(ops?.taxi ?? {}).filter(([id]) => here.has(id)));
};

/** the queues of flights still on deck, each flight's assigned aircraft listed (older entries read as described above) */
function lists(ops: OpsState | undefined, deck: DeckId[]): Lists {
  const taxi = given(ops, deck);
  const ids = new Set(deck.map((d) => d.id));
  const keys = new Set(deck.map((d) => d.key));
  const out: Lists = {};
  for (const c of CAT_KEYS) {
    const e = catEntry(ops, c);
    const skip = new Set(e.skip ?? []);
    const queue = [...new Set(e.queue.filter((x) => keys.has(x)))];
    const jets: Record<string, string[]> = {};
    for (const f of queue) {
      const listed = e.jets?.[f];
      if (listed) jets[f] = listed.filter((id) => ids.has(id));
      else if (e.fromDeck?.includes(f)) jets[f] = [];
      else jets[f] = deck.filter((d) => d.key === f && !taxi[d.id] && !skip.has(d.id)).map((d) => d.id);
    }
    out[c] = { status: e.status, queue, jets };
  }
  return out;
}

/**
 * The queues as stored: each flight stays on a catapult's queue, in its place, while an aircraft of it
 * is bound there (assigned there and without an instruction of its own, or sent there); a flight with
 * an aircraft sent to a catapult it is not queued on joins the back of that queue, in the order sent.
 */
function settle(all: Lists, taxi: Record<string, TaxiOrder>, deck: DeckId[]): Queues {
  const ids = new Set(deck.map((d) => d.id));
  const keyOf = new Map(deck.map((d) => [d.id, d.key]));
  const seen = new Set<string>();
  const out: Queues = {};
  for (const c of CAT_KEYS) {
    const queue: string[] = [];
    const jets: Record<string, string[]> = {};
    const sentHere = Object.entries(taxi)
      .filter(([id, o]) => ids.has(id) && destCat(o.to) === c)
      .sort((a, b) => a[1].at - b[1].at);
    for (const f of all[c].queue) {
      // an aircraft goes to one catapult: the first that lists it
      const listed = all[c].jets[f].filter((id) => ids.has(id) && !taxi[id] && !seen.has(id));
      listed.forEach((id) => seen.add(id));
      if (listed.length || sentHere.some(([id]) => keyOf.get(id) === f)) {
        queue.push(f);
        jets[f] = listed;
      }
    }
    for (const [id] of sentHere) {
      const f = keyOf.get(id)!;
      if (!queue.includes(f)) {
        queue.push(f);
        jets[f] = [];
      }
    }
    out[c] = { status: all[c].status, queue, jets };
  }
  return out;
}

/**
 * The taxi instructions in force: PriFly's, in the order given, then the aircraft the launch tab
 * assigned to each catapult without an instruction of their own (to that catapult, in queue order).
 */
export function taxiOrders(ops: OpsState | undefined, deck: DeckId[]): Record<string, TaxiOrder> {
  const out = given(ops, deck);
  const all = lists(ops, deck);
  for (const k of CAT_KEYS) {
    all[k].queue.forEach((f, pos) => {
      for (const id of all[k].jets[f]) if (!out[id]) out[id] = { to: `C${k}`, at: 4e12 + pos * 10 + Number(k) };
    });
  }
  return out;
}

/**
 * The aircraft of each flight on catapult k's queue that are bound for it (assigned there or sent
 * there), in queue order: what the launch tab shows on that catapult.
 */
export function queueMembers(ops: OpsState | undefined, deck: DeckId[], k: string): { key: string; ids: string[] }[] {
  const orders = taxiOrders(ops, deck);
  const keys = new Set(deck.map((d) => d.key));
  return catEntry(ops, k)
    .queue.filter((f, i, q) => keys.has(f) && q.indexOf(f) === i)
    .map((key) => ({ key, ids: deck.filter((d) => d.key === key && orders[d.id]?.to === `C${k}`).map((d) => d.id) }));
}

/** the flights on deck with an aircraft that has no instruction (its own or the launch tab's): what the launch tab can queue */
export function unassignedFlights(ops: OpsState | undefined, deck: DeckId[]): string[] {
  const orders = taxiOrders(ops, deck);
  return [...new Set(deck.filter((d) => !orders[d.id]).map((d) => d.key))];
}

/**
 * The ops patch that sends one aircraft to a destination from the deck (null: its instruction is
 * cancelled). Only that aircraft goes; its launch tab assignment, if it had one, goes (cancelled, it is
 * left with no instruction). Its flight joins the queue of a catapult it is sent to, and comes off any
 * queue none of its aircraft is bound for any more.
 */
export function withTaxi(ops: OpsState | undefined, deck: DeckId[], id: string, to: string | null, now: number): { taxi: Record<string, TaxiOrder>; launch: Queues } {
  const all = lists(ops, deck);
  const taxi = given(ops, deck);
  delete taxi[id];
  if (to) taxi[id] = { to, at: now };
  for (const c of CAT_KEYS) for (const f of all[c].queue) all[c].jets[f] = all[c].jets[f].filter((x) => x !== id);
  return { taxi, launch: settle(all, taxi, deck) };
}

/**
 * The catapult for each aircraft of a flight of n queued on catapult k from the launch tab, lead first.
 * The flight is worked in sections: (lead, -2), (-3, -4), ... A section's wingman goes to the best
 * usable catapult that can be fired together with its leader's (CAT_PARTNERS, SIMULTANEOUS), so the
 * two launch together and rejoin at once; with none usable, to the best usable one fired after it, else
 * behind its leader on the same catapult. The lead goes to k. Each later section takes the best usable
 * simultaneous pair: fewest catapults already used by the flight, then the shortest queues; with every
 * pair used, the sections' pairs again in the same order (the sections launch as pairs one after the other).
 * With no simultaneous pair usable, its leader takes the least used, shortest queue and its wingman as
 * above. An odd last aircraft goes to the usable catapult with the shortest queue. `load`: aircraft
 * already queued on each catapult. Usable: not down or suspended (`open`); with none, k.
 */
export function flightCats(k: string, n: number, open: string[], load: Record<string, number> = {}): string[] {
  const cats = open.length ? open : [k];
  const out: string[] = [];
  const mine: Record<string, number> = {};
  const used = (c: string) => (mine[c] ? 1 : 0);
  const busy = (c: string) => (load[c] ?? 0) + (mine[c] ?? 0);
  const put = (c: string) => {
    out.push(c);
    mine[c] = (mine[c] ?? 0) + 1;
  };
  const wingFor = (lead: string) => CAT_PARTNERS[lead].find((c) => simultaneous(lead, c) && cats.includes(c)) ?? CAT_PARTNERS[lead].find((c) => cats.includes(c)) ?? lead;
  const byNo = (a: string, b: string) => Number(a) - Number(b);
  // the pairs the sections took while there were fresh ones: repeated in turn once every pair is used
  const pattern: [string, string][] = [];
  for (let i = 0; i < n; i += 2) {
    if (i + 1 >= n) {
      // the odd one out: whichever catapult frees soonest
      put(i === 0 ? k : [...cats].sort((a, b) => busy(a) - busy(b) || byNo(a, b))[0]);
      break;
    }
    let pair: [string, string];
    if (i === 0) pair = [k, wingFor(k)];
    else {
      const sim = cats.flatMap((a) => cats.filter((b) => simultaneous(a, b)).map((b): [string, string] => [a, b]));
      if (sim.length) {
        const score = (p: [string, string]) => used(p[0]) + used(p[1]);
        const best = Math.min(...sim.map(score));
        const again = best === 2 ? pattern.filter((p) => sim.some((q) => q[0] === p[0] && q[1] === p[1])) : [];
        pair = again.length
          ? again[(i / 2) % again.length]
          : sim
                .filter((p) => score(p) === best)
                .sort((p, q) => busy(p[0]) + busy(p[1]) - busy(q[0]) - busy(q[1]) || used(p[0]) - used(q[0]) || CAT_PARTNERS[p[0]].indexOf(p[1]) - CAT_PARTNERS[q[0]].indexOf(q[1]) || byNo(p[0], q[0]))[0];
      } else {
        const lead = [...cats].sort((a, b) => used(a) - used(b) || busy(a) - busy(b) || byNo(a, b))[0];
        pair = [lead, wingFor(lead)];
      }
    }
    const fresh = !used(pair[0]) || !used(pair[1]);
    put(pair[0]);
    put(pair[1]);
    if (fresh) pattern.push(pair);
  }
  return out;
}

/** spread flight f's aircraft that have no instruction and no assignment over the catapults by sections from catapult k (flightCats), lead first */
function spread(all: Lists, taxi: Record<string, TaxiOrder>, deck: DeckId[], f: string, k: string): void {
  const assigned = new Set(CAT_KEYS.flatMap((c) => Object.values(all[c].jets).flat()));
  const members = deck
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.key === f && !taxi[d.id] && !assigned.has(d.id))
    .sort((a, b) => (a.d.n ?? 99) - (b.d.n ?? 99) || a.i - b.i)
    .map(({ d }) => d.id);
  const open = CAT_KEYS.filter((c) => catUsable(all[c].status));
  const load = Object.fromEntries(CAT_KEYS.map((c) => [c, all[c].queue.reduce((s, x) => s + Math.max(1, all[c].jets[x]?.length ?? 0), 0)]));
  const cats = flightCats(k, members.length, open, load);
  members.forEach((id, i) => {
    const c = cats[i];
    if (!all[c].queue.includes(f)) {
      all[c].queue.push(f);
      all[c].jets[f] = [];
    }
    all[c].jets[f].push(id);
  });
}

/**
 * The ops patch for an edit of the launch queues in the launch tab (its catapults' status and queues).
 * A flight added to a catapult's queue (or added again, when it is on it already) is spread over the
 * catapults from that one: its aircraft with no instruction yet. A flight taken off a catapult's queue loses its aircraft's assignments and taxi
 * instructions to that catapult only: those aircraft are left with none (they are not moved to another
 * catapult), and the flight stays on the other queues it is on.
 */
export function withLaunch(ops: OpsState | undefined, deck: DeckId[], launch: Record<string, { status: CatStatus; queue: string[] }>): { taxi: Record<string, TaxiOrder>; launch: Queues } {
  const all = lists(ops, deck);
  const taxi = given(ops, deck);
  const keyOf = new Map(deck.map((d) => [d.id, d.key]));
  const added: [string, string][] = [];
  for (const c of CAT_KEYS) {
    const next = launch[c];
    if (!next) continue;
    const old = all[c].queue;
    for (const f of old.filter((x) => !next.queue.includes(x))) {
      delete all[c].jets[f];
      for (const [id, o] of Object.entries(taxi)) if (keyOf.get(id) === f && destCat(o.to) === c) delete taxi[id];
    }
    all[c].status = next.status;
    all[c].queue = [...new Set(next.queue)].filter((f) => old.includes(f));
    // queued: a flight new to this queue, or one already on it queued again (for its aircraft still unassigned)
    for (const f of new Set(next.queue)) if (next.queue.filter((x) => x === f).length > (old.includes(f) ? 1 : 0)) added.push([c, f]);
  }
  for (const [c, f] of added) spread(all, taxi, deck, f, c);
  return { taxi, launch: settle(all, taxi, deck) };
}

/**
 * The ops patch that cancels every taxi instruction: PriFly's own (from the deck or for one aircraft) and
 * the launch tab's (every flight comes off every catapult queue). The catapults keep their status.
 */
export function withNoTaxi(ops: OpsState | undefined): { taxi: Record<string, TaxiOrder>; launch: Queues } {
  return { taxi: {}, launch: Object.fromEntries(CAT_KEYS.map((k) => [k, { status: catEntry(ops, k).status, queue: [] }])) };
}
