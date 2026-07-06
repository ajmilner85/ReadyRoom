import React from 'react';
import { ChevronDown } from 'lucide-react';
import { dossierStyles } from './dossierStyles';
import type { DossierStats, DossierCycle } from '../../utils/dossierService';

interface DossierStatsCardProps {
  stats: DossierStats | null;
  cycles: DossierCycle[];
  selectedCycleId: string; // '' means career
  onCycleChange: (cycleId: string) => void;
  loading: boolean;
}

interface StatTileProps {
  label: string;
  value: number | string | null;
  note?: string;
}

const StatTile: React.FC<StatTileProps> = ({ label, value, note }) => (
  <div style={{
    padding: '16px',
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    textAlign: 'center'
  }}>
    <div style={{ fontSize: '28px', fontWeight: 700, color: value === null ? '#CBD5E1' : '#0F172A', lineHeight: '32px' }}>
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

const DossierStatsCard: React.FC<DossierStatsCardProps> = ({
  stats,
  cycles,
  selectedCycleId,
  onCycleChange,
  loading
}) => {
  return (
    <div style={{ ...dossierStyles.card, flexShrink: 0 }}>
      <div style={dossierStyles.cardHeader}>
        <span style={dossierStyles.cardHeaderText}>Statistics</span>
      </div>
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible' }}>
        {/* Career / cycle selector */}
        <div style={{ position: 'relative', width: '320px', marginBottom: '16px' }}>
          <select
            value={selectedCycleId}
            onChange={(e) => onCycleChange(e.target.value)}
            style={dossierStyles.selector}
            disabled={loading}
          >
            <option value="">Career (All Time)</option>
            {cycles.map(cycle => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}{cycle.type ? ` (${cycle.type})` : ''}
              </option>
            ))}
          </select>
          <div style={{
            position: 'absolute',
            top: '50%',
            right: '12px',
            transform: 'translateY(-50%)',
            pointerEvents: 'none'
          }}>
            <ChevronDown size={16} color="#64748B" />
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Loading statistics...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px'
          }}>
            <StatTile label="A2A Kills" value={stats?.a2aKills ?? 0} />
            <StatTile label="A2G Kills" value={stats?.a2gKills ?? 0} />
            <StatTile label="A2S Kills" value={stats?.a2sKills ?? 0} />
            <StatTile label="Cruises Completed" value={stats?.cruisesCompleted ?? 0} />
            <StatTile label="Landings" value={null} note="Not yet tracked" />
            <StatTile label="Traps" value={stats?.traps ?? 0} />
            <StatTile label="Night Traps" value={stats?.nightTraps ?? 0} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DossierStatsCard;
