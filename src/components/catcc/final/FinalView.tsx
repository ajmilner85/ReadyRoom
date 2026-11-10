/**
 * CATCC Approach / Final: two precision-approach (PAR-style) displays stacked on one range axis,
 * touchdown on the left, plus deck status, ICLS / ACLS, the bolter slot tool and the arrival
 * sequence. Ported from carrier-ops-handoff-2/mockup/Final.dc.html; live data from the picture.
 */
import React, { useMemo, useState } from 'react';
import type { AclsMode, OpsState, Ownership } from '../../../catcc/core/room/ops.ts';
import { BALL_NM } from '../../../catcc/core/geometry/slot.ts';
import { turnRadiusNm } from '../../../catcc/core/geometry/maneuver.ts';
import { windOverDeck } from '../../../catcc/core/env/wod.ts';
import { HandoffRow } from '../Handoff.tsx';
import { flightKey, ownerOf, type HandoffCtx } from '../ownership.ts';
import { shortType, fuelK, tagRows, type Picture, type ScopeTrack } from '../scopeModel.ts';
import type { DeckCall } from '../deck.ts';
import { bolterSlot, finalPicture, GP_FT_PER_NM, GS_DEG, landingWeightLb, PROFILE, profileAlt, type FinalAc } from './finalModel.ts';

