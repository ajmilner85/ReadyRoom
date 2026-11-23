/**
 * Track ownership: every flight has an owner seat. Until a controller hands it off, the owner is
 * derived from where the flight is in its sortie (the standard handoff chain); once handed off
 * in the room, the room's record wins. Owners are mapped onto the staffing layout, so under the
 * condensed layout they are locations (STRIKE, CATCC, LSO).
 */
import type { SeatHolder, SeatKey, SeatRole } from '../../catcc/core/room/protocol.ts';
import type { Ownership } from '../../catcc/core/room/ops.ts';
import type { Formation, Phase } from './scopeModel.ts';
import { seatsIn, type SeatLayout } from './seats.ts';

export const flightKey = (f: Formation): string => f.group || f.lead.id;

/** The seat a flight belongs to by where it is: Strike far out, Marshal inbound, then Approach, Final, LSO. */
export function autoRole(phase: Phase, rngNm: number): SeatRole {
  switch (phase) {
    // on the deck the Air Boss (PriFly) has it: before launch, and from touchdown
    case 'deck':
      return 'boss';
    case 'departure':
      return rngNm < 50 ? 'departure' : 'strike';
    case 'inbound':
      return rngNm > 50 ? 'strike' : 'marshal';
    case 'marshal':
      return 'marshal';
    case 'approach':
      return rngNm <= 0.75 ? 'lso' : rngNm <= 6 ? 'final' : 'approach';
    case 'support':
      return rngNm > 50 ? 'strike' : 'airops';
    default:
      return 'strike';
  }
}

const CDC: SeatRole[] = ['strike', 'aw', 'suw', 'mission_commander'];
const CATCC: SeatRole[] = ['catcc', 'airops', 'departure', 'marshal', 'approach', 'final'];
const LSO: SeatRole[] = ['lso', 'clso', 'blso', 'writer'];

/** The seat that does a function under a layout: condensed seats cover their whole location. */
export function seatFor(role: SeatRole, layout: SeatLayout): SeatRole {
  if (layout === 'condensed') {
    if (CDC.includes(role)) return 'strike';
    if (CATCC.includes(role)) return 'catcc';
    if (LSO.includes(role)) return 'lso';
    if (role === 'miniboss') return 'boss';
    return role;
  }
  if (role === 'catcc') return 'airops';
  if (role === 'lso') return 'clso';
  return role;
}

/**
 * The next seat in the standard chain: Strike → Marshal → Approach → Final → LSO → PriFly (on touchdown);
 * PriFly → Departure (when airborne) → Strike. The PriFly steps are automatic (autoRole 'deck', and the room
 * drops a flight's handed-off owner once it is all on deck).
 */
export function nextRole(owner: SeatRole, layout: SeatLayout): SeatRole | null {
  const next: Partial<Record<SeatRole, SeatRole>> = {
    boss: 'departure',
    miniboss: 'departure',
    strike: 'marshal',
    aw: 'marshal',
    suw: 'marshal',
    departure: 'strike',
    airops: 'marshal',
    marshal: 'approach',
    approach: 'final',
    final: 'lso',
    catcc: 'lso',
    lso: 'catcc',
    clso: 'approach',
  };
  const n = next[owner];
  if (!n) return null;
  const s = seatFor(n, layout);
  return s === owner ? null : s;
}

/** position along the recovery chain (departures and support sit before it) */
const CHAIN: SeatRole[] = ['boss', 'miniboss', 'departure', 'airops', 'strike', 'aw', 'suw', 'catcc', 'marshal', 'approach', 'final', 'lso', 'clso'];
const chainIndex = (r: SeatRole) => CHAIN.indexOf(r);

/** Short owner chip label. */
export const OWNER_LABEL: Record<SeatRole, string> = {
  strike: 'STRIKE',
  aw: 'AW',
  suw: 'SUW',
  mission_commander: 'MC',
  catcc: 'CATCC',
  airops: 'AIR OPS',
  departure: 'DEP',
  marshal: 'MSHL',
  approach: 'APP',
  final: 'FINAL',
  boss: 'BOSS',
  miniboss: 'TWR',
  shooter: 'SHOOTER',
  ood: 'OOD',
  lso: 'LSO',
  clso: 'LSO',
  blso: 'BLSO',
  writer: 'WRITER',
};

export interface OwnerView {
  key: string;
  owner: SeatKey;
  /** true when the owner comes from the room (a completed handoff), not the default chain */
  explicit: boolean;
  pending?: { to: SeatKey; at: number };
  /** the seat the standard chain puts the flight with now, when that isn't its owner: a handoff is due */
  due?: SeatRole;
  /** the owner assumed control from this seat (no handoff) */
  took?: { from: SeatKey; at: number };
}

