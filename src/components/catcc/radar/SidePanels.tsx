/**
 * Right-sidebar sections that only some seats show: deck status (Final, Approach, CATCC), radar
 * donors (CDC). The Bridge's helm is in ../bridge/Helm.tsx.
 */
import React from 'react';
import type { Picture, ScopeTrack } from '../scopeModel.ts';
import type { Side } from '../../../catcc/core/tracks/trackStore.ts';
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

// ---------------------------------------------------------------- intercepts (CDC)

const aclbl = (t?: ScopeTrack) => (t ? t.bd ?? t.cs ?? t.pi ?? t.id : '—');
const r3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) % 360).padStart(3, '0');

const ibtn = (label: string, onClick: () => void, color: string, disabled?: boolean) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="mono"
    style={{ fontSize: 10, letterSpacing: '.06em', padding: '2px 7px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${color}`, background: 'transparent', color, opacity: disabled ? 0.4 : 1 }}
  >
    {label}
  </button>
);

/**
 * CDC intercept manager: the working (locked) and committed interceptor→target pairs with commit /
 * clear, plus the bogey / hostile / unknown contacts so the controller sees which remain untargetted.
 */
export const InterceptPanel: React.FC<{
  air: ScopeTrack[];
  focusSide: Side;
  /** every aircraft covered by an intercept (whole targeted elements), for the untargetted tracker */
  covered: Set<string>;
  committed: Record<string, string>;
  locks: Record<string, string>;
  onCommit: (interceptor: string, target: string) => void;
  onClearLock: (interceptor: string) => void;
  onClear: (interceptor: string) => void;
  onGoTo?: (p: [number, number]) => void;
  readOnly?: boolean;
}> = ({ air, focusSide, covered, committed, locks, onCommit, onClearLock, onClear, onGoTo, readOnly }) => {
  const byId = new Map(air.map((t) => [t.id, t]));
  const rows = [
    ...Object.entries(locks).map(([i, t]) => ({ i, t, done: false })),
    ...Object.entries(committed).filter(([i]) => !(i in locks)).map(([i, t]) => ({ i, t, done: true })),
  ];
  const targeted = covered;
  // bogey / hostile / unknown = airborne contacts not on the friendly side
  const threats = air.filter((t) => t.sd !== focusSide && t.air !== false && (t.gs ?? 0) > 40).sort((a, b) => a.rng - b.rng);
  const untargetted = threats.filter((t) => !targeted.has(t.id)).length;
  return (
    <section className="pnl" aria-label="Intercepts" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="lbl">Intercepts</span>
        <span className="mono" style={{ fontSize: 10.5, color: '#93A1B0' }}>{rows.length}</span>
      </div>
      {rows.length === 0 && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No intercepts — hook an interceptor, click a contact</div>}
      {rows.map(({ i, t, done }) => {
        const itor = byId.get(i);
        const tgt = byId.get(t);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
            <span
              onClick={() => itor && onGoTo?.(itor.p as [number, number])}
              style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onGoTo ? 'pointer' : 'default' }}
            >
              <span style={{ color: '#E6EDF3' }}>{aclbl(itor)}</span>
              <span style={{ color: '#6B7683' }}> → </span>
              <span style={{ color: '#F2B3F5' }}>{aclbl(tgt)}</span>
              {!done && <span className="mono" style={{ fontSize: 9.5, color: '#E7B04F', marginLeft: 6, letterSpacing: '.08em' }}>LOCKED</span>}
            </span>
            {!readOnly && (
              <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                {!done && ibtn('COMMIT', () => onCommit(i, t), '#7FD397')}
                {ibtn('CLEAR', () => (done ? onClear(i) : onClearLock(i)), '#93A1B0')}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 10, color: '#93A1B0', letterSpacing: '.08em' }}>BOGEY / HOSTILE / UNKNOWN</span>
        <span className="mono" style={{ fontSize: 10.5, color: untargetted ? '#E7B04F' : '#7FD397' }}>{untargetted} untargetted</span>
      </div>
      {threats.length === 0 && <div className="mono" style={{ fontSize: 11.5, color: '#6B7683' }}>No threat contacts</div>}
      {threats.map((t) => {
        const on = targeted.has(t.id);
        return (
          <div
            key={t.id}
            onClick={() => onGoTo?.(t.p as [number, number])}
            style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 8, alignItems: 'baseline', cursor: onGoTo ? 'pointer' : 'default', opacity: on ? 0.5 : 1 }}
          >
            <span className="mono" style={{ fontSize: 11, color: on ? '#7FD397' : '#E7B04F' }}>{on ? '✓' : '•'}</span>
            <span style={{ fontSize: 12.5, color: t.sd === 'red' ? '#FF9C98' : '#C9D3DD', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aclbl(t)}</span>
            <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{r3(t.brg)}/{Math.round(t.rng)}</span>
          </div>
        );
      })}
    </section>
  );
};

