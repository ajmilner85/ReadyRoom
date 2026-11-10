/**
 * Approach / Final frame and the bolter slot window.
 *
 * Positions are measured from the ship along the final bearing: `along` is NM astern (positive
 * out on final), `lat` NM right of the inbound course as the pilot sees it. Speeds are relative to
 * the ship, so ship motion and (through ground speeds) wind are included.
 *
 * Slot model (HANDOFF-2 §5): an aircraft on the bolter downwind at range R0, opening at Vdw, that
 * turns in at range X rolls out on final D further astern (the ship steams away during the turn)
 * and arrives at the ¾ NM point after
 *     tBall(X) = (X − R0)/Vdw + Tturn + (X + D − ¾)/Vfinal,
 * which is linear in X, so the turn-in ranges keeping ≥ GAP seconds to the arrivals ahead and
 * behind are found in closed form.
 *
 * Upwind model (the same tool one leg earlier): an aircraft climbing out ahead of the ship at U0 NM,
 * opening at Vup, that turns downwind at U NM ahead, flies the downwind at Vdw and turns in at a
 * nominal X0, arrives at ¾ NM after
 *     tBall(U) = (U − U0)/Vup + Tturn + (X0 + U − D1)/Vdw + Tturn + (X0 + D2 − ¾)/Vfinal,
 * again linear, in U.
 */
import { turnRadiusNm } from './maneuver.ts';
import type { Pt } from './vec.ts';

export const BALL_NM = 0.75;
/** Case III interval to the aircraft ahead and behind, s */
export const SLOT_GAP_S = 60;
/** an option this close to a neighbour is unworkable, s */
export const SLOT_BAD_S = 30;
/** typical approach ground speed of a jet on final, kt (before ship motion) */
export const APPROACH_KT = 135;
/** dirty-up / platform-to-final: inside this range traffic flies approach speed */
export const DIRTY_UP_NM = 10;

const D2R = Math.PI / 180;
const unit = (brg: number): Pt => [Math.sin(brg * D2R), -Math.cos(brg * D2R)];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

export interface FinalPos {
  along: number;
  lat: number;
  /** rate of change of `along`, kt (positive: opening, out the downwind) */
  alongKt: number;
  /** speed toward the ship along the final, kt (−alongKt) */
  closureKt: number;
}

/**
 * Where an aircraft is in the final frame. `p` is relative to the ship (NM, +x east, +y south);
 * course and ground speed of aircraft and ship give the relative motion.
 */
export function finalPos(p: Pt, fb: number, ac: { crs: number; gs: number }, ship: { crs: number; gs: number }): FinalPos {
  const astern = unit(fb + 180);
  const right = unit(fb + 90);
  const va = unit(ac.crs);
  const vs = unit(ship.crs);
  const vr: Pt = [va[0] * ac.gs - vs[0] * ship.gs, va[1] * ac.gs - vs[1] * ship.gs];
  const alongKt = dot(vr, astern);
  return { along: dot(p, astern), lat: dot(p, right), alongKt, closureKt: -alongKt };
}

/** Time (s) for an arrival to reach the ¾ NM point: its own closure until dirty-up, then approach speed. */
export function timeToBall(along: number, closureKt: number, finalKt: number): number {
  if (along <= BALL_NM) return 0;
  if (along > DIRTY_UP_NM) return ((along - DIRTY_UP_NM) / Math.max(100, closureKt)) * 3600 + ((DIRTY_UP_NM - BALL_NM) / finalKt) * 3600;
  return ((along - BALL_NM) / Math.max(60, closureKt)) * 3600;
}

/** The 180° turn from downwind to final, s, at the aircraft's speed and a 25° bank. */
export const turnS = (tasKt: number) => (Math.PI * turnRadiusNm(Math.max(100, tasKt), 25)) / (Math.max(100, tasKt) / 3600);

