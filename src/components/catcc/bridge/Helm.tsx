/**
 * Bridge: steering (Nimitz steering-console compass, rudder gauge, course order) and engine order
 * (bells, ordered speed, sea room). Ported from carrier-ops-handoff-2/mockup/Bridge.dc.html, laid out
 * for the 344 px sidebar. Orders go to the room's shared plan as soon as they're given, and from there
 * to DCS when the hook takes orders. Wind over deck and PIM are in ./Nav.tsx.
 */
import { BELLS as DCS_BELLS, MAX_ASTERN_KT } from '../../../catcc/core/dcs/bells.ts';
import React, { useRef } from 'react';
import { rudderFor } from '../../../catcc/core/geometry/shipTurn.ts';
import { norm360 } from '../../../catcc/core/geo.ts';
import type { OrderStatus } from '../../../catcc/core/room/protocol.ts';
import type { Carrier } from '../scopeModel.ts';
import { OrderMark } from './Nav.tsx';
import { IcSteady, IcTurnHard, IcTurnSmall } from '../icons.tsx';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const D = Math.PI / 180;
const f2 = (n: number) => n.toFixed(2);
const P = (deg: number, r: number) => [r * Math.sin(deg * D), -r * Math.cos(deg * D)] as const;

const MONO = "'IBM Plex Mono', monospace";
/** the console's green seven-segment style readout */
const dig = (min: number, size: number): React.CSSProperties => ({
  display: 'inline-block',
  boxSizing: 'border-box',
  minWidth: min,
  padding: '2px 6px',
  borderRadius: 2,
  background: '#0B100C',
  border: '1px solid #3A4A3B',
  fontFamily: MONO,
  fontSize: size,
  fontWeight: 600,
  color: '#6FBF68',
  textAlign: 'center',
  letterSpacing: '.04em',
});
const CL2: React.CSSProperties = { fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '.1em', color: '#10151B' };
const BTN: React.CSSProperties = { height: 32, padding: '0 12px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' };
const title = (t: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <span className="lbl">{t}</span>
    {right}
  </div>
);

// ---------------------------------------------------------------- compass geometry (static)

/** heading card: graduations on its inside edge every 2°, long every 10° */
const CARD_TICKS = Array.from({ length: 180 }, (_, i) => {
  const a = i * 2;
  const [x0, y0] = P(a, 84);
  const [x1, y1] = P(a, a % 10 === 0 ? 91 : 86.45);
  return `M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}`;
}).join('');
const CARD_NUMS = Array.from({ length: 36 }, (_, i) => {
  const a = i * 10;
  const [x, y] = P(a, 95.2);
  return { a, x, y, t: String(a).padStart(3, '0') };
});
/** relative-bearing ring: graduations on its outside edge every 5°, long every 10°; 000 at the bow, 020–160 down each side */
const REL_TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = i * 5;
  const [x0, y0] = P(a, 74);
  const [x1, y1] = P(a, a % 10 === 0 ? 67 : 70);
  return `M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}`;
}).join('');
const REL_NUMS = Array.from({ length: 18 }, (_, i) => {
  const a = i * 20;
  const [x, y] = P(a, 61);
  return { a, x, y, t: String(a > 180 ? 360 - a : a).padStart(3, '0') };
});

/** rudder dial: ±40° over a 160° arc at the bottom, port on the left */
const RUD_PT = (a: number, r: number) => {
  const phi = (90 - a * 2) * D;
  return [r * Math.cos(phi), r * Math.sin(phi)] as const;
};
const RUD_ARC = (() => {
  const [x0, y0] = RUD_PT(-40, 86);
  const [x1, y1] = RUD_PT(40, 86);
  return `M${f2(x0)} ${f2(y0)}A86 86 0 0 0 ${f2(x1)} ${f2(y1)}`;
})();
const RUD_TICKS = Array.from({ length: 17 }, (_, i) => {
  const a = -40 + i * 5;
  const [x0, y0] = RUD_PT(a, 86);
  const [x1, y1] = RUD_PT(a, a % 10 === 0 ? 70 : 78);
  return `M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}`;
}).join('');
const RUD_NUMS = Array.from({ length: 9 }, (_, i) => {
  const a = -40 + i * 10;
  const [x, y] = RUD_PT(a, 60);
  return { x, y, t: String(Math.abs(a)) };
});

