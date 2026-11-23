/**
 * Strip filters: which flights a strip list shows. They hide strips only, never radar tracks.
 *  - AI aircraft: a flight with no player in it (a mixed flight counts as a player flight)
 *  - Other agencies: flights whose owner chip names another seat, whether handed off in the room or
 *    by the chain (a deck strip's BOSS included). Flights this seat owns and a handoff offered to
 *    this seat stay.
 *  - CVW only: only flights that spawned on this screen's carrier (core/room/spawns.ts)
 * Each list keeps its own setting per seat in this browser.
 */
import { useCallback, useState } from 'react';
import type { SeatKey } from '../../catcc/core/room/protocol.ts';
import type { Ownership } from '../../catcc/core/room/ops.ts';
import { flightSpawn } from '../../catcc/core/room/spawns.ts';
import type { Formation } from './scopeModel.ts';
import { flightKey, ownerOf } from './ownership.ts';
import type { SeatLayout } from './seats.ts';

export interface StripFilter {
  /** show AI flights */
  ai: boolean;
  /** show flights another seat controls */
  other: boolean;
  /** only flights of this carrier's air wing */
  cvw: boolean;
}

/** every switch off by default, in every view (the user): AI flights and other agencies' flights hidden, CVW only off */
export const STRIP_FILTER_DEFAULT: StripFilter = { ai: false, other: false, cvw: false };
export const STRIP_FILTER_ITEMS: [keyof StripFilter, string][] = [
  ['ai', 'AI aircraft'],
  ['other', 'Other agencies'],
  ['cvw', 'CVW only'],
];

/** No member is a player. A source that doesn't say (Tacview: no `ip`) never makes a flight AI. */
export const isAiFlight = (f: Pick<Formation, 'members'>): boolean => f.members.length > 0 && f.members.every((m) => m.ip === false);

export interface StripCtx {
  /** this screen's carrier */
  hull: string;
  /** this screen's seat (under the layout, as HandoffCtx.me) */
  me: SeatKey;
  layout: SeatLayout;
  owners: Record<string, Ownership>;
  /** track id → spawn carrier hull */
  spawns: Record<string, string>;
}

/** What the filters look at for one flight; `deck`: it is on the deck list (PriFly has it, whoever had it airborne). */
export function stripFacts(f: Formation, deck: boolean, ctx: StripCtx): { ai: boolean; other: boolean; cvw: boolean } {
  const v = ownerOf(flightKey(f), ctx.hull, deck ? 'deck' : 'inbound', f.lead.rng, ctx.layout, ctx.owners);
  const same = (s?: SeatKey) => !!s && s.carrier === ctx.me.carrier && s.role === ctx.me.role;
  return {
    ai: isAiFlight(f),
    // any owner but this seat, handed off or by the chain (the user: a deck strip's BOSS counts)
    other: !same(v.owner) && !same(v.pending?.to),
    cvw: flightSpawn(f.lead.id, f.members.map((m) => m.id), ctx.spawns) === ctx.hull,
  };
}

export const stripShown = (facts: { ai: boolean; other: boolean; cvw: boolean }, filter: StripFilter): boolean =>
  (filter.ai || !facts.ai) && (filter.other || !facts.other) && (!filter.cvw || facts.cvw);

export const isDefaultFilter = (f: StripFilter) => f.ai === STRIP_FILTER_DEFAULT.ai && f.other === STRIP_FILTER_DEFAULT.other && f.cvw === STRIP_FILTER_DEFAULT.cvw;

/** localStorage key: per seat and list */
// (v2: the defaults changed; settings saved under the old defaults are not carried over)
export const stripFilterKey = (seat: string, list: string) => `catcc.strips.filter2.${seat}.${list}`;

export function loadStripFilter(seat: string, list: string): StripFilter {
  try {
    const v = localStorage.getItem(stripFilterKey(seat, list));
    if (!v) return { ...STRIP_FILTER_DEFAULT };
    const o = JSON.parse(v) as Partial<StripFilter>;
    const b = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
    return { ai: b(o.ai, STRIP_FILTER_DEFAULT.ai), other: b(o.other, STRIP_FILTER_DEFAULT.other), cvw: b(o.cvw, STRIP_FILTER_DEFAULT.cvw) };
  } catch {
    return { ...STRIP_FILTER_DEFAULT };
  }
}

export function saveStripFilter(seat: string, list: string, f: StripFilter) {
  try {
    localStorage.setItem(stripFilterKey(seat, list), JSON.stringify(f));
  } catch {
    /* private window */
  }
}

/** One list's filter for a seat, saved as it changes. */
export function useStripFilter(seat: string, list: string): [StripFilter, (k: keyof StripFilter) => void] {
  const [f, setF] = useState<StripFilter>(() => loadStripFilter(seat, list));
  const toggle = useCallback(
    (k: keyof StripFilter) =>
      setF((cur) => {
        const n = { ...cur, [k]: !cur[k] };
        saveStripFilter(seat, list, n);
        return n;
      }),
    [seat, list],
  );
  return [f, toggle];
}
