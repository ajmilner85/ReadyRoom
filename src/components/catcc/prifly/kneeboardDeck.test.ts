import { describe, expect, it } from 'vitest';
import { CATS, type DeckJet } from './deck.ts';
import { planTaxi, taxiDest } from './taxiNet.ts';
import { catLine, clearanceText, findMe, flightKey } from './kneeboardDeck.ts';

const jet = (id: string, x: number, y: number, a: number, t: Record<string, unknown> = {}) => ({ t: { id, ...t }, x, y, a, moving: false }) as unknown as DeckJet;
const parked = (id: string, spot: string, t: Record<string, unknown> = {}) => jet(id, taxiDest(spot)!.p[0], taxiDest(spot)!.p[1], 90, t);
const pose = (j: DeckJet) => ({ id: j.t.id, x: j.x, y: j.y, a: j.a });

describe('deck kneeboard', () => {
  it("finds the pilot's aircraft by board number, a player's before an AI's, or by the one picked", () => {
    const jets = [parked('ai', 'E11', { bd: '623' }), parked('me', 'E21', { bd: '623', ip: true }), parked('x', 'E31', { bd: '311' })];
    expect(findMe(jets, 623)?.t.id).toBe('me');
    expect(findMe(jets, '311')?.t.id).toBe('x');
    expect(findMe(jets, 999)).toBeUndefined();
    expect(findMe(jets, undefined)).toBeUndefined();
    expect(findMe(jets, 623, 'x')?.t.id).toBe('x');
    // a pick that has left the deck falls back to the board number
    expect(findMe(jets, 623, 'gone')?.t.id).toBe('me');
    expect(flightKey({ id: 'a', g: 'HAWK 1' })).toBe('HAWK 1');
    expect(flightKey({ id: 'a' })).toBe('a');
  });

  it('lines aircraft up for a catapult: the one spotted, then the rest in the order they were sent', () => {
    const s = CATS['1'][0];
    const jets = [jet('k', s[0] + 4, s[1], 0), parked('a', 'E31'), parked('b', 'E32'), parked('c', 'E22')];
    const plans = planTaxi(jets.map(pose), { b: { to: 'C1', at: 1 }, a: { to: 'C1', at: 2 }, c: { to: 'C2', at: 3 } });
    expect(catLine(jets, plans, '1').map((r) => [r.id, r.spotted])).toEqual([['k', true], ['b', false], ['a', false]]);
    expect(catLine(jets, plans, '2').map((r) => r.id)).toEqual(['c']);
    expect(catLine(jets, plans, '3')).toEqual([]);
  });

  it('says what the clearance is', () => {
    const jets = [parked('a', 'E31'), parked('b', 'E32')];
    const plans = planTaxi(jets.map(pose), { a: { to: 'C1', at: 1 }, b: { to: 'C1', at: 2 } });
    const name = (id: string) => ({ a: '311', b: '623' })[id] ?? '';
    expect(clearanceText(plans.get('a'), name)).toMatchObject({ head: 'TAXI CAT 1', tone: 'clear' });
    const b = clearanceText(plans.get('b'), name);
    expect(b).toMatchObject({ head: 'TAXI CAT 1', tone: 'hold' });
    expect(b.sub).toMatch(/^Hold short of 311 · clear for \d+ of \d+ m$/);
    expect(clearanceText(undefined, name).tone).toBe('none');
    const there = planTaxi([pose(parked('p', 'CO1'))],{ p: { to: 'CO1', at: 1 } }).get('p');
    expect(clearanceText(there, name)).toMatchObject({ head: 'AT CORRAL - 1', tone: 'there' });
  });
});
