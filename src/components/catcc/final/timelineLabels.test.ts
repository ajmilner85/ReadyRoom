import { describe, expect, it } from 'vitest';
import { LABEL_GAP_PX, LABEL_ROW_PX, TICK_PX, TIMELINE_H, TIMELINE_LINE_Y, labelTop, labelWidth, placeTimelineLabels, type TimelineItem, type TimelineLabel } from './timelineLabels.ts';

const items = (...xs: [string, number][]): TimelineItem[] => xs.map(([text, x], i) => ({ id: `${text}#${i}`, x, text }));

/** every invariant of a placement: inside the timeline, over its tick, no overlaps, leaders clear */
function check(out: TimelineLabel[], W: number, src: TimelineItem[]) {
  for (const l of out) {
    expect(l.row === 0 || l.row === 1).toBe(true);
    expect(l.left).toBeGreaterThanOrEqual(0);
    if (l.w <= W) expect(l.left + l.w).toBeLessThanOrEqual(W + 1e-9);
    // the box is over its own tick: the tick (or the leader) points into it
    expect(l.x).toBeGreaterThanOrEqual(l.left - 1e-9);
    expect(l.x).toBeLessThanOrEqual(l.left + l.w + 1e-9);
  }
  for (const r of [0, 1] as const) {
    const row = out.filter((l) => l.row === r).sort((a, b) => a.left - b.left);
    for (let i = 1; i < row.length; i++) expect(row[i].left).toBeGreaterThanOrEqual(row[i - 1].left + row[i - 1].w + LABEL_GAP_PX - 1e-9);
  }
  // far-row leaders run through the near row clear of its boxes
  for (const f of out.filter((l) => l.row === 1)) {
    for (const n of out.filter((l) => l.row === 0)) expect(f.x < n.left || f.x > n.left + n.w).toBe(true);
  }
  // every mark is labelled exactly once (itself or in a chip)
  expect(out.flatMap((l) => l.ids).sort()).toEqual(src.map((s) => s.id).sort());
}

describe('placeTimelineLabels', () => {
  it('keeps well-spaced labels centred on their ticks in the near row', () => {
    const src = items(['NOW', 10], ['4', 80], ['6', 140], ['8', 190]);
    const out = placeTimelineLabels(src, 200);
    check(out, 200, src);
    expect(out.every((l) => l.row === 0 && !l.chip)).toBe(true);
    const four = out.find((l) => l.text === '4')!;
    expect(four.left + four.w / 2).toBeCloseTo(80, 5);
  });

  it('clamps labels at both ends, still over their ticks', () => {
    const src = items(['HAWK 1-2', 0], ['211', 200]);
    const out = placeTimelineLabels(src, 200);
    check(out, 200, src);
    expect(out[0].left).toBe(0);
    expect(out[1].left + out[1].w).toBeCloseTo(200, 5);
  });

  it('moves a close label to the far row (with a leader) instead of overlapping', () => {
    // three arrivals 8 px apart (10 s apart on a 300 s, 240 px timeline)
    const src = items(['733', 100], ['205', 108], ['623', 116]);
    const out = placeTimelineLabels(src, 240);
    check(out, 240, src);
    expect(out.some((l) => l.row === 1)).toBe(true);
    expect(out.some((l) => l.chip)).toBe(false);
  });

  it('labels NOW and 4 a few px apart at the start (NOW up to the far row)', () => {
    const src = items(['NOW', 0], ['4', 10], ['6', 33], ['8', 53]);
    const out = placeTimelineLabels(src, 156);
    check(out, 156, src);
    expect(out.some((l) => l.chip)).toBe(false);
  });

  it('separates long callsigns that would run together ("HAWK2032")', () => {
    const src = items(['HAWK 1-2', 250], ['203', 262], ['211', 285]);
    const out = placeTimelineLabels(src, 300);
    check(out, 300, src);
    expect(out.filter((l) => !l.chip)).toHaveLength(3);
  });

  it('uses two rows at most and folds what does not fit into a "+n" chip', () => {
    const src = items(['HAWK 1-2', 100], ['VIPER 2-1', 106], ['203', 112], ['211', 118], ['623', 124], ['733', 130]);
    const out = placeTimelineLabels(src, 200);
    check(out, 200, src);
    const chips = out.filter((l) => l.chip);
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.text).toBe(`+${c.ids.length}`);
    // the earliest arrival keeps its own label
    expect(out.find((l) => l.ids.includes(src[0].id))?.chip).toBe(false);
  });

  it('never overlaps across random pictures and widths', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const names = ['NOW', '4', '6', '8', '10', '733', '205', 'HAWK 1-2', 'VIPER 2-1', '211'];
    for (let k = 0; k < 400; k++) {
      const W = 120 + Math.floor(rnd() * 260);
      const n = 1 + Math.floor(rnd() * 8);
      const src = items(...Array.from({ length: n }, () => [names[Math.floor(rnd() * names.length)], rnd() * W] as [string, number]));
      check(placeTimelineLabels(src, W), W, src);
    }
  });

  it('reserves two rows each side inside a constant height, clear of the ticks', () => {
    const boxes = (['above', 'below'] as const).flatMap((s) => ([0, 1] as const).map((r) => [labelTop(s, r), labelTop(s, r) + LABEL_ROW_PX] as const));
    for (const [t, b] of boxes) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(TIMELINE_H);
      // no row reaches the ticks
      expect(b <= TIMELINE_LINE_Y - TICK_PX || t >= TIMELINE_LINE_Y + TICK_PX).toBe(true);
    }
    const sorted = [...boxes].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
  });

  it('measures labels at the mono advance', () => {
    expect(labelWidth('HAWK 1-2')).toBe(Math.ceil(8 * 6.3) + 1);
  });
});
