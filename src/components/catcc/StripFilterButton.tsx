/**
 * A strip list's filter button and its popover (the hand-off popover's shell, the layers panel's rows):
 * AI aircraft, Other agencies, CVW only (stripFilter.ts). Lit while the list's filter isn't the default.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IcFilter } from './icons.tsx';
import { isDefaultFilter, STRIP_FILTER_ITEMS, type StripFilter } from './stripFilter.ts';

const W = 220;
const ON = '#C9D3DD';

export const StripFilterButton: React.FC<{ value: StripFilter; onToggle: (k: keyof StripFilter) => void; label?: string }> = ({ value, onToggle, label = 'Filter strips' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bRef = useRef<HTMLButtonElement>(null);
  const pRef = useRef<HTMLElement>(null);
  const lit = !isDefaultFilter(value);

  // fixed to the viewport under the button, so scrolling sidebars don't clip it; above it when it won't fit below
  useLayoutEffect(() => {
    if (!open || !bRef.current) return;
    const r = bRef.current.getBoundingClientRect();
    const h = pRef.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - 4 - h) : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && (!!pRef.current?.contains(t) || !!bRef.current?.contains(t));
    const down = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    const scroll = (e: Event) => !inside(e.target) && setOpen(false);
    const resize = () => setOpen(false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  const host = bRef.current?.closest('.cc-root') ?? document.body;
  return (
    <>
      <button
        ref={bRef}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title="Filter"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          setPos(null);
        }}
        style={{ width: 22, height: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: `1px solid ${lit ? '#F15822' : '#374250'}`, background: open ? '#3D2521' : lit ? 'rgba(241,88,34,.16)' : 'transparent', color: open || lit ? '#FFB08F' : '#E6EDF3', cursor: 'pointer', flex: '0 0 22px' }}
      >
        <IcFilter />
      </button>
      {open &&
        createPortal(
          <section
            ref={pRef}
            aria-label="Filter"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', zIndex: 40, width: W, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}
          >
            <span className="lbl">Filter</span>
            <div style={{ marginTop: 6 }}>
              {STRIP_FILTER_ITEMS.map(([k, l]) => (
                <div key={k} className="lrow" style={{ gridTemplateColumns: 'minmax(0, 1fr) 52px', color: value[k] ? '#E6EDF3' : '#93A1B0' }}>
                  <span style={{ paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
                  <button className="lcb" onClick={() => onToggle(k)} aria-pressed={value[k]} aria-label={l}>
                    <span style={{ borderColor: ON, background: value[k] ? ON : 'transparent' }} />
                  </button>
                </div>
              ))}
            </div>
          </section>,
          host,
        )}
    </>
  );
};
