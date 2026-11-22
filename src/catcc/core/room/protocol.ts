/**
 * CATCC room protocol v1: browser/desktop client <-> room service, JSON over WebSocket.
 *
 * Client -> server
 *   { t:'auth', token }                    Supabase access token (first message, required)
 *   { t:'subscribe', src }                 receive frames/seats for one source (DCS server)
 *   { t:'claim', src, seat }               claim a seat
 *   { t:'release', src, seat }
 *   { t:'plan', src, carrier, plan }      replace one carrier's radials/stacks
 *   { t:'assign', src, trackId, assignment|null }
 *   { t:'launch', src, carrier, trackId, clear }  PriFly clears (or un-clears) an aircraft to launch
 *   { t:'ping' }
 * Plan/assign edits are open to any signed-in user until someone holds a seat on that
 * carrier (or MC); then only seat holders may edit.
 * Server -> client
 *   { t:'hello', proto, user, sources }    after auth
 *   { t:'status', sources }                whenever a source's connection/mission state changes
 *   { t:'frame', src, seq, mt, utc, theatre, tracks }   ~1 Hz; complete picture each time
 *   { t:'seats', src, seats }
 *   { t:'plans', src, plans } | { t:'assignments', src, assignments }
 *   { t:'env', src, env }                  mission weather + ship routes (hook sources), ~30 s
 *   { t:'orders', src, orders }            what the DCS hook did with each ship order (helm, route, station)
 *   { t:'launch', src, launch }            launch clearance per carrier (see core/room/launch.ts)
 *   { t:'pong' } | { t:'error', error }
 * Close codes: 4001 no auth message in time, 4003 the sign-in isn't valid, 4403 signed in but not a
 * member of the wing (the close reason says why; see catcc-server/room/membership.ts).
 */
import type { CarrierWx, HookEnv, OrderPoint } from '../dcs/hookProtocol.ts';
import type { Track, TrackKind, Side } from '../tracks/trackStore.ts';
import type { OpsState, Ownership } from './ops.ts';
import type { LaunchState } from './launch.ts';

export const ROOM_PROTO = 1;

/**
 * Seats: a function within a location on the ship (see src/components/catcc/seats.ts for the
 * condensed and expanded layouts). Condensed seats cover a whole location (catcc, ood, lso, ...).
 */
export type SeatRole =
  // CDC
  | 'strike'
  | 'aw'
  | 'suw'
  // CATCC
  | 'catcc'
  | 'airops'
  | 'departure'
  | 'marshal'
  | 'approach'
  | 'final'
  // PriFly
  | 'boss'
  | 'miniboss'
  | 'shooter'
  // Bridge
  | 'ood'
  // LSO platform
  | 'lso'
  | 'clso'
  | 'blso'
  | 'writer'
  | 'mission_commander';
/**
 * Seats that edit a carrier's shared plan (radials, stacks, coordination lines, helm orders). While
 * any of them is held for a carrier (or the mission commander seat), only their holders may edit it.
 */
export const PLAN_ROLES: SeatRole[] = ['catcc', 'airops', 'departure', 'marshal', 'approach', 'final', 'ood', 'mission_commander'];
export const SEAT_ROLES: SeatRole[] = ['strike', 'aw', 'suw', 'catcc', 'airops', 'departure', 'marshal', 'approach', 'final', 'boss', 'miniboss', 'shooter', 'ood', 'lso', 'clso', 'blso', 'writer', 'mission_commander'];

/** A seat is a role on one carrier (hull, e.g. "CVN-72"); the mission commander seat uses carrier "*". */
export interface SeatKey {
  carrier: string;
  role: SeatRole;
}

export interface SeatHolder extends SeatKey {
  userId: string;
  name: string;
  board?: number;
  since: number;
  /** true while the holder has no live connection (seat kept for a grace period) */
  away?: boolean;
}

/** the sign-in token isn't valid */
export const CLOSE_AUTH_FAILED = 4003;
/** a valid sign-in that isn't a member of the wing; the close reason says why */
export const CLOSE_FORBIDDEN = 4403;

export interface RoomUser {
  userId: string;
  name: string;
  board?: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  kind: 'hook' | 'tacview';
  connected: boolean;
  /** hook: authenticated with the DCS hook */
  authed?: boolean;
  mission?: { state: 'running' | 'stopped'; name: string };
  lastError?: string;
  lastFrameAt?: number;
  /** hook: it accepts ship orders (its config sets commands = true) */
  cmds?: boolean;
  /** hook: Air Boss ship control is available (helm orders steer to a heading and ring bells, astern too) */
  ab?: boolean;
}

/**
 * The last ship order the room sent to DCS for one ship (keyed by carrier hull, or escort track id):
 * what it was, when (ms), and the hook's answer (absent while waiting).
 */
export interface OrderStatus {
  op: 'helm' | 'route' | 'station';
  at: number;
  ok?: boolean;
  error?: string;
}

