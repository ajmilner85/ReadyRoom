/**
 * Launch clearance (PriFly authorises each catapult shot).
 *
 * The seat that clears launches on a carrier is the Shooter if someone holds it, else the Air Boss.
 * A seat whose holder has dropped off (away) doesn't count. With neither held, nobody has to clear
 * anything: launches go on the pilot's salute, as in stock DCS.
 *
 * While a carrier has a clearing seat, every player aircraft on its deck is held until that seat
 * clears it. The room sends the DCS hook the names of the players held; the pilots' mod keeps the
 * shooter from firing for them. Anything missing (no seat, no room, no mod) means no hold.
 *
 * Chocks work the same way: while the Air Boss or Mini Boss seat is held, a player aircraft on deck
 * keeps its chocks until PriFly gives it a taxi instruction. The pilot asking for them to come off
 * (or saluting) marks it ready to taxi; the mod removes them once the instruction is given.
 */
import { distanceNm, M_PER_NM } from '../geo.ts';
import type { SeatHolder, SeatKey, WireTrack } from './protocol.ts';

export interface LaunchState {
  /** the seat that clears launches; null: nobody does, launches go on the salute */
  auth: (SeatKey & { name: string }) | null;
  /** player aircraft on deck held for clearance (track ids) */
  hold: string[];
  /** cleared aircraft: track id → when (ms) */
  cleared: Record<string, number>;
  /** aircraft whose pilot has saluted (reported by their mod): track id → when (ms) */
  saluted: Record<string, number>;
  /** launch bar down (reported by their mod): on a catapult, the shooter is ready and waiting for the clearance */
  barDown?: Record<string, number>;
  /** the seat that releases chocks (gives taxi instructions); null: nobody does, chocks come off on request */
  taxiAuth?: (SeatKey & { name: string }) | null;
  /** player aircraft on deck whose chocks are held: no taxi instruction yet (track ids) */
  chocks?: string[];
  /** ready to taxi: the pilot asked for the chocks to come off, or saluted, with no taxi instruction yet */
  taxiReady?: Record<string, number>;
}

/** Shooter, else Air Boss, held by someone still connected. */
export function launchAuthority(seats: Iterable<SeatHolder>, carrier: string): SeatHolder | null {
  const here = [...seats].filter((s) => s.carrier === carrier && !s.away);
  return here.find((s) => s.role === 'shooter') ?? here.find((s) => s.role === 'boss') ?? null;
}

/** Air Boss, else Mini Boss, held by someone still connected: they release chocks by giving taxi instructions. */
export function taxiAuthority(seats: Iterable<SeatHolder>, carrier: string): SeatHolder | null {
  const here = [...seats].filter((s) => s.carrier === carrier && !s.away);
  return here.find((s) => s.role === 'boss') ?? here.find((s) => s.role === 'miniboss') ?? null;
}

/** within this of the carrier's reference point and not flying: on its deck */
const DECK_RADIUS_M = 220;
/** the deck is ~20 m above the water; anything below this is on deck */
const DECK_MAX_ALT_FT = 200;

/** Aircraft on each carrier's deck (by hull). */
export function aircraftOnDeck(tracks: WireTrack[]): Map<string, WireTrack[]> {
  const out = new Map<string, WireTrack[]>();
  const cvs = tracks.filter((t) => t.k === 'carrier' && t.hull);
  for (const t of tracks) {
    if (t.k !== 'fixedwing' && t.k !== 'rotary') continue;
    if (t.air || t.alt > DECK_MAX_ALT_FT) continue;
    const cv = cvs.find((c) => distanceNm(c.lat, c.lon, t.lat, t.lon) * M_PER_NM < DECK_RADIUS_M);
    if (!cv) continue;
    const list = out.get(cv.hull!) ?? [];
    list.push(t);
    out.set(cv.hull!, list);
  }
  return out;
}

/**
 * The launch state of every carrier in the picture. Clearances and salutes stay with an aircraft
 * while it is on that deck and drop when it launches or leaves the picture.
 */
export function computeLaunch(
  prev: Record<string, LaunchState>,
  seats: Iterable<SeatHolder>,
  tracks: WireTrack[],
  /** each carrier's taxi instructions (track ids that have one) */
  taxied: (hull: string) => Set<string> = () => new Set(),
): Record<string, LaunchState> {
  const seatList = [...seats];
  const decks = aircraftOnDeck(tracks);
  const out: Record<string, LaunchState> = {};
  const seatOf = (a: SeatHolder | null) => (a ? { carrier: a.carrier, role: a.role, name: a.name } : null);
  for (const cv of tracks.filter((t) => t.k === 'carrier' && t.hull)) {
    const hull = cv.hull!;
    const onDeck = decks.get(hull) ?? [];
    const ids = new Set(onDeck.map((t) => t.id));
    const keep = (r: Record<string, number> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([id]) => ids.has(id)));
    const cleared = keep(prev[hull]?.cleared);
    const saluted = keep(prev[hull]?.saluted);
    const barDown = keep(prev[hull]?.barDown);
    const sent = taxied(hull);
    // ready to taxi lasts until the taxi instruction is given
    const taxiReady = Object.fromEntries(Object.entries(keep(prev[hull]?.taxiReady)).filter(([id]) => !sent.has(id)));
    const a = launchAuthority(seatList, hull);
    const hold = a ? onDeck.filter((t) => t.ip && !cleared[t.id]).map((t) => t.id) : [];
    const ta = taxiAuthority(seatList, hull);
    const chocks = ta ? onDeck.filter((t) => t.ip && !sent.has(t.id)).map((t) => t.id) : [];
    out[hull] = { auth: seatOf(a), hold, cleared, saluted, barDown, taxiAuth: seatOf(ta), chocks, taxiReady };
  }
  return out;
}

/** The DCS player names (what the hook and the pilots' mod know) of every aircraft held for launch. */
export function heldPlayers(launch: Record<string, LaunchState>, tracks: WireTrack[]): string[] {
  return playerNames(launch, tracks, (st) => st.hold);
}

/** The DCS player names of every aircraft whose chocks are held. */
export function chockedPlayers(launch: Record<string, LaunchState>, tracks: WireTrack[]): string[] {
  return playerNames(launch, tracks, (st) => st.chocks ?? []);
}

function playerNames(launch: Record<string, LaunchState>, tracks: WireTrack[], pick: (st: LaunchState) => string[]): string[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const names = new Set<string>();
  for (const st of Object.values(launch)) for (const id of pick(st)) {
    const t = byId.get(id);
    // a player's unit reports the player's name as its pilot
    const name = t?.ip ? t.pi : undefined;
    if (name) names.add(name);
  }
  return [...names].sort();
}
