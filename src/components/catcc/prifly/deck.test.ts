import { describe, expect, it } from 'vitest';
import { CATS, NIMITZ, TAXI_ROUTES, inLandingArea, onCat, routeAhead, type DeckJet, type V } from './deck.ts';

const jet = (x: number, y: number, a = 0) => ({ t: { id: 'j' }, x, y, a, moving: false }) as unknown as DeckJet;
const angleOf = (a: V, b: V) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

describe('Nimitz deck geometry (DCS ship coordinates)', () => {
  it('is the DCS deck: 332 m stern to bow, catapult shuttles where GT.RunWays puts them', () => {
    const xs = NIMITZ.outline.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(332.9, -1);
    // GT.RunWays (x forward, z starboard): cat 1 at (59.95, 18.02), cat 4 at (-56.18, -32.90)
    expect(Math.hypot(CATS['1'][0][0] - 59.95, CATS['1'][0][1] + 18.02)).toBeLessThan(1);
    expect(Math.hypot(CATS['4'][0][0] + 56.18, CATS['4'][0][1] - 32.9)).toBeLessThan(1);
  });

  it('regularises the landing area: borders parallel at the painted angle, hash blocks square to them', () => {
    const { c, li, ri } = NIMITZ.la;
    for (const l of [c, li, ri]) expect(angleOf(l[0], l[1])).toBeCloseTo(9.78, 2);
    for (const h of NIMITZ.la.hash) {
      expect(Math.abs(angleOf(h[0], h[1]) - 9.78)).toBeLessThan(0.3); // along the border (1 cm rounding on a 3 m block)
      expect(Math.abs(Math.abs(angleOf(h[1], h[2]) - 9.78) - 90)).toBeLessThan(0.3); // across it
    }
    // wires: parallel, evenly spaced, square to the deck
    const mid = NIMITZ.wires.map((w) => [(w[0][0] + w[1][0]) / 2, (w[0][1] + w[1][1]) / 2] as V);
    const gaps = mid.slice(1).map((p, i) => Math.hypot(p[0] - mid[i][0], p[1] - mid[i][1]));
    for (const g of gaps) expect(Math.abs(g - gaps[0])).toBeLessThan(0.03);
  });

  it('knows the landing area and the catapults', () => {
    const [a, b] = NIMITZ.la.c;
    const mid: V = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    expect(inLandingArea(...mid)).toBe(true);
    expect(inLandingArea(100, 0)).toBe(false); // the bow
    const s = CATS['2'][0];
    expect(onCat([jet(s[0] + 6, s[1])], '2')).toBeTruthy();
    expect(onCat([jet(s[0] + 6, s[1] + 12)], '2')).toBeUndefined();
  });
});

describe('DCS deck-crew taxi routes', () => {
  it('has 16 launch and 16 recovery routes', () => {
    expect(TAXI_ROUTES.filter((r) => r.kind === 'to')).toHaveLength(16);
    expect(TAXI_ROUTES.filter((r) => r.kind === 'park')).toHaveLength(16);
  });

  it('follows a taxiing jet along the route it is on, the way it points', () => {
    const r = TAXI_ROUTES.find((x) => x.kind === 'to' && x.spot === 9)!;
    const [a, b] = [r.pts[3], r.pts[4]];
    const at: V = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const hdg = angleOf(a, b);
    const ahead = routeAhead({ x: at[0], y: at[1], a: hdg });
    expect(ahead?.route.kind).toBe('to');
    expect(ahead?.pts[ahead.pts.length - 1]).toEqual(CATS[ahead!.route.cat!][0]);
    // pointing the other way: not on it
    expect(routeAhead({ x: at[0], y: at[1], a: hdg + 180 })?.route.spot === 9 && routeAhead({ x: at[0], y: at[1], a: hdg + 180 })?.route.kind === 'to').toBe(false);
  });
});
