/**
 * Right-sidebar sections that only some seats show: deck status (Final, Approach, CATCC), radar
 * donors (CDC) and the helm (Bridge).
 */
import React, { useState } from 'react';
import { distanceNm, norm360 } from '../../../catcc/core/geo.ts';
import { nextPimTurn, pimAt } from '../../../catcc/core/env/weather.ts';
import type { RoutePoint } from '../../../catcc/core/dcs/hookProtocol.ts';
import type { Carrier, Picture } from '../scopeModel.ts';
import { intoWind, windOverDeck } from '../../../catcc/core/env/wod.ts';
import { deckStatus } from '../prifly/BossView.tsx';
import type { RadarDonor } from './types.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const KT_PER_MS = 1 / 0.514444;
const hhmm = (s: number, dayStart?: number) => {
  const t = (((dayStart ?? 0) + s) % 86400 + 86400) % 86400;
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}`;
};
const row = (k: string, v: React.ReactNode, c = '#E6EDF3') => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
    <span className="mono" style={{ color: '#93A1B0', fontSize: 11 }}>{k}</span>
    <span className="mono" style={{ color: c, textAlign: 'right' }}>{v}</span>
  </div>
);

// ---------------------------------------------------------------- deck status

export const DeckPanel: React.FC<{ pic: Picture }> = ({ pic }) => {
  const st = deckStatus(pic);
  if (!st) return null;
  const foul = st.foul.length > 0;
  return (
    <section className="pnl" aria-label="Deck status" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="lbl">Deck</span>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{st.jets.length} aboard</span>
      </div>
      <div style={{ padding: '8px 10px', borderRadius: 5, textAlign: 'center', background: foul ? 'rgba(224,82,78,.2)' : 'rgba(64,168,91,.2)', border: `1px solid ${foul ? '#E0524E' : '#40A85B'}`, color: foul ? '#FF9C98' : '#8FE0A6', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, letterSpacing: '.12em' }}>
        {foul ? 'FOUL DECK' : 'CLEAR DECK'}
      </div>
      {foul && row('Landing area', st.foul.map((j) => j.t.bd ?? j.t.cs ?? j.t.id).join(' '), '#FF9C98')}
      {['1', '2', '3', '4'].map((k) => <React.Fragment key={k}>{row(`Cat ${k}`, st.cats[k] ? `${st.cats[k]!.t.bd ?? st.cats[k]!.t.id} spotted` : 'open', st.cats[k] ? '#E7B04F' : '#7FD397')}</React.Fragment>)}
    </section>
  );
};

// ---------------------------------------------------------------- radar donors

export const DonorsPanel: React.FC<{ donors: RadarDonor[]; alt: number }> = ({ donors, alt }) => (
  <section className="pnl" aria-label="Radar donors" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="lbl">Radar donors</span>
      <span className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>COVERAGE · 100 FT / {alt >= 1000 ? `${alt / 1000}K` : alt} FT</span>
    </div>
    {donors.map((d) => (
      <div key={d.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: '#E7C66B' }}>{d.name}</span> <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{d.radar}</span>
        </span>
        <span className="mono" style={{ fontSize: 11.5, color: '#C9D3DD' }}>
          {Math.round(d.covLow)} / {Math.round(d.cov)} NM
        </span>
      </div>
    ))}
    {!donors.length && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No friendly radars</div>}
  </section>
);

// ---------------------------------------------------------------- helm

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
  const kt = t?.gs ?? 0;
  const [draft, setDraft] = useState<{ crs: string; kt: string } | null>(null);
  const d = draft ?? { crs: ordered ? r3(ordered.crs) : r3(crs), kt: String(Math.round(ordered?.kt ?? kt)) };
  const dCrs = Number(d.crs);
  const dKt = Number(d.kt);
  const valid = d.crs !== '' && d.kt !== '' && Number.isFinite(dCrs) && dCrs >= 0 && dCrs < 360 && Number.isFinite(dKt) && dKt >= 0 && dKt <= 35;
  const wx = t?.wx;
  const wod = wx?.d0 != null && wx.s0 != null ? windOverDeck(crs, kt, wx.d0, wx.s0) : null;
  const fb = carrier?.ship.fb ?? 0;
  const wodAng = wod ? Math.round(((wod.from - fb + 540) % 360) - 180) : 0;
  const into = wx?.d0 != null && wx.s0 != null ? intoWind(wx.d0, wx.s0) : null;
  // PIM: where the ship should be now, how far it is from there, and the next planned turn
  const pim = route && t ? pimAt(route, nowS) : null;
  const pimNm = pim && t ? distanceNm(t.lat, t.lon, pim.lat, pim.lon) : null;
  const turn = route ? nextPimTurn(route, nowS) : null;
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0E1116', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 };
  const step = (k: 'crs' | 'kt', by: number) => {
    const v = k === 'crs' ? norm360((Number.isFinite(dCrs) ? dCrs : crs) + by) : Math.max(0, Math.min(35, (Number.isFinite(dKt) ? dKt : kt) + by));
    setDraft({ ...d, [k]: k === 'crs' ? r3(v) : String(Math.round(v)) });
  };
  const stepBtn = (k: 'crs' | 'kt', by: number) => (
    <button disabled={readOnly} onClick={() => step(k, by)} aria-label={`${k === 'crs' ? 'Course' : 'Speed'} ${by > 0 ? '+' : ''}${by}`} style={{ height: 28, minWidth: 34, border: '1px solid #374250', borderRadius: 4, background: '#1A212A', color: '#E6EDF3', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, cursor: readOnly ? 'default' : 'pointer' }}>
      {by > 0 ? '+' : ''}
      {by}
    </button>
  );
  return (
    <section className="pnl" aria-label="Helm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="lbl">Helm</span>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{t?.hull ?? ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0', letterSpacing: '.08em' }}>COURSE</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{r3(crs)}°</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: '#93A1B0', letterSpacing: '.08em' }}>SPEED</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{Math.round(kt)} KT</div>
        </div>
      </div>

      <div style={{ height: 1, background: '#262F3A' }} />
      <div className="lbl" style={{ fontSize: 10 }}>Order</div>
      <label style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>Course °T</span>
        <input aria-label="Ordered course" disabled={readOnly} value={d.crs} inputMode="numeric" onChange={(e) => setDraft({ ...d, crs: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} style={inp} />
      </label>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {[-10, -1, 1, 10].map((b) => <React.Fragment key={b}>{stepBtn('crs', b)}</React.Fragment>)}
      </div>
      <label style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>Speed kt</span>
        <input aria-label="Ordered speed" disabled={readOnly} value={d.kt} inputMode="numeric" onChange={(e) => setDraft({ ...d, kt: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })} style={inp} />
      </label>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {[-5, -1, 1, 5].map((b) => <React.Fragment key={b}>{stepBtn('kt', b)}</React.Fragment>)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {into && (
          <button
            disabled={readOnly}
            title={`Course and speed for 30 kt of wind down the angled deck: ${r3(into.crs)}° at ${into.kt} kt`}
            onClick={() => setDraft({ crs: r3(into.crs), kt: String(into.kt) })}
            style={{ flex: 1, height: 32, border: '1px solid #374250', borderRadius: 5, background: '#222C37', color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: readOnly ? 'default' : 'pointer' }}
          >
            Into the wind
          </button>
        )}
        <button
          disabled={readOnly || !valid}
          onClick={() => {
            onOrder({ crs: Math.round(dCrs) % 360, kt: Math.round(dKt) });
            setDraft(null);
          }}
          style={{ flex: 1, height: 32, border: '1px solid #F15822', borderRadius: 5, background: readOnly || !valid ? 'transparent' : '#F15822', color: readOnly || !valid ? '#93A1B0' : '#0E1116', fontFamily: "'Saira', sans-serif", fontWeight: 600, fontSize: 12.5, cursor: readOnly || !valid ? 'default' : 'pointer' }}
        >
          Order
        </button>
      </div>
      {ordered && row('Ordered', `${r3(ordered.crs)}° · ${ordered.kt} KT`, Math.abs(((ordered.crs - crs + 540) % 360) - 180) > 2 || Math.abs(ordered.kt - kt) > 1.5 ? '#E7B04F' : '#7FD397')}
      <div className="mono" style={{ fontSize: 10.5, color: '#6B7683' }}>Orders are shared with the room; the DCS hook doesn't steer the ship yet.</div>

      <div style={{ height: 1, background: '#262F3A' }} />
      <div className="lbl" style={{ fontSize: 10 }}>Wind over deck</div>
      {wod ? (
        <>
          {row('Relative', `${r3(wod.from)}° / ${Math.round(wod.kt)} KT`)}
          {row('To the angle', `${Math.abs(wodAng)}° ${wodAng >= 0 ? 'STBD' : 'PORT'}`, Math.abs(wodAng) <= 5 ? '#7FD397' : Math.abs(wodAng) <= 15 ? '#E7B04F' : '#FF9C98')}
          {row('True wind', `${r3(wx!.d0!)}° / ${Math.round(wx!.s0! * KT_PER_MS)} KT`, '#C9D3DD')}
        </>
      ) : (
        <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No wind data</div>
      )}

      <div style={{ height: 1, background: '#262F3A' }} />
      <div className="lbl" style={{ fontSize: 10 }}>PIM</div>
      {pim ? (
        <>
          {row('From PIM', pimNm != null ? `${pimNm.toFixed(1)} NM` : '—', pimNm != null && pimNm > 5 ? '#E7B04F' : '#E6EDF3')}
          {pim.crs != null && row('PIM course', `${r3(pim.crs)}°`)}
          {turn && row('Next turn', `${r3(turn.brc)}° at ${hhmm(turn.etaS, dayStart)}`)}
        </>
      ) : (
        <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No planned route</div>
      )}
    </section>
  );
};