/** Wind as a velocity (the way it blows), kt, scope coords, from a FROM direction and speed in kt. */
export const windVec = (fromDeg: number, kt: number): Pt => {
  const u = unit(fromDeg + 180);
  return [u[0] * kt, u[1] * kt];
};

/**
 * The 180° turn from the downwind to final with the wind: the aircraft flies a circle in the air
 * mass at its true airspeed (ground velocity less the wind), while the air mass drifts with the
 * wind and the ship steams on. `drift` is how much further astern than the turn-in point the roll-out
 * lands relative to the ship, NM; `latDrift` the same sideways (right of the inbound course).
 */
export function turnWithWind(ac: { crs: number; gs: number }, ship: { crs: number; gs: number }, fb: number, wind: Pt | null) {
  const w: Pt = wind ?? [0, 0];
  const va = unit(ac.crs);
  const tasV: Pt = [va[0] * ac.gs - w[0], va[1] * ac.gs - w[1]];
  const tas = Math.hypot(tasV[0], tasV[1]);
  const tTurn = turnS(tas);
  const vs = unit(ship.crs);
  const rel: Pt = [w[0] - vs[0] * ship.gs, w[1] - vs[1] * ship.gs];
  return { tas, tTurn, drift: (dot(rel, unit(fb + 180)) * tTurn) / 3600, latDrift: (dot(rel, unit(fb + 90)) * tTurn) / 3600 };
}

export interface SlotOption {
  key: string;
  /** turn-in range, NM */
  x: number;
  /** time to ¾ NM from now, s */
  t: number;
  /** seconds after the arrival ahead / before the arrival behind (Infinity when none) */
  gapAhead: number;
  gapBehind: number;
  cls: 'ok' | 'marginal' | 'bad';
  ahead?: string;
  behind?: string;
}

export interface SlotResult {
  /** turn-in window, NM (null when no gap fits before the downwind runs out) */
  window: [number, number] | null;
  /** seconds from now to start of / end of the window's turn-in */
  inS: [number, number] | null;
  /** ¾ NM times at the window's ends, s from now */
  ballS: [number, number] | null;
  options: SlotOption[];
  tBall: (x: number) => number;
  /** how much further astern the roll-out is than the turn-in, NM */
  drift: number;
}

/**
 * Slot window for a bolter on the downwind at range r0 (NM astern), opening at vDw (kt), turning
 * in to fly final at vFinal (kt) after a tTurn (s) turn, against arrivals' ¾ NM times (s from now).
 * `drift` (NM) is how far the ship opens during the turn. Options are turn-in points: a range, or a
 * key and range (e.g. a DME converted to range along the final).
 */
/**
 * The window of a decision range x in [x0, maxX] (x opening at `rate` kt from x0 now) for which an
 * arrival time tBall(x) = a·x + b keeps ≥ gap seconds to the traffic ahead and behind, and the given
 * options (plus NOW at x0) scored against the traffic.
 */
function linearSlot(a: number, b: number, x0: number, maxX: number, rate: number, traffic: { id: string; t: number }[], gap: number, given: { key: string; x: number }[], drift: number): SlotResult {
  const tBall = (x: number) => a * x + b;
  const xOf = (t: number) => (t - b) / a;
  const T = [...traffic].sort((p, q) => p.t - q.t);
  // gaps in time between consecutive arrivals (open-ended before the first and after the last)
  const tMin = tBall(x0);
  const tMax = tBall(maxX);
  let window: [number, number] | null = null;
  for (let i = -1; i < T.length && !window; i++) {
    const lo = Math.max(tMin, i >= 0 ? T[i].t + gap : -Infinity);
    const hi = Math.min(tMax, i + 1 < T.length ? T[i + 1].t - gap : Infinity);
    if (hi >= lo) window = [xOf(lo), xOf(hi)];
  }
  const neighbours = (t: number) => {
    let ahead: { id: string; t: number } | undefined;
    let behind: { id: string; t: number } | undefined;
    for (const q of T) {
      if (q.t <= t) ahead = q;
      else if (!behind) behind = q;
    }
    return { ahead, behind };
  };
  const options = [{ key: 'NOW', x: x0 }, ...given.filter((o) => o.x > x0 + 0.2)].map(({ key, x }) => {
    const t = tBall(x);
    const { ahead, behind } = neighbours(t);
    const gapAhead = ahead ? t - ahead.t : Infinity;
    const gapBehind = behind ? behind.t - t : Infinity;
    const cls: SlotOption['cls'] = gapAhead >= gap && gapBehind >= gap ? 'ok' : gapAhead < SLOT_BAD_S || gapBehind < SLOT_BAD_S ? 'bad' : 'marginal';
    return { key, x, t, gapAhead, gapBehind, cls, ahead: ahead?.id, behind: behind?.id };
  });
  return {
    window,
    inS: window ? [((window[0] - x0) / rate) * 3600, ((window[1] - x0) / rate) * 3600] : null,
    ballS: window ? [tBall(window[0]), tBall(window[1])] : null,
    options,
    tBall,
    drift,
  };
}

