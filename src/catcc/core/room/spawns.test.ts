import { describe, expect, it } from 'vitest';
import { destination } from '../geo.ts';
import type { WireTrack } from './protocol.ts';
import { flightSpawn, noteSpawns, spawnHulls } from './spawns.ts';

const CV72 = { lat: 26.2, lon: 56.8 };
const CV71 = destination(CV72.lat, CV72.lon, 90, 20);
const cv = (hull: string, at: { lat: number; lon: number }): WireTrack => ({ id: hull, k: 'carrier', ty: 'CVN_72', sd: 'blue', hull, lat: at.lat, lon: at.lon, alt: 0 });
const jet = (id: string, at: { lat: number; lon: number }, air: boolean | undefined, alt = air ? 5000 : 60): WireTrack => ({ id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', lat: at.lat, lon: at.lon, alt, air });
const near = (at: { lat: number; lon: number }, nm: number) => destination(at.lat, at.lon, 45, nm);

describe('noteSpawns', () => {
  it('gives an aircraft first seen on a deck that carrier, and one first seen elsewhere none', () => {
    const seen: Record<string, string | null> = {};
    const added = noteSpawns(seen, [cv('CVN-72', CV72), cv('CVN-71', CV71), jet('a', near(CV72, 0.1), false), jet('b', near(CV71, 0.3), false), jet('c', near(CV72, 3), true), jet('d', near(CV72, 5), false)]);
    expect(added).toBe(true);
    expect(seen).toEqual({ a: 'CVN-72', b: 'CVN-71', c: null, d: null });
    expect(spawnHulls(seen)).toEqual({ a: 'CVN-72', b: 'CVN-71' });
  });

  it('keeps the first answer: a later trap on a carrier changes nothing, nor a launch, nor leaving the picture', () => {
    const seen: Record<string, string | null> = {};
    noteSpawns(seen, [cv('CVN-72', CV72), cv('CVN-71', CV71), jet('air', near(CV72, 10), true), jet('deck', near(CV72, 0.1), false)]);
    // the air-started jet traps on CVN-72; the deck jet launches and later lands on CVN-71
    expect(noteSpawns(seen, [cv('CVN-72', CV72), cv('CVN-71', CV71), jet('air', near(CV72, 0.1), false), jet('deck', near(CV71, 0.1), false)])).toBe(false);
    // both out of the picture for a while, then back
    noteSpawns(seen, [cv('CVN-72', CV72)]);
    noteSpawns(seen, [cv('CVN-72', CV72), jet('air', near(CV72, 0.1), false), jet('deck', near(CV72, 20), true)]);
    expect(seen).toEqual({ air: null, deck: 'CVN-72' });
  });

  it('decides nothing in a frame without a carrier (a feed still filling in)', () => {
    const seen: Record<string, string | null> = {};
    expect(noteSpawns(seen, [jet('a', CV72, false)])).toBe(false);
    expect(seen).toEqual({});
    noteSpawns(seen, [cv('CVN-72', CV72), jet('a', CV72, false)]);
    expect(seen).toEqual({ a: 'CVN-72' });
  });

  it('without the in-air flag, low and on the deck counts; high over it does not', () => {
    const seen: Record<string, string | null> = {};
    noteSpawns(seen, [cv('CVN-72', CV72), jet('low', near(CV72, 0.1), undefined, 70), jet('high', near(CV72, 0.1), undefined, 800)]);
    expect(seen).toEqual({ low: 'CVN-72', high: null });
  });

  it('ignores ships and carriers themselves', () => {
    const seen: Record<string, string | null> = {};
    noteSpawns(seen, [cv('CVN-72', CV72), { ...cv('x', near(CV72, 0.1)), k: 'ship', hull: undefined }]);
    expect(seen).toEqual({});
  });
});

describe('flightSpawn', () => {
  it("is the lead's spawn carrier, else the first member's that has one", () => {
    expect(flightSpawn('a', ['a', 'b'], { a: 'CVN-72', b: 'CVN-71' })).toBe('CVN-72');
    expect(flightSpawn('a', ['a', 'b', 'c'], { c: 'CVN-71' })).toBe('CVN-71');
    expect(flightSpawn('a', ['a', 'b'], {})).toBeUndefined();
  });
});
