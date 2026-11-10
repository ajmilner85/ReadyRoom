import { describe, expect, it } from 'vitest';
import { bestRecovery, deckWind, intoWind, windOverDeck } from './wod.ts';

describe('wind over deck', () => {
  it('adds ship speed to a headwind and steers 9° right of the wind for the angled deck', () => {
    // 18 kt (9.26 m/s) from 070, ship on 070 at 25 kt: 43 kt from 070
    const w = windOverDeck(70, 25, 70, 18 * 0.514444);
    expect(w.from).toBeCloseTo(70, 6);
    expect(w.kt).toBeCloseTo(43, 6);
    // into the wind for 30 kt down the angle: 079 at 12 kt
    expect(intoWind(70, 18 * 0.514444)).toEqual({ crs: 79, kt: 12 });
    // a calm day: at least the 30 kt has to come from the ship (capped at 32)
    expect(intoWind(0, 0).kt).toBe(30);
  });

  it('splits the deck wind into down-angle and cross components and finds the best recovery', () => {
    // 12 kt from 330: the ship's own wind swings the deck wind toward the bow, so the best course is
    // ~20° right of the wind to bring ~27 kt straight down the angle
    const b = bestRecovery(330, 12 * 0.514444);
    expect(b.crs).toBeGreaterThan(345);
    expect(b.crs).toBeLessThan(355);
    const d = deckWind(b.crs, b.kt, 330, 12 * 0.514444);
    expect(Math.abs(d.rel)).toBeLessThan(1);
    expect(d.along).toBeCloseTo(27, 0);
    expect(d.inLimits).toBe(true);
    // the same wind from the beam is out of limits
    expect(deckWind(60, 15, 330, 12 * 0.514444).inLimits).toBe(false);
  });
});