export type ParRange = 6 | 12 | 24;
const AMAX: Record<ParRange, number> = { 6: 1500, 12: 3000, 24: 7000 };
const LMAX: Record<ParRange, number> = { 6: 1.2, 12: 2.6, 24: 4 };
const f1 = (n: number) => n.toFixed(1);
const ms = (t: number) => {
  const n = Math.round(Math.abs(t));
  return `${t < 0 ? '−' : ''}${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const C = { ok: '#7FD397', marginal: '#E7B04F', bad: '#FF8A85' } as const;
const SEG: React.CSSProperties = { display: 'flex', gap: 2, background: '#0E1116', border: '1px solid #262F3A', borderRadius: 6, padding: 2 };
const segBtn = (on: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ border: 0, height: 28, padding: '0 10px', borderRadius: 4, fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer', background: on ? '#222C37' : 'transparent', color: on ? '#E6EDF3' : '#93A1B0', ...extra });
const kv = (k: React.ReactNode, v: React.ReactNode) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: '#93A1B0' }}>{k}</span>
    <span>{v}</span>
  </div>
);

interface Lab {
  x: number;
  y: number;
  tf: string;
  c: string;
  t: string;
}
interface Blip {
  id: string;
  x: number;
  y: number;
  c: string;
  rows: string[];
}

const label = (t: ScopeTrack) => t.bd ?? t.cs ?? t.pi ?? t.id;

export const FinalView: React.FC<{
  pic: Picture;
  ops?: OpsState;
  setOps: (patch: Partial<OpsState>) => void;
  deck: DeckCall | null;
  local?: Date;
  defaultRange: ParRange;
  handoffCtx: HandoffCtx;
  owners: Record<string, Ownership>;
  readOnly: boolean;
}> = ({ pic, ops, setOps, deck, local, defaultRange, handoffCtx, owners, readOnly }) => {
  const [RG, setRG] = useState<ParRange>(defaultRange);
  const [ghost, setGhost] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const fp = useMemo(() => finalPicture(pic), [pic]);
  const hull = pic.focus?.track.hull ?? '';

  const X = (r: number) => 60 + (r / RG) * 920;
  const Ye = (a: number) => 370 - (a / AMAX[RG]) * 330;
  const Ya = (l: number) => 200 + (l / LMAX[RG]) * 170;
  const pc = (x: number, y: number) => [x / 10, y / 4] as const;

  const bolter: FinalAc | undefined = fp ? (fp.bolters.find((b) => b.t.id === pick) ?? fp.bolters[0]) : undefined;
  const slot = fp && bolter ? bolterSlot(fp, bolter) : null;
  const tod = (s: number) => {
    if (!local) return '--:--:--';
    const d = new Date(local.getTime() + s * 1000);
    return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };

  // ------------------------------------------------ elevation
  const step = RG === 24 ? 2 : RG === 12 ? 1 : 0.5;
  const lblStep = RG === 24 ? 4 : RG === 12 ? 2 : 1;
  const gsInt = 1200 / GP_FT_PER_NM;
  const DM: [number, string][] = (
    [
      [BALL_NM, '3/4 BALL'],
      [gsInt, 'GS INTCP'],
      [6, 'FINAL'],
      [10, 'DIRTY UP'],
      [20, 'PLATFORM'],
    ] as [number, string][]
  ).filter((d) => d[0] <= RG);
  let eGrid = '';
  for (let r = step; r <= RG + 1e-9; r += step) eGrid += `M${f1(X(r))} 40V370`;
  const altStep = AMAX[RG] > 4000 ? 1000 : 500;
  for (let al = altStep; al < AMAX[RG]; al += altStep) eGrid += `M60 ${f1(Ye(al))}H980`;
  for (const [r] of DM) eGrid += `M${f1(X(r))} 30V375`;
  const gsEnd = Math.min(RG, AMAX[RG] / GP_FT_PER_NM);
  const tanFt = (deg: number) => Math.tan((deg * Math.PI) / 180) * 6076.12;
  const eCl = `M${f1(X(0))} ${f1(Ye(0))}L${f1(X(gsEnd))} ${f1(Ye(gsEnd * GP_FT_PER_NM))}`;
  // ±0.5° tolerance lines, each to where it leaves the scale
  const tolLine = (deg: number) => {
    const r = Math.min(RG, AMAX[RG] / tanFt(deg));
    return `M${f1(X(0))} ${f1(Ye(0))}L${f1(X(r))} ${f1(Ye(r * tanFt(deg)))}`;
  };
  const eTol = tolLine(GS_DEG + 0.5) + tolLine(GS_DEG - 0.5);
  const eProf = 'M' + PROFILE.filter((p) => p[0] <= RG + 9).map((p) => `${f1(X(Math.min(p[0], RG)))} ${f1(Ye(Math.min(profileAlt(Math.min(p[0], RG)), AMAX[RG])))}`).join('L');
  const LIMS: [number, string][] = (
    [
      [6000, 'STACK BASE · A6'],
      [5000, 'PLATFORM · 5,000'],
      [1200, "1,200'"],
    ] as [number, string][]
  ).filter((x) => x[0] < AMAX[RG]);
  const eLim = LIMS.map(([al]) => `M60 ${f1(Ye(al))}H980`).join('');
  const eLab: Lab[] = [];
  for (const [al, t] of LIMS) {
    const p = pc(975, Ye(al));
    eLab.push({ x: p[0], y: p[1], tf: 'translate(-100%, -120%)', c: '#E7B04F', t });
  }
  const topMarks = (into: Lab[]) =>
    DM.forEach(([r, t]) => {
      const p = pc(X(r), 22);
      into.push({ x: p[0], y: p[1], tf: 'translate(-50%, 0)', c: '#C9D3DD', t });
    });
  const rangeMarks = (into: Lab[]) => {
    for (let r = 0; r <= RG; r += lblStep) {
      const p = pc(X(r), 392);
      into.push({ x: p[0], y: p[1], tf: 'translate(-50%, -100%)', c: '#7D8896', t: `${r}${r ? '' : ' NM'}` });
    }
  };
  topMarks(eLab);
  rangeMarks(eLab);

  // ------------------------------------------------ azimuth
  let aGrid = 'M60 200H980';
  for (let r = step; r <= RG + 1e-9; r += step) aGrid += `M${f1(X(r))} 30V370`;
  const aFan = [1, 2, 5]
    .map((dg) => {
      const t = Math.tan((dg * Math.PI) / 180);
      const rr = Math.min(RG, LMAX[RG] / t);
      return `M${f1(X(0))} 200L${f1(X(rr))} ${f1(Ya(-rr * t))}M${f1(X(0))} 200L${f1(X(rr))} ${f1(Ya(rr * t))}`;
    })
    .join('');
  const aCl = `M${f1(X(0))} 200H${f1(X(RG))}`;
  const aLab: Lab[] = [];
  topMarks(aLab);
  for (const [dg, t] of [
    [1, '1°'],
    [2, '2°'],
    [5, '5°'],
  ] as const) {
    const tn = Math.tan((dg * Math.PI) / 180);
    const rr = Math.min(RG, LMAX[RG] / tn);
    const p = pc(X(rr) - 4, Ya(-rr * tn));
    aLab.push({ x: p[0], y: p[1], tf: 'translate(-100%, 2px)', c: '#7D8896', t });
  }
  aLab.push({ x: 0.8, y: 6, tf: 'none', c: '#7D8896', t: 'L' }, { x: 0.8, y: 90, tf: 'none', c: '#7D8896', t: 'R' });
  rangeMarks(aLab);

  // bolter downwind, its window and ghost turns
  let aDw = '';
  let aWin = '';
  const ghosts: Record<'ok' | 'marginal' | 'bad', string> = { ok: '', marginal: '', bad: '' };
  if (ghost && bolter && slot && Math.abs(bolter.f.lat) <= LMAX[RG]) {
    const DW = bolter.f.lat;
    aDw = `M${f1(X(Math.max(0.3, bolter.f.along)))} ${f1(Ya(DW))}H${f1(X(Math.min(RG, 12)))}`;
    if (slot.window) aWin = `M${f1(X(Math.min(RG, slot.window[0])))} ${f1(Ya(DW))}H${f1(X(Math.min(RG, slot.window[1])))}`;
    const bulge = Math.max(0.6, 1.33 * turnRadiusNm(bolter.t.gs ?? 150, 25));
    for (const o of slot.options) {
      if (o.x > RG) continue;
      ghosts[o.cls] += `M${f1(X(o.x))} ${f1(Ya(DW))}C${f1(X(o.x + bulge))} ${f1(Ya(DW))} ${f1(X(o.x + bulge))} 200 ${f1(X(o.x))} 200H${f1(X(BALL_NM))}`;
      const p = pc(X(o.x), Ya(DW));
      // option labels below the downwind (the bolter's own label sits above it)
      aLab.push({ x: p[0], y: p[1], tf: 'translate(-50%, 60%)', c: C[o.cls], t: o.key === 'NOW' ? 'NOW' : o.key.replace(' NM', '') });
    }
  }

  // ------------------------------------------------ blips
  const eBlips: Blip[] = [];
  const aBlips: Blip[] = [];
  // only what is inside the displays' coverage: no contacts pinned to the edges
  const inside = (a: FinalAc) => a.f.along >= 0 && a.f.along <= RG && Math.abs(a.f.lat) <= LMAX[RG] && a.t.alt <= AMAX[RG];
  for (const a of fp?.acs ?? []) {
    if (!inside(a)) continue;
    const t = a.t;
    const c = a.kind === 'bolter' ? '#93A1B0' : a.kind === 'other' ? '#5E6A78' : '#5FD068';
    // the same data tag as the main radar
    const rows = tagRows(t);
    const e = pc(X(a.f.along), Ye(t.alt));
    eBlips.push({ id: t.id, x: e[0], y: e[1], c, rows });
    const z = pc(X(a.f.along), Ya(a.f.lat));
    aBlips.push({ id: t.id, x: z[0], y: z[1], c, rows });
  }

  // ------------------------------------------------ panels
  const shipTrk = pic.focus?.track;
  const wod = shipTrk?.wx?.d0 != null && shipTrk.wx.s0 != null ? windOverDeck(fp?.ship.crs ?? 0, fp?.ship.gs ?? 0, shipTrk.wx.d0, shipTrk.wx.s0) : null;
  const wodAng = wod && fp ? Math.round(((wod.from - fp.fb + 540) % 360) - 180) : 0;
  const next = fp?.arrivals[0];
  const nextW = next ? landingWeightLb(next.t.ty, next.t.lb) : null;
  const aids = { icls: ops?.aids?.icls ?? true, acls: ops?.aids?.acls ?? true, modes: ops?.aids?.modes ?? {} };
  const setAids = (p: Partial<typeof aids>) => setOps({ aids: { ...aids, ...p } });
  const locks = (fp?.arrivals ?? []).filter((a) => lockOf(a, ops));
  const fmOf = (t: ScopeTrack) => pic.formations.find((f) => f.members.some((m) => m.id === t.id));
  const keyOf = (t: ScopeTrack) => {
    const f = fmOf(t);
    return f ? flightKey(f) : t.g || t.id;
  };
  const seq = [...(fp?.arrivals ?? []), ...(fp?.bolters ?? [])].slice(0, 8);
  const foul = !!deck?.foul;

  // slot timeline (s from now, scaled to the latest mark)
  const span = Math.max(240, ...(fp?.arrivals ?? []).map((a) => a.tBall! + 30), ...(slot?.options.map((o) => o.t + 30) ?? []));
  const mx = (t: number) => Math.max(0, Math.min(100, (t / span) * 100));

  const disp = (title: string, grid: string, extra: React.ReactNode, labs: Lab[], blips: Blip[]) => (
    <section aria-label={`${title} display`} style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 8, overflow: 'hidden' }}>
      <span className="lbl" style={{ position: 'absolute', left: 10, top: 8, zIndex: 2 }}>{title}</span>
      <svg className="par" viewBox="0 0 1000 400" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <path d={grid} stroke="rgba(147,161,176,.12)" fill="none" />
        {extra}
      </svg>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {labs.map((l, i) => (
          <span key={i} className="mono" style={{ position: 'absolute', left: `${l.x}%`, top: `${l.y}%`, transform: l.tf, fontSize: 10.5, color: l.c, whiteSpace: 'nowrap', letterSpacing: '.04em' }}>
            {l.t}
          </span>
        ))}
        {blips.map((b) => (
          <React.Fragment key={b.id}>
            <span style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', background: b.c, border: '1px solid rgba(0,0,0,.5)', boxSizing: 'border-box' }} />
            <span className="mono" style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(9px, -18px)', fontSize: 11, lineHeight: '13px', color: '#E6EDF3', background: 'rgba(11,14,18,.72)', padding: '1px 3px', whiteSpace: 'pre' }}>
              {b.rows.map((r, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <br />}
                  {r}
                </React.Fragment>
              ))}
            </span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <main aria-label="Precision approach displays" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="lbl">Range</span>
          <div style={SEG}>
            {([6, 12, 24] as ParRange[]).map((r) => (
              <button key={r} aria-pressed={RG === r} onClick={() => setRG(r)} style={segBtn(RG === r)}>
                {r} NM
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: '#374250' }} />
          <button
            aria-pressed={ghost}
            onClick={() => setGhost(!ghost)}
            disabled={!bolter}
            title={bolter ? 'Ghost turns and the slot window for the bolter' : 'No aircraft on the bolter downwind'}
            style={{ height: 30, padding: '0 12px', border: `1px solid ${ghost && bolter ? '#5FD068' : '#374250'}`, borderRadius: 5, background: ghost && bolter ? 'rgba(95,208,104,.12)' : 'transparent', color: bolter ? '#E6EDF3' : '#5E6A78', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: bolter ? 'pointer' : 'default' }}
          >
            Bolter slot{bolter ? ` · ${label(bolter.t)}` : ''}
          </button>
          {fp && fp.bolters.length > 1 && (
            <select aria-label="Bolter" value={bolter?.t.id ?? ''} onChange={(e) => setPick(e.target.value)} style={{ height: 30, background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              {fp.bolters.map((b) => (
                <option key={b.t.id} value={b.t.id}>
                  {label(b.t)}
                </option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          {fp && (
            <span className="mono" style={{ fontSize: 11.5, color: '#93A1B0' }}>
              FB {String(Math.round(fp.fb)).padStart(3, '0')} · GS {GS_DEG}° · closure {Math.round(fp.vFinal)} KT{bolter ? ` · downwind ${Math.round(bolter.f.alongKt)} KT` : ''}
            </span>
          )}
        </div>
        {disp(
          'Elevation',
          eGrid,
          <>
            <path d={eLim} stroke="rgba(231,176,79,.4)" fill="none" strokeDasharray="6 4" />
            <path d={eProf} stroke="rgba(201,211,221,.45)" fill="none" strokeDasharray="2 4" />
            <path d={eTol} stroke="rgba(95,208,104,.35)" fill="none" />
            <path d={eCl} stroke="#5FD068" strokeWidth="1.6" fill="none" />
          </>,
          eLab,
          eBlips,
        )}
        {disp(
          'Azimuth',
          aGrid,
          <>
            <path d={aFan} stroke="rgba(147,161,176,.28)" fill="none" strokeDasharray="4 4" />
            <path d={aCl} stroke="#5FD068" strokeWidth="1.6" fill="none" />
            {aDw && <path d={aDw} stroke="rgba(147,161,176,.6)" fill="none" strokeDasharray="5 4" />}
            {aWin && <path d={aWin} stroke="#5FD068" strokeWidth="5" strokeOpacity=".45" fill="none" />}
            <path d={ghosts.bad} stroke="#FF8A85" strokeWidth="1.4" fill="none" strokeDasharray="5 4" />
            <path d={ghosts.marginal} stroke="#E7B04F" strokeWidth="1.4" fill="none" strokeDasharray="5 4" />
            <path d={ghosts.ok} stroke="#5FD068" strokeWidth="1.8" fill="none" strokeDasharray="5 4" />
          </>,
          aLab,
          aBlips,
        )}
      </main>

      <aside aria-label="Deck, landing aids and sequence" style={{ flex: '0 0 344px', width: 344, borderLeft: '1px solid #262F3A', background: '#151A21', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, boxSizing: 'border-box', overflowY: 'auto' }}>
        {deck && (
          <section className="pnl" aria-label="Deck status" style={{ borderColor: foul ? '#E0524E' : '#2E5E3A', background: foul ? 'rgba(224,82,78,.08)' : 'rgba(64,168,91,.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="lbl" style={{ color: foul ? '#FF8A85' : '#7FD397' }}>Deck</span>
              {next && <span className="mono" style={{ fontSize: 11.5, color: foul ? '#FF8A85' : '#93A1B0' }}>{`${label(next.t)} 3/4 NM in ${ms(next.tBall!)}`}</span>}
            </div>
            <div className={foul ? 'blink' : undefined} style={{ fontSize: 26, fontWeight: 700, letterSpacing: '.04em', color: foul ? '#FF8A85' : '#7FD397', lineHeight: 1.15 }}>
              {foul ? `FOUL${deck.reason ? ` · ${deck.reason.toUpperCase()}` : ''}` : 'CLEAR'}
            </div>
            {kv('Wind over deck', wod ? `${Math.round(wod.kt)} KT · ${Math.abs(wodAng)}° ${wodAng >= 0 ? 'R' : 'L'} of angle` : '—')}
            {kv('Arresting gear', next ? `${shortType(next.t.ty)} · ${nextW ? nextW.toLocaleString('en-US') : '—'}` : '—')}
            {kv('Lens', `${GS_DEG}° · HTR 13.5 FT`)}
            {!deck.called && <div className="mono" style={{ fontSize: 10.5, color: '#6B7683', marginTop: 4 }}>From the picture · PriFly hasn't called it</div>}
          </section>
        )}

        <section className="pnl" aria-label="Landing aids">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span className="lbl">ICLS</span>
            <div style={SEG}>
              {(['ON', 'OFF'] as const).map((k) => (
                <button key={k} disabled={readOnly} aria-pressed={aids.icls === (k === 'ON')} onClick={() => setAids({ icls: k === 'ON' })} style={segBtn(aids.icls === (k === 'ON'), { height: 24, fontSize: 11 })}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          {kv('Channel · glideslope', `CH 13 · ${GS_DEG}°`)}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}>
            <span className="lbl">ACLS · SPN-46</span>
            <div style={SEG}>
              {(['UP', 'DOWN'] as const).map((k) => (
                <button key={k} disabled={readOnly} aria-pressed={aids.acls === (k === 'UP')} onClick={() => setAids({ acls: k === 'UP' })} style={segBtn(aids.acls === (k === 'UP'), { height: 24, fontSize: 11 })}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          {kv('Link 4', '373.000')}
          {locks.map((a) => {
            const st = lockOf(a, ops)!;
            const key = keyOf(a.t);
            const mode = aids.modes[key] ?? 'II';
            return (
              <div key={a.t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '4px 0' }}>
                <span className="mono" style={{ fontSize: 12 }}>
                  <b>{label(a.t)}</b> <span style={{ color: st === 'LOCK-ON' ? '#7FD397' : '#E7B04F' }}>{st}</span>
                </span>
                <div style={SEG}>
                  {(['I', 'IA', 'II', 'III'] as AclsMode[]).map((m) => (
                    <button key={m} disabled={readOnly} aria-pressed={mode === m} onClick={() => setAids({ modes: { ...aids.modes, [key]: m } })} style={segBtn(mode === m, { height: 24, fontSize: 11, padding: '0 7px' })}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!locks.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683', paddingTop: 4 }}>{aids.acls ? 'No aircraft in ACLS coverage' : 'ACLS down'}</div>}
        </section>

        <section className="pnl" aria-label="Bolter slot">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="lbl">Bolter slot{bolter ? ` · ${label(bolter.t)}` : ''}</span>
            {bolter && <span className="mono" style={{ fontSize: 11.5, color: (bolter.t.lb ?? 99999) < 4500 ? '#E7B04F' : '#93A1B0' }}>STATE {fuelK(bolter.t.lb) || '—'}</span>}
          </div>
          {!bolter || !slot ? (
            <div className="mono" style={{ fontSize: 12, color: '#6B7683' }}>No aircraft on the bolter downwind</div>
          ) : (
            <>
              {slot.window ? (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#7FD397' }}>
                    Turn between {slot.window[0].toFixed(1)}–{slot.window[1].toFixed(1)} NM
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: '#93A1B0', marginBottom: 8 }}>
                    in {ms(slot.inS![0])}–{ms(slot.inS![1])} · 3/4 {tod(slot.ballS![0])}–{tod(slot.ballS![1]).slice(3)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 700, color: '#FF8A85', marginBottom: 8 }}>No slot on this downwind</div>
              )}
              <div style={{ position: 'relative', height: 34, margin: '6px 0 14px', borderTop: '1px solid #374250' }}>
                {(fp?.arrivals ?? []).map((a) => (
                  <React.Fragment key={a.t.id}>
                    <span style={{ position: 'absolute', left: `${mx(a.tBall!)}%`, top: -5, width: 2, height: 10, marginLeft: -1, background: '#E6EDF3' }} />
                    <span className="mono" style={{ position: 'absolute', left: `${mx(a.tBall!)}%`, top: 8, transform: 'translateX(-50%)', fontSize: 10.5, color: '#E6EDF3', whiteSpace: 'nowrap' }}>{label(a.t)}</span>
                  </React.Fragment>
                ))}
                {slot.options.map((o) => (
                  <React.Fragment key={o.key}>
                    <span style={{ position: 'absolute', left: `${mx(o.t)}%`, top: -5, width: 2, height: 10, marginLeft: -1, background: C[o.cls] }} />
                    <span className="mono" style={{ position: 'absolute', left: `${mx(o.t)}%`, top: -20, transform: 'translateX(-50%)', fontSize: 10.5, color: C[o.cls], whiteSpace: 'nowrap' }}>{o.key === 'NOW' ? 'NOW' : o.key.replace(' NM', '')}</span>
                  </React.Fragment>
                ))}
                {slot.ballS && <span style={{ position: 'absolute', left: `${mx(slot.ballS[0])}%`, width: `${Math.max(0.5, mx(slot.ballS[1]) - mx(slot.ballS[0]))}%`, top: -3, height: 6, background: 'rgba(95,208,104,.35)', borderRadius: 2 }} />}
              </div>
              {slot.options.map((o) => (
                <div key={o.key} className="mono" style={{ display: 'grid', gridTemplateColumns: '48px 104px 1fr', gap: 6, fontSize: 12, padding: '3px 0', whiteSpace: 'nowrap' }}>
                  <span style={{ color: C[o.cls], fontWeight: 600 }}>{o.key}</span>
                  <span>3/4 {tod(o.t)}</span>
                  <span style={{ color: C[o.cls] }}>
                    {o.gapAhead < 0 ? `${ms(-o.gapAhead)} ahead of ${o.ahead}` : o.gapBehind < 0 ? `${ms(-o.gapBehind)} behind ${o.behind}` : `${Number.isFinite(o.gapAhead) ? `+${ms(o.gapAhead)}` : '—'} / ${Number.isFinite(o.gapBehind) ? `−${ms(o.gapBehind)}` : '—'}`}
                  </span>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="pnl" aria-label="Sequence">
          <div className="lbl" style={{ marginBottom: 6 }}>Sequence</div>
          {seq.map((a) => {
            const t = a.t;
            // pattern traffic (arrivals, bolters) belongs to Approach / Final, whatever its sortie phase
            const v = ownerOf(keyOf(t), hull, 'approach', Math.max(0, a.f.along), handoffCtx.layout, owners);
            const where = a.kind === 'bolter' ? 'BOLTER · DOWNWIND' : a.f.along <= 12 ? `3/4 in ${ms(a.tBall!)}` : `${a.f.along.toFixed(1)} NM · 3/4 in ${ms(a.tBall!)}`;
            const low = (t.lb ?? 99999) < 4500;
            return (
              <div key={t.id} style={{ padding: '6px 8px', marginTop: 4, border: `1px solid ${v.pending ? '#E7B04F' : '#262F3A'}`, borderRadius: 5, background: '#1A212A' }}>
                <div className="mono" style={{ fontSize: 12 }}>
                  <div>
                    <b>{label(t)}</b> <span style={{ color: '#93A1B0' }}>{t.cs ?? shortType(t.ty)}</span> <span style={{ color: low ? '#E7B04F' : '#E6EDF3' }}>{fuelK(t.lb)}</span>
                  </div>
                  <div style={{ color: '#93A1B0' }}>{where}</div>
                </div>
                <HandoffRow v={v} ctx={handoffCtx} />
              </div>
            );
          })}
          {!seq.length && <div className="mono" style={{ fontSize: 12, color: '#6B7683' }}>No arrivals</div>}
        </section>
      </aside>
    </div>
  );
};

/** ACLS status for an arrival: lock-on inside 8 NM on centreline, acquiring to 10 NM. */
function lockOf(a: FinalAc, ops?: OpsState): 'LOCK-ON' | 'ACQUIRING' | null {
  if (ops?.aids?.acls === false || a.kind !== 'final') return null;
  const offDeg = Math.abs((Math.atan2(a.f.lat, Math.max(0.05, a.f.along)) * 180) / Math.PI);
  if (a.f.along <= 8 && offDeg < 3) return 'LOCK-ON';
  if (a.f.along <= 10 && offDeg < 6) return 'ACQUIRING';
  return null;
}
