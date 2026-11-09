import { describe, expect, it } from 'vitest';
import { intoWind, windOverDeck } from './wod.ts';

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
});
