import { describe, expect, it } from 'vitest';
import { destination } from '../../src/catcc/core/geo.ts';
import { TrackStore } from '../../src/catcc/core/tracks/trackStore.ts';
import { withDemoPattern } from './demoPattern.ts';

describe('demo pattern', () => {
  it('loops without teleporting: groundspeeds stay real across the loop restart', () => {
    const store = new TrackStore();
    const sink = withDemoPattern((e) => store.apply(e), store);
    sink({ kind: 'update', id: '0', props: { ReferenceLatitude: '26', ReferenceLongitude: '56' } });
    let max = 0;
    const ids = new Set<string>();
    for (let i = 0; i < 2400; i++) {
      // 100 s to 580 s: two loop restarts (200 s and 400 s)
      const t = 100 + i * 0.2;
      const p = destination(26.2, 56.2, 0, (20 * t) / 3600);
      sink({ kind: 'time', t });
      sink({ kind: 'update', id: 'cv', props: { T: `${p.lon - 56}|${p.lat - 26}|0|0|0|0|0|0|0`, ...(i === 0 ? { Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_71', Color: 'Blue' } : {}) } });
      for (const tr of store.tracks.values())
        if (tr.kind === 'fixedwing') {
          ids.add(tr.id);
          max = Math.max(max, tr.gsKt ?? 0);
        }
      // never more than one of each demo at a time
      expect([...store.tracks.values()].filter((tr) => tr.kind === 'fixedwing').length).toBeLessThanOrEqual(3);
    }
    expect(max).toBeLessThan(300); // 270 kt is the inbound's 250 plus the ship's 20
    expect(ids.has('d203.1')).toBe(true);
    expect(ids.has('d203.2')).toBe(true);
  });
});