export function slotWindow(
  bolter: { r0: number; vDw: number; tTurn: number; vFinal: number; drift?: number },
  traffic: { id: string; t: number }[],
  opts: { gap?: number; maxX?: number; options?: (number | { key: string; x: number })[] } = {},
): SlotResult {
  const vDw = Math.max(60, bolter.vDw);
  const maxX = Math.max(bolter.r0, opts.maxX ?? 12);
  const drift = bolter.drift ?? 0;
  // tBall = a·X + b
  const a = 3600 / vDw + 3600 / bolter.vFinal;
  const b = (-bolter.r0 / vDw) * 3600 + bolter.tTurn + ((drift - BALL_NM) / bolter.vFinal) * 3600;
  const given = (opts.options ?? [4, 6, 8]).map((o) => (typeof o === 'number' ? { key: `${o} NM`, x: o } : o));
  return linearSlot(a, b, bolter.r0, maxX, vDw, traffic, opts.gap ?? SLOT_GAP_S, given, drift);
}

/** nominal turn-in to final (range along the final, NM) assumed by the upwind tool */
export const UPWIND_TURN_IN_NM = 6;

/**
 * Upwind turn window: the range ahead of the ship (NM) at which to turn an aircraft climbing out on
 * the upwind leg (a bolter or waveoff) downwind, so that turning in at `x0` (NM astern) it reaches ¾ NM
 * with ≥ gap seconds to the arrivals. `u0` NM ahead now, opening at `vUp`; `d1` / `d2` how far the
 * ship opens during the downwind turn and the final turn (NM astern).
 */
export function upwindWindow(
  ac: { u0: number; vUp: number; vDw: number; tTurn: number; vFinal: number; d1?: number; d2?: number; x0?: number },
  traffic: { id: string; t: number }[],
  opts: { gap?: number; maxU?: number; options?: (number | { key: string; x: number })[] } = {},
): SlotResult {
  const vUp = Math.max(60, ac.vUp);
  const vDw = Math.max(60, ac.vDw);
  const x0 = ac.x0 ?? UPWIND_TURN_IN_NM;
  const d1 = ac.d1 ?? 0;
  const d2 = ac.d2 ?? 0;
  const maxU = Math.max(ac.u0, opts.maxU ?? 6);
  const a = 3600 / vUp + 3600 / vDw;
  const b = (-ac.u0 / vUp) * 3600 + ac.tTurn + ((x0 - d1) / vDw) * 3600 + ac.tTurn + ((x0 + d2 - BALL_NM) / ac.vFinal) * 3600;
  const given = (opts.options ?? [1.5, 2.5, 3.5]).map((o) => (typeof o === 'number' ? { key: `${o} NM`, x: o } : o));
  return linearSlot(a, b, ac.u0, maxU, vUp, traffic, opts.gap ?? SLOT_GAP_S, given, d1);
}
