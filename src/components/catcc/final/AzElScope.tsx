/**
 * CATCC Approach / Final: the AZ/EL display. One scope centred on the ICLS / ACLS glidepath, azimuth
 * (localizer) deviation across and elevation (glideslope) deviation up, both in degrees from the
 * glidepath origin, drawn as seen from the ship: an aircraft high and right of course (the pilot's
 * view) shows high and left. The track table (inset in the plot's top-right corner) lists the aircraft the SPN-46 holds; the primary one
 * (green dot, picked from the table or the scope, else the nearest) is the contact and everything
 * else in the field a ghost. With nothing held, the nearest aircraft inside 6 NM is the contact.
 */
import React from 'react';
import { azElProfileMarks, azElSelect, flyingBall, azElX, azElY, finalProjection, glideDeviation, AZEL_AZ_DEG, AZEL_EL_DEG, AZEL_HALF, type FinalPicture } from './finalModel.ts';
import { typeName, type ScopeTrack } from '../scopeModel.ts';

const TRK = '#5FD068';
const AMBER = '#E7B04F';
const ROW_H = 18;
const label = (t: ScopeTrack) => t.bd ?? t.cs ?? t.pi ?? t.id;
const TRK_TRAIL = '#3E9A4C';
const TRAIL_O = [0.8, 0.6, 0.45, 0.3, 0.2];
/** the plot's half-width in display units (viewBox 400 × 400, centre 200 200) */
const H = AZEL_HALF;
/** the plot frame's inset from the scope's edge, % (the 400-unit viewBox's frame starts at 200 − H) */
const FRAME_INSET = ((200 - H) / 400) * 100;
/** the sea: a scalloped line across the frame's width, halfway between the frame's bottom and the pane's edge */
const SEA = (() => {
  const y = (400 + (200 + H)) / 2;
  const n = 17;
  const w = (2 * H) / n;
  let d = `M${200 - H} ${y}`;
  // each scallop dips between pointed crests that face up
  for (let i = 0; i < n; i++) d += `q${(w / 2).toFixed(2)} 4 ${w.toFixed(2)} 0`;
  return d;
})();
/** the Case III profile marks and their lines, across the whole field */
const PROFILE_MARKS = azElProfileMarks();
const PROFILE_PATH = PROFILE_MARKS.map((m) => `M${200 - H} ${azElY(m.el).toFixed(1)}H${200 + H}`).join('');
/** seen from the ship: right of course (az +) draws left of centre */
const X = azElX;
const Y = azElY;
const f1 = (n: number) => n.toFixed(1);
const pc = (x: number, y: number) => [x / 4, y / 4] as const;

