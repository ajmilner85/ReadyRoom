import React, { useMemo, useState } from 'react';
import { Icon } from '../ui/primitives';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import AwardViewerDialog from './AwardViewerDialog';
import { groupPilotAwardsForDisplay, type PilotAward, type PilotAwardDisplayGroup } from '../../utils/awardService';

interface DossierAwardsCardProps {
  awards: PilotAward[]; // already scope-filtered, most recent first
  loading: boolean;
  canManage: boolean;   // manage_awards or issue_awards → show the manage button
  onOpenManager: () => void;
}

const DossierAwardsCard: React.FC<DossierAwardsCardProps> = ({
  awards,
  loading,
  canManage,
  onOpenManager
}) => {
  // Viewer tracks the tile index so previous/next can step through the rail
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  // Repeat-mode awards (e.g. deployment ribbons) collapse to one tile whose
  // image variant carries the bronze/silver devices for the issuance count
  const displayGroups = useMemo(() => groupPilotAwardsForDisplay(awards), [awards]);

  const viewingGroup: PilotAwardDisplayGroup | null =
    viewingIndex !== null ? displayGroups[viewingIndex] || null : null;

  return (
    <>
    <div style={{ ...dossierStyles.card, flexShrink: 0 }}>
      <div style={{ ...dossierStyles.cardHeader, position: 'relative' }}>
        <span style={dossierStyles.cardHeaderText}>Awards</span>
        {canManage && (
          <button
            onClick={onOpenManager}
            title="Manage and issue awards"
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--rr-panel)',
              color: 'var(--rr-text2)',
              border: '1px solid var(--rr-border2)',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--rr-panel2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--rr-panel)'; }}
          >
            <Icon name="settings" size={14} />
          </button>
        )}
      </div>
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible' }}>
        {loading ? (
          <div style={{ color: 'var(--rr-text2)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Loading awards...
          </div>
        ) : awards.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '16px 0',
            color: 'var(--rr-text3)'
          }}>
            <Icon name="award" size={40} style={{ color: 'var(--rr-text3)' }} />
            <div style={{ fontSize: '14px', color: 'var(--rr-text2)' }}>No awards in the selected scope</div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            paddingBottom: '8px'
          }}>
            {displayGroups.map((group, groupIndex) => {
              const pilotAward = group.pilotAward;
              const award = pilotAward.award;
              // Tile image: the award's device variant (or plain image) wins;
              // otherwise fall back to the issuance certificate (its
              // generated preview for PDFs)
              const certificateIsImage = pilotAward.certificate_url &&
                !pilotAward.certificate_url.split('?')[0].toLowerCase().endsWith('.pdf');
              const certificateDisplayUrl = pilotAward.certificate_thumbnail_url
                || (certificateIsImage ? pilotAward.certificate_url : null);
              const awardImage = group.imageUrl; // variant, own image or category default
              const imageUrl = awardImage || certificateDisplayUrl;
              // Certificate inset shown when the tile displays the award image
              // and this issuance also has its own certificate
              const insetUrl = awardImage && certificateDisplayUrl ? certificateDisplayUrl : null;
              return (
                <div
                  key={pilotAward.id}
                  title={[award?.name, group.count > 1 ? `${group.count} awards` : null, pilotAward.citation].filter(Boolean).join(' — ')}
                  onClick={() => setViewingIndex(groupIndex)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '112px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  {imageUrl ? (
                    <div style={{
                      width: '80px',
                      height: '80px',
                      backgroundImage: `url(${imageUrl})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      position: 'relative'
                    }}>
                      {insetUrl && (
                        <img
                          src={insetUrl}
                          alt="Certificate"
                          style={{
                            position: 'absolute',
                            right: '-6px',
                            bottom: '-4px',
                            maxWidth: '36px',
                            maxHeight: '28px',
                            objectFit: 'contain',
                            backgroundColor: 'var(--rr-panel)',
                            border: '1.5px solid var(--rr-panel)',
                            borderRadius: '3px',
                            boxShadow: 'var(--rr-shadow)'
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--rr-panel2)',
                      border: '1px solid var(--rr-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon name="award" size={36} style={{ color: 'var(--rr-text3)' }} />
                    </div>
                  )}
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--rr-text)',
                    marginTop: '8px',
                    lineHeight: '16px'
                  }}>
                    {award?.name || 'Unknown award'}
                    {group.count > 1 && (
                      <span style={{ color: 'var(--rr-text2)', fontWeight: 400 }}> ×{group.count}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--rr-text3)', marginTop: '2px' }}>
                    {formatDossierDate(pilotAward.awarded_date)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    <AwardViewerDialog
      pilotAward={viewingGroup?.pilotAward || null}
      repeatCount={viewingGroup?.count || 1}
      issuances={viewingGroup?.issuances}
      onPrevious={viewingIndex !== null && viewingIndex > 0
        ? () => setViewingIndex(viewingIndex - 1)
        : null}
      onNext={viewingIndex !== null && viewingIndex < displayGroups.length - 1
        ? () => setViewingIndex(viewingIndex + 1)
        : null}
      onClose={() => setViewingIndex(null)}
    />
    </>
  );
};

export default DossierAwardsCard;
