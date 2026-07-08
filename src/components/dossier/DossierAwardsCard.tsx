import React from 'react';
import { Medal } from 'lucide-react';
import { dossierStyles } from './dossierStyles';

/**
 * Placeholder — the awards system is not implemented yet. This card reserves
 * the section so the dossier layout is complete.
 */
const DossierAwardsCard: React.FC = () => {
  return (
    <div style={{ ...dossierStyles.card, flexShrink: 0 }}>
      <div style={dossierStyles.cardHeader}>
        <span style={dossierStyles.cardHeaderText}>Awards</span>
      </div>
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '24px 0',
          color: '#94A3B8'
        }}>
          <Medal size={40} style={{ color: '#D1D5DB' }} />
          <div style={{ fontSize: '14px', color: '#64748B' }}>No awards recorded yet</div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            The awards and decorations system is coming soon.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DossierAwardsCard;
