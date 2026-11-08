/** PriFly LSO station, ported from catcc-handoff/mockup/LSO.dc.html, driven by live tracks. */
import React, { useMemo, useRef, useState } from 'react';
import { dir, type Pt } from '../../../catcc/core/geometry/vec.ts';
import { norm360 } from '../../../catcc/core/geo.ts';
import type { Assignment } from '../../../catcc/core/room/protocol.ts';
import { fuelK, type Picture, type ScopeTrack } from '../scopeModel.ts';
import { hornetIcon } from './deck.ts';

const HORNET = hornetIcon(30);
/** the scope's carrier outline (track point = landing area at the origin, bow up), ~36 px long */
const SHIP = (() => {
  const q = [[0.287, -1.4], [0.06, -1.4], [-0.011, -0.703], [-0.178, -0.488], [-0.166, 1.06], [-0.029, 1.102], [0.001, 1.4], [0.316, 1.4], [0.465, 1.013], [0.477, -0.429], [0.328, -0.727]];
  return 'M' + q.map(([x, y]) => `${(x * 13).toFixed(2)} ${(y * 13).toFixed(2)}`).join('L') + 'Z';
})();
const SUPPORT = /tanker|^KC|E-2|E-3|H-60|SH-60|UH-60|CH-47/i;

/** DCS callsign "CHARGER 3-1" → "Charger-3-1" as on the DCS LSO board. */
const boardCs = (t: ScopeTrack) => {
  const m = /^([A-Z ]+?)\s*(\d+)-(\d+)$/.exec(t.cs ?? '');
  if (!m) return t.pi ?? t.id;
  const name = m[1].trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return `${name}-${m[2]}-${m[3]}`;
};

/** Distance along the final bearing astern of the ship (+) and lateral offset to port (+), NM. */
function patternPos(t: ScopeTrack, fb: number): { s: number; l: number } {
  const rec = dir(fb + 180);
  const port = dir(fb - 90);
  return { s: t.p[0] * rec[0] + t.p[1] * rec[1], l: t.p[0] * port[0] + t.p[1] * port[1] };
}
/** Pattern-view y for a distance astern (mockup marks: 2 NM 215, 4 NM 262, 6 NM 300). */
function yOf(s: number): number {
  const k: Pt[] = [[-4, 70], [0, 128], [2, 215], [4, 262], [6, 300], [8, 352]];
  // beyond the end marks the end segments continue (no clamping, so a wide bolter keeps moving)
  let i = 1;
  while (i < k.length - 1 && s > k[i][0]) i++;
  return k[i - 1][1] + ((s - k[i - 1][0]) / (k[i][0] - k[i - 1][0])) * (k[i][1] - k[i - 1][1]);
}

/** Pattern-view x for a lateral offset to port (NM): final at 110, a ~1.2 NM downwind at the drawn leg (20). */
const X_PER_NM = 75;
const xOf = (l: number): number => 110 - l * X_PER_NM;
/** the pattern view's frame (viewBox): ~2 NM to port, ~1.3 NM to starboard, ~10 NM ahead to ~9.5 NM astern */
const VIEW = { x0: -45, y0: -20, w: 255, h: 410 };

/**
 * Screen rotation (deg, clockwise from up) of an aircraft at distance s astern flying heading hdg,
 * in the pattern view's stretched axes: up = toward the ship along the final bearing, left = port.
 */
