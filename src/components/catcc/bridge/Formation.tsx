/**
 * Bridge: CSG formation panel and editor (carrier-ops-handoff-2/mockup/Bridge.dc.html §6.1).
 * Units first: each escort holds exactly one station (sector, point or free) per preset. Bearings
 * are relative to the formation axis (the BRC); the plot is axis-up. Apply saves every preset's
 * draft and makes the shown one active; the formation is shared room state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { EscortRole, Formation, OpsState, Station } from '../../../catcc/core/room/ops.ts';
import { formationFor, PLANE_GUARD, PRESETS, ROLE_LABEL, sectorWidth, stationText, ydOf } from '../../../catcc/core/geometry/formation.ts';
import type { Picture } from '../scopeModel.ts';
import { escortsOf, stateOf, type Escort } from './escorts.ts';

const SEG: React.CSSProperties = { display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 };
const segB = (on: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ border: 0, height: 28, padding: '0 10px', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer', background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', ...extra });
const btn: React.CSSProperties = { height: 32, padding: '0 12px', border: '1px solid #374250', borderRadius: 5, background: 'transparent', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' };
const r3 = (n: number) => String(((Math.round(n) % 360) + 360) % 360).padStart(3, '0');

// ---------------------------------------------------------------- panel

export const FormationPanel: React.FC<{ pic: Picture; ops?: OpsState; setOps: (p: Partial<Record<keyof OpsState, unknown>>) => void; readOnly: boolean }> = ({ pic, ops, setOps, readOnly }) => {
  const escorts = escortsOf(pic);
  const ids = escorts.map((e) => e.id);
  const f = formationFor(ops?.formation, ids);
  const [open, setOpen] = useState(false);
  const brc = pic.focus?.ship.brc ?? 0;
  const act = f.presets[f.active];
  return (
    <section className="pnl" aria-label="CSG formation">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="lbl">CSG formation · {f.active}</span>
        <button onClick={() => setOpen(true)} disabled={!escorts.length} style={{ ...btn, height: 26, fontSize: 11.5, opacity: escorts.length ? 1 : 0.4 }}>
          {readOnly ? 'View stations' : 'Edit stations'}
        </button>
      </div>
      {escorts.map((e) => {
        const st = act[e.id];
        const s = stateOf(st, brc, e);
        return (
          <div key={e.id} className="mono" style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', gap: 6, fontSize: 12, padding: '3px 0' }}>
            <b>{e.label}</b>
            <span style={{ color: '#93A1B0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.kind === 'free' ? 'FREE' : `${ROLE_LABEL[st.role].toUpperCase()} · ${stationText(st)}`}</span>
            <span style={{ color: s.c }}>{s.t}</span>
          </div>
        );
      })}
      {!escorts.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No escorts with this carrier</div>}
      {open && <FormationEditor escorts={escorts} formation={f} brc={brc} readOnly={readOnly} onClose={() => setOpen(false)} onApply={(nf) => { setOps({ formation: nf }); setOpen(false); }} />}
    </section>
  );
};

// ---------------------------------------------------------------- editor

const Dg = Math.PI / 180;
const Pp = (b: number, r: number): [number, number] => [r * Math.sin(b * Dg), -r * Math.cos(b * Dg)];
const f2 = (n: number) => n.toFixed(2);
const W = (b: number, d: number) => (((b + d) % 360) + 360) % 360;
const B1 = (s: { b0: number; b1: number }) => s.b0 + sectorWidth(s);
const mb = (s: { b0: number; b1: number }) => s.b0 + sectorWidth(s) / 2;
const sectorD = (s: { b0: number; b1: number; r0: number; r1: number }) => {
  const e = B1(s);
  const lg = e - s.b0 > 180 ? 1 : 0;
  const a = Pp(s.b0, s.r1);
  const b = Pp(e, s.r1);
  const c = Pp(e, s.r0);
  const d = Pp(s.b0, s.r0);
  return `M${f2(d[0])} ${f2(d[1])}L${f2(a[0])} ${f2(a[1])}A${s.r1} ${s.r1} 0 ${lg} 1 ${f2(b[0])} ${f2(b[1])}L${f2(c[0])} ${f2(c[1])}A${s.r0} ${s.r0} 0 ${lg} 0 ${f2(d[0])} ${f2(d[1])}Z`;
};
const circ = (q: [number, number], r: number) => `M${f2(q[0] + r)} ${f2(q[1])}A${r} ${r} 0 1 0 ${f2(q[0] - r)} ${f2(q[1])}A${r} ${r} 0 1 0 ${f2(q[0] + r)} ${f2(q[1])}`;
const sq = (q: [number, number], h: number) => `M${f2(q[0] - h)} ${f2(q[1] - h)}h${2 * h}v${2 * h}h${-2 * h}Z`;
const where = (s: Station): [number, number] | null => (s.kind === 'point' ? Pp(s.b, s.r) : s.kind === 'sector' ? Pp(mb(s), (s.r0 + s.r1) / 2) : null);
const pct = (q: [number, number]) => [((q[0] + 22) / 44) * 100, ((q[1] + 22) / 44) * 100];
type Grip = 'b0' | 'b1' | 'r0' | 'r1' | 'pt' | 'move';
/** grips sit outside the sector (bearing grips past the outer arc, range grips beyond each arc) so they stay apart on small sectors */
const handles = (s: Station): [Grip, [number, number]][] =>
  s.kind === 'point'
    ? [['pt', Pp(s.b, s.r)]]
    : s.kind === 'sector'
      ? [
          ['b0', Pp(s.b0, s.r1 + 1.3)],
          ['b1', Pp(B1(s), s.r1 + 1.3)],
          ['r0', Pp(mb(s), Math.max(0.6, s.r0 - 0.7))],
          ['r1', Pp(mb(s), s.r1 + 0.7)],
        ]
      : [];
