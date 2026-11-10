/**
 * Bridge: steering (Nimitz steering-console compass, rudder gauge, course order), engine order
 * (bells, ordered speed), wind over deck (components, gauges, best recovery) and PIM. Ported from
 * carrier-ops-handoff-2/mockup/Bridge.dc.html, laid out for the 344 px sidebar. Orders go to the
 * room's shared plan as soon as they're given.
 */
import React from 'react';
import { distanceNm, norm360 } from '../../../catcc/core/geo.ts';
import { nextPimTurn, pimAt } from '../../../catcc/core/env/weather.ts';
import { bestRecovery, deckWind } from '../../../catcc/core/env/wod.ts';
import type { RoutePoint } from '../../../catcc/core/dcs/hookProtocol.ts';
import type { Carrier } from '../scopeModel.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const KT_PER_MS = 1 / 0.514444;
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
const CL2: React.CSSProperties = { fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '.1em', color: '#1E1B18' };
const BTN: React.CSSProperties = { height: 32, padding: '0 12px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' };
const kv = (k: string, v: React.ReactNode, c = '#E6EDF3') => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: MONO, fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: '#93A1B0' }}>{k}</span>
    <span style={{ color: c }}>{v}</span>
  </div>
);
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

/** rudder order from the heading error (the ship's autopilot, roughly) */
const rudderFor = (err: number) => Math.max(-30, Math.min(30, err * 0.9));
const RL = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : `${v < 0 ? 'L' : 'R'} ${Math.abs(v).toFixed(1)}`);

const BELLS: [string, number][] = [
  ['AHEAD FLANK', 30],
  ['AHEAD FULL', 22],
  ['AHEAD STANDARD', 15],
  ['AHEAD 2/3', 10],
  ['AHEAD 1/3', 5],
  ['STOP', 0],
  ['BACK 1/3', -5],
  ['BACK 2/3', -10],
  ['BACK FULL', -15],
];

// ---------------------------------------------------------------- panels

