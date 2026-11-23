/**
 * Shared per-carrier operational state held by the room: track ownership and handoffs, PriFly's
 * deck status, landing aids, deck lights, the launch queue and the CSG formation. Every field has
 * a validator; the room only stores what passes.
 */
import { SEAT_ROLES, type SeatKey, type SeatRole } from './protocol.ts';

// ---------------------------------------------------------------- ownership / handoffs

/** One flight's owner seat and any handoff in progress. Keyed by flight (DCS group, else track id). */
export interface Ownership {
  owner: SeatKey;
  pending?: { to: SeatKey; at: number };
  /** the owner assumed control (took it without a handoff) from this seat: its holder is told, and can take it back */
  took?: { from: SeatKey; at: number };
}

const okSeat = (s: unknown): s is SeatKey => {
  if (!s || typeof s !== 'object') return false;
  const { carrier, role } = s as SeatKey;
  return typeof carrier === 'string' && carrier.length >= 1 && carrier.length <= 16 && SEAT_ROLES.includes(role as SeatRole);
};
export const okFlightKey = (k: unknown): k is string => typeof k === 'string' && k.length >= 1 && k.length <= 64;
export const cleanSeat = (s: unknown): SeatKey | null => (okSeat(s) ? { carrier: s.carrier, role: s.role } : null);
export const sameSeat = (a?: SeatKey | null, b?: SeatKey | null) => !!a && !!b && a.carrier === b.carrier && a.role === b.role;

// ---------------------------------------------------------------- ops state

export type CatStatus = 'ready' | 'hold' | 'down' | 'suspended';
export type AclsMode = 'I' | 'IA' | 'II' | 'III';
export type LightSetting = 'ON' | 'OFF' | 'AUTO' | 'NIGHT' | 'VIOLET' | 'YELLOW' | 'GREEN' | 'RED';
export type EscortRole = 'AAW' | 'ASW' | 'PG' | 'PKT';

/** A station relative to the formation axis (the BRC): bearings are relative, ranges NM. */
export type Station =
  | { kind: 'sector'; role: EscortRole; b0: number; b1: number; r0: number; r1: number }
  | { kind: 'point'; role: EscortRole; b: number; r: number }
  | { kind: 'free'; role: EscortRole };

export interface Formation {
  /** active preset name */
  active: string;
  /** the room orders escorts to their stations through the DCS hook */
  drive?: boolean;
  /** preset → escort track id → station */
  presets: Record<string, Record<string, Station>>;
}

/**
 * One catapult's launch state: its status and the queue of flights with an aircraft bound for it.
 * `jets`: for each flight on the queue, the aircraft (track ids) the launch tab assigned to this
 * catapult (a flight queued from the launch tab is spread over the catapults, one aircraft each); an
 * aircraft sent here from the deck goes on its own instruction and is not listed, so a flight queued
 * only that way has an empty list. A flight with no entry in `jets` (older state) sends every aircraft
 * of it without an instruction of its own here, except those in `skip`; `fromDeck` (older state) marks
 * flights with an empty list.
 */
export interface CatLaunch {
  status: CatStatus;
  queue: string[];
  jets?: Record<string, string[]>;
  fromDeck?: string[];
  skip?: string[];
}

export interface OpsState {
  /** PriFly's deck call. Absent: derived from the picture (aircraft in the landing area). */
  deck?: { foul: boolean; reason?: string; at: number };
  /** landing aids: ICLS on, ACLS (SPN-46) up, per-aircraft ACLS mode */
  aids?: { icls: boolean; acls: boolean; modes?: Record<string, AclsMode> };
  /** lights panel: item → setting */
  lights?: Record<string, LightSetting>;
  /** catapults: status and the queue of flight keys */
  launch?: Record<string, CatLaunch>;
  /** PriFly's taxi instructions: aircraft (track id) → deck destination (a catapult or parking spot id) and when it was given */
  taxi?: Record<string, { to: string; at: number }>;
  formation?: Formation;
}

const LIGHTS: LightSetting[] = ['ON', 'OFF', 'AUTO', 'NIGHT', 'VIOLET', 'YELLOW', 'GREEN', 'RED'];
const CAT_STATUS: CatStatus[] = ['ready', 'hold', 'down', 'suspended'];
const MODES: AclsMode[] = ['I', 'IA', 'II', 'III'];
const ROLES: EscortRole[] = ['AAW', 'ASW', 'PG', 'PKT'];
const fin = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const str = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max;
const entries = (o: unknown, max: number): [string, unknown][] | null => (o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length <= max ? Object.entries(o) : null);

export function cleanStation(s: unknown): Station | null {
  if (!s || typeof s !== 'object') return null;
  const x = s as Station;
  if (!ROLES.includes(x.role)) return null;
  if (x.kind === 'free') return { kind: 'free', role: x.role };
  if (x.kind === 'point') return fin(x.b, 0, 360) && fin(x.r, 0, 60) ? { kind: 'point', role: x.role, b: x.b % 360, r: x.r } : null;
  if (x.kind === 'sector') {
    if (!fin(x.b0, 0, 360) || !fin(x.b1, 0, 360) || !fin(x.r0, 0, 60) || !fin(x.r1, 0, 60) || x.r1 <= x.r0) return null;
    return { kind: 'sector', role: x.role, b0: x.b0 % 360, b1: x.b1 % 360, r0: x.r0, r1: x.r1 };
  }
  return null;
}

