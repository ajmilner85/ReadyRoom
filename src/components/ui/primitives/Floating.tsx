import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal-based floating layer anchored to a trigger element.
 * Panes scroll internally (overflow:auto), so popovers must escape them via a portal
 * rather than position:absolute inside the pane.
 */
export type Placement = 'bottom-start' | 'bottom-end' | 'bottom' | 'top' | 'top-start' | 'top-end' | 'right-start' | 'left-start';

interface FloatingProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose?: () => void;
  placement?: Placement;
  offset?: number;
  /** Match the anchor's width (dropdowns). */
  matchWidth?: boolean;
  zIndex?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Close when clicking outside (default true). */
  dismissOnOutside?: boolean;
}

export const Floating: React.FC<FloatingProps> = ({
  anchor, open, onClose, placement = 'bottom-start', offset = 4, matchWidth, zIndex = 90,
  children, className, style, dismissOnOutside = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number } | null>(null);

  const compute = useCallback(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const f = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0;
    let left = 0;
    const [side, align] = placement.split('-') as [string, string | undefined];
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? a.bottom + offset : a.top - f.height - offset;
      // flip vertically if it would overflow
      if (side === 'bottom' && top + f.height > vh - 8 && a.top - f.height - offset > 8) top = a.top - f.height - offset;
      if (side === 'top' && top < 8) top = a.bottom + offset;
      left = align === 'start' ? a.left : align === 'end' ? a.right - f.width : a.left + a.width / 2 - f.width / 2;
    } else {
      top = a.top;
      left = side === 'right' ? a.right + offset : a.left - f.width - offset;
      if (top + f.height > vh - 8) top = Math.max(8, vh - 8 - f.height);
    }
    left = Math.max(8, Math.min(left, vw - f.width - 8));
    setPos({ top, left, width: matchWidth ? a.width : undefined });
  }, [anchor, placement, offset, matchWidth]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    compute();
  }, [open, compute]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => compute();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, compute]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onDown = (e: MouseEvent) => {
      if (!dismissOnOutside) return;
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchor, dismissOnOutside]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{
        position: 'fixed',
        zIndex,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: pos?.width,
        visibility: pos ? 'visible' : 'hidden',
        animation: 'rrPopIn .14s ease',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

/** Convenience hook: anchor element state + open flag. */
export function useAnchor<T extends HTMLElement = HTMLElement>() {
  const [anchor, setAnchor] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return { anchor, ref: setAnchor, open, setOpen, toggle: () => setOpen(o => !o), close: () => setOpen(false) };
}