export const HelmPanel: React.FC<{
  carrier?: Carrier;
  ordered?: { crs: number; kt: number };
  onOrder: (h: { crs: number; kt: number }) => void;
  readOnly: boolean;
  route?: RoutePoint[];
  nowS: number;
  dayStart?: number;
}> = ({ carrier, ordered, onOrder, readOnly, route, nowS, dayStart }) => {
  const t = carrier?.track;
  const crs = t?.crs ?? t?.hdg ?? 0;
  const hdg = t?.hdg ?? crs;
  const sog = t?.gs ?? 0;
  const ord = ordered ?? { crs: Math.round(crs), kt: Math.round(sog) };
  const order = (p: Partial<{ crs: number; kt: number }>) => {
    if (readOnly) return;
    const n = { ...ord, ...p };
    onOrder({ crs: Math.round(norm360(n.crs)) % 360, kt: Math.max(-15, Math.min(32, Math.round(n.kt))) });
  };
  const err = ((((ord.crs - hdg) % 360) + 540) % 360) - 180;
  const rud = ordered ? rudderFor(err) : 0;
  const bell = BELLS.reduce((a, b) => (Math.abs(b[1] - ord.kt) < Math.abs(a[1] - ord.kt) ? b : a))[0];

  // wind over deck
  const wx = t?.wx;
  const hasWind = wx?.d0 != null && wx.s0 != null;
  const dw = hasWind ? deckWind(crs, sog, wx!.d0!, wx!.s0!) : null;
  const best = hasWind ? bestRecovery(wx!.d0!, wx!.s0!) : null;

  // PIM
  const pim = route && t ? pimAt(route, nowS) : null;
  const pimNm = pim && t ? distanceNm(t.lat, t.lon, pim.lat, pim.lon) : null;
  const turn = route ? nextPimTurn(route, nowS) : null;
  const hhmm = (s: number) => {
    const x = ((((dayStart ?? 0) + s) % 86400) + 86400) % 86400;
    return `${String(Math.floor(x / 3600)).padStart(2, '0')}:${String(Math.floor(x / 60) % 60).padStart(2, '0')}`;
  };

  const big = (label: string, by: number, ch: string, w: number) => (
    <button disabled={readOnly} onClick={() => order({ crs: ord.crs + by })} aria-label={label} style={{ ...BTN, width: w, height: 38, padding: 0, fontSize: 22, lineHeight: 1, cursor: readOnly ? 'default' : 'pointer', opacity: readOnly ? 0.5 : 1 }}>
      {ch}
    </button>
  );

  return (
    <>
      <section className="pnl" aria-label="Steering">
        {title('Steering', <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{t?.hull ?? ''}</span>)}
        <div style={{ position: 'relative', width: '100%' }}>
          <svg viewBox="-104 -104 208 208" style={{ width: '100%', display: 'block' }} role="img" aria-label="Compass: outer card true heading, inner ring relative bearing, ordered course bug">
            <circle r="103" fill="#0A0B0C" />
            <g transform={`rotate(${(-hdg).toFixed(1)})`}>
              <circle r="92" fill="none" stroke="#8F897E" strokeWidth="16" />
              <path d={CARD_TICKS} stroke="#24201C" strokeWidth="0.9" fill="none" />
              <g style={{ fontFamily: MONO, fontSize: 6.4, fontWeight: 600, fill: '#1E1B18' }} textAnchor="middle">
                {CARD_NUMS.map((n) => (
                  <text key={n.a} x={f2(n.x)} y={f2(n.y)} dy="2.3" transform={`rotate(${n.a} ${f2(n.x)} ${f2(n.y)})`}>
                    {n.t}
                  </text>
                ))}
              </g>
              {/* ordered course bug on the card's outer edge */}
              {ordered && <path d="M0 -100 L-4.5 -104 L4.5 -104 Z" fill="#6FBF68" transform={`rotate(${ordered.crs})`} />}
            </g>
            <circle r="74" fill="#87817A" />
            <path d={REL_TICKS} stroke="#24201C" strokeWidth="0.9" fill="none" />
            <g style={{ fontFamily: MONO, fontSize: 6.2, fontWeight: 600, fill: '#1E1B18' }} textAnchor="middle">
              {REL_NUMS.map((n) => (
                <text key={n.a} x={f2(n.x)} y={f2(n.y)} dy="2.3" transform={`rotate(${n.a} ${f2(n.x)} ${f2(n.y)})`}>
                  {n.t}
                </text>
              ))}
            </g>
            {/* lubber diamond */}
            <path d="M0 -75.5 L-3.6 -79.5 L0 -83.5 L3.6 -79.5 Z" fill="#D8D2C6" />
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
          <path d={RUD_ARC} fill="none" stroke="#A39C90" strokeWidth="1" />
          <path d={RUD_TICKS} stroke="#A39C90" strokeWidth="1" />
          <g style={{ fontFamily: MONO, fontSize: 9, fill: '#A39C90' }} textAnchor="middle">
            {RUD_NUMS.map((n, i) => (
              <text key={i} x={f2(n.x)} y={f2(n.y)} dy="3">
                {n.t}
              </text>
            ))}
          </g>
          <text x="-70" y="-2" style={{ fontFamily: MONO, fill: '#93A1B0', fontSize: 8, letterSpacing: '.1em' }}>PORT</text>
          <text x="70" y="-2" textAnchor="end" style={{ fontFamily: MONO, fill: '#93A1B0', fontSize: 8, letterSpacing: '.1em' }}>STBD</text>
          <path d="M-5 0 L0 84 L5 0 Z" fill="rgba(176,160,70,.7)" stroke="#6FBF68" strokeWidth="1.5" transform={`rotate(${(-rud * 2).toFixed(1)})`} />
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
          {big('Order 10° left', -10, '«', 50)}
          {big('Order 1° left', -1, '−', 46)}
          <span className="lbl">Order</span>
          {big('Order 1° right', 1, '+', 46)}
          {big('Order 10° right', 10, '»', 50)}
        </div>
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
                  title={`${v} KT`}
                  style={{ height: 26, borderRadius: 3, border: `1px solid ${on ? c : '#374250'}`, background: on ? (v > 0 ? 'rgba(95,208,104,.28)' : v < 0 ? 'rgba(255,107,102,.25)' : '#2E3946') : 'transparent', color: c, fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', cursor: readOnly ? 'default' : 'pointer' }}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lbl">Ordered speed</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button disabled={readOnly} onClick={() => order({ kt: ord.kt - 1 })} aria-label="Slower" style={{ ...BTN, width: 28, padding: 0 }}>
                −
              </button>
              <span style={{ ...dig(0, 16), flex: 1 }}>{ordered ? `${ordered.kt} KT` : '--'}</span>
              <button disabled={readOnly} onClick={() => order({ kt: ord.kt + 1 })} aria-label="Faster" style={{ ...BTN, width: 28, padding: 0 }}>
                +
              </button>
            </div>
            <div className="lbl" style={{ marginTop: 6 }}>Speed over ground</div>
            <span style={dig(0, 16)}>{sog.toFixed(1)} KT</span>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: '#6B7683', marginTop: 8 }}>Orders are shared with the room; the DCS hook doesn't steer the ship yet.</div>
      </section>

      <section className="pnl" aria-label="Wind over deck">
        {title('Wind over deck', dw && <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: dw.inLimits ? '#7FD397' : '#E7B04F' }}>{dw.inLimits ? 'IN LIMITS' : 'OUT OF LIMITS'}</span>)}
        {dw && hasWind ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8, textAlign: 'center' }}>
              {[
                ['TRUE WIND', `${r3(wx!.d0!)}`],
                ['TRUE KT', `${Math.round(wx!.s0! * KT_PER_MS)}`],
                ['DOWN ANGLE', `${Math.round(dw.along)}`],
                ['CROSS', `${Math.abs(dw.cross) < 0.5 ? '0' : `${Math.round(Math.abs(dw.cross))} ${dw.cross > 0 ? 'R' : 'L'}`}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="lbl" style={{ fontSize: 8.5, whiteSpace: 'nowrap' }}>{k}</div>
                  <span style={dig(0, 13)}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
              {[
                ['Down-angle wind', '0', '40', -90 + (Math.max(0, Math.min(40, dw.along)) / 40) * 180],
                ['Cross-deck wind', '15 L', '15 R', (Math.max(-15, Math.min(15, dw.cross)) / 15) * 90],
              ].map(([k, l, r, rot]) => (
                <div key={k as string} style={{ textAlign: 'center' }}>
                  <svg viewBox="-60 -56 120 66" style={{ width: '100%', maxWidth: 150 }} aria-hidden="true">
                    <path d="M-48 0 A48 48 0 0 1 48 0" fill="none" stroke="#C9D3DD" strokeWidth="3" />
                    <path d="M-48 0 L-40 0 M48 0 L40 0 M0 -48 L0 -40 M-34 -34 L-28.3 -28.3 M34 -34 L28.3 -28.3" stroke="#C9D3DD" strokeWidth="1.5" />
                    <text x="-50" y="9" textAnchor="middle" style={{ fill: '#93A1B0', fontFamily: MONO, fontSize: 8 }}>{l}</text>
                    <text x="50" y="9" textAnchor="middle" style={{ fill: '#93A1B0', fontFamily: MONO, fontSize: 8 }}>{r}</text>
                    <path d="M-3 0 L0 -44 L3 0 Z" fill="#5FD068" transform={`rotate(${(rot as number).toFixed(1)})`} />
                  </svg>
                  <div className="lbl" style={{ marginTop: 4, fontSize: 10 }}>{k}</div>
                </div>
              ))}
            </div>
            {best && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>
                  Best recovery{' '}
                  <b style={{ color: '#E6EDF3' }}>
                    {r3(best.crs)}° / {best.kt} KT
                  </b>
                </span>
                <button disabled={readOnly} onClick={() => order({ crs: best.crs, kt: best.kt })} style={{ ...BTN, height: 28, cursor: readOnly ? 'default' : 'pointer' }}>
                  Set
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No wind data</div>
        )}
      </section>

      <section className="pnl" aria-label="PIM">
        {title('PIM')}
        {pim ? (
          <>
            {kv('From PIM', pimNm != null ? `${pimNm.toFixed(1)} NM` : '—', pimNm != null && pimNm > 5 ? '#E7B04F' : '#E6EDF3')}
            {pim.crs != null && kv('PIM course', `${r3(pim.crs)}°`)}
            {turn && kv('Next turn', `${r3(turn.brc)}° at ${hhmm(turn.etaS)}`)}
          </>
        ) : (
          <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No planned route</div>
        )}
      </section>
    </>
  );
};
