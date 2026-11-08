/**
 * CATCC room protocol v1: browser/desktop client <-> room service, JSON over WebSocket.
 *
 * Client -> server
 *   { t:'auth', token }                    Supabase access token (first message, required)
 *   { t:'subscribe', src }                 receive frames/seats for one source (DCS server)
 *   { t:'claim', src, seat }               claim a seat
 *   { t:'release', src, seat }
 *   { t:'ping' }
 * Server -> client
 *   { t:'hello', proto, user, sources }    after auth
 *   { t:'status', sources }                whenever a source's connection/mission state changes
 *   { t:'frame', src, seq, mt, utc, theatre, tracks }   ~1 Hz; complete picture each time
 *   { t:'seats', src, seats }
 *   { t:'pong' } | { t:'error', error }
 */
import type { CarrierWx } from '../dcs/hookProtocol.ts';
import type { Track, TrackKind, Side } from '../tracks/trackStore.ts';

export const ROOM_PROTO = 1;

export type SeatRole = 'departure' | 'marshal' | 'approach' | 'final' | 'boss' | 'lso' | 'mission_commander';
export const SEAT_ROLES: SeatRole[] = ['departure', 'marshal', 'approach', 'final', 'boss', 'lso', 'mission_commander'];

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

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'subscribe'; src: string }
  | { t: 'claim'; src: string; seat: SeatKey }
  | { t: 'release'; src: string; seat: SeatKey }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello'; proto: number; user: RoomUser; sources: SourceStatus[] }
  | { t: 'status'; sources: SourceStatus[] }
  | { t: 'frame'; src: string; seq: number; mt: number; utc?: string; theatre?: string; tracks: WireTrack[] }
  | { t: 'seats'; src: string; seats: SeatHolder[] }
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
