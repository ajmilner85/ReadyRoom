/**
 * CATCC kit: scope elements. Contact symbols, trails, vectors, data tags, ships and the range-ring frame,
 * drawn with the radar scope's own markup and values (radar/Scope.tsx: hits, trails, velocity vectors,
 * renderTag, ships, surface contacts, rings; final/FinalView.tsx: the precision display frame and blips).
 * The scope draws in map units scaled per zoom; the kit draws at the default display sizes (UI_DEF, step 2:
 * one hit / tag unit = SCOPE_UNIT_PX px), so a sketch made from these matches the scope at its defaults.
 */
import React from 'react';
import { SCOPE_UNIT_PX } from './tokens.ts';

type Pt = [number, number];
const f2 = (n: number) => (Math.round(n * 1000) / 1000).toString();
const D = Math.PI / 180;
const P = (b: number, r: number): Pt => [r * Math.sin(b * D), -r * Math.cos(b * D)];
const r3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) % 360).padStart(3, '0');

export const U = SCOPE_UNIT_PX;
export type ContactSide = 'own' | 'blue' | 'red' | 'dim';
export type ContactShape = 'jet' | 'tanker' | 'helo';
export type ContactMark = 'none' | 'hooked' | 'formation' | 'member';
export type TagQuadrant = 'NE' | 'NW' | 'SE' | 'SW';

/** Scope colours (Scope.tsx TRK, TRK_TRAIL, BLUE_HIT, BLUE_TAG, BLUE_TRAIL; conflict #FF8A85 / #B8433F). */
const TRK = '#5FD068';
const HIT: Record<Exclude<ContactSide, 'dim'>, string> = { own: TRK, blue: '#3E9BD4', red: '#FF8A85' };
const TAG: Record<Exclude<ContactSide, 'dim'>, string> = { own: TRK, blue: '#6FB6E6', red: '#FF8A85' };
const TRAIL: Record<Exclude<ContactSide, 'dim'>, string> = { own: '#3E9A4C', blue: '#2F6F99', red: '#B8433F' };
const TRAIL_O = [0.8, 0.6, 0.45, 0.3, 0.2];
/** a + (b − a)·t for #rrggbb colours (Scope.tsx mixHex): dimmed contacts, solid and darker */
const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
};
const col = (m: Record<Exclude<ContactSide, 'dim'>, string>, s: ContactSide) => (s === 'dim' ? mixHex(m.own, '#0B0E12', 0.55) : m[s]);

/** The scope's SVG: class "scope" (catcc.css: non-scaling strokes, tag fonts), --lw and --tagc as the contact layer sets them. */
export const ScopeSvg: React.FC<{ w: number; h: number; viewBox?: string; lw?: number; z?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ w, h, viewBox, lw = 1, z = 1, children, style }) => (
  <svg className="scope" width={w} height={h} viewBox={viewBox ?? `0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible', '--z': z, '--lw': lw, '--tagc': TRK, ...style } as React.CSSProperties} aria-hidden="true">
    {children}
  </svg>
);

/** Hit (Scope.tsx "hits"): square jet, circle tanker, diamond helo; blue drawn at .85; hooked magenta box; formation dashed box; selected member white box. */
export const Hit: React.FC<{ p: Pt; k?: number; shape?: ContactShape; side?: ContactSide; mark?: ContactMark }> = ({ p, k = U, shape = 'jet', side = 'own', mark = 'none' }) => {
  const c = col(HIT, side);
  const sh = shape === 'tanker' ? <circle cx="0" cy="0" r="0.45" fill={c} className="hit" /> : shape === 'helo' ? <path d="M0 -0.6 L0.6 0 L0 0.6 L-0.6 0 Z" fill={c} className="hit" /> : <rect x="-0.4" y="-0.4" width="0.8" height="0.8" fill={c} className="hit" />;
  return (
    <g className="zs" transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)})`} opacity={side === 'blue' ? 0.85 : 1}>
      {sh}
      {mark === 'formation' && <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x="-0.75" y="-0.75" width="1.5" height="1.5" fill="none" stroke={c} strokeDasharray="2 2" />}
      {mark === 'member' && <rect style={{ strokeWidth: 'calc(1.2px * var(--lw, 1))' }} x="-0.7" y="-0.7" width="1.4" height="1.4" fill="none" stroke="#E6EDF3" />}
      {mark === 'hooked' && <rect style={{ strokeWidth: 'calc(1.4px * var(--lw, 1))' }} x="-0.9" y="-0.9" width="1.8" height="1.8" fill="none" stroke="#E45BEA" />}
    </g>
  );
};

