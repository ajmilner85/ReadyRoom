import { describe, expect, it } from 'vitest';
import { destination } from '../geo.ts';
import { parsePilot } from './naming.ts';
import { TrackStore } from './trackStore.ts';

describe('parsePilot', () => {
  it.each([
    ['Hawk 1-2 | Bueller', { callsign: 'HAWK 1-2', flight: 'HAWK 1', player: 'Bueller' }],
    ['STING 1-3 | 614 Tex', { callsign: 'STING 1-3', flight: 'STING 1', board: '614', player: 'Tex' }],
    ['Sting 1-2 524 ATIS', { callsign: 'STING 1-2', flight: 'STING 1', board: '524', player: 'ATIS' }],
    ['Hawk 4-2/733 QUIZNOS', { callsign: 'HAWK 4-2', flight: 'HAWK 4', board: '733', player: 'QUIZNOS' }],
    ['Sting 2-2 | Ripple 772', { callsign: 'STING 2-2', flight: 'STING 2', board: '772', player: 'Ripple' }],
    ['Dodge 1-1 | 564 DSRM', { callsign: 'DODGE 1-1', flight: 'DODGE 1', board: '564', player: 'DSRM' }],
    ['CSG-1-1', { callsign: 'CSG 1-1', flight: 'CSG 1' }],
  ])('%s', (raw, expected) => {
    expect(parsePilot(raw)).toEqual(expected);
  });
});

describe('TrackStore kinematics', () => {
  it('derives groundspeed, course and vertical speed from position history', () => {
    const store = new TrackStore();
    store.apply({ kind: 'update', id: '0', props: { ReferenceLatitude: '26', ReferenceLongitude: '56' } });
    const start = { lat: 26.2, lon: 56.8 };
    const gs = 420; // kt
    const crs = 345;
    for (let i = 0; i <= 20; i++) {
      const t = i * 0.5;
      const p = destination(start.lat, start.lon, crs, (gs * t) / 3600);
      const altM = (20000 - 3000 * (t / 60)) * 0.3048; // descending 3,000 fpm
      store.apply({ kind: 'time', t });
      store.apply({
        kind: 'update',
        id: '1a',
        props: {
          T: `${p.lon - 56}|${p.lat - 26}|${altM}|0|0|${crs}|0|0|${crs}`,
          ...(i === 0 ? { Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: 'Blue', Pilot: 'Volt 3-1 | 401 Ace', Group: 'Volt 3' } : {}),
        },
      });
    }
    const tr = store.tracks.get('1a')!;
    expect(tr.kind).toBe('fixedwing');
    expect(tr.side).toBe('blue');
    expect(tr.board).toBe('401');
    expect(tr.group).toBe('Volt 3');
    expect(tr.gsKt!).toBeCloseTo(gs, 0);
    expect(tr.courseDeg!).toBeCloseTo(crs, 0);
    expect(tr.vsFpm!).toBeCloseTo(-3000, -1);
    expect(tr.headingDeg).toBe(crs);
  });

  it('recognises supercarriers but not other "AircraftCarrier" types', () => {
    const store = new TrackStore();
    store.apply({ kind: 'update', id: '602', props: { T: '1|1|0', Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_72', Color: 'Blue' } });
    store.apply({ kind: 'update', id: '102', props: { T: '1|1|0', Type: 'Sea+Watercraft+AircraftCarrier', Name: 'atconveyor', Color: 'Red' } });
    store.apply({ kind: 'update', id: '777', props: { T: '1|1|0', Type: 'Weapon+Missile', Name: 'AIM_120C' } });
    expect(store.tracks.get('602')).toMatchObject({ kind: 'carrier', hull: 'CVN-72' });
    expect(store.tracks.get('102')?.kind).toBe('ship');
    expect(store.tracks.has('777')).toBe(false);
  });
});
