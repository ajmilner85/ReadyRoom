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
