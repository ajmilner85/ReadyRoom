import { describe, expect, it } from 'vitest';
import { destination } from '../geo.ts';
import { computeLaunch, heldPlayers, launchAuthority } from './launch.ts';
import type { SeatHolder, WireTrack } from './protocol.ts';

const CV = { lat: 26.2, lon: 56.8 };
const near = (m: number) => destination(CV.lat, CV.lon, 90, m / 1852);
const tracks = (): WireTrack[] => [
  { id: 'u1', k: 'carrier', ty: 'CVN_72', sd: 'blue', hull: 'CVN-72', g: 'CSG-1', lat: CV.lat, lon: CV.lon, alt: 65 },
  { id: 'u2', k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', ip: true, pi: 'Volt 3-1 | 401 Ace', ...near(60), alt: 66, air: false },
  { id: 'u3', k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', ip: false, pi: 'AI Hornet', ...near(40), alt: 66, air: false },
  { id: 'u4', k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', ip: true, pi: 'Volt 3-2 | 402 Bee', ...near(2000), alt: 3000, air: true },
];
const seat = (role: SeatHolder['role'], userId: string, away = false): SeatHolder => ({ carrier: 'CVN-72', role, userId, name: userId, since: 0, ...(away ? { away } : {}) });

describe('launch clearance', () => {
  it('is cleared by the Shooter, else the Air Boss; a seat whose holder dropped off does not count', () => {
    expect(launchAuthority([], 'CVN-72')).toBeNull();
    expect(launchAuthority([seat('boss', 'b')], 'CVN-72')?.userId).toBe('b');
    expect(launchAuthority([seat('boss', 'b'), seat('shooter', 's')], 'CVN-72')?.userId).toBe('s');
    expect(launchAuthority([seat('boss', 'b'), seat('shooter', 's', true)], 'CVN-72')?.userId).toBe('b');
    expect(launchAuthority([seat('miniboss', 'm')], 'CVN-72')).toBeNull();
  });

  it('holds nobody while nobody clears launches (they go on the salute)', () => {
    const l = computeLaunch({}, [], tracks());
    expect(l['CVN-72']).toMatchObject({ auth: null, hold: [] });
    expect(heldPlayers(l, tracks())).toEqual([]);
  });

  it('holds player aircraft on deck until cleared; AI and airborne aircraft are never held', () => {
    let l = computeLaunch({}, [seat('boss', 'b')], tracks());
    expect(l['CVN-72'].auth).toMatchObject({ role: 'boss', name: 'b' });
    expect(l['CVN-72'].hold).toEqual(['u2']);
    expect(heldPlayers(l, tracks())).toEqual(['Volt 3-1 | 401 Ace']);
    l['CVN-72'].cleared.u2 = 1;
    l = computeLaunch(l, [seat('boss', 'b')], tracks());
    expect(l['CVN-72'].hold).toEqual([]);
    // launched: the clearance goes with it
    const airborne = tracks().map((t) => (t.id === 'u2' ? { ...t, air: true, alt: 400 } : t));
    l = computeLaunch(l, [seat('boss', 'b')], airborne);
    expect(l['CVN-72'].cleared).toEqual({});
  });
});