const polar = (x: number, y: number): [number, number] => [(Math.atan2(x, -y) / Dg + 360) % 360, Math.hypot(x, y)];
const inSec = (s: Station, b: number, r: number) => s.kind === 'sector' && r >= s.r0 && r <= s.r1 && W(b, -s.b0) <= sectorWidth(s);
const ROLES: EscortRole[] = ['AAW', 'ASW', 'PG', 'PKT'];

const FormationEditor: React.FC<{ escorts: Escort[]; formation: Formation; brc: number; readOnly: boolean; onClose: () => void; onApply: (f: Formation) => void }> = ({ escorts, formation, brc, readOnly, onClose, onApply }) => {
  const [all, setAll] = useState<Formation['presets']>(() => JSON.parse(JSON.stringify(formation.presets)));
  const [pre, setPre] = useState<string>(formation.active);
  const [sel, setSel] = useState<string>(escorts[0]?.id ?? '');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const fd = all[pre];
  const cur = fd[sel] ?? ({ kind: 'free', role: 'AAW' } as Station);
  const label = (id: string) => escorts.find((e) => e.id === id)?.label ?? id;
  const setU = (id: string, s: Station) => {
    if (readOnly) return;
    setAll((a) => ({ ...a, [pre]: { ...a[pre], [id]: s } }));
    setSel(id);
  };
  const placed = escorts.filter((e) => fd[e.id]?.kind !== 'free');

  const plot = useMemo(() => {
    const other = placed.filter((e) => e.id !== sel && fd[e.id].kind === 'sector').map((e) => sectorD(fd[e.id] as Extract<Station, { kind: 'sector' }>)).join('');
    const selD = cur.kind === 'sector' ? sectorD(cur) : '';
    const pts = placed.map((e) => circ(where(fd[e.id])!, 0.55)).join('');
    const h = handles(cur).map(([k, q]) => (k === 'pt' ? circ(q, 0.9) : sq(q, 0.6))).join('');
    return { other, selD, pts, h };
  }, [placed, sel, fd, cur]);

  const onDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const toV = (ev: { clientX: number; clientY: number }): [number, number] => {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const v = pt.matrixTransform(m.inverse());
      return [v.x, v.y];
    };
    const v0 = toV(e);
    const [bb, rr] = polar(v0[0], v0[1]);
    // the selected unit's nearest grip first, then any unit's body (which selects it)
    const grips = handles(cur)
      .map(([k, q]) => [k, Math.hypot(q[0] - v0[0], q[1] - v0[1])] as const)
      .filter((g) => g[1] < 1.3)
      .sort((x, y) => x[1] - y[1]);
    let u = sel;
    let mode: Grip | null = grips.length ? grips[0][0] : null;
    if (!mode) {
      const hit = [sel, ...escorts.map((x) => x.id).filter((x) => x !== sel)].find((x) => {
        const t = fd[x];
        if (!t) return false;
        if (t.kind === 'sector') return inSec(t, bb, rr);
        if (t.kind === 'point') {
          const q = Pp(t.b, t.r);
          return Math.hypot(q[0] - v0[0], q[1] - v0[1]) < 1.3;
        }
        return false;
      });
      if (!hit) return;
      u = hit;
      mode = fd[hit].kind === 'point' ? 'pt' : 'move';
    }
    e.preventDefault();
    const base = fd[u];
    const s5 = (b: number) => (Math.round(b / 5) * 5 + 360) % 360;
    const h5 = (r: number) => Math.max(0.5, Math.round(r * 2) / 2);
    const mv = (ev: MouseEvent) => {
      const v = toV(ev);
      const [b, r] = polar(v[0], v[1]);
      if (base.kind === 'point') {
        setU(u, { ...base, b: s5(b), r: h5(r) });
        return;
      }
      if (base.kind !== 'sector') return;
      const w = sectorWidth(base);
      let o: Partial<Extract<Station, { kind: 'sector' }>> = {};
      if (mode === 'b0') {
        const nb = s5(b);
        const nw = W(base.b1, -nb);
        if (nw >= 10 && nw <= 180) o = { b0: nb };
      } else if (mode === 'b1') {
        const nb = s5(b);
        const nw = W(nb, -base.b0);
        if (nw >= 10 && nw <= 180) o = { b1: nb };
      } else if (mode === 'r0') o = { r0: Math.min(base.r1 - 1, h5(r + 0.7)) };
      else if (mode === 'r1') o = { r1: Math.min(30, Math.max(base.r0 + 1, h5(r - 0.7))) };
      else {
        const db = ((b - bb + 540) % 360) - 180;
        const n0 = h5(Math.max(0.5, base.r0 + (r - rr)));
        o = { b0: s5(base.b0 + db), b1: s5(base.b0 + db + w), r0: n0, r1: Math.min(30, n0 + (base.r1 - base.r0)) };
      }
      setU(u, { ...base, ...o });
    };
    const up = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };

  const fields: { label: string; v: string; up: () => void; dn: () => void }[] =
    cur.kind === 'point'
      ? [
          { label: 'Bearing (rel)', v: `${r3(cur.b)}°`, up: () => setU(sel, { ...cur, b: W(cur.b, 5) }), dn: () => setU(sel, { ...cur, b: W(cur.b, -5) }) },
          { label: 'Range', v: `${cur.r} NM · ${ydOf(cur.r).toLocaleString('en-US')} YD`, up: () => setU(sel, { ...cur, r: Math.min(30, cur.r + 0.5) }), dn: () => setU(sel, { ...cur, r: Math.max(0.5, cur.r - 0.5) }) },
        ]
      : cur.kind === 'sector'
        ? [
            { label: 'Bearing from (rel)', v: `${r3(cur.b0)}°`, up: () => setU(sel, { ...cur, b0: sectorWidth(cur) > 10 ? W(cur.b0, 5) : cur.b0 }), dn: () => setU(sel, { ...cur, b0: sectorWidth(cur) < 180 ? W(cur.b0, -5) : cur.b0 }) },
            { label: 'Bearing to (rel)', v: `${r3(cur.b1)}°`, up: () => setU(sel, { ...cur, b1: sectorWidth(cur) < 180 ? W(cur.b1, 5) : cur.b1 }), dn: () => setU(sel, { ...cur, b1: sectorWidth(cur) > 10 ? W(cur.b1, -5) : cur.b1 }) },
            { label: 'Range inner', v: `${cur.r0} NM`, up: () => setU(sel, { ...cur, r0: Math.min(cur.r1 - 1, cur.r0 + 1) }), dn: () => setU(sel, { ...cur, r0: Math.max(0.5, cur.r0 - 1) }) },
            { label: 'Range outer', v: `${cur.r1} NM`, up: () => setU(sel, { ...cur, r1: Math.min(30, cur.r1 + 1) }), dn: () => setU(sel, { ...cur, r1: Math.max(cur.r0 + 1, cur.r1 - 1) }) },
          ]
        : [];
  const toKind = (k: Station['kind']): Station => {
    const c = where(cur) ? polar(...where(cur)!) : [0, 6];
    if (k === 'free') return { kind: 'free', role: cur.role };
    if (k === 'point') return { kind: 'point', role: cur.role, b: Math.round(c[0] / 5) * 5 % 360, r: Math.max(0.5, Math.round(c[1] * 2) / 2) };
    return cur.kind === 'sector' ? cur : { kind: 'sector', role: cur.role, b0: W(Math.round(c[0] / 5) * 5, -15), b1: W(Math.round(c[0] / 5) * 5, 15), r0: Math.max(1, Math.round(c[1]) - 2), r1: Math.max(3, Math.round(c[1]) + 2) };
  };
  const dig: React.CSSProperties = { display: 'inline-block', boxSizing: 'border-box', padding: '2px 6px', borderRadius: 2, background: '#0B100C', border: '1px solid #3A4A3B', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 600, color: '#6FBF68', textAlign: 'center', letterSpacing: '.04em', minWidth: 96 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,10,.6)', zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60 }}>
      <div role="dialog" aria-label="CSG formation editor" onClick={(e) => e.stopPropagation()} style={{ width: 'min(1000px, calc(100% - 32px))', background: '#151A21', border: '1px solid #374250', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #262F3A' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>CSG formation</div>
          <div style={SEG} role="radiogroup" aria-label="Preset">
            {[...new Set([...PRESETS, ...Object.keys(all)])].map((k) => (
              <button key={k} role="radio" aria-checked={pre === k} onClick={() => setPre(k)} style={segB(pre === k)}>
                {k}
                {k === formation.active ? ' ●' : ''}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>AXIS {r3(brc)} · FOLLOWS BRC</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', minHeight: 0 }}>
          <div style={{ position: 'relative', padding: 12, borderRight: '1px solid #262F3A' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '1', margin: '0 auto' }}>
              <svg className="fm" viewBox="-22 -22 44 44" onMouseDown={onDown} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: readOnly ? 'default' : 'crosshair' }} role="img" aria-label="Formation plot, axis up: station sectors and assigned units">
                {[5, 10, 15, 20].map((r) => (
                  <circle key={r} r={r} fill="none" stroke="rgba(64,168,91,.22)" />
                ))}
                <line x1="0" y1="-21" x2="0" y2="21" stroke="rgba(230,237,243,.35)" strokeDasharray="4 4" />
                <line x1="-21" y1="0" x2="21" y2="0" stroke="rgba(147,161,176,.12)" />
                <path d={plot.other} fill="rgba(62,155,212,.10)" stroke="rgba(62,155,212,.55)" strokeDasharray="4 3" />
                <path d={plot.selD} fill="rgba(241,88,34,.12)" stroke="#F15822" strokeWidth="1.6" />
                <path d={plot.pts} fill="#3E9BD4" />
                {!readOnly && <path d={plot.h} fill="#0B0E12" stroke="#F15822" strokeWidth="1.4" />}
                <path d="M0 -1.1 L0.45 0.8 L-0.45 0.8 Z" fill="#E6EDF3" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {placed.map((e) => {
                  const t = fd[e.id];
                  const q = pct(t.kind === 'point' ? Pp(t.b, t.r + 1.8) : where(t)!);
                  return (
                    <span key={e.id} className="mono" style={{ position: 'absolute', left: `${q[0]}%`, top: `${q[1]}%`, transform: 'translate(-50%, -50%)', fontSize: 11, color: e.id === sel ? '#FFB08F' : '#CFE6F6', whiteSpace: 'nowrap', background: 'rgba(11,14,18,.75)', padding: '1px 4px', borderRadius: 3 }}>
                      {e.label}
                    </span>
                  );
                })}
                {[5, 10, 15, 20].map((r) => {
                  const q = pct([0.6, -r]);
                  return (
                    <span key={r} className="mono" style={{ position: 'absolute', left: `${q[0] + 2.5}%`, top: `${q[1] + 1.6}%`, transform: 'translate(-50%, -50%)', fontSize: 11, color: '#5E6A78' }}>
                      {r}
                    </span>
                  );
                })}
                <span className="mono" style={{ position: 'absolute', left: '50%', top: '1.2%', transform: 'translate(-50%, -50%)', fontSize: 11, color: '#C9D3DD' }}>AXIS {r3(brc)}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="lbl">Escorts · one station each</div>
            {escorts.map((e) => {
              const t = fd[e.id];
              const on = e.id === sel;
              return (
                <button key={e.id} aria-pressed={on} onClick={() => setSel(e.id)} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 8, alignItems: 'center', textAlign: 'left', padding: '7px 8px', borderRadius: 5, border: `1px solid ${on ? '#F15822' : '#262F3A'}`, background: on ? '#222C37' : '#1A212A', color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, cursor: 'pointer' }}>
                  <b style={{ color: '#6FB6E6' }}>{e.label}</b>
                  <span style={{ color: '#93A1B0' }}>{t.kind === 'free' ? '—' : ROLE_LABEL[t.role]}</span>
                  <span style={{ color: t.kind === 'free' ? '#E7B04F' : '#C9D3DD' }}>{stationText(t)}</span>
                </button>
              );
            })}
            <div style={{ borderTop: '1px solid #262F3A', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="lbl">{label(sel)} station</span>
                <div style={SEG} role="radiogroup" aria-label="Station type">
                  {(['sector', 'point', 'free'] as const).map((k) => (
                    <button key={k} role="radio" aria-checked={cur.kind === k} disabled={readOnly} onClick={() => setU(sel, toKind(k))} style={segB(cur.kind === k, { height: 24, fontSize: 11 })}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="lbl" style={{ marginBottom: 4 }}>Role</div>
                <div style={{ ...SEG, flexWrap: 'wrap' }} role="radiogroup" aria-label="Role">
                  {ROLES.map((k) => (
                    <button key={k} role="radio" aria-checked={cur.role === k} disabled={readOnly} onClick={() => setU(sel, k === 'PG' ? { ...PLANE_GUARD } : { ...cur, role: k })} style={segB(cur.role === k, { height: 26, fontSize: 11.5 })}>
                      {ROLE_LABEL[k]}
                    </button>
                  ))}
                </div>
                {cur.role === 'PG' && <div className="mono" style={{ fontSize: 10.5, color: '#6B7683', marginTop: 4 }}>Plane guard station: 170R at 4,000 yd, astern on the final bearing</div>}
              </div>
              {fields.map((fl) => (
                <div key={fl.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>{fl.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button disabled={readOnly} onClick={fl.dn} aria-label={`${fl.label} down`} style={{ ...btn, width: 34, height: 30, padding: 0, fontSize: 18 }}>
                      −
                    </button>
                    <span style={dig}>{fl.v}</span>
                    <button disabled={readOnly} onClick={fl.up} aria-label={`${fl.label} up`} style={{ ...btn, width: 34, height: 30, padding: 0, fontSize: 18 }}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid #262F3A' }}>
          <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0', alignSelf: 'center' }}>Bearings relative to the formation axis · drag a station to move it, its grips to reshape it · Apply makes the shown preset active</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={btn}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button onClick={() => onApply({ active: pre, presets: all })} style={{ ...btn, background: '#F15822', borderColor: '#F15822', color: '#0E1116', fontWeight: 700 }}>
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
