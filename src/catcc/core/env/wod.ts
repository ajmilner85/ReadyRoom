/** Wind over the deck and the into-the-wind course for a carrier. */
import { norm360 } from '../geo.ts';

/** Angled deck: the landing area's axis is 9° left of the BRC (Nimitz class). */
const ANGLED_DECK_DEG = 9;
const KT_PER_MS = 1 / 0.514444;

/** Wind over the deck from the ship's course and speed and the true wind (m/s, from). */
export function windOverDeck(crs: number, kt: number, wFrom: number, wMs: number) {
  const D = Math.PI / 180;
  const to = (wFrom + 180) * D;
  const w = [Math.sin(to) * wMs * KT_PER_MS, Math.cos(to) * wMs * KT_PER_MS];
  const s = [Math.sin(crs * D) * kt, Math.cos(crs * D) * kt];
  const rel = [w[0] - s[0], w[1] - s[1]];
  return { from: norm360(Math.atan2(rel[0], rel[1]) / D + 180), kt: Math.hypot(rel[0], rel[1]) };
}

/** Course and speed that put `wodKt` of wind straight down the angled deck (wind from the bow, 9° to port). */
export function intoWind(wFrom: number, wMs: number, wodKt = 30) {
  const wKt = wMs * KT_PER_MS;
  return { crs: Math.round(norm360(wFrom + ANGLED_DECK_DEG)), kt: Math.max(5, Math.min(32, Math.round(wodKt - wKt))) };
}

/** Wind relative to the angled deck: speed, angle off the deck's axis (+ from starboard), down-angle and cross-deck components. */
export function deckWind(crs: number, kt: number, wFrom: number, wMs: number) {
  const w = windOverDeck(crs, kt, wFrom, wMs);
  const rel = ((((w.from - (crs - ANGLED_DECK_DEG)) % 360) + 540) % 360) - 180;
  const D = Math.PI / 180;
  const along = w.kt * Math.cos(rel * D);
  const cross = w.kt * Math.sin(rel * D);
  // F/A-18E recovery limits: 25–30 kt down the angle, within ±5°, crosswind ≤ 7 kt
  const inLimits = w.kt >= 25 && w.kt <= 30 && Math.abs(rel) <= 5 && Math.abs(cross) <= 7;
  return { kt: w.kt, from: w.from, rel, along, cross, inLimits };
}

/** Best recovery course and speed: brute force over course (1°) and speed (0.5 kt, 5–30), minimising 2·|angle off| + |kt − 27|. */
export function bestRecovery(wFrom: number, wMs: number): { crs: number; kt: number } {
  let best = { crs: 0, kt: 5, e: Infinity };
  for (let c = 0; c < 360; c++)
    for (let v = 5; v <= 30; v += 0.5) {
      const q = deckWind(c, v, wFrom, wMs);
      const e = Math.abs(q.rel) * 2 + Math.abs(q.kt - 27);
      if (e < best.e) best = { crs: c, kt: v, e };
    }
  return { crs: best.crs, kt: best.kt };
}
