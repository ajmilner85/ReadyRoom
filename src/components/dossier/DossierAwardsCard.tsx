import React, { useState } from 'react';
import { Medal, Settings } from 'lucide-react';
import { dossierStyles, formatDossierDate } from './dossierStyles';
import AwardViewerDialog from './AwardViewerDialog';
import type { PilotAward } from '../../utils/awardService';

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
  const [viewingAward, setViewingAward] = useState<PilotAward | null>(null);

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
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
          >
            <Settings size={14} />
          </button>
        )}
      </div>
      <div style={{ ...dossierStyles.cardContent, overflowY: 'visible' }}>
        {loading ? (
          <div style={{ color: '#64748B', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Loading awards...
          </div>
        ) : awards.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '16px 0',
            color: '#94A3B8'
          }}>
            <Medal size={40} style={{ color: '#D1D5DB' }} />
            <div style={{ fontSize: '14px', color: '#64748B' }}>No awards in the selected scope</div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            paddingBottom: '8px'
          }}>
            {awards.map(pilotAward => {
              const award = pilotAward.award;
              // Tile image: the award's own image wins; otherwise fall back to
              // the issuance certificate (its generated preview for PDFs)
              const certificateIsImage = pilotAward.certificate_url &&
                !pilotAward.certificate_url.split('?')[0].toLowerCase().endsWith('.pdf');
              const certificateDisplayUrl = pilotAward.certificate_thumbnail_url
                || (certificateIsImage ? pilotAward.certificate_url : null);
              const imageUrl = award?.image_url || certificateDisplayUrl;
              // Certificate inset shown when the tile displays the award image
              // and this issuance also has its own certificate
              const insetUrl = award?.image_url && certificateDisplayUrl ? certificateDisplayUrl : null;
              return (
                <div
                  key={pilotAward.id}
                  title={[award?.name, pilotAward.citation].filter(Boolean).join(' — ')}
                  onClick={() => setViewingAward(pilotAward)}
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
                            backgroundColor: '#FFFFFF',
                            border: '1.5px solid #FFFFFF',
                            borderRadius: '3px',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)'
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Medal size={36} style={{ color: '#CBD5E1' }} />
                    </div>
                  )}
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#0F172A',
                    marginTop: '8px',
                    lineHeight: '16px'
                  }}>
                    {award?.name || 'Unknown award'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    {formatDossierDate(pilotAward.awarded_date)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    <AwardViewerDialog pilotAward={viewingAward} onClose={() => setViewingAward(null)} />
    </>
  );
};

export default DossierAwardsCard;
