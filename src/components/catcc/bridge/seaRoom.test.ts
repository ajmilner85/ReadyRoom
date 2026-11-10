import { describe, expect, it } from 'vitest';
import type { MarineData } from '../radar/marine.ts';
import { seaRoomNm } from './seaRoom.ts';

// an island 1 NM square whose south shore is 10 NM north of (20 N, 140 E); a shoal 30 NM east
const k = Math.cos((20 * Math.PI) / 180);
const sq = (lat0: number, lon0: number, nm: number) => {
  const dl = nm / 60;
  const dn = nm / (60 * k);
  return [lon0, lat0, lon0 + dn, lat0, lon0 + dn, lat0 + dl, lon0, lat0 + dl, lon0, lat0];
};
const data = {
  v: 7,
  theatre: 'T',
  bbox: [10, 130, 30, 150],
  land: [sq(20 + 10 / 60, 140 - 0.5 / (60 * k), 1)],
  coast: [],
  nav: { d: 15, fill: [sq(20 - 0.5 / 60, 140 + 30 / (60 * k), 1)] },
  depth: [],
} as unknown as MarineData;

describe('sea room ahead', () => {
  it('finds land and shoal water along the course, nothing on clear courses', () => {
    expect(seaRoomNm(data, 20, 140, 0)).toBeCloseTo(10, 1);
    expect(seaRoomNm(data, 20, 140, 90)).toBeCloseTo(30, 1);
    expect(seaRoomNm(data, 20, 140, 180)).toBeNull();
    expect(seaRoomNm(data, 20, 140, 90, 20)).toBeNull(); // beyond the range searched
  });
});
