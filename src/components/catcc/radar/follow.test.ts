import { describe, expect, it } from 'vitest';
import { canFollow, dblClickAction, followStep, zoomCentre, type Pt } from './follow.ts';

const air: { id: string; p: Pt }[] = [
  { id: 'a', p: [10, -4] },
  { id: 'b', p: [-22, 7.5] },
];

describe('radar Follow', () => {
  it('is off when not turned on, whatever is hooked', () => {
    expect(followStep(false, 'a', air)).toEqual({ kind: 'off' });
    expect(followStep(false, null, air)).toEqual({ kind: 'off' });
  });
  it('centres on the hooked contact', () => {
    expect(followStep(true, 'a', air)).toEqual({ kind: 'follow', id: 'a', p: [10, -4] });
  });
  it('moves to a newly hooked contact', () => {
    expect(followStep(true, 'b', air)).toEqual({ kind: 'follow', id: 'b', p: [-22, 7.5] });
  });
  it('tracks the contact as it moves', () => {
    const moved = air.map((t) => (t.id === 'a' ? { ...t, p: [11, -3.5] as Pt } : t));
    expect(followStep(true, 'a', moved)).toEqual({ kind: 'follow', id: 'a', p: [11, -3.5] });
  });
  it('stops when the hook is dropped', () => {
    expect(followStep(true, null, air)).toEqual({ kind: 'stop' });
  });
  it('stops when the hooked contact leaves the picture', () => {
    expect(followStep(true, 'a', air.filter((t) => t.id !== 'a'))).toEqual({ kind: 'stop' });
  });
  it('can be turned on only with a contact hooked that is in the picture', () => {
    expect(canFollow('a', air)).toBe(true);
    expect(canFollow(null, air)).toBe(false);
    expect(canFollow('gone', air)).toBe(false);
  });
  it('zooming while following keeps the followed contact centred (wheel cursor ignored)', () => {
    expect(zoomCentre([10, -4], 50, 25, [30, 30], true)).toEqual([10, -4]);
    expect(zoomCentre([10, -4], 50, 100, undefined, true)).toEqual([10, -4]);
    // and Follow is still on for the same contact after it
    expect(followStep(true, 'a', air)).toEqual({ kind: 'follow', id: 'a', p: [10, -4] });
  });
  it('zooming unheld keeps the point under the cursor', () => {
    expect(zoomCentre([0, 0], 50, 25, [10, 10], false)).toEqual([5, 5]);
  });
  it('double-click on a contact (Select tool) hooks and follows it', () => {
    expect(dblClickAction('select', false, 'b', [0, 0])).toEqual({ kind: 'follow', id: 'b' });
  });
  it('double-click on empty map (Select tool) centres there', () => {
    expect(dblClickAction('select', false, undefined, [3, 4])).toEqual({ kind: 'centre', p: [3, 4] });
  });
  it('double-click leaves the other tools and placements alone', () => {
    for (const tool of ['bra', 'marshal', 'cpa', 'vec', 'int', 'wp']) {
      expect(dblClickAction(tool, false, 'a', [0, 0])).toEqual({ kind: 'none' });
      expect(dblClickAction(tool, false, undefined, [0, 0])).toEqual({ kind: 'none' });
    }
    expect(dblClickAction('select', true, 'a', [0, 0])).toEqual({ kind: 'none' });
  });
});
