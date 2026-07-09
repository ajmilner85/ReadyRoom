import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Medal } from 'lucide-react';
import { formatDossierDate } from './dossierStyles';
import type { PilotAward } from '../../utils/awardService';

interface AwardViewerDialogProps {
  pilotAward: PilotAward | null;
  onClose: () => void;
}

const iconButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#FFFFFF',
  color: '#64748B',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  cursor: 'pointer'
};

/**
 * Full-size viewer for an issued award. Shows the certificate when one was
 * attached to the issuance, otherwise the award insignia, with the award
 * details in a side panel.
 */
const AwardViewerDialog: React.FC<AwardViewerDialogProps> = ({ pilotAward, onClose }) => {
  // When both an award image and a certificate exist, the certificate shows
  // as an inset over the award image; clicking the inset swaps them.
  const [certificateAsMain, setCertificateAsMain] = useState(false);

  useEffect(() => {
    setCertificateAsMain(false);
  }, [pilotAward?.id]);

  if (!pilotAward) return null;

  const award = pilotAward.award;
  const awardImageUrl = award?.image_url || null;
  const certificateUrl = pilotAward.certificate_url || null;
  const certificateIsPdf = !!certificateUrl && certificateUrl.split('?')[0].toLowerCase().endsWith('.pdf');
  // Certificates render via their generated first-page preview when they're
  // PDFs, so the popup can size to content
  const certificateDisplayUrl = certificateIsPdf
    ? pilotAward.certificate_thumbnail_url
    : certificateUrl;

  const hasBoth = !!awardImageUrl && !!(certificateDisplayUrl || certificateUrl);
  const showingCertificate = hasBoth ? certificateAsMain : !!certificateUrl;

  // Main render target + the inset (only when both exist)
  const renderImageUrl = showingCertificate
    ? certificateDisplayUrl
    : (awardImageUrl || certificateDisplayUrl);
  const insetImageUrl = hasBoth && certificateDisplayUrl
    ? (certificateAsMain ? awardImageUrl : certificateDisplayUrl)
    : null;

  // What "open in new tab" targets: the original of whatever is shown as main
  const originalUrl = showingCertificate ? certificateUrl : (awardImageUrl || certificateUrl);
  const isPdf = showingCertificate && certificateIsPdf;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: '32px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          maxWidth: 'calc(100vw - 64px)',
          maxHeight: 'calc(100vh - 64px)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image / certificate area — the dialog wraps this, so it sizes to
            the content's natural dimensions up to the viewport bounds */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          padding: '16px',
          position: 'relative'
        }}>
          {renderImageUrl ? (
            <img
              src={renderImageUrl}
              alt={award?.name || 'Award'}
              style={{
                display: 'block',
                maxWidth: 'calc(100vw - 444px)',
                maxHeight: 'calc(100vh - 96px)',
                objectFit: 'contain',
                borderRadius: '4px'
              }}
            />
          ) : isPdf && originalUrl ? (
            // Legacy PDF issuance without a generated preview
            <iframe
              src={originalUrl}
              title={award?.name || 'Award certificate'}
              style={{
                width: 'min(840px, calc(100vw - 444px))',
                height: 'min(640px, calc(100vh - 96px))',
                border: 'none',
                borderRadius: '8px'
              }}
            />
          ) : (
            <Medal size={96} style={{ color: '#D1D5DB', margin: '32px' }} />
          )}

          {/* Certificate/image inset — click to swap with the main view */}
          {insetImageUrl && (
            <img
              src={insetImageUrl}
              alt={certificateAsMain ? 'Award image' : 'Certificate'}
              title={certificateAsMain ? 'Show award image' : 'View certificate'}
              onClick={() => setCertificateAsMain(!certificateAsMain)}
              style={{
                position: 'absolute',
                right: '28px',
                bottom: '28px',
                maxWidth: '160px',
                maxHeight: '120px',
                objectFit: 'contain',
                backgroundColor: '#FFFFFF',
                border: '2px solid #FFFFFF',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                cursor: 'pointer'
              }}
            />
          )}
        </div>

        {/* Details panel */}
        <div style={{
          width: '300px',
          flexShrink: 0,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflowY: 'auto',
          borderLeft: '1px solid #E2E8F0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {originalUrl && (
              <button
                onClick={() => window.open(originalUrl, '_blank', 'noopener')}
                title="Open in new tab"
                style={iconButtonStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close"
              style={iconButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', lineHeight: '24px' }}>
              {award?.name || 'Unknown award'}
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
              {award?.category?.name || ''}
              {award && !award.is_repeatable ? ' · Unique' : ''}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Awarded
            </div>
            <div style={{ fontSize: '14px', color: '#0F172A' }}>{formatDossierDate(pilotAward.awarded_date)}</div>
          </div>

          {pilotAward.citation && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Citation
              </div>
              <div style={{ fontSize: '14px', color: '#0F172A', lineHeight: '20px' }}>{pilotAward.citation}</div>
            </div>
          )}

          {award?.description && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Description
              </div>
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: '18px' }}>{award.description}</div>
            </div>
          )}

          {award?.criteria && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Criteria
              </div>
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: '18px' }}>{award.criteria}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AwardViewerDialog;