/** Trail dots (Scope.tsx "trails"): square dots 0.32 units wide, fading newest to oldest. */
export const Trail: React.FC<{ pts: Pt[]; side?: ContactSide; px?: number }> = ({ pts, side = 'own', px = 0.32 * U }) => (
  <g fill="none" strokeLinecap="square" strokeWidth={px.toFixed(2)}>
    {pts.map((q, i) => (
      <path key={i} d={`M${f2(q[0])} ${f2(q[1])}h0.001`} stroke={col(TRAIL, side)} opacity={TRAIL_O[i] ?? 0.2} />
    ))}
  </g>
);

/** Velocity vector (Scope.tsx "velocity vectors"). */
export const Vector: React.FC<{ a: Pt; b: Pt; side?: ContactSide }> = ({ a, b, side = 'own' }) => (
  <g style={{ strokeWidth: 'calc(1.8px * var(--lw, 1))' }} strokeLinecap="round">
    <line x1={f2(a[0])} y1={f2(a[1])} x2={f2(b[0])} y2={f2(b[1])} stroke={col(TAG, side)} />
  </g>
);

/** Tag box geometry (Scope.tsx / FinalView.tsx `tagGeom`): a climb / descent arrow leads the second row. */
export const tagGeom = (rowsIn: string[]) => {
  const arrow = rowsIn[1]?.[0] === '↑' || rowsIn[1]?.[0] === '↓' ? rowsIn[1][0] : '';
  const rows = arrow ? [rowsIn[0], rowsIn[1].slice(1), ...rowsIn.slice(2)] : rowsIn;
  const inset = arrow ? 0.85 : 0.3;
  return { arrow, rows, inset, w: Math.max(...rows.map((r) => r.length)) * 0.54 + inset + 0.3, h: rows.length + 0.35 };
};
const QUAD: Record<TagQuadrant, Pt> = { NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };

/** Data tag (Scope.tsx `renderTag`): leader on the 45° from 0.7 to L units, the box at its end. */
export const DataTag: React.FC<{ p: Pt; rows: string[]; side?: ContactSide; quadrant?: TagQuadrant; L?: number; k?: number }> = ({ p, rows: rowsIn, side = 'own', quadrant = 'NE', L = 2.4, k = U }) => {
  const q = QUAD[quadrant];
  const s = Math.SQRT1_2;
  const L0: Pt = [q[0] * 0.7 * s, q[1] * 0.7 * s];
  const L1: Pt = [q[0] * L * s, q[1] * L * s];
  const { arrow, rows, inset, w, h } = tagGeom(rowsIn);
  const rx = q[0] > 0 ? L1[0] + 0.05 : L1[0] - 0.05 - w;
  const ty = L1[1] + 0.32;
  const color = side === 'red' ? 'red' : side === 'blue' ? 'blue' : 'own';
  const cls = color === 'red' ? 'tg tgr' : color === 'blue' ? 'tg tgb' : 'tg';
  const stroke = color === 'red' ? '#FF8A85' : color === 'blue' ? '#6FB6E6' : undefined;
  return (
    <g className="zs nr" transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)})`} style={{ pointerEvents: 'none' }}>
      <line style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x1={f2(L0[0])} y1={f2(L0[1])} x2={f2(L1[0])} y2={f2(L1[1])} className={stroke ? undefined : 'ldr'} stroke={stroke} />
      <rect style={color === 'red' ? { strokeWidth: 'calc(1.1px * var(--lw, 1))' } : undefined} x={f2(rx)} y={f2(ty - 0.85)} width={f2(w)} height={f2(h)} rx="0.2" fill="rgba(11,14,18,.72)" stroke={color === 'red' ? '#E0524E' : undefined} />
      {rows.map((r, i) => (
        <text key={i} x={f2(rx + inset)} y={f2(ty + i)} className={cls}>
          {r}
        </text>
      ))}
      {arrow && (
        <text x={f2(rx + inset - 0.15)} y={f2(ty + 1)} textAnchor="end" className={cls}>
          {arrow}
        </text>
      )}
    </g>
  );
};

/** Carrier symbol (Scope.tsx "ships"): the focus carrier white, another carrier blue (and 0.9 the size). */
export const CarrierSymbol: React.FC<{ p: Pt; brc?: number; focus?: boolean; k?: number }> = ({ p, brc = 0, focus = true, k = U }) => (
  <g transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)}) rotate(${f2(brc)})${focus ? '' : ' scale(0.9)'} translate(${-0.165} 0)`}>
    <path style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} d="M0.287 -1.4 L0.06 -1.4 L-0.011 -0.703 L-0.178 -0.488 L-0.166 1.06 L-0.029 1.102 L0.001 1.4 L0.316 1.4 L0.465 1.013 L0.477 -0.429 L0.328 -0.727 Z" fill="#0B0E12" stroke={focus ? '#E6EDF3' : '#3E9BD4'} strokeLinejoin="miter" />
  </g>
);

