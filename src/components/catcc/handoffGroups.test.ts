import { describe, expect, it } from 'vitest';
import { handoffGroups, type HandoffCtx, type OwnerView } from './ownership.ts';

const me = { carrier: 'CVN-71', role: 'marshal' as const };
const ctx = (carriers?: string[]): HandoffCtx => ({ layout: 'expanded', me, carriers, seats: [], onHandoff: () => undefined, onAccept: () => undefined, onAssume: () => undefined });

describe('hand-off popover', () => {
  it('groups destinations by carrier, own carrier first with the next seat at its top', () => {
    const v: OwnerView = { key: 'Volt 3', owner: me, explicit: true };
    const g = handoffGroups(v, ctx(['CVN-72', 'CVN-71', 'CVN-72']), 'approach');
    expect(g.map((x) => x.hull)).toEqual(['CVN-71', 'CVN-72']);
    // own carrier: not the owner's seat, the next seat first
    expect(g[0].seats[0].role).toBe('approach');
    expect(g[0].seats.some((s) => s.role === 'marshal')).toBe(false);
    // another carrier: every control seat, its marshal included; no PriFly, bridge or mission commander
    expect(g[1].seats.some((s) => s.role === 'marshal')).toBe(true);
    for (const x of g) expect(x.seats.some((s) => ['boss', 'miniboss', 'ood', 'writer', 'blso', 'mission_commander'].includes(s.role))).toBe(false);
  });

  it('offers the own carrier alone when the picture has no carrier list', () => {
    const g = handoffGroups({ key: 'Volt 3', owner: me, explicit: false }, ctx(), null);
    expect(g.map((x) => x.hull)).toEqual(['CVN-71']);
  });
});
