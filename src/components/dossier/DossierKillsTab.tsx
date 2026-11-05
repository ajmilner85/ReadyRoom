import React from 'react';
import { Icon } from '../ui/primitives';
import { formatDossierDate } from './dossierStyles';
import type { DossierMissionKills } from '../../utils/dossierService';

interface DossierKillsTabProps {
  kills: DossierMissionKills[]; // already scope-filtered, most recent first
  loading: boolean;
}

// Kill category colors copied from the AAR category headers
// (debriefing/EnhancedKillTrackingCard.tsx categoryColors)
const CATEGORY_CHIP: Record<string, { bg: string; fg: string }> = {
  'A2A': { bg: 'var(--rr-accent)', fg: '#FFFFFF' },
  'A2G': { bg: 'var(--rr-good)', fg: '#FFFFFF' },
  'A2S': { bg: '#222A35', fg: '#FFFFFF' }
};

const DEFAULT_CHIP = { bg: '#64748B', fg: '#FFFFFF' };

const DossierKillsTab: React.FC<DossierKillsTabProps> = ({ kills, loading }) => {
  if (loading) {
    return (
      <div style={{ color: 'var(--rr-text2)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
        Loading kill records...
      </div>
    );
  }

  if (kills.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: 'var(--rr-text3)',
        textAlign: 'center'
      }}>
        <Icon name="crosshair" size={40} style={{ color: 'var(--rr-text3)' }} />
        <div style={{ fontSize: '14px', color: 'var(--rr-text2)' }}>No kills recorded in the selected scope</div>
        <div style={{ fontSize: '12px', color: 'var(--rr-text3)', maxWidth: '360px' }}>
          Kills recorded in mission debriefs will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {kills.map(mission => (
        <div
          key={mission.missionId}
          style={{ padding: '10px 0', borderBottom: '1px solid var(--rr-border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--rr-text3)', width: '90px', flexShrink: 0 }}>
              {formatDossierDate(mission.date)}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--rr-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {mission.missionName}
            </span>
            {mission.eventName && mission.eventName !== mission.missionName && (
              <span style={{
                fontSize: '12px',
                color: 'var(--rr-text3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {mission.eventName}
              </span>
            )}
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            margin: '6px 0 0 102px'
          }}>
            {mission.kills.map((kill, index) => {
              // Friendly-fire kills get a blue-outline bubble instead of a
              // solid category chip
              if (kill.isFriendly) {
                return (
                  <span
                    key={`${kill.label}-friendly-${index}`}
                    title="Friendly fire"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      height: '22px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--rr-accent-weak)',
                      border: '1px solid var(--rr-accent)',
                      color: 'var(--rr-accent-text)'
                    }}
                  >
                    {kill.count} × {kill.label}
                  </span>
                );
              }
              const chip = (kill.category && CATEGORY_CHIP[kill.category]) || DEFAULT_CHIP;
              return (
                <span
                  key={`${kill.label}-${kill.category}-${index}`}
                  title={kill.category ? `${kill.category} kill` : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    height: '22px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: chip.bg,
                    color: chip.fg
                  }}
                >
                  {kill.count} × {kill.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DossierKillsTab;
