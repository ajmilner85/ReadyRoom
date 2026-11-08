import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { paintStep, swept, type Painter } from './sweep.ts';

const at = (id: string, brg: number, nm: number, k: WireTrack['k'] = 'fixedwing'): WireTrack => {
  const p = destination(26, 56, brg, nm);
  return { id, k, ty: 'FA-18C', sd: 'blue', lat: p.lat, lon: p.lon, alt: 5000 };
};
const cv: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN', sd: 'blue', lat: 26, lon: 56, alt: 0 };

describe('radar sweep', () => {
  it('arc test wraps through north', () => {
    expect(swept(350, 10, 5)).toBe(true);
    expect(swept(350, 10, 355)).toBe(true);
    expect(swept(350, 10, 20)).toBe(false);
    expect(swept(10, 20, 10)).toBe(false); // open start, so a bearing is painted once per scan
  });

  it('repaints a contact only as the sweep passes it; new and lost contacts wait for the sweep', () => {
    const P: Painter = { painted: new Map([['cv', cv], ['a', at('a', 90, 20)]]), hist: new Map() };
    const moved = at('a', 92, 21);
    expect(paintStep(P, [cv, moved, at('b', 200, 10)], 'cv', 1, 0, 45)).toBe(false);
    expect(P.painted.get('a')).not.toBe(moved);
    expect(P.painted.has('b')).toBe(false);
    paintStep(P, [cv, moved, at('b', 200, 10)], 'cv', 2, 45, 120);
    expect(P.painted.get('a')).toBe(moved);
    expect(P.hist.get('a')?.length).toBe(1);
    paintStep(P, [cv, moved, at('b', 200, 10)], 'cv', 3, 120, 210);
    expect(P.painted.has('b')).toBe(true);
    // 'a' is lost: still shown until the sweep passes its last position
    paintStep(P, [cv], 'cv', 4, 210, 80);
    expect(P.painted.has('a')).toBe(true);
    paintStep(P, [cv], 'cv', 5, 80, 100);
    expect(P.painted.has('a')).toBe(false);
  });
});