/** Compact track for the wire. Units: alt ft, gs kt, vs fpm, angles deg true. */
export interface WireTrack {
  id: string;
  k: TrackKind;
  ty: string;
  sd: Side;
  cs?: string;
  fl?: string;
  bd?: string;
  pl?: string;
  /** raw pilot/unit string */
  pi?: string;
  g?: string;
  hull?: string;
  /** ships: DCS display name of the type */
  dn?: string;
  /** ships: the unit's name in the mission (often the ship's own name, "USS Leyte Gulf") */
  un?: string;
  ip?: boolean;
  lat: number;
  lon: number;
  alt: number;
  hdg?: number;
  crs?: number;
  gs?: number;
  vs?: number;
  /** fuel fraction and pounds */
  f?: number;
  lb?: number;
  air?: boolean;
  wx?: CarrierWx;
}

/** Marshal stack on a radial; base angels; right-hand (emergency) pattern. */
export interface StackDef {
  id: string;
  r: number;
  base: number;
  rh?: boolean;
}

/** Per-carrier radials plan, shared in the room (handoff §2). */
export interface CarrierPlan {
  deps: number[];
  stacks: StackDef[];
  /** ids of stacks switched off (not drawn, not assignable), incl. "E" emergency and "H" helo */
  off?: string[];
  /** manual coordination lines toward other carriers (by hull): line bearing and offset (NM) from this ship */
  coord?: Record<string, { brg: number; off: number }>;
  /** the bridge's ordered course (°T) and speed (kt) */
  helm?: { crs: number; kt: number };
  /**
   * The bridge's plotted waypoints (from the ship, in order) and whether the ship is following them.
   * Following a route and a helm order exclude each other: whichever was set last is in force.
   */
  route?: { pts: OrderPoint[]; active: boolean };
  /** the bridge's recovery window (mission time, s): into the wind from startMt until endMt, then back to PIM */
  recovery?: { startMt: number; endMt: number };
}

/** Marshal assignment for one track. Times are seconds of the UTC day. */
export interface Assignment {
  stackId: string;
  angels: number;
  eatS: number;
  fixS: number;
  /** carrier hull the stack belongs to */
  carrier?: string;
}

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'plan'; src: string; carrier: string; plan: CarrierPlan }
  | { t: 'assign'; src: string; trackId: string; assignment: Assignment | null }
  /** commit (or clear, with target null) an intercept assignment: one interceptor track -> one target track */
  | { t: 'intercept'; src: string; interceptor: string; target: string | null }
  | { t: 'subscribe'; src: string }
  | { t: 'claim'; src: string; seat: SeatKey }
  | { t: 'release'; src: string; seat: SeatKey }
  /** hand a flight from `from` (its current owner as the sender sees it) to `to`; `to` null recalls a pending handoff */
  | { t: 'handoff'; src: string; key: string; from: SeatKey; to: SeatKey | null }
  /** accept a handoff pending to a seat the user may act for */
  | { t: 'accept'; src: string; key: string }
  /** patch a carrier's shared ops state (deck, aids, lights, launch, formation) */
  | { t: 'ops'; src: string; carrier: string; patch: Partial<Record<keyof OpsState, unknown>> }
  /** the carrier's clearing seat (Shooter, else Air Boss) clears an aircraft on deck to launch, or takes it back */
  | { t: 'launch'; src: string; carrier: string; trackId: string; clear: boolean }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello'; proto: number; user: RoomUser; sources: SourceStatus[] }
  | { t: 'status'; sources: SourceStatus[] }
  | { t: 'frame'; src: string; seq: number; mt: number; utc?: string; theatre?: string; tracks: WireTrack[] }
  | { t: 'seats'; src: string; seats: SeatHolder[] }
  | { t: 'plans'; src: string; plans: Record<string, CarrierPlan> }
  | { t: 'env'; src: string; env: HookEnv }
  | { t: 'assignments'; src: string; assignments: Record<string, Assignment> }
  /** committed intercept assignments, keyed by interceptor track id -> target track id */
  | { t: 'intercepts'; src: string; intercepts: Record<string, string> }
  | { t: 'owners'; src: string; owners: Record<string, Ownership> }
  | { t: 'ops'; src: string; ops: Record<string, OpsState> }
  | { t: 'orders'; src: string; orders: Record<string, OrderStatus> }
  | { t: 'launch'; src: string; launch: Record<string, LaunchState> }
  | { t: 'pong' }
  | { t: 'error'; error: string };

const r = (n: number | undefined, dp: number): number | undefined =>
  n === undefined || !Number.isFinite(n) ? undefined : Math.round(n * 10 ** dp) / 10 ** dp;

