/**
 * Dev only: synthetic carrier-pattern traffic around CVN-71 (else the first carrier) of a replay, so the
 * Approach / Final displays and the bolter slot tool have something to show. Three Hornets loop
 * every 200 s: one on a 6 NM final, one on the bolter downwind 2 NM to the left, and one inbound
 * on the Case III profile. Each loop flies new objects (ids `d205.<loop>` ...): the old ones are removed
 * as the loop restarts, so nothing teleports back to its start (differencing a 7-14 NM jump read as
 * 6,000-16,000 kt groundspeeds, and every conflict prediction with them went red). The aircraft on
 * final is removed at the ramp.
 */
import { destination, M_PER_FT } from '../../src/catcc/core/geo.ts';
import type { AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import type { TrackStore } from '../../src/catcc/core/tracks/trackStore.ts';

const LOOP_S = 200;

interface Demo {
  id: string;
  pilot: string;
  group: string;
  /** along (NM astern on final), lat (NM right of course), alt (ft), course offset from FB, at loop time s; null once gone */
  at: (s: number) => { along: number; lat: number; alt: number; crsOff: number } | null;
}

const DEMOS: Demo[] = [
  // on final from 6 NM: 125 kt closure, on the glidepath
  { id: 'd205', pilot: 'Bullet 1-2 | 205 Demo', group: 'Bullet 1', at: (s) => { const along = 6.5 - (s / 3600) * 125; if (along <= 0) return null; return { along, lat: 0, alt: Math.max(150, Math.min(1200, along * 371.6)), crsOff: 0 }; } },
  // bolter downwind 2 NM left, opening at the aircraft's speed plus the ship's
  { id: 'd211', pilot: 'Charger 3-2 | 211 Demo', group: 'Charger 3', at: (s) => ({ along: 1.5 + (s / 3600) * 150, lat: -2, alt: 1200, crsOff: 180 }) },
  // inbound on the Case III profile from 20 NM at 250 kt
  { id: 'd203', pilot: 'Bullet 1-1 | 203 Demo', group: 'Bullet 2', at: (s) => { const along = 21 - (s / 3600) * 250; return { along, lat: 0.15, alt: along > 12 ? 1200 + ((along - 12) / 8) * 3800 : 1200, crsOff: 0 }; } },
];

/**
 * Wrap a replay's event sink so each time step also moves the demo aircraft. The traffic is a function of
 * the recording's time, so a seek shows it where it would have been: call reset() after the store was
 * restored to a keyframe without the demo objects, and the next time step places them afresh.
 */
export function withDemoPattern(apply: (ev: AcmiEvent) => void, store: TrackStore): ((ev: AcmiEvent) => void) & { reset: () => void } {
  // the objects flying now, by demo
  const live = new Map<Demo, string>();
  const drop = (d: Demo) => {
    const id = live.get(d);
    if (id === undefined) return;
    apply({ kind: 'remove', id });
    live.delete(d);
  };
  const sink = (ev: AcmiEvent) => {
    apply(ev);
    if (ev.kind !== 'time') return;
    const cvs = [...store.tracks.values()].filter((t) => t.kind === 'carrier');
    const cv = cvs.find((t) => t.hull === 'CVN-71') ?? cvs[0];
    if (!cv) return;
    const brc = cv.courseDeg ?? cv.headingDeg ?? 0;
    const fb = brc - 9;
    const s = ((ev.t % LOOP_S) + LOOP_S) % LOOP_S;
    const loop = Math.floor(ev.t / LOOP_S);
    for (const d of DEMOS) {
      const k = d.at(s);
      const id = `${d.id}.${loop}`;
      if (!k || live.get(d) !== id) drop(d);
      if (!k) continue;
      live.set(d, id);
      const a = destination(cv.lat, cv.lon, fb + 180, k.along);
      const p = destination(a.lat, a.lon, fb + 90, k.lat);
      const hdg = (((fb + k.crsOff) % 360) + 360) % 360;
      // ACMI positions are offsets from the recording's reference point
      apply({
        kind: 'update',
        id,
        props: { T: `${p.lon - store.acmi.refLon}|${p.lat - store.acmi.refLat}|${(k.alt * M_PER_FT).toFixed(1)}|0|0|${hdg.toFixed(1)}|0|0|${hdg.toFixed(1)}`, Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: cv.side === 'red' ? 'Red' : 'Blue', Pilot: d.pilot, Group: d.group },
      });
    }
  };
  return Object.assign(sink, { reset: () => live.clear() });
}