export type ShipSide = 'blue' | 'red' | 'neutral';
/** Surface contact (Scope.tsx "surface contacts"): hull along the course, the class name beside it. */
export const SurfaceContact: React.FC<{ p: Pt; hdg?: number; side?: ShipSide; name?: string; k?: number; trail?: Pt[] }> = ({ p, hdg = 0, side = 'blue', name, k = U, trail = [] }) => {
  const c = side === 'red' ? '#FF8A85' : side === 'blue' ? '#3E9BD4' : '#E7C66B';
  const tc = side === 'red' ? 'tg tgr' : side === 'blue' ? 'tg tgb' : 'tg';
  return (
    <g style={{ pointerEvents: 'none' }}>
      {trail.map((q, i) => (
        <path key={i} d={`M${f2(q[0])} ${f2(q[1])}h0.001`} fill="none" stroke={c} strokeLinecap="square" strokeWidth={(0.32 * U).toFixed(2)} opacity={[0.8, 0.65, 0.5, 0.38, 0.27, 0.18][i] ?? 0.18} />
      ))}
      <g transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)}) rotate(${f2(hdg)})`}>
        <path d="M0 -0.8 Q0.3 -0.5 0.3 -0.1 L0.3 0.62 L-0.3 0.62 L-0.3 -0.1 Q-0.3 -0.5 0 -0.8 Z" fill="#0B0E12" stroke={c} strokeLinejoin="miter" style={{ strokeWidth: 'calc(1.3px * var(--lw, 1))' }} />
      </g>
      {name && (
        <g className="zs nr" transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)})`}>
          <text x="0.9" y="1.2" className={tc} style={side === 'neutral' ? { fill: '#E7C66B' } : undefined}>
            {name}
          </text>
        </g>
      )}
    </g>
  );
};

/** A whole contact (hit, trail, vector, tag), in px: the unit most sketches start from. */
export const Contact: React.FC<{ p: Pt; hdg?: number; rows?: string[]; shape?: ContactShape; side?: ContactSide; mark?: ContactMark; quadrant?: TagQuadrant; trail?: number; vector?: number }> = ({ p, hdg = 45, rows, shape = 'jet', side = 'own', mark = 'none', quadrant = 'NE', trail = 5, vector = 2.2 }) => {
  const v = P(hdg, 1);
  const pts: Pt[] = Array.from({ length: trail }, (_, i) => [p[0] - v[0] * U * (i + 1), p[1] - v[1] * U * (i + 1)]);
  return (
    <>
      <Trail pts={pts} side={side} />
      {vector > 0 && <Vector a={p} b={[p[0] + v[0] * U * vector, p[1] + v[1] * U * vector]} side={side} />}
      <Hit p={p} shape={shape} side={side} mark={mark} />
      {rows && side !== 'dim' && <DataTag p={p} rows={rows} side={side} quadrant={quadrant} />}
    </>
  );
};

