/** Launch queues and taxi instructions (shared ops state): helpers for PriFly's launch tab and the deck's taxi assignments. */
import type { CatStatus, OpsState } from '../../../catcc/core/room/ops.ts';
import { destCat, type TaxiOrder } from './taxiNet.ts';

type Queues = Record<string, { status: CatStatus; queue: string[] }>;
/** an aircraft on deck: its track id and its flight's key (DCS group, else the track id): queues hold flights, taxi instructions aircraft */
export interface DeckId {
  id: string;
  key: string;
}
const CAT_KEYS = ['1', '2', '3', '4'];

/** a catapult's launch state (waist cats start DOWN: they sit in the landing area) */
export const catEntry = (ops: OpsState | undefined, k: string): { status: CatStatus; queue: string[] } => ops?.launch?.[k] ?? { status: (k === '3' || k === '4' ? 'down' : 'ready') as CatStatus, queue: [] };

/** the launch queues with a flight moved onto catapult k (or off every catapult with null); launched flights drop out */
export function withQueued(ops: OpsState | undefined, onDeck: Set<string>, key: string, k: string | null): Queues {
  const all: Queues = {};
  for (const c of CAT_KEYS) {
    const cur = catEntry(ops, c);
    const q = cur.queue.filter((x) => onDeck.has(x) && x !== key);
    all[c] = { status: cur.status, queue: c === k ? [...q, key] : q };
  }
  return all;
}

/** PriFly's own taxi instructions for aircraft still on deck */
const given = (ops: OpsState | undefined, deck: DeckId[]): Record<string, TaxiOrder> => {
  const here = new Set(deck.map((d) => d.id));
  return Object.fromEntries(Object.entries(ops?.taxi ?? {}).filter(([id]) => here.has(id)));
};

/**
 * The taxi instructions in force: PriFly's, in the order given, then every aircraft of a flight queued
 * on a catapult from the launch tab without one (to that catapult, in queue order).
 */
export function taxiOrders(ops: OpsState | undefined, deck: DeckId[]): Record<string, TaxiOrder> {
  const out = given(ops, deck);
  for (const k of CAT_KEYS) {
    catEntry(ops, k).queue.forEach((key, pos) => {
      for (const d of deck) if (d.key === key && !out[d.id]) out[d.id] = { to: `C${k}`, at: 4e12 + pos * 10 + Number(k) };
    });
  }
  return out;
}

/**
 * The ops patch that sends one aircraft to a destination (null: its instruction is cancelled). Its
 * flight goes on that catapult's launch queue, or comes off the queues when it is sent to park or
 * cancelled and no other aircraft of the flight is still bound for a catapult.
 */
export function withTaxi(ops: OpsState | undefined, deck: DeckId[], id: string, to: string | null, now: number): { taxi: Record<string, TaxiOrder>; launch: Queues } {
  const taxi = given(ops, deck);
  delete taxi[id];
  if (to) taxi[id] = { to, at: now };
  const key = deck.find((d) => d.id === id)?.key ?? id;
  const flights = new Set(deck.map((d) => d.key));
  const mates = deck.filter((d) => d.key === key && d.id !== id);
  const k = destCat(to);
  let launch: Queues;
  if (k) launch = withQueued(ops, flights, key, k);
  else {
    const mateCat = mates.map((m) => destCat(taxi[m.id]?.to)).find(Boolean) ?? null;
    const mateFollowsQueue = !!to && mates.some((m) => !taxi[m.id]);
    // nothing else of the flight is catapult-bound: off the queues; else leave it where it is
    launch = mateCat ? withQueued(ops, flights, key, mateCat) : mateFollowsQueue ? withQueued(ops, flights, '', null) : withQueued(ops, flights, key, null);
  }
  return { taxi, launch };
}

/** The ops patch for an edit of the launch queues: taxi instructions to a catapult the flight is no longer queued on go with it. */
export function withLaunch(ops: OpsState | undefined, deck: DeckId[], launch: Queues): { taxi: Record<string, TaxiOrder>; launch: Queues } {
  const keyOf = new Map(deck.map((d) => [d.id, d.key]));
  const taxi = Object.fromEntries(
    Object.entries(given(ops, deck)).filter(([id, o]) => {
      const k = destCat(o.to);
      return !k || !!launch[k]?.queue.includes(keyOf.get(id) ?? id);
    }),
  );
  return { taxi, launch };
}
