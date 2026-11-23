import { useLayoutEffect, useState } from 'react';

export interface BoxSize {
  w: number;
  h: number;
}

/** an element's padding-box size in px (clientWidth / clientHeight) */
export const clientBox = (el: HTMLElement): BoxSize => ({ w: el.clientWidth, h: el.clientHeight });

/** an element's content-box size in px, fractional (what a ResizeObserver's contentRect reports) */
export const contentBox = (el: HTMLElement): BoxSize => {
  const cs = getComputedStyle(el);
  return { w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0 };
};

/**
 * The next size to keep: a zero-sized reading (the element hidden, or not laid out yet) keeps the
 * previous size, and an unchanged one returns `prev` itself so React skips the re-render.
 */
export function nextBoxSize(prev: BoxSize, read: BoxSize): BoxSize {
  if (!(read.w > 0 && read.h > 0)) return prev;
  return read.w === prev.w && read.h === prev.h ? prev : read;
}

/**
 * An element's size, measured before the first paint and kept current with a ResizeObserver.
 *
 * Views that scale their text or tags by a factor taken from their own size must not paint with a
 * guessed size: a ResizeObserver's first report can land after the first paint (Firefox), so a size
 * known only from it shows one frame drawn at `initial` (the radar's labels flashed oversized on
 * every view switch). The layout effect reads the size synchronously, and React re-renders with it
 * before the browser paints.
 */
export function useBoxSize(ref: React.RefObject<HTMLElement | null>, initial: BoxSize, measure: (el: HTMLElement) => BoxSize = clientBox): BoxSize {
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((prev) => nextBoxSize(prev, measure(el)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // measure is a module-level function at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  return size;
}
