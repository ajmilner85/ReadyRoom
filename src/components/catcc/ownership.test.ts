import { describe, expect, it } from 'vitest';
import { autoRole, mayActFor, nextRole, ownerOf, seatFor } from './ownership.ts';

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

  it('acts for held-by-me and unheld seats only', () => {
    const seats = [{ carrier: 'CVN-71', role: 'marshal' as const, userId: 'u1', name: 'a', since: 0 }];
    expect(mayActFor({ carrier: 'CVN-71', role: 'marshal' }, seats, 'u1')).toBe(true);
    expect(mayActFor({ carrier: 'CVN-71', role: 'marshal' }, seats, 'u2')).toBe(false);
    expect(mayActFor({ carrier: 'CVN-71', role: 'final' }, seats, 'u2')).toBe(true);
  });
});
