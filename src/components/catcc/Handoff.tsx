/**
 * Owner chip and handoff controls for one flight, shared by the radar strips, the Approach/Final
 * sequence and PriFly. The owner offers the flight from the hand-off popover (every carrier's seats,
 * grouped by carrier); the receiving seat accepts; the sender can recall until then.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SeatKey, SeatRole } from '../../catcc/core/room/protocol.ts';
import { carrierByHull } from '../../catcc/core/tracks/naming.ts';
import { IcHand } from './icons.tsx';
import { handoffGroups, handoffState, nextRole, OWNER_LABEL, seatLabel, type HandoffCtx, type OwnerView } from './ownership.ts';

const chip = (seat: SeatKey, me: SeatKey, mine: boolean) => (
  <span
    className="mono"
    title={mine ? 'Yours' : `Owned by ${seatLabel(seat, me)}`}
    style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', padding: '1px 6px', borderRadius: 3, border: `1px solid ${mine ? '#93A1B0' : '#374250'}`, color: mine ? '#E6EDF3' : '#93A1B0', background: 'transparent', whiteSpace: 'nowrap' }}
  >
    {seatLabel(seat, me)}
  </span>
);

const tone = (amber: boolean) => ({ border: `1px solid ${amber ? '#E7B04F' : '#374250'}`, background: amber ? 'rgba(231,176,79,.12)' : 'transparent', color: amber ? '#E7B04F' : '#E6EDF3' });

const btn = (label: string, onClick: () => void, t: 'amber' | 'plain' = 'plain', title?: string) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={title}
    style={{ height: 22, padding: '0 8px', borderRadius: 4, ...tone(t === 'amber'), fontFamily: "'Saira', sans-serif", fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
  >
    {label}
  </button>
);

const W = 230;
/** how long a strip says its flight was taken from this seat */
const TAKEN_MS = 120_000;

const HandoffMenu: React.FC<{ v: OwnerView; ctx: HandoffCtx; nxt: SeatRole | null; mine: boolean }> = ({ v, ctx, nxt, mine }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bRef = useRef<HTMLButtonElement>(null);
  const pRef = useRef<HTMLElement>(null);

  // fixed to the viewport beside the button, so scrolling sidebars don't clip it; flipped above when it won't fit below
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
    // the popover is placed once: a scroll outside it (the strip moving) closes it
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

  // only the owner hands a flight on; any other seat may assume control of it
  const groups = open && mine ? handoffGroups(v, ctx, nxt) : [];
  const host = bRef.current?.closest('.cc-root') ?? document.body;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      <button
        ref={bRef}
        aria-label={mine ? 'Hand off' : 'Assume control'}
        aria-haspopup="menu"
        aria-expanded={open}
        title={mine ? 'Hand off' : 'Assume control'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          setPos(null);
        }}
        style={{ width: 22, height: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, ...tone(mine && !!v.due), ...(open ? { background: '#3D2521' } : {}), cursor: 'pointer', flex: '0 0 22px' }}
      >
        <IcHand />
      </button>
      {open &&
        createPortal(
          <section
            ref={pRef}
            role="menu"
            aria-label={mine ? 'Hand off' : 'Assume control'}
            onClick={stop}
            onMouseDown={stop}
            onPointerDown={stop}
            onDoubleClick={stop}
            onContextMenu={stop}
            style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', zIndex: 40, width: W, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}
          >
            <span className="lbl">{mine ? 'Hand off' : 'Control of'} {v.key}</span>
            {!mine && (
              <button
                role="menuitem"
                className="hrow"
                style={{ marginTop: 8, ...tone(false), background: '#222C37' }}
                onClick={() => {
                  setOpen(false);
                  ctx.onAssume(v.key, v.owner);
                }}
              >
                <span style={{ fontWeight: 600 }}>Assume Control</span>
                <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>from {seatLabel(v.owner, ctx.me)}</span>
              </button>
            )}
            {groups.map((g) => (
              <React.Fragment key={g.hull}>
                <div className="lbl" style={{ fontSize: 9.5, color: '#6B7683', margin: '8px 0 2px 2px' }}>
                  {g.hull}
                  {carrierByHull(g.hull) ? ` · ${carrierByHull(g.hull)!.nick}` : ''}
                </div>
                {g.seats.map((s) => {
                  const hi = g.hull === v.owner.carrier && s.role === nxt;
                  return (
                    <button
                      key={s.role}
                      role="menuitem"
                      className="hrow"
                      onClick={() => {
                        setOpen(false);
                        ctx.onHandoff(v.key, v.owner, { carrier: g.hull, role: s.role });
                      }}
                      style={hi ? { ...tone(!!v.due), ...(v.due ? {} : { background: '#222C37' }) } : undefined}
                    >
                      <span style={{ fontWeight: 600, minWidth: 64 }}>{OWNER_LABEL[s.role]}</span>
                      <span style={{ color: hi && v.due ? '#E7B04F' : '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </section>,
          host,
        )}
    </>
  );
};

/** One row: owner chip, then the handoff state with its action. */
export const HandoffRow: React.FC<{ v: OwnerView; ctx: HandoffCtx; compact?: boolean }> = ({ v, ctx, compact }) => {
  const st = handoffState(v, ctx);
  // a due handoff targets the seat the chain says; otherwise the next seat along it
  const nxt = v.due ?? nextRole(v.owner.role, ctx.layout);
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: compact ? 0 : '4px 2px 0', minHeight: 22, flexWrap: 'wrap' }}>
      {chip(v.owner, ctx.me, st.mine)}
      {v.pending ? (
        st.incoming ? (
          <>
            <span className="mono" style={{ fontSize: 11, color: '#E7B04F', fontWeight: 600 }}>HANDOFF ← {seatLabel(v.owner, ctx.me)}</span>
            <span style={{ flex: 1 }} />
            {btn('Accept', () => ctx.onAccept(v.key), 'amber', `Take ${v.key} from ${seatLabel(v.owner, ctx.me)}`)}
          </>
        ) : st.outgoing ? (
          <>
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>HANDOFF → {seatLabel(v.pending.to, ctx.me)} · PENDING</span>
            <span style={{ flex: 1 }} />
            {btn('Recall', () => ctx.onHandoff(v.key, v.owner, null), 'plain', 'Take the handoff back')}
          </>
        ) : (
          <>
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>
              → {seatLabel(v.pending.to, ctx.me)} · PENDING
            </span>
            {st.canAssume && (
              <>
                <span style={{ flex: 1 }} />
                <HandoffMenu v={v} ctx={ctx} nxt={nxt} mine={false} />
              </>
            )}
          </>
        )
      ) : st.mine || st.canAssume ? (
        <>
          {/* taken from this seat in the last two minutes: said on the strip too (Approach / Final has no notifications) */}
          {st.lost && v.took && Date.now() - v.took.at < TAKEN_MS && <span className="mono" style={{ fontSize: 11, color: '#E7B04F', fontWeight: 600 }}>TAKEN</span>}
          <span style={{ flex: 1 }} />
          {st.lost && v.took && Date.now() - v.took.at < TAKEN_MS && btn('Reclaim', () => ctx.onAssume(v.key, v.owner), 'amber', `Take ${v.key} back from ${seatLabel(v.owner, ctx.me)}`)}
          <HandoffMenu v={v} ctx={ctx} nxt={nxt} mine={st.mine} />
        </>
      ) : null}
    </div>
  );
};
