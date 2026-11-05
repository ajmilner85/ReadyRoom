import React from 'react';
import { ChevronDown } from 'lucide-react';
import QualificationBadge from '../ui/QualificationBadge';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import type { DossierProfile, DossierPilotOption } from '../../utils/dossierService';

interface DossierDetailsCardProps {
  callsign: string;
  boardNumber: string | number;
  discordUsername?: string | null;
  profile: DossierProfile | null;
  loading: boolean;
  // Pilot picker — only rendered when the viewer may see more than their own dossier
  viewablePilots: DossierPilotOption[];
  selectedPilotId: string;
  onSelectPilot: (pilotId: string) => void;
}

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  padding: '8px 0',
  borderBottom: '1px solid var(--rr-border)'
};

const fieldRowLabelStyle: React.CSSProperties = {
  width: '160px',
  flexShrink: 0,
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--rr-text2)'
};

const DossierDetailsCard: React.FC<DossierDetailsCardProps> = ({
  callsign,
  boardNumber,
  discordUsername,
  profile,
  loading,
  viewablePilots,
  selectedPilotId,
  onSelectPilot
}) => {
  // Group picker options by squadron designation, sorted by board number
  const pilotGroups = viewablePilots.reduce<Record<string, DossierPilotOption[]>>((groups, pilot) => {
    const label = pilot.squadronDesignation || 'No Squadron';
    if (!groups[label]) groups[label] = [];
    groups[label].push(pilot);
    return groups;
  }, {});
  Object.values(pilotGroups).forEach(group => {
    group.sort((a, b) =>
      String(a.boardNumber).localeCompare(String(b.boardNumber), undefined, { numeric: true })
    );
  });
  const renderField = (label: string, value: React.ReactNode) => (
    <div style={fieldRowStyle}>
      <span style={fieldRowLabelStyle}>{label}</span>
      <span style={dossierStyles.fieldValue}>{value || '—'}</span>
    </div>
  );

  const enrollmentStatusChip = (status: string | null) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      active: { bg: 'var(--rr-accent-weak)', fg: 'var(--rr-accent-text)' },
      graduated: { bg: 'rgba(64,168,91,.14)', fg: 'var(--rr-good)' },
      completed: { bg: 'rgba(64,168,91,.14)', fg: 'var(--rr-good)' },
      withdrawn: { bg: 'var(--rr-panel2)', fg: 'var(--rr-text2)' }
    };
    const style = colors[(status || '').toLowerCase()] || { bg: 'var(--rr-panel2)', fg: 'var(--rr-text2)' };
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 8px',
        height: '20px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.fg,
        textTransform: 'capitalize'
      }}>
        {status || 'Unknown'}
      </span>
    );
  };

  return (
    <div style={{ ...dossierStyles.card, flex: 1 }}>
      <div style={dossierStyles.cardHeader}>
        <span style={dossierStyles.cardHeaderText}>Pilot Details</span>
      </div>
      <div style={dossierStyles.cardContent}>
        {viewablePilots.length > 1 && (
          <div style={{ position: 'relative', width: '320px', marginBottom: '16px' }}>
            <select
              value={selectedPilotId}
              onChange={(e) => onSelectPilot(e.target.value)}
              style={dossierStyles.selector}
            >
              {Object.entries(pilotGroups).map(([groupLabel, pilots]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {pilots.map(pilot => (
                    <option key={pilot.id} value={pilot.id}>
                      {pilot.boardNumber} {pilot.callsign}
                    </option>
                  ))}
                </optgroup>
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
        )}

        {loading ? (
          <div style={dossierStyles.emptyState}>Loading pilot details...</div>
        ) : (
          <>
            {/* Identity header — mirrors the Roster Management details header */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--rr-text)',
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px',
                margin: 0
              }}>
                <span style={{ fontWeight: 400, color: 'var(--rr-text2)' }}>{boardNumber}</span>
                {callsign}
              </h2>
              {profile?.roleName && (
                <span style={{ fontSize: '18px', fontWeight: 400, color: 'var(--rr-text2)' }}>
                  {profile.roleName}{profile.roleIsActing ? ' (Acting)' : ''}
                </span>
              )}
            </div>

            {/* Squadron block */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              backgroundColor: 'var(--rr-panel2)',
              border: '1px solid var(--rr-border)',
              borderRadius: '8px',
              marginBottom: '8px'
            }}>
              {profile?.squadron?.insignia_url ? (
                <div style={{
                  width: '64px',
                  height: '64px',
                  flexShrink: 0,
                  backgroundImage: `url(${profile.squadron.insignia_url})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center'
                }} />
              ) : (
                <div style={{
                  width: '64px',
                  height: '64px',
                  flexShrink: 0,
                  borderRadius: '50%',
                  backgroundColor: 'var(--rr-panel3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--rr-text2)',
                  fontSize: '12px'
                }}>
                  N/A
                </div>
              )}
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)' }}>
                  {profile?.squadron?.designation || 'No Squadron Assignment'}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--rr-text2)' }}>
                  {profile?.squadron?.name || ''}
                </div>
              </div>
            </div>

            {renderField('Status', profile?.statusName)}
            {renderField('Standing', profile?.standingName)}
            {renderField('Role', profile?.roleName ? `${profile.roleName}${profile?.roleIsActing ? ' (Acting)' : ''}` : null)}
            {renderField('Discord Username', discordUsername)}

            {/* Qualifications */}
            <div style={dossierStyles.sectionLabel}>Qualifications</div>
            {profile && profile.qualifications.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {profile.qualifications.map(qual => (
                  <div key={qual.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <QualificationBadge
                      type={qual.name}
                      code={qual.code || undefined}
                      color={qual.color || undefined}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--rr-text)', flex: 1 }}>{qual.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--rr-text3)' }}>
                      {formatDossierDate(qual.achieved_date)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--rr-text3)', fontStyle: 'italic' }}>No qualifications recorded</div>
            )}

            {/* Training Enrollments */}
            <div style={dossierStyles.sectionLabel}>Training Enrollments</div>
            {profile && profile.enrollments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {profile.enrollments.map(enrollment => (
                  <div key={enrollment.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--rr-text)', flex: 1 }}>{enrollment.cycleName}</span>
                    {enrollmentStatusChip(enrollment.status)}
                    <span style={{ fontSize: '12px', color: 'var(--rr-text3)' }}>
                      {formatDossierDate(enrollment.enrolledAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--rr-text3)', fontStyle: 'italic' }}>No training enrollments</div>
            )}

            {/* Teams */}
            <div style={dossierStyles.sectionLabel}>Teams</div>
            {profile && profile.teams.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {profile.teams.map(team => (
                  <span key={team.id} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    height: '24px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: 'rgba(64,168,91,.14)',
                    color: 'var(--rr-good)',
                    border: '1px solid var(--rr-good)'
                  }}>
                    {team.name}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--rr-text3)', fontStyle: 'italic' }}>No team memberships</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DossierDetailsCard;
