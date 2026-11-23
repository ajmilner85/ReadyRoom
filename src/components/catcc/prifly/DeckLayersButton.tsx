/**
 * The flight deck's Layers button and its panel, overlaid in the deck frame's top right corner as the
 * radar puts its layers button on the scope (Scope.tsx): the radar displays' layers button, and the
 * single-column layers panel of the Approach / Final display (FinalView.tsx) under it.
 */
import React, { useState } from 'react';
import { IcLayers } from '../icons.tsx';
import { DECK_LAYER_ITEMS, type DeckToggle } from './deckLayers.ts';

export const DeckLayersButton: React.FC<{
  ov: Record<DeckToggle, boolean>;
  onToggle: (k: DeckToggle) => void;
  onReset: () => void;
}> = ({ ov, onToggle, onReset }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button className="tbtn" aria-label="Layers" title="Layers" aria-expanded={open} onClick={() => setOpen(!open)} style={{ background: open ? '#3D2521' : 'rgba(21,26,33,.96)', color: open ? '#FFB08F' : '#E6EDF3', borderColor: '#374250' }}>
        <IcLayers />
      </button>
      {open && (
        <section aria-label="Layers" style={{ width: 260, background: 'rgba(21,26,33,.97)', border: '1px solid #374250', borderRadius: 8, padding: 10, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="lbl">Layers</span>
            <button onClick={onReset} title="Restore the default layers" style={{ background: '#222C37', color: '#E6EDF3', border: '1px solid #374250', borderRadius: 4, padding: '3px 8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, cursor: 'pointer' }}>
              Reset
            </button>
          </div>
          {DECK_LAYER_ITEMS.map(([k, l, c]) => (
            <div key={k} className="lrow" style={{ gridTemplateColumns: 'minmax(0, 1fr) 52px', color: ov[k] ? '#E6EDF3' : '#93A1B0' }}>
              <span style={{ paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
              <button className="lcb" onClick={() => onToggle(k)} aria-pressed={ov[k]} aria-label={l}>
                <span style={{ borderColor: c, background: ov[k] ? c : 'transparent' }} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
