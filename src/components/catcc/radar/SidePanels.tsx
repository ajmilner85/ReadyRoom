/**
 * Right-sidebar sections that only some seats show: deck status (Final, Approach, CATCC), radar
 * donors (CDC). The Bridge's helm is in ../bridge/Helm.tsx.
 */
import React from 'react';
import type { Picture } from '../scopeModel.ts';
import { deckStatus } from '../prifly/deck.ts';
import type { RadarDonor } from './types.ts';

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

