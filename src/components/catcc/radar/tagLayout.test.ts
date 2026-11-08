import { describe, expect, it } from 'vitest';
import { layoutTags, tagBox, type TagSpec } from './tagLayout.ts';

const view = { x0: -50, y0: -50, x1: 50, y1: 50 };
const overlaps = (tags: TagSpec[], pl: ReturnType<typeof layoutTags>, k: number) => {
  const boxes = tags.map((t) => tagBox(t, pl.get(t.id)!, k));
  let n = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)) n++;
    }
  return n;
};

describe('layoutTags', () => {
  it('separates tags of aircraft flying close together (the screenshot case)', () => {
    // two Hornets ~1 NM apart on parallel tracks, tags 2 rows, k = 0.5 NM per ref unit
    const tags: TagSpec[] = [
      { id: 'hawk', p: [0, 0], w: 7.1, h: 2.35, v: [1, 0.3], priority: 1 },
      { id: '623', p: [2.5, 1.2], w: 7.1, h: 2.35, v: [1, 0.3], priority: 1 },
    ];
    const pl = layoutTags(tags, { k: 0.5, hitK: 0.5, view });
    expect(overlaps(tags, pl, 0.5)).toBe(0);
  });

  it('handles a dense cluster without any overlapping tags', () => {
    const tags: TagSpec[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, p: [(i % 4) * 2, Math.floor(i / 4) * 2] as [number, number], w: 7.1, h: 2.35, priority: i }));
    const pl = layoutTags(tags, { k: 0.3, hitK: 0.3, view });
    expect(overlaps(tags, pl, 0.3)).toBe(0);
  });

  it('prefers the side away from the velocity vector and keeps a clear previous placement', () => {
    const t: TagSpec = { id: 'a', p: [0, 0], w: 7, h: 2.35, v: [1, -1], priority: 0 };
    const pl = layoutTags([t], { k: 0.5, hitK: 0.5, view }).get('a')!;
    expect(pl.q).toEqual([-1, 1]); // velocity NE → tag SW
    const prev = new Map([['a', { q: [1, 1] as [number, number], L: 2.4 }]]);
    expect(layoutTags([t], { k: 0.5, hitK: 0.5, view, prev }).get('a')).toEqual(prev.get('a'));
  });
});