/**
 * Validate a patch of the ops state: each top-level key present replaces the stored one (null
 * deletes it). Returns null if anything is malformed.
 */
export function cleanOpsPatch(p: unknown): Partial<Record<keyof OpsState, unknown>> | null {
  const e = entries(p, 8);
  if (!e) return null;
  const out: Partial<Record<keyof OpsState, unknown>> = {};
  for (const [k, v] of e) {
    if (v === null) {
      if (!['deck', 'aids', 'lights', 'launch', 'taxi', 'formation'].includes(k)) return null;
      out[k as keyof OpsState] = null;
      continue;
    }
    switch (k) {
      case 'deck': {
        const d = v as OpsState['deck'];
        if (!d || typeof d.foul !== 'boolean' || (d.reason !== undefined && !str(d.reason, 60)) || !fin(d.at, 0, 1e13)) return null;
        out.deck = { foul: d.foul, ...(d.reason ? { reason: d.reason } : {}), at: d.at };
        break;
      }
      case 'aids': {
        const a = v as OpsState['aids'];
        if (!a || typeof a.icls !== 'boolean' || typeof a.acls !== 'boolean') return null;
        let modes: Record<string, AclsMode> | undefined;
        if (a.modes !== undefined) {
          const me = entries(a.modes, 40);
          if (!me || !me.every(([id, m]) => okFlightKey(id) && MODES.includes(m as AclsMode))) return null;
          modes = Object.fromEntries(me) as Record<string, AclsMode>;
        }
        out.aids = { icls: a.icls, acls: a.acls, ...(modes ? { modes } : {}) };
        break;
      }
      case 'lights': {
        const le = entries(v, 24);
        if (!le || !le.every(([n, s]) => str(n, 24) && LIGHTS.includes(s as LightSetting))) return null;
        out.lights = Object.fromEntries(le);
        break;
      }
      case 'launch': {
        const ce = entries(v, 4);
        if (!ce) return null;
        const cats: Record<string, CatLaunch> = {};
        const ids = (a: unknown, max: number): a is string[] | undefined => a === undefined || (Array.isArray(a) && a.length <= max && a.every(okFlightKey));
        for (const [cat, c] of ce) {
          const x = c as CatLaunch;
          if (!/^[1-4]$/.test(cat) || !x || !CAT_STATUS.includes(x.status) || !Array.isArray(x.queue) || x.queue.length > 12 || !x.queue.every(okFlightKey)) return null;
          if (!ids(x.fromDeck, 12) || !ids(x.skip, 40)) return null;
          let jets: Record<string, string[]> | undefined;
          if (x.jets !== undefined) {
            const je = entries(x.jets, 12);
            if (!je || !je.every(([k, a]) => okFlightKey(k) && Array.isArray(a) && ids(a, 12))) return null;
            jets = Object.fromEntries(je.map(([k, a]) => [k, [...(a as string[])]]));
          }
          cats[cat] = {
            status: x.status,
            queue: [...x.queue],
            ...(jets ? { jets } : {}),
            ...(x.fromDeck?.length ? { fromDeck: [...x.fromDeck] } : {}),
            ...(x.skip?.length ? { skip: [...x.skip] } : {}),
          };
        }
        out.launch = cats;
        break;
      }
      case 'taxi': {
        const te = entries(v, 80);
        if (!te) return null;
        const taxi: Record<string, { to: string; at: number }> = {};
        for (const [id, o] of te) {
          const x = o as { to: string; at: number };
          if (!okFlightKey(id) || !x || typeof x.to !== 'string' || !/^[A-Z0-9]{1,8}$/.test(x.to) || !fin(x.at, 0, 1e13)) return null;
          taxi[id] = { to: x.to, at: x.at };
        }
        out.taxi = taxi;
        break;
      }
      case 'formation': {
        const f = v as Formation;
        if (!f || !str(f.active, 24)) return null;
        const pe = entries(f.presets, 6);
        if (!pe) return null;
        const presets: Record<string, Record<string, Station>> = {};
        for (const [name, stations] of pe) {
          const se = entries(stations, 12);
          if (!str(name, 24) || !se) return null;
          const st: Record<string, Station> = {};
          for (const [unit, s] of se) {
            const c = cleanStation(s);
            if (!okFlightKey(unit) || !c) return null;
            st[unit] = c;
          }
          presets[name] = st;
        }
        if (f.drive !== undefined && typeof f.drive !== 'boolean') return null;
        out.formation = { active: f.active, presets, ...(f.drive ? { drive: true } : {}) };
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

/** Apply a cleaned patch to the stored state. */
export function applyOpsPatch(cur: OpsState, patch: Partial<Record<keyof OpsState, unknown>>): OpsState {
  const next: OpsState = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof OpsState, unknown][]) {
    if (v === null) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  return next;
}