export function toWire(t: Track): WireTrack {
  return {
    id: t.id,
    k: t.kind,
    ty: t.type,
    sd: t.side,
    cs: t.callsign,
    fl: t.flight,
    bd: t.board,
    pl: t.player,
    pi: t.pilot,
    g: t.group,
    hull: t.hull,
    ...(t.kind === 'ship' ? { dn: t.displayName, un: t.unitName } : {}),
    ip: t.isPlayer,
    lat: r(t.lat, 6)!,
    lon: r(t.lon, 6)!,
    alt: Math.round(t.altFt),
    hdg: r(t.headingDeg, 1),
    crs: r(t.courseDeg, 1),
    gs: r(t.gsKt, 0),
    vs: r(t.vsFpm, -1),
    f: r(t.fuelFrac, 3),
    lb: r(t.fuelLb, -1),
    air: t.inAir,
    wx: t.wx,
  };
}

export const seatId = (s: SeatKey): string => `${s.carrier}:${s.role}`;

/** Validate a client-supplied plan (bounds, counts, ids). Returns a clean copy or null. */
export function cleanPlan(p: unknown): CarrierPlan | null {
  if (!p || typeof p !== 'object') return null;
  const { deps, stacks } = p as CarrierPlan;
  if (!Array.isArray(deps) || !Array.isArray(stacks) || deps.length > 8 || stacks.length > 8) return null;
  const okAngle = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 360;
  if (!deps.every(okAngle)) return null;
  const out: StackDef[] = [];
  for (const s of stacks) {
    if (!s || typeof s.id !== 'string' || !/^[A-Z0-9]{1,2}$/.test(s.id) || !okAngle(s.r)) return null;
    if (typeof s.base !== 'number' || !Number.isInteger(s.base) || s.base < 1 || s.base > 30) return null;
    out.push({ id: s.id, r: s.r, base: s.base, ...(s.rh ? { rh: true } : {}) });
  }
  const off = (p as CarrierPlan).off;
  if (off !== undefined && (!Array.isArray(off) || off.length > 12 || !off.every((x) => typeof x === 'string' && /^[A-Z0-9]{1,2}$/.test(x)))) return null;
  const coordIn = (p as CarrierPlan).coord;
  let coord: Record<string, { brg: number; off: number }> | undefined;
  if (coordIn !== undefined) {
    if (!coordIn || typeof coordIn !== 'object' || Object.keys(coordIn).length > 4) return null;
    coord = {};
    for (const [hull, v] of Object.entries(coordIn)) {
      if (hull.length > 16 || !v || typeof v.brg !== 'number' || typeof v.off !== 'number' || !Number.isFinite(v.brg) || !Number.isFinite(v.off)) return null;
      if (v.brg < 0 || v.brg >= 360 || Math.abs(v.off) > 100) return null;
      coord[hull] = { brg: v.brg, off: v.off };
    }
  }
  const helmIn = (p as CarrierPlan).helm;
  let helm: { crs: number; kt: number } | undefined;
  if (helmIn !== undefined) {
    if (!helmIn || typeof helmIn !== 'object' || !okAngle(helmIn.crs) || typeof helmIn.kt !== 'number' || !Number.isFinite(helmIn.kt) || helmIn.kt < -20 || helmIn.kt > 40) return null;
    helm = { crs: helmIn.crs, kt: helmIn.kt };
  }
  const routeIn = (p as CarrierPlan).route;
  let route: CarrierPlan['route'];
  if (routeIn !== undefined) {
    if (!routeIn || typeof routeIn !== 'object' || typeof routeIn.active !== 'boolean' || !Array.isArray(routeIn.pts) || routeIn.pts.length > 20) return null;
    const fin = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
    if (!routeIn.pts.every((q) => q && fin(q.lat, -90, 90) && fin(q.lon, -180, 180) && fin(q.kt, 0, 40))) return null;
    route = { pts: routeIn.pts.map((q) => ({ lat: q.lat, lon: q.lon, kt: q.kt })), active: routeIn.active && routeIn.pts.length > 0 };
  }
  const recIn = (p as CarrierPlan).recovery;
  let recovery: CarrierPlan['recovery'];
  if (recIn !== undefined) {
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e7;
    if (!recIn || !ok(recIn.startMt) || !ok(recIn.endMt) || recIn.endMt < recIn.startMt || recIn.endMt - recIn.startMt > 6 * 3600) return null;
    recovery = { startMt: recIn.startMt, endMt: recIn.endMt };
  }
  return {
    deps: [...deps],
    stacks: out,
    ...(off?.length ? { off: [...off] } : {}),
    ...(coord && Object.keys(coord).length ? { coord } : {}),
    ...(helm ? { helm } : {}),
    ...(route && route.pts.length ? { route } : {}),
    ...(recovery ? { recovery } : {}),
  };
}

export function cleanAssignment(a: unknown): Assignment | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Assignment;
  const fin = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (typeof x.stackId !== 'string' || x.stackId.length > 2 || !fin(x.angels) || !fin(x.eatS) || !fin(x.fixS)) return null;
  if (x.carrier !== undefined && (typeof x.carrier !== 'string' || x.carrier.length > 16)) return null;
  return { stackId: x.stackId, angels: x.angels, eatS: x.eatS, fixS: x.fixS, carrier: x.carrier };
}
