import React from 'react';
import { dossierStyles } from './dossierStyles';
import type { DossierStats } from '../../utils/dossierService';

interface DossierStatsCardProps {
  stats: DossierStats | null;
  loading: boolean;
}

interface StatTileProps {
  label: string;
  value: number | string | null;
  note?: string;
  valueColor?: string;
}

const StatTile: React.FC<StatTileProps> = ({ label, value, note, valueColor }) => (
  <div style={{
    padding: '16px',
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    textAlign: 'center'
  }}>
    <div style={{ fontSize: '28px', fontWeight: 700, color: value === null ? '#CBD5E1' : (valueColor || '#0F172A'), lineHeight: '32px' }}>
      {value === null ? '—' : value}
    </div>
    <div style={{
      fontSize: '11px',
      fontWeight: 500,
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginTop: '6px'
    }}>
      {label}
    </div>
    {note && (
      <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px', fontStyle: 'italic' }}>
        {note}
      </div>
    )}
  </div>
);

const DossierStatsCard: React.FC<DossierStatsCardProps> = ({ stats, loading }) => {
  return (
    <div style={{ ...dossierStyles.card, flexShrink: 0 }}>
      <div style={dossierStyles.cardHeader}>
        <span style={dossierStyles.cardHeaderText}>Statistics</span>
      </div>
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible' }}>
        {loading ? (
          <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Loading statistics...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '12px'
          }}>
            <StatTile label="A2A Kills" value={stats?.a2aKills ?? 0} />
            <StatTile label="A2G Kills" value={stats?.a2gKills ?? 0} />
            <StatTile label="A2S Kills" value={stats?.a2sKills ?? 0} />
            <StatTile label="Friendly Kills" value={stats?.friendlyKills ?? 0} valueColor="#2563EB" />
            <StatTile label="Cruises Completed" value={stats?.cruisesCompleted ?? 0} />
            <StatTile
              label="Survival Rate"
              value={stats?.survivalRate != null ? `${Math.round(stats.survivalRate * 100)}%` : null}
              note={stats?.survivalRate == null ? 'No AAR outcomes in scope' : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DossierStatsCard;
