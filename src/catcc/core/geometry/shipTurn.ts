/**
 * Ship turn prediction for the Bridge's trend lines (the airliner ND's "position trend vector", for a
 * ship): where the carrier goes if it keeps its present rate of turn, and where the helm order takes it.
 * Scope coordinates: NM, x east, y south (north is -y); bearings in degrees true.
 */
import type { Pt } from './vec.ts';

const D2R = Math.PI / 180;

/** rudder order (deg, + right) the helm puts on for a heading error (deg, + = ordered course to the right) */
export const rudderFor = (err: number): number => Math.max(-30, Math.min(30, err * 0.9));

/**
 * Turn radius at full (30 deg) rudder, NM: DCS's minimum turn radius for the Nimitz class, GT.R_min =
 * 665.8 m in CoreMods/tech/USS_Nimitz/Database/USS_CVN_71.lua (a turning circle of ~1,450 yd). Its yaw-rate
 * limit (GT.Om = 0.05 rad/s) would only bind above ~65 kt, so the radius limits the turn at any real speed.
 */
export const FULL_RUDDER_RADIUS_NM = 665.8 / 1852;

/** rate of turn (deg/s, + right) at a speed (kt) and rudder angle (deg, + right) */
export function turnRate(kt: number, rudder: number): number {
  const full = kt / 3600 / FULL_RUDDER_RADIUS_NM / D2R; // deg/s at full rudder
  return full * (rudder / 30);
}

/** signed smallest angle from a to b, deg (-180..180] */
export const turnTo = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Path over the next `seconds` holding a constant rate of turn (deg/s, + right): an arc, or a straight
 * line when the rate is negligible. Points every `dt` seconds from `from`, the first being `from`.
 */
export function trendPath(from: Pt, hdg: number, kt: number, rateDegS: number, seconds: number, dt = 5): Pt[] {
  const out: Pt[] = [from];
  let [x, y] = from;
  let h = hdg;
  const v = kt / 3600;
  for (let t = 0; t < seconds; t += dt) {
    // advance along the chord of this step's arc
    const hm = (h + (rateDegS * dt) / 2) * D2R;
    x += Math.sin(hm) * v * dt;
    y -= Math.cos(hm) * v * dt;
    h += rateDegS * dt;
    out.push([x, y]);
  }
  return out;
}

/** DCS's Nimitz acceleration (GT.speedup = 0.119249 m/s^2, USS_CVN_71.lua), kt per second */
export const SPEEDUP_KT_S = (0.119249 * 3600) / 1852;

/**
 * Path over the next `seconds` under a helm order: the speed runs from `kt` toward the ordered speed at
 * SPEEDUP_KT_S, and the rudder follows the heading error (rudderFor), so the ship turns at the ordered
 * radius and eases out onto the ordered course. Going astern the rudder is held amidships (the helm
 * doesn't steer on a backing ship), so the path runs straight back along the heading.
 */
export function orderedPath(from: Pt, hdg: number, kt: number, orderedCrs: number, seconds: number, dt = 5, orderedKt = kt): Pt[] {
  const out: Pt[] = [from];
  let [x, y] = from;
  let h = hdg;
  let v = kt;
  for (let t = 0; t < seconds; t += dt) {
    const dv = Math.max(-SPEEDUP_KT_S * dt, Math.min(SPEEDUP_KT_S * dt, orderedKt - v));
    const vm = v + dv / 2;
    let step = 0;
    if (vm > 0) {
      const err = turnTo(h, orderedCrs);
      step = turnRate(vm, rudderFor(err)) * dt;
      // never swing past the ordered course within a step
      if (Math.abs(step) > Math.abs(err)) step = err;
    }
    const hm = (h + step / 2) * D2R;
    const d = (vm / 3600) * dt;
    x += Math.sin(hm) * d;
    y -= Math.cos(hm) * d;
    h += step;
    v += dv;
    out.push([x, y]);
  }
  return out;
}