/** CPA label (Scope.tsx "CPA labels"): red box over the conflict's closest point; probe (BRA / CPA tool) in pale orange. */
export const CpaLabel: React.FC<{ p: Pt; text: string; probe?: boolean; k?: number }> = ({ p, text, probe = false, k = U }) => {
  const w = text.length * 0.54 + 0.6;
  return (
    <g className="zs nr" transform={`translate(${f2(p[0])} ${f2(p[1])}) scale(${k.toFixed(4)})`}>
      <rect style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} x={f2(-w / 2)} y="-3.2" width={f2(w)} height="1.45" rx="0.2" fill="#0E1116" stroke={probe ? '#FFD7A8' : '#E0524E'} />
      <text x="0" y="-2.2" textAnchor="middle" className="tgr" style={probe ? { fill: '#FFD7A8' } : undefined}>
        {text}
      </text>
    </g>
  );
};

/** Off-scope pointer (Scope.tsx "offs"): a wedge at the edge toward a contact out of view; ringed for a conflict. */
export const OffScope: React.FC<{ side?: Exclude<ContactSide, 'dim'>; rot?: number }> = ({ side = 'own', rot = 0 }) => (
  // the scope draws it 12 px and scales it by the hit size (×1.3 at the default); here the scale is in the viewBox
  <svg width="15.6" height="15.6" viewBox="0 0 12 12" style={{ display: 'block', overflow: 'visible' }}>
    <g transform={`rotate(${rot} 6 6)`}>
      <path d="M11 6 L1.5 0.8 L1.5 11.2 Z" fill={HIT[side]} />
      {side === 'red' && <circle style={{ strokeWidth: '1.5px' }} cx="5.5" cy="6" r="11" fill="none" stroke="#E0524E" />}
    </g>
  </svg>
);

/** Pinned conflict tag at the scope edge (Scope.tsx `pinned`). */
export const PinnedConflict: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ height: 20, lineHeight: '18px', padding: '0 8px', background: '#0E1116', border: '1px solid #E0524E', borderRadius: 2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#FF8A85', whiteSpace: 'nowrap', display: 'inline-block' }}>{children}</div>
);
/** Marshal assignment tag (Scope.tsx `adTags`). */
export const AssignedTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: 'rgba(11,14,18,.85)', border: '1px solid rgba(228,91,234,.6)', borderRadius: 2, padding: '1px 6px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, lineHeight: '15px', color: '#F2B3F5', whiteSpace: 'nowrap', display: 'inline-block' }}>{children}</div>
);

/**
 * Radar scope frame (Scope.tsx background: range rings every 10 NM to 40, labels straight up, the compass at
 * 30 NM; optional 10 NM grid) with the focus carrier in the middle, for a scope w × h px showing `range` NM
 * from the centre to the side edge. Children are drawn in NM about the carrier (north up) on the contact layer.
 */