const RL = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : `${v < 0 ? 'L' : 'R'} ${Math.abs(v).toFixed(1)}`);

// DCS's Air Boss bells (astern speeds measured in DCS), shared with the room's ship orders
const BELLS: [string, number][] = DCS_BELLS.map((b) => [b.name, b.kt]);

// ---------------------------------------------------------------- panels

export const HelmPanel: React.FC<{
  carrier?: Carrier;
  ordered?: { crs: number; kt: number };
  onOrder: (h: { crs: number; kt: number }) => void;
  readOnly: boolean;
  /** the last order sent to DCS for the ship (helm or route) */
  dcsOrder?: OrderStatus;
  /** the ship is following the plotted route: the course order belongs to it */
  onRoute?: boolean;
  /** NM along the course to land or shoal water: null none within range, undefined no chart data */
  seaRoom?: number | null;
  /** the range sea room is searched over, NM */
  seaRoomMax?: number;
}> = ({ carrier, ordered, onOrder, readOnly, dcsOrder, onRoute, seaRoom, seaRoomMax = 100 }) => {
  const t = carrier?.track;
  const crs = t?.crs ?? t?.hdg ?? 0;
  const hdg = t?.hdg ?? crs;
  const sog = t?.gs ?? 0;
  // the order last sent: quick clicks build on it, not on the room's copy, which only arrives a moment later
  const sent = useRef<{ crs: number; kt: number; at: number } | null>(null);
  if (sent.current && (performance.now() - sent.current.at > 3000 || (ordered && ordered.crs === sent.current.crs && ordered.kt === sent.current.kt))) sent.current = null;
  const ord = sent.current ?? ordered ?? { crs: Math.round(crs), kt: Math.round(sog) };
  const order = (p: Partial<{ crs: number; kt: number }>) => {
    if (readOnly) return;
    const n = { ...ord, ...p };
    const h = { crs: Math.round(norm360(n.crs)) % 360, kt: Math.max(MAX_ASTERN_KT, Math.min(32, Math.round(n.kt))) };
    sent.current = { ...h, at: performance.now() };
    onOrder(h);
  };
  const err = ((((ord.crs - hdg) % 360) + 540) % 360) - 180;
  const rud = ordered ? rudderFor(err) : 0;
  const bell = BELLS.reduce((a, b) => (Math.abs(b[1] - ord.kt) < Math.abs(a[1] - ord.kt) ? b : a))[0];

  const big = (label: string, by: number, ch: React.ReactNode, w: number) => (
    <button disabled={readOnly} onClick={() => order({ crs: by === 0 ? Math.round(norm360(hdg)) : ord.crs + by })} aria-label={label} title={label} style={{ ...BTN, width: w, height: 38, padding: 0, display: 'grid', placeItems: 'center', lineHeight: 1, cursor: readOnly ? 'default' : 'pointer', opacity: readOnly ? 0.5 : 1 }}>
      {ch}
    </button>
  );

  return (
    <>
      <section className="pnl" aria-label="Steering">
        {title(
          'Steering',
          <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            {onRoute ? <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: '#7FD397' }}>ON ROUTE</span> : <OrderMark o={dcsOrder?.op === "helm" ? dcsOrder : undefined} />}
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{t?.hull ?? ''}</span>
          </span>,
        )}
        <div style={{ position: 'relative', width: '100%' }}>
          <svg viewBox="-104 -104 208 208" style={{ width: '100%', display: 'block' }} role="img" aria-label="Compass: outer card true heading, inner ring relative bearing, ordered course bug">
            <circle r="103" fill="#0A0E13" />
            <g transform={`rotate(${(-hdg).toFixed(1)})`}>
              <circle r="92" fill="none" stroke="#8A96A3" strokeWidth="16" />
              <path d={CARD_TICKS} stroke="#141A21" strokeWidth="0.9" fill="none" />
              <g style={{ fontFamily: MONO, fontSize: 6.4, fontWeight: 600, fill: '#10151B' }} textAnchor="middle">
                {CARD_NUMS.map((n) => (
                  <text key={n.a} x={f2(n.x)} y={f2(n.y)} dy="2.3" transform={`rotate(${n.a} ${f2(n.x)} ${f2(n.y)})`}>
                    {n.t}
                  </text>
                ))}
              </g>
              {/* ordered course bug on the card's outer edge */}
              {ordered && <path d="M0 -100 L-4.5 -104 L4.5 -104 Z" fill="#6FBF68" transform={`rotate(${ordered.crs})`} />}
            </g>
            <circle r="74" fill="#7B8794" />
            <path d={REL_TICKS} stroke="#141A21" strokeWidth="0.9" fill="none" />
            <g style={{ fontFamily: MONO, fontSize: 6.2, fontWeight: 600, fill: '#10151B' }} textAnchor="middle">
              {REL_NUMS.map((n) => (
                <text key={n.a} x={f2(n.x)} y={f2(n.y)} dy="2.3" transform={`rotate(${n.a} ${f2(n.x)} ${f2(n.y)})`}>
                  {n.t}
                </text>
              ))}
            </g>
            {/* lubber diamond */}
            <path d="M0 -75.5 L-3.6 -79.5 L0 -83.5 L3.6 -79.5 Z" fill="#E6EDF3" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '3px 4px', alignItems: 'center' }}>
              <span style={{ ...CL2, textAlign: 'right' }}>ORDER</span>
              <span style={dig(62, 16)}>{ordered ? r3(ordered.crs) : '---'}</span>
              <span style={CL2}>DEG</span>
              <span style={{ ...CL2, textAlign: 'right' }}>HEADING</span>
              <span style={dig(62, 16)}>{norm360(hdg).toFixed(1)}</span>
              <span style={CL2}>DEG</span>
              <span style={{ ...CL2, textAlign: 'right' }}>SPEED</span>
              <span style={dig(62, 16)}>{sog.toFixed(1)}</span>
              <span style={CL2}>KTS</span>
            </span>
          </div>
        </div>

        {/* rudder */}
        <svg viewBox="-100 -12 200 112" style={{ width: '70%', display: 'block', margin: '10px auto 0' }} role="img" aria-label={`Rudder ${RL(rud)}`}>
          <path d={RUD_ARC} fill="none" stroke="#93A1B0" strokeWidth="1" />
          <path d={RUD_TICKS} stroke="#93A1B0" strokeWidth="1" />
          <g style={{ fontFamily: MONO, fontSize: 9, fill: '#93A1B0' }} textAnchor="middle">
            {RUD_NUMS.map((n, i) => (
              <text key={i} x={f2(n.x)} y={f2(n.y)} dy="3">
                {n.t}
              </text>
            ))}
          </g>
          <text x="-70" y="-2" style={{ fontFamily: MONO, fill: '#93A1B0', fontSize: 8, letterSpacing: '.1em' }}>PORT</text>
          <text x="70" y="-2" textAnchor="end" style={{ fontFamily: MONO, fill: '#93A1B0', fontSize: 8, letterSpacing: '.1em' }}>STBD</text>
          <path d="M-5 0 L0 84 L5 0 Z" fill="rgba(95,208,104,.35)" stroke="#6FBF68" strokeWidth="1.5" transform={`rotate(${(-rud * 2).toFixed(1)})`} />
          <circle r="6" fill="#151A21" stroke="#C9D3DD" />
        </svg>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, textAlign: 'center', marginTop: 4 }}>
          <div>
            <div className="lbl" style={{ fontSize: 9 }}>RUDDER</div>
            <span style={dig(64, 14)}>{RL(rud)}</span>
          </div>
          <div>
            <div className="lbl" style={{ fontSize: 9 }}>HDG ERROR</div>
            <span style={dig(64, 14)}>{ordered ? RL(err) : '---'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {big('Order 10° left', -10, <IcTurnHard />, 50)}
          {big('Order 1° left', -1, <IcTurnSmall />, 50)}
          {/* rudder amidships: steady on the present heading, so the heading error and the rudder go to zero */}
          {big('Rudder amidships: steady on the present heading', 0, <IcSteady />, 50)}
          {big('Order 1° right', 1, <IcTurnSmall right />, 50)}
          {big('Order 10° right', 10, <IcTurnHard right />, 50)}
        </div>
        <div className="lbl" style={{ textAlign: 'center', marginTop: 4 }}>Order</div>
      </section>

      <section className="pnl" aria-label="Engine order">
        {title('Engine order')}
        <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {BELLS.map(([k, v]) => {
              const on = k === bell && !!ordered;
              const c = v > 0 ? '#5FD068' : v < 0 ? '#FF6B66' : '#E6EDF3';
              return (
                <button
                  key={k}
                  disabled={readOnly}
                  aria-pressed={on}
                  onClick={() => order({ kt: v })}
                  title={v < 0 ? `${-v} KT astern` : `${v} KT`}
                  style={{ height: 26, borderRadius: 3, border: `1px solid ${on ? c : '#374250'}`, background: on ? (v > 0 ? 'rgba(95,208,104,.28)' : v < 0 ? 'rgba(255,107,102,.25)' : '#2E3946') : 'transparent', color: c, fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', cursor: readOnly ? 'default' : 'pointer' }}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* astern reads as a speed and ASTERN, in red, not a minus sign */}
            <div className="lbl">Ordered speed</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button disabled={readOnly} onClick={() => order({ kt: ord.kt - 1 })} aria-label="Slower" style={{ ...BTN, width: 28, padding: 0 }}>
                −
              </button>
              <span style={{ ...dig(0, 16), flex: 1, whiteSpace: 'nowrap', ...(ordered && ordered.kt < 0 ? { color: '#FF6B66' } : {}) }}>{ordered ? `${Math.abs(ordered.kt)} KT` : '--'}</span>
              <button disabled={readOnly} onClick={() => order({ kt: ord.kt + 1 })} aria-label="Faster" style={{ ...BTN, width: 28, padding: 0 }}>
                +
              </button>
            </div>
            {/* its line is always kept, so going astern doesn't move what's below */}
            <div className="mono" aria-hidden={!(ordered && ordered.kt < 0)} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', color: '#FF6B66', textAlign: 'center', marginTop: -2, visibility: ordered && ordered.kt < 0 ? 'visible' : 'hidden' }}>
              ASTERN
            </div>
            <div className="lbl" style={{ marginTop: 6 }}>Speed over ground</div>
            <span style={dig(0, 16)}>{sog.toFixed(1)} KT</span>
            <div className="lbl" style={{ marginTop: 6 }} title="Along the present course to land or water too shallow for the ship (under 15 m)">
              Sea room ahead
            </div>
            {seaRoom === undefined ? (
              <span style={dig(0, 14)}>--</span>
            ) : seaRoom === null ? (
              <span style={{ ...dig(0, 14), whiteSpace: 'nowrap' }}>&gt; {seaRoomMax} NM</span>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ ...dig(0, 14), flex: 1, whiteSpace: 'nowrap', ...(seaRoom < 5 ? { color: '#E7B04F' } : {}) }}>{seaRoom.toFixed(1)} NM</span>
                <span style={{ ...dig(0, 14), whiteSpace: 'nowrap', ...(seaRoom < 5 ? { color: '#E7B04F' } : {}) }}>
                  {sog >= 1 ? (() => {
                    const m = Math.round((seaRoom / sog) * 60);
                    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
                  })() : '-:--'}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

    </>
  );
};