function screenHeading(s: number, hdg: number, fb: number): number {
  const d = ((hdg - fb) * Math.PI) / 180;
  const dyds = (yOf(s + 0.05) - yOf(s - 0.05)) / 0.1; // px per NM astern, local
  // ds/dt = -cos d (toward the ship), dl/dt = -sin d (right of the final course is starboard)
  const dx = X_PER_NM * Math.sin(d);
  const dy = -dyds * Math.cos(d);
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export const LsoView: React.FC<{ pic: Picture; mt: number; assignments: Map<string, Assignment>; offH?: number }> = ({ pic, mt, assignments, offH }) => {
  const [ac, setAc] = useState(true);
  const [grade, setGrade] = useState('OK2');
  const [wire, setWire] = useState('—');
  const [pos, setPos] = useState('IC');
  const [devs, setDevs] = useState<string[]>([]);
  const fuelHist = useRef(new Map<string, { t: number; lb: number }[]>());
  const focus = pic.focus;
  const hull = focus?.track.hull;
  const fb = focus?.ship.fb ?? 0;

  // fuel burn → endurance
  useMemo(() => {
    for (const t of pic.air) {
      if (t.lb === undefined) continue;
      const h = fuelHist.current.get(t.id) ?? [];
      if (!h.length || h[h.length - 1].t < mt) h.push({ t: mt, lb: t.lb });
      while (h.length > 2 && h[0].t < mt - 180) h.shift();
      fuelHist.current.set(t.id, h);
    }
  }, [pic.air, mt]);
  const endurance = (t: ScopeTrack) => {
    const h = fuelHist.current.get(t.id);
    if (!h || h.length < 2 || t.lb === undefined) return null;
    const dt = h[h.length - 1].t - h[0].t;
    const burn = h[0].lb - h[h.length - 1].lb;
    if (dt < 30 || burn <= 0) return null;
    return Math.round(t.lb / ((burn / dt) * 60));
  };

  const recovering = pic.air
    .filter((t) => t.owner === hull && !SUPPORT.test(t.ty) && t.air !== false)
    .filter((t) => assignments.has(t.id) || (t.rng < 25 && t.alt < 12000))
    .sort((a, b) => a.rng - b.rng);
  const rows = Array.from({ length: 22 }, (_, k) => {
    const t = recovering[k];
    if (!t) return { side: '', cs: '', st: '', bg: 'transparent' };
    const e = endurance(t);
    return { side: t.bd ?? '', cs: boardCs(t), st: t.lb !== undefined ? `${fuelK(t.lb)}/${e ?? '—'}` : '', bg: k === 0 ? 'rgba(184,204,92,.14)' : 'transparent' };
  });

  const pattern = recovering
    .map((t) => ({ t, ...patternPos(t, fb) }))
    .filter(({ s, l }) => s > -11 && s < 10 && Math.abs(l) < 3);
  const onFinal = pattern.filter(({ t, l, s }) => Math.abs(l) < 0.7 && s > 0 && Math.abs(((t.crs ?? t.hdg ?? 0) - fb + 540) % 360 - 180) < 40).sort((a, b) => a.s - b.s);
  const current = onFinal[0];
  const posL = ['X', 'IM', 'IC', 'AR', 'IW'];
  const faultL = ['HI', 'LO', 'F', 'SLO', 'LUL', 'LUR', 'DL', 'DR', 'TMP', 'NEP', 'CD', 'EG', 'LIG'];
  const G: [string, string, string, boolean][] = [['OK', 'OK', 'Perfect pass', true], ['OK2', 'OK', 'Reasonable deviations, good corrections', false], ['FAIR', '(OK)', 'Fair: reasonable deviations', false], ['NG', '—', 'No grade: below average but safe', false], ['C', 'C', 'Cut: unsafe', false], ['WO', 'WO', 'Waveoff', false], ['OWO', 'OWO', 'Own waveoff', false], ['B', 'B', 'Bolter', false]];
  const gradeCol: Record<string, string> = { OK: '#40A85B', OK2: '#40A85B', FAIR: '#DE9A1F', NG: '#93A1B0', C: '#E0524E', WO: '#E0524E', OWO: '#3E9BD4', B: '#3E9BD4' };
  const gLabel = (G.find((g) => g[0] === grade) ?? G[1])[1];
  const comment = `${gLabel}  ${devs.join('  ')}${wire !== '—' ? `  #${wire}` : ''}`;
  const nextIn = recovering.filter((t) => t !== current?.t).slice(0, 3);

  return (
    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 14, padding: 14, overflow: 'auto', minHeight: 0 }}>
      <section aria-label="LSO arrivals board" style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="lbl">Arrivals board · replica</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setAc(!ac)} aria-pressed={ac} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, cursor: 'pointer' }}>
            <span style={{ width: 26, height: 14, borderRadius: 7, background: ac ? '#B8CC5C' : '#374250', position: 'relative', display: 'inline-block' }}>
              <span style={{ position: 'absolute', top: 2, left: ac ? 14 : 2, width: 10, height: 10, borderRadius: '50%', background: '#0E1116' }} />
            </span>
            Live aircraft on pattern
          </button>
        </div>
        <div style={{ flex: 1, background: '#050607', border: '10px solid #1B1F24', borderRadius: 12, padding: 20, display: 'flex', gap: 24, minHeight: 560, boxShadow: 'inset 0 0 0 1px #2A3038' }}>
          <div style={{ flex: '3 1 520px', minWidth: 0, overflowX: 'auto' }}>
            <div role="table" aria-label="Arrivals" style={{ minWidth: 560, borderLeft: '1px solid #B8CC5C', borderRight: '1px solid #B8CC5C', borderBottom: '1px solid #B8CC5C' }}>
              <div style={{ height: 18, background: '#B8CC5C' }} />
              {rows.map((r, k) => (
                <div key={k} role="row" style={{ display: 'grid', gridTemplateColumns: '7.3fr 17.2fr 7.9fr 9.3fr 5.3fr 7.9fr 2.6fr 42.4fr', height: 22, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, color: '#B8CC5C', background: r.bg }}>
                  <span role="cell" style={{ borderTop: '1px solid #B8CC5C', padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.side}</span>
                  <span role="cell" style={{ borderTop: '1px solid #B8CC5C', borderLeft: '1px solid #B8CC5C', padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.cs}</span>
                  <span role="cell" style={{ borderTop: '1px solid #B8CC5C', borderLeft: '1px solid #B8CC5C' }} />
                  <span role="cell" style={{ borderTop: '1px solid #B8CC5C', borderLeft: '1px solid #B8CC5C', padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.st}</span>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} role="cell" style={{ borderTop: '1px solid #B8CC5C', borderLeft: '1px solid #B8CC5C' }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '2 1 280px', minWidth: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox={`${VIEW.x0} ${VIEW.y0} ${VIEW.w} ${VIEW.h}`} style={{ width: '100%', height: 'auto', maxHeight: 760 }} role="img" aria-label="Pattern view: final bearing with distance marks, the bolter pattern, and aircraft">
              <g fill="none" stroke="#B8CC5C" strokeWidth="1.6">
                <path d="M110 58 A45 45 0 0 0 20 58 L20 300 A45 45 0 0 0 110 300" />
                <path d="M20 248 A45 45 0 0 0 110 248" />
                <line x1="110" y1="58" x2="110" y2="355" />
                <line x1="104" y1="70" x2="110" y2="70" />
                <line x1="104" y1={yOf(0)} x2="110" y2={yOf(0)} />
                <line x1="104" y1="215" x2="110" y2="215" />
                <line x1="104" y1="262" x2="110" y2="262" />
                <line x1="104" y1="300" x2="110" y2="300" />
                <line x1="104" y1="352" x2="110" y2="352" />
                <line x1="17" y1="170" x2="23" y2="170" />
              </g>
              <g fontFamily="IBM Plex Mono, monospace" fontSize="14" fill="#B8CC5C" textAnchor="end">
                <text x="100" y="75">4</text>
                <text x="100" y="220">2</text>
                <text x="100" y="267">4</text>
                <text x="100" y="305">6</text>
                <text x="100" y="357">R</text>
              </g>
              {/* the ship at 0 NM on the final bearing (landing area on the line), its axis at BRC, i.e.
                  rotated from the final by the true deck angle (not the view's stretched axes); symbolic size */}
              {focus && (
                <path
                  d={SHIP}
                  fill="#B8CC5C"
                  transform={`translate(${xOf(0)} ${yOf(0).toFixed(1)}) rotate(${(((focus.ship.brc - fb + 540) % 360) - 180).toFixed(1)})`}
                />
              )}
              {ac && (
                <g fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#B8CC5C">
                  {pattern.map(({ t, s, l }) => {
                    // representative, not symbolic: true lateral offset and the real heading
                    const hdg = t.crs ?? t.hdg ?? fb;
                    const x = xOf(l);
                    const y = yOf(s);
                    // outside the frame: not drawn (rather than pinned to the edge)
                    if (x < VIEW.x0 + 4 || x > VIEW.x0 + VIEW.w - 30 || y < VIEW.y0 + 6 || y > VIEW.y0 + VIEW.h - 16) return null;
                    const rot = screenHeading(s, hdg, fb);
                    return (
                      <g key={t.id}>
                        <path d={HORNET} fill="#B8CC5C" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`} />
                        <text x={x + 13} y={y - 1}>{t.bd ?? ''}</text>
                        <text x={x + 13} y={y + 12}>{t.lb !== undefined ? fuelK(t.lb) : ''}</text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>
        </div>
      </section>

      <section aria-label="Pass grading" style={{ flex: '1 1 420px', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="lbl">Current pass</span>
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{current ? `${current.s.toFixed(1)} NM` : 'No aircraft on final'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
            <div style={{ fontSize: 34, fontWeight: 700 }}>{current?.t.bd ?? '—'}</div>
            <div className="mono" style={{ fontSize: 14, color: '#93A1B0' }}>
              {current ? `${/FA-18/.test(current.t.ty) ? 'HORNET' : current.t.ty.toUpperCase()} · ${current.s < 1 ? 'BALL' : 'FINAL'} · ${current.t.lb !== undefined ? fuelK(current.t.lb) : '—'}` : ''}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
            <div><div className="lbl">Pilot</div><div className="mono" style={{ fontSize: 13 }}>{current?.t.pl ?? '—'}</div></div>
            <div><div className="lbl">Range</div><div className="mono" style={{ fontSize: 13 }}>{current ? `${current.s.toFixed(1)} NM` : '—'}</div></div>
            <div><div className="lbl">Alt</div><div className="mono" style={{ fontSize: 13 }}>{current ? `${Math.round(current.t.alt)} FT` : '—'}</div></div>
            <div><div className="lbl">GS</div><div className="mono" style={{ fontSize: 13 }}>{current ? `${Math.round(current.t.gs ?? 0)} KT` : '—'}</div></div>
          </div>
        </div>

        <div style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Deviations</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {posL.map((k) => (
                <button key={k} className="dv" onClick={() => setPos(k)} style={{ background: pos === k ? 'rgba(241,88,34,.18)' : '#1A212A', color: pos === k ? '#FFB08F' : '#E6EDF3', borderColor: pos === k ? '#F15822' : '#374250' }}>
                  {k}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {faultL.map((k) => (
                <button key={k} className="dv" onClick={() => setDevs([...devs, `${k} ${pos}`])} style={{ background: '#1A212A', color: '#E6EDF3' }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Wire</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['1', '2', '3', '4', '—'].map((k) => (
                <button key={k} className="gb" onClick={() => setWire(k)} style={{ flex: 1, background: wire === k ? '#E6EDF3' : '#1A212A', color: wire === k ? '#0E1116' : '#E6EDF3', borderColor: wire === k ? '#E6EDF3' : '#374250' }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Grade</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {G.map(([id, k, t, u]) => (
                <button key={id} className="gb" onClick={() => setGrade(id)} title={t} style={{ background: grade === id ? gradeCol[id] : '#1A212A', color: grade === id ? '#0E1116' : '#E6EDF3', borderColor: grade === id ? gradeCol[id] : '#374250', textDecoration: u ? 'underline' : 'none' }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: '#0E1116', border: '1px solid #374250', borderRadius: 6, padding: '10px 12px' }}>
            <div className="lbl" style={{ marginBottom: 4 }}>Comment</div>
            <div className="mono" style={{ fontSize: 17, color: '#E6EDF3' }}>{comment}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setDevs([]); setWire('—'); }} style={{ height: 42, flex: 1, background: 'transparent', border: '1px solid #374250', borderRadius: 6, color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 14, cursor: 'pointer' }}>Clear</button>
            <button disabled title="Not linked to the ReadyRoom trap sheet yet" style={{ height: 42, flex: 2, background: '#F15822', border: 0, borderRadius: 6, color: '#0E1116', fontFamily: "'Saira', sans-serif", fontWeight: 600, fontSize: 14, cursor: 'default', opacity: 0.6 }}>
              Log pass → greenie board
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: '12px 14px' }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Next in · from CATCC</div>
          <div className="mono" style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '50px 1fr 70px 50px', rowGap: 4 }}>
            {nextIn.map((t) => {
              const a = assignments.get(t.id);
              const p = patternPos(t, fb);
              const hdg = t.crs ?? t.hdg ?? fb;
              const recip = Math.abs(((hdg - fb + 540) % 360) - 180) > 140;
              const what = a
                ? `EAT :${String(Math.floor(((a.eatS + (offH ?? 0) * 3600) % 3600) / 60)).padStart(2, '0')}`
                : Math.abs(p.l) < 0.7 && p.s > 0 && p.s < 12
                  ? 'final'
                  : p.l > 0.7 && p.l < 3 && p.s > -2 && p.s < 8 && recip
                    ? 'downwind'
                    : 'inbound';
              const where = a ? `A${a.angels}` : `${p.s.toFixed(1)} NM`;
              const low = t.lb !== undefined && t.lb < 4500;
              return (
                <React.Fragment key={t.id}>
                  <span>{t.bd ?? '—'}</span>
                  <span style={{ color: '#93A1B0' }}>{what}</span>
                  <span>{where}</span>
                  <span style={{ color: low ? '#DE9A1F' : undefined }}>{t.lb !== undefined ? fuelK(t.lb) : '—'}</span>
                </React.Fragment>
              );
            })}
            {!nextIn.length && <span style={{ gridColumn: '1 / -1', color: '#6B7683' }}>None</span>}
          </div>
        </div>
      </section>
    </div>
  );
};

export const lsoHeaderInfo = (pic: Picture) => {
  const f = pic.focus;
  if (!f?.track.wx?.d0 || f.track.wx.s0 == null) return '';
  const D = Math.PI / 180;
  const wTo = (f.track.wx.d0 + 180) * D;
  const ws = [Math.sin(wTo) * f.track.wx.s0, Math.cos(wTo) * f.track.wx.s0];
  const sv = [Math.sin(f.ship.brc * D) * (f.track.gs ?? 0) * 0.514444, Math.cos(f.ship.brc * D) * (f.track.gs ?? 0) * 0.514444];
  const rel = [ws[0] - sv[0], ws[1] - sv[1]];
  const from = norm360(Math.atan2(rel[0], rel[1]) / D + 180);
  const ang = Math.round(((from - f.ship.fb + 540) % 360) - 180);
  return `WOD ${String(Math.round(from)).padStart(3, '0')}/${Math.round(Math.hypot(rel[0], rel[1]) / 0.514444)} · ${Math.abs(ang)} ${ang >= 0 ? 'STBD' : 'PORT'}`;
};
