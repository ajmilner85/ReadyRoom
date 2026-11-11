/**
 * Track ownership: every flight has an owner seat. Until a controller hands it off, the owner is
 * derived from where the flight is in its sortie (the standard handoff chain); once handed off
 * in the room, the room's record wins. Owners are mapped onto the staffing layout, so under the
 * condensed layout they are locations (STRIKE, CATCC, LSO).
 */
import type { SeatHolder, SeatKey, SeatRole } from '../../catcc/core/room/protocol.ts';
import type { Ownership } from '../../catcc/core/room/ops.ts';
import type { Formation, Phase } from './scopeModel.ts';
import type { SeatLayout } from './seats.ts';

export const flightKey = (f: Formation): string => f.group || f.lead.id;

/** The seat a flight belongs to by where it is: Strike far out, Marshal inbound, then Approach, Final, LSO. */
export function autoRole(phase: Phase, rngNm: number): SeatRole {
  switch (phase) {
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

/** The next seat in the standard chain: Strike → Marshal → Approach → Final → LSO; Departure → Strike. */
export function nextRole(owner: SeatRole, layout: SeatLayout): SeatRole | null {
  const next: Partial<Record<SeatRole, SeatRole>> = {
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
const CHAIN: SeatRole[] = ['departure', 'airops', 'strike', 'aw', 'suw', 'catcc', 'marshal', 'approach', 'final', 'lso', 'clso'];
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
}

export function ownerOf(key: string, carrier: string, phase: Phase, rngNm: number, layout: SeatLayout, owners: Record<string, Ownership>): OwnerView {
  const o = owners[key];
  if (o) {
    const role = seatFor(o.owner.role, layout);
    const expected = seatFor(autoRole(phase, rngNm), layout);
    return {
      key,
      owner: { carrier: o.owner.carrier, role },
      explicit: true,
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
  seats: SeatHolder[];
  userId?: string;
  onHandoff: (key: string, from: SeatKey, to: SeatKey | null) => void;
  onAccept: (key: string) => void;
}

const same = (a: SeatKey, b: SeatKey) => a.carrier === b.carrier && a.role === b.role;

/** What this screen can do about a flight's ownership right now. */
export function handoffState(v: OwnerView, ctx: HandoffCtx) {
  const mine = same(v.owner, ctx.me) && mayActFor(ctx.me, ctx.seats, ctx.userId);
  const incoming = !!v.pending && same(v.pending.to, ctx.me) && mayActFor(ctx.me, ctx.seats, ctx.userId);
  const outgoing = !!v.pending && mine;
  return { mine, incoming, outgoing };
}
