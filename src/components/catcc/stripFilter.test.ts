import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Formation, ScopeTrack } from './scopeModel.ts';
import { isAiFlight, isDefaultFilter, loadStripFilter, saveStripFilter, STRIP_FILTER_DEFAULT, stripFacts, stripFilterKey, stripShown, type StripCtx } from './stripFilter.ts';

const t = (id: string, ip?: boolean): ScopeTrack => ({ id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', g: 'Volt 3', ip, lat: 0, lon: 0, alt: 5000, p: [0, 0], trail: [], rng: 20, brg: 0 });
const flight = (...members: ScopeTrack[]): Formation => ({ id: 'blue|Volt 3', group: 'Volt 3', lead: members[0], members, collapsible: false });
const ctx = (over: Partial<StripCtx> = {}): StripCtx => ({ hull: 'CVN-72', me: { carrier: 'CVN-72', role: 'catcc' }, layout: 'condensed', owners: {}, spawns: {}, ...over });

describe('isAiFlight', () => {
  it('is AI only when no member is a player; a mixed flight is a player flight', () => {
    expect(isAiFlight(flight(t('a', false), t('b', false)))).toBe(true);
    expect(isAiFlight(flight(t('a', false), t('b', true)))).toBe(false);
    expect(isAiFlight(flight(t('a', true)))).toBe(false);
  });
  it('never calls a flight AI when the source does not say (Tacview)', () => {
    expect(isAiFlight(flight(t('a'), t('b')))).toBe(false);
  });
});

describe('stripFacts', () => {
  it('other agency: any owner but this seat, handed off or by the chain', () => {
    const f = flight(t('a', true));
    expect(stripFacts(f, false, ctx()).other).toBe(false); // owner from the chain
    expect(stripFacts(f, false, ctx({ owners: { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'catcc' } } } })).other).toBe(false); // mine
    // expanded seat names map onto the condensed layout: Marshal is CATCC
    expect(stripFacts(f, false, ctx({ owners: { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'marshal' } } } })).other).toBe(false);
    expect(stripFacts(f, false, ctx({ owners: { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'strike' } } } })).other).toBe(true);
    expect(stripFacts(f, false, ctx({ owners: { 'Volt 3': { owner: { carrier: 'CVN-71', role: 'catcc' } } } })).other).toBe(true);
  });
  it('a handoff offered to this seat stays; on deck the flight is the Air Boss’s: another agency', () => {
    const f = flight(t('a', true));
    const owners = { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'strike' as const }, pending: { to: { carrier: 'CVN-72', role: 'catcc' as const }, at: 1 } } };
    expect(stripFacts(f, false, ctx({ owners })).other).toBe(false);
    expect(stripFacts(f, true, ctx({ owners: { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'strike' } } } })).other).toBe(true);
    expect(stripFacts(f, true, ctx()).other).toBe(true);
  });
  it("CVW: the flight spawned on this screen's carrier", () => {
    expect(stripFacts(flight(t('a'), t('b')), false, ctx({ spawns: { a: 'CVN-72' } })).cvw).toBe(true);
    expect(stripFacts(flight(t('a'), t('b')), false, ctx({ spawns: { a: 'CVN-71', b: 'CVN-72' } })).cvw).toBe(false);
    expect(stripFacts(flight(t('a'), t('b')), false, ctx({ spawns: { b: 'CVN-72' } })).cvw).toBe(true);
    expect(stripFacts(flight(t('a')), false, ctx()).cvw).toBe(false);
  });
});

describe('stripShown', () => {
  const facts = (ai: boolean, other: boolean, cvw: boolean) => ({ ai, other, cvw });
  it('by default (every switch off) shows only player flights of this seat, CVW or not', () => {
    expect(STRIP_FILTER_DEFAULT).toEqual({ ai: false, other: false, cvw: false });
    for (const ai of [true, false]) for (const other of [true, false]) for (const cvw of [true, false]) expect(stripShown(facts(ai, other, cvw), STRIP_FILTER_DEFAULT)).toBe(!ai && !other);
  });
  it('shows every flight with AI aircraft and other agencies on', () => {
    for (const ai of [true, false]) for (const other of [true, false]) for (const cvw of [true, false]) expect(stripShown(facts(ai, other, cvw), { ai: true, other: true, cvw: false })).toBe(true);
  });
  it('hides each kind when its toggle is off, and non-CVW flights under CVW only', () => {
    expect(stripShown(facts(true, false, true), { ...STRIP_FILTER_DEFAULT, ai: false })).toBe(false);
    expect(stripShown(facts(false, false, true), { ...STRIP_FILTER_DEFAULT, ai: false })).toBe(true);
    expect(stripShown(facts(false, true, true), { ...STRIP_FILTER_DEFAULT, other: false })).toBe(false);
    expect(stripShown(facts(false, false, false), { ...STRIP_FILTER_DEFAULT, cvw: true })).toBe(false);
    expect(stripShown(facts(false, false, true), { ...STRIP_FILTER_DEFAULT, cvw: true })).toBe(true);
  });
});

describe('strip filter storage', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => store.clear());
  it('defaults, saves per seat and list, and ignores junk', () => {
    expect(loadStripFilter('catcc', 'radar')).toEqual(STRIP_FILTER_DEFAULT);
    expect(isDefaultFilter(loadStripFilter('catcc', 'radar'))).toBe(true);
    saveStripFilter('catcc', 'radar', { ai: false, other: true, cvw: true });
    expect(loadStripFilter('catcc', 'radar')).toEqual({ ai: false, other: true, cvw: true });
    expect(loadStripFilter('boss', 'arrivals')).toEqual(STRIP_FILTER_DEFAULT);
    localStorage.setItem(stripFilterKey('boss', 'arrivals'), '{"ai":"no"');
    expect(loadStripFilter('boss', 'arrivals')).toEqual(STRIP_FILTER_DEFAULT);
  });
});
