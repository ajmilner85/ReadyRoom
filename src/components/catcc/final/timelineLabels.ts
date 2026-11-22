/**
 * Label placement for the slot timeline (FinalView `SlotTimeline`, the Bolter slot and Upwind turn
 * panels): one side of the line at a time, the option keys above it and the arrivals below.
 *
 * Two label rows each side, always reserved, so the panel's height never depends on the picture:
 *   - near row (next to the line): the box sits over its own tick (the tick points into it);
 *   - far row: the box sits over its own tick too, and a vertical leader runs from the tick through
 *     the near row to it. The leader's column is kept clear of near-row boxes.
 * Every box stays inside [0, width] and covers its tick (a box at an end is clamped, still over its
 * tick), so no leader is ever slanted and none crosses text or another leader.
 *
 * Labels are taken in time order (the earliest, most urgent first). Each goes to the near row if it
 * fits there, else the far row; to make room the previous box in that row may slide left (it still
 * covers its own tick), or the near row's last label may move up to the far row so this one takes the
 * near row. A label that fits in neither row is folded into a "+n" chip placed where it would have
 * gone (or into the chip just before it); if even the chip has no room, the latest label placed is
 * folded into it as well. Chips are drawn neutral grey.
 * Ticks are drawn for every mark whatever happens to its label.
 */

/** IBM Plex Mono advance: 600 / 1000 em */
export const MONO_EM = 0.6;
/** the timeline labels' font size, px */
export const LABEL_FONT_PX = 10.5;
export const LABEL_CHAR_PX = MONO_EM * LABEL_FONT_PX;
/** clear space between two boxes in a row, px */
export const LABEL_GAP_PX = 5;
/** clear space between a leader and a near-row box, px */
const LEADER_GAP_PX = 3;
/** a box covers its tick at least this far inside its edge, px */
const EDGE_PX = 2;

/**
 * The timeline's fixed geometry, px: two label rows above the line and two below, always reserved,
 * so the panel's height is TIMELINE_H whatever the labels do. Ticks run TICK_PX either side of the line.
 */
export const LABEL_ROW_PX = 13;
export const TICK_PX = 5;
/** clear space between a tick's end and the near row, and between the rows */
const ROW_GAP_PX = 2;
export const TIMELINE_LINE_Y = 2 * LABEL_ROW_PX + ROW_GAP_PX + TICK_PX + ROW_GAP_PX;
export const TIMELINE_H = 2 * TIMELINE_LINE_Y;
/** top of a label box (px from the timeline's top) by side and row */
export const labelTop = (side: 'above' | 'below', row: 0 | 1) =>
  side === 'above' ? TIMELINE_LINE_Y - TICK_PX - ROW_GAP_PX - (row + 1) * LABEL_ROW_PX - row * ROW_GAP_PX : TIMELINE_LINE_Y + TICK_PX + ROW_GAP_PX + row * (LABEL_ROW_PX + ROW_GAP_PX);

export interface TimelineItem {
  id: string;
  /** tick position, px from the timeline's left edge */
  x: number;
  text: string;
}

export interface TimelineLabel {
  /** the marks this label stands for: one, or several for a "+n" chip */
  ids: string[];
  text: string;
  /** the tick the label (and its leader) belongs to, px */
  x: number;
  left: number;
  w: number;
  /** 0 next to the line, 1 the far row (with a leader) */
  row: 0 | 1;
  chip: boolean;
}

interface Box {
  label: TimelineLabel;
  /** lowest left this box may slide to (its own tick, its predecessors) */
  lo: number;
}

export const labelWidth = (text: string, charPx = LABEL_CHAR_PX) => Math.ceil(text.length * charPx) + 1;

