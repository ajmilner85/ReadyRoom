import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { horizonNm, paintRadars, paintStep, radarsFor, swept, type Painter, type Radar } from './sweep.ts';

const at = (id: string, brg: number, nm: number, k: WireTrack['k'] = 'fixedwing'): WireTrack => {
  const p = destination(26, 56, brg, nm);
  return { id, k, ty: 'FA-18C', sd: 'blue', lat: p.lat, lon: p.lon, alt: 5000 };
};
const cv: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN', sd: 'blue', lat: 26, lon: 56, alt: 0 };

describe('radar sweep', () => {
  it('with datalink, an Aegis escort in the CSG repaints everything each revisit; without, only our SPN-43', () => {
    const ddg: WireTrack = { ...at('ddg', 0, 4), k: 'ship', ty: 'USS_Arleigh_Burke_IIa' };
    const far: WireTrack = { ...at('far', 0, 80), k: 'ship', ty: 'USS_Arleigh_Burke_IIa' }; // not in a CSG
    const a = at('a', 200, 20);
    const tracks = [cv, ddg, far, a];
    // 100 ms step that crosses a 1 s revisit boundary, sweep nowhere near 200°
    const t0 = 999_950;
    const t1 = 1_000_050;
    expect(radarsFor(tracks, 'cv', t0, t1, false).map((r) => r.id)).toEqual(['cv', 'cv:sfc']);
    const R = radarsFor(tracks, 'cv', t0, t1, true);
    expect(R.map((r) => r.id).sort()).toEqual(['cv', 'cv:sfc', 'ddg', 'ddg:sfc']);
    const P: Painter = { painted: new Map([['cv', cv]]), hist: new Map() };
    expect(paintRadars(P, tracks, 'cv', R, 1)).toBe(true);
    expect(P.painted.has('a')).toBe(true);
  });

  it('ships are painted only by surface-search radars inside their horizon, and lost beyond it', () => {
    expect(horizonNm(150)).toBeCloseTo(26, 0);
    const near: WireTrack = { ...at('near', 90, 15), k: 'ship', ty: 'USS_Arleigh_Burke_IIa' };
    const far: WireTrack = { ...at('far', 90, 40), k: 'ship', ty: 'USS_Arleigh_Burke_IIa' };
    const all = (b: number) => b >= 0; // a beam over every bearing
    const air: Radar = { id: 'cv', lat: 26, lon: 56, swept: all };
    const sfc: Radar = { id: 'cv:sfc', lat: 26, lon: 56, swept: all, air: false, sfc: { rangeNm: horizonNm(150) } };
    const P: Painter = { painted: new Map([['cv', cv]]), hist: new Map() };
    paintRadars(P, [cv, near, far], 'cv', [air], 1);
    expect(P.painted.has('near')).toBe(false); // the air-search beam doesn't paint ships
    paintRadars(P, [cv, near, far], 'cv', [air, sfc], 2);
    expect(P.painted.has('near')).toBe(true);
    expect(P.painted.has('far')).toBe(false); // over the horizon
    const gone: WireTrack = { ...at('near', 90, 30), k: 'ship', ty: 'USS_Arleigh_Burke_IIa' };
    paintRadars(P, [cv, gone], 'cv', [air, sfc], 3);
    expect(P.painted.has('near')).toBe(false);
  });

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
