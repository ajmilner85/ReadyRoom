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
    padding: '14px 10px',
    backgroundColor: 'var(--rr-panel2)',
    border: '1px solid var(--rr-border)',
    borderRadius: '8px',
    textAlign: 'center'
  }}>
    <div style={{ fontSize: '28px', fontWeight: 700, color: value === null ? 'var(--rr-text3)' : (valueColor || 'var(--rr-text)'), lineHeight: '32px' }}>
      {value === null ? '—' : value}
    </div>
    <div style={{
      fontSize: '11px',
      fontWeight: 500,
      color: 'var(--rr-text2)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginTop: '6px'
    }}>
      {label}
    </div>
    {note && (
      <div style={{ fontSize: '10px', color: 'var(--rr-text3)', marginTop: '2px', fontStyle: 'italic' }}>
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
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible', containerType: 'inline-size' }}>
        {loading ? (
          <div style={{ color: 'var(--rr-text2)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Loading statistics...
          </div>
        ) : (
          <div className="rr-stat-grid-6">
            <StatTile label="A2A Kills" value={stats?.a2aKills ?? 0} />
            <StatTile label="A2G Kills" value={stats?.a2gKills ?? 0} />
            <StatTile label="A2S Kills" value={stats?.a2sKills ?? 0} />
            <StatTile label="Friendly Kills" value={stats?.friendlyKills ?? 0} valueColor="var(--rr-info)" />
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