/** Places the labels of one side of the timeline in two rows (see the file comment). */
export function placeTimelineLabels(items: readonly TimelineItem[], width: number, charPx = LABEL_CHAR_PX): TimelineLabel[] {
  const W = Math.max(0, width);
  const rows: [Box[], Box[]] = [[], []];
  const order: Box[] = [];
  const last = (r: 0 | 1) => rows[r][rows[r].length - 1];
  const right = (b: Box) => b.label.left + b.label.w;

  // the range of lefts over which a box of width w still covers a tick at x, inside the timeline
  const cover = (x: number, w: number): [number, number] => {
    const maxL = Math.max(0, W - w);
    const lo = Math.min(maxL, Math.max(0, x - w + EDGE_PX));
    const hi = Math.max(lo, Math.min(maxL, x - EDGE_PX));
    return [lo, hi];
  };

  /** Tries a box at tick x in row r; returns the placed box or null (nothing changed). */
  const tryRow = (r: 0 | 1, x: number, w: number, make: (left: number) => TimelineLabel): Box | null => {
    const [lo, hi] = cover(x, w);
    const want = Math.min(hi, Math.max(lo, x - w / 2));
    // near row: clear of the leaders of far-row labels before it
    const lf = last(1);
    const floor = r === 0 && lf ? lf.label.x + LEADER_GAP_PX : -Infinity;
    const base = Math.max(lo, floor);
    if (base > hi) return null;
    let left = Math.max(want, base);
    const prev = last(r);
    let shift = 0;
    if (prev && right(prev) + LABEL_GAP_PX > left) {
      // use this box's own slack to the right first, then slide the previous box left
      left = Math.min(hi, right(prev) + LABEL_GAP_PX);
      shift = right(prev) + LABEL_GAP_PX - left;
      if (prev.label.left - shift < prev.lo) return null;
    }
    // far row: the leader's column must be clear of the near row's last box
    let nearShift = 0;
    const ln = last(0);
    if (r === 1 && ln && right(ln) + LEADER_GAP_PX > x) {
      nearShift = right(ln) + LEADER_GAP_PX - x;
      if (ln.label.left - nearShift < ln.lo) return null;
    }
    if (prev) prev.label.left -= shift;
    if (ln && nearShift) ln.label.left -= nearShift;
    // only the last box of a row ever slides, so its predecessor stands where it is now
    const box: Box = { label: make(left), lo: Math.min(left, Math.max(base, prev ? right(prev) + LABEL_GAP_PX : -Infinity)) };
    rows[r].push(box);
    order.push(box);
    return box;
  };

  const remove = (b: Box) => {
    const r = b.label.row;
    rows[r].splice(rows[r].indexOf(b), 1);
    order.splice(order.indexOf(b), 1);
  };

  const place = (x: number, w: number, make: (left: number, row: 0 | 1) => TimelineLabel): Box | null => {
    const got = tryRow(0, x, w, (l) => make(l, 0)) ?? tryRow(1, x, w, (l) => make(l, 1));
    if (got) return got;
    // swap: the near row's last label goes up to the far row (its leader on its own tick) and this one
    // takes the near row after it, e.g. NOW and 4 a few px apart, or a long callsign just before a short one
    const k = last(0);
    if (!k) return null;
    const saved = { rows: [[...rows[0]], [...rows[1]]] as [Box[], Box[]], order: [...order], lefts: order.map((b) => b.label.left) };
    remove(k);
    const up = tryRow(1, k.label.x, k.label.w, (l) => ({ ...k.label, left: l, row: 1 }));
    const me = up && tryRow(0, x, w, (l) => make(l, 0));
    if (me) return me;
    rows[0] = saved.rows[0];
    rows[1] = saved.rows[1];
    order.length = 0;
    order.push(...saved.order);
    saved.order.forEach((b, i) => (b.label.left = saved.lefts[i]));
    return null;
  };

  const chipW = labelWidth('+99', charPx);
  let open: Box | null = null;
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.x - b.it.x || a.i - b.i);
  for (const { it } of sorted) {
    const w = labelWidth(it.text, charPx);
    const got = place(it.x, w, (left, row) => ({ ids: [it.id], text: it.text, x: it.x, left, w, row, chip: false }));
    if (got) {
      open = null;
      continue;
    }
    // a run of labels that don't fit joins the chip just before it rather than starting another
    const latest = order[order.length - 1];
    if (!open && latest?.label.chip && it.x - latest.label.x <= 3 * chipW) open = latest;
    if (open) {
      open.label.ids.push(it.id);
      open.label.text = `+${open.label.ids.length}`;
      continue;
    }
    // fold this label into a chip where it would have gone; failing that, fold in the latest placed too
    let ids = [it.id];
    let x = it.x;
    for (;;) {
      const n = ids;
      const chip = place(x, chipW, (left, row) => ({ ids: n, text: `+${n.length}`, x, left, w: chipW, row, chip: true }));
      if (chip) {
        open = chip;
        break;
      }
      const prev = order[order.length - 1];
      if (!prev) {
        // narrower than a chip: pin it at the start
        const label: TimelineLabel = { ids, text: `+${ids.length}`, x, left: 0, w: chipW, row: 0, chip: true };
        open = { label, lo: 0 };
        rows[0].push(open);
        order.push(open);
        break;
      }
      remove(prev);
      ids = [...prev.label.ids, ...ids];
      x = prev.label.x;
      // folded back onto an earlier chip: join it
      const before = order[order.length - 1];
      if (before?.label.chip && x - before.label.x <= 3 * chipW) {
        before.label.ids.push(...ids);
        before.label.text = `+${before.label.ids.length}`;
        open = before;
        break;
      }
    }
  }
  // a chip keeps its reserved three-character box (its text is centred in it)
  return order.map((b) => ({ ...b.label, ids: [...b.label.ids] }));
}
