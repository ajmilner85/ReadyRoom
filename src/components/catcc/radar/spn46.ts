/**
 * AN/SPN-46(V) Precision Approach Landing System (the ACLS radar) as a second paint source.
 *
 * The SPN-46 is not a scanning radar: each of its two Ka/X-band monopulse antennas locks on to one
 * aircraft as it flies through the acquisition gate on the extended centreline (lock-on between
 * 8 and 4 DME, CNATRA P-816) and then tracks it continuously to touchdown or waveoff, so two
 * aircraft at most ("leapfrog": as one lands the next is acquired). A locked aircraft is therefore
 * refreshed as often as data reaches us (each DCS frame) instead of once per SPN-43 scan.
 * Coverage: 10 NM astern, 25 degrees of azimuth about the final bearing (12.5 either side);
 * the acquisition gate inside it is the same one the Final view's LOCK-ON readout uses.
 */
import { bearingDeg, distanceNm } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { shipRefOf } from '../scopeModel.ts';
import type { Radar } from './sweep.ts';

/** tracking range (the 1987 approval: control from acquisition at 10 NM to touchdown) */
export const SPN46_RANGE_NM = 10;
/** azimuth coverage either side of the final bearing (25 degrees in all) */
export const SPN46_HALF_AZ_DEG = 12.5;
/** antenna elevation travel above the horizontal ((V)3 FCC filing: +30 / -15 degrees) */
export const SPN46_MAX_EL_DEG = 30;
/** acquisition gate: lock-on inside this range ... */
export const SPN46_ACQ_NM = 8;
/** ... and this close to the centreline (the Final view's LOCK-ON test) */
export const SPN46_ACQ_DEG = 3;
/** two antennas: two aircraft tracked at once */
export const SPN46_CHANNELS = 2;
/** height of the antennas above the waterline, ft (on the flight deck edge) */
const ANT_FT = 70;

/** An aircraft's place in the SPN-46's frame: astern along the final bearing, lateral (right +), off-axis angle, elevation. */
export function spn46Geom(cv: WireTrack, t: WireTrack): { along: number; lat: number; rangeNm: number; offDeg: number; elDeg: number } {
  const { fb } = shipRefOf(cv);
  const rangeNm = distanceNm(cv.lat, cv.lon, t.lat, t.lon);
  // the approach course comes from astern: the aircraft sits on bearing fb + 180 from the ship
  const rel = ((((bearingDeg(cv.lat, cv.lon, t.lat, t.lon) - (fb + 180)) % 360) + 540) % 360) - 180;
  const r = (rel * Math.PI) / 180;
  const elDeg = (Math.atan2(t.alt - ANT_FT, Math.max(1, rangeNm * 6076.12)) * 180) / Math.PI;
  return { along: rangeNm * Math.cos(r), lat: -rangeNm * Math.sin(r), rangeNm, offDeg: Math.abs(rel), elDeg };
}

const airborne = (t: WireTrack) => (t.k === 'fixedwing' || t.k === 'rotary') && t.air !== false;

/** inside the radar's tracking volume: airborne, astern, within range, azimuth and elevation limits */
export function inSpn46Coverage(cv: WireTrack, t: WireTrack): boolean {
  if (!airborne(t) || t.sd !== cv.sd) return false;
  const g = spn46Geom(cv, t);
  return g.along > 0 && g.rangeNm <= SPN46_RANGE_NM && g.offDeg <= SPN46_HALF_AZ_DEG && g.elDeg <= SPN46_MAX_EL_DEG;
}

/** inside the acquisition gate, where a free channel locks on */
export function inSpn46Gate(cv: WireTrack, t: WireTrack): boolean {
  if (!inSpn46Coverage(cv, t)) return false;
  const g = spn46Geom(cv, t);
  return g.along <= SPN46_ACQ_NM && g.offDeg <= SPN46_ACQ_DEG;
}

/**
 * The aircraft the SPN-46 tracks after this step, given those it tracked before. A lock holds while
 * the aircraft stays inside the coverage volume (it drops at touchdown, past the ship, or out of the
 * sector); free channels lock the nearest aircraft in the acquisition gate. Nothing when the ACLS is down.
 */
export function spn46Locks(prev: readonly string[], tracks: WireTrack[], cv: WireTrack, up: boolean): string[] {
  if (!up) return [];
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const out = prev.filter((id) => {
    const t = byId.get(id);
    return !!t && inSpn46Coverage(cv, t);
  });
  const cand = tracks
    .filter((t) => !out.includes(t.id) && inSpn46Gate(cv, t))
    .sort((a, b) => distanceNm(cv.lat, cv.lon, a.lat, a.lon) - distanceNm(cv.lat, cv.lon, b.lat, b.lon));
  for (const t of cand) {
    if (out.length >= SPN46_CHANNELS) break;
    out.push(t.id);
  }
  return out.slice(0, SPN46_CHANNELS);
}

/** The SPN-46 as a paint source: continuous track of its locked aircraft only. */
export const spn46Radar = (cv: WireTrack, locks: readonly string[]): Radar => ({ id: `${cv.id}:spn46`, lat: cv.lat, lon: cv.lon, swept: () => true, only: new Set(locks) });
