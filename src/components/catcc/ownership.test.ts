import { describe, expect, it } from 'vitest';
import { autoRole, handoffState, mayActFor, nextRole, onCarrier, ownerOf, seatFor, seatLabel, type HandoffCtx } from './ownership.ts';

describe('track ownership', () => {
  it('follows the standard chain by phase and range', () => {
    expect(autoRole('inbound', 80)).toBe('strike');
    expect(autoRole('inbound', 40)).toBe('marshal');
    expect(autoRole('approach', 12)).toBe('approach');
    expect(autoRole('approach', 4)).toBe('final');
    expect(autoRole('approach', 0.5)).toBe('lso');
    expect(autoRole('departure', 20)).toBe('departure');
    expect(autoRole('departure', 70)).toBe('strike');
  });

  it('lets another seat assume control, and tells the seat it was taken from', () => {
    const app = { carrier: 'CVN-71', role: 'approach' as const };
    const fin = { carrier: 'CVN-71', role: 'final' as const };
    const seats = [{ ...app, userId: 'u1', name: 'A', since: 0 }, { ...fin, userId: 'u2', name: 'B', since: 0 }];
    const ctx = (me: typeof app | typeof fin, userId: string): HandoffCtx => ({ layout: 'expanded', me, seats, userId, onHandoff: () => undefined, onAccept: () => undefined, onAssume: () => undefined });
    const owned = ownerOf('Volt 3', 'CVN-71', 'approach', 10, 'expanded', { 'Volt 3': { owner: app } });
    expect(handoffState(owned, ctx(fin, 'u2'))).toMatchObject({ mine: false, canAssume: true, lost: false });
    expect(handoffState(owned, ctx(app, 'u1'))).toMatchObject({ mine: true, canAssume: false });
    // someone else's seat: not this user's to act for
    expect(handoffState(owned, ctx(fin, 'u1')).canAssume).toBe(false);
    const taken = ownerOf('Volt 3', 'CVN-71', 'approach', 10, 'expanded', { 'Volt 3': { owner: fin, took: { from: app, at: 5 } } });
    expect(taken.took?.from).toEqual(app);
    expect(handoffState(taken, ctx(app, 'u1'))).toMatchObject({ mine: false, lost: true, canAssume: true });
    expect(handoffState(taken, ctx(fin, 'u2'))).toMatchObject({ mine: true, lost: false });
  });

  it('gives PriFly the deck: before launch and from touchdown, whoever had the flight airborne; Departure (CATCC condensed) next', () => {
    expect(autoRole('deck', 0)).toBe('boss');
    const owners = { 'Volt 3': { owner: { carrier: 'CVN-71', role: 'lso' as const } } };
    expect(ownerOf('Volt 3', 'CVN-71', 'deck', 0, 'expanded', owners).owner.role).toBe('boss');
    expect(ownerOf('Volt 3', 'CVN-71', 'deck', 0, 'expanded', owners).explicit).toBe(false);
    expect(nextRole('boss', 'expanded')).toBe('departure');
    expect(nextRole('boss', 'condensed')).toBe('catcc');
    // airborne after launch: Departure's by the chain, no handoff needed
    expect(ownerOf('Volt 5', 'CVN-71', 'departure', 3, 'condensed', {}).owner.role).toBe('catcc');
  });

  it('maps onto the staffing layout: condensed owners are locations', () => {
    expect(seatFor('marshal', 'condensed')).toBe('catcc');
    expect(seatFor('aw', 'condensed')).toBe('strike');
    expect(seatFor('lso', 'expanded')).toBe('clso');
    expect(seatFor('marshal', 'expanded')).toBe('marshal');
  });

  it('offers the next seat in the chain', () => {
    expect(nextRole('strike', 'expanded')).toBe('marshal');
    expect(nextRole('marshal', 'expanded')).toBe('approach');
    expect(nextRole('final', 'expanded')).toBe('clso');
    expect(nextRole('strike', 'condensed')).toBe('catcc');
    expect(nextRole('catcc', 'condensed')).toBe('lso');
  });

  it("the room's record wins over the default chain", () => {
    const o = ownerOf('Volt 3', 'CVN-71', 'inbound', 80, 'expanded', { 'Volt 3': { owner: { carrier: 'CVN-71', role: 'marshal' }, pending: { to: { carrier: 'CVN-71', role: 'approach' }, at: 1 } } });
    expect(o.owner.role).toBe('marshal');
    expect(o.explicit).toBe(true);
    expect(o.pending?.to.role).toBe('approach');
    expect(ownerOf('Volt 3', 'CVN-71', 'inbound', 80, 'expanded', {}).owner.role).toBe('strike');
  });

  it('flags a handoff due when the flight has reached the next seat in the chain', () => {
    const owners = { 'Volt 3': { owner: { carrier: 'CVN-71', role: 'approach' as const } } };
    expect(ownerOf('Volt 3', 'CVN-71', 'approach', 4, 'expanded', owners).due).toBe('final');
    expect(ownerOf('Volt 3', 'CVN-71', 'approach', 12, 'expanded', owners).due).toBeUndefined();
    // handed on early: not due back
    expect(ownerOf('Volt 3', 'CVN-71', 'inbound', 40, 'expanded', owners).due).toBeUndefined();
  });

  it('acts for held-by-me and unheld seats only', () => {
    const seats = [{ carrier: 'CVN-71', role: 'marshal' as const, userId: 'u1', name: 'a', since: 0 }];
    expect(mayActFor({ carrier: 'CVN-71', role: 'marshal' }, seats, 'u1')).toBe(true);
    expect(mayActFor({ carrier: 'CVN-71', role: 'marshal' }, seats, 'u2')).toBe(false);
    expect(mayActFor({ carrier: 'CVN-71', role: 'final' }, seats, 'u2')).toBe(true);
  });

  it('labels a seat on another carrier with its hull', () => {
    const me = { carrier: 'CVN-71', role: 'marshal' as const };
    expect(seatLabel({ carrier: 'CVN-71', role: 'approach' }, me)).toBe('APP');
    expect(seatLabel({ carrier: 'CVN-72', role: 'approach' }, me)).toBe('CVN-72 APP');
  });

  it('puts a flight on the carrier the room says, else the nearest one', () => {
    expect(onCarrier('Volt 3', 'CVN-71', 'CVN-71', {})).toBe(true);
    expect(onCarrier('Volt 3', 'CVN-72', 'CVN-71', {})).toBe(false);
    expect(onCarrier('Volt 3', undefined, 'CVN-71', {})).toBe(true);
    // offered to CVN-72: on both carriers' lists until accepted, then only CVN-72's
    const pending = { 'Volt 3': { owner: { carrier: 'CVN-71', role: 'marshal' as const }, pending: { to: { carrier: 'CVN-72', role: 'approach' as const }, at: 1 } } };
    expect(onCarrier('Volt 3', 'CVN-71', 'CVN-71', pending)).toBe(true);
    expect(onCarrier('Volt 3', 'CVN-71', 'CVN-72', pending)).toBe(true);
    const taken = { 'Volt 3': { owner: { carrier: 'CVN-72', role: 'approach' as const } } };
    expect(onCarrier('Volt 3', 'CVN-71', 'CVN-71', taken)).toBe(false);
    expect(onCarrier('Volt 3', 'CVN-71', 'CVN-72', taken)).toBe(true);
  });
});