export const ScopeFrame: React.FC<{ w: number; h: number; range?: number; grid?: boolean; brc?: number; children?: (s: { kx: number; zkH: number; zkT: number }) => React.ReactNode }> = ({ w, h, range = 25, grid = false, brc = 345, children }) => {
  const VW = 2 * range;
  const VH = (VW * h) / w;
  const KX = w / VW;
  const z = (VW / 97) * (860 / Math.max(300, w));
  const zkO = z * 1.3;
  const zkH = z * 1.3;
  const vb = `${f2(-VW / 2)} ${f2(-VH / 2)} ${f2(VW)} ${f2(VH)}`;
  const rings = [10, 20, 30, 40];
  const RC0 = 30;
  const zs = (a: Pt, k: number) => `translate(${f2(a[0])} ${f2(a[1])}) scale(${k.toFixed(4)}) translate(${f2(-a[0])} ${f2(-a[1])})`;
  const gl: number[] = [];
  for (let x = -Math.floor(VW / 20) * 10; x <= VW / 2; x += 10) gl.push(x);
  const gh: number[] = [];
  for (let y = -Math.floor(VH / 20) * 10; y <= VH / 2; y += 10) gh.push(y);
  return (
    <div style={{ position: 'relative', width: w, height: h, background: '#0B0E12', overflow: 'hidden' }}>
      <svg className="scope" viewBox={vb} width={w} height={h} style={{ position: 'absolute', inset: 0, '--z': zkO.toFixed(4), '--lw': 1.5 } as React.CSSProperties} aria-hidden="true">
        {grid && (
          <g className="grid">
            <path style={{ strokeWidth: 'calc(1px * var(--lw, 1))' }} d={[...gl.map((x) => `M${x} ${f2(-VH / 2)}V${f2(VH / 2)}`), ...gh.map((y) => `M${f2(-VW / 2)} ${y}H${f2(VW / 2)}`)].join('')} stroke="rgba(147,161,176,.14)" fill="none" />
          </g>
        )}
        <g className="rg">
          {rings.map((r) => (
            <circle key={r} cx="0" cy="0" r={r} className="ring" />
          ))}
          {rings.map((r) => (
            <text key={`rl${r}`} x="0" y={f2(-r - (r === RC0 ? 1.25 : 0.3) * zkO)} textAnchor="middle">
              {r} NM
            </text>
          ))}
          <g className="tick">
            {Array.from({ length: 12 }, (_, i) => i * 30).map((b) => {
              const c = P(b, RC0);
              const a = P(b, RC0 - 1);
              const e = P(b, RC0 + 1);
              return (
                <g key={b} className="zs" transform={zs(c, zkO)}>
                  <line x1={f2(a[0])} y1={f2(a[1])} x2={f2(e[0])} y2={f2(e[1])} />
                </g>
              );
            })}
          </g>
          {Array.from({ length: 12 }, (_, i) => i * 30).map((b) => {
            const q = P(b, RC0 - 1.9 * zkO);
            return (
              <text key={`c${b}`} x={f2(q[0])} y={f2(q[1])} textAnchor="middle" dominantBaseline="central">
                {r3(b)}
              </text>
            );
          })}
        </g>
      </svg>
      <svg className="scope" viewBox={vb} width={w} height={h} style={{ position: 'absolute', inset: 0, '--z': zkO.toFixed(4), '--lw': 1, '--tagc': TRK } as React.CSSProperties} aria-hidden="true">
        <CarrierSymbol p={[0, 0]} brc={brc} k={zkH} />
        {children?.({ kx: KX, zkH, zkT: z * 1.3 })}
      </svg>
    </div>
  );
};

/** Precision display blip (FinalView): a 10 px square, trail dots 4 px, at % positions. */
export const ParBlip: React.FC<{ x: number; y: number; color?: string; trail?: [number, number][] }> = ({ x, y, color = TRK, trail = [] }) => (
  <>
    {trail.map((q, i) => (
      <span key={i} style={{ position: 'absolute', left: `${q[0]}%`, top: `${q[1]}%`, width: 4, height: 4, margin: '-2px 0 0 -2px', background: '#3E9A4C', opacity: TRAIL_O[i] ?? 0.2 }} />
    ))}
    <span style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', background: color, border: '1px solid rgba(0,0,0,.5)', boxSizing: 'border-box' }} />
  </>
);
/** Precision display label (FinalView `labs`): plain, ringed number, or dot. */
export const ParLabel: React.FC<{ x: number; y: number; kind?: 'text' | 'ring' | 'dot'; color?: string; children?: React.ReactNode }> = ({ x, y, kind = 'text', color = '#93A1B0', children }) =>
  kind === 'dot' ? (
    <span style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', width: 7, height: 7, borderRadius: '50%', background: color }} />
  ) : kind === 'ring' ? (
    <span className="mono" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', width: 16, height: 16, boxSizing: 'border-box', borderRadius: '50%', border: `1px solid ${color}`, background: '#0B0E12', color, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </span>
  ) : (
    <span className="mono" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, fontSize: 10.5, color, whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
      {children}
    </span>
  );