export const AzElScope: React.FC<{
  fp: FinalPicture | null;
  /** projection-vector time, s (the Approach / Final toolbar's Vector) */
  vecS?: number;
  tol: boolean;
  /** the Case III profile layer: where a level 1,200 ft aircraft shows at each NM past the glideslope intercept */
  profile?: boolean;
  conflictIds: Set<string>;
  /** the aircraft the SPN-46 holds (the Landing aids LOCK-ON list); none: no table, the nearest is the contact */
  locks?: readonly string[];
  /** the picked primary track */
  pick?: string | null;
  onPick?: (id: string) => void;
  style?: React.CSSProperties;
}> = ({ fp, vecS = 2, tol, profile = false, conflictIds, locks, pick, onPick, style }) => {
  const { prim, ghosts, tracked, primaryId, notNearest } = azElSelect(fp, locks, pick);

  // crosshair through the glidepath, hash marks every 0.5°, longer at whole degrees
  const cross = `M${X(-AZEL_AZ_DEG)} 200H${X(AZEL_AZ_DEG)}M200 ${Y(AZEL_EL_DEG)}V${Y(-AZEL_EL_DEG)}`;
  let ticks = '';
  const labs: { x: number; y: number; tf: string; t: string }[] = [];
  for (let d = -AZEL_AZ_DEG; d <= AZEL_AZ_DEG + 1e-9; d += 0.5) {
    if (!d) continue;
    const h = Number.isInteger(d) ? 7 : 3.5;
    ticks += `M${f1(X(d))} ${f1(200 - h)}v${f1(2 * h)}`;
    if (Number.isInteger(d)) {
      const p = pc(X(d), 210);
      labs.push({ x: p[0], y: p[1], tf: 'translate(-50%, 0)', t: `${Math.abs(d)}°` });
    }
  }
  for (let d = -AZEL_EL_DEG; d <= AZEL_EL_DEG + 1e-9; d += 0.5) {
    if (!d) continue;
    const h = Number.isInteger(d) ? 7 : 3.5;
    ticks += `M${f1(200 - h)} ${f1(Y(d))}h${f1(2 * h)}`;
    if (Number.isInteger(d)) {
      const p = pc(190, Y(d));
      labs.push({ x: p[0], y: p[1], tf: 'translate(-100%, -50%)', t: `${Math.abs(d)}°` });
    }
  }
  // the ends of the scales: each names the side of course an aircraft drawn there is on (as the
  // Azimuth display's R / L), so seen from the ship R is at the left end; high / low on the glideslope
  {
    const r = pc(X(AZEL_AZ_DEG), 192);
    const l = pc(X(-AZEL_AZ_DEG), 192);
    const hi = pc(208, Y(AZEL_EL_DEG));
    const lo = pc(208, Y(-AZEL_EL_DEG));
    if (profile) {
      for (const m of PROFILE_MARKS) {
        const q = pc(X(-AZEL_AZ_DEG) - 4, Y(m.el));
        labs.push({ x: q[0], y: q[1], tf: 'translate(-100%, -100%)', t: `${m.nm} NM` });
      }
    }
    labs.push(
      { x: r[0], y: r[1], tf: 'translate(0, -100%)', t: 'RIGHT' },
      { x: l[0], y: l[1], tf: 'translate(-100%, -100%)', t: 'LEFT' },
      { x: hi[0], y: hi[1], tf: 'translate(0, 0)', t: 'HIGH' },
      { x: lo[0], y: lo[1], tf: 'translate(0, -100%)', t: 'LOW' },
    );
  }
  // ±0.5° about the glideslope, as on the Elevation display
  const tolPath = `M${X(-AZEL_AZ_DEG)} ${f1(Y(0.5))}H${X(AZEL_AZ_DEG)}M${X(-AZEL_AZ_DEG)} ${f1(Y(-0.5))}H${X(AZEL_AZ_DEG)}`;

  // the contact's trail, where the radar had it in the field
  const trail: [number, number][] = [];
  if (prim && fp) {
    prim.a.t.trail.forEach((q, i) => {
      const qa = prim.a.t.trailAlt?.[i];
      if (qa === undefined) return;
      // in the ship's frame of the dot's time: a track that flew the moving centreline trails along the vertical axis
      const [al, la] = fp.toFinalAt(q, prim.a.t.trailT?.[i]);
      const d = glideDeviation(al, la, qa);
      if (!d || Math.abs(d.az) > AZEL_AZ_DEG || Math.abs(d.el) > AZEL_EL_DEG) return;
      const p = pc(X(d.az), Y(d.el));
      trail.push([p[0], p[1]]);
    });
  }
  // the contact's projection vector: where its deviation will be after vecS, from its motion relative to the
  // ship and its climb or descent; on centreline and glidepath it has no length (straight into the scope)
  let vec: number[] | null = null;
  if (prim && fp && (prim.a.t.gs ?? 0) >= 20) {
    const [al, la, alt] = finalProjection(fp, prim.a, vecS);
    const d = glideDeviation(al, la, alt);
    if (d) vec = [X(prim.dev.az), Y(prim.dev.el), X(d.az), Y(d.el)];
  }
  const red = prim ? conflictIds.has(prim.a.t.id) : false;
  const c = red ? '#FF8A85' : TRK;
  const pp = prim ? pc(X(prim.dev.az), Y(prim.dev.el)) : null;
  const ball = !!prim && flyingBall(prim.a);

  // The track table sits as far in from the frame's top as from its right (its text 10 px from
  // both); where it would run into the HIGH label (a narrow scope, a long callsign) it drops below it.
  const highRef = React.useRef<HTMLSpanElement>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [belowHigh, setBelowHigh] = React.useState(false);
  // what sets the table's width, and the scope's size
  const rowsKey = tracked.map((k) => `${label(k.a.t)} ${typeName(k.a.t.ty)} ${k.r.toFixed(1)}`).join('|');
  const sizeKey = `${style?.width ?? ''}x${style?.height ?? ''}`;
  React.useLayoutEffect(() => {
    const h = highRef.current?.getBoundingClientRect();
    const t = tableRef.current?.getBoundingClientRect();
    if (!h || !t) return;
    const clash = t.left < h.right + 6;
    if (clash !== belowHigh) setBelowHigh(clash);
  }, [belowHigh, rowsKey, sizeKey]);

  return (
    <section aria-label="AZ/EL display" style={{ position: 'relative', background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 8, overflow: 'hidden', boxSizing: 'border-box', ...style }}>
      <span className="lbl" style={{ position: 'absolute', left: 10, top: 8, zIndex: 2 }}>AZ / EL</span>
      <svg className="par" viewBox="0 0 400 400" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <rect x={200 - H} y={Y(AZEL_EL_DEG)} width={2 * H} height={2 * H} stroke="rgba(147,161,176,.12)" fill="none" />
        {tol && <path d={tolPath} stroke="rgba(201,211,221,.18)" fill="none" />}
        {/* the Case III profile, one line per NM out (the Azimuth display's 1° / 2° / 5° line style) */}
        {profile && <path d={PROFILE_PATH} stroke="rgba(147,161,176,.17)" fill="none" strokeDasharray="4 4" />}
        <path d={cross} stroke="#C9D3DD" strokeOpacity=".6" strokeWidth="1.6" fill="none" />
        <path d={ticks} stroke="#C9D3DD" strokeOpacity=".5" fill="none" />
        {vec && <line x1={f1(vec[0])} y1={f1(vec[1])} x2={f1(vec[2])} y2={f1(vec[3])} stroke={red ? '#FF8A85' : TRK} strokeWidth="1.8" strokeLinecap="round" />}
        {/* the sea, under the plot frame: the Azimuth display's BRC line colour */}
        <path d={SEA} stroke="rgba(111,182,230,.45)" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {labs.map((l, i) => (
          <span key={i} ref={l.t === 'HIGH' ? highRef : undefined} className="mono" style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, fontSize: 10.5, color: '#7D8896', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
            {l.t}
          </span>
        ))}
        {ghosts.map((g) => {
          const p = pc(X(g.dev.az), Y(g.dev.el));
          return <span key={g.a.t.id} style={{ position: 'absolute', left: `${p[0]}%`, top: `${p[1]}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', background: TRK_TRAIL, opacity: 0.35, boxSizing: 'border-box' }} />;
        })}
        {trail.map((q, i) => (
          <span key={`t${i}`} style={{ position: 'absolute', left: `${q[0]}%`, top: `${q[1]}%`, width: 4, height: 4, margin: '-2px 0 0 -2px', background: red ? '#B8433F' : TRK_TRAIL, opacity: TRAIL_O[i] ?? 0.2 }} />
        ))}
        {prim && pp && (
          <>
            <span style={{ position: 'absolute', left: `${pp[0]}%`, top: `${pp[1]}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', background: c, border: '1px solid rgba(0,0,0,.5)', boxSizing: 'border-box' }} />
            <span
              className="mono"
              style={{
                position: 'absolute',
                left: `${pp[0]}%`,
                top: `${pp[1]}%`,
                transform: pp[0] > 70 ? 'translate(calc(-100% - 10px), calc(-100% - 8px))' : 'translate(10px, calc(-100% - 8px))',
                padding: '1px 4px',
                background: 'rgba(11,14,18,.72)',
                border: red ? '1px solid #E0524E' : undefined,
                borderRadius: 2,
                color: c,
                fontSize: 11.7,
                lineHeight: '13px',
                whiteSpace: 'nowrap',
              }}
            >
              {/* inside 3/4 NM: should be flying the ball (amber dot left of the board number, outside the
                  text so the number stays aligned with the range below it) */}
              <div style={{ position: 'relative' }}>
                {ball && <span style={{ position: 'absolute', right: '100%', top: '50%', width: 7, height: 7, margin: '-3.5px 3px 0 0', borderRadius: '50%', background: '#E7B04F' }} />}
                {label(prim.a.t)}
              </div>
              <div>{prim.dev.r.toFixed(1)} NM</div>

            </span>
          </>
        )}
        {/* the held tracks on the scope: click one to make it primary */}
        {tracked.map((k) => {
          if (!k.dev) return null;
          const p = pc(X(k.dev.az), Y(k.dev.el));
          return (
            <button
              key={`h${k.a.t.id}`}
              type="button"
              aria-label={label(k.a.t)}
              aria-pressed={k.a.t.id === primaryId}
              onClick={() => onPick?.(k.a.t.id)}
              style={{ position: 'absolute', left: `${p[0]}%`, top: `${p[1]}%`, width: 24, height: 24, margin: '-12px 0 0 -12px', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', pointerEvents: 'auto' }}
            />
          );
        })}
      </div>
      {/* the track table, inset in the plot's top-right corner (text 10 px from the top and right, below HIGH if it would touch it; sized to its rows):
          always two rows and the flag line, so nothing moves as tracks come and go */}
      <div
        className="mono"
        ref={tableRef}
        role="list"
        aria-label="AZ/EL tracks"
        style={{ position: 'absolute', right: `calc(${FRAME_INSET}% + 6px)`, top: `calc(${FRAME_INSET}% + ${belowHigh ? 18 : 5}px)`, zIndex: 3, width: 'max-content', boxSizing: 'border-box', fontSize: 10.5, lineHeight: `${ROW_H}px` }}
      >
        {[0, 1].map((i) => {
          const k = tracked[i];
          if (!k) return <div key={i} style={{ height: ROW_H }} />;
          const on = k.a.t.id === primaryId;
          const c = on && notNearest ? AMBER : on ? '#E6EDF3' : '#93A1B0';
          return (
            <button
              key={k.a.t.id}
              type="button"
              role="listitem"
              aria-current={on}
              onClick={() => onPick?.(k.a.t.id)}
              style={{ display: 'grid', gridTemplateColumns: '7px 1fr auto', columnGap: 5, alignItems: 'center', width: '100%', height: ROW_H, padding: '0 4px', border: 0, borderRadius: 2, background: 'rgba(11,14,18,.72)', color: c, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? TRK : 'transparent' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label(k.a.t)} {typeName(k.a.t.ty)}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{k.r.toFixed(1)} NM</span>
            </button>
          );
        })}
        <div style={{ height: 16, lineHeight: '16px', textAlign: 'right', fontSize: 10.5, letterSpacing: '.04em', color: AMBER }}>
          {notNearest && <span style={{ padding: '1px 5px', borderRadius: 2, background: 'rgba(11,14,18,.72)' }}>NOT NEAREST</span>}
        </div>
      </div>
    </section>
  );
};
