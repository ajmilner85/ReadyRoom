/**
 * CATCC Approach / Final: the AZ/EL display. One scope centred on the ICLS / ACLS glidepath, azimuth
 * (localizer) deviation across and elevation (glideslope) deviation up, both in degrees from the
 * glidepath origin. The track table (top right) lists the aircraft the SPN-46 holds; the primary one
 * (green dot, picked from the table or the scope, else the nearest) is the contact and everything
 * else in the field a ghost. With nothing held, the nearest aircraft inside 6 NM is the contact.
 */
import React from 'react';
import { azElSelect, glideDeviation, AZEL_AZ_DEG, AZEL_EL_DEG, type FinalPicture } from './finalModel.ts';
import { typeName, type ScopeTrack } from '../scopeModel.ts';

const TRK = '#5FD068';
const AMBER = '#E7B04F';
const ROW_H = 18;
const label = (t: ScopeTrack) => t.bd ?? t.cs ?? t.pi ?? t.id;
const TRK_TRAIL = '#3E9A4C';
const TRAIL_O = [0.8, 0.6, 0.45, 0.3, 0.2];
/** the plot's half-width in display units (viewBox 400 × 400, centre 200 200) */
const H = 170;
const X = (az: number) => 200 + (az / AZEL_AZ_DEG) * H;
const Y = (el: number) => 200 - (el / AZEL_EL_DEG) * H;
const f1 = (n: number) => n.toFixed(1);
const pc = (x: number, y: number) => [x / 4, y / 4] as const;

export const AzElScope: React.FC<{
  fp: FinalPicture | null;
  tol: boolean;
  conflictIds: Set<string>;
  /** the aircraft the SPN-46 holds (the Landing aids LOCK-ON list); none: no table, the nearest is the contact */
  locks?: readonly string[];
  /** the picked primary track */
  pick?: string | null;
  onPick?: (id: string) => void;
  style?: React.CSSProperties;
}> = ({ fp, tol, conflictIds, locks, pick, onPick, style }) => {
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
      labs.push({ x: p[0], y: p[1], tf: 'translate(-50%, 0)', t: `${Math.abs(d)}` });
    }
  }
  for (let d = -AZEL_EL_DEG; d <= AZEL_EL_DEG + 1e-9; d += 0.5) {
    if (!d) continue;
    const h = Number.isInteger(d) ? 7 : 3.5;
    ticks += `M${f1(200 - h)} ${f1(Y(d))}h${f1(2 * h)}`;
    if (Number.isInteger(d)) {
      const p = pc(190, Y(d));
      labs.push({ x: p[0], y: p[1], tf: 'translate(-100%, -50%)', t: `${Math.abs(d)}` });
    }
  }
  // the ends of the scales: left / right of course, high / low on the glideslope
  {
    const l = pc(X(-AZEL_AZ_DEG), 192);
    const r = pc(X(AZEL_AZ_DEG), 192);
    const hi = pc(208, Y(AZEL_EL_DEG));
    const lo = pc(208, Y(-AZEL_EL_DEG));
    labs.push(
      { x: l[0], y: l[1], tf: 'translate(0, -100%)', t: 'L' },
      { x: r[0], y: r[1], tf: 'translate(-100%, -100%)', t: 'R' },
      { x: hi[0], y: hi[1], tf: 'translate(0, 0)', t: 'HI' },
      { x: lo[0], y: lo[1], tf: 'translate(0, -100%)', t: 'LO' },
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
      const [al, la] = fp.toFinal(q);
      const d = glideDeviation(al, la, qa);
      if (!d || Math.abs(d.az) > AZEL_AZ_DEG || Math.abs(d.el) > AZEL_EL_DEG) return;
      const p = pc(X(d.az), Y(d.el));
      trail.push([p[0], p[1]]);
    });
  }
  const red = prim ? conflictIds.has(prim.a.t.id) : false;
  const c = red ? '#FF8A85' : TRK;
  const pp = prim ? pc(X(prim.dev.az), Y(prim.dev.el)) : null;

  return (
    <section aria-label="AZ/EL display" style={{ position: 'relative', background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 8, overflow: 'hidden', boxSizing: 'border-box', ...style }}>
      <span className="lbl" style={{ position: 'absolute', left: 10, top: 8, zIndex: 2 }}>AZ / EL</span>
      <svg className="par" viewBox="0 0 400 400" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <rect x={X(-AZEL_AZ_DEG)} y={Y(AZEL_EL_DEG)} width={2 * H} height={2 * H} stroke="rgba(147,161,176,.12)" fill="none" />
        {tol && <path d={tolPath} stroke="rgba(201,211,221,.18)" fill="none" />}
        <path d={cross} stroke="#C9D3DD" strokeOpacity=".6" strokeWidth="1.6" fill="none" />
        <path d={ticks} stroke="#C9D3DD" strokeOpacity=".5" fill="none" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {labs.map((l, i) => (
          <span key={i} className="mono" style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, fontSize: 10.5, color: '#7D8896', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
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
              <div>{label(prim.a.t)}</div>
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
      {/* the track table: always two rows and the flag line, so nothing moves as tracks come and go */}
      <div className="mono" role="list" aria-label="AZ/EL tracks" style={{ position: 'absolute', right: 8, top: 8, zIndex: 3, width: 136, boxSizing: 'border-box', fontSize: 10.5, lineHeight: `${ROW_H}px` }}>
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