export function ownerOf(key: string, carrier: string, phase: Phase, rngNm: number, layout: SeatLayout, owners: Record<string, Ownership>): OwnerView {
  const o = owners[key];
  // on the deck it is PriFly's whoever had it airborne (the room drops that record once the flight is down)
  if (o && phase !== 'deck') {
    const role = seatFor(o.owner.role, layout);
    const expected = seatFor(autoRole(phase, rngNm), layout);
    return {
      key,
      owner: { carrier: o.owner.carrier, role },
      explicit: true,
      ...(o.took ? { took: { from: { carrier: o.took.from.carrier, role: seatFor(o.took.from.role, layout) }, at: o.took.at } } : {}),
      ...(o.pending ? { pending: { to: { carrier: o.pending.to.carrier, role: seatFor(o.pending.to.role, layout) }, at: o.pending.at } } : {}),
      // only forward along the chain (a flight handed on early isn't "due" back)
      ...(expected !== role && chainIndex(expected) > chainIndex(role) ? { due: expected } : {}),
    };
  }
  return { key, owner: { carrier, role: seatFor(autoRole(phase, rngNm), layout) }, explicit: false };
}

/** Client mirror of the room rule: a user acts for a seat they hold, or one nobody holds. */
export const mayActFor = (seat: SeatKey, seats: SeatHolder[], userId?: string): boolean => {
  const h = seats.find((s) => s.carrier === seat.carrier && s.role === seat.role);
  return !h || h.userId === userId;
};

export interface HandoffCtx {
  layout: SeatLayout;
  /** the seat this screen is acting as (the active seat on the focus carrier) */
  me: SeatKey;
  /** hulls of the carriers in the picture: a flight can be handed to another carrier's seats */
  carriers?: string[];
  seats: SeatHolder[];
  userId?: string;
  onHandoff: (key: string, from: SeatKey, to: SeatKey | null) => void;
  onAccept: (key: string) => void;
  /** take the flight for this screen's seat, without a handoff */
  onAssume: (key: string, from: SeatKey) => void;
}

const same = (a: SeatKey, b: SeatKey) => a.carrier === b.carrier && a.role === b.role;

/** A seat's label as this screen shows it: the hull goes in front when the seat is on another carrier. */
export const seatLabel = (s: SeatKey, me: SeatKey): string => (s.carrier && s.carrier !== me.carrier ? `${s.carrier} ${OWNER_LABEL[s.role]}` : OWNER_LABEL[s.role]);

/**
 * Whether a flight is on this carrier's lists: the room's owner (or a handoff pending to this carrier)
 * wins over geography, so a flight handed to another carrier moves to its strips; without one, the
 * nearest carrier (`geo`, none when out of range of every carrier) has it.
 */
export function onCarrier(key: string, geo: string | undefined, hull: string | undefined, owners: Record<string, Ownership>): boolean {
  const o = owners[key];
  if (o) return o.owner.carrier === hull || o.pending?.to.carrier === hull;
  return !geo || geo === hull;
}

/** What this screen can do about a flight's ownership right now. */
export function handoffState(v: OwnerView, ctx: HandoffCtx) {
  const mine = same(v.owner, ctx.me) && mayActFor(ctx.me, ctx.seats, ctx.userId);
  const incoming = !!v.pending && same(v.pending.to, ctx.me) && mayActFor(ctx.me, ctx.seats, ctx.userId);
  const outgoing = !!v.pending && mine;
  const act = !!ctx.me.carrier && mayActFor(ctx.me, ctx.seats, ctx.userId);
  // someone else's flight: this seat can assume control of it (an offer to this seat is accepted instead)
  const canAssume = act && !mine && !incoming;
  // this seat's flight was taken without a handoff: tell it, so it can take it back
  const lost = act && !mine && !!v.took && same(v.took.from, ctx.me);
  return { mine, incoming, outgoing, canAssume, lost };
}

/** seats that take handoffs: the control seats (no PriFly, bridge or mission commander) */
const HANDOFF_SEATS = (layout: HandoffCtx['layout']) =>
  seatsIn(layout).filter((s) => s.id !== 'mission_commander' && s.id !== 'boss' && s.id !== 'miniboss' && s.id !== 'ood' && s.id !== 'writer' && s.id !== 'blso');

/** The destinations, one group per carrier in the picture (own carrier first, the due/next seat at its top). */
export function handoffGroups(v: OwnerView, ctx: HandoffCtx, nxt: SeatRole | null): { hull: string; seats: { role: SeatRole; label: string }[] }[] {
  const seats = HANDOFF_SEATS(ctx.layout);
  const own = v.owner.carrier;
  const hulls = [own, ...(ctx.carriers ?? []).filter((h, i, a) => h && h !== own && a.indexOf(h) === i)];
  return hulls.map((hull) => {
    const list = seats.filter((s) => hull !== own || s.id !== v.owner.role).map((s) => ({ role: s.id, label: s.label }));
    if (hull === own && nxt) {
      const i = list.findIndex((s) => s.role === nxt);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return { hull, seats: list };
  });
}
