import React, { useEffect } from 'react';
import { LOCATIONS, seatsAt, type SeatLayout } from './seats.ts';

/** Shell options: how the ship's locations are divided into seats. */
export const OptionsDialog: React.FC<{ layout: SeatLayout; onLayout: (l: SeatLayout) => void; onClose: () => void }> = ({ layout, onLayout, onClose }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const opt = (l: SeatLayout, title: string, hint: string) => {
    const on = layout === l;
    return (
      <button
        role="radio"
        aria-checked={on}
        onClick={() => onLayout(l)}
        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 6, border: `1px solid ${on ? '#F15822' : '#374250'}`, background: on ? 'rgba(241,88,34,.12)' : '#0E1116', color: '#E6EDF3', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{hint}</span>
        <span style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', rowGap: 3, columnGap: 8, marginTop: 4 }}>
          {LOCATIONS.map((loc) => (
            <React.Fragment key={loc.id}>
              <span className="mono" style={{ fontSize: 11, color: '#93A1B0' }}>{loc.label}</span>
              <span style={{ fontSize: 12, color: '#C9D3DD' }}>{seatsAt(l, loc.id).map((s) => s.label).join(' · ')}</span>
            </React.Fragment>
          ))}
        </span>
      </button>
    );
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: 16 }}>
      <div role="dialog" aria-label="Options" onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 100%)', background: '#151A21', border: '1px solid #374250', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #262F3A' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Options</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 0, color: '#93A1B0', fontSize: 18, cursor: 'pointer' }}>
            ×
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <div className="lbl" style={{ marginBottom: 4 }}>Seats</div>
          <div className="mono" style={{ fontSize: 11, color: '#93A1B0', marginBottom: 10 }}>How each location on the ship is staffed. Each seat keeps its own radar layers and zoom.</div>
          <div role="radiogroup" aria-label="Seat layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {opt('condensed', 'Condensed', 'One seat per location: for small groups')}
            {opt('expanded', 'Expanded', 'A seat per function: for larger groups')}
          </div>
        </div>
      </div>
    </div>
  );
};
