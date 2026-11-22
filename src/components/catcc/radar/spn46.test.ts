import { describe, expect, it } from 'vitest';
import { destination } from '../../../catcc/core/geo.ts';
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import { inSpn46Coverage, inSpn46Gate, spn46Geom, spn46Locks, SPN46_CHANNELS } from './spn46.ts';
import { paintRadars, radarsFor, SCAN_S, type Painter } from './sweep.ts';

// carrier heading 009: BRC 009, final bearing 000, so the approach comes up from due south
const cv: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_71', sd: 'blue', lat: 26, lon: 56, alt: 0, hdg: 9, crs: 9 };
/** an aircraft `nm` astern on the final bearing, `offDeg` off it (+ = clockwise from astern) */
const ac = (id: string, nm: number, offDeg = 0, alt = 1200): WireTrack => {
  const p = destination(cv.lat, cv.lon, 180 + offDeg, nm);
  return { id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', lat: p.lat, lon: p.lon, alt };
};

describe('SPN-46 coverage', () => {
  it('measures along / off-axis from the final bearing, not the BRC', () => {
    const g = spn46Geom(cv, ac('a', 5, 0));
    expect(g.along).toBeCloseTo(5, 2);
    expect(g.lat).toBeCloseTo(0, 2);
    expect(g.offDeg).toBeCloseTo(0, 1);
    expect(spn46Geom(cv, ac('b', 5, 10)).offDeg).toBeCloseTo(10, 1);
  });

  it('covers 10 NM astern within 12.5 degrees of the final bearing, airborne, same side', () => {
    expect(inSpn46Coverage(cv, ac('in', 9.5, 12))).toBe(true);
    expect(inSpn46Coverage(cv, ac('wide', 5, 14))).toBe(false);
    expect(inSpn46Coverage(cv, ac('far', 10.5, 0))).toBe(false);
    expect(inSpn46Coverage(cv, { ...ac('ahead', 3, 0), ...destination(cv.lat, cv.lon, 0, 3) })).toBe(false);
    expect(inSpn46Coverage(cv, { ...ac('deck', 0.2, 0, 60), air: false })).toBe(false);
    expect(inSpn46Coverage(cv, { ...ac('red', 5, 0), sd: 'red' })).toBe(false);
    expect(inSpn46Coverage(cv, ac('overhead', 0.3, 0, 3000))).toBe(false); // above the antenna's 30 degrees
  });

  it('acquires only inside the gate: 8 NM, 3 degrees of the centreline', () => {
    expect(inSpn46Gate(cv, ac('a', 7.5, 2))).toBe(true);
    expect(inSpn46Gate(cv, ac('b', 9, 0))).toBe(false);
    expect(inSpn46Gate(cv, ac('c', 6, 5))).toBe(false);
  });
});

describe('SPN-46 locks', () => {
  it('locks the nearest in the gate on two channels, holds a lock out of the gate while in coverage, drops it outside', () => {
    const a = ac('a', 3);
    const b = ac('b', 5);
    const c = ac('c', 7);
    let L = spn46Locks([], [cv, a, b, c], cv, true);
    expect(L).toEqual(['a', 'b']);
    expect(L.length).toBe(SPN46_CHANNELS);
    // b drifts 8 degrees off: out of the gate but still in coverage, stays locked
    L = spn46Locks(L, [cv, a, ac('b', 5, 8), c], cv, true);
    expect(L).toEqual(['a', 'b']);
    // a traps: its channel frees and takes c (leapfrog)
    L = spn46Locks(L, [cv, { ...a, air: false }, ac('b', 5, 8), c], cv, true);
    expect(L).toEqual(['b', 'c']);
    // b goes wide of the sector: dropped
    L = spn46Locks(L, [cv, ac('b', 5, 20), c], cv, true);
    expect(L).toEqual(['c']);
  });

  it('tracks nothing with the ACLS down', () => {
    expect(spn46Locks(['a'], [cv, ac('a', 3)], cv, false)).toEqual([]);
  });
});

describe('SPN-46 repaint rate', () => {
  it('a locked aircraft repaints every data frame, others once a 4 s SPN-43 scan', () => {
    const P: Painter = { painted: new Map([['cv', cv]]), hist: new Map() };
    let locks: string[] = [];
    const paints = { fin: 0, out: 0 };
    let prev = 0;
    let lastFin = -1;
    let lastOut = -1;
    // 20 s of 100 ms painter steps; a new DCS frame (1 Hz) each second moves both aircraft in
    for (let ms = 100; ms <= 20_000; ms += 100) {
      const mt = Math.floor(ms / 1000);
      const fin = ac('fin', 6 - mt * 0.04);
      const out = ac('out', 12, 40); // inside the SPN-43's coverage, outside the SPN-46's
      const tracks = [cv, fin, out];
      locks = spn46Locks(locks, tracks, cv, true);
      paintRadars(P, tracks, 'cv', radarsFor(tracks, 'cv', prev, ms, false, locks), mt);
      prev = ms;
      const hf = P.hist.get('fin')?.at(-1)?.t;
      const ho = P.hist.get('out')?.at(-1)?.t;
      if (hf !== undefined && hf !== lastFin) {
        paints.fin++;
        lastFin = hf;
      }
      if (ho !== undefined && ho !== lastOut) {
        paints.out++;
        lastOut = ho;
      }
    }
    expect(locks).toEqual(['fin']);
    expect(paints.fin).toBe(21); // every frame: mt 0 .. 20
    expect(paints.out).toBe(20 / SCAN_S); // once a scan: 5
  });

  it('without locks the SPN-46 adds no radar', () => {
    expect(radarsFor([cv], 'cv', 0, 100, false).some((r) => r.id.endsWith(':spn46'))).toBe(false);
    expect(radarsFor([cv, ac('a', 3)], 'cv', 0, 100, false, ['a']).some((r) => r.id === 'cv:spn46')).toBe(true);
  });

  it('a tracking radar does not drop or lose contacts it is not locked on', () => {
    const far = ac('far', 30, 90);
    const P: Painter = { painted: new Map([['cv', cv], ['far', far], ['gone', ac('gone', 20, 90)]]), hist: new Map() };
    // only the SPN-46 radar this step (the SPN-43 beam elsewhere): neither unlocked contact may change
    const spn = radarsFor([cv, ac('a', 3)], 'cv', 0, 100, false, ['a']).filter((r) => r.id === 'cv:spn46');
    paintRadars(P, [cv, far, ac('a', 3)], 'cv', spn, 1);
    expect(P.painted.has('far')).toBe(true);
    expect(P.painted.has('gone')).toBe(true);
    expect(P.painted.has('a')).toBe(true);
  });
});
