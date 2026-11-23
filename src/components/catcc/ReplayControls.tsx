/**
 * A replay source's playback controls, after the feed indicator in the header (dev replays only: a live
 * DCS source has none). Rewind and fast forward run at 2x, then 4x and 8x with each further press; play
 * goes back to 1x forward; restart goes to the replay's start point; skip ahead jumps by the interval
 * set in its popover (the hand-off popover's shell), remembered per browser. The room shares the clock,
 * so every viewer's controls agree.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReplayCommand, ReplayState } from '../../catcc/core/dcs/hookProtocol.ts';
import { MAX_REPLAY_SKIP_S } from '../../catcc/core/room/protocol.ts';
import { rateLabel, replayTime, SKIP_PRESETS, skipLabel } from './replayLabels.ts';
import { IcChevron, IcFastForward, IcPause, IcPlay, IcRestart, IcRewind, IcSkipAhead } from './icons.tsx';

const SKIP_KEY = 'catcc.replaySkip';
const W = 180;

function loadSkip(): number {
  try {
    const n = Number(localStorage.getItem(SKIP_KEY));
    return Number.isInteger(n) && n >= 1 && n <= MAX_REPLAY_SKIP_S ? n : 60;
  } catch {
    return 60;
  }
}

export const ReplayControls: React.FC<{
  replay: ReplayState;
  /** the latest frame's time (the replay's position) */
  mt: number;
  onCmd: (cmd: ReplayCommand, s?: number) => void;
  /** the header's button style */
  btn: (on: boolean) => React.CSSProperties;
}> = ({ replay, mt, onCmd, btn }) => {
  const [skip, setSkipState] = useState(loadSkip);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState('');
  const bRef = useRef<HTMLButtonElement>(null);
  const pRef = useRef<HTMLElement>(null);
  const setSkip = (s: number) => {
    setSkipState(s);
    try {
      localStorage.setItem(SKIP_KEY, String(s));
    } catch {
      /* private mode */
    }
  };

  // fixed to the viewport under the button (the header scrolls sideways); above it when it won't fit below
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

  const { playing, rate } = replay;
  // pause only while playing at 1x; away from 1x (or paused) the button plays at 1x
  const pauses = playing && rate === 1;
  const host = bRef.current?.closest('.cc-root') ?? document.body;
  const custom = Number(draft);
  const customOk = draft !== '' && Number.isInteger(custom) && custom >= 1 && custom <= MAX_REPLAY_SKIP_S;

  return (
    <div role="toolbar" aria-label="Replay" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button aria-label="Rewind" title="Rewind" onClick={() => onCmd('rew')} style={btn(playing && rate < 0)}>
        <IcRewind />
      </button>
      <button aria-label={pauses ? 'Pause' : 'Play'} title={pauses ? 'Pause' : 'Play'} onClick={() => onCmd(pauses ? 'pause' : 'play')} style={btn(false)}>
        {pauses ? <IcPause /> : <IcPlay />}
      </button>
      <button aria-label="Fast forward" title="Fast forward" onClick={() => onCmd('ff')} style={btn(playing && rate > 1)}>
        <IcFastForward />
      </button>
      <button aria-label="Restart" title="Restart" onClick={() => onCmd('restart')} style={btn(false)}>
        <IcRestart />
      </button>
      <button aria-label="Skip ahead" title="Skip ahead" onClick={() => onCmd('skip', skip)} style={btn(false)}>
        <IcSkipAhead />
      </button>
      <button
        ref={bRef}
        aria-label="Skip interval"
        aria-haspopup="true"
        aria-expanded={open}
        title="Skip interval"
        onClick={() => {
          setOpen((o) => !o);
          setPos(null);
          setDraft('');
        }}
        style={btn(open)}
      >
        {skipLabel(skip)}
        <IcChevron />
      </button>
      <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0' }}>
        {replayTime(mt)}
        {playing && rate !== 1 && <span style={{ marginLeft: 6, color: '#E6EDF3', fontWeight: 600 }}>{rateLabel(rate)}</span>}
      </span>
      {open &&
        createPortal(
          <section
            ref={pRef}
            aria-label="Skip interval"
            style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', zIndex: 40, width: W, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}
          >
            <span className="lbl">Skip ahead</span>
            <div style={{ marginTop: 6 }}>
              {SKIP_PRESETS.map((s) => (
                <button
                  key={s}
                  className="hrow"
                  aria-pressed={skip === s}
                  onClick={() => {
                    setSkip(s);
                    setOpen(false);
                  }}
                  style={skip === s ? { background: '#222C37', fontWeight: 600 } : undefined}
                >
                  {skipLabel(s)}
                </button>
              ))}
            </div>
            <form
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!customOk) return;
                setSkip(custom);
                setOpen(false);
              }}
            >
              <label className="lbl" htmlFor="cc-skip-s">Seconds</label>
              <input
                id="cc-skip-s"
                type="number"
                min={1}
                max={MAX_REPLAY_SKIP_S}
                step={1}
                value={draft}
                placeholder={String(skip)}
                onChange={(e) => setDraft(e.target.value)}
                style={{ width: 0, flex: 1, background: '#0E1116', color: '#E6EDF3', border: `1px solid ${draft && !customOk ? '#E0524E' : '#374250'}`, borderRadius: 4, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}
              />
            </form>
          </section>,
          host,
        )}
    </div>
  );
};
