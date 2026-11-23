/**
 * The pilot's deck kneeboard page: which aircraft on deck is the pilot's, the rest of the flight, the
 * pilot's taxi clearance (PriFly's instruction, worked in sequence by planTaxi) and the pilot's place in
 * the line for the catapult they have been sent to.
 */
import type { ScopeTrack } from '../scopeModel.ts';
import { onCat, type DeckJet } from './deck.ts';
import { destCat, type TaxiPlan } from './taxiNet.ts';
import { catQueues, destName } from './catQueue.ts';

/** a flight's key (DCS group, else the track id): launch queues hold flights */
export const flightKey = (t: Pick<ScopeTrack, 'g' | 'id'>): string => t.g || t.id;

/**
 * The pilot's aircraft: the one they picked, else the one carrying their board number (a player's
 * aircraft before an AI one with the same number).
 */
export function findMe<J extends Pick<DeckJet, 't'>>(jets: J[], board?: number | string | null, pick?: string | null): J | undefined {
  if (pick) {
    const j = jets.find((x) => x.t.id === pick);
    if (j) return j;
  }
  const b = board === null || board === undefined || board === '' ? NaN : Number(board);
  if (!Number.isFinite(b)) return undefined;
  const hits = jets.filter((x) => x.t.bd !== undefined && Number(x.t.bd) === b);
  return hits.find((x) => x.t.ip) ?? hits[0];
}

/** one aircraft in the line for a catapult */
export interface CatLine {
  id: string;
  /** spotted on the catapult */
  spotted: boolean;
  plan?: TaxiPlan;
}

/** The line for catapult k: the aircraft spotted on it, then its queue (catQueue.ts, as PriFly's queue ghosts). */
export function catLine(jets: DeckJet[], plans: Map<string, TaxiPlan>, k: string): CatLine[] {
  const on = onCat(jets, k);
  const out: CatLine[] = on ? [{ id: on.t.id, spotted: true, plan: plans.get(on.t.id) }] : [];
  for (const id of catQueues(plans, { [k]: on?.t.id })[k].queue) out.push({ id, spotted: false, plan: plans.get(id) });
  return out;
}

export interface Clearance {
  /** large line: what the pilot is cleared to do */
  head: string;
  /** detail under it */
  sub: string;
  tone: 'clear' | 'hold' | 'none' | 'there';
}

/** What the pilot's clearance says, in words. `nameOf` gives an aircraft's board number (or callsign). */
export function clearanceText(plan: TaxiPlan | undefined, nameOf: (id: string) => string): Clearance {
  if (!plan) return { head: 'NO TAXI CLEARANCE', sub: 'Hold your position. Instructions from PriFly show here.', tone: 'none' };
  const where = destName(plan.to).toUpperCase() || plan.to;
  const cat = destCat(plan.to);
  if (plan.arrived) return { head: cat ? `ON ${where}` : `AT ${where}`, sub: cat ? 'Spotted. Await the shooter.' : 'At your parking spot.', tone: 'there' };
  if (plan.blockedBy) {
    const who = nameOf(plan.blockedBy) || 'traffic';
    return { head: `TAXI ${where}`, sub: `Hold short of ${who} · clear for ${Math.round(plan.clearLen)} of ${Math.round(plan.len)} m`, tone: 'hold' };
  }
  return { head: `TAXI ${where}`, sub: `Clear all the way · ${Math.round(plan.len)} m`, tone: 'clear' };
}
