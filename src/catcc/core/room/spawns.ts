/**
 * Air wing membership by spawn: the carrier an aircraft departed from. The room notes each aircraft
 * the first time it appears in the picture: on a carrier's deck (within SPAWN_RADIUS_NM, not flying)
 * it belongs to that carrier for good; anywhere else (an air start, a field, or already flying when
 * the room started) it belongs to none. Later recoveries change nothing. The room keeps the memory
 * while its source runs, also for aircraft that leave the picture for a while.
 */
import { distanceNm } from '../geo.ts';
import type { WireTrack } from './protocol.ts';

/** an aircraft this close to a carrier, and not flying, is on its deck */
export const SPAWN_RADIUS_NM = 0.5;
/** without DCS's in-air flag: on deck below this */
const DECK_MAX_ALT_FT = 200;

const isAircraft = (t: WireTrack) => t.k === 'fixedwing' || t.k === 'rotary';
const onSurface = (t: WireTrack) => (t.air !== undefined ? !t.air : t.alt < DECK_MAX_ALT_FT);

/**
 * Note the aircraft seen for the first time in this frame: track id → carrier hull, or null for none.
 * Aircraft already noted are left alone. A frame without any carrier decides nothing (a feed still
 * filling in). Returns whether an aircraft was given a carrier (what clients are told about).
 */
export function noteSpawns(seen: Record<string, string | null>, tracks: WireTrack[]): boolean {
  const cvs = tracks.filter((t) => t.k === 'carrier' && t.hull);
  if (!cvs.length) return false;
  let added = false;
  for (const t of tracks) {
    if (!isAircraft(t) || t.id in seen) continue;
    let hull: string | null = null;
    if (onSurface(t)) {
      let best = SPAWN_RADIUS_NM;
      for (const c of cvs) {
        const d = distanceNm(c.lat, c.lon, t.lat, t.lon);
        if (d <= best) {
          best = d;
          hull = c.hull!;
        }
      }
    }
    seen[t.id] = hull;
    if (hull) added = true;
  }
  return added;
}

/** The carriers aircraft spawned on (track id → hull), as sent to clients: the noted aircraft that have one. */
export const spawnHulls = (seen: Record<string, string | null>): Record<string, string> =>
  Object.fromEntries(Object.entries(seen).filter((e): e is [string, string] => !!e[1]));

/**
 * A flight's carrier: its lead's spawn carrier, else the first member's that has one. A flight whose
 * members all started elsewhere (or in the air) has none.
 */
export function flightSpawn(leadId: string, memberIds: string[], spawns: Record<string, string>): string | undefined {
  return spawns[leadId] ?? memberIds.map((id) => spawns[id]).find((h) => !!h);
}
